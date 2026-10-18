/* Program the CPU — CO1005 demo for Chapter 7 (Von Neumann architecture).
   Part 1: pure puzzle logic (levels, tests, scoring) on top of assets/vn-machine.js.  Exported for Node.
   Part 2: the UI (only runs in a browser).
   Everything here is a SIMULATION of the course's toy computer — not x86 or ARM. */
(function (global) {
  'use strict';
  var VN = (typeof module !== 'undefined' && module.exports) ? require('./vn-machine.js') : global.VNMachine;

  /* ═════════════ Part 1 — puzzle logic ═════════════ */
  var MEM = 16, MAXI = 3000;

  function seq(a, b) { var r = []; for (var i = a; i >= b; i--) r.push(i); return r; }
  function T(inp, out) { return { in: inp, out: out }; }

  var LEVELS = [
    { id: 'echo', n: 1, title: 'Echo', mem: MEM,
      story: 'The input device hands you three numbers. Send each one straight to the output device, in the same order.',
      tests: [T([7, 3, 9], [7, 3, 9]), T([0, 0, 0], [0, 0, 0]), T([-5, 12, 100], [-5, 12, 100]), T([1, 2, 3], [1, 2, 3])],
      par: { size: 3, cycles: 28 },
      hint: 'IN stores the next input number into a memory cell, and OUT prints a memory cell, so you need one data cell. Short on instructions? The machine also stops when it asks for input and the queue is empty, so a loop that ends with JUMP can stand in for HALT. Short on time? Skip the loop.',
      starter: '; Level 1 - Echo\n; IN x   : the next input number goes into cell x\n; OUT x  : print the number in cell x\nIN x\nOUT x\nHALT\n.data\nx: 0\n',
      solutions: [
        { label: 'Smallest: a 3-instruction loop (ends when the input queue runs dry)', code: 'loop: IN x\n      OUT x\n      JUMP loop\n.data\nx: 0\n' },
        { label: 'Fastest: straight-line code, no loop', code: 'IN x\nOUT x\nIN x\nOUT x\nIN x\nOUT x\nHALT\n.data\nx: 0\n' }
      ] },
    { id: 'add', n: 2, title: 'Add two numbers', mem: MEM,
      story: 'Two numbers arrive. Output their sum. The ALU can only add a memory cell to the accumulator R, so you have to move numbers through R.',
      tests: [T([3, 4], [7]), T([10, -4], [6]), T([0, 0], [0]), T([-8, -2], [-10]), T([25, 17], [42])],
      par: { size: 7, cycles: 35 },
      hint: 'LOAD a puts cell a into R. ADD b makes R = R + b. STORE writes R back into a cell. OUT can only print a cell, never R directly, so store the result before printing.',
      starter: '; Level 2 - Add two numbers\n; LOAD a  : R = a      ADD b : R = R + b      STORE c : c = R\nIN a\nIN b\n; ... your code ...\nHALT\n.data\na: 0\nb: 0\n',
      solutions: [{ label: 'Load, add, store, print', code: 'IN a\nIN b\nLOAD a\nADD b\nSTORE a\nOUT a\nHALT\n.data\na: 0\nb: 0\n' }] },
    { id: 'reverse', n: 3, title: 'Reverse three', mem: MEM,
      story: 'Three numbers arrive. Output them in the opposite order. The input device cannot rewind, so memory has to remember them for you.',
      tests: [T([1, 2, 3], [3, 2, 1]), T([9, -4, 0], [0, -4, 9]), T([5, 5, 7], [7, 5, 5]), T([10, 20, 30], [30, 20, 10])],
      par: { size: 7, cycles: 28 },
      hint: 'Each IN needs its own cell: read all three first, then print them last-to-first.',
      starter: '; Level 3 - Reverse three\nIN a\n; ... your code ...\nHALT\n.data\na: 0\n',
      solutions: [{ label: 'Three cells, print backwards', code: 'IN a\nIN b\nIN c\nOUT c\nOUT b\nOUT a\nHALT\n.data\na: 0\nb: 0\nc: 0\n' }] },
    { id: 'countdown', n: 4, title: 'Countdown', mem: MEM,
      story: 'One number n arrives (1 or more). Output n, n-1, ..., 1. You need a loop, and a loop needs a conditional jump.',
      tests: [T([1], [1]), T([3], [3, 2, 1]), T([5], seq(5, 1)), T([8], seq(8, 1))],
      par: { size: 6, cycles: 76 },
      hint: 'COMPARE x sets GT when cell x is bigger than R. All registers start at 0 and you never have to touch R, so COMPARE n asks "is n still above 0?". DECREMENT n lowers a cell by one without using R. JUMPGT loops back while GT is set.',
      starter: '; Level 4 - Countdown\n; COMPARE x : GT if x > R, EQ if x = R, LT if x < R   (R starts at 0)\n; JUMPGT L  : jump to label L if GT\nIN n\nloop: OUT n\n; ... your code ...\nHALT\n.data\nn: 0\n',
      solutions: [{ label: 'Print, decrement, compare with 0, jump back', code: 'IN n\nloop: OUT n\n      DECREMENT n\n      COMPARE n   ; R is still 0\n      JUMPGT loop\nHALT\n.data\nn: 0\n' }] },
    { id: 'max', n: 5, title: 'Bigger of two', mem: MEM,
      story: 'Two numbers arrive. Output the bigger one (if they are equal, output either). This is an if-else, built from COMPARE and a jump.',
      tests: [T([3, 8], [8]), T([8, 3], [8]), T([5, 5], [5]), T([-2, -9], [-2]), T([0, 4], [4])],
      par: { size: 9, cycles: 35 },
      hint: 'LOAD a, then COMPARE b: GT means b is bigger than a. Jump over one OUT or the other; each branch ends in its own HALT.',
      starter: '; Level 5 - Bigger of two\nIN a\nIN b\nLOAD a\nCOMPARE b   ; GT if b > a\n; ... your code ...\nHALT\n.data\na: 0\nb: 0\n',
      solutions: [{ label: 'COMPARE, then one of two OUTs', code: 'IN a\nIN b\nLOAD a\nCOMPARE b      ; GT if b > a\nJUMPGT bigger\nOUT a\nHALT\nbigger: OUT b\nHALT\n.data\na: 0\nb: 0\n' }] },
    { id: 'sum0', n: 6, title: 'Sum until 0', mem: MEM,
      story: 'Numbers keep arriving until a 0 shows up (the 0 is not part of the sum). Output the total. The program does not know in advance how many numbers there will be.',
      tests: [T([1, 2, 3, 0], [6]), T([0], [0]), T([10, -4, 0], [6]), T([5, 5, 5, 5, 0], [20]), T([-3, -4, 0], [-7])],
      par: { size: 9, cycles: 105 },
      hint: 'Keep the running total in a cell. After each IN, test whether the new number is 0 and leave the loop if it is. A cunning version keeps the total in R: ADD x, then COMPARE total: EQ means x was 0.',
      starter: '; Level 6 - Sum until 0\nloop: IN x\n; ... your code ...\nHALT\n.data\ntotal: 0\nx: 0\n',
      solutions: [
        { label: 'Total in R: STORE, IN, ADD, then COMPARE with the stored total (EQ means x was 0)', code: 'loop: STORE total\n      IN x\n      ADD x          ; R = total + x\n      COMPARE total  ; EQ only if x was 0\n      JUMPNEQ loop\nOUT total\nHALT\n.data\ntotal: 0\nx: 0\n' },
        { label: 'Plain version: total in a cell, test x against zero', code: 'loop: IN x\n      LOAD zero\n      COMPARE x\n      JUMPEQ done\n      LOAD total\n      ADD x\n      STORE total\n      JUMP loop\ndone: OUT total\n      HALT\n.data\ntotal: 0\nx: 0\nzero: 0\n' }
      ] },
    { id: 'mul', n: 7, title: 'Multiply', mem: MEM,
      story: 'There is no MULTIPLY instruction. Two numbers a and b arrive (b is at least 1). Output a x b by adding a to a total b times. Memory is tight: 16 cells for code and data together.',
      tests: [T([3, 4], [12]), T([7, 1], [7]), T([0, 5], [0]), T([6, 9], [54]), T([-2, 3], [-6])],
      par: { size: 11, cycles: 174 },
      hint: 'Keep a total p (start 0) and a counter b. Each pass: p = p + a, DECREMENT b, then go round again while b is still above 0. To test b you need R = 0 first: LOAD a cell that holds 0.',
      starter: '; Level 7 - Multiply by repeated addition\nIN a\nIN b\nloop: LOAD p\n; ... your code ...\nHALT\n.data\na: 0\nb: 0\np: 0\nzero: 0\n',
      solutions: [{ label: 'Repeat: p += a, b -= 1, until b is 0', code: 'IN a\nIN b\nloop: LOAD p\n      ADD a\n      STORE p\n      DECREMENT b\n      LOAD zero\n      COMPARE b\n      JUMPGT loop\nOUT p\nHALT\n.data\na: 0\nb: 0\np: 0\nzero: 0\n' }] },
    { id: 'sandbox', n: 8, title: 'Sandbox', sandbox: true, mem: 32,
      story: 'No goal, no stars. Type your own program, choose the input numbers and memory size, and watch every fetch, decode and execute step.',
      tests: [], par: null, hint: '', solutions: [],
      starter: '; Sandbox - read two numbers, print their difference\nIN a\nIN b\nLOAD a\nSUBTRACT b   ; R = a - b\nSTORE a\nOUT a\nHALT\n.data\na: 0\nb: 0\n',
      sandboxInput: [9, 4] }
  ];

  function arrEq(a, b) { if (a.length !== b.length) return false; for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }

  // Run one assembled program on one test. ended: 'halt' | 'wait' (input queue empty at IN) | 'error' | 'limit'
  function runTest(asm, test) {
    var m = VN.create(asm, { input: test.in, maxInstr: MAXI });
    VN.run(m);
    var ended = m.error ? 'error' : m.halted ? 'halt' : m.waiting ? 'wait' : 'limit';
    var pass = ended !== 'error' && ended !== 'limit' && arrEq(m.out, test.out);
    return { pass: pass, out: m.out.slice(), expected: test.out, instr: m.instrCount, micro: m.microCount, ended: ended, error: m.error };
  }

  // Score a source program against a level. Pure: no DOM.
  function evaluate(level, src) {
    var asm = VN.assemble(src, { size: level.mem });
    if (!asm.ok) return { ok: false, errors: asm.errors };
    var results = level.tests.map(function (t) { return runTest(asm, t); });
    var solved = results.every(function (r) { return r.pass; });
    var cycles = results.reduce(function (s, r) { return s + r.instr; }, 0);
    var size = asm.codeLen, cells = asm.size - countFree(asm);
    return { ok: true, solved: solved, results: results, size: size, cells: cells, cycles: cycles,
             stars: { solved: solved, small: solved && size <= level.par.size, fast: solved && cycles <= level.par.cycles } };
  }
  function countFree(asm) { var n = 0; asm.cells.forEach(function (c) { if (c.kind === 'free') n++; }); return n; }

  var API = { LEVELS: LEVELS, evaluate: evaluate, runTest: runTest, MAXI: MAXI };
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; return; }
  global.CPUPuzzles = API;

  /* ═════════════ Part 2 — UI ═════════════ */
  var doc = document;
  var root = doc.getElementById('cp-app');
  if (!root) return;

  var STORE = 'co1005-cpu-puzzles-v1';
  var SPEEDS = [
    { name: 'Snail', ms: 1100 }, { name: 'Slow', ms: 600 }, { name: 'Medium', ms: 280 },
    { name: 'Fast', ms: 110 }, { name: 'Very fast', ms: 30 }, { name: 'Turbo', ms: 0, turbo: true }
  ];
  var saved = { levels: {}, src: {}, attempts: {}, speed: 2, big: false, lv: 0 };
  try { var raw = localStorage.getItem(STORE); if (raw) { var p = JSON.parse(raw); if (p && typeof p === 'object') saved = Object.assign(saved, p); } } catch (e) { /* ignore */ }
  function persist() { try { localStorage.setItem(STORE, JSON.stringify(saved)); } catch (e) { /* ignore */ } }
  var reduceMotion = false;
  try { reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* ignore */ }

  function el(tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function $(sel, ctx) { return (ctx || root).querySelector(sel); }
  function fmt(v) { return String(v); }

  var lvIndex = Math.min(Math.max(saved.lv | 0, 0), LEVELS.length - 1);
  var level = LEVELS[lvIndex];
  var asm = null, machine = null, testIdx = 0, timer = null, running = false, sandboxIn = null, sandboxMem = null;
  var UI = {};

  /* ---------- build static DOM ---------- */
  function build() {
    root.innerHTML = '';
    UI.levels = el('div', 'cp-levels'); UI.levels.setAttribute('role', 'group'); UI.levels.setAttribute('aria-label', 'Levels');
    root.appendChild(UI.levels);

    var grid = el('div', 'cp-grid'); root.appendChild(grid);
    var left = el('div', 'cp-left'), right = el('div', 'cp-right');
    grid.appendChild(left); grid.appendChild(right);

    // brief
    var brief = el('section', 'cp-card cp-brief');
    UI.title = el('h2', 'cp-title'); UI.story = el('p', 'cp-story');
    UI.testsBox = el('div', 'cp-tests-box');
    UI.budget = el('p', 'cp-budget');
    UI.sbBox = el('div', 'cp-sb');
    brief.appendChild(UI.title); brief.appendChild(UI.story); brief.appendChild(UI.testsBox); brief.appendChild(UI.sbBox); brief.appendChild(UI.budget);
    left.appendChild(brief);

    // editor
    var ed = el('section', 'cp-card');
    var edHead = el('div', 'cp-row cp-edhead');
    var lab = el('label', 'cp-lab', 'Your program'); lab.setAttribute('for', 'cp-src');
    UI.restore = el('button', 'btn ghost small', 'Restore starter code'); UI.restore.type = 'button';
    edHead.appendChild(lab); edHead.appendChild(UI.restore);
    UI.src = el('textarea', 'cp-src'); UI.src.id = 'cp-src'; UI.src.spellcheck = false; UI.src.rows = 15;
    UI.src.setAttribute('autocapitalize', 'off'); UI.src.setAttribute('autocorrect', 'off');
    UI.asmMsg = el('div', 'cp-asmmsg'); UI.asmMsg.setAttribute('aria-live', 'polite');
    ed.appendChild(edHead); ed.appendChild(UI.src); ed.appendChild(UI.asmMsg);
    left.appendChild(ed);

    // controls
    var ctl = el('section', 'cp-card cp-ctl');
    var row1 = el('div', 'cp-row');
    UI.step = btn('Step (1 tick)', 'btn small'); UI.stepI = btn('Step (1 instruction)', 'btn small');
    UI.run = btn('Run', 'btn primary small'); UI.reset = btn('Reset', 'btn ghost small');
    [UI.step, UI.stepI, UI.run, UI.reset].forEach(function (b) { row1.appendChild(b); });
    var row2 = el('div', 'cp-row cp-speedrow');
    var sl = el('label', 'cp-lab', 'Speed'); sl.setAttribute('for', 'cp-speed');
    UI.speed = el('input'); UI.speed.type = 'range'; UI.speed.id = 'cp-speed'; UI.speed.min = 0; UI.speed.max = SPEEDS.length - 1; UI.speed.step = 1;
    UI.speedName = el('span', 'cp-speedname');
    row2.appendChild(sl); row2.appendChild(UI.speed); row2.appendChild(UI.speedName);
    UI.testSel = el('select', 'cp-testsel'); UI.testSel.setAttribute('aria-label', 'Which test to watch');
    var tl = el('label', 'cp-lab', 'Watch'); tl.setAttribute('for', 'cp-testsel'); UI.testSel.id = 'cp-testsel';
    UI.sbInputWrap = el('span', 'cp-sbinput');
    row2.appendChild(tl); row2.appendChild(UI.testSel);
    UI.big = btn('Projector size', 'btn ghost small'); UI.big.setAttribute('aria-pressed', 'false');
    row2.appendChild(UI.big);
    var row3 = el('div', 'cp-row');
    UI.check = btn('Check all tests', 'btn primary'); UI.next = btn('Next level', 'btn'); UI.next.hidden = true;
    row3.appendChild(UI.check); row3.appendChild(UI.next);
    UI.status = el('p', 'cp-status'); UI.status.setAttribute('role', 'status'); UI.status.setAttribute('aria-live', 'polite');
    UI.result = el('div', 'cp-result');
    ctl.appendChild(row1); ctl.appendChild(row2); ctl.appendChild(row3); ctl.appendChild(UI.status); ctl.appendChild(UI.result);
    left.appendChild(ctl);

    // help
    UI.hintD = el('details', 'cp-card cp-details'); UI.hintD.appendChild(el('summary', null, 'Hint'));
    UI.hintP = el('p'); UI.hintD.appendChild(UI.hintP);
    UI.solD = el('details', 'cp-card cp-details'); UI.solSum = el('summary'); UI.solD.appendChild(UI.solSum);
    UI.solBody = el('div'); UI.solD.appendChild(UI.solBody);
    var isa = el('details', 'cp-card cp-details'); isa.appendChild(el('summary', null, 'Instruction set cheat sheet'));
    isa.appendChild(isaTable());
    left.appendChild(UI.hintD); left.appendChild(UI.solD); left.appendChild(isa);

    // right: machine
    var mach = el('section', 'cp-card cp-machine'); right.appendChild(mach);
    var top = el('div', 'cp-row cp-phaserow');
    UI.phases = {};
    ['fetch', 'decode', 'execute'].forEach(function (p) { var s = el('span', 'cp-phase', p.toUpperCase()); UI.phases[p] = s; top.appendChild(s); });
    UI.counter = el('span', 'cp-counter');
    top.appendChild(UI.counter);
    mach.appendChild(top);
    UI.say = el('div', 'cp-say'); UI.say.setAttribute('aria-live', 'polite'); mach.appendChild(UI.say);

    var io = el('div', 'cp-io');
    UI.inBox = el('div', 'cp-dev'); UI.inBox.appendChild(el('div', 'cp-devname', 'INPUT')); UI.inQ = el('div', 'cp-chips'); UI.inBox.appendChild(UI.inQ);
    UI.outBox = el('div', 'cp-dev'); UI.outBox.appendChild(el('div', 'cp-devname', 'OUTPUT'));
    UI.outQ = el('div', 'cp-chips'); UI.expRow = el('div', 'cp-chips cp-exp');
    UI.outBox.appendChild(UI.outQ); UI.expLab = el('div', 'cp-explab', 'target'); UI.outBox.appendChild(UI.expLab); UI.outBox.appendChild(UI.expRow);
    io.appendChild(UI.inBox); io.appendChild(UI.outBox);
    mach.appendChild(io);

    var cpu = el('div', 'cp-cpu'); UI.cpu = cpu;
    cpu.appendChild(el('div', 'cp-cpuname', 'CPU'));
    var regs = el('div', 'cp-regs'); UI.reg = {};
    [['PC', 'program counter'], ['IR', 'instruction register'], ['MAR', 'memory address'], ['MDR', 'memory data'], ['R', 'accumulator']].forEach(function (r) {
      var b = el('div', 'cp-reg'); b.appendChild(el('span', 'cp-rname', r[0] + ' · ' + r[1]));
      var v = el('span', 'cp-val', '0'); b.appendChild(v); var sub = el('span', 'cp-sub'); b.appendChild(sub);
      UI.reg[r[0]] = { box: b, val: v, sub: sub }; regs.appendChild(b);
    });
    var fl = el('div', 'cp-reg cp-flags'); fl.appendChild(el('span', 'cp-rname', 'flags'));
    var fv = el('span', 'cp-val'); fl.appendChild(fv); UI.reg.FLAGS = { box: fl, val: fv };
    regs.appendChild(fl);
    var units = el('div', 'cp-units');
    UI.reg.DEC = { box: el('div', 'cp-unit', 'decoder') }; UI.reg.ALU = { box: el('div', 'cp-unit', 'ALU') };
    units.appendChild(UI.reg.DEC.box); units.appendChild(UI.reg.ALU.box);
    cpu.appendChild(regs); cpu.appendChild(units);
    mach.appendChild(cpu);
    UI.reg.IN = { box: UI.inBox }; UI.reg.OUT = { box: UI.outBox };

    UI.memBox = el('div', 'cp-mem'); UI.reg.MEM = { box: UI.memBox };
    UI.memBox.appendChild(el('div', 'cp-cpuname', 'MEMORY'));
    UI.memGrid = el('div', 'cp-memgrid'); UI.memBox.appendChild(UI.memGrid);
    mach.appendChild(UI.memBox);
  }
  function btn(t, cls) { var b = el('button', cls, t); b.type = 'button'; return b; }
  function isaTable() {
    var t = el('table', 'cp-isa'); var th = el('tr');
    ['Instruction', 'Effect'].forEach(function (h) { th.appendChild(el('th', null, h)); }); t.appendChild(th);
    VN.OPS.forEach(function (o) { var tr = el('tr'); tr.appendChild(el('td', 'mono', o.arg ? o.name + ' X' : o.name)); tr.appendChild(el('td', null, o.meaning)); t.appendChild(tr); });
    ['JUMPGE', 'JUMPLE'].forEach(function (n) { var tr = el('tr'); tr.appendChild(el('td', 'mono', n + ' X')); tr.appendChild(el('td', null, 'pseudo: two real jumps (costs 2 cells)')); t.appendChild(tr); });
    var note = doc.createElement('caption'); note.textContent = 'X is a label or a cell number. R is the accumulator. Words in .data are numbers, not instructions.'; t.appendChild(note);
    return t;
  }

  /* ---------- level handling ---------- */
  function starsOf(id) { return saved.levels[id] || {}; }
  function paintLevels() {
    UI.levels.innerHTML = '';
    LEVELS.forEach(function (L, i) {
      var b = el('button', 'cp-lv' + (i === lvIndex ? ' on' : '')); b.type = 'button';
      var s = starsOf(L.id);
      var st = L.sandbox ? '' : (s.solved ? '★' : '☆') + (s.small ? '★' : '☆') + (s.fast ? '★' : '☆');
      b.appendChild(el('span', 'cp-lvn', String(L.n)));
      b.appendChild(el('span', 'cp-lvt', L.title));
      if (st) { var sp = el('span', 'cp-lvs', st); b.appendChild(sp); b.setAttribute('aria-label', 'Level ' + L.n + ': ' + L.title + ', ' + (s.solved ? 'solved' : 'not solved') + (s.small ? ', small star' : '') + (s.fast ? ', fast star' : '')); }
      if (i === lvIndex) b.setAttribute('aria-current', 'true');
      b.addEventListener('click', function () { selectLevel(i); });
      UI.levels.appendChild(b);
    });
  }
  function selectLevel(i) {
    stop(); lvIndex = i; level = LEVELS[i]; saved.lv = i; persist(); testIdx = 0;
    UI.result.innerHTML = ''; UI.next.hidden = true; UI.status.textContent = '';
    UI.title.textContent = 'Level ' + level.n + ' · ' + level.title;
    UI.story.textContent = level.story;
    UI.src.value = typeof saved.src[level.id] === 'string' ? saved.src[level.id] : level.starter;
    UI.check.hidden = !!level.sandbox; UI.testSel.parentNode && (UI.testSel.hidden = !!level.sandbox);
    UI.hintD.hidden = !!level.sandbox; UI.solD.hidden = !!level.sandbox; UI.hintD.open = false; UI.solD.open = false;
    UI.hintP.textContent = level.hint;
    paintTests(); paintSandbox(); paintSolution(); paintLevels(); paintBudget();
    UI.testSel.innerHTML = '';
    level.tests.forEach(function (t, k) { var o = el('option', null, 'Test ' + (k + 1) + ': ' + t.in.join(', ')); o.value = k; UI.testSel.appendChild(o); });
    var tl = doc.querySelector('label[for="cp-testsel"]'); if (tl) tl.hidden = !!level.sandbox;
    rebuildMachine();
  }
  function paintTests() {
    UI.testsBox.innerHTML = '';
    if (level.sandbox) return;
    var t = el('table', 'cp-tests'); var cap = doc.createElement('caption'); cap.textContent = 'Every test your program must pass'; t.appendChild(cap);
    var h = el('tr'); ['#', 'Input queue', 'Expected output', ''].forEach(function (x) { h.appendChild(el('th', null, x)); }); t.appendChild(h);
    level.tests.forEach(function (x, k) {
      var tr = el('tr'); tr.id = 'cp-t' + k; tr.appendChild(el('td', null, String(k + 1))); tr.appendChild(el('td', 'mono', x.in.join(', ')));
      tr.appendChild(el('td', 'mono', x.out.join(', '))); tr.appendChild(el('td', 'cp-tmark')); t.appendChild(tr);
    });
    UI.testsBox.appendChild(t);
  }
  function paintSandbox() {
    UI.sbBox.innerHTML = '';
    if (!level.sandbox) return;
    sandboxIn = sandboxIn || (saved.sbIn != null ? saved.sbIn : level.sandboxInput.join(', '));
    sandboxMem = sandboxMem || (saved.sbMem || level.mem);
    var l1 = el('label', 'cp-lab', 'Input numbers (separated by commas or spaces)'); l1.setAttribute('for', 'cp-sbin');
    var inp = el('input', 'cp-input'); inp.id = 'cp-sbin'; inp.value = sandboxIn; inp.type = 'text';
    var l2 = el('label', 'cp-lab', 'Memory cells'); l2.setAttribute('for', 'cp-sbmem');
    var sel = el('select'); sel.id = 'cp-sbmem';
    [16, 32, 64, 128].forEach(function (n) { var o = el('option', null, String(n)); o.value = n; if (n === Number(sandboxMem)) o.selected = true; sel.appendChild(o); });
    UI.sbBox.appendChild(l1); UI.sbBox.appendChild(inp); UI.sbBox.appendChild(l2); UI.sbBox.appendChild(sel);
    inp.addEventListener('input', function () { sandboxIn = inp.value; saved.sbIn = sandboxIn; persist(); stop(); rebuildMachine(); });
    sel.addEventListener('change', function () { sandboxMem = Number(sel.value); saved.sbMem = sandboxMem; persist(); stop(); rebuildMachine(); });
  }
  function parseInputs(s) {
    var parts = String(s).split(/[\s,;]+/).filter(Boolean), out = [];
    for (var i = 0; i < parts.length; i++) { if (!/^[+-]?\d+$/.test(parts[i])) return null; out.push(parseInt(parts[i], 10)); }
    return out;
  }
  function currentTest() {
    if (level.sandbox) { var v = parseInputs(sandboxIn); return { in: v || [], out: [], bad: v === null }; }
    return level.tests[testIdx];
  }
  function memSize() { return level.sandbox ? Number(sandboxMem || level.mem) : level.mem; }
  function paintBudget() {
    if (level.sandbox) { UI.budget.textContent = 'The sandbox has no par values.'; return; }
    UI.budget.textContent = 'Memory: ' + level.mem + ' cells for code and data together (hard limit).  Par for stars: ' + level.par.size + ' instructions or fewer (small), ' + level.par.cycles + ' cycles or fewer over all tests (fast).';
  }
  function paintSolution() {
    var a = Number(saved.attempts[level.id] || 0), solved = starsOf(level.id).solved;
    var open = a >= 3 || solved;
    UI.solSum.textContent = open ? 'Show a solution' : 'Show a solution (unlocks after 3 checks; ' + a + ' so far)';
    UI.solBody.innerHTML = '';
    if (!open) { UI.solBody.appendChild(el('p', 'cp-dim', 'Try a little longer, or open the hint first.')); UI.solD.classList.add('locked'); return; }
    UI.solD.classList.remove('locked');
    level.solutions.forEach(function (sol) {
      var r = evaluate(level, sol.code);
      var box = el('div', 'cp-sol'); box.appendChild(el('p', 'cp-sollab', sol.label + ' · ' + r.size + ' instructions, ' + r.cycles + ' cycles'));
      var pre = el('pre'); pre.textContent = sol.code; box.appendChild(pre);
      var b = btn('Load into editor', 'btn small'); b.addEventListener('click', function () { UI.src.value = sol.code; onEdit(); UI.status.textContent = 'Solution loaded into the editor.'; });
      box.appendChild(b); UI.solBody.appendChild(box);
    });
  }

  /* ---------- machine ---------- */
  function rebuildMachine() {
    stop();
    var src = UI.src.value;
    saved.src[level.id] = src; persist();
    asm = VN.assemble(src, { size: memSize() });
    UI.asmMsg.innerHTML = ''; UI.asmMsg.className = 'cp-asmmsg';
    var t = currentTest();
    if (t.bad) { asm = null; UI.asmMsg.className = 'cp-asmmsg bad'; UI.asmMsg.textContent = 'The input list must contain whole numbers only.'; }
    else if (!asm.ok) {
      UI.asmMsg.className = 'cp-asmmsg bad';
      asm.errors.forEach(function (e) { UI.asmMsg.appendChild(el('div', null, (e.line ? 'Line ' + e.line + ': ' : '') + e.msg)); });
    } else {
      UI.asmMsg.className = 'cp-asmmsg ok';
      var cellsUsed = asm.codeLen + (asm.cells.filter(function (c) { return c.kind === 'data'; }).length);
      UI.asmMsg.textContent = 'Assembled: ' + asm.codeLen + ' instruction cell' + (asm.codeLen === 1 ? '' : 's') + ', ' + cellsUsed + ' of ' + asm.size + ' memory cells used.';
    }
    machine = (asm && asm.ok) ? VN.create(asm, { input: t.in, maxInstr: MAXI }) : null;
    buildMem();
    UI.say.textContent = machine ? 'Press Step or Run. The CPU will fetch the instruction at address 0 first.' : 'Fix the problems above, then the machine can start.';
    render();
  }
  function buildMem() {
    UI.memGrid.innerHTML = ''; UI.cells = [];
    var n = asm && asm.ok ? asm.size : memSize();
    UI.memGrid.style.setProperty('--cols', n <= 16 ? 4 : n <= 32 ? 4 : 8);
    for (var a = 0; a < n; a++) {
      var c = el('div', 'cp-cell'); var ad = el('span', 'cp-addr', String(a)); var nm = el('span', 'cp-cname'); var v = el('span', 'cp-cval');
      c.appendChild(ad); c.appendChild(nm); c.appendChild(v); UI.memGrid.appendChild(c); UI.cells.push({ box: c, nm: nm, val: v });
    }
  }

  var REGKEYS = ['PC', 'IR', 'MAR', 'MDR', 'R', 'DEC', 'ALU', 'FLAGS', 'MEM', 'IN', 'OUT'];
  function render() {
    var m = machine, k;
    REGKEYS.forEach(function (key) { var r = UI.reg[key]; if (r) r.box.classList.remove('src', 'dst'); });
    UI.cells.forEach(function (c) { c.box.classList.remove('pc', 'mar', 'rd', 'wr'); });
    ['fetch', 'decode', 'execute'].forEach(function (p) { UI.phases[p].classList.remove('on'); });
    if (!m) {
      UI.counter.textContent = ''; ['PC', 'IR', 'MAR', 'MDR', 'R'].forEach(function (r) { UI.reg[r].val.textContent = '–'; UI.reg[r].sub && (UI.reg[r].sub.textContent = ''); });
      UI.reg.FLAGS.val.textContent = '–'; UI.inQ.innerHTML = ''; UI.outQ.innerHTML = ''; paintExpected(null);
      UI.cells.forEach(function (c) { c.val.textContent = ''; c.nm.textContent = ''; c.box.className = 'cp-cell'; });
      setButtons(); return;
    }
    var ab = m.addrBits;
    UI.reg.PC.val.textContent = m.pc; UI.reg.MAR.val.textContent = m.mar; UI.reg.MDR.val.textContent = m.mdr; UI.reg.R.val.textContent = m.r;
    UI.reg.IR.val.textContent = m.ir; UI.reg.IR.sub.textContent = VN.disasm(m.ir, ab) + (VN.bits(m.ir, ab) ? '  (' + VN.bits(m.ir, ab) + ')' : '');
    UI.reg.PC.sub.textContent = ''; UI.reg.R.sub.textContent = ''; UI.reg.MAR.sub.textContent = ''; UI.reg.MDR.sub.textContent = '';
    UI.reg.FLAGS.val.textContent = 'GT ' + m.gt + '   EQ ' + m.eq + '   LT ' + m.lt;
    UI.counter.textContent = 'cycle ' + m.instrCount + ' · tick ' + m.microCount;
    var lm = m.lastMicro;
    if (lm) {
      UI.phases[lm.phase].classList.add('on');
      lm.flow.forEach(function (f) { var s = UI.reg[f[0]], d = UI.reg[f[1]]; if (s) s.box.classList.add('src'); if (d) d.box.classList.add('dst'); });
    }
    // memory
    for (k = 0; k < m.size; k++) {
      var c = UI.cells[k]; if (!c) continue;
      var kind = asm.cells[k].kind, w = m.mem[k];
      c.box.className = 'cp-cell ' + kind;
      c.val.textContent = kind === 'code' ? VN.disasm(w, ab) : String(w);
      c.nm.textContent = asm.names[k] || '';
      c.box.setAttribute('title', 'cell ' + k + ' = ' + w + (VN.bits(w, ab) ? ' (' + VN.bits(w, ab) + ')' : ''));
    }
    if (UI.cells[m.pc] && !m.halted) UI.cells[m.pc].box.classList.add('pc');
    if (lm && UI.cells[m.mar] && lm.phase !== 'decode') UI.cells[m.mar].box.classList.add('mar');
    if (m.lastRead != null && UI.cells[m.lastRead]) UI.cells[m.lastRead].box.classList.add('rd');
    if (m.lastWrite != null && UI.cells[m.lastWrite]) UI.cells[m.lastWrite].box.classList.add('wr');
    // I/O
    UI.inQ.innerHTML = '';
    var tin = currentTest().in;
    if (!tin.length) UI.inQ.appendChild(el('span', 'cp-dim', 'empty'));
    tin.forEach(function (v, i) { UI.inQ.appendChild(el('span', 'cp-chip' + (i < m.inPos ? ' used' : i === m.inPos ? ' next' : ''), String(v))); });
    UI.outQ.innerHTML = '';
    var exp = level.sandbox ? null : currentTest().out;
    if (!m.out.length) UI.outQ.appendChild(el('span', 'cp-dim', 'nothing yet'));
    m.out.forEach(function (v, i) {
      var cls = 'cp-chip' + (exp ? (exp[i] === v ? ' good' : ' badc') : ''); UI.outQ.appendChild(el('span', cls, String(v)));
    });
    paintExpected(exp);
    if (lm && lm.text) UI.say.textContent = '[' + lm.phase + '] ' + lm.label + ' — ' + lm.text;
    if (m.error) UI.say.textContent = 'Machine error: ' + m.error;
    setButtons();
  }
  function paintExpected(exp) {
    UI.expRow.innerHTML = '';
    UI.expLab.hidden = UI.expRow.hidden = !exp;
    if (exp) exp.forEach(function (v) { UI.expRow.appendChild(el('span', 'cp-chip ghost', String(v))); });
  }
  function finished() { return !machine || machine.halted || machine.error || machine.waiting; }
  function setButtons() {
    var dead = !machine || finished();
    UI.step.disabled = UI.stepI.disabled = dead; UI.run.disabled = !machine || (finished() && !running);
    UI.run.textContent = running ? 'Pause' : 'Run';
    UI.check.disabled = !asm || !asm.ok;
  }
  function endMessage() {
    var m = machine, t = currentTest(), msg;
    if (m.error) msg = 'The machine stopped with an error: ' + m.error;
    else {
      var how = m.halted ? 'HALT reached' : 'The input queue is empty and the program asked for more (IN), so the machine waits and the run ends';
      if (level.sandbox) msg = how + '. Output: ' + (m.out.join(', ') || 'nothing') + '. ' + m.instrCount + ' cycles, ' + m.microCount + ' ticks.';
      else {
        var ok = arrEq(m.out, t.out);
        msg = how + '. ' + (ok ? 'Output matches the expected numbers for test ' + (testIdx + 1) + '. Press "Check all tests" to score it.' : 'Output is ' + (m.out.join(', ') || 'empty') + ' but test ' + (testIdx + 1) + ' expects ' + t.out.join(', ') + '.') + ' (' + m.instrCount + ' cycles)';
      }
    }
    UI.status.textContent = msg;
  }

  /* ---------- running ---------- */
  function tick() {
    timer = null;
    if (!running || !machine) return;
    var sp = SPEEDS[saved.speed];
    if (sp.turbo) {
      var n = 0; while (n++ < 400 && !finished()) VN.stepInstr(machine);
    } else VN.stepMicro(machine);
    render();
    if (finished()) { running = false; UI.say.setAttribute('aria-live', 'polite'); setButtons(); endMessage(); return; }
    timer = setTimeout(tick, sp.turbo ? 16 : sp.ms);
  }
  function start() {
    if (!machine) return;
    if (finished()) return;
    running = true; UI.say.setAttribute('aria-live', 'off'); setButtons();
    UI.status.textContent = 'Running at ' + SPEEDS[saved.speed].name.toLowerCase() + ' speed.';
    timer = setTimeout(tick, 0);
  }
  function stop() { running = false; if (timer) { clearTimeout(timer); timer = null; } if (UI.say) UI.say.setAttribute('aria-live', 'polite'); }
  function doStep(whole) {
    if (!machine || finished()) return;
    stop(); if (whole) VN.stepInstr(machine); else VN.stepMicro(machine);
    render(); if (finished()) endMessage(); else UI.status.textContent = '';
  }

  /* ---------- scoring ---------- */
  function check() {
    stop();
    var r = evaluate(level, UI.src.value);
    UI.result.innerHTML = ''; UI.next.hidden = true;
    if (!r.ok) { UI.status.textContent = 'The program does not assemble yet - see the messages under the editor.'; return; }
    saved.attempts[level.id] = Number(saved.attempts[level.id] || 0) + 1;
    r.results.forEach(function (x, k) {
      var row = doc.getElementById('cp-t' + k); if (!row) return;
      var mk = row.querySelector('.cp-tmark'); mk.textContent = x.pass ? 'pass' : 'fail'; mk.className = 'cp-tmark ' + (x.pass ? 'good' : 'bad');
    });
    var first = null; r.results.forEach(function (x, k) { if (!x.pass && first === null) first = k; });
    var box = el('div', 'cp-score');
    if (r.solved) {
      var sv = saved.levels[level.id] || {};
      var prevSolved = sv.solved;
      sv.solved = true; sv.small = sv.small || r.stars.small; sv.fast = sv.fast || r.stars.fast;
      sv.bestSize = Math.min(sv.bestSize || 1e9, r.size); sv.bestCycles = Math.min(sv.bestCycles || 1e9, r.cycles);
      saved.levels[level.id] = sv;
      box.appendChild(el('p', 'cp-big', 'All ' + level.tests.length + ' tests passed.'));
      var ul = el('ul', 'cp-stars');
      ul.appendChild(el('li', 'on', 'Solved: the output is right for every test'));
      ul.appendChild(el('li', r.stars.small ? 'on' : '', 'Small: ' + r.size + ' instructions (par ' + level.par.size + ')' + (r.stars.small ? '' : ' - too long for this star')));
      ul.appendChild(el('li', r.stars.fast ? 'on' : '', 'Fast: ' + r.cycles + ' cycles over all tests (par ' + level.par.cycles + ')' + (r.stars.fast ? '' : ' - too slow for this star')));
      box.appendChild(ul);
      box.appendChild(el('p', 'cp-dim', 'Size and speed pull in different directions: a loop is shorter but runs more instructions; unrolled code is longer but quicker. Each star is kept separately, so you can earn them with different programs.' ));
      UI.status.textContent = 'Level solved with ' + (1 + (r.stars.small ? 1 : 0) + (r.stars.fast ? 1 : 0)) + ' star(s) this time.';
      if (lvIndex + 1 < LEVELS.length) { UI.next.hidden = false; }
      if (!prevSolved) { /* first solve */ }
    } else {
      var x = r.results[first];
      var why = x.error ? 'the machine stopped with an error: ' + x.error
        : x.ended === 'limit' ? 'it never finished (probably an endless loop)'
        : 'it printed ' + (x.out.join(', ') || 'nothing') + ' but ' + x.expected.join(', ') + ' was expected';
      box.appendChild(el('p', 'cp-big bad', r.results.filter(function (y) { return y.pass; }).length + ' of ' + level.tests.length + ' tests pass.'));
      box.appendChild(el('p', null, 'Test ' + (first + 1) + ' fails: ' + why + '.'));
      var wb = btn('Watch test ' + (first + 1), 'btn small'); wb.addEventListener('click', function () { UI.testSel.value = first; testIdx = first; rebuildMachine(); start(); });
      box.appendChild(wb);
      UI.status.textContent = 'Not yet: test ' + (first + 1) + ' fails.';
    }
    UI.result.appendChild(box);
    persist(); paintLevels(); paintSolution();
  }

  /* ---------- wiring ---------- */
  function onEdit() { UI.result.innerHTML = ''; UI.next.hidden = true; level.tests.forEach(function (t, k) { var mk = doc.querySelector('#cp-t' + k + ' .cp-tmark'); if (mk) { mk.textContent = ''; mk.className = 'cp-tmark'; } }); rebuildMachine(); }
  function wire() {
    var deb = null;
    UI.src.addEventListener('input', function () { clearTimeout(deb); deb = setTimeout(onEdit, 250); });
    UI.restore.addEventListener('click', function () { UI.src.value = level.starter; onEdit(); UI.status.textContent = 'Starter code restored.'; });
    UI.step.addEventListener('click', function () { doStep(false); });
    UI.stepI.addEventListener('click', function () { doStep(true); });
    UI.run.addEventListener('click', function () { if (running) { stop(); setButtons(); UI.status.textContent = 'Paused.'; } else start(); });
    UI.reset.addEventListener('click', function () { rebuildMachine(); UI.status.textContent = 'Machine reset.'; });
    UI.check.addEventListener('click', check);
    UI.next.addEventListener('click', function () { selectLevel(lvIndex + 1); doc.getElementById('cp-app').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' }); });
    UI.testSel.addEventListener('change', function () { testIdx = Number(UI.testSel.value); rebuildMachine(); });
    UI.speed.value = saved.speed;
    function paintSpeed() { UI.speedName.textContent = SPEEDS[saved.speed].name; UI.speed.setAttribute('aria-valuetext', SPEEDS[saved.speed].name); }
    UI.speed.addEventListener('input', function () { saved.speed = Number(UI.speed.value); persist(); paintSpeed(); });
    paintSpeed();
    UI.big.addEventListener('click', function () { saved.big = !saved.big; persist(); applyBig(); });
    applyBig();
  }
  function applyBig() { root.classList.toggle('cp-large', !!saved.big); UI.big.setAttribute('aria-pressed', saved.big ? 'true' : 'false'); }

  build(); wire(); selectLevel(lvIndex);
})(typeof window !== 'undefined' ? window : this);
