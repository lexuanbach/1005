/* Loop vs. Recursion Race — mini app for CO1005 Supplementary Topic S10.
   Runs a real iterative program and a real recursive program that compute
   the SAME result through MiniCPP's execution trace (opts.trace, the same
   hook the S7 Call Stack Visualizer uses) and replays both side by side,
   one shared Step at a time: a flat variable table that mutates in place
   next to a call stack that grows and shrinks. Mount point: #rc-root.
   Engine-testable via buildTrace / create / step / runToEnd.            */
(function (global) {
  'use strict';

  var PRESETS = [
    { key: 'sum', name: 'Sum 1..5',
      loopSrc: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int n = 5, i = 1, total = 0;\n    while (i <= n) {\n        total = total + i;\n        i = i + 1;\n    }\n    cout << total << endl;\n    return 0;\n}\n',
      recSrc: '#include <iostream>\nusing namespace std;\n\nint sum(int n) {\n    if (n == 0)\n        return 0;\n    return n + sum(n - 1);\n}\n\nint main() {\n    cout << sum(5) << endl;\n    return 0;\n}\n' },
    { key: 'fact', name: 'Factorial(5)',
      loopSrc: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int n = 5, i = 1, result = 1;\n    while (i <= n) {\n        result = result * i;\n        i = i + 1;\n    }\n    cout << result << endl;\n    return 0;\n}\n',
      recSrc: '#include <iostream>\nusing namespace std;\n\nint fact(int n) {\n    if (n <= 1)\n        return 1;\n    return n * fact(n - 1);\n}\n\nint main() {\n    cout << fact(5) << endl;\n    return 0;\n}\n' },
    { key: 'runaway', name: 'Missing base case — two different failures',
      loopSrc: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int n = 1;\n    while (n >= 1) {\n        n = n + 1;   // never makes the condition false\n    }\n    return 0;\n}\n',
      recSrc: '#include <iostream>\nusing namespace std;\n\nint countBad(int n) {\n    if (n == 0)\n        return 0;\n    return n + countBad(n + 1);   // moves AWAY, not toward, 0\n}\n\nint main() {\n    cout << countBad(1) << endl;\n    return 0;\n}\n' }
  ];

  function buildTrace(src) {
    var events = [];
    var M = (typeof module !== 'undefined' && module.exports) ? require('./minicpp.js') : global.MiniCPP;
    var res = M.run(src, '', { write: function () {}, trace: function (e) { events.push(e); } });
    return { events: events, error: res.error };
  }

  function peakDepth(trace) {
    var m = 0;
    trace.events.forEach(function (e) { if (e && e.stack) m = Math.max(m, e.stack.length); });
    return m;
  }

  function create(preset) {
    return { preset: preset, loop: buildTrace(preset.loopSrc), rec: buildTrace(preset.recSrc), li: -1, ri: -1 };
  }

  function step(state) {
    if (state.li < state.loop.events.length - 1) state.li++;
    if (state.ri < state.rec.events.length - 1) state.ri++;
    return state;
  }

  function runToEnd(state) {
    state.li = state.loop.events.length - 1;
    state.ri = state.rec.events.length - 1;
    return state;
  }

  var RecursionLab = { PRESETS: PRESETS, buildTrace: buildTrace, peakDepth: peakDepth, create: create, step: step, runToEnd: runToEnd };

  // ───────────── UI ─────────────
  function mount() {
    var host = document.getElementById('rc-root');
    if (!host) return;
    function el(tag, cls, html) {
      var n = document.createElement(tag);
      if (cls) n.className = cls;
      if (html !== undefined) n.innerHTML = html;
      return n;
    }
    function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

    var panel = el('div', 'run-panel');
    panel.appendChild(el('h4', '', 'Pick a task — one Step advances both at once'));

    var bar = el('div', 'ex-actions');
    var sel = el('select', 'preset-select');
    sel.setAttribute('aria-label', 'Example tasks');
    PRESETS.forEach(function (p, i) {
      var o = el('option'); o.value = String(i); o.textContent = p.name; sel.appendChild(o);
    });
    bar.appendChild(sel);
    var stepBtn = el('button', 'btn primary', '⏭ Step');
    var runBtn = el('button', 'btn ghost', '▶ Run to end');
    var resetBtn = el('button', 'btn ghost small', '↺ Restart');
    bar.appendChild(stepBtn); bar.appendChild(runBtn); bar.appendChild(resetBtn);
    panel.appendChild(bar);

    var status = el('div', 'sim-status');
    status.setAttribute('role', 'status');
    panel.appendChild(status);

    var cols = el('div', 'run-cols cs-cols');

    var loopCol = el('div');
    loopCol.appendChild(el('label', 'field-label', 'Iteration — the loop (constant memory)'));
    var loopSrcBox = el('div', 'jm-listing cs-src');
    loopCol.appendChild(loopSrcBox);
    loopCol.appendChild(el('label', 'field-label', 'Variables'));
    var loopVars = el('div', 'vars-box');
    loopCol.appendChild(loopVars);
    var loopStat = el('div', 'rc-stat mono');
    loopCol.appendChild(loopStat);
    var loopNote = el('div', 'note rc-note');
    loopNote.style.display = 'none';
    loopCol.appendChild(loopNote);
    cols.appendChild(loopCol);

    var recCol = el('div');
    recCol.appendChild(el('label', 'field-label', 'Recursion — the call stack (grows with depth)'));
    var recSrcBox = el('div', 'jm-listing cs-src');
    recCol.appendChild(recSrcBox);
    recCol.appendChild(el('label', 'field-label', 'Call stack — newest frame on top'));
    var recStack = el('div', 'cs-stack');
    recCol.appendChild(recStack);
    var recStat = el('div', 'rc-stat mono');
    recCol.appendChild(recStat);
    var recNote = el('div', 'note rc-note');
    recNote.style.display = 'none';
    recCol.appendChild(recNote);
    cols.appendChild(recCol);

    panel.appendChild(cols);
    host.appendChild(panel);

    var preset = PRESETS[0], st = null, loopSrcLines = [], recSrcLines = [];

    function load(i) {
      preset = PRESETS[i];
      st = create(preset);
      loopSrcLines = preset.loopSrc.split('\n');
      recSrcLines = preset.recSrc.split('\n');
      render();
    }

    function renderSrc(box, lines, hlLine) {
      box.innerHTML = lines.map(function (l, i) {
        return '<div class="jm-line' + (i + 1 === hlLine ? ' jm-pc' : '') + '">' +
          '<span class="jm-no">' + (i + 1 === hlLine ? '▶' : (i + 1)) + '</span>' + esc(l || ' ') + '</div>';
      }).join('');
    }

    function render() {
      var le = st.li >= 0 ? st.loop.events[st.li] : null;
      var re = st.ri >= 0 ? st.rec.events[st.ri] : null;

      // ── loop column ──
      renderSrc(loopSrcBox, loopSrcLines, le && !le.truncated ? le.line : -1);
      if (!le) {
        loopVars.innerHTML = '<div class="empty">Not started — press Step.</div>';
      } else if (le.truncated) {
        loopVars.innerHTML = '<div class="empty">(trace stopped recording — the program kept running past this point)</div>';
      } else {
        var lv = le.stack[le.stack.length - 1].vars;
        loopVars.innerHTML = lv.length
          ? '<table><tr><th>name</th><th>value</th></tr>' + lv.map(function (v) {
              return '<tr><td>' + esc(v.name) + '</td><td>' + esc(v.value) + '</td></tr>';
            }).join('') + '</table>'
          : '<div class="empty">No variables yet.</div>';
      }
      var loopDone = st.li >= st.loop.events.length - 1;
      loopStat.textContent = 'Step ' + (st.li + 1) + ' of ' + st.loop.events.length +
        (loopDone ? (le && le.out ? ' · printed: ' + le.out.trim() : '') : '');
      if (loopDone && st.loop.error) {
        loopNote.style.display = '';
        loopNote.className = 'note danger rc-note';
        loopNote.innerHTML = '<span class="note-tag">Stopped safely</span>' + esc(st.loop.error.msg) +
          ' — ' + st.loop.events.length + ' recorded steps, stack stayed at a single frame the whole time.';
      } else { loopNote.style.display = 'none'; }

      // ── recursion column ──
      renderSrc(recSrcBox, recSrcLines, re && !re.truncated ? re.line : -1);
      if (!re) {
        recStack.innerHTML = '<div class="cs-empty">Not started — press Step.</div>';
      } else if (re.truncated) {
        recStack.innerHTML = '<div class="cs-empty">(trace stopped recording — the real call stack kept growing past this point)</div>';
      } else {
        var frames = re.stack.slice().reverse();
        recStack.innerHTML = frames.map(function (f, i) {
          return '<div class="cs-frame' + (i === 0 ? ' cs-top' : '') + '">' +
            '<div class="cs-fname">' + esc(f.name) + '()' + (i === 0 ? ' <small>← running</small>' : ' <small>waiting</small>') + '</div>' +
            (f.vars.length ? f.vars.map(function (v) {
              return '<div class="cs-var"><span>' + esc(v.name) + '</span><b>' + esc(v.value) + '</b></div>';
            }).join('') : '<div class="cs-var cs-none">(no locals yet)</div>') +
            '</div>';
        }).join('');
      }
      var recDone = st.ri >= st.rec.events.length - 1;
      var peak = peakDepth(st.rec);
      recStat.textContent = 'Call ' + (st.ri + 1) + ' of ' + st.rec.events.length + ' · peak depth so far: ' +
        (re && !re.truncated ? re.stack.length : peak) + ' frame' + ((re && !re.truncated ? re.stack.length : peak) === 1 ? '' : 's') +
        (recDone && re && !re.truncated && re.out ? ' · printed: ' + re.out.trim() : '');
      if (recDone && st.rec.error) {
        recNote.style.display = '';
        recNote.className = 'note danger rc-note';
        recNote.innerHTML = '<span class="note-tag">Real crash</span>' + esc(st.rec.error.msg) +
          ' — ' + st.rec.events.length + ' recorded steps, the stack had already reached ' + peak + ' frames deep before it gave up.';
      } else { recNote.style.display = 'none'; }

      // ── shared status ──
      if (st.li < 0 && st.ri < 0) {
        status.className = 'sim-status';
        status.textContent = 'Ready — press Step to run both one unit of work at a time.';
      } else if (loopDone && recDone) {
        status.className = 'sim-status done';
        status.textContent = 'Both finished — the loop took ' + st.loop.events.length + ' recorded steps in 1 frame; ' +
          'the recursion took ' + st.rec.events.length + ' recorded steps and reached ' + peak + ' frames deep at its worst.';
      } else {
        status.className = 'sim-status running';
        status.textContent = 'Stepping both — loop ' + (loopDone ? 'done' : (st.li + 1) + '/' + st.loop.events.length) +
          ', recursion ' + (recDone ? 'done' : (st.ri + 1) + '/' + st.rec.events.length) + '.';
      }
    }

    sel.addEventListener('change', function () { load(+sel.value); });
    stepBtn.addEventListener('click', function () { step(st); render(); });
    runBtn.addEventListener('click', function () { runToEnd(st); render(); });
    resetBtn.addEventListener('click', function () { st = create(preset); render(); });
    load(0);
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = RecursionLab;
  else {
    global.RecursionLab = RecursionLab;
    document.addEventListener('DOMContentLoaded', mount);
  }
})(typeof window !== 'undefined' ? window : this);
