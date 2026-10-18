/* Tiny compiler — CO1005 Chapter 8. Pure engine (no DOM).
   Compiles a very small subset of C++ to the TOY Von Neumann machine of assets/vn-machine.js
   (a teaching machine, not x86 or ARM) and keeps the C++-line <-> assembly-line mapping.

   Subset:  int a, b = 3, c;      a = b + c - 5;      cin >> a >> b;      cout << a << endl;
            if (a > b) { ... } else { ... }      while (a != 0) { ... }
            comparisons: == != < > <= >=        (optional  #include / using namespace std; / int main() { ... return 0; })
   Pipeline: tokenize -> parse (AST) -> generate assembly (with mapping) -> assemble (vn-machine) -> run.
   interpret() is an independent reference interpreter of the AST: "what the C++ program prints".      */
(function (global) {
  'use strict';
  var VN = (typeof module !== 'undefined' && module.exports) ? require('./vn-machine.js') : global.VNMachine;

  var KEYWORDS = { 'int': 1, 'cin': 1, 'cout': 1, 'endl': 1, 'if': 1, 'else': 1, 'while': 1, 'return': 1, 'main': 1, 'using': 1, 'namespace': 1, 'std': 1 };

  function CompileError(line, msg) { this.line = line; this.msg = msg; }

  /* ───── 1. tokens ───── */
  function tokenize(src, sink) {                 // sink (optional): array that receives the tokens as they are found, so they survive an error
    var toks = sink || [], i = 0, line = 1, n = src.length;
    while (i < n) {
      var c = src[i];
      if (c === '\n') { line++; i++; continue; }
      if (/\s/.test(c)) { i++; continue; }
      if (c === '#') { while (i < n && src[i] !== '\n') i++; continue; }              // #include ...
      if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
      if (c === '/' && src[i + 1] === '*') {
        i += 2;
        while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') line++; i++; }
        i += 2; continue;
      }
      var m;
      if ((m = /^[A-Za-z_]\w*/.exec(src.slice(i)))) { toks.push({ t: KEYWORDS[m[0]] ? 'kw' : 'id', v: m[0], line: line }); i += m[0].length; continue; }
      if ((m = /^\d+/.exec(src.slice(i)))) { toks.push({ t: 'num', v: m[0], line: line }); i += m[0].length; continue; }
      if (c === '"') {
        var j = i + 1; while (j < n && src[j] !== '"' && src[j] !== '\n') j++;
        toks.push({ t: 'str', v: src.slice(i, j + 1), line: line }); i = j + 1; continue;
      }
      var two = src.substr(i, 2);
      if (two === '<<' || two === '>>' || two === '==' || two === '!=' || two === '<=' || two === '>=') { toks.push({ t: 'op', v: two, line: line }); i += 2; continue; }
      if ('<>+-='.indexOf(c) >= 0) { toks.push({ t: 'op', v: c, line: line }); i++; continue; }
      if (';(){},'.indexOf(c) >= 0) { toks.push({ t: 'punct', v: c, line: line }); i++; continue; }
      throw new CompileError(line, "the tiny compiler does not understand the character '" + c + "'");
    }
    return toks;
  }

  /* ───── 2. parser ───── */
  function termText(t) { return t.k === 'var' ? t.name : String(t.value); }
  function exprText(e) { return e.terms.map(function (t, i) { return (i ? ' ' + t.sign + ' ' : '') + termText(t.term); }).join(''); }
  function nodeLabel(n) {
    switch (n.k) {
      case 'decl': return 'Declare ' + n.name + (n.expr ? ' = ' + exprText(n.expr) : '');
      case 'assign': return 'Assign ' + n.name + ' = ' + exprText(n.expr);
      case 'in': return 'Input -> ' + n.name;
      case 'out': return 'Output ' + exprText(n.expr);
      default: return n.k;
    }
  }
  function parse(toks, hook) {                   // hook (optional): called with {node,label,line,depth} as the tree grows (pre-order for if/while)
    var p = 0, declared = {}, depth = 0;
    function peek() { return toks[p]; }
    function lastLine() { return toks.length ? toks[Math.min(p, toks.length - 1)].line : 1; }
    function isTok(v) { var t = toks[p]; return t && t.v === v && t.t !== 'str'; }
    function expect(v, why) {
      if (!isTok(v)) {
        var t = toks[p];
        throw new CompileError(t ? t.line : lastLine(), "expected '" + v + "'" + (why ? ' ' + why : '') + (t ? " but found '" + t.v + "'" : ' but the program ended'));
      }
      return toks[p++];
    }
    function ident() {
      var t = toks[p];
      if (!t || t.t !== 'id') throw new CompileError(t ? t.line : lastLine(), 'expected a variable name' + (t ? " but found '" + t.v + "'" : ''));
      p++; return t;
    }
    function use(t) { if (!declared[t.v]) throw new CompileError(t.line, "variable '" + t.v + "' is used before it is declared (the compiler would say: not declared in this scope)"); }
    function term() {
      var t = toks[p];
      if (!t) throw new CompileError(lastLine(), 'expected a value');
      if (t.t === 'id') { use(t); p++; return { k: 'var', name: t.v, line: t.line }; }
      if (t.t === 'num') { p++; return { k: 'num', value: parseInt(t.v, 10), line: t.line }; }
      if (t.v === '-' && toks[p + 1] && toks[p + 1].t === 'num') { p += 2; return { k: 'num', value: -parseInt(toks[p - 1].v, 10), line: t.line }; }
      if (t.t === 'str') throw new CompileError(t.line, 'text strings are outside the tiny subset: the toy machine prints integers only');
      throw new CompileError(t.line, "expected a variable or a whole number but found '" + t.v + "'");
    }
    function expr() {
      var line = toks[p] ? toks[p].line : lastLine();
      var terms = [{ sign: '+', term: term() }];
      while (toks[p] && (toks[p].v === '+' || toks[p].v === '-') && toks[p].t === 'op') {
        var s = toks[p++].v; terms.push({ sign: s, term: term() });
      }
      return { terms: terms, line: line };
    }
    function cond() {
      var line = toks[p] ? toks[p].line : lastLine();
      var l = term(), t = toks[p];
      if (!t || t.t !== 'op' || ['==', '!=', '<', '>', '<=', '>='].indexOf(t.v) < 0)
        throw new CompileError(t ? t.line : line, 'a condition must compare two values with == != < > <= >=' + (t ? " (found '" + t.v + "')" : ''));
      p++;
      var r = term();
      return { op: t.v, left: l, right: r, line: line };
    }
    function body() {
      if (isTok('{')) { p++; var list = stmts('}'); expect('}'); return list; }
      return stmt();
    }
    function stmts(stop) {
      var out = [];
      while (p < toks.length && !(stop && isTok(stop))) {
        var s = stmt(); Array.prototype.push.apply(out, s);
      }
      return out;
    }
    function stmt() {
      var r = stmt0();
      if (hook) r.forEach(function (n) { if (n.k !== 'if' && n.k !== 'while' && n.k !== 'endl') hook({ node: n.k, label: nodeLabel(n), line: n.line, depth: depth }); });
      return r;
    }
    function stmt0() {
      var t = toks[p];
      if (!t) return [];
      var line = t.line, out = [];
      if (t.t === 'kw' && t.v === 'int') {
        p++;
        do {
          var id = ident();
          if (declared[id.v]) throw new CompileError(id.line, "variable '" + id.v + "' is declared twice");
          var e = null;
          if (isTok('=')) { p++; e = expr(); }
          declared[id.v] = true;
          out.push({ k: 'decl', name: id.v, expr: e, line: id.line });
          if (isTok(',')) p++; else break;
        } while (true);
        expect(';', 'at the end of the declaration');
        return out;
      }
      if (t.t === 'id') {
        use(t); p++; expect('=', 'in an assignment');
        var ex = expr(); expect(';', 'at the end of the statement');
        return [{ k: 'assign', name: t.v, expr: ex, line: line }];
      }
      if (t.v === 'cin') {
        p++; expect('>>');
        do { var v = ident(); use(v); out.push({ k: 'in', name: v.v, line: line }); if (isTok('>>')) p++; else break; } while (true);
        expect(';', 'at the end of the statement');
        return out;
      }
      if (t.v === 'cout') {
        p++; expect('<<');
        do {
          if (isTok('endl')) { p++; out.push({ k: 'endl', line: line }); }
          else out.push({ k: 'out', expr: expr(), line: line });
          if (isTok('<<')) p++; else break;
        } while (true);
        expect(';', 'at the end of the statement');
        return out;
      }
      if (t.v === 'if') {
        p++; expect('('); var c = cond(); expect(')');
        if (hook) hook({ node: 'if', label: 'If ' + termText(c.left) + ' ' + c.op + ' ' + termText(c.right), line: line, depth: depth });
        depth++;
        var th = body(), el = null;
        if (isTok('else')) { p++; el = body(); }
        depth--;
        return [{ k: 'if', cond: c, then: [].concat(th), else: el ? [].concat(el) : null, line: line }];
      }
      if (t.v === 'while') {
        p++; expect('('); var c2 = cond(); expect(')');
        if (hook) hook({ node: 'while', label: 'While ' + termText(c2.left) + ' ' + c2.op + ' ' + termText(c2.right), line: line, depth: depth });
        depth++;
        var wb = [].concat(body());
        depth--;
        return [{ k: 'while', cond: c2, body: wb, line: line }];
      }
      if (t.v === 'return') { p++; if (toks[p] && toks[p].t === 'num') p++; expect(';'); return []; }
      if (t.v === '{') { p++; var inner = stmts('}'); expect('}'); return inner; }
      if (t.v === ';') { p++; return []; }
      throw new CompileError(line, "the tiny compiler does not know how to start a statement with '" + t.v + "'");
    }

    // optional boilerplate
    if (isTok('using')) { p++; expect('namespace'); expect('std'); expect(';'); }
    var list;
    if (isTok('int') && toks[p + 1] && toks[p + 1].v === 'main') {
      p += 2; expect('('); expect(')'); expect('{'); list = stmts('}'); expect('}');
      if (p < toks.length) throw new CompileError(toks[p].line, 'unexpected text after the end of main()');
    } else list = stmts(null);
    return { k: 'program', body: list };
  }

  /* ───── 3. code generation ───── */
  var NEG_JUMP = { '>': 'JUMPLE', '<': 'JUMPGE', '==': 'JUMPNEQ', '!=': 'JUMPEQ', '>=': 'JUMPLT', '<=': 'JUMPGT' };

  function generate(ast) {
    var code = [], vars = [], consts = {}, constOrder = [], labelN = 0, needTmp = false;
    function reserved(n) { var u = n.toUpperCase(); return !!(VN.OPS.some(function (o) { return o.name === u; }) || VN.PSEUDO[u]); }
    function an(name) { return reserved(name) ? name + '_' : name; }
    function emit(text, cline, comment, kind) { code.push({ text: text, cline: cline, comment: comment || '', kind: kind || 'code' }); }
    function label(name, cline) { emit(name + ':', cline, '', 'label'); }
    function constName(v) {
      var nm = v < 0 ? '_m' + (-v) : '_' + v;
      if (!(nm in consts)) { consts[nm] = v; constOrder.push(nm); }
      return nm;
    }
    function operand(t) { return t.k === 'var' ? an(t.name) : constName(t.value); }
    function desc(t) { return t.k === 'var' ? t.name : String(t.value); }

    function evalInto(e, cline) {                     // leaves the value of e in R
      emit('LOAD ' + operand(e.terms[0].term), cline, 'R = ' + desc(e.terms[0].term));
      for (var i = 1; i < e.terms.length; i++) {
        var tm = e.terms[i];
        emit((tm.sign === '+' ? 'ADD ' : 'SUBTRACT ') + operand(tm.term), cline, 'R = R ' + tm.sign + ' ' + desc(tm.term));
      }
    }
    function condJump(c, target, cline) {             // jump to target when the condition is FALSE
      emit('LOAD ' + operand(c.right), cline, 'R = ' + desc(c.right));
      emit('COMPARE ' + operand(c.left), cline, 'is ' + desc(c.left) + ' bigger / equal / smaller than R?');
      emit(NEG_JUMP[c.op] + ' ' + target, cline, 'condition (' + desc(c.left) + ' ' + c.op + ' ' + desc(c.right) + ') false -> skip');
    }
    function block(list) { list.forEach(stmt); }
    function stmt(s) {
      switch (s.k) {
        case 'decl':
          vars.push(s.name);
          if (s.expr) { evalInto(s.expr, s.line); emit('STORE ' + an(s.name), s.line, s.name + ' = R'); }
          break;
        case 'assign': evalInto(s.expr, s.line); emit('STORE ' + an(s.name), s.line, s.name + ' = R'); break;
        case 'in': emit('IN ' + an(s.name), s.line, 'read a number into ' + s.name); break;
        case 'endl': break;
        case 'out':
          if (s.expr.terms.length === 1) emit('OUT ' + operand(s.expr.terms[0].term), s.line, 'print ' + desc(s.expr.terms[0].term));
          else { needTmp = true; evalInto(s.expr, s.line); emit('STORE _t', s.line, 'temporary'); emit('OUT _t', s.line, 'print the sum'); }
          break;
        case 'if':
          var id = ++labelN;
          if (s.else) {
            condJump(s.cond, 'Lelse' + id, s.line);
            block(s.then);
            emit('JUMP Lend' + id, s.line, 'skip the else-part');
            label('Lelse' + id, s.line);
            block(s.else);
            label('Lend' + id, s.line);
          } else {
            condJump(s.cond, 'Lend' + id, s.line);
            block(s.then);
            label('Lend' + id, s.line);
          }
          break;
        case 'while':
          var w = ++labelN;
          label('Ltop' + w, s.line);
          condJump(s.cond, 'Lexit' + w, s.line);
          block(s.body);
          emit('JUMP Ltop' + w, s.line, 'go back and test again');
          label('Lexit' + w, s.line);
          break;
      }
    }
    // gather constants/vars via a dry run
    block(ast.body);
    emit('HALT', 0, 'end of program');
    emit('.data', 0, '', 'dir');
    var declLine = {};
    (function find(list) { list.forEach(function (s) { if (s.k === 'decl') declLine[s.name] = s.line; if (s.k === 'if') { find(s.then); if (s.else) find(s.else); } if (s.k === 'while') find(s.body); }); })(ast.body);
    vars.forEach(function (v) { emit(an(v) + ': 0', declLine[v] || 0, 'int ' + v + ' (starts at 0 here; real C++ leaves it undefined)', 'data'); });
    constOrder.forEach(function (c) { emit(c + ': ' + consts[c], 0, 'constant ' + consts[c] + ' — this ISA has no immediate operands, so it lives in a cell', 'data'); });
    if (needTmp) emit('_t: 0', 0, 'scratch cell', 'data');
    return code;
  }

  function asmText(lines) {
    return lines.map(function (l) {
      var body = l.kind === 'code' ? '        ' + l.text : l.text;
      if (l.comment) body = (body + '                              ').slice(0, Math.max(body.length, 30)) + ' ; ' + l.comment;
      return body;
    }).join('\n') + '\n';
  }

  /* ───── 4. top level ───── */
  function compile(src) {
    var res = { ok: false, errors: [], tokens: [], ast: null, asmLines: [], asmText: '', asm: null };
    try {
      res.tokens = tokenize(src);
      res.ast = parse(res.tokens);
      res.asmLines = generate(res.ast);
      res.asmText = asmText(res.asmLines);
      res.asm = VN.assemble(res.asmText);
      if (!res.asm.ok) res.errors = res.asm.errors.map(function (e) { return { line: 0, msg: 'assembler: ' + e.msg + (e.line ? ' (assembly line ' + e.line + ')' : '') }; });
      else res.ok = true;
    } catch (e) {
      if (e instanceof CompileError) res.errors = [{ line: e.line, msg: e.msg }];
      else throw e;
    }
    return res;
  }

  // mapping: assembled word -> C++ line
  function mapping(res) {
    return res.asm.listing.map(function (w) {
      var l = res.asmLines[w.line - 1];
      return { addr: w.addr, word: w.word, asm: w.text, cline: l ? l.cline : 0, part: w.part, of: w.of };
    });
  }

  /* reference interpreter: what the C++ program prints, one integer per output item */
  function interpret(ast, input, opts) {
    var vars = {}, out = [], inPos = 0, steps = 0, limit = (opts && opts.maxSteps) || 200000, err = null;
    function val(t) { return t.k === 'num' ? t.value : (vars[t.name] || 0); }
    function ev(e) { var v = val(e.terms[0].term); for (var i = 1; i < e.terms.length; i++) v = e.terms[i].sign === '+' ? v + val(e.terms[i].term) : v - val(e.terms[i].term); return v; }
    function test(c) {
      var a = val(c.left), b = val(c.right);
      switch (c.op) { case '>': return a > b; case '<': return a < b; case '==': return a === b; case '!=': return a !== b; case '>=': return a >= b; case '<=': return a <= b; }
    }
    function run(list) {
      for (var i = 0; i < list.length; i++) {
        if (err) return;
        if (++steps > limit) { err = 'too many steps (infinite loop?)'; return; }
        var s = list[i];
        switch (s.k) {
          case 'decl': vars[s.name] = s.expr ? ev(s.expr) : 0; break;
          case 'assign': vars[s.name] = ev(s.expr); break;
          case 'in': if (inPos >= input.length) { err = 'cin ran out of input'; return; } vars[s.name] = input[inPos++]; break;
          case 'out': out.push(ev(s.expr)); break;
          case 'if': if (test(s.cond)) run(s.then); else if (s.else) run(s.else); break;
          case 'while': while (test(s.cond) && !err) { run(s.body); if (++steps > limit) { err = 'too many steps (infinite loop?)'; } } break;
        }
      }
    }
    run(ast.body);
    return { out: out, error: err, vars: vars };
  }

  // convenience: compile + run on the toy machine
  function runCompiled(res, input, maxInstr) {
    var st = VN.create(res.asm, { input: input || [], maxInstr: maxInstr || 20000 });
    VN.run(st);
    return st;
  }

  function astOutline(ast) {
    var lines = [];
    function ex(e) { return e.terms.map(function (t, i) { return (i ? ' ' + t.sign + ' ' : '') + (t.term.k === 'var' ? t.term.name : t.term.value); }).join(''); }
    function tm(t) { return t.k === 'var' ? t.name : String(t.value); }
    function walk(list, ind) {
      list.forEach(function (s) {
        var pad = new Array(ind + 1).join('  ');
        switch (s.k) {
          case 'decl': lines.push(pad + 'Declare ' + s.name + (s.expr ? ' = ' + ex(s.expr) : '')); break;
          case 'assign': lines.push(pad + 'Assign ' + s.name + ' ← ' + ex(s.expr)); break;
          case 'in': lines.push(pad + 'Input → ' + s.name); break;
          case 'out': lines.push(pad + 'Output ' + ex(s.expr)); break;
          case 'endl': lines.push(pad + 'Newline (ignored by the toy machine)'); break;
          case 'if': lines.push(pad + 'If ' + tm(s.cond.left) + ' ' + s.cond.op + ' ' + tm(s.cond.right)); lines.push(pad + '  then:'); walk(s.then, ind + 2); if (s.else) { lines.push(pad + '  else:'); walk(s.else, ind + 2); } break;
          case 'while': lines.push(pad + 'While ' + tm(s.cond.left) + ' ' + s.cond.op + ' ' + tm(s.cond.right)); lines.push(pad + '  do:'); walk(s.body, ind + 2); break;
        }
      });
    }
    walk(ast.body, 0);
    return lines.join('\n');
  }


  /* ───── 5. pure event trace ─────
     trace(source, opts) -> { ok, failedAt, error, events, res }
     events are the ordered artefacts that move through the toolchain; the animated views (assets/compiler-flow.js) are driven from them.
       {stage:'source',  kind:'source',  lines, text}
       {stage:'lexer',   kind:'token',   index, type, v, line}      then  'done' {count}   or  'error' {line,msg}
       {stage:'parser',  kind:'node',    node, label, depth, line}  then  'done' {count}   or  'error' {line,msg}
       {stage:'codegen', kind:'asm',     index, text, cline, comment, lineKind}  then 'done' {count}
       {stage:'assembler', kind:'word',  addr, word, cell:'code'|'data', text, cline, bits, hex}  then 'done' {words} or 'error' {msg}
       {stage:'loader',  kind:'load',    cells, size}
       {stage:'cpu',     kind:'instr',   n, at, op, arg, text, pc, r, gt, eq, lt, reads, writes, input, out, micros}  ...  'done' {reason, instrCount, out, finalMem, pc, r, truncated}
     failedAt: null | 'lexer' | 'parser' | 'assembler'.  The cpu stage runs only when opts.input (array) is given; opts.record (default 400) caps recorded instructions. */
  function trace(source, opts) {
    opts = opts || {};
    var events = [], failedAt = null, error = null;
    function push(stage, kind, o) { var e = { stage: stage, kind: kind }; for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) e[k] = o[k]; events.push(e); return e; }
    function fail(stage, line, msg) { failedAt = stage; error = { stage: stage, line: line || 0, msg: msg }; push(stage, 'error', { line: line || 0, msg: msg }); }
    function out() { return { ok: failedAt === null, failedAt: failedAt, error: error, events: events, res: compile(source) }; }
    source = String(source);
    push('source', 'source', { lines: source.split('\n').length, text: source });

    var toks = [], ast = null;
    try { tokenize(source, toks); } catch (e) { if (!(e instanceof CompileError)) throw e; error = e; }
    toks.forEach(function (t, i) { push('lexer', 'token', { index: i, type: t.t, v: t.v, line: t.line }); });
    if (error) { var le = error; error = null; fail('lexer', le.line, le.msg); return out(); }
    push('lexer', 'done', { count: toks.length });

    var nodes = 0, pe = null;
    try { ast = parse(toks, function (n) { nodes++; push('parser', 'node', n); }); } catch (e) { if (!(e instanceof CompileError)) throw e; pe = e; }
    if (pe) { fail('parser', pe.line, pe.msg); return out(); }
    push('parser', 'done', { count: nodes });

    var lines = generate(ast);
    lines.forEach(function (l, i) { push('codegen', 'asm', { index: i, text: l.text, cline: l.cline, comment: l.comment, lineKind: l.kind }); });
    push('codegen', 'done', { count: lines.length });

    var asm = VN.assemble(asmText(lines));
    if (!asm.ok) { fail('assembler', 0, 'assembler: ' + asm.errors[0].msg); return out(); }
    var byAddr = {}, nWords = 0;
    asm.listing.forEach(function (w) { var l = lines[w.line - 1]; byAddr[w.addr] = { text: w.text, cline: l ? l.cline : 0 }; });
    for (var a = 0; a < asm.size; a++) {
      var c = asm.cells[a];
      if (c.kind === 'free') continue;
      var info = c.kind === 'code' ? byAddr[a] : { text: (asm.names[a] || '') + ' = ' + asm.mem[a], cline: lines[c.line - 1] ? lines[c.line - 1].cline : 0 };
      push('assembler', 'word', { addr: a, word: asm.mem[a], cell: c.kind, text: info ? info.text : '', cline: info ? info.cline : 0,
                                  bits: VN.bits(asm.mem[a], asm.addrBits), hex: VN.hex(asm.mem[a], asm.addrBits) });
      nWords++;
    }
    push('assembler', 'done', { words: nWords });
    push('loader', 'load', { cells: nWords, size: asm.size });

    if (opts.input) {
      var st = VN.create(asm, { input: opts.input, maxInstr: opts.maxInstr || 20000 }), cap = opts.record || 400, n = 0, guard = 0;
      while (!st.halted && !st.error && !st.waiting && guard++ < st.maxInstr + 5) {
        var micros = [], reads = [], writes = [], outLen = st.out.length, inPos = st.inPos, m;
        do {
          m = VN.stepMicro(st);
          if (!m) break;
          micros.push({ phase: m.phase, label: m.label, flow: (m.flow || []).map(function (p) { return p.slice(); }), text: m.text });
          if (st.lastRead !== null) reads.push(st.lastRead);
          if (st.lastWrite !== null) writes.push({ addr: st.lastWrite, value: st.mem[st.lastWrite] });
        } while (st.queue.length && !st.error);
        if (!micros.length) break;
        n++;
        if (n <= cap && st.cur) {
          push('cpu', 'instr', { n: n, at: st.cur.at, op: st.cur.op.name, arg: st.cur.op.arg ? st.cur.addr : null,
            text: st.cur.op.arg ? st.cur.op.name + ' ' + st.cur.addr : st.cur.op.name,
            pc: st.pc, r: st.r, gt: st.gt, eq: st.eq, lt: st.lt, reads: reads, writes: writes,
            input: st.inPos > inPos ? st.input[st.inPos - 1] : null, out: st.out.length > outLen ? st.out[st.out.length - 1] : null, micros: micros });
        }
      }
      push('cpu', 'done', { reason: st.error ? 'error' : st.waiting ? 'waiting' : st.halted ? 'halt' : 'limit', error: st.error, instrCount: st.instrCount,
        out: st.out.slice(), finalMem: st.mem.slice(), pc: st.pc, r: st.r, gt: st.gt, eq: st.eq, lt: st.lt, truncated: n > cap });
    }
    return out();
  }

  var PRESETS = [
    { key: 'sum', name: 'Sum of 1..N (while loop)', input: '5',
      src: 'int n, sum = 0, i = 1;\ncin >> n;\nwhile (i <= n) {\n    sum = sum + i;\n    i = i + 1;\n}\ncout << sum << endl;\n' },
    { key: 'max', name: 'Larger of two numbers (if / else)', input: '8 3',
      src: 'int a, b;\ncin >> a >> b;\nif (a > b) {\n    cout << a << endl;\n} else {\n    cout << b << endl;\n}\n' },
    { key: 'add', name: 'A = B + C (straight line)', input: '',
      src: 'int a, b = 5, c = 7;\na = b + c;\ncout << a << endl;\n' },
    { key: 'countdown', name: 'Countdown from N', input: '4',
      src: 'int n;\ncin >> n;\nwhile (n > 0) {\n    cout << n << endl;\n    n = n - 1;\n}\n' },
    { key: 'gcd', name: 'Greatest common divisor (Euclid, by subtraction)', input: '48 18',
      src: 'int a, b;\ncin >> a >> b;\nwhile (a != b) {\n    if (a > b) {\n        a = a - b;\n    } else {\n        b = b - a;\n    }\n}\ncout << a << endl;\n' }
  ];

  var TC = { tokenize: tokenize, parse: parse, generate: generate, compile: compile, mapping: mapping, interpret: interpret,
             runCompiled: runCompiled, astOutline: astOutline, trace: trace, PRESETS: PRESETS };
  if (typeof module !== 'undefined' && module.exports) module.exports = TC;
  else global.TinyCompiler = TC;
})(typeof window !== 'undefined' ? window : this);
