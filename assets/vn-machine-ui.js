/* Von Neumann Machine lab — UI for Chapter 7 (mount point #vn-root).
   Thin DOM layer over assets/vn-machine.js (the engine). Also exports the presets for Node tests. */
(function (global) {
  'use strict';
  var VN = (typeof module !== 'undefined' && module.exports) ? require('./vn-machine.js') : global.VNMachine;

  var PRESETS = [
    { key: 'sum3', name: 'A = B + C (slide 28)', input: '', expect: [12],
      story: 'The example from the slides: A, B and C are three memory cells. Watch every instruction travel through fetch, decode and execute. (The slide puts A, B, C at cells 100, 150, 151; our toy memory has only 16 cells, so they sit right after the code.)',
      src: '; A = B + C   — slide 28\n        LOAD  B        ; B -> R\n        ADD   C        ; R + C -> R\n        STORE A        ; R -> A\n        OUT   A        ; show the result\n        HALT\n.data\nA: 0\nB: 5\nC: 7\n' },
    { key: 'sum1n', name: 'Sum of 1..N (a loop)', input: '5', expect: [15],
      story: 'A loop is nothing but a JUMP backwards. Give it N in the input box. The loop adds 1, 2, 3 … N into SUM. (It assumes N ≥ 1 — try 0 and see what happens.)',
      src: '; sum = 1 + 2 + ... + N\n        IN        N\n        CLEAR     SUM\n        CLEAR     I\nloop:   INCREMENT I        ; I = I + 1\n        LOAD      SUM\n        ADD       I\n        STORE     SUM      ; SUM = SUM + I\n        LOAD      I\n        COMPARE   N        ; GT = 1 when N > I\n        JUMPGT    loop     ; not finished: go round again\n        OUT       SUM\n        HALT\n.data\nN:   0\nSUM: 0\nI:   0\n' },
    { key: 'max2', name: 'Max of two numbers (a branch)', input: '8 3', expect: [8],
      story: 'An if–else becomes COMPARE plus a conditional jump. Try the inputs 8 3 and then 3 8. Note: COMPARE X sets GT when the cell X is bigger than R, so after LOAD A / COMPARE B, “A > B” shows up as LT.',
      src: '; print the larger of two numbers\n        IN      A\n        IN      B\n        LOAD    A          ; R = A\n        COMPARE B          ; LT = 1 when B < A, i.e. A is bigger\n        JUMPLT  showA\n        OUT     B          ; else-part\n        JUMP    done\nshowA:  OUT     A          ; then-part\ndone:   HALT\n.data\nA: 0\nB: 0\n' },
    { key: 'selfmod', name: 'Program and data share memory', input: '', expect: [222],
      story: 'The stored-program idea in one picture: the instruction OUT 3 lives in cell 1, and INCREMENT treats that cell as ordinary data. Add 1 to the word and it becomes OUT 4. Compare the “8-bit encoding” column before and after. Try also clicking a cell and typing a new number into it.',
      src: '; a program that edits its own instruction\n        INCREMENT patch    ; cell 1 is an INSTRUCTION, but INCREMENT only sees a number\npatch:  OUT       first    ; after the edit this reads OUT second\n        HALT\n.data\nfirst:  111\nsecond: 222\n' }
  ];

  function parseInput(text) {
    return (String(text).match(/-?\d+/g) || []).map(function (x) { return parseInt(x, 10); });
  }

  function mount() {
    var host = document.getElementById('vn-root');
    if (!host) return;
    function el(tag, cls, html) { var n = document.createElement(tag); if (cls) n.className = cls; if (html !== undefined) n.innerHTML = html; return n; }
    function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

    var panel = el('div', 'run-panel vn-lab');
    panel.appendChild(el('h4', '', 'The toy Von Neumann machine — a teaching model, not a real CPU'));

    var bar = el('div', 'ex-actions');
    var sel = el('select', 'preset-select'); sel.setAttribute('aria-label', 'Example programs');
    PRESETS.forEach(function (p, i) { var o = el('option'); o.value = String(i); o.textContent = p.name; sel.appendChild(o); });
    bar.appendChild(sel);
    var bMicro = el('button', 'btn primary', 'Micro-step'); bMicro.title = 'One register transfer at a time, with its arrow';
    var bInstr = el('button', 'btn ghost', 'Next instruction'); bInstr.title = 'Play the rest of this instruction';
    var bRun = el('button', 'btn ghost', '▶ Play to HALT'); bRun.title = 'Play the whole program, one arrow after another';
    var bPause = el('button', 'btn ghost', '⏸ Pause'); bPause.disabled = true;
    var bReset = el('button', 'btn ghost small', 'Reset');
    [bMicro, bInstr, bRun, bPause, bReset].forEach(function (b) { b.type = 'button'; bar.appendChild(b); });
    panel.appendChild(bar);

    var story = el('p', 'vn-story'); panel.appendChild(story);

    var inRow = el('div', 'vn-inrow');
    var inLab = el('label', 'field-label', 'Input queue for IN (numbers)'); inLab.setAttribute('for', 'vn-input');
    var inBox = el('input', 'vn-input'); inBox.id = 'vn-input'; inBox.type = 'text'; inBox.autocomplete = 'off'; inBox.spellcheck = false;
    inRow.appendChild(inLab); inRow.appendChild(inBox);
    panel.appendChild(inRow);

    var phases = el('div', 'vn-phases');
    phases.setAttribute('aria-hidden', 'true');
    phases.innerHTML = '<span data-p="fetch">1 FETCH</span><span data-p="decode">2 DECODE</span><span data-p="execute">3 EXECUTE</span>';
    panel.appendChild(phases);

    var status = el('div', 'sim-status vn-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    panel.appendChild(status);

    var diagram = el('div', 'vn-diagram');
    var dp = global.VNDatapath ? global.VNDatapath.create(diagram) : null;
    var controls = el('div', 'vn-controls');
    var speed = global.VNDatapath.speedControl({ key: 'co1005-vn-speed', initial: 2 });
    controls.appendChild(speed.el);
    panel.appendChild(controls);
    panel.appendChild(diagram);

    var main = el('div', 'vn-main vn-main-mem');
    var memBox = el('div', 'vn-memwrap');
    memBox.setAttribute('data-node', 'MEM');
    var memTitle = el('div', 'vn-cpu-title', 'Memory — cells with addresses (click a number to edit it)');
    memBox.appendChild(memTitle);
    var scroll = el('div', 'tbl-scroll vn-memscroll');
    var table = el('table', 'tbl vn-mem');
    table.innerHTML = '<caption class="vn-sr">Memory cells</caption><thead><tr><th scope="col">Addr</th><th scope="col">Name</th><th scope="col">Decimal</th><th scope="col">Bits: opcode | address</th><th scope="col">As code</th></tr></thead><tbody></tbody>';
    scroll.appendChild(table); memBox.appendChild(scroll);
    main.appendChild(memBox);
    panel.appendChild(main);

    var outRow = el('div', 'vn-outrow');
    outRow.innerHTML = '<span class="field-label">Output log</span> <span class="mono vn-out" data-v="log"></span>';
    panel.appendChild(outRow);

    var srcLab = el('label', 'field-label', 'Assembly source — edit it and press “Assemble &amp; load”'); srcLab.setAttribute('for', 'vn-src');
    var srcBox = el('textarea', 'vn-src'); srcBox.id = 'vn-src'; srcBox.rows = 14; srcBox.spellcheck = false;
    var bAsm = el('button', 'btn ghost small', 'Assemble & load'); bAsm.type = 'button';
    panel.appendChild(srcLab); panel.appendChild(srcBox);
    var errBox = el('div', 'note danger vn-err'); errBox.style.display = 'none';
    var asmRow = el('div', 'ex-actions'); asmRow.appendChild(bAsm); panel.appendChild(asmRow); panel.appendChild(errBox);

    var fine = el('p', 'vn-fine', 'Instruction set from slide 34. The slide gives opcode 0101 to both SUBTRACT and DECREMENT — a typo; here DECREMENT is 0110. Four opcode bits allow only 16 instructions, so JUMPGE and JUMPLE are assembler shortcuts for two jumps.');
    panel.appendChild(fine);
    host.appendChild(panel);

    var tbody = table.querySelector('tbody');
    var asm = null, st = null, preset = PRESETS[0];

    function regVal(n) {
      switch (n) {
        case 'PC': return st.pc; case 'IR': return st.ir; case 'MAR': return st.mar; case 'MDR': return st.mdr; case 'R': return st.r;
        case 'FLAGS': return 'GT=' + st.gt + ' EQ=' + st.eq + ' LT=' + st.lt;
        case 'DEC': return st.cur ? st.cur.op.name + (st.cur.op.arg ? ' ' + st.cur.addr : '') : '—';
        case 'ALU': return '+ − compare';
        case 'IN': return st.inPos < st.input.length ? 'next: ' + st.input[st.inPos] : 'empty';
        case 'OUT': return st.out.length ? 'last: ' + st.out[st.out.length - 1] : '—';
      }
    }

    function buildRows() {
      var h = '';
      for (var a = 0; a < st.size; a++) {
        h += '<tr data-a="' + a + '"><td class="mono">' + a + '</td><td class="mono vn-nm"></td>' +
             '<td><input type="number" class="vn-cell" aria-label="Value of cell ' + a + '" data-a="' + a + '"></td>' +
             '<td class="mono vn-bits"></td><td class="mono vn-dis"></td></tr>';
      }
      tbody.innerHTML = h;
    }

    var deferDiagram = false;
    function render() {
      var lm = st.lastMicro;
      if (!deferDiagram && dp) dp.setValues(st);
      Array.prototype.forEach.call(phases.children, function (p) {
        p.className = lm && !st.halted && !st.error && p.getAttribute('data-p') === lm.phase ? 'on' : '';
      });
      var rows = tbody.children;
      for (var a = 0; a < st.size; a++) {
        var w = st.mem[a], tr = rows[a];
        var kind = asm.cells[a] ? asm.cells[a].kind : 'free';
        var cls = 'vn-' + kind;
        if (a === st.pc && !st.halted) cls += ' vn-pcrow';
        if (a === st.lastWrite) cls += ' vn-wr';
        if (a === st.lastRead) cls += ' vn-rd';
        tr.className = cls;
        tr.children[1].textContent = (asm.names[a] || '') + (a === st.pc && !st.halted ? '  ◄ PC' : '');
        var inp = tr.children[2].firstChild;
        if (document.activeElement !== inp) inp.value = w;
        var b = VN.bits(w, st.addrBits);
        tr.children[3].textContent = b || '(does not fit in ' + (4 + st.addrBits) + ' bits)';
        tr.children[4].textContent = VN.disasm(w, st.addrBits);
      }
      document.querySelector('#vn-root [data-v="log"]').textContent = st.out.length ? st.out.join('  ') : '(nothing printed yet)';

      var msg;
      if (st.error) msg = st.error;
      else if (st.halted) msg = 'Halted after ' + st.instrCount + ' instructions (' + st.microCount + ' micro-steps).' + (lm ? ' ' + lm.text : '');
      else if (st.waiting) msg = 'Waiting for input: the IN instruction needs a number. Type it in the input box above, then press a step button.';
      else if (lm) msg = lm.phase.toUpperCase() + ' — ' + lm.label + '. ' + lm.text;
      else msg = 'Ready. PC = ' + st.pc + ': the first instruction will be fetched from cell ' + st.pc + '. Press “Micro-step”.';
      status.textContent = msg;
      status.className = 'sim-status vn-status ' + (st.error ? 'error' : st.halted ? 'done' : st.waiting ? 'waiting' : lm ? 'running' : '');
    }

    function load(src, keepPreset) {
      var r = VN.assemble(src, { size: 16 });
      if (!r.ok) {
        errBox.style.display = '';
        errBox.innerHTML = '<span class="note-tag">Assembler</span>' + r.errors.map(function (e) { return (e.line ? 'Line ' + e.line + ': ' : '') + esc(e.msg); }).join('<br>');
        return;
      }
      errBox.style.display = 'none';
      cancelled = true; gen++; if (dp) dp.cancel();
      asm = r;
      if (dp) dp.clear();
      st = VN.create(asm, { input: parseInput(inBox.value) });
      buildRows();
      render();
    }
    function loadPreset(i) {
      preset = PRESETS[i];
      srcBox.value = preset.src;
      inBox.value = preset.input;
      story.textContent = preset.story;
      load(preset.src);
    }
    function syncInput() { st.input = parseInput(inBox.value); }

    // ---- animated stepping: each micro-step sends its value along the arrow(s), at the chosen speed ----
    var busy = false, cancelled = false, gen = 0;
    function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    function setBusy(on, playing) {
      busy = on;
      [bMicro, bInstr, bRun, bReset, bAsm, sel].forEach(function (b) { b.disabled = on; });
      bPause.disabled = !playing;
    }
    // one micro-step with its arrow; resolves true if a step happened
    async function stepOnce() {
      syncInput();
      var m = VN.stepMicro(st);
      if (!m) { render(); return false; }
      deferDiagram = true; render(); deferDiagram = false;       // narration + memory table now, diagram values after the arrow lands
      if (dp) {
        await dp.animate(m.flow, st, speed.ms());
        if (!cancelled) dp.setValues(st);
      }
      return true;
    }
    async function play(untilBoundary) {
      if (!st || busy) return;
      var my = ++gen; cancelled = false;
      setBusy(true, !untilBoundary || true);
      try {
        if (speed.ms() === 0 && !untilBoundary) { syncInput(); VN.run(st); render(); return; }
        while (!cancelled && my === gen) {
          var ok = await stepOnce();
          if (!ok || st.halted || st.error || st.waiting) break;
          if (untilBoundary && !st.queue.length) break;
          await sleep(speed.gap());
        }
      } finally {
        if (my === gen) { setBusy(false, false); render(); }
      }
    }
    sel.addEventListener('change', function () { loadPreset(+sel.value); });
    bMicro.addEventListener('click', async function () {
      if (!st || busy) return;
      var my = ++gen; cancelled = false; setBusy(true, false);
      try { await stepOnce(); } finally { if (my === gen) { setBusy(false, false); render(); } }
    });
    bInstr.addEventListener('click', function () { play(true); });
    bRun.addEventListener('click', function () { play(false); });
    bPause.addEventListener('click', function () { cancelled = true; if (dp) dp.cancel(); });
    bReset.addEventListener('click', function () { if (dp) dp.clear(); st = VN.create(asm, { input: parseInput(inBox.value) }); render(); });
    bAsm.addEventListener('click', function () { load(srcBox.value); });
    tbody.addEventListener('change', function (e) {
      var t = e.target;
      if (!t.classList || !t.classList.contains('vn-cell')) return;
      var v = parseInt(t.value, 10);
      if (isNaN(v)) { render(); return; }
      st.mem[+t.getAttribute('data-a')] = v;
      st.lastWrite = +t.getAttribute('data-a');
      render();
    });
    loadPreset(0);
  }

  var api = { PRESETS: PRESETS, parseInput: parseInput };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else document.addEventListener('DOMContentLoaded', mount);
})(typeof window !== 'undefined' ? window : this);
