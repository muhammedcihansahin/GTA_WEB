/**
 * Şehir Parsel & Ada Konfigürasyonu
 * Ev konumları, yükseklikleri, kamera açıları ve arsa sınırları
 */

export const HOUSE_PARCELS = {
  // 1. Ana Ev - GTA San Andreas CJ'in Evi (Johnson House)
  american: {
    id: 'american',
    title: "CJ'in Evi (Johnson House)",
    role: 'Ana Ev (Carl Johnson)',
    category: 'Grove Street',
    badge: 'CJ Evi 🏡',
    address: 'Grove Street No: 101',
    position: [-20, 0, 20],
    rotation: [0, -Math.PI / 2, 0],
    scaleMode: 'height',
    targetHeight: 5.4,
    cameraOffset: [20, 4.8, 0],
    lookOffset: [0, 2.4, 0]
  },

  // 3. Müstakil Aile Evi (Doğu Bulvarı No: 1)
  family_home: {
    id: 'family_home',
    title: 'Müstakil Aile Evi',
    role: 'Şehir Konutu',
    category: 'Müstakil Evler',
    badge: 'Bahçeli & Garajlı',
    address: 'Doğu Bulvarı No: 102',
    position: [28, 0, -22],
    rotation: [0, -Math.PI / 2, 0],
    scaleMode: 'height',
    targetHeight: 7.4,
    cameraOffset: [-22, 7.0, 0],
    lookOffset: [0, 3.0, 0]
  },

  // 4. Modern Şehir Konutları (Batı Bulvarı No: 2)
  pascal: {
    id: 'pascal',
    title: 'Modern Şehir Konutları',
    role: 'Şehir Konut Kompleksi',
    category: 'Şehir Evleri',
    badge: '3 Katlı Konutlar',
    address: 'Batı Bulvarı No: 103',
    position: [-34, 0, 10],
    rotation: [0, Math.PI / 2, 0],
    scaleMode: 'pascal_complex',
    targetUnitHeight: 8.8,
    cameraOffset: [28, 7.5, 0],
    lookOffset: [0, 3.5, 0]
  },

  // 5. Çok Katlı Şehir Apartmanı (Doğu Bulvarı No: 2)
  city_a: {
    id: 'city_a',
    title: 'Çok Katlı Şehir Apartmanı',
    role: 'Şehir Binası',
    category: 'Şehir Binaları',
    badge: 'Şehir Apartmanı',
    address: 'Doğu Bulvarı No: 104',
    position: [28, 0, 10],
    rotation: [0, -Math.PI / 2, 0],
    scaleMode: 'height',
    targetHeight: 11.8,
    cameraOffset: [-24, 8.5, 0],
    lookOffset: [0, 4.5, 0]
  },

  // 6. Klasik Banliyö Evi Tip A (Batı Bulvarı No: 3)
  suburban_a: {
    id: 'suburban_a',
    title: 'Klasik Banliyö Evi (Tip A)',
    role: 'Şehir Konutu',
    category: 'Banliyö Evleri',
    badge: 'Kırma Çatılı',
    address: 'Batı Bulvarı No: 105',
    position: [-26, 0, 44],
    rotation: [0, Math.PI / 2, 0],
    scaleMode: 'height',
    targetHeight: 5.2,
    cameraOffset: [18, 6.0, 0],
    lookOffset: [0, 2.4, 0]
  },

  // 7. İki Katlı Aile Evi Tip B (Doğu Bulvarı No: 3)
  suburban_b: {
    id: 'suburban_b',
    title: 'İki Katlı Aile Evi (Tip B)',
    role: 'Şehir Konutu',
    category: 'Banliyö Evleri',
    badge: '2 Katlı Konut',
    address: 'Doğu Bulvarı No: 106',
    position: [26, 0, 44],
    rotation: [0, -Math.PI / 2, 0],
    scaleMode: 'height',
    targetHeight: 7.2,
    cameraOffset: [-20, 6.8, 0],
    lookOffset: [0, 2.8, 0]
  },

  // 8. Bahçeli L-Tipi Konut Tip C (Batı Bulvarı No: 4)
  suburban_c: {
    id: 'suburban_c',
    title: 'Bahçeli L-Tipi Konut (Tip C)',
    role: 'Şehir Konutu',
    category: 'Banliyö Evleri',
    badge: 'L-Plan Konut',
    address: 'Batı Bulvarı No: 107',
    position: [-26, 0, 74],
    rotation: [0, Math.PI / 2, 0],
    scaleMode: 'height',
    targetHeight: 5.4,
    cameraOffset: [18, 6.0, 0],
    lookOffset: [0, 2.4, 0]
  },

  // 9. Çağdaş Düz Çatılı Ev Tip D (Doğu Bulvarı No: 4)
  suburban_d: {
    id: 'suburban_d',
    title: 'Çağdaş Düz Çatılı Ev (Tip D)',
    role: 'Şehir Konutu',
    category: 'Banliyö Evleri',
    badge: 'Modern Mimari',
    address: 'Doğu Bulvarı No: 108',
    position: [26, 0, 74],
    rotation: [0, -Math.PI / 2, 0],
    scaleMode: 'height',
    targetHeight: 6.8,
    cameraOffset: [-19, 6.8, 0],
    lookOffset: [0, 2.8, 0]
  },

  // 10. Garajlı Banliyö Villası Tip E (Güney Meydanı)
  suburban_e: {
    id: 'suburban_e',
    title: 'Garajlı Banliyö Villası (Tip E)',
    role: 'Şehir Konutu',
    category: 'Banliyö Evleri',
    badge: 'Garajlı Villa',
    address: 'Güney Meydanı No: 109',
    position: [0, 0, 102],
    rotation: [0, Math.PI, 0],
    scaleMode: 'height',
    targetHeight: 7.0,
    cameraOffset: [0, 7.2, -20],
    lookOffset: [0, 2.8, 0]
  }
};

