import * as THREE from 'three';

/**
 * PedestrianAudio - Web Audio API tabanlı 3D Konumsal Yaya Ses Motoru
 * Harici dosya bağımlılığı olmadan prosedürel Web Audio sentezi ile
 * çarpma (darbe), çığlık ve korna tepki seslerini üretir.
 */
export class PedestrianAudio {
  constructor() {
    this.ctx = null;
    this.maxAudibleDist = 40.0; // Sesin duyulabileceği maksimum mesafe (metre)
    this._tempVec = new THREE.Vector3();
  }

  _getAudioContext() {
    if (!this.ctx) {
      if (window.app?.audioManager?.ctx) {
        this.ctx = window.app.audioManager.ctx;
      } else {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          this.ctx = new AudioCtx();
        }
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  /**
   * Dinleyiciye (kamera veya oyuncu) göre 3D stereo pan ve ses seviyesini hesaplar
   * @param {THREE.Vector3} sourcePos
   * @returns {{ gain: number, pan: number }|null}
   */
  _computeSpatialParams(sourcePos) {
    const camera = window.app?.camera;
    if (!camera || !sourcePos) return { gain: 0.3, pan: 0 };

    const dist = camera.position.distanceTo(sourcePos);
    if (dist > this.maxAudibleDist) return null;

    // Lineer-kuadratik mesafe sönümlemesi
    const distRatio = Math.max(0, 1 - (dist / this.maxAudibleDist));
    const gain = Math.min(1.0, Math.max(0.01, distRatio * distRatio));

    // Stereo Panning (-1: Sol, 1: Sağ)
    this._tempVec.copy(sourcePos).sub(camera.position);
    const camFwd = new THREE.Vector3();
    camera.getWorldDirection(camFwd);
    const camRight = new THREE.Vector3(camFwd.z, 0, -camFwd.x).normalize();
    const pan = THREE.MathUtils.clamp(this._tempVec.dot(camRight) / (dist + 0.1), -0.85, 0.85);

    return { gain, pan };
  }

  /**
   * Araç yayaya vurduğunda tok kaporta ve gövde darbe sesi
   * @param {THREE.Vector3} position - Çarpışma noktası
   * @param {number} [intensity=1.0] - Darbe şiddeti (0.5 - 2.5)
   */
  playHitThud(position, intensity = 1.0) {
    const ctx = this._getAudioContext();
    if (!ctx) return;

    const spatial = this._computeSpatialParams(position);
    if (!spatial) return;

    try {
      const now = ctx.currentTime;
      const vol = THREE.MathUtils.clamp(spatial.gain * Math.min(1.5, intensity * 0.45), 0.05, 0.65);

      // 1. Tok Bas Darbesi (60Hz - 35Hz hızlı düşüş)
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(140 * Math.min(1.3, intensity), now);
      osc.frequency.exponentialRampToValueAtTime(38, now + 0.14);

      oscGain.gain.setValueAtTime(vol, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      // 2. Darbe Çıtırtısı / Metal Sürtünmesi (White Noise transient)
      const bufferSize = Math.floor(ctx.sampleRate * 0.09);
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.25));
      }
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;

      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.setValueAtTime(450, now);
      noiseFilter.Q.setValueAtTime(1.8, now);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(vol * 0.6, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

      // Stereo Panner
      let panner = null;
      if (typeof ctx.createStereoPanner === 'function') {
        panner = ctx.createStereoPanner();
        panner.pan.setValueAtTime(spatial.pan, now);
      }

      const master = panner || ctx.destination;
      if (panner) panner.connect(ctx.destination);

      osc.connect(oscGain);
      oscGain.connect(master);

      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(master);

      osc.start(now);
      osc.stop(now + 0.20);
      noise.start(now);
      noise.stop(now + 0.10);
    } catch (e) {
      console.warn('[PedestrianAudio] playHitThud hatası:', e);
    }
  }

  /**
   * Yayaların kaçarken veya araç hızla yaklaşırken attığı panik çığlığı
   * @param {THREE.Vector3} position
   */
  playScream(position) {
    const ctx = this._getAudioContext();
    if (!ctx) return;

    const spatial = this._computeSpatialParams(position);
    if (!spatial) return;

    try {
      const now = ctx.currentTime;
      const vol = THREE.MathUtils.clamp(spatial.gain * 0.28, 0.02, 0.35);

      // Çığlık Osilatörü (Sawtooth / FM süpürme: 750Hz -> 380Hz)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      // Rastgele kadın/erkek perdesi
      const isHighPitch = Math.random() > 0.45;
      const startFreq = isHighPitch ? (680 + Math.random() * 120) : (440 + Math.random() * 80);
      const endFreq = startFreq * 0.52;

      osc.type = isHighPitch ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(startFreq, now);
      osc.frequency.linearRampToValueAtTime(startFreq * 1.08, now + 0.08); // İlk şok yükselmesi
      osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.42);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(isHighPitch ? 2200 : 1400, now);

      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(vol, now + 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      let panner = null;
      if (typeof ctx.createStereoPanner === 'function') {
        panner = ctx.createStereoPanner();
        panner.pan.setValueAtTime(spatial.pan, now);
      }

      const master = panner || ctx.destination;
      if (panner) panner.connect(ctx.destination);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(master);

      osc.start(now);
      osc.stop(now + 0.48);
    } catch (e) {
      console.warn('[PedestrianAudio] playScream hatası:', e);
    }
  }

  /**
   * Araç yakında korna çaldığında homurdanma / kızgın ses tepkisi
   * @param {THREE.Vector3} position
   */
  playHornReaction(position) {
    const ctx = this._getAudioContext();
    if (!ctx) return;

    const spatial = this._computeSpatialParams(position);
    if (!spatial) return;

    try {
      const now = ctx.currentTime;
      const vol = THREE.MathUtils.clamp(spatial.gain * 0.22, 0.02, 0.28);

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(160 + Math.random() * 40, now);
      osc.frequency.exponentialRampToValueAtTime(95, now + 0.22);

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(500, now);
      filter.Q.setValueAtTime(2.0, now);

      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      let panner = null;
      if (typeof ctx.createStereoPanner === 'function') {
        panner = ctx.createStereoPanner();
        panner.pan.setValueAtTime(spatial.pan, now);
      }

      const master = panner || ctx.destination;
      if (panner) panner.connect(ctx.destination);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(master);

      osc.start(now);
      osc.stop(now + 0.26);
    } catch (e) {
      console.warn('[PedestrianAudio] playHornReaction hatası:', e);
    }
  }

  /**
   * Çete üyeleri ateş ettiğinde 3D konumsal 9mm tabanca patlama sesi
   * @param {THREE.Vector3} position
   */
  playGunshot3D(position) {
    const ctx = this._getAudioContext();
    if (!ctx) return;

    const spatial = this._computeSpatialParams(position);
    if (!spatial) return;

    try {
      const now = ctx.currentTime;
      const vol = THREE.MathUtils.clamp(spatial.gain * 0.75, 0.05, 0.95);

      // 1. Tok Bas Patlaması (180Hz -> 45Hz)
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(42, now + 0.12);

      oscGain.gain.setValueAtTime(vol, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      // 2. Barut Patlama Şaklaması (White Noise Crack)
      const bufferSize = Math.floor(ctx.sampleRate * 0.14);
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.18));
      }
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;

      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'highpass';
      noiseFilter.frequency.setValueAtTime(850, now);
      noiseFilter.frequency.linearRampToValueAtTime(350, now + 0.12);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(vol * 0.9, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

      let panner = null;
      if (typeof ctx.createStereoPanner === 'function') {
        panner = ctx.createStereoPanner();
        panner.pan.setValueAtTime(spatial.pan, now);
      }

      const master = panner || ctx.destination;
      if (panner) panner.connect(ctx.destination);

      osc.connect(oscGain);
      oscGain.connect(master);

      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(master);

      osc.start(now);
      osc.stop(now + 0.16);
      noise.start(now);
      noise.stop(now + 0.15);
    } catch (e) {
      console.warn('[PedestrianAudio] playGunshot3D hatası:', e);
    }
  }

