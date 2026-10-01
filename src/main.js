import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { loadMechanicCityCoupe } from "./crown72-blender.js";
import "./style.css";

// MATERIAL HELPERS — lightweight procedural detail, no external texture files.
function makeNoiseTexture(base="#777", dark="#555", light="#999", size=128){
  const c=document.createElement("canvas"); c.width=c.height=size;
  const ctx=c.getContext("2d");
  ctx.fillStyle=base; ctx.fillRect(0,0,size,size);
  for(let i=0;i<1800;i++){
    const v=Math.random();
    ctx.fillStyle=v<.42?dark:v>.88?light:base;
    const a=.05+Math.random()*.16;
    ctx.globalAlpha=a;
    const s=.5+Math.random()*2.4;
    ctx.fillRect(Math.random()*size,Math.random()*size,s,s);
  }
  ctx.globalAlpha=1;
  const tex=new THREE.CanvasTexture(c); tex.wrapS=tex.wrapT=THREE.RepeatWrapping; tex.colorSpace=THREE.SRGBColorSpace;
  return tex;
}
const roadTex=makeNoiseTexture("#383b3c","#252829","#56595a",128); roadTex.repeat.set(18,18);
const sidewalkTex=makeNoiseTexture("#777673","#646360","#8c8a85",128); sidewalkTex.repeat.set(12,12);
const buildingTex=makeNoiseTexture("#62625e","#4d4e4a","#77766f",128); buildingTex.repeat.set(3,4);
const metalTex=makeNoiseTexture("#3b3f42","#282c2f","#575c60",96); metalTex.repeat.set(3,3);

