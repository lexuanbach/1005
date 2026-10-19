/* Tiny compiler lab: a small C++ code editor (no libraries).
   A transparent <textarea> sits exactly on top of a syntax-coloured copy of the text, so typing, selection, undo, IME and screen readers all use the browser's own
   textarea; the copy behind it draws colours, line bands (error / warning / "running now") and wavy underlines.  A gutter shows line numbers.
   Both layers use the same font, line height, padding and tab size and never wrap, so they cannot drift apart.
   Keyboard: Enter keeps the indentation (+4 after "{", and splits "{|}" onto three lines), Tab inserts 4 spaces or indents the selected lines, Shift+Tab outdents,
   "}" typed on an indented blank line steps back one level, Ctrl/Cmd+Enter calls onCompile.  Esc then Tab leaves the editor (keyboard users are not trapped).
   Theme: CSS tokens only (see tc-lab.css); the three code themes of the site apply.                                                                              */
(function (global) {
  'use strict';
  if (typeof document === 'undefined') { if (typeof module !== 'undefined') module.exports = { highlightLine: null }; return; }

  var KW = { 'int': 1, 'if': 1, 'else': 1, 'while': 1, 'for': 1, 'do': 1, 'break': 1, 'continue': 1, 'return': 1, 'using': 1, 'namespace': 1, 'std': 1 };
  var IO = { 'cin': 1, 'cout': 1, 'endl': 1, 'main': 1 };
  var RE_W = /[A-Za-z_]\w*/y, RE_D = /\d+/y;
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  /* one line -> [{t: text, c: class}] ; st.block = inside a multi-line comment */
  function segments(line, st) {
    var out = [], i = 0, n = line.length, m;
    function add(t, c) { if (!t) return; var last = out[out.length - 1]; if (last && last.c === c) last.t += t; else out.push({ t: t, c: c }); }
    if (!st.block && /^\s*#/.test(line)) { add(line, 'pp'); return out; }
    while (i < n) {
      if (st.block) {
        var e = line.indexOf('*/', i);
        if (e < 0) { add(line.slice(i), 'cm'); i = n; } else { add(line.slice(i, e + 2), 'cm'); i = e + 2; st.block = false; }
        continue;
      }
      var c = line[i];
      if (c === '/' && line[i + 1] === '/') { add(line.slice(i), 'cm'); i = n; continue; }
      if (c === '/' && line[i + 1] === '*') { st.block = true; add('/*', 'cm'); i += 2; continue; }
      if (c === '"') { var j = line.indexOf('"', i + 1); j = j < 0 ? n : j + 1; add(line.slice(i, j), 'str'); i = j; continue; }
      RE_W.lastIndex = i; RE_D.lastIndex = i;
      if ((m = RE_W.exec(line))) { add(m[0], KW[m[0]] ? 'kw' : IO[m[0]] ? 'io' : ''); i += m[0].length; continue; }
      if ((m = RE_D.exec(line))) { add(m[0], 'num'); i += m[0].length; continue; }
      if ('+-*/%=<>!&|'.indexOf(c) >= 0) { add(c, 'op'); i++; continue; }
      add(c, ''); i++;
    }
    return out;
  }
  /* apply marks [{from,to,cls}] (0-based columns) to segments and return HTML */
  function lineHtml(segs, marks) {
    var html = '', pos = 0;
    segs.forEach(function (s) {
      var a = pos, b = pos + s.t.length, cuts = [a, b];
      marks.forEach(function (mk) { if (mk.from > a && mk.from < b) cuts.push(mk.from); if (mk.to > a && mk.to < b) cuts.push(mk.to); });
      cuts.sort(function (x, y) { return x - y; });
      for (var k = 0; k < cuts.length - 1; k++) {
        if (cuts[k] === cuts[k + 1]) continue;
        var piece = s.t.slice(cuts[k] - a, cuts[k + 1] - a), cls = s.c ? 'tc-t-' + s.c : '';
        marks.forEach(function (mk) { if (cuts[k] >= mk.from && cuts[k + 1] <= mk.to) cls += ' ' + mk.cls; });
        html += cls ? '<span class="' + cls.trim() + '">' + esc(piece) + '</span>' : esc(piece);
      }
      pos = b;
    });
    return html;
  }

  function create(host, opts) {
    opts = opts || {};
    var root = document.createElement('div'); root.className = 'tc-ed';
    var inner = document.createElement('div'); inner.className = 'tc-ed-in';
    var gutter = document.createElement('div'); gutter.className = 'tc-ed-gutter'; gutter.setAttribute('aria-hidden', 'true');
    var main = document.createElement('div'); main.className = 'tc-ed-main';
    var back = document.createElement('pre'); back.className = 'tc-ed-back'; back.setAttribute('aria-hidden', 'true');
    var ta = document.createElement('textarea'); ta.className = 'tc-ed-ta'; ta.spellcheck = false; ta.setAttribute('wrap', 'off');
    ta.setAttribute('autocapitalize', 'off'); ta.setAttribute('autocomplete', 'off'); ta.setAttribute('autocorrect', 'off');
    if (opts.id) ta.id = opts.id;
    if (opts.label) ta.setAttribute('aria-label', opts.label);
    if (opts.describedBy) ta.setAttribute('aria-describedby', opts.describedBy);
    main.appendChild(back); main.appendChild(ta); inner.appendChild(gutter); inner.appendChild(main); root.appendChild(inner); host.appendChild(root);

    var diag = { errors: [], warnings: [] }, activeLine = 0, freeTab = false, lastCount = -1;

    function render() {
      var lines = ta.value.split('\n'), st = { block: false }, html = '', nums = '', i;
      var errBy = {}, warnBy = {};
      diag.errors.forEach(function (e) { if (e.line > 0) (errBy[e.line] = errBy[e.line] || []).push(e); });
      diag.warnings.forEach(function (w) { if (w.line > 0) (warnBy[w.line] = warnBy[w.line] || []).push(w); });
      for (i = 0; i < lines.length; i++) {
        var ln = i + 1, text = lines[i], segs = segments(text, st), marks = [], cls = 'tc-ed-l', ncls = 'tc-ed-n';
        function addMarks(list, mc) {
          list.forEach(function (d) {
            var from = d.col > 0 ? d.col - 1 : text.search(/\S/), to;
            if (from < 0) from = 0;
            to = d.col > 0 ? from + Math.max(1, d.len || 1) : text.replace(/\s+$/, '').length;
            if (to <= from) to = Math.min(text.length, from + 1);
            if (d.col > 0 && from >= text.length) { from = Math.max(0, text.length - 1); to = text.length; }   // "missing ;" sits just after the last character
            marks.push({ from: from, to: Math.min(to, Math.max(text.length, from + 1)), cls: mc });
          });
        }
        if (warnBy[ln]) { cls += ' is-warn'; ncls += ' is-warn'; addMarks(warnBy[ln], 'tc-mk-warn'); }
        if (errBy[ln]) { cls += ' is-err'; ncls += ' is-err'; addMarks(errBy[ln], 'tc-mk-err'); }
        if (ln === activeLine) { cls += ' is-active'; ncls += ' is-active'; }
        var inner = lineHtml(segs, marks);
        // an error that sits just past the end of the line (a missing semicolon) is drawn as a marker after the text
        var past = (errBy[ln] || []).some(function (d) { return d.col > text.length; });
        if (past) inner += '<span class="tc-mk-err tc-mk-end"> </span>';
        html += '<div class="' + cls + '">' + (inner || ' ') + '</div>';
        nums += '<div class="' + ncls + '">' + ln + '</div>';
      }
      html += '<div class="tc-ed-l"> </div>'; nums += '<div class="tc-ed-n"> </div>';          // one spare line to type into
      back.innerHTML = html; gutter.innerHTML = nums;
      if (lines.length !== lastCount) { lastCount = lines.length; }
    }

    function caretLC() {
      var pos = ta.selectionStart, before = ta.value.slice(0, pos), line = before.split('\n').length;
      return { line: line, col: pos - before.lastIndexOf('\n') };
    }
    function metrics() {
      var cs = getComputedStyle(back), lh = parseFloat(cs.lineHeight) || 20, padT = parseFloat(cs.paddingTop) || 0, padL = parseFloat(cs.paddingLeft) || 0;
      var probe = document.createElement('span'); probe.style.cssText = 'visibility:hidden;position:absolute;white-space:pre'; probe.textContent = 'MMMMMMMMMM';
      back.appendChild(probe); var cw = probe.getBoundingClientRect().width / 10 || 8; back.removeChild(probe);
      return { lh: lh, padT: padT, padL: padL, cw: cw };
    }
    function keepCaretVisible() {
      var c = caretLC(), m = metrics();
      var top = m.padT + (c.line - 1) * m.lh, bottom = top + m.lh, left = gutter.offsetWidth + m.padL + (c.col - 1) * m.cw;
      if (top < root.scrollTop) root.scrollTop = top;
      else if (bottom > root.scrollTop + root.clientHeight) root.scrollTop = bottom - root.clientHeight + 4;
      if (left < root.scrollLeft + gutter.offsetWidth) root.scrollLeft = Math.max(0, left - gutter.offsetWidth - 16);
      else if (left + m.cw > root.scrollLeft + root.clientWidth) root.scrollLeft = left + m.cw - root.clientWidth + 24;
    }
    function changed() { render(); keepCaretVisible(); if (opts.onChange) opts.onChange(ta.value); }

    /* editing helpers: execCommand keeps the browser's undo stack; setRangeText is the fallback */
    function insert(text) {
      ta.focus();
      var done = false;
      try { done = document.execCommand && document.execCommand('insertText', false, text); } catch (e) { done = false; }
      if (!done) { ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end'); changed(); }
    }
    function lineStart(pos) { return ta.value.lastIndexOf('\n', pos - 1) + 1; }
    function indentLines(out) {
      var v = ta.value, a = ta.selectionStart, b = ta.selectionEnd, s = lineStart(a), e = b;
      if (e > a && v[e - 1] === '\n') e--;
      var endPos = v.indexOf('\n', e); if (endPos < 0) endPos = v.length;
      var block = v.slice(s, endPos), lines = block.split('\n'), delta0 = 0, deltaAll = 0;
      var changedLines = lines.map(function (l, i) {
        if (!out) { if (i === 0) delta0 = 4; deltaAll += 4; return (l.length || lines.length === 1 ? '    ' : '') + l; }
        var m = /^( {1,4}|\t)/.exec(l); var k = m ? m[0].length : 0; if (i === 0) delta0 = -k; deltaAll -= k; return l.slice(k);
      });
      ta.setSelectionRange(s, endPos);
      var done = false;
      try { done = document.execCommand && document.execCommand('insertText', false, changedLines.join('\n')); } catch (er) { done = false; }
      if (!done) { ta.setRangeText(changedLines.join('\n'), s, endPos, 'end'); }
      ta.setSelectionRange(Math.max(s, a + delta0), Math.max(s, b + deltaAll));
      changed();
    }

    ta.addEventListener('input', changed);
    ta.addEventListener('click', keepCaretVisible);
    ta.addEventListener('keyup', function (e) { if (/^(Arrow|Home|End|Page)/.test(e.key)) keepCaretVisible(); });
    ta.addEventListener('blur', function () { freeTab = false; });
    ta.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { freeTab = true; return; }
      if (e.key !== 'Tab') freeTab = false;
      if ((e.key === 'Enter') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); if (opts.onCompile) opts.onCompile(); return; }
      if (e.key === 'Tab') {
        if (freeTab) { freeTab = false; return; }                                   // Esc, then Tab: move on to the next control
        e.preventDefault();
        var multi = ta.value.slice(ta.selectionStart, ta.selectionEnd).indexOf('\n') >= 0;
        if (e.shiftKey || multi) indentLines(e.shiftKey); else insert('    ');
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        var v = ta.value, a = ta.selectionStart, ls = lineStart(a), cur = v.slice(ls, a), ind = /^[ \t]*/.exec(cur)[0];
        var before = cur.replace(/\s+$/, ''), after = v.slice(ta.selectionEnd).match(/^[ \t]*(.?)/)[1];
        var open = before.slice(-1) === '{';
        if (open && after === '}') insert('\n' + ind + '    \n' + ind);
        else insert('\n' + ind + (open ? '    ' : ''));
        if (open && after === '}') { var p = ta.selectionStart - ind.length - 1; ta.setSelectionRange(p, p); }
        keepCaretVisible();
        return;
      }
      if (e.key === '}' && !e.ctrlKey && !e.metaKey && ta.selectionStart === ta.selectionEnd) {
        var ls2 = lineStart(ta.selectionStart), cur2 = ta.value.slice(ls2, ta.selectionStart);
        if (/^ {4,}$/.test(cur2) && cur2.length % 4 === 0) { e.preventDefault(); ta.setSelectionRange(ta.selectionStart - 4, ta.selectionStart); insert('}'); }
      }
    });

    render();
    var api = {
      el: root, textarea: ta,
      getValue: function () { return ta.value; },
      setValue: function (v) { ta.value = String(v); ta.setSelectionRange(0, 0); root.scrollTop = 0; root.scrollLeft = 0; render(); },
      setDiagnostics: function (errors, warnings) { diag = { errors: errors || [], warnings: warnings || [] }; render(); },
      setActiveLine: function (n, follow) {
        n = n | 0; if (n === activeLine) return;
        activeLine = n; render();
        if (n && follow) {
          var m = metrics(), top = m.padT + (n - 1) * m.lh;
          if (top < root.scrollTop + m.lh || top + 2 * m.lh > root.scrollTop + root.clientHeight) root.scrollTop = Math.max(0, top - root.clientHeight / 2);
        }
      },
      /* put the caret on line:col and make it visible */
      goTo: function (line, col) {
        var lines = ta.value.split('\n'), pos = 0, i;
        for (i = 0; i < line - 1 && i < lines.length; i++) pos += lines[i].length + 1;
        pos += Math.min(Math.max(0, (col || 1) - 1), (lines[line - 1] || '').length);
        ta.focus(); ta.setSelectionRange(pos, pos); keepCaretVisible();
      },
      focus: function () { ta.focus(); },
      lineCount: function () { return ta.value.split('\n').length; }
    };
    return api;
  }

  global.TcEditor = { create: create, segments: segments };
})(typeof window !== 'undefined' ? window : this);
