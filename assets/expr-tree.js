/* Expression Tree Lab — mini app for CO1005 Supplementary Topic S2.
   Takes a C++ arithmetic/logical expression, parses it with real C++
   precedence into a computation tree, draws the tree as SVG, and evaluates
   it one operator at a time — with C++ semantics: integer division,
   bools as 1/0, and && / || short-circuiting.
   Mount point: #tree-root. Pure engine exported for Node tests. */
(function (global) {
  'use strict';

  // ───────── parser (C++ precedence, numbers only) ─────────
  function lex(src) {
    var toks = [], i = 0;
    while (i < src.length) {
      var c = src[i];
      if (/\s/.test(c)) { i++; continue; }
      if (/[0-9.]/.test(c)) {
        var j = i, dot = false;
        while (j < src.length && /[0-9.]/.test(src[j])) { if (src[j] === '.') dot = true; j++; }
        var txt = src.slice(i, j);
        if (!/^(\d+\.?\d*|\.\d+)$/.test(txt)) throw new Error("'" + txt + "' is not a valid number");
        toks.push({ t: 'num', v: parseFloat(txt), isInt: !dot });
        i = j; continue;
      }
      var two = src.substr(i, 2);
      if (['&&', '||', '==', '!=', '<=', '>='].indexOf(two) >= 0) { toks.push({ t: 'op', v: two }); i += 2; continue; }
      if ('+-*/%()<>!'.indexOf(c) >= 0) { toks.push({ t: 'op', v: c }); i++; continue; }
      if (c === '=') throw new Error("a single '=' assigns — use '==' to compare");
      if (/[A-Za-z_]/.test(c)) throw new Error('variables are not supported here — use numbers, so every node has a value');
      throw new Error("unexpected character '" + c + "'");
    }
    if (!toks.length) throw new Error('type an expression first');
    return toks;
  }

  var nextId;
  function P(toks) { this.toks = toks; this.i = 0; }
  P.prototype = {
    peek: function () { return this.toks[this.i]; },
    atOp: function () {
      var t = this.peek();
      if (!t || t.t !== 'op') return null;
      for (var k = 0; k < arguments.length; k++) if (t.v === arguments[k]) return t.v;
      return null;
    },
    chain: function (sub, ops) {
      var n = sub.call(this);
      for (;;) {
        var op = this.atOp.apply(this, ops);
        if (!op) return n;
        this.i++;
        n = { kind: 'bin', op: op, a: n, b: sub.call(this), id: nextId++ };
      }
    },
    or: function () { return this.chain(this.and, ['||']); },
    and: function () { return this.chain(this.eq, ['&&']); },
    eq: function () { return this.chain(this.rel, ['==', '!=']); },
    rel: function () { return this.chain(this.add, ['<', '>', '<=', '>=']); },
    add: function () { return this.chain(this.mul, ['+', '-']); },
    mul: function () { return this.chain(this.unary, ['*', '/', '%']); },
    unary: function () {
      var op = this.atOp('!', '-', '+');
      if (op) { this.i++; return { kind: 'un', op: op, a: this.unary(), id: nextId++ }; }
      return this.primary();
    },
    primary: function () {
      var t = this.peek();
      if (!t) throw new Error('the expression ends too early — an operand is missing');
      if (t.t === 'num') { this.i++; return { kind: 'num', v: t.v, isInt: t.isInt, id: nextId++ }; }
      if (t.t === 'op' && t.v === '(') {
        this.i++;
        var n = this.or();
        if (!this.atOp(')')) throw new Error("missing ')'");
        this.i++;
        n.paren = true; // remembered only to draw a hint — parentheses are NOT nodes
        return n;
      }
      throw new Error("unexpected '" + t.v + "' — an operand was expected there");
    }
  };

  function parse(src) {
    nextId = 1;
    var p = new P(lex(src));
    var root = p.or();
    if (p.i < p.toks.length) throw new Error("could not use the rest of the expression from '" + p.toks[p.i].v + "'");
    return root;
  }

  // ───────── helpers ─────────
  function opClass(op) {
    if (['&&', '||', '!'].indexOf(op) >= 0) return 'logic';
    if (['==', '!=', '<', '>', '<=', '>='].indexOf(op) >= 0) return 'cmp';
    return 'arith';
  }
  function fmt(v) { return String(Math.round(v * 1e9) / 1e9); }
  function truthy(v) { return v !== 0; }

  function toParenString(n) {
    if (n.kind === 'num') return fmt(n.v);
    if (n.kind === 'un') {
      var inner = toParenString(n.a);
      return n.op + (n.a.kind === 'num' ? inner : '(' + inner + ')');
    }
    return '(' + toParenString(n.a) + ' ' + n.op + ' ' + toParenString(n.b) + ')';
  }

  // ───────── evaluation plan: one step per operator, C++ semantics ─────────
  function collectIds(n, out) {
    out.push(n.id);
    if (n.a) collectIds(n.a, out);
    if (n.b) collectIds(n.b, out);
    return out;
  }

  function buildSteps(root) {
    var steps = [];
    function evalNode(n) {
      if (n.kind === 'num') { n.val = n.v; n.valInt = n.isInt; return; }
      if (n.kind === 'un') {
        evalNode(n.a);
        if (n.op === '!') {
          n.val = truthy(n.a.val) ? 0 : 1; n.valInt = true;
          steps.push({ id: n.id, text: '!' + fmt(n.a.val) + ' → ' + fmt(n.val) + (n.val ? ' (true)' : ' (false)') });
        } else {
          n.val = n.op === '-' ? -n.a.val : +n.a.val; n.valInt = n.a.valInt;
          steps.push({ id: n.id, text: n.op + fmt(n.a.val) + ' → ' + fmt(n.val) });
        }
        return;
      }
      // binary
      if (n.op === '&&' || n.op === '||') {
        evalNode(n.a);
        var decides = n.op === '&&' ? !truthy(n.a.val) : truthy(n.a.val);
        if (decides) {
          n.val = n.op === '&&' ? 0 : 1; n.valInt = true;
          steps.push({
            id: n.id,
            text: n.op + ': the left side is ' + fmt(n.a.val) + (truthy(n.a.val) ? ' (true)' : ' (false)') +
              ', which already decides the result → ' + fmt(n.val) +
              '. The right side is never evaluated (short-circuit).',
            skipped: collectIds(n.b, [])
          });
        } else {
          evalNode(n.b);
          n.val = truthy(n.b.val) ? 1 : 0; n.valInt = true;
          steps.push({ id: n.id, text: fmt(n.a.val) + ' ' + n.op + ' ' + fmt(n.b.val) + ' → ' + fmt(n.val) });
        }
        return;
      }
      evalNode(n.a);
      evalNode(n.b);
      var x = n.a.val, y = n.b.val, bothInt = n.a.valInt && n.b.valInt, note = '';
      switch (n.op) {
        case '+': n.val = x + y; n.valInt = bothInt; break;
        case '-': n.val = x - y; n.valInt = bothInt; break;
        case '*': n.val = x * y; n.valInt = bothInt; break;
        case '/':
          if (y === 0) throw { runtime: true, id: n.id, msg: fmt(x) + ' / 0 — division by zero: the running program would crash here' };
          if (bothInt) { n.val = Math.trunc(x / y); note = x % y !== 0 ? ' · integer division — the fraction is discarded!' : ''; }
          else n.val = x / y;
          n.valInt = bothInt;
          break;
        case '%':
          if (!bothInt) throw { compile: true, id: n.id, msg: "'%' needs two integers — with doubles a C++ compiler rejects this (use fmod)" };
          if (y === 0) throw { runtime: true, id: n.id, msg: fmt(x) + ' % 0 — division by zero: the running program would crash here' };
          n.val = x % y; n.valInt = true;
          break;
        default: // comparisons
          switch (n.op) {
            case '<': n.val = x < y ? 1 : 0; break;
            case '>': n.val = x > y ? 1 : 0; break;
            case '<=': n.val = x <= y ? 1 : 0; break;
            case '>=': n.val = x >= y ? 1 : 0; break;
            case '==': n.val = x === y ? 1 : 0; break;
            case '!=': n.val = x !== y ? 1 : 0; break;
          }
          n.valInt = true;
          note = n.val ? ' (true)' : ' (false)';
      }
      steps.push({ id: n.id, text: fmt(x) + ' ' + n.op + ' ' + fmt(y) + ' → ' + fmt(n.val) + note });
    }
    evalNode(root);
    return { steps: steps, result: root.val, resultInt: root.valInt };
  }

  // ───────── tree layout ─────────
  function layout(root) {
    var leaves = 0, maxDepth = 0;
    (function place(n, depth) {
      n.depth = depth;
      if (depth > maxDepth) maxDepth = depth;
      if (n.kind === 'num') { n.x = leaves++; return; }
      if (n.kind === 'un') { place(n.a, depth + 1); n.x = n.a.x; return; }
      place(n.a, depth + 1);
      place(n.b, depth + 1);
      n.x = (n.a.x + n.b.x) / 2;
    })(root, 0);
    return { leaves: leaves, maxDepth: maxDepth };
  }

  // ───────── SVG rendering ─────────
  var XS = 66, YS = 84, MX = 40, MY = 34, R = 21;
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function renderSVG(root, dims, state) {
    // state: {doneIds:Set, skippedIds:Set, currentId or null}
    var edges = '', nodes = '';
    (function draw(n) {
      var cx = MX + n.x * XS, cy = MY + n.depth * YS;
      if (n.a) {
        var ax = MX + n.a.x * XS, ay = MY + n.a.depth * YS;
        edges += '<line class="fc-line et-edge" x1="' + cx + '" y1="' + (cy + R) + '" x2="' + ax + '" y2="' + (ay - R) + '"/>';
        draw(n.a);
      }
      if (n.b) {
        var bx = MX + n.b.x * XS, by = MY + n.b.depth * YS;
        edges += '<line class="fc-line et-edge" x1="' + cx + '" y1="' + (cy + R) + '" x2="' + bx + '" y2="' + (by - R) + '"/>';
        draw(n.b);
      }
      var cls, label;
      if (n.kind === 'num') { cls = 'et-leaf'; label = fmt(n.v); }
      else { cls = 'et-op et-' + opClass(n.op); label = n.op; }
      var g = '<g class="' + cls +
        (state.skippedIds.has(n.id) ? ' et-skipped' : '') +
        (state.currentId === n.id ? ' et-current' : '') + '">';
      g += '<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '"/>';
      g += '<text class="et-label" x="' + cx + '" y="' + cy + '" text-anchor="middle" dominant-baseline="central">' + esc(label) + '</text>';
      if (n.kind !== 'num' && state.doneIds.has(n.id) && !state.skippedIds.has(n.id))
        g += '<text class="et-val" x="' + (cx + R + 4) + '" y="' + (cy - R + 6) + '">' + esc(fmt(n.val)) + '</text>';
      if (n.paren)
        g += '<text class="et-paren" x="' + cx + '" y="' + (cy + R + 14) + '" text-anchor="middle">( )</text>';
      nodes += g + '</g>';
    })(root);
    var W = MX * 2 + Math.max(dims.leaves - 1, 0) * XS, H = MY * 2 + dims.maxDepth * YS + 16;
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H +
      '" role="img" aria-label="Computation tree of the expression">' + edges + nodes + '</svg>';
  }

  // ───────── UI ─────────
  var PRESETS = [
    { name: '8 + 5 * 7 % 2 * 4   (slide example)', src: '8 + 5 * 7 % 2 * 4' },
    { name: '9 / 2 * 3 - 10 * 4 % 3   (integer division)', src: '9 / 2 * 3 - 10 * 4 % 3' },
    { name: '15 / 2 * 2   (why not 15?)', src: '15 / 2 * 2' },
    { name: '1 + 2 * (3 - 4) / 2   (parentheses reshape)', src: '1 + 2 * (3 - 4) / 2' },
    { name: '100 - 20 - 5 - 1   (left associativity)', src: '100 - 20 - 5 - 1' },
    { name: '(6*3 == 36/2) || (13 < 3*3+4) && !(6-2 < 5)   (short-circuit!)', src: '(6*3 == 36/2) || (13 < 3*3 + 4) && !(6-2 < 5)' }
  ];

  function mount() {
    var host = document.getElementById('tree-root');
    if (!host) return;
    function el(tag, cls, html) {
      var n = document.createElement(tag);
      if (cls) n.className = cls;
      if (html !== undefined) n.innerHTML = html;
      return n;
    }

    var panel = el('div', 'run-panel');
    panel.appendChild(el('h4', '', 'Type an expression — or pick one, then step through it'));

    var row = el('div', 'ex-actions');
    var input = el('input');
    input.type = 'text';
    input.className = 'et-input';
    input.value = PRESETS[0].src;
    input.spellcheck = false;
    input.setAttribute('aria-label', 'C++ expression to parse');
    row.appendChild(input);
    var sel = el('select', 'preset-select');
    sel.setAttribute('aria-label', 'Example expressions');
    var op0 = el('option', '', ''); op0.value = ''; op0.textContent = 'Examples…'; sel.appendChild(op0);
    PRESETS.forEach(function (p, i) {
      var o = el('option'); o.value = String(i); o.textContent = p.name; sel.appendChild(o);
    });
    row.appendChild(sel);
    var parseBtn = el('button', 'btn primary', 'Build the tree');
    row.appendChild(parseBtn);
    panel.appendChild(row);

    var parenLine = el('div', 'et-paren-line');
    panel.appendChild(parenLine);

    var controls = el('div', 'ex-actions');
    var stepBtn = el('button', 'btn primary', '⏭ Step');
    var allBtn = el('button', 'btn ghost', '▶ Run all steps');
    var resetBtn = el('button', 'btn ghost small', '↺ Reset steps');
    controls.appendChild(stepBtn); controls.appendChild(allBtn); controls.appendChild(resetBtn);
    panel.appendChild(controls);

    var status = el('div', 'sim-status');
    status.setAttribute('role', 'status');
    panel.appendChild(status);

    var canvas = el('div', 'studio-canvas et-canvas');
    panel.appendChild(canvas);
    panel.appendChild(el('div', 'et-legend',
      '<span><i class="et-key et-k-arith"></i> arithmetic</span>' +
      '<span><i class="et-key et-k-cmp"></i> comparison</span>' +
      '<span><i class="et-key et-k-logic"></i> logical</span>' +
      '<span><i class="et-key et-k-leaf"></i> operand (leaf)</span>' +
      '<span class="mono">( )</span> = was parenthesized in the source'));
    host.appendChild(panel);

    var tree = null, dims = null, plan = null, done = 0, err = null;
    var state = { doneIds: new Set(), skippedIds: new Set(), currentId: null };

    function build() {
      tree = null; plan = null; done = 0; err = null;
      state = { doneIds: new Set(), skippedIds: new Set(), currentId: null };
      try {
        tree = parse(input.value);
        dims = layout(tree);
        parenLine.innerHTML = 'Executed as: <code>' + esc(toParenString(tree)) + '</code>';
        try {
          plan = buildSteps(tree);
        } catch (e) {
          err = e; // evaluation error — tree still drawable
        }
        status.className = 'sim-status';
        var ops = plan ? plan.steps.length : '?';
        status.textContent = 'Tree built — ' + dims.leaves + ' operands, ' +
          (plan ? plan.steps.length + ' operator step' + (plan.steps.length === 1 ? '' : 's') : 'evaluation will fail') +
          '. The deepest operators run first; the root runs last. Press Step.';
      } catch (e) {
        parenLine.innerHTML = '';
        canvas.innerHTML = '';
        status.className = 'sim-status error';
        status.textContent = 'Cannot parse: ' + e.message;
        return;
      }
      redraw();
    }

    function redraw() { canvas.innerHTML = renderSVG(tree, dims, state); }

    function doStep() {
      if (!tree) { build(); return; }
      if (!plan) { // evaluation error occurred during planning
        if (err) {
          state.currentId = err.id || null;
          status.className = 'sim-status error';
          status.textContent = (err.compile ? 'Compile error: ' : 'Runtime error: ') + err.msg;
          redraw();
        }
        return;
      }
      if (done >= plan.steps.length) {
        if (err) {
          state.currentId = err.id || null;
          status.className = 'sim-status error';
          status.textContent = (err.compile ? 'Compile error: ' : 'Runtime error: ') + err.msg;
        } else {
          status.className = 'sim-status done';
          status.textContent = 'Finished — the root produced ' + fmt(plan.result) +
            (plan.resultInt ? '' : ' (a double)') + '.';
        }
        redraw();
        return;
      }
      var s = plan.steps[done++];
      state.doneIds.add(s.id);
      state.currentId = s.id;
      (s.skipped || []).forEach(function (id) { state.skippedIds.add(id); });
      status.className = 'sim-status running';
      status.textContent = 'Step ' + done + (plan ? ' of ' + plan.steps.length : '') + ': ' + s.text;
      if (done >= plan.steps.length && !err) {
        status.className = 'sim-status done';
        status.textContent = 'Step ' + done + ' of ' + plan.steps.length + ': ' + s.text +
          '  —  finished! Result: ' + fmt(plan.result);
      }
      redraw();
    }

    parseBtn.addEventListener('click', build);
    input.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') build(); });
    sel.addEventListener('change', function () {
      if (sel.value === '') return;
      input.value = PRESETS[+sel.value].src;
      sel.value = '';
      build();
    });
    stepBtn.addEventListener('click', doStep);
    allBtn.addEventListener('click', function () {
      if (!tree) build();
      if (!plan) { doStep(); return; }
      var guard = 0;
      while (done < plan.steps.length && guard++ < 500) doStep();
      doStep(); // show the finished / error message
    });
    resetBtn.addEventListener('click', function () {
      done = 0;
      state = { doneIds: new Set(), skippedIds: new Set(), currentId: null };
      if (tree) {
        status.className = 'sim-status';
        status.textContent = 'Steps reset — press Step to evaluate the deepest-leftmost operator.';
        redraw();
      }
    });

    build();
  }

  var ExprTree = { parse: parse, buildSteps: buildSteps, toParenString: toParenString, layout: layout };
  if (typeof module !== 'undefined' && module.exports) module.exports = ExprTree;
  else {
    global.ExprTree = ExprTree;
    document.addEventListener('DOMContentLoaded', mount);
  }
})(typeof window !== 'undefined' ? window : this);
