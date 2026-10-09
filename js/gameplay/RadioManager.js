/**
 * RadioManager.js - GTA San Andreas Tarzı Araç İçi Radyo İstasyonları (ADIM 15)
 * Web Audio API Lookahead Audio Scheduler mimarisi ile sıfır timing-jitter sentetik müzik motoru.
 * West Coast G-Funk, Boom-Bap, Classic Rock, Funk & Country prosedürel istasyonları.
 * Teyp statik arama cızırtısı (tuning noise burst), pürüzsüz crossfade, AnalyserNode canlı ekolayzır HUD'ı.
 */

export class RadioManager {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.stationGain = null;
    this.analyser = null;
    this.freqDataArray = null;

    this.currentStationIndex = 1; // Varsayılan: Radio Los Santos
    this.isPlaying = false;

    // Lookahead Audio Scheduler (Chris Wilson Web Audio standardı)
    this.lookaheadInterval = null;
    this.lookaheadTime = 25.0; // 25ms periyodik kontrol
    this.scheduleAheadSec = 0.12; // 120ms geleceği önceden programla
    this.nextNoteTime = 0.0;
    this.current16thNote = 0; // 0..31 (2 ölçü = 32 adım döngüsü)

    // İstasyon Kataloğu
    this.stations = [
      {
        id: 'OFF',
        name: 'RADIO OFF',
        genre: 'Müzik Kapalı',
        tagline: 'Radyo Kapalı • Sessiz Sürüş',
        color: '#94a3b8',
        tempo: 0
      },
      {
        id: 'LOS_SANTOS',
        name: 'RADIO LOS SANTOS',
        genre: 'West Coast G-Funk & Hip-Hop',
        tagline: '"Keepin\' it gangsta in the streets of Los Santos"',
        color: '#4ade80',
        tempo: 92
      },
      {
        id: 'PLAYBACK',
        name: 'PLAYBACK FM',
        genre: 'East Coast 90s Boom-Bap',
        tagline: '"Real Hip-Hop & Uncut Street Classics"',
        color: '#fb923c',
        tempo: 88
      },
      {
        id: 'KDST',
        name: 'K-DST - "THE DUST"',
        genre: '70s & 80s Classic Rock',
        tagline: '"If the police can\'t stop you, you\'re on The Dust"',
        color: '#f87171',
        tempo: 116
      },
      {
        id: 'BOUNCE',
        name: 'BOUNCE FM',
        genre: 'Funk, Disco & Soul Groove',
        tagline: '"The party never stops on Bounce FM"',
        color: '#c084fc',
        tempo: 106
      },
      {
        id: 'KROSE',
        name: 'K-ROSE',
        genre: 'Classic Country & Western',
        tagline: '"The music that built this great nation"',
        color: '#fde047',
        tempo: 122
      }
    ];

    // HUD ve Görselleştirme Durumu
    this.hudElement = null;
    this.hudTimeout = null;
    this.eqAnimFrame = null;

