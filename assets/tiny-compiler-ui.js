/* Tiny compiler lab — UI for Chapter 8 (mount point #tc-root).
   Stages: 1 Source -> 2 Tokens & tree -> 3 Assembly -> 4 Machine code -> 5 Run (on the vn-machine engine).
   The Source stage is a small workbench: example catalogue (assets/tc-examples.js) with a story for each program, a code editor with line numbers and live
   diagnostics (assets/tc-editor.js), autosaved draft + "My programs" (assets/tc-store.js), download / open / copy link and the hand-off to the Chapter 7 machine
   (assets/tc-share.js).  Pure compiler logic lives in assets/tiny-compiler.js; this file only builds DOM.  User text is always escaped before it goes into HTML. */
(function (global) {
  'use strict';
  if (typeof document === 'undefined') return;
  var VN = global.VNMachine, TC = global.TinyCompiler, ED = global.TcEditor, SH = global.TcShare, ST = global.TcStore;

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function nums(t) { return (String(t).match(/-?\d+/g) || []).map(function (x) { return parseInt(x, 10); }); }
  function cap(s) { s = String(s); return s.charAt(0).toUpperCase() + s.slice(1); }
  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'program'; }

  function mount() {
    var host = document.getElementById('tc-root');
    if (!host || !VN || !TC) return;
    function el(tag, cls, html) { var n = document.createElement(tag); if (cls) n.className = cls; if (html !== undefined) n.innerHTML = html; return n; }
    function btn(label, cls, title) { var b = el('button', 'btn ' + (cls || 'ghost small')); b.type = 'button'; b.textContent = label; if (title) b.title = title; return b; }

    var EXAMPLES = TC.EXAMPLES || TC.PRESETS.map(function (p) { return { key: p.key, cat: 'basics', name: p.name, blurb: '', level: 1, input: p.input, src: p.src, story: '', look: [], tryIt: [], tests: [] }; });
    var CATS = TC.CATEGORIES || [{ id: 'basics', name: 'Examples', blurb: '' }];
    var LEVELS = TC.LEVELS || ['', 'Starter', 'Intermediate', 'Challenge'];
    var store = ST ? ST.forBrowser() : null;
    var GUARDS = [[20000, '20,000 (default)'], [200000, '200,000'], [2000000, '2,000,000']];
    var guard = GUARDS[0][0];

    var panel = el('div', 'run-panel tc-lab');
    panel.appendChild(el('h4', '', 'Tiny compiler: C++ subset → toy machine code <span class="tc-label">teaching machine, not x86 / ARM</span>'));

    /* the toolchain as blocks: tokens, tree, assembly, machine words and CPU cycles travel between them (assets/compiler-flow.js) */
    var flow = null, flowHost = null;
    if (global.CompilerFlow) {
      flowHost = el('div', 'cf-lab');
      panel.appendChild(flowHost);
      flow = global.CompilerFlow.create(flowHost, { uid: 'lab', speedKey: 'co1005-cf-speed' });
      flow.blank('Press Compile (on the Source tab) and watch your program travel through the toolchain, block by block.');
    }

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

    /* ───── pane 0: source ───── */
    var grid = el('div', 'tc-src-grid'), colL = el('div', 'tc-col-edit'), colR = el('div', 'tc-col-info');
    grid.appendChild(colL); grid.appendChild(colR); panes[0].appendChild(grid);

    var pick = el('div', 'tc-pick');
    var selLab = el('label', 'tc-sr', 'Example programs'); selLab.setAttribute('for', 'tc-example');
    var sel = el('select', 'preset-select'); sel.id = 'tc-example'; sel.setAttribute('aria-label', 'Example C++ programs');
    var optOwn = el('option'); optOwn.value = ''; optOwn.textContent = '— my own program —'; sel.appendChild(optOwn);
    CATS.forEach(function (c) {
      var g = el('optgroup'); g.label = c.name;
      EXAMPLES.forEach(function (x) { if (x.cat === c.id) { var o = el('option'); o.value = x.key; o.textContent = x.name; g.appendChild(o); } });
      if (g.children.length) sel.appendChild(g);
    });
    var bReset = btn('Reset to example', 'ghost small', 'Throw away your changes and show the original example again'); bReset.hidden = true;
    pick.appendChild(selLab); pick.appendChild(sel); pick.appendChild(bReset);
    colL.appendChild(pick);

    var tools = el('div', 'tc-tools'); tools.setAttribute('role', 'group'); tools.setAttribute('aria-label', 'Program actions');
    var bComp = btn('Compile', 'primary', 'Compile and watch the program travel through the toolchain (Ctrl/Cmd + Enter)');
    bComp.className = 'btn primary';
    var bSave = btn('Save', 'ghost small', 'Keep this program in My programs (below)');
    var bDown = btn('Download .cpp', 'ghost small', 'Save the C++ text as a file');
    var fileIn = el('input'); fileIn.type = 'file'; fileIn.accept = '.cpp,.cc,.cxx,.c,.txt,text/plain'; fileIn.hidden = true; fileIn.setAttribute('aria-label', 'Open a C++ file');
    var bOpen = btn('Open file…', 'ghost small', 'Load a .cpp file from your computer');
    var bLink = btn('Copy link', 'ghost small', 'A link that opens this page with your program loaded');
    var aVn = el('a', 'btn ghost small', 'Open in the Von Neumann Machine ↗'); aVn.target = '_blank'; aVn.rel = 'noopener'; aVn.title = 'Open the assembly this compiler produced in the Chapter 7 workbench';
    [bComp, bSave, bDown, bOpen, bLink, aVn].forEach(function (b) { tools.appendChild(b); }); tools.appendChild(fileIn);
    colL.appendChild(tools);
    var note = el('p', 'tc-note'); note.setAttribute('role', 'status'); colL.appendChild(note);
    var linkBox = el('input', 'tc-linkbox'); linkBox.type = 'text'; linkBox.readOnly = true; linkBox.hidden = true; linkBox.setAttribute('aria-label', 'Link to this program (select and copy)');
    colL.appendChild(linkBox);

    var srcLab = el('div', 'field-label', 'Your C++ (a small subset — the list below says what is supported)'); srcLab.id = 'tc-src-label';
    // program text size: the site-wide code-size preference (same steps and storage key as assets/course.js); the editor re-measures on 'co1005-view'
    var SCALES = [0.85, 1, 1.15, 1.3, 1.5, 1.75, 2];
    function scaleIdx() {
      var v = NaN;
      try { v = parseFloat(localStorage.getItem('co1005-code-scale')); } catch (e) { /* storage blocked */ }
      if (SCALES.indexOf(v) < 0) v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--code-scale'));
      if (!(v > 0)) v = 1;
      var best = 0; SCALES.forEach(function (c, i) { if (Math.abs(c - v) < Math.abs(SCALES[best] - v)) best = i; });
      return best;
    }
    var fMinus = btn('A−', 'ghost small'), fPlus = btn('A+', 'ghost small'), fPct = el('span', 'tc-fpct'); fPct.setAttribute('aria-hidden', 'true');
    var fGroup = el('div', 'tc-fontgrp'); fGroup.setAttribute('role', 'group'); fGroup.setAttribute('aria-label', 'Program text size');
    fGroup.appendChild(fMinus); fGroup.appendChild(fPct); fGroup.appendChild(fPlus);
    function paintFont() {
      var i = scaleIdx(), pct = Math.round(SCALES[i] * 100) + '%';
      fPct.textContent = pct; fMinus.disabled = i === 0; fPlus.disabled = i === SCALES.length - 1;
      fMinus.title = 'Smaller program text (now ' + pct + ')'; fPlus.title = 'Larger program text (now ' + pct + ')';
      fMinus.setAttribute('aria-label', fMinus.title); fPlus.setAttribute('aria-label', fPlus.title);
    }
    function stepFont(d) {
      var v = SCALES[Math.min(SCALES.length - 1, Math.max(0, scaleIdx() + d))];
      try { localStorage.setItem('co1005-code-scale', String(v)); } catch (e) { /* storage blocked: still applies for this visit */ }
      document.documentElement.style.setProperty('--code-scale', String(v));
      window.dispatchEvent(new Event('co1005-view'));
      paintFont();
    }
    fMinus.addEventListener('click', function () { stepFont(-1); });
    fPlus.addEventListener('click', function () { stepFont(1); });
    window.addEventListener('co1005-view', paintFont); paintFont();
    var srcHead = el('div', 'tc-edhead'); srcHead.appendChild(srcLab); srcHead.appendChild(fGroup);
    colL.appendChild(srcHead);
    var edHost = el('div', 'tc-edhost'); colL.appendChild(edHost);
    var ed;
    if (ED) ed = ED.create(edHost, { id: 'tc-src', label: 'C++ source code', describedBy: 'tc-diag tc-ed-help', onChange: onEdit, onCompile: function () { compileNow(true); } });
    else {                                                     // minimal fallback: a plain textarea
      var plain = el('textarea', 'tc-src'); plain.id = 'tc-src'; plain.rows = 12; plain.spellcheck = false; plain.setAttribute('aria-label', 'C++ source code'); edHost.appendChild(plain);
      plain.addEventListener('input', function () { onEdit(plain.value); });
      plain.addEventListener('keydown', function (e) { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); compileNow(true); } });
      ed = { getValue: function () { return plain.value; }, setValue: function (v) { plain.value = v; }, setDiagnostics: function () {}, setActiveLine: function () {}, goTo: function () { plain.focus(); }, focus: function () { plain.focus(); } };
    }
    colL.appendChild(el('p', 'tc-hint', '<span id="tc-ed-help"><kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>Enter</kbd> compiles. <kbd>Tab</kbd> indents; press <kbd>Esc</kbd> and then <kbd>Tab</kbd> to leave the editor.</span>'));

    var diagBox = el('div', 'tc-diag'); diagBox.id = 'tc-diag'; diagBox.setAttribute('role', 'region'); diagBox.setAttribute('aria-label', 'Compiler messages for your program');
    var diagLive = el('div', 'tc-sr'); diagLive.setAttribute('role', 'status'); diagLive.setAttribute('aria-live', 'polite');
    colL.appendChild(diagBox); colL.appendChild(diagLive);

    var inRow = el('div', 'tc-inrow');
    var inLab = el('label', 'field-label', 'Input for cin (numbers)'); inLab.setAttribute('for', 'tc-input');
    var inBox = el('input', 'tc-input'); inBox.id = 'tc-input'; inBox.type = 'text'; inBox.autocomplete = 'off'; inBox.spellcheck = false;
    inRow.appendChild(inLab); inRow.appendChild(inBox); colL.appendChild(inRow);
    var expectP = el('p', 'tc-expect'); colL.appendChild(expectP);

    /* right column: the example card */
    var card = el('div', 'tc-card'); colR.appendChild(card);

    /* below the grid: what is supported, my programs */
    var more = el('details', 'tc-more'); more.appendChild(el('summary', '', 'What this compiler understands (and what it does not)'));
    var sub = el('div', 'tc-subset');
    var yes = el('div'), no = el('div');
    yes.appendChild(el('h6', 'yes', '✓ Supported')); no.appendChild(el('h6', 'no', '✗ Not supported (you get an error with line, column and a hint)'));
    function dl(list) { var d = el('dl'); list.forEach(function (it) { d.appendChild(el('dt', '', esc(it[0]))); d.appendChild(el('dd', '', esc(it[1]))); }); return d; }
    yes.appendChild(dl(TC.SUPPORTED || [])); no.appendChild(dl(TC.UNSUPPORTED || []));
    sub.appendChild(yes); sub.appendChild(no); more.appendChild(sub);
    more.appendChild(el('p', 'tc-fine', 'Numbers are whole numbers that never wrap (a real C++ <code>int</code> wraps at 32 bits). <code>int x;</code> starts at 0 here, but holds garbage in real C++, so the compiler warns when you read a variable before giving it a value. ' +
      '<code>*</code>, <code>/</code> and <code>%</code> have no instruction in the lecture ISA: the compiler writes small loops of ADD / SUBTRACT for them (inline, or one shared copy per operation when the program would not fit in 256 cells). ' +
      'Division by zero stops the program at a HALT labelled <code>Ldiv0</code> (real C++ would crash).'));
    panes[0].appendChild(el('p', 'tc-summary', '<b>Supported:</b> int · + − * / % ( ) · = += −= *= /= %= ++ −− · cin · cout · endl · if / else if / else · while · for · do-while · break · continue · == != &lt; &lt;= &gt; &gt;= · &amp;&amp; || ! &nbsp; <b class="no">Not supported:</b> text &amp; char, double, bool, arrays, functions, switch, ?: , x++ inside expressions.'));
    panes[0].appendChild(more);

    var progs = el('details', 'tc-more'); progs.appendChild(el('summary', '', 'My programs (kept in this browser only)'));
    var saveRow = el('div', 'tc-saverow');
    var nameLab = el('label', 'tc-sr', 'Program name'); nameLab.setAttribute('for', 'tc-name');
    var nameBox = el('input', 'tc-name'); nameBox.id = 'tc-name'; nameBox.type = 'text'; nameBox.maxLength = 60; nameBox.placeholder = 'Name of this program'; nameBox.autocomplete = 'off';
    var bSave2 = btn('Save', 'primary small'); bSave2.className = 'btn primary small';
    var bSaveNew = btn('Save as new', 'ghost small');
    saveRow.appendChild(nameLab); saveRow.appendChild(nameBox); saveRow.appendChild(bSave2); saveRow.appendChild(bSaveNew);
    progs.appendChild(saveRow);
    var progList = el('div'); progs.appendChild(progList);
    var progNote = el('p', 'tc-note'); progNote.setAttribute('role', 'status'); progs.appendChild(progNote);
    panes[0].appendChild(progs);

    /* ───── state ───── */
    var res = null, stRun = null, liveRes = null, builtFor = null, curKey = '', curProg = null, undoSnap = null, lastLive = '', liveTimer = 0, draftTimer = 0, lineOf = {}, renaming = null, flowLive = false;
    function byKey(k) { for (var i = 0; i < EXAMPLES.length; i++) if (EXAMPLES[i].key === k) return EXAMPLES[i]; return null; }
    function src() { return ed.getValue(); }

    var curTab = 0;
    function show(i) {
      curTab = i;
      tabBtns.forEach(function (b, k) { b.setAttribute('aria-selected', k === i ? 'true' : 'false'); b.tabIndex = k === i ? 0 : -1; });
      panes.forEach(function (p, k) { p.hidden = k !== i; });
      if (i === 4 && res && res.ok && !stRun) resetRun();
      if (i !== 4) ed.setActiveLine(0);
    }
    function setEnabled(on) { tabBtns.forEach(function (b, k) { if (k) b.disabled = !on; }); }
    function say(m, cls) { status.textContent = m; status.className = 'sim-status' + (cls ? ' ' + cls : ''); }
    function setNote(box, msg, cls) { box.textContent = msg || ''; box.className = 'tc-note' + (cls ? ' ' + cls : ''); }

    /* ───── live diagnostics ───── */
    function renderDiag(r, text) {
      var h = '';
      if (!text.trim()) h = '<div class="tc-dg warn"><span class="tc-dg-tag">Empty</span>Type a C++ program, or pick an example above.</div>';
      else if (!r.ok) {
        r.errors.forEach(function (e) {
          var where = e.line ? '<button type="button" class="tc-goto" data-l="' + e.line + '" data-c="' + (e.col || 1) + '">line ' + e.line + (e.col ? ':' + e.col : '') + '</button>' : '';
          h += '<div class="tc-dg err"><span class="tc-dg-tag">Error</span>' + where + esc(cap(e.msg)) + (e.hint ? '<span class="tc-dg-hint">' + esc(e.hint) + '</span>' : '') + '</div>';
        });
        h += '<div class="tc-dg-hint tc-fine">No tokens-to-machine-code beyond this point: a compiler that finds an error produces no program at all.</div>';
      } else {
        var s = r.stats;
        h += '<div class="tc-dg ok"><span class="tc-dg-tag">✓ Compiles</span>' + s.instructions + ' instruction words + ' + s.dataCells + ' data cells = ' + s.used + ' of the ' + s.cells + ' cells of the smallest machine that fits it' + (s.shared ? ' (shared multiply / divide routines)' : '') + '.</div>';
      }
      if (r.warnings) r.warnings.forEach(function (w) {
        var where = w.line ? '<button type="button" class="tc-goto" data-l="' + w.line + '" data-c="' + (w.col || 1) + '">line ' + w.line + (w.col ? ':' + w.col : '') + '</button>' : '';
        h += '<div class="tc-dg warn"><span class="tc-dg-tag">Warning</span>' + where + esc(cap(w.msg)) + '</div>';
      });
      diagBox.innerHTML = h;
      var one = !text.trim() ? 'Empty program' : !r.ok ? 'Error' + (r.errors[0].line ? ' on line ' + r.errors[0].line : '') + ': ' + r.errors[0].msg : 'Compiles' + (r.warnings && r.warnings.length ? ' with ' + r.warnings.length + ' warning' + (r.warnings.length > 1 ? 's' : '') : '');
      if (one !== diagLive.textContent) diagLive.textContent = one;
    }
    diagBox.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button.tc-goto') : null;
      if (b) ed.goTo(+b.getAttribute('data-l'), +b.getAttribute('data-c'));
    });
    function liveCompile() {
      var text = src();
      liveRes = TC.compile(text); lastLive = text;
      renderDiag(liveRes, text);
      ed.setDiagnostics(liveRes.ok ? [] : liveRes.errors, liveRes.warnings || []);
      updateVn();
      var stale = builtFor !== null && builtFor !== text;
      for (var i = 1; i < 5; i++) { var sb = panes[i].querySelector('.tc-stale'); if (sb) sb.hidden = !stale; }
    }
    function updateVn() {
      var r = liveRes, ok = r && r.ok, why = '';
      var l = ok && SH ? SH.vnLink(r.asmText, inBox.value, nameBox.value || (curKey && byKey(curKey) ? byKey(curKey).name : 'Tiny compiler program'), 'chapter-7.html') : null;
      if (!ok) why = 'Fix the compile errors first: there is no assembly to send.';
      else if (!l || !l.ok) why = l ? l.reason : 'Sharing is unavailable.';
      if (l && l.ok) { aVn.href = l.url; aVn.removeAttribute('aria-disabled'); aVn.title = 'Open the assembly this compiler produced in the Chapter 7 workbench' + (l.stripped ? ' (comments left out to keep the link short)' : ''); }
      else { aVn.removeAttribute('href'); aVn.setAttribute('aria-disabled', 'true'); aVn.title = why; }
    }

    function onEdit() {
      // the picture of the toolchain belongs to the old text: stop it and say so
      if (flow && flowLive) { flow.blank('The source changed. Press Compile (Ctrl/Cmd + Enter) to watch the new program travel through the toolchain.'); flowLive = false; }
      ed.setActiveLine(0);
      clearTimeout(liveTimer); liveTimer = setTimeout(liveCompile, 280);
      clearTimeout(draftTimer); draftTimer = setTimeout(saveDraft, 700);
      updateDirty();
    }
    function saveDraft() { if (store) store.saveDraft(src(), inBox.value, curKey); }
    function updateDirty() {
      var x = curKey ? byKey(curKey) : null;
      bReset.hidden = !(x && (src() !== x.src || inBox.value !== x.input));
    }

    /* ───── example card ───── */
    function renderCard() {
      var x = curKey ? byKey(curKey) : null, h = '';
      if (x) {
        h += '<h5>' + esc(x.name) + '<span class="tc-lvl l' + x.level + '">' + esc(LEVELS[x.level] || '') + '</span></h5>';
        if (x.blurb) h += '<p><em>' + esc(x.blurb) + '</em></p>';
        if (x.story) h += '<p>' + esc(x.story) + '</p>';
        if (x.look && x.look.length) h += '<h6>What to look for in the stages</h6><ul>' + x.look.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>';
        if (x.tryIt && x.tryIt.length) h += '<h6>Try this</h6><ul>' + x.tryIt.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>';
        if (x.tests && x.tests.length > 1) {
          h += '<details class="tc-fine"><summary>Checked inputs (' + x.tests.length + ') — click one to use it</summary><table class="tbl tc-tests"><thead><tr><th scope="col">Input</th><th scope="col">Output</th><th scope="col">Instructions</th></tr></thead><tbody>' +
            x.tests.map(function (t, i) { return '<tr><td class="mono"><button type="button" class="btn ghost small tc-use" data-i="' + i + '">' + esc(t.in === '' ? '(none)' : t.in) + '</button></td><td class="mono">' + esc(t.out.length ? t.out.join(' ') : '(nothing)') + '</td><td class="mono">' + t.instr + '</td></tr>'; }).join('') +
            '</tbody></table><p class="tc-fine">Each output was produced by real C++ (g++), the toy machine and the reference interpreter, and all three agreed.</p></details>';
        }
      } else {
        h += '<h5>Your own program</h5><p>Write C++ in the editor. The compiler checks it while you type (errors and warnings appear under the editor), and <b>Compile</b> sends it through the toolchain above.</p>' +
          '<h6>Ideas to start with</h6><ul><li>Pick the closest example, change it a little, and compare the assembly before and after.</li><li>Use <code>for</code>, <code>%</code>, <code>&amp;&amp;</code> or <code>break</code> and read how each one is compiled (tab 3).</li><li>Make a mistake on purpose: a missing <code>;</code>, an undeclared name, a string in <code>cout</code>.</li></ul>' +
          '<p class="tc-fine">Save programs under <em>My programs</em>, download them as .cpp, or <em>Copy link</em> to share one.</p>';
      }
      card.innerHTML = h;
    }
    card.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button.tc-use') : null; if (!b) return;
      var x = byKey(curKey); if (!x) return;
      inBox.value = x.tests[+b.getAttribute('data-i')].in; onInput();
    });
    function renderExpect() {
      var x = curKey ? byKey(curKey) : null, t = null;
      if (x) (x.tests || []).forEach(function (q) { if (!t && nums(q.in).join(' ') === nums(inBox.value).join(' ')) t = q; });
      expectP.innerHTML = t ? 'Expected output for this input: <b>' + esc(t.out.length ? t.out.join('  ') : '(nothing)') + '</b> <span class="tc-fine">(checked with real C++)</span>' : '';
    }
    function onInput() { renderExpect(); updateVn(); updateDirty(); clearTimeout(draftTimer); draftTimer = setTimeout(saveDraft, 700); if (res && res.ok && stRun) { stRun = null; } }
    inBox.addEventListener('input', onInput);
    inBox.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); compileNow(true); } });

    /* ───── loading programs ───── */
    function setProgram(text, input, key, prog, name) {
      var old = src();
      if (old.trim() && old !== text) undoSnap = { src: old, input: inBox.value, key: curKey, prog: curProg, name: nameBox.value };
      ed.setValue(text); inBox.value = input; curKey = key || ''; curProg = prog || null; sel.value = curKey;
      nameBox.value = name !== undefined ? name : (curKey && byKey(curKey) ? byKey(curKey).name : '');
      renderCard(); renderExpect(); updateDirty(); saveDraft();
      compileNow(false);
    }
    function loadExample(key) {
      var x = byKey(key); if (!x) return;
      var replaced = src().trim() && byKey(curKey) ? src() !== byKey(curKey).src : (src().trim() && !curKey);
      setProgram(x.src, x.input, key, null);
      if (replaced) showUndo('Your previous text was replaced.');
      else setNote(note, '');
    }
    function showUndo(msg) {
      note.className = 'tc-note'; note.textContent = msg + ' ';
      var u = btn('Undo', 'ghost small'); u.addEventListener('click', function () {
        if (!undoSnap) return; var s = undoSnap; undoSnap = null;
        ed.setValue(s.src); inBox.value = s.input; curKey = s.key; curProg = s.prog; sel.value = curKey; nameBox.value = s.name || '';
        renderCard(); renderExpect(); updateDirty(); saveDraft(); compileNow(false); setNote(note, 'Restored.', 'good');
      });
      note.appendChild(u);
    }
    sel.addEventListener('change', function () {
      if (sel.value) loadExample(sel.value);
      else { curKey = ''; curProg = null; renderCard(); renderExpect(); updateDirty(); saveDraft(); }
    });
    bReset.addEventListener('click', function () { if (curKey) loadExample(curKey); });

    /* ───── compile: panes + animation ───── */
    function compileNow(animate) {
      var text = src(), nin = nums(inBox.value);
      clearTimeout(liveTimer);
      liveRes = (lastLive === text && liveRes) ? liveRes : TC.compile(text); lastLive = text;
      res = liveRes; stRun = null; builtFor = text;
      renderDiag(res, text); ed.setDiagnostics(res.ok ? [] : res.errors, res.warnings || []); updateVn();
      if (flow) {
        var tr = TC.trace(text, { input: nin, record: 60, maxInstr: guard });
        var fo = { input: nin, onLine: function (line) { ed.setActiveLine(line, true); } };
        if (animate) flow.start(tr, fo); else { fo.autoplay = false; flow.start(tr, fo); }          // paused at the start: Play begins the animation
        flowLive = true;
      }
      for (var i = 0; i < 5; i++) { var sb = panes[i].querySelector('.tc-stale'); if (sb) sb.hidden = true; }
      if (!res.ok) {
        setEnabled(false);
        var e = res.errors[0];
        say('Compilation failed' + (e.line ? ' on line ' + e.line + (e.col ? ', column ' + e.col : '') : '') + ' — nothing was produced.', 'error');
        show(0); if (animate && e.line) ed.goTo(e.line, e.col || 1);
        return;
      }
      setEnabled(true);
      buildTokens(); buildAsm(); buildMachine(); panes[4].innerHTML = ''; buildRunShell();
      lineOf = TC.lineOfAddr(res);
      var s = res.stats;
      say('Compiled: ' + res.tokens.length + ' tokens, ' + res.asm.codeLen + ' instruction words and ' + s.dataCells + ' data cells on a ' + res.asm.size + '-cell toy machine. Click the stage tabs to see each step.', 'done');
      if (animate) show(1); else show(0);
    }
    bComp.addEventListener('click', function () { compileNow(true); });

    function staleBanner() { return '<div class="tc-stale" hidden>The source has changed since this was compiled. Press <b>Compile</b> to refresh this tab.</div>'; }

    function buildTokens() {
      var p = panes[1];
      p.innerHTML = staleBanner() + '<p class="tc-what"><b>Lexing:</b> the text is cut into tokens — keywords, names, numbers, symbols. <b>Parsing:</b> the tokens are arranged into a tree that says what the program means. Whitespace and comments are already gone.</p>';
      var byLine = {};
      res.tokens.forEach(function (t) { (byLine[t.line] = byLine[t.line] || []).push(t); });
      Object.keys(byLine).forEach(function (ln) {
        var d = el('div', 'tc-line');
        d.appendChild(el('b', '', 'line ' + ln));
        byLine[ln].forEach(function (t) {
          var kind = t.t === 'kw' ? 'kw' : t.t === 'num' ? 'num' : t.t === 'id' ? 'id' : '';
          var lab = { kw: 'keyword', num: 'number', id: 'name', op: 'operator', punct: 'symbol', str: 'text' }[t.t];
          var tk = el('span', 'tc-tok ' + kind, esc(t.v) + '<small>' + lab + '</small>'); tk.title = 'line ' + t.line + ', column ' + t.col;
          d.appendChild(tk);
        });
        p.appendChild(d);
      });
      p.appendChild(el('div', 'field-label', 'Parse tree (outline)'));
      var pre = el('pre', 'tc-ast'); pre.textContent = TC.astOutline(res.ast); p.appendChild(pre);
    }
    function cText(n) { var l = src().split('\n')[n - 1]; return l === undefined ? '' : l.replace(/\s+$/, ''); }
    function buildAsm() {
      var p = panes[2];
      p.innerHTML = staleBanner() + '<p class="tc-what"><b>Code generation:</b> every C++ statement becomes a few toy-ISA instructions. The left column shows which C++ line each assembly line came from. Comments after <code>;</code> are the compiler\'s own notes. ' +
        'Rows with a coloured bar are the compiler\'s expansion of an operation the ISA does not have (a loop, a multiply or divide routine, a short-circuit test). This is a teaching instruction set (slide 34), not what <code>g++</code> emits.</p>';
      var wrap = el('div', 'tbl-scroll'); var t = el('table', 'tbl');
      var h = '<caption class="tc-sr">C++ lines and the assembly they produced</caption><thead><tr><th scope="col">C++ line</th><th scope="col">Assembly</th><th scope="col">Note</th></tr></thead><tbody>';
      var prev = -1;
      res.asmLines.forEach(function (l) {
        var first = l.cline !== prev && l.cline > 0; prev = l.cline;
        if (l.explain) h += '<tr class="tc-explain"><td colspan="3"><b>' + esc(l.group === 'logic' ? '&& / ||' : l.group) + ':</b> ' + esc(l.explain) + '</td></tr>';
        var left = first ? '<span class="mono">' + l.cline + ':</span> <code>' + esc(cText(l.cline).trim()) + '</code>' : (l.cline === 0 ? '<span class="tc-fine">(added by the compiler)</span>' : '');
        h += '<tr class="' + (first ? 'tc-grp ' : '') + (l.group && (l.group === 'mul' || l.group === 'div' || l.group === 'mod' || l.group === 'mulsub' || l.group === 'divsub' || l.group === 'mulcall' || l.group === 'divcall') ? 'tc-expand' : '') + '"><td>' + left + '</td><td class="mono">' + esc(l.text) + '</td><td class="tc-fine">' + esc(l.comment) + '</td></tr>';
      });
      t.innerHTML = h + '</tbody>'; wrap.appendChild(t); p.appendChild(wrap);
    }
    function buildMachine() {
      var p = panes[3], a = res.asm, ab = a.addrBits;
      p.innerHTML = staleBanner() + '<p class="tc-what"><b>Assembling:</b> each mnemonic becomes a ' + a.wordBits + '-bit word — a 4-bit opcode followed by a ' + ab + '-bit address — and each name becomes a cell number. ' +
        'The program is now plain numbers in memory, exactly like data (Chapter 7). The machine has ' + a.size + ' cells, so addresses need ' + ab + ' bits. Names are gone: <code>' + esc(a.names[a.dataStart] ? a.names[a.dataStart].split(',')[0] : 'sum') + '</code> is just a cell number now.</p>';
      var map = TC.mapping(res), byAddr = {};
      map.forEach(function (m) { byAddr[m.addr] = m; });
      var wrap = el('div', 'tbl-scroll'); var t = el('table', 'tbl');
      var h = '<caption class="tc-sr">Memory image of the compiled program</caption><thead><tr><th scope="col">Cell</th><th scope="col">Bits (opcode | address)</th><th scope="col">Hex</th><th scope="col">Decimal</th><th scope="col">Meaning</th><th scope="col">From C++ line</th></tr></thead><tbody>';
      for (var i = 0; i < a.size; i++) {
        var w = a.mem[i], c = a.cells[i];
        if (c.kind === 'free') continue;
        var m = byAddr[i], meaning, from;
        if (c.kind === 'code') {
          var d = VN.decode(w, ab);
          meaning = d.op.arg ? d.op.name + ' ' + d.addr + (a.names[d.addr] ? ' (' + a.names[d.addr] + ')' : '') : d.op.name;
          from = m && m.cline ? m.cline : '—';
          if (m && m.of > 1) meaning += '  (part ' + m.part + ' of ' + m.of + ' for ' + m.asm + ')';
        } else { meaning = 'data: ' + (a.names[i] || '') + ' = ' + w; from = res.asmLines[c.line - 1] ? (res.asmLines[c.line - 1].cline || '—') : '—'; }
        h += '<tr><td class="mono">' + i + '</td><td class="mono">' + (VN.bits(w, ab) || 'n/a') + '</td><td class="mono">' + (VN.hex(w, ab) || 'n/a') + '</td><td class="mono">' + w + '</td><td class="mono">' + esc(meaning) + '</td><td class="mono">' + from + '</td></tr>';
      }
      t.innerHTML = h + '</tbody>'; wrap.appendChild(t); p.appendChild(wrap);
    }

    /* ───── run tab ───── */
    var outBox, refBox, badge, traceBox, regLine, guardSel;
    function buildRunShell() {
      var p = panes[4];
      p.innerHTML = staleBanner() + '<p class="tc-what"><b>Execution:</b> the machine of Chapter 7 now runs these words with its fetch–decode–execute cycle. Compare what it prints with what the C++ program means. The input numbers are read from the box on the Source tab. The C++ line of the instruction that just ran is highlighted in the editor.</p>';
      var bar = el('div', 'ex-actions');
      var bRun = el('button', 'btn primary', 'Run'), bStep = el('button', 'btn ghost', 'Step one instruction'), bRes = el('button', 'btn ghost small', 'Reset');
      [bRun, bStep, bRes].forEach(function (b) { b.type = 'button'; bar.appendChild(b); });
      var gl = el('label', 'tc-fine', 'Step guard: '); gl.setAttribute('for', 'tc-guard');
      guardSel = el('select', 'tc-guard'); guardSel.id = 'tc-guard';
      GUARDS.forEach(function (g) { var o = el('option'); o.value = String(g[0]); o.textContent = g[1] + ' instructions'; if (g[0] === guard) o.selected = true; guardSel.appendChild(o); });
      bar.appendChild(gl); bar.appendChild(guardSel);
      p.appendChild(bar);
      regLine = el('p', 'mono tc-fine'); p.appendChild(regLine);
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
      guardSel.addEventListener('change', function () { guard = +guardSel.value; resetRun(); });
    }
    function ensureRun() {
      if (!stRun) stRun = VN.create(res.asm, { input: nums(inBox.value), maxInstr: guard });
      else stRun.input = nums(inBox.value);
    }
    function resetRun() { stRun = VN.create(res.asm, { input: nums(inBox.value), maxInstr: guard }); renderRun(); }

    function renderRun() {
      var s = stRun, ref = TC.interpret(res.ast, nums(inBox.value), { maxSteps: Math.max(200000, guard * 4) });
      var divz = TC.stoppedAtDivZero(res, s);
      regLine.textContent = 'PC=' + s.pc + '  R=' + s.r + '  GT=' + s.gt + ' EQ=' + s.eq + ' LT=' + s.lt + '   instructions executed: ' + s.instrCount + '   (step guard ' + guard.toLocaleString('en-US') + ')';
      outBox.textContent = s.out.length ? s.out.join('  ') : '(nothing yet)';
      refBox.textContent = ref.error ? (ref.out.length ? ref.out.join('  ') + '  ' : '') + '(' + ref.error + ')' : (ref.out.length ? ref.out.join('  ') : '(prints nothing)');
      var last = s.trace.length ? s.trace[s.trace.length - 1] : null;
      ed.setActiveLine(last ? (lineOf[last.at] || 0) : 0, true);
      var rows = s.trace.slice(-40).map(function (t, i, a) {
        return '<tr' + (i === a.length - 1 ? ' class="tc-pc"' : '') + '><td class="mono">' + t.at + '</td><td class="mono">' + esc(t.text) + (t.arg !== null && res.asm.names[t.arg] ? '  (' + esc(res.asm.names[t.arg]) + ')' : '') + '</td><td class="mono">' + (lineOf[t.at] || '—') + '</td><td class="mono">' + t.r + '</td><td class="mono">' + t.gt + t.eq + t.lt + '</td></tr>';
      }).join('');
      traceBox.innerHTML = '<table class="tbl"><thead><tr><th scope="col">Cell</th><th scope="col">Instruction</th><th scope="col">C++ line</th><th scope="col">R after</th><th scope="col">GT EQ LT</th></tr></thead><tbody>' + rows + '</tbody></table>';
      traceBox.scrollTop = traceBox.scrollHeight;                      // keep the instruction that just ran in view
      var msg, cls;
      if (s.error) { msg = s.error; cls = 'error'; }
      else if (s.waiting) { msg = 'The program wants more input than the box contains. Add numbers on the Source tab and run again.'; cls = 'waiting'; }
      else if (divz) { msg = 'Division by zero: the program jumped to the HALT labelled Ldiv0 after ' + s.instrCount + ' instructions. Real C++ would crash here.'; cls = 'error'; }
      else if (s.halted) { msg = 'HALT reached after ' + s.instrCount + ' instructions.'; cls = 'done'; }
      else { msg = 'Running — ' + s.instrCount + ' instructions so far.'; cls = 'running'; }
      say(msg, cls);
      if (s.halted && (!ref.error || (ref.error === 'division by zero' && divz))) {
        var same = JSON.stringify(s.out) === JSON.stringify(ref.out);
        badge.innerHTML = same ? '<span class="tc-badge ok">' + (divz ? 'Same behaviour: both stop at the division by zero after the same output' : 'Same output: the compiled program behaves like the C++') + '</span>' : '<span class="tc-badge bad">Different output</span>';
      } else badge.innerHTML = '';
    }

    /* ───── files, links ───── */
    bDown.addEventListener('click', function () {
      try {
        var name = slug(nameBox.value || (curKey && byKey(curKey) ? byKey(curKey).name : 'program')) + '.cpp';
        var blob = new Blob([src()], { type: 'text/plain;charset=utf-8' }), url = URL.createObjectURL(blob);
        var a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
        setNote(note, 'Downloaded ' + name + '.', 'good');
      } catch (e) { setNote(note, 'This browser would not start the download. Select the text in the editor and copy it instead.', 'bad'); }
    });
    bOpen.addEventListener('click', function () { fileIn.click(); });
    fileIn.addEventListener('change', function () {
      var f = fileIn.files && fileIn.files[0]; if (!f) return;
      if (f.size > 100000) { setNote(note, 'That file is ' + Math.round(f.size / 1000) + ' KB. The compiler accepts programs of at most ' + TC.LIMITS.maxSource + ' characters.', 'bad'); fileIn.value = ''; return; }
      var rd = new FileReader();
      rd.onload = function () {
        var text = String(rd.result).replace(/\r\n?/g, '\n');
        setProgram(text, inBox.value, '', null, f.name.replace(/\.[^.]*$/, '').slice(0, 60));
        sel.value = ''; renderCard();
        setNote(note, 'Opened ' + f.name + (text.length > TC.LIMITS.maxSource ? ' — it is longer than ' + TC.LIMITS.maxSource + ' characters, so the compiler will refuse it.' : '.'), text.length > TC.LIMITS.maxSource ? 'bad' : 'good');
        fileIn.value = '';
      };
      rd.onerror = function () { setNote(note, 'Could not read that file.', 'bad'); };
      rd.readAsText(f);
    });
    function baseUrl() { try { var u = new URL(global.location.href); u.search = ''; u.hash = ''; return u.href; } catch (e) { return 'chapter-8.html'; } }
    bLink.addEventListener('click', function () {
      if (!SH) return;
      var url = SH.programLink(src(), inBox.value, nameBox.value, baseUrl());
      function manual() { linkBox.hidden = false; linkBox.value = url; linkBox.focus(); linkBox.select(); setNote(note, 'Copy the link from the box below (Ctrl/Cmd + C).' + (url.length > 8000 ? ' It is long (' + url.length + ' characters); some chat apps may cut it.' : ''), ''); }
      try {
        if (global.navigator && navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(function () { linkBox.hidden = true; setNote(note, 'Link copied. Anyone who opens it gets this program and this input.', 'good'); }, manual);
        else manual();
      } catch (e) { manual(); }
    });

    /* ───── my programs ───── */
    function renderProgs() {
      progList.innerHTML = '';
      var list = store ? store.list() : [];
      if (!list.length) { progList.appendChild(el('p', 'tc-fine', store ? 'Nothing saved yet. Write a program and press Save.' : 'Saving is not available in this browser.')); return; }
      var t = el('table', 'tc-progs'); t.setAttribute('aria-label', 'Saved programs'); var tb = el('tbody');
      list.forEach(function (it) {
        var tr = el('tr'), td = el('td', 'tc-pname');
        if (renaming === it.id) {
          var inp = el('input', 'tc-name'); inp.type = 'text'; inp.value = it.name; inp.maxLength = 60; inp.setAttribute('aria-label', 'New name for ' + it.name);
          inp.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); var r = store.rename(it.id, inp.value); renaming = null; if (curProg === it.id && r.ok) nameBox.value = r.item.name; renderProgs(); setNote(progNote, r.ok ? 'Renamed.' : 'Could not rename: ' + r.reason, r.ok ? 'good' : 'bad'); }
            else if (e.key === 'Escape') { renaming = null; renderProgs(); }
          });
          td.appendChild(inp); setTimeout(function () { inp.focus(); inp.select(); }, 0);
        } else {
          td.textContent = it.name + (curProg === it.id ? '  (open)' : '');
          td.title = it.src.split('\n').length + ' lines';
        }
        var act = el('td', 'tc-pact');
        var bl = btn('Load', 'ghost small'), br = btn('Rename', 'ghost small'), bd = btn('Delete', 'ghost small');
        bl.setAttribute('aria-label', 'Load ' + it.name); br.setAttribute('aria-label', 'Rename ' + it.name); bd.setAttribute('aria-label', 'Delete ' + it.name);
        bl.addEventListener('click', function () { setProgram(it.src, it.input, '', it.id, it.name); setNote(progNote, 'Loaded “' + it.name + '”.', 'good'); renderProgs(); });
        br.addEventListener('click', function () { renaming = it.id; renderProgs(); });
        bd.addEventListener('click', function () {
          if (bd.getAttribute('data-sure') !== '1') { bd.setAttribute('data-sure', '1'); bd.textContent = 'Really delete?'; setTimeout(function () { if (bd.isConnected) { bd.removeAttribute('data-sure'); bd.textContent = 'Delete'; } }, 4000); return; }
          store.remove(it.id); if (curProg === it.id) curProg = null; renderProgs(); setNote(progNote, 'Deleted “' + it.name + '”.', 'good');
        });
        [bl, br, bd].forEach(function (b) { act.appendChild(b); });
        tr.appendChild(td); tr.appendChild(act); tb.appendChild(tr);
      });
      t.appendChild(tb); progList.appendChild(t);
    }
    function doSave(asNew) {
      if (!store) { setNote(progNote, 'Saving is not available in this browser.', 'bad'); return; }
      var name = nameBox.value.trim() || (curKey && byKey(curKey) ? byKey(curKey).name + ' (mine)' : 'My program');
      var r = store.save({ id: asNew ? null : curProg, name: name, src: src(), input: inBox.value });
      if (!r.ok) { setNote(progNote, 'Not saved: ' + r.reason + '.', 'bad'); setNote(note, 'Not saved: ' + r.reason + '.', 'bad'); return; }
      curProg = r.item.id; nameBox.value = r.item.name; renderProgs();
      progs.open = true;
      setNote(progNote, 'Saved as “' + r.item.name + '”.', 'good'); setNote(note, 'Saved as “' + r.item.name + '” (see My programs below).', 'good');
    }
    bSave.addEventListener('click', function () { doSave(false); });
    bSave2.addEventListener('click', function () { doSave(false); });
    bSaveNew.addEventListener('click', function () { doSave(true); });
    nameBox.addEventListener('input', updateVn);
    nameBox.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); doSave(false); } });

    /* ───── full-screen layout (assets/fs-compiler.css): three columns, editor | toolchain diagram + example card | stage tabs and output.
       Only while the app is full screen: the pieces are moved into three column wrappers and moved back on exit; nothing is re-created. ───── */
    var fsCols = null, fsPrevTab = 0, tab0Label = tabBtns[0].textContent, fsHtml = document.documentElement;
    function fsLayout(on) {
      if (on && !fsCols) {
        fsCols = { l: el('div', 'tc-fs-col tc-fs-left'), m: el('div', 'tc-fs-col tc-fs-mid'), r: el('div', 'tc-fs-col tc-fs-right') };
        fsCols.l.appendChild(colL);
        if (flowHost) fsCols.m.appendChild(flowHost);
        fsCols.m.appendChild(colR); fsCols.m.appendChild(status);
        fsCols.r.appendChild(tabs); panes.forEach(function (p) { fsCols.r.appendChild(p); });
        panel.appendChild(fsCols.l); panel.appendChild(fsCols.m); panel.appendChild(fsCols.r);
        tabBtns[0].textContent = 'Help & programs';
        fsPrevTab = curTab;
        if (res && res.ok) show(1);                                   // the editor is always in view now, so start on the first compiled stage
        if (global.AppFullscreen && AppFullscreen.refit) AppFullscreen.refit();
      } else if (!on && fsCols) {
        var c = fsCols; fsCols = null;
        grid.appendChild(colL); grid.appendChild(colR);
        if (flowHost) panel.appendChild(flowHost);
        panel.appendChild(tabs); panes.forEach(function (p) { panel.appendChild(p); }); panel.appendChild(status);
        [c.l, c.m, c.r].forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); });
        tabBtns[0].textContent = tab0Label;
        if (!tabBtns[fsPrevTab].disabled) show(fsPrevTab);
      }
    }
    function syncFs() { fsLayout(host.classList.contains('fs-active') && fsHtml.classList.contains('fs-on')); }
    if (global.MutationObserver) {
      var fsObs = new MutationObserver(syncFs);
      fsObs.observe(fsHtml, { attributes: true, attributeFilter: ['class'] });
      fsObs.observe(host, { attributes: true, attributeFilter: ['class'] });
    }

    /* ───── start ───── */
    renderProgs();
    var shared = SH ? SH.readProgram(global.location && global.location.search) : null, draft = store ? store.draft() : null;
    if (shared) {
      setProgram(shared.src, shared.input, '', null, shared.name);
      setNote(note, 'Loaded from a shared link' + (shared.name ? ': “' + shared.name + '”' : '') + '. Press Compile to run it through the toolchain.', 'good');
    } else if (draft && draft.src.trim()) {
      var dk = draft.example && byKey(draft.example) ? draft.example : '';
      setProgram(draft.src, draft.input, dk, null);
      undoSnap = null;
      var base = dk ? byKey(dk) : null;
      if (!base || draft.src !== base.src) setNote(note, 'Your last draft was restored' + (dk ? ' (use “Reset to example” to start over).' : '.'), '');
    } else loadExample(EXAMPLES[0].key === 'add' ? 'sum' : EXAMPLES[0].key);
    liveCompile();
    show(0);
    global.TcLab = { compile: compileNow, setProgram: setProgram, loadExample: loadExample, editor: ed, state: function () { return { res: res, key: curKey, prog: curProg, guard: guard }; }, flow: flow };
  }
  document.addEventListener('DOMContentLoaded', mount);
})(window);
