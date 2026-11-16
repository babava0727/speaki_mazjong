// 마작 규칙 엔진: 샹텐/대기 계산, 역·부수·점수 판정
// 패 종류(type) 0~33: 0-8 만, 9-17 통, 18-26 삭, 27-30 동남서북, 31-33 백발중
// 패 id 0~135: type = id >> 2, 각 5의 첫 번째 패(16, 52, 88)는 적도라

export const EAST = 27, SOUTH = 28, WEST = 29, NORTH = 30, HAKU = 31, HATSU = 32, CHUN = 33;
const RED_IDS = new Set([16, 52, 88]);
const YAOCHU = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
const GREEN = new Set([19, 20, 21, 23, 25, HATSU]);

export const typeOf = id => id >> 2;
export const isRedId = id => RED_IDS.has(id);
export const isHonor = t => t >= 27;
export const isYaochu = t => t >= 27 || t % 9 === 0 || t % 9 === 8;
export const isDragon = t => t >= HAKU;
export const isWind = t => t >= EAST && t <= NORTH;

export function tileName(t) {
  if (t < 27) return `${t % 9 + 1}${'만통삭'[Math.floor(t / 9)]}`;
  return '동남서북백발중'[t - 27];
}
export const windName = t => '동남서북'[t - EAST];

export function toCounts(types) {
  const c = new Array(34).fill(0);
  for (const t of types) c[t]++;
  return c;
}

export function doraOf(ind) {
  if (ind < 27) return ind % 9 === 8 ? ind - 8 : ind + 1;
  if (ind <= NORTH) return ind === NORTH ? EAST : ind + 1;
  return ind === CHUN ? HAKU : ind + 1;
}

// ---------- 샹텐 ----------
// 화료 = -1, 텐파이 = 0. melds는 이미 공개된 몸통 수.
export function shantenRegular(c, melds) {
  const need = 4 - melds;
  let best = 8;
  const rec = (i, m, t, p) => {
    if (best === -1) return;
    while (i < 34 && c[i] === 0) i++;
    if (i >= 34) {
      const s = 2 * (need - m) - Math.min(t, need - m) - p;
      if (s < best) best = s;
      return;
    }
    const suit = i < 27, n = i % 9;
    if (c[i] >= 3) { c[i] -= 3; rec(i, m + 1, t, p); c[i] += 3; }
    if (suit && n <= 6 && c[i + 1] && c[i + 2]) {
      c[i]--; c[i + 1]--; c[i + 2]--;
      rec(i, m + 1, t, p);
      c[i]++; c[i + 1]++; c[i + 2]++;
    }
    if (c[i] >= 2 && !p) { c[i] -= 2; rec(i, m, t, 1); c[i] += 2; }
    if (m + t < need) {
      if (c[i] >= 2) { c[i] -= 2; rec(i, m, t + 1, p); c[i] += 2; }
      if (suit && n <= 7 && c[i + 1]) { c[i]--; c[i + 1]--; rec(i, m, t + 1, p); c[i]++; c[i + 1]++; }
      if (suit && n <= 6 && c[i + 2]) { c[i]--; c[i + 2]--; rec(i, m, t + 1, p); c[i]++; c[i + 2]++; }
    }
    c[i]--; rec(i, m, t, p); c[i]++;
  };
  rec(0, 0, 0, 0);
  return best;
}

export function shantenChiitoi(c) {
  let pairs = 0, kinds = 0;
  for (let i = 0; i < 34; i++) {
    if (c[i] >= 1) kinds++;
    if (c[i] >= 2) pairs++;
  }
  return 6 - pairs + Math.max(0, 7 - kinds);
}

export function shantenKokushi(c) {
  let kinds = 0, pair = 0;
  for (const t of YAOCHU) {
    if (c[t] >= 1) kinds++;
    if (c[t] >= 2) pair = 1;
  }
  return 13 - kinds - pair;
}

export function shanten(c, melds = 0) {
  let s = shantenRegular(c, melds);
  if (melds === 0 && s > -1) s = Math.min(s, shantenChiitoi(c), shantenKokushi(c));
  return s;
}

// 3n+1장 손패의 대기패 목록
export function waits(c, melds = 0) {
  const out = [];
  for (let t = 0; t < 34; t++) {
    if (c[t] >= 4) continue;
    c[t]++;
    if (shanten(c, melds) === -1) out.push(t);
    c[t]--;
  }
  return out;
}

