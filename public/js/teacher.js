// 교사 콘솔 (비밀 설정 + 진행 제어). 학생에게 보이는 화면은 stage.html(발표 화면)이 따로 담당합니다.
(function () {
  const { $, $$, esc, icon, toast, uid, store } = UI;
  const { CLASSES, STATS } = GameData;
  const KEY = 'action-seat-teacher';

  const defaults = {
    layout: null, roster: [], rules: [],
    opts: { avoidScope: 'side', avoidLast: true, includeAbsent: false },
    history: [], room: null
  };
  const S = Object.assign({}, defaults, store(KEY) || {});
  S.opts = Object.assign({}, defaults.opts, S.opts || {});
  if (!S.layout || !Array.isArray(S.layout.desks)) S.layout = presetLayout('pair');
  function save() { store(KEY, S); }

  // ================= 탭 =================
  $$('.tab').forEach(t => t.addEventListener('click', () => showTab(t.dataset.tab)));
  function showTab(name) {
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    $$('main > section').forEach(s => s.classList.toggle('hidden', s.id !== 'tab-' + name));
    if (name === 'layout') renderLayoutEditor();
    if (name === 'roster') renderRoster();
    if (name === 'secret') renderSecret();
    if (name === 'history') renderHistory();
    if (name === 'game') renderGame();
  }

  // ================= 교실 배치 =================
  function key(r, c) { return r + '-' + c; }
  function parse(k) { return k.split('-').map(Number); }
  function presetLayout(type) {
    let rows, cols, on;
    if (type === 'pair') { rows = 5; cols = 8; on = (r, c) => c % 3 !== 2; }
    else if (type === 'single') { rows = 6; cols = 9; on = (r, c) => c % 2 === 0; }
    else if (type === 'group') { rows = 5; cols = 8; on = (r, c) => c % 3 !== 2 && r % 3 !== 2; }
    else { rows = 6; cols = 9; on = (r, c) => c <= 1 || c >= cols - 2 || r >= rows - 2; }
    const desks = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (on(r, c)) desks.push(key(r, c));
    return autoNumber({ rows, cols, desks, numbers: {} });
  }
  function autoNumber(L) {
    const sorted = L.desks.map(parse).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    L.numbers = {};
    sorted.forEach(([r, c], i) => { L.numbers[key(r, c)] = i + 1; });
    return L;
  }
  function randomNumber(L) {
    const nums = L.desks.map((_, i) => i + 1);
    for (let i = nums.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [nums[i], nums[j]] = [nums[j], nums[i]]; }
    L.numbers = {};
    L.desks.forEach((k, i) => { L.numbers[k] = nums[i]; });
    return L;
  }
  function seatsOf(L) {
    return L.desks.map(k => { const [r, c] = parse(k); return { id: k, r, c, num: L.numbers[k] }; })
      .filter(s => s.num).sort((a, b) => a.num - b.num);
  }

  let manual = null;
  function renderLayoutEditor(flash) {
    const L = S.layout;
    $('#ly-rows').value = L.rows; $('#ly-cols').value = L.cols;
    const room = $('#ly-room');
    let html = `<div class="board">칠판 · 교탁</div><div class="desk-grid layout-grid" style="grid-template-columns:repeat(${L.cols},minmax(30px,64px))">`;
    for (let r = 0; r < L.rows; r++) for (let c = 0; c < L.cols; c++) {
      const k = key(r, c), isDesk = L.desks.includes(k);
      const num = manual ? manual.numbers[k] : L.numbers[k];
      const delay = flash ? `style="animation-delay:${(r * L.cols + c) * 12}ms"` : '';
      html += `<div class="cell ${isDesk ? 'desk' : ''} ${isDesk && flash ? 'flash' : ''} ${manual && num ? 'ordering-done' : ''}" data-k="${k}" ${delay}>${isDesk ? `<span>${num || (manual ? '?' : '')}</span>` : ''}</div>`;
    }
    room.innerHTML = html + '</div>';
    $$('.cell', room).forEach(cell => cell.addEventListener('click', () => onCellClick(cell.dataset.k)));
    $('#ly-info').textContent = `책상 ${L.desks.length}개 · 명단 ${S.roster.length}명${S.roster.length > L.desks.length ? ' — 책상이 부족해요!' : ''}`;
    const info = $('#ly-manual-info');
    if (manual) {
      info.classList.remove('hidden');
      info.textContent = `${manual.next}번 자리로 할 책상을 클릭하세요 (${manual.next - 1}/${L.desks.length})`;
      $('#ly-manual').textContent = '직접 매기기 취소';
    } else {
      info.classList.add('hidden');
      $('#ly-manual').textContent = '직접 매기기';
    }
  }
  function onCellClick(k) {
    const L = S.layout;
    if (manual) {
      if (!L.desks.includes(k) || manual.numbers[k]) return;
      manual.numbers[k] = manual.next++;
      if (manual.next > L.desks.length) {
        L.numbers = manual.numbers; manual = null; save();
        toast('자리 번호를 모두 매겼어요!', 'star');
      }
      renderLayoutEditor();
      return;
    }
    const i = L.desks.indexOf(k);
    if (i >= 0) L.desks.splice(i, 1); else L.desks.push(k);
    autoNumber(L); save();
    renderLayoutEditor();
  }
  $('#ly-resize').addEventListener('click', () => {
    const rows = Math.max(1, Math.min(12, +$('#ly-rows').value || 5));
    const cols = Math.max(1, Math.min(14, +$('#ly-cols').value || 6));
    const L = S.layout;
    L.rows = rows; L.cols = cols;
    L.desks = L.desks.filter(k => { const [r, c] = parse(k); return r < rows && c < cols; });
    autoNumber(L); manual = null; save(); renderLayoutEditor(true);
    toast(`${rows}줄 × ${cols}칸으로 바꿨어요`, 'desk');
  });
  $('#ly-clear').addEventListener('click', () => { S.layout.desks = []; S.layout.numbers = {}; manual = null; save(); renderLayoutEditor(); });
  $('#ly-fill').addEventListener('click', () => {
    const L = S.layout; L.desks = [];
    for (let r = 0; r < L.rows; r++) for (let c = 0; c < L.cols; c++) L.desks.push(key(r, c));
    autoNumber(L); manual = null; save(); renderLayoutEditor(true);
  });
  $$('[data-preset]').forEach(b => b.addEventListener('click', async () => {
    if (S.layout.desks.length && !(await UI.confirm('현재 배치를 지우고 새로 만들까요?', { icon: 'desk', ok: '새로 만들기' }))) return;
    S.layout = presetLayout(b.dataset.preset); manual = null; save(); renderLayoutEditor(true);
    toast(`'${b.textContent.trim()}' 배치를 적용했어요`, 'desk');
  }));
  $('#ly-auto').addEventListener('click', () => { manual = null; autoNumber(S.layout); save(); renderLayoutEditor(true); toast('앞줄 왼쪽부터 번호를 매겼어요', 'star'); });
  $('#ly-random').addEventListener('click', () => { manual = null; randomNumber(S.layout); save(); renderLayoutEditor(true); toast('자리 번호를 무작위로 섞었어요', 'dice'); });
  $('#ly-manual').addEventListener('click', () => {
    if (!S.layout.desks.length) return toast('먼저 책상을 놓아 주세요');
    manual = manual ? null : { next: 1, numbers: {} };
    renderLayoutEditor();
  });

  // ================= 명단 =================
  function renderRoster() { $('#roster-text').value = S.roster.join('\n'); rosterPreview(); }
  function rosterPreview() {
    $('#roster-preview').innerHTML = S.roster.map(n => `<span class="rule" style="padding:4px 10px">${esc(n)}</span>`).join('') || '<span class="muted">비어 있음</span>';
    $('#roster-info').textContent = `${S.roster.length}명`;
  }
  $('#roster-save').addEventListener('click', () => {
    const names = $('#roster-text').value.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
    const uniq = Array.from(new Set(names));
    if (uniq.length !== names.length) toast('중복된 이름은 하나만 남겼어요');
    S.roster = uniq; save(); rosterPreview(); toast('명단을 저장했어요', 'group');
    if (S.room) broadcastRoom(true);
  });

  // ================= 비밀 조건 =================
  const RULE_INFO = {
    avoid: { tag: '떨어뜨리기', help: '두 학생이 서로 붙어 앉지 않게 합니다. (범위는 오른쪽 옵션)' },
    together: { tag: '짝 만들기', help: '두 학생을 옆자리 짝으로 앉힙니다.' },
    fixed: { tag: '자리 고정', help: '학생을 특정 번호의 자리에 고정합니다. ※ 자리 번호 = 등수라서 1번 자리에 고정하면 그 학생이 1등으로 보여요. 눈에 띄지 않게 하려면 중간 번호 자리를 쓰세요.' },
    front: { tag: '앞자리', help: '학생을 앞에서부터 N번째 줄 안에 앉힙니다.' },
    back: { tag: '뒷자리', help: '학생을 뒤에서부터 N번째 줄 안에 앉힙니다. (예: 키가 큰 학생)' }
  };
  const nameOptions = sel => S.roster.map(n => `<option ${n === sel ? 'selected' : ''}>${esc(n)}</option>`).join('');
  function renderRuleForm() {
    const t = $('#rf-type').value;
    $('#rf-a').innerHTML = nameOptions();
    const w = $('#rf-b-wrap');
    if (t === 'avoid' || t === 'together') w.innerHTML = `<select id="rf-b" style="width:100%">${nameOptions(S.roster[1])}</select>`;
    else if (t === 'fixed') w.innerHTML = `<input type="number" id="rf-b" min="1" placeholder="자리 번호" style="width:100%">`;
    else w.innerHTML = `<select id="rf-b" style="width:100%">${[1, 2, 3].map(n => `<option value="${n}">${t === 'front' ? '앞' : '뒤'}에서 ${n}줄 이내</option>`).join('')}</select>`;
    $('#rf-help').textContent = RULE_INFO[t].help;
  }
  $('#rf-type').addEventListener('change', renderRuleForm);
  $('#rf-add').addEventListener('click', () => {
    if (!S.roster.length) return toast('먼저 학생 명단을 입력해 주세요');
    const type = $('#rf-type').value, a = $('#rf-a').value, b = $('#rf-b').value;
    const rule = { id: uid(), type, a };
    if (type === 'avoid' || type === 'together') {
      if (a === b) return toast('서로 다른 학생을 골라 주세요');
      rule.b = b;
    } else if (type === 'fixed') {
      const nums = seatsOf(S.layout).map(s => s.num);
      if (!nums.includes(+b)) return toast('없는 자리 번호예요');
      if (S.rules.some(r => r.type === 'fixed' && +r.seat === +b)) return toast('이미 다른 학생이 고정된 자리예요');
      S.rules = S.rules.filter(r => !(r.type === 'fixed' && r.a === a));
      rule.seat = +b;
    } else rule.rows = +b;
    S.rules.push(rule); save(); renderRules();
  });
  function ruleText(r) {
    const n = x => `<b>${esc(x)}</b>`;
    if (r.type === 'avoid') return `${n(r.a)} ↔ ${n(r.b)} 떨어뜨리기`;
    if (r.type === 'together') return `${n(r.a)} + ${n(r.b)} 짝으로`;
    if (r.type === 'fixed') return `${n(r.a)} → ${r.seat}번 자리`;
    if (r.type === 'front') return `${n(r.a)} 앞에서 ${r.rows}줄 이내`;
    return `${n(r.a)} 뒤에서 ${r.rows}줄 이내`;
  }
  function renderRules() {
    const missing = r => !S.roster.includes(r.a) || ((r.type === 'avoid' || r.type === 'together') && !S.roster.includes(r.b));
    $('#rule-list').innerHTML = S.rules.length ? S.rules.map(r => `
      <div class="rule"><span class="tag ${r.type}">${RULE_INFO[r.type].tag}</span>
      <span>${ruleText(r)}${missing(r) ? ' <span style="color:var(--red)">(명단에 없음)</span>' : ''}</span>
      <button class="x" data-id="${r.id}" title="삭제">✕</button></div>`).join('')
      : '<p class="muted">아직 조건이 없어요. 조건이 없으면 순수하게 능력치 순위대로 배정됩니다.</p>';
    $$('#rule-list .x').forEach(b => b.addEventListener('click', () => { S.rules = S.rules.filter(r => r.id !== b.dataset.id); save(); renderRules(); }));
  }
  function renderSecret() {
    renderRuleForm(); renderRules();
    $$('input[name=scope]').forEach(r => { r.checked = r.value === S.opts.avoidScope; });
    $('#opt-last').checked = !!S.opts.avoidLast;
    $('#opt-absent').checked = !!S.opts.includeAbsent;
    const last = S.history[0];
    $('#opt-last-info').textContent = last ? `최근 결과(${last.date})의 짝 ${last.partners.length}쌍을 피합니다.` : '아직 저장된 지난 결과가 없어요.';
  }
  $$('input[name=scope]').forEach(r => r.addEventListener('change', () => { S.opts.avoidScope = r.value; save(); }));
  $('#opt-last').addEventListener('change', e => { S.opts.avoidLast = e.target.checked; save(); });
  $('#opt-absent').addEventListener('change', e => { S.opts.includeAbsent = e.target.checked; save(); });

  function buildRules(nameToId) {
    const rules = [];
    S.rules.forEach(r => {
      const a = nameToId[r.a];
      if (!a) return;
      if (r.type === 'avoid' || r.type === 'together') { const b = nameToId[r.b]; if (b) rules.push({ type: r.type, a, b }); }
      else if (r.type === 'fixed') rules.push({ type: 'fixed', a, seat: r.seat });
      else rules.push({ type: r.type, a, rows: r.rows });
    });
    if (S.opts.avoidLast && S.history[0]) {
      S.history[0].partners.forEach(([x, y]) => {
        if (nameToId[x] && nameToId[y] && !S.rules.some(r => r.type === 'together' && ((r.a === x && r.b === y) || (r.a === y && r.b === x))))
          rules.push({ type: 'avoid', a: nameToId[x], b: nameToId[y] });
      });
    }
    return rules;
  }
  function randomStats() {
    const cls = Object.keys(CLASSES)[Math.floor(Math.random() * 6)];
    const st = Object.assign({}, CLASSES[cls].base);
    for (let i = 0; i < 26; i++) { const k = STATS[Math.floor(Math.random() * 5)].key; st[k]++; }
    return { cls, stats: st };
  }
  $('#btn-sim').addEventListener('click', () => {
    const seats = seatsOf(S.layout);
    if (!S.roster.length) return toast('학생 명단이 필요해요');
    const students = S.roster.map(n => ({ id: n, name: n, score: Solver.scoreFor('race', randomStats().stats) }));
    const nameToId = {}; S.roster.forEach(n => { nameToId[n] = n; });
    let res;
    try { res = Solver.solve(seats, students, buildRules(nameToId), { avoidScope: S.opts.avoidScope }); }
    catch (e) { return toast(e.message); }
    $('#sim-box').classList.remove('hidden');
    const shift = res.order.reduce((a, o) => a + Math.abs(o.rank - o.naturalRank), 0) / Math.max(1, res.order.length);
    $('#sim-msg').innerHTML = res.violations.length
      ? `<p style="color:var(--red);font-family:Jua;font-size:18px">지키지 못한 조건 ${res.violations.length}개 — 조건이 서로 충돌하거나 책상 배치상 불가능할 수 있어요.</p>`
      : `<p style="color:var(--green);font-family:Jua;font-size:18px">모든 조건을 지켰어요! (능력치 순위에서 평균 ${shift.toFixed(1)}칸 조정)</p>`;
    const map = {}; res.order.forEach(o => { map[o.seat] = { name: o.id }; });
    $('#sim-room').innerHTML = seatMapHTML(map, false);
  });

  // ================= 좌석표 =================
  let flipped = false;
  function seatMapHTML(map, swappable) {
    const L = S.layout, cells = [];
    for (let r = 0; r < L.rows; r++) for (let c = 0; c < L.cols; c++) cells.push([r, c]);
    if (flipped) cells.reverse();
    let html = flipped ? '' : '<div class="board">칠판 · 교탁</div>';
    html += `<div class="desk-grid seat-map ${swappable ? 'swappable' : ''}" style="grid-template-columns:repeat(${L.cols},minmax(48px,96px))">`;
    cells.forEach(([r, c]) => {
      const k = key(r, c);
      if (!L.desks.includes(k)) { html += '<div class="cell" style="border-color:transparent"></div>'; return; }
      const num = L.numbers[k], info = map[num];
      html += `<div class="cell desk" data-num="${num}"><span class="sm-no">${num}</span>
        ${info ? `${info.cls ? `<img src="${CLASSES[info.cls].img}" alt="">` : ''}<span class="sm-name">${esc(info.name)}</span>` : '<span class="muted" style="font-size:13px">빈자리</span>'}</div>`;
    });
    html += '</div>';
    if (flipped) html += '<div class="board" style="margin:14px auto 0">칠판 · 교탁</div>';
    return html;
  }

  // ================= 지난 결과 =================
  function renderHistory() {
    const list = $('#history-list');
    if (!S.history.length) { list.innerHTML = '<p class="muted">아직 저장된 결과가 없어요.</p>'; return; }
    list.innerHTML = S.history.map((h, i) => `
      <div class="panel" style="margin:12px 0">
        <div class="row"><h3 class="grow" style="margin:0">${esc(h.date)} · ${h.mode === 'race' ? '달리기' : '배틀로얄'}</h3>
        <button class="btn small danger" data-del="${i}">삭제</button></div>
        <p class="help">${Object.entries(h.seatMap).sort((a, b) => a[0] - b[0]).map(([n, name]) => `${n}번 ${esc(name)}`).join(' · ')}</p>
      </div>`).join('');
    $$('[data-del]', list).forEach(b => b.addEventListener('click', async () => {
      if (!(await UI.confirm('이 기록을 삭제할까요?', { danger: true, ok: '삭제' }))) return;
      S.history.splice(+b.dataset.del, 1); save(); renderHistory();
    }));
  }

  // ================= 발표 화면 통신 =================
  const stageBC = new BroadcastChannel('action-seat-stage-v1');
  let finaleRun = null; // {runId, mode, players}
  function joinUrl() { return S.room ? new URL('index.html?code=' + S.room.code, location.href).href : ''; }
  function stageState() {
    const R = S.room;
    if (!R) return { t: 'state', phase: 'idle' };
    return {
      t: 'state', phase: R.phase, code: R.code, joinUrl: joinUrl(),
      players: Object.values(R.students).map(s => ({ name: s.name, cls: s.cls, step: s.step || 0, done: !!s.done, title: s.cls ? GameData.titleOf(s.cls, s.traits) : '' })),
      total: GameData.TOTAL_STEPS, rosterCount: S.roster.length,
      layout: S.layout, result: R.result, mode: R.mode, flipped
    };
  }
  let stTimer = null;
  function pushStage(now) {
    const send = () => { stTimer = null; stageBC.postMessage(stageState()); };
    if (now) { clearTimeout(stTimer); send(); return; }
    if (!stTimer) stTimer = setTimeout(send, 250);
  }
  stageBC.onmessage = e => {
    const m = e.data || {};
    if (m.t === 'hello') {
      pushStage(true);
      if (finaleRun && S.room && S.room.phase === 'finale' && finaleRun.running) stageBC.postMessage({ t: 'finale', ...finaleRun });
    } else if (m.t === 'chooseMode') startFinale(m.mode);
    else if (m.t === 'finaleDone') onFinaleDone(m.runId);
  };

  // ---------- 발표 모드(같은 화면) & 별도 창 ----------
  let popup = null;
  function enterStage() {
    const ov = $('#stage-ov'), fr = $('#stage-frame');
    if (!fr.src) fr.src = 'stage.html?embed=1';
    ov.classList.remove('hidden');
    $('#dock').classList.remove('hidden');
    $('#dock-hot').classList.remove('hidden');
    try { if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {}); } catch (e) {}
    renderDock(); pokeDock();
  }
  function exitStage() {
    $('#stage-ov').classList.add('hidden');
    $('#dock').classList.add('hidden');
    $('#dock-hot').classList.add('hidden');
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) {}
    renderGame();
  }
  function openPopup() {
    popup = window.open('stage.html', 'action-seat-stage', 'width=1280,height=760');
    if (!popup) return UI.alert('팝업이 차단됐어요. 브라우저 주소창의 팝업 허용을 눌러 주세요.', { icon: 'lock' });
    if (!$('#stage-ov').classList.contains('hidden')) exitStage();
    toast('발표 창을 프로젝터 화면으로 옮긴 뒤 F11로 전체 화면을 켜세요', 'megaphone');
  }
  const inStage = () => !$('#stage-ov').classList.contains('hidden');
  let dockTimer = null;
  function pokeDock() {
    const d = $('#dock');
    d.classList.remove('tuck');
    clearTimeout(dockTimer);
    dockTimer = setTimeout(() => d.classList.add('tuck'), 2600);
  }
  $('#dock-hot').addEventListener('mousemove', pokeDock);
  $('#dock').addEventListener('mousemove', pokeDock);
  $('#dock-hot').addEventListener('click', pokeDock);

  // 단계별 진행 버튼 (콘솔·도크 공용). 도크에는 비밀 관련 내용이 절대 들어가지 않음.
  function actionsFor(where) {
    const R = S.room; if (!R) return [];
    const A = [];
    const ph = R.phase;
    if (ph === 'lobby') A.push(['start', 'play', '모험 시작', 'green']);
    if (ph === 'quest') A.push(['endQuest', 'flag', '결승전으로', '']);
    if (ph === 'finale' && !(finaleRun && finaleRun.running)) { A.push(['race', 'shoe', '달리기', '']); A.push(['battle', 'swords', '배틀로얄', '']); }
    if (ph === 'finale' && finaleRun && finaleRun.running) A.push(['skip', 'stopwatch', '건너뛰기', 'secondary']);
    if (ph === 'result') { A.push(['send', 'phone', '학생에게 전송', 'green']); A.push(['print', 'printer', '인쇄', 'secondary']); A.push(['rematch', 'dice', '다른 종목', 'secondary']); A.push(['finish', 'chest', '저장하고 끝내기', 'danger']); }
    A.push(['sound', SFX.muted ? 'mute' : 'sound', SFX.muted ? '소리 켜기' : '소리 끄기', 'ghost']);
    if (where === 'console') {
      A.push(['stage', 'megaphone', '발표 모드(전체 화면)', 'secondary']);
      A.push(['popup', 'door', '발표 창 분리', 'secondary']);
      if (ph === 'lobby' || ph === 'quest') A.push(['close', 'lock', '방 닫기', 'ghost']);
    } else {
      A.push(['popup', 'door', '창 분리', 'ghost']);
      A.push(['console', 'gear', '콘솔', 'ghost']);
    }
    return A;
  }
  function btnHTML([act, ic, label, cls], small) {
    return `<button class="btn ${small ? 'small' : ''} ${cls}" data-act="${act}">${icon(ic, small ? 22 : 28)}${label}</button>`;
  }
  function renderDock() {
    if (!inStage()) return;
    const acts = actionsFor('dock');
    $('#dock').innerHTML = acts.map(a => btnHTML(a, true)).join('');
    $$('#dock [data-act]').forEach(b => b.addEventListener('click', () => doAction(b.dataset.act)));
  }
  async function doAction(act) {
    const R = S.room;
    switch (act) {
      case 'start': {
        const n = Object.values(R.students).filter(s => s.cls).length;
        if (!n) return toast('아직 캐릭터를 만든 학생이 없어요');
        setPhase('quest'); toast('모험이 시작되었습니다!', 'swords'); break;
      }
      case 'endQuest': {
        const notDone = Object.values(R.students).filter(s => !s.done).length;
        if (notDone && !(await UI.confirm(`아직 ${notDone}명이 모험 중이에요.<br>지금까지의 능력치로 결승전을 시작할까요?`, { icon: 'flag', ok: '결승전 시작' }))) return;
        setPhase('finale'); break;
      }
      case 'race': case 'battle': startFinale(act); break;
      case 'skip': stageBC.postMessage({ t: 'skip' }); break;
      case 'send': sendResults(); break;
      case 'print': printResult(); break;
      case 'rematch':
        if (!(await UI.confirm('다른 종목으로 결승전을 다시 할까요?<br>결과가 새로 정해져요.', { icon: 'dice', ok: '다시 하기' }))) return;
        R.result = null; finaleRun = null; setPhase('finale'); break;
      case 'finish': finish(); break;
      case 'sound': SFX.toggle(); stageBC.postMessage({ t: 'mute', on: SFX.muted }); renderDock(); renderGame(); break;
      case 'stage': enterStage(); break;
      case 'popup': openPopup(); break;
      case 'console': exitStage(); break;
      case 'close':
        if (!(await UI.confirm('방을 닫을까요?<br>학생들의 진행 상황이 모두 사라져요.', { icon: 'lock', danger: true, ok: '방 닫기' }))) return;
        closeRoom(); break;
    }
  }
  function setPhase(ph) { S.room.phase = ph; save(); broadcastRoom(true); pushStage(true); renderGame(); renderDock(); }

  // ================= 방 운영 (학생 기기와 실시간 통신) =================
  const students = () => S.room ? S.room.students : {};
  const claimedNames = () => Object.values(students()).map(s => s.name);
  const playersPublic = () => Object.values(students()).map(s => ({ name: s.name, cls: s.cls }));

  let bcTimer = null;
  function broadcastRoom(now) {
    if (!S.room) return;
    const send = () => { bcTimer = null; Net.send('room', { phase: S.room.phase, roster: S.roster, claimed: claimedNames(), players: playersPublic() }); };
    if (now) { clearTimeout(bcTimer); send(); return; }
    if (!bcTimer) bcTimer = setTimeout(send, 400);
  }

  function onMessage(m) {
    if (!S.room) return;
    const R = S.room;
    if (m.type === 'hello') {
      Net.send('welcome', { to: m.token, phase: R.phase, roster: S.roster, claimed: claimedNames(), players: playersPublic(), known: !!R.students[m.token] });
    } else if (m.type === 'claim') {
      const name = String(m.name || '').trim().slice(0, 12);
      const owner = Object.entries(R.students).find(([, s]) => s.name === name);
      let reason = null;
      if (!name) reason = '이름이 비어 있어요';
      else if (R.phase === 'finale' || R.phase === 'result') reason = '이미 결승전이 진행 중이에요';
      else if (S.roster.length && !S.roster.includes(name)) reason = '명단에 없는 이름이에요';
      else if (owner && owner[0] !== m.token) reason = '이미 다른 친구가 고른 이름이에요';
      if (reason) { Net.send('claimResult', { to: m.token, ok: false, reason }); return; }
      R.students[m.token] = R.students[m.token] || { name, cls: null, stats: null, traits: {}, step: 0, done: false };
      R.students[m.token].name = name;
      save();
      Net.send('claimResult', { to: m.token, ok: true, name });
      refreshSoon(); broadcastRoom();
    } else if (m.type === 'reclaim' || m.type === 'update') {
      let s = R.students[m.token];
      if (!s) {
        if (m.type !== 'reclaim' || !m.name) return;
        if (claimedNames().includes(m.name)) return;
        if (S.roster.length && !S.roster.includes(m.name)) return;
        s = R.students[m.token] = { name: m.name };
      }
      ['cls', 'stats', 'traits', 'step', 'done'].forEach(k => { if (m[k] !== undefined) s[k] = m[k]; });
      save();
      refreshSoon(); broadcastRoom();
    }
  }
  let rfTimer = null;
  function refreshSoon() {
    pushStage();
    if (rfTimer) return;
    rfTimer = setTimeout(() => { rfTimer = null; if (S.room && (S.room.phase === 'lobby' || S.room.phase === 'quest')) renderGame(); }, 300);
  }

  let connText = '';
  async function openChannel() {
    connText = '연결 중…'; renderGame();
    try {
      await Net.connect(S.room.code, onMessage, st => {
        connText = st === 'SUBSCRIBED' ? '실시간 연결됨' : '재연결 중…';
        if (st === 'SUBSCRIBED') { Net.send('ping', {}); broadcastRoom(true); }
        renderGame();
      });
    } catch (e) {
      connText = '연결 실패 — 콘솔에서 다시 시도';
      renderGame();
      toast('실시간 연결 실패: ' + e.message, 'lock');
    }
  }
  setInterval(() => { if (S.room && Net.connected) broadcastRoom(true); }, 10000);

  $('#btn-create').addEventListener('click', async () => {
    const seats = seatsOf(S.layout);
    if (!seats.length) { toast('먼저 교실 배치에서 책상을 놓아 주세요', 'desk'); return showTab('layout'); }
    if (S.roster.length > seats.length) return UI.alert(`책상(${seats.length}개)이 학생(${S.roster.length}명)보다 적어요. 교실 배치에서 책상을 추가해 주세요.`, { icon: 'desk' });
    const code = String(Math.floor(100000 + Math.random() * 900000));
    S.room = { code, phase: 'lobby', students: {}, created: Date.now(), result: null, mode: null };
    finaleRun = null;
    save();
    openChannel();
    renderGame(); pushStage(true);
    enterStage();
  });
  function closeRoom() {
    Net.send('closed', {});
    S.room = null; finaleRun = null; save();
    pushStage(true);
    if (inStage()) exitStage();
    renderGame();
  }

  // ---------- 콘솔 렌더 ----------
  function renderGame() {
    renderDock();
    if (!S.room) {
      $('#g-none').classList.remove('hidden'); $('#g-room').classList.add('hidden');
      const seats = seatsOf(S.layout).length;
      const items = [
        [seats > 0, `책상 ${seats}개 배치됨`],
        [S.roster.length > 0, S.roster.length ? `학생 명단 ${S.roster.length}명` : '학생 명단 없음 (자유 입력)'],
        [true, `비밀 조건 ${S.rules.length}개`],
        [!S.roster.length || seats >= S.roster.length, seats >= S.roster.length ? '책상 수 충분' : `책상이 ${S.roster.length - seats}개 부족해요`]
      ];
      $('#g-checklist').innerHTML = items.map(([ok, t]) => `<div class="check-item">${icon(ok ? 'star' : 'lock', 24)} ${t}</div>`).join('');
      return;
    }
    $('#g-none').classList.add('hidden'); $('#g-room').classList.remove('hidden');
    const R = S.room, list = Object.entries(R.students);
    $('#c-code').textContent = R.code;
    const PH = { lobby: '대기실', quest: '모험 진행 중', finale: '결승전', result: '결과 발표' };
    const done = list.filter(([, s]) => s.done).length;
    $('#c-status').innerHTML = [
      [Net.connected ? 'bolt' : 'lock', connText || (Net.connected ? '실시간 연결됨' : '연결 안 됨')],
      ['flag', PH[R.phase]],
      ['group', `참가 ${list.length}명${S.roster.length ? ` / ${S.roster.length}` : ''}`],
      ['trophy', `퀘스트 완료 ${done}명`]
    ].map(([ic, t]) => `<span class="chip">${icon(ic, 22)}${esc(t)}</span>`).join('');
    $('#c-actions').innerHTML = actionsFor('console').map(a => btnHTML(a, false)).join('');
    $$('#c-actions [data-act]').forEach(b => b.addEventListener('click', () => doAction(b.dataset.act)));
    const total = GameData.TOTAL_STEPS;
    $('#c-players').innerHTML = list.map(([tk, s]) => `
      <div class="mini-item" data-tk="${tk}" title="클릭하면 내보내기">
        ${s.cls ? `<img class="avatar sm" src="${CLASSES[s.cls].img}" alt="">` : icon('thought', 36)}
        <span>${esc(s.name)}</span><div class="pbar"><i style="width:${Math.round((s.step || 0) / total * 100)}%"></i></div>
      </div>`).join('') || '<p class="muted">아직 아무도 들어오지 않았어요.</p>';
    $$('#c-players .mini-item').forEach(p => p.addEventListener('click', async () => {
      const s = R.students[p.dataset.tk];
      if (!s || !(await UI.confirm(`'${esc(s.name)}' 학생을 내보낼까요?<br>(다시 입장할 수 있어요)`, { icon: 'group', ok: '내보내기', danger: true }))) return;
      Net.send('kick', { to: p.dataset.tk });
      delete R.students[p.dataset.tk]; save(); renderGame(); broadcastRoom(); pushStage();
    }));
    $('#c-result').classList.toggle('hidden', !(R.phase === 'result' && R.result));
    if (R.phase === 'result' && R.result) renderResultConsole();
  }

  // ---------- 결승전 ----------
  function participants() {
    const R = S.room;
    const list = Object.entries(R.students).map(([tk, s]) => {
      let cls = s.cls, stats = s.stats;
      if (!cls || !stats) { const rs = randomStats(); cls = cls || rs.cls; stats = stats || Object.assign({}, CLASSES[cls].base); }
      return { id: tk, name: s.name, cls, stats, real: true };
    });
    if (S.opts.includeAbsent && S.roster.length) {
      const present = new Set(list.map(p => p.name));
      S.roster.filter(n => !present.has(n)).forEach(n => { const rs = randomStats(); list.push({ id: 'proxy:' + n, name: n, cls: rs.cls, stats: rs.stats, real: false }); });
    }
    return list;
  }
  async function startFinale(mode) {
    const R = S.room;
    if (!R || R.phase !== 'finale' || (finaleRun && finaleRun.running)) return;
    const ps = participants();
    if (!ps.length) return toast('참가자가 없어요');
    const scored = ps.map(p => ({ id: p.id, name: p.name, score: Solver.scoreFor(mode, p.stats) }));
    const nameToId = {}; ps.forEach(p => { nameToId[p.name] = p.id; });
    let res;
    try { res = Solver.solve(seatsOf(S.layout), scored, buildRules(nameToId), { avoidScope: S.opts.avoidScope }); }
    catch (e) { return UI.alert(esc(e.message), { icon: 'desk' }); }
    // 지키지 못한 조건은 콘솔에만 은근하게 표시 (발표 화면에는 아무것도 안 나옴)
    if (res.violations.length && !inStage()) toast(`설정 ${res.violations.length}개를 적용하지 못했어요`, 'gear');
    const byId = {}; ps.forEach(p => { byId[p.id] = p; });
    const players = res.order.map(o => ({ id: o.id, name: byId[o.id].name, cls: byId[o.id].cls, stats: byId[o.id].stats, rank: o.rank, seat: o.seat, real: byId[o.id].real }));
    R.mode = mode;
    R.pendingResult = players.map(p => ({ id: p.id, name: p.name, cls: p.cls, rank: p.rank, seat: p.seat, real: p.real }));
    save();
    finaleRun = { runId: uid(), mode, players, layout: S.layout, running: true };
    stageBC.postMessage({ t: 'finale', ...finaleRun });
    renderDock(); renderGame();
    if (!inStage() && !popup) toast('발표 화면에서 결승전이 시작돼요', 'megaphone');
  }
  function onFinaleDone(runId) {
    const R = S.room;
    if (!R || !finaleRun || finaleRun.runId !== runId || !finaleRun.running) return;
    finaleRun.running = false;
    R.result = R.pendingResult; delete R.pendingResult;
    setPhase('result');
  }

  // ---------- 결과 (콘솔) ----------
  let swapMode = false, swapSel = null;
  function resultMap() { const m = {}; (S.room.result || []).forEach(p => { m[p.seat] = { name: p.name, cls: p.cls }; }); return m; }
  function renderResultConsole() {
    $('#r-classroom').innerHTML = seatMapHTML(resultMap(), swapMode);
    const ranks = S.room.result.slice().sort((a, b) => a.rank - b.rank);
    $('#r-ranks').innerHTML = ranks.map(p => `<div class="rank-item"><b>${p.rank}등</b><img class="avatar sm" src="${CLASSES[p.cls].img}" alt=""><span class="grow">${esc(p.name)}${p.real ? '' : ' <small class="muted">(대리)</small>'}</span><span class="muted">${p.seat}번</span></div>`).join('');
    $$('#r-classroom .cell.desk').forEach(cell => cell.addEventListener('click', () => {
      if (!swapMode) return;
      const num = +cell.dataset.num;
      if (swapSel == null) { swapSel = num; cell.classList.add('swap-sel'); return; }
      if (swapSel !== num) {
        const res = S.room.result;
        const a = res.find(p => p.seat === swapSel), b = res.find(p => p.seat === num);
        if (a && b) { const t = a.seat; a.seat = b.seat; b.seat = t; }
        else if (a) a.seat = num; else if (b) b.seat = swapSel;
        res.slice().sort((x, y) => x.seat - y.seat).forEach((p, i) => { p.rank = i + 1; });
        save(); pushStage(true);
      }
      swapSel = null; renderResultConsole();
    }));
  }
  $('#btn-swap').addEventListener('click', () => {
    swapMode = !swapMode; swapSel = null;
    $('#btn-swap').textContent = swapMode ? '바꾸기 완료' : '자리 바꾸기';
    if (swapMode) toast('바꿀 두 자리를 차례로 클릭하세요');
    renderResultConsole();
  });
  $('#btn-flip').addEventListener('click', () => { flipped = !flipped; renderResultConsole(); pushStage(true); });
  $('#btn-print').addEventListener('click', printResult);
  // 인쇄: 화면과 상관없이 '칠판 + 학생 이름 책상'만 담은 A4 가로 한 장짜리 문서를 따로 만들어 인쇄
  function printResult() {
    const R = S.room;
    if (!R || !R.result) return toast('인쇄할 결과가 없어요');
    const L = S.layout, map = resultMap();
    const cells = [];
    for (let r = 0; r < L.rows; r++) for (let c = 0; c < L.cols; c++) if (L.desks.includes(key(r, c))) cells.push({ r, c, name: (map[L.numbers[key(r, c)]] || {}).name || '' });
    if (!cells.length) return;
    // 책상이 없는 바깥 줄·칸은 잘라서 종이를 최대한 크게 씀
    const r0 = Math.min(...cells.map(x => x.r)), r1 = Math.max(...cells.map(x => x.r));
    const c0 = Math.min(...cells.map(x => x.c)), c1 = Math.max(...cells.map(x => x.c));
    const rows = r1 - r0 + 1, cols = c1 - c0 + 1;
    const W = 277, H = 170; // mm (A4 가로 297×210, 여백·칠판 제외)
    const cw = W / cols, ch = H / rows;
    const longest = Math.max(2, ...cells.map(x => x.name.length));
    const fs = Math.max(4, Math.min(9, ch * 0.42, (cw * 0.86) / (longest * 0.95))); // mm
    const pos = x => {
      let rr = x.r - r0, cc = x.c - c0;
      if (flipped) { rr = rows - 1 - rr; cc = cols - 1 - cc; }
      return `grid-row:${rr + 1};grid-column:${cc + 1}`;
    };
    const board = '<div class="board">칠 판</div>';
    const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>자리 배치표</title>
      <link href="https://fonts.googleapis.com/css2?family=Jua&display=swap" rel="stylesheet">
      <style>
        @page { size: A4 landscape; margin: 10mm; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { width: 277mm; height: 190mm; overflow: hidden; background: #fff; color: #000; font-family: 'Jua', 'Malgun Gothic', sans-serif; }
        .page { width: 277mm; height: 190mm; display: flex; flex-direction: column; gap: 4mm; }
        .board { height: 12mm; flex: none; border: .6mm solid #000; border-radius: 2mm; display: flex; align-items: center; justify-content: center; font-size: 6mm; letter-spacing: 3mm; width: 60%; margin: 0 auto; }
        .grid { flex: 1; display: grid; grid-template-columns: repeat(${cols}, 1fr); grid-template-rows: repeat(${rows}, 1fr); gap: 1.6mm; }
        .desk { border: .5mm solid #000; border-radius: 1.5mm; display: flex; align-items: center; justify-content: center; font-size: ${fs.toFixed(2)}mm; white-space: nowrap; overflow: hidden; }
        .desk.empty { border-style: dashed; border-color: #999; }
      </style></head><body><div class="page">
      ${flipped ? '' : board}
      <div class="grid">${cells.map(x => `<div class="desk ${x.name ? '' : 'empty'}" style="${pos(x)}">${esc(x.name)}</div>`).join('')}</div>
      ${flipped ? board : ''}
      </div></body></html>`;
    let fr = document.getElementById('print-frame');
    if (fr) fr.remove();
    fr = document.createElement('iframe');
    fr.id = 'print-frame';
    fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(fr);
    const doc = fr.contentDocument;
    doc.open(); doc.write(html); doc.close();
    const go = () => { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) { toast('인쇄를 열 수 없어요', 'printer'); } };
    // 글꼴이 로드된 뒤 인쇄 (최대 1.5초 대기)
    let fired = false;
    const once = () => { if (!fired) { fired = true; go(); } };
    try { doc.fonts.ready.then(() => setTimeout(once, 150)); } catch (e) {}
    setTimeout(once, 1500);
  }
  function sendResults() {
    const results = {};
    S.room.result.filter(p => p.real).forEach(p => { results[p.id] = { rank: p.rank, seat: p.seat }; });
    Net.send('result', { results });
    toast('학생들에게 결과를 보냈어요', 'phone');
  }
  async function finish() {
    if (!(await UI.confirm('결과를 저장하고 방을 닫을까요?<br>학생들에게도 결과가 전송돼요.', { icon: 'chest', ok: '저장하고 끝내기' }))) return;
    const res = S.room.result || [];
    const seatMap = {}; res.forEach(p => { seatMap[p.seat] = p.name; });
    const bySeat = {}; seatsOf(S.layout).forEach(s => { bySeat[s.num] = s; });
    const partners = [];
    res.forEach(p => res.forEach(q => {
      if (p.seat >= q.seat) return;
      const a = bySeat[p.seat], b = bySeat[q.seat];
      if (a && b && a.r === b.r && Math.abs(a.c - b.c) === 1) partners.push([p.name, q.name]);
    }));
    const d = new Date();
    S.history.unshift({ date: `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`, mode: S.room.mode, seatMap, partners });
    S.history = S.history.slice(0, 20);
    sendResults();
    setTimeout(closeRoom, 400);
    toast('저장했어요!', 'chest');
  }

  // ================= 시작 =================
  renderGame();
  // 방이 열린 상태에서 새로고침해도 콘솔(비밀 메뉴)이 프로젝터에 노출되지 않도록 바로 발표 모드로
  if (S.room) { openChannel(); pushStage(true); enterStage(); }
})();
