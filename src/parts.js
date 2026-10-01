import * as THREE from "three";

/**
 * Enhanced part system for mechanic-city
 * Integrates with existing state.car.partState and articulation
 * Supports: repair, removal, installation, tuning, visual wear
 */

// ====== PART DEFINITIONS ======
export const PART_CATALOG = {
  // ENGINE SUBSYSTEM
  engine: {
    name: "Двигатель",
    category: "engine",
    subsystem: "engine",
    removable: true,
    tunable: true,
    baseCost: 450
  },
  alternator: {
    name: "Генератор",
    category: "engine",
    subsystem: "engine",
    removable: true,
    tunable: false,
    baseCost: 120
  },
  starter: {
    name: "Стартер",
    category: "engine",
    subsystem: "engine",
    removable: true,
    tunable: false,
    baseCost: 85
  },

  // TRANSMISSION
  transmission: {
    name: "Коробка передач",
    category: "transmission",
    subsystem: "transmission",
    removable: true,
    tunable: true,
    baseCost: 380
  },

  // BODY PARTS
  hood: {
    name: "Капот",
    category: "body",
    subsystem: "body",
    removable: true,
    tunable: false,
    baseCost: 95
  },
  trunk: {
    name: "Багажник",
    category: "body",
    subsystem: "body",
    removable: true,
    tunable: false,
    baseCost: 85
  },
  door_FL: {
    name: "Дверь передняя левая",
    category: "body",
    subsystem: "body",
    removable: true,
    tunable: false,
    baseCost: 120
  },
  door_FR: {
    name: "Дверь передняя правая",
    category: "body",
    subsystem: "body",
    removable: true,
    tunable: false,
    baseCost: 120
  },
  door_RL: {
    name: "Дверь задняя левая",
    category: "body",
    subsystem: "body",
    removable: true,
    tunable: false,
    baseCost: 110
  },
  door_RR: {
    name: "Дверь задняя правая",
    category: "body",
    subsystem: "body",
    removable: true,
    tunable: false,
    baseCost: 110
  },
  bumper_front: {
    name: "Передний бампер",
    category: "body",
    subsystem: "body",
    removable: true,
    tunable: false,
    baseCost: 75
  },
  bumper_rear: {
    name: "Задний бампер",
    category: "body",
    subsystem: "body",
    removable: true,
    tunable: false,
    baseCost: 65
  },

  // WHEELS
  tire_FL: {
    name: "Шина переднего левого колеса",
    category: "wheels",
    subsystem: "wheels",
    removable: true,
    tunable: true,
    baseCost: 55
  },
  tire_FR: {
    name: "Шина переднего правого колеса",
    category: "wheels",
    subsystem: "wheels",
    removable: true,
    tunable: true,
    baseCost: 55
  },
  tire_RL: {
    name: "Шина заднего левого колеса",
    category: "wheels",
    subsystem: "wheels",
    removable: true,
    tunable: true,
    baseCost: 55
  },
  tire_RR: {
    name: "Шина заднего правого колеса",
    category: "wheels",
    subsystem: "wheels",
    removable: true,
    tunable: true,
    baseCost: 55
  },
  rim_FL: {
    name: "Диск переднего левого колеса",
    category: "wheels",
    subsystem: "wheels",
    removable: true,
    tunable: true,
    baseCost: 85
  },
  rim_FR: {
    name: "Диск переднего правого колеса",
    category: "wheels",
    subsystem: "wheels",
    removable: true,
    tunable: true,
    baseCost: 85
  },
  rim_RL: {
    name: "Диск заднего левого колеса",
    category: "wheels",
    subsystem: "wheels",
    removable: true,
    tunable: true,
    baseCost: 80
  },
  rim_RR: {
    name: "Диск заднего правого колеса",
    category: "wheels",
    subsystem: "wheels",
    removable: true,
    tunable: true,
    baseCost: 80
  },
  rotor_FL: {
    name: "Тормозной ротор FL",
    category: "brakes",
    subsystem: "brakes",
    removable: true,
    tunable: false,
    baseCost: 65
  },
  rotor_FR: {
    name: "Тормозной ротор FR",
    category: "brakes",
    subsystem: "brakes",
    removable: true,
    tunable: false,
    baseCost: 65
  },
  rotor_RL: {
    name: "Тормозной ротор RL",
    category: "brakes",
    subsystem: "brakes",
    removable: true,
    tunable: false,
    baseCost: 60
  },
  rotor_RR: {
    name: "Тормозной ротор RR",
    category: "brakes",
    subsystem: "brakes",
    removable: true,
    tunable: false,
    baseCost: 60
  },

  // SUSPENSION
  strut_FL: {
    name: "Амортизатор передний левый",
    category: "suspension",
    subsystem: "suspension",
    removable: true,
    tunable: true,
    baseCost: 145
  },
  strut_FR: {
    name: "Амортизатор передний правый",
    category: "suspension",
    subsystem: "suspension",
    removable: true,
    tunable: true,
    baseCost: 145
  },
  strut_RL: {
    name: "Амортизатор задний левый",
    category: "suspension",
    subsystem: "suspension",
    removable: true,
    tunable: true,
    baseCost: 135
  },
  strut_RR: {
    name: "Амортизатор задний правый",
    category: "suspension",
    subsystem: "suspension",
    removable: true,
    tunable: true,
    baseCost: 135
  },
  spring_FL: {
    name: "Пружина передняя левая",
    category: "suspension",
    subsystem: "suspension",
    removable: true,
    tunable: false,
    baseCost: 75
  },
  spring_FR: {
    name: "Пружина передняя правая",
    category: "suspension",
    subsystem: "suspension",
    removable: true,
    tunable: false,
    baseCost: 75
  },
  spring_RL: {
    name: "Пружина задняя левая",
    category: "suspension",
    subsystem: "suspension",
    removable: true,
    tunable: false,
    baseCost: 70
  },
  spring_RR: {
    name: "Пружина задняя правая",
    category: "suspension",
    subsystem: "suspension",
    removable: true,
    tunable: false,
    baseCost: 70
  },

  // LIGHTS
  headlight_L: {
    name: "Фара левая",
    category: "lights",
    subsystem: "lights",
    removable: true,
    tunable: false,
    baseCost: 45
  },
  headlight_R: {
    name: "Фара правая",
    category: "lights",
    subsystem: "lights",
    removable: true,
    tunable: false,
    baseCost: 45
  },
  taillight_L: {
    name: "Задний фонарь левый",
    category: "lights",
    subsystem: "lights",
    removable: true,
    tunable: false,
    baseCost: 35
  },
  taillight_R: {
    name: "Задний фонарь правый",
    category: "lights",
    subsystem: "lights",
    removable: true,
    tunable: false,
    baseCost: 35
  },

  // GLASS
  window_front: {
    name: "Переднее стекло",
    category: "glass",
    subsystem: "glass",
    removable: true,
    tunable: false,
    baseCost: 95
  },
  window_rear: {
    name: "Заднее стекло",
    category: "glass",
    subsystem: "glass",
    removable: true,
    tunable: false,
    baseCost: 85
  },
  window_side_L: {
    name: "Боковое стекло левое",
    category: "glass",
    subsystem: "glass",
    removable: true,
    tunable: false,
    baseCost: 65
  },
  window_side_R: {
    name: "Боковое стекло правое",
    category: "glass",
    subsystem: "glass",
    removable: true,
    tunable: false,
    baseCost: 65
  },

  // EXHAUST
  exhaust_pipe: {
    name: "Выхлопная труба",
    category: "exhaust",
    subsystem: "exhaust",
    removable: true,
    tunable: false,
    baseCost: 55
  },
  muffler: {
    name: "Глушитель",
    category: "exhaust",
    subsystem: "exhaust",
    removable: true,
    tunable: true,
    baseCost: 85
  }
};

