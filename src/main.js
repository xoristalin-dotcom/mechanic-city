import * as THREE from "three";
import "./style.css";

const app = document.querySelector("#app");
const saved = JSON.parse(localStorage.getItem("mechanic-city") || "null");

const state = saved || {
  money: 18500, fuel: 72, heat: 82, damage: 8,
  car: { name:"Vektor S", year:2008, mileage:214320, engine:68, condition:61, turbo:false, sportBrakes:false, wheels:"stock" },
  scene:"city", driving:false, speed:0, posX:0, posZ:10, steer:0, heading:0, onFoot:false
};

Object.assign(state, { driving:false, speed:0, steer:0, onFoot:false });
const input={gas:false,left:false,right:false,brake:false};
state.posX ??= 0; state.posZ ??= 10; state.heading ??= 0;

app.innerHTML = `
<div class="game">
  <main id="viewport"></main>

  <div class="drive-hud">
    <div class="hud-top">
      <div class="round-btn">☰</div>
      <div class="top-icons"><button id="mapBtn">⌖</button><button id="carInfo">⚙</button><button id="menuBtn">⋮</button></div>
    </div>
    <div class="speed-box"><b id="speed">0</b><small>KM/H</small><span id="gear">N</span></div>
    <div class="fuel-box">⛽ <b id="fuel"></b>% &nbsp; 🌡 <b id="heat"></b>°</div>
    <div class="mini-map"><div class="map-road"></div><div class="map-dot"></div></div>

    <div class="steering-zone">
      <button class="steer left" data-drive="left">‹</button>
      <button class="steer right" data-drive="right">›</button>
    </div>
    <div class="pedals">
      <button class="pedal brake" data-drive="brake">■</button>
      <button class="pedal gas" data-drive="gas">▲</button>
    </div>
    <div class="drive-actions">
      <button id="horn">◉</button><button id="cameraBtn">▣</button><button id="engineBtn">⚙</button><button id="exitBtn">♙</button>
    </div>
    <div id="message" class="message">Нажми ▲ и поехали</div>
  </div>

  <div id="menu" class="menu hidden">
    <div class="menu-card">
      <button data-scene="city">🏙️ Город</button>
      <button data-scene="market">🚘 Рынок</button>
      <button data-scene="junkyard">🛠️ Свалка</button>
      <button data-scene="garage">🔧 Гараж</button>
    </div>
  </div>

  <section id="panel" class="panel hidden"></section>
</div>`;

const viewport=document.querySelector("#viewport");
const speedEl=document.querySelector("#speed");
const gearEl=document.querySelector("#gear");
const fuelEl=document.querySelector("#fuel");
const heatEl=document.querySelector("#heat");
const messageEl=document.querySelector("#message");
const menu=document.querySelector("#menu");
const panel=document.querySelector("#panel");

let renderer,camera,car,scene,clock,traffic=[],trafficLights=[],smoke=[];

function save(){ localStorage.setItem("mechanic-city",JSON.stringify(state)); }
function msg(t){ messageEl.textContent=t; }
function stats(){
  speedEl.textContent=Math.round(state.speed*62);
  gearEl.textContent=state.speed>0.05 ? "D" : "N";
  fuelEl.textContent=Math.round(state.fuel);
  heatEl.textContent=Math.round(state.heat);
}

function makeCar(color=0x252a30){
  // Simple damage/visual state is attached to each car.

  const g=new THREE.Group();
  const body=new THREE.Mesh(new THREE.BoxGeometry(2.5,.62,4.6),new THREE.MeshStandardMaterial({color,metalness:.55,roughness:.28}));
  body.position.y=.62; g.add(body);
  const hood=new THREE.Mesh(new THREE.BoxGeometry(2.25,.18,1.25),new THREE.MeshStandardMaterial({color:0x30353b,metalness:.45,roughness:.25}));
  hood.position.set(0,.98,-1.45); g.add(hood);
  const cabin=new THREE.Mesh(new THREE.BoxGeometry(2.05,.8,2.15),new THREE.MeshStandardMaterial({color:0x101820,metalness:.15,roughness:.12}));
  cabin.position.set(0,1.08,.2); g.add(cabin);
  for(const x of [-1.3,1.3]) for(const z of [-1.45,1.45]){
    const w=new THREE.Mesh(new THREE.CylinderGeometry(.38,.38,.25,18),new THREE.MeshStandardMaterial({color:0x090a0c,roughness:1}));
    w.rotation.z=Math.PI/2; w.position.set(x,.42,z); g.add(w);
  }
  const damageMark=new THREE.Mesh(new THREE.BoxGeometry(.18,.03,.7),new THREE.MeshStandardMaterial({color:0x6b1d22}));
  damageMark.position.set(1.25,.93,-.3); damageMark.rotation.z=-.15; damageMark.visible=false; g.add(damageMark);
  g.userData.damageMark=damageMark;
  return g;
}

