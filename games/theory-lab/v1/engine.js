// 魔法理論研究室：規則引擎（遊戲畫面與模擬器共用）
(function (root) {
  const RUNES = ['日', '月', '星', '岩'];
  const VALUES = [1, 2, 3, 4, 5];
  const LEN = 3;
  const BONUS = 4;
  const POS_KINDS = { double: '加倍', invert: '反轉（變成負數）' };
  const LEVELS = {
    E: { name: '見習', budget: 5, pair: false },
    N: { name: '研究員', budget: 9, pair: true },
    H: { name: '大師', budget: 7, pair: true },
  };

  const SPELLS = [];
  for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) for (let c = 0; c < 4; c++) SPELLS.push([a, b, c]);

  // law = { v:[4 個符文數值], pos:位置 0..2, kind:'double'|'invert', pair:null | { a, b, d:+4|-4 } }
  function evaluate(law, spell) {
    let sum = 0;
    for (let i = 0; i < LEN; i++) {
      let x = law.v[spell[i]];
      if (i === law.pos) x = law.kind === 'double' ? x * 2 : -x;
      sum += x;
    }
    if (law.pair) for (let i = 0; i < LEN - 1; i++) if (spell[i] === law.pair.a && spell[i + 1] === law.pair.b) sum += law.pair.d;
    return sum;
  }

  function rng(seed) {
    return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }

  function randomLaw(R, level) {
    const pool = VALUES.slice();
    const v = RUNES.map(() => pool.splice(Math.floor(R() * pool.length), 1)[0]);
    const law = { v, pos: Math.floor(R() * LEN), kind: R() < 0.5 ? 'double' : 'invert', pair: null };
    if (level.pair) law.pair = { a: Math.floor(R() * 4), b: Math.floor(R() * 4), d: R() < 0.5 ? BONUS : -BONUS };
    return law;
  }

  // 考題：沒做過的咒語 5 道，其中盡量包含 2 道會觸發相鄰法則的
  function exam(law, done, R) {
    const used = new Set(done.map(s => s.join('')));
    const pool = SPELLS.filter(s => !used.has(s.join('')));
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const hits = s => law.pair && [0, 1].some(i => s[i] === law.pair.a && s[i + 1] === law.pair.b);
    const picked = pool.filter(hits).slice(0, 2);
    for (const s of pool) if (picked.length < 5 && !hits(s)) picked.push(s);
    return picked;
  }

  const api = { RUNES, VALUES, LEN, BONUS, POS_KINDS, LEVELS, SPELLS, evaluate, rng, randomLaw, exam };
  if (typeof module !== 'undefined') module.exports = api; else root.Engine = api;
})(this);
