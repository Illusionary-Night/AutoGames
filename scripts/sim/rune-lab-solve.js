// 符文研究室：窮舉解題器。用法：node scripts/sim/rune-lab-solve.js
// 檢查每關是否可解、解法多寡、是否能靠亂試過關
const E = require('../../games/rune-lab/v1/engine.js');

function spells(runes) {
  let layer = [[]]; const all = [];
  for (let n = 0; n < E.MAXLEN; n++) {
    layer = layer.flatMap(s => runes.map(r => [...s, r]));
    all.push(...layer);
  }
  return all;
}

function analyse(level) {
  const list = spells(level.runes);
  let frontier = new Map([[E.parse(level.map).join(''), { path: [], n: 1 }]]);
  for (let depth = 1; depth <= level.casts; depth++) {
    const next = new Map(); let wins = 0, example = null, total = 0;
    for (const [key, info] of frontier) {
      for (const s of list) {
        const g = E.cast(key.split(''), level.start, s).grid;
        total += info.n;
        if (E.solved(level, g)) { wins += info.n; if (!example) example = [...info.path, s.join('')]; continue; }
        if (depth < level.casts) {
          const k = g.join('');
          const o = next.get(k);
          if (o) o.n += info.n; else next.set(k, { path: [...info.path, s.join('')], n: info.n });
        }
      }
    }
    if (wins) return { solvable: true, minCasts: depth, wins, rate: wins / total, example };
    frontier = next;
  }
  return { solvable: false };
}

if (require.main === module) {
  E.LEVELS.forEach((l, i) => {
    const r = analyse(l);
    console.log(`${i + 1} ${l.name}（上限 ${l.casts} 次）：` + (r.solvable
      ? `最少 ${r.minCasts} 次，解法 ${r.wins}，隨機亂試成功率 ${(r.rate * 100).toFixed(2)}%，例：${r.example.join(' → ')}`
      : '無解'));
  });
}
module.exports = { analyse };