function updateCarDamage(){
  if(!car) return;
  const mark=car.userData.damageMark;
  if(mark) mark.visible=state.damage>25;
  if(state.damage>65 && smoke.length===0){
    for(let i=0;i<5;i++){
      const p=new THREE.Mesh(new THREE.SphereGeometry(.08+Math.random()*.05,8,8),new THREE.MeshBasicMaterial({color:0x555555,transparent:true,opacity:.45}));
      p.position.set((Math.random()-.5)*.3,.9,2.0); scene.add(p); smoke.push(p);
    }
  }
  smoke.forEach((p,i)=>{
    p.position.y+=.01; p.scale.multiplyScalar(1.008); p.material.opacity*=.995;
    if(p.material.opacity<.03){scene.remove(p);smoke.splice(i,1);}
  });
}

function addTree(x,z,s=1){
  const g=new THREE.Group();
  const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.14*s,.2*s,2.2*s,8),new THREE.MeshStandardMaterial({color:0x4b3423}));
  trunk.position.y=1.1*s; g.add(trunk);
  const crown=new THREE.Mesh(new THREE.SphereGeometry(1.05*s,10,8),new THREE.MeshStandardMaterial({color:0x284b2c,roughness:1}));
  crown.position.y=2.5*s; g.add(crown); scene.add(g);
}

function addTrafficLight(x,z){
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(.06,.06,3.1,8),new THREE.MeshStandardMaterial({color:0x202326}));
  pole.position.set(x+4,1.55,z+4); scene.add(pole);
  const housing=new THREE.Mesh(new THREE.BoxGeometry(.34,.9,.34),new THREE.MeshStandardMaterial({color:0x101214}));
  housing.position.set(x+4,2.65,z+4); scene.add(housing);
  const red=new THREE.Mesh(new THREE.SphereGeometry(.09,10,8),new THREE.MeshBasicMaterial({color:0x220000}));
  const yellow=new THREE.Mesh(new THREE.SphereGeometry(.09,10,8),new THREE.MeshBasicMaterial({color:0x332600}));
  const green=new THREE.Mesh(new THREE.SphereGeometry(.09,10,8),new THREE.MeshBasicMaterial({color:0x002200}));
  red.position.set(x+4,2.91,z+4); yellow.position.set(x+4,2.65,z+4); green.position.set(x+4,2.39,z+4);
  scene.add(red,yellow,green);
  trafficLights.push({red,yellow,green,z});
}

