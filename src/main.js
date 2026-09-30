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
let lastSaveTick=-1;
state.posX ??= 0; state.posZ ??= 10; state.heading ??= 0; state.gear ??= "P"; state.time ??= 14; state.rain ??= false; state.job ??= null;
state.car.oil ??= 42; state.car.coolant ??= 58; state.car.brakes ??= state.car.condition; state.car.battery ??= 70; state.car.suspension ??= state.car.condition; state.car.tires ??= state.car.condition; state.car.body ??= state.car.condition;

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
      <button id="horn">◉</button><button id="cameraBtn">▣</button><button id="fuelBtn">⛽</button><button id="serviceBtn">🔧</button><button id="gearBtn">P</button><button id="exitBtn">♙</button>
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
  // Detailed low-poly car: designed to stay smooth on mobile Safari.
  const g=new THREE.Group();
  const paint=new THREE.MeshStandardMaterial({color,metalness:.72,roughness:.2});
  const dark=new THREE.MeshStandardMaterial({color:0x101419,metalness:.25,roughness:.12});
  const chrome=new THREE.MeshStandardMaterial({color:0x9aa2a8,metalness:.9,roughness:.18});
  const glass=new THREE.MeshPhysicalMaterial({color:0x182a35,metalness:.18,roughness:.06,transmission:.18,transparent:true,opacity:.92,clearcoat:.7,clearcoatRoughness:.08});
  const trim=new THREE.MeshStandardMaterial({color:0x080a0c,metalness:.72,roughness:.18});
  const interior=new THREE.MeshStandardMaterial({color:0x17191b,roughness:.72});
  const rubber=new THREE.MeshStandardMaterial({color:0x08090a,roughness:.96});
  const body=new THREE.Mesh(new THREE.BoxGeometry(2.5,.62,4.6),paint);
  body.position.y=.62; body.castShadow=true; body.receiveShadow=true; g.add(body);

  const hood=new THREE.Mesh(new THREE.BoxGeometry(2.28,.16,1.35),paint);
  hood.position.set(0,.96,-1.47); hood.castShadow=true; g.add(hood);
  const trunk=new THREE.Mesh(new THREE.BoxGeometry(2.28,.15,.92),paint);
  trunk.position.set(0,.94,1.72); trunk.castShadow=true; g.add(trunk);

  const cabin=new THREE.Mesh(new THREE.BoxGeometry(2.05,.76,2.18),dark);
  cabin.position.set(0,1.08,.15); cabin.castShadow=true; g.add(cabin);
  // Visible interior: dashboard, seats and steering wheel.
  const dash=new THREE.Mesh(new THREE.BoxGeometry(1.78,.24,.5),interior);
  dash.position.set(0,1.08,-.58); g.add(dash);
  for(const x of [-.58,.58]){
    const seat=new THREE.Mesh(new THREE.BoxGeometry(.62,.52,.68),interior);
    seat.position.set(x,.93,.48); seat.castShadow=true; g.add(seat);
  }
  const wheel=new THREE.Mesh(new THREE.TorusGeometry(.19,.045,10,18),trim);
  wheel.position.set(-.62,1.18,-.66); wheel.rotation.x=Math.PI/2; g.add(wheel);
  const console=new THREE.Mesh(new THREE.BoxGeometry(.28,.18,.72),trim);
  console.position.set(0,.99,.48); g.add(console);

  // Individual glass panes make the silhouette read like a real car.
  const windshield=new THREE.Mesh(new THREE.BoxGeometry(1.84,.54,.035),glass);
  windshield.position.set(0,1.22,-.92); windshield.rotation.x=-.16; g.add(windshield);
  const rearGlass=windshield.clone(); rearGlass.position.z=1.16; rearGlass.rotation.x=.16; g.add(rearGlass);
  for(const x of [-1.035,1.035]){
    const side=new THREE.Mesh(new THREE.BoxGeometry(.035,.5,1.72),glass);
    side.position.set(x,1.18,.12); g.add(side);
  }

  // Roof pillars / roof panel.
  const roof=new THREE.Mesh(new THREE.BoxGeometry(1.94,.12,1.98),paint);
  roof.position.set(0,1.48,.14); roof.castShadow=true; g.add(roof);
  const roofGlass=new THREE.Mesh(new THREE.BoxGeometry(1.18,.035,1.1),glass);
  roofGlass.position.set(0,1.55,.18); g.add(roofGlass);
  for(const x of [-.92,.92]){
    for(const z of [-.78,.88]){
      const pillar=new THREE.Mesh(new THREE.BoxGeometry(.09,.7,.09),paint);
      pillar.position.set(x,1.2,z); g.add(pillar);
    }
  }

  // Front grille, bumper and lower intake.
  const grille=new THREE.Mesh(new THREE.BoxGeometry(1.18,.24,.06),dark);
  grille.position.set(0,.61,-2.32); g.add(grille);
  for(let i=-4;i<=4;i++){
    const bar=new THREE.Mesh(new THREE.BoxGeometry(.055,.16,.035),chrome);
    bar.position.set(i*.13,.61,-2.355); g.add(bar);
  }
  const bumper=new THREE.Mesh(new THREE.BoxGeometry(2.38,.18,.12),new THREE.MeshStandardMaterial({color:0x171a1d,metalness:.35,roughness:.45}));
  bumper.position.set(0,.47,-2.32); g.add(bumper);

  // Side mirrors and door handles.
  for(const x of [-1.25,1.25]){
    const mirror=new THREE.Mesh(new THREE.BoxGeometry(.16,.16,.3),paint);
    mirror.position.set(x,1.15,-.72); mirror.castShadow=true; g.add(mirror);
  }
  for(const x of [-1.28,1.28]) for(const z of [-.18,.65]){
    const handle=new THREE.Mesh(new THREE.BoxGeometry(.045,.045,.18),chrome);
    handle.position.set(x,1.0,z); g.add(handle);
  }

  // Four wheels with hubs and visible brake discs.
  for(const x of [-1.3,1.3]) for(const z of [-1.48,1.48]){
    const tire=new THREE.Mesh(new THREE.CylinderGeometry(.39,.39,.25,20),rubber);
    tire.rotation.z=Math.PI/2; tire.position.set(x,.42,z); tire.castShadow=true; g.add(tire);
    const rim=new THREE.Mesh(new THREE.CylinderGeometry(.23,.23,.27,16),chrome);
    rim.rotation.z=Math.PI/2; rim.position.set(x,.42,z); g.add(rim);
    const hub=new THREE.Mesh(new THREE.CylinderGeometry(.08,.08,.28,12),dark);
    hub.rotation.z=Math.PI/2; hub.position.set(x,.42,z); g.add(hub);
    const disc=new THREE.Mesh(new THREE.CylinderGeometry(.16,.16,.035,16),new THREE.MeshStandardMaterial({color:0x555b60,metalness:.75,roughness:.32}));
    disc.rotation.z=Math.PI/2; disc.position.set(x+(x>0?.14:-.14),.42,z); g.add(disc);
  }

  const headMat=new THREE.MeshStandardMaterial({color:0xfff4d6,emissive:0xffc35a,emissiveIntensity:1.1});
  const tailMat=new THREE.MeshStandardMaterial({color:0x8b1118,emissive:0x4d0005,emissiveIntensity:.85});
  for(const x of [-.78,.78]){
    const h=new THREE.Mesh(new THREE.BoxGeometry(.5,.17,.08),headMat); h.position.set(x,.76,-2.31); g.add(h);
    const t=new THREE.Mesh(new THREE.BoxGeometry(.5,.17,.08),tailMat); t.position.set(x,.76,2.31); g.add(t);
  }
  // License plate and rear diffuser.
  const plateMat=new THREE.MeshStandardMaterial({color:0xe6e2d5,roughness:.55});
  const plate=new THREE.Mesh(new THREE.BoxGeometry(.72,.24,.025),plateMat);
  plate.position.set(0,.68,2.34); g.add(plate);
  const rearBumper=new THREE.Mesh(new THREE.BoxGeometry(2.38,.18,.12),new THREE.MeshStandardMaterial({color:0x171a1d,metalness:.35,roughness:.45}));
  rearBumper.position.set(0,.47,2.32); g.add(rearBumper);
  const exhaust=new THREE.Mesh(new THREE.CylinderGeometry(.07,.07,.2,12),chrome);
  exhaust.rotation.x=Math.PI/2; exhaust.position.set(.72,.48,2.38); g.add(exhaust);

  // Hood crease and side skirts for stronger highlights.
  for(const x of [-.78,.78]){
    const crease=new THREE.Mesh(new THREE.BoxGeometry(.035,.025,1.45),chrome);
    crease.position.set(x,.99,-1.42); g.add(crease);
    const skirt=new THREE.Mesh(new THREE.BoxGeometry(.08,.18,2.35),dark);
    skirt.position.set(x, .5, .12); g.add(skirt);
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
  const crown=new THREE.Mesh(new THREE.IcosahedronGeometry(1.12*s,1),new THREE.MeshStandardMaterial({color:0x2e5732,roughness:.95})); crown.castShadow=true;
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
  const g=new THREE.Group();
  const b=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color,roughness:.82,metalness:.05}));
  b.position.y=h/2;b.castShadow=true;b.receiveShadow=true;g.add(b);
  const roof=new THREE.Mesh(new THREE.BoxGeometry(w+.15,.16,d+.15),new THREE.MeshStandardMaterial({color:0x292c2f,roughness:.75}));
  roof.position.y=h+.08;roof.castShadow=true;g.add(roof);
  const rows=Math.max(1,Math.floor(h/2));
  const cols=Math.max(1,Math.floor(w/2));
  for(let r=0;r<rows;r++) for(let q=0;q<cols;q++){
    const win=new THREE.Mesh(new THREE.BoxGeometry(.42,.5,.025),new THREE.MeshStandardMaterial({color:(r+q)%4===0?0xf1c76b:0x27353e,emissive:(r+q)%4===0?0x6b4b16:0x000000,emissiveIntensity:.35}));
    win.position.set(-w/2+.9+q*1.8,.85+r*1.65,d/2+.014);g.add(win);
    const win2=win.clone();win2.position.z=-d/2-.014;win2.rotation.y=Math.PI;g.add(win2);
  }
  g.position.set(x,0,z);scene.add(g);
}
function buildCity(){
  scene=new THREE.Scene();
  scene.background=new THREE.Color(0x65757d);
  scene.fog=new THREE.Fog(0x65757d,55,190);

  camera=new THREE.PerspectiveCamera(62,viewport.clientWidth/viewport.clientHeight,.1,500);
  renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:"high-performance"});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.55));
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.08;
  renderer.setSize(viewport.clientWidth,viewport.clientHeight);
  viewport.innerHTML=""; viewport.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xdde8ef,0x26302c,1.8));
  const ambient=new THREE.AmbientLight(0xffffff,.22); scene.add(ambient);
  const sun=new THREE.DirectionalLight(0xfff2d6,2.8); sun.position.set(35,55,25); sun.castShadow=true; sun.shadow.mapSize.set(1024,1024); sun.shadow.camera.left=-80; sun.shadow.camera.right=80; sun.shadow.camera.top=80; sun.shadow.camera.bottom=-80; scene.add(sun);
  const fill=new THREE.DirectionalLight(0x9fc5ff,.45); fill.position.set(-40,20,-30); scene.add(fill);

  rainDrops=[];
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(300,300),new THREE.MeshStandardMaterial({color:0x657067,roughness:.92})); ground.receiveShadow=true;
  ground.rotation.x=-Math.PI/2; scene.add(ground);

  // Main roads plus cross streets, creating real intersections.
  for(let i=-4;i<=4;i++){
    const road=new THREE.Mesh(new THREE.BoxGeometry(8,.06,300),new THREE.MeshStandardMaterial({color:0x25282b,roughness:.82})); road.receiveShadow=true;
    road.position.set(i*13,.03,0); scene.add(road);
    const line=new THREE.Mesh(new THREE.BoxGeometry(.12,.03,300),new THREE.MeshStandardMaterial({color:0xd5d2b9}));
    line.position.set(i*13,.075,0); scene.add(line);
  }
  // Sidewalk strips along the main roads.
  for(let x=-52;x<=52;x+=13){
    for(const side of [-1,1]){
      const s=new THREE.Mesh(new THREE.BoxGeometry(.9,.12,300),new THREE.MeshStandardMaterial({color:0x8d8b82,roughness:.88}));
      s.position.set(x+side*4.55,.08,0);s.receiveShadow=true;scene.add(s);
    }
  }
  for(let z=-90;z<=90;z+=45){
    for(const side of [-1,1]){
      const s=new THREE.Mesh(new THREE.BoxGeometry(300,.12,.9),new THREE.MeshStandardMaterial({color:0x8d8b82,roughness:.88}));
      s.position.set(0,.08,z+side*4.55);s.receiveShadow=true;scene.add(s);
    }
  }
  // Dashed lane separators.
  for(let x=-39;x<=39;x+=13) for(let z=-135;z<135;z+=7){
    const m=new THREE.Mesh(new THREE.BoxGeometry(.08,.035,3.1),new THREE.MeshBasicMaterial({color:0xe8dfbd}));
    m.position.set(x,.09,z);scene.add(m);
  }
  // Cross streets and intersections.
  for(let z=-90;z<=90;z+=45){
    const cross=new THREE.Mesh(new THREE.BoxGeometry(300,.07,8),new THREE.MeshStandardMaterial({color:0x26292c,roughness:.82}));
    cross.position.set(0,.035,z);cross.receiveShadow=true;scene.add(cross);
    const crossLine=new THREE.Mesh(new THREE.BoxGeometry(300,.03,.12),new THREE.MeshStandardMaterial({color:0xd5d2b9}));
    crossLine.position.set(0,.075,z);scene.add(crossLine);
    addTrafficLight(0,z);
    // Crosswalks on both sides of each intersection.
    for(const side of [-1,1]){
      for(let k=-3;k<=3;k++){
        const stripe=new THREE.Mesh(new THREE.BoxGeometry(7,.025,.34),new THREE.MeshBasicMaterial({color:0xd9d7cc}));
        stripe.position.set(k*1.05,.085,z+side*5.05);scene.add(stripe);
      }
    }
  }
  // Small visual landmarks: gas station, workshop and parking lot.
  const gasBase=new THREE.Mesh(new THREE.BoxGeometry(18,.18,11),new THREE.MeshStandardMaterial({color:0x303438,roughness:.8}));
  gasBase.position.set(45,.1,35);gasBase.receiveShadow=true;scene.add(gasBase);
  const gasRoof=new THREE.Mesh(new THREE.BoxGeometry(16,.35,9),new THREE.MeshStandardMaterial({color:0x4c5256,metalness:.25,roughness:.4}));
  gasRoof.position.set(45,4.3,35);gasRoof.castShadow=true;scene.add(gasRoof);
  for(const x of [40,50]){
    const col=new THREE.Mesh(new THREE.CylinderGeometry(.16,.16,4.1,10),new THREE.MeshStandardMaterial({color:0x24282b,metalness:.5,roughness:.45}));
    col.position.set(x,2.15,31);scene.add(col);
  }
  const workshop=new THREE.Mesh(new THREE.BoxGeometry(14,4.5,10),new THREE.MeshStandardMaterial({color:0x454a4d,roughness:.75}));
  workshop.position.set(-45,2.25,35);workshop.castShadow=true;workshop.receiveShadow=true;scene.add(workshop);
  const workshopDoor=new THREE.Mesh(new THREE.BoxGeometry(5.2,3.1,.08),new THREE.MeshStandardMaterial({color:0x171a1d,metalness:.2,roughness:.35}));
  workshopDoor.position.set(-45,1.65,29.96);scene.add(workshopDoor);
  for(let x=-56;x<=-34;x+=5.5){
    const bay=new THREE.Mesh(new THREE.BoxGeometry(4.2,.03,6.2),new THREE.MeshStandardMaterial({color:0x77736a,roughness:.9}));
    bay.position.set(x,.205,35);scene.add(bay);
  }
  for(let i=-10;i<=10;i++) addTree(i*11+(i%2)*3,-28-(Math.abs(i)%4)*11,.8+(Math.abs(i)%3)*.18);
  for(let i=-5;i<=5;i++){addBuilding(i*19,-70,9,6+(Math.abs(i)%4)*2,9,[0x666762,0x4e575d,0x71695f][Math.abs(i)%3]);addBuilding(i*19,70,9,5+(Math.abs(i)%3)*3,9,0x5c6361);}
  addBuilding(-45,35,10,4.5,8,0x4a5358);
  addBuilding(45,35,9,3.2,7,0x273b48);
  addBuilding(45,-35,11,5,9,0x3b5667);
  // Street lights.
  for(let x=-39;x<=39;x+=13) for(const z of [-48,48]){
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(.045,.07,3.8,8),new THREE.MeshStandardMaterial({color:0x22262a,metalness:.4,roughness:.55}));
    pole.position.set(x+3.8,1.9,z);pole.castShadow=true;scene.add(pole);
    const lamp=new THREE.Mesh(new THREE.SphereGeometry(.13,10,8),new THREE.MeshStandardMaterial({color:0xffe8ad,emissive:0xffa62b,emissiveIntensity:1.5}));
    lamp.position.set(x+3.8,3.82,z);scene.add(lamp);
  }
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

  const camDistance=state.speed>.25?10.5:8.5;
  const target=new THREE.Vector3(car.position.x-Math.sin(car.rotation.y)*camDistance, state.speed>.25?3.15:3.0, car.position.z-Math.cos(car.rotation.y)*camDistance);
  camera.position.lerp(target,.08);
  const look=new THREE.Vector3(car.position.x-Math.sin(car.rotation.y)*1.0,.72,car.position.z-Math.cos(car.rotation.y)*1.0);
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
      if(v==="gas"){if(state.gear==="P"||state.gear==="N")state.gear="D";input.gas=true;state.driving=true;}
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