const app = document.querySelector("#app");
const saved = JSON.parse(localStorage.getItem("mechanic-city") || "null");
const state = saved || {money:18500,fuel:72,heat:82,damage:8,car:{name:"Crown 72",year:1972,mileage:214320,engine:68,condition:61,turbo:false,sportBrakes:false,wheels:"stock",oil:42,coolant:58,brakes:64,battery:77,suspension:70,tires:61,body:78},scene:"city",driving:false,speed:0,posX:0,posZ:10,steer:0,heading:0,gear:"P",onFoot:false,time:14,rain:false,job:null};
Object.assign(state,{driving:false,speed:0,steer:0,onFoot:false});
const input={gas:false,left:false,right:false,brake:false}; let lastSaveTick=-1;
state.posX??=0;state.posZ??=10;state.heading??=0;state.gear??="P";state.time??=14;state.rain??=false;state.job??=null;
state.car.oil??=42;state.car.coolant??=58;state.car.brakes??=state.car.condition;state.car.battery??=70;state.car.suspension??=state.car.condition;state.car.tires??=state.car.condition;state.car.body??=state.car.condition;state.car.parts??={};state.car.workshopIntroDone??=false;state.car.partState??={};state.car.selectedPart??=null;state.car.doorsOpen??=false;state.car.hoodOpen??=false;state.car.trunkOpen??=false;
const PART_STATE_VERSION=2;
state.car.partStateVersion??=0;
app.innerHTML=`<div class="game"><main id="viewport"></main><div id="orientation-lock"><div class="rotate-card"><span class="rotate-icon">📱↔️</span><h2>Поверни телефон горизонтально</h2><p>Mechanic City рассчитан на широкий экран.</p></div></div><div class="drive-hud"><div class="hud-top"><div class="round-btn">☰</div><div class="top-icons"><button id="mapBtn">⌖</button><button id="carInfo">⚙</button><button id="menuBtn">⋮</button></div></div><div class="speed-box"><b id="speed">0</b><small>KM/H</small><span id="gear">N</span></div><div class="fuel-box">⛽ <b id="fuel"></b>% &nbsp; 🌡 <b id="heat"></b>° &nbsp; 🕒 <b id="clock"></b></div><div class="mini-map"><div class="map-road"></div><div class="map-dot"></div></div><div class="steering-zone"><button class="steer left" data-drive="left">‹</button><button class="steer right" data-drive="right">›</button></div><div class="pedals"><button class="pedal brake" data-drive="brake">■</button><button class="pedal gas" data-drive="gas">▲</button></div><div class="drive-actions"><button id="horn">◉</button><button id="cameraBtn">▣</button><button id="fuelBtn">⛽</button><button id="serviceBtn">🔧</button><button id="doorsBtn">🚪</button><button id="hoodBtn">▱</button><button id="gearBtn">P</button><button id="exitBtn">♙</button></div><div id="message" class="message">Нажми ▲ и поехали</div></div><div id="menu" class="menu hidden"><div class="menu-card"><button data-scene="city">🏙️ Город</button><button data-scene="market">🚘 Рынок</button><button data-scene="junkyard">🛠️ Свалка</button><button data-scene="dealer">🏢 Автосалон</button><button data-scene="garage">🔧 Гараж</button><button data-scene="jobs">💼 Работа</button><button data-scene="settings">⚙️ Настройки</button></div></div><section id="panel" class="panel hidden"></section></div>`;
const viewport=document.querySelector("#viewport"),speedEl=document.querySelector("#speed"),gearEl=document.querySelector("#gear"),fuelEl=document.querySelector("#fuel"),heatEl=document.querySelector("#heat"),messageEl=document.querySelector("#message"),menu=document.querySelector("#menu"),panel=document.querySelector("#panel"),clockEl=document.querySelector("#clock");
let renderer,camera,car,scene,clock,traffic=[],trafficLights=[],smoke=[],rainDrops=[],jobMarker=null;const partRaycaster=new THREE.Raycaster();const partPointer=new THREE.Vector2();let cameraMode=0,camOrbitYaw=0,camOrbitPitch=.18,camDragging=false,camLastX=0,camLastY=0;let physicsWorld=null,vehicleController=null,chassisBody=null,physicsReady=false,physicsError="";const PHYSICS_Y=1.08;const cameraModeNames=["Вид сзади","Вид спереди","От первого лица"];
async function initPhysics(){await RAPIER.init();}
function resetPhysics(){if(vehicleController){try{vehicleController.free();}catch{}}vehicleController=null;chassisBody=null;physicsWorld=null;physicsReady=false;}
function setupVehiclePhysics(){if(!RAPIER||!car)throw new Error("Rapier or car is not ready");resetPhysics();physicsWorld=new RAPIER.World({x:0,y:-9.81,z:0});const ground=RAPIER.ColliderDesc.cuboid(110,.08,110).setFriction(.95);physicsWorld.createCollider(ground);for(const b of[RAPIER.ColliderDesc.cuboid(110,2,.25).setTranslation(0,2,110),RAPIER.ColliderDesc.cuboid(110,2,.25).setTranslation(0,2,-110),RAPIER.ColliderDesc.cuboid(.25,2,110).setTranslation(110,2,0),RAPIER.ColliderDesc.cuboid(.25,2,110).setTranslation(-110,2,0)])physicsWorld.createCollider(b);const desc=RAPIER.RigidBodyDesc.dynamic().setTranslation(state.posX,PHYSICS_Y,state.posZ).setLinearDamping(.08).setAngularDamping(1.5).setCcdEnabled(true).setCanSleep(false);chassisBody=physicsWorld.createRigidBody(desc);const chassis=RAPIER.ColliderDesc.cuboid(1.18,.42,2.18).setMass(1180).setFriction(.78);physicsWorld.createCollider(chassis,chassisBody);vehicleController=physicsWorld.createVehicleController(chassisBody);if(typeof vehicleController.setIndexForwardAxis==="function")vehicleController.setIndexForwardAxis(2);const wheelPos=[[-1.27,-.34,-1.5],[1.27,-.34,-1.5],[-1.27,-.34,1.5],[1.27,-.34,1.5]];for(const p of wheelPos)vehicleController.addWheel({x:p[0],y:p[1],z:p[2]},{x:0,y:-1,z:0},{x:1,y:0,z:0},.34,.39);for(let i=0;i<4;i++){vehicleController.setWheelSuspensionStiffness(i,30);vehicleController.setWheelSuspensionCompression(i,5);vehicleController.setWheelSuspensionRelaxation(i,6);vehicleController.setWheelMaxSuspensionForce(i,12000);if(typeof vehicleController.setWheelMaxSuspensionTravel==="function")vehicleController.setWheelMaxSuspensionTravel(i,.24);vehicleController.setWheelFrictionSlip(i,1.35);if(typeof vehicleController.setWheelSideFrictionStiffness==="function")vehicleController.setWheelSideFrictionStiffness(i,1.45);}physicsReady=true;}
function partCategoryLabel(c){return ({engine:"Двигатель",brakes:"Тормоза",wheels:"Колёса",suspension:"Подвеска",body:"Кузов",interior:"Салон",exhaust:"Выхлоп",lights:"Свет",glass:"Стёкла",other:"Другое"})[c]||c;}
function partCondition(key){const p=state.car.partState?.[key]?.condition;return typeof p==="number"?p:100;}
function partInstalled(key){return state.car.partState?.[key]?.installed!==false;}
function setPartState(key,patch){state.car.partState??={};state.car.partState[key]={condition:partCondition(key),installed:partInstalled(key),...patch};}
function mechanicalHealth(){const parts=car?.userData?.serviceParts||{};const groups={engine:[],cooling:[],electrical:[],transmission:[],brakes:[],wheels:[],suspension:[]};for(const p of Object.values(parts)){if(groups[p.subsystem])groups[p.subsystem].push(p);else if(groups[p.category])groups[p.category].push(p);}const avg=a=>a.length?a.reduce((s,p)=>s+partCondition(p.key)*(partInstalled(p.key)?1:0),0)/(a.length*100):1;return{engine:Math.max(.05,avg(groups.engine)),brakes:Math.max(.08,avg(groups.brakes)),suspension:Math.max(.15,avg(groups.suspension)),wheels:Math.max(.15,avg(groups.wheels)),cooling:Math.max(.1,avg(groups.cooling)),electrical:Math.max(.1,avg(groups.electrical)),transmission:Math.max(.1,avg(groups.transmission))};}
function repairSelectedPart(key){const part=car?.userData?.serviceParts?.[key];if(!part)return;const before=partCondition(key);const cost=Math.max(80,Math.round((100-before)*22));if(before>=100){openPanel("Деталь исправна","<p><b>"+part.name+"</b><br>"+partCategoryLabel(part.category)+"<br>Состояние: 100%</p>");return;}if(state.money<cost){openPanel("Недостаточно денег","<p>Ремонт <b>"+part.name+"</b> стоит "+cost.toLocaleString("ru-RU")+" ₽.</p>");return;}state.money-=cost;setPartState(key,{condition:100,installed:true});part.installed=true;save();openPartPanel(part);msg("🔧 "+part.name+" восстановлена и установлена");}
function removeSelectedPart(key){const part=car?.userData?.serviceParts?.[key];if(!part||!part.removable)return;if(!partInstalled(key)){openPartPanel(part);return;}if(state.driving){msg("⛔ Сначала останови машину");return;}setPartState(key,{installed:false});part.installed=false;car.traverse(o=>{if(o.userData?.servicePart?.key===key)o.visible=false;});save();openPartPanel(part);msg("🔩 "+part.name+" снята");}
function installSelectedPart(key){const part=car?.userData?.serviceParts?.[key];if(!part)return;if(partInstalled(key)){openPartPanel(part);return;}setPartState(key,{installed:true});part.installed=true;car.traverse(o=>{if(o.userData?.servicePart?.key===key)o.visible=true;});save();openPartPanel(part);msg("🛠️ "+part.name+" установлена");}
function tuneSelectedPart(key){const part=car?.userData?.serviceParts?.[key];if(!part||!part.tunable)return;const tuneKey="tune_"+key;if(state.car.parts[tuneKey]){openPanel("Уже установлено","<p>Для <b>"+part.name+"</b> уже установлена улучшенная версия.</p>");return;}const cost=part.category==="engine"?2400:part.category==="brakes"?1500:part.category==="wheels"?2200:part.category==="suspension"?1800:part.category==="exhaust"?1900:1200;if(state.money<cost){openPanel("Недостаточно денег","<p>Улучшение стоит "+cost.toLocaleString("ru-RU")+" ₽.</p>");return;}state.money-=cost;state.car.parts[tuneKey]=true;state.car.condition=Math.min(100,state.car.condition+3);save();openPartPanel(part);msg("⚙️ "+part.name+" модернизирована");}
function openPartPanel(part){
  const c=partCondition(part.key),installed=partInstalled(part.key);
  const cost=Math.max(80,Math.round((100-c)*22));
  const action=installed&&part.removable
    ? "<button id='removeSelected'>🔩 Снять деталь</button>"
    : "<button id='installSelected'>🛠️ Установить деталь</button>";
  const tune=part.tunable&&installed
    ? "<button id='tuneSelected'>⚙️ Тюнинг узла</button>"
    : "";
  const html="<p><b>"+part.name+"</b></p><p>Узел: "+partCategoryLabel(part.category)+"<br>Подсистема: "+part.subsystem+"<br>Состояние: <b>"+c+"%</b><br>Статус: <b>"+(installed?"Установлена":"Снята")+"</b></p><div class='parts'>"+action+"<button id='repairSelected'>🔧 Починить — "+cost.toLocaleString("ru-RU")+" ₽</button>"+tune+"</div>";
  openPanel("Деталь автомобиля",html);
  document.querySelector("#removeSelected")?.addEventListener("click",()=>removeSelectedPart(part.key));
  document.querySelector("#installSelected")?.addEventListener("click",()=>installSelectedPart(part.key));
  document.querySelector("#repairSelected")?.addEventListener("click",()=>repairSelectedPart(part.key));
  document.querySelector("#tuneSelected")?.addEventListener("click",()=>tuneSelectedPart(part.key));
}
function installPartInteraction(){viewport.addEventListener("pointerdown",e=>{if(!["city","workshop"].includes(state.scene)||!car||!renderer)return;const r=renderer.domElement.getBoundingClientRect();partPointer.x=((e.clientX-r.left)/r.width)*2-1;partPointer.y=-((e.clientY-r.top)/r.height)*2+1;partRaycaster.setFromCamera(partPointer,camera);const meshes=[];car.traverse(o=>{if(o.isMesh&&o.visible)meshes.push(o);});const hit=partRaycaster.intersectObjects(meshes,false)[0];if(!hit?.object?.userData?.servicePart)return;state.car.selectedPart=hit.object.userData.servicePart.key;openPartPanel(hit.object.userData.servicePart);},{passive:true});}
function setupImportedWheelSteering(model){
  model.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3()),min=box.min.clone();
  const bodyMat=new THREE.MeshStandardMaterial({color:0x7a3f2e,roughness:.42,metalness:.35});
  const tireMat=new THREE.MeshStandardMaterial({color:0x17191b,roughness:.82,metalness:.04});
  const hubMat=new THREE.MeshStandardMaterial({color:0x777b80,roughness:.38,metalness:.72});
  const frontX=min.x+size.x*.79,rearX=min.x+size.x*.21,wheelY=min.y+size.y*.25,sideZ=Math.max(.54,size.z*.34);
  const radius=Math.max(.23,Math.min(size.y*.18,.31)),width=Math.max(.13,Math.min(size.z*.10,.20)),wheels=[];
  const wheel=(x,z,front)=>{
    const p=new THREE.Group();p.name=front?"FrontWheelSteerPivot":"RearWheelPivot";p.position.set(x,wheelY,z);
    const cover=new THREE.Mesh(new THREE.CylinderGeometry(radius*1.08,radius*1.08,width*.62,28),bodyMat);cover.rotation.x=Math.PI/2;
    const tire=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,width,24),tireMat);tire.rotation.x=Math.PI/2;tire.castShadow=true;
    const hub=new THREE.Mesh(new THREE.CylinderGeometry(radius*.43,radius*.43,width*1.08,20),hubMat);hub.rotation.x=Math.PI/2;hub.castShadow=true;
    p.add(cover,tire,hub);model.add(p);wheels.push(p);
  };
  wheel(frontX,-sideZ,true);wheel(frontX,sideZ,true);wheel(rearX,-sideZ,false);wheel(rearX,sideZ,false);
  const doors=[],doorW=size.x*.22,doorH=size.y*.38,doorT=Math.max(.055,size.z*.035),doorY=min.y+size.y*.43,doorZ=Math.max(.50,size.z*.505);
  const addDoor=(x,side,front)=>{
    const p=new THREE.Group();p.name=(front?"Front":"Rear")+(side<0?"Left":"Right")+"DoorHinge";p.position.set(front?x+doorW*.5:x-doorW*.5,doorY,side*doorZ);
    const panel=new THREE.Mesh(new RoundedBoxGeometry(doorW,doorH,doorT,4,.055),bodyMat);panel.position.x=front?-doorW*.5:doorW*.5;panel.position.z=side<0?doorT*.18:-doorT*.18;panel.castShadow=true;p.add(panel);model.add(p);doors.push({pivot:p,open:0,side,front});
  };
  addDoor(min.x+size.x*.63,-1,true);addDoor(min.x+size.x*.63,1,true);addDoor(min.x+size.x*.39,-1,false);addDoor(min.x+size.x*.39,1,false);
  const hood=new THREE.Group();hood.name="HoodHinge";hood.position.set(min.x+size.x*.77,min.y+size.y*.78,0);
  const hp=new THREE.Mesh(new RoundedBoxGeometry(size.x*.25,size.y*.075,size.z*.92,4,.045),bodyMat);hp.position.x=-size.x*.125;hp.position.y=.015;hp.castShadow=true;hood.add(hp);model.add(hood);
  const trunk=new THREE.Group();trunk.name="TrunkHinge";trunk.position.set(min.x+size.x*.22,min.y+size.y*.72,0);
  const tp=new THREE.Mesh(new RoundedBoxGeometry(size.x*.22,size.y*.065,size.z*.9,4,.04),bodyMat);tp.position.x=size.x*.11;tp.position.y=.015;tp.castShadow=true;trunk.add(tp);model.add(trunk);
  const steering=new THREE.Group();steering.name="SteeringWheel";steering.position.set(min.x+size.x*.66,min.y+size.y*.48,0);
  const sw=new THREE.Mesh(new THREE.TorusGeometry(Math.max(.16,radius*.62),Math.max(.035,radius*.09),10,24),hubMat);sw.rotation.y=Math.PI/2;steering.add(sw);model.add(steering);
  return {wheels,doors,hood,trunk,steering};
}
function updateArticulatedCar(dt){
  const a=car?.userData?.articulation;if(!a)return;
  const target=state.car.doorsOpen?1:0;
  for(const d of a.doors){d.open=THREE.MathUtils.damp(d.open,target,7,dt);d.pivot.rotation.y=(d.front?-1:1)*d.side*1.08*d.open;}
  a.hood.rotation.z=THREE.MathUtils.damp(a.hood.rotation.z,state.car.hoodOpen?-.82:0,7,dt);
  a.trunk.rotation.z=THREE.MathUtils.damp(a.trunk.rotation.z,state.car.trunkOpen?.72:0,7,dt);
  a.steering.rotation.x=THREE.MathUtils.damp(a.steering.rotation.x,-state.steer*.62,9,dt);
}
function physicsDrive(dt){
 if(!physicsReady||!physicsWorld||!chassisBody){fallbackDrive(dt);return;}
 const steerInput=(input.left?1:0)+(input.right?-1:0);
 const throttle=input.gas&&(state.gear==="D"||state.gear==="R");
 const reverse=state.gear==="R";
 const speed=Math.abs(state.speed);

 // Car-like steering: steering input is smoothed, then converted to a yaw rate.
 const maxSteer=THREE.MathUtils.degToRad(36);
 state.steer=THREE.MathUtils.damp(state.steer,steerInput,6.5,dt);
 const steerAngle=state.steer*maxSteer*(1-Math.min(speed/22,.38));
 const wheelbase=2.95;
 const yawRate=speed>0.15?(state.speed/wheelbase)*Math.tan(steerAngle):0;
 state.heading+=yawRate*dt;

 // Smooth throttle, coasting and braking.
 const mh=mechanicalHealth();
 const maxForward=16*mh.engine*mh.transmission*mh.wheels;
 const maxReverse=7.5*mh.engine*mh.transmission*mh.wheels;
 const target=throttle?(reverse?-maxReverse:maxForward):0;
 const accel=throttle?(reverse?4.8:5.8):2.2;
 state.speed=THREE.MathUtils.damp(state.speed,target,accel,dt);
 if(input.brake)state.speed=THREE.MathUtils.damp(state.speed,0,9.5*mh.brakes,dt);
 if(!throttle&&!input.brake&&Math.abs(state.speed)<.08)state.speed=0;

 const forwardX=-Math.sin(state.heading);
 const forwardZ=-Math.cos(state.heading);
 const v=chassisBody.linvel();
 chassisBody.setLinvel({x:forwardX*state.speed,y:v.y,z:forwardZ*state.speed},true);
 chassisBody.setAngvel({x:0,y:0,z:0},true);
 physicsWorld.step();

 const p=chassisBody.translation();
 state.posX=p.x;
 state.posZ=p.z;
 car.position.set(p.x,p.y-PHYSICS_Y+(car.userData?.visualOffsetY||0),p.z);
 car.rotation.y=state.heading;

 for(const w of(car.userData?.wheels||[])){
   if(!w?.rotation)continue;
   // Wheel pivots are in the imported model's local frame, so steer around
   // the vertical axis without moving the wheel away from the axle.
   w.rotation.y=steerAngle;
 }
}
function fallbackDrive(dt){const throttle=input.gas&&(state.gear==="D"||state.gear==="R"),reverse=state.gear==="R",steer=(input.left?1:0)+(input.right?-1:0);const accel=throttle?(reverse?-10:10):0;state.speed=THREE.MathUtils.damp(state.speed,accel?Math.sign(accel)*Math.min(Math.abs(state.speed)+Math.abs(accel)*dt,12):0,accel?2.8:4.5,dt);if(input.brake)state.speed=THREE.MathUtils.damp(state.speed,0,8,dt);state.heading+=steer*dt*(0.9+Math.min(Math.abs(state.speed),8)*.08);const forward=new THREE.Vector3(-Math.sin(state.heading),0,-Math.cos(state.heading));state.posX+=forward.x*state.speed*dt;state.posZ+=forward.z*state.speed*dt;state.posX=THREE.MathUtils.clamp(state.posX,-106,106);state.posZ=THREE.MathUtils.clamp(state.posZ,-106,106);car.position.set(state.posX,0,state.posZ);car.rotation.y=state.heading;for(const w of(car.userData?.wheels||[]))w.rotation.y=steer*THREE.MathUtils.degToRad(36); }
async function swapToBlenderCrown72(){
 try{
   const model=await loadMechanicCityCoupe();
   model.name="MechanicCity_Coupe_Repaired";
   model.traverse(o=>{
     if(o.isMesh){
       o.castShadow=true;
       o.receiveShadow=true;
       o.userData.workshopRest={
         p:o.position.clone(),
         r:o.rotation.clone(),
         s:o.scale.clone()
       };
     }
   });
   const root=new THREE.Group();
   root.name="MechanicCity_Coupe_Repaired_Root";
   root.position.copy(car.position);
   root.position.y+=0.42;
   root.rotation.copy(car.rotation);
   root.userData.wheels=[];
   root.userData.visualOffsetY=0.42;
   root.userData.articulation=setupImportedWheelSteering(model);
   root.userData.wheels=root.userData.articulation.wheels;
   root.userData.serviceParts=model.userData.serviceParts||{};

   // City spawn is always assembled. Saved installed/removed state controls
   // visibility only; workshop is the only mode allowed to move parts apart.
   if(state.car.partStateVersion!==PART_STATE_VERSION){
     state.car.partState={};
     state.car.partStateVersion=PART_STATE_VERSION;
   }
   for(const p of Object.values(root.userData.serviceParts)){
     const saved=state.car.partState?.[p.key];
     const condition=typeof saved?.condition==="number"?saved.condition:100;
     p.installed=saved?.installed===false?false:true;
     setPartState(p.key,{condition,installed:p.installed});
   }
   model.traverse(o=>{
     const p=o.userData?.servicePart;
     const r=o.userData?.workshopRest;
     if(r){
       o.position.copy(r.p);
       o.rotation.copy(r.r);
       o.scale.copy(r.s);
     }
     if(p)o.visible=p.installed!==false;
   });
   save();

   // The imported coupe faces -X, while the game vehicle faces -Z.
   model.rotation.y=Math.PI/2;

   root.add(model);
   const old=car;
   car=root;
   scene.add(car);
   scene.remove(old);
   if(physicsReady&&chassisBody){
     const p=chassisBody.translation();
     car.position.set(p.x,p.y-PHYSICS_Y,p.z);
   }
   msg("🚗 MechanicCity Coupe Repaired загружена — машина собрана");
 }catch(err){
   window.MechanicCityDebugLog?.({type:"blender-model",message:String(err?.message||err),stack:String(err?.stack||"")});
   console.warn("Blender Crown 72 load failed; procedural fallback remains.",err);
 }}
