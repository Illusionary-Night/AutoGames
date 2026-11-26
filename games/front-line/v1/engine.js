// 前線輪替：規則引擎（遊戲畫面與模擬器共用）
(function (root) {
  const P = {
    cols: 5, rows: 4, lives: 3, orders: 1,
    roster: ['atk', 'atk', 'atk', 'def', 'def', 'def', 'spd', 'spd'],
    base: 8, counter: 1.5, fatigueRate: 0.5, rest: 4, trainCap: 3,
    waves: 14, countStart: 0.8, countEnd: 1.8, strStart: 4, strEnd: 11, strRand: 3,
  };
  const BEATS = { atk: 'spd', spd: 'def', def: 'atk' };
  const TYPES = ['atk', 'def', 'spd'];

  function rng(seed) {
    return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }

  function makeWaves(p, R) {
    const waves = [];
    for (let w = 0; w < p.waves; w++) {
      const f = w / (p.waves - 1);
      const mean = p.countStart + (p.countEnd - p.countStart) * f;
      const n = Math.min(p.cols, Math.floor(mean) + (R() < mean % 1 ? 1 : 0));
      const cols = [...Array(p.cols).keys()];
      const wave = [];
      for (let i = 0; i < n; i++) {
        const col = cols.splice(Math.floor(R() * cols.length), 1)[0];
        const str = Math.round(p.strStart + (p.strEnd - p.strStart) * f + R() * p.strRand);
        wave.push({ col, type: TYPES[Math.floor(R() * 3)], str });
      }
      waves.push(wave);
    }
    return waves;
  }

  function newGame(seed, p = P) {
    const s = {
      p, turn: 0, lives: p.lives, kills: 0, over: null, waves: makeWaves(p, rng(seed)),
      soldiers: p.roster.map((type, id) => ({ id, type, base: p.base, fat: 0, train: 0, col: null, dead: false })),
      enemies: [],
    };
    spawn(s);
    return s;
  }

  function clone(s) {
    return { p: s.p, turn: s.turn, lives: s.lives, kills: s.kills, over: s.over, waves: s.waves,
      soldiers: s.soldiers.map(x => ({ ...x })), enemies: s.enemies.map(x => ({ ...x })) };
  }

  function spawn(s) {
    const wave = s.waves[s.turn];
    if (!wave) return;
    for (const e of wave) {
      // 最上排被堵住時往上方排隊（row 為負，畫面外）
      let row = 0;
      while (s.enemies.some(o => o.col === e.col && o.row === row)) row--;
      s.enemies.push({ ...e, row });
    }
  }

  const power = x => Math.max(0, x.base + x.train - x.fat);
  const frontAt = (s, col) => s.soldiers.find(x => !x.dead && x.col === col);

  // 單場交戰預測：不改變狀態
  function duel(p, soldier, enemy) {
    const sp = power(soldier) * (BEATS[soldier.type] === enemy.type ? p.counter : 1);
    const ep = enemy.str * (BEATS[enemy.type] === soldier.type ? p.counter : 1);
    return { sp, ep, win: sp >= ep, fatigue: Math.ceil(ep * p.fatigueRate) };
  }

  // order: { k: 'deploy', s: 士兵id, col } 或 { k: 'withdraw', s: 士兵id }
  function applyOrder(s, o) {
    const x = s.soldiers[o.s];
    if (!x || x.dead) return false;
    if (o.k === 'withdraw') { if (x.col === null) return false; x.col = null; return true; }
    if (x.col !== null || o.col < 0 || o.col >= s.p.cols) return false;
    const cur = frontAt(s, o.col);
    if (cur) cur.col = null; // 換班：原本的人撤下
    x.col = o.col;
    return true;
  }

  // 結束回合：交戰 → 敵人前進 → 後方休整 → 新敵人。回傳事件供畫面播放
  function endTurn(s) {
    if (s.over) return [];
    const p = s.p, events = [], last = p.rows - 1;
    for (const e of s.enemies.filter(e => e.row === last)) {
      const x = frontAt(s, e.col);
      if (!x) { s.lives--; e.gone = true; events.push({ k: 'breach', col: e.col }); continue; }
      const d = duel(p, x, e);
      if (d.win) { x.fat += d.fatigue; e.gone = true; s.kills++; events.push({ k: 'kill', col: e.col, s: x.id }); }
      else {
        const dmg = Math.floor(power(x) / 2);
        x.dead = true; x.col = null; e.str = Math.max(1, e.str - dmg);
        events.push({ k: 'death', col: e.col, s: x.id, dmg });
      }
    }
    s.enemies = s.enemies.filter(e => !e.gone);
    for (const e of s.enemies.slice().sort((a, b) => b.row - a.row)) {
      if (e.row < last && !s.enemies.some(o => o.col === e.col && o.row === e.row + 1)) e.row++;
    }
    for (const x of s.soldiers) {
      if (x.dead || x.col !== null) continue;
      if (x.fat > 0) x.fat = Math.max(0, x.fat - p.rest);
      else x.train = Math.min(p.trainCap, x.train + 1);
    }
    s.turn++;
    spawn(s);
    if (s.lives <= 0) s.over = 'lose';
    else if (s.turn >= p.waves && !s.enemies.length) s.over = 'win';
    return events;
  }

  const api = { P, BEATS, newGame, clone, power, frontAt, duel, applyOrder, endTurn };
  if (typeof module !== 'undefined') module.exports = api; else root.Engine = api;
})(this);
