import * as THREE from 'three';

// Modül seviyesinde preallocated yardımcı değişkenler (Sıfır GC tahsisi için)
const _box = new THREE.Box3();
const _center = new THREE.Vector3();
const _size = new THREE.Vector3();
const _worldPos = new THREE.Vector3();
const _localPos = new THREE.Vector3();
const _invParentMat = new THREE.Matrix4();
const _nodeCenter = new THREE.Vector3();
const _nodeSize = new THREE.Vector3();

/**
 * GLB model kök düğümünden 4 tekerlek için bağımsız pivot rig'i oluşturur.
 * 
 * @param {THREE.Object3D} root - Aracın ana sahne/grup kökü (Chassis veya ModelRoot)
 * @param {Object} options - Yapılandırma seçenekleri
 * @param {1|-1} [options.frontSign] - Ön yön çarpanı (+1 veya -1). Belirtilmezse otomatik tahmin edilir.
 * @param {'x'|'z'} [options.lengthAxis] - Aracın uzunluk ekseni ('z' veya 'x'). Belirtilmezse otomatik tespit edilir.
 * @param {number} [options.rollSign=1] - Yuvarlanma yön çarpanı (1 veya -1)
 * @param {number} [options.steerSign=1] - Direksiyon yön çarpanı (1 veya -1)
 * @param {boolean} [options.useGeometryFallback=true] - İsim eşleşmezse 4 köşe geometrik analizini çalıştır
 * @param {boolean} [options.createFallbackVisuals=false] - Ayrı mesh yoksa görünür debug silindir tekerlekler ekle
 * @param {number} [options.fallbackRadius=0.32] - Fallback tekerlek yarıçapı
 * @param {number} [options.fallbackWidth=0.22] - Fallback tekerlek genişliği
 * @returns {{
 *   pivots: { FL: THREE.Object3D, FR: THREE.Object3D, RL: THREE.Object3D, RR: THREE.Object3D },
 *   forwardDir: THREE.Vector3,
 *   leftDir: THREE.Vector3,
 *   lengthAxis: 'x'|'z',
 *   frontSign: 1|-1,
 *   averageRadius: number,
 *   wheelBase: number,
 *   trackWidth: number,
 *   rollSign: number,
 *   steerSign: number
 * }}
 */
