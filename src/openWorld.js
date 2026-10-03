import * as THREE from "three";

function mat(color, roughness=.8, metalness=0){
  return new THREE.MeshStandardMaterial({color,roughness,metalness});
}
function box(scene,name,x,y,z,w,h,d,material,bevel=.08){
  const g=new THREE.Group(); g.name=name;
  const geo=new THREE.BoxGeometry(w,h,d);
  const m=new THREE.Mesh(geo,material); m.position.y=h/2; m.castShadow=true; m.receiveShadow=true; g.add(m);
  g.position.set(x,y,z); scene.add(g); return g;
}
function road(scene,x,z,w,d){
  const m=new THREE.Mesh(new THREE.PlaneGeometry(w,d),mat(0x292d31,.98));
  m.rotation.x=-Math.PI/2; m.position.set(x,.018,z); m.receiveShadow=true; scene.add(m);
  const edge=new THREE.Mesh(new THREE.PlaneGeometry(w,.10),mat(0x85827b,1));
  edge.rotation.x=-Math.PI/2; edge.position.set(x,.025,z-d/2+.22); scene.add(edge);
}
function marker(scene,id,label,x,z,color){
  const g=new THREE.Group(); g.name="District_"+id;
  const ring=new THREE.Mesh(new THREE.RingGeometry(4.2,4.45,48),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.42,side:THREE.DoubleSide}));
  ring.rotation.x=-Math.PI/2; ring.position.y=.035; g.add(ring);
  const post=new THREE.Mesh(new THREE.CylinderGeometry(.06,.06,2.5,8),mat(0x25282b,.55,.5)); post.position.y=1.25; g.add(post);
  const sign=new THREE.Mesh(new THREE.BoxGeometry(2.8,.8,.10),mat(color,.55,.2)); sign.position.set(0,2.4,0); g.add(sign);
  g.position.set(x,0,z); g.userData={district:id,label}; scene.add(g);
  return g;
}
function addGasStation(scene,x,z){
  const g=new THREE.Group(); g.name="GasStation";
  box(g,"Canopy",0,3,0,13,.35,6,mat(0xe4e0d6,.5,.1));
  box(g,"Shop",-3,0,-4,6,3.2,5,mat(0x8c8f91,.7,.05));
  for(const px of[-3,3]) box(g,"Pump",px,0,2,1.1,1.4,2,mat(0x34383b,.5,.5));
  const roof=new THREE.Mesh(new THREE.BoxGeometry(13,.2,6),mat(0xc6c9cb,.45,.15)); roof.position.y=3.35; g.add(roof);
  g.position.set(x,0,z); scene.add(g);
}
function addJunkyard(scene,x,z){
  const g=new THREE.Group(); g.name="Junkyard";
  box(g,"FenceBack",0,0,13,32,2.2,.18,mat(0x34383a,.95,.25));
  box(g,"Office",-11,0,-7,7,3,5,mat(0x55504a,.9));
  box(g,"Container",7,0,-7,8,2.6,3,mat(0x596267,.7,.45));
  const colors=[0x4b5154,0x6b5548,0x7a7370,0x30363a];
  for(let i=0;i<18;i++){
    const px=-12+(i%6)*4.8, pz=-4+Math.floor(i/6)*4.8;
    const c=new THREE.Mesh(new THREE.BoxGeometry(3.5,1.15,1.8),mat(colors[i%colors.length],.85,.15));
    c.position.set(px,.65,pz); c.rotation.y=(i%3)*.17; c.castShadow=true; g.add(c);
    const wheel=new THREE.Mesh(new THREE.TorusGeometry(.35,.10,8,14),mat(0x17191b,1)); wheel.rotation.y=Math.PI/2; wheel.position.set(px+1.8,.45,pz); g.add(wheel);
  }
  g.position.set(x,0,z); scene.add(g);
}
function addWorkshop(scene,x,z){
  const g=new THREE.Group(); g.name="WorkshopDistrict";
  box(g,"Building",0,0,0,18,5.2,11,mat(0x555b60,.72,.25));
  box(g,"Door",-0.1,0,-5.7,8,4.1,.35,mat(0x202428,.55,.55));
  for(const px of[-5,5]){ const lift=new THREE.Mesh(new THREE.BoxGeometry(.35,2.2,.35),mat(0x303438,.5,.65)); lift.position.set(px,1.1,2); g.add(lift); }
  g.position.set(x,0,z); scene.add(g);
}
function addDealer(scene,x,z){
  const g=new THREE.Group(); g.name="DealerDistrict";
  box(g,"Showroom",0,0,0,22,5.5,12,mat(0x7d8589,.55,.2));
  for(const px of[-7,0,7]){ const glass=new THREE.Mesh(new THREE.BoxGeometry(5.5,3.6,.08),new THREE.MeshStandardMaterial({color:0x18313c,roughness:.1,metalness:.2,transparent:true,opacity:.72})); glass.position.set(px,2.25,-6.05); g.add(glass); }
  g.position.set(x,0,z); scene.add(g);
}
function addGarage(scene,x,z){
  const g=new THREE.Group(); g.name="GarageDistrict";
  box(g,"Garage",0,0,0,16,4.2,10,mat(0x6b6d6b,.78,.12));
  box(g,"Rollup",-2,0,-5.2,7,3.2,.3,mat(0x272b2e,.55,.5));
  box(g,"Office",5,0,-5.2,4,3.2,.3,mat(0x1e3038,.2,.1));
  g.position.set(x,0,z); scene.add(g);
}
function addPark(scene,x,z){
  const g=new THREE.Group(); g.name="CentralPark";
  const ground=new THREE.Mesh(new THREE.CircleGeometry(20,48),new THREE.MeshStandardMaterial({color:0x3f7445,roughness:1})); ground.rotation.x=-Math.PI/2; ground.position.y=.02; g.add(ground);
  for(let i=0;i<28;i++){
    const t=new THREE.Mesh(new THREE.CylinderGeometry(.13,.18,1.8,7),mat(0x503a27,1)); t.position.set(Math.sin(i*2.1)*15,.9,Math.cos(i*1.7)*15); g.add(t);
    const crown=new THREE.Mesh(new THREE.IcosahedronGeometry(.9+(i%3)*.18,1),mat(0x4d824d,1)); crown.position.set(t.position.x,2.1,t.position.z); crown.castShadow=true; g.add(crown);
  }
  g.position.set(x,0,z); scene.add(g);
}
function addDistrictRoads(scene){
  for(const z of[-150,-100,-50,0,50,100,150]) road(scene,0,z,340,8);
  for(const x of[-150,-100,-50,0,50,100,150]) road(scene,x,0,8,340);
  const sidewalk=mat(0x777875,1);
  for(const x of[-150,-100,-50,0,50,100,150]) for(const z of[-150,-100,-50,0,50,100,150]){
    const p=new THREE.Mesh(new BoxGeometrySafe(7,.04,7),sidewalk); p.position.set(x,.02,z); scene.add(p);
  }
}
function BoxGeometrySafe(w,h,d){ return new THREE.BoxGeometry(w,h,d); }

