// 3D 아레나 배틀로얄. 탈락 순서(=목표 순위의 역순)를 미리 정하고, 그 시각에 맞춰 공격이 명중하도록 연출합니다.
import * as THREE from 'three';
import { Stage3D, Confetti, canvasTex, rand, clamp, lerp, pick, V } from './core.js';
import { rune, crack, shock, Debris, meteorRock, Trail } from './fx.js';
import { charFactory } from './chars.js';
const { CLASSES } = GameData;

const STYLE = {
  warrior: { kind: 'melee', atk: ['1H_Melee_Attack_Slice_Diagonal', '1H_Melee_Attack_Slice_Horizontal', '1H_Melee_Attack_Chop'], hitAt: .42, sp: 1.5, col: [1.7, .75, .3], ult: 'quake', ico: 'swords' },
  mage: { kind: 'proj', proj: 'fire', atk: ['Spellcast_Shoot'], hitAt: .4, sp: 1.5, col: [1.5, .55, .12], ult: 'meteor', ico: 'int' },
  archer: { kind: 'proj', proj: 'arrow', atk: ['2H_Ranged_Shoot'], hitAt: .2, sp: 1.4, col: [.5, 1.6, .55], ult: 'volley', ico: 'target' },
  thief: { kind: 'melee', atk: ['Dualwield_Melee_Attack_Slice', 'Dualwield_Melee_Attack_Chop'], hitAt: .42, sp: 1.8, col: [.35, .85, 2], ult: 'shadow', ico: 'agi' },
  bard: { kind: 'proj', proj: 'note', atk: ['Use_Item', 'Throw'], hitAt: .35, sp: 1.6, col: [1.7, 1.1, .3], ult: 'rhapsody', ico: 'free' },
  cleric: { kind: 'pillar', atk: ['Spellcast_Raise', 'Spellcast_Shoot'], hitAt: .4, sp: 1.8, col: [1.6, 1.3, .6], ult: 'judgement', ico: 'vit' }
};
const LEAD = { proj: .55, melee: .45, pillar: .6 }, ULT_LEAD = 1.25;

