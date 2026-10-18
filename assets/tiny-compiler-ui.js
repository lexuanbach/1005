/* Tiny compiler lab — UI for Chapter 8 (mount point #tc-root).
   Stages: 1 Source -> 2 Tokens & tree -> 3 Assembly -> 4 Machine code -> 5 Run (on the vn-machine engine). */
(function (global) {
  'use strict';
  if (typeof document === 'undefined') return;
  var VN = global.VNMachine, TC = global.TinyCompiler;

  function mount() {
    var host = document.getElementById('tc-root');
    if (!host || !VN || !TC) return;
    function el(tag, cls, html) { var n = document.createElement(tag); if (cls) n.className = cls; if (html !== undefined) n.innerHTML = html; return n; }
    function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
    function nums(t) { return (String(t).match(/-?\d+/g) || []).map(function (x) { return parseInt(x, 10); }); }

    var panel = el('div', 'run-panel tc-lab');
    panel.appendChild(el('h4', '', 'Tiny compiler: C++ subset → toy machine code <span class="tc-label">teaching machine, not x86 / ARM</span>'));

    var stages = ['1 Source', '2 Tokens & tree', '3 Assembly', '4 Machine code', '5 Run'];
    var tabs = el('div', 'tc-stages'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Compilation stages');
    var tabBtns = stages.map(function (s, i) {
      var b = el('button', 'tc-stage', esc(s)); b.type = 'button'; b.setAttribute('role', 'tab'); b.id = 'tc-tab-' + i;
      b.setAttribute('aria-controls', 'tc-pane-' + i);
      b.addEventListener('click', function () { show(i); });
      b.addEventListener('keydown', function (e) {
        var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!d) return;
        var j = i + d; if (j < 0 || j >= stages.length || tabBtns[j].disabled) return;
        show(j); tabBtns[j].focus(); e.preventDefault();
      });
      tabs.appendChild(b); return b;
    });
    panel.appendChild(tabs);
    var panes = stages.map(function (s, i) {
      var p = el('div', 'tc-pane'); p.id = 'tc-pane-' + i; p.setAttribute('role', 'tabpanel'); p.setAttribute('aria-labelledby', 'tc-tab-' + i);
      panel.appendChild(p); return p;
    });
    var status = el('div', 'sim-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    status.style.marginTop = '0.7rem';
    panel.appendChild(status);
    host.appendChild(panel);

    /* pane 0: source */
    var sel = el('select', 'preset-select'); sel.setAttribute('aria-label', 'Example C++ programs');
    TC.PRESETS.forEach(function (p, i) { var o = el('option'); o.value = String(i); o.textContent = p.name; sel.appendChild(o); });
    var srcLab = el('label', 'field-label', 'Your C++ (a tiny subset: int, + −, cin, cout, if / else, while)'); srcLab.setAttribute('for', 'tc-src');
    var src = el('textarea', 'tc-src'); src.id = 'tc-src'; src.rows = 11; src.spellcheck = false;
    var inLab = el('label', 'field-label', 'Input for cin (numbers)'); inLab.setAttribute('for', 'tc-input');
    var inBox = el('input', 'tc-input'); inBox.id = 'tc-input'; inBox.type = 'text'; inBox.autocomplete = 'off'; inBox.spellcheck = false;
    var bComp = el('button', 'btn primary', 'Compile'); bComp.type = 'button';
    var row0 = el('div', 'ex-actions'); row0.appendChild(sel); row0.appendChild(bComp);
    var errBox = el('div', 'note danger'); errBox.style.display = 'none';
    var row1 = el('div', 'vn-inrow'); row1.appendChild(inLab); row1.appendChild(inBox);
    [row0, srcLab, src, row1, errBox].forEach(function (n) { panes[0].appendChild(n); });
    panes[0].insertBefore(el('p', 'tc-what', 'The compiler reads text. Everything that follows — tokens, assembly, bits — is produced from this text and nothing else. Edit it, or pick an example, then press <b>Compile</b>.'), row0);

    var res = null, finished = null, stRun = null;

    function show(i) {
      tabBtns.forEach(function (b, k) { b.setAttribute('aria-selected', k === i ? 'true' : 'false'); b.tabIndex = k === i ? 0 : -1; });
      panes.forEach(function (p, k) { p.hidden = k !== i; });
      if (i === 4 && res && res.ok && !stRun) resetRun();
    }
    function setEnabled(on) { tabBtns.forEach(function (b, k) { if (k) b.disabled = !on; }); }

    function srcLines() { return src.value.split('\n'); }
    function cText(n) { var l = srcLines()[n - 1]; return l === undefined ? '' : l.replace(/\s+$/, ''); }

    function compile() {
      res = TC.compile(src.value); stRun = null;
      if (!res.ok) {
        setEnabled(false);
        errBox.style.display = '';
        var e = res.errors[0];
        errBox.innerHTML = '<span class="note-tag">Compile error' + (e.line ? ' · line ' + e.line : '') + '</span>' + esc(e.msg) +
          (e.line ? '<br><code>' + esc(cText(e.line)) + '</code>' : '') + '<br>No tokens-to-machine-code beyond this point: a compiler that finds an error produces no program at all.';
        status.textContent = 'Compilation failed — nothing was produced.'; status.className = 'sim-status error';
        show(0); return;
      }
      errBox.style.display = 'none';
      setEnabled(true);
      buildTokens(); buildAsm(); buildMachine(); panes[4].innerHTML = ''; buildRunShell();
      status.textContent = 'Compiled: ' + res.tokens.length + ' tokens, ' + res.asm.codeLen + ' instruction words and ' + (res.asm.mem.length - res.asm.codeLen - res.asm.cells.filter(function (c) { return c.kind === 'free'; }).length) + ' data cells on a ' + res.asm.size + '-cell toy machine. Click the stage tabs to see each step.';
      status.className = 'sim-status done';
      show(1);
    }

    function buildTokens() {
      var p = panes[1];
      p.innerHTML = '<p class="tc-what"><b>Lexing:</b> the text is cut into tokens — keywords, names, numbers, symbols. <b>Parsing:</b> the tokens are arranged into a tree that says what the program means. Whitespace and comments are already gone.</p>';
      var byLine = {};
      res.tokens.forEach(function (t) { (byLine[t.line] = byLine[t.line] || []).push(t); });
      Object.keys(byLine).forEach(function (ln) {
        var d = el('div', 'tc-line');
        d.appendChild(el('b', '', 'line ' + ln));
        byLine[ln].forEach(function (t) {
          var kind = t.t === 'kw' ? 'kw' : t.t === 'num' ? 'num' : t.t === 'id' ? 'id' : '';
          var lab = { kw: 'keyword', num: 'number', id: 'name', op: 'operator', punct: 'symbol', str: 'text' }[t.t];
          d.appendChild(el('span', 'tc-tok ' + kind, esc(t.v) + '<small>' + lab + '</small>'));
        });
        p.appendChild(d);
      });
      p.appendChild(el('div', 'field-label', 'Parse tree (outline)'));
      var pre = el('pre', 'tc-ast'); pre.textContent = TC.astOutline(res.ast); p.appendChild(pre);
    }

    function buildAsm() {
      var p = panes[2];
      p.innerHTML = '<p class="tc-what"><b>Code generation:</b> every C++ statement becomes a few toy-ISA instructions. The left column shows which C++ line each assembly line came from. Comments after <code>;</code> are the compiler\'s own notes. This is a teaching instruction set (slide 34), not what <code>g++</code> emits.</p>';
      var wrap = el('div', 'tbl-scroll'); var t = el('table', 'tbl');
      var h = '<caption class="vn-sr">C++ lines and the assembly they produced</caption><thead><tr><th scope="col">C++ line</th><th scope="col">Assembly</th><th scope="col">Note</th></tr></thead><tbody>';
      var prev = -1;
      res.asmLines.forEach(function (l) {
        var first = l.cline !== prev && l.cline > 0; prev = l.cline;
        var left = first ? '<span class="mono">' + l.cline + ':</span> <code>' + esc(cText(l.cline).trim()) + '</code>' : (l.cline === 0 ? '<span class="vn-fine">(added by the compiler)</span>' : '');
        h += '<tr' + (first ? ' class="tc-grp"' : '') + '><td>' + left + '</td><td class="mono">' + esc(l.text) + '</td><td class="vn-fine">' + esc(l.comment) + '</td></tr>';
      });
      t.innerHTML = h + '</tbody>'; wrap.appendChild(t); p.appendChild(wrap);
    }

    function buildMachine() {
      var p = panes[3], a = res.asm, ab = a.addrBits;
      p.innerHTML = '<p class="tc-what"><b>Assembling:</b> each mnemonic becomes a ' + a.wordBits + '-bit word — a 4-bit opcode followed by a ' + ab + '-bit address — and each name becomes a cell number. ' +
        'The program is now plain numbers in memory, exactly like data (Chapter 7). The machine has ' + a.size + ' cells, so addresses need ' + ab + ' bits. Names are gone: <code>sum</code> is just a cell number now.</p>';
      var map = TC.mapping(res), byAddr = {};
      map.forEach(function (m) { byAddr[m.addr] = m; });
      var wrap = el('div', 'tbl-scroll'); var t = el('table', 'tbl');
      var h = '<caption class="vn-sr">Memory image of the compiled program</caption><thead><tr><th scope="col">Cell</th><th scope="col">Bits (opcode | address)</th><th scope="col">Hex</th><th scope="col">Decimal</th><th scope="col">Meaning</th><th scope="col">From C++ line</th></tr></thead><tbody>';
      for (var i = 0; i < a.size; i++) {
        var w = a.mem[i], c = a.cells[i];
        if (c.kind === 'free') continue;
        var m = byAddr[i], meaning, from;
        if (c.kind === 'code') {
          var d = VN.decode(w, ab);
          meaning = d.op.arg ? d.op.name + ' ' + d.addr + (a.names[d.addr] ? ' (' + a.names[d.addr] + ')' : '') : d.op.name;
          from = m && m.cline ? m.cline : '—';
          if (m && m.of > 1) meaning += '  (part ' + m.part + ' of ' + m.of + ' for ' + esc(m.asm) + ')';
        } else { meaning = 'data: ' + (a.names[i] || '') + ' = ' + w; from = res.asmLines[c.line - 1] ? (res.asmLines[c.line - 1].cline || '—') : '—'; }
        h += '<tr><td class="mono">' + i + '</td><td class="mono">' + (VN.bits(w, ab) || 'n/a') + '</td><td class="mono">' + (VN.hex(w, ab) || 'n/a') + '</td><td class="mono">' + w + '</td><td class="mono">' + esc(meaning) + '</td><td class="mono">' + from + '</td></tr>';
      }
      t.innerHTML = h + '</tbody>'; wrap.appendChild(t); p.appendChild(wrap);
    }

    var outBox, refBox, badge, traceBox, regLine;
    function buildRunShell() {
      var p = panes[4];
      p.innerHTML = '<p class="tc-what"><b>Execution:</b> the machine of Chapter 7 now runs these words with its fetch–decode–execute cycle. Compare what it prints with what the C++ program means. The input numbers are read from the box on the Source tab.</p>';
      var bar = el('div', 'ex-actions');
      var bRun = el('button', 'btn primary', 'Run'), bStep = el('button', 'btn ghost', 'Step one instruction'), bRes = el('button', 'btn ghost small', 'Reset');
      [bRun, bStep, bRes].forEach(function (b) { b.type = 'button'; bar.appendChild(b); });
      p.appendChild(bar);
      regLine = el('p', 'mono vn-fine'); p.appendChild(regLine);
      var cols = el('div', 'tc-run-cols');
      var b1 = el('div', 'tc-box'); b1.innerHTML = '<h5>Toy machine printed</h5>'; outBox = el('div', 'mono'); b1.appendChild(outBox);
      var b2 = el('div', 'tc-box'); b2.innerHTML = '<h5>The C++ program means (reference interpreter)</h5>'; refBox = el('div', 'mono'); b2.appendChild(refBox);
      cols.appendChild(b1); cols.appendChild(b2); p.appendChild(cols);
      badge = el('div'); p.appendChild(badge);
      p.appendChild(el('div', 'field-label', 'Instruction trace (latest 40)'));
      traceBox = el('div', 'tbl-scroll tc-trace'); p.appendChild(traceBox);
      bRun.addEventListener('click', function () { ensureRun(); VN.run(stRun); renderRun(); });
      bStep.addEventListener('click', function () { ensureRun(); VN.stepInstr(stRun); renderRun(); });
      bRes.addEventListener('click', function () { resetRun(); });
    }
    function ensureRun() {
      if (!stRun) stRun = VN.create(res.asm, { input: nums(inBox.value), maxInstr: 20000 });
      else stRun.input = nums(inBox.value);
    }
    function resetRun() { stRun = VN.create(res.asm, { input: nums(inBox.value), maxInstr: 20000 }); renderRun(); }

    function renderRun() {
      var s = stRun, ref = TC.interpret(res.ast, nums(inBox.value));
      regLine.textContent = 'PC=' + s.pc + '  R=' + s.r + '  GT=' + s.gt + ' EQ=' + s.eq + ' LT=' + s.lt + '   instructions executed: ' + s.instrCount;
      outBox.textContent = s.out.length ? s.out.join('  ') : '(nothing yet)';
      refBox.textContent = ref.error ? '(' + ref.error + ')' : (ref.out.length ? ref.out.join('  ') : '(prints nothing)');
      var rows = s.trace.slice(-40).map(function (t) { return '<tr><td class="mono">' + t.at + '</td><td class="mono">' + esc(t.text) + (t.arg !== null && res.asm.names[t.arg] ? '  (' + esc(res.asm.names[t.arg]) + ')' : '') + '</td><td class="mono">' + t.r + '</td><td class="mono">' + t.gt + t.eq + t.lt + '</td></tr>'; }).join('');
      traceBox.innerHTML = '<table class="tbl"><thead><tr><th scope="col">Cell</th><th scope="col">Instruction</th><th scope="col">R after</th><th scope="col">GT EQ LT</th></tr></thead><tbody>' + rows + '</tbody></table>';
      var msg, cls;
      if (s.error) { msg = s.error; cls = 'error'; }
      else if (s.waiting) { msg = 'The program wants more input than the box contains. Add numbers on the Source tab and run again.'; cls = 'waiting'; }
      else if (s.halted) { msg = 'HALT reached after ' + s.instrCount + ' instructions.'; cls = 'done'; }
      else { msg = 'Running — ' + s.instrCount + ' instructions so far.'; cls = 'running'; }
      status.textContent = msg; status.className = 'sim-status ' + cls;
      if (s.halted && !ref.error) {
        var same = JSON.stringify(s.out) === JSON.stringify(ref.out);
        badge.innerHTML = same ? '<span class="tc-badge ok">Same output: the compiled program behaves like the C++</span>' : '<span class="tc-badge bad">Different output</span>';
      } else badge.innerHTML = '';
    }

    function loadPreset(i) {
      var p = TC.PRESETS[i]; src.value = p.src; inBox.value = p.input; compile();
    }
    sel.addEventListener('change', function () { loadPreset(+sel.value); });
    bComp.addEventListener('click', function () { compile(); });
    src.addEventListener('keydown', function (e) {
      if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); var s = src.selectionStart; src.value = src.value.slice(0, s) + '    ' + src.value.slice(src.selectionEnd); src.selectionStart = src.selectionEnd = s + 4; }
    });
    loadPreset(0);
    show(0);
  }
  document.addEventListener('DOMContentLoaded', mount);
})(window);
