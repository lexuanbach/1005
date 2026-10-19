/* VNEditor \u2014 a small code editor for the toy assembly language of the CO1005 Von Neumann Machine lab.
 *
 * Technique (the same as course.js makeEditor): a transparent <textarea> sits on top of a highlighted
 * <pre>; both layers have identical text metrics and are scrolled together. On top of that:
 *   - a gutter with line numbers, breakpoint dots and error / warning / info icons,
 *   - wavy underlines under diagnostics, an active-line band, hover tooltips,
 *   - its own undo / redo history (patch based), Tab / Shift+Tab, Enter auto-indent,
 *   - an autocomplete popup (ARIA listbox) with built-in mnemonic / label completion.
 * Pure functions (tokenizeLine, highlightLine) are exported for Node tests.
 * No library, no network, no eval. User text only ever reaches the DOM through textContent or escape().
 * API and behaviour: see the README next to the module's tests (scratchpad vnm/editor/README.md) and spec section 6.
 */
(function (global) {
  'use strict';

  /* ------------------------- language knowledge ------------------------- */

  var A = '\u2190', MINUS = '\u2212', TIMES = '\u00D7', DIV = '\u00F7';
  var MN = Object.create(null);          // UPPERCASE mnemonic -> info (null prototype: safe for any lookup key)
  var MN_ORDER = [];
  function defMn(name, type, arg, sum, ext) {
    MN[name] = { name: name, type: type, arg: arg, sum: sum, ext: !!ext };
    MN_ORDER.push(name);
  }
  /* categories follow spec section 6 exactly */
  defMn('LOAD', 'op-data', true, 'R ' + A + ' mem[X]  (copy memory cell X into the accumulator R)');
  defMn('STORE', 'op-data', true, 'mem[X] ' + A + ' R  (copy the accumulator R into memory cell X)');
  defMn('CLEAR', 'op-data', true, 'mem[X] ' + A + ' 0');
  defMn('ADD', 'op-arith', true, 'R ' + A + ' R + mem[X]');
  defMn('INCREMENT', 'op-arith', true, 'mem[X] ' + A + ' mem[X] + 1  (R is untouched)');
  defMn('SUBTRACT', 'op-arith', true, 'R ' + A + ' R ' + MINUS + ' mem[X]');
  defMn('DECREMENT', 'op-arith', true, 'mem[X] ' + A + ' mem[X] ' + MINUS + ' 1  (R is untouched)');
  defMn('COMPARE', 'op-flow', true, 'set the flags: GT if mem[X] > R, EQ if mem[X] = R, LT if mem[X] < R');
  defMn('JUMP', 'op-flow', true, 'PC ' + A + ' X  (always jump)');
  defMn('JUMPGT', 'op-flow', true, 'PC ' + A + ' X if the GT flag is 1');
  defMn('JUMPLT', 'op-flow', true, 'PC ' + A + ' X if the LT flag is 1');
  defMn('JUMPEQ', 'op-flow', true, 'PC ' + A + ' X if the EQ flag is 1');
  defMn('JUMPNEQ', 'op-flow', true, 'PC ' + A + ' X if the EQ flag is 0');
  defMn('IN', 'op-data', true, 'mem[X] ' + A + ' next number of the input queue  (the machine waits if the queue is empty)');
  defMn('OUT', 'op-data', true, 'print mem[X] on the output device');
  defMn('HALT', 'op-flow', false, 'stop the machine');
  /* extended instruction set (supplementary, not on lecture slide 34) */
  defMn('LOADI', 'op-arith', true, 'R ' + A + ' n  (immediate value, no memory read)', true);
  defMn('ADDI', 'op-arith', true, 'R ' + A + ' R + n  (immediate)', true);
  defMn('SUBI', 'op-arith', true, 'R ' + A + ' R ' + MINUS + ' n  (immediate)', true);
  defMn('CMPI', 'op-flow', true, 'set the flags by comparing the immediate n with R  (GT if n > R, EQ if equal, LT if n < R)', true);
  defMn('LOADP', 'op-arith', true, 'R ' + A + ' mem[mem[X]]  (cell X holds a pointer)', true);
  defMn('STOREP', 'op-arith', true, 'mem[mem[X]] ' + A + ' R  (cell X holds a pointer)', true);
  defMn('MUL', 'op-arith', true, 'R ' + A + ' R ' + TIMES + ' mem[X]', true);
  defMn('DIV', 'op-arith', true, 'R ' + A + ' R ' + DIV + ' mem[X], truncated toward zero  (error if mem[X] = 0)', true);
  defMn('MOD', 'op-arith', true, 'R ' + A + ' remainder of R ' + DIV + ' mem[X], sign follows R  (error if mem[X] = 0)', true);
  defMn('JUMPGE', 'op-flow', true, 'PC ' + A + ' X if GT = 1 or EQ = 1  (in the lecture set: a pseudo-instruction that becomes two words)');
  defMn('JUMPLE', 'op-flow', true, 'PC ' + A + ' X if LT = 1 or EQ = 1  (in the lecture set: a pseudo-instruction that becomes two words)');
  defMn('NOP', 'op-flow', false, 'do nothing', true);

  var CATEGORY = {};
  MN_ORDER.forEach(function (k) { CATEGORY[k] = MN[k].type; });
  Object.freeze(CATEGORY);

  var DIRS = Object.create(null);
  DIRS['.text'] = { name: '.text', dataOnly: false, sum: 'start (or go back to) the code section; code always ends up first in memory' };
  DIRS['.data'] = { name: '.data', dataOnly: false, sum: 'start the data section: names and constants that live after the code' };
  DIRS['.word'] = { name: '.word', dataOnly: true, sum: 'one or more data cells with these values, e.g.  x: .word 5, 7, 9  (a name as value means that name\u2019s address)' };
  DIRS['.space'] = { name: '.space', dataOnly: true, sum: 'reserve n zero-filled cells (1 to 256), e.g.  buf: .space 8' };
  var DIR_ORDER = ['.text', '.data', '.word', '.space'];

  /* Which words the assembler reserves depends on the instruction set (assembler: reservedWord).
     lecture: the 16 lecture mnemonics plus the pseudo-instructions JUMPGE / JUMPLE; the other extended names
     (MUL DIV MOD NOP LOADI ...) are ordinary names, usable as labels and data names, but not as instructions.
     ext (or unknown / not told): all 28 names are reserved. */
  function isaMode(v) { return v === 'lecture' || v === 'ext' ? v : null; }
  function lookupMn(word, isa) {
    var mn = MN[word.toUpperCase()];
    if (!mn) return { mn: null, reserved: false, usable: false };
    var extOnly = isa === 'lecture' && mn.ext && mn.name !== 'JUMPGE' && mn.name !== 'JUMPLE';
    return { mn: mn, reserved: !extOnly, usable: !extOnly };
  }

  var TYPES = ['op-data', 'op-arith', 'op-flow', 'directive', 'label-def', 'label-ref', 'number', 'comment', 'punct', 'ws', 'invalid'];
  var TYPE_SET = Object.create(null);
  TYPES.forEach(function (t) { TYPE_SET[t] = true; });

  var NUM_OK = /^(?:0[xX][0-9A-Fa-f]+|0[bB][01]+|[0-9]+)$/;
  var SEC_RE = /^\s*\.(data|text)\s*(?:(?:;|\/\/).*)?$/i;
  var HL_LIMIT = 3000;       // characters of one line that get coloured; the rest is shown plain

  /* ------------------------- tokenizer / highlighter (pure) ------------------------- */

  function isWs(c) {
    return c === 32 || (c >= 9 && c <= 13) || c === 0xA0 || c === 0xFEFF || c === 0x1680 ||
      (c >= 0x2000 && c <= 0x200A) || c === 0x2028 || c === 0x2029 || c === 0x202F || c === 0x205F || c === 0x3000;
  }
  function isDigit(c) { return c >= 48 && c <= 57; }
  function isIdStart(c) { return (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95; }
  function isIdChar(c) { return isIdStart(c) || isDigit(c); }

  /* tokenizeLine(text, ctx?) \u2014 ctx = { section: 'text' | 'data', isa: 'lecture' | 'ext' } (both optional; without
     isa all 28 mnemonics are reserved, with isa 'lecture' the extended-only names are ordinary names). The tokens cover the whole text
     without gaps, so joining token.text gives the line back. Types: op-data op-arith op-flow directive
     label-def label-ref number comment punct ws invalid. */
  function tokenizeLine(text, ctx) {
    text = text == null ? '' : String(text);
    var section = ctx && (ctx.section === 'data' || ctx.section === 'text') ? ctx.section : '';
    var isa = ctx ? isaMode(ctx.isa) : null;
    var out = [], n = text.length, i = 0, expectOp = false, c, j, start, word, mn, lk;
    function push(type, s, e) { out.push({ type: type, text: text.slice(s, e), start: s, end: e }); }
    while (i < n) {
      c = text.charCodeAt(i); start = i;
      if (isWs(c)) {
        while (i < n && isWs(text.charCodeAt(i))) i++;
        push('ws', start, i);
      } else if (c === 59 || (c === 47 && text.charCodeAt(i + 1) === 47)) {          // ;  //
        push('comment', i, n); i = n;
      } else if (c === 58 || c === 44) {                                               // :  ,
        i++; push('punct', start, i);
      } else if (isIdStart(c)) {
        while (i < n && isIdChar(text.charCodeAt(i))) i++;
        word = text.slice(start, i);
        lk = lookupMn(word, isa); mn = lk.mn;
        j = i; while (j < n && isWs(text.charCodeAt(j))) j++;
        if (text.charCodeAt(j) === 58) {                                               // name:
          push(lk.reserved ? 'invalid' : 'label-def', start, i);                       // a name may not be a reserved mnemonic
        } else if (!expectOp && section !== 'data') {                                  // mnemonic position
          push(lk.usable ? mn.type : 'invalid', start, i); expectOp = true;
        } else {                                                                       // operand / data value
          push(lk.reserved ? 'invalid' : 'label-ref', start, i); expectOp = true;
        }
      } else if (isDigit(c) || ((c === 43 || c === 45) && isDigit(text.charCodeAt(i + 1)))) {
        var signed = !isDigit(c);
        i++;
        while (i < n && (isIdChar(text.charCodeAt(i)) || text.charCodeAt(i) === 46)) i++;
        word = text.slice(start + (signed ? 1 : 0), i);
        push(NUM_OK.test(word) && !(signed && section === 'text') && !(!expectOp && section === 'text') ? 'number' : 'invalid', start, i);
        expectOp = true;
      } else if (c === 46) {                                                           // .directive
        i++;
        if (isIdStart(text.charCodeAt(i))) { while (i < n && isIdChar(text.charCodeAt(i))) i++; }
        var d = DIRS[text.slice(start, i).toLowerCase()];
        push(d && !(d.dataOnly && section === 'text') ? 'directive' : 'invalid', start, i);
        expectOp = true;
      } else {                                                                         // anything else
        i++;
        while (i < n) {
          c = text.charCodeAt(i);
          if (isWs(c) || c === 59 || c === 58 || c === 44 || c === 46 || isIdChar(c) || c === 43 || c === 45 ||
              (c === 47 && text.charCodeAt(i + 1) === 47)) break;
          i++;
        }
        push('invalid', start, i);
      }
    }
    return out;
  }

  var ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
  function esc(s) { return String(s).replace(/[&<>]/g, function (ch) { return ESC_MAP[ch]; }); }
  var SEV_RANK = { info: 1, warning: 2, error: 3 };

  /* highlightLine(text, tokens?, marks?, ctx?) -> HTML. Every piece of text is escaped. Stripping the tags and
     decoding the three entities gives `text` back. marks = [{start, end, severity}] (character offsets) add the
     diagnostic underline classes. `tokens` may be omitted, or replaced by a ctx object ({section, isa}). */
  function highlightLine(text, tokens, marks, ctx) {
    text = text == null ? '' : String(text);
    if (tokens && !Array.isArray(tokens)) { ctx = tokens; tokens = null; }
    if (!tokens) tokens = tokenizeLine(text, ctx);
    var out = '', k, t, cls;
    var ms = [];
    if (marks && marks.length) {
      for (k = 0; k < marks.length; k++) {
        var m = marks[k];
        if (!m || !SEV_RANK[m.severity]) continue;
        var s = Math.max(0, Math.min(text.length, m.start | 0)), e = Math.max(0, Math.min(text.length, m.end | 0));
        if (e > s) ms.push({ s: s, e: e, r: SEV_RANK[m.severity], sev: m.severity });
      }
    }
    if (!ms.length) {
      for (k = 0; k < tokens.length; k++) {
        t = tokens[k];
        if (t.type === 'ws' || !TYPE_SET[t.type]) out += esc(t.text);
        else out += '<span class="vne-t vne-t-' + t.type + '">' + esc(t.text) + '</span>';
      }
      return out;
    }
    var cuts = [];
    ms.forEach(function (m) { cuts.push(m.s, m.e); });
    cuts.sort(function (a, b) { return a - b; });
    for (k = 0; k < tokens.length; k++) {
      t = tokens[k];
      var a = t.start, b = t.end, pos = a;
      var inner = [];
      for (var q = 0; q < cuts.length; q++) if (cuts[q] > a && cuts[q] < b && inner[inner.length - 1] !== cuts[q]) inner.push(cuts[q]);
      inner.push(b);
      for (q = 0; q < inner.length; q++) {
        var x = pos, y = inner[q]; pos = y;
        var best = null;
        for (var r = 0; r < ms.length; r++) if (ms[r].s <= x && ms[r].e >= y && (!best || ms[r].r > best.r)) best = ms[r];
        var piece = esc(text.slice(x, y));
        var typed = t.type !== 'ws' && TYPE_SET[t.type];
        cls = (typed ? 'vne-t vne-t-' + t.type : '') + (best ? (typed ? ' ' : '') + 'vne-dg vne-dg-' + best.sev : '');
        out += cls ? '<span class="' + cls + '">' + piece + '</span>' : piece;
      }
    }
    return out;
  }

  function sectionAfter(line, sec) {
    var m = SEC_RE.exec(line);
    return m ? m[1].toLowerCase() : sec;
  }

  /* the first label definition of every line, e.g. { loop: {line: 5, kind: 'code'} }  (used for hover / completion) */
  function scanNames(lines, isa) {
    var names = Object.create(null), list = [], sec = 'text', re = /^\s*([A-Za-z_]\w*)\s*:/;
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i];
      var m = re.exec(ln);
      if (m && !lookupMn(m[1], isa).reserved && !names[m[1]]) {
        var info = { name: m[1], line: i + 1, kind: sec === 'data' ? 'data' : 'code' };
        names[m[1]] = info; list.push(info);
      }
      sec = sectionAfter(ln, sec);
    }
    return { map: names, list: list };
  }

  function diffRange(a, b) {
    var n = Math.min(a.length, b.length), p = 0;
    while (p < n && a.charCodeAt(p) === b.charCodeAt(p)) p++;
    var s = 0;
    while (s < n - p && a.charCodeAt(a.length - 1 - s) === b.charCodeAt(b.length - 1 - s)) s++;
    return { pos: p, del: a.slice(p, a.length - s), ins: b.slice(p, b.length - s) };
  }

  function numberHint(word) {
    var neg = word.charAt(0) === '-', body = word.replace(/^[+-]/, ''), v;
    if (/^0[xX][0-9A-Fa-f]+$/.test(body)) v = parseInt(body.slice(2), 16);
    else if (/^0[bB][01]+$/.test(body)) v = parseInt(body.slice(2), 2);
    else if (/^[0-9]+$/.test(body)) v = parseInt(body, 10);
    else return null;
    if (!isFinite(v) || v > 9007199254740991) return null;
    if (neg) v = -v;
    var av = Math.abs(v);
    return String(v) + ' = ' + (v < 0 ? '-' : '') + '0x' + av.toString(16).toUpperCase() + ' = ' + (v < 0 ? '-' : '') + '0b' + av.toString(2);
  }

  /* ------------------------- the editor ------------------------- */

  var uid = 0;
  var INDENT = '    ';

  function create(container, opts) {
    opts = opts || {};
    if (typeof container === 'string') container = document.querySelector(container);
    var doc = (container && container.ownerDocument) || document;
    var win = doc.defaultView || window;
    var id = 'vne' + (++uid);
    var destroyed = false;
    var cleanups = [];
    var clock = typeof opts.clock === 'function' ? opts.clock : function () { return Date.now(); };

    function on(target, type, fn, o) {
      target.addEventListener(type, fn, o);
      cleanups.push(function () { target.removeEventListener(type, fn, o); });
    }
    function el(tag, cls, parent) {
      var e = doc.createElement(tag);
      if (cls) e.className = cls;
      if (parent) parent.appendChild(e);
      return e;
    }

    /* -- DOM -- */
    var root = el('div', 'vne');
    var shell = el('div', 'vne-shell', root);
    var layer = el('pre', 'vne-layer', shell);
    layer.setAttribute('aria-hidden', 'true');
    var code = el('code', 'vne-code', layer);
    var spacer = el('div', 'vne-spacer', code);
    var ta = el('textarea', 'vne-input', shell);
    var gutter = el('div', 'vne-gutter', shell);
    gutter.setAttribute('aria-hidden', 'true');
    var gList = el('div', 'vne-gutter-list', gutter);
    var gSpacer = el('div', 'vne-gl-spacer', gList);
    var probe = el('span', 'vne-probe', shell);
    probe.setAttribute('aria-hidden', 'true');
    probe.textContent = new Array(101).join('M');
    var popEl = el('div', 'vne-pop', root);
    popEl.id = id + '-list';
    popEl.setAttribute('role', 'listbox');
    popEl.setAttribute('aria-label', 'Suggestions');
    popEl.hidden = true;
    var tip = el('div', 'vne-tip', root);
    tip.id = id + '-tip';
    tip.setAttribute('role', 'tooltip');
    tip.hidden = true;
    var sr = el('div', 'vne-sr', root);
    sr.setAttribute('role', 'status');
    sr.setAttribute('aria-live', 'polite');
    var help = el('span', 'vne-sr', root);
    help.id = id + '-help';
    help.textContent = 'Assembly editor. Escape then Tab leaves the editor. Control+Space or Alt+Slash opens suggestions. F9 toggles a breakpoint. Control+Enter assembles.';

    ta.spellcheck = false;
    ta.setAttribute('wrap', 'off');
    ta.setAttribute('autocomplete', 'off');
    ta.setAttribute('autocapitalize', 'off');
    ta.setAttribute('autocorrect', 'off');
    ta.setAttribute('aria-label', opts.label || 'Assembly code');
    ta.setAttribute('aria-describedby', id + '-help');
    ta.setAttribute('data-gramm', 'false');

    if (container) container.appendChild(root);

    /* -- model -- */
    var lines = [''], secStart = ['text'], lineEls = [], glEls = [];
    var bps = new Set();
    var activeLine = null, activeKind = 'running';
    var diags = [], diagMap = new Map();     // line (1-based) -> [diag]
    var readOnly = false, isa = isaMode(opts.isa), composing = false, trapReleased = false;
    var minRows = Math.max(1, opts.minRows | 0 || 6), maxRows = Math.max(minRows, opts.maxRows | 0 || 28);
    var autoHeight = opts.autoHeight !== false;
    if (!autoHeight) root.classList.add('is-fill');
    var nameCache = null;                    // invalidated on every text change
    var lastCursor = null, preSel = null;
    /* measurements (CSS px) */
    var M = { lh: 0, cw: 0, padT: 0, padB: 0, padL: 0, border: 0, sbW: 0, sbH: 0, dirty: true };
    var extraH = 0, extraW = 0, digits = 0, lastHb = 0;
    var cssRound = !!(win.CSS && win.CSS.supports && win.CSS.supports('width', 'round(1.5px, 1px)'));

    /* -- line rendering -- */
    function marksFor(lineNo, len) {
      var arr = diagMap.get(lineNo);
      if (!arr) return null;
      var marks = [], padSev = null;
      for (var i = 0; i < arr.length; i++) {
        var d = arr[i];
        if (d.global) continue;
        var s = d.col - 1, e = s + d.len;
        if (s >= len) { if (!padSev || SEV_RANK[d.severity] > SEV_RANK[padSev]) padSev = d.severity; continue; }
        marks.push({ start: s, end: Math.min(e, len), severity: d.severity });
      }
      return { marks: marks, pad: padSev };
    }
    function lineHtml(i) {
      var text = lines[i], ctx = { section: secStart[i], isa: isa };
      var mk = marksFor(i + 1, text.length);
      var html;
      if (text.length > HL_LIMIT) {
        html = highlightLine(text.slice(0, HL_LIMIT), null, mk && mk.marks, ctx) + esc(text.slice(HL_LIMIT));
      } else {
        html = highlightLine(text, null, mk && mk.marks, ctx);
      }
      if (mk && mk.pad) html += '<span class="vne-dg vne-dg-' + mk.pad + ' vne-pad"> </span>';
      return html;
    }
    function topSeverity(lineNo) {
      var arr = diagMap.get(lineNo), best = null;
      if (arr) for (var i = 0; i < arr.length; i++) if (!best || SEV_RANK[arr[i].severity] > SEV_RANK[best]) best = arr[i].severity;
      return best;
    }
    function lineCls(i) {
      var n = i + 1, c = 'vne-line';
      if (bps.has(n)) c += ' is-bp';
      if (activeLine === n) c += ' is-active' + (activeKind === 'next' ? ' is-next' : '');
      return c;
    }
    function glCls(i) {
      var n = i + 1, c = 'vne-gl', sev = topSeverity(n);
      if (bps.has(n)) c += ' is-bp';
      if (activeLine === n) c += ' is-active' + (activeKind === 'next' ? ' is-next' : '');
      if (sev) c += ' has-' + sev;
      return c;
    }
    function buildNodes(from, to) {   // -> {l: [], g: []} elements for lines[from..to)
      var hl = '', hg = '', i;
      for (i = from; i < to; i++) {
        hl += '<div class="' + lineCls(i) + '">' + lineHtml(i) + '</div>';
        hg += '<div class="' + glCls(i) + '"><i class="vne-bp"></i><i class="vne-ic"></i></div>';
      }
      var tl = doc.createElement('div'), tg = doc.createElement('div');
      tl.innerHTML = hl; tg.innerHTML = hg;                 // static markup around escaped text only
      return { l: Array.prototype.slice.call(tl.children), g: Array.prototype.slice.call(tg.children) };
    }
    function refreshLine(i) {   // re-render one existing line (content + classes)
      if (i < 0 || i >= lines.length || !lineEls[i]) return;
      lineEls[i].className = lineCls(i);
      lineEls[i].innerHTML = lineHtml(i);
      glEls[i].className = glCls(i);
    }
    function setIsa(v) {       // the instruction set decides which names are reserved: re-colour every line
      if (destroyed) return;
      v = isaMode(v);
      if (v === isa) return;
      isa = v; nameCache = null;
      for (var i = 0; i < lines.length; i++) refreshLine(i);
    }
    function refreshClasses(i) {
      if (i < 0 || i >= lines.length || !lineEls[i]) return;
      lineEls[i].className = lineCls(i);
      glEls[i].className = glCls(i);
    }

    /* -- decorations follow edits -- */
    function shiftDecorations(p, oEnd, nEnd) {
      var delta = nEnd - oEnd, a = oEnd - p, b = nEnd - p;
      function map(lineNo) {            // -> new line number or 0 (dropped)
        var idx = lineNo - 1;
        if (idx < p) return lineNo;
        if (idx >= oEnd) return lineNo + delta;
        return (idx - p) < b ? lineNo : 0;
      }
      var changed = false;
      if (bps.size) {
        var nb = new Set();
        bps.forEach(function (n) { var m = map(n); if (m) nb.add(m); if (m !== n) changed = true; });
        bps = nb;
      }
      if (activeLine !== null) { var ma = map(activeLine); activeLine = ma || null; }
      if (diags.length) {
        var nd = [];
        diags.forEach(function (d) {
          var idx = d.line - 1;
          if (d.global) { nd.push(d); return; }
          if (idx >= p && idx < oEnd) return;           // the line was edited: the message is stale
          var m = map(d.line);
          if (!m) return;
          nd.push(m === d.line ? d : copyDiag(d, m));
        });
        diags = nd;
      }
      return changed;
    }
    function copyDiag(d, line) {
      var c = {}; for (var k in d) c[k] = d[k]; c.line = line; return c;
    }
    function rebuildDiagMap() {
      diagMap = new Map();
      diags.forEach(function (d) {
        var ln = d.global ? 1 : d.line;
        if (ln > lines.length) ln = lines.length;
        var arr = diagMap.get(ln);
        if (!arr) diagMap.set(ln, arr = []);
        arr.push(d);
      });
    }

    /* -- sync: textarea value -> model + DOM (only the changed region is rebuilt) -- */
    function sync() {
      var text = ta.value, nl = text.split('\n'), ol = lines, a = ol.length, b = nl.length;
      var m = a < b ? a : b, p = 0;
      while (p < m && ol[p] === nl[p]) p++;
      if (p === a && p === b) return null;
      var s = 0, lim = m - p;
      while (s < lim && ol[a - 1 - s] === nl[b - 1 - s]) s++;
      var oEnd = a - s, nEnd = b - s;
      nameCache = null;
      var bpChanged = shiftDecorations(p, oEnd, nEnd);

      var oldSec = secStart, newSec = new Array(b), i, cur;
      for (i = 0; i < p; i++) newSec[i] = oldSec[i];
      cur = p === 0 ? 'text' : sectionAfter(nl[p - 1], newSec[p - 1]);
      for (i = p; i < nEnd; i++) { newSec[i] = cur; cur = sectionAfter(nl[i], cur); }
      var redo = [];
      for (i = nEnd; i < b; i++) {
        if (oldSec[i - nEnd + oEnd] === cur) break;
        newSec[i] = cur; redo.push(i); cur = sectionAfter(nl[i], cur);
      }
      for (var k = i; k < b; k++) newSec[k] = oldSec[k - nEnd + oEnd];
      lines = nl; secStart = newSec;
      if (diags.length) rebuildDiagMap();      // after `lines` has its new length (global marks clamp to it)

      var oldL = lineEls, oldG = glEls, kk;
      for (kk = p; kk < oEnd; kk++) { oldL[kk].remove(); oldG[kk].remove(); }
      var built = buildNodes(p, nEnd);
      if (built.l.length) {
        var fl = doc.createDocumentFragment(), fg = doc.createDocumentFragment();
        built.l.forEach(function (n) { fl.appendChild(n); });
        built.g.forEach(function (n) { fg.appendChild(n); });
        code.insertBefore(fl, oEnd < a ? oldL[oEnd] : spacer);
        gList.insertBefore(fg, oEnd < a ? oldG[oEnd] : gSpacer);
      }
      lineEls = oldL.slice(0, p).concat(built.l, oldL.slice(oEnd));
      glEls = oldG.slice(0, p).concat(built.g, oldG.slice(oEnd));
      for (kk = 0; kk < redo.length; kk++) refreshLine(redo[kk]);
      if (bpChanged && typeof opts.onBreakpoints === 'function') safeCall(opts.onBreakpoints, new Set(bps));
      layout();
      return { p: p, oEnd: oEnd, nEnd: nEnd };
    }

    function safeCall(fn) {
      var args = Array.prototype.slice.call(arguments, 1);
      try { return fn.apply(null, args); } catch (e) {
        if (win.console && win.console.error) win.console.error('VNEditor callback failed:', e);
        return undefined;
      }
    }

    /* -- measuring and layout -- */
    function measure() {
      var cs = win.getComputedStyle(ta);
      var fs = parseFloat(cs.fontSize) || 13;
      var lh = parseFloat(cs.lineHeight);
      if (lineEls[0]) { var r = lineEls[0].getBoundingClientRect(); if (r.height > 0) lh = r.height; }
      if (!cssRound) {     // old browsers: no CSS round(); snap the row height to whole pixels ourselves
        var want = Math.round(fs * 1.6);
        if (root.style.getPropertyValue('--vne-lh') !== want + 'px') { root.style.setProperty('--vne-lh', want + 'px'); lh = want; }
      }
      M.lh = lh > 0 ? lh : fs * 1.6;
      var pw = probe.getBoundingClientRect().width;
      M.cw = pw > 0 ? pw / 100 : fs * 0.6;
      M.padT = parseFloat(cs.paddingTop) || 0;
      M.padB = parseFloat(cs.paddingBottom) || 0;
      M.padL = parseFloat(cs.paddingLeft) || 0;
      M.border = parseFloat(win.getComputedStyle(shell).borderTopWidth) || 0;
      M.dirty = false;
    }
    function layout() {
      if (destroyed) return;
      var d = Math.max(3, String(lines.length).length);
      if (d !== digits) { digits = d; shell.style.setProperty('--vne-digits', String(d)); M.dirty = true; }
      if (M.dirty) measure();
      if (autoHeight) {
        var rows = Math.min(maxRows, Math.max(minRows, lines.length));
        var base = rows * M.lh + M.padT + M.padB + 2 * M.border;
        var setH = function (px) { var v = Math.round(px * 100) / 100 + 'px'; if (shell.style.height !== v) shell.style.height = v; };
        setH(base + lastHb);
        var hb = ta.offsetHeight - ta.clientHeight;      // height of a horizontal scrollbar, if there is one
        if (hb < 0) hb = 0;
        if (Math.abs(hb - lastHb) > 0.5) { lastHb = hb; setH(base + hb); }
      }
      equalize();
      syncScroll();
    }
    /* Both layers must be able to scroll exactly as far as each other, or the last rows / columns drift.
       The textarea's own scroll extents are the reference; the highlight layer gets padding to match. */
    function equalize() {
      for (var pass = 0; pass < 3; pass++) {
        var dv = (ta.scrollHeight - ta.clientHeight) - (layer.scrollHeight - layer.clientHeight);
        var dh = (ta.scrollWidth - ta.clientWidth) - (layer.scrollWidth - layer.clientWidth);
        if (Math.abs(dv) <= 1 && Math.abs(dh) <= 1) break;
        if (Math.abs(dv) > 1) { extraH = Math.max(0, extraH + dv); spacer.style.height = extraH + 'px'; }
        if (Math.abs(dh) > 1) { extraW = Math.max(0, extraW + dh); code.style.paddingRight = extraW + 'px'; }
      }
    }
    function syncScroll() {
      var st = ta.scrollTop, sl = ta.scrollLeft;
      if (layer.scrollTop !== st) layer.scrollTop = st;
      if (layer.scrollLeft !== sl) layer.scrollLeft = sl;
      gList.style.transform = st ? 'translateY(' + (-st) + 'px)' : '';
    }

    /* -- text positions -- */
    function lineOfOffset(off) {
      var n = 0, i = -1, t = ta.value;
      while ((i = t.indexOf('\n', i + 1)) !== -1 && i < off) n++;
      return n;
    }
    function lineStartOffset(idx) {
      var t = ta.value, off = 0;
      for (var i = 0; i < idx; i++) { var j = t.indexOf('\n', off); if (j < 0) return t.length; off = j + 1; }
      return off;
    }
    function posOfOffset(off) {
      var t = ta.value, idx = lineOfOffset(off), ls = lineStartOffset(idx);
      return { idx: idx, col: off - ls, ls: ls };
    }
    function visCol(text, upto) {
      var v = 0;
      for (var i = 0; i < upto; i++) v = text.charCodeAt(i) === 9 ? (Math.floor(v / 4) + 1) * 4 : v + 1;
      return v;
    }
    function idxFromVisCol(text, vc) {
      var v = 0;
      for (var i = 0; i < text.length; i++) {
        var nv = text.charCodeAt(i) === 9 ? (Math.floor(v / 4) + 1) * 4 : v + 1;
        if (vc < nv) return i;
        v = nv;
      }
      return text.length;
    }

    function revealOffset(off, center) {
      if (M.dirty) measure();
      var pos = posOfOffset(off), top = M.padT + pos.idx * M.lh, bottom = top + M.lh;
      var viewH = ta.clientHeight;
      if (top < ta.scrollTop + M.padT * 0.5 || bottom > ta.scrollTop + viewH - M.padB * 0.5) {
        if (center) ta.scrollTop = Math.max(0, top + M.lh / 2 - viewH / 2);
        else if (top < ta.scrollTop) ta.scrollTop = Math.max(0, top - M.padT);
        else ta.scrollTop = bottom - viewH + M.padB;
      }
      var x = M.padL + visCol(lines[pos.idx], pos.col) * M.cw;
      var visL = ta.scrollLeft + M.padL - 1.5 * M.cw, visR = ta.scrollLeft + ta.clientWidth - 2 * M.cw;
      if (x < visL) ta.scrollLeft = Math.max(0, x - M.padL - 3 * M.cw);
      else if (x > visR) ta.scrollLeft = x - ta.clientWidth + 4 * M.cw;
      syncScroll();
    }
    function revealCaret() { revealOffset(ta.selectionEnd, false); }

    /* -- history -- */
    var hist = [], hi = 0, histText = '', mergeOK = false;
    function record(typing) {
      var cur = ta.value;
      if (cur === histText) return;
      var d = diffRange(histText, cur), now = clock();
      hist.length = hi;
      var top = hi > 0 ? hist[hi - 1] : null;
      var sel = [ta.selectionStart, ta.selectionEnd];
      var merged = false;
      if (typing && mergeOK && top && now - top.t < 700) {
        if (top.del === '' && d.del === '' && d.pos === top.pos + top.ins.length &&
            top.ins.indexOf('\n') < 0 && d.ins.indexOf('\n') < 0) {
          top.ins += d.ins; merged = true;
        } else if (top.ins === '' && d.ins === '') {
          if (d.pos + d.del.length === top.pos) { top.pos = d.pos; top.del = d.del + top.del; merged = true; }
          else if (d.pos === top.pos) { top.del += d.del; merged = true; }
        }
      }
      if (merged) { top.sa = sel; top.t = now; }
      else {
        hist.push({ pos: d.pos, del: d.del, ins: d.ins, sb: preSel || [d.pos, d.pos], sa: sel, t: now });
        hi = hist.length;
        if (hist.length > 500) { hist.shift(); hi--; }
      }
      mergeOK = !!typing;
      histText = cur;
    }
    function applyHist(e, undoing) {
      var cur = ta.value, from = e.pos, delLen = undoing ? e.ins.length : e.del.length;
      var put = undoing ? e.del : e.ins, expect = undoing ? e.ins : e.del;
      if (cur.substr(from, delLen) !== expect) { hist = []; hi = 0; histText = cur; return false; }   // out of sync: drop history
      preSel = [ta.selectionStart, ta.selectionEnd];
      ta.setRangeText(put, from, from + delLen, 'end');
      var sel = undoing ? e.sb : e.sa;
      ta.setSelectionRange(Math.min(sel[0], ta.value.length), Math.min(sel[1], ta.value.length));
      histText = ta.value;
      mergeOK = false;
      return true;
    }
    function undo() {
      if (readOnly || hi === 0 || destroyed) return false;
      var ok = applyHist(hist[--hi], true);
      afterProgrammatic();
      return ok;
    }
    function redo() {
      if (readOnly || hi >= hist.length || destroyed) return false;
      var ok = applyHist(hist[hi++], false);
      afterProgrammatic();
      return ok;
    }
    function afterProgrammatic() {
      sync();
      closePopup();
      revealCaret();
      fireChange();
      reportCursor();
    }

    /* -- change notifications -- */
    function fireChange() { if (typeof opts.onChange === 'function') safeCall(opts.onChange, ta.value); }
    function getCursor() {
      var off = ta.selectionEnd, pos = posOfOffset(off);
      var s = posOfOffset(ta.selectionStart);
      return { line: pos.idx + 1, col: pos.col + 1, offset: off, selStart: ta.selectionStart, selEnd: ta.selectionEnd, anchor: { line: s.idx + 1, col: s.col + 1 }, lines: lines.length };
    }
    function reportCursor() {
      var c = getCursor();
      if (lastCursor && lastCursor.line === c.line && lastCursor.col === c.col && lastCursor.selStart === c.selStart && lastCursor.selEnd === c.selEnd) return;
      var lineChanged = !lastCursor || lastCursor.line !== c.line;
      lastCursor = c;
      if (typeof opts.onCursor === 'function') safeCall(opts.onCursor, { line: c.line, col: c.col, offset: c.offset, selStart: c.selStart, selEnd: c.selEnd, lines: c.lines });
      if (lineChanged) scheduleDiagAnnounce(c.line);
    }

    /* edit(from, to, text, selStart, selEnd): replace [from,to) and select [selStart,selEnd); one history step */
    function edit(from, to, text, selS, selE, typing) {
      preSel = [ta.selectionStart, ta.selectionEnd];
      ta.setRangeText(text, from, to, 'end');
      ta.setSelectionRange(selS, selE);
      sync();
      record(!!typing);
      revealCaret();
      fireChange();
      reportCursor();
    }

    /* -- user input -- */
    on(ta, 'beforeinput', function (ev) {
      preSel = [ta.selectionStart, ta.selectionEnd];
      if (ev.inputType === 'historyUndo') { ev.preventDefault(); undo(); }
      else if (ev.inputType === 'historyRedo') { ev.preventDefault(); redo(); }
    });
    on(ta, 'input', function (ev) {
      if (destroyed) return;
      var typing = ev.inputType === 'insertText' || ev.inputType === 'deleteContentBackward' || ev.inputType === 'deleteContentForward';
      if (readOnly) { ta.value = histText; sync(); return; }
      sync();
      if (composing || ev.isComposing) return;
      record(typing);
      fireChange();
      reportCursor();
      if (ev.inputType === 'insertText' && /^[A-Za-z0-9_.]$/.test(ev.data || '')) updateCompletion(false);   // typing a word opens the popup
      else if (pop.open && typing) updateCompletion(false);                                                     // deleting only refines an open one
      else closePopup();
      hideTip();
    });
    on(ta, 'compositionstart', function () { composing = true; closePopup(); });
    on(ta, 'compositionend', function () {
      composing = false;
      if (destroyed) return;
      sync();
      record(false);
      fireChange();
      reportCursor();
    });
    on(ta, 'scroll', function () { syncScroll(); hideTip(); if (pop.open) positionPopup(); });
    on(ta, 'blur', function () { closePopup(); hideTip(); trapReleased = false; });
    on(ta, 'focus', function () { if (!destroyed) reportCursor(); });
    on(ta, 'keyup', function (ev) { if (!ev.isComposing) { reportCursor(); caretMoved(ev); } });
    on(ta, 'mouseup', function () { reportCursor(); if (pop.open) closePopup(); });
    on(ta, 'select', reportCursor);

    function caretMoved(ev) {
      if (!pop.open) return;
      var k = ev.key;
      if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'Home' || k === 'End' || k === 'Backspace' || k === 'Delete') updateCompletion(false);
    }

    function lineBlock(selS, selE) {   // line indexes touched by the selection
      var a = posOfOffset(selS), b = posOfOffset(selE);
      var last = b.idx;
      if (selE > selS && b.col === 0 && last > a.idx) last--;
      return { first: a.idx, last: last };
    }

    function doTab(shift) {
      var s = ta.selectionStart, e = ta.selectionEnd, a = posOfOffset(s), b = posOfOffset(e);
      var multi = lineBlock(s, e).last > a.idx;
      if (!shift && !multi) { edit(s, e, INDENT, s + INDENT.length, s + INDENT.length, false); return; }
      var blk = lineBlock(s, e), f = blk.first, l = blk.last;
      var from = lineStartOffset(f), toOff = lineStartOffset(l) + lines[l].length;
      var out = [], i, total = 0, firstDelta = 0;
      for (i = f; i <= l; i++) {
        var ln = lines[i], nlText, dlt;
        if (!shift) { nlText = ln.length ? INDENT + ln : ln; dlt = nlText.length - ln.length; }
        else {
          var m = /^(?: {1,4}|\t)/.exec(ln);
          nlText = m ? ln.slice(m[0].length) : ln; dlt = nlText.length - ln.length;
        }
        out.push(nlText); total += dlt;
        if (i === f) firstDelta = dlt;
      }
      var ns, ne;
      if (!multi) {   // Shift+Tab with a caret / small selection in one line
        ns = Math.max(from, s + Math.max(firstDelta, from - s)); ne = Math.max(ns, e + Math.max(firstDelta, from - e));
        if (firstDelta < 0) { ns = Math.max(from, s + firstDelta); ne = Math.max(from, e + firstDelta); }
      } else {
        ns = Math.max(from, s + (firstDelta < 0 ? Math.max(firstDelta, from - s) : firstDelta));
        ne = e + total;
      }
      if (out.join('\n') === lines.slice(f, l + 1).join('\n')) return;
      edit(from, toOff, out.join('\n'), ns, ne, false);
    }

    function doEnter() {
      var s = ta.selectionStart, e = ta.selectionEnd, pos = posOfOffset(s);
      var before = lines[pos.idx].slice(0, pos.col);
      var indent = /^[ \t]*/.exec(before)[0];
      edit(s, e, '\n' + indent, s + 1 + indent.length, s + 1 + indent.length, false);
    }

    function doToggleComment() {
      var blk = lineBlock(ta.selectionStart, ta.selectionEnd), f = blk.first, l = blk.last, i;
      var from = lineStartOffset(f), toOff = lineStartOffset(l) + lines[l].length;
      var allC = true, any = false, minInd = 1e9;
      for (i = f; i <= l; i++) {
        var t = lines[i];
        if (!/\S/.test(t)) continue;
        any = true;
        var ind = /^[ \t]*/.exec(t)[0].length;
        if (ind < minInd) minInd = ind;
        if (t.charAt(ind) !== ';') allC = false;
      }
      if (!any) return;
      var out = [];
      for (i = f; i <= l; i++) {
        var u = lines[i];
        if (!/\S/.test(u)) { out.push(u); continue; }
        if (allC) { var ind2 = /^[ \t]*/.exec(u)[0].length; out.push(u.slice(0, ind2) + u.slice(ind2 + 1).replace(/^ /, '')); }
        else out.push(u.slice(0, minInd) + '; ' + u.slice(minInd));
      }
      var txt = out.join('\n');
      edit(from, toOff, txt, from, from + txt.length, false);
    }

    on(ta, 'keydown', function (ev) {
      if (destroyed) return;
      if (ev.isComposing || ev.keyCode === 229) return;
      var key = ev.key, mod = ev.ctrlKey || ev.metaKey;
      if (key !== 'Tab' && key !== 'Shift' && key !== 'Control' && key !== 'Alt' && key !== 'Meta' && key !== 'Escape') trapReleased = false;
      if (tip && !tip.hidden && key !== 'F1') hideTip();

      if (pop.open) {
        if (key === 'ArrowDown') { ev.preventDefault(); movePopup(1); return; }
        if (key === 'ArrowUp') { ev.preventDefault(); movePopup(-1); return; }
        if (key === 'PageDown') { ev.preventDefault(); movePopup(6); return; }
        if (key === 'PageUp') { ev.preventDefault(); movePopup(-6); return; }
        if ((key === 'Enter' || key === 'Tab') && !mod && !ev.altKey && !ev.shiftKey) { ev.preventDefault(); acceptPopup(); return; }
        if (key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); closePopup(); return; }
      }
      if (key === 'Escape') {
        if (tip && !tip.hidden) { hideTip(); ev.stopPropagation(); return; }
        trapReleased = true;
        announce('Tab now moves focus out of the editor.');
        return;
      }
      if (mod && !ev.altKey) {
        var k = key.toLowerCase();
        if (key === 'Enter') { ev.preventDefault(); closePopup(); if (typeof opts.onShortcut === 'function') safeCall(opts.onShortcut, 'assemble'); return; }
        if (k === 's') { ev.preventDefault(); closePopup(); if (typeof opts.onShortcut === 'function') safeCall(opts.onShortcut, 'save'); return; }
        if (k === 'z') { ev.preventDefault(); if (ev.shiftKey) redo(); else undo(); return; }
        if (k === 'y') { ev.preventDefault(); redo(); return; }
        if (key === '/' && !readOnly) { ev.preventDefault(); doToggleComment(); return; }
      }
      /* Ctrl+Space (macOS reserves it for the input source: Alt+/ also works) */
      if ((ev.ctrlKey && !ev.altKey && !ev.metaKey && (key === ' ' || ev.code === 'Space')) ||
          (ev.altKey && !ev.ctrlKey && !ev.metaKey && ev.code === 'Slash')) {
        ev.preventDefault();
        if (!readOnly) updateCompletion(true, true);
        return;
      }
      if (key === 'F9') { ev.preventDefault(); toggleBreakpoint(getCursor().line); return; }
      if (key === 'F1') { ev.preventDefault(); showTipAtCaret(); return; }
      if (readOnly) return;
      if (key === 'Tab' && !mod && !ev.altKey) {
        if (trapReleased) return;                       // Escape was pressed: let the browser move focus
        ev.preventDefault();
        doTab(ev.shiftKey);
        return;
      }
      if (key === 'Enter' && !mod && !ev.altKey) { ev.preventDefault(); doEnter(); return; }
    });

    /* -- breakpoints -- */
    function toggleBreakpoint(n, force) {
      n = n | 0;
      if (n < 1 || n > lines.length) return false;
      var has = bps.has(n), want = typeof force === 'boolean' ? force : !has;
      if (want === has) return has;
      if (want) bps.add(n); else bps.delete(n);
      refreshClasses(n - 1);
      announce(want ? 'Breakpoint set on line ' + n : 'Breakpoint removed from line ' + n);
      if (typeof opts.onBreakpoints === 'function') safeCall(opts.onBreakpoints, new Set(bps));
      return want;
    }
    on(gutter, 'mousedown', function (ev) { ev.preventDefault(); });
    on(gutter, 'click', function (ev) {
      var cell = ev.target && ev.target.closest ? ev.target.closest('.vne-gl') : null;
      if (!cell) return;
      var idx = glEls.indexOf(cell);
      if (idx >= 0) toggleBreakpoint(idx + 1);
    });

    /* position: fixed is relative to the viewport unless an ancestor has a transform / filter (animated dialogs):
       measure where the box really landed and correct by the difference */
    function placeFixed(box, left, top) {
      box.style.left = Math.round(left) + 'px';
      box.style.top = Math.round(top) + 'px';
      var r = box.getBoundingClientRect();
      var dx = r.left - Math.round(left), dy = r.top - Math.round(top);
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        box.style.left = Math.round(left - dx) + 'px';
        box.style.top = Math.round(top - dy) + 'px';
      }
    }

    /* -- tooltips -- */
    var tipTimer = null, tipKey = '', hoverDelay = opts.hoverDelay == null ? 350 : opts.hoverDelay | 0, announceTimer = null, diagTimer = null;
    function hideTip() {
      clearTimeout(tipTimer); tipTimer = null; tipKey = '';
      if (!tip.hidden) { tip.hidden = true; }
    }
    function showTip(rows, rect) {
      tip.textContent = '';
      rows.forEach(function (r) {
        var row = el('div', 'vne-tip-row' + (r.sev ? ' vne-tip-' + r.sev : ''), tip);
        if (r.sev) { var b = el('b', 'vne-tip-sev', row); b.textContent = r.sev === 'error' ? 'Error' : r.sev === 'warning' ? 'Warning' : 'Info'; }
        var sp = el('span', 'vne-tip-msg', row);
        sp.textContent = r.text;
        if (r.hint) { var h = el('div', 'vne-tip-hint', row); h.textContent = r.hint; }
      });
      tip.hidden = false;
      var tr = tip.getBoundingClientRect(), vw = win.innerWidth || doc.documentElement.clientWidth, vh = win.innerHeight || doc.documentElement.clientHeight;
      var left = Math.min(Math.max(4, rect.left), Math.max(4, vw - tr.width - 4));
      var top = rect.bottom + 4;
      if (top + tr.height > vh - 4 && rect.top - tr.height - 4 >= 4) top = rect.top - tr.height - 4;
      placeFixed(tip, left, top);
    }
    function tokenAt(idx, col) {
      var toks = tokenizeLine(lines[idx], { section: secStart[idx], isa: isa });
      for (var i = 0; i < toks.length; i++) if (col >= toks[i].start && col < toks[i].end) return toks[i];
      return null;
    }
    function names() { return nameCache || (nameCache = scanNames(lines, isa)); }
    function builtinHover(tok) {
      var t = tok.type, up = tok.text.toUpperCase();
      if (t.indexOf('op-') === 0) {
        var m = MN[up];
        return m ? up + (m.arg ? ' X' : '') + ' \u2014 ' + m.sum + (m.ext ? '  [extended instruction set]' : '') : null;
      }
      if (t === 'directive') { var d = DIRS[tok.text.toLowerCase()]; return d ? d.name + ' \u2014 ' + d.sum : null; }
      if (t === 'label-def' || t === 'label-ref') {
        var nm = names().map[tok.text];
        if (nm) return tok.text + ' \u2014 ' + (nm.kind === 'code' ? 'code label' : 'data name') + ', defined on line ' + nm.line + '; as an operand it stands for its address';
        return t === 'label-ref' ? tok.text + ' is not defined in this program' : null;
      }
      if (t === 'number') return numberHint(tok.text);
      return null;
    }
    function hoverRowsFor(idx, col, includeToken, all) {
      var rows = [], arr = diagMap.get(idx + 1);
      if (arr) arr.forEach(function (d) {
        if (all || (!d.global && ((col >= d.col - 1 && col < d.col - 1 + d.len) || (col >= lines[idx].length && d.col - 1 >= lines[idx].length)))) rows.push({ sev: d.severity, text: d.msg, hint: d.hint });
      });
      if (includeToken) {
        var tok = tokenAt(idx, col);
        if (tok && tok.type !== 'ws' && tok.type !== 'comment' && tok.type !== 'punct') {
          var info = { type: tok.type, text: tok.text, start: tok.start, end: tok.end, line: idx + 1, col: tok.start + 1, mnemonic: tok.type.indexOf('op-') === 0 ? tok.text.toUpperCase() : null };
          var txt;
          if (typeof opts.hover === 'function') { txt = safeCall(opts.hover, info); if (txt == null) txt = builtinHover(tok); }
          else txt = builtinHover(tok);
          if (typeof txt === 'string' && txt) rows.push({ sev: null, text: txt });
        }
      }
      return rows;
    }
    function hit(clientX, clientY) {
      if (M.dirty) measure();
      var r = ta.getBoundingClientRect();
      var x = clientX - r.left - M.border + ta.scrollLeft - M.padL, y = clientY - r.top - M.border + ta.scrollTop - M.padT;
      if (y < 0) return null;
      var idx = Math.floor(y / M.lh);
      if (idx >= lines.length) return null;
      var vc = Math.floor(x / M.cw);
      if (x < 0) return null;
      var col = idxFromVisCol(lines[idx], vc);
      var eol = vc >= visCol(lines[idx], lines[idx].length);
      return { idx: idx, col: eol ? lines[idx].length : col, eol: eol };
    }
    on(ta, 'mousemove', function (ev) {
      if (ev.buttons) { hideTip(); return; }
      var h = hit(ev.clientX, ev.clientY);
      if (!h) { hideTip(); return; }
      var key = h.idx + ':' + (h.eol ? 'eol' : h.col);
      var tok = !h.eol && tokenAt(h.idx, h.col);
      if (tok) key = h.idx + ':' + tok.start;
      if (key === tipKey) return;
      hideTip();
      tipKey = key;
      var lh = M.lh, cw = M.cw;
      var run = function () {
        tipTimer = null;
        if (destroyed) return;
        var rows = hoverRowsFor(h.idx, h.eol ? lines[h.idx].length : h.col, !h.eol);
        if (!rows.length) return;
        var r = ta.getBoundingClientRect();
        var x0 = r.left + M.border + M.padL - ta.scrollLeft + visCol(lines[h.idx], tok ? tok.start : h.col) * cw;
        var y0 = r.top + M.border + M.padT - ta.scrollTop + h.idx * lh;
        showTip(rows, { left: x0, top: y0, bottom: y0 + lh });
      };
      if (hoverDelay <= 0) run(); else tipTimer = setTimeout(run, hoverDelay);
    });
    on(ta, 'mouseleave', hideTip);
    on(gutter, 'mouseover', function (ev) {
      var cell = ev.target && ev.target.closest ? ev.target.closest('.vne-gl') : null;
      if (!cell) return;
      var idx = glEls.indexOf(cell);
      if (idx < 0 || !diagMap.get(idx + 1)) { hideTip(); return; }
      var key = 'g' + idx;
      if (key === tipKey) return;
      hideTip(); tipKey = key;
      var rect = cell.getBoundingClientRect();
      var run = function () {
        tipTimer = null;
        if (destroyed) return;
        var rows = hoverRowsFor(idx, -1, false, true);
        if (rows.length) showTip(rows, { left: rect.right + 4, top: rect.top, bottom: rect.bottom });
      };
      if (hoverDelay <= 0) run(); else tipTimer = setTimeout(run, hoverDelay);
    });
    on(gutter, 'mouseleave', hideTip);
    function showTipAtCaret() {
      var c = getCursor(), idx = c.line - 1, col = c.col - 1;
      var rows = hoverRowsFor(idx, Math.min(col, Math.max(0, lines[idx].length - 1)), true);
      if (col > 0 && col <= lines[idx].length && !rows.length) rows = hoverRowsFor(idx, col - 1, true);
      if (!rows.length) { announce('No help for this position.'); return; }
      var r = ta.getBoundingClientRect();
      var x0 = r.left + M.border + M.padL - ta.scrollLeft + visCol(lines[idx], col) * M.cw;
      var y0 = r.top + M.border + M.padT - ta.scrollTop + idx * M.lh;
      showTip(rows, { left: x0, top: y0, bottom: y0 + M.lh });
      announce(rows.map(function (r2) { return (r2.sev ? r2.sev + ': ' : '') + r2.text; }).join('. '));
    }

    /* screen reader announcements */
    var annToggle = false;
    function announce(text) {
      annToggle = !annToggle;
      sr.textContent = text + (annToggle ? '' : '\u00A0');
    }
    function scheduleDiagAnnounce(lineNo) {
      clearTimeout(diagTimer);
      if (!diagMap.get(lineNo)) return;
      diagTimer = setTimeout(function () {
        if (destroyed) return;
        var arr = diagMap.get(lineNo);
        if (arr) announce('Line ' + lineNo + ': ' + arr.map(function (d) { return d.severity + ', ' + d.msg; }).join('. '));
      }, 400);
    }

    /* -- autocomplete -- */
    var pop = { open: false, items: [], active: 0, from: 0, to: 0, lineIdx: 0, forced: false };

    function defaultCompletions(ctx) {
      var out = [], p = ctx.prefix.toLowerCase(), i;
      var all = [];
      if (ctx.position === 'mnemonic') {
        if (p.charAt(0) === '.') {
          DIR_ORDER.forEach(function (d) {
            if (ctx.section === 'text' && DIRS[d].dataOnly) return;
            all.push({ label: d, detail: DIRS[d].sum, insert: d, rank: 0 });
          });
        } else if (ctx.section !== 'data') {
          MN_ORDER.forEach(function (k) {
            var m = MN[k];
            if (m.ext && isa === 'lecture') return;
            var detail = m.sum.replace(/\s{2}\(.*$/, '');
            if (m.ext && !isa) detail += '  [extended]';
            all.push({ label: k, detail: detail, insert: k + (m.arg ? ' ' : ''), rank: 0 });
          });
        }
      } else {
        if (ctx.noOperand) return [];
        ctx.labels.forEach(function (l) {
          all.push({ label: l.name, detail: (l.kind === 'code' ? 'code label' : 'data') + ', line ' + l.line, insert: l.name, rank: 0 });
        });
      }
      for (i = 0; i < all.length; i++) {
        var lab = all[i].label.toLowerCase();
        if (!p) { out.push(all[i]); continue; }
        if (lab === p) { all[i].rank = -1; out.push(all[i]); }
        else if (lab.indexOf(p) === 0) { all[i].rank = 0; out.push(all[i]); }
        else if (p.length >= 2 && lab.indexOf(p) > 0) { all[i].rank = 1; out.push(all[i]); }
      }
      out.sort(function (x, y) { return x.rank - y.rank; });   // stable in modern engines
      return out;
    }

    function completionContext(forced) {
      if (ta.selectionStart !== ta.selectionEnd) return null;
      var off = ta.selectionStart, p = posOfOffset(off), text = lines[p.idx];
      var before = text.slice(0, p.col);
      var prefix = /[.A-Za-z0-9_]*$/.exec(before)[0];
      var after = /^[A-Za-z0-9_]*/.exec(text.slice(p.col))[0];
      if (!forced && (!prefix || after)) return null;
      if (/^[0-9]/.test(prefix)) return null;
      var wordStart = p.col - prefix.length;
      var sec = secStart[p.idx];
      var toks = tokenizeLine(before.slice(0, wordStart), { section: sec, isa: isa });
      var sig = [], k;
      for (k = 0; k < toks.length; k++) {
        var tt = toks[k];
        if (tt.type === 'comment') return null;
        if (tt.type === 'ws' || tt.type === 'label-def' || (tt.type === 'punct' && tt.text === ':')) continue;
        sig.push(tt);
      }
      if (tokenizeLine(before, { section: sec, isa: isa }).some(function (t) { return t.type === 'comment'; })) return null;
      var position = sig.length === 0 ? 'mnemonic' : 'operand';
      var noOperand = false;
      if (position === 'operand' && sec !== 'data') {
        var first = sig[0];
        var info = first.type.indexOf('op-') === 0 ? MN[first.text.toUpperCase()] : null;
        if (info && (!info.arg || sig.length > 1)) noOperand = true;       // HALT / NOP, or the operand is already there
        if (first.type === 'directive') noOperand = false;
      }
      var nm = names();
      return {
        prefix: prefix, position: position, line: p.idx + 1, text: text, section: sec, col: p.col + 1,
        labels: nm.list, noOperand: noOperand, _from: wordStart, _to: p.col + after.length, _idx: p.idx
      };
    }

    function updateCompletion(auto, forced) {
      if (destroyed || composing || readOnly) return;
      var wasForced = pop.open && pop.forced;
      var ctx = completionContext(!!forced || wasForced);
      if (!ctx) { closePopup(); return; }
      var pubCtx = { prefix: ctx.prefix, position: ctx.position, line: ctx.line, text: ctx.text, section: ctx.section, col: ctx.col, labels: ctx.labels.map(function (l) { return { name: l.name, line: l.line, kind: l.kind }; }) };
      var list = null;
      if (typeof opts.getCompletions === 'function') list = safeCall(opts.getCompletions, pubCtx);
      if (!Array.isArray(list)) list = defaultCompletions(ctx);
      var items = [];
      for (var i = 0; i < list.length && items.length < 50; i++) {
        var it = list[i];
        if (!it) continue;
        if (typeof it === 'string') it = { label: it };
        if (typeof it.label !== 'string' || !it.label) continue;
        items.push({ label: it.label, detail: typeof it.detail === 'string' ? it.detail : '', insert: typeof it.insert === 'string' ? it.insert : it.label });
      }
      if (!items.length) { closePopup(); return; }
      if (!forced && !wasForced && items.length === 1 && items[0].label.toLowerCase() === ctx.prefix.toLowerCase() && items[0].insert.trim() === items[0].label) { closePopup(); return; }
      pop.items = items;
      pop.from = ctx._from; pop.to = ctx._to; pop.lineIdx = ctx._idx;
      pop.forced = !!forced || wasForced;
      if (!pop.open || pop.active >= items.length) pop.active = 0;
      if (!wasForced || !pop.open) pop.active = 0;
      pop.open = true;
      renderPopup();
      positionPopup();
    }
    function renderPopup() {
      var e = popEl;
      e.textContent = '';
      pop.items.forEach(function (it, i) {
        var o = el('div', 'vne-opt', e);
        o.id = id + '-opt' + i;
        o.setAttribute('role', 'option');
        o.setAttribute('aria-selected', i === pop.active ? 'true' : 'false');
        var l = el('span', 'vne-opt-l', o); l.textContent = it.label;
        if (it.detail) { var d = el('span', 'vne-opt-d', o); d.textContent = it.detail; }
        o.setAttribute('data-i', String(i));
      });
      e.hidden = false;
      ta.setAttribute('role', 'combobox');
      ta.setAttribute('aria-expanded', 'true');
      ta.setAttribute('aria-controls', e.id);
      ta.setAttribute('aria-autocomplete', 'list');
      ta.setAttribute('aria-haspopup', 'listbox');
      ta.setAttribute('aria-activedescendant', id + '-opt' + pop.active);
      announce(pop.items.length + (pop.items.length === 1 ? ' suggestion' : ' suggestions'));
    }
    function positionPopup() {
      if (!pop.open) return;
      if (M.dirty) measure();
      var r = ta.getBoundingClientRect();
      var lt = lines[pop.lineIdx] || '';
      var x = r.left + M.border + M.padL - ta.scrollLeft + visCol(lt, Math.min(pop.from, lt.length)) * M.cw;
      var yTop = r.top + M.border + M.padT - ta.scrollTop + pop.lineIdx * M.lh;
      var e = popEl, vw = win.innerWidth || doc.documentElement.clientWidth, vh = win.innerHeight || doc.documentElement.clientHeight;
      var pr = e.getBoundingClientRect();
      var left = Math.min(Math.max(4, x), Math.max(4, vw - pr.width - 4));
      var top = yTop + M.lh + 2;
      if (top + pr.height > vh - 4 && yTop - pr.height - 2 >= 4) top = yTop - pr.height - 2;
      placeFixed(e, left, top);
    }
    function closePopup() {
      if (!pop.open) return;
      pop.open = false; pop.forced = false;
      popEl.hidden = true; popEl.textContent = '';
      ta.removeAttribute('role');
      ta.removeAttribute('aria-expanded');
      ta.removeAttribute('aria-controls');
      ta.removeAttribute('aria-autocomplete');
      ta.removeAttribute('aria-haspopup');
      ta.removeAttribute('aria-activedescendant');
    }
    function movePopup(delta) {
      var n = pop.items.length;
      if (!n) return;
      var next;
      if (Math.abs(delta) === 1) next = (pop.active + delta + n) % n;
      else next = Math.max(0, Math.min(n - 1, pop.active + delta));
      pop.active = next;
      var opts2 = popEl.children;
      for (var i = 0; i < opts2.length; i++) opts2[i].setAttribute('aria-selected', i === next ? 'true' : 'false');
      ta.setAttribute('aria-activedescendant', id + '-opt' + next);
      var o = opts2[next];
      if (o) {
        if (o.offsetTop < popEl.scrollTop) popEl.scrollTop = o.offsetTop;
        else if (o.offsetTop + o.offsetHeight > popEl.scrollTop + popEl.clientHeight) popEl.scrollTop = o.offsetTop + o.offsetHeight - popEl.clientHeight;
      }
    }
    function acceptPopup(index) {
      if (!pop.open) return false;
      var it = pop.items[index == null ? pop.active : index];
      if (!it) { closePopup(); return false; }
      var ls = lineStartOffset(pop.lineIdx), from = ls + pop.from, to = ls + pop.to;
      var ins = it.insert;
      var nextCh = ta.value.charAt(to);
      if (/ $/.test(ins) && (nextCh === ' ' || nextCh === '\t')) ins = ins.replace(/ $/, '');
      closePopup();
      edit(from, to, ins, from + ins.length, from + ins.length, false);
      return true;
    }
    on(popEl, 'mousedown', function (ev) { ev.preventDefault(); });
    on(popEl, 'click', function (ev) {
      var o = ev.target && ev.target.closest ? ev.target.closest('.vne-opt') : null;
      if (o) acceptPopup(parseInt(o.getAttribute('data-i'), 10));
    });
    on(popEl, 'mousemove', function (ev) {
      var o = ev.target && ev.target.closest ? ev.target.closest('.vne-opt') : null;
      if (!o) return;
      var i = parseInt(o.getAttribute('data-i'), 10);
      if (i !== pop.active) movePopup(i - pop.active);
    });

    /* -- global listeners -- */
    var pageScroll = function () { if (destroyed) return; if (pop.open) positionPopup(); if (!tip.hidden) hideTip(); };
    on(win, 'scroll', pageScroll, { capture: true, passive: true });
    /* Layout work triggered by observers runs from a frame callback (or a short timer when frames are throttled):
       changing the box size inside a ResizeObserver callback would raise the "loop completed with undelivered
       notifications" error. */
    var layoutQueued = false, layoutTimer = null;
    cleanups.push(function () { clearTimeout(layoutTimer); layoutQueued = false; });
    function queueLayout() {
      if (layoutQueued || destroyed) return;
      layoutQueued = true;
      var run = function () {
        if (!layoutQueued) return;
        layoutQueued = false; clearTimeout(layoutTimer);
        if (!destroyed) { M.dirty = true; layout(); if (pop.open) positionPopup(); }
      };
      if (win.requestAnimationFrame) win.requestAnimationFrame(run);
      layoutTimer = setTimeout(run, 60);
    }
    on(win, 'resize', queueLayout);
    on(win, 'co1005-view', queueLayout);
    var ro = null;
    if (win.ResizeObserver) {
      ro = new win.ResizeObserver(function () { if (!destroyed) queueLayout(); });
      ro.observe(shell);
      ro.observe(code);
      ro.observe(probe);            // its width follows the font size (A- / A+ buttons)
      cleanups.push(function () { ro.disconnect(); });
    }
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(function () { if (!destroyed) queueLayout(); });

    /* -- public operations -- */
    function normalise(v) { return String(v == null ? '' : v).replace(/\r\n?/g, '\n'); }

    function setValue(text, o) {
      if (destroyed) return;
      text = normalise(text);
      var keep = !!(o && o.keepHistory);
      closePopup(); hideTip();
      if (keep) {
        if (text === ta.value) return;
        var d = diffRange(ta.value, text);
        preSel = [ta.selectionStart, ta.selectionEnd];
        ta.value = text;
        var caret = d.pos + d.ins.length;
        ta.setSelectionRange(caret, caret);
        sync();
        record(false);
        revealCaret();
      } else {
        bps = new Set(); activeLine = null; diags = []; diagMap = new Map();
        ta.value = text;
        ta.setSelectionRange(0, 0);
        lines = new Array(lines.length);          // no line matches: the diff rebuilds every row
        sync();
        hist = []; hi = 0; histText = ta.value; mergeOK = false;
        ta.scrollTop = 0; ta.scrollLeft = 0; syncScroll();
      }
      lastCursor = null;
    }
    function setDiagnostics(list) {
      if (destroyed) return;
      var touched = new Set();
      diagMap.forEach(function (_, ln) { touched.add(ln); });
      var out = [];
      if (Array.isArray(list)) {
        for (var i = 0; i < list.length && out.length < 500; i++) {
          var d = list[i];
          if (!d || typeof d !== 'object') continue;
          var sev = d.severity === 'warning' || d.severity === 'info' ? d.severity : 'error';
          var ln = Math.floor(Number(d.line));
          if (!isFinite(ln)) continue;
          var global = ln < 1 || ln > lines.length;
          var lineNo = ln < 1 ? 1 : ln > lines.length ? lines.length : ln;
          var col = Math.floor(Number(d.col)); if (!isFinite(col) || col < 1) col = 1;
          var len = Math.floor(Number(d.len));
          if (!isFinite(len) || len < 1) {
            var tok = tokenAt(lineNo - 1, col - 1);
            len = tok && tok.type !== 'ws' ? tok.end - (col - 1) : 1;
          }
          if (len > 100000) len = 100000;
          out.push({ line: lineNo, col: col, len: len, severity: sev, msg: String(d.msg == null ? '' : d.msg), hint: d.hint == null ? '' : String(d.hint), kind: d.kind == null ? '' : String(d.kind), global: global || d.line === 0 || Number(d.line) === 0 });
        }
      }
      diags = out; rebuildDiagMap();
      diagMap.forEach(function (_, ln) { touched.add(ln); });
      touched.forEach(function (ln) { refreshLine(ln - 1); });
      layout();
      hideTip();
      var c = lastCursor ? lastCursor.line : getCursor().line;
      if (doc.activeElement === ta) scheduleDiagAnnounce(c);
    }
    function setActiveLine(n, o) {
      if (destroyed) return;
      var old = activeLine;
      var v = (n === null || n === undefined) ? null : Math.floor(Number(n));
      if (v !== null && (!isFinite(v) || v < 1 || v > lines.length)) v = null;
      activeLine = v; activeKind = o && o.kind === 'next' ? 'next' : 'running';
      if (old !== null) refreshClasses(old - 1);
      if (v !== null) {
        refreshClasses(v - 1);
        if (M.dirty) measure();
        var top = M.padT + (v - 1) * M.lh, bottom = top + M.lh;
        var viewTop = ta.scrollTop, viewBottom = ta.scrollTop + ta.clientHeight;
        if (top < viewTop || bottom > viewBottom) {
          ta.scrollTop = Math.max(0, top + M.lh / 2 - ta.clientHeight / 2);
          syncScroll();
        }
      }
    }
    function setBreakpoints(set) {
      if (destroyed) return;
      var arr = [];
      if (set && typeof set.forEach === 'function') set.forEach(function (v) { arr.push(v); });
      var next = new Set();
      arr.forEach(function (v) { var n = Math.floor(Number(v)); if (isFinite(n) && n >= 1 && n <= lines.length) next.add(n); });
      var touched = new Set();
      bps.forEach(function (n) { if (!next.has(n)) touched.add(n); });
      next.forEach(function (n) { if (!bps.has(n)) touched.add(n); });
      bps = next;
      touched.forEach(function (n) { refreshClasses(n - 1); });
    }
    function setReadOnly(flag) {
      readOnly = !!flag;
      ta.readOnly = readOnly;
      if (readOnly) ta.setAttribute('aria-readonly', 'true'); else ta.removeAttribute('aria-readonly');
      root.classList.toggle('is-readonly', readOnly);
      if (readOnly) closePopup();
    }
    function insertAtCursor(text) {
      if (destroyed || readOnly) return;
      text = normalise(text);
      var s = ta.selectionStart, e = ta.selectionEnd;
      edit(s, e, text, s + text.length, s + text.length, false);
      ta.focus();
    }
    function gotoLine(n, o) {
      if (destroyed) return;
      n = Math.floor(Number(n));
      if (!isFinite(n)) return;
      n = Math.max(1, Math.min(lines.length, n));
      var ls = lineStartOffset(n - 1), le = ls + lines[n - 1].length;
      ta.focus({ preventScroll: true });
      if (o && o.select) ta.setSelectionRange(ls, le); else ta.setSelectionRange(ls, ls);
      revealOffset(ls, true);
      reportCursor();
    }
    function destroy() {
      if (destroyed) return;
      destroyed = true;
      clearTimeout(tipTimer); clearTimeout(diagTimer);
      cleanups.forEach(function (f) { try { f(); } catch (e) { /* ignore */ } });
      cleanups.length = 0;
      if (root.parentNode) root.parentNode.removeChild(root);
      lineEls = []; glEls = [];
      destroyedText = ta.value;
    }
    var destroyedText = '';

    var api = {
      element: root,
      textarea: ta,
      getValue: function () { return destroyed ? destroyedText : ta.value; },
      setValue: setValue,
      focus: function (o) { if (!destroyed) ta.focus(o); },
      insertAtCursor: insertAtCursor,
      getCursor: function () { return destroyed ? null : getCursor(); },
      gotoLine: gotoLine,
      setDiagnostics: setDiagnostics,
      setActiveLine: setActiveLine,
      setBreakpoints: setBreakpoints,
      getBreakpoints: function () { return new Set(bps); },
      toggleBreakpoint: function (n) { return destroyed ? false : toggleBreakpoint(n); },
      setReadOnly: setReadOnly,
      isReadOnly: function () { return readOnly; },
      undo: undo,
      redo: redo,
      canUndo: function () { return !readOnly && hi > 0; },
      canRedo: function () { return !readOnly && hi < hist.length; },
      setIsa: setIsa,
      getLineCount: function () { return lines.length; },
      refresh: function () { if (!destroyed) { M.dirty = true; layout(); } },
      destroy: destroy,
      isDestroyed: function () { return destroyed; }
    };

    /* -- initial state -- */
    var first = buildNodes(0, 1);
    code.insertBefore(first.l[0], spacer); gList.insertBefore(first.g[0], gSpacer);
    lineEls = first.l; glEls = first.g;
    var init = normalise(opts.value);
    ta.value = init;
    ta.setSelectionRange(0, 0);
    lines = new Array(1);     // force the diff to rebuild the first line with the real content
    sync();
    histText = ta.value;
    if (opts.readOnly) setReadOnly(true);
    if (opts.breakpoints) setBreakpoints(opts.breakpoints);
    layout();
    return api;
  }

  var VNEditor = {
    version: 1,
    create: create,
    tokenizeLine: tokenizeLine,
    highlightLine: highlightLine,
    CATEGORY: CATEGORY,
    MNEMONICS: (function () {
      var o = {};
      MN_ORDER.forEach(function (k) { o[k] = { type: MN[k].type, operand: MN[k].arg, extended: MN[k].ext, summary: MN[k].sum }; });
      return Object.freeze(o);
    })(),
    DIRECTIVES: Object.freeze(DIR_ORDER.slice())
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = VNEditor;
  else global.VNEditor = VNEditor;
})(typeof window !== 'undefined' ? window : this);
