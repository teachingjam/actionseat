// 자리 배정 알고리즘
// 목표: 교사의 비밀 조건을 모두 지키면서, 최종 순위가 캐릭터 능력치 기반의 '자연스러운 순위'와 최대한 비슷하도록.
// 결과: 순위 k등 = 사용된 자리 중 k번째로 작은 번호의 자리 → 학생 눈에는 '등수대로 자리에 앉는' 것으로 보임.
(function () {
  // seats: [{id, r, c, num}], students: [{id, name, score}]
  // rules: [{type:'avoid'|'together'|'fixed'|'front'|'back', a, b, seat, rows}]
  // opts: {avoidScope:'side'|'cross'|'all'}
  function solve(seats, students, rules, opts) {
    opts = opts || {};
    const S = seats.slice().sort((x, y) => x.num - y.num); // 번호 순
    const N = students.length, M = S.length;
    if (N === 0) return { order: [], seatOf: {}, violations: [], cost: 0 };
    if (N > M) throw new Error(`책상(${M}개)보다 학생(${N}명)이 많아요. 책상을 더 추가해 주세요.`);

    const idx = {}; students.forEach((s, i) => { idx[s.id] = i; });
    const freeRank = students.map(s => !!s.free);
    // free 학생을 뺀 자연 순위
    const NNF = freeRank.filter(f => !f).length;
    const naturalNF = new Array(students.length).fill(0);
    students.map((s, i) => [s.score, i]).filter(([, i]) => !freeRank[i]).sort((a, b) => b[0] - a[0]).forEach(([, i], r) => { naturalNF[i] = r; });
    // 자연 순위 (점수 내림차순)
    const natural = new Array(N);
    students.map((s, i) => [s.score, i]).sort((a, b) => b[0] - a[0]).forEach(([, i], r) => { natural[i] = r; });

    // 행 정보 (앞 = r 작은 쪽)
    const rowsSorted = Array.from(new Set(S.map(s => s.r))).sort((a, b) => a - b);
    const rowRank = {}; rowsSorted.forEach((r, i) => { rowRank[r] = i; });
    const rowsTotal = rowsSorted.length;

    // 짝 = 짝 방향(opts.pairDir: 'h' 좌우 / 'v' 앞뒤)으로 바로 붙은 책상
    const vPair = opts.pairDir === 'v';
    function adjSide(a, b) { return vPair ? (a.c === b.c && Math.abs(a.r - b.r) === 1) : (a.r === b.r && Math.abs(a.c - b.c) === 1); }
    function adjScope(a, b) {
      const dr = Math.abs(a.r - b.r), dc = Math.abs(a.c - b.c);
      if (opts.avoidScope === 'all') return dr <= 1 && dc <= 1 && (dr + dc > 0);
      if (opts.avoidScope === 'cross') return dr + dc === 1;
      return adjSide(a, b);
    }

    const R = [];
    const pinned = new Map(); // student index -> seat index
    (rules || []).forEach(rule => {
      const a = idx[rule.a], b = idx[rule.b];
      if (rule.type === 'fixed') {
        if (a === undefined) return;
        const si = S.findIndex(s => s.num === +rule.seat);
        if (si >= 0) pinned.set(a, si);
        return;
      }
      if ((rule.type === 'avoid' || rule.type === 'together') && (a === undefined || b === undefined || a === b)) return;
      if ((rule.type === 'front' || rule.type === 'back') && a === undefined) return;
      R.push(Object.assign({}, rule, { ai: a, bi: b }));
    });
    // 같은 자리에 두 명 고정된 경우 뒤의 것 무시
    const usedPins = new Set();
    for (const [st, si] of Array.from(pinned.entries())) {
      if (usedPins.has(si)) pinned.delete(st); else usedPins.add(si);
    }

    const W_HARD = 10000, W_TOGETHER = 4000, W_ZONE = 6000, W_TAIL = 300, W_IDX = 4;
    const baseIdx = NNF * (NNF - 1) / 2 * W_IDX; // 빈자리 없이 앞에서부터 채웠을 때의 기본값

    function evaluate(seatOf, detail) {
      let cost = 0;
      const viol = detail ? [] : null;
      for (const rule of R) {
        if (rule.type === 'avoid') {
          if (adjScope(S[seatOf[rule.ai]], S[seatOf[rule.bi]])) { cost += W_HARD; if (viol) viol.push(rule); }
        } else if (rule.type === 'together') {
          if (!adjSide(S[seatOf[rule.ai]], S[seatOf[rule.bi]])) { cost += W_TOGETHER; if (viol) viol.push(rule); }
        } else if (rule.type === 'front') {
          if (rowRank[S[seatOf[rule.ai]].r] >= (+rule.rows || 1)) { cost += W_ZONE; if (viol) viol.push(rule); }
        } else if (rule.type === 'back') {
          if (rowRank[S[seatOf[rule.ai]].r] < rowsTotal - (+rule.rows || 1)) { cost += W_ZONE; if (viol) viol.push(rule); }
        }
      }
      // 순위 자연스러움: 사용된 자리의 번호 순서 = 순위
      const used = seatOf.map((si, st) => [si, st]).sort((a, b) => a[0] - b[0]);
      // free(짝꿍으로 뽑힌 학생)는 자리 번호와 무관하게 옆자리 조건만 따르고, 다른 학생의 순서·빈자리 계산에서도 투명하게 취급
      for (let r = 0, k = 0, fb = 0; r < used.length; r++) {
        if (freeRank[used[r][1]]) { fb++; continue; }
        const nr = naturalNF[used[r][1]], d = k++ - nr;
        cost += d * d * (nr < 3 ? 3 : 1); // 1~3등은 자기 등수 자리를 더 우선
        const eff = used[r][0] - fb;
        if (eff >= NNF) cost += W_TAIL;  // 빈자리는 뒤쪽 번호에 남기기
        cost += eff * W_IDX;             // 빈자리가 생기면 되도록 큰 번호 쪽에
      }
      return detail ? { cost, viol } : cost;
    }

    function initial() {
      const seatOf = new Array(N).fill(-1);
      const taken = new Set();
      pinned.forEach((si, st) => { seatOf[st] = si; taken.add(si); });
      const order = natural.map((r, st) => [r, st]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
      // 짝으로 뽑힌(free) 학생은 고른 사람 자리 옆에 같이 앉힘
      const partnerOf = {}, isPartner = new Set();
      togetherR.forEach(r => {
        if (freeRank[r.bi] && !freeRank[r.ai]) { partnerOf[r.ai] = r.bi; isPartner.add(r.bi); }
        else if (freeRank[r.ai] && !freeRank[r.bi]) { partnerOf[r.bi] = r.ai; isPartner.add(r.ai); }
      });
      for (const st of order) {
        if (seatOf[st] >= 0 || isPartner.has(st)) continue;
        const p = partnerOf[st];
        let si = -1;
        if (p !== undefined && seatOf[p] < 0) {
          for (let k = 0; k < M; k++) if (!taken.has(k) && sideNbr[k].some(j => !taken.has(j))) { si = k; break; }
        }
        if (si < 0) { si = 0; while (taken.has(si)) si++; }
        seatOf[st] = si; taken.add(si);
        if (p !== undefined && seatOf[p] < 0) {
          const j = sideNbr[si].find(x => !taken.has(x));
          if (j !== undefined) { seatOf[p] = j; taken.add(j); }
        }
      }
      for (const st of order) {
        if (seatOf[st] >= 0) continue;
        let si = 0; while (taken.has(si)) si++;
        seatOf[st] = si; taken.add(si);
      }
      return seatOf;
    }

    // 짝 만들기(together): 한 명만 옮기면 잠깐 조건이 깨져서 잘 안 바뀌므로, 짝을 옆자리로 같이 붙여 주는 보정
    const sideNbr = S.map(a => S.map((b, j) => adjSide(a, b) ? j : -1).filter(j => j >= 0));
    const togetherR = R.filter(r => r.type === 'together');
    function fixPairs(seatOf) {
      const occ = new Array(M).fill(-1);
      seatOf.forEach((si, st) => { occ[si] = st; });
      togetherR.forEach(rule => {
        let a = rule.ai, b = rule.bi;
        if (adjSide(S[seatOf[a]], S[seatOf[b]])) return;
        if (pinned.has(b) && !pinned.has(a)) { const t = a; a = b; b = t; }
        if (pinned.has(b)) return;
        const opts = sideNbr[seatOf[a]].filter(j => occ[j] < 0 || !pinned.has(occ[j]));
        if (!opts.length) return;
        const j = opts.find(x => occ[x] < 0) != null ? opts.find(x => occ[x] < 0) : opts[0];
        const o = occ[j], sb = seatOf[b];
        seatOf[b] = j; occ[j] = b;
        if (o >= 0) { seatOf[o] = sb; occ[sb] = o; } else occ[sb] = -1;
      });
      return seatOf;
    }

    const free = []; for (let i = 0; i < N; i++) if (!pinned.has(i)) free.push(i);
    let best = null, bestCost = Infinity;
    const restarts = 6, iters = 30000 + N * 600;
    for (let run = 0; run < restarts; run++) {
      const seatOf = initial();
      if (run > 0) { // 무작위 섞기로 다른 출발점
        for (let k = 0; k < N; k++) {
          const a = free[Math.floor(Math.random() * free.length)], b = free[Math.floor(Math.random() * free.length)];
          if (a !== undefined && b !== undefined) { const t = seatOf[a]; seatOf[a] = seatOf[b]; seatOf[b] = t; }
        }
      }
      fixPairs(seatOf);
      const occupant = new Array(M).fill(-1);
      seatOf.forEach((si, st) => { occupant[si] = st; });
      let cur = evaluate(seatOf);
      if (cur < bestCost) { bestCost = cur; best = seatOf.slice(); } // 출발점(특히 짝을 미리 붙인 첫 배치)이 가장 좋을 수도 있음
      let T = 3000;
      const cool = Math.pow(0.02 / T, 1 / iters);
      for (let it = 0; it < iters && free.length; it++, T *= cool) {
        // 짝 한 쌍을 통째로 다른 옆자리 쌍으로 옮겨 보기
        if (togetherR.length && Math.random() < 0.15) {
          const rule = togetherR[Math.floor(Math.random() * togetherR.length)];
          const a = rule.ai, b = rule.bi;
          if (pinned.has(a) || pinned.has(b)) continue;
          const ta = Math.floor(Math.random() * M), nb = sideNbr[ta];
          if (!nb.length) continue;
          const tb = nb[Math.floor(Math.random() * nb.length)];
          const oa = occupant[ta], ob = occupant[tb];
          if ((oa >= 0 && oa !== a && oa !== b && pinned.has(oa)) || (ob >= 0 && ob !== a && ob !== b && pinned.has(ob))) continue;
          const snap = seatOf.slice();
          const place = (st, target) => { const o = occupant[target], from = seatOf[st]; if (o === st) return; seatOf[st] = target; occupant[target] = st; if (o >= 0) { seatOf[o] = from; occupant[from] = o; } else occupant[from] = -1; };
          place(a, ta); place(b, tb);
          const nc = evaluate(seatOf);
          if (nc <= cur || Math.random() < Math.exp((cur - nc) / T)) { cur = nc; if (cur < bestCost) { bestCost = cur; best = seatOf.slice(); } }
          else { snap.forEach((si, st) => { seatOf[st] = si; }); occupant.fill(-1); seatOf.forEach((si, st) => { occupant[si] = st; }); }
          continue;
        }
        const a = free[Math.floor(Math.random() * free.length)];
        const target = Math.floor(Math.random() * M);
        const b = occupant[target];
        if (b === a || (b >= 0 && pinned.has(b))) continue;
        const sa = seatOf[a];
        // 이동/교환
        seatOf[a] = target; occupant[target] = a;
        if (b >= 0) { seatOf[b] = sa; occupant[sa] = b; } else occupant[sa] = -1;
        const nc = evaluate(seatOf);
        if (nc <= cur || Math.random() < Math.exp((cur - nc) / T)) {
          cur = nc;
          if (cur < bestCost) { bestCost = cur; best = seatOf.slice(); }
        } else { // 되돌리기
          seatOf[a] = sa; occupant[sa] = a;
          if (b >= 0) { seatOf[b] = target; occupant[target] = b; } else occupant[target] = -1;
        }
      }
      if (cur < bestCost) { bestCost = cur; best = seatOf.slice(); }
      if (bestCost - baseIdx < 1) break; // 완벽하면 그만
    }

    const det = evaluate(best, true);
    const used = best.map((si, st) => [si, st]).sort((a, b) => a[0] - b[0]);
    const order = used.map(([si, st], r) => ({ id: students[st].id, rank: r + 1, seat: S[si].num, seatId: S[si].id, naturalRank: natural[st] + 1 }));
    const seatOf = {}; order.forEach(o => { seatOf[o.id] = o.seat; });
    return { order, seatOf, violations: det.viol, cost: det.cost - baseIdx };
  }

  // 능력치 → 결승전 모드별 점수 (약간의 운 요소 포함)
  function scoreFor(mode, stats, rng) {
    const s = stats || {};
    const r = (rng || Math.random)() * 8;
    if (mode === 'race') return (s.agi || 0) * 1.5 + (s.str || 0) * 0.6 + (s.vit || 0) * 0.6 + (s.luk || 0) * 0.9 + (s.int || 0) * 0.4 + r;
    return (s.str || 0) * 1.2 + (s.int || 0) * 1.2 + (s.vit || 0) * 1.0 + (s.agi || 0) * 0.5 + (s.luk || 0) * 0.6 + r;
  }

  window.Solver = { solve, scoreFor };
})();