/**
 * Şehir Mahalle & Bölge (District) Tanımları
 */
export const DISTRICTS = {
  grove_street_residential: {
    id: 'grove_street_residential',
    name: 'Grove Street Çıkmazı & Çevresi',
    theme: 'classic_ganton',
    ambientColor: 0xd5cbbd,
    propDensity: 'high'
  },
  suburban_poor: {
    id: 'suburban_poor',
    name: 'Ganton Kenar Banliyö',
    theme: 'worn_down',
    ambientColor: 0xbaab96,
    propDensity: 'medium'
  },
  suburban_mid: {
    id: 'suburban_mid',
    name: 'Doğu Bulvarı Konutları',
    theme: 'residential_clean',
    ambientColor: 0xe0d6c8,
    propDensity: 'medium'
  },
  cul_de_sac_classic: {
    id: 'cul_de_sac_classic',
    name: 'Çıkmaz Sokak Uç Villaları',
    theme: 'spacious_lots',
    ambientColor: 0xd8cbbe,
    propDensity: 'high'
  },
  commercial_stub: {
    id: 'commercial_stub',
    name: 'Doğu Ticari Şerit',
    theme: 'commercial_simple',
    ambientColor: 0xc8c0b4,
    propDensity: 'low'
  }
};

/**
 * 16 Adadaki parseller ve dış kanat arsaları
 * Zenginleştirilmiş alanlar: districtId, seed, houseStyle, colorPalette, propSet, mirror, lodCategory
 */