function buildCity(){
  scene=new THREE.Scene();
  scene.background=new THREE.Color(0x7f8d91);
  scene.fog=new THREE.Fog(0x7f8d91,45,170);

  camera=new THREE.PerspectiveCamera(62,viewport.clientWidth/viewport.clientHeight,.1,500);
  renderer=new THREE.WebGLRenderer({antialias:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));
  renderer.setSize(viewport.clientWidth,viewport.clientHeight);
  viewport.innerHTML=""; viewport.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xdde8ef,0x41504b,2.0));
  const sun=new THREE.DirectionalLight(0xffffff,2.2); sun.position.set(30,50,20); scene.add(sun);

  const ground=new THREE.Mesh(new THREE.PlaneGeometry(300,300),new THREE.MeshStandardMaterial({color:0x56605c,roughness:1}));
  ground.rotation.x=-Math.PI/2; scene.add(ground);

  // Main roads plus cross streets, creating real intersections.
  for(let i=-4;i<=4;i++){
    const road=new THREE.Mesh(new THREE.BoxGeometry(8,.06,300),new THREE.MeshStandardMaterial({color:0x292d30,roughness:.95}));
    road.position.set(i*13,.03,0); scene.add(road);
    const line=new THREE.Mesh(new THREE.BoxGeometry(.12,.03,300),new THREE.MeshStandardMaterial({color:0xd5d2b9}));
    line.position.set(i*13,.075,0); scene.add(line);
  }
  for(let z=-90;z<=90;z+=45){
    const cross=new THREE.Mesh(new THREE.BoxGeometry(300,.07,8),new THREE.MeshStandardMaterial({color:0x292d30,roughness:.95}));
    cross.position.set(0,.035,z); scene.add(cross);
    const crossLine=new THREE.Mesh(new THREE.BoxGeometry(300,.03,.12),new THREE.MeshStandardMaterial({color:0xd5d2b9}));
    crossLine.position.set(0,.075,z); scene.add(crossLine);
    addTrafficLight(0,z);
  }
  for(let i=-10;i<=10;i++) addTree(i*11+(i%2)*3,-28-(Math.abs(i)%4)*11,.8+(Math.abs(i)%3)*.18);

  for(let i=-5;i<=5;i++){
    const h=5+Math.random()*9;
    const b=new THREE.Mesh(new THREE.BoxGeometry(7,h,7),new THREE.MeshStandardMaterial({color:0x6d6c67,roughness:1}));
    b.position.set(i*16,h/2,-70-(i%2)*16); scene.add(b);
  }

  car=makeCar(0x252b31);
  car.position.set(state.posX,.55,state.posZ);
  car.rotation.y=state.heading;
  scene.add(car);

  traffic=[]; trafficLights=[]; smoke=[];
  for(let i=0;i<9;i++){
    const npc=makeCar([0x244b77,0x8a302c,0xc7b77d,0x3c3c3c][i%4]);
    npc.scale.setScalar(.86);
    npc.position.set((i%4)*13-19,.55,-12-i*18);
    npc.rotation.y=Math.PI;
    npc.userData.trafficSpeed=.7+(i%3)*.18;
    scene.add(npc); traffic.push(npc);
  }

  clock=new THREE.Clock();
  animate(traffic);
}

function animate(traffic=[]){
  requestAnimationFrame(()=>animate(traffic));
  if(!renderer)return;
  const dt=Math.min(clock?.getDelta()||.016,.05);

  if(state.driving && state.fuel>0){
    const turning=input.left?-1:input.right?1:0;
    state.heading += turning*dt*(1.25+state.speed*.7);
    if(input.gas) state.speed=Math.min(1.55,state.speed+dt*.95);
    else state.speed=Math.max(0,state.speed-dt*.35);
    if(input.brake) state.speed=Math.max(0,state.speed-dt*1.8);
    state.posX += Math.sin(state.heading)*state.speed*dt*8;
    state.posZ += Math.cos(state.heading)*state.speed*dt*8;
    state.fuel=Math.max(0,state.fuel-dt*(.025+state.speed*.012));
    state.heat=Math.min(125,state.heat+dt*(.12+state.speed*.06));
    state.car.mileage+=state.speed*dt*.006;
    if(state.heat>108) state.damage=Math.min(100,state.damage+dt*.06);
    // Traffic collision damage.
    for(const npc of traffic){
      const d=car.position.distanceTo(npc.position);
      if(d<2.25 && state.speed>.35){
        state.damage=Math.min(100,state.damage+dt*7);
        state.speed*=.94;
        msg("⚠️ Столкновение: кузов повреждён.");
      }
    }
    car.position.set(state.posX,.55,state.posZ);
    car.rotation.y=state.heading;
  }

  const target=new THREE.Vector3(
    car.position.x-Math.sin(car.rotation.y)*9,
    5.3,
    car.position.z-Math.cos(car.rotation.y)*9
  );
  camera.position.lerp(target,.08);
  const look=new THREE.Vector3(car.position.x,1.0,car.position.z);
  camera.lookAt(look);

  for(const npc of traffic){
    npc.position.z += dt*npc.userData.trafficSpeed;
    if(npc.position.z>120) npc.position.z=-120;
  }
  const cycle=((performance.now()/1000)%12);
  const green=cycle<6, yellow=cycle>=6&&cycle<7.5;
  for(const l of trafficLights){
    l.red.material.color.setHex(green?0x220000:yellow?0x220000:0xff0000);
    l.yellow.material.color.setHex(yellow?0xffb000:0x332600);
    l.green.material.color.setHex(green?0x00ff44:0x002200);
  }
  updateCarDamage();
  stats();
  renderer.render(scene,camera);
}

