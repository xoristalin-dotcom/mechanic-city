import * as THREE from "three";
import "./style.css";

const app = document.querySelector("#app");
const saved = JSON.parse(localStorage.getItem("mechanic-city") || "null");

const state = saved || {
  money: 18500, fuel: 72, heat: 82, damage: 8,
  car: { name:"Vektor S", year:2008, mileage:214320, engine:68, condition:61, turbo:false, sportBrakes:false, wheels:"stock", oil:42, coolant:58, brakes:64, battery:77, suspension:70, tires:61, body:78 },
  scene:"city", driving:false, speed:0, posX:0, posZ:10, steer:0, heading:0, gear:"P", onFoot:false, time:14, rain:false, job:null
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
    <div class="fuel-box">⛽ <b id="fuel"></b>% &nbsp; 🌡 <b id="heat"></b>° &nbsp; 🕒 <b id="clock"></b></div>
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
      <button data-scene="dealer">🏢 Автосалон</button>
      <button data-scene="garage">🔧 Гараж</button>
      <button data-scene="jobs">💼 Работа</button>
      <button data-scene="settings">⚙️ Настройки</button>
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
const clockEl=document.querySelector("#clock");

let renderer,camera,car,scene,clock,traffic=[],trafficLights=[],smoke=[],rainDrops=[];

function save(){ localStorage.setItem("mechanic-city",JSON.stringify(state)); }
function msg(t){ messageEl.textContent=t; }
function stats(){
  speedEl.textContent=Math.round(state.speed*62);
  gearEl.textContent=state.gear || "P";
  fuelEl.textContent=Math.round(state.fuel);
  heatEl.textContent=Math.round(state.heat);
  clockEl.textContent=String(Math.floor(state.time)).padStart(2,"0")+":"+String(Math.floor((state.time%1)*60)).padStart(2,"0");
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

function addRain(){
  rainDrops=[];
  for(let i=0;i<130;i++){
    const p=new THREE.Mesh(new THREE.BoxGeometry(.012,.55,.012),new THREE.MeshBasicMaterial({color:0x9fc5dd,transparent:true,opacity:.4}));
    p.position.set((Math.random()-.5)*100,Math.random()*38+2,(Math.random()-.5)*100);scene.add(p);rainDrops.push(p);
  }
}
function addBuilding(x,z,w,h,d,color){
  const b=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color,roughness:1}));
  b.position.set(x,h/2,z);scene.add(b);
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

  rainDrops=[];
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
  for(let i=-5;i<=5;i++){addBuilding(i*19,-70,9,6+(Math.abs(i)%4)*2,9,[0x666762,0x4e575d,0x71695f][Math.abs(i)%3]);addBuilding(i*19,70,9,5+(Math.abs(i)%3)*3,9,0x5c6361);}
  addBuilding(-45,35,10,4.5,8,0x4a5358);
  addBuilding(45,35,9,3.2,7,0x273b48);
  addBuilding(45,-35,11,5,9,0x3b5667);
  if(state.rain)addRain();

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
    npc.position.set((i%4)*13-19,.55,-12-i*18);npc.userData.speed=1.4+(i%3)*.35;
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
    const turning=input.left?1:input.right?-1:0;
    state.heading += turning*dt*(1.25+state.speed*.7);
    if(input.gas && (state.gear==="D"||state.gear==="R")) state.speed += dt*(state.gear==="R"?-.55:.95); else state.speed*=Math.pow(.35,dt);
    if(input.brake)state.speed*=Math.pow(.02,dt);
    state.posX -= Math.sin(state.heading)*state.speed*dt*8;
    state.posZ -= Math.cos(state.heading)*state.speed*dt*8;
    state.fuel=Math.max(0,state.fuel-dt*(.018+Math.abs(state.speed)*.014));
    state.car.oil=Math.max(0,state.car.oil-dt*.004);state.car.coolant=Math.max(0,state.car.coolant-dt*.002);
    state.heat=Math.min(125,state.heat+dt*(.08+Math.abs(state.speed)*.055));
    if(state.car.oil<15||state.car.coolant<15)state.damage=Math.min(100,state.damage+dt*.08);
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
    car.position.x+Math.sin(car.rotation.y)*9,
    5.3,
    car.position.z+Math.cos(car.rotation.y)*9
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

