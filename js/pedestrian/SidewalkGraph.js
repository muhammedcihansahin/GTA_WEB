import * as THREE from 'three';

/**
 * SidewalkNode - Kaldırım ve Yaya Navigasyon Düğümü
 */
export class SidewalkNode {
  /**
   * @param {number} id
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @param {number} islandId
   * @param {boolean} [isCorner=false]
   * @param {boolean} [isCrosswalk=false]
   */
  constructor(id, x, y, z, islandId, isCorner = false, isCrosswalk = false) {
    this.id = id;
    this.position = new THREE.Vector3(x, y, z);
    this.islandId = islandId;
    this.isCorner = isCorner;
    this.isCrosswalk = isCrosswalk;
    /** @type {SidewalkEdge[]} */
    this.outgoingEdges = [];
    /** @type {SidewalkEdge[]} */
    this.incomingEdges = [];
  }
}

/**
 * SidewalkEdge - İki kaldırım düğümü arasındaki yönlü veya çift yönlü bağlantı
 */
export class SidewalkEdge {
  /**
   * @param {number} id
   * @param {SidewalkNode} fromNode
   * @param {SidewalkNode} toNode
   * @param {boolean} [isCrosswalk=false]
   */
  constructor(id, fromNode, toNode, isCrosswalk = false) {
    this.id = id;
    this.fromNode = fromNode;
    this.toNode = toNode;
    this.isCrosswalk = isCrosswalk;
    this.length = fromNode.position.distanceTo(toNode.position);
    this.direction = new THREE.Vector3().subVectors(toNode.position, fromNode.position).normalize();
  }

  getPointAt(t, target = new THREE.Vector3()) {
    return target.lerpVectors(this.fromNode.position, this.toNode.position, THREE.MathUtils.clamp(t, 0, 1));
  }
}

/**
 * SidewalkGraph - Şehir Kaldırım ve Yaya Geçitleri Grafı
 * roads.js içindeki 16 ada/blok kaldırım sınırlarından türetilir.
 */
export class SidewalkGraph {
  constructor() {
    /** @type {Map<number, SidewalkNode>} */
    this.nodes = new Map();
    /** @type {SidewalkEdge[]} */
    this.edges = [];
    this._nodeIdCounter = 0;
    this._edgeIdCounter = 0;
    this._tempVec = new THREE.Vector3();
    this.islandNodes = new Map(); // islandId -> SidewalkNode[]
  }

