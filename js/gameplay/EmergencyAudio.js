/**
 * EmergencyAudio.js - GTA San Andreas Tarzı Acil Durum Ses Motoru (ADIM 1)
 * 
 * Özellikler:
 * 1. Web Audio Sentezli Çift Tonlu Acil Durum Sireni:
 *    - WAIL: 650Hz -> 950Hz pürüzsüz sinüzoidal frekans salınımı (2.2s periyot)
 *    - YELP: 800Hz -> 1250Hz hızlı nabızlı acil durum frekansı (0.35s periyot)
 *    - AIRHORN: 185Hz + 230Hz çift osilatörlü agresif yol açma kornası
 * 2. Tazyikli Su Jeti (Water Cannon) Sesi:
 *    - Yüksek basınçlı su fışkırma ve türbülans uğultusu (White Noise + Bandpass Filter)
 * 3. Yangın Söndürme / Cızırtı (Extinguish Sizzle) Sesi:
 *    - Su alevle buluştuğunda yüksek frekanslı buharlaşma ve cızırdayan kül sesi
 * 4. Retro Görev Jingles:
 *    - Görev Başlama Chime'ı, Seviye Başarısı Fanfarı, Hasta Kurtarma Dingi, Görev Başarısızlığı Buzzer'ı.
 */

import * as THREE from 'three';

export class EmergencyAudio {
  constructor() {
    this.ctx = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenFilter = null;
    this.sirenMode = 'off'; // 'off', 'wail', 'yelp'
    this.sirenInterval = null;

    // Tazyikli Su Jeti Audio Node'ları
    this.waterNoiseSource = null;
    this.waterFilter = null;
    this.waterGain = null;
    this.isWaterSpraying = false;

    this.maxAudibleDist = 55.0; // metre
    this._tempVec = new THREE.Vector3();
  }

