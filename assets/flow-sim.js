/* FlowSim — step-by-step simulator for Flowchart Studio (CO1005 Chapter 1).
   Pure logic, no DOM: parses the text inside the blocks (assignments,
   conditions, input/output lists) and executes the flowchart one step at a
   time, tracking variable values and collecting printed output.

   Block-text grammar (forgiving, matches the slides):
     input:    "Input Name, Hours, Rate"          (Input/Read/Enter/Get …)
     process:  "Pay ← Hours × Rate"               (also <-, =, :=; Calculate/Set/Let prefix ok)
     output:   "Print NUM, SQNUM" / "Display \"hi\", A"
     decision: "NUM > 9 ?" / "count is even" / "A ≠ 0"
   Expressions: numbers, variables, + − × ÷ / * % ^ ² ( ), sqrt(), abs(). */
(function (global) {
  'use strict';

  var MAX_STEPS = 1000;

  // ── expression evaluator ─────────────────────────────
  function normalize(s) {
    return String(s)
      .replace(/[×✕✖]/g, '*').replace(/÷/g, '/')
      .replace(/[−–—]/g, '-').replace(/²/g, '^2')
      .replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/≠/g, '!=');
  }

  function lexExpr(s) {
    var toks = [], i = 0;
    s = normalize(s);
    while (i < s.length) {
      var c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(s[i + 1]))) {
        var j = i;
        while (j < s.length && /[0-9.]/.test(s[j])) j++;
        toks.push({ t: 'num', v: parseFloat(s.slice(i, j)) });
        i = j; continue;
      }
      if (/[A-Za-z_]/.test(c)) {
        var k = i;
        while (k < s.length && /[A-Za-z0-9_]/.test(s[k])) k++;
        toks.push({ t: 'id', v: s.slice(i, k) });
        i = k; continue;
      }
      if (c === '"' || c === '“' || c === '”' || c === "'") {
        var close = c === '“' ? '”' : c;
        var e = s.indexOf(close, i + 1);
        if (e < 0) e = s.length;
        toks.push({ t: 'str', v: s.slice(i + 1, e) });
        i = e + 1; continue;
      }
      var two = s.substr(i, 2);
      if (['>=', '<=', '==', '!='].indexOf(two) >= 0) { toks.push({ t: 'op', v: two }); i += 2; continue; }
      if ('+-*/%^()<>=,'.indexOf(c) >= 0) { toks.push({ t: 'op', v: c }); i++; continue; }
      throw new Error("I don't understand the character '" + c + "'");
    }
    return toks;
  }

  function Parser(toks, env) { this.toks = toks; this.i = 0; this.env = env; }
  Parser.prototype = {
    peek: function () { return this.toks[this.i]; },
    next: function () { return this.toks[this.i++]; },
    atOp: function (v) { var t = this.peek(); return t && t.t === 'op' && t.v === v; },

    comparison: function () {
      var a = this.addsub();
      var t = this.peek();
      // "x is even" / "x is odd"
      if (t && t.t === 'id' && t.v.toLowerCase() === 'is') {
        this.next();
        var w = this.next();
        if (!w || w.t !== 'id') throw new Error("expected 'even' or 'odd' after 'is'");
        var word = w.v.toLowerCase();
        if (word !== 'even' && word !== 'odd') throw new Error("expected 'even' or 'odd' after 'is'");
        this.wantNumber(a, 'is ' + word);
        return (Math.abs(a % 2) === 0) === (word === 'even');
      }
      if (t && t.t === 'op' && ['>', '<', '>=', '<=', '==', '!=', '='].indexOf(t.v) >= 0) {
        this.next();
        var b = this.addsub();
        var op = t.v === '=' ? '==' : t.v;
        if (typeof a === 'string' || typeof b === 'string') {
          if (op === '==') return String(a) === String(b);
          if (op === '!=') return String(a) !== String(b);
          throw new Error('cannot order-compare text values');
        }
        switch (op) {
          case '>': return a > b;
          case '<': return a < b;
          case '>=': return a >= b;
          case '<=': return a <= b;
          case '==': return a === b;
          default: return a !== b;
        }
      }
      return a;
    },

    addsub: function () {
      var v = this.muldiv();
      for (;;) {
        if (this.atOp('+')) { this.next(); var r = this.muldiv(); v = this.plus(v, r); }
        else if (this.atOp('-')) { this.next(); var r2 = this.muldiv(); this.wantNumber(v, '-'); this.wantNumber(r2, '-'); v = v - r2; }
        else return v;
      }
    },
    plus: function (a, b) {
      if (typeof a === 'string' || typeof b === 'string') return String(a) + String(b);
      return a + b;
    },
    muldiv: function () {
      var v = this.power();
      for (;;) {
        var t = this.peek();
        if (t && t.t === 'op' && (t.v === '*' || t.v === '/' || t.v === '%')) {
          this.next();
          var r = this.power();
          this.wantNumber(v, t.v); this.wantNumber(r, t.v);
          if (t.v === '*') v = v * r;
          else if (t.v === '/') {
            if (r === 0) throw new Error('division by zero');
            v = v / r;
          } else {
            if (r === 0) throw new Error('division by zero (mod)');
            v = v % r;
          }
        } else return v;
      }
    },
    power: function () {
      var v = this.unary();
      if (this.atOp('^')) {
        this.next();
        var e = this.power();
        this.wantNumber(v, '^'); this.wantNumber(e, '^');
        return Math.pow(v, e);
      }
      return v;
    },
    unary: function () {
      if (this.atOp('-')) { this.next(); var v = this.unary(); this.wantNumber(v, 'unary -'); return -v; }
      if (this.atOp('+')) { this.next(); return this.unary(); }
      return this.primary();
    },
    primary: function () {
      var t = this.next();
      if (!t) throw new Error('the expression ends unexpectedly');
      if (t.t === 'num') return t.v;
      if (t.t === 'str') return t.v;
      if (t.t === 'id') {
        if (this.atOp('(')) { // function call
          this.next();
          var arg = this.comparison();
          if (!this.atOp(')')) throw new Error("missing ')' after " + t.v + '(…');
          this.next();
          var f = t.v.toLowerCase();
          this.wantNumber(arg, t.v + '()');
          if (f === 'sqrt') {
            if (arg < 0) throw new Error('sqrt of a negative number');
            return Math.sqrt(arg);
          }
          if (f === 'abs') return Math.abs(arg);
          throw new Error("unknown function '" + t.v + "' (sqrt and abs are available)");
        }
        if (!(t.v in this.env))
          throw new Error("the variable '" + t.v + "' has no value yet — did an Input or Process block set it?");
        return this.env[t.v];
      }
      if (t.t === 'op' && t.v === '(') {
        var v = this.comparison();
        if (!this.atOp(')')) throw new Error("missing ')'");
        this.next();
        return v;
      }
      throw new Error("unexpected '" + t.v + "' in the expression");
    },
    wantNumber: function (v, where) {
      if (typeof v !== 'number') throw new Error("'" + v + "' is text — " + where + ' needs numbers');
    },
    done: function () { return this.i >= this.toks.length; }
  };

  function evalExpr(text, env) {
    var p = new Parser(lexExpr(text), env);
    var v = p.comparison();
    if (!p.done()) throw new Error("I could not read the whole expression '" + text + "'");
    return v;
  }

  // ── block-text parsing ─────────────────────────────
  function stripPrefix(text, words) {
    var re = new RegExp('^\\s*(?:' + words.join('|') + ')\\b[:\\s]*', 'i');
    return text.replace(re, '');
  }
  function splitTopCommas(s) {
    var parts = [], depth = 0, cur = '', inStr = false, strCh = '';
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (inStr) { cur += c; if (c === strCh || (strCh === '“' && c === '”')) inStr = false; continue; }
      if (c === '"' || c === "'" || c === '“') { inStr = true; strCh = c; cur += c; continue; }
      if (c === '(') depth++;
      if (c === ')') depth--;
      if (c === ',' && depth === 0) { parts.push(cur); cur = ''; continue; }
      cur += c;
    }
    if (cur.trim()) parts.push(cur);
    return parts.map(function (x) { return x.trim(); }).filter(Boolean);
  }

  // ── the simulator ─────────────────────────────
  function create(steps) {
    return {
      steps: steps,
      pc: 0,
      env: {},
      out: [],
      state: steps.length ? 'ready' : 'error',
      message: steps.length ? 'Press Step to begin.' : 'Add some blocks first.',
      consumed: 0,      // input tokens already used
      count: 0,         // executed steps (infinite-loop guard)
      lastChanged: null // variable set by the most recent step (for highlighting)
    };
  }

  function fmt(v) {
    if (typeof v === 'number') {
      var r = Math.round(v * 1e9) / 1e9;
      return String(r);
    }
    return String(v);
  }

  function step(sim, inputText) {
    if (sim.state === 'done' || sim.state === 'error') return sim;
    sim.state = 'running';
    sim.lastChanged = null;
    var i = sim.pc;
    var s = sim.steps[i];
    if (!s) { sim.state = 'done'; sim.message = 'The flow ran past the last block — add an End block.'; return sim; }
    if (++sim.count > MAX_STEPS) {
      sim.state = 'error';
      sim.message = 'More than ' + MAX_STEPS + ' steps — this flowchart probably loops forever. Check your decision branches.';
      return sim;
    }
    var label = 'Step ' + (i + 1) + ' (' + s.type + ')';
    // non-decision blocks may carry an explicit "then →" target (s.go)
    function nextPC() {
      if (s.go === undefined || s.go === 'next') return i + 1;
      if (typeof s.go === 'number' && sim.steps[s.go]) return s.go;
      throw new Error('the "then →" arrow of this block points nowhere — rewire it in the step editor');
    }
    try {
      switch (s.type) {
        case 'start':
          sim.message = label + ': the algorithm begins.';
          sim.pc = i + 1;
          break;
        case 'end':
          sim.state = 'done';
          sim.message = label + ': finished ✓';
          break;
        case 'input': {
          var names = splitTopCommas(stripPrefix(s.text, ['Input', 'Read', 'Enter', 'Get']))
            .join(' ').split(/[\s,]+/).filter(Boolean);
          if (!names.length) throw new Error('name the variables to read, e.g. “Input A, B”');
          var tokens = String(inputText || '').trim().split(/\s+/).filter(Boolean);
          if (sim.consumed + names.length > tokens.length) {
            sim.state = 'waiting-input';
            sim.message = label + ' needs ' + names.length + ' value' + (names.length > 1 ? 's' : '') +
              ' (' + names.join(', ') + ') — type them into the Input box, then press Step again.';
            sim.count--; // retrying this step is free
            return sim;
          }
          var got = [];
          for (var n = 0; n < names.length; n++) {
            var tok = tokens[sim.consumed++];
            var num = /^[+-]?(\d+\.?\d*|\.\d+)$/.test(tok) ? parseFloat(tok) : tok;
            if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(names[n]))
              throw new Error("'" + names[n] + "' is not a valid variable name");
            sim.env[names[n]] = num;
            got.push(names[n] + ' = ' + fmt(num));
          }
          sim.lastChanged = names[names.length - 1];
          sim.message = label + ': read ' + got.join(', ');
          sim.pc = nextPC();
          break;
        }
        case 'process': {
          var body = stripPrefix(s.text, ['Calculate', 'Compute', 'Set', 'Let']);
          var m = normalize(body).match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?:<-|←|:=|=)\s*(.+)$/);
          if (!m) throw new Error('write it as “variable ← expression”, e.g. “Pay ← Hours × Rate”');
          var val = evalExpr(m[2], sim.env);
          if (typeof val === 'boolean') val = val ? 1 : 0;
          sim.env[m[1]] = val;
          sim.lastChanged = m[1];
          sim.message = label + ': ' + m[1] + ' ← ' + fmt(val);
          sim.pc = nextPC();
          break;
        }
        case 'output': {
          var list = splitTopCommas(stripPrefix(s.text, ['Print', 'Display', 'Output', 'Show', 'Write']));
          if (!list.length) throw new Error('name what to print, e.g. “Print NUM, SQNUM”');
          var pieces = list.map(function (item) {
            var v = evalExpr(item, sim.env);
            if (typeof v === 'boolean') v = v ? 'true' : 'false';
            return fmt(v);
          });
          var line = pieces.join(' ');
          sim.out.push(line);
          sim.message = label + ': printed “' + line + '”';
          sim.pc = nextPC();
          break;
        }
        case 'decision': {
          var cond = normalize(s.text).replace(/\?\s*$/, '');
          var res = evalExpr(cond, sim.env);
          if (typeof res === 'number') res = res !== 0;
          if (typeof res !== 'boolean')
            throw new Error('a decision needs a yes/no question, e.g. “NUM > 9 ?”');
          var branch = res ? (s.yes === undefined ? 'next' : s.yes)
                           : (s.no === undefined ? 'next' : s.no);
          var target = branch === 'next' ? i + 1 : branch;
          if (typeof target !== 'number' || !sim.steps[target] && target !== sim.steps.length)
            throw new Error('the ' + (res ? 'Yes' : 'No') + ' branch points nowhere — rewire it in the step editor');
          sim.message = label + ': ' + cond.trim() + ' → ' + (res ? 'Yes' : 'No') +
            ' → step ' + (target + 1);
          sim.pc = target;
          break;
        }
        default:
          throw new Error('unknown block type');
      }
    } catch (e) {
      sim.state = 'error';
      sim.message = label + ': ' + e.message;
    }
    return sim;
  }

  function runToEnd(sim, inputText) {
    var guard = 0;
    while (sim.state !== 'done' && sim.state !== 'error' && guard++ <= MAX_STEPS) {
      step(sim, inputText);
      if (sim.state === 'waiting-input') break;
    }
    return sim;
  }

  var FlowSim = { create: create, step: step, runToEnd: runToEnd, evalExpr: evalExpr, _fmt: fmt };

  if (typeof module !== 'undefined' && module.exports) module.exports = FlowSim;
  else global.FlowSim = FlowSim;
})(typeof window !== 'undefined' ? window : this);