// ====== INITIALIZATION ======
export function initializeCarParts(state) {
  if (!state.car.partState) {
    state.car.partState = {};
  }

  for (const [key, meta] of Object.entries(PART_CATALOG)) {
    if (!state.car.partState[key]) {
      state.car.partState[key] = {
        condition: 100,
        installed: true
      };
    }
  }
}

// ====== SYNC LOGIC ======
export function syncCarPartsFromCatalog(car, state) {
  if (!car?.userData?.serviceParts) {
    car.userData.serviceParts = {};
  }

  const parts = car.userData.serviceParts;

  for (const [key, meta] of Object.entries(PART_CATALOG)) {
    const saved = state.car.partState?.[key];

    if (!parts[key]) {
      parts[key] = {};
    }

    const part = parts[key];
    part.key = key;
    part.name = meta.name;
    part.category = meta.category;
    part.subsystem = meta.subsystem;
    part.removable = meta.removable;
    part.tunable = meta.tunable;
    part.baseCost = meta.baseCost;

    // State synchronization
    part.condition = typeof saved?.condition === "number" ? saved.condition : 100;
    part.installed = saved?.installed !== false;

    // Visibility based on installation state
    if (part.mesh) {
      part.mesh.visible = part.installed;
    }
  }
}

export function updatePartVisuals(part, mesh) {
  if (!mesh || !mesh.material) return;

  const condition = part.condition || 100;

  if (condition < 30) {
    // Heavy rust/damage
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach(m => {
        m.color?.setHex(0x8b4513);
        m.roughness = Math.min(1, m.roughness + 0.3);
      });
    } else {
      mesh.material.color?.setHex(0x8b4513);
      mesh.material.roughness = Math.min(1, mesh.material.roughness + 0.3);
    }
  } else if (condition < 60) {
    // Medium wear
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach(m => {
        m.roughness = Math.min(1, m.roughness + 0.15);
      });
    } else {
      mesh.material.roughness = Math.min(1, mesh.material.roughness + 0.15);
    }
  }
}

