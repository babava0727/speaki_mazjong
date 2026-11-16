// 패 앞면 그림(캔버스) 생성. 바탕은 투명하게 두고 무늬만 그린다(상아색 몸체가 비쳐 보임).
const FW = 240, FH = 320, SCALE = 1.6;
const SERIF = '"Noto Serif JP", "Yu Mincho", "Hiragino Mincho ProN", "MS Mincho", serif';
const INK = '#1e1b3a', RED = '#c3203a', GREEN = '#17804b', BLUE = '#1f4f98', GOLD = '#e9a23b';
const COLORS = { R: RED, G: GREEN, B: BLUE };
const NUM_KANJI = '一二三四五六七八九';

const wait = ms => new Promise(r => setTimeout(r, ms));

// 캔버스(패 앞면·가운데 콘솔)에 쓰는 글꼴. 패 그림을 그리기 전에 직접 받아 둔다.
// (style.css의 @font-face만 믿으면, 인터넷으로 받을 때 스타일 파일보다 이 코드가 먼저 돌아 한자 글꼴을 놓칠 수 있다)
const FONT_FILES = [
  ['Noto Serif JP', 'fonts/NotoSerifJP-tiles.woff2', '900'], // 패 한자(一~九, 萬, 東南西北, 發中)만 담은 것
  ['MonaS12', 'fonts/MonaS12.woff2', '400'],
  ['MonaS12', 'fonts/MonaS12-Bold.woff2', '700'],
];

export async function loadFonts() {
  const faces = FONT_FILES.map(([family, url, weight]) => {
    const face = new FontFace(family, `url(${url}) format('woff2')`, { weight, display: 'block' });
    document.fonts.add(face);
    return face.load().catch(() => null);
  });
  await Promise.race([Promise.all(faces), wait(8000)]);
}

function disc(g, x, y, r, col) {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = col;
  g.fill();
}

function hole(g, x, y, r) {
  g.save();
  g.globalCompositeOperation = 'destination-out';
  disc(g, x, y, r, '#000');
  g.restore();
}

function ellipse(g, x, y, rx, ry, rot, col) {
  g.beginPath();
  g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  g.fillStyle = col;
  g.fill();
}

// ---------- 만수 ----------
function drawMan(g, n, red) {
  g.fillStyle = red ? RED : INK;
  g.font = `900 112px ${SERIF}`;
  g.fillText(NUM_KANJI[n - 1], 120, 94);
  g.fillStyle = RED;
  g.font = `900 138px ${SERIF}`;
  g.fillText('萬', 120, 228);
}

// ---------- 통수 ----------
function pinCircle(g, x, y, r, col) {
  disc(g, x, y, r, col);
  hole(g, x, y, r * 0.84);
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4 + Math.PI / 8;
    disc(g, x + Math.cos(a) * r * 0.64, y + Math.sin(a) * r * 0.64, r * 0.14, col);
  }
  disc(g, x, y, r * 0.42, col);
  hole(g, x, y, r * 0.26);
  disc(g, x, y, r * 0.12, col);
}

const PIN = {
  2: { r: 50, pts: [[120, 90, 'G'], [120, 230, 'B']] },
  3: { r: 40, pts: [[62, 66, 'B'], [120, 160, 'R'], [178, 254, 'G']] },
  4: { r: 42, pts: [[70, 95, 'B'], [170, 95, 'G'], [70, 225, 'G'], [170, 225, 'B']] },
  5: { r: 38, pts: [[64, 78, 'B'], [176, 78, 'G'], [120, 160, 'R'], [64, 242, 'G'], [176, 242, 'B']] },
  6: { r: 34, pts: [[72, 60, 'G'], [168, 60, 'G'], [72, 174, 'R'], [168, 174, 'R'], [72, 260, 'R'], [168, 260, 'R']] },
  7: { r: 29, pts: [[58, 46, 'G'], [120, 78, 'G'], [182, 110, 'G'], [74, 192, 'R'], [166, 192, 'R'], [74, 266, 'R'], [166, 266, 'R']] },
  8: { r: 31, pts: [48, 122, 198, 272].flatMap(y => [[72, y, 'B'], [168, y, 'B']]) },
  9: { r: 30, pts: [[62, 'B'], [160, 'R'], [258, 'G']].flatMap(([y, c]) => [[52, y, c], [120, y, c], [188, y, c]]) },
};

function drawPin(g, n, red) {
  if (n === 1) {
    const x = 120, y = 160;
    disc(g, x, y, 96, GREEN);
    hole(g, x, y, 88);
    for (let k = 0; k < 16; k++) {
      const a = k * Math.PI / 8;
      disc(g, x + Math.cos(a) * 75, y + Math.sin(a) * 75, 8, k % 2 ? RED : BLUE);
    }
    disc(g, x, y, 58, BLUE);
    hole(g, x, y, 49);
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4;
      ellipse(g, x + Math.cos(a) * 36, y + Math.sin(a) * 36, 9, 5, a, GREEN);
    }
    disc(g, x, y, 24, RED);
    hole(g, x, y, 15);
    disc(g, x, y, 8, GREEN);
    return;
  }
  const { r, pts } = PIN[n];
  for (const [x, y, c] of pts) pinCircle(g, x, y, r, red ? RED : COLORS[c]);
}

// ---------- 삭수 ----------
function stick(g, x, y, col, ang = 0, w = 28, h = 100) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  g.fillStyle = col;
  g.beginPath(); g.roundRect(-w / 2, -h / 2, w, h, w * 0.42); g.fill();
  for (const ny of [-h / 2 + 5, 0, h / 2 - 5]) {
    g.beginPath(); g.roundRect(-w * 0.62, ny - 4, w * 1.24, 8, 4); g.fill();
  }
  g.globalCompositeOperation = 'destination-out';
  g.beginPath(); g.roundRect(-w * 0.13, -h / 2 + 12, w * 0.26, h / 2 - 18, 3); g.fill();
  g.beginPath(); g.roundRect(-w * 0.13, 6, w * 0.26, h / 2 - 18, 3); g.fill();
  g.restore();
}

