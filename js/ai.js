// 상대 AI: 샹텐·유효패 기반 타패, 리치 상대에게는 안전패 우선.
// 난이도(g.difficulty)
//   easy   쉬움: 가끔 엉뚱한 패를 버리고, 수비하지 않고, 역패 퐁 말고는 울지 않음
//   normal 보통: 가끔 차선책을 고르고, 수비는 느슨함
//   hard   어려움: 최선의 수만 고름
//   god    신역: 어려움 + 상대 손패와 패산을 꿰뚫어 봄(내 대기패는 웬만하면 버리지 않음, 패산에 남은 패만 유효패로 셈)
import { typeOf, isRedId, toCounts, shanten, waits, isYaochu, isDragon, isHonor, doraOf } from './rules.js';

const isValueHonor = (t, p) => isDragon(t) || t === p.wind || t === p.roundWind;
const LEVEL = {
  easy: { mistake: 0.45, spread: 4, defense: 0, riichi: 0.5, calls: false },
  normal: { mistake: 0.15, spread: 2, defense: 0.5, riichi: 1, calls: true },
  hard: { mistake: 0, spread: 1, defense: 1, riichi: 1, calls: true },
  god: { mistake: 0, spread: 1, defense: 1, riichi: 1, calls: true, sees: true },
};
const levelOf = g => LEVEL[g.difficulty] || LEVEL.hard;

// 신역: 아직 패산(뽑을 수 있는 부분)에 남은 패만 센다
function wallCounts(g) {
  const u = new Array(34).fill(0);
  for (let i = g.drawPtr; i < 122 - g.kanCount; i++) u[typeOf(g.wall[i])]++;
  return u;
}

function keepValue(t, c, doras, p) {
  let v = doras.filter(d => d === t).length * 3;
  if (isHonor(t)) {
    if (c[t] >= 2) v += isValueHonor(t, p) ? 3 : 1.5;
    else v += isValueHonor(t, p) ? 0.4 : 0;
  } else {
    const n = t % 9;
    v += n === 0 || n === 8 ? 0.6 : n === 1 || n === 7 ? 1 : 1.3;
    if (n > 0 && c[t - 1]) v += 0.5;
    if (n < 8 && c[t + 1]) v += 0.5;
    if (n > 1 && c[t - 2]) v += 0.25;
    if (n < 7 && c[t + 2]) v += 0.25;
  }
  if (c[t] >= 2) v += 0.8;
  return v;
}

function danger(g, seat, t, unseen, doras) {
  const opp = g.players[1 - seat];
  if (opp.discardedTypes.has(t)) return 0;
  let d;
  if (t >= 27) {
    const vis = 4 - unseen[t];
    d = vis >= 3 ? 0.2 : vis === 2 ? 1.2 : 2.5;
  } else {
    const n = t % 9;
    const safe = k => opp.discardedTypes.has(t + k);
    const suji = n <= 2 ? safe(3) : n >= 6 ? safe(-3) : safe(-3) && safe(3);
    d = n === 0 || n === 8 ? 4 : n === 1 || n === 7 ? 6 : 8;
    if (suji) d *= 0.4;
  }
  if (doras.includes(t)) d += 2;
  return d;
}

function pickId(ids, t, drawn) {
  if (drawn != null && typeOf(drawn) === t) return drawn;
  const list = ids.filter(id => typeOf(id) === t);
  return list.find(id => !isRedId(id)) ?? list[0];
}

