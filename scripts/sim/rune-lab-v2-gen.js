// 符文研究室 v2：限量符文關卡的解題器與生成器
// 用法：node scripts/sim/rune-lab-v2-gen.js verify            驗證遊戲內的關卡
//       node scripts/sim/rune-lab-v2-gen.js gen <施放次數> <符文數> <種子> [秒數]
const E = require('../../games/rune-lab/v2/engine.js');
const RUNES = [...E.ELEMENTS, ...E.ACTIONS];

const count = stock => RUNES.map(r => stock.filter(x => x === r).length);
const seqCache = new Map();
// 由庫存能組出的所有咒語（只留最後一個是動作的：元素放最後沒有效果）
function spells(c) {
  const key = c.join('');
  let out = seqCache.get(key);
  if (out) return out;
  out = [];
  const walk = (s, left) => {
    if (s.length && (s[s.length - 1] === 4 || s[s.length - 1] === 5)) out.push({ s: s.map(i => RUNES[i]), rest: left.slice() });
    if (s.length === E.MAXLEN) return;
    for (let i = 0; i < RUNES.length; i++) if (left[i]) { left[i]--; s.push(i); walk(s, left); s.pop(); left[i]++; }
  };
  walk([], c.slice());
  seqCache.set(key, out);
  return out;
}

// 回傳 [過關排法數, 全部排法數, 一組範例]
function solve(level, stock, casts, stopAtFirst, deadline = Infinity) {
  const memo = new Map();
  function dfs(g, c, left) {
    const key = g.join('') + c.join('') + left;
    let m = memo.get(key);
    if (m) return m;
    if (Date.now() > deadline) throw new Error('timeout');
    let wins = 0, total = 0, ex = null;
    for (const { s, rest } of spells(c)) {
      const n = E.cast(g, level.start, s).grid;
      if (E.solved(level, n)) { wins++; total++; ex = ex || [s.join('')]; }
      else if (left > 1 && rest.some(x => x)) {
        const r = dfs(n, rest, left - 1);
        wins += r[0]; total += r[1]; if (!ex && r[2]) ex = [s.join(''), ...r[2]];
      } else total++;
      if (stopAtFirst && wins) break;
    }
    m = [wins, total || 1, ex];
    memo.set(key, m);
    return m;
  }
  return dfs(E.parse(level.map), count(stock), casts);
}

// 檢查「極限」條件
function check(level, deadline) {
  const { stock, casts } = level;
  if (casts > 1 && solve(level, stock, casts - 1, true, deadline)[0]) return { ok: false, why: '少一次施放也能解' };
  for (const r of new Set(stock)) {
    const less = stock.slice(); less.splice(less.indexOf(r), 1);
    if (solve(level, less, casts, true, deadline)[0]) return { ok: false, why: `少一個「${r}」也能解` };
  }
  const [wins, total, example] = solve(level, stock, casts, false, deadline);
  if (!wins) return { ok: false, why: '無解' };
  return { ok: true, wins, total, rate: wins / total, example };
}

function rng(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

function randomLevel(R, casts, size) {
  const pick = a => a[Math.floor(R() * a.length)];
  const start = { x: 0, y: 2 };
  const g = Array(E.W * E.H).fill('.');
  const free = () => { let i; do { i = Math.floor(R() * g.length); } while (g[i] !== '.' || i === start.y * E.W + start.x); return i; };
  const palette = [pick(['#', 'W', 'G', '~', 'I']), pick(['#', 'W', 'G', '~', 'I']), '#'];
  const blocks = 5 + Math.floor(R() * 8);
  for (let k = 0; k < blocks; k++) g[free()] = pick(palette);
  const goal = pick(['lamps', 'lamps', 'lamps', 'grow', 'nowater']);
  const level = { goal, casts, start };
  if (goal === 'lamps') for (let k = 0; k < 1 + Math.floor(R() * 3); k++) g[free()] = 'L';
  if (goal === 'grow') level.targets = Array.from({ length: 2 + Math.floor(R() * 2) }, () => { const i = free(); g[i] = '.'; return [i % E.W, Math.floor(i / E.W)]; });
  if (goal === 'nowater') for (let k = 0; k < 3 + Math.floor(R() * 3); k++) g[free()] = '~';
  level.map = Array.from({ length: E.H }, (_, y) => g.slice(y * E.W, (y + 1) * E.W).join(''));
  const stock = [pick(E.ELEMENTS), pick(['射', '爆'])];
  while (stock.length < size) stock.push(pick([...E.ELEMENTS, '射', '射', '爆', '躍', '轉', '轉']));
  level.stock = stock.sort((a, b) => RUNES.indexOf(a) - RUNES.indexOf(b));
  return level;
}

if (require.main === module) {
  const [mode, casts, size, seed, secs] = process.argv.slice(2);
  if (mode === 'verify') {
    E.LEVELS.forEach((l, i) => {
      const r = check(l);
      console.log(`${i + 1} ${l.name} 施放${l.casts} 符文${l.stock.join('')}：` +
        (r.ok ? `通過，過關排法 ${r.wins}／${r.total}（${(r.rate * 100).toFixed(3)}%），例 ${r.example.join(' → ')}` : `未過：${r.why}`));
    });
  } else {
    const R = rng(+seed), end = Date.now() + (+secs || 120) * 1000, limit = { 1: .03, 2: .006, 3: .002 }[casts];
    let tried = 0, found = 0;
    while (Date.now() < end) {
      const l = randomLevel(R, +casts, +size); tried++;
      if (l.goal === 'lamps' && !l.map.join('').includes('L')) continue;
      try {
        const r = check(l, Math.min(end, Date.now() + 8000));
        if (r.ok && r.rate <= limit) { found++; console.log(JSON.stringify({ ...l, wins: r.wins, total: r.total, rate: r.rate, example: r.example })); }
      } catch (e) { if (e.message !== 'timeout') throw e; }
    }
    console.error(`casts${casts} size${size} seed${seed}: 試 ${tried}，合格 ${found}`);
  }
}
module.exports = { solve, check };
