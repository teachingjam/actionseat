// 효과음·배경음악 (tools/make-sfx.js, make-music.js 로 직접 합성한 소리)
// SFX.play('click') / SFX.play('hit', {vol:.6, rate:1.2}) / SFX.crowd(0~1) / SFX.boom() / SFX.whoosh()
(function () {
  const MUTE_KEY = 'action-seat-mute';
  const NAMES = ('click select confirm back error open tick type question pop drop pluck glass gain levelup power right wrong ' +
    'coin coin2 diceshake dicethrow door page latch creak sword rock rock2 crash whiff squish card cardflip shuffle slide ' +
    'step1 step2 beep go boost slip splash trip whoosh shoot fire arrow slash hit hit2 heavy kill gem ult gong zone zap ' +
    'ko charge quake meteor volley rhapsody judgement holyhit duel crowd cheer ' +
    'j_win j_good j_cute j_fail j_start j_chapter').split(' ');
  // 학생 태블릿은 결승전 소리를 받지 않음 (데이터 절약)
  const STAGE_ONLY = new Set('step1 step2 go boost slip splash trip shoot fire arrow hit hit2 heavy kill ult gong zone zap ko charge quake meteor volley rhapsody judgement holyhit duel crowd cheer beep'.split(' '));
  const isStudent = /play\.html/.test(location.pathname);
  const VOL = { type: .5, tick: .6, step1: .4, step2: .4, gem: .5, kill: .5, shoot: .4, fire: .6, hit: .6, hit2: .6, heavy: .75, quake: .85, meteor: .85 };

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
  function preload(list) { if (!ensure()) return; (list || (isStudent ? NAMES.filter(n => !STAGE_ONLY.has(n)) : NAMES)).forEach(load); }

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
    src.start(ctx.currentTime + (o.delay || 0), o.offset || 0);
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
      const b = buffers.crowd; // 여러 목소리를 겹쳐 만든 함성 (반복 재생)
      if (!b) { const p = load('crowd'); if (p) p.then(x => { if (x && !crowdNodes && crowdLevel > 0) { const lv = crowdLevel; crowdLevel = -1; crowd(lv, 1); } }); return; }
      const n = ctx.createBufferSource(); n.buffer = b; n.loop = true;
      const g = ctx.createGain(); g.gain.value = 0; n.connect(g); g.connect(master); n.start();
      crowdNodes = { n, g };
    }
    const t = ctx.currentTime;
    crowdNodes.g.gain.cancelScheduledValues(t);
    crowdNodes.g.gain.setValueAtTime(crowdNodes.g.gain.value, t);
    crowdNodes.g.gain.linearRampToValueAtTime(Math.max(0, level) * .30, t + (ramp != null ? ramp : .6));
  }
  function cheer() {
    play('cheer', { vol: .55, gap: 900, vary: .08 });
    if (muted || !crowdNodes) return;
    const t = ctx.currentTime, g = crowdNodes.g.gain, cur = g.value;
    g.cancelScheduledValues(t); g.setValueAtTime(cur, t);
    // 환호가 끝나면 원래 함성 크기로 돌아감 (예전엔 조용한 화면에서도 웅성거림이 계속 남았음)
    g.linearRampToValueAtTime(.4, t + .25); g.linearRampToValueAtTime(Math.max(0, crowdLevel) * .30, t + 2.4);
  }
  function stopAll() { crowd(0, .3); music(null); }
  // 배경음악 (발표 화면에서만 사용). 이름을 주면 서서히 바꾸고, null이면 끔
  let mus = null, musName = null, musMuted = false;
  try { musMuted = localStorage.getItem(MUTE_KEY + '-music') === '1'; } catch (e) {}
  function music(name, vol) {
    if (name === musName || !ensure()) return; musName = name;
    const t = ctx.currentTime; if (mus) { const m = mus; mus = null; m.g.gain.cancelScheduledValues(t); m.g.gain.setValueAtTime(m.g.gain.value, t); m.g.gain.linearRampToValueAtTime(0, t + 1.2); setTimeout(() => { try { m.s.stop(); } catch (e) {} }, 1400); }
    if (!name) return;
    const want = name, p = buffers[name] ? Promise.resolve(buffers[name]) : load(name);
    if (p) p.then(b => { if (!b || musName !== want || mus) return; const s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = b; s.loop = true; g.gain.value = 0; s.connect(g); g.connect(master); s.start(); g.gain.linearRampToValueAtTime(musMuted ? 0 : (vol || .42), ctx.currentTime + 1.5); mus = { s, g, vol: vol || .42 }; });
  }
  function setMusicMuted(m) { musMuted = !!m; try { localStorage.setItem(MUTE_KEY + '-music', musMuted ? '1' : '0'); } catch (e) {} if (mus) { mus.g.gain.cancelScheduledValues(ctx.currentTime); mus.g.gain.linearRampToValueAtTime(musMuted ? 0 : mus.vol, ctx.currentTime + .4); } }

  function setMuted(m) {
    muted = !!m;
    try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (e) {}
    if (master) master.gain.value = muted ? 0 : 0.9;
    document.querySelectorAll('[data-sfx-toggle] img').forEach(i => { i.src = 'assets/icons/' + (muted ? 'mute' : 'sound') + '.png'; });
  }
  // 다른 창(콘솔↔발표 화면)에서 음소거를 바꾸면 따라감
  window.addEventListener('storage', e => { if (e.key === MUTE_KEY) setMuted(e.newValue === '1'); if (e.key === MUTE_KEY + '-music') setMusicMuted(e.newValue === '1'); });

  // 버튼 공통 클릭음
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('button, .choice-btn, .class-card, .name-btn');
    if (!b || b.disabled || b.dataset.nosfx != null) return;
    play(b.classList.contains('btn') && b.classList.contains('big') ? 'confirm' : 'click', { vol: .55 });
  }, true);

  window.SFX = {
    play, preload, boom, whoosh, crowd, cheer, stopAll, unlock, music, setMusicMuted, get musicMuted() { return musMuted; },
    get muted() { return muted; }, setMuted, toggle() { setMuted(!muted); return muted; },
    get ready() { return !!ctx && ctx.state === 'running'; },
    setBase(b) { base = b; }
  };
})();
