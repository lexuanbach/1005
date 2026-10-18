/* Von Neumann Machine engine — CO1005 Chapters 7 and 8.
   A pure (no DOM) model of the TOY machine from the lecture slides (slides 29-34):
   memory cells with addresses, registers PC, IR, MAR, MDR and one accumulator R,
   condition codes GT / EQ / LT, and the 16-opcode instruction set of slide 34.
   This is a teaching machine, NOT x86 or ARM.

   Word format: 4-bit opcode + address field. With 16 cells the address field is 4 bits,
   so an instruction is exactly 8 bits (the "8-bit opcode+address" encoding); with 64 cells
   it is 4+6 = 10 bits, and so on. Data cells hold any whole number.

   Slide 34 gives opcode 0101 to both SUBTRACT and DECREMENT. That is a typo; here
   DECREMENT is 0110 (the first free code, and the slide jumps from 0101 to 0111).
   Four bits give only 16 opcodes, so JUMPGE and JUMPLE do not fit: the assembler
   accepts them as PSEUDO-instructions and expands each into two real jumps.

   Assembler syntax (one item per line, ';' or '//' starts a comment):
       [label:]  MNEMONIC [operand]      operand = a label / variable name, or a cell number
       .data                             switch to the data section (code comes first in memory)
       name: 5                           a variable with initial value 5   (name: .word 5, 6, 7 also works)
   Code is placed from cell 0 upward, the .data cells follow it.            */