function save(){localStorage.setItem("mechanic-city",JSON.stringify(state));}
function clearJobMarker(){if(jobMarker&&scene){scene.remove(jobMarker);jobMarker=null;}}
function createJobMarker(){clearJobMarker();if(!state.job||!scene)return;const g=new THREE.Group();const ring=new THREE.Mesh(new THREE.TorusGeometry(2.4,.1,10,32),new THREE.MeshBasicMaterial({color:0xffc84a,transparent:true,opacity:.9}));ring.rotation.x=-Math.PI/2;const beam=new THREE.Mesh(new THREE.CylinderGeometry(.06,.32,5.5,12,1,true),new THREE.MeshBasicMaterial({color:0xffc84a,transparent:true,opacity:.18,side:THREE.DoubleSide}));beam.position.y=2.7;g.add(ring,beam);g.position.set(state.job.targetX,.08,state.job.targetZ);scene.add(g);jobMarker=g;}
function updateJob(){if(!state.job||!state.driving)return;const d=Math.hypot(state.posX-state.job.targetX,state.posZ-state.job.targetZ);if(jobMarker){jobMarker.rotation.y+=.012;jobMarker.position.y=.08+Math.sin(performance.now()*.003)*.12;}if(d<4.5){if(state.damage<70){state.money+=state.job.reward;const reward=state.job.reward;state.job=null;clearJobMarker();save();msg("✅ Заказ выполнен: +"+reward+" ₽");}else{msg("❌ Машина слишком сильно повреждена.");state.job=null;clearJobMarker();save();}}}
function installVisualInspectMode(){
  const params=new URLSearchParams(location.search);
  if(params.get("inspect")!=="1")return;
  const errors=[];
  window.addEventListener("error",e=>errors.push(String(e.message||e.error||"unknown error")));
  window.addEventListener("unhandledrejection",e=>errors.push(String(e.reason?.message||e.reason||"unhandled rejection")));
  window.MechanicCityInspect={
    version:2,
    getState:()=>({
      scene:state.scene,
      position:{x:state.posX,z:state.posZ},
      speed:state.speed,
      heading:state.heading,
      gear:state.gear,
      fuel:state.fuel,
      heat:state.heat,
      damage:state.damage,
      car:{...state.car},
      cameraMode,
      cameraModeName:cameraModeNames[cameraMode],
      viewport:{width:viewport.clientWidth,height:viewport.clientHeight},
      physicsReady,
      physicsError,
      errors:errors.slice(-10)
    }),
    screenshot:()=>renderer?.domElement?.toDataURL("image/png")||null,
    setCamera:(n)=>{
      cameraMode=Math.max(0,Math.min(2,Number(n)||0));
      camOrbitYaw=0;camOrbitPitch=.18;
      if(camera){camera.fov=cameraMode===2?82:cameraMode===1?68:62;camera.updateProjectionMatrix();}
      return window.MechanicCityInspect.getState();
    },
    setScene:(name)=>{
      if(["city","garage","market","junkyard","dealer","jobs","settings"].includes(name))renderScene(name);
      return window.MechanicCityInspect.getState();
    }
  };
  const requestedCamera=params.get("camera");
  if(requestedCamera!==null)window.MechanicCityInspect.setCamera(requestedCamera);
  const requestedScene=params.get("scene");
  if(requestedScene&&requestedScene!=="city")window.MechanicCityInspect.setScene(requestedScene);
}
function installAITestMode(){
if(new URLSearchParams(location.search).get("test")!=="1")return;
window.MechanicCityTest={
version:1,
getState:()=>({scene:state.scene,position:{x:state.posX,z:state.posZ},speed:state.speed,heading:state.heading,gear:state.gear,fuel:state.fuel,heat:state.heat,damage:state.damage,car:{...state.car},cameraMode,cameraModeName:cameraModeNames[cameraMode],physicsReady,physicsError}),
action:(name,value)=>{
if(name==="gas"){input.gas=!!value;if(value&&state.fuel>0){if(state.gear==="P"||state.gear==="N")state.gear="D";state.driving=true;}}
else if(name==="brake"){input.brake=!!value;}
else if(name==="left"){input.left=!!value;if(value)state.driving=true;}
else if(name==="right"){input.right=!!value;if(value)state.driving=true;}
else if(name==="gear"){if(["P","R","N","D"].includes(value)){state.gear=value;if(value==="D"||value==="R")state.driving=true;if(value==="P")state.driving=false;}}
else if(name==="camera"){const n=Math.max(0,Math.min(2,Number(value)));cameraMode=n;camOrbitYaw=0;camOrbitPitch=.18;if(camera){camera.fov=n===2?82:n===1?68:62;camera.updateProjectionMatrix();}}
else if(name==="scene"&&["city","garage","market","junkyard","dealer","jobs","settings"].includes(value))renderScene(value);
else if(name==="refuel"){state.fuel=100;save();}
else if(name==="repair"){state.damage=0;state.car.condition=100;save();}
return window.MechanicCityTest.getState();
}
};
const box=document.createElement("div");box.id="ai-test-panel";box.style.cssText="position:fixed;top:8px;left:8px;z-index:99999;background:rgba(0,0,0,.82);color:#fff;padding:8px;font:12px monospace;border-radius:8px;max-width:320px;pointer-events:auto";
box.innerHTML="<b>AI TEST MODE</b><pre id='ai-test-state'></pre><div style='display:grid;grid-template-columns:repeat(3,1fr);gap:4px'><button data-a='left'>←</button><button data-a='gas'>GAS</button><button data-a='right'>→</button><button data-a='brake'>BRAKE</button><button data-c='0'>REAR</button><button data-c='1'>FRONT</button><button data-c='2'>FIRST</button></div>";
document.body.appendChild(box);
box.querySelectorAll("[data-a]").forEach(b=>{const a=b.dataset.a;b.onpointerdown=e=>{e.preventDefault();window.MechanicCityTest.action(a,true)};b.onpointerup=e=>{e.preventDefault();window.MechanicCityTest.action(a,false)};b.onpointercancel=()=>window.MechanicCityTest.action(a,false);});
box.querySelectorAll("[data-c]").forEach(b=>b.onclick=()=>window.MechanicCityTest.action("camera",b.dataset.c));
setInterval(()=>{const s=window.MechanicCityTest.getState();const el=document.querySelector("#ai-test-state");if(el)el.textContent=JSON.stringify(s,null,2).slice(0,2400)},250);
}
function msg(t){messageEl.textContent=t;}
function stats(){speedEl.textContent=Math.round(state.speed*62);gearEl.textContent=state.gear||"P";fuelEl.textContent=Math.round(state.fuel);heatEl.textContent=Math.round(state.heat);clockEl.textContent=String(Math.floor(state.time)).padStart(2,"0")+":"+String(Math.floor((state.time%1)*60)).padStart(2,"0");if(state.job&&!state.onFoot&&messageEl.textContent.startsWith("▲"))messageEl.textContent="💼 "+state.job.label+" • до жёлтого маркера";}
function makeCar(color=0x7a3f2e,detailedLights=true){
 const g=new THREE.Group();
 const paint=new THREE.MeshStandardMaterial({color,metalness:.48,roughness:.30});
 const paintDark=new THREE.MeshStandardMaterial({color:new THREE.Color(color).multiplyScalar(.72),metalness:.42,roughness:.34});
 const chrome=new THREE.MeshStandardMaterial({color:0xc7cbc8,metalness:.92,roughness:.18});
 const darkChrome=new THREE.MeshStandardMaterial({color:0x24282a,metalness:.72,roughness:.24});
 const glass=new THREE.MeshStandardMaterial({color:0x263b43,metalness:.10,roughness:.16});
 const rubber=new THREE.MeshStandardMaterial({color:0x08090a,roughness:.96});
 const light=new THREE.MeshStandardMaterial({color:0xfff2c9,emissive:0xff9d24,emissiveIntensity:1.05,roughness:.18});
 const tail=new THREE.MeshStandardMaterial({color:0xa3161c,emissive:0x3b0004,emissiveIntensity:.55,roughness:.25});

 // Main slab + sill. Keep the deliberately faceted low-poly language.
 const body=new THREE.Mesh(new RoundedBoxGeometry(3.04,.66,4.98,4,.11),paint);
 body.position.y=.62; body.castShadow=true; body.receiveShadow=true; g.add(body);
 const lower=new THREE.Mesh(new RoundedBoxGeometry(2.92,.27,4.78,4,.07),paintDark);
 lower.position.set(0,.42,.04); lower.castShadow=true; g.add(lower);

 // Long hood and short trunk, with visible panel separation.
 const hood=new THREE.Mesh(new RoundedBoxGeometry(2.68,.22,1.62,4,.06),paint);
 hood.position.set(0,.99,-1.57); hood.castShadow=true; g.add(hood);
 const hoodEdge=new THREE.Mesh(new THREE.BoxGeometry(2.48,.035,.055),chrome);
 hoodEdge.position.set(0,1.105,-2.38); g.add(hoodEdge);
 const hoodBulge=new THREE.Mesh(new RoundedBoxGeometry(.82,.10,1.22,2,.035),paintDark);
 hoodBulge.position.set(0,1.105,-1.58); g.add(hoodBulge);
 const trunk=new THREE.Mesh(new RoundedBoxGeometry(2.58,.24,1.04,4,.06),paint);
 trunk.position.set(0,.96,1.82); trunk.castShadow=true; g.add(trunk);

 // Sloped greenhouse: a simple faceted trapezoid instead of a rounded box.
 const cabinGeo=new THREE.BufferGeometry();
 cabinGeo.setAttribute("position",new THREE.Float32BufferAttribute([
   -1.06,.98,-.80,  1.06,.98,-.80,  1.06,.98,1.38,  -1.06,.98,1.38,
   -.80,1.66,-.43,  .80,1.66,-.43,  .80,1.66,1.08,  -.80,1.66,1.08
 ],3));
 cabinGeo.setIndex([
   0,1,5, 0,5,4,
   1,2,6, 1,6,5,
   2,3,7, 2,7,6,
   3,0,4, 3,4,7,
   4,5,6, 4,6,7,
   3,2,1, 3,1,0
 ]);
 cabinGeo.computeVertexNormals();
 const cabin=new THREE.Mesh(cabinGeo,paint);
 cabin.castShadow=true; cabin.receiveShadow=true; g.add(cabin);
 const roof=new THREE.Mesh(new THREE.BoxGeometry(1.62,.10,1.62),paint);
 roof.position.set(0,1.68,.32); roof.rotation.x=0; g.add(roof);

 function quadMesh(vertices,material){
   const geo=new THREE.BufferGeometry();
   geo.setAttribute("position",new THREE.Float32BufferAttribute(vertices,3));
   geo.setIndex([0,1,2,0,2,3]);
   geo.computeVertexNormals();
   const m=new THREE.Mesh(geo,material);
   g.add(m); return m;
 }
 // Front/rear windshields follow the sloped greenhouse.
 quadMesh([
   -.82,1.48,-.51,  .82,1.48,-.51,  .86,1.62,-.42, -.86,1.62,-.42
 ],glass);
 quadMesh([
   -.86,1.62,1.07,  .86,1.62,1.07,  .82,1.48,1.30, -.82,1.48,1.30
 ],glass);
 // Large side windows, split by a visible B-pillar.
 for(const side of[-1,1]){
   const x=side;
   quadMesh([
     x*1.015,1.16,-.38, x*1.015,1.16,.34, x*.82,1.58,.26, x*.82,1.58,-.30
   ],glass);
   quadMesh([
     x*1.015,1.16,.47, x*1.015,1.16,1.18, x*.82,1.58,1.02, x*.82,1.58,.57
   ],glass);
   for(const z of[-.34,.50,1.20]){
     const pillar=new THREE.Mesh(new THREE.BoxGeometry(.085,.68,.085),paintDark);
     pillar.position.set(side*1.02,1.36,z);
     pillar.rotation.z=side<0?-.06:.06;
     g.add(pillar);
   }
 }
 // Thin roof edge and bright trim make the silhouette read clearly at distance.
 const roofTrim=new THREE.Mesh(new THREE.BoxGeometry(1.74,.045,1.74),chrome);
 roofTrim.position.set(0,1.69,.32); g.add(roofTrim);
 // Characteristic bright belt line and door seams.
 const belt=new THREE.Mesh(new THREE.BoxGeometry(2.84,.055,3.42),chrome);
 belt.position.set(0,.99,.24); g.add(belt);
 for(const x of[-1.445,1.445]){
   const sideLine=new THREE.BoxGeometry(.035,.06,3.72);
   const line=new THREE.Mesh(sideLine,chrome); line.position.set(x,.74,.20); g.add(line);
 }
 for(const z of[-.72,.60]){
   const seam=new THREE.Mesh(new THREE.BoxGeometry(.018,.58,.025),darkChrome);
   seam.position.set(-1.455,.94,z); g.add(seam);
   const seam2=seam.clone(); seam2.position.x=1.455; g.add(seam2);
 }

 // Separate, chunky fenders visually frame the wheels.
 for(const x of[-1.34,1.34]) for(const z of[-1.48,1.48]){
   const fender=new THREE.Mesh(new THREE.TorusGeometry(.52,.085,7,18,Math.PI),paint);
   fender.rotation.y=Math.PI/2;
   fender.position.set(x,.60,z);
   fender.scale.set(1,1,.92);
   g.add(fender);
 }

 const grille=new THREE.Mesh(new RoundedBoxGeometry(1.55,.34,.10,3,.025),darkChrome);
 grille.position.set(0,.69,-2.55); g.add(grille);
 for(let i=-5;i<=5;i++){
   const bar=new THREE.Mesh(new THREE.BoxGeometry(.055,.20,.035),chrome);
   bar.position.set(i*.12,.69,-2.595); g.add(bar);
 }
 const frontBumper=new THREE.Mesh(new RoundedBoxGeometry(2.68,.18,.18,3,.04),chrome);
 frontBumper.position.set(0,.48,-2.58); g.add(frontBumper);
 const rearBumper=frontBumper.clone(); rearBumper.position.z=2.60; g.add(rearBumper);

 for(const x of[-.86,.86]){
   const h=new THREE.Mesh(new THREE.CylinderGeometry(.29,.29,.10,20),light);
   h.rotation.x=Math.PI/2; h.position.set(x,.78,-2.58); g.add(h);
   const bezel=new THREE.Mesh(new THREE.TorusGeometry(.31,.035,8,20),chrome);
   bezel.rotation.x=Math.PI/2; bezel.position.set(x,.78,-2.635); g.add(bezel);
   const t=new THREE.Mesh(new THREE.BoxGeometry(.68,.20,.08),tail);
   t.position.set(x,.76,2.57); g.add(t);
   const tbar=new THREE.Mesh(new THREE.BoxGeometry(.045,.17,.035),chrome);
   tbar.position.set(x,.76,2.62); g.add(tbar);
 }

 for(const x of[-1.40,1.40]){
   const mirror=new THREE.Mesh(new RoundedBoxGeometry(.20,.14,.30,5,.04),chrome);
   mirror.position.set(x,1.17,-.56); g.add(mirror);
   const handle=new THREE.Mesh(new RoundedBoxGeometry(.22,.045,.055,4,.015),chrome);
   handle.position.set(x,.99,.48); g.add(handle);
 }
 const plateMat=new THREE.MeshStandardMaterial({color:0xe8e4d8,roughness:.55});
 const frontPlate=new THREE.Mesh(new RoundedBoxGeometry(.62,.18,.035,3,.015),plateMat);
 frontPlate.position.set(0,.57,-2.67); g.add(frontPlate);
 const rearPlate=frontPlate.clone(); rearPlate.position.z=2.67; g.add(rearPlate);

 const wheelParts=[];
 for(const x of[-1.34,1.34]) for(const z of[-1.52,1.52]){
   const wg=new THREE.Group(); wg.position.set(x,.43,z);
   const tire=new THREE.Mesh(new THREE.CylinderGeometry(.43,.43,.30,12),rubber);
   tire.rotation.z=Math.PI/2; tire.castShadow=true; wg.add(tire);
   const rim=new THREE.Mesh(new THREE.CylinderGeometry(.255,.255,.31,12),chrome);
   rim.rotation.z=Math.PI/2; wg.add(rim);
   const hub=new THREE.Mesh(new THREE.CylinderGeometry(.10,.10,.32,10),darkChrome);
   hub.rotation.z=Math.PI/2; wg.add(hub);
   wheelParts.push(wg); g.add(wg);
 }

 const rearLip=new THREE.Mesh(new RoundedBoxGeometry(2.20,.10,.20,5,.035),paint);
 rearLip.position.set(0,.99,2.10); g.add(rearLip);
 for(const x of[-.48,.48]){
   const ex=new THREE.Mesh(new THREE.CylinderGeometry(.065,.075,.25,12),chrome);
   ex.rotation.x=Math.PI/2; ex.position.set(x,.42,2.66); g.add(ex);
 }

 g.userData.wheels=wheelParts;
 return g;
}
function updateCarDamage(){if(!car)return;const mark=car.userData.damageMark;if(mark)mark.visible=state.damage>25;if(state.damage>65&&smoke.length===0)for(let i=0;i<5;i++){const p=new THREE.Mesh(new THREE.SphereGeometry(.08+Math.random()*.05,8,8),new THREE.MeshBasicMaterial({color:0x555555,transparent:true,opacity:.45}));p.position.set((Math.random()-.5)*.3,.9,2);scene.add(p);smoke.push(p);}smoke.forEach((p,i)=>{p.position.y+=.01;p.scale.multiplyScalar(1.008);p.material.opacity*=.995;if(p.material.opacity<.03){scene.remove(p);smoke.splice(i,1);}});}
function addTree(x,z,s=1){const g=new THREE.Group();const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.14*s,.2*s,2.2*s,8),new THREE.MeshStandardMaterial({color:0x4b3423,roughness:1}));trunk.position.y=1.1*s;g.add(trunk);const crown=new THREE.Mesh(new THREE.IcosahedronGeometry(1.12*s,1),new THREE.MeshStandardMaterial({color:0x2e5732,roughness:.95}));crown.castShadow=true;crown.position.y=2.5*s;g.add(crown);scene.add(g);}
function addTrafficLight(x,z){const pole=new THREE.Mesh(new THREE.CylinderGeometry(.06,.06,3.1,8),new THREE.MeshStandardMaterial({color:0x202326,roughness:.55,metalness:.5}));pole.position.set(x+4,1.55,z+4);scene.add(pole);const housing=new THREE.Mesh(new THREE.BoxGeometry(.34,.9,.34),new THREE.MeshStandardMaterial({color:0x101214,roughness:.45}));housing.position.set(x+4,2.65,z+4);scene.add(housing);const red=new THREE.Mesh(new THREE.SphereGeometry(.09,10,8),new THREE.MeshBasicMaterial({color:0x220000}));const yellow=new THREE.Mesh(new THREE.SphereGeometry(.09,10,8),new THREE.MeshBasicMaterial({color:0x332600}));const green=new THREE.Mesh(new THREE.SphereGeometry(.09,10,8),new THREE.MeshBasicMaterial({color:0x002200}));red.position.set(x+4,2.91,z+4);yellow.position.set(x+4,2.65,z+4);green.position.set(x+4,2.39,z+4);scene.add(red,yellow,green);trafficLights.push({red,yellow,green,z});}
function addRain(){rainDrops=[];const positions=new Float32Array(180*3);for(let i=0;i<180;i++){positions[i*3]=(Math.random()-.5)*100;positions[i*3+1]=Math.random()*38+2;positions[i*3+2]=(Math.random()-.5)*100;}const geo=new THREE.BufferGeometry();geo.setAttribute("position",new THREE.BufferAttribute(positions,3));const mat=new THREE.PointsMaterial({color:0x9fc5dd,size:.16,transparent:true,opacity:.48,sizeAttenuation:true});const rain=new THREE.Points(geo,mat);scene.add(rain);rainDrops.push(rain);}
const buildingWindowMats={lit:new THREE.MeshStandardMaterial({color:0xffd98a,emissive:0xffa52b,emissiveIntensity:.75,roughness:.25,metalness:.05}),dark:new THREE.MeshStandardMaterial({color:0x1b2930,roughness:.25,metalness:.05}),frame:new THREE.MeshStandardMaterial({color:0x34393d,metalness:.35,roughness:.45})};
function addBuilding(x,z,w,h,d,color){const g=new THREE.Group();const mat=new THREE.MeshStandardMaterial({color,roughness:.68,metalness:.04,map:buildingTex});const b=new THREE.Mesh(new RoundedBoxGeometry(w,h,d,3,.08),mat);b.position.y=h/2;b.castShadow=true;b.receiveShadow=true;g.add(b);const roof=new THREE.Mesh(new RoundedBoxGeometry(w+.22,.18,d+.22,3,.04),new THREE.MeshStandardMaterial({color:0x25282b,roughness:.65,metalness:.15,map:metalTex}));roof.position.y=h+.09;roof.castShadow=true;g.add(roof);const rows=Math.max(1,Math.floor(h/1.8)),cols=Math.max(1,Math.floor(w/1.55));for(let r=0;r<rows;r++)for(let q=0;q<cols;q++){const lit=(r*3+q*5)%7<2;const win=new THREE.Mesh(new RoundedBoxGeometry(.58,.68,.035,2,.04),lit?buildingWindowMats.lit:buildingWindowMats.dark);win.position.set(-w/2+.78+q*(w-1.3)/Math.max(1,cols-1),.9+r*1.55,d/2+.025);g.add(win);const win2=win.clone();win2.position.z=-d/2-.025;win2.rotation.y=Math.PI;g.add(win2);}g.position.set(x,0,z);scene.add(g);}
function addParkedCar(x,z,color){const g=new THREE.Group();const paint=new THREE.MeshStandardMaterial({color,roughness:.25,metalness:.62,envMapIntensity:.8});const body=new THREE.Mesh(new RoundedBoxGeometry(1.7,.42,3.15,5,.12),paint);body.position.y=.45;g.add(body);const cabin=new THREE.Mesh(new RoundedBoxGeometry(1.42,.48,1.5,5,.12),new THREE.MeshStandardMaterial({color:0x1a2024,roughness:.12,metalness:.18}));cabin.position.set(0,.76,.08);g.add(cabin);for(const xw of[-.84,.84])for(const zw of[-.98,.98]){const w=new THREE.Mesh(new THREE.CylinderGeometry(.25,.25,.18,12),new THREE.MeshStandardMaterial({color:0x090a0b,roughness:.95}));w.rotation.z=Math.PI/2;w.position.set(xw,.32,zw);g.add(w);}g.position.set(x,.05,z);scene.add(g);}
function addStreetProps(){for(let i=-8;i<=8;i+=2){const bin=new THREE.Mesh(new RoundedBoxGeometry(.5,.8,.5,3,.08),new THREE.MeshStandardMaterial({color:0x263238,roughness:.9,map:metalTex}));bin.position.set(i*4,.4,18+(i%3)*2);bin.castShadow=true;scene.add(bin);}const colors=[0x6d7882,0x7f3131,0x66724a,0x27394a,0x8c744c];for(let i=0;i<22;i++)addParkedCar((i%6)*13-32,Math.floor(i/6)*24-54,colors[i%colors.length]);}

