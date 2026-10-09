import * as THREE from 'three';
import { gangTerritoryManager, Faction } from './GangTerritoryManager.js';
import { pedestrianAudio } from './PedestrianAudio.js';
import { PedestrianState } from './PedestrianManager.js';

/**
 * Çete Savaşı Durumları (State Machine)
 */
export const GangWarState = Object.freeze({
  INACTIVE: 'INACTIVE',
  PROVOKED: 'PROVOKED',
  WAVE_ACTIVE: 'WAVE_ACTIVE',
  WAVE_INTERMISSION: 'WAVE_INTERMISSION',
  TURF_CAPTURED: 'TURF_CAPTURED',
  WAR_LOST: 'WAR_LOST'
});

/**
 * GangWarManager - GTA San Andreas Tarzı Bölge Ele Geçirme (Turf Wars) & 3 Aşamalı Dalga Yöneticisi
 */
export class GangWarManager {
  constructor() {
    this.state = GangWarState.INACTIVE;
    this.provocationKills = 0;
    this.currentZone = null;
    this.epicenter = new THREE.Vector3();
    this.warRadius = 65.0;

    this.currentWave = 1;
    this.maxWaves = 3;
    this.waveEnemies = [];
    this.remainingEnemies = 0;

    this.stateTimer = 0;
    this.abandonTimer = 15.0;
    this.isOutsideZone = false;

    this.hudEl = null;
    this.hudTimeout = null;

    this._initHUD();
  }

  _initHUD() {
    if (typeof document === 'undefined') return;

    let el = document.getElementById('gang-war-hud');
    if (!el) {
      el = document.createElement('div');
      el.id = 'gang-war-hud';
      el.style.position = 'fixed';
      el.style.top = '120px';
      el.style.left = '50%';
      el.style.transform = 'translateX(-50%)';
      el.style.display = 'none';
      el.style.zIndex = '998';
      el.style.textAlign = 'center';
      el.style.fontFamily = "'Impact', 'Arial Black', sans-serif";
      el.style.pointerEvents = 'none';
      el.style.filter = 'drop-shadow(0 4px 14px rgba(0,0,0,0.9))';

      el.innerHTML = `
        <div id="gang-war-status" style="font-size: 24px; color: #ffeb3b; letter-spacing: 2px; text-shadow: 2px 2px 0 #000, -2px -2px 0 #000, 0 0 12px rgba(255,235,59,0.8);"></div>
        <div id="gang-war-sub" style="font-size: 15px; color: #ffffff; letter-spacing: 3px; margin-top: 4px; text-shadow: 1px 1px 4px #000;"></div>
        <div id="gang-war-warning" style="font-size: 16px; color: #ff1744; letter-spacing: 2px; margin-top: 6px; font-weight: bold; display: none; text-shadow: 2px 2px 0 #000;"></div>
      `;

      document.body.appendChild(el);
    }
    this.hudEl = el;
  }

  /**
   * Oyuncu bir yayaya zarar verdiğinde (ateş, yumruk, araç çarpması) tetiklenir
   * @param {import('./PedestrianManager.js').Pedestrian} ped
   * @param {string} attacker
   */
  onPedestrianHarm(ped, attacker = 'player') {
    if (!ped) return;

    const zone = gangTerritoryManager.getZoneAt(ped.position.x, ped.position.z);

    // 1. Savaş henüz başlamadıysa: Ballas bölgesinde provokasyon sayacı
    if (this.state === GangWarState.INACTIVE) {
      if (zone && zone.id === 'ballas' && zone.owner !== Faction.GROVE && ped.faction === Faction.BALLAS) {
        this.provocationKills++;
        console.log(`💥 [GangWarManager] Ballas üyesi vuruldu (${this.provocationKills}/3 Provokasyon)`);

        if (this.provocationKills >= 3) {
          this.provokeWar(zone, ped.position);
        }
      }
    }
  }

