/* Decompile Me — CO1005 Chapter 8 demo.
   A detective game. The case file shows the machine code of a hidden C++ program (for the TOY machine of
   vn-machine.js, compiled by tiny-compiler.js). The player writes C++ that behaves the same; both programs
   run side by side on hidden test inputs, and the two assembly listings are diffed.
   Part 1 (this top half) is pure logic, exported for Node.  Part 2 (bottom) is the DOM UI, built only in a browser.
   Everything here is a SIMULATION on a teaching machine, not x86 or ARM. */
(function (global) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;
  var VN = isNode ? require('./vn-machine.js') : global.VNMachine;
  var TC = isNode ? require('./tiny-compiler.js') : global.TinyCompiler;
  var MAX_INSTR = 20000;

  /* ───────────────────────── levels ───────────────────────── */
  var LEVELS = [
    { id: 'tipjar', name: 'The Tip Jar', tag: 'straight-line arithmetic',
      story: 'A café till prints one number from two. Nobody remembers who wrote the program, only the machine code is left in the drawer.',
      src: 'int a, b, c;\ncin >> a >> b;\nc = a + b + b - 5;\ncout << c << endl;\n',
      samples: [[3, 4], [10, 0], [0, 6]],
      hidden: [[1, 1], [20, 5], [-4, 2], [7, 7], [100, 1], [0, 0], [5, -3]],
      starter: 'int x, y;\ncin >> x >> y;\n// what does the till compute?\n',
      hints: ['Look at the ADD and SUBTRACT instructions in order: each one touches R, the accumulator.',
              'Two ADDs read the same cell. Which input is added twice? The SUBTRACT reads a cell that holds a constant. Find its value in the data cells.'],
      aha: 'The listing never says "a", "b" or "c". Names are for humans: the compiler turned them into cell numbers and they are gone. Only the arithmetic survived.' },

    { id: 'bigfish', name: 'Bigger Fish', tag: 'if / else',
      story: 'The harbour scale prints the weight gap between two catches, never a negative number. Which instruction decides who is heavier?',
      src: 'int a, b, d;\ncin >> a >> b;\nif (a > b) {\n    d = a - b;\n} else {\n    d = b - a;\n}\ncout << d << endl;\n',
      samples: [[9, 4], [4, 9], [6, 6]],
      hidden: [[0, 5], [5, 0], [100, 1], [1, 100], [-3, 3], [3, -3], [7, 8], [12, 12]],
      starter: 'int a, b;\ncin >> a >> b;\n// compare, then print\n',
      hints: ['COMPARE followed by a conditional jump is how an if is written in machine code. The JUMP just before a label skips the else part.',
              'You do not have to copy the structure: any program that prints the same thing passes. The diff panel will show how your instruction count differs.'],
      aha: 'There is no "if" in machine code: only COMPARE and jumps. The first jump goes to the else part when the condition is FALSE, and the unconditional JUMP at the end of the then part hops over the else part.' },

    { id: 'gauss', name: "Gauss's Homework", tag: 'while loop, accumulator',
      story: 'A lost homework sheet. The machine reads one number and loops, but what is it adding up, and where does it stop?',
      src: 'int n, sum = 0, i = 1;\ncin >> n;\nwhile (i <= n) {\n    sum = sum + i;\n    i = i + 1;\n}\ncout << sum << endl;\n',
      samples: [[5], [1], [10]],
      hidden: [[0], [2], [3], [4], [7], [20], [50], [100]],
      starter: 'int n;\ncin >> n;\n// loop here\n',
      hints: ['A JUMP to an earlier address is a loop. The COMPARE and conditional jump near the top decide whether to leave it.',
              'Two cells change inside the loop, one by adding itself to a running total and one by growing by 1. The data section shows their starting values.'],
      aha: 'A loop is nothing but a jump backwards. The test sits at the top and the JUMP at the bottom sends the program back up; the compiler also emits a second jump to leave. Fewer or more instructions than the target means a different loop shape, not different behaviour.' },

    { id: 'liftoff', name: 'Countdown in Twos', tag: 'while loop, output',
      story: 'A launch pad prints numbers for the crew. The sample runs are your only witnesses; the stepping size is not written anywhere you can see, except in one data cell.',
      src: 'int n;\ncin >> n;\nwhile (n > 0) {\n    cout << n << endl;\n    n = n - 2;\n}\n',
      samples: [[7], [6], [1]],
      hidden: [[0], [2], [3], [4], [5], [8], [9], [11], [12]],
      starter: 'int n;\ncin >> n;\n// print, then step down\n',
      hints: ['Compare the sample runs: how far apart are consecutive numbers?',
              'Does the loop stop at 0 or before it? Check n = 6 and n = 7 in the samples. A loop that tests n > 0 and one that tests n != 0 behave very differently on odd numbers.'],
      aha: 'The sample runs alone could not prove which condition the loop uses. Hidden tests are what separate "looks right" from "is right", and the same is true for the compiler: it must keep every case you never tried.' },

    { id: 'euclid', name: "Euclid's Subtractor", tag: 'nested control flow',
      story: 'An ancient routine, found in the firmware of a gear grinder. It reads two positive numbers and prints one. A loop with a decision inside.',
      src: 'int a, b;\ncin >> a >> b;\nwhile (a != b) {\n    if (a > b) {\n        a = a - b;\n    } else {\n        b = b - a;\n    }\n}\ncout << a << endl;\n',
      samples: [[48, 18], [7, 5], [9, 9]],
      hidden: [[12, 8], [8, 12], [100, 75], [1, 30], [30, 1], [17, 51], [35, 14], [64, 48], [81, 27]],
      starter: 'int a, b;\ncin >> a >> b;\n// loop, decide, subtract\n',
      hints: ['Two nested pieces: a loop that runs until two cells are equal, and a decision that picks which cell shrinks.',
              'What do 48 and 18 turn into? Try the numbers by hand: 48-18=30, 30-18=12, ... what is left when they become equal?'],
      aha: 'Structure on top of structure: the while contains an if/else, and in machine code that is just labels and jumps in the right order. A decompiler has to rebuild the nesting from jump targets alone.' },

    { id: 'twins', name: 'The Twin Suspects', tag: 'names and structure are lost',
      story: 'Two programmers swear their code is the one that compiled to this machine code. They wrote it differently. This time your answer must match the machine code word for word. Then try to find a second, different-looking program with the very same words.',
      requireIdentical: true,
      src: 'int limit, k = 1;\ncin >> limit;\nwhile (k < limit) {\n    cout << k << endl;\n    k = k + k;\n}\n',
      twin: true,
      twinReal: 'int x;\nint y;\ny = 1;\ncin >> x;\nwhile (y < x) {\n    cout << y << endl;\n    y = y + y;\n}\n',
      samples: [[17], [1], [9]],
      hidden: [[2], [3], [4], [5], [16], [33], [100], [0]],
      starter: 'int n;\ncin >> n;\n// match the machine code exactly, cell for cell\n',
      hints: ['Behaviour is not enough here: the assembler listing must be identical, including where each variable lives. The order you declare variables decides the order of the data cells.',
              'The first two instructions run BEFORE the IN: a variable gets its starting value at the point of its declaration.'],
      aha: 'Different names, different spacing, different declaration style, even different braces: the machine code is the same. The compiler throws all of that away, so a decompiler can only guess one of the possible sources. That is why reverse engineering never recovers comments or variable names.' }
  ];

  /* ───────────────────────── helpers ───────────────────────── */
  function sameArr(a, b) { if (a.length !== b.length) return false; for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }
  function fmtOut(out) { return out.length ? out.join(' ') : '(nothing)'; }
  function fmtIn(inp) { return inp.length ? inp.join(' ') : '(no input)'; }

  function runOn(asm, input) {
    var st = VN.create(asm, { input: input, maxInstr: MAX_INSTR });
    VN.run(st);
    var err = st.error ? st.error : (st.waiting ? 'it asked for more input than the test provides' : (!st.halted ? 'it never reached HALT' : null));
    if (err && /Step guard/.test(err)) err = 'it ran for more than ' + MAX_INSTR + ' instructions (infinite loop?)';
    return { out: st.out.slice(), error: err, instr: st.instrCount };
  }

  /* canonical form: names forgotten, cell numbers replaced by v1, v2.. (first use), k<value> (never written), L1.. (jump targets) */
  function canon(asm) {
    var listing = asm.listing, written = {}, targets = {}, i;
    listing.forEach(function (w) {
      if (['STORE', 'CLEAR', 'INCREMENT', 'DECREMENT', 'IN'].indexOf(w.op) >= 0) written[w.operand] = true;
      if (/^JUMP/.test(w.op)) targets[w.operand] = true;
    });
    var tl = Object.keys(targets).map(Number).sort(function (a, b) { return a - b; }), labelOf = {};
    tl.forEach(function (t, k) { labelOf[t] = 'L' + (k + 1); });
    var vname = {}, nv = 0;
    var lines = listing.map(function (w) {
      var tok = '';
      if (w.operand !== null) {
        if (/^JUMP/.test(w.op)) tok = labelOf[w.operand] || ('@' + w.operand);
        else if (!written[w.operand]) tok = 'k' + asm.mem[w.operand];
        else { if (!vname[w.operand]) vname[w.operand] = 'v' + (++nv); tok = vname[w.operand]; }
      }
      return { addr: w.addr, word: w.word, op: w.op, operand: w.operand, tok: tok, text: w.op + (tok ? ' ' + tok : ''),
               label: labelOf[w.addr] || '', raw: w.op + (w.operand !== null ? ' ' + w.operand : '') };
    });
    var cells = [];
    for (i = 0; i < asm.cells.length; i++) if (asm.cells[i].kind === 'data') {
      var nm = vname[i] || (written[i] ? 'unused' : 'k' + asm.mem[i]);
      cells.push({ addr: i, init: asm.mem[i], name: vname[i] ? vname[i] : (written[i] ? 'v?' : nm), constant: !written[i] });
    }
    return { lines: lines, cells: cells, labelOf: labelOf };
  }

  /* LCS diff over canonical instruction texts. rows: {kind: same|mod|del|add, t: line|null, y: line|null} */
  function diffLines(a, b) {
    var n = a.length, m = b.length, d = [], i, j;
    for (i = 0; i <= n; i++) { d.push(new Array(m + 1).fill(0)); }
    for (i = n - 1; i >= 0; i--) for (j = m - 1; j >= 0; j--)
      d[i][j] = a[i].text === b[j].text ? d[i + 1][j + 1] + 1 : Math.max(d[i + 1][j], d[i][j + 1]);
    var rows = [], dels = [], adds = [];
    function flush() {
      var k, c = Math.min(dels.length, adds.length);
      for (k = 0; k < c; k++) rows.push({ kind: 'mod', t: dels[k], y: adds[k] });
      for (k = c; k < dels.length; k++) rows.push({ kind: 'del', t: dels[k], y: null });
      for (k = c; k < adds.length; k++) rows.push({ kind: 'add', t: null, y: adds[k] });
      dels = []; adds = [];
    }
    i = 0; j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && a[i].text === b[j].text) { flush(); rows.push({ kind: 'same', t: a[i], y: b[j] }); i++; j++; }
      else if (j >= m || (i < n && d[i + 1][j] >= d[i][j + 1])) { dels.push(a[i]); i++; }
      else { adds.push(b[j]); j++; }
    }
    flush();
    return rows;
  }

  var targetCache = {};
  function target(level) {
    if (targetCache[level.id]) return targetCache[level.id];
    var res = TC.compile(level.src);
    if (!res.ok) throw new Error('hidden program of level ' + level.id + ' does not compile');
    var inputs = level.samples.concat(level.hidden);
    var T = { res: res, canon: canon(res.asm), inputs: inputs, expected: inputs.map(function (inp) { return runOn(res.asm, inp).out; }) };
    return (targetCache[level.id] = T);
  }

  function countStmts(list) {
    var n = 0;
    (list || []).forEach(function (s) { n++; if (s.then) n += countStmts(s.then); if (s.else) n += countStmts(s.else); if (s.body) n += countStmts(s.body); });
    return n;
  }

  /* source -> tokens -> tree -> assembly -> machine code, stopping at the first failure */
  function stagesOf(src) {
    var S = [{ key: 'source', label: 'Source', st: 'ok', info: String(src).split('\n').length + ' lines' },
             { key: 'tokens', label: 'Tokens', st: 'idle', info: '' },
             { key: 'tree', label: 'Syntax tree', st: 'idle', info: '' },
             { key: 'asm', label: 'Assembly', st: 'idle', info: '' },
             { key: 'machine', label: 'Machine code', st: 'idle', info: '' },
             { key: 'run', label: 'Run', st: 'idle', info: '' }];
    var out = { stages: S, ok: false, errors: [], toks: [], ast: null, res: null };
    function bad(i, e) { S[i].st = 'fail'; S[i].info = 'error'; out.errors = [{ line: e.line || 0, msg: e.msg }]; return out; }
    var toks, ast;
    try { toks = TC.tokenize(src); } catch (e) { if (e && e.msg) return bad(1, e); throw e; }
    S[1].st = 'ok'; S[1].info = toks.length + ' tokens'; out.toks = toks;
    try { ast = TC.parse(toks); } catch (e) { if (e && e.msg) return bad(2, e); throw e; }
    S[2].st = 'ok'; S[2].info = countStmts(ast.body) + ' statements'; out.ast = ast;
    var res = TC.compile(src); out.res = res;
    if (!res.ok) { S[3].st = 'fail'; S[3].info = 'error'; out.errors = res.errors; return out; }
    S[3].st = 'ok'; S[3].info = res.asm.listing.length + ' instructions';
    S[4].st = 'ok'; S[4].info = res.asm.codeLen + ' words × ' + res.asm.wordBits + ' bits';
    out.ok = true;
    return out;
  }

  /* compare player's compiled code with the target: identical machine code? same instructions? */
  function compareCode(level, res) {
    var T = target(level), you = canon(res.asm);
    var rows = diffLines(T.canon.lines, you.lines);
    var identical = res.asm.size === T.res.asm.size && sameArr(res.asm.mem, T.res.asm.mem);
    var sameShape = rows.every(function (r) { return r.kind === 'same'; });
    var tl = T.canon.lines.length, yl = you.lines.length;
    return { rows: rows, identical: identical, sameShape: sameShape, targetLen: tl, yourLen: yl, you: you };
  }

  function judge(level, src) {
    var st = stagesOf(src), T = target(level);
    var r = { stages: st.stages, compiled: st.ok, errors: st.errors, tests: [], passed: 0, total: T.inputs.length, allPass: false,
              solved: false, stars: 0, code: null, res: st.res, toks: st.toks, ast: st.ast, verdict: '' };
    if (!st.ok) { r.verdict = 'compile'; return r; }
    T.inputs.forEach(function (inp, i) {
      var got = runOn(st.res.asm, inp), exp = T.expected[i];
      var pass = !got.error && sameArr(got.out, exp);
      if (pass) r.passed++;
      r.tests.push({ input: inp, expected: exp, got: got.out, error: got.error, pass: pass, sample: i < level.samples.length });
    });
    r.allPass = r.passed === r.total;
    r.code = compareCode(level, st.res);
    st.stages[5].st = r.allPass ? 'ok' : 'fail';
    st.stages[5].info = r.passed + '/' + r.total + ' pass';
    if (!r.allPass) { r.verdict = 'wrong'; return r; }
    if (level.requireIdentical && !r.code.identical) { r.verdict = r.code.sameShape ? 'layout' : 'behaves'; return r; }
    r.solved = true;
    r.stars = r.code.sameShape ? 3 : (r.code.yourLen <= r.code.targetLen ? 2 : 1);
    r.verdict = r.code.identical ? 'identical' : (r.code.sameShape ? 'sameshape' : 'different');
    return r;
  }

  /* machine-code view of an assembled program: raw (cell numbers) or friendly (canonical names) */
  function listingRows(asm, cn, friendly) {
    return cn.lines.map(function (l) {
      return { addr: l.addr, bits: VN.bits(l.word, asm.addrBits), hex: VN.hex(l.word, asm.addrBits), text: friendly ? l.text : l.raw, label: friendly ? l.label : '' };
    });
  }

  var DM = { LEVELS: LEVELS, target: target, judge: judge, stagesOf: stagesOf, canon: canon, diffLines: diffLines,
             compareCode: compareCode, runOn: runOn, fmtOut: fmtOut, fmtIn: fmtIn, listingRows: listingRows, VN: VN, TC: TC };
  if (isNode) { module.exports = DM; return; }
  global.DecompileMe = DM;

  /* ═════════════════════════ Part 2 — UI ═════════════════════════ */
  var root = document.getElementById('dm-root');
  if (!root) return;
  var KEY = 'co1005-decompile-me-v1';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var saved = { solved: {}, peeked: {}, code: {}, big: false, friendly: true };
  try { var raw = localStorage.getItem(KEY); if (raw) { var o = JSON.parse(raw); if (o && typeof o === 'object') Object.keys(saved).forEach(function (k) { if (k in o) saved[k] = o[k]; }); } } catch (e) {}
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch (e) {} }

  var state = { li: 0, last: null, view: 'asm', hint: 0, twinFound: false };
  var el = {}, flow = null;
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function h(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function say(msg) { el.status.textContent = msg; }
  var STAR = '★', STAR0 = '☆';
  function stars(n) { return new Array(n + 1).join(STAR) + new Array(4 - n).join(STAR0); }
  function totalStars() { var t = 0; LEVELS.forEach(function (l) { t += saved.solved[l.id] || 0; }); return t; }

  function build() {
    root.innerHTML = '';
    root.classList.toggle('dm-big', !!saved.big);
    var bar = h('div', 'dm-bar');
    el.levels = h('div', 'dm-levels'); el.levels.setAttribute('role', 'tablist'); el.levels.setAttribute('aria-label', 'Cases');
    el.score = h('div', 'dm-score');
    var tools = h('div', 'dm-tools');
    el.bigBtn = h('button', 'btn ghost small', 'Big type'); el.bigBtn.type = 'button'; el.bigBtn.setAttribute('aria-pressed', String(!!saved.big));
    el.friendBtn = h('button', 'btn ghost small', 'Friendly labels'); el.friendBtn.type = 'button'; el.friendBtn.setAttribute('aria-pressed', String(!!saved.friendly));
    el.resetAll = h('button', 'btn ghost small', 'Forget progress'); el.resetAll.type = 'button';
    tools.appendChild(el.friendBtn); tools.appendChild(el.bigBtn); tools.appendChild(el.resetAll);
    bar.appendChild(el.levels); bar.appendChild(el.score); bar.appendChild(tools);
    var app = h('div', 'dm-app'); root.appendChild(app);
    app.appendChild(bar);

    /* three column wrappers (display: contents on the normal page; assets/fs-compiler.css turns them into the full-screen columns) */
    var colL = h('div', 'dm-col dm-col-l'), colM = h('div', 'dm-col dm-col-m'), colR = h('div', 'dm-col dm-col-r');
    app.appendChild(colL); app.appendChild(colM); app.appendChild(colR);
    el.case = h('section', 'dm-case'); colL.appendChild(el.case);
    el.work = h('section', 'dm-work'); colL.appendChild(el.work);
    el.status = h('p', 'dm-status'); el.status.setAttribute('role', 'status'); el.status.setAttribute('aria-live', 'polite');
    colL.appendChild(el.status);
    el.flowBox = h('section', 'dm-flow-box');
    el.flowBox.innerHTML = '<h3>Watch your program travel through the toolchain</h3><p class="fine">Every block has its own colour, and so does whatever it produces (tokens, tree, assembly, machine words, memory cells). Your code follows blocks 1 to 9. The faded row at the bottom is the hidden target program going through the same toolchain, in the same block colours: if your machine words equal its words, the two pipelines converge on the same memory (green ✓ cells; red ✗ cells differ).</p>';
    colM.appendChild(el.flowBox);
    el.flowHost = h('div', 'dm-flow'); el.flowBox.appendChild(el.flowHost);
    flow = global.CompilerFlow ? global.CompilerFlow.create(el.flowHost, { ghost: true, uid: 'dm', speedKey: 'co1005-cf-speed', initialSpeed: 4 }) : null;
    el.stagesBox = h('section', 'dm-stages-box'); colR.appendChild(el.stagesBox);
    el.results = h('section', 'dm-results'); colR.appendChild(el.results);

    el.bigBtn.addEventListener('click', function () { saved.big = !saved.big; persist(); root.classList.toggle('dm-big', saved.big); el.bigBtn.setAttribute('aria-pressed', String(saved.big)); });
    el.friendBtn.addEventListener('click', function () { saved.friendly = !saved.friendly; persist(); el.friendBtn.setAttribute('aria-pressed', String(saved.friendly)); renderCase(); renderStageView(); if (state.last) renderResults(); });
    el.resetAll.addEventListener('click', function () { if (!window.confirm('Forget all saved progress and code on this device?')) return; saved.solved = {}; saved.peeked = {}; saved.code = {}; persist(); selectLevel(0); say('Progress cleared.'); });
    renderLevelBar();
  }

  function renderLevelBar() {
    el.levels.innerHTML = '';
    LEVELS.forEach(function (l, i) {
      var b = h('button', 'dm-lvl', '<span class="n">' + (i + 1) + '</span><span class="t">' + esc(l.name) + '</span><span class="s" aria-hidden="true">' +
        (saved.solved[l.id] ? stars(saved.solved[l.id]) : '') + '</span>');
      b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(i === state.li));
      b.setAttribute('aria-label', 'Case ' + (i + 1) + ': ' + l.name + (saved.solved[l.id] ? ', solved with ' + saved.solved[l.id] + ' stars' : ''));
      if (i === state.li) b.classList.add('on');
      b.addEventListener('click', function () { selectLevel(i); });
      el.levels.appendChild(b);
    });
    el.score.innerHTML = '<b>' + totalStars() + '</b> / ' + (LEVELS.length * 3) + ' <span aria-hidden="true">' + STAR + '</span><span class="sr"> stars</span>';
  }

  function listingTable(asm, cn, caption) {
    var rows = listingRows(asm, cn, saved.friendly), t = '<table class="dm-asm"><caption class="sr">' + esc(caption) + '</caption><thead><tr><th scope="col">Cell</th><th scope="col">Machine word</th><th scope="col">Instruction</th></tr></thead><tbody>';
    rows.forEach(function (r) {
      t += '<tr><td class="a">' + r.addr + '</td><td class="b">' + esc(r.bits) + '</td><td class="i">' + (r.label ? '<i class="lb">' + r.label + ':</i> ' : '') + esc(r.text) + '</td></tr>';
    });
    cn.cells.forEach(function (c) {
      t += '<tr class="data"><td class="a">' + c.addr + '</td><td class="b">' + esc(VN.bits(c.init, asm.addrBits) || String(c.init)) + '</td><td class="i">data: ' +
        (saved.friendly ? esc(c.name) + ' starts at ' : 'holds ') + c.init + '</td></tr>';
    });
    return t + '</tbody></table>';
  }

  function renderCase() {
    var L = LEVELS[state.li], T = target(L);
    var peeked = saved.peeked[L.id], solved = saved.solved[L.id];
    var sam = '';
    L.samples.forEach(function (inp, i) {
      sam += '<li><span class="k">Run ' + (i + 1) + '</span><span class="in">in: <code>' + esc(fmtIn(inp)) + '</code></span><span class="out">out: <code>' + esc(fmtOut(T.expected[i])) + '</code></span></li>';
    });
    el.case.innerHTML = '<div class="dm-file"><div class="dm-file-head"><span class="stamp">CASE ' + (state.li + 1) + '</span><h2>' + esc(L.name) + '</h2><span class="chip">' + esc(L.tag) + '</span>' +
      (solved ? '<span class="chip ok">solved ' + stars(solved) + '</span>' : '') + '</div><p class="story">' + esc(L.story) + '</p>' +
      '<div class="dm-evidence"><div><h3>Exhibit A: the machine code</h3><div class="scroll" tabindex="0" role="region" aria-label="Machine code of the hidden program">' +
      listingTable(T.res.asm, T.canon, 'Machine code of the hidden program') + '</div>' +
      '<p class="fine">' + (saved.friendly ? 'Friendly labels: <code>v1</code>, <code>v2</code> are variable cells in order of first use, <code>k5</code> is a constant cell holding 5, <code>L1</code> is a jump target. The machine itself only has the numbers; switch off “Friendly labels” to see them.' :
        'Raw view: operands are cell numbers, exactly what the machine sees.') + '</p></div>' +
      '<div><h3>Exhibit B: sample runs</h3><ul class="dm-samples">' + sam + '</ul>' +
      '<p class="fine">Hidden tests (' + L.hidden.length + ' more inputs) wait for your program. Your code is only wrong if it behaves differently on at least one of them' +
      (L.requireIdentical ? '; in this case it must also compile to the same machine words' : '') + '.</p></div></div></div>';
    el.case.querySelectorAll('.scroll').forEach(function (s) { s.scrollTop = 0; });
  }

  function renderWork() {
    var L = LEVELS[state.li];
    el.work.innerHTML = '';
    var head = h('div', 'dm-work-head', '<h3>Your C++ (supported subset)</h3><span class="fine">int, = + -, cin &gt;&gt;, cout &lt;&lt;, if / else, while, == != &lt; &gt; &lt;= &gt;=</span>');
    var ta = h('textarea', 'dm-code'); ta.id = 'dm-code'; ta.spellcheck = false; ta.autocapitalize = 'off'; ta.setAttribute('autocomplete', 'off');
    ta.setAttribute('aria-label', 'Your C++ code'); ta.rows = 9;
    ta.value = saved.code[L.id] != null ? saved.code[L.id] : L.starter;
    var btns = h('div', 'dm-btns');
    var run = h('button', 'btn primary', 'Run on all tests'); run.type = 'button'; run.id = 'dm-run';
    var hint = h('button', 'btn ghost', 'Hint'); hint.type = 'button';
    var rst = h('button', 'btn ghost', 'Reset code'); rst.type = 'button';
    var peek = h('button', 'btn ghost', 'Reveal the source'); peek.type = 'button';
    var kb = h('span', 'fine', 'Ctrl or Cmd + Enter also runs. Press Esc, then Tab, to leave the box.');
    btns.appendChild(run); btns.appendChild(hint); btns.appendChild(rst); btns.appendChild(peek);
    el.hint = h('p', 'dm-hint'); el.hint.hidden = true;
    el.work.appendChild(head); el.work.appendChild(ta); el.work.appendChild(btns); el.work.appendChild(kb); el.work.appendChild(el.hint);
    el.ta = ta;
    ta.addEventListener('input', function () { saved.code[L.id] = ta.value; persist(); });
    ta.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); doRun(); }
      else if (e.key === 'Escape') { ta.dataset.free = '1'; }
      else if (e.key === 'Tab' && !e.shiftKey && ta.dataset.free !== '1') {
        e.preventDefault();
        var s = ta.selectionStart, en = ta.selectionEnd;
        ta.value = ta.value.slice(0, s) + '    ' + ta.value.slice(en); ta.selectionStart = ta.selectionEnd = s + 4;
        saved.code[L.id] = ta.value; persist();
      } else if (e.key !== 'Tab' && e.key !== 'Shift') ta.dataset.free = '';
    });
    run.addEventListener('click', doRun);
    hint.addEventListener('click', function () {
      var n = Math.min(state.hint + 1, L.hints.length);
      state.hint = n; el.hint.hidden = false;
      el.hint.innerHTML = '<b>Hint ' + n + ' of ' + L.hints.length + '.</b> ' + esc(L.hints[n - 1]) + (n < L.hints.length ? ' <span class="fine">(press Hint again for another)</span>' : '');
      say('Hint ' + n + ' shown.');
    });
    rst.addEventListener('click', function () { ta.value = L.starter; saved.code[L.id] = L.starter; persist(); ta.focus(); say('Code reset to the starter.'); });
    peek.addEventListener('click', function () {
      if (!saved.peeked[L.id] && !saved.solved[L.id] && !window.confirm('Reveal the hidden source? This case will not earn stars.')) return;
      if (!saved.solved[L.id]) saved.peeked[L.id] = true;
      persist(); renderCase(); showReveal(false); say('The hidden source is shown below the grid.');
    });
  }

  function showReveal(won) {
    var L = LEVELS[state.li], box = el.results.querySelector('.dm-reveal');
    if (box) box.remove();
    box = h('div', 'dm-reveal');
    var html = '<h3>' + (won ? 'Case closed' : 'The hidden source') + '</h3>';
    if (L.twin) {
      html += '<div class="dm-two"><div><h4>Suspect A (the original)</h4><pre class="dm-pre">' + esc(L.src) + '</pre></div>' +
        '<div><h4>Suspect B (what B really wrote)</h4><pre class="dm-pre">' + esc(L.twinReal) + '</pre></div></div>';
    } else html += '<pre class="dm-pre">' + esc(L.src) + '</pre>';
    html += '<p class="aha"><b>Aha.</b> ' + esc(L.aha) + '</p>';
    if (L.twin && won) html += '<p class="aha"><b>Twin challenge.</b> ' + (state.twinFound ? 'Found: you compiled a differently written program to the same machine words. ' : 'Write a second program that looks different (other names, other declaration style) but gives exactly the same machine words, then run it. ') + '</p>';
    var nxt = state.li + 1 < LEVELS.length;
    if (won && nxt) html += '<p><button type="button" class="btn primary" id="dm-next">Next case</button></p>';
    box.innerHTML = html;
    el.results.appendChild(box);
    var nb = box.querySelector('#dm-next'); if (nb) nb.addEventListener('click', function () { selectLevel(state.li + 1); window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }); });
  }

  function renderStageView() {
    var S = state.last ? state.last : null, box = el.stagesBox;
    var steps = S ? S.stages : stagesOf('').stages.map(function (s) { s.st = 'idle'; s.info = ''; return s; });
    var strip = '<ol class="dm-strip" aria-label="Compiler stages">';
    steps.forEach(function (s, i) {
      strip += '<li><button type="button" class="dm-stage ' + s.st + (state.view === s.key ? ' sel' : '') + '" data-k="' + s.key + '" aria-pressed="' + (state.view === s.key) + '"><span class="n">' + (i + 1) + '</span><span class="l">' + s.label + '</span><span class="i">' +
        esc(s.info || (S ? '' : '')) + '</span><span class="m" aria-hidden="true">' + (s.st === 'ok' ? '✓' : s.st === 'fail' ? '✗' : '') + '</span></button></li>';
    });
    strip += '</ol>';
    var body = '';
    if (!S) body = '<p class="fine">Run your code to light up the pipeline: source, tokens, syntax tree, assembly, machine code, run. Click a stage to inspect what it produced.</p>';
    else if (state.view === 'source') body = '<pre class="dm-pre">' + esc(el.ta ? el.ta.value : '') + '</pre>';
    else if (state.view === 'tokens') body = S.toks.length ? '<p class="toks">' + S.toks.map(function (t) { return '<span class="tk ' + t.t + '">' + esc(t.v) + '</span>'; }).join('') + '</p>' : stageMsg(S, 'tokens');
    else if (state.view === 'tree') body = S.ast ? '<pre class="dm-pre">' + esc(TC.astOutline(S.ast) || '(empty program)') + '</pre>' : stageMsg(S, 'tree');
    else if (!S.res || !S.res.ok) body = stageMsg(S, state.view);
    else if (state.view === 'asm') body = '<pre class="dm-pre">' + esc(S.res.asmText) + '</pre>';
    else if (state.view === 'machine') body = '<div class="scroll" tabindex="0" role="region" aria-label="Machine code of your program">' + listingTable(S.res.asm, canon(S.res.asm), 'Machine code of your program') + '</div>';
    else if (state.view === 'run') body = '<p class="fine">Each test below is executed on the toy machine: fetch, decode, execute, once per instruction. ' + S.passed + ' of ' + S.total + ' tests agree with the target.</p>';
    box.innerHTML = '<h3>Compiler stages</h3>' + strip + '<div class="dm-stage-body">' + body + '</div>';
    box.querySelectorAll('.dm-stage').forEach(function (b) {
      b.addEventListener('click', function () { state.view = b.getAttribute('data-k'); renderStageView(); var nb = box.querySelector('.dm-stage.sel'); if (nb) nb.focus(); });
    });
  }
  function stageMsg(S, key) {
    if (S.errors && S.errors.length) return '<p class="err">' + (S.errors[0].line ? 'Line ' + S.errors[0].line + ': ' : '') + esc(S.errors[0].msg) + '</p>';
    return '<p class="fine">This stage was not reached.</p>';
  }

  /* stage strip lights up as the flow diagram reaches each block (falls back to a timed sweep without the diagram) */
  var STAGE_KEY = { lexer: 1, parser: 2, codegen: 3, assembler: 4, loader: 4, cpu: 5 };
  function stripReset() {
    var btns = el.stagesBox.querySelectorAll('.dm-stage');
    btns.forEach(function (b) { b.classList.remove('ok', 'fail', 'pop'); b.classList.add('idle'); });
    if (btns[0]) { btns[0].classList.remove('idle'); btns[0].classList.add('ok'); }
  }
  function stripTo(idx) {
    var btns = el.stagesBox.querySelectorAll('.dm-stage'), steps = state.last.stages, b = btns[idx];
    if (!b) return;
    b.classList.remove('idle'); b.classList.add(steps[idx].st); b.classList.add('pop');
  }
  function stripAll() {
    var btns = el.stagesBox.querySelectorAll('.dm-stage'), steps = state.last.stages;
    btns.forEach(function (b, i) { b.classList.remove('ok', 'fail', 'idle', 'pop'); b.classList.add(steps[i].st); });
  }

  function doRun() {
    var L = LEVELS[state.li], src = el.ta.value;
    saved.code[L.id] = src; persist();
    if (flow) flow.cancel();
    var r = judge(L, src);
    state.last = r;
    state.view = r.compiled ? 'asm' : (r.stages[1].st === 'fail' ? 'tokens' : r.stages[2].st === 'fail' ? 'tree' : 'asm');
    renderStageView();
    var finished = false;
    function finish() {
      if (finished) return; finished = true;
      renderResults();
      if (r.solved && !saved.peeked[L.id]) {
        var prev = saved.solved[L.id] || 0;
        if (r.stars > prev) { saved.solved[L.id] = r.stars; persist(); renderLevelBar(); renderCase(); }
      }
      if (L.twin && r.compiled && r.code && r.code.identical) {
        var norm = function (s) { return TC.tokenize(s).map(function (t) { return t.v; }).join(' '); };
        var key = saved.code['twins-first'];
        if (!key) { saved.code['twins-first'] = norm(src); persist(); }
        else if (key !== norm(src)) state.twinFound = true;
      }
      if (r.solved) showReveal(true);
      say(summaryText(r));
    }
    var T = target(L);
    if (flow) {
      flow.setGhost(T.res.asm);
      stripReset();
      var tr = TC.trace(src, { input: L.samples[0], record: 60 });
      flow.start(tr, { ghost: T.res.asm, input: L.samples[0], autoplay: true,
        onStage: function (stage) { if (STAGE_KEY[stage]) stripTo(STAGE_KEY[stage]); },
        onFail: function (stage) { stripAll(); },
        onDone: function () { stripAll(); finish(); } });
    } else finish();
  }

  function summaryText(r) {
    if (!r.compiled) return 'Compile error: ' + (r.errors[0] ? r.errors[0].msg : 'unknown') + '.';
    if (r.verdict === 'wrong') return r.passed + ' of ' + r.total + ' tests pass. Keep investigating.';
    if (r.verdict === 'layout') return 'All tests pass, but the machine code is not identical: same instructions, cells in a different order.';
    if (r.verdict === 'behaves') return 'All tests pass, but this case needs the very same machine words. Compare the diff.';
    return 'All ' + r.total + ' tests pass. ' + stars(r.stars) + (r.verdict === 'identical' ? ' The machine code is identical.' : '');
  }

  function renderResults() {
    var r = state.last, L = LEVELS[state.li];
    var old = el.results.querySelector('.dm-reveal'); var keep = old ? old : null;
    el.results.innerHTML = '';
    var box = h('div', 'dm-res');
    if (!r.compiled) {
      box.innerHTML = '<div class="dm-verdict bad"><b>Does not compile.</b> ' + (r.errors[0] && r.errors[0].line ? 'Line ' + r.errors[0].line + ': ' : '') + esc(r.errors[0] ? r.errors[0].msg : '') + '</div>';
      el.results.appendChild(box); return;
    }
    var vt = { wrong: ['bad', 'Behaviour differs.', 'At least one test disagrees. Open a red cell to see what the target printed.'],
               layout: ['warn', 'Right behaviour, different machine words.', 'Your instructions match, but variables sit in different cells. In C++ the order of declaration decides the order of the data cells.'],
               behaves: ['warn', 'Right behaviour, different machine words.', 'This case needs a bit-for-bit match. Study the diff and shape your code like the target.'],
               identical: ['good', 'Case closed: identical machine code.', 'Every machine word equals the target, even if your source looks different.'],
               sameshape: ['good', 'Case closed: same instructions.', 'The instruction sequence matches once names and cell numbers are forgotten.'],
               different: ['good', 'Case closed: same behaviour, different code.', 'You wrote ' + r.code.yourLen + ' instructions against the target’s ' + r.code.targetLen + '. Same behaviour, different style.'] }[r.verdict];
    var html = '<div class="dm-verdict ' + vt[0] + '"><b>' + vt[1] + '</b> ' + vt[2] + (r.solved ? ' <span class="stars">' + stars(r.stars) + '</span>' : '') + '</div>';
    html += '<h3>Test grid: ' + r.passed + ' of ' + r.total + ' pass</h3><ul class="dm-grid">';
    r.tests.forEach(function (t, i) {
      html += '<li class="' + (t.pass ? 'p' : 'f') + '"><span class="mk" aria-hidden="true">' + (t.pass ? '✓' : '✗') + '</span><span class="sr">' + (t.pass ? 'Pass' : 'Fail') + '. </span>' +
        '<span class="tn">' + (t.sample ? 'sample ' + (i + 1) : 'hidden ' + (i - L.samples.length + 1)) + '</span><code>in: ' + esc(fmtIn(t.input)) + '</code>' +
        (t.pass ? '<code class="o">out: ' + esc(fmtOut(t.got)) + '</code>' :
          '<code class="o">want: ' + esc(fmtOut(t.expected)) + '</code><code class="o">got: ' + esc(t.error ? t.error : fmtOut(t.got)) + '</code>') + '</li>';
    });
    html += '</ul>';
    var c = r.code, same = c.rows.filter(function (x) { return x.kind === 'same'; }).length;
    html += '<h3>Assembly diff: target vs yours</h3><p class="fine">Instructions: target <b>' + c.targetLen + '</b>, yours <b>' + c.yourLen + '</b>; ' + same + ' lines identical. Names and cell numbers are normalised first, so only the instruction pattern is compared.</p>';
    html += '<div class="scroll" tabindex="0" role="region" aria-label="Assembly diff"><table class="dm-diff"><thead><tr><th scope="col"></th><th scope="col">Target</th><th scope="col">Yours</th></tr></thead><tbody>';
    var sym = { same: '=', mod: '≠', del: '−', add: '+' };
    c.rows.forEach(function (x) {
      html += '<tr class="' + x.kind + '"><td class="s" title="' + x.kind + '">' + sym[x.kind] + '</td><td>' + (x.t ? (x.t.label ? '<i class="lb">' + x.t.label + ':</i> ' : '') + esc(x.t.text) : '') +
        '</td><td>' + (x.y ? (x.y.label ? '<i class="lb">' + x.y.label + ':</i> ' : '') + esc(x.y.text) : '') + '</td></tr>';
    });
    html += '</tbody></table></div><p class="fine">= same, ≠ same position but different instruction, − only in the target, + only in yours. Different instruction counts are style: for example a different loop condition needs different jumps.</p>';
    box.innerHTML = html;
    el.results.appendChild(box);
    if (keep) el.results.appendChild(keep);
  }

  function selectLevel(i) {
    state.li = i; state.last = null; state.hint = 0; state.view = 'asm'; state.twinFound = false;
    if (flow) { flow.blank('Press “Run on all tests”: your program goes through the toolchain while the hidden target program waits, faded, at the bottom.'); flow.setGhost(target(LEVELS[i]).res.asm); }
    renderLevelBar(); renderCase(); renderWork(); renderStageView();
    el.results.innerHTML = '';
    if (saved.solved[LEVELS[i].id] || saved.peeked[LEVELS[i].id]) { showReveal(!!saved.solved[LEVELS[i].id]); }
    say('Case ' + (i + 1) + ': ' + LEVELS[i].name + '.');
  }

  build();
  selectLevel(0);
  window.DecompileMeState = state;
})(typeof window !== 'undefined' ? window : this);
