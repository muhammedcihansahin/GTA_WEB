import * as THREE from 'three';

/**
 * Çete Fraksiyonları (Factions)
 */
export const Faction = Object.freeze({
  CIVILIAN: 'CIVILIAN',
  GROVE: 'GROVE',
  BALLAS: 'BALLAS'
});

/**
 * Şehir Çete Bölgeleri (Turf Zones)
 */
export const TURF_ZONES = [
  {
    id: 'grove',
    name: 'GROVE STREET',
    subtitle: 'GROVE FAMILIES TERRITORY',
    faction: Faction.GROVE,
    owner: Faction.GROVE,
    color: '#2e7d32',
    accentColor: '#4caf50',
    bounds: { minX: -65, maxX: 10, minZ: 0, maxZ: 70 },
    spawnWeights: {
      [Faction.GROVE]: 0.70,
      [Faction.CIVILIAN]: 0.25,
      [Faction.BALLAS]: 0.05
    }
  },
  {
    id: 'ballas',
    name: 'IDLEWOOD / GANTON',
    subtitle: 'FRONT YARD BALLAS TERRITORY',
    faction: Faction.BALLAS,
    owner: Faction.BALLAS,
    color: '#7b1fa2',
    accentColor: '#ba68c8',
    bounds: { minX: -145, maxX: -10, minZ: -130, maxZ: -10 },
    spawnWeights: {
      [Faction.BALLAS]: 0.70,
      [Faction.CIVILIAN]: 0.25,
      [Faction.GROVE]: 0.05
    }
  },
  {
    id: 'neutral',
    name: 'LOS SANTOS',
    subtitle: 'NEUTRAL TERRITORY',
    faction: Faction.CIVILIAN,
    owner: Faction.CIVILIAN,
    color: '#37474f',
    accentColor: '#cfd8dc',
    bounds: null, // Fallback
    spawnWeights: {
      [Faction.CIVILIAN]: 0.80,
      [Faction.GROVE]: 0.10,
      [Faction.BALLAS]: 0.10
    }
  }
];

/**
 * GangTerritoryManager - Çete Bölgesi, Hakimiyet Haritası ve HUD Yöneticisi
 */
export class GangTerritoryManager {
  constructor() {
    this.zones = TURF_ZONES;
    this.currentZoneId = null;
    this.bannerEl = null;
    this.bannerTimeout = null;

    this._initBannerUI();
  }

  _initBannerUI() {
    if (typeof document === 'undefined') return;

    let el = document.getElementById('gang-turf-banner');
    if (!el) {
      el = document.createElement('div');
      el.id = 'gang-turf-banner';
      el.style.position = 'fixed';
      el.style.top = '72px';
      el.style.left = '50%';
      el.style.transform = 'translateX(-50%) translateY(-20px)';
      el.style.opacity = '0';
      el.style.pointerEvents = 'none';
      el.style.zIndex = '999';
      el.style.textAlign = 'center';
      el.style.fontFamily = "'Impact', 'Arial Black', sans-serif";
      el.style.textTransform = 'uppercase';
      el.style.transition = 'all 0.4s cubic-bezier(0.18, 0.89, 0.32, 1.28)';
      el.style.filter = 'drop-shadow(0 4px 12px rgba(0,0,0,0.85))';

      el.innerHTML = `
        <div id="gang-turf-title" style="font-size: 26px; letter-spacing: 2px; font-weight: 900; line-height: 1.1;"></div>
        <div id="gang-turf-sub" style="font-size: 13px; letter-spacing: 3px; font-weight: 700; opacity: 0.92; margin-top: 3px;"></div>
      `;
      document.body.appendChild(el);
    }
    this.bannerEl = el;
  }

  /**
   * Belirtilen (x, z) koordinatındaki çete bölgesini tespit eder
   * @param {number} x
   * @param {number} z
   * @returns {typeof TURF_ZONES[0]}
   */
  getZoneAt(x, z) {
    for (let i = 0; i < this.zones.length; i++) {
      const zone = this.zones[i];
      if (!zone.bounds) continue;
      if (x >= zone.bounds.minX && x <= zone.bounds.maxX &&
          z >= zone.bounds.minZ && z <= zone.bounds.maxZ) {
        return zone;
      }
    }
    return this.zones[2]; // Nötr bölge fallback
  }