// ---------- 화료 판정 ----------
function decompose(c) {
  const out = [];
  const groups = [];
  const dfs = (i, pair) => {
    while (i < 34 && c[i] === 0) i++;
    if (i === 34) { out.push({ pair, groups: groups.slice() }); return; }
    if (c[i] >= 3) {
      c[i] -= 3; groups.push({ kind: 'trip', tile: i });
      dfs(i, pair);
      groups.pop(); c[i] += 3;
    }
    if (i < 27 && i % 9 <= 6 && c[i + 1] && c[i + 2]) {
      c[i]--; c[i + 1]--; c[i + 2]--; groups.push({ kind: 'seq', tile: i });
      dfs(i, pair);
      groups.pop(); c[i]++; c[i + 1]++; c[i + 2]++;
    }
  };
  for (let p = 0; p < 34; p++) {
    if (c[p] < 2) continue;
    c[p] -= 2;
    dfs(0, p);
    c[p] += 2;
  }
  return out;
}

function situationalYaku(ctx, menzen) {
  const y = [];
  if (ctx.doubleRiichi) y.push({ name: '더블 리치', han: 2 });
  else if (ctx.riichi) y.push({ name: '리치', han: 1 });
  if (ctx.ippatsu) y.push({ name: '일발', han: 1 });
  if (menzen && ctx.tsumo) y.push({ name: '멘젠쯔모', han: 1 });
  if (ctx.haitei) y.push({ name: '해저로월', han: 1 });
  if (ctx.houtei) y.push({ name: '하저로어', han: 1 });
  if (ctx.rinshan) y.push({ name: '영상개화', han: 1 });
  return y;
}

function colorYaku(all, menzen) {
  const yaku = [], yakuman = [];
  const honors = all.some(isHonor);
  const suits = new Set(all.filter(t => t < 27).map(t => Math.floor(t / 9)));
  if (all.every(t => !isYaochu(t))) yaku.push({ name: '탕야오', han: 1 });
  if (suits.size === 0) yakuman.push({ name: '자일색', mult: 1 });
  else if (suits.size === 1) {
    if (honors) yaku.push({ name: '혼일색', han: menzen ? 3 : 2 });
    else yaku.push({ name: '청일색', han: menzen ? 6 : 5 });
  }
  if (all.every(isYaochu) && suits.size > 0) {
    if (!honors) yakuman.push({ name: '청노두', mult: 1 });
    else yaku.push({ name: '혼노두', han: 2 });
  }
  if (all.every(t => GREEN.has(t))) yakuman.push({ name: '녹일색', mult: 1 });
  return { yaku, yakuman };
}

