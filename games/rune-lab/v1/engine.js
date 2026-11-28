// 符文研究室：規則引擎（遊戲畫面與解題器共用）
(function (root) {
  const W = 7, H = 5, MAXLEN = 4;
  const ELEMENTS = ['火', '水', '風', '土'];
  const ACTIONS = ['射', '爆', '躍', '轉'];
  const FUSIONS = { '火風': '烈焰', '火土': '熔岩', '火水': '蒸氣', '水風': '寒霜', '水土': '生機' };
  const TILE = { '.': '空地', '#': '石', 'W': '木', 'G': '草', '~': '水', 'I': '冰', 'L': '暗燈', 'O': '亮燈' };
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

  function mix(cur, add) {
    if (!cur || cur === add) return add;
    return FUSIONS[cur + add] || FUSIONS[add + cur] || add;
  }

  const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const around = i => DIRS.map(([dx, dy]) => [i % W + dx, Math.floor(i / W) + dy]).filter(([x, y]) => inside(x, y)).map(([x, y]) => y * W + x);

  // 一種元素作用在一格上。g 是長度 W*H 的陣列，會被修改
  function react(g, i, el, changes) {
    const set = (j, to) => { if (g[j] !== to) { changes.push({ i: j, el, from: g[j], to }); g[j] = to; } };
    const t = g[i];
    const burn = fuel => { // 延燒相連的可燃物，點亮旁邊的燈
      const stack = [i], seen = new Set([i]);
      while (stack.length) {
        const j = stack.pop();
        set(j, '.');
        for (const k of around(j)) {
          if (g[k] === 'L') set(k, 'O');
          if (!seen.has(k) && fuel.includes(g[k])) { seen.add(k); stack.push(k); }
        }
      }
    };
    switch (el) {
      case '火':
        if (t === 'G') burn('G'); else if (t === 'W') set(i, '.'); else if (t === 'L') set(i, 'O'); else if (t === 'I') set(i, '~');
        break;
      case '烈焰':
        if (t === 'G' || t === 'W') burn('GW'); else if (t === 'L') set(i, 'O'); else if (t === 'I') set(i, '~');
        break;
      case '水': if (t === 'O') set(i, 'L'); break;
      case '風':
        if (t === 'O') set(i, 'L');
        else if (t === 'G') for (const k of around(i)) if (g[k] === '.') set(k, 'G');
        break;
      case '土': if (t === '.') set(i, '#'); else if (t === '~') set(i, '.'); break;
      case '熔岩': if (t === '#' || t === 'G' || t === 'W') set(i, '.'); else if (t === '~') set(i, '#'); else if (t === 'I') set(i, '~'); break;
      case '蒸氣': if (t === '~' || t === 'I') set(i, '.'); break;
      case '寒霜': if (t === '~') set(i, 'I'); else if (t === 'O') set(i, 'L'); break;
      case '生機': if (t === '.' || t === '~') set(i, 'G'); break;
    }
  }

  // 施放一個咒語，回傳新地圖與每一步（供畫面播放與研究筆記）
  function cast(grid, start, spell) {
    const g = grid.slice(), steps = [];
    let x = start.x, y = start.y, d = 0, el = null;
    for (const r of spell) {
      const step = { rune: r, changes: [], hit: [], fused: null };
      if (ELEMENTS.includes(r)) {
        const next = mix(el, r);
        if (el && el !== r) step.fused = { a: el, b: r, out: next };
        el = next;
      } else if (r === '轉') d = (d + 1) % 4;
      else if (r === '躍') {
        for (let n = 0; n < 2; n++) if (inside(x + DIRS[d][0], y + DIRS[d][1])) { x += DIRS[d][0]; y += DIRS[d][1]; }
      } else if (r === '射') {
        step.path = [];
        // 停在物體上時射不出去（物體被消除後才能繼續飛）；法師腳下例外
        const stuck = () => g[y * W + x] !== '.' && !(x === start.x && y === start.y);
        while (!stuck() && inside(x + DIRS[d][0], y + DIRS[d][1])) {
          x += DIRS[d][0]; y += DIRS[d][1]; step.path.push(y * W + x);
          if (g[y * W + x] !== '.') break;
        }
        if (el) { step.hit = [y * W + x]; react(g, y * W + x, el, step.changes); }
      } else if (r === '爆' && el) {
        const c = y * W + x, cells = [c, ...around(c)];
        step.hit = cells;
        // 以施放瞬間的地圖決定每格反應，避免剛生成的東西被同一次爆炸再處理
        const before = g.slice();
        for (const i of cells) if (g[i] === before[i]) react(g, i, el, step.changes);
      }
      Object.assign(step, { x, y, d, el, grid: g.slice() });
      steps.push(step);
    }
    return { grid: g, steps };
  }

  const parse = rows => rows.join('').split('');
  function solved(level, g) {
    if (level.goal === 'lamps') return !g.includes('L');
    if (level.goal === 'nowater') return !g.includes('~');
    if (level.goal === 'grow') return level.targets.every(([x, y]) => g[y * W + x] === 'G');
    return false;
  }

  const ALL = ['火', '水', '風', '土', '射', '爆', '躍', '轉'];
  const LEVELS = [
    { name: '初次點燈', goal: 'lamps', casts: 1, runes: ['火', '射'], start: { x: 0, y: 2 },
      hint: '元素決定「是什麼」，動作決定「怎麼放」。順序有差。',
      map: ['.......', '.......', '.....L.', '.......', '.......'] },
    { name: '轉角', goal: 'lamps', casts: 1, runes: ['火', '射', '轉'], start: { x: 1, y: 0 },
      hint: '「轉」讓咒語順時針轉向。法師一開始面向右邊。',
      map: ['.......', '.......', '.......', '.L.....', '.......'] },
    { name: '石牆', goal: 'lamps', casts: 2, runes: ['火', '土', '射', '躍'], start: { x: 0, y: 2 },
      hint: '可以越過牆，也可以想辦法讓牆消失。兩個元素放在一起會怎樣？',
      map: ['...#...', '...#...', '...#.L.', '...#...', '...#...'] },
    { name: '野火', goal: 'lamps', casts: 1, runes: ['火', '風', '射', '躍'], start: { x: 0, y: 2 },
      hint: '火會沿著草蔓延，燒到燈旁邊就能點亮。木頭需要更猛的火。',
      map: ['.......', '...WGL.', '.G.G...', '.GGG...', '.......'] },
    { name: '寒潭', goal: 'nowater', casts: 1, runes: ['水', '風', '土', '射', '爆'], start: { x: 0, y: 2 },
      hint: '目標是讓地圖上沒有水。「爆」會影響周圍一圈。',
      map: ['.......', '....~..', '....~~.', '....~..', '.......'] },
    { name: '花園', goal: 'grow', targets: [[4, 1], [4, 2], [4, 3]], casts: 2, runes: ALL, start: { x: 0, y: 2 },
      hint: '讓虛線格長出草。哪兩種元素能帶來生命？',
      map: ['.......', '.....#.', '.....#.', '.....#.', '.......'] },
    { name: '水中燈塔', goal: 'lamps', casts: 3, runes: ALL, start: { x: 0, y: 2 },
      hint: '燈被圍起來了。很多方法都行，試試看。',
      map: ['....~~~', '....~#~', '....#L#', '....~#~', '....~~~'] },
    { name: '雙燈', goal: 'lamps', casts: 2, runes: ALL, start: { x: 0, y: 2 },
      hint: '一次咒語只能放四個符文，分兩次處理。',
      map: ['...#...', '...#.L.', '...#...', '...#.L.', '...#...'] },
  ];
  const SANDBOX = { name: '自由實驗室', goal: null, casts: Infinity, runes: ALL, start: { x: 0, y: 2 },
    hint: '沒有目標，隨便試。研究筆記會記下你看到的反應。',
    map: ['..GG.~~', '..G..~~', '...#..L', '.W.#.I.', '.WW..II'] };

  const api = { W, H, MAXLEN, ELEMENTS, ACTIONS, FUSIONS, TILE, LEVELS, SANDBOX, mix, cast, parse, solved };
  if (typeof module !== 'undefined') module.exports = api; else root.Engine = api;
})(this);
