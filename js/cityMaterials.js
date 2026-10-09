import * as THREE from 'three';

/**
 * Şehir Malzeme Fabrikası (Photorealistic Materials & Depth Offset)
 * Z-Fighting önlemek için katman polygonOffset yapılandırmalarıyla donatılmıştır.
 */
function createGtaSanAndreasRoadTexture() {
  const width = 1024;
  const height = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // 1. Temel Koyu Gri Asfalt Tonu (#3a3a3a)
  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(0, 0, width, height);

  // 2. Yüzey Renk Gradyanları ve Banket Tozlanması
  const grad = ctx.createLinearGradient(0, 0, width, 0);
  grad.addColorStop(0.00, '#4a4a46'); // Sol banket / hafif toz birikimi
  grad.addColorStop(0.08, '#3e3e3b'); // Sol kenar
  grad.addColorStop(0.24, '#2d2d2d'); // Sol şerit sol tekerlek izi (aşınmış koyu kauçuk)
  grad.addColorStop(0.36, '#3a3a37'); // Sol şerit orta tozlanma
  grad.addColorStop(0.44, '#2b2b2b'); // Sol şerit sağ tekerlek izi
  grad.addColorStop(0.50, '#383835'); // Orta şerit ayırıcı bölge
  grad.addColorStop(0.56, '#2b2b2b'); // Sağ şerit sol tekerlek izi
  grad.addColorStop(0.64, '#3a3a37'); // Sağ şerit orta tozlanma
  grad.addColorStop(0.76, '#2d2d2d'); // Sağ şerit sağ tekerlek izi
  grad.addColorStop(0.92, '#3e3e3b'); // Sağ kenar
  grad.addColorStop(1.00, '#4a4a46'); // Sağ banket / hafif toz birikimi
  ctx.fillStyle = grad;
  ctx.globalAlpha = 0.55;
  ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = 1.0;

  // 3. Tekerlek İzleri (Longitudinal Tire Skid / Wear Streaks)
  const tireTracks = [
    { x: width * 0.24, w: width * 0.09 },
    { x: width * 0.44, w: width * 0.08 },
    { x: width * 0.56, w: width * 0.08 },
    { x: width * 0.76, w: width * 0.09 }
  ];

  tireTracks.forEach(track => {
    ctx.fillStyle = 'rgba(40, 36, 30, 0.24)';
    ctx.fillRect(track.x - track.w / 2, 0, track.w, height);

    ctx.fillStyle = 'rgba(30, 26, 22, 0.18)';
    ctx.fillRect(track.x - track.w / 4, 0, track.w / 2, height);
  });

  // Dikey tekerlek fırça izleri
  for (let i = 0; i < 65; i++) {
    const track = tireTracks[Math.floor(Math.random() * tireTracks.length)];
    const x = track.x + (Math.random() - 0.5) * track.w;
    const w = Math.random() * 3 + 1;
    ctx.fillStyle = `rgba(32, 28, 24, ${Math.random() * 0.14 + 0.05})`;
    ctx.fillRect(x, 0, w, height);
  }

  // 4. Asfalt Agrega Taneleri ve Pürüzsüzleştirme (Noise)
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  for (let i = 0; i < data.length; i += 4) {
    const noise = (Math.random() - 0.5) * 26;
    data[i] = Math.min(255, Math.max(0, data[i] + noise));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
  }
  ctx.putImageData(imgData, 0, 0);

  // 5. Asfalt Taş Çipleri (Çakıl / Mineral Tanecikleri)
  for (let i = 0; i < 20000; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const r = Math.random() * 1.8 + 0.4;
    const type = Math.random();
    if (type > 0.6) {
      ctx.fillStyle = `rgba(210, 202, 188, ${Math.random() * 0.4 + 0.2})`;
    } else if (type > 0.3) {
      ctx.fillStyle = `rgba(36, 32, 26, ${Math.random() * 0.45 + 0.25})`;
    } else {
      ctx.fillStyle = `rgba(118, 110, 99, ${Math.random() * 0.35 + 0.15})`;
    }
    ctx.fillRect(x, y, r, r);
  }

  // 6. Asfalt Çatlakları ve Yama Çizgileri (GTA SA Country Road Cracks)
  ctx.lineWidth = 1.2;
  for (let c = 0; c < 16; c++) {
    let curX = Math.random() * width;
    let curY = Math.random() * height;
    const crackLen = Math.floor(Math.random() * 8) + 5;
    ctx.strokeStyle = `rgba(35, 30, 25, ${Math.random() * 0.4 + 0.25})`;
    ctx.beginPath();
    ctx.moveTo(curX, curY);

    for (let s = 0; s < crackLen; s++) {
      curX += (Math.random() - 0.5) * 22;
      curY += (Math.random() - 0.2) * 20;
      if (curY > height) curY -= height;
      if (curY < 0) curY += height;
      ctx.lineTo(curX, curY);
    }
    ctx.stroke();
  }

  // 7. Kenar Toz / Yol Kenarı Geçişi (Edge Dust Blend)
  const leftDust = ctx.createLinearGradient(0, 0, width * 0.08, 0);
  leftDust.addColorStop(0, 'rgba(120, 115, 105, 0.35)');
  leftDust.addColorStop(1, 'rgba(120, 115, 105, 0.0)');
  ctx.fillStyle = leftDust;
  ctx.fillRect(0, 0, width * 0.08, height);

  const rightDust = ctx.createLinearGradient(width, 0, width * 0.92, 0);
  rightDust.addColorStop(0, 'rgba(120, 115, 105, 0.35)');
  rightDust.addColorStop(1, 'rgba(120, 115, 105, 0.0)');
  ctx.fillStyle = rightDust;
  ctx.fillRect(width * 0.92, 0, width * 0.08, height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function createGtaRoadBumpTexture() {
  const width = 512;
  const height = 512;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, width, height);

  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const n = (Math.random() - 0.5) * 60 + 128;
    data[i] = n;
    data[i + 1] = n;
    data[i + 2] = n;
  }
  ctx.putImageData(imgData, 0, 0);

  const bumpTex = new THREE.CanvasTexture(canvas);
  bumpTex.wrapS = THREE.RepeatWrapping;
  bumpTex.wrapT = THREE.RepeatWrapping;
  return bumpTex;
}

