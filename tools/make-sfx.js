// 효과음 합성기: 외부 음원 없이 모든 효과음을 직접 만들어 WAV로 저장합니다.
// 사용: node tools/make-sfx.js <출력 폴더> [이름…]   (이후 ffmpeg로 ogg 변환: tools/build-audio.ps1)
const { SR, N, TAU, rnd, buf, clamp, lerp, midi, noise, svf, env, add, sat, ad, modal, sweep, reverb, save, pluck, saws, pan, out } = require('./sfx-lib');
const fs = require('fs');
const two = d => [buf(d), buf(d)];
const both = (L, R, x, at, g) => { add(L, x, at, g); add(R, x, at + .0004, g); };
const nz = (d, type, f, q, e, g) => { const x = env(svf(noise(d), type, f, q), e); if (g) for (let i = 0; i < x.length; i++) x[i] *= g; return x; };
const bell = (m, d, g) => modal(d, midi(m), [[1, 1, d * .34], [2, .18, d * .2], [4.02, .3, d * .09], [9.8, .06, d * .03]], .002).map(x => x * (g || 1));
const thump = (f0, f1, d, k) => sweep(d, t => f1 + (f0 - f1) * Math.exp(-t / (k || .03)), ad(.001, d * .3));
const whooshB = (d, f0, f1, q) => nz(d, 'bp', t => lerp(f0, f1, t / d), q || 1.2, t => Math.sin(Math.PI * clamp(t / d, 0, 1)));
const seqBells = (ms, gap, dur, rv, pk) => { const [L, R] = two(gap * ms.length + dur + .4); ms.forEach((m, i) => [].concat(m).forEach(q => pan(L, R, bell(q, dur), i * gap, .6, .5 + (i - ms.length / 2) * .06))); return [...reverb(L, R, rv || 1.1, .28, .3, .015), pk || .7]; };
const woodTap = (f, d) => modal(d || .2, f, [[1, .9, .032], [2.7, .35, .018], [5.1, .14, .01]], .0012);
const metal = (f, d, g) => modal(d, f, [[1, .5, .3], [1.47, .6, .26], [1.93, .45, .3], [2.41, .5, .2], [2.88, .4, .2], [3.62, .4, .14], [4.35, .35, .14], [5.27, .3, .1], [6.14, .25, .08]].map(([r, a, t]) => [r, a, t * (g || 1)]), .0004);
const brassN = (L, R, m, at, dur, g, p) => { const n = N(dur + .4), f = midi(m), x = saws(f, n, [-.0035, -.0012, .0014, .0038], .0026), y = svf(svf(x, 'lp', t => f * 1.2 + (f * 5 + 900) * Math.min(1, t / .06) * (.6 + .4 * Math.exp(-t / .35)), .75), 'lp', 5200, .7); env(y, t => Math.min(1, t / .03) * (t < dur ? .86 + .14 * Math.exp(-t / .1) : Math.exp(-(t - dur) / .1))); pan(L, R, y, at, g, p); };
const taiko = (L, R, at, g, f) => { const x = modal(.9, f || 62, [[1, 1, .26], [1.59, .5, .15], [2.14, .3, .1], [2.65, .2, .07]], .001), s = sweep(.3, t => 60 + 120 * Math.exp(-t / .02), ad(.001, .06)), k = nz(.08, 'lp', 1800, .8, ad(.0006, .014)); both(L, R, x, at, g); both(L, R, s, at, g * .8); both(L, R, k, at, g * .7); };
const cym = (L, R, at, g, d) => { [L, R].forEach(c => { const x = svf(noise(d || 2.2), 'hp', 3600, .6); for (let j = 0; j < 12; j++) { const f = 3100 + rnd() * 6900, w = TAU * f / SR, p = rnd() * 6, dd = .4 + rnd() * .8; for (let i = 0; i < x.length; i++) x[i] += .05 * Math.sin(p + w * i) * Math.exp(-i / SR / dd); } add(c, env(x, t => Math.min(1, t / .004) * (.55 * Math.exp(-t / .14) + .45 * Math.exp(-t / .75))), at, g); }); };
// 사람 목소리 같은 함성 한 명
function voice(d, f0, f1, vow) { const n = N(d), x = new Float32Array(n); let ph = rnd(); const vb = 4 + rnd() * 3, va = .015 + rnd() * .02; for (let i = 0; i < n; i++) { const t = i / SR, f = lerp(f0, f1, t / d) * (1 + va * Math.sin(TAU * vb * t)); ph = (ph + f / SR) % 1; x[i] = (ph < .42 ? 1 : -.6) * .6 + (rnd() * 2 - 1) * .16; } const [a, b, c] = vow; const A = svf(x, 'bp', a, 5), B = svf(x, 'bp', b, 6), C = svf(x, 'bp', c, 6); for (let i = 0; i < n; i++) x[i] = A[i] + B[i] * .6 + C[i] * .22; return x; }
const VOW = [[760, 1250, 2600], [620, 1050, 2500], [480, 850, 2400], [560, 1750, 2600], [700, 1400, 2700]];
function crowdMix(d, count, shape) { const [L, R] = two(d); for (let i = 0; i < count; i++) { const dd = .6 + rnd() * 1.6, at = rnd() * Math.max(.01, d - dd), f = 130 + Math.pow(rnd(), 1.3) * 330, v = voice(dd, f, f * (.85 + rnd() * .4), VOW[Math.floor(rnd() * 5)].map(x => x * (.88 + rnd() * .28))); env(v, t => Math.min(1, t / .12) * Math.min(1, (dd - t) / .25)); pan(L, R, v, at, (.1 + rnd() * .25) * (shape ? shape(at / d) : 1), rnd()); } [L, R].forEach(c => { const b = svf(svf(noise(d), 'bp', 1050, .5), 'lp', 3000, .6); env(b, t => .16 * (shape ? shape(t / d) : 1)); add(c, b, 0, 1); }); return [L, R]; }

