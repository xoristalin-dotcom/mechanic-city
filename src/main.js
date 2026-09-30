import * as THREE from "three";
import "./style.css";

const app = document.querySelector("#app");

const saved = JSON.parse(localStorage.getItem("mechanic-city") || "null");
const state = saved || {
  money: 18500,
  fuel: 72,
  heat: 82,
  damage: 8,
  car: {
    name: "Vektor S",
    year: 2008,
    mileage: 214320,
    engine: 68,
    condition: 61,
    turbo: false,
    sportBrakes: false,
    wheels: "stock"
  },
  scene: "city"
};

app.innerHTML = `
  <div class="game">
    <div class="topbar">
      <div><b>MECHANIC CITY</b><span class="sub">prototype 0.1</span></div>
      <div class="stats"><span>₽ <b id="money"></b></span><span>⛽ <b id="fuel"></b>%</span><span>🌡 <b id="heat"></b>°</span></div>
    </div>
    <main id="viewport"></main>
    <section class="hud">
      <div class="mission"><b id="location">ГОРОД</b><span id="message">Нажми на машину или выбери место.</span></div>
      <div class="actions" id="actions"></div>
    </section>
    <div class="drive-controls" id="driveControls"><button data-drive="left">◀</button><button data-drive="brake">■</button><button data-drive="gas">▲</button><button data-drive="right">▶</button></div>
    <nav class="nav">
      <button data-scene="city">🏙️<small>Город</small></button>
      <button data-scene="market">🚘<small>Рынок</small></button>
      <button data-scene="junkyard">🛠️<small>Свалка</small></button>
      <button data-scene="garage">🔧<small>Гараж</small></button>
    </nav>
  </div>`;

const viewport = document.querySelector("#viewport");
const moneyEl = document.querySelector("#money");
const fuelEl = document.querySelector("#fuel");
const heatEl = document.querySelector("#heat");
const locationEl = document.querySelector("#location");
const messageEl = document.querySelector("#message");
const actionsEl = document.querySelector("#actions");

function stats() {
  moneyEl.textContent = state.money.toLocaleString("ru-RU");
  fuelEl.textContent = Math.round(state.fuel);
  heatEl.textContent = Math.round(state.heat);
}
function msg(t) { messageEl.textContent = t; }
function button(label, fn, cls="") {
  const b = document.createElement("button");
  b.className = "action " + cls; b.textContent = label; b.onclick = fn;
  actionsEl.appendChild(b);
}
function clearActions(){ actionsEl.innerHTML = ""; }

let renderer, camera, car, animationId, cityScene;

