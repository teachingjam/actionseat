// KayKit 원본 GLB에서 동작을 떼어 내 작게 만들고, 쓰는 동작만 anims.bin 하나로 모읍니다 (모든 캐릭터가 같은 뼈대를 씀).
// 사용: node tools/build-models.js <원본 GLB 폴더> public/assets/models
const fs = require('fs'), path = require('path');
const [src, out] = process.argv.slice(2);
const read = f => { const b = fs.readFileSync(path.join(src, f)), n = b.readUInt32LE(12); return { j: JSON.parse(b.slice(20, 20 + n).toString('utf8')), bin: b.slice(28 + n) }; };
const pad = (b, c) => Buffer.concat([b, Buffer.alloc((4 - b.length % 4) % 4, c)]);
const CT = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }, NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
function acc({ j, bin }, i) { const a = j.accessors[i], v = j.bufferViews[a.bufferView], T = CT[a.componentType], n = a.count * NC[a.type], o = (v.byteOffset || 0) + (a.byteOffset || 0); return new T(bin.buffer.slice(bin.byteOffset + o, bin.byteOffset + o + n * T.BYTES_PER_ELEMENT)); }

const FILES = { knight: 'Knight.glb', mage: 'Mage.glb', rogue: 'Rogue.glb', hooded: 'Rogue_Hooded.glb', barbarian: 'Barbarian.glb', skminion: 'Skeleton_Minion.glb', skwarrior: 'Skeleton_Warrior.glb' };
fs.mkdirSync(out, { recursive: true });
const report = process.argv.includes('--cells');
for (const [k, f] of Object.entries(FILES)) {
  const g = read(f), { j, bin } = g;
  delete j.animations;
  // 쓰이는 조각만 다시 포장
  const used = new Set(), A = new Set();
  j.meshes.forEach(m => m.primitives.forEach(p => { Object.entries(p.attributes).forEach(([n, i]) => { if (/TEXCOORD_[1-9]|COLOR/.test(n)) delete p.attributes[n]; else A.add(i); }); A.add(p.indices); }));
  j.skins.forEach(s => A.add(s.inverseBindMatrices));
  A.forEach(i => used.add(j.accessors[i].bufferView)); (j.images || []).forEach(i => used.add(i.bufferView));
  const vm = new Map(), am = new Map(), parts = []; let off = 0;
  j.bufferViews = j.bufferViews.filter((v, i) => { if (!used.has(i)) return false; vm.set(i, vm.size); const d = pad(bin.slice(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength), 0); v.byteOffset = off; off += d.length; parts.push(d); return true; });
  j.accessors = j.accessors.filter((a, i) => { if (!A.has(i)) return false; am.set(i, am.size); a.bufferView = vm.get(a.bufferView); return true; });
  j.meshes.forEach(m => m.primitives.forEach(p => { for (const n in p.attributes) p.attributes[n] = am.get(p.attributes[n]); p.indices = am.get(p.indices); }));
  j.skins.forEach(s => { s.inverseBindMatrices = am.get(s.inverseBindMatrices); }); (j.images || []).forEach(i => { i.bufferView = vm.get(i.bufferView); });
  const body = Buffer.concat(parts); j.buffers = [{ byteLength: body.length }];
  const js = pad(Buffer.from(JSON.stringify(j)), 0x20), h = Buffer.alloc(12), h1 = Buffer.alloc(8), h2 = Buffer.alloc(8);
  h.writeUInt32LE(0x46546c67, 0); h.writeUInt32LE(2, 4); h.writeUInt32LE(28 + js.length + body.length, 8); h1.writeUInt32LE(js.length, 0); h1.writeUInt32LE(0x4e4f534a, 4); h2.writeUInt32LE(body.length, 0); h2.writeUInt32LE(0x004e4942, 4);
  fs.writeFileSync(path.join(out, k + '.glb'), Buffer.concat([h, h1, js, h2, body]));
  console.log(k, (fs.statSync(path.join(out, k + '.glb')).size / 1024).toFixed(0) + 'KB');
  if (report) { const g0 = read(f); g0.j.nodes.forEach(n => { if (n.mesh == null) return; const c = {}; g0.j.meshes[n.mesh].primitives.forEach(p => { const u = acc(g0, p.attributes.TEXCOORD_0); for (let i = 0; i < u.length; i += 2) { const key = Math.floor(u[i] * 8) + ',' + Math.floor(u[i + 1] * 4); c[key] = (c[key] || 0) + 1; } }); console.log('  ', n.name, Object.entries(c).sort((a, b) => b[1] - a[1]).map(([a, b]) => a + ':' + b).join(' ')); }); }
}

