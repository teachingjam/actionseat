// 3D 육상 트랙 레이스. 목표 순위(rank)대로 결승선을 통과하도록 장애물·부스터를 거리 기준으로 배치하고 속도를 보정합니다.
import * as THREE from 'three';
import { Stage3D, Confetti, canvasTex, rand, clamp, lerp, pick, V } from './core.js';
import { Trail, shock } from './fx.js';
import { charFactory } from './chars.js';
const { CLASSES } = GameData;

export function run(root, players, onDone) {
  let destroyed = false, raf = 0, skipReq = false, st = null, trails = [];
  const ctrl = { skip() { skipReq = true; }, destroy() { if (!destroyed) cleanup(); } };
  const H = FX.createHud(root, { title: '자리 쟁탈 대운동회', icon: 'shoe' });
  function cleanup() { destroyed = true; SFX.crowd(0, 1.5); SFX.music(null); cancelAnimationFrame(raf); H.destroy(); try { if (st) st.dispose(); } catch (e) { console.warn(e); } st = null; }
  function fail(e) { console.error(e); if (destroyed) return; cleanup(); onDone(); }
  const N = players.length, keys = [...new Set(players.map(p => (CLASSES[p.cls] ? p.cls : 'warrior')))];
  H.loading(true);
  charFactory(keys).then(mk => { if (destroyed) return; try { start(mk); H.loading(false); } catch (e) { fail(e); } }, fail);

  function start(mk) {
    st = new Stage3D(H.canvas, H.el, { fov: 52, exposure: 1.0, bloom: .28, threshold: .95 });
    const { scene, camera, add, smoke } = st;
    // ---------------- 트랙 모양 ----------------
    const LANE_W = 1.55, NL = clamp(Math.ceil(N / 2), 8, 14), W = NL * LANE_W, Ls = 110, R0 = 34, Rc = R0 + W / 2, L = 2 * Ls + 2 * Math.PI * Rc, uF = Ls * .82, D = L;
    function frame(u) {
      u = ((u % L) + L) % L; let x, z, tx, tz, nx, nz;
      if (u < Ls) { x = -Ls / 2 + u; z = -Rc; tx = 1; tz = 0; nx = 0; nz = -1; }
      else if (u < Ls + Math.PI * Rc) { const th = -Math.PI / 2 + (u - Ls) / Rc; x = Ls / 2 + Rc * Math.cos(th); z = Rc * Math.sin(th); tx = -Math.sin(th); tz = Math.cos(th); nx = Math.cos(th); nz = Math.sin(th); }
      else if (u < 2 * Ls + Math.PI * Rc) { const v = u - Ls - Math.PI * Rc; x = Ls / 2 - v; z = Rc; tx = -1; tz = 0; nx = 0; nz = 1; }
      else { const th = Math.PI / 2 + (u - 2 * Ls - Math.PI * Rc) / Rc; x = -Ls / 2 + Rc * Math.cos(th); z = Rc * Math.sin(th); tx = -Math.sin(th); tz = Math.cos(th); nx = Math.cos(th); nz = Math.sin(th); }
      return { x, z, tx, tz, nx, nz };
    }
    const sToU = s => uF + s;
    const posAt = (s, d, y) => { const f = frame(sToU(s)); return V(f.x + f.nx * d, y || 0, f.z + f.nz * d); };
    const onTrack = (u, d, y) => { const f = frame(u); return V(f.x + f.nx * d, y || 0, f.z + f.nz * d); };

    // ---------------- 하늘·빛 ----------------
    scene.fog = new THREE.Fog(0xcfe4ff, 170, 480);
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(600, 32, 18), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { t: st.uTime }, vertexShader: 'varying vec3 p; void main(){ p = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: `uniform float t; varying vec3 p; float h(vec2 x){ return fract(sin(dot(x,vec2(127.1,311.7)))*43758.5); } float n(vec2 x){ vec2 i=floor(x),f=fract(x); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); } float fb(vec2 x){ return n(x)*.5+n(x*2.1)*.27+n(x*4.3)*.15+n(x*8.7)*.08; }
      void main(){ float y = max(p.y,0.); vec3 c = mix(vec3(.62,.80,.98), vec3(.10,.30,.78), pow(y,.55)); vec2 q = p.xz/(p.y+.18)*1.5 + t*.01; float cl = smoothstep(.48,.78,fb(q))*smoothstep(.02,.2,p.y); c = mix(c, vec3(.98,.98,1.), cl*.9); vec3 sd = normalize(vec3(-.55,.62,-.35)); float s = max(0.,dot(p,sd)); c += vec3(1.,.85,.55)*(pow(s,300.)*2.+pow(s,12.)*.18); gl_FragColor = vec4(c,1.); }` })));
    scene.add(new THREE.HemisphereLight(0xdcebff, 0x6f8a55, 1.25));
    const sun = st.sunLight(0xfff1d6, 2.6, 34); st.applyQ();
    const key = new THREE.DirectionalLight(0xffffff, .55); key.position.set(.4, .5, 1.5); key.target.position.set(0, 0, -6); camera.add(key, key.target);

    // ---------------- 경기장 ----------------
    const lam = (c, o) => new THREE.MeshLambertMaterial(Object.assign({ color: c }, o || {}));
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), lam(0x6fa05a)); ground.rotation.x = -Math.PI / 2; ground.position.y = -.08; scene.add(ground);
    const ribbon = (d0, d1, y, mat, vScale, rs) => {
      const M = Math.ceil(L / 1.5), pos = [], uv = [], ix = [];
      for (let i = 0; i <= M; i++) { const u = i / M * L, f = frame(u); pos.push(f.x + f.nx * d0, y, f.z + f.nz * d0, f.x + f.nx * d1, y, f.z + f.nz * d1); uv.push(0, u / (vScale || 6), 1, u / (vScale || 6)); if (i < M) { const a = i * 2; ix.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(ix); g.computeVertexNormals(); const m = new THREE.Mesh(g, mat); m.receiveShadow = rs !== false; scene.add(m); return m;
    };
    const trackTex = canvasTex(1024, 512, (g, w, h) => {
      g.fillStyle = '#b8402c'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < NL; i++) { g.fillStyle = i % 2 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.04)'; g.fillRect(i * w / NL, 0, w / NL, h); }
      for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${Math.random() < .5 ? '255,170,140' : '70,12,6'},${Math.random() * .16})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
      g.fillStyle = '#fff'; for (let i = 0; i <= NL; i++) g.fillRect(clamp(Math.round(i * w / NL) - 3, 0, w - 6), 0, 6, h);
    });
    trackTex.wrapT = THREE.RepeatWrapping;
    ribbon(-W / 2, W / 2, .02, new THREE.MeshStandardMaterial({ map: trackTex, roughness: .92, side: THREE.DoubleSide }));
    ribbon(-W / 2 - .7, -W / 2, .10, lam(0xffffff, { side: THREE.DoubleSide })); ribbon(W / 2, W / 2 + .7, .10, lam(0xffffff, { side: THREE.DoubleSide }));
    ribbon(W / 2 + .7, W / 2 + 4.6, .01, lam(0x3a6ea8, { side: THREE.DoubleSide }));
    { // 잔디
      const sh = new THREE.Shape(), M = 200; for (let i = 0; i <= M; i++) { const f = frame(i / M * L), x = f.x - f.nx * (W / 2 + .7), z = f.z - f.nz * (W / 2 + .7); i ? sh.lineTo(x, -z) : sh.moveTo(x, -z); }
      const gt = canvasTex(512, 512, (g, w, h) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#4da144' : '#5db850'; g.fillRect(i * w / 8, 0, w / 8 + 1, h); } for (let i = 0; i < 9000; i++) { g.fillStyle = Math.random() < .5 ? `rgba(20,70,10,${Math.random() * .2})` : `rgba(210,255,150,${Math.random() * .14})`; g.fillRect(Math.random() * w, Math.random() * h, 1, 4); } });
      gt.wrapS = gt.wrapT = THREE.RepeatWrapping; gt.repeat.set(.014, .014); const g = new THREE.ShapeGeometry(sh); g.rotateX(-Math.PI / 2); const m = new THREE.Mesh(g, lam(0xffffff, { map: gt })); m.position.y = .015; m.receiveShadow = true; scene.add(m);
      [[9, 9.4], [Rc - W / 2 - 4, Rc - W / 2 - 3.6]].forEach(([a, b]) => { const q = new THREE.Mesh(new THREE.RingGeometry(a, b, 72), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .6 })); q.rotation.x = -Math.PI / 2; q.position.y = .03; scene.add(q); });
    }
    { // 계단식 관중석 + 관중 + 지붕
      const tiers = 7, out = W / 2 + 6.4, stepW = 1.7, stepH = .95, M = 120, conc = new THREE.MeshLambertMaterial({ color: 0x4f6fb5, side: THREE.DoubleSide }), conc2 = new THREE.MeshLambertMaterial({ color: 0x3f5c9e, side: THREE.DoubleSide }), riser = new THREE.MeshLambertMaterial({ color: 0x2a3d70, side: THREE.DoubleSide }), wallC = new THREE.MeshLambertMaterial({ color: 0x2f5fb0, side: THREE.DoubleSide });
      const strip = (dA, yA, dB, yB, mat) => { const pos = [], ix = []; for (let i = 0; i <= M; i++) { const f = frame(i / M * L); pos.push(f.x + f.nx * dA, yA, f.z + f.nz * dA, f.x + f.nx * dB, yB, f.z + f.nz * dB); if (i < M) { const a = i * 2; ix.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } } const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(ix); g.computeVertexNormals(); scene.add(new THREE.Mesh(g, mat)); };
      strip(out - 1.6, 0, out - 1.6, 1.5, wallC); strip(out - 1.6, 1.5, out - 1.3, 1.5, lam(0xffffff, { side: THREE.DoubleSide })); strip(out - 1.3, 1.5, out, 1.1, conc);
      for (let k = 0; k < tiers; k++) { const d = out + k * stepW, y = 1.1 + k * stepH; strip(d, y, d + stepW, y, k % 2 ? conc : conc2); strip(d + stepW, y, d + stepW, y + stepH, riser); }
      const back = out + tiers * stepW, top = 1.1 + tiers * stepH; strip(back, top, back, top + 5, lam(0xe9eef8, { side: THREE.DoubleSide })); strip(back + .5, top + 5, back - 9, top + 6.4, lam(0xf4f7ff, { side: THREE.DoubleSide })); strip(back - 9, top + 6.4, back - 9, top + 5.8, lam(0xe8504a, { side: THREE.DoubleSide }));
      st.makeCrowd(3400, () => { const k = Math.floor(Math.random() * tiers), u = Math.random() * L, f = frame(u), d = out + (k + rand(.25, .75)) * stepW; return { x: f.x + f.nx * d, y: 1.1 + k * stepH + .3, z: f.z + f.nz * d, ry: Math.atan2(-f.nx, -f.nz) }; }, 1);
      // 현수막
      const words = ['힘내라!', '우리 반 최고', '달려라!', '자리 쟁탈전', '끝까지!', '파이팅'], cols = ['#e8504a', '#2f7fd8', '#f0a62a', '#37a862', '#8a56d8'];
      for (let i = 0; i < 24; i++) { const u = i / 24 * L, f = frame(u), t = canvasTex(512, 96, (g, w, h) => { g.fillStyle = cols[i % 5]; g.fillRect(0, 0, w, h); g.strokeStyle = '#fff'; g.lineWidth = 8; g.strokeRect(6, 6, w - 12, h - 12); g.fillStyle = '#fff'; g.font = '54px "Black Han Sans", Jua, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(words[i % 6], w / 2, h / 2 + 4); }); const m = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.3), new THREE.MeshBasicMaterial({ map: t })); m.position.set(f.x + f.nx * (out - 1.66), .76, f.z + f.nz * (out - 1.66)); m.lookAt(f.x, .76, f.z); scene.add(m); }
    }
    { // 열기구와 먼 산
      for (let i = 0; i < 5; i++) { const G = new THREE.Group(), c = [0xff6b5a, 0x4aa8ff, 0xffc93c, 0x6fd06a, 0xb07aff][i], b = new THREE.Mesh(new THREE.SphereGeometry(7, 18, 14), lam(c)); b.scale.y = 1.15; G.add(b); const s = new THREE.Mesh(new THREE.SphereGeometry(7.06, 18, 14, 0, .5), lam(0xffffff)); s.scale.y = 1.15; G.add(s, s.clone().rotateY(1.57), s.clone().rotateY(3.14), s.clone().rotateY(4.71)); const k = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2, 2.4), lam(0x9a6a3a)); k.position.y = -11; G.add(k); const a = i / 5 * 6.28 + .5; G.position.set(Math.cos(a) * 150, 48 + i * 7, Math.sin(a) * 120); scene.add(G); G.userData.by = G.position.y; G.userData.ph = i; G.name = 'balloon'; }
      for (let i = 0; i < 26; i++) { const a = i / 26 * 6.28, h = rand(20, 46), m = new THREE.Mesh(new THREE.ConeGeometry(rand(40, 70), h, 6), lam(i % 2 ? 0x7fa6c8 : 0x8fb4cf, { flatShading: true })); m.position.set(Math.cos(a) * rand(330, 400), h / 2 - 4, Math.sin(a) * rand(330, 400)); scene.add(m); }
    }
    const balloons = scene.children.filter(o => o.name === 'balloon');
    const fF = frame(uF);
    { // 결승선 아치
      const ck = canvasTex(64, 512, (g, w, h) => { const s = 16; for (let y = 0; y < h; y += s) for (let x = 0; x < w; x += s) { g.fillStyle = ((x + y) / s) % 2 ? '#111' : '#fff'; g.fillRect(x, y, s, s); } });
      const ln = new THREE.Mesh(new THREE.PlaneGeometry(1.4, W), new THREE.MeshBasicMaterial({ map: ck })); ln.rotation.x = -Math.PI / 2; ln.position.set(fF.x, .04, fF.z); scene.add(ln);
      const gold = new THREE.MeshStandardMaterial({ color: 0xffc83c, roughness: .35, metalness: .55 });
      [-1, 1].forEach(sd => { const p = new THREE.Mesh(new THREE.CylinderGeometry(.55, .7, 9.4, 14), gold); p.position.set(fF.x, 4.7, fF.z + sd * (W / 2 + 1.6)); p.castShadow = true; scene.add(p); for (let i = 0; i < 9; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(rand(.45, .7), 12, 10), new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(i / 9, .85, .6), roughness: .3 })); b.position.set(fF.x + rand(-.7, .7), 1 + i * .95, fF.z + sd * (W / 2 + 1.6) + rand(-.7, .7)); scene.add(b); } });
      const bt = canvasTex(1024, 160, (g, w, h) => { const q = g.createLinearGradient(0, 0, w, 0); q.addColorStop(0, '#ff4f7e'); q.addColorStop(.5, '#ff9a3c'); q.addColorStop(1, '#7a5cff'); g.fillStyle = q; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(255,255,255,.18)'; for (let i = -2; i < 20; i++) { g.beginPath(); g.moveTo(i * 70, h); g.lineTo(i * 70 + 60, 0); g.lineTo(i * 70 + 90, 0); g.lineTo(i * 70 + 30, h); g.fill(); } g.fillStyle = '#fff'; g.strokeStyle = 'rgba(60,0,60,.6)'; g.lineWidth = 12; g.font = '108px "Black Han Sans", Jua, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.strokeText('FINISH', w / 2, h / 2 + 6); g.fillText('FINISH', w / 2, h / 2 + 6); });
      const beam = new THREE.Mesh(new THREE.BoxGeometry(.7, 2.9, W + 4), gold); beam.position.set(fF.x, 9.2, fF.z); beam.castShadow = true; scene.add(beam);
      [1, -1].forEach(sd => { const pl = new THREE.Mesh(new THREE.PlaneGeometry(W + 3.6, 2.6), new THREE.MeshBasicMaterial({ map: bt })); pl.position.set(fF.x + sd * .37, 9.2, fF.z); pl.lookAt(fF.x + sd * 10, 9.2, fF.z); scene.add(pl); });
    }
    const jets = [-1, 1].map(sd => V(fF.x, .3, fF.z + sd * (W / 2 + 3.4)));

    // 시상대 (트랙 안쪽 잔디)
    const podC = onTrack(uF - 6, -(W / 2 + 10), 0), podOut = V(0, 0, -1), podSpots = [];
    { const sp = [[0, 1.5, 0xffc83c, '1'], [-2.5, 1, 0xd5dbea, '2'], [2.5, .65, 0xd9894a, '3']]; sp.forEach(([x, h, c, n]) => { const t = canvasTex(128, 128, (g, w, hh) => { g.fillStyle = '#' + new THREE.Color(c).getHexString(); g.fillRect(0, 0, w, hh); g.fillStyle = 'rgba(60,30,0,.85)'; g.font = '100px "Black Han Sans", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(n, w / 2, hh / 2 + 6); }); const plain = new THREE.MeshStandardMaterial({ color: c, roughness: .4, metalness: .25 }), m = new THREE.Mesh(new THREE.BoxGeometry(2.4, h, 2.2), [plain, plain, plain, plain, plain, new THREE.MeshStandardMaterial({ map: t, roughness: .4, metalness: .25 })]); m.position.copy(podC).add(V(x, h / 2, 0)); m.castShadow = m.receiveShadow = true; scene.add(m); podSpots.push(podC.clone().add(V(x, h, 0))); }); }

    // ---------------- 허들 ----------------
    const HURDLES = [.17, .37, .6, .79].map(k => k * D), stripe = canvasTex(128, 16, (g, w, h) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#e03b3b' : '#fff'; g.fillRect(i * w / 8, 0, w / 8, h); } });
    const barM = lam(0xffffff, { map: stripe }), legM = lam(0x3b4460), barG = new THREE.BoxGeometry(.12, .24, LANE_W * .86), legG = new THREE.BoxGeometry(.09, .95, .09), footG = new THREE.BoxGeometry(.6, .07, .09), hurdles = {};
    HURDLES.forEach((hs, hi) => { for (let ln = 0; ln < NL; ln++) { const G = new THREE.Group(), b = new THREE.Mesh(barG, barM); b.position.y = .95; b.castShadow = true; G.add(b); [-1, 1].forEach(sd => { const l = new THREE.Mesh(legG, legM); l.position.set(0, .47, sd * LANE_W * .4); G.add(l); const f = new THREE.Mesh(footG, legM); f.position.set(-.25, .03, sd * LANE_W * .4); G.add(f); }); G.position.copy(posAt(hs, -W / 2 + (ln + .5) * LANE_W)); const f = frame(sToU(hs)); G.rotation.y = -Math.atan2(f.tz, f.tx); scene.add(G); hurdles[hi + '-' + ln] = { G, fall: 0, falling: false }; } });

    // ---------------- 선수와 사건 ----------------
    const sorted = players.slice().sort((a, b) => a.rank - b.rank), T1 = 27, finT = [];
    sorted.forEach((p, i) => { if (i === 0) finT.push(T1); else if (i === 1) finT.push(T1 + .22); else if (i === 2) finT.push(finT[1] + .35); else finT.push(finT[i - 1] + Math.min(.75, 10 / N) + rand(0, .15)); });
    const runners = sorted.map((p, i) => {
      const rel = N > 1 ? i / (N - 1) : 0, lane = i % NL, row = Math.floor(i / NL), ev = [];
      const used = (a, b) => ev.some(e => !(b < e.s0 - 4 || a > e.s0 + e.len + 4));
      const put = (type, s0, len, f) => { if (!used(s0, s0 + len) && s0 > 6 && s0 < D - 8) ev.push({ type, s0, len, f }); };
      const stumble = (a, b) => { const t = pick(['banana', 'mud', 'trip', 'banana']); if (t === 'trip') { const hs = HURDLES.filter(h => h > a * D && h < b * D); if (hs.length) { put('trip', pick(hs) - .6, 7, .17); return; } } const tt = t === 'trip' ? 'banana' : t; put(tt, rand(a, b) * D, tt === 'mud' ? 9 : 7, tt === 'mud' ? .42 : .22); };
      if (i === 0) { if (Math.random() < .7) stumble(.15, .45); put('boost', rand(.74, .86) * D, 18, 2); }
      else if (i === 1) { put('boost', rand(.66, .76) * D, 17, 1.9); if (Math.random() < .5) stumble(.3, .55); }
      else if (rel <= .25) { if (Math.random() < .55) stumble(.12, .5); if (Math.random() < .85) put('boost', rand(.7, .9) * D, 15, 1.85); }
      else if (rel >= .5) { if (Math.random() < .7) put('boost', rand(.06, .28) * D, 17, 2); if (Math.random() < .6) stumble(.45, .85); }
      else { if (Math.random() < .6) stumble(.25, .75); if (Math.random() < .4) put('boost', rand(.3, .6) * D, 13, 1.7); }
      if ((p.stats.luk || 0) >= 10 && Math.random() < .35) put('pad', rand(.2, .8) * D, 11, 1.7);
      ev.sort((a, b) => a.s0 - b.s0);
      const s0 = -row * 1.8, ds = .5, ph1 = rand(0, 6), ph2 = rand(0, 6), tab = [{ s: s0, t: 0 }]; let t = 0;
      for (let s = s0; s < D; s += ds) { let v = 1 + .07 * Math.sin(s * .045 + ph1) + .05 * Math.sin(s * .11 + ph2); if (s < s0 + 8) v *= .55 + .45 * ((s - s0) / 8); for (const e of ev) if (s >= e.s0 && s < e.s0 + e.len) v *= e.f; t += ds / v; tab.push({ s: Math.min(D, s + ds), t }); }
      const k = finT[i] / t; tab.forEach(r => { r.t *= k; });
      const C = mk(CLASSES[p.cls] ? p.cls : 'warrior'); C.turn = 14; scene.add(C.o); C.idle({ fade: 0 }); C.mix.update(rand(0, 1));
      const tag = document.createElement('div'); tag.className = 'ntag'; tag.innerHTML = `<span>${UI.esc(p.name)}</span>`; H.tags.appendChild(tag);
      return { p, i, lane, row, ev, tab, T: finT[i], sk: FX.skillOf(p), C, tag, laneD: -W / 2 + (lane + .5) * LANE_W, ph: rand(0, 6), finished: false, fired: new Set(), pos: V(0, 0, 0), s: s0, prevS: s0, v: 0, mode: 'idle' };
    });
    const sAt = (r, t) => { const tab = r.tab; if (t <= 0) return tab[0].s; if (t >= r.T) return D + (9 + (r.i % 5) * 1.6) * (1 - Math.exp(-(t - r.T) * .8)); let lo = 0, hi = tab.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (tab[m].t < t) lo = m; else hi = m; } const a = tab[lo], b = tab[hi]; return a.s + (b.s - a.s) * ((t - a.t) / Math.max(1e-6, b.t - a.t)); };
    const tAtS = (r, s) => { const tab = r.tab; let lo = 0, hi = tab.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (tab[m].s < s) lo = m; else hi = m; } return tab[lo].t; };
    const lateral = (r, t) => r.laneD + .3 * Math.sin(t * .7 + r.ph);

    // 장애물 놓기
    const bananaM = new THREE.MeshStandardMaterial({ color: 0xffd93a, roughness: .5 }), bananaG = new THREE.TorusGeometry(.34, .11, 8, 14, 3.4), mudM = new THREE.MeshStandardMaterial({ color: 0x4a2c14, roughness: .18, metalness: .1 });
    const padM = new THREE.ShaderMaterial({ uniforms: { t: st.uTime }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexShader: 'varying vec2 v; void main(){ v=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }', fragmentShader: 'uniform float t; varying vec2 v; void main(){ float a = abs(v.y-.5)*1.1; float c = fract(v.x*3. + a*.9 - t*2.2); float k = smoothstep(.0,.12,c)*smoothstep(.55,.4,c); float e = smoothstep(0.,.08,v.x)*smoothstep(1.,.92,v.x)*smoothstep(0.,.06,v.y)*smoothstep(1.,.94,v.y); gl_FragColor = vec4(mix(vec3(.1,.7,1.6), vec3(.5,1.6,2.), k), (.25+.75*k)*e); }' });
    runners.forEach(r => r.ev.forEach(e => {
      e.t0 = tAtS(r, e.s0); e.t1 = tAtS(r, e.s0 + e.len);
      if (e.type === 'trip') { const hi = HURDLES.findIndex(h => Math.abs(h - (e.s0 + .6)) < 1); e.h = hurdles[hi + '-' + r.lane]; return; }
      const p = posAt(e.s0 + .4, lateral(r, e.t0), .05), f = frame(sToU(e.s0));
      if (e.type === 'banana') { const m = new THREE.Mesh(bananaG, bananaM); m.rotation.set(-1.2, rand(0, 6), 0); m.position.copy(p).setY(.16); m.castShadow = true; scene.add(m); e.obj = m; }
      else if (e.type === 'mud') { const sh = new THREE.Shape(); for (let i = 0; i <= 22; i++) { const a = i / 22 * 6.283, q = (i % 22 === 0 ? 1 : rand(.78, 1.1)); i ? sh.lineTo(Math.cos(a) * 2.4 * q, Math.sin(a) * 1 * q) : sh.moveTo(2.4, 0); } const m = new THREE.Mesh(new THREE.ShapeGeometry(sh), mudM); m.rotation.set(-Math.PI / 2, 0, -Math.atan2(f.tz, f.tx)); m.position.copy(p).setY(.04); scene.add(m); }
      else { const m = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.5), padM); m.rotation.set(-Math.PI / 2, 0, -Math.atan2(f.tz, f.tx)); m.position.copy(p).setY(.06); scene.add(m); }
    }));

    const confetti = new Confetti(scene, 700), sw = shock(scene); trails = []; for (let i = 0; i < 6; i++) trails.push({ t: new Trail(scene, [.25, .9, 2.2], 22), r: null });

    // ---------------- 카메라 ----------------
    const cam = { pos: V(0, 0, 0), look: V(0, 0, 0), fov: 52, shot: 'grid', until: 1e9, target: null, cut: true }, SHOTS = ['chase', 'side', 'low', 'heli', 'front', 'chase'];
    let shotIdx = 0, lastCut = -10; const setShot = (n, until, target, cut) => { if (cam.shot !== n) cam.cut = cut !== false; cam.shot = n; cam.until = until; cam.target = target || null; };
    const UP = V(0, 1, 0);
    function goal(t, order) {
      const lead = order[0], focus = V(0, 0, 0), top = order.slice(0, Math.min(5, order.length)); top.forEach(r => focus.add(r.pos)); focus.divideScalar(top.length); focus.y = 0;
      const f = frame(sToU(clamp(lead.s, 0, D))), T = V(f.tx, 0, f.tz), Nn = V(f.nx, 0, f.nz), A = (b, a, n, y) => b.clone().addScaledVector(T, a).addScaledVector(Nn, n).addScaledVector(UP, y);
      switch (cam.shot) {
        case 'grid': { const k = clamp(pre / 4.2, 0, 1), e = k * k * (3 - 2 * k), lo = lerp(-W * .62, W * .25, e); return { pos: posAt(8.5 - e * 1.5, lo, 1.5 + e * 2.2), look: posAt(0, lo * .75, 1.25) }; }
        case 'front': return { pos: A(lead.pos, 11, -2, 2.4), look: A(focus, 0, 0, 1.2) };
        case 'side': return { pos: A(focus, 3, -(W / 2 + 9), 2.6), look: A(focus, 1, 0, 1.2) };
        case 'low': return { pos: A(focus, -7, W / 2 + 1.5, .9), look: A(focus, 5, 0, 1.4) };
        case 'heli': return { pos: A(focus, -20, -12, 24), look: A(focus, 9, 0, 0) };
        case 'event': { const r = cam.target, ft = frame(sToU(clamp(r.s, 0, D))), tt = V(ft.tx, 0, ft.tz), nn = V(ft.nx, 0, ft.nz); return { pos: r.pos.clone().addScaledVector(tt, 5.2).addScaledVector(nn, -4.6).addScaledVector(UP, 1.8), look: r.pos.clone().setY(1.15) }; }
        case 'finish': return { pos: posAt(D + 8, -(W / 2 + 1.5), 1.7), look: posAt(D - 10, W * .12, 1.5) };
        case 'podium': { const a = t * .22; const c = posAt(D + 5, 0, 0); return { pos: c.clone().add(V(Math.cos(a) * 19, 8.5, Math.sin(a) * 19)), look: c.setY(1) }; }
        case 'winner': { const k = clamp(cerT / 5, 0, 1); return { pos: podC.clone().add(V(lerp(-3.4, 2.2, k), lerp(1.5, 2.7, k), lerp(-5.6, -9.2, k))), look: podC.clone().setY(lerp(2.5, 1.9, k)) }; }
        default: return { pos: A(focus, -10.5, -2, 4.6), look: A(focus, 9, 0, 1.2) };
      }
    }

    // ---------------- HUD ----------------
    const standings = FX.createStandings(H.overlay, runners.map(r => r.p), Math.min(10, N));
    const prog = document.createElement('div'); prog.className = 'hud-prog'; prog.innerHTML = '<i></i>'; H.overlay.appendChild(prog);
    const mini = document.createElement('canvas'); mini.className = 'minimap'; mini.width = 520; mini.height = 300; H.overlay.appendChild(mini); const mc = mini.getContext('2d');
    function drawMini(order) {
      const w = 520, h = 300, sc = Math.min((w - 40) / (Ls + 2 * Rc + W), (h - 40) / (2 * Rc + W)); mc.clearRect(0, 0, w, h); mc.save(); mc.translate(w / 2, h / 2); mc.scale(sc, sc); mc.strokeStyle = '#c4482f'; mc.lineWidth = W; mc.beginPath();
      for (let i = 0; i <= 90; i++) { const f = frame(i / 90 * L); i ? mc.lineTo(f.x, f.z) : mc.moveTo(f.x, f.z); } mc.closePath(); mc.stroke(); mc.fillStyle = '#fff'; mc.fillRect(fF.x - 1, fF.z - W / 2 - 2, 2, W + 4);
      order.slice().reverse().forEach((r, j) => { const k = order.length - 1 - j; mc.fillStyle = ['#ffcf4a', '#e6e9f5', '#e08a4c'][k] || (CLASSES[r.p.cls] || CLASSES.warrior).color; mc.beginPath(); mc.arc(r.pos.x, r.pos.z, k < 3 ? 4.4 : 2.7, 0, 7); mc.fill(); if (k < 3) { mc.strokeStyle = '#000'; mc.lineWidth = 1; mc.stroke(); } }); mc.restore();
    }

    // ---------------- 진행 ----------------
    let simT = 0, pre = 0, started = false, last = performance.now(), timeScale = 1, freeze = 0, prevTop = [], lastOver = 0, finN = 0, winDone = false, endAt = null, slowmo = false, hudT = 0, winT = 0, stepAcc = 0, jetT = 0, ceremony = false, cerT = 0;
    const lastT = runners[runners.length - 1].T, finSet = new Set(), tmp = V(0, 0, 0);
    const dust = (p, n, big) => smoke.burst(n, () => ({ p: p.clone().add(V(rand(-.3, .3), .12, rand(-.3, .3))), v: V(rand(-.8, .8), rand(.3, 1.2), rand(-.8, .8)), life: rand(.4, .8), s0: .25, s1: big || .9, c0: [.85, .62, .5], a: .32, kind: 1 }));

    function animate(r, dt, f) {
      const C = r.C, s = r.s; let y = 0, lean = 0, spin = 0, busy = false;
      r.boost = false;
      r.ev.forEach((e, ei) => {
        if (started && s >= e.s0 && !r.fired.has(ei)) { r.fired.add(ei); onEvent(r, e); }
        if (s < e.s0 || s >= e.s0 + e.len || !started) return;
        const k = clamp((simT - e.t0) / Math.max(.2, e.t1 - e.t0), 0, 1), T = e.t1 - e.t0;
        if (e.type === 'banana' || e.type === 'trip') {
          busy = true; const ph = k < .42 ? 1 : 2;
          if (e.ph !== ph) { e.ph = ph; if (ph === 1) C.play(e.type === 'trip' ? 'Death_B' : 'Death_A', { once: true, fade: .06, speed: (e.type === 'trip' ? 1.5 : .8) / (T * .36) }); else C.play('Lie_StandUp', { once: true, fade: .12, speed: 2.33 / (T * .56) }); }
          if (e.type === 'banana') { const j = clamp(k / .3, 0, 1); y = Math.sin(j * Math.PI) * 1.25; spin = j < 1 ? j * Math.PI * 2 : 0; } else { const j = clamp(k / .22, 0, 1); y = Math.sin(j * Math.PI) * .5; }
        } else if (e.type === 'mud') { lean = -.1 + Math.sin(simT * 16) * .05; if (Math.random() < .5) add0(r, s); }
        else { r.boost = true; lean = .28; }
      });
      const run = started && simT < r.T + 1.1;
      let hop = false;
      if (run && !busy) for (const hs of HURDLES) if (Math.abs(s - hs) < 3.1) { hop = true; y = Math.max(y, 1.28 * Math.cos((s - hs) / 3.1 * Math.PI / 2)); }
      if (!busy) {
        let want = 'idle'; if (run) want = hop ? 'hop' : r.boost ? 'boost' : 'run'; else if (r.finished) want = 'done';
        if (want !== r.mode) {
          r.mode = want;
          if (want === 'run') C.run({ fade: .14 }); else if (want === 'boost') C.play('Running_B', { fade: .1 }); else if (want === 'hop') C.play('Jump_Full_Short', { once: true, fade: .06, speed: 2.5, at: .16, force: true });
          else if (want === 'done') { if (r.p.rank <= 3) C.play('Cheer', { fade: .25 }); else if (r.i % 3 === 0) C.play('Sit_Floor_Idle', { fade: .3 }); else if (r.i % 3 === 1) C.play('Cheer', { fade: .25, speed: rand(.7, 1) }); else C.idle({ fade: .25 }); }
          else C.idle();
        }
        if (want === 'run' || want === 'boost') C.speed(clamp(r.v / 10.5, .55, 2.4));
      } else r.mode = 'busy';
      if (r.boost) C.glow(.15, .6, 1.3); else C.glow(0, 0, 0);
      C.o.position.set(r.pos.x, y, r.pos.z); C.yaw = Math.atan2(f.tx, f.tz) + (r.finished && !run ? Math.PI * .96 : 0); if (run) C.o.rotation.y = C.yaw; C.o.rotation.x = lean; C.mesh.rotation.y = 0; if (spin) C.o.rotation.y = C.yaw + spin;
      C.step(dt);
      if (run && !busy && !hop && Math.random() < .10 * st.cfg.part) dust(r.pos, 1);
      if (r.boost) { add.burst(3, () => ({ p: r.pos.clone().add(V(rand(-.4, .4), rand(.2, 1.9), rand(-.4, .4))), v: V(-f.tx * rand(2, 6), rand(0, .6), -f.tz * rand(2, 6)), life: rand(.25, .5), s0: rand(.2, .45), s1: .04, c0: [.2, .8, 1.8], c1: [.1, .2, 1], kind: Math.random() < .5 ? 0 : 3, stretch: .06 })); }
    }
    const add0 = (r) => smoke.add({ p: r.pos.clone().setY(.2), v: V(rand(-2, 2), rand(2, 4), rand(-2, 2)), life: .55, s0: .14, s1: .2, c0: [.22, .11, .04], a: .95, g: 12, kind: 0 });

    function update(raw) {
      const dt = raw * (freeze > 0 ? 0 : timeScale); if (freeze > 0) freeze -= raw;
      if (!started) pre += raw; else simT += dt;
      if (skipReq && started && !endAt) { simT = Math.max(simT, lastT + .6); runners.forEach(r => { r.fired = new Set(r.ev.map((_, i) => i)); }); }
      if (ceremony) { cerT += raw; runners.forEach(r => { r.C.step(raw); }); if (Math.random() < raw * 5) confetti.fire(podC.clone().add(V(rand(-4, 4), .2, rand(-1, 2))), 12, 12); }
      else runners.forEach(r => { r.prevS = r.s; r.s = sAt(r, simT); r.v = dt > 0 ? lerp(r.v, (r.s - r.prevS) / dt, .3) : r.v; const d = lateral(r, simT), f = frame(sToU(r.s)); r.pos.set(f.x + f.nx * d, 0, f.z + f.nz * d); animate(r, dt || (started ? 0 : raw), f); if (!r.finished && r.s >= D && started) { r.finished = true; finN++; finSet.add(r.p.id); onFinish(r); } });
      const order = runners.slice().sort((a, b) => (a.finished && b.finished) ? a.T - b.T : b.s - a.s), lead = order[0];
      Object.values(hurdles).forEach(h => { if (h.falling && h.fall < 1) { h.fall = Math.min(1, h.fall + raw * 3); h.G.rotation.z = -h.fall * 1.5; } });
      runners.forEach(r => r.ev.forEach(e => { if (e.fly && e.obj) { e.fT += dt; e.obj.position.addScaledVector(e.fV, dt); e.fV.y -= 14 * dt; e.obj.rotation.x += dt * 14; e.obj.rotation.z += dt * 9; if (e.fT > 1.6) { scene.remove(e.obj); e.obj = null; } } }));
      balloons.forEach(b => { b.position.y = b.userData.by + Math.sin(st.uTime.value * .5 + b.userData.ph) * 2.5; });
      // 부스트 빛줄기
      const bs = order.filter(r => r.boost).slice(0, 6); trails.forEach(t => { if (t.r && (!t.r.boost || !bs.includes(t.r))) t.r = null; }); bs.forEach(r => { if (!trails.some(t => t.r === r)) { const t = trails.find(x => !x.r && !x.t.pts.length); if (t) t.r = r; } });
      trails.forEach(t => { if (t.r) t.t.push(t.r.pos.clone().setY(.25 + t.r.C.o.position.y), t.r.pos.clone().setY(1.75 + t.r.C.o.position.y)); else t.t.fade(); t.t.step(); });
      if (jetT > 0) { jetT -= raw; jets.forEach(j => add.burst(5, () => ({ p: j.clone().add(V(rand(-.2, .2), 0, rand(-.2, .2))), v: V(rand(-.6, .6), rand(9, 15), rand(-.6, .6)), life: rand(.5, .9), s0: rand(.8, 1.4), s1: .2, c0: [1.5, .75, .2], c1: [.8, .1, .02], kind: 2, a: .7, drag: .8 }))); }
      confetti.step(raw); sw.step(raw);
      // 역전
      if (started && simT > 3 && finN === 0) { const top = order.slice(0, 3).map(r => r.p.id); if (prevTop.length && top[0] !== prevTop[0] && simT - lastOver > 2.5) { lastOver = simT; const a = order[0], b = runners.find(r => r.p.id === prevTop[0]); H.banner('역전!', `${a.p.name} ▶ 선두`); H.comment(`<b>${UI.esc(a.p.name)}</b>, ${UI.esc(b.p.name)}을(를) 제치고 선두로!`, 'megaphone', true); SFX.cheer(); if (simT - lastCut > 3) { setShot('event', simT + 1.6, a); lastCut = simT; } } prevTop = top; }
      if (started && !winDone && lead.s > D - 42 && cam.shot !== 'finish') setShot('finish', 1e9);
      if (started && !winDone && lead.s > D - 10) { timeScale = lerp(timeScale, .3, .1); slowmo = true; }
      if (started && !['finish', 'podium', 'winner', 'grid'].includes(cam.shot) && simT > cam.until) { const n = SHOTS[shotIdx++ % SHOTS.length]; setShot(n, simT + (n === 'heli' ? 3.2 : 4.2), null, true); }
      st.cheerTo = winDone || ceremony ? 1 : lead.s > D - 60 ? .85 : started ? .4 : .25;
      hudT -= raw; if (hudT <= 0) { hudT = .15; standings.update(order.map(r => r.p.id), finSet); prog.firstChild.style.width = clamp(lead.s / D * 100, 0, 100) + '%'; drawMini(order); }
      // 카메라
      const g = goal(simT, order), k = cam.cut ? 1 : 1 - Math.exp(-raw * (cam.shot === 'grid' ? 9 : 5.5)); cam.cut = false; cam.pos.lerp(g.pos, k); cam.look.lerp(g.look, Math.min(1, k * 1.25)); camera.position.copy(cam.pos);
      const wf = (lead.boost || slowmo) ? 62 : cam.shot === 'event' ? 42 : cam.shot === 'winner' ? 40 : 52; cam.fov = lerp(cam.fov, wf, 1 - Math.exp(-raw * 4)); camera.fov = cam.fov; camera.updateProjectionMatrix(); camera.lookAt(cam.look); st.shakeCam();
      sun.position.copy(cam.look).add(V(-38, 46, -24)); sun.target.position.copy(cam.look); sun.target.updateMatrixWorld();
      H.speed(started && (lead.boost || (slowmo && !winDone)), slowmo ? .4 : .3);
      // 이름표
      const medal = ['gold', 'silver', 'bronze'], w = H.el.clientWidth, h = H.el.clientHeight; camera.updateMatrixWorld();
      order.forEach((r, j) => {
        tmp.copy(r.C.o.position); tmp.y += 2.75; const dist = camera.position.distanceTo(r.pos), sp = tmp.project(camera), vis = sp.z < 1 && Math.abs(sp.x) < 1.1 && Math.abs(sp.y) < 1.1 && dist < 60 && (!ceremony || r.i < 3); if (r.vis !== vis) { r.vis = vis; r.tag.style.display = vis ? 'flex' : 'none'; } if (!vis) return;
        r.tag.style.transform = `translate(${((sp.x + 1) / 2 * w).toFixed(1)}px,${((1 - sp.y) / 2 * h).toFixed(1)}px) translate(-50%,-100%)`; const fs = Math.round(clamp(250 / dist, 11, 22)); if (r.fs !== fs) { r.fs = fs; r.tag.style.fontSize = fs + 'px'; } r.tag.style.opacity = clamp(1.4 - dist / 55, .3, 1);
        const want = j < 3 ? medal[j] : ''; if (r.med !== want) { r.med = want; r.tag.innerHTML = (want ? UI.icon(want, 22) : '') + `<span>${UI.esc(r.p.name)}</span>`; r.tag.classList.toggle('top', !!want); }
      });
      if (started && !endAt && finN >= N) { endAt = performance.now() + (skipReq ? 400 : 6200); if (!skipReq) startCeremony(); }
      if (endAt && performance.now() > endAt) { endAt = Infinity; cleanup(); onDone(); }
    }

    // 시상식: 1~3등은 시상대, 나머지는 뒤에서 박수
    function startCeremony() {
      ceremony = true; timeScale = 1; trails.forEach(t => { t.r = null; t.t.pts.length = 0; });
      runners.forEach((r, i) => { const C = r.C; C.glow(0, 0, 0); C.o.rotation.x = 0; if (i < 3) r.pos.copy(podSpots[i]); else { const j = i - 3, row = Math.floor(j / 9), col = j % 9; r.pos.copy(podC).add(V((col - 4) * 1.75 + (row % 2) * .8, 0, 3.4 + row * 1.9)); } C.o.position.copy(r.pos); C.yaw = C.o.rotation.y = Math.PI + (i < 3 ? 0 : rand(-.2, .2)); C.play(i < 3 || i % 2 ? 'Cheer' : 'Idle', { fade: .1, force: true, speed: i < 3 ? 1 : rand(.8, 1.2), at: i < 3 ? 0 : Math.random() * .6 }); r.pos.y = 0; });
      setShot('winner', 1e9); st.cheerTo = 1; H.banner('우승!', runners[0].p.name); confetti.fire(podC.clone().setY(1), 260, 14); SFX.play('j_win'); SFX.cheer();
    }
    function onEvent(r, e) {
      const nm = `<b>${UI.esc(r.p.name)}</b>`, imp = r.i < 8 || Math.random() < .3;
      if (imp) { SFX.play({ boost: 'boost', pad: 'boost', banana: 'slip', mud: 'splash', trip: 'trip' }[e.type], { vol: .7, gap: 120 }); if (e.type === 'trip') SFX.play('crash', { vol: .5, delay: .08 }); if (e.type === 'boost') SFX.whoosh({ up: true, vol: .35 }); }
      if (e.type === 'boost') { H.comment(`${nm}의 '${UI.esc(r.sk.name)}' 발동! 폭풍 질주!`, 'bolt', r.i < 3); add.add({ p: r.pos.clone().setY(1), v: V(0, 0, 0), life: .35, s0: 1, s1: 5, c0: [.3, .9, 1.8], a: .8 }); if (r.i < 3) sw.fire(r.pos.clone(), 3.2, .5); if (r.i < 3 && simT > 2) { H.cutin(r.p, r.sk.name); st.shake = .3; } }
      else if (e.type === 'pad') H.comment(`${nm}, 행운의 부스터 패드를 밟았다!`, 'boost');
      else if (e.type === 'banana') { H.comment(`${nm}, 바나나 껍질에 미끄러졌다!`, 'banana', r.i < 3); if (e.obj) { e.fly = true; e.fT = 0; e.fV = V(rand(-3, 3), 8, rand(-3, 3)); } add.burst(14, i => ({ p: r.pos.clone().setY(1.9), v: V(Math.cos(i * 6.28) * 2.6, rand(1, 3), Math.sin(i * 6.28) * 2.6), life: .8, s0: .22, s1: .05, c0: [2, 1.5, .3], kind: 0, g: 4 })); dust(r.pos, 8, 1.4); }
      else if (e.type === 'mud') { H.comment(`${nm}, 진흙탕에 발이 빠졌다!`, 'mud'); for (let i = 0; i < 16; i++) add0(r); }
      else if (e.type === 'trip') { H.comment(`${nm}, 허들에 걸려 넘어졌다!`, 'hurdle', r.i < 3); if (e.h) e.h.falling = true; st.shake = Math.max(st.shake, .18); dust(r.pos, 14, 1.7); }
      if (imp && simT - lastCut > 3.2 && !['finish', 'podium', 'winner'].includes(cam.shot) && simT > 2) { setShot('event', simT + 1.8, r); lastCut = simT; }
    }
    function onFinish(r) {
      if (r.p.rank === 1) { winDone = true; jetT = 2.6; st.bl = 1; SFX.play('gong', { vol: .8 }); H.flash(); freeze = .45; H.banner('FINISH!', `1등 ${r.p.name}`); H.comment(`<b>${UI.esc(r.p.name)}</b> 1등으로 골인!!`, 'trophy', true); H.burst(null, null, 160); jets.forEach(j => confetti.fire(j.clone().setY(1), 200, 17)); st.shake = .4; }
      else if (r.p.rank <= 3) {
        SFX.play('glass', { rate: r.p.rank === 2 ? 1 : .85 }); SFX.cheer(); H.comment(`<b>${UI.esc(r.p.name)}</b> ${r.p.rank}등 골인!`, r.p.rank === 2 ? 'silver' : 'bronze', true); jets.forEach(j => confetti.fire(j.clone().setY(1), 60, 14));
        if (r.p.rank === 3 || N < 3) setTimeout(() => { if (destroyed) return; timeScale = 2.4; slowmo = false; setShot('podium', 1e9); H.comment('나머지 선수들도 결승선으로!', 'flag', true); }, 900);
      }
    }
    const loop = now => {
      if (destroyed) return; const ms = now - last; last = now; const dt = clamp(ms / 1000, 0, .25);
      for (let rem = dt; rem > 0 && !destroyed; rem -= .05) update(Math.min(.05, rem)); if (destroyed) return;
      st.watch(ms); st.tick(Math.min(.05, dt), Math.min(.05, dt));
      if (started) { stepAcc += dt * (slowmo ? 4 : 9) * Math.min(4, runners.filter(r => !r.finished && camera.position.distanceTo(r.pos) < 30).length); if (stepAcc > 1) { stepAcc = 0; SFX.play(Math.random() < .5 ? 'step1' : 'step2', { vary: .4, vol: .25, gap: 45, rate: slowmo ? .6 : 1 }); } SFX.crowd(winDone ? .6 : slowmo ? 1 : .45, .8); }
      st.render(); H.tick(); raf = requestAnimationFrame(loop);
    };
    H.comment(`${N}명의 선수가 출발선에 섰습니다!`, 'megaphone', true); SFX.crowd(.35, 1.5); SFX.music('bgm_race');
    raf = requestAnimationFrame(loop);
    H.countdown().then(() => { if (destroyed) return; started = true; H.flash(); H.banner('START!', '', true); setShot('front', 3.2); st.shake = .3; runners.forEach(r => dust(r.pos, 3, 1.4)); jetT = .5; });
    ctrl._dbg = { st, runners, setShot, get t() { return simT; } };
  }
  return ctrl;
}
