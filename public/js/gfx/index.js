// 결승전 3D 모듈 입구. 발표 화면(stage.js)에서 window.Finale.run(종목, ...)으로 부릅니다.
import { run as race } from './race.js';
import { run as battle } from './battle.js';
import { preload } from './chars.js';
window.Finale = { run: (mode, root, players, done) => (mode === 'race' ? race : battle)(root, players, done), preload: () => preload(['warrior', 'mage', 'archer', 'thief', 'bard', 'cleric']).catch(() => {}) };
window.dispatchEvent(new Event('finale-ready'));