  /**
   * Çete savaşını provoke eder ve geri sayımı başlatır
   * @param {typeof import('./GangTerritoryManager.js').TURF_ZONES[0]} zone
   * @param {THREE.Vector3} pedPos
   */
  provokeWar(zone, pedPos) {
    this.state = GangWarState.PROVOKED;
    this.currentZone = zone;
    this.epicenter.copy(pedPos);
    this.currentWave = 1;
    this.stateTimer = 0;
    this.abandonTimer = 15.0;
    this.provocationKills = 0;

    // Ses ve Efekt
    pedestrianAudio.playWarSiren();

    if (this.hudEl) {
      this.hudEl.style.display = 'block';
      const statusEl = document.getElementById('gang-war-status');
      const subEl = document.getElementById('gang-war-sub');
      const warnEl = document.getElementById('gang-war-warning');
      if (statusEl) {
        statusEl.textContent = 'YOU HAVE PROVOKED A GANG WAR!';
        statusEl.style.color = '#ff1744';
      }
      if (subEl) {
        subEl.textContent = 'DEFEND GROVE STREET - SURVIVE 3 WAVES';
        subEl.style.color = '#ffffff';
      }
      if (warnEl) warnEl.style.display = 'none';
    }

    console.log('🚨 [GangWarManager] Çete savaşı başladı! Bölge:', zone.name);
  }

  /**
   * Yeni bir dalga başlatır
   * @param {number} waveNum
   */
  startWave(waveNum) {
    this.state = GangWarState.WAVE_ACTIVE;
    this.currentWave = waveNum;
    this.stateTimer = 0;
    this.abandonTimer = 15.0;

    let enemyCount = 4;
    let armedCount = 2;

    if (waveNum === 2) {
      enemyCount = 6;
      armedCount = 4;
    } else if (waveNum === 3) {
      enemyCount = 8;
      armedCount = 6;
    }

    // PedestrianManager üzerinden savaş timini oluştur
    const pedManager = window.app?.pedestrianManager;
    if (pedManager && pedManager.spawnWarSquad) {
      this.waveEnemies = pedManager.spawnWarSquad(this.epicenter, enemyCount, armedCount, waveNum);
    } else {
      this.waveEnemies = [];
    }

    this.remainingEnemies = this.waveEnemies.length;

    // Ses efekti
    pedestrianAudio.playWaveDrum();

    this._updateHUDText();
    console.log(`⚔️ [GangWarManager] Dalga ${waveNum}/3 başladı! Toplam Düşman: ${this.waveEnemies.length}`);
  }

  /**
   * Ana oyun döngüsünde (fixedUpdate) çağrılır
   * @param {number} delta
   * @param {THREE.Vector3} playerPos
   */
  update(delta, playerPos) {
    if (this.state === GangWarState.INACTIVE) return;

    if (!playerPos) return;

    // 1. Durum Zamanlayıcıları
    if (this.state === GangWarState.PROVOKED) {
      this.stateTimer += delta;
      if (this.stateTimer >= 2.6) {
        this.startWave(1);
      }
      return;
    }

    if (this.state === GangWarState.WAVE_INTERMISSION) {
      this.stateTimer += delta;
      const remaining = Math.max(0, Math.ceil(3.8 - this.stateTimer));
      const subEl = document.getElementById('gang-war-sub');
      if (subEl) subEl.textContent = `NEXT WAVE INCOMING IN: ${remaining}s`;

      if (this.stateTimer >= 3.8) {
        this.startWave(this.currentWave + 1);
      }
      return;
    }

    if (this.state === GangWarState.WAVE_ACTIVE) {
      // 2. Alan Terk Kontrolü (Abandonment Check)
      const dist = playerPos.distanceTo(this.epicenter);
      const warnEl = document.getElementById('gang-war-warning');

      if (dist > this.warRadius) {
        this.isOutsideZone = true;
        this.abandonTimer -= delta;
        if (warnEl) {
          warnEl.style.display = 'block';
          warnEl.textContent = `OUTSIDE WAR ZONE! RETURNING IN: ${Math.ceil(this.abandonTimer)}s`;
        }

        if (this.abandonTimer <= 0) {
          this.endWar(false, 'ABANDONED');
          return;
        }
      } else {
        this.isOutsideZone = false;
        this.abandonTimer = 15.0;
        if (warnEl) warnEl.style.display = 'none';
      }

      // 3. Düşmanların Hayatta Kalma Kontrolü
      let aliveCount = 0;
      for (let i = 0; i < this.waveEnemies.length; i++) {
        const ped = this.waveEnemies[i];
        if (ped.isActive && ped.state !== PedestrianState.KNOCKED_DOWN && ped.state !== PedestrianState.GETTING_UP) {
          aliveCount++;
        }
      }
      this.remainingEnemies = aliveCount;
      this._updateHUDText();

      // Tüm düşmanlar temizlendi mi?
      if (aliveCount === 0 && this.waveEnemies.length > 0) {
        if (this.currentWave < this.maxWaves) {
          this.state = GangWarState.WAVE_INTERMISSION;
          this.stateTimer = 0;
          const statusEl = document.getElementById('gang-war-status');
          if (statusEl) {
            statusEl.textContent = `WAVE ${this.currentWave} CLEARED!`;
            statusEl.style.color = '#4caf50';
          }
          pedestrianAudio.playGangGreeting(this.epicenter);
        } else {
          // Zafer!
          this.endWar(true);
        }
      }
    }
  }

