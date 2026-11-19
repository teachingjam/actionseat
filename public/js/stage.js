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

  function showView(id) { $$('.sv').forEach(s => s.classList.toggle('hidden', s.id !== id)); }

  bc.onmessage = e => {
    const m = e.data || {};
    if (m.t === 'state') onState(m);
    else if (m.t === 'finale') runFinale(m);
    else if (m.t === 'skip') { if (running && running.ctrl && running.ctrl.skip) running.ctrl.skip(); }
    else if (m.t === 'mute') SFX.setMuted(m.on);
  };
  bc.postMessage({ t: 'hello' });

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
    const prevPhase = state.phase;
    state = s;
    if (running) return; // 결승전 중에는 화면 유지
    if (s.phase === 'idle' || !s.phase) { showView('sv-idle'); return; }
    if (prevPhase !== s.phase) {
      checkSound();
      if (s.phase === 'lobby') SFX.play('j_start');
      if (s.phase === 'quest') SFX.play('j_chapter');
      if (s.phase === 'finale') { SFX.play('v_choose'); SFX.play('j_cute', { delay: 1.2 }); }
    }
    if (s.phase === 'lobby') { renderLobby(); showView('sv-lobby'); }
    else if (s.phase === 'quest') { renderQuest(); showView('sv-quest'); }
    else if (s.phase === 'finale') { showView('sv-select'); }
    else if (s.phase === 'result') {
      const key = JSON.stringify(s.result || []) + s.flipped;
      if (key !== lastResultKey || prevPhase !== 'result') { renderResult(!revealed); lastResultKey = key; }
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
    showView('sv-finale');
    const root = $('#finale-root');
    root.innerHTML = '';
    running = { runId: m.runId, players: m.players, layout: m.layout };
    const done = () => {
      const r = running; running = null;
      bc.postMessage({ t: 'finaleDone', runId: m.runId });
      // 교사 콘솔이 result 상태를 보내기 전에도 바로 공개
      state = Object.assign({}, state, { phase: 'result', layout: m.layout, result: r.players.map(p => ({ id: p.id, name: p.name, cls: p.cls, rank: p.rank, seat: p.seat, real: p.real })) });
      renderResult(true); revealed = true;
      lastResultKey = JSON.stringify(state.result) + state.flipped;
      showView('sv-result');
    };
    const api = m.mode === 'race' ? window.Race3D : window.Battle2D;
    running.ctrl = api.run(root, m.players, done);
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
      if (i >= res.length) {
        $$('.pd-hide').forEach((el, j) => setTimeout(() => { el.classList.remove('pd-hide'); SFX.play('levelup', { rate: .9 + j * .12, vol: .6 }); }, j * 250));
        setTimeout(() => { SFX.play('j_win'); SFX.cheer(); }, 800);
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