const SOU = {
  2: [[120, 88], [120, 232]],
  3: [[120, 88], [72, 232], [168, 232]],
  4: [[72, 88], [168, 88], [72, 232], [168, 232]],
  5: [[60, 88], [180, 88], [120, 160, 'R'], [60, 232], [180, 232]],
  6: [[52, 88], [120, 88], [188, 88], [52, 232], [120, 232], [188, 232]],
};

function drawBird(g) {
  const tails = [[-0.55, GREEN], [-0.27, BLUE], [0, GREEN], [0.27, BLUE], [0.55, GREEN]];
  for (const [a, c] of tails) {
    g.save();
    g.translate(120, 200);
    g.rotate(a);
    ellipse(g, 0, 56, 15, 48, 0, c);
    disc(g, 0, 92, 10, RED);
    hole(g, 0, 92, 4);
    g.restore();
  }
  ellipse(g, 120, 166, 40, 52, 0, GREEN);
  ellipse(g, 106, 176, 15, 30, 0.2, GOLD);
  ellipse(g, 142, 168, 19, 40, -0.35, BLUE);
  disc(g, 116, 98, 26, GREEN);
  disc(g, 104, 66, 7, RED);
  disc(g, 116, 61, 7, RED);
  disc(g, 128, 66, 7, RED);
  g.beginPath(); g.moveTo(93, 92); g.lineTo(66, 104); g.lineTo(94, 110); g.closePath();
  g.fillStyle = GOLD; g.fill();
  hole(g, 109, 94, 7);
  disc(g, 109, 94, 3.5, INK);
}

function drawSou(g, n, red) {
  if (n === 1) { drawBird(g); return; }
  const col = c => red ? RED : (c ? COLORS[c] : GREEN);
  if (SOU[n]) { for (const [x, y, c] of SOU[n]) stick(g, x, y, col(c)); return; }
  if (n === 7) {
    stick(g, 120, 54, col('R'), 0, 28, 76);
    for (const y of [160, 262]) for (const x of [52, 120, 188]) stick(g, x, y, col(), 0, 28, 84);
  } else if (n === 8) {
    const xs = [42, 94, 146, 198];
    const top = [0, 0.32, -0.32, 0], bottom = [0, -0.32, 0.32, 0];
    xs.forEach((x, i) => stick(g, x, 88, col(), top[i], 24));
    xs.forEach((x, i) => stick(g, x, 232, col(), bottom[i], 24));
  } else if (n === 9) {
    for (const y of [58, 160, 262]) for (const x of [52, 120, 188]) stick(g, x, y, col(x === 120 ? 'R' : null), 0, 28, 84);
  }
}

// ---------- 자패 ----------
function drawHonor(g, i) {
  if (i === 4) {
    g.strokeStyle = BLUE;
    g.lineWidth = 10;
    g.beginPath(); g.roundRect(52, 62, 136, 196, 10); g.stroke();
    g.lineWidth = 4;
    g.beginPath(); g.roundRect(66, 76, 108, 168, 6); g.stroke();
    return;
  }
  const ch = '東南西北白發中'[i];
  g.fillStyle = i === 5 ? GREEN : i === 6 ? RED : INK;
  g.font = `900 ${i === 6 ? 200 : 182}px ${SERIF}`;
  g.fillText(ch, 120, 168);
}

const faceCache = new Map();
export function faceCanvas(type, red = false) {
  const key = type * 2 + (red ? 1 : 0);
  if (faceCache.has(key)) return faceCache.get(key);
  const cv = document.createElement('canvas');
  cv.width = FW * SCALE;
  cv.height = FH * SCALE;
  const g = cv.getContext('2d');
  g.scale(SCALE, SCALE);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (type < 9) drawMan(g, type + 1, red);
  else if (type < 18) drawPin(g, type - 8, red);
  else if (type < 27) drawSou(g, type - 17, red);
  else drawHonor(g, type - 27);
  faceCache.set(key, cv);
  return cv;
}

// HTML용 작은 패 이미지(dataURL)
const imgCache = new Map();
export function tileImage(type, red = false) {
  const key = type * 2 + (red ? 1 : 0);
  if (imgCache.has(key)) return imgCache.get(key);
  const cv = document.createElement('canvas');
  cv.width = 104;
  cv.height = 136;
  const g = cv.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 136);
  grd.addColorStop(0, '#fffdf6');
  grd.addColorStop(1, '#e6dec8');
  g.beginPath(); g.roundRect(2, 2, 100, 132, 12);
  g.fillStyle = grd; g.fill();
  g.lineWidth = 2; g.strokeStyle = '#a99d82'; g.stroke();
  g.drawImage(faceCanvas(type, red), 8, 10, 88, 116);
  const url = cv.toDataURL();
  imgCache.set(key, url);
  return url;
}

let backUrl = null;
export function backImage() {
  if (backUrl) return backUrl;
  const cv = document.createElement('canvas');
  cv.width = 104;
  cv.height = 136;
  const g = cv.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 136);
  grd.addColorStop(0, '#7a5bb5');
  grd.addColorStop(1, '#4a3478');
  g.beginPath(); g.roundRect(2, 2, 100, 132, 12);
  g.fillStyle = grd; g.fill();
  g.lineWidth = 2; g.strokeStyle = '#2e1f50'; g.stroke();
  backUrl = cv.toDataURL();
  return backUrl;
}