function driveOn(){ if(state.fuel<=0){msg("⛽ Бак пуст — нужна заправка.");return;} if(state.gear==="P"||state.gear==="N")state.gear="D"; state.driving=true; msg("За рулём"); }
function stop(){ state.driving=false; state.speed=0; input.gas=input.left=input.right=input.brake=false; save(); }
function cycleGear(){ const gears=["P","R","N","D"]; const i=gears.indexOf(state.gear||"P"); state.gear=gears[(i+1)%gears.length]; if(state.gear==="P")stop(); else state.driving=true; msg("Передача: "+state.gear); }
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
  state.scene=name;menu.classList.add("hidden");
  if(name==="city"){
    document.querySelector(".drive-hud").style.display="";
    buildCity();bindControls();stats();msg("▲ газ • руль • ■ тормоз");return;
  }
  stop();document.querySelector(".drive-hud").style.display="none";
  if(renderer){renderer.dispose();renderer=null;}
  if(name==="market"){
    viewport.innerHTML="<div class='cards'><h2>🚘 Рынок автомобилей</h2><p class='muted'>Подержанные машины с разным пробегом и состоянием.</p>"+
    "<article><b>Vektor S</b><span>2008 • 214 320 км • 61%</span><strong>7 900 ₽</strong><button data-buy='7900|Vektor S|61|214320|2008'>Купить</button></article>"+
    "<article><b>Falcon GT</b><span>2012 • 168 500 км • 78%</span><strong>13 600 ₽</strong><button data-buy='13600|Falcon GT|78|168500|2012'>Купить</button></article>"+
    "<article><b>Raven 1.8</b><span>2005 • 301 200 км • 37%</span><strong>3 900 ₽</strong><button data-buy='3900|Raven 1.8|37|301200|2005'>Купить</button></article></div>";
  }else if(name==="junkyard"){
    viewport.innerHTML="<div class='cards'><h2>🛠️ Свалка</h2><article><b>Raven Project</b><span>2005 • 342 100 км • 18%</span><strong>1 200 ₽</strong><button data-buy='1200|Raven Project|18|342100|2005'>Забрать</button></article><article><b>Vektor Wreck</b><span>2008 • 256 900 км • 31%</span><strong>2 800 ₽</strong><button data-buy='2800|Vektor Wreck|31|256900|2008'>Забрать</button></article></div>";
  }else if(name==="dealer"){
    viewport.innerHTML="<div class='cards'><h2>🏢 Автосалон</h2><p class='muted'>Новые автомобили.</p><article><b>Falcon GT New</b><span>2024 • 98%</span><strong>28 900 ₽</strong><button data-buy='28900|Falcon GT New|98|0|2024'>Купить</button></article><article><b>Vektor S Sport</b><span>2025 • 96%</span><strong>34 900 ₽</strong><button data-buy='34900|Vektor S Sport|96|0|2025'>Купить</button></article><article><b>Orion LX Premium</b><span>2026 • 99%</span><strong>44 900 ₽</strong><button data-buy='44900|Orion LX Premium|99|0|2026'>Купить</button></article></div>";
  }else if(name==="jobs"){
    viewport.innerHTML="<div class='cards'><h2>💼 Работа</h2><article><b>Доставка запчастей</b><span>Перевези груз через город</span><strong>+900 ₽</strong><button data-job='900'>Взять</button></article><article><b>Перегон автомобиля</b><span>Доставь машину клиента</span><strong>+1 400 ₽</strong><button data-job='1400'>Взять</button></article><article><b>Тест-драйв</b><span>Проедь без серьёзной аварии</span><strong>+650 ₽</strong><button data-job='650'>Взять</button></article></div>";
  }else if(name==="settings"){
    viewport.innerHTML="<div class='garage'><h2>⚙️ Настройки</h2><button id='rainToggle'>🌧️ Дождь: "+(state.rain?"ВКЛ":"ВЫКЛ")+"</button><button id='timeToggle'>🕒 Прибавить 4 часа</button><button id='resetGame'>♻️ Сбросить прогресс</button></div>";
  }else{
    const c=state.car;
    viewport.innerHTML="<div class='garage'><h2>🔧 Гараж</h2><div class='carbox'><b>"+c.name+"</b><span>"+c.year+" • "+Math.round(c.mileage).toLocaleString("ru-RU")+" км</span><span>Состояние: "+Math.round(c.condition)+"%</span><span>Повреждения: "+Math.round(state.damage)+"%</span></div>"+
    "<div class='diagnostics'><h3>Диагностика</h3><div>Двигатель <b>"+Math.round(c.engine)+"%</b></div><div>Масло <b>"+Math.round(c.oil)+"%</b></div><div>Охлаждение <b>"+Math.round(c.coolant)+"%</b></div><div>Тормоза <b>"+Math.round(c.brakes)+"%</b></div><div>Аккумулятор <b>"+Math.round(c.battery)+"%</b></div><div>Подвеска <b>"+Math.round(c.suspension)+"%</b></div><div>Шины <b>"+Math.round(c.tires)+"%</b></div></div>"+
    "<div class='parts'><button data-repair='oil|250|20'>🛢️ Масло — 250 ₽</button><button data-repair='coolant|380|22'>❄️ Охлаждение — 380 ₽</button><button data-repair='brakes|700|24'>🛑 Тормоза — 700 ₽</button><button data-repair='battery|520|25'>🔋 Аккумулятор — 520 ₽</button><button data-repair='suspension|900|22'>🛞 Подвеска — 900 ₽</button><button data-repair='tires|650|28'>⭕ Шины — 650 ₽</button><button data-repair='engine|1800|18'>🔩 Двигатель — 1 800 ₽</button><button data-upgrade='turbo|4500'>💨 Турбина — 4 500 ₽</button><button data-upgrade='sportBrakes|1800'>🏁 Спорт-тормоза — 1 800 ₽</button><button data-upgrade='wheels|2200'>✨ Спорт-колёса — 2 200 ₽</button></div></div>";
  }
  viewport.querySelectorAll("[data-buy]").forEach(b=>b.onclick=()=>{const a=b.dataset.buy.split("|");buyCar(+a[0],a[1],+a[2],+a[3],+a[4]);});
  viewport.querySelectorAll("[data-repair]").forEach(b=>b.onclick=()=>{const a=b.dataset.repair.split("|");repairPart(a[0],+a[1],+a[2]);});
  viewport.querySelectorAll("[data-upgrade]").forEach(b=>b.onclick=()=>{const a=b.dataset.upgrade.split("|");upgrade(a[0],+a[1]);});
  viewport.querySelectorAll("[data-job]").forEach(b=>b.onclick=()=>startJob(+b.dataset.job));
  if(name==="settings"){
    document.querySelector("#rainToggle").onclick=()=>{state.rain=!state.rain;save();renderScene("settings");};
    document.querySelector("#timeToggle").onclick=()=>{state.time=(state.time+4)%24;save();renderScene("settings");};
    document.querySelector("#resetGame").onclick=()=>{localStorage.removeItem("mechanic-city");location.reload();};
  }
}

