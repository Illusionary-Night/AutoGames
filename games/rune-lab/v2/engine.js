// 符文研究室 v2（限量符文）：規則引擎（遊戲畫面與解題器共用）
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
    {"name":"轉角","goal":"lamps","casts":1,"stock":["火","射","轉"],"start":{"x":1,"y":0},"map":[".......",".......",".......",".L.....","......."],"hints":["法師一開始面向右邊。","順序：先決定元素，再轉向。"]},
    {"name":"石牆","goal":"lamps","casts":1,"stock":["火","射","射","躍"],"start":{"x":0,"y":2},"map":["...#...","...#...","...#.L.","...#...","...#..."],"hints":["停在石頭上的咒語射不出去。","牆只有一格厚。"]},
    {"name":"雙燈","goal":"lamps","casts":1,"stock":["火","射","爆","躍"],"start":{"x":0,"y":2},"map":["...#...","...#.L.","...#...","...#.L.","...#..."],"hints":["兩盞燈之間隔一格，一次「爆」能同時碰到。","先到牆邊，再想辦法過去。"]},
    {"name":"燎原","goal":"lamps","casts":2,"stock":["火","風","射","射","爆"],"start":{"x":0,"y":2},"map":[".GI.#..","...L.L.","...G...",".GL.#G.","....G.."],"hints":["兩種元素融合後的火更猛。","第一次先燒掉大片障礙。","第一次施放：風射爆"]},
    {"name":"迴風","goal":"lamps","casts":2,"stock":["火","風","射","射","爆","轉"],"start":{"x":0,"y":2},"map":["...GGG.",".L.G...","..#...#","G......","#.#...."],"hints":["風可以讓草長到旁邊的空格。","燈不一定要直接點，讓火自己走過去。","第一次施放：風轉射爆"]},
    {"name":"播種","goal":"grow","targets":[[0,1],[1,4]],"casts":2,"stock":["水","風","土","射","爆","爆"],"start":{"x":0,"y":2},"map":["....#..","....~..","...~...","#.#.I~I","...~.#."],"hints":["哪兩種元素能帶來生命？","種下的草可以再擴張。","第一次施放：水土爆"]},
    {"name":"生火","goal":"lamps","casts":2,"stock":["火","水","土","射","爆","爆"],"start":{"x":0,"y":2},"map":[".W.....","..W....","...L.~.",".L.....",".W.~..."],"hints":["燈旁邊沒有燃料時，可以自己造。","先造出能燒的東西。","第一次施放：水土爆"]},
    {"name":"築壁","goal":"lamps","casts":2,"stock":["火","土","射","射","射","爆"],"start":{"x":0,"y":2},"map":["#.....W","....WWL",".~.W...","..W.W..",".~.W..."],"hints":["土能在空地上造出石頭。","石頭可以讓咒語停在你要的位置。","第一次施放：土射"]},
    {"name":"跨越","goal":"lamps","casts":2,"stock":["火","風","射","爆","爆","躍"],"start":{"x":0,"y":2},"map":["G..#L..","..#G..G",".G...G.","...LG.G","......."],"hints":["風能把草鋪開，替火鋪路。","第一次施放是鋪陳，不用點燈。","第一次施放：風射躍爆"]},
    {"name":"墊腳石","goal":"lamps","casts":2,"stock":["火","土","射","射","爆","躍"],"start":{"x":0,"y":2},"map":[".WW.W.#","..~W...",".~LL..W","....L.W",".#..W.#"],"hints":["先在適當的位置放一塊石頭。","石頭能讓下一個咒語停在你要的地方。","第一次施放：土射"]},
  ];
  const SANDBOX = { name: '自由實驗室', goal: null, casts: Infinity, runes: ALL, start: { x: 0, y: 2 },
    hint: '沒有目標，隨便試。研究筆記會記下你看到的反應。',
    map: ['..GG.~~', '..G..~~', '...#..L', '.W.#.I.', '.WW..II'] };

  const api = { W, H, MAXLEN, ELEMENTS, ACTIONS, FUSIONS, TILE, LEVELS, SANDBOX, mix, cast, parse, solved };
  if (typeof module !== 'undefined') module.exports = api; else root.Engine = api;
})(this);