function driveOn(){ if(state.fuel<=0){msg("⛽ Бак пуст.");return;} state.driving=true; msg("За рулём. ▲ газ • ‹ › поворот • ■ тормоз"); }
function stop(){ state.driving=false; state.speed=0; input.gas=input.left=input.right=input.brake=false; msg("Машина остановлена."); save(); }
function exitCar(){
  stop(); state.onFoot=true;
  openPanel("Ты вышел из машины",`<p>Можно осмотреть автомобиль или отправиться в гараж.</p><button id="sitBack">Сесть в машину</button><button id="walkGarage">Открыть гараж</button>`);
  document.querySelector("#sitBack").onclick=()=>{panel.classList.add("hidden");state.onFoot=false;msg("Ты снова в машине.");};
  document.querySelector("#walkGarage").onclick=()=>{panel.classList.add("hidden");state.onFoot=false;renderScene("garage");};
}

function bindControls(){
  document.querySelectorAll("[data-drive]").forEach(b=>{
    const v=b.dataset.drive;
    const start=e=>{
      e.preventDefault();
      if(v==="gas"){input.gas=true;state.driving=true;}
      else if(v==="left"){input.left=true;state.driving=true;}
      else if(v==="right"){input.right=true;state.driving=true;}
      else if(v==="brake"){input.brake=true;}
    };
    const end=e=>{
      e.preventDefault();
      if(v==="gas")input.gas=false;
      if(v==="left")input.left=false;
      if(v==="right")input.right=false;
      if(v==="brake")input.brake=false;
    };
    b.addEventListener("pointerdown",start,{passive:false});
    b.addEventListener("pointerup",end,{passive:false});
    b.addEventListener("pointercancel",end,{passive:false});
    b.addEventListener("pointerleave",end);
  });
}

function openPanel(title,html){
  panel.innerHTML=`<div class="panel-card"><button class="close" id="closePanel">×</button><h2>${title}</h2>${html}</div>`;
  panel.classList.remove("hidden");
  document.querySelector("#closePanel").onclick=()=>panel.classList.add("hidden");
}

function renderScene(name){
  state.scene=name;
  menu.classList.add("hidden");
  if(name==="city"){
    document.querySelector(".drive-hud").style.display="";
    buildCity(); bindControls(); stats();
    msg("Нажми ▲ и поезжай по городу.");
  }else{
    stop();
    document.querySelector(".drive-hud").style.display="none";
    if(renderer){renderer.dispose();renderer=null;}
    if(name==="market"){
      viewport.innerHTML=`<div class="cards"><h2>Рынок автомобилей</h2>
      <article><b>Vektor S</b><span>2008 • 214 320 км</span><strong>7 900 ₽</strong><button data-buy="7900|Vektor S|61|214320">Купить</button></article>
      <article><b>Falcon GT</b><span>2012 • 168 500 км</span><strong>13 600 ₽</strong><button data-buy="13600|Falcon GT|78|168500">Купить</button></article>
      <article><b>Raven 1.8</b><span>2005 • 301 200 км</span><strong>3 900 ₽</strong><button data-buy="3900|Raven 1.8|37|301200">Купить</button></article></div>`;
    }else if(name==="junkyard"){
      viewport.innerHTML=`<div class="cards"><h2>Свалка</h2><article><b>Raven 1.8 — проект</b><span>Сильно повреждён</span><strong>1 200 ₽</strong><button data-buy="1200|Raven 1.8 Project|18|342100">Забрать</button></article><article><b>Vektor S — после ДТП</b><span>Двигатель запускается</span><strong>2 800 ₽</strong><button data-buy="2800|Vektor S Wreck|31|256900">Забрать</button></article></div>`;
    }else{
      viewport.innerHTML=`<div class="garage"><h2>🔧 Гараж</h2><div class="carbox"><b>${state.car.name}</b><span>${state.car.year} • ${Math.round(state.car.mileage).toLocaleString("ru-RU")} км</span><span>Состояние: ${state.car.condition}%</span><span>Температура: ${Math.round(state.heat)}°C</span></div><div class="parts"><button data-repair="Масло|250|8">🛢️ Масло — 250 ₽</button><button data-upgrade="Спорт-тормоза|1800|sportBrakes">🛑 Спорт-тормоза — 1 800 ₽</button><button data-upgrade="Турбина|4500|turbo">💨 Турбина — 4 500 ₽</button><button data-upgrade="Спорт-колёса|2200|wheels">🛞 Спорт-колёса — 2 200 ₽</button></div></div>`;
    }
    viewport.querySelectorAll("[data-buy]").forEach(b=>b.onclick=()=>buyCar(...b.dataset.buy.split("|").map((x,i)=>i===0?Number(x):i>1?Number(x):x)));
    viewport.querySelectorAll("[data-repair]").forEach(b=>b.onclick=()=>{const [n,c,a]=b.dataset.repair.split("|"); repair(n,+c,+a);});
    viewport.querySelectorAll("[data-upgrade]").forEach(b=>b.onclick=()=>{const [n,c,k]=b.dataset.upgrade.split("|"); upgrade(n,+c,k);});
  }
}

