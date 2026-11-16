// 3D 장면: 방, 마작 테이블, 3D 패, 상대 캐릭터, 1인칭 카메라
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { faceCanvas } from './textures.js';
import { typeOf, isRedId, doraOf } from './rules.js';
import { line as pickLine, MOOD_IMAGES } from './lines.js';
import { voice, slam as slamSound, riichiBong } from './sfx.js';

// 패 크기(가로, 세로, 두께) — 단위는 대략 cm
export const TW = 2.6, TH = 3.4, TD = 1.9;
const HAND_Z = 34, HAND_X0 = -20, DRAW_GAP = 0.9, MELD_RIGHT = 26, MELD_GAP = 0.6;
const HAND_TILT = -0.55, HAND_Y = 1.95;
const WALL_R = 24.6, WALL_HALF = 8 * TW;
const POND_X0 = -13, POND_Z0 = 4.4, POND_COLS = 10;
const CAM_POS = new THREE.Vector3(0, 30, 58);
const CAM_LOOK = new THREE.Vector3(0, 0, 5);
const OPP_POS = new THREE.Vector3(0, 10, -50);
const BUBBLE_OFFSET = new THREE.Vector2(-17, 4); // 스피키 기준 말풍선 자리(왼쪽, 얼굴 높이)
// 패를 끌어 버릴 때 몸을 숙이는 정도(최대치에서 카메라 이동량)와 그에 필요한 끌기 거리(화면 높이 비율)
const LEAN_DOWN = 10, LEAN_FORWARD = 24, LEAN_SIDE = 0.55, LEAN_LOOK = 0.7, LEAN_DRAG = 0.3;
// 상대 영역(패산 안쪽 상대 쪽 절반)을 누르고 있으면 그 위에서 내려다보는 시점으로 천천히 전환.
// 카메라는 늘 상대 손패(z = -HAND_Z)보다 내 쪽에 있어서 상대 손패의 앞면은 보이지 않는다
const OPP_AREA = { x0: -WALL_R, x1: WALL_R, z0: -WALL_R - TH / 2, z1: -4.5 };
const PEEK_POS = new THREE.Vector3(0, 42, -2), PEEK_LOOK = new THREE.Vector3(0, 0, -14);
const PEEK_SPEED = 0.05, PEEK_PAN = 6;
const TABLE_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const KNOCK_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), -HAND_Y);
const _kq = new THREE.Quaternion(), _kPivot = new THREE.Vector3(), _kAxis = new THREE.Vector3(1, 0, 0);
function knockedPose(base, f, out = { p: new THREE.Vector3(), q: new THREE.Quaternion() }) {
  _kq.setFromAxisAngle(_kAxis, (FLAT_UP - HAND_TILT) * f);
  _kPivot.set(0, -TH / 2, -TD / 2).applyQuaternion(base.q).add(base.p);
  out.p.copy(base.p).sub(_kPivot).applyQuaternion(_kq).add(_kPivot);
  out.q.copy(_kq).multiply(base.q);
  return out;
}
const IVORY = 0xf3eddc, IVORY_DIM = 0x9f998c, IVORY_GRAY = 0x8e8e8e;
const FLAT_UP = -Math.PI / 2, FLAT_DOWN = Math.PI / 2;
const DRAG_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), -3);
// 쯔모할 때 시점: 패산의 패를 잡으면 그 패 위쪽 뒤(내 쪽)에서 내려다본다. 손패 쪽으로 끌어올수록 원래 시점으로 돌아옴
const DRAW_CAM_OFFSET = new THREE.Vector3(0, 22, 24), DRAW_CAM_SPEED = 0.06;
const inRect = (p, r) => p.x >= r.x0 && p.x <= r.x1 && p.z >= r.z0 && p.z <= r.z1;
// 버림패를 놓는 영역(가로 10장 + 리치패 여유, 세로 3줄). 여기에 끌어다 놓아야 버려진다
const POND_RECT = {
  x0: POND_X0 - 0.3, x1: POND_X0 + POND_COLS * TW + (TH - TW) + 0.3,
  z0: POND_Z0 - 0.3, z1: POND_Z0 + 3 * TH + 0.3,
};
// 상대에게 던지기: 날아가는 시간, 맞고 떨어지는 시간, 떨어진 뒤 쉬는 시간(ms), 돌아오는 시간
const THROW_FLY = 420, THROW_FALL = 380, THROW_REST = 300, THROW_RETURN = 650;
// 도라 반짝임: 이 주기(초)마다 한 번, 앞부분 DORA_GLOW_ON 초 동안 빛났다 사라진다. 위치에 따라 살짝 늦게 빛나 물결처럼 지나감
const DORA_GLOW_PERIOD = 2.6, DORA_GLOW_ON = 0.9, DORA_GLOW_WAVE = 0.02;
const REORDER_DZ = 4.5; // 손패 줄에서 이 거리(z) 안에 놓으면 자리 옮기기
const ZONE_FADE = 20; // 끄는 패가 영역에서 이 거리 안으로 들어오면 영역이 보이기 시작
// 테이블 내려치기: 손을 들었다 내려치는 데 SLAM_HAND(ms), 그중 SLAM_IMPACT에 테이블에 닿고 SHAKE_MS 동안 흔들린다
// 패산에서 집은 패를 손패 쪽으로 INSPECT_PULL(0~1, 놓을 영역까지의 비율)만큼 가져온 뒤 INSPECT_MS(ms) 동안 쥐고 있으면
// 패를 손바닥에 올려 앞면을 보여 주고, 그대로 버릴 수도 있다(버릴 때는 손바닥을 아래로 뒤집는다).
// 확인 중인 패는 커서 아래 테이블 지점에서 카메라 쪽으로 INSPECT_LIFT만큼 끌어와 크게 보인다(놓는 위치 판정은 테이블 지점)
const DRAW_MARK = 0x4aa8ff, FLIP_MARK = 0xff3b3b; // 다음에 뽑을 패 / 깡 후 뒤집을 도라 표시패
const SUGGEST_MARK = 0xffc94a, SUGGEST_MS = 6000; // 버터가 추천한 패
const INSPECT_MS = 1000, INSPECT_PULL = 0.35, INSPECT_LIFT = 0.5;
const dropPoint = g => g.floor || g.point;
// 테이블 뒤집기: 제자리에서 가운데(FLIP_PIVOT)를 축으로 FLIP_TABLE_MS 동안 FLIP_ANGLE만큼 넘기고, 패는 날아가 바닥에 떨어진다.
// 축 높이는 테두리 윗면(1)과 바닥의 가운데라서, 반 바퀴 넘어가면 윗면이 바닥에 닿고 다리가 위를 향한다.
// 도는 동안 모서리가 바닥을 뚫지 않게 FLIP_LIFT만큼 들어 올렸다 내려놓는다. 화면은 FLIP_SHAKE 세기로 흔들린다
const FLIP_PIVOT = new THREE.Vector3(0, -19.5, 0), FLIP_ANGLE = Math.PI, FLIP_TABLE_MS = 1300, FLIP_MS = 2800;
const FLIP_LIFT = 28, FLIP_SHAKE = 1.4;
const FLIP_GRAVITY = 70, FLOOR_Y = -40;
// 리치봉 던지기(ms): 버림패를 놓고 STICK_DELAY 뒤, 손을 살짝 내려 점수봉을 집고(~STICK_DIP) 제자리로 올라온 뒤(~STICK_HOLD)
// 손목만 툭 튕겨 놓는다. 손은 거의 움직이지 않고, 봉이 물리(중력·튕김·마찰)대로 날아가 떨어져 멈춘다
const STICK_DELAY = 300, STICK_DIP = 260, STICK_HOLD = 700, STICK_BACK = 450;
const STICK_SOUND_DELAY = 500; // 봉을 놓고 이만큼 뒤에 riichi_bong.wav 재생
// 리치봉 물리: 손에서 놓을 때 STICK_AIR(초) 뒤 겨냥한 곳에 닿도록 던진다. 질량 1인 납작한 막대(STICK_HALF = 크기의 절반)
const STICK_AIR = 0.5, STICK_G = 400, STICK_BOUNCE = 0.2, STICK_FRICTION = 1.3;
// 놓을 때 봉 가운데가 지나가도록 겨냥하는 곳. 봉이 비스듬히 날아와 끝이 먼저 닿으므로 콘솔의 내 쪽 절반(버림패 바로 앞)에 떨어진다
const STICK_AIM = new THREE.Vector3(1, 1.4, 6);
const STICK_HALF = new THREE.Vector3(2.8, 0.11, 0.225);
const STICK_ALONG = [-1, -0.5, 0, 0.5, 1]; // 충돌 검사 점(길이 방향 비율)
const STICK_INV_I = new THREE.Vector3( // 관성 모멘트의 역수(몸체 좌표)
  3 / (STICK_HALF.y ** 2 + STICK_HALF.z ** 2), 3 / (STICK_HALF.x ** 2 + STICK_HALF.z ** 2), 3 / (STICK_HALF.x ** 2 + STICK_HALF.y ** 2),
);
// 봉이 닿는 바닥 높이: 가운데 콘솔 윗면, 그 밖은 테이블 면. 패(놓는 순간의 자리, boxes) 위에 떨어지면 그 윗면
const stickGround = (x, z, boxes) => {
  let y = Math.abs(x) <= 4.2 && Math.abs(z) <= 4.2 ? 1.21 : 0;
  for (const b of boxes) if (x >= b.min.x && x <= b.max.x && z >= b.min.z && z <= b.max.z && b.max.y > y) y = b.max.y;
  return y;
};
const _sv = new THREE.Vector3(), _sa = new THREE.Vector3(), _sb = new THREE.Vector3(), _st = new THREE.Vector3();
const _sq = new THREE.Quaternion(), _sqi = new THREE.Quaternion();
// 세계 좌표 관성 역행렬을 v에 곱한다(q = 봉의 회전)
const stickInvI = (q, v) => v.applyQuaternion(_sqi.copy(q).invert()).multiply(STICK_INV_I).applyQuaternion(q);
// 접점 r에서 방향 n으로 충격량 1을 줄 때 그 방향 속도가 바뀌는 정도
const stickResponse = (q, r, n) => 1 + n.dot(_sb.crossVectors(stickInvI(q, _sa.crossVectors(r, n)), r));
const stickImpulse = (ph, r, j) => { ph.v.add(j); ph.w.add(stickInvI(ph.q, _sa.crossVectors(r, j))); };
const SLAM_HAND = 620, SLAM_IMPACT = 330, SHAKE_MS = 1100, SLAM_TWIST = 0.7;
const inPond = p => p.x >= POND_RECT.x0 && p.x <= POND_RECT.x1 && p.z >= POND_RECT.z0 && p.z <= POND_RECT.z1;
// 손 방향: 평소(우하단에서 손등이 보이게) / 잡기 시작 첫 프레임용(이후엔 패에 맞춰 계산)
const HAND_REST_Q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.55, 0.12, -0.55));
const HAND_GRAB_Q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.5, 0.35, 0.15));
// 손가락 각도 [첫마디, 중간마디, 끝마디] (엄지는 [손허리뼈, 첫마디, 끝마디])
// 잡을 때: 엄지는 패 앞면, 검지는 패 뒷면을 집고 나머지는 접는다. h.pinch(0=벌림, 1=오므림)로 패 두께에 맞춤
// 엄지 손허리뼈는 [굽힘, 벌림] — 손바닥 쪽으로 돌려 검지와 마주 보게 한다
const PINCH_OPEN = { thumb: [[0, 0.3], -0.2, -0.15], index: [-0.6, -0.3, -0.15] };
const PINCH_CLOSED = { thumb: [[0, 0.6], -0.8, -0.65], index: [-1.3, -0.9, -0.45] };
const FOLDED = [-1.35, -1.55, -0.9];
// 확인 중인 패는 손바닥에 올려 든다: 새끼에서 검지 쪽으로 갈수록 조금씩 덜 굽혀 패 왼쪽 모서리를 감싸고,
// 엄지는 패 오른쪽 모서리를 따라 세운다
const PALM_POSE = {
  thumb: [[0.3, -1.3], 0.05, 0.1], index: [[-0.7, 0.05], -0.7, -0.35], middle: [[-0.9, 0], -0.85, -0.42],
  ring: [[-1.1, -0.1], -1.0, -0.5], pinky: [[-1.3, -0.2], -1.2, -0.6],
};
// 손가락 뿌리 관절들의 가운데 → 패를 받치는 지점(손 그룹 좌표: 엄지 쪽 -x, 손바닥 -y, 손목 쪽 +z)
const PALM_OFFSET = new THREE.Vector3(-1.5, -1.5, 3.4);
const PALM_GAP = 0.3; // 패 뒷면과 손바닥 사이
const INSPECT_ROLL = 0.3; // 손을 화면에서 반시계 방향으로 기울이는 각도(손가락이 왼쪽 위를 향함)
const PINCH_PAD = 1.0; // 엄지·검지 끝마디 중심 사이 거리 = 집는 방향의 패 길이 + 이만큼(손가락 살)
const STICK_POSE = { thumb: PINCH_CLOSED.thumb, index: PINCH_CLOSED.index, middle: FOLDED, ring: FOLDED, pinky: FOLDED };
const OPEN_POSE = { thumb: [0.15, 0.1, 0.05], index: [0.12, 0.02, 0], middle: [0.12, 0.02, 0], ring: [0.12, 0.02, 0], pinky: [0.12, 0.02, 0] };
const HAND_SCALE = 0.7, WRIST_Z = 7; // 손 그룹 좌표에서 소매가 시작되는 손목 위치
const ARM_EXTRA = 40;
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q1 = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0);
const _v5 = new THREE.Vector3(), _q2 = new THREE.Quaternion();
const _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3(), _thumb = new THREE.Vector3(), _index = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _A = new THREE.Vector3(), _B = new THREE.Vector3();
const _ax = new THREE.Vector3(), _ay = new THREE.Vector3(), _az = new THREE.Vector3();
const _bx = new THREE.Vector3(), _by = new THREE.Vector3(), _bz = new THREE.Vector3();
const _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4();

// a를 A로, b를 (가능한 한) B로 보내는 회전
function alignQuat(a, b, A, B, out) {
  _ax.copy(a).normalize(); _az.crossVectors(_ax, b).normalize(); _ay.crossVectors(_az, _ax);
  _bx.copy(A).normalize(); _bz.crossVectors(_bx, B).normalize(); _by.crossVectors(_bz, _bx);
  _m1.makeBasis(_ax, _ay, _az);
  _m2.makeBasis(_bx, _by, _bz).multiply(_m1.transpose());
  return out.setFromRotationMatrix(_m2);
}