export function run(root, players, onDone) {
  let destroyed = false, raf = 0, skipReq = false, st = null;
  const ctrl = { skip() { skipReq = true; }, destroy() { if (!destroyed) cleanup(); } };
  const H = FX.createHud(root, { title: '아레나 배틀로얄', icon: 'swords' });
  function cleanup() { destroyed = true; SFX.crowd(0, 1.5); SFX.music(null); cancelAnimationFrame(raf); H.destroy(); try { if (st) st.dispose(); } catch (e) { console.warn(e); } st = null; }
  function fail(e) { console.error(e); if (destroyed) return; cleanup(); onDone(); }
  const N = players.length, clsOf = p => (CLASSES[p.cls] ? p.cls : 'warrior'), keys = [...new Set(players.map(clsOf)), 'skminion', 'skwarrior'];
  H.loading(true);
  charFactory(keys).then(mk => { if (destroyed) return; try { start(mk); H.loading(false); } catch (e) { fail(e); } }, fail);

  function start(mk) {
    st = new Stage3D(H.canvas, H.el, { fov: 46, exposure: 1.08, bloom: .5 });
    const { scene, camera, add, smoke } = st, R = 20;
    // ---------------- 경기장 ----------------
    scene.fog = new THREE.Fog(0x21162f, 45, 120);
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(240, 32, 20), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, vertexShader: 'varying vec3 p; void main(){ p = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: 'varying vec3 p; float h(vec2 x){ return fract(sin(dot(x,vec2(127.1,311.7)))*43758.5); } void main(){ float y = p.y; vec3 c = mix(vec3(.20,.07,.09), vec3(.04,.035,.13), smoothstep(-.02,.4,y)); c = mix(c, vec3(.012,.01,.045), smoothstep(.35,.95,y)); vec2 g = vec2(atan(p.z,p.x)*70., y*110.); float s = step(.99, h(floor(g))) * smoothstep(.22,.0,length((fract(g)-.5)*vec2(max(.25,sqrt(1.-y*y)),1.))); c += s*smoothstep(.1,.5,y)*.9; vec3 md = normalize(vec3(-.5,.45,-.75)); float d = dot(p,md); c += smoothstep(.988,.9895,d)*vec3(1.2,1.1,.95) + pow(max(0.,d),50.)*vec3(.3,.25,.38); gl_FragColor = vec4(c,1.); }' })));
    scene.add(new THREE.HemisphereLight(0xa9b2ff, 0x6a4a3c, 1.0));
    const sun = st.sunLight(0xfff0dc, 2.3, 25); sun.position.set(-14, 30, 20); st.applyQ();
    const back = new THREE.DirectionalLight(0x7f6dff, 1.6); back.position.set(10, 14, -22); scene.add(back);
    const key = new THREE.DirectionalLight(0xffe9cf, .8); key.position.set(.5, .4, 1.6); key.target.position.set(0, 0, -6); camera.add(key, key.target);
    const floorTex = bump => canvasTex(2048, 2048, g => {
      g.translate(1024, 1024); let sd = 5; const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647; g.fillStyle = bump ? '#222' : '#2a2630'; g.fillRect(-1024, -1024, 2048, 2048);
      const rg = [0, 80, 150, 225, 300, 380, 460, 540, 625, 710, 800, 890, 1010];
      for (let i = 0; i < rg.length - 1; i++) { const n = i === 0 ? 1 : 8 + i * 5, off = r(); for (let k = 0; k < n; k++) { const a0 = (k + off) / n * 6.2832, a1 = (k + 1 + off) / n * 6.2832, p = 3, r0 = rg[i] + p, r1 = rg[i + 1] - p, pa = p / ((r0 + r1) / 2), l = 33 + r() * 9 + (i === 4 || i === 8 ? -8 : 0); g.beginPath(); if (n === 1) g.arc(0, 0, r1, 0, 7); else { g.arc(0, 0, r1, a0 + pa, a1 - pa); g.arc(0, 0, r0, a1 - pa, a0 + pa, true); } g.closePath(); const h = r() * 40; g.fillStyle = bump ? `rgb(${150 + h},${150 + h},${150 + h})` : `hsl(${r() < .6 ? 24 + r() * 14 : 262 + r() * 18},${4 + r() * 5}%,${l}%)`; g.fill(); g.save(); g.clip(); for (let q = 0; q < 16; q++) { const a = a0 + r() * (a1 - a0), d = r0 + r() * (r1 - r0); g.fillStyle = bump ? `rgba(0,0,0,${r() * .3})` : `rgba(${r() < .5 ? '0,0,0' : '255,240,255'},${r() * .06})`; g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, 3 + r() * 18, 0, 7); g.fill(); } g.restore(); } }
      if (!bump) { g.strokeStyle = 'rgba(255,200,100,.55)'; g.lineWidth = 6; [302, 627, 885].forEach(q => { g.beginPath(); g.arc(0, 0, q, 0, 7); g.stroke(); }); }
    }, bump);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(R + 2.5, 96), new THREE.MeshStandardMaterial({ map: floorTex(false), bumpMap: floorTex(true), bumpScale: 2.5, roughness: .84, metalness: .03 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    const outer = new THREE.Mesh(new THREE.CircleGeometry(150, 48), new THREE.MeshLambertMaterial({ color: 0x17122a })); outer.rotation.x = -Math.PI / 2; outer.position.y = -.4; scene.add(outer);
    const wallM = new THREE.MeshLambertMaterial({ color: 0x352c42, flatShading: true, side: THREE.DoubleSide }), trim = new THREE.MeshStandardMaterial({ color: 0xa8843c, roughness: .5, metalness: .4 });
    const ringW = (r, h0, h1, m) => { const q = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h1 - h0, 72, 1, true), m); q.position.y = (h0 + h1) / 2; scene.add(q); };
    const WR = R + 4.6; ringW(WR, -.4, 2.4, wallM); ringW(WR + .02, 2.3, 2.6, trim);
    for (let k = 0; k < 6; k++) { const r0 = WR + .5 + k * 1.9; ringW(r0, 1.6 + k * 1.05, 2.65 + k * 1.05, wallM); const s = new THREE.Mesh(new THREE.RingGeometry(r0, r0 + 1.9, 72), wallM); s.rotation.x = -Math.PI / 2; s.position.y = 2.65 + k * 1.05; scene.add(s); }
    st.makeCrowd(1900, () => { const k = Math.floor(Math.random() * 6), a = rand(0, 6.2832), r = WR + .9 + k * 1.9 + rand(0, .9); return { x: Math.cos(a) * r, y: 2.95 + k * 1.05, z: Math.sin(a) * r, ry: Math.atan2(-Math.cos(a), -Math.sin(a)) }; }, .34);
    const stone = new THREE.MeshLambertMaterial({ color: 0x75697c, flatShading: true }), stone2 = new THREE.MeshLambertMaterial({ color: 0x463c54, flatShading: true }), torches = [];
    for (let i = 0; i < 16; i++) { const a = (i + .5) / 16 * 6.2832, G = new THREE.Group(), broken = i % 5 === 2, h = broken ? 3 : 6.2; const q = (geo, y, m) => { const o = new THREE.Mesh(geo, m); o.position.y = y; o.castShadow = true; G.add(o); }; q(new THREE.BoxGeometry(2, .7, 2), .35, stone2); q(new THREE.CylinderGeometry(.62, .78, h, 10), .7 + h / 2, stone); if (!broken) q(new THREE.BoxGeometry(1.8, .5, 1.8), .95 + h, stone2); G.position.set(Math.cos(a) * (R + 3.3), -.2, Math.sin(a) * (R + 3.3)); G.rotation.y = -a; scene.add(G); if (i % 2 === 0) { const b = new THREE.Mesh(new THREE.CylinderGeometry(.5, .25, .6, 8), stone2); b.position.set(Math.cos(a + .2) * (R + 2.6), 2, Math.sin(a + .2) * (R + 2.6)); const s = new THREE.Mesh(new THREE.CylinderGeometry(.1, .15, 2, 6), stone2); s.position.copy(b.position).setY(1); scene.add(b, s); torches.push(b.position.clone().setY(2.4)); } }
    const tl = [0, 2, 4, 6].map(i => { const l = new THREE.PointLight(0xff8a3a, 60, 20, 1.7); l.position.copy(torches[i]).setY(3.2); scene.add(l); return l; });
    for (let i = 0; i < 16; i++) { const a = i / 16 * 6.2832, t = canvasTex(128, 192, g => { g.beginPath(); g.moveTo(0, 0); g.lineTo(128, 0); g.lineTo(128, 150); g.lineTo(64, 190); g.lineTo(0, 150); g.closePath(); g.fillStyle = ['#8a2033', '#28408f', '#2c7048', '#7a4a1c'][i % 4]; g.fill(); g.lineWidth = 10; g.strokeStyle = '#d0a850'; g.stroke(); g.fillStyle = '#e8c878'; g.translate(64, 80); g.beginPath(); for (let q = 0; q < 10; q++) { const w = q * Math.PI / 5 - Math.PI / 2, r = q % 2 ? 15 : 36; g[q ? 'lineTo' : 'moveTo'](Math.cos(w) * r, Math.sin(w) * r); } g.fill(); }); const b = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.1), new THREE.MeshLambertMaterial({ map: t, alphaTest: .5, side: THREE.DoubleSide })); b.position.set(Math.cos(a) * (WR - .1), 1.2, Math.sin(a) * (WR - .1)); b.lookAt(0, 1.2, 0); scene.add(b); }
    for (let i = 0; i < 11; i++) { const a = i / 11 * 6.283 + .3, h = rand(18, 30), t = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.2, h, 9), new THREE.MeshLambertMaterial({ color: 0x2a2139, flatShading: true })), c = new THREE.Mesh(new THREE.ConeGeometry(3.8, 7, 9), new THREE.MeshLambertMaterial({ color: 0x5a2740, flatShading: true })); t.position.set(Math.cos(a) * 46, h / 2, Math.sin(a) * 46); c.position.set(Math.cos(a) * 46, h + 3.5, Math.sin(a) * 46); scene.add(t, c); }

    // ---------------- 자기장 ----------------
    const zone = { r0: R - .5, r: R - .5, rEnd: 6.5 };
    const zU = { t: st.uTime }, zMat = new THREE.ShaderMaterial({ uniforms: zU, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, vertexShader: 'varying vec2 v; void main(){ v = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }', fragmentShader: 'uniform float t; varying vec2 v; float h(vec2 x){ return fract(sin(dot(x,vec2(127.1,311.7)))*43758.5); } float n(vec2 x){ vec2 i=floor(x),f=fract(x); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); } void main(){ float a = n(vec2(v.x*90., v.y*3.-t*1.4))*.6+n(vec2(v.x*210., v.y*6.-t*2.3))*.4; float k = pow(clamp(1.-v.y,0.,1.),1.7); gl_FragColor = vec4(mix(vec3(.9,.1,.55), vec3(.5,.2,1.5), v.y), k*smoothstep(.25,.75,a)*.75 + smoothstep(.04,.0,v.y)*.9); }' });
    const zWall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 3.6, 96, 1, true), zMat); zWall.position.y = 1.8; zWall.renderOrder = 4; scene.add(zWall);
    const zOut = new THREE.Mesh(new THREE.RingGeometry(1, 40, 96, 1), new THREE.MeshBasicMaterial({ color: 0x8a0f55, transparent: true, opacity: .26, depthWrite: false })); zOut.rotation.x = -Math.PI / 2; zOut.position.y = .05; scene.add(zOut);

    // ---------------- 효과 저장고 ----------------
    const timed = []; const after = (t, f) => timed.push({ t: 0, dur: t, end: f }), during = (dur, f, end) => timed.push({ t: 0, dur, f, end });
    const pool = (n, make) => { const a = Array.from({ length: n }, make); let i = 0; return () => a[i++ % n]; };
    const nCrack = pool(4, () => crack(scene, 4)), nShock = pool(10, () => shock(scene)), nRune = pool(6, () => rune(scene, 2.4, [1, 1, 1])), nRock = pool(2, () => { const m = meteorRock(); m.scale.setScalar(1.15); m.visible = false; scene.add(m); return m; });
    const shocks = []; const fireShock = (p, r, d, col) => { const s = nShock(); if (!shocks.includes(s)) shocks.push(s); s.G.children[0].material.uniforms.col.value.setRGB(...col); s.fire(p, r, d); };
    const debris = new Debris(scene, 70), confetti = new Confetti(scene, 500);
    const lights = [0, 1, 2].map(() => { const l = new THREE.PointLight(0xffffff, 0, 16, 1.6); scene.add(l); return l; }); let li = 0;
    const flashL = (p, col, pow, dur) => { const l = lights[li++ % 3]; l.position.copy(p).setY(p.y + 1.6); l.color.setRGB(Math.min(1, col[0] / 1.7), Math.min(1, col[1] / 1.7), Math.min(1, col[2] / 1.7)); during(dur, k => { l.intensity = pow * Math.pow(1 - k, 2); }, () => { l.intensity = 0; }); };
    const slashG = new THREE.RingGeometry(.75, 1.75, 28, 1, 0, 2.7);
    const nSlash = pool(18, () => { const m = new THREE.Mesh(slashG, new THREE.ShaderMaterial({ uniforms: { k: { value: 1 }, c: { value: new THREE.Color() } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, vertexShader: 'varying vec3 p; void main(){ p = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }', fragmentShader: 'uniform float k; uniform vec3 c; varying vec3 p; void main(){ float a = atan(p.y,p.x)/2.7, r = (length(p.xy)-.75); float head = k*1.5; float b = smoothstep(head-.75, head, a)*step(a, head); float e = smoothstep(0.,.9,r)*smoothstep(1.02,.9,r); gl_FragColor = vec4(mix(c, vec3(2.4), e*b*.7), b*e*(1.-smoothstep(.6,1.,k))); }' })); m.visible = false; m.renderOrder = 6; scene.add(m); return m; });
    const slash = (p, yaw, roll, size, col, dur) => { const m = nSlash(); m.visible = true; m.position.copy(p); m.rotation.set(-Math.PI / 2 + roll, 0, 0); m.rotation.order = 'YXZ'; m.rotation.y = yaw; m.rotation.z = -1.35; m.scale.setScalar(size); m.material.uniforms.c.value.setRGB(...col); during(dur || .26, k => { m.material.uniforms.k.value = k; }, () => { m.visible = false; }); };
    const beamG = new THREE.CylinderGeometry(1, 1, 24, 28, 1, true);
    const nBeam = pool(8, () => { const m = new THREE.Mesh(beamG, new THREE.ShaderMaterial({ uniforms: { k: { value: 1 }, t: st.uTime, c: { value: new THREE.Color() } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, vertexShader: 'varying vec2 v; varying vec3 n,e; void main(){ v = uv; vec4 m = modelViewMatrix*vec4(position,1.); n = normalize(normalMatrix*normal); e = normalize(-m.xyz); gl_Position = projectionMatrix*m; }', fragmentShader: 'uniform float k,t; uniform vec3 c; varying vec2 v; varying vec3 n,e; void main(){ float f = pow(clamp(abs(dot(normalize(n),normalize(e))),0.,1.),1.6); float s = .75+.25*sin(v.x*60.+t*8.)*sin(v.y*22.-t*26.); float up = smoothstep(1.,.2,v.y); gl_FragColor = vec4(c*(.45+.5*f), f*s*up*clamp(1.-k,0.,1.)*.55); }' })); m.visible = false; m.position.y = 12; m.renderOrder = 6; scene.add(m); return m; });
    const beam = (p, r0, r1, dur, col) => { const m = nBeam(); m.visible = true; m.position.set(p.x, 12, p.z); m.material.uniforms.c.value.setRGB(...col); during(dur, k => { const s = lerp(r0, r1, 1 - Math.pow(1 - k, 3)); m.scale.set(s, 1, s); m.material.uniforms.k.value = k * k; }, () => { m.visible = false; }); };
    const arrowM = new THREE.InstancedMesh(new THREE.CylinderGeometry(.035, .035, 1.1, 5).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 2.4, 1.1) }), 90); arrowM.frustumCulled = false; arrowM.count = 0; scene.add(arrowM); const arrows = [], aO = new THREE.Object3D();
    const noteTex = canvasTex(256, 128, g => { g.fillStyle = '#fff'; g.font = '110px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('♪', 64, 66); g.fillText('♫', 192, 66); });
    const nNote = pool(26, () => { const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: noteTex.clone(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); m.material.map.repeat.set(.5, 1); m.material.map.offset.x = Math.random() < .5 ? 0 : .5; m.visible = false; scene.add(m); return m; });
    const note = (p, v, dur, size) => { const m = nNote(); m.visible = true; m.position.copy(p); m.material.color.setHSL(Math.random(), .9, .6).multiplyScalar(1.6); during(dur, (k, dt) => { m.position.addScaledVector(v, dt); m.material.rotation = Math.sin(k * 14) * .4; m.scale.setScalar(size * (1 + k * .6)); m.material.opacity = 1 - k * k; }, () => { m.visible = false; }); };
    const projs = [];
    const C0 = [1.15, .42, .08], C1 = [.5, .06, .01];
    const burst = (p, n, spd, col, o) => add.burst(n, () => { const a = rand(0, 6.28), e = rand(-.4, 1.35), s = rand(.35, 1) * spd; return Object.assign({ p: p.clone(), v: V(Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s, Math.sin(a) * Math.cos(e) * s), life: rand(.25, .75), s0: rand(.08, .18), s1: .02, c0: col, c1: [col[0] * .5, col[1] * .3, col[2] * .4], kind: 3, stretch: .1, g: 7 }, o || {}); });
    const puff = (p, n, spd, o) => smoke.burst(n, () => { const a = rand(0, 6.28), s = rand(.3, 1) * spd; return Object.assign({ p: p.clone().add(V(Math.cos(a) * .4, .2, Math.sin(a) * .4)), v: V(Math.cos(a) * s, rand(.2, 1.6), Math.sin(a) * s), life: rand(.7, 1.5), s0: rand(.5, .9), s1: rand(1.4, 2.4), c0: [.16, .13, .14], c1: [.07, .06, .09], kind: 1, drag: 2.2, a: .55, spin: rand(-1, 1), fin: .06 }, o || {}); });
    const flash = (p, r, col, d) => add.add({ p: p.clone(), v: V(0, 0, 0), life: d || .18, s0: r * .35, s1: r, c0: col, a: .85 });
    const boomFx = (p, big, col) => { flash(p.clone().setY(p.y + .6), 4.5 * big, [col[0] * .7, col[1] * .7, col[2] * .7], .2); burst(p.clone().setY(p.y + .4), 40 * big, 9 * Math.sqrt(big), [col[0] * 1.4, col[1] * 1.4, col[2] * 1.4], { g: 11, floor: .05 }); puff(p, 14 * big, 3.2 * big); flashL(p, col, 90 * big, .6); };
    const fireball = (p, big) => add.burst(34 * big, () => { const a = rand(0, 6.28), e = rand(.1, 1.4), s = rand(1, 5) * big; return { p: p.clone().add(V(0, .4, 0)), v: V(Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s, Math.sin(a) * Math.cos(e) * s), life: rand(.4, .95), s0: rand(.7, 1.3), s1: rand(1.1, 2) * big, c0: [1.5, .55, .11], c1: [.35, .03, .004], kind: Math.random() < .5 ? 2 : 1, drag: 2.6, a: .6, spin: rand(-3, 3) }; });

    // ---------------- 전투원 ----------------
    const alive = document.createElement('div'); alive.className = 'alive-box'; H.overlay.appendChild(alive);
    const feed = document.createElement('div'); feed.className = 'killfeed'; H.overlay.appendChild(feed);
    const setAlive = n => { alive.innerHTML = `${UI.icon('skull', 44)}<span>생존 <span style="color:var(--gold)">${n}</span> / ${N}</span>`; };
    const killFeed = (a, v, rank) => { const d = document.createElement('div'); d.className = 'kf'; d.innerHTML = `<img class="a" src="${CLASSES[clsOf(a.p)].img}" alt="">${UI.esc(a.p.name)} ${UI.icon(a.s.ico, 26)} <img class="a" src="${CLASSES[clsOf(v.p)].img}" alt="" style="filter:grayscale(1)">${UI.esc(v.p.name)}<span class="rk">${rank}위</span>`; feed.prepend(d); while (feed.children.length > 6) feed.lastChild.remove(); };
    const ringI = new THREE.InstancedMesh(new THREE.RingGeometry(.62, .78, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, opacity: .75, depthWrite: false, blending: THREE.AdditiveBlending }), N), blobI = new THREE.InstancedMesh(new THREE.CircleGeometry(.7, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: .3, depthWrite: false }), N); ringI.frustumCulled = blobI.frustumCulled = false; scene.add(blobI, ringI); const iO = new THREE.Object3D();
    const F = players.map((p, i) => {
      const a = i / N * 6.2832 + rand(-.1, .1), r = N < 10 ? rand(5, 8) : rand(8, 15), k = clsOf(p), C = mk(k); scene.add(C.o); C.o.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); C.face(0, 0); C.o.rotation.y = C.yaw; C.idle({ fade: 0 }); C.mix.update(rand(0, 1));
      const tag = document.createElement('div'); tag.className = 'ntag hp'; tag.innerHTML = `<span>${UI.esc(p.name)}</span><i><b></b></i>`; H.tags.appendChild(tag);
      ringI.setColorAt(i, new THREE.Color(CLASSES[k].color));
      return { i, p, k, C, s: STYLE[k], sk: FX.skillOf(p), pos: C.o.position, vx: 0, vz: 0, y: 0, hp: 100, alive: true, koAt: 0, cd: rand(.3, 1.2), wan: rand(0, 6), act: 0, mode: 'idle', dash: null, chase: null, stun: 0, tag, hpEl: tag.querySelector('b'), bar: -1, dieK: 0, hidden: false };
    });
    const byRank = F.slice().sort((a, b) => a.p.rank - b.p.rank), champ = byRank[0], second = byRank[1];

    // ---------------- 탈락 순서 ----------------
    const events = [], hp = new Map(F.map(f => [f, 100])), aset = new Set(F); let t = 4.5; const steps = Math.max(0, N - 2);
    for (let k = N, j = 0; k >= 3; k--, j++) {
      const v = byRank[k - 1], others = [...aset].filter(f => f !== v), dtk = lerp(1.1, 2.3, steps > 1 ? j / (steps - 1) : 1);
      if (others.length > 1 && Math.random() < .8) { const u = pick(others), a1 = pick(others.filter(f => f !== u)), d1 = Math.min(Math.round(rand(6, 15)), hp.get(u) - 28); if (d1 >= 3) { hp.set(u, hp.get(u) - d1); events.push({ t: t + dtk * .1, a: a1, v: u, dmg: d1 }); } }
      const a2 = pick(others), a3 = pick(others), h = hp.get(v), d2 = Math.max(1, Math.round(h * rand(.35, .55)));
      events.push({ t: t + dtk * .4, a: a2, v, dmg: d2 }); events.push({ t: t + dtk * .88, a: a3, v, dmg: h - d2, ko: true, rank: k, ult: k <= 9 || j % 4 === 0 }); hp.set(v, 0); aset.delete(v); t += dtk;
    }
    const duelStart = t + 2.4; let endT = 6;
    if (N >= 2) { let hc = hp.get(champ), hs = hp.get(second), tt = duelStart; for (let i = 0; i < 7; i++) { if (i === 6) { events.push({ t: tt + .6, a: champ, v: second, dmg: hs, ko: true, rank: 2, ult: true, final: true }); break; } if (i % 2 === 1) { const d = Math.max(1, Math.round(hs * rand(.22, .35))); hs -= d; events.push({ t: tt, a: champ, v: second, dmg: d, duel: true, ult: i === 3 }); } else { const d = Math.max(1, Math.min(Math.round(rand(8, 16)), hc - 15)); hc -= d; events.push({ t: tt, a: second, v: champ, dmg: d, duel: true, ult: i === 4 }); } tt += i === 2 || i === 3 ? 1.5 : 1.05; } endT = tt + 7; }
    events.sort((a, b) => a.t - b.t); events.forEach(e => { e.lead = e.ult ? ULT_LEAD : LEAD[e.a.s.kind]; });

    // ---------------- 몬스터 ----------------
    const skN = [4, 8, 12][st.q], sks = []; for (let i = 0; i < skN; i++) { const C = mk(i % 4 === 0 ? 'skwarrior' : 'skminion'); C.o.visible = false; C.o.scale.setScalar(.82); scene.add(C.o); sks.push({ C, pos: C.o.position, on: false, sk: true, t: 0, dead: 0, sp: rand(1, 1.5) }); }
    const SL = 34, slG = new THREE.SphereGeometry(.5, 16, 12, 0, 6.2832, 0, Math.PI * .62), slM = new THREE.InstancedMesh(slG, new THREE.MeshStandardMaterial({ roughness: .18, metalness: 0, transparent: true, opacity: .92 }), SL), eyeM = new THREE.InstancedMesh(new THREE.SphereGeometry(.075, 8, 6), new THREE.MeshBasicMaterial({ color: 0x151020 }), SL * 2); slM.castShadow = true; slM.frustumCulled = eyeM.frustumCulled = false; slM.count = eyeM.count = 0; scene.add(slM, eyeM); const slimes = [], sc = new THREE.Color(); slM.setColorAt(0, sc);
    const gems = [];
    function killMon(m, f) { if (m.dead) return; m.dead = .001; SFX.play('kill', { vary: .4, gap: 80, vol: .3 }); const p = V(m.pos.x, .6, m.pos.z); burst(p, 9, 4, m.sk ? [1.2, 1.2, 1.5] : [.5, 1.5, .6], { life: .4 }); if (m.sk) { m.C.play('Death_C_Skeletons', { once: true, fade: .08, speed: 1.4 }); m.C.hit(.6); } else puff(p, 3, 1, { c0: [.2, .4, .2], a: .35, life: .5 }); for (let i = 0; i < 2; i++) gems.push({ p: p.clone(), v: V(rand(-2, 2), rand(3, 5), rand(-2, 2)), to: f, t: 0 }); }

    // ---------------- 떠오르는 글자 ----------------
    const fls = []; function floater(text, p, cls) { const d = document.createElement('div'); d.className = 'fl3 ' + (cls || ''); d.textContent = text; H.tags.appendChild(d); fls.push({ d, p: p.clone(), t: 0 }); if (fls.length > 22) { fls[0].d.remove(); fls.shift(); } }

    // ---------------- 공격 ----------------
    const act = (f, n, dur, o) => { f.act = dur; f.mode = 'act'; f.C.play(n, Object.assign({ once: true, fade: .08, force: true }, o || {})); };
    const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
    function applyHit(e) {
      const a = e.a, v = e.v, p = v.pos.clone().setY(1.15 + v.y); e.done = true;
      v.hp = Math.max(0, v.hp - e.dmg); v.C.hit(e.ult ? .9 : .7);
      SFX.play(e.ult ? 'heavy' : (Math.random() < .5 ? 'hit' : 'hit2'), { vary: .15, gap: 30 }); if (e.ult) SFX.boom({ vol: .55 });
      const dx = v.pos.x - a.pos.x, dz = v.pos.z - a.pos.z, l = Math.hypot(dx, dz) || 1; v.vx += dx / l * (e.ult ? 11 : 6.5); v.vz += dz / l * (e.ult ? 11 : 6.5);
      floater(`-${e.dmg}`, p.clone().setY(2.2), e.ult ? 'big' : ''); flash(p, e.ult ? 3.4 : 1.9, [a.s.col[0] * .6, a.s.col[1] * .6, a.s.col[2] * .6], .16); burst(p, e.ult ? 46 : 18, e.ult ? 10 : 6, a.s.col);
      st.shake = Math.max(st.shake, e.ult ? .34 : .07); hitStop = Math.max(hitStop, e.ult ? .09 : .03);
      if (!e.ko && v.act <= .1 && !v.dash) act(v, Math.random() < .5 ? 'Hit_A' : 'Hit_B', .4, { speed: 1.5 });
      if (e.duel) H.comment(`<b>${UI.esc(a.p.name)}</b>의 '${UI.esc(a.sk.name)}'! ${e.dmg} 데미지!`, a.s.ico, true);
      if (!e.ko) return;
      v.alive = false; v.koAt = simT; v.dash = null; v.hidden = false; v.C.o.visible = true; v.C.face(a.pos.x, a.pos.z); v.C.o.rotation.y = v.C.yaw; v.C.play('Death_B', { once: true, fade: .05, speed: 1.25 }); v.tag.style.display = 'none'; v.vis = false;
      SFX.play('ko', { vol: e.rank <= 8 ? .8 : .45 }); if (e.rank <= 5 || e.ult) SFX.cheer(); if (e.rank <= 5) st.cheerTo = .9;
      burst(p, 30, 8, [1.8, 1, .3]); floater(`${e.rank}위`, p.clone().setY(3.7), 'rank'); killFeed(a, v, e.rank); setAlive(F.filter(f => f.alive).length);
      if (e.final) { finalSlow = 2.1; hitStop = .28; H.flash(); st.bl = 1; H.banner('WINNER!', `${a.p.name} · ${a.sk.name}`); H.comment(`최후의 승자는 <b>${UI.esc(a.p.name)}</b>!!`, 'crown', true); SFX.crowd(.7, .4); SFX.music(null); setTimeout(() => { if (!destroyed) { H.burst(null, null, 160); SFX.play('j_win'); } }, 500); setShot('orbit', 2.2, v); }
      else { H.comment(`<b>${UI.esc(a.p.name)}</b>의 '${UI.esc(a.sk.name)}'! ${UI.esc(v.p.name)} 탈락 (${e.rank}위)`, a.s.ico, e.rank <= 6); if (e.rank <= 5) { hitStop = .16; slowK = .55; } }
    }
    function launch(e) {
      const a = e.a, v = e.v, s = a.s; a.C.face(v.pos.x, v.pos.z); a.C.o.rotation.y = a.C.yaw;
      if (e.ult) return ult(e);
      SFX.play(s.kind === 'proj' ? (s.proj === 'arrow' ? 'arrow' : s.proj === 'note' ? 'pluck' : 'fire') : s.kind === 'melee' ? 'slash' : 'zap', { vol: .6, gap: 40 });
      const nm = pick(s.atk);
      if (s.kind === 'melee') { act(a, 'Running_B', e.lead * .5, { once: false, speed: 1.8 }); a.dash = { from: a.pos.clone(), to: v, t0: simT, t1: e.t - .12, gap: 1.35 }; after(e.lead * .45, () => { if (!a.alive) return; act(a, nm, .55, { speed: s.sp }); }); after(e.lead * .8, () => { const p = v.pos.clone().setY(1.1); slash(p, a.C.yaw + Math.PI, rand(-.5, .5), 1.1, s.col); if (a.k === 'thief') after(.08, () => slash(p, a.C.yaw + Math.PI, rand(1, 2), 1, s.col)); }); e.byTime = true; }
      else if (s.kind === 'proj') { act(a, nm, .6, { speed: s.sp }); after(.14, () => projs.push({ kind: s.proj, p: a.C.tip(), to: v, arrive: e.t, e, col: s.col })); }
      else { act(a, nm, .7, { speed: s.sp, at: .15 }); after(e.lead * .45, () => { beam(v.pos, .25, .9, .5, s.col); for (let i = 0; i < 10; i++) add.add({ p: v.pos.clone().add(V(rand(-.6, .6), 0, rand(-.6, .6))), v: V(0, rand(2, 5), 0), life: .6, s0: .12, s1: .03, c0: [1.8, 1.5, .8], kind: 3, stretch: .3 }); }); e.byTime = true; }
    }
    function ult(e) {
      const a = e.a, v = e.v, s = a.s, T = e.lead, at = () => v.pos.clone().setY(0); v.stun = Math.max(v.stun, T); e.byTime = true;
      if (e.rank <= 8 || e.final || e.duel) H.cutin(a.p, a.sk.name);
      if (simT - lastCut > 2.6 || e.final || e.duel) { lastCut = simT; setShot('cast', T * .55, a, v); after(T * .5, () => { if (!destroyed) setShot('impact', 1.5, v, a); }); }
      a.C.glow(s.col[0] * .22, s.col[1] * .22, s.col[2] * .22); after(T, () => a.C.glow(0, 0, 0));
      const rn = (p, r, col, d) => { const m = nRune(); m.visible = true; m.position.set(p.x, .05, p.z); m.material.color.setRGB(...col); during(d, (k, dt) => { m.material.opacity = Math.min(1, k * 5) * (1 - Math.pow(k, 6)); m.scale.setScalar(r * (.6 + .4 * Math.min(1, k * 3))); m.rotation.z += dt * 2; }, () => { m.visible = false; }); };
      const ground = (p, big) => { const c = nCrack(); c.visible = true; c.position.set(p.x, .03, p.z); c.rotation.z = rand(0, 6); during(.14, k => c.scale.setScalar(big * (.2 + .8 * k))); during(4.2, (k, dt) => { c.u.heat.value = Math.pow(1 - k, 1.5); c.u.a.value = Math.min(1, (1 - k) * 4); c.u.t.value += dt; }, () => { c.visible = false; }); };
      switch (s.ult) {
        case 'quake': {
          SFX.play('charge'); act(a, 'Jump_Full_Long', T * .72, { speed: 1.7, fade: .06 }); rn(v.pos, .9, s.col, T);
          after(T * .18, () => { puff(a.pos, 10, 2.6); a.dash = { from: a.pos.clone(), to: v, t0: simT, t1: e.t - .04, gap: 1.2, leap: 5.2 }; }); after(T * .68, () => act(a, '2H_Melee_Attack_Chop', .9, { speed: 1.8, at: .3 }));
          after(T, () => { const p = at(); ground(p, 1.15); fireShock(p, 7, .75, [1.6, .7, .25]); fireShock(p, 4, .45, [1.6, .9, .4]); debris.fire(p, 46); boomFx(p, 1.3, s.col); SFX.play('quake'); st.shake = .55; st.bl = .7; }); break;
        }
        case 'meteor': {
          SFX.play('meteor', { vol: .9, offset: Math.max(0, 1.5 - T) }); act(a, 'Spellcast_Long', T + .3, { speed: 1.35 }); rn(a.pos, .75, [.75, .4, 1.8], T * .8); rn(v.pos, 1, [1.7, .5, .15], T); const m = nRock(), from = v.pos.clone().add(V(-6, 17, -6));
          during(T, (k, dt) => { const to = at(), q = k * k * (1.5 - .5 * k); m.visible = k > .05; m.position.lerpVectors(from, to, q); m.rotation.x += dt * 3; m.rotation.z += dt * 2; m.material.uniforms.t.value = simT; const d = from.clone().sub(to).normalize(); add.burst(10, () => ({ p: m.position.clone().add(V(rand(-.8, .8), rand(-.8, .8), rand(-.8, .8))), v: d.clone().multiplyScalar(rand(0, 4)), life: rand(.3, .7), s0: rand(1.2, 2.1), s1: .25, c0: [1.1, .38, .07], c1: C1, kind: 2, a: .5, spin: rand(-4, 4) })); add.burst(3, () => ({ p: m.position.clone(), v: d.clone().multiplyScalar(rand(4, 9)).add(V(rand(-2, 2), rand(-2, 2), rand(-2, 2))), life: rand(.4, .8), s0: .13, s1: .03, c0: [2, .95, .25], c1: C1, kind: 3, stretch: .12 })); if (Math.random() < .5) puff(m.position, 1, .6); }, () => { m.visible = false; });
          after(T, () => { const p = at(); ground(p, 1.2); fireShock(p, 8, .8, [1.5, .62, .18]); debris.fire(p, 50); fireball(p, 2); boomFx(p, 1.5, s.col); st.shake = .6; st.bl = .9; st.exp = .8; }); break;
        }
        case 'volley': {
          SFX.play('charge'); act(a, '2H_Ranged_Aiming', T * .4, { once: false }); rn(v.pos, 1.2, s.col, T + .2); after(T * .3, () => { act(a, '2H_Ranged_Shoot', .8, { speed: 1.5 }); SFX.play('arrow'); beam(a.pos, .1, .5, .5, s.col); burst(a.C.tip(), 16, 6, s.col); });
          after(T * .5, () => { SFX.play('volley'); for (let i = 0; i < 46; i++) { const p = v.pos.clone(), ang = rand(0, 6.28), r = Math.sqrt(Math.random()) * 3, to = p.clone().add(V(Math.cos(ang) * r, .1, Math.sin(ang) * r)); arrows.push({ from: to.clone().add(V(-2.5, 13, 1.5)), to, t: -rand(0, T * .48), dur: .2, hit: false, stick: .9 }); } });
          after(T, () => { const p = at(); fireShock(p, 5, .55, [.5, 1.5, .5]); boomFx(p, 1, s.col); beam(p, .4, 1.6, .55, [.3, 1.1, .35]); st.shake = .35; }); break;
        }
        case 'shadow': {
          SFX.play('whoosh'); puff(a.pos, 16, 2, { c0: [.04, .05, .12], a: .8 }); a.hidden = true; a.C.o.visible = false; a.act = T; const base = rand(0, 6.28);
          for (let i = 0; i < 6; i++) after(T * (.25 + i * .12), () => { const g = base + i * 2.4, p = v.pos.clone().add(V(Math.cos(g) * 1.5, 0, Math.sin(g) * 1.5)); puff(p, 4, 1, { c0: [.05, .06, .16], a: .7, life: .5 }); slash(v.pos.clone().setY(1.1), g, rand(-1.2, 1.2), 1.5, s.col, .3); burst(v.pos.clone().setY(1.1), 8, 5, s.col); SFX.play('slash', { gap: 0, vary: .3, vol: .7 }); if (a.alive) { a.hidden = false; a.C.o.visible = true; a.pos.set(p.x, 0, p.z); a.C.face(v.pos.x, v.pos.z); a.C.o.rotation.y = a.C.yaw; a.C.play('Dualwield_Melee_Attack_Slice', { once: true, fade: 0, force: true, speed: 2.4, at: .3 }); a.act = .4; } });
          after(T, () => { const p = v.pos.clone().setY(1.1); slash(p, base, .9, 2.6, [.5, 1.1, 2.4], .4); slash(p, base, -.9, 2.6, [.5, 1.1, 2.4], .4); fireShock(at(), 4.5, .45, [.3, .7, 1.7]); boomFx(at(), .9, s.col); st.shake = .4; st.bl = .5; }); break;
        }
        case 'rhapsody': {
          SFX.play('rhapsody'); act(a, 'Cheer', T + .4, { once: false, speed: 1.4 }); rn(a.pos, 1.1, [1.5, .9, .3], T);
          for (let i = 0; i < 4; i++) after(T * (.1 + i * .22), () => { fireShock(a.pos.clone(), 4 + i * 1.6, .7, pick([[1.6, .5, 1.1], [.4, 1.2, 1.6], [1.6, 1.1, .3], [.6, 1.6, .5]])); for (let q = 0; q < 5; q++) { const g = rand(0, 6.28); note(a.pos.clone().add(V(Math.cos(g), 1.4, Math.sin(g))), V(v.pos.x - a.pos.x, rand(0, 2), v.pos.z - a.pos.z).normalize().multiplyScalar(rand(5, 10)), .9, rand(.6, 1.1)); } });
          after(T, () => { const p = at(); for (let i = 0; i < 3; i++) after(i * .09, () => fireShock(p, 3.5 + i * 1.6, .6, [[1.6, .5, 1.1], [.4, 1.2, 1.6], [1.6, 1.1, .3]][i])); for (let i = 0; i < 12; i++) { const g = i / 12 * 6.28; note(p.clone().setY(1), V(Math.cos(g) * 5, rand(2, 5), Math.sin(g) * 5), 1, .9); } boomFx(p, 1.1, [1.6, .9, .9]); for (let i = 0; i < 40; i++) add.add({ p: p.clone().setY(1), v: V(rand(-6, 6), rand(1, 8), rand(-6, 6)), life: rand(.5, 1.1), s0: .22, s1: .04, c0: [rand(.4, 1.8), rand(.4, 1.6), rand(.4, 1.8)], g: 5 }); st.shake = .4; st.bl = .6; }); break;
        }
        default: {
          SFX.play('judgement'); act(a, 'Spellcast_Raise', T + .4, { speed: 1.3 }); rn(a.pos, .8, s.col, T); rn(v.pos, 1.2, s.col, T); during(T, k => { if (Math.random() < .8) { const g = rand(0, 6.28), r = 2.6 * (1 - k * .6), p = v.pos.clone().add(V(Math.cos(g) * r, rand(5, 9), Math.sin(g) * r)); add.add({ p, v: V(0, -9, 0), life: .5, s0: .14, s1: .04, c0: [1.8, 1.5, .8], kind: 3, stretch: .14 }); } });
          after(T * .45, () => beam(v.pos, .15, .5, T * .6, [1.2, 1, .5])); after(T, () => { const p = at(); beam(p, .5, 1.9, .9, [1.4, 1.1, .5]); beam(p, .3, .8, .6, [1.5, 1.4, 1.1]); fireShock(p, 6.5, .7, [1.6, 1.3, .6]); boomFx(p, 1.3, s.col); ground(p, .8); SFX.play('holyhit'); st.shake = .5; st.bl = .9; st.exp = .6; });
        }
      }
    }
    // 몬스터 사냥 (순위와 무관한 볼거리)
    function ambient(f, dt) {
      f.cd -= dt; if (f.cd > 0 || f.act > 0 || f.dash || f.stun > 0) return;
      let best = null, bd = f.s.kind === 'melee' ? 2.1 : 8; for (const m of slimes) { const d = flat(f.pos, m.pos); if (!m.dead && d < bd) { bd = d; best = m; } } for (const m of sks) { if (!m.on || m.dead || m.t < 1.2) continue; const d = flat(f.pos, m.pos); if (d < bd) { bd = d; best = m; } }
      if (!best) { f.cd = .25; return; } f.cd = rand(.8, 1.5); f.C.face(best.pos.x, best.pos.z); act(f, pick(f.s.atk), .5, { speed: f.s.sp }); const p = V(best.pos.x, .7, best.pos.z);
      SFX.play(f.s.kind === 'proj' ? 'shoot' : f.s.kind === 'melee' ? 'slash' : 'zap', { vol: .14, gap: 120, vary: .5 });
      if (f.s.kind === 'melee') after(.16, () => { slash(f.pos.clone().setY(1), f.C.yaw + Math.PI, rand(-.3, .3), 1, f.s.col, .22); killMon(best, f); });
      else if (f.s.kind === 'proj') after(.16, () => projs.push({ kind: f.s.proj, p: f.C.tip(), to: best, arrive: simT + bd / 17, mon: best, f, col: f.s.col, small: true }));
      else after(.2, () => { beam(p, .1, .45, .35, f.s.col); killMon(best, f); });
    }

    // ---------------- 카메라 ----------------
    const cam = { pos: V(0, 22, 30), look: V(0, 0, 0), shot: 'wide', until: 0, a: null, b: null, cut: true, ang: .6, fov: 46 }; let lastCut = -9;
    function setShot(n, dur, a, b) { cam.shot = n; cam.until = wall + dur; cam.a = a; cam.b = b; cam.cut = true; cam.side = Math.random() < .5 ? -1 : 1; }
    function goal() {
      const al = F.filter(f => f.alive); let cx = 0, cz = 0; al.forEach(f => { cx += f.pos.x; cz += f.pos.z; }); cx /= al.length || 1; cz /= al.length || 1; let sp = 0; al.forEach(f => { sp = Math.max(sp, Math.hypot(f.pos.x - cx, f.pos.z - cz)); });
      const asp = Math.min(1.25, camera.aspect / 1.6), P = (p, ang, d, y) => V(p.x + Math.sin(ang) * d, y, p.z + Math.cos(ang) * d);
      switch (cam.shot) {
        case 'intro': { const k = clamp(pre / 4.4, 0, 1), e = k * k * (3 - 2 * k); return { pos: V(Math.sin(-1.1 + e * 1.7) * lerp(12, 24, e), lerp(2.4, 17, e), Math.cos(-1.1 + e * 1.7) * lerp(12, 24, e)), look: V(0, lerp(1.8, .5, e), 0), fov: 50 }; }
        case 'cast': { const p = cam.a.pos, y = cam.a.C.yaw + cam.side * .55; return { pos: P(p, y, 4.6, 1.15 + cam.a.y * .6), look: V(p.x, 1.35 + cam.a.y * .8, p.z), fov: 40 }; }
        case 'impact': { const p = cam.a.pos, q = cam.b.pos, y = Math.atan2(p.x - q.x, p.z - q.z) + cam.side * 1.15; return { pos: P(p, y, 9.5, 3.1), look: V(p.x, 1.5, p.z), fov: 46 }; }
        case 'orbit': { const p = cam.a.pos, y = wall * .9; return { pos: P(p, y, 7, 2.6), look: V(p.x, 1.2, p.z), fov: 42 }; }
        case 'winner': { const p = champ.pos, y = champ.C.yaw + Math.sin((wall - winAt) * .35) * .5; return { pos: P(p, y, lerp(7, 4.8, clamp((wall - winAt) / 3, 0, 1)), 1.5), look: V(p.x, 1.45, p.z), fov: 38 }; }
        case 'duel': { const a = champ.pos, b = second.pos, mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, d = Math.hypot(a.x - b.x, a.z - b.z), y = Math.atan2(a.x - b.x, a.z - b.z) + Math.PI / 2 + Math.sin(wall * .3) * .35; return { pos: P({ x: mx, z: mz }, y, Math.max(6.5, d * 1.05 + 3.5) / asp, 2.9), look: V(mx, 1.2, mz), fov: 44 }; }
        default: { cam.ang += .0016; const d = clamp(sp * 1.7 + 9.5, 13, 36) / asp; return { pos: V(cx * .85 + Math.sin(cam.ang) * d * .82, d * .62, cz * .85 + Math.cos(cam.ang) * d * .82), look: V(cx * .9, .6, cz * .9), fov: 44 }; }
      }
    }

    // ---------------- 진행 ----------------
    let simT = 0, wall = 0, pre = 0, started = false, hitStop = 0, finalSlow = 0, slowK = 0, duel = false, ended = false, spAcc = 0, last = performance.now(), winAt = 0, winOn = false; cam.shot = 'intro'; cam.until = 1e9; setAlive(N);
    const tmp = V(0, 0, 0), tmp2 = V(0, 0, 0);
    function update(raw) {
      wall += raw; if (!started) pre += raw;
      let dt = raw; if (hitStop > 0) { hitStop -= raw; dt = raw * .04; } if (finalSlow > 0) { finalSlow -= raw; dt = Math.min(dt, raw * .28); } if (slowK > 0) { slowK -= raw; dt = Math.min(dt, raw * .4); }
      if (started) {
        if (skipReq) { skipReq = false; events.forEach(e => { if (e.done) return; e.done = e.launched = true; if (e.ko) { e.v.hp = 0; e.v.alive = false; e.v.koAt = simT - 9; e.v.C.o.visible = false; e.v.tag.style.display = 'none'; } else e.v.hp = Math.max(1, e.v.hp - e.dmg); }); timed.forEach(q => { if (q.end) try { q.end(); } catch (e) {} }); timed.length = 0; projs.length = 0; simT = Math.max(simT, endT - 1.6); setAlive(1); slimes.forEach(m => killMon(m, champ)); sks.forEach(m => { if (m.on) killMon(m, champ); }); champ.hidden = false; champ.C.o.visible = true; }
        simT += dt;
      }
      for (let i = timed.length - 1; i >= 0; i--) { const q = timed[i]; q.t += dt; if (q.f) q.f(Math.min(1, q.t / q.dur), dt); if (q.t >= q.dur) { timed.splice(i, 1); if (q.end) q.end(); } }
      const al = F.filter(f => f.alive), zk = clamp(simT / (duelStart - .5), 0, 1);
      zone.r = duel ? lerp(zone.r, 7.5, 1 - Math.exp(-dt * 1.2)) : lerp(zone.r0, zone.rEnd + 1.5, zk * zk * (3 - 2 * zk)); zWall.scale.set(zone.r, 1, zone.r); zOut.scale.setScalar(zone.r);
      if (started) for (const e of events) { if (e.done) continue; if (simT < e.t - 2.2) break; if (!e.launched && simT >= e.t - e.lead - 1.4) e.a.chase = { v: e.v, until: e.t }; if (!e.launched && simT >= e.t - e.lead) { e.launched = true; launch(e); } if (e.byTime && simT >= e.t) applyHit(e); }
      if (!duel && started && al.length === 2 && N >= 2 && simT > 2) { duel = true; SFX.play('duel'); SFX.music('bgm_duel'); H.banner('최후의 결투!', `${champ.p.name} VS ${second.p.name}`); H.comment(`최후의 2인! <b>${UI.esc(champ.p.name)}</b> VS <b>${UI.esc(second.p.name)}</b>`, 'swords', true); setShot('duel', 2); st.cheerTo = .9; slimes.forEach(m => killMon(m, champ)); sks.forEach(m => { if (m.on) killMon(m, champ); }); }
      // 이동
      F.forEach(f => {
        const C = f.C;
        if (!f.alive) { f.dieK = simT - f.koAt; C.step(dt, raw); f.vx *= Math.exp(-4 * dt); f.vz *= Math.exp(-4 * dt); f.pos.x += f.vx * dt; f.pos.z += f.vz * dt; if (f.dieK > 1.5) C.u.uFade.value = clamp((f.dieK - 1.5) / .9, 0, 1); if (f.dieK > 1 && f.dieK < 2.3 && Math.random() < .4) add.add({ p: f.pos.clone().add(V(rand(-.5, .5), .2, rand(-.5, .5))), v: V(0, rand(1, 2.4), 0), life: .9, s0: .2, s1: .03, c0: [.5, .8, 1.5] }); if (f.dieK > 2.5) C.o.visible = false; return; }
        f.act = Math.max(0, f.act - dt); f.stun = Math.max(0, f.stun - dt);
        if (started && !winOn) {
          let ax = 0, az = 0; f.wan += dt * rand(-1.5, 1.5); ax += Math.cos(f.wan) * 2.2; az += Math.sin(f.wan) * 2.2;
          al.forEach(o => { if (o === f) return; const dx = f.pos.x - o.pos.x, dz = f.pos.z - o.pos.z, d = Math.hypot(dx, dz); if (d < 2.2 && d > .001) { ax += dx / d * (2.2 - d) * 9; az += dz / d * (2.2 - d) * 9; } });
          const dc = Math.hypot(f.pos.x, f.pos.z); if (dc > zone.r * .82) { ax -= f.pos.x / dc * 11; az -= f.pos.z / dc * 11; }
          if (duel) { const o = f === champ ? second : champ; if (o.alive) { const dx = o.pos.x - f.pos.x, dz = o.pos.z - f.pos.z, d = Math.hypot(dx, dz) || 1; ax += dx / d * (d - 5) * 3.2 - dz / d * 3; az += dz / d * (d - 5) * 3.2 + dx / d * 3; } }
          else if (!f.chase && f.s.kind === 'melee') { let b = null, bd = 9; for (const m of slimes) { const d = flat(f.pos, m.pos); if (!m.dead && d < bd) { bd = d; b = m; } } if (b) { ax += (b.pos.x - f.pos.x) / bd * 6; az += (b.pos.z - f.pos.z) / bd * 6; } }
          if (f.chase) { if (simT > f.chase.until || !f.chase.v.alive) f.chase = null; else { const o = f.chase.v, d = flat(f.pos, o.pos), rg = f.s.kind === 'melee' ? 2.4 : 6.5; if (d > rg) { ax += (o.pos.x - f.pos.x) / d * 13; az += (o.pos.z - f.pos.z) / d * 13; } } }
          if (f.act > 0 || f.stun > 0) { ax *= .15; az *= .15; }
          const dr = Math.pow(f.act > 0 || f.stun > 0 ? .004 : .07, dt); f.vx = (f.vx + ax * dt) * dr; f.vz = (f.vz + az * dt) * dr; const sp = Math.hypot(f.vx, f.vz); if (sp > 14) { f.vx *= 14 / sp; f.vz *= 14 / sp; }
        } else { f.vx *= .8; f.vz *= .8; }
        if (f.dash) { const D = f.dash, k = clamp((simT - D.t0) / Math.max(.01, D.t1 - D.t0), 0, 1), e = k * k * (3 - 2 * k), dx = D.to.pos.x - D.from.x, dz = D.to.pos.z - D.from.z, dl = Math.hypot(dx, dz) || 1; f.pos.x = lerp(D.from.x, D.to.pos.x - dx / dl * D.gap, e); f.pos.z = lerp(D.from.z, D.to.pos.z - dz / dl * D.gap, e); f.y = D.leap ? Math.sin(Math.PI * k) * D.leap : 0; if (!D.leap && Math.random() < .5) puff(f.pos, 1, .8, { c0: [.3, .27, .3], a: .3, life: .5, s0: .3, s1: .8 }); if (D.leap) add.add({ p: f.pos.clone().setY(f.y + 1), v: V(0, 0, 0), life: .4, s0: .8, s1: .1, c0: [1.2, .5, .15], a: .6 }); if (k >= 1) { f.dash = null; f.y = 0; } }
        else { f.pos.x += f.vx * dt; f.pos.z += f.vz * dt; f.y = Math.max(0, f.y - dt * 14); }
        const r = Math.hypot(f.pos.x, f.pos.z); if (r > R) { f.pos.x *= R / r; f.pos.z *= R / r; } f.pos.y = f.y;
        if (f.act <= 0 && !f.dash) { const sp = Math.hypot(f.vx, f.vz), want = winOn ? 'win' : sp > .9 ? 'run' : 'idle'; if (want !== f.mode) { f.mode = want; if (want === 'run') C.run({ fade: .12 }); else if (want === 'win') { C.play('Cheer', { fade: .2 }); } else C.idle({ fade: .16 }); } if (want === 'run') { C.speed(clamp(sp / 3.4, .6, 1.7)); C.yaw = Math.atan2(f.vx, f.vz); } else if (duel && !winOn) { const o = f === champ ? second : champ; C.face(o.pos.x, o.pos.z); } }
        C.step(dt, raw); if (started && !ended && !winOn) ambient(f, dt);
      });
      F.forEach((f, i) => { const on = f.alive && !f.hidden ? 1 : 0.0001; iO.position.set(f.pos.x, .04, f.pos.z); iO.scale.setScalar(on); iO.updateMatrix(); ringI.setMatrixAt(i, iO.matrix); iO.position.y = .03; iO.scale.setScalar(on * (1 - Math.min(.5, f.y * .1))); iO.updateMatrix(); blobI.setMatrixAt(i, iO.matrix); }); ringI.instanceMatrix.needsUpdate = blobI.instanceMatrix.needsUpdate = true; if (ringI.instanceColor && !ringI.userData.c) { ringI.instanceColor.needsUpdate = true; ringI.userData.c = 1; }
      // 몬스터
      if (started && !duel && simT < duelStart - 2) { spAcc += dt * (4.2 + simT * .06) * (st.q + 1) / 3; while (spAcc > 1) { spAcc--; const a = rand(0, 6.28), rr = Math.max(4, zone.r - rand(.5, 3)), off = sks.find(m => !m.on); if (off && Math.random() < .4) { off.on = true; off.dead = 0; off.t = 0; off.pos.set(Math.cos(a) * rr * .85, 0, Math.sin(a) * rr * .85); off.C.o.visible = true; off.C.u.uFade.value = 0; off.C.face(0, 0); off.C.o.rotation.y = off.C.yaw; off.C.play('Spawn_Ground_Skeletons', { once: true, fade: 0, force: true, speed: 1.6 }); puff(off.pos, 8, 1.4, { c0: [.14, .1, .16] }); add.add({ p: off.pos.clone().setY(.1), v: V(0, 0, 0), life: .6, s0: .6, s1: 2.6, c0: [.5, .2, 1.1], a: .7 }); } else if (slimes.length < SL * (st.q + 1) / 3) slimes.push({ pos: V(Math.cos(a) * rr, 0, Math.sin(a) * rr), ph: rand(0, 6), sp: rand(.9, 1.6), h: pick([.33, .5, .08, .85]), s: rand(.75, 1.25), dead: 0, g: 0 }); } }
      const near = m => { let b = null, bd = 1e9; al.forEach(f => { const d = flat(f.pos, m.pos); if (d < bd) { bd = d; b = f; } }); return [b, bd]; };
      sks.forEach(m => { if (!m.on) return; m.t += dt; m.C.step(dt, raw); if (m.dead) { m.dead += dt; if (m.dead > .9) m.C.u.uFade.value = clamp((m.dead - .9) / .5, 0, 1); if (m.dead > 1.5) { m.on = false; m.C.o.visible = false; } return; } if (m.t < 1.3) return; const [b, d] = near(m); if (b && d > 1.5) { m.C.run({ fade: .2 }); m.pos.x += (b.pos.x - m.pos.x) / d * m.sp * dt; m.pos.z += (b.pos.z - m.pos.z) / d * m.sp * dt; m.C.face(b.pos.x, b.pos.z); } else if (b) { m.C.face(b.pos.x, b.pos.z); m.C.play('1H_Melee_Attack_Chop', { fade: .15 }); } });
      for (let i = slimes.length - 1; i >= 0; i--) { const m = slimes[i]; if (m.dead) { m.dead += dt; if (m.dead > .18) slimes.splice(i, 1); continue; } m.g = Math.min(1, m.g + dt * 2); const hop = Math.max(0, Math.sin(simT * 5 + m.ph)); const [b, d] = near(m); if (b && d > 1) { m.pos.x += (b.pos.x - m.pos.x) / d * m.sp * dt * hop * 1.8; m.pos.z += (b.pos.z - m.pos.z) / d * m.sp * dt * hop * 1.8; m.yaw = Math.atan2(b.pos.x - m.pos.x, b.pos.z - m.pos.z); } }
      slimes.forEach((m, i) => { const ph = Math.sin(simT * 5 + m.ph), hop = Math.max(0, ph) * .5, sq = 1 - Math.min(0, ph) * -.28, d = m.dead ? 1 - m.dead / .18 : m.g, s = m.s * d; iO.rotation.set(0, m.yaw || 0, 0); iO.position.set(m.pos.x, hop * m.s + .18 * s, m.pos.z); iO.scale.set(s * (2 - sq) * .95, s * sq * 1.05, s * (2 - sq) * .95); iO.updateMatrix(); slM.setMatrixAt(i, iO.matrix); slM.setColorAt(i, sc.setHSL(m.h, .75, m.dead ? .9 : .5)); [-1, 1].forEach((q, j) => { const y = m.yaw || 0; iO.position.set(m.pos.x + Math.sin(y) * .42 * s + Math.cos(y) * .17 * q * s, hop * m.s + .42 * s * sq, m.pos.z + Math.cos(y) * .42 * s - Math.sin(y) * .17 * q * s); iO.scale.setScalar(s); iO.updateMatrix(); eyeM.setMatrixAt(i * 2 + j, iO.matrix); }); }); iO.rotation.set(0, 0, 0); iO.scale.setScalar(1);
      slM.count = slimes.length; eyeM.count = slimes.length * 2; slM.instanceMatrix.needsUpdate = eyeM.instanceMatrix.needsUpdate = true; if (slM.instanceColor) slM.instanceColor.needsUpdate = true;
      // 날아가는 것들
      for (let i = projs.length - 1; i >= 0; i--) {
        const q = projs[i], rt = q.arrive - simT, to = tmp.set(q.to.pos.x, q.mon ? .6 : 1.2 + (q.to.y || 0), q.to.pos.z); if (rt <= 0 || (q.mon && q.mon.dead)) { projs.splice(i, 1); if (q.e) { if (!q.e.done) applyHit(q.e); if (q.kind === 'fire') { fireball(to, .5); flashL(to, q.col, 30, .3); } } else if (q.mon && !q.mon.dead) { killMon(q.mon, q.f); burst(to, 8, 4, q.col); } continue; }
        const k = Math.min(1, dt / Math.max(dt, rt)); tmp2.copy(q.p); q.p.lerp(to, k); const v = tmp2.subVectors(q.p, tmp2).divideScalar(Math.max(.001, dt)); const s = q.small ? .55 : 1;
        if (q.kind === 'fire') { add.burst(q.small ? 2 : 4, () => ({ p: q.p.clone().add(V(rand(-.12, .12), rand(-.12, .12), rand(-.12, .12))), v: v.clone().multiplyScalar(.08).add(V(rand(-.5, .5), rand(-.2, .8), rand(-.5, .5))), life: rand(.18, .4), s0: rand(.5, .85) * s, s1: .08, c0: [1.4, .5, .1], c1: C1, kind: 2, a: .7, spin: 4 })); add.add({ p: q.p.clone(), v: V(0, 0, 0), life: .07, s0: 1 * s, s1: .7 * s, c0: [1.5, .8, .3], a: .9 }); }
        else if (q.kind === 'arrow') { arrows.push({ from: q.p.clone().addScaledVector(v, -.016), to: q.p.clone(), t: .99, dur: 1, flash: true }); add.add({ p: q.p.clone(), v: v.clone().multiplyScalar(.2), life: .16, s0: .16 * s, s1: .03, c0: [.5, 1.6, .6], kind: 3, stretch: .3 }); }
        else { if (Math.random() < .35) note(q.p.clone(), V(rand(-.6, .6), rand(.2, 1), rand(-.6, .6)), .5, .5 * s); add.add({ p: q.p.clone(), v: V(0, 0, 0), life: .14, s0: .5 * s, s1: .2, c0: [1.5, .9, .3], a: .8 }); }
      }
      let an = 0; for (let i = arrows.length - 1; i >= 0; i--) { const q = arrows[i]; q.t += dt; if (q.flash) { if (q.n) { arrows.splice(i, 1); continue; } q.n = 1; } else if (q.t > q.dur + q.stick) { arrows.splice(i, 1); continue; } const k = q.flash ? 1 : clamp(q.t / q.dur, 0, 1); if (q.t < 0 || an >= 90) continue; if (!q.flash && k >= 1 && !q.hit) { q.hit = true; burst(q.to, 3, 4, [.5, 1.5, .6], { life: .3 }); puff(q.to, 1, .6, { a: .3, s1: .7 }); } aO.position.lerpVectors(q.from, q.to, k); aO.lookAt(q.to.x + (q.to.x - q.from.x), q.to.y + (q.to.y - q.from.y), q.to.z + (q.to.z - q.from.z)); aO.updateMatrix(); arrowM.setMatrixAt(an++, aO.matrix); } arrowM.count = an; arrowM.instanceMatrix.needsUpdate = true;
      for (let i = gems.length - 1; i >= 0; i--) { const g = gems[i]; g.t += dt; if (!g.to.alive) g.to = champ; if (g.t < .45) { g.v.y -= 12 * dt; g.p.addScaledVector(g.v, dt); if (g.p.y < .15) { g.p.y = .15; g.v.set(0, 0, 0); } } else { tmp.copy(g.to.pos).setY(1); const d = g.p.distanceTo(tmp); g.p.lerp(tmp, Math.min(1, dt * (6 + g.t * 8))); if (d < .5) { gems.splice(i, 1); SFX.play('gem', { vary: .4, gap: 90, vol: .22 }); continue; } } add.add({ p: g.p.clone(), v: V(0, 0, 0), life: .12, s0: .26, s1: .1, c0: [.3, 1, 1.5], a: .9 }); }
      shocks.forEach(s => s.step(dt)); debris.step(dt); confetti.step(raw);
      torches.forEach(p => { if (Math.random() < .5 * st.cfg.part + .1) add.add({ p: p.clone().add(V(rand(-.2, .2), 0, rand(-.2, .2))), v: V(rand(-.2, .2), rand(1.2, 2.2), rand(-.2, .2)), life: rand(.4, .8), s0: rand(.6, 1), s1: .1, c0: C0, c1: C1, kind: 2, a: .5, spin: rand(-2, 2) }); }); tl.forEach((l, i) => { l.intensity = 55 + 12 * Math.sin(wall * 9 + i * 2) + 8 * Math.sin(wall * 23 + i); });
      // 승자
      if (started && !winOn && simT >= endT - 4.6 && (N === 1 || !second.alive)) { winOn = true; winAt = wall; champ.hidden = false; champ.C.o.visible = true; champ.stun = 0; champ.act = 0; champ.dash = null; champ.mode = ''; champ.C.yaw = Math.atan2(camera.position.x - champ.pos.x, camera.position.z - champ.pos.z); setShot('winner', 1e9); st.cheerTo = 1; for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28; confetti.fire(V(champ.pos.x + Math.cos(a) * 3, .2, champ.pos.z + Math.sin(a) * 3), 45, 13); } beam(champ.pos, .5, 1.6, 1.6, [.9, .7, .3]); }
      if (winOn && Math.random() < raw * 4) confetti.fire(V(champ.pos.x + rand(-4, 4), .2, champ.pos.z + rand(-4, 4)), 10, 12);
      // 카메라
      if (wall > cam.until) { cam.shot = winOn ? 'winner' : duel && second.alive ? 'duel' : 'wide'; cam.until = 1e9; cam.cut = true; if (cam.shot === 'wide') cam.ang = rand(0, 6.28); }
      const g = goal(), k = cam.cut ? 1 : 1 - Math.exp(-raw * (cam.shot === 'wide' ? 2.2 : 5)); cam.cut = false; cam.pos.lerp(g.pos, k); cam.look.lerp(g.look, k); cam.fov += (g.fov - cam.fov) * k; camera.position.copy(cam.pos); camera.fov = cam.fov; camera.updateProjectionMatrix(); camera.lookAt(cam.look); st.shakeCam();
      sun.position.copy(cam.look).add(V(-14, 30, 20)); sun.target.position.copy(cam.look); sun.target.updateMatrixWorld(); if (!winOn && !duel) st.cheerTo = lerp(st.cheerTo, .35, raw * .5);
      // 이름표·글자
      camera.updateMatrixWorld(); const w = H.el.clientWidth, h = H.el.clientHeight; F.forEach(f => { if (!f.alive) return; tmp.copy(f.pos); tmp.y += 2.7; const d = camera.position.distanceTo(f.pos), p = tmp.project(camera), vis = !f.hidden && p.z < 1 && Math.abs(p.x) < 1.1 && Math.abs(p.y) < 1.15; if (f.vis !== vis) { f.vis = vis; f.tag.style.display = vis ? 'flex' : 'none'; } if (!vis) return; f.tag.style.transform = `translate(${((p.x + 1) / 2 * w).toFixed(1)}px,${((1 - p.y) / 2 * h).toFixed(1)}px) translate(-50%,-100%)`; const fs = Math.round(clamp(330 / d, 11, 22)); if (f.fs !== fs) { f.fs = fs; f.tag.style.fontSize = fs + 'px'; } const b = Math.round(f.hp); if (f.bar !== b) { f.bar = b; f.hpEl.style.width = b + '%'; f.hpEl.style.background = b > 50 ? '#4ff0a0' : b > 25 ? '#ffcf4a' : '#ff5a6e'; } });
      for (let i = fls.length - 1; i >= 0; i--) { const q = fls[i]; q.t += raw; if (q.t > 1.1) { q.d.remove(); fls.splice(i, 1); continue; } tmp.copy(q.p); tmp.y += q.t * 1.3; const p = tmp.project(camera); q.d.style.display = p.z < 1 ? '' : 'none'; q.d.style.transform = `translate(${((p.x + 1) / 2 * w).toFixed(1)}px,${((1 - p.y) / 2 * h).toFixed(1)}px) translate(-50%,-50%) scale(${q.t < .12 ? .6 + q.t * 6 : 1.32 - Math.min(.32, (q.t - .12) * .5)})`; q.d.style.opacity = q.t > .7 ? 1 - (q.t - .7) / .4 : 1; }
      if (!ended && started && simT >= endT) { ended = true; setTimeout(() => { if (destroyed) return; cleanup(); onDone(); }, 200); }
    }
    const loop = now => {
      if (destroyed) return; const ms = now - last; last = now; const dt = clamp(ms / 1000, 0, .25);
      for (let rem = dt; rem > 0 && !destroyed; rem -= .05) update(Math.min(.05, rem)); if (destroyed) return;
      st.watch(ms); const sd = Math.min(.05, dt) * (finalSlow > 0 ? .3 : hitStop > 0 ? .2 : slowK > 0 ? .45 : 1); st.tick(sd, Math.min(.05, dt)); if (started) SFX.crowd(winOn ? .75 : duel ? .6 : .38, .8);
      st.render(); H.tick(); raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop); H.comment(`${N}명의 용사가 아레나에 모였다! 몬스터 떼가 몰려온다!`, 'skull', true); SFX.crowd(.35, 1.5); SFX.music('bgm_battle');
    H.countdown(['3', '2', '1', 'FIGHT!']).then(() => { if (destroyed) return; started = true; H.flash(); st.shake = .4; setShot('wide', 1e9); cam.ang = .6; cam.cut = false; F.forEach(f => puff(f.pos, 3, 1.5)); });
    ctrl._dbg = { st, F, events, setShot, cam, get t() { return simT; }, endT, duelStart };
  }
  return ctrl;
}