function buyCar(price,name,condition,mileage){
  if(state.money<price){msg("Не хватает денег.");return;}
  state.money-=price; state.car={...state.car,name,year:name.includes("Falcon")?2012:2008,mileage,condition,engine:condition,turbo:false,sportBrakes:false,wheels:"stock"}; save();
  openPanel("Машина куплена",`<p>${name} теперь твоя.</p><button id="toGarage">Ехать в гараж</button>`);
  document.querySelector("#toGarage").onclick=()=>{panel.classList.add("hidden");renderScene("garage");};
}
function repair(name,cost,amount){
  if(state.money<cost){openPanel("Недостаточно денег","<p>Не хватает денег.</p>");return;}
  state.money-=cost; state.car.condition=Math.min(100,state.car.condition+amount); state.heat=Math.max(72,state.heat-6); save(); renderScene("garage");
}
function upgrade(name,cost,key){
  if(state.car[key] && key!=="wheels"){openPanel("Уже установлено",`<p>${name} уже стоит на машине.</p>`);return;}
  if(state.money<cost){openPanel("Недостаточно денег","<p>Не хватает денег.</p>");return;}
  state.money-=cost; state.car[key]=true; state.car.condition=Math.min(100,state.car.condition+5); save(); renderScene("garage");
}

document.querySelector("#menuBtn").onclick=()=>menu.classList.toggle("hidden");
document.querySelector(".round-btn").onclick=()=>menu.classList.toggle("hidden");
document.querySelector("#mapBtn").onclick=()=>openPanel("Карта","<p>Ты находишься в городе. Рынок и гараж доступны через меню ☰.</p>");
document.querySelector("#carInfo").onclick=()=>openPanel("Автомобиль",`<p><b>${state.car.name}</b></p><p>Состояние: ${state.car.condition}%</p><p>Пробег: ${Math.round(state.car.mileage).toLocaleString("ru-RU")} км</p><p>Повреждения: ${Math.round(state.damage)}%</p>`);
document.querySelector("#engineBtn").onclick=()=>msg("Капот открыт: двигатель "+Math.round(state.heat)+"°C • повреждение "+Math.round(state.damage)+"%");
document.querySelector("#exitBtn").onclick=exitCar;
document.querySelector("#horn").onclick=()=>msg("🔊 Бип!");
document.querySelector("#cameraBtn").onclick=()=>{ if(camera){camera.fov=camera.fov===62?78:62;camera.updateProjectionMatrix();} };
document.querySelectorAll(".menu [data-scene]").forEach(b=>b.onclick=()=>renderScene(b.dataset.scene));
window.addEventListener("resize",()=>{if(renderer&&camera){camera.aspect=viewport.clientWidth/viewport.clientHeight;camera.updateProjectionMatrix();renderer.setSize(viewport.clientWidth,viewport.clientHeight);}});
renderScene("city");