function repairPart(key,cost,amount){
  if(state.money<cost){openPanel("Недостаточно денег","<p>Не хватает денег.</p>");return;}
  state.money-=cost;state.car[key]=Math.min(100,(state.car[key]||0)+amount);state.car.condition=Math.min(100,state.car.condition+Math.floor(amount/2));state.damage=Math.max(0,100-state.car.condition);save();renderScene("garage");
}
function upgrade(key,cost){
  if(state.money<cost){openPanel("Недостаточно денег","<p>Не хватает денег.</p>");return;}
  if(state.car[key]===true){openPanel("Уже установлено","<p>Эта деталь уже стоит.</p>");return;}
  state.money-=cost;state.car[key]=true;state.car.condition=Math.min(100,state.car.condition+5);save();renderScene("garage");
}
function buyCar(price,name,condition,mileage,year){
  if(state.money<price){openPanel("Недостаточно денег","<p>Не хватает денег.</p>");return;}
  state.money-=price;state.car={...state.car,name,year,mileage,condition,engine:condition,turbo:false,sportBrakes:false,wheels:"stock",oil:Math.max(35,condition),coolant:Math.max(35,condition),brakes:condition,battery:condition,suspension:condition,tires:condition,body:condition};state.damage=Math.max(0,100-condition);save();
  openPanel("Автомобиль куплен","<p><b>"+name+"</b> теперь твой.</p><button id='toGarage'>Открыть гараж</button>");document.querySelector("#toGarage").onclick=()=>{panel.classList.add("hidden");renderScene("garage");};
}
function startJob(reward){
  state.job={reward,started:Date.now(),startX:state.posX,startZ:state.posZ};save();
  openPanel("Заказ принят","<p>Доедь до цели и постарайся не разбить машину.</p><button id='startDrive'>Ехать</button>");
  document.querySelector("#startDrive").onclick=()=>{panel.classList.add("hidden");renderScene("city");msg("💼 Заказ активен: +"+reward+" ₽");};
}
document.querySelector("#menuBtn").onclick=()=>menu.classList.toggle("hidden");
document.querySelector(".round-btn").onclick=()=>menu.classList.toggle("hidden");
document.querySelector("#mapBtn").onclick=()=>openPanel("Карта","<p>Ты находишься в городе. Рынок и гараж доступны через меню ☰.</p>");
document.querySelector("#carInfo").onclick=()=>openPanel("Автомобиль",`<p><b>${state.car.name}</b></p><p>Состояние: ${state.car.condition}%</p><p>Пробег: ${Math.round(state.car.mileage).toLocaleString("ru-RU")} км</p><p>Повреждения: ${Math.round(state.damage)}%</p>`);
document.querySelector("#engineBtn").onclick=()=>msg("Капот открыт: двигатель "+Math.round(state.heat)+"°C • повреждение "+Math.round(state.damage)+"%");
document.querySelector("#exitBtn").onclick=exitCar;
document.querySelector("#horn").onclick=()=>msg("🔊 Бип!");
document.querySelector("#gearBtn").onclick=cycleGear;
document.querySelector("#gearBtn").onclick=cycleGear;
document.querySelector("#cameraBtn").onclick=()=>{ if(camera){camera.fov=camera.fov===62?78:62;camera.updateProjectionMatrix();} };
document.querySelectorAll(".menu [data-scene]").forEach(b=>b.onclick=()=>renderScene(b.dataset.scene));
window.addEventListener("resize",()=>{if(renderer&&camera){camera.aspect=viewport.clientWidth/viewport.clientHeight;camera.updateProjectionMatrix();renderer.setSize(viewport.clientWidth,viewport.clientHeight);}});
renderScene("city");
