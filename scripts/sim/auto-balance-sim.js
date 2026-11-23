// 流動平衡：規則模擬器（代理指標，不代表好不好玩）
// 用法：node scripts/sim/auto-balance-sim.js [N]
// 評估標準在看結果前定義，見 games/auto-balance/README.md「自我迭代」。

function rng(seed) { // mulberry32，可重現
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

const UNITS = [
  { id: 'a1', t: 'atk', b: 8 }, { id: 'a2', t: 'atk', b: 6 },
  { id: 'd1', t: 'def', b: 8 }, { id: 'd2', t: 'def', b: 6 },
  { id: 's1', t: 'spd', b: 8 }, { id: 's2', t: 'spd', b: 6 },
];
const BEATS = { atk: 'spd', spd: 'def', def: 'atk' };
const by = id => UNITS.find(u => u.id === id);

const V1 = { delta: .15, idle: .05, counter: 1.4, aiNoise: [.5, 1.0], win: 4, rounds: 7, min: .5, max: 1.8 };

function laneScore(a, b, m, P) { return a.b * m[a.id] * (BEATS[a.t] === b.t ? P.counter : 1); }

// ---- 玩家策略 ----
const eff = (m) => (u) => u.b * m[u.id];
const strategies = {
  random: (m, r, R) => UNITS.map(u => u.id).sort(() => R() - .5).slice(0, 3),
  topEff: (m) => UNITS.slice().sort((a, b) => eff(m)(b) - eff(m)(a)).slice(0, 3).map(u => u.id),
  // 讀倍率並考慮剋制：預測對手偏好高有效強度單位，選期望分數差最大的三個
  counterAware: (m, r, R, P) => {
    const opp = UNITS.slice().sort((a, b) => eff(m)(b) - eff(m)(a)).slice(0, 4);
    const score = u => opp.reduce((s, o) => s + laneScore(u, o, m, P) - laneScore(o, u, m, P), 0);
    return UNITS.slice().sort((a, b) => score(b) - score(a)).slice(0, 3).map(u => u.id);
  },
};

function playGame(P, strat, R) {
  const m = {}; UNITS.forEach(u => m[u.id] = 1);
  let me = 0, ai = 0, r = 0; const hist = [], mm = []; let edge = 0, cnt = 0;
  while (me < P.win && ai < P.win && r < P.rounds) {
    r++;
    const [lo, span] = P.aiNoise;
    const oppIds = UNITS.map(u => ({ id: u.id, s: u.b * m[u.id] * (lo + R() * span) })).sort((a, b) => b.s - a.s)
      .slice(0, 3).map(x => x.id).sort(() => R() - .5);
    const mine = strat(m, r, R, P);
    hist.push(mine.slice().sort().join(''));
    const d = {}; UNITS.forEach(u => d[u.id] = 0); const used = new Set(); let w = 0, l = 0;
    mine.forEach((id, i) => {
      const a = by(id), b = by(oppIds[i]);
      const x = laneScore(a, b, m, P), y = laneScore(b, a, m, P);
      used.add(a.id); used.add(b.id);
      if (Math.abs(x - y) < .005) return;
      if (x > y) { w++; d[a.id] -= P.delta; d[b.id] += P.delta; } else { l++; d[a.id] += P.delta; d[b.id] -= P.delta; }
    });
    if (w >= 2) me++; else if (l >= 2) ai++;
    UNITS.forEach(u => {
      if (!used.has(u.id)) d[u.id] += P.idle;
      m[u.id] = Math.min(P.max, Math.max(P.min, Math.round((m[u.id] + d[u.id]) * 100) / 100));
      cnt++; if (m[u.id] <= P.min + .001 || m[u.id] >= P.max - .001) edge++;
    });
  }
  return { res: me > ai ? 1 : me < ai ? -1 : 0, rounds: r, hist, edge: edge / cnt };
}

function evaluate(P, N = 8000, seed = 1) {
  const R = rng(seed), out = {};
  for (const [k, s] of Object.entries(strategies)) {
    let w = 0, l = 0, rounds = 0, edge = 0;
    for (let i = 0; i < N; i++) { const g = playGame(P, s, R); if (g.res > 0) w++; if (g.res < 0) l++; rounds += g.rounds; edge += g.edge; }
    out[k] = { win: w / N, lose: l / N, rounds: rounds / N, edge: edge / N };
  }
  // 最佳固定組合（20 種三選一，順序固定）
  let best = 0, bestKey = '';
  const ids = UNITS.map(u => u.id);
  for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) for (let k = j + 1; k < 6; k++) {
    const set = [ids[i], ids[j], ids[k]]; let w = 0;
    for (let n = 0; n < N / 4; n++) if (playGame(P, () => set, R).res > 0) w++;
    const wr = w / (N / 4); if (wr > best) { best = wr; bestKey = set.join(','); }
  }
  out.bestFixed = { win: best, key: bestKey };
  // 讀倍率玩家的選擇多樣性：每場不同組合數
  let uniq = 0; const G = 2000;
  for (let i = 0; i < G; i++) uniq += new Set(playGame(P, strategies.counterAware, R).hist).size;
  out.diversity = uniq / G;
  return out;
}

// 事先定義的標準
const CRITERIA = [
  ['最佳固定組合勝率 ≤ 55%（沒有固定最佳解）', o => o.bestFixed.win <= .55],
  ['隨機選勝率 ≥ 30%（新手有機會）', o => o.random.win >= .30],
  ['會讀剋制與倍率的玩家比隨機高 ≥ 25 個百分點', o => o.counterAware.win - o.random.win >= .25],
  ['平均回合數在 4.5 到 6.5', o => o.counterAware.rounds >= 4.5 && o.counterAware.rounds <= 6.5],
  ['倍率撞到上下限的比例 ≤ 10%', o => o.counterAware.edge <= .10],
];

function report(name, P, N) {
  const o = evaluate(P, N);
  const pass = CRITERIA.map(([t, f]) => f(o));
  const pc = x => (x * 100).toFixed(1) + '%';
  console.log(`\n== ${name} ${JSON.stringify(P)}`);
  console.log(` 隨機 ${pc(o.random.win)} | topEff ${pc(o.topEff.win)} | 剋制感知 ${pc(o.counterAware.win)} | 最佳固定 ${pc(o.bestFixed.win)} (${o.bestFixed.key})`);
  console.log(` 回合數 ${o.counterAware.rounds.toFixed(2)} | 撞邊界 ${pc(o.counterAware.edge)} | 剋制感知每場不同組合數 ${o.diversity.toFixed(2)}`);
  console.log(' 標準：' + pass.map((p, i) => `${i + 1}${p ? '✓' : '✗'}`).join(' ') + `  (${pass.filter(Boolean).length}/${CRITERIA.length})`);
  return { o, pass };
}

module.exports = { V1, report, evaluate, CRITERIA };

if (require.main === module) {
  const N = +process.argv[2] || 6000;
  report('v1', V1, N);
}
