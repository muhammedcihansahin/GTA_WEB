/**
 * PoliceManager - GTA San Andreas Tarzı Polis Takip ve Devriye Sistemi
 * ADIM 1: Minecraft Tarzı Kutu Modellerin Kaldırılması & Gerçekçi GLB LSPD Polis Cruiser Entegrasyonu
 * ADIM 12: LSPD Helikopteri (Police Maverick), Yol Barikatları & Çivi Tuzakları (Spike Strips),
 * Taktik Kuşatma (PIT Manevrası) ve 3D Siren Sesleri Entegrasyonu.
 */
import * as THREE from 'three';
import { gameState } from './GameStateManager.js';
import { wantedManager } from './WantedManager.js';
import { PoliceHelicopter } from './PoliceHelicopter.js';
import { RoadblockManager } from './RoadblockManager.js';
import { pedestrianAudio } from '../pedestrian/PedestrianAudio.js';
import { assetManager } from '../assets/AssetManager.js';

export class PoliceVehicle {
  static policeTemplate = null;

  static setTemplate(template) {
    PoliceVehicle.policeTemplate = template;
  }

  constructor(scene, collisionManager) {
    this.scene = scene;
    this.collisionManager = collisionManager;
    this.mesh = this.createPoliceMesh();
    this.root = this.mesh;
    this.isEmergency = true;
    this.type = 'police';
    this.scene.add(this.mesh);

    this.active = false;
    this.speed = 0;
    this.maxSpeed = 17.5; // m/s (~63 km/h)
    this.position = new THREE.Vector3();
    this.heading = 0;
    this.sirenTimer = 0;
    this.sirenAudioTimer = Math.random() * 0.8; // Araçların ses senkronizasyonunu dağıt

    this.mesh.visible = false;
  }

  /**
   * GLB Şablonu Geldiğinde Gövdeyi Günceller
   */
  applyPoliceTemplate(template) {
    if (!template || !this.mesh) return;
    
    // Eski GLB veya geçici gövdeyi kaldır
    const oldGlb = this.mesh.getObjectByName('Police_GLB_Body');
    if (oldGlb) this.mesh.remove(oldGlb);

    const glb = this.buildGlbBody(template);
    if (glb) {
      this.mesh.add(glb);
    }
  }

  buildGlbBody(sourceScene) {
    if (!sourceScene) return null;
    const cloned = sourceScene.clone(true);
    cloned.name = 'Police_GLB_Body';

    // Malzemeleri izole et ve LSPD Siyah-Beyaz polis renk paletine uyarla
    cloned.traverse(child => {
      if (child.isMesh && child.material) {
        if (Array.isArray(child.material)) {
          child.material = child.material.map(m => (m ? m.clone() : m));
        } else {
          child.material = child.material.clone();
        }

        const matName = (child.material.name || '').toLowerCase();
        const nodeName = (child.name || '').toLowerCase();

        const isWheel = nodeName.includes('wheel') || nodeName.includes('tire') || nodeName.includes('rim');
        const isGlass = nodeName.includes('glass') || nodeName.includes('window') || matName.includes('glass');
        const isLight = nodeName.includes('light') || nodeName.includes('lamp');

        // Kapı veya tavan panelleri
        const isRoofOrDoor = nodeName.includes('roof') || nodeName.includes('door') || matName.includes('roof');

        if (!isWheel && !isGlass && !isLight && child.material.color) {
          if (isRoofOrDoor) {
            child.material.color.setHex(0xf0f0f0); // LSPD Tepe / Kapı Beyazı
          } else {
            child.material.color.setHex(0x111111); // LSPD Parlak Siyah Şasi
          }
          if (child.material.roughness !== undefined) child.material.roughness = 0.35;
          if (child.material.metalness !== undefined) child.material.metalness = 0.50;
        }
      }
    });

    return cloned;
  }