function workshopPartOffset(part){
  const n=part.name.toLowerCase();
  if(part.category==="wheels") return new THREE.Vector3(n.includes("_fl")||n.includes("_rl")? -2.8:2.8, .55, n.includes("_f")? -1.2:1.2);
  if(part.category==="engine") return new THREE.Vector3(-.15,1.9,-2.1);
  if(part.category==="transmission") return new THREE.Vector3(.15,1.55,-.2);
  if(part.category==="brakes") return new THREE.Vector3(n.includes("_l")?-2.5:2.5,1.05,n.includes("_f")?-2.0:1.7);
  if(part.category==="suspension") return new THREE.Vector3(n.includes("_l")?-2.4:2.4,1.35,n.includes("_f")?-1.4:1.3);
  if(part.category==="exhaust") return new THREE.Vector3(0,.7,2.8);
  if(part.category==="interior") return new THREE.Vector3(0,2.1,.8);
  if(part.category==="lights") return new THREE.Vector3(n.includes("head")?0:0,1.35,n.includes("head")?-2.9:2.9);
  if(part.category==="glass") return new THREE.Vector3(n.includes("side")?(n.includes("_l")?-2.4:2.4):0,1.7,n.includes("rear")?2.6:-2.6);
  if(part.category==="body"){
    if(/door/.test(n)) return new THREE.Vector3(n.includes("_l")?-2.3:2.3,1.0,n.includes("front")?-.65:.75);
    if(/hood/.test(n)) return new THREE.Vector3(0,1.55,-3.0);
    if(/trunk/.test(n)) return new THREE.Vector3(0,1.45,3.0);
    if(/bumper/.test(n)) return new THREE.Vector3(0,.75,n.includes("front")?-3.2:3.2);
  }
  return new THREE.Vector3((Math.random()-.5)*3.8,1.2,(Math.random()-.5)*4.8);
}
function disassembleWorkshopCar(){
  if(!car)return;
  car.userData.workshopDisassembled=true;
  const model=car.children.find(o=>o.name==="MechanicCity_Coupe_Repaired");
  if(!model)return;
  model.traverse(o=>{
    const p=o.userData?.servicePart;
    if(!o.isMesh||!p)return;
    if(!o.userData.workshopRest)o.userData.workshopRest={p:o.position.clone(),r:o.rotation.clone(),s:o.scale.clone()};
    if(/^(chassis|floor_pan|underbody|body_shell)$/i.test(o.name))return;
    const off=workshopPartOffset(p);
    o.position.copy(o.userData.workshopRest.p).add(off);
  });
}
function assembleWorkshopCar(){
  if(!car)return;
  const model=car.children.find(o=>o.name==="MechanicCity_Coupe_Repaired");
  model?.traverse(o=>{
    const r=o.userData?.workshopRest;
    if(r){o.position.copy(r.p);o.rotation.copy(r.r);o.scale.copy(r.s);}
  });
  car.userData.workshopDisassembled=false;
  state.car.workshopIntroDone=true;
  state.onFoot=false;
  save();
  msg("🔧 Машина собрана. Можно выезжать из мастерской.");
  renderScene("city");
}
function buildWorkshop(){
  stop();
  clearJobMarker();
  traffic=[];trafficLights=[];smoke=[];rainDrops=[];
  scene=new THREE.Scene();
  scene.background=new THREE.Color(0x1a1d20);
  camera=new THREE.PerspectiveCamera(52,Math.max(1,viewport.clientWidth)/Math.max(1,viewport.clientHeight),.1,120);
  viewport.innerHTML="";
  const probe=document.createElement("canvas");
  const gl=probe.getContext("webgl2",{alpha:false,antialias:false})||probe.getContext("webgl",{alpha:false,antialias:false});
  if(!gl){window.MechanicCityWebGLError="WebGL context unavailable";renderEmergencyScene();return;}
  renderer=new THREE.WebGLRenderer({canvas:probe,context:gl,antialias:false,alpha:false});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
  renderer.setSize(Math.max(1,viewport.clientWidth),Math.max(1,viewport.clientHeight),false);
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
  renderer.domElement.style.width="100%";renderer.domElement.style.height="100%";renderer.domElement.style.display="block";
  viewport.appendChild(renderer.domElement);
  setupCameraControls();
  const hemi=new THREE.HemisphereLight(0xb9c9d8,0x16181a,1.35);scene.add(hemi);
  const key=new THREE.DirectionalLight(0xffffff,2.1);key.position.set(5,10,-7);key.castShadow=true;key.shadow.mapSize.set(1024,1024);scene.add(key);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(32,24),new THREE.MeshStandardMaterial({color:0x34383b,roughness:.92,map:metalTex}));
  floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
  const platform=new THREE.Mesh(new THREE.BoxGeometry(7.2,.18,8.2),new THREE.MeshStandardMaterial({color:0x555b60,metalness:.35,roughness:.5,map:metalTex}));
  platform.position.y=.15;platform.receiveShadow=true;scene.add(platform);
  for(const x of[-2.8,2.8])for(const z of[-3.1,3.1]){
    const post=new THREE.Mesh(new THREE.BoxGeometry(.18,1.55,.18),new THREE.MeshStandardMaterial({color:0x202428,metalness:.7,roughness:.28}));
    post.position.set(x,.92,z);post.castShadow=true;scene.add(post);
  }
  const lift=new THREE.Mesh(new THREE.BoxGeometry(6.5,.22,7.5),new THREE.MeshStandardMaterial({color:0x202428,metalness:.72,roughness:.32}));
  lift.position.y=1.05;lift.castShadow=true;scene.add(lift);
  car=makeCar(0x252b31);
  car.position.set(0,1.48,0);
  car.rotation.y=0;
  scene.add(car);
  car.userData.workshopMode=true;
  swapToBlenderCrown72().then(()=>{
    if(!car?.userData?.serviceParts)return;
    disassembleWorkshopCar();
    msg("🔧 Машина разобрана на подъёмнике. Выбери деталь для работы.");
  }).catch(err=>window.MechanicCityDebugLog?.({type:"workshop-load",message:String(err?.message||err)}));
  const label=document.createElement("div");
  label.className="workshop-hud";
  label.innerHTML="<div><b>МАСТЕРСКАЯ</b><span>Автомобиль разобран на подъёмнике</span></div><button id='assembleBtn'>🔩 Собрать автомобиль</button>";
  viewport.appendChild(label);
  document.querySelector("#assembleBtn").onclick=assembleWorkshopCar;
  clock=new THREE.Clock();
  const loop=()=>{
    if(state.scene!=="workshop"||!renderer||!scene||!camera)return;
    requestAnimationFrame(loop);
    const dt=Math.min(clock.getDelta(),.05);
    if(car?.userData?.workshopDisassembled)updateArticulatedCar(dt);
    camera.position.lerp(new THREE.Vector3(8.8,5.8,9.4),.06);
    camera.lookAt(new THREE.Vector3(0,1.1,0));
    renderer.render(scene,camera);
  };
  loop();
}

