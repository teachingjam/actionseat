// 소리 합성 도구 (외부 음원 없이 만듦)
const fs = require('fs'), path = require('path');
const SR = 44100, out = process.argv[2] || '.';
let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const N = s => Math.floor(s * SR), TAU = Math.PI * 2;
const buf = s => new Float32Array(N(s));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const midi = m => 440 * Math.pow(2, (m - 69) / 12);
const noise = s => { const b = buf(s); for (let i = 0; i < b.length; i++) b[i] = rnd() * 2 - 1; return b; };
// 상태변수 필터: f·q는 숫자 또는 시간 함수
function svf(x, type, f, q) {
  const y = new Float32Array(x.length); let ic1 = 0, ic2 = 0;
  for (let i = 0; i < x.length; i++) {
    const t = i / SR, fc = clamp(typeof f === 'function' ? f(t) : f, 20, SR * .45), k = 1 / (typeof q === 'function' ? q(t) : (q || .7));
    const g = Math.tan(Math.PI * fc / SR), a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2, v3 = x[i] - ic2;
    const v1 = a1 * ic1 + a2 * v3, v2 = ic2 + a2 * ic1 + a3 * v3; ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2;
    y[i] = type === 'lp' ? v2 : type === 'bp' ? v1 : x[i] - k * v1 - v2;
  }
  return y;
}
const env = (x, fn) => { for (let i = 0; i < x.length; i++) x[i] *= fn(i / SR); return x; };
const add = (dst, src, at, g) => { const o = N(at || 0), n = src.length, fd = Math.min(N(.06), n >> 2); g = g == null ? 1 : g; for (let i = 0; i < n && i + o < dst.length; i++) if (i + o >= 0) dst[i + o] += src[i] * g * Math.min(1, (n - i) / fd); return dst; }; // 끝을 부드럽게 줄여 틱 소리 방지
const sat = (x, d) => { for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * d) / Math.tanh(d); return x; };
const ad = (a, d, p) => t => t < a ? t / a : Math.exp(-(t - a) / d) * (p || 1);
// 여러 진동이 각자 다르게 잦아드는 울림 (금속·나무·종)
function modal(dur, f0, parts, at) {
  const b = buf(dur);
  parts.forEach(([r, g, d]) => { const ph = rnd() * TAU, w = TAU * f0 * r / SR; if (f0 * r > SR * .45) return; for (let i = 0; i < b.length; i++) b[i] += Math.sin(ph + w * i) * g * Math.exp(-i / SR / d); });
  return env(b, t => Math.min(1, t / (at || .001)));
}
function sweep(dur, f, e) { const b = buf(dur); let ph = 0; for (let i = 0; i < b.length; i++) { const t = i / SR; ph += TAU * f(t) / SR; b[i] = Math.sin(ph) * e(t); } return b; }
// 스테레오 잔향 (지연선 8개를 섞는 방식)
function reverb(L, R, time, wet, damp, pre) {
  const D = [1557, 1617, 1491, 1422, 1277, 1356, 1188, 1116].map((d, i) => Math.floor(d * 1.35) + i * 13), n = L.length;
  const lines = D.map(d => new Float32Array(d)), idx = D.map(() => 0), lpz = D.map(() => 0), gains = D.map(d => Math.pow(10, -3 * d / SR / time));
  const p = N(pre || .015), oL = new Float32Array(n), oR = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const inp = i >= p ? (L[i - p] + R[i - p]) * .35 : 0; let sum = 0; const o = [];
    for (let k = 0; k < 8; k++) { const v = lines[k][idx[k]]; lpz[k] = v * (1 - damp) + lpz[k] * damp; o[k] = lpz[k] * gains[k]; sum += o[k]; }
    for (let k = 0; k < 8; k++) { lines[k][idx[k]] = inp + o[k] - sum * .25; idx[k] = (idx[k] + 1) % D[k]; }
    oL[i] = L[i] + wet * (o[0] - o[2] + o[4] - o[6]); oR[i] = R[i] + wet * (o[1] - o[3] + o[5] - o[7]);
  }
  return [oL, oR];
}
function save(name, L, R, peak, loop) {
  let m = 0; for (let i = 0; i < L.length; i++) m = Math.max(m, Math.abs(L[i]), Math.abs(R[i]));
  const g = (peak || .9) / m, n = L.length, f = N(.03), b = Buffer.alloc(44 + n * 4);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 4, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22); b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) { const fd = loop ? 1 : Math.min(1, (n - i) / f); b.writeInt16LE(Math.round(clamp(L[i] * g * fd, -1, 1) * 32767), 44 + i * 4); b.writeInt16LE(Math.round(clamp(R[i] * g * fd, -1, 1) * 32767), 46 + i * 4); }
  fs.writeFileSync(path.join(out, name + '.wav'), b); console.log(name, (n / SR).toFixed(2) + 's');
}


// 기타줄·하프 같은 뜯는 소리
function pluck(f, dur, bright, damp) { const n = N(dur), d = Math.max(2, Math.round(SR / f)), b = new Float32Array(d), y = new Float32Array(n); let lp = 0; for (let i = 0; i < d; i++) { lp += (rnd() * 2 - 1 - lp) * (bright || .6); b[i] = lp; } let k = 0, pv = 0; const g = Math.pow(.001, 1 / (f * (damp || 1.6))); for (let i = 0; i < n; i++) { const v = b[k]; y[i] = v; b[k] = (v * .5 + pv * .5) * g; pv = v; k = (k + 1) % d; } return y; }
// 금관·현악: 살짝 어긋난 톱니파 여러 개 + 열리는 필터
function saws(f, n, det, vib) { const x = new Float32Array(n), ph = det.map(() => rnd()); for (let i = 0; i < n; i++) { const t = i / SR, v = 1 + (vib || 0) * Math.sin(TAU * 5.2 * t) * clamp((t - .2) * 4, 0, 1); let s = 0; det.forEach((d, k) => { ph[k] = (ph[k] + f * (1 + d) * v / SR) % 1; s += ph[k] * 2 - 1; }); x[i] = s / det.length; } return x; }
const pan = (L, R, x, at, g, p) => { add(L, x, at, g * Math.cos(p * Math.PI / 2) * 1.3); add(R, x, at, g * Math.sin(p * Math.PI / 2) * 1.3); };
module.exports = { SR, N, TAU, rnd, buf, clamp, lerp, midi, noise, svf, env, add, sat, ad, modal, sweep, reverb, save, pluck, saws, pan, out };
