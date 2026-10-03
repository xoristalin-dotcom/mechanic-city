import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

/*
 * Mechanic City — single authoritative player vehicle.
 * No GLB/GLTF/model fetches. Everything below is one procedural Dodge-Challenger-style
 * vehicle hierarchy so doors, hood, trunk, wheels, cockpit and camera share one root.
 */

const M = {
  paint: new THREE.MeshPhysicalMaterial({
    color: 0x252a2f, metalness: 0.78, roughness: 0.20, clearcoat: 0.92, clearcoatRoughness: 0.10
  }),
  paint2: new THREE.MeshPhysicalMaterial({
    color: 0x15191d, metalness: 0.72, roughness: 0.24, clearcoat: 0.75, clearcoatRoughness: 0.13
  }),
  black: new THREE.MeshStandardMaterial({color:0x050607,roughness:0.48,metalness:0.25}),
  tire: new THREE.MeshStandardMaterial({color:0x090a0b,roughness:0.94,metalness:0.02}),
  // Opaque dark glass: no alpha/transmission/floating transparent surfaces.
  glass: new THREE.MeshStandardMaterial({
    color:0x080b0e, metalness:0.18, roughness:0.30
  }),
  chrome: new THREE.MeshPhysicalMaterial({color:0xbfc4c8,metalness:0.96,roughness:0.16}),
  lamp: new THREE.MeshPhysicalMaterial({color:0xeaf4ff,metalness:0.25,roughness:0.08,emissive:0x334455,emissiveIntensity:0.35}),
  red: new THREE.MeshPhysicalMaterial({color:0x9e1118,metalness:0.28,roughness:0.15,emissive:0x260305,emissiveIntensity:0.22}),
  brake: new THREE.MeshStandardMaterial({color:0x8e1015,roughness:0.30,metalness:0.70}),
  interior: new THREE.MeshStandardMaterial({color:0x17191b,roughness:0.72,metalness:0.12}),
  seat: new THREE.MeshStandardMaterial({color:0x111315,roughness:0.66,metalness:0.08}),
  dash: new THREE.MeshStandardMaterial({color:0x202326,roughness:0.62,metalness:0.12})
};

function mesh(parent, geometry, material, name, x=0, y=0, z=0, rx=0, ry=0, rz=0){
  const m=new THREE.Mesh(geometry,material);
  m.name=name; m.position.set(x,y,z); m.rotation.set(rx,ry,rz);
  m.castShadow=true; m.receiveShadow=true; parent.add(m);
  return m;
}
function box(parent, material, name, sx, sy, sz, x=0, y=0, z=0, radius=0.05){
  return mesh(parent,new RoundedBoxGeometry(sx,sy,sz,7,radius),material,name,x,y,z);
}
function cylinder(parent, material, name, radius, depth, x,y,z, rx=0,ry=0,rz=0,segments=24){
  return mesh(parent,new THREE.CylinderGeometry(radius,radius,depth,segments),material,name,x,y,z,rx,ry,rz);
}

function makeWheel(parent, x, z, front, side){
  const wheel=new THREE.Group();
  wheel.name="Wheel_"+(side<0?"L":"R")+"_"+(front?"F":"R");
  wheel.position.set(x,0.39,z);
  parent.add(wheel);

  const tire=cylinder(wheel,M.tire,"Tire",0.405,0.235,0,0,0,0,0,Math.PI/2,28);
  tire.userData.isWheel=true;
  const rim=cylinder(wheel,M.chrome,"Alloy_Rim",0.255,0.245,0,0,0,0,0,Math.PI/2,24);
  const hub=cylinder(wheel,M.black,"Hub",0.085,0.255,0,0,0,0,0,Math.PI/2,20);
  const disc=cylinder(wheel,M.chrome,"Brake_Disc",0.315,0.055,side<0?-0.125:0.125,0,0,0,Math.PI/2,28);
  const caliper=box(wheel,M.brake,"Brake_Caliper",0.07,0.15,0.20,side<0?-0.16:0.16,0.05,0.0,0.025);
  caliper.rotation.z=0.15;
  wheel.userData.front=front;
  wheel.userData.side=side;
  wheel.userData.spin=tire;
  wheel.userData.baseSteerY=0;
  return wheel;
}