  /**
   * Çete kavgası yumruk darbe sesi
   * @param {THREE.Vector3} position
   */
  playPunch3D(position) {
    const ctx = this._getAudioContext();
    if (!ctx) return;

    const spatial = this._computeSpatialParams(position);
    if (!spatial) return;

    try {
      const now = ctx.currentTime;
      const vol = THREE.MathUtils.clamp(spatial.gain * 0.45, 0.05, 0.55);

      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.10);

      oscGain.gain.setValueAtTime(vol, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      let panner = null;
      if (typeof ctx.createStereoPanner === 'function') {
        panner = ctx.createStereoPanner();
        panner.pan.setValueAtTime(spatial.pan, now);
      }

      const master = panner || ctx.destination;
      if (panner) panner.connect(ctx.destination);

      osc.connect(oscGain);
      oscGain.connect(master);

      osc.start(now);
      osc.stop(now + 0.13);
    } catch (e) {
      console.warn('[PedestrianAudio] playPunch3D hatası:', e);
    }
  }

  /**
   * Çete üyelerinin sataşma / laf atma narası
   * @param {THREE.Vector3} position
   * @param {string} faction - 'GROVE' | 'BALLAS'
   */
  playGangTaunt(position, faction = 'GROVE') {
    const ctx = this._getAudioContext();
    if (!ctx) return;

    const spatial = this._computeSpatialParams(position);
    if (!spatial) return;

    try {
      const now = ctx.currentTime;
      const vol = THREE.MathUtils.clamp(spatial.gain * 0.38, 0.04, 0.48);

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      const isGrove = (faction === 'GROVE');
      const startFreq = isGrove ? 190 : 280;
      const endFreq = isGrove ? 130 : 170;

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(startFreq, now);
      osc.frequency.linearRampToValueAtTime(startFreq * 1.15, now + 0.08);
      osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.32);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(isGrove ? 680 : 1100, now);
      filter.Q.setValueAtTime(2.2, now);

      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(vol, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      let panner = null;
      if (typeof ctx.createStereoPanner === 'function') {
        panner = ctx.createStereoPanner();
        panner.pan.setValueAtTime(spatial.pan, now);
      }

      const master = panner || ctx.destination;
      if (panner) panner.connect(ctx.destination);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(master);

      osc.start(now);
      osc.stop(now + 0.36);
    } catch (e) {
      console.warn('[PedestrianAudio] playGangTaunt hatası:', e);
    }
  }

