// 효과음 (Kenney.nl CC0 효과음 + Web Audio 합성음)
// SFX.play('click') / SFX.play('hit', {vol:.6, rate:1.2}) / SFX.crowd(0~1) / SFX.boom() / SFX.whoosh()
(function () {
  const MUTE_KEY = 'action-seat-mute';
  const NAMES = ('click select confirm back error open tick type question pop drop pluck glass gain levelup power right wrong ' +
    'coin coin2 diceshake dicethrow door page latch creak sword rock rock2 crash whiff squish card cardflip shuffle slide ' +
    'step1 step2 beep go boost slip splash trip whoosh shoot fire arrow slash hit hit2 heavy kill gem ult gong zone zap ' +
    'v_3 v_2 v_1 v_ready v_begin v_fight v_final v_winner v_multi v_combo v_sudden v_flawless v_prepare v_choose ' +
    'j_win j_good j_cute j_fail j_start j_chapter').split(' ');
  const VOL = { type: .25, tick: .5, step1: .35, step2: .35, gem: .45, kill: .5, shoot: .35, fire: .45, hit: .6, hit2: .6, coin: .8 };

  let ctx = null, master = null, muted = false;
  const buffers = {}, loading = {};
  let base = 'assets/sfx/';
  try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) {}

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.9;
    master.connect(ctx.destination);
    return ctx;
  }
  function load(name) {
    if (buffers[name] || loading[name] || !ensure()) return loading[name];
    loading[name] = fetch(base + name + '.ogg')
      .then(r => r.ok ? r.arrayBuffer() : Promise.reject())
      .then(ab => new Promise((res, rej) => ctx.decodeAudioData(ab, res, rej)))
      .then(b => { buffers[name] = b; return b; })
      .catch(() => null);
    return loading[name];
  }
  function preload(list) { if (!ensure()) return; (list || NAMES).forEach(load); }

  // 브라우저 자동재생 제한: 첫 터치/클릭/키 입력 때 오디오를 깨움
  function unlock() {
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    if (!unlock.done) { unlock.done = true; preload(); }
  }
  ['pointerdown', 'keydown', 'touchstart'].forEach(ev => window.addEventListener(ev, unlock, { capture: true, passive: true }));

  const lastAt = {};
  function play(name, o) {
    o = o || {};
    if (muted || !ensure()) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const now = performance.now();
    if (!o.force && lastAt[name] && now - lastAt[name] < (o.gap != null ? o.gap : 35)) return; // 같은 소리 폭주 방지
    lastAt[name] = now;
    const b = buffers[name];
    if (!b) { const p = load(name); if (p && o.wait !== false) p.then(x => { if (x && performance.now() - now < 250) play(name, Object.assign({}, o, { force: true })); }); return; }
    const src = ctx.createBufferSource();
    src.buffer = b;
    src.playbackRate.value = (o.rate || 1) * (o.vary ? 1 + (Math.random() - .5) * o.vary : 1);
    const g = ctx.createGain();
    g.gain.value = (o.vol != null ? o.vol : (VOL[name] != null ? VOL[name] : .8));
    let node = g;
    if (o.pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, o.pan)); g.connect(p); node = p; }
    src.connect(g); node.connect(master);
    src.start(ctx.currentTime + (o.delay || 0));
  }

  // ---------- 합성음 ----------
  let noiseBuf = null;
  function noise() {
    if (noiseBuf) return noiseBuf;
    const len = ctx.sampleRate * 2;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }
  function boom(o) {
    o = o || {};
    if (muted || !ensure()) return;
    const t = ctx.currentTime, v = o.vol || .9;
    const osc = ctx.createOscillator(), og = ctx.createGain();
    osc.type = 'sine'; osc.frequency.setValueAtTime(120, t); osc.frequency.exponentialRampToValueAtTime(32, t + .5);
    og.gain.setValueAtTime(v, t); og.gain.exponentialRampToValueAtTime(.001, t + .6);
    osc.connect(og); og.connect(master); osc.start(t); osc.stop(t + .65);
    const n = ctx.createBufferSource(); n.buffer = noise();
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(2400, t); f.frequency.exponentialRampToValueAtTime(200, t + .5);
    const ng = ctx.createGain(); ng.gain.setValueAtTime(v * .7, t); ng.gain.exponentialRampToValueAtTime(.001, t + .55);
    n.connect(f); f.connect(ng); ng.connect(master); n.start(t); n.stop(t + .6);
  }
  function whoosh(o) {
    o = o || {};
    if (muted || !ensure()) return;
    const t = ctx.currentTime, d = o.dur || .45;
    const n = ctx.createBufferSource(); n.buffer = noise();
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(o.up ? 400 : 2200, t); f.frequency.exponentialRampToValueAtTime(o.up ? 2600 : 300, t + d);
    const g = ctx.createGain(); g.gain.setValueAtTime(.001, t); g.gain.linearRampToValueAtTime(o.vol || .5, t + d * .3); g.gain.exponentialRampToValueAtTime(.001, t + d);
    n.connect(f); f.connect(g); g.connect(master); n.start(t, Math.random()); n.stop(t + d + .05);
  }
  // 관중 함성: 필터링한 잡음 + 웅성임 변조. level 0~1
  let crowdNodes = null, crowdLevel = 0;
  function crowd(level, ramp) {
    if (!ensure()) return;
    if (Math.abs(level - crowdLevel) < 0.01) return;
    crowdLevel = level;
    if (!crowdNodes) {
      if (level <= 0) return;
      const n = ctx.createBufferSource(); n.buffer = noise(); n.loop = true;
      const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 900; f1.Q.value = .6;
      const f2 = ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = 2600;
      const g = ctx.createGain(); g.gain.value = 0;
      const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = .35; lg.gain.value = 250;
      lfo.connect(lg); lg.connect(f1.frequency); lfo.start();
      n.connect(f1); f1.connect(f2); f2.connect(g); g.connect(master); n.start();
      crowdNodes = { n, g, lfo };
    }
    const t = ctx.currentTime;
    crowdNodes.g.gain.cancelScheduledValues(t);
    crowdNodes.g.gain.setValueAtTime(crowdNodes.g.gain.value, t);
    crowdNodes.g.gain.linearRampToValueAtTime(Math.max(0, level) * .22, t + (ramp != null ? ramp : .6));
  }
  function cheer() {
    if (!crowdNodes) crowd(.4, .1);
    if (!crowdNodes) return;
    const t = ctx.currentTime, g = crowdNodes.g.gain, cur = g.value;
    g.cancelScheduledValues(t); g.setValueAtTime(cur, t);
    g.linearRampToValueAtTime(.3, t + .25); g.linearRampToValueAtTime(Math.max(cur, .08), t + 2.4);
  }
  function stopAll() { crowd(0, .3); }

  function setMuted(m) {
    muted = !!m;
    try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (e) {}
    if (master) master.gain.value = muted ? 0 : 0.9;
    document.querySelectorAll('[data-sfx-toggle] img').forEach(i => { i.src = 'assets/icons/' + (muted ? 'mute' : 'sound') + '.png'; });
  }
  // 다른 창(콘솔↔발표 화면)에서 음소거를 바꾸면 따라감
  window.addEventListener('storage', e => { if (e.key === MUTE_KEY) setMuted(e.newValue === '1'); });

  // 버튼 공통 클릭음
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('button, .choice-btn, .class-card, .name-btn');
    if (!b || b.disabled || b.dataset.nosfx != null) return;
    play(b.classList.contains('btn') && b.classList.contains('big') ? 'confirm' : 'click', { vol: .55 });
  }, true);

  window.SFX = {
    play, preload, boom, whoosh, crowd, cheer, stopAll, unlock,
    get muted() { return muted; }, setMuted, toggle() { setMuted(!muted); return muted; },
    get ready() { return !!ctx && ctx.state === 'running'; },
    setBase(b) { base = b; }
  };
})();