    // Distorsiyon eğrisi önbelleği
    this._distortionCurve = this._makeDistortionCurve(35);
  }

  /* =========================================================
     1. SES MOTORU VE ZAMANLAYICI İNİSİYALİZASYONU
     ========================================================= */
  init() {
    if (!this.ctx) {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtxClass) return;

      this.ctx = new AudioCtxClass();

      // Master Gain
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.24, this.ctx.currentTime);

      // Station Sub Gain (Crossfade için)
      this.stationGain = this.ctx.createGain();
      this.stationGain.gain.setValueAtTime(1.0, this.ctx.currentTime);
      this.stationGain.connect(this.masterGain);

      // AnalyserNode (Canlı Ekolayzır için)
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 64;
      this.analyser.smoothingTimeConstant = 0.8;
      this.freqDataArray = new Uint8Array(this.analyser.frequencyBinCount);

      this.masterGain.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
    }

    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  /* =========================================================
     2. İSTASYON KONTROLLERİ & CROSSFADE GEÇİŞLERİ
     ========================================================= */
  nextStation() {
    this.currentStationIndex = (this.currentStationIndex + 1) % this.stations.length;
    this.switchStation();
  }

  prevStation() {
    this.currentStationIndex = (this.currentStationIndex - 1 + this.stations.length) % this.stations.length;
    this.switchStation();
  }

  setStation(stationId) {
    const idx = this.stations.findIndex(s => s.id === stationId);
    if (idx !== -1) {
      this.currentStationIndex = idx;
      this.switchStation();
    }
  }

  toggle() {
    if (this.isPlaying) {
      this.setStation('OFF');
    } else {
      this.setStation('LOS_SANTOS');
    }
  }

  switchStation() {
    this.init();
    const station = this.stations[this.currentStationIndex];

    // Teyp Statik Arama Cızırtısı Oynat
    this.playTuningStatic();

    // Önceki melodiyi hızla söndür (Crossfade Out: 60ms)
    if (this.stationGain && this.ctx) {
      const now = this.ctx.currentTime;
      this.stationGain.gain.cancelScheduledValues(now);
      this.stationGain.gain.setValueAtTime(this.stationGain.gain.value, now);
      this.stationGain.gain.linearRampToValueAtTime(0.001, now + 0.06);
    }

    // Zamanlayıcıyı durdur
    this.stopScheduler();

    // HUD'ı göster
    this.showRadioHUD(station);

    if (station.id === 'OFF' || !this.ctx) {
      this.isPlaying = false;
      return;
    }

    this.isPlaying = true;

    // Yeni istasyonu 80ms sonra pürüzsüzce devreye sok (Crossfade In: 120ms)
    setTimeout(() => {
      if (!this.isPlaying || !this.ctx) return;
      const startT = this.ctx.currentTime + 0.04;
      this.stationGain.gain.cancelScheduledValues(startT);
      this.stationGain.gain.setValueAtTime(0.001, startT);
      this.stationGain.gain.linearRampToValueAtTime(1.0, startT + 0.12);

      this.startScheduler(station);
    }, 70);
  }

  playCurrentStation() {
    const station = this.stations[this.currentStationIndex];
    if (station.id !== 'OFF') {
      this.switchStation();
    }
  }

  stop() {
    this.stopScheduler();
    this.isPlaying = false;
    if (this.stationGain && this.ctx) {
      const now = this.ctx.currentTime;
      this.stationGain.gain.cancelScheduledValues(now);
      this.stationGain.gain.linearRampToValueAtTime(0.001, now + 0.08);
    }
    this.hideRadioHUD();
  }

  /* =========================================================
     3. TEYP FREKANS ARAMA CIZIRTISI (TUNING STATIC BURST)
     ========================================================= */
  playTuningStatic() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // 160ms'lik beyaz gürültü buffer'ı
    const sampleRate = this.ctx.sampleRate;
    const dur = 0.16;
    const buf = this.ctx.createBuffer(1, Math.floor(sampleRate * dur), sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buf;

    // Radyo bandpass frekans taraması
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1600, now);
    filter.frequency.exponentialRampToValueAtTime(900, now + dur);
    filter.Q.value = 2.2;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start(now);
    noise.stop(now + dur + 0.02);
  }

  /* =========================================================
     4. LOOKAHEAD AUDIO SCHEDULER (SIFIR JITTER SENKRONİZASYON)
     ========================================================= */
  startScheduler(station) {
    if (!this.ctx || station.tempo <= 0) return;

    this.current16thNote = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.05;

    this.lookaheadInterval = setInterval(() => {
      this._scheduleCycle(station);
    }, this.lookaheadTime);
  }

  stopScheduler() {
    if (this.lookaheadInterval) {
      clearInterval(this.lookaheadInterval);
      this.lookaheadInterval = null;
    }
  }

  _scheduleCycle(station) {
    if (!this.ctx || !this.isPlaying) return;

    // Gelecek 120ms içindeki tüm notaları önceden programla
    while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAheadSec) {
      this.playStep(station, this.current16thNote, this.nextNoteTime);
      this._advanceStep(station);
    }
  }

  _advanceStep(station) {
    const secondsPerBeat = 60.0 / station.tempo;
    const secondsPer16th = secondsPerBeat / 4.0; // 16'lık nota süresi
    this.nextNoteTime += secondsPer16th;
    this.current16thNote = (this.current16thNote + 1) % 32; // 32 adımlı döngü (2 ölçü)
  }

  /* =========================================================
     5. İSTASYON PROSEDÜREL BESTE VE ENSTRÜMANLARI
     ========================================================= */
  playStep(station, step, time) {
    switch (station.id) {
      case 'LOS_SANTOS':
        this._playRadioLosSantos(step, time);
        break;
      case 'PLAYBACK':
        this._playPlaybackFM(step, time);
        break;
      case 'KDST':
        this._playKDST(step, time);
        break;
      case 'BOUNCE':
        this._playBounceFM(step, time);
        break;
      case 'KROSE':
        this._playKRose(step, time);
        break;
    }
  }

  // -------------------------------------------------------------
  // İSTASYON 1: RADIO LOS SANTOS (West Coast G-Funk - 92 BPM)
  // -------------------------------------------------------------
  _playRadioLosSantos(step, time) {
    // 1. 808 Sub-Bass (Derin, rezonanslı West-Coast bas)
    if (step === 0 || step === 6 || step === 16 || step === 22 || step === 28) {
      const rootNotes = [43.65, 48.99, 43.65, 38.89]; // F1, G1, F1, D#1
      const note = rootNotes[Math.floor(step / 8) % rootNotes.length];
      this._synthSubBass(time, note, 0.42);
    }

    // 2. Punchy Hip-Hop Kick
    if (step === 0 || step === 8 || step === 10 || step === 16 || step === 24 || step === 26) {
      this._synthKick(time, 115, 36, 0.28, 0.38);
    }

    // 3. Crisp Snare / Rimshot
    if (step === 4 || step === 12 || step === 20 || step === 28) {
      this._synthSnare(time, 0.26, 1400);
    }

    // 4. 16'lık Hi-Hats (Aksanlı)
    const hatGain = (step % 4 === 2) ? 0.08 : 0.04;
    this._synthHiHat(time, hatGain, 5500);

    // 5. G-Funk Whistle Lead Synth (Otantik Dr. Dre Islığı - Portamento Sine)
    // 32 adımlık akıcı melodi motifleri
    const melodyMap = {
      0: 1174.66, // D6
      2: 1318.51, // E6
      4: 1567.98, // G6
      6: 1760.00, // A6
      10: 1567.98,// G6
      12: 1318.51,// E6
      16: 1174.66,// D6
      20: 1046.50,// C6
      24: 1174.66,// D6
      26: 1318.51 // E6
    };
    if (melodyMap[step]) {
      const targetFreq = melodyMap[step];
      const nextFreq = melodyMap[(step + 2) % 32] || targetFreq;
      this._synthGFunkWhistle(time, targetFreq, nextFreq, 0.26);
    }

    // 6. Smooth Rhodes Minor Chords (Step 0 ve 16)
    if (step === 0 || step === 16) {
      const chordFreqs = step === 0 ? [220.0, 261.63, 329.63] : [196.0, 246.94, 293.66]; // Am7, G6
      chordFreqs.forEach(f => this._synthWarmKey(time, f, 0.65, 0.10));
    }
  }

  // -------------------------------------------------------------
  // İSTASYON 2: PLAYBACK FM (East Coast 90s Boom-Bap - 88 BPM)
  // -------------------------------------------------------------
  _playPlaybackFM(step, time) {
    // 1. Ağır Boom-Bap Kick
    if (step === 0 || step === 6 || step === 10 || step === 16 || step === 22 || step === 28) {
      this._synthKick(time, 130, 42, 0.32, 0.40);
    }

    // 2. Fat Snare & Vinyl Snap
    if (step === 4 || step === 12 || step === 20 || step === 28) {
      this._synthSnare(time, 0.30, 950);
    }

    // 3. Shuffled Hi-Hats
    if (step % 2 === 0) {
      this._synthHiHat(time, step % 4 === 0 ? 0.07 : 0.035, 6200);
    }

    // 4. Upright Plucked Bassline
    if (step === 0 || step === 3 || step === 8 || step === 12 || step === 16 || step === 24) {
      const jazzNotes = [55.0, 65.41, 73.42, 82.41]; // A1, C2, D2, E2
      const f = jazzNotes[Math.floor(step / 6) % jazzNotes.length];
      this._synthPluckedBass(time, f, 0.24);
    }

    // 5. Dusty Jazz Chords (Neo-Soul Stabs)
    if (step === 0 || step === 7 || step === 16 || step === 23) {
      [261.63, 311.13, 392.0, 466.16].forEach(freq => { // Cm7
        this._synthWarmKey(time, freq, 0.35, 0.08);
      });
    }
  }

  // -------------------------------------------------------------
  // İSTASYON 3: K-DST - THE DUST (Classic Rock - 116 BPM)
  // -------------------------------------------------------------
  _playKDST(step, time) {
    // 1. Akustik Rock Kick
    if (step === 0 || step === 6 || step === 8 || step === 16 || step === 22 || step === 24) {
      this._synthKick(time, 145, 50, 0.22, 0.32);
    }

    // 2. Loud Rock Snare
    if (step === 4 || step === 12 || step === 20 || step === 28) {
      this._synthSnare(time, 0.32, 1200);
    }

    // 3. Rock Open/Closed Ride
    this._synthHiHat(time, step % 4 === 2 ? 0.09 : 0.03, 4800);

    // 4. Overdriven Guitar Power Chords (A5 -> G5 -> D5 -> A5)
    if (step === 0 || step === 4 || step === 8 || step === 14 || step === 16 || step === 24) {
      const chords = [110.0, 98.0, 146.83, 110.0]; // A, G, D, A
      const root = chords[Math.floor(step / 8) % chords.length];
      this._synthDistortedPowerChord(time, root, 0.32);
    }

    // 5. Driving Rock Bass
    if (step % 2 === 0) {
      const bassNotes = [55.0, 49.0, 73.42, 55.0];
      const bf = bassNotes[Math.floor(step / 8) % bassNotes.length];
      this._synthSubBass(time, bf, 0.16, 'sawtooth');
    }
  }

  // -------------------------------------------------------------
  // İSTASYON 4: BOUNCE FM (Funk & Disco Groove - 106 BPM)
  // -------------------------------------------------------------
  _playBounceFM(step, time) {
    // 1. Four-on-the-Floor Disco Kick
    if (step % 4 === 0) {
      this._synthKick(time, 135, 45, 0.24, 0.34);
    }

    // 2. Snappy Disco Snare & Clap
    if (step === 4 || step === 12 || step === 20 || step === 28) {
      this._synthSnare(time, 0.28, 1600);
    }

    // 3. 16'lık Funk Hi-Hats & Off-Beat Open Hat
    const hatG = (step % 4 === 2) ? 0.09 : 0.04;
    this._synthHiHat(time, hatG, 7000);

    // 4. Resonant Auto-Wah Slap Bass
    if (step === 0 || step === 3 || step === 6 || step === 10 || step === 14 || step === 18 || step === 26) {
      const slapNotes = [82.41, 110.0, 123.47, 146.83, 164.81]; // E2, A2, B2, D3, E3
      const note = slapNotes[step % slapNotes.length];
      this._synthSlapBass(time, note, 0.18);
    }

    // 5. Funky Clavinet / Brass Stabs
    if (step === 2 || step === 6 || step === 10 || step === 18 || step === 22) {
      [220.0, 277.18, 329.63].forEach(f => this._synthWarmKey(time, f, 0.12, 0.09));
    }
  }

  // -------------------------------------------------------------
  // İSTASYON 5: K-ROSE (Classic Country & Western - 122 BPM)
  // -------------------------------------------------------------
  _playKRose(step, time) {
    // 1. Two-Step Alternating Bass (Root-Fifth)
    if (step === 0 || step === 8 || step === 16 || step === 24) {
      const rootPitches = [65.41, 98.0, 65.41, 87.31]; // C2, G2, C2, F2
      this._synthSubBass(time, rootPitches[Math.floor(step / 8)], 0.22);
    }

    // 2. Train-Beat Snare Shuffle
    if (step % 2 === 1) {
      this._synthSnare(time, 0.14, 1100);
    }

    // 3. Acoustic Guitar Twang Strum
    if (step === 4 || step === 12 || step === 20 || step === 28) {
      [130.81, 164.81, 196.0, 261.63].forEach((f, i) => {
        this._synthWarmKey(time + i * 0.008, f, 0.20, 0.08);
      });
    }

    // 4. Clean Twang Lead (Telecaster Vibe)
    if (step === 2 || step === 6 || step === 14 || step === 22) {
      const twangs = [523.25, 659.25, 783.99, 587.33];
      this._synthWarmKey(time, twangs[step % twangs.length], 0.28, 0.12);
    }
  }

  /* =========================================================
     6. ENSTRÜMAN SENTETİK SES MODÜLLERİ (ZERO EXTERNAL ASSET)
     ========================================================= */

  // 808 Sub-Bass
  _synthSubBass(time, freq, dur, type = 'sine') {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = type;
    osc.frequency.setValueAtTime(freq * 1.08, time);
    osc.frequency.exponentialRampToValueAtTime(freq, time + 0.04);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(260, time);

    gain.gain.setValueAtTime(0.36, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.stationGain);

    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  // Punchy Kick
  _synthKick(time, startFreq, endFreq, decay, gainVal = 0.35) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.frequency.setValueAtTime(startFreq, time);
    osc.frequency.exponentialRampToValueAtTime(endFreq, time + decay);

    gain.gain.setValueAtTime(gainVal, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + decay);

    osc.connect(gain);
    gain.connect(this.stationGain);

    osc.start(time);
    osc.stop(time + decay + 0.02);
  }

  // Snappy Snare
  _synthSnare(time, gainVal = 0.25, filterFreq = 1200) {
    const dur = 0.14;
    const buf = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * dur), this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buf;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = filterFreq;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(gainVal, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

    // Gövde darbesi (Tonal punch)
    const bodyOsc = this.ctx.createOscillator();
    const bodyGain = this.ctx.createGain();
    bodyOsc.frequency.setValueAtTime(180, time);
    bodyOsc.frequency.exponentialRampToValueAtTime(80, time + 0.06);
    bodyGain.gain.setValueAtTime(gainVal * 0.7, time);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, time + 0.06);

    bodyOsc.connect(bodyGain);
    bodyGain.connect(this.stationGain);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.stationGain);

    noise.start(time);
    noise.stop(time + dur + 0.02);
    bodyOsc.start(time);
    bodyOsc.stop(time + 0.07);
  }

  // Crisp Hi-Hat
  _synthHiHat(time, gainVal = 0.05, freq = 6000) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, time);

    filter.type = 'highpass';
    filter.frequency.value = freq * 0.8;

    gain.gain.setValueAtTime(gainVal, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.045);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.stationGain);

    osc.start(time);
    osc.stop(time + 0.05);
  }

  // G-Funk Melodic Whistle Lead (Portamento Glide)
  _synthGFunkWhistle(time, startFreq, endFreq, dur) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(startFreq, time);
    // Portamento: Notalar arasında hafif kayma
    osc.frequency.exponentialRampToValueAtTime(endFreq, time + dur * 0.85);

    filter.type = 'lowpass';
    filter.frequency.value = 3200;

    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(0.18, time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.stationGain);

    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  // Warm Rhodes / Keyboard Chord
  _synthWarmKey(time, freq, dur, gainVal = 0.1) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, time);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(750, time);

    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(gainVal, time + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.stationGain);

    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  // Plucked Upright Acoustic Bass
  _synthPluckedBass(time, freq, dur) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, time);

    gain.gain.setValueAtTime(0.32, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

    osc.connect(gain);
    gain.connect(this.stationGain);

    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  // Distorted Rock Power Chord
  _synthDistortedPowerChord(time, rootFreq, dur) {
    [rootFreq, rootFreq * 1.498].forEach(f => { // Root + Fifth
      const osc = this.ctx.createOscillator();
      const waveShaper = this.ctx.createWaveShaper();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f, time);

      waveShaper.curve = this._distortionCurve;
      waveShaper.oversample = '2x';

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1200, time);
      filter.Q.value = 1.4;

      gain.gain.setValueAtTime(0.12, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

      osc.connect(waveShaper);
      waveShaper.connect(filter);
      filter.connect(gain);
      gain.connect(this.stationGain);

      osc.start(time);
      osc.stop(time + dur + 0.02);
    });
  }

  // Slap Funk Resonant Bass (Auto-Wah Envelope)
  _synthSlapBass(time, freq, dur) {
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);

    // Auto-Wah Filtre Açılıp Kapanması
    filter.type = 'lowpass';
    filter.Q.value = 6.0;
    filter.frequency.setValueAtTime(1800, time);
    filter.frequency.exponentialRampToValueAtTime(320, time + dur * 0.65);

    gain.gain.setValueAtTime(0.26, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.stationGain);

    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  _makeDistortionCurve(amount) {
    const k = typeof amount === 'number' ? amount : 50;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }

  /* =========================================================
     7. GTA RETRO RADYO HUD & CANLI EKOLAYZIR GÖRSELLEŞTİRME
     ========================================================= */
  showRadioHUD(station) {
    if (!this.hudElement) {
      this._createHUDElements();
    }

    const titleEl = document.getElementById('gta-radio-title');
    const genreEl = document.getElementById('gta-radio-genre');
    const badgeEl = document.getElementById('gta-radio-badge');
    const taglineEl = document.getElementById('gta-radio-tagline');

    if (titleEl) titleEl.textContent = station.name;
    if (genreEl) genreEl.textContent = station.genre;
    if (taglineEl) taglineEl.textContent = station.tagline;
    if (badgeEl) {
      badgeEl.style.backgroundColor = station.color;
      badgeEl.textContent = station.id === 'OFF' ? 'OFF' : 'ON AIR';
    }

    this.hudElement.classList.add('visible');

    // Canlı Ekolayzır Animasyon Döngüsünü Başlat
    this._startEqualizerAnimation();

    if (this.hudTimeout) clearTimeout(this.hudTimeout);
    this.hudTimeout = setTimeout(() => {
      this.hideRadioHUD();
    }, 3200);
  }

  hideRadioHUD() {
    if (this.hudElement) {
      this.hudElement.classList.remove('visible');
    }
    if (this.eqAnimFrame) {
      cancelAnimationFrame(this.eqAnimFrame);
      this.eqAnimFrame = null;
    }
  }

  _createHUDElements() {
    let el = document.getElementById('gta-radio-hud');
    if (!el) {
      el = document.createElement('div');
      el.id = 'gta-radio-hud';
      el.className = 'gta-radio-box';
      el.innerHTML = `
        <div class="gta-radio-header">
          <span id="gta-radio-badge" class="gta-radio-badge">ON AIR</span>
          <div class="gta-radio-eq-bars" id="gta-radio-eq">
            <span class="eq-bar"></span>
            <span class="eq-bar"></span>
            <span class="eq-bar"></span>
            <span class="eq-bar"></span>
            <span class="eq-bar"></span>
            <span class="eq-bar"></span>
          </div>
        </div>
        <div id="gta-radio-title" class="gta-radio-station-title">RADIO LOS SANTOS</div>
        <div id="gta-radio-genre" class="gta-radio-genre">West Coast G-Funk</div>
        <div id="gta-radio-tagline" class="gta-radio-tagline">"Keepin' it gangsta"</div>
        <div class="gta-radio-keys-hint">
          <span>[R] Sonraki Radyo</span> • <span>[Shift+R] Önceki</span>
        </div>
      `;
      document.body.appendChild(el);
    }
    this.hudElement = el;
  }

  _startEqualizerAnimation() {
    if (this.eqAnimFrame) cancelAnimationFrame(this.eqAnimFrame);

    const bars = document.querySelectorAll('.gta-radio-eq-bars .eq-bar');
    if (!bars || bars.length === 0) return;

    const animate = () => {
      if (!this.hudElement || !this.hudElement.classList.contains('visible')) return;

      if (this.analyser && this.freqDataArray && this.isPlaying) {
        this.analyser.getByteFrequencyData(this.freqDataArray);
        bars.forEach((bar, idx) => {
          const val = this.freqDataArray[idx * 2 + 1] || 0;
          const heightPct = Math.max(15, Math.min(100, (val / 255) * 100));
          bar.style.height = `${heightPct}%`;
        });
      } else {
        bars.forEach(bar => { bar.style.height = '15%'; });
      }

      this.eqAnimFrame = requestAnimationFrame(animate);
    };

    this.eqAnimFrame = requestAnimationFrame(animate);
  }
}

export const radioManager = new RadioManager();
