// 3D 캐릭터: KayKit(CC0) 모델을 직업별로 색·장비를 바꿔 조립하고, 한 덩어리 메시로 합쳐 여러 명을 가볍게 그립니다.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const BASE = new URL('../../assets/models/', import.meta.url).href;
const clean = n => n.replace(/[.\s]/g, '');
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------- 동작 묶음 ----------
let animP = null;
function loadAnims() {
  return animP || (animP = fetch(BASE + 'anims.bin').then(r => { if (!r.ok) throw new Error('anims'); return r.arrayBuffer(); }).then(ab => {
    const n = new DataView(ab).getUint32(0, true), h = JSON.parse(new TextDecoder().decode(new Uint8Array(ab, 4, n))), o = 4 + n, clips = {};
    h.clips.forEach(c => {
      const times = new Float32Array(c.n); for (let i = 0; i < c.n; i++) times[i] = i / (c.n - 1) * c.dur;
      const q = new Int16Array(ab, o + c.q, h.bones.length * c.n * 4), tr = [];
      h.bones.forEach((b, bi) => {
        const v = new Float32Array(c.n * 4); let same = true;
        for (let i = 0; i < v.length; i++) { v[i] = q[bi * c.n * 4 + i] / 32767; if (i >= 4 && Math.abs(v[i] - v[i % 4]) > .0008) same = false; }
        tr.push(same ? new THREE.QuaternionKeyframeTrack(clean(b) + '.quaternion', [0], v.slice(0, 4)) : new THREE.QuaternionKeyframeTrack(clean(b) + '.quaternion', times, v));
        if (c.p[b] != null) tr.push(new THREE.VectorKeyframeTrack(clean(b) + '.position', times, new Float32Array(ab, o + c.p[b], c.n * 3)));
      });
      clips[c.name] = new THREE.AnimationClip(c.name, c.dur, tr);
    });
    return clips;
  }));
}

