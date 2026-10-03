import * as THREE from "three";

const COLORS=[0x2d3136,0x8a2e2e,0x31547a,0x77736b,0xb08b3e,0x566b55];

function makeTrafficCar(color){
  const g=new THREE.Group();
  g.name="NPC_TrafficCar";
  const body=new THREE.Mesh(new THREE.BoxGeometry(1.65,.42,3.2),new THREE.MeshStandardMaterial({color,roughness:.28,metalness:.58}));
  body.position.y=.48; body.castShadow=true; g.add(body);
  const cabin=new THREE.Mesh(new THREE.BoxGeometry(1.38,.5,1.55),new THREE.MeshStandardMaterial({color:0x182026,roughness:.12,metalness:.18}));
  cabin.position.set(0,.79,.05); cabin.castShadow=true; g.add(cabin);
  for(const x of[-.86,.86])for(const z of[-1.02,1.02]){
    const w=new THREE.Mesh(new THREE.CylinderGeometry(.24,.24,.16,10),new THREE.MeshStandardMaterial({color:0x111315,roughness:.95}));
    w.rotation.z=Math.PI/2; w.position.set(x,.32,z); g.add(w);
  }
  return g;
}

export function installTraffic(scene){
  if(!scene||scene.userData.trafficInstalled)return scene?.userData?.trafficCars||[];
  scene.userData.trafficInstalled=true;
  const cars=[];
  const lanes=[
    {axis:"z",fixed:-50,dir:1},{axis:"z",fixed:50,dir:-1},
    {axis:"x",fixed:-100,dir:1},{axis:"x",fixed:100,dir:-1}
  ];
  let idx=0;
  for(const lane of lanes){
    for(let i=0;i<2;i++){
      const car=makeTrafficCar(COLORS[(idx++)%COLORS.length]);
      const offset=-120+i*120;
      if(lane.axis==="z") car.position.set(lane.fixed,.05,offset);
      else car.position.set(offset,.05,lane.fixed);
      car.userData.trafficSpeed=3.2+(idx%3)*.55;
      car.userData.axis=lane.axis;
      car.userData.dir=lane.dir;
      scene.add(car);
      cars.push(car);
    }
  }
  scene.userData.trafficCars=cars;
  return cars;
}

export function updateTraffic(cars,dt){
  for(const car of cars||[]){
    const speed=Number(car.userData?.trafficSpeed)||3;
    const dir=Number(car.userData?.dir)||1;
    if(car.userData.axis==="z"){
      car.position.z+=dt*speed*dir;
      if(car.position.z>165)car.position.z=-165;
      if(car.position.z<-165)car.position.z=165;
      car.rotation.y=dir>0?0:Math.PI;
    }else{
      car.position.x+=dt*speed*dir;
      if(car.position.x>165)car.position.x=-165;
      if(car.position.x<-165)car.position.x=165;
      car.rotation.y=dir>0?Math.PI/2:-Math.PI/2;
    }
    for(const child of car.children){
      if(child.name!=="")continue;
    }
  }
}