// HTML HUD: 점수판, 버튼, 대기 안내, 결과 화면
import { tileImage, backImage } from './textures.js';
import { typeOf, isRedId, tileName, windName } from './rules.js';
import { DIFFICULTY_NAMES, LENGTH_NAMES } from './game.js';
import { ACHIEVEMENTS, loadUnlocked } from './achievements.js';
import { initAudio, buttonOn, buttonClick, butterButton, volumes, setVolume, voice } from './sfx.js';

const $ = id => document.getElementById(id);
const fmt = n => n.toLocaleString('ko-KR');
const signed = n => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(-n)}` : '±0');
const NAMES = ['나', '스피키'];
const DIFFICULTIES = [
  { value: 'easy', desc: '마작 초보 스피키가 상대합니다.' },
  { value: 'normal', desc: '적당한 실력을 가진 스피키가 상대합니다.' },
  { value: 'hard', desc: '이 스피키는 꽤 상대하기 힘듭니다.' },
  { value: 'god', desc: '스피키 ~어둠에 내려앉은 천재~' },
].map(o => ({ ...o, label: DIFFICULTY_NAMES[o.value] }));
const LENGTHS = [
  { value: 'east', desc: '동1국 ~ 동4국' },
  { value: 'half', desc: '동1국 ~ 남4국' },
].map(o => ({ ...o, label: LENGTH_NAMES[o.value] }));

const imgT = (t, red = false, cls = '') => `<img class="tile ${cls}" src="${tileImage(t, red)}" alt="${tileName(t)}">`;
const imgId = (id, cls = '') => imgT(typeOf(id), isRedId(id), cls);
// 업적 설명문(보상이 있으면 다음 줄에)
const achvDesc = a => (a.reward ? `${a.desc}<br>${a.reward}` : a.desc);
const imgBack = (cls = '') => `<img class="tile ${cls}" src="${backImage()}" alt="뒷면">`;

export class UI {
  constructor() {
    this.toastTimer = 0;
    // 모든 버튼: 마우스를 올리면 / 누르면 효과음. 브라우저 정책상 소리는 첫 클릭·키 입력 뒤부터 난다
    const unlock = () => initAudio();
    document.addEventListener('pointerdown', unlock, { capture: true, once: true });
    document.addEventListener('keydown', unlock, { capture: true, once: true });
    document.addEventListener('mouseover', e => {
      const b = e.target.closest && e.target.closest('button');
      if (b && !b.disabled && !b.contains(e.relatedTarget)) buttonOn();
    });
    document.addEventListener('click', e => {
      const b = e.target.closest && e.target.closest('button');
      if (b && !b.disabled) buttonClick();
    }, true);
    this.onButter = null;
    $('butter').addEventListener('click', () => {
      if (!this.onButter) return;
      butterButton();
      this.onButter();
    });
  }

  // 우상단 버터: 누르면 onButter(), 남은 횟수 n/max 표시(0이면 흐리게)
  // 버터는 대국 중에만 보인다
  showButter(on) { $('butter').classList.toggle('hidden', !on); }

  setButter(n, max) {
    $('butter').querySelector('.butter-count').textContent = `${n}/${max}`;
    $('butter').classList.toggle('empty', n <= 0);
  }

  // 버터 말풍선(그림 아래)을 ms 동안 띄운다. html은 게임이 만든 문구(<b> 강조 포함)
  butterSay(html, ms = 3200) {
    const el = $('butter').querySelector('.butter-say');
    el.innerHTML = html;
    el.classList.add('show');
    clearTimeout(this.butterSayTimer);
    this.butterSayTimer = setTimeout(() => el.classList.remove('show'), ms);
  }

  // 우하단 테이블 내려치기 버튼. onSlam()이 돌려주는 Promise가 끝날 때까지 비활성화
  setSlam(onSlam) {
    const el = $('slam');
    el.classList.toggle('hidden', !onSlam);
    el.onclick = onSlam ? async () => {
      el.disabled = true;
      try { await onSlam(); } finally { el.disabled = false; }
    } : null;
  }

  hideLoading() { $('loading').classList.add('hidden'); }

  update(g) {
    $('round').textContent = g.roundLabel();
    $('mode').textContent = g.modeLabel();
    $('honba').textContent = `${g.honba}본장`;
    $('sticks').textContent = `리치봉 ${g.sticks}`;
    $('remain').textContent = g.players.length ? g.liveRemaining() : '-';
    $('dora').innerHTML = g.players.length ? g.doraIndicatorIds().map(id => imgId(id)).join('') : '';
    for (const seat of [0, 1]) {
      const key = seat === 0 ? 'me' : 'opp';
      const p = g.players[seat];
      $(`${key}-pts`).textContent = fmt(g.points[seat]);
      $(`${key}-wind`).textContent = p ? windName(p.wind) : '';
      $(`${key}-wind`).classList.toggle('dealer', !!p && seat === g.dealer);
      $(`${key}-riichi`).classList.toggle('hidden', !(p && p.riichi));
    }
  }

  setButtons(list) {
    const box = $('actions');
    box.innerHTML = '';
    for (const b of list) {
      const el = document.createElement('button');
      // 리치·론·쯔모·퐁·치·깡(그리고 fly를 준 패스·리치 취소) 버튼은 외침 글씨처럼 오른쪽 화면 밖에서 날아온다
      const fly = b.fly ?? ['win', 'riichi', 'call'].includes(b.cls);
      el.className = `act ${b.cls || ''}${fly ? ' rise' : ''}`;
      el.innerHTML = `<span>${b.label}</span>${b.tiles ? `<span class="mini">${b.tiles.map(t => imgT(t)).join('')}</span>` : ''}`;
      el.addEventListener('click', b.onClick);
      box.appendChild(el);
    }
  }

  setWaitInfo(info) {
    const el = $('wait-info');
    if (!info) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    const pre = info.preview ? '<span class="pre">버리면</span> ' : '';
    if (info.shanten === 0) {
      const ws = info.waits.map(w => `<span class="w">${imgT(w.t)}<small>${w.left}</small></span>`).join('');
      el.innerHTML = `${pre}<b class="tenpai">텐파이</b>${info.furiten ? '<b class="furiten">후리텐</b>' : ''}<span class="waits">${ws}</span>`;
    } else if (info.shanten > 0) {
      el.innerHTML = `${pre}<b>${info.shanten}샹텐</b>`;
    } else {
      el.innerHTML = `${pre}<b class="tenpai">화료형</b>`;
    }
  }

  // 경고 카드(좌상단 정보창 아래): 'yellow' / 'red'
  addCard(kind) {
    const box = $('cards');
    const card = document.createElement('span');
    card.className = `card-icon ${kind}`;
    box.appendChild(card);
    box.classList.remove('hidden');
  }
  clearCards() { $('cards').innerHTML = ''; $('cards').classList.add('hidden'); }

  // 레드카드 퇴장 화면
  showRedCard() {
    return this.modal(`
      <div class="redcard-over">
        <div class="big-red"></div>
        <img class="face big" src="image/spk_redcard.png" alt="">
        <h2>레드카드</h2>
        <p>룰과 매너를 지켜 즐겁게 마작하자!</p>
      </div>
      <button class="next">메인 메뉴로</button>`);
  }

  // 대국 중 업적 달성 알림(오른쪽 위에 잠시)
  achievementPopup(a) {
    const el = document.createElement('div');
    el.className = 'achv-popup';
    el.innerHTML = `<span>업적 달성!</span><b>${a.title}</b><small>${achvDesc(a)}</small>`;
    $('hud').appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 400); }, 3500);
  }

  // fly: 오른쪽 화면 밖에서 날아와 가운데를 살짝 지나쳤다가 돌아온다(리치·론·쯔모·퐁·치·깡)
  toast(text, cls = '', ms = 1100, fly = false) {
    const el = $('toast');
    el.textContent = text;
    el.className = cls;
    void el.offsetWidth; // 연달아 떠도 날아오는 움직임을 처음부터 다시
    el.className = `show ${cls}${fly ? ' fly' : ''}`;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { el.className = cls; }, ms);
  }

  closeModal() { $('modal').classList.add('hidden'); }

  // 암전: 화면을 ms 동안 천천히 검게 / 다시 밝게. 검은 동안은 클릭을 막는다
  fade(toBlack, ms) {
    const el = $('fade');
    el.style.transitionDuration = `${ms}ms`;
    el.classList.toggle('on', toBlack);
    el.style.opacity = toBlack ? '1' : '0';
    return new Promise(r => setTimeout(r, ms));
  }

  // 예/아니오 확인창. Esc = 아니오, Enter = 예. extraLabel을 주면 세 번째 버튼이 생기고 누르면 'extra'
  confirm(title, text, yesLabel, noLabel, extraLabel = null) {
    return new Promise(resolve => {
      const el = $('confirm');
      $('confirm-title').textContent = title;
      $('confirm-text').textContent = text;
      $('confirm-yes').textContent = yesLabel;
      $('confirm-no').textContent = noLabel;
      $('confirm-extra').textContent = extraLabel || '';
      $('confirm-extra').classList.toggle('hidden', !extraLabel);
      el.classList.remove('hidden');
      const done = v => {
        el.classList.add('hidden');
        document.removeEventListener('keydown', onKey, true);
        resolve(v);
      };
      const onKey = e => {
        if (e.key === 'Escape' || e.key === 'Enter') {
          e.stopImmediatePropagation();
          done(e.key === 'Enter');
        }
      };
      $('confirm-yes').onclick = () => done(true);
      $('confirm-no').onclick = () => done(false);
      $('confirm-extra').onclick = () => done('extra');
      document.addEventListener('keydown', onKey, true);
    });
  }

  modal(html) {
    return new Promise(resolve => {
      $('modal-card').innerHTML = html;
      $('modal').classList.remove('hidden');
      $('modal-card').querySelector('button.next').addEventListener('click', () => {
        $('modal').classList.add('hidden');
        resolve();
      });
    });
  }

  meldHtml(m) {
    return `<span class="meld">${m.ids.map((id, i) =>
      m.type === 'ankan' && (i === 0 || i === 3) ? imgBack() : imgId(id)).join('')}</span>`;
  }

  scoreRows(res) {
    return [0, 1].map(s => `
      <div class="delta-row ${res.after[s] - res.before[s] > 0 ? 'up' : res.after[s] - res.before[s] < 0 ? 'down' : ''}">
        <span>${NAMES[s]}</span><span>${fmt(res.before[s])}</span><span class="arrow">→</span>
        <b>${fmt(res.after[s])}</b><span class="d">${signed(res.after[s] - res.before[s])}</span>
      </div>`).join('');
  }

  showResult(res, g) {
    let html;
    if (res.type === 'win') {
      const sc = res.score;
      const yaku = sc.yaku.map(y => `<li><span>${y.name}</span><b>${typeof y.han === 'number' ? `${y.han}판` : y.han}</b></li>`).join('');
      const total = sc.yakuman
        ? `<b class="limit">${sc.limit}</b>`
        : `${sc.han}판 ${sc.fu}부${sc.limit ? ` <b class="limit">${sc.limit}</b>` : ''}`;
      const extra = [res.honba ? `${res.honba}본장 +${fmt(res.honba * 300)}` : '', res.sticks ? `리치봉 +${fmt(res.sticks * 1000)}` : '']
        .filter(Boolean).join(' · ');
      html = `
        <div class="res-head ${res.winner === 0 ? 'me' : 'opp'}">
          ${res.winner === 1 ? `<img class="face" src="${res.face || 'image/spk_happy.png'}" alt="">` : ''}
          <div><h2>${res.tsumo ? '쯔모' : '론'}!</h2><p>${NAMES[res.winner]}의 화료</p></div>
        </div>
        <div class="hand-row">${res.hand.map(id => imgId(id)).join('')}<span class="gap"></span>${imgId(res.winId, 'win')}
          ${res.melds.map(m => this.meldHtml(m)).join('')}</div>
        <div class="dora-row"><span>도라 표시패</span>${res.dora.map(id => imgId(id, 'sm')).join('')}
          ${res.ura.length ? `<span>뒷도라</span>${res.ura.map(id => imgId(id, 'sm')).join('')}` : ''}</div>
        <ul class="yaku">${yaku}</ul>
        <div class="total">${total}<span class="pts">${fmt(sc.points)}점</span></div>
        ${extra ? `<div class="extra">${extra}</div>` : ''}
        <div class="deltas">${this.scoreRows(res)}</div>
        <button class="next">다음</button>`;
    } else {
      const label = s => res.tenpai[s] ? '<b class="tenpai">텐파이</b>' : '<span class="noten">노텐</span>';
      html = `
        <div class="res-head"><div><h2>유국</h2><p>패산이 바닥났습니다</p></div></div>
        ${[0, 1].map(s => `
          <div class="draw-row"><span class="who">${NAMES[s]}</span>${label(s)}
            <div class="hand-row small">${res.tenpai[s] ? res.hands[s].map(id => imgId(id)).join('') : ''}</div></div>`).join('')}
        <div class="deltas">${this.scoreRows(res)}</div>
        <button class="next">다음</button>`;
    }
    return this.modal(html);
  }

  // line: 스피키 대사(게임에서 고름)
  showFinal(g, { surrendered = false, line = '', face = 'image/spk_normal.png', unlocked = [] } = {}) {
    const [me, opp] = g.points;
    let title = me > opp ? '승리!' : me < opp ? '패배…' : '무승부';
    if (surrendered) title = '항복…';
    const html = `
      <div class="res-head final ${me >= opp && !surrendered ? 'me' : 'opp'}">
        <img class="face big" src="${face}" alt="">
        <div><h2>${title}</h2><p>“${line}”</p></div>
      </div>
      <div class="final-scores">
        <div><span>나</span><b>${fmt(me)}</b></div>
        <div><span>스피키</span><b>${fmt(opp)}</b></div>
      </div>
      ${unlocked.map(a => `<div class="achv-new"><span>업적 달성!</span><b>${a.title}</b><small>${achvDesc(a)}</small></div>`).join('')}
      <button class="next">메인 메뉴로</button>`;
    return this.modal(html);
  }

  // 메인 메뉴: 게임 시작 → 난이도 → 대국 길이를 고르면 { difficulty, length }로 resolve.
  // 업적·설정은 아직 빈 화면, 종료는 창 닫기를 시도한다. 방향키·Enter·Esc로도 조작
  showMainMenu() {
    // 스크롤바 없이, 좌클릭한 채 위아래로 끌어서 목록을 움직인다(목록이 창보다 길 때만 움직임)
    const dragList = viewport => {
      const list = viewport.firstElementChild;
      let y = 0, startY = 0, startOffset = 0, dragging = false;
      const limit = () => Math.min(0, viewport.clientHeight - list.offsetHeight);
      const apply = () => { y = Math.max(limit(), Math.min(0, y)); list.style.transform = `translateY(${y}px)`; };
      viewport.onpointerdown = e => {
        if (e.button !== 0) return;
        dragging = true;
        startY = e.clientY;
        startOffset = y;
        viewport.classList.add('dragging');
        viewport.setPointerCapture(e.pointerId);
      };
      viewport.onpointermove = e => { if (dragging) { y = startOffset + (e.clientY - startY); apply(); } };
      viewport.onpointerup = viewport.onpointercancel = () => { dragging = false; viewport.classList.remove('dragging'); };
      apply();
    };
    return new Promise(resolve => {
      const menu = $('main-menu'), page = $('menu-page'), choice = $('menu-choice'), settings = $('menu-settings');
      let onKeyScreen = null;
      const onKey = e => onKeyScreen && onKeyScreen(e);
      const show = el => { [menu, page, choice, settings].forEach(x => x.classList.toggle('hidden', x !== el)); };
      // 목록 화면 공통: 마우스·방향키로 고르고 Enter로 선택, Esc로 뒤로
      const bindList = (buttons, onChoose, onBack) => {
        let focus = 0;
        const setFocus = i => {
          focus = (i + buttons.length) % buttons.length;
          buttons.forEach((b, k) => b.classList.toggle('focus', k === focus));
        };
        buttons.forEach((b, k) => { b.onclick = () => onChoose(k); b.onmouseenter = () => setFocus(k); });
        setFocus(0);
        onKeyScreen = e => {
          if (e.key === 'ArrowDown') setFocus(focus + 1);
          else if (e.key === 'ArrowUp') setFocus(focus - 1);
          else if (e.key === 'Enter') onChoose(focus);
          else if (e.key === 'Escape' && onBack) onBack();
        };
      };
      // 대국 길이까지 고르면: 천천히 암전 → 잠시 멈춤 → (게임이 시작되며 다시 밝아짐)
      const finish = async opts => {
        document.removeEventListener('keydown', onKey);
        onKeyScreen = null;
        await this.fade(true, 1000);
        show(null);
        await new Promise(r => setTimeout(r, 300));
        resolve(opts);
      };
      const showPage = (title, text) => {
        $('menu-page-title').textContent = title;
        $('menu-page-text').textContent = text;
        $('menu-back').onclick = showMain;
        onKeyScreen = e => { if (e.key === 'Escape' || e.key === 'Enter') showMain(); };
        show(page);
      };
      const showChoice = (title, options, onChoose, onBack) => {
        $('menu-choice-title').textContent = title;
        const list = $('menu-choice-list');
        list.innerHTML = '';
        const buttons = options.map(o => {
          const b = document.createElement('button');
          b.innerHTML = `${o.label}<small>${o.desc}</small>`;
          list.appendChild(b);
          return b;
        });
        $('menu-choice-back').onclick = onBack;
        bindList(buttons, k => onChoose(options[k].value), onBack);
        show(choice);
      };
      // 업적 목록: 달성한 것은 날짜와 함께, 아직인 것은 흐리게
      const showAchievements = () => {
        const done = loadUnlocked();
        const count = ACHIEVEMENTS.filter(a => done[a.id]).length;
        const date = ms => { const d = new Date(ms); return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`; };
        $('menu-page-title').textContent = `업적 ${count} / ${ACHIEVEMENTS.length}`;
        $('menu-page-text').innerHTML = `<div class="achv-viewport"><ul class="achv-list">${ACHIEVEMENTS.map(a => `
          <li class="${done[a.id] ? 'done' : ''}">
            <b>${a.title}</b><small>${achvDesc(a)}</small>
            <span>${done[a.id] ? `달성 ${date(done[a.id])}` : '미달성'}</span>
          </li>`).join('')}</ul></div>`;
        show(page);
        dragList($('menu-page-text').querySelector('.achv-viewport'));
        $('menu-back').onclick = showMain;
        onKeyScreen = e => { if (e.key === 'Escape' || e.key === 'Enter') showMain(); };
        show(page);
      };
      // 설정: 화면 모드(창/전체화면/테두리 없는 창) + 음량 3종
      const showSettings = () => {
        const modeButtons = [...$('display-mode').querySelectorAll('button')];
        const markMode = () => {
          const full = !!document.fullscreenElement;
          const mode = full ? (this.displayMode === 'borderless' ? 'borderless' : 'fullscreen') : 'window';
          modeButtons.forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
        };
        modeButtons.forEach(b => {
          b.onclick = async () => {
            this.displayMode = b.dataset.mode;
            try {
              if (b.dataset.mode === 'window') { if (document.fullscreenElement) await document.exitFullscreen(); }
              else if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
            } catch { /* 브라우저가 거부함 */ }
            markMode();
          };
        });
        document.onfullscreenchange = markMode;
        markMode();
        for (const input of settings.querySelectorAll('input[data-vol]')) {
          const kind = input.dataset.vol, label = input.nextElementSibling;
          input.value = Math.round(volumes[kind] * 100);
          label.textContent = `${input.value}%`;
          input.oninput = () => { setVolume(kind, input.value / 100); label.textContent = `${input.value}%`; };
          // 놓으면 미리 듣기
          input.onchange = () => { if (kind === 'sfx') buttonClick(); else if (kind === 'voice') voice('vo_call.mp3'); };
        }
        $('settings-back').onclick = showMain;
        onKeyScreen = e => { if (e.key === 'Escape') showMain(); };
        show(settings);
      };
      const pickLength = difficulty => showChoice('대국 길이', LENGTHS, length => finish({ difficulty, length }), pickDifficulty);
      const pickDifficulty = () => showChoice('난이도', DIFFICULTIES, pickLength, showMain);
      function showMain() {
        const buttons = [...menu.querySelectorAll('button')];
        bindList(buttons, k => {
          const act = buttons[k].dataset.act;
          if (act === 'start') pickDifficulty();
          else if (act === 'achievements') showAchievements();
          else if (act === 'settings') showSettings();
          else if (act === 'exit') {
            window.close(); // 스크립트로 연 창이 아니면 브라우저가 막는다
            showPage('종료', '브라우저 탭을 닫으면 게임이 종료됩니다.');
          }
        }, null);
        show(menu);
      }
      document.addEventListener('keydown', onKey);
      showMain();
    });
  }
}
