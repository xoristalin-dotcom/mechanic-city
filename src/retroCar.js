import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

/**
 * Retro Garage Rally-style car with full articulation
 * - All doors, hood, trunk can open
 * - Wheels can be removed/replaced
 * - Engine, transmission, suspension can be dismantled
 * - Each part has condition state and visual wear
 */

export class RetroCarBuilder {
  constructor(config = {}) {
    this.config = {
      color: 0x244b77,
      type: 'sedan',        // sedan, truck, sport, van
      year: 1975,
      damageLevel: 0,       // 0-100
      ...config
    };

    this.carGroup = new THREE.Group();
    this.carGroup.name = "DodgeChallengerMechanicCity_R2_1_Assembly";

    // Track all removable parts
    this.parts = {};
    this.pivots = {};      // For hinges (doors, hood, trunk)
    this.articulation = {
      doors: {},
      hood: null,
      trunk: null,
      wheels: {},
      engine: null,
      transmission: null,
      suspension: {},
      exhaust: null
    };

    // The player vehicle is no longer built procedurally.
    // This class is now only the controller/container for the authoritative
    // Higgsfield R18 asset at /models/preview.glb.
    // Keeping the old build methods below is harmless for legacy code, but
    // they are never called for the player.
    this.carGroup.visible = false;
    this.carGroup.userData.modelLoading = true;
    this.carGroup.userData.modelSource = "/models/preview.glb";
    this.carGroup.userData.originalGLB = true;
    // Do not parse a multi-megabyte GLB during the same task that creates the
    // player root. The city must become interactive first; the model is an
    // enhancement loaded on the next browser task.
    const startGLBLoad = () => this.loadMechanicCityModel().catch((err) => {
      this.carGroup.visible = false;
      this.carGroup.userData.modelLoading = false;
      this.carGroup.userData.modelLoadError = String(err?.message || err);
      console.error("Mechanic City R18 GLB load failed", err);
    });
    // Do not start the huge R18 parse while the first city frame is being
    // constructed. On iPhone/Safari, requestIdleCallback can fire almost
    // immediately and the synchronous GLTF parse can monopolize the main
    // thread long enough to make the whole city look frozen.
    // Load the authoritative R18 almost immediately after the first city task.
    // Do not show an unrelated procedural/traffic car as the player while it loads.
    startGLBLoad();
  }