// ---------- 장비 만들기 ----------
const colored = (g, hex, glow) => { const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 4); for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b, glow ? 2 : 1], i * 4); g.setAttribute('tint', new THREE.BufferAttribute(a, 4)); if (!g.index) { const ix = []; for (let i = 0; i < n; i++) ix.push(i); g.setIndex(ix); } return g; };
const xf = (g, p, r, s) => { const m = new THREE.Matrix4().compose(V(...(p || [0, 0, 0])), new THREE.Quaternion().setFromEuler(new THREE.Euler(...(r || [0, 0, 0]))), Array.isArray(s) ? V(...s) : V(s || 1, s || 1, s || 1)); g.applyMatrix4(m); return g; };
const cyl = (a, b, h, n) => new THREE.CylinderGeometry(a, b, h, n || 10), sph = (r, w, h) => new THREE.SphereGeometry(r, w || 14, h || 10), box = (x, y, z) => new THREE.BoxGeometry(x, y, z), tor = (r, t, n, m) => new THREE.TorusGeometry(r, t, n || 8, m || 24);
function feather(hex) { const g = new THREE.SphereGeometry(.5, 10, 12); xf(g, null, null, [.16, 1, .035]); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i) + .5; p.setX(i, p.getX(i) + y * y * .22); p.setZ(i, p.getZ(i) - y * y * .12); } g.computeVertexNormals(); return colored(g, hex); }
const PROPS = {
  // 궁수: 깃털 모자 + 화살통
  archerCap: () => [
    ['head', xf(colored(sph(.5, 18, 10), '#2f7a3f'), [0, .73, -.04], [-.12, 0, 0], [1.16, .62, 1.14])],
    ['head', xf(colored(cyl(.60, .70, .10, 20), '#245f31'), [0, .60, .02], [-.10, 0, 0], [1, 1, 1.12])],
    ['head', xf(colored(cyl(.605, .605, .055, 20), '#c8923a'), [0, .665, .01], [-.10, 0, 0], [1, 1, 1.1])],
    ['head', xf(feather('#e8473c'), [.50, .86, -.12], [-.75, .2, -.35], .85)],
    ['chest', xf(colored(cyl(.17, .14, .75, 10), '#7a4a26'), [-.18, .28, -.42], [.12, 0, .5])],
    ['chest', xf(colored(cyl(.185, .185, .07, 10), '#c8923a'), [-.36, .60, -.46], [.12, 0, .5])],
    ...[[-.42, -.05], [-.36, .04], [-.48, .05]].map(([x, z]) => ['chest', xf(colored(cyl(.02, .02, .4, 5), '#d9b98a'), [x - .04, .78, -.46 + z], [.12, 0, .5])]),
    ...[[-.42, -.05], [-.36, .04], [-.48, .05]].map(([x, z]) => ['chest', xf(colored(box(.1, .16, .02), '#f2f2f2'), [x - .13, .95, -.47 + z], [.12, 0, .5])])
  ],
  // 음유시인: 챙 넓은 깃털 모자 + 류트
  bardHat: () => [
    ['head', xf(colored(sph(.56, 20, 12), '#b8352f'), [.06, .80, -.05], [-.10, 0, -.18], [1.2, .46, 1.18])],
    ['head', xf(colored(cyl(.72, .76, .07, 24), '#8f2626'), [0, .66, -.01], [-.10, 0, -.06], [1.06, 1, 1.12])],
    ['head', xf(colored(cyl(.62, .62, .08, 22), '#f0c24a'), [0, .70, -.01], [-.10, 0, -.08])],
    ['head', xf(feather('#ffffff'), [.52, 1.02, -.16], [-.9, .25, -.45], 1.05)],
    ['head', xf(feather('#4bc0e8'), [.50, .95, -.06], [-.8, .4, -.75], .8)]
  ],
  lute: () => [
    ['handslotl', xf(colored(sph(.36, 18, 14), '#c9813a'), [.02, -.02, .04], null, [1, 1.2, .42])],
    ['handslotl', xf(colored(cyl(.335, .335, .03, 22), '#e9bd76'), [.02, -.03, .16], [Math.PI / 2, 0, 0], [1, 1, 1.18])],
    ['handslotl', xf(colored(cyl(.1, .1, .035, 16), '#4a2a14'), [.02, .02, .165], [Math.PI / 2, 0, 0])],
    ['handslotl', xf(colored(box(.11, .72, .07), '#6b3d1d'), [.02, .66, .1])],
    ['handslotl', xf(colored(box(.17, .22, .07), '#4a2a14'), [.02, 1.06, .05], [-.5, 0, 0])],
    ...[-.03, 0, .03].map(x => ['handslotl', xf(colored(box(.008, 1.1, .008), '#fff6d8'), [.02 + x, .42, .185])])
  ],
  // 성직자: 후광 + 빛의 지팡이
  halo: () => [['head', xf(colored(tor(.46, .045, 8, 36), '#ffd76a', true), [0, 1.22, -.12], [Math.PI / 2 - .25, 0, 0])]],
  holyStaff: () => [
    ['handslotr', xf(colored(cyl(.05, .05, 2, 8), '#e9e2d2'), [0, .15, 0])],
    ['handslotr', xf(colored(sph(.09), '#e0a83c'), [0, -.88, 0])],
    ['handslotr', xf(colored(cyl(.09, .06, .18, 8), '#e0a83c'), [0, 1.1, 0])],
    ['handslotr', xf(colored(tor(.27, .05, 8, 28), '#f0bd4c'), [0, 1.42, 0])],
    ['handslotr', xf(colored(new THREE.OctahedronGeometry(.16), '#fff2b8', true), [0, 1.42, 0], null, [.8, 1.25, .8])],
    ...[0, 1, 2, 3].map(i => ['handslotr', xf(colored(new THREE.ConeGeometry(.06, .2, 6), '#f0bd4c'), [Math.sin(i * Math.PI / 2) * .38, 1.42 + Math.cos(i * Math.PI / 2) * .38, 0], [0, 0, -i * Math.PI / 2])])
  ]
};

