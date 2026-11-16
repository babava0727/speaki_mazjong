// 게임 진행: 배패 → 쯔모/타패 → 울기/론 → 정산. 동풍전 4국(1:1, 친은 번갈아).
import * as R from './rules.js';
import * as AI from './ai.js';
import * as SFX from './sfx.js';
import { LINES, line as pickLine, MOOD_IMAGES } from './lines.js';
import { recordMatch, unlock, bump, loadUnlocked } from './achievements.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));

// 항복하면 진행 중인 대국 흐름을 이 예외로 끊는다
class Surrender extends Error {}
// 이번 대국에서 스피키에게 패를 10번 던지면: 레드카드 퇴장(게임 오버)
class RedCard extends Surrender {}
// 항복 메뉴의 '테이블 뒤집기': 테이블을 뒤집고 항복한다
class TableFlip extends Surrender {}
const YELLOW_AT = 5, RED_AT = 10;
const BUTTER_USES = 3; // 대국마다 버터에게 버릴 패를 물어볼 수 있는 횟수
// 신역: 스피키가 패를 뽑을 때 이 확률로, 뽑을 패를 패산 속 유효패와 몰래 바꿔치기한다
const GOD_LUCK = 0.05;
const byId = (a, b) => a - b;

export const DIFFICULTY_NAMES = { easy: '쉬움', normal: '보통', hard: '어려움', god: '신역' };
export const LENGTH_NAMES = { east: '동풍전', half: '반장전' };
const CALL_TEXT = { riichi: '리치', pon: '퐁', chi: '치', minkan: '깡', ankan: '깡', kakan: '깡', ron: '론', tsumo: '쯔모' };

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class Game {
  constructor(view, ui) {
    this.view = view;
    this.ui = ui;
    this.players = [];
    this.wall = [...Array(136).keys()];
    this.drawPtr = 0;
    this.kanCount = 0;
    this.doraRevealed = 0;
    this.rinshanTaken = 0;
    this.points = [25000, 25000];
    this.dealer = 0;
    this.roundIdx = 0;
    this.difficulty = 'normal';
    this.length = 'east';
    this.honba = 0;
    this.sticks = 0;
    this.inputCtx = null;
    this.running = false;
    this.paused = false;
    this.aborted = false;
    this.abortP = null;
    document.addEventListener('keydown', e => { if (e.key === 'Escape') this.askSurrender(); });
    view.onTileClick = id => this.onTileClick(id);
    ui.onButter = () => this.useButter();
    view.onTileHover = id => this.onTileHover(id);
    view.onTileKnocked = () => SFX.haiTsumo();
    view.onReorder = (id, index) => this.reorderHand(id, index);
    view.onTileThrown = () => {
      SFX.haiDasu(0.8);
      // 업적: 스피키에게 패를 던진 횟수(대국을 넘어 누적)
      const n = bump('throws');
      if (n >= 5) this.achieve('throw-5');
      if (n >= 10) this.achieve('throw-10');
      // 이번 대국에서 던진 횟수: 5번째 옐로카드, 10번째 레드카드 퇴장
      if (!this.running || this.aborted) return;
      this.matchThrows++;
      if (this.matchThrows === YELLOW_AT) this.ui.addCard('yellow');
      if (this.matchThrows >= RED_AT) {
        this.aborted = true;
        this.abortReject(new RedCard());
      }
    };
  }

  // ---------- 상태 조회 ----------
  // 왕패 14장 = wall[122..135]. 영상패 122~125, 도라 표시패 126,128,…, 뒷도라 127,129,…
  liveRemaining() { return 122 - this.kanCount - this.drawPtr; }
  doraIndicatorIds() { return Array.from({ length: this.doraRevealed }, (_, k) => this.wall[126 + 2 * k]); }
  uraIndicatorIds() { return Array.from({ length: this.doraRevealed }, (_, k) => this.wall[127 + 2 * k]); }
  // 도라(표시패 다음 패) 또는 적도라인가
  isDora(id) {
    const t = R.typeOf(id);
    return R.isRedId(id) || this.doraIndicatorIds().some(ind => R.doraOf(R.typeOf(ind)) === t);
  }
  isDoraShown(i) { return i >= 126 && i % 2 === 0 && (i - 126) / 2 < this.doraRevealed; }
  concealedIds(seat) {
    const p = this.players[seat];
    return p.drawn != null ? [...p.hand, p.drawn] : [...p.hand];
  }
  // 동풍전: 동1~4국, 반장전: 동1~4국 + 남1~4국
  get roundWind() { return this.roundIdx < 4 ? R.EAST : R.SOUTH; }
  get totalRounds() { return this.length === 'half' ? 8 : 4; }
  roundLabel() { return `${'동남'[Math.floor(this.roundIdx / 4)]} ${this.roundIdx % 4 + 1}국`; }
  modeLabel() { return `${DIFFICULTY_NAMES[this.difficulty]} · ${LENGTH_NAMES[this.length]}`; }

  // seat 입장에서 보이지 않는 패 수
  unseenCounts(seat) {
    const u = new Array(34).fill(4);
    for (const id of this.concealedIds(seat)) u[R.typeOf(id)]--;
    for (const p of this.players) {
      for (const d of p.discards) if (!d.called) u[R.typeOf(d.id)]--;
      for (const m of p.melds) for (const id of m.ids) u[R.typeOf(id)]--;
    }
    for (const id of this.doraIndicatorIds()) u[R.typeOf(id)]--;
    return u.map(x => Math.max(0, x));
  }

  evalWin(seat, winId, { tsumo, rinshan = false }) {
    const p = this.players[seat];
    const ids = tsumo ? this.concealedIds(seat) : [...this.concealedIds(seat), winId];
    const types = ids.map(R.typeOf);
    if (R.shanten(R.toCounts(types), p.melds.length) !== -1) return null;
    const meldIds = p.melds.flatMap(m => m.ids);
    return R.scoreHand({
      concealed: types,
      melds: p.melds.map(m => ({ type: m.type, tiles: m.ids.map(R.typeOf) })),
      winTile: R.typeOf(winId),
      tsumo,
      riichi: p.riichi,
      doubleRiichi: p.doubleRiichi,
      ippatsu: p.riichi && p.ippatsu,
      haitei: tsumo && !rinshan && this.liveRemaining() === 0,
      houtei: !tsumo && this.liveRemaining() === 0,
      rinshan,
      seatWind: p.wind,
      roundWind: this.roundWind,
      dora: this.doraIndicatorIds().map(R.typeOf),
      ura: p.riichi ? this.uraIndicatorIds().map(R.typeOf) : [],
      red: [...ids, ...meldIds].filter(R.isRedId).length,
      dealer: seat === this.dealer,
    });
  }

  isFuriten(seat) {
    const p = this.players[seat];
    if (p.furitenTemp || p.furitenRiichi) return true;
    const w = R.waits(R.toCounts(p.hand.map(R.typeOf)), p.melds.length);
    return w.some(t => p.discardedTypes.has(t));
  }

  riichiOptions(seat) {
    const p = this.players[seat];
    if (p.riichi || !p.melds.every(m => m.type === 'ankan') || this.points[seat] < 1000 || this.liveRemaining() < 2) return [];
    const ids = this.concealedIds(seat);
    const c = R.toCounts(ids.map(R.typeOf));
    const ok = new Set();
    for (const t of new Set(ids.map(R.typeOf))) {
      c[t]--;
      if (R.shanten(c, p.melds.length) === 0) ok.add(t);
      c[t]++;
    }
    return ids.filter(id => ok.has(R.typeOf(id)));
  }

  selfKanOptions(seat) {
    const p = this.players[seat];
    if (p.riichi || this.liveRemaining() <= 0 || this.kanCount >= 4) return [];
    const ids = this.concealedIds(seat);
    const out = [];
    const byType = new Map();
    for (const id of ids) {
      const t = R.typeOf(id);
      if (!byType.has(t)) byType.set(t, []);
      byType.get(t).push(id);
    }
    for (const [t, list] of byType) if (list.length === 4) out.push({ type: 'ankan', tile: t, ids: list.sort(byId) });
    p.melds.forEach((m, meldIdx) => {
      if (m.type !== 'pon') return;
      const t = R.typeOf(m.ids[0]);
      const id = ids.find(x => R.typeOf(x) === t);
      if (id != null) out.push({ type: 'kakan', tile: t, id, meldIdx });
    });
    return out;
  }

  responseOptions(seat, did) {
    const p = this.players[seat];
    const t = R.typeOf(did);
    const o = { ron: null, pon: null, chi: [], kan: null };
    const sc = this.evalWin(seat, did, { tsumo: false });
    if (sc && !this.isFuriten(seat)) o.ron = sc;
    if (p.riichi || this.liveRemaining() <= 0) return o;
    const redFirst = (a, b) => (R.isRedId(b) ? 1 : 0) - (R.isRedId(a) ? 1 : 0);
    const same = p.hand.filter(id => R.typeOf(id) === t).sort(redFirst);
    if (same.length >= 2) o.pon = same.slice(0, 2);
    if (same.length >= 3 && this.kanCount < 4) o.kan = same.slice(0, 3);
    if (t < 27) {
      const n = t % 9;
      const find = u => p.hand.filter(id => R.typeOf(id) === u).sort(redFirst)[0];
      for (const [d1, d2] of [[-2, -1], [-1, 1], [1, 2]]) {
        if (n + d1 < 0 || n + d2 > 8) continue;
        const a = find(t + d1), b = find(t + d2);
        if (a != null && b != null) o.chi.push([a, b]);
      }
    }
    return o;
  }

  // ---------- 상태 변경 ----------
  // 대국 중 업적 달성: 처음이면 화면에 알림
  achieve(id) {
    const a = unlock(id);
    if (!a) return;
    this.ui.achievementPopup(a);
    SFX.chime();
  }

  newHand() {
    this.wall = shuffle([...Array(136).keys()]);
    this.drawPtr = 0;
    this.kanCount = 0;
    this.doraRevealed = 1;
    this.rinshanTaken = 0;
    this.uninterrupted = true;
    this.riichiSeq = 0;
    this.players = [0, 1].map(seat => ({
      seat, hand: [], drawn: null, melds: [], discards: [],
      riichi: false, doubleRiichi: false, ippatsu: false, riichiPending: false,
      discardedTypes: new Set(), furitenTemp: false, furitenRiichi: false,
      forbidden: null, sidewaysNext: false, hasDiscarded: false, revealed: false,
      wind: seat === this.dealer ? R.EAST : R.WEST,
      roundWind: this.roundWind,
    }));
    this.view.breakOffset = Math.floor(Math.random() * 68);
    this.view.setLastDiscard(null);
    this.view.setRiichiStick(0, false);
    this.view.setRiichiStick(1, false);
  }

  // 뽑은 패를 손패에 합칠 때: 손패가 정렬된 상태면 제자리에, 직접 배치한 상태면 맨 오른쪽에 넣는다
  removeFromConcealed(p, ids) {
    if (p.drawn != null) {
      const sorted = p.hand.every((id, i) => i === 0 || p.hand[i - 1] <= id);
      const at = sorted ? p.hand.findIndex(id => id > p.drawn) : -1;
      p.hand.splice(at < 0 ? p.hand.length : at, 0, p.drawn);
      p.drawn = null;
    }
    for (const id of ids) p.hand.splice(p.hand.indexOf(id), 1);
  }

  // 플레이어가 손패를 끌어 자리를 옮김
  reorderHand(id, index) {
    const hand = this.players[0].hand;
    const from = hand.indexOf(id);
    if (from < 0) return;
    hand.splice(from, 1);
    hand.splice(Math.min(index, hand.length), 0, id);
    this.sync(160);
  }

  discard(seat, id, riichi) {
    const p = this.players[seat];
    if (p.drawn === id) p.drawn = null;
    else this.removeFromConcealed(p, [id]);
    if (p.riichi) p.ippatsu = false;
    const sideways = riichi || p.sidewaysNext;
    p.sidewaysNext = false;
    p.discards.push({ id, sideways, called: false });
    p.discardedTypes.add(R.typeOf(id));
    p.furitenTemp = false;
    p.forbidden = null;
    if (riichi) {
      p.riichi = true;
      p.riichiOrder = ++this.riichiSeq; // 누가 먼저 리치했는지(추격 리치 판정용)
      p.doubleRiichi = this.uninterrupted && !p.hasDiscarded;
      p.riichiPending = true;
    }
    p.hasDiscarded = true;
  }

  settleRiichi(seat) {
    const p = this.players[seat];
    if (!p.riichiPending) return;
    p.riichiPending = false;
    p.ippatsu = true;
    this.points[seat] -= 1000;
    this.sticks++;
    this.view.setRiichiStick(seat, true);
  }

  interrupt() {
    this.uninterrupted = false;
    for (const p of this.players) p.ippatsu = false;
  }

  doCall(seat, from, did, a) {
    const p = this.players[seat], q = this.players[from];
    const entry = q.discards[q.discards.length - 1];
    entry.called = true;
    if (entry.sideways) q.sidewaysNext = true;
    this.removeFromConcealed(p, a.ids);
    const t = R.typeOf(did);
    let ids;
    p.forbidden = new Set([t]);
    if (a.type === 'chi') {
      ids = [did, ...a.ids.sort(byId)];
      const [x, y] = a.ids.map(R.typeOf).sort(byId);
      if (x === t + 1 && y === t + 2 && t % 9 <= 5) p.forbidden.add(t + 3);
      if (x === t - 2 && y === t - 1 && t % 9 >= 3) p.forbidden.add(t - 3);
    } else if (a.type === 'pon') ids = [a.ids[0], did, a.ids[1]];
    else ids = [a.ids[0], did, a.ids[1], a.ids[2]];
    p.melds.push({ type: a.type, ids });
    this.interrupt();
  }

  doSelfKan(seat, a) {
    const p = this.players[seat];
    if (a.type === 'ankan') {
      this.removeFromConcealed(p, a.ids);
      p.melds.push({ type: 'ankan', ids: a.ids });
    } else {
      this.removeFromConcealed(p, [a.id]);
      const m = p.melds[a.meldIdx];
      m.type = 'kakan';
      m.ids.push(a.id);
    }
    this.interrupt();
  }

  // 깡 후 영상패를 받고, 새 도라 표시패는 누가 깡을 했든 플레이어가 직접 클릭해서 뒤집을 때까지 기다린다
  async drawRinshan(seat) {
    this.players[seat].drawn = this.wall[122 + this.rinshanTaken++];
    this.kanCount++;
    this.sync(320);
    await this.guard(this.view.awaitFlip(this.wall[126 + 2 * this.doraRevealed]));
    this.doraRevealed++;
    SFX.clack(0.4);
  }

  sync(dur = 260) {
    this.view.sync(this, dur);
    this.view.updateConsole({ round: this.roundLabel(), remain: this.players.length ? this.liveRemaining() : '' });
    this.ui.update(this);
    if (!this.inputCtx) this.updateWaitInfo();
  }

  // 스피키가 말한다: 말풍선 + 음성. 말풍선은 음성이 끝날 때까지 떠 있다
  // l.mood가 있으면 말하는 동안 표정도 바뀐다. 고른 표정 그림은 l.image
  speak(l, ms = 1800) {
    const dur = SFX.voice(l.voice);
    const shown = Math.max(ms, dur * 1000 + 400);
    this.view.say(l.text, shown);
    if (l.mood) l.image = this.view.setMood(l.mood, shown + 600);
    return l;
  }

  announce(seat, kind) {
    const text = CALL_TEXT[kind];
    if (seat === 1) {
      // 퐁·치·깡: "퐁!" 같은 외침(음성 없음) 또는 aiCall 대사 중 하나
      if (kind === 'riichi') this.speak(pickLine('aiRiichi'));
      else this.speak(Math.random() < 1 / (1 + LINES.aiCall.length) ? { text: `${text}!`, voice: null, mood: 'happy' } : pickLine('aiCall'));
      this.view.react('hop');
    } else if (kind === 'riichi') {
      this.speak(pickLine('playerRiichi'));
      this.view.react('shake');
    }
    this.ui.toast(text, seat === 1 ? 'opp' : 'me', 1100, true);
    SFX.pop();
  }

  // ---------- 진행 ----------
  // ---------- 항복 ----------
  // 대국 흐름에서 기다리는 모든 것은 guard를 거친다: 항복하면 즉시 Surrender로 끊긴다
  guard(p) { return Promise.race([p, this.abortP]); }
  // 확인창이 떠 있는 동안에는 진행(상대 차례 등)도 멈춘다
  async sleep(ms) {
    await this.guard(sleep(ms));
    while (this.paused) await this.guard(sleep(100));
  }

  async askSurrender() {
    if (!this.running || this.paused || this.aborted) return;
    this.paused = true;
    // 테이블 뒤집기는 업적 '레드카드'를 달성한 뒤부터
    const canFlip = !!loadUnlocked()['throw-10'];
    const ans = await this.ui.confirm('항복할까요?', '이번 대국은 패배로 끝납니다.', '항복', '계속하기', canFlip ? '테이블 뒤집기' : null);
    this.paused = false;
    if (!ans || !this.running) return;
    this.aborted = true;
    this.abortReject(ans === 'extra' ? new TableFlip() : new Surrender());
  }

  // opts: { difficulty: 'easy'|'normal'|'hard'|'god', length: 'east'|'half' }
  async run(opts = {}) {
    this.aborted = false;
    this.quickDiscard = false;
    this.matchThrows = 0;
    this.ui.clearCards();
    this.abortP = new Promise((_, reject) => { this.abortReject = reject; });
    this.abortP.catch(() => {});
    this.running = true;
    // 업적 보상: '달인'(어려움 승리) → 테이블 내려치기, '숙련 작사'(보통 승리) → 뽑은 패를 가까이 가져와 확인하기,
    // '마작 입문'(쉬움 승리) → 우상단 버터(버릴 패 추천)
    const done = loadUnlocked();
    this.ui.setSlam(done['win-hard'] ? () => this.view.slam() : null);
    this.butterLeft = BUTTER_USES;
    this.ui.setButter(this.butterLeft, BUTTER_USES);
    this.ui.showButter(!!done['win-easy']);
    this.view.inspectEnabled = !!done['win-normal'];
    this.view.resetTable();
    let surrendered = false, redCard = false, flipped = false, line;
    try {
      await this.playMatch(opts);
    } catch (e) {
      if (!(e instanceof Surrender)) throw e;
      surrendered = true;
      redCard = e instanceof RedCard;
      flipped = e instanceof TableFlip;
      // 진행 중이던 입력·연출 정리
      this.inputCtx = null;
      this.ui.setButtons([]);
      this.ui.closeModal();
      this.view.cancelInteractions();
    }
    this.ui.setSlam(null);
    this.ui.showButter(false);
    if (flipped) await this.view.flipTable();
    if (redCard) {
      this.running = false;
      this.ui.addCard('red');
      SFX.bgm(null);
      SFX.redcard();
      this.view.setMood('redcard', Infinity);
      this.view.react('shake');
      await this.ui.showRedCard();
      return;
    }
    if (surrendered) {
      line = this.speak(pickLine('matchSpikyWin'), 2500); // 말풍선과 종료 화면에 같은 대사·표정(음성은 여기서 한 번만)
      this.view.setMood('happy', Infinity);
      this.view.react('joy');
    }
    this.running = false;
    // 끝까지 둔 대국: 결과에 맞는 대사를 종료 화면에 띄우며 음성도 재생
    if (!surrendered) {
      const [me, opp] = this.points;
      line = pickLine(me > opp ? 'matchPlayerWin' : me < opp ? 'matchSpikyWin' : 'matchDraw');
      SFX.voice(line.voice);
      if (line.mood) line.image = this.view.setMood(line.mood, Infinity); // 종료 화면 동안 그 표정 유지
    }
    // 업적: 끝까지 둔 대국에서 이겼는지 확인(항복은 패배)
    const [me, opp] = this.points;
    const unlocked = recordMatch({
      won: !surrendered && me > opp, surrendered, difficulty: this.difficulty, length: this.length, points: [...this.points],
    });
    if (unlocked.length) SFX.chime();
    if (SFX.currentBgm() !== 'yakuman') SFX.bgm('result'); // 마지막 판이 역만이면 그 곡을 이어서
    await this.ui.showFinal(this, { surrendered, line: line.text, face: line.image || MOOD_IMAGES.normal[0], unlocked });
  }

  async playMatch(opts) {
    this.difficulty = opts.difficulty || 'normal';
    this.length = opts.length || 'east';
    this.points = [25000, 25000];
    this.dealer = 0;
    this.roundIdx = 0;
    this.honba = 0;
    this.sticks = 0;
    this.view.setMood('normal');
    // 암전에서 밝아지며 시작. 다 밝아지면 스피키가 인사
    this.ui.fade(false, 1200).then(() => {
      if (!this.running) return;
      this.speak(pickLine('matchStart'), 2600);
      this.view.react('hop');
    });
    for (;;) {
      const res = await this.playHand();
      const dealerKeeps = res.type === 'win' ? res.winner === this.dealer : res.tenpai[this.dealer];
      if (!(res.type === 'win' && res.score.yakuman)) SFX.bgm('result');
      await this.guard(this.ui.showResult(res, this));
      if (this.points.some(x => x < 0)) break;
      if (dealerKeeps) this.honba++;
      else {
        this.dealer = 1 - this.dealer;
        this.roundIdx++;
        this.honba = res.type === 'win' ? 0 : this.honba + 1;
      }
      if (this.roundIdx >= this.totalRounds) break;
    }
  }

  async deal() {
    const order = [this.dealer, 1 - this.dealer];
    SFX.haiGet();
    for (let r = 0; r < 3; r++) {
      for (const s of order) {
        for (let k = 0; k < 4; k++) this.players[s].hand.push(this.wall[this.drawPtr++]);
        this.sync(320);
        await this.sleep(170);
      }
    }
    for (const s of order) this.players[s].hand.push(this.wall[this.drawPtr++]);
    this.sync(320);
    await this.sleep(380);
    for (const p of this.players) p.hand.sort(byId);
    this.sync(380);
    await this.sleep(400);
  }

  async playHand() {
    SFX.bgm('ingame');
    this.newHand();
    this.sync(750);
    await this.sleep(900);
    await this.deal();
    let cur = this.dealer, needDraw = true, rinshan = false;
    for (;;) {
      const p = this.players[cur];
      if (needDraw) {
        if (this.liveRemaining() <= 0) return this.exhaustiveDraw();
        // 내 차례엔 패산의 다음 패를 직접 집어 손패 오른쪽 영역에 놓아야 쯔모가 된다(리치 중에도)
        // 집은 패를 쥔 채로 확인하고 버림패 영역에 놓았으면 손패에 넣지 않고 바로 버린다(쯔모기리)
        if (cur === 0) this.quickDiscard = await this.guard(this.view.awaitDraw(this.wall[this.drawPtr], p.hand.length)) === 'discard';
        if (cur === 1 && this.difficulty === 'god') this.godDraw();
        p.drawn = this.wall[this.drawPtr++];
        rinshan = false;
        if (!(cur === 0 && this.quickDiscard)) {
          this.sync(cur === 0 ? 280 : 220);
          await this.sleep(cur === 0 ? 280 : 150);
        }
      }
      const justDrew = needDraw || rinshan;
      const act = cur === 0 ? await this.playerTurn(justDrew, rinshan) : await this.aiTurn(justDrew, rinshan);

      if (act.type === 'tsumo') {
        // 내 쯔모: 손패 한쪽 끝에서 반대쪽 끝까지 쓸어서 넘어뜨려야 화료가 진행된다
        if (cur === 0) {
          // 안내는 처음 쯔모할 때 한 번만
          if (!this.knockHintShown) {
            this.knockHintShown = true;
            this.ui.toast('패를 쓸어 넘어뜨리세요', 'hint', 2500);
          }
          await this.guard(this.view.knockDown([...p.hand, p.drawn]));
        }
        return this.win(cur, 1 - cur, p.drawn, true, rinshan);
      }

      if (act.type === 'ankan' || act.type === 'kakan') {
        this.doSelfKan(cur, act);
        this.announce(cur, act.type);
        this.sync(320);
        await this.sleep(500);
        await this.drawRinshan(cur);
        this.sync(450);
        await this.sleep(450);
        needDraw = false;
        rinshan = true;
        continue;
      }

      // 타패
      this.discard(cur, act.id, act.riichi);
      this.view.setLastDiscard(act.id);
      if (cur === 0) this.view.handTap();
      this.sync(cur === 0 ? 240 : 320);
      setTimeout(() => SFX.haiDasu(), cur === 0 ? 190 : 270);
      if (act.riichi) {
        this.announce(cur, 'riichi');
        // 배경음: 상대가 이미 리치 중이면 추격 리치 곡, 아니면 리치 곡
        SFX.bgm(this.players[1 - cur].riichi ? 'chase' : 'riichi');
      }
      // 업적 '네놈을 추격해주마'를 달성했으면 점수봉을 손으로 던지고, 아니면 정산 때 제자리에 그냥 나타난다
      if (act.riichi && cur === 0 && loadUnlocked()['chase-riichi']) this.view.tossRiichiStick();
      else if (this.isDora(act.id)) this.speak(pickLine(cur === 1 ? 'aiDoraDiscard' : 'playerDoraDiscard'));
      if (!act.riichi && cur === 1) this.view.react('nod');
      await this.sleep(cur === 0 ? 280 : 420);

      const other = 1 - cur;
      const resp = other === 0 ? await this.playerResponse(act.id) : await this.aiResponse(act.id);
      if (resp.type === 'ron') return this.win(other, cur, act.id, false, false);
      this.settleRiichi(cur);

      if (resp.type === 'pon' || resp.type === 'chi' || resp.type === 'minkan') {
        this.doCall(other, cur, act.id, resp);
        this.view.setLastDiscard(null);
        this.announce(other, resp.type);
        this.sync(340);
        await this.sleep(480);
        cur = other;
        rinshan = false;
        if (resp.type === 'minkan') {
          await this.drawRinshan(cur);
          this.sync(450);
          await this.sleep(450);
          rinshan = true;
        }
        needDraw = false;
        continue;
      }
      this.sync(200);
      cur = other;
      needDraw = true;
    }
  }

  // ---------- 플레이어 입력 ----------
  awaitInput({ buttons, selectable, riichiMode = false }) {
    return this.guard(new Promise(resolve => {
      const finish = a => {
        this.inputCtx = null;
        this.ui.setButtons([]);
        this.view.setSelectable(null, this.concealedIds(0));
        this.updateWaitInfo();
        resolve(a);
      };
      this.inputCtx = { selectable: new Set(selectable), riichiMode, finish };
      this.ui.setButtons(buttons.map(b => ({ ...b, onClick: () => finish(b.action) })));
      this.view.setSelectable(this.inputCtx.selectable, this.concealedIds(0));
    }));
  }

  // 우상단 버터: 내가 버릴 차례에 누르면 가장 버리기 좋은 패(어려움 AI의 판단)를 알려 주고 횟수가 1 줄어든다.
  // 같은 차례에 다시 누르면 횟수는 그대로 두고 다시 알려 준다. 버릴 차례가 아니면 아무 일도 없다
  useButter() {
    const ctx = this.inputCtx;
    if (!this.running || !ctx || !ctx.selectable.size) return;
    const again = this.butterTurn === this.myTurn;
    if (!again && this.butterLeft <= 0) return;
    const d = this.difficulty;
    this.difficulty = 'hard';
    let id;
    try { id = AI.chooseDiscard(this, 0).id; } finally { this.difficulty = d; }
    // 리치할 패를 고르는 중이면 그중에서(같은 종류가 있으면 그 패)
    if (!ctx.selectable.has(id)) {
      const sel = [...ctx.selectable];
      id = sel.find(x => R.typeOf(x) === R.typeOf(id)) ?? sel[0];
    }
    if (!again) {
      this.butterLeft--;
      this.butterTurn = this.myTurn;
      this.ui.setButter(this.butterLeft, BUTTER_USES);
    }
    this.view.suggestTile(id);
    const name = R.tileName(R.typeOf(id));
    const josa = (name.charCodeAt(name.length - 1) - 0xac00) % 28 ? '을' : '를'; // 받침 있으면 '을'
    this.ui.butterSay(`버터라면 <b>${name}</b>${josa} 버릴 거예요!`);
  }

  // 버림이 받아들여지면 true
  onTileClick(id) {
    const ctx = this.inputCtx;
    if (!ctx || !ctx.selectable.has(id)) return false;
    ctx.finish({ type: 'discard', id, riichi: ctx.riichiMode });
    return true;
  }

  onTileHover(id) {
    if (!this.inputCtx) return;
    this.updateWaitInfo(id != null && this.inputCtx.selectable.has(id) ? id : null);
  }

  // 텐파이/샹텐 안내. previewId가 있으면 그 패를 버렸을 때 기준
  updateWaitInfo(previewId = null) {
    const p = this.players[0];
    if (!p) { this.ui.setWaitInfo(null); return; }
    let ids = this.concealedIds(0);
    if (previewId != null) ids = ids.filter(x => x !== previewId);
    if (ids.length % 3 !== 1) { this.ui.setWaitInfo(null); return; }
    const c = R.toCounts(ids.map(R.typeOf));
    const s = R.shanten(c, p.melds.length);
    const info = { preview: previewId != null, shanten: s };
    if (s === 0) {
      const unseen = this.unseenCounts(0);
      const w = R.waits(c, p.melds.length);
      info.waits = w.map(t => ({ t, left: unseen[t] }));
      const disc = new Set(p.discardedTypes);
      if (previewId != null) disc.add(R.typeOf(previewId));
      info.furiten = p.furitenRiichi || w.some(t => disc.has(t));
    }
    this.ui.setWaitInfo(info);
  }

  async playerTurn(justDrew, rinshan) {
    this.myTurn = (this.myTurn || 0) + 1; // 버터를 이번 차례에 이미 썼는지 가리는 데 쓴다
    const p = this.players[0];
    const tsumo = justDrew ? this.evalWin(0, p.drawn, { tsumo: true, rinshan }) : null;
    if (this.quickDiscard) {
      this.quickDiscard = false;
      if (tsumo && p.riichi) p.furitenRiichi = true; // 리치 중 화료패를 그냥 버림
      return { type: 'discard', id: p.drawn };
    }
    if (p.riichi) {
      if (!tsumo) { await this.sleep(550); return { type: 'discard', id: p.drawn }; }
      const a = await this.awaitInput({ buttons: [{ label: '쯔모', cls: 'win', action: { type: 'tsumo' } }], selectable: [p.drawn] });
      if (a.type === 'discard') p.furitenRiichi = true;
      return a;
    }
    const kans = justDrew ? this.selfKanOptions(0) : [];
    const riichiIds = justDrew ? this.riichiOptions(0) : [];
    const allIds = this.concealedIds(0);
    const normal = allIds.filter(id => !(p.forbidden && p.forbidden.has(R.typeOf(id))));
    const selectable = normal.length ? normal : allIds;
    let riichiMode = false;
    for (;;) {
      const buttons = [];
      if (riichiMode) buttons.push({ label: '리치 취소', cls: 'ghost', fly: true, action: { type: 'cancel' } });
      else {
        if (tsumo) buttons.push({ label: '쯔모', cls: 'win', action: { type: 'tsumo' } });
        if (riichiIds.length) buttons.push({ label: '리치', cls: 'riichi', action: { type: 'riichi' } });
        for (const k of kans) buttons.push({ label: '깡', tiles: [k.tile], cls: 'call', action: k });
      }
      if (riichiMode) this.ui.toast('리치할 패를 파란 영역으로', 'hint', 1300);
      const a = await this.awaitInput({ buttons, selectable: riichiMode ? riichiIds : selectable, riichiMode });
      if (a.type === 'riichi') { riichiMode = true; continue; }
      if (a.type === 'cancel') { riichiMode = false; continue; }
      return a;
    }
  }

  async playerResponse(did) {
    const p = this.players[0];
    const o = this.responseOptions(0, did);
    const buttons = [];
    if (o.ron) buttons.push({ label: '론', cls: 'win', action: { type: 'ron' } });
    if (o.pon) buttons.push({ label: '퐁', cls: 'call', action: { type: 'pon', ids: o.pon } });
    for (const pair of o.chi) {
      buttons.push({ label: '치', tiles: [...pair.map(R.typeOf), R.typeOf(did)].sort(byId), cls: 'call', action: { type: 'chi', ids: pair } });
    }
    if (o.kan) buttons.push({ label: '깡', cls: 'call', action: { type: 'minkan', ids: o.kan } });
    if (!buttons.length) return { type: 'pass' };
    buttons.push({ label: '패스', cls: 'ghost', fly: true, action: { type: 'pass' } });
    const a = await this.awaitInput({ buttons, selectable: [] });
    if (o.ron && a.type !== 'ron') {
      p.furitenTemp = true;
      if (p.riichi) p.furitenRiichi = true;
    }
    return a;
  }

  // ---------- AI ----------
  async aiTurn(justDrew, rinshan) {
    const p = this.players[1];
    this.view.setThinking(true);
    await this.sleep(p.riichi ? 450 : 550 + Math.random() * 550);
    this.view.setThinking(false);
    if (justDrew) {
      if (this.evalWin(1, p.drawn, { tsumo: true, rinshan })) return { type: 'tsumo' };
      if (p.riichi) return { type: 'discard', id: p.drawn };
      for (const k of this.selfKanOptions(1)) if (AI.wantsKan(this, 1, k)) return k;
    }
    return AI.chooseDiscard(this, 1);
  }

  async aiResponse(did) {
    const p = this.players[1];
    const o = this.responseOptions(1, did);
    if (!o.ron && !o.pon && !o.chi.length && !o.kan) return { type: 'pass' };
    const a = AI.chooseResponse(this, 1, did, o);
    if (o.ron && a.type !== 'ron') {
      p.furitenTemp = true;
      if (p.riichi) p.furitenRiichi = true;
    }
    if (a.type !== 'pass') await this.sleep(300);
    return a;
  }

  // ---------- 국 종료 ----------
  // 신역 바꿔치기: 다음에 뽑을 패가 유효패(샹텐을 줄이는 패, 텐파이면 화료패)가 아니면
  // GOD_LUCK 확률로 남은 패산 속 유효패 하나와 자리를 바꾼다. 뒤집힌 패끼리라 화면에서는 티가 나지 않는다
  godDraw() {
    if (Math.random() >= GOD_LUCK) return;
    const p = this.players[1];
    const c = R.toCounts(p.hand.map(R.typeOf));
    const open = p.melds.length;
    const s = R.shanten(c, open);
    const useful = id => {
      const t = R.typeOf(id);
      c[t]++;
      const ok = R.shanten(c, open) < s;
      c[t]--;
      return ok;
    };
    const i = this.drawPtr, end = 122 - this.kanCount;
    if (useful(this.wall[i])) return;
    const picks = [];
    for (let j = i + 1; j < end; j++) if (useful(this.wall[j])) picks.push(j);
    if (!picks.length) return;
    const j = picks[Math.floor(Math.random() * picks.length)];
    [this.wall[i], this.wall[j]] = [this.wall[j], this.wall[i]];
    this.view.placeInWall(this.wall[i], i);
    this.view.placeInWall(this.wall[j], j);
  }

  async win(winner, loser, winId, tsumo, rinshan) {
    const sc = this.evalWin(winner, winId, { tsumo, rinshan });
    // 업적 '네놈을 추격해주마': 스피키가 먼저 리치한 뒤 내가 리치해서 화료
    const [me, spk] = this.players;
    if (winner === 0 && me.riichi && spk.riichi && spk.riichiOrder < me.riichiOrder) this.achieve('chase-riichi');
    const before = [...this.points];
    const pay = sc.points + this.honba * 300;
    let face = null; // 스피키가 이겼을 때 결과창에 쓸 표정 그림
    const sticks = this.sticks;
    this.points[winner] += pay + sticks * 1000;
    this.points[loser] -= pay;
    this.sticks = 0;
    this.players[winner].revealed = true;
    this.view.setRiichiStick(0, false);
    this.view.setRiichiStick(1, false);
    this.ui.toast(tsumo ? '쯔모' : '론', winner === 1 ? 'opp' : 'me', 1600, true);
    if (sc.yakuman) SFX.bgm('yakuman'); // 역만 화료(헤아림 역만 제외): 점수표까지 이어서
    if (winner === 1) {
      face = this.speak(pickLine(tsumo ? 'aiTsumo' : 'aiRon'), 2800).image;
      this.view.react('joy');
      SFX.sad();
    } else {
      this.speak(pickLine('playerWin'), 2800);
      this.view.react('shake');
      SFX.chime();
    }
    this.sync(500);
    await this.sleep(1900);
    const p = this.players[winner];
    return {
      type: 'win', winner, loser, tsumo, score: sc, winId, face,
      hand: this.concealedIds(winner).filter(id => id !== winId).sort(byId),
      melds: p.melds,
      dora: this.doraIndicatorIds(),
      ura: p.riichi ? this.uraIndicatorIds() : [],
      honba: this.honba, sticks, before, after: [...this.points],
    };
  }

  async exhaustiveDraw() {
    const tenpai = this.players.map(p => R.shanten(R.toCounts(p.hand.map(R.typeOf)), p.melds.length) === 0);
    const before = [...this.points];
    if (tenpai[0] !== tenpai[1]) {
      const w = tenpai[0] ? 0 : 1;
      this.points[w] += 1500;
      this.points[1 - w] -= 1500;
    }
    this.players.forEach((p, s) => { p.revealed = tenpai[s]; });
    this.view.setLastDiscard(null);
    this.ui.toast('유국', 'hint', 1600);
    this.sync(500);
    await this.sleep(1700);
    return {
      type: 'draw', tenpai, before, after: [...this.points],
      hands: this.players.map(p => [...p.hand]),
    };
  }
}
