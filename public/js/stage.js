// 발표 화면: 교사 콘솔이 보내는 공개 정보만 받아서 보여 줌 (비밀 조건은 절대 받지 않음)
(function () {
  const { $, $$, esc, icon } = UI;
  const { CLASSES } = GameData;
  const bc = new BroadcastChannel('action-seat-stage-v1');
  const embed = new URLSearchParams(location.search).has('embed');
  document.body.classList.toggle('embed', embed);

  let state = { phase: 'idle' };
  let running = null;      // 실행 중인 결승전 {runId, ctrl}
  let lastResultKey = '';
  let revealed = false;
  let resultRun = 0;

  function showView(id) {
    $$('.sv').forEach(s => s.classList.toggle('hidden', s.id !== id));
    document.body.classList.toggle('in-finale', id === 'sv-finale'); // 결승전 동안 배경 애니메이션을 꺼서 렉을 줄임
    if (id !== 'sv-finale') $('#finale-root').innerHTML = '';         // 끝난 결승전 화면(캔버스)을 남겨 두지 않음
    if (id !== 'sv-result') resultRun++;                              // 자리 발표 연출 중단
  }
  function stopFinale() {
    if (running && running.ctrl && running.ctrl.destroy) running.ctrl.destroy();
    running = null;
    revealed = false;
  }

  bc.onmessage = e => {
    const m = e.data || {};
    if (m.t === 'state') onState(m);
    else if (m.t === 'finale') runFinale(m);
    else if (m.t === 'skip') { if (running && running.ctrl && running.ctrl.skip) running.ctrl.skip(); }
    else if (m.t === 'mute') SFX.setMuted(m.on);
    else if (m.t === 'music') SFX.setMusicMuted(m.off);
    else if (m.t === 'who') bc.postMessage({ t: 'here', embed });
    else if (m.t === 'closeStage' && !embed) window.close();
  };
  bc.postMessage({ t: 'hello', embed });
  window.addEventListener('pagehide', () => bc.postMessage({ t: 'bye', embed }));

  // 별도 창: 마우스를 움직이면 나타나는 전체 화면 버튼
  if (!embed && document.fullscreenEnabled) {
    const fs = document.createElement('button');
    fs.className = 'fs-btn';
    fs.dataset.nosfx = '';
    fs.textContent = '⛶ 전체 화면';
    fs.addEventListener('click', () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); });
    document.body.appendChild(fs);
    let ft = null;
    const poke = () => { fs.classList.add('on'); clearTimeout(ft); ft = setTimeout(() => fs.classList.remove('on'), 2200); };
    window.addEventListener('mousemove', poke);
    document.addEventListener('fullscreenchange', () => { fs.textContent = document.fullscreenElement ? '⛶ 전체 화면 끝내기' : '⛶ 전체 화면'; });
    poke();
  }

  // 소리: 브라우저가 소리를 막아 두었으면 화면을 한 번 클릭해 달라는 안내를 띄움
  const sndHint = document.createElement('button');
  sndHint.className = 'snd-hint hidden';
  sndHint.innerHTML = `${icon('sound', 34)}<span>화면을 한 번 클릭하면 소리가 켜져요</span>`;
  document.body.appendChild(sndHint);
  sndHint.addEventListener('click', () => { SFX.unlock(); sndHint.classList.add('hidden'); });
  window.addEventListener('pointerdown', () => sndHint.classList.add('hidden'));
  function checkSound() {
    SFX.unlock();
    setTimeout(() => { if (!SFX.muted && !SFX.ready) sndHint.classList.remove('hidden'); }, 400);
  }
  SFX.preload();

  function onState(s) {
    if (running) {
      // 교사 콘솔이 아직 이 결승전을 진행 중이면 화면 유지. 이미 끝난 결승전이면(다른 창이 먼저 끝냈거나 건너뛰기) 바로 정리하고 다음 화면으로
      if (s.runId === running.runId) return;
      stopFinale();
    }
    const prevPhase = state.phase;
    state = s;
    if (s.phase === 'idle' || !s.phase) { SFX.music(null); showView('sv-idle'); return; }
    if (prevPhase !== s.phase) {
      checkSound();
      if (s.phase === 'lobby') SFX.play('j_start');
      if (s.phase === 'quest') SFX.play('j_chapter');
      if (s.phase === 'finale') { SFX.play('duel'); if (window.Finale) window.Finale.preload(); }
    }
    SFX.music({ lobby: 'bgm_lobby', quest: 'bgm_lobby', finale: 'bgm_lobby', pick: 'bgm_result', result: 'bgm_result' }[s.phase] || null, .34);
    if (s.phase === 'lobby') { renderLobby(); showView('sv-lobby'); }
    else if (s.phase === 'quest') { renderQuest(); showView('sv-quest'); }
    else if (s.phase === 'finale') { revealed = false; showView('sv-select'); }
    else if (s.phase === 'pick') { renderPick(prevPhase !== 'pick'); showView('sv-pick'); }
    else if (s.phase === 'result') {
      const key = JSON.stringify(s.result || []) + s.flipped;
      if (key !== lastResultKey || prevPhase !== 'result') { renderResult(!revealed); revealed = true; lastResultKey = key; }
      showView('sv-result');
    }
  }

  // ---------- 대기실 ----------
  let qrFor = null;
  const cards = new Map();
  function playerCard(p, withBar) {
    const c = CLASSES[p.cls];
    return `<div class="pc-inner">
      ${c ? `<img class="pc-img" src="${c.img}" alt="">` : `<div class="pc-img pc-empty">${icon('thought', 54)}</div>`}
      <div class="pc-name">${esc(p.name)}</div>
      <div class="pc-cls">${c ? esc(p.title || c.name) : '직업 고르는 중…'}</div>
      ${withBar ? `<div class="pc-bar"><i style="width:${Math.round(p.step / state.total * 100)}%"></i></div>` : ''}
      ${p.done && withBar ? `<img class="pc-done ico pop-in" src="assets/icons/star.png" alt="">` : ''}
    </div>`;
  }
  function syncGrid(grid, list, withBar) {
    const names = new Set(list.map(p => p.name));
    Array.from(grid.children).forEach(el => { if (!names.has(el.dataset.name)) el.remove(); });
    list.forEach((p, i) => {
      let el = grid.querySelector(`[data-name="${CSS.escape(p.name)}"]`);
      const html = playerCard(p, withBar);
      if (!el) {
        if (grid.children.length || list.length === 1) SFX.play('pluck', { vary: .4, gap: 60 });
        el = document.createElement('div');
        el.className = 'pcard pop-in';
        el.dataset.name = p.name;
        el.innerHTML = html; el._html = html;
        grid.appendChild(el);
      } else if (el._html !== html) { el.innerHTML = html; el._html = html; }
      const wasDone = el.classList.contains('done');
      el.classList.toggle('done', !!(p.done && withBar));
      if (!wasDone && p.done && withBar) SFX.play('glass', { gap: 80 });
    });
  }
  function renderLobby() {
    $('#l-code').textContent = state.code;
    $('#l-url').textContent = state.joinUrl;
    if (qrFor !== state.joinUrl) {
      $('#qr').innerHTML = '';
      try { new QRCode($('#qr'), { text: state.joinUrl, width: 260, height: 260, colorDark: '#1a1240' }); } catch (e) {}
      qrFor = state.joinUrl;
    }
    const n = state.players.length;
    if (+$('#l-count').textContent !== n) UI.countUp($('#l-count'), n, 500);
    const made = state.players.filter(p => p.cls).length;
    $('#l-sub').textContent = `캐릭터 생성 ${made}명${state.rosterCount ? ` · 우리 반 ${state.rosterCount}명` : ''}`;
    syncGrid($('#l-players'), state.players, false);
  }

  // ---------- 모험 진행 ----------
  function renderQuest() {
    const ps = state.players, total = state.total;
    const sum = ps.reduce((a, p) => a + Math.min(total, p.step), 0);
    $('#q-all').style.width = (ps.length ? sum / (ps.length * total) * 100 : 0) + '%';
    $('#q-done').textContent = ps.filter(p => p.done).length;
    $('#q-total').textContent = ps.length;
    syncGrid($('#q-players'), ps, true);
  }

  // ---------- 1·2·3등 짝꿍 고르기 (후보 이름은 발표 화면에 절대 나오지 않음) ----------
  let pickDone = new Set();
  function renderPick(first) {
    const list = (state.pick || []).slice().sort((a, b) => a.rank - b.rank);
    if (first) { pickDone = new Set(); SFX.play('j_cute'); }
    const order = [2, 1, 3].map(r => list.find(p => p.rank === r)).filter(Boolean);
    const medal = { 1: 'trophy', 2: 'silver', 3: 'bronze' };
    $('#pick-podium').innerHTML = order.map(p => `
      <div class="pk r${p.rank} ${p.done ? 'done' : ''}">
        <img class="ico pk-medal" src="assets/icons/${medal[p.rank]}.png" alt="">
        <img class="pk-av" src="${CLASSES[p.cls] ? CLASSES[p.cls].img : ''}" alt="">
        <div class="pk-nm">${esc(p.name)}</div>
        <div class="pk-backs">${Array.from({ length: p.n }, (_, i) => `<img src="assets/icons/card.png" style="animation-delay:${i * .15}s" alt="">`).join('')}</div>
        <div class="pk-st">${p.done ? `${icon('heart', 30)} 짝꿍 선택 완료!` : `${icon('hourglass', 30)} 후보 ${p.n}명 중 고르는 중…`}</div>
        ${p.done ? '<div class="stamp">결정!</div>' : ''}
      </div>`).join('');
    list.forEach(p => { if (p.done && !pickDone.has(p.name)) { pickDone.add(p.name); if (!first) { SFX.play('right'); SFX.play('glass', { delay: .15 }); SFX.cheer(); } } });
    if (!first && list.length && list.every(p => p.done)) SFX.play('j_good', { delay: .4 });
  }

  // ---------- 종목 선택 ----------
  $$('.mode-card').forEach(c => {
    c.addEventListener('mouseenter', () => SFX.play('select', { vol: .5 }));
    c.addEventListener('click', () => bc.postMessage({ t: 'chooseMode', mode: c.dataset.mode }));
  });

  // ---------- 결승전 ----------
  function runFinale(m) {
    if (running && running.runId === m.runId) return;
    if (running && running.ctrl && running.ctrl.destroy) running.ctrl.destroy();
    revealed = false;
    SFX.music(null);
    showView('sv-finale');
    const root = $('#finale-root');
    root.innerHTML = '';
    const mine = running = { runId: m.runId, players: m.players, layout: m.layout };
    const done = () => {
      if (running !== mine) return; // 이미 정리된 결승전
      running = null;
      revealed = false;
      state = Object.assign({}, state, { phase: 'finale' });
      // 다음 단계(짝 고르기 또는 결과 발표)는 교사 콘솔이 정해서 보내 줌
      bc.postMessage({ t: 'finaleDone', runId: m.runId });
    };
    // 3D 모듈이 아직 안 왔으면(느린 인터넷) 기다렸다가 시작
    const go = () => { if (running === mine) mine.ctrl = window.Finale.run(m.mode, root, m.players, done); };
    if (window.Finale) return go();
    root.innerHTML = '<div class="fin-load"><div class="spinner"></div><p>경기장을 준비하고 있어요…</p></div>';
    window.addEventListener('finale-ready', go, { once: true });
    setTimeout(() => { if (running === mine && !mine.ctrl) done(); }, 25000); // 끝내 못 불러오면 결과로 넘어감
  }

  // ---------- 결과 ----------
  const key = (r, c) => r + '-' + c;
  function seatMapHTML(map) {
    const L = state.layout, cells = [];
    for (let r = 0; r < L.rows; r++) for (let c = 0; c < L.cols; c++) cells.push([r, c]);
    const flip = !!state.flipped;
    if (flip) cells.reverse();
    let html = flip ? '' : '<div class="board">칠판 · 교탁</div>';
    html += `<div class="desk-grid seat-map" style="grid-template-columns:repeat(${L.cols},minmax(48px,110px))">`;
    cells.forEach(([r, c]) => {
      const k = key(r, c);
      if (!L.desks.includes(k)) { html += '<div class="cell" style="border-color:transparent"></div>'; return; }
      const num = L.numbers[k], info = map[num];
      html += `<div class="cell desk" data-num="${num}"><span class="sm-no">${num}</span>
        ${info ? `<img src="${CLASSES[info.cls].img}" alt=""><span class="sm-name">${esc(info.name)}</span>` : '<span class="muted" style="font-size:13px">빈자리</span>'}</div>`;
    });
    html += '</div>';
    if (flip) html += '<div class="board" style="margin:14px auto 0">칠판 · 교탁</div>';
    return html;
  }
  function renderResult(animate) {
    const run = ++resultRun; // 다시 그리면 이전 발표 연출은 멈춤
    const res = (state.result || []).slice().sort((a, b) => a.rank - b.rank);
    const box = $('#r-classroom');
    const full = {}; res.forEach(p => { full[p.seat] = p; });
    box.innerHTML = seatMapHTML(animate ? {} : full);
    // 시상대
    const medal = ['trophy', 'silver', 'bronze'];
    const order = [1, 0, 2];
    $('#podium').innerHTML = order.map(i => res[i] ? `
      <div class="pd pd${i + 1} ${animate ? 'pd-hide' : ''}">
        <img class="ico pd-medal" src="assets/icons/${medal[i]}.png" alt="">
        <img class="pd-img" src="${CLASSES[res[i].cls].img}" alt="">
        <div class="pd-name">${esc(res[i].name)}</div>
        <div class="pd-block"><span class="display">${i + 1}</span><small>${res[i].seat}번 자리</small></div>
      </div>` : '').join('');
    $('#r-ranks').innerHTML = res.map(p => `<div class="rank-item ${animate ? 'rk-hide' : ''}" data-rank="${p.rank}"><b>${p.rank}등</b><img class="avatar sm" src="${CLASSES[p.cls].img}" alt=""><span class="grow">${esc(p.name)}</span><span class="muted">${p.seat}번</span></div>`).join('');
    if (!animate) return;
    let i = 0;
    const gap = Math.max(110, 2600 / Math.max(1, res.length));
    SFX.crowd(.25, 1);
    const step = () => {
      if (run !== resultRun) { SFX.crowd(0, 1); return; }
      if (i >= res.length) {
        $$('.pd-hide').forEach((el, j) => setTimeout(() => { el.classList.remove('pd-hide'); SFX.play('levelup', { rate: .9 + j * .12, vol: .6 }); }, j * 250));
        setTimeout(() => { if (run === resultRun) { SFX.play('j_win'); SFX.cheer(); } }, 800);
        setTimeout(() => SFX.crowd(0, 3), 4000);
        return;
      }
      const p = res[i++];
      SFX.play('drop', { rate: 0.8 + Math.min(0.8, i / res.length * 0.8), vol: .55, gap: 0 });
      const cell = box.querySelector(`.cell.desk[data-num="${p.seat}"]`);
      if (cell) {
        cell.classList.add('filled');
        cell.innerHTML = `<span class="sm-no">${p.seat}</span><img src="${CLASSES[p.cls].img}" alt=""><span class="sm-name">${esc(p.name)}</span>`;
      }
      const ri = $(`#r-ranks [data-rank="${p.rank}"]`);
      if (ri) ri.classList.remove('rk-hide');
      setTimeout(step, gap);
    };
    setTimeout(step, 500);
  }
})();
