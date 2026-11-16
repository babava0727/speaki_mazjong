// 업적: 정의와 달성 기록(브라우저에 저장)
// check(r)가 있는 업적은 대국이 끝났을 때 판정한다.
// r = { won(끝까지 둔 대국에서 이김), surrendered, difficulty, length, points }
// check가 없는 업적은 대국 중 사건으로 달성된다(unlock(id)로 호출)
// reward가 있으면 설명문 아래 줄에 함께 보여 준다
export const ACHIEVEMENTS = [
  { id: 'win-easy', title: '마작 입문', desc: '쉬움 난이도에서 승리한다.', reward: '버터의 도움을 받을 수 있게 됩니다', check: r => r.won && r.difficulty === 'easy' },
  { id: 'win-normal', title: '숙련 작사', desc: '보통 난이도에서 승리한다.', reward: '패를 가까이 가져오면 확인할 수 있게 됩니다.', check: r => r.won && r.difficulty === 'normal' },
  { id: 'win-hard', title: '달인', desc: '어려움 난이도에서 승리한다.', reward: '테이블을 내려칠 수 있게 됩니다', check: r => r.won && r.difficulty === 'hard' },
  { id: 'win-god', title: '죽으면 살 수 있는데', desc: '신역 난이도에서 승리한다.', check: r => r.won && r.difficulty === 'god' },
  { id: 'throw-5', title: '옐로카드', desc: '스피키에게 패를 5번 던진다.' },
  { id: 'throw-10', title: '레드카드', desc: '스피키에게 패를 10번 던진다.', reward: '항복할 때 테이블을 뒤집을 수 있게 됩니다.' },
  { id: 'chase-riichi', title: '네놈을 추격해주마', desc: '스피키가 리치 중에, 리치를 걸어 화료한다.', reward: '리치를 걸 때 점봉을 던지게 됩니다.' },
];

const KEY = 'spk-mahjong-achievements';
const COUNTER_KEY = 'spk-mahjong-counters';

// { id: 달성 시각(ms) }
export function loadUnlocked() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}

function save(done) {
  try { localStorage.setItem(KEY, JSON.stringify(done)); } catch { /* 저장 실패는 무시 */ }
}

// 대국 결과로 새로 달성한 업적 목록을 돌려주고 기록한다
export function recordMatch(result) {
  const done = loadUnlocked();
  const fresh = ACHIEVEMENTS.filter(a => a.check && !done[a.id] && a.check(result));
  if (fresh.length) {
    for (const a of fresh) done[a.id] = Date.now();
    save(done);
  }
  return fresh;
}

// 사건으로 달성: 처음이면 그 업적을, 이미 달성했으면 null
export function unlock(id) {
  const done = loadUnlocked();
  if (done[id]) return null;
  done[id] = Date.now();
  save(done);
  return ACHIEVEMENTS.find(a => a.id === id) || null;
}

// 여러 대국에 걸쳐 쌓이는 횟수(예: 패 던진 횟수). 하나 올리고 새 값을 돌려준다
export function bump(name) {
  let c = {};
  try { c = JSON.parse(localStorage.getItem(COUNTER_KEY)) || {}; } catch { /* 저장소 사용 불가 */ }
  c[name] = (c[name] || 0) + 1;
  try { localStorage.setItem(COUNTER_KEY, JSON.stringify(c)); } catch { /* 저장 실패는 무시 */ }
  return c[name];
}
