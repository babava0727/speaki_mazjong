// 스피키 대사 모음. 같은 상황에 여러 개면 그중 하나를 무작위로 말한다
export const LINES = {
  // 대국 시작
  matchStart: ['교단 사도 총 출동~', '스피키에게 꼭 맞는 자리예요~', '여길 열심히 청소할게요!', '불러서 왔어요~', '세계수의 사제, 네르입니다!'],
  // 스피키가 리치 / 론 / 쯔모
  aiRiichi: ['볶고 지지고 태워줄 거예요!', '말리지 마세요!', '누군지 맞춰보세요~'],
  aiRon: ['미안하다고 한 적은 없는데, 그런 척 할게요!', '감사해요!', '기대대로 됐어요!', '아주 좋아요!'],
  aiTsumo: ['기대대로 됐어요!', '세계수가 이기랬대요~', '신기하죠?', '아주 좋아요!', '으응, 좋아요, 아주 잘하고 계세요!'],
  // 스피키가 퐁·치·깡: "퐁!" 같은 외침에 더해 이 중에서도 고른다
  aiCall: ['감사해요!'],
  // 내가 리치 / 내가 화료
  playerRiichi: ['이이잉!', '흠, 흠!', '네르 님도 당하는 고난이라면 저도...'],
  playerWin: ['패배한 거예요...', '스피키 열심히 했는데...', '에-으!', '스피키가 아파요!'],
  // 도라를 버렸을 때(적도라 포함)
  aiDoraDiscard: ['왜 이렇게 너저분하지?', '더러운 녀석들이 잔뜩이에요!'],
  playerDoraDiscard: ['으응, 좋아요 아주 잘하고 계세요!', '좋아요!', '바닥 청소인가요?'],
  // 던진 패에 맞았을 때
  hit: [
    '흐에엥! 아파요!', '강냉이를 먼지처럼 털어버리겠어요!', '박 깨지겠네...',
    '흐에엑! 스피키 때리세요!', '자칫하면 쭈글쭈글 접혀버리는 거예요!',
  ],
  // 대국 종료: 내가 이김 / 스피키가 이김(내가 항복했을 때도) / 무승부
  matchPlayerWin: [
    '흐엑! 스피키가 역부족이었나 봐요...', '네르가 진 거니까 네르를 탓하세요!', '더러움에게 패배한 거예요...',
    '스피키 열심히 했는데...', '흐에엥! 스피키 네르지 마세요!', '이제 스피키니까, 스피키는 진 적이 없는 거예요!',
    '사실 스피키였던 거예요...',
  ],
  matchSpikyWin: ['좋아요 좋아요~', '에헤헤, 기분이 정말 뿌듯해져요!', '오늘 저 잘했나요?', '세계수가 이기랬대요~', '기대대로 됐어요!'],
  matchDraw: ['다, 다음에 보여드릴게요!'],
};

export const pick = a => a[Math.floor(Math.random() * a.length)];

// 대사 음성(audio/speaki_voice). 같은 상황의 대사와 순서대로 짝지어진다(첫 대사 ↔ 첫 파일).
// null 이면 그 대사는 음성 없이 말풍선만 나온다
export const VOICES = {
  matchStart: ['vo_start1.mp3', 'vo_start2.mp3', 'vo_start3.mp3', 'vo_start4.mp3', 'vo_start5.mp3'],
  aiRiichi: ['vo_riichi1.mp3', 'vo_riicchi2.mp3', 'vo_riicchi3.mp3'],
  aiRon: ['vo_ron1.wav', 'vo_ron2.mp3', 'vo_ron3.mp3', 'vo_ron4.mp3'],
  aiTsumo: ['vo_tsumo1.mp3', 'vo_tsumo2.mp3', 'vo_tsumo3.wav', 'vo_tsumo4.mp3', 'vo_tsumo5.mp3'],
  aiCall: ['vo_call.mp3'],
  playerRiichi: ['vo_playerriichi1.mp3', 'vo_playerriichi2.mp3', 'vo_playerriichi3.mp3'],
  playerWin: ['vo_playerwin1.wav', 'vo_playerwin2.mp3', 'vo_playerwin3.mp3', 'vo_playerwin4.wav'],
  aiDoraDiscard: ['vo_aidora1.mp3', 'vo_aidora2.mp3'],
  playerDoraDiscard: ['vo_playerdora1.mp3', 'vo_playerdora2.wav', 'vo_playerdora3.mp3'],
  hit: ['vo_hit1.mp3', 'vo_hit2.mp3', 'vo_hit3.mp3', 'vo_hit4.mp3', 'vo_hit5.mp3'],
  matchPlayerWin: [
    'vo_matchplayerwin1.mp3', 'vo_matchPlayerWin2.mp3', 'vo_matchPlayerWin3.mp3', 'vo_matchPlayerWin4.mp3',
    'vo_matchPlayerWin5.wav', 'vo_matchPlayerWin6.mp3', 'vo_matchPlayerWin7.mp3',
  ],
  matchSpikyWin: ['vo_matchspeakiwin1.wav', 'vo_matchspeakiwin2.mp3', 'vo_matchspeakiwin3.mp3', 'vo_matchspeakiwin4.mp3', 'vo_matchspeakiwin5.mp3'],
  matchDraw: ['vo_draw.mp3'],
};

// 상황별 스피키 표정(image/ 폴더). 없는 상황은 표정 그대로
export const MOOD_IMAGES = {
  normal: ['image/spk_normal.png'],
  happy: ['image/spk_happy.png', 'image/spk_happy2.png', 'image/spk_happy3.png'],
  sad: ['image/spk_sad.png', 'image/spk_sad2.png'],
  redcard: ['image/spk_redcard.png'], // 레드카드 퇴장 때
};
export const MOODS = {
  aiRiichi: 'happy', aiRon: 'happy', aiTsumo: 'happy', aiCall: 'happy',
  playerRiichi: 'sad', playerWin: 'sad', playerDoraDiscard: 'happy',
  hit: 'sad', matchPlayerWin: 'sad', matchSpikyWin: 'happy',
};

// 상황(key)에 맞는 대사 하나를 무작위로: { text, voice, mood }
export function line(key) {
  const i = Math.floor(Math.random() * LINES[key].length);
  return { text: LINES[key][i], voice: (VOICES[key] || [])[i] || null, mood: MOODS[key] || null };
}

export const voiceFiles = () => Object.values(VOICES).flat().filter(Boolean);