function createGtaCurbTexture() {
  const width = 256;
  const height = 256;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // 1. Sıcak GTA San Andreas Taş Grisi Taban
  ctx.fillStyle = '#8f887b';
  ctx.fillRect(0, 0, width, height);

  // 2. Mikro kum ve beton gürültüsü
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const n = (Math.random() - 0.5) * 22;
    data[i] = Math.min(255, Math.max(0, data[i] + n));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + n));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + n));
  }
  ctx.putImageData(imgData, 0, 0);

  // 3. İnce agrega tanecikleri (taş çipleri)
  for (let i = 0; i < 1500; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(215, 208, 195, 0.28)' : 'rgba(40, 35, 28, 0.3)';
    ctx.fillRect(x, y, Math.random() * 1.8 + 0.5, Math.random() * 1.8 + 0.5);
  }

  // 4. Dikey Taş Birleşim Derzi (Her taş bloğunun sol ve sağ kenar oluğu)
  ctx.fillStyle = 'rgba(30, 26, 20, 0.55)';
  ctx.fillRect(0, 0, 3, height);
  ctx.fillRect(width - 2, 0, 2, height);
  ctx.fillStyle = 'rgba(215, 208, 195, 0.35)';
  ctx.fillRect(3, 0, 2, height);

  // 5. Alt Yol Kenarı Kir/Gölge Gradyanı
  const bottomShadow = ctx.createLinearGradient(0, height, 0, height * 0.4);
  bottomShadow.addColorStop(0, 'rgba(40, 36, 28, 0.35)');
  bottomShadow.addColorStop(1, 'rgba(40, 36, 28, 0.0)');
  ctx.fillStyle = bottomShadow;
  ctx.fillRect(0, 0, width, height);

  // 6. Üst Kenar Pah Aydınlığı (Curb edge highlight)
  const topHighlight = ctx.createLinearGradient(0, 0, 0, height * 0.25);
  topHighlight.addColorStop(0, 'rgba(225, 218, 205, 0.30)');
  topHighlight.addColorStop(1, 'rgba(225, 218, 205, 0.0)');
  ctx.fillStyle = topHighlight;
  ctx.fillRect(0, 0, width, height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function createGtaSidewalkTexture() {
  const width = 512;
  const height = 512;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // 1. GTA San Andreas Sıcak Beton Plaka Tonu (#9e9688)
  ctx.fillStyle = '#9e9688';
  ctx.fillRect(0, 0, width, height);

  // 2. Beton Yüzey Gürültüsü ve Doku
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const n = (Math.random() - 0.5) * 18;
    data[i] = Math.min(255, Math.max(0, data[i] + n));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + n));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + n));
  }
  ctx.putImageData(imgData, 0, 0);

  // 3. Taş Tanecikleri ve Aşınma Noktaları
  for (let i = 0; i < 3000; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(225, 218, 205, 0.25)' : 'rgba(45, 40, 32, 0.25)';
    ctx.fillRect(x, y, Math.random() * 2 + 0.6, Math.random() * 2 + 0.6);
  }

  // 4. Kare Beton Plaka Derzleri (Grid Joints: Dış hatlar ve orta eksenler)
  const drawJointLine = (x1, y1, x2, y2) => {
    ctx.strokeStyle = 'rgba(42, 36, 28, 0.5)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(220, 214, 202, 0.35)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x1 + 1.2, y1 + 1.2);
    ctx.lineTo(x2 + 1.2, y2 + 1.2);
    ctx.stroke();
  };

  drawJointLine(0, 0, width, 0);
  drawJointLine(0, 0, 0, height);
  drawJointLine(width, 0, width, height);
  drawJointLine(0, height, width, height);
  drawJointLine(width / 2, 0, width / 2, height);
  drawJointLine(0, height / 2, width, height / 2);

  // 5. Hafif Köşe/Kenar Tozlanması
  for (let c = 0; c < 8; c++) {
    const cx = Math.random() * width;
    const cy = Math.random() * height;
    const r = Math.random() * 60 + 30;
    const dust = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    dust.addColorStop(0, 'rgba(80, 72, 60, 0.12)');
    dust.addColorStop(1, 'rgba(80, 72, 60, 0.0)');
    ctx.fillStyle = dust;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

export function createCityMaterials() {
  // Yüksek kaliteli fotogerçekçi çim dokusu (512x512 Canvas)
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#3a6627';
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 12000; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const r = Math.random() * 2.2 + 0.5;
    const shade = Math.random();
    if (shade > 0.65) {
      ctx.fillStyle = '#4c8332';
    } else if (shade > 0.35) {
      ctx.fillStyle = '#2d541e';
    } else if (shade > 0.15) {
      ctx.fillStyle = '#558f3c';
    } else {
      ctx.fillStyle = '#345c22';
    }
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const grassTex = new THREE.CanvasTexture(canvas);
  grassTex.wrapS = THREE.RepeatWrapping;
  grassTex.wrapT = THREE.RepeatWrapping;
  grassTex.repeat.set(120, 120);

  // GTA San Andreas Yol Kaplama Dokuları
  const roadTexMain = createGtaSanAndreasRoadTexture();
  roadTexMain.repeat.set(1, 51.4);

  const roadTexSec = roadTexMain.clone();
  roadTexSec.repeat.set(1, 72);

  const roadBumpMain = createGtaRoadBumpTexture();
  roadBumpMain.repeat.set(2, 60);

  const roadBumpSec = roadBumpMain.clone();
  roadBumpSec.repeat.set(2, 80);

  // GTA San Andreas Kaldırım ve Bordür Dokuları
  const curbTex = createGtaCurbTexture();
  const sidewalkTex = createGtaSidewalkTexture();

  return {
    // 0. Katman: Doğal Çim Zemin
    grass: new THREE.MeshStandardMaterial({
      map: grassTex,
      roughness: 0.92,
      metalness: 0.02
    }),

    // 1. Katman: Asfalt Yollar (GTA San Andreas Çöl / Taşra Otoyolu Stili)
    asphalt: new THREE.MeshStandardMaterial({
      map: roadTexMain,
      bumpMap: roadBumpMain,
      bumpScale: 0.015,
      roughness: 0.94,
      metalness: 0.02,
      polygonOffset: true,
      polygonOffsetFactor: -1.0,
      polygonOffsetUnits: -1.0
    }),

    asphaltSecondary: new THREE.MeshStandardMaterial({
      map: roadTexSec,
      bumpMap: roadBumpSec,
      bumpScale: 0.015,
      roughness: 0.94,
      metalness: 0.02,
      polygonOffset: true,
      polygonOffsetFactor: -1.0,
      polygonOffsetUnits: -1.0
    }),

    // 2. Katman: Yol Çizgileri ve Yaya Geçitleri (GTA SA Güneşte Solmuş Çizgiler)
    roadMarkingWhite: new THREE.MeshStandardMaterial({
      color: 0xdfdad0,
      roughness: 0.94,
      metalness: 0.0,
      polygonOffset: true,
      polygonOffsetFactor: -2.0,
      polygonOffsetUnits: -2.0,
      transparent: true,
      opacity: 0.88
    }),

    roadMarkingYellow: new THREE.MeshStandardMaterial({
      color: 0xd6a33c, // Vintage GTA SA highway yellow
      roughness: 0.92,
      metalness: 0.0,
      polygonOffset: true,
      polygonOffsetFactor: -2.0,
      polygonOffsetUnits: -2.0,
      transparent: true,
      opacity: 0.88
    }),

    crosswalk: new THREE.MeshStandardMaterial({
      color: 0xdcd7cc,
      roughness: 0.95,
      metalness: 0.0,
      polygonOffset: true,
      polygonOffsetFactor: -2.0,
      polygonOffsetUnits: -2.0,
      transparent: true,
      opacity: 0.85
    }),

    // 3. Katman: Kaldırımlar, Bordürler ve Parseller (GTA SA Sıcak Taş & Beton Tonları)
    concreteSidewalk: new THREE.MeshStandardMaterial({
      map: sidewalkTex,
      roughness: 0.90,
      metalness: 0.02
    }),

    curbStone: new THREE.MeshStandardMaterial({
      map: curbTex,
      roughness: 0.88,
      metalness: 0.03
    }),

    parcelBorder: new THREE.MeshStandardMaterial({
      color: 0x4a5d4e,
      roughness: 0.9,
      metalness: 0.05,
      polygonOffset: true,
      polygonOffsetFactor: -1.0,
      polygonOffsetUnits: -1.0
    }),

    parcelMarker: new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.4,
      metalness: 0.4
    }),

    lampPole: new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.4,
      metalness: 0.8
    }),

    lampBulb: new THREE.MeshBasicMaterial({
      color: 0xffea9f
    })
  };
}
