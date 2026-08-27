/* Call Stack Visualizer — mini app for CO1005 Supplementary Topic S7.
   Replays an execution trace recorded by MiniCPP (opts.trace): every step
   shows the source line being run, the stack of frames with their local
   variables, the globals, the statics living OUTSIDE the stack, and the
   output so far. Mount point: #stack-root. Engine-testable via buildTrace. */
(function (global) {
  'use strict';

  var PRESETS = [
    { key: 'scope',
      name: 'Global vs local — Example 6.3.1',
      blurb: 'Two different variables both named y; one global x that valfun changes for everyone.',
      src: '#include <iostream>\nusing namespace std;\n\nint x;              // GLOBAL - lives outside every frame\nvoid valfun();\n\nint main() {\n    int y;\n    x = 10;\n    y = 20;\n    valfun();\n    cout << x << " " << y << endl;\n    return 0;\n}\n\nvoid valfun() {\n    int y;          // a DIFFERENT y, in valfun\'s own frame\n    y = 30;\n    x = 40;         // the global: changes for everyone\n}\n' },
    { key: 'fact',
      name: 'Recursion — fact(4), four frames deep',
      blurb: 'Watch four copies of the same function alive at once, each with its own n.',
      src: '#include <iostream>\nusing namespace std;\n\nint fact(int n) {\n    if (n <= 1)\n        return 1;\n    int rest = fact(n - 1);\n    return n * rest;\n}\n\nint main() {\n    int answer = fact(4);\n    cout << answer << endl;\n    return 0;\n}\n' },
    { key: 'ref',
      name: 'Value vs reference — who can touch main\'s frame?',
      blurb: 'squareByValue works on a copy in its own frame; squareByReference reaches back into main.',
      src: '#include <iostream>\nusing namespace std;\n\nint squareByValue(int a) {\n    a = a * a;        // only THIS frame\'s copy changes\n    return a;\n}\n\nvoid squareByReference(int &cRef) {\n    cRef = cRef * cRef;   // reaches into main\'s frame!\n}\n\nint main() {\n    int x = 2, z = 4;\n    int got = squareByValue(x);\n    squareByReference(z);\n    cout << x << " " << got << " " << z << endl;\n    return 0;\n}\n' },
    { key: 'static',
      name: 'static vs auto — who survives the pop?',
      blurb: 'num lives outside the stack and keeps counting; temp dies with every frame.',
      src: '#include <iostream>\nusing namespace std;\n\nvoid teststatic() {\n    static int num = 0;   // lives OUTSIDE the stack\n    int temp = 0;         // lives in the frame\n    cout << num << " ";\n    num++;\n    temp++;              // gone when the frame pops\n}\n\nint main() {\n    teststatic();\n    teststatic();\n    teststatic();\n    cout << endl;\n    return 0;\n}\n' }
  ];

  function buildTrace(src) {
    var events = [];
    var M = (typeof module !== 'undefined' && module.exports) ? require('./minicpp.js') : global.MiniCPP;
    var res = M.run(src, '', { write: function () {}, trace: function (e) { events.push(e); } });
    return { events: events, error: res.error };
  }

  var CallStack = { PRESETS: PRESETS, buildTrace: buildTrace };

  // ───────────── UI ─────────────
  function mount() {
    var host = document.getElementById('stack-root');
    if (!host) return;
    function el(tag, cls, html) {
      var n = document.createElement(tag);
      if (cls) n.className = cls;
      if (html !== undefined) n.innerHTML = html;
      return n;
    }
    function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

    var panel = el('div', 'run-panel');
    panel.appendChild(el('h4', '', 'Pick a program — then step and watch the frames'));

    var bar = el('div', 'ex-actions');
    var sel = el('select', 'preset-select');
    sel.setAttribute('aria-label', 'Example programs');
    PRESETS.forEach(function (p, i) {
      var o = el('option'); o.value = String(i); o.textContent = p.name; sel.appendChild(o);
    });
    bar.appendChild(sel);
    var backBtn = el('button', 'btn ghost small', '◀ Back');
    var stepBtn = el('button', 'btn primary', 'Step ▶');
    var runBtn = el('button', 'btn ghost', '▶▶ Run all');
    var resetBtn = el('button', 'btn ghost small', '↺ Restart');
    bar.appendChild(backBtn); bar.appendChild(stepBtn); bar.appendChild(runBtn); bar.appendChild(resetBtn);
    panel.appendChild(bar);

    var blurb = el('div', 'field-label');
    panel.appendChild(blurb);
    var status = el('div', 'sim-status');
    status.setAttribute('role', 'status');
    panel.appendChild(status);

    var cols = el('div', 'run-cols cs-cols');
    var left = el('div');
    left.appendChild(el('label', 'field-label', 'Source — the highlighted line just ran'));
    var srcBox = el('div', 'jm-listing cs-src');
    left.appendChild(srcBox);
    cols.appendChild(left);

    var right = el('div');
    right.appendChild(el('label', 'field-label', 'The call stack — newest frame on top'));
    var stackBox = el('div', 'cs-stack');
    right.appendChild(stackBox);
    right.appendChild(el('label', 'field-label', 'Outside the stack'));
    var outsideBox = el('div', 'cs-outside');
    right.appendChild(outsideBox);
    right.appendChild(el('label', 'field-label', 'Output so far'));
    var term = el('div', 'term');
    term.style.minHeight = '2.6rem';
    right.appendChild(term);
    cols.appendChild(right);
    panel.appendChild(cols);
    host.appendChild(panel);

    var preset = PRESETS[0], events = [], idx = -1, srcLines = [];

    function load(i) {
      preset = PRESETS[i];
      blurb.textContent = preset.blurb;
      srcLines = preset.src.split('\n');
      events = [];
      window.MiniCPP.run(preset.src, '', { write: function () {}, trace: function (e) { events.push(e); } });
      idx = -1;
      render();
    }

    function render() {
      var e = idx >= 0 ? events[idx] : null;
      var hl = e && !e.truncated ? e.line : -1;
      srcBox.innerHTML = srcLines.map(function (l, i) {
        return '<div class="jm-line' + (i + 1 === hl ? ' jm-pc' : '') + '">' +
          '<span class="jm-no">' + (i + 1 === hl ? '▶' : (i + 1)) + '</span>' + esc(l || ' ') + '</div>';
      }).join('');

      if (!e) {
        stackBox.innerHTML = '<div class="cs-empty">The stack is empty — press Step to call main().</div>';
        outsideBox.innerHTML = '';
        term.innerHTML = '<span class="t-empty">Nothing printed yet.</span>';
        status.className = 'sim-status';
        status.textContent = 'Ready — ' + events.length + ' recorded steps. Press Step.';
        return;
      }
      if (e.truncated) {
        status.className = 'sim-status error';
        status.textContent = 'Trace truncated at 600 steps.';
        return;
      }
      var frames = e.stack.slice().reverse();
      stackBox.innerHTML = frames.length ? frames.map(function (f, i) {
        return '<div class="cs-frame' + (i === 0 ? ' cs-top' : '') + '">' +
          '<div class="cs-fname">' + esc(f.name) + '()' + (i === 0 ? ' <small>← running</small>' : ' <small>waiting</small>') + '</div>' +
          (f.vars.length ? f.vars.map(function (v) {
            return '<div class="cs-var"><span>' + esc(v.name) + '</span><b>' + esc(v.value) + '</b></div>';
          }).join('') : '<div class="cs-var cs-none">(no locals yet)</div>') +
          '</div>';
      }).join('') : '<div class="cs-empty">All frames have popped — the program is over.</div>';

      var outside = '';
      if (e.globals.length)
        outside += '<div class="cs-frame cs-glob"><div class="cs-fname">globals</div>' +
          e.globals.map(function (v) { return '<div class="cs-var"><span>' + esc(v.name) + '</span><b>' + esc(v.value) + '</b></div>'; }).join('') + '</div>';
      if (e.statics.length)
        outside += '<div class="cs-frame cs-stat"><div class="cs-fname">statics — created once, never popped</div>' +
          e.statics.map(function (v) { return '<div class="cs-var"><span>' + esc(v.name) + '</span><b>' + esc(v.value) + '</b></div>'; }).join('') + '</div>';
      outsideBox.innerHTML = outside || '<div class="cs-empty">No globals or statics in this program.</div>';

      term.textContent = e.out || '';
      if (!e.out) term.innerHTML = '<span class="t-empty">Nothing printed yet.</span>';
      var done = idx >= events.length - 1;
      status.className = 'sim-status ' + (done ? 'done' : 'running');
      status.textContent = 'Step ' + (idx + 1) + ' of ' + events.length + ': ' +
        (e.note || ('line ' + e.line + ' ran')) + (done ? ' — finished.' : '');
    }

    sel.addEventListener('change', function () { load(+sel.value); });
    stepBtn.addEventListener('click', function () { if (idx < events.length - 1) idx++; render(); });
    backBtn.addEventListener('click', function () { if (idx >= 0) idx--; render(); });
    runBtn.addEventListener('click', function () { idx = events.length - 1; render(); });
    resetBtn.addEventListener('click', function () { idx = -1; render(); });
    load(0);
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = CallStack;
  else {
    global.CallStackLab = CallStack;
    document.addEventListener('DOMContentLoaded', mount);
  }
})(typeof window !== 'undefined' ? window : this);