  createPoliceMesh() {
    const group = new THREE.Group();
    group.name = 'PoliceVehicle';

    let roofY = 1.35;
    let roofZ = -0.15;

    // 1. GLB Şablonundan Gövde
    if (PoliceVehicle.policeTemplate) {
      const glb = this.buildGlbBody(PoliceVehicle.policeTemplate);
      if (glb) group.add(glb);

      glb.updateMatrixWorld(true);
      const bbox = new THREE.Box3().setFromObject(glb);
      if (!bbox.isEmpty()) {
        roofY = Math.max(1.15, bbox.max.y - 0.05);
        roofZ = (bbox.min.z + bbox.max.z) * 0.5;
      }
    }

    // 2. Aerodinamik LSPD Polis Flaşör Çubuğu (Lightbar)
    const lightbarGroup = new THREE.Group();
    lightbarGroup.name = 'Police_Lightbar';
    lightbarGroup.position.set(0, roofY, roofZ);

    // Taban Braketi
    const barMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });
    const barGeom = new THREE.CylinderGeometry(0.035, 0.035, 1.15, 8);
    barGeom.rotateZ(Math.PI / 2);
    const bar = new THREE.Mesh(barGeom, barMat);
    bar.position.y = 0.02;
    lightbarGroup.add(bar);

    // Şeffaf Polikarbon Dış Muhafaza Lens
    const lensMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transmission: 0.85,
      opacity: 0.90,
      transparent: true,
      roughness: 0.15,
      metalness: 0.1,
      ior: 1.48
    });
    const lensGeom = new THREE.CylinderGeometry(0.08, 0.08, 1.18, 16);
    lensGeom.rotateZ(Math.PI / 2);
    const lensMesh = new THREE.Mesh(lensGeom, lensMat);
    lensMesh.position.y = 0.08;
    lightbarGroup.add(lensMesh);

    // Mavi Işık (Sol Bölme)
    const blueMat = new THREE.MeshStandardMaterial({
      color: 0x0055ff,
      emissive: 0x000000,
      roughness: 0.2
    });
    const blueGeom = new THREE.CylinderGeometry(0.065, 0.065, 0.45, 12);
    blueGeom.rotateZ(Math.PI / 2);
    this.blueLight = new THREE.Mesh(blueGeom, blueMat);
    this.blueLight.position.set(-0.30, 0.08, 0);
    lightbarGroup.add(this.blueLight);

    // Kırmızı Işık (Sağ Bölme)
    const redMat = new THREE.MeshStandardMaterial({
      color: 0xff1111,
      emissive: 0x000000,
      roughness: 0.2
    });
    const redGeom = new THREE.CylinderGeometry(0.065, 0.065, 0.45, 12);
    redGeom.rotateZ(Math.PI / 2);
    this.redLight = new THREE.Mesh(redGeom, redMat);
    this.redLight.position.set(0.30, 0.08, 0);
    lightbarGroup.add(this.redLight);

    // Zemin ve Çevre Aydınlatan Dinamik PointLight'lar
    this.bluePointLight = new THREE.PointLight(0x0066ff, 0, 18, 1.8);
    this.bluePointLight.position.set(-0.6, 0.2, 0);
    lightbarGroup.add(this.bluePointLight);

    this.redPointLight = new THREE.PointLight(0xff0022, 0, 18, 1.8);
    this.redPointLight.position.set(0.6, 0.2, 0);
    lightbarGroup.add(this.redPointLight);

    group.add(lightbarGroup);

    return group;
  }

  spawn(x, z, targetHeading = 0) {
    this.position.set(x, 0, z);
    this.heading = targetHeading;
    this.speed = 4.0;
    this.active = true;
    this.mesh.visible = true;
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.heading;
  }

  deactivate() {
    this.active = false;
    this.mesh.visible = false;
    if (this.bluePointLight) this.bluePointLight.intensity = 0;
    if (this.redPointLight) this.redPointLight.intensity = 0;
  }

  update(delta, playerPos, playerInVehicle = false, activeVehicle = null) {
    if (!this.active) return;

    // 1. Siren Tepe Lambası Animasyonu (Mavi / Kırmızı alternatif flaş + PointLight)
    this.sirenTimer += delta * 8.5;
    const flashState = Math.sin(this.sirenTimer) > 0;

    if (this.blueLight && this.blueLight.material) {
      this.blueLight.material.color.setHex(flashState ? 0x0088ff : 0x001133);
      if (this.blueLight.material.emissive) {
        this.blueLight.material.emissive.setHex(flashState ? 0x0066ff : 0x000000);
      }
    }
    if (this.redLight && this.redLight.material) {
      this.redLight.material.color.setHex(!flashState ? 0xff2222 : 0x330000);
      if (this.redLight.material.emissive) {
        this.redLight.material.emissive.setHex(!flashState ? 0xff0000 : 0x000000);
      }
    }

    if (this.bluePointLight) this.bluePointLight.intensity = flashState ? 2.5 : 0;
    if (this.redPointLight) this.redPointLight.intensity = !flashState ? 2.5 : 0;

    // 2. 3D Konumsal Siren Sesi (ADIM 12: Yakındayken Yelp, uzaktayken Wail)
    const dx = playerPos.x - this.position.x;
    const dz = playerPos.z - this.position.z;
    const distToPlayer = Math.sqrt(dx * dx + dz * dz);

    this.sirenAudioTimer += delta;
    const isClose = distToPlayer < 24.0;
    const sirenInterval = isClose ? 0.60 : 1.90;
    if (this.sirenAudioTimer >= sirenInterval) {
      this.sirenAudioTimer = 0;
      pedestrianAudio.playPoliceSiren3D(this.position, isClose);
    }

    // 3. Oyuncuya Doğru Sürüş Vektörü & Açısal Takip
    const targetAngle = Math.atan2(dx, dz);
    let diff = targetAngle - this.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;

    // Yumuşak dönüş
    const turnRate = 2.4 * delta;
    this.heading += Math.max(-turnRate, Math.min(turnRate, diff));

    // 4. Mesafe Bazlı Hız Kontrolü & Agresif Takip
    if (distToPlayer > 6.0) {
      this.speed = Math.min(this.maxSpeed, this.speed + 7.5 * delta);
    } else {
      this.speed = Math.max(3.5, this.speed - 3.5 * delta);
    }

    // 5. Taktik Kuşatma & PIT Manevrası (Pursuit Intervention Technique)
    if (playerInVehicle && activeVehicle && distToPlayer < 4.2 && this.speed > 5.5) {
      const ramDir = diff > 0 ? 1 : -1;
      activeVehicle.yawRate += ramDir * 1.5;
      activeVehicle.vLateral += ramDir * 2.2;
    }

    // Kinematik ilerleme
    const moveDist = this.speed * delta;
    this.position.x += Math.sin(this.heading) * moveDist;
    this.position.z += Math.cos(this.heading) * moveDist;

    // Mesh güncellemesi
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.heading;
  }
}