// ====== PART OPERATIONS ======
export function getPartRepairCost(state, key) {
  const part = state.car.partState?.[key];
  if (!part) return 0;

  const condition = part.condition || 100;
  const meta = PART_CATALOG[key];
  if (!meta) return 0;

  // Cost to repair to 100% = (100 - current) * baseCost * 0.22
  return Math.max(40, Math.round((100 - condition) * meta.baseCost * 0.22));
}

export function repairPartFull(state, car, key) {
  const part = car?.userData?.serviceParts?.[key];
  if (!part || part.condition >= 100) return false;

  const cost = getPartRepairCost(state, key);
  if (state.money < cost) return false;

  state.money -= cost;
  state.car.partState[key].condition = 100;
  syncCarPartsFromCatalog(car, state);

  return true;
}

export function removePart(state, car, key) {
  const part = car?.userData?.serviceParts?.[key];
  if (!part || !part.removable || !part.installed) return false;

  state.car.partState[key].installed = false;
  part.installed = false;

  if (part.mesh) {
    part.mesh.visible = false;
  }

  return true;
}

export function installPart(state, car, key) {
  const part = car?.userData?.serviceParts?.[key];
  if (!part) return false;

  state.car.partState[key].installed = true;
  part.installed = true;

  if (part.mesh) {
    part.mesh.visible = true;
  }

  return true;
}

export function damagePart(state, car, key, amount = 15) {
  const part = car?.userData?.serviceParts?.[key];
  if (!part) return;

  const current = state.car.partState[key]?.condition || 100;
  state.car.partState[key].condition = Math.max(0, current - amount);

  if (part.mesh) {
    updatePartVisuals(part, part.mesh);
  }
}

export function tunePart(state, car, key) {
  const part = car?.userData?.serviceParts?.[key];
  if (!part || !part.tunable || !part.installed) return false;

  const tuneKey = "tune_" + key;
  if (state.car.parts?.[tuneKey]) {
    // Already tuned
    return false;
  }

  if (!state.car.parts) state.car.parts = {};
  state.car.parts[tuneKey] = {
    installed: true,
    quality: 1,
    bonus: 1.15
  };

  return true;
}

export default {
  PART_CATALOG,
  initializeCarParts,
  syncCarPartsFromCatalog,
  updatePartVisuals,
  getPartRepairCost,
  repairPartFull,
  removePart,
  installPart,
  damagePart,
  tunePart
};
