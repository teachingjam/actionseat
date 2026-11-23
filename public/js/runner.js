// 기다리는 동안 하는 미니게임 '모험 달리기' (횡스크롤 러닝 액션). 점수는 우리 반 기록판에만 쓰이고 능력치·등수에는 영향이 없습니다.
// Runner.open({cls, name, best, board(), onScore(score)}) / Runner.close() / Runner.isOpen
(function () {
  const { $, esc, icon } = UI;
  const { CLASSES } = GameData;
  const S = (n, o) => window.SFX && SFX.play(n, o);
  const rand = (a, b) => a + Math.random() * (b - a), clamp = (v, a, b) => Math.max(a, Math.min(b, v)), pick = a => a[Math.floor(Math.random() * a.length)], lerp = (a, b, k) => a + (b - a) * k;
  const A = 'assets/runner/', M = 50; // 50 = 화면상 1m
  const THEMES = [
    { name: '속삭이는 숲', sky: ['#6ec6ff', '#c9efff', '#f4fbff'], sub: '#8a5a34', low: ['bush', 'rock', 'crate'], tall: ['stump', 'crates'], hang: ['log'], foe: ['slime', 'bat'] },
    { name: '노을 협곡', sky: ['#ff8f5a', '#ffc27a', '#ffe9b8'], sub: '#b5623e', low: ['cactus', 'rock', 'spike'], tall: ['crates', 'stump'], hang: ['log', 'stal'], foe: ['slime', 'bat'] },
    { name: '잠든 유적', sky: ['#0d2a44', '#215a6e', '#5f9aa0'], sub: '#4a636c', low: ['spike', 'rock', 'bush'], tall: ['pillar'], hang: ['stal', 'axe'], foe: ['skel', 'bat', 'slime'], night: true },
    { name: '마왕성', sky: ['#1f0a26', '#6a1f3c', '#c0493f'], sub: '#3a2a3e', low: ['spike', 'crate'], tall: ['pillar', 'crates'], hang: ['axe', 'stal'], foe: ['skel', 'bat'], night: true }
  ];
  const SMALL = { spike: 0, bush: 1, rock: 2, cactus: 3, crate: 4, gem: 5, potion: 6, chest: 7 }, TALL = { crates: 0, pillar: 1, stump: 2, log: 3, stal: 4, axe: 5 };
  // 직업별 기술
  const SKILL = {
    warrior: { name: '불꽃 돌진', desc: '장애물을 부수며 돌진!', dur: 4.5, col: '#ff8a3c' },
    mage: { name: '별똥별', desc: '장애물을 동전으로 바꿔요', dur: 5.5, col: '#b48cff' },
    archer: { name: '연속 사격', desc: '화살로 앞길을 뚫어요', dur: 5.5, col: '#7be07b' },
    thief: { name: '그림자 질주', desc: '무적 + 동전 두 배', dur: 5, col: '#4dd4ff' },
    bard: { name: '신나는 앙코르', desc: '동전이 모두 따라와요', dur: 6.5, col: '#ffb84d' },
    cleric: { name: '빛의 축복', desc: '체력 회복 + 보호막', dur: 1, col: '#ffe066' }
  };
  const NEED = 120; // 기술에 필요한 동전
  let root = null, opt = null, G = null, raf = 0, imgs = {}, loading = {};
  function img(n) { if (!loading[n]) loading[n] = new Promise(r => { const i = new Image(); i.onload = () => { imgs[n] = i; r(i); }; i.onerror = () => r(null); i.src = A + n + '.webp'; }); return loading[n]; }

  function open(o) {
    if (root) return;
    opt = o; root = document.createElement('div'); root.id = 'runner';
    root.innerHTML = `<canvas></canvas>
      <div class="rn-hud"><div class="rn-hp">${icon('heart', 34)}<div class="rn-bar"><i></i></div></div><div class="rn-info"><span class="rn-dist">0m</span><span>${icon('coin', 26)}<b class="rn-coin">0</b></span><span class="rn-score">0</span></div><button class="rn-x" data-nosfx title="그만하기">✕</button></div>
      <div class="rn-msg"></div>
      <div class="rn-ctl"><div class="rn-left"><button class="rn-b rn-skill" data-nosfx><i></i><img src="${CLASSES[o.cls].img}" alt=""><b>${SKILL[o.cls].name}</b></button><button class="rn-b rn-jump" data-nosfx><b>점프</b></button></div><button class="rn-b rn-slide" data-nosfx><b>슬라이드</b></button></div>
      <div class="rn-panel"></div>`;
    document.body.appendChild(root); document.body.classList.add('rn-on');
    if (window.SFX) SFX.preload(['coin', 'gem', 'glass', 'whoosh', 'slide', 'crash', 'rock', 'gain', 'levelup', 'power', 'j_fail', 'j_good', 'j_start', 'pop', 'slash', 'zap', 'arrow', 'heavy', 'error']);
    q('.rn-x').addEventListener('click', () => { S('back'); if (G && G.on && !G.over) finish(true); else close(); });
    const hold = (sel, dn, up) => { const b = q(sel); b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); try { b.setPointerCapture(e.pointerId); } catch (x) {} b.classList.add('dn'); dn(); }); ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(n => b.addEventListener(n, () => { b.classList.remove('dn'); if (up) up(); })); };
    hold('.rn-jump', jump); hold('.rn-slide', () => slide(true), () => slide(false)); hold('.rn-skill', skill);
    // 화면 아무 데나: 왼쪽은 점프, 오른쪽은 슬라이드
    const cv = q('canvas'); let sl = null;
    cv.addEventListener('pointerdown', e => { e.preventDefault(); if (e.clientX > innerWidth * .5) { sl = e.pointerId; slide(true); } else jump(); });
    ['pointerup', 'pointercancel'].forEach(n => cv.addEventListener(n, e => { if (e.pointerId === sl) { sl = null; slide(false); } }));
    addEventListener('keydown', key); addEventListener('keyup', keyUp); addEventListener('resize', fit); addEventListener('blur', letGo);
    root.addEventListener('contextmenu', e => e.preventDefault());
    fit(); G = fresh(); G.on = false; startPanel();
    Promise.all(['run_' + o.cls, 'it_small', 'it_tall', 'it_coin', 'it_mon', 'bg0_far', 'bg0_mid', 'gr0'].map(img)).then(() => { if (!root) return; const b = q('.rn-go'); if (b) { b.disabled = false; b.textContent = '달리기 시작!'; } });
    last = performance.now(); raf = requestAnimationFrame(loop);
  }
  function close() {
    if (!root) return; cancelAnimationFrame(raf); removeEventListener('keydown', key); removeEventListener('keyup', keyUp); removeEventListener('resize', fit); removeEventListener('blur', letGo);
    root.remove(); root = null; G = null; document.body.classList.remove('rn-on'); const f = opt && opt.onClose; opt = null; if (f) f();
  }
  // 모험·결승전이 시작되면 하던 판을 저장하고 닫음
  function stop() { if (!root) return; if (G && G.on && !G.over) report(); close(); }
  const q = s => root.querySelector(s);
  const KEYS = { Space: 'j', ArrowUp: 'j', KeyW: 'j', ArrowDown: 's', KeyS: 's', KeyX: 'k', Enter: 'k', ShiftLeft: 'k' };
  function key(e) { const k = KEYS[e.code]; if (!k || !G || !G.on) return; e.preventDefault(); if (e.repeat) return; k === 'j' ? jump() : k === 's' ? slide(true) : skill(); }
  function keyUp(e) { if (KEYS[e.code] === 's') slide(false); }
  function letGo() { slide(false); }

  // ---------- 화면 크기 ----------
  let cv, g, VW = 960, VH = 540, GY = 422, SC = 1;
  function fit() { if (!root) return; cv = q('canvas'); g = cv.getContext('2d', { alpha: false }); const w = Math.max(1, innerWidth), h = Math.max(1, innerHeight), pr = Math.min(devicePixelRatio || 1, 1.5, 1600 / w); cv.width = Math.round(w * pr); cv.height = Math.round(h * pr); VW = Math.max(760, 540 * w / h); VH = VW * h / w; GY = VH > 700 ? VH * .6 : VH - 120; SC = cv.width / VW; }

  // ---------- 새 판 ----------
  function fresh() {
    return { on: false, over: false, t: 0, x: 0, v: 440, hp: 100, coins: 0, gauge: 0, score: 0, bonus: 0, y: 0, vy: 0, jumps: 0, sliding: false, wantSlide: false, inv: 0, hitT: 0, fr: 0, spin: 0, skT: 0, skMax: 1, skTick: 0, shield: 0, combo: 0, comboT: 0, shake: 0, flash: 0, slow: 0, dead: 0, next: 800, trail: 260, lastPlan: '', fork: 150, acts: [], sign: [], gim: { sand: 0, dark: 0 }, obs: [], items: [], pits: [], ps: [], fl: [], shots: [], theme: 0, fade: 1, prev: 0, potT: 7, chestT: 18, mile: 100, run: 0, kills: 0 };
  }
  function start() { for (const k in H) delete H[k]; S('j_start', { vol: .6 }); q('.rn-panel').classList.add('hidden'); G = fresh(); G.on = true; G.best = opt.best || 0; say(THEMES[0].name, '동전길을 따라 달려라!'); THEMES.forEach((_, i) => [`bg${i}_far`, `bg${i}_mid`, `gr${i}`].forEach(img)); }

  // ---------- 조작 ----------
  function jump() { if (!G || !G.on || G.over) return; if (G.jumps === 0 && G.y <= 1) { G.vy = 960; G.jumps = 1; G.sliding = false; S('whoosh', { vol: .28, rate: 1.35 }); puff(0, 6); } else if (G.jumps < 2) { G.vy = 880; G.jumps = 2; G.spin = .001; S('whoosh', { vol: .3, rate: 1.7 }); S('pop', { vol: .3 }); burst(PX(), G.y + 40, 8, '#ffffff', 160); } }
  function slide(on) { if (!G) return; if (on && G.on && !G.over && !G.wantSlide) { S('slide', { vol: .4 }); if (G.y > 10) G.vy = Math.min(G.vy, -1250); } G.wantSlide = on; }
  function skill() {
    if (!G || !G.on || G.over || G.skT > 0) return; if (G.gauge < NEED) { S('error', { vol: .4 }); return; }
    const c = opt.cls, k = SKILL[c]; G.gauge = 0; G.skT = G.skMax = k.dur; G.skTick = 0; G.flash = .35; G.shake = 10; S('power'); S({ warrior: 'heavy', mage: 'zap', archer: 'arrow', thief: 'slash', bard: 'levelup', cleric: 'gain' }[c], { vol: .7 });
    say(k.name + '!', k.desc, k.col); burst(PX(), G.y + 60, 40, k.col, 420); if (c === 'cleric') { G.hp = Math.min(100, G.hp + 8); G.shield = 1; G.bonus += 500; fly('체력 +8', PX(), G.y + 150, '#7dffb0'); } G.inv = Math.max(G.inv, .4);
  }

  // ---------- 만들기 ----------
  const PX = () => Math.max(150, VW * .2); // 화면에서 캐릭터 위치
  function coin(x, y, kind) { G.items.push({ x, y, k: kind || 'coin', t: rand(0, 1) }); }
  function ob(kind, x, o) { const T = THEMES[G.theme], n = pick(T[kind]); const B = { low: { w: 46, h: n === 'cactus' ? 74 : 52, dw: 124, dh: 124 }, tall: { w: 44, h: 136, dw: 152, dh: 304 }, hang: { w: 78, h: 900, y: 64, dw: 186, dh: 372 } }[kind]; G.obs.push(Object.assign({ kind, n, x, y: 0, vx: 0, t: rand(0, 6) }, B, o)); }
  function foe(n, x) { const B = { slime: { w: 58, h: 46, dw: 128, dh: 128, vx: 0, y: 0 }, bat: { w: 60, h: 40, dw: 120, dh: 120, vx: 130, y: 84 }, skel: { w: 40, h: 92, dw: 150, dh: 150, vx: 60, y: 0 } }[n]; G.obs.push(Object.assign({ kind: 'foe', n, x, mx: x, r: (DIM[n] || {}).r || 0, t: rand(0, 6) }, B)); }
  // ---------- 동전길 ----------
  // 순서: ① 살아남는 동작(점프·2단·슬라이드)을 정하고 ② 실제와 같은 물리로 궤적을 계산해 ③ 궤적에 맞춰 장애물을 놓고 ④ 궤적 위에 동전을 깐다.
  // 그래서 동전만 따라가면 반드시 피할 수 있고, 타이밍이 조금(±0.08초) 어긋나도 괜찮은지까지 확인한 뒤에만 내보낸다.
  const GRAV = 2700, V1 = 960, V2 = 880, AIR = 2 * V1 / GRAV; // 한 번 점프 체공 0.71초
  const DIM = { low: { w: 46, h: 74, st: 46 }, tall: { w: 44, h: 136, st: 52 }, hang: { w: 78, h: 900, y: 64, st: 80 }, float: { w: 116, h: 70, y: 126 }, floatlow: { w: 100, h: 84, y: 64 }, slime: { w: 58, h: 46 }, skel: { w: 40, h: 92, r: .14 }, bat: { w: 60, h: 40, y: 74, r: .3, h2: 70 } };
  // ---------- 난이도 (시간 t초에 따라) ----------
  const ease = (t, a, b) => a + (b - a) * clamp(t / 110, 0, 1);
  const DIFF = {
    drain: t => 1.6 + t * .0052 + Math.max(0, t - 105) * .015,         // 초당 체력 감소
    potEvery: t => 9 + t * .045, potHeal: t => Math.max(12, 24 - t * .075), // 물약 간격(초)·회복
    hit: t => 25 + t * .13,                                            // 부딪힐 때
    gap: t => ease(t, .6, .15), tol: t => ease(t, .11, .05),           // 쉬는 시간·타이밍 여유
    size: t => t / 24                                                  // 장애물이 커지는 단계
  };
  // 동작대로 움직였을 때의 궤적 (acts: {t, k:'j' 점프 / 's' 슬라이드, d 길이})
  function path(acts, dur, off) {
    const P = [], dt = 1 / 120; let y = 0, vy = 0, jumps = 0; const J = acts.filter(a => a.k === 'j').map(a => a.t + off), L = acts.filter(a => a.k === 's').map(a => [a.t + off, a.t + a.d + off]); let n = 0;
    for (let t = -.2; t < dur + .2; t += dt) { while (n < J.length && t >= J[n]) { if (jumps < 2) { vy = jumps ? V2 : V1; jumps++; } n++; } vy -= GRAV * dt; y += vy * dt; if (y <= 0) { y = 0; vy = 0; jumps = 0; } P.push({ t, y, s: y < 12 && L.some(q => t >= q[0] && t <= q[1]) }); }
    return P;
  }
  const wide = o => DIM[o.k].w + ((o.m || 1) - 1) * (DIM[o.k].st || 0);
  // 이 동작(acts)으로 장애물을 모두 피하는지, 타이밍이 ±tol초 어긋나도 확인
  function safe(acts, c, v, tol) {
    for (const off of [0, -tol, tol]) for (const p of path(acts, c.dur, off)) {
      if (p.t < 0 || p.t > c.dur) continue; const top = p.s ? 46 : 104;
      for (const o of c.obs) { const d = DIM[o.k], r = (o.t - p.t) * v * (1 + (d.r || 0)); if (Math.abs(r) < wide(o) / 2 + 24 && p.y < (d.y || 0) + (d.h2 || d.h) + 4 && p.y + top > (d.y || 0) - 4) return false; }
      for (const q of c.pits || []) if (p.y <= 0 && p.t > q[0] && p.t < q[1]) return false;
    }
    return true;
  }
  // 장애물을 여러 개로 늘리고 구덩이를 넓힘 (k단계). 안전 확인을 통과하는 가장 큰 단계를 씀
  function harder(c, k) { return Object.assign({}, c, { obs: c.obs.map(o => Object.assign({}, o, { m: o.k === 'low' ? 1 + Math.min(3, k) : o.k === 'tall' ? 1 + (k > 1 ? 1 : 0) + (k > 3 ? 1 : 0) : o.k === 'hang' ? 1 + (k > 2 ? 1 : 0) : 1 })), pits: (c.pits || []).map(p => [p[0] - k * .02, p[1] + k * .02]) }); }
  // 동작 조각들. at = 점프하는 시각
  const jmp = at => ({ t: at, k: 'j' }), sld = (at, d) => ({ t: at, k: 's', d }), dbl = at => [jmp(at), jmp(at + .33)];
  const MID = AIR / 2, DMID = .57, DAIR = 1.135; // 점프 정점, 2단 점프 가운데, 2단 점프 체공
  const PLANS = [
    { d: 0, n: '하나', f: () => ({ acts: [jmp(.1)], obs: [{ k: 'low', t: .1 + MID }], dur: 1 }) },
    { d: 0, n: '숙이기', f: () => ({ acts: [sld(.1, .6)], obs: [{ k: 'hang', t: .42 }], dur: .9 }) },
    { d: 0, n: '폴짝', f: () => ({ acts: [jmp(.1)], obs: [], dur: 1, gem: .1 + MID }) },
    { d: 20, n: '슬라임', f: () => ({ acts: [jmp(.1)], obs: [{ k: 'slime', t: .1 + MID }], dur: 1 }) },
    { d: 40, n: '둘', f: () => ({ acts: [jmp(.1), jmp(1.05)], obs: [{ k: 'low', t: .1 + MID }, { k: 'low', t: 1.05 + MID }], dur: 1.95 }) },
    { d: 60, n: '구덩이', f: () => ({ acts: [jmp(.1)], obs: [], pits: [[.1 + .15, .1 + AIR - .16]], dur: 1 }) },
    { d: 90, n: '높은 것', f: () => ({ acts: dbl(.1), obs: [{ k: 'tall', t: .1 + DMID }], dur: 1.45, gem: .1 + DMID }) },
    { d: 110, n: '넘고 숙이기', f: () => ({ acts: [jmp(.1), sld(1.06, .6)], obs: [{ k: 'low', t: .1 + MID }, { k: 'hang', t: 1.38 }], dur: 1.85 }) },
    { d: 120, n: '셋', f: () => ({ acts: [jmp(.1), jmp(.98), jmp(1.86)], obs: [0, 1, 2].map(i => ({ k: i === 1 ? 'slime' : 'low', t: .1 + .88 * i + MID })), dur: 2.75 }) },
    { d: 130, n: '박쥐', f: () => ({ acts: [sld(.1, .62)], obs: [{ k: 'bat', t: .42 }], dur: .9 }) },
    { d: 150, n: '해골', f: () => ({ acts: [jmp(.1)], obs: [{ k: 'skel', t: .1 + MID }], dur: 1 }) },
    { d: 160, n: '긴 슬라이드', f: () => ({ acts: [sld(.1, 1.0)], obs: [.4, .6, .8].map(t => ({ k: 'hang', t })), dur: 1.3 }) },
    { d: 200, n: '구덩이와 하나', f: () => ({ acts: [jmp(.1), jmp(1.05)], obs: [{ k: 'low', t: 1.05 + MID }], pits: [[.25, .1 + AIR - .16]], dur: 1.95 }) },
    { d: 240, n: '긴 구덩이', f: () => ({ acts: dbl(.1), obs: [], pits: [[.28, .1 + DAIR - .2]], dur: 1.45, gem: .1 + DMID }) },
    { d: 270, n: '넘고 크게 넘기', f: () => ({ acts: [jmp(.1), ...dbl(1.06)], obs: [{ k: 'low', t: .1 + MID }, { k: 'tall', t: 1.06 + DMID }], dur: 2.4 }) },
    { d: 300, n: '크게 넘고 숙이기', f: () => ({ acts: [...dbl(.1), sld(1.5, .6)], obs: [{ k: 'tall', t: .1 + DMID }, { k: 'hang', t: 1.82 }], dur: 2.3 }) },
    { d: 340, n: '숙이고 넘고 숙이기', f: () => ({ acts: [sld(.1, .55), jmp(.9), sld(1.84, .55)], obs: [{ k: 'hang', t: .4 }, { k: 'low', t: .9 + MID }, { k: 'hang', t: 2.14 }], dur: 2.6 }) },
    { d: 380, n: '징검다리', f: () => ({ acts: [jmp(.1), jmp(1), jmp(1.9)], obs: [], pits: [[.25, .65], [1.15, 1.55], [2.05, 2.45]], dur: 2.8 }) },
    { d: 430, n: '박쥐와 구덩이', f: () => ({ acts: [sld(.1, .6), jmp(.98), jmp(1.9)], obs: [{ k: 'bat', t: .42 }, { k: 'low', t: 1.9 + MID }], pits: [[1.13, 1.53]], dur: 2.8 }) },
    { d: 480, n: '큰 구덩이와 높은 것', f: () => ({ acts: [...dbl(.1), ...dbl(1.5)], obs: [{ k: 'tall', t: 1.5 + DMID }], pits: [[.28, .1 + DAIR - .2]], dur: 2.9 }) }
  ];
  // 갈림길: 아래(lo)는 쉽고 동전이 적고, 위(hi)는 어렵고 보석이 많음. 둘 다 같은 장애물을 피해 감
  const FORKS = [
    () => ({ lo: [], hi: dbl(.3), obs: [{ k: 'float', t: .3 + DMID }], dur: 1.8 }),
    () => ({ lo: [jmp(.15)], hi: [...dbl(.15), ...dbl(1.5)], obs: [{ k: 'low', t: .15 + MID }, { k: 'float', t: 1.5 + DMID }], dur: 2.9 }),
    () => ({ lo: [sld(1.72, .7)], hi: [...dbl(.15), ...dbl(1.5)], obs: [{ k: 'float', t: .15 + DMID }, { k: 'floatlow', t: 1.5 + DMID }], dur: 2.9 })
  ];
  const STEP = 50; // 동전 간격
  function lay(x, y, k) { coin(x, y, k); G.trail = x; }
  function groundTo(x) { while (G.trail + STEP <= x) lay(G.trail + STEP, 48); }
  function put(c, X, v, th, loop) {
    const T = THEMES[th], lc = th === 0 ? (loop ? .35 : 0) : th === 1 ? (loop ? .45 : .15) : th === 2 ? .6 : .75;
    c.obs.forEach(o => {
      const x = X(o.t), late = Math.random() < lc, set = loop ? .34 : .4; // late: 가까이 가야 나타나는 장애물 (길과는 항상 맞음)
      if (o.k === 'low' || o.k === 'tall' || o.k === 'hang') ob(o.k, x, Object.assign({ m: o.m || 1, w: wide(o) }, late ? { late: o.k === 'hang' ? 'drop' : o.k === 'low' && th === 3 ? 'fire' : 'rise', set, gv: v } : {}));
      else if (o.k === 'float' || o.k === 'floatlow') G.obs.push({ kind: 'float', n: 'bat', x, y: DIM[o.k].y, w: DIM[o.k].w, h: DIM[o.k].h, t: rand(0, 6), m: 2 });
      else foe(o.k, x);
    });
    (c.pits || []).forEach(p => G.pits.push({ a: X(p[0]) - 14, b: X(p[1]) + 14 }));
  }
  function spawn() {
    while (G.next < G.x + VW + 400) {
      const eta = (G.next - G.x) / G.v, v = speed(G.t + eta), t = G.t + eta, m = G.next / M, th = Math.floor(m / 250) % 4, loop = Math.floor(m / 1000), tol = DIFF.tol(t), X = q => G.next + q * v;
      groundTo(G.next); let dur;
      if (m >= G.fork) { // 갈림길
        G.fork = m + rand(140, 180); const c = pick(FORKS)(); dur = c.dur;
        if (safe(c.lo, c, v, tol) && safe(c.hi, c, v, .04)) {
          put(c, X, v, th, loop); G.acts.push(...c.lo.map(a => ({ x: X(a.t), k: a.k, len: (a.d || 0) * v, hi: 0 }))); G.sign.push({ x: X(0) });
          let a = G.trail; path(c.lo, c.dur, 0).forEach(p => { if (p.t < 0 || p.t > c.dur) return; const x = X(p.t); if (x - a < STEP * 2) return; a = x; coin(x, p.s ? 24 : p.y > 2 ? p.y + 58 : 48); });
          let b = -1e9; path(c.hi, c.dur, 0).forEach(p => { if (p.t < 0 || p.t > c.dur || p.y < 40) return; const x = X(p.t); if (x - b < STEP) return; b = x; coin(x, p.y + 58, 'sg'); });
        } G.trail = X(c.dur);
      } else {
        const L = PLANS.filter(p => p.d <= m && p.n !== G.lastPlan), pl = L[Math.floor(Math.pow(Math.random(), lerp(.95, .45, clamp(t / 100, 0, 1))) * L.length)], base = pl.f(); G.lastPlan = pl.n; dur = base.dur;
        let c = null; for (let k = Math.min(4, Math.floor(DIFF.size(t) + Math.random())); k >= 0 && !c; k--) { const q = harder(base, k); if (safe(q.acts, q, v, tol)) c = q; } if (!c) c = Object.assign({}, base, { obs: [], pits: [] });
        put(c, X, v, th, loop); G.acts.push(...c.acts.map(a => ({ x: X(a.t), k: a.k, len: (a.d || 0) * v })));
        let gem = c.gem; path(c.acts, c.dur, 0).forEach(p => { if (p.t < 0 || p.t > c.dur) return; const x = X(p.t); if (x - G.trail < STEP) return; if (gem != null && p.t >= gem) { gem = null; return lay(x, p.y + 58, 'gem'); } lay(x, p.s ? 24 : p.y > 2 ? p.y + 58 : 48); });
      }
      const end = X(dur), gap = v * DIFF.gap(t); G.potT -= dur + gap / v; G.chestT -= dur + gap / v;
      if (G.potT <= 0) { groundTo(end + gap * .3); lay(G.trail + STEP * 1.2, 62, 'potion'); G.potT = DIFF.potEvery(t); } else if (G.chestT <= 0) { groundTo(end + gap * .3); lay(G.trail + STEP * 1.2, 58, 'chest'); G.chestT = rand(16, 24); }
      G.next = Math.max(end + gap, G.trail + STEP);
    }
    while (G.acts.length && G.acts[0].x < G.x - 2500) G.acts.shift(); G.sign = G.sign.filter(q => q.x > G.x - 400);
  }

  // ---------- 효과 ----------
  function burst(x, y, n, c, sp, o) { for (let i = 0; i < n && G.ps.length < 170; i++) { const a = rand(0, 6.28), s = rand(.3, 1) * sp; G.ps.push(Object.assign({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s + 60, r: rand(3, 8), c, t: 0, l: rand(.3, .7), gr: 500 }, o || {})); } }
  function puff(dx, n) { for (let i = 0; i < n && G.ps.length < 170; i++) G.ps.push({ x: PX() - 20 + (dx || 0), y: 6, vx: rand(-160, -20), vy: rand(10, 90), r: rand(6, 13), c: 'rgba(255,255,255,.55)', t: 0, l: rand(.25, .5), gr: 0 }); }
  function fly(text, x, y, c) { G.fl.push({ text, x, y, c, t: 0 }); if (G.fl.length > 12) G.fl.shift(); }
  let sayT = 0; function say(a, b, c) { const m = q('.rn-msg'); m.innerHTML = `<b style="${c ? `color:${c}` : ''}">${esc(a)}</b>${b ? `<span>${esc(b)}</span>` : ''}`; m.classList.remove('on'); void m.offsetWidth; m.classList.add('on'); clearTimeout(sayT); sayT = setTimeout(() => m.classList.remove('on'), 1700); }
  function smash(o, pts) { o.dead = 1; G.bonus += pts; G.kills++; const x = o.x - G.x + PX(), y = o.y + Math.min(o.h, 140) / 2; burst(x, y, 16, pick(['#ffcf4a', '#ff9d5a', '#ffffff']), 420); fly('+' + pts, x, y + 50, '#ffe27a'); S('rock', { vol: .45, gap: 60, vary: .3 }); G.shake = Math.max(G.shake, 6); }
  function hurt(d, fall) { if (G.inv > 0 || G.over) return; if (G.shield > 0 && !fall) { G.shield--; G.inv = 1.1; S('glass'); fly('막았다!', PX(), G.y + 150, '#ffe066'); burst(PX(), G.y + 60, 24, '#ffe066', 320); return; } d = Math.round(d * DIFF.hit(G.t)); G.hp -= d; G.inv = 1.3; G.hitT = .4; G.shake = 16; G.flash = .25; G.combo = 0; S('crash', { vol: .7 }); fly('-' + d, PX(), G.y + 150, '#ff6b7d'); burst(PX(), G.y + 60, 18, '#ff6b7d', 300); if (navigator.vibrate) try { navigator.vibrate(40); } catch (e) {} }

  // ---------- 진행 ----------
  const speed = t => 440 + Math.min(400, t * 5) + Math.max(0, t - 80) * .7;
  // 무대 기믹: [모래바람, 어둠] 세기. 2바퀴째(1,000m~)부터 겹침
  const GIM = [[[0, 0], [1, 0], [0, 1], [0, 0]], [[.8, 0], [1, .6], [.6, 1], [0, .75]]];
  const GIMTXT = [['', '모래바람! 길을 잘 보세요', '어두워요! 동전 빛을 따라가요', '불덩이와 가시를 조심!'], ['바람이 불기 시작했어요', '모래바람과 어둠!', '칠흑 같은 유적', '마왕의 어둠이 내려와요']];
  function update(dt) {
    const c = opt.cls, sk = G.skT > 0; G.t += dt; G.v = speed(G.t); const boost = sk && c === 'warrior' ? 1.5 : sk && c === 'thief' ? 1.25 : 1, vx = G.over ? G.v * Math.max(0, 1 - G.dead * 1.6) : G.v * boost; G.x += vx * dt;
    if (!G.over) spawn();
    // 무대 바뀜
    const th = Math.floor(G.x / M / 250) % 4; if (th !== G.theme && !G.over) { G.prev = G.theme; G.theme = th; G.fade = 0; say(THEMES[th].name, GIMTXT[Math.min(1, Math.floor(G.x / M / 1000))][th] || `${Math.floor(G.x / M)}m 돌파!`); S('j_start', { vol: .5 }); } G.fade = Math.min(1, G.fade + dt * 1.1); { const q = GIM[Math.min(1, Math.floor(G.x / M / 1000))][G.theme], k = Math.min(1, dt * .9); G.gim.sand += (q[0] - G.gim.sand) * k; G.gim.dark += (q[1] - G.gim.dark) * k; }
    if (G.x / M >= G.mile) { fly(G.mile + 'm!', VW / 2, 260, '#ffffff'); G.bonus += 50; G.mile += 100; }
    // 캐릭터
    const wx = G.x + 0, overPit = G.pits.some(p => wx > p.a + 14 && wx < p.b - 14) && !(sk && (c === 'warrior' || c === 'thief'));
    G.vy -= 2700 * dt; G.y += G.vy * dt; if (G.y <= 0) { if (overPit && G.y < 4 && !G.over) { if (G.y < -190) { hurt(1.1, true); G.y = 260; G.vy = 0; G.jumps = 1; G.inv = Math.max(G.inv, 1.8); } } else if (G.y > -40 || G.over) { if (G.vy < -500 && G.jumps) { puff(0, 5); S('pop', { vol: .15, rate: .7 }); } G.y = 0; G.vy = 0; G.jumps = 0; G.spin = 0; } else { hurt(1.1, true); G.y = 260; G.vy = 0; G.jumps = 1; G.inv = Math.max(G.inv, 1.8); } }
    G.sliding = G.wantSlide && G.y < 12 && !G.over; if (G.sliding && Math.random() < .5) puff(-10, 1); if (G.spin) G.spin = Math.min(1, G.spin + dt * 2.6); G.inv = Math.max(0, G.inv - dt); G.hitT = Math.max(0, G.hitT - dt); G.run += dt * (vx / 440);
    if (!G.over) { G.hp -= DIFF.drain(G.t) * dt; if (G.hp <= 0) { G.hp = 0; G.over = true; G.dead = 0; G.skT = 0; G.wantSlide = false; S('j_fail', { vol: .7 }); } } else { G.dead += dt; if (G.dead > 1.5 && !G.done) { G.done = true; finish(); } }
    // 기술
    if (sk) {
      G.skT = Math.max(0, G.skT - dt); G.skTick -= dt; const ahead = G.obs.filter(o => !o.dead && o.x > G.x + 40 && o.x < G.x + VW * .62 && o.n !== 'x').sort((a, b) => a.x - b.x)[0];
      if (c === 'warrior') { G.inv = Math.max(G.inv, .1); if (Math.random() < .8) G.ps.push({ x: PX() + rand(-30, 30), y: G.y + rand(10, 110), vx: rand(-500, -200), vy: rand(-40, 120), r: rand(8, 20), c: pick(['#ff7a2a', '#ffb13c', '#ffe08a']), t: 0, l: .35, gr: 0 }); }
      else if (c === 'thief') { G.inv = Math.max(G.inv, .1); if (Math.random() < .6) G.ps.push({ x: PX() - 20, y: G.y + rand(10, 110), vx: -300, vy: 0, r: rand(5, 11), c: 'rgba(80,190,255,.6)', t: 0, l: .4, gr: 0 }); }
      else if (c === 'mage' && G.skTick <= 0 && ahead) { G.skTick = .45; const o = ahead; o.mark = 1; G.shots.push({ k: 'star', o, t: 0, d: .3 }); }
      else if (c === 'archer' && G.skTick <= 0) { G.skTick = .22; G.shots.push({ k: 'arrow', x: PX() + 40, y: G.y + 62, o: ahead, t: 0 }); S('whoosh', { vol: .2, rate: 2, gap: 90 }); }
      else if (c === 'bard') { if (G.skTick <= 0) { G.skTick = .16; coin(G.x + VW * .8, rand(20, 330), 'fly'); } if (Math.random() < .35) G.ps.push({ x: PX() + rand(-40, 60), y: G.y + rand(60, 150), vx: rand(-60, 60), vy: rand(60, 160), r: 15, note: pick(['♪', '♫']), c: `hsl(${rand(0, 360)},90%,65%)`, t: 0, l: .8, gr: 0 }); }
      if (G.skT <= 0) { G.inv = Math.max(G.inv, 1); }
    }
    G.shots = G.shots.filter(s => { s.t += dt; if (s.k === 'star') { if (s.t >= s.d) { if (!s.o.dead) { smash(s.o, 80); for (let i = 0; i < 6; i++) coin(s.o.x + rand(-30, 60), rand(30, 150), 'fly'); } return false; } return true; } s.x += 1500 * dt; const t = G.obs.find(o => !o.dead && Math.abs(o.x - G.x + PX() - s.x) < 46 && o.x > G.x); if (t) { smash(t, 60); for (let i = 0; i < 4; i++) coin(t.x + rand(0, 60), rand(30, 130), 'fly'); return false; } return s.x < VW + 60; });
    // 장애물
    const top = G.sliding ? 46 : 104, px0 = -22, px1 = 22;
    G.obs = G.obs.filter(o => {
      o.t += dt; if (o.r && !G.over) o.x = o.mx + (o.mx - G.x) * o.r; if (o.dead) { o.dead += dt; return o.dead < 1.05; } if (o.n === 'bat' && o.kind === 'foe') o.y = 80 + Math.sin(o.t * 3) * 6;
      const r = o.x - G.x; if (r < -PX() - 260) return false; if (G.over) return true;
      const oy = o.kind === 'hang' ? o.y : o.y; if (r - o.w / 2 < px1 && r + o.w / 2 > px0 && G.y < oy + o.h && G.y + top > oy) { if (sk && c === 'warrior') smash(o, 220); else if (o.kind === 'foe' && G.vy < -60 && G.y > oy + o.h * .45) { smash(o, 120); G.vy = 760; G.jumps = 1; G.spin = 0; S('squish', { vol: .6 }); } else if (G.inv <= 0) { hurt(1); } }
      return true;
    });
    G.pits = G.pits.filter(p => p.b > G.x - PX() - 100);
    // 동전·아이템
    const mag = sk && c === 'bard' ? 900 : 0; G.comboT -= dt; if (G.comboT <= 0) G.combo = 0;
    G.items = G.items.filter(i => {
      const r = i.x - G.x; if (r < -PX() - 60) return false; if ((mag || i.k === 'fly') && r < VW * .85) { const k = Math.min(1, dt * 7); i.x += (G.x - i.x) * k; i.y += (G.y + 60 - i.y) * k; } i.t += dt; if (G.over) return true;
      const dx = i.x - G.x, dy = i.y - (G.y + (G.sliding ? 30 : 58)); if (Math.abs(dx) < 46 && Math.abs(dy) < (G.sliding ? 46 : 66)) { const X = r + PX();
        if (i.k === 'coin' || i.k === 'fly') { const n = sk && c === 'thief' ? 2 : 1; G.coins += n; if (!sk) G.gauge = Math.min(NEED, G.gauge + n); G.combo++; G.comboT = .6; S('coin', { vol: .16, gap: 70, rate: 1 + Math.min(.5, G.combo * .02) }); burst(X, i.y, 4, '#ffe27a', 150, { l: .3 }); }
        else if (i.k === 'gem') { G.bonus += 150; S('glass', { vol: .5 }); fly('+150', X, i.y + 30, '#7fe8ff'); burst(X, i.y, 14, '#7fe8ff', 260); }
        else if (i.k === 'sg') { G.bonus += 50; if (!sk) G.gauge = Math.min(NEED, G.gauge + 1); S('gem', { vol: .3, gap: 60, rate: 1 + Math.min(.6, G.combo++ * .03) }); G.comboT = .7; burst(X, i.y, 6, '#7fe8ff', 180, { l: .35 }); }
        else if (i.k === 'potion') { const q = Math.round(DIFF.potHeal(G.t)); G.hp = Math.min(100, G.hp + q); S('gain', { vol: .6 }); fly('체력 +' + q, X, i.y + 40, '#7dffb0'); burst(X, i.y, 16, '#7dffb0', 240); }
        else { G.bonus += 300; G.coins += 10; G.gauge = Math.min(NEED, G.gauge + 10); S('levelup', { vol: .55 }); fly('보물 +300', X, i.y + 40, '#ffcf4a'); burst(X, i.y, 26, '#ffcf4a', 340); }
        return false; } return true;
    });
    G.ps = G.ps.filter(p => { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy -= p.gr * dt; return p.t < p.l; }); G.fl = G.fl.filter(f => (f.t += dt) < 1);
    G.shake *= Math.exp(-dt * 7); G.flash = Math.max(0, G.flash - dt); G.score = Math.floor(G.x / M) * 10 + G.coins * 10 + G.bonus;
  }

  // ---------- 그리기 ----------
  const cellTall = (n, x, y, w, h, al) => { if (!imgs.it_tall) return; g.drawImage(imgs.it_tall, TALL[n] * 200, 0, 200, 400, x - w / 2, y - h, w, h); };
  const cellSmall = (n, x, y, w) => { if (imgs.it_small) g.drawImage(imgs.it_small, SMALL[n] * 160, 0, 160, 160, x - w / 2, y - w, w, w); };
  function backdrop(i, al) {
    const T = THEMES[i]; g.globalAlpha = al; if (!T.gr || T.gh !== GY) { T.gr = g.createLinearGradient(0, 0, 0, GY); T.sky.forEach((c, k) => T.gr.addColorStop(k / 2, c)); T.gh = GY; } g.fillStyle = T.gr; g.fillRect(0, 0, VW, VH);
    if (T.night) { g.fillStyle = '#fff'; for (let k = 0; k < 40; k++) { const sx = ((k * 137.5 - G.x * .015) % VW + VW) % VW; g.globalAlpha = al * (.35 + .4 * Math.sin(k * 3 + G.t * 2)); if (g.globalAlpha > .05) g.fillRect(sx, (k * 61) % (GY * .6), 2.4, 2.4); } g.globalAlpha = al; g.beginPath(); g.arc(VW * .78, GY * .22, 34, 0, 7); g.fillStyle = i === 3 ? '#ff9a7a' : '#eaf6ff'; g.fill(); }
    else { g.globalAlpha = al * .5; g.fillStyle = '#fff8d8'; g.beginPath(); g.arc(VW * .76, GY * .25, 62, 0, 7); g.fill(); g.globalAlpha = al; g.beginPath(); g.arc(VW * .76, GY * .25, 44, 0, 7); g.fill(); g.fillStyle = 'rgba(255,255,255,.75)'; for (let k = 0; k < 5; k++) { const x = ((k * 330 - G.x * .06) % (VW + 300) + VW + 300) % (VW + 300) - 150, y = 50 + (k * 53) % 120; g.beginPath(); g.ellipse(x, y, 64, 17, 0, 0, 7); g.ellipse(x - 26, y - 10, 30, 19, 0, 0, 7); g.ellipse(x + 18, y - 14, 36, 23, 0, 0, 7); g.fill(); } }
    [['far', .14, 1240, 310], ['mid', .4, 1440, 360]].forEach(([n, k, w, h]) => { const im = imgs[`bg${i}_${n}`]; if (!im) return; let x = -((G.x * k) % w); for (; x < VW; x += w) g.drawImage(im, x, GY - h + 22, w + 1, h); }); g.globalAlpha = 1;
  }
  function ground(i) {
    const im = imgs['gr' + i], T = THEMES[i], W = 640, x0 = G.x - PX(); g.fillStyle = '#120a1e'; g.fillRect(0, GY, VW, VH - GY);
    const seg = []; let a = x0 - 10; G.pits.slice().sort((p, r) => p.a - r.a).forEach(p => { if (p.b < x0 || p.a > x0 + VW) return; if (p.a > a) seg.push([a, p.a]); a = Math.max(a, p.b); }); if (a < x0 + VW + 10) seg.push([a, x0 + VW + 10]);
    seg.forEach(([s, e]) => { const l = s - x0, r = e - x0; g.save(); g.beginPath(); g.rect(l, GY - 24, r - l, VH); g.clip(); g.fillStyle = T.sub; g.fillRect(l, GY + 20, r - l, VH); if (im) for (let x = -(((x0 % W) + W) % W); x < VW; x += W) if (x + W > l && x < r) g.drawImage(im, x, GY - 12, W + 1, 160); g.restore(); g.fillStyle = 'rgba(0,0,0,.28)'; if (l > 0) g.fillRect(l, GY - 4, 7, VH); if (r < VW) g.fillRect(r - 7, GY - 4, 7, VH); });
  }
  function frame() { const c = opt.cls; if (G.over) return 31 + Math.min(3, Math.floor(G.dead * 6)); if (G.hitT > 0) return 21 + (G.hitT > .2 ? 0 : 1); if (G.skT > 0 && c !== 'warrior' && c !== 'thief' && G.y < 2 && !G.sliding && Math.floor(G.t * 1.3) % 2) return 23 + Math.floor(G.t * 14) % 8; if (G.sliding) return 19 + (Math.floor(G.t * 8) % 2); if (G.y > 4 || G.jumps) { if (G.spin && G.spin < 1) return 13 + Math.floor(G.spin * 6) % 6; return G.vy > 250 ? 10 : G.vy > -350 ? 11 : 12; } return Math.floor(G.run * 15) % 10; }
  function hero(x, y, f, al, w) { const im = imgs['run_' + opt.cls]; if (!im) return; g.globalAlpha = al; g.drawImage(im, (f % 7) * 192, Math.floor(f / 7) * 192, 192, 192, x - w / 2, GY - y - w + w * .075, w, w); g.globalAlpha = 1; }
  function draw() {
    const sx = rand(-1, 1) * G.shake, sy = rand(-1, 1) * G.shake; g.setTransform(SC, 0, 0, SC, sx * SC, sy * SC); g.imageSmoothingEnabled = true;
    if (G.fade < 1) backdrop(G.prev, 1); backdrop(G.theme, G.fade); ground(G.fade < .5 ? G.prev : G.theme);
    const X = wx => wx - G.x + PX();
    G.items.forEach(i => { const x = X(i.x); if (x > VW + 60) return; const y = GY - i.y; if (i.k === 'coin' || i.k === 'fly') { if (imgs.it_coin) g.drawImage(imgs.it_coin, (Math.floor(i.t * 10) % 8) * 96, 0, 96, 96, x - 20, y - 20, 40, 40); } else { g.globalAlpha = i.k === 'sg' ? .2 : .35; g.fillStyle = i.k === 'potion' ? '#ff8a9a' : i.k === 'gem' || i.k === 'sg' ? '#7fe8ff' : '#ffe27a'; g.beginPath(); g.arc(x, y, (i.k === 'sg' ? 22 : 38) + Math.sin(i.t * 5) * 4, 0, 7); g.fill(); g.globalAlpha = 1; if (i.k === 'sg') cellSmall('gem', x, y + 24, 50); else cellSmall(i.k, x, y + 40 + Math.sin(i.t * 4) * 5, 84); } });
    G.sign.forEach(q => { const x = X(q.x); if (x < -120 || x > VW + 120) return; g.fillStyle = '#7a4a24'; g.fillRect(x - 5, GY - 96, 10, 96); [['#4fd8ff', -118, -.16, '보석'], ['#ffd23c', -74, .08, '안전']].forEach(([c, dy, r, w]) => { g.save(); g.translate(x, GY + dy + 14); g.rotate(r); g.fillStyle = c; g.beginPath(); g.moveTo(-44, -17); g.lineTo(34, -17); g.lineTo(54, 0); g.lineTo(34, 17); g.lineTo(-44, 17); g.fill(); g.fillStyle = '#2a1a3a'; g.font = '22px Jua, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(w, -2, 1); g.restore(); }); g.textBaseline = 'alphabetic'; });
    G.obs.forEach(o => { const x = X(o.x); if (x > VW + 160) return; if (o.dead) { g.globalAlpha = Math.max(0, 1 - (o.dead - 1) * 9); if (o.dead > 1.1) { g.globalAlpha = 1; return; } } const f = o.dead ? 1.15 : 1;
      const K = o.late && !o.dead ? clamp((o.x - G.x - o.gv * o.set) / (o.gv * .5), 0, 1) : 0, mm = o.m || 1, st = (DIM[o.kind] || {}).st || 0;
      if (K > 0 && x < VW + 40) { g.globalAlpha = .55 + .45 * Math.sin(G.t * 18); g.fillStyle = '#ff4a5e'; const wy = o.kind === 'hang' ? GY - 118 : GY - 6; g.beginPath(); g.moveTo(x, wy - 40); g.lineTo(x - 21, wy); g.lineTo(x + 21, wy); g.fill(); g.fillStyle = '#fff'; g.font = '26px "Black Han Sans", sans-serif'; g.textAlign = 'center'; g.fillText('!', x, wy - 7); g.globalAlpha = 1; }
      g.save(); if (K > 0) { g.beginPath(); g.rect(-20, -60, VW + 40, GY + 66); g.clip(); }
      for (let q = 0; q < mm; q++) { const xx = x + (q - (mm - 1) / 2) * st;
        if (o.late === 'fire') { const fx = xx + K * 260, fy = GY - 26 - K * 470; if (K >= 1) continue; if (K <= 0) { for (let z = 0; z < 5; z++) { const h = 26 + 18 * Math.sin(G.t * 13 + z * 2 + q); g.fillStyle = z % 2 ? '#ffb13c' : '#ff5a2a'; g.beginPath(); g.ellipse(xx - 20 + z * 10, GY - h * .6, 11, h, 0, 0, 7); g.fill(); } g.fillStyle = '#fff0a8'; g.beginPath(); g.ellipse(xx, GY - 14, 12, 18, 0, 0, 7); g.fill(); } else { g.strokeStyle = 'rgba(255,140,50,.7)'; g.lineWidth = 20; g.lineCap = 'round'; g.beginPath(); g.moveTo(fx + 46, fy - 84); g.lineTo(fx, fy); g.stroke(); g.fillStyle = '#ffcf6a'; g.beginPath(); g.arc(fx, fy, 22, 0, 7); g.fill(); g.fillStyle = '#ff6a2a'; g.beginPath(); g.arc(fx, fy, 14, 0, 7); g.fill(); } }
        else if (o.kind === 'low') cellSmall(o.n, xx, GY + 8 + (K ? K * 130 : 0), o.dw * f); else if (o.kind === 'tall') cellTall(o.n, xx, GY + 12 + (K ? K * 210 : 0), o.dw * f, o.dh * f);
        else if (o.kind === 'hang') { g.save(); if (o.n === 'axe') { g.translate(xx, GY - 400); g.rotate(clamp((o.x - G.x) * .0016, -.55, .55)); g.translate(-xx, -(GY - 400)); } cellTall(o.n, xx, GY - 64 + (o.n === 'stal' ? 46 : 14) - K * 300, o.dw * f, o.dh * f); g.restore(); } }
      g.restore();
      if (o.kind === 'low' || o.kind === 'tall' || o.kind === 'hang') { /* 위에서 그림 */ } else if (o.kind === 'float' && imgs.it_mon) { for (let q = 0; q < 2; q++) { const n = 4 + Math.floor(o.t * 11 + q * 2) % 4, w = 112 * f, xx = x + (q ? 26 : -26), yy = GY - o.y - o.h / 2 + Math.sin(o.t * 3 + q * 2) * 5; g.globalAlpha *= .3; g.fillStyle = '#ff5a6e'; g.beginPath(); g.arc(xx, yy, 44, 0, 7); g.fill(); g.globalAlpha = o.dead ? Math.max(0, 1 - (o.dead - 1) * 9) : 1; g.drawImage(imgs.it_mon, (n % 7) * 160, Math.floor(n / 7) * 160, 160, 160, xx - w / 2, yy - w / 2, w, w); } }
      else if (imgs.it_mon) { const n = o.n === 'slime' ? Math.floor(o.t * 7) % 4 : o.n === 'bat' ? 4 + Math.floor(o.t * 11) % 4 : 8 + Math.floor(o.t * 8) % 6, w = o.dw * f, gy = o.n === 'bat' ? GY - o.y + 40 : GY + 8; g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(x, GY + 2, 34, 7, 0, 0, 7); g.fill(); g.drawImage(imgs.it_mon, (n % 7) * 160, Math.floor(n / 7) * 160, 160, 160, x - w / 2, gy - w, w, w); }
      if (o.mark && !o.dead) { g.strokeStyle = '#d9b8ff'; g.lineWidth = 4; g.beginPath(); g.arc(x, GY - 50, 46, 0, 7); g.stroke(); } g.globalAlpha = 1; });
    // 캐릭터
    const px = PX(), sk = G.skT > 0, c = opt.cls, f = frame(), w = 196; if (G.y > -20 || !G.on) { g.fillStyle = 'rgba(0,0,0,.28)'; g.beginPath(); g.ellipse(px, GY + 3, Math.max(14, 42 - G.y * .07), 8, 0, 0, 7); g.fill(); }
    if (sk) { const k = SKILL[c]; g.globalAlpha = .28 + .1 * Math.sin(G.t * 20); g.fillStyle = k.col; g.beginPath(); g.ellipse(px + 6, GY - G.y - 62, 86, 88, 0, 0, 7); g.fill(); g.globalAlpha = 1; if (c === 'thief' || c === 'warrior') for (let i = 3; i > 0; i--) hero(px - i * 34, G.y, f, .16, w); }
    if (G.shield > 0) { g.strokeStyle = 'rgba(255,230,120,.9)'; g.lineWidth = 3 + G.shield * 2; g.beginPath(); g.ellipse(px + 4, GY - G.y - 62, 74, 80, 0, 0, 7); g.stroke(); }
    hero(px, G.y, f, G.inv > 0 && !sk && Math.floor(G.t * 16) % 2 ? .4 : c === 'thief' && sk ? .6 : 1, w);
    G.shots.forEach(s => { if (s.k === 'star') { const k = s.t / s.d, x = X(s.o.x), y = lerp(-60, GY - 60, k), x0 = x - 260 * (1 - k); g.strokeStyle = 'rgba(210,170,255,.8)'; g.lineWidth = 12; g.lineCap = 'round'; g.beginPath(); g.moveTo(x0 - 90, y - 130); g.lineTo(x0, y); g.stroke(); g.fillStyle = '#fff6d0'; g.beginPath(); g.arc(x0, y, 20, 0, 7); g.fill(); } else { g.strokeStyle = '#d8ffb8'; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(s.x - 52, GY - s.y); g.lineTo(s.x, GY - s.y); g.stroke(); } });
    G.ps.forEach(p => { const k = 1 - p.t / p.l; g.globalAlpha = k; g.fillStyle = p.c; if (p.note) { g.font = '34px serif'; g.fillText(p.note, p.x, GY - p.y); } else { g.beginPath(); g.arc(p.x, GY - p.y, p.r * (.4 + .6 * k), 0, 7); g.fill(); } }); g.globalAlpha = 1;
    // 기믹: 어둠(내 주변만 밝음, 동전은 은은하게) → 모래바람(앞이 늦게 보임)
    if (G.gim.dark > .02) { const k = G.gim.dark, cx = px + 190, cy = GY - 120 - Math.min(160, G.y * .6), q = g.createRadialGradient(cx, cy, 90, cx, cy, 470); q.addColorStop(0, 'rgba(6,4,20,0)'); q.addColorStop(.55, `rgba(6,4,20,${.45 * k})`); q.addColorStop(1, `rgba(6,4,20,${.96 * k})`); g.fillStyle = q; g.fillRect(-20, -20, VW + 40, VH + 40); g.fillStyle = '#ffd86a'; G.items.forEach(i => { const x = X(i.x); if (x > px + 300 && x < VW) { g.globalAlpha = .30 * k; g.beginPath(); g.arc(x, GY - i.y, i.k === 'coin' ? 5 : 9, 0, 7); g.fill(); } }); g.globalAlpha = 1; }
    if (G.gim.sand > .02) { const k = G.gim.sand, gust = .5 + .5 * Math.sin(G.t * .9), x0 = VW * (.66 - .07 * gust), night = THEMES[G.theme].night, col = night ? '58,74,86' : '226,160,96', q = g.createLinearGradient(x0 - 60, 0, VW * .93, 0); q.addColorStop(0, `rgba(${col},0)`); q.addColorStop(.55, `rgba(${col},${.78 * k})`); q.addColorStop(1, `rgba(${col},${.98 * k})`); g.fillStyle = q; g.fillRect(x0 - 60, -20, VW, VH + 40); g.strokeStyle = `rgba(${night ? '190,205,215' : '255,232,190'},${.34 * k})`; g.lineWidth = 3; for (let i = 0; i < 26; i++) { const y = (i * 61 + Math.floor(G.t * 3) * 17) % GY, x = VW - ((G.t * 1500 + i * 271) % (VW + 300)); g.beginPath(); g.moveTo(x, y); g.lineTo(x + 70 + (i % 5) * 26, y + 4); g.stroke(); } }
    g.textAlign = 'center'; g.lineJoin = 'round'; G.fl.forEach(q => { g.globalAlpha = Math.min(1, (1 - q.t) * 2.5); g.font = '30px "Black Han Sans", Jua, sans-serif'; g.lineWidth = 7; g.strokeStyle = 'rgba(20,8,40,.8)'; const y = GY - q.y - q.t * 60; g.strokeText(q.text, q.x, y); g.fillStyle = q.c; g.fillText(q.text, q.x, y); }); g.globalAlpha = 1;
    if (sk && (c === 'warrior' || c === 'thief')) { g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 3; for (let i = 0; i < 10; i++) { const y = rand(20, GY), x = rand(0, VW); g.beginPath(); g.moveTo(x, y); g.lineTo(x - rand(80, 220), y); g.stroke(); } }
    if (G.flash > 0) { g.globalAlpha = G.flash; g.fillStyle = '#fff'; g.fillRect(-20, -20, VW + 40, VH + 40); g.globalAlpha = 1; } if (G.hp < 25 && G.on && !G.over) { g.globalAlpha = .18 + .12 * Math.sin(G.t * 8); g.fillStyle = '#ff2a4a'; g.fillRect(0, 0, VW, 10); g.fillRect(0, VH - 10, VW, 10); g.fillRect(0, 0, 10, VH); g.fillRect(VW - 10, 0, 10, VH); g.globalAlpha = 1; }
  }
  const H = {}; function hud() { const set = (k, v, f) => { if (H[k] !== v) { H[k] = v; f(v); } }; set('hp', Math.round(G.hp), v => { const b = q('.rn-bar i'); b.style.width = v + '%'; b.className = v < 25 ? 'lo' : v < 55 ? 'mi' : ''; }); set('d', Math.floor(G.x / M), v => { q('.rn-dist').textContent = v + 'm'; }); set('c', G.coins, v => { q('.rn-coin').textContent = v; }); set('s', G.score, v => { q('.rn-score').textContent = v.toLocaleString(); }); set('g', G.skT > 0 ? 100 + Math.round(G.skT / G.skMax * 100) : Math.round(G.gauge / NEED * 100), v => { const b = q('.rn-skill'); b.querySelector('i').style.height = (v > 100 ? v - 100 : v) + '%'; b.classList.toggle('ready', v === 100); b.classList.toggle('using', v > 100); }); }
  let last = 0;
  function loop(now) { if (!root) return; raf = requestAnimationFrame(loop); let dt = Math.min(.1, Math.max(0, (now - last) / 1000)); last = now; if (document.hidden) return; if (G.on) { while (dt > 0 && G && G.on) { update(Math.min(.02, dt)); dt -= .02; if (!root) return; } hud(); } else { G.t += dt; G.x += 120 * dt; G.run += dt * .6; } draw(); }

  // ---------- 창 ----------
  function boardHTML(mine) { const L = (opt.board ? opt.board() : []).filter(p => p.score > 0).sort((a, b) => b.score - a.score), me = L.findIndex(p => p.me); if (!L.length) return '<p class="rn-none">아직 기록이 없어요. 첫 기록의 주인공이 되어 보세요!</p>'; return '<ol>' + L.slice(0, 5).map((p, i) => `<li class="${p.me ? 'me' : ''}"><b>${i + 1}</b><img src="${CLASSES[p.cls] ? CLASSES[p.cls].img : ''}" alt=""><span>${esc(p.name)}</span><em>${p.score.toLocaleString()}</em></li>`).join('') + (me >= 5 ? `<li class="me"><b>${me + 1}</b><img src="${CLASSES[L[me].cls].img}" alt=""><span>${esc(L[me].name)}</span><em>${L[me].score.toLocaleString()}</em></li>` : '') + '</ol>'; }
  function panel(html) { const p = q('.rn-panel'); p.innerHTML = `<div class="rn-card">${html}</div>`; p.classList.remove('hidden'); return p; }
  function startPanel() {
    const k = SKILL[opt.cls], p = panel(`<div class="rn-l"><h2>모험 달리기</h2><p class="rn-sub">기다리는 동안 달려 볼까요? 자리 순위에는 영향이 없어요!</p>
      <div class="rn-how"><div><b>점프</b><span>화면 왼쪽 · 두 번 누르면 2단 점프</span></div><div><b>슬라이드</b><span>화면 오른쪽을 누르고 있기</span></div><div><b>동전길</b><span>동전을 따라가면 안전해요!</span></div><div><b style="color:${k.col}">${k.name}</b><span>동전 ${NEED}개를 모으면! ${k.desc}</span></div></div>
      <div class="rn-btns"><button class="btn ghost rn-quit" data-nosfx>나가기</button><button class="btn big green rn-go" data-nosfx disabled>불러오는 중…</button></div></div><div class="rn-r"><h3>${icon('trophy', 28)} 우리 반 기록</h3><div class="rn-board">${boardHTML()}</div></div>`);
    if (imgs['run_' + opt.cls] && imgs.it_mon) { const b = q('.rn-go'); b.disabled = false; b.textContent = '달리기 시작!'; } q('.rn-go').addEventListener('click', start); q('.rn-quit').addEventListener('click', () => { S('back'); close(); });
  }
  function report() { const s = G.score; const rec = s > (opt.best || 0); if (rec) opt.best = s; if (opt.onScore) opt.onScore(s, rec); return rec; }
  function finish(quit) {
    G.over = true; G.on = false; const rec = report(); S(rec ? 'j_good' : 'pop');
    panel(`<div class="rn-l"><h2>${rec ? '새로운 최고 기록!' : '수고했어요!'}</h2><div class="rn-big">${G.score.toLocaleString()}<small>점</small></div><div class="rn-stat"><span>${icon('flag', 24)} ${Math.floor(G.x / M)}m</span><span>${icon('coin', 24)} ${G.coins}</span><span>${icon('swords', 24)} ${G.kills}</span><span>${icon('trophy', 24)} 최고 ${(opt.best || 0).toLocaleString()}</span></div>
      <div class="rn-btns"><button class="btn ghost rn-quit" data-nosfx>그만하기</button><button class="btn big green rn-go" data-nosfx>다시 달리기</button></div></div><div class="rn-r"><h3>${icon('trophy', 28)} 우리 반 기록</h3><div class="rn-board">${boardHTML()}</div></div>`);
    q('.rn-go').addEventListener('click', start); q('.rn-quit').addEventListener('click', () => { S('back'); close(); });
  }
  window.Runner = { open, close, stop, get isOpen() { return !!root; }, refresh() { if (root) { const b = q('.rn-board'); if (b) b.innerHTML = boardHTML(); } }, get _g() { return G; }, _step(t) { for (let i = 0; i < t * 60; i++) if (G.on) update(1 / 60); if (G.on) hud(); draw(); } };
})();