export function buildWheelRig(root, options = {}) {
  // 1. Önceki tekerlek rig pivotları varsa temizle (Çift rig oluşmasını engelle)
  cleanExistingWheelRig(root);

  // Model dünya matrisini güncelle ve genel boyutları hesapla
  root.updateMatrixWorld(true);
  _box.setFromObject(root);
  _box.getSize(_size);
  _box.getCenter(_center);

  // 2. Boyut analizi: Uzunluk ekseni ve genişlik ekseni tespiti
  const lengthAxis = options.lengthAxis || (_size.z >= _size.x ? 'z' : 'x');
  const widthAxis = lengthAxis === 'z' ? 'x' : 'z';

  // Ön yön işareti (Three.js varsayılanında ileri yön -Z'dir, frontSign = -1)
  const frontSign = options.frontSign !== undefined ? options.frontSign : (lengthAxis === 'z' ? -1 : 1);
  const rollSign = options.rollSign !== undefined ? options.rollSign : 1;
  const steerSign = options.steerSign !== undefined ? options.steerSign : 1;
  const useGeometryFallback = options.useGeometryFallback !== undefined ? options.useGeometryFallback : true;
  const createFallbackVisuals = !!options.createFallbackVisuals;
  const fallbackRadius = options.fallbackRadius || 0.32;
  const fallbackWidth = options.fallbackWidth || 0.22;

  // Aracın yön vektörleri
  const forwardDir = new THREE.Vector3();
  forwardDir[lengthAxis] = frontSign;

  const leftDir = new THREE.Vector3();
  leftDir[widthAxis] = lengthAxis === 'z' ? -1 : 1;

  // 3. Tekerlek Adaylarını İsim Pattern'leriyle Tara
  const namePatterns = {
    FL: /(wheel.*(fl|front.*l|l.*front|w1|left.*front))|(^(fl|f_l)_wheel)|(wheel_lf)|(tire.*fl)|(rotor.*lf)|(\bw1\b)|(sol.*[oö]n)|([oö]n.*sol)/i,
    FR: /(wheel.*(fr|front.*r|r.*front|w2|right.*front))|(^(fr|f_r)_wheel)|(wheel_rf)|(tire.*fr)|(rotor.*rf)|(\bw2\b)|(sa[gğ].*[oö]n)|([oö]n.*sa[gğ])/i,
    RL: /(wheel.*(rl|bl|rear.*l|back.*l|l.*rear|w3|left.*rear|left.*back))|(^(rl|r_l|bl|b_l)_wheel)|(wheel_lr)|(wheel_lb)|(tire.*(rl|bl))|(rotor.*(lr|bl))|(\bw3\b)|(sol.*arka)|(arka.*sol)/i,
    RR: /(wheel.*(rr|br|rear.*r|back.*r|r.*rear|w4|right.*rear|right.*back))|(^(rr|r_r|br|b_r)_wheel)|(wheel_rr)|(wheel_rb)|(tire.*(rr|br))|(rotor.*(rr|br))|(\bw4\b)|(sa[gğ].*arka)|(arka.*sa[gğ])/i
  };

  const genericWheelRegex = /(wheel|tire|tyre|rim|rotor|velg|hub|jant|teker|lastik|\bw[1-4]\b)/i;
  const excludeRegex = /(steering|cockpit|interior|seat|wiper|mirror|dash|pedal|column|exhaust|engine|glass|light|chassis|body)/i;

  const detectedMeshes = {
    FL: [],
    FR: [],
    RL: [],
    RR: []
  };

  const genericCandidates = [];

  root.traverse((node) => {
    if (!node || node === root) return;
    const name = node.name || '';
    if (excludeRegex.test(name)) return;

    let matchedExact = false;
    for (const [key, pattern] of Object.entries(namePatterns)) {
      if (pattern.test(name)) {
        detectedMeshes[key].push(node);
        matchedExact = true;
        break;
      }
    }

    // İsim veya materyal bazlı genel tekerlek aday havuzu
    const hasWheelMaterial = node.material && (() => {
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      return mats.some(m => /(tire|tyre|rim|rotor|wheel_black|outer_rim|inner_rim)/i.test(m.name || ''));
    })();

    if (!matchedExact && (genericWheelRegex.test(name) || hasWheelMaterial || (node.isMesh && name.length > 0))) {
      genericCandidates.push(node);
    }
  });

  // Eğer doğrudan isimle 4 tekerleğin hepsi bulunamadıysa (örn. tüm tekerleklere aynı isim verilmişse veya isimler Object_X ise)
  const foundExactCount = ['FL', 'FR', 'RL', 'RR'].filter(pos => detectedMeshes[pos].length > 0).length;

  if (foundExactCount < 4 && useGeometryFallback) {
    // Aday havuzunu hazırla:
    // Eğer tekerlek adayı olan üst grup düğümleri varsa onları al
    let candidatePool = genericCandidates.slice();

    if (candidatePool.length < 4) {
      root.traverse((child) => {
        if (child.isMesh && !excludeRegex.test(child.name || '')) {
          _box.setFromObject(child);
          _box.getCenter(_nodeCenter);
          // Tekerlekler genelde aracın alt yarısındadır
          if (_nodeCenter.y <= _center.y + _size.y * 0.2) {
            candidatePool.push(child);
          }
        }
      });
    }

    // Birbirinin alt düğümü olan adayları filtrele (en üst bağımsız düğümleri al)
    const topCandidates = candidatePool.filter(node => {
      let p = node.parent;
      while (p && p !== root) {
        if (candidatePool.includes(p)) return false;
        p = p.parent;
      }
      return true;
    });

    const spatialPool = [];
    for (const node of topCandidates) {
      node.updateMatrixWorld(true);
      _box.setFromObject(node);
      const c = new THREE.Vector3();
      _box.getCenter(c);
      const s = new THREE.Vector3();
      _box.getSize(s);

      spatialPool.push({
        node,
        center: c,
        radius: Math.max(s.y, lengthAxis === 'z' ? s.z : s.x) * 0.5
      });
    }

    if (spatialPool.length >= 4) {
      // 4 Köşe Hedef Noktalarını Belirle
      const halfL = _size[lengthAxis] * 0.36;
      const halfW = _size[widthAxis] * 0.40;
      const groundY = _box.min.y + Math.min(_size.y * 0.35, fallbackRadius);

      const cornerTargets = {
        FL: new THREE.Vector3(),
        FR: new THREE.Vector3(),
        RL: new THREE.Vector3(),
        RR: new THREE.Vector3()
      };

      cornerTargets.FL[lengthAxis] = _center[lengthAxis] + frontSign * halfL;
      cornerTargets.FL[widthAxis] = _center[widthAxis] - halfW;
      cornerTargets.FL.y = groundY;

      cornerTargets.FR[lengthAxis] = _center[lengthAxis] + frontSign * halfL;
      cornerTargets.FR[widthAxis] = _center[widthAxis] + halfW;
      cornerTargets.FR.y = groundY;

      cornerTargets.RL[lengthAxis] = _center[lengthAxis] - frontSign * halfL;
      cornerTargets.RL[widthAxis] = _center[widthAxis] - halfW;
      cornerTargets.RL.y = groundY;

      cornerTargets.RR[lengthAxis] = _center[lengthAxis] - frontSign * halfL;
      cornerTargets.RR[widthAxis] = _center[widthAxis] + halfW;
      cornerTargets.RR.y = groundY;

      // Eğer önceki isim eşleşmesi hatalı veya eksikse (örn. tüm 4 tekerlek FL'ye atanmışsa) temizle
      if (foundExactCount <= 1) {
        for (const pos of ['FL', 'FR', 'RL', 'RR']) {
          detectedMeshes[pos] = [];
        }
      }

      const usedNodes = new Set();
      for (const pos of ['FL', 'FR', 'RL', 'RR']) {
        for (const n of detectedMeshes[pos]) {
          usedNodes.add(n);
        }
      }

      const missingPositions = ['FL', 'FR', 'RL', 'RR'].filter(pos => detectedMeshes[pos].length === 0);

      for (const pos of missingPositions) {
        const target = cornerTargets[pos];
        let bestItem = null;
        let minDst = Infinity;

        for (const item of spatialPool) {
          if (usedNodes.has(item.node)) continue;
          const d = target.distanceTo(item.center);
          if (d < minDst) {
            minDst = d;
            bestItem = item;
          }
        }

        if (bestItem && minDst < Math.max(_size.x, _size.z) * 0.6) {
          detectedMeshes[pos].push(bestItem.node);
          usedNodes.add(bestItem.node);
        }
      }
    }
  }

  // 5. Standart Pivotları Üret ve Tekerlekleri Reparent Et
  const pivotNames = {
    FL: 'Wheel_FL_Pivot',
    FR: 'Wheel_FR_Pivot',
    RL: 'Wheel_RL_Pivot',
    RR: 'Wheel_RR_Pivot'
  };

  const pivots = {
    FL: null,
    FR: null,
    RL: null,
    RR: null
  };

  let totalRadius = 0;
  let radiusSamples = 0;

  // Fallback köşe ofsetleri (hiç tekerlek mesh'i bulunamazsa)
  const defaultCornerOffsets = {
    FL: new THREE.Vector3(-_size[widthAxis] * 0.42, fallbackRadius, frontSign * _size[lengthAxis] * 0.36),
    FR: new THREE.Vector3(_size[widthAxis] * 0.42, fallbackRadius, frontSign * _size[lengthAxis] * 0.36),
    RL: new THREE.Vector3(-_size[widthAxis] * 0.42, fallbackRadius, -frontSign * _size[lengthAxis] * 0.36),
    RR: new THREE.Vector3(_size[widthAxis] * 0.42, fallbackRadius, -frontSign * _size[lengthAxis] * 0.36)
  };

  for (const pos of ['FL', 'FR', 'RL', 'RR']) {
    const pivot = new THREE.Group();
    pivot.name = pivotNames[pos];
    pivot.matrixAutoUpdate = true;

    const nodes = detectedMeshes[pos];

    if (nodes && nodes.length > 0) {
      _box.makeEmpty();
      for (const n of nodes) {
        n.updateMatrixWorld(true);
        _box.expandByObject(n);
      }
      _box.getCenter(_worldPos);
      _box.getSize(_nodeSize);

      const estimatedR = Math.max(_nodeSize.y, lengthAxis === 'z' ? _nodeSize.z : _nodeSize.x) * 0.5;
      if (estimatedR > 0.08 && estimatedR < 2.0) {
        totalRadius += estimatedR;
        radiusSamples++;
      }

      root.updateMatrixWorld(true);
      _invParentMat.copy(root.matrixWorld).invert();
      _localPos.copy(_worldPos).applyMatrix4(_invParentMat);
      pivot.position.copy(_localPos);
      root.add(pivot);

      for (const n of nodes) {
        pivot.attach(n);
      }
    } else {
      root.updateMatrixWorld(true);
      pivot.position.copy(defaultCornerOffsets[pos]);
      root.add(pivot);

      if (createFallbackVisuals) {
        const cylinderGeo = new THREE.CylinderGeometry(fallbackRadius, fallbackRadius, fallbackWidth, 24);
        cylinderGeo.rotateZ(Math.PI / 2);
        const wheelMat = new THREE.MeshStandardMaterial({
          color: 0x222222,
          roughness: 0.85,
          metalness: 0.1
        });
        const debugMesh = new THREE.Mesh(cylinderGeo, wheelMat);
        debugMesh.name = `Fallback_${pivotNames[pos]}_Visual`;
        debugMesh.castShadow = true;
        debugMesh.receiveShadow = true;
        pivot.add(debugMesh);
      }
    }

    // Başlangıç yönelimini baseQuat olarak sakla
    pivot.updateMatrixWorld(true);
    pivot.userData.baseQuat = pivot.quaternion.clone();
    pivot.userData.isWheelPivot = true;
    pivot.userData.wheelPosition = pos;

    pivots[pos] = pivot;
  }

  // 6. Geometrik Metrikleri Hesapla
  const avgRadius = radiusSamples > 0 ? totalRadius / radiusSamples : fallbackRadius;
  const pFL = pivots.FL.position;
  const pFR = pivots.FR.position;
  const pRL = pivots.RL.position;

  const wheelBase = Math.abs(pFL[lengthAxis] - pRL[lengthAxis]) || (_size[lengthAxis] * 0.72);
  const trackWidth = Math.abs(pFL[widthAxis] - pFR[widthAxis]) || (_size[widthAxis] * 0.84);

  return {
    pivots,
    forwardDir,
    leftDir,
    lengthAxis,
    frontSign,
    averageRadius: avgRadius,
    wheelBase,
    trackWidth,
    rollSign,
    steerSign
  };
}

/**
 * Modelde önceden oluşturulmuş wheel pivotları varsa çocuklarını ana köke iade edip pivotları temizler.
 * @param {THREE.Object3D} root 
 */
function cleanExistingWheelRig(root) {
  const pivotNames = ['Wheel_FL_Pivot', 'Wheel_FR_Pivot', 'Wheel_RL_Pivot', 'Wheel_RR_Pivot'];
  for (const name of pivotNames) {
    const oldPivot = root.getObjectByName(name);
    if (oldPivot && oldPivot.parent) {
      const parent = oldPivot.parent;
      while (oldPivot.children.length > 0) {
        const child = oldPivot.children[0];
        parent.attach(child);
      }
      parent.remove(oldPivot);
    }
  }
}
