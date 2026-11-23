// 배경음악 합성기 (발표 화면용, 이어서 반복됨). 사용: node tools/make-music.js <출력 폴더> [이름…]
const { SR, N, TAU, rnd, buf, clamp, lerp, midi, noise, svf, env, add, sat, ad, modal, sweep, reverb, save, pluck, saws, pan, out } = require('./sfx-lib');
const fs = require('fs');
const NOTE = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
// 'Dm' → 구성음
function chord(s) { const m = s.match(/^([A-G][#b]?)(m|sus|7|)?(?:\/([A-G][#b]?))?$/), r = NOTE[m[1]], iv = m[2] === 'm' ? [0, 3, 7] : m[2] === 'sus' ? [0, 5, 7] : m[2] === '7' ? [0, 4, 7, 10] : [0, 4, 7]; return { root: m[3] ? NOTE[m[3]] : r, pc: iv.map(i => (r + i) % 12) }; }
const near = (pc, lo) => { let n = lo + ((pc - lo) % 12 + 12) % 12; return n; };
class Song {
  constructor(bpm, bars, beats) { this.b = 60 / bpm; this.bars = bars; this.beats = beats || 4; this.len = this.b * this.beats * bars; this.L = buf(this.len * 2 + 4); this.R = buf(this.len * 2 + 4); this.cache = {}; }
  // 두 바퀴 연주해서 두 번째 바퀴를 씀 (잔향까지 자연스럽게 이어짐)
  put(x, beat, g, p) { for (let k = 0; k < 2; k++) pan(this.L, this.R, x, beat * this.b + k * this.len, g, p); }
  get(key, f) { return this.cache[key] || (this.cache[key] = f()); }
  strings(m, beat, d, g, p) { const D = d * this.b; this.put(this.get(`s${m}_${d}`, () => { const n = N(D + .7), y = svf(svf(saws(midi(m), n, [-.0065, -.0025, .0012, .0035, .007], .0025), 'lp', 2400, .6), 'hp', 160, .7); return env(y, t => Math.min(1, t / Math.min(.25, D * .4)) * (t < D ? 1 : Math.exp(-(t - D) / .22))); }), beat, g, p); }
  spic(m, beat, g, p) { this.put(this.get(`p${m}`, () => { const n = N(.34), y = svf(svf(saws(midi(m), n, [-.005, -.001, .002, .006]), 'lp', t => 700 + 3400 * Math.exp(-t / .05), .8), 'hp', 120, .7); return env(y, t => Math.min(1, t / .008) * Math.exp(-t / .085)); }), beat, g, p); }
  brass(m, beat, d, g, p) { const D = d * this.b * .92; this.put(this.get(`b${m}_${d}`, () => { const f = midi(m), n = N(D + .35), y = svf(svf(saws(f, n, [-.0035, -.0012, .0014, .0038], .0028), 'lp', t => f * 1.2 + (f * 4.6 + 850) * Math.min(1, t / .06) * (.62 + .38 * Math.exp(-t / .3)), .75), 'lp', 4800, .7); return env(y, t => Math.min(1, t / .035) * (t < D ? .85 + .15 * Math.exp(-t / .1) : Math.exp(-(t - D) / .08))); }), beat, g, p); }
  harp(m, beat, g, p) { this.put(this.get(`h${m}`, () => pluck(midi(m), 1.5, .6, 1.3)), beat, g, p); }
  bass(m, beat, d, g) { const D = d * this.b; this.put(this.get(`q${m}_${d}`, () => { const n = N(D + .2), x = buf(D + .2), f = midi(m); let ph = 0; for (let i = 0; i < n; i++) { ph += f / SR; x[i] = Math.sin(TAU * ph) + .35 * Math.sin(TAU * ph * 2) + .12 * Math.sin(TAU * ph * 3); } const pk = pluck(f, D + .2, .35, 1.1); for (let i = 0; i < n; i++) x[i] = x[i] * .5 + (pk[i] || 0) * .7; return env(x, t => Math.min(1, t / .006) * (t < D ? Math.exp(-t / .6) : Math.exp(-D / .6) * Math.exp(-(t - D) / .05))); }), beat, g, .5); }
  flute(m, beat, d, g, p) { const D = d * this.b * .95; this.put(this.get(`f${m}_${d}`, () => { const n = N(D + .2), x = new Float32Array(n), f = midi(m), nz = svf(noise(D + .25), 'bp', f * 2, 2.5); let ph = 0; for (let i = 0; i < n; i++) { const t = i / SR; ph += f * (1 + .006 * Math.sin(TAU * 5.3 * t) * clamp((t - .15) * 5, 0, 1)) / SR; x[i] = Math.sin(TAU * ph) + .28 * Math.sin(TAU * 2 * ph) + .1 * Math.sin(TAU * 3 * ph) + nz[i] * .22; } return env(x, t => Math.min(1, t / .05) * (t < D ? 1 : Math.exp(-(t - D) / .06))); }), beat, g, p); }
  glock(m, beat, g, p) { this.put(this.get(`g${m}`, () => modal(1.1, midi(m), [[1, 1, .36], [2, .16, .2], [4.02, .28, .09]], .002)), beat, g, p); }
  taiko(beat, g, f) { this.put(this.get(`t${f || 62}`, () => { const x = modal(.8, f || 62, [[1, 1, .24], [1.59, .5, .14], [2.14, .3, .09], [2.65, .2, .06]], .001); add(x, sweep(.25, t => 58 + 120 * Math.exp(-t / .02), ad(.001, .06)), 0, .8); add(x, env(svf(noise(.07), 'lp', 1700, .8), ad(.0006, .013)), 0, .7); return x; }), beat, g, .5); }
  snare(beat, g) { this.put(this.get('sn', () => { const x = buf(.22); add(x, env(svf(noise(.2), 'bp', 2300, .5), ad(.0008, .045)), 0, 1); add(x, modal(.15, 190, [[1, 1, .04], [1.6, .5, .03]], .001), 0, .6); return x; }), beat, g, .55); }
  hat(beat, g) { this.put(this.get('hh', () => env(svf(noise(.09), 'hp', 6800, .7), ad(.0005, .018))), beat, g, .4); }
  shaker(beat, g) { this.put(this.get('sh', () => env(svf(noise(.1), 'bp', 5200, .9), t => Math.sin(Math.PI * clamp(t / .09, 0, 1)))), beat, g, .6); }
  cymb(beat, g) { this.put(this.get('cy', () => { const x = svf(noise(2), 'hp', 3800, .6); return env(x, t => Math.min(1, t / .004) * (.5 * Math.exp(-t / .14) + .5 * Math.exp(-t / .6))); }), beat, g, .5); }
  melody(str, inst, oct, g, p) { let t = 0; str.trim().split(/\s+/).forEach(tok => { const m = tok.match(/^(r|[A-G][#b]?)(\d)?:([\d.]+)$/), d = +m[3]; if (m[1] !== 'r') this[inst](NOTE[m[1]] + 12 * (+m[2] + 1 + (oct || 0)), t, d, g, p); t += d; }); }
  done(rv, wet, pk, drive) { if (drive) { sat(this.L, drive); sat(this.R, drive); } const [a, b] = reverb(this.L, this.R, rv, wet, .35, .022), s = N(this.len), n = N(this.len); return [a.slice(s, s + n), b.slice(s, s + n), pk || .7, true]; }
}
const each = (arr, f) => arr.forEach((c, i) => f(chord(c), i));

const MUSIC = {
  // 대기실·모험: 밝은 여행 음악
  bgm_lobby() {
    const s = new Song(104, 16), cs = 'D A/C# Bm F#m G D/F# Em A D A/C# Bm F#m G A D D'.split(' ');
    each(cs, (c, i) => { const b = i * 4, v = c.pc.map(p => near(p, 57)); v.forEach((m, k) => s.strings(m, b, 4, .16, .25 + k * .25)); s.bass(near(c.root, 38), b, 1.5, .5); s.bass(near(c.pc[2], 38), b + 2, 1, .34); s.bass(near(c.root, 38), b + 3, 1, .34);
      const arp = [v[0], v[1], v[2], v[0] + 12, v[2], v[1], v[2], v[0] + 12]; arp.forEach((m, k) => s.harp(m + 12, b + k * .5, .26, .3 + (k % 4) * .12)); for (let k = 0; k < 8; k++) s.shaker(b + k * .5, k % 2 ? .05 : .09); s.taiko(b, .16, 74); s.taiko(b + 2.5, .09, 88); if (i % 8 === 0) s.cymb(b, .05); });
    s.melody('F#5:1.5 E5:.5 D5:1 A5:1 E5:2 C#5:1 E5:1 D5:1.5 E5:.5 F#5:1 B5:1 A5:2 r:1 A5:1 B5:1.5 A5:.5 G5:1 D5:1 F#5:2 A5:1 F#5:1 G5:1 F#5:1 E5:1 B4:1 E5:3 r:1 F#5:1.5 E5:.5 D5:1 A5:1 C#6:2 B5:1 A5:1 B5:1.5 C#6:.5 D6:1 B5:1 A5:2 F#5:1 A5:1 B5:1 A5:1 G5:1 B5:1 A5:1 G5:1 E5:1 C#5:1 D5:3 r:1 r:4', 'flute', 0, .17, .55);
    s.melody('r:32 F#6:1.5 E6:.5 D6:1 A6:1 C#7:2 B6:1 A6:1 B6:1.5 C#7:.5 D7:1 B6:1 A6:2 F#6:1 A6:1 B6:1 A6:1 G6:1 B6:1 A6:1 G6:1 E6:1 C#6:1 D6:3 r:1 r:4'.replace(/(\d):/g, '$1:'), 'glockN', 0, .07, .7);
    return s.done(1.8, .22, .62);
  },
  // 달리기: 빠르고 신나는 행진
  bgm_race() {
    const s = new Song(150, 16), cs = 'C G/B Am F C G F G Am Em F C Dm F G G'.split(' ');
    each(cs, (c, i) => { const b = i * 4, v = c.pc.map(p => near(p, 60)); for (let k = 0; k < 16; k++) { const m = [v[0], v[1], v[2], v[1]][k % 4]; s.spic(m, b + k * .25, k % 4 ? .13 : .22, .3); s.spic(m - 12, b + k * .25, k % 4 ? .08 : .16, .65); } v.forEach((m, k) => s.strings(m + 12, b, 4, .075, .2 + k * .3)); for (let k = 0; k < 8; k++) s.bass(near(c.root, 36), b + k * .5, .5, k % 2 ? .28 : .42);
      [0, 1, 2, 3].forEach(k => s.taiko(b + k, k % 2 ? .2 : .42, 60)); s.snare(b + 1, .22); s.snare(b + 3, .22); s.snare(b + 3.75, .1); for (let k = 0; k < 8; k++) s.hat(b + k * .5, k % 2 ? .1 : .05); if (i % 4 === 0) s.cymb(b, .1); if (i % 4 === 3) [2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75].forEach((q, k) => s.snare(b + q, .05 + k * .02)); });
    const mel = 'G4:.5 G4:.5 C5:1 E5:1 D5:.5 C5:.5 D5:1.5 B4:.5 G4:1 r:1 A4:.5 B4:.5 C5:1 E5:1 A5:1 G5:1.5 F5:.5 E5:1 D5:1 G4:.5 G4:.5 C5:1 E5:1 G5:1 F5:1.5 E5:.5 D5:1 B4:1 A4:.5 C5:.5 F5:1 E5:.5 D5:.5 C5:1 D5:3 r:1 E5:1 A5:1 C6:1 B5:.5 A5:.5 G5:1.5 E5:.5 B4:1 E5:1 F5:1 A5:1 C6:1 A5:1 G5:2 E5:1 C5:1 D5:1 F5:1 A5:1 G5:.5 F5:.5 A5:1.5 G5:.5 F5:1 A5:1 G5:1.5 A5:.5 B5:1 D6:1 G5:2 r:2';
    s.melody(mel, 'brass', 0, .17, .42); s.melody(mel, 'brass', -1, .1, .6); return s.done(1.2, .16, .7, 1.15);
  },
  // 아레나: 비장한 전투
  bgm_battle() {
    const s = new Song(138, 16), cs = 'Dm Dm Bb C Dm Dm Gm A Dm F C Gm Bb F Gm A'.split(' ');
    each(cs, (c, i) => { const b = i * 4, lo = near(c.root, 38), v = c.pc.map(p => near(p, 57)); [0, 1, 1.5, 2, 2.5, 3, 3.5].forEach((q, k) => { s.spic(lo + 12, b + q, q % 1 ? .2 : .32, .35); s.spic(lo + (k === 4 ? 7 : 0), b + q, .3, .55); }); for (let k = 0; k < 16; k++) if (k % 4) s.spic(v[k % 3] + 12, b + k * .25, .09, .25 + (k % 3) * .2); v.forEach((m, k) => s.strings(m, b, 4, .11, .2 + k * .3));
      s.bass(near(c.root, 33), b, 2, .5); s.bass(near(c.root, 33), b + 2, 2, .42); s.taiko(b, .6, 54); s.taiko(b + 1.5, .34, 66); s.taiko(b + 2, .42, 58); s.taiko(b + 3, .3, 66); s.taiko(b + 3.5, .3, 72); s.snare(b + 1, .1); s.snare(b + 3, .12); if (i % 4 === 0) s.cymb(b, .13); if (i % 4 === 3) for (let k = 0; k < 8; k++) s.taiko(b + 2 + k * .25, .14 + k * .03, 80); });
    const mel = 'r:8 D5:1.5 C5:.5 Bb4:2 C5:1 D5:1 E5:2 F5:1.5 E5:.5 D5:2 A4:4 Bb4:1 D5:1 G5:2 A5:1.5 G5:.5 E5:2 D5:1 F5:1 A5:2 C6:1.5 Bb5:.5 A5:2 G5:1.5 E5:.5 C5:2 D5:1 G5:1 Bb5:2 D6:1.5 C6:.5 Bb5:2 A5:2 F5:2 G5:1 A5:1 Bb5:2 A5:4';
    s.melody(mel, 'brass', -1, .22, .4); s.melody(mel, 'strings', 0, .1, .65); return s.done(1.7, .2, .74, 1.2);
  },
  // 최후의 결투
  bgm_duel() {
    const s = new Song(160, 16), cs = 'Em Em C D Em G Am B Em C G D Am C B B'.split(' ');
    each(cs, (c, i) => { const b = i * 4, lo = near(c.root, 40), v = c.pc.map(p => near(p, 59)); for (let k = 0; k < 16; k++) { s.spic(k % 2 ? lo + 12 : lo, b + k * .25, k % 4 ? .17 : .3, .5); if (k % 2 === 0) s.spic(v[(k / 2) % 3] + 12, b + k * .25, .13, .3); } v.forEach((m, k) => { s.strings(m, b, 4, .12, .2 + k * .3); s.brass(m - 12, b, .5, .16, .3 + k * .2); s.brass(m - 12, b + 1.5, .5, .13, .3 + k * .2); }); s.bass(near(c.root, 33), b, 4, .5);
      [0, .75, 1.5, 2, 2.75, 3.5].forEach((q, k) => s.taiko(b + q, k ? .4 : .7, 52 + (k % 3) * 8)); [1, 3].forEach(q => s.snare(b + q, .24)); for (let k = 0; k < 16; k++) s.hat(b + k * .25, k % 4 === 2 ? .09 : .04); if (i % 2 === 0) s.cymb(b, .1); if (i % 4 === 3) for (let k = 0; k < 8; k++) s.snare(b + 2 + k * .25, .06 + k * .03); });
    const mel = 'E5:1 G5:1 B5:2 A5:.5 G5:.5 F#5:1 E5:2 C5:1 E5:1 G5:2 F#5:1 A5:1 D5:2 E5:1 G5:1 B5:1 E6:1 D6:2 B5:1 G5:1 A5:1 C6:1 B5:1 A5:1 B5:4 E6:2 D6:1 B5:1 C6:1 B5:1 G5:2 B5:1 D6:1 G5:2 A5:1 F#5:1 D5:2 A5:1 C6:1 E6:2 D6:1 C6:1 A5:2 B5:2 F#5:2 B5:4';
    s.melody(mel, 'brass', -1, .23, .42); s.melody(mel, 'strings', 0, .12, .62); return s.done(1.5, .18, .76, 1.25);
  },
  // 결과 발표: 따뜻하고 벅찬 마무리
  bgm_result() {
    const s = new Song(88, 8), cs = 'C G/B Am Em F C/E Dm G'.split(' ');
    each(cs, (c, i) => { const b = i * 4, v = c.pc.map(p => near(p, 55)); v.forEach((m, k) => { s.strings(m, b, 4, .18, .2 + k * .3); s.strings(m + 12, b, 4, .07, .7 - k * .2); }); s.bass(near(c.root, 36), b, 2, .45); s.bass(near(c.root, 36), b + 2, 2, .36); [v[0], v[2], v[0] + 12, v[1] + 12, v[2] + 12, v[1] + 12, v[0] + 12, v[2]].forEach((m, k) => s.harp(m, b + k * .5, .28, .3 + (k % 4) * .13)); s.taiko(b, .2, 60); s.taiko(b + 2, .1, 70); if (i % 4 === 0) s.cymb(b, .06); });
    s.melody('E5:2 G5:1 C6:1 B5:1.5 A5:.5 G5:2 A5:1.5 B5:.5 C6:1 E6:1 D6:1 B5:1 G5:2 A5:1.5 G5:.5 F5:1 A5:1 G5:2 E5:1 C5:1 D5:1 E5:1 F5:1 A5:1 G5:3 r:1', 'flute', 0, .17, .5); s.melody('r:16 A4:2 C5:2 G4:2 E4:2 F4:2 A4:2 G4:2 B4:2', 'brass', 0, .09, .4); return s.done(2, .26, .62);
  }
};
Song.prototype.glockN = function (m, t, d, g, p) { this.glock(m, t, g, p); };
fs.mkdirSync(out, { recursive: true }); const only = process.argv.slice(3);
Object.entries(MUSIC).forEach(([k, fn]) => { if (only.length && !only.includes(k)) return; const [L, R, pk, loop] = fn(); save(k, L, R, pk, loop); });
