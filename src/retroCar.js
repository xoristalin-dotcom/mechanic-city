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
    this.carGroup.name = "RetroCarAssembly";

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

    this.build();
    // Keep the procedural build as a fallback, but do not render it while the
    // real Challenger GLB is loading. This prevents the old car from appearing
    // for a frame before the player's actual car arrives.
    this.carGroup.visible = false;
    this.carGroup.userData.modelLoading = true;
    this.loadMechanicCityModel();
  }

  async loadMechanicCityModel() {
    const paths = [
      import.meta.env.VITE_MECHANIC_CITY_MODEL_URL || "/models/dodge_challenger_mechanic_city_r2_1.glb",
      "/models/challenger-r9.glb"
    ].filter((v,i,a)=>v && a.indexOf(v)===i);

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
      if (!buffer) return;

      const model = await new Promise((resolve,reject)=>{
        loader.parse(buffer, sourcePath, g=>resolve(g.scene), reject);
      });

      model.name = "MechanicCity_DodgeChallenger_R2_1";
      model.updateMatrixWorld(true);

      // R2.1 is authored as a normalized vehicle along the Z axis.
      // Do not use the whole scene bounds here: the optional engine/service
      // geometry intentionally sits above the body and would make the car
      // several times too tall on mobile.
      const bodyMesh = model.getObjectByName("geometry_0");
      const bodyBox = bodyMesh
        ? new THREE.Box3().setFromObject(bodyMesh)
        : new THREE.Box3().setFromObject(model);
      if (bodyBox.isEmpty()) return;

      const bodySize = bodyBox.getSize(new THREE.Vector3());
      const bodyCenter = bodyBox.getCenter(new THREE.Vector3());
      const bodyLength = bodySize.z;
      if (!Number.isFinite(bodyLength) || bodyLength <= 0) return;

      const targetLength = 4.95;
      const scale = targetLength / bodyLength;
      model.scale.setScalar(scale);
      model.position.set(
        -bodyCenter.x * scale,
        -bodyBox.min.y * scale,
        -bodyCenter.z * scale
      );
      model.updateMatrixWorld(true);

      // The seven meshes geometry_0..geometry_6 are the actual mobile visual
      // car. The extra service geometry is useful in the workshop but was
      // authored at a different local scale, so keep it hidden in the driving
      // view instead of letting it blow up the silhouette.
      // The source GLB has no TEXCOORD_0 on its seven visual meshes, so
      // embedded atlas textures cannot be sampled reliably in mobile WebGL.
      // Treat geometry_0..2 as painted body surfaces instead of giving them
      // unrelated trim colors; this prevents the body from turning cream/white.
      const visualStyles = {
        geometry_0: { color: 0xd51f2a, metalness: 0.46, roughness: 0.26 },
        geometry_1: { color: 0xb7111c, metalness: 0.42, roughness: 0.31 },
        geometry_2: { color: 0x8e0c16, metalness: 0.38, roughness: 0.36 },
        geometry_3: { color: 0x7e0b14, metalness: 0.40, roughness: 0.38 },
        geometry_4: { color: 0x9b1019, metalness: 0.38, roughness: 0.40 },
        geometry_5: { color: 0x090b0d, metalness: 0.18, roughness: 0.68 },
        geometry_6: { color: 0x050609, metalness: 0.18, roughness: 0.12 }
      };

      model.traverse(o=>{
        if (!o.isMesh) return;
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
      const wheelRadius = 0.43;
      const wheelX = Math.max(0.92, bodySize.x * scale * 0.44);
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
        new THREE.BoxGeometry(bodyW*0.96,0.055,0.28),chrome
      );
      splitter.position.set(0,0.33,frontZ-0.13); detailKit.add(splitter);
      const rearBumper=frontBumper.clone(); rearBumper.position.z=rearZ+0.05; detailKit.add(rearBumper);

      // Hood power bulge + intake.
      const hoodBulge=new THREE.Mesh(new THREE.BoxGeometry(bodyW*0.28,0.07,1.05),new THREE.MeshStandardMaterial({color:0x202428,metalness:0.52,roughness:0.3}));
      hoodBulge.position.set(0,0.99,-1.48); detailKit.add(hoodBulge);
      const intake=new THREE.Mesh(new THREE.BoxGeometry(bodyW*0.18,0.035,0.38),trim);
      intake.position.set(0,1.045,-1.58); detailKit.add(intake);

      // Side mirrors and door handles make the silhouette read better at distance.
      for(const x of [-bodyW*0.53,bodyW*0.53]){
        const mirror=new THREE.Mesh(new THREE.BoxGeometry(0.18,0.14,0.28),chrome);
        mirror.position.set(x,1.12,-0.62); detailKit.add(mirror);
        const handle=new THREE.Mesh(new THREE.BoxGeometry(0.22,0.045,0.055),chrome);
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

      // Runtime hinges for the new named panels.
      const makeHinge = (nodeName, axis, sign, angle) => {
        const mesh = model.getObjectByName(nodeName);
        if (!mesh) return null;
        const pivot = new THREE.Object3D();
        pivot.name = nodeName + "_RuntimeHinge";
        mesh.parent?.add(pivot);
        pivot.position.copy(mesh.position);
        pivot.attach(mesh);
        return {pivot,open:0,openSign:sign,axis,maxAngle:angle};
      };

      const articulation = {
        doors: [
          makeHinge("DOOR_LEFT_ANIM","y",1,1.12),
          makeHinge("DOOR_RIGHT_ANIM","y",-1,1.12)
        ].filter(Boolean),
        hood: makeHinge("HOOD_ANIM","x",-1,.88),
        trunk: makeHinge("TRUNK_ANIM","x",1,.78),
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
      // If the GLB really fails, reveal the procedural fallback instead of
      // leaving the player vehicle invisible.
      this.carGroup.visible = true;
      this.carGroup.userData.modelLoading = false;
      console.warn("Mechanic City Challenger R2.1 load failed; keeping procedural car.", err);
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
    this.buildSuspension();
    this.buildExhaust();
    this.buildInterior();
    this.buildMirrors();
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

    for (const side of [-1, 1]) {
      const sideGlass = new THREE.Mesh(
        new RoundedBoxGeometry(0.08, 0.34, 1.72, 4, 0.04),
        glass
      );
      sideGlass.position.set(side * 1.25, 1.34, 0.12);
      cabinGroup.add(sideGlass);
    }
    this.carGroup.add(cabinGroup);
  }

  buildDoors() {
    const paint = this.getMaterial('paint', this.config.color);
    const doorsGroup = new THREE.Group();
    doorsGroup.name = "Doors";

    const doorConfigs = [
      { name: "FrontLeft", side: -1, front: true, position: [-1.5, 0.9, -0.4] },
      { name: "FrontRight", side: 1, front: true, position: [1.5, 0.9, -0.4] },
      { name: "RearLeft", side: -1, front: false, position: [-1.5, 0.9, 0.6] },
      { name: "RearRight", side: 1, front: false, position: [1.5, 0.9, 0.6] }
    ];

    for (const config of doorConfigs) {
      const doorGroup = new THREE.Group();
      doorGroup.name = `Door_${config.name}`;

      // Создаём шарнир (pivot)
      const hingePivot = new THREE.Group();
      hingePivot.name = `${config.name}_Hinge`;
      hingePivot.position.copy(new THREE.Vector3(...config.position));

      // Дверь
      const door = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.55, 0.9),
        paint
      );
      door.castShadow = true;
      door.receiveShadow = true;
      door.userData = {
        partKey: `door_${config.name}`,
        partName: `Дверь ${config.name}`,
        category: "body",
        removable: true,
        condition: 100,
        side: config.side,
        isFront: config.front
      };

      hingePivot.add(door);
      doorGroup.add(hingePivot);
      doorsGroup.add(doorGroup);

      this.articulation.doors[config.name] = {
        pivot: hingePivot,
        door: door,
        openAngle: 0,
        maxAngle: config.side < 0 ? Math.PI / 2.2 : -Math.PI / 2.2,
        side: config.side
      };

      this.parts[`door_${config.name}`] = { 
        mesh: door, 
        condition: 100,
        removable: true 
      };
    }

    this.carGroup.add(doorsGroup);
  }

  buildHoodAndTrunk() {
    const paint = this.getMaterial('paint', this.config.color);
    const lidsGroup = new THREE.Group();
    lidsGroup.name = "Lids";

    const bodyLength = this.getBodyLength();

    // Капот - открывается вверх-назад
    const hoodPivot = new THREE.Group();
    hoodPivot.name = "Hood_Hinge";
    hoodPivot.position.set(0, 1.2, -bodyLength / 2 + 1.0);

    const hood = new THREE.Mesh(
      new THREE.BoxGeometry(this.getBodyWidth() - 0.1, 0.1, 1.2),
      paint
    );
    hood.castShadow = true;
    hood.receiveShadow = true;
    hood.position.z = 0.6; // Смещение от оси вращения
    hood.userData = {
      partKey: "hood_lid",
      partName: "Крышка капота",
      category: "body",
      removable: true,
      condition: 100
    };

    hoodPivot.add(hood);
    lidsGroup.add(hoodPivot);

    this.articulation.hood = {
      pivot: hoodPivot,
      lid: hood,
      openAngle: 0,
      maxAngle: -Math.PI / 1.8
    };

    this.parts.hood_lid = { mesh: hood, condition: 100, removable: true };

    // Багажник - открывается вверх
    const trunkPivot = new THREE.Group();
    trunkPivot.name = "Trunk_Hinge";
    trunkPivot.position.set(0, 1.2, bodyLength / 2 - 0.6);

    const trunk = new THREE.Mesh(
      new THREE.BoxGeometry(this.getBodyWidth() - 0.1, 0.1, 0.7),
      paint
    );
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    trunk.position.z = -0.35;
    trunk.userData = {
      partKey: "trunk_lid",
      partName: "Крышка багажника",
      category: "body",
      removable: true,
      condition: 100
    };

    trunkPivot.add(trunk);
    lidsGroup.add(trunkPivot);

    this.articulation.trunk = {
      pivot: trunkPivot,
      lid: trunk,
      openAngle: 0,
      maxAngle: Math.PI / 1.8
    };

    this.parts.trunk_lid = { mesh: trunk, condition: 100, removable: true };

    this.carGroup.add(lidsGroup);
  }

  buildWindows() {
    const glassRetro = this.getMaterial('glass', 0x1a3a4a);
    const windowsGroup = new THREE.Group();
    windowsGroup.name = "Windows";

    const bodyWidth = this.getBodyWidth();

    // Передние окна
    const frontWindow = new THREE.Mesh(
      new THREE.BoxGeometry(bodyWidth - 0.3, 0.01, 1.2),
      glassRetro
    );
    frontWindow.position.set(0, 1.32, -0.8);
    frontWindow.userData = {
      partKey: "window_front",
      partName: "Переднее стекло",
      category: "glass",
      removable: true,
      condition: 100
    };
    windowsGroup.add(frontWindow);
    this.parts.window_front = { mesh: frontWindow, condition: 100, removable: true };

    // Боковые окна
    for (const x of [-1.55, 1.55]) {
      const sideWindow = new THREE.Mesh(
        new THREE.BoxGeometry(0.01, 0.4, 1.8),
        glassRetro
      );
      sideWindow.position.set(x, 1.15, 0.2);
      sideWindow.userData = {
        partKey: `window_side_${x > 0 ? 'r' : 'l'}`,
        partName: `Боковое окно ${x > 0 ? 'справа' : 'слева'}`,
        category: "glass",
        removable: true,
        condition: 100
      };
      windowsGroup.add(sideWindow);
      this.parts[sideWindow.userData.partKey] = { mesh: sideWindow, condition: 100, removable: true };
    }

    // Заднее окно
    const rearWindow = new THREE.Mesh(
      new THREE.BoxGeometry(bodyWidth - 0.3, 0.01, 0.8),
      glassRetro
    );
    rearWindow.position.set(0, 1.3, 1.4);
    rearWindow.userData = {
      partKey: "window_rear",
      partName: "Заднее стекло",
      category: "glass",
      removable: true,
      condition: 100
    };
    windowsGroup.add(rearWindow);
    this.parts.window_rear = { mesh: rearWindow, condition: 100, removable: true };

    this.carGroup.add(windowsGroup);
  }

  buildLights() {
    const lightsGroup = new THREE.Group();
    lightsGroup.name = "Lights";

    const bodyLength = this.getBodyLength();

    // Передние фары
    const headlight = this.getMaterial('headlight', 0xffeb3b);
    for (const x of [-1.2, 1.2]) {
      const light = new THREE.Mesh(
        new THREE.BoxGeometry(0.35, 0.3, 0.15),
        headlight
      );
      light.position.set(x, 0.75, -bodyLength / 2 - 0.18);
      light.castShadow = true;
      light.userData = {
        partKey: `headlight_${x > 0 ? 'r' : 'l'}`,
        partName: `Фара ${x > 0 ? 'справа' : 'слева'}`,
        category: "lights",
        removable: true,
        condition: 100
      };
      lightsGroup.add(light);
      this.parts[light.userData.partKey] = { mesh: light, condition: 100, removable: true };
    }

    // Задние фонари
    const taillight = this.getMaterial('taillight', 0xcc3333);
    for (const x of [-1.2, 1.2]) {
      const light = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.25, 0.1),
        taillight
      );
      light.position.set(x, 0.7, bodyLength / 2 + 0.18);
      light.castShadow = true;
      light.userData = {
        partKey: `taillight_${x > 0 ? 'r' : 'l'}`,
        partName: `Задний фонарь ${x > 0 ? 'справа' : 'слева'}`,
        category: "lights",
        removable: true,
        condition: 100
      };
      lightsGroup.add(light);
      this.parts[light.userData.partKey] = { mesh: light, condition: 100, removable: true };
    }

    this.carGroup.add(lightsGroup);
  }

  buildBumpers() {
    const chrome = this.getMaterial('chrome', 0xa8a8a8);
    const bumperGroup = new THREE.Group();
    bumperGroup.name = "Bumpers";

    const bodyLength = this.getBodyLength();
    const bodyWidth = this.getBodyWidth();

    // Передний бампер (снимаемый)
    const frontBumper = new THREE.Mesh(
      new THREE.BoxGeometry(bodyWidth + 0.3, 0.12, 0.25),
      chrome
    );
    frontBumper.position.set(0, 0.48, -bodyLength / 2 - 0.15);
    frontBumper.castShadow = true;
    frontBumper.userData = {
      partKey: "bumper_front",
      partName: "Передний бампер",
      category: "body",
      removable: true,
      condition: 100
    };
    bumperGroup.add(frontBumper);
    this.parts.bumper_front = { mesh: frontBumper, condition: 100, removable: true };

    // Задний бампер (снимаемый)
    const rearBumper = frontBumper.clone();
    rearBumper.position.z = bodyLength / 2 + 0.15;
    rearBumper.userData = {
      partKey: "bumper_rear",
      partName: "Задний бампер",
      category: "body",
      removable: true,
      condition: 100
    };
    bumperGroup.add(rearBumper);
    this.parts.bumper_rear = { mesh: rearBumper, condition: 100, removable: true };

    this.carGroup.add(bumperGroup);
  }

  buildWheels() {
    const wheelGroup = new THREE.Group();
    wheelGroup.name = "Wheels";

    const wheelRadius = 0.43;
    const wheelPositions = [
      { name: "FL", pos: [-1.34, 0.43, -1.52] },
      { name: "FR", pos: [1.34, 0.43, -1.52] },
      { name: "RL", pos: [-1.34, 0.43, 1.52] },
      { name: "RR", pos: [1.34, 0.43, 1.52] }
    ];

    const tireMat = this.getMaterial('tire', 0x0a0a0a);
    const rimMat = this.getMaterial('rim', 0xcccccc);
    const hubMat = this.getMaterial('chrome', 0xa8a8a8);

    for (const config of wheelPositions) {
      const wheelAssembly = new THREE.Group();
      wheelAssembly.name = `Wheel_${config.name}`;
      wheelAssembly.position.set(...config.pos);

      // Шина (съёмная)
      const tireGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, 0.28, 16);
      const tire = new THREE.Mesh(tireGeo, tireMat);
      tire.rotation.z = Math.PI / 2;
      tire.castShadow = true;
      tire.userData = {
        partKey: `tire_${config.name}`,
        partName: `Шина ${config.name}`,
        category: "wheels",
        removable: true,
        condition: 100
      };
      wheelAssembly.add(tire);
      this.parts[`tire_${config.name}`] = { 
        mesh: tire, 
        condition: 100, 
        removable: true,
        wheelAssembly: wheelAssembly 
      };

      // Диск (съёмный)
      const rimGeo = new THREE.CylinderGeometry(wheelRadius - 0.12, wheelRadius - 0.12, 0.3, 12);
      const rim = new THREE.Mesh(rimGeo, rimMat);
      rim.rotation.z = Math.PI / 2;
      rim.userData = {
        partKey: `rim_${config.name}`,
        partName: `Диск ${config.name}`,
        category: "wheels",
        removable: true,
        condition: 100
      };
      wheelAssembly.add(rim);
      this.parts[`rim_${config.name}`] = { 
        mesh: rim, 
        condition: 100, 
        removable: true,
        wheelAssembly: wheelAssembly 
      };

      // Центральный колпак
      const hubGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.32, 8);
      const hub = new THREE.Mesh(hubGeo, hubMat);
      hub.rotation.z = Math.PI / 2;
      wheelAssembly.add(hub);

      // Тормозной ротор (видно из-под колеса)
      const rotorGeo = new THREE.CylinderGeometry(wheelRadius - 0.08, wheelRadius - 0.08, 0.05, 12);
      const rotor = new THREE.Mesh(rotorGeo, this.getMaterial('rotor', 0x333333));
      rotor.rotation.z = Math.PI / 2;
      rotor.position.x = 0.2;
      rotor.userData = {
        partKey: `rotor_${config.name}`,
        partName: `Тормозной ротор ${config.name}`,
        category: "brakes",
        removable: true,
        condition: 100
      };
      wheelAssembly.add(rotor);
      this.parts[`rotor_${config.name}`] = { mesh: rotor, condition: 100, removable: true };

      wheelGroup.add(wheelAssembly);
      this.articulation.wheels[config.name] = {
        assembly: wheelAssembly,
        tire: tire,
        rim: rim
      };
    }

    this.carGroup.add(wheelGroup);
  }

  buildEngine() {
    const engineGroup = new THREE.Group();
    engineGroup.name = "Engine";

    // Двигатель (съёмный!) - видно в открытом капоте
    const engineBody = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.6, 1.0),
      this.getMaterial('engine', 0x1a1a1a)
    );
    engineBody.position.set(0, 1.5, -1.8);
    engineBody.castShadow = true;
    engineBody.userData = {
      partKey: "engine",
      partName: "Двигатель",
      category: "engine",
      removable: true,
      condition: 100,
      tunable: true
    };
    engineGroup.add(engineBody);
    this.parts.engine = { mesh: engineBody, condition: 100, removable: true };

    // Блок цилиндров
    for (let i = 0; i < 4; i++) {
      const cylinder = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.1, 0.4, 8),
        this.getMaterial('cylinder', 0x2a2a2a)
      );
      cylinder.position.set(-0.3 + i * 0.2, 1.85, -1.8);
      cylinder.rotation.z = Math.PI / 2;
      engineGroup.add(cylinder);
    }

    // Генератор
    const alternator = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.15, 0.3, 8),
      this.getMaterial('alternator', 0x4a4a4a)
    );
    alternator.position.set(0.7, 1.6, -1.8);
    alternator.rotation.z = Math.PI / 2;
    alternator.userData = {
      partKey: "alternator",
      partName: "Генератор",
      category: "engine",
      removable: true,
      condition: 100
    };
    engineGroup.add(alternator);
    this.parts.alternator = { mesh: alternator, condition: 100, removable: true };

    // Стартер
    const starter = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 0.25, 8),
      this.getMaterial('starter', 0x3a3a3a)
    );
    starter.position.set(-0.7, 1.4, -1.8);
    starter.rotation.z = Math.PI / 2;
    starter.userData = {
      partKey: "starter",
      partName: "Стартер",
      category: "engine",
      removable: true,
      condition: 100
    };
    engineGroup.add(starter);
    this.parts.starter = { mesh: starter, condition: 100, removable: true };

    this.carGroup.add(engineGroup);
    this.articulation.engine = { group: engineGroup, condition: 100 };
  }

  buildTransmission() {
    const transGroup = new THREE.Group();
    transGroup.name = "Transmission";

    const transmission = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.5, 1.2),
      this.getMaterial('transmission', 0x1a1a1a)
    );
    transmission.position.set(0, 1.2, -0.2);
    transmission.castShadow = true;
    transmission.userData = {
      partKey: "transmission",
      partName: "Коробка передач",
      category: "transmission",
      removable: true,
      condition: 100,
      tunable: true
    };
    transGroup.add(transmission);
    this.parts.transmission = { mesh: transmission, condition: 100, removable: true };

    this.carGroup.add(transGroup);
    this.articulation.transmission = { group: transGroup, condition: 100 };
  }

  buildSuspension() {
    const suspensionGroup = new THREE.Group();
    suspensionGroup.name = "Suspension";

    const suspPositions = [
      { name: "FL", pos: [-1.34, 0.5, -1.52] },
      { name: "FR", pos: [1.34, 0.5, -1.52] },
      { name: "RL", pos: [-1.34, 0.5, 1.52] },
      { name: "RR", pos: [1.34, 0.5, 1.52] }
    ];

    for (const config of suspPositions) {
      // Стойка амортизатора
      const strut = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 0.6, 8),
        this.getMaterial('suspension', 0x3a3a3a)
      );
      strut.position.set(...config.pos);
      strut.rotation.x = Math.PI / 6;
      strut.castShadow = true;
      strut.userData = {
        partKey: `strut_${config.name}`,
        partName: `Амортизатор ${config.name}`,
        category: "suspension",
        removable: true,
        condition: 100
      };
      suspensionGroup.add(strut);
      this.parts[`strut_${config.name}`] = { mesh: strut, condition: 100, removable: true };

      // Пружина
      const spring = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.12, 0.5, 8),
        this.getMaterial('spring', 0x2a2a2a)
      );
      spring.position.set(...config.pos);
      spring.position.y += 0.1;
      spring.userData = {
        partKey: `spring_${config.name}`,
        partName: `Пружина ${config.name}`,
        category: "suspension",
        removable: true,
        condition: 100
      };
      suspensionGroup.add(spring);
      this.parts[`spring_${config.name}`] = { mesh: spring, condition: 100, removable: true };
    }

    this.carGroup.add(suspensionGroup);
  }

  buildExhaust() {
    const exhaustGroup = new THREE.Group();
    exhaustGroup.name = "Exhaust";

    // Выхлопная труба
    const pipe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.1, 2.0, 8),
      this.getMaterial('exhaust', 0x1a1a1a)
    );
    pipe.position.set(0, 0.3, 1.8);
    pipe.rotation.x = Math.PI / 12;
    pipe.castShadow = true;
    pipe.userData = {
      partKey: "exhaust_pipe",
      partName: "Выхлопная труба",
      category: "exhaust",
      removable: true,
      condition: 100
    };
    exhaustGroup.add(pipe);
    this.parts.exhaust_pipe = { mesh: pipe, condition: 100, removable: true };

    // Глушитель
    const muffler = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 0.2, 0.4),
      this.getMaterial('muffler', 0x2a2a2a)
    );
    muffler.position.set(0, 0.25, 2.8);
    muffler.castShadow = true;
    muffler.userData = {
      partKey: "muffler",
      partName: "Глушитель",
      category: "exhaust",
      removable: true,
      condition: 100
    };
    exhaustGroup.add(muffler);
    this.parts.muffler = { mesh: muffler, condition: 100, removable: true };

    this.carGroup.add(exhaustGroup);
    this.articulation.exhaust = { group: exhaustGroup, condition: 100 };
  }

  buildInterior() {
    const interiorGroup = new THREE.Group();
    interiorGroup.name = "Interior";

    // Рулевое колесо
    const steering = new THREE.Mesh(
      new THREE.TorusGeometry(0.25, 0.05, 8, 32),
      this.getMaterial('steering', 0x1a1a1a)
    );
    steering.position.set(-0.4, 1.4, -0.8);
    steering.rotation.y = Math.PI / 4;
    steering.userData = {
      partKey: "steering_wheel",
      partName: "Рулевое колесо",
      category: "interior",
      removable: true,
      condition: 100
    };
    interiorGroup.add(steering);
    this.parts.steering_wheel = { mesh: steering, condition: 100, removable: true };

    // Сиденья
    for (const side of [-1, 1]) {
      const seat = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.4, 0.6),
        this.getMaterial('seat', 0x4a4a4a)
      );
      seat.position.set(side * 0.6, 1.0, -0.3);
      seat.castShadow = true;
      seat.userData = {
        partKey: `seat_${side > 0 ? 'r' : 'l'}`,
        partName: `Сидение ${side > 0 ? 'справа' : 'слева'}`,
        category: "interior",
        removable: true,
        condition: 100
      };
      interiorGroup.add(seat);
      this.parts[seat.userData.partKey] = { mesh: seat, condition: 100, removable: true };
    }

    this.carGroup.add(interiorGroup);
  }

  buildMirrors() {
    const mirrorGroup = new THREE.Group();
    mirrorGroup.name = "Mirrors";

    const chrome = this.getMaterial('chrome', 0xa8a8a8);

    for (const x of [-1.55, 1.55]) {
      const mirror = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, 0.2, 0.2),
        chrome
      );
      mirror.position.set(x, 1.1, -0.8);
      mirror.castShadow = true;
      mirror.userData = {
        partKey: `mirror_${x > 0 ? 'r' : 'l'}`,
        partName: `Зеркало ${x > 0 ? 'справа' : 'слева'}`,
        category: "body",
        removable: true,
        condition: 100
      };
      mirrorGroup.add(mirror);
      this.parts[mirror.userData.partKey] = { mesh: mirror, condition: 100, removable: true };
    }

    this.carGroup.add(mirrorGroup);
  }

  // ====== УТИЛИТЫ ======

  getMaterial(type, color = 0xcccccc) {
    const materials = {
      paint: () => new THREE.MeshStandardMaterial({
        color,
        metalness: 0.35,
        roughness: 0.45
      }),
      chrome: () => new THREE.MeshStandardMaterial({
        color,
        metalness: 0.85,
        roughness: 0.2
      }),
      glass: () => new THREE.MeshStandardMaterial({
        color,
        metalness: 0.05,
        roughness: 0.3,
        transparent: true,
        opacity: 0.8
      }),
      tire: () => new THREE.MeshStandardMaterial({
        color,
        roughness: 0.95
      }),
      rim: () => new THREE.MeshStandardMaterial({
        color,
        metalness: 0.7,
        roughness: 0.4
      }),
      rotor: () => new THREE.MeshStandardMaterial({
        color,
        metalness: 0.5,
        roughness: 0.6
      }),
      headlight: () => new THREE.MeshStandardMaterial({
        color,
        emissive: 0xffb300,
        emissiveIntensity: 0.8,
        roughness: 0.18
      }),
      taillight: () => new THREE.MeshStandardMaterial({
        color,
        emissive: 0x990000,
        emissiveIntensity: 0.7,
        roughness: 0.25
      }),
      engine: () => new THREE.MeshStandardMaterial({
        color,
        roughness: 0.9,
        metalness: 0.2
      }),
      cylinder: () => new THREE.MeshStandardMaterial({
        color,
        metalness: 0.6,
        roughness: 0.5
      }),
      alternator: () => new THREE.MeshStandardMaterial({
        color,
        metalness: 0.7,
        roughness: 0.4
      }),
      starter: () => new THREE.MeshStandardMaterial({
        color,
        metalness: 0.65,
        roughness: 0.45
      }),
      transmission: () => new THREE.MeshStandardMaterial({
        color,
        roughness: 0.8,
        metalness: 0.3
      }),
      suspension: () => new THREE.MeshStandardMaterial({
        color,
        metalness: 0.6,
        roughness: 0.5
      }),
      spring: () => new THREE.MeshStandardMaterial({
        color,
        metalness: 0.7,
        roughness: 0.4
      }),
      exhaust: () => new THREE.MeshStandardMaterial({
        color,
        metalness: 0.4,
        roughness: 0.7
      }),
      muffler: () => new THREE.MeshStandardMaterial({
        color,
        metalness: 0.3,
        roughness: 0.8
      }),
      steering: () => new THREE.MeshStandardMaterial({
        color,
        roughness: 0.6
      }),
      seat: () => new THREE.MeshStandardMaterial({
        color,
        roughness: 0.8
      })
    };

    return materials[type] ? materials[type]() : new THREE.MeshStandardMaterial({ color });
  }

  getBodyWidth() {
    return this.config.type === 'van' ? 3.2 : 3.04;
  }

  getBodyLength() {
    return this.config.type === 'van' ? 5.2 : this.config.type === 'truck' ? 4.8 : 4.98;
  }

  createRemovablePart(partKey, partName, category, geometry, material, position, parent) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = {
      partKey,
      partName,
      category,
      removable: true,
      condition: 100
    };

    parent.add(mesh);
    this.parts[partKey] = { mesh, condition: 100, removable: true };

    return mesh;
  }

  // ====== ВЗАИМОДЕЙСТВИЕ ======

  openDoor(doorName, targetAngle = null) {
    const door = this.articulation.doors[doorName];
    if (!door) return;

    door.targetAngle = targetAngle !== null ? targetAngle : door.maxAngle;
  }

  closeDoor(doorName) {
    const door = this.articulation.doors[doorName];
    if (!door) return;

    door.targetAngle = 0;
  }

  openHood(targetAngle = null) {
    if (!this.articulation.hood) return;
    this.articulation.hood.targetAngle = targetAngle !== null ? targetAngle : this.articulation.hood.maxAngle;
  }

  closeHood() {
    if (!this.articulation.hood) return;
    this.articulation.hood.targetAngle = 0;
  }

  openTrunk(targetAngle = null) {
    if (!this.articulation.trunk) return;
    this.articulation.trunk.targetAngle = targetAngle !== null ? targetAngle : this.articulation.trunk.maxAngle;
  }

  closeTrunk() {
    if (!this.articulation.trunk) return;
    this.articulation.trunk.targetAngle = 0;
  }

  removePart(partKey) {
    const part = this.parts[partKey];
    if (!part || !part.removable) return false;

    // Если часть не видна, не снимаем
    if (part.mesh && !part.mesh.visible) return false;

    part.mesh.visible = false;
    part.installed = false;
    return true;
  }

  installPart(partKey) {
    const part = this.parts[partKey];
    if (!part || !part.removable) return false;

    part.mesh.visible = true;
    part.installed = true;
    return true;
  }

  repairPart(partKey, amount = 100) {
    const part = this.parts[partKey];
    if (!part) return;

    part.condition = Math.min(100, (part.condition || 0) + amount);
    this.updatePartVisualCondition(partKey);
  }

  damagePart(partKey, amount = 10) {
    const part = this.parts[partKey];
    if (!part) return;

    part.condition = Math.max(0, (part.condition || 100) - amount);
    this.updatePartVisualCondition(partKey);
  }

  updatePartVisualCondition(partKey) {
    const part = this.parts[partKey];
    if (!part || !part.mesh) return;

    const condition = part.condition || 100;

    if (condition < 30) {
      // Сильное повреждение - ржавчина
      if (part.mesh.material) {
        if (Array.isArray(part.mesh.material)) {
          part.mesh.material.forEach(m => {
            m.color.setHex(0x8b4513);
            m.roughness = 1;
          });
        } else {
          part.mesh.material.color.setHex(0x8b4513);
          part.mesh.material.roughness = 1;
        }
      }
    } else if (condition < 60) {
      // Среднее повреждение
      if (part.mesh.material) {
        if (Array.isArray(part.mesh.material)) {
          part.mesh.material.forEach(m => m.roughness = 0.7);
        } else {
          part.mesh.material.roughness = 0.7;
        }
      }
    }
  }

  getPart(partKey) {
    return this.parts[partKey] || null;
  }

  getAllParts() {
    return this.parts;
  }

  updateArticulation(dt) {
    // Двери
    for (const door of Object.values(this.articulation.doors)) {
      if (door.targetAngle !== undefined) {
        door.openAngle = THREE.MathUtils.damp(
          door.openAngle,
          door.targetAngle,
          8,
          dt
        );
        door.pivot.rotation.y = door.openAngle;
      }
    }

    // Капот
    if (this.articulation.hood) {
      const hood = this.articulation.hood;
      if (hood.targetAngle !== undefined) {
        hood.openAngle = THREE.MathUtils.damp(hood.openAngle, hood.targetAngle, 8, dt);
        hood.pivot.rotation.x = hood.openAngle;
      }
    }

    // Багажник
    if (this.articulation.trunk) {
      const trunk = this.articulation.trunk;
      if (trunk.targetAngle !== undefined) {
        trunk.openAngle = THREE.MathUtils.damp(trunk.openAngle, trunk.targetAngle, 8, dt);
        trunk.pivot.rotation.x = trunk.openAngle;
      }
    }
  }

  getGroup() {
    return this.carGroup;
  }
}

export default RetroCarBuilder;