function makeEngineBay(root){
  const bay=new THREE.Group();
  bay.name="Engine_Bay";
  bay.visible=false;
  root.add(bay);

  box(bay,M.paint2,"Engine_Block",1.02,.58,1.18,0,.58,1.03,.09);
  box(bay,M.chrome,"V8_Intake",.48,.18,.54,0,.94,1.03,.06);
  box(bay,M.paint,"Valve_Cover_L",.23,.10,.82,-.30,.86,1.03,0);
  box(bay,M.paint,"Valve_Cover_R",.23,.10,.82,.30,.86,1.03,0);
  box(bay,M.black,"Radiator",1.36,.50,.09,0,.58,1.91,.025);
  for(const x of [-.54,.54]) cylinder(bay,M.black,"Cooling_Fan",.30,.07,x,.70,1.86,Math.PI/2,0,0,20);
  box(bay,M.black,"Battery",.30,.26,.50,-.67,.67,1.28,.035);
  for(const x of [-.18,.18]) cylinder(bay,M.chrome,"Exhaust_Header",.045,.75,x,.60,.93,Math.PI/2,0,0,12);
  const hoseMat=new THREE.MeshStandardMaterial({color:0x111315,roughness:.7});
  for(const x of [-.45,.45]){
    const curve=new THREE.CatmullRomCurve3([
      new THREE.Vector3(x,.88,1.75),
      new THREE.Vector3(x*1.1,.96,1.50),
      new THREE.Vector3(x*.8,.90,1.22)
    ]);
    mesh(bay,new THREE.TubeGeometry(curve,10,.028,8,false),hoseMat,"Coolant_Hose_"+x);
  }
  root.userData.engineBay=bay;
}

function makeInterior(root){
  const cabin=new THREE.Group();
  cabin.name="Challenger_Interior";
  root.add(cabin);

  box(cabin,M.interior,"Floor",1.46,.08,2.25,0,.49,-.08,.025);
  box(cabin,M.dash,"Dashboard",1.48,.24,.34,0,1.04,.73,.05);
  box(cabin,M.dash,"CenterConsole",.30,.18,1.20,0,.73,.03,.05);
  box(cabin,M.black,"InstrumentCluster",1.05,.22,.10,0,1.17,.56,.025);

  for(const side of [-1,1]){
    const seat=box(cabin,M.seat,"FrontSeat_"+(side<0?"L":"R"),.48,.72,.58,side*.43,.82,-.24,.12);
    seat.rotation.x=-0.07;
    box(cabin,M.seat,"RearSeat_"+(side<0?"L":"R"),.48,.42,.48,side*.40,.73,-1.02,.09);
  }

  const steering=new THREE.Group();
  steering.name="Steering_Wheel";
  steering.position.set(-.46,1.08,.55);
  cabin.add(steering);
  const wheel=new THREE.Mesh(new THREE.TorusGeometry(.19,.035,10,28),M.black);
  wheel.rotation.y=Math.PI/2;
  wheel.castShadow=true;
  steering.add(wheel);
  box(steering,M.black,"SteeringHub",.10,.10,.08,0,0,0,.02);

  box(cabin,M.chrome,"GearSelector",.08,.16,.10,.20,.84,.10,.025);
  box(cabin,M.black,"PedalBox",.38,.16,.24,-.48,.58,.58,.025);
  root.userData.interior=cabin;
  root.userData.steering=steering;
  root.userData.articulation.steering=steering;
}

