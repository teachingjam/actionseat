// 2D 탑다운 배틀로얄 (뱀서류 스타일)
// 탈락 순서(=목표 순위의 역순)를 미리 정하고, 그 시각에 맞춰 스킬이 명중하도록 연출합니다.
(function () {
  const { CLASSES } = GameData;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const lerp = (a, b, k) => a + (b - a) * k;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  const FX_NAMES = ['fireball', 'orb', 'arrow', 'dagger', 'notes', 'holy', 'slash', 'explosion', 'lightning', 'ice', 'star', 'heal', 'meteor', 'shockwave', 'hit', 'gem'];
  // 직업별 공격 스타일
  const STYLE = {
    warrior: { kind: 'melee', fx: 'slash', ult: 'quake', ico: 'swords' },
    mage: { kind: 'proj', fx: 'fireball', speed: 520, ult: 'meteor', ico: 'int' },
    archer: { kind: 'proj', fx: 'arrow', speed: 760, ult: 'volley', ico: 'target' },
    thief: { kind: 'melee', fx: 'slash', ult: 'blink', ico: 'agi' },
    bard: { kind: 'proj', fx: 'notes', speed: 420, ult: 'rings', ico: 'free' },
    cleric: { kind: 'pillar', fx: 'holy', ult: 'judgement', ico: 'vit' }
  };

  function run(root, players, onDone) {
    let destroyed = false, raf = 0, skipReq = false;
    const ctrl = { skip() { skipReq = true; }, destroy() { destroyed = true; cleanup(); } };
    const H = FX.createHud(root, { title: '아레나 배틀로얄', icon: 'swords' });
    const canvas = H.canvas, ctx = canvas.getContext('2d');
    const N = players.length;
    const WW = 2400, WH = 1350, CX = WW / 2, CY = WH / 2;

    const srcs = { arena: 'assets/arena_top.jpg', crown: 'assets/icons/crown.png', skull: 'assets/icons/skull.png' };
    Object.keys(CLASSES).forEach(k => { srcs['run_' + k] = CLASSES[k].run; srcs['face_' + k] = CLASSES[k].img; });
    ['m_slime', 'm_bat', 'm_mushroom', 'm_ghost'].forEach(k => { srcs[k] = `assets/sprites/${k}.png`; });
    FX_NAMES.forEach(k => { srcs['fx_' + k] = `assets/fx/fx_${k}.png`; });
    let IMG = {};

    // ---------------- HUD 요소 ----------------
    const alive = document.createElement('div'); alive.className = 'alive-box'; H.overlay.appendChild(alive);
    const feed = document.createElement('div'); feed.className = 'killfeed'; H.overlay.appendChild(feed);
    function setAlive(n) { alive.innerHTML = `${UI.icon('skull', 44)}<span>생존 <span style="color:var(--gold)">${n}</span> / ${N}</span>`; }
    function killFeed(a, v, rank) {
      const d = document.createElement('div'); d.className = 'kf';
      d.innerHTML = `<img class="a" src="${CLASSES[a.p.cls].img}" alt="">${UI.esc(a.p.name)} ${UI.icon(STYLE[a.p.cls].ico, 26)} <img class="a" src="${CLASSES[v.p.cls].img}" alt="" style="filter:grayscale(1)">${UI.esc(v.p.name)}<span class="rk">${rank}위</span>`;
      feed.prepend(d);
      while (feed.children.length > 6) feed.lastChild.remove();
    }

    // ---------------- 전투원 ----------------
    const F = players.map((p, i) => {
      const a = i / N * Math.PI * 2 + rand(-.1, .1), r = rand(260, 520);
      return { p, x: CX + Math.cos(a) * r * 1.5, y: CY + Math.sin(a) * r, vx: 0, vy: 0, hp: 100, shown: 100, alive: true, koAt: 0, face: 1,
        st: STYLE[p.cls] || STYLE.warrior, sk: FX.skillOf(p), cd: rand(0.3, 1.2), wander: rand(0, 6), exp: 0, lv: 1, flash: 0, dash: null, chase: null, orbit: rand(0, 6), lvFx: 0 };
    });
    const byRank = F.slice().sort((a, b) => a.p.rank - b.p.rank);

    // ---------------- 타임라인 (탈락 순서) ----------------
    const events = [];
    const hp = new Map(F.map(f => [f, 100]));
    const aliveSet = new Set(F);
    let t = 4.5;
    const steps = Math.max(0, N - 2);
    for (let k = N, j = 0; k >= 3; k--, j++) {
      const v = byRank[k - 1];
      const others = Array.from(aliveSet).filter(f => f !== v);
      const dtk = lerp(1.05, 2.1, steps > 1 ? j / (steps - 1) : 1);
      // 견제 공격 (탈락 없음)
      if (others.length > 1 && Math.random() < 0.8) {
        const u = pick(others), a1 = pick(others.filter(f => f !== u));
        const d1 = Math.min(Math.round(rand(6, 15)), hp.get(u) - 28);
        if (d1 >= 3) { hp.set(u, hp.get(u) - d1); events.push({ t: t + dtk * 0.1, a: a1, v: u, dmg: d1 }); }
      }
      const a2 = pick(others), a3 = pick(others);
      const h = hp.get(v), d2 = Math.max(1, Math.round(h * rand(0.35, 0.55)));
      events.push({ t: t + dtk * 0.4, a: a2, v, dmg: d2 });
      events.push({ t: t + dtk * 0.85, a: a3, v, dmg: h - d2, ko: true, rank: k, ult: k <= 8 });
      hp.set(v, 0); aliveSet.delete(v);
      t += dtk;
    }
    const champ = byRank[0], second = byRank[1];
    let duelStart = t + 2.2, endT;
    if (N >= 2) {
      let hc = hp.get(champ), hs = hp.get(second), tt = duelStart;
      for (let i = 0; i < 7; i++) {
        if (i === 6) { events.push({ t: tt + 0.4, a: champ, v: second, dmg: hs, ko: true, rank: 2, ult: true, final: true }); break; }
        if (i % 2 === 1) { const d = Math.max(1, Math.round(hs * rand(0.22, 0.35))); hs -= d; events.push({ t: tt, a: champ, v: second, dmg: d, duel: true }); }
        else { const d = Math.max(1, Math.min(Math.round(rand(8, 16)), hc - 15)); hc -= d; events.push({ t: tt, a: second, v: champ, dmg: d, duel: true }); }
        tt += 1.05;
      }
      endT = tt + 4.5;
    } else endT = 6;
    events.sort((a, b) => a.t - b.t);
    const LEAD = { proj: 0.5, melee: 0.3, pillar: 0.55 };
    events.forEach(e => { e.lead = e.ult ? 0.9 : LEAD[e.a.st.kind]; e.launched = false; e.done = false; });

    // ---------------- 월드 객체 ----------------
    const monsters = [], projs = [], fxs = [], sparks = [], floaters = [], gems = [];
    const zone = { r0: 1050, r: 1050, rEnd: 230 };
    const cam = { x: CX, y: CY, z: 0.5, shake: 0, punch: 0 };
    let simT = -1, started = false, timeScale = 1, hitStop = 0, duel = false, ended = false, finalSlow = 0;
    let spawnAcc = 0;

    function addFx(name, x, y, size, life, opt) {
      fxs.push(Object.assign({ img: IMG['fx_' + name], x, y, size, life, age: 0, rot: 0, vr: 0, s0: 0.6, s1: 1.1, add: true, follow: null }, opt || {}));
    }
    function spark(x, y, color, n, spd) {
      for (let i = 0; i < n; i++) { const a = rand(0, 6.28), s = rand(0.3, 1) * (spd || 380); sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.25, 0.6), age: 0, c: color, r: rand(2, 5) }); }
    }
    function floater(text, x, y, color, size) { floaters.push({ text, x, y, color, size: size || 34, age: 0, life: 1.1, vy: -90 }); }

    // 피해 적용
    function applyHit(e) {
      const a = e.a, v = e.v;
      v.hp = Math.max(0, v.hp - e.dmg); v.flash = 1;
      SFX.play(e.ult ? 'heavy' : (Math.random() < .5 ? 'hit' : 'hit2'), { vary: .2, gap: 30 });
      if (e.ult) SFX.boom({ vol: .7 });
      const kx = v.x - a.x, ky = v.y - a.y, kl = Math.hypot(kx, ky) || 1;
      v.vx += kx / kl * 420; v.vy += ky / kl * 420; // 넉백
      floater(`-${e.dmg}`, v.x + rand(-20, 20), v.y - 90, e.ult ? '#ffcf4a' : '#ff5a6e', e.ult ? 54 : 38);
      addFx('hit', v.x, v.y - 40, e.ult ? 260 : 150, 0.3, { rot: rand(0, 6) });
      spark(v.x, v.y - 40, e.ult ? '#ffcf4a' : '#ffffff', e.ult ? 40 : 14);
      cam.shake = Math.max(cam.shake, e.ult ? 22 : 8);
      hitStop = Math.max(hitStop, e.ult ? 0.12 : 0.05);
      if (e.duel) H.comment(`<b>${UI.esc(a.p.name)}</b>의 '${UI.esc(a.sk.name)}'! ${e.dmg} 데미지!`, a.st.ico, true);
      if (e.ko) {
        v.alive = false; v.koAt = simT;
        SFX.boom({ vol: .55 }); SFX.play('gong', { vol: e.rank <= 5 ? .6 : .3, rate: 1 + Math.min(.4, e.rank / 40) });
        if (!e.final && e.rank <= 5) SFX.cheer();
        if (e.final) { SFX.play('v_winner', { delay: .6 }); SFX.crowd(.6, .5); }
        else if (e.rank === 3) SFX.play('v_final', { delay: .4 });
        addFx('explosion', v.x, v.y - 40, e.ult ? 420 : 260, 0.6);
        addFx('star', v.x, v.y - 40, 300, 0.5);
        spark(v.x, v.y - 40, '#ff9d1c', 50, 600);
        floater(`${e.rank}위`, v.x, v.y - 130, '#ffcf4a', 46);
        killFeed(a, v, e.rank);
        setAlive(F.filter(f => f.alive).length);
        if (e.final) {
          finalSlow = 1.8; hitStop = 0.4; H.flash();
          H.banner('WINNER!', `${a.p.name} · ${a.sk.name}`);
          H.comment(`최후의 승자는 <b>${UI.esc(a.p.name)}</b>!!`, 'crown', true);
          setTimeout(() => !destroyed && H.burst(null, null, 320), 300);
        } else {
          H.comment(`<b>${UI.esc(a.p.name)}</b>의 '${UI.esc(a.sk.name)}'! ${UI.esc(v.p.name)} 탈락 (${e.rank}위)`, a.st.ico, e.rank <= 6);
          if (e.rank <= 5) { hitStop = 0.25; cam.punch = 0.25; }
        }
      }
    }

    // 예정된 공격 발사 (도착 시각 = e.t)
    function launch(e) {
      const a = e.a, v = e.v, st = a.st;
      if (e.ult && (e.rank <= 8 || e.final)) H.cutin(a.p, a.sk.name);
      SFX.play(st.kind === 'proj' ? (st.fx === 'arrow' ? 'arrow' : 'fire') : st.kind === 'melee' ? 'slash' : 'zap', { vol: .55, gap: 40 });
      if (e.ult && st.ult === 'meteor') SFX.whoosh({ vol: .5, dur: e.lead });
      if (e.ult) {
        switch (st.ult) {
          case 'meteor': addFx('meteor', v.x - 600, v.y - 900, 300, e.lead, { track: { tx: v, from: { x: v.x - 600, y: v.y - 900 } }, add: false, s0: 1, s1: 1, rot: 0.6, onEnd: () => { addFx('explosion', v.x, v.y - 30, 520, 0.7); cam.shake = 30; } }); break;
          case 'volley': for (let i = 0; i < 6; i++) projs.push({ img: 'arrow', x: a.x + rand(-40, 40), y: a.y - 40 + rand(-40, 40), target: v, arrive: e.t + i * 0.02 - 0.02, size: 120, ev: i === 5 ? e : null }); break;
          case 'quake': a.dash = { from: { x: a.x, y: a.y }, to: v, t0: simT, t1: e.t - 0.15 }; addFx('shockwave', v.x, v.y, 560, 0.6, { delay: e.lead - 0.15, s0: 0.2, s1: 1.4 }); break;
          case 'blink': a.dash = { from: { x: a.x, y: a.y }, to: v, t0: simT, t1: e.t - 0.2, blink: true }; for (let i = 0; i < 3; i++) addFx('slash', v.x, v.y - 40, 300, 0.25, { delay: e.lead - 0.25 + i * 0.08, rot: rand(0, 6) }); break;
          case 'rings': for (let i = 0; i < 3; i++) addFx('shockwave', a.x, a.y - 30, 700, 0.7, { delay: i * 0.18, s0: 0.1, s1: 1.2 }); addFx('notes', v.x, v.y - 60, 260, 0.9, { delay: e.lead - 0.3 }); break;
          case 'judgement': addFx('holy', v.x, v.y - 120, 360, 0.9, { delay: e.lead - 0.5, s0: 0.8, s1: 1.1 }); addFx('lightning', v.x, v.y - 200, 380, 0.4, { delay: e.lead - 0.12 }); break;
        }
        if (st.ult !== 'volley') e.pendingHit = true;
        return;
      }
      if (st.kind === 'proj') projs.push({ img: st.fx, x: a.x, y: a.y - 40, target: v, arrive: e.t, size: st.fx === 'arrow' ? 110 : 120, ev: e });
      else if (st.kind === 'melee') { a.dash = { from: { x: a.x, y: a.y }, to: v, t0: simT, t1: e.t - 0.05 }; addFx('slash', v.x, v.y - 40, 220, 0.25, { delay: e.lead - 0.05, rot: rand(-1, 1) }); e.pendingHit = true; }
      else { addFx('holy', v.x, v.y - 110, 260, 0.7, { delay: e.lead - 0.35 }); e.pendingHit = true; }
    }

    // 일반 공격 (몬스터 사냥)
    function ambient(f, dt) {
      f.cd -= dt;
      if (f.p.cls === 'thief') f.orbit += dt * 5;
      if (f.cd > 0) return;
      let best = null, bd = 480;
      for (const m of monsters) { const d = dist(f, m); if (d < bd) { bd = d; best = m; } }
      if (!best) { f.cd = 0.3; return; }
      f.cd = rand(0.55, 1.0);
      f.face = best.x < f.x ? -1 : 1;
      const st = f.st;
      SFX.play(st.kind === 'proj' ? 'shoot' : st.kind === 'melee' ? 'slash' : 'zap', { vol: .14, gap: 110, vary: .5 });
      if (st.kind === 'proj') {
        const a = Math.atan2(best.y - f.y, best.x - f.x), sp = st.speed;
        const n = f.p.cls === 'archer' ? 3 : 1;
        for (let i = 0; i < n; i++) { const aa = a + (i - (n - 1) / 2) * 0.18; projs.push({ img: st.fx, x: f.x, y: f.y - 40, vx: Math.cos(aa) * sp, vy: Math.sin(aa) * sp, life: 1.1, size: st.fx === 'arrow' ? 80 : 90, free: true, owner: f }); }
      } else if (st.kind === 'melee') {
        if (bd < 170) { addFx('slash', f.x + f.face * 60, f.y - 40, 190, 0.22, { rot: f.face < 0 ? Math.PI : 0 }); monsters.forEach(m => { if (dist(m, { x: f.x + f.face * 60, y: f.y }) < 110) killMonster(m, f); }); }
        else f.cd = 0.15;
      } else {
        addFx('holy', best.x, best.y - 90, 170, 0.55, { s0: 0.7, s1: 1 });
        setTimeout(() => { if (!destroyed) monsters.forEach(m => { if (dist(m, best) < 90) killMonster(m, f); }); }, 250);
      }
    }
    function killMonster(m, f) {
      if (m.dead) return;
      m.dead = true;
      SFX.play('kill', { vary: .5, gap: 70, vol: .3 });
      spark(m.x, m.y, '#ffffff', 6, 240);
      addFx('star', m.x, m.y, 90, 0.3);
      gems.push({ x: m.x, y: m.y, to: f, age: 0 });
    }

    // ---------------- 루프 ----------------
    let last = performance.now();
    function update(dt) {
      if (!started) return;
      if (hitStop > 0) { hitStop -= dt; return; }
      let sdt = dt * timeScale;
      if (finalSlow > 0) { finalSlow -= dt; sdt *= 0.3; }
      if (skipReq) {
        events.forEach(e => { if (!e.done) { e.done = true; e.v.hp = Math.max(0, e.v.hp - e.dmg); if (e.ko) { e.v.alive = false; e.v.koAt = simT - 5; } } });
        simT = endT - 0.2; skipReq = false; setAlive(1);
      }
      simT += sdt;
      // 자기장
      const zk = clamp(simT / (duelStart - 0.5), 0, 1);
      zone.r = duel ? lerp(zone.r, 260, 0.02) : lerp(zone.r0, zone.rEnd + 120, zk * zk * (3 - 2 * zk));
      // 이벤트
      for (const e of events) {
        if (e.done) continue;
        if (!e.launched && simT >= e.t - e.lead) { e.launched = true; launch(e); }
        if (!e.launched && simT >= e.t - e.lead - 1.4) e.a.chase = { v: e.v, until: e.t };
        if (e.pendingHit && simT >= e.t) { e.pendingHit = false; e.done = true; applyHit(e); }
      }
      const aliveF = F.filter(f => f.alive);
      if (!duel && aliveF.length === 2 && N >= 2) {
        duel = true;
        SFX.play('v_sudden'); SFX.play('zone', { delay: .3 });
        H.banner('최후의 결투!', `${champ.p.name} VS ${second.p.name}`);
        H.comment(`최후의 2인! <b>${UI.esc(champ.p.name)}</b> VS <b>${UI.esc(second.p.name)}</b>`, 'swords', true);
      }
      // 전투원 이동
      aliveF.forEach((f, i) => {
        let ax = 0, ay = 0;
        f.wander += sdt * rand(-1.5, 1.5);
        ax += Math.cos(f.wander) * 60; ay += Math.sin(f.wander) * 60;
        aliveF.forEach(o => { if (o === f) return; const dx = f.x - o.x, dy = f.y - o.y, d = Math.hypot(dx, dy); if (d < 110 && d > 0) { ax += dx / d * (110 - d) * 6; ay += dy / d * (110 - d) * 6; } });
        const dc = Math.hypot(f.x - CX, (f.y - CY) * 1.6);
        if (dc > zone.r * 0.85) { ax += (CX - f.x) / dc * 400; ay += (CY - f.y) / dc * 400; }
        if (duel) { const o = aliveF.find(x => x !== f); if (o) { const d = dist(f, o); const want = 300; const dx = (o.x - f.x) / d, dy = (o.y - f.y) / d; ax += dx * (d - want) * 3 - dy * 160; ay += dy * (d - want) * 3 + dx * 160; } }
        if (f.chase && simT < f.chase.until && f.chase.v.alive) {
          const o = f.chase.v, d = dist(f, o), range = f.st.kind === 'melee' ? 90 : 300;
          if (d > range) { ax += (o.x - f.x) / d * 500; ay += (o.y - f.y) / d * 500; }
          f.face = o.x < f.x ? -1 : 1;
        }
        f.vx = (f.vx + ax * sdt) * Math.pow(0.08, sdt); f.vy = (f.vy + ay * sdt) * Math.pow(0.08, sdt);
        const sp = Math.hypot(f.vx, f.vy), mx = 260;
        if (sp > mx * 3) { f.vx *= mx * 3 / sp; f.vy *= mx * 3 / sp; }
        if (f.dash) {
          const k = clamp((simT - f.dash.t0) / Math.max(0.01, f.dash.t1 - f.dash.t0), 0, 1), e2 = k * k;
          const tx = f.dash.to.x - (f.dash.to.x - f.dash.from.x > 0 ? 1 : -1) * 0, ty = f.dash.to.y;
          const dx = f.dash.to.x - f.dash.from.x, dy = f.dash.to.y - f.dash.from.y, dl = Math.hypot(dx, dy) || 1;
          f.x = lerp(f.dash.from.x, tx - dx / dl * 70, e2); f.y = lerp(f.dash.from.y, ty - dy / dl * 30, e2);
          if (Math.random() < 0.6) fxs.push({ ghost: true, f, x: f.x, y: f.y, age: 0, life: 0.25 });
          if (k >= 1) f.dash = null;
        } else { f.x += f.vx * sdt; f.y += f.vy * sdt; }
        if (Math.abs(f.vx) > 20 && !f.chase) f.face = f.vx < 0 ? -1 : 1;
        f.x = clamp(f.x, 80, WW - 80); f.y = clamp(f.y, 120, WH - 60);
        f.flash = Math.max(0, f.flash - sdt * 4);
        f.shown = lerp(f.shown, f.hp, 0.15);
        ambient(f, sdt);
        if (f.lvFx > 0) f.lvFx -= sdt;
      });
      // 몬스터
      if (!duel && simT < duelStart) {
        spawnAcc += sdt * (5 + simT * 0.12);
        while (spawnAcc > 1 && monsters.length < 150) {
          spawnAcc--;
          const a = rand(0, 6.28), r = zone.r + 160;
          monsters.push({ type: pick(['m_slime', 'm_slime', 'm_bat', 'm_mushroom', 'm_ghost']), x: CX + Math.cos(a) * r, y: CY + Math.sin(a) * r * 0.62, sp: rand(55, 95), ph: rand(0, 6) });
        }
      }
      monsters.forEach(m => {
        let best = null, bd = 1e9;
        aliveF.forEach(f => { const d = dist(m, f); if (d < bd) { bd = d; best = f; } });
        if (best && bd > 40) { m.x += (best.x - m.x) / bd * m.sp * sdt; m.y += (best.y - m.y) / bd * m.sp * sdt; }
        if (duel) killMonster(m, best || F[0]);
      });
      // 도적의 회전 단검: 닿는 몬스터 처치
      aliveF.forEach(f => {
        if (f.p.cls !== 'thief') return;
        for (let k = 0; k < 2; k++) { const a = f.orbit + k * Math.PI, ox = f.x + Math.cos(a) * 95, oy = f.y - 30 + Math.sin(a) * 60; monsters.forEach(m => { if (Math.hypot(m.x - ox, m.y - oy) < 50) killMonster(m, f); }); }
      });
      for (let i = monsters.length - 1; i >= 0; i--) if (monsters[i].dead) monsters.splice(i, 1);
      // 투사체
      for (let i = projs.length - 1; i >= 0; i--) {
        const q = projs[i];
        if (q.target) {
          const rt = q.arrive - simT;
          const tx = q.target.x, ty = q.target.y - 40;
          if (rt <= 0) { if (q.ev && !q.ev.done) { q.ev.done = true; applyHit(q.ev); } projs.splice(i, 1); continue; }
          q.vx = (tx - q.x) / rt; q.vy = (ty - q.y) / rt;
          q.x += q.vx * sdt; q.y += q.vy * sdt;
        } else {
          q.x += q.vx * sdt; q.y += q.vy * sdt; q.life -= sdt;
          let hit = false;
          for (const m of monsters) if (!m.dead && Math.hypot(m.x - q.x, m.y - q.y) < 46) { killMonster(m, q.owner || F[0]); hit = q.img !== 'arrow'; if (hit) break; }
          if (hit || q.life <= 0) { if (hit) addFx('explosion', q.x, q.y, 120, 0.3); projs.splice(i, 1); continue; }
        }
        if (Math.random() < 0.5) sparks.push({ x: q.x, y: q.y, vx: rand(-30, 30), vy: rand(-30, 30), life: 0.3, age: 0, c: q.img === 'fireball' ? '#ff9d1c' : q.img === 'arrow' ? '#4ff0a0' : '#ffcf4a', r: rand(2, 4) });
      }
      // 보석
      for (let i = gems.length - 1; i >= 0; i--) {
        const g = gems[i]; g.age += sdt;
        if (!g.to.alive) { const al = F.filter(f => f.alive); if (!al.length) { gems.splice(i, 1); continue; } g.to = al[0]; }
        if (g.age > 0.35) { const d = dist(g, g.to); const sp = 900 * Math.min(1, (g.age - 0.35) * 2); g.x += (g.to.x - g.x) / (d || 1) * sp * sdt; g.y += (g.to.y - 40 - g.y) / (d || 1) * sp * sdt; if (d < 40) { gems.splice(i, 1); g.to.exp++; SFX.play('gem', { vary: .6, gap: 90, vol: .2 }); if (g.to.exp % 14 === 0) { g.to.lv++; g.to.lvFx = 0.8; floater('LEVEL UP!', g.to.x, g.to.y - 120, '#3ee0ff', 30); SFX.play('levelup', { vol: .35, gap: 400 }); } } }
      }
      // 효과
      fxs.forEach(e => { if (e.delay > 0) { e.delay -= sdt; return; } e.age += sdt; if (e.track) { const k = clamp(e.age / e.life, 0, 1); e.x = lerp(e.track.from.x, e.track.tx.x, k); e.y = lerp(e.track.from.y, e.track.tx.y - 40, k); } });
      for (let i = fxs.length - 1; i >= 0; i--) { const e = fxs[i]; if (e.age >= e.life && !(e.delay > 0)) { if (e.onEnd) e.onEnd(); fxs.splice(i, 1); } }
      sparks.forEach(s => { s.age += sdt; s.x += s.vx * sdt; s.y += s.vy * sdt; s.vx *= 0.92; s.vy *= 0.92; });
      for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i].age >= sparks[i].life) sparks.splice(i, 1);
      floaters.forEach(f => { f.age += sdt; f.y += f.vy * sdt; f.vy *= 0.95; });
      for (let i = floaters.length - 1; i >= 0; i--) if (floaters[i].age >= floaters[i].life) floaters.splice(i, 1);
      // 카메라
      const al = F.filter(f => f.alive);
      let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
      al.forEach(f => { minx = Math.min(minx, f.x); maxx = Math.max(maxx, f.x); miny = Math.min(miny, f.y); maxy = Math.max(maxy, f.y); });
      if (!al.length) { minx = maxx = CX; miny = maxy = CY; }
      const vw = canvas.clientWidth, vh = canvas.clientHeight;
      const fit = Math.min(vw / (maxx - minx + 700), vh / (maxy - miny + 520));
      // 살아 있는 전원이 화면에 들어오도록 (세로로 긴 화면에서도)
      const zTarget = clamp(fit, Math.min(vw / WW, vh / WH), al.length <= 2 ? 1.25 : 1.0) * (1 + cam.punch);
      cam.punch *= 0.9;
      cam.z = lerp(cam.z, zTarget, 0.04);
      cam.x = lerp(cam.x, (minx + maxx) / 2, 0.06); cam.y = lerp(cam.y, (miny + maxy) / 2, 0.06);
      cam.shake *= 0.88;
      if (!ended && simT >= endT) { ended = true; setTimeout(() => { if (destroyed) return; cleanup(); onDone(); }, 200); }
    }

    function draw() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const vw = canvas.clientWidth, vh = canvas.clientHeight;
      if (canvas.width !== Math.round(vw * dpr) || canvas.height !== Math.round(vh * dpr)) { canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#0b0920'; ctx.fillRect(0, 0, vw, vh);
      const z = cam.z, sx = rand(-1, 1) * cam.shake, sy = rand(-1, 1) * cam.shake;
      ctx.save();
      ctx.translate(vw / 2 + sx, vh / 2 + sy); ctx.scale(z, z); ctx.translate(-cam.x, -cam.y);
      // 아레나
      if (IMG.arena) ctx.drawImage(IMG.arena, 0, 0, WW, WH);
      // 자기장 밖
      ctx.save();
      ctx.beginPath(); ctx.rect(-2000, -2000, WW + 4000, WH + 4000);
      ctx.ellipse(CX, CY, zone.r, zone.r * 0.62, 0, 0, Math.PI * 2, true);
      ctx.fillStyle = 'rgba(90,0,60,0.42)'; ctx.fill('evenodd');
      ctx.restore();
      ctx.save();
      ctx.beginPath(); ctx.ellipse(CX, CY, zone.r, zone.r * 0.62, 0, 0, Math.PI * 2);
      ctx.setLineDash([40, 22]); ctx.lineDashOffset = -simT * 80;
      ctx.strokeStyle = 'rgba(255,95,162,.25)'; ctx.lineWidth = 26; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,95,162,.9)'; ctx.lineWidth = 8; ctx.stroke();
      ctx.restore();
      // 보석
      gems.forEach(g => { if (IMG.fx_gem) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(IMG.fx_gem, g.x - 18, g.y - 18, 36, 36); ctx.restore(); } });
      // 몬스터 + 전투원 (y 정렬)
      const aliveN = F.reduce((n, f) => n + (f.alive ? 1 : 0), 0);
      const list = monsters.map(m => ({ y: m.y, m })).concat(F.filter(f => f.alive || simT - f.koAt < 1.2).map(f => ({ y: f.y, f })));
      list.sort((a, b) => a.y - b.y);
      list.forEach(o => {
        if (o.m) {
          const m = o.m, im = IMG[m.type]; if (!im) return;
          const s = 64, bob = Math.sin(simT * 8 + m.ph) * 4;
          ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(m.x, m.y + 4, 22, 8, 0, 0, 7); ctx.fill();
          ctx.drawImage(im, m.x - s / 2, m.y - s + bob, s, s);
        } else drawFighter(o.f, aliveN);
      });
      // 효과
      fxs.forEach(e => {
        if (e.ghost) { const f = e.f, im = IMG['run_' + f.p.cls]; if (!im) return; ctx.save(); ctx.globalAlpha = 0.35 * (1 - e.age / e.life); ctx.globalCompositeOperation = 'lighter'; const s = 130; ctx.translate(e.x, e.y); ctx.scale(f.face, 1); ctx.drawImage(im, -s / 2, -s, s, s); ctx.restore(); e.age += 1 / 60; return; }
        if (e.delay > 0 || !e.img) return;
        const k = clamp(e.age / e.life, 0, 1), sc = lerp(e.s0, e.s1, Math.sqrt(k)), s = e.size * sc;
        ctx.save(); ctx.globalAlpha = e.track ? 1 : 1 - k * k; if (e.add) ctx.globalCompositeOperation = 'lighter';
        ctx.translate(e.x, e.y); ctx.rotate(e.rot); ctx.drawImage(e.img, -s / 2, -s / 2, s, s); ctx.restore();
      });
      // 투사체
      projs.forEach(q => {
        const im = IMG['fx_' + q.img]; if (!im) return;
        const a = Math.atan2(q.vy || 0, q.vx || 1);
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(q.x, q.y);
        if (q.img === 'dagger' || q.img === 'notes') ctx.rotate(simT * 12); else ctx.rotate(a + (q.img === 'arrow' ? Math.PI * 0.75 : Math.PI * 0.8));
        ctx.drawImage(im, -q.size / 2, -q.size / 2, q.size, q.size); ctx.restore();
      });
      // 불꽃
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      sparks.forEach(s => { ctx.globalAlpha = 1 - s.age / s.life; ctx.fillStyle = s.c; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.fill(); });
      ctx.restore();
      // 숫자
      floaters.forEach(f => {
        const k = f.age / f.life, sc = k < 0.15 ? 0.6 + k / 0.15 * 0.6 : 1.2 - (k - 0.15) * 0.25;
        ctx.save(); ctx.globalAlpha = 1 - Math.max(0, k - 0.6) / 0.4; ctx.translate(f.x, f.y); ctx.scale(sc, sc);
        ctx.font = `${f.size}px "Black Han Sans", Jua, sans-serif`; ctx.textAlign = 'center';
        ctx.lineWidth = 7; ctx.strokeStyle = '#1a0a2e'; ctx.strokeText(f.text, 0, 0); ctx.fillStyle = f.color; ctx.fillText(f.text, 0, 0);
        ctx.restore();
      });
      ctx.restore();
    }

    function drawFighter(f, aliveN) {
      const im = IMG['run_' + f.p.cls]; if (!im) return;
      const dead = !f.alive;
      const k = dead ? clamp((simT - f.koAt) / 1.2, 0, 1) : 0;
      const s = (duel ? 190 : 140) * (1 + (f.lvFx > 0 ? 0.1 : 0));
      const moving = Math.hypot(f.vx, f.vy) > 30 || f.dash;
      const bob = moving && !dead ? Math.abs(Math.sin(simT * 14 + f.orbit)) * 8 : Math.sin(simT * 3 + f.orbit) * 2;
      // 발밑 링 + 그림자
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(f.x, f.y + 4, s * 0.28, s * 0.09, 0, 0, 7); ctx.fill();
      if (!dead) { ctx.strokeStyle = (CLASSES[f.p.cls] || CLASSES.warrior).color; ctx.lineWidth = 4; ctx.globalAlpha = 0.8; ctx.beginPath(); ctx.ellipse(f.x, f.y + 4, s * 0.3, s * 0.1, 0, 0, 7); ctx.stroke(); }
      ctx.restore();
      if (f.lvFx > 0) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = f.lvFx; ctx.strokeStyle = '#3ee0ff'; ctx.lineWidth = 6; ctx.beginPath(); ctx.ellipse(f.x, f.y, s * 0.5 * (1.8 - f.lvFx), s * 0.2 * (1.8 - f.lvFx), 0, 0, 7); ctx.stroke(); ctx.restore(); }
      ctx.save();
      ctx.translate(f.x, f.y - bob - (dead ? k * 60 : 0));
      if (dead) { ctx.globalAlpha = 1 - k; ctx.rotate(k * f.face * 1.4); }
      ctx.scale(f.face, 1);
      ctx.drawImage(im, -s / 2, -s, s, s);
      if (f.flash > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = f.flash * 0.8; ctx.drawImage(im, -s / 2, -s, s, s); ctx.drawImage(im, -s / 2, -s, s, s); }
      ctx.restore();
      if (dead) { if (IMG.m_ghost && k > 0.3) { ctx.save(); ctx.globalAlpha = 1 - k; ctx.drawImage(IMG.m_ghost, f.x - 30, f.y - s - 40 - k * 120, 60, 60); ctx.restore(); } return; }
      // 도적 회전 단검
      if (f.p.cls === 'thief' && IMG.fx_dagger) for (let j = 0; j < 2; j++) { const a = f.orbit + j * Math.PI; ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(f.x + Math.cos(a) * 95, f.y - 30 + Math.sin(a) * 60); ctx.rotate(a * 2); ctx.drawImage(IMG.fx_dagger, -36, -36, 72, 72); ctx.restore(); }
      // 이름 + 체력
      const bw = s * 0.7, by = f.y - s - 16;
      ctx.fillStyle = 'rgba(0,0,0,.65)'; roundRect(f.x - bw / 2 - 2, by - 2, bw + 4, 14, 6); ctx.fill();
      const hpc = f.shown > 50 ? '#4ff0a0' : f.shown > 25 ? '#ffcf4a' : '#ff5a6e';
      ctx.fillStyle = hpc; roundRect(f.x - bw / 2, by, bw * f.shown / 100, 10, 5); ctx.fill();
      ctx.font = `${duel ? 30 : 22}px Jua, sans-serif`; ctx.textAlign = 'center';
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(10,5,30,.9)'; ctx.strokeText(f.p.name, f.x, by - 8);
      ctx.fillStyle = '#fff'; ctx.fillText(f.p.name, f.x, by - 8);
      if (aliveN === 1 && IMG.crown) ctx.drawImage(IMG.crown, f.x - 40, by - 110 + Math.sin(simT * 4) * 6, 80, 80);
    }
    function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

    function loop(now) {
      if (destroyed) return;
      // 느린 컴퓨터에서도 경기가 늘어지지 않도록, 프레임이 밀리면 나눠서 여러 번 계산
      const dt = Math.min(0.25, Math.max(0, (now - last) / 1000)); last = now;
      for (let rem = dt; rem > 0 && !destroyed; rem -= 0.05) update(Math.min(0.05, rem));
      if (destroyed) return;
      draw();
      H.tick();
      raf = requestAnimationFrame(loop);
    }
    function cleanup() {
      destroyed = true; cancelAnimationFrame(raf); H.destroy(); SFX.crowd(0, 1.5);
      [monsters, projs, fxs, sparks, floaters, gems].forEach(a => { a.length = 0; });
    }

    FX.loadImages(srcs).then(imgs => {
      if (destroyed) return;
      IMG = imgs;
      setAlive(N);
      cam.z = Math.max(canvas.clientWidth / WW, canvas.clientHeight / WH);
      raf = requestAnimationFrame(loop);
      H.comment(`${N}명의 용사가 아레나에 모였다! 몬스터 떼가 몰려온다!`, 'skull', true);
      SFX.crowd(.35, 1.5); SFX.play('v_prepare', { delay: .1 });
      H.countdown(['3', '2', '1', 'FIGHT!']).then(() => {
        if (destroyed) return;
        started = true; simT = 0; H.flash(); cam.shake = 16;
      });
    });
    return ctrl;
  }

  window.Battle2D = { run };
})();