  /**
   * Bölge ağırlıklarına göre yeni doğacak yaya için fraksiyon seçer
   * @param {string} zoneId
   * @returns {string} Faction.GROVE | Faction.BALLAS | Faction.CIVILIAN
   */
  getRandomFactionForZone(zoneId) {
    const zone = this.zones.find(z => z.id === zoneId) || this.zones[2];
    const weights = zone.spawnWeights;
    const r = Math.random();

    let accum = 0;
    for (const [faction, weight] of Object.entries(weights)) {
      accum += weight;
      if (r <= accum) return faction;
    }
    return Faction.CIVILIAN;
  }

  /**
   * Oyuncu hareketine göre çete bölgesi geçişlerini takip eder ve HUD gösterir
   * @param {THREE.Vector3} playerPos
   */
  update(playerPos) {
    if (!playerPos) return;

    const zone = this.getZoneAt(playerPos.x, playerPos.z);
    if (!this.currentZoneId) {
      this.currentZoneId = zone.id;
      this.showTurfBanner(zone);
    } else if (this.currentZoneId !== zone.id) {
      this.currentZoneId = zone.id;
      this.showTurfBanner(zone);
    }
  }

  /**
   * Retro GTA San Andreas tarzı çete bölgesi bildirimini ekranda gösterir
   * @param {typeof TURF_ZONES[0]} zone
   */
  showTurfBanner(zone) {
    if (!this.bannerEl) return;

    const titleEl = document.getElementById('gang-turf-title');
    const subEl = document.getElementById('gang-turf-sub');
    if (!titleEl || !subEl) return;

    titleEl.textContent = zone.name;
    titleEl.style.color = zone.accentColor;
    titleEl.style.webkitTextStroke = '1px #000';
    titleEl.style.textShadow = `0 0 16px ${zone.color}, 2px 2px 0 #000, -2px -2px 0 #000`;

    subEl.textContent = zone.subtitle;
    subEl.style.color = '#ffffff';
    subEl.style.textShadow = '1px 1px 4px #000, 0 0 8px rgba(0,0,0,0.8)';

    this.bannerEl.style.opacity = '1';
    this.bannerEl.style.transform = 'translateX(-50%) translateY(0px)';

    if (this.bannerTimeout) {
      clearTimeout(this.bannerTimeout);
    }

    this.bannerTimeout = setTimeout(() => {
      if (this.bannerEl) {
        this.bannerEl.style.opacity = '0';
        this.bannerEl.style.transform = 'translateX(-50%) translateY(-20px)';
      }
    }, 3400);
  }

  /**
   * Çete savaşı kazanıldığında bölge mülkiyetini ve demografik ağırlıklarını devreder (ADIM 11)
   * @param {string} zoneId
   * @param {string} newFaction
   */
  transferOwnership(zoneId, newFaction) {
    const zone = this.zones.find(z => z.id === zoneId);
    if (!zone) return;

    zone.owner = newFaction;
    zone.faction = newFaction;

    if (newFaction === Faction.GROVE) {
      zone.subtitle = 'CONTROLLED BY GROVE FAMILIES';
      zone.color = '#2e7d32';
      zone.accentColor = '#4caf50';
      zone.spawnWeights = {
        [Faction.GROVE]: 0.75,
        [Faction.CIVILIAN]: 0.22,
        [Faction.BALLAS]: 0.03
      };
    } else if (newFaction === Faction.BALLAS) {
      zone.subtitle = 'FRONT YARD BALLAS TERRITORY';
      zone.color = '#7b1fa2';
      zone.accentColor = '#ba68c8';
      zone.spawnWeights = {
        [Faction.BALLAS]: 0.75,
        [Faction.CIVILIAN]: 0.20,
        [Faction.GROVE]: 0.05
      };
    }

    this.showTurfBanner({
      name: `${zone.name} - WON!`,
      subtitle: `TERRITORY NOW CONTROLLED BY ${newFaction}`,
      color: zone.color,
      accentColor: '#ffeb3b'
    });

    console.log(`🚩 [GangTerritoryManager] ${zone.name} bölgesi artık ${newFaction} kontrolünde!`);
  }
}

export const gangTerritoryManager = new GangTerritoryManager();
