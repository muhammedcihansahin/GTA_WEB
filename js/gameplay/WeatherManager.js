/**
 * WeatherManager - Dinamik Gündüz/Gece Döngüsü ve Hava Durumu Sistemi
 * Oyun içi saati ilerletir, SkyManager ve sahne ışıklarını/sisini otomatik ayarlar.
 */
import * as THREE from 'three';
import { gameState } from './GameStateManager.js';

export class WeatherManager {
  constructor(scene, skyManager, app) {
    this.scene = scene;
    this.skyManager = skyManager;
    this.app = app;

    this.timeScale = 30.0; // 1 saniye = 30 oyun saniyesi (2 dakikada 1 oyun saati)
    this.currentWeather = 'CLEAR'; // CLEAR, FOGGY, OVERCAST
    this.lastDayTimeKey = 'day';

    // Orijinal sis parametreleri
    this.defaultFogDensity = 0.0012;
    if (!this.scene.fog) {
      this.scene.fog = new THREE.FogExp2(0x90b0d0, this.defaultFogDensity);
    }
  }

  setTime(hour, minute = 0) {
    gameState.state.time.hour = hour % 24;
    gameState.state.time.minute = minute % 60;
    this.syncDayNight();
  }

  setWeather(weatherMode) {
    this.currentWeather = weatherMode;
    gameState.state.weather.current = weatherMode;

    if (weatherMode === 'FOGGY') {
      if (this.scene.fog) {
        this.scene.fog.density = 0.012;
        this.scene.fog.color.setHex(0x778899);
      }
    } else if (weatherMode === 'OVERCAST') {
      if (this.scene.fog) {
        this.scene.fog.density = 0.0035;
        this.scene.fog.color.setHex(0x556677);
      }
    } else {
      // CLEAR
      if (this.scene.fog) {
        this.scene.fog.density = this.defaultFogDensity;
        this.scene.fog.color.setHex(0x90b0d0);
      }
    }
    gameState.notify('weather');
  }

  update(delta) {
    // Zaman akışı
    const addedSeconds = delta * this.timeScale;
    let sec = gameState.state.time.second + addedSeconds;
    let min = gameState.state.time.minute + Math.floor(sec / 60);
    sec = sec % 60;
    let hr = gameState.state.time.hour + Math.floor(min / 60);
    min = min % 60;
    hr = hr % 24;

    gameState.state.time.second = sec;
    gameState.state.time.minute = min;
    gameState.state.time.hour = hr;

    this.syncDayNight();
  }

  syncDayNight() {
    const hr = gameState.state.time.hour;
    let timeKey = 'day';

    if (hr >= 6 && hr < 18) {
      timeKey = 'day';
    } else if ((hr >= 18 && hr < 21) || (hr >= 5 && hr < 6)) {
      timeKey = 'sunset';
    } else {
      timeKey = 'night';
    }

    if (timeKey !== this.lastDayTimeKey) {
      this.lastDayTimeKey = timeKey;
      gameState.state.time.dayTimeKey = timeKey;
      if (this.app && this.app.setTimeOfDay) {
        this.app.setTimeOfDay(timeKey);
      } else if (this.skyManager && this.skyManager.setLightingMode) {
        this.skyManager.setLightingMode(timeKey);
      }
    }
    gameState.notify('time');
  }
}
