/**
 * WantedManager - GTA San Andreas Tarzı Aranma & Suç Seviyesi Yöneticisi
 * 0-5 Yıldız sistemi, Heat birikimi, soğuma (cool-down) ve polis alarm durumu.
 */
import { gameState } from './GameStateManager.js';

export class WantedManager {
  constructor() {
    this.heat = 0;
    this.stars = 0;
    this.lastCrimeTime = 0;
    this.cooldownDelay = 7.0; // Suçtan sonra soğumanın başlaması için gereken saniye
    this.heatDecayRate = 5.0; // Saniyede düşen heat
    this.isFlashing = false;
    this.flashTimer = 0;

    // Heat eşik değerleri
    this.thresholds = [0, 20, 50, 95, 150, 220];
  }

  reportCrime(crimeType, customHeat = null) {
    let heatGain = 10;
    switch (crimeType) {
      case 'VEHICLE_HIT':
        heatGain = 8;
        break;
      case 'PEDESTRIAN_HIT':
        heatGain = 25;
        break;
      case 'PEDESTRIAN_KILL':
        heatGain = 45;
        break;
      case 'POLICE_RAM':
        heatGain = 35;
        break;
      case 'SPEEDING_PAST_POLICE':
        heatGain = 15;
        break;
      default:
        heatGain = customHeat || 10;
    }

    this.heat = Math.min(250, this.heat + heatGain);
    this.lastCrimeTime = performance.now() / 1000;
    this.updateStarsFromHeat();
    this.syncState();
  }

  updateStarsFromHeat() {
    let newStars = 0;
    for (let i = this.thresholds.length - 1; i >= 1; i--) {
      if (this.heat >= this.thresholds[i]) {
        newStars = i;
        break;
      }
    }
    if (newStars !== this.stars) {
      this.stars = newStars;
      this.syncState();
    }
  }

  clearWanted() {
    this.heat = 0;
    this.stars = 0;
    this.isFlashing = false;
    this.syncState();
  }

  update(delta, playerPos, nearestPoliceDist = Infinity) {
    if (this.stars === 0 && this.heat === 0) return;

    const now = performance.now() / 1000;
    const timeSinceCrime = now - this.lastCrimeTime;

    // Polis oyuncudan yeterince uzaksa (>55m) ve son suçtan belirli süre geçtiyse soğuma başlar
    const isEvading = (nearestPoliceDist > 55) && (timeSinceCrime > this.cooldownDelay);

    if (isEvading) {
      this.isFlashing = true;
      this.flashTimer += delta;

      // Heat düşüşü
      this.heat = Math.max(0, this.heat - (this.heatDecayRate * delta));
      
      // Yıldız düşürme kontrolü
      if (this.stars > 0 && this.heat < this.thresholds[this.stars]) {
        this.stars--;
        if (this.stars === 0) {
          this.isFlashing = false;
        }
      }
    } else {
      this.isFlashing = false;
      this.flashTimer = 0;
      // Polis yakındaysa suç zamanını yenile
      if (nearestPoliceDist < 40) {
        this.lastCrimeTime = now;
      }
    }

    this.syncState();
  }

  syncState() {
    gameState.state.wanted.stars = this.stars;
    gameState.state.wanted.heat = Math.round(this.heat);
    gameState.state.wanted.isFlashing = this.isFlashing;
    gameState.notify('wanted');
  }
}

export const wantedManager = new WantedManager();
