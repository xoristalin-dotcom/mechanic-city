import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

export async function loadMechanicCityCoupe(){
  const response=await fetch("/models/challenger-r9.glb",{cache:"no-store"});
  if(!response.ok) throw new Error("MechanicCity Coupe model HTTP "+response.status);
  const buffer=await response.arrayBuffer();
  const loader=new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  if(MeshoptDecoder.ready) await MeshoptDecoder.ready;
  const model=await new Promise((resolve,reject)=>{
    loader.parse(buffer,"/models/",g=>resolve(g.scene),reject);
  });
  model.name="MechanicCity_Coupe_Repaired";
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
  const serviceParts={};
  const categoryFor=(name)=>{
    const n=name.toLowerCase();
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
      const category=categoryFor(o.name);
      const key=o.name.replace(/[^a-zA-Z0-9_-]/g,"_");
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
      const removable=!/glass|window|mirror|seat|dash|console|steering|pedal|shifter/.test(lower);
      o.userData.servicePart={key,name:o.name,category,subsystem,condition:100,installed:true,removable,tunable:["engine","brakes","wheels","suspension","exhaust","body"].includes(category)};
      serviceParts[key]=o.userData.servicePart;
    }
  });
  model.userData.serviceParts=serviceParts;
  model.userData.servicePartCount=Object.keys(serviceParts).length;
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