  _updateHUDText() {
    if (!this.hudEl) return;
    const statusEl = document.getElementById('gang-war-status');
    const subEl = document.getElementById('gang-war-sub');

    if (statusEl && this.state === GangWarState.WAVE_ACTIVE) {
      statusEl.textContent = `WAVE ${this.currentWave} / ${this.maxWaves}`;
      statusEl.style.color = '#ffeb3b';
    }
    if (subEl && this.state === GangWarState.WAVE_ACTIVE) {
      subEl.textContent = `ENEMIES REMAINING: ${this.remainingEnemies}`;
      subEl.style.color = '#ffffff';
    }
  }

  /**
   * Çete savaşını sonlandırır (Zafer veya Mağlubiyet)
   * @param {boolean} victory
   * @param {string} [reason='']
   */
  endWar(victory, reason = '') {
    const statusEl = document.getElementById('gang-war-status');
    const subEl = document.getElementById('gang-war-sub');
    const warnEl = document.getElementById('gang-war-warning');

    if (warnEl) warnEl.style.display = 'none';

    if (victory) {
      this.state = GangWarState.TURF_CAPTURED;
      if (this.currentZone) {
        gangTerritoryManager.transferOwnership(this.currentZone.id, Faction.GROVE);
      }
      pedestrianAudio.playTurfVictory();

      if (statusEl) {
        statusEl.textContent = 'TERRITORY WON!';
        statusEl.style.color = '#2e7d32';
        statusEl.style.textShadow = '0 0 18px #4caf50, 2px 2px 0 #000, -2px -2px 0 #000';
      }
      if (subEl) {
        subEl.textContent = 'GROVE FAMILIES NOW OWN THIS HOOD (+RESPECT)';
        subEl.style.color = '#ffeb3b';
      }
      console.log('🏆 [GangWarManager] Çete savaşı kazanıldı! Bölge Grove kontrolüne geçti.');
    } else {
      this.state = GangWarState.WAR_LOST;
      if (statusEl) {
        statusEl.textContent = 'GANG WAR LOST!';
        statusEl.style.color = '#d32f2f';
      }
      if (subEl) {
        subEl.textContent = (reason === 'ABANDONED') ? 'YOU ABANDONED YOUR HOMIES!' : 'FAILED TO DEFEND TERRITORY';
        subEl.style.color = '#bdbdbd';
      }
      console.log('❌ [GangWarManager] Çete savaşı kaybedildi. Sebep:', reason);
    }

    // 4.5 sn sonra HUD'ı kapat ve durumu sıfırla
    if (this.hudTimeout) clearTimeout(this.hudTimeout);
    this.hudTimeout = setTimeout(() => {
      if (this.hudEl) this.hudEl.style.display = 'none';
      this.state = GangWarState.INACTIVE;
      this.waveEnemies = [];
      this.provocationKills = 0;
    }, 4500);
  }
}

export const gangWarManager = new GangWarManager();
