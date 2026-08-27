/* MiniCPP — a small C++ interpreter for the CO1005 course playground.
   Covers the course subset: int/long/float/double/bool/char/string, const,
   if/else, switch, while/for/do-while, functions with pass-by-value and
   pass-by-reference (&), 1-D arrays, cin/cout/endl, getline, and a few
   <cmath>/<algorithm> builtins. No pointers, classes, or STL containers. */
(function (global) {
  'use strict';

  // ───────────────────────── Lexer ─────────────────────────
  var PUNCT2 = ['<<', '>>', '<=', '>=', '==', '!=', '&&', '||', '++', '--',
    '+=', '-=', '*=', '/=', '%=', '::', '->'];
  var PUNCT1 = '+-*/%<>=!&|(){}[],;:?.~^';

  function CompileError(line, msg) { this.line = line; this.msg = msg; this.kind = 'compile'; }
  function RuntimeError(line, msg) { this.line = line; this.msg = msg; this.kind = 'runtime'; }

  function lex(src) {
    var toks = [], i = 0, line = 1, n = src.length;
    function isDigit(c) { return c >= '0' && c <= '9'; }
    function isIdStart(c) { return /[A-Za-z_]/.test(c); }
    function isId(c) { return /[A-Za-z0-9_]/.test(c); }
    while (i < n) {
      var c = src[i];
      if (c === '\n') { line++; i++; continue; }
      if (c === ' ' || c === '\t' || c === '\r' || c === '' || c === '\f') { i++; continue; }
      if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
      if (c === '/' && src[i + 1] === '*') {
        i += 2;
        while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') line++; i++; }
        if (i >= n) throw new CompileError(line, 'unterminated /* comment');
        i += 2; continue;
      }
      if (c === '#') {
        var j = i, dir = '';
        while (j < n && src[j] !== '\n') { dir += src[j]; j++; }
        if (!/^#\s*include\s*[<"][A-Za-z0-9_.\/]+[>"]\s*$/.test(dir))
          throw new CompileError(line, 'unsupported preprocessor directive: ' + dir.trim() + ' (only #include is available in the playground)');
        i = j; continue;
      }
      if (isDigit(c) || (c === '.' && isDigit(src[i + 1]))) {
        var start = i, isFloat = false;
        while (i < n && isDigit(src[i])) i++;
        if (src[i] === '.') { isFloat = true; i++; while (i < n && isDigit(src[i])) i++; }
        if (src[i] === 'e' || src[i] === 'E') {
          var k = i + 1;
          if (src[k] === '+' || src[k] === '-') k++;
          if (isDigit(src[k])) { isFloat = true; i = k; while (i < n && isDigit(src[i])) i++; }
        }
        while (i < n && /[fFlLuU]/.test(src[i])) { if (/[fF]/.test(src[i])) isFloat = true; i++; }
        toks.push({ t: 'num', v: parseFloat(src.slice(start, i)), f: isFloat, line: line });
        continue;
      }
      if (isIdStart(c)) {
        var s2 = i;
        while (i < n && isId(src[i])) i++;
        toks.push({ t: 'id', v: src.slice(s2, i), line: line });
        continue;
      }
      if (c === '"') {
        i++;
        var str = '';
        while (i < n && src[i] !== '"') {
          if (src[i] === '\n') throw new CompileError(line, 'missing closing \" on string literal');
          if (src[i] === '\\') { str += esc(src[i + 1], line); i += 2; }
          else { str += src[i]; i++; }
        }
        if (i >= n) throw new CompileError(line, 'missing closing \" on string literal');
        i++;
        toks.push({ t: 'str', v: str, line: line });
        continue;
      }
      if (c === "'") {
        i++;
        var ch;
        if (src[i] === '\\') { ch = esc(src[i + 1], line); i += 2; }
        else { ch = src[i]; i++; }
        if (src[i] !== "'") throw new CompileError(line, "missing closing ' on character literal");
        i++;
        toks.push({ t: 'chr', v: ch.charCodeAt(0) || 0, line: line });
        continue;
      }
      var two = src.substr(i, 2);
      if (PUNCT2.indexOf(two) >= 0) { toks.push({ t: 'p', v: two, line: line }); i += 2; continue; }
      if (PUNCT1.indexOf(c) >= 0) { toks.push({ t: 'p', v: c, line: line }); i++; continue; }
      throw new CompileError(line, "unexpected character '" + c + "'");
    }
    toks.push({ t: 'eof', v: '<eof>', line: line });
    return toks;
  }

  function esc(c, line) {
    switch (c) {
      case 'n': return '\n'; case 't': return '\t'; case 'r': return '\r';
      case '0': return '\0'; case '\\': return '\\'; case '"': return '"';
      case "'": return "'"; case 'a': return '\x07'; case 'b': return '\b';
      default: throw new CompileError(line, "unknown escape sequence '\\" + c + "'");
    }
  }

  // ───────────────────────── Parser ─────────────────────────
  var TYPE_WORDS = ['int', 'long', 'short', 'float', 'double', 'bool', 'char', 'void', 'string', 'unsigned', 'signed'];

  function Parser(toks) { this.toks = toks; this.pos = 0; }
  Parser.prototype = {
    peek: function (o) { return this.toks[this.pos + (o || 0)]; },
    next: function () { return this.toks[this.pos++]; },
    at: function (v) { var t = this.peek(); return (t.t === 'p' || t.t === 'id') && t.v === v; },
    eat: function (v) { if (this.at(v)) { this.pos++; return true; } return false; },
    expect: function (v, what) {
      var t = this.peek();
      if ((t.t === 'p' || t.t === 'id') && t.v === v) { this.pos++; return t; }
      throw new CompileError(t.line, "expected '" + v + "'" + (what ? ' ' + what : '') + " but found '" + t.v + "'");
    },
    err: function (msg, tok) { throw new CompileError((tok || this.peek()).line, msg); },

    isTypeStart: function () {
      var t = this.peek();
      if (t.t !== 'id') return false;
      if (t.v === 'const' || t.v === 'static' || t.v === 'auto' || t.v === 'register' || t.v === 'extern') return true;
      if (t.v === 'std') return this.peek(1) && this.peek(1).v === '::';
      return TYPE_WORDS.indexOf(t.v) >= 0;
    },

    parseType: function () {
      var isConst = false, isStatic = false, words = [], line = this.peek().line;
      for (;;) {
        var t = this.peek();
        if (t.t !== 'id') break;
        if (t.v === 'const') { isConst = true; this.pos++; continue; }
        if (t.v === 'static') { isStatic = true; this.pos++; continue; }
        if (t.v === 'auto' || t.v === 'register' || t.v === 'extern') { this.pos++; continue; } // storage classes: accepted, no effect here
        if (t.v === 'std' && this.peek(1).v === '::') { this.pos += 2; continue; }
        if (TYPE_WORDS.indexOf(t.v) >= 0) { words.push(t.v); this.pos++; continue; }
        break;
      }
      if (!words.length) this.err('expected a type name');
      var base;
      if (words.indexOf('double') >= 0 || words.indexOf('float') >= 0) base = 'double';
      else if (words.indexOf('string') >= 0) base = 'string';
      else if (words.indexOf('bool') >= 0) base = 'bool';
      else if (words.indexOf('char') >= 0) base = 'char';
      else if (words.indexOf('void') >= 0) base = 'void';
      else base = 'int';
      return { base: base, isConst: isConst, isStatic: isStatic, line: line };
    },

    parseProgram: function () {
      var funcs = [], globals = [];
      while (this.peek().t !== 'eof') {
        if (this.at('using')) {
          this.next(); this.expect('namespace'); this.expect('std'); this.expect(';', 'after using namespace std');
          continue;
        }
        if (!this.isTypeStart()) this.err("expected a declaration (a function or variable) but found '" + this.peek().v + "'");
        var ty = this.parseType();
        var nameTok = this.peek();
        if (nameTok.t !== 'id') this.err('expected a name after type');
        this.pos++;
        if (this.at('(')) {
          funcs.push(this.parseFunctionRest(ty, nameTok));
        } else {
          this.pos--; // put name back
          globals.push(this.parseVarDeclRest(ty));
        }
      }
      return { funcs: funcs, globals: globals };
    },

    parseFunctionRest: function (retTy, nameTok) {
      this.expect('(');
      var params = [];
      if (!this.at(')')) {
        if (this.at('void') && this.peek(1).v === ')') this.pos++;
        else for (;;) {
          var pty = this.parseType();
          if (pty.base === 'void') this.err('a parameter cannot have type void', this.peek());
          var ref = this.eat('&');
          var pn = null, isArr = false;
          if (this.peek().t === 'id') pn = this.next().v;
          if (this.eat('[')) { // array parameter: int b[] (a size inside is allowed and ignored, as in C++)
            if (!this.at(']')) this.parseAssign();
            this.expect(']');
            isArr = true;
            if (this.at('[')) this.err('only 1-D arrays can be passed to functions in the playground');
          }
          if (this.at('=')) this.err('default arguments are not supported in the playground');
          params.push({ type: pty.base, ref: ref, arr: isArr, name: pn, line: pty.line });
          if (!this.eat(',')) break;
        }
      }
      this.expect(')');
      if (this.eat(';')) return { name: nameTok.v, ret: retTy.base, params: params, body: null, line: nameTok.line };
      var body = this.parseBlock();
      return { name: nameTok.v, ret: retTy.base, params: params, body: body, line: nameTok.line };
    },

    parseBlock: function () {
      var open = this.expect('{');
      var stmts = [];
      while (!this.at('}')) {
        if (this.peek().t === 'eof') this.err("missing '}' for block opened on line " + open.line, this.peek());
        stmts.push(this.parseStmt());
      }
      this.expect('}');
      return { k: 'block', body: stmts, line: open.line };
    },

    parseVarDeclRest: function (ty) {
      // cursor sits at first declarator
      var decls = [], line = ty.line;
      for (;;) {
        var ref = this.eat('&');
        var t = this.peek();
        if (t.t !== 'id') this.err('expected a variable name');
        this.pos++;
        var d = { name: t.v, ref: ref, size: null, size2: null, init: null, line: t.line };
        if (this.eat('[')) {
          d.size = this.parseAssign();
          this.expect(']');
          if (this.eat('[')) { // two-dimensional array
            d.size2 = this.parseAssign();
            this.expect(']');
            if (this.at('[')) this.err('the playground supports at most 2-D arrays');
          }
        }
        if (this.eat('=')) {
          if (this.at('{')) d.init = this.parseInitList();
          else d.init = this.parseAssign();
        } else if (this.at('{')) {
          d.init = this.parseInitList();
        } else if (d.size === null && this.at('(')) {
          // constructor-style init: string s(str, n, p) / int x(5)
          this.next();
          var cargs = [];
          if (!this.at(')')) for (;;) { cargs.push(this.parseAssign()); if (!this.eat(',')) break; }
          this.expect(')');
          d.init = { k: 'ctorargs', args: cargs, line: t.line };
        }
        decls.push(d);
        if (!this.eat(',')) break;
      }
      this.expect(';', 'at the end of the declaration');
      return { k: 'vardecl', type: ty.base, isConst: ty.isConst, isStatic: ty.isStatic, decls: decls, line: line };
    },

    parseInitList: function () {
      var open = this.expect('{');
      var items = [];
      if (!this.at('}')) {
        for (;;) {
          items.push(this.at('{') ? this.parseInitList() : this.parseAssign());
          if (!this.eat(',')) break;
        }
      }
      this.expect('}');
      return { k: 'initlist', items: items, line: open.line };
    },

    parseStmt: function () {
      var t = this.peek();
      if (this.at('{')) return this.parseBlock();
      if (this.isTypeStart()) { var ty = this.parseType(); return this.parseVarDeclRest(ty); }
      if (this.eat(';')) return { k: 'empty', line: t.line };
      if (this.at('if')) {
        this.next(); this.expect('(');
        var cond = this.parseExpr(); this.expect(')');
        var then = this.parseStmt();
        var els = null;
        if (this.eat('else')) els = this.parseStmt();
        return { k: 'if', cond: cond, then: then, els: els, line: t.line };
      }
      if (this.at('while')) {
        this.next(); this.expect('(');
        var wc = this.parseExpr(); this.expect(')');
        return { k: 'while', cond: wc, body: this.parseStmt(), line: t.line };
      }
      if (this.at('do')) {
        this.next();
        var db = this.parseStmt();
        this.expect('while'); this.expect('(');
        var dc = this.parseExpr(); this.expect(')'); this.expect(';');
        return { k: 'dowhile', cond: dc, body: db, line: t.line };
      }
      if (this.at('for')) {
        this.next(); this.expect('(');
        var init = null, fcond = null, post = null;
        if (!this.at(';')) {
          if (this.isTypeStart()) { var fty = this.parseType(); init = this.parseVarDeclRest(fty); }
          else { init = { k: 'expr', e: this.parseExpr(), line: this.peek().line }; this.expect(';'); }
        } else this.next();
        if (!this.at(';')) fcond = this.parseExpr();
        this.expect(';');
        if (!this.at(')')) post = this.parseExpr();
        this.expect(')');
        return { k: 'for', init: init, cond: fcond, post: post, body: this.parseStmt(), line: t.line };
      }
      if (this.at('switch')) {
        this.next(); this.expect('(');
        var sv = this.parseExpr(); this.expect(')'); this.expect('{');
        var clauses = [];
        while (!this.at('}')) {
          if (this.eat('case')) {
            var ce = this.parseTernary(); this.expect(':');
            clauses.push({ test: ce, body: [], line: t.line });
          } else if (this.eat('default')) {
            this.expect(':');
            clauses.push({ test: null, body: [], line: t.line });
          } else {
            if (!clauses.length) this.err("expected 'case' or 'default' inside switch");
            clauses[clauses.length - 1].body.push(this.parseStmt());
          }
        }
        this.expect('}');
        return { k: 'switch', value: sv, clauses: clauses, line: t.line };
      }
      if (this.at('return')) {
        this.next();
        var rv = this.at(';') ? null : this.parseExpr();
        this.expect(';', 'after return');
        return { k: 'return', value: rv, line: t.line };
      }
      if (this.at('break')) { this.next(); this.expect(';'); return { k: 'break', line: t.line }; }
      if (this.at('continue')) { this.next(); this.expect(';'); return { k: 'continue', line: t.line }; }
      var e = this.parseExpr();
      this.expect(';', 'at the end of the statement');
      return { k: 'expr', e: e, line: t.line };
    },

    parseExpr: function () {
      var e = this.parseAssign();
      while (this.eat(',')) e = { k: 'comma', a: e, b: this.parseAssign(), line: e.line };
      return e;
    },

    parseAssign: function () {
      var lhs = this.parseTernary();
      var t = this.peek();
      if (t.t === 'p' && ['=', '+=', '-=', '*=', '/=', '%='].indexOf(t.v) >= 0) {
        this.next();
        var rhs = this.parseAssign();
        return { k: 'assign', op: t.v, target: lhs, value: rhs, line: t.line };
      }
      return lhs;
    },

    parseTernary: function () {
      var c = this.parseBin(0);
      if (this.eat('?')) {
        var a = this.parseExpr();
        this.expect(':');
        var b = this.parseAssign();
        return { k: 'cond', c: c, a: a, b: b, line: c.line };
      }
      return c;
    },

    // binary levels, low → high
    BIN_LEVELS: [['||'], ['&&'], ['==', '!='], ['<', '>', '<=', '>='], ['<<', '>>'], ['+', '-'], ['*', '/', '%']],

    parseBin: function (lvl) {
      if (lvl >= this.BIN_LEVELS.length) return this.parseUnary();
      var ops = this.BIN_LEVELS[lvl];
      var e = this.parseBin(lvl + 1);
      for (;;) {
        var t = this.peek();
        if (t.t === 'p' && ops.indexOf(t.v) >= 0) {
          this.next();
          var r = this.parseBin(lvl + 1);
          e = { k: 'bin', op: t.v, a: e, b: r, line: t.line };
        } else return e;
      }
    },

    parseUnary: function () {
      var t = this.peek();
      if (t.t === 'p' && (t.v === '-' || t.v === '+' || t.v === '!')) {
        this.next();
        return { k: 'un', op: t.v, a: this.parseUnary(), line: t.line };
      }
      if (t.t === 'p' && (t.v === '++' || t.v === '--')) {
        this.next();
        return { k: 'incdec', op: t.v, pre: true, target: this.parseUnary(), line: t.line };
      }
      if (t.t === 'p' && t.v === '&')
        this.err('address-of (&) is not supported in the playground — pointers are outside the course subset', t);
      if (t.t === 'p' && t.v === '*')
        this.err('pointer dereference (*) is not supported in the playground', t);
      return this.parsePostfix();
    },

    parsePostfix: function () {
      var e = this.parsePrimary();
      for (;;) {
        var t = this.peek();
        if (this.at('(')) {
          this.next();
          var args = [];
          if (!this.at(')')) for (;;) { args.push(this.parseAssign()); if (!this.eat(',')) break; }
          this.expect(')');
          e = { k: 'call', fn: e, args: args, line: t.line };
        } else if (this.at('[')) {
          this.next();
          var idx = this.parseExpr();
          this.expect(']');
          e = { k: 'index', a: e, i: idx, line: t.line };
        } else if (this.at('.')) {
          this.next();
          var m = this.peek();
          if (m.t !== 'id') this.err("expected a member name after '.'");
          this.pos++;
          e = { k: 'member', a: e, name: m.v, line: t.line };
        } else if (t.t === 'p' && (t.v === '++' || t.v === '--')) {
          this.next();
          e = { k: 'incdec', op: t.v, pre: false, target: e, line: t.line };
        } else return e;
      }
    },

    parsePrimary: function () {
      var t = this.peek();
      if (t.t === 'num') { this.next(); return { k: 'num', v: t.v, f: t.f, line: t.line }; }
      if (t.t === 'str') {
        this.next();
        var v = t.v;
        while (this.peek().t === 'str') { v += this.next().v; } // adjacent literal concat
        return { k: 'str', v: v, line: t.line };
      }
      if (t.t === 'chr') { this.next(); return { k: 'chr', v: t.v, line: t.line }; }
      if (t.t === 'id') {
        if (t.v === 'true' || t.v === 'false') { this.next(); return { k: 'bool', v: t.v === 'true', line: t.line }; }
        this.next();
        if (t.v === 'std' && this.at('::')) { this.next(); var q = this.next(); return { k: 'id', name: q.v, line: t.line }; }
        return { k: 'id', name: t.v, line: t.line };
      }
      if (this.at('(')) {
        this.next();
        // C-style cast: (int) x, (double) y ...
        if (this.isTypeStart()) {
          var save = this.pos;
          var cty = this.parseType();
          if (this.eat(')')) return { k: 'cast', type: cty.base, a: this.parseUnary(), line: t.line };
          this.pos = save;
        }
        var e = this.parseExpr();
        this.expect(')');
        return e;
      }
      this.err("expected an expression but found '" + t.v + "'", t);
    }
  };

  // ───────────────────────── Runtime ─────────────────────────
  var OSTREAM = { stream: 'out' };
  var ISTREAM = { stream: 'in' };
  var MANIP_ENDL = { nl: true };
  // stream manipulators usable without a call: cout << fixed << ...
  var STREAM_MANIPS = {
    endl: MANIP_ENDL,
    fixed: { fixed: true },
    defaultfloat: { fixed: false },
    scientific: { scientific: true },
    showpoint: { showpoint: true },
    noshowpoint: { showpoint: false }
  };

  function Env(parent) { this.vars = Object.create(null); this.parent = parent; }
  Env.prototype.lookup = function (name) {
    var e = this;
    while (e) { if (name in e.vars) return e.vars[name]; e = e.parent; }
    return null;
  };
  Env.prototype.define = function (name, cell, line) {
    if (name in this.vars) throw new RuntimeError(line, "redeclaration of '" + name + "'");
    this.vars[name] = cell;
  };

  function fmtDouble(x) {
    if (Number.isNaN(x)) return 'nan';
    if (!isFinite(x)) return x > 0 ? 'inf' : '-inf';
    if (x === 0) return (1 / x === -Infinity) ? '-0' : '0';
    var p = parseFloat(x.toPrecision(6));
    var exp = Math.floor(Math.log10(Math.abs(p)));
    if (exp < -4 || exp >= 6) {
      var s = p.toExponential();
      var parts = s.split('e');
      var mant = parts[0], e = parseInt(parts[1], 10);
      var sign = e < 0 ? '-' : '+';
      var digits = String(Math.abs(e));
      if (digits.length < 2) digits = '0' + digits;
      return mant + 'e' + sign + digits;
    }
    return String(p);
  }

  function Interp(prog, input, write) {
    this.funcs = Object.create(null);
    this.globalEnv = new Env(null);
    this.write = write;
    this.input = input || '';
    this.ipos = 0;
    this.steps = 0;
    this.maxSteps = 5000000;
    this.outCount = 0;
    this.maxOut = 200000;
    // optional execution trace (used by the S7 call-stack visualizer)
    this.trace = null;
    this.frames = [];
    this.staticsReg = [];
    this.outBuf = '';
    this.traceCount = 0;
    // <iomanip> stream state: setw applies to the next item only
    this.fmt = { width: 0, precision: 6, fixed: false, scientific: false, showpoint: false };
    var self = this;
    prog.funcs.forEach(function (f) {
      var prev = self.funcs[f.name];
      if (prev && prev.body && f.body) throw new CompileError(f.line, "redefinition of function '" + f.name + "'");
      if (!prev || f.body) self.funcs[f.name] = f;
    });
    this.prog = prog;
  }

  Interp.prototype = {
    tick: function (line) {
      if (++this.steps > this.maxSteps)
        throw new RuntimeError(line, 'execution limit exceeded — your program may contain an infinite loop');
    },

    emit: function (s, line) {
      this.outCount += s.length;
      if (this.outCount > this.maxOut)
        throw new RuntimeError(line, 'output limit exceeded (200 kB) — your program may contain an infinite printing loop');
      this.write(s);
      if (this.trace) this.outBuf += s;
    },

    // ---- execution trace (S7 call-stack visualizer) ----
    fmtCell: function (c) {
      if (c.isArray) {
        var head = c.arr.slice(0, 6).join(', ');
        return '[' + head + (c.arr.length > 6 ? ', …' : '') + ']';
      }
      if (c.t === 'string') return '"' + c.v + '"';
      if (c.t === 'char') return "'" + String.fromCharCode(c.v) + "'";
      if (c.t === 'double') return fmtDouble(c.v);
      return String(c.v);
    },
    varsOfEnv: function (env) {
      var out = [];
      for (var k in env.vars) {
        var c = env.vars[k];
        if (c.isStatic) continue; // statics are shown in their own panel
        out.push({ name: k, value: this.fmtCell(c) });
      }
      return out;
    },
    snap: function (line, note, env) {
      if (!this.trace) return;
      if (++this.traceCount > 600) {
        this.trace({ truncated: true });
        this.trace = null;
        return;
      }
      var self = this;
      var stack = this.frames.map(function (fr, i) {
        if (i === self.frames.length - 1 && env) {
          // current frame: walk the whole block-env chain for its locals
          var envs = [], e = env;
          while (e && e !== self.globalEnv) { envs.push(e); e = e.parent; }
          envs.reverse();
          var vars = [];
          envs.forEach(function (en) { vars = vars.concat(self.varsOfEnv(en)); });
          return { name: fr.name, vars: vars };
        }
        return { name: fr.name, vars: self.varsOfEnv(fr.env) };
      });
      this.trace({
        line: line,
        note: note || null,
        stack: stack,
        globals: this.varsOfEnv(this.globalEnv),
        statics: this.staticsReg.map(function (s) { return { name: s.label, value: self.fmtCell(s.cell) }; }),
        out: this.outBuf
      });
    },

    run: function () {
      var self = this;
      this.prog.globals.forEach(function (g) { self.execVarDecl(g, self.globalEnv); });
      var main = this.funcs['main'];
      if (!main || !main.body)
        throw new CompileError(1, "no 'int main()' found — every C++ program needs a main function");
      var r = this.callUser(main, [], main.line);
      return (r && r.t !== 'void') ? Math.trunc(r.v) : 0;
    },

    // ---- values: {t, v} ----
    defaultVal: function (type) {
      if (type === 'string') return { t: 'string', v: '' };
      return { t: type, v: 0 };
    },

    convert: function (val, type, line) {
      if (val.t === type) return { t: type, v: val.v };
      if (type === 'string' || val.t === 'string')
        throw new RuntimeError(line, "cannot convert '" + val.t + "' to '" + type + "'");
      if (val.t === 'ostream' || val.t === 'istream' || val.t === 'manip' || val.t === 'void')
        throw new RuntimeError(line, "cannot convert '" + val.t + "' to '" + type + "'");
      var v = val.v;
      if (type === 'int' || type === 'char') v = Math.trunc(v);
      if (type === 'bool') v = v !== 0 ? 1 : 0;
      return { t: type, v: v };
    },

    truthy: function (val, line) {
      if (val.t === 'string')
        throw new RuntimeError(line, "a std::string cannot be used as a condition — compare it instead (e.g. s != \"\")");
      if (val.t === 'ostream' || val.t === 'istream' || val.t === 'void' || val.t === 'manip')
        throw new RuntimeError(line, "this value cannot be used as a condition");
      return val.v !== 0;
    },

    // ---- statements ----
    execBlock: function (block, env) {
      var inner = new Env(env);
      for (var i = 0; i < block.body.length; i++) this.execStmt(block.body[i], inner);
    },

    execStmt: function (st, env) {
      this.tick(st.line);
      switch (st.k) {
        case 'block': this.execBlock(st, env); return;
        case 'vardecl': this.execVarDecl(st, env); this.snap(st.line, null, env); return;
        case 'empty': return;
        case 'expr': this.evalExpr(st.e, env); this.snap(st.line, null, env); return;
        case 'if':
          if (this.truthy(this.evalExpr(st.cond, env), st.cond.line)) this.execStmt(st.then, env);
          else if (st.els) this.execStmt(st.els, env);
          return;
        case 'while':
          while (this.truthy(this.evalExpr(st.cond, env), st.cond.line)) {
            this.tick(st.line);
            try { this.execStmt(st.body, env); }
            catch (e) { if (e && e.__brk) break; if (e && e.__cont) continue; throw e; }
          }
          return;
        case 'dowhile':
          do {
            this.tick(st.line);
            try { this.execStmt(st.body, env); }
            catch (e) { if (e && e.__brk) break; if (e && e.__cont) continue; throw e; }
          } while (this.truthy(this.evalExpr(st.cond, env), st.cond.line));
          return;
        case 'for': {
          var fenv = new Env(env);
          if (st.init) this.execStmt(st.init, fenv);
          for (;;) {
            this.tick(st.line);
            if (st.cond && !this.truthy(this.evalExpr(st.cond, fenv), st.cond.line)) break;
            try { this.execStmt(st.body, fenv); }
            catch (e) {
              if (e && e.__brk) break;
              if (!(e && e.__cont)) throw e;
            }
            if (st.post) this.evalExpr(st.post, fenv);
          }
          return;
        }
        case 'switch': {
          var sv = this.evalExpr(st.value, env);
          if (sv.t === 'string') throw new RuntimeError(st.line, 'switch on a std::string is not allowed in C++ — use if/else instead');
          var senv = new Env(env), started = false;
          try {
            for (var ci = 0; ci < st.clauses.length; ci++) {
              var cl = st.clauses[ci];
              if (!started) {
                if (cl.test === null) { started = true; }
                else {
                  var cv = this.evalExpr(cl.test, senv);
                  if (this.convert(cv, 'int', cl.line).v === this.convert(sv, 'int', st.line).v) started = true;
                }
              }
              if (started) for (var si = 0; si < cl.body.length; si++) this.execStmt(cl.body[si], senv);
            }
          } catch (e) { if (!(e && e.__brk)) throw e; }
          return;
        }
        case 'return': {
          var rv = st.value ? this.evalExpr(st.value, env) : { t: 'void', v: 0 };
          if (this.trace) {
            var who = this.frames.length ? this.frames[this.frames.length - 1].name : '?';
            this.snap(st.line, 'return from ' + who + (rv.t === 'void' ? '' : ' → ' + this.fmtCell(rv)) + ' — its frame is about to pop', env);
          }
          throw { __ret: rv };
        }
        case 'break': throw { __brk: true };
        case 'continue': throw { __cont: true };
        default: throw new RuntimeError(st.line, 'internal: unknown statement ' + st.k);
      }
    },

    execVarDecl: function (st, env) {
      for (var i = 0; i < st.decls.length; i++) {
        var d = st.decls[i];
        if (d.ref) { // reference variable: int &r = x;
          if (!d.init || d.init.k === 'initlist')
            throw new RuntimeError(d.line, "reference '" + d.name + "' must be initialized with a variable");
          var lv = this.evalLValue(d.init, env);
          if (lv.t !== st.type)
            throw new RuntimeError(d.line, "cannot bind '" + st.type + "&' to a variable of type '" + lv.t + "'");
          if (!lv.cell)
            throw new RuntimeError(d.line, "a reference cannot bind to this expression");
          if (lv.isConst && !st.isConst)
            throw new RuntimeError(d.line, "cannot bind a non-const reference to const variable");
          env.define(d.name, lv.cell, d.line);
          continue;
        }
        // static locals: created once, remembered between calls (the AST node keeps the cell)
        if (st.isStatic) {
          st.__statics = st.__statics || {};
          if (st.__statics[d.name]) { env.define(d.name, st.__statics[d.name], d.line); continue; }
        }
        var newCell;
        if (d.size !== null) { // array (1-D or 2-D)
          var sz = this.convert(this.evalExpr(d.size, env), 'int', d.line).v;
          if (sz <= 0 || sz > 1000000) throw new RuntimeError(d.line, 'invalid array size ' + sz);
          var dims = [sz], total = sz;
          if (d.size2 !== null) {
            var sz2 = this.convert(this.evalExpr(d.size2, env), 'int', d.line).v;
            if (sz2 <= 0 || sz * sz2 > 1000000) throw new RuntimeError(d.line, 'invalid array size ' + sz + 'x' + sz2);
            dims = [sz, sz2];
            total = sz * sz2;
          }
          var arr = new Array(total);
          for (var j = 0; j < total; j++) arr[j] = this.defaultVal(st.type).v;
          if (d.init) {
            if (d.init.k !== 'initlist') throw new RuntimeError(d.line, 'an array needs a {...} initializer list');
            if (dims.length === 2 && d.init.items.length && d.init.items[0].k === 'initlist') {
              // nested rows: {{...}, {...}}
              if (d.init.items.length > dims[0]) throw new RuntimeError(d.line, 'too many rows in the initializer');
              for (var r = 0; r < d.init.items.length; r++) {
                var row = d.init.items[r];
                if (row.k !== 'initlist') throw new RuntimeError(d.line, 'mix of {row} and plain values in a 2-D initializer');
                if (row.items.length > dims[1]) throw new RuntimeError(d.line, 'too many values in row ' + (r + 1));
                for (var c = 0; c < row.items.length; c++)
                  arr[r * dims[1] + c] = this.convert(this.evalExpr(row.items[c], env), st.type, d.line).v;
              }
            } else {
              if (d.init.items.length > total) throw new RuntimeError(d.line, 'too many initializers for array of size ' + total);
              for (var m = 0; m < d.init.items.length; m++)
                arr[m] = this.convert(this.evalExpr(d.init.items[m], env), st.type, d.line).v;
            }
          }
          newCell = { t: st.type, isArray: true, arr: arr, dims: dims, isConst: st.isConst };
        } else {
          var val;
          if (d.init) {
            if (d.init.k === 'initlist') {
              if (d.init.items.length !== 1) throw new RuntimeError(d.line, 'a scalar variable takes exactly one initializer');
              val = this.convert(this.evalExpr(d.init.items[0], env), st.type, d.line);
            } else if (d.init.k === 'ctorargs') {
              val = this.ctorInit(st.type, d.init.args, env, d.line);
            } else val = this.convert(this.evalExpr(d.init, env), st.type, d.line);
          } else val = this.defaultVal(st.type);
          newCell = { t: st.type, v: val.v, isConst: st.isConst };
        }
        if (st.isStatic) {
          newCell.isStatic = true;
          st.__statics[d.name] = newCell;
          this.staticsReg.push({
            label: (this.frames.length ? this.frames[this.frames.length - 1].name : 'global') + '.' + d.name,
            cell: newCell
          });
        }
        env.define(d.name, newCell, d.line);
      }
    },

    // constructor-style initialization: string s(str) / s(str, n) / s(str, n, p) / int x(5)
    ctorInit: function (type, args, env, line) {
      if (!args.length) return this.defaultVal(type);
      if (type === 'string') {
        var src = this.evalExpr(args[0], env);
        if (src.t !== 'string')
          throw new RuntimeError(line, 'a string constructor needs a string as its first argument');
        var s = src.v;
        if (args.length >= 2) {
          var n = this.convert(this.evalExpr(args[1], env), 'int', line).v;
          if (n < 0 || n > s.length) throw new RuntimeError(line, 'start position ' + n + ' is out of range');
          s = args.length >= 3
            ? s.substr(n, this.convert(this.evalExpr(args[2], env), 'int', line).v)
            : s.substr(n);
          if (args.length > 3) throw new RuntimeError(line, 'a string constructor takes at most 3 arguments');
        }
        return { t: 'string', v: s };
      }
      if (args.length !== 1) throw new RuntimeError(line, 'this constructor takes exactly one value');
      return this.convert(this.evalExpr(args[0], env), type, line);
    },

    // ---- lvalues: wrappers with {t, get(), set(v)} and, when the value has
    // a stable storage cell that a reference can bind to, a .cell property ----
    evalLValue: function (node, env) {
      var self = this;
      if (node.k === 'id') {
        var cell = env.lookup(node.name);
        if (!cell) throw new RuntimeError(node.line, "'" + node.name + "' was not declared in this scope");
        if (cell.isArray) throw new RuntimeError(node.line, "'" + node.name + "' is an array — did you mean " + node.name + '[i]?');
        return {
          t: cell.t, isConst: cell.isConst, cell: cell,
          get: function () { return { t: cell.t, v: cell.v }; },
          set: function (v) { cell.v = v; }
        };
      }
      if (node.k === 'index') {
        // collect the whole a[i] / a[i][j] chain down to the base name
        var idxNodes = [node.i], base = node.a;
        while (base.k === 'index') { idxNodes.unshift(base.i); base = base.a; }
        if (base.k !== 'id') throw new RuntimeError(node.line, 'this expression cannot be indexed');
        var acell = env.lookup(base.name);
        if (!acell) throw new RuntimeError(node.line, "'" + base.name + "' was not declared in this scope");
        if (acell.isArray) {
          var dims = acell.dims || [acell.arr.length];
          if (idxNodes.length !== dims.length)
            throw new RuntimeError(node.line, "'" + base.name + "' is a " + dims.length + '-D array — it needs ' +
              dims.length + ' ' + (dims.length === 1 ? 'index' : 'indices') + ', not ' + idxNodes.length);
          var off = 0;
          for (var q = 0; q < dims.length; q++) {
            var iv = this.convert(this.evalExpr(idxNodes[q], env), 'int', node.line).v;
            if (iv < 0 || iv >= dims[q])
              throw new RuntimeError(node.line, 'index ' + iv + ' is out of bounds for dimension ' + (q + 1) + ' (size ' + dims[q] + ')');
            off = off * dims[q] + iv;
          }
          var idx = off;
          var proxy = {
            t: acell.t, isConst: acell.isConst,
            get v() { return acell.arr[idx]; },
            set v(x) { acell.arr[idx] = x; }
          };
          return {
            t: acell.t, isConst: acell.isConst, cell: proxy,
            get: function () { return { t: acell.t, v: acell.arr[idx] }; },
            set: function (v) { acell.arr[idx] = v; }
          };
        }
        if (acell.t === 'string') {
          if (idxNodes.length !== 1) throw new RuntimeError(node.line, 'a string takes a single index');
          var six = this.convert(this.evalExpr(idxNodes[0], env), 'int', node.line).v;
          if (six < 0 || six >= acell.v.length)
            throw new RuntimeError(node.line, 'string index ' + six + ' is out of bounds (length ' + acell.v.length + ')');
          return {
            t: 'char', isConst: acell.isConst,
            get: function () { return { t: 'char', v: acell.v.charCodeAt(six) }; },
            set: function (v) { acell.v = acell.v.slice(0, six) + String.fromCharCode(v) + acell.v.slice(six + 1); }
          };
        }
        throw new RuntimeError(node.line, "'" + base.name + "' is not an array or string");
      }
      throw new RuntimeError(node.line, 'this expression cannot be assigned to (not a variable)');
    },

    // ---- expressions ----
    evalExpr: function (node, env) {
      this.tick(node.line);
      var self = this;
      switch (node.k) {
        case 'num': return node.f ? { t: 'double', v: node.v } : { t: 'int', v: node.v };
        case 'str': return { t: 'string', v: node.v };
        case 'chr': return { t: 'char', v: node.v };
        case 'bool': return { t: 'bool', v: node.v ? 1 : 0 };
        case 'id': {
          if (node.name === 'cout') { var c1 = env.lookup('cout'); if (!c1) return { t: 'ostream', v: OSTREAM }; }
          if (node.name === 'cin') { var c2 = env.lookup('cin'); if (!c2) return { t: 'istream', v: ISTREAM }; }
          if (STREAM_MANIPS[node.name] && !env.lookup(node.name))
            return { t: 'manip', v: STREAM_MANIPS[node.name] };
          var cell = env.lookup(node.name);
          if (!cell) {
            if (this.funcs[node.name] || BUILTINS[node.name])
              throw new RuntimeError(node.line, "'" + node.name + "' is a function — call it with parentheses: " + node.name + '(...)');
            throw new RuntimeError(node.line, "'" + node.name + "' was not declared in this scope");
          }
          if (cell.isArray) return { t: cell.t, v: null, __array: cell };
          return { t: cell.t, v: cell.v };
        }
        case 'comma': this.evalExpr(node.a, env); return this.evalExpr(node.b, env);
        case 'cast': return this.convert(this.evalExpr(node.a, env), node.type, node.line);
        case 'cond':
          return this.truthy(this.evalExpr(node.c, env), node.line)
            ? this.evalExpr(node.a, env) : this.evalExpr(node.b, env);
        case 'un': {
          var v = this.evalExpr(node.a, env);
          if (node.op === '!') return { t: 'bool', v: this.truthy(v, node.line) ? 0 : 1 };
          if (v.t === 'string') throw new RuntimeError(node.line, "invalid operand of type 'string' to unary " + node.op);
          if (v.t !== 'int' && v.t !== 'double' && v.t !== 'char' && v.t !== 'bool')
            throw new RuntimeError(node.line, 'invalid operand to unary ' + node.op);
          var nv = node.op === '-' ? -v.v : +v.v;
          return { t: v.t === 'double' ? 'double' : 'int', v: nv };
        }
        case 'incdec': {
          var cellL = this.evalLValue(node.target, env);
          if (cellL.isConst) throw new RuntimeError(node.line, 'cannot modify a const variable');
          if (cellL.t === 'string') throw new RuntimeError(node.line, 'cannot ' + (node.op === '++' ? 'increment' : 'decrement') + ' a std::string');
          var old = cellL.get();
          var neu = old.v + (node.op === '++' ? 1 : -1);
          cellL.set(cellL.t === 'int' || cellL.t === 'char' ? Math.trunc(neu) : neu);
          return node.pre ? cellL.get() : old;
        }
        case 'assign': {
          var target = this.evalLValue(node.target, env);
          if (target.isConst) throw new RuntimeError(node.line, 'assignment of a const variable');
          var rhs = this.evalExpr(node.value, env);
          var result;
          if (node.op === '=') result = rhs;
          else {
            var opc = node.op[0]; // + - * / %
            result = this.binOp(opc, target.get(), rhs, node.line);
          }
          var conv = this.convertAssign(result, target.t, node.line);
          target.set(conv.v);
          return target.get();
        }
        case 'bin': {
          if (node.op === '&&') {
            if (!this.truthy(this.evalExpr(node.a, env), node.line)) return { t: 'bool', v: 0 };
            return { t: 'bool', v: this.truthy(this.evalExpr(node.b, env), node.line) ? 1 : 0 };
          }
          if (node.op === '||') {
            if (this.truthy(this.evalExpr(node.a, env), node.line)) return { t: 'bool', v: 1 };
            return { t: 'bool', v: this.truthy(this.evalExpr(node.b, env), node.line) ? 1 : 0 };
          }
          if (node.op === '<<') {
            var lv = this.evalExpr(node.a, env);
            if (lv.t === 'ostream') { this.streamOut(node.b, env); return lv; }
            var rv1 = this.evalExpr(node.b, env);
            return this.binOp('<<', lv, rv1, node.line);
          }
          if (node.op === '>>') {
            var lv2 = this.evalExpr(node.a, env);
            if (lv2.t === 'istream') { this.streamIn(node.b, env); return lv2; }
            var rv2 = this.evalExpr(node.b, env);
            return this.binOp('>>', lv2, rv2, node.line);
          }
          return this.binOp(node.op, this.evalExpr(node.a, env), this.evalExpr(node.b, env), node.line);
        }
        case 'call': return this.evalCall(node, env);
        case 'index': return this.evalLValue(node, env).get();
        case 'member': return this.evalMember(node, env, []);
        default: throw new RuntimeError(node.line, 'internal: unknown expression ' + node.k);
      }
    },

    convertAssign: function (val, type, line) {
      if (type === 'string' && val.t === 'char') return { t: 'string', v: String.fromCharCode(val.v) };
      return this.convert(val, type, line);
    },

    binOp: function (op, a, b, line) {
      if (a.__array || b.__array)
        throw new RuntimeError(line, 'an array cannot be used as a value — index it with [i]');
      // string operations
      if (a.t === 'string' || b.t === 'string') {
        if (op === '+') {
          var as = a.t === 'string' ? a.v : (a.t === 'char' ? String.fromCharCode(a.v) : null);
          var bs = b.t === 'string' ? b.v : (b.t === 'char' ? String.fromCharCode(b.v) : null);
          if (as === null || bs === null)
            throw new RuntimeError(line, "cannot add '" + a.t + "' and '" + b.t + "' — use to_string() to convert numbers");
          return { t: 'string', v: as + bs };
        }
        if (['==', '!=', '<', '>', '<=', '>='].indexOf(op) >= 0) {
          if (a.t !== 'string' || b.t !== 'string')
            throw new RuntimeError(line, "cannot compare '" + a.t + "' with '" + b.t + "'");
          var cmp = a.v < b.v ? -1 : (a.v > b.v ? 1 : 0);
          var res;
          switch (op) {
            case '==': res = cmp === 0; break; case '!=': res = cmp !== 0; break;
            case '<': res = cmp < 0; break; case '>': res = cmp > 0; break;
            case '<=': res = cmp <= 0; break; default: res = cmp >= 0;
          }
          return { t: 'bool', v: res ? 1 : 0 };
        }
        throw new RuntimeError(line, "invalid operands of type 'string' to operator " + op);
      }
      for (var side = 0; side < 2; side++) {
        var s = side ? b : a;
        if (['int', 'double', 'char', 'bool'].indexOf(s.t) < 0)
          throw new RuntimeError(line, "invalid operand of type '" + s.t + "' to operator " + op);
      }
      var isD = a.t === 'double' || b.t === 'double';
      var x = a.v, y = b.v;
      switch (op) {
        case '+': return num(x + y);
        case '-': return num(x - y);
        case '*': return num(x * y);
        case '/':
          if (!isD && y === 0) throw new RuntimeError(line, 'integer division by zero');
          return num(isD ? x / y : Math.trunc(x / y));
        case '%':
          if (isD) throw new RuntimeError(line, "invalid operands of type 'double' to operator % — use fmod(x, y)");
          if (y === 0) throw new RuntimeError(line, 'integer division by zero (modulo)');
          return { t: 'int', v: x % y };
        case '==': return { t: 'bool', v: x === y ? 1 : 0 };
        case '!=': return { t: 'bool', v: x !== y ? 1 : 0 };
        case '<': return { t: 'bool', v: x < y ? 1 : 0 };
        case '>': return { t: 'bool', v: x > y ? 1 : 0 };
        case '<=': return { t: 'bool', v: x <= y ? 1 : 0 };
        case '>=': return { t: 'bool', v: x >= y ? 1 : 0 };
        case '<<':
          if (isD) throw new RuntimeError(line, "invalid operands of type 'double' to operator <<");
          return { t: 'int', v: x << y };
        case '>>':
          if (isD) throw new RuntimeError(line, "invalid operands of type 'double' to operator >>");
          return { t: 'int', v: x >> y };
        default: throw new RuntimeError(line, 'internal: unknown operator ' + op);
      }
      function num(v) { return isD ? { t: 'double', v: v } : { t: 'int', v: Math.trunc(v) }; }
    },

    // ---- streams ----
    fmtDoubleWithState: function (x) {
      var f = this.fmt;
      if (Number.isNaN(x)) return 'nan';
      if (!isFinite(x)) return x > 0 ? 'inf' : '-inf';
      if (f.fixed) return x.toFixed(f.precision);
      if (f.scientific) {
        var s = x.toExponential(f.precision);
        return s.replace(/e([+-])(\d)$/, 'e$10$2');
      }
      if (f.showpoint) {
        if (x === 0) return (0).toFixed(Math.max(f.precision - 1, 0));
        return x.toPrecision(f.precision);
      }
      // default: %g with `precision` significant digits
      if (x === 0) return (1 / x === -Infinity) ? '-0' : '0';
      var p = parseFloat(x.toPrecision(f.precision));
      var exp = Math.floor(Math.log10(Math.abs(p)));
      if (exp < -4 || exp >= f.precision) {
        var es = p.toExponential();
        var parts = es.split('e');
        var e = parseInt(parts[1], 10);
        var sign = e < 0 ? '-' : '+';
        var digits = String(Math.abs(e));
        if (digits.length < 2) digits = '0' + digits;
        return parts[0] + 'e' + sign + digits;
      }
      return String(p);
    },

    streamOut: function (node, env) {
      var v = this.evalExpr(node, env);
      var s;
      switch (v.t) {
        case 'string': s = v.v; break;
        case 'char': s = String.fromCharCode(v.v); break;
        case 'bool': s = v.v ? '1' : '0'; break;
        case 'int': s = String(Math.trunc(v.v)); break;
        case 'double': s = this.fmtDoubleWithState(v.v); break;
        case 'manip': {
          var m = v.v;
          if (m.nl) { this.emit('\n', node.line); return; }
          if ('setw' in m) this.fmt.width = m.setw;
          if ('prec' in m) this.fmt.precision = m.prec;
          if ('fixed' in m) { this.fmt.fixed = m.fixed; this.fmt.scientific = false; }
          if ('scientific' in m) { this.fmt.scientific = m.scientific; this.fmt.fixed = false; }
          if ('showpoint' in m) this.fmt.showpoint = m.showpoint;
          return;
        }
        default:
          if (v.__array) throw new RuntimeError(node.line, 'cannot print a whole array — print its elements in a loop');
          throw new RuntimeError(node.line, "cannot print a value of type '" + v.t + "'");
      }
      if (this.fmt.width > s.length) s = new Array(this.fmt.width - s.length + 1).join(' ') + s;
      this.fmt.width = 0; // setw applies to the next item only
      this.emit(s, node.line);
    },

    inputToken: function (line) {
      var re = /\S+/g;
      re.lastIndex = this.ipos;
      var m = re.exec(this.input);
      if (!m) throw new RuntimeError(line, 'cin: ran out of input — type the values your program reads into the Input (stdin) box, then run again');
      this.ipos = m.index + m[0].length;
      return m[0];
    },

    streamIn: function (node, env) {
      var cell = this.evalLValue(node, env);
      var tok, line = node.line;
      switch (cell.t) {
        case 'int': case 'bool':
          tok = this.inputToken(line);
          if (!/^[+-]?\d+$/.test(tok)) throw new RuntimeError(line, "cin: expected a whole number but got '" + tok + "'");
          cell.set(parseInt(tok, 10));
          break;
        case 'double':
          tok = this.inputToken(line);
          if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(tok)) throw new RuntimeError(line, "cin: expected a number but got '" + tok + "'");
          cell.set(parseFloat(tok));
          break;
        case 'char':
          tok = this.inputToken(line);
          cell.set(tok.charCodeAt(0));
          if (tok.length > 1) this.ipos -= (tok.length - 1);
          break;
        case 'string':
          tok = this.inputToken(line);
          cell.set(tok);
          break;
        default:
          throw new RuntimeError(line, "cin cannot read into a value of type '" + cell.t + "'");
      }
    },

    // ---- calls ----
    evalCall: function (node, env) {
      if (node.fn.k === 'member') return this.evalMember(node.fn, env, node.args);
      if (node.fn.k !== 'id') throw new RuntimeError(node.line, 'this expression is not callable');
      var name = node.fn.name;
      var f = this.funcs[name];
      if (f) {
        if (!f.body) throw new RuntimeError(node.line, "function '" + name + "' is declared but never defined");
        return this.callUser(f, node.args, node.line, env);
      }
      var b = BUILTINS[name];
      if (b) return b(this, node.args, env, node.line);
      var cell = env.lookup(name);
      if (cell) throw new RuntimeError(node.line, "'" + name + "' is a variable, not a function");
      throw new RuntimeError(node.line, "undefined function '" + name + "'" +
        (name === 'printf' || name === 'scanf' ? ' — this playground uses cout / cin instead' : ''));
    },

    callUser: function (f, argNodes, line, env) {
      if (argNodes.length !== f.params.length)
        throw new RuntimeError(line, "function '" + f.name + "' expects " + f.params.length +
          ' argument' + (f.params.length === 1 ? '' : 's') + ' but got ' + argNodes.length);
      var frame = new Env(this.globalEnv);
      for (var i = 0; i < f.params.length; i++) {
        var p = f.params[i];
        if (p.arr) {
          // array parameter: the callee works on the caller's array (like C++ array decay)
          var an = argNodes[i];
          if (an.k !== 'id')
            throw new RuntimeError(line, "parameter '" + p.name + "' is an array — pass an array by its name, without brackets");
          var acl = (env || this.globalEnv).lookup(an.name);
          if (!acl || !acl.isArray)
            throw new RuntimeError(line, "'" + an.name + "' is not an array, but parameter '" + p.name + "' expects one");
          if (acl.dims && acl.dims.length === 2)
            throw new RuntimeError(line, 'only 1-D arrays can be passed to functions in the playground');
          if (acl.t !== p.type)
            throw new RuntimeError(line, "cannot pass a " + acl.t + ' array to ' + p.type + " parameter '" + p.name + "'");
          frame.vars[p.name] = acl;
          continue;
        }
        if (p.ref) {
          var lv;
          try { lv = this.evalLValue(argNodes[i], env); }
          catch (e) {
            if (e instanceof RuntimeError && /cannot be assigned/.test(e.msg))
              throw new RuntimeError(line, "parameter '" + p.name + "' is a reference (" + p.type + "&) — pass a variable, not a value or expression");
            throw e;
          }
          if (lv.t !== p.type)
            throw new RuntimeError(line, "cannot bind parameter '" + p.name + "' (" + p.type + '&) to a variable of type ' + lv.t);
          if (!lv.cell)
            throw new RuntimeError(line, "parameter '" + p.name + "' is a reference (" + p.type + "&) and cannot bind to this expression");
          if (lv.isConst)
            throw new RuntimeError(line, "cannot bind parameter '" + p.name + "' (" + p.type + "&) to a const variable");
          frame.vars[p.name] = lv.cell;
        } else {
          var val = this.convert(this.evalExpr(argNodes[i], env || this.globalEnv), p.type, line);
          frame.vars[p.name] = { t: p.type, v: val.v };
        }
      }
      this.frames.push({ name: f.name, env: frame });
      if (this.trace) this.snap(f.line, 'call ' + f.name + '(…) — a new frame is pushed onto the stack', frame);
      try {
        try {
          // run the body statements directly in the frame env, so the frame
          // owns its top-level locals (also makes shadowing a parameter an
          // error, exactly as real C++ does)
          for (var bi = 0; bi < f.body.body.length; bi++)
            this.execStmt(f.body.body[bi], frame);
        } catch (e) {
          if (e && e.__ret) {
            if (f.ret === 'void') {
              if (e.__ret.t !== 'void') throw new RuntimeError(line, "void function '" + f.name + "' cannot return a value");
              return { t: 'void', v: 0 };
            }
            if (e.__ret.t === 'void') throw new RuntimeError(line, "function '" + f.name + "' must return a value of type " + f.ret);
            return this.convert(e.__ret, f.ret, line);
          }
          throw e;
        }
        if (f.ret === 'void' || f.name === 'main') {
          if (this.trace) this.snap(f.line, f.name + ' reaches its end — its frame is about to pop', frame);
          return { t: f.ret === 'void' ? 'void' : 'int', v: 0 };
        }
        throw new RuntimeError(f.line, "function '" + f.name + "' reached its end without returning a value");
      } finally {
        this.frames.pop();
      }
    },

    evalMember: function (node, env, args) {
      var self = this;
      var recvNode = node.a, name = node.name;
      function strOf(n) {
        var v = self.evalExpr(n, env);
        if (v.t !== 'string') throw new RuntimeError(node.line, "'." + name + "' is only available on std::string in this playground");
        return v.v;
      }
      function argVal(i, type) { return self.convert(self.evalExpr(args[i], env), type, node.line); }
      switch (name) {
        case 'length': case 'size': {
          var s = strOf(recvNode);
          if (args.length) throw new RuntimeError(node.line, '.' + name + '() takes no arguments');
          return { t: 'int', v: s.length };
        }
        case 'substr': {
          var s2 = strOf(recvNode);
          var pos = args.length > 0 ? argVal(0, 'int').v : 0;
          if (pos < 0 || pos > s2.length) throw new RuntimeError(node.line, 'substr position ' + pos + ' is out of range');
          var len = args.length > 1 ? argVal(1, 'int').v : s2.length - pos;
          return { t: 'string', v: s2.substr(pos, len) };
        }
        case 'at': {
          var s3 = strOf(recvNode);
          var ix = argVal(0, 'int').v;
          if (ix < 0 || ix >= s3.length) throw new RuntimeError(node.line, 'string index ' + ix + ' is out of bounds (length ' + s3.length + ')');
          return { t: 'char', v: s3.charCodeAt(ix) };
        }
        case 'empty': return { t: 'bool', v: strOf(recvNode).length === 0 ? 1 : 0 };
        case 'push_back': {
          var cell = this.evalLValue(recvNode, env);
          if (cell.t !== 'string') throw new RuntimeError(node.line, '.push_back() is only available on std::string here');
          var chv = argVal(0, 'char').v;
          cell.set(cell.get().v + String.fromCharCode(chv));
          return { t: 'void', v: 0 };
        }
        default:
          throw new RuntimeError(node.line, "unknown member '." + name + "' — the playground supports .length(), .size(), .substr(), .at(), .empty(), .push_back()");
      }
    }
  };

  // ---- builtin free functions ----
  function numArg(interp, args, env, i, line) {
    var v = interp.evalExpr(args[i], env);
    if (['int', 'double', 'char', 'bool'].indexOf(v.t) < 0)
      throw new RuntimeError(line, 'argument ' + (i + 1) + ' must be a number');
    return v;
  }
  function need(args, n, name, line) {
    if (args.length !== n) throw new RuntimeError(line, name + '() expects ' + n + ' argument' + (n === 1 ? '' : 's'));
  }

  var BUILTINS = {
    setw: function (I, a, e, l) { need(a, 1, 'setw', l); return { t: 'manip', v: { setw: Math.trunc(numArg(I, a, e, 0, l).v) } }; },
    setprecision: function (I, a, e, l) { need(a, 1, 'setprecision', l); return { t: 'manip', v: { prec: Math.trunc(numArg(I, a, e, 0, l).v) } }; },
    log: function (I, a, e, l) { need(a, 1, 'log', l); var v = numArg(I, a, e, 0, l); if (v.v <= 0) throw new RuntimeError(l, 'log of a non-positive number'); return { t: 'double', v: Math.log(v.v) }; },
    log10: function (I, a, e, l) { need(a, 1, 'log10', l); var v = numArg(I, a, e, 0, l); if (v.v <= 0) throw new RuntimeError(l, 'log10 of a non-positive number'); return { t: 'double', v: Math.log10(v.v) }; },
    sin: function (I, a, e, l) { need(a, 1, 'sin', l); return { t: 'double', v: Math.sin(numArg(I, a, e, 0, l).v) }; },
    cos: function (I, a, e, l) { need(a, 1, 'cos', l); return { t: 'double', v: Math.cos(numArg(I, a, e, 0, l).v) }; },
    tan: function (I, a, e, l) { need(a, 1, 'tan', l); return { t: 'double', v: Math.tan(numArg(I, a, e, 0, l).v) }; },
    exp: function (I, a, e, l) { need(a, 1, 'exp', l); return { t: 'double', v: Math.exp(numArg(I, a, e, 0, l).v) }; },
    sqrt: function (I, a, e, l) { need(a, 1, 'sqrt', l); var v = numArg(I, a, e, 0, l); if (v.v < 0) throw new RuntimeError(l, 'sqrt of a negative number'); return { t: 'double', v: Math.sqrt(v.v) }; },
    pow: function (I, a, e, l) { need(a, 2, 'pow', l); return { t: 'double', v: Math.pow(numArg(I, a, e, 0, l).v, numArg(I, a, e, 1, l).v) }; },
    abs: function (I, a, e, l) { need(a, 1, 'abs', l); var v = numArg(I, a, e, 0, l); return { t: v.t === 'double' ? 'double' : 'int', v: Math.abs(v.v) }; },
    fabs: function (I, a, e, l) { need(a, 1, 'fabs', l); return { t: 'double', v: Math.abs(numArg(I, a, e, 0, l).v) }; },
    floor: function (I, a, e, l) { need(a, 1, 'floor', l); return { t: 'double', v: Math.floor(numArg(I, a, e, 0, l).v) }; },
    ceil: function (I, a, e, l) { need(a, 1, 'ceil', l); return { t: 'double', v: Math.ceil(numArg(I, a, e, 0, l).v) }; },
    round: function (I, a, e, l) { need(a, 1, 'round', l); return { t: 'double', v: Math.round(numArg(I, a, e, 0, l).v) }; },
    fmod: function (I, a, e, l) { need(a, 2, 'fmod', l); var y = numArg(I, a, e, 1, l).v; if (y === 0) throw new RuntimeError(l, 'fmod: division by zero'); return { t: 'double', v: numArg(I, a, e, 0, l).v % y }; },
    max: function (I, a, e, l) {
      need(a, 2, 'max', l);
      var x = I.evalExpr(a[0], e), y = I.evalExpr(a[1], e);
      if (x.t === 'string' && y.t === 'string') return { t: 'string', v: x.v > y.v ? x.v : y.v };
      var isD = x.t === 'double' || y.t === 'double';
      return { t: isD ? 'double' : 'int', v: Math.max(x.v, y.v) };
    },
    min: function (I, a, e, l) {
      need(a, 2, 'min', l);
      var x = I.evalExpr(a[0], e), y = I.evalExpr(a[1], e);
      if (x.t === 'string' && y.t === 'string') return { t: 'string', v: x.v < y.v ? x.v : y.v };
      var isD = x.t === 'double' || y.t === 'double';
      return { t: isD ? 'double' : 'int', v: Math.min(x.v, y.v) };
    },
    swap: function (I, a, e, l) {
      need(a, 2, 'swap', l);
      var c1 = I.evalLValue(a[0], e), c2 = I.evalLValue(a[1], e);
      if (c1.t !== c2.t) throw new RuntimeError(l, 'swap: both variables must have the same type');
      var tmp = c1.get(); c1.set(c2.get().v); c2.set(tmp.v);
      return { t: 'void', v: 0 };
    },
    to_string: function (I, a, e, l) {
      need(a, 1, 'to_string', l);
      var v = numArg(I, a, e, 0, l);
      return { t: 'string', v: v.t === 'double' ? fmtDouble(v.v) : String(Math.trunc(v.v)) };
    },
    stoi: function (I, a, e, l) {
      need(a, 1, 'stoi', l);
      var v = I.evalExpr(a[0], e);
      if (v.t !== 'string') throw new RuntimeError(l, 'stoi() expects a string');
      var m = /^\s*[+-]?\d+/.exec(v.v);
      if (!m) throw new RuntimeError(l, "stoi: cannot convert '" + v.v + "' to int");
      return { t: 'int', v: parseInt(m[0], 10) };
    },
    stod: function (I, a, e, l) {
      need(a, 1, 'stod', l);
      var v = I.evalExpr(a[0], e);
      if (v.t !== 'string') throw new RuntimeError(l, 'stod() expects a string');
      var x = parseFloat(v.v);
      if (Number.isNaN(x)) throw new RuntimeError(l, "stod: cannot convert '" + v.v + "' to double");
      return { t: 'double', v: x };
    },
    getline: function (I, a, e, l) {
      need(a, 2, 'getline', l);
      var s = I.evalExpr(a[0], e);
      if (s.t !== 'istream') throw new RuntimeError(l, 'getline() expects cin as its first argument');
      var cell = I.evalLValue(a[1], e);
      if (cell.t !== 'string') throw new RuntimeError(l, 'getline() expects a string variable as its second argument');
      // C++ semantics: read up to the next '\n' (consuming it); the line may
      // be empty — e.g. the leftover newline after `cin >> n`.
      if (I.ipos >= I.input.length)
        throw new RuntimeError(l, 'getline: ran out of input — type a line into the Input (stdin) box, then run again');
      var end = I.input.indexOf('\n', I.ipos);
      if (end < 0) end = I.input.length;
      var lineStr = I.input.slice(I.ipos, end).replace(/\r$/, '');
      I.ipos = end < I.input.length ? end + 1 : I.input.length;
      cell.set(lineStr);
      return { t: 'istream', v: ISTREAM };
    }
  };

  // ───────────────────────── Public API ─────────────────────────
  var MiniCPP = {
    run: function (code, input, opts) {
      var write = (opts && opts.write) || function () {};
      try {
        var toks = lex(code);
        var prog = new Parser(toks).parseProgram();
        var interp = new Interp(prog, input, write);
        if (opts && opts.trace) interp.trace = opts.trace;
        var exit = interp.run();
        return { exit: exit, error: null };
      } catch (e) {
        if (e instanceof CompileError) return { exit: null, error: { stage: 'compile', line: e.line, msg: e.msg } };
        if (e instanceof RuntimeError) return { exit: null, error: { stage: 'runtime', line: e.line, msg: e.msg } };
        if (e && (e.__ret || e.__brk || e.__cont))
          return { exit: null, error: { stage: 'runtime', line: 0, msg: 'break/continue/return used outside of a valid context' } };
        return { exit: null, error: { stage: 'internal', line: 0, msg: String(e && e.message || e) } };
      }
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = MiniCPP;
  else global.MiniCPP = MiniCPP;
})(typeof window !== 'undefined' ? window : this);