// ---------- 직업별 조립 ----------
// cells: 색상판 칸(열,행)을 새 색(위, 아래)으로 바꿈
export const LOOKS = {
  warrior: { base: 'knight', hide: ['1H_Sword_Offhand', 'Badge_Shield', 'Rectangle_Shield', 'Spike_Shield', '2H_Sword'], cells: { '3,0': ['#d7dee8', '#8d97a8'], '0,1': ['#ff5a4e', '#8c1626'] }, idle: 'Idle', run: 'Running_A', tip: ['handslotr', 1.4], color: '#ff6b6b' },
  mage: { base: 'mage', hide: ['Spellbook', 'Spellbook_open', '1H_Wand'], cells: { '1,1': ['#8d7cff', '#3a2a94'], '0,1': ['#7a68ea', '#2c1f78'], '6,2': ['#7cf0ff', '#2a6fe0'] }, idle: '2H_Melee_Idle', run: 'Running_A', tip: ['handslotr', 1.15], color: '#b48cff' },
  archer: { base: 'rogue', hide: ['Knife_Offhand', '1H_Crossbow', 'Knife', 'Throwable'], cells: { '0,1': ['#6cc65c', '#2c7a3a'], '1,1': ['#3f9a4e', '#1c5a30'], '1,0': ['#e2a455', '#9a5a26'], '5,2': ['#9a6a3e', '#5e3a1e'] }, props: ['archerCap'], idle: 'Idle', run: 'Running_A', tip: ['handslotr', .8], color: '#7be07b' },
  thief: { base: 'hooded', hide: ['1H_Crossbow', '2H_Crossbow', 'Throwable'], cells: { '0,1': ['#4a5478', '#1d2238'], '1,1': ['#38406a', '#12152a'], '1,0': ['#2a2438', '#15101f'], '3,0': ['#58c8ff', '#1a6fb0'], '5,2': ['#3a3550', '#1e1a30'] }, idle: 'Idle', run: 'Running_B', tip: ['handslotr', .75], color: '#4dd4ff' },
  bard: { base: 'rogue', hide: ['Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Knife', 'Throwable'], cells: { '0,1': ['#ffb347', '#d9702a'], '1,1': ['#c23a36', '#7a1a28'], '1,0': ['#8a5230', '#4a2614'], '5,2': ['#fff0cf', '#d8b988'], '3,0': ['#f5cf5a', '#c08a2a'], '3,2': ['#7a3a5e', '#48203c'] }, props: ['bardHat', 'lute'], idle: 'Idle', run: 'Running_A', tip: ['handslotl', .3], color: '#ffb84d' },
  cleric: { base: 'mage', hide: ['Spellbook', 'Spellbook_open', '1H_Wand', '2H_Staff', 'Mage_Hat'], cells: { '0,1': ['#ffffff', '#c9d3ea'], '1,1': ['#f5d67a', '#c99a34'], '2,1': ['#8ec8ff', '#3a6fc0'], '1,0': ['#f7dc9a', '#c99a50'], '3,0': ['#f5d27a', '#c8963a'], '5,0': ['#f0c24a', '#b07c22'], '4,0': ['#f3f5fb', '#b9c3da'], '3,2': ['#e9edf7', '#aeb9d2'], '7,1': ['#d8b066', '#94692c'] }, props: ['halo', 'holyStaff'], idle: '2H_Melee_Idle', run: 'Running_A', tip: ['handslotr', 1.42], color: '#ffe066' },
  skminion: { base: 'skminion', hide: [], cells: {}, idle: 'Idle', run: 'Walking_D_Skeletons', tip: ['handslotr', .3], color: '#cfd8e6' },
  skwarrior: { base: 'skwarrior', hide: [], cells: {}, idle: 'Idle', run: 'Walking_D_Skeletons', tip: ['handslotr', .3], color: '#cfd8e6' }
};

const gltfs = {}, variants = {};
const loader = new GLTFLoader();
const loadBase = k => gltfs[k] || (gltfs[k] = loader.loadAsync(BASE + k + '.glb'));