  /**
   * roads.js 16 ada geometrisinden kaldırım döngülerini ve yaya geçitlerini türetir
   * @param {Object} [terrainManager=null]
   */
  build(terrainManager = null) {
    this.nodes.clear();
    this.edges = [];
    this.islandNodes.clear();
    this._nodeIdCounter = 0;
    this._edgeIdCounter = 0;

    const curbWidth = 0.25;
    const walkWidth = 1.95;
    const offset = curbWidth + walkWidth / 2; // 1.225m iç ofset

    const xRanges = [
      { minX: -129.5, maxX: -70.5 },
      { minX: -59.5, maxX: -7.5 },
      { minX: 7.5, maxX: 59.5 },
      { minX: 70.5, maxX: 129.5 }
    ];

    const zRanges = [
      { minZ: -129.5, maxZ: -70.5 },
      { minZ: -59.5, maxZ: -7.5 },
      { minZ: 7.5, maxZ: 59.5 },
      { minZ: 70.5, maxZ: 129.5 }
    ];

    const getElev = (x, z) => {
      if (terrainManager && typeof terrainManager.getElevation === 'function') {
        return terrainManager.getElevation(x, z) + 0.14; // Kaldırım kotu
      }
      return 0.14;
    };

    // 1. Her ada etrafında kapalı bir kaldırım waypoint halkası oluştur
    // Island grid index: xi (0..3), zi (0..3) => islandId = zi * 4 + xi
    const islandCornerMap = {}; // `${xi}_${zi}` -> { NW, NE, SE, SW, N_mid, E_mid, S_mid, W_mid }

    for (let zi = 0; zi < zRanges.length; zi++) {
      for (let xi = 0; xi < xRanges.length; xi++) {
        const xr = xRanges[xi];
        const zr = zRanges[zi];
        const islandId = zi * 4 + xi;
        const islandNodeList = [];

        const leftX = xr.minX + offset;
        const rightX = xr.maxX - offset;
        const topZ = zr.minZ + offset;
        const bottomZ = zr.maxZ - offset;

        // Adanın 4 ana köşesi
        const nw = this._createNode(leftX, getElev(leftX, topZ), topZ, islandId, true);
        const ne = this._createNode(rightX, getElev(rightX, topZ), topZ, islandId, true);
        const se = this._createNode(rightX, getElev(rightX, bottomZ), bottomZ, islandId, true);
        const sw = this._createNode(leftX, getElev(leftX, bottomZ), bottomZ, islandId, true);

        // Kuzey kenarı ara düğümleri (3 ara nokta: 0.25, 0.50, 0.75)
        const n1 = this._createNode(THREE.MathUtils.lerp(leftX, rightX, 0.25), getElev(THREE.MathUtils.lerp(leftX, rightX, 0.25), topZ), topZ, islandId);
        const n2 = this._createNode(THREE.MathUtils.lerp(leftX, rightX, 0.50), getElev(THREE.MathUtils.lerp(leftX, rightX, 0.50), topZ), topZ, islandId);
        const n3 = this._createNode(THREE.MathUtils.lerp(leftX, rightX, 0.75), getElev(THREE.MathUtils.lerp(leftX, rightX, 0.75), topZ), topZ, islandId);

        // Doğu kenarı ara düğümleri
        const e1 = this._createNode(rightX, getElev(rightX, THREE.MathUtils.lerp(topZ, bottomZ, 0.25)), THREE.MathUtils.lerp(topZ, bottomZ, 0.25), islandId);
        const e2 = this._createNode(rightX, getElev(rightX, THREE.MathUtils.lerp(topZ, bottomZ, 0.50)), THREE.MathUtils.lerp(topZ, bottomZ, 0.50), islandId);
        const e3 = this._createNode(rightX, getElev(rightX, THREE.MathUtils.lerp(topZ, bottomZ, 0.75)), THREE.MathUtils.lerp(topZ, bottomZ, 0.75), islandId);

        // Güney kenarı ara düğümleri (Doğudan Batıya)
        const s1 = this._createNode(THREE.MathUtils.lerp(rightX, leftX, 0.25), getElev(THREE.MathUtils.lerp(rightX, leftX, 0.25), bottomZ), bottomZ, islandId);
        const s2 = this._createNode(THREE.MathUtils.lerp(rightX, leftX, 0.50), getElev(THREE.MathUtils.lerp(rightX, leftX, 0.50), bottomZ), bottomZ, islandId);
        const s3 = this._createNode(THREE.MathUtils.lerp(rightX, leftX, 0.75), getElev(THREE.MathUtils.lerp(rightX, leftX, 0.75), bottomZ), bottomZ, islandId);

        // Batı kenarı ara düğümleri (Güneyden Kuzeye)
        const w1 = this._createNode(leftX, getElev(leftX, THREE.MathUtils.lerp(bottomZ, topZ, 0.25)), THREE.MathUtils.lerp(bottomZ, topZ, 0.25), islandId);
        const w2 = this._createNode(leftX, getElev(leftX, THREE.MathUtils.lerp(bottomZ, topZ, 0.50)), THREE.MathUtils.lerp(bottomZ, topZ, 0.50), islandId);
        const w3 = this._createNode(leftX, getElev(leftX, THREE.MathUtils.lerp(bottomZ, topZ, 0.75)), THREE.MathUtils.lerp(bottomZ, topZ, 0.75), islandId);

        // Sıralı döngü: NW -> n1 -> n2 -> n3 -> NE -> e1 -> e2 -> e3 -> SE -> s1 -> s2 -> s3 -> SW -> w1 -> w2 -> w3 -> (NW)
        const ring = [nw, n1, n2, n3, ne, e1, e2, e3, se, s1, s2, s3, sw, w1, w2, w3];
        for (let r = 0; r < ring.length; r++) {
          const from = ring[r];
          const to = ring[(r + 1) % ring.length];
          // İki yönlü bağlantı (yayalar iki yöne de serbestçe yürüyebilir)
          this._addEdge(from, to, false);
          this._addEdge(to, from, false);
          islandNodeList.push(from);
        }

        this.islandNodes.set(islandId, islandNodeList);
        islandCornerMap[`${xi}_${zi}`] = { nw, ne, se, sw, n2, e2, s2, w2 };
      }
    }

    // 2. Adalar Arası Karşıya Geçiş (Crosswalk / Yaya Geçitleri)
    for (let zi = 0; zi < zRanges.length; zi++) {
      for (let xi = 0; xi < xRanges.length; xi++) {
        const current = islandCornerMap[`${xi}_${zi}`];

        // Doğu komşusuna geçiş (Yatay yol üzerinden)
        if (xi < xRanges.length - 1) {
          const eastNeighbor = islandCornerMap[`${xi + 1}_${zi}`];
          // Kuzey kavşak geçişi
          this._createCrosswalkConnection(current.ne, eastNeighbor.nw);
          // Orta bulvar geçişi
          this._createCrosswalkConnection(current.e2, eastNeighbor.w2);
          // Güney kavşak geçişi
          this._createCrosswalkConnection(current.se, eastNeighbor.sw);
        }

        // Güney komşusuna geçiş (Dikey yol üzerinden)
        if (zi < zRanges.length - 1) {
          const southNeighbor = islandCornerMap[`${xi}_${zi + 1}`];
          // Batı kavşak geçişi
          this._createCrosswalkConnection(current.sw, southNeighbor.nw);
          // Orta bulvar geçişi
          this._createCrosswalkConnection(current.s2, southNeighbor.n2);
          // Doğu kavşak geçişi
          this._createCrosswalkConnection(current.se, southNeighbor.ne);
        }
      }
    }

    console.log(`🚶 [SidewalkGraph] Üretildi: ${this.nodes.size} Düğüm (Node), ${this.edges.length} Kenar (Edge) - 16 Ada Kaldırım Ağı.`);
  }

