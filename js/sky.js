import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

export class SkyManager {
  constructor(scene) {
    this.scene = scene;
    this.cloudGroups = [];
    this.windSpeed = 1.6; // m/s wind drift

    this.sunPosition = new THREE.Vector3();
    this.sky = null;
    this.sunSprite = null;
    this.highCloudPlane = null;
    this.highCloudTex = null;
    this.horizonHaze = null;

    this.initSky();
    this.initHorizonHaze();
    this.initSunGlow();
    this.initHighClouds();
    this.initCumulusClouds();
    this.setLightingMode('day');
  }

  initSky() {
    this.sky = new Sky();
    this.sky.scale.setScalar(450000);
    this.scene.add(this.sky);

    const uniforms = this.sky.material.uniforms;
    uniforms['turbidity'].value = 4.2;
    uniforms['rayleigh'].value = 1.15;
    uniforms['mieCoefficient'].value = 0.0035;
    uniforms['mieDirectionalG'].value = 0.78;
  }

  initHorizonHaze() {
    // GTA San Andreas sıcak puslu atmosfer için ufuk çizgisi geçiş silindiri (Keskin sis-gökyüzü ayrımını yumuşatır)
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // Dikey gradyan: Ufukta ve altında yoğun sis rengi, yukarı çıktıkça şeffaflaşarak gökyüzüne erir
    const grad = ctx.createLinearGradient(0, 256, 0, 0);
    grad.addColorStop(0.00, 'rgba(255, 255, 255, 1.0)');
    grad.addColorStop(0.35, 'rgba(255, 255, 255, 0.96)');
    grad.addColorStop(0.55, 'rgba(255, 255, 255, 0.60)');
    grad.addColorStop(0.78, 'rgba(255, 255, 255, 0.18)');
    grad.addColorStop(1.00, 'rgba(255, 255, 255, 0.0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 256);

    const hazeTex = new THREE.CanvasTexture(canvas);
    const hazeGeo = new THREE.CylinderGeometry(1750, 1750, 480, 48, 1, true);
    const hazeMat = new THREE.MeshBasicMaterial({
      map: hazeTex,
      color: 0xe6d7b0,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      fog: false
    });

    this.horizonHaze = new THREE.Mesh(hazeGeo, hazeMat);
    this.horizonHaze.position.y = 80;
    this.scene.add(this.horizonHaze);
  }

  initSunGlow() {
    // Generate soft cinematic radial sun corona texture
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
    grad.addColorStop(0.15, 'rgba(255, 252, 235, 0.95)');
    grad.addColorStop(0.35, 'rgba(255, 240, 190, 0.6)');
    grad.addColorStop(0.65, 'rgba(255, 215, 130, 0.2)');
    grad.addColorStop(0.85, 'rgba(255, 190, 90, 0.05)');
    grad.addColorStop(1.0, 'rgba(255, 170, 70, 0.0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);

    const sunTex = new THREE.CanvasTexture(canvas);
    const sunMat = new THREE.SpriteMaterial({
      map: sunTex,
      color: 0xffffff,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.sunSprite = new THREE.Sprite(sunMat);
    this.sunSprite.scale.set(85, 85, 1);
    this.scene.add(this.sunSprite);
  }

  initHighClouds() {
    // High-altitude seamless cirrus/stratus haze layer (Y = 180m)
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, 512, 512);

    // Multi-octave organic soft cloudy noise
    const imgData = ctx.createImageData(512, 512);
    const data = imgData.data;

    function noise(x, y) {
      const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
      return s - Math.floor(s);
    }

    function smoothNoise(x, y) {
      const i = Math.floor(x);
      const j = Math.floor(y);
      const fx = x - i;
      const fy = y - j;
      const sx = fx * fx * (3.0 - 2.0 * fx);
      const sy = fy * fy * (3.0 - 2.0 * fy);

      const n00 = noise(i, j);
      const n10 = noise(i + 1, j);
      const n01 = noise(i, j + 1);
      const n11 = noise(i + 1, j + 1);

      const top = n00 + sx * (n10 - n00);
      const btm = n01 + sx * (n11 - n01);
      return top + sy * (btm - top);
    }

    function fbm(x, y) {
      let v = 0.0;
      let amp = 0.5;
      let freq = 1.0;
      for (let o = 0; o < 4; o++) {
        v += smoothNoise(x * freq, y * freq) * amp;
        freq *= 2.1;
        amp *= 0.48;
      }
      return v;
    }

    for (let py = 0; py < 512; py++) {
      for (let px = 0; px < 512; px++) {
        const u = px / 512;
        const v = py / 512;
        // Toroidal coords for seamless tiling
        const nx = Math.cos(u * Math.PI * 2) * 2.5;
        const ny = Math.sin(u * Math.PI * 2) * 2.5;
        const nz = Math.cos(v * Math.PI * 2) * 2.5;
        const nw = Math.sin(v * Math.PI * 2) * 2.5;

        let n = fbm(nx + nz + 10, ny + nw + 10);
        // Soft cloud density thresholding
        n = (n - 0.38) / (0.75 - 0.38);
        n = Math.max(0, Math.min(1, n));
        const alpha = Math.floor(Math.pow(n, 1.8) * 140);

        const idx = (py * 512 + px) * 4;
        data[idx + 0] = 255;
        data[idx + 1] = 255;
        data[idx + 2] = 255;
        data[idx + 3] = alpha;
      }
    }
    ctx.putImageData(imgData, 0, 0);

    this.highCloudTex = new THREE.CanvasTexture(canvas);
    this.highCloudTex.wrapS = THREE.RepeatWrapping;
    this.highCloudTex.wrapT = THREE.RepeatWrapping;
    this.highCloudTex.repeat.set(4, 4);

    const geo = new THREE.PlaneGeometry(1600, 1600);
    const mat = new THREE.MeshBasicMaterial({
      map: this.highCloudTex,
      transparent: true,
      opacity: 0.25,
      depthWrite: false
    });

    this.highCloudPlane = new THREE.Mesh(geo, mat);
    this.highCloudPlane.rotation.x = Math.PI / 2;
    this.highCloudPlane.position.y = 190;
    this.scene.add(this.highCloudPlane);
  }

  initCumulusClouds() {
    // Soft organic gaussian puff alpha texture (NOT cubic/minecraft)
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0.0, 'rgba(255, 255, 255, 0.92)');
    grad.addColorStop(0.35, 'rgba(255, 255, 255, 0.72)');
    grad.addColorStop(0.65, 'rgba(255, 255, 255, 0.32)');
    grad.addColorStop(0.85, 'rgba(255, 255, 255, 0.08)');
    grad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);

    const puffTex = new THREE.CanvasTexture(canvas);

    // Create 12 organic cumulus cloud formations across the sky
    const cloudCount = 12;
    for (let i = 0; i < cloudCount; i++) {
      const group = new THREE.Group();

      const cx = (Math.random() - 0.5) * 600;
      const cy = 35 + Math.random() * 55;
      const cz = (Math.random() - 0.5) * 600;
      group.position.set(cx, cy, cz);

      // Cloud size and volume
      const puffsInCloud = 18 + Math.floor(Math.random() * 12);
      const cloudSpreadX = 50 + Math.random() * 35;
      const cloudSpreadZ = 35 + Math.random() * 30;
      const cloudSpreadY = 14 + Math.random() * 10;

      for (let p = 0; p < puffsInCloud; p++) {
        const mat = new THREE.SpriteMaterial({
          map: puffTex,
          transparent: true,
          opacity: 0.78,
          depthWrite: false
        });

        const sprite = new THREE.Sprite(mat);

        // Position within organic ellipsoidal cluster
        const u = Math.random() * 2 - 1;
        const v = Math.random() * 2 - 1;
        const w = (Math.random() - 0.25) * 2; // lofted on top, slightly flat base

        const px = u * cloudSpreadX;
        const py = w * cloudSpreadY;
        const pz = v * cloudSpreadZ;

        sprite.position.set(px, py, pz);

        // Scale puff naturally (28m - 48m)
        const s = 30 + Math.random() * 18;
        sprite.scale.set(s, s * 0.82, 1);

        // Realistic shading: Top is sunlit warm-white, lower belly has soft sky ambient tint
        if (py < 0) {
          sprite.material.color.set('#f4f7fa');
        } else {
          sprite.material.color.set('#ffffff');
        }

        group.add(sprite);
      }

      this.scene.add(group);
      this.cloudGroups.push({
        group,
        speed: 1.0 + Math.random() * 0.9,
        baseY: cy
      });
    }
  }

  setLightingMode(mode) {
    if (!this.sky) return;

    let elevation = 35;
    let azimuth = 55;
    let turbidity = 3.0;
    let rayleigh = 1.15;
    let sunColor = '#ffffff';
    let sunScale = 70;
    let cloudTopColor = '#ffffff';
    let cloudBellyColor = '#cfdeed';

    if (mode === 'day') {
      elevation = 34;
      azimuth = 52;
      turbidity = 4.2;
      rayleigh = 1.15;
      sunColor = '#ffeecb';
      sunScale = 85;
      cloudTopColor = '#ffffff';
      cloudBellyColor = '#ebd8b2';
      if (this.horizonHaze) {
        this.horizonHaze.material.color.set(0xe6d7b0);
        this.horizonHaze.visible = true;
      }
    } else if (mode === 'sunset') {
      elevation = 4.5;
      azimuth = 68;
      turbidity = 6.0;
      rayleigh = 3.5;
      sunColor = '#ff621e';
      sunScale = 95;
      cloudTopColor = '#ffd29e';
      cloudBellyColor = '#7a556b';
      if (this.horizonHaze) {
        this.horizonHaze.material.color.set(0xe5885e);
        this.horizonHaze.visible = true;
      }
    } else if (mode === 'night') {
      elevation = -12.0; // sun below horizon
      azimuth = 70;
      turbidity = 1.5;
      rayleigh = 0.4;
      sunColor = '#6d8cb0';
      sunScale = 35; // acts as subtle moon
      cloudTopColor = '#415773';
      cloudBellyColor = '#1f2e42';
      if (this.horizonHaze) {
        this.horizonHaze.material.color.set(0x0e1524);
        this.horizonHaze.visible = true;
      }
    }

    const uniforms = this.sky.material.uniforms;
    uniforms['turbidity'].value = turbidity;
    uniforms['rayleigh'].value = rayleigh;

    const phi = THREE.MathUtils.degToRad(90 - elevation);
    const theta = THREE.MathUtils.degToRad(azimuth);
    this.sunPosition.setFromSphericalCoords(1, phi, theta);
    uniforms['sunPosition'].value.copy(this.sunPosition);

    // Position sun visual glow
    if (this.sunSprite) {
      this.sunSprite.position.copy(this.sunPosition).multiplyScalar(420);
      this.sunSprite.scale.set(sunScale, sunScale, 1);
      this.sunSprite.material.color.set(sunColor);
      this.sunSprite.visible = (mode !== 'night');
    }

    // Tint clouds naturally to match time of day
    this.cloudGroups.forEach(cg => {
      cg.group.children.forEach(sprite => {
        if (sprite.position.y < 0) {
          sprite.material.color.set(cloudBellyColor);
        } else {
          sprite.material.color.set(cloudTopColor);
        }
      });
    });

    if (this.highCloudPlane) {
      if (mode === 'sunset') {
        this.highCloudPlane.material.color.set('#ffb892');
      } else if (mode === 'night') {
        this.highCloudPlane.material.color.set('#24334a');
      } else {
        this.highCloudPlane.material.color.set('#ffffff');
      }
    }

    return this.sunPosition;
  }

  update(delta, cameraPos) {
    // Horizon haze keeps centered with the camera in horizontal plane
    if (cameraPos && this.horizonHaze) {
      this.horizonHaze.position.x = cameraPos.x;
      this.horizonHaze.position.z = cameraPos.z;
    }

    // Slowly drift high-altitude cloud texture
    if (this.highCloudTex) {
      this.highCloudTex.offset.x += delta * 0.0007;
      this.highCloudTex.offset.y += delta * 0.0003;
    }

    // Drift 3D cumulus cloud clusters with continuous seamless wrapping
    for (let i = 0; i < this.cloudGroups.length; i++) {
      const cg = this.cloudGroups[i];
      cg.group.position.x += cg.speed * delta * this.windSpeed;

      // Wrap boundary
      if (cg.group.position.x > 360) {
        cg.group.position.x = -360;
        cg.group.position.z = (Math.random() - 0.5) * 650;
      }
    }
  }
}
