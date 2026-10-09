/**
 * EmergencyVehicleFactory.js - 3D GTA San Andreas Tarzı Ambulans & İtfaiye Araçları Fabrikası (ADIM 1)
 * 
 * Özellikler:
 * 1. Gerçekçi 3D GLB Tabanlı Şasi (Asla Minecraft / BoxGeometry kutu model içermez)
 *    - Ambulans: Geniş gövdeli kar beyazı SUV/Van şasisi, koyu camlar
 *    - İtfaiye Aracı: San Andreas itfaiye kırmızısı ağır şasi, krom detaylar
 * 2. Aerodinamik Acil Durum Tepe Flaşörleri (Lightbar):
 *    - Çift bölmeli stroboskopik LED'ler (Sol Kırmızı / Sağ Mavi)
 *    - Gece ve zemin aydınlatan dinamik PointLight çevre ışığı
 *    - 8.5 Hz senkronize Wig-Wag stroboskopik animasyon
 * 3. Tavan Tazyikli Su Topu Tareti (Water Cannon Turret):
 *    - Döner taret tabanı (Azimuth yaw rotasyonu)
 *    - Eğim alabilen nozül kolu (Elevation pitch)
 *    - FirefighterMissionManager su partikülü çıkış noktası (getNozzleWorldPos)
 * 4. Model Önbellekleme & Sıfır Takılma (Zero-Lag):
 *    - GLB şablonlarından klonlama, materyal izolasyonu ve dinamik boyama
 */

import * as THREE from 'three';

export class EmergencyVehicleFactory {
  static ambulanceTemplate = null;
  static fireTruckTemplate = null;

  /**
   * GLB Şablonlarını merkezi olarak önbelleğe alır
   * @param {Object} templates - { ambulance, fireTruck }
   */
  static setTemplates(templates = {}) {
    if (templates.ambulance) {
      this.ambulanceTemplate = templates.ambulance;
    }
    if (templates.fireTruck) {
      this.fireTruckTemplate = templates.fireTruck;
    }
  }

