// 前線輪替：模擬器（代理指標，不代表好不好玩）
// 用法：node scripts/sim/front-line-v2-sim.js [場數]
const E = require('../../games/front-line/v2/engine.js');

function evalState(s) {
  if (s.over === 'lose') return -10000 + s.kills;
  let v = s.lives * 150 + s.kills * 8 + (s.over === 'win' ? 5000 : 0);
  for (const x of s.soldiers) if (!x.dead) v += 30 + E.power(x) * 3;
  // 已到最後一排但沒人擋的敵人
  for (const e of s.enemies) if (e.row === s.p.rows - 1 && !E.frontAt(s, e.col)) v -= 60;
  return v;
}

function legalOrders(s) {
  const out = [];
  for (const x of s.soldiers) {
    if (x.dead) continue;
    if (x.col !== null) out.push({ k: 'withdraw', s: x.id });
    else for (let c = 0; c < s.p.cols; c++) out.push({ k: 'deploy', s: x.id, col: c });
  }
  return out;
}

// 只看本回合：所有 0～2 個指令組合，依回合結束後局面評分
function candidates(s) {
  const list = [];
  const score = (orders, st) => { const n = E.clone(st); E.endTurn(n); list.push({ orders, v: evalState(n) }); };
  score([], s);
  for (const a of legalOrders(s)) {
    const s1 = E.clone(s); E.applyOrder(s1, a); score([a], s1);
    if (s.p.orders < 2) continue;
    for (const b of legalOrders(s1)) {
      if (b.s === a.s) continue;
      const s2 = E.clone(s1); E.applyOrder(s2, b); score([a, b], s2);
    }
  }
  return list.sort((a, b) => b.v - a.v);
}

// 快速版：一次挑一個指令（推演用）
function quick(s) {
  const st = E.clone(s), chosen = [];
  for (let i = 0; i < s.p.orders; i++) {
    const t = E.clone(st); E.endTurn(t);
    let best = null, bv = evalState(t);
    for (const o of legalOrders(st)) {
      const n = E.clone(st); E.applyOrder(n, o); E.endTurn(n);
      const v = evalState(n); if (v > bv) { bv = v; best = o; }
    }
    if (!best) break;
    E.applyOrder(st, best); chosen.push(best);
  }
  return chosen;
}

function play(s, orders) { orders.forEach(o => E.applyOrder(s, o)); E.endTurn(s); }

// 前瞻：取本回合前 BEAM 名，往後推演場上看得到的敵人（不偷看未來波次）
function planner(s, depth = 3, beam = 30) {
  let best = null, bv = -Infinity;
  for (const c of candidates(s).slice(0, beam)) {
    const n = E.clone(s);
    n.waves = n.waves.slice(0, n.turn + 1).concat(Array(Math.max(0, n.p.waves - n.turn - 1)).fill([]));
    play(n, c.orders);
    let sum = evalState(n);
    for (let d = 0; d < depth && !n.over; d++) { play(n, quick(n)); sum += evalState(n); }
    if (sum > bv) { bv = sum; best = c.orders; }
  }
  return best;
}

const policies = {
  random: (s, R) => { const out = [], st = E.clone(s);
    for (let i = 0; i < s.p.orders; i++) { const l = legalOrders(st); const o = l[Math.floor(R() * l.length)]; if (o) { E.applyOrder(st, o); out.push(o); } }
    return out; },
  // 只派人上空位、從不撤下
  static: (s) => quick({ ...s, soldiers: s.soldiers }).filter(o => o.k === 'deploy' && !E.frontAt(s, o.col)),
  myopic: (s) => candidates(s)[0].orders,
  planner: (s) => planner(s),
};

function run(name, p, games) {
  let win = 0, turns = 0, withdraw = 0, diff = 0, dead = 0, seedR = 12345;
  const used = { shield: 0, cav: 0, bow: 0 };
  const R = () => { seedR = (seedR * 48271) % 2147483647; return seedR / 2147483647; };
  for (let g = 0; g < games; g++) {
    const s = E.newGame((p.seedBase || 1000) + g, p);
    while (!s.over && s.turn < 60) {
      const o = policies[name](s, R);
      if (name === 'planner') {
        const a = E.clone(s), b = E.clone(s); o.forEach(x => E.applyOrder(a, x)); policies.myopic(s).forEach(x => E.applyOrder(b, x));
        if (a.soldiers.map(x => x.col).join() !== b.soldiers.map(x => x.col).join()) diff++;
      }
      for (const x of o) {
        const cur = x.k === 'deploy' && E.frontAt(s, x.col);
        if (x.k === 'withdraw' || cur) withdraw++;
        if (x.k === 'deploy') used[s.soldiers[x.s].type]++;
        E.applyOrder(s, x);
      }
      E.endTurn(s); turns++;
    }
    if (s.over === 'win') win++;
    dead += s.soldiers.filter(x => x.dead).length;
  }
  const tot = used.shield + used.cav + used.bow || 1;
  return { share: Object.fromEntries(Object.entries(used).map(([k, v]) => [k, v / tot])), win: win / games, turns: turns / games, withdraw: withdraw / turns, diff: diff / turns, dead: dead / games };
}

// 看結果前定義
const CRITERIA = [
  ['前瞻比只看本回合高 ≥ 25 個百分點', r => r.planner.win - r.myopic.win >= .25],
  ['只看本回合的勝率 10%–55%', r => r.myopic.win >= .10 && r.myopic.win <= .55],
  ['前瞻勝率 55%–90%（有挑戰但可解）', r => r.planner.win >= .55 && r.planner.win <= .90],
  ['亂下勝率 ≤ 5%', r => r.random.win <= .05],
  ['只派人不撤下的勝率 ≤ 15%（輪替是必要的）', r => r.static.win <= .15],
  ['前瞻與只看本回合的選擇不同的回合 ≥ 30%', r => r.planner.diff >= .30],
];

function report(label, p, games, quiet) {
  const r = {};
  for (const k of Object.keys(policies)) r[k] = run(k, p, games);
  const pass = CRITERIA.map(([, f]) => f(r));
  const pc = x => (x * 100).toFixed(0) + '%';
  console.log(`${label} | 亂下 ${pc(r.random.win)} 不撤 ${pc(r.static.win)} 眼前 ${pc(r.myopic.win)} 前瞻 ${pc(r.planner.win)} | 選擇不同 ${pc(r.planner.diff)} 撤換/回合 ${r.planner.withdraw.toFixed(2)} 回合 ${r.planner.turns.toFixed(1)} 陣亡 ${r.planner.dead.toFixed(1)} | ${pass.map((x, i) => (i + 1) + (x ? '✓' : '✗')).join(' ')}`);
  return { r, pass };
}

module.exports = { E, run, report, policies, CRITERIA };

if (require.main === module) report('目前參數', E.P, +process.argv[2] || 100);