const euler = new THREE.Euler(0, 0, 0, 'YXZ');
const _flex = new THREE.Quaternion(), _spread = new THREE.Quaternion();
const _xAxis = new THREE.Vector3(1, 0, 0), _yAxis = new THREE.Vector3(0, 1, 0);
// 관절 각도는 굽힘 하나(숫자) 또는 [굽힘, 벌림]
const toPair = a => (Array.isArray(a) ? a : [a || 0, 0]);
const mixAngle = (a, b, t) => {
  const [a0, a1] = toPair(a), [b0, b1] = toPair(b);
  return [a0 + (b0 - a0) * t, a1 + (b1 - a1) * t];
};
const _delta = new THREE.Quaternion(), _restInv = new THREE.Quaternion();

// 형제 관절 사슬을 뿌리부터 차례로 굽힌다. 관절 i는 자신의 y축(벌림)과 x축(굽힘)으로 돌고, 그 회전이 뒤쪽 관절로 전달된다
function poseChain(chain, angles) {
  _delta.identity();
  chain.forEach((j, i) => {
    if (i > 0) {
      const prev = chain[i - 1];
      j.b.position.copy(j.p).sub(prev.p).applyQuaternion(_delta).add(prev.b.position);
    }
    const [flex, spread] = toPair(angles[i]);
    j.b.quaternion.copy(_delta).multiply(j.q)
      .multiply(_spread.setFromAxisAngle(_yAxis, spread))
      .multiply(_flex.setFromAxisAngle(_xAxis, flex));
    _delta.copy(j.b.quaternion).multiply(_restInv.copy(j.q).invert());
  });
}
function makePose(x, y, z, rx, ry = 0) {
  euler.set(rx, ry, 0, 'YXZ');
  return { p: new THREE.Vector3(x, y, z), q: new THREE.Quaternion().setFromEuler(euler) };
}
// seat 0 = 나(+z 쪽), seat 1 = 상대(-z 쪽). 상대 좌표는 테이블 중심 기준 180도 회전
function seatPose(seat, x, y, z, rx, ry = 0) {
  return seat === 0 ? makePose(x, y, z, rx, ry) : makePose(-x, y, -z, rx, ry + Math.PI);
}
const poseKey = ({ p, q }) =>
  `${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)},${q.x.toFixed(3)},${q.y.toFixed(3)},${q.z.toFixed(3)},${q.w.toFixed(3)}`;

function canvasTexture(cv, renderer) {
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

// 니트 옷감 텍스처(색 + 요철). 한 칸에 V자 코 하나, 16×16코가 한 장
const KNIT_STITCHES = 16, KNIT_CELL = 16;
function knitTextures(renderer) {
  const size = KNIT_STITCHES * KNIT_CELL;
  const color = document.createElement('canvas');
  const bump = document.createElement('canvas');
  color.width = color.height = bump.width = bump.height = size;
  const c = color.getContext('2d'), b = bump.getContext('2d');
  c.fillStyle = '#1c162c';
  c.fillRect(0, 0, size, size);
  b.fillStyle = '#000';
  b.fillRect(0, 0, size, size);
  for (let j = 0; j < KNIT_STITCHES; j++) {
    for (let i = 0; i < KNIT_STITCHES; i++) {
      const cx = i * KNIT_CELL + KNIT_CELL / 2, cy = j * KNIT_CELL + KNIT_CELL / 2;
      const shade = 0.9 + Math.random() * 0.2; // 실마다 살짝 다른 색
      for (const side of [-1, 1]) {
        const x = cx + side * 3.6;
        // 색: 가운데가 밝은 실 고리
        const g = c.createRadialGradient(x, cy - 1, 0.5, x, cy, 7);
        g.addColorStop(0, `rgb(${Math.round(78 * shade)}, ${Math.round(63 * shade)}, ${Math.round(118 * shade)})`);
        g.addColorStop(1, `rgb(${Math.round(40 * shade)}, ${Math.round(31 * shade)}, ${Math.round(64 * shade)})`);
        c.fillStyle = g;
        c.beginPath(); c.ellipse(x, cy, 3.4, 7.6, side * 0.5, 0, Math.PI * 2); c.fill();
        // 요철: 실 고리 가운데가 볼록
        const bg = b.createRadialGradient(x, cy, 0.5, x, cy, 7);
        bg.addColorStop(0, '#fff');
        bg.addColorStop(1, '#333');
        b.fillStyle = bg;
        b.beginPath(); b.ellipse(x, cy, 3.4, 7.6, side * 0.5, 0, Math.PI * 2); b.fill();
      }
    }
  }
  const make = (cv, srgb) => {
    const t = new THREE.CanvasTexture(cv);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  };
  return { map: make(color, true), bump: make(bump, false) };
}

// 소맷부리 고무단(세로 골) 요철
// 나무 바닥: 줄마다 이음매를 엇갈려 깐 널빤지와 나뭇결. 색 지도와 이음매 홈(요철) 지도를 함께 만든다(이어 붙여도 티 안 남)
function woodFloorTextures(renderer) {
  const S = 1024, ROWS = 8, H = S / ROWS;
  const make = () => { const c = document.createElement('canvas'); c.width = c.height = S; return c; };
  const cv = make(), bcv = make();
  const g = cv.getContext('2d'), b = bcv.getContext('2d');
  b.fillStyle = '#fff';
  b.fillRect(0, 0, S, S);
  const plank = (x, y, w, hue, light) => {
    g.save();
    g.beginPath(); g.rect(x, y, w, H); g.clip();
    g.fillStyle = `hsl(${hue}, 45%, ${light}%)`;
    g.fillRect(x, y, w, H);
    // 나뭇결: 길게 물결치는 가는 줄
    for (let k = 0; k < 22; k++) {
      const gy = y + Math.random() * H, amp = 1 + Math.random() * 4, freq = 0.004 + Math.random() * 0.01, ph = Math.random() * 6;
      g.strokeStyle = `hsla(${hue - 4}, 50%, ${light - 12 - Math.random() * 8}%, ${0.18 + Math.random() * 0.25})`;
      g.lineWidth = 0.6 + Math.random() * 1.6;
      g.beginPath();
      for (let px = x; px <= x + w; px += 8) g.lineTo(px, gy + Math.sin(px * freq + ph) * amp);
      g.stroke();
    }
    // 가끔 옹이
    if (Math.random() < 0.35) {
      const kx = x + Math.random() * w, ky = y + H * (0.3 + Math.random() * 0.4);
      for (let ring = 4; ring >= 1; ring--) {
        g.fillStyle = `hsla(${hue - 6}, 55%, ${light - 6 - ring * 3}%, 0.5)`;
        g.beginPath(); g.ellipse(kx, ky, ring * 6, ring * 2.2, 0, 0, Math.PI * 2); g.fill();
      }
    }
    g.restore();
    // 이음매: 색 지도는 어둡게, 요철 지도는 홈으로
    for (const ctx of [g, b]) {
      ctx.fillStyle = ctx === g ? 'rgba(20, 10, 5, 0.7)' : '#000';
      ctx.fillRect(x, y, w, 2);
      ctx.fillRect(x, y, 2, H);
    }
  };
  for (let r = 0; r < ROWS; r++) {
    // 한 줄을 널빤지 2~3장으로 나누고, 시작점을 줄마다 다르게(오른쪽 끝을 넘으면 왼쪽으로 이어 그림)
    const n = 2 + Math.floor(Math.random() * 2);
    const lens = Array.from({ length: n }, () => 0.6 + Math.random());
    const sum = lens.reduce((a, c) => a + c, 0);
    let x = Math.random() * S;
    for (const l of lens) {
      const w = l / sum * S, hue = 24 + Math.random() * 8, light = 34 + Math.random() * 10;
      plank(x, r * H, w, hue, light);
      if (x + w > S) plank(x - S, r * H, w, hue, light);
      x += w;
    }
  }
  const map = canvasTexture(cv, renderer), bump = new THREE.CanvasTexture(bcv);
  for (const t of [map, bump]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(10, 10);
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  }
  return { map, bump };
}

function ribTexture(renderer) {
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 8;
  const g = cv.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 64, 0);
  for (let k = 0; k <= 8; k++) grd.addColorStop(k / 8, k % 2 ? '#222' : '#fff');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 8);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 1);
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}

export class View {
  constructor(canvas) {
    this.onTileClick = () => {};
    this.onTileHover = () => {};
    this.onTileKnocked = () => {};
    this.onReorder = () => {};
    this.onTileThrown = () => {};
    this.throws = new Map();
    this.drawCtx = null;
    this.flipCtx = null;
    this.flipArcId = null;
    this.state = null;
    this.grayed = new Set();
    this.drawLean = 0;
    this.drawFocus = new THREE.Vector3();
    this.drawCamPos = new THREE.Vector3();
    this.breakOffset = 0;
    this.selectable = null;
    this.hoverId = null;
    this.grab = null;
    this.mouse = new THREE.Vector2(-9, -9);
    this.mouseN = { x: 0, y: 0 };
    this.camOff = { x: 0, y: 0 };
    this.lean = 0;
    this.peek = 0;
    this.knock = null;
    this.peekEase = 0;
    this.peeking = false;
    this.peekTarget = new THREE.Vector3();
    this.leanFocus = new THREE.Vector3(0, 0, HAND_Z);
    this.lookAt = new THREE.Vector3();
    this.oppAnim = null;
    this.thinking = false;
    this.bubbleEl = document.getElementById('bubble');
    this.dimEl = document.getElementById('inspect-dim');
    this.dim = 0;
    this.bubbleUntil = 0;
    this.lastDiscard = null;

    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1424);
    this.scene.fog = new THREE.Fog(0x1a1424, 140, 300);
    this.camera = new THREE.PerspectiveCamera(58, 1, 1, 600);
    this.camera.position.copy(CAM_POS);
    this.camera.lookAt(CAM_LOOK);

    const pmrem = new THREE.PMREMGenerator(r);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.35;

    this.buildLights();
    this.buildRoom();
    // 테이블·가운데 콘솔·리치봉: 내려칠 때 함께 흔들린다
    this.tableGroup = new THREE.Group();
    this.scene.add(this.tableGroup);
    this.shake = null;
    this.shaken = [];
    this.inspectEnabled = false; // 뽑은 패 확인하기(업적 보상으로 켜짐)
    this.flip = null;
    this.stickToss = null; // 내 리치봉 던지기 연출
    this.buildTable();
    this.buildPondZone();
    this.buildDrawZone();
    this.buildConsole();
    this.buildTiles();
    this.buildMarker();
    this.buildHand();
    this.raycaster = new THREE.Raycaster();
    this.ready = Promise.all([this.buildOpponent(), this.loadHandModel()]);

