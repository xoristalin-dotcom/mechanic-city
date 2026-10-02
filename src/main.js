import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RetroCarBuilder } from "./retroCar.js";
import { makeRetroCar, makeRetroParkedCar, RETRO_COLORS } from "./retroStyle.js";
import {
  PART_CATALOG,
  initializeCarParts,
  syncCarPartsFromCatalog,
  removePart,
  installPart,
  tunePart,
  damagePart
} from "./parts.js";
import "./style.css";

function makeNoiseTexture(base="#777", dark="#555", light="#999", size=128){
  const c=document.createElement("canvas"); c.width=c.height=size;
  const ctx=c.getContext("2d");
  ctx.fillStyle=base; ctx.fillRect(0,0,size,size);
  for(let i=0;i<1800;i++){
    const v=Math.random();
    ctx.fillStyle=v<.42?dark:v>.88?light:base;
    ctx.globalAlpha=.08+Math.random()*.16;
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
const PART_STATE_VERSION = 2;
const state = saved || {money:18500,fuel:72,heat:82,damage:8,car:{name:"Crown 72",year:1972,mileage:214320,engine:68,condition:61,turbo:false,sportBrakes:false,wheels:"stock",oil:42,coolant:58,brakes:61,battery:70,suspension:61,tires:61,body:60,gearbox:57,parts:{}}, scene:"city"};
Object.assign(state,{driving:false,speed:0,steer:0,onFoot:false,throttle:false});
const input={gas:false,brake:false,left:false,right:false};
state.fuel=100;state.posX??=0;state.posZ??=10;state.heading??=0;state.gear??="P";state.time??=14;state.rain??=false;state.job??=null;
state.car.name="Retro Car";state.car.year??=1975;state.car.oil??=42;state.car.coolant??=58;state.car.brakes??=state.car.condition;state.car.battery??=70;state.car.suspension??=state.car.condition;state.car.tires??=state.car.condition;state.car.body??=state.car.condition;state.car.engine??=state.car.condition;state.car.gearbox??=state.car.condition;state.car.partState??={};state.car.parts??={};
initializeCarParts(state);

const appRoot = document.createElement("div"); appRoot.className = "game"; app.innerHTML = ""; app.appendChild(appRoot);
appRoot.innerHTML = `
  <main id="viewport"></main>
  <div id="orientation-lock">
    <div class="rotate-card"><span class="rotate-icon">📱↔️</span><h2>Поверни телефон горизонтально</h2><p>Игра разработана для мобильного управления.</p></div>
  </div>
  <div class="drive-hud">
    <div class="hud-line"><span>Скорость</span><b id="speed">0</b></div>
    <div class="hud-line"><span>Передача</span><b id="gear">P</b></div>
    <div class="hud-line"><span>Топливо</span><b id="fuel">72</b></div>
    <div class="hud-line"><span>Температура</span><b id="heat">82</b></div>
    <div class="hud-line"><span>Часы</span><b id="clock">14:00</b></div>
  </div>
  <div id="message"></div>
  <div class="floating-bar"><button id="menuBtn">☰</button><button id="cameraBtn">📷</button><button id="mapBtn">🗺️</button><button id="teleportBtn" aria-label="Телепорт в центр карты">🎯</button><button id="vehicleBtn" aria-label="Управление кузовом">🚗</button></div>
  <div class="mobile-drive-controls" aria-label="Управление автомобилем">
    <div class="steering-zone" aria-label="Руль">
      <button class="steer" data-drive="left" aria-label="Повернуть налево">‹</button>
      <button class="steer" data-drive="right" aria-label="Повернуть направо">›</button>
    </div>
    <div class="pedals" aria-label="Педали">
      <button class="pedal brake" data-drive="brake" aria-label="Тормоз">■<small>ТОРМОЗ</small></button>
      <button class="pedal gas" data-drive="gas" aria-label="Газ">▲<small>ГАЗ</small></button>
    </div>
    <div class="drive-actions" aria-label="Передача">
      <button data-gear="P">P</button>
      <button data-gear="R">R</button>
      <button data-gear="N">N</button>
      <button data-gear="D">D</button>
    </div>
  </div>
  <aside id="menu" class="menu hidden"></aside>
`;

const lockLandscape=async()=>{try{if(screen.orientation?.lock)await screen.orientation.lock("landscape");}catch{}};
window.addEventListener("load",lockLandscape,{once:true});
document.addEventListener("pointerdown",lockLandscape,{once:true,passive:true});

const viewport=document.querySelector("#viewport"),speedEl=document.querySelector("#speed"),gearEl=document.querySelector("#gear"),fuelEl=document.querySelector("#fuel"),heatEl=document.querySelector("#heat"),clockEl=document.querySelector("#clock"),messageEl=document.querySelector("#message"),menu=document.querySelector("#menu");
let renderer,camera,car,scene,clock,cameraRig,traffic=[],trafficLights=[],smoke=[],rainDrops=[],jobMarker=null,vehicleController=null,chassisBody=null,physicsWorld=null,physicsReady=false,physicsError=null;
const partRaycaster=new THREE.Raycaster(); const partPointer=new THREE.Vector2(); let cameraMode=0,camOrbitYaw=0,camOrbitPitch=.18,camDragging=false,camLastX=0,camLastY=0;
const cameraModeNames=["follow","orbit","hood"];
const PHYSICS_Y = 0.3;

let physicsInitPromise=null;
async function initPhysics(){
  if(!physicsInitPromise) physicsInitPromise=RAPIER.init();
  await physicsInitPromise;
}
function resetPhysics(){if(vehicleController){try{vehicleController.free();}catch{}}vehicleController=null;chassisBody=null;physicsWorld=null;physicsReady=false;}
async function setupVehiclePhysics(){
  if(!RAPIER||!car)throw new Error("Rapier or car is not ready");
  try{
    await initPhysics();
    resetPhysics();
    physicsWorld=new RAPIER.World({x:0,y:-9.81,z:0});
    const ground=RAPIER.ColliderDesc.cuboid(120,0.5,120);
    physicsWorld.createCollider(ground,{x:0,y:-0.5,z:0});
    const hull=RAPIER.ColliderDesc.cuboid(1.4,0.44,2.8);
    const body=physicsWorld.createRigidBody({translation:{x:car.position.x,y:1.2,z:car.position.z},rotation:0});
    physicsWorld.createCollider(hull,body);
    vehicleController=body;
    chassisBody=body;
    physicsReady=true;
    physicsError=null;
  }catch(err){
    resetPhysics();
    physicsError=String(err?.message||err);
    window.MechanicCityPhysicsError=physicsError;
    window.MechanicCityDebugLog?.({type:"physics-init",message:physicsError,stack:String(err?.stack||"")});
    console.warn("Rapier unavailable; using fallback driving.",err);
    physicsReady=false;
  }
}
function partCategoryLabel(c){return ({engine:"Двигатель",brakes:"Тормоза",wheels:"Колёса",suspension:"Подвеска",body:"Кузов",interior:"Салон",exhaust:"Выхлоп",lights:"Освещение",glass:"Стёкла",transmission:"Коробка"}[c]||"Деталь");}
function partCondition(key){const p=state.car.partState?.[key]?.condition;return typeof p==="number"?p:100;}
function partInstalled(key){return state.car.partState?.[key]?.installed!==false;}
function setPartState(key,patch){state.car.partState??={};state.car.partState[key]={condition:partCondition(key),installed:partInstalled(key),...patch};}
function mechanicalHealth(){const parts=car?.userData?.serviceParts||{};const groups={engine:[],cooling:[],electrical:[],transmission:[],brakes:[],wheels:[],suspension:[]};for(const p of Object.values(parts)){const key=p.key||""; const list=(groups[p.category]??=[]);if(key){list.push({...p, condition:partCondition(key), installed:partInstalled(key)}); groups[p.category]=list;}} const getAvg=(arr)=>arr.length?arr.reduce((s,v)=>s+(v.condition??100),0)/arr.length:100; return {engine:getAvg(groups.engine)/100,transmission:getAvg(groups.transmission)/100,wheels:getAvg(groups.wheels)/100,brakes:getAvg(groups.brakes)/100,suspension:getAvg(groups.suspension)/100};}
function repairSelectedPart(key){const part=car?.userData?.serviceParts?.[key];if(!part)return;const before=partCondition(key);const cost=Math.max(40,Math.round((100-before)*0.22*(part.baseCost||100)));if(before>=100){msg("✅ Деталь уже в идеальном состоянии."); return;} if(state.money<cost){msg("💸 Недостаточно денег"); return;} state.money-=cost; setPartState(key,{condition:100,installed:partInstalled(key)}); syncCarPartsFromCatalog(car,state); msg("🔧 Деталь отремонтирована");}
function removeSelectedPart(key){const part=car?.userData?.serviceParts?.[key];if(!part||!part.removable)return;if(!partInstalled(key)){msg("⚠️ Деталь уже снята."); return;} if(state.driving){msg("⛔ Нельзя снимать деталь на ходу."); return;} setPartState(key,{installed:false}); part.installed=false; if(part.mesh) part.mesh.visible=false; msg("🔩 Деталь снята");}
function installSelectedPart(key){const part=car?.userData?.serviceParts?.[key];if(!part)return;if(partInstalled(key)){msg("⚠️ Деталь уже установлена."); return;} setPartState(key,{installed:true}); part.installed=true; if(part.mesh && part.mesh.userData?.servicePartVisual===true) part.mesh.visible=true; msg("🛠️ Деталь установлена");}
function tuneSelectedPart(key){const part=car?.userData?.serviceParts?.[key];if(!part||!part.tunable)return;const tuneKey="tune_"+key;if(state.car.parts[tuneKey]){msg("⚙️ Тюнинг уже установлен"); return;} state.car.parts[tuneKey]={installed:true,quality:1,bonus:1.15}; msg("⚙️ Тюнинг установлен");}
function openPartPanel(part){const c=partCondition(part.key),installed=partInstalled(part.key);const cost=Math.max(40,Math.round((100-c)*0.22*(part.baseCost||100))); const action=installed&&part.removable?"<button id='removeSelected'>🔩 Снять деталь</button>":"<button id='installSelected'>🛠️ Установить деталь</button>"; const tune=part.tunable&&installed?"<button id='tuneSelected'>⚙️ Тюнинг</button>":""; const html="<p><b>"+part.name+"</b></p><p>Узел: "+partCategoryLabel(part.category)+"<br>Подсистема: "+(part.subsystem||"-")+"<br>Состояние: <b>"+c+"%</b><br>Статус: <b>"+(installed?"Установлена":"Снята")+"</b></p><div class='buttons'>"+action+"<button id='repairSelected'>🧰 Починить</button>"+tune+"</div>"; openPanel("Деталь автомобиля",html); document.querySelector("#removeSelected")?.addEventListener("click",()=>removeSelectedPart(part.key)); document.querySelector("#installSelected")?.addEventListener("click",()=>installSelectedPart(part.key)); document.querySelector("#repairSelected")?.addEventListener("click",()=>repairSelectedPart(part.key)); document.querySelector("#tuneSelected")?.addEventListener("click",()=>tuneSelectedPart(part.key));}
function installPartInteraction(){viewport.addEventListener("pointerdown",e=>{if(!["city","workshop","garage"].includes(state.scene)||!car||!renderer)return;const rect=renderer.domElement.getBoundingClientRect();partPointer.x=((e.clientX-rect.left)/rect.width)*2-1;partPointer.y=-((e.clientY-rect.top)/rect.height)*2+1;partRaycaster.setFromCamera(partPointer,camera);const hits=partRaycaster.intersectObjects(car.children,true);if(!hits.length)return;let target=null;for(const hit of hits){const obj=hit.object;const part=Object.values(car.userData.serviceParts||{}).find(p=>p.mesh===obj || p.mesh===obj.parent || p.mesh===obj.parent?.parent);if(part){target=part;break;}}if(target)openPartPanel(target);});}
function setupImportedWheelSteering(model,root){model.updateWorldMatrix(true,true,true); root.updateWorldMatrix(true,true,true); const find=(name)=>model.getObjectByName(name)||null; const wheelPivots=[find("WheelPivot_FL"),find("WheelPivot_FR"),find("WheelPivot_RL"),find("WheelPivot_RR")].filter(Boolean); const worldCorners=(obj)=>{const box=new THREE.Box3().setFromObject(obj,true); const pts=[]; for(const x of [box.min.x,box.max.x]) for(const y of [box.min.y,box.max.y]) for(const z of [box.min.z,box.max.z]) pts.push(root.worldToLocal(new THREE.Vector3(x,y,z))); const min=new THREE.Vector3(Infinity,Infinity,Infinity); const max=new THREE.Vector3(-Infinity,-Infinity,-Infinity); for(const p of pts){min.min(p);max.max(p);} return {min,max};}; const makePivot=(name,pos)=>{const pivot=new THREE.Object3D(); pivot.name=name; pivot.position.copy(pos); root.add(pivot); return pivot;}; const attachDoor=(name,side,front)=>{const mesh=find(name); if(!mesh)return null; const b=worldCorners(mesh); const center=b.min.clone().add(b.max).multiplyScalar(.5); const hingeX=front?b.max.x:b.min.x; const hingeY=side<0?b.min.y:b.max.y; const pivot=makePivot(name+"_RuntimeHinge",new THREE.Vector3(hingeX,hingeY,center.z)); pivot.attach(mesh); const openSign=front?(side<0?1:-1):(side<0?-1:1); return {pivot,open:0,side,front,openSign};}; const doors=[attachDoor("L_Front_Door",-1,true),attachDoor("R_Front_Door",1,true),attachDoor("L_Rear_Door",-1,false),attachDoor("R_Rear_Door",1,false)].filter(Boolean); const attachLid=(name,front)=>{const mesh=find(name); if(!mesh)return null; const b=worldCorners(mesh); const center=b.min.clone().add(b.max).multiplyScalar(.5); const hingeX=front?b.min.x:b.max.x; const pivot=makePivot(name+"_RuntimeHinge",new THREE.Vector3(hingeX,center.y,b.max.z)); pivot.attach(mesh); return {pivot,open:0,front};}; const hood=attachLid("Hood",true); const trunk=attachLid("Trunk",false); const steering=find("SteeringWheel")||find("Steering_Wheel"); const audit=[]; model.traverse(o=>{if(o.isMesh && o.visible){audit.push({name:o.name,category:o.userData?.servicePart?.category||"unknown",subsystem:o.userData?.servicePart?.subsystem||"unknown"});}}); root.userData.articulationAudit=audit; return {wheels:wheelPivots,doors,hood,trunk,steering};}
function updateArticulatedCar(dt){const a=car?.userData?.articulation;if(!a)return;state.car.articulationActive=true;if(a.hood){const target=state.car.hoodOpen?1:0;a.hood.open=THREE.MathUtils.damp(a.hood.open,target,7,dt);a.hood.pivot.rotation.x=a.hood.openSign*a.hood.maxAngle*a.hood.open;a.hood.pivot.visible=true;if(car?.userData?.engineBay)car.userData.engineBay.visible=a.hood.open>0.08;}if(Array.isArray(a.doors)){const target=state.car.doorsOpen?1:0;for(const door of a.doors){if(!door?.pivot)continue;door.open=THREE.MathUtils.damp(door.open,target,7,dt);door.pivot.rotation.y=door.openSign*door.maxAngle*door.open;door.pivot.visible=true;}}}
function physicsDrive(dt){
  const steerInput=(input.left?1:0)+(input.right?-1:0);
  const throttle=(input.gas===true||state.throttle===true)&&(state.gear==="D"||state.gear==="R");
  const reverse=state.gear==="R";
  const maxForward=16;
  const maxReverse=8;
  // Direct arcade drivetrain: input must never be blocked by Rapier/part state.
  if(throttle){
    const target=reverse?-maxReverse:maxForward;
    const step=(reverse?8:10)*dt;
    if(state.speed<target)state.speed=Math.min(target,state.speed+step);
    if(state.speed>target)state.speed=Math.max(target,state.speed-step);
  }else{
    const drag=Math.max(0,1-3.2*dt);
    state.speed*=drag;
    if(Math.abs(state.speed)<.03)state.speed=0;
  }
  if(input.brake){
    const brakeStep=14*dt;
    if(state.speed>0)state.speed=Math.max(0,state.speed-brakeStep);
    else if(state.speed<0)state.speed=Math.min(0,state.speed+brakeStep);
  }
  state.steer=THREE.MathUtils.damp(state.steer,steerInput,7,dt);
  const steerAngle=state.steer*THREE.MathUtils.degToRad(36)*(1-Math.min(Math.abs(state.speed)/22,.38));
  if(Math.abs(state.speed)>.01)state.heading+=(state.speed/2.95)*Math.tan(steerAngle)*dt;
  car.rotation.y=state.heading;
  const forward=new THREE.Vector3(0,0,1).applyQuaternion(car.quaternion).normalize();
  state.posX+=forward.x*state.speed*dt;
  state.posZ+=forward.z*state.speed*dt;
  car.position.set(state.posX,car.position.y,state.posZ);
  if(chassisBody){
    try{
      const p=chassisBody.translation();
      chassisBody.setTranslation({x:state.posX,y:p.y,z:state.posZ},true);
      chassisBody.setLinvel({x:forward.x*state.speed,y:chassisBody.linvel().y,z:forward.z*state.speed},true);
      chassisBody.setAngvel({x:0,y:0,z:0},true);
    }catch{}
  }
  for(const w of(car.userData?.wheels||[])){
    // Only the front axle steers. Rear wheels stay aligned with the chassis.
    if(w?.userData?.front && w?.rotation) w.rotation.y=steerAngle;
    // Rolling is applied to a dedicated child so steering cannot tilt the
    // wheel's spin axis and create the "figure-eight" wobble.
    const spin=w?.userData?.spin;
    if(spin?.rotation) spin.rotation.x-=state.speed*dt/.39;
  }
}

function fallbackDrive(dt){const throttle=(input.gas||state.throttle)&&(state.gear==="D"||state.gear==="R"),reverse=state.gear==="R",steer=(input.left?1:0)+(input.right?-1:0);const accel=throttle?(reverse?10:10):2.5; state.speed=THREE.MathUtils.damp(state.speed,throttle?(reverse?-8:8):0,accel,dt); state.heading+=steer*dt*1.2; if(car){car.rotation.y=state.heading;const forward=new THREE.Vector3(0,0,1).applyQuaternion(car.quaternion).normalize();state.posX+=forward.x*state.speed*dt*2;state.posZ+=forward.z*state.speed*dt*2;car.position.set(state.posX,0,state.posZ);}} 
function createRetroPlayerCar(){
  const builder=new RetroCarBuilder({color:0x252b31,type:"sedan",year:1975,damageLevel:state.damage});
  const root=builder.getGroup();
  root.name="RetroCar_Player";
  root.userData.retroBuilder=builder;
  root.userData.workshopMode=false;
  root.userData.visualOffsetY=0;
  root.userData.physicsBodyOffsetY=1.2;
  // Do not create service parts from the retired procedural builder.
  // The authoritative R18 GLB populates serviceParts/articulation asynchronously.
  // If the GLB has not finished loading yet, keep these containers empty and let
  // waitForPlayerModel() synchronize them after modelLoading becomes false.
  if(!root.userData.serviceParts) root.userData.serviceParts={};
  if(!root.userData.articulation) root.userData.articulation={
    doors:[],hood:null,trunk:null,steering:null
  };
  root.userData.wheels=root.userData.wheels||[];

  state.car.doorsOpen=false;
  state.car.hoodOpen=false;
  state.car.trunkOpen=false;
  state.car.articulationActive=true;
  state.car.name="Retro Car";
  state.car.year=1975;

  if(state.car.partStateVersion!==PART_STATE_VERSION){
    state.car.partState={};
    state.car.partStateVersion=PART_STATE_VERSION;
  }
  initializeCarParts(state);
  syncCarPartsFromCatalog(root,state);
  root.traverse(o=>{
    if(o.isMesh){
      o.castShadow=true;
      o.receiveShadow=true;
      o.frustumCulled=true;
    }
  });
  for(const [key,part] of Object.entries(root.userData.serviceParts)){
    const savedPart=state.car.partState?.[key];
    part.condition=typeof savedPart?.condition==="number"?savedPart.condition:100;
    part.installed=savedPart?.installed!==false;
    // Installed parts are part of the authoritative GLB and stay visible
    // in city, garage and workshop. Removal alone hides the actual node.
    part.mesh.visible=part.installed;
  }
  root.updateWorldMatrix(true,true,true);
  return root;
}
function replacePlayerCarWithRetro(){
  const old=car;
  const retro=createRetroPlayerCar();
  retro.position.copy(old?.position||new THREE.Vector3(state.posX,0,state.posZ));
  retro.rotation.y=old?.rotation?.y??state.heading;
  car=retro;
  if(scene){
    if(old) scene.remove(old);
    scene.add(car);
  }
  if(physicsReady&&chassisBody){
    const p=chassisBody.translation();
    car.position.set(p.x,p.y-(car.userData?.physicsBodyOffsetY??1.2),p.z);
  }
  syncCarPartsFromCatalog(car,state);
  save();
  return car;
}
async function swapToRetroCar(){
  try{
    replacePlayerCarWithRetro();
    msg("🚗 Retro Car загружена — это основная машина игрока");
  }catch(err){
    window.MechanicCityDebugLog?.({type:"retro-car",message:String(err?.message||err),stack:String(err?.stack||"")});
    console.warn("Retro Car creation failed; procedural fallback remains.",err);
  }
}
function save(){localStorage.setItem("mechanic-city",JSON.stringify(state));}
function clearJobMarker(){if(jobMarker&&scene){scene.remove(jobMarker);jobMarker=null;}}
function createJobMarker(){clearJobMarker();if(!state.job||!scene)return; const g=new THREE.Group(); const ring=new THREE.Mesh(new THREE.TorusGeometry(2.4,.1,10,32),new THREE.MeshBasicMaterial({color:0x7cf09d,transparent:true,opacity:.8})); ring.rotation.x=Math.PI/2; g.add(ring); g.position.set(state.job.targetX,0.2,state.job.targetZ); scene.add(g); jobMarker=g; }
function updateJob(){if(!state.job||!state.driving)return; const d=Math.hypot(state.posX-state.job.targetX,state.posZ-state.job.targetZ); if(jobMarker){ jobMarker.rotation.y+=.012; jobMarker.position.y=Math.sin(performance.now()/180)*.08+.2; } if(d<3){ msg("✅ Задание выполнено"); state.job=null; clearJobMarker(); save(); }}
function installVisualInspectMode(){
  const params=new URLSearchParams(location.search);
  if(params.get("inspect")!=="1") return;
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
      cameraAttached:!!(camera&&scene&&camera.parent===scene&&!!car),
      cameraPosition:camera?{x:camera.getWorldPosition(new THREE.Vector3()).x,y:camera.getWorldPosition(new THREE.Vector3()).y,z:camera.getWorldPosition(new THREE.Vector3()).z}:null,
      viewport:{width:viewport.clientWidth,height:viewport.clientHeight},
      physicsReady,
      physicsError,
      errors:errors.slice(-10)
    }),
    screenshot:()=>renderer?.domElement?.toDataURL("image/png")||null,
    setCamera:(n)=>{
      cameraMode=Math.max(0,Math.min(2,Number(n)||0));
      camOrbitYaw=0;
      camOrbitPitch=.18;
      if(camera){
        camera.fov=cameraMode===2?82:cameraMode===1?68:62;
        camera.updateProjectionMatrix();
      }
      return window.MechanicCityInspect.getState();
    },
    setScene:(name)=>{
      if(["city","workshop","garage","market","junkyard","dealer","jobs","settings"].includes(name)){
        renderScene(name);
      }
      return window.MechanicCityInspect.getState();
    }
  };
  const requestedCamera=params.get("camera");
  if(requestedCamera!==null) window.MechanicCityInspect.setCamera(requestedCamera);
  const requestedScene=params.get("scene");
  if(requestedScene&&requestedScene!=="city") window.MechanicCityInspect.setScene(requestedScene);
}
function installAITestMode(){ if(new URLSearchParams(location.search).get("test")!=="1")return;
  window.MechanicCityTest={version:2,getState:()=>{
    const cp=camera?camera.getWorldPosition(new THREE.Vector3()):null;
    const rp=renderer?.domElement;
    return {
      scene:state.scene,
      position:{x:state.posX,z:state.posZ},
      speed:state.speed,heading:state.heading,gear:state.gear,fuel:state.fuel,heat:state.heat,damage:state.damage,
      gas:input.gas,throttle:state.throttle,driving:state.driving,
      physics:{ready:physicsReady,error:physicsError||window.MechanicCityPhysicsError||null,world:!!physicsWorld,chassis:!!chassisBody,rapierInit:!!RAPIER?.init},
      errors:{
        build:window.MechanicCityBuildError||null,
        glb:window.MechanicCityGLBError||null,
        model:car?.userData?.modelLoadError||null,
        frame:window.MechanicCityLastFrameError||null,
        render:window.MechanicCityRenderError||null,
        emergency:window.MechanicCityEmergencyError||null
      },
      camera:{
        mode:cameraMode,name:cameraModeNames[cameraMode]||null,attached:!!(camera&&scene&&camera.parent===scene&&!!car),
        parent:camera?.parent?{type:camera.parent.type,name:camera.parent.name||null}:null,
        position:cp?{x:cp.x,y:cp.y,z:cp.z}:null
      },
      renderer:rp?{width:rp.width,height:rp.height,cssWidth:rp.clientWidth,cssHeight:rp.clientHeight,calls:renderer.info?.render?.calls||0,triangles:renderer.info?.render?.triangles||0}:null,
      sceneObjects:scene?.children?.length||0,
      car:{
        ...state.car,
        exists:!!car,
        name:car?.name||null,
        children:car?.children?.length||0,
        visible:car?.visible??false,
        modelLoading:!!car?.userData?.modelLoading,
        modelDiagnostics:car?.userData?.modelDiagnostics||null,
        position:car?{x:car.position.x,y:car.position.y,z:car.position.z}:null
      },
      runtimeLog:(window.MechanicCityRuntimeErrors||[]).slice(-12)
    };
  },action:(name,value)=>{ if(name==="gas"){input.gas=!!value;state.throttle=!!value;if(value&&state.fuel>0){ if(state.gear==="P"||state.gear==="N")state.gear="D"; state.driving=true;}} else if(name==="brake"){input.brake=!!value;} else if(name==="left"){input.left=!!value;if(value)state.driving=true;} else if(name==="right"){input.right=!!value;if(value)state.driving=true;} else if(name==="teleportCenter"){teleportToMapCenter();} else if(name==="gear"){ if(["P","R","N","D"].includes(value)){state.gear=value;if(value==="D"||value==="R")state.driving=true;if(value==="P")state.driving=false;}} else if(name==="camera"){const n=Math.max(0,Math.min(2,Number(value)));cameraMode=n;camOrbitYaw=0;camOrbitPitch=.18;if(camera){camera.fov=n===2?82:n===1?68:62;camera.updateProjectionMatrix();}} else if(name==="scene"&&["city","workshop","garage","market","junkyard","dealer","jobs","settings"].includes(value))renderScene(value); else if(name==="refuel"){state.fuel=100;save();} else if(name==="repair"){state.damage=0;state.car.condition=100;save();} return window.MechanicCityTest.getState();}}; const box=document.createElement("div"); box.id="ai-test-panel"; box.style.cssText="position:fixed;top:8px;left:8px;z-index:99999;background:rgba(0,0,0,.82);color:#fff;padding:8px;font:12px monospace;"; box.innerHTML="<b>AI TEST MODE</b><pre id='ai-test-state'></pre><div style='display:grid;grid-template-columns:repeat(3,1fr);gap:4px'><button data-a='left'>←</button><button data-a='gas'>GAS</button><button data-a='brake'>BRAKE</button></div><div style='display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-top:6px'><button data-c='0'>F</button><button data-c='1'>O</button><button data-c='2'>H</button></div>"; document.body.appendChild(box); box.querySelectorAll("[data-a]").forEach(b=>{const a=b.dataset.a;b.onpointerdown=e=>{e.preventDefault();window.MechanicCityTest.action(a,true)};b.onpointerup=e=>{e.preventDefault();window.MechanicCityTest.action(a,false)};}); box.querySelectorAll("[data-c]").forEach(b=>b.onclick=()=>window.MechanicCityTest.action("camera",b.dataset.c)); setInterval(()=>{const s=window.MechanicCityTest.getState(); const el=document.querySelector("#ai-test-state"); if(el)el.textContent=JSON.stringify(s,null,2).slice(0,2400)},250); }
