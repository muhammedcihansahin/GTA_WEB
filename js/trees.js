import * as THREE from 'three';

/**
 * Fotogerçekçi Prosedürel Ağaç Üreteci
 * Çeşitli türlerde (Meşe, Huş, Çam, Kiraz, Akçaağaç, Palmiye) ağaç modelleri üretir.
 */
export class RealisticTreeBuilder {
  constructor() {
    this._textureCache = {};
    this._materialCache = {};
    this.initBarkMaterials();
  }

  // ── Bark Materials ──────────────────────────────────────────────────
  initBarkMaterials() {
    this.barkOak = new THREE.MeshStandardMaterial({ color: 0x48321e, roughness: 0.92, metalness: 0.03 });
    this.barkBirch = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.74, metalness: 0.05 });
    this.barkPine = new THREE.MeshStandardMaterial({ color: 0x4e301a, roughness: 0.92, metalness: 0.04 });
    this.barkCherry = new THREE.MeshStandardMaterial({ color: 0x382216, roughness: 0.86, metalness: 0.04 });
    this.barkMaple = new THREE.MeshStandardMaterial({ color: 0x442c1b, roughness: 0.88, metalness: 0.04 });
    this.barkPalm = new THREE.MeshStandardMaterial({ color: 0x6e5745, roughness: 0.85, metalness: 0.05 });
    this.barkBirchRing = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.9, metalness: 0.03 });
  }

  // ── Procedural Leaf Texture Generator ───────────────────────────────
  _generateLeafTexture(colors, size = 512) {
    const key = colors.join('-') + size;
    if (this._textureCache[key]) return this._textureCache[key];

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, size, size);

    const cx = size / 2;
    const cy = size / 2;
    const maxR = size * 0.44;

    for (let i = 0; i < 900; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.pow(Math.random(), 0.6) * maxR;
      const x = cx + Math.cos(angle) * dist;
      const y = cy + Math.sin(angle) * dist;

      const leafSize = 4 + Math.random() * 10;
      const color = colors[Math.floor(Math.random() * colors.length)];

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.random() * Math.PI * 2);

      ctx.beginPath();
      ctx.ellipse(0, 0, leafSize, leafSize * 0.6, 0, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.85 + Math.random() * 0.15;
      ctx.fill();
      ctx.restore();
    }

    const grad = ctx.createRadialGradient(cx, cy, maxR * 0.6, cx, cy, maxR * 1.02);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    ctx.globalCompositeOperation = 'source-over';

    const tex = new THREE.CanvasTexture(canvas);
    tex.premultiplyAlpha = false;
    this._textureCache[key] = tex;
    return tex;
  }

  _getLeafMaterial(colors) {
    const key = colors.join('-');
    if (this._materialCache[key]) return this._materialCache[key];

    const tex = this._generateLeafTexture(colors);
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      transparent: true,
      alphaTest: 0.15,
      side: THREE.DoubleSide,
      roughness: 0.72,
      metalness: 0.0,
      depthWrite: false
    });
    this._materialCache[key] = mat;
    return mat;
  }

  _createBillboardCluster(x, y, z, radius, leafMat, planeCount = 3) {
    const cluster = new THREE.Group();
    cluster.position.set(x, y, z);

    for (let i = 0; i < planeCount; i++) {
      const angle = (i * Math.PI) / planeCount;
      const geo = new THREE.PlaneGeometry(radius * 2, radius * 2);
      const plane = new THREE.Mesh(geo, leafMat);
      plane.rotation.y = angle;
      plane.castShadow = false;
      plane.receiveShadow = true;
      cluster.add(plane);
    }

    return cluster;
  }

  _createTrunk(barkMat, topR, bottomR, height, segments = 10) {
    const geo = new THREE.CylinderGeometry(topR, bottomR, height, segments);
    const mesh = new THREE.Mesh(geo, barkMat);
    mesh.position.y = height / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  _createBranch(barkMat, topR, bottomR, length, pos, rotY, rotZ) {
    const geo = new THREE.CylinderGeometry(topR, bottomR, length, 8);
    const mesh = new THREE.Mesh(geo, barkMat);
    mesh.position.copy(pos);
    mesh.rotation.y = rotY;
    mesh.rotation.z = rotZ;
    mesh.castShadow = false;
    return mesh;
  }

  createOak(scale = 1.0) {
    const group = new THREE.Group();
    const s = scale;
    const leafMat = this._getLeafMaterial([
      '#5ea63a', '#6dbf48', '#78c854', '#4e9c30', '#8ad462', '#66b240'
    ]);

    group.add(this._createTrunk(this.barkOak, 0.3 * s, 0.52 * s, 3.4 * s, 12));

    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI * 2) / 3 + 0.3;
      const root = this._createBranch(this.barkOak, 0.12 * s, 0.26 * s, 1.2 * s,
        new THREE.Vector3(Math.cos(a) * 0.45 * s, 0.4 * s, Math.sin(a) * 0.45 * s),
        0, Math.cos(a) * 0.4);
      root.rotation.x = Math.sin(a) * 0.4;
      group.add(root);
    }

    const th = 3.4 * s;
    [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3].forEach(a => {
      group.add(this._createBranch(this.barkOak, 0.16 * s, 0.24 * s, 2.0 * s,
        new THREE.Vector3(Math.cos(a) * 0.55 * s, th * 0.85, Math.sin(a) * 0.55 * s),
        a, 0.55));
    });

    const clusters = [
      { x: 0, y: th + 2.0 * s, z: 0, r: 1.8 * s },
      { x: 0.7 * s, y: th + 1.6 * s, z: 0.5 * s, r: 1.5 * s },
      { x: -0.7 * s, y: th + 1.6 * s, z: -0.4 * s, r: 1.5 * s },
      { x: 1.4 * s, y: th + 0.9 * s, z: 0.3 * s, r: 1.6 * s },
      { x: -1.4 * s, y: th + 0.9 * s, z: -0.3 * s, r: 1.6 * s },
      { x: 0.3 * s, y: th + 0.8 * s, z: 1.5 * s, r: 1.5 * s },
      { x: -0.3 * s, y: th + 0.8 * s, z: -1.5 * s, r: 1.5 * s },
      { x: 1.6 * s, y: th * 0.72, z: -1.0 * s, r: 1.4 * s },
      { x: -1.7 * s, y: th * 0.72, z: 0.9 * s, r: 1.4 * s }
    ];

    clusters.forEach(c => {
      group.add(this._createBillboardCluster(c.x, c.y, c.z, c.r, leafMat, 3));
    });

    return group;
  }

  createBirch(scale = 1.0) {
    const group = new THREE.Group();
    const s = scale;
    const leafMat = this._getLeafMaterial([
      '#72c240', '#85d054', '#5eb834', '#98dc68', '#7cc84a', '#8ed45c'
    ]);

    const th = 4.6 * s;
    group.add(this._createTrunk(this.barkBirch, 0.14 * s, 0.22 * s, th, 10));

    for (let i = 0; i < 5; i++) {
      const ringGeo = new THREE.CylinderGeometry(0.17 * s, 0.19 * s, 0.06 * s, 10);
      const ring = new THREE.Mesh(ringGeo, this.barkBirchRing);
      ring.position.y = (0.8 + i * 0.7) * s;
      group.add(ring);
    }

    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI * 2) / 4;
      group.add(this._createBranch(this.barkBirch, 0.06 * s, 0.1 * s, 1.6 * s,
        new THREE.Vector3(Math.cos(a) * 0.25 * s, (2.8 + i * 0.35) * s, Math.sin(a) * 0.25 * s),
        a, 0.45));
    }

    const clusters = [
      { x: 0, y: th + 1.4 * s, z: 0, r: 1.3 * s },
      { x: 0.5 * s, y: th + 0.8 * s, z: 0.4 * s, r: 1.1 * s },
      { x: -0.5 * s, y: th + 0.7 * s, z: -0.3 * s, r: 1.1 * s },
      { x: 0.4 * s, y: th * 0.82, z: -0.5 * s, r: 1.0 * s },
      { x: -0.5 * s, y: th * 0.78, z: 0.5 * s, r: 1.0 * s },
      { x: 0, y: th + 0.3 * s, z: 0.7 * s, r: 0.95 * s }
    ];

    clusters.forEach(c => {
      group.add(this._createBillboardCluster(c.x, c.y, c.z, c.r, leafMat, 3));
    });

    return group;
  }

  createPine(scale = 1.0) {
    const group = new THREE.Group();
    const s = scale;
    const needleMat = this._getLeafMaterial([
      '#2a6b24', '#24602e', '#348a2e', '#1e5418', '#3c8a34', '#2e7428'
    ]);

    const th = 6.4 * s;
    group.add(this._createTrunk(this.barkPine, 0.14 * s, 0.38 * s, th, 10));

    const tiers = [
      { y: 2.4 * s, r: 2.0 * s, count: 5 },
      { y: 3.4 * s, r: 1.7 * s, count: 5 },
      { y: 4.4 * s, r: 1.4 * s, count: 4 },
      { y: 5.4 * s, r: 1.1 * s, count: 4 },
      { y: 6.2 * s, r: 0.75 * s, count: 3 }
    ];

    tiers.forEach((tier, tIdx) => {
      for (let i = 0; i < tier.count; i++) {
        const a = (i * Math.PI * 2) / tier.count + tIdx * 0.5;
        const dist = tier.r * 0.55;
        group.add(this._createBranch(this.barkPine, 0.05 * s, 0.09 * s, tier.r * 0.7,
          new THREE.Vector3(Math.cos(a) * dist * 0.4, tier.y, Math.sin(a) * dist * 0.4),
          a, 0.25));
        group.add(this._createBillboardCluster(
          Math.cos(a) * dist, tier.y + 0.1 * s, Math.sin(a) * dist,
          tier.r * 0.48, needleMat, 2));
      }
    });

    group.add(this._createBillboardCluster(0, th + 0.6 * s, 0, 0.8 * s, needleMat, 3));

    return group;
  }

  createCherry(scale = 1.0) {
    const group = new THREE.Group();
    const s = scale;
    const blossomMat = this._getLeafMaterial([
      '#f8b4d9', '#f9c6e2', '#f472b6', '#fbaed2', '#e879a8', '#fcc3df'
    ]);

    const th = 3.0 * s;
    const trunk = this._createTrunk(this.barkCherry, 0.22 * s, 0.38 * s, th, 10);
    trunk.rotation.z = 0.08;
    group.add(trunk);

    group.add(this._createBranch(this.barkCherry, 0.12 * s, 0.2 * s, 1.8 * s,
      new THREE.Vector3(0.6 * s, th * 0.85, 0.2 * s), 0, 0.65));
    group.add(this._createBranch(this.barkCherry, 0.12 * s, 0.2 * s, 1.8 * s,
      new THREE.Vector3(-0.6 * s, th * 0.85, -0.2 * s), Math.PI, 0.65));

    const clusters = [
      { x: 0, y: th + 1.5 * s, z: 0, r: 1.45 * s },
      { x: 1.0 * s, y: th + 1.1 * s, z: 0.4 * s, r: 1.3 * s },
      { x: -1.0 * s, y: th + 1.1 * s, z: -0.4 * s, r: 1.3 * s },
      { x: 0.3 * s, y: th + 0.7 * s, z: 1.1 * s, r: 1.2 * s },
      { x: -0.3 * s, y: th + 0.7 * s, z: -1.1 * s, r: 1.2 * s },
      { x: 1.5 * s, y: th * 0.8, z: -0.5 * s, r: 1.15 * s },
      { x: -1.5 * s, y: th * 0.8, z: 0.5 * s, r: 1.15 * s }
    ];

    clusters.forEach(c => {
      group.add(this._createBillboardCluster(c.x, c.y, c.z, c.r, blossomMat, 3));
    });

    return group;
  }

  createMaple(scale = 1.0) {
    const group = new THREE.Group();
    const s = scale;
    const leafMat = this._getLeafMaterial([
      '#4ea63a', '#3e9830', '#62b848', '#48923c', '#72c454', '#54a840'
    ]);

    const th = 3.6 * s;
    group.add(this._createTrunk(this.barkMaple, 0.26 * s, 0.44 * s, th, 10));

    [0, Math.PI * 0.6, Math.PI * 1.2].forEach(a => {
      group.add(this._createBranch(this.barkMaple, 0.12 * s, 0.18 * s, 1.8 * s,
        new THREE.Vector3(Math.cos(a) * 0.4 * s, th * 0.82, Math.sin(a) * 0.4 * s),
        a, 0.5));
    });

    const clusters = [
      { x: 0, y: th + 1.8 * s, z: 0, r: 1.8 * s },
      { x: 1.0 * s, y: th + 1.1 * s, z: 0.5 * s, r: 1.55 * s },
      { x: -1.0 * s, y: th + 1.1 * s, z: -0.5 * s, r: 1.55 * s },
      { x: 0.4 * s, y: th + 0.9 * s, z: 1.2 * s, r: 1.5 * s },
      { x: -0.4 * s, y: th + 0.9 * s, z: -1.2 * s, r: 1.5 * s },
      { x: 1.3 * s, y: th * 0.75, z: -0.8 * s, r: 1.35 * s },
      { x: -1.3 * s, y: th * 0.75, z: 0.8 * s, r: 1.35 * s }
    ];

    clusters.forEach(c => {
      group.add(this._createBillboardCluster(c.x, c.y, c.z, c.r, leafMat, 3));
    });

    return group;
  }

  createPalm(scale = 1.0) {
    const group = new THREE.Group();
    const s = scale;

    const th = 5.2 * s;
    const trunk = this._createTrunk(this.barkPalm, 0.16 * s, 0.28 * s, th, 10);
    trunk.rotation.z = 0.06;
    group.add(trunk);

    for (let i = 0; i < 8; i++) {
      const ringGeo = new THREE.CylinderGeometry(0.2 * s, 0.22 * s, 0.06 * s, 10);
      const ring = new THREE.Mesh(ringGeo, this.barkPalm);
      ring.position.y = (0.6 + i * 0.55) * s;
      group.add(ring);
    }

    const frondMat = this._getLeafMaterial([
      '#337c22', '#2b6e1c', '#3d8a2c', '#246418', '#4a9634', '#358026'
    ]);

    const frondCount = 9;
    for (let i = 0; i < frondCount; i++) {
      const a = (i * Math.PI * 2) / frondCount;
      const frondLen = 2.8 * s;
      const frondGeo = new THREE.PlaneGeometry(1.0 * s, frondLen);
      frondGeo.translate(0, frondLen / 2, 0);

      const frond = new THREE.Mesh(frondGeo, frondMat);
      frond.position.set(0, th - 0.1 * s, 0);
      frond.rotation.y = a;
      frond.rotation.x = 0.85;
      frond.castShadow = false;
      group.add(frond);
    }

    group.add(this._createBillboardCluster(0, th + 0.3 * s, 0, 0.9 * s, frondMat, 3));

    return group;
  }

  /**
   * Tüm şehir için tek seferde InstancedMesh tabanlı palmiye ağaçları üretir (2 Draw Call)
   * @param {Array<{pos: THREE.Vector3, scale: number, rotY: number}>} transforms
   * @returns {THREE.Group}
   */
  buildInstancedPalms(transforms) {
    const group = new THREE.Group();
    group.name = 'InstancedPalmsGroup';
    if (!transforms || transforms.length === 0) return group;

    const count = transforms.length;
    // 1. Gövde Geometrisi
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.32, 5.2, 8);
    trunkGeo.translate(0, 2.6, 0);
    const instTrunk = new THREE.InstancedMesh(trunkGeo, this.barkPalm, count);

    // 2. Tepe Yaprak Tacı Geometrisi
    const frondGeo = new THREE.ConeGeometry(2.5, 1.8, 7);
    frondGeo.translate(0, 5.4, 0);
    const frondMat = this._getLeafMaterial([
      '#337c22', '#2b6e1c', '#3d8a2c', '#246418', '#4a9634', '#358026'
    ]);
    const instFrond = new THREE.InstancedMesh(frondGeo, frondMat, count);

    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const t = transforms[i];
      dummy.position.copy(t.pos);
      dummy.rotation.set(0, t.rotY || 0, 0);
      dummy.scale.setScalar(t.scale || 1.0);
      dummy.updateMatrix();

      instTrunk.setMatrixAt(i, dummy.matrix);
      instFrond.setMatrixAt(i, dummy.matrix);
    }

    instTrunk.instanceMatrix.needsUpdate = true;
    instFrond.instanceMatrix.needsUpdate = true;

    instTrunk.castShadow = true;
    instTrunk.receiveShadow = true;
    instFrond.castShadow = true;

    group.add(instTrunk);
    group.add(instFrond);
    return group;
  }
}

