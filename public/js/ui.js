// 공용 UI 도우미
(function () {
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  // 이미지 아이콘 (assets/icons/<name>.png)
  function icon(name, size, cls) {
    const s = size || 24;
    return `<img class="ico ${cls || ''}" src="assets/icons/${name}.png" alt="" style="width:${s}px;height:${s}px" draggable="false">`;
  }
  function toast(msg, ic) {
    let wrap = $('#toast-wrap');
    if (!wrap) { wrap = document.createElement('div'); wrap.id = 'toast-wrap'; document.body.appendChild(wrap); }
    const d = document.createElement('div');
    d.className = 'toast';
    if (window.SFX) SFX.play('pop', { vol: .45 });
    d.innerHTML = (ic ? icon(ic, 26) : '') + `<span>${msg}</span>`;
    wrap.appendChild(d);
    setTimeout(() => d.remove(), 2800);
  }
  // 브라우저 confirm 대신 쓰는 화면 내 확인창 (일부 환경에서 기본 confirm이 막혀 있음)
  function confirmBox(msg, opts) {
    opts = opts || {};
    return new Promise(resolve => {
      if (window.SFX) SFX.play('open', { vol: .5 });
      const ov = document.createElement('div');
      ov.className = 'modal-ov';
      ov.innerHTML = `<div class="modal pop-in">
        ${opts.icon ? `<div class="modal-ic">${icon(opts.icon, 72, 'bob')}</div>` : ''}
        ${opts.title ? `<h3>${esc(opts.title)}</h3>` : ''}
        <p>${msg}</p>
        <div class="modal-btns">
          ${opts.alert ? '' : `<button class="btn ghost" data-v="0">${esc(opts.cancel || '취소')}</button>`}
          <button class="btn ${opts.danger ? 'danger' : ''}" data-v="1">${esc(opts.ok || '확인')}</button>
        </div></div>`;
      document.body.appendChild(ov);
      const done = v => { ov.classList.add('out'); setTimeout(() => ov.remove(), 180); document.removeEventListener('keydown', onKey); resolve(v); };
      const onKey = e => { if (e.key === 'Escape') done(false); if (e.key === 'Enter') done(true); };
      document.addEventListener('keydown', onKey);
      $$('button', ov).forEach(b => b.addEventListener('click', () => done(b.dataset.v === '1')));
      ov.addEventListener('click', e => { if (e.target === ov && !opts.alert) done(false); });
      setTimeout(() => { const b = $('button[data-v="1"]', ov); b && b.focus(); }, 50);
    });
  }
  function alertBox(msg, opts) { return confirmBox(msg, Object.assign({ alert: true }, opts || {})); }

  function show(id) {
    $$('section[id^="v-"]').forEach(s => s.classList.toggle('hidden', s.id !== id));
    window.scrollTo(0, 0);
  }
  function statBars(stats, max) {
    const m = max || Math.max(12, ...GameData.STATS.map(s => stats[s.key] || 0));
    return GameData.STATS.map(s => {
      const v = stats[s.key] || 0;
      return `<div class="stat-row"><span class="stat-name">${icon(s.key, 22)} ${s.name}</span><div class="stat-bar"><i style="width:${Math.min(100, v / m * 100)}%;--c:${s.color}"></i></div><span class="stat-val">${v}</span></div>`;
    }).join('');
  }
  function radarSVG(stats) {
    const S = GameData.STATS, cx = 130, cy = 132, R = 84;
    const max = Math.max(15, ...S.map(s => stats[s.key] || 0));
    const pt = (i, r) => {
      const a = -Math.PI / 2 + i * 2 * Math.PI / S.length;
      return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    };
    let g = '<defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd166"/><stop offset="1" stop-color="#ff5fa2"/></linearGradient></defs>';
    [0.33, 0.66, 1].forEach(f => {
      g += `<polygon points="${S.map((s, i) => pt(i, R * f).join(',')).join(' ')}" fill="${f === 1 ? 'rgba(255,255,255,.04)' : 'none'}" stroke="rgba(255,255,255,.16)"/>`;
    });
    S.forEach((s, i) => {
      const [x, y] = pt(i, R); const [lx, ly] = pt(i, R + 26);
      g += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="rgba(255,255,255,.12)"/>`;
      g += `<image href="assets/icons/${s.key}.png" x="${lx - 13}" y="${ly - 22}" width="26" height="26"/>`;
      g += `<text x="${lx}" y="${ly + 16}" text-anchor="middle" fill="#fff" font-size="12" font-family="Jua">${s.name} ${stats[s.key] || 0}</text>`;
    });
    const poly = S.map((s, i) => pt(i, R * Math.max(0.05, (stats[s.key] || 0) / max)).join(',')).join(' ');
    g += `<polygon class="radar-poly" points="${poly}" fill="url(#rg)" fill-opacity=".55" stroke="#ffd166" stroke-width="3" stroke-linejoin="round"/>`;
    return g;
  }
  function uid() {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  }
  function store(key, val) {
    try {
      if (val === undefined) return JSON.parse(localStorage.getItem(key) || 'null');
      if (val === null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(val));
    } catch (e) { return null; }
  }
  // 숫자 카운트업 모션
  function countUp(el, to, ms) {
    const from = +el.textContent || 0, t0 = performance.now(), d = ms || 600;
    const tick = now => {
      const k = Math.min(1, (now - t0) / d), e = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  window.UI = { $, $$, esc, icon, toast, confirm: confirmBox, alert: alertBox, show, statBars, radarSVG, uid, store, countUp };
})();