function msg(t){messageEl.textContent=t;}
function stats(){speedEl.textContent=Math.round(state.speed*62);gearEl.textContent=state.gear||"P";fuelEl.textContent=Math.round(state.fuel);heatEl.textContent=Math.round(state.heat);clockEl.textContent=(function(){const h=Math.floor(state.time%24);const m=Math.floor((state.time%1)*60);return String(h).padStart(2,"0")+":"+String(m).padStart(2,"0");})();}
function makeCar(color=0x7a3f2e,detailedLights=true){ const g=new THREE.Group(); const paint=new THREE.MeshStandardMaterial({color,metalness:.48,roughness:.30}); const paintDark=new THREE.MeshStandardMaterial({color:new THREE.Color(color).multiplyScalar(.72),metalness:.42,roughness:.34}); const chrome=new THREE.MeshStandardMaterial({color:0xc7cbc8,metalness:.92,roughness:.18}); const darkChrome=new THREE.MeshStandardMaterial({color:0x24282a,metalness:.72,roughness:.24}); const glass=new THREE.MeshStandardMaterial({color:0x263b43,metalness:.10,roughness:.16}); const rubber=new THREE.MeshStandardMaterial({color:0x08090a,roughness:.96}); const light=new THREE.MeshStandardMaterial({color:0xfff2c9,emissive:0xff9d24,emissiveIntensity:1.05,roughness:.18}); const tail=new THREE.MeshStandardMaterial({color:0xa3161c,emissive:0x3b0004,emissiveIntensity:.55,roughness:.25});
 const body=new THREE.Mesh(new RoundedBoxGeometry(3.04,.66,4.98,4,.11),paint); body.position.y=.62; body.castShadow=true; body.receiveShadow=true; g.add(body); const lower=new THREE.Mesh(new RoundedBoxGeometry(2.92,.27,4.78,4,.07),paintDark); lower.position.set(0,.42,.04); lower.castShadow=true; g.add(lower); const hood=new THREE.Mesh(new RoundedBoxGeometry(2.68,.22,1.62,4,.06),paint); hood.position.set(0,.99,-1.57); hood.castShadow=true; g.add(hood); const hoodEdge=new THREE.Mesh(new THREE.BoxGeometry(2.48,.035,.055),chrome); hoodEdge.position.set(0,1.105,-2.38); g.add(hoodEdge); const hoodBulge=new THREE.Mesh(new RoundedBoxGeometry(.82,.10,1.22,2,.035),paintDark); hoodBulge.position.set(0,1.105,-1.58); g.add(hoodBulge); const trunk=new THREE.Mesh(new RoundedBoxGeometry(2.58,.24,1.04,4,.06),paint); trunk.position.set(0,.96,1.82); trunk.castShadow=true; g.add(trunk);
 const cabinGeo=new THREE.BufferGeometry(); cabinGeo.setAttribute("position",new THREE.Float32BufferAttribute([ -1.06,.98,-.80,  1.06,.98,-.80,  1.06,.98,1.38,  -1.06,.98,1.38, -.80,1.66,-.43,  .80,1.66,-.43,  .80,1.66,1.08,  -.80,1.66,1.08 ],3)); cabinGeo.setIndex([0,1,5, 0,5,4, 1,2,6, 1,6,5, 2,3,7, 2,7,6, 3,0,4, 3,4,7, 4,5,6, 4,6,7, 3,2,1, 3,1,0]); cabinGeo.computeVertexNormals(); const cabin=new THREE.Mesh(cabinGeo,paint); cabin.castShadow=true; cabin.receiveShadow=true; g.add(cabin); const roof=new THREE.Mesh(new THREE.BoxGeometry(1.62,.10,1.62),paint); roof.position.set(0,1.68,.32); g.add(roof); const roofTrim=new THREE.Mesh(new THREE.BoxGeometry(1.74,.045,1.74),chrome); roofTrim.position.set(0,1.69,.32); g.add(roofTrim); const belt=new THREE.Mesh(new THREE.BoxGeometry(2.84,.055,3.42),chrome); belt.position.set(0,.99,.24); g.add(belt); for(const x of[-1.445,1.445]){ const line=new THREE.Mesh(new THREE.BoxGeometry(.035,.06,3.72),chrome); line.position.set(x,.74,.20); g.add(line);} for(const z of[-.72,.60]){ const seam=new THREE.Mesh(new THREE.BoxGeometry(.018,.58,.025),darkChrome); seam.position.set(-1.455,.94,z); g.add(seam); const seam2=seam.clone(); seam2.position.x=1.455; g.add(seam2);} for(const x of[-1.34,1.34]) for(const z of[-1.48,1.48]){ const fender=new THREE.Mesh(new THREE.TorusGeometry(.52,.085,7,18,Math.PI),paint); fender.rotation.y=Math.PI/2; fender.position.set(x,.60,z); fender.scale.set(1,1,.92); g.add(fender);} const grille=new THREE.Mesh(new RoundedBoxGeometry(1.55,.34,.10,3,.025),darkChrome); grille.position.set(0,.69,-2.55); g.add(grille); for(let i=-5;i<=5;i++){ const bar=new THREE.Mesh(new THREE.BoxGeometry(.055,.20,.035),chrome); bar.position.set(i*.12,.69,-2.595); g.add(bar);} const frontBumper=new THREE.Mesh(new RoundedBoxGeometry(2.68,.18,.18,3,.04),chrome); frontBumper.position.set(0,.48,-2.58); g.add(frontBumper); const rearBumper=frontBumper.clone(); rearBumper.position.z=2.60; g.add(rearBumper); for(const x of[-.86,.86]){ const h=new THREE.Mesh(new THREE.CylinderGeometry(.29,.29,.10,20),light); h.rotation.x=Math.PI/2; h.position.set(x,.78,-2.58); g.add(h); const bezel=new THREE.Mesh(new THREE.TorusGeometry(.31,.035,8,20),chrome); bezel.rotation.x=Math.PI/2; bezel.position.set(x,.78,-2.635); g.add(bezel); const t=new THREE.Mesh(new THREE.BoxGeometry(.68,.20,.08),tail); t.position.set(x,.76,2.57); g.add(t); const tbar=new THREE.Mesh(new THREE.BoxGeometry(.045,.17,.035),chrome); tbar.position.set(x,.76,2.62); g.add(tbar);} for(const x of[-1.40,1.40]){ const mirror=new THREE.Mesh(new RoundedBoxGeometry(.20,.14,.30,5,.04),chrome); mirror.position.set(x,1.17,-.56); g.add(mirror); const handle=new THREE.Mesh(new RoundedBoxGeometry(.22,.045,.055,4,.015),chrome); handle.position.set(x,.99,.48); g.add(handle);} const plateMat=new THREE.MeshStandardMaterial({color:0xe8e4d8,roughness:.55}); const frontPlate=new THREE.Mesh(new RoundedBoxGeometry(.62,.18,.035,3,.015),plateMat); frontPlate.position.set(0,.57,-2.67); g.add(frontPlate); const rearPlate=frontPlate.clone(); rearPlate.position.z=2.67; g.add(rearPlate); const wheelParts=[]; for(const x of[-1.34,1.34]) for(const z of[-1.52,1.52]){ const wg=new THREE.Group(); wg.position.set(x,.43,z); const tire=new THREE.Mesh(new THREE.CylinderGeometry(.43,.43,.30,12),rubber); tire.rotation.z=Math.PI/2; tire.castShadow=true; wg.add(tire); const rim=new THREE.Mesh(new THREE.CylinderGeometry(.255,.255,.31,12),chrome); rim.rotation.z=Math.PI/2; wg.add(rim); const hub=new THREE.Mesh(new THREE.CylinderGeometry(.10,.10,.32,10),darkChrome); hub.rotation.z=Math.PI/2; wg.add(hub); wheelParts.push(wg); g.add(wg);} const rearLip=new THREE.Mesh(new RoundedBoxGeometry(2.20,.10,.20,5,.035),paint); rearLip.position.set(0,.99,2.10); g.add(rearLip); for(const x of[-.48,.48]){ const ex=new THREE.Mesh(new THREE.CylinderGeometry(.065,.075,.25,12),chrome); ex.rotation.x=Math.PI/2; ex.position.set(x,.42,2.66); g.add(ex);} g.userData.wheels=wheelParts; return g; }