  async loadMechanicCityModel() {
    const paths = ["/models/dodge_challenger_mechanic_city_r2_1.glb"];

    try {
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      if (MeshoptDecoder.ready) await MeshoptDecoder.ready;

      let buffer = null;
      let sourcePath = null;
      for (const path of paths) {
        try {
          const response = await fetch(path, {cache:"no-store"});
          if (!response.ok) continue;
          buffer = await response.arrayBuffer();
          sourcePath = path;
          break;
        } catch {}
      }
      if (!buffer) {
        this.carGroup.userData.modelLoading = false;
        this.carGroup.userData.modelLoadError = "Unable to fetch /models/preview.glb";
        console.error("Mechanic City R18 GLB not found: /models/preview.glb");
        return;
      }

      const model = await new Promise((resolve,reject)=>{
        loader.parse(buffer, sourcePath, g=>resolve(g.scene), err=>{ window.MechanicCityGLBError=String(err?.message||err); reject(err); });
      });

      // Capture raw GLB structure before normalization so we can distinguish a bad asset from a scene/camera problem.      const glbDiagnostics = {        sourcePath,        sceneName: model?.name || "",        childCount: model?.children?.length || 0,        meshCount: 0,        visibleMeshes: 0,        bounds: null      };      const preBox = new THREE.Box3().setFromObject(model, true);      const preSize = preBox.getSize(new THREE.Vector3());      const preCenter = preBox.getCenter(new THREE.Vector3());      model.traverse(node => {        if (!node.isMesh) return;        glbDiagnostics.meshCount++;        if (node.visible) glbDiagnostics.visibleMeshes++;      });      glbDiagnostics.bounds = {        min: {x: preBox.min.x, y: preBox.min.y, z: preBox.min.z},        max: {x: preBox.max.x, y: preBox.max.y, z: preBox.max.z},        size: {x: preSize.x, y: preSize.y, z: preSize.z},        center: {x: preCenter.x, y: preCenter.y, z: preCenter.z}      };      window.MechanicCityGLBDiagnostics = glbDiagnostics;

      // Diagnostic isolation: ?glbdebug=1 disables lighting-dependent materials.
      // This lets us distinguish geometry/camera problems from GLB material/texture problems.
      if(window.location.search.includes("glbdebug=1")){
        let basicMaterialMeshes = 0;
        model.traverse(node => {
          if(!node.isMesh) return;
          basicMaterialMeshes++;
          const toBasic = material => {
            if(!material) return material;
            return new THREE.MeshBasicMaterial({
              color: material.color ? material.color.clone() : new THREE.Color(0xaaaaaa),
              map: material.map || null,
              transparent: !!material.transparent,
              opacity: Number.isFinite(material.opacity) ? material.opacity : 1,
              alphaTest: Number.isFinite(material.alphaTest) ? material.alphaTest : 0,
              side: material.side ?? THREE.FrontSide
            });
          };
          node.material = Array.isArray(node.material)
            ? node.material.map(toBasic)
            : toBasic(node.material);
        });
        glbDiagnostics.basicMaterialMeshes = basicMaterialMeshes;
        window.MechanicCityGLBDiagnostics = glbDiagnostics;
      }      model.name = "Dodge_Challenger_MechanicCity_R2_1_Authoritative";
      model.updateMatrixWorld(true);

      // R18 uses the complete scene bounds. Keep the older R2.1 body-only
      // normalization only for the legacy fallback path below.
      const isR18Source = sourcePath === "/models/preview.glb";
      const bodyMesh = !isR18Source ? model.getObjectByName("geometry_0") : null;

      // Do not let an accidental giant floor/sky/backdrop mesh inside the GLB
      // define the car's scale or fill the whole game view. R18 contains many
      // authored service meshes, so use their individual world bounds and
      // reject only obvious environment-sized outliers.
      let bodyBox;
      if (bodyMesh) {
        bodyBox = new THREE.Box3().setFromObject(bodyMesh, true);
      } else {
        const candidates = [];
        model.traverse(o => {
          if (!o.isMesh || !o.geometry) return;
          const b = new THREE.Box3().setFromObject(o, true);
          if (b.isEmpty()) return;
          const size = b.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);
          candidates.push({o, b, maxDim});
        });
        const dims = candidates.map(x => x.maxDim).sort((a,b)=>a-b);
        const medianDim = dims.length ? dims[Math.floor(dims.length / 2)] : 0;
        const allowedDim = Math.max(12, medianDim * 12);
        const filtered = candidates.filter(({o,maxDim}) => {
          const n = String(o.name || "").toLowerCase();
          const namedEnvironment = /^(ground|floor|plane|sky|skydome|environment|world|backdrop|background)/.test(n);
          return !namedEnvironment && maxDim <= allowedDim;
        });
        bodyBox = new THREE.Box3();
        for (const item of filtered.length ? filtered : candidates) bodyBox.union(item.b);
        window.MechanicCityModelDiagnostics = {
          ...(window.MechanicCityModelDiagnostics || {}),
          meshCandidates: candidates.length,
          meshUsedForBounds: filtered.length || candidates.length,
          medianMeshSize: medianDim,
          maxAllowedMeshSize: allowedDim
        };
      }
      if (bodyBox.isEmpty()) {
        this.carGroup.userData.modelLoading = false;
        this.carGroup.userData.modelLoadError = "Loaded GLB has empty bounds";
        console.error("Mechanic City R18 GLB has empty bounds");
        return;
      }

      const bodySize = bodyBox.getSize(new THREE.Vector3());
      const bodyCenter = bodyBox.getCenter(new THREE.Vector3());
      const bodyLength = isR18Source
        ? Math.max(bodySize.x, bodySize.y, bodySize.z)
        : bodySize.z;
      if (!Number.isFinite(bodyLength) || bodyLength <= 0) {
        this.carGroup.userData.modelLoading = false;
        this.carGroup.userData.modelLoadError = "Loaded GLB has invalid bounds";
        console.error("Mechanic City R18 GLB has invalid bounds");
        return;
      }

      const targetLength = 4.95;
      const scale = targetLength / bodyLength;
      model.scale.setScalar(scale);
      // The R18 preview asset is authored with X as the vehicle length
      // axis, so it needs X -> Z rotation. The authoritative R2.1 Challenger
      // asset is already authored in the game's Z-forward vehicle space and
      // MUST NOT be rotated 90 degrees. Rotating R2.1 here makes the upper
      // body/cabin sit across the chassis ("car crosswise").
      const vehicleRotationY = isR18Source ? -Math.PI / 2 : 0;
      model.rotation.set(0, vehicleRotationY, 0);
      // Center the source bounds after applying only the rotation required
      // by the source asset.
      const normalizedCenter = bodyCenter.clone()
        .applyEuler(model.rotation)
        .multiplyScalar(scale);
      model.position.set(
        -normalizedCenter.x,
        -bodyBox.min.y * scale,
        -normalizedCenter.z
      );
      model.updateMatrixWorld(true);

      // GLB sanity correction: if normalization produced a non-finite or
      // implausibly large local transform, keep the asset at a safe local pose.
      const p = model.position;
      const s = model.scale;
      const finiteTransform =
        [p.x,p.y,p.z,s.x,s.y,s.z].every(Number.isFinite);
      const saneTransform =
        finiteTransform &&
        Math.abs(p.x) < 100 && Math.abs(p.y) < 100 && Math.abs(p.z) < 100 &&
        s.x > 0 && s.x < 100;
      if(!saneTransform){
        console.warn("Mechanic City R18: unsafe normalized transform; using safe local pose", {
          position: p.toArray(), scale: s.toArray()
        });
        model.position.set(0, 0, 0);
        model.scale.setScalar(Math.min(Math.max(scale, 0.01), 10));
        model.rotation.set(0, vehicleRotationY, 0);
        model.updateMatrixWorld(true);
        window.MechanicCityGLBDiagnostics = {
          ...(window.MechanicCityGLBDiagnostics || {}),
          transformWarning: "unsafe-normalized-transform"
        };
      }
      // Keep the persistent player root as the only world-position owner.
      // The GLB stays in local space; city/camera coordinates remain untouched.
      this.carGroup.position.set(0, 0, 0);
      this.carGroup.updateMatrixWorld(true);

      // Runtime diagnostics for the authoritative GLB. Three.js requires
      // up-to-date world matrices before computing a reliable world AABB.
      const runtimeBox = new THREE.Box3().setFromObject(model, true);
      const runtimeSize = runtimeBox.getSize(new THREE.Vector3());
      const runtimeCenter = runtimeBox.getCenter(new THREE.Vector3());
      let runtimeMeshes = 0;
      model.traverse(node => { if (node.isMesh) runtimeMeshes++; });
      this.carGroup.userData.modelDiagnostics = {
        source: "/models/preview.glb",
        meshes: runtimeMeshes,
        size: { x: runtimeSize.x, y: runtimeSize.y, z: runtimeSize.z },
        center: { x: runtimeCenter.x, y: runtimeCenter.y, z: runtimeCenter.z },
        scale,
        visible: model.visible,
        loading: false,
        position: { x: model.position.x, y: model.position.y, z: model.position.z },
        rotationY: model.rotation.y
      };
      window.MechanicCityModelDiagnostics = this.carGroup.userData.modelDiagnostics;

      // Revision 18 is now the authoritative player vehicle. Keep the complete
      // GLB scene intact: body, glass, cabin, doors, hood, trunk and workshop
      // geometry all come from the original asset. Three.js keeps these nodes
      // addressable through the scene graph, so the workshop can operate on
      // individual parts instead of cutting the car into geometry_* fragments.
      if (sourcePath === "/models/preview.glb") {
        const categoryFor = (name) => {
          const n = String(name || "").toLowerCase();
          if (/gearbox|transmission|clutch|differential/.test(n)) return "transmission";
          if (/engine|injector|spark|intake|alternator|starter|radiator|fuel|oil|coolant|battery|fuse|pump/.test(n)) return "engine";
          if (/brake|rotor|caliper|pad/.test(n)) return "brakes";
          if (/wheel|tire|rim|hub|lug/.test(n)) return "wheels";
          if (/suspension|strut|spring|arm|knuckle|tie|balljoint/.test(n)) return "suspension";
          if (/door|hood|trunk|bumper|fender|rocker|quarter|spoiler|sill|panel/.test(n)) return "body";
          if (/seat|dash|console|steering|pedal|shifter|interior|cockpit|carpet|trim/.test(n)) return "interior";
          if (/exhaust|muffler|resonator|catalyst|pipe|tip|header/.test(n)) return "exhaust";
          if (/head|tail|lamp|drl|marker|light|grille/.test(n)) return "lights";
          if (/glass|window|mirror/.test(n)) return "glass";
          return "other";
        };
        const subsystemFor = (name, category) => {
          const n = String(name || "").toLowerCase();
          if (/radiator|coolant|water/.test(n)) return "cooling";
          if (/battery|alternator|starter|fuse/.test(n)) return "electrical";
          if (/gearbox|transmission|clutch|differential/.test(n)) return "transmission";
          return category;
        };
        const serviceParts = {};
        const counts = {};
        const named = [];
        model.traverse(o => {
          if (!o.isMesh) return;
          o.castShadow = true;
          o.receiveShadow = true;
          // The authored R18 GLB can contain bounds that are not reliable
          // after normalization/scene-node articulation. Keep its meshes
          // in the render list so the authoritative body cannot disappear
          // because of a stale local bounding sphere.
          o.frustumCulled = false;
          if (o.material) {
            const materials = Array.isArray(o.material) ? o.material : [o.material];
            for (const material of materials) {
              if (material && "side" in material) material.side = THREE.FrontSide;
              if (material) material.needsUpdate = true;
            }
          }
          const base = String(o.name || "mesh").replace(/[^a-zA-Z0-9_-]/g, "_") || "mesh";
          const index = counts[base] || 0;
          counts[base] = index + 1;
          const key = index ? base + "_" + index : base;
          const category = categoryFor(o.name);
          const lower = String(o.name || "").toLowerCase();
          const structural =
            /^(chassis|floor_pan|underbody|body_shell|body|root|scene)$/i.test(o.name) ||
            category === "glass" || category === "interior";
          const removable = !structural && category !== "other";
          const part = {
            key,
            name: o.name || key,
            category,
            subsystem: subsystemFor(o.name, category),
            condition: 100,
            installed: true,
            removable,
            tunable: ["engine","transmission","brakes","wheels","suspension","exhaust","body"].includes(category),
            baseCost: 50,
            mesh: o,
            servicePartVisual: true
          };
          o.userData.servicePart = part;
          serviceParts[key] = part;
          if (/door|hood|trunk|bonnet|boot/i.test(o.name || "")) named.push(o);
        });

        // Install the authoritative GLB before creating articulation pivots.
        // Pivots live inside the model so they cannot be removed by a later carGroup cleanup.
        this.carGroup.remove(...[...this.carGroup.children]);
        this.carGroup.add(model);
        const articulationRoot = new THREE.Object3D();
        articulationRoot.name = "R18_ARTICULATION";
        model.add(articulationRoot);
        model.updateMatrixWorld(true);

        // Build hinges from the actual R18 nodes. If the asset contains
        // authored door/hood/trunk nodes, we rotate those nodes directly;
        // nothing is copied out of geometry_0.
        const findTopLevel = (regex) => {
          const result = [];
          model.traverse(o => {
            if (!o.name || !regex.test(o.name)) return;
            let p = o.parent;
            while (p && p !== model) {
              if (regex.test(p.name || "")) return;
              p = p.parent;
            }
            if (o.isMesh || o.children.length) result.push(o);
          });
          return result;
        };
        const worldBox = (obj) => {
          obj.updateWorldMatrix(true, true);
          return new THREE.Box3().setFromObject(obj, true);
        };
        const makeDoor = (obj, side, front) => {
          const box = worldBox(obj);
          if (box.isEmpty()) return null;
          const center = box.getCenter(new THREE.Vector3());
          const hinge = new THREE.Vector3(
            side < 0 ? box.min.x : box.max.x,
            center.y,
            front ? box.max.z : box.min.z
          );
          const pivot = new THREE.Object3D();
          pivot.name = "R18_Hinge_" + obj.name;
          articulationRoot.add(pivot);
          pivot.position.copy(articulationRoot.worldToLocal(hinge));
          pivot.attach(obj);
          const openSign = side < 0 ? 1 : -1;
          return {pivot, open: 0, openSign, maxAngle: 1.05, axis: "y", source: obj.name};
        };
        const makeLid = (obj, front) => {
          const box = worldBox(obj);
          if (box.isEmpty()) return null;
          const center = box.getCenter(new THREE.Vector3());
          const hinge = new THREE.Vector3(
            center.x,
            center.y,
            front ? box.min.z : box.max.z
          );
          const pivot = new THREE.Object3D();
          pivot.name = "R18_Hinge_" + obj.name;
          articulationRoot.add(pivot);
          pivot.position.copy(articulationRoot.worldToLocal(hinge));
          pivot.attach(obj);
          return {pivot, open: 0, openSign: front ? -1 : 1, maxAngle: 0.95, axis: "x", source: obj.name};
        };

        // Articulate only the top-level authored door assemblies. A glass/window
        // child must stay inside its door, otherwise it becomes a floating
        // square when the door opens.
        const doorCandidates = [];
        model.traverse(o => {
          if (!o.name || !/door/i.test(o.name)) return;
          let p = o.parent;
          let nested = false;
          while (p && p !== model) {
            if (/door/i.test(p.name || "")) { nested = true; break; }
            p = p.parent;
          }
          if (!nested && (o.children.length || o.isMesh)) doorCandidates.push(o);
        });
        const doors = doorCandidates.slice(0, 4).map(o => {
          const n = String(o.name).toLowerCase();
          const side = /left|(^|[_-])(l|fl|rl)([_-]|$)/.test(n) ? -1 : 1;
          const front = !/rear|rl|rr|back/.test(n);

          // Keep the complete visible door assembly together. Some R18 exports
          // put the window/glass as a sibling of the door mesh instead of a
          // child. If that sibling stays under the car root it looks like a
          // square rear window left behind when the door opens.
          const doorBox = worldBox(o);
          const doorSize = doorBox.getSize(new THREE.Vector3());
          const expanded = doorBox.clone();
          expanded.min.addScaledVector(doorSize, -0.08);
          expanded.max.addScaledVector(doorSize, 0.08);
          const companions = [];
          model.traverse(candidate => {
            if (candidate === o || !candidate.isMesh || !candidate.name) return;
            const cn = String(candidate.name).toLowerCase();
            if (!/glass|window|windowpane|sideglass|doorwindow/.test(cn)) return;
            if (/windshield|windscreen|rearwindow|backglass|back_window/.test(cn)) return;
            const cb = worldBox(candidate);
            const cc = cb.getCenter(new THREE.Vector3());
            const cs = cb.getSize(new THREE.Vector3());
            // A door window must overlap the door's lateral/vertical envelope
            // and have its center close to the door center. This deliberately
            // avoids grabbing the fixed windshield or rear cabin glass.
            const centerClose =
              Math.abs(cc.y - doorBox.getCenter(new THREE.Vector3()).y) <= Math.max(doorSize.y * 0.72, 0.45) &&
              Math.abs(cc.x - doorBox.getCenter(new THREE.Vector3()).x) <= Math.max(doorSize.x * 0.72, 0.8) &&
              Math.abs(cc.z - doorBox.getCenter(new THREE.Vector3()).z) <= Math.max(doorSize.z * 0.72, 0.8);
            if (centerClose && cb.intersectsBox(expanded)) companions.push(candidate);
          });

          const articulation = makeDoor(o, side, front);
          if (!articulation) return null;
          articulation.source = o.name;
          articulation.companions = companions;
          for (const companion of companions) {
            // Attach to the same hinge pivot while preserving its current world
            // transform. Three.js attach() is intended for exactly this use.
            articulation.pivot.attach(companion);
          }
          return articulation;
        }).filter(Boolean);
        const hoodNode = findTopLevel(/hood|bonnet/i)[0] || null;
        const trunkNode = findTopLevel(/trunk|boot/i)[0] || null;
        const hood = hoodNode ? makeLid(hoodNode, true) : null;
        const trunk = trunkNode ? makeLid(trunkNode, false) : null;

        // Use authored wheel pivots if present; do not add replacement wheels
        // on top of the original R18 wheels.
        const wheels = [];
        model.traverse(o => {
          if (/^wheelpivot_(fl|fr|rl|rr)$/i.test(o.name || "")) wheels.push(o);
        });

        this.carGroup.name = "MechanicCity_R18_Authoritative";
        this.carGroup.userData.serviceParts = serviceParts;
        this.carGroup.userData.servicePartCount = Object.keys(serviceParts).length;
        this.carGroup.userData.modelRevision = "Higgsfield-R18";
        this.carGroup.userData.modelSource = "/models/preview.glb";
        this.carGroup.userData.originalGLB = true;
        this.carGroup.userData.wheels = wheels;
        this.carGroup.userData.articulation = {doors, hood, trunk, steering: null};
        this.carGroup.userData.vehicleSpec = {
          lengthMeters: 4.881,
          widthMeters: 1.921,
          heightMeters: 1.326,
          revision: "Higgsfield-R18",
          editable: true,
          swapMode: "scene-node"
        };
        this.carGroup.userData.swapPart = (key, replacement) => {
          const part = this.carGroup.userData.serviceParts?.[key];
          if (!part || !replacement) return false;
          const old = part.mesh;
          const parent = old?.parent || model;
          if (old?.parent) old.parent.remove(old);
          const node = replacement.clone(true);
          node.name = old?.name || key;
          parent.add(node);
          part.mesh = node;
          part.installed = true;
          node.userData.servicePart = part;
          return true;
        };

        // Preserve the authored R18 car, but never render a giant environment mesh
        // embedded in the GLB (the source contains a Ground node). Those meshes can
        // cover the entire city and make the player see only the GLB's background.
        model.traverse(o => {
          if (!o.isMesh) return;
          const n = String(o.name || "").toLowerCase();
          const environmentMesh =
            /(^|[._ -])(ground|floor|plane|sky|skydome|environment|world|backdrop|background)([._ -]|$)/.test(n) ||
            n === "ground";
          if (environmentMesh) {
            o.visible = false;
            o.castShadow = false;
            o.receiveShadow = false;
            return;
          }
          o.visible = true;
          o.castShadow = true;
          o.receiveShadow = true;
          // Restore normal frustum culling for mobile performance. The previous
          // global false setting forced all 1,370 GLB meshes through every frame.
          o.frustumCulled = true;
          if (o.material) {
            const materials = Array.isArray(o.material) ? o.material : [o.material];
            for (const material of materials) {
              if (material && "side" in material) material.side = THREE.FrontSide;
              if (material) material.needsUpdate = true;
            }
          }
        });
        // The authoritative model is already installed in carGroup.
        // Keep the articulation root and pivots in the rendered scene graph.
        this.carGroup.visible = true;
        this.carGroup.userData.modelLoading = false;
        this.carGroup.userData.modelRevision = "Higgsfield-R18";
        this.carGroup.userData.modelSource = "/models/preview.glb";
        this.carGroup.userData.originalGLB = true;
        this.carGroup.userData.wheels = wheels;
        this.carGroup.userData.serviceParts = serviceParts;
        this.carGroup.userData.servicePartCount = Object.keys(serviceParts).length;
        this.carGroup.userData.articulation = this.carGroup.userData.articulation;
        this.carGroup.userData.vehicleSpec = this.carGroup.userData.vehicleSpec;
        // Capture the authoritative assembled R2.1 pose after all real GLB nodes and hinges are installed.\n        const restPose = {};\n        model.traverse(o => { restPose[o.uuid] = { position:o.position.clone(), quaternion:o.quaternion.clone(), scale:o.scale.clone(), visible:o.visible }; });\n        this.carGroup.userData.authoritativeRestPose = restPose;\n        this.carGroup.userData.authoritativeRestPoseVersion = 1;\n        this.carGroup.userData.restoreAuthoritativeAssembly = () => {\n          const pose = this.carGroup.userData.authoritativeRestPose;\n          if (!pose) return;\n          model.traverse(o => { const r=pose[o.uuid]; if(!r)return; o.position.copy(r.position); o.quaternion.copy(r.quaternion); o.scale.copy(r.scale); o.visible=r.visible; });\n          model.updateMatrixWorld(true);\n          const art=this.carGroup.userData.articulation;\n          if(art?.doors) for(const d of art.doors) if(d) d.open=0;\n          if(art?.hood) art.hood.open=0;\n          if(art?.trunk) art.trunk.open=0;\n          this.carGroup.userData.workshopDisassembled=false;\n        };\n        this.carGroup.userData.r18NodeAudit = named.map(o => o.name);
        return;
      }

      // The seven meshes geometry_0..geometry_6 are the actual mobile visual
      // car. The extra service geometry is useful in the workshop but was
      // authored at a different local scale, so keep it hidden in the driving
      // view instead of letting it blow up the silhouette.
      // The source GLB has no TEXCOORD_0 on its seven visual meshes, so
      // embedded atlas textures cannot be sampled reliably in mobile WebGL.
      // Treat geometry_0..2 as painted body surfaces instead of giving them
      // unrelated trim colors; this prevents the body from turning cream/white.
      const visualStyles = {
        geometry_0: { color: 0xe52a36, metalness: 0.34, roughness: 0.28 },
        geometry_1: { color: 0xc91d2a, metalness: 0.32, roughness: 0.31 },
        geometry_2: { color: 0xa91420, metalness: 0.30, roughness: 0.34 },
        geometry_3: { color: 0x98141f, metalness: 0.30, roughness: 0.36 },
        geometry_4: { color: 0xb71925, metalness: 0.30, roughness: 0.38 },
        geometry_5: { color: 0x090b0d, metalness: 0.18, roughness: 0.68 },
        geometry_6: { color: 0x17262d, metalness: 0.10, roughness: 0.20 }
      };

      model.traverse(o=>{
        if (!o.isMesh) return;

        // R2.1 must stand on its wheels. Hide any authoring/service stand
        // accidentally exported with the vehicle asset; it must never appear
        // as a platform underneath the player car.
        const nodeName = String(o.name || "").toLowerCase();
        if (/service[_ -]?platform|vehicle[_ -]?platform|car[_ -]?platform|platform|turntable|display[_ -]?stand|show[_ -]?stand|stand|base|support|pedestal/.test(nodeName)) {
          o.visible = false;
          o.userData.hiddenVehicleStand = true;
          return;
        }

        // The R2.1 asset may contain an unnamed stand made from several meshes.
        // Remove low, broad geometry by its FINAL normalized world bounds.
        // A real wheel/body panel cannot occupy the entire footprint while
        // ending below the wheel contact plane.
        if (o.geometry) {
          const bb = new THREE.Box3().setFromObject(o, true);
          const s = bb.getSize(new THREE.Vector3());
          const broadFootprint =
            s.x >= Math.max(2.0, bodySize.x * 0.48) &&
            s.z >= Math.max(2.0, bodySize.z * 0.48);
          const belowWheelPlane =
            bb.max.y <= Math.max(0.34, bodyBox.min.y + 0.34);
          const slab = s.y <= Math.max(0.22, Math.min(s.x, s.z) * 0.06);
          if (broadFootprint && belowWheelPlane && slab) {
            o.visible = false;
            o.userData.hiddenVehicleStand = true;
            o.userData.hiddenGenericServicePlatform = true;
            return;
          }
        }

        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = true;

        const style = visualStyles[o.name];
        if (style) {
          // The R2.1 atlas has no TEXCOORD_0 on these split meshes, so a
          // texture-only material renders white. Use lightweight PBR colors
          // that preserve the intended Challenger palette on WebGL/iPhone.
          o.material = new THREE.MeshStandardMaterial({
            color: style.color,
            metalness: style.metalness,
            roughness: style.roughness
          });
          o.visible = true;
        } else {
          o.visible = false;
        }
      });

      // Preserve the procedural root object so main.js physics, camera and HUD
      // references remain valid; only replace its visual children.
      const oldChildren = [...this.carGroup.children];
      for (const child of oldChildren) this.carGroup.remove(child);
      this.carGroup.add(model);

      // R2.1 body meshes contain the wheel silhouettes as part of combined
      // geometry, so they cannot physically rotate. Add lightweight runtime
      // wheel assemblies on top of those silhouettes. They are also used by
      // main.js physicsDrive() for steering + rolling animation.
      const runtimeWheels = [];
      const wheelRadius = 0.36;
      const wheelX = Math.max(0.86, bodySize.x * scale * 0.43);
      const wheelZ = Math.max(1.42, bodySize.z * scale * 0.307);
      const wheelY = wheelRadius + 0.012;
      const tireMat = new THREE.MeshStandardMaterial({color:0x080808,roughness:0.78,metalness:0.05});
      const rimMat = new THREE.MeshStandardMaterial({color:0xb8bcc1,roughness:0.32,metalness:0.82});

      for (const cfg of [
        ["FL",-wheelX,wheelZ,true],["FR",wheelX,wheelZ,true],
        ["RL",-wheelX,-wheelZ,false],["RR",wheelX,-wheelZ,false]
      ]) {
        const [name,x,z,front] = cfg;
        // Keep steering and tire spin on separate transforms. Steering is
        // around Y; rolling is around the wheel axle (X). This prevents the
        // wheel from wobbling/orbiting when the steering angle changes.
        const wheel = new THREE.Group();
        wheel.name = "RuntimeWheel_" + name;
        wheel.position.set(x,wheelY,z);
        wheel.userData.front = front;
        wheel.userData.corner = name;

        const spin = new THREE.Group();
        spin.name = "WheelSpin_" + name;
        wheel.add(spin);
        wheel.userData.spin = spin;

        const tire = new THREE.Mesh(
          new THREE.CylinderGeometry(wheelRadius,wheelRadius,0.24,16),
          tireMat
        );
        tire.rotation.z = Math.PI / 2;
        tire.castShadow = true;
        tire.receiveShadow = true;
        spin.add(tire);

        const rim = new THREE.Mesh(
          new THREE.CylinderGeometry(wheelRadius*0.56,wheelRadius*0.56,0.25,12),
          rimMat
        );
        rim.rotation.z = Math.PI / 2;
        rim.castShadow = true;
        spin.add(rim);

        this.carGroup.add(wheel);
        runtimeWheels.push(wheel);
      }
      this.carGroup.userData.wheels = runtimeWheels;

      // Challenger R3 visual detail kit: keep the imported body lightweight,
      // then add a few separate high-contrast parts that read well on iPhone.
      // These are intentionally simple primitives so they stay cheap in WebGL.
      const detailKit = new THREE.Group();
      detailKit.name = "Challenger_R3_DetailKit";
      const bodyW = bodySize.x * scale;
      // The imported Challenger body is authored facing +Z.
      // Keep all front/rear detail on that same axis.
      const frontZ = targetLength / 2;
      const rearZ = -targetLength / 2;
      const trim = new THREE.MeshStandardMaterial({color:0x111417,metalness:0.72,roughness:0.32});
      const chrome = new THREE.MeshStandardMaterial({color:0xc3c7c9,metalness:0.9,roughness:0.2});
      const lamp = new THREE.MeshStandardMaterial({color:0xf4fbff,emissive:0xbfeaff,emissiveIntensity:2.2,metalness:0.05,roughness:0.12});
      const lampInner = new THREE.MeshStandardMaterial({color:0x061016,metalness:0.65,roughness:0.18});
      const lampGlow = new THREE.MeshBasicMaterial({color:0xdff7ff});
      const tail = new THREE.MeshStandardMaterial({color:0x8f1018,emissive:0x300004,emissiveIntensity:0.55,roughness:0.25});
      const glass = new THREE.MeshStandardMaterial({color:0x15242b,metalness:0.08,roughness:0.18});

      // Red metallic delivery livery with two narrow black center stripes.
      // The existing glass material is deliberately left unchanged.
      const stripeMat = new THREE.MeshStandardMaterial({color:0x17191c,metalness:0.55,roughness:0.32});
      const stripeWidth = bodyW * 0.028;
      const stripeGap = bodyW * 0.045;
      const stripeX = stripeGap / 2 + stripeWidth / 2;

      for(const x of [-stripeX, stripeX]){
        // Keep the stripes close to the body so they read as paint, not floating parts.
        const hoodStripe=new THREE.Mesh(new THREE.BoxGeometry(stripeWidth,0.018,targetLength*0.42),stripeMat);
        hoodStripe.position.set(x,1.005,0.78); detailKit.add(hoodStripe);

        const roofStripe=new THREE.Mesh(new THREE.BoxGeometry(stripeWidth,0.018,targetLength*0.30),stripeMat);
        roofStripe.position.set(x,1.235,0); detailKit.add(roofStripe);

        const rearStripe=new THREE.Mesh(new THREE.BoxGeometry(stripeWidth,0.018,targetLength*0.22),stripeMat);
        rearStripe.position.set(x,0.985,-0.82); detailKit.add(rearStripe);
      }

      // Front fascia: central grille with two properly spaced headlight pairs.
      // The lights sit outside the grille, like a real Challenger front end,
      // instead of four lights clustered across the middle.
      const grille = new THREE.Mesh(
        new THREE.BoxGeometry(Math.min(1.38,bodyW*0.50),0.34,0.075),trim
      );
      grille.position.set(0,0.69,frontZ-0.025); detailKit.add(grille);

      const grilleTop = new THREE.Mesh(
        new THREE.BoxGeometry(Math.min(1.50,bodyW*0.56),0.075,0.055),trim
      );
      grilleTop.position.set(0,0.84,frontZ-0.035); detailKit.add(grilleTop);

      for(let i=-6;i<=6;i++){
        const bar=new THREE.Mesh(new THREE.BoxGeometry(0.026,0.27,0.042),chrome);
        bar.position.set(i*0.085,0.69,frontZ-0.072); detailKit.add(bar);
      }

      // Four headlights: wide outer/inner spacing, symmetric left and right pairs.
      const headlightXs=[
        -bodyW*0.39,-bodyW*0.25,
         bodyW*0.25, bodyW*0.39
      ];
      for(const x of headlightXs){
        const housing=new THREE.Mesh(
          new THREE.CylinderGeometry(0.16,0.16,0.075,20),lampInner
        );
        housing.rotation.x=Math.PI/2;
        housing.position.set(x,0.67,frontZ-0.045);
        detailKit.add(housing);

        const head=new THREE.Mesh(
          new THREE.TorusGeometry(0.122,0.029,8,24),lamp
        );
        head.rotation.x=Math.PI/2;
        head.position.set(x,0.67,frontZ-0.092);
        detailKit.add(head);

        const inner=new THREE.Mesh(
          new THREE.CylinderGeometry(0.054,0.054,0.032,16),lampGlow
        );
        inner.rotation.x=Math.PI/2;
        inner.position.set(x,0.67,frontZ-0.108);
        detailKit.add(inner);
      }

      // Aggressive lower bumper / splitter shape from the reference.
      const frontBumper=new THREE.Mesh(
        new THREE.BoxGeometry(bodyW*0.90,0.17,0.20),trim
      );
      frontBumper.position.set(0,0.48,frontZ-0.05); detailKit.add(frontBumper);

      const lowerIntake=new THREE.Mesh(
        new THREE.BoxGeometry(bodyW*0.72,0.22,0.08),trim
      );
      lowerIntake.position.set(0,0.42,frontZ-0.12); detailKit.add(lowerIntake);

      const splitter=new THREE.Mesh(
        new THREE.BoxGeometry(bodyW*0.92,0.045,0.20),trim
      );
      splitter.position.set(0,0.33,frontZ-0.13); detailKit.add(splitter);
      const rearBumper=frontBumper.clone(); rearBumper.position.z=rearZ+0.05; detailKit.add(rearBumper);

      // Hood power bulge + intake.
      const hoodBulge=new THREE.Mesh(new THREE.BoxGeometry(bodyW*0.24,0.045,0.82),new THREE.MeshStandardMaterial({color:0x9d1622,metalness:0.28,roughness:0.34}));
      hoodBulge.position.set(0,1.005,1.18); detailKit.add(hoodBulge);
      const hoodIntake=new THREE.Mesh(new THREE.BoxGeometry(bodyW*0.15,0.025,0.30),trim);
      hoodIntake.name="Hood_Grille_Trim";
      hoodIntake.position.set(0,1.04,1.43); detailKit.add(hoodIntake);
      // Small real-looking hood vent grille: it must travel with the hood,
      // not stay glued to the static body.
      for(let i=-2;i<=2;i++){
        const slat=new THREE.Mesh(new THREE.BoxGeometry(bodyW*0.105,0.018,0.018),chrome);
        slat.name="Hood_Grille_Slat_"+(i+2);
        slat.position.set(0,1.058,1.43+i*0.052);
        detailKit.add(slat);
      }

      // Side mirrors and door handles make the silhouette read better at distance.
      for(const x of [-bodyW*0.53,bodyW*0.53]){
        const side = x < 0 ? "L" : "R";
        const mirror=new THREE.Mesh(new THREE.BoxGeometry(0.18,0.14,0.28),chrome);
        mirror.name="SideMirror_"+side;
        mirror.position.set(x,1.10,0.02); detailKit.add(mirror);
        const handle=new THREE.Mesh(new THREE.BoxGeometry(0.22,0.045,0.055),chrome);
        handle.name="DoorHandle_"+side;
        handle.position.set(x*0.995,0.98,0.46); detailKit.add(handle);
      }

      // Small exhaust tips; no transparency or expensive shader work.
      for(const x of [-0.46,0.46]){
        const ex=new THREE.Mesh(new THREE.CylinderGeometry(0.065,0.075,0.22,10),chrome);
        ex.rotation.x=Math.PI/2; ex.position.set(x,0.40,rearZ+0.08); detailKit.add(ex);
      }
      detailKit.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.frustumCulled=true;}});
      this.carGroup.add(detailKit);

      this.carGroup.visible = true;
      this.carGroup.userData.modelLoading = false;
      this.carGroup.userData.modelRevision = "MechanicCity-R3-visual";
      this.carGroup.userData.modelSource = sourcePath;
      this.carGroup.userData.mobileOptimized = true;

      // Build serviceable parts from named R2.1 nodes.
      const named = {
        engine: ["ENGINE_BLOCK"],
        alternator: ["ALTERNATOR"],
        starter: ["STARTER"],
        hood: ["HOOD_ANIM"],
        trunk: ["TRUNK_ANIM"],
        door_FL: ["DOOR_LEFT_ANIM"],
        door_FR: ["DOOR_RIGHT_ANIM"],
        // R2.1 keeps the body/service naming stable; the source GLB also
        // contains a few legacy geometry_* nodes, so use them as fallbacks.
        rotor_FL: ["BRAKE_FRONT_LEFT", "geometry_21"],
        rotor_FR: ["BRAKE_FRONT_RIGHT", "geometry_25"],
        rotor_RL: ["BRAKE_REAR_LEFT", "geometry_23"],
        rotor_RR: ["BRAKE_REAR_RIGHT", "geometry_27"],
        strut_FL: ["STRUT_FRONT_LEFT", "geometry_40"],
        strut_FR: ["STRUT_FRONT_RIGHT", "geometry_42"],
        strut_RL: ["STRUT_REAR_LEFT", "geometry_41"],
        strut_RR: ["STRUT_REAR_RIGHT", "geometry_43"],
        spring_FL: ["SPRING_FRONT_LEFT", "geometry_29"],
        spring_FR: ["SPRING_FRONT_RIGHT", "geometry_35"],
        spring_RL: ["SPRING_REAR_LEFT", "geometry_32"],
        spring_RR: ["SPRING_REAR_RIGHT", "geometry_38"]
      };

      const previous = this.carGroup.userData.serviceParts || {};
      const serviceParts = {};
      for (const [key,names] of Object.entries(named)) {
        const mesh = names.map(n=>model.getObjectByName(n)).find(Boolean);
        if (!mesh) continue;
        const old = previous[key];
        serviceParts[key] = {
          key,
          name: old?.name || key,
          category: old?.category || "other",
          subsystem: old?.subsystem || "other",
          removable: true,
          tunable: !!old?.tunable,
          baseCost: old?.baseCost || 50,
          condition: typeof old?.condition === "number" ? old.condition : 100,
          installed: old?.installed !== false,
          mesh
        };
        mesh.userData.servicePart = serviceParts[key];
        // Service meshes are intentionally hidden in the driving view.
        // They use the source GLB's workshop geometry and some are not
        // normalized to the vehicle body scale; showing them on the road
        // creates the giant white/black blocks seen on mobile.
        mesh.visible = this.carGroup.userData.workshopMode === true && serviceParts[key].installed;
      }

      // Keep any catalog entries that are not represented by geometry.
      for (const [key,part] of Object.entries(previous)) {
        if (!serviceParts[key]) serviceParts[key] = part;
      }
      this.carGroup.userData.serviceParts = serviceParts;
      this.parts = Object.fromEntries(
        Object.entries(serviceParts).map(([key,part])=>[key,{mesh:part.mesh,condition:part.condition,removable:part.removable}])
      );

      // Realistic Challenger engine bay: keep it inside the body and only
      // reveal it when the hood is open. No transparent overlay.
      const engineBay = new THREE.Group();
      engineBay.name="Challenger_EngineBay";
      const bayMat=new THREE.MeshStandardMaterial({color:0x171a1d,metalness:0.62,roughness:0.48});
      const metalMat=new THREE.MeshStandardMaterial({color:0x34383c,metalness:0.82,roughness:0.32});
      const rubberMat=new THREE.MeshStandardMaterial({color:0x080909,metalness:0.05,roughness:0.78});
      const redMat=new THREE.MeshStandardMaterial({color:0x9b1722,metalness:0.42,roughness:0.34});
      const wireMats=[
        new THREE.MeshStandardMaterial({color:0x101010,roughness:0.72}),
        new THREE.MeshStandardMaterial({color:0x8b171c,roughness:0.62}),
        new THREE.MeshStandardMaterial({color:0xd2a51a,roughness:0.58})
      ];

      const bayFloor=new THREE.Mesh(new THREE.BoxGeometry(2.75,0.16,2.35),bayMat);
      bayFloor.position.set(0,0.72,0.72);
      engineBay.add(bayFloor);

      // ОПАКОВКА моторного отсека: непрозрачные внутренние стенки.
      // Они закрывают пустоты по бокам/сзади двигателя и не используют alpha.
      const innerWallMat=new THREE.MeshStandardMaterial({
        color:0x24262a, metalness:0.62, roughness:0.34,
        transparent:false, opacity:1, depthWrite:true, side:THREE.DoubleSide
      });
      const leftInnerWall=new THREE.Mesh(
        new THREE.BoxGeometry(0.16,1.05,2.05),innerWallMat
      );
      leftInnerWall.position.set(-1.28,1.10,0.78);
      leftInnerWall.name="EngineBay_LeftInnerWall";
      const rightInnerWall=leftInnerWall.clone();
      rightInnerWall.position.x=1.28;
      rightInnerWall.name="EngineBay_RightInnerWall";

      const firewall=new THREE.Mesh(
        new THREE.BoxGeometry(2.55,1.08,0.14),innerWallMat
      );
      firewall.position.set(0,1.10,-0.30);
      firewall.name="EngineBay_Firewall";

      const frontInnerWall=new THREE.Mesh(
        new THREE.BoxGeometry(2.55,0.82,0.14),innerWallMat
      );
      frontInnerWall.position.set(0,0.98,1.90);
      frontInnerWall.name="EngineBay_RadiatorWall";
      engineBay.add(leftInnerWall,rightInnerWall,firewall,frontInnerWall);

      const engine=new THREE.Mesh(new THREE.BoxGeometry(1.35,0.72,1.15),metalMat);
      engine.position.set(0,1.05,0.80);
      engine.name="Dodge_V8_Engine_Block";
      engineBay.add(engine);

      const v8Intake=new THREE.Mesh(new THREE.BoxGeometry(0.72,0.20,0.82),rubberMat);
      v8Intake.position.set(0,1.43,0.84);
      v8Intake.name="Dodge_V8_Intake";
      engineBay.add(v8Intake);

      for(const x of [-0.62,0.62]){
        const valve=new THREE.Mesh(new THREE.BoxGeometry(0.28,0.34,0.94),redMat);
        valve.position.set(x,1.16,0.80);
        valve.name="Dodge_V8_ValveCover";
        engineBay.add(valve);
      }

      const battery=new THREE.Mesh(new THREE.BoxGeometry(0.48,0.32,0.66),metalMat);
      battery.position.set(-1.02,1.02,0.25);
      battery.name="Battery";
      engineBay.add(battery);

      const radiator=new THREE.Mesh(new THREE.BoxGeometry(2.15,0.48,0.16),metalMat);
      radiator.position.set(0,0.95,1.84);
      radiator.name="Radiator";
      engineBay.add(radiator);

      const fan=new THREE.Mesh(new THREE.CylinderGeometry(0.30,0.30,0.08,16),rubberMat);
      fan.rotation.x=Math.PI/2;
      fan.position.set(0,1.03,1.70);
      fan.name="Cooling_Fan";
      engineBay.add(fan);

      // Visible wiring harnesses, hoses and connectors.
      const addWire=(a,b,r,mat,name)=>{
        const va=new THREE.Vector3(...a), vb=new THREE.Vector3(...b);
        const d=vb.clone().sub(va);
        const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,d.length,8),mat);
        m.position.copy(va).add(vb).multiplyScalar(0.5);
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());
        m.name=name;
        engineBay.add(m);
      };
      addWire([-0.62,1.34,0.82],[-0.92,1.48,0.54],0.035,wireMats[0],"Ignition_Wire_L");
      addWire([0.62,1.34,0.82],[0.92,1.48,0.54],0.035,wireMats[0],"Ignition_Wire_R");
      addWire([-0.92,1.20,0.55],[-1.18,1.08,0.18],0.045,wireMats[1],"Power_Cable");
      addWire([0.35,1.39,0.90],[0.92,1.35,1.18],0.032,wireMats[2],"Sensor_Wire");

      // Привязываем моторный отсек к реальным координатам кузова R2.1.
      // geometry_0 после нормализации имеет нижнюю кромку кузова около Y=0.61,
      // а настоящий капот проходит примерно от Z=0.62 до Z=2.4.
      // Поэтому мотор должен лежать ниже капота и в передней половине кузова,
      // а не висеть над машиной.
      engineBay.scale.setScalar(0.48);
      engineBay.position.set(0,0.12,0.85);
      engineBay.traverse(o=>{
        if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.frustumCulled=true;}
      });
      engineBay.visible=false;
      this.carGroup.add(engineBay);
      this.carGroup.userData.engineBay=engineBay;

      // Mechanical service parts are for workshop inspection only. They must
      // not render as a flat platform/underbody slab beneath the driving car.
      this.addFullChallengerMechanicalLayer();

      // Build real animated doors from the original Challenger body mesh.
      // DOOR_*_ANIM are only markers, so use the actual side-panel triangles
      // just like the real hood above.
      const createDoorAssemblies = () => {
        const body = model.getObjectByName("geometry_0");
        if(!body?.geometry?.attributes?.position) return [];

        // Use the ACTUAL Challenger door triangles. Do not approximate the
        // door with a rectangle/extrusion: the real surface already contains
        // the correct lower edge, window frame and body contour.
        const src=body.geometry, pos=src.attributes.position, idx=src.index;
        const triCount=idx ? idx.count/3 : pos.count/3;
        const regions=[[],[]];

        const inRegion=(i,side)=>{
          const x=pos.getX(i), y=pos.getY(i), z=pos.getZ(i);
          return (side<0 ? x<=-0.125 : x>=0.125) &&
            Math.abs(x)<=0.205 &&
            y>=-0.055 && y<=0.112 &&
            z>=-0.24 && z<=0.24;
        };

        const keep=[];
        for(let t=0;t<triCount;t++){
          const ia=idx?idx.getX(t*3):t*3;
          const ib=idx?idx.getX(t*3+1):t*3+1;
          const ic=idx?idx.getX(t*3+2):t*3+2;

          const left=inRegion(ia,-1)&&inRegion(ib,-1)&&inRegion(ic,-1);
          const right=inRegion(ia,1)&&inRegion(ib,1)&&inRegion(ic,1);
          if(!left && !right) keep.push([ia,ib,ic]);

          if(left) regions[0].push([ia,ib,ic]);
          if(right) regions[1].push([ia,ib,ic]);
        }

        if(keep.length){
          const kept=[];
          for(const tri of keep){
            for(const i of tri) kept.push(pos.getX(i),pos.getY(i),pos.getZ(i));
          }
          const ng=new THREE.BufferGeometry();
          ng.setAttribute("position",new THREE.Float32BufferAttribute(kept,3));
          ng.computeVertexNormals();
          body.geometry.dispose();
          body.geometry=ng;
        }

        const makeDoor=(tris,side,name)=>{
          if(!tris.length)return null;

          // Copy the exact source triangles, so the door silhouette follows
          // the Challenger body instead of becoming a square panel.
          const raw=[];
          for(const [a,b,c] of tris){
            for(const i of [a,b,c]){
              raw.push(pos.getX(i),pos.getY(i),pos.getZ(i));
            }
          }

          const geo=new THREE.BufferGeometry();
          geo.setAttribute("position",new THREE.Float32BufferAttribute(raw,3));
          geo.computeVertexNormals();

          const bp=geo.attributes.position;
          for(let i=0;i<bp.count;i++){
            const v=new THREE.Vector3(bp.getX(i),bp.getY(i),bp.getZ(i)).applyMatrix4(model.matrix);
            bp.setXYZ(i,v.x,v.y,v.z);
          }
          bp.needsUpdate=true;
          geo.computeBoundingBox();
          geo.computeBoundingSphere();

          const b=geo.boundingBox;
          if(!b)return null;

          const doorMat=new THREE.MeshStandardMaterial({
            color:0xe52a36, metalness:0.34, roughness:0.28,
            transparent:false, opacity:1, depthWrite:true,
            side:THREE.DoubleSide
          });

          const mesh=new THREE.Mesh(geo,doorMat);
          mesh.name=name+"_RealDoor";
          mesh.castShadow=true;
          mesh.receiveShadow=true;

          // Hinge at the front edge of the actual extracted door.
          const hinge=new THREE.Vector3(
            side<0 ? b.min.x : b.max.x,
            b.min.y+(b.max.y-b.min.y)*0.08,
            b.max.z-0.015
          );

          const pivot=new THREE.Object3D();
          pivot.name=name+"_Hinge";
          pivot.userData.isVehicleDoor=true;
          pivot.position.copy(hinge);
          this.carGroup.add(pivot);

          const hp=geo.attributes.position;
          for(let i=0;i<hp.count;i++){
            hp.setXYZ(i,hp.getX(i)-hinge.x,hp.getY(i)-hinge.y,hp.getZ(i)-hinge.z);
          }
          hp.needsUpdate=true;
          geo.computeBoundingBox();
          geo.computeBoundingSphere();
          pivot.add(mesh);

          // Find the opening direction from the actual door center.
          const center=new THREE.Vector3(
            (b.min.x+b.max.x)*0.5-hinge.x,
            (b.min.y+b.max.y)*0.5-hinge.y,
            (b.min.z+b.max.z)*0.5-hinge.z
          );
          const plus=center.clone().applyAxisAngle(new THREE.Vector3(0,1,0),0.8);
          const minus=center.clone().applyAxisAngle(new THREE.Vector3(0,1,0),-0.8);
          const plusOut=side<0 ? -plus.x : plus.x;
          const minusOut=side<0 ? -minus.x : minus.x;
          const openSign=plusOut>=minusOut ? 1 : -1;

          // Do not add a rectangular inner panel here. The real door skin and
          // the real window geometry must remain visible; a BoxGeometry backing
          // creates the square object behind the door when it opens.

          // Move the REAL side-window glass with the door. geometry_6 contains
          // all Challenger glass; only the side-window triangles in the door
          // zone are detached, while windshield/rear glass stays on the body.
          const glassBody=model.getObjectByName("geometry_6");
          if(glassBody?.geometry?.attributes?.position){
            const gs=glassBody.geometry, gp=gs.attributes.position, gi=gs.index;
            const gTriCount=gi ? gi.count/3 : gp.count/3;
            const glassKeep=[], glassDoor=[];
            const inDoorGlass=(i)=>{
              const x=gp.getX(i), y=gp.getY(i), z=gp.getZ(i);
              return (side<0 ? x<=-0.095 : x>=0.095) &&
                Math.abs(x)<=0.205 &&
                y>=0.055 && y<=0.125 &&
                z>=-0.18 && z<=0.22;
            };
            for(let t=0;t<gTriCount;t++){
              const a=gi?gi.getX(t*3):t*3;
              const b=gi?gi.getX(t*3+1):t*3+1;
              const c=gi?gi.getX(t*3+2):t*3+2;
              const hit=inDoorGlass(a)&&inDoorGlass(b)&&inDoorGlass(c);
              (hit?glassDoor:glassKeep).push([a,b,c]);
            }
            if(glassDoor.length){
              const buildGlass=(tris)=>{
                const out=[];
                for(const [a,b,c] of tris){
                  for(const i of [a,b,c]) out.push(gp.getX(i),gp.getY(i),gp.getZ(i));
                }
                const g=new THREE.BufferGeometry();
                g.setAttribute("position",new THREE.Float32BufferAttribute(out,3));
                g.computeVertexNormals();
                return g;
              };
              glassBody.geometry=buildGlass(glassKeep);
              const doorGlassGeo=buildGlass(glassDoor);
              const p=doorGlassGeo.attributes.position;
              for(let i=0;i<p.count;i++){
                const v=new THREE.Vector3(p.getX(i),p.getY(i),p.getZ(i)).applyMatrix4(model.matrix);
                p.setXYZ(i,v.x-hinge.x,v.y-hinge.y,v.z-hinge.z);
              }
              p.needsUpdate=true;
              doorGlassGeo.computeVertexNormals();
              const glassMat=new THREE.MeshStandardMaterial({
                color:0x101b20, metalness:0.05, roughness:0.16,
                transparent:false, opacity:1, depthWrite:true,
                side:THREE.DoubleSide
              });
              const doorGlass=new THREE.Mesh(doorGlassGeo,glassMat);
              doorGlass.name=name+"_RealWindowGlass";
              doorGlass.castShadow=false;
              doorGlass.receiveShadow=true;
              pivot.add(doorGlass);
            }
          }

          return {pivot,open:0,openSign,axis:"y",maxAngle:1.08};
        };

        return [
          makeDoor(regions[0],-1,"Door_Left"),
          makeDoor(regions[1],1,"Door_Right")
        ].filter(Boolean);
      };
      // The *_ANIM nodes are only markers. Use the ACTUAL hood surface
      // from geometry_0: copy its real triangles, remove those triangles from
      // the static body, and put the copy on a hinge. No fake hood, no black bay.
      const createHoodAssembly = () => {
        const body = model.getObjectByName("geometry_0");
        if(!body?.geometry?.attributes?.position) return null;

        const src = body.geometry;
        const pos = src.attributes.position;
        const idx = src.index;
        const triCount = idx ? idx.count / 3 : pos.count / 3;

        // In the source Challenger mesh the hood is one connected surface
        // occupying this local region.
        const isHoodVertex = (i) => {
          const x=pos.getX(i), y=pos.getY(i), z=pos.getZ(i);
          return Math.abs(x)<=0.176 && y>=0.011 && y<=0.066 && z>=0.124 && z<=0.487;
        };

        const hoodTris=[];
        const keepTris=[];
        for(let t=0;t<triCount;t++){
          const ia=idx ? idx.getX(t*3) : t*3;
          const ib=idx ? idx.getX(t*3+1) : t*3+1;
          const ic=idx ? idx.getX(t*3+2) : t*3+2;
          const hood=isHoodVertex(ia)&&isHoodVertex(ib)&&isHoodVertex(ic);
          (hood?hoodTris:keepTris).push([ia,ib,ic]);
        }
        if(!hoodTris.length)return null;

        const build=(tris)=>{
          const out=[];
          for(const [a,b,c] of tris){
            for(const i of [a,b,c])out.push(pos.getX(i),pos.getY(i),pos.getZ(i));
          }
          const g=new THREE.BufferGeometry();
          g.setAttribute("position",new THREE.Float32BufferAttribute(out,3));
          g.computeVertexNormals();
          g.computeBoundingSphere();
          return g;
        };

        // Delete the original/static hood from the body.
        body.geometry=build(keepTris);

        // Convert the copied hood from model-local coordinates into carGroup
        // coordinates, because model already has the GLB normalization scale.
        const hoodGeometry=build(hoodTris);
        const p=hoodGeometry.attributes.position;
        for(let i=0;i<p.count;i++){
          const v=new THREE.Vector3(p.getX(i),p.getY(i),p.getZ(i));
          v.applyMatrix4(model.matrix);
          p.setXYZ(i,v.x,v.y,v.z);
        }
        p.needsUpdate=true;
        hoodGeometry.computeVertexNormals();
        hoodGeometry.computeBoundingSphere();

        // Front is +Z. The rear edge of the real hood is the hinge edge.
        const hingeLocal=new THREE.Vector3(0,0.011,0.124);
        const hinge=new THREE.Vector3().copy(hingeLocal).applyMatrix4(model.matrix);

        const hoodMat=new THREE.MeshStandardMaterial({
          color:0xe52a36, metalness:0.34, roughness:0.28,
          transparent:false, opacity:1
        });
        const hood=new THREE.Mesh(hoodGeometry,hoodMat);
        hood.name="RuntimeRealHood";
        hood.castShadow=true;
        hood.receiveShadow=true;

        const pivot=new THREE.Object3D();
        pivot.name="RuntimeRealHoodHinge";
        pivot.position.copy(hinge);
        this.carGroup.add(pivot);

        // Put the copied real hood around its actual hinge edge.
        const hp=hood.geometry.attributes.position;
        for(let i=0;i<hp.count;i++){
          hp.setXYZ(i,hp.getX(i)-hinge.x,hp.getY(i)-hinge.y,hp.getZ(i)-hinge.z);
        }
        hp.needsUpdate=true;
        hood.geometry.computeBoundingBox();
        hood.geometry.computeBoundingSphere();
        pivot.add(hood);

        // Determine the opening direction from the real copied hood.
        // Pick the sign that moves the front edge toward +Y (up).
        let frontLocal = null;
        for(let i=0;i<hp.count;i++){
          const z=hp.getZ(i);
          if(!frontLocal || z>frontLocal.z){
            frontLocal=new THREE.Vector3(hp.getX(i),hp.getY(i),z);
          }
        }
        const axis=new THREE.Vector3(1,0,0);
        const plus=frontLocal?.clone().applyAxisAngle(axis,0.6);
        const minus=frontLocal?.clone().applyAxisAngle(axis,-0.6);
        const openSign=(plus && minus) ? (plus.y>=minus.y ? 1 : -1) : 1;

        // Move the hood vent/grille assembly onto the same hinge as the real hood.
        // These parts were originally children of the static detail kit, so without
        // this re-parenting they would visibly remain behind when the hood opens.
        const hoodTrimNames = ["Hood_Grille_Trim","Hood_Grille_Slat_0","Hood_Grille_Slat_1","Hood_Grille_Slat_2","Hood_Grille_Slat_3","Hood_Grille_Slat_4"];
        for(const name of hoodTrimNames){
          const trimPart=detailKit.getObjectByName(name);
          if(!trimPart)continue;
          detailKit.remove(trimPart);
          trimPart.position.x-=hinge.x;
          trimPart.position.y-=hinge.y;
          trimPart.position.z-=hinge.z;
          pivot.add(trimPart);
        }

        return {pivot,open:0,openSign,axis:"x",maxAngle:0.95};
      };

      for(const nodeName of ["HOOD_ANIM","DOOR_LEFT_ANIM","DOOR_RIGHT_ANIM","TRUNK_ANIM"]){
        const marker=model.getObjectByName(nodeName);
        if(marker)marker.visible=false;
      }

      const doorAssemblies=createDoorAssemblies();

      // Door-mounted details: mirrors and handles must travel with the real
      // animated door instead of remaining on the static body.
      for (const door of doorAssemblies) {
        const side = door.pivot.name === "Door_Left_Hinge" ? -1 : 1;
        const mirror = detailKit.getObjectByName("SideMirror_" + (side < 0 ? "L" : "R"));
        const handle = detailKit.getObjectByName("DoorHandle_" + (side < 0 ? "L" : "R"));
        if (mirror) door.pivot.attach(mirror);
        if (handle) door.pivot.attach(handle);
      }

      // The R2.1 exterior GLB does not provide the cabin as one of the seven
      // mobile meshes. Use the ORIGINAL Revision 18 interior from preview.glb
      // instead of procedural boxes. The R18 asset is normalized to the same
      // 4.95 m vehicle length used by the driving model, so its interior stays
      // in the measured vehicle envelope.
      const loadOriginalR18Interior = async () => {
        try {
          const response = await fetch("/models/preview.glb", {cache:"no-store"});
          if (!response.ok) return;
          const buffer = await response.arrayBuffer();
          const interiorModel = await new Promise((resolve,reject)=>{
            loader.parse(buffer, "/models/preview.glb", g=>resolve(g.scene), reject);
          });

          interiorModel.name = "Challenger_R18_OriginalInterior";
          interiorModel.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(interiorModel);
          if (box.isEmpty()) return;

          // Normalize the original R18 scene exactly like the authoritative
          // Revision-18 loader. Do NOT center the interior meshes separately:
          // their original coordinates are what keep seats/dashboard inside
          // the body.
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());
          const longest = Math.max(size.x,size.y,size.z);
          if (!Number.isFinite(longest) || longest <= 0) return;
          const interiorScale = targetLength / longest;
          interiorModel.scale.setScalar(interiorScale);
          // preview.glb uses X as the vehicle length axis, just like the
          // original R18 normalization above. Apply the same X -> Z rotation
          // so the cabin/interior cannot sit crosswise over the R2.1 chassis.
          interiorModel.rotation.set(0, -Math.PI / 2, 0);
          const interiorCenter = center.clone()
            .applyEuler(interiorModel.rotation)
            .multiplyScalar(interiorScale);
          interiorModel.position.set(
            -interiorCenter.x,
            -box.min.y * interiorScale,
            -interiorCenter.z
          );
          interiorModel.updateMatrixWorld(true);

          const isInteriorName = (name) => {
            const n = String(name || "").toLowerCase();
            return /seat|dash|console|steering|pedal|shifter|interior|cockpit|carpet|trim|doorpanel|door_panel/.test(n);
          };

          let visibleInteriorCount = 0;
          interiorModel.traverse(o=>{
            if (!o.isMesh) return;
            let hit = isInteriorName(o.name);
            let parent = o.parent;
            while (!hit && parent) {
              hit = isInteriorName(parent.name);
              parent = parent.parent;
            }
            o.castShadow = true;
            o.receiveShadow = true;
            o.frustumCulled = false;
            o.visible = hit;
            if (hit) visibleInteriorCount++;
          });

          if (!visibleInteriorCount) return;
          this.carGroup.add(interiorModel);
          this.carGroup.userData.originalInterior = true;
          this.carGroup.userData.originalInteriorSource = "/models/preview.glb";
          this.carGroup.userData.originalInteriorMeshCount = visibleInteriorCount;
          this.carGroup.userData.vehicleSpec = {
            ...(this.carGroup.userData.vehicleSpec || {}),
            lengthMeters: 4.95,
            interiorSource: "Higgsfield-R18-preview.glb"
          };
        } catch (err) {
          console.warn("Original R18 interior unavailable; no procedural cabin will be created.", err);
        }
      };

      await loadOriginalR18Interior();

      // Keep the real door assemblies authoritative; the marker/procedural
      // doors must never overwrite them after the GLB finishes loading.
      if (doorAssemblies.length) this.carGroup.userData.realDoorCount=doorAssemblies.length;
      const articulation = {
        doors: doorAssemblies,
        hood: createHoodAssembly(),
        trunk: null,
        steering: null
      };
      // main.js created this object synchronously; mutate it in place if present.
      if (this.carGroup.userData.articulation) {
        this.carGroup.userData.articulation.doors = articulation.doors;
        this.carGroup.userData.articulation.hood = articulation.hood;
        this.carGroup.userData.articulation.trunk = articulation.trunk;
      }

      this.carGroup.userData.servicePartCount = Object.keys(serviceParts).length;
      this.carGroup.userData.vehicleSpec = {
        lengthMeters: 4.95,
        revision: "MechanicCity-R3-visual",
        sourcePath,
        editable: true,
        mobileOptimized: true
      };
    } catch (err) {
      // Never reveal the procedural fallback: the original R18 GLB is the sole player visual.
      this.carGroup.visible = false;
      this.carGroup.userData.modelLoading = false;
      this.carGroup.userData.modelLoadError = String(err?.message || err);
      console.error("Mechanic City R18 GLB load failed; procedural fallback remains hidden.", err);
    }
  }

  build() {
    this.buildChassis();
    this.buildBody();
    this.buildDoors();
    this.buildHoodAndTrunk();
    this.buildWindows();
    this.buildLights();
    this.buildBumpers();
    this.buildWheels();
    this.buildEngine();
    this.buildTransmission();
    this.buildRearDriveAssembly();
    this.buildSuspension();
    this.buildExhaust();
    this.buildInterior();
    this.buildMirrors();
  }

  addFullChallengerMechanicalLayer() {
    // Removed from the vehicle entirely. The driving/city model must never
    // contain a service platform or under-car mechanical display layer.
    this.carGroup.userData.fullMechanicalLayer = null;
  }


  // ====== ГЛАВНАЯ КОНСТРУКЦИЯ ======

  buildChassis() {
    // Несущая конструкция (не снимается)
    const paint = this.getMaterial('paint', this.config.color);
    const chassisGroup = new THREE.Group();
    chassisGroup.name = "Chassis";

    const bodyHeight = this.config.type === 'truck' ? 0.75 : 0.68;
    const bodyLength = this.getBodyLength();
    const bodyWidth = this.getBodyWidth();

    // Основной кузов - структурный элемент
    const chassis = new THREE.Mesh(
      new RoundedBoxGeometry(bodyWidth, bodyHeight, bodyLength, 5, 0.18),
      paint
    );
    chassis.position.y = 0.62;
    chassis.castShadow = true;
    chassis.receiveShadow = true;
    chassis.userData = {
      partKey: "chassis",
      partName: "Кузов (несущая конструкция)",
      category: "body",
      removable: false,
      condition: 100
    };

    chassisGroup.add(chassis);
    this.carGroup.add(chassisGroup);
    this.parts.chassis = { mesh: chassis, condition: 100 };
  }

  buildBody() {
    const paint = this.getMaterial('paint', this.config.color);
    const bodyGroup = new THREE.Group();
    bodyGroup.name = "BodyPanels";

    const bodyWidth = this.getBodyWidth();
    const bodyHeight = this.config.type === 'truck' ? 0.75 : 0.68;
    const bodyLength = this.getBodyLength();

    // Капот (съёмный!)
    this.createRemovablePart("hood", "Капот", "body",
      new THREE.BoxGeometry(bodyWidth - 0.1, 0.18, 1.4),
      paint,
      new THREE.Vector3(0, 0.95, -bodyLength / 2 + 0.8),
      bodyGroup
    );

    // Багажник (съёмный!)
    this.createRemovablePart("trunk", "Багажник", "body",
      new THREE.BoxGeometry(bodyWidth - 0.1, 0.18, 0.9),
      paint,
      new THREE.Vector3(0, 0.95, bodyLength / 2 - 0.5),
      bodyGroup
    );

    // Боковые панели (структурные, не снимаются)
    for (const side of [-1, 1]) {
      const sidePanel = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.6, bodyLength - 0.5),
        paint
      );
      sidePanel.position.set(side * (bodyWidth / 2 + 0.04), 0.7, 0);
      sidePanel.castShadow = true;
      sidePanel.receiveShadow = true;
      bodyGroup.add(sidePanel);
    }

    // Rounded classic sedan cabin: gives the Retro Car a recognizable silhouette
    // instead of the flat box profile.
    const cabinGroup = new THREE.Group();
    cabinGroup.name = "ClassicCabin";
    const roof = new THREE.Mesh(
      new RoundedBoxGeometry(2.48, 0.58, 2.72, 5, 0.16),
      paint
    );
    roof.position.set(0, 1.28, 0.18);
    roof.scale.set(1, 1, 0.98);
    roof.castShadow = true;
    roof.receiveShadow = true;
    roof.userData = {
      partKey: "cabin",
      partName: "Кабина кузова",
      category: "body",
      removable: false,
      condition: 100
    };
    cabinGroup.add(roof);

    // Dark recessed window bands on the classic cabin.
    const glass = this.getMaterial("glass", 0x152733);
    const frontGlass = new THREE.Mesh(
      new RoundedBoxGeometry(2.12, 0.34, 0.08, 4, 0.05),
      glass
    );
    frontGlass.position.set(0, 1.34, -1.18);
    frontGlass.rotation.x = -0.16;
    cabinGroup.add(frontGlass);

    const rearGlass = new THREE.Mesh(
      new RoundedBoxGeometry(2.12, 0.30, 0.08, 4, 0.05),
      glass
    );
    rearGlass.position.set(0, 1.34, 1.48);
    rearGlass.rotation.x = 0.12;
    cabinGroup.add(rearGlass);

  }

  getGroup() {
    return this.carGroup;
  }
}