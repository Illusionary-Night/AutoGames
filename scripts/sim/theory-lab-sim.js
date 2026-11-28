// 魔法理論研究室：模擬器。用法：node scripts/sim/theory-lab-sim.js [局數]
// 模擬研究者都能完美推理（保留所有符合實驗結果的理論），差別只在怎麼挑實驗
const E = require('../../games/theory-lab/v1/engine.js');

function allLaws(level) {
  const out = [];
  const perm = (v) => {
    if (v.length === 4) {
      for (let pos = 0; pos < 3; pos++) for (const kind of ['double', 'invert']) {
        if (!level.pair) out.push({ v, pos, kind, pair: null });
        else for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) for (const d of [E.BONUS, -E.BONUS]) out.push({ v, pos, kind, pair: { a, b, d } });
      }
      return;
    }
    for (const x of E.VALUES) if (!v.includes(x)) perm([...v, x]);
  };
  perm([]);
  return out;
}

// 挑能把剩餘理論分得最平均（資訊量最大）的實驗
function bestSpell(cands, laws, table, done) {
  const step = Math.max(1, Math.floor(cands.length / 1500));
  let best = -1, bh = -1;
  for (let s = 0; s < 64; s++) {
    if (done.has(s)) continue;
    const count = new Map(); let n = 0;
    for (let i = 0; i < cands.length; i += step) { const r = table[cands[i] * 64 + s]; count.set(r, (count.get(r) || 0) + 1); n++; }
    let h = 0; for (const c of count.values()) h -= (c / n) * Math.log2(c / n);
    if (h > bh) { bh = h; best = s; }
  }
  return best;
}

function run(key, games) {
  const level = E.LEVELS[key], laws = allLaws(level);
  const table = new Int8Array(laws.length * 64);
  laws.forEach((l, i) => E.SPELLS.forEach((s, j) => table[i * 64 + j] = E.evaluate(l, s)));
  const out = { laws: laws.length };
  for (const policy of ['smart', 'random']) {
    const R = E.rng(11);
    let pass = 0, certain = 0, need = 0;
    for (let g = 0; g < games; g++) {
      const truth = Math.floor(R() * laws.length);
      let cands = laws.map((_, i) => i); const done = new Set(); let solvedAt = 0;
      for (let t = 1; t <= 30 && !solvedAt; t++) {
        let s;
        if (policy === 'smart') s = bestSpell(cands, laws, table, done);
        else do s = Math.floor(R() * 64); while (done.has(s));
        done.add(s);
        const r = table[truth * 64 + s];
        cands = cands.filter(i => table[i * 64 + s] === r);
        // 是否所有剩餘理論對全部咒語預測一致
        const first = cands[0];
        if (cands.every(i => { for (let j = 0; j < 64; j++) if (table[i * 64 + j] !== table[first * 64 + j]) return false; return true; })) solvedAt = t;
        if (t === level.budget) {
          // 用完額度時，從剩餘理論任選一個發表
          const guess = cands[Math.floor(R() * cands.length)];
          const qs = E.exam(laws[truth], [...done].map(i => E.SPELLS[i]), R);
          if (qs.every(q => E.evaluate(laws[guess], q) === E.evaluate(laws[truth], q))) pass++;
        }
      }
      if (solvedAt && solvedAt <= level.budget) { certain++; if (solvedAt < level.budget) { /* 提早確定也算通過 */ const had = done.size >= level.budget; if (!had) pass++; } }
      need += solvedAt || 31;
    }
    out[policy] = { pass: pass / games, certain: certain / games, need: need / games };
  }
  return out;
}

if (require.main === module) {
  const games = +process.argv[2] || 150;
  for (const k of Object.keys(E.LEVELS)) {
    const r = run(k, games), L = E.LEVELS[k], p = x => (x * 100).toFixed(0) + '%';
    console.log(`${L.name}（理論 ${r.laws} 種，實驗 ${L.budget} 次）| 會設計實驗：平均 ${r.smart.need.toFixed(1)} 次確定，額度內確定 ${p(r.smart.certain)}，通過 ${p(r.smart.pass)} | 隨機實驗：平均 ${r.random.need.toFixed(1)} 次，確定 ${p(r.random.certain)}，通過 ${p(r.random.pass)}`);
  }
}