document.addEventListener("pointerup",()=>{input.gas=input.left=input.right=input.brake=false;},{passive:true});
document.addEventListener("pointercancel",()=>{input.gas=input.left=input.right=input.brake=false;},{passive:true});
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
document.querySelector("#carInfo").onclick=()=>openPanel("Автомобиль",`<p><b>${state.car.name}</b></p><p>Состояние: ${Math.round(state.car.condition)}%</p><p>Двигатель: ${Math.round(state.car.engine)}%</p><p>Масло: ${Math.round(state.car.oil)}%</p><p>Охлаждение: ${Math.round(state.car.coolant)}%</p><p>Повреждения: ${Math.round(state.damage)}%</p><p>Температура: ${Math.round(state.heat)}°C</p>`);
document.querySelector("#exitBtn").onclick=exitCar;
document.querySelector("#horn").onclick=()=>msg("🔊 Бип!");
document.querySelector("#gearBtn").onclick=cycleGear;
document.querySelector("#fuelBtn").onclick=()=>{const d=Math.hypot(state.posX-45,state.posZ-35);if(d<14){const cost=Math.ceil((100-state.fuel)*8);if(state.money>=cost){state.money-=cost;state.fuel=100;msg("⛽ Бак заправлен за "+cost+" ₽");save();}else msg("Не хватает денег на топливо.");}else msg("Подъедь к заправке.");};
document.querySelector("#serviceBtn").onclick=()=>{const d=Math.hypot(state.posX+45,state.posZ-35);if(d<14){const cost=Math.max(250,Math.ceil(state.damage*45));if(state.money>=cost){state.money-=cost;state.damage=0;state.car.condition=100;state.car.engine=100;state.car.body=100;state.car.oil=100;state.car.coolant=100;state.car.brakes=100;state.car.battery=100;state.car.suspension=100;state.car.tires=100;msg("🔧 Машина полностью обслужена.");save();}else msg("Не хватает денег на сервис.");}else msg("Подъедь к сервису.");};
document.querySelector("#gearBtn").onclick=cycleGear;
document.querySelector("#cameraBtn").onclick=()=>{ if(camera){camera.fov=camera.fov===62?78:62;camera.updateProjectionMatrix();} };
document.querySelectorAll(".menu [data-scene]").forEach(b=>b.onclick=()=>renderScene(b.dataset.scene));
window.addEventListener("resize",()=>{if(renderer&&camera){camera.aspect=viewport.clientWidth/viewport.clientHeight;camera.updateProjectionMatrix();renderer.setSize(viewport.clientWidth,viewport.clientHeight);}});
renderScene("city");