function regularCand(ctx, d, w, menzen, all) {
  const yaku = [], yakuman = [];
  const groups = d.groups.map((g, i) => ({
    kind: g.kind, tile: g.tile, kan: false,
    // 론으로 완성된 커쯔는 밍커 취급
    open: w.kind === 'shanpon' && i === w.gi && !ctx.tsumo,
  }));
  for (const m of ctx.melds) {
    if (m.type === 'chi') groups.push({ kind: 'seq', tile: Math.min(...m.tiles), open: true, kan: false });
    else groups.push({ kind: 'trip', tile: m.tiles[0], open: m.type !== 'ankan', kan: m.type !== 'pon' });
  }
  const pair = d.pair;
  const seqs = groups.filter(g => g.kind === 'seq');
  const trips = groups.filter(g => g.kind === 'trip');
  const hasSeq = t => seqs.some(g => g.tile === t);
  const hasTrip = t => trips.some(g => g.tile === t);
  const valuePair = isDragon(pair) || pair === ctx.seatWind || pair === ctx.roundWind;

  const pinfu = menzen && trips.length === 0 && !valuePair && w.kind === 'ryanmen';
  if (pinfu) yaku.push({ name: '핑후', han: 1 });

  if (menzen) {
    const cnt = {};
    for (const g of seqs) cnt[g.tile] = (cnt[g.tile] || 0) + 1;
    const peikou = Object.values(cnt).reduce((s, v) => s + Math.floor(v / 2), 0);
    if (peikou === 2) yaku.push({ name: '량페코', han: 3 });
    else if (peikou === 1) yaku.push({ name: '이페코', han: 1 });
  }

  for (const g of trips) {
    if (g.tile === HAKU) yaku.push({ name: '역패 백', han: 1 });
    if (g.tile === HATSU) yaku.push({ name: '역패 발', han: 1 });
    if (g.tile === CHUN) yaku.push({ name: '역패 중', han: 1 });
    if (g.tile === ctx.seatWind) yaku.push({ name: `자풍패 ${windName(g.tile)}`, han: 1 });
    if (g.tile === ctx.roundWind) yaku.push({ name: `장풍패 ${windName(g.tile)}`, han: 1 });
  }

  for (let n = 0; n <= 6; n++) {
    if (hasSeq(n) && hasSeq(9 + n) && hasSeq(18 + n)) { yaku.push({ name: '삼색동순', han: menzen ? 2 : 1 }); break; }
  }
  for (let s = 0; s < 3; s++) {
    if (hasSeq(9 * s) && hasSeq(9 * s + 3) && hasSeq(9 * s + 6)) { yaku.push({ name: '일기통관', han: menzen ? 2 : 1 }); break; }
  }

  const groupHasYaochu = g => g.kind === 'trip' ? isYaochu(g.tile) : (g.tile % 9 === 0 || g.tile % 9 === 6);
  if (seqs.length > 0 && isYaochu(pair) && groups.every(groupHasYaochu)) {
    if (all.some(isHonor)) yaku.push({ name: '찬타', han: menzen ? 2 : 1 });
    else yaku.push({ name: '준찬타', han: menzen ? 3 : 2 });
  }

  if (trips.length === 4) yaku.push({ name: '또이또이', han: 2 });
  const ankou = trips.filter(g => !g.open).length;
  if (ankou === 4) yakuman.push({ name: '스안커', mult: 1 });
  else if (ankou === 3) yaku.push({ name: '산안커', han: 2 });

  for (let n = 0; n <= 8; n++) {
    if (hasTrip(n) && hasTrip(9 + n) && hasTrip(18 + n)) { yaku.push({ name: '삼색동각', han: 2 }); break; }
  }

  const kans = trips.filter(g => g.kan).length;
  if (kans === 4) yakuman.push({ name: '스깡쯔', mult: 1 });
  else if (kans === 3) yaku.push({ name: '산깡쯔', han: 2 });

  const dragons = trips.filter(g => isDragon(g.tile)).length;
  if (dragons === 3) yakuman.push({ name: '대삼원', mult: 1 });
  else if (dragons === 2 && isDragon(pair)) yaku.push({ name: '소삼원', han: 2 });

  const winds = trips.filter(g => isWind(g.tile)).length;
  if (winds === 4) yakuman.push({ name: '대사희', mult: 2 });
  else if (winds === 3 && isWind(pair)) yakuman.push({ name: '소사희', mult: 1 });

  if (menzen && !all.some(isHonor)) {
    const suits = new Set(all.map(t => Math.floor(t / 9)));
    if (suits.size === 1) {
      const s = [...suits][0] * 9;
      const cc = toCounts(all);
      const k = Array.from({ length: 9 }, (_, i) => cc[s + i]);
      if (k[0] >= 3 && k[8] >= 3 && k.slice(1, 8).every(x => x >= 1)) yakuman.push({ name: '구련보등', mult: 1 });
    }
  }

  // 부수
  let fu;
  if (pinfu) fu = ctx.tsumo ? 20 : 30;
  else {
    fu = 20;
    if (menzen && !ctx.tsumo) fu += 10;
    if (ctx.tsumo) fu += 2;
    for (const g of trips) {
      let f = 2;
      if (isYaochu(g.tile)) f *= 2;
      if (!g.open) f *= 2;
      if (g.kan) f *= 4;
      fu += f;
    }
    if (isDragon(pair)) fu += 2;
    if (pair === ctx.seatWind) fu += 2;
    if (pair === ctx.roundWind) fu += 2;
    if (w.kind === 'kanchan' || w.kind === 'penchan' || w.kind === 'tanki') fu += 2;
    fu = Math.ceil(fu / 10) * 10;
    if (fu === 20) fu = 30;
  }
  return { yaku, yakuman, fu };
}

