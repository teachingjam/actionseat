// 시안용 효과 도구: 파티클, 마법진, 충격파, 균열, 파편
import * as THREE from 'three';
export const rand = (a, b) => a + Math.random() * (b - a);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ctex = (w, h, draw, srgb) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };

// 파티클 그림 4종(빛·연기·불꽃·불티)을 한 장에 모음
const atlas = ctex(512, 512, g => {
  const blob = (x, y, r, a) => { const q = g.createRadialGradient(x, y, 0, x, y, r); q.addColorStop(0, `rgba(255,255,255,${a})`); q.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = q; g.fillRect(x - r, y - r, r * 2, r * 2); };
  blob(128, 128, 120, 1); blob(128, 128, 46, 1);                                             // 0 빛
  for (let i = 0; i < 60; i++) { const a = rand(0, 6.28), d = Math.pow(Math.random(), .6) * 66; blob(384 + Math.cos(a) * d, 128 + Math.sin(a) * d, rand(20, 50), .13); } // 1 연기
  for (let i = 0; i < 46; i++) { const k = Math.random(), y = 384 + 78 - k * 160, w = (1 - k) * 46 + 4; blob(128 + rand(-w, w), y, rand(12, 34) * (1.1 - k * .7), .2); }   // 2 불꽃
  const q = g.createLinearGradient(264, 0, 504, 0); q.addColorStop(0, 'rgba(255,255,255,0)'); q.addColorStop(.75, 'rgba(255,255,255,.9)'); q.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = q; g.beginPath(); g.moveTo(264, 384); g.quadraticCurveTo(430, 362, 504, 384); g.quadraticCurveTo(430, 406, 264, 384); g.fill();     // 3 불티
});

export class Particles {
  constructor(scene, max, additive) {
    this.max = max; this.p = []; this.scale = 1;
    const g = this.g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-.5, -.5, 0, .5, -.5, 0, .5, .5, 0, -.5, .5, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const A = (n, s) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(max * s), s); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(n, a); return a.array; };
    this.aPos = A('iPos', 3); this.aVel = A('iVel', 3); this.aMisc = A('iMisc', 4); this.aCol = A('iCol', 4);
    const m = new THREE.ShaderMaterial({
      uniforms: { map: { value: atlas } }, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: `attribute vec3 iPos, iVel; attribute vec4 iMisc, iCol; varying vec2 vUv; varying vec4 vC;
        void main(){ vC = iCol; float k = iMisc.z; vec2 cell = vec2(mod(k, 2.), 1. - floor(k / 2.)); vUv = (position.xy + .5 + cell) * .5;
          vec4 mv = modelViewMatrix * vec4(iPos, 1.); vec2 o = position.xy * iMisc.x;
          if (iMisc.w > 0.) { vec3 v = (modelViewMatrix * vec4(iVel, 0.)).xyz; float l = length(v.xy) + 1e-4; vec2 d = v.xy / l; o = d * position.x * iMisc.x * (1. + iMisc.w * l) + vec2(-d.y, d.x) * position.y * iMisc.x; }
          else { float c = cos(iMisc.y), s = sin(iMisc.y); o = mat2(c, s, -s, c) * o; }
          mv.xy += o; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec2 vUv; varying vec4 vC; void main(){ float a = texture2D(map, vUv).a; gl_FragColor = vec4(vC.rgb, a * vC.a); if (gl_FragColor.a < .004) discard; }`
    });
    this.mesh = new THREE.Mesh(g, m); this.mesh.frustumCulled = false; this.mesh.renderOrder = additive ? 6 : 5; scene.add(this.mesh);
  }
  // o: {p, v, life, s0, s1, c0, c1, a, kind, g(중력), drag, stretch, spin, swirl}
  add(o) { if (this.p.length >= this.max) return; o.age = 0; o.rot = o.rot == null ? rand(0, 6.28) : o.rot; this.p.push(o); }
  burst(n, f) { n = Math.round(n * this.scale); for (let i = 0; i < n; i++) this.add(f(i / n)); }
  step(dt) {
    let n = 0; const P = this.p;
    for (let i = P.length - 1; i >= 0; i--) {
      const q = P[i]; q.age += dt; if (q.age >= q.life) { P[i] = P[P.length - 1]; P.pop(); continue; }
      const v = q.v; v.y -= (q.g || 0) * dt; if (q.drag) v.multiplyScalar(Math.exp(-q.drag * dt));
      if (q.to) { const k = q.age / q.life; q.p.lerp(q.to, clamp(dt * 3 * k / Math.max(.05, 1 - k), 0, 1)); }
      q.p.addScaledVector(v, dt); if (q.floor != null && q.p.y < q.floor) { q.p.y = q.floor; v.y *= -.35; v.x *= .6; v.z *= .6; } q.rot += (q.spin || 0) * dt;
    }
    for (const q of P) {
      const k = q.age / q.life, s = q.s0 + (q.s1 - q.s0) * (1 - (1 - k) * (1 - k)), fin = Math.min(1, q.age / (q.fin || .04)), c0 = q.c0, c1 = q.c1 || c0, i3 = n * 3, i4 = n * 4;
      this.aPos[i3] = q.p.x; this.aPos[i3 + 1] = q.p.y; this.aPos[i3 + 2] = q.p.z; this.aVel[i3] = q.v.x; this.aVel[i3 + 1] = q.v.y; this.aVel[i3 + 2] = q.v.z;
      this.aMisc[i4] = s; this.aMisc[i4 + 1] = q.rot; this.aMisc[i4 + 2] = q.kind || 0; this.aMisc[i4 + 3] = q.stretch || 0;
      this.aCol[i4] = c0[0] + (c1[0] - c0[0]) * k; this.aCol[i4 + 1] = c0[1] + (c1[1] - c0[1]) * k; this.aCol[i4 + 2] = c0[2] + (c1[2] - c0[2]) * k; this.aCol[i4 + 3] = (q.a == null ? 1 : q.a) * fin * (1 - k * k); n++;
    }
    this.g.instanceCount = n; ['iPos', 'iVel', 'iMisc', 'iCol'].forEach(a => { this.g.attributes[a].needsUpdate = true; });
  }
}

