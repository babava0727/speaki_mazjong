// 효과음: 폴더의 wav 파일 + WebAudio 합성음
let ctx = null;
let noiseBuf = null;
const SFX_DIR = 'audio/sfx/';
const SAMPLE_FILES = {
  get: 'hai_get.wav', dasu: 'hai_dasu.wav', tsumo: 'hai_tsumo.wav',
  buttonOn: 'button_mouseon.wav', buttonClick: 'button_click.wav', redcard: 'redcard.wav', smash: 'table_smash.wav', bong: 'riichi_bong.wav', butter: 'butter_button.wav',
};
const samples = {};

// ---------- 음량(설정) ----------
// bgm(배경음) / sfx(효과음) / voice(스피키 음성). 0~1, 브라우저에 저장
const VOLUME_KEY = 'spk-mahjong-volume';
export const volumes = { bgm: 0.7, sfx: 0.8, voice: 0.9 };
try { Object.assign(volumes, JSON.parse(localStorage.getItem(VOLUME_KEY)) || {}); } catch { /* 저장소 사용 불가 */ }
const buses = {};
const bus = kind => buses[kind] || ctx.destination;

export function setVolume(kind, v) {
  volumes[kind] = v;
  if (buses[kind]) buses[kind].gain.value = v;
  try { localStorage.setItem(VOLUME_KEY, JSON.stringify(volumes)); } catch { /* 저장 실패는 무시 */ }
}

export function initAudio() {
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      for (const kind of Object.keys(volumes)) {
        buses[kind] = ctx.createGain();
        buses[kind].gain.value = volumes[kind];
        buses[kind].connect(ctx.destination);
      }
      for (const [name, url] of Object.entries(SAMPLE_FILES)) {
        fetch(SFX_DIR + url)
          .then(r => r.arrayBuffer())
          .then(buf => ctx.decodeAudioData(buf))
          .then(decoded => { samples[name] = decoded; })
          .catch(() => {});
      }
    }
    if (ctx.state === 'suspended') ctx.resume();
  } catch { ctx = null; }
  // 소리를 켜기 전에 정해 둔 배경음이 있으면 이제 튼다
  if (ctx && bgmWant && bgmNow !== bgmWant) bgm(bgmWant);
}

// ---------- 배경음 ----------
// 곡이 길어서(몇 분) 통째로 풀어 두지 않고 <audio>로 흘려 틀며, bgm 음량을 거친다.
// 곡을 바꿀 땐 이전 곡은 서서히 줄이고 새 곡은 처음부터 서서히 키운다
const BGM_DIR = 'audio/bgm/';
const BGM_FILES = {
  main: 'bgm_main.mp3', ingame: 'bgm_ingame.mp3', riichi: 'bgm_riich.mp3',
  chase: 'bgm_followriich.mp3', result: 'bgm_result.mp3', yakuman: 'bgm_yakuman.mp3',
};
const BGM_LEVEL = 0.2; // 곡 자체 크기(설정의 BGM 음량과 곱해진다)
const bgmTracks = {};
let bgmWant = null, bgmNow = null;

function bgmTrack(name) {
  if (!bgmTracks[name]) {
    const el = new Audio(BGM_DIR + BGM_FILES[name]);
    el.loop = true;
    el.preload = 'auto';
    const gain = ctx.createGain();
    gain.gain.value = 0;
    ctx.createMediaElementSource(el).connect(gain).connect(bus('bgm'));
    bgmTracks[name] = { el, gain, stopTimer: 0 };
  }
  return bgmTracks[name];
}

function bgmRamp(gain, to, sec) {
  const t = ctx.currentTime;
  gain.gain.cancelScheduledValues(t);
  gain.gain.setValueAtTime(gain.gain.value, t);
  gain.gain.linearRampToValueAtTime(to, t + sec);
}

export const currentBgm = () => bgmWant;

// 배경음 바꾸기. name: main / ingame / riichi / chase / result / yakuman, null이면 끈다. 이미 그 곡이면 그대로
export function bgm(name, fadeMs = 800) {
  bgmWant = name;
  if (!ctx || bgmNow === name) return;
  if (bgmNow) {
    const old = bgmTracks[bgmNow];
    bgmRamp(old.gain, 0, fadeMs / 1000);
    clearTimeout(old.stopTimer);
    old.stopTimer = setTimeout(() => old.el.pause(), fadeMs + 50);
  }
  bgmNow = name;
  if (!name) return;
  const tr = bgmTrack(name);
  clearTimeout(tr.stopTimer);
  tr.el.currentTime = 0;
  tr.el.play().catch(() => {});
  bgmRamp(tr.gain, BGM_LEVEL, fadeMs / 1000);
}

// wav 효과음 재생. 아직 로드되지 않았으면 합성음으로 대신한다.
function playSample(name, vol, fallback) {
  if (!ctx) return;
  const buf = samples[name];
  if (!buf) { fallback(); return; }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(g).connect(bus('sfx'));
  src.start();
}