// ---------- 동작 ----------
const BONES = 'root hips spine chest upperarm.l lowerarm.l wrist.l hand.l handslot.l upperarm.r lowerarm.r wrist.r hand.r handslot.r head upperleg.l lowerleg.l foot.l toes.l upperleg.r lowerleg.r foot.r toes.r'.split(' ');
const CLIPS = [['Knight.glb', 'Idle 2H_Melee_Idle Unarmed_Idle Running_A Running_B Walking_A Jump_Full_Short Jump_Full_Long Cheer Death_A Death_B Lie_StandUp Hit_A Hit_B Block 1H_Melee_Attack_Chop 1H_Melee_Attack_Slice_Diagonal 1H_Melee_Attack_Slice_Horizontal 2H_Melee_Attack_Spin 2H_Melee_Attack_Chop Dualwield_Melee_Attack_Chop Dualwield_Melee_Attack_Slice 1H_Ranged_Shoot 2H_Ranged_Shoot 2H_Ranged_Aiming Spellcast_Shoot Spellcast_Raise Spellcast_Long Spellcasting Throw Use_Item Dodge_Forward Sit_Floor_Idle'],
  ['Skeleton_Minion.glb', 'Walking_D_Skeletons Spawn_Ground_Skeletons Death_C_Skeletons Taunt']];
const FPS = 24, head = { fps: FPS, bones: BONES, clips: [] }, chunks = []; let offB = 0;
const push = t => { const b = Buffer.from(t.buffer, t.byteOffset, t.byteLength), p = pad(b, 0), o = offB; chunks.push(p); offB += p.length; return o; };
for (const [f, names] of CLIPS) {
  const g = read(f);
  for (const nm of names.split(' ')) {
    const an = g.j.animations.find(a => a.name === nm); if (!an) { console.log('없음', nm); continue; }
    const tr = {}; let dur = 0;
    an.channels.forEach(c => { const b = g.j.nodes[c.target.node].name; if (!BONES.includes(b) || c.target.path === 'scale') return; const s = an.samplers[c.sampler], T = acc(g, s.input); dur = Math.max(dur, T[T.length - 1]); tr[b + '|' + c.target.path] = { T, V: acc(g, s.output), mode: s.interpolation || 'LINEAR' }; });
    const n = Math.max(2, Math.round(dur * FPS) + 1), Q = new Int16Array(BONES.length * n * 4), P = {};
    const at = (k, t, dim) => { const { T, V, mode } = k, st = mode === 'CUBICSPLINE' ? 3 : 1; let i = 0; while (i < T.length - 2 && T[i + 1] < t) i++; const i1 = Math.min(i + 1, T.length - 1), w = T[i1] > T[i] ? Math.max(0, Math.min(1, (t - T[i]) / (T[i1] - T[i]))) : 0, r = []; const o = x => (x * st + (st === 3 ? 1 : 0)) * dim; let sg = 1; if (dim === 4) { let d = 0; for (let c = 0; c < 4; c++) d += V[o(i) + c] * V[o(i1) + c]; if (d < 0) sg = -1; } for (let c = 0; c < dim; c++) r.push(V[o(i) + c] * (1 - w) + sg * V[o(i1) + c] * w); if (dim === 4) { const l = Math.hypot(...r) || 1; for (let c = 0; c < 4; c++) r[c] /= l; } return r; };
    BONES.forEach((b, bi) => {
      const nd = g.j.nodes.find(x => x.name === b), rot = tr[b + '|rotation'], pos = tr[b + '|translation'], rq = nd.rotation || [0, 0, 0, 1]; let pv = null;
      for (let i = 0; i < n; i++) { const t = i / (n - 1) * dur; let q = rot ? at(rot, t, 4) : rq; if (pv && q[0] * pv[0] + q[1] * pv[1] + q[2] * pv[2] + q[3] * pv[3] < 0) q = q.map(x => -x); pv = q; for (let c = 0; c < 4; c++) Q[(bi * n + i) * 4 + c] = Math.round(q[c] * 32767); }
      if (pos) { const a = new Float32Array(n * 3); let vary = false; const rest = nd.translation || [0, 0, 0]; for (let i = 0; i < n; i++) { const p = at(pos, i / (n - 1) * dur, 3); p.forEach((x, c) => { a[i * 3 + c] = x; if (Math.abs(x - rest[c]) > .002) vary = true; }); } if (vary) P[b] = a; }
    });
    const c = { name: nm, dur, n, q: push(Q), p: {} }; for (const b in P) c.p[b] = push(P[b]); head.clips.push(c);
  }
}
const hj = pad(Buffer.from(JSON.stringify(head)), 0x20), hl = Buffer.alloc(4); hl.writeUInt32LE(hj.length, 0);
fs.writeFileSync(path.join(out, 'anims.bin'), Buffer.concat([hl, hj, ...chunks]));
console.log('anims', head.clips.length, (fs.statSync(path.join(out, 'anims.bin')).size / 1024).toFixed(0) + 'KB');