export function installOpenWorld(scene){
  if(!scene || scene.userData.openWorldInstalled) return scene?.userData?.openWorld;
  scene.userData.openWorldInstalled=true;
  scene.userData.openWorld=true;
  const districts=[
    {id:"garage",label:"Гараж",x:-62,z:-54},
    {id:"workshop",label:"Мастерская",x:62,z:-54},
    {id:"junkyard",label:"Авторазборка",x:62,z:62},
    {id:"dealer",label:"Автосалон",x:-62,z:62},
    {id:"gas",label:"Заправка",x:0,z:-82},
    {id:"park",label:"Центральный парк",x:0,z:70},
    {id:"market",label:"Рынок",x:-82,z:0},
    {id:"jobs",label:"Сервисный район",x:82,z:0}
  ];
  scene.userData.openWorldDistricts=districts;
  const roads=[
    [0,0,340,12], [0,-50,340,9], [0,50,340,9],
    [-50,0,9,340], [50,0,9,340], [0,-100,340,8], [0,100,340,8],
    [-100,0,8,340], [100,0,8,340]
  ];
  for(const [x,z,w,d] of roads){
    const m=new THREE.Mesh(new THREE.PlaneGeometry(w,d),mat(0x292d31,.96));
    m.rotation.x=-Math.PI/2; m.position.set(x,.022,z); m.receiveShadow=true; scene.add(m);
  }
  const sidewalk=mat(0x72726e,1);
  for(let x=-160;x<=160;x+=50) for(const z of[-56,-44,44,56]){
    const s=new THREE.Mesh(new THREE.BoxGeometry(46,.06,2.6),sidewalk); s.position.set(x,.035,z); scene.add(s);
  }
  addGarage(scene,-62,-54);
  addWorkshop(scene,62,-54);
  addDealer(scene,-62,62);
  addJunkyard(scene,62,62);
  addGasStation(scene,0,-82);
  addPark(scene,0,70);
  for(const d of districts) marker(scene,d.id,d.label,d.x,d.z,0x74b7ff);
  const districtLight=mat(0x25292d,.6,.5);
  for(let i=-3;i<=3;i++){
    const p=new THREE.Mesh(new THREE.CylinderGeometry(.07,.09,5.5,8),districtLight); p.position.set(i*45,2.75,-47); p.castShadow=true; scene.add(p);
    const lamp=new THREE.Mesh(new THREE.SphereGeometry(.16,8,8),new THREE.MeshStandardMaterial({color:0xffedb0,emissive:0xffa52b,emissiveIntensity:.8})); lamp.position.set(i*45,5.45,-47); scene.add(lamp);
  }
  return districts;
}

export function updateOpenWorld(state,car,msg){
  const districts=car?.parent?.userData?.openWorldDistricts||car?.parent?.parent?.userData?.openWorldDistricts||[];
  if(!car||!districts.length)return null;
  let nearest=null,best=Infinity;
  for(const d of districts){
    const dist=Math.hypot(car.position.x-d.x,car.position.z-d.z);
    if(dist<best){best=dist;nearest=d;}
  }
  const current=best<9?nearest:null;
  if(state.openWorldDistrict!==current?.id){
    state.openWorldDistrict=current?.id||null;
    if(current) msg?.("📍 "+current.label+" — открытая локация");
  }
  return current;
}