    this.bindEvents();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    r.setAnimationLoop(() => this.frame());
  }

  // ---------- 장면 구성 ----------
  buildLights() {
    this.scene.add(new THREE.HemisphereLight(0xffe9d0, 0x2a1d3a, 0.55));
    const spot = new THREE.SpotLight(0xfff1dc, 2.6, 0, 0.78, 0.6, 0);
    spot.position.set(0, 72, 12);
    spot.target.position.set(0, 0, 0);
    spot.castShadow = true;
    spot.shadow.mapSize.set(2048, 2048);
    spot.shadow.camera.near = 30;
    spot.shadow.camera.far = 140;
    spot.shadow.bias = -0.0004;
    spot.shadow.normalBias = 0.02;
    this.scene.add(spot, spot.target);
    const fill = new THREE.DirectionalLight(0xd2c4ff, 0.45);
    fill.position.set(0, 30, 70);
    this.scene.add(fill);
  }

  buildRoom() {
    const cv = document.createElement('canvas');
    cv.width = 1024; cv.height = 512;
    const g = cv.getContext('2d');
    const grd = g.createRadialGradient(512, 230, 20, 512, 260, 620);
    grd.addColorStop(0, '#4a3568');
    grd.addColorStop(0.45, '#2a1d3d');
    grd.addColorStop(1, '#140e1c');
    g.fillStyle = grd;
    g.fillRect(0, 0, 1024, 512);
    // 몽글몽글한 빛망울
    for (let i = 0; i < 26; i++) {
      const x = Math.random() * 1024, y = Math.random() * 420, rr = 10 + Math.random() * 40;
      const b = g.createRadialGradient(x, y, 0, x, y, rr);
      b.addColorStop(0, `rgba(255, 210, 140, ${0.10 + Math.random() * 0.12})`);
      b.addColorStop(1, 'rgba(255, 210, 140, 0)');
      g.fillStyle = b;
      g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    }
    // 금색 별
    g.fillStyle = '#f2c46b';
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * 1024, y = Math.random() * 460, s = 2 + Math.random() * 4;
      g.save(); g.translate(x, y); g.rotate(Math.random());
      g.beginPath();
      for (let k = 0; k < 5; k++) {
        const a = k * Math.PI * 2 / 5 - Math.PI / 2;
        g.lineTo(Math.cos(a) * s, Math.sin(a) * s);
        g.lineTo(Math.cos(a + Math.PI / 5) * s * 0.45, Math.sin(a + Math.PI / 5) * s * 0.45);
      }
      g.closePath(); g.globalAlpha = 0.35 + Math.random() * 0.5; g.fill();
      g.restore();
    }
    const backdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(760, 380),
      new THREE.MeshBasicMaterial({ map: canvasTexture(cv, this.renderer), fog: false }),
    );
    backdrop.position.set(0, 50, -190);
    this.scene.add(backdrop);

    const wood = woodFloorTextures(this.renderer);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(1200, 1200),
      new THREE.MeshStandardMaterial({ map: wood.map, bumpMap: wood.bump, bumpScale: 1.5, roughness: 0.55, metalness: 0 }),
    );
    floor.receiveShadow = true;
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = FLOOR_Y;
    this.scene.add(floor);
  }

  buildTable() {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 256;
    const g = cv.getContext('2d');
    g.fillStyle = '#2b6a55';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 9000; i++) {
      const v = Math.random();
      g.fillStyle = v < 0.5 ? `rgba(0,0,0,${Math.random() * 0.12})` : `rgba(255,255,255,${Math.random() * 0.06})`;
      g.fillRect(Math.random() * 256, Math.random() * 256, 1.5, 1.5);
    }
    const feltTex = canvasTexture(cv, this.renderer);
    feltTex.wrapS = feltTex.wrapT = THREE.RepeatWrapping;
    feltTex.repeat.set(6, 6);
    const felt = new THREE.Mesh(
      new THREE.BoxGeometry(72, 1, 72),
      new THREE.MeshStandardMaterial({ map: feltTex, roughness: 0.95 }),
    );
    felt.position.y = -0.5;
    felt.receiveShadow = true;
    this.tableGroup.add(felt);

    const wood = new THREE.MeshStandardMaterial({ color: 0x6b3d22, roughness: 0.42, metalness: 0.05 });
    const rims = [
      [84, 2.4, 6, 0, 39], [84, 2.4, 6, 0, -39],
      [6, 2.4, 72, 39, 0], [6, 2.4, 72, -39, 0],
    ];
    for (const [w, h, d, x, z] of rims) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wood);
      m.position.set(x, -0.2, z);
      m.receiveShadow = true;
      this.tableGroup.add(m);
    }
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3a2116, roughness: 0.6 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(84, 10, 84), bodyMat);
    body.position.y = -6.4;
    body.castShadow = true;
    this.tableGroup.add(body);
    // 다리 네 개: 몸통 아래(-11.4)에서 바닥(FLOOR_Y)까지
    const legH = -11.4 - FLOOR_Y;
    const legGeo = new THREE.BoxGeometry(5, legH, 5);
    for (const [x, z] of [[-36, -36], [36, -36], [-36, 36], [36, 36]]) {
      const leg = new THREE.Mesh(legGeo, bodyMat);
      leg.position.set(x, FLOOR_Y + legH / 2, z);
      leg.castShadow = leg.receiveShadow = true;
      this.tableGroup.add(leg);
    }
  }

  // 버림패 영역 표시(푸른색). 패를 끌고 있을 때만, 영역에 가까워질수록 진해지고 위에 올리면 깜빡인다
  buildPondZone() {
    const w = POND_RECT.x1 - POND_RECT.x0, d = POND_RECT.z1 - POND_RECT.z0;
    const cv = document.createElement('canvas');
    cv.width = 512;
    cv.height = Math.round(512 * d / w);
    const g = cv.getContext('2d');
    g.beginPath(); g.roundRect(6, 6, cv.width - 12, cv.height - 12, 22);
    g.fillStyle = 'rgba(70, 150, 255, 0.38)'; g.fill();
    g.setLineDash([22, 12]);
    g.lineWidth = 6; g.strokeStyle = 'rgba(140, 200, 255, 0.95)'; g.stroke();
    const zone = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshBasicMaterial({ map: canvasTexture(cv, this.renderer), transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
    );
    zone.rotation.x = -Math.PI / 2;
    zone.position.set((POND_RECT.x0 + POND_RECT.x1) / 2, 0.03, (POND_RECT.z0 + POND_RECT.z1) / 2);
    zone.visible = false;
    this.pondZone = zone;
    this.scene.add(zone);
  }

  // 패산에서 가져온 패를 놓는 영역(손패 오른쪽). 패산의 패를 들고 있는 동안에만 보인다
  buildDrawZone() {
    const cv = document.createElement('canvas');
    cv.width = 256;
    cv.height = 256;
    const g = cv.getContext('2d');
    g.beginPath(); g.roundRect(6, 6, 244, 244, 26);
    g.fillStyle = 'rgba(70, 150, 255, 0.38)'; g.fill();
    g.setLineDash([20, 11]);
    g.lineWidth = 7; g.strokeStyle = 'rgba(140, 200, 255, 0.95)'; g.stroke();
    const zone = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: canvasTexture(cv, this.renderer), transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
    );
    zone.rotation.x = -Math.PI / 2;
    zone.visible = false;
    this.drawZone = zone;
    // 다음에 뽑을 패를 감싸는 푸른 빛(깡 후 뒤집을 도라 표시패는 붉은 빛)
    const mark = new THREE.Mesh(
      new RoundedBoxGeometry(TW + 0.5, TH + 0.5, TD + 0.5, 3, 0.4),
      new THREE.MeshBasicMaterial({ color: DRAW_MARK, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
    );
    mark.visible = false;
    this.nextMark = mark;
    this.scene.add(mark);
    // 버터가 추천한 패를 감싸는 금빛(그 패를 버리거나 SUGGEST_MS가 지나면 사라진다)
    this.suggestMark = new THREE.Mesh(
      new RoundedBoxGeometry(TW + 0.5, TH + 0.5, TD + 0.5, 3, 0.4),
      new THREE.MeshBasicMaterial({ color: SUGGEST_MARK, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
    );
    this.suggestMark.visible = false;
    this.suggest = null;
    this.scene.add(this.suggestMark);
    this.scene.add(zone);
  }

  // 내 쯔모 차례: 다음 패산 패(id)를 직접 집어 손패 오른쪽 영역에 놓을 때까지 기다린다. n = 지금 손패 장수
  awaitDraw(id, n) {
    return new Promise(resolve => {
      const x = HAND_X0 + n * TW + DRAW_GAP + TW / 2;
      const rect = { x0: x - TW * 0.95, x1: x + TW * 0.95 + 1.2, z0: HAND_Z - TH / 2 - 1.4, z1: HAND_Z + TH / 2 + 0.6 };
      this.drawZone.position.set((rect.x0 + rect.x1) / 2, 0.03, (rect.z0 + rect.z1) / 2);
      this.drawZone.scale.set(rect.x1 - rect.x0, rect.z1 - rect.z0, 1);
      this.drawCtx = { id, rect, resolve };
      this.setSelectable(new Set([id]), []);
    });
  }

  // 항복 등으로 대국이 끊길 때: 진행 중인 잡기·쯔모·넘어뜨리기·도라 뒤집기 대기를 모두 정리
  cancelInteractions() {
    if (this.grab) this.releaseTile(this.grab.id, false);
    this.grab = null;
    this.drawCtx = null;
    this.flipCtx = null;
    this.knock = null;
    this.peeking = false;
    this.setSelectable(null, []);
    this.hoverId = null;
  }

  // 깡 후: 새 도라 표시패(id)를 클릭해 뒤집을 때까지 기다린다
  awaitFlip(id) {
    return new Promise(resolve => {
      this.flipCtx = { id, resolve };
      this.setSelectable(new Set([id]), []);
    });
  }

  updateDrawZone(t) {
    const g = this.grab;
    const holding = !!(g && g.kind === 'wall' && this.drawCtx);
    const over = holding && g.dragging && g.point && inRect(dropPoint(g), this.drawCtx.rect);
    const m = this.drawZone.material;
    m.opacity += ((over ? 1 : holding ? 0.6 : 0) - m.opacity) * 0.2;
    this.drawZone.visible = m.opacity > 0.01;
    m.color.setScalar(over ? 1.25 + Math.sin(t * 8) * 0.15 : 1);

    // 표시: 쯔모 대기 중이면 다음 패(집기 전까지, 푸른색), 깡 후엔 뒤집을 도라 표시패(붉은색)
    const mark = this.nextMark;
    const markId = this.flipCtx ? this.flipCtx.id : this.drawCtx && !holding ? this.drawCtx.id : null;
    const show = markId != null;
    const mm = mark.material;
    if (markId != null) mm.color.setHex(this.flipCtx ? FLIP_MARK : DRAW_MARK);
    mm.opacity += ((show ? 0.55 + Math.sin(t * 5) * 0.15 : 0) - mm.opacity) * 0.2;
    mark.visible = mm.opacity > 0.01;
    if (markId != null) {
      const tile = this.tiles[markId];
      mark.quaternion.copy(tile.quaternion);
      mark.position.copy(tile.userData.inner.position).applyQuaternion(tile.quaternion).add(tile.position);
    }

    // 버터 추천: 그 패가 아직 내 손에 있는 동안만
    const sg = this.suggest, me = this.state && this.state.players[0];
    const inHand = !!(sg && me && (me.hand.includes(sg.id) || me.drawn === sg.id));
    if (sg && (!inHand || performance.now() > sg.until)) this.suggest = null;
    const sm = this.suggestMark, smm = sm.material;
    smm.opacity += ((this.suggest ? 0.6 + Math.sin(t * 6) * 0.2 : 0) - smm.opacity) * 0.2;
    sm.visible = smm.opacity > 0.01;
    if (sg) {
      const tile = this.tiles[sg.id];
      sm.quaternion.copy(tile.quaternion);
      sm.position.copy(tile.userData.inner.position).applyQuaternion(tile.quaternion).add(tile.position);
    }
  }

  // 버터가 추천한 패를 잠깐 금빛으로 감싼다
  suggestTile(id) {
    this.suggest = { id, until: performance.now() + SUGGEST_MS };
  }

  updatePondZone(t) {
    const g = this.grab;
    const p = g && (g.kind === 'hand' || g.inspect) && g.dragging && !g.aim && dropPoint(g);
    let target = 0;
    if (p) {
      const dx = Math.max(POND_RECT.x0 - p.x, 0, p.x - POND_RECT.x1);
      const dz = Math.max(POND_RECT.z0 - p.z, 0, p.z - POND_RECT.z1);
      target = 1 - Math.min(1, Math.hypot(dx, dz) / ZONE_FADE);
    }
    const over = !!p && inPond(p);
    const m = this.pondZone.material;
    m.opacity += (target - m.opacity) * 0.15;
    this.pondZone.visible = m.opacity > 0.01;
    m.color.setScalar(over ? 1.25 + Math.sin(t * 8) * 0.15 : 1);
  }

  buildConsole() {
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(8.4, 1.2, 8.4),
      new THREE.MeshStandardMaterial({ color: 0x15111d, roughness: 0.35, metalness: 0.4 }),
    );
    box.position.y = 0.6;
    box.castShadow = box.receiveShadow = true;
    this.tableGroup.add(box);
    const cv = document.createElement('canvas');
    cv.width = cv.height = 512;
    this.consoleCtx = cv.getContext('2d');
    this.consoleTex = canvasTexture(cv, this.renderer);
    const top = new THREE.Mesh(
      new THREE.PlaneGeometry(7.6, 7.6),
      new THREE.MeshBasicMaterial({ map: this.consoleTex, toneMapped: false }),
    );
    top.rotation.x = -Math.PI / 2;
    top.position.y = 1.21;
    this.tableGroup.add(top);
    this.updateConsole({ round: '', remain: '' });

    this.sticks = [0, 1].map(seat => {
      const grp = new THREE.Group();
      const stick = new THREE.Mesh(
        new THREE.BoxGeometry(5.6, 0.22, 0.45),
        new THREE.MeshStandardMaterial({ color: 0xf6f2ea, roughness: 0.3 }),
      );
      const dot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.16, 0.24, 16),
        new THREE.MeshStandardMaterial({ color: 0xc3203a, roughness: 0.4 }),
      );
      dot.position.y = 0.01;
      grp.add(stick, dot);
      grp.position.set(0, 1.34, seat === 0 ? 3.0 : -3.0);
      grp.userData.home = grp.position.clone();
      grp.visible = false;
      this.tableGroup.add(grp);
      return grp;
    });
  }

  updateConsole({ round, remain }) {
    const g = this.consoleCtx, S = 512;
    g.fillStyle = '#0d0b14';
    g.fillRect(0, 0, S, S);
    g.strokeStyle = '#4a3a6e';
    g.lineWidth = 12;
    g.strokeRect(14, 14, S - 28, S - 28);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#ffcf6b';
    g.font = '96px MonaS12, sans-serif';
    g.fillText(round, S / 2, S / 2 - 40);
    g.fillStyle = '#9fe3c4';
    g.font = '60px MonaS12, sans-serif';
    g.fillText(remain === '' ? '' : `남은 패 ${remain}`, S / 2, S / 2 + 60);
    this.consoleTex.needsUpdate = true;
  }

  setRiichiStick(seat, on) {
    const s = this.sticks[seat];
    s.visible = on;
    if (on) return;
    if (seat === 0) this.stickToss = null;
    s.position.copy(s.userData.home);
    s.quaternion.identity();
  }

  // 리치봉 물리 한 걸음: 중력 → 이동·회전 → 봉 표면의 점 중 바닥을 파고든 곳마다 충격량으로 튕기고 마찰을 준다.
  // 가장 센 충돌 세기를 돌려준다
  stepStick(ph, dt) {
    ph.v.y -= STICK_G * dt;
    ph.p.addScaledVector(ph.v, dt);
    const wl = ph.w.length();
    if (wl > 1e-6) ph.q.premultiply(_sq.setFromAxisAngle(_sa.copy(ph.w).divideScalar(wl), wl * dt)).normalize();
    ph.w.multiplyScalar(1 - 0.4 * dt);
    // 바닥을 파고든 점들(몸체 중심 기준 위치). 꼭짓점만 보면 모서리를 대각선으로 걸칠 때 가운데가 뚫고 들어가므로
    // 길이 방향으로 다섯 군데씩 검사한다
    let lift = 0, hit = 0;
    const touching = [];
    for (let i = 0; i < 20; i++) {
      const r = new THREE.Vector3(STICK_ALONG[i >> 2], i & 1 ? 1 : -1, i & 2 ? 1 : -1).multiply(STICK_HALF).applyQuaternion(ph.q);
      const depth = stickGround(ph.p.x + r.x, ph.p.z + r.z, ph.boxes) - (ph.p.y + r.y);
      if (depth > 0) { touching.push(r); lift = Math.max(lift, depth); }
    }
    // 튕김은 몸통 전체에 한 번만(느리게 닿을 땐 없음). 그다음 접점들을 몇 번 번갈아 풀어 파고들지 않게 한다
    if (touching.length && ph.v.y < -6) {
      hit = -ph.v.y * (1 + STICK_BOUNCE);
      ph.v.y *= -STICK_BOUNCE;
      // 튕기는 힘만큼 마찰이 미끄러짐을 줄인다
      const vh = Math.hypot(ph.v.x, ph.v.z);
      if (vh > 1e-4) {
        const k = Math.max(0, vh - STICK_FRICTION * hit) / vh;
        ph.v.x *= k;
        ph.v.z *= k;
      }
    }
    for (let it = 0; it < 4; it++) {
      for (const r of touching) {
        _sv.crossVectors(ph.w, r).add(ph.v); // 접점 속도
        if (_sv.y >= 0) continue;
        const jn = -_sv.y / stickResponse(ph.q, r, _up);
        const vt = Math.hypot(_sv.x, _sv.z);
        stickImpulse(ph, r, _st.set(0, jn, 0));
        if (vt > 1e-4) {
          _st.set(_sv.x / vt, 0, _sv.z / vt);
          const jt = Math.min(vt / stickResponse(ph.q, r, _st), STICK_FRICTION * jn);
          stickImpulse(ph, r, _st.multiplyScalar(-jt));
        }
        hit = Math.max(hit, jn);
      }
    }
    if (touching.length) ph.w.multiplyScalar(0.97); // 구름 저항
    ph.p.y += lift;
    return hit;
  }

  // 내 리치: 손으로 1000점봉을 집어 버림패 앞(자리)으로 던진다. 점수 정산은 게임 쪽에서 따로 한다
  tossRiichiStick() {
    this.sticks[0].visible = false;
    this.stickToss = {
      t0: performance.now() + STICK_DELAY,
      from: new THREE.Vector3(), fromQ: new THREE.Quaternion(),
    };
  }

  buildTiles() {
    const frontGeo = new RoundedBoxGeometry(TW, TH, TD * 0.68, 4, 0.24);
    const backGeo = new RoundedBoxGeometry(TW, TH, TD * 0.36, 4, 0.24);
    const faceGeo = new THREE.PlaneGeometry(TW * 0.88, TH * 0.9);
    const ivory = new THREE.MeshPhysicalMaterial({ color: IVORY, roughness: 0.32, clearcoat: 0.55, clearcoatRoughness: 0.25 });
    this.backMat = new THREE.MeshPhysicalMaterial({ color: 0x5b3f8f, roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.2 });
    const faceTex = new Map();
    const texFor = (t, red) => {
      const k = t * 2 + (red ? 1 : 0);
      if (!faceTex.has(k)) faceTex.set(k, canvasTexture(faceCanvas(t, red), this.renderer));
      return faceTex.get(k);
    };
    this.tiles = [];
    for (let id = 0; id < 136; id++) {
      const root = new THREE.Group();
      const inner = new THREE.Group();
      root.add(inner);
      const ivoryMat = ivory.clone();
      const front = new THREE.Mesh(frontGeo, ivoryMat);
      front.position.z = TD / 2 - TD * 0.34;
      const back = new THREE.Mesh(backGeo, this.backMat);
      back.position.z = -TD / 2 + TD * 0.18;
      const faceMat = new THREE.MeshStandardMaterial({
        map: texFor(typeOf(id), isRedId(id)), transparent: true, roughness: 0.4,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      });
      const face = new THREE.Mesh(faceGeo, faceMat);
      face.position.z = TD / 2 + 0.005;
      for (const m of [front, back]) { m.castShadow = true; m.receiveShadow = true; }
      for (const m of [front, back, face]) m.userData.tileId = id;
      inner.add(front, back, face);
      root.userData = { id, inner, ivory: ivoryMat, faceMat, meshes: [front, back, face], lift: 0, anim: null, key: '' };
      const ps = this.wallPose(id, false);
      root.position.copy(ps.p);
      root.quaternion.copy(ps.q);
      this.scene.add(root);
      this.tiles.push(root);
    }
  }

  // 1인칭 오른손(카메라에 붙어서 화면 우하단에 고정). 손가락이 -z, 손등이 +y 방향.
  // 손 모델: WebXR generic-hand (models/right.glb, MIT) — 손가락마다 마디 3개가 있는 스키닝 메시
  buildHand() {
    const rig = new THREE.Group();
    const hand = new THREE.Group();
    rig.add(hand);
    // 소매: 보라색 니트(실 고리 무늬 + 요철 + 천 특유의 가장자리 광택)
    const knit = knitTextures(this.renderer);
    knit.map.repeat.set(3, 1);
    knit.bump.repeat.set(3, 1);
    const sleeveMat = new THREE.MeshPhysicalMaterial({
      map: knit.map, bumpMap: knit.bump, bumpScale: 1.6, roughness: 0.95,
      sheen: 0.7, sheenColor: 0x8a74c8, sheenRoughness: 0.6,
    });
    // 소맷부리: 흰 고무단
    const cuffMat = new THREE.MeshPhysicalMaterial({
      color: 0xf3eddc, roughness: 0.9, bumpMap: ribTexture(this.renderer), bumpScale: 1.2,
      sheen: 0.8, sheenColor: 0xffffff, sheenRoughness: 0.6,
    });
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(3.7, 3.7, 1.8, 32), cuffMat);
    cuff.rotation.x = Math.PI / 2;
    cuff.scale.set(1, 1, 0.78);
    cuff.position.z = 6.6;
    hand.add(cuff);
    hand.quaternion.copy(HAND_REST_Q);
    hand.scale.setScalar(HAND_SCALE);
    // 소매(팔뚝)는 손과 따로 움직인다: 손목에서 화면 밖 팔꿈치 지점까지 매 프레임 이어 붙임
    const armGeo = new THREE.CylinderGeometry(5.2 * HAND_SCALE, 4.0 * HAND_SCALE, 1, 32);
    armGeo.translate(0, 0.5, 0);
    const arm = new THREE.Mesh(armGeo, sleeveMat);
    this.scene.add(this.camera);
    this.camera.add(rig, arm);
    this.hand = {
      rig, hand, arm, knit, chains: null, rest: new THREE.Vector3(), restPos: new THREE.Vector3(), halfW: 1,
      point: 0, reachX: 0, tapT0: -1e9, mode: 'idle', g: 0, open: 0, track: null, follow: null, releaseT0: 0, pinch: 0.3, grabQ: new THREE.Quaternion().copy(HAND_GRAB_Q),
      // 평소 자세에서 소매 끝(팔꿈치)이 있던 곳 = 손 기준 (0, 0, 33)
      elbowOffset: new THREE.Vector3(0, 0, 33 * HAND_SCALE).applyQuaternion(HAND_REST_Q),
    };
  }

  async loadHandModel() {
    const gltf = await new GLTFLoader().loadAsync('models/right.glb');
    const model = gltf.scene;
    model.updateMatrixWorld(true);
    const bone = name => model.getObjectByName(name);
    // 손목 관절 좌표계를 손 그룹 좌표계(손가락 -z, 손등 +y)에 맞추고 cm 단위로 키운다
    const wrist = bone('wrist');
    const wq = new THREE.Quaternion(), wp = new THREE.Vector3();
    wrist.getWorldQuaternion(wq);
    wrist.getWorldPosition(wp);
    const inv = wq.clone().invert();
    const holder = new THREE.Group();
    holder.scale.setScalar(100);
    holder.position.z = 4.5;
    model.quaternion.copy(inv);
    model.position.copy(wp.applyQuaternion(inv).negate());
    holder.add(model);
    this.hand.hand.add(holder);

    const skin = new THREE.MeshPhysicalMaterial({
      color: 0xf4c3a4, roughness: 0.52, sheen: 0.7, sheenColor: 0xff9a80, sheenRoughness: 0.45,
    });
    model.traverse(o => {
      if (o.isSkinnedMesh) { o.material = skin; o.frustumCulled = false; }
    });

    // 관절들이 모두 Armature의 형제 노드라서 손가락 마디를 직접 이어서 굽힌다(순운동학)
    const chain = names => names.map(n => {
      const b = bone(n);
      return { b, p: b.position.clone(), q: b.quaternion.clone() };
    });
    const chains = {};
    for (const f of ['index', 'middle', 'ring', 'pinky']) {
      chains[f] = chain([...['proximal', 'intermediate', 'distal'].map(seg => `${f}-finger-phalanx-${seg}`), `${f}-finger-tip`]);
    }
    chains.thumb = chain(['thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip']);
    this.hand.chains = chains;

    // 손톱: 끝마디 손등 쪽 표면 위에 붙인다. 위치는 메시 정점에서 찾는다
    const nailMat = new THREE.MeshPhysicalMaterial({ color: 0xffd6d8, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.2 });
    const nailGeo = new THREE.SphereGeometry(1, 18, 10);
    const sm = [];
    model.traverse(o => { if (o.isSkinnedMesh) sm.push(o); });
    const v = new THREE.Vector3();
    for (const f of Object.keys(chains)) {
      const distal = chains[f][2].b, tip = chains[f][3].b;
      const len = distal.position.distanceTo(tip.position);
      let top = -Infinity, minX = Infinity, maxX = -Infinity;
      for (const mesh of sm) {
        // 바인드 포즈 기준 끝마디 뼈 좌표 = boneInverse * bindMatrix * 정점
        const boneInv = mesh.skeleton.boneInverses[mesh.skeleton.bones.indexOf(distal)];
        const pos = mesh.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(mesh.bindMatrix).applyMatrix4(boneInv);
          if (v.z > -len * 0.75 || v.z < -len * 1.05 || Math.abs(v.x) > len * 0.9 || Math.abs(v.y) > len) continue;
          if (v.y > top) top = v.y;
          minX = Math.min(minX, v.x);
          maxX = Math.max(maxX, v.x);
        }
      }
      if (top === -Infinity) continue;
      const w = (maxX - minX) * 0.36;
      const nail = new THREE.Mesh(nailGeo, nailMat);
      nail.scale.set(w, w * 0.22, len * 0.42);
      nail.position.set((minX + maxX) / 2, top - w * 0.12, -len * 0.62);
      distal.add(nail);
    }
  }

  // 잡지 않고 버린 경우(리치 후 자동 쯔모기리 등) 손으로 톡 치는 동작
  handTap() {
    if (this.hand.mode !== 'release') this.hand.tapT0 = performance.now();
  }

  // 잡은 패를 놓음. discarded면 패를 따라가며 던지는 동작, 아니면 패를 원래 자리로 돌려놓는다
  releaseTile(id, discarded) {
    const h = this.hand;
    if (discarded) {
      h.mode = 'release';
      h.follow = id;
      h.releaseT0 = performance.now();
      return;
    }
    h.mode = 'idle';
    const tile = this.tiles[id], u = tile.userData;
    if (u.base) {
      u.anim = { fp: tile.position.clone(), fq: tile.quaternion.clone(), tp: u.base.p, tq: u.base.q, t0: performance.now(), dur: 220, arc: 0 };
    }
  }

  // 손으로 잡을 지점(월드 좌표)
  gripTarget(id, out) {
    if (id === 'knock') return out.copy(this.knock ? this.knock.point : out);
    const tile = this.tiles[id], u = tile.userData;
    if (this.grab && this.grab.id === id) {
      // 손패는 위쪽을, 패산 패(누워 있음)는 가운데를 집는다
      if (this.grab.inspect) return out.set(0, 0, -(TD / 2 + PALM_GAP)).applyQuaternion(tile.quaternion).add(tile.position);
      if (this.grab.kind === 'wall') out.copy(tile.position);
      else out.set(0, TH * 0.15, 0).applyQuaternion(tile.quaternion).add(tile.position);
      out.y += u.lift;
      return out;
    }
    return out.copy(tile.position).setY(tile.position.y + 1.2);
  }

  updateHand(now, t) {
    const h = this.hand;
    const grabbing = this.grab != null;
    const hovering = !grabbing && this.hoverId != null;
    const inspecting = grabbing && !!this.grab.inspect;
    h.point += ((hovering ? 1 : 0) - h.point) * 0.15;
    h.palm = (h.palm || 0) + ((inspecting ? 1 : 0) - (h.palm || 0)) * 0.2;

    // 잡기 정도 h.g(0~1)와 손가락 펴기 h.open
    let follow = null;
    const knocking = !!(this.knock && this.knock.active);
    // 리치봉 던지기: 손을 살짝 내려(dip) 점수봉을 집고 제자리로 올라온 뒤, 놓는 순간 손목을 앞으로 툭(flick)
    const st = this.stickToss;
    const se = st ? now - st.t0 : -1;
    let dip = 0, flick = 0;
    h.stick = 0;
    if (se >= 0) {
      if (se < STICK_DIP) dip = Math.sin(Math.PI / 2 * se / STICK_DIP);
      else if (se < STICK_HOLD) { const k = (se - STICK_DIP) / (STICK_HOLD - STICK_DIP); dip = 1 - k * k * (3 - 2 * k); }
      const fk = (se - (STICK_HOLD - 120)) / 320;
      if (fk > 0 && fk < 1) flick = Math.sin(Math.PI * fk);
      h.stick = se < STICK_HOLD ? Math.min(1, se / 150) : Math.max(0, 1 - (se - STICK_HOLD) / 200);
    }
    if (knocking) {
      follow = 'knock';
      h.g += (1 - h.g) * 0.25;
      h.open += (0.6 - h.open) * 0.2;
    } else if (grabbing) {
      follow = this.grab.id;
      h.g += (1 - h.g) * 0.2;
      h.open += (0 - h.open) * 0.3;
    } else if (h.mode === 'release') {
      const k = (now - h.releaseT0) / 520;
      if (k >= 1) { h.mode = 'idle'; h.open = 0; h.palmDown = false; } else {
        follow = h.follow;
        h.g = k < 0.3 ? 1 : 1 - (k - 0.3) / 0.7;
        h.open = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
      }
    }
    if (follow == null) {
      h.g += (0 - h.g) * 0.15;
      h.open += (0 - h.open) * 0.2;
      if (h.g < 0.002) { h.g = 0; h.track = null; }
    }

    // 가리킨 패 쪽으로 손을 조금 옮긴다
    let reach = 0;
    if (hovering) {
      const ndc = this.tiles[this.hoverId].position.clone().project(this.camera);
      reach = Math.max(-0.7, Math.min(0, ndc.x - 0.9)) * h.halfW * 0.18;
    }
    h.reachX += (reach - h.reachX) * 0.12;
    const k = (now - h.tapT0) / 320;
    const tap = k >= 0 && k < 1 ? Math.sin(Math.PI * k) : 0;
    // 내려치기: 주먹을 쥐고 들어 올렸다가(rise) 테이블로 내려친(hit) 뒤 제자리로
    const sk = (now - h.slamT0) / SLAM_HAND;
    let rise = 0, hit = 0;
    h.fist = 0;
    if (sk >= 0 && sk < 1) {
      const ki = SLAM_IMPACT / SLAM_HAND, up = ki * 0.7;
      if (sk < up) rise = Math.sin(Math.PI / 2 * sk / up);
      else if (sk < ki) { const e = (sk - up) / (ki - up); rise = 1 - e; hit = e * e; }
      else hit = 1 - (sk - ki) / (1 - ki) * ((sk - ki) / (1 - ki));
      h.fist = Math.min(1, sk / 0.25, (1 - sk) / 0.3);
    }
    const restPos = h.restPos.set(
      h.rest.x + h.reachX - (rise + hit) * 1.5 + dip * 0.5 - flick * 0.6,
      h.rest.y + Math.sin(t * 1.6) * 0.25 + h.point * 0.8 - tap * 1.8 - this.peekEase * 14 + rise * 8 + hit * 1.2 - dip * 1.5 + flick * 1.2,
      h.rest.z - tap * 3.5 - hit * 3 - flick * 2,
    );
    if (h.g > 0) {
      if (!h.track) h.track = h.rig.position.clone();
      h.rig.position.lerpVectors(restPos, h.track, h.g);
    } else h.rig.position.copy(restPos);
    // 내려칠 때는 손목을 오른쪽(시계 방향)으로 돌린다
    h.rig.rotation.set((Math.sin(t * 1.1) * 0.015 - tap * 0.15) * (1 - h.g), 0, Math.sin(t * 0.8) * 0.02 * (1 - h.g) - h.fist * SLAM_TWIST);
    if (!h.chains) {
      h.hand.quaternion.slerpQuaternions(HAND_REST_Q, HAND_GRAB_Q, h.g);
      this.updateArm();
      return;
    }

    // 손가락: 평소/가리키기 → 잡기(엄지·검지로 집고 나머지는 접음) → 펴기 순으로 섞는다(음수 = 손바닥 쪽으로 굽힘)
    const p = h.point, breathe = Math.sin(t * 1.3) * 0.03;
    const relaxed = [-0.22, -0.38, -0.25], fist = [-1.35, -1.55, -0.9];
    for (const [f, ch] of Object.entries(h.chains)) {
      let angles;
      if (f === 'thumb') angles = [0, -0.2 - p * 0.35, -0.25 - p * 0.45];
      else if (f === 'index') angles = relaxed.map((r, i) => r * (1 - p) + [0.04, 0, 0][i] * p);
      else angles = relaxed.map((r, i) => r + (fist[i] - r) * p + breathe);
      const grab = PINCH_OPEN[f] ? PINCH_OPEN[f].map((o, i) => mixAngle(o, PINCH_CLOSED[f][i], h.pinch)) : FOLDED;
      angles = angles.map((a, i) => mixAngle(mixAngle(a, grab[i], h.g), OPEN_POSE[f][i], h.open));
      if (h.palm > 0.001) angles = angles.map((a, i) => mixAngle(a, PALM_POSE[f][i], h.palm));
      if (h.fist > 0) angles = angles.map((a, i) => mixAngle(a, f === 'thumb' ? [[0, 0.5], -0.7, -0.6][i] : FOLDED[i], h.fist));
      if (h.stick > 0) angles = angles.map((a, i) => mixAngle(a, STICK_POSE[f][i], h.stick));
      poseChain(ch, angles);
    }

    // 엄지·검지 끝마디에서 패와 닿는 지점
    const c = h.chains;
    const pads = () => {
      h.hand.updateMatrixWorld(true);
      _thumb.lerpVectors(c.thumb[2].b.getWorldPosition(_v3), c.thumb[3].b.getWorldPosition(_v4), 0.6);
      _index.lerpVectors(c.index[2].b.getWorldPosition(_v3), c.index[3].b.getWorldPosition(_v4), 0.6);
    };
    // 손바닥 면 가운데
    const palm = out => {
      h.hand.updateMatrixWorld(true);
      out.set(0, 0, 0);
      for (const f of ['index', 'middle', 'ring', 'pinky']) out.add(h.hand.worldToLocal(c[f][0].b.getWorldPosition(_v3)));
      return h.hand.localToWorld(out.multiplyScalar(0.25).add(PALM_OFFSET));
    };
    this.camera.updateMatrixWorld(true);
    pads();

    // 잡는 동안: 엄지→검지 방향이 패의 앞면→뒷면이 되고 손등이 위를 보도록 손을 돌리고,
    // 엄지와 검지 사이가 패 두께가 되도록 오므린다
    if (grabbing) {
      h.hand.worldToLocal(_a.copy(_index));
      h.hand.worldToLocal(_b.copy(_thumb));
      _a.sub(_b);
      h.rig.getWorldQuaternion(_q1).invert();
      // 손패: 엄지는 앞면, 검지는 뒷면. 패산 패: 패산 줄과 수직인 긴 쪽 양 끝을 집는다(옆 패와 붙어 있으므로)
      const tile = this.tiles[follow];
      if (inspecting) {
        // 확인 중: 손가락은 패의 위쪽으로, 손등은 패 뒤쪽(카메라 반대)으로 — 손바닥이 패 뒷면을 받친다
        _A.set(-Math.sin(INSPECT_ROLL), Math.cos(INSPECT_ROLL), 0).applyQuaternion(tile.quaternion).applyQuaternion(_q1);
        _B.set(0, 0, -1).applyQuaternion(tile.quaternion).applyQuaternion(_q1);
        alignQuat(_a.set(0, 0, -1), _b.set(0, 1, 0), _A, _B, _q2);
        h.grabQ.slerp(_q2, 0.25);
      } else {
        let extent;
        if (this.grab.kind === 'wall') {
          _A.set(0, 1, 0).applyQuaternion(tile.quaternion).setY(0).normalize();
          if (_A.dot(_v5.copy(tile.position).sub(this.camera.position)) < 0) _A.negate();
          extent = TH;
        } else {
          _A.set(0, 0, -1).applyQuaternion(tile.quaternion);
          extent = TD;
        }
        _A.applyQuaternion(_q1);
        _B.set(0, 1, 0).applyQuaternion(_q1);
        alignQuat(_a, _b.set(0, 1, 0), _A, _B, h.grabQ);
        h.pinch = THREE.MathUtils.clamp(h.pinch + (_thumb.distanceTo(_index) - extent - PINCH_PAD) * 0.08, 0, 1);
      }
    }
    // 손바닥에 올려 본 패를 버릴 때: 손바닥을 아래로(손등 위, 손가락은 앞으로) 뒤집으며 내려놓는다
    if (h.mode === 'release' && h.palmDown) {
      h.rig.getWorldQuaternion(_q1).invert();
      _A.set(0, 0, -1).applyQuaternion(_q1);
      _B.set(0, 1, 0).applyQuaternion(_q1);
      alignQuat(_a.set(0, 0, -1), _b.set(0, 1, 0), _A, _B, _q2);
      h.grabQ.slerp(_q2, 0.3);
    }
    h.hand.quaternion.slerpQuaternions(HAND_REST_Q, knocking ? HAND_REST_Q : h.grabQ, h.g);

    // 엄지·검지 사이 중간이 잡을 지점에 오도록 손 위치를 매 프레임 보정
    if (follow != null && h.g > 0) {
      if (inspecting) palm(_v2);
      else {
        pads();
        _v2.addVectors(_thumb, _index).multiplyScalar(0.5);
      }
      this.gripTarget(follow, _v1).sub(_v2);
      _v1.applyQuaternion(this.camera.getWorldQuaternion(_q1).invert());
      h.track.addScaledVector(_v1, 0.6 / Math.max(h.g, 0.15));
    }
    // 리치봉: 집은 동안은 엄지·검지 사이에 끼워 두고, 놓으면 물리대로 떨어져 튕기다 멈춘다
    if (st && se >= STICK_DIP * 0.8) {
      const stick = this.sticks[0];
      stick.visible = true;
      if (se < STICK_HOLD) {
        pads();
        stick.position.addVectors(_thumb, _index).multiplyScalar(0.5);
        h.hand.getWorldQuaternion(stick.quaternion);
        st.from.copy(stick.position);
        st.fromQ.copy(stick.quaternion);
      } else {
        if (!st.phys) {
          // 놓는 순간: STICK_AIR 초 뒤 겨냥한 곳에 닿는 속도로, 살짝 돌면서
          const r = (a, b) => a + Math.random() * (b - a);
          const v = new THREE.Vector3().subVectors(STICK_AIM, st.from).divideScalar(STICK_AIR);
          v.y += 0.5 * STICK_G * STICK_AIR;
          // 날아가는 동안 고르게 돌아서, 닿을 때쯤 거의 눕도록(가로 방향, 약간 비뚤게) 회전 속도를 정한다
          const flat = _sq.setFromAxisAngle(_up, r(-0.3, 0.3));
          const turn = flat.multiply(_sqi.copy(st.fromQ).invert());
          if (turn.w < 0) turn.set(-turn.x, -turn.y, -turn.z, -turn.w);
          const ang = 2 * Math.acos(Math.min(1, turn.w)), sn = Math.sqrt(1 - turn.w * turn.w);
          const w = sn > 1e-4 ? new THREE.Vector3(turn.x, turn.y, turn.z).divideScalar(sn).multiplyScalar(ang / STICK_AIR) : new THREE.Vector3();
          w.add(new THREE.Vector3(r(-0.3, 0.3), r(-0.6, 0.6), r(-0.3, 0.3)));
          // 테이블 위 패들의 자리(손패·패산·버림패). 봉이 날아가는 짧은 동안은 움직이지 않는다고 본다
          const boxes = this.tiles.filter(t => t.position.y < 8).map(t => new THREE.Box3().setFromObject(t));
          st.phys = { p: st.from.clone(), q: st.fromQ.clone(), v, w, boxes, last: now, still: 0 };
          setTimeout(() => riichiBong(), STICK_SOUND_DELAY); // 던지는 소리. 부딪힐 때마다 따로 소리를 내지는 않는다
        }
        const ph = st.phys;
        if (!ph.asleep) {
          const dt = Math.min(0.05, (now - ph.last) / 1000), n = Math.max(1, Math.ceil(dt / 0.002));
          ph.last = now;
          for (let i = 0; i < n; i++) this.stepStick(ph, dt / n);
          ph.still = ph.v.length() < 1 && ph.w.length() < 1.5 ? ph.still + 1 : 0;
          if (ph.still > 10) ph.asleep = true;
        }
        stick.position.copy(ph.p);
        stick.quaternion.copy(ph.q);
        if (ph.asleep && se >= STICK_HOLD + STICK_BACK) this.stickToss = null;
      }
    }
    this.updateArm();
  }

  // 손목 → 팔꿈치로 소매를 잇는다. 팔꿈치는 화면 밖 우하단에 두고 손이 움직인 만큼 조금만 따라간다
  updateArm() {
    const h = this.hand;
    this.camera.updateMatrixWorld(true);
    const wrist = this.camera.worldToLocal(h.hand.localToWorld(_v1.set(0, 0, WRIST_Z)));
    const elbow = _v2.copy(h.rest).add(h.elbowOffset);
    elbow.x += (h.rig.position.x - h.rest.x) * 0.8;
    elbow.y += (h.rig.position.y - h.rest.y) * 0.8;
    elbow.z += (h.rig.position.z - h.rest.z) * 0.8;
    const dir = elbow.sub(wrist);
    const len = dir.length();
    h.arm.position.copy(wrist);
    h.arm.quaternion.setFromUnitVectors(_up, dir.divideScalar(len));
    // 팔꿈치 너머로 길게 늘려서, 몸을 숙여도 소매 끝이 화면 안에 보이지 않게
    h.arm.scale.set(1, len + ARM_EXTRA, 1);
    // 팔 길이가 바뀌어도 코 크기가 일정하도록(둘레 한 바퀴에 48코 ≈ 코 하나 0.4)
    const rows = (len + ARM_EXTRA) / (KNIT_STITCHES * 0.4);
    h.knit.map.repeat.y = h.knit.bump.repeat.y = rows;
  }

  buildMarker() {
    const m = new THREE.Mesh(
      new THREE.ConeGeometry(0.55, 1.1, 4),
      new THREE.MeshStandardMaterial({ color: 0xffcf6b, emissive: 0xffa21f, emissiveIntensity: 0.8 }),
    );
    m.rotation.x = Math.PI;
    m.visible = false;
    this.marker = m;
    this.scene.add(m);
  }

  async buildOpponent() {
    // 표정별 그림을 모두 불러 둔다: { normal: [{ url, tex }], happy: [...], sad: [...] }
    const loader = new THREE.TextureLoader();
    this.moodTex = {};
    for (const [mood, urls] of Object.entries(MOOD_IMAGES)) {
      this.moodTex[mood] = await Promise.all(urls.map(async url => {
        const t = await loader.loadAsync(url);
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
        return { url, tex: t };
      }));
    }
    this.mood = 'normal';
    this.moodUntil = Infinity;
    const tex = this.moodTex.normal[0].tex;
    const aspect = tex.image.width / tex.image.height;
    const h = 40;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.04, toneMapped: false, fog: false });
    const geo = new THREE.PlaneGeometry(h * aspect, h);
    this.opp = new THREE.Mesh(geo, mat);
    this.opp.position.copy(OPP_POS);
    this.opp.rotation.x = -0.12;
    this.scene.add(this.opp);
  }

  // ---------- 배치 ----------
  wallPose(i, faceUp) {
    const s = i >> 1, top = (i & 1) === 0;
    const gi = (s + this.breakOffset) % 68, side = Math.floor(gi / 17), k = gi % 17;
    const a = WALL_HALF - k * TW, y = top ? TD * 1.5 + 0.02 : TD * 0.5;
    const rx = faceUp ? FLAT_UP : FLAT_DOWN;
    switch (side) {
      case 0: return makePose(a, y, WALL_R, rx, 0);
      case 1: return makePose(-WALL_R, y, a, rx, Math.PI / 2);
      case 2: return makePose(-a, y, -WALL_R, rx, Math.PI);
      default: return makePose(WALL_R, y, -a, rx, -Math.PI / 2);
    }
  }

  handPose(seat, x, revealed) {
    if (seat === 0) {
      const stand = seatPose(0, x, HAND_Y, HAND_Z, HAND_TILT);
      return revealed ? knockedPose(stand, 1) : stand;
    }
    if (revealed) return makePose(-x, HAND_Y, -HAND_Z, HAND_TILT, 0);
    return seatPose(1, x, TH / 2, HAND_Z, 0);
  }

  layoutMeld(seat, m, right, put) {
    const ids = m.ids;
    let items;
    switch (m.type) {
      case 'chi': items = [{ id: ids[0], side: true }, { id: ids[1] }, { id: ids[2] }]; break;
      case 'pon': items = [{ id: ids[0] }, { id: ids[1], side: true }, { id: ids[2] }]; break;
      case 'minkan': items = [{ id: ids[0] }, { id: ids[1], side: true }, { id: ids[2] }, { id: ids[3] }]; break;
      case 'kakan': items = [{ id: ids[0] }, { id: ids[1], side: true }, { id: ids[2] }, { id: ids[3], stack: true }]; break;
      default: items = [{ id: ids[0], down: true }, { id: ids[1] }, { id: ids[2] }, { id: ids[3], down: true }];
    }
    const width = items.reduce((s, it) => s + (it.stack ? 0 : it.side ? TH : TW), 0);
    let x = right - width;
    const zc = HAND_Z + 0.3, zs = zc + (TH - TW) / 2;
    let sideX = 0;
    for (const it of items) {
      if (it.stack) { put(it.id, seatPose(seat, sideX, TD / 2, zs - TW, FLAT_UP, Math.PI / 2)); continue; }
      const w = it.side ? TH : TW, cx = x + w / 2;
      if (it.side) {
        sideX = cx;
        put(it.id, seatPose(seat, cx, TD / 2, zs, FLAT_UP, Math.PI / 2));
      } else {
        put(it.id, seatPose(seat, cx, TD / 2, zc, it.down ? FLAT_DOWN : FLAT_UP));
      }
      x += w;
    }
    return right - width - MELD_GAP;
  }

  // 게임 상태에 맞춰 모든 패의 목표 위치를 계산하고 애니메이션
  sync(g, dur = 260) {
    this.state = g;
    this.updateGrayDiscards();
    this.updateDoraGlow(g);
    const placed = new Set();
    const put = (id, ps) => { placed.add(id); this.setTarget(id, ps, dur); };
    for (const p of g.players) {
      const seat = p.seat;
      const n = p.hand.length;
      p.hand.forEach((id, i) => {
        const idx = seat === 1 && p.revealed ? n - 1 - i : i;
        put(id, this.handPose(seat, HAND_X0 + idx * TW + TW / 2, p.revealed));
      });
      if (p.drawn != null) {
        const x = seat === 1 && p.revealed ? HAND_X0 - DRAW_GAP - TW / 2 : HAND_X0 + n * TW + DRAW_GAP + TW / 2;
        put(p.drawn, this.handPose(seat, x, p.revealed));
      }
      let right = MELD_RIGHT;
      for (const m of p.melds) right = this.layoutMeld(seat, m, right, put);
      let col = 0, row = 0, x = POND_X0;
      for (const d of p.discards) {
        if (d.called) continue;
        const w = d.sideways ? TH : TW;
        const z = POND_Z0 + row * TH + TH / 2;
        put(d.id, seatPose(seat, x + w / 2, TD / 2, z, FLAT_UP, d.sideways ? Math.PI / 2 : 0));
        x += w;
        if (++col === POND_COLS) { col = 0; row++; x = POND_X0; }
      }
    }
    for (let i = 0; i < 136; i++) {
      const id = g.wall[i];
      if (!placed.has(id)) put(id, this.wallPose(i, g.isDoraShown(i)));
    }
  }

  // 패산의 패를 i번 자리로 즉시 옮긴다(애니메이션 없이: 신역 바꿔치기가 보이지 않게)
  placeInWall(id, i) {
    this.setTarget(id, this.wallPose(i, false), 0);
  }

  setTarget(id, ps, dur) {
    const tile = this.tiles[id];
    const u = tile.userData;
    const key = poseKey(ps);
    if (u.key === key) return;
    u.key = key;
    u.base = ps;
    if (dur <= 0) {
      tile.position.copy(ps.p);
      tile.quaternion.copy(ps.q);
      u.anim = null;
      return;
    }
    const dist = tile.position.distanceTo(ps.p);
    const flipArc = this.flipArcId === id;
    if (flipArc) this.flipArcId = null;
    u.anim = {
      fp: tile.position.clone(), fq: tile.quaternion.clone(),
      tp: ps.p, tq: ps.q, t0: performance.now(), dur,
      arc: flipArc ? 3 : dist > 4 ? Math.min(5, dist * 0.12) : 0,
    };
  }

  // 선택 가능한 패 지정(나머지 손패는 어둡게)
  setSelectable(set, handIds) {
    const active = set && set.size ? set : null;
    this.selectable = active;
    if (this.grab && !(active && active.has(this.grab.id))) {
      this.releaseTile(this.grab.id, false);
      this.grab = null;
    }
    for (const id of handIds) {
      const u = this.tiles[id].userData;
      const dim = !!active && !active.has(id);
      u.ivory.color.setHex(dim ? IVORY_DIM : IVORY);
      u.faceMat.color.setScalar(dim ? 0.55 : 1);
    }
    this.updateHover();
  }

  setLastDiscard(id) { this.lastDiscard = id; }

  // ---------- 상대 연출 ----------
  // 테이블 내려치기: 손을 내려친 순간부터 테이블과 패가 흔들린다. 흔들림이 끝나면 풀리는 Promise
  slam() {
    const now = performance.now();
    this.hand.slamT0 = now;
    // 패마다 튀어 오르는 높이·빠르기·기울기를 다르게
    const n = this.tiles.length;
    const r = (a, b) => a + Math.random() * (b - a);
    this.shake = {
      t0: now + SLAM_IMPACT,
      hop: Float32Array.from({ length: n }, () => r(0.15, 0.7)),
      freq: Float32Array.from({ length: n }, () => r(2.6, 4.2)),
      phase: Float32Array.from({ length: n }, () => r(0, 0.25)),
      tilt: Array.from({ length: n }, () => new THREE.Vector3(r(-1, 1), 0, r(-1, 1)).normalize()),
      tiltAmt: Float32Array.from({ length: n }, () => r(0.04, 0.16)),
    };
    setTimeout(() => {
      slamSound();
      this.react('hop');
    }, SLAM_IMPACT);
    return new Promise(res => setTimeout(res, SLAM_IMPACT + SHAKE_MS));
  }

  // 뽑은 패를 손에 들고 확인하는 동안 주변을 어둡게: 패 둘레만 밝게 남긴다
  updateInspectDim() {
    const g = this.grab;
    const on = !!(g && g.inspect);
    this.dim += ((on ? 1 : 0) - this.dim) * 0.12;
    if (this.dim < 0.005) {
      if (this.dimEl.style.opacity !== '0') this.dimEl.style.opacity = '0';
      return;
    }
    this.dimEl.style.opacity = this.dim.toFixed(3);
    if (!on) return; // 사라지는 동안은 마지막 자리 그대로
    const tile = this.tiles[g.id];
    const c = _v3.copy(tile.position).project(this.camera);
    const top = _v4.set(0, TH / 2, 0).applyQuaternion(tile.quaternion).add(tile.position).project(this.camera);
    const w = window.innerWidth, h = window.innerHeight;
    const px = (c.x + 1) / 2 * w, py = (1 - c.y) / 2 * h;
    const half = Math.hypot((top.x - c.x) / 2 * w, (top.y - c.y) / 2 * h);
    const st = this.dimEl.style;
    st.setProperty('--x', `${px.toFixed(1)}px`);
    st.setProperty('--y', `${py.toFixed(1)}px`);
    st.setProperty('--r', `${Math.max(60, half * 2.4).toFixed(1)}px`);
  }

  // 항복 메뉴의 테이블 뒤집기: 테이블이 넘어가며 패가 모두 날아간다. 연출이 끝나면 풀리는 Promise
  flipTable() {
    const now = performance.now();
    const r = (a, b) => a + Math.random() * (b - a);
    this.shake = null;
    this.tableGroup.position.set(0, 0, 0);
    this.flip = {
      t0: now, last: now,
      tiles: this.tiles.map(tile => {
        tile.userData.anim = null;
        tile.userData.key = ''; // 다음 판에 다시 제자리로 옮겨지도록
        return {
          // 내 쪽(앞)에 있는 패부터 먼저 튀어 오른다
          delay: 60 + Math.max(0, HAND_Z - tile.position.z) * 4 + r(0, 80),
          v: new THREE.Vector3(r(-14, 14), r(30, 50), r(-34, -10)),
          w: new THREE.Vector3(r(-14, 14), r(-14, 14), r(-14, 14)),
          down: false,
        };
      }),
    };
    this.lastDiscard = null;
    slamSound(1);
    this.react('shake');
    return new Promise(res => setTimeout(res, FLIP_MS));
  }

  // 다음 대국을 위해 테이블을 제자리로
  resetTable() {
    this.flip = null;
    this.tableGroup.position.set(0, 0, 0);
    this.tableGroup.quaternion.identity();
  }

  updateFlip(now) {
    const f = this.flip;
    if (!f) return;
    const dt = Math.min(0.05, (now - f.last) / 1000);
    f.last = now;
    const k = Math.min(1, (now - f.t0) / FLIP_TABLE_MS);
    const e = k * k * (3 - 2 * k); // 가장 높이 떴을 때 딱 세워지도록(반 바퀴의 절반)
    _q1.setFromAxisAngle(_xAxis, -FLIP_ANGLE * e);
    this.tableGroup.quaternion.copy(_q1);
    this.tableGroup.position.copy(FLIP_PIVOT).sub(_v1.copy(FLIP_PIVOT).applyQuaternion(_q1));
    this.tableGroup.position.y += Math.sin(Math.PI * k) * FLIP_LIFT;
    this.tiles.forEach((tile, i) => {
      const s = f.tiles[i];
      if (now - f.t0 < s.delay || s.rest) return;
      s.v.y -= FLIP_GRAVITY * dt;
      tile.position.addScaledVector(s.v, dt);
      const spin = s.w.length();
      if (spin > 0.01) tile.quaternion.premultiply(_q2.setFromAxisAngle(_v2.copy(s.w).divideScalar(spin), spin * dt));
      // 바닥에 닿으면 조금 튀다가 멈춘다
      if (tile.position.y < FLOOR_Y + TD / 2) {
        tile.position.y = FLOOR_Y + TD / 2;
        s.v.y = -s.v.y * 0.3;
        s.v.x *= 0.6; s.v.z *= 0.6; s.w.multiplyScalar(0.5);
        if (Math.abs(s.v.y) < 2) s.rest = true;
      }
    });
  }

  // 그리기 직전에 흔들림을 더하고(applyShake), 그린 뒤 원래대로 돌린다(clearShake): 패의 실제 자리·애니메이션은 그대로
  applyShake(now) {
    const s = this.shake;
    if (!s) return;
    const k = (now - s.t0) / SHAKE_MS;
    if (k < 0) return;
    if (k >= 1) { this.shake = null; this.tableGroup.position.set(0, 0, 0); return; }
    const env = (1 - k) * (1 - k), tt = k * SHAKE_MS / 1000;
    // 테이블: 쿵 하고 눌렸다가 튀어 오르며 좌우로 덜덜
    const off = _v3.set(
      Math.sin(tt * 2 * Math.PI * 13) * 0.35 * env,
      -Math.cos(tt * 2 * Math.PI * 7) * 0.5 * Math.exp(-k * 6),
      Math.sin(tt * 2 * Math.PI * 11 + 1) * 0.28 * env,
    );
    this.tableGroup.position.copy(off);
    for (const tile of this.tiles) {
      const u = tile.userData, i = u.id;
      if (this.throws.has(i) || (this.grab && this.grab.id === i)) continue;
      const ph = Math.max(0, k - s.phase[i]) * SHAKE_MS / 1000;
      const bounce = Math.abs(Math.sin(ph * Math.PI * s.freq[i])) * s.hop[i] * env;
      const d = new THREE.Vector3(off.x, off.y + bounce, off.z);
      const q = tile.quaternion.clone();
      this.shaken.push([tile, d, q]);
      tile.position.add(d);
      tile.quaternion.premultiply(_q1.setFromAxisAngle(s.tilt[i], Math.sin(ph * Math.PI * s.freq[i] * 2) * s.tiltAmt[i] * env));
    }
  }

  clearShake() {
    for (const [tile, d, q] of this.shaken) {
      tile.position.sub(d);
      tile.quaternion.copy(q);
    }
    this.shaken.length = 0;
  }

  react(type) {
    const dur = { hop: 450, nod: 300, joy: 1400, shake: 700, sad: 1200 }[type] || 500;
    this.oppAnim = { type, t0: performance.now(), dur };
  }
  setThinking(on) { this.thinking = on; }
  // 표정 바꾸기: 'happy' / 'sad' / 'normal'. ms 뒤 평소 표정으로(Infinity면 유지). 고른 그림 경로를 돌려준다
  setMood(mood, ms = 2500) {
    if (!this.opp || !this.moodTex[mood]) return MOOD_IMAGES.normal[0];
    const list = this.moodTex[mood];
    const pick = list[Math.floor(Math.random() * list.length)];
    this.opp.material.map = pick.tex;
    this.mood = mood;
    this.moodUntil = mood === 'normal' ? Infinity : performance.now() + ms;
    return pick.url;
  }

  say(text, ms = 1800) {
    this.bubbleEl.textContent = text;
    this.bubbleEl.classList.add('show');
    this.bubbleUntil = performance.now() + ms;
  }

  // ---------- 입력 ----------
  bindEvents() {
    const el = this.renderer.domElement;
    const setMouse = e => {
      const rect = el.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width * 2 - 1;
      const ny = -((e.clientY - rect.top) / rect.height * 2 - 1);
      this.mouse.set(nx, ny);
      this.mouseN.x = nx;
      this.mouseN.y = ny;
    };
    // 우클릭은 쓰지 않는다(브라우저 메뉴도 띄우지 않음)
    el.addEventListener('contextmenu', e => e.preventDefault());
    el.addEventListener('pointermove', e => {
      setMouse(e);
      if (this.grab) this.updateDrag(e);
      else this.updateHover();
    });
    // 누르면 손이 패를 잡고, 끌면 패가 따라온다
    el.addEventListener('pointerdown', e => {
      setMouse(e);
      if (e.button === 2) return;
      if (this.knock) {
        if (!this.knock.done && this.startKnock()) el.setPointerCapture(e.pointerId);
        return;
      }
      this.updateHover();
      if (this.flipCtx) {
        const ctx = this.flipCtx;
        if (this.hoverId === ctx.id) {
          this.flipCtx = null;
          this.flipArcId = ctx.id; // 뒤집을 때 살짝 들어 올렸다 내려놓는다
          this.setSelectable(null, []);
          ctx.resolve();
        }
        return;
      }
      if (this.hoverId == null) {
        if (this.hitOppArea()) {
          this.peeking = true;
          el.setPointerCapture(e.pointerId);
        }
        return;
      }
      const kind = this.drawCtx && this.drawCtx.id === this.hoverId ? 'wall' : 'hand';
      this.grab = { id: this.hoverId, kind, x: e.clientX, y: e.clientY, dragging: false, point: null, lean: 0 };
      if (kind === 'wall') {
        this.grab.startY = this.mouse.y;
        // 놓을 영역이 원래 시점(앉은 자리)에서 보이는 화면 높이: 포인터가 거기까지 내려오면 시점도 완전히 돌아온다
        const base = this.baseCam || (this.baseCam = new THREE.PerspectiveCamera(58, 1, 1, 600));
        base.aspect = this.camera.aspect;
        base.fov = this.camera.fov;
        base.updateProjectionMatrix();
        base.position.copy(CAM_POS);
        base.lookAt(CAM_LOOK);
        base.updateMatrixWorld(true);
        const zy = _v5.copy(this.drawZone.position).project(base).y;
        this.grab.endY = THREE.MathUtils.clamp(zy, -0.9, this.grab.startY - 0.2);
      }
      this.tiles[this.hoverId].userData.anim = null;
      this.hand.mode = 'idle';
      this.hand.pinch = 0.3;
      el.setPointerCapture(e.pointerId);
    });
    const endGrab = (e, cancelled) => {
      setMouse(e);
      this.peeking = false;
      if (this.knock) this.knock.active = false;
      const g = this.grab;
      if (!g) return;
      this.grab = null;
      // 패산 패: 손패 오른쪽 영역에 놓으면 쯔모, 아니면 패산으로 되돌림.
      // 쥔 채로 확인한 패(inspect)는 이미 본 패라 어디에 놓든 쯔모가 되고, 버림패 영역에 놓으면 그대로 버린다
      if (g.kind === 'wall') {
        const ctx = this.drawCtx;
        const moved = !cancelled && g.dragging && g.point;
        const ok = !!ctx && (g.inspect || (moved && inRect(dropPoint(g), ctx.rect)));
        if (ok) {
          this.drawCtx = null;
          this.setSelectable(null, []);
          ctx.resolve(g.inspect && moved && inPond(dropPoint(g)) ? 'discard' : 'draw');
        }
        this.hand.palmDown = !!ok && g.inspect && moved && inPond(dropPoint(g));
        this.releaseTile(g.id, !!ok);
        this.updateHover();
        return;
      }
      // 상대를 겨눈 채 놓으면 던진다(버리는 게 아니라 연출: 패는 손패로 돌아온다)
      if (!cancelled && g.dragging && g.aim) {
        this.throwTile(g.id, g.aim);
        this.updateHover();
        return;
      }
      // 버림패 영역 안에 끌어다 놓았을 때만 버린다. 손패 줄에 놓으면 그 자리로 옮긴다
      const dropped = !cancelled && g.dragging && g.point && inPond(g.point);
      const ok = !!dropped && this.onTileClick(g.id);
      if (!ok && !cancelled && g.insert != null) this.onReorder(g.id, g.insert);
      else if (!ok && g.insert != null && this.state) this.sync(this.state, 150);
      this.releaseTile(g.id, ok);
      this.updateHover();
    };
    el.addEventListener('pointerup', e => { if (e.button !== 2) endGrab(e, false); });
    el.addEventListener('pointercancel', e => endGrab(e, true));
    el.addEventListener('pointerleave', () => { this.mouse.set(-9, -9); this.updateHover(); });
  }

  updateDrag(e) {
    const g = this.grab;
    if (!g.dragging && Math.hypot(e.clientX - g.x, e.clientY - g.y) > 8) {
      g.dragging = true;
      if (g.kind === 'hand') this.leanFocus.copy(this.tiles[g.id].position);
    }
    if (!g.dragging || g.inspect) return; // 확인 중인 패의 숙이기는 updateDragPoint에서 패 위치로 정한다
    g.lean = THREE.MathUtils.clamp((g.y - e.clientY) / (window.innerHeight * LEAN_DRAG), 0, 1);
  }

  updateDragPoint() {
    const g = this.grab;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    if (g.kind === 'hand' && this.opp) {
      const hit = this.raycaster.intersectObject(this.opp, false)[0];
      const aim = hit ? hit.point.clone() : null;
      g.aim = aim;
    }
    const p = this.raycaster.ray.intersectPlane(DRAG_PLANE, new THREE.Vector3());
    if (!p) return;
    if (g.kind === 'wall') {
      // 시점이 다가간 뒤 끌기 시작해도 패가 튀지 않게: 처음 패와 커서 사이 간격을 유지하다가 손패 쪽으로 올수록 없앤다
      // 확인 중(시점이 자리로 돌아옴)에는 커서를 그대로 따라가고, 버림패 쪽으로 갈수록 몸을 숙인다
      if (!g.offset) g.offset = new THREE.Vector3().subVectors(this.tiles[g.id].position, p).setY(0);
      if (!g.inspect) p.addScaledVector(g.offset, 1 - (g.prog || 0));
      p.x = THREE.MathUtils.clamp(p.x, -WALL_R, WALL_R);
      p.z = THREE.MathUtils.clamp(p.z, -WALL_R, HAND_Z + 3);
      if (g.inspect) {
        g.floor = p.clone();
        g.lean = THREE.MathUtils.clamp((HAND_Z - 6 - p.z) / 18, 0, 1);
        p.lerp(this.camera.position, INSPECT_LIFT);
      }
    } else {
      p.x = THREE.MathUtils.clamp(p.x, -22, 22);
      p.z = THREE.MathUtils.clamp(p.z, POND_Z0, HAND_Z + 1);
      if (g.aim) p.y = 6; // 던질 준비: 높이 치켜든다
    }
    g.point = p;
  }

  // 쯔모 화료 때 손패를 쓸어 넘어뜨리기. ids는 화면 왼쪽→오른쪽 순서. 끝까지 넘어가면 resolve
  knockDown(ids) {
    return new Promise(resolve => {
      this.knock = {
        ids, resolve, dir: 0, active: false, done: false,
        base: ids.map(id => this.tiles[id].userData.base),
        fall: ids.map(() => 0),
        down: ids.map(() => false),
        point: new THREE.Vector3(),
      };
    });
  }

  // 왼쪽 끝 패나 오른쪽 끝 패(혹은 그 바깥)에서 누르기 시작해야 한다
  startKnock() {
    const k = this.knock;
    const ndc = id => this.tiles[id].position.clone().project(this.camera);
    const first = ndc(k.ids[0]), last = ndc(k.ids[k.ids.length - 1]);
    const hw = Math.abs(last.x - first.x) / (k.ids.length - 1 || 1) * 0.6;
    const nearRow = Math.abs(this.mouse.y - (first.y + last.y) / 2) < hw * 3;
    if (!nearRow) return false;
    if (this.mouse.x <= first.x + hw) k.dir = 1;
    else if (this.mouse.x >= last.x - hw) k.dir = -1;
    else return false;
    k.active = true;
    return true;
  }

  // 마우스가 지나간 만큼 패가 넘어간다(되돌리면 다시 선다). 전부 넘어가면 그대로 고정
  updateKnock() {
    const k = this.knock;
    if (!k) return;
    const n = k.ids.length;
    const xs = k.base.map(b => _v3.copy(b.p).project(this.camera).x);
    const hw = Math.abs(xs[n - 1] - xs[0]) / (n - 1 || 1) / 2;
    let all = true;
    k.ids.forEach((id, i) => {
      let target = 0;
      if (k.done) target = 1;
      else if (k.active) {
        const t = k.dir > 0 ? (this.mouse.x - (xs[i] - hw)) / (2 * hw) : ((xs[i] + hw) - this.mouse.x) / (2 * hw);
        target = THREE.MathUtils.clamp(t, 0, 1);
      }
      k.fall[i] += (target - k.fall[i]) * 0.35;
      // 한 장이 넘어질 때마다 소리(다시 일어섰다가 넘어지면 또 남)
      if (!k.down[i] && k.fall[i] > 0.85) { k.down[i] = true; this.onTileKnocked(id); }
      else if (k.down[i] && k.fall[i] < 0.4) k.down[i] = false;
      if (target < 1 || k.fall[i] < 0.98) all = false;
      const f = k.fall[i];
      const tile = this.tiles[id], u = tile.userData;
      const ps = knockedPose(k.base[i], f * f * (3 - 2 * f));
      tile.position.copy(ps.p);
      tile.quaternion.copy(ps.q);
      u.anim = null;
      u.key = '';
    });
    if (k.active && all) {
      k.active = false;
      k.done = true;
      setTimeout(() => { this.knock = null; k.resolve(); }, 250);
    }
    // 손이 쓸고 지나가는 지점
    if (k.active) {
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const p = this.raycaster.ray.intersectPlane(KNOCK_PLANE, k.point);
      if (p) p.set(THREE.MathUtils.clamp(p.x, -30, 30), HAND_Y + 2.2, HAND_Z - 1.5);
    }
  }

  // 누른 지점이 상대 영역(테이블 위 상대 쪽)인가
  hitOppArea() {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const p = this.raycaster.ray.intersectPlane(TABLE_PLANE, _v3);
    return !!p && p.x >= OPP_AREA.x0 && p.x <= OPP_AREA.x1 && p.z >= OPP_AREA.z0 && p.z <= OPP_AREA.z1;
  }

  updateHover() {
    if (this.grab || this.peeking) return;
    let id = null;
    if (this.selectable) {
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const meshes = [];
      for (const sid of this.selectable) if (!this.throws.has(sid)) meshes.push(...this.tiles[sid].userData.meshes);
      const hit = this.raycaster.intersectObjects(meshes, false)[0];
      if (hit) id = hit.object.userData.tileId;
    }
    if (id !== this.hoverId) {
      this.hoverId = id;
      this.renderer.domElement.style.cursor = id != null ? 'pointer' : 'default';
      this.onTileHover(id);
      this.updateGrayDiscards();
    }
  }

  throwTile(id, target) {
    const tile = this.tiles[id];
    tile.userData.anim = null;
    const axis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    this.throws.set(id, {
      phase: 'fly', t0: performance.now(), dur: THROW_FLY,
      p0: tile.position.clone(), p1: target.clone().setZ(target.z + 1.5), arc: 6,
      q0: tile.quaternion.clone(), axis, spin: 12,
    });
    this.hand.mode = 'idle';
    this.hand.open = 1; // 손을 펴며 던진다
  }

  // 던진 패: 날아가 상대에게 맞고 → 상대 앞 테이블로 떨어졌다가 → 내 손패 자리로 돌아온다
  updateThrows(now) {
    for (const [id, th] of this.throws) {
      const tile = this.tiles[id];
      const k = Math.min(1, (now - th.t0) / th.dur);
      if (th.phase !== 'rest') {
        tile.position.lerpVectors(th.p0, th.p1, th.phase === 'fly' ? k : 1 - (1 - k) * (1 - k));
        tile.position.y += Math.sin(Math.PI * k) * th.arc;
        tile.quaternion.copy(th.q0).premultiply(_q2.setFromAxisAngle(th.axis, th.spin * k));
      }
      if (k < 1) continue;
      if (th.phase === 'fly') {
        this.onTileThrown(id);
        this.react('shake');
        const l = pickLine('hit');
        const ms = Math.max(1600, voice(l.voice) * 1000 + 400);
        this.say(l.text, ms);
        this.setMood(l.mood, ms);
        Object.assign(th, {
          phase: 'fall', t0: now, dur: THROW_FALL, p0: tile.position.clone(), arc: 3,
          p1: new THREE.Vector3(THREE.MathUtils.clamp(tile.position.x, -15, 15), TD / 2, -30),
          q0: tile.quaternion.clone(), spin: 4,
        });
      } else if (th.phase === 'fall') {
        Object.assign(th, { phase: 'rest', t0: now, dur: THROW_REST });
      } else {
        this.throws.delete(id);
        const u = tile.userData;
        u.key = '';
        if (u.base) this.setTarget(id, u.base, THROW_RETURN);
      }
    }
  }

  // 손패를 끌어 손패 줄 위에 올리면 들어갈 자리를 비워 보여준다(뽑은 패는 제외)
  updateReorderPreview() {
    const g = this.grab, st = this.state;
    if (!g || g.kind !== 'hand' || !st || !st.players.length) return;
    const hand = st.players[0].hand;
    if (!hand.includes(g.id)) return;
    let ins = null;
    const p = g.dragging && g.point;
    if (p && Math.abs(p.z - HAND_Z) < REORDER_DZ && p.x > HAND_X0 - TW && p.x < HAND_X0 + hand.length * TW + TW * 0.3) {
      ins = THREE.MathUtils.clamp(Math.floor((p.x - HAND_X0) / TW), 0, hand.length - 1);
    }
    if (ins === g.insert) return;
    g.insert = ins;
    if (ins == null) { this.sync(st, 150); return; }
    hand.filter(id => id !== g.id).forEach((id, k) => {
      const slot = k < ins ? k : k + 1;
      this.setTarget(id, this.handPose(0, HAND_X0 + slot * TW + TW / 2, false), 140);
    });
  }

  // 반짝일 도라 패: 앞면이 보이는 패(내 손패, 버림패, 울어서 낸 패, 공개된 상대 손패) 중 도라인 것. 적도라는 제외
  updateDoraGlow(g) {
    const glow = new Set();
    if (g && g.players.length === 2) {
      const doraTypes = new Set(g.doraIndicatorIds().map(id => doraOf(typeOf(id))));
      const visible = [];
      for (const p of g.players) {
        if (p.seat === 0 || p.revealed) visible.push(...p.hand, ...(p.drawn != null ? [p.drawn] : []));
        for (const d of p.discards) if (!d.called) visible.push(d.id);
        for (const m of p.melds) visible.push(...(m.type === 'ankan' ? m.ids.slice(1, 3) : m.ids));
      }
      for (const id of visible) if (!isRedId(id) && doraTypes.has(typeOf(id))) glow.add(id);
    }
    this.doraGlow = glow;
  }

  // 도라 패를 감싸는 금빛 테두리(가산 혼합). 반짝임 세기를 그대로 따른다
  updateDoraHalos() {
    if (!this.halos) {
      this.halos = [];
      // 패보다 아주 조금만 크게: 패 자체가 빛나 보이도록(바깥으로 번지지 않게)
      this.haloGeo = new RoundedBoxGeometry(TW + 0.06, TH + 0.06, TD + 0.06, 3, 0.26);
    }
    let n = 0;
    for (const id of this.doraGlow || []) {
      const tile = this.tiles[id], u = tile.userData;
      if (!(u.glowLevel > 0.01)) continue;
      let halo = this.halos[n];
      if (!halo) {
        halo = new THREE.Mesh(this.haloGeo, new THREE.MeshBasicMaterial({
          color: 0xffc94a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
        }));
        this.scene.add(halo);
        this.halos.push(halo);
      }
      halo.visible = true;
      halo.material.opacity = u.glowLevel * 0.6;
      halo.quaternion.copy(tile.quaternion);
      halo.position.copy(u.inner.position).applyQuaternion(tile.quaternion).add(tile.position);
      n++;
    }
    for (let i = n; i < this.halos.length; i++) this.halos[i].visible = false;
  }

  // 내 패에 마우스를 올리면, 상대 버림패 중 같은 패를 회색으로 표시
  updateGrayDiscards() {
    const g = this.state, id = this.hoverId, want = new Set();
    if (g && g.players.length === 2 && id != null) {
      const me = g.players[0];
      if (me.hand.includes(id) || me.drawn === id) {
        const t = typeOf(id);
        for (const d of g.players[1].discards) if (!d.called && typeOf(d.id) === t) want.add(d.id);
      }
    }
    for (const gid of this.grayed) {
      if (want.has(gid)) continue;
      const u = this.tiles[gid].userData;
      u.ivory.color.setHex(IVORY);
      u.faceMat.color.setScalar(1);
    }
    for (const gid of want) {
      const u = this.tiles[gid].userData;
      u.ivory.color.setHex(IVORY_GRAY);
      u.faceMat.color.setScalar(0.45);
    }
    this.grayed = want;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    const need = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(34)) / this.camera.aspect);
    this.camera.fov = Math.max(58, THREE.MathUtils.radToDeg(need));
    this.camera.updateProjectionMatrix();
    // 손 위치: 화면 우하단(16:9에서 NDC 0.9, -0.82), 카메라 앞 26. 화면이 좁을수록 패를 가리지 않게 더 아래로
    const d = 26, halfH = d * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const narrow = THREE.MathUtils.clamp((1.75 - this.camera.aspect) / 0.45, 0, 1);
    this.hand.halfW = halfH * this.camera.aspect;
    this.hand.rest.set((0.9 + 0.04 * narrow) * this.hand.halfW, -(0.82 + 0.16 * narrow) * halfH, -d);
  }

  // ---------- 프레임 ----------
  // 마우스를 따라 살짝 시선 이동. 패를 앞으로 끌면 그 패를 따라 몸을 숙여서 팔이 늘어나 보이지 않게 한다
  updateCamera() {
    const g = this.grab;
    let leanTarget = 0;
    // 손패를 끌 때, 그리고 쥔 채로 확인 중인 패산 패를 끌 때는 몸을 숙여 패를 따라간다
    const leaning = g && g.dragging && (g.kind === 'hand' || g.inspect);
    if (leaning) leanTarget = g.lean;
    this.lean += (leanTarget - this.lean) * 0.08;
    if (leaning) this.leanFocus.lerp(g.floor || this.tiles[g.id].position, 0.1);
    const e = this.lean * this.lean * (3 - 2 * this.lean);
    this.camOff.x += (this.mouseN.x - this.camOff.x) * 0.04;
    this.camOff.y += (this.mouseN.y - this.camOff.y) * 0.04;
    this.camera.position.set(
      CAM_POS.x + this.camOff.x * 2.2 + this.leanFocus.x * LEAN_SIDE * e,
      CAM_POS.y + this.camOff.y * 1.2 - LEAN_DOWN * e,
      CAM_POS.z - LEAN_FORWARD * e,
    );
    this.lookAt.set(CAM_LOOK.x + this.camOff.x * 4, CAM_LOOK.y + this.camOff.y * 3, CAM_LOOK.z);
    this.lookAt.x += (this.leanFocus.x - this.lookAt.x) * LEAN_LOOK * e;
    this.lookAt.z += (this.leanFocus.z - this.lookAt.z) * LEAN_LOOK * e;
    // 쯔모 시점: 패산의 패를 잡는 순간 그 패로 다가가고, 손패 쪽(화면 아래)으로 끌수록 돌아온다. 잡기 전엔 그대로
    let drawTarget = 0;
    if (g && g.kind === 'wall' && !g.inspect) {
      g.prog = THREE.MathUtils.clamp((g.startY - this.mouse.y) / Math.max(0.2, g.startY - g.endY), 0, 1);
      drawTarget = 1 - g.prog;
    }
    if (this.drawCtx && !(g && g.kind === 'wall')) this.drawFocus.copy(this.tiles[this.drawCtx.id].position);
    this.drawLean += (drawTarget - this.drawLean) * DRAW_CAM_SPEED;
    const d = this.drawLean * this.drawLean * (3 - 2 * this.drawLean);
    if (d > 0.0001) {
      this.camera.position.lerp(this.drawCamPos.copy(this.drawFocus).add(DRAW_CAM_OFFSET), d);
      this.lookAt.lerp(this.drawFocus, d);
    }
    // 테이블 뒤집기: 들어 올릴 때 덜컥, 바닥에 떨어질 때 쿵 하고 화면이 흔들린다
    if (this.flip) {
      const ft = performance.now() - this.flip.t0;
      const amp = FLIP_SHAKE * (Math.exp(-ft / 450) + (ft > FLIP_TABLE_MS ? 1.4 * Math.exp(-(ft - FLIP_TABLE_MS) / 280) : 0));
      if (amp > 0.01) {
        const s = ft / 1000;
        _v3.set(Math.sin(s * 61) + Math.sin(s * 37), Math.sin(s * 53 + 1) + Math.sin(s * 29), Math.sin(s * 47 + 2)).multiplyScalar(amp * 0.5);
        this.camera.position.add(_v3);
        this.lookAt.addScaledVector(_v3, 0.6);
      }
    }
    // 상대 영역 내려다보기(마우스로 살짝 둘러볼 수 있음)
    this.peek += ((this.peeking ? 1 : 0) - this.peek) * PEEK_SPEED;
    const k = this.peekEase = this.peek * this.peek * (3 - 2 * this.peek);
    if (k > 0.0001) {
      const panX = this.camOff.x * PEEK_PAN, panZ = -this.camOff.y * PEEK_PAN * 0.6;
      this.camera.position.lerp(this.peekTarget.set(PEEK_POS.x + panX, PEEK_POS.y, PEEK_POS.z + panZ), k);
      this.lookAt.lerp(this.peekTarget.set(PEEK_LOOK.x + panX, PEEK_LOOK.y, PEEK_LOOK.z + panZ), k);
    }
    this.camera.lookAt(this.lookAt);
  }

  frame() {
    const now = performance.now(), t = now / 1000;
    this.updateCamera();
    this.updatePondZone(t);
    this.updateDrawZone(t);
    this.updateKnock();
    if (this.grab && this.grab.dragging) this.updateDragPoint();
    this.updateReorderPreview();
    this.updateThrows(now);
    this.updateFlip(now);
    const gr = this.grab;
    // 충분히 끌어온 순간부터 시간을 잰다(다시 패산 쪽으로 밀면 처음부터)
    if (gr && gr.kind === 'wall' && !gr.inspect && this.inspectEnabled) gr.pulledAt = (gr.prog || 0) >= INSPECT_PULL ? gr.pulledAt ?? now : null;
    if (gr && gr.kind === 'wall' && !gr.inspect && gr.pulledAt != null && now - gr.pulledAt >= INSPECT_MS) {
      gr.inspect = true;
      gr.floor = (gr.point || this.tiles[gr.id].position).clone().setY(-DRAG_PLANE.constant);
      gr.point = new THREE.Vector3();
    }
    // 끌지 않고 쥐고만 있을 때도 시점이 움직이는 만큼 카메라 쪽으로 따라온다
    if (gr && gr.inspect && !gr.dragging) gr.point.copy(gr.floor).lerp(this.camera.position, INSPECT_LIFT);
    for (const tile of this.tiles) {
      const u = tile.userData;
      if (u.anim && !this.throws.has(u.id) && !(this.grab && this.grab.id === u.id && this.grab.point)) {
        const a = u.anim;
        const k = Math.min(1, Math.max(0, (now - a.t0) / a.dur));
        const e = 1 - Math.pow(1 - k, 3);
        tile.position.lerpVectors(a.fp, a.tp, e);
        if (a.arc) tile.position.y += Math.sin(Math.PI * e) * a.arc;
        tile.quaternion.slerpQuaternions(a.fq, a.tq, e);
        if (k >= 1) u.anim = null;
      }
      const grabbed = this.grab && this.grab.id === u.id;
      if (grabbed && this.grab.point) tile.position.lerp(this.grab.point, 0.35);
      // 확인 중: 패를 세워 앞면이 카메라를 보게
      if (grabbed && this.grab.inspect) {
        _v1.subVectors(this.camera.position, tile.position);
        euler.set(-Math.atan2(_v1.y, Math.hypot(_v1.x, _v1.z)), Math.atan2(_v1.x, _v1.z), 0, 'YXZ');
        tile.quaternion.slerp(_q2.setFromEuler(euler), 0.2);
      }
      const target = grabbed ? (this.grab.dragging ? 0.3 : 1.6) : this.hoverId === u.id ? 0.9 : 0;
      if (Math.abs(target - u.lift) > 0.001 || u.lift !== 0) {
        u.lift += (target - u.lift) * 0.25;
        if (Math.abs(u.lift) < 0.001) u.lift = 0;
        u.inner.position.copy(_up).applyQuaternion(_q2.copy(tile.quaternion).invert()).multiplyScalar(u.lift);
        const l = Math.min(1, u.lift / 0.9);
        u.ivory.emissive.setRGB(0.22 * l, 0.17 * l, 0.04 * l);
      }
      // 도라 반짝임(마우스를 올렸을 때의 빛과 더해진다)
      const glowing = this.doraGlow && this.doraGlow.has(u.id);
      if (glowing || u.glow) {
        let gl = 0;
        if (glowing) {
          const phase = ((t + (tile.position.x - tile.position.z) * DORA_GLOW_WAVE) % DORA_GLOW_PERIOD + DORA_GLOW_PERIOD) % DORA_GLOW_PERIOD;
          gl = phase < DORA_GLOW_ON ? Math.sin(Math.PI * phase / DORA_GLOW_ON) : 0;
        }
        const l = Math.min(1, u.lift / 0.9);
        u.ivory.emissive.setRGB(0.22 * l + 0.55 * gl, 0.17 * l + 0.4 * gl, 0.04 * l + 0.1 * gl);
        u.glow = glowing;
        u.glowLevel = gl;
      }
    }
    this.applyShake(now);
    this.updateDoraHalos();
    this.updateInspectDim();

    // 마지막 버림패 표시
    if (this.lastDiscard != null) {
      const p = this.tiles[this.lastDiscard].position;
      this.marker.visible = true;
      this.marker.position.set(p.x, p.y + 2.6 + Math.sin(t * 4) * 0.3, p.z);
      this.marker.rotation.y = t * 1.5;
    } else this.marker.visible = false;


    this.updateHand(now, t);
    if (this.opp) this.animateOpponent(now, t);
    this.renderer.render(this.scene, this.camera);
    this.clearShake();
  }

  animateOpponent(now, t) {
    let x = 0, y = Math.sin(t * 2.1) * 0.35, rz = 0;
    const sy = 1 + Math.sin(t * 2.1 + 1) * 0.008;
    if (this.thinking) rz += Math.sin(t * 3.2) * 0.035;
    const a = this.oppAnim;
    if (a) {
      const k = (now - a.t0) / a.dur;
      if (k >= 1) this.oppAnim = null;
      else if (a.type === 'hop') y += Math.sin(Math.PI * k) * 2.5;
      else if (a.type === 'nod') y += Math.sin(Math.PI * k) * 0.7;
      else if (a.type === 'joy') { y += Math.abs(Math.sin(Math.PI * k * 3)) * 3 * (1 - k * 0.3); rz += Math.sin(k * Math.PI * 6) * 0.05; }
      else if (a.type === 'shake') { x += Math.sin(k * 50) * 1.2 * (1 - k); rz += Math.sin(k * 40) * 0.04 * (1 - k); }
      else if (a.type === 'sad') { y -= Math.sin(Math.PI * k) * 3; rz -= Math.sin(Math.PI * k) * 0.08; }
    }
    this.opp.position.set(OPP_POS.x + x, OPP_POS.y + y, OPP_POS.z);
    this.opp.rotation.z = rz;
    this.opp.scale.set(1, sy, 1);
    if (now > this.moodUntil) this.setMood('normal');

    // 말풍선 위치(스피키 왼쪽, 얼굴 높이). 기준점은 말풍선 오른쪽 가운데
    if (now < this.bubbleUntil) {
      const v = new THREE.Vector3(OPP_POS.x + BUBBLE_OFFSET.x, OPP_POS.y + BUBBLE_OFFSET.y + y, OPP_POS.z).project(this.camera);
      // 왼쪽 위 정보창과 겹치지 않게: 옆자리가 좁으면 폭을 조금 줄이고, 그래도 겹치면 정보창 아래로 내린다
      const x = (v.x * 0.5 + 0.5) * window.innerWidth;
      let by = (-v.y * 0.5 + 0.5) * window.innerHeight;
      const info = document.getElementById('info').getBoundingClientRect();
      this.bubbleEl.style.maxWidth = `${Math.max(240, Math.min(420, x - info.right - 10))}px`;
      const w = this.bubbleEl.offsetWidth, h = this.bubbleEl.offsetHeight;
      const left = Math.max(w + 8, Math.min(x, window.innerWidth - 8));
      if (left - w < info.right + 10 && by - h / 2 < info.bottom + 8) by = info.bottom + 8 + h / 2;
      this.bubbleEl.style.left = `${left}px`;
      this.bubbleEl.style.top = `${by}px`;
    } else if (this.bubbleEl.classList.contains('show')) {
      this.bubbleEl.classList.remove('show');
    }
  }
}