  _createNode(x, y, z, islandId, isCorner = false, isCrosswalk = false) {
    const id = this._nodeIdCounter++;
    const node = new SidewalkNode(id, x, y, z, islandId, isCorner, isCrosswalk);
    this.nodes.set(id, node);
    return node;
  }

  _addEdge(fromNode, toNode, isCrosswalk = false) {
    const id = this._edgeIdCounter++;
    const edge = new SidewalkEdge(id, fromNode, toNode, isCrosswalk);
    fromNode.outgoingEdges.push(edge);
    toNode.incomingEdges.push(edge);
    this.edges.push(edge);
    return edge;
  }

  _createCrosswalkConnection(nodeA, nodeB) {
    nodeA.isCrosswalk = true;
    nodeB.isCrosswalk = true;
    this._addEdge(nodeA, nodeB, true);
    this._addEdge(nodeB, nodeA, true);
  }

  /**
   * Verilen pozisyona en yakın düğümü bulur
   * @param {THREE.Vector3} pos
   * @param {number} [maxDist=999]
   * @returns {SidewalkNode|null}
   */
  findNearestNode(pos, maxDist = 999) {
    let best = null;
    let minDistSq = maxDist * maxDist;

    for (const node of this.nodes.values()) {
      const dSq = node.position.distanceToSquared(pos);
      if (dSq < minDistSq) {
        minDistSq = dSq;
        best = node;
      }
    }
    return best;
  }

  /**
   * Oyuncu mesafesine göre uygun rastgele spawn düğümü seçer
   * @param {THREE.Vector3} playerPos
   * @param {number} minDist
   * @param {number} maxDist
   * @returns {SidewalkNode|null}
   */
  getRandomSpawnNode(playerPos = null, minDist = 18, maxDist = 75) {
    const nodeList = Array.from(this.nodes.values());
    if (nodeList.length === 0) return null;

    if (!playerPos) {
      return nodeList[Math.floor(Math.random() * nodeList.length)];
    }

    const minDistSq = minDist * minDist;
    const maxDistSq = maxDist * maxDist;
    const valid = [];

    for (let i = 0; i < nodeList.length; i++) {
      const n = nodeList[i];
      const dSq = n.position.distanceToSquared(playerPos);
      if (dSq >= minDistSq && dSq <= maxDistSq) {
        valid.push(n);
      }
    }

    if (valid.length > 0) {
      return valid[Math.floor(Math.random() * valid.length)];
    }

    // Fallback: Herhangi bir düğüm
    return nodeList[Math.floor(Math.random() * nodeList.length)];
  }

  /**
   * Bir sonraki kenarı seçer (kaldırım takip veya olasılıklı geçit seçimi)
   * @param {SidewalkEdge} currentEdge
   * @param {SidewalkNode} atNode
   * @param {number} [crosswalkChance=0.20] Karşıya geçme olasılığı
   * @returns {SidewalkEdge|null}
   */
  getNextEdge(currentEdge, atNode, crosswalkChance = 0.20) {
    if (!atNode || atNode.outgoingEdges.length === 0) return null;

    const options = atNode.outgoingEdges.filter(e => e.toNode !== currentEdge?.fromNode);
    const candidates = options.length > 0 ? options : atNode.outgoingEdges;

    // Yaya geçidi ve kaldırım kenarlarını ayır
    const crosswalks = candidates.filter(e => e.isCrosswalk);
    const sidewalks = candidates.filter(e => !e.isCrosswalk);

    // Eğer yaya geçidi varsa ve zar tutarsa karşıya geç
    if (crosswalks.length > 0 && Math.random() < crosswalkChance) {
      return crosswalks[Math.floor(Math.random() * crosswalks.length)];
    }

    // Normal kaldırımda yürümeye devam et
    if (sidewalks.length > 0) {
      return sidewalks[Math.floor(Math.random() * sidewalks.length)];
    }

    return candidates[Math.floor(Math.random() * candidates.length)];
  }
}
