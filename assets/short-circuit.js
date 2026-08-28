/* Short-Circuit Lab — mini app for CO1005 Supplementary Topic S9.
   A chain of boolean terms joined by a single operator (&& or ||),
   evaluated one real "function call" at a time, left to right — exactly
   how C++ evaluates it. Once the result is decided, every remaining term
   is skipped: it is never called, and any side effect it would have had
   never happens. Mount point: #sc-root. Pure engine exported for Node tests.  */
(function (global) {
  'use strict';

  function create(preset) {
    return { preset: preset, idx: -1, log: [], result: null, halted: false };
  }

  function step(state) {
    if (state.halted) return state;
    var terms = state.preset.terms, op = state.preset.op;
    state.idx++;
    if (state.idx >= terms.length) { state.halted = true; return state; }
    var t = terms[state.idx];
    state.log.push(t.log);
    var v = t.result;
    var decisive = (op === '&&' && v === false) || (op === '||' && v === true);
    if (decisive || state.idx === terms.length - 1) {
      state.result = v;
      state.halted = true;
    }
    return state;
  }

  function runToEnd(state) {
    var guard = 0;
    while (!state.halted && guard++ <= 1000) step(state);
    return state;
  }

  var PRESETS = [
    { key: 'guard-safe', op: '&&',
      name: 'Safe guard — check before you use (&&)',
      cpp: 'int idx = -1;\nif (idx >= 0 && idx < n && arr[idx] > 0) {\n    cout << "positive";\n}',
      terms: [
        { code: 'idx >= 0', result: false, log: 'idx >= 0   →  -1 >= 0   →  false' },
        { code: 'idx < n', result: true, log: 'idx < n    →  -1 < 5    →  true' },
        { code: 'arr[idx] > 0', result: true, log: 'arr[idx] > 0  →  arr[-1] > 0', danger: true,
          dangerNote: 'Reading arr[-1] would be undefined behaviour in real C++ — and it never runs, because the first term already failed.' }
      ] },
    { key: 'guard-unsafe', op: '&&',
      name: 'Same guard, wrong order — the near-crash',
      cpp: 'int idx = -1;\nif (arr[idx] > 0 && idx >= 0 && idx < n) {\n    cout << "positive";\n}',
      terms: [
        { code: 'arr[idx] > 0', result: false, log: 'arr[idx] > 0  →  arr[-1] > 0  →  (simulated) false', danger: true,
          dangerNote: 'This runs FIRST, before idx is ever checked. In real C++, arr[-1] is undefined behaviour — it might crash, or silently return garbage. Writing the bounds check first (previous preset) is what actually prevents this.' },
        { code: 'idx >= 0', result: false, log: 'idx >= 0   →  -1 >= 0   →  false' },
        { code: 'idx < n', result: true, log: 'idx < n    →  -1 < 5    →  true' }
      ] },
    { key: 'or-permission', op: '||',
      name: 'OR short-circuit — first match wins',
      cpp: 'if (isOwner || isAdmin || isModerator || isSuperUser) {\n    cout << "access granted";\n}',
      terms: [
        { code: 'isOwner', result: false, log: 'isOwner      →  false' },
        { code: 'isAdmin', result: true, log: 'isAdmin      →  true' },
        { code: 'isModerator', result: false, log: 'isModerator  →  (never called)' },
        { code: 'isSuperUser', result: true, log: 'isSuperUser  →  (never called)' }
      ] },
    { key: 'or-sideeffect', op: '||',
      name: 'The side effect you did not expect',
      cpp: 'if (hasCache() || computeExpensive()) {\n    cout << "ready";\n}',
      terms: [
        { code: 'hasCache()', result: true, log: 'hasCache()        →  true' },
        { code: 'computeExpensive()', result: true, log: 'computeExpensive()  →  runs a slow calculation, then true', danger: true,
          dangerNote: 'computeExpensive() would also update a running total as a side effect. Because hasCache() already answered true, it never runs — and that side effect never happens either.' }
      ] },
    { key: 'all-evaluated', op: '&&',
      name: 'The worst case — nothing gets skipped',
      cpp: 'if (ageOK && hasLicense && hasInsurance && passedTest) {\n    cout << "cleared to drive";\n}',
      terms: [
        { code: 'ageOK', result: true, log: 'ageOK         →  true' },
        { code: 'hasLicense', result: true, log: 'hasLicense    →  true' },
        { code: 'hasInsurance', result: true, log: 'hasInsurance  →  true' },
        { code: 'passedTest', result: true, log: 'passedTest    →  true' }
      ] }
  ];

  var ShortCircuit = { create: create, step: step, runToEnd: runToEnd, PRESETS: PRESETS };

  // ───────────── UI ─────────────
  function mount() {
    var host = document.getElementById('sc-root');
    if (!host) return;
    function el(tag, cls, html) {
      var n = document.createElement(tag);
      if (cls) n.className = cls;
      if (html !== undefined) n.innerHTML = html;
      return n;
    }
    function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

    var panel = el('div', 'run-panel');
    panel.appendChild(el('h4', '', 'Pick a chain — then step through the real calls'));

    var bar = el('div', 'ex-actions');
    var sel = el('select', 'preset-select');
    sel.setAttribute('aria-label', 'Example expressions');
    PRESETS.forEach(function (p, i) {
      var o = el('option'); o.value = String(i); o.textContent = p.name; sel.appendChild(o);
    });
    bar.appendChild(sel);
    var stepBtn = el('button', 'btn primary', '⏭ Step');
    var runBtn = el('button', 'btn ghost', '▶ Run to end');
    var resetBtn = el('button', 'btn ghost small', '↺ Restart');
    bar.appendChild(stepBtn); bar.appendChild(runBtn); bar.appendChild(resetBtn);
    panel.appendChild(bar);

    panel.appendChild(el('label', 'field-label', 'The C++ you wrote'));
    var cppBox = el('pre', 'jm-cpp');
    panel.appendChild(cppBox);

    panel.appendChild(el('label', 'field-label', 'The expression, left to right'));
    var chain = el('div', 'sc-chain');
    panel.appendChild(chain);
    var dangerNote = el('div', 'note danger sc-danger-note');
    dangerNote.style.display = 'none';
    panel.appendChild(dangerNote);

    var status = el('div', 'sim-status');
    status.setAttribute('role', 'status');
    panel.appendChild(status);

    var cols = el('div', 'run-cols');
    var left = el('div');
    left.appendChild(el('label', 'field-label', 'Call log — what actually executed'));
    var term = el('div', 'term');
    left.appendChild(term);
    cols.appendChild(left);
    var right = el('div');
    right.appendChild(el('label', 'field-label', 'Result &amp; tally'));
    var resultBox = el('div', 'sc-result mono');
    right.appendChild(resultBox);
    cols.appendChild(right);
    panel.appendChild(cols);
    host.appendChild(panel);

    var preset = PRESETS[0], st = null;

    function load(i) {
      preset = PRESETS[i];
      st = create(preset);
      cppBox.textContent = preset.cpp;
      render();
    }

    function render() {
      var terms = preset.terms;
      chain.innerHTML = terms.map(function (t, i) {
        var cls = 'sc-term', tag = '';
        if (i <= st.idx) {
          cls += t.result ? ' sc-true' : ' sc-false';
          if (i === st.idx) cls += ' sc-current';
        } else if (st.halted) {
          cls += ' sc-skipped'; tag = ' <span class="sc-badge">never called</span>';
        } else {
          cls += ' sc-pending';
        }
        var chip = '<span class="' + cls + '">' + esc(t.code) + tag + '</span>';
        return i === 0 ? chip : '<span class="sc-op">' + esc(preset.op) + '</span>' + chip;
      }).join('');

      var danger = null;
      terms.forEach(function (t, i) { if (i <= st.idx && t.danger) danger = t; });
      if (danger) {
        dangerNote.style.display = '';
        dangerNote.innerHTML = '<span class="note-tag">Watch out</span>' + esc(danger.dangerNote);
      } else {
        dangerNote.style.display = 'none';
      }

      term.innerHTML = st.log.length
        ? st.log.map(function (l) { return esc(l); }).join('\n')
        : '<span class="t-empty">Nothing called yet.</span>';

      var evaluated = st.idx + 1;
      if (st.result === null) {
        resultBox.innerHTML = '<div>Result so far: <strong>…</strong></div><div>' + evaluated + ' of ' + terms.length + ' terms called</div>';
      } else {
        var skipped = terms.length - evaluated;
        resultBox.innerHTML = '<div>Final result: <strong>' + (st.result ? 'true' : 'false') + '</strong></div>' +
          '<div>' + evaluated + ' of ' + terms.length + ' terms called' +
          (skipped ? ', <strong>' + skipped + ' skipped</strong>' : ' — none skipped') + '</div>';
      }

      status.className = 'sim-status' + (st.halted ? ' done' : st.idx >= 0 ? ' running' : '');
      status.textContent = st.halted
        ? 'Done — ' + (preset.op === '&&' ? 'an && chain stops at the first false.' : 'an || chain stops at the first true.')
        : (st.idx < 0 ? 'Ready — press Step to call the first term.' : 'Step ' + (st.idx + 1) + ' called.');
    }

    sel.addEventListener('change', function () { load(+sel.value); });
    stepBtn.addEventListener('click', function () { step(st); render(); });
    runBtn.addEventListener('click', function () { runToEnd(st); render(); });
    resetBtn.addEventListener('click', function () { st = create(preset); render(); });
    load(0);
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = ShortCircuit;
  else {
    global.ShortCircuit = ShortCircuit;
    document.addEventListener('DOMContentLoaded', mount);
  }
})(typeof window !== 'undefined' ? window : this);