function recolor(img, cells) {
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d'); g.drawImage(img, 0, 0, 512, 512);
  for (const k in cells) { const [x, y] = k.split(',').map(Number), q = g.createLinearGradient(0, y * 128, 0, y * 128 + 128); q.addColorStop(0, cells[k][0]); q.addColorStop(1, cells[k][1]); g.fillStyle = q; g.fillRect(x * 64, y * 128, 64, 128); }
  const t = new THREE.CanvasTexture(c); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

async function buildVariant(key) {
  const L = LOOKS[key], gl = await loadBase(L.base), root = gl.scene; root.updateMatrixWorld(true);
  let skin0 = null; root.traverse(o => { if (o.isSkinnedMesh && !skin0) skin0 = o; });
  const bones = skin0.skeleton.bones, inv = skin0.skeleton.boneInverses;
  const keep = bones.map((b, i) => i).filter(i => !/IK|control/.test(bones[i].name)); // 조종용 뼈는 버림
  const idx = new Map(keep.map((i, n) => [bones[i].name, n]));
  const remap = bones.map((b, i) => { let q = b; while (q && !idx.has(q.name)) q = q.parent; return q ? idx.get(q.name) : 0; });
  const parts = [], hide = new Set(L.hide.map(THREE.PropertyBinding.sanitizeNodeName));
  let glowTex = false;
  const addPart = (g, boneI, M) => {
    const n = g.attributes.position.count; const q = g.clone();
    for (const a of Object.keys(q.attributes)) if (!['position', 'normal', 'uv', 'tint', 'skinIndex', 'skinWeight'].includes(a)) q.deleteAttribute(a);
    if (boneI != null) { // 뼈에 붙은 장비: 그 뼈에 100% 따라가도록 굽기
      const bind = inv[keep[boneI]].clone().invert(); q.applyMatrix4(bind.multiply(M));
      const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4); for (let i = 0; i < n; i++) { si[i * 4] = boneI; sw[i * 4] = 1; }
      q.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); q.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    } else {
      const s = g.attributes.skinIndex, w = g.attributes.skinWeight, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) { si[i * 4 + k] = remap[s.getComponent(i, k)]; sw[i * 4 + k] = w.getComponent(i, k); }
      q.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); q.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    }
    if (!q.attributes.uv) q.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    if (!q.attributes.tint) q.setAttribute('tint', new THREE.BufferAttribute(new Float32Array(n * 4), 4));
    ['position', 'normal', 'uv'].forEach(a => { const A = q.attributes[a]; if (!(A.array instanceof Float32Array) || A.isInterleavedBufferAttribute) { const f = new Float32Array(A.count * A.itemSize); for (let i = 0; i < A.count; i++) for (let k = 0; k < A.itemSize; k++) f[i * A.itemSize + k] = A.getComponent(i, k); q.setAttribute(a, new THREE.BufferAttribute(f, A.itemSize)); } });
    parts.push(q);
  };
  const iq = new THREE.Matrix4();
  root.traverse(o => {
    if (!o.isMesh) return;
    let h = o, hid = false; while (h && h !== root) { if (hide.has(h.name)) hid = true; h = h.parent; }
    if (hid) return;
    let g = o.geometry;
    if (/Glow/i.test(o.material.name)) { g = g.clone(); colored(g, '#ffe14a', true); }
    if (o.isSkinnedMesh) addPart(g, null);
    else { let p = o.parent; while (p && !idx.has(p.name)) p = p.parent; addPart(g, idx.get(p.name), iq.copy(p.matrixWorld).invert().multiply(o.matrixWorld).clone()); }
  });
  (L.props || []).forEach(n => PROPS[n]().forEach(([b, g]) => addPart(g, idx.get(b), new THREE.Matrix4())));
  const geo = mergeGeometries(parts, false); geo.computeBoundingSphere();
  const tex = recolor(skin0.material.map ? skin0.material.map.image : null, L.cells);
  // 뼈대 설계도
  const tree = keep.map(i => { const b = bones[i]; return { name: b.name, p: b.position.clone(), q: b.quaternion.clone(), s: b.scale.clone(), parent: idx.has(b.parent.name) ? idx.get(b.parent.name) : -1 }; });
  return { key, L, geo, tex, tree, inv: keep.map(i => inv[i]) };
}
export const loadVariant = k => variants[k] || (variants[k] = buildVariant(k));
export async function preload(keys, onProgress) { const clips = loadAnims(); let n = 0; await Promise.all([clips, ...keys.map(k => loadVariant(k).then(() => onProgress && onProgress(++n / keys.length)))]); }

