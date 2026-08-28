/* Flowchart Studio — a mini app for CO1005 Chapter 1.
   Students assemble a flowchart from the basic blocks (terminal, input/output,
   process, decision), edit the text of each step, wire decision branches, and
   see the diagram redraw live. Mount point: #studio-root */
(function () {
  'use strict';

  var BLOCKS = {
    start: {
      name: 'Start', sub: 'terminal',
      what: 'A terminal symbol (rounded shape) marks where the algorithm begins.',
      use: 'Every flowchart begins with exactly one Start block. It has no arrow coming in — only one arrow going out.',
      ex: 'Start'
    },
    input: {
      name: 'Input', sub: 'input / output',
      what: 'A parallelogram brings data into the algorithm — values typed by the user or read from a file.',
      use: 'Name the variables that receive the data. One block can read several values.',
      ex: 'Input Name, Hours, Rate'
    },
    process: {
      name: 'Process', sub: 'calculation',
      what: 'A rectangle performs a calculation or stores a value into a variable.',
      use: 'Write the assignment inside, using ← for “store into”: variable ← expression.',
      ex: 'Pay ← Hours × Rate'
    },
    output: {
      name: 'Output', sub: 'input / output',
      what: 'The same parallelogram is used to display results to the user.',
      use: 'List the variables or the message the algorithm shows.',
      ex: 'Display Name, Pay'
    },
    decision: {
      name: 'Decision', sub: 'branch',
      what: 'A diamond asks a yes/no question and splits the flow into two paths.',
      use: 'Write a condition that is either true or false. Then choose where the Yes arrow and the No arrow go — pointing an arrow back to an earlier step creates a loop.',
      ex: 'NUM > 9 ?'
    },
    end: {
      name: 'End', sub: 'terminal',
      what: 'The terminal symbol again — this time closing the algorithm.',
      use: 'Every path through the flowchart should eventually reach an End block.',
      ex: 'End'
    }
  };
  var TYPE_ORDER = ['start', 'input', 'process', 'output', 'decision', 'end'];

  var PRESETS = {
    payroll: {
      name: 'Payroll (sequence)',
      sampleInput: 'Alice 40 15',
      steps: [
        { type: 'start', text: 'Start' },
        { type: 'input', text: 'Input Name, Hours, Rate' },
        { type: 'process', text: 'Pay ← Hours × Rate' },
        { type: 'output', text: 'Display Name, Pay' },
        { type: 'end', text: 'End' }
      ]
    },
    squares: {
      name: 'Squares of 4…9 (loop)',
      sampleInput: '',
      steps: [
        { type: 'start', text: 'Start' },
        { type: 'process', text: 'NUM ← 4' },
        { type: 'process', text: 'SQNUM ← NUM × NUM' },
        { type: 'output', text: 'Print NUM, SQNUM' },
        { type: 'process', text: 'NUM ← NUM + 1' },
        { type: 'decision', text: 'NUM > 9 ?', yes: 'next', no: 2 },
        { type: 'end', text: 'Stop' }
      ]
    },
    absolute: {
      name: 'Absolute value (branch)',
      sampleInput: '-5',
      steps: [
        { type: 'start', text: 'Start' },
        { type: 'input', text: 'Input A' },
        { type: 'decision', text: 'A < 0 ?', yes: 'next', no: 4 },
        { type: 'process', text: 'A ← −A' },
        { type: 'output', text: 'Display A' },
        { type: 'end', text: 'End' }
      ]
    },
    countdown: {
      name: 'Rocket countdown (loop)',
      sampleInput: '',
      steps: [
        { type: 'start', text: 'Start' },
        { type: 'process', text: 'N ← 10' },
        { type: 'output', text: 'Print N' },
        { type: 'process', text: 'N ← N − 1' },
        { type: 'decision', text: 'N ≥ 1 ?', yes: 2, no: 'next' },
        { type: 'output', text: 'Print "Lift off! 🚀"' },
        { type: 'end', text: 'End' }
      ]
    },
    guess: {
      name: 'Guess the number (game)',
      sampleInput: '3 9 7',
      steps: [
        { type: 'start', text: 'Start' },
        { type: 'process', text: 'Secret ← 7' },
        { type: 'input', text: 'Input Guess' },
        { type: 'decision', text: 'Guess = Secret ?', yes: 7, no: 'next' },
        { type: 'decision', text: 'Guess < Secret ?', yes: 'next', no: 6 },
        { type: 'output', text: 'Print "Too small, try again"', go: 2 },
        { type: 'output', text: 'Print "Too big, try again"', go: 2 },
        { type: 'output', text: 'Print "Correct! You got it."' },
        { type: 'end', text: 'End' }
      ]
    },
    collatz: {
      name: 'Collatz 3n+1 (two decisions)',
      sampleInput: '6',
      steps: [
        { type: 'start', text: 'Start' },
        { type: 'input', text: 'Input N' },
        { type: 'output', text: 'Print N' },
        { type: 'decision', text: 'N = 1 ?', yes: 7, no: 'next' },
        { type: 'decision', text: 'N is even ?', yes: 'next', no: 6 },
        { type: 'process', text: 'N ← N ÷ 2', go: 2 },
        { type: 'process', text: 'N ← 3 × N + 1', go: 2 },
        { type: 'output', text: 'Print "Reached 1!"' },
        { type: 'end', text: 'End' }
      ]
    }
  };

  // geometry
  var CX = 190, STEP_H = 96, TOP = 56;
  var HALF_H = { start: 20, end: 20, input: 22, output: 22, process: 22, decision: 32 };
  var HALF_W = { start: 62, end: 62, input: 84, output: 84, process: 84, decision: 88 };

  function palIcon(type) {
    var s = 'width="44" height="30" viewBox="0 0 44 30" aria-hidden="true"';
    switch (type) {
      case 'start': case 'end':
        return '<svg ' + s + '><rect class="fc-terminal" x="4" y="7" width="36" height="16" rx="8"/></svg>';
      case 'input': case 'output':
        return '<svg ' + s + '><polygon class="fc-io" points="10,7 42,7 34,23 2,23"/></svg>';
      case 'process':
        return '<svg ' + s + '><rect class="fc-process" x="4" y="7" width="36" height="16"/></svg>';
      case 'decision':
        return '<svg ' + s + '><polygon class="fc-decision" points="22,2 42,15 22,28 2,15"/></svg>';
    }
    return '';
  }

  function wrap2(text, maxChars) {
    var words = String(text).split(/\s+/).filter(Boolean);
    if (!words.length) return [''];
    var lines = [''], li = 0;
    for (var i = 0; i < words.length; i++) {
      var cand = lines[li] === '' ? words[i] : lines[li] + ' ' + words[i];
      if (cand.length <= maxChars) lines[li] = cand;
      else if (li === 0) { lines.push(words[i]); li = 1; }
      else { lines[1] = lines[1] + '…'; break; }
    }
    if (lines[1] !== undefined && lines[1].length > maxChars) lines[1] = lines[1].slice(0, maxChars - 1) + '…';
    return lines;
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function mount() {
    var host = document.getElementById('studio-root');
    if (!host) return;

    var steps = [];
    var helpBox, canvasBox, warnBox, editorBox;

    // layout
    var grid = document.createElement('div');
    grid.className = 'studio';

    var side = document.createElement('div');
    side.className = 'studio-panel';
    side.innerHTML = '<h4>Blocks — click to add</h4>';
    var pal = document.createElement('div');
    pal.className = 'palette';
    TYPE_ORDER.forEach(function (t) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'pal-btn';
      b.innerHTML = palIcon(t) + '<span><span class="pal-name">' + BLOCKS[t].name + '</span><span class="pal-sub">' + BLOCKS[t].sub + '</span></span>';
      b.addEventListener('click', function () { addStep(t); showHelp(t); });
      b.addEventListener('mouseenter', function () { showHelp(t); });
      b.addEventListener('focus', function () { showHelp(t); });
      pal.appendChild(b);
    });
    side.appendChild(pal);
    helpBox = document.createElement('div');
    helpBox.className = 'block-help';
    side.appendChild(helpBox);
    grid.appendChild(side);

    var mainCol = document.createElement('div');
    mainCol.className = 'studio-canvas-wrap';

    var toolbar = document.createElement('div');
    toolbar.className = 'ex-actions';
    var presetSel = document.createElement('select');
    presetSel.setAttribute('aria-label', 'Load an example flowchart');
    presetSel.innerHTML = '<option value="">Load an example…</option>' + Object.keys(PRESETS).map(function (k) {
      return '<option value="' + k + '">' + PRESETS[k].name + '</option>';
    }).join('');
    presetSel.addEventListener('change', function () {
      if (!presetSel.value) return;
      var p = PRESETS[presetSel.value];
      steps = p.steps.map(function (s) { return Object.assign({}, s); });
      presetSel.value = '';
      renderAll();
      if (inputTA) inputTA.value = p.sampleInput || '';
    });
    toolbar.appendChild(presetSel);
    var clearBtn = document.createElement('button');
    clearBtn.className = 'btn ghost small';
    clearBtn.textContent = 'Clear canvas';
    clearBtn.addEventListener('click', function () { steps = []; renderAll(); });
    toolbar.appendChild(clearBtn);
    mainCol.appendChild(toolbar);

    var canvasRow = document.createElement('div');
    canvasRow.className = 'studio-canvas-row';
    mainCol.appendChild(canvasRow);

    var canvasCol = document.createElement('div');
    canvasCol.className = 'studio-canvas-col';
    canvasRow.appendChild(canvasCol);

    canvasBox = document.createElement('div');
    canvasBox.className = 'studio-canvas';
    canvasCol.appendChild(canvasBox);

    warnBox = document.createElement('div');
    warnBox.className = 'studio-warnings';
    canvasCol.appendChild(warnBox);

    // ── run panel: step-by-step execution with variable trace + terminal ──
    var sim = null;
    var runPanel = document.createElement('div');
    runPanel.className = 'run-panel';
    runPanel.innerHTML = '<h4>Run it — step through the computation</h4>';

    var runControls = document.createElement('div');
    runControls.className = 'ex-actions';
    var stepBtn = document.createElement('button');
    stepBtn.className = 'btn primary';
    stepBtn.textContent = '⏭ Step';
    var runAllBtn = document.createElement('button');
    runAllBtn.className = 'btn ghost';
    runAllBtn.textContent = '▶ Run to end';
    var restartBtn = document.createElement('button');
    restartBtn.className = 'btn ghost small';
    restartBtn.textContent = '↺ Restart';
    runControls.appendChild(stepBtn);
    runControls.appendChild(runAllBtn);
    runControls.appendChild(restartBtn);
    runPanel.appendChild(runControls);

    var inputLbl = document.createElement('label');
    inputLbl.className = 'field-label';
    inputLbl.textContent = 'Input — values for the Input blocks, separated by spaces';
    runPanel.appendChild(inputLbl);
    var inputTA = document.createElement('textarea');
    inputTA.className = 'stdin-edit';
    inputTA.spellcheck = false;
    inputTA.setAttribute('aria-label', 'Values consumed by the Input blocks');
    runPanel.appendChild(inputTA);

    var statusBox = document.createElement('div');
    statusBox.className = 'sim-status';
    statusBox.setAttribute('role', 'status');
    statusBox.textContent = 'Press Step to walk through the flowchart one block at a time.';
    runPanel.appendChild(statusBox);

    var runCols = document.createElement('div');
    runCols.className = 'run-cols';
    var varsCol = document.createElement('div');
    var varsLbl = document.createElement('label');
    varsLbl.className = 'field-label';
    varsLbl.textContent = 'Variables';
    varsCol.appendChild(varsLbl);
    var varsBox = document.createElement('div');
    varsBox.className = 'vars-box';
    varsBox.innerHTML = '<div class="empty">No variables yet.</div>';
    varsCol.appendChild(varsBox);
    runCols.appendChild(varsCol);
    var termCol = document.createElement('div');
    var termLbl = document.createElement('label');
    termLbl.className = 'field-label';
    termLbl.textContent = 'Output (terminal)';
    termCol.appendChild(termLbl);
    var termBox = document.createElement('div');
    termBox.className = 'term';
    termBox.innerHTML = '<span class="t-empty">Nothing printed yet.</span>';
    termCol.appendChild(termBox);
    runCols.appendChild(termCol);
    runPanel.appendChild(runCols);
    canvasRow.appendChild(runPanel);

    function simActivePC() {
      if (!sim) return -1;
      if (sim.state === 'error') return -1;
      if (sim.state === 'done') return Math.min(sim.pc, steps.length - 1);
      return sim.pc;
    }

    function renderSim() {
      // status
      statusBox.className = 'sim-status' +
        (sim ? (sim.state === 'waiting-input' ? ' waiting' :
                sim.state === 'done' ? ' done' :
                sim.state === 'error' ? ' error' :
                sim.state === 'running' ? ' running' : '') : '');
      statusBox.textContent = sim ? sim.message : 'Press Step to walk through the flowchart one block at a time.';
      // variables
      if (!sim || !Object.keys(sim.env).length) {
        varsBox.innerHTML = '<div class="empty">No variables yet.</div>';
      } else {
        var rows = Object.keys(sim.env).map(function (k) {
          var v = window.FlowSim._fmt(sim.env[k]);
          return '<tr' + (sim.lastChanged === k ? ' class="changed"' : '') + '><td>' + esc(k) + '</td><td>' + esc(v) + '</td></tr>';
        }).join('');
        varsBox.innerHTML = '<table><tr><th>name</th><th>value</th></tr>' + rows + '</table>';
      }
      // terminal
      if (!sim || !sim.out.length) {
        termBox.innerHTML = '<span class="t-empty">Nothing printed yet.</span>';
      } else {
        termBox.textContent = sim.out.join('\n');
      }
      renderSVG();
      // mirror the highlight onto the step editor rows
      var activePC = simActivePC();
      Array.prototype.forEach.call(editorBox.children, function (row, i) {
        if (row.classList && row.classList.contains('step-row'))
          row.classList.toggle('now', i === activePC);
      });
    }

    function ensureSim() { if (!sim) sim = window.FlowSim.create(steps); }
    stepBtn.addEventListener('click', function () {
      ensureSim();
      window.FlowSim.step(sim, inputTA.value);
      renderSim();
    });
    runAllBtn.addEventListener('click', function () {
      ensureSim();
      window.FlowSim.runToEnd(sim, inputTA.value);
      renderSim();
    });
    restartBtn.addEventListener('click', function () {
      sim = window.FlowSim.create(steps);
      renderSim();
    });

    var edPanel = document.createElement('div');
    edPanel.className = 'studio-panel';
    edPanel.innerHTML = '<h4>Steps — edit the text, reorder, wire the branches</h4>';
    editorBox = document.createElement('div');
    editorBox.className = 'steps-editor';
    edPanel.appendChild(editorBox);
    mainCol.appendChild(edPanel);

    grid.appendChild(mainCol);
    host.appendChild(grid);

    function showHelp(t) {
      var b = BLOCKS[t];
      helpBox.innerHTML = '<h5>' + b.name + ' — ' + b.sub + '</h5>' +
        '<div>' + b.what + '</div>' +
        '<div class="bh-use"><strong>How to use:</strong> ' + b.use + '</div>' +
        '<div class="bh-ex">e.g. ' + esc(b.ex) + '</div>';
    }
    showHelp('start');

    function addStep(type) {
      var s = { type: type, text: BLOCKS[type].ex };
      if (type === 'decision') { s.yes = 'next'; s.no = 'next'; }
      // keep End last when it already exists
      if (steps.length && steps[steps.length - 1].type === 'end' && type !== 'end') {
        steps.splice(steps.length - 1, 0, s);
      } else {
        steps.push(s);
      }
      renderAll();
    }

    function retarget(removedIdx) {
      steps.forEach(function (s) {
        ['yes', 'no', 'go'].forEach(function (k) {
          if (typeof s[k] === 'number') {
            if (s[k] === removedIdx) s[k] = 'next';
            else if (s[k] > removedIdx) s[k] -= 1;
          }
        });
      });
    }
    function remapAfterMove(from, to) {
      steps.forEach(function (s) {
        ['yes', 'no', 'go'].forEach(function (k) {
          if (typeof s[k] === 'number') {
            if (s[k] === from) s[k] = to;
            else if (from < to && s[k] > from && s[k] <= to) s[k] -= 1;
            else if (to < from && s[k] >= to && s[k] < from) s[k] += 1;
          }
        });
      });
    }

    function renderAll() {
      sim = null; // structural edits invalidate a run in progress
      renderEditor();
      renderWarnings();
      renderSim(); // also redraws the SVG (without a highlight now that sim is reset)
    }

    function renderEditor() {
      editorBox.innerHTML = '';
      if (!steps.length) {
        var empty = document.createElement('div');
        empty.className = 'warning-row';
        empty.textContent = 'No blocks yet — add a Start block from the palette, or load an example.';
        editorBox.appendChild(empty);
        return;
      }
      steps.forEach(function (s, i) {
        var row = document.createElement('div');
        row.className = 'step-row t-' + s.type;
        var no = document.createElement('span');
        no.className = 'step-no';
        no.textContent = String(i + 1);
        row.appendChild(no);
        var tag = document.createElement('span');
        tag.className = 'step-type';
        tag.textContent = BLOCKS[s.type].name;
        row.appendChild(tag);
        var inp = document.createElement('input');
        inp.type = 'text';
        inp.value = s.text;
        inp.setAttribute('aria-label', 'Text of step ' + (i + 1));
        inp.addEventListener('input', function () { s.text = inp.value; renderSVG(); });
        row.appendChild(inp);

        function addTargetSelect(key, labelText) {
          var lbl = document.createElement('span');
          lbl.className = 'branch-lbl';
          lbl.textContent = labelText;
          row.appendChild(lbl);
          var sel = document.createElement('select');
          sel.setAttribute('aria-label', labelText + ' target of step ' + (i + 1));
          var oNext = document.createElement('option');
          oNext.value = 'next';
          oNext.textContent = 'next step';
          sel.appendChild(oNext);
          steps.forEach(function (t, ti) {
            if (ti === i) return;
            var o = document.createElement('option');
            o.value = String(ti);
            o.textContent = 'step ' + (ti + 1) + ': ' + (t.text.length > 14 ? t.text.slice(0, 13) + '…' : t.text);
            sel.appendChild(o);
          });
          sel.value = (s[key] === 'next' || s[key] === undefined) ? 'next' : String(s[key]);
          sel.addEventListener('change', function () {
            s[key] = sel.value === 'next' ? 'next' : parseInt(sel.value, 10);
            renderAll();
          });
          row.appendChild(sel);
        }
        if (s.type === 'decision') {
          addTargetSelect('yes', 'Yes →');
          addTargetSelect('no', 'No →');
        } else if (s.type === 'input' || s.type === 'process' || s.type === 'output') {
          addTargetSelect('go', 'then →');
        }

        [['↑', 'Move step up', function () {
          if (i === 0) return;
          remapAfterMove(i, i - 1);
          var tmp = steps[i - 1]; steps[i - 1] = steps[i]; steps[i] = tmp;
          renderAll();
        }], ['↓', 'Move step down', function () {
          if (i === steps.length - 1) return;
          remapAfterMove(i, i + 1);
          var tmp2 = steps[i + 1]; steps[i + 1] = steps[i]; steps[i] = tmp2;
          renderAll();
        }], ['✕', 'Delete step', function () {
          steps.splice(i, 1);
          retarget(i);
          renderAll();
        }]].forEach(function (def) {
          var b = document.createElement('button');
          b.className = 'step-mini';
          b.type = 'button';
          b.textContent = def[0];
          b.setAttribute('aria-label', def[1] + ' ' + (i + 1));
          b.addEventListener('click', def[2]);
          row.appendChild(b);
        });
        editorBox.appendChild(row);
      });
    }

    function shapeSVG(s, i, cy) {
      var t = s.type, out = '';
      var lines = wrap2(s.text, t === 'decision' ? 14 : 18);
      if (t === 'start' || t === 'end') {
        out += '<rect class="fc-terminal" x="' + (CX - HALF_W[t]) + '" y="' + (cy - 20) + '" width="' + (2 * HALF_W[t]) + '" height="40" rx="20"/>';
      } else if (t === 'input' || t === 'output') {
        var k = 12, w = HALF_W[t], h = 22;
        out += '<polygon class="fc-io" points="' +
          (CX - w + k) + ',' + (cy - h) + ' ' + (CX + w + k) + ',' + (cy - h) + ' ' +
          (CX + w - k) + ',' + (cy + h) + ' ' + (CX - w - k) + ',' + (cy + h) + '"/>';
      } else if (t === 'process') {
        out += '<rect class="fc-process" x="' + (CX - HALF_W[t]) + '" y="' + (cy - 22) + '" width="' + (2 * HALF_W[t]) + '" height="44"/>';
      } else if (t === 'decision') {
        out += '<polygon class="fc-decision" points="' +
          CX + ',' + (cy - 32) + ' ' + (CX + HALF_W[t]) + ',' + cy + ' ' +
          CX + ',' + (cy + 32) + ' ' + (CX - HALF_W[t]) + ',' + cy + '"/>';
      }
      var y0 = lines.length === 2 ? cy - 8 : cy;
      lines.forEach(function (ln, li) {
        out += '<text class="fc-text" x="' + CX + '" y="' + (y0 + li * 16) + '" text-anchor="middle" dominant-baseline="middle">' + esc(ln) + '</text>';
      });
      out += '<text class="fc-label" x="' + (CX - HALF_W[t] - 14) + '" y="' + cy + '" text-anchor="end" dominant-baseline="middle">' + (i + 1) + '</text>';
      return out;
    }

    function renderSVG() {
      if (!steps.length) {
        canvasBox.innerHTML = '<div class="warning-row">The canvas is empty.</div>';
        return;
      }
      var cyOf = function (i) { return TOP + i * STEP_H; };
      var H = TOP + (steps.length - 1) * STEP_H + 70;
      var rightLanes = 0, leftLanes = 0;
      var body = '', arrows = '';

      var activePC = simActivePC();
      steps.forEach(function (s, i) {
        var cy = cyOf(i);
        body += (i === activePC)
          ? '<g class="fc-now">' + shapeSVG(s, i, cy) + '</g>'
          : shapeSVG(s, i, cy);
        if (s.type === 'decision') {
          var branches = [
            { key: 'yes', label: 'Yes', side: 'right' },
            { key: 'no', label: 'No', side: 'left' }
          ];
          branches.forEach(function (br) {
            var target = s[br.key] === undefined ? 'next' : s[br.key];
            if (target === 'next') {
              if (i < steps.length - 1) {
                var ny = cyOf(i + 1) - HALF_H[steps[i + 1].type];
                arrows += '<line class="fc-line" x1="' + CX + '" y1="' + (cy + 32) + '" x2="' + CX + '" y2="' + (ny - 4) + '" marker-end="url(#fs-arrow)"/>';
                arrows += '<text class="fc-label" x="' + (CX + 8) + '" y="' + (cy + 46) + '">' + br.label + '</text>';
              }
            } else if (typeof target === 'number' && steps[target]) {
              var lane, laneX, exitX, enterX, tcy = cyOf(target);
              if (br.side === 'right') {
                lane = rightLanes++;
                laneX = CX + 130 + lane * 34;
                exitX = CX + HALF_W.decision;
                enterX = CX + HALF_W[steps[target].type] + 4;
                arrows += '<polyline class="fc-line" points="' +
                  exitX + ',' + cy + ' ' + laneX + ',' + cy + ' ' + laneX + ',' + tcy + ' ' + (enterX + 4) + ',' + tcy +
                  '" marker-end="url(#fs-arrow)"/>';
                arrows += '<text class="fc-label" x="' + (exitX + 8) + '" y="' + (cy - 8) + '">' + br.label + '</text>';
              } else {
                lane = leftLanes++;
                laneX = CX - 130 - lane * 34;
                exitX = CX - HALF_W.decision;
                enterX = CX - HALF_W[steps[target].type] - 4;
                arrows += '<polyline class="fc-line" points="' +
                  exitX + ',' + cy + ' ' + laneX + ',' + cy + ' ' + laneX + ',' + tcy + ' ' + (enterX - 4) + ',' + tcy +
                  '" marker-end="url(#fs-arrow)"/>';
                arrows += '<text class="fc-label" x="' + (exitX - 30) + '" y="' + (cy - 8) + '">' + br.label + '</text>';
              }
            }
          });
        } else if (s.type !== 'end') {
          var go = (s.go === undefined || s.go === 'next') ? null : s.go;
          if (go !== null && steps[go] !== undefined) {
            // explicit "then →" arrow to another step, routed down the right side
            var lane2 = rightLanes++;
            var laneX2 = CX + 130 + lane2 * 34;
            var exitX2 = CX + HALF_W[s.type];
            var enterX2 = CX + HALF_W[steps[go].type] + 4;
            var tcy2 = cyOf(go);
            arrows += '<polyline class="fc-line" points="' +
              exitX2 + ',' + cy + ' ' + laneX2 + ',' + cy + ' ' + laneX2 + ',' + tcy2 + ' ' + (enterX2 + 4) + ',' + tcy2 +
              '" marker-end="url(#fs-arrow)"/>';
          } else if (i < steps.length - 1) {
            var ny2 = cyOf(i + 1) - HALF_H[steps[i + 1].type];
            arrows += '<line class="fc-line" x1="' + CX + '" y1="' + (cy + HALF_H[s.type]) + '" x2="' + CX + '" y2="' + (ny2 - 4) + '" marker-end="url(#fs-arrow)"/>';
          }
        }
      });

      var minX = -(leftLanes * 34 + (leftLanes ? 60 : 0)) - 10;
      var W = 380 + (rightLanes * 34 + (rightLanes ? 60 : 0)) + 20;
      var svg = '<svg viewBox="' + minX + ' 0 ' + (W - minX) + ' ' + H + '" width="' + (W - minX) + '" height="' + H + '" role="img" aria-label="Flowchart built from ' + steps.length + ' blocks">' +
        '<defs><marker id="fs-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">' +
        '<path d="M 0 0 L 10 5 L 0 10 z" class="fc-arrowhead"/></marker></defs>' +
        arrows + body + '</svg>';
      canvasBox.innerHTML = svg;
    }

    function renderWarnings() {
      var w = [];
      if (steps.length) {
        if (steps[0].type !== 'start') w.push('A flowchart should begin with a Start block.');
        if (steps[steps.length - 1].type !== 'end') w.push('The last block should be an End block.');
        var starts = steps.filter(function (s) { return s.type === 'start'; }).length;
        if (starts > 1) w.push('There should be exactly one Start block (found ' + starts + ').');
        steps.forEach(function (s, i) {
          if (s.type === 'decision' && (s.yes === 'next' || s.yes === undefined) && (s.no === 'next' || s.no === undefined)) {
            w.push('Step ' + (i + 1) + ': both branches of the decision go to the next step — point Yes or No somewhere else (for example back to an earlier step to make a loop).');
          }
          if (s.type === 'end' && i < steps.length - 1) {
            var reachable = steps.some(function (t) {
              return t.type === 'decision' && (t.yes === i + 1 || t.no === i + 1);
            });
            if (!reachable && steps[i + 1]) w.push('Step ' + (i + 2) + ' comes after an End block and may be unreachable.');
          }
        });
      }
      warnBox.innerHTML = w.map(function (m) { return '<div class="warning-row">⚠ ' + m + '</div>'; }).join('');
    }

    // initial content
    steps = PRESETS.payroll.steps.map(function (s) { return Object.assign({}, s); });
    renderAll();
    inputTA.value = PRESETS.payroll.sampleInput || '';
  }

  document.addEventListener('DOMContentLoaded', mount);
})();