// 마법진
export const runeTex = ctex(1024, 1024, g => {
  g.translate(512, 512); g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineCap = 'round';
  const ring = (r, w) => { g.lineWidth = w; g.beginPath(); g.arc(0, 0, r, 0, 7); g.stroke(); };
  ring(490, 5); ring(468, 14); ring(388, 4); ring(372, 8); ring(170, 6); ring(150, 3);
  const poly = (n, r, sk, rot) => { g.beginPath(); for (let i = 0; i <= n; i++) { const a = rot + i * sk * Math.PI * 2 / n; g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); } g.stroke(); };
  g.lineWidth = 6; poly(7, 372, 3, 0); g.lineWidth = 3; poly(7, 372, 2, 0);
  for (let i = 0; i < 28; i++) { g.save(); g.rotate(i * Math.PI * 2 / 28); g.translate(428, 0); g.rotate(Math.PI / 2); g.lineWidth = 6; g.beginPath(); let x = 0, y = -26; g.moveTo(0, -26); g.lineTo(0, 26); for (let k = 0; k < 2 + i % 3; k++) { const yy = -22 + ((i * 7 + k * 13) % 5) * 10; g.moveTo(0, yy); g.lineTo(((i + k) % 2 ? 1 : -1) * 16, yy + ((i * 3 + k) % 3 - 1) * 14); } g.stroke(); g.restore(); }
  for (let i = 0; i < 7; i++) { const a = i * Math.PI * 2 / 7; g.save(); g.translate(Math.cos(a) * 372, Math.sin(a) * 372); g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(0, 0, 34, 0, 7); g.fill(); g.globalCompositeOperation = 'source-over'; ring(34, 5); g.beginPath(); g.arc(0, 0, 10, 0, 7); g.fill(); g.restore(); }
});
export function rune(scene, r, color) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), new THREE.MeshBasicMaterial({ map: runeTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(...color), opacity: 0, side: THREE.DoubleSide, toneMapped: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = .03; m.renderOrder = 3; m.visible = false; scene.add(m); return m;
}

// 바닥 균열 (달아오른 틈 → 식음)
export const crackTex = ctex(1024, 1024, g => {
  g.translate(512, 512);
  const q = g.createRadialGradient(0, 0, 40, 0, 0, 480); q.addColorStop(0, 'rgba(0,0,0,.95)'); q.addColorStop(.45, 'rgba(0,0,0,.65)'); q.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = q; g.fillRect(-512, -512, 1024, 1024);
  g.strokeStyle = 'rgb(255,0,0)'; g.lineCap = 'round';
  const br = (x, y, a, len, w) => { if (len < 12 || w < .8) return; let X = x, Y = y; const n = Math.ceil(len / 34); g.lineWidth = w; g.beginPath(); g.moveTo(X, Y); for (let i = 0; i < n; i++) { a += rand(-.42, .42); X += Math.cos(a) * 34; Y += Math.sin(a) * 34; g.lineTo(X, Y); } g.stroke(); if (Math.random() < .95) br(X, Y, a + rand(.3, .9), len * .55, w * .6); if (Math.random() < .8) br(X, Y, a - rand(.3, .9), len * .5, w * .55); };
  for (let i = 0; i < 13; i++) { const a = i / 13 * 6.28 + rand(-.2, .2); br(Math.cos(a) * 50, Math.sin(a) * 50, a, rand(120, 250), rand(9, 18)); }
  g.fillStyle = 'rgb(255,0,0)'; g.beginPath(); for (let i = 0; i < 18; i++) { const a = i / 18 * 6.28, r = rand(54, 92); g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); } g.fill();
});
export function crack(scene, r) {
  const u = { map: { value: crackTex }, heat: { value: 0 }, a: { value: 0 }, t: { value: 0 } };
  const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), new THREE.ShaderMaterial({ uniforms: u, transparent: true, depthWrite: false, vertexShader: 'varying vec2 v; void main(){ v = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: 'uniform sampler2D map; uniform float heat,a,t; varying vec2 v; void main(){ vec4 c = texture2D(map, v); float d = length(v-.5)*2.; float h = c.r * heat * (.75+.25*sin(t*9.+d*20.)); vec3 hot = mix(vec3(1.2,.18,.02), vec3(2.2,.95,.2), clamp(h*1.6-d,0.,1.)); gl_FragColor = vec4(hot*h*2.2, max(c.a*a, c.r*h)); }' }));
  m.rotation.x = -Math.PI / 2; m.position.y = .02; m.renderOrder = 2; m.visible = false; scene.add(m); m.u = u; return m;
}

// 충격파: 바닥을 훑는 고리 + 둥근 막
export function shock(scene) {
  const u = { k: { value: 0 }, col: { value: new THREE.Color(1.5, .62, .18) } };
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, vertexShader: 'varying vec2 v; void main(){ v = uv*2.-1.; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: 'uniform float k; uniform vec3 col; varying vec2 v; void main(){ float d = length(v); float e = smoothstep(.45,.93,d) * smoothstep(1.,.95,d); float n = .75+.25*sin(atan(v.y,v.x)*34.); gl_FragColor = vec4(col, e*e*n*(1.-k)*(1.-k)*1.3); }' }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = .06; ring.renderOrder = 4;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 20, 0, 6.2832, 0, Math.PI / 2), new THREE.ShaderMaterial({ uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, vertexShader: 'varying vec3 n, e; void main(){ vec4 m = modelViewMatrix*vec4(position,1.); n = normalize(normalMatrix*normal); e = normalize(-m.xyz); gl_Position = projectionMatrix*m; }',
    fragmentShader: 'uniform float k; uniform vec3 col; varying vec3 n, e; void main(){ float f = pow(clamp(1.-abs(dot(normalize(n),normalize(e))),0.,1.), 2.6); gl_FragColor = vec4(col*.8, f*pow(clamp(1.-k,0.,1.),2.6)*.25); }' }));
  const G = new THREE.Group(); G.add(ring, dome); G.visible = false; scene.add(G);
  return { G, t: 9, dur: 1, fire(p, R, dur) { G.position.copy(p); this.R = R; this.dur = dur; this.t = 0; G.visible = true; }, step(dt) { if (!G.visible) return; this.t += dt; const k = this.t / this.dur; if (k >= 1) { G.visible = false; return; } const s = this.R * (1 - Math.pow(1 - k, 3)); G.scale.set(s, s * .62, s); u.k.value = k; } };
}