function buildCity(){clearJobMarker();traffic=[];trafficLights=[];smoke=[];rainDrops=[];scene=new THREE.Scene();const night=state.time<6||state.time>=20,evening=state.time>=18&&state.time<20;scene.background=new THREE.Color(night?0x101a2b:evening?0x53606d:0x7893a3);scene.fog=new THREE.Fog(night?0x101a2b:evening?0x53606d:0x7893a3,35,190);camera=new THREE.PerspectiveCamera(58,Math.max(1,viewport.clientWidth)/Math.max(1,viewport.clientHeight),.1,260);
viewport.innerHTML="";
try{
  const probe=document.createElement("canvas");
  const glAttrs={alpha:false,antialias:false,depth:true,stencil:false,preserveDrawingBuffer:false,powerPreference:"default"};
  const gl=probe.getContext("webgl2",glAttrs)||probe.getContext("webgl",glAttrs);
  if(!gl)throw new Error("WebGL context unavailable");
  renderer=new THREE.WebGLRenderer({canvas:probe,context:gl,antialias:false,alpha:false,preserveDrawingBuffer:false});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
  renderer.setSize(Math.max(1,viewport.clientWidth),Math.max(1,viewport.clientHeight),false);
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate=true;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.22;
  renderer.domElement.style.display="block";
  renderer.domElement.style.width="100%";
  renderer.domElement.style.height="100%";
  viewport.appendChild(renderer.domElement);
  window.MechanicCityWebGL={ok:true,version:gl.getParameter(gl.VERSION),renderer:gl.getParameter(gl.RENDERER)};
  renderer.domElement.addEventListener("webglcontextlost",(event)=>{event.preventDefault();console.warn("WebGL context lost");msg("⚠️ Графика временно потеряла связь — перезапусти игру.");},{passive:false});
  renderer.domElement.addEventListener("webglcontextrestored",()=>{console.info("WebGL context restored");try{renderer.setSize(Math.max(1,viewport.clientWidth),Math.max(1,viewport.clientHeight),false);msg("🎮 Графика восстановлена");}catch{}});
}catch(err){
  renderer=null;
  window.MechanicCityWebGLError=String(err?.message||err);
  console.error("WebGL renderer creation failed",err);
  viewport.innerHTML="<div class='graphics-error'><b>3D-графика не запустилась</b><span>"+String(err?.message||err)+"</span></div>";
  document.querySelector(".drive-hud").style.display="none";
  return;
}
try{setupCameraControls();}catch(err){window.MechanicCityBootError=String(err?.message||err);console.error("Camera setup failed",err);}
const hemi=new THREE.HemisphereLight(night?0x5d6f8d:0xbdd6e8,0x283029,night?.8:1.35);scene.add(hemi);const sun=new THREE.DirectionalLight(night?0x7d91b8:0xffead0,night?.65:2.6);sun.position.set(-45,75,35);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-85;sun.shadow.camera.right=85;sun.shadow.camera.top=85;sun.shadow.camera.bottom=-85;scene.add(sun);
const groundMat=new THREE.MeshStandardMaterial({color:0x50534f,roughness:.96,map:sidewalkTex});const ground=new THREE.Mesh(new THREE.PlaneGeometry(220,220),groundMat);ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);const roadMat=new THREE.MeshStandardMaterial({color:0x343738,roughness:.9,map:roadTex});for(const z of[-70,-35,0,35,70]){const road=new THREE.Mesh(new THREE.PlaneGeometry(220,10),roadMat);road.rotation.x=-Math.PI/2;road.position.set(0,.04,z);road.receiveShadow=true;scene.add(road);}for(const x of[-70,-35,0,35,70]){const road=new THREE.Mesh(new THREE.PlaneGeometry(10,220),roadMat);road.rotation.x=-Math.PI/2;road.position.set(x,.045,0);road.receiveShadow=true;scene.add(road);} 
for(const z of[-70,-35,0,35,70])for(const side of[-1,1]){for(let k=-3;k<=3;k++){const stripe=new THREE.Mesh(new THREE.BoxGeometry(7,.025,.34),new THREE.MeshBasicMaterial({color:0xd9d7cc}));stripe.position.set(k*1.05,.085,z+side*5.05);scene.add(stripe);}}
const gasBase=new THREE.Mesh(new THREE.BoxGeometry(18,.18,11),new THREE.MeshStandardMaterial({color:0x303438,roughness:.8,map:roadTex}));gasBase.position.set(45,.1,35);gasBase.receiveShadow=true;scene.add(gasBase);const gasRoof=new THREE.Mesh(new THREE.BoxGeometry(16,.35,9),new THREE.MeshStandardMaterial({color:0x4c5256,metalness:.25,roughness:.4,map:metalTex}));gasRoof.position.set(45,4.3,35);gasRoof.castShadow=true;scene.add(gasRoof);for(const x of[40,50]){const col=new THREE.Mesh(new THREE.CylinderGeometry(.16,.16,4.1,10),new THREE.MeshStandardMaterial({color:0x24282b,metalness:.5,roughness:.45,map:metalTex}));col.position.set(x,2.15,31);scene.add(col);}const workshop=new THREE.Mesh(new THREE.BoxGeometry(14,4.5,10),new THREE.MeshStandardMaterial({color:0x454a4d,roughness:.75,map:buildingTex}));workshop.position.set(-45,2.25,35);workshop.castShadow=true;workshop.receiveShadow=true;scene.add(workshop);const workshopDoor=new THREE.Mesh(new THREE.BoxGeometry(5.2,3.1,.08),new THREE.MeshStandardMaterial({color:0x171a1d,metalness:.2,roughness:.35}));workshopDoor.position.set(-45,1.65,29.96);scene.add(workshopDoor);for(let x=-56;x<=-34;x+=5.5){const bay=new THREE.Mesh(new THREE.BoxGeometry(4.2,.03,6.2),new THREE.MeshStandardMaterial({color:0x77736a,roughness:.9,map:sidewalkTex}));bay.position.set(x,.205,35);scene.add(bay);}for(let i=-10;i<=10;i++)addTree(i*11+(i%2)*3,-28-(Math.abs(i)%4)*11,.8+(Math.abs(i)%3)*.18);for(let i=-5;i<=5;i++){addBuilding(i*19,-70,9,6+(Math.abs(i)%4)*2,9,[0x666762,0x4e575d,0x71695f][Math.abs(i)%3]);addBuilding(i*19,70,9,5+(Math.abs(i)%3)*3,9,0x5c6361);}addBuilding(-45,35,10,4.5,8,0x4a5358);addBuilding(45,35,9,3.2,7,0x273b48);addBuilding(45,-35,11,5,9,0x3b5667);
for(let x=-39;x<=39;x+=13)for(const z of[-48,48]){const pole=new THREE.Mesh(new THREE.CylinderGeometry(.045,.07,3.8,8),new THREE.MeshStandardMaterial({color:0x22262a,metalness:.4,roughness:.55,map:metalTex}));pole.position.set(x+3.8,1.9,z);pole.castShadow=true;scene.add(pole);const lamp=new THREE.Mesh(new THREE.SphereGeometry(.13,10,8),new THREE.MeshStandardMaterial({color:0xffe8ad,emissive:0xffa62b,emissiveIntensity:1.5}));lamp.position.set(x+3.8,3.82,z);scene.add(lamp);}if(state.rain)addRain();addStreetProps();for(let i=-5;i<=5;i++){const h=5+Math.random()*9;const b=new THREE.Mesh(new THREE.BoxGeometry(7,h,7),new THREE.MeshStandardMaterial({color:0x6d6c67,roughness:1,map:buildingTex}));b.position.set(i*16,h/2,-70-(i%2)*16);scene.add(b);}
try{
car=makeCar(0x252b31);
swapToBlenderCrown72();car.position.set(state.posX,0,state.posZ);car.rotation.y=state.heading;scene.add(car);
for(let i=0;i<9;i++){const npc=makeCar([0x244b77,0x8a302c,0xc7b77d,0x3c3c3c][i%4],false);npc.scale.setScalar(.86);npc.position.set((i%4)*13-19,0,-12-i*18);npc.userData.speed=1.4+(i%3)*.35;npc.rotation.y=Math.PI;npc.userData.trafficSpeed=.7+(i%3)*.18;scene.add(npc);traffic.push(npc);}
createJobMarker();clock=new THREE.Clock();animate(traffic);
}catch(err){
window.MechanicCityBuildError=String(err?.message||err);
window.MechanicCityDebugLog?.({type:"build",message:window.MechanicCityBuildError,stack:String(err?.stack||"")});
console.error("City build failed",err);
renderEmergencyScene();
}}
function animate(traffic=[]){
  requestAnimationFrame(()=>animate(traffic));
  if(state.scene!=="city")return;
  if(!renderer||!scene||!camera)return;
  if(window.MechanicCityDebug){
    const now=performance.now();
    window.MechanicCityDebug.frameCount++;
    if(window.MechanicCityDebug.lastFrameAt){
      const inst=1000/Math.max(1,now-window.MechanicCityDebug.lastFrameAt);
      window.MechanicCityDebug.fps=window.MechanicCityDebug.fps?window.MechanicCityDebug.fps*.9+inst*.1:inst;
    }
    window.MechanicCityDebug.lastFrameAt=now;
  }
  const dt=Math.min(clock?.getDelta()||.016,.05);
  try{
    if(state.driving&&state.fuel>0){
      physicsDrive(dt);
      state.fuel=Math.max(0,state.fuel-dt*(.018+Math.abs(state.speed)*.014));
      state.car.oil=Math.max(0,state.car.oil-dt*.004);
      state.car.coolant=Math.max(0,state.car.coolant-dt*.002);
      state.heat=Math.min(125,state.heat+dt*(.08+Math.abs(state.speed)*.055));
      if(state.car.oil<15||state.car.coolant<15)state.damage=Math.min(100,state.damage+dt*.08);
      state.car.mileage+=Math.abs(state.speed)*dt*.006;
      if(state.heat>108)state.damage=Math.min(100,state.damage+dt*.06);
      for(const npc of traffic){
        if(!npc?.position||!car?.position)continue;
        const d=car.position.distanceTo(npc.position);
        if(d<2.25&&Math.abs(state.speed)>.35){
          state.damage=Math.min(100,state.damage+dt*7);
          if(chassisBody){
            const v=chassisBody.linvel();
            chassisBody.setLinvel({x:v.x*.65,y:v.y,z:v.z*.65},true);
          }
          msg("⚠️ Столкновение: кузов повреждён.");
        }
      }
      if(Date.now()-lastSaveTick>5000){lastSaveTick=Date.now();save();}
    }
    updateJob();updateArticulatedCar(dt);
    if(!car?.rotation||!car?.position)return;
    const moving=Math.abs(state.speed)>.25;
    const heading=car.rotation.y;
    let target,look;
    if(cameraMode===2){
      const fx=-Math.sin(heading),fz=-Math.cos(heading);
      target=new THREE.Vector3(car.position.x+fx*.35,1.32,car.position.z+fz*.35);
      look=new THREE.Vector3(target.x+fx*8,1.28,target.z+fz*8);
      camera.position.lerp(target,.22);
    }else{
      const behind=cameraMode===0?1:-1;
      const followDistance=moving?7.2:6.2;
      const followHeight=moving?4.8:4.3;
      const horizontal=followDistance*Math.cos(camOrbitPitch);
      const sx=Math.sin(heading+camOrbitYaw)*horizontal*behind;
      const sz=Math.cos(heading+camOrbitYaw)*horizontal*behind;
      target=new THREE.Vector3(car.position.x+sx,followHeight+Math.sin(camOrbitPitch)*followDistance,car.position.z+sz);
      look=new THREE.Vector3(car.position.x-Math.sin(heading)*2.5,.85,car.position.z-Math.cos(heading)*2.5);
      camera.position.lerp(target,.13);
    }
    camera.lookAt(look);
    for(const npc of traffic){
      if(!npc?.position)continue;
      const travel=dt*(Number(npc.userData?.trafficSpeed)||0)*8;
      npc.position.z+=travel;
      for(const w of(npc.userData?.wheels||[])){
        if(w?.rotation)w.rotation.x-=travel/.39;
      }
      if(npc.position.z>120)npc.position.z=-120;
    }
    const cycle=(performance.now()/1000)%12;
    const green=cycle<6,yellow=cycle>=6&&cycle<7.5;
    for(const l of trafficLights){
      if(!l?.red?.material?.color||!l?.yellow?.material?.color||!l?.green?.material?.color)continue;
      l.red.material.color.setHex(green?0x220000:yellow?0x220000:0xff0000);
      l.yellow.material.color.setHex(yellow?0xffb000:0x332600);
      l.green.material.color.setHex(green?0x00ff44:0x002200);
    }
    updateCarDamage();
    stats();
  }catch(err){
    window.MechanicCityLastFrameError=String(err?.message||err);
    window.MechanicCityDebugLog?.({type:"frame",message:window.MechanicCityLastFrameError,stack:String(err?.stack||"")});
    if(!window.MechanicCityFrameErrorLogged){
      window.MechanicCityFrameErrorLogged=true;
      console.error("Mechanic City frame update failed",err);
    }
  }finally{
    try{renderer.render(scene,camera);}catch(err){
      window.MechanicCityRenderError=String(err?.message||err);
      window.MechanicCityDebugLog?.({type:"render",message:window.MechanicCityRenderError,stack:String(err?.stack||"")});
      if(!window.MechanicCityRenderErrorLogged){
        window.MechanicCityRenderErrorLogged=true;
        console.error("Mechanic City render failed",err);
      }
    }
  }
}
function driveOn(){if(state.fuel<=0){msg("⛽ Бак пуст — нужна заправка.");return;}if(state.gear==="P"||state.gear==="N")state.gear="D";state.driving=true;msg("За рулём");}function stop(){state.driving=false;input.gas=input.left=input.right=input.brake=false;if(chassisBody){const v=chassisBody.linvel();chassisBody.setLinvel({x:v.x*.1,y:v.y,z:v.z*.1},true);chassisBody.setAngvel({x:0,y:0,z:0},true);}state.speed=0;save();}function cycleGear(){const gears=["P","R","N","D"];const i=gears.indexOf(state.gear||"P");state.gear=gears[(i+1)%gears.length];if(state.gear==="P")stop();else state.driving=true;msg("Передача: "+state.gear);}function exitCar(){stop();state.onFoot=true;openPanel("Ты вышел из машины",`<p>Можно осмотреть автомобиль или отправиться в гараж.</p><button id="sitBack">Сесть в машину</button><button id="walkGarage">Открыть гараж</button>`);document.querySelector("#sitBack").onclick=()=>{panel.classList.add("hidden");state.onFoot=false;msg("Ты снова в машине.");};document.querySelector("#walkGarage").onclick=()=>{panel.classList.add("hidden");state.onFoot=false;renderScene("garage");};}
function setupCameraControls(){if(!renderer)return;const el=renderer.domElement;el.style.touchAction="none";el.addEventListener("pointerdown",e=>{if(e.target!==el)return;camDragging=true;camLastX=e.clientX;camLastY=e.clientY;try{el.setPointerCapture(e.pointerId);}catch{}},{passive:true});el.addEventListener("pointermove",e=>{if(!camDragging)return;const dx=e.clientX-camLastX,dy=e.clientY-camLastY;camLastX=e.clientX;camLastY=e.clientY;camOrbitYaw-=dx*.008;camOrbitPitch=THREE.MathUtils.clamp(camOrbitPitch-dy*.005,-.08,.62);},{passive:true});const end=e=>{camDragging=false;try{el.releasePointerCapture(e.pointerId);}catch{}};el.addEventListener("pointerup",end,{passive:true});el.addEventListener("pointercancel",end,{passive:true});}
function bindControls(){document.querySelectorAll("[data-drive]").forEach(b=>{const v=b.dataset.drive;const start=e=>{e.preventDefault();if(v==="gas"){if(state.gear==="P"||state.gear==="N")state.gear="D";input.gas=true;state.driving=true;}else if(v==="left"){input.left=true;state.driving=true;}else if(v==="right"){input.right=true;state.driving=true;}else if(v==="brake")input.brake=true;};const end=e=>{e.preventDefault();if(v==="gas")input.gas=false;if(v==="left")input.left=false;if(v==="right")input.right=false;if(v==="brake")input.brake=false;};b.addEventListener("pointerdown",start,{passive:false});b.addEventListener("pointerup",end,{passive:false});b.addEventListener("pointercancel",end,{passive:false});b.addEventListener("pointerleave",end);});}
document.addEventListener("pointerup",()=>{input.gas=input.left=input.right=input.brake=false;},{passive:true});document.addEventListener("pointercancel",()=>{input.gas=input.left=input.right=input.brake=false;},{passive:true});function openPanel(title,html){panel.innerHTML=`<div class="panel-card"><button class="close" id="closePanel">×</button><h2>${title}</h2>${html}</div>`;panel.classList.remove("hidden");document.querySelector("#closePanel").onclick=()=>panel.classList.add("hidden");}
function installRuntimeErrorCapture(){
  const key="mechanic-city-debug-log";
  let saved=[];
  try{saved=JSON.parse(localStorage.getItem(key)||"[]");if(!Array.isArray(saved))saved=[];}catch{}
  window.MechanicCityRuntimeErrors=saved.slice(-80);
  const push=(entry)=>{
    const item={time:new Date().toISOString(),...entry};
    window.MechanicCityRuntimeErrors.push(item);
    if(window.MechanicCityRuntimeErrors.length>80)window.MechanicCityRuntimeErrors.shift();
    try{localStorage.setItem(key,JSON.stringify(window.MechanicCityRuntimeErrors));}catch{}
    window.MechanicCityDebug?.refresh?.();
  };
  window.MechanicCityDebugLog=push;
  window.addEventListener("error",e=>{
    push({
      type:"error",
      message:String(e.message||e.error||"unknown"),
      source:String(e.filename||""),
      line:e.lineno||0,
      column:e.colno||0,
      stack:String(e.error?.stack||"")
    });
  });
  window.addEventListener("unhandledrejection",e=>{
    push({
      type:"unhandledrejection",
      message:String(e.reason?.message||e.reason||"unknown"),
      stack:String(e.reason?.stack||"")
    });
  });
  window.addEventListener("webglcontextlost",()=>{
    push({type:"webglcontextlost",message:"WebGL context lost"});
  },true);
  window.addEventListener("webglcontextrestored",()=>{
    push({type:"webglcontextrestored",message:"WebGL context restored"});
  },true);
  window.MechanicCityDebugClear=()=>{
    window.MechanicCityRuntimeErrors=[];
    try{localStorage.removeItem(key);}catch{}
    window.MechanicCityDebug?.refresh?.();
  };
  window.MechanicCityDebug={
    version:1,
    startedAt:new Date().toISOString(),
    frameCount:0,
    lastFrameAt:0,
    fps:0,
    refresh:()=>{},
    getReport:()=>{
      const r=renderer?.info;
      return {
        time:new Date().toISOString(),
        url:location.href,
        ua:navigator.userAgent,
        viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},
        webgl:window.MechanicCityWebGL||null,
        webglError:window.MechanicCityWebGLError||null,
        bootError:window.MechanicCityBootError||null,
        buildError:window.MechanicCityBuildError||null,
        emergency:!!window.MechanicCityEmergency,
        emergencyError:window.MechanicCityEmergencyError||null,
        frameError:window.MechanicCityLastFrameError||null,
        renderError:window.MechanicCityRenderError||null,
        physics:{ready:!!physicsReady,error:physicsError||null},
        scene:state?.scene||null,
        sceneChildren:scene?.children?.length??0,
        traffic:traffic?.length??0,
        car:{exists:!!car,wheels:car?.userData?.wheels?.length??0},
        camera:camera?{x:+camera.position.x.toFixed(2),y:+camera.position.y.toFixed(2),z:+camera.position.z.toFixed(2),fov:camera.fov}:null,
        renderer:r?{calls:r.render.calls,triangles:r.render.triangles,points:r.render.points,lines:r.render.lines,geometries:r.memory.geometries,textures:r.memory.textures}:null,
        frames:window.MechanicCityDebug.frameCount,
        fps:window.MechanicCityDebug.fps,
        errors:window.MechanicCityRuntimeErrors.slice(-20)
      };
    }
  };
}
function renderEmergencyScene(){
  try{
    scene=new THREE.Scene();
    scene.background=new THREE.Color(0x7893a3);
    camera=new THREE.PerspectiveCamera(58,Math.max(1,viewport.clientWidth)/Math.max(1,viewport.clientHeight),.1,260);
    camera.position.set(10,7,14);
    camera.lookAt(0,0,0);
    const hemi=new THREE.HemisphereLight(0xdceeff,0x334033,1.5);scene.add(hemi);
    const sun=new THREE.DirectionalLight(0xffffff,2);sun.position.set(8,14,10);scene.add(sun);
    const ground=new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.MeshStandardMaterial({color:0x50534f,roughness:1}));
    ground.rotation.x=-Math.PI/2;scene.add(ground);
    const marker=new THREE.Mesh(new THREE.BoxGeometry(3.2,.7,5.2),new THREE.MeshStandardMaterial({color:0x252b31,roughness:.55,metalness:.2}));
    marker.position.y=.7;scene.add(marker);
    renderer.render(scene,camera);
    window.MechanicCityEmergency=true;
    if(!window.MechanicCityEmergencyStarted){window.MechanicCityEmergencyStarted=true;clock=new THREE.Clock();animate([]);}
  }catch(e){window.MechanicCityEmergencyError=String(e?.message||e);}
}
function installDiagnosticMode(){
  const p=new URLSearchParams(location.search);
  const enabled=p.get("diag")==="1"||p.get("debug")==="1"||localStorage.getItem("mechanic-city-debug")==="1";
  if(!enabled)return;
  localStorage.setItem("mechanic-city-debug","1");
  const el=document.createElement("div");
  el.id="debug-panel";
  el.style.cssText="position:fixed;inset:10px;z-index:99999;pointer-events:none;color:#fff;font:12px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace;";
  el.innerHTML="<div id='debug-card' style='pointer-events:auto;max-height:calc(100vh - 20px);overflow:auto;background:#080b0df2;border:1px solid #73818a;border-radius:12px;padding:12px;box-shadow:0 8px 30px #0008;white-space:pre-wrap'><b>MECHANIC CITY — LIVE DEBUG</b><div id='debug-text'></div><div style='margin-top:8px;display:flex;gap:6px;flex-wrap:wrap'><button id='debug-copy'>COPY REPORT</button><button id='debug-clear'>CLEAR ERRORS</button><button id='debug-close'>CLOSE</button></div></div>";
  document.body.appendChild(el);
  const textEl=document.querySelector("#debug-text");
  const fmt=(v)=>v==null?"none":typeof v==="string"?v:JSON.stringify(v,null,2);
  const refresh=()=>{
    const r=window.MechanicCityDebug?.getReport?.()||{};
    const last=(r.errors||[]).slice(-8);
    textEl.textContent=[
      "URL: "+location.pathname+location.search,
      "Viewport: "+innerWidth+"×"+innerHeight+" DPR "+devicePixelRatio,
      "WebGL: "+fmt(r.webgl),
      "Build: "+fmt(r.buildError),
      "Boot: "+fmt(r.bootError),
      "Physics: "+(r.physics?.ready?"READY":"FALLBACK")+" "+fmt(r.physics?.error),
      "Emergency: "+r.emergency+" "+fmt(r.emergencyError),
      "Frame: "+fmt(r.frameError),
      "Render: "+fmt(r.renderError),
      "Scene: "+r.scene+" children="+r.sceneChildren+" traffic="+r.traffic,
      "Car: exists="+r.car?.exists+" wheels="+r.car?.wheels,
      "Camera: "+fmt(r.camera),
      "Renderer: "+fmt(r.renderer),
      "FPS: "+r.fps+" frames="+r.frames,
      "ERRORS (last 8):",
      last.length?last.map(x=>new Date(x.time).toLocaleTimeString()+" ["+x.type+"] "+x.message+(x.line?(" @"+x.line+":"+x.column):"")).join("\n"):"none"
    ].join("\n");
  };
  window.MechanicCityDebug.refresh=refresh;
  document.querySelector("#debug-copy").onclick=async()=>{
    const report=JSON.stringify(window.MechanicCityDebug.getReport(),null,2);
    try{await navigator.clipboard.writeText(report);msg("📋 Отладочный отчёт скопирован");}
    catch{prompt("Скопируй отчёт:",report);}
  };
  document.querySelector("#debug-clear").onclick=()=>window.MechanicCityDebugClear?.();
  document.querySelector("#debug-close").onclick=()=>{localStorage.removeItem("mechanic-city-debug");el.remove();};
  refresh();
  setInterval(refresh,500);
}
function renderScene(name){state.scene=name;menu.classList.add("hidden");if(name==="workshop"){document.querySelector(".drive-hud").style.display="none";if(renderer){renderer.dispose();renderer=null;}buildWorkshop();return;}if(name==="city"){
document.querySelector(".drive-hud").style.display="";
try{buildCity();bindControls();stats();msg("▲ газ • руль • ■ тормоз");}
catch(err){window.MechanicCityBuildError=String(err?.message||err);console.error("City build failed",err);renderEmergencyScene();}
return;}stop();document.querySelector(".drive-hud").style.display="none";if(renderer){renderer.dispose();renderer=null;}if(name==="market"){viewport.innerHTML="<div class='cards'><h2>🚘 Рынок автомобилей</h2><p class='muted'>Подержанные машины с разным пробегом и состоянием.</p><article><b>Crown 72</b><span>1972 • 214 320 км • 61%</span><strong>7 900 ₽</strong><button data-buy='7900|Crown 72|61|214320|1972'>Купить</button></article><article><b>Falcon GT</b><span>2012 • 168 500 км • 78%</span><strong>13 600 ₽</strong><button data-buy='13600|Falcon GT|78|168500|2012'>Купить</button></article><article><b>Raven 1.8</b><span>2005 • 301 200 км • 37%</span><strong>3 900 ₽</strong><button data-buy='3900|Raven 1.8|37|301200|2005'>Купить</button></article></div>";}else if(name==="junkyard"){viewport.innerHTML="<div class='cards'><h2>🛠️ Свалка</h2><article><b>Raven Project</b><span>2005 • 342 100 км • 18%</span><strong>1 200 ₽</strong><button data-buy='1200|Raven Project|18|342100|2005'>Забрать</button></article><article><b>Vektor Wreck</b><span>2008 • 256 900 км • 31%</span><strong>2 800 ₽</strong><button data-buy='2800|Vektor Wreck|31|256900|2008'>Забрать</button></article></div>";}else if(name==="dealer"){viewport.innerHTML="<div class='cards'><h2>🏢 Автосалон</h2><p class='muted'>Новые автомобили.</p><article><b>Falcon GT New</b><span>2024 • 98%</span><strong>28 900 ₽</strong><button data-buy='28900|Falcon GT New|98|0|2024'>Купить</button></article><article><b>Crown 72 Custom</b><span>2025 • 96%</span><strong>34 900 ₽</strong><button data-buy='34900|Crown 72 Custom|96|0|2025'>Купить</button></article><article><b>Orion LX Premium</b><span>2026 • 99%</span><strong>44 900 ₽</strong><button data-buy='44900|Orion LX Premium|99|0|2026'>Купить</button></article></div>";}else if(name==="jobs"){viewport.innerHTML="<div class='cards'><h2>💼 Работа</h2><article><b>Доставка запчастей</b><span>Перевези груз через город</span><strong>+900 ₽</strong><button data-job='900'>Взять</button></article><article><b>Перегон автомобиля</b><span>Доставь машину клиента</span><strong>+1 400 ₽</strong><button data-job='1400'>Взять</button></article><article><b>Тест-драйв</b><span>Проедь без серьёзной аварии</span><strong>+650 ₽</strong><button data-job='650'>Взять</button></article></div>";}else if(name==="settings"){viewport.innerHTML="<div class='garage'><h2>⚙️ Настройки</h2><button id='rainToggle'>🌧️ Дождь: "+(state.rain?"ВКЛ":"ВЫКЛ")+"</button><button id='timeToggle'>🕒 Прибавить 4 часа</button><button id='resetGame'>♻️ Сбросить прогресс</button></div>";}else{const c=state.car;viewport.innerHTML="<div class='garage'><h2>🔧 Гараж</h2><div class='carbox'><b>"+c.name+"</b><span>"+c.year+" • "+Math.round(c.mileage).toLocaleString("ru-RU")+" км</span><span>Состояние: "+Math.round(c.condition)+"%</span><span>Повреждения: "+Math.round(state.damage)+"%</span></div><div class='diagnostics'><h3>Диагностика</h3><div>Двигатель <b>"+Math.round(c.engine)+"%</b></div><div>Масло <b>"+Math.round(c.oil)+"%</b></div><div>Охлаждение <b>"+Math.round(c.coolant)+"%</b></div><div>Тормоза <b>"+Math.round(c.brakes)+"%</b></div><div>Аккумулятор <b>"+Math.round(c.battery)+"%</b></div><div>Подвеска <b>"+Math.round(c.suspension)+"%</b></div><div>Шины <b>"+Math.round(c.tires)+"%</b></div></div><div class='parts'><button data-repair='oil|250|20'>🛢️ Масло — 250 ₽</button><button data-repair='coolant|380|22'>❄️ Охлаждение — 380 ₽</button><button data-repair='brakes|700|24'>🛑 Тормоза — 700 ₽</button><button data-repair='battery|520|25'>🔋 Аккумулятор — 520 ₽</button><button data-repair='suspension|900|22'>🛞 Подвеска — 900 ₽</button><button data-repair='tires|650|28'>⭕ Шины — 650 ₽</button><button data-repair='engine|1800|18'>🔩 Двигатель — 1 800 ₽</button><button data-upgrade='turbo|4500'>💨 Турбина — 4 500 ₽</button><button data-upgrade='sportBrakes|1800'>🏁 Спорт-тормоза — 1 800 ₽</button><button data-upgrade='wheels|2200'>✨ Спорт-колёса — 2 200 ₽</button></div></div>";}viewport.querySelectorAll("[data-buy]").forEach(b=>b.onclick=()=>{const a=b.dataset.buy.split("|");buyCar(+a[0],a[1],+a[2],+a[3],+a[4]);});viewport.querySelectorAll("[data-repair]").forEach(b=>b.onclick=()=>{const a=b.dataset.repair.split("|");repairPart(a[0],+a[1],+a[2]);});viewport.querySelectorAll("[data-upgrade]").forEach(b=>b.onclick=()=>{const a=b.dataset.upgrade.split("|");upgrade(a[0],+a[1]);});viewport.querySelectorAll("[data-job]").forEach(b=>b.onclick=()=>startJob(+b.dataset.job));if(name==="settings"){document.querySelector("#rainToggle").onclick=()=>{state.rain=!state.rain;save();renderScene("settings");};document.querySelector("#timeToggle").onclick=()=>{state.time=(state.time+4)%24;save();renderScene("settings");};document.querySelector("#resetGame").onclick=()=>{localStorage.removeItem("mechanic-city");location.reload();}}}
function repairPart(key,cost,amount){if(state.money<cost){openPanel("Недостаточно денег","<p>Не хватает денег.</p>");return;}state.money-=cost;state.car[key]=Math.min(100,(state.car[key]||0)+amount);state.car.condition=Math.min(100,state.car.condition+Math.floor(amount/2));state.damage=Math.max(0,100-state.car.condition);save();renderScene("garage");}function upgrade(key,cost){if(state.money<cost){openPanel("Недостаточно денег","<p>Не хватает денег.</p>");return;}if(state.car[key]===true){openPanel("Уже установлено","<p>Эта деталь уже стоит.</p>");return;}state.money-=cost;state.car[key]=true;state.car.condition=Math.min(100,state.car.condition+5);save();renderScene("garage");}function buyCar(price,name,condition,mileage,year){if(state.money<price){openPanel("Недостаточно денег","<p>Не хватает денег.</p>");return;}state.money-=price;state.car={...state.car,name,year,mileage,condition,engine:condition,turbo:false,sportBrakes:false,wheels:"stock",oil:Math.max(35,condition),coolant:Math.max(35,condition),brakes:condition,battery:condition,suspension:condition,tires:condition,body:condition};state.damage=Math.max(0,100-condition);save();openPanel("Автомобиль куплен","<p><b>"+name+"</b> теперь твой.</p><button id='toGarage'>Открыть гараж</button>");document.querySelector("#toGarage").onclick=()=>{panel.classList.add("hidden");renderScene("garage");};}function startJob(reward){if(state.job){openPanel("Заказ уже активен","<p>Сначала закончи текущий заказ.</p>");return;}const targets=[{x:45,z:35,label:"Заправка"},{x:-45,z:35,label:"Сервис"},{x:0,z:70,label:"Северный квартал"},{x:0,z:-70,label:"Южный квартал"},{x:38,z:-35,label:"Парковка"}];const target=targets[Math.floor(Math.random()*targets.length)];state.job={reward,started:Date.now(),startX:state.posX,startZ:state.posZ,targetX:target.x,targetZ:target.z,label:target.label};save();openPanel("Заказ принят","<p>Цель: <b>"+target.label+"</b>. Доедь до жёлтого маркера.</p><button id='startDrive'>Ехать</button>");document.querySelector("#startDrive").onclick=()=>{panel.classList.add("hidden");renderScene("city");msg("💼 Цель: "+target.label+" • +"+reward+" ₽");};}
document.querySelector("#menuBtn").onclick=()=>menu.classList.toggle("hidden");document.querySelector(".round-btn").onclick=()=>menu.classList.toggle("hidden");document.querySelector("#mapBtn").onclick=()=>openPanel("Карта","<p>Ты находишься в городе. Рынок и гараж доступны через меню ☰.</p>");document.querySelector("#carInfo").onclick=()=>openPanel("Автомобиль",`<p><b>${state.car.name}</b></p><p>Состояние: ${Math.round(state.car.condition)}%</p><p>Двигатель: ${Math.round(state.car.engine)}%</p><p>Масло: ${Math.round(state.car.oil)}%</p><p>Охлаждение: ${Math.round(state.car.coolant)}%</p><p>Повреждения: ${Math.round(state.damage)}%</p><p>Температура: ${Math.round(state.heat)}°C</p>`);document.querySelector("#exitBtn").onclick=exitCar;document.querySelector("#horn").onclick=()=>msg("🔊 Бип!");document.querySelector("#fuelBtn").onclick=()=>{const d=Math.hypot(state.posX-45,state.posZ-35);if(d<14){const cost=Math.ceil((100-state.fuel)*8);if(state.money>=cost){state.money-=cost;state.fuel=100;msg("⛽ Бак заправлен за "+cost+" ₽");save();}else msg("Не хватает денег на топливо.");}else msg("Подъедь к заправке.");};document.querySelector("#serviceBtn").onclick=()=>{if(state.scene==="workshop"){openPanel("Мастерская","<p>Машина разобрана на подъёмнике. Нажми на деталь для диагностики, ремонта или замены.</p>");return;}if(car?.userData?.serviceParts){const parts=Object.values(car.userData.serviceParts);const by={};for(const p of parts)(by[p.category]??=[]).push(p);openPanel("Интерактивные детали","<p>Выбери деталь прямо на машине. Доступно отдельных деталей: <b>"+parts.length+"</b>.</p><div class=\"parts\">"+Object.entries(by).map(([k,v])=>"<button data-part-category=\""+k+"\">"+partCategoryLabel(k)+" — "+v.length+"</button>").join("")+"</div>");panel.querySelectorAll("[data-part-category]").forEach(b=>b.onclick=()=>{const p=by[b.dataset.partCategory]?.[0];if(p)openPartPanel(p);});return;}const d=Math.hypot(state.posX+45,state.posZ-35);if(d<14){const cost=Math.max(250,Math.ceil(state.damage*45));if(state.money>=cost){state.money-=cost;state.damage=0;state.car.condition=100;state.car.engine=100;state.car.body=100;state.car.oil=100;state.car.coolant=100;state.car.brakes=100;state.car.battery=100;state.car.suspension=100;state.car.tires=100;msg("🔧 Машина полностью обслужена.");save();}else msg("Не хватает денег на сервис.");}else msg("Подъедь к сервису.");};document.querySelector("#gearBtn").onclick=cycleGear;document.querySelector("#doorsBtn").onclick=()=>{state.car.doorsOpen=!state.car.doorsOpen;save();msg(state.car.doorsOpen?"🚪 Двери открыты":"🚪 Двери закрыты");};document.querySelector("#hoodBtn").onclick=()=>{if(state.car.hoodOpen){state.car.hoodOpen=false;state.car.trunkOpen=true;msg("🧳 Багажник открыт");}else if(state.car.trunkOpen){state.car.trunkOpen=false;msg("🚗 Крышки закрыты");}else{state.car.hoodOpen=true;msg("🔧 Капот открыт");}save();};document.querySelector("#cameraBtn").onclick=()=>{cameraMode=(cameraMode+1)%3;camOrbitYaw=0;camOrbitPitch=.18;if(camera){camera.fov=cameraMode===2?82:cameraMode===1?68:62;camera.updateProjectionMatrix();}msg("📷 "+cameraModeNames[cameraMode]);};document.querySelectorAll(".menu [data-scene]").forEach(b=>b.onclick=()=>renderScene(b.dataset.scene));function resizeRenderer(){
  if(!renderer||!camera)return;
  const w=Math.max(1,viewport.clientWidth),h=Math.max(1,viewport.clientHeight);
  camera.aspect=w/h;camera.updateProjectionMatrix();
  renderer.setSize(w,h,false);
}
window.addEventListener("resize",resizeRenderer,{passive:true});
window.addEventListener("orientationchange",()=>setTimeout(resizeRenderer,120),{passive:true});installRuntimeErrorCapture();installVisualInspectMode();installDiagnosticMode();installPartInteraction();renderScene("city");installAITestMode();initPhysics().then(()=>{try{setupVehiclePhysics();msg("🚗 Физика машины активна");}catch(err){physicsReady=false;physicsError=String(err?.message||err);window.MechanicCityDebugLog?.({type:"physics",message:physicsError,stack:String(err?.stack||"")});console.error("Vehicle physics setup failed",err);msg("⚠️ Запущен резервный режим управления");}}).catch(err=>{physicsError=String(err?.message||err);window.MechanicCityDebugLog?.({type:"physics-init",message:physicsError,stack:String(err?.stack||"")});console.error("Rapier init failed",err);msg("⚠️ Физика недоступна, включено безопасное управление");});