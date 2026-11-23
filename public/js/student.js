// 학생 화면
(function () {
  const { $, $$, esc, icon, toast, show, statBars, radarSVG, uid, store } = UI;
  const G = GameData;
  const { STATS, STAT_NAME, CLASSES, TRAITS, EVENTS, PATHS, CHAPTERS, FLOW, TOTAL_STEPS } = G;
  const KEY = 'action-seat-student';
  const S = (n, o) => window.SFX && SFX.play(n, o);

  let me = store(KEY) || null; // {code, token, name, cls, stats, traits, step, done, gold, queue, used, usedR, cross, result}
  let phase = null;
  let welcomed = false;
  let helloTimer = null;
  let selectedClass = null;
  let lastUpdateSent = 0;

  let left = false;    // 방이 닫혔거나 내보내진 상태: 남은 타이머·메시지가 다시 저장하거나 화면을 바꾸지 못하게 함
  function save() { if (!left) store(KEY, me); }
  function leaveRoom() { left = true; Runner.close(); stopTimers(); clearInterval(helloTimer); store(KEY, null); Net.leave(); }

  // ---------- 소리 켜기/끄기 ----------
  $$('[data-sfx-toggle]').forEach(b => {
    b.querySelector('img').src = 'assets/icons/' + (SFX.muted ? 'mute' : 'sound') + '.png';
    b.addEventListener('click', () => { SFX.toggle(); if (!SFX.muted) S('pop'); });
  });

  // ---------- 접속 ----------
  const params = new URLSearchParams(location.search);
  const codeParam = params.get('code');
  if (codeParam) $('#code').value = codeParam;
  else if (me && me.code) $('#code').value = me.code;

  $('#code').addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6); });
  $('#code').addEventListener('keydown', e => { if (e.key === 'Enter') join(); });
  $('#btn-join').addEventListener('click', join);

  async function join() {
    if ($('#btn-join').disabled) return;
    const code = $('#code').value.trim();
    $('#join-err').textContent = '';
    if (!/^\d{6}$/.test(code)) { $('#join-err').textContent = '6자리 숫자 코드를 입력해 주세요.'; S('error'); return; }
    if (!me || me.code !== code) {
      me = { code, token: uid(), name: null, cls: null, stats: null, traits: {}, step: 0, done: false };
      save();
    }
    $('#btn-join').disabled = true;
    $('#btn-join').textContent = '연결 중…';
    try {
      // 태블릿 화면이 꺼졌다 켜지는 등 연결이 다시 붙으면 현재 상태를 다시 물어봄
      await Net.connect(code, onMessage, st => { if (st === 'SUBSCRIBED' && welcomed) sendHello(); });
    } catch (e) {
      $('#join-err').textContent = e.message;
      resetJoinBtn();
      return;
    }
    welcomed = false;
    sendHello();
    let tries = 0;
    clearInterval(helloTimer);
    helloTimer = setInterval(() => {
      if (welcomed) { clearInterval(helloTimer); return; }
      tries++;
      if (tries >= 3) {
        clearInterval(helloTimer);
        $('#join-err').textContent = '방을 찾을 수 없어요. 코드를 확인하거나 선생님께 물어보세요.';
        S('error');
        resetJoinBtn();
        return;
      }
      sendHello();
    }, 2500);
  }
  function resetJoinBtn() { $('#btn-join').disabled = false; $('#btn-join').textContent = '입장하기'; }
  function sendHello() { if (!left) Net.send('hello', { token: me.token }); }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && welcomed) sendHello(); });

  // ---------- 전체 화면 (태블릿에서 주소창을 숨겨 화면을 넓게) ----------
  const fsBtn = $('#fs-btn');
  if (document.fullscreenEnabled) {
    fsBtn.classList.remove('hidden');
    fsBtn.addEventListener('click', () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); });
  }

  if (codeParam || (me && me.code && me.name)) setTimeout(join, 150);

  // ---------- 메시지 ----------
  function onMessage(m) {
    if (left || (m.to && m.to !== me.token)) return;
    switch (m.type) {
      case 'welcome': return onWelcome(m);
      case 'claimResult': return onClaim(m);
      case 'room': return onRoom(m);
      case 'result': return onResult(m);
      case 'pickStart':
        if (me.pick && me.pick.id === m.pickId && me.pick.done) return;
        if (phase === 'pick' && me.pick && me.pick.id === m.pickId && $('#v-pick:not(.hidden)')) return; // 이미 고르는 중이면 다시 그리지 않음
        if (!me.pick || me.pick.id !== m.pickId) { me.pick = { id: m.pickId, rank: m.rank, cands: m.cands, done: false, revealed: false }; save(); }
        phase = 'pick';
        return route();
      case 'pickAck':
        me.pick = Object.assign(me.pick || {}, { done: true, name: m.name });
        save();
        if (phase === 'pick') route();
        return;
      case 'closed':
        leaveRoom();
        if (me.result) { $('#res-again').classList.remove('hidden'); return; }
        return showMsg('방이 닫혔어요', '선생님이 게임을 종료했어요.');
      case 'kick':
        leaveRoom();
        return showMsg('퇴장', '선생님이 참가를 취소했어요. 다시 입장해 주세요.');
      case 'ping':
        return sendHello();
    }
  }

  let roster = [], claimed = [], players = [];
  function onWelcome(m) {
    const prev = phase;
    phase = m.phase;
    if (welcomed) {
      // 다시 연결된 것뿐이면 풀던 문제를 처음부터 다시 시작하지 않음
      if (me.name && !m.known) Net.send('reclaim', profile());
      if (prev !== phase) enterPhase();
      return;
    }
    welcomed = true;
    if (m.mini !== undefined) miniOn = m.mini;
    clearInterval(helloTimer);
    resetJoinBtn();
    roster = m.roster || [];
    claimed = m.claimed || [];
    players = m.players || [];
    if (me.name && !m.known) Net.send('reclaim', profile());
    S('j_start');
    route();
  }

  function onRoom(m) {
    const prev = phase;
    phase = m.phase;
    claimed = m.claimed || claimed;
    const before = players.length;
    players = m.players || players;
    roster = m.roster || roster;
    if (m.mini !== undefined) miniOn = m.mini;
    if (!welcomed) return;
    renderMini();
    if ($('#v-name:not(.hidden)')) renderNames();
    if ($('#v-wait:not(.hidden)')) { renderMates(); if (players.length > before) S('pluck', { vary: .3 }); }
    if (prev !== phase) enterPhase();
  }
  function enterPhase() {
    if (Runner.isOpen && !miniOk()) { Runner.stop(); toast(phase === 'quest' ? '모험이 시작됐어요! 달리기는 끝!' : '선생님 화면을 보세요!', 'flag'); }
    if (phase === 'quest') S('j_chapter');
    if (phase === 'finale') { S('j_start'); if (me.pick || me.result) { me.pick = null; me.result = null; save(); } } // 다시 하는 결승전이면 이전 결과를 지움
    route();
  }

  function profile() {
    return { token: me.token, name: me.name, cls: me.cls, stats: me.stats, traits: me.traits, step: me.step, done: me.done, mini: me.mini || 0 };
  }

  // ---------- 기다리는 동안 미니게임 ----------
  let miniOn = true;
  const miniOk = () => miniOn && !left && me && me.cls && (phase === 'lobby' || (phase === 'quest' && me.done));
  const miniBoard = () => players.filter(p => p.cls && p.name !== me.name).map(p => ({ name: p.name, cls: p.cls, score: p.mini || 0 })).concat([{ name: me.name, cls: me.cls, score: me.mini || 0, me: true }]);
  function renderMini() {
    if (Runner.isOpen && !miniOk()) Runner.stop();
    Runner.refresh();
    $$('[data-mini]').forEach(box => {
      const on = miniOk(); box.classList.toggle('hidden', !on); if (!on) return;
      const top = miniBoard().filter(p => p.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
      const html = `<button class="btn big green" data-mini-go>${icon('shoe', 34)} 미니게임: 모험 달리기</button><div class="rn-board">${top.length ? '<ol>' + top.map((p, i) => `<li class="${p.me ? 'me' : ''}"><b>${i + 1}</b><img src="${CLASSES[p.cls].img}" alt=""><span>${esc(p.name)}</span><em>${p.score.toLocaleString()}</em></li>`).join('') + '</ol>' : ''}</div>`;
      if (box._html !== html) { box._html = html; box.innerHTML = html; }
    });
  }
  document.addEventListener('click', e => {
    if (!e.target.closest('[data-mini-go]') || !miniOk()) return;
    Runner.open({ cls: me.cls, name: me.name, best: me.mini || 0, board: miniBoard, onScore(s, rec) { if (!rec) return; me.mini = s; save(); sendUpdate(true); renderMini(); } });
  });
  function sendUpdate(force) {
    const now = Date.now();
    if (!force && now - lastUpdateSent < 300) return;
    lastUpdateSent = now;
    Net.send('update', profile());
  }

  // ---------- 라우팅 ----------
  function route() {
    if (!me.name) {
      if (phase === 'finale' || phase === 'pick' || phase === 'result') return showMsg('이미 진행 중이에요', '게임이 이미 결승전에 들어갔어요. 선생님께 말씀드려 주세요.');
      renderNames(); show('v-name'); return;
    }
    if (!me.cls && (phase === 'finale' || phase === 'pick' || phase === 'result')) {
      // 직업을 고르기 전에 결승전이 시작된 학생: 무작위 직업으로 참가 중
      stopTimers();
      if (phase === 'pick' && me.pick && !me.pick.done) { renderPick(); return show('v-pick'); }
      if (phase === 'result' && me.result) return renderResult();
      return showMsg('선생님 화면을 보세요!', '결승전이 이미 시작되어 무작위 캐릭터로 참가하고 있어요.');
    }
    if (!me.cls) {
      if (!me.introDone) { renderIntro(); show('v-intro'); return; }
      renderClasses(); show('v-class'); return;
    }
    if (phase === 'lobby') { renderWait(); show('v-wait'); return; }
    if (phase === 'quest') {
      if (me.done) { renderDone('wait'); show('v-done'); }
      else { show('v-quest'); renderQuest(); }
      return;
    }
    if (phase === 'finale') { stopTimers(); renderDone('finale'); show('v-done'); return; }
    if (phase === 'pick') {
      stopTimers();
      if (me.pick && !me.pick.done) { renderPick(); show('v-pick'); }
      else { renderDone('pick'); show('v-done'); }
      return;
    }
    if (phase === 'result') {
      stopTimers();
      if (me.result) renderResult(); else { renderDone('finale'); show('v-done'); }
    }
  }

  // ---------- 이름 ----------
  function renderNames() {
    const grid = $('#name-grid');
    if (roster.length) {
      $('#name-free').classList.add('hidden');
      grid.classList.remove('hidden');
      const html = roster.map(n => `<button class="name-btn" data-n="${esc(n)}" ${claimed.includes(n) ? 'disabled' : ''}>${esc(n)}</button>`).join('');
      if (grid._html === html) return;
      grid._html = html; grid.innerHTML = html;
      $$('.name-btn', grid).forEach(b => b.addEventListener('click', async () => {
        S('open');
        const ok = await UI.confirm(`<b>${esc(b.dataset.n)}</b> 맞나요?<br>다른 친구 이름을 고르면 안 돼요!`, { icon: 'group', ok: '네, 저예요' });
        if (ok) Net.send('claim', { token: me.token, name: b.dataset.n });
      }));
    } else {
      grid.classList.add('hidden');
      $('#name-free').classList.remove('hidden');
    }
  }
  $('#btn-name').addEventListener('click', () => {
    const n = $('#name-input').value.trim();
    if (!n) return toast('이름을 입력해 주세요');
    Net.send('claim', { token: me.token, name: n });
  });
  function onClaim(m) {
    if (!m.ok) { S('error'); toast(m.reason || '이미 선택된 이름이에요', 'lock'); return; }
    me.name = m.name;
    save();
    S('levelup', { vol: .6 });
    route();
  }

  // ---------- 게임 설명 (한 장씩 넘기기) ----------
  const flowStep = (ic, t) => `<div class="fl-step">${icon(ic, 44)}<span>${t}</span></div>`;
  const INTRO = [
    () => `<div class="in-l"><div class="in-hero"><img src="assets/title_bg.jpg" alt=""><div class="in-hero-t"><span class="grad-text">액션 자리뽑기</span></div></div></div>
      <div class="in-r"><h2 class="in-title">모험을 떠나 자리를 차지하라!</h2>
      <p class="in-text">캐릭터를 골라 모험을 하면서 <b>능력치</b>를 키우고, 마지막 <b>최종 결전</b>에서 좋은 등수를 노려 보세요.</p>
      <div class="flow">${flowStep('shield', '직업 선택')}<i>▶</i>${flowStep('map', `모험 ${TOTAL_STEPS}단계`)}<i>▶</i>${flowStep('swords', '최종 결전')}<i>▶</i>${flowStep('desk', '자리 발표')}</div></div>`,
    () => `<div class="in-l"><h2 class="in-title">${icon('shield', 34)} 직업과 능력치</h2>
      <div class="in-classes">${Object.values(CLASSES).map(c => `<div><img src="${c.img}" alt=""><small>${c.name}</small></div>`).join('')}</div>
      <p class="in-text">직업마다 처음 능력치가 달라요. 능력치는 5가지예요.</p></div>
      <div class="in-r"><div class="in-stats">
        <div>${icon('str', 30)}<b>힘</b><span>배틀, 바위 깨기</span></div>
        <div>${icon('agi', 30)}<b>민첩</b><span>레이스에서 가장 중요</span></div>
        <div>${icon('int', 30)}<b>지능</b><span>배틀, 퍼즐 판정</span></div>
        <div>${icon('luk', 30)}<b>행운</b><span>레이스, 행운 판정</span></div>
        <div>${icon('vit', 30)}<b>체력</b><span>배틀에서 끝까지 버티기</span></div>
      </div></div>`,
    () => `<div class="in-l"><h2 class="in-title">${icon('compass', 34)} 갈림길에서 길 고르기</h2>
      <img class="in-scene" src="assets/scenes/s_crossroads.jpg" alt=""></div><div class="in-r">
      <p class="in-text">모험 중 <b>갈림길</b>이 3번 나와요. 고른 길에 따라 만나는 사건이 달라져서 친구마다 모험이 달라요.</p>
      <div class="in-paths">${['safe', 'brain', 'market', 'risk'].map(k => { const p = PATHS[k]; return `<div class="in-path">${icon(p.icon, 34)}<b>${p.name}</b><span class="stars">${'★'.repeat(p.risk)}<em>${'★'.repeat(3 - p.risk)}</em></span></div>`; }).join('')}</div>
      <div class="in-note">${icon('star', 28)}<span><b>별이 많을수록</b> 능력치를 크게 얻을 수 있지만, <b>잃을 수도 있고</b> 더 많은 노력이 필요해요!</span></div></div>`,
    () => `<div class="in-l"><h2 class="in-title">${icon('dice', 34)} 주사위 판정</h2>
      <div class="in-dice"><div class="d20 ok"><span>17</span></div><div class="in-dice-eq">주사위 17 + 보너스 3<br>= <b>20</b> (목표 12)<br><b class="ok-t">성공!</b></div></div></div>
      <div class="in-r"><p class="in-text">선택지에 <span class="ctag">${icon('str', 18)}힘 판정 ★★</span> 이 붙어 있으면 주사위를 굴려요.</p>
      <ul class="in-list">
        <li><b>주사위(1~20) + 능력치 보너스</b>가 목표보다 크거나 같으면 성공!</li>
        <li>별이 많을수록 목표 숫자가 높아요(어려워요).</li>
        <li><b class="crit-t">20</b>이 나오면 대성공, <b class="bad-t">1</b>이 나오면 대실패!</li>
        <li>실패하면 능력치가 깎이기도 해요.</li>
      </ul></div>`,
    () => `<div class="in-l"><h2 class="in-title">${icon('coin', 34)} 골드와 퍼즐</h2>
      <div class="in-note">${icon('coin', 40)}<span>사건에서 <b>골드</b>를 모아 상점에서 아이템을 사거나 도박을 할 수 있어요. 남은 골드는 마지막에 <b>행운</b>으로 바뀌어요.</span></div></div>
      <div class="in-r"><div class="in-icons">
        <div>${icon('puzzle', 40)}<small>10 만들기</small></div><div>${icon('scroll', 40)}<small>초성 퀴즈</small></div><div>${icon('bulb', 40)}<small>창의력</small></div>
        <div>${icon('card', 40)}<small>짝 맞추기</small></div><div>${icon('str', 40)}<small>바위 깨기</small></div><div>${icon('tap', 40)}<small>슬라임 잡기</small></div>
      </div>
      <p class="in-text">퍼즐과 미니게임은 <b>시간을 들여 잘 풀수록</b> 능력치가 많이 올라요. 서두르지 말고 끝까지 도전해 보세요!</p></div>`,
    () => `<div class="in-l"><h2 class="in-title">${icon('swords', 34)} 최종 결전</h2>
      <div class="in-hero sm"><img src="assets/arena_bg.jpg" alt=""><div class="in-runners">${['warrior', 'mage', 'archer', 'thief'].map(k => `<img src="${CLASSES[k].anim}run.webp" alt="">`).join('')}</div></div></div>
      <div class="in-r"><p class="in-text">모두 모험을 마치면 <b>선생님 화면</b>에서 <b>레이스</b> 또는 <b>배틀로얄</b>이 펼쳐져요.</p>
      <ul class="in-list">
        <li>내가 키운 <b>능력치를 바탕으로 등수</b>가 정해져요. (운도 조금 작용해요!)</li>
        <li>레이스는 <b>민첩·행운</b>, 배틀은 <b>힘·지능·체력</b>이 특히 중요해요.</li>
      </ul></div>`,
    () => `<div class="in-l"><h2 class="in-title">${icon('desk', 34)} 등수대로 자리 발표</h2>
      <div class="in-podium"><div class="p2">${icon('silver', 50)}<b>2등</b><span>2번 자리</span></div><div class="p1">${icon('trophy', 60)}<b>1등</b><span>1번 자리</span></div><div class="p3">${icon('bronze', 50)}<b>3등</b><span>3번 자리</span></div></div></div>
      <div class="in-r"><p class="in-text">등수가 높을수록 먼저 자리를 받아요. <b>1등은 1번 자리</b>, 2등은 2번 자리…<br>자리 번호는 선생님이 미리 정해 둔 순서예요. 몇 번이 어느 자리인지는 결과가 나올 때 알 수 있어요!</p></div>`,
    () => `<div class="in-l"><h2 class="in-title">${icon('heart', 34)} 1·2·3등 특별 보상</h2>
      <div class="in-plates"><div class="pk-plate"><span class="pk-name">? ? ?</span></div><div class="pk-plate"><span class="pk-name">? ? ?</span></div><div class="pk-plate"><span class="pk-name">? ? ?</span></div></div></div>
      <div class="in-r"><p class="in-text">1~3등은 <b>짝꿍을 고를 수 있어요!</b> 무작위로 뽑힌 후보가 번호판처럼 공개되고, 그중 한 명을 골라요.</p>
      <div class="in-bonus"><div>${icon('trophy', 36)}<b>1등</b><span>후보 5명</span></div><div>${icon('silver', 36)}<b>2등</b><span>후보 4명</span></div><div>${icon('bronze', 36)}<b>3등</b><span>후보 3명</span></div></div>
      <p class="in-text muted">고른 친구는 내 짝 자리에 앉아요. 자, 이제 직업을 골라 볼까요?</p></div>`
  ];
  let introIdx = 0;
  function renderIntro(dir) {
    introIdx = Math.max(0, Math.min(INTRO.length - 1, introIdx));
    const st = $('#intro-stage');
    st.innerHTML = `<div class="intro-slide panel ${dir === 'back' ? 'from-left' : 'from-right'}">${INTRO[introIdx]()}</div>`;
    $('#intro-count').textContent = `게임 설명 ${introIdx + 1} / ${INTRO.length}`;
    $('#intro-dots').innerHTML = INTRO.map((_, i) => `<i class="${i === introIdx ? 'on' : ''}"></i>`).join('');
    $('#intro-prev').style.visibility = introIdx ? 'visible' : 'hidden';
    const last = introIdx === INTRO.length - 1;
    $('#intro-next').innerHTML = last ? '직업 고르기 ▶' : '다음 ▶';
    $('#intro-next').classList.toggle('green', last);
    $('#intro-skip').style.visibility = last ? 'hidden' : 'visible';
    window.scrollTo(0, 0);
  }
  function finishIntro() { me.introDone = true; save(); try { localStorage.setItem('action-seat-intro-seen', '1'); } catch (e) {} S('confirm'); route(); }
  // 전에 설명을 본 적 있는 학생에게는 건너뛰기 버튼을 눈에 띄게
  try { if (localStorage.getItem('action-seat-intro-seen')) { $('#intro-skip').className = 'btn small'; $('#intro-skip').textContent = '이미 알아요! 건너뛰기 ▶▶'; } } catch (e) {}
  $('#intro-next').addEventListener('click', () => { if (introIdx >= INTRO.length - 1) return finishIntro(); introIdx++; S('page', { vol: .6 }); renderIntro(); });
  $('#intro-prev').addEventListener('click', () => { introIdx--; S('page', { vol: .6, rate: .9 }); renderIntro('back'); });
  $('#intro-skip').addEventListener('click', finishIntro);
  $('#intro-again').addEventListener('click', () => { me.introDone = false; introIdx = 0; save(); route(); });
  { // 좌우로 밀어서 넘기기
    let sx = null;
    const stg = $('#intro-stage');
    stg.addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive: true });
    stg.addEventListener('touchend', e => {
      if (sx == null) return;
      const dx = e.changedTouches[0].clientX - sx; sx = null;
      if (Math.abs(dx) < 50) return;
      if (dx < 0 && introIdx < INTRO.length - 1) $('#intro-next').click();
      else if (dx > 0 && introIdx > 0) $('#intro-prev').click();
    });
  }

  // ---------- 직업 ----------
  function renderClasses() {
    $('#hello-name').textContent = me.name;
    const grid = $('#class-grid');
    grid.innerHTML = Object.entries(CLASSES).map(([k, c], i) => `
      <div class="class-card pop-in" data-k="${k}" style="animation-delay:${i * 60}ms">
        <img class="portrait" style="--c:${c.color}" src="${c.anim}idle.webp" alt="${c.name}">
        <div class="cname">${c.name}</div>
        <div class="cdesc">${c.desc}</div>
        <div class="cstats">${STATS.map(s => `<span>${icon(s.key, 18)}${c.base[s.key]}</span>`).join('')}</div>
      </div>`).join('');
    $$('.class-card', grid).forEach(card => card.addEventListener('click', () => {
      // 고른 캐릭터는 기술 동작을 보여 줌
      $$('.class-card', grid).forEach(c => { c.classList.remove('sel'); const im = $('.portrait', c), k = c.dataset.k, want = CLASSES[k].anim + (c === card ? 'act' : 'idle') + '.webp'; if (im.getAttribute('src') !== want) im.src = want; });
      card.classList.add('sel');
      S('select');
      selectedClass = card.dataset.k;
      $('#btn-class').disabled = false;
      $('#btn-class').innerHTML = `${icon('swords', 30)} ${CLASSES[selectedClass].name}(으)로 결정!`;
    }));
  }
  $('#btn-class').addEventListener('click', () => {
    if (!selectedClass) return;
    S('sword');
    me.cls = selectedClass;
    me.stats = Object.assign({}, CLASSES[selectedClass].base);
    me.traits = {};
    me.step = 0;
    me.done = false;
    me.gold = 3;
    me.queue = FLOW.slice();
    me.used = [];
    me.usedR = [];
    me.cross = null;
    save();
    sendUpdate(true);
    route();
  });

  // 움직이는 캐릭터 그림
  function setAnim(sel, cls, name) { const el = $(sel), c = CLASSES[cls], src = c.anim + name + '.webp'; el.classList.add('anim'); el.style.setProperty('--c', c.color); if (el.getAttribute('src') !== src) el.src = src; }

  // ---------- 대기실 ----------
  function renderWait() {
    const c = CLASSES[me.cls];
    setAnim('#wait-img', me.cls, 'idle');
    $('#wait-name').textContent = me.name;
    $('#wait-cls').innerHTML = `${icon('shield', 22)} ${c.name}`;
    renderMates(); renderMini();
  }
  function renderMates() {
    const html = players.filter(p => p.cls).map(p => `
      <div class="mate"><img class="avatar sm" src="${CLASSES[p.cls].img}" alt=""><span>${esc(p.name)}</span></div>`).join('');
    if ($('#mates')._html !== html) { $('#mates')._html = html; $('#mates').innerHTML = html; }
  }

  // ================= 모험 =================
  let typing = null;
  const timers = new Set();
  function later(fn, ms) { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; }
  function every(fn, ms) { const t = setInterval(fn, ms); timers.add(t); return t; }
  let rafId = null;
  function stopTimers() { timers.forEach(t => { clearTimeout(t); clearInterval(t); }); timers.clear(); cancelAnimationFrame(rafId); clearInterval(typing); }

  const rnd = n => Math.floor(Math.random() * n);
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const randStat = () => STATS[rnd(5)].key;

  function chipsHTML(gain, gold) {
    const list = Object.entries(gain || {}).filter(([, v]) => v).map(([k, v], i) =>
      `<span class="gain-chip ${v < 0 ? 'neg' : ''}" style="animation-delay:${i * 90}ms">${icon(k, 24)}${STAT_NAME[k]} ${v > 0 ? '+' : ''}${v}</span>`);
    if (gold) list.push(`<span class="gain-chip gold ${gold < 0 ? 'neg' : ''}" style="animation-delay:${list.length * 90}ms">${icon('coin', 24)}골드 ${gold > 0 ? '+' : ''}${gold}</span>`);
    return list.join('');
  }
  function applyGain(gain) {
    const real = {};
    Object.entries(gain || {}).forEach(([k, v]) => {
      const before = me.stats[k] || 0;
      me.stats[k] = Math.max(1, before + v);
      if (me.stats[k] !== before) real[k] = me.stats[k] - before;
    });
    return real;
  }
  function renderHud(changed) {
    const c = CLASSES[me.cls];
    $('#hud-img').src = c.img;
    $('#hud-name').textContent = me.name;
    $('#hud-title').textContent = G.titleOf(me.cls, me.traits);
    $('#hud-stats').innerHTML = STATS.map(s => `<span class="${changed && changed[s.key] ? (changed[s.key] > 0 ? 'up' : 'down') : ''}" title="${s.name}">${icon(s.key, 20)}${me.stats[s.key]}</span>`).join('') +
      `<span class="gold ${changed && changed.gold ? 'up' : ''}" title="골드">${icon('coin', 20)}${me.gold || 0}</span>`;
  }
  const TYPE_LABEL = {
    choice: ['map', '모험'], psych: ['thought', '마음의 질문'], riddle: ['lock', '수수께끼'], levelup: ['levelup', '레벨업'],
    timing: ['target', '미니게임'], tap: ['tap', '미니게임'], chest: ['chest', '행운'], shop: ['coin', '상점'], gamble: ['dice', '도박'],
    fortune: ['crystal', '점술'], make10: ['puzzle', '두뇌 퍼즐'], chosung: ['scroll', '고대 문자'], uses: ['bulb', '창의력'],
    memory: ['card', '기억력'], slide: ['puzzle', '퍼즐'], cross: ['compass', '갈림길'], boss: ['crown', '최종 결전']
  };

  function typeText(el, text, done) {
    clearInterval(typing);
    let i = 0;
    el.innerHTML = '<span></span><span class="ghost"></span>';
    const [a, b] = el.children;
    b.textContent = text;
    const finish = () => { clearInterval(typing); typing = null; el.textContent = text; el.onclick = null; done && done(); };
    el.onclick = finish;
    typing = setInterval(() => {
      i += 2;
      if (i % 6 === 0) S('type', { vary: .4, gap: 0 });
      a.textContent = text.slice(0, i); b.textContent = text.slice(i);
      if (i >= text.length) finish();
    }, 22);
  }

  // 결과 r: {gain, gold, msg, trait, icon, good}
  let stepDone = false;
  function completeStep(r) {
    if (stepDone) return;
    stepDone = true;
    r = r || {};
    stopTimers();
    const real = applyGain(r.gain);
    let gold = r.gold || 0;
    if (gold < 0) gold = -Math.min(me.gold || 0, -gold);
    me.gold = (me.gold || 0) + gold;
    if (r.trait) me.traits[r.trait] = (me.traits[r.trait] || 0) + 1;
    const ev = EVENTS[me.queue[me.step]];
    let extra = '';
    if (ev && ev.epilogue && me.gold > 0) {
      const add = Math.floor(me.gold / 2);
      if (add) { me.stats.luk += add; real.luk = (real.luk || 0) + add; }
      extra = `남은 ${me.gold}골드가 행운 +${add}(으)로 바뀌었다!`;
      gold -= me.gold; me.gold = 0;
    }
    me.step++;
    if (me.step >= TOTAL_STEPS) me.done = true;
    save();
    sendUpdate(true);
    const changed = Object.assign({}, real, gold ? { gold } : {});
    renderHud(changed);
    const neg = Object.values(real).some(v => v < 0) && !Object.values(real).some(v => v > 0);
    const good = r.good != null ? r.good : !neg;
    if (Object.keys(real).length || gold) later(() => S(good ? 'gain' : 'wrong', { vol: .7 }), 120);
    if (gold > 0) later(() => S('coin'), 260);
    const body = $('#q-right');
    $('#q-body').classList.add('resolved');
    const box = document.createElement('div');
    box.className = 'result-box';
    box.innerHTML = `${r.msg ? `<div class="result-msg ${good ? '' : 'bad'}">${r.icon ? icon(r.icon, 30) : ''}<span>${esc(r.msg)}</span></div>` : ''}
      ${extra ? `<div class="result-msg">${icon('luk', 26)}<span>${esc(extra)}</span></div>` : ''}
      <div class="gain-chips">${chipsHTML(real, gold)}</div>
      <button class="btn big" style="width:100%;margin-top:16px">${me.done ? `${icon('trophy', 30)} 모험 완료!` : '다음으로'}</button>`;
    body.appendChild(box);
    box.querySelector('button').addEventListener('click', e => {
      if (e.currentTarget.disabled) return;
      e.currentTarget.disabled = true;
      if (me.done) { S('j_good'); renderDone('wait'); show('v-done'); }
      else renderQuest();
    });
    later(() => box.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60);
  }

  function header(typeKey, title, scene, text, after) {
    const [ti, tl] = TYPE_LABEL[typeKey] || ['map', ''];
    $('#q-num').textContent = `QUEST ${me.step + 1} / ${TOTAL_STEPS}`;
    $('#q-type').innerHTML = `${icon(ti, 22)} ${tl}`;
    $('#q-prog').style.width = (me.step / TOTAL_STEPS * 100) + '%';
    $('#q-body').className = 'type-' + typeKey;
    $('#q-body').innerHTML = `
      <div class="q-left">
        <div class="scene-wrap"><img class="scene-img" src="assets/scenes/${scene}.jpg" alt=""></div>
        <div class="quest-title grad-text">${esc(title)}</div>
        <div class="quest-text" id="q-text"></div>
      </div>
      <div class="q-right" id="q-right"><div id="q-inter"></div></div>`;
    window.scrollTo(0, 0);
    typeText($('#q-text'), text, after);
  }

  function renderQuest() {
    if (phase !== 'quest') return route();
    stopTimers();
    stepDone = false;
    if (!me.queue) { me.queue = FLOW.slice(); me.used = me.used || []; me.usedR = me.usedR || []; me.gold = me.gold || 0; }
    renderHud();
    const id = me.queue[me.step];
    if (!id) { me.done = true; save(); sendUpdate(true); return route(); }
    S('page', { vol: .6 });
    if (id[0] === 'X') return crossroads(+id.slice(1));
    const q = EVENTS[id];
    if (q.type === 'riddle') {
      if (me.riddleAt !== me.step) { me.riddleIdx = pickRiddle(); me.riddleAt = me.step; save(); }
      const R = G.RIDDLES[me.riddleIdx];
      return header('riddle', q.title, q.scene, R.q, () => riddle($('#q-inter'), R));
    }
    header(q.boss ? 'boss' : q.type, q.title, q.scene, q.text, () => interact(q));
  }
  function pickRiddle() {
    const left = G.RIDDLES.map((_, i) => i).filter(i => !me.usedR.includes(i));
    const i = left.length ? left[rnd(left.length)] : rnd(G.RIDDLES.length);
    me.usedR.push(i);
    return i;
  }

  function interact(q) {
    const box = $('#q-inter');
    switch (q.type) {
      case 'choice': case 'psych': return choices(box, q);
      case 'levelup': return levelUp(box, q.points);
      case 'timing': return timingGame(box);
      case 'tap': return tapGame(box);
      case 'chest': return chestGame(box);
      case 'shop': return shopGame(box);
      case 'gamble': return gambleGame(box);
      case 'fortune': return fortuneGame(box);
      case 'make10': return make10Game(box);
      case 'chosung': return chosungGame(box);
      case 'uses': return usesGame(box);
      case 'memory': return memoryGame(box);
      case 'slide': return slideGame(box);
    }
  }

  // ---------- 갈림길 ----------
  function crossroads(n) {
    const ch = CHAPTERS[n];
    if (!me.cross || me.cross.n !== n) { me.cross = { n, opts: shuffle(Object.keys(PATHS)).slice(0, 3) }; save(); }
    S('j_chapter', { vol: .7 });
    header('cross', ch.name, ch.scene, ch.text, () => {
      const box = $('#q-inter');
      box.innerHTML = `<div class="path-grid">${me.cross.opts.map((k, i) => {
        const p = PATHS[k];
        return `<button class="path-card" data-k="${k}" style="animation-delay:${i * 90}ms">
          ${icon(p.icon, 54)}<b>${p.name}</b><small>${p.desc}</small>
          <span class="risk">위험도·보상 <span class="stars">${'★'.repeat(p.risk)}<em>${'★'.repeat(3 - p.risk)}</em></span></span></button>`;
      }).join('')}</div>`;
      $$('.path-card', box).forEach(b => b.addEventListener('click', () => {
        $$('.path-card', box).forEach(x => { x.disabled = true; if (x !== b) x.classList.add('dim'); });
        b.classList.add('picked');
        S('door');
        const k = b.dataset.k;
        const ids = drawEvents(k);
        me.queue.splice(me.step + 1, 0, ...ids);
        me.cross = null;
        completeStep({ msg: `${PATHS[k].name}(으)로 들어섰다!`, icon: PATHS[k].icon });
      }));
    });
  }
  function drawEvents(k) {
    const n = G.EVENTS_PER_PATH, out = [];
    const ok = id => !out.includes(id) && (!me.used.includes(id) || EVENTS[id].repeat);
    const fresh = id => !out.includes(id) && !me.used.includes(id);
    const pool = shuffle(PATHS[k].pool);
    pool.filter(fresh).forEach(id => { if (out.length < n) out.push(id); });
    pool.filter(ok).forEach(id => { if (out.length < n) out.push(id); });
    if (out.length < n) shuffle(Object.keys(PATHS).flatMap(p => PATHS[p].pool)).filter(fresh).forEach(id => { if (out.length < n) out.push(id); });
    while (out.length < n) out.push('riddle');
    out.forEach(id => me.used.push(id));
    return out;
  }

  // ---------- 주사위 판정 ----------
  const dcStars = dc => dc <= 10 ? 1 : dc <= 12 ? 2 : dc <= 14 ? 3 : 4;
  function bonusOf(stat) { return Math.floor((me.stats[stat] || 0) / 3); }
  function rollCheck(box, check, cb) {
    const bonus = bonusOf(check.stat);
    box.insertAdjacentHTML('beforeend', `
      <div class="dice-panel pop-in">
        <div class="dice-head">${icon(check.stat, 28)} ${STAT_NAME[check.stat]} 판정 · 목표 <b>${check.dc}</b></div>
        <div class="d20" id="d20"><span>?</span></div>
        <div class="dice-sub">주사위(1~20) + ${STAT_NAME[check.stat]} 보너스 <b>${bonus}</b></div>
        <button class="btn big" id="roll-btn" style="width:100%">${icon('dice', 32)} 주사위 굴리기!</button>
      </div>`);
    box.classList.add('rolling-check');
    const panel = box.lastElementChild;
    panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    $('#roll-btn', panel).addEventListener('click', e => {
      e.currentTarget.disabled = true;
      e.currentTarget.style.display = 'none';
      S('diceshake');
      const face = $('#d20 span', panel), die = $('#d20', panel);
      die.classList.add('rolling');
      const roll = 1 + rnd(20);
      let k = 0;
      const iv = every(() => { face.textContent = 1 + rnd(20); if (k++ % 2) S('tick', { vol: .3, gap: 0 }); }, 60);
      later(() => {
        clearInterval(iv); timers.delete(iv);
        S('dicethrow');
        die.classList.remove('rolling');
        face.textContent = roll;
        const total = roll + bonus;
        const crit = roll === 20, fumble = roll === 1;
        const ok = crit || (!fumble && total >= check.dc);
        die.classList.add(ok ? 'ok' : 'fail');
        if (crit) die.classList.add('crit');
        $('.dice-sub', panel).innerHTML = crit ? '<b class="crit-t">대성공!!</b> 20이 나왔다!'
          : fumble ? '<b class="bad-t">대실패…</b> 1이 나왔다!'
          : `${roll} + ${bonus} = <b>${total}</b> ${ok ? '≥' : '<'} ${check.dc} → <b class="${ok ? 'ok-t' : 'bad-t'}">${ok ? '성공!' : '실패…'}</b>`;
        later(() => S(ok ? (crit ? 'j_good' : 'right') : 'j_fail'), 150);
        later(() => cb(ok, crit), 900);
      }, 1000);
    });
  }
  function critBoost(gain) { const g = Object.assign({}, gain); Object.keys(g).forEach(k => { if (g[k] > 0) g[k] += 1; }); return g; }

  // ---------- 선택지 ----------
  function choices(box, q) {
    box.innerHTML = `<div class="choices">${q.choices.map((c, i) => {
      const tags = [];
      if (c.check) tags.push(`<span class="ctag">${icon(c.check.stat, 18)}${STAT_NAME[c.check.stat]} 판정 ${'★'.repeat(dcStars(c.check.dc))}</span>`);
      if (c.cost) tags.push(`<span class="ctag gold">${icon('coin', 18)}${c.cost}골드</span>`);
      const lack = c.cost && (me.gold || 0) < c.cost;
      return `<button class="choice-btn" style="animation-delay:${i * 70}ms" data-i="${i}" ${lack ? 'disabled' : ''}>${esc(c.label)}${tags.length ? `<span class="ctags">${tags.join('')}</span>` : ''}${lack ? '<small class="lack">골드가 부족해요</small>' : ''}</button>`;
    }).join('')}</div>`;
    $$('.choice-btn', box).forEach(b => b.addEventListener('click', () => {
      $$('.choice-btn', box).forEach(x => x.disabled = true);
      b.classList.add('picked');
      S('select');
      const c = q.choices[+b.dataset.i];
      if (q.type === 'psych') return completeStep({ gain: c.gain, gold: c.gold, msg: '당신의 마음이 캐릭터에 새겨졌다…', trait: c.trait, icon: TRAITS[c.trait].icon });
      if (c.check) {
        return rollCheck(box, c.check, (ok, crit) => {
          const r = ok ? c.ok : c.fail;
          completeStep({ gain: crit ? critBoost(r.gain) : r.gain, gold: (r.gold || 0) + (crit && r.gold > 0 ? 1 : 0), msg: r.msg, trait: c.trait, icon: ok ? 'star' : 'thought', good: ok });
        });
      }
      completeStep({ gain: c.gain, gold: (c.gold || 0) - (c.cost || 0), msg: c.msg, trait: c.trait, icon: 'star' });
    }));
  }

  // ---------- 수수께끼 ----------
  function riddle(box, R) {
    box.innerHTML = `<div class="choices">${R.options.map((o, i) => `<button class="choice-btn" style="animation-delay:${i * 70}ms" data-i="${i}">${esc(o)}</button>`).join('')}</div>`;
    $$('.choice-btn', box).forEach(b => b.addEventListener('click', () => {
      const btns = $$('.choice-btn', box);
      btns.forEach(x => x.disabled = true);
      const ok = +b.dataset.i === R.answer;
      b.classList.add(ok ? 'right' : 'wrong');
      btns[R.answer].classList.add('right');
      if (!ok) b.classList.add('shake');
      S(ok ? 'right' : 'wrong');
      completeStep(ok ? { gain: { int: 3 }, gold: 1, msg: '정답! ' + R.why, icon: 'key' } : { gain: { luk: 1 }, msg: '아쉽다! ' + R.why, icon: 'lock', good: false });
    }));
  }

  // ---------- 레벨업 ----------
  function levelUp(box, points) {
    S('levelup');
    const add = { str: 0, agi: 0, int: 0, luk: 0, vit: 0 };
    let left = points;
    function draw() {
      box.innerHTML = `<div class="points-left">${left ? '남은 포인트 ' + Array.from({ length: left }, () => icon('star', 30, 'pop-in')).join('') : '포인트를 모두 찍었어요!'}</div>
        ${STATS.map(s => `<div class="lv-row"><span class="ln">${icon(s.key, 26)} ${s.name}</span>
          <div class="stat-bar"><i style="width:${Math.min(100, (me.stats[s.key] + add[s.key]) / 30 * 100)}%;--c:${s.color}"></i></div>
          <button class="lv-minus" data-k="${s.key}" data-d="-1" data-nosfx>−</button>
          <button class="lv-plus" data-k="${s.key}" data-d="1" data-nosfx>+</button>
          <span style="text-align:right" class="display">${me.stats[s.key] + add[s.key]}${add[s.key] ? `<small style="color:var(--gold)"> +${add[s.key]}</small>` : ''}</span></div>`).join('')}
        <button class="btn big" id="lv-ok" style="width:100%;margin-top:12px" ${left ? 'disabled' : ''}>능력치 확정!</button>`;
      $$('button[data-k]', box).forEach(b => b.addEventListener('click', () => {
        const k = b.dataset.k, d = +b.dataset.d;
        if (d > 0 && left > 0) { add[k]++; left--; S('pop', { rate: 1 + (points - left) * .08, gap: 0 }); }
        else if (d < 0 && add[k] > 0) { add[k]--; left++; S('back', { gap: 0 }); }
        else S('error');
        draw();
      }));
      $('#lv-ok', box).addEventListener('click', () => { box.innerHTML = ''; S('power'); completeStep({ gain: add, msg: '능력치가 상승했다!', icon: 'levelup' }); });
    }
    draw();
  }

  // ---------- 바위 깨기 (타이밍) ----------
  // 프레임 속도와 무관하게 시간 기준으로 바늘을 움직이고, 판정 구역은 매번 무작위 위치로 바뀝니다.
  function timingGame(box) {
    let tries = 0, total = 0, busy = false, t0 = 0, speed = 0, zone = null;
    box.innerHTML = `
      <div class="timing-track" id="tm-track"><div class="timing-zone" id="tm-zone"></div><div class="timing-zone perfect" id="tm-perf"></div><div class="timing-needle" id="needle"></div></div>
      <div class="tm-dots" id="tm-dots"><i></i><i></i><i></i></div>
      <div class="center" style="font-family:Jua;font-size:20px" id="tm-info">남은 기회: 3번</div>
      <button class="btn big" id="tm-hit" style="width:100%;margin-top:10px" data-nosfx>${icon('str', 32)} 내려치기!</button>`;
    const needle = $('#needle', box), track = $('#tm-track', box);
    function newRound() {
      const w = 26 - tries * 4;                       // 26% → 22% → 18%
      const L = 4 + Math.random() * (92 - w);
      zone = { L, W: w, pL: L + w / 2 - 3.5, pW: 7 };
      $('#tm-zone', box).style.cssText = `left:${zone.L}%;width:${zone.W}%`;
      $('#tm-perf', box).style.cssText = `left:${zone.pL}%;width:${zone.pW}%`;
      speed = 0.55 + tries * 0.18 + Math.random() * 0.15; // 초당 왕복 횟수
      t0 = performance.now() - Math.random() * 1000;
      busy = false;
    }
    function posAt(now) { const ph = ((now - t0) / 1000 * speed) % 1; return (ph < .5 ? ph * 2 : 2 - ph * 2) * 100; }
    function loop(now) {
      if (!busy) needle.style.left = `calc(${posAt(now)}% - 3px)`;
      rafId = requestAnimationFrame(loop);
    }
    newRound();
    rafId = requestAnimationFrame(loop);
    $('#tm-hit', box).addEventListener('click', () => {
      if (busy || tries >= 3) return;
      busy = true;
      const pos = posAt(performance.now());
      needle.style.left = `calc(${pos}% - 3px)`;
      tries++;
      let pts = 0, label = 'MISS', cls = 'miss';
      if (pos >= zone.pL && pos <= zone.pL + zone.pW) { pts = 2; label = 'PERFECT!'; cls = 'perfect'; S('rock2'); S('crash', { vol: .5 }); }
      else if (pos >= zone.L && pos <= zone.L + zone.W) { pts = 1; label = 'GOOD'; cls = 'good'; S('rock'); }
      else S('whiff');
      total += pts;
      track.insertAdjacentHTML('beforeend', `<div class="tm-mark ${cls}" style="left:${pos}%"><span>${label}</span></div>`);
      track.classList.remove('hitfx'); void track.offsetWidth; track.classList.add('hitfx');
      $$('#tm-dots i', box)[tries - 1].className = cls;
      $('#tm-info', box).textContent = tries < 3 ? `남은 기회: ${3 - tries}번 (현재 ${total}점)` : `결과: ${total}점 / 6점`;
      if (tries < 3) { later(() => { $$('.tm-mark', box).forEach(m => m.remove()); newRound(); }, 900); return; }
      $('#tm-hit', box).disabled = true;
      later(() => {
        cancelAnimationFrame(rafId);
        if (total === 0) completeStep({ gain: { vit: -1 }, msg: '바위가 꿈쩍도 안 했다… 돌아가느라 지쳤다.', icon: 'thought', good: false });
        else if (total <= 2) completeStep({ gain: { str: total }, msg: '바위에 금이 갔다. 겨우 틈으로 지나갔다!', icon: 'str' });
        else if (total <= 4) completeStep({ gain: { str: 3 }, msg: '쩍! 바위가 두 동강 났다!', icon: 'str' });
        else completeStep({ gain: { str: total - 1 }, gold: 2, msg: '바위가 산산조각! 안에서 금화가 쏟아졌다!', icon: 'star' });
      }, 900);
    });
  }

  // ---------- 황금 슬라임 (연타) ----------
  function tapGame(box) {
    let count = 0, started = false, ended = false;
    box.innerHTML = `
      <div class="tap-count" id="tap-count">준비!</div>
      <div class="tap-field" id="tap-field"><div class="tap-target" id="tap-target"><img src="assets/sprites/m_slime.png" alt="" style="filter:sepia(1) saturate(4) hue-rotate(5deg) brightness(1.1)"></div></div>
      <div class="center muted" id="tap-info">슬라임을 누르면 시작해요! 슬라임이 계속 도망가요.</div>`;
    const field = $('#tap-field', box), target = $('#tap-target', box);
    function jump() {
      const fw = field.clientWidth, fh = field.clientHeight, s = target.offsetWidth;
      target.style.left = Math.random() * (fw - s) + 'px';
      target.style.top = Math.random() * (fh - s) + 'px';
    }
    const hit = (e) => {
      e.preventDefault(); e.stopPropagation();
      if (ended) return;
      if (!started) {
        started = true;
        let t = 5.0;
        const iv = every(() => {
          t -= 0.1;
          $('#tap-info', box).textContent = `남은 시간 ${Math.max(0, t).toFixed(1)}초`;
          if (t <= 0) {
            clearInterval(iv);
            ended = true;
            S('gong', { vol: .4 });
            const pts = count < 8 ? 1 : count < 14 ? 2 : count < 20 ? 3 : count < 26 ? 4 : 5;
            completeStep({ gain: { agi: pts }, gold: count >= 22 ? 2 : 0, msg: count >= 22 ? `${count}번 명중! 황금 슬라임을 꽉 붙잡았다!` : `${count}번 명중! 슬라임을 붙잡았다.`, icon: 'agi' });
          }
        }, 100);
      }
      count++;
      S('squish', { vary: .5, gap: 0, vol: .7 });
      $('#tap-count', box).textContent = count;
      target.classList.remove('bop'); void target.offsetWidth; target.classList.add('bop');
      if (count % 2 === 0) jump();
    };
    target.addEventListener('pointerdown', hit);
    field.addEventListener('pointerdown', e => { if (started && !ended && e.target === field) S('whiff', { vol: .4, gap: 0 }); });
  }

  // ---------- 세 개의 상자 ----------
  function chestGame(box) {
    const outs = shuffle([
      { img: 'coin', gold: 4, msg: '금화가 가득! +4골드', icon: 'coin' },
      { img: 'luk', gain: { luk: 3 }, msg: '행운의 네잎클로버를 얻었다!', icon: 'luk' },
      { img: 'skull', gain: { vit: -1, str: 2 }, msg: '미믹이다!! 싸워서 이겼지만 다쳤다.', icon: 'skull', good: false }
    ]);
    box.innerHTML = `<div class="chest-row">${[0, 1, 2].map(i => `<div class="chest pop-in" style="animation-delay:${i * 100}ms" data-i="${i}"><img src="assets/icons/chest.png" alt=""></div>`).join('')}</div>`;
    let picked = false;
    $$('.chest', box).forEach(ch => ch.addEventListener('click', () => {
      if (picked) return;
      picked = true;
      S('latch');
      ch.classList.add('shake');
      later(() => {
        const o = outs[+ch.dataset.i];
        S('creak'); S(o.img === 'skull' ? 'heavy' : o.img === 'coin' ? 'coin' : 'power', { delay: .15 });
        $$('.chest', box).forEach((c, i) => {
          c.innerHTML = `<img src="assets/icons/${outs[i].img}.png" alt="">`;
          c.classList.add('opened');
          if (c !== ch) c.style.opacity = .3;
        });
        completeStep(o);
      }, 600);
    }));
  }

  // ---------- 상점 ----------
  function shopGame(box) {
    const stockKey = 'shop' + me.step;
    if (!me.stock || me.stock.k !== stockKey) {
      const base = G.SHOP_ITEMS.filter(i => i.id !== 'p_rand' && i.id !== 'p_all');
      me.stock = { k: stockKey, ids: shuffle(base).slice(0, 3).map(i => i.id).concat(['p_rand', 'p_all']) };
      save();
    }
    let spent = 0;
    const acc = {}, bought = new Set(), notes = [];
    function draw() {
      const g = (me.gold || 0) - spent;
      box.innerHTML = `<div class="shop-gold">${icon('coin', 30)} 내 골드 <b>${g}</b></div>
        <div class="shop-list">${me.stock.ids.map(id => {
          const it = G.SHOP_ITEMS.find(x => x.id === id);
          const desc = it.random ? '능력치 하나가 -1~+4 (복불복!)' : Object.entries(it.gain).map(([k, v]) => `${STAT_NAME[k]} +${v}`).join(' ');
          const sold = bought.has(id);
          return `<div class="shop-item ${sold ? 'sold' : ''}">${icon(it.icon, 44)}<div class="si-t"><b>${it.name}</b><small>${desc}</small></div>
            <button class="btn small ${g < it.cost || sold ? 'ghost' : ''}" data-id="${id}" ${g < it.cost || sold ? 'disabled' : ''} data-nosfx>${sold ? '구매 완료' : `${icon('coin', 18)} ${it.cost}`}</button></div>`;
        }).join('')}</div>
        ${notes.length ? `<div class="shop-notes">${notes.map(n => `<div>${n}</div>`).join('')}</div>` : ''}
        <button class="btn big secondary" id="shop-leave" style="width:100%;margin-top:12px">${icon('door', 28)} 가게를 나선다</button>`;
      $$('.shop-item button', box).forEach(b => b.addEventListener('click', () => {
        const it = G.SHOP_ITEMS.find(x => x.id === b.dataset.id);
        if ((me.gold || 0) - spent < it.cost) return S('error');
        spent += it.cost; bought.add(it.id);
        S('coin2');
        if (it.random) {
          const k = randStat(), v = [-1, 1, 2, 3, 4][rnd(5)];
          acc[k] = (acc[k] || 0) + v;
          notes.push(`${icon('potion', 20)} 수상한 물약 → ${STAT_NAME[k]} ${v > 0 ? '+' : ''}${v}${v >= 3 ? ' 대박!' : v < 0 ? ' 으윽…' : ''}`);
          later(() => S(v > 0 ? 'power' : 'wrong'), 200);
        } else Object.entries(it.gain).forEach(([k, v]) => { acc[k] = (acc[k] || 0) + v; });
        draw();
      }));
      $('#shop-leave', box).addEventListener('click', () => {
        box.innerHTML = '';
        completeStep({ gain: acc, gold: -spent, msg: bought.size ? `물건 ${bought.size}개를 샀다! "또 오게나~"` : '구경만 하고 나왔다. 상인이 아쉬워한다.', icon: 'chest' });
      });
    }
    S('coin', { vol: .5 });
    draw();
  }

  // ---------- 도박 고블린 ----------
  function gambleGame(box) {
    let net = 0, rounds = 0, wins = 0, busy = false;
    function avail() { return (me.gold || 0) + net; }
    function finish(extra) {
      box.innerHTML = '';
      const r = { gold: net, gain: {}, icon: 'dice', good: net >= 0 };
      if (wins) r.gain.luk = wins;
      Object.assign(r.gain, (extra && extra.gain) || {});
      if (extra && extra.gold) r.gold += extra.gold;
      r.msg = (extra && extra.msg) || (rounds === 0 ? '"쳇, 겁쟁이 같으니!" 고블린이 혀를 찼다.' : net > 0 ? `${net}골드를 따 왔다! 고블린이 분해서 발을 동동!` : net < 0 ? `${-net}골드를 잃었다… "키키킥, 또 와!"` : '본전이다. 고블린과 비겼다.');
      completeStep(r);
    }
    function draw(resultHTML) {
      const g = avail();
      if (g <= 0 && rounds === 0) {
        box.innerHTML = `<div class="dice-duel-msg">"돈이 없어? 그럼 팔씨름으로 붙자!"</div>`;
        return rollCheck(box, { stat: 'str', dc: 11 }, ok => finish(ok ? { gain: { str: 1 }, gold: 2, msg: '팔씨름 승리! 고블린이 2골드를 내놨다.' } : { gain: { str: 1 }, msg: '팔씨름에 졌다… 그래도 팔 힘은 늘었다.' }));
      }
      box.innerHTML = `<div class="shop-gold">${icon('coin', 30)} 내 골드 <b>${g}</b> <small class="muted">(${rounds}/3판)</small></div>
        <div class="dice-duel"><div class="dd-side"><small>나</small><div class="d6s" id="dd-me"><i>?</i><i>?</i></div></div>
        <div class="dd-vs">VS</div><div class="dd-side"><small>고블린</small><div class="d6s" id="dd-gob"><i>?</i><i>?</i></div></div></div>
        <div class="dice-duel-msg" id="dd-msg">${resultHTML || '얼마를 걸까?'}</div>
        ${rounds < 3 && g > 0 ? `<div class="bet-row">${[1, 2, 3].map(b => `<button class="btn ${g < b ? 'ghost' : ''}" data-b="${b}" ${g < b ? 'disabled' : ''} data-nosfx>${icon('coin', 22)} ${b}골드 걸기</button>`).join('')}</div>` : ''}
        <button class="btn big secondary" id="dd-stop" style="width:100%;margin-top:10px">${rounds ? '그만하고 떠난다' : '구경만 하고 떠난다'}</button>`;
      $$('[data-b]', box).forEach(b => b.addEventListener('click', () => play(+b.dataset.b)));
      $('#dd-stop', box).addEventListener('click', () => finish());
    }
    function play(bet) {
      if (busy) return; busy = true;
      $$('.bet-row button, #dd-stop', box).forEach(b => b.disabled = true);
      S('diceshake');
      const mine = [1 + rnd(6), 1 + rnd(6)], gob = [1 + rnd(6), 1 + rnd(6)];
      const els = $$('.d6s i', box);
      els.forEach(e => e.classList.add('rolling'));
      const iv = every(() => els.forEach(e => { e.textContent = 1 + rnd(6); }), 70);
      later(() => {
        clearInterval(iv); timers.delete(iv);
        S('dicethrow');
        [...mine, ...gob].forEach((v, i) => { els[i].textContent = v; els[i].classList.remove('rolling'); });
        const a = mine[0] + mine[1], b = gob[0] + gob[1];
        rounds++;
        let msg;
        if (a > b) { net += bet; wins++; msg = `<b class="ok-t">${a} : ${b} 승리!</b> +${bet}골드`; later(() => { S('coin'); S('j_good', { vol: .6 }); }, 200); }
        else if (a < b) { net -= bet; msg = `<b class="bad-t">${a} : ${b} 패배…</b> -${bet}골드`; later(() => S('j_fail', { vol: .6 }), 200); }
        else msg = `<b>${a} : ${b} 무승부</b> 건 돈을 돌려받았다`;
        busy = false;
        later(() => { if (rounds >= 3 || avail() <= 0) { draw(msg); $$('.bet-row', box).forEach(r => r.remove()); } else draw(msg); }, 700);
      }, 900);
    }
    draw();
  }

  // ---------- 점술사 ----------
  function fortuneGame(box) {
    const free = (me.gold || 0) < 1;
    const outs = shuffle([
      { name: '별', img: 'star', gain: { luk: 3 }, msg: '별 카드! 행운이 쏟아진다.' },
      { name: '태양', img: 'bolt', gain: { str: 1, agi: 1, vit: 1 }, msg: '태양 카드! 온몸에 활력이 넘친다.' },
      { name: '달', img: 'int', gain: { int: 3 }, msg: '달 카드! 머리가 맑아진다.' },
      { name: '탑', img: 'skull', gain: { [randStat()]: -1 }, gold: 3, msg: '탑 카드… 불운이 닥쳤지만 땅에서 금화를 주웠다.', good: false },
      { name: '운명의 수레바퀴', img: 'dice', gain: { [randStat()]: 4 }, msg: '운명의 수레바퀴! 능력 하나가 크게 올랐다!' }
    ]);
    box.innerHTML = `<div class="dice-duel-msg">${free ? '"돈이 없구나… 이번만 공짜로 봐 주마."' : '복채 1골드를 내고 카드를 한 장 고르세요.'}</div>
      <div class="fortune-row">${outs.map((_, i) => `<div class="fcard pop-in" style="animation-delay:${i * 80}ms" data-i="${i}"><div class="fc-in"><div class="fc-back">${icon('card', 46)}</div><div class="fc-front"></div></div></div>`).join('')}</div>`;
    S('shuffle');
    let picked = false;
    $$('.fcard', box).forEach(c => c.addEventListener('click', () => {
      if (picked) return; picked = true;
      const o = outs[+c.dataset.i];
      S('cardflip');
      $$('.fcard', box).forEach((x, i) => { $('.fc-front', x).innerHTML = `${icon(outs[i].img, 40)}<small>${outs[i].name}</small>`; });
      c.classList.add('flip', 'chosen');
      later(() => { $$('.fcard', box).forEach(x => { if (x !== c) x.classList.add('flip', 'dim'); }); S('card'); }, 700);
      later(() => completeStep({ gain: o.gain, gold: (o.gold || 0) - (free ? 0 : 1), msg: o.msg, icon: 'crystal', good: o.good }), 1100);
    }));
  }

  // ---------- 10 만들기 ----------
  function solve10(nums) {
    const EPS = 1e-9;
    function rec(list) {
      if (list.length === 1) return Math.abs(list[0].v - 10) < EPS ? list[0].e : null;
      for (let i = 0; i < list.length; i++) for (let j = 0; j < list.length; j++) {
        if (i === j) continue;
        const a = list[i], b = list[j], rest = list.filter((_, k) => k !== i && k !== j);
        const cands = [{ v: a.v + b.v, e: `(${a.e}+${b.e})` }, { v: a.v - b.v, e: `(${a.e}−${b.e})` }, { v: a.v * b.v, e: `(${a.e}×${b.e})` }];
        if (Math.abs(b.v) > EPS) cands.push({ v: a.v / b.v, e: `(${a.e}÷${b.e})` });
        for (const c of cands) { const r = rec(rest.concat([c])); if (r) return r; }
      }
      return null;
    }
    const r = rec(nums.map(n => ({ v: n, e: String(n) })));
    return r && r.replace(/^\((.*)\)$/, '$1');
  }
  function evalExpr(tokens) {
    let i = 0;
    const peek = () => tokens[i], next = () => tokens[i++];
    function prim() {
      const t = next();
      if (!t) throw 0;
      if (t.t === 'n') return t.v;
      if (t.v === '(') { const v = expr(); if (!peek() || peek().v !== ')') throw 0; next(); return v; }
      if (t.v === '−') return -prim();
      throw 0;
    }
    function term() { let v = prim(); while (peek() && (peek().v === '×' || peek().v === '÷')) { const o = next().v, r = prim(); if (o === '÷' && Math.abs(r) < 1e-12) throw 0; v = o === '×' ? v * r : v / r; } return v; }
    function expr() { let v = term(); while (peek() && (peek().v === '+' || peek().v === '−')) { const o = next().v; v = o === '+' ? v + term() : v - term(); } return v; }
    const v = expr();
    if (i !== tokens.length) throw 0;
    return v;
  }
  function make10Game(box) {
    if (!me.m10 || me.m10.at !== me.step) {
      let nums, sol;
      do { nums = [0, 0, 0, 0].map(() => 1 + rnd(9)); sol = solve10(nums); } while (!sol || nums.reduce((a, b) => a + b, 0) === 10);
      me.m10 = { at: me.step, nums, sol }; save();
    }
    const { nums, sol } = me.m10;
    let tokens = [], sec = 0, done = false;
    function draw() {
      if (stepDone) return;
      const used = new Set(tokens.filter(t => t.t === 'n').map(t => t.idx));
      box.innerHTML = `<div class="m10-top"><span>${icon('hourglass', 24)} <b id="m10-t">${sec}</b>초</span><span class="muted">목표: <b class="display" style="color:var(--gold);font-size:24px">10</b></span></div>
        <div class="m10-expr" id="m10-expr">${tokens.length ? tokens.map(t => `<span class="${t.t}">${t.v}</span>`).join('') : '<span class="ph">숫자와 기호를 눌러 식을 만드세요</span>'}</div>
        <div class="m10-nums">${nums.map((n, i) => `<button class="m10-n" data-i="${i}" ${used.has(i) ? 'disabled' : ''} data-nosfx>${n}</button>`).join('')}</div>
        <div class="m10-ops">${['+', '−', '×', '÷', '(', ')'].map(o => `<button class="m10-o" data-o="${o}" data-nosfx>${o}</button>`).join('')}<button class="m10-o del" data-del data-nosfx>⌫</button><button class="m10-o del" data-clr data-nosfx>C</button></div>
        <button class="btn big" id="m10-ok" style="width:100%;margin-top:10px">${icon('key', 30)} 자물쇠 열기</button>
        ${sec >= 45 ? `<button class="btn ghost" id="m10-give" style="width:100%;margin-top:8px">포기하고 답 보기</button>` : ''}`;
      $$('.m10-n', box).forEach(b => b.addEventListener('click', () => { tokens.push({ t: 'n', v: nums[+b.dataset.i], idx: +b.dataset.i }); S('tick', { gap: 0 }); draw(); }));
      $$('[data-o]', box).forEach(b => b.addEventListener('click', () => { tokens.push({ t: 'o', v: b.dataset.o }); S('tick', { gap: 0, rate: 1.3 }); draw(); }));
      $('[data-del]', box).addEventListener('click', () => { tokens.pop(); S('back', { gap: 0 }); draw(); });
      $('[data-clr]', box).addEventListener('click', () => { tokens = []; S('back', { gap: 0 }); draw(); });
      $('#m10-ok', box).addEventListener('click', check);
      const gv = $('#m10-give', box);
      if (gv) gv.addEventListener('click', () => { done = true; box.innerHTML = `<div class="m10-expr">${esc(sol)} = 10</div>`; completeStep({ gain: { int: 1 }, msg: `정답 예시: ${sol} = 10`, icon: 'lock', good: false }); });
    }
    function check() {
      if (done) return;
      const usedN = tokens.filter(t => t.t === 'n').length;
      let v = null;
      try { v = evalExpr(tokens); } catch (e) { v = null; }
      if (usedN < 4) { S('error'); toast('숫자 4개를 모두 써야 해요', 'lock'); return; }
      if (v === null) { S('error'); toast('식이 올바르지 않아요', 'lock'); $('#m10-expr', box).classList.add('shake'); return; }
      if (Math.abs(v - 10) > 1e-9) { S('wrong'); toast(`${Math.round(v * 100) / 100} 이(가) 나왔어요. 10이 아니에요!`, 'lock'); $('#m10-expr', box).classList.add('shake'); return; }
      done = true;
      S('latch'); S('j_good', { delay: .2 });
      const fast = sec <= 30;
      completeStep({ gain: fast ? { int: 3, luk: 1 } : { int: 3 }, gold: fast ? 2 : 1, msg: fast ? `${sec}초 만에 해독! 천재다!` : '딸깍! 자물쇠가 열렸다!', icon: 'key' });
    }
    draw();
    every(() => { if (done) return; sec++; const el = $('#m10-t', box); if (el) el.textContent = sec; if (sec === 45) draw(); }, 1000);
  }

  // ---------- 초성 퀴즈 ----------
  const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  function chosungOf(w) { return [...w].map(ch => { const c = ch.charCodeAt(0) - 0xAC00; return c >= 0 && c < 11172 ? CHO[Math.floor(c / 588)] : ''; }).join(''); }
  function chosungGame(box) {
    const cats = Object.fromEntries(Object.entries(G.CHOSUNG_CATS).map(([k, v]) => [k, [...new Set(v.split(' '))]]));
    let score = 0, left = 75, cur = null, sinceStart = 0, done = false;
    const usedW = new Set();
    function nextPrompt() {
      const catNames = Object.keys(cats);
      for (let t = 0; t < 50; t++) {
        const cat = catNames[rnd(catNames.length)];
        const words = cats[cat].filter(w => w.length >= 2 && w.length <= 3 && !usedW.has(w));
        if (!words.length) continue;
        const w = words[rnd(words.length)], pat = chosungOf(w);
        const accept = cats[cat].filter(x => chosungOf(x) === pat && x.length === w.length);
        accept.forEach(a => usedW.add(a));
        cur = { cat, pat, accept, sample: w };
        sinceStart = 0;
        return;
      }
    }
    function draw(flash) {
      if (done) return;
      box.innerHTML = `<div class="m10-top"><span>${icon('hourglass', 24)} <b id="cs-t">${left}</b>초</span><span>${icon('star', 24)} 맞힌 개수 <b>${score}</b></span></div>
        <div class="cs-card ${flash || ''}"><small>주제: ${cur.cat}</small><div class="cs-pat">${cur.pat.split('').map(c => `<i>${c}</i>`).join('')}</div><div class="cs-hint" id="cs-hint"></div></div>
        <div class="cs-row"><input id="cs-in" type="text" placeholder="정답 입력" autocomplete="off" maxlength="8"><button class="btn" id="cs-go" data-nosfx>입력</button></div>
        <button class="btn ghost" id="cs-pass" style="width:100%;margin-top:8px">패스 (다른 문제)</button>`;
      const inp = $('#cs-in', box);
      inp.focus();
      const go = () => {
        const v = inp.value.trim().replace(/\s/g, '');
        if (!v || done) return;
        if (cur.accept.includes(v)) { score++; S('right'); S('coin', { delay: .1 }); nextPrompt(); draw('ok'); }
        else { S('wrong'); inp.value = ''; inp.classList.remove('shake'); void inp.offsetWidth; inp.classList.add('shake'); }
      };
      $('#cs-go', box).addEventListener('click', go);
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
      $('#cs-pass', box).addEventListener('click', () => { toast(`정답 예시: ${cur.sample}`, 'scroll'); S('back'); nextPrompt(); draw(); });
    }
    function end() {
      if (done) return; done = true;
      S('gong', { vol: .4 });
      const g = score >= 6 ? { int: 4, luk: 1 } : score >= 4 ? { int: 3 } : score >= 2 ? { int: 2 } : { int: 1 };
      completeStep({ gain: g, gold: Math.floor(score / 2), msg: `고대 문자 ${score}개 해독!${score >= 6 ? ' 전설의 언어학자!' : ''}`, icon: 'scroll', good: score >= 2 });
    }
    nextPrompt(); draw();
    every(() => {
      if (done) return;
      left--; sinceStart++;
      const t = $('#cs-t', box); if (t) t.textContent = left;
      if (left <= 10 && left > 0) S('tick', { vol: .4 });
      if (sinceStart === 12) { const h = $('#cs-hint', box); if (h) h.textContent = `힌트: ${cur.sample[0]}${'○'.repeat(cur.sample.length - 1)}`; }
      if (left <= 0) end();
    }, 1000);
  }

  // ---------- 창의력: 새로운 쓰임새 ----------
  function usesGame(box) {
    if (!me.usesObj || me.usesObj.at !== me.step) { me.usesObj = { at: me.step, obj: G.USES_OBJECTS[rnd(G.USES_OBJECTS.length)] }; save(); }
    const obj = me.usesObj.obj;
    const ideas = [];
    let left = 60, done = false;
    box.innerHTML = `<div class="uses-obj">${icon('bulb', 48)}<div><small>오늘의 물건</small><b>${esc(obj)}</b></div></div>
      <div class="m10-top"><span>${icon('hourglass', 24)} <b id="us-t">${left}</b>초</span><span>${icon('bulb', 24)} 아이디어 <b id="us-n">0</b>개</span></div>
      <div class="cs-row"><input id="us-in" type="text" placeholder="예) 화분으로 쓴다" autocomplete="off" maxlength="30"><button class="btn" id="us-go" data-nosfx>추가</button></div>
      <div class="uses-list" id="us-list"></div>
      <p class="muted center" style="font-size:14px">엉뚱해도 좋아요! 많이, 다양하게 적을수록 점수가 올라가요.</p>
      <button class="btn big secondary" id="us-done" style="width:100%;margin-top:6px" disabled>다 썼어요!</button>`;
    const inp = $('#us-in', box);
    inp.focus();
    const norm = s => s.replace(/\s/g, '');
    const add = () => {
      if (done) return;
      const v = inp.value.trim();
      if (norm(v).length < 2) { S('error'); return; }
      if (ideas.some(x => norm(x) === norm(v))) { S('error'); toast('이미 적은 아이디어예요'); return; }
      ideas.push(v); inp.value = '';
      S('pop', { rate: 1 + Math.min(ideas.length, 10) * .05, gap: 0 });
      $('#us-list', box).insertAdjacentHTML('afterbegin', `<span class="idea pop-in">${esc(v)}</span>`);
      $('#us-n', box).textContent = ideas.length;
      $('#us-done', box).disabled = false;
      inp.focus();
    };
    $('#us-go', box).addEventListener('click', add);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
    function end() {
      if (done) return; done = true;
      S('gong', { vol: .4 });
      const n = ideas.length, long = ideas.some(x => norm(x).length >= 8);
      const g = { int: Math.min(4, 1 + Math.floor(n / 2)) };
      if (n >= 5) g.luk = 1;
      if (long) g.luk = (g.luk || 0) + 1;
      completeStep({ gain: n ? g : { int: 1 }, gold: n >= 7 ? 2 : n >= 4 ? 1 : 0, trait: n >= 4 ? 'free' : null,
        msg: n ? `아이디어 ${n}개! ${n >= 7 ? '발명가가 감탄해 비밀 설계도를 줬다!' : '발명가가 고개를 끄덕인다.'}${long ? ' (구체적인 아이디어 보너스!)' : ''}` : '아무것도 떠오르지 않았다…', icon: 'bulb', good: n > 0 });
    }
    $('#us-done', box).addEventListener('click', end);
    every(() => {
      if (done) return;
      left--;
      const t = $('#us-t', box); if (t) t.textContent = left;
      if (left <= 10 && left > 0) S('tick', { vol: .4 });
      if (left <= 0) end();
    }, 1000);
  }

  // ---------- 기억력: 짝 맞추기 ----------
  function memoryGame(box) {
    const icons = ['swords', 'crown', 'key', 'heart', 'bolt', 'shield', 'star', 'chest'];
    const deck = shuffle(icons.concat(icons));
    let open = [], matched = 0, moves = 0, lock = false;
    box.innerHTML = `<div class="m10-top"><span>${icon('card', 24)} 뒤집은 횟수 <b id="mm-m">0</b></span><span>${icon('star', 24)} <b id="mm-p">0</b> / 8쌍</span></div>
      <div class="mem-grid">${deck.map((ic, i) => `<div class="mcard" data-i="${i}"><div class="fc-in"><div class="fc-back">${icon('card', 34)}</div><div class="fc-front">${icon(ic, 46)}</div></div></div>`).join('')}</div>`;
    S('shuffle');
    $$('.mcard', box).forEach(c => c.addEventListener('click', () => {
      if (lock || c.classList.contains('flip')) return;
      c.classList.add('flip'); S('cardflip', { gap: 0 });
      open.push(c);
      if (open.length < 2) return;
      moves++; $('#mm-m', box).textContent = moves;
      const [a, b] = open; open = [];
      if (deck[+a.dataset.i] === deck[+b.dataset.i]) {
        matched++; $('#mm-p', box).textContent = matched;
        later(() => { a.classList.add('done'); b.classList.add('done'); S('right', { vol: .6 }); }, 250);
        if (matched === 8) later(() => {
          S('j_good');
          const g = moves <= 11 ? { int: 4, luk: 1 } : moves <= 15 ? { int: 3 } : moves <= 20 ? { int: 2 } : { int: 1, vit: 1 };
          completeStep({ gain: g, gold: moves <= 15 ? 1 : 0, msg: `${moves}번 만에 모두 맞혔다!${moves <= 11 ? ' 사진 같은 기억력!' : ''}`, icon: 'card' });
        }, 800);
      } else {
        lock = true;
        later(() => { a.classList.remove('flip'); b.classList.remove('flip'); lock = false; S('card', { vol: .4, gap: 0 }); }, 750);
      }
    }));
  }

  // ---------- 슬라이드 퍼즐 ----------
  function slideGame(box) {
    const img = 'assets/scenes/s_castle.jpg';
    let tiles = [0, 1, 2, 3, 4, 5, 6, 7, 8]; // 8 = 빈칸
    let blank = 8, prev = -1;
    const nb = i => [i - 3, i + 3, i % 3 ? i - 1 : -1, i % 3 < 2 ? i + 1 : -1].filter(j => j >= 0 && j < 9);
    for (let k = 0; k < 32; k++) {
      const opts = nb(blank).filter(j => j !== prev);
      const j = opts[rnd(opts.length)];
      [tiles[blank], tiles[j]] = [tiles[j], tiles[blank]]; prev = blank; blank = j;
    }
    if (tiles.every((t, i) => t === i)) { [tiles[6], tiles[7]] = [tiles[7], tiles[6]]; } // 안전장치 (사실상 없음)
    let moves = 0, sec = 0, done = false;
    function draw() {
      box.innerHTML = `<div class="m10-top"><span>${icon('hourglass', 24)} <b id="sl-t">${sec}</b>초</span><span>${icon('puzzle', 24)} 이동 <b>${moves}</b>번</span></div>
        <div class="slide-wrap"><div class="slide-grid">${tiles.map((t, i) => t === 8 ? `<div class="stile blank"></div>`
          : `<button class="stile" data-i="${i}" style="background-image:url(${img});background-position:${(t % 3) * 50}% ${Math.floor(t / 3) * 50}%" data-nosfx><small>${t + 1}</small></button>`).join('')}</div>
          <img class="slide-ref" src="${img}" alt=""></div>
        <p class="muted center" style="font-size:14px">빈칸 옆 조각을 눌러 밀어요. 오른쪽 작은 그림이 완성본이에요.</p>
        ${sec >= 60 ? `<button class="btn ghost" id="sl-give" style="width:100%">포기하기</button>` : ''}`;
      $$('.stile[data-i]', box).forEach(b => b.addEventListener('click', () => {
        if (done) return;
        const i = +b.dataset.i, bi = tiles.indexOf(8);
        if (!nb(bi).includes(i)) { S('error', { vol: .4 }); return; }
        [tiles[bi], tiles[i]] = [tiles[i], tiles[bi]];
        moves++; S('slide', { vary: .3, gap: 0 });
        if (tiles.every((t, k) => t === k)) {
          done = true; draw();
          S('j_good');
          const g = moves <= 30 ? { int: 4, agi: 1 } : moves <= 60 ? { int: 3 } : { int: 2 };
          return later(() => completeStep({ gain: g, gold: moves <= 40 ? 1 : 0, msg: `${moves}번 만에 벽화 복원! 마왕성 지름길이 보인다.`, icon: 'puzzle' }), 500);
        }
        draw();
      }));
      const gv = $('#sl-give', box);
      if (gv) gv.addEventListener('click', () => { done = true; completeStep({ gain: { int: 1 }, msg: '벽화는 못 맞췄지만 그림은 기억했다.', icon: 'puzzle', good: false }); });
    }
    draw();
    every(() => { if (done) return; sec++; const el = $('#sl-t', box); if (el) el.textContent = sec; if (sec === 60) draw(); }, 1000);
  }

  // ---------- 완료 ----------
  function renderDone(mode) {
    const c = CLASSES[me.cls];
    if (!c) return;
    $('#done-head').textContent = me.done ? '모험 완료!' : '모험 종료!';
    setAnim('#done-img', me.cls, me.done ? 'cheer' : 'idle');
    $('#done-name').textContent = me.name;
    const t = G.dominantTrait(me.traits);
    $('#done-title').innerHTML = `${t ? icon(TRAITS[t].icon, 24) : ''} ${G.titleOf(me.cls, me.traits)}`;
    $('#done-radar').innerHTML = radarSVG(me.stats);
    $('#done-stats').innerHTML = statBars(me.stats);
    $('#done-msg').innerHTML = mode === 'finale'
      ? `${icon('megaphone', 80, 'bob')}<p style="font-family:Jua;font-size:26px" class="shimmer">선생님 화면을 보세요!</p><p class="muted">지금 자리를 건 대결이 펼쳐지고 있어요!</p>`
      : mode === 'pick'
        ? (me.pick && me.pick.done
          ? `${icon('heart', 80, 'bob')}<p style="font-family:Jua;font-size:24px">짝꿍으로 <b style="color:var(--gold)">${esc(me.pick.name)}</b>을(를) 골랐어요!</p><p class="muted">다른 친구들이 고르면 곧 자리가 발표돼요.</p>`
          : `${icon('trophy', 80, 'bob')}<p style="font-family:Jua;font-size:24px" class="shimmer">1·2·3등이 짝꿍을 고르는 중!</p><p class="muted">곧 최종 자리가 발표돼요. 선생님 화면을 보세요!</p>`)
        : `<div class="spinner"></div><p style="font-family:Jua;font-size:20px">다른 친구들의 모험을 기다리는 중…</p><div class="mini-box hidden" data-mini></div>`;
    renderMini();
  }

  // ---------- 1·2·3등 보상: 짝꿍 고르기 (번호판 뽑기처럼) ----------
  function renderPick() {
    const pk = me.pick;
    const medal = pk.rank === 1 ? 'trophy' : pk.rank === 2 ? 'silver' : 'bronze';
    $('#pick-head').innerHTML = `${icon(medal, 64, 'pop-in')}<div><div class="pick-rank grad-text">${pk.rank}등 보상!</div><div class="pick-sub">무작위 후보 <b>${pk.cands.length}명</b> 중에서 짝꿍을 골라요</div></div>`;
    const box = $('#pick-body');
    const names = pk.cands.map(c => c.name);
    box.innerHTML = `<div class="pick-grid">${pk.cands.map((c, i) => `
      <button class="pick-card ${pk.revealed ? 'shown' : ''}" data-i="${i}" ${pk.revealed ? '' : 'disabled'} data-nosfx>
        <div class="pk-plate"><span class="pk-name">${pk.revealed ? esc(c.name) : '?'}</span></div>
        <img class="pk-img" src="${c.cls && CLASSES[c.cls] ? CLASSES[c.cls].img : 'assets/icons/thought.png'}" alt="">
      </button>`).join('')}</div>
      ${pk.revealed ? '<p class="center muted" style="margin-top:12px">한 명을 눌러 짝꿍으로 정하세요. 한 번 고르면 바꿀 수 없어요!</p>'
        : `<button class="btn big" id="pick-roll" style="width:100%;margin-top:16px">${icon('dice', 32)} 후보 공개!</button>`}`;
    if (!pk.revealed) {
      S('j_cute');
      $('#pick-roll', box).addEventListener('click', e => {
        e.currentTarget.disabled = true;
        S('shuffle');
        const cards = $$('.pick-card', box);
        cards.forEach((card, i) => {
          const nm = $('.pk-name', card);
          card.classList.add('rolling');
          const iv = every(() => { nm.textContent = names[rnd(names.length)]; S('tick', { vol: .25, gap: 0 }); }, 70);
          later(() => {
            clearInterval(iv); timers.delete(iv);
            nm.textContent = pk.cands[i].name;
            card.classList.remove('rolling'); card.classList.add('shown');
            S('card'); S('pop', { rate: 1 + i * .1, delay: .05 });
            if (i === cards.length - 1) later(() => { pk.revealed = true; save(); S('j_good', { vol: .6 }); renderPick(); }, 500);
          }, 700 + i * 450);
        });
      });
      return;
    }
    $$('.pick-card', box).forEach(b => b.addEventListener('click', async () => {
      const c = pk.cands[+b.dataset.i];
      S('select');
      $$('.pick-card', box).forEach(x => x.classList.toggle('sel', x === b));
      const ok = await UI.confirm(`<b>${esc(c.name)}</b>을(를) 짝꿍으로 고를까요?<br>한 번 고르면 바꿀 수 없어요!`, { icon: 'heart', ok: '이 친구로!' });
      if (!ok) { b.classList.remove('sel'); return; }
      S('j_win');
      $$('.pick-card', box).forEach(x => { x.disabled = true; if (x !== b) x.classList.add('dim'); });
      Net.send('pickChoice', { token: me.token, choice: c.id });
      // 응답이 늦으면 다시 보냄
      let tries = 0;
      const iv = every(() => { if ((me.pick && me.pick.done) || ++tries > 4) { clearInterval(iv); return; } Net.send('pickChoice', { token: me.token, choice: c.id }); }, 2500);
    }));
  }

  // ---------- 결과 ----------
  function onResult(m) {
    const r = m.results && m.results[me.token];
    if (!r) return;
    me.result = r;
    save();
    phase = 'result';
    renderResult();
  }
  function renderResult() {
    const c = CLASSES[me.cls];
    const rk = me.result.rank;
    $('#res-medal').src = `assets/icons/${rk === 1 ? 'trophy' : rk === 2 ? 'silver' : rk === 3 ? 'bronze' : 'star'}.png`;
    if (c) setAnim('#res-img', me.cls, rk <= 3 ? 'cheer' : 'idle');
    $('#res-name').textContent = me.name;
    $('#res-rank').textContent = `${rk}등`;
    $('#res-seat').innerHTML = `${icon('desk', 40)} 내 자리 <span class="display" style="color:var(--gold);font-size:40px">${me.result.seat}</span>번`;
    $('#res-sub').textContent = (me.pick && me.pick.done && me.pick.name ? `짝꿍: ${me.pick.name} · ` : '') + (rk === 1 ? '전설의 용사! 축하해요!' : '멋진 모험이었어요! 새 자리에서도 화이팅!');
    show('v-result');
    S(rk <= 3 ? 'j_win' : 'j_good');
  }

  function showMsg(t, b) {
    $('#msg-title').textContent = t;
    $('#msg-body').textContent = b;
    show('v-msg');
  }
})();