(function (global) {
  'use strict';

  var OPS = [
    { name: 'LOAD',      code: 0,  arg: true,  meaning: 'CON(X) → R' },
    { name: 'STORE',     code: 1,  arg: true,  meaning: 'R → CON(X)' },
    { name: 'CLEAR',     code: 2,  arg: true,  meaning: '0 → CON(X)' },
    { name: 'ADD',       code: 3,  arg: true,  meaning: 'R + CON(X) → R' },
    { name: 'INCREMENT', code: 4,  arg: true,  meaning: 'CON(X) + 1 → CON(X)' },
    { name: 'SUBTRACT',  code: 5,  arg: true,  meaning: 'R − CON(X) → R' },
    { name: 'DECREMENT', code: 6,  arg: true,  meaning: 'CON(X) − 1 → CON(X)' },
    { name: 'COMPARE',   code: 7,  arg: true,  meaning: 'set GT/EQ/LT from CON(X) versus R' },
    { name: 'JUMP',      code: 8,  arg: true,  meaning: 'next instruction from X' },
    { name: 'JUMPGT',    code: 9,  arg: true,  meaning: 'jump to X if GT = 1' },
    { name: 'JUMPLT',    code: 10, arg: true,  meaning: 'jump to X if LT = 1' },
    { name: 'JUMPEQ',    code: 11, arg: true,  meaning: 'jump to X if EQ = 1' },
    { name: 'JUMPNEQ',   code: 12, arg: true,  meaning: 'jump to X if EQ = 0' },
    { name: 'IN',        code: 13, arg: true,  meaning: 'input an integer, store in X' },
    { name: 'OUT',       code: 14, arg: true,  meaning: 'output CON(X) in decimal' },
    { name: 'HALT',      code: 15, arg: false, meaning: 'stop program execution' }
  ];
  var BY_NAME = {}, BY_CODE = {};
  OPS.forEach(function (o) { BY_NAME[o.name] = o; BY_CODE[o.code] = o; });
  // pseudo-instructions: name -> the two real jumps they expand to
  var PSEUDO = { JUMPGE: ['JUMPGT', 'JUMPEQ'], JUMPLE: ['JUMPLT', 'JUMPEQ'] };
  var MAX_CELLS = 256;

  function addrBitsFor(size) { var b = 0; while ((1 << b) < size) b++; return b; }

  function encode(opName, addr, addrBits) { return (BY_NAME[opName].code << addrBits) | (addr || 0); }

  // Decode a word. Returns null if the word cannot be an instruction.
  function decode(word, addrBits) {
    if (typeof word !== 'number' || word !== Math.floor(word) || word < 0 || word >= (16 << addrBits)) return null;
    var op = BY_CODE[word >> addrBits];
    return { op: op, addr: word & ((1 << addrBits) - 1) };
  }
  function disasm(word, addrBits) {
    var d = decode(word, addrBits);
    if (!d) return '—';
    return d.op.arg ? d.op.name + ' ' + d.addr : d.op.name;
  }
  // "0011 0101" style string (opcode | address); null when the number does not fit in an unsigned word
  function bits(word, addrBits) {
    var wb = 4 + addrBits;
    if (typeof word !== 'number' || word < 0 || word >= (1 << wb)) return null;
    var s = word.toString(2);
    while (s.length < wb) s = '0' + s;
    return s.slice(0, 4) + ' ' + s.slice(4);
  }
  function hex(word, addrBits) {
    var wb = 4 + addrBits;
    if (typeof word !== 'number' || word < 0 || word >= (1 << wb)) return null;
    var s = word.toString(16).toUpperCase(), n = Math.ceil(wb / 4);
    while (s.length < n) s = '0' + s;
    return s;
  }

  /* ───────────── assembler ───────────── */
  function assemble(src, opts) {
    opts = opts || {};
    var errors = [];
    function err(line, msg) { errors.push({ line: line, msg: msg }); }
    var lines = String(src).split(/\r?\n/);
    var section = 'text';
    var items = [];          // code items {ops:[names], operand, line, text, label?}
    var dataCells = [];      // {value, line}
    var syms = {};           // name -> {kind, idx}
    var pending = [];        // labels waiting for the next code item
    var NAME = /^[A-Za-z_]\w*$/;

    lines.forEach(function (raw, i) {
      var ln = i + 1;
      var text = raw.replace(/;.*$/, '').replace(/\/\/.*$/, '').trim();
      if (!text) return;
      if (/^\.data\b/i.test(text)) { section = 'data'; return; }
      if (/^\.text\b/i.test(text)) { section = 'text'; return; }
      var m = text.match(/^([A-Za-z_]\w*)\s*:\s*(.*)$/);
      var label = null;
      if (m) {
        label = m[1];
        if (syms[label] || BY_NAME[label.toUpperCase()] || PSEUDO[label.toUpperCase()]) { err(ln, "name '" + label + "' is already used (or is an instruction name)"); }
        text = m[2].trim();
      }
      if (section === 'data') {
        if (label) syms[label] = { kind: 'data', idx: dataCells.length };
        if (/^\.word\b/i.test(text)) text = text.replace(/^\.word\b/i, '').trim();
        var vals = text ? text.split(/[\s,]+/).filter(Boolean) : ['0'];
        vals.forEach(function (v) {
          if (!/^[+-]?\d+$/.test(v)) { err(ln, "data value '" + v + "' is not a whole number"); v = '0'; }
          dataCells.push({ value: parseInt(v, 10), line: ln });
        });
        return;
      }
      if (label) pending.push({ name: label, line: ln });
      if (!text) return;
      var parts = text.split(/[\s,]+/).filter(Boolean);
      var mn = parts[0].toUpperCase();
      var real = BY_NAME[mn], pseudo = PSEUDO[mn];
      if (!real && !pseudo) { err(ln, "unknown instruction '" + parts[0] + "'"); return; }
      var needs = real ? real.arg : true;
      if (needs && parts.length !== 2) { err(ln, mn + ' needs exactly one operand (a name or a cell number)'); return; }
      if (!needs && parts.length !== 1) { err(ln, mn + ' takes no operand'); return; }
      var item = { ops: real ? [mn] : PSEUDO[mn], mnemonic: mn, operand: needs ? parts[1] : null, line: ln, text: text, pseudo: !!pseudo };
      pending.forEach(function (p) { syms[p.name] = { kind: 'code', idx: items.length }; });
      pending = [];
      items.push(item);
    });
    pending.forEach(function (p) { err(p.line, "label '" + p.name + "' has no instruction after it"); });

    // layout
    var codeWords = 0;
    items.forEach(function (it) { it.start = codeWords; codeWords += it.ops.length; });
    var total = codeWords + dataCells.length;
    var size = opts.size;
    if (!size) { size = 16; while (size < total) size *= 2; }
    if (total > size) err(0, 'the program needs ' + total + ' cells but the machine has only ' + size);
    if (size > MAX_CELLS) { err(0, 'more than ' + MAX_CELLS + ' cells are not supported'); size = MAX_CELLS; }
    var addrBits = addrBitsFor(size);
    var addrOf = {};
    Object.keys(syms).forEach(function (k) {
      var s = syms[k];
      addrOf[k] = s.kind === 'code' ? (items[s.idx] ? items[s.idx].start : codeWords) : codeWords + s.idx;
    });

    var mem = [], cells = [], listing = [], a;
    for (a = 0; a < size; a++) { mem.push(0); cells.push({ addr: a, kind: 'free', line: 0 }); }
    items.forEach(function (it) {
      var addr = 0;
      if (it.operand !== null) {
        if (/^\d+$/.test(it.operand)) addr = parseInt(it.operand, 10);
        else if (addrOf[it.operand] !== undefined) addr = addrOf[it.operand];
        else { err(it.line, "unknown name '" + it.operand + "'"); }
        if (addr >= size) { err(it.line, 'address ' + addr + ' is outside memory (0–' + (size - 1) + ')'); addr = 0; }
      }
      it.ops.forEach(function (name, k) {
        var at = it.start + k;
        if (at >= size) return;
        mem[at] = encode(name, addr, addrBits);
        cells[at] = { addr: at, kind: 'code', line: it.line };
        listing.push({ addr: at, word: mem[at], op: name, operand: BY_NAME[name].arg ? addr : null, line: it.line,
                       text: it.text, part: it.pseudo ? k + 1 : 0, of: it.ops.length });
      });
    });
    dataCells.forEach(function (d, k) {
      var at = codeWords + k;
      if (at >= size) return;
      mem[at] = d.value;
      cells[at] = { addr: at, kind: 'data', line: d.line };
    });
    var names = {};
    Object.keys(addrOf).forEach(function (k) { names[addrOf[k]] = (names[addrOf[k]] ? names[addrOf[k]] + ', ' : '') + k; });

    return { ok: errors.length === 0, errors: errors, size: size, addrBits: addrBits, wordBits: 4 + addrBits,
             mem: mem, cells: cells, listing: listing, symbols: addrOf, names: names, codeLen: codeWords, dataStart: codeWords };
  }

  /* ───────────── machine ───────────── */
  function create(asm, opts) {
    opts = opts || {};
    return {
      asm: asm, size: asm.size, addrBits: asm.addrBits,
      mem: asm.mem.slice(), pc: 0, ir: 0, mar: 0, mdr: 0, r: 0, gt: 0, eq: 0, lt: 0,
      out: [], input: (opts.input || []).slice(), inPos: 0,
      queue: [], halted: false, error: null, waiting: false,
      instrCount: 0, microCount: 0, maxInstr: opts.maxInstr || 10000,
      cur: null,            // the instruction currently being executed {op, addr, at}
      lastMicro: null, lastRead: null, lastWrite: null, trace: []
    };
  }
  function fail(s, msg) { s.error = msg; s.queue = []; }

  function startInstruction(s) {
    s.cur = null;
    s.queue.push(
      { phase: 'fetch', label: 'PC → MAR', flow: [['PC', 'MAR']], apply: function (s) {
          if (s.pc < 0 || s.pc >= s.size) { fail(s, 'PC = ' + s.pc + ' points outside memory (0–' + (s.size - 1) + '). The program ran off the end — did you forget HALT?'); return; }
          s.mar = s.pc;
          this.text = 'The control unit copies the address held in PC (' + s.pc + ') into MAR, the memory address register.'; } },
      { phase: 'fetch', label: 'fetch signal: memory[MAR] → MDR', flow: [['MAR', 'MEM'], ['MEM', 'MDR']], apply: function (s) {
          s.mdr = s.mem[s.mar]; s.lastRead = s.mar;
          this.text = 'Fetch signal: memory reads the cell at address ' + s.mar + ' (a non-destructive copy) and puts its contents, ' + s.mdr + ', into MDR.'; } },
      { phase: 'fetch', label: 'MDR → IR', flow: [['MDR', 'IR']], apply: function (s) {
          s.ir = s.mdr;
          this.text = 'The word in MDR is copied into IR, the instruction register, where it stays while it is decoded and executed.'; } },
      { phase: 'fetch', label: 'PC + 1 → PC', flow: [['PC', 'PC']], apply: function (s) {
          s.pc = s.pc + 1;
          this.text = 'PC is increased by 1, so it already points to the next instruction. (A jump will overwrite it later.)'; } },
      { phase: 'decode', label: 'IR → decoder', flow: [['IR', 'DEC']], apply: function (s) {
          var d = decode(s.ir, s.addrBits);
          if (!d) { fail(s, 'IR holds ' + s.ir + ', which is not a valid instruction word (opcode 0–15 followed by an address). A data value was executed as code.'); return; }
          s.cur = { op: d.op, addr: d.addr, at: s.mar };
          this.text = 'The decoder splits IR into opcode ' + bits(s.ir, s.addrBits) + ' → ' + d.op.name +
            (d.op.arg ? ' and address field ' + d.addr : ' (no address field)') + ', and switches on the circuits for that instruction.';
          Array.prototype.push.apply(s.queue, execSteps(d.op, d.addr));
        } }
    );
  }

  function toMar(addr) {
    return { phase: 'execute', label: 'IR.address → MAR', flow: [['IR', 'MAR']], apply: function (s) {
      s.mar = addr; this.text = 'The address field of IR (' + addr + ') is copied into MAR.'; } };
  }
  function fetchMdr() {
    return { phase: 'execute', label: 'fetch signal: memory[MAR] → MDR', flow: [['MAR', 'MEM'], ['MEM', 'MDR']], apply: function (s) {
      s.mdr = s.mem[s.mar]; s.lastRead = s.mar;
      this.text = 'Fetch signal: memory copies cell ' + s.mar + ' (value ' + s.mdr + ') into MDR.'; } };
  }
  function storeSig() {
    return { phase: 'execute', label: 'store signal: MDR → memory[MAR]', flow: [['MDR', 'MEM']], apply: function (s) {
      s.mem[s.mar] = s.mdr; s.lastWrite = s.mar;
      this.text = 'Store signal: memory overwrites cell ' + s.mar + ' with ' + s.mdr + ' (a destructive write — the old value is gone).'; } };
  }
  function jumpIf(name, test, addr) {
    return { phase: 'execute', label: name === 'JUMP' ? 'IR.address → PC' : 'test flag, maybe IR.address → PC',
      flow: [['IR', 'PC']], apply: function (s) {
        if (test(s)) { s.pc = addr; this.text = name === 'JUMP' ? 'PC is overwritten with ' + addr + ': the next instruction will be fetched from there.' :
          'The flag condition holds, so PC is overwritten with ' + addr + ' — the jump is taken.'; }
        else { this.text = 'The flag condition does not hold (GT=' + s.gt + ', EQ=' + s.eq + ', LT=' + s.lt + '), so PC is left alone and execution simply continues with the next cell.'; this.flow = []; }
      } };
  }

  function execSteps(op, addr) {
    var n = op.name;
    switch (n) {
      case 'LOAD': return [toMar(addr), fetchMdr(),
        { phase: 'execute', label: 'MDR → R', flow: [['MDR', 'R']], apply: function (s) { s.r = s.mdr; this.text = 'MDR is copied into the accumulator R, which now holds ' + s.r + '.'; } }];
      case 'STORE': return [toMar(addr),
        { phase: 'execute', label: 'R → MDR', flow: [['R', 'MDR']], apply: function (s) { s.mdr = s.r; this.text = 'R (' + s.r + ') is copied into MDR, ready to be written.'; } }, storeSig()];
      case 'CLEAR': return [toMar(addr),
        { phase: 'execute', label: '0 → MDR', flow: [['ALU', 'MDR']], apply: function (s) { s.mdr = 0; this.text = 'The value 0 is put into MDR.'; } }, storeSig()];
      case 'ADD': case 'SUBTRACT': return [toMar(addr), fetchMdr(),
        { phase: 'execute', label: n === 'ADD' ? 'ALU: R + MDR → R' : 'ALU: R − MDR → R', flow: [['R', 'ALU'], ['MDR', 'ALU'], ['ALU', 'R']], apply: function (s) {
          var before = s.r; s.r = n === 'ADD' ? s.r + s.mdr : s.r - s.mdr;
          this.text = 'The ALU computes ' + before + (n === 'ADD' ? ' + ' : ' − ') + s.mdr + ' = ' + s.r + ' and stores it back in R.'; } }];
      case 'INCREMENT': case 'DECREMENT': return [toMar(addr), fetchMdr(),
        { phase: 'execute', label: n === 'INCREMENT' ? 'ALU: MDR + 1 → MDR' : 'ALU: MDR − 1 → MDR', flow: [['MDR', 'ALU'], ['ALU', 'MDR']], apply: function (s) {
          var before = s.mdr; s.mdr = n === 'INCREMENT' ? s.mdr + 1 : s.mdr - 1;
          this.text = 'The ALU turns ' + before + ' into ' + s.mdr + ' (R is untouched).'; } }, storeSig()];
      case 'COMPARE': return [toMar(addr), fetchMdr(),
        { phase: 'execute', label: 'ALU: compare MDR with R → GT/EQ/LT', flow: [['MDR', 'ALU'], ['R', 'ALU'], ['ALU', 'FLAGS']], apply: function (s) {
          s.gt = s.mdr > s.r ? 1 : 0; s.eq = s.mdr === s.r ? 1 : 0; s.lt = s.mdr < s.r ? 1 : 0;
          this.text = 'Compare CON(X) = ' + s.mdr + ' with R = ' + s.r + ': GT=' + s.gt + ', EQ=' + s.eq + ', LT=' + s.lt + '. (GT means the cell is bigger than R.)'; } }];
      case 'JUMP': return [jumpIf('JUMP', function () { return true; }, addr)];
      case 'JUMPGT': return [jumpIf(n, function (s) { return s.gt === 1; }, addr)];
      case 'JUMPLT': return [jumpIf(n, function (s) { return s.lt === 1; }, addr)];
      case 'JUMPEQ': return [jumpIf(n, function (s) { return s.eq === 1; }, addr)];
      case 'JUMPNEQ': return [jumpIf(n, function (s) { return s.eq === 0; }, addr)];
      case 'IN': return [toMar(addr),
        { phase: 'execute', label: 'input device → MDR', needInput: true, flow: [['IN', 'MDR']], apply: function (s) {
          s.mdr = s.input[s.inPos++]; this.text = 'The next number from the input queue, ' + s.mdr + ', arrives in MDR.'; } }, storeSig()];
      case 'OUT': return [toMar(addr), fetchMdr(),
        { phase: 'execute', label: 'MDR → output device', flow: [['MDR', 'OUT']], apply: function (s) {
          s.out.push(s.mdr); this.text = 'The value ' + s.mdr + ' is sent to the output device and printed in decimal.'; } }];
      case 'HALT': return [{ phase: 'execute', label: 'stop', flow: [], apply: function (s) {
        s.halted = true; this.text = 'HALT: the control unit stops the fetch–decode–execute loop.'; } }];
    }
    return [];
  }

  // One micro-step. Returns the micro-step descriptor (with .text filled in), or null if nothing happened.
  function stepMicro(s) {
    if (s.halted || s.error) return null;
    if (!s.queue.length) {
      if (s.instrCount >= s.maxInstr) { fail(s, 'Step guard: more than ' + s.maxInstr + ' instructions were executed. The program is probably an infinite loop.'); return null; }
      startInstruction(s);
    }
    var m = s.queue[0];
    if (m.needInput && s.inPos >= s.input.length) { s.waiting = true; return null; }
    s.waiting = false;
    s.queue.shift();
    s.lastRead = null; s.lastWrite = null;
    m.apply(s);
    if (s.error) return null;
    s.microCount++;
    s.lastMicro = m;
    if (!s.queue.length) {
      s.instrCount++;
      if (s.cur) s.trace.push({ at: s.cur.at, arg: s.cur.op.arg ? s.cur.addr : null, text: s.cur.op.arg ? s.cur.op.name + ' ' + s.cur.addr : s.cur.op.name, r: s.r, pc: s.pc, gt: s.gt, eq: s.eq, lt: s.lt });
      if (s.trace.length > 500) s.trace.shift();
    }
    return m;
  }
  // Finish the instruction in progress (or run one whole instruction). Returns micro-steps taken.
  function stepInstr(s) {
    var n = 0;
    do {
      var m = stepMicro(s);
      if (!m) break;
      n++;
    } while (s.queue.length && !s.halted && !s.error && !s.waiting);
    return n;
  }
  function run(s, maxInstr) {
    var guard = 0, limit = maxInstr || s.maxInstr + 5;
    while (!s.halted && !s.error && !s.waiting && guard++ < limit) {
      if (!stepInstr(s) && !s.error && !s.halted) break;
    }
    return s;
  }
  function pushInput(s, values) { Array.prototype.push.apply(s.input, values); s.waiting = false; }

  var VN = { OPS: OPS, PSEUDO: PSEUDO, assemble: assemble, create: create, stepMicro: stepMicro, stepInstr: stepInstr, run: run,
             pushInput: pushInput, encode: encode, decode: decode, disasm: disasm, bits: bits, hex: hex };

  if (typeof module !== 'undefined' && module.exports) module.exports = VN;
  else global.VNMachine = VN;
})(typeof window !== 'undefined' ? window : this);
