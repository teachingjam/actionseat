// 결승전 공통 HUD/연출 도구
(function () {
  const { esc, icon } = UI;
  const { CLASSES, STATS } = GameData;

  function loadImages(map) {
    const out = {};
    return Promise.all(Object.entries(map).map(([k, src]) => new Promise(res => {
      const im = new Image();
      im.onload = () => { out[k] = im; res(); };
      im.onerror = () => res();
      im.src = src;
    }))).then(() => out);
  }

  function skillOf(p) {
    const top = GameData.topStat(p.stats || {});
    const c = CLASSES[p.cls] || CLASSES.warrior;
    return { name: c.skills[top], stat: top };
  }

  function createHud(root, opts) {
    root.innerHTML = `<div class="fin">
      <canvas class="main"></canvas>
      <div class="overlay">
        <div class="name-tags"></div>
        <canvas class="speedlines"></canvas>
        <div class="vignette"></div>
        <div class="hud-title">${icon(opts.icon, 54)}<span>${esc(opts.title)}</span></div>
        <div class="banner-wrap"></div>
        <div class="cutin-wrap"></div>
        <div class="commentary"></div>
        <div class="countdown"></div>
        <canvas class="confetti" style="position:absolute;inset:0;width:100%;height:100%"></canvas>
        <div class="flash"></div>
      </div></div>`;
    const el = root.firstElementChild;
    const q = s => el.querySelector(s);
    const H = {
      el, canvas: q('canvas.main'), overlay: q('.overlay'), tags: q('.name-tags'),
      lastComment: 0, confetti: [], destroyed: false,
      loading(on) { const l = el.querySelector('.fin-load'); if (on && !l) el.insertAdjacentHTML('beforeend', '<div class="fin-load"><div class="spinner"></div><p>경기장을 준비하고 있어요…</p></div>'); if (!on && l) l.remove(); },
      comment(text, ic, force) {
        const now = performance.now();
        if (!force && now - H.lastComment < 700) return;
        H.lastComment = now;
        const d = document.createElement('div');
        d.className = 'comment';
        d.innerHTML = (ic ? icon(ic, 36) : '') + `<span>${text}</span>`;
        const box = q('.commentary');
        box.appendChild(d);
        while (box.children.length > 2) box.firstChild.remove();
        setTimeout(() => d.remove(), 3400);
      },
      banner(text, sub, grad) {
        if (window.SFX) SFX.play(text === '역전!' ? 'whoosh' : 'glass', { vol: .6 });
        const w = q('.banner-wrap');
        w.innerHTML = `<div class="banner ${grad === false ? '' : 'grad-text'}">${esc(text)}${sub ? `<small>${esc(sub)}</small>` : ''}</div>`;
      },
      flash() { const f = q('.flash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); },
      cutin(p, skill) {
        if (window.SFX) { SFX.play('ult'); SFX.whoosh({ up: true, vol: .45 }); }
        const c = CLASSES[p.cls] || CLASSES.warrior;
        const w = q('.cutin-wrap');
        w.innerHTML = `<div class="cutin"><div class="ci-band"></div><img class="ci-img" src="${c.cut}" alt="">
          <div class="ci-text">${esc(skill)}!<small>${esc(p.name)} · ${c.name}</small></div></div>`;
        setTimeout(() => { if (w.firstChild) w.innerHTML = ''; }, 1600);
      },
      countdown(words) {
        const box = q('.countdown');
        const seq = words || ['3', '2', '1', 'GO!'];
        return new Promise(res => {
          let i = 0;
          const step = () => {
            if (H.destroyed) return res();
            if (i >= seq.length) { box.innerHTML = ''; return res(); }
            if (window.SFX) {
              if (i === seq.length - 1) { SFX.play('go'); SFX.cheer(); }
              else SFX.play('beep', { rate: 1 + i * .06 });
            }
            box.innerHTML = `<span class="grad-text">${seq[i]}</span>`;
            i++;
            setTimeout(step, i === seq.length ? 600 : 850);
          };
          step();
        });
      },
      burst(x, y, n) {
        if (window.SFX) { SFX.play('j_win'); SFX.cheer(); }
        const cv = q('canvas.confetti');
        const colors = ['#ffcf4a', '#ff5fa2', '#3ee0ff', '#4ff0a0', '#8c6bff', '#ffffff'];
        const W = cv.clientWidth, Hh = cv.clientHeight;
        for (let i = 0; i < (n || 260); i++) {
          H.confetti.push({ x: x == null ? W / 2 : x, y: y == null ? Hh * 0.4 : y, vx: (Math.random() - .5) * 22, vy: -Math.random() * 20 - 4, r: 5 + Math.random() * 7, c: colors[i % colors.length], a: Math.random() * 6, va: (Math.random() - .5) * .4 });
        }
      },
      tick() {
        const cv = q('canvas.confetti');
        const dpr = window.devicePixelRatio || 1;
        if (cv.width !== cv.clientWidth * dpr) { cv.width = cv.clientWidth * dpr; cv.height = cv.clientHeight * dpr; }
        const ctx = cv.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, cv.clientWidth, cv.clientHeight);
        H.confetti.forEach(p => {
          p.vy += 0.4; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.a += p.va;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c;
          ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); ctx.restore();
        });
        H.confetti = H.confetti.filter(p => p.y < cv.clientHeight + 40);
      },
      // 속도선 (집중선)
      speed(on, intensity) {
        const cv = q('canvas.speedlines');
        cv.style.opacity = on ? (intensity || 0.7) : 0;
        if (!on) return;
        const dpr = 1, W = cv.clientWidth, Hh = cv.clientHeight;
        if (cv.width !== W) { cv.width = W; cv.height = Hh; }
        const ctx = cv.getContext('2d');
        ctx.clearRect(0, 0, W, Hh);
        const cx = W / 2, cy = Hh / 2;
        for (let i = 0; i < 70; i++) {
          const a = Math.random() * Math.PI * 2, r0 = Math.max(W, Hh) * (0.32 + Math.random() * 0.2), r1 = Math.max(W, Hh) * 0.9;
          ctx.strokeStyle = `rgba(255,255,255,${0.15 + Math.random() * 0.35})`;
          ctx.lineWidth = 1 + Math.random() * 3;
          ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); ctx.stroke();
        }
      },
      destroy() { H.destroyed = true; }
    };
    return H;
  }

  // 순위표 (부드럽게 자리 이동)
  function createStandings(container, players, max) {
    const box = document.createElement('div');
    box.className = 'standings';
    container.appendChild(box);
    const rows = new Map();
    players.forEach(p => {
      const r = document.createElement('div');
      r.className = 'st-row';
      r.innerHTML = `<b></b><img src="${(CLASSES[p.cls] || CLASSES.warrior).img}" alt=""><span>${esc(p.name)}</span>`;
      r.style.opacity = 0;
      box.appendChild(r);
      rows.set(p.id, { el: r, pos: -1 });
    });
    return {
      update(order, finishedSet) {
        order.forEach((id, i) => {
          const o = rows.get(id); if (!o) return;
          if (o.pos !== i) {
            if (o.pos > i && o.pos !== -1 && i < max) { o.el.classList.remove('up'); void o.el.offsetWidth; o.el.classList.add('up'); }
            o.pos = i;
            o.el.querySelector('b').textContent = i + 1;
            o.el.style.transform = `translateY(${i * 44}px)`;
            o.el.style.opacity = i < max ? 1 : 0;
          }
          o.el.classList.toggle('fin-row', !!(finishedSet && finishedSet.has(id)));
        });
      }
    };
  }

  window.FX = { loadImages, skillOf, createHud, createStandings };
})();
