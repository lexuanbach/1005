/* Von Neumann Machine workbench — pure helpers (no DOM). Global VNWorkbenchLib in the browser, module.exports in Node.
   Everything here is testable in Node: input and cell parsing, settings -> engine options, assembler messages,
   the editor-line marker for a machine state, breakpoints, the chunked (time-sliced) runner, test-case parsing and judging,
   the instruction table (measured on the engine itself), the statistics model, the trace text and the registry presets. */
(function (global) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;
  var D = {};                       // dependency overrides (tests): { VN, Store, Examples }
  function VN() { return D.VN || (isNode ? require('./vn-machine.js') : global.VNMachine); }
  function Store() { return D.Store || (isNode ? require('./vn-store.js') : global.VNStore); }
  function Examples() { return D.Examples || (isNode ? require('./vn-examples.js') : global.VNExamples); }

  var MAX_SAFE = 9007199254740991;
  var STATUS_WORDS = ['waiting', 'step-guard', 'pc-range', 'bad-word', 'div-zero', 'ptr-range', 'overflow'];
  var SIZES = ['auto', 16, 32, 64, 128, 256];
  var GUARDS = [1000, 10000, 100000, 1000000];

  /* ───────────── input queue and cell values ───────────── */
  // The input queue: whitespace, commas or semicolons between whole numbers. Anything else is dropped (and reported by inputProblems),
  // so what the hint says is ignored really is ignored: "3.5" is NOT read as 3 and 5.
  function parseInput(text) {
    var out = [];
    String(text == null ? '' : text).split(/[\s,;]+/).forEach(function (t) {
      if (!/^[-+]?\d+$/.test(t)) return;
      var v = parseInt(t, 10);
      if (Math.abs(v) <= MAX_SAFE) out.push(v === 0 ? 0 : v);
    });
    return out;
  }
  // tokens of the input box that are not whole numbers (they are ignored); at most 5
  function inputProblems(text) {
    var bad = [];
    String(text == null ? '' : text).split(/[\s,;]+/).forEach(function (t) {
      if (!t) return;
      if (!/^[-+]?\d+$/.test(t) || Math.abs(Number(t)) > MAX_SAFE) bad.push(t.length > 12 ? t.slice(0, 12) + '…' : t);
    });
    return bad.slice(0, 5);
  }
  function parseCellValue(text) {
    var t = String(text == null ? '' : text).trim();
    var m = /^([+-]?)(?:0[xX]([0-9a-fA-F]+)|0[bB]([01]+)|(\d+))$/.exec(t);
    if (!m) return { ok: false, error: 'Type a whole number: 12, 0x1F or 0b101' };
    var v = m[2] !== undefined ? parseInt(m[2], 16) : m[3] !== undefined ? parseInt(m[3], 2) : parseInt(m[4], 10);
    if (!isFinite(v) || v > MAX_SAFE) return { ok: false, error: 'That number is too big' };
    if (m[1] === '-') v = -v;
    return { ok: true, value: v === 0 ? 0 : v };
  }
  function padLeft(s, n) { while (s.length < n) s = '0' + s; return s; }
  // value shown in the chosen base. W (wordBits) is used to pad hex / binary and, with wrap, to show negatives as bit patterns
  function formatValue(v, base, wordBits, wrap) {
    if (typeof v !== 'number' || !isFinite(v)) return String(v);
    if (base !== 'hex' && base !== 'bin') return String(v);
    var radix = base === 'hex' ? 16 : 2, prefix = base === 'hex' ? '0x' : '0b', W = wordBits || 0;
    var digits = base === 'hex' ? Math.ceil(W / 4) : W;
    if (v < 0 && wrap && W && v >= -Math.pow(2, W - 1)) return prefix + padLeft((v + Math.pow(2, W)).toString(radix).toUpperCase(), digits);
    var s = Math.abs(v).toString(radix).toUpperCase();
    if (v >= 0 && W && v < Math.pow(2, W)) s = padLeft(s, digits);
    return (v < 0 ? '-' : '') + prefix + s;
  }

  /* ───────────── settings and assembling ───────────── */
  function cleanSettings(o) { return Store().cleanSettings(o); }
  function defaultSettings() { return cleanSettings(Store().DEFAULT_SETTINGS); }
  // full machine settings of an example (every key set), keeping the viewer's own number base
  function settingsForExample(ex, current) {
    var s = Examples().settingsOf(ex);
    return cleanSettings({ size: s.size, isa: s.isa, memLatency: s.memLatency, wrap: s.wrap, maxInstr: s.maxInstr, base: current && current.base });
  }
  function assembleOpts(settings) {
    var o = { isa: settings.isa === 'ext' ? 'ext' : 'lecture' };
    if (settings.size !== 'auto') o.size = settings.size;
    return o;
  }
  function runOpts(settings, input) {
    return { input: input || [], maxInstr: settings.maxInstr, memLatency: settings.memLatency, wrap: !!settings.wrap };
  }
  function assembleWith(code, settings) { return VN().assemble(String(code), assembleOpts(settings)); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }
  function dataCellCount(asm) { var n = 0; (asm.cells || []).forEach(function (c) { if (c && c.kind === 'data') n++; }); return n; }
  // the aria-live summary line under the editor
  function summarize(asm) {
    if (!asm) return '';
    if (!asm.ok) {
      var ne = asm.errors.length;
      return plural(ne, 'error') + ': fix ' + (ne === 1 ? 'it' : 'them') + ' to load the program';
    }
    var w = (asm.warnings || []).filter(function (x) { return x.severity === 'warning'; }).length;
    var n = (asm.warnings || []).filter(function (x) { return x.severity !== 'warning'; }).length;
    var s = 'Assembled: ' + plural(asm.codeLen, 'word') + ', ' + plural(dataCellCount(asm), 'data cell') + ', ' + asm.size + '-cell memory';
    if (w) s += ', ' + plural(w, 'warning');
    if (n) s += ', ' + plural(n, 'note');
    return s;
  }
  /* ───────────── "a number operand is a cell address" (the classic beginner trap) ───────────── */
  var ADDR_OPS = { LOAD: 'LOADI', ADD: 'ADDI', SUBTRACT: 'SUBI', COMPARE: 'CMPI', STORE: '', CLEAR: '', INCREMENT: '', DECREMENT: '', IN: '', OUT: '', LOADP: '', STOREP: '', MUL: '', DIV: '', MOD: '' };
  var NOTE_OPS = { LOAD: 1, ADD: 1, SUBTRACT: 1, COMPARE: 1 };
  var LITERAL = /^(?:0[xX][0-9a-fA-F]+|0[bB][01]+|\d+)$/;
  // { op, token, start (0-based), value } when `line` is "[label:] OP <numeric literal>"; null otherwise
  function literalOperand(line) {
    var cut = String(line == null ? '' : line), i = cut.indexOf(';'), j = cut.indexOf('//');
    if (j >= 0 && (i < 0 || j < i)) i = j;
    if (i >= 0) cut = cut.slice(0, i);
    var m = /^(\s*(?:[A-Za-z_]\w*\s*:\s*)?)([A-Za-z]+)(\s+)(\S+)\s*$/.exec(cut);
    if (!m) return null;
    var op = m[2].toUpperCase();
    if (!Object.prototype.hasOwnProperty.call(ADDR_OPS, op) || !LITERAL.test(m[4])) return null;
    var tok = m[4], v = /^0[xX]/.test(tok) ? parseInt(tok.slice(2), 16) : /^0[bB]/.test(tok) ? parseInt(tok.slice(2), 2) : parseInt(tok, 10);
    return { op: op, token: tok, start: m[1].length + m[2].length + m[3].length, value: v };
  }
  // hover text for such an operand, or null (immediates, jumps and everything else keep the editor's own hover)
  function operandHover(line, start, isa) {
    var lit = literalOperand(line);
    if (!lit || lit.start !== start) return null;
    var alt = isa === 'ext' ? ADDR_OPS[lit.op] : '';
    return 'Cell ' + lit.value + ' (0x' + lit.value.toString(16).toUpperCase() + '), not the number ' + lit.value + '. An operand names a memory cell; a constant has to live in a data cell' + (alt ? ', or use ' + alt + ' to put a number straight into the instruction' : '') + '.';
  }
  // { address: true } for every cell an instruction of the assembled program can write (IN, STORE, CLEAR, INCREMENT, DECREMENT);
  // null when the program has a STOREP (its target is only known at run time)
  var WRITERS = { IN: 1, STORE: 1, CLEAR: 1, INCREMENT: 1, DECREMENT: 1 };
  function writtenCells(asm) {
    var w = {}, vn = VN();
    for (var a = 0; a < asm.size; a++) {
      var c = asm.cells && asm.cells[a];
      if (!c || c.kind !== 'code') continue;
      var d = vn.decode(asm.mem[a], asm.addrBits, asm.opBits);
      if (!d || !d.op) continue;
      if (d.op.name === 'STOREP') return null;
      if (Object.prototype.hasOwnProperty.call(WRITERS, d.op.name)) w[d.addr] = true;
    }
    return w;
  }
  // info notes (same shape as diagnostics) for LOAD/ADD/SUBTRACT/COMPARE with a literal that points into the program's own code or at an unused cell
  function operandNotes(code, asm) {
    var out = [];
    if (!asm || !asm.ok || !asm.lineToAddrs) return out;
    var lines = String(code).split('\n');
    var written = writtenCells(asm);
    if (written === null) return out;                       // a pointer store (STOREP) may write anywhere: no honest claim about any cell
    for (var n = 1; n <= lines.length && n <= 2000; n++) {
      var addrs = asm.lineToAddrs[n];
      if (!addrs || !addrs.length) continue;
      var lit = literalOperand(lines[n - 1]);
      if (!lit || !NOTE_OPS[lit.op]) continue;
      var cell = asm.cells && asm.cells[lit.value];
      if (lit.value >= asm.size || (cell && cell.kind === 'data')) continue;
      if (written[lit.value]) continue;                      // the program fills this cell itself (IN 12 / STORE 13 ...): reading it is correct
      var alt = ADDR_OPS[lit.op], inCode = !!cell && cell.kind === 'code';
      out.push({ line: n, col: lit.start + 1, len: lit.token.length, severity: 'info', kind: 'literal-address',
        msg: lit.op + ' ' + lit.token + ' uses the contents of cell ' + lit.value + ', ' + (inCode ? 'which holds part of the program' : 'an empty cell (nothing in your program writes to it, so it holds 0)') + ', not the number ' + lit.value + '.',
        hint: 'A number after an instruction is a cell address. Put the constant in a data cell (' + 'x: ' + lit.value + ' after .data) and use its name' + (asm.isa === 'ext' ? ', or use ' + alt + ' ' + lit.value + '.' : '.') });
    }
    return out;
  }

  var RANK = { error: 0, warning: 1, info: 2 };
  // errors + warnings as one list, most severe first, then by line
  function diagnosticsOf(asm, extra) {
    var out = [];
    if (!asm) return out;
    (asm.errors || []).forEach(function (e) { out.push({ line: e.line, col: e.col, len: e.len, severity: 'error', kind: e.kind, msg: e.msg, hint: e.hint }); });
    (asm.warnings || []).forEach(function (e) { out.push({ line: e.line, col: e.col, len: e.len, severity: e.severity === 'info' ? 'info' : 'warning', kind: e.kind, msg: e.msg, hint: e.hint }); });
    (extra || []).forEach(function (e) { out.push(e); });
    out.sort(function (a, b) { return (RANK[a.severity] - RANK[b.severity]) || (a.line - b.line) || (a.col - b.col); });
    return out;
  }
  function where(d) { return d.line ? 'Line ' + d.line + (d.col ? ', col ' + d.col : '') : 'Program'; }
  function sizeLimitText(asm) { return asm && asm.ok ? 'W = ' + asm.wordBits + ' bits (values ' + (-Math.pow(2, asm.wordBits - 1)) + ' … ' + (Math.pow(2, asm.wordBits - 1) - 1) + ')' : ''; }
  // word width the machine would have for a given setting (size 'auto' depends on the program)
  function wordBitsFor(settings, asm) {
    if (settings.size === 'auto') return asm && asm.ok ? asm.wordBits : null;
    return (settings.isa === 'ext' ? 5 : 4) + Math.round(Math.log(settings.size) / Math.LN2);
  }

  /* ───────────── editor <-> machine ───────────── */
  function isBoundary(st) { return !!st && !st.queue.length; }
  // {line, kind:'exec'|'next'} for the editor's active line, or null
  function lineMarker(st, asm) {
    if (!st || !asm || !asm.addrToLine) return null;
    var map = asm.addrToLine, ln;
    if (st.curAt !== null && st.curAt !== undefined) { ln = map[st.curAt]; return ln ? { line: ln, kind: 'exec' } : null; }
    if (st.halted || st.error) {
      var last = st.trace && st.trace[st.trace.length - 1];
      ln = last ? map[last.at] : 0;
      return ln ? { line: ln, kind: 'exec' } : null;
    }
    ln = map[st.pc];
    return ln ? { line: ln, kind: 'next' } : null;
  }
  // true when the instruction about to start is the first word of a source line that carries a breakpoint
  function breakpointHit(st, asm, bps) {
    if (!st || !asm || !bps || !bps.size || st.queue.length || st.halted || st.error) return 0;
    var ln = asm.addrToLine[st.pc];
    if (!ln || !bps.has(ln)) return 0;
    var addrs = asm.lineToAddrs && asm.lineToAddrs[ln];
    return addrs && addrs[0] === st.pc ? ln : 0;
  }

  /* ───────────── the time-sliced runner ─────────────
     makeRunner(st, { budgetMs, now, isStop }) -> { slice() -> reason }
     reason: 'halted' | 'error' | 'waiting' | 'breakpoint' (isStop returned a truthy value, kept in .stopInfo) | 'budget' (call slice() again).
     The first instruction is never stopped at when the run starts on an instruction boundary (resuming from a breakpoint). */
  function makeRunner(st, o) {
    o = o || {};
    var vn = VN(), budget = o.budgetMs || 20, now = o.now || function () { return Date.now(); };
    var runner = { st: st, stopInfo: null, skip: isBoundary(st), steps: 0 };
    runner.slice = function () {
      var t0 = now(), n = 0;
      for (;;) {
        if (st.error) return 'error';
        if (st.halted) return 'halted';
        if (!runner.skip && o.isStop && !st.queue.length) {
          var hit = o.isStop(st);
          if (hit) { runner.stopInfo = hit; return 'breakpoint'; }
        }
        runner.skip = false;
        var k = vn.stepInstr(st);
        runner.steps++;
        if (!k) {
          if (st.error) return 'error';
          if (st.halted) return 'halted';
          return st.waiting ? 'waiting' : 'error';
        }
        if (st.error) return 'error';
        if (st.halted) return 'halted';
        if (st.waiting) return 'waiting';
        if ((++n & 15) === 0 && now() - t0 >= budget) return 'budget';
      }
    };
    return runner;
  }
  // drive a runner to the end; yieldFn() returns a Promise (setTimeout 0); cancel.cancelled stops it. Resolves { reason }.
  function runAsync(runner, yieldFn, cancel, onSlice) {
    return new Promise(function (resolve, reject) {
      function go() {
        if (cancel && cancel.cancelled) { resolve({ reason: 'cancelled' }); return; }
        var reason;
        try { reason = runner.slice(); } catch (e) { reject(e); return; }
        if (onSlice) onSlice(reason);
        if (reason === 'budget') { yieldFn().then(go, reject); return; }
        resolve({ reason: reason });
      }
      go();
    });
  }

  /* ───────────── test cases ───────────── */
  // expected-output text -> { out:[..] } | { error:'step-guard' } | { bad:'message' }
  function parseExpected(text) {
    var t = String(text == null ? '' : text).trim();
    if (/^[A-Za-z][A-Za-z-]*$/.test(t)) {
      var w = t.toLowerCase();
      return STATUS_WORDS.indexOf(w) >= 0 ? { error: w } : { bad: 'Unknown status “' + t.slice(0, 20) + '”. Use numbers, or one of: ' + STATUS_WORDS.join(', ') };
    }
    var bad = inputProblems(t);
    if (bad.length) return { bad: 'Not a whole number: ' + bad[0] };
    return { out: parseInput(t) };
  }
  function rowToCase(row) {
    var e = parseExpected(row.exp);
    var c = { in: parseInput(row.in) };
    if (e.error) c.error = e.error; else if (e.out) c.out = e.out;
    if (e.bad) c.bad = e.bad;
    var ib = inputProblems(row.in);
    if (ib.length && !c.bad) c.bad = 'Input: not a whole number: ' + ib[0];
    return c;
  }
  function numbersText(a) { return (a || []).join(' '); }
  function exampleTestRows(ex) {
    return (ex.tests || []).map(function (t) { return { in: numbersText(t.in), exp: t.error !== undefined ? t.error : numbersText(t.out) }; });
  }
  function sameList(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  var VERDICT_LABEL = { pass: 'Pass', fail: 'Fail', error: 'Error', 'needs-input': 'Needs input', timeout: 'Timeout', invalid: 'Invalid' };
  // result: as runCases returns it. -> { verdict, label, actual }
  function judge(c, result) {
    var actual;
    if (c.bad) return { verdict: 'invalid', label: VERDICT_LABEL.invalid, actual: c.bad };
    var st = result.status;
    if (st === 'halted') actual = numbersText(result.out) || '(no output)';
    else if (st === 'waiting') actual = (numbersText(result.out) || '(no output)') + '  then waiting for more input';
    else actual = (numbersText(result.out) ? numbersText(result.out) + '  then ' : '') + (result.error || st);
    var verdict;
    if (c.error !== undefined) verdict = st === c.error ? 'pass' : 'fail';
    else if (st === 'halted') verdict = sameList(result.out, c.out || []) ? 'pass' : 'fail';
    else verdict = kindVerdict(st);
    return { verdict: verdict, label: VERDICT_LABEL[verdict], actual: actual };
  }
  function kindVerdict(st) { return st === 'waiting' ? 'needs-input' : st === 'step-guard' ? 'timeout' : 'error'; }
  // same fields as VNMachine.runCases, produced by the time-sliced runner
  function finishResult(s, inp) {
    var status = s.halted ? 'halted' : s.error ? (s.errorKind || 'error') : s.waiting ? 'waiting' : 'unfinished';
    return { in: inp.slice(), out: s.out.slice(), halted: s.halted, waiting: s.waiting, error: s.error, errorKind: s.errorKind, status: status, instr: s.instrCount, micro: s.microCount, cycles: s.cycles };
  }
  // run every case (list from rowToCase) in time slices. opts: { yieldFn, cancel, budgetMs, now, onResult(i, result, judged) }. Resolves { results, judged, cancelled }.
  function runCasesAsync(asm, cases, settings, opts) {
    opts = opts || {};
    var vn = VN(), results = [], judged = [], i = 0;
    var yieldFn = opts.yieldFn || function () { return new Promise(function (r) { setTimeout(r, 0); }); };
    return new Promise(function (resolve, reject) {
      function next() {
        if (opts.cancel && opts.cancel.cancelled) { resolve({ results: results, judged: judged, cancelled: true }); return; }
        if (i >= cases.length) { resolve({ results: results, judged: judged, cancelled: false }); return; }
        var c = cases[i], res, idx = i;
        if (c.bad) { res = { in: c.in, out: [], halted: false, waiting: false, error: c.bad, errorKind: null, status: 'invalid', instr: 0, micro: 0, cycles: 0 }; done(res); return; }
        if (!asm || !asm.ok) { res = { in: c.in, out: [], halted: false, waiting: false, error: 'The program has assembler errors, so it cannot run.', errorKind: 'asm-error', status: 'asm-error', instr: 0, micro: 0, cycles: 0 }; done(res); return; }
        var s = vn.create(asm, runOpts(settings, c.in));
        var runner = makeRunner(s, { budgetMs: opts.budgetMs || 20, now: opts.now });
        runAsync(runner, yieldFn, opts.cancel).then(function (r) {
          if (r.reason === 'cancelled') { resolve({ results: results, judged: judged, cancelled: true }); return; }
          done(finishResult(s, c.in));
        }, reject);
        function done(rs) {
          var j = judge(c, rs);
          results.push(rs); judged.push(j);
          if (opts.onResult) opts.onResult(idx, rs, j);
          i++;
          yieldFn().then(next, reject);
        }
      }
      next();
    });
  }

  /* ───────────── trace and listing text ───────────── */
  function firstName(asm, addr) { var n = asm && asm.names && asm.names[addr]; return n ? String(n).split(', ')[0] : null; }
  function opByName(name) {
    var all = VN().opsFor('ext'), i;
    for (i = 0; i < all.length; i++) if (all[i].name === name) return all[i];
    return null;
  }
  // "LOAD B" for an address operand that has a name, "LOADI 5" for an immediate, "HALT"
  function instrText(asm, entry) {
    if (entry.arg === null || entry.arg === undefined) return entry.text;
    var nm = entry.text.split(' ')[0], op = opByName(nm);
    if (op && op.imm) return entry.text;
    var n = firstName(asm, entry.arg);
    return n ? nm + ' ' + n : entry.text;
  }
  function flagsText(e) { return (e.gt ? 'GT' : '--') + ' ' + (e.eq ? 'EQ' : '--') + ' ' + (e.lt ? 'LT' : '--'); }
  function traceToText(trace, asm) {
    var lines = ['#     addr  instruction            R      flags'];
    (trace || []).forEach(function (e) {
      var line = asm && asm.addrToLine ? asm.addrToLine[e.at] : 0;
      lines.push(padRight('#' + e.n, 6) + padRight(String(e.at), 6) + padRight(instrText(asm, e), 23) + padRight(String(e.r), 7) + flagsText(e) + (line ? '   (line ' + line + ')' : ''));
    });
    return lines.join('\n') + '\n';
  }
  function padRight(s, n) { while (s.length < n) s += ' '; return s; }

  /* ───────────── instruction table (measured on the engine) ───────────── */
  var tableCache = {};
  function instructionTable(isa) {
    isa = isa === 'ext' ? 'ext' : 'lecture';
    if (tableCache[isa]) return tableCache[isa];
    var vn = VN(), opBits = isa === 'ext' ? 5 : 4;
    var rows = vn.opsFor(isa).map(function (op) {
      var src = op.arg ? op.name + ' x\n.data\nx: 1\n' : op.name + '\n.data\nx: 1\n';
      var a = vn.assemble(src, { isa: isa }), micro = null, acc = null, reads = null, writes = null, fetches = null;
      if (a.ok) {
        var s = vn.create(a, { input: [1] });
        vn.stepInstr(s);
        if (!s.error) { micro = s.microCount; fetches = s.ifetches; reads = s.dataReads; writes = s.dataWrites; acc = fetches + reads + writes; }
      }
      var bitsStr = padLeft(op.code.toString(2), opBits) + (op.arg ? ' ' + (op.imm ? 'nnnn' : 'aaaa') : ' ----');
      return { name: op.name, code: op.code, bits: bitsStr, arg: !!op.arg, imm: !!op.imm, ext: !!op.ext, meaning: op.meaning, micro: micro, memAccesses: acc, dataReads: reads, dataWrites: writes };
    });
    tableCache[isa] = rows;
    return rows;
  }

  /* ───────────── statistics model ───────────── */
  function pct(x) { return Math.round(x * 1000) / 10; }
  function statsModel(s) {
    var cyc = s.cycles || 0, lat = s.memLatency || 1;
    var seg = [
      { key: 'ifetch', label: 'Instruction fetches', count: s.ifetches, cycles: s.ifetches * lat },
      { key: 'dread', label: 'Data reads', count: s.dataReads, cycles: s.dataReads * lat },
      { key: 'dwrite', label: 'Data writes', count: s.dataWrites, cycles: s.dataWrites * lat }
    ];
    var memCycles = seg[0].cycles + seg[1].cycles + seg[2].cycles;
    seg.push({ key: 'other', label: 'Everything else (register transfers, ALU, decode)', count: s.micro - s.memMicro, cycles: Math.max(0, cyc - memCycles) });
    seg.forEach(function (x) { x.frac = cyc > 0 ? x.cycles / cyc : 0; x.pct = pct(x.frac); });
    var mixNames = Object.keys(s.mix || {}).sort(function (a, b) { return (s.mix[b] - s.mix[a]) || (a < b ? -1 : 1); });
    var maxMix = mixNames.length ? s.mix[mixNames[0]] : 0;
    var mix = mixNames.map(function (nm) { return { name: nm, count: s.mix[nm], frac: s.instr ? s.mix[nm] / s.instr : 0, rel: maxMix ? s.mix[nm] / maxMix : 0 }; });
    var memShare = cyc > 0 ? memCycles / cyc : 0;
    return { instr: s.instr, micro: s.micro, cycles: cyc, memLatency: lat, ifetches: s.ifetches, dataReads: s.dataReads, dataWrites: s.dataWrites,
             memMicro: s.memMicro, memCycles: memCycles, memShare: memShare, memSharePct: pct(memShare), segments: seg, mix: mix };
  }

  /* ───────────── presets, payloads, names ───────────── */
  var PRESET_IDS = ['sum3', 'sum1n', 'max2', 'selfmod'];
  function presetsFromRegistry(R) {
    var out = [];
    PRESET_IDS.forEach(function (id) {
      var it = R && R.get ? R.get(id) : null;
      if (!it) return;
      out.push({ key: id, name: it.title, input: it.input || '', expect: it.tests[0].out, story: it.story, src: it.src });
    });
    return out;
  }
  function programPayload(p) {
    return { code: p.code, input: p.input || '', settings: p.settings, name: p.name || '', exampleId: p.exampleId || null };
  }
  function shareProblem(r) {
    if (r && r.ok) return '';
    return (r && r.error) || 'This program cannot be shared as a link.';
  }
  function templateProgram() {
    return { name: '', input: '5', exampleId: null,
      code: '; My program: describe what it does here\n        IN      x          ; read a number\n        OUT     x          ; print it\n        HALT\n.data\nx:      0\n' };
  }
  function whenText(ts, nowTs) {
    var d = Math.max(0, (nowTs || Date.now()) - ts), m = Math.floor(d / 60000);
    if (m < 1) return 'moments ago';
    if (m < 60) return m + (m === 1 ? ' minute ago' : ' minutes ago');
    var h = Math.round(m / 60);
    if (h < 48) return h + (h === 1 ? ' hour ago' : ' hours ago');
    return Math.round(h / 24) + ' days ago';
  }

  var api = {
    configure: function (d) { D = d || {}; },
    get PROGRAM_LIMIT() { return Store().LIMITS.programs; },
    MAX_SAFE: MAX_SAFE, STATUS_WORDS: STATUS_WORDS, SIZES: SIZES, GUARDS: GUARDS, VERDICT_LABEL: VERDICT_LABEL, PRESET_IDS: PRESET_IDS,
    parseInput: parseInput, inputProblems: inputProblems, parseCellValue: parseCellValue, formatValue: formatValue,
    cleanSettings: cleanSettings, defaultSettings: defaultSettings, settingsForExample: settingsForExample, assembleOpts: assembleOpts, runOpts: runOpts,
    assembleWith: assembleWith, summarize: summarize, diagnosticsOf: diagnosticsOf, where: where, wordBitsFor: wordBitsFor, sizeLimitText: sizeLimitText,
    literalOperand: literalOperand, operandHover: operandHover, operandNotes: operandNotes,
    isBoundary: isBoundary, lineMarker: lineMarker, breakpointHit: breakpointHit,
    makeRunner: makeRunner, runAsync: runAsync,
    parseExpected: parseExpected, rowToCase: rowToCase, exampleTestRows: exampleTestRows, judge: judge, finishResult: finishResult, runCasesAsync: runCasesAsync,
    instrText: instrText, flagsText: flagsText, traceToText: traceToText, firstName: firstName,
    instructionTable: instructionTable, statsModel: statsModel,
    presetsFromRegistry: presetsFromRegistry, programPayload: programPayload, shareProblem: shareProblem, templateProgram: templateProgram, whenText: whenText, numbersText: numbersText
  };
  if (isNode) module.exports = api; else global.VNWorkbenchLib = api;
})(typeof window !== 'undefined' ? window : this);
