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
       .text                             switch back to the code section (the default)
       .data                             switch to the data section (code comes first in memory)
       name: 5                           a variable with initial value 5   (name: .word 5, 6, 7 also works)
       name: .space 4                    four zero cells (name labels the first one)
       ptr: other                        a data value may be a NAME: it means that name's address (a pointer)
   Numbers: decimal 12, hex 0x1F, binary 0b101 (data values may carry a sign: -0x10).
   Code is placed from cell 0 upward, the .data cells follow it.

   ───── Options added in version 2 (every old call still works exactly as before) ─────
   assemble(src, { size, isa })
       size  omitted / 0 / 'auto' = the smallest power of two >= 16 that holds the program
             (in ext mode also 1 + the largest immediate); otherwise a power of two 16..256 (else 'bad-size').
       isa   'lecture' (default; the 16 instructions of slide 34, JUMPGE/JUMPLE as pseudo-instructions)
             or 'ext' (those 16 plus LOADI ADDI SUBI CMPI LOADP STOREP MUL DIV MOD JUMPGE JUMPLE NOP,
             a 5-bit opcode, so words are one bit wider). The extension is SUPPLEMENTARY: not on slide 34.
       Errors are { line, col, len, kind, msg, hint? } (1-based line/col, one error per line, ordered by line);
       warnings (only when there are no errors) are { line, col, len, kind, msg, severity }.
       Extra fields: isa opBits wordBits warnings lineToAddrs addrToLine symbolKinds.
   create(asm, { input, maxInstr, memLatency, wrap })
       memLatency  1..50 cycles charged for every memory access (instruction fetch, data read, data write)
       wrap        true = cells behave like W-bit two's-complement numbers (W = wordBits): 127 + 1 wraps to -128
       The state also keeps cycles, ifetches, dataReads, dataWrites, mix, errorKind and curAt (address of the
       instruction in flight). stats(state) summarises them; runCases(asm, cases, opts) runs many inputs headless.
   Reserved words: a label or variable may not be called like a mnemonic of the ACTIVE instruction set (lecture: the 16 + JUMPGE/JUMPLE;
   extended: all 28), so a lecture program that uses `mod`, `div` or `mul` as a name keeps assembling exactly as it always did.
   IN refuses numbers that are not exact whole numbers (Infinity, beyond +-9007199254740991) with an `overflow` error, in wrap mode too.
   Runtime errors set state.error (friendly text) and state.errorKind:
       pc-range bad-word step-guard div-zero ptr-range overflow.                                              */
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
  // the supplementary instructions (opcodes 16-27, five-bit opcode); only available when isa = 'ext'
  var OPS_EXT = [
    { name: 'LOADI',  code: 16, arg: true,  ext: true, imm: true, meaning: 'n → R (n is the number in the instruction)' },
    { name: 'ADDI',   code: 17, arg: true,  ext: true, imm: true, meaning: 'R + n → R' },
    { name: 'SUBI',   code: 18, arg: true,  ext: true, imm: true, meaning: 'R − n → R' },
    { name: 'CMPI',   code: 19, arg: true,  ext: true, imm: true, meaning: 'set GT/EQ/LT from n versus R' },
    { name: 'LOADP',  code: 20, arg: true,  ext: true, meaning: 'CON(CON(X)) → R (X holds a pointer)' },
    { name: 'STOREP', code: 21, arg: true,  ext: true, meaning: 'R → CON(CON(X)) (X holds a pointer)' },
    { name: 'MUL',    code: 22, arg: true,  ext: true, meaning: 'R × CON(X) → R' },
    { name: 'DIV',    code: 23, arg: true,  ext: true, meaning: 'R ÷ CON(X) → R (toward zero)' },
    { name: 'MOD',    code: 24, arg: true,  ext: true, meaning: 'R mod CON(X) → R (sign follows R)' },
    { name: 'JUMPGE', code: 25, arg: true,  ext: true, meaning: 'jump to X if GT = 1 or EQ = 1' },
    { name: 'JUMPLE', code: 26, arg: true,  ext: true, meaning: 'jump to X if LT = 1 or EQ = 1' },
    { name: 'NOP',    code: 27, arg: false, ext: true, meaning: 'do nothing' }
  ];
  // The lookup tables are dictionaries WITHOUT a prototype, so names such as constructor or __proto__ are ordinary.
  function dict() { return Object.create(null); }
  var BY_NAME = dict(), BY_CODE = dict(), ALL_BY_NAME = dict(), ALL_BY_CODE = dict();
  OPS.forEach(function (o) { BY_NAME[o.name] = o; BY_CODE[o.code] = o; ALL_BY_NAME[o.name] = o; ALL_BY_CODE[o.code] = o; });
  OPS_EXT.forEach(function (o) { ALL_BY_NAME[o.name] = o; ALL_BY_CODE[o.code] = o; });
  // pseudo-instructions of the lecture machine: name -> the two real jumps they expand to
  var PSEUDO = { JUMPGE: ['JUMPGT', 'JUMPEQ'], JUMPLE: ['JUMPLT', 'JUMPEQ'] };
  var PSEUDO_D = dict(); PSEUDO_D.JUMPGE = PSEUDO.JUMPGE; PSEUDO_D.JUMPLE = PSEUDO.JUMPLE;
  var EXT_ONLY = dict();                                  // mnemonics that exist only in the extended set
  OPS_EXT.forEach(function (o) { if (!PSEUDO_D[o.name]) EXT_ONLY[o.name] = true; });
  var ALL_MNEMONICS = OPS.map(function (o) { return o.name; }).concat(OPS_EXT.map(function (o) { return o.name; }));

  var MAX_CELLS = 256, MIN_CELLS = 16, MAX_SAFE = 9007199254740991;
  var LIMITS = { maxCells: MAX_CELLS, maxSourceChars: 20000, maxSourceLines: 2000 };

  function opsFor(isa) { return isa === 'ext' ? OPS.concat(OPS_EXT) : OPS.slice(); }
  function addrBitsFor(size) { var b = 0; while ((1 << b) < size) b++; return b; }

  function encode(opName, addr, addrBits) {
    var o = ALL_BY_NAME[String(opName)];
    if (!o) throw new Error('unknown instruction ' + opName);
    return (o.code << addrBits) | (addr || 0);
  }

  // Signed W-bit two's-complement view of a whole number (mathematical modulo). Non-numbers pass through.
  function wrapValue(v, W) {
    if (typeof v !== 'number' || !isFinite(v) || !(W >= 1 && W <= 53) || Math.floor(W) !== W) return v;
    var M = Math.pow(2, W), half = M / 2;
    var u = v % M;                       // exact for every double; (v + half) could lose bits above 2^53
    if (u < 0) u += M;
    return ((u + half) % M) - half + 0;
  }

  // Decode a word. Returns null if the word cannot be an instruction.
  // opBits: 4 (lecture, default) or 5 (ext).  wrap: decode the unsigned bit pattern of a (possibly negative) word.
  function decode(word, addrBits, opBits, wrap) {
    opBits = opBits === undefined ? 4 : opBits;
    var wb = opBits + addrBits;
    if (typeof word !== 'number' || word !== Math.floor(word) || !isFinite(word)) return null;
    if (wrap) { var M = Math.pow(2, wb); word = ((word % M) + M) % M; }
    else if (word < 0 || word >= Math.pow(2, wb)) return null;
    var op = (opBits === 4 ? BY_CODE : ALL_BY_CODE)[Math.floor(word / Math.pow(2, addrBits))];
    if (!op) return null;
    return { op: op, addr: word % Math.pow(2, addrBits) };
  }
  function disasm(word, addrBits, opBits, wrap) {
    var d = decode(word, addrBits, opBits, wrap);
    if (!d) return '—';
    return d.op.arg ? d.op.name + ' ' + d.addr : d.op.name;
  }
  // unsigned view of a word that must fit in the word size (null when it does not / is not a number)
  function unsignedWord(word, wb, wrap) {
    if (typeof word !== 'number' || !isFinite(word)) return null;
    var M = Math.pow(2, wb);
    if (wrap) { if (word !== Math.floor(word)) return null; return ((word % M) + M) % M; }
    return (word < 0 || word >= M) ? null : word;
  }
  // "0011 0101" style string (opcode | address); null when the number does not fit in an unsigned word
  function bits(word, addrBits, opBits, wrap) {
    opBits = opBits === undefined ? 4 : opBits;
    var wb = opBits + addrBits, u = unsignedWord(word, wb, wrap);
    if (u === null) return null;
    var s = u.toString(2);
    while (s.length < wb) s = '0' + s;
    return s.slice(0, opBits) + ' ' + s.slice(opBits);
  }
  function hex(word, addrBits, opBits, wrap) {
    opBits = opBits === undefined ? 4 : opBits;
    var wb = opBits + addrBits, u = unsignedWord(word, wb, wrap);
    if (u === null) return null;
    var s = u.toString(16).toUpperCase(), n = Math.ceil(wb / 4);
    while (s.length < n) s = '0' + s;
    return s;
  }

  /* ───────────── assembler ───────────── */
  var LABEL_RE = /^(\s*)([A-Za-z_]\w*)\s*:/;
  var IDENT_RE = /^[A-Za-z_]\w*$/;
  var UNSIGNED_RE = /^(?:0[xX]([0-9a-fA-F]+)|0[bB]([01]+)|(\d+))$/;
  var SIGNED_RE = /^([+-]?)(?:0[xX]([0-9a-fA-F]+)|0[bB]([01]+)|(\d+))$/;

  // value of an unsigned literal token, or null when malformed / not a safe integer
  function parseUnsigned(t) {
    var m = UNSIGNED_RE.exec(t);
    if (!m) return null;
    var v = m[1] !== undefined ? parseInt(m[1], 16) : m[2] !== undefined ? parseInt(m[2], 2) : parseInt(m[3], 10);
    return (isFinite(v) && v <= MAX_SAFE) ? v : null;
  }
  function parseSigned(t) {
    var m = SIGNED_RE.exec(t);
    if (!m) return null;
    var v = m[2] !== undefined ? parseInt(m[2], 16) : m[3] !== undefined ? parseInt(m[3], 2) : parseInt(m[4], 10);
    if (!isFinite(v) || v > MAX_SAFE) return null;
    return m[1] === '-' ? (v === 0 ? 0 : -v) : v;
  }
  // edit distance with early exit: the distance if it is <= 2, else 3
  function dist2(a, b) {
    var la = a.length, lb = b.length;
    if (Math.abs(la - lb) > 2) return 3;
    var prev = [], cur = [], i, j;
    for (j = 0; j <= lb; j++) prev.push(j);
    for (i = 1; i <= la; i++) {
      cur = [i];
      var rowMin = i;
      for (j = 1; j <= lb; j++) {
        var c = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1));
        cur.push(c);
        if (c < rowMin) rowMin = c;
      }
      if (rowMin > 2) return 3;
      prev = cur;
    }
    return prev[lb] > 2 ? 3 : prev[lb];
  }
  // a word is a plausible typo of a candidate when it is within 2 edits and not (nearly) a different word entirely
  function closeEnough(d, a, b) { return d <= 2 && d < Math.min(a.length, b.length); }

  // keep messages short even when a name is 19000 characters long
  function short(t) { t = String(t); return t.length > 40 ? t.slice(0, 40) + '…' : t; }

  // own-property-safe assignment on a plain object (handles the key '__proto__')
  function setOwn(obj, k, v) {
    if (k === '__proto__') Object.defineProperty(obj, k, { value: v, enumerable: true, writable: true, configurable: true });
    else obj[k] = v;
  }

  // all tokens of code[from..] separated by whitespace and commas: [{text, col (1-based), len}]
  function tokenize(code, from) {
    var re = /[^\s,]+/g, out = [], m;
    re.lastIndex = from;
    while ((m = re.exec(code)) !== null) out.push({ text: m[0], col: m.index + 1, len: m[0].length });
    return out;
  }

  function sizeRequest(v) {
    if (v === undefined || v === null || v === false || v === 0 || v === '' || v === 'auto' || (typeof v === 'number' && v !== v)) return { auto: true };
    var n = v;
    if (typeof v === 'string' && /^\s*\d+\s*$/.test(v)) n = Number(v);
    if (typeof n === 'number' && Math.floor(n) === n && n >= MIN_CELLS && n <= MAX_CELLS && (n & (n - 1)) === 0) return { size: n };
    return { bad: true, text: typeof v === 'string' ? v.slice(0, 30) : String(v) };
  }

  function blankResult(size, isa, errors) {
    var opBits = isa === 'ext' ? 5 : 4, addrBits = addrBitsFor(size), mem = [], cells = [], a;
    for (a = 0; a < size; a++) { mem.push(0); cells.push({ addr: a, kind: 'free', line: 0 }); }
    return { ok: false, errors: errors, size: size, addrBits: addrBits, wordBits: opBits + addrBits, mem: mem, cells: cells, listing: [],
             symbols: {}, names: {}, codeLen: 0, dataStart: 0, isa: isa, opBits: opBits, warnings: [], lineToAddrs: {},
             addrToLine: new Array(size).fill(0), symbolKinds: {} };
  }

  function assemble(src, opts) {
    try { return assembleImpl(src, opts); }
    catch (e) {      // safety net: the assembler must never throw, whatever it is given
      var isa = opts && opts.isa === 'ext' ? 'ext' : 'lecture';
      return blankResult(16, isa, [{ line: 0, col: 0, len: 0, kind: 'internal', msg: 'internal assembler error: ' + (e && e.message) }]);
    }
  }

  function assembleImpl(src, opts) {
    opts = opts || {};
    var isa = opts.isa === 'ext' ? 'ext' : 'lecture', ext = isa === 'ext', opBits = ext ? 5 : 4;
    var sreq = sizeRequest(opts.size);
    var errors = [], errLines = new Set();
    // one error per line; the first one found wins
    function err(line, col, len, kind, msg, hint) {
      if (errLines.has(line)) return;
      errLines.add(line);
      var e = { line: line, col: col, len: len, kind: kind, msg: msg };
      if (hint) e.hint = hint;
      errors.push(e);
    }
    var text0 = src === undefined || src === null ? '' : String(src);
    var fixedSize = sreq.size || MIN_CELLS;

    // limits
    if (text0.length > LIMITS.maxSourceChars) {
      return blankResult(fixedSize, isa, [{ line: 0, col: 0, len: 0, kind: 'too-long', msg: 'the program is too long: at most ' + LIMITS.maxSourceLines + ' lines and ' + LIMITS.maxSourceChars + ' characters are allowed' }]);
    }
    var lines = text0.split(/\r\n|\r|\n/);
    var nLines = (lines.length > 1 && lines[lines.length - 1] === '') ? lines.length - 1 : lines.length;
    if (nLines > LIMITS.maxSourceLines) {
      return blankResult(fixedSize, isa, [{ line: 0, col: 0, len: 0, kind: 'too-long', msg: 'the program is too long: at most ' + LIMITS.maxSourceLines + ' lines and ' + LIMITS.maxSourceChars + ' characters are allowed' }]);
    }

    var section = 'text';
    var items = [];            // code items
    var dataCells = [];        // {value, ref, line}
    var syms = new Map();      // name -> {kind, idx, line, col, len}
    var symOrder = [];         // names in the order they were defined (this is the order of `symbols`)
    var pending = [], pendingSet = new Set();
    var used = new Set();      // names referenced somewhere
    var textTokLines = [];     // text-section lines that carry an instruction attempt (valid or not)
    var rejected = new Set();  // labels refused because they are instruction names

    // Reserved words: the mnemonics (and pseudo-mnemonics) of the ACTIVE instruction set only. In lecture mode a label such as
    // `mod` or `div` is therefore fine, exactly as it always was (the Chapter 8 compiler turns C++ variables into such names);
    // switching the extended set on reserves the extra mnemonics, and the error then says so.
    function reservedWord(label) { var u = label.toUpperCase(); return !!((ext ? ALL_BY_NAME : BY_NAME)[u] || PSEUDO_D[u]); }
    function nameClash(label) {
      return syms.has(label) || pendingSet.has(label) || reservedWord(label);
    }
    function suggestName(word) {
      var lw = word.toLowerCase(), best = null, bd = 3;
      for (var i = 0; i < symOrder.length; i++) {
        var nm = symOrder[i], d = dist2(lw, nm.toLowerCase());
        if (nm !== word && closeEnough(d, lw, nm) && d < bd) { bd = d; best = nm; }
      }
      // pending code labels are defined too
      pending.forEach(function (p) { var d = dist2(lw, p.name.toLowerCase()); if (p.name !== word && closeEnough(d, lw, p.name) && d < bd) { bd = d; best = p.name; } });
      return best;
    }
    function suggestMnemonic(word) {
      var u = word.toUpperCase(), best = null, bd = 3, bestActive = false;
      ALL_MNEMONICS.forEach(function (m) {
        var d = dist2(u, m);
        if (!closeEnough(d, u, m)) return;
        var active = ext || !EXT_ONLY[m];
        if (d < bd || (d === bd && active && !bestActive)) { bd = d; best = m; bestActive = active; }
      });
      return best;
    }
    var EXT_HINT = 'switch on the extended instruction set (Settings → Instruction set) to use it';
    function unknownNameHint(word) {
      var s = suggestName(word);
      return s ? "did you mean '" + short(s) + "'?" + (s !== word && s.toLowerCase() === word.toLowerCase() ? ' (names are case-sensitive)' : '') : undefined;
    }

    // classify an instruction operand token. Returns {num} | {name} | null (error already reported)
    function classifyOperand(tok, ln, imm) {
      var t = tok.text;
      if (IDENT_RE.test(t)) return { name: t, col: tok.col, len: tok.len };
      var v = parseUnsigned(t);
      if (v !== null) return { num: v, col: tok.col, len: tok.len };
      if (/^-/.test(t) && parseUnsigned(t.slice(1)) !== null) err(ln, tok.col, tok.len, 'bad-number', "'" + t + "' is negative: operands are cell numbers and cannot be negative");
      else err(ln, tok.col, tok.len, 'bad-number', "'" + (t.length > 40 ? t.slice(0, 40) + '…' : t) + "' is not a name or a whole number (decimal 12, hex 0x1F or binary 0b101)");
      return null;
    }
    // data value token. Returns {value} | {name} (error reported => {value:0})
    function classifyValue(tok, ln) {
      var t = tok.text;
      if (IDENT_RE.test(t)) return { name: t, col: tok.col, len: tok.len };
      var v = parseSigned(t);
      if (v !== null) return { value: v };
      err(ln, tok.col, tok.len, 'bad-number', "data value '" + (t.length > 40 ? t.slice(0, 40) + '…' : t) + "' is not a whole number (decimal 12, hex 0x1F, binary 0b101 or the name of a cell)");
      return { value: 0 };
    }

    function addData(vals, ln) {
      if (!vals.length) { dataCells.push({ value: 0, ref: null, line: ln }); return; }
      vals.forEach(function (v) {
        if (v.name !== undefined) dataCells.push({ value: 0, ref: v, line: ln });
        else dataCells.push({ value: v.value, ref: null, line: ln });
      });
    }

    function handleData(ln, toks) {
      var first = toks.length ? toks[0].text.toLowerCase() : '';
      if (first === '.space') {
        if (toks.length < 2) { err(ln, toks[0].col, toks[0].len, 'bad-number', '.space needs a count, for example  .space 4'); dataCells.push({ value: 0, ref: null, line: ln }); return; }
        var n = parseUnsigned(toks[1].text);
        if (n === null || n < 1 || n > MAX_CELLS) {
          err(ln, toks[1].col, toks[1].len, 'bad-number', ".space count '" + toks[1].text.slice(0, 40) + "' must be a whole number from 1 to " + MAX_CELLS);
          dataCells.push({ value: 0, ref: null, line: ln }); return;
        }
        if (toks.length > 2) err(ln, toks[2].col, toks[toks.length - 1].col + toks[toks.length - 1].len - toks[2].col, 'operand-count', '.space takes exactly one count');
        for (var k = 0; k < n; k++) dataCells.push({ value: 0, ref: null, line: ln });
        return;
      }
      if (first === '.word') toks = toks.slice(1);
      else if (first.charAt(0) === '.') {
        err(ln, toks[0].col, toks[0].len, 'syntax', "unknown directive '" + toks[0].text.slice(0, 20) + "': the data section understands .word, .space and .text");
        dataCells.push({ value: 0, ref: null, line: ln }); return;
      }
      addData(toks.map(function (t) { return classifyValue(t, ln); }), ln);
    }

    for (var li = 0; li < nLines; li++) {
      var raw = lines[li], ln = li + 1;
      var cut = raw.length, a1 = raw.indexOf(';'), a2 = raw.indexOf('//');
      if (a1 >= 0) cut = a1;
      if (a2 >= 0 && a2 < cut) cut = a2;
      var code = raw.slice(0, cut);
      var first = code.search(/\S/);
      if (first < 0) continue;
      var codeEnd = code.length;
      while (codeEnd > 0 && /\s/.test(code.charAt(codeEnd - 1))) codeEnd--;

      // directives
      if (code.charAt(first) === '.') {
        var dt = tokenize(code, first), low = dt[0].text.toLowerCase();
        if (low === '.data' || low === '.text') {
          section = low === '.data' ? 'data' : 'text';
          if (dt.length > 1) err(ln, dt[1].col, dt[dt.length - 1].col + dt[dt.length - 1].len - dt[1].col, 'syntax', dt[0].text + ' must be alone on its line');
          continue;
        }
        if (section === 'data' && (low === '.word' || low === '.space')) { handleData(ln, dt); continue; }
        err(ln, dt[0].col, dt[0].len, 'syntax', section === 'data'
          ? "unknown directive '" + dt[0].text.slice(0, 20) + "': the data section understands .word, .space and .text"
          : "unexpected '" + dt[0].text.slice(0, 20) + "': in the code section only instructions, labels, .data and .text are allowed");
        if (section === 'data') dataCells.push({ value: 0, ref: null, line: ln });
        continue;
      }

      // optional label
      var m = LABEL_RE.exec(code), label = null, rest = first;
      if (m) {
        label = { name: m[2], line: ln, col: m[1].length + 1, len: m[2].length };
        rest = m[0].length;
        if (nameClash(label.name)) {
          var isRes = reservedWord(label.name);
          err(ln, label.col, label.len, 'duplicate-name', "name '" + short(label.name) + "' is already used (or is an instruction name)",
              isRes ? 'pick a different name: instruction names are reserved' + (ext && EXT_ONLY[label.name.toUpperCase()] ? ' (' + label.name.toUpperCase() + ' is an instruction of the extended set, which is switched on)' : '')
                    : 'every label and variable needs its own name');
          label.dup = true;
          if (isRes) rejected.add(label.name);          // uses of a rejected reserved word are explained here, not by a second "unknown name" error
        }
      }
      var toks = tokenize(code, rest);

      if (section === 'data') {
        if (label && !label.dup) { syms.set(label.name, { kind: 'data', idx: dataCells.length, line: ln, col: label.col, len: label.len }); symOrder.push(label.name); }
        if (!toks.length) { dataCells.push({ value: 0, ref: null, line: ln }); continue; }
        handleData(ln, toks);
        continue;
      }

      // text section
      if (label && !label.dup) { pending.push(label); pendingSet.add(label.name); }
      if (!toks.length) continue;
      textTokLines.push(ln);
      var mt = toks[0], mtext = mt.text;
      if (mtext.charAt(0) === '.') {
        err(ln, mt.col, mt.len, 'syntax', "'" + mtext.slice(0, 20) + "' is a directive: .data and .text must stand alone on their own line, and .word/.space belong in the .data section");
        continue;
      }
      var ascii = /^[A-Za-z]+$/.test(mtext), mn = ascii ? mtext.toUpperCase() : '';
      var real = ascii ? (ext ? ALL_BY_NAME[mn] : BY_NAME[mn]) : undefined;
      var pseudo = ascii && !ext ? PSEUDO_D[mn] : undefined;
      if (!real && !pseudo) {
        if (ascii && !ext && EXT_ONLY[mn]) err(ln, mt.col, mt.len, 'ext-only', mn + ' belongs to the extended instruction set, which is switched off', EXT_HINT);
        else {
          var sg = suggestMnemonic(mtext), hint;
          if (parseSigned(mtext) !== null) hint = "'" + short(mtext) + "' looks like a data value, not an instruction: variables and constants go after a .data line (name: " + short(mtext) + ")";
          else if (sg) hint = "did you mean " + sg + "?" + ((!ext && EXT_ONLY[sg]) ? ' (that one needs the extended instruction set)' : '');
          err(ln, mt.col, mt.len, 'unknown-op', "unknown instruction '" + mtext.slice(0, 30) + "'", hint);
        }
        continue;
      }
      var needs = real ? real.arg : true;
      var lastTok = toks[toks.length - 1];
      if (needs && toks.length !== 2) {
        if (toks.length < 2) err(ln, mt.col, mt.len, 'operand-count', mn + ' needs exactly one operand (a name or a cell number)');
        else err(ln, toks[2].col, lastTok.col + lastTok.len - toks[2].col, 'operand-count', mn + ' needs exactly one operand (a name or a cell number)');
        continue;
      }
      if (!needs && toks.length !== 1) {
        err(ln, toks[1].col, lastTok.col + lastTok.len - toks[1].col, 'operand-count', mn + ' takes no operand');
        continue;
      }
      var operand = null;
      if (needs) { operand = classifyOperand(toks[1], ln, !!(real && real.imm)); if (!operand) continue; }
      var item = { ops: real ? [mn] : PSEUDO_D[mn], mnemonic: mn, op: real || null, operand: operand, line: ln, col: mt.col, len: mt.len,
                   text: code.slice(mt.col - 1, codeEnd), pseudo: !!pseudo };
      pending.forEach(function (p) { syms.set(p.name, { kind: 'code', idx: items.length, line: p.line, col: p.col, len: p.len }); symOrder.push(p.name); });
      pending = []; pendingSet.clear();
      items.push(item);
    }
    // A label that never got an instruction is reported on its own line (or that line already carries a more precise error).
    // Uses of such a name must NOT add a second "unknown name" error: the label line explains the real problem.
    var unbound = new Set();
    pending.forEach(function (p) {
      unbound.add(p.name);
      // a label directly followed by a faulty instruction line is not "without an instruction": that line carries the real error
      if (textTokLines.some(function (tl) { return tl > p.line && errLines.has(tl); })) return;
      err(p.line, p.col, p.len, 'label-no-instr', "label '" + short(p.name) + "' has no instruction after it", 'put an instruction on the next line, or remove the label (a variable belongs after a .data line)');
    });

    // layout
    var codeWords = 0, maxImm = -1;
    items.forEach(function (it) {
      it.start = codeWords; codeWords += it.ops.length;
      if (it.op && it.op.imm && it.operand && it.operand.num !== undefined && it.operand.num > maxImm) maxImm = it.operand.num;
    });
    var total = codeWords + dataCells.length;
    var size;
    if (sreq.size) size = sreq.size;
    else {
      if (sreq.bad) err(0, 0, 0, 'bad-size', 'memory size ' + sreq.text + ' is not allowed: use a power of two from ' + MIN_CELLS + ' to ' + MAX_CELLS, 'choose 16, 32, 64, 128 or 256 cells, or leave the size on Auto');
      size = MIN_CELLS;
      var need = Math.max(total, maxImm + 1);
      while (size < need && size < MAX_CELLS) size *= 2;
    }
    if (total > size) {
      err(0, 0, 0, 'out-of-memory', 'the program needs ' + total + ' cells but ' + (sreq.size ? 'the machine has only ' + size : 'the biggest machine has only ' + MAX_CELLS),
          sreq.size ? 'choose a bigger memory size (Settings), or make the program shorter' : 'make the program shorter or use fewer data cells');
    }
    var addrBits = addrBitsFor(size);

    // symbol addresses (insertion order = definition order, exactly as before)
    var addrOf = new Map(), symbols = {}, symbolKinds = {};
    symOrder.forEach(function (k) {
      var s = syms.get(k), ad = s.kind === 'code' ? (items[s.idx] ? items[s.idx].start : codeWords) : codeWords + s.idx;
      addrOf.set(k, ad); setOwn(symbols, k, ad); setOwn(symbolKinds, k, s.kind);
    });

    // resolve operands, encode
    var mem = [], cells = [], listing = [], lineToAddrs = {}, addrToLine = [], k2;
    for (k2 = 0; k2 < size; k2++) { mem.push(0); cells.push({ addr: k2, kind: 'free', line: 0 }); addrToLine.push(0); }
    function mapLine(ln, at) { (lineToAddrs[ln] || (lineToAddrs[ln] = [])).push(at); addrToLine[at] = ln; }
    var selfMod = [];
    items.forEach(function (it) {
      var addr = 0, o = it.operand;
      if (o) {
        if (o.num !== undefined) addr = o.num;
        else {
          used.add(o.name);
          var av = addrOf.get(o.name);
          if (av === undefined) { if (!unbound.has(o.name) && !rejected.has(o.name)) err(it.line, o.col, o.len, 'unknown-name', "unknown name '" + o.name.slice(0, 40) + "'", unknownNameHint(o.name)); }
          else addr = av;
        }
        if (addr >= size) {
          var isImm = !!(it.op && it.op.imm);
          // when the program simply does not fit, the one out-of-memory error says it all: do not bury it under an
          // 'outside memory' error for every name that landed beyond the end
          if (!(total > size && o.num === undefined)) err(it.line, o.col, o.len, isImm ? 'imm-range' : 'addr-range', isImm
            ? 'immediate value ' + addr + ' is too big: it has to fit in the address field, 0–' + (size - 1) + ' on this ' + size + '-cell machine'
            : 'address ' + addr + ' is outside memory (0–' + (size - 1) + ')',
            isImm ? 'use a smaller number, or a bigger memory size' : undefined);
          addr = 0;
        }
        if (it.mnemonic === 'INCREMENT' || it.mnemonic === 'DECREMENT' || it.mnemonic === 'STORE' || it.mnemonic === 'CLEAR' || it.mnemonic === 'IN') {
          if (addr < codeWords) selfMod.push({ it: it, addr: addr });
        }
      }
      it.ops.forEach(function (name, k) {
        var at = it.start + k;
        if (at >= size) return;
        mem[at] = encode(name, addr, addrBits);
        cells[at] = { addr: at, kind: 'code', line: it.line };
        listing.push({ addr: at, word: mem[at], op: name, operand: ALL_BY_NAME[name].arg ? addr : null, line: it.line,
                       text: it.text, part: it.pseudo ? k + 1 : 0, of: it.ops.length });
        mapLine(it.line, at);
      });
    });
    dataCells.forEach(function (d, k) {
      var at = codeWords + k, val = d.value;
      if (d.ref) {
        used.add(d.ref.name);
        var av = addrOf.get(d.ref.name);
        if (av === undefined) {
          if (unbound.has(d.ref.name) || rejected.has(d.ref.name)) { /* explained on the label's own line */ }
          else if (reservedWord(d.ref.name))
            err(d.line, d.ref.col, d.ref.len, 'unknown-name', "'" + short(d.ref.name) + "' is an instruction, but this line is still in the .data section, where every word is read as a data value",
                'put  .text  on its own line before the code (code always comes first in memory)');
          else err(d.line, d.ref.col, d.ref.len, 'unknown-name', "unknown name '" + d.ref.name.slice(0, 40) + "'", unknownNameHint(d.ref.name));
        }
        else val = av;
      }
      if (at >= size) return;
      mem[at] = val;
      cells[at] = { addr: at, kind: 'data', line: d.line };
      mapLine(d.line, at);
    });
    var names = {};
    symOrder.forEach(function (k) { var ad = addrOf.get(k); names[ad] = (names[ad] ? names[ad] + ', ' : '') + k; });

    errors.sort(function (a, b) { return a.line - b.line; });

    // warnings (only for programs without errors)
    var warnings = [];
    if (!errors.length) {
      var hasHalt = items.some(function (it) { return it.mnemonic === 'HALT'; });
      if (!hasHalt) warnings.push({ line: 0, col: 0, len: 0, kind: 'no-halt', severity: 'warning',
        msg: 'there is no HALT instruction: the machine will keep fetching until it runs off the end of memory' });
      if (items.length) {
        var lastIt = items[items.length - 1], lastOp = lastIt.ops[lastIt.ops.length - 1];
        if (lastOp !== 'HALT' && lastOp !== 'JUMP') warnings.push({ line: lastIt.line, col: lastIt.col, len: lastIt.len, kind: 'runs-off-end', severity: 'warning',
          msg: 'the last instruction (' + lastIt.mnemonic + ') is not HALT or JUMP: the CPU will run on into the data cells or off the end of memory' });
      }
      symOrder.forEach(function (k) {
        if (used.has(k)) return;
        var s = syms.get(k);
        warnings.push({ line: s.line, col: s.col, len: s.len, kind: 'unused-name', severity: 'info', msg: "'" + short(k) + "' is never named in the code (self-modifying code can still reach a cell by its address)" });
      });
      selfMod.forEach(function (x) {
        var o = x.it.operand;
        warnings.push({ line: x.it.line, col: o.col, len: o.len, kind: 'self-modifying', severity: 'info',
          msg: x.it.mnemonic + ' changes cell ' + x.addr + ', which holds an instruction: the program rewrites itself (the stored-program idea)' });
      });
      warnings.sort(function (a, b) { return a.line - b.line; });
    }

    return { ok: errors.length === 0, errors: errors, size: size, addrBits: addrBits, wordBits: opBits + addrBits,
             mem: mem, cells: cells, listing: listing, symbols: symbols, names: names, codeLen: codeWords, dataStart: codeWords,
             isa: isa, opBits: opBits, warnings: warnings, lineToAddrs: lineToAddrs, addrToLine: addrToLine, symbolKinds: symbolKinds };
  }

  /* ───────────── machine ───────────── */
  function create(asm, opts) {
    opts = opts || {};
    var isa = asm.isa === 'ext' ? 'ext' : 'lecture', opBits = asm.opBits || (isa === 'ext' ? 5 : 4);
    var wordBits = asm.wordBits || (opBits + asm.addrBits), wrap = !!opts.wrap;
    var lat = Math.round(+opts.memLatency);
    if (!(lat >= 1)) lat = 1;
    if (lat > 50) lat = 50;
    var mem = asm.mem.slice();
    if (wrap) mem = mem.map(function (v, a) { return asm.cells && asm.cells[a] && asm.cells[a].kind === 'data' ? wrapValue(v, wordBits) : v; });
    return {
      asm: asm, size: asm.size, addrBits: asm.addrBits,
      mem: mem, pc: 0, ir: 0, mar: 0, mdr: 0, r: 0, gt: 0, eq: 0, lt: 0,
      out: [], input: (opts.input || []).slice(), inPos: 0,
      queue: [], halted: false, error: null, waiting: false,
      instrCount: 0, microCount: 0, maxInstr: opts.maxInstr || 10000,
      cur: null,            // the instruction currently being executed {op, addr, at}
      lastMicro: null, lastRead: null, lastWrite: null, trace: [],
      isa: isa, opBits: opBits, wordBits: wordBits, wrap: wrap, memLatency: lat,
      cycles: 0, ifetches: 0, dataReads: 0, dataWrites: 0, mix: {}, errorKind: null,
      curAt: null           // address of the instruction in flight (set when it is fetched), else null
    };
  }
  function fail(s, msg, kind) { s.error = msg; s.errorKind = kind || null; s.queue = []; }

  // "ADD total (cell 10)" — the running instruction, for error messages
  function cellName(s, a) { var n = s.asm && s.asm.names && s.asm.names[a]; return n ? n + ' (cell ' + a + ')' : 'cell ' + a; }
  function instrName(s) { return s.cur ? s.cur.op.name + (s.cur.op.arg ? ' ' + (s.asm && s.asm.names && s.asm.names[s.cur.addr] ? s.asm.names[s.cur.addr].split(', ')[0] : s.cur.addr) : '') : 'the instruction'; }

  function startInstruction(s) {
    s.cur = null; s.curAt = null;
    s.queue.push(
      { phase: 'fetch', label: 'PC → MAR', flow: [['PC', 'MAR']], apply: function (s) {
          if (s.pc < 0 || s.pc >= s.size) { fail(s, 'PC = ' + s.pc + ' points outside memory (0–' + (s.size - 1) + '). The program ran off the end — did you forget HALT?', 'pc-range'); return; }
          s.mar = s.pc; s.curAt = s.pc;
          this.text = 'The control unit copies the address held in PC (' + s.pc + ') into MAR, the memory address register.'; } },
      { phase: 'fetch', label: 'fetch signal: memory[MAR] → MDR', flow: [['MAR', 'MEM'], ['MEM', 'MDR']], memKind: 'ifetch', apply: function (s) {
          s.mdr = s.mem[s.mar]; s.lastRead = s.mar;
          this.text = 'Fetch signal: memory reads the cell at address ' + s.mar + ' (a non-destructive copy) and puts its contents, ' + s.mdr + ', into MDR.'; } },
      { phase: 'fetch', label: 'MDR → IR', flow: [['MDR', 'IR']], apply: function (s) {
          s.ir = s.mdr;
          this.text = 'The word in MDR is copied into IR, the instruction register, where it stays while it is decoded and executed.'; } },
      { phase: 'fetch', label: 'PC + 1 → PC', flow: [['PC', 'PC']], apply: function (s) {
          s.pc = s.pc + 1;
          this.text = 'PC is increased by 1, so it already points to the next instruction. (A jump will overwrite it later.)'; } },
      { phase: 'decode', label: 'IR → decoder', flow: [['IR', 'DEC']], apply: function (s) {
          var d = decode(s.ir, s.addrBits, s.opBits, s.wrap);
          if (!d) {
            fail(s, 'IR holds ' + s.ir + ', which is not a valid instruction word (opcode 0–' + (s.opBits === 5 ? 27 : 15) + ' followed by an address). A data value was executed as code.', 'bad-word');
            return;
          }
          s.cur = { op: d.op, addr: d.addr, at: s.mar };
          this.text = 'The decoder splits IR into opcode ' + bits(s.ir, s.addrBits, s.opBits, s.wrap) + ' → ' + d.op.name +
            (d.op.imm ? ' and the number ' + d.addr + ' in the address field (an immediate value: it is used as a number, not as an address)' :
             d.op.arg ? ' and address field ' + d.addr : ' (no address field)') + ', and switches on the circuits for that instruction.';
          Array.prototype.push.apply(s.queue, execSteps(d.op, d.addr));
        } }
    );
  }

  function toMar(addr) {
    return { phase: 'execute', label: 'IR.address → MAR', flow: [['IR', 'MAR']], apply: function (s) {
      s.mar = addr; this.text = 'The address field of IR (' + addr + ') is copied into MAR.'; } };
  }
  function fetchMdr(textFn) {
    return { phase: 'execute', label: 'fetch signal: memory[MAR] → MDR', flow: [['MAR', 'MEM'], ['MEM', 'MDR']], memKind: 'read', apply: function (s) {
      s.mdr = s.mem[s.mar]; s.lastRead = s.mar;
      this.text = textFn ? textFn(s) : 'Fetch signal: memory copies cell ' + s.mar + ' (value ' + s.mdr + ') into MDR.'; } };
  }
  function storeSig() {
    return { phase: 'execute', label: 'store signal: MDR → memory[MAR]', flow: [['MDR', 'MEM']], memKind: 'write', apply: function (s) {
      s.mem[s.mar] = s.mdr; s.lastWrite = s.mar;
      this.text = 'Store signal: memory overwrites cell ' + s.mar + ' with ' + s.mdr + ' (a destructive write — the old value is gone).'; } };
  }
  function jumpIf(name, test, addr, what) {
    return { phase: 'execute', label: name === 'JUMP' ? 'IR.address → PC' : 'test flag, maybe IR.address → PC',
      flow: [['IR', 'PC']], apply: function (s) {
        if (test(s)) { s.pc = addr; this.text = name === 'JUMP' ? 'PC is overwritten with ' + addr + ': the next instruction will be fetched from there.' :
          'The flag condition holds, so PC is overwritten with ' + addr + ' — the jump is taken.'; }
        else { this.text = 'The flag condition does not hold (GT=' + s.gt + ', EQ=' + s.eq + ', LT=' + s.lt + '), so PC is left alone and execution simply continues with the next cell.'; this.flow = []; }
      } };
  }

  // Fit an arithmetic result into the machine: wrap mode normalises to W-bit two's complement; otherwise a result
  // beyond the exactly-representable range is an `overflow` error. Returns the value, or undefined after failing.
  function fit(s, v, shown) {
    if (typeof v !== 'number' || v !== v || !isFinite(v) || (!s.wrap && (v > MAX_SAFE || v < -MAX_SAFE))) {
      fail(s, 'Number too large: ' + instrName(s) + ' would give ' + shown + ', which is beyond ±' + MAX_SAFE + ', the largest whole number this machine keeps exactly. ' +
        'Check for a loop that keeps growing a value (a missing exit test?), or switch the cell width to "wrap around" to see what a real fixed-width machine does.', 'overflow');
      return undefined;
    }
    return s.wrap ? wrapValue(v, s.wordBits) : v + 0;       // + 0 turns -0 into 0
  }
  // text for a result: just the number, or "128 (too big for 8 bits: wraps around to -128)" in wrap mode
  function wrapNote(s, raw, got) {
    return s.wrap && raw !== got ? raw + ' (too big for ' + s.wordBits + ' bits, so it wraps around to ' + got + ')' : String(got);
  }
  var SYMS = { ADD: '+', SUBTRACT: '−', MUL: '×', DIV: '÷', MOD: 'mod' };

  // R op MDR → R   (ADD SUBTRACT MUL DIV MOD)
  function aluRStep(n) {
    var lab = { ADD: 'ALU: R + MDR → R', SUBTRACT: 'ALU: R − MDR → R', MUL: 'ALU: R × MDR → R', DIV: 'ALU: R ÷ MDR → R', MOD: 'ALU: R mod MDR → R' }[n];
    return { phase: 'execute', label: lab, flow: [['R', 'ALU'], ['MDR', 'ALU'], ['ALU', 'R']], apply: function (s) {
      var a = s.r, b = s.mdr, raw, v;
      if (n === 'ADD') raw = a + b;
      else if (n === 'SUBTRACT') raw = a - b;
      else if (n === 'MUL') raw = a * b;
      else {
        if (b === 0) {
          fail(s, 'Division by zero: ' + instrName(s) + ' divides R (' + a + ') by ' + cellName(s, s.mar) + ', which holds 0, and that has no answer. ' +
            'An x86 CPU raises an exception here, and C++ calls it undefined behaviour. Check that the divisor cell is not 0 (COMPARE it with a zero cell and jump away), or look at the input you gave.', 'div-zero');
          return;
        }
        var rem = a % b;
        raw = n === 'MOD' ? rem : (a - rem) / b;        // exact: (a - rem) is a multiple of b
      }
      v = fit(s, raw, (n === 'MUL' ? 'about ' + raw : String(raw)));
      if (v === undefined) return;
      s.r = v;
      var res = wrapNote(s, raw, v);
      if (n === 'DIV') this.text = 'The ALU divides ' + a + ' ÷ ' + b + ' = ' + res + ' and stores it in R. (Integer division: the fraction is cut off toward zero, like C++.)';
      else if (n === 'MOD') this.text = 'The ALU computes the remainder of ' + a + ' ÷ ' + b + ': ' + a + ' mod ' + b + ' = ' + res + ', and stores it in R. (The sign follows R, like % in C++.)';
      else this.text = 'The ALU computes ' + a + ' ' + SYMS[n] + ' ' + b + ' = ' + res + ' and stores it back in R.';
    } };
  }
  // pointer check shared by LOADP / STOREP (the step that copies MDR into MAR)
  function ptrStep(forStore) {
    return { phase: 'execute', label: 'MDR → MAR', flow: [['MDR', 'MAR']], apply: function (s) {
      var p = s.mdr;
      if (!(typeof p === 'number' && Math.floor(p) === p && p >= 0 && p < s.size)) {
        fail(s, 'Pointer outside memory: ' + instrName(s) + ' read the pointer ' + p + ' from ' + cellName(s, s.cur ? s.cur.addr : s.mar) + ', but the machine only has cells 0–' + (s.size - 1) + '. ' +
          'A pointer must hold the address of a real cell. Check that the pointer cell was set up (and stepped) correctly before this instruction.', 'ptr-range');
        return;
      }
      s.mar = p;
      this.text = 'The pointer that was just read (' + p + ') is copied from MDR into MAR, so the next memory access goes to cell ' + p + (forStore ? ', the cell we want to write.' : ', the cell it points to.');
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
      case 'ADD': case 'SUBTRACT': case 'MUL': case 'DIV': case 'MOD': return [toMar(addr), fetchMdr(), aluRStep(n)];
      case 'INCREMENT': case 'DECREMENT': return [toMar(addr), fetchMdr(),
        { phase: 'execute', label: n === 'INCREMENT' ? 'ALU: MDR + 1 → MDR' : 'ALU: MDR − 1 → MDR', flow: [['MDR', 'ALU'], ['ALU', 'MDR']], apply: function (s) {
          var before = s.mdr, raw = n === 'INCREMENT' ? s.mdr + 1 : s.mdr - 1, v = fit(s, raw, String(raw));
          if (v === undefined) return;
          s.mdr = v;
          this.text = 'The ALU turns ' + before + ' into ' + wrapNote(s, raw, v) + ' (R is untouched).'; } }, storeSig()];
      case 'COMPARE': return [toMar(addr), fetchMdr(),
        { phase: 'execute', label: 'ALU: compare MDR with R → GT/EQ/LT', flow: [['MDR', 'ALU'], ['R', 'ALU'], ['ALU', 'FLAGS']], apply: function (s) {
          s.gt = s.mdr > s.r ? 1 : 0; s.eq = s.mdr === s.r ? 1 : 0; s.lt = s.mdr < s.r ? 1 : 0;
          this.text = 'Compare CON(X) = ' + s.mdr + ' with R = ' + s.r + ': GT=' + s.gt + ', EQ=' + s.eq + ', LT=' + s.lt + '. (GT means the cell is bigger than R.)'; } }];
      case 'JUMP': return [jumpIf('JUMP', function () { return true; }, addr)];
      case 'JUMPGT': return [jumpIf(n, function (s) { return s.gt === 1; }, addr)];
      case 'JUMPLT': return [jumpIf(n, function (s) { return s.lt === 1; }, addr)];
      case 'JUMPEQ': return [jumpIf(n, function (s) { return s.eq === 1; }, addr)];
      case 'JUMPNEQ': return [jumpIf(n, function (s) { return s.eq === 0; }, addr)];
      case 'JUMPGE': return [jumpIf(n, function (s) { return s.gt === 1 || s.eq === 1; }, addr)];
      case 'JUMPLE': return [jumpIf(n, function (s) { return s.lt === 1 || s.eq === 1; }, addr)];
      case 'IN': return [toMar(addr),
        { phase: 'execute', label: 'input device → MDR', needInput: true, flow: [['IN', 'MDR']], apply: function (s) {
          var raw = s.input[s.inPos];
          if (typeof raw !== 'number') { try { raw = +raw; } catch (e) { raw = 0; } }   // be forgiving about odd input values (numeric strings, a BigInt ...)
          if (raw !== raw) raw = 0;                           // NaN → 0
          else if (!isFinite(raw) || raw > MAX_SAFE || raw < -MAX_SAFE) {
            // Infinity or a number that is not an exact whole number any more: refuse it (in wrap mode too) instead of storing it
            fail(s, 'Input too large: the input value ' + (isFinite(raw) ? raw : (raw > 0 ? 'Infinity' : '-Infinity')) + ' is beyond ±' + MAX_SAFE +
              ', the largest whole number this machine keeps exactly (and ' + (s.wrap ? 'wrap-around needs an exact number to start from' : 'it would not even print as a normal number') + '). Type a smaller number.', 'overflow');
            return;
          }
          s.inPos++;                                          // consumed only once the value is accepted
          raw = Math.trunc(raw) + 0;                          // fractions cut toward zero; no -0
          s.mdr = s.wrap ? wrapValue(raw, s.wordBits) : raw;
          this.text = 'The next number from the input queue, ' + s.mdr + ', arrives in MDR' + (s.wrap && raw !== s.mdr ? ' (' + raw + ' does not fit in ' + s.wordBits + ' bits, so it wrapped around)' : '') + '.'; } }, storeSig()];
      case 'OUT': return [toMar(addr), fetchMdr(),
        { phase: 'execute', label: 'MDR → output device', flow: [['MDR', 'OUT']], apply: function (s) {
          s.out.push(s.mdr); this.text = 'The value ' + s.mdr + ' is sent to the output device and printed in decimal.'; } }];
      case 'HALT': return [{ phase: 'execute', label: 'stop', flow: [], apply: function (s) {
        s.halted = true; this.text = 'HALT: the control unit stops the fetch–decode–execute loop.'; } }];

      /* ── extended instruction set ── */
      case 'NOP': return [{ phase: 'execute', label: 'NOP: do nothing', flow: [], apply: function (s) {
        this.text = 'NOP does nothing at all. It still costs a whole fetch–decode–execute cycle, though, and it takes up one memory cell.'; } }];
      case 'LOADI': return [
        { phase: 'execute', label: 'IR.address → ALU', flow: [['IR', 'ALU']], apply: function (s) {
          this.text = 'The address field of IR (' + addr + ') is not used as an address this time: it is the number itself (an immediate value) and goes straight to the ALU. No memory read is needed.'; } },
        { phase: 'execute', label: 'ALU → R', flow: [['ALU', 'R']], apply: function (s) {
          s.r = addr; this.text = 'The ALU passes the number on to the accumulator R, which now holds ' + s.r + '.'; } }];
      case 'ADDI': case 'SUBI': return [
        { phase: 'execute', label: 'IR.address → ALU', flow: [['IR', 'ALU']], apply: function (s) {
          this.text = 'The number ' + addr + ' inside the instruction (an immediate value) goes straight to the ALU. No memory read is needed.'; } },
        { phase: 'execute', label: n === 'ADDI' ? 'ALU: R + n → R' : 'ALU: R − n → R', flow: [['R', 'ALU'], ['ALU', 'R']], apply: function (s) {
          var a = s.r, raw = n === 'ADDI' ? a + addr : a - addr, v = fit(s, raw, String(raw));
          if (v === undefined) return;
          s.r = v;
          this.text = 'The ALU computes ' + a + (n === 'ADDI' ? ' + ' : ' − ') + addr + ' = ' + wrapNote(s, raw, v) + ' and stores it back in R.'; } }];
      case 'CMPI': return [
        { phase: 'execute', label: 'IR.address → ALU', flow: [['IR', 'ALU']], apply: function (s) {
          this.text = 'The number ' + addr + ' inside the instruction (an immediate value) goes straight to the ALU. No memory read is needed.'; } },
        { phase: 'execute', label: 'ALU: compare n with R → GT/EQ/LT', flow: [['R', 'ALU'], ['ALU', 'FLAGS']], apply: function (s) {
          s.gt = addr > s.r ? 1 : 0; s.eq = addr === s.r ? 1 : 0; s.lt = addr < s.r ? 1 : 0;
          this.text = 'Compare n = ' + addr + ' with R = ' + s.r + ': GT=' + s.gt + ', EQ=' + s.eq + ', LT=' + s.lt + '. (GT means n is bigger than R.)'; } }];
      case 'LOADP': return [toMar(addr),
        fetchMdr(function (s) { return 'First read: cell ' + s.mar + ' holds a POINTER, the address of another cell. Memory copies it (' + s.mdr + ') into MDR.'; }),
        ptrStep(false),
        fetchMdr(function (s) { return 'Second read: following the pointer, memory copies cell ' + s.mar + ' (value ' + s.mdr + ') into MDR.'; }),
        { phase: 'execute', label: 'MDR → R', flow: [['MDR', 'R']], apply: function (s) { s.r = s.mdr; this.text = 'MDR is copied into the accumulator R, which now holds ' + s.r + '.'; } }];
      case 'STOREP': return [toMar(addr),
        fetchMdr(function (s) { return 'First read: cell ' + s.mar + ' holds a POINTER, the address of the cell we want to write. Memory copies it (' + s.mdr + ') into MDR.'; }),
        ptrStep(true),
        { phase: 'execute', label: 'R → MDR', flow: [['R', 'MDR']], apply: function (s) { s.mdr = s.r; this.text = 'R (' + s.r + ') is copied into MDR, ready to be written to the cell the pointer named.'; } },
        storeSig()];
    }
    return [];
  }

  // One micro-step. Returns the micro-step descriptor (with .text filled in), or null if nothing happened.
  function stepMicro(s) {
    if (s.halted || s.error) return null;
    if (!s.queue.length) {
      if (s.instrCount >= s.maxInstr) { fail(s, 'Step guard: more than ' + s.maxInstr + ' instructions were executed. The program is probably an infinite loop.', 'step-guard'); return null; }
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
    if (m.memKind) {
      s.cycles += s.memLatency;
      if (m.memKind === 'ifetch') s.ifetches++; else if (m.memKind === 'read') s.dataReads++; else s.dataWrites++;
    } else s.cycles++;
    s.lastMicro = m;
    if (!s.queue.length) {
      s.instrCount++;
      if (s.cur) {
        var nm = s.cur.op.name;
        s.mix[nm] = (s.mix[nm] || 0) + 1;
        s.trace.push({ at: s.cur.at, arg: s.cur.op.arg ? s.cur.addr : null, text: s.cur.op.arg ? nm + ' ' + s.cur.addr : nm, r: s.r, pc: s.pc, gt: s.gt, eq: s.eq, lt: s.lt, n: s.instrCount });
      }
      if (s.trace.length > 500) s.trace.shift();
      s.curAt = null;
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

  /* ───────────── statistics and headless test runs ───────────── */
  function stats(s) {
    var memMicro = s.ifetches + s.dataReads + s.dataWrites, memCycles = memMicro * s.memLatency, mix = {};
    Object.keys(s.mix).forEach(function (k) { mix[k] = s.mix[k]; });
    return { instr: s.instrCount, micro: s.microCount, cycles: s.cycles, memLatency: s.memLatency, ifetches: s.ifetches, dataReads: s.dataReads,
             dataWrites: s.dataWrites, memMicro: memMicro, memCycles: memCycles, memShare: s.cycles > 0 ? memCycles / s.cycles : 0, mix: mix };
  }
  // Run the program once per case ({in:[…]}) without any animation. status: 'halted', 'waiting' (ran out of input) or the errorKind.
  function runCases(asm, cases, opts) {
    opts = opts || {};
    return (Array.isArray(cases) ? cases : []).map(function (c) {
      var inp = c && Array.isArray(c.in) ? c.in.slice() : [];
      if (!asm || !asm.ok) return { in: inp, out: [], halted: false, waiting: false, error: 'The program has assembler errors, so it cannot run.', errorKind: 'asm-error', status: 'asm-error', instr: 0, micro: 0, cycles: 0 };
      var s = create(asm, { input: inp, maxInstr: opts.maxInstr, memLatency: opts.memLatency, wrap: opts.wrap });
      run(s);
      var status = s.halted ? 'halted' : s.error ? (s.errorKind || 'error') : s.waiting ? 'waiting' : 'unfinished';
      return { in: inp, out: s.out.slice(), halted: s.halted, waiting: s.waiting, error: s.error, errorKind: s.errorKind, status: status,
               instr: s.instrCount, micro: s.microCount, cycles: s.cycles };
    });
  }

  var VN = { OPS: OPS, OPS_EXT: OPS_EXT, opsFor: opsFor, PSEUDO: PSEUDO, assemble: assemble, create: create, stepMicro: stepMicro, stepInstr: stepInstr, run: run,
             pushInput: pushInput, encode: encode, decode: decode, disasm: disasm, bits: bits, hex: hex,
             stats: stats, runCases: runCases, wrapValue: wrapValue, limits: LIMITS, version: 2 };

  if (typeof module !== 'undefined' && module.exports) module.exports = VN;
  else global.VNMachine = VN;
})(typeof window !== 'undefined' ? window : this);