  _getCtx() {
    if (!this.ctx) {
      if (window.app?.audioManager?.ctx) {
        this.ctx = window.app.audioManager.ctx;
      } else {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  /**
   * 3D Dinleyiciye Göre Spatial Kazanç (Volume & Pan)
   */
  _computeSpatialParams(sourcePos) {
    const camera = window.app?.camera;
    if (!camera || !sourcePos) return { gain: 0.35, pan: 0 };

    const dist = camera.position.distanceTo(sourcePos);
    if (dist > this.maxAudibleDist) return null;

    const distRatio = Math.max(0, 1 - (dist / this.maxAudibleDist));
    const gain = Math.min(1.0, Math.max(0.02, distRatio * distRatio));

    this._tempVec.copy(sourcePos).sub(camera.position);
    const camFwd = new THREE.Vector3();
    camera.getWorldDirection(camFwd);
    const camRight = new THREE.Vector3(camFwd.z, 0, -camFwd.x).normalize();
    const pan = THREE.MathUtils.clamp(this._tempVec.dot(camRight) / (dist + 0.1), -0.85, 0.85);

    return { gain, pan };
  }

  /* =========================================================
     1. ÇİFT TONLU ACİL DURUM SİRENİ (WAIL & YELP)
     ========================================================= */

  startSiren(mode = 'wail', sourcePos = null) {
    const ctx = this._getCtx();
    if (!ctx) return;

    this.stopSiren();
    this.sirenMode = mode;

    try {
      const now = ctx.currentTime;
      this.sirenOsc = ctx.createOscillator();
      this.sirenGain = ctx.createGain();
      this.sirenFilter = ctx.createBiquadFilter();

      // Tok, delici ama kulak tırmalamayan analog dalga formu
      this.sirenOsc.type = 'sawtooth';

      this.sirenFilter.type = 'lowpass';
      this.sirenFilter.frequency.setValueAtTime(1450, now);
      this.sirenFilter.Q.setValueAtTime(3.2, now);

      let baseVol = 0.22;
      if (sourcePos) {
        const spatial = this._computeSpatialParams(sourcePos);
        if (spatial) baseVol *= spatial.gain;
      }

      this.sirenGain.gain.setValueAtTime(0.001, now);
      this.sirenGain.gain.linearRampToValueAtTime(baseVol, now + 0.15);

      this.sirenOsc.connect(this.sirenFilter);
      this.sirenFilter.connect(this.sirenGain);
      this.sirenGain.connect(ctx.destination);

      this.sirenOsc.start();

      if (mode === 'wail') {
        // WAIL: 650Hz -> 960Hz yavaş ve görkemli frekans tırmanışı
        const cycleWail = () => {
          if (this.sirenMode !== 'wail' || !this.sirenOsc) return;
          const t = ctx.currentTime;
          this.sirenOsc.frequency.cancelScheduledValues(t);
          this.sirenOsc.frequency.setValueAtTime(650, t);
          this.sirenOsc.frequency.linearRampToValueAtTime(960, t + 1.1);
          this.sirenOsc.frequency.linearRampToValueAtTime(650, t + 2.2);
        };
        cycleWail();
        this.sirenInterval = setInterval(cycleWail, 2200);
      } else if (mode === 'yelp') {
        // YELP: 780Hz -> 1220Hz acil kavşak geçiş nabzı
        const cycleYelp = () => {
          if (this.sirenMode !== 'yelp' || !this.sirenOsc) return;
          const t = ctx.currentTime;
          this.sirenOsc.frequency.cancelScheduledValues(t);
          this.sirenOsc.frequency.setValueAtTime(780, t);
          this.sirenOsc.frequency.linearRampToValueAtTime(1220, t + 0.18);
          this.sirenOsc.frequency.linearRampToValueAtTime(780, t + 0.35);
        };
        cycleYelp();
        this.sirenInterval = setInterval(cycleYelp, 350);
      }
    } catch (e) {
      console.warn('[EmergencyAudio] Siren başlatılamadı:', e);
    }
  }

  stopSiren() {
    if (this.sirenInterval) {
      clearInterval(this.sirenInterval);
      this.sirenInterval = null;
    }
    if (this.sirenOsc) {
      try {
        const ctx = this._getCtx();
        if (ctx && this.sirenGain) {
          const now = ctx.currentTime;
          this.sirenGain.gain.cancelScheduledValues(now);
          this.sirenGain.gain.linearRampToValueAtTime(0.001, now + 0.12);
          setTimeout(() => {
            try {
              this.sirenOsc?.stop();
              this.sirenOsc?.disconnect();
              this.sirenOsc = null;
            } catch (err) {}
          }, 140);
        } else {
          this.sirenOsc.stop();
          this.sirenOsc = null;
        }
      } catch (e) {}
    }
    this.sirenMode = 'off';
  }

  toggleSiren(mode = null) {
    if (mode) {
      if (this.sirenMode === mode) this.stopSiren();
      else this.startSiren(mode);
      return this.sirenMode;
    }
    if (this.sirenMode === 'off') {
      this.startSiren('wail');
    } else if (this.sirenMode === 'wail') {
      this.startSiren('yelp');
    } else {
      this.stopSiren();
    }
    return this.sirenMode;
  }

  playAirhorn(sourcePos = null) {
    const ctx = this._getCtx();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc1.type = 'sawtooth';
      osc2.type = 'triangle';
      osc1.frequency.setValueAtTime(186, now);
      osc2.frequency.setValueAtTime(234, now);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(320, now);
      filter.Q.setValueAtTime(2.0, now);

      let vol = 0.35;
      if (sourcePos) {
        const sp = this._computeSpatialParams(sourcePos);
        if (sp) vol *= sp.gain;
      }

      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(vol, now + 0.05);
      gain.gain.setValueAtTime(vol, now + 0.45);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.68);
      osc2.stop(now + 0.68);
    } catch (e) {}
  }

  /* =========================================================
     2. TAZYİKLİ SU JETİ (WATER CANNON) SESİ
     ========================================================= */

  startWaterSpray() {
    if (this.isWaterSpraying) return;
    const ctx = this._getCtx();
    if (!ctx) return;

    try {
      const bufferSize = ctx.sampleRate * 2;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      this.waterNoiseSource = ctx.createBufferSource();
      this.waterNoiseSource.buffer = noiseBuffer;
      this.waterNoiseSource.loop = true;

      this.waterFilter = ctx.createBiquadFilter();
      this.waterFilter.type = 'bandpass';
      this.waterFilter.frequency.setValueAtTime(950, ctx.currentTime);
      this.waterFilter.Q.setValueAtTime(1.4, ctx.currentTime);

      this.waterGain = ctx.createGain();
      this.waterGain.gain.setValueAtTime(0.01, ctx.currentTime);
      this.waterGain.gain.linearRampToValueAtTime(0.26, ctx.currentTime + 0.12);

      this.waterNoiseSource.connect(this.waterFilter);
      this.waterFilter.connect(this.waterGain);
      this.waterGain.connect(ctx.destination);

      this.waterNoiseSource.start();
      this.isWaterSpraying = true;
    } catch (e) {
      console.warn('[EmergencyAudio] Su jeti sesi başlatılamadı:', e);
    }
  }

  stopWaterSpray() {
    if (!this.isWaterSpraying) return;
    const ctx = this._getCtx();
    if (ctx && this.waterGain) {
      const now = ctx.currentTime;
      this.waterGain.gain.cancelScheduledValues(now);
      this.waterGain.gain.linearRampToValueAtTime(0.001, now + 0.15);
      setTimeout(() => {
        try {
          this.waterNoiseSource?.stop();
          this.waterNoiseSource?.disconnect();
          this.waterNoiseSource = null;
        } catch (e) {}
      }, 160);
    }
    this.isWaterSpraying = false;
  }

  /* =========================================================
     3. YANGIN SÖNDÜRME / CIZIRTI (EXTINGUISH SIZZLE) SESİ
     ========================================================= */

  playExtinguishSizzle(sourcePos = null) {
    const ctx = this._getCtx();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const bufferSize = ctx.sampleRate * 0.45;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        // Yüksek frekanslı buhar patlaması ve çıtırtı
        data[i] = (Math.random() * 2 - 1) * (1 - (i / bufferSize));
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(2400, now);

      const gain = ctx.createGain();
      let vol = 0.22;
      if (sourcePos) {
        const sp = this._computeSpatialParams(sourcePos);
        if (sp) vol *= sp.gain;
      }

      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      noise.start(now);
      noise.stop(now + 0.45);
    } catch (e) {}
  }

