import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

export async function loadMechanicCityCoupe(){
  // Authoritative game model: Higgsfield 3D Jutsu Revision 18.
  // The GLB is committed to this repository at /public/models/preview.glb.
  const path=import.meta.env.VITE_MECHANIC_CITY_MODEL_URL || "/models/preview.glb";
  const response=await fetch(path,{cache:"no-store"});
  if(!response.ok) throw new Error("Mechanic City Revision 18 GLB unavailable: HTTP "+response.status+" "+path);
  const buffer=await response.arrayBuffer();
  const loader=new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  if(MeshoptDecoder.ready) await MeshoptDecoder.ready;
  const model=await new Promise((resolve,reject)=>{
    loader.parse(buffer,path,g=>resolve(g.scene),reject);
  });
  model.name="MechanicCity_Coupe_R18";
  model.userData.revision=18;
  model.userData.sourcePath=path;
  model.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(model);
  if(box.isEmpty()) throw new Error("MechanicCity Coupe GLB contains no visible geometry");
  const size=box.getSize(new THREE.Vector3());
  const center=box.getCenter(new THREE.Vector3());
  const longest=Math.max(size.x,size.y,size.z);
  if(!Number.isFinite(longest)||longest<=0) throw new Error("MechanicCity Coupe GLB has invalid bounds");
  const targetLength=4.95;
  const scale=targetLength/longest;
  model.scale.multiplyScalar(scale);
  model.position.x-=center.x*scale;
  model.position.y-=box.min.y*scale;
  model.position.z-=center.z*scale;
  model.updateMatrixWorld(true);
  const serviceParts={}; const keyCounts={};
  const groupCategory=(name)=>{
    const n=String(name||"").toUpperCase();
    if(n==="SERVICE_ENGINE") return "engine";
    if(n==="SERVICE_BRAKES") return "brakes";
    if(n==="SERVICE_WHEELS") return "wheels";
    if(n==="SERVICE_SUSPENSION") return "suspension";
    if(n==="SERVICE_BODY_PANELS") return "body";
    if(n==="TUNING_PARTS") return "tuning";
    return null;
  };
  const categoryFor=(name)=>{ 
    const n=name.toLowerCase();
    if(/gearbox|transmission|clutch|differential/.test(n)) return "transmission";
    if(/engine|injector|spark|intake|alternator|starter|water|thermostat|radiator|fuel|oil|coolant|battery|fuse|pump/.test(n)) return "engine";
    if(/brake|rotor|caliper|pad/.test(n)) return "brakes";
    if(/wheel|tire|rim|hub|lug/.test(n)) return "wheels";
    if(/suspension|strut|spring|arm|knuckle|tie|balljoint/.test(n)) return "suspension";
    if(/door|hood|trunk|bumper|fender|rocker|quarter|spoiler|sill|panel/.test(n)) return "body";
    if(/seat|dash|console|steering|pedal|shifter|interior/.test(n)) return "interior";
    if(/exhaust|muffler|resonator|catalyst|pipe|tip|header/.test(n)) return "exhaust";
    if(/head|tail|lamp|drl|marker|light|grille/.test(n)) return "lights";
    if(/glass|window|mirror/.test(n)) return "glass";
    return "other";
  };
  model.traverse(o=>{
    if(o.isMesh){
      let authoredCategory=null;
      let parent=o.parent;
      while(parent){
        authoredCategory=groupCategory(parent.name);
        if(authoredCategory) break;
        parent=parent.parent;
      }
      const category=authoredCategory==="tuning"?categoryFor(o.name):authoredCategory||categoryFor(o.name);
      const baseKey=o.name.replace(/[^a-zA-Z0-9_-]/g,"_"); const keyCount=keyCounts[baseKey]||0; keyCounts[baseKey]=keyCount+1; const key=keyCount?baseKey+"_"+keyCount:baseKey;
      const lower=o.name.toLowerCase();
      const subsystem=/radiator|coolant|water/.test(lower)?"cooling":
        /battery|alternator|starter|fuse/.test(lower)?"electrical":
        /gearbox|transmission|clutch|differential/.test(lower)?"transmission":
        /engine|injector|spark|intake|fuel|oil|pump/.test(lower)?"engine":
        /brake|rotor|caliper|pad/.test(lower)?"brakes":
        /suspension|strut|spring|arm|knuckle|tie|balljoint/.test(lower)?"suspension":
        /wheel|tire|rim|hub|lug/.test(lower)?"wheels":
        /door|hood|trunk|bumper|fender|rocker|quarter|spoiler|sill|panel/.test(lower)?"body":
        /exhaust|muffler|resonator|catalyst|pipe|tip|header/.test(lower)?"exhaust":"other";
      const structural=/^(chassis|floor_pan|underbody|body_shell)$/i.test(o.name) ||
        /^SERVICE_|^TUNING_PARTS$/i.test(o.name);
      const removable=!structural;
      o.userData.servicePart={
        key,name:o.name,category,subsystem,condition:100,installed:true,
        removable,
        tunable:["engine","brakes","wheels","suspension","exhaust","body","interior","lights","glass"].includes(category),
        interaction:"service_part",replacementMode:"swap_in_place"
      };
      serviceParts[key]=o.userData.servicePart;
    }
  });
  model.userData.serviceParts=serviceParts;
  model.userData.servicePartCount=Object.keys(serviceParts).length;
  model.userData.vehicleSpec={lengthMeters:4.881,widthMeters:1.921,heightMeters:1.326,revision:"Higgsfield-R18",editable:true};
  model.traverse(o=>{
    if(o.isMesh){
      o.castShadow=true;
      o.receiveShadow=true;
      o.frustumCulled=false;
      if(o.material){
        const materials=Array.isArray(o.material)?o.material:[o.material];
        for(const m of materials){
          m.needsUpdate=true;
          if("side" in m) m.side=THREE.FrontSide;
        }
      }
    }
  });
  return model;
}