// 배패로 패를 받을 때
export function haiGet(vol = 1) { playSample('get', vol, () => clack(0.2)); }
// 패를 버릴 때
export function haiDasu(vol = 1) { playSample('dasu', vol, () => clack()); }
// 쯔모 화료로 손패를 넘어뜨릴 때(한 장마다)
export function haiTsumo(vol = 1) { playSample('tsumo', vol, () => clack(0.3)); }
// 버튼에 마우스를 올릴 때 / 누를 때(파일이 아직 없으면 소리 없음)
export function buttonOn(vol = 1) { playSample('buttonOn', vol, () => {}); }
export function buttonClick(vol = 1) { playSample('buttonClick', vol, () => {}); }
// 리치봉을 던질 때(아직 로드되지 않았으면 '딱' 소리로 대신)
export function riichiBong(vol = 1) { playSample('bong', vol, () => clack(0.5)); }
// 우상단 버터를 누를 때(아직 로드되지 않았으면 일반 버튼 소리로 대신)
export function butterButton(vol = 1) { playSample('butter', vol, () => buttonClick(vol)); }
// 레드카드 퇴장
export function redcard(vol = 1) { playSample('redcard', vol, () => sad()); }

// ---------- 스피키 음성 ----------
const VOICE_DIR = 'audio/speaki_voice/';
const voices = new Map(); // 파일 → Promise<{ buf, start, end }>
let voiceSrc = null;

// 앞뒤 무음을 잘라낼 위치(초)를 찾는다
function trimRange(buf) {
  const d = buf.getChannelData(0), thr = 0.01;
  let s = 0;
  while (s < d.length && Math.abs(d[s]) < thr) s++;
  let e = d.length - 1;
  while (e > s && Math.abs(d[e]) < thr) e--;
  const rate = buf.sampleRate;
  return { start: Math.max(0, s / rate - 0.03), end: Math.min(buf.duration, e / rate + 0.08) };
}

function loadVoice(file) {
  if (!voices.has(file)) {
    voices.set(file, fetch(VOICE_DIR + file)
      .then(r => r.arrayBuffer())
      .then(b => ctx.decodeAudioData(b))
      .then(buf => ({ buf, ...trimRange(buf) }))
      .catch(() => null));
  }
  return voices.get(file);
}

export function preloadVoices(files) {
  if (!ctx) return;
  for (const f of files) loadVoice(f);
}

const voiceReady = {}; // 이미 디코딩된 음성의 길이(초): 말풍선 시간을 맞추는 데 쓴다
// 음성 재생(이전 음성은 끊는다). 반환값은 재생 길이(초), 아직 준비 안 됐으면 예상 0
export function voice(file, vol = 0.9) {
  if (!ctx || !file) return 0;
  const requested = performance.now();
  loadVoice(file).then(v => {
    if (!v) return;
    voiceReady[file] = v.end - v.start;
    if (performance.now() - requested > 1500) return; // 너무 늦게 준비되면 생략
    if (voiceSrc) { try { voiceSrc.stop(); } catch { /* 이미 끝남 */ } }
    const src = ctx.createBufferSource();
    src.buffer = v.buf;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(g).connect(bus('voice'));
    src.start(0, v.start, v.end - v.start);
    voiceSrc = src;
  });
  return voiceReady[file] || 0;
}

function noise() {
  if (noiseBuf) return noiseBuf;
  const len = Math.floor(ctx.sampleRate * 0.15);
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

// 패가 테이블에 닿는 "딱" 소리
export function clack(vol = 0.5) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noise();
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2000 + Math.random() * 700;
  bp.Q.value = 2.2;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
  src.connect(bp).connect(g).connect(bus('sfx'));
  src.start(t);
  src.stop(t + 0.12);
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(1250, t);
  o.frequency.exponentialRampToValueAtTime(700, t + 0.04);
  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(vol * 0.25, t);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  o.connect(g2).connect(bus('sfx'));
  o.start(t);
  o.stop(t + 0.06);
}

// 테이블을 내려칠 때(table_smash.wav). 아직 로드되지 않았으면 합성음으로 대신한다
export function slam(vol = 0.7) { playSample('smash', vol, () => slamSynth(vol)); }

// 합성 "쿵" + 패들이 덜그럭거리는 소리
function slamSynth(vol) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(110, t);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.25);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.9 * vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  o.connect(g).connect(bus('sfx'));
  o.start(t);
  o.stop(t + 0.4);
  const src = ctx.createBufferSource();
  src.buffer = noise();
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 500;
  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(0.8 * vol, t);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
  src.connect(lp).connect(g2).connect(bus('sfx'));
  src.start(t);
  for (let i = 0; i < 9; i++) {
    const at = 30 + Math.random() * 520;
    setTimeout(() => clack((0.12 + Math.random() * 0.22) * vol * (1 - at / 700)), at);
  }
}

function tone(freq, start, dur, vol, type = 'triangle') {
  const t = ctx.currentTime + start;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(bus('sfx'));
  o.start(t);
  o.stop(t + dur + 0.05);
}

export function pop() {
  if (!ctx) return;
  tone(520, 0, 0.12, 0.18, 'sine');
  tone(780, 0.06, 0.16, 0.16, 'sine');
}

export function chime() {
  if (!ctx) return;
  [660, 830, 990, 1320].forEach((f, i) => tone(f, i * 0.09, 0.5, 0.14));
}

export function sad() {
  if (!ctx) return;
  [440, 392, 330].forEach((f, i) => tone(f, i * 0.16, 0.4, 0.12));
}