  /* =========================================================
     4. RETRO GTA SUB-MISSION JINGLES (Chimes & Fanfares)
     ========================================================= */

  playMissionStart() {
    const ctx = this._getCtx();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const notes = [440, 554.37, 659.25, 880]; // A4, C#5, E5, A5
      notes.forEach((freq, idx) => {
        const t = now + idx * 0.08;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.01, t);
        gain.gain.linearRampToValueAtTime(0.18, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.38);
      });
    } catch (e) {}
  }

  playPatientPickup() {
    const ctx = this._getCtx();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.16); // A5
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.3);
    } catch (e) {}
  }

  playLevelComplete() {
    const ctx = this._getCtx();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      // Görkemli 4 akorlu başarı tınısı (C -> E -> G -> C6)
      const chord = [523.25, 659.25, 783.99, 1046.50];
      chord.forEach((freq, idx) => {
        const t = now + idx * 0.09;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.01, t);
        gain.gain.linearRampToValueAtTime(0.22, t + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.68);
      });
    } catch (e) {}
  }

  playMissionFailed() {
    const ctx = this._getCtx();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const notes = [293.66, 277.18, 261.63]; // D4 -> C#4 -> C4 (düşüş)
      notes.forEach((freq, idx) => {
        const t = now + idx * 0.18;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.18, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.34);
      });
    } catch (e) {}
  }
}

export const emergencyAudio = new EmergencyAudio();