  /**
   * Ambulans 3D Gövde ve Tepe Flaşör Grubunu Oluşturur
   * @param {THREE.Group|null|boolean} customTemplate - Opsiyonel GLB sahnesi veya false
   * @param {boolean} onlyEquipment - Sadece tavan ekipmanı üretilsin mi
   * @returns {THREE.Group}
   */
  static createAmbulanceMesh(customTemplate = null, onlyEquipment = false) {
    const root = new THREE.Group();
    root.name = 'Ambulance_VisualRoot';

    const shouldAttachGlb = !onlyEquipment && customTemplate !== false;
    const tpl = shouldAttachGlb ? (customTemplate || this.ambulanceTemplate) : null;
    let roofY = 1.35;
    let hoodZ = -0.4;

    // 1. Gerçekçi GLB Gövde Entegrasyonu
    if (tpl) {
      const cloned = tpl.clone(true);
      cloned.name = 'Ambulance_GLB_Body';

      // Materyalleri izole et ve ambulans renk paletine uyarla
      cloned.traverse(child => {
        if (child.isMesh && child.material) {
          if (Array.isArray(child.material)) {
            child.material = child.material.map(m => (m ? m.clone() : m));
          } else {
            child.material = child.material.clone();
          }

          const matName = (child.material.name || '').toLowerCase();
          const nodeName = (child.name || '').toLowerCase();

          // Tekerlek, cam ve farlar hariç ana gövdeyi parlak acil beyazına boya
          const isWheel = nodeName.includes('wheel') || nodeName.includes('tire') || nodeName.includes('rim');
          const isGlass = nodeName.includes('glass') || nodeName.includes('window') || matName.includes('glass');
          const isLight = nodeName.includes('light') || nodeName.includes('lamp');

          if (!isWheel && !isGlass && !isLight && child.material.color) {
            child.material.color.setHex(0xf5f5f5); // Kar Beyazı
            if (child.material.roughness !== undefined) child.material.roughness = 0.35;
            if (child.material.metalness !== undefined) child.material.metalness = 0.30;
          }
        }
      });

      root.add(cloned);

      // Model sınırlarını ölç ve tavan yüksekliğini belirle
      cloned.updateMatrixWorld(true);
      const bbox = new THREE.Box3().setFromObject(cloned);
      if (!bbox.isEmpty()) {
        roofY = Math.max(1.20, bbox.max.y - 0.05);
        hoodZ = (bbox.min.z + bbox.max.z) * 0.5 - 0.2;
      }
    }

    // 2. Aerodinamik Acil Durum Tepe Flaşör Barı (Lightbar)
    const lightbarGroup = new THREE.Group();
    lightbarGroup.name = 'Ambulance_Lightbar';
    lightbarGroup.position.set(0, roofY, hoodZ);

    // Aerodinamik Taban Braketi
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x1f2428,
      roughness: 0.7,
      metalness: 0.3
    });
    const baseGeom = new THREE.CylinderGeometry(0.04, 0.04, 1.25, 8);
    baseGeom.rotateZ(Math.PI / 2);
    const baseMesh = new THREE.Mesh(baseGeom, baseMat);
    baseMesh.position.y = 0.02;
    lightbarGroup.add(baseMesh);

    // Şeffaf Polikarbon Dış Muhafaza Lens (Retro GTA Stili)
    const lensMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transmission: 0.88,
      opacity: 0.92,
      transparent: true,
      roughness: 0.12,
      metalness: 0.1,
      ior: 1.48
    });
    const lensGeom = new THREE.CylinderGeometry(0.10, 0.10, 1.28, 16);
    lensGeom.rotateZ(Math.PI / 2);
    const lensMesh = new THREE.Mesh(lensGeom, lensMat);
    lensMesh.position.y = 0.09;
    lightbarGroup.add(lensMesh);

    // Sol Flaşör (Kırmızı LED)
    const redLightMat = new THREE.MeshStandardMaterial({
      color: 0xff1111,
      emissive: 0x000000,
      roughness: 0.2,
      metalness: 0.1
    });
    const redLightGeom = new THREE.CylinderGeometry(0.08, 0.08, 0.50, 12);
    redLightGeom.rotateZ(Math.PI / 2);
    const redLightMesh = new THREE.Mesh(redLightGeom, redLightMat);
    redLightMesh.position.set(-0.35, 0.09, 0);
    lightbarGroup.add(redLightMesh);

    // Sağ Flaşör (Mavi LED)
    const blueLightMat = new THREE.MeshStandardMaterial({
      color: 0x0044ff,
      emissive: 0x000000,
      roughness: 0.2,
      metalness: 0.1
    });
    const blueLightGeom = new THREE.CylinderGeometry(0.08, 0.08, 0.50, 12);
    blueLightGeom.rotateZ(Math.PI / 2);
    const blueLightMesh = new THREE.Mesh(blueLightGeom, blueLightMat);
    blueLightMesh.position.set(0.35, 0.09, 0);
    lightbarGroup.add(blueLightMesh);

    // Dinamik Zemin & Çevre Aydınlatma PointLight'ları
    const strobeLightRed = new THREE.PointLight(0xff0022, 0, 20, 1.8);
    strobeLightRed.position.set(-0.8, 0.2, 0);
    lightbarGroup.add(strobeLightRed);

    const strobeLightBlue = new THREE.PointLight(0x0066ff, 0, 20, 1.8);
    strobeLightBlue.position.set(0.8, 0.2, 0);
    lightbarGroup.add(strobeLightBlue);

    root.add(lightbarGroup);

    // Kolay erişim userData referansları (Mevcut oyun döngüsüyle %100 uyumlu)
    root.userData = {
      isEmergencyVehicle: true,
      vehicleType: 'ambulance',
      lightbarGroup: lightbarGroup,
      redMat: redLightMat,
      blueMat: blueLightMat,
      strobeRed: strobeLightRed,
      strobeBlue: strobeLightBlue,
      sirenActive: false,
      strobeTimer: 0,
      updateSirens: (dt, isSirenOn) => {
        if (!isSirenOn) {
          redLightMat.emissive.setHex(0x000000);
          blueLightMat.emissive.setHex(0x000000);
          strobeLightRed.intensity = 0;
          strobeLightBlue.intensity = 0;
          return;
        }

        root.userData.strobeTimer += dt * 8.5; // ~8.5 Hz wig-wag nabız
        const phase = Math.floor(root.userData.strobeTimer) % 2;

        if (phase === 0) {
          redLightMat.emissive.setHex(0xff0000);
          blueLightMat.emissive.setHex(0x000000);
          strobeLightRed.intensity = 2.8;
          strobeLightBlue.intensity = 0;
        } else {
          redLightMat.emissive.setHex(0x000000);
          blueLightMat.emissive.setHex(0x0044ff);
          strobeLightRed.intensity = 0;
          strobeLightBlue.intensity = 2.8;
        }
      }
    };

    return root;
  }

  /**
   * İtfaiye Aracı 3D Gövde, Taret ve Su Topunu Oluşturur
   * @param {THREE.Group|null|boolean} customTemplate - Opsiyonel GLB sahnesi veya false
   * @param {boolean} onlyEquipment - Sadece tavan ekipmanı üretilsin mi
   * @returns {THREE.Group}
   */
  static createFireTruckMesh(customTemplate = null, onlyEquipment = false) {
    const root = new THREE.Group();
    root.name = 'FireTruck_VisualRoot';

    const shouldAttachGlb = !onlyEquipment && customTemplate !== false;
    const tpl = shouldAttachGlb ? (customTemplate || this.fireTruckTemplate) : null;
    let roofY = 1.45;
    let hoodZ = -0.3;

    // 1. Gerçekçi GLB Gövde Entegrasyonu
    if (tpl) {
      const cloned = tpl.clone(true);
      cloned.name = 'FireTruck_GLB_Body';

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

          if (!isWheel && !isGlass && !isLight && child.material.color) {
            child.material.color.setHex(0xb71c1c); // San Andreas İtfaiye Kırmızısı
            if (child.material.roughness !== undefined) child.material.roughness = 0.32;
            if (child.material.metalness !== undefined) child.material.metalness = 0.40;
          }
        }
      });

      root.add(cloned);

      cloned.updateMatrixWorld(true);
      const bbox = new THREE.Box3().setFromObject(cloned);
      if (!bbox.isEmpty()) {
        roofY = Math.max(1.30, bbox.max.y - 0.05);
        hoodZ = (bbox.min.z + bbox.max.z) * 0.5 - 0.3;
      }
    }

    // Krom Malzeme (Taret & Ekipmanlar için)
    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xdddddd,
      metalness: 0.92,
      roughness: 0.15
    });

    const darkTrimMat = new THREE.MeshStandardMaterial({
      color: 0x222222,
      roughness: 0.75
    });

    // 2. Tavan Tazyikli Su Topu Tareti (Water Cannon Turret)
    const cannonTurretGroup = new THREE.Group();
    cannonTurretGroup.name = 'WaterCannon_Turret';
    cannonTurretGroup.position.set(0, roofY + 0.08, hoodZ - 0.45); // Kabin tavanında

    // Taret Taban Pivotu
    const turretBaseGeom = new THREE.CylinderGeometry(0.22, 0.26, 0.16, 16);
    const turretBase = new THREE.Mesh(turretBaseGeom, chromeMat);
    turretBase.position.y = 0.08;
    cannonTurretGroup.add(turretBase);

    // Su Nozülü Eğilebilir Gövdesi (Pitch Mafsalı)
    const nozzleGroup = new THREE.Group();
    nozzleGroup.name = 'WaterCannon_NozzleGroup';
    nozzleGroup.position.set(0, 0.20, 0);

    const cannonBarrelGeom = new THREE.CylinderGeometry(0.06, 0.09, 0.85, 16);
    cannonBarrelGeom.rotateX(Math.PI / 2); // İleri bakar
    const barrelMesh = new THREE.Mesh(cannonBarrelGeom, chromeMat);
    barrelMesh.position.set(0, 0, -0.40);
    nozzleGroup.add(barrelMesh);

    // Nozul Ucu (Su Fışkırma Noktası)
    const tipGeom = new THREE.CylinderGeometry(0.045, 0.065, 0.16, 16);
    tipGeom.rotateX(Math.PI / 2);
    const tipMesh = new THREE.Mesh(tipGeom, darkTrimMat);
    tipMesh.position.set(0, 0, -0.86);
    nozzleGroup.add(tipMesh);

    cannonTurretGroup.add(nozzleGroup);
    root.add(cannonTurretGroup);

    // 3. Tepe Acil Flaşörleri (Wig-Wag Stroboskop)
    const lightbarGroup = new THREE.Group();
    lightbarGroup.name = 'FireTruck_Lightbar';
    lightbarGroup.position.set(0, roofY + 0.06, hoodZ + 0.35);

    const fRedGeom = new THREE.CylinderGeometry(0.14, 0.16, 0.16, 16);
    const fRedMat = new THREE.MeshStandardMaterial({
      color: 0xff0000,
      emissive: 0x000000,
      roughness: 0.2
    });
    const fRed = new THREE.Mesh(fRedGeom, fRedMat);
    fRed.position.set(-0.65, 0.08, 0);
    lightbarGroup.add(fRed);

    const fBlueGeom = new THREE.CylinderGeometry(0.14, 0.16, 0.16, 16);
    const fBlueMat = new THREE.MeshStandardMaterial({
      color: 0x0044ff,
      emissive: 0x000000,
      roughness: 0.2
    });
    const fBlue = new THREE.Mesh(fBlueGeom, fBlueMat);
    fBlue.position.set(0.65, 0.08, 0);
    lightbarGroup.add(fBlue);

    // Çevre Aydınlatması PointLight'ları
    const strobeRed = new THREE.PointLight(0xff0022, 0, 22, 1.8);
    strobeRed.position.set(-0.65, 0.25, 0);
    lightbarGroup.add(strobeRed);

    const strobeBlue = new THREE.PointLight(0x0066ff, 0, 22, 1.8);
    strobeBlue.position.set(0.65, 0.25, 0);
    lightbarGroup.add(strobeBlue);

    root.add(lightbarGroup);

    // Kolay erişim userData referansları (FirefighterMissionManager ve Vehicle uyumlu)
    root.userData = {
      isEmergencyVehicle: true,
      vehicleType: 'fire_truck',
      turretGroup: cannonTurretGroup,
      nozzleGroup: nozzleGroup,
      tipMesh: tipMesh,
      redMat: fRedMat,
      blueMat: fBlueMat,
      strobeRed: strobeRed,
      strobeBlue: strobeBlue,
      sirenActive: false,
      strobeTimer: 0,
      getNozzleWorldPos: (outVec = new THREE.Vector3()) => {
        tipMesh.getWorldPosition(outVec);
        return outVec;
      },
      updateSirens: (dt, isSirenOn) => {
        if (!isSirenOn) {
          fRedMat.emissive.setHex(0x000000);
          fBlueMat.emissive.setHex(0x000000);
          strobeRed.intensity = 0;
          strobeBlue.intensity = 0;
          return;
        }

        root.userData.strobeTimer += dt * 8.0;
        const phase = Math.floor(root.userData.strobeTimer) % 2;

        if (phase === 0) {
          fRedMat.emissive.setHex(0xff0000);
          fBlueMat.emissive.setHex(0x000000);
          strobeRed.intensity = 3.2;
          strobeBlue.intensity = 0;
        } else {
          fRedMat.emissive.setHex(0x000000);
          fBlueMat.emissive.setHex(0x0044ff);
          strobeRed.intensity = 0;
          strobeBlue.intensity = 3.2;
        }
      }
    };

    return root;
  }
}
