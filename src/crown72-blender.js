import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

export async function loadCrown72Blender(){
  const response=await fetch("/models/challenger-r9.glb",{cache:"no-store"});
  if(!response.ok) throw new Error("Challenger R9 model HTTP "+response.status);
  const buffer=await response.arrayBuffer();
  const loader=new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  if(MeshoptDecoder.ready) await MeshoptDecoder.ready;
  const model=await new Promise((resolve,reject)=>{
    loader.parse(buffer,"/models/",g=>resolve(g.scene),reject);
  });
  model.name="MechanicCity_Challenger_R9";
  model.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(model);
  if(box.isEmpty()) throw new Error("Challenger R9 GLB contains no visible geometry");
  const size=box.getSize(new THREE.Vector3());
  const center=box.getCenter(new THREE.Vector3());
  const longest=Math.max(size.x,size.y,size.z);
  if(!Number.isFinite(longest)||longest<=0) throw new Error("Challenger R9 GLB has invalid bounds");
  const targetLength=4.95;
  const scale=targetLength/longest;
  model.scale.multiplyScalar(scale);
  model.position.x-=center.x*scale;
  model.position.y-=box.min.y*scale;
  model.position.z-=center.z*scale;
  model.updateMatrixWorld(true);
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