const SOUNDS = {

  // 버튼: 나무를 톡 두드리는 짧고 부드러운 소리
  click() {
    const L = buf(.28), R = buf(.28);
    const body = modal(.2, 520, [[1, .9, .030], [2.72, .35, .018], [5.1, .14, .010]], .0015);
    const tick = env(svf(noise(.03), 'bp', 3200, 1.1), ad(.0005, .005));
    [L, R].forEach((c, k) => { add(c, body, 0, 1); add(c, tick, 0, .5 + k * .06); });
    return [...reverb(L, R, .25, .10, .5, .004), .55];
  },
  // 보상: 첼레스타가 위로 구르는 소리 + 동전 반짝임
  reward() {
    const L = buf(2.2), R = buf(2.2);
    [74, 78, 81, 86, 90].forEach((m, i) => {
      const n = modal(1.6, midi(m), [[1, 1, .55], [2, .16, .28], [4.02, .32, .13], [9.8, .07, .04]], .002), pan = .5 + (i - 2) * .12;
      add(L, n, i * .062, .6 * (1 - pan) + .2); add(R, n, i * .062, .6 * pan + .2);
    });
    [[.02, 4100], [.10, 5050], [.19, 4600]].forEach(([t, f], i) => { const c = modal(.5, f, [[1, .5, .10], [1.34, .4, .07], [1.91, .3, .05], [2.63, .2, .03]], .0005); add(L, c, t, .10 + i * .02); add(R, c, t + .004, .12); });
    const air = env(svf(noise(1), 'hp', 7000, .7), t => Math.min(1, t / .25) * Math.exp(-t / .22)); add(L, air, .05, .035); add(R, air, .07, .035);
    return [...reverb(L, R, 1.5, .34, .25, .02), .75];
  },
  // 검: 휘두르는 바람 → 금속 부딪힘 → 묵직한 타격
  sword() {
    const L = buf(1.5), R = buf(1.5), hit = .17;
    const wh = env(svf(noise(.3), 'bp', t => 500 + 3600 * Math.pow(t / .2, 2), 1.6), t => Math.pow(clamp(t / .15, 0, 1), 2) * (t < .16 ? 1 : Math.exp(-(t - .16) / .02)));
    add(L, wh, 0, .9); add(R, wh, .006, .8);
    const parts = [[1, .5, .30], [1.47, .6, .26], [1.93, .45, .34], [2.41, .5, .20], [2.88, .4, .24], [3.62, .4, .15], [4.35, .35, .16], [5.27, .3, .10], [6.14, .28, .09], [7.45, .2, .06]];
    const a = modal(1.1, 1130, parts, .0004), b = modal(1.1, 1143, parts, .0004);
    add(L, a, hit, .30); add(R, b, hit, .30);
    const cr = env(svf(noise(.12), 'hp', 2300, .8), ad(.0004, .014)); add(L, cr, hit, .9); add(R, cr, hit + .0007, .9);
    const th = sweep(.25, t => 70 + 130 * Math.exp(-t / .025), ad(.001, .07)); add(L, th, hit, .95); add(R, th, hit, .95);
    const bo = env(svf(noise(.2), 'lp', 650, .8), ad(.001, .04)); add(L, bo, hit, .8); add(R, bo, hit, .8);
    sat(L, 1.5); sat(R, 1.5);
    return [...reverb(L, R, .9, .20, .35, .012), .9];
  },
  // 메테오: 떨어지는 굉음 1.5초 → 대폭발 → 무너지는 여운 (화면의 충돌 시점과 맞춤: 1.5초)
  meteor() {
    const D = 5, L = buf(D), R = buf(D), hit = 1.5;
    const fall = (q, f0, f1, g) => { const x = svf(noise(hit + .05), 'bp', t => lerp(f0, f1, Math.pow(t / hit, 2.2)), q); return [env(x, t => g * Math.pow(clamp(t / hit, 0, 1), 2.6)), 0]; };
    [[1.3, 1500, 240, 1.5], [.8, 260, 90, 2.2]].forEach(([q, a, b, g], i) => { add(L, fall(q, a, b, g)[0], 0, 1); add(R, fall(q, a * 1.05, b, g)[0], 0, 1); });
    const roar = svf(noise(hit), 'lp', 170, .9); for (let i = 0; i < roar.length; i++) { const t = i / SR; roar[i] *= Math.pow(t / hit, 2) * 2.6 * (1 + .5 * Math.sin(TAU * (14 + 8 * t) * t)); } add(L, roar, 0, 1); add(R, roar, .01, 1);
    // 폭발: 순간 파열 + 아주 낮은 울림 + 몸통
    const crack = env(svf(noise(.2), 'hp', 1200, .7), ad(.0005, .03)); add(L, crack, hit, 1.5); add(R, crack, hit + .001, 1.5);
    const sub = sweep(2.2, t => 27 + 95 * Math.exp(-t / .11), t => Math.min(1, t / .004) * Math.exp(-t / .62)); add(L, sub, hit, 2.4); add(R, sub, hit, 2.4);
    for (let k = 0; k < 2; k++) { const body = env(svf(noise(2.4), 'lp', t => 110 + 4200 * Math.exp(-t / .16), .7), t => Math.min(1, t / .002) * (Math.exp(-t / .22) + .28 * Math.exp(-t / .8))); add(k ? R : L, body, hit, 1.9); }
    // 튀는 돌과 불티
    for (let i = 0; i < 46; i++) { const t = hit + .12 + Math.pow(rnd(), 1.7) * 1.9, f = 300 + rnd() * 1700, d = .012 + rnd() * .05, c = env(svf(noise(.14), 'bp', f, 2.5), ad(.0008, d)), g = (.6 * Math.exp(-(t - hit) / .9)) * (.4 + rnd()), p = rnd(); add(L, c, t, g * (1 - p)); add(R, c, t, g * p); }
    const fire = svf(noise(2.6), 'bp', 900, .6); env(fire, t => .16 * Math.min(1, t / .1) * Math.exp(-t / .9) * (.6 + .4 * Math.sin(TAU * 6.5 * t))); add(L, fire, hit + .1, 1); add(R, fire, hit + .13, 1);
    sat(L, 1.25); sat(R, 1.25);
    return [...reverb(L, R, 2.6, .30, .45, .03), .95];
  },
  // 승리: 팀파니 + 금관 화음 + 현악 + 심벌
  victory() {
    const D = 5.2, L = buf(D), R = buf(D);
    const brass = (m, at, dur, g, pan) => {
      const n = N(dur + .35), x = new Float32Array(n), f = midi(m), vs = [-.0035, -.0012, .0014, .0038], ph = vs.map(() => rnd());
      for (let i = 0; i < n; i++) { const t = i / SR, vib = 1 + .0028 * Math.sin(TAU * 5.1 * t) * clamp((t - .25) * 3, 0, 1), sc = 1 - .016 * Math.exp(-t / .03); let s = 0; vs.forEach((d, k) => { ph[k] = (ph[k] + f * (1 + d) * vib * sc / SR) % 1; s += ph[k] * 2 - 1; }); x[i] = s / 4; }
      const y = svf(svf(x, 'lp', t => f * 1.2 + (f * 5.2 + 900) * Math.min(1, t / .07) * (.62 + .38 * Math.exp(-t / .35)), .75), 'lp', 5200, .7);
      env(y, t => Math.min(1, t / .035) * (t < dur ? .86 + .14 * Math.exp(-t / .1) : Math.exp(-(t - dur) / .09)));
      add(L, y, at, g * (1 - pan)); add(R, y, at, g * pan);
    };
    const str = (m, at, dur, g, pan) => {
      const n = N(dur + .9), x = new Float32Array(n), f = midi(m), vs = [-.006, -.0025, .001, .0032, .0068], ph = vs.map(() => rnd());
      for (let i = 0; i < n; i++) { let s = 0; vs.forEach((d, k) => { ph[k] = (ph[k] + f * (1 + d + .0015 * Math.sin(TAU * (4.6 + k * .3) * i / SR)) / SR) % 1; s += ph[k] * 2 - 1; }); x[i] = s / 5; }
      const y = svf(svf(x, 'lp', 2600, .6), 'hp', 180, .7); env(y, t => Math.min(1, t / .22) * (t < dur ? 1 : Math.exp(-(t - dur) / .3)));
      add(L, y, at, g * (1 - pan)); add(R, y, at, g * pan);
    };
    const timp = (m, at, g) => { const f = midi(m), x = modal(1.4, f, [[1, 1, .5], [1.5, .55, .34], [1.99, .4, .28], [2.44, .28, .2], [2.89, .18, .14]], .002), k = env(svf(noise(.06), 'lp', 900, .8), ad(.0008, .012)); add(L, x, at, g); add(R, x, at, g * .92); add(L, k, at, g * .8); add(R, k, at, g * .8); };
    // 짧-짧-짧-길게 → 올라가는 화음 → 마침
    const chord = (ms, at, dur, g) => ms.forEach((m, i) => { const p = .5 + (i - (ms.length - 1) / 2) * .13; brass(m, at, dur, g, p); brass(m, at + .012, dur, g * .5, 1 - p); });
    [[0, .10], [.16, .10], [.32, .10]].forEach(([t, d]) => { chord([62, 66, 69], t, d, .42); timp(38, t, .35); });
    chord([62, 66, 69, 74], .48, .52, .42); timp(38, .48, .7);
    chord([67, 71, 74, 79], 1.06, .34, .40); timp(43, 1.06, .5);
    chord([69, 73, 76, 81], 1.44, .34, .42); timp(45, 1.44, .55);
    chord([50, 57, 62, 66, 69, 74, 78], 1.84, 1.75, .36);
    [50, 62, 69, 74, 78, 81].forEach((m, i) => str(m, 1.82, 1.9, .30, .2 + i * .12));
    for (let i = 0; i < 12; i++) timp(38, 1.46 + i * .032, .04 + i * .02);
    timp(38, 1.84, 1.1); timp(33, 1.85, .6);
    const cym = k => { const x = svf(noise(3), 'hp', 3600, .6); for (let j = 0; j < 14; j++) { const f = 3100 + rnd() * 6900, w = TAU * f / SR, p = rnd() * 6, d = .5 + rnd() * .9, n = x.length; for (let i = 0; i < n; i++) x[i] += .05 * Math.sin(p + w * i) * Math.exp(-i / SR / d); } return env(x, t => Math.min(1, t / .004) * (.55 * Math.exp(-t / .16) + .45 * Math.exp(-t / .95))); };
    add(L, cym(), 1.84, .24); add(R, cym(), 1.84, .24);
    const sw = env(svf(noise(.6), 'hp', 3000, .6), t => Math.pow(t / .6, 3)); add(L, sw, 1.25, .16); add(R, sw, 1.26, .16);
    sat(L, 1.1); sat(R, 1.1);
    return [...reverb(L, R, 2.2, .30, .35, .028), .92];
  },
  // ----- 화면 조작 -----
  select() { const [L, R] = two(.4); both(L, R, woodTap(680), 0, .8); pan(L, R, bell(83, .35), .012, .22, .5); return [...reverb(L, R, .4, .16, .4, .006), .5]; },
  confirm() { const [L, R] = two(1.1); both(L, R, woodTap(420), 0, .7); [69, 76].forEach((m, i) => pan(L, R, pluck(midi(m), .9, .7, 1.1), .02 + i * .085, .5, .4 + i * .2)); pan(L, R, bell(88, .6), .11, .2, .6); return [...reverb(L, R, .9, .26, .35, .012), .65]; },
  back() { const [L, R] = two(.35); both(L, R, woodTap(400), 0, .8); both(L, R, woodTap(300), .06, .5); return [...reverb(L, R, .3, .12, .5, .004), .5]; },
  error() { const [L, R] = two(.5); [0, .11].forEach(t => both(L, R, modal(.25, 155, [[1, 1, .07], [2.05, .4, .05], [3.1, .2, .03]], .003), t, .8)); return [...reverb(L, R, .3, .1, .5, .004), .55]; },
  open() { const [L, R] = two(.6); both(L, R, whooshB(.28, 500, 2600, .9), 0, .35); pan(L, R, pluck(midi(74), .5, .5, .7), .08, .35, .5); return [...reverb(L, R, .6, .2, .4, .008), .45]; },
  tick() { const [L, R] = two(.12); both(L, R, woodTap(980, .1), 0, 1); return [L, R, .35]; },
  type() { const [L, R] = two(.07); both(L, R, nz(.05, 'bp', 2600, 1.6, ad(.0006, .007)), 0, .7); both(L, R, woodTap(760, .06), 0, .35); return [L, R, .22]; },
  question() { return seqBells([72, 79], .12, .7, .9, .55); },
  pop() { const [L, R] = two(.22); both(L, R, sweep(.12, t => 360 + 620 * Math.min(1, t / .05), ad(.002, .03)), 0, .9); both(L, R, nz(.04, 'bp', 1800, 1, ad(.001, .006)), 0, .3); return [...reverb(L, R, .25, .1, .5, .004), .5]; },
  drop() { const [L, R] = two(.6); both(L, R, thump(220, 80, .3, .02), 0, 1); both(L, R, woodTap(300, .3), 0, .9); both(L, R, nz(.1, 'lp', 900, .7, ad(.001, .02)), 0, .6); return [...reverb(L, R, .5, .15, .5, .008), .7]; },
  pluck() { const [L, R] = two(.9); pan(L, R, pluck(midi(74), .85, .75, 1), 0, .7, .45); pan(L, R, pluck(midi(81), .7, .7, .8), .03, .4, .6); return [...reverb(L, R, .8, .2, .4, .01), .6]; },
  glass() { const [L, R] = two(1.8); [88, 92, 95, 100].forEach((m, i) => pan(L, R, bell(m, 1.4), i * .035, .4, .3 + i * .13)); both(L, R, nz(.6, 'hp', 7500, .7, t => Math.exp(-t / .16)), 0, .05); return [...reverb(L, R, 1.6, .36, .2, .02), .6]; },
  page() { const [L, R] = two(.45); both(L, R, nz(.34, 'bp', t => 1800 + 2600 * t / .34, .8, t => Math.sin(Math.PI * clamp(t / .34, 0, 1)) * (.5 + .5 * Math.abs(Math.sin(t * 70)))), 0, .7); both(L, R, nz(.06, 'bp', 3200, .9, ad(.001, .012)), .3, .4); return [...reverb(L, R, .3, .1, .5, .004), .4]; },
  // ----- 보상 -----
  gain() { return seqBells([76, 81, 85], .07, .8, 1.1, .6); },
  levelup() { const [L, R] = two(2.2); [62, 66, 69, 74, 78, 81, 86].forEach((m, i) => { pan(L, R, pluck(midi(m), 1.3, .75, 1.4), i * .055, .42, .25 + i * .08); pan(L, R, bell(m + 12, 1), i * .055, .18, .7 - i * .06); }); both(L, R, whooshB(.5, 400, 4200, .8), 0, .25); return [...reverb(L, R, 1.6, .32, .25, .02), .75]; },
  power() { const [L, R] = two(1.5); both(L, R, whooshB(.55, 180, 2600, .8), 0, .6); both(L, R, sweep(.6, t => 90 + 260 * t, t => Math.min(1, t / .3) * Math.exp(-Math.max(0, t - .35) / .1)), 0, .5); [69, 76, 81].forEach((m, i) => pan(L, R, bell(m, 1), .34 + i * .03, .4, .3 + i * .2)); return [...reverb(L, R, 1.2, .28, .3, .015), .7]; },
  right() { const [L, R] = two(1.4); [[76, 0], [83, .1]].forEach(([m, t]) => { pan(L, R, bell(m, 1), t, .6, .45); pan(L, R, pluck(midi(m - 12), .9, .7, 1), t, .4, .55); }); return [...reverb(L, R, 1, .26, .3, .012), .7]; },
  wrong() { const [L, R] = two(.9); [[57, 0], [53, .14]].forEach(([m, t]) => { const x = modal(.5, midi(m), [[1, 1, .13], [2.02, .5, .09], [3.05, .25, .06]], .004); both(L, R, x, t, .6); }); return [...reverb(L, R, .6, .16, .5, .01), .55]; },
  coin() { const [L, R] = two(.9); [[0, 3950], [.06, 5230]].forEach(([t, f]) => both(L, R, modal(.6, f, [[1, .5, .13], [1.34, .4, .1], [1.91, .28, .07], [2.63, .2, .04]], .0005), t, .6)); both(L, R, nz(.03, 'hp', 5000, .8, ad(.0005, .006)), 0, .25); return [...reverb(L, R, .7, .18, .3, .008), .5]; },
  coin2() { const [L, R] = two(1.1); for (let i = 0; i < 7; i++) { const t = i * .055 + rnd() * .025, f = 3500 + rnd() * 2200; pan(L, R, modal(.4, f, [[1, .5, .1], [1.34, .4, .08], [1.91, .28, .05]], .0005), t, .45, rnd()); } return [...reverb(L, R, .7, .18, .3, .008), .5]; },
  gem() { const [L, R] = two(.6); pan(L, R, bell(93, .5), 0, .6, .5); return [...reverb(L, R, .6, .2, .3, .008), .4]; },
  // ----- 주사위·카드·물건 -----
  diceshake() { const [L, R] = two(.95); for (let i = 0; i < 17; i++) { const t = i * .052 + rnd() * .03; pan(L, R, woodTap(700 + rnd() * 700, .09), t, .3 + rnd() * .5, .3 + rnd() * .4); } return [...reverb(L, R, .3, .1, .5, .004), .55]; },
  dicethrow() { const [L, R] = two(.9); let t = 0; for (let i = 0; i < 7; i++) { pan(L, R, woodTap(520 + rnd() * 520, .14), t, .9 * Math.pow(.72, i), .3 + i * .06); both(L, R, thump(160, 90, .1), t, .5 * Math.pow(.7, i)); t += .13 * Math.pow(.82, i); } return [...reverb(L, R, .4, .14, .5, .006), .7]; },
  card() { const [L, R] = two(.25); both(L, R, nz(.14, 'bp', t => 3600 - 9000 * t, 1, ad(.003, .03)), 0, .7); both(L, R, woodTap(900, .05), .03, .25); return [L, R, .45]; },
  cardflip() { const [L, R] = two(.3); both(L, R, nz(.16, 'bp', t => 1700 + 16000 * t, 1, t => Math.sin(Math.PI * clamp(t / .16, 0, 1))), 0, .7); both(L, R, nz(.03, 'bp', 2600, 1, ad(.0006, .008)), .15, .6); return [L, R, .45]; },
  shuffle() { const [L, R] = two(.9); for (let i = 0; i < 26; i++) pan(L, R, nz(.05, 'bp', 2300 + rnd() * 1700, 1.2, ad(.0008, .008)), i * .027 + rnd() * .01, .35 + rnd() * .3, .3 + rnd() * .4); both(L, R, whooshB(.75, 1400, 2600, .7), 0, .22); return [L, R, .45]; },
  slide() { const [L, R] = two(.3); both(L, R, nz(.2, 'bp', 720, .9, t => Math.sin(Math.PI * clamp(t / .2, 0, 1)) * (.6 + .4 * rnd())), 0, .8); both(L, R, woodTap(330, .1), .17, .6); return [L, R, .5]; },
  door() { const [L, R] = two(1.8); both(L, R, whooshB(.9, 160, 900, .7), 0, .6); [57, 64, 69, 76].forEach((m, i) => pan(L, R, bell(m, 1.4), .18 + i * .07, .34, .3 + i * .13)); return [...reverb(L, R, 1.8, .4, .3, .02), .65]; },
  latch() { const [L, R] = two(.5); both(L, R, metal(820, .3, .16), 0, .25); both(L, R, woodTap(330, .2), .002, .8); both(L, R, metal(640, .3, .16), .09, .3); return [...reverb(L, R, .4, .14, .5, .006), .6]; },
  creak() { const [L, R] = two(1); const x = buf(.7); let ph = 0; for (let i = 0; i < x.length; i++) { const t = i / SR, f = 34 + 40 * t + 9 * Math.sin(t * 23); ph += f / SR; if (ph > 1) { ph -= 1; x[i] = .9 + rnd() * .3; } } const y = svf(svf(x, 'bp', t => 620 + 500 * t, 6), 'lp', 3000, .7); env(y, t => Math.min(1, t / .06) * Math.min(1, (.7 - t) / .1)); both(L, R, y, 0, 3); both(L, R, thump(150, 70, .2), .68, .4); return [...reverb(L, R, .6, .16, .5, .01), .5]; },
  rock() { const [L, R] = two(.9); both(L, R, thump(150, 55, .35, .02), 0, 1); both(L, R, nz(.3, 'lp', 1500, .7, ad(.001, .05)), 0, 1); for (let i = 0; i < 9; i++) pan(L, R, nz(.08, 'bp', 500 + rnd() * 1300, 2, ad(.001, .02)), .05 + rnd() * .35, .4 * rnd(), rnd()); return [...reverb(L, R, .6, .16, .5, .01), .8]; },
  rock2() { const [L, R] = two(1.5); both(L, R, thump(170, 42, .5, .03), 0, 1.3); both(L, R, nz(.5, 'lp', t => 300 + 3600 * Math.exp(-t / .06), .7, ad(.001, .11)), 0, 1.2); for (let i = 0; i < 24; i++) pan(L, R, nz(.1, 'bp', 350 + rnd() * 1700, 2.2, ad(.001, .02 + rnd() * .03)), .06 + Math.pow(rnd(), 1.5) * .8, .55 * rnd(), rnd()); sat(L, 1.3); sat(R, 1.3); return [...reverb(L, R, .9, .2, .45, .012), .9]; },
  crash() { const [L, R] = two(1.1); both(L, R, thump(140, 60, .25), 0, .8); for (let i = 0; i < 14; i++) pan(L, R, i % 3 ? woodTap(260 + rnd() * 700, .2) : metal(500 + rnd() * 900, .3, .12), Math.pow(rnd(), 1.6) * .5, .5 * rnd(), rnd()); both(L, R, nz(.25, 'bp', 1300, .6, ad(.001, .05)), 0, .7); return [...reverb(L, R, .6, .16, .45, .01), .8]; },
  whiff() { const [L, R] = two(.35); both(L, R, whooshB(.26, 900, 400, 1.2), 0, .7); return [L, R, .45]; },
  squish() { const [L, R] = two(.3); both(L, R, sweep(.16, t => 260 + 340 * Math.sin(t * 22), ad(.003, .05)), 0, .5); both(L, R, nz(.15, 'bp', t => 700 + 2200 * t, 2.2, ad(.004, .035)), 0, .9); return [L, R, .55]; },
  // ----- 달리기 -----
  step1() { const [L, R] = two(.14); both(L, R, nz(.08, 'lp', 900, .8, ad(.001, .016)), 0, 1); both(L, R, thump(120, 70, .06, .01), 0, .6); return [L, R, .5]; },
  step2() { const [L, R] = two(.14); both(L, R, nz(.09, 'lp', 1250, .8, ad(.001, .014)), 0, 1); both(L, R, thump(105, 64, .06, .01), 0, .6); return [L, R, .5]; },
  beep() { const [L, R] = two(1.2); taiko(L, R, 0, 1, 70); pan(L, R, bell(69, .6), 0, .18, .5); return [...reverb(L, R, 1, .24, .45, .015), .85]; },
  go() { const [L, R] = two(2); taiko(L, R, 0, 1.1, 58); [62, 69, 74, 78].forEach((m, i) => brassN(L, R, m, 0, .7, .34, .25 + i * .17)); cym(L, R, 0, .22, 1.6); return [...reverb(L, R, 1.5, .28, .35, .02), .92]; },
  boost() { const [L, R] = two(1.1); both(L, R, whooshB(.7, 260, 4200, .7), 0, .8); both(L, R, sweep(.6, t => 120 + 700 * t * t, t => Math.min(1, t / .05) * Math.exp(-t / .22)), 0, .35); both(L, R, thump(110, 50, .3), 0, .8); return [...reverb(L, R, .8, .2, .35, .01), .8]; },
  slip() { const [L, R] = two(.8); both(L, R, sweep(.42, t => 500 + 1300 * t * t * 4, t => Math.min(1, t / .02) * Math.exp(-t / .2)), 0, .4); both(L, R, nz(.3, 'bp', t => 1500 + 3000 * t, 1.8, ad(.004, .09)), 0, .4); both(L, R, thump(130, 55, .25), .4, .9); both(L, R, nz(.12, 'lp', 800, .7, ad(.001, .03)), .4, .6); return [...reverb(L, R, .4, .12, .5, .006), .75]; },
  splash() { const [L, R] = two(.9); both(L, R, nz(.6, 'bp', t => 900 + 900 * Math.exp(-t / .1), .7, t => Math.min(1, t / .008) * Math.exp(-t / .13)), 0, .9); for (let i = 0; i < 12; i++) { const f = 400 + rnd() * 900; pan(L, R, sweep(.06, t => f + 5200 * t, ad(.002, .016)), .08 + rnd() * .45, .25 * rnd(), rnd()); } return [...reverb(L, R, .4, .14, .5, .006), .7]; },
  trip() { const [L, R] = two(.8); both(L, R, metal(420, .4, .16), 0, .3); both(L, R, woodTap(260, .25), 0, .9); both(L, R, thump(140, 55, .3), .16, 1); both(L, R, nz(.2, 'lp', 1000, .7, ad(.001, .05)), .16, .7); return [...reverb(L, R, .4, .13, .5, .006), .8]; },
  whoosh() { const [L, R] = two(.7); both(L, R, whooshB(.55, 350, 2300, .9), 0, .9); return [...reverb(L, R, .5, .14, .4, .006), .7]; },
  gong() { const [L, R] = two(4); const p = [[1, 1, 1.6], [1.41, .6, 1.3], [1.98, .7, 1.1], [2.63, .5, .8], [3.2, .4, .6], [4.1, .3, .4], [5.3, .22, .3], [6.8, .16, .2]]; add(L, modal(3.8, 118, p, .004), 0, .8); add(R, modal(3.8, 119.3, p, .004), 0, .8); cym(L, R, 0, .12, 2); taiko(L, R, 0, .7, 55); return [...reverb(L, R, 2.6, .34, .35, .025), .9]; },
  // ----- 전투 -----
  shoot() { const [L, R] = two(.4); both(L, R, whooshB(.2, 1400, 500, 1.4), 0, .7); pan(L, R, pluck(midi(50), .2, .6, .2), 0, .5, .5); return [L, R, .6]; },
  arrow() { const [L, R] = two(.6); pan(L, R, pluck(midi(45), .3, .8, .25), 0, .9, .45); both(L, R, whooshB(.32, 2600, 900, 1.8), .02, .8); both(L, R, woodTap(240, .12), 0, .4); return [...reverb(L, R, .4, .12, .4, .006), .75]; },
  fire() { const [L, R] = two(1); both(L, R, nz(.8, 'bp', t => 380 + 900 * Math.exp(-t / .14), .6, t => Math.min(1, t / .02) * Math.exp(-t / .22) * (.75 + .25 * Math.sin(t * 46))), 0, 1.1); both(L, R, thump(130, 55, .3), 0, .7); return [...reverb(L, R, .6, .16, .4, .01), .8]; },
  zap() { const [L, R] = two(1); const x = buf(.5); let ph = 0; for (let i = 0; i < x.length; i++) { const t = i / SR; ph += (900 + 700 * Math.sin(t * 60) + 1500 * Math.exp(-t / .08)) / SR; x[i] = Math.sin(TAU * ph) * Math.exp(-t / .12); } both(L, R, x, 0, .3); [81, 88].forEach((m, i) => pan(L, R, bell(m, .8), i * .03, .3, .4 + i * .2)); both(L, R, nz(.2, 'hp', 4200, .7, ad(.001, .04)), 0, .3); return [...reverb(L, R, 1, .28, .25, .012), .65]; },
  slash() { const [L, R] = two(.5); both(L, R, nz(.3, 'bp', t => 900 + 4200 * Math.sin(Math.PI * clamp(t / .22, 0, 1)), 1.5, t => Math.sin(Math.PI * clamp(t / .24, 0, 1))), 0, 1); both(L, R, metal(1900, .25, .1), .07, .06); return [...reverb(L, R, .4, .12, .4, .006), .7]; },
  hit() { const [L, R] = two(.5); both(L, R, thump(190, 62, .22, .02), 0, 1.1); both(L, R, nz(.14, 'bp', 1100, .6, ad(.0006, .024)), 0, 1); both(L, R, nz(.05, 'hp', 3000, .7, ad(.0004, .008)), 0, .4); sat(L, 1.5); sat(R, 1.5); return [...reverb(L, R, .3, .1, .5, .005), .85]; },
  hit2() { const [L, R] = two(.5); both(L, R, thump(230, 80, .2, .018), 0, 1); both(L, R, nz(.12, 'bp', 1600, .7, ad(.0006, .02)), 0, 1); both(L, R, woodTap(380, .1), 0, .4); sat(L, 1.5); sat(R, 1.5); return [...reverb(L, R, .3, .1, .5, .005), .85]; },
  heavy() { const [L, R] = two(1.6); both(L, R, thump(170, 34, .9, .05), 0, 1.5); both(L, R, nz(.7, 'lp', t => 180 + 4200 * Math.exp(-t / .05), .7, ad(.0008, .12)), 0, 1.4); both(L, R, metal(520, .6, .25), 0, .12); sat(L, 1.6); sat(R, 1.6); return [...reverb(L, R, 1.2, .22, .45, .014), .95]; },
  kill() { const [L, R] = two(.5); both(L, R, sweep(.16, t => 520 - 2300 * t, ad(.002, .04)), 0, .5); both(L, R, nz(.14, 'bp', 1400, .9, ad(.001, .03)), 0, .6); pan(L, R, bell(88, .35), .02, .2, .5); return [L, R, .5]; },
  ko() { const [L, R] = two(2.2); taiko(L, R, 0, 1.2, 52); both(L, R, thump(150, 40, .6, .04), 0, .9); [50, 57, 62].forEach((m, i) => brassN(L, R, m, 0, .35, .24, .3 + i * .2)); cym(L, R, 0, .14, 1.4); return [...reverb(L, R, 1.6, .28, .4, .02), .9]; },
  ult() { const [L, R] = two(1.5); both(L, R, whooshB(.6, 300, 5200, .8), 0, .7); taiko(L, R, .42, .9, 60); [62, 69, 74].forEach((m, i) => brassN(L, R, m, .42, .4, .22, .3 + i * .2)); cym(L, R, .42, .15, 1); return [...reverb(L, R, 1.2, .26, .35, .016), .85]; },
  zone() { const [L, R] = two(2); both(L, R, nz(1.6, 'bp', t => 200 + 500 * t, 1.4, t => Math.sin(Math.PI * clamp(t / 1.6, 0, 1))), 0, .6); both(L, R, sweep(1.6, t => 70 + 20 * t, t => Math.sin(Math.PI * clamp(t / 1.6, 0, 1))), 0, .5); return [...reverb(L, R, 1.4, .3, .4, .02), .6]; },
  charge() { const [L, R] = two(1.4); both(L, R, nz(1.1, 'bp', t => 250 + 3400 * Math.pow(t / 1.1, 2), 1.3, t => Math.pow(t / 1.1, 1.4) * Math.min(1, (1.1 - t) / .05)), 0, .8); both(L, R, sweep(1.1, t => 80 + 420 * Math.pow(t / 1.1, 2), t => Math.pow(t / 1.1, 1.2) * Math.min(1, (1.1 - t) / .05)), 0, .35); return [...reverb(L, R, 1, .24, .35, .014), .7]; },
  quake() { const [L, R] = two(3); both(L, R, thump(120, 26, 1.8, .1), 0, 1.8); both(L, R, nz(1.8, 'lp', t => 90 + 3000 * Math.exp(-t / .1), .7, t => Math.min(1, t / .002) * (Math.exp(-t / .18) + .25 * Math.exp(-t / .7))), 0, 1.6); for (let i = 0; i < 36; i++) pan(L, R, nz(.12, 'bp', 260 + rnd() * 1400, 2.2, ad(.001, .02 + rnd() * .04)), .08 + Math.pow(rnd(), 1.5) * 1.5, .5 * rnd(), rnd()); sat(L, 1.4); sat(R, 1.4); return [...reverb(L, R, 1.8, .24, .5, .02), .95]; },
  volley() { const [L, R] = two(1.6); for (let i = 0; i < 30; i++) { const t = Math.pow(rnd(), .8) * .7, p = rnd(); pan(L, R, whooshB(.22, 3400 + rnd() * 1200, 1200, 2), t, .28, p); pan(L, R, woodTap(260 + rnd() * 300, .1), t + .2, .35, p); both(L, R, thump(150, 80, .06), t + .2, .12); } return [...reverb(L, R, .8, .2, .4, .012), .85]; },
  rhapsody() { const [L, R] = two(2.8); const ms = [62, 66, 69, 74, 78, 81, 86, 90, 93, 98]; ms.forEach((m, i) => { pan(L, R, pluck(midi(m), 1.6, .85, 1.5), i * .085, .5, .2 + i * .065); pan(L, R, bell(m + 12, 1), i * .085, .15, .8 - i * .06); }); [62, 69, 74, 78].forEach((m, i) => pan(L, R, pluck(midi(m), 1.6, .9, 1.6), 1 + i * .012, .6, .3 + i * .14)); both(L, R, whooshB(1, 400, 3400, .8), 0, .25); taiko(L, R, 1, .5, 70); return [...reverb(L, R, 2, .34, .25, .02), .85]; },
  judgement() { const [L, R] = two(3.2); const cho = (m, at, d, g, p) => { const n = N(d + .6), x = saws(midi(m), n, [-.007, -.003, .001, .004, .008], .004), a = svf(x, 'bp', 720, 2.2), b = svf(x, 'bp', 1150, 2.6), y = new Float32Array(n); for (let i = 0; i < n; i++) y[i] = a[i] + b[i] * .7 + x[i] * .05; env(y, t => Math.min(1, t / .28) * (t < d ? 1 : Math.exp(-(t - d) / .2))); pan(L, R, y, at, g, p); }; [62, 69, 74, 78, 81].forEach((m, i) => cho(m, 0, 1.1, .4, .2 + i * .15)); both(L, R, nz(1.2, 'hp', 3000, .6, t => Math.pow(t / 1.2, 2)), 0, .18); [86, 90, 93].forEach((m, i) => pan(L, R, bell(m, 1.6), .2 + i * .25, .25, .3 + i * .2)); return [...reverb(L, R, 2.4, .42, .25, .025), .8]; },
  holyhit() { const [L, R] = two(2.6); both(L, R, thump(140, 40, .7, .05), 0, 1.2); both(L, R, nz(.8, 'bp', t => 600 + 5200 * Math.exp(-t / .1), .6, ad(.001, .14)), 0, .9); [74, 81, 86, 90].forEach((m, i) => pan(L, R, bell(m, 2), i * .012, .4, .25 + i * .16)); cym(L, R, 0, .2, 1.8); return [...reverb(L, R, 2.2, .38, .25, .02), .92]; },
  duel() { const [L, R] = two(3.4); taiko(L, R, 0, 1.2, 50); [38, 45, 50, 53, 57].forEach((m, i) => brassN(L, R, m, 0, 1.2, .26, .2 + i * .15)); [0, .14, .28].forEach((t, i) => taiko(L, R, 1.3 + t, .6 + i * .15, 64)); [41, 48, 53, 56, 60].forEach((m, i) => brassN(L, R, m, 1.72, .9, .26, .2 + i * .15)); taiko(L, R, 1.72, 1.2, 50); cym(L, R, 1.72, .25, 1.6); return [...reverb(L, R, 2.2, .3, .4, .025), .95]; },
  // ----- 짧은 연주 -----
  j_good() { return seqBells([74, 78, 81, [86, 81, 78]], .1, 1.2, 1.5, .75); },
  j_cute() { const [L, R] = two(2.2); [[67, 0], [71, .13], [74, .26], [79, .39], [76, .58], [79, .74]].forEach(([m, t], i) => { pan(L, R, pluck(midi(m), .9, .6, .8), t, .5, .35 + i * .05); pan(L, R, bell(m + 12, .7), t, .16, .6); }); return [...reverb(L, R, 1.2, .26, .35, .015), .65]; },
  j_fail() { const [L, R] = two(2); [[64, 0], [62, .2], [60, .4], [57, .62]].forEach(([m, t]) => { const x = modal(.8, midi(m - 12), [[1, 1, .24], [2.01, .5, .16], [3.02, .2, .1]], .006); both(L, R, x, t, .45); pan(L, R, pluck(midi(m), .8, .4, .7), t, .3, .5); }); return [...reverb(L, R, 1, .24, .45, .015), .6]; },
  j_start() { const [L, R] = two(2.4); [[62, 0], [66, .11], [69, .22], [74, .34]].forEach(([m, t], i) => { pan(L, R, pluck(midi(m), 1.3, .75, 1.3), t, .55, .35 + i * .1); pan(L, R, bell(m + 12, 1), t, .2, .6); }); [62, 69, 74, 78].forEach((m, i) => brassN(L, R, m, .48, .5, .12, .25 + i * .16)); return [...reverb(L, R, 1.5, .3, .3, .018), .75]; },
  j_chapter() { const [L, R] = two(3); [50, 57, 62, 66].forEach((m, i) => { const n = N(2.4), y = svf(saws(midi(m), n, [-.006, -.002, .002, .006], .002), 'lp', 1700, .6); env(y, t => Math.min(1, t / .4) * Math.exp(-Math.max(0, t - 1.1) / .5)); pan(L, R, y, 0, .22, .2 + i * .2); }); [74, 78, 81, 86].forEach((m, i) => pan(L, R, pluck(midi(m), 1.6, .7, 1.5), .25 + i * .13, .42, .3 + i * .13)); pan(L, R, bell(90, 1.6), .85, .2, .6); return [...reverb(L, R, 2, .36, .3, .022), .7]; },
  // ----- 관중 -----
  crowd() { const [L, R] = crowdMix(7, 230); // 이어 붙여도 자연스럽게: 끝 1초를 앞과 섞음
    const f = N(1), n = L.length - f; [L, R].forEach(c => { for (let i = 0; i < f; i++) { const k = i / f; c[i] = c[i] * Math.sqrt(k) + c[n + i] * Math.sqrt(1 - k); } }); const a = L.slice(0, n), b = R.slice(0, n); return [a, b, .6, true]; },
  cheer() { const [L, R] = crowdMix(3.2, 170, k => Math.min(1, k / .06) * Math.pow(1 - k, .9)); return [...reverb(L, R, 1.6, .22, .4, .02), .85]; }
};
if (SOUNDS.victory) SOUNDS.j_win = SOUNDS.victory; delete SOUNDS.victory; delete SOUNDS.reward;
fs.mkdirSync(out, { recursive: true });
const only = process.argv.slice(3);
Object.entries(SOUNDS).forEach(([k, fn]) => { if (only.length && !only.includes(k)) return; const [L, R, pk, loop] = fn(); save(k, L, R, pk, loop); });
