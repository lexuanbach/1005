/* CO1005 shared page engine: theme toggle, MCQ quiz, runnable exercises,
   and the standalone playground. Depends on assets/minicpp.js for running C++. */
(function () {
  'use strict';

  // ───────────── Theme toggle (same storage key as index.html) ─────────────
  var root = document.documentElement;
  try {
    var storedTheme = localStorage.getItem('co1005-theme');
    if (storedTheme === 'dark' || storedTheme === 'light') root.dataset.theme = storedTheme;
  } catch (e) {}

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

  function hlCpp(src) {
    var re = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\\n]|\\.)*"?)|('(?:[^'\\\n]|\\.)*'?)|(#[ \t]*\w+(?:[ \t]*<[^>\n]*>)?)|(\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?[fFlLuU]*)|([A-Za-z_]\w*)|(<<|>>|::|->|[+\-*/%=!<>&|^?:~])/g;
    var out = '', last = 0, m;
    function push(text, cls) {
      var e = escapeHtml(text);
      out += cls ? '<span class="' + cls + '">' + e + '</span>' : e;
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
    return out + '\n'; // trailing newline keeps pre and textarea the same height
  }

  /* Editor = highlighted <pre> behind a transparent <textarea>. */
  function makeEditor(opts) {
    var shell = el('div', 'editor-shell');
    var pre = el('pre', 'hl-pre-layer');
    pre.setAttribute('aria-hidden', 'true');
    var code = el('code');
    pre.appendChild(code);
    var ta = el('textarea', 'code-edit');
    ta.spellcheck = false;
    if (opts && opts.label) ta.setAttribute('aria-label', opts.label);
    if (opts && opts.minHeight) { shell.style.minHeight = opts.minHeight; }
    shell.appendChild(pre);
    shell.appendChild(ta);
    function refresh() { code.innerHTML = hlCpp(ta.value); }
    function syncScroll() { pre.scrollTop = ta.scrollTop; pre.scrollLeft = ta.scrollLeft; }
    ta.addEventListener('input', refresh);
    ta.addEventListener('scroll', syncScroll);
    enableTabKey(ta);
    return {
      root: shell,
      textarea: ta,
      get value() { return ta.value; },
      set value(v) { ta.value = v; refresh(); syncScroll(); }
    };
  }
  function runCode(code, stdin) {
    var out = '';
    var res = window.MiniCPP.run(code, stdin, { write: function (s) { out += s; } });
    return { out: out, exit: res.exit, error: res.error };
  }
  function renderTerm(term, result) {
    term.innerHTML = '';
    if (result.out) term.appendChild(el('span', '', escapeHtml(result.out)));
    else if (!result.error) term.appendChild(el('span', 't-empty', '(no output)'));
    if (result.error) {
      var e = result.error;
      var where = e.line ? 'line ' + e.line + ': ' : '';
      term.appendChild(el('div', 't-err', escapeHtml((e.stage === 'compile' ? 'compile error — ' : 'runtime error — ') + where + e.msg)));
    } else {
      term.appendChild(el('div', 't-status', '── program finished with exit code ' + result.exit + ' ──'));
    }
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
    var editor = makeEditor({ label: 'C++ code editor for ' + ex.title, minHeight: '15rem' });
    editor.value = ex.starter;
    left.appendChild(editor.root);
    cols.appendChild(left);

    var right = el('div');
    right.appendChild(el('label', 'field-label', 'Input (stdin)'));
    var stdin = el('textarea', 'stdin-edit');
    stdin.spellcheck = false;
    stdin.value = (ex.tests && ex.tests.length) ? ex.tests[0].stdin : '';
    stdin.setAttribute('aria-label', 'Program input for ' + ex.title);
    right.appendChild(stdin);
    right.appendChild(el('label', 'field-label', 'Output'));
    var term = el('div', 'term');
    term.appendChild(el('span', 't-empty', 'Press “Run” to execute your program.'));
    right.appendChild(term);
    cols.appendChild(right);
    body.appendChild(cols);

    var actions = el('div', 'ex-actions');
    var runBtn = el('button', 'btn primary', '▶ Run');
    actions.appendChild(runBtn);
    var testBtn = null;
    if (ex.tests && ex.tests.length) {
      testBtn = el('button', 'btn ghost', 'Run sample tests (' + ex.tests.length + ')');
      actions.appendChild(testBtn);
    }
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

    runBtn.addEventListener('click', function () {
      renderTerm(term, runCode(editor.value, stdin.value));
    });
    editor.textarea.addEventListener('keydown', function (ev) {
      if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter') { ev.preventDefault(); runBtn.click(); }
    });
    resetBtn.addEventListener('click', function () {
      editor.value = ex.starter;
      testsBox.innerHTML = '';
      term.innerHTML = '';
      term.appendChild(el('span', 't-empty', 'Press “Run” to execute your program.'));
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
    var editor = makeEditor({ label: 'C++ code editor', minHeight: '22rem' });
    left.appendChild(editor.root);
    cols.appendChild(left);
    var right = el('div');
    right.appendChild(el('label', 'field-label', 'Input (stdin) — values your program reads with cin'));
    var stdin = el('textarea', 'stdin-edit');
    stdin.spellcheck = false;
    stdin.setAttribute('aria-label', 'Program input');
    right.appendChild(stdin);
    right.appendChild(el('label', 'field-label', 'Output'));
    var term = el('div', 'term');
    term.style.minHeight = '14rem';
    right.appendChild(term);
    cols.appendChild(right);
    mount.appendChild(cols);

    function loadPreset(i) {
      var p = presets[i];
      if (!p) return;
      editor.value = p.code;
      stdin.value = p.stdin || '';
      term.innerHTML = '';
      term.appendChild(el('span', 't-empty', 'Press “Run” to execute the program.'));
    }
    sel.addEventListener('change', function () { loadPreset(+sel.value); });
    runBtn.addEventListener('click', function () { renderTerm(term, runCode(editor.value, stdin.value)); });
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
    var data = window.CHAPTER_DATA;
    initQuiz(data);
    initExercises(data);
    initPlayground();
    initFolds();
  });
})();
