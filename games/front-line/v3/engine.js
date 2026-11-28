// 前線輪替 v3（訓練取捨、特殊敵人）：規則引擎（遊戲畫面與模擬器共用）
(function (root) {
  const P = {
    cols: 5, rows: 4, lives: 4, orders: 1,
    roster: ['shield', 'shield', 'shield', 'cav', 'cav', 'cav', 'bow', 'bow'],
    base: { shield: 7, cav: 8, bow: 6 },
    fatigueRate: { shield: 0.25, cav: 0.5, bow: 0.5 },
    charge: 6, shotRange: 2, shotFatigue: 1, rest: 4, trainCap: 3, trainEvery: 3,
    eliteFrom: 4, eliteRate: 0.35, bruteFatigue: 2,
    traits: { shield: true, cav: true, bow: true, train: true }, // 僅供模擬對照時關閉
    sacrifice: true, waves: 14, countStart: 0.8, countEnd: 1.8, strStart: 4, strEnd: 10, strRand: 3,
  };

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
        const kind = w >= p.eliteFrom && R() < p.eliteRate ? (R() < 0.5 ? 'armor' : 'brute') : 'normal';
        wave.push({ col, str, kind });
      }
      waves.push(wave);
    }
    return waves;
  }

  function newGame(seed, p = P) {
    const s = {
      p, turn: 0, lives: p.lives, kills: 0, over: null, waves: makeWaves(p, rng(seed)),
      soldiers: p.roster.map((type, id) => ({ id, type, base: p.base[type], fat: 0, train: 0, col: null, dead: false, fresh: false, prog: 0 })),
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

  // 單場近戰預測：不改變狀態。騎兵剛上陣的第一場有衝鋒加成
  function duel(p, soldier, enemy) {
    const charge = soldier.type === 'cav' && soldier.fresh && p.traits.cav ? p.charge : 0;
    const sp = power(soldier) + charge, ep = enemy.str;
    const rate = soldier.type === 'shield' && !p.traits.shield ? p.fatigueRate.cav : p.fatigueRate[soldier.type];
    return { sp, ep, charge, win: sp >= ep, fatigue: Math.ceil(ep * rate * (enemy.kind === 'brute' ? p.bruteFatigue : 1)), left: Math.max(1, ep - Math.floor(sp / 2)) };
  }

  // 弓兵本回合會射到的敵人：同欄最近、尚未接觸、在射程內
  function shotTarget(s, x) {
    if (x.type !== 'bow' || !s.p.traits.bow || x.col === null || !power(x)) return null;
    const last = s.p.rows - 1;
    return s.enemies.filter(e => e.col === x.col && !e.gone && e.kind !== 'armor' && e.row < last && e.row >= last - s.p.shotRange)
      .sort((a, b) => b.row - a.row)[0] || null;
  }

  // 假設之後都不下指令，這名士兵在該欄會發生什麼（不偷看未出現的敵人）
  function forecast(s, id, col) {
    const n = clone(s);
    n.waves = []; n.lives = 99; n.over = null;
    const x = n.soldiers[id];
    if (x.col !== col) applyOrder(n, { k: 'deploy', s: id, col });
    const out = [];
    for (let t = 1; t <= n.p.rows + 1; t++) {
      for (const ev of endTurn(n)) {
        if (ev.s !== id) continue;
        out.push({ ...ev, turn: t });
        if (ev.k === 'kill' || ev.k === 'death') return out;
      }
      n.over = null;
    }
    return out;
  }

  // order: { k: 'deploy', s: 士兵id, col } 或 { k: 'withdraw', s: 士兵id }
  function applyOrder(s, o) {
    const x = s.soldiers[o.s];
    if (!x || x.dead) return false;
    if (o.k === 'withdraw') { if (x.col === null) return false; x.col = null; x.fresh = false; return true; }
    if (x.col !== null || o.col < 0 || o.col >= s.p.cols) return false;
    const cur = frontAt(s, o.col);
    if (cur) { cur.col = null; cur.fresh = false; } // 換班：原本的人撤下
    x.col = o.col; x.fresh = true;
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
      x.fresh = false;
      if (d.win) { x.fat += d.fatigue; e.gone = true; s.kills++; events.push({ k: 'kill', col: e.col, s: x.id, fatigue: d.fatigue }); }
      else {
        const dmg = e.str - d.left;
        x.dead = true; x.col = null; e.str = d.left;
        events.push({ k: 'death', col: e.col, s: x.id, dmg, left: d.left });
      }
    }
    for (const x of s.soldiers) {
      if (x.dead) continue;
      const e = shotTarget(s, x);
      if (!e) continue;
      const dmg = Math.floor(power(x) / 2);
      e.str -= dmg; x.fat += p.shotFatigue;
      if (e.str <= 0) { e.gone = true; s.kills++; }
      events.push({ k: 'shot', col: x.col, s: x.id, dmg, left: Math.max(0, e.str) });
    }
    s.enemies = s.enemies.filter(e => !e.gone);
    for (const e of s.enemies.slice().sort((a, b) => b.row - a.row)) {
      if (e.row < last && !s.enemies.some(o => o.col === e.col && o.row === e.row + 1)) e.row++;
    }
    for (const x of s.soldiers) {
      if (x.dead || x.col !== null) continue;
      if (x.fat > 0) x.fat = Math.max(0, x.fat - p.rest);
      else if (p.traits.train && x.train < p.trainCap && ++x.prog >= p.trainEvery) { x.train++; x.prog = 0; }
    }
    s.turn++;
    spawn(s);
    if (s.lives <= 0) s.over = 'lose';
    else if (s.turn >= p.waves && !s.enemies.length) s.over = 'win';
    return events;
  }

  const api = { P, newGame, clone, power, frontAt, duel, shotTarget, forecast, applyOrder, endTurn };
  if (typeof module !== 'undefined') module.exports = api; else root.Engine = api;
})(this);