  /**
   * CJ Grove Street üyesine yaklaştığında dostane selamlama ("Yo CJ!")
   * @param {THREE.Vector3} position
   */
  playGangGreeting(position) {
    const ctx = this._getAudioContext();
    if (!ctx) return;

    const spatial = this._computeSpatialParams(position);
    if (!spatial) return;

    try {
      const now = ctx.currentTime;
      const vol = THREE.MathUtils.clamp(spatial.gain * 0.32, 0.03, 0.40);

      // İki tonlu melodik ıslık/selam (380Hz -> 540Hz)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(360, now);
      osc.frequency.setValueAtTime(520, now + 0.12);

      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(vol, now + 0.04);
      gain.gain.setValueAtTime(vol, now + 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

      let panner = null;
      if (typeof ctx.createStereoPanner === 'function') {
        panner = ctx.createStereoPanner();
        panner.pan.setValueAtTime(spatial.pan, now);
      }

      const master = panner || ctx.destination;
      if (panner) panner.connect(ctx.destination);

      osc.connect(gain);
      gain.connect(master);

      osc.start(now);
      osc.stop(now + 0.30);
    } catch (e) {
      console.warn('[PedestrianAudio] playGangGreeting hatası:', e);
    }
  }

  /**
   * Çete savaşı başladığında çalan döngüsel analog alarm sireni (ADIM 11)
   */
  playWarSiren() {
    const ctx = this._getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const duration = 2.8;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      // İki periyotlu siren dalgası (160Hz -> 340Hz -> 160Hz)
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.linearRampToValueAtTime(320, now + 0.7);
      osc.frequency.linearRampToValueAtTime(160, now + 1.4);
      osc.frequency.linearRampToValueAtTime(320, now + 2.1);
      osc.frequency.linearRampToValueAtTime(160, now + 2.8);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(650, now);

      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.35, now + 0.15);
      gain.gain.setValueAtTime(0.35, now + 2.4);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + duration);
    } catch (e) {
      console.warn('[PedestrianAudio] playWarSiren hatası:', e);
    }
  }

  /**
   * Her çatışma dalgası başladığında çalan tok savaş davulu (ADIM 11)
   */
  playWaveDrum() {
    const ctx = this._getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      // 1. Derin sub-bass vuruşu (110Hz -> 38Hz)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(110, now);
      osc.frequency.exponentialRampToValueAtTime(36, now + 0.35);

      gain.gain.setValueAtTime(0.55, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      // 2. Sert transient çıtırtısı (Darbe anı)
      const bufferSize = Math.floor(ctx.sampleRate * 0.05);
      const noiseBuf = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const out = noiseBuf.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        out[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.2));
      }
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuf;

      const nFilter = ctx.createBiquadFilter();
      nFilter.type = 'bandpass';
      nFilter.frequency.setValueAtTime(320, now);

      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.35, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

      noise.connect(nFilter);
      nFilter.connect(nGain);
      nGain.connect(ctx.destination);

      osc.connect(gain);
      gain.connect(ctx.destination);

      noise.start(now);
      noise.stop(now + 0.06);

      osc.start(now);
      osc.stop(now + 0.46);
    } catch (e) {
      console.warn('[PedestrianAudio] playWaveDrum hatası:', e);
    }
  }

  /**
   * Bölge ele geçirildiğinde GTA San Andreas zafer jingle'ı (ADIM 11)
   */
  playTurfVictory() {
    const ctx = this._getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      // 4 notalı pirinç/üflemeli zafer arpeji: C4 (261.6), E4 (329.6), G4 (392.0), C5 (523.2)
      const notes = [261.63, 329.63, 392.00, 523.25];
      const noteStarts = [0, 0.18, 0.36, 0.58];
      const durations = [0.16, 0.16, 0.20, 0.85];

      for (let i = 0; i < notes.length; i++) {
        const freq = notes[i];
        const start = now + noteStarts[i];
        const dur = durations[i];

        const osc = ctx.createOscillator();
        const osc2 = ctx.createOscillator(); // Korosu/zenginliği artırmak için hafif detune
        const gain = ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, start);

        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(freq * 1.002, start);

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1400, start);
        filter.frequency.exponentialRampToValueAtTime(450, start + dur);

        gain.gain.setValueAtTime(0.01, start);
        gain.gain.linearRampToValueAtTime(0.32, start + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, start + dur);

        osc.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        osc.start(start);
        osc2.start(start);
        osc.stop(start + dur + 0.05);
        osc2.stop(start + dur + 0.05);
      }
    } catch (e) {
      console.warn('[PedestrianAudio] playTurfVictory hatası:', e);
    }
  }

  /**
   * ADIM 12: 3D Amerikan Polis Sireni (Wail / Yelp modu)
   * @param {THREE.Vector3} position - Polis aracının konumu
   * @param {boolean} [isYelp=false] - Hızlı yelp modu mu yoksa uzun wail mi
   */
  playPoliceSiren3D(position, isYelp = false) {
    const ctx = this._getAudioContext();
    if (!ctx) return;

    const spatial = this._computeSpatialParams(position);
    if (!spatial) return;

    try {
      const now = ctx.currentTime;
      const vol = THREE.MathUtils.clamp(spatial.gain * 0.45, 0.04, 0.5);
      const duration = isYelp ? 0.55 : 1.85;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      if (isYelp) {
        // Hızlı Yelp: 700Hz -> 1300Hz -> 700Hz
        osc.frequency.setValueAtTime(700, now);
        osc.frequency.linearRampToValueAtTime(1300, now + duration * 0.5);
        osc.frequency.linearRampToValueAtTime(700, now + duration);
      } else {
        // Uzun Wail: 620Hz -> 1050Hz -> 620Hz
        osc.frequency.setValueAtTime(620, now);
        osc.frequency.linearRampToValueAtTime(1050, now + duration * 0.55);
        osc.frequency.linearRampToValueAtTime(620, now + duration);
      }

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2200, now);

      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(vol, now + 0.08);
      gain.gain.setValueAtTime(vol, now + duration - 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      let panner = null;
      if (typeof ctx.createStereoPanner === 'function') {
        panner = ctx.createStereoPanner();
        panner.pan.setValueAtTime(spatial.pan, now);
      }

      const master = panner || ctx.destination;
      if (panner) panner.connect(ctx.destination);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(master);

      osc.start(now);
      osc.stop(now + duration + 0.02);
    } catch (e) {
      console.warn('[PedestrianAudio] playPoliceSiren3D hatası:', e);
    }
  }

  /**
   * ADIM 12: LSPD Helikopteri Ritmik Pervane Sesi (Rotor Chop)
   * @param {THREE.Vector3} position - Helikopterin 3D konumu
   * @param {number} [intensity=1.0] - Ses seviyesi katsayısı
   */
  playHelicopterRotor(position, intensity = 1.0) {
    const ctx = this._getAudioContext();
    if (!ctx) return;

    const spatial = this._computeSpatialParams(position);
    if (!spatial) return;

    try {
      const now = ctx.currentTime;
      const vol = THREE.MathUtils.clamp(spatial.gain * 0.55 * intensity, 0.05, 0.65);
      const duration = 0.28;

      // 1. Düşük frekanslı hava kesme darbesi (Sub-bass 'thump' 42Hz)
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(45, now);
      osc.frequency.exponentialRampToValueAtTime(32, now + duration);

      oscGain.gain.setValueAtTime(vol * 0.8, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      // 2. Yüksek hızda kanat hışırtısı (Filtered blade slice)
      const bufferSize = Math.floor(ctx.sampleRate * duration);
      const noiseBuf = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const out = noiseBuf.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        out[i] = (Math.random() * 2 - 1) * Math.sin((i / bufferSize) * Math.PI);
      }
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuf;

      const nFilter = ctx.createBiquadFilter();
      nFilter.type = 'bandpass';
      nFilter.frequency.setValueAtTime(380, now);
      nFilter.Q.setValueAtTime(1.5, now);

      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(vol * 0.45, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      let panner = null;
      if (typeof ctx.createStereoPanner === 'function') {
        panner = ctx.createStereoPanner();
        panner.pan.setValueAtTime(spatial.pan, now);
      }

      const master = panner || ctx.destination;
      if (panner) panner.connect(ctx.destination);

      osc.connect(oscGain);
      oscGain.connect(master);

      noise.connect(nFilter);
      nFilter.connect(nGain);
      nGain.connect(master);

      osc.start(now);
      osc.stop(now + duration + 0.02);
      noise.start(now);
      noise.stop(now + duration + 0.02);
    } catch (e) {
      console.warn('[PedestrianAudio] playHelicopterRotor hatası:', e);
    }
  }

  /**
   * ADIM 12: Taktik Polis Telsizi Cızırtısı / Mandallama (Radio Chirp)
   */
  playPoliceRadioChirp() {
    const ctx = this._getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const duration = 0.14;

      // 1. Telsiz bip frekansı
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1450, now);
      osc.frequency.setValueAtTime(1820, now + 0.06);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      // 2. Telsiz parazit hışırtısı
      const bufSize = Math.floor(ctx.sampleRate * duration);
      const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.35;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buf;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1200, now);
      filter.Q.setValueAtTime(2.2, now);

      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.18, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      noise.connect(filter);
      filter.connect(nGain);
      nGain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + duration);
      noise.start(now);
      noise.stop(now + duration);
    } catch (e) {
      console.warn('[PedestrianAudio] playPoliceRadioChirp hatası:', e);
    }
  }

  /**
   * ADIM 12: Lastik Patlaması ve Hava Tahliye Tıslaması (Tire Pop & Hiss)
   * @param {THREE.Vector3} position - Patlayan tekerlek konumu
   */
  playTirePop(position) {
    const ctx = this._getAudioContext();
    if (!ctx) return;

    const spatial = this._computeSpatialParams(position);
    if (!spatial) return;

    try {
      const now = ctx.currentTime;
      const vol = THREE.MathUtils.clamp(spatial.gain * 0.85, 0.1, 0.75);

      // 1. Patlama Darbesi (Tok Rubber Pop)
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(35, now + 0.18);

      oscGain.gain.setValueAtTime(vol * 0.9, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      // 2. Basınçlı Hava Boşalması (Hissing noise)
      const hissDuration = 0.95;
      const bufferSize = Math.floor(ctx.sampleRate * hissDuration);
      const noiseBuf = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const out = noiseBuf.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        out[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.45));
      }
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuf;

      const nFilter = ctx.createBiquadFilter();
      nFilter.type = 'highpass';
      nFilter.frequency.setValueAtTime(1600, now);

      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(vol * 0.6, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + hissDuration);

      let panner = null;
      if (typeof ctx.createStereoPanner === 'function') {
        panner = ctx.createStereoPanner();
        panner.pan.setValueAtTime(spatial.pan, now);
      }

      const master = panner || ctx.destination;
      if (panner) panner.connect(ctx.destination);

      osc.connect(oscGain);
      oscGain.connect(master);

      noise.connect(nFilter);
      nFilter.connect(nGain);
      nGain.connect(master);

      osc.start(now);
      osc.stop(now + 0.25);
      noise.start(now);
      noise.stop(now + hissDuration);
    } catch (e) {
      console.warn('[PedestrianAudio] playTirePop hatası:', e);
    }
  }

  /**
   * ADIM 13: 3D Konumsal Vintage Telefon Çalma Sesi (Dual-Tone Vintage Bell)
   * @param {THREE.Vector3} sourcePos - Telefon kulübesi konumu
   */
  playPhoneRing3D(sourcePos) {
    const ctx = this._getAudioContext();
    if (!ctx) return;

    const spatial = this._computeSpatialParams(sourcePos);
    if (!spatial) return;

    try {
      const now = ctx.currentTime;
      const vol = THREE.MathUtils.clamp(spatial.gain * 0.75, 0.05, 0.65);

      // İki zil darbesi: trrr (0.35s) - duraklama (0.15s) - trrr (0.35s)
      const ringPulses = [0.0, 0.45];
      ringPulses.forEach((offset) => {
        const tStart = now + offset;
        const dur = 0.35;

        // F1: 753 Hz, F2: 850 Hz çift çan frekansı
        [753, 850].forEach((freq) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();

          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, tStart);

          // 20Hz titreşim modülasyonu (analog çan tokmağı)
          const tremolo = ctx.createOscillator();
          const tremoloGain = ctx.createGain();
          tremolo.type = 'square';
          tremolo.frequency.setValueAtTime(20, tStart);
          tremoloGain.gain.setValueAtTime(freq * 0.15, tStart);
          tremolo.connect(osc.frequency);

          gain.gain.setValueAtTime(vol * 0.4, tStart);
          gain.gain.exponentialRampToValueAtTime(0.001, tStart + dur);

          let panner = null;
          if (typeof ctx.createStereoPanner === 'function') {
            panner = ctx.createStereoPanner();
            panner.pan.setValueAtTime(spatial.pan, tStart);
          }
          const master = panner || ctx.destination;
          if (panner) panner.connect(ctx.destination);

          osc.connect(gain);
          gain.connect(master);

          tremolo.start(tStart);
          tremolo.stop(tStart + dur);
          osc.start(tStart);
          osc.stop(tStart + dur);
        });
      });
    } catch (e) {
      console.warn('[PedestrianAudio] playPhoneRing3D hatası:', e);
    }
  }

  /**
   * ADIM 13: Telefon Ahizesini Kaldırma / Açma Klik Sesi
   */
  playPhonePickup() {
    const ctx = this._getAudioContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(240, now);
      osc.frequency.exponentialRampToValueAtTime(50, now + 0.08);

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.09);
    } catch (e) {}
  }

  /**
   * ADIM 13: GTA San Andreas Görev Başlangıç Bas Darbesi (Mission Start)
   */
  playMissionStart() {
    const ctx = this._getAudioContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      // Derin sub-bass vuruşu (65Hz -> 28Hz)
      const subOsc = ctx.createOscillator();
      const subGain = ctx.createGain();
      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(65, now);
      subOsc.frequency.exponentialRampToValueAtTime(28, now + 0.6);

      subGain.gain.setValueAtTime(0.7, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

      subOsc.connect(subGain);
      subGain.connect(ctx.destination);
      subOsc.start(now);
      subOsc.stop(now + 0.65);

      // Tok perküsyon klik darbesi
      const clickOsc = ctx.createOscillator();
      const clickGain = ctx.createGain();
      clickOsc.type = 'triangle';
      clickOsc.frequency.setValueAtTime(320, now);
      clickOsc.frequency.exponentialRampToValueAtTime(70, now + 0.12);

      clickGain.gain.setValueAtTime(0.5, now);
      clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

      clickOsc.connect(clickGain);
      clickGain.connect(ctx.destination);
      clickOsc.start(now);
      clickOsc.stop(now + 0.14);
    } catch (e) {
      console.warn('[PedestrianAudio] playMissionStart hatası:', e);
    }
  }

  /**
   * ADIM 13: İkonik GTA San Andreas Görev Başarı Fanfarı (Mission Passed G-Funk Synth)
   */
  playMissionPassed() {
    const ctx = this._getAudioContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      // 4 Aşamalı Akor Progresyonu: C4, Eb4, F4, G4 / C5 zafer teması
      const notes = [
        { freqs: [261.63, 329.63, 392.00], start: 0.0, dur: 0.28 }, // C Maj
        { freqs: [293.66, 369.99, 440.00], start: 0.32, dur: 0.28 }, // D
        { freqs: [349.23, 440.00, 523.25], start: 0.64, dur: 0.32 }, // F
        { freqs: [392.00, 493.88, 587.33, 783.99], start: 1.0, dur: 1.2 }  // G Maj / High Octave
      ];

      notes.forEach((chord) => {
        chord.freqs.forEach((freq) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const filter = ctx.createBiquadFilter();

          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(freq, now + chord.start);

          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(1400, now + chord.start);
          filter.frequency.exponentialRampToValueAtTime(600, now + chord.start + chord.dur);

          gain.gain.setValueAtTime(0.18, now + chord.start);
          gain.gain.exponentialRampToValueAtTime(0.001, now + chord.start + chord.dur);

          osc.connect(filter);
          filter.connect(gain);
          gain.connect(ctx.destination);

          osc.start(now + chord.start);
          osc.stop(now + chord.start + chord.dur);
        });
      });

      // Zengin Sub-Bass alt katmanı
      const bassOsc = ctx.createOscillator();
      const bassGain = ctx.createGain();
      bassOsc.type = 'triangle';
      bassOsc.frequency.setValueAtTime(65.41, now); // C2
      bassOsc.frequency.setValueAtTime(98.0, now + 1.0); // G2

      bassGain.gain.setValueAtTime(0.45, now);
      bassGain.gain.exponentialRampToValueAtTime(0.001, now + 2.2);

      bassOsc.connect(bassGain);
      bassGain.connect(ctx.destination);
      bassOsc.start(now);
      bassOsc.stop(now + 2.2);
    } catch (e) {
      console.warn('[PedestrianAudio] playMissionPassed hatası:', e);
    }
  }

  /**
   * ADIM 13: Görev Başarısızlık Kasvetli Tınısı (Mission Failed Gloomy Cue)
   */
  playMissionFailed() {
    const ctx = this._getAudioContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      // Düşük minör kasvetli iniş (Fm - Eb - Db)
      const chords = [
        { freqs: [174.61, 207.65, 261.63], start: 0.0, dur: 0.5 },
        { freqs: [155.56, 185.00, 233.08], start: 0.52, dur: 0.5 },
        { freqs: [138.59, 164.81, 207.65], start: 1.05, dur: 1.4 }
      ];

      chords.forEach((c) => {
        c.freqs.forEach((freq) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(freq, now + c.start);

          gain.gain.setValueAtTime(0.16, now + c.start);
          gain.gain.exponentialRampToValueAtTime(0.001, now + c.start + c.dur);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(now + c.start);
          osc.stop(now + c.start + c.dur);
        });
      });
    } catch (e) {
      console.warn('[PedestrianAudio] playMissionFailed hatası:', e);
    }
  }

  /**
   * ADIM 14: Dönen Can Kalbi Alma Sesi (Ascending Crystal Bell)
   */
  playPickupHealth() {
    const ctx = this._getAudioContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      // İki tonlu parlak çan (659Hz -> 987Hz)
      const freqs = [659.25, 987.77];
      freqs.forEach((freq, idx) => {
        const tStart = now + idx * 0.09;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, tStart);
        gain.gain.setValueAtTime(0.35, tStart);
        gain.gain.exponentialRampToValueAtTime(0.001, tStart + 0.35);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(tStart);
        osc.stop(tStart + 0.35);
      });
    } catch (e) {}
  }

  /**
   * ADIM 14: Çelik Yelek Zırhı Kuşanma Sesi (Tactical Armor Clack)
   */
  playPickupArmor() {
    const ctx = this._getAudioContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      // Metalik tok toka sesi (220Hz ve 440Hz triangle vuruş)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(420, now);
      osc.frequency.exponentialRampToValueAtTime(110, now + 0.12);

      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.14);
    } catch (e) {}
  }

  /**
   * ADIM 14: Para Deste Toplama Sesi (Retro Cash Ka-Ching)
   */
  playPickupMoney() {
    const ctx = this._getAudioContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      // İki hızlı yüksek frekanslı zil vuruşu (1760Hz ve 2349Hz)
      const tones = [1760, 2349.32];
      tones.forEach((freq, idx) => {
        const tStart = now + idx * 0.08;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, tStart);
        gain.gain.setValueAtTime(0.3, tStart);
        gain.gain.exponentialRampToValueAtTime(0.001, tStart + 0.28);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(tStart);
        osc.stop(tStart + 0.28);
      });
    } catch (e) {}
  }

  /**
   * ADIM 14: Cephane Sandığı Alma Sesi (Gun Rack Click)
   */
  playPickupAmmo() {
    const ctx = this._getAudioContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.08);

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.09);
    } catch (e) {}
  }

  /**
   * ADIM 14: Silah Çarkı / Hızlı Silah Değiştirme Sesi (Weapon Switch Holster)
   */
  playWeaponSwitch() {
    const ctx = this._getAudioContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(340, now);
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.06);

      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.07);
    } catch (e) {}
  }
}

export const pedestrianAudio = new PedestrianAudio();


