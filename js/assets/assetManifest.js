/**
 * ASSET MANIFEST
 * Merkezi 3D Varlık (Asset) Tanımları ve Meta-veri Şeması
 * 
 * Alanlar:
 * - id: Benzersiz kimlik
 * - type: 'vehicle' | 'character' | 'house' | 'prop' | 'ped' | 'animation'
 * - url: Model / Dosya yolu
 * - lod0, lod1, lod2: LOD seviye yolları
 * - scale: Varsayılan ölçek katsayısı
 * - wheelNodes: Araçlar için tekerlek nesne isimleri
 * - colliders: Çarpışma kutusu / yarıçapı
 * - district: Bağlantılı mahalle/bölge
 * - tags: Arama / filtreleme etiketleri
 */

export const ASSET_MANIFEST = {
  // ==========================================
  // ARAÇLAR (VEHICLES)
  // ==========================================
  'vehicle_sedan_eclass': {
    id: 'vehicle_sedan_eclass',
    type: 'vehicle',
    name: 'Executive Sedan (E-Class)',
    url: 'assets/models/vehicles/sedan_eclass.glb',
    lod0: 'assets/models/vehicles/sedan_eclass.glb',
    lod1: null,
    lod2: null,
    scale: 1.0,
    wheelNodes: ['Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR', 'wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'],
    colliders: {
      type: 'box',
      size: [1.95, 1.42, 4.5],
      offset: [0, 0.72, 0]
    },
    district: 'grove_street',
    tags: ['vehicle', 'sedan', 'player', 'traffic', 'luxury']
  },
  'vehicle_sedan_mainstream': {
    id: 'vehicle_sedan_mainstream',
    type: 'vehicle',
    name: 'Mainstream Sedan',
    url: 'assets/models/vehicles/sedan_mainstream.glb',
    lod0: 'assets/models/vehicles/sedan_mainstream.glb',
    lod1: null,
    lod2: null,
    scale: 1.0,
    wheelNodes: ['Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR', 'wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'],
    colliders: {
      type: 'box',
      size: [1.88, 1.40, 4.4],
      offset: [0, 0.70, 0]
    },
    district: 'downtown',
    tags: ['vehicle', 'sedan', 'traffic']
  },
  'vehicle_suv': {
    id: 'vehicle_suv',
    type: 'vehicle',
    name: 'Ganton SUV',
    url: 'assets/models/vehicles/suv_model.glb',
    lod0: 'assets/models/vehicles/suv_model.glb',
    lod1: null,
    lod2: null,
    scale: 1.0,
    wheelNodes: ['Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR', 'wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'],
    colliders: {
      type: 'box',
      size: [2.05, 1.75, 4.7],
      offset: [0, 0.88, 0]
    },
    district: 'vinewood',
    tags: ['vehicle', 'suv', 'traffic']
  },
  'vehicle_vintage_beetle': {
    id: 'vehicle_vintage_beetle',
    type: 'vehicle',
    name: 'Vintage Beetle',
    url: 'assets/models/vehicles/vintage_beetle.glb',
    lod0: 'assets/models/vehicles/vintage_beetle.glb',
    lod1: null,
    lod2: null,
    scale: 1.0,
    wheelNodes: ['Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR'],
    colliders: {
      type: 'box',
      size: [1.70, 1.45, 3.8],
      offset: [0, 0.72, 0]
    },
    district: 'market',
    tags: ['vehicle', 'compact', 'classic']
  },
  'vehicle_alfa_giulia_1965': {
    id: 'vehicle_alfa_giulia_1965',
    type: 'vehicle',
    name: 'Alfa Romeo Giulia Sprint GTA (1965)',
    url: 'assets/models/vehicles/alfa_giulia_1965.glb',
    lod0: 'assets/models/vehicles/alfa_giulia_1965.glb',
    lod1: null,
    lod2: null,
    scale: 1.0,
    useGlbTransform: false,
    wheelNodes: ['rotorLF_hub'],
    colliders: {
      type: 'box',
      size: [1.58, 1.27, 4.05],
      offset: [0, 0.63, 0]
    },
    district: 'grove_street',
    tags: ['vehicle', 'classic', 'sports', 'player', 'traffic']
  },
  'vehicle_alfa_spider_1986': {
    id: 'vehicle_alfa_spider_1986',
    type: 'vehicle',
    name: 'Alfa Romeo Spider Quadrifoglio (1986)',
    url: 'assets/models/vehicles/alfa_spider_1986.glb',
    lod0: 'assets/models/vehicles/alfa_spider_1986.glb',
    lod1: null,
    lod2: null,
    scale: 1.0,
    useGlbTransform: false,
    wheelNodes: ['tirea_s_TireA_S_sidewall_001', 'tirea_s_TireA_S_sidewall_002'],
    colliders: {
      type: 'box',
      size: [1.79, 1.23, 4.26],
      offset: [0, 0.61, 0]
    },
    district: 'grove_street',
    tags: ['vehicle', 'classic', 'convertible', 'sports', 'player', 'traffic']
  },
  'vehicle_toyota_bz4x': {
    id: 'vehicle_toyota_bz4x',
    type: 'vehicle',
    name: 'Toyota bZ4X EV',
    url: 'assets/models/vehicles/toyota_bz4x.glb',
    lod0: 'assets/models/vehicles/toyota_bz4x.glb',
    lod1: null,
    lod2: null,
    scale: 1.0,
    useGlbTransform: false,
    wheelNodes: ['wheel_lf.child'],
    colliders: {
      type: 'box',
      size: [2.19, 1.64, 4.69],
      offset: [0, 0.82, -0.30]
    },
    district: 'downtown',
    tags: ['vehicle', 'suv', 'electric', 'player', 'traffic']
  },
  'vehicle_nissan_gtr': {
    id: 'vehicle_nissan_gtr',
    type: 'vehicle',
    name: 'Nissan GT-R R35 Nismo',
    url: 'assets/models/vehicles/nissan_gtr.glb',
    lod0: 'assets/models/vehicles/nissan_gtr.glb',
    lod1: null,
    lod2: null,
    scale: 1.0,
    useGlbTransform: false,
    wheelNodes: ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'],
    colliders: {
      type: 'box',
      size: [2.04, 1.39, 4.69],
      offset: [0, 0.70, 0]
    },
    district: 'grove_street',
    tags: ['vehicle', 'sports', 'supercar', 'player']
  },
  'vehicle_mercedes_e50': {
    id: 'vehicle_mercedes_e50',
    type: 'vehicle',
    name: 'Mercedes-Benz E50 AMG (1996)',
    url: 'assets/models/vehicles/mercedes_e50_w210.glb',
    lod0: 'assets/models/vehicles/mercedes_e50_w210.glb',
    lod1: null,
    lod2: null,
    scale: 1.0,
    useGlbTransform: false,
    wheelNodes: ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'],
    colliders: {
      type: 'box',
      size: [1.99, 1.45, 4.79],
      offset: [0, 0.72, 0]
    },
    district: 'grove_street',
    tags: ['vehicle', 'sedan', 'classic', 'traffic']
  },
  'vehicle_bmw_vision': {
    id: 'vehicle_bmw_vision',
    type: 'vehicle',
    name: 'BMW Vision Neue Klasse',
    url: 'assets/models/vehicles/bmw_vision.glb',
    lod0: 'assets/models/vehicles/bmw_vision.glb',
    lod1: null,
    lod2: null,
    scale: 1.0,
    useGlbTransform: false,
    wheelNodes: ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'],
    colliders: {
      type: 'box',
      size: [2.29, 1.56, 5.18],
      offset: [0, 0.78, 0]
    },
    district: 'downtown',
    tags: ['vehicle', 'sedan', 'electric', 'traffic']
  },

  // ==========================================
  // KARAKTERLER (CHARACTERS & PEDS)
  // ==========================================
  'character_player': {
    id: 'character_player',
    type: 'character',
    name: 'CJ / Street Hero',
    url: 'assets/models/character.glb',
    lod0: 'assets/models/character.glb',
    lod1: null,
    lod2: null,
    scale: 0.978, // ~1.80m / 1.84m
    wheelNodes: [],
    colliders: {
      type: 'capsule',
      radius: 0.35,
      height: 1.80,
      offset: [0, 0.90, 0]
    },
    district: 'grove_street',
    tags: ['character', 'player', 'cj']
  },
  'character_suit': {
    id: 'character_suit',
    type: 'ped',
    name: 'Suit NPC Driver',
    url: 'assets/models/char_suit.glb',
    lod0: 'assets/models/char_suit.glb',
    lod1: null,
    lod2: null,
    scale: 1.0,
    wheelNodes: [],
    colliders: {
      type: 'capsule',
      radius: 0.30,
      height: 1.75,
      offset: [0, 0.88, 0]
    },
    district: 'downtown',
    tags: ['character', 'ped', 'driver', 'npc']
  },
  'character_soldier': {
    id: 'character_soldier',
    type: 'ped',
    name: 'Soldier NPC',
    url: 'assets/models/char_soldier.glb',
    lod0: 'assets/models/char_soldier.glb',
    lod1: null,
    lod2: null,
    scale: 1.0,
    wheelNodes: [],
    colliders: {
      type: 'capsule',
      radius: 0.35,
      height: 1.82,
      offset: [0, 0.91, 0]
    },
    district: 'idlewood',
    tags: ['character', 'ped', 'security', 'npc']
  },
  'character_eugene': {
    id: 'character_eugene',
    type: 'ped',
    name: 'Eugene Civilian',
    url: 'assets/models/char_eugene.glb',
    lod0: 'assets/models/char_eugene.glb',
    lod1: null,
    lod2: null,
    scale: 1.0,
    wheelNodes: [],
    colliders: {
      type: 'capsule',
      radius: 0.32,
      height: 1.78,
      offset: [0, 0.89, 0]
    },
    district: 'market',
    tags: ['character', 'ped', 'civilian', 'npc']
  },
  'character_cj_classic': {
    id: 'character_cj_classic',
    type: 'ped',
    name: 'CJ Classic SA',
    url: 'assets/models/cj.glb',
    lod0: 'assets/models/cj.glb',
    lod1: null,
    lod2: null,
    scale: 1.0,
    wheelNodes: [],
    colliders: {
      type: 'capsule',
      radius: 0.32,
      height: 1.76,
      offset: [0, 0.88, 0]
    },
    district: 'grove_street',
    tags: ['character', 'ped', 'cj', 'lowpoly']
  },
  'character_niko': {
    id: 'character_niko',
    type: 'ped',
    name: 'Niko Bellic (GTA IV)',
    url: 'assets/models/character/niko_gta_4.glb',
    lod0: 'assets/models/character/niko_gta_4.glb',
    lod1: null,
    lod2: null,
    scale: 0.01,
    wheelNodes: [],
    colliders: {
      type: 'capsule',
      radius: 0.35,
      height: 1.82,
      offset: [0, 0.91, 0]
    },
    district: 'downtown',
    tags: ['character', 'ped', 'gta4', 'easteregg']
  },

  // ==========================================
  // BİNALAR VE EVLER (HOUSES & BUILDINGS)
  // ==========================================
  'house_american': {
    id: 'house_american',
    type: 'house',
    name: 'Amerikan Müstakil Ev',
    url: 'assets/models/american_house.glb?v=30',
    lod0: 'assets/models/american_house.glb?v=30',
    lod1: null,
    lod2: null,
    scale: 1.0,
    wheelNodes: [],
    colliders: {
      type: 'box',
      size: [14.0, 7.5, 12.0],
      offset: [0, 3.75, 0]
    },
    district: 'grove_street',
    tags: ['house', 'residential', 'suburb']
  },
  'house_family_home': {
    id: 'house_family_home',
    type: 'house',
    name: 'Aile Evi (Family Home)',
    url: 'assets/models/house_family_home.glb?v=16',
    lod0: 'assets/models/house_family_home.glb?v=16',
    lod1: null,
    lod2: null,
    scale: 1.0,
    wheelNodes: [],
    colliders: {
      type: 'box',
      size: [12.5, 6.8, 11.0],
      offset: [0, 3.4, 0]
    },
    district: 'grove_street',
    tags: ['house', 'residential']
  },
  'house_pascal': {
    id: 'house_pascal',
    type: 'house',
    name: 'Pascal Kompleksi',
    url: 'assets/models/pascal_house.glb?v=99',
    lod0: 'assets/models/pascal_house.glb?v=99',
    lod1: null,
    lod2: null,
    scale: 1.0,
    wheelNodes: [],
    colliders: {
      type: 'box',
      size: [16.0, 8.5, 15.0],
      offset: [0, 4.25, 0]
    },
    district: 'idlewood',
    tags: ['house', 'complex']
  },
  'house_city_a': {
    id: 'house_city_a',
    type: 'house',
    name: 'Şehir Evi A',
    url: 'assets/models/house_city_a.glb?v=16',
    lod0: 'assets/models/house_city_a.glb?v=16',
    lod1: null,
    lod2: null,
    scale: 1.0,
    wheelNodes: [],
    colliders: {
      type: 'box',
      size: [10.0, 8.0, 10.0],
      offset: [0, 4.0, 0]
    },
    district: 'downtown',
    tags: ['house', 'urban']
  },
  'house_suburban_a': {
    id: 'house_suburban_a',
    type: 'house',
    name: 'Banliyö Evi A',
    url: 'assets/models/house_suburban_a.glb?v=16',
    lod0: 'assets/models/house_suburban_a.glb?v=16',
    lod1: null,
    lod2: null,
    scale: 1.0,
    wheelNodes: [],
    colliders: {
      type: 'box',
      size: [11.0, 6.5, 10.5],
      offset: [0, 3.25, 0]
    },
    district: 'vinewood',
    tags: ['house', 'suburb']
  },

  // ==========================================
  // PROPLAR VE ÇEVRE (PROPS & TREES)
  // ==========================================
  'tree_palm': {
    id: 'tree_palm',
    type: 'prop',
    name: 'California Palmiyesi',
    url: 'assets/models/trees/tree_palm.glb',
    lod0: 'assets/models/trees/tree_palm.glb',
    lod1: null,
    lod2: null,
    scale: 2.4,
    wheelNodes: [],
    colliders: {
      type: 'cylinder',
      radius: 0.4,
      height: 8.0,
      offset: [0, 4.0, 0]
    },
    district: 'grove_street',
    tags: ['prop', 'tree', 'vegetation', 'nature']
  },
  'tree_oak': {
    id: 'tree_oak',
    type: 'prop',
    name: 'Gölge Meşe Ağacı',
    url: 'assets/models/trees/tree_oak.glb',
    lod0: 'assets/models/trees/tree_oak.glb',
    lod1: null,
    lod2: null,
    scale: 2.2,
    wheelNodes: [],
    colliders: {
      type: 'cylinder',
      radius: 0.5,
      height: 6.5,
      offset: [0, 3.25, 0]
    },
    district: 'grove_street',
    tags: ['prop', 'tree', 'vegetation', 'nature']
  },

  // ==========================================
  // ANİMASYONLAR (ANIMATIONS)
  // ==========================================
  'anim_idle': {
    id: 'anim_idle',
    type: 'animation',
    name: 'Idle Animation',
    url: 'assets/models/character/anim/Idle.fbx',
    tags: ['animation', 'character', 'idle']
  },
  'anim_walk': {
    id: 'anim_walk',
    type: 'animation',
    name: 'Walk Animation',
    url: 'assets/models/character/anim/walk.fbx',
    tags: ['animation', 'character', 'locomotion']
  },
  'anim_run': {
    id: 'anim_run',
    type: 'animation',
    name: 'Run Animation',
    url: 'assets/models/character/anim/Running.fbx',
    tags: ['animation', 'character', 'locomotion']
  },
  'anim_jump': {
    id: 'anim_jump',
    type: 'animation',
    name: 'Jump Animation',
    url: 'assets/models/character/anim/jump.fbx',
    tags: ['animation', 'character', 'jump']
  },
  'anim_hit': {
    id: 'anim_hit',
    type: 'animation',
    name: 'Attack / Hit Animation',
    url: 'assets/models/character/anim/attack.fbx',
    tags: ['animation', 'character', 'combat']
  }
};

/**
 * Manifest Arama ve Yardımcı Fonksiyonlar
 */
export function getManifestEntry(idOrUrl) {
  if (!idOrUrl) return null;
  if (ASSET_MANIFEST[idOrUrl]) return ASSET_MANIFEST[idOrUrl];

  // URL eşleşmesi ara
  const cleanUrl = idOrUrl.split('?')[0];
  for (const entry of Object.values(ASSET_MANIFEST)) {
    if (entry.url && entry.url.split('?')[0] === cleanUrl) {
      return entry;
    }
  }
  return null;
}

export function getManifestEntriesByType(type) {
  return Object.values(ASSET_MANIFEST).filter(e => e.type === type);
}

export function getManifestEntriesByTag(tag) {
  return Object.values(ASSET_MANIFEST).filter(e => e.tags && e.tags.includes(tag));
}