export class PoliceManager {
  constructor(scene, collisionManager) {
    this.scene = scene;
    this.collisionManager = collisionManager;
    this.maxPolice = 3; // 3+ yıldızda 3 polis aracı
    this.pool = [];
    this.arrestTimer = 0;
    this.isBusted = false;

    // ADIM 12: LSPD Polis Helikopteri & Yol Barikatı Yöneticisi
    this.helicopter = new PoliceHelicopter(this.scene);
    this.roadblockManager = new RoadblockManager(this.scene, this.collisionManager);

    this.initPool();
    this.loadGlbPoliceModel();

    window.policeManager = this;
    window.spawnPoliceCarAhead = (dist = 5) => {
      const inactive = this.pool.find(p => !p.active) || this.pool[0];
      if (inactive) {
        const charMgr = window.characterManager;
        if (charMgr) {
          const charPos = charMgr.position;
          const charHeading = charMgr.heading || 0;
          const sx = charPos.x + Math.sin(charHeading) * dist;
          const sz = charPos.z + Math.cos(charHeading) * dist;
          inactive.spawn(sx, sz, charHeading);
          console.log('🚓 [PoliceManager] LSPD Polis Cruiser önünüze yerleştirildi:', inactive);
          return inactive;
        }
      }
    };
  }

  loadGlbPoliceModel() {
    assetManager.loadGLTF('vehicle_mercedes_e50').then(res => {
      if (res && res.scene) {
        PoliceVehicle.setTemplate(res.scene);
        for (const p of this.pool) {
          p.applyPoliceTemplate(res.scene);
        }
        console.log('🚓 [PoliceManager] Mercedes E50 GLB modeli LSPD devriye arabalarına başarıyla uygulandı.');
      }
    }).catch(err => {
      console.warn('[PoliceManager] Polis GLB modeli yüklenirken hata:', err);
    });
  }

  initPool() {
    for (let i = 0; i < this.maxPolice; i++) {
      this.pool.push(new PoliceVehicle(this.scene, this.collisionManager));
    }
  }

