/* Von Neumann Machine workbench — integration layer (mount point #vn-root) for Chapter 7 and demos/von-neumann-machine.html.
   Glues the engine (vn-machine.js), the data-path diagram (vn-datapath.js), the code editor (vn-editor.js), the store (vn-store.js),
   the example registry (vn-examples*.js), the pure helpers (vn-workbench-lib.js), the dialogs/tabs (vn-workbench-parts.js, vn-workbench-tabs.js).
   In Node it only exports { PRESETS, parseInput } (an existing test relies on that). Test hook: window.VNLab. */
(function (global) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;
  var VN, Examples, Lib;
  if (isNode) {
    VN = require('./vn-machine.js');
    Examples = require('./vn-examples.js');
    require('./vn-examples-a.js'); require('./vn-examples-b.js');
    try { require('./vn-examples-ext.js'); } catch (e) { /* optional */ }
    Lib = require('./vn-workbench-lib.js');
  } else { VN = global.VNMachine; Examples = global.VNExamples; Lib = global.VNWorkbenchLib; }

  var PRESETS = Examples ? Lib.presetsFromRegistry(Examples) : [];
  var parseInput = Lib.parseInput;
  var DEFAULT_EXAMPLE = 'sum3';

  function mount() {
    var host = document.getElementById('vn-root');
    if (!host) return;
    var P = global.VNWorkbenchParts, T = global.VNWorkbenchTabs, Store = global.VNStore, Editor = global.VNEditor, DP = global.VNDatapath;
    if (!P || !T || !Store || !Editor || !DP || !Examples) {
      host.textContent = 'The Von Neumann Machine lab could not start: a script is missing.';
      return;
    }
    var h = P.h, clear = P.clear, btn = P.btn;
    var store = Store.shared();
    var PROGRAMS_BASE = 'co1005-vn-autoload';

    /* ───────────── state ───────────── */
    var S = {
      settings: store.settings.get(),
      name: '', exampleId: null, programId: null,
      baseline: { code: '', input: '' },
      asm: null, st: null, loadedCode: '', lastAsm: null, stale: false,
      autoLoad: true, bps: new Set(), run: null, note: '', pendingDraft: null, draftWarned: false, bannerTag: '', cursorLine: 0, markKey: '', testRows: [], lastAsmCode: null
    };
    try { S.autoLoad = localStorage.getItem(PROGRAMS_BASE) !== '0'; } catch (e) { /* storage blocked */ }
    var timers = { asm: 0, draft: 0 };

    /* ───────────── DOM skeleton ───────────── */
    var root = h('div', { cls: 'vnw run-panel vn-lab' });
    var toasts = P.makeSlot(); toasts.classList.add('vnw-rootToasts');
    var dialogs = [];

    // toolbar
    var bExamples = btn('Examples', 'primary', function () { exDlg.open(bExamples); }, { 'aria-haspopup': 'dialog' });
    var nameInput = h('input', { cls: 'vnw-name', attrs: { type: 'text', maxlength: '60', 'aria-label': 'Program name', placeholder: 'Program name', autocomplete: 'off' }, on: { input: function () { S.name = nameInput.value; scheduleDraft(); } } });
    var dirtyDot = h('span', { cls: 'vnw-dirty', attrs: { hidden: '' }, text: '● Unsaved changes' });
    var bNew = btn('New', 'ghost', function () { newProgram(); });
    var bSave = btn('Save', 'ghost', function () { saveProgram(); }, { title: 'Save to My programs (Ctrl/Cmd+S)' });
    var bMine = btn('My programs', 'ghost', function () { progDlg.open(bMine); }, { 'aria-haspopup': 'dialog' });
    var bShare = btn('Share', 'ghost', function () { shareNow(bShare); }, { title: 'Copy a link that contains this program' });
    var bDown = btn('Download', 'ghost', function () { downloadNow(); }, { title: 'Save the program as an .asm text file' });
    var bOpen = btn('Open…', 'ghost', function () { openFile(); }, { title: 'Open an .asm file from your computer' });
    var bSet = btn('Settings', 'ghost', function () { setDlg.open(bSet); }, { 'aria-haspopup': 'dialog' });
    var autoBox = h('input', { attrs: { type: 'checkbox', id: 'vnw-auto' }, prop: { checked: S.autoLoad }, on: { change: function () {
      S.autoLoad = autoBox.checked; try { localStorage.setItem(PROGRAMS_BASE, S.autoLoad ? '1' : '0'); } catch (e) { /* ignore */ }
      if (S.autoLoad) doAssemble(false); else refreshStaleHint();
    } } });
    var autoLab = h('label', { cls: 'vnw-auto', attrs: { for: 'vnw-auto', title: 'Reload the machine automatically when the code assembles without errors' } }, [autoBox, ' Auto-load']);
    var toolbar = h('div', { cls: 'vnw-toolbar', attrs: { role: 'toolbar', 'aria-label': 'Program tools' } }, [
      h('div', { cls: 'vnw-tg vnw-tg-name' }, [bExamples, nameInput, dirtyDot]),
      h('div', { cls: 'vnw-tg' }, [bNew, bSave, bMine, bShare, bDown, bOpen]), h('div', { cls: 'vnw-tg' }, [bSet, autoLab])]);

    var banner = h('div', { cls: 'vnw-bannerhost' });

    // editor + messages
    var editHost = h('div', { cls: 'vnw-editor' });
    var summary = h('p', { cls: 'vnw-summary', attrs: { role: 'status', 'aria-live': 'polite' } });
    var bAsm = btn('Assemble & load', 'ghost', function () { assembleLoadNow(); }, { title: 'Assemble the code and load it into the machine (Ctrl/Cmd+Enter)' });
    var staleHint = h('p', { cls: 'vnw-stale' });
    var edHint = h('p', { cls: 'vnw-edhint', text: 'Tab indents. To leave the editor with the keyboard press Esc, then Tab. F9 sets a breakpoint, Ctrl/Cmd+Enter assembles, Ctrl+Space suggests.' });
    var msgList = h('ul', { cls: 'vnw-msgs', attrs: { 'aria-label': 'Assembler messages' } });
    // program text size: the same site-wide preference, scale steps and storage key as every other code window (assets/course.js);
    // changing it fires 'co1005-view', which the editor listens to in order to re-measure
    var CODE_SCALES = [0.85, 1, 1.15, 1.3, 1.5, 1.75, 2];
    function currentScale() {
      var v = NaN;
      try { v = parseFloat(localStorage.getItem('co1005-code-scale')); } catch (e) { /* storage blocked */ }
      if (CODE_SCALES.indexOf(v) < 0) { v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--code-scale')); }
      if (!(v > 0)) v = 1;
      var best = 0; CODE_SCALES.forEach(function (c, i) { if (Math.abs(c - v) < Math.abs(CODE_SCALES[best] - v)) best = i; });
      return best;
    }
    var fMinus = btn('A−', 'ghost', function () { stepFont(-1); });
    var fPlus = btn('A+', 'ghost', function () { stepFont(1); });
    var fPct = h('span', { cls: 'vnw-fpct', attrs: { 'aria-hidden': 'true' } });
    var fontGroup = h('div', { cls: 'vnw-fontgrp', attrs: { role: 'group', 'aria-label': 'Program text size' } }, [fMinus, fPct, fPlus]);
    function paintFont() {
      var i = currentScale(), pct = Math.round(CODE_SCALES[i] * 100) + '%';
      fPct.textContent = pct;
      fMinus.disabled = i === 0; fPlus.disabled = i === CODE_SCALES.length - 1;
      fMinus.title = 'Smaller program text (now ' + pct + ')';
      fPlus.title = 'Larger program text (now ' + pct + ')';
      fMinus.setAttribute('aria-label', fMinus.title); fPlus.setAttribute('aria-label', fPlus.title);
    }
    function stepFont(d) {
      var i = Math.min(CODE_SCALES.length - 1, Math.max(0, currentScale() + d)), v = CODE_SCALES[i];
      try { localStorage.setItem('co1005-code-scale', String(v)); } catch (e) { /* storage blocked: still applies for this visit */ }
      document.documentElement.style.setProperty('--code-scale', String(v));
      window.dispatchEvent(new Event('co1005-view'));
      paintFont();
    }
    window.addEventListener('co1005-view', paintFont);
    paintFont();
    var editCol = h('div', { cls: 'vnw-editcol' }, [h('div', { cls: 'vnw-edhead' }, [h('label', { cls: 'field-label', text: 'Assembly source', attrs: { id: 'vnw-srclabel' } }), fontGroup]), editHost,
      edHint, h('div', { cls: 'vnw-asmrow' }, [summary, bAsm]), staleHint, msgList]);
    var notes = h('aside', { cls: 'vnw-notes', attrs: { 'aria-label': 'Notes about this program' } });
    var editRow = h('div', { cls: 'vnw-editrow' }, [editCol, notes]);

    // run bar
    var bMicro = btn('Micro-step', 'primary', function () { microStep(); }, { title: 'One register transfer at a time, with its arrow' });
    var bInstr = btn('Next instruction', 'ghost', function () { play(true); }, { title: 'Play the rest of this instruction' });
    var bPlay = btn('▶ Play', 'ghost', function () { play(false); }, { title: 'Play the program, one arrow after another; stops at HALT, at an error or at a breakpoint' });
    var bPause = btn('⏸ Pause', 'ghost', function () { pause(); }); bPause.disabled = true;
    var bRun = btn('Run to end', 'ghost', function () { runToEnd(); }, { title: 'Run without animation, in short slices so the page stays responsive' });
    var bReset = btn('Reset', 'ghost', function () { resetMachine(); }, { title: 'Back to the start: registers cleared, memory as assembled' });
    var speed = DP.speedControl({ key: 'co1005-vn-speed', initial: 2 });
    var inBox = h('input', { cls: 'vn-input', attrs: { type: 'text', id: 'vn-input', autocomplete: 'off', spellcheck: 'false', 'aria-describedby': 'vnw-inhint' } });
    var inHint = h('span', { cls: 'vnw-inhint', attrs: { id: 'vnw-inhint', role: 'status', 'aria-live': 'polite' } });
    var runBar = h('div', { cls: 'vnw-runbar', attrs: { role: 'group', 'aria-label': 'Run controls' } }, [
      h('div', { cls: 'vnw-runbtns' }, [bMicro, bInstr, bPlay, bPause, bRun, bReset]),
      h('div', { cls: 'vnw-runopts' }, [speed.el, h('div', { cls: 'vnw-inrow vn-inrow' }, [h('label', { cls: 'field-label', text: 'Input queue for IN (numbers)', attrs: { for: 'vn-input' } }), inBox, inHint])])]);

    var phases = h('div', { cls: 'vn-phases', attrs: { 'aria-hidden': 'true' } },
      [['fetch', '1 FETCH'], ['decode', '2 DECODE'], ['execute', '3 EXECUTE']].map(function (p) { return h('span', { text: p[1], attrs: { 'data-p': p[0] } }); }));
    var status = h('div', { cls: 'sim-status vn-status vnw-status', attrs: { role: 'status', 'aria-live': 'polite' } });
    var diagram = h('div', { cls: 'vn-diagram' });
    var dp = DP.create(diagram);
    var outLog = h('span', { cls: 'mono vn-out vnw-outlog', attrs: { 'data-v': 'log' } });
    var outRow = h('div', { cls: 'vnw-outrow' }, [h('span', { cls: 'field-label', text: 'Output log' }), outLog]);

    // tabs
    var ctx = {
      state: function () { return S.st; }, asm: function () { return S.asm; }, settings: function () { return S.settings; },
      format: function (v) { return Lib.formatValue(v, S.settings.base, S.st.wordBits, S.st.wrap); },
      setBase: function (b) { applySettings({ base: b }, true); },
      gotoLine: function (n) { editor.gotoLine(n, { select: true }); },
      insertText: function (t) { editor.focus(); editor.insertAtCursor(t); },
      copy: function (text, okMsg) { copyText(text).then(function (ok) { toast(ok ? (okMsg || 'Copied.') : 'Copying is blocked in this browser. Select the text and copy it yourself.'); }); },
      openSettings: function (opener) { setDlg.open(opener); },
      setCell: setCell,
      testAsm: function () { return Lib.assembleWith(editor.getValue(), S.settings); },
      exampleRows: function () { var it = S.exampleId && Examples.get(S.exampleId); return it ? Lib.exampleTestRows(it) : null; },
      onRowsChanged: function (rows) { S.testRows = rows; scheduleDraft(); },
      recordRun: recordRun, tryInput: function (text) { inBox.value = text; onInputChanged(); resetMachine(); }
    };
    var tabMem = T.memory(ctx), tabList = T.listing(ctx), tabTrace = T.trace(ctx), tabStats = T.stats(ctx), tabTests = T.tests(ctx), tabRef = T.reference(ctx);
    var tabSpecs = [['memory', 'Memory', tabMem], ['listing', 'Listing', tabList], ['trace', 'Trace', tabTrace], ['stats', 'Stats', tabStats], ['tests', 'Tests', tabTests], ['reference', 'Reference', tabRef]];
    var tabsApi = P.makeTabs(tabSpecs.map(function (s) { var panel = h('div', { cls: 'vnw-panel vnw-panel-' + s[0] }, [s[2].el]); s[2].panelEl = panel; return { id: s[0], label: s[1], panel: panel }; }), {
      label: 'Machine views', onSelect: function (id) { var t = byTab(id); if (t && S.st) t.show(); } });
    function byTab(id) { for (var i = 0; i < tabSpecs.length; i++) if (tabSpecs[i][0] === id) return tabSpecs[i][2]; return null; }
    var tabsBox = h('div', { cls: 'vnw-tabs' }, [tabsApi.list, tabsApi.panelsWrap]);

    var fine = h('p', { cls: 'vn-fine vnw-fine', text: 'A teaching model, not a real CPU. Instruction set from slide 34. The slide gives opcode 0101 to both SUBTRACT and DECREMENT, a typo; here DECREMENT is 0110. Four opcode bits allow only 16 instructions, so JUMPGE and JUMPLE are assembler shortcuts for two jumps (unless the extended instruction set is switched on in Settings).' });

    [toolbar, banner, editRow, runBar, phases, status, diagram, outRow, tabsBox, fine, toasts].forEach(function (n) { root.appendChild(n); });
    host.appendChild(root);

    /* ───────────── editor ───────────── */
    var editor = Editor.create(editHost, {
      value: '', label: 'Assembly source code', minRows: 18, maxRows: 28,
      onChange: onEdit,
      onCursor: function (c) { if (c.line !== S.cursorLine) { S.cursorLine = c.line; linkCursor(); } },
      onBreakpoints: function (set) { S.bps = set; },
      onShortcut: function (name) { if (name === 'assemble') assembleLoadNow(); else if (name === 'save') saveProgram(); },
      // a number after LOAD/ADD/... is a cell address: say so on hover (null = the editor's own hover)
      hover: function (info) {
        if (info.type !== 'number') return null;
        return Lib.operandHover(String(curCode().split('\n')[info.line - 1] || ''), info.start, S.settings.isa);
      }
    });
    editor.setIsa(S.settings.isa);
    // keep the editor's own help text (how to leave the editor, shortcuts) and add the assembler summary to it
    editor.textarea.setAttribute('aria-describedby', ((editor.textarea.getAttribute('aria-describedby') || '') + ' vnw-summary-id').trim());
    summary.id = 'vnw-summary-id';

    /* ───────────── helpers ───────────── */
    function toast(msg, o) {
      var slot = toasts;
      for (var i = 0; i < dialogs.length; i++) if (dialogs[i].isOpen()) slot = dialogs[i].slot;
      return P.showIn(slot, msg, o);
    }
    function legacyCopy(text) {
      var prev = document.activeElement, ta = h('textarea', { attrs: { readonly: 'readonly', 'aria-hidden': 'true', tabindex: '-1' }, prop: { value: text } });
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
      document.body.appendChild(ta); ta.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta); if (prev && prev.focus) prev.focus();
      return ok;
    }
    function copyText(text) {
      if (navigator.clipboard && navigator.clipboard.writeText && global.isSecureContext) {
        return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacyCopy(text); });
      }
      return Promise.resolve(legacyCopy(text));
    }
    function download(name, text, mime) {
      var url = URL.createObjectURL(new Blob([text], { type: mime || 'text/plain' }));
      var a = h('a', { attrs: { href: url, download: name } }); a.style.display = 'none';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    }
    function readFile(file, maxBytes, cb) {
      if (!file) return;
      if (file.size > maxBytes) { cb('That file is too big (limit ' + Math.round(maxBytes / 1024) + ' KB).'); return; }
      var fr = new FileReader();
      fr.onload = function () { cb(null, String(fr.result)); };
      fr.onerror = function () { cb('The file could not be read.'); };
      fr.readAsText(file);
    }
    function pickFile(accept, cb, maxBytes) {
      var inp = h('input', { attrs: { type: 'file', accept: accept, 'aria-hidden': 'true', tabindex: '-1' } }); inp.style.display = 'none';
      inp.addEventListener('change', function () {
        readFile(inp.files && inp.files[0], maxBytes || 2000000, function (err, text) { if (err) toast(err); else cb(text); });
        if (inp.parentNode) inp.parentNode.removeChild(inp);
      });
      document.body.appendChild(inp); inp.click();
    }
    function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    function frameYield() { return new Promise(function (r) { setTimeout(r, 0); }); }
    function curCode() { return editor.getValue(); }
    function isDirty() { return curCode() !== S.baseline.code || inBox.value !== S.baseline.input; }
    function syncInput() { if (S.st) S.st.input = parseInput(inBox.value); }
    function exampleOf(id) { return id ? Examples.get(id) : null; }

    /* ───────────── dialogs ───────────── */
    var exDlg = P.examplesBrowser({ Examples: Examples, getCurrentId: function () { return S.exampleId; }, onPick: function (it) { loadExample(it); } });
    var setDlg = P.settingsDialog({ Lib: Lib, getSettings: function () { return S.settings; }, getAsm: function () { return S.asm; },
      apply: function (patch) { return applySettings(patch, true); }, reset: function () { return applySettings(Lib.defaultSettings(), true); } });
    var progDlg = P.programsDialog({ store: store, Lib: Lib, onLoad: function (p) { loadSaved(p); }, onChanged: function () { }, currentId: function () { return S.programId; },
      download: download, pickFile: pickFile });
    var shareDlg = P.shareDialog({ makeLink: makeShareLink, copy: copyText });
    [exDlg, setDlg, progDlg, shareDlg].forEach(function (d) { dialogs.push(d); root.appendChild(d.dlg); });

    /* ───────────── assembling ───────────── */
    function showDiagnostics(asm, code) {
      var list = Lib.diagnosticsOf(asm, Lib.operandNotes(code, asm));
      if (asm.ok) editor.textarea.removeAttribute('aria-invalid'); else editor.textarea.setAttribute('aria-invalid', 'true');
      editor.setDiagnostics(list.map(function (d) { return { line: d.line, col: d.col, len: d.len, severity: d.severity, msg: d.msg, hint: d.hint }; }));
      clear(msgList);
      list.slice(0, 80).forEach(function (d) {
        var sevWord = d.severity === 'error' ? 'Error' : d.severity === 'warning' ? 'Warning' : 'Note';
        var b = h('button', { cls: 'vnw-msg vnw-msg-' + d.severity, attrs: { type: 'button' }, on: { click: function () { if (d.line) editor.gotoLine(d.line, { select: true }); else editor.focus(); } } }, [
          h('span', { cls: 'vnw-sev', text: (d.severity === 'error' ? '✖ ' : d.severity === 'warning' ? '▲ ' : 'ℹ ') + sevWord }),
          h('span', { cls: 'vnw-where', text: Lib.where(d) }),
          h('span', { cls: 'vnw-mt', text: d.msg }),
          d.hint ? h('span', { cls: 'vnw-mhint', text: d.hint }) : null]);
        msgList.appendChild(h('li', null, [b]));
      });
      if (list.length > 80) msgList.appendChild(h('li', { cls: 'vnw-more', text: '… and ' + (list.length - 80) + ' more.' }));
      var text = Lib.summarize(asm);
      if (summary.textContent !== text) summary.textContent = text;
      summary.className = 'vnw-summary ' + (asm.ok ? ((asm.warnings || []).some(function (w) { return w.severity === 'warning'; }) ? 'warn' : 'ok') : 'bad');
    }
    function refreshStaleHint() {
      var code = curCode(), differs = code !== S.loadedCode;
      S.stale = differs;
      var asm = S.lastAsm && S.lastAsmCode === code ? S.lastAsm : null;
      var t = '';
      if (differs) {
        if (asm && !asm.ok) t = 'The code has errors. The machine below still runs the last good version.';
        else if (!S.autoLoad) t = 'Edited. The machine below still runs the previous version: press Assemble & load (Ctrl/Cmd+Enter).';
        else t = 'Assembling…';
      }
      staleHint.textContent = t; staleHint.hidden = !t;
      if (differs) { editor.setActiveLine(null); S.markKey = ''; }
    }
    function doAssemble(loadNow) {
      clearTimeout(timers.asm);
      var code = curCode(), asm = Lib.assembleWith(code, S.settings);
      S.lastAsm = asm; S.lastAsmCode = code;
      showDiagnostics(asm, code);
      if (asm.ok && (loadNow || S.autoLoad)) loadMachine(asm, code);
      else refreshStaleHint();
      return asm;
    }
    function assembleLoadNow() {
      var asm = doAssemble(true);
      if (!asm.ok) { var first = asm.errors[0]; if (first && first.line) editor.gotoLine(first.line, { select: true }); }
      return asm;
    }
    function scheduleAssemble() { clearTimeout(timers.asm); timers.asm = setTimeout(function () { doAssemble(false); }, 400); }

    /* ───────────── loading a program into the machine ───────────── */
    function loadMachine(asm, code) {
      abortRun();
      S.asm = asm; S.loadedCode = code; S.stale = false; S.note = '';
      dp.clear(); clearMemGlow();
      S.st = VN.create(asm, Lib.runOpts(S.settings, parseInput(inBox.value)));
      tabSpecs.forEach(function (s) { s[2].reset(); });
      staleHint.textContent = ''; staleHint.hidden = true;
      S.markKey = '';
      render();
    }
    function resetMachine() {
      if (S.run || !S.asm) return;
      dp.clear(); clearMemGlow(); S.note = '';
      S.st = VN.create(S.asm, Lib.runOpts(S.settings, parseInput(inBox.value)));
      tabSpecs.forEach(function (s) { s[2].reset(); });
      S.markKey = '';
      render();
    }

    /* ───────────── render ───────────── */
    var deferDiagram = false;
    function statusText(st, lm) {
      if (S.note) return S.note;
      if (st.error) return st.error;
      if (st.halted) return 'Halted after ' + st.instrCount + ' instructions (' + st.microCount + ' micro-steps, ' + st.cycles + ' cycles).' + (lm ? ' ' + lm.text : '');
      if (st.waiting) return 'Waiting for input: the IN instruction needs a number. Type it in the input box, then press a step button.';
      if (lm) return lm.phase.toUpperCase() + ' — ' + lm.label + '. ' + lm.text + (lm.memKind && st.memLatency > 1 ? ' (A memory access: ' + st.memLatency + ' cycles.)' : '');
      return 'Ready. PC = ' + st.pc + ': the first instruction will be fetched from cell ' + st.pc + '. Press “Micro-step”.';
    }
    function render() {
      var st = S.st, asm = S.asm, lm = st.lastMicro;
      if (!deferDiagram) dp.setValues(st);
      Array.prototype.forEach.call(phases.children, function (p) {
        p.className = lm && !st.halted && !st.error && !st.waiting && p.getAttribute('data-p') === lm.phase ? 'on' : '';
      });
      var cur = tabsApi.current(), t = cur && byTab(cur);
      if (t) t.update();
      outLog.textContent = outText(st);
      status.textContent = statusText(st, lm);
      status.className = 'sim-status vn-status vnw-status ' + (S.note ? 'waiting' : st.error ? 'error' : st.halted ? 'done' : st.waiting ? 'waiting' : lm ? 'running' : '');
      markEditor();
      updateButtons();
    }
    function outText(st) {
      if (!st.out.length) return '(nothing printed yet)';
      if (st.out.length <= 300) return st.out.join('  ');
      return '… ' + st.out.slice(-300).join('  ') + '   (' + st.out.length + ' numbers in all, last 300 shown)';
    }
    function markEditor() {
      var mk = S.stale ? null : Lib.lineMarker(S.st, S.asm), key = mk ? mk.line + mk.kind : '';
      if (key === S.markKey) return;
      S.markKey = key;
      if (mk) editor.setActiveLine(mk.line, { kind: mk.kind }); else editor.setActiveLine(null);
    }
    function updateButtons() {
      var st = S.st, over = st.halted || !!st.error, busy = !!S.run, active = document.activeElement;
      bMicro.disabled = bInstr.disabled = bPlay.disabled = bRun.disabled = busy || over;
      bReset.disabled = busy; bPause.disabled = !busy;
      if (active && active.disabled && runBar.contains(active)) {
        var to = !bPause.disabled ? bPause : (!bPlay.disabled ? bPlay : bReset);
        to.focus();
      }
      bMicro.title = over ? 'The program has ended: press Reset to run it again' : 'One register transfer at a time, with its arrow';
    }
    function linkCursor() {
      if (!S.st) return;
      var asm = S.asm, addrs = asm && asm.lineToAddrs && !S.stale ? asm.lineToAddrs[S.cursorLine] : null;
      tabMem.setLinked(addrs || []);
    }
    var memWrap = tabMem.el;
    function clearMemGlow() { memWrap.classList.remove('vn-src', 'vn-dst'); }
    function memGlow(flow) {
      clearMemGlow();
      (flow || []).forEach(function (p) { if (p[0] === 'MEM') memWrap.classList.add('vn-src'); if (p[1] === 'MEM') memWrap.classList.add('vn-dst'); });
    }

    /* ───────────── stepping and animation ───────────── */
    function abortRun() { if (S.run) { S.run.cancelled = true; S.run = null; } dp.cancel(); }
    function beginRun() { var tok = { cancelled: false }; S.run = tok; S.note = ''; updateButtons(); return tok; }
    function endRun(tok) { if (S.run === tok) { S.run = null; } }
    // one micro-step with its arrow; resolves true if a step happened
    async function stepOnce(tok) {
      syncInput();
      var m = VN.stepMicro(S.st);
      if (!m) { render(); return false; }
      memGlow(m.flow);
      deferDiagram = true; render(); deferDiagram = false;       // narration + tables now, diagram values after the arrow lands
      await dp.animate(m.flow, S.st, speed.ms());
      if (!tok.cancelled) dp.setValues(S.st);
      return true;
    }
    async function microStep() {
      if (!S.st || S.run) return;
      var tok = beginRun();
      try { await stepOnce(tok); } finally { endRun(tok); render(); }
    }
    async function play(untilBoundary) {
      if (!S.st || S.run) return;
      if (!untilBoundary && speed.ms() === 0) { runToEnd(); return; }
      var tok = beginRun(), st = S.st, skip = Lib.isBoundary(st);
      try {
        while (!tok.cancelled && S.st === st) {
          if (!skip && !untilBoundary && Lib.isBoundary(st)) {
            var ln = Lib.breakpointHit(st, S.asm, S.bps);
            if (ln) { S.note = 'Stopped at breakpoint, line ' + ln + '. Press Play, Next instruction or Micro-step to go on.'; break; }
          }
          var ok = await stepOnce(tok);
          skip = false;
          if (!ok || st.halted || st.error || st.waiting) break;
          if (untilBoundary && !st.queue.length) break;
          await sleep(speed.gap());
        }
      } finally { endRun(tok); render(); }
    }
    async function runToEnd() {
      if (!S.st || S.run) return;
      var tok = beginRun(), st = S.st, asm = S.asm;
      syncInput(); dp.clear(); clearMemGlow();
      status.textContent = 'Running…'; status.className = 'sim-status vn-status vnw-status running';
      var runner = Lib.makeRunner(st, { budgetMs: 20, isStop: function (s) { return Lib.breakpointHit(s, asm, S.bps); } });
      try {
        var res = await Lib.runAsync(runner, frameYield, tok, function (reason) {
          if (reason === 'budget') status.textContent = 'Running… ' + st.instrCount + ' instructions so far.';
        });
        if (res.reason === 'breakpoint') S.note = 'Stopped at breakpoint, line ' + runner.stopInfo + '. Press Play, Next instruction or Micro-step to go on.';
      } catch (e) { S.note = 'The run failed: ' + (e && e.message); }
      finally { endRun(tok); if (S.st === st) { dp.clear(); render(); } }
    }
    function pause() { if (S.run) { S.run.cancelled = true; } dp.cancel(); }

    /* ───────────── memory edits ───────────── */
    function setCell(a, v) {
      var st = S.st;
      if (st.wrap) v = VN.wrapValue(v, st.wordBits);
      st.mem[a] = v; st.lastWrite = a; st.lastRead = null;
      render();
      return null;
    }

    /* ───────────── input box ───────────── */
    function onInputChanged() {
      var bad = Lib.inputProblems(inBox.value);
      inHint.textContent = bad.length ? 'Not whole numbers, ignored: ' + bad.join(', ') : '';
      if (bad.length) inBox.setAttribute('aria-invalid', 'true'); else inBox.removeAttribute('aria-invalid');
      if (S.st && !S.run) { syncInput(); dp.setValues(S.st); }
      updateDirty(); scheduleDraft();
    }
    inBox.addEventListener('input', onInputChanged);

    /* ───────────── programs: examples, saved, files, new ───────────── */
    function capture() {
      return { code: curCode(), input: inBox.value, settings: Object.assign({}, S.settings), name: S.name, exampleId: S.exampleId, programId: S.programId,
               baseline: { code: S.baseline.code, input: S.baseline.input }, testRows: S.testRows.map(function (r) { return { in: r.in, exp: r.exp }; }) };
    }
    function writeDraft(p, dirty) {
      return store.draft.set({ code: p.code, input: p.input, settings: p.settings, exampleId: p.exampleId, name: p.name, dirty: dirty });
    }
    // p: { code, input, settings?, name, exampleId?, programId?, baseline?, testRows? }
    function applyProgram(p, o) {
      o = o || {};
      var snapBanner = null, snapNotStored = false;
      // loading anything closes the "You have unsaved work" banner, so that older draft goes to My programs now (if that fails it stays, with its banner)
      if (S.pendingDraft && S.pendingDraft.fromLoad) movePending();
      if (o.snapshot && isDirty()) {
        var snap = capture();
        // an earlier unsaved draft (offered by the Restore banner) must not be overwritten by this snapshot: move it to My programs first
        if (!S.pendingDraft || movePending()) {
          var wr = writeDraft(snap, true);
          if (wr && wr.ok === false) {
            // storage is blocked or full: nothing was kept anywhere, so only Undo can bring the work back (and the banner must not claim otherwise)
            snapBanner = snap; snapNotStored = true;
          } else {
            // the snapshot is held like a page-load draft: the freshly loaded program is not dirty, so saveDraft() must not clear the slot;
            // when new edits need the slot, the snapshot moves to My programs as "Recovered draft" instead of being deleted
            S.pendingDraft = snap;
            snapBanner = snap;
          }
        } else {
          toast('Your earlier unsaved draft could not be moved to My programs, so the work you just left can only be brought back with Undo.', { ms: 12000 });
          snapBanner = snap;
        }
      }
      abortRun();
      var it = exampleOf(p.exampleId);
      S.name = p.name || ''; S.exampleId = it ? it.id : null; S.programId = p.programId || null;
      S.baseline = p.baseline || { code: p.code, input: p.input || '' };
      if (p.settings) S.settings = Lib.cleanSettings(Object.assign({}, p.settings, { base: S.settings.base }));
      editor.setIsa(S.settings.isa);
      editor.setValue(p.code); S.bps = new Set();
      inBox.value = p.input || '';
      nameInput.value = S.name;
      S.testRows = p.testRows ? p.testRows : (it ? Lib.exampleTestRows(it) : []);
      tabTests.setRows(S.testRows);
      S.cursorLine = 0;
      onInputChanged();
      doAssemble(true);
      renderNotes();
      updateDirty();
      if (!(S.pendingDraft && S.bannerTag === 'draft')) hideBanner();
      if (snapBanner) {
        // not a timed toast: a keyboard user can take as long as needed to reach Undo
        var snap2 = snapBanner, snapNotStoredNow = snapNotStored; snapBanner = null;
        showBanner(snapNotStoredNow ? 'Your unsaved changes could not be stored: this browser is blocking storage or it is full. Undo brings them back right now; Download keeps your work.' : 'Your unsaved changes were kept as a draft.', [
          btn('Undo', 'primary', function () {
            // the work is back in the editor: drop the copy kept for it (still pending, or already saved as "Recovered draft")
            if (S.pendingDraft === snap2) S.pendingDraft = null;
            if (snap2.recoveredId) { store.programs.remove(snap2.recoveredId); if (progDlg.isOpen()) progDlg.paint(); }
            applyProgram(snap2, {}); editor.focus();
          }),
          btn('Dismiss', 'ghost', function () { hideBanner(); nameInput.focus(); })], '', 'snapshot');
      }
      scheduleDraft();
    }
    function loadExample(it) {
      applyProgram({ code: it.src, input: it.input, settings: Lib.settingsForExample(it, S.settings), name: it.title, exampleId: it.id }, { snapshot: true });
      return true;
    }
    function loadSaved(p) {
      applyProgram({ code: p.code, input: p.input, settings: p.settings, name: p.name, programId: p.id }, { snapshot: true });
    }
    function newProgram() {
      var t = Lib.templateProgram();
      applyProgram({ code: t.code, input: t.input, name: '', exampleId: null }, { snapshot: true });
      editor.focus();
    }
    function resetToExample() {
      var it = exampleOf(S.exampleId);
      if (!it) return;
      applyProgram({ code: it.src, input: it.input, settings: Lib.settingsForExample(it, S.settings), name: it.title, exampleId: it.id }, { snapshot: true });
      // the notes panel was rebuilt, so the button that was pressed is gone: put the keyboard on its replacement
      if (resetBtn && resetBtn.isConnected) resetBtn.focus();
    }
    function saveProgram() {
      var code = curCode(), name = (S.name || '').trim() || (exampleOf(S.exampleId) ? exampleOf(S.exampleId).title : 'My program');
      // same name as the saved program: update it in place; another name: keep the old one and save a copy
      var id = S.programId;
      if (id) { var cur = store.programs.get(id); if (!cur || cur.name !== name) id = null; }
      var r = store.programs.save({ id: id || undefined, name: name, code: code, input: inBox.value, settings: S.settings });
      if (!r.ok) { toast(r.error || 'The program could not be saved.'); return r; }
      S.programId = r.id; S.name = r.name; nameInput.value = r.name; S.baseline = { code: code, input: inBox.value };
      updateDirty();
      // an earlier unsaved draft (Restore / Dismiss banner, or a link opened over old work) is never thrown away by saving something else:
      // it moves to My programs as "Recovered draft"; if that fails it stays exactly as stored, with its banner
      var had = !!S.pendingDraft, kept = had && !movePending(true);
      if (!kept) store.draft.clear();
      if (!kept || S.bannerTag !== 'draft') hideBanner();
      toast('Saved “' + r.name + '” to My programs.' + (had && !kept ? ' Your earlier unsaved draft is there too, as “Recovered draft”.' : ''));
      if (progDlg.isOpen()) progDlg.paint();
      return r;
    }
    function downloadNow() {
      var text = Store.toFile({ name: S.name, code: curCode(), input: inBox.value, settings: S.settings });
      download(Store.fileName(S.name || 'program'), text, 'text/plain');
      toast('Downloaded ' + Store.fileName(S.name || 'program') + '.');
    }
    function openFile() {
      pickFile('.asm,.s,.txt,text/plain', function (text) {
        var r = Store.fromFile(text);
        if (r.error) { toast(r.error); return; }
        applyProgram({ code: r.code, input: r.input, settings: r.settings, name: r.name || 'Opened file' }, { snapshot: true });
        toast('Opened “' + (r.name || 'file') + '”.');
      }, 102400);
    }
    function makeShareLink() {
      var payload = Lib.programPayload({ code: curCode(), input: inBox.value, settings: S.settings, name: S.name, exampleId: S.exampleId });
      var base = String(location.href).split('#')[0].split('?')[0];
      var r = Store.makeShareLink(base, payload);
      return r && r.ok ? r : { ok: false, error: Lib.shareProblem(r) };
    }
    function shareNow(opener) {
      var r = makeShareLink();
      if (!r.ok) { toast(r.error); return; }
      copyText(r.url).then(function (ok) {
        if (ok) toast('Link copied. Anyone who opens it gets this program.'); else shareDlg.open(opener);
      });
    }

    /* ───────────── settings ───────────── */
    function applySettings(patch, persist) {
      var next = Lib.cleanSettings(Object.assign({}, S.settings, patch));
      var machineChanged = ['size', 'isa', 'memLatency', 'wrap', 'maxInstr'].some(function (k) { return next[k] !== S.settings[k]; });
      S.settings = next;
      // remember only what the user changed: the machine settings of a loaded example or share link must not become the user's defaults
      if (persist) store.settings.set(patch);
      editor.setIsa(next.isa);
      if (machineChanged) { if (S.lastAsm) doAssemble(true); } else { tabMem.reset(); if (S.st) render(); }
      tabRef.reset(); var cur = tabsApi.current(); if (cur === 'reference') tabRef.show();
      return next;
    }

    /* ───────────── notes panel ───────────── */
    var modBadge = null, resetBtn = null;
    function renderNotes() {
      clear(notes); modBadge = null; resetBtn = null;
      var it = exampleOf(S.exampleId);
      notes.appendChild(h('h3', { cls: 'vnw-notes-h', text: it ? it.title : 'Your own program' }));
      if (!it) {
        notes.appendChild(h('p', { text: 'Write assembly in the editor. It is checked as you type; when it assembles, the machine below loads it.' }));
        notes.appendChild(h('ul', { cls: 'vnw-notes-list' }, [
          h('li', { text: 'Step it with Micro-step, or press Play and watch the arrows. Click the gutter (or press F9) to set a breakpoint.' }),
          h('li', { text: 'Tests tab: write cases of the form “input → expected output” and run them all at once.' }),
          h('li', { text: 'Reference tab: every instruction with its opcode and its cost. Settings: memory size, extended instructions, memory latency, wrap-around.' }),
          h('li', { text: 'Examples: 60+ ready-made programs with stories and challenges. Save, Download and Share keep your work.' })]));
        return;
      }
      var meta = h('p', { cls: 'vnw-notes-meta' }, [P.levelDots(it.level), h('span', { cls: 'vnw-badge ' + (it.isa === 'ext' ? 'ext' : 'lec'), text: it.isa === 'ext' ? 'Extended set' : 'Lecture set' })]);
      modBadge = h('span', { cls: 'vnw-badge', text: 'modified' }); modBadge.hidden = !isDirty(); meta.appendChild(modBadge);
      notes.appendChild(meta);
      notes.appendChild(h('p', { cls: 'vnw-story', text: it.story }));
      notes.appendChild(h('div', { cls: 'vnw-tags' }, it.concepts.map(function (c) { return h('span', { cls: 'vnw-tag', text: c }); })));
      if (it.slide) notes.appendChild(h('p', { cls: 'vnw-slide', text: 'Lecture reference: ' + it.slide + '.' }));
      notes.appendChild(h('h4', { cls: 'vnw-notes-h4', text: 'Try this' }));
      notes.appendChild(h('ol', { cls: 'vnw-notes-list' }, it.tryThis.map(function (t) { return h('li', { text: t }); })));
      var det = h('details', { cls: 'vnw-cpp' }, [h('summary', { text: 'The same program in C++' })]);
      if (it.cpp) {
        det.appendChild(h('pre', { cls: 'vnw-cppcode' }, [h('code', { text: it.cpp })]));
        det.appendChild(btn('Copy C++', 'ghost', function () { copyText(it.cpp).then(function (ok) { toast(ok ? 'C++ copied.' : 'Copying is blocked in this browser.'); }); }));
      } else det.appendChild(h('p', { text: it.noCpp }));
      notes.appendChild(det);
      resetBtn = btn('Reset to example', 'ghost', resetToExample, { title: 'Reload the original code, input and settings of this example' });
      notes.appendChild(h('div', { cls: 'vnw-notes-actions' }, [resetBtn]));
    }

    /* ───────────── dirty flag, banner, draft ───────────── */
    function updateDirty() {
      var d = isDirty();
      dirtyDot.hidden = !d;
      if (modBadge) modBadge.hidden = !d;
    }
    function onEdit() {
      refreshStaleHint(); updateDirty(); scheduleAssemble(); scheduleDraft();
    }
    function scheduleDraft() { clearTimeout(timers.draft); timers.draft = setTimeout(function () { timers.draft = 0; saveDraft(); }, 800); }
    global.addEventListener('pagehide', function () { if (timers.draft) { clearTimeout(timers.draft); timers.draft = 0; saveDraft(); } });
    // move the held draft (page-load draft or in-session snapshot) into My programs as "Recovered draft". true when nothing is left pending.
    function movePending(quiet) {
      var d = S.pendingDraft;
      if (!d) return true;
      var rec = store.programs.save({ name: 'Recovered draft', code: d.code, input: d.input, settings: d.settings });
      if (rec.ok) {
        d.recoveredId = rec.id;
        S.pendingDraft = null; S.draftWarned = false; hideBannerTag('draft');
        if (!quiet) toast('Your earlier unsaved draft was saved to My programs as “Recovered draft”.');
        return true;
      }
      // keep the earlier draft exactly as stored (do not overwrite it) until it can be moved or the user decides
      if (!S.draftWarned) {
        S.draftWarned = true;
        if (/disabled or blocked|not letting/i.test(rec.error || '')) toast('This browser is blocking storage, so nothing can be saved automatically. Use Download to keep your work.', { ms: 15000 });
        else toast('Your earlier unsaved draft could not be moved to My programs (' + (rec.error || 'it is full') + '). It is kept as it is, and new changes are not auto-saved until there is room: delete a saved program in My programs.', { ms: 15000 });
      }
      return false;
    }
    // The stored draft slot may hold earlier work that nobody has dealt with yet (S.pendingDraft: a page-load draft, or the text left behind
    // by loading another program). It is only moved to My programs when the slot is needed for new unsaved work, or when Save would clear it;
    // otherwise it stays exactly as stored (and is offered again by the Restore banner on the next visit).
    function saveDraft() {
      if (S.pendingDraft) {
        if (!isDirty()) return;
        if (!movePending()) return;
      }
      if (isDirty()) writeDraft(capture(), true); else store.draft.clear();
    }
    function hideBanner() { clear(banner); S.bannerTag = ''; }
    function hideBannerTag(tag) { if (S.bannerTag === tag) hideBanner(); }
    function showBanner(text, actions, kind, tag) {
      clear(banner); S.bannerTag = tag || '';
      var b = h('div', { cls: 'vnw-banner' + (kind ? ' ' + kind : ''), attrs: { role: 'status' } }, [h('span', { cls: 'vnw-banner-t', text: text })].concat(actions));
      banner.appendChild(b);
    }

    /* ───────────── recording a test from the current run ───────────── */
    function recordRun() {
      var st = S.st;
      if (S.stale) return { ok: false, error: 'The machine runs an older version of your code. Press Assemble & load, run it, then record.' };
      var exp;
      if (st.halted) exp = Lib.numbersText(st.out);
      else if (st.waiting) exp = 'waiting';
      else if (st.error && st.errorKind) exp = st.errorKind;
      else return { ok: false, error: 'Run the program to its end first (Run to end), then record the run.' };
      return { ok: true, in: Lib.numbersText(parseInput(inBox.value)), exp: exp };
    }

    /* ───────────── start-up ───────────── */
    // 1. default program
    var startItem = Examples.get(DEFAULT_EXAMPLE) || Examples.items[0];
    applyProgram({ code: startItem.src, input: startItem.input, name: startItem.title, exampleId: startItem.id }, {});
    tabsApi.select('memory');
    S.pendingDraft = null;
    store.draft.get();   // (read once so a corrupted value is noticed early)

    // 2. a shared link wins over an old draft
    var shareParam = Store.readShareParam(global.location.search), shared = false;
    if (shareParam) {
      var dec = Store.decodeShare(shareParam);
      if (dec.ok) {
        var pl = dec.payload, sit = exampleOf(pl.exampleId);
        applyProgram({ code: pl.code, input: pl.input, settings: pl.settings, name: pl.name || (sit ? sit.title : 'Shared program'), exampleId: pl.exampleId }, {});
        shared = true;
        showBanner('Loaded a shared program' + (pl.name ? ': “' + pl.name + '”' : '') + '. It is not saved yet.', [
          btn('Save to My programs', 'primary', function () { saveProgram(); nameInput.focus(); }), btn('Dismiss', 'ghost', function () { hideBanner(); nameInput.focus(); })], '', 'shared');
        openLabSection();
      } else {
        showBanner('This link could not be opened (' + (dec.error || 'invalid') + '). The default program is loaded instead.', [btn('Dismiss', 'ghost', function () { hideBanner(); nameInput.focus(); })], 'bad', 'badlink');
        openLabSection();
      }
    }
    // 3. an unsaved draft is offered, never applied silently
    var draft = store.draft.get();
    if (draft && draft.dirty && draft.code && draft.code !== startItem.src) {
      draft.fromLoad = true; S.pendingDraft = draft;
      if (!shared && !shareParam) showBanner('You have unsaved work from ' + Lib.whenText(draft.updated) + (draft.name ? ' (“' + draft.name + '”)' : '') + '.', [
        btn('Restore', 'primary', function () {
          S.pendingDraft = null;
          var dit = exampleOf(draft.exampleId);
          applyProgram({ code: draft.code, input: draft.input, settings: draft.settings, name: draft.name, exampleId: draft.exampleId,
                         baseline: { code: dit ? dit.src : '', input: dit ? dit.input : '' } }, {});
          editor.focus();
        }),
        btn('Dismiss', 'ghost', function () { S.pendingDraft = null; S.draftWarned = false; store.draft.clear(); hideBanner(); nameInput.focus(); })], '', 'draft');
    }
    clearTimeout(timers.draft); timers.draft = 0;        // starting up is not an edit

    function openLabSection() {
      function go() {
        var head = document.querySelector('#lab > .wrap > .sec-head.foldable');
        if (head && head.getAttribute('aria-expanded') === 'false') head.click();
        if (shared || shareParam) { try { root.scrollIntoView(); } catch (e) { /* ignore */ } }
      }
      if (document.readyState === 'complete') go(); else global.addEventListener('load', function () { setTimeout(go, 0); });
    }

    /* ───────────── responsive classes (no container queries: the editor uses position: fixed popups) ───────────── */
    function measure() {
      var w = root.getBoundingClientRect().width;
      root.classList.toggle('vnw-wide', w >= 860); root.classList.toggle('vnw-narrow', w < 560);
      root.classList.toggle('vnw-huge', w >= 1240);
    }
    if (global.ResizeObserver) new global.ResizeObserver(measure).observe(root); else global.addEventListener('resize', measure);
    measure();

    /* ───────────── test hook ───────────── */
    function snapshotState() {
      var st = S.st, a = S.asm;
      return { pc: st.pc, ir: st.ir, mar: st.mar, mdr: st.mdr, r: st.r, gt: st.gt, eq: st.eq, lt: st.lt, out: st.out.slice(), instr: st.instrCount, micro: st.microCount, cycles: st.cycles,
               halted: st.halted, waiting: st.waiting, error: st.error, errorKind: st.errorKind, mem: st.mem.slice(), stale: S.stale,
               asm: { ok: a.ok, size: a.size, isa: a.isa, opBits: a.opBits } };
    }
    global.VNLab = {
      loadExample: function (id) { var it = Examples.get(id); if (!it) return false; return loadExample(it); },
      setCode: function (text) { editor.setValue(String(text)); S.bps = new Set(); onEdit(); },
      getCode: function () { return curCode(); },
      setInput: function (text) { inBox.value = String(text); onInputChanged(); },
      assembleLoad: function () { var a = assembleLoadNow(); return { ok: a.ok, errors: a.errors, warnings: a.warnings }; },
      setSettings: function (obj) { return applySettings(obj || {}, false); },
      getSettings: function () { return Object.assign({}, S.settings); },
      step: function (kind, n) {
        n = n === undefined ? 1 : n; syncInput();
        for (var i = 0; i < n; i++) { if (kind === 'instr') VN.stepInstr(S.st); else VN.stepMicro(S.st); }
        render(); return snapshotState();
      },
      runInstant: function (maxInstr) { syncInput(); VN.run(S.st, maxInstr); render(); return snapshotState(); },
      runToEnd: function () { return runToEnd(); },
      reset: function () { resetMachine(); return snapshotState(); },
      getState: snapshotState,
      setBreakpoints: function (lines) { var set = new Set(lines || []); editor.setBreakpoints(set); S.bps = set; },
      getBreakpoints: function () { return Array.from(S.bps).sort(function (a, b) { return a - b; }); },
      openTab: function (name) { return tabsApi.select(String(name).toLowerCase()); },
      runTests: function () { return tabTests.run(); },
      setTests: function (rows) { S.testRows = rows; tabTests.setRows(rows); },
      getTests: function () { return tabTests.getRows(); },
      saveProgram: function (name) { if (name !== undefined) { S.name = String(name); nameInput.value = S.name; } var r = saveProgram(); return { ok: !!(r && r.ok), id: r && r.id, error: r && r.error }; },
      listPrograms: function () { return store.programs.list().map(function (p) { return { id: p.id, name: p.name, lines: p.code.split('\n').length }; }); },
      shareLink: function () { var r = makeShareLink(); return r.ok ? r.url : null; },
      applyShareLink: function (url) {
        var d = Store.decodeShareUrl(url);
        if (!d.ok) return false;
        var pl = d.payload;
        applyProgram({ code: pl.code, input: pl.input, settings: pl.settings, name: pl.name, exampleId: pl.exampleId }, { snapshot: true });
        return true;
      },
      busy: function () { return !!S.run; }, status: function () { return status.textContent; },
      root: root, editor: editor, store: store, version: 1
    };
  }

  var api = { PRESETS: PRESETS, parseInput: parseInput };
  if (isNode) module.exports = api;
  else document.addEventListener('DOMContentLoaded', mount);
})(typeof window !== 'undefined' ? window : this);