// 튀어 오르는 돌
export class Debris {
  constructor(scene, n) {
    this.m = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(.16, 0), new THREE.MeshStandardMaterial({ color: 0x5b5666, roughness: .95, flatShading: true }), n);
    this.m.castShadow = true; this.m.frustumCulled = false; scene.add(this.m); this.n = n; this.b = []; this.o = new THREE.Object3D(); this.m.count = 0;
  }
  fire(p, num) { this.b = []; for (let i = 0; i < Math.min(num, this.n); i++) { const a = rand(0, 6.28), s = rand(2, 8.5); this.b.push({ p: p.clone().add(new THREE.Vector3(Math.cos(a) * .6, .2, Math.sin(a) * .6)), v: new THREE.Vector3(Math.cos(a) * s, rand(3.5, 11), Math.sin(a) * s), r: new THREE.Vector3(rand(0, 6), rand(0, 6), 0), w: rand(-9, 9), s: rand(.25, 1) * rand(.6, 1.35), age: 0 }); } }
  step(dt) {
    this.b = this.b.filter(b => b.age < 4.5);
    this.b.forEach((b, i) => { b.age += dt; b.v.y -= 19 * dt; b.p.addScaledVector(b.v, dt); if (b.p.y < .1) { b.p.y = .1; b.v.y *= -.34; b.v.x *= .6; b.v.z *= .6; b.w *= .6; if (Math.abs(b.v.y) < .6) b.v.y = 0; } b.r.x += b.w * dt; b.r.z += b.w * .7 * dt; this.o.position.copy(b.p); this.o.rotation.set(b.r.x, b.r.y, b.r.z); this.o.scale.setScalar(b.s * clamp((4.5 - b.age) * 2, 0, 1)); this.o.updateMatrix(); this.m.setMatrixAt(i, this.o.matrix); });
    this.m.count = this.b.length; this.m.instanceMatrix.needsUpdate = true;
  }
}

