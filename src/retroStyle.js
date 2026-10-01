import * as THREE from "three";

/**
 * Retro Garage Car System
 * Low-poly cars inspired by Rally / Retro Garage game style
 * Geometric, blocky, chunky — like 1970s-1990s cars
 */

export const RETRO_COLORS = [
  { name: "Dark Blue", hex: 0x1a3a52 },
  { name: "Rust Red", hex: 0x8a3428 },
  { name: "Sage Green", hex: 0x5a6b4a },
  { name: "Sand", hex: 0xc9a876 },
  { name: "Deep Gray", hex: 0x3a3a38 },
  { name: "Burgundy", hex: 0x6b2c2c },
  { name: "Forest Green", hex: 0x2b4a2b },
  { name: "Charcoal", hex: 0x1f1f1f },
  { name: "Maroon", hex: 0x5a1a1a },
  { name: "Olive", hex: 0x5a5a2b }
];

// Materials for retro style
export function createRetroMaterials() {
  return {
    paint: (color) => new THREE.MeshStandardMaterial({
      color,
      metalness: 0.25,
      roughness: 0.55,
      flatShading: false
    }),
    chrome: new THREE.MeshStandardMaterial({
      color: 0xa8a8a8,
      metalness: 0.9,
      roughness: 0.15
    }),
    darkChrome: new THREE.MeshStandardMaterial({
      color: 0x555555,
      metalness: 0.7,
      roughness: 0.3
    }),
    glass: new THREE.MeshStandardMaterial({
      color: 0x1a3a4a,
      metalness: 0.05,
      roughness: 0.25,
      transparent: true,
      opacity: 0.7
    }),
    tire: new THREE.MeshStandardMaterial({
      color: 0x0a0a0a,
      roughness: 0.95,
      metalness: 0
    }),
    rim: new THREE.MeshStandardMaterial({
      color: 0xdddddd,
      metalness: 0.6,
      roughness: 0.35
    }),
    headlight: new THREE.MeshStandardMaterial({
      color: 0xffeb3b,
      emissive: 0xffb300,
      emissiveIntensity: 0.8,
      roughness: 0.2
    }),
    taillight: new THREE.MeshStandardMaterial({
      color: 0xdd3333,
      emissive: 0x990000,
      emissiveIntensity: 0.7,
      roughness: 0.25
    })
  };
}

/**
 * Create a low-poly retro car
 * Geometric, blocky, cube-based approach
 */