export function calcPoints(han, fu, yakumanMult, dealer) {
  let base, limit = '';
  if (yakumanMult) { base = 8000 * yakumanMult; limit = yakumanMult > 1 ? `${yakumanMult}배 역만` : '역만'; }
  else if (han >= 13) { base = 8000; limit = '헤아림 역만'; }
  else if (han >= 11) { base = 6000; limit = '삼배만'; }
  else if (han >= 8) { base = 4000; limit = '배만'; }
  else if (han >= 6) { base = 3000; limit = '하네만'; }
  else {
    base = fu * 2 ** (han + 2);
    if (han >= 5 || base >= 2000) { base = 2000; limit = '만관'; }
  }
  return { points: Math.ceil(base * (dealer ? 6 : 4) / 100) * 100, limit };
}

function finalize(ctx, cand, situ, color, all) {
  const ym = [...cand.yakuman, ...color.yakuman];
  if (ym.length) {
    const mult = ym.reduce((s, y) => s + y.mult, 0);
    const { points, limit } = calcPoints(0, 0, mult, ctx.dealer);
    return {
      yaku: ym.map(y => ({ name: y.name, han: y.mult > 1 ? '더블 역만' : '역만' })),
      han: 13 * mult, fu: 0, points, limit, yakuman: mult,
    };
  }
  const yaku = [...situ, ...color.yaku, ...cand.yaku];
  if (!yaku.length) return null;
  let han = yaku.reduce((s, y) => s + y.han, 0);
  const countDora = inds => inds.reduce((s, ind) => s + all.filter(t => t === doraOf(ind)).length, 0);
  const dora = countDora(ctx.dora);
  if (dora) { yaku.push({ name: '도라', han: dora }); han += dora; }
  if (ctx.red) { yaku.push({ name: '적도라', han: ctx.red }); han += ctx.red; }
  const ura = countDora(ctx.ura || []);
  if (ura) { yaku.push({ name: '뒷도라', han: ura }); han += ura; }
  const { points, limit } = calcPoints(han, cand.fu, 0, ctx.dealer);
  return { yaku, han, fu: cand.fu, points, limit, yakuman: 0 };
}

// ctx: { concealed: [types, 화료패 포함], melds: [{type, tiles:[types]}], winTile, tsumo, riichi, doubleRiichi,
//        ippatsu, haitei, houtei, rinshan, seatWind, roundWind, dora: [표시패 types], ura: [...], red, dealer }
// 역이 없으면 null
export function scoreHand(ctx) {
  const c = toCounts(ctx.concealed);
  const menzen = ctx.melds.every(m => m.type === 'ankan');
  const all = ctx.concealed.concat(...ctx.melds.map(m => m.tiles));
  const situ = situationalYaku(ctx, menzen);
  const color = colorYaku(all, menzen);
  const cands = [];
  if (ctx.melds.length === 0) {
    if (shantenKokushi(c) === -1) cands.push({ yaku: [], yakuman: [{ name: '국사무쌍', mult: 1 }], fu: 0 });
    if (shantenChiitoi(c) === -1) cands.push({ yaku: [{ name: '치또이츠', han: 2 }], yakuman: [], fu: 25 });
  }
  for (const d of decompose(c)) {
    const opts = [];
    if (d.pair === ctx.winTile) opts.push({ kind: 'tanki', gi: -1 });
    d.groups.forEach((g, gi) => {
      if (g.kind === 'trip' && g.tile === ctx.winTile) opts.push({ kind: 'shanpon', gi });
      if (g.kind === 'seq' && ctx.winTile >= g.tile && ctx.winTile <= g.tile + 2) {
        const pos = ctx.winTile - g.tile, n = g.tile % 9;
        let kind;
        if (pos === 1) kind = 'kanchan';
        else if (pos === 0) kind = n === 6 ? 'penchan' : 'ryanmen';
        else kind = n === 0 ? 'penchan' : 'ryanmen';
        opts.push({ kind, gi });
      }
    });
    for (const w of opts) cands.push(regularCand(ctx, d, w, menzen, all));
  }
  let best = null;
  for (const cand of cands) {
    const r = finalize(ctx, cand, situ, color, all);
    if (r && (!best || r.points > best.points || (r.points === best.points && r.han > best.han))) best = r;
  }
  return best;
}
