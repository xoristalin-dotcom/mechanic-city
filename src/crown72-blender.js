import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

export async function loadCrown72Blender(){
  const response=await fetch("/models/crown72-v4.glb",{cache:"no-store"});
  if(!response.ok) throw new Error("Crown 72 model HTTP "+response.status);
  const buffer=await response.arrayBuffer();
  const loader=new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  return new Promise((resolve,reject)=>loader.parse(buffer,"/",g=>resolve(g.scene),reject));
}