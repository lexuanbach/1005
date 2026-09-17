/* CO1005 shared page engine: theme toggle, MCQ quiz, runnable exercises,
   and the standalone playground. Depends on assets/minicpp.js for running C++;
   optionally lazy-loads a real compiler from vendor/wasm-clang (see RealCpp). */
(function () {
  'use strict';

  // URL of this file — used to locate vendor/wasm-clang. Empty when the script is inlined (dist/ builds).
  var SCRIPT_SRC = (document.currentScript && document.currentScript.src) || '';

  // ───────────── Theme toggle (same storage key as index.html) ─────────────
  var root = document.documentElement;
  try {
    var storedTheme = localStorage.getItem('co1005-theme');
    if (storedTheme === 'dark' || storedTheme === 'light') root.dataset.theme = storedTheme;
  } catch (e) {}

  // Move the theme button(s) out of the scrollable .topnav into their own
  // fixed-width group, so a narrow/long nav can scroll internally instead
  // of pushing the appearance controls off-screen. Safe to call once.
  function topbarTools() {
    var existing = document.querySelector('.topbar-tools');
    if (existing) return existing;
    var nav = document.querySelector('.topnav');
    if (!nav) return null;
    var tools = document.createElement('div');
    tools.className = 'topbar-tools';
    var themeBtn = document.getElementById('theme-toggle');
    if (themeBtn && nav.contains(themeBtn)) tools.appendChild(themeBtn);
    nav.parentNode.insertBefore(tools, nav.nextSibling);
    return tools;
  }

  function initTheme() {
    var btn = document.getElementById('theme-toggle');
    if (!btn) return;
    var systemDark = window.matchMedia('(prefers-color-scheme: dark)');
    function active() { return root.dataset.theme || (systemDark.matches ? 'dark' : 'light'); }
    function paint() {
      var dark = active() === 'dark';
      btn.textContent = dark ? '☀ Light' : '☾ Dark';
      btn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
    }
    btn.addEventListener('click', function () {
      var next = active() === 'dark' ? 'light' : 'dark';
      root.dataset.theme = next;
      try { localStorage.setItem('co1005-theme', next); } catch (e) {}
      paint();
    });
    systemDark.addEventListener('change', function () { if (!root.dataset.theme) paint(); });
    paint();
  }

  // ───────────── Code color theme (independent of light/dark site theme) ─────────────
  var CODE_THEMES = [
    { key: 'midnight', label: 'Midnight' },
    { key: 'paper', label: 'Paper' },
    { key: 'contrast', label: 'Contrast' }
  ];
  try {
    var storedCodeTheme = localStorage.getItem('co1005-code-theme');
    if (storedCodeTheme && storedCodeTheme !== 'midnight') root.dataset.codeTheme = storedCodeTheme;
  } catch (e) {}

  // Program font size: a scale factor every code surface multiplies its font-size by.
  var CODE_SCALES = [0.85, 1, 1.15, 1.3, 1.5, 1.75, 2];
  function applyCodeScale(v) { root.style.setProperty('--code-scale', String(v)); }
  function storedCodeScale() {
    try { var v = parseFloat(localStorage.getItem('co1005-code-scale')); if (CODE_SCALES.indexOf(v) >= 0) return v; } catch (e) {}
    return 1;
  }
  applyCodeScale(storedCodeScale());

  // Soft-wrap in the code editors: on unless the reader switched it off.
  try { if (localStorage.getItem('co1005-wrap') === 'off') root.dataset.codeWrap = 'off'; } catch (e) {}

  /* View controls — program font size (A− / A+), soft wrap, code colour theme. They are site-wide
     preferences, but they live on each code window's own toolbar (`mountViewControls(bar, …)` from
     makeEditor). Any click fires 'co1005-view', on which every copy repaints and every editor
     re-measures its wrapped rows. Pages that show code but have no editor get font size + theme in
     the top bar instead. */
  function mountViewControls(container, o) {   // o: { cls, wrap, before }
    function add(node) { if (o.before) container.insertBefore(node, o.before); else container.appendChild(node); }
    function button(extraCls) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = o.cls + (extraCls ? ' ' + extraCls : '');
      return b;
    }
    var group = document.createElement('div');
    group.className = 'font-size-group';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'Program font size');
    var minus = button(), plus = button();
    minus.textContent = 'A−'; plus.textContent = 'A+';
    group.appendChild(minus); group.appendChild(plus);
    add(group);
    var wrapBtn = null;
    if (o.wrap) { wrapBtn = button('wrap-toggle'); add(wrapBtn); }
    var themeBtn = button('code-theme-toggle');
    add(themeBtn);

    function currentTheme() { return root.dataset.codeTheme || 'midnight'; }
    function paint() {
      var v = storedCodeScale(), i = CODE_SCALES.indexOf(v), pct = Math.round(v * 100) + '%';
      minus.disabled = i === 0; plus.disabled = i === CODE_SCALES.length - 1;
      minus.title = 'Smaller program text (now ' + pct + ')'; plus.title = 'Larger program text (now ' + pct + ')';
      minus.setAttribute('aria-label', minus.title); plus.setAttribute('aria-label', plus.title);
      if (wrapBtn) {
        var on = root.dataset.codeWrap !== 'off';
        wrapBtn.textContent = on ? '↩ Wrap' : '→ No wrap';
        wrapBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
        wrapBtn.title = on ? 'Long code lines wrap inside the editor — click to scroll sideways instead'
                           : 'Long code lines scroll sideways — click to wrap them';
      }
      var t = CODE_THEMES.filter(function (t) { return t.key === currentTheme(); })[0] || CODE_THEMES[0];
      themeBtn.textContent = '◐ ' + t.label;
      themeBtn.title = 'Code color theme: ' + t.label + ' — click to change';
      themeBtn.setAttribute('aria-label', themeBtn.title);
    }
    function changed() { window.dispatchEvent(new Event('co1005-view')); }
    function step(d) {
      var i = Math.min(CODE_SCALES.length - 1, Math.max(0, CODE_SCALES.indexOf(storedCodeScale()) + d));
      try { localStorage.setItem('co1005-code-scale', String(CODE_SCALES[i])); } catch (e) {}
      applyCodeScale(CODE_SCALES[i]);
      changed();
    }
    minus.addEventListener('click', function () { step(-1); });
    plus.addEventListener('click', function () { step(1); });
    if (wrapBtn) wrapBtn.addEventListener('click', function () {
      var turnOff = root.dataset.codeWrap !== 'off';
      if (turnOff) root.dataset.codeWrap = 'off'; else delete root.dataset.codeWrap;
      try { localStorage.setItem('co1005-wrap', turnOff ? 'off' : 'on'); } catch (e) {}
      changed();
    });
    themeBtn.addEventListener('click', function () {
      var idx = CODE_THEMES.map(function (t) { return t.key; }).indexOf(currentTheme());
      var next = CODE_THEMES[(idx + 1) % CODE_THEMES.length].key;
      if (next === 'midnight') delete root.dataset.codeTheme; else root.dataset.codeTheme = next;
      try { localStorage.setItem('co1005-code-theme', next); } catch (e) {}
      changed();
    });
    window.addEventListener('co1005-view', paint);
    paint();
  }

  // Top bar fallback: only on pages that show code but have no code window of their own.
  function initTopbarViewControls() {
    var tools = topbarTools();
    if (!tools || document.querySelector('#exercises-root, #playground-root') || !document.querySelector('pre')) return;
    mountViewControls(tools, { cls: 'icon-btn', wrap: false, before: document.getElementById('theme-toggle') });
  }

  // ───────────── helpers ─────────────
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html !== undefined) n.innerHTML = html;
    return n;
  }
  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function enableTabKey(ta) {
    ta.addEventListener('keydown', function (ev) {
      if (ev.key === 'Tab' && !ev.shiftKey) {
        ev.preventDefault();
        var s = ta.selectionStart, epos = ta.selectionEnd;
        ta.value = ta.value.slice(0, s) + '    ' + ta.value.slice(epos);
        ta.selectionStart = ta.selectionEnd = s + 4;
        ta.dispatchEvent(new Event('input'));
      }
    });
  }

  // ───────────── C++ syntax highlighting (editor overlay) ─────────────
  var CPP_KW = new Set(('if else while for do switch case default break continue return using namespace ' +
    'const true false new delete struct class public private void').split(' '));
  var CPP_TYPE = new Set('int long short float double bool char string unsigned signed auto'.split(' '));
  var CPP_STREAM = new Set('cout cin endl fixed defaultfloat scientific showpoint std'.split(' '));

  var HL_NEWLINE = '\u0000';   // never produced by escapeHtml
  function hlCpp(src) {
    var re = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\\n]|\\.)*"?)|('(?:[^'\\\n]|\\.)*'?)|(#[ \t]*\w+(?:[ \t]*<[^>\n]*>)?)|(\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?[fFlLuU]*)|([A-Za-z_]\w*)|(<<|>>|::|->|[+\-*/%=!<>&|^?:~])/g;
    var out = '', last = 0, m;
    function push(text, cls) {
      // A token may span lines (block comments): close and reopen its span around each break.
      var parts = text.split('\n');
      for (var i = 0; i < parts.length; i++) {
        if (i > 0) out += HL_NEWLINE;
        if (parts[i] === '') continue;
        var e = escapeHtml(parts[i]);
        out += cls ? '<span class="' + cls + '">' + e + '</span>' : e;
      }
    }
    while ((m = re.exec(src)) !== null) {
      if (m.index > last) push(src.slice(last, m.index), null);
      last = re.lastIndex;
      if (m[1]) push(m[1], 'hl-cm');
      else if (m[2]) push(m[2], 'hl-str');
      else if (m[3]) push(m[3], 'hl-chr');
      else if (m[4]) push(m[4], 'hl-pre');
      else if (m[5]) push(m[5], 'hl-num');
      else if (m[6]) {
        var w = m[6];
        if (CPP_KW.has(w)) push(w, 'hl-kw');
        else if (CPP_TYPE.has(w)) push(w, 'hl-type');
        else if (CPP_STREAM.has(w)) push(w, 'hl-stream');
        else {
          var rest = src.slice(last).match(/^\s*\(/);
          push(w, rest ? 'hl-fn' : null);
        }
      }
      else if (m[7]) push(m[7], 'hl-op');
    }
    if (last < src.length) push(src.slice(last), null);
    return out.split(HL_NEWLINE);   // one HTML string per logical line
  }

  /* Editor = highlighted <pre> behind a transparent <textarea>. */
  function makeEditor(opts) {
    var wrap = el('div', 'editor-wrap');
    var bar = el('div', 'editor-bar');
    var shell = el('div', 'editor-shell');
    wrap.appendChild(bar);
    wrap.appendChild(shell);
    var pre = el('pre', 'hl-pre-layer');
    pre.setAttribute('aria-hidden', 'true');
    var code = el('code');
    pre.appendChild(code);
    var ta = el('textarea', 'code-edit');
    ta.spellcheck = false;
    if (opts && opts.label) ta.setAttribute('aria-label', opts.label);
    if (opts && opts.minHeight) { shell.style.minHeight = opts.minHeight; }
    var gutter = el('div', 'ln-gutter');
    gutter.setAttribute('aria-hidden', 'true');
    var gutterList = el('div', 'ln-list');
    gutter.appendChild(gutterList);
    shell.appendChild(pre);
    shell.appendChild(ta);
    shell.appendChild(gutter);

    var lineCount = 0, layoutQueued = false;
    function wrapOn() { return root.dataset.codeWrap !== 'off'; }
    /* Wrapping only lines up if both layers break at the same column, so the highlight layer
       must lose exactly the width the textarea gives to its vertical scrollbar. Then size each
       line number to the (possibly multi-row) height of its logical line. */
    function layout() {
      layoutQueued = false;
      var scrollbar = (ta.offsetWidth - ta.clientWidth) - (pre.offsetWidth - pre.clientWidth);
      pre.style.paddingRight = 'calc(1rem + ' + Math.max(0, scrollbar) + 'px)';
      var rows = code.children, nums = gutterList.children, i;
      if (nums.length !== lineCount) {
        var html = '';
        for (i = 1; i <= lineCount; i++) html += '<div>' + i + '</div>';
        gutterList.innerHTML = html;
        nums = gutterList.children;
        shell.style.setProperty('--gutter', (lineCount > 999 ? 3.8 : 3) + 'rem');   // both layers read this
      }
      if (wrapOn()) {
        var heights = [];
        for (i = 0; i < rows.length; i++) heights.push(rows[i].getBoundingClientRect().height);   // read first…
        for (i = 0; i < nums.length; i++) nums[i].style.height = heights[i] + 'px';               // …then write
      } else {
        for (i = 0; i < nums.length; i++) nums[i].style.height = '';
      }
      syncScroll();
    }
    function queueLayout() {
      if (layoutQueued) return;
      layoutQueued = true;
      (window.requestAnimationFrame || setTimeout)(layout);
    }
    function refresh() {
      var lines = hlCpp(ta.value);
      lineCount = lines.length;
      code.innerHTML = lines.map(function (l) { return '<div class="cl">' + l + '</div>'; }).join('');
      layout();
    }
    function syncScroll() {
      pre.scrollTop = ta.scrollTop; pre.scrollLeft = ta.scrollLeft;
      gutterList.style.transform = 'translateY(' + (-ta.scrollTop) + 'px)';
    }
    // Wrap points move whenever the box changes width (resize handle, window, folded section opening).
    if (window.ResizeObserver) new ResizeObserver(queueLayout).observe(shell);
    window.addEventListener('co1005-view', queueLayout);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(queueLayout);
    // ── undo / redo ──
    /* Our own history: the page rewrites textarea.value itself (Tab key, Reset, Load solution,
       Open file…), and every such write wipes the browser's native undo stack. */
    var hist = [{ v: '', s: 0, e: 0 }], hi = 0, lastTyped = 0, lastWasTyping = false, pristine = true;
    function snapshot() { return { v: ta.value, s: ta.selectionStart, e: ta.selectionEnd }; }
    function record(typing) {
      var cur = snapshot(), now = Date.now();
      if (cur.v === hist[hi].v) { hist[hi] = cur; return; }
      // keystrokes less than 0.7 s apart collapse into one undo step
      if (typing && lastWasTyping && hi === hist.length - 1 && hi > 0 && now - lastTyped < 700) {
        hist[hi] = cur;
      } else {
        hist = hist.slice(0, hi + 1);
        hist.push(cur);
        if (hist.length > 400) hist.shift();
        hi = hist.length - 1;
      }
      lastTyped = now; lastWasTyping = typing;
      paintBar();
    }
    function restore(i) {
      hi = i; lastWasTyping = false;
      ta.value = hist[hi].v;
      refresh();
      ta.focus();
      ta.setSelectionRange(hist[hi].s, hist[hi].e);
      paintBar();
    }
    function undo() { if (hi > 0) restore(hi - 1); }
    function redo() { if (hi < hist.length - 1) restore(hi + 1); }
    function setValue(v) {
      ta.value = v; refresh(); syncScroll();
      if (pristine) { hist = [snapshot()]; hi = 0; pristine = false; paintBar(); }   // initial content is not an edit
      else record(false);
    }

    // ── save to / open from the reader's computer ──
    var fileName = (opts && opts.fileName) || 'program.cpp';
    var lastHandle = null;   // so the next “Save” dialog opens in the folder used last time
    function downloadFile() {
      var blob = new Blob([ta.value], { type: 'text/x-c++src;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fileName;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
      flash(saveBtn, 'Saved ' + fileName + ' to your Downloads folder');
    }
    /* Where the browser supports it (Chrome, Edge), ask where to save — folder and file name.
       Safari and Firefox have no such API, so there the file goes to the Downloads folder. */
    function saveFile() {
      if (typeof window.showSaveFilePicker !== 'function') { downloadFile(); return; }
      var options = {
        suggestedName: lastHandle ? lastHandle.name : fileName,
        types: [{ description: 'C++ source file', accept: { 'text/x-c++src': ['.cpp', '.cc', '.cxx', '.h', '.hpp'] } }]
      };
      if (lastHandle) options.startIn = lastHandle;
      var content = ta.value;
      window.showSaveFilePicker(options).then(function (handle) {
        lastHandle = handle;
        return handle.createWritable().then(function (w) {
          return w.write(content).then(function () { return w.close(); });
        }).then(function () { flash(saveBtn, 'Saved ' + handle.name); });
      }).catch(function (e) {
        if (e && e.name === 'AbortError') return;                       // the reader pressed Cancel
        if (e && e.name === 'SecurityError') { downloadFile(); return; } // e.g. inside a sandboxed frame
        flash(saveBtn, 'Could not save: ' + ((e && e.message) || e));
      });
    }
    var picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = '.cpp,.cc,.cxx,.c,.h,.hpp,.txt,text/plain';
    picker.hidden = true;
    picker.addEventListener('change', function () {
      var f = picker.files && picker.files[0];
      picker.value = '';
      if (!f) return;
      if (f.size > 512 * 1024) { flash(openBtn, 'File too large (max 512 KB)'); return; }
      var reader = new FileReader();
      reader.onload = function () {
        setValue(String(reader.result).replace(/\r\n?/g, '\n'));
        flash(openBtn, 'Opened ' + f.name);
      };
      reader.onerror = function () { flash(openBtn, 'Could not read that file'); };
      reader.readAsText(f);
    });

    function barButton(label, title, fn) {
      var b = el('button', 'ed-btn', label);
      b.type = 'button'; b.title = title; b.setAttribute('aria-label', title);
      b.addEventListener('click', fn);
      bar.appendChild(b);
      return b;
    }
    var undoBtn = barButton('↶ Undo', 'Undo (Ctrl/Cmd+Z)', undo);
    var redoBtn = barButton('↷ Redo', 'Redo (Ctrl+Y or Shift+Ctrl/Cmd+Z)', redo);
    bar.appendChild(el('span', 'ed-sep'));
    var saveBtn = barButton('⤓ Save…', typeof window.showSaveFilePicker === 'function'
      ? 'Save this program to your computer — you choose the folder and the name (Ctrl/Cmd+S)'
      : 'Save this program to your Downloads folder as ' + fileName + ' (Ctrl/Cmd+S)', saveFile);
    var openBtn = barButton('⤒ Open…', 'Open a .cpp file from your computer', function () { picker.click(); });
    bar.appendChild(picker);
    var note = el('span', 'ed-note');
    note.setAttribute('aria-live', 'polite');
    bar.insertBefore(note, bar.firstChild);
    mountViewControls(bar, { cls: 'ed-btn', wrap: true, before: note });
    var noteTimer = null;
    function flash(btn, text) {
      note.textContent = text;
      clearTimeout(noteTimer);
      noteTimer = setTimeout(function () { note.textContent = ''; }, 2500);
    }
    function paintBar() {
      undoBtn.disabled = hi === 0;
      redoBtn.disabled = hi >= hist.length - 1;
    }
    paintBar();

    // ── full screen: the whole code window (editor, input, output, run buttons) fills the viewport ──
    var fsBtn = null;
    function fullscreenTarget() { return (opts && opts.fullscreen && opts.fullscreen()) || null; }
    function setFullscreen(on) {
      var target = fullscreenTarget();
      if (!target) return;
      target.classList.toggle('code-fullscreen', on);
      document.body.classList.toggle('code-fullscreen-open', on);
      fsBtn.textContent = on ? '✕ Exit full screen' : '⛶ Full screen';
      fsBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      fsBtn.title = on ? 'Back to the page (Esc)' : 'Make this code window fill the screen (Esc to leave)';
      queueLayout();
      if (on) ta.focus();
      else target.scrollIntoView({ block: 'nearest' });
    }
    if (opts && opts.fullscreen) {
      bar.appendChild(el('span', 'ed-sep'));
      fsBtn = barButton('⛶ Full screen', 'Make this code window fill the screen (Esc to leave)', function () {
        setFullscreen(!fullscreenTarget().classList.contains('code-fullscreen'));
      });
      fsBtn.setAttribute('aria-pressed', 'false');
      document.addEventListener('keydown', function (ev) {
        var t = fullscreenTarget();
        if (ev.key === 'Escape' && t && t.classList.contains('code-fullscreen')) setFullscreen(false);
      });
    }

    ta.addEventListener('input', function (ev) {
      refresh();
      record(ev.inputType === 'insertText' || ev.inputType === 'deleteContentBackward' || ev.inputType === 'deleteContentForward');
    });
    ta.addEventListener('scroll', syncScroll);
    ta.addEventListener('keydown', function (ev) {
      if (!(ev.ctrlKey || ev.metaKey) || ev.altKey) return;
      var k = ev.key.toLowerCase();
      if (k === 'z') { ev.preventDefault(); if (ev.shiftKey) redo(); else undo(); }
      else if (k === 'y') { ev.preventDefault(); redo(); }
      else if (k === 's') { ev.preventDefault(); saveFile(); }
    });
    enableTabKey(ta);
    return {
      root: wrap,
      textarea: ta,
      get value() { return ta.value; },
      set value(v) { setValue(v); }
    };
  }
  function runCode(code, stdin, opts) {
    var out = '';
    var res = window.MiniCPP.run(code, stdin, { write: function (s) { out += s; }, interactive: !!(opts && opts.interactive) });
    return { out: out, exit: res.exit, error: res.error, needInput: !!res.needInput };
  }
  /* `body` (optional): an already-built transcript (interactive mode) shown instead of result.out. */
  function renderTerm(term, result, body) {
    term.innerHTML = '';
    if (body) term.appendChild(body);
    else if (result.out) term.appendChild(el('span', '', escapeHtml(result.out)));
    else if (!result.error) term.appendChild(el('span', 't-empty', '(no output)'));
    if (result.error) {
      var e = result.error;
      var where = e.line ? 'line ' + e.line + ': ' : '';
      term.appendChild(el('div', 't-err', escapeHtml((e.stage === 'compile' ? 'compile error — ' : 'runtime error — ') + where + e.msg)));
    } else {
      term.appendChild(el('div', 't-status', '── program finished with exit code ' + result.exit + ' ──'));
    }
  }

  // ───────────── real C++ (clang compiled to WebAssembly, lazy-loaded) ─────────────
  /* ▶ Run uses the instant MiniCPP interpreter. “Run with real compiler” downloads clang + libc++
     (≈18 MB, once — see vendor/wasm-clang/README.md) into a Web Worker the first time it is
     clicked, then compiles, links and runs the program entirely in the browser. */
  var RealCpp = (function () {
    var RUN_LIMIT_MS = 10000;      // a program still running after this is assumed to loop forever
    var TOOL_LIMIT_MS = 180000;    // download + compile budget (slow connections)
    var base = /^https?:/.test(SCRIPT_SRC) ? new URL('../vendor/wasm-clang/', SCRIPT_SRC).href : null;
    var worker = null, job = null, nextId = 1;

    function finish(result) {
      var j = job;
      job = null;
      if (j) { clearTimeout(j.timer); j.resolve(result); }
    }
    function kill(result) {
      if (worker) { worker.terminate(); worker = null; }
      finish(result);
    }
    function arm(ms, result) {
      clearTimeout(job.timer);
      job.timer = setTimeout(function () { kill(result); }, ms);
    }
    function ensureWorker() {
      if (worker) return;
      worker = new Worker(base + 'cpp-worker.js');
      worker.onmessage = function (ev) {
        var m = ev.data;
        if (!job || m.id !== job.id) return;
        if (m.type === 'progress') {
          var pct = m.total ? ' ' + Math.round(100 * m.loaded / m.total) + '%' : '';
          job.onStatus('Downloading the ' + m.label + '…' + pct + '  (about 18 MB in total, first time only)');
        } else if (m.type === 'stage') {
          job.onStatus({ load: 'Starting the compiler…', compile: 'Compiling with clang…', link: 'Linking…', run: 'Running…' }[m.stage]);
          if (m.stage === 'run') {
            arm(RUN_LIMIT_MS, { ok: false, stage: 'run', out: '', diagnostics: '', exit: null,
              error: 'time limit exceeded — the program was still running after ' + (RUN_LIMIT_MS / 1000) + ' s (infinite loop?)' });
          }
        } else if (m.type === 'result') {
          finish(m);
        }
      };
      worker.onerror = function (ev) {
        kill({ ok: false, stage: 'load', out: '', diagnostics: '', exit: null,
          error: 'the compiler could not start: ' + (ev.message || 'worker failed to load') });
      };
    }
    return {
      available: !!base && typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined',
      busy: function () { return !!job; },
      run: function (code, stdin, onStatus, opts) {
        return new Promise(function (resolve) {
          job = { id: nextId++, resolve: resolve, onStatus: onStatus || function () {}, timer: null };
          ensureWorker();
          arm(TOOL_LIMIT_MS, { ok: false, stage: 'load', out: '', diagnostics: '', exit: null,
            error: 'the compiler took too long to download or start — check your connection and try again' });
          worker.postMessage({ id: job.id, code: code, stdin: stdin, interactive: !!(opts && opts.interactive), eof: !!(opts && opts.eof) });
        });
      }
    };
  })();

  function renderRealTerm(term, r, body) {
    term.innerHTML = '';
    if (r.error && (r.stage === 'compile' || r.stage === 'link')) {
      term.appendChild(el('div', 't-err', 'compile error — clang says:'));
      term.appendChild(el('span', '', escapeHtml(r.diagnostics || r.error)));
      term.appendChild(el('div', 't-status', '── real compiler: clang 8 · nothing was run ──'));
      return;
    }
    if (body) term.appendChild(body);
    else if (r.out) term.appendChild(el('span', '', escapeHtml(r.out)));
    else if (!r.error) term.appendChild(el('span', 't-empty', '(no output)'));
    if (r.truncated) term.appendChild(el('div', 't-warn', '… output cut off after 200 KB'));
    if (r.error) term.appendChild(el('div', 't-err', escapeHtml((r.stage === 'run' ? 'runtime error — ' : 'error — ') + r.error)));
    if (r.diagnostics) term.appendChild(el('div', 't-warn', escapeHtml('compiler warnings (-Wall):\n' + r.diagnostics)));
    if (!r.error) {
      var ms = r.times && r.times.compile ? ' · compiled in ' + Math.round(r.times.compile + (r.times.link || 0)) + ' ms' : '';
      term.appendChild(el('div', 't-status', '── real compiler: clang 8, C++17 · exit code ' + r.exit + ms + ' ──'));
    }
  }

  // ───────────── input modes: batch box, or an interactive terminal ─────────────
  /* Interactive mode uses re-execution: run with the lines typed so far; when the program reads
     past them the engine answers needInput, we show the output up to there plus a live prompt, and
     on Enter we run again with one more line. CO1005 programs are deterministic, so the student
     simply sees a terminal. Works identically for MiniCPP and for real clang (which caches the
     compiled program, so a re-run is a few milliseconds). Sample tests always use the batch path. */
  var IO_KEY = 'co1005-io-mode';
  function storedIoMode() { try { return localStorage.getItem(IO_KEY) === 'interactive' ? 'interactive' : 'batch'; } catch (e) { return 'batch'; } }

  function makeIo(o) {   // o: { editor, stdinLabel, stdin, outLabel, term }
    var editor = o.editor, stdin = o.stdin, term = o.term;
    var mode = storedIoMode();
    var session = null;            // { engine, inputs[] (consumed so far), pending[] (pasted, not yet fed), marks[], eof }
    var runToken = 0;

    // the switch
    var sw = el('div', 'io-mode');
    sw.setAttribute('role', 'group');
    sw.setAttribute('aria-label', 'How the program receives its input');
    var bBatch = el('button', '', 'Input box'), bInter = el('button', '', '⌨ Interactive terminal');
    bBatch.type = bInter.type = 'button';
    bBatch.title = 'Type all the input first, then run';
    bInter.title = 'Run first, then type each value when the program asks — like a real terminal';
    sw.appendChild(bBatch); sw.appendChild(bInter);
    o.stdinLabel.parentNode.insertBefore(sw, o.stdinLabel);
    var hint = el('div', 'term-hint');
    term.parentNode.insertBefore(hint, term.nextSibling);

    function idleMessage() {
      term.innerHTML = '';
      term.appendChild(el('span', 't-empty', mode === 'interactive'
        ? 'Press “Run” — then type here whenever the program waits for input.'
        : 'Press “Run” to execute your program.'));
    }
    function paintMode() {
      var inter = mode === 'interactive';
      bBatch.setAttribute('aria-pressed', inter ? 'false' : 'true');
      bInter.setAttribute('aria-pressed', inter ? 'true' : 'false');
      o.stdinLabel.hidden = inter; stdin.hidden = inter;
      if (o.outLabel) o.outLabel.textContent = inter ? 'Terminal' : 'Output';
      term.classList.toggle('is-terminal', inter);
      hint.textContent = ''; hint.hidden = true;
    }
    function setMode(m) {
      if (m === mode) return;
      mode = m; session = null; runToken++;
      try { localStorage.setItem(IO_KEY, m); } catch (e) {}
      paintMode(); idleMessage();
    }
    bBatch.addEventListener('click', function () { setMode('batch'); });
    bInter.addEventListener('click', function () { setMode('interactive'); });

    // transcript = program output with each typed line echoed at the point it was asked for
    function transcript(out) {
      var frag = document.createDocumentFragment(), prev = 0, mark = 0;
      session.inputs.forEach(function (line, i) {
        if (typeof session.marks[i] === 'number') mark = Math.max(mark, Math.min(session.marks[i], out.length));
        if (mark > prev) frag.appendChild(el('span', '', escapeHtml(out.slice(prev, mark))));
        frag.appendChild(el('span', 't-in', escapeHtml(line)));
        prev = mark;
      });
      if (out.length > prev) frag.appendChild(el('span', '', escapeHtml(out.slice(prev))));
      return frag;
    }
    function showPrompt(out) {
      term.innerHTML = '';
      term.appendChild(transcript(out));
      var field = el('span', 't-field');
      field.setAttribute('contenteditable', 'plaintext-only');
      if (field.contentEditable !== 'plaintext-only') field.setAttribute('contenteditable', 'true');
      field.setAttribute('role', 'textbox');
      field.setAttribute('aria-label', 'Program input — type a value and press Enter');
      field.spellcheck = false;
      term.appendChild(field);
      hint.hidden = false;
      hint.innerHTML = '';
      hint.appendChild(el('span', '', 'The program is waiting — type and press <kbd>Enter</kbd>.'));
      var eofBtn = el('button', '', 'End of input (Ctrl+D)'), stopBtn = el('button', '', 'Stop (Ctrl+C)');
      eofBtn.type = stopBtn.type = 'button';
      hint.appendChild(eofBtn); hint.appendChild(stopBtn);
      // Freeze the terminal the moment a line is sent: the re-run may be asynchronous (real compiler),
      // and keystrokes must not land in a field that is about to be replaced.
      function freeze() {
        hint.hidden = true; hint.innerHTML = '';
        term.onclick = null;
        term.innerHTML = '';
        term.appendChild(transcript(out));
      }
      function send(text) {
        if (!session) return;
        text.replace(/\r/g, '').split('\n').forEach(function (l) { session.pending.push(l + '\n'); });
        session.inputs.push(session.pending.shift());
        freeze();
        step();
      }
      function endInput() { if (!session) return; session.eof = true; freeze(); step(); }
      function stop() {
        if (!session) return;
        var body = transcript(out);
        session = null; runToken++;
        hint.hidden = true;
        term.innerHTML = '';
        term.appendChild(body);
        term.appendChild(el('div', 't-status', '^C  ── stopped ──'));
      }
      eofBtn.addEventListener('click', endInput);
      stopBtn.addEventListener('click', stop);
      field.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') { ev.preventDefault(); send(field.textContent); }
        else if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'd') { ev.preventDefault(); endInput(); }
        else if (ev.ctrlKey && ev.key.toLowerCase() === 'c' && String(window.getSelection()) === '') { ev.preventDefault(); stop(); }
      });
      field.addEventListener('paste', function (ev) {         // multi-line paste = several Enter presses
        var text = (ev.clipboardData || window.clipboardData).getData('text');
        if (text.indexOf('\n') < 0) return;
        ev.preventDefault();
        if (!session) return;
        var lines = (field.textContent + text).replace(/\r/g, '').split('\n');
        var rest = lines.pop();
        lines.forEach(function (l) { session.pending.push(l + '\n'); });
        session.inputs.push(session.pending.shift());
        freeze();
        step(rest);
      });
      term.onclick = function () { if (String(window.getSelection()) === '') field.focus(); };
      term.scrollTop = term.scrollHeight;
      field.focus({ preventScroll: true });
      return field;
    }
    function finish(result) {
      var body = session.inputs.length ? transcript(result.out) : null;
      var engine = session.engine;
      session = null;
      hint.hidden = true; hint.innerHTML = '';
      term.onclick = null;
      if (engine === 'real') renderRealTerm(term, result, body); else renderTerm(term, result, body);
      term.scrollTop = term.scrollHeight;
    }
    function status(text) { term.innerHTML = ''; term.appendChild(el('span', 't-empty', text)); }

    function step(prefill) {
      var mine = ++runToken, sess = session;
      var text = sess.inputs.join('');
      function done(result) {
        if (mine !== runToken || sess !== session) return;          // superseded by a newer Run / Stop / mode switch
        if (result.needInput) {
          if (typeof sess.marks[sess.inputs.length] !== 'number') sess.marks[sess.inputs.length] = result.out.length;
          if (sess.pending.length) {               // lines pasted together are fed one request at a time,
            sess.inputs.push(sess.pending.shift());   // so each is echoed where the program asked for it
            step(prefill);
            return;
          }
          var field = showPrompt(result.out);
          if (prefill) { field.textContent = prefill; }
        } else finish(result);
      }
      if (sess.engine === 'real') {
        hint.hidden = true;
        RealCpp.run(editor.value, text, sess.inputs.length ? null : status, { interactive: true, eof: sess.eof }).then(done);
      } else {
        done(runCode(editor.value, text, { interactive: !sess.eof }));
      }
    }

    function run(engine, btn) {
      if (engine === 'real' && RealCpp.busy()) return;
      if (mode === 'interactive') {
        session = { engine: engine, inputs: [], pending: [], marks: [], eof: false };
        if (engine === 'real') status('Starting the compiler…');
        step();
        return;
      }
      session = null; runToken++;
      if (engine === 'real') {
        if (btn) btn.disabled = true;
        status('Starting the compiler…');
        RealCpp.run(editor.value, stdin.value, status).then(function (r) {
          if (btn) btn.disabled = false;
          renderRealTerm(term, r);
        });
      } else {
        renderTerm(term, runCode(editor.value, stdin.value));
      }
    }

    paintMode();
    return { run: run, reset: function () { session = null; runToken++; hint.hidden = true; idleMessage(); } };
  }

  /* “Run with real compiler” button; null where the compiler cannot be loaded (file://, dist builds). */
  function makeRealRunButton(io) {
    if (!RealCpp.available) return null;
    var btn = el('button', 'btn ghost', '⚙ Run with real compiler');
    btn.type = 'button';
    btn.title = 'Compile with real clang (C++17) inside your browser. The first click downloads about 18 MB; after that it is cached.';
    btn.addEventListener('click', function () { io.run('real', btn); });
    return btn;
  }

  // ───────────── MCQ quiz ─────────────
  function initQuiz(data) {
    var mount = document.getElementById('quiz-root');
    if (!mount || !data || !data.quiz || !data.quiz.length) return;
    var questions = data.quiz;
    var picks = new Array(questions.length).fill(null);
    var graded = false;

    var bar = el('div', 'quiz-bar');
    var score = el('span', 'quiz-score', '0 / ' + questions.length + ' answered');
    var gradeBtn = el('button', 'btn primary', 'Grade my answers');
    var resetBtn = el('button', 'btn ghost', 'Reset');
    bar.appendChild(gradeBtn); bar.appendChild(resetBtn); bar.appendChild(score);
    mount.appendChild(bar);

    var list = el('div');
    mount.appendChild(list);

    var cards = questions.map(function (q, qi) {
      var card = el('article', 'quiz-q');
      var head = el('div', 'qhead');
      head.appendChild(el('span', 'qnum', 'Q' + (qi + 1)));
      var qt = el('span', 'qtext', q.q);
      if (q.supp) qt.appendChild(el('span', 'supp-tag', 'Supplementary'));
      head.appendChild(qt);
      card.appendChild(head);
      if (q.code) {
        var pre = el('pre', 'qcode');
        pre.textContent = q.code;
        card.appendChild(pre);
      }
      var opts = el('div', 'opts');
      var keys = ['A', 'B', 'C', 'D', 'E'];
      var buttons = q.opts.map(function (opt, oi) {
        var b = el('button', 'opt');
        b.type = 'button';
        b.setAttribute('aria-pressed', 'false');
        b.appendChild(el('span', 'key', keys[oi]));
        b.appendChild(el('span', '', opt));
        b.addEventListener('click', function () {
          if (graded) return;
          picks[qi] = oi;
          buttons.forEach(function (x, xi) { x.setAttribute('aria-pressed', xi === oi ? 'true' : 'false'); });
          updateScore();
        });
        opts.appendChild(b);
        return b;
      });
      card.appendChild(opts);
      var why = el('div', 'why');
      card.appendChild(why);
      return { card: card, buttons: buttons, why: why };
    });
    cards.forEach(function (c) { list.appendChild(c.card); });

    function updateScore() {
      if (graded) return;
      var answered = picks.filter(function (p) { return p !== null; }).length;
      score.textContent = answered + ' / ' + questions.length + ' answered';
    }

    gradeBtn.addEventListener('click', function () {
      if (graded) return;
      var unanswered = picks.filter(function (p) { return p === null; }).length;
      if (unanswered > 0 && !window.confirm(unanswered + ' question' + (unanswered === 1 ? ' is' : 's are') + ' unanswered. Grade anyway?')) return;
      graded = true;
      var correct = 0;
      questions.forEach(function (q, qi) {
        var c = cards[qi];
        c.card.classList.add('graded');
        c.buttons.forEach(function (b, oi) {
          if (oi === q.a) b.classList.add('right');
          else if (picks[qi] === oi) b.classList.add('wrong-pick');
          b.disabled = true;
        });
        if (picks[qi] === q.a) correct++;
        c.why.innerHTML = '<strong>' + (picks[qi] === q.a ? 'Correct.' : 'Answer: ' + ['A', 'B', 'C', 'D', 'E'][q.a] + '.') + '</strong> ' + q.why;
      });
      var pct = Math.round(100 * correct / questions.length);
      score.innerHTML = 'Score: <span class="' + (pct >= 70 ? 'good' : '') + '">' + correct + ' / ' + questions.length + ' (' + pct + '%)</span>';
      gradeBtn.disabled = true;
    });

    resetBtn.addEventListener('click', function () {
      graded = false;
      picks = new Array(questions.length).fill(null);
      gradeBtn.disabled = false;
      questions.forEach(function (q, qi) {
        var c = cards[qi];
        c.card.classList.remove('graded');
        c.buttons.forEach(function (b) {
          b.disabled = false;
          b.classList.remove('right', 'wrong-pick');
          b.setAttribute('aria-pressed', 'false');
        });
        c.why.innerHTML = '';
      });
      updateScore();
    });
  }

  // ───────────── runnable / reveal exercises ─────────────
  function initExercises(data) {
    var mount = document.getElementById('exercises-root');
    if (!mount || !data || !data.exercises) return;
    data.exercises.forEach(function (ex, i) {
      mount.appendChild(ex.type === 'text' ? buildTextExercise(ex, i) : buildCodeExercise(ex, i));
    });
  }

  function buildTextExercise(ex, i) {
    var card = el('article', 'ex');
    var head = el('div', 'ex-head');
    var tag1 = el('span', 'ex-tag', 'Exercise ' + (i + 1) + ' · on paper');
    head.appendChild(tag1);
    if (ex.supp) head.appendChild(el('span', 'supp-tag', 'Supplementary'));
    head.appendChild(el('h3', '', ex.title));
    head.appendChild(el('div', 'brief', ex.brief));
    card.appendChild(head);
    var body = el('div', 'reveal-body');
    var det = el('details', 'solution');
    det.appendChild(el('summary', '', 'Show a sample solution'));
    var pre = el('pre', 'plain');
    pre.textContent = ex.solutionText;
    det.appendChild(pre);
    body.appendChild(det);
    card.appendChild(body);
    return card;
  }

  function buildCodeExercise(ex, i) {
    var card = el('article', 'ex');
    var head = el('div', 'ex-head');
    head.appendChild(el('span', 'ex-tag', 'Exercise ' + (i + 1) + ' · run it'));
    if (ex.supp) head.appendChild(el('span', 'supp-tag', 'Supplementary'));
    head.appendChild(el('h3', '', ex.title));
    head.appendChild(el('div', 'brief', ex.brief));
    card.appendChild(head);

    var body = el('div', 'ex-body');
    var cols = el('div', 'ex-cols');

    var left = el('div');
    left.appendChild(el('label', 'field-label', 'Your code'));
    var editor = makeEditor({ label: 'C++ code editor for ' + ex.title, minHeight: '15rem',
      fileName: (String(ex.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'exercise') + '.cpp',
      fullscreen: function () { return card; } });
    editor.value = ex.starter;
    left.appendChild(editor.root);
    cols.appendChild(left);

    var right = el('div');
    var stdinLabel = el('label', 'field-label', 'Input (stdin)');
    right.appendChild(stdinLabel);
    var stdin = el('textarea', 'stdin-edit');
    stdin.spellcheck = false;
    stdin.value = (ex.tests && ex.tests.length) ? ex.tests[0].stdin : '';
    stdin.setAttribute('aria-label', 'Program input for ' + ex.title);
    right.appendChild(stdin);
    var outLabel = el('label', 'field-label', 'Output');
    right.appendChild(outLabel);
    var term = el('div', 'term');
    right.appendChild(term);
    cols.appendChild(right);
    body.appendChild(cols);
    var io = makeIo({ editor: editor, stdinLabel: stdinLabel, stdin: stdin, outLabel: outLabel, term: term });
    io.reset();

    var actions = el('div', 'ex-actions');
    var runBtn = el('button', 'btn primary', '▶ Run');
    actions.appendChild(runBtn);
    var testBtn = null;
    if (ex.tests && ex.tests.length) {
      testBtn = el('button', 'btn ghost', 'Run sample tests (' + ex.tests.length + ')');
      actions.appendChild(testBtn);
    }
    var realBtn = makeRealRunButton(io);
    if (realBtn) actions.appendChild(realBtn);
    var resetBtn = el('button', 'btn ghost small', 'Reset code');
    actions.appendChild(resetBtn);
    body.appendChild(actions);

    var testsBox = el('div', 'tests');
    body.appendChild(testsBox);

    if (ex.solution) {
      var det = el('details', 'solution');
      det.appendChild(el('summary', '', 'Stuck? Show the solution'));
      var pre = el('pre');
      pre.textContent = ex.solution;
      det.appendChild(pre);
      var loadBtn = el('button', 'btn ghost small', 'Load solution into the editor');
      loadBtn.addEventListener('click', function () { editor.value = ex.solution; });
      det.appendChild(loadBtn);
      body.appendChild(det);
    }
    card.appendChild(body);

    runBtn.addEventListener('click', function () { io.run('mini'); });
    editor.textarea.addEventListener('keydown', function (ev) {
      if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter') { ev.preventDefault(); runBtn.click(); }
    });
    resetBtn.addEventListener('click', function () {
      editor.value = ex.starter;
      testsBox.innerHTML = '';
      io.reset();
    });
    if (testBtn) testBtn.addEventListener('click', function () {
      testsBox.innerHTML = '';
      var allPass = true;
      ex.tests.forEach(function (t, ti) {
        var r = runCode(editor.value, t.stdin);
        var pass = !r.error && r.out === t.expect;
        if (!pass) allPass = false;
        var row = el('div', 'test-row ' + (pass ? 'pass' : 'fail'));
        row.appendChild(el('span', 'st', pass ? '✓' : '✗'));
        row.appendChild(el('span', '', 'test ' + (ti + 1) + ' · stdin: ' + (t.stdin === '' ? '(empty)' : JSON.stringify(t.stdin))));
        if (!pass) {
          var msg = r.error
            ? 'error: ' + r.error.msg
            : 'expected ' + JSON.stringify(t.expect) + '\ngot      ' + JSON.stringify(r.out);
          row.appendChild(el('div', 'diff', escapeHtml(msg)));
        }
        testsBox.appendChild(row);
      });
      var sum = el('div', 'test-row ' + (allPass ? 'pass' : 'fail'));
      sum.appendChild(el('span', 'st', allPass ? '✓ all tests passed — nice work!' : '✗ some tests failed — check the diffs above'));
      testsBox.appendChild(sum);
    });
    return card;
  }

  // ───────────── standalone playground ─────────────
  function initPlayground() {
    var mount = document.getElementById('playground-root');
    if (!mount) return;
    var presets = window.PLAYGROUND_PRESETS || [];

    var bar = el('div', 'ex-actions');
    var sel = el('select');
    sel.className = 'preset-select';
    sel.setAttribute('aria-label', 'Example programs');
    presets.forEach(function (p, i) {
      var o = el('option', '', '');
      o.value = String(i);
      o.textContent = p.name;
      sel.appendChild(o);
    });
    bar.appendChild(sel);
    var runBtn = el('button', 'btn primary', '▶ Run  (Ctrl+Enter)');
    bar.appendChild(runBtn);
    mount.appendChild(bar);

    var cols = el('div', 'ex-cols');
    var left = el('div');
    left.appendChild(el('label', 'field-label', 'Code — the CO1005 C++ subset'));
    var editor = makeEditor({ label: 'C++ code editor', minHeight: '22rem', fileName: 'playground.cpp',
      fullscreen: function () { return mount; } });
    left.appendChild(editor.root);
    cols.appendChild(left);
    var right = el('div');
    var stdinLabel = el('label', 'field-label', 'Input (stdin) — values your program reads with cin');
    right.appendChild(stdinLabel);
    var stdin = el('textarea', 'stdin-edit');
    stdin.spellcheck = false;
    stdin.setAttribute('aria-label', 'Program input');
    right.appendChild(stdin);
    var outLabel = el('label', 'field-label', 'Output');
    right.appendChild(outLabel);
    var term = el('div', 'term');
    term.style.minHeight = '14rem';
    right.appendChild(term);
    cols.appendChild(right);
    mount.appendChild(cols);
    var io = makeIo({ editor: editor, stdinLabel: stdinLabel, stdin: stdin, outLabel: outLabel, term: term });
    var realBtn = makeRealRunButton(io);
    if (realBtn) bar.appendChild(realBtn);

    function loadPreset(i) {
      var p = presets[i];
      if (!p) return;
      editor.value = p.code;
      stdin.value = p.stdin || '';
      io.reset();
    }
    sel.addEventListener('change', function () { loadPreset(+sel.value); });
    runBtn.addEventListener('click', function () { io.run('mini'); });
    editor.textarea.addEventListener('keydown', function (ev) {
      if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter') { ev.preventDefault(); runBtn.click(); }
    });
    loadPreset(0);
  }

  // ───────────── collapsible sections (chapter pages) ─────────────
  function initFolds() {
    if (!document.getElementById('quiz-root')) return; // chapter pages only
    var sections = document.querySelectorAll('section.block');
    var folds = {}; // section id -> {head, body, section}

    sections.forEach(function (sec) {
      var wrap = sec.querySelector(':scope > .wrap');
      var head = wrap && wrap.querySelector(':scope > .sec-head');
      if (!wrap || !head) return;
      var body = document.createElement('div');
      body.className = 'fold-body';
      var pagenav = null;
      var after = [];
      var node = head.nextSibling;
      while (node) { after.push(node); node = node.nextSibling; }
      after.forEach(function (n) {
        if (n.nodeType === 1 && n.classList.contains('pagenav')) { pagenav = n; return; }
        body.appendChild(n);
      });
      wrap.insertBefore(body, pagenav || null);

      head.classList.add('foldable');
      head.setAttribute('role', 'button');
      head.setAttribute('tabindex', '0');
      function setOpen(open) {
        head.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) body.removeAttribute('hidden'); else body.setAttribute('hidden', '');
        sec.classList.toggle('folded', !open);
      }
      setOpen(false);
      function toggle() { setOpen(head.getAttribute('aria-expanded') !== 'true'); }
      head.addEventListener('click', toggle);
      head.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggle(); }
      });
      if (sec.id) folds[sec.id] = { setOpen: setOpen, section: sec };
    });

    function openForHash() {
      var id = location.hash.replace('#', '');
      if (id && folds[id]) {
        folds[id].setOpen(true);
        folds[id].section.scrollIntoView();
      }
    }
    window.addEventListener('hashchange', openForHash);
    openForHash();
    // clicking a same-page anchor to an already-current hash still opens the fold
    document.addEventListener('click', function (ev) {
      var a = ev.target.closest && ev.target.closest('a[href^="#"]');
      if (!a) return;
      var id = a.getAttribute('href').slice(1);
      if (folds[id]) folds[id].setOpen(true);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initTheme();
    initTopbarViewControls();
    var data = window.CHAPTER_DATA;
    initQuiz(data);
    initExercises(data);
    initPlayground();
    initFolds();
  });

  // ───────────── exposed for standalone pages (e.g. tutorials/*.html) ─────────────
  // Tutorial pages use window.TUTORIAL_DATA instead of window.CHAPTER_DATA, so the
  // DOMContentLoaded auto-render above (which only looks at CHAPTER_DATA) skips them
  // by design. They call CO1005.renderExercises themselves in a small inline <script>.
  // Purely additive: does not change how chapter pages render via CHAPTER_DATA.
  window.CO1005 = window.CO1005 || {};
  window.CO1005.buildCodeExercise = buildCodeExercise;
  window.CO1005.renderExercises = function (container, exercises) {
    (exercises || []).forEach(function (ex, i) {
      container.appendChild(buildCodeExercise(ex, i));
    });
  };
})();
