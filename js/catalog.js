/**
 * 3D Şehir Konut & Bina Kataloğu
 * Bağımsız model tanımları ve metadata
 */

export const MODEL_CATALOG = [
  // 1. Ana Ev - GTA San Andreas CJ'in Evi (Johnson House)
  {
    id: 'american',
    title: "CJ'in Evi (Johnson House)",
    role: 'Ana Ev (Carl Johnson)',
    category: 'Grove Street',
    icon: '🏡',
    badge: 'CJ Evi 🏡',
    address: 'Grove Street No: 101',
    desc: 'Yeşil panjurlu garajı, basketbol potası ve 2 kemerli verandası olan Los Santos evi',
    url: 'assets/models/american_house.glb?v=30'
  },

  // 3. Müstakil Aile Evi (Doğu Bulvarı)
  {
    id: 'family_home',
    title: 'Müstakil Aile Evi',
    role: 'Şehir Konutu',
    category: 'Doğu Bulvarı',
    icon: '🏠',
    badge: 'Doğu No: 102',
    address: 'Doğu Bulvarı No: 102',
    desc: 'Kırma çatılı, bahçeli ve garaj yollu tam müstakil aile evi',
    url: 'assets/models/house_family_home.glb?v=16'
  },

  // 4. Modern Şehir Konutları (Batı Bulvarı)
  {
    id: 'pascal',
    title: 'Modern Şehir Konutları',
    role: 'Şehir Konut Kompleksi',
    category: 'Batı Bulvarı',
    icon: '🏘️',
    badge: '3 Katlı Konutlar',
    address: 'Batı Bulvarı No: 103',
    desc: '3 katlı, teraslı ve çağdaş cepheli modern şehir sıra evleri kompleksi',
    url: 'assets/models/pascal_house.glb?v=99'
  },

  // 5. Çok Katlı Şehir Apartmanı (Doğu Bulvarı)
  {
    id: 'city_a',
    title: 'Çok Katlı Şehir Apartmanı',
    role: 'Şehir Binası',
    category: 'Doğu Bulvarı',
    icon: '🏙️',
    badge: 'Doğu No: 104',
    address: 'Doğu Bulvarı No: 104',
    desc: 'Şehir merkezinde çok katlı, pencereli ve ana girişli apartman bloku',
    url: 'assets/models/house_city_a.glb?v=16'
  },

  // 6. Klasik Banliyö Evi Tip A (Batı Bulvarı)
  {
    id: 'suburban_a',
    title: 'Klasik Banliyö Evi (Tip A)',
    role: 'Şehir Konutu',
    category: 'Batı Bulvarı',
    icon: '🏡',
    badge: 'Batı No: 105',
    address: 'Batı Bulvarı No: 105',
    desc: 'Giriş verandası ve bacası olan klasik tek katlı banliyö evi',
    url: 'assets/models/house_suburban_a.glb?v=16'
  },

  // 7. İki Katlı Aile Evi Tip B (Doğu Bulvarı)
  {
    id: 'suburban_b',
    title: 'İki Katlı Aile Evi (Tip B)',
    role: 'Şehir Konutu',
    category: 'Doğu Bulvarı',
    icon: '🏠',
    badge: 'Doğu No: 106',
    address: 'Doğu Bulvarı No: 106',
    desc: 'Geniş cephe pencereli ve çift katlı modern aile konutu',
    url: 'assets/models/house_suburban_b.glb?v=16'
  },

  // 8. Bahçeli L-Tipi Konut Tip C (Batı Bulvarı)
  {
    id: 'suburban_c',
    title: 'Bahçeli L-Tipi Konut (Tip C)',
    role: 'Şehir Konutu',
    category: 'Batı Bulvarı',
    icon: '🏡',
    badge: 'Batı No: 107',
    address: 'Batı Bulvarı No: 107',
    desc: 'Ön bahçeli ve L-tipi mimarili müstakil şehir evi',
    url: 'assets/models/house_suburban_c.glb?v=16'
  },

  // 9. Çağdaş Düz Çatılı Ev Tip D (Doğu Bulvarı)
  {
    id: 'suburban_d',
    title: 'Çağdaş Düz Çatılı Ev (Tip D)',
    role: 'Şehir Konutu',
    category: 'Doğu Bulvarı',
    icon: '🏢',
    badge: 'Doğu No: 108',
    address: 'Doğu Bulvarı No: 108',
    desc: 'Düz çatılı ve minimalist mimarili çağdaş şehir evi',
    url: 'assets/models/house_suburban_d.glb?v=16'
  },

  // 10. Garajlı Banliyö Villası Tip E (Güney Meydanı)
  {
    id: 'suburban_e',
    title: 'Garajlı Banliyö Villası (Tip E)',
    role: 'Şehir Konutu',
    category: 'Güney Meydanı',
    icon: '🏘️',
    badge: 'Güney No: 109',
    address: 'Güney Meydanı No: 109',
    desc: 'Bitişik kapalı garajı ve geniş kırma çatısı olan banliyö villası',
    url: 'assets/models/house_suburban_e.glb?v=16'
  }
];