export const PARCEL_PLOTS = [
  // Kuzeybatı Merkezi Ada (Ganton Kenar Banliyö)
  { x: -44, z: -44, w: 23, d: 23, id: 'C-NW1', districtId: 'suburban_poor', seed: 101, houseStyle: 'ryder_style', colorPalette: 'weathered_wood', propSet: 'fenced_trash', mirror: false, lodCategory: 'lod_building_mid' },
  { x: -20, z: -44, w: 23, d: 23, id: 'C-NW2', districtId: 'suburban_poor', seed: 102, houseStyle: 'sweet_style', colorPalette: 'dusty_rose', propSet: 'ac_unit_chimney', mirror: true, lodCategory: 'lod_building_mid' },
  { x: -44, z: -20, w: 23, d: 23, id: 'C-NW3', districtId: 'suburban_poor', seed: 103, houseStyle: 'cj_style', colorPalette: 'slate_blue', propSet: 'fenced_trash', mirror: false, lodCategory: 'lod_building_mid' },
  { x: -20, z: -20, w: 23, d: 23, id: 'C-NW4', districtId: 'suburban_poor', seed: 104, houseStyle: 'sweet_style', colorPalette: 'olive_drab', propSet: 'mailbox_garden', mirror: false, lodCategory: 'lod_building_mid' },

  // Kuzeydoğu Merkezi Ada (Doğu Bulvarı Konutları - Temiz/Orta Banliyö)
  { x: 20, z: -44, w: 23, d: 23, id: 'C-NE1', districtId: 'suburban_mid', seed: 201, houseStyle: 'sweet_style', colorPalette: 'sun_terracotta', propSet: 'mailbox_garden', mirror: false, lodCategory: 'lod_building_mid' },
  { x: 44, z: -44, w: 23, d: 23, id: 'C-NE2', districtId: 'suburban_mid', seed: 202, houseStyle: 'cj_style', colorPalette: 'warm_beige', propSet: 'clean_driveway', mirror: true, lodCategory: 'lod_building_mid' },
  { x: 20, z: -20, w: 23, d: 23, id: 'C-NE3', districtId: 'suburban_mid', seed: 203, houseStyle: 'ryder_style', colorPalette: 'mint_faded', propSet: 'ac_unit_chimney', mirror: false, lodCategory: 'lod_building_mid' },
  { x: 44, z: -20, w: 23, d: 23, id: 'C-NE4', districtId: 'commercial_stub', seed: 204, houseStyle: 'cj_style', colorPalette: 'weathered_wood', propSet: 'clean_driveway', mirror: true, lodCategory: 'lod_building_mid' },

  // Güneybatı Merkezi Ada (Grove Street Çekirdeği - İkonik Evler)
  { x: -44, z: 20, w: 23, d: 23, id: 'C-SW1', districtId: 'grove_street_residential', seed: 301, houseStyle: 'sweet_style', colorPalette: 'olive_drab', propSet: 'ac_unit_chimney', mirror: false, lodCategory: 'lod_building_high' },
  { x: -20, z: 20, w: 23, d: 23, id: 'C-SW2', districtId: 'grove_street_residential', seed: 302, houseStyle: 'cj_style', colorPalette: 'warm_beige', propSet: 'mailbox_garden', mirror: false, lodCategory: 'lod_building_high', isIconicCJ: true },
  { x: -44, z: 44, w: 23, d: 23, id: 'C-SW3', districtId: 'grove_street_residential', seed: 303, houseStyle: 'ryder_style', colorPalette: 'weathered_wood', propSet: 'fenced_trash', mirror: true, lodCategory: 'lod_building_high', isIconicRyder: true },
  { x: -20, z: 44, w: 23, d: 23, id: 'C-SW4', districtId: 'grove_street_residential', seed: 304, houseStyle: 'sweet_style', colorPalette: 'mint_faded', propSet: 'mailbox_garden', mirror: false, lodCategory: 'lod_building_high', isIconicSweet: true },

  // Güneydoğu Merkezi Ada (Doğu Bulvarı Konutları)
  { x: 20, z: 20, w: 23, d: 23, id: 'C-SE1', districtId: 'suburban_mid', seed: 401, houseStyle: 'cj_style', colorPalette: 'dusty_rose', propSet: 'clean_driveway', mirror: false, lodCategory: 'lod_building_mid' },
  { x: 44, z: 20, w: 23, d: 23, id: 'C-SE2', districtId: 'suburban_mid', seed: 402, houseStyle: 'ryder_style', colorPalette: 'slate_blue', propSet: 'fenced_trash', mirror: true, lodCategory: 'lod_building_mid' },
  { x: 20, z: 44, w: 23, d: 23, id: 'C-SE3', districtId: 'suburban_mid', seed: 403, houseStyle: 'sweet_style', colorPalette: 'sun_terracotta', propSet: 'ac_unit_chimney', mirror: false, lodCategory: 'lod_building_mid' },
  { x: 44, z: 44, w: 23, d: 23, id: 'C-SE4', districtId: 'commercial_stub', seed: 404, houseStyle: 'cj_style', colorPalette: 'warm_beige', propSet: 'clean_driveway', mirror: true, lodCategory: 'lod_building_mid' },

  // 2. Dış Kanat Adalarındaki Geniş Villa Parselleri
  // Dış Batı Adaları (Ganton Batı Uçları)
  { x: -115, z: -44, w: 24, d: 24, id: 'W-V1', districtId: 'suburban_poor', seed: 501, houseStyle: 'ryder_style', colorPalette: 'weathered_wood', propSet: 'fenced_trash', mirror: true, lodCategory: 'lod_building_mid' },
  { x: -85, z: -44, w: 24, d: 24, id: 'W-V2', districtId: 'suburban_poor', seed: 502, houseStyle: 'sweet_style', colorPalette: 'olive_drab', propSet: 'ac_unit_chimney', mirror: false, lodCategory: 'lod_building_mid' },
  { x: -115, z: 44, w: 24, d: 24, id: 'W-V3', districtId: 'suburban_poor', seed: 503, houseStyle: 'cj_style', colorPalette: 'sun_terracotta', propSet: 'fenced_trash', mirror: false, lodCategory: 'lod_building_mid' },
  { x: -85, z: 44, w: 24, d: 24, id: 'W-V4', districtId: 'suburban_poor', seed: 504, houseStyle: 'ryder_style', colorPalette: 'dusty_rose', propSet: 'mailbox_garden', mirror: true, lodCategory: 'lod_building_mid' },

  // Dış Doğu Adaları (Doğu Banliyö)
  { x: 85, z: -44, w: 24, d: 24, id: 'E-V1', districtId: 'suburban_mid', seed: 601, houseStyle: 'sweet_style', colorPalette: 'mint_faded', propSet: 'mailbox_garden', mirror: false, lodCategory: 'lod_building_mid' },
  { x: 115, z: -44, w: 24, d: 24, id: 'E-V2', districtId: 'suburban_mid', seed: 602, houseStyle: 'cj_style', colorPalette: 'warm_beige', propSet: 'clean_driveway', mirror: true, lodCategory: 'lod_building_mid' },
  { x: 85, z: 44, w: 24, d: 24, id: 'E-V3', districtId: 'suburban_mid', seed: 603, houseStyle: 'ryder_style', colorPalette: 'slate_blue', propSet: 'ac_unit_chimney', mirror: false, lodCategory: 'lod_building_mid' },
  { x: 115, z: 44, w: 24, d: 24, id: 'E-V4', districtId: 'suburban_mid', seed: 604, houseStyle: 'sweet_style', colorPalette: 'sun_terracotta', propSet: 'mailbox_garden', mirror: true, lodCategory: 'lod_building_mid' },

  // Dış Kuzey Adaları
  { x: -44, z: -100, w: 24, d: 24, id: 'N-V1', districtId: 'suburban_poor', seed: 701, houseStyle: 'cj_style', colorPalette: 'dusty_rose', propSet: 'fenced_trash', mirror: false, lodCategory: 'lod_building_mid' },
  { x: 44, z: -100, w: 24, d: 24, id: 'N-V2', districtId: 'suburban_mid', seed: 702, houseStyle: 'sweet_style', colorPalette: 'weathered_wood', propSet: 'mailbox_garden', mirror: true, lodCategory: 'lod_building_mid' },

  // Dış Güney Adaları
  { x: -44, z: 100, w: 24, d: 24, id: 'S-V1', districtId: 'suburban_poor', seed: 801, houseStyle: 'ryder_style', colorPalette: 'olive_drab', propSet: 'fenced_trash', mirror: false, lodCategory: 'lod_building_mid' },
  { x: 44, z: 100, w: 24, d: 24, id: 'S-V2', districtId: 'suburban_mid', seed: 802, houseStyle: 'cj_style', colorPalette: 'slate_blue', propSet: 'clean_driveway', mirror: true, lodCategory: 'lod_building_mid' },

  // Çıkmaz Sokak Uç Villa Parselleri (Cul-de-sac Klasikleri)
  { x: -185, z: -54, w: 25, d: 22, id: 'CUL-W1', districtId: 'cul_de_sac_classic', seed: 901, houseStyle: 'cj_style', colorPalette: 'warm_beige', propSet: 'mailbox_garden', mirror: false, lodCategory: 'lod_building_high' },
  { x: -185, z: -11, w: 25, d: 22, id: 'CUL-W2', districtId: 'cul_de_sac_classic', seed: 902, houseStyle: 'sweet_style', colorPalette: 'mint_faded', propSet: 'ac_unit_chimney', mirror: true, lodCategory: 'lod_building_high' },
  { x: 185, z: 11, w: 25, d: 22, id: 'CUL-E1', districtId: 'cul_de_sac_classic', seed: 903, houseStyle: 'ryder_style', colorPalette: 'sun_terracotta', propSet: 'mailbox_garden', mirror: false, lodCategory: 'lod_building_high' },
  { x: 185, z: 54, w: 25, d: 22, id: 'CUL-E2', districtId: 'cul_de_sac_classic', seed: 904, houseStyle: 'cj_style', colorPalette: 'weathered_wood', propSet: 'fenced_trash', mirror: true, lodCategory: 'lod_building_high' }
];
