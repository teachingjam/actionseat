// 결승전 공용 3D 무대: 화면 품질 자동 조절, 빛 번짐, 관중, 정리
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Particles } from './fx.js';
export const rand = (a, b) => a + Math.random() * (b - a), clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, k) => a + (b - a) * k, pick = a => a[Math.floor(Math.random() * a.length)];
export const V = (x, y, z) => new THREE.Vector3(x, y, z);

// 품질: 2 높음 / 1 보통 / 0 낮음. 느리면 경기 중에도 스스로 낮추고 다음에 기억함
const QKEY = 'action-seat-gfx';
const Q = [{ pr: .75, shadow: 0, bloom: false, part: .35, crowd: .35 }, { pr: 1, shadow: 1024, bloom: false, part: .6, crowd: .6 }, { pr: 1.5, shadow: 2048, bloom: true, part: 1, crowd: 1 }];
function savedQ() { try { const v = localStorage.getItem(QKEY); return v == null ? 2 : clamp(+v, 0, 2); } catch (e) { return 2; } }

export class Stage3D {
  constructor(canvas, el, o) {
    o = o || {}; this.el = el; this.baseExp = o.exposure || 1.05; this.baseBloom = o.bloom || .45; this.q = savedQ();
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = this.baseExp;
    this.scene = new THREE.Scene(); this.camera = new THREE.PerspectiveCamera(o.fov || 50, 16 / 9, .1, o.far || 900); this.scene.add(this.camera);
    const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(r, rt); this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(4, 4), this.baseBloom, .5, o.threshold || .92); this.composer.addPass(this.bloom); this.composer.addPass(new OutputPass());
    this.add = new Particles(this.scene, 2200, true); this.smoke = new Particles(this.scene, 700, false);
    this.shake = 0; this.exp = 0; this.bl = 0; this.slow = 0; this.ft = []; this.uTime = { value: 0 }; this.uCheer = { value: .3 }; this.cheerTo = .3;
    this.onResize = () => this.resize(); addEventListener('resize', this.onResize);
    this.applyQ();
  }
  get cfg() { return Q[this.q]; }
  applyQ() {
    const c = this.cfg; this.add.scale = this.smoke.scale = c.part;
    if (this.sun) { const was = this.sun.castShadow; this.sun.castShadow = c.shadow > 0; if (c.shadow && this.sun.shadow.mapSize.x !== c.shadow) { this.sun.shadow.mapSize.set(c.shadow, c.shadow); if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; } } if (was !== this.sun.castShadow) this.scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => { m.needsUpdate = true; }); }); }
    if (this.crowd) this.crowd.forEach(m => { m.count = Math.round(m.userData.n * c.crowd); });
    this.resize();
  }
  resize() { const w = Math.max(2, this.el.clientWidth), h = Math.max(2, this.el.clientHeight), pr = Math.min(this.cfg.pr, (window.devicePixelRatio || 1) * (this.cfg.pr < 1 ? .75 : 1)) || 1; this.renderer.setPixelRatio(pr); this.renderer.setSize(w, h, false); this.composer.setPixelRatio(pr); this.composer.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
  // 초당 장수가 낮으면 한 단계씩 낮춤
  watch(ms) {
    if (document.hidden || ms > 250 || ms <= 0) return; this.ft.push(ms); if (this.ft.length < 75) return;
    this.ft.sort((a, b) => a - b); const med = this.ft[37]; this.ft = [];
    if (med > 27 && this.q > 0) { this.q--; try { localStorage.setItem(QKEY, this.q); } catch (e) {} this.applyQ(); }
  }
  sunLight(color, inten, size) { const s = this.sun = new THREE.DirectionalLight(color, inten); s.castShadow = true; s.shadow.mapSize.set(2048, 2048); Object.assign(s.shadow.camera, { left: -size, right: size, top: size, bottom: -size, near: 1, far: 160 }); s.shadow.bias = -.0004; s.shadow.normalBias = .05; this.scene.add(s, s.target); return s; }
  tick(dt, raw) {
    this.uTime.value += dt; this.uCheer.value += (this.cheerTo - this.uCheer.value) * Math.min(1, raw * 2);
    this.add.step(dt); this.smoke.step(dt);
    this.exp *= Math.exp(-raw * 5); this.bl *= Math.exp(-raw * 3.2); this.shake *= Math.exp(-raw * 4.5);
    this.renderer.toneMappingExposure = this.baseExp + this.exp * .3; this.bloom.strength = this.baseBloom + this.bl * .45;
  }
  shakeCam() { if (this.shake > .002) { const s = this.shake * .5; this.camera.position.x += rand(-s, s); this.camera.position.y += rand(-s, s); this.camera.position.z += rand(-s, s); } }
  render() { if (this.cfg.bloom) this.composer.render(); else this.renderer.render(this.scene, this.camera); }
  // 관중: 높이가 다른 계단에 앉아 들썩이는 사람들. spots(i) → {x,y,z,ry}
  makeCrowd(n, spot, bright) {
    const g = new THREE.CylinderGeometry(.15, .3, .62, 6, 1), h = new THREE.SphereGeometry(.2, 7, 6), arm = new THREE.CylinderGeometry(.05, .06, .5, 4);
    const mk = (geo, dy, col, armSide) => {
      const m = new THREE.MeshLambertMaterial({ color: 0xffffff });
      m.onBeforeCompile = s => { s.uniforms.uT = this.uTime; s.uniforms.uC = this.uCheer; s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nuniform float uT, uC;').replace('#include <begin_vertex>', `#include <begin_vertex>
        float ph = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5); float bo = abs(sin(uT * (4.5 + ph * 4.) + ph * 6.28)) * uC * (.35 + ph * .5);
        ${armSide ? `float sw = sin(uT * (6. + ph * 5.) + ph * 9.) * .5 * uC; float up = smoothstep(.25, .8, uC + ph * .5 - .25); vec3 q = transformed; q.y += .25; float an = ${armSide}. * mix(2.5, .5 + sw * .3, up); mat2 rm = mat2(cos(an), sin(an), -sin(an), cos(an)); q.xy = rm * q.xy; transformed = q + vec3(${armSide}. * -.2, .12, 0.);` : ''}
        transformed.y += bo;`); };
      m.customProgramCacheKey = () => 'crowd' + (armSide || 0);
      const im = new THREE.InstancedMesh(geo, m, n); im.frustumCulled = false; im.userData.n = n; im.userData.dy = dy; im.userData.col = col; return im;
    };
    const ms = [mk(g, 0, c => c.setHSL(Math.random(), .55, rand(.35, .6) * bright)), mk(h, .46, c => c.setHSL(.07, .45, rand(.55, .75) * bright)), mk(arm, 0, c => c.setHSL(.07, .45, .65 * bright), 1), mk(arm, 0, c => c.setHSL(.07, .45, .65 * bright), -1)];
    const o = new THREE.Object3D(), c = new THREE.Color();
    for (let i = 0; i < n; i++) { const p = spot(i); ms.forEach(m => { o.position.set(p.x, p.y + m.userData.dy, p.z); o.rotation.set(0, p.ry || 0, 0); o.updateMatrix(); m.setMatrixAt(i, o.matrix); m.setColorAt(i, m.userData.col(c)); }); }
    this.crowd = (this.crowd || []).concat(ms); this.scene.add(...ms); this.applyQ(); return ms;
  }
  dispose() {
    removeEventListener('resize', this.onResize);
    const G = new Set(), M = new Set(), X = new Set();
    this.scene.traverse(o => { if (o.geometry) G.add(o.geometry); if (o.material) [].concat(o.material).forEach(m => M.add(m)); if (o.isInstancedMesh) o.dispose(); if (o.isSkinnedMesh) o.skeleton.dispose(); });
    M.forEach(m => { for (const k in m) { const v = m[k]; if (v && v.isTexture) X.add(v); } if (m.uniforms) for (const k in m.uniforms) { const v = m.uniforms[k].value; if (v && v.isTexture) X.add(v); } m.dispose(); });
    G.forEach(g => g.dispose()); X.forEach(t => t.dispose());
    if (this.sun && this.sun.shadow.map) this.sun.shadow.map.dispose();
    this.composer.passes.forEach(p => p.dispose && p.dispose()); this.composer.dispose(); this.renderer.dispose(); this.renderer.forceContextLoss();
  }
}
export function canvasTex(w, h, draw, linear) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); if (!linear) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }

// 종이 꽃가루 (3D)
export class Confetti {
  constructor(scene, n) { this.n = n; this.p = []; this.m = new THREE.InstancedMesh(new THREE.PlaneGeometry(.2, .12), new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), n); this.m.frustumCulled = false; this.m.count = 0; this.m.setColorAt(0, new THREE.Color(1, 1, 1)); this.o = new THREE.Object3D(); scene.add(this.m); }
  fire(p, num, pow, dir) { for (let i = 0; i < num && this.p.length < this.n; i++) this.p.push({ p: p.clone(), v: V(rand(-1, 1) * pow * .5, rand(.6, 1.1) * pow, rand(-1, 1) * pow * .5).add(dir || V(0, 0, 0)), r: rand(0, 6), w: rand(-9, 9), c: new THREE.Color().setHSL(Math.random(), .9, .6), age: 0 }); }
  step(dt) { this.p = this.p.filter(q => { q.age += dt; q.v.y -= 10 * dt; q.v.multiplyScalar(Math.exp(-1.6 * dt)); q.p.addScaledVector(q.v, dt); q.r += q.w * dt; if (q.p.y < .04) { q.p.y = .04; q.w = 0; q.v.set(0, 0, 0); } return q.age < 8; }); this.p.forEach((q, i) => { this.o.position.copy(q.p); this.o.rotation.set(q.r, q.r * 1.3, q.r * .6); this.o.updateMatrix(); this.m.setMatrixAt(i, this.o.matrix); this.m.setColorAt(i, q.c); }); this.m.count = this.p.length; this.m.instanceMatrix.needsUpdate = true; this.m.instanceColor.needsUpdate = true; }
}