function updateCarDamage(){if(!car)return;const mark=car.userData.damageMark;if(mark)mark.visible=state.damage>25;if(state.damage>65&&smoke.length===0)for(let i=0;i<5;i++){const p=new THREE.Mesh(new THREE.SphereGeometry(.12,8,8),new THREE.MeshBasicMaterial({color:0x665341,transparent:true,opacity:.7}));p.position.set(Math.random()-.5,1.2+Math.random()*.6,Math.random()-.5);scene.add(p);smoke.push(p);}}
function addTree(x,z,s=1){const g=new THREE.Group();const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.14*s,.2*s,2.2*s,8),new THREE.MeshStandardMaterial({color:0x4b3423,roughness:1}));trunk.position.y=1.1*s;g.add(trunk);const leaf=new THREE.Mesh(new THREE.ConeGeometry(.95*s,2.3*s,10),new THREE.MeshStandardMaterial({color:0x3e7c43,roughness:1}));leaf.position.y=2.8*s;g.add(leaf);g.position.set(x,0,z);scene.add(g);}
function addTrafficLight(x,z){const pole=new THREE.Mesh(new THREE.CylinderGeometry(.06,.06,3.1,8),new THREE.MeshStandardMaterial({color:0x202326,roughness:.55,metalness:.5}));pole.position.set(x,1.55,z);scene.add(pole);const base=new THREE.Mesh(new THREE.BoxGeometry(.5,.18,.18),new THREE.MeshStandardMaterial({color:0x2a2d30,roughness:.6}));base.position.set(x,3.05,z);scene.add(base);const red=new THREE.Mesh(new THREE.BoxGeometry(.16,.18,.12),new THREE.MeshStandardMaterial({color:0xff0000,emissive:0x440000,emissiveIntensity:.6}));red.position.set(x,3.15,z);scene.add(red);const yellow=new THREE.Mesh(new THREE.BoxGeometry(.16,.18,.12),new THREE.MeshStandardMaterial({color:0xffb000,emissive:0x442200,emissiveIntensity:.6}));yellow.position.set(x,2.9,z);scene.add(yellow);const green=new THREE.Mesh(new THREE.BoxGeometry(.16,.18,.12),new THREE.MeshStandardMaterial({color:0x00ff44,emissive:0x004400,emissiveIntensity:.6}));green.position.set(x,2.65,z);scene.add(green);trafficLights.push({red,yellow,green});}
function addRain(){rainDrops=[];const positions=new Float32Array(180*3);for(let i=0;i<180;i++){positions[i*3]=(Math.random()-.5)*100;positions[i*3+1]=Math.random()*38+2;positions[i*3+2]=(Math.random()-.5)*100;} const geo=new THREE.BufferGeometry(); geo.setAttribute("position",new THREE.BufferAttribute(positions,3)); const mat=new THREE.PointsMaterial({color:0x9ec9ff,size:.08,transparent:true,opacity:.6}); const pts=new THREE.Points(geo,mat); pts.name="rain"; scene.add(pts); rainDrops.push(pts); }
const buildingWindowMats={lit:new THREE.MeshStandardMaterial({color:0xffd98a,emissive:0xffa52b,emissiveIntensity:.75,roughness:.25,metalness:.05}),dark:new THREE.MeshStandardMaterial({color:0x1b2b35,emissive:0x050a0d,emissiveIntensity:.4,roughness:.25,metalness:.05})};
function addBuilding(x,z,w,h,d,color){const g=new THREE.Group();const mat=new THREE.MeshStandardMaterial({color,roughness:.68,metalness:.04,map:buildingTex});const b=new THREE.Mesh(new RoundedBoxGeometry(w,h,d,3,.08),mat);b.position.y=h/2;b.castShadow=true;b.receiveShadow=true;g.add(b);const roof=new THREE.Mesh(new RoundedBoxGeometry(w+.22,.18,d+.22,3,.04),new THREE.MeshStandardMaterial({color:0x25282b,roughness:.65,metalness:.15,map:metalTex}));roof.position.y=h+.09;roof.castShadow=true;g.add(roof);const rows=Math.max(1,Math.floor(h/1.8)),cols=Math.max(1,Math.floor(w/1.55));for(let r=0;r<rows;r++)for(let q=0;q<cols;q++){const lit=(r*3+q*5)%7<2;const win=new THREE.Mesh(new RoundedBoxGeometry(.58,.68,.035,2,.04),lit?buildingWindowMats.lit:buildingWindowMats.dark);win.position.set(-w/2+.78+q*(w-1.3)/Math.max(1,cols-1),.9+r*1.55,d/2+.025);g.add(win);const win2=win.clone();win2.position.z=-d/2-.025;win2.rotation.y=Math.PI;g.add(win2);}g.position.set(x,0,z);scene.add(g);}
function addParkedCar(x,z,color){const g=new THREE.Group();const paint=new THREE.MeshStandardMaterial({color,roughness:.25,metalness:.62,envMapIntensity:.8});const body=new THREE.Mesh(new RoundedBoxGeometry(1.7,.42,3.15,5,.12),paint);body.position.y=.45;g.add(body);const cabin=new THREE.Mesh(new RoundedBoxGeometry(1.42,.48,1.5,5,.12),new THREE.MeshStandardMaterial({color:0x1a2024,roughness:.12,metalness:.18}));cabin.position.set(0,.76,.08);g.add(cabin);for(const xw of[-.84,.84])for(const zw of[-.98,.98]){const w=new THREE.Mesh(new THREE.CylinderGeometry(.25,.25,.18,12),new THREE.MeshStandardMaterial({color:0x090a0b,roughness:.95}));w.rotation.z=Math.PI/2;w.position.set(xw,.32,zw);g.add(w);}g.position.set(x,.05,z);scene.add(g);}
function addStreetProps(){for(let i=-8;i<=8;i+=2){const bin=new THREE.Mesh(new RoundedBoxGeometry(.5,.8,.5,3,.08),new THREE.MeshStandardMaterial({color:0x263238,roughness:.9,map:metalTex}));bin.position.set(i*4,.4,18+(i%3)*2);bin.castShadow=true;scene.add(bin);}const colors=[0x6d7882,0x7f3131,0x66724a,0x27394a,0x8c744c];for(let i=0;i<22;i++)addParkedCar((i%6)*13-32,Math.floor(i/6)*24-54,colors[i%colors.length]);}
function workshopPartOffset(part){const n=part.name.toLowerCase();if(part.category==="wheels") return new THREE.Vector3(n.includes("_fl")||n.includes("_rl")?-2.8:2.8, .55, n.includes("_f")?-1.2:1.2); if(part.category==="engine") return new THREE.Vector3(-.15,1.9,-2.1); if(part.category==="transmission") return new THREE.Vector3(.15,1.55,-.2); if(part.category==="brakes") return new THREE.Vector3(n.includes("_l")?-2.5:2.5,1.05,n.includes("_f")?-2.0:1.7); if(part.category==="suspension") return new THREE.Vector3(n.includes("_l")?-2.4:2.4,1.35,n.includes("_f")?-1.4:1.3); if(part.category==="exhaust") return new THREE.Vector3(0,.7,2.8); if(part.category==="interior") return new THREE.Vector3(0,2.1,.8); if(part.category==="lights") return new THREE.Vector3(0,1.35,n.includes("head")?-2.9:2.9); if(part.category==="glass") return new THREE.Vector3(n.includes("side")?(n.includes("_l")?-2.4:2.4):0,1.7,n.includes("rear")?2.6:-2.6); if(part.category==="body"){ if(/door/.test(n)) return new THREE.Vector3(n.includes("_l")?-2.3:2.3,1.0,n.includes("front")?-.65:.75); if(/hood/.test(n)) return new THREE.Vector3(0,1.55,-3.0); if(/trunk/.test(n)) return new THREE.Vector3(0,1.45,3.0); if(/bumper/.test(n)) return new THREE.Vector3(0,.75,n.includes("front")?-3.2:3.2);} return new THREE.Vector3((Math.random()-.5)*3.8,1.2,(Math.random()-.5)*4.8);}
function disassembleWorkshopCar(){if(car) car.userData.workshopDisassembled=false;}
function assembleWorkshopCar(){if(!car)return; const model=car.children.find(o=>o.name==="MechanicCity_Coupe_Repaired"); model?.traverse(o=>{ const r=o.userData?.workshopRest; if(r){o.position.copy(r.p);o.rotation.copy(r.r);o.scale.copy(r.s);} }); car.userData.workshopDisassembled=false; state.car.workshopIntroDone=true; state.onFoot=false; save(); msg("🔧 Машина собрана. Можно выезжать из мастерской."); renderScene("city"); }
function getViewportSize(){
  const vv=window.visualViewport;
  const w=Math.max(1,Math.round(viewport?.clientWidth||vv?.width||window.innerWidth||1));
  const h=Math.max(1,Math.round(viewport?.clientHeight||vv?.height||window.innerHeight||1));
  return {w,h};
}
function forceViewportLayout(){
  if(!viewport)return getViewportSize();
  const vv=window.visualViewport;
  const rawW=viewport.clientWidth||window.innerWidth||vv?.width||1;
  const rawH=viewport.clientHeight||window.innerHeight||vv?.height||1;
  const w=Math.max(1,Math.min(4096,Math.round(rawW)));
  const h=Math.max(1,Math.min(4096,Math.round(rawH)));
  viewport.style.position="absolute";
  viewport.style.left="0"; viewport.style.top="0";
  viewport.style.width=w+"px"; viewport.style.height=h+"px";
  viewport.style.minWidth=w+"px"; viewport.style.minHeight=h+"px";
  return {w,h};
}
function syncRendererSize(){
  if(!renderer||!camera)return;
  const size=forceViewportLayout();
  renderer.setSize(size.w,size.h,false);
  camera.aspect=size.w/size.h;
  camera.updateProjectionMatrix();
}
function buildWorkshop(){ stop(); clearJobMarker(); traffic=[]; trafficLights=[]; smoke=[]; rainDrops=[]; scene=new THREE.Scene(); scene.background=new THREE.Color(0x1a1d20); camera=new THREE.PerspectiveCamera(52,getViewportSize().w/getViewportSize().h,.1,120); viewport.innerHTML=""; const probe=document.createElement("canvas"); renderer=new THREE.WebGLRenderer({canvas:probe,antialias:false,alpha:false,preserveDrawingBuffer:false,powerPreference:"high-performance"});
    renderer.debug.checkShaderErrors=true; renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5)); renderer.setSize(getViewportSize().w,getViewportSize().h,false); renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFShadowMap; renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.12; renderer.domElement.style.width="100%"; renderer.domElement.style.height="100%"; renderer.domElement.style.display="block"; viewport.appendChild(renderer.domElement); setupCameraControls(); const hemi=new THREE.HemisphereLight(0xb9c9d8,0x16181a,1.35); scene.add(hemi); const key=new THREE.DirectionalLight(0xffffff,2.1); key.position.set(5,10,-7); key.castShadow=true; key.shadow.mapSize.set(1024,1024); scene.add(key); const floor=new THREE.Mesh(new THREE.PlaneGeometry(80,60),new THREE.MeshStandardMaterial({color:0x4a4a47,roughness:.98,map:sidewalkTex})); floor.rotation.x=-Math.PI/2; floor.receiveShadow=true; scene.add(floor); car=createRetroPlayerCar(); car.position.set(0,0.02,0); car.rotation.y=0; scene.add(car); car.userData.workshopMode=true; Promise.resolve().then(()=>{ if(!car?.userData?.serviceParts)return; car.userData.workshopDisassembled=false; syncCarPartsFromCatalog(car,state); msg("🔧 Машина стоит прямо на полу мастерской. Нажми на деталь, чтобы открыть её обслуживание."); }).catch(err=>window.MechanicCityDebugLog?.({type:"workshop-load",message:String(err?.message||err)})); const label=document.createElement("div"); label.className="workshop-hud"; label.innerHTML="<div><b>МАСТЕРСКАЯ</b><span>Автомобиль собран. Выбери деталь для обслуживания.</span></div>"; viewport.appendChild(label); clock=new THREE.Clock(); const loop=()=>{ if(state.scene!=="workshop"||!renderer||!scene||!camera)return; requestAnimationFrame(loop); const dt=Math.min(clock.getDelta(),.05); updateArticulatedCar(dt); const box=car?new THREE.Box3().setFromObject(car,true):null; const center=box?.getCenter(new THREE.Vector3())||new THREE.Vector3(0,1,0); const size=box?.getSize(new THREE.Vector3())||new THREE.Vector3(5,1.5,5); const radius=Math.max(size.x,size.y,size.z); const inspectionDistance=Math.max(2.8,radius*.62); const desired=new THREE.Vector3(center.x+inspectionDistance*.78,center.y+inspectionDistance*.62,center.z+inspectionDistance*.78); camera.position.lerp(desired,.16); camera.lookAt(center); renderer.render(scene,camera); updateMechanicCityDebug(); }; loop(); }