  update(delta, playerPos, playerSpeed = 0, playerInVehicle = false, activeVehicle = null) {
    const wantedStars = gameState.state.wanted.stars;
    const activePoliceCount = this.pool.filter(p => p.active).length;

    // İstenen kara polis sayısı: 1 yıldızda 1, 2 yıldızda 2, 3+ yıldızda 3 polis
    let desiredPolice = 0;
    if (wantedStars === 1) desiredPolice = 1;
    else if (wantedStars === 2) desiredPolice = 2;
    else if (wantedStars >= 3) desiredPolice = 3;

    // Kara Araçları Spawn / Despawn
    if (activePoliceCount < desiredPolice) {
      const inactive = this.pool.find(p => !p.active);
      if (inactive) {
        // Oyuncunun 60-80 metre ilerisinde/arkasında spawn et
        const spawnAngle = Math.random() * Math.PI * 2;
        const spawnDist = 65 + Math.random() * 15;
        const sx = playerPos.x + Math.sin(spawnAngle) * spawnDist;
        const sz = playerPos.z + Math.cos(spawnAngle) * spawnDist;
        inactive.spawn(sx, sz, spawnAngle + Math.PI);
      }
    } else if (activePoliceCount > desiredPolice) {
      const toRemove = this.pool.filter(p => p.active);
      for (let i = desiredPolice; i < toRemove.length; i++) {
        toRemove[i].deactivate();
      }
    }

    // Aktif polis araçlarını güncelle
    let nearestDist = Infinity;
    for (const police of this.pool) {
      if (!police.active) continue;

      const dist = police.position.distanceTo(playerPos);
      if (dist < nearestDist) nearestDist = dist;

      // Oyuncudan çok uzaklaştıysa (>140m) respawn için kapat
      if (dist > 150) {
        police.deactivate();
        continue;
      }

      police.update(delta, playerPos, playerInVehicle, activeVehicle);
    }

    // ADIM 12: LSPD Helikopter Orkestrasyonu (3+ Yıldızda Havalanır)
    if (wantedStars >= 3) {
      if (!this.helicopter.active) {
        this.helicopter.spawn(playerPos);
      }
    } else {
      if (this.helicopter.active) {
        this.helicopter.deactivate();
      }
    }

    if (this.helicopter.active) {
      this.helicopter.update(delta, playerPos, playerSpeed);
    }

    // ADIM 12: Yol Barikatları & Çivi Tuzağı Yönetimi
    this.roadblockManager.update(delta, playerPos, activeVehicle, wantedStars);
    if (wantedStars === 0) {
      this.roadblockManager.clearAll();
    }

    // WantedManager'a en yakın polis mesafesini bildir
    wantedManager.update(delta, playerPos, nearestDist);

    // BUSTED (Yakalanma) Kontrolü
    this.checkArrest(delta, nearestDist, playerSpeed);
  }

  checkArrest(delta, nearestDist, playerSpeed) {
    if (gameState.state.wanted.stars > 0 && nearestDist < 4.8 && playerSpeed < 1.5) {
      this.arrestTimer += delta;
      if (this.arrestTimer >= 2.5 && !this.isBusted) {
        this.triggerBusted();
      }
    } else {
      this.arrestTimer = Math.max(0, this.arrestTimer - delta * 1.5);
    }
  }

  triggerBusted() {
    this.isBusted = true;
    this.showBustedScreen();

    // 100$ ceza, aranma sıfırlama, polisleri ve hava desteğini kapatma
    gameState.addMoney(-100);
    wantedManager.clearWanted();

    this.helicopter.deactivate();
    this.roadblockManager.clearAll();

    setTimeout(() => {
      for (const p of this.pool) {
        p.deactivate();
      }
      this.isBusted = false;
      this.hideBustedScreen();
    }, 3500);
  }

  showBustedScreen() {
    let overlay = document.getElementById('busted-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'busted-overlay';
      overlay.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(15, 5, 5, 0.7);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        pointer-events: none;
        animation: fadeInBusted 0.4s ease forwards;
      `;

      const title = document.createElement('div');
      title.textContent = 'BUSTED';
      title.style.cssText = `
        font-family: 'Pricedown', 'Arial Black', sans-serif;
        font-size: 76px;
        color: #d32f2f;
        text-shadow: 0 4px 20px rgba(0,0,0,0.9), 0 0 10px rgba(255,0,0,0.5);
        letter-spacing: 4px;
      `;

      const sub = document.createElement('div');
      sub.textContent = 'Polise Yakalandın! ($100 Ceza Kesildi)';
      sub.style.cssText = `
        font-family: 'ChaletCompania', sans-serif;
        font-size: 22px;
        color: #fff;
        margin-top: 12px;
        letter-spacing: 1px;
      `;

      overlay.appendChild(title);
      overlay.appendChild(sub);
      document.body.appendChild(overlay);
    }
    overlay.style.display = 'flex';
  }

  hideBustedScreen() {
    const overlay = document.getElementById('busted-overlay');
    if (overlay) overlay.style.display = 'none';
  }
}