// ---------- 캐릭터 한 명 ----------
const RIM = new THREE.Color(.34, .30, .42);
function makeMaterial(v) {
  const m = new THREE.MeshStandardMaterial({ map: v.tex, roughness: .78, metalness: 0, side: THREE.DoubleSide });
  m.userData.u = { uHit: { value: 0 }, uGlow: { value: new THREE.Color(0, 0, 0) }, uFade: { value: 0 }, uRim: { value: RIM } };
  m.onBeforeCompile = s => {
    Object.assign(s.uniforms, m.userData.u);
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 tint; varying vec4 vTint;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvTint = tint;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec4 vTint; uniform float uHit, uFade; uniform vec3 uGlow, uRim;')
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vTint.rgb, clamp(vTint.a, 0., 1.));\nif (uFade > 0.) { vec2 fc = floor(gl_FragCoord.xy); if (fract(dot(fc, vec2(.754877, .569840))) < uFade) discard; }')
      .replace('#include <opaque_fragment>', 'float rimK = pow(1. - clamp(dot(normalize(vViewPosition), normal), 0., 1.), 3.); outgoingLight += rimK * (uRim * .55 + uGlow); outgoingLight += uGlow * .12; if (vTint.a > 1.5) outgoingLight = vTint.rgb * 1.7; outgoingLight = mix(outgoingLight, vec3(2.2, 1.9, 1.6), uHit);\n#include <opaque_fragment>');
  };
  m.customProgramCacheKey = () => 'char1';
  return m;
}
export class Char {
  constructor(v, clips) {
    this.v = v; this.L = v.L; this.key = v.key;
    const bones = v.tree.map(t => { const b = new THREE.Bone(); b.name = t.name; b.position.copy(t.p); b.quaternion.copy(t.q); b.scale.copy(t.s); return b; });
    const g = this.o = new THREE.Group(); g.rotation.order = 'YXZ';
    v.tree.forEach((t, i) => (t.parent < 0 ? g : bones[t.parent]).add(bones[i]));
    const m = this.mesh = new THREE.SkinnedMesh(v.geo, makeMaterial(v)); m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
    g.add(m); m.bind(new THREE.Skeleton(bones, v.inv), new THREE.Matrix4());
    this.bones = Object.fromEntries(bones.map(b => [b.name, b])); this.u = m.material.userData.u;
    this.mix = new THREE.AnimationMixer(g); this.clips = clips; this.cur = null; this.hitV = 0; this.yaw = 0; this.turn = 12;
  }
  dur(n) { return this.clips[n] ? this.clips[n].duration : 1; }
  play(n, o) {
    o = o || {}; const c = this.clips[n]; if (!c) return null;
    const a = this.mix.clipAction(c); if (this.cur === a && !o.force) { if (o.speed) a.timeScale = o.speed; return a; }
    const f = o.fade == null ? .16 : o.fade, prev = this.cur;
    a.reset(); a.setLoop(o.once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.clampWhenFinished = !!o.once; a.timeScale = o.speed || 1; a.enabled = true; a.setEffectiveWeight(1);
    if (o.at) a.time = o.at * c.duration;
    if (prev && prev !== a) { if (f > 0) { a.fadeIn(f); prev.fadeOut(f); } else prev.stop(); }
    a.play(); this.cur = a; this.name = n; return a;
  }
  idle(o) { return this.play(this.L.idle, o); }
  run(o) { return this.play(this.L.run, o); }
  speed(k) { if (this.cur) this.cur.timeScale = k; }
  hit(k) { this.hitV = k || .75; }
  glow(r, g, b) { this.u.uGlow.value.setRGB(r, g, b); }
  face(x, z) { this.yaw = Math.atan2(x - this.o.position.x, z - this.o.position.z); }
  tip(out, k) { const [b, h] = this.L.tip; return this.bones[b].localToWorld((out || V(0, 0, 0)).set(0, h * (k == null ? 1 : k), 0)); }
  bone(n, out, y) { return this.bones[n].localToWorld((out || V(0, 0, 0)).set(0, y || 0, 0)); }
  step(dt, raw) { this.mix.update(dt); if (this.hitV > 0) { this.hitV = Math.max(0, this.hitV - (raw == null ? dt : raw) * 7); this.u.uHit.value = this.hitV; } const r = this.o.rotation; r.y += Math.atan2(Math.sin(this.yaw - r.y), Math.cos(this.yaw - r.y)) * Math.min(1, dt * this.turn); }
  dispose() { this.mix.stopAllAction(); this.mix.uncacheRoot(this.o); this.mesh.material.dispose(); this.mesh.skeleton.dispose(); if (this.o.parent) this.o.parent.remove(this.o); }
}
export async function makeChar(key) { const [v, c] = await Promise.all([loadVariant(key), loadAnims()]); return new Char(v, c); }
// 불러오기가 끝난 뒤에 바로 만들기
const ready = {};
export async function charFactory(keys) { const c = await loadAnims(); await Promise.all(keys.map(async k => { ready[k] = await loadVariant(k); })); return k => new Char(ready[k], c); }