function makeDoor(root, side){
  const pivot=new THREE.Object3D();
  pivot.name="Door_"+(side<0?"L":"R")+"_Hinge";
  pivot.position.set(side*.965,.76,.34);
  root.add(pivot);

  const door=new THREE.Group();
  door.name="Door_"+(side<0?"L":"R")+"_Assembly";
  pivot.add(door);

  // Sculpted outer door, window and lower crease. The door is one moving assembly.
  box(door,M.paint,"Door_OuterPanel",.12,.53,1.48,-side*.025,0,-.38,.055);
  box(door,M.paint2,"Door_LowerSculpt",.045,.22,1.30,-side*.088,-.09,-.38,.025);
  box(door,M.glass,"Door_Window",.045,.34,1.28,-side*.074,.31,-.38,.035);
  box(door,M.chrome,"Door_Belt",.035,.035,1.25,-side*.085,.49,-.38,.01);
  box(door,M.chrome,"Door_Handle",.035,.055,.28,-side*.088,.12,-.02,.012);
  const trim=new THREE.Mesh(new THREE.BoxGeometry(.035,.025,1.15),M.paint2);
  trim.position.set(-side*.091,.04,-.38); door.add(trim);

  return {pivot,open:0,openSign:side<0?1:-1,axis:"y",maxAngle:1.04};
}