function init3D() {
  viewport.innerHTML = "";
  const scene = new THREE.Scene();
  cityScene = scene;
  scene.background = new THREE.Color(0x11141a);
  scene.fog = new THREE.Fog(0x11141a, 35, 130);

  camera = new THREE.PerspectiveCamera(58, viewport.clientWidth/viewport.clientHeight, .1, 300);
  camera.position.set(7, 6, 10);

  renderer = new THREE.WebGLRenderer({antialias:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(viewport.clientWidth, viewport.clientHeight);
  viewport.appendChild(renderer.domElement);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x334455, 2.1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.position.set(8,15,4); scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(180,180),
    new THREE.MeshStandardMaterial({color:0x252a31,roughness:1})
  );
  ground.rotation.x=-Math.PI/2; scene.add(ground);

  for(let i=-3;i<=3;i++){
    const road = new THREE.Mesh(
      new THREE.BoxGeometry(5,.08,180),
      new THREE.MeshStandardMaterial({color:0x171a1f})
    );
    road.position.x=i*7; road.position.y=.04; scene.add(road);
  }

  for(let i=-6;i<=6;i++){
    const building = new THREE.Mesh(
      new THREE.BoxGeometry(5+Math.random()*4, 4+Math.random()*10, 5+Math.random()*3),
      new THREE.MeshStandardMaterial({color:0x343941})
    );
    building.position.set(i*9, building.geometry.parameters.height/2, -20-Math.random()*25);
    scene.add(building);
  }

  car = makeCar();
  car.position.set(state.posX,.6,state.posZ);
  scene.add(car);

  viewport.onpointerdown = (e) => {
    const r = viewport.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX-r.left)/r.width)*2-1,
      -((e.clientY-r.top)/r.height)*2+1
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(mouse,camera);
    if(ray.intersectObjects(car.children,true).length){
      msg("Ты осматриваешь машину. Можно открыть капот или поехать.");
      clearActions();
      button("Открыть капот", ()=>msg("Капот открыт: температура двигателя " + Math.round(state.heat)+"°C."));
      button("Ехать", drive, "primary");
    }
  };

  function tick(){
    animationId=requestAnimationFrame(tick);
    if(car){
      if(state.driving){
        const accel = state.steer === 2 ? -0.12 : state.steer === -2 ? 0.12 : 0;
        car.rotation.y += accel;
        const throttle = state.steer === 3 ? 0.16 : state.steer === -3 ? -0.07 : 0;
        state.speed = Math.max(0, Math.min(1.4, state.speed + throttle - 0.025));
        state.posX += Math.sin(car.rotation.y) * state.speed;
        state.posZ += Math.cos(car.rotation.y) * state.speed;
        car.position.set(state.posX,.6,state.posZ);
        state.fuel=Math.max(0,state.fuel-(0.012+state.speed*0.01));
        state.heat=Math.min(125,state.heat+0.02+state.speed*0.025);
        state.car.mileage += state.speed*0.01;
      }
      state.heat += 0.012;
      if(state.heat>110) state.damage=Math.min(100,state.damage+0.01);
      stats();
    }
    renderer.render(scene,camera);
  }
  tick();

  window.onresize=()=>{
    if(!renderer)return;
    camera.aspect=viewport.clientWidth/viewport.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(viewport.clientWidth,viewport.clientHeight);
  };
}

function makeCar(){
  const g=new THREE.Group();
  const body=new THREE.Mesh(
    new THREE.BoxGeometry(3.2,.7,5.2),
    new THREE.MeshStandardMaterial({color:0x9b2430,metalness:.35,roughness:.42})
  );
  body.position.y=.7; g.add(body);
  const cabin=new THREE.Mesh(
    new THREE.BoxGeometry(2.45,.85,2.35),
    new THREE.MeshStandardMaterial({color:0x17202b,metalness:.1,roughness:.2})
  );
  cabin.position.set(0,1.25,.15); g.add(cabin);
  for(const x of [-1.65,1.65]) for(const z of [-1.65,1.65]){
    const w=new THREE.Mesh(new THREE.CylinderGeometry(.46,.46,.28,20),
      new THREE.MeshStandardMaterial({color:0x111111,roughness:1}));
    w.rotation.z=Math.PI/2; w.position.set(x,0.48,z); g.add(w);
  }
  return g;
}

function drive(){
  state.fuel=Math.max(0,state.fuel-4);
  state.heat=Math.min(125,state.heat+9);
  msg(state.heat>105 ? "⚠️ Двигатель перегревается! Езжай в гараж." : "Ты выехал по городу.");
  stats();
}

