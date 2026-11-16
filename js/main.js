import { View } from './view.js';
import { Game } from './game.js';
import { UI } from './ui.js';
import { loadFonts } from './textures.js';
import { initAudio, preloadVoices, bgm } from './sfx.js';
import { voiceFiles } from './lines.js';

const ui = new UI();
await loadFonts();
const view = new View(document.getElementById('c'));
await view.ready;
ui.hideLoading();

const game = new Game(view, ui);
window.game = game;
for (;;) {
  bgm('main'); // 소리는 첫 클릭·키 입력 뒤부터 난다
  const opts = await ui.showMainMenu();
  initAudio();
  preloadVoices(voiceFiles());
  await game.run(opts);
}