async function buildCity(){ forceViewportLayout(); clearJobMarker(); traffic=[]; trafficLights=[]; smoke=[]; rainDrops=[]; scene=new THREE.Scene(); if(!Number.isFinite(state.posX)||!Number.isFinite(state.posZ)||Math.abs(state.posX)>70||Math.abs(state.posZ)>70){ state.posX=0; state.posZ=10; state.heading=0; save(); window.MechanicCityPositionReset={posX:state.posX,posZ:state.posZ,reason:"outside-city-bounds"}; } const night=state.time<6||state.time>=20,evening=state.time>=18&&state.time<20; scene.background=new THREE.Color(night?0x0b1220:0xc9d9e8); viewport.innerHTML=""; try{ const initialSize=getViewportSize(); camera=new THREE.PerspectiveCamera(58,initialSize.w/initialSize.h,.05,1000); camera.position.set(state.posX,5.8,state.posZ-8.6); camera.lookAt(state.posX,1,state.posZ); const probe=document.createElement("canvas"); probe.width=initialSize.w; probe.height=initialSize.h;
      // Let Three.js select the best supported graphics context. A hard WebGL2
      // gate must not abort the entire city before the asynchronous GLB loads.
      let webgl2=null; try{ webgl2=probe.getContext("webgl2"); }catch{}
      window.MechanicCityWebGL2={available:!!webgl2,userAgent:navigator.userAgent||"",reason:webgl2?null:"WebGL2 unavailable; using Three.js fallback context"};
      try{
        renderer=new THREE.WebGLRenderer({canvas:probe,antialias:false,alpha:false,preserveDrawingBuffer:false,powerPreference:"default",failIfMajorPerformanceCaveat:false});
      }catch(rendererErr){
        window.MechanicCityWebGLRendererError=String(rendererErr?.message||rendererErr);
        renderer=null;
        throw rendererErr;
      } window.MechanicCityWebGLRendererCreated=true; renderer.debug.checkShaderErrors=true; renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5)); renderer.setSize(initialSize.w,initialSize.h,false); renderer.setClearColor(night?0x0b1220:0xc9d9e8,1); renderer.autoClear=true; renderer.autoClearColor=true; renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFShadowMap; renderer.shadowMap.autoUpdate=true; renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.22; renderer.domElement.style.display="block"; renderer.domElement.style.width="100%"; renderer.domElement.style.height="100%"; viewport.appendChild(renderer.domElement); const gl=renderer.getContext(); window.MechanicCityWebGL={ok:true,version:gl.getParameter(gl.VERSION),renderer:gl.getParameter(gl.RENDERER)}; renderer.domElement.addEventListener("webglcontextlost",(event)=>{event.preventDefault();console.warn("WebGL context lost");msg("⚠️ Графика временно потеряла связь");},false); renderer.domElement.addEventListener("webglcontextrestored",()=>{console.info("WebGL context restored");try{syncRendererSize();}catch{}}); renderer.render(scene,camera);
      if(window.location.search.includes("debug=1") && !window.MechanicCityDebugMarker){
        const marker=new THREE.Mesh(
          new THREE.BoxGeometry(1,1,1),
          new THREE.MeshBasicMaterial({color:0xff00ff})
        );
        marker.name="MechanicCityDebugMarker";
        marker.position.set(state.posX,0.5,state.posZ);
        scene.add(marker);
        window.MechanicCityDebugMarker=marker;
      }
      }catch(err){ renderer=null; window.MechanicCityWebGLError={message:String(err?.message||err),stack:String(err?.stack||""),name:String(err?.name||"Error")}; console.error("WebGL renderer/render failed",err); viewport.innerHTML="<div class='graphics-error'><b>3D-графика не запустилась</b><span>"+String(err?.message||err)+"</span></div>"; return; }
   const hemi=new THREE.HemisphereLight(night?0x5d6f8d:0xbdd6e8,0x283029,night?.8:1.35); scene.add(hemi); const sun=new THREE.DirectionalLight(night?0x7d91b8:0xffead0,night?.65:2.6); sun.position.set(-10,20,-5); scene.add(sun); const groundMat=new THREE.MeshBasicMaterial({color:0x50534f}); const ground=new THREE.Mesh(new THREE.PlaneGeometry(220,220),groundMat); ground.rotation.x=-Math.PI/2; ground.receiveShadow=false; ground.name="MechanicCityCoreGround"; scene.add(ground);
  // Core fallback geometry uses unlit materials so the city remains visible even if a mobile GPU rejects a StandardMaterial shader.
  const coreMat=new THREE.MeshBasicMaterial({color:0x6b737a});
  const coreRoad=new THREE.Mesh(new THREE.BoxGeometry(18,.08,220),new THREE.MeshBasicMaterial({color:0x292c30}));
  coreRoad.position.set(0,.04,0); scene.add(coreRoad);
  for(const p of[[-32,0,-24],[30,0,-15],[14,0,32],[-20,0,34]]){ const b=new THREE.Mesh(new THREE.BoxGeometry(14,10,12),coreMat); b.position.set(p[0],5,p[2]); scene.add(b); }
  for(const z of[-70,-35,0,35,70])for(const side of[-1,1]){ for(let k=-3;k<=3;k++){ const stripe=new THREE.Mesh(new THREE.BoxGeometry(7,.025,.34),new THREE.MeshBasicMaterial({color:0xd9d7cc})); stripe.position.set(side*(k*12),0.03,z); scene.add(stripe); } } for(let x=-39;x<=39;x+=13)for(const z of[-48,48]){ const pole=new THREE.Mesh(new THREE.CylinderGeometry(.045,.07,3.8,8),new THREE.MeshStandardMaterial({color:0x22262a,metalness:.4,roughness:.55, map:metalTex})); pole.position.set(x,1.9,z); scene.add(pole); const lightBulb=new THREE.Mesh(new THREE.BoxGeometry(.12,.12,.12), new THREE.MeshStandardMaterial({color:0xfff7d1, emissive:0xffb000, emissiveIntensity:0.7})); lightBulb.position.set(x,3.8,z); scene.add(lightBulb); }
  // World decoration must never be able to kill the city render.
  // Keep the ground/camera alive even if one optional prop has a bad asset/material.
  try{
    addBuilding(-32,-24,14,11,10,0x6f7a82);
    addBuilding(30,-15,18,15,12,0x7b6f63);
    addBuilding(14,32,16,12,11,0x5e6d7a);
    addBuilding(-20,34,15,17,12,0x5d6667);
    addStreetProps();
  }catch(err){
    window.MechanicCityWorldPropsError=String(err?.message||err);
    window.MechanicCityDebugLog?.({type:"world-props",message:String(err?.message||err),stack:String(err?.stack||"")});
    console.warn("Optional city props failed; keeping core city alive.",err);
  }
  // Draw the core city immediately, before the asynchronous player/traffic setup.\n  // This guarantees the world is visible even if the R18 GLB or optional systems fail.\n  try{ renderer.render(scene,camera); window.MechanicCityCoreCityRendered=true; }catch(err){ window.MechanicCityCoreCityRenderError=String(err?.message||err); console.error("Core city render failed",err); }\n  // Player setup is independent from decorative props and always gets a chance to run.
  try{
    // Create exactly one persistent player root first. The visual Challenger GLB
    // loads asynchronously INSIDE this root, so the camera never binds to a
    // temporary/procedural car object.
    car=createRetroPlayerCar();
    car.position.set(state.posX,0,state.posZ);
    car.rotation.y=state.heading;
    scene.add(car);

    const attachPlayerCamera=()=>{
      if(!car||!camera)return;
      // Camera remains a scene child while the authoritative R18 GLB loads.
      if(camera.parent!==scene)scene.add(camera);
      camera.position.set(state.posX,5.7,state.posZ-8.6);
      camera.lookAt(state.posX,1,state.posZ);
      camera.updateMatrixWorld(true);
    };

    setupCameraControls();
    clock=new THREE.Clock();

    // Start the city renderer immediately. The authoritative R18 GLB loads asynchronously
    // inside the persistent player root and must never be allowed to block the world render loop.
    syncCarPartsFromCatalog(car,state);
    attachPlayerCamera();
    animate(traffic);
    setupVehiclePhysics().catch(err=>{window.MechanicCityDebugLog?.({type:"physics-async",message:String(err?.message||err),stack:String(err?.stack||"")}); console.warn("Async Rapier setup failed; fallback driving remains active.",err);});

    // Traffic is optional. A broken NPC car must never replace the authoritative player R18.
    try{
      for(let i=0;i<9;i++){
        const npc=makeCar([0x244b77,0x8a302c,0xc7b77d,0x3c3c3c][i%4],false);
        npc.scale.setScalar(.86);
        npc.position.set((i%4)*13-19,0,-12-i*18);
        npc.userData.speed=1.4+(i%3)*.35;
        npc.rotation.y=Math.PI;
        scene.add(npc);
        traffic.push(npc);
      }
    }catch(err){
      window.MechanicCityTrafficError=String(err?.message||err);
      window.MechanicCityDebugLog?.({type:"traffic",message:window.MechanicCityTrafficError,stack:String(err?.stack||"")});
      console.warn("Optional traffic creation failed; player R18 remains active.",err);
    }
    createJobMarker();
  }catch(err){
    window.MechanicCityBuildError=String(err?.message||err);
    window.MechanicCityDebugLog?.({type:"city-build",message:String(err?.message||err),stack:String(err?.stack||"")});
    console.error("Player/city setup failed",err);
    // Never replace the real R18 player with a procedural box.
    // Keep the scene alive; the persistent player root may still finish loading
    // /models/preview.glb asynchronously.
    if(renderer&&scene&&camera){
      try{
        if(!car){
          car=createRetroPlayerCar();
          car.position.set(state.posX,0,state.posZ);
          car.rotation.y=state.heading;
          scene.add(car);
        }
        if(camera.parent!==scene)scene.add(camera);
        camera.position.set(state.posX,5.7,state.posZ-8.6);
        camera.lookAt(state.posX,1,state.posZ);
        camera.updateMatrixWorld(true);
        renderer.render(scene,camera);
        animate(traffic);
      }catch(recoverErr){
        window.MechanicCityRecoveryError=String(recoverErr?.message||recoverErr);
        console.error("City recovery failed",recoverErr);
      }
    }
  }
}
function updateMechanicCityDebug(){
  if(!window.location.search.includes("debug=1")) return;
  let panel=document.getElementById("mechanic-debug");
  if(!panel){
    panel=document.createElement("pre");
    panel.id="mechanic-debug";
    panel.style.cssText="position:fixed;left:8px;top:8px;z-index:99999;margin:0;padding:8px;background:rgba(0,0,0,.82);color:#0f0;font:12px/1.35 monospace;white-space:pre-wrap;max-width:92vw;pointer-events:none";
    document.body.appendChild(panel);
  }
  const d=car?.userData?.modelDiagnostics;
  const g=window.MechanicCityGLBDiagnostics;
  const r=renderer;
  const webgl=window.MechanicCityWebGL2||null;
  panel.textContent=d
    ? "R18 GLB\\n"+JSON.stringify({
        rawGLB:g||null,
        runtime:{meshes:d.meshes,size:d.size,center:d.center,scale:d.scale,visible:d.visible,loading:d.loading,position:d.position,rotationY:d.rotationY},
        webgl2:webgl,
        rendererCreated:!!window.MechanicCityWebGLRendererCreated,
        loadError:window.MechanicCityGLBError||null,
        modelError:car?.userData?.modelLoadError||null
      },null,2)
    : "R18 GLB\\n"+JSON.stringify({
        rawGLB:g||null,
        webgl2:webgl,
        rendererCreated:!!window.MechanicCityWebGLRendererCreated,
        loading:!!car?.userData?.modelLoading,
        error:window.MechanicCityGLBError||car?.userData?.modelLoadError||null,
        children:car?.children?.length||0
      },null,2);
  if(r) panel.textContent+="\nRenderer\n"+JSON.stringify({width:r.domElement.width,height:r.domElement.height,calls:r.info.render.calls,triangles:r.info.render.triangles},null,2);
}