function buildChallenger(){
  const root=new THREE.Group();
  root.name="Dodge_Challenger_MechanicCity_SINGLE";
  root.userData.singleAuthoritativeModel=true;
  root.userData.modelSource="procedural-threejs";
  root.userData.modelLoading=false;
  root.userData.vehicleSpec={lengthMeters:4.95,widthMeters:1.93,heightMeters:1.36,model:"Dodge Challenger"};
  root.userData.articulation={doors:[],hood:null,trunk:null,steering:null};
  root.userData.serviceParts={};
  root.userData.wheels=[];

  // Main muscle-car body: layered volumes produce the long hood, cabin and rear haunch.
  box(root,M.paint,"Main_Body",1.82,.56,3.72,0,.64,-.02,.15);
  box(root,M.paint,"Lower_Body_L",.18,.40,3.42,-.88,.57,-.02,.08);
  box(root,M.paint,"Lower_Body_R",.18,.40,3.42,.88,.57,-.02,.08);
  box(root,M.paint,"Front_Haunch_L",.30,.48,.92,-.80,.72,1.42,.10);
  box(root,M.paint,"Front_Haunch_R",.30,.48,.92,.80,.72,1.42,.10);
  box(root,M.paint,"Rear_Haunch_L",.32,.50,1.00,-.82,.72,-1.34,.11);
  box(root,M.paint,"Rear_Haunch_R",.32,.50,1.00,.82,.72,-1.34,.11);

  // Low roof and thick pillars — Challenger silhouette.
  box(root,M.paint,"Roof",1.47,.20,1.88,0,1.30,-.08,.13);
  box(root,M.paint2,"WindshieldFrame",1.50,.43,.11,0,1.14,.78,.04,Math.PI*.15);
  box(root,M.glass,"Windshield",1.38,.34,.035,0,1.15,.805,.02,Math.PI*.15);
  box(root,M.paint2,"RearGlassFrame",1.50,.36,.10,0,1.14,-1.00,.04,-Math.PI*.12);
  box(root,M.glass,"RearGlass",1.38,.29,.035,0,1.15,-1.025,.02,-Math.PI*.12);
  for(const side of [-1,1]){
    box(root,M.paint2,"A_Pillar_"+(side<0?"L":"R"),.065,.42,.15,side*.72,1.17,.68,.025);
    box(root,M.paint2,"B_Pillar_"+(side<0?"L":"R"),.065,.44,.15,side*.74,1.17,-.02,.025);
    box(root,M.paint2,"C_Pillar_"+(side<0?"L":"R"),.065,.40,.15,side*.72,1.16,-.80,.025);
  }

  // Long sculpted hood with center bulge.
  const hoodPivot=new THREE.Object3D();
  hoodPivot.name="Hood_Hinge";
  hoodPivot.position.set(0,.91,2.08);
  root.add(hoodPivot);
  box(hoodPivot,M.paint,"Hood",1.70,.16,1.48,0,0,-.72,.07);
  box(hoodPivot,M.paint2,"Hood_Scoop",.48,.055,.66,0,.105,-.72,.025);
  box(hoodPivot,M.chrome,"Hood_LeadingTrim",1.45,.025,.035,0,.07,-1.43,.01);

  // Rear deck + subtle lip.
  const trunkPivot=new THREE.Object3D();
  trunkPivot.name="Trunk_Hinge";
  trunkPivot.position.set(0,.92,-2.08);
  root.add(trunkPivot);
  box(trunkPivot,M.paint,"Trunk",1.70,.15,.82,0,0,.41,.065);
  box(trunkPivot,M.paint2,"Trunk_Lip",1.48,.07,.16,0,.10,.77,.035);

  // Challenger front fascia.
  box(root,M.paint2,"Front_Bumper",1.84,.31,.23,0,.51,2.28,.075);
  box(root,M.black,"Dodge_Grille",1.36,.20,.07,0,.72,2.405,.025);
  box(root,M.chrome,"Grille_UpperTrim",1.38,.035,.035,0,.83,2.45,.01);
  for(const x of [-.61,.61]){
    box(root,M.lamp,"Headlamp_"+(x<0?"L":"R"),.43,.15,.045,x,.88,2.43,.018);
    box(root,M.chrome,"HeadlampTrim_"+(x<0?"L":"R"),.27,.025,.025,x,.88,2.46,.008);
  }
  box(root,M.black,"FrontSplitter",1.70,.06,.20,0,.38,2.35,.025);

  // Rear fascia / full-width tail signature.
  box(root,M.paint2,"Rear_Bumper",1.84,.31,.22,0,.51,-2.30,.075);
  box(root,M.red,"TailLightBar",1.46,.15,.045,0,.82,-2.42,.018);
  box(root,M.chrome,"RearTrim",1.52,.035,.035,0,.71,-2.45,.01);
  for(const x of [-.56,.56]) cylinder(root,M.chrome,"Exhaust_"+(x<0?"L":"R"),.078,.10,x,.43,-2.43,Math.PI/2,0,0,20);

  // Wheel arches: curved tubes follow the four wheel openings.
  const wheelPositions=[[-.96,1.30,true], [.96,1.30,true], [-.96,-1.30,false], [.96,-1.30,false]];
  for(const [x,z,front] of wheelPositions){
    const side=x<0?-1:1;
    const curve=new THREE.CatmullRomCurve3([
      new THREE.Vector3(x,.43,z-.43),
      new THREE.Vector3(x*1.01,.67,z-.32),
      new THREE.Vector3(x*1.02,.79,z),
      new THREE.Vector3(x*1.01,.67,z+.32),
      new THREE.Vector3(x,.43,z+.43)
    ]);
    mesh(root,new THREE.TubeGeometry(curve,16,.045,8,false),M.paint2,"WheelArch_"+(side<0?"L":"R")+"_"+(front?"F":"R"));
    const w=makeWheel(root,x,z,front,side);
    root.userData.wheels.push(w);
  }

  // Dense body surfacing: rocker panels, shoulder lines, fender caps and panel seams.
  box(root,M.paint2,"Rocker_L",.10,.22,3.25,-.96,.48,0,.035);
  box(root,M.paint2,"Rocker_R",.10,.22,3.25,.96,.48,0,.035);
  for(const side of [-1,1]){
    box(root,M.paint,"Front_Fender_"+(side<0?"L":"R"),.12,.30,.88,side*.91,.76,1.18,.09);
    box(root,M.paint,"Rear_Fender_"+(side<0?"L":"R"),.13,.32,.92,side*.92,.76,-1.22,.10);
    box(root,M.chrome,"Side_Character_Line_"+(side<0?"L":"R"),.025,.035,2.55,side*.968,.82,-.05,.008);
    box(root,M.black,"Lower_Door_Vent_"+(side<0?"L":"R"),.028,.10,.42,side*.974,.62,.76,.012);
  }

  // Hood details: recessed center channel and twin heat-extractor inserts.
  box(root,M.paint2,"Hood_Center_Channel",.055,.025,1.25,0,.105,-.72,.008);
  for(const x of [-.38,.38]){
    box(root,M.black,"Hood_Heat_Extractor_"+(x<0?"L":"R"),.19,.025,.42,x,.11,-.77,.018);
    for(let i=0;i<4;i++){
      box(root,M.chrome,"Hood_Grille_"+x+"_"+i,.025,.012,.055,x-.07+i*.047,.125,-.77,.004);
    }
  }

  // Front fascia detail: recessed intake, grille bars and separate fog lamps.
  box(root,M.black,"Lower_Intake",1.18,.15,.06,0,.49,2.42,.018);
  for(let i=-5;i<=5;i++){
    box(root,M.chrome,"Grille_Bar_"+i,.025,.12,.025,i*.105,.73,2.45,.008);
  }
  for(const x of [-.72,.72]){
    cylinder(root,M.lamp,"FogLamp_"+(x<0?"L":"R"),.075,.035,x,.55,2.43,Math.PI/2,0,0,20);
  }

  // Rear detail: license recess, reverse lamps and quad exhaust finishers.
  box(root,M.black,"Plate_Recess",.52,.18,.035,0,.66,-2.43,.012);
  for(const x of [-.30,.30]){
    box(root,M.lamp,"Reverse_Lamp_"+(x<0?"L":"R"),.17,.045,.025,x,.82,-2.455,.006);
  }
  for(const x of [-.42,.42]){
    cylinder(root,M.chrome,"Exhaust_Finisher_"+(x<0?"L":"R"),.095,.11,x,.43,-2.49,Math.PI/2,0,0,24);
  }

  // Roof and glass surround: solid pillars and a continuous roof skin.
  box(root,M.paint2,"Roof_Trim_L",.045,.055,1.92,-.75,1.31,-.08,.012);
  box(root,M.paint2,"Roof_Trim_R",.045,.055,1.92,.75,1.31,-.08,.012);

  // Mirrors and flush handles.
  for(const side of [-1,1]){
    box(root,M.paint2,"Mirror_"+(side<0?"L":"R"),.17,.11,.28,side*.96,1.04,.43,.035);
    box(root,M.chrome,"Handle_"+(side<0?"L":"R"),.035,.055,.28,side*.955,.91,-.03,.012);
  }

  const doors=[makeDoor(root,-1),makeDoor(root,1)];
  root.userData.articulation.doors=doors;
  root.userData.articulation.hood={pivot:hoodPivot,open:0,openSign:-1,axis:"x",maxAngle:.78};
  root.userData.articulation.trunk={pivot:trunkPivot,open:0,openSign:-1,axis:"x",maxAngle:.70};

  makeInterior(root);
  makeEngineBay(root);

  // Mechanical/service points are real meshes on the same single hierarchy.
  root.userData.serviceParts.engine={mesh:root.userData.engineBay,condition:100,installed:true};
  root.userData.serviceParts.transmission={mesh:box(root,M.paint2,"Transmission",.50,.32,.72,0,.45,.15,.08),condition:100,installed:true};
  root.userData.serviceParts.suspension={mesh:box(root,M.paint2,"SuspensionCore",.85,.16,2.35,0,.42,0,.03),condition:100,installed:true};
  root.userData.serviceParts.body={mesh:root,condition:100,installed:true};

  root.traverse(o=>{
    if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}
  });
  root.updateMatrixWorld(true);
  return root;
}

export class RetroCarBuilder {
  constructor(config={}){
    this.config={color:0x252b31,type:"sedan",year:1975,damageLevel:0,...config};
    this.carGroup=buildChallenger();
    this.parts={};
    this.pivots={};
    this.articulation=this.carGroup.userData.articulation;
    this.carGroup.userData.retroBuilder=this;
    this.carGroup.visible=true;
  }

  build(){ return this.carGroup; }
  getGroup(){ return this.carGroup; }

  addFullChallengerMechanicalLayer(){
    return this.carGroup;
  }
}