// 운석: 달아오른 틈이 흐르는 바위
export function meteorRock() {
  const g = new THREE.IcosahedronGeometry(1, 4), pos = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).normalize(); const n = Math.sin(v.x * 4.1 + 1) * Math.sin(v.y * 3.7) * Math.sin(v.z * 4.6 + 2) * .22 + Math.sin(v.x * 9 + v.y * 7) * Math.sin(v.z * 8) * .09; v.multiplyScalar(1 + n); pos.setXYZ(i, v.x, v.y, v.z); }
  g.computeVertexNormals();
  const u = { t: { value: 0 } };
  const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: u, vertexShader: 'varying vec3 p, n; void main(){ p = position; n = normalize(normalMatrix*normal); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `uniform float t; varying vec3 p, n; float h(vec3 x){ return fract(sin(dot(x,vec3(12.9,78.2,37.7)))*43758.5); } float ns(vec3 x){ vec3 i=floor(x),f=fract(x); f=f*f*(3.-2.*f); return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+1.),f.x),f.y),f.z); }
      void main(){ float a = ns(p*3.+t*.4)*.6+ns(p*7.-t*.6)*.4; float c = 1.-smoothstep(.0,.075,abs(a-.5)); float l = .35+.65*max(0.,n.y*-.6+n.z*.6); vec3 rock = vec3(.16,.10,.09)*l; vec3 lava = mix(vec3(.5,.05,.0), vec3(2.4,.95,.22), c); float rim = pow(1.-max(0.,n.z),2.4); gl_FragColor = vec4(rock + lava*c*c + vec3(1.1,.30,.04)*rim, 1.); }` }));
  m.u = u; return m;
}

// 검이 지나간 자리의 빛 궤적
export class Trail {
  constructor(scene, color, len) {
    this.len = len; this.pts = [];
    const g = this.g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(len * 6), 3).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('a', new THREE.BufferAttribute(new Float32Array(len * 4), 2).setUsage(THREE.DynamicDrawUsage));
    const ix = []; for (let i = 0; i < len - 1; i++) { const k = i * 2; ix.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); } g.setIndex(ix);
    this.m = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: { c: { value: new THREE.Color(...color) } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, vertexShader: 'attribute vec2 a; varying vec2 v; void main(){ v=a; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }', fragmentShader: 'uniform vec3 c; varying vec2 v; void main(){ float e = v.x*v.x*(.25+.75*v.y*v.y); gl_FragColor = vec4(mix(c, vec3(3.), v.x*v.y*.7), e*.9); }' }));
    this.m.frustumCulled = false; this.m.renderOrder = 6; scene.add(this.m);
  }
  push(a, b) { this.pts.unshift([a.clone(), b.clone()]); if (this.pts.length > this.len) this.pts.pop(); }
  fade() { this.pts.pop(); }
  step() { const P = this.g.attributes.position.array, A = this.g.attributes.a.array, n = this.pts.length; this.pts.forEach(([a, b], i) => { P.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6); const k = 1 - i / Math.max(1, n - 1); A.set([k, 0, k, 1], i * 4); }); this.g.setDrawRange(0, Math.max(0, n - 1) * 6); this.g.attributes.position.needsUpdate = this.g.attributes.a.needsUpdate = true; }
}