function animate(traffic=[]){ if(renderer?.setAnimationLoop && window.MechanicCityAnimationRenderer!==renderer){ window.MechanicCityAnimationRenderer=renderer; renderer.setAnimationLoop(()=>animate(traffic)); return; } if(state.scene!=="city")return; if(!renderer||!scene||!camera)return; const dt=Math.min(clock?.getDelta()||.016,.05); try{ if((state.driving||state.throttle||input.gas)&&state.fuel>0){ physicsDrive(dt); if(state.fuel>0) state.fuel=Math.max(0,state.fuel-dt*(.018+Math.abs(state.speed)*.014)); state.car.oil=Math.max(0,state.car.oil-dt*.004); state.car.coolant=Math.max(0,state.car.coolant-dt*.002); state.heat=Math.min(125,state.heat+dt*(.08+Math.abs(state.speed)*.055)); if(state.car.oil<15||state.car.coolant<15)state.damage=Math.min(100,state.damage+dt*.08); state.car.mileage+=Math.abs(state.speed)*dt*.006; if(state.heat>108)state.damage=Math.min(100,state.damage+dt*.06); for(const npc of traffic){ if(!npc?.position||!car?.position)continue; const d=car.position.distanceTo(npc.position); if(d<2.25&&Math.abs(state.speed)>.35){ state.damage=Math.min(100,state.damage+dt*7); if(chassisBody){ const v=chassisBody.linvel(); chassisBody.setLinvel({x:v.x*.65,y:v.y,z:v.z*.65},true);} msg("⚠️ Столкновение: кузов повреждён."); } } if(Date.now()-lastSaveTick>5000){lastSaveTick=Date.now();save();} }
 updateJob(); updateArticulatedCar(dt); updateMechanicCityDebug(); if(!car?.rotation||!car?.position)return; const moving=Math.abs(state.speed)>.25;
  // HARD CAMERA FOLLOW: keep the camera independent from the loading GLB root.
  // This prevents an invisible/loading vehicle from affecting the render camera.
  if(camera){
    if(camera.parent!==scene)scene.add(camera);
    const distance=moving?9.4:8.6;
    const height=(moving?6.1:5.7)+Math.sin(camOrbitPitch)*distance*.55;
    const yaw=state.heading+camOrbitYaw;
    if(cameraMode===2){
      const hoodOffset=new THREE.Vector3(0,1.35,.55);
      hoodOffset.applyAxisAngle(new THREE.Vector3(0,1,0),state.heading);
      camera.position.copy(car.position).add(hoodOffset);
      camera.lookAt(car.position.x,1.05,car.position.z);
    }else{
      const back=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw));
      camera.position.copy(car.position).addScaledVector(back,Math.max(1.2,Math.cos(camOrbitPitch)*distance));
      camera.position.y+=height;
      camera.lookAt(car.position.x,1.0,car.position.z);
    }
    camera.updateMatrixWorld(true);
  }
 for(const npc of traffic){ if(!npc?.position)continue; const travel=dt*(Number(npc.userData?.trafficSpeed)||0)*8; npc.position.z+=travel; for(const w of(npc.userData?.wheels||[])){ if(w?.rotation)w.rotation.x-=travel/.39; } if(npc.position.z>120)npc.position.z=-120; } const cycle=(performance.now()/1000)%12; const green=cycle<6,yellow=cycle>=6&&cycle<7.5; for(const l of trafficLights){ if(!l?.red?.material?.color||!l?.yellow?.material?.color||!l?.green?.material?.color)continue; l.red.material.color.setHex(green?0x220000:yellow?0x220000:0xff0000); l.yellow.material.color.setHex(yellow?0xffb000:0x332600); l.green.material.color.setHex(green?0x00ff44:0x002200); } updateCarDamage(); stats(); }catch(err){ window.MechanicCityLastFrameError=String(err?.message||err); window.MechanicCityDebugLog?.({type:"frame",message:window.MechanicCityLastFrameError,stack:String(err?.stack||"")}); console.error("Mechanic City frame update failed",err);} finally{ try{renderer.render(scene,camera);}catch(err){ window.MechanicCityRenderError=String(err?.message||err); console.error("Mechanic City render failed",err); } }}