function renderScene(name){
  state.scene=name; locationEl.textContent={city:"ГОРОД",market:"РЫНОК Б/У",junkyard:"СВАЛКА",garage:"ГАРАЖ"}[name];
  clearActions();

  if(name==="city"){
    init3D();
    button("🚗 Поехать", drive, "primary");
    button("🔍 Осмотр", ()=>msg("Состояние: "+state.car.condition+"%. Пробег: "+state.car.mileage.toLocaleString("ru-RU")+" км."));
    button("🌡 Проверить мотор", ()=>msg("Температура: "+Math.round(state.heat)+"°C."));
    button("🛑 Остановиться", stopDrive);
    bindDriveControls();
  } else if(name==="market"){
    viewport.innerHTML=`<div class="cards"><h2>Рынок б/у автомобилей</h2>
      <article><b>Vektor S</b><span>2008 • 214 320 км</span><strong>7 900 ₽</strong><button id="buy1">Купить</button></article>
      <article><b>Falcon GT</b><span>2012 • 168 500 км</span><strong>13 600 ₽</strong><button id="buy2">Купить</button></article>
      <article><b>Raven 1.8</b><span>2005 • 301 200 км</span><strong>3 900 ₽</strong><button id="buy3">Купить</button></article>
    </div>`;
    document.querySelector("#buy1").onclick=()=>buyCar(7900,"Vektor S",61,214320);
    document.querySelector("#buy2").onclick=()=>buyCar(13600,"Falcon GT",78,168500);
    document.querySelector("#buy3").onclick=()=>buyCar(3900,"Raven 1.8",37,301200);
  } else if(name==="junkyard"){
    viewport.innerHTML=`<div class="cards"><h2>Свалка</h2>
      <article><b>Raven 1.8 — проект</b><span>Сильно повреждён • без гарантии</span><strong>1 200 ₽</strong><button id="junk">Забрать</button></article>
      <article><b>Vektor S — после ДТП</b><span>Двигатель запускается</span><strong>2 800 ₽</strong><button id="junk2">Забрать</button></article>
    </div>`;
    document.querySelector("#junk").onclick=()=>buyCar(1200,"Raven 1.8 Project",18,342100);
    document.querySelector("#junk2").onclick=()=>buyCar(2800,"Vektor S Wreck",31,256900);
  } else {
    viewport.innerHTML=`<div class="garage"><h2>🔧 Твой гараж</h2>
      <div class="carbox"><b>${state.car.name}</b><span>${state.car.year} • ${state.car.mileage.toLocaleString("ru-RU")} км</span><span>Состояние: ${state.car.condition}%</span></div>
      <div class="parts"><button id="oil">🛢️ Масло — 250 ₽</button><button id="brake">🛑 Спорт-тормоза — 1 800 ₽</button><button id="turbo">💨 Турбина — 4 500 ₽</button><button id="wheels">🛞 Спорт-колёса — 2 200 ₽</button></div>
    </div>`;
    document.querySelector("#oil").onclick=()=>repair("Масло",250,8);
    document.querySelector("#brake").onclick=()=>upgrade("Спорт-тормоза",1800,"sportBrakes");
    document.querySelector("#turbo").onclick=()=>upgrade("Турбина",4500,"turbo");
    document.querySelector("#wheels").onclick=()=>upgrade("Спорт-колёса",2200,"wheels");
  }
  stats();
}

function buyCar(price,name,condition,mileage){
  if(state.money<price){msg("Не хватает денег.");return;}
  state.money-=price; state.car={...state.car,name,year:2008,mileage,condition,engine:condition,turbo:false,sportBrakes:false,wheels:"stock"};
  localStorage.setItem("mechanic-city", JSON.stringify(state));
  msg(`${name} куплена. Езжай в гараж для диагностики и ремонта.`);
  stats();
}
function repair(name,cost,amount){
  if(state.money<cost){msg("Не хватает денег.");return;}
  state.money-=cost; state.car.condition=Math.min(100,state.car.condition+amount); state.heat=Math.max(78,state.heat-6);
  localStorage.setItem("mechanic-city", JSON.stringify(state));
  msg(`${name} заменено. Состояние машины: ${state.car.condition}%.`);
  renderScene("garage");
}
function upgrade(name,cost,key){
  if(state.car[key] && key!=="wheels"){msg("Эта деталь уже установлена.");return;}
  if(state.money<cost){msg("Не хватает денег.");return;}
  state.money-=cost; state.car[key]=true; state.car.condition=Math.min(100,state.car.condition+5);
  msg(`${name} установлены.`);
  localStorage.setItem("mechanic-city", JSON.stringify(state));
  renderScene("garage");
}

document.querySelectorAll(".nav button").forEach(b=>b.onclick=()=>renderScene(b.dataset.scene));
renderScene("city");
stats();
