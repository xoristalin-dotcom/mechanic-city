import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
export async function loadCrown72Blender(){
  const response=await fetch("/models/crown72-v4.glb.gz",{cache:"force-cache"});
  if(!response.ok) throw new Error("Crown 72 Blender asset HTTP "+response.status);
  if(!("DecompressionStream" in globalThis)) throw new Error("gzip decompression is not supported");
  const compressed=await response.arrayBuffer();
  const stream=new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"));
  const buffer=await new Response(stream).arrayBuffer();
  return new Promise((resolve,reject)=>new GLTFLoader().parse(buffer,"/",g=>resolve(g.scene),reject));
}
