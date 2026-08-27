/* Jump Machine — mini app for CO1005 Supplementary Topic S5.
   A tiny instruction machine that shows what loops really are: there is no
   "while" in hardware — only compare and jump. Programs are shown next to
   the C++ loop they were compiled from; students step instruction by
   instruction and watch the program counter jump backwards.
   Mount point: #jump-root. Pure engine exported for Node tests.

   Instruction set (one per line, ';' starts a comment, 'NAME:' is a label):
     SET  r, n      store the number n into register r
     ADD  r, n      r = r + n            (n may be another register)
     CMP  a, b      compare a with b, remembering <, =, >  (a, b: reg or n)
     JGT  L         jump to label L if the last CMP said "greater"
     JLT  L         jump if "less"      JGE / JLE / JEQ / JNE likewise
     JMP  L         jump always
     PRINT x        print a register or number
     HALT           stop the machine                                        */
(function (global) {
  'use strict';

  var JUMPS = { JGT: '>', JLT: '<', JGE: '>=', JLE: '<=', JEQ: '==', JNE: '!=' };
  var MAX_STEPS = 5000;

  function assemble(src) {
    var lines = src.split('\n');
    var prog = [], labels = {};
    for (var ln = 0; ln < lines.length; ln++) {
      var raw = lines[ln];
      var text = raw.replace(/;.*$/, '').trim();
      if (!text) continue;
      var m = text.match(/^([A-Za-z_]\w*):\s*(.*)$/);
      if (m) {
        if (labels[m[1]] !== undefined) throw new Error('line ' + (ln + 1) + ": label '" + m[1] + "' is defined twice");
        labels[m[1]] = prog.length;
        text = m[2].trim();
        if (!text) continue;
      }
      var parts = text.split(/[\s,]+/).filter(Boolean);
      var op = parts[0].toUpperCase();
      var ins = { op: op, args: parts.slice(1), srcLine: ln };
      if (op === 'HALT') { if (ins.args.length) throw new Error('line ' + (ln + 1) + ': HALT takes no arguments'); }
      else if (op === 'JMP' || JUMPS[op]) { if (ins.args.length !== 1) throw new Error('line ' + (ln + 1) + ': ' + op + ' needs one label'); }
      else if (op === 'PRINT') { if (ins.args.length !== 1) throw new Error('line ' + (ln + 1) + ': PRINT takes one register or number'); }
      else if (op === 'SET' || op === 'ADD' || op === 'CMP') { if (ins.args.length !== 2) throw new Error('line ' + (ln + 1) + ': ' + op + ' needs two operands'); }
      else throw new Error('line ' + (ln + 1) + ": unknown instruction '" + op + "'");
      prog.push(ins);
    }
    // resolve jump targets now, so bad labels fail at assemble time
    prog.forEach(function (ins, at) {
      if (ins.op === 'JMP' || JUMPS[ins.op]) {
        if (labels[ins.args[0]] === undefined)
          throw new Error("unknown label '" + ins.args[0] + "' (instruction " + (at + 1) + ')');
        ins.target = labels[ins.args[0]];
      }
    });
    return { prog: prog, labels: labels };
  }

  function create(asm) {
    return { asm: asm, pc: 0, regs: {}, cmp: null, out: [], steps: 0, halted: false, error: null, lastNote: 'Ready — press Step.' };
  }

  function valueOf(state, tok, ctx) {
    if (/^-?\d+$/.test(tok)) return parseInt(tok, 10);
    if (state.regs[tok] === undefined)
      throw new Error(ctx + ": register '" + tok + "' has no value yet");
    return state.regs[tok];
  }

  function step(state) {
    if (state.halted || state.error) return state;
    if (state.pc >= state.asm.prog.length) {
      state.halted = true;
      state.lastNote = 'Ran off the end of the program (no HALT).';
      return state;
    }
    if (++state.steps > MAX_STEPS) {
      state.error = 'More than ' + MAX_STEPS + ' steps — the jumps form an infinite loop.';
      return state;
    }
    var ins = state.asm.prog[state.pc];
    try {
      switch (ins.op) {
        case 'SET': {
          var v = valueOf(state, ins.args[1], 'SET');
          state.regs[ins.args[0]] = v;
          state.lastNote = ins.args[0] + ' ← ' + v;
          state.pc++;
          break;
        }
        case 'ADD': {
          var base = valueOf(state, ins.args[0], 'ADD');
          var inc = valueOf(state, ins.args[1], 'ADD');
          state.regs[ins.args[0]] = base + inc;
          state.lastNote = ins.args[0] + ' ← ' + base + ' + ' + inc + ' = ' + (base + inc);
          state.pc++;
          break;
        }
        case 'CMP': {
          var a = valueOf(state, ins.args[0], 'CMP');
          var b = valueOf(state, ins.args[1], 'CMP');
          state.cmp = a < b ? '<' : a > b ? '>' : '=';
          state.lastNote = 'compared ' + a + ' with ' + b + ' → remembered "' + state.cmp + '"';
          state.pc++;
          break;
        }
        case 'JMP':
          state.lastNote = 'jump to ' + ins.args[0] + ' (always)';
          state.pc = ins.target;
          break;
        case 'PRINT': {
          var pv = valueOf(state, ins.args[0], 'PRINT');
          state.out.push(String(pv));
          state.lastNote = 'printed ' + pv;
          state.pc++;
          break;
        }
        case 'HALT':
          state.halted = true;
          state.lastNote = 'HALT — the machine stops.';
          break;
        default: { // conditional jumps
          var rel = JUMPS[ins.op];
          if (state.cmp === null) throw new Error(ins.op + ' needs a CMP first');
          var taken =
            (rel === '>' && state.cmp === '>') ||
            (rel === '<' && state.cmp === '<') ||
            (rel === '==' && state.cmp === '=') ||
            (rel === '!=' && state.cmp !== '=') ||
            (rel === '>=' && state.cmp !== '<') ||
            (rel === '<=' && state.cmp !== '>');
          state.lastNote = ins.op + ' ' + ins.args[0] + ': last CMP said "' + state.cmp + '" → ' +
            (taken ? 'jump TAKEN' : 'not taken, fall through');
          state.pc = taken ? ins.target : state.pc + 1;
        }
      }
    } catch (e) {
      state.error = e.message;
    }
    return state;
  }

  function runToEnd(state) {
    var guard = 0;
    while (!state.halted && !state.error && guard++ <= MAX_STEPS) step(state);
    return state;
  }

  var PRESETS = [
    { key: 'while10',
      name: 'while (count <= 10) — Example 4.2.1',
      cpp: 'int count = 1;\nwhile (count <= 10) {\n    cout << count << " ";\n    count++;\n}',
      asm: '      SET  count, 1     ; int count = 1\nTEST: CMP  count, 10    ; while (count <= 10)\n      JGT  END          ;   …means: if count > 10, LEAVE\n      PRINT count       ; cout << count\n      ADD  count, 1     ; count++\n      JMP  TEST         ; back up to the test — THE LOOP\nEND:  HALT' },
    { key: 'evens',
      name: 'for evens 2…20 — Example 4.3.1',
      cpp: 'for (count = 2; count <= 20;\n     count = count + 2)\n    cout << count << " ";',
      asm: '      SET  count, 2     ; initialization (once)\nTEST: CMP  count, 20    ; condition\n      JGT  END\n      PRINT count       ; body\n      ADD  count, 2     ; update\n      JMP  TEST\nEND:  HALT' },
    { key: 'dowhile',
      name: 'do-while — the test at the bottom',
      cpp: 'int digit = 2, sum = 0;\ndo {\n    sum = sum + digit;\n    digit = digit + 2;\n} while (digit <= 10);\ncout << sum;',
      asm: '      SET  digit, 2\n      SET  sum, 0\nBODY: ADD  sum, digit   ; body runs FIRST —\n      ADD  digit, 2     ; no test above it!\n      CMP  digit, 10    ; the test lives at the bottom:\n      JLE  BODY         ; jump BACK if digit <= 10\n      PRINT sum\n      HALT' },
    { key: 'sum100',
      name: 'sum 1…100 (two registers)',
      cpp: 'int sum = 0;\nfor (int i = 1; i <= 100; i++)\n    sum += i;\ncout << sum;',
      asm: '      SET  sum, 0\n      SET  i, 1\nTEST: CMP  i, 100\n      JGT  DONE\n      ADD  sum, i       ; sum += i\n      ADD  i, 1\n      JMP  TEST\nDONE: PRINT sum\n      HALT' }
  ];

  var JumpMachine = { assemble: assemble, create: create, step: step, runToEnd: runToEnd, PRESETS: PRESETS };

  // ───────────── UI ─────────────
  function mount() {
    var host = document.getElementById('jump-root');
    if (!host) return;
    function el(tag, cls, html) {
      var n = document.createElement(tag);
      if (cls) n.className = cls;
      if (html !== undefined) n.innerHTML = html;
      return n;
    }
    function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

    var panel = el('div', 'run-panel');
    panel.appendChild(el('h4', '', 'Pick a loop — then watch it run as jumps'));

    var bar = el('div', 'ex-actions');
    var sel = el('select', 'preset-select');
    sel.setAttribute('aria-label', 'Example programs');
    PRESETS.forEach(function (p, i) {
      var o = el('option'); o.value = String(i); o.textContent = p.name; sel.appendChild(o);
    });
    bar.appendChild(sel);
    var stepBtn = el('button', 'btn primary', '⏭ Step');
    var runBtn = el('button', 'btn ghost', '▶ Run to end');
    var resetBtn = el('button', 'btn ghost small', '↺ Restart');
    bar.appendChild(stepBtn); bar.appendChild(runBtn); bar.appendChild(resetBtn);
    panel.appendChild(bar);

    var cols = el('div', 'run-cols');
    var left = el('div');
    left.appendChild(el('label', 'field-label', 'The C++ you wrote'));
    var cppBox = el('pre', 'jm-cpp');
    left.appendChild(cppBox);
    left.appendChild(el('label', 'field-label', 'What the machine actually runs'));
    var listing = el('div', 'jm-listing');
    left.appendChild(listing);
    cols.appendChild(left);

    var right = el('div');
    var status = el('div', 'sim-status');
    status.setAttribute('role', 'status');
    right.appendChild(status);
    right.appendChild(el('label', 'field-label', 'Registers'));
    var regBox = el('div', 'vars-box');
    right.appendChild(regBox);
    right.appendChild(el('label', 'field-label', 'Comparison flag'));
    var flagBox = el('div', 'jm-flag mono');
    right.appendChild(flagBox);
    right.appendChild(el('label', 'field-label', 'Output'));
    var term = el('div', 'term');
    right.appendChild(term);
    cols.appendChild(right);
    panel.appendChild(cols);
    host.appendChild(panel);

    var preset = PRESETS[0], asm = null, st = null;

    function load(i) {
      preset = PRESETS[i];
      asm = assemble(preset.asm);
      st = create(asm);
      cppBox.textContent = preset.cpp;
      render();
    }

    function render() {
      // listing with PC highlight
      var srcLines = preset.asm.split('\n');
      var pcSrc = (!st.halted && !st.error && st.pc < asm.prog.length) ? asm.prog[st.pc].srcLine : -1;
      listing.innerHTML = srcLines.map(function (l, i) {
        return '<div class="jm-line' + (i === pcSrc ? ' jm-pc' : '') + '">' +
          '<span class="jm-no">' + (i === pcSrc ? '▶' : '') + '</span>' + esc(l || ' ') + '</div>';
      }).join('');
      // registers
      var names = Object.keys(st.regs);
      regBox.innerHTML = names.length
        ? '<table><tr><th>register</th><th>value</th></tr>' + names.map(function (r) {
            return '<tr><td>' + esc(r) + '</td><td>' + st.regs[r] + '</td></tr>';
          }).join('') + '</table>'
        : '<div class="empty">No registers set yet.</div>';
      flagBox.textContent = st.cmp === null ? '(no CMP yet)' : 'last CMP remembered: "' + st.cmp + '"';
      term.textContent = st.out.length ? st.out.join(' ') : '';
      if (!st.out.length) term.innerHTML = '<span class="t-empty">Nothing printed yet.</span>';
      status.className = 'sim-status' + (st.error ? ' error' : st.halted ? ' done' : st.steps ? ' running' : '');
      status.textContent = st.error ? st.error :
        'Step ' + st.steps + ': ' + st.lastNote + (st.halted ? '' : '');
      if (!st.steps && !st.error) status.textContent = 'Ready — press Step to execute the first instruction.';
    }

    sel.addEventListener('change', function () { load(+sel.value); });
    stepBtn.addEventListener('click', function () { step(st); render(); });
    runBtn.addEventListener('click', function () { runToEnd(st); render(); });
    resetBtn.addEventListener('click', function () { st = create(asm); render(); });
    load(0);
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = JumpMachine;
  else {
    global.JumpMachine = JumpMachine;
    document.addEventListener('DOMContentLoaded', mount);
  }
})(typeof window !== 'undefined' ? window : this);