function teleportToMapCenter(){
  if(state.scene!=="city"||!car){msg("🎯 Телепорт доступен в городе.");return;}
  const centerX=0, centerZ=0;
  state.posX=centerX;
  state.posZ=centerZ;
  state.heading=0;
  state.speed=0;
  state.steer=0;
  state.driving=false;
  state.gear="D";
  input.gas=input.brake=input.left=input.right=false;
  car.position.set(centerX,car.position.y,centerZ);
  car.rotation.y=state.heading;
  if(chassisBody){
    try{
      chassisBody.setTranslation({x:centerX,y:1.2,z:centerZ},true);
      chassisBody.setRotation({x:0,y:0,z:0,w:1},true);
      chassisBody.setGravityScale(1,true);
      chassisBody.setLinvel({x:0,y:0,z:0},true);
      chassisBody.setAngvel({x:0,y:0,z:0},true);
    }catch{}
  }
  save();
  msg("🎯 Машина телепортирована в центр карты");
}
function driveOn(){if(state.fuel<=0){msg("⛽ Бак пуст — нужна заправка.");return;}if(state.gear==="P"||state.gear==="N")state.gear="D";state.driving=true;msg("За рулём.");}
function setupCameraControls(){
  if(!renderer||!viewport)return;
  const el=viewport;
  el.style.touchAction="none";
  // Allow the gas pedal to remain held while the same touch also rotates the camera.
  const isControlTarget=e=>{
    const target=e.target?.closest?.(".mobile-drive-controls,.floating-bar,.menu,.panel");
    if(!target)return false;
    const gas=e.target?.closest?.('[data-drive="gas"]');
    return !gas;
  };
  const begin=(x,y)=>{camDragging=true;camLastX=x;camLastY=y;};
  const move=(x,y,e)=>{
    if(!camDragging)return;
    if(e?.cancelable)e.preventDefault();
    const dx=x-camLastX,dy=y-camLastY;
    camLastX=x;camLastY=y;
    camOrbitYaw-=dx*.012;
    camOrbitPitch=Math.min(.9,Math.max(-.45,camOrbitPitch+dy*.008));
  };
  const end=()=>{camDragging=false;};
  // Listen on the viewport in capture phase so HUD layers cannot swallow the
  // gesture before it reaches the camera controller.
  el.addEventListener("pointerdown",e=>{
    if(isControlTarget(e))return;
    if(e.pointerType==="mouse"&&e.button!==0)return;
    begin(e.clientX,e.clientY);
  },{passive:false,capture:true});
  el.addEventListener("pointermove",e=>move(e.clientX,e.clientY,e),{passive:false,capture:true});
  // Pointer capture on the gas pedal can retarget move events to the button.
  // Listen at window capture too so the camera keeps receiving those moves.
  window.addEventListener("pointermove",e=>move(e.clientX,e.clientY,e),{passive:false,capture:true});
  el.addEventListener("pointerup",end,{passive:false,capture:true});
  el.addEventListener("pointercancel",end,{passive:false,capture:true});
}
function bindControls(){
  document.querySelectorAll("[data-drive]").forEach(b=>{
    const v=b.dataset.drive;
    b.style.touchAction="none";
    let active=false;
    const press=()=>{
      if(active)return;
      active=true;
      if(v==="gas"){
        input.gas=true;
        state.throttle=true;
        if(state.gear==="P"||state.gear==="N")state.gear="D";
        state.driving=true;
      } else if(v==="brake") input.brake=true;
      else if(v==="left"){input.left=true;state.driving=true;}
      else if(v==="right"){input.right=true;state.driving=true;}
      b.classList.add("pressed");
    };
    const release=()=>{
      if(v==="gas"){input.gas=false;state.throttle=false;}
      if(v==="brake")input.brake=false;
      if(v==="left")input.left=false;
      if(v==="right")input.right=false;
      active=false;
      b.classList.remove("pressed");
    };
    const pointerDown=e=>{
      e.preventDefault(); e.stopPropagation();
      if(e.pointerId!=null){try{b.setPointerCapture(e.pointerId);}catch{}}
      press();
    };
    const pointerUp=e=>{e.preventDefault(); release();};
    b.addEventListener("pointerdown",pointerDown,{passive:false});
    b.addEventListener("pointerup",pointerUp,{passive:false});
    b.addEventListener("pointercancel",pointerUp,{passive:false});
    b.addEventListener("lostpointercapture",release,{passive:false});
    b.addEventListener("touchstart",e=>{e.preventDefault();press();},{passive:false});
    b.addEventListener("touchend",e=>{e.preventDefault();release();},{passive:false});
    b.addEventListener("touchcancel",e=>{e.preventDefault();release();},{passive:false});
    if(v==="gas"){
      b.addEventListener("click",e=>{
        e.preventDefault();
        press();
        window.clearTimeout(b._gasFallbackTimer);
        b._gasFallbackTimer=window.setTimeout(release,1200);
      });
    }
  });
  document.querySelectorAll("[data-gear]").forEach(b=>{
    b.addEventListener("click",e=>{
      e.preventDefault();
      const g=b.dataset.gear;
      if(!["P","R","N","D"].includes(g))return;
      state.gear=g;
      state.driving=g==="D"||g==="R";
      document.querySelectorAll("[data-gear]").forEach(x=>x.classList.toggle("active",x===b));
      stats();save();
    });
  });
}
function installRuntimeErrorCapture(){ const key="mechanic-city-debug-log"; let saved=[]; try{saved=JSON.parse(localStorage.getItem(key)||"[]");if(!Array.isArray(saved))saved=[];}catch{} window.MechanicCityRuntimeErrors=saved.slice(-80); const push=(entry)=>{ const item={time:new Date().toISOString(),...entry}; window.MechanicCityRuntimeErrors.push(item); if(window.MechanicCityRuntimeErrors.length>80)window.MechanicCityRuntimeErrors.shift(); try{localStorage.setItem(key,JSON.stringify(window.MechanicCityRuntimeErrors));}catch{} }; window.MechanicCityDebugLog=push; window.addEventListener("error",e=>push({type:"error",message:String(e.message||e.error||"unknown"),source:String(e.filename||""),line:e.lineno||0,column:e.colno||0,stack:String(e.error?.stack||"")})); window.addEventListener("unhandledrejection",e=>push({type:"unhandledrejection",message:String(e.reason?.message||e.reason||"unknown"),stack:String(e.reason?.stack||"")})); }
function renderEmergencyScene(){ try{ scene=new THREE.Scene(); scene.background=new THREE.Color(0x7893a3); camera=new THREE.PerspectiveCamera(58,Math.max(1,viewport.clientWidth)/Math.max(1,viewport.clientHeight),.1,260); camera.position.set(10,7,14); camera.lookAt(0,0,0); const hemi=new THREE.HemisphereLight(0xdceeff,0x334033,1.5); scene.add(hemi); const sun=new THREE.DirectionalLight(0xffffff,2); sun.position.set(8,14,10); scene.add(sun); const ground=new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.MeshStandardMaterial({color:0x50534f,roughness:1})); ground.rotation.x=-Math.PI/2; scene.add(ground); const marker=new THREE.Mesh(new THREE.BoxGeometry(3.2,.7,5.2),new THREE.MeshStandardMaterial({color:0x252b31,roughness:.55,metalness:.2})); marker.position.y=.7; scene.add(marker); renderer.render(scene,camera); window.MechanicCityEmergency=true; }catch(e){window.MechanicCityEmergencyError=String(e?.message||e);} }
function renderScene(name){ state.scene=name; menu.classList.add("hidden"); if(name==="workshop"){ document.querySelector(".drive-hud").style.display="none"; if(renderer){renderer.dispose();renderer=null;} buildWorkshop(); return;} stop(); document.querySelector(".drive-hud").style.display="none"; if(renderer){renderer.dispose();renderer=null;} if(name==="market"){ viewport.innerHTML="<div class='cards'><h2>🚘 Рынок</h2><p>Здесь будет рынок запчастей.</p></div>"; return;} if(name==="garage"){ buildGarage(); return;} if(name==="city"){ document.querySelector(".drive-hud").style.display=""; try{ buildCity(); bindControls(); stats(); msg("▲ газ • руль • ■ тормоз"); }catch(err){window.MechanicCityBuildError=String(err?.message||err); console.error("City build failed",err); renderEmergencyScene();} return; }}
function buildGarage(){ stop(); clearJobMarker(); traffic=[]; trafficLights=[]; smoke=[]; rainDrops=[]; scene=new THREE.Scene(); scene.background=new THREE.Color(0x15181b); viewport.innerHTML=""; const probe=document.createElement("canvas"); renderer=new THREE.WebGLRenderer({canvas:probe,antialias:false,alpha:false,preserveDrawingBuffer:false,powerPreference:"high-performance"}); renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5)); renderer.setSize(Math.max(1,viewport.clientWidth),Math.max(1,viewport.clientHeight),false); renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFShadowMap; renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.18; renderer.domElement.style.width="100%"; renderer.domElement.style.height="100%"; renderer.domElement.style.display="block"; viewport.appendChild(renderer.domElement); camera=new THREE.PerspectiveCamera(50,Math.max(1,viewport.clientWidth)/Math.max(1,viewport.clientHeight),.1,120); camera.position.set(6,4.2,7); const hemi=new THREE.HemisphereLight(0xc6d6e2,0x17191b,1.5); scene.add(hemi); const key=new THREE.DirectionalLight(0xffffff,2.4); key.position.set(-5,10,6); scene.add(key); const floor=new THREE.Mesh(new THREE.PlaneGeometry(35,28),new THREE.MeshStandardMaterial({color:0x3d3f40,roughness:.96})); floor.rotation.x=-Math.PI/2; floor.receiveShadow=true; scene.add(floor); car=createRetroPlayerCar(); car.userData.workshopMode=true; car.position.set(0,0,0); car.rotation.y=Math.PI; scene.add(car); const title=document.createElement("div"); title.className="workshop-hud"; title.innerHTML="<div><b>ГАРАЖ</b><span>Осмотр автомобиля</span></div>"; viewport.appendChild(title); const loop=()=>{if(state.scene!=="garage"||!renderer||!scene||!camera)return;requestAnimationFrame(loop);const dt=Math.min(clock.getDelta(),.05);updateArticulatedCar(dt);const box=new THREE.Box3().setFromObject(car,true);const center=box.getCenter(new THREE.Vector3());camera.lookAt(center);renderer.render(scene,camera);};clock=new THREE.Clock();loop();}function stop(){ if(renderer){ try{ if(renderer.setAnimationLoop) renderer.setAnimationLoop(null); renderer.dispose(); }catch{} renderer=null; } window.MechanicCityAnimationLoopStarted=false; }
const handleViewportResize=()=>{try{syncRendererSize();}catch(err){window.MechanicCityDebugLog?.({type:"resize",message:String(err?.message||err)});}};
window.addEventListener("resize",handleViewportResize,{passive:true});
window.visualViewport?.addEventListener("resize",handleViewportResize,{passive:true});
window.visualViewport?.addEventListener("scroll",handleViewportResize,{passive:true});
if(window.ResizeObserver&&viewport){new ResizeObserver(handleViewportResize).observe(viewport);}
function setVehiclePartOpen(part,open){state.car[part]=!!open; save(); const label=part==="hoodOpen"?"капот":part==="trunkOpen"?"багажник":"двери"; msg("🚗 "+(open?"Открыт ":"Закрыты ")+label);}
function toggleVehiclePanel(){const html="<p>Управление кузовом автомобиля</p><div class='buttons'><button id='hoodBtn'>"+(state.car.hoodOpen?"🔽 Закрыть капот":"🔼 Открыть капот")+"</button><button id='trunkBtn'>"+(state.car.trunkOpen?"🔽 Закрыть багажник":"🔼 Открыть багажник")+"</button><button id='doorsBtn'>"+(state.car.doorsOpen?"🚪 Закрыть двери":"🚪 Открыть двери")+"</button>"+(state.scene==="garage"?"<button id='disassemblyBtn'>🔧 Разборка автомобиля</button>":"")+"</div>";openPanel("Кузов",html);document.querySelector("#hoodBtn")?.addEventListener("click",()=>{setVehiclePartOpen("hoodOpen",!state.car.hoodOpen);toggleVehiclePanel();});document.querySelector("#trunkBtn")?.addEventListener("click",()=>{setVehiclePartOpen("trunkOpen",!state.car.trunkOpen);toggleVehiclePanel();});document.querySelector("#doorsBtn")?.addEventListener("click",()=>{setVehiclePartOpen("doorsOpen",!state.car.doorsOpen);toggleVehiclePanel();});document.querySelector("#disassemblyBtn")?.addEventListener("click",openDisassemblyPanel);}
function openDisassemblyPanel(){const parts=Object.values(car?.userData?.serviceParts||{});const groups={body:[],engine:[],transmission:[],brakes:[],suspension:[],wheels:[],lights:[],glass:[],exhaust:[],other:[]};for(const p of parts)(groups[p.category]||groups.other).push(p);const labels={body:"Кузов",engine:"Двигатель",transmission:"КПП",brakes:"Тормоза",suspension:"Подвеска",wheels:"Колёса",lights:"Свет",glass:"Стёкла",exhaust:"Выхлоп",other:"Прочее"};let html="<p>Выбери узел для снятия или установки.</p>";for(const [cat,list] of Object.entries(groups)){if(!list.length)continue;html+="<h4>"+labels[cat]+"</h4><div class='buttons'>";for(const p of list){html+="<button data-part-key='"+p.key+"'>"+(partInstalled(p.key)?"🔩 Снять ":"🛠️ Установить ")+p.name+"</button>"}html+="</div>"}openPanel("Разборка автомобиля",html);document.querySelectorAll("[data-part-key]").forEach(b=>b.onclick=()=>{const p=car?.userData?.serviceParts?.[b.dataset.partKey];if(p)openPartPanel(p)})}
function openPanel(title,html){ const existing=document.querySelector("#panel"); if(existing)existing.remove(); const panel=document.createElement("div"); panel.id="panel"; panel.className="panel"; panel.innerHTML="<div class='panel-card'><h3>"+title+"</h3>"+html+"<button id='closePanel'>Закрыть</button></div>"; document.body.appendChild(panel); panel.querySelector("#closePanel")?.addEventListener("click",()=>panel.remove()); }
function initMenu(){ const html=`<div class="menu-section"> <button data-scene="city">Город</button> <button data-scene="workshop">Мастерская</button> <button data-scene="garage">Гараж</button> <button data-scene="market">Рынок</button> </div>`; menu.innerHTML=html; menu.querySelectorAll("[data-scene]").forEach(btn=>btn.addEventListener("click",()=>{ renderScene(btn.dataset.scene); menu.classList.add("hidden"); })); }
function bindUI(){ document.querySelector("#menuBtn").onclick=()=>menu.classList.toggle("hidden"); document.querySelector("#cameraBtn").onclick=()=>{cameraMode=(cameraMode+1)%3;camOrbitYaw=0;camOrbitPitch=.18;if(camera){camera.fov=cameraMode===2?82:cameraMode===1?68:62;camera.updateProjectionMatrix();}}; document.querySelector("#mapBtn").onclick=()=>alert("Карта запчастей будет здесь"); document.querySelector("#teleportBtn").onclick=teleportToMapCenter; document.querySelector("#vehicleBtn").onclick=toggleVehiclePanel; }
installRuntimeErrorCapture(); installVisualInspectMode(); installAITestMode(); initMenu(); bindUI(); renderScene("city"); installPartInteraction();
