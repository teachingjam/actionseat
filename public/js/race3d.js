// 3D 육상 트랙 레이스 (three.js r128)
// 목표 순위(rank)대로 결승선을 통과하도록, 장애물·부스터 등 '사건'을 거리 기준으로 배치하고 속도를 보정합니다.
(function () {
  const { CLASSES } = GameData;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const lerp = (a, b, k) => a + (b - a) * k;

  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 8;
    return t;
  }

  function run(root, players, onDone) {
    let destroyed = false, raf = 0, skipReq = false;
    const ctrl = { skip() { skipReq = true; }, destroy() { destroyed = true; cleanup(); } };
    const H = FX.createHud(root, { title: '자리 쟁탈 대운동회', icon: 'shoe' });
    const N = players.length;

    // ---------------- 트랙 기하 ----------------
    const LANE_W = 1.55;
    const NL = clamp(Math.ceil(N / 2), 8, 14);
    const W = NL * LANE_W;
    const Ls = 110, R0 = 34, Rc = R0 + W / 2;
    const L = 2 * Ls + 2 * Math.PI * Rc;
    const uF = Ls * 0.82;          // 출발=결승선 위치 (첫 번째 직선 끝부분)
    const D = L;                   // 한 바퀴
    function frame(u) {
      u = ((u % L) + L) % L;
      let x, z, tx, tz, nx, nz;
      if (u < Ls) { x = -Ls / 2 + u; z = -Rc; tx = 1; tz = 0; nx = 0; nz = -1; }
      else if (u < Ls + Math.PI * Rc) { const th = -Math.PI / 2 + (u - Ls) / Rc; x = Ls / 2 + Rc * Math.cos(th); z = Rc * Math.sin(th); tx = -Math.sin(th); tz = Math.cos(th); nx = Math.cos(th); nz = Math.sin(th); }
      else if (u < 2 * Ls + Math.PI * Rc) { const v = u - Ls - Math.PI * Rc; x = Ls / 2 - v; z = Rc; tx = -1; tz = 0; nx = 0; nz = 1; }
      else { const th = Math.PI / 2 + (u - 2 * Ls - Math.PI * Rc) / Rc; x = -Ls / 2 + Rc * Math.cos(th); z = Rc * Math.sin(th); tx = -Math.sin(th); tz = Math.cos(th); nx = Math.cos(th); nz = Math.sin(th); }
      return { x, z, tx, tz, nx, nz };
    }
    const sToU = s => uF + s;
    function posAt(s, d, y) { const f = frame(sToU(s)); return new THREE.Vector3(f.x + f.nx * d, y || 0, f.z + f.nz * d); }

    // ---------------- three.js 기본 ----------------
    const renderer = new THREE.WebGLRenderer({ canvas: H.canvas, antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    const scene = new THREE.Scene();
    scene.background = canvasTex(4, 256, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#3b6fd6'); gr.addColorStop(0.55, '#8fc2ff'); gr.addColorStop(0.8, '#ffd9a8'); gr.addColorStop(1, '#ffb27a');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    scene.background.encoding = THREE.sRGBEncoding;
    scene.fog = new THREE.Fog(0xffd2a6, 160, 420);
    const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 1000);
    scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x48663a, 0.8));
    const sun = new THREE.DirectionalLight(0xfff0d8, 1.25);
    sun.position.set(-90, 140, -60);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -180, right: 180, top: 120, bottom: -120, near: 10, far: 400 });
    scene.add(sun);

    function resize() {
      const w = H.el.clientWidth, h = H.el.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    resize();
    window.addEventListener('resize', resize);

    // ---------------- 경기장 만들기 ----------------
    const loader = new THREE.TextureLoader();
    const T = f => { const t = loader.load(f); t.encoding = THREE.sRGBEncoding; return t; };

    // 바닥
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshLambertMaterial({ color: 0x3f6b3a }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05; ground.receiveShadow = true;
    scene.add(ground);

    // 트랙 (적갈색 탄성 포장 + 레인선)
    const trackTex = canvasTex(512, 256, (g, w, h) => {
      g.fillStyle = '#c4482f'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(${Math.random() < .5 ? '255,140,110' : '90,20,10'},${Math.random() * .18})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
      g.fillStyle = '#fff';
      for (let i = 0; i <= NL; i++) g.fillRect(Math.round(i * w / NL) - (i === 0 ? 0 : i === NL ? 5 : 2), 0, i === 0 || i === NL ? 5 : 4, h);
    });
    trackTex.wrapS = THREE.ClampToEdgeWrapping; trackTex.wrapT = THREE.RepeatWrapping;
    trackTex.encoding = THREE.sRGBEncoding;
    {
      const M = Math.ceil(L), pos = [], uv = [], idx = [];
      for (let i = 0; i <= M; i++) {
        const u = i / M * L, f = frame(u);
        pos.push(f.x - f.nx * W / 2, 0.02, f.z - f.nz * W / 2, f.x + f.nx * W / 2, 0.02, f.z + f.nz * W / 2);
        uv.push(0, u / 6, 1, u / 6);
        if (i < M) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx); geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: trackTex, side: THREE.DoubleSide }));
      mesh.receiveShadow = true; scene.add(mesh);
      // 연석
      const curb = (d, col) => {
        const p2 = [], i2 = [];
        for (let i = 0; i <= M; i++) { const f = frame(i / M * L); p2.push(f.x + f.nx * d, 0.25, f.z + f.nz * d, f.x + f.nx * (d + (d < 0 ? -0.6 : 0.6)), 0.25, f.z + f.nz * (d + (d < 0 ? -0.6 : 0.6))); if (i < M) { const a = i * 2; i2.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } }
        const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.Float32BufferAttribute(p2, 3)); g2.setIndex(i2); g2.computeVertexNormals();
        const m2 = new THREE.Mesh(g2, new THREE.MeshLambertMaterial({ color: col, side: THREE.DoubleSide })); m2.receiveShadow = true; scene.add(m2);
      };
      curb(-W / 2, 0xffffff); curb(W / 2, 0xeeeeee);
    }
    // 잔디 내야
    {
      const shape = new THREE.Shape();
      const M = 200;
      for (let i = 0; i <= M; i++) { const f = frame(i / M * L); const x = f.x - f.nx * (W / 2 + 0.6), z = f.z - f.nz * (W / 2 + 0.6); if (i === 0) shape.moveTo(x, -z); else shape.lineTo(x, -z); }
      const grassTex = canvasTex(256, 256, (g, w, h) => {
        for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#4f9a45' : '#58a84d'; g.fillRect(0, i * h / 8, w, h / 8); }
        for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(20,60,10,${Math.random() * .15})`; g.fillRect(Math.random() * w, Math.random() * h, 1, 3); }
      });
      grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping; grassTex.repeat.set(0.05, 0.05); grassTex.encoding = THREE.sRGBEncoding;
      const geo = new THREE.ShapeGeometry(shape); geo.rotateX(-Math.PI / 2);
      const grass = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: grassTex }));
      grass.position.y = 0.01; grass.receiveShadow = true; scene.add(grass);
      // 내야 중앙 마크
      const ring = new THREE.Mesh(new THREE.RingGeometry(9, 9.6, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .7 }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; scene.add(ring);
    }
    // 관중석 (트랙을 빙 둘러쌈)
    const crowdImg = T('assets/crowd.jpg');
    crowdImg.wrapS = THREE.RepeatWrapping;
    const crowdMat = new THREE.MeshLambertMaterial({ map: crowdImg });
    {
      const seg = 14, tilt = 0.6, standDepth = 16, out0 = W / 2 + 4;
      const roofMat = new THREE.MeshLambertMaterial({ color: 0x2b2f4a });
      const wallMat = new THREE.MeshLambertMaterial({ color: 0x3a3f66 });
      for (let u = 0; u < L; u += seg) {
        const f = frame(u + seg / 2);
        const n = new THREE.Vector3(f.nx, 0, f.nz);
        const c = new THREE.Vector3(f.x, 0, f.z);
        // 텍스처는 하나만 공유하고, 구간마다 UV를 밀어서 관중 그림이 반복돼 보이지 않게 함
        const pg = new THREE.PlaneGeometry(seg + 0.4, standDepth / Math.cos(tilt));
        const uvA = pg.attributes.uv, off = Math.random();
        for (let q = 0; q < uvA.count; q++) uvA.setX(q, uvA.getX(q) * 0.42 + off);
        const plane = new THREE.Mesh(pg, crowdMat);
        const p = c.clone().add(n.clone().multiplyScalar(out0 + standDepth / 2));
        p.y = Math.tan(tilt) * standDepth / 2 + 1.2;
        plane.position.copy(p);
        const faceDir = n.clone().multiplyScalar(-Math.cos(tilt)).add(new THREE.Vector3(0, Math.sin(tilt) + 0.6, 0)).normalize();
        plane.lookAt(p.clone().add(faceDir));
        scene.add(plane);
        // 앞 담장
        const wall = new THREE.Mesh(new THREE.BoxGeometry(seg + 0.4, 1.4, 0.4), wallMat);
        wall.position.copy(c.clone().add(n.clone().multiplyScalar(out0 - 0.2))); wall.position.y = 0.7;
        wall.lookAt(wall.position.clone().add(n)); wall.castShadow = true; wall.receiveShadow = true; scene.add(wall);
        // 지붕
        const roof = new THREE.Mesh(new THREE.BoxGeometry(seg + 0.4, 0.6, 10), roofMat);
        roof.position.copy(c.clone().add(n.clone().multiplyScalar(out0 + standDepth - 2))); roof.position.y = Math.tan(tilt) * standDepth + 7;
        roof.lookAt(roof.position.clone().add(n)); roof.castShadow = true; scene.add(roof);
      }
    }
    // 조명탑
    [[-Ls / 2 - Rc - 10, -Rc - 30], [Ls / 2 + Rc + 10, -Rc - 30], [-Ls / 2 - Rc - 10, Rc + 30], [Ls / 2 + Rc + 10, Rc + 30]].forEach(([x, z]) => {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.2, 50, 8), new THREE.MeshLambertMaterial({ color: 0x8890a8 }));
      pole.position.set(x, 25, z); pole.castShadow = true; scene.add(pole);
      const head = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 1.5), new THREE.MeshBasicMaterial({ color: 0xfff6d0 }));
      head.position.set(x, 51, z); head.lookAt(0, 0, 0); scene.add(head);
    });
    // 결승선 + 아치
    {
      const f = frame(uF);
      const checker = canvasTex(64, 512, (g, w, h) => { const s = 16; for (let y = 0; y < h; y += s) for (let x = 0; x < w; x += s) { g.fillStyle = ((x + y) / s) % 2 ? '#111' : '#fff'; g.fillRect(x, y, s, s); } });
      const line = new THREE.Mesh(new THREE.PlaneGeometry(1.2, W), new THREE.MeshLambertMaterial({ map: checker }));
      line.rotation.x = -Math.PI / 2; line.position.set(f.x, 0.04, f.z);
      scene.add(line);
      const postMat = new THREE.MeshLambertMaterial({ color: 0xffcf4a });
      [-1, 1].forEach(sd => {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.8, 9, 0.8), postMat);
        post.position.set(f.x, 4.5, f.z + sd * (W / 2 + 1)); post.castShadow = true; scene.add(post);
      });
      const bannerTex = canvasTex(1024, 128, (g, w, h) => {
        const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#ff5fa2'); gr.addColorStop(1, '#8c6bff');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
        g.fillStyle = '#fff'; g.font = '84px "Black Han Sans", Jua, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('FINISH', w / 2, h / 2 + 4);
      });
      bannerTex.encoding = THREE.sRGBEncoding;
      // 막대 + 앞뒤 현수막(평면은 앞에서 보면 글자가 바로 보임)
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.4, W + 3), postMat);
      beam.position.set(f.x, 9, f.z); beam.castShadow = true; scene.add(beam);
      [1, -1].forEach(sd => {
        const pl = new THREE.Mesh(new THREE.PlaneGeometry(W + 3, 2.2), new THREE.MeshBasicMaterial({ map: bannerTex }));
        pl.position.set(f.x + sd * 0.27, 9, f.z);
        pl.lookAt(f.x + sd * 10, 9, f.z);
        scene.add(pl);
      });
    }

    // ---------------- 허들 ----------------
    const HURDLES = [0.17, 0.37, 0.6, 0.79].map(k => k * D);
    const stripeTex = canvasTex(128, 16, (g, w, h) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#e03b3b' : '#ffffff'; g.fillRect(i * w / 8, 0, w / 8, h); } });
    const barMat = new THREE.MeshLambertMaterial({ map: stripeTex });
    const legMat = new THREE.MeshLambertMaterial({ color: 0x334 });
    const hurdleObjs = {}; // `${hi}-${lane}` -> group
    HURDLES.forEach((hs, hi) => {
      for (let ln = 0; ln < NL; ln++) {
        const d = -W / 2 + (ln + 0.5) * LANE_W;
        const g = new THREE.Group();
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, LANE_W * 0.86), barMat); bar.position.y = 0.95; bar.castShadow = true; g.add(bar);
        [-1, 1].forEach(sd => { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.95, 0.08), legMat); leg.position.set(0, 0.47, sd * LANE_W * 0.4); leg.castShadow = true; g.add(leg); const foot = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, 0.08), legMat); foot.position.set(-0.25, 0.03, sd * LANE_W * 0.4); g.add(foot); });
        const p = posAt(hs, d); g.position.copy(p);
        const f = frame(sToU(hs)); g.rotation.y = -Math.atan2(f.tz, f.tx);
        scene.add(g); hurdleObjs[hi + '-' + ln] = { g, fall: 0, falling: false };
      }
    });

    // ---------------- 선수 데이터 & 사건 배치 ----------------
    const sorted = players.slice().sort((a, b) => a.rank - b.rank);
    const T1 = 27;
    const finishT = [];
    sorted.forEach((p, i) => {
      if (i === 0) finishT.push(T1);
      else if (i === 1) finishT.push(T1 + 0.22);
      else if (i === 2) finishT.push(finishT[1] + 0.35);
      else finishT.push(finishT[i - 1] + Math.min(0.75, 10 / N) + rand(0, 0.15));
    });
    const runners = sorted.map((p, i) => {
      const rel = N > 1 ? i / (N - 1) : 0;
      const lane = i % NL, row = Math.floor(i / NL);
      const ev = [];
      const used = (a, b) => ev.some(e => !(b < e.s0 - 4 || a > e.s0 + e.len + 4));
      const add = (type, s0, len, f) => { if (!used(s0, s0 + len) && s0 > 6 && s0 < D - 8) ev.push({ type, s0, len, f }); };
      const sk = FX.skillOf(p);
      const stumbleType = () => pick(['banana', 'mud', 'trip', 'banana']);
      const addStumble = (a, b) => {
        const t = stumbleType();
        if (t === 'trip') { const hs = HURDLES.filter(h => h > a * D && h < b * D); if (hs.length) { const h = pick(hs); add('trip', h - 0.6, 6, 0.16); return; } }
        add(t, rand(a, b) * D, t === 'mud' ? 9 : 6, t === 'mud' ? 0.42 : 0.22);
      };
      if (i === 0) { if (Math.random() < 0.7) addStumble(0.15, 0.45); add('boost', rand(0.74, 0.86) * D, 16, 2.0); }
      else if (i === 1) { add('boost', rand(0.66, 0.76) * D, 15, 1.9); if (Math.random() < 0.5) addStumble(0.3, 0.55); }
      else if (rel <= 0.25) { if (Math.random() < 0.55) addStumble(0.12, 0.5); if (Math.random() < 0.85) add('boost', rand(0.7, 0.9) * D, 14, 1.85); }
      else if (rel >= 0.5) { if (Math.random() < 0.7) add('boost', rand(0.06, 0.28) * D, 16, 2.0); if (Math.random() < 0.6) addStumble(0.45, 0.85); }
      else { if (Math.random() < 0.6) addStumble(0.25, 0.75); if (Math.random() < 0.4) add('boost', rand(0.3, 0.6) * D, 12, 1.7); }
      if ((p.stats.luk || 0) >= 10 && Math.random() < 0.35) add('pad', rand(0.2, 0.8) * D, 10, 1.7);
      ev.sort((a, b) => a.s0 - b.s0);
      // 거리→시간 표 계산
      const s0 = -row * 1.8, ds = 0.5, ph1 = rand(0, 6), ph2 = rand(0, 6);
      const tab = [{ s: s0, t: 0 }];
      let t = 0;
      for (let s = s0; s < D; s += ds) {
        let v = 1 + 0.07 * Math.sin(s * 0.045 + ph1) + 0.05 * Math.sin(s * 0.11 + ph2);
        if (s < s0 + 8) v *= 0.55 + 0.45 * ((s - s0) / 8); // 출발 가속
        for (const e of ev) if (s >= e.s0 && s < e.s0 + e.len) v *= e.f;
        t += ds / v;
        tab.push({ s: Math.min(D, s + ds), t });
      }
      const k = finishT[i] / t;
      tab.forEach(r => { r.t *= k; });
      return {
        p, i, lane, row, ev, tab, T: finishT[i], sk,
        laneD: -W / 2 + (lane + 0.5) * LANE_W, ph: rand(0, 6), finished: false, firedEv: new Set(), jumpHurdles: new Set()
      };
    });
    function sAt(r, t) {
      const tab = r.tab;
      if (t <= 0) return tab[0].s;
      if (t >= r.T) return D + 12 * (1 - Math.exp(-(t - r.T) * 0.7)); // 결승 후 감속해서 멈춤
      let lo = 0, hi = tab.length - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (tab[m].t < t) lo = m; else hi = m; }
      const a = tab[lo], b = tab[hi];
      return a.s + (b.s - a.s) * ((t - a.t) / Math.max(1e-6, b.t - a.t));
    }
    function tAtS(r, s) {
      const tab = r.tab; let lo = 0, hi = tab.length - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (tab[m].s < s) lo = m; else hi = m; }
      return tab[lo].t;
    }
    const lateral = (r, t) => r.laneD + 0.35 * Math.sin(t * 0.7 + r.ph);

    // ---------------- 스프라이트 & 장애물 ----------------
    const charTex = {}, charTexF = {};
    // 원본/좌우반전 텍스처: 이미지가 로드된 뒤에만 GPU 업로드
    Object.keys(CLASSES).forEach(k => {
      const t = new THREE.Texture(), tf = new THREE.Texture();
      t.encoding = tf.encoding = THREE.sRGBEncoding;
      tf.wrapS = THREE.RepeatWrapping; tf.repeat.x = -1; tf.offset.x = 1;
      charTex[k] = t; charTexF[k] = tf;
      const img = new Image();
      img.onload = () => { t.image = img; tf.image = img; t.needsUpdate = true; tf.needsUpdate = true; };
      img.src = CLASSES[k].run;
    });
    const shadowTex = canvasTex(64, 64, (g, w, h) => { const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
    const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });
    const SPR = 2.5;
    runners.forEach(r => {
      const mat = new THREE.SpriteMaterial({ map: charTex[r.p.cls], alphaTest: 0.35 });
      const sp = new THREE.Sprite(mat); sp.center.set(0.5, 0.02); sp.scale.set(SPR, SPR, 1);
      scene.add(sp); r.sprite = sp;
      const sh = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.0), shadowMat); sh.rotation.x = -Math.PI / 2; scene.add(sh); r.shadow = sh;
      const tag = document.createElement('div'); tag.className = 'ntag'; tag.innerHTML = `<span>${UI.esc(r.p.name)}</span>`; H.tags.appendChild(tag); r.tag = tag;
    });
    const iconTex = n => T(`assets/icons/${n}.png`);
    const obsTex = { banana: iconTex('banana'), mud: iconTex('mud'), boost: iconTex('boost'), pad: iconTex('boost'), star: iconTex('star') };
    // 사건 위치에 장애물 배치 (해당 선수가 지나갈 레인 위)
    runners.forEach(r => r.ev.forEach(e => {
      if (e.type === 'trip') { const hi = HURDLES.findIndex(h => Math.abs(h - (e.s0 + 0.6)) < 1); e.hurdle = hurdleObjs[hi + '-' + r.lane]; return; }
      const d = lateral(r, tAtS(r, e.s0));
      const p = posAt(e.s0, d, 0.06);
      const f = frame(sToU(e.s0));
      if (e.type === 'banana') {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: obsTex.banana, alphaTest: 0.3 })); s.center.set(0.5, 0); s.scale.set(1.1, 1.1, 1); s.position.copy(p); scene.add(s); e.obj = s;
      } else {
        const size = e.type === 'mud' ? [4.2, 2.4] : [2.6, 1.8];
        const m = new THREE.Mesh(new THREE.PlaneGeometry(size[0], size[1]), new THREE.MeshBasicMaterial({ map: obsTex[e.type], transparent: true, depthWrite: false }));
        m.rotation.x = -Math.PI / 2; m.rotation.z = Math.atan2(f.tz, f.tx) * -1; m.position.copy(p); scene.add(m); e.obj = m;
        if (e.type !== 'mud') e.pulse = true;
      }
    }));

    // ---------------- 파티클 ----------------
    const parts = [];
    const dotTex = canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
    function spawn(pos, opt) {
      const m = new THREE.SpriteMaterial({ map: opt.map || dotTex, color: opt.color || 0xffffff, transparent: true, depthWrite: false, blending: opt.add ? THREE.AdditiveBlending : THREE.NormalBlending, opacity: opt.alpha || 0.8 });
      const s = new THREE.Sprite(m); s.position.copy(pos); const sc = opt.size || 0.6; s.scale.set(sc, sc, 1); scene.add(s);
      parts.push({ s, v: opt.v || new THREE.Vector3(rand(-1, 1), rand(1, 3), rand(-1, 1)), life: opt.life || 0.8, age: 0, grow: opt.grow || 1.5, g: opt.g == null ? -4 : opt.g, a0: opt.alpha || 0.8, spin: opt.spin || 0 });
    }
    function stepParts(dt) {
      for (let i = parts.length - 1; i >= 0; i--) {
        const q = parts[i]; q.age += dt;
        if (q.age >= q.life) { scene.remove(q.s); q.s.material.dispose(); parts.splice(i, 1); continue; }
        q.v.y += q.g * dt; q.s.position.addScaledVector(q.v, dt);
        const k = q.age / q.life; q.s.material.opacity = q.a0 * (1 - k); const sc = q.s.scale.x * (1 + (q.grow - 1) * dt); q.s.scale.set(sc, sc, 1);
        q.s.material.rotation += q.spin * dt;
      }
    }

    // ---------------- 카메라 연출 ----------------
    const cam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), shake: 0, fov: 55, shot: 'grid', shotUntil: 0, target: null };
    const SHOTS = ['chase', 'side', 'low', 'heli', 'chase', 'front'];
    let shotIdx = 0, lastCut = -10, lastShotChange = 0;
    function setShot(name, until, target) { cam.shot = name; cam.shotUntil = until; cam.target = target || null; }
    function camGoal(simT, order) {
      const lead = order[0];
      const top = order.slice(0, Math.min(6, order.length));
      const focus = new THREE.Vector3();
      top.forEach(r => focus.add(r.posNow)); focus.divideScalar(top.length);
      const sLead = lead.sNow;
      const f = frame(sToU(clamp(sLead, 0, D)));
      const t = new THREE.Vector3(f.tx, 0, f.tz), n = new THREE.Vector3(f.nx, 0, f.nz), up = new THREE.Vector3(0, 1, 0);
      let pos, look;
      switch (cam.shot) {
        case 'grid': { const g = frame(uF); const gt = new THREE.Vector3(g.tx, 0, g.tz); pos = posAt(14, 0, 3.2); look = posAt(-2, 0, 1.4); break; }
        case 'front': pos = lead.posNow.clone().add(t.clone().multiplyScalar(14)).add(n.clone().multiplyScalar(-2)).add(up.clone().multiplyScalar(3)); look = focus.clone().add(up); break;
        case 'side': pos = focus.clone().add(n.clone().multiplyScalar(-(W / 2 + 13))).add(up.clone().multiplyScalar(3.5)).add(t.clone().multiplyScalar(2)); look = focus.clone().add(up); break;
        case 'low': pos = focus.clone().add(t.clone().multiplyScalar(-6)).add(n.clone().multiplyScalar(W / 2 + 2)).add(up.clone().multiplyScalar(0.8)); look = focus.clone().add(t.clone().multiplyScalar(6)).add(up.clone().multiplyScalar(1.5)); break;
        case 'heli': pos = focus.clone().add(t.clone().multiplyScalar(-22)).add(n.clone().multiplyScalar(-14)).add(up.clone().multiplyScalar(30)); look = focus.clone().add(t.clone().multiplyScalar(10)); break;
        case 'event': { const r = cam.target; const ft = frame(sToU(clamp(r.sNow, 0, D))); const tt = new THREE.Vector3(ft.tx, 0, ft.tz), nn = new THREE.Vector3(ft.nx, 0, ft.nz); pos = r.posNow.clone().add(nn.clone().multiplyScalar(-6)).add(tt.clone().multiplyScalar(4)).add(up.clone().multiplyScalar(2.2)); look = r.posNow.clone().add(up.clone().multiplyScalar(1.2)); break; }
        case 'finish': { pos = posAt(D + 9, -(W / 2 + 2.5), 2.0); look = posAt(D - 12, W * 0.15, 1.2); break; }
        case 'podium': { const ang = simT * 0.25; const c = posAt(D + 4, 0, 0); pos = c.clone().add(new THREE.Vector3(Math.cos(ang) * 26, 16, Math.sin(ang) * 26)); look = c.clone().add(up); break; }
        default: pos = focus.clone().add(t.clone().multiplyScalar(-15)).add(n.clone().multiplyScalar(-3)).add(up.clone().multiplyScalar(6.5)); look = focus.clone().add(t.clone().multiplyScalar(10)).add(up.clone().multiplyScalar(1.5));
      }
      return { pos, look };
    }

    // ---------------- HUD ----------------
    const standings = FX.createStandings(H.overlay, runners.map(r => r.p), Math.min(10, N));
    const prog = document.createElement('div'); prog.className = 'hud-prog'; prog.innerHTML = '<i></i>'; H.overlay.appendChild(prog);
    const mini = document.createElement('canvas'); mini.className = 'minimap'; mini.width = 520; mini.height = 300; H.overlay.appendChild(mini);
    const mctx = mini.getContext('2d');
    function drawMini(order) {
      const w = mini.width, h = mini.height, sc = Math.min((w - 40) / (Ls + 2 * Rc + W), (h - 40) / (2 * Rc + W));
      mctx.clearRect(0, 0, w, h);
      mctx.save(); mctx.translate(w / 2, h / 2); mctx.scale(sc, sc);
      mctx.strokeStyle = '#c4482f'; mctx.lineWidth = W; mctx.beginPath();
      for (let i = 0; i <= 120; i++) { const f = frame(i / 120 * L); if (i === 0) mctx.moveTo(f.x, f.z); else mctx.lineTo(f.x, f.z); }
      mctx.closePath(); mctx.stroke();
      const g = frame(uF); mctx.fillStyle = '#fff'; mctx.fillRect(g.x - 1, g.z - W / 2 - 2, 2, W + 4);
      order.slice().reverse().forEach((r, idx) => {
        const rank = order.length - 1 - idx;
        mctx.fillStyle = rank === 0 ? '#ffcf4a' : rank === 1 ? '#e6e9f5' : rank === 2 ? '#e08a4c' : (CLASSES[r.p.cls] || CLASSES.warrior).color;
        mctx.beginPath(); mctx.arc(r.posNow.x, r.posNow.z, rank < 3 ? 4.2 : 2.6, 0, 7); mctx.fill();
        if (rank < 3) { mctx.strokeStyle = '#000'; mctx.lineWidth = 1; mctx.stroke(); }
      });
      mctx.restore();
    }

    // ---------------- 메인 루프 ----------------
    let simT = -1, started = false, last = performance.now(), timeScale = 1, freeze = 0;
    let prevTop = [], lastOvertake = 0, finishCount = 0, winnerDone = false, endAt = null, slowmo = false;
    const lastT = runners[runners.length - 1].T;
    const finishedSet = new Set();
    let hudTimer = 0;
    const tmpV = new THREE.Vector3();

    function update(dt) {
      if (!started) { simT = 0; }
      else if (freeze > 0) freeze -= dt;
      else simT += dt * timeScale;
      if (skipReq && started && !endAt) { simT = lastT + 0.5; runners.forEach(r => { r.firedEv = new Set(r.ev.map((_, i) => i)); }); }
      // 선수 위치
      runners.forEach(r => {
        const s = sAt(r, simT);
        r.sNow = s;
        const d = lateral(r, simT);
        let y = 0, rot = 0;
        // 허들 점프
        for (let hi = 0; hi < HURDLES.length; hi++) {
          const hs = HURDLES[hi];
          if (Math.abs(s - hs) < 1.7) {
            const tripE = r.ev.find(e => e.type === 'trip' && e.hurdle && Math.abs(e.s0 + 0.6 - hs) < 1);
            if (!tripE) y = Math.max(y, 1.15 * Math.sin(Math.PI * (s - (hs - 1.7)) / 3.4));
          }
        }
        // 사건 연출
        r.boosting = false;
        r.ev.forEach((e, ei) => {
          if (s >= e.s0 && !r.firedEv.has(ei) && started) {
            r.firedEv.add(ei);
            onEvent(r, e);
          }
          if (s >= e.s0 && s < e.s0 + e.len) {
            const k = (s - e.s0) / e.len;
            if (e.type === 'banana') { rot = k * Math.PI * 4; y = Math.sin(k * Math.PI) * 0.8; }
            else if (e.type === 'trip') { rot = (k < 0.6 ? Math.sin(k / 0.6 * Math.PI / 2) : Math.cos((k - 0.6) / 0.4 * Math.PI / 2)) * 1.5; }
            else if (e.type === 'mud') { rot = Math.sin(k * 30) * 0.18; if (Math.random() < 0.3) spawn(tmpV.copy(posAt(s, d, 0.3)), { color: 0x6b3f1d, size: 0.5, life: 0.5, v: new THREE.Vector3(rand(-2, 2), rand(2, 4), rand(-2, 2)), g: -12, alpha: 0.9 }); }
            else { r.boosting = true; }
          }
        });
        const pos = posAt(s, d, y);
        r.posNow = pos;
        r.sprite.position.copy(pos);
        // 달리기 모션
        const running = started && simT < r.T + 1.5;
        const bob = running ? Math.abs(Math.sin(simT * 13 + r.ph)) * 0.22 : 0;
        r.sprite.position.y += bob;
        const sq = running ? 1 + Math.sin(simT * 26 + r.ph) * 0.04 : 1;
        r.sprite.scale.set(SPR * (2 - sq), SPR * sq, 1);
        // 화면상 진행 방향에 맞춰 좌우 반전
        const f = frame(sToU(clamp(s, 0, D + 20)));
        tmpV.set(pos.x + f.tx, pos.y, pos.z + f.tz).project(camera);
        const pr = pos.clone().project(camera);
        const flip = tmpV.x < pr.x;
        r.sprite.material.map = flip ? charTexF[r.p.cls] : charTex[r.p.cls];
        r.sprite.material.rotation = (flip ? 1 : -1) * (rot + (r.boosting ? 0.18 : running ? 0.06 : 0));
        r.shadow.position.set(pos.x, 0.04, pos.z);
        r.shadow.scale.setScalar(1 - Math.min(0.6, y * 0.4));
        // 먼지 & 부스트 잔상
        if (running && Math.random() < 0.12) spawn(posAt(s - 0.6, d, 0.2), { color: 0xffd9c0, size: 0.5, life: 0.6, v: new THREE.Vector3(rand(-.5, .5), rand(.4, 1.2), rand(-.5, .5)), g: 0, alpha: 0.45, grow: 2.5 });
        if (r.boosting) for (let k = 0; k < 2; k++) spawn(posAt(s - rand(0.3, 1.2), d + rand(-.3, .3), rand(0.4, 1.8)), { color: 0x3ee0ff, size: rand(0.5, 0.9), life: 0.45, v: new THREE.Vector3(0, rand(0, .5), 0), g: 0, add: true, alpha: 0.9, grow: 0.5 });
        if (!r.finished && s >= D) {
          r.finished = true; finishCount++; finishedSet.add(r.p.id);
          onFinish(r);
        }
      });
      // 장애물 애니메이션
      runners.forEach(r => r.ev.forEach(e => {
        if (e.pulse && e.obj) e.obj.material.opacity = 0.65 + 0.35 * Math.sin(simT * 8);
        if (e.flying && e.obj) { e.flyT += dt; e.obj.position.addScaledVector(e.flyV, dt); e.flyV.y -= 14 * dt; e.obj.material.rotation += dt * 12; if (e.flyT > 1.5) { scene.remove(e.obj); e.obj = null; e.flying = false; } }
      }));
      Object.values(hurdleObjs).forEach(h => { if (h.falling && h.fall < 1) { h.fall = Math.min(1, h.fall + dt * 3); h.g.children.forEach(c => {}); h.g.rotation.z = -h.fall * Math.PI / 2 * 0.95; } });
      stepParts(dt);

      // 순위
      const order = runners.slice().sort((a, b) => (b.finished && a.finished) ? a.T - b.T : b.sNow - a.sNow);
      // 역전 감지 (상위 3)
      if (started && simT > 3 && finishCount === 0) {
        const top = order.slice(0, 3).map(r => r.p.id);
        if (prevTop.length && top[0] !== prevTop[0] && simT - lastOvertake > 2.5) {
          lastOvertake = simT;
          const a = order[0], b = runners.find(r => r.p.id === prevTop[0]);
          H.banner('역전!', `${a.p.name} ▶ 선두`);
          H.comment(`<b>${UI.esc(a.p.name)}</b>, ${UI.esc(b.p.name)}을(를) 제치고 선두로!`, 'megaphone', true);
          if (simT - lastCut > 3) { setShot('event', simT + 1.6, a); lastCut = simT; }
        }
        prevTop = top;
      }
      // 슬로모션 & 결승 카메라
      const lead = order[0];
      if (started && !winnerDone && lead.sNow > D - 40 && cam.shot !== 'finish') setShot('finish', 1e9);
      if (started && !winnerDone && lead.sNow > D - 10) { timeScale = lerp(timeScale, 0.32, 0.1); slowmo = true; }
      else if (slowmo && winnerDone) { /* 유지 후 아래에서 해제 */ }
      // 기본 샷 순환
      if (started && cam.shot !== 'finish' && cam.shot !== 'podium' && simT > cam.shotUntil) {
        if (cam.shot === 'grid' || simT - lastShotChange > 0) {
          const nm = SHOTS[shotIdx++ % SHOTS.length];
          setShot(nm, simT + (nm === 'heli' ? 3.5 : 4.5));
          lastShotChange = simT;
        }
      }
      // HUD
      hudTimer -= dt;
      if (hudTimer <= 0) {
        hudTimer = 0.15;
        standings.update(order.map(r => r.p.id), finishedSet);
        prog.firstChild.style.width = clamp(lead.sNow / D * 100, 0, 100) + '%';
        drawMini(order);
      }
      // 이름표 (상위 3에 메달)
      const medal = ['gold', 'silver', 'bronze'];
      const w = H.el.clientWidth, h = H.el.clientHeight;
      order.forEach((r, idx) => {
        const p = r.posNow.clone(); p.y += SPR + 0.4;
        const sp = p.project(camera);
        const vis = sp.z < 1 && sp.x > -1.1 && sp.x < 1.1 && sp.y > -1.1 && sp.y < 1.1;
        const dist = camera.position.distanceTo(r.posNow);
        if (!vis || dist > 70) { r.tag.style.display = 'none'; return; }
        r.tag.style.display = 'flex';
        r.tag.style.left = ((sp.x + 1) / 2 * w) + 'px';
        r.tag.style.top = ((1 - sp.y) / 2 * h) + 'px';
        r.tag.style.fontSize = clamp(260 / dist, 11, 22) + 'px';
        r.tag.style.opacity = clamp(1.4 - dist / 60, 0.3, 1);
        const want = idx < 3 ? medal[idx] : '';
        if (r.tagMedal !== want) { r.tagMedal = want; r.tag.innerHTML = (want ? UI.icon(want, 22) : '') + `<span>${UI.esc(r.p.name)}</span>`; r.tag.classList.toggle('top', !!want); }
      });
      // 카메라
      const goal = camGoal(simT, order);
      const k = cam.shot === 'grid' ? 0.04 : (cam.justCut ? 1 : 0.07);
      cam.justCut = false;
      cam.pos.lerp(goal.pos, k); cam.look.lerp(goal.look, k * 1.3);
      cam.shake *= 0.9;
      camera.position.copy(cam.pos).add(new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(cam.shake));
      camera.lookAt(cam.look);
      const wantFov = (lead.boosting || slowmo) ? 63 : 55;
      cam.fov = lerp(cam.fov, wantFov, 0.05); camera.fov = cam.fov; camera.updateProjectionMatrix();
      H.speed(started && (lead.boosting || (slowmo && !winnerDone)), slowmo ? 0.5 : 0.35);
      // 종료
      if (started && !endAt && finishCount >= N) endAt = performance.now() + (skipReq ? 300 : 2500);
      if (endAt && performance.now() > endAt) { endAt = Infinity; finishNow(); }
    }

    function onEvent(r, e) {
      const name = `<b>${UI.esc(r.p.name)}</b>`;
      const important = r.i < 8 || Math.random() < 0.3;
      if (important) {
        SFX.play({ boost: 'boost', pad: 'boost', banana: 'slip', mud: 'splash', trip: 'trip' }[e.type], { vol: .6, gap: 120 });
        if (e.type === 'trip') SFX.play('crash', { vol: .4, delay: .05 });
        if (e.type === 'boost' || e.type === 'pad') SFX.whoosh({ up: true, vol: .35 });
      }
      if (e.type === 'boost') {
        H.comment(`${name}의 '${UI.esc(r.sk.name)}' 발동! 폭풍 질주!`, 'bolt', r.i < 3);
        if (r.i < 3 && simT > 2) { H.cutin(r.p, r.sk.name); cam.shake = 0.25; }
      } else if (e.type === 'pad') {
        H.comment(`${name}, 행운의 부스터 패드를 밟았다!`, 'boost');
      } else if (e.type === 'banana') {
        H.comment(`${name}, 바나나 껍질에 미끄러졌다!`, 'banana', r.i < 3);
        if (e.obj) { e.flying = true; e.flyT = 0; e.flyV = new THREE.Vector3(rand(-3, 3), 7, rand(-3, 3)); }
        for (let k = 0; k < 6; k++) spawn(r.posNow.clone().add(new THREE.Vector3(0, 2.2, 0)), { map: obsTex.star, size: 0.7, life: 0.9, v: new THREE.Vector3(rand(-2, 2), rand(1, 3), rand(-2, 2)), g: -3, alpha: 1, grow: 1, spin: 5 });
      } else if (e.type === 'mud') {
        H.comment(`${name}, 진흙탕에 발이 빠졌다!`, 'mud');
      } else if (e.type === 'trip') {
        H.comment(`${name}, 허들에 걸려 넘어졌다!`, 'hurdle', r.i < 3);
        if (e.hurdle) e.hurdle.falling = true;
        cam.shake = Math.max(cam.shake, 0.15);
        for (let k = 0; k < 10; k++) spawn(r.posNow.clone().add(new THREE.Vector3(0, 0.3, 0)), { color: 0xffe0c0, size: 0.8, life: 0.7, v: new THREE.Vector3(rand(-2, 2), rand(0.5, 2), rand(-2, 2)), g: 0, alpha: 0.6, grow: 2 });
      }
      if (important && simT - lastCut > 3.2 && cam.shot !== 'finish' && simT > 2) { setShot('event', simT + 1.7, r); lastCut = simT; }
    }
    function onFinish(r) {
      if (r.p.rank === 1) {
        winnerDone = true;
        SFX.play('gong', { vol: .7 }); SFX.play('v_winner', { delay: .5 });
        H.flash(); freeze = 0.55;
        H.banner('FINISH!', `1등 ${r.p.name}`);
        H.comment(`<b>${UI.esc(r.p.name)}</b> 1등으로 골인!!`, 'trophy', true);
        H.burst(null, null, 300);
        cam.shake = 0.3;
      } else if (r.p.rank <= 3) {
        SFX.play('glass', { rate: r.p.rank === 2 ? 1 : .85 }); SFX.cheer();
        H.comment(`<b>${UI.esc(r.p.name)}</b> ${r.p.rank}등 골인!`, r.p.rank === 2 ? 'silver' : 'bronze', true);
        if (r.p.rank === 3) setTimeout(() => { if (destroyed) return; timeScale = 2.6; slowmo = false; setShot('podium', 1e9); H.comment('나머지 선수들도 결승선으로!', 'flag', true); }, 900);
      }
    }
    function finishNow() {
      cleanup();
      onDone();
    }

    function loop(now) {
      if (destroyed) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      update(dt);
      // 발소리: 카메라에 가까운 선수 수에 비례해 타닥타닥
      if (started && !destroyed) {
        stepAcc += dt * (slowmo ? 4 : 11) * Math.min(4, runners.filter(r => !r.finished && camera.position.distanceTo(r.posNow) < 40).length);
        if (stepAcc > 1) { stepAcc = 0; SFX.play(Math.random() < .5 ? 'step1' : 'step2', { vary: .5, vol: .22, gap: 40, rate: slowmo ? .6 : 1 }); }
        SFX.crowd(winnerDone ? .5 : slowmo ? .9 : .4, .8);
      }
      renderer.render(scene, camera);
      H.tick();
      raf = requestAnimationFrame(loop);
    }
    let stepAcc = 0;
    function cleanup() {
      destroyed = true;
      SFX.crowd(0, 1.5);
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      H.destroy();
      try { renderer.dispose(); } catch (e) {}
    }

    // 시작: 그리드 샷 → 카운트다운 → 출발
    setShot('grid', 1e9);
    { const g = camGoal(0, runners.map(r => { r.sNow = sAt(r, 0); r.posNow = posAt(r.sNow, r.laneD, 0); return r; })); cam.pos.copy(g.pos).add(new THREE.Vector3(0, 6, 0)); cam.look.copy(g.look); }
    raf = requestAnimationFrame(loop);
    H.comment(`${N}명의 선수가 출발선에 섰습니다!`, 'megaphone', true);
    SFX.crowd(.3, 1.5); SFX.play('v_ready', { delay: .2 });
    H.countdown().then(() => {
      if (destroyed) return;
      started = true; H.flash();
      H.banner('START!', '', true);
      setShot('front', 4);
      cam.shake = 0.2;
    });
    return ctrl;
  }

  window.Race3D = { run };
})();