export function chooseDiscard(g, seat) {
  const p = g.players[seat];
  const ids = g.concealedIds(seat);
  const open = p.melds.length;
  const menzen = p.melds.every(m => m.type === 'ankan');
  const c = toCounts(ids.map(typeOf));
  const lv = levelOf(g);
  const unseen = lv.sees ? wallCounts(g) : g.unseenCounts(seat);
  const doras = g.doraIndicatorIds().map(id => doraOf(typeOf(id)));
  const opp = g.players[1 - seat];
  const threat = opp.riichi && lv.defense > 0;
  // 신역: 상대가 텐파이면 실제 대기패를 안다
  const oppWaits = lv.sees ? waits(toCounts(g.concealedIds(1 - seat).map(typeOf)), opp.melds.length) : [];

  let types = [...new Set(ids.map(typeOf))];
  if (p.forbidden) {
    const ok = types.filter(t => !p.forbidden.has(t));
    if (ok.length) types = ok;
  }
  const cands = types.map(t => {
    c[t]--;
    const s = shanten(c, open);
    c[t]++;
    return { t, s, uke: 0 };
  });
  const minS = Math.min(...cands.map(x => x.s));
  for (const x of cands) {
    if (x.s <= minS + (threat ? 1 : 0)) {
      c[x.t]--;
      for (let u = 0; u < 34; u++) {
        if (!unseen[u]) continue;
        c[u]++;
        if (shanten(c, open) < x.s) x.uke += unseen[u];
        c[u]--;
      }
      c[x.t]++;
    }
    x.keep = keepValue(x.t, c, doras, p);
    x.danger = threat ? danger(g, seat, x.t, g.unseenCounts(seat), doras) * lv.defense : 0;
    if (oppWaits.includes(x.t)) x.danger += 10000; // 신역: 방총은 끝까지 피한다
  }

  let score;
  if (threat && minS >= 2) score = x => -x.danger * 100 + x.uke * 0.1 - x.s * 5;
  else if (threat && minS === 1) score = x => -x.s * 1000 + x.uke * 8 - x.keep * 3 - x.danger * 45;
  else score = x => -x.s * 1000 + x.uke * 8 - x.keep * 3 - x.danger * 8;
  cands.sort((a, b) => score(b) - score(a));
  // 쉬움·보통: 가끔 상위 몇 개 중 아무거나
  const best = Math.random() < lv.mistake ? cands[Math.floor(Math.random() * Math.min(lv.spread, cands.length))] : cands[0];

  let riichi = false;
  if (best.s === 0 && menzen && !p.riichi && g.points[seat] >= 1000 && g.liveRemaining() >= 2 && Math.random() < lv.riichi) {
    c[best.t]--;
    const w = waits(c, open);
    c[best.t]++;
    riichi = w.some(t => unseen[t] > 0);
  }
  return { type: 'discard', id: pickId(ids, best.t, p.drawn), riichi };
}

export function wantsKan(g, seat, k) {
  const p = g.players[seat];
  if (p.riichi) return false;
  const c = toCounts(g.concealedIds(seat).map(typeOf));
  const open = p.melds.length;
  const before = shanten(c, open);
  if (k.type === 'ankan') {
    c[k.tile] -= 4;
    return shanten(c, open + 1) <= before;
  }
  c[k.tile] -= 1;
  return shanten(c, open) <= before;
}

export function chooseResponse(g, seat, did, opts) {
  if (opts.ron) return { type: 'ron' };
  const p = g.players[seat];
  if (p.riichi) return { type: 'pass' };
  const t = typeOf(did);
  const lv = levelOf(g);
  const c = toCounts(p.hand.map(typeOf));
  const open = p.melds.length;
  const cur = shanten(c, open);
  if (g.players[1 - seat].riichi && cur >= 2 && levelOf(g).defense > 0) return { type: 'pass' };

  const hasYaku = p.melds.some(m => m.type !== 'chi' && isValueHonor(typeOf(m.ids[0]), p))
    || [27, 28, 29, 30, 31, 32, 33].some(h => isValueHonor(h, p) && c[h] >= 3);
  const tanyaoPath = !isYaochu(t)
    && p.melds.every(m => m.ids.every(id => !isYaochu(typeOf(id))))
    && p.hand.filter(id => isYaochu(typeOf(id))).length <= 2;

  if (opts.pon) {
    c[t] -= 2;
    const after = shanten(c, open + 1);
    c[t] += 2;
    if (isValueHonor(t, p) && after <= cur) return { type: 'pon', ids: opts.pon };
    if (lv.calls && (hasYaku || tanyaoPath) && after < cur) return { type: 'pon', ids: opts.pon };
  }
  if (lv.calls && opts.chi.length && (hasYaku || tanyaoPath)) {
    let best = null, bestS = cur;
    for (const pair of opts.chi) {
      const [a, b] = pair.map(typeOf);
      if (!hasYaku && (isYaochu(a) || isYaochu(b))) continue;
      c[a]--; c[b]--;
      const s = shanten(c, open + 1);
      c[a]++; c[b]++;
      if (s < bestS) { bestS = s; best = pair; }
    }
    if (best) return { type: 'chi', ids: best };
  }
  return { type: 'pass' };
}