export function makeRetroCar(config = {}) {
  const {
    color = 0x1a3a52,
    type = 'sedan',        // sedan, truck, sport, van
    year = 1975,
    damage = 0,
    condition = 100
  } = config;

  const g = new THREE.Group();
  const mats = createRetroMaterials();
  const paint = mats.paint(color);

  // ====== PROPORTIONS ======
  const bodyWidth = type === 'van' ? 3.2 : type === 'truck' ? 3.0 : 2.95;
  const bodyHeight = type === 'truck' ? 0.72 : 0.65;
  const bodyLength = type === 'van' ? 5.1 : type === 'truck' ? 4.7 : 4.8;

  // ====== MAIN BODY (SIMPLE BOX) ======
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(bodyWidth, bodyHeight, bodyLength),
    paint
  );
  body.position.y = 0.6;
  body.castShadow = true;
  body.receiveShadow = true;
  body.userData = { partKey: "chassis", removable: false };
  g.add(body);

  // ====== WINDSHIELD / WINDOWS (FLAT PLANES) ======
  // Front windshield
  const frontGlass = new THREE.Mesh(
    new THREE.BoxGeometry(bodyWidth - 0.3, 0.01, 1.1),
    mats.glass
  );
  frontGlass.position.set(0, 1.3, -0.7);
  g.add(frontGlass);

  // Rear windshield
  const rearGlass = new THREE.Mesh(
    new THREE.BoxGeometry(bodyWidth - 0.3, 0.01, 0.8),
    mats.glass
  );
  rearGlass.position.set(0, 1.3, 1.35);
  g.add(rearGlass);

  // Side windows
  for (const x of [-1.5, 1.5]) {
    const sideGlass = new THREE.Mesh(
      new THREE.BoxGeometry(0.01, 0.4, 1.6),
      mats.glass
    );
    sideGlass.position.set(x, 1.15, 0.15);
    g.add(sideGlass);
  }

  // ====== BUMPERS (CHROME) ======
  const frontBumper = new THREE.Mesh(
    new THREE.BoxGeometry(bodyWidth + 0.2, 0.1, 0.2),
    mats.chrome
  );
  frontBumper.position.set(0, 0.45, -bodyLength / 2 - 0.12);
  frontBumper.castShadow = true;
  g.add(frontBumper);

  const rearBumper = frontBumper.clone();
  rearBumper.position.z = bodyLength / 2 + 0.12;
  rearBumper.castShadow = true;
  g.add(rearBumper);

  // ====== GRILLE (SIMPLE GRID) ======
  const grille = new THREE.Mesh(
    new THREE.BoxGeometry(bodyWidth - 0.4, 0.25, 0.08),
    mats.darkChrome
  );
  grille.position.set(0, 0.65, -bodyLength / 2 - 0.1);
  g.add(grille);

  // Grille bars
  for (let i = -4; i <= 4; i++) {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.18, 0.03),
      mats.chrome
    );
    bar.position.set(i * 0.12, 0.65, -bodyLength / 2 - 0.14);
    g.add(bar);
  }

  // ====== HEADLIGHTS (SIMPLE CYLINDERS) ======
  for (const x of [-1.15, 1.15]) {
    const light = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.15, 0.12, 12),
      mats.headlight
    );
    light.rotation.x = Math.PI / 2;
    light.position.set(x, 0.75, -bodyLength / 2 - 0.15);
    light.castShadow = true;
    g.add(light);
  }

  // ====== TAILLIGHTS (BOXES) ======
  for (const x of [-1.15, 1.15]) {
    const light = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 0.2, 0.08),
      mats.taillight
    );
    light.position.set(x, 0.65, bodyLength / 2 + 0.12);
    g.add(light);
  }

  // ====== SIDE MIRRORS ======
  for (const x of [-1.5, 1.5]) {
    const mirror = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.15, 0.2),
      mats.chrome
    );
    mirror.position.set(x, 1.1, -0.7);
    mirror.castShadow = true;
    g.add(mirror);
  }

  // ====== WHEELS ======
  const wheelRadius = 0.40;
  const wheelPositions = [
    { x: -1.30, z: -1.48 },
    { x: 1.30, z: -1.48 },
    { x: -1.30, z: 1.48 },
    { x: 1.30, z: 1.48 }
  ];

  const wheels = [];
  for (const pos of wheelPositions) {
    const wheelGroup = new THREE.Group();
    wheelGroup.position.set(pos.x, 0.40, pos.z);

    // Tire
    const tire = new THREE.Mesh(
      new THREE.CylinderGeometry(wheelRadius, wheelRadius, 0.26, 14),
      mats.tire
    );
    tire.rotation.z = Math.PI / 2;
    tire.castShadow = true;
    wheelGroup.add(tire);

    // Rim
    const rim = new THREE.Mesh(
      new THREE.CylinderGeometry(wheelRadius - 0.1, wheelRadius - 0.1, 0.28, 10),
      mats.rim
    );
    rim.rotation.z = Math.PI / 2;
    wheelGroup.add(rim);

    // Hub cap
    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 0.3, 8),
      mats.chrome
    );
    hub.rotation.z = Math.PI / 2;
    wheelGroup.add(hub);

    wheels.push(wheelGroup);
    g.add(wheelGroup);
  }

  // ====== HOOD / TRUNK (REMOVABLE) ======
  const hood = new THREE.Mesh(
    new THREE.BoxGeometry(bodyWidth - 0.1, 0.09, 1.0),
    paint
  );
  hood.position.set(0, 0.93, -bodyLength / 2 + 0.7);
  hood.castShadow = true;
  hood.userData = { partKey: "hood", removable: true };
  g.add(hood);

  const trunk = new THREE.Mesh(
    new THREE.BoxGeometry(bodyWidth - 0.1, 0.09, 0.7),
    paint
  );
  trunk.position.set(0, 0.93, bodyLength / 2 - 0.45);
  trunk.castShadow = true;
  trunk.userData = { partKey: "trunk", removable: true };
  g.add(trunk);

  // ====== VISUAL WEAR (DAMAGE / RUST) ======
  if (condition < 30 || damage > 50) {
    // Add rust patches
    const rustColor = 0x8b4513;
    const rustMat = new THREE.MeshStandardMaterial({
      color: rustColor,
      roughness: 1,
      metalness: 0.05
    });

    // Random rust spots on body
    for (let i = 0; i < 2; i++) {
      const rustSpot = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.25, 0.35),
        rustMat
      );
      rustSpot.position.set(
        (Math.random() - 0.5) * bodyWidth,
        0.6 + Math.random() * 0.5,
        (Math.random() - 0.5) * bodyLength
      );
      rustSpot.scale.set(0.8, 0.7, 0.9);
      g.add(rustSpot);
    }
  }

  g.userData.wheels = wheels;
  g.userData.color = color;
  g.userData.type = type;
  g.userData.condition = condition;
  g.userData.damage = damage;

  return g;
}

/**
 * Create retro parked car (simplified)
 */
export function makeRetroParkedCar(config = {}) {
  const {
    color = 0x1a3a52,
    type = 'sedan'
  } = config;

  const g = new THREE.Group();
  const mats = createRetroMaterials();
  const paint = mats.paint(color);

  const bodyWidth = type === 'van' ? 2.6 : 2.4;
  const bodyLength = type === 'van' ? 4.2 : 3.8;

  // Main body
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(bodyWidth, 0.5, bodyLength),
    paint
  );
  body.position.y = 0.4;
  body.castShadow = true;
  g.add(body);

  // Cabin
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(bodyWidth - 0.2, 0.35, bodyLength - 1.2),
    new THREE.MeshStandardMaterial({ color: 0x1a2a2a, roughness: 0.4, metalness: 0.1 })
  );
  cabin.position.set(0, 0.7, -0.15);
  g.add(cabin);

  // Windows
  for (const x of [-bodyWidth / 2 - 0.05, bodyWidth / 2 + 0.05]) {
    const win = new THREE.Mesh(
      new THREE.BoxGeometry(0.01, 0.25, bodyLength - 1.0),
      mats.glass
    );
    win.position.set(x, 0.7, -0.15);
    g.add(win);
  }

  // Wheels
  for (const x of [-bodyWidth / 2 + 0.3, bodyWidth / 2 - 0.3]) {
    for (const z of [-bodyLength / 2 + 0.4, bodyLength / 2 - 0.4]) {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.3, 0.15, 12),
        mats.tire
      );
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.25, z);
      g.add(wheel);
    }
  }

  return g;
}

export default {
  RETRO_COLORS,
  createRetroMaterials,
  makeRetroCar,
  makeRetroParkedCar
};
