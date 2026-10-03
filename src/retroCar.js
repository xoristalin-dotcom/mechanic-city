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

  const rolling=new THREE.Group();
  rolling.name="Wheel_RollingAssembly";
  wheel.add(rolling);
  const tire=cylinder(rolling,M.tire,"Tire",0.405,0.235,0,0,0,0,0,Math.PI/2,28);
  tire.userData.isWheel=true;
  cylinder(rolling,M.chrome,"Alloy_Rim",0.255,0.245,0,0,0,0,0,Math.PI/2,24);
  cylinder(rolling,M.black,"Hub",0.085,0.255,0,0,0,0,0,Math.PI/2,20);
  cylinder(rolling,M.chrome,"Brake_Disc",0.315,0.055,side<0?-0.125:0.125,0,0,0,Math.PI/2,28);
  const caliper=box(wheel,M.brake,"Brake_Caliper",0.07,0.15,0.20,side<0?-0.16:0.16,0.05,0.0,0.025);
  caliper.rotation.z=0.15;
  wheel.userData.front=front;
  wheel.userData.side=side;
  wheel.userData.rolling=rolling;
  wheel.userData.spin=rolling;
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


function makeDetailedMechanicalLayer(root){
  const detail=new THREE.Group();
  detail.name="Detailed_Mechanical_Layer";
  root.add(detail);

  const rubber=new THREE.MeshStandardMaterial({color:0x111214,roughness:.82,metalness:.04});
  const darkMetal=new THREE.MeshStandardMaterial({color:0x24282b,roughness:.48,metalness:.78});
  const brushed=new THREE.MeshStandardMaterial({color:0x6f7478,roughness:.30,metalness:.88});
  const redDark=new THREE.MeshPhysicalMaterial({color:0x7d0c12,roughness:.20,metalness:.55,emissive:0x180103,emissiveIntensity:.25});
  const amber=new THREE.MeshPhysicalMaterial({color:0xffa11a,roughness:.18,metalness:.25,emissive:0x5a2700,emissiveIntensity:.35});
  const white=new THREE.MeshPhysicalMaterial({color:0xf2f6ff,roughness:.12,metalness:.22,emissive:0x293747,emissiveIntensity:.45});

  // Suspension arms only: wheel hubs, rotors and calipers live inside each wheel assembly.
  for(const side of [-1,1]){
    const s=side<0?"L":"R";
    for(const z of [1.30,-1.30]){
      const wheelTag=z>0?"F":"R";
      box(detail,darkMetal,"ControlArm_"+s+"_"+wheelTag,.10,.08,.52,side*.72,.34,z,.025);
      cylinder(detail,rubber,"StrutBoot_"+s+"_"+wheelTag,.07,.36,side*.67,.64,z,0,0,0,16);
      cylinder(detail,darkMetal,"HubBearing_"+s+"_"+wheelTag,.10,.10,side*.99,.39,z,0,Math.PI/2,0,18);
    }
  }

  // Visible steering/suspension links under the body.
  for(const side of [-1,1]){
    const s=side<0?"L":"R";
    box(detail,darkMetal,"Front_Subframe_"+s,.10,.12,1.55,side*.58,.32,.98,.025);
    box(detail,darkMetal,"Rear_Subframe_"+s,.10,.12,1.42,side*.58,.32,-.92,.025);
    cylinder(detail,rubber,"Front_Shock_"+s,.055,.62,side*.58,.56,1.02,0,0,0,16);
    cylinder(detail,rubber,"Rear_Shock_"+s,.055,.56,side*.58,.54,-1.00,0,0,0,16);
  }

  // Engine: belts, pulleys, intake runners, oil filler and wiring.
  const engine=root.userData.engineBay;
  if(engine){
    box(engine,darkMetal,"Alternator",.30,.22,.34,-.50,.65,1.10,.035);
    cylinder(engine,brushed,"AlternatorPulley",.095,.055,-.50,.65,1.28,Math.PI/2,0,0,20);
    cylinder(engine,darkMetal,"CrankPulley",.13,.055,0,.47,1.05,Math.PI/2,0,0,22);
    box(engine,M.black,"AirFilterBox",.42,.18,.52,0,1.00,1.42,.045);
    cylinder(engine,brushed,"OilFiller",.055,.12,.34,.98,1.02,0,0,0,14);
    for(const x of [-.22,-.11,0,.11,.22]){
      box(engine,M.black,"IntakeRunner_"+x,.045,.07,.43,x,.99,1.08,.012);
    }
    for(const side of [-1,1]){
      for(let i=0;i<4;i++){
        cylinder(engine,redDark,"IgnitionCoil_"+side+"_"+i,.028,.18,side*.27,(.91-i*.035),.84+i*.11,Math.PI/2,0,0,12);
      }
    }
    box(engine,darkMetal,"ThrottleBody",.18,.16,.16,0,1.02,1.69,.025);
    box(engine,brushed,"EngineBadge",.25,.055,.10,0,1.08,1.46,.01);
  }

  // Radiator support, fan shroud and crash structure.
  box(detail,darkMetal,"RadiatorSupport",1.48,.10,.14,0,.51,1.93,.025);
  box(detail,M.black,"FanShroud",1.38,.08,.08,0,.70,1.90,.018);
  for(const x of [-.54,.54]){
    cylinder(detail,darkMetal,"CoolingFanHub",.07,.08,x,.72,1.87,Math.PI/2,0,0,18);
    for(let i=0;i<6;i++){
      const a=i*Math.PI/3;
      box(detail,rubber,"CoolingBlade",.035,.16,.025,x+Math.cos(a)*.12,.72+Math.sin(a)*.12,1.87,.008);
    }
  }

  // Door inner skins, armrests, speakers, lock pins and hinge hardware.
  for(const side of [-1,1]){
    const s=side<0?"L":"R";
    const door=root.children.find(o=>o.name==="Door_"+s+"_Assembly");
    if(!door) continue;
    box(door,M.interior,"Door_InnerSkin_"+s,.035,.46,1.31,-side*.105,.01,-.38,.035);
    box(door,M.dash,"Door_Armrest_"+s,.045,.10,.70,-side*.13,-.03,-.34,.025);
    box(door,M.black,"Door_Speaker_"+s,.025,.16,.16,-side*.135,-.17,-.76,.06);
    box(door,M.chrome,"Door_Lock_"+s,.025,.055,.09,-side*.14,.32,-.02,.01);
    for(let i=0;i<3;i++) box(door,darkMetal,"Door_Hinge_"+s+"_"+i,.045,.045,.12,-side*.12,.25+i*.16,.45,.012);
  }

  // Seats get rails, bolsters and four-point-visible belt anchors.
  const cabin=root.userData.interior;
  if(cabin){
    for(const side of [-1,1]){
      const s=side<0?"L":"R";
      box(cabin,darkMetal,"SeatRail_"+s,.08,.06,.60,side*.43,.49,-.24,.018);
      box(cabin,darkMetal,"SeatRailRear_"+s,.08,.06,.60,side*.43,.49,-.62,.018);
      for(const z of [-.55,-.15]){
        cylinder(cabin,brushed,"SeatRailPin_"+s,.025,.12,side*.43,.50,z,Math.PI/2,0,0,12);
      }
      box(cabin,redDark,"SeatBeltAnchor_"+s,.035,.08,.07,side*.58,.69,-.08,.018);
      box(cabin,M.black,"SeatBelt_"+s,.025,.045,.62,side*.55,.90,-.34,.012);
    }
    box(cabin,darkMetal,"CenterConsoleTrim",.32,.035,.92,0,.86,.02,.015);
    box(cabin,M.black,"Handbrake",.045,.12,.24,.12,.87,-.05,.025);
    box(cabin,brushed,"ClimatePanel",.42,.10,.035,0,1.11,.57,.012);
    for(let i=0;i<3;i++) cylinder(cabin,darkMetal,"ClimateDial_"+i,.045,.025,-.14+i*.14,1.12,.58,Math.PI/2,0,0,16);
  }

  // Instrument cluster: two gauges, center display and warning lights.
  const dash=root.userData.interior;
  if(dash){
    for(const x of [-.25,.02,.29]){
      cylinder(dash,darkMetal,"GaugeBezel_"+x,.12,.035,x,1.20,.56,Math.PI/2,0,0,24);
      cylinder(dash,white,"GaugeFace_"+x,.085,.018,x,1.20,.585,Math.PI/2,0,0,24);
    }
    for(let i=0;i<8;i++){
      box(dash,amber,"WarningLamp_"+i,.018,.018,.012,-.30+i*.085,1.14,.59,.004);
    }
    box(dash,M.black,"CenterDisplay",.24,.09,.018,.02,1.20,.595,.008);
  }

  // Steering spokes, center badge and column stalks.
  const steering=root.userData.steering;
  if(steering){
    for(const a of [0,Math.PI/2,Math.PI]){
      const spoke=box(steering,darkMetal,"SteeringSpoke",.035,.18,.045,0,Math.cos(a)*.09,Math.sin(a)*.09,.012);
      spoke.rotation.z=a;
    }
    cylinder(steering,brushed,"SteeringBadge",.055,.035,0,0,0,Math.PI/2,0,0,20);
    box(steering,M.black,"TurnSignalStalk",.025,.025,.20,.16,-.02,0,.01);
  }

  // Lighting internals: projectors, DRL strips, side markers and rear segments.
  for(const side of [-1,1]){
    const s=side<0?"L":"R";
    box(detail,white,"HeadlampProjector_"+s,.12,.07,.025,side*.61,.88,2.475,.008);
    box(detail,white,"DRL_"+s,.31,.018,.018,side*.61,.81,2.472,.006);
    box(detail,amber,"SideMarker_"+s,.035,.07,.025,side*1.02,.76,1.83,.008);
    box(detail,redDark,"TailSegment_"+s,.48,.055,.025,side*.39,.82,-2.45,.006);
    box(detail,redDark,"RearSideMarker_"+s,.035,.06,.025,side*1.02,.72,-1.82,.008);
  }

  // Fuel door, antenna, tow points and body fasteners.
  box(detail,M.paint2,"FuelDoor",.035,.18,.34,.93,.78,-.82,.055);
  cylinder(detail,darkMetal,"AntennaBase",.055,.035,.58,1.42,-.78,Math.PI/2,0,0,16);
  cylinder(detail,M.black,"Antenna",.018,.28,.58,1.57,-.78,0,0,0,12);
  for(const side of [-1,1]){
    box(detail,brushed,"TowPointFront_"+side,.10,.08,.16,side*.66,.43,2.46,.018);
    box(detail,brushed,"TowPointRear_"+side,.10,.08,.16,side*.66,.43,-2.48,.018);
  }
  for(const side of [-1,1]){
    for(let i=0;i<7;i++){
      cylinder(detail,brushed,"BodyFastener_"+side+"_"+i,.012,.018,side*.99,.69,-1.35+i*.42,Math.PI/2,0,0,10);
    }
  }

  // Exhaust system: mid-pipe, resonators and muffler bodies.
  for(const side of [-1,1]){
    const s=side<0?"L":"R";
    cylinder(detail,darkMetal,"ExhaustMidPipe_"+s,.045,1.35,side*.32,.38,-.55,Math.PI/2,0,0,14);
    cylinder(detail,darkMetal,"Muffler_"+s,.16,.46,side*.43,.38,-1.25,Math.PI/2,0,0,20);
    cylinder(detail,brushed,"ExhaustTip_"+s,.085,.34,side*.42,.43,-2.38,Math.PI/2,0,0,20);
    box(detail,rubber,"ExhaustHanger_"+s,.045,.08,.18,side*.35,.49,-1.00,.012);
  }

  // Trunk and hood underside ribs/struts.
  const hood=root.children.find(o=>o.name==="Hood_Hinge");
  const trunk=root.children.find(o=>o.name==="Trunk_Hinge");
  if(hood){
    for(const x of [-.62,-.30,.30,.62]) box(hood,darkMetal,"HoodUndersideRib_"+x,.055,.07,1.22,x,-.10,-.72,.012);
    for(const side of [-1,1]) cylinder(hood,darkMetal,"HoodGasStrut_"+side,.025,.58,side*.70,-.02,-.38,0,Math.PI/2,0,12);
  }
  if(trunk){
    for(const x of [-.58,-.20,.20,.58]) box(trunk,darkMetal,"TrunkUndersideRib_"+x,.05,.06,.62,x,-.09,.41,.012);
  }

  // Door, hood and trunk latch plates: useful visual service targets.
  for(const side of [-1,1]){
    box(detail,brushed,"DoorStriker_"+side,.035,.08,.14,side*.91,.79,.49,.012);
  }
  box(detail,brushed,"HoodLatch",.16,.06,.08,0,.50,1.99,.012);
  box(detail,brushed,"TrunkLatch",.16,.06,.08,0,.69,-2.01,.012);

  detail.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  root.userData.detailLayer=detail;
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
  makeDetailedMechanicalLayer(root);

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
