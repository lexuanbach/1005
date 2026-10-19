/* Von Neumann Machine workbench — the six tab panels: Memory, Listing, Trace, Stats, Tests, Reference.
   Global VNWorkbenchTabs.<name>(ctx) -> { el, update(), reset(), show() }.  Browser only.
   ctx gives access to the machine without owning it: state(), asm(), testAsm(), settings(), gotoLine(n), insertText(t), ... (see vn-machine-ui.js). */
(function (global) {
  'use strict';
  var P = global.VNWorkbenchParts, h = P.h, clear = P.clear, btn = P.btn;
  var L = global.VNWorkbenchLib, VN = global.VNMachine;

  function frag(parts) { var f = document.createDocumentFragment(); parts.forEach(function (p) { f.appendChild(typeof p === 'string' ? document.createTextNode(p) : p); }); return f; }
  // a real button for "jump to source line N": rows keep their mouse click, keyboard and screen-reader users get this
  function goLink(ctx, ln, text, extra) {
    return h('button', { cls: 'vnw-golink', text: text, attrs: { type: 'button', 'aria-label': 'Go to source line ' + ln + (extra ? ' (' + extra + ')' : ''), title: 'Jump to line ' + ln + ' in the editor' } });
  }
  function comp(id, text) { return h('span', { cls: 'vnw-ref vn-dp-c-' + id, text: text || id }); }

  /* ───────────── Memory ───────────── */
  function memory(ctx) {
    var cap = h('caption', { cls: 'vn-sr', text: 'Memory cells' });
    var table = h('table', { cls: 'tbl vn-mem vnw-memtable' }, [cap,
      h('thead', null, [h('tr', null, [h('th', { text: 'Addr', attrs: { scope: 'col' } }), h('th', { text: 'Name · marks', attrs: { scope: 'col' } }), h('th', { text: 'Value', attrs: { scope: 'col' } }),
        h('th', { text: 'Bits: opcode | address', attrs: { scope: 'col' } }), h('th', { text: 'As code', attrs: { scope: 'col' } })])]), h('tbody')]);
    var tbody = table.querySelector('tbody');
    var scroll = h('div', { cls: 'tbl-scroll vnw-scroll' }, [table]);
    var msg = h('p', { cls: 'vnw-memmsg', attrs: { role: 'status', 'aria-live': 'polite' } });
    var baseSel = h('select', { cls: 'vnw-select', attrs: { 'aria-label': 'Number base of the Value column' }, on: { change: function () { ctx.setBase(baseSel.value); } } },
      [['dec', 'Decimal'], ['hex', 'Hexadecimal'], ['bin', 'Binary']].map(function (o) { return h('option', { text: o[1], prop: { value: o[0] } }); }));
    var tools = h('div', { cls: 'vnw-paneltools' }, [h('label', { cls: 'vnw-inl', text: 'Show values as ' }, [baseSel]),
      h('span', { cls: 'vnw-hint', text: 'Click a value to change it: type 12, 0x1F or 0b101 (plain digits are decimal), then Enter. Click any other part of a row to jump to its source line.' })]);
    var el = h('div', { cls: 'vnw-memwrap vn-memwrap', attrs: { 'data-node': 'MEM' } }, [tools, scroll, msg]);
    var cache = [], linked = [], lastSize = -1, lastAsm = null;

    function build() {
      var st = ctx.state(); clear(tbody); cache = []; lastSize = st.size; lastAsm = ctx.asm();
      for (var a = 0; a < st.size; a++) {
        var inp = h('input', { cls: 'vn-cell', attrs: { type: 'text', inputmode: 'text', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Value of cell ' + a, 'data-a': String(a) } });
        var aln = lastAsm && lastAsm.addrToLine ? lastAsm.addrToLine[a] : 0;
        tbody.appendChild(h('tr', { attrs: { 'data-a': String(a) } }, [aln ? h('td', { cls: 'mono' }, [goLink(ctx, aln, String(a), 'cell ' + a)]) : h('td', { cls: 'mono', text: String(a) }), h('td', { cls: 'mono vn-nm' }), h('td', null, [inp]), h('td', { cls: 'mono vn-bits' }), h('td', { cls: 'mono vn-dis' })]));
      }
    }
    tbody.addEventListener('change', function (e) {
      var t = e.target;
      if (!t.classList || !t.classList.contains('vn-cell')) return;
      var a = +t.getAttribute('data-a'), r = L.parseCellValue(t.value);
      if (!r.ok) { t.setAttribute('aria-invalid', 'true'); msg.textContent = 'Cell ' + a + ': ' + r.error; msg.className = 'vnw-memmsg bad'; t.value = ctx.format(ctx.state().mem[a]); return; }
      t.removeAttribute('aria-invalid');
      var bare = /^\s*[+-]?\d+\s*$/.test(t.value), typed = t.value.trim();
      var res = ctx.setCell(a, r.value);
      // show what was stored, in the column's own base (the field keeps focus, so the table repaint skips it)
      var stored = ctx.state().mem[a];
      t.value = ctx.format(stored);
      msg.className = 'vnw-memmsg'; msg.textContent = res && res.note ? res.note : '';
      if (!msg.textContent && ctx.settings().base !== 'dec' && bare) msg.textContent = 'Cell ' + a + ' = ' + stored + ' (typed digits are decimal; shown as ' + t.value + '). Use a 0x or 0b prefix to type hex or binary.';
      else if (!msg.textContent && String(stored) !== typed && /^\s*[+-]?0[xXbB]/.test(typed)) msg.textContent = 'Cell ' + a + ' = ' + stored + '.';
    });
    tbody.addEventListener('focusin', function (e) { if (e.target.classList && e.target.classList.contains('vn-cell')) { msg.textContent = ''; e.target.removeAttribute('aria-invalid'); } });
    tbody.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('input')) return;
      var tr = e.target.closest && e.target.closest('tr'); if (!tr) return;
      var asm = ctx.asm(), a = +tr.getAttribute('data-a'), ln = asm && asm.addrToLine ? asm.addrToLine[a] : 0;
      if (ln) ctx.gotoLine(ln);
    });

    function update() {
      var st = ctx.state(), asm = ctx.asm();
      if (st.size !== lastSize || asm !== lastAsm) build();
      var rows = tbody.children, base = ctx.settings().base, started = st.microCount > 0 || st.queue.length > 0;
      var lk = {};
      linked.forEach(function (a) { lk[a] = 1; });
      for (var a = 0; a < st.size; a++) {
        var w = st.mem[a], tr = rows[a], kind = asm.cells[a] ? asm.cells[a].kind : 'free';
        var isPc = a === st.pc && !st.halted && !st.error, isMar = started && a === st.mar;
        var cls = 'vn-' + kind + (isPc ? ' vn-pcrow' : '') + (a === st.lastWrite ? ' vn-wr' : '') + (a === st.lastRead ? ' vn-rd' : '') + (lk[a] ? ' vnw-linked' : '') + (asm.addrToLine[a] ? ' vnw-click' : '');
        var key = [cls, asm.names[a] || '', isPc, isMar, a === st.lastRead, a === st.lastWrite, w, base, st.wrap].join('|'), c = cache[a];
        if (c === key) continue;
        cache[a] = key;
        tr.className = cls;
        var nm = tr.children[1];
        clear(nm);
        if (asm.names[a]) nm.appendChild(document.createTextNode(asm.names[a] + ' '));
        if (isPc) nm.appendChild(h('span', { cls: 'vnw-mk vn-dp-c-PC', text: 'PC' }));
        if (isMar) nm.appendChild(h('span', { cls: 'vnw-mk vn-dp-c-MAR', text: 'MAR' }));
        if (a === st.lastRead) nm.appendChild(h('span', { cls: 'vnw-mk vn-dp-c-MDR', text: 'read' }));
        if (a === st.lastWrite) nm.appendChild(h('span', { cls: 'vnw-mk vn-dp-c-MEM strong', text: 'write' }));
        var inp = tr.children[2].firstChild;
        if (document.activeElement !== inp) inp.value = ctx.format(w);
        var b = VN.bits(w, st.addrBits, st.opBits, st.wrap);
        tr.children[3].textContent = b || '(does not fit in ' + st.wordBits + ' bits)';
        tr.children[4].textContent = VN.disasm(w, st.addrBits, st.opBits, st.wrap);
      }
      baseSel.value = base;
      if (!el.hidden && !scroll.closest('[hidden]')) keepVisible(st);
    }
    function keepVisible(st) {
      var target = st.halted || st.error ? null : tbody.children[st.pc];
      if (!target || !target.offsetHeight) return;
      var top = target.offsetTop, bot = top + target.offsetHeight, head = scroll.querySelector('thead').offsetHeight;
      if (top - head < scroll.scrollTop) scroll.scrollTop = Math.max(0, top - head - 4);
      else if (bot > scroll.scrollTop + scroll.clientHeight) scroll.scrollTop = bot - scroll.clientHeight + 4;
    }
    return { el: el, update: update, reset: function () { lastSize = -1; msg.textContent = ''; cache = []; }, show: update,
      setLinked: function (addrs) { linked = addrs || []; cache = []; update(); } };
  }

  /* ───────────── Listing ───────────── */
  function listing(ctx) {
    var tbody = h('tbody');
    var table = h('table', { cls: 'tbl vnw-listing' }, [h('caption', { cls: 'vn-sr', text: 'Assembled program listing' }),
      h('thead', null, [h('tr', null, ['Addr', 'Word (bits)', 'Hex', 'Instruction', 'Source line'].map(function (t) { return h('th', { text: t, attrs: { scope: 'col' } }); }))]), tbody]);
    var note = h('p', { cls: 'vnw-hint' });
    var el = h('div', { cls: 'vnw-listwrap' }, [note, h('div', { cls: 'tbl-scroll vnw-scroll' }, [table])]);
    var rowOf = {}, lastPc = -1, builtFor = null;
    tbody.addEventListener('click', function (e) {
      var tr = e.target.closest && e.target.closest('tr'); if (!tr) return;
      var ln = +tr.getAttribute('data-line'); if (ln) ctx.gotoLine(ln);
    });
    function build() {
      var asm = ctx.asm(); clear(tbody); rowOf = {}; builtFor = asm; lastPc = -1;
      if (!asm || !asm.ok) { note.textContent = 'The program has assembler errors, so there is no listing yet.'; return; }
      var free = 0, ab = asm.addrBits, ob = asm.opBits, wrap = ctx.settings().wrap;
      var byAddr = {}; asm.listing.forEach(function (it) { byAddr[it.addr] = it; });
      for (var a = 0; a < asm.size; a++) {
        var cell = asm.cells[a];
        if (!cell || cell.kind === 'free') { free++; continue; }
        var w = asm.mem[a], it = byAddr[a], ln = cell.line || 0, srcText = '', instr;
        if (cell.kind === 'code' && it) {
          instr = L.instrText(asm, { text: it.op + (it.operand !== null ? ' ' + it.operand : ''), arg: it.operand });
          if (it.of > 1) instr += '   (' + it.part + ' of ' + it.of + ' for ' + String(it.text).trim().split(/\s+/)[0].toUpperCase() + ')';
          srcText = it.text;
        } else { instr = 'data: ' + w; srcText = ''; }
        var tr = h('tr', { cls: 'vn-' + cell.kind + (ln ? ' vnw-click' : ''), attrs: { 'data-line': String(ln), 'data-a': String(a) } }, [
          h('td', { cls: 'mono', text: String(a) }),
          h('td', { cls: 'mono', text: VN.bits(w, ab, ob, wrap) || String(w) }),
          h('td', { cls: 'mono', text: VN.hex(w, ab, ob, wrap) || '' }),
          h('td', { cls: 'mono', text: instr }),
          h('td', { cls: 'mono vnw-srcline' }, [ln ? goLink(ctx, ln, String(ln), 'cell ' + a) : null, ln && cell.kind === 'code' ? ' ' + String(srcText).replace(/\s+/g, ' ').trim() : (ln ? ' ' + 'data' : '')])]);
        rowOf[a] = tr; tbody.appendChild(tr);
      }
      note.textContent = asm.codeLen + ' code word' + (asm.codeLen === 1 ? '' : 's') + ' (cells 0–' + Math.max(0, asm.codeLen - 1) + '), then ' + (asm.cells.filter(function (c) { return c.kind === 'data'; }).length) + ' data cells; ' + free + ' of ' + asm.size + ' cells are free. This is the program as assembled, before it runs. Click a row to jump to its source line.';
    }
    function update() {
      var st = ctx.state(), asm = ctx.asm();
      if (builtFor !== asm) build();
      var pc = st.halted || st.error ? -1 : st.pc;
      if (pc !== lastPc) {
        if (rowOf[lastPc]) rowOf[lastPc].classList.remove('vn-pcrow');
        if (rowOf[pc]) rowOf[pc].classList.add('vn-pcrow');
        lastPc = pc;
      }
    }
    return { el: el, update: update, reset: function () { builtFor = null; }, show: function () { update(); } };
  }

  /* ───────────── Trace ───────────── */
  function trace(ctx) {
    var tbody = h('tbody');
    var table = h('table', { cls: 'tbl vnw-trace' }, [h('caption', { cls: 'vn-sr', text: 'Executed instructions, oldest first' }),
      h('thead', null, [h('tr', null, ['#', 'Addr', 'Instruction', 'R after', 'Flags after', 'Line'].map(function (t) { return h('th', { text: t, attrs: { scope: 'col' } }); }))]), tbody]);
    var empty = h('p', { cls: 'vnw-empty', text: 'Nothing has been executed yet. Step the machine and every finished instruction appears here.' });
    var scroll = h('div', { cls: 'tbl-scroll vnw-scroll' }, [table]);
    var copy = btn('Copy as text', 'ghost', function () {
      var st = ctx.state(); ctx.copy(L.traceToText(st.trace, ctx.asm()), 'Trace copied to the clipboard.');
    });
    var info = h('span', { cls: 'vnw-hint' });
    var el = h('div', { cls: 'vnw-tracewrap' }, [h('div', { cls: 'vnw-paneltools' }, [copy, info]), empty, scroll]);
    var lastN = 0, lastSt = null, dirty = true;
    tbody.addEventListener('click', function (e) {
      var tr = e.target.closest && e.target.closest('tr'); if (!tr) return;
      var ln = +tr.getAttribute('data-line'); if (ln) ctx.gotoLine(ln);
    });
    function addRow(e, asm) {
      var ln = asm.addrToLine ? asm.addrToLine[e.at] : 0;
      tbody.appendChild(h('tr', { cls: ln ? 'vnw-click' : '', attrs: { 'data-line': String(ln || 0) } }, [
        h('td', { cls: 'mono', text: String(e.n) }), h('td', { cls: 'mono', text: String(e.at) }), h('td', { cls: 'mono', text: L.instrText(asm, e) }),
        h('td', { cls: 'mono', text: String(e.r) }), h('td', { cls: 'mono', text: L.flagsText(e) }), h('td', { cls: 'mono' }, [ln ? goLink(ctx, ln, String(ln), 'instruction ' + e.n) : null])]));
    }
    function paintNow() {
      var st = ctx.state(), asm = ctx.asm(), tr = st.trace;
      if (st !== lastSt || (tr.length && tr[tr.length - 1].n < lastN)) { clear(tbody); lastN = 0; lastSt = st; }
      for (var i = 0; i < tr.length; i++) if (tr[i].n > lastN) { addRow(tr[i], asm); lastN = tr[i].n; }
      while (tbody.children.length > 500) tbody.removeChild(tbody.firstChild);
      var n = tbody.children.length;
      empty.hidden = n > 0; scroll.hidden = n === 0; copy.disabled = n === 0;
      info.textContent = n ? 'Last ' + n + ' of ' + st.instrCount + ' instructions' + (st.instrCount > 500 ? ' (older ones are dropped)' : '') + '. Click a row to jump to its line.' : '';
      scroll.scrollTop = scroll.scrollHeight;
      dirty = false;
    }
    return { el: el, update: function () { if (!el.hidden && !el.closest('[hidden]')) paintNow(); else dirty = true; }, reset: function () { lastSt = null; lastN = 0; dirty = true; }, show: paintNow };
  }

  /* ───────────── Stats ───────────── */
  function stats(ctx) {
    var kv = {};
    function metric(key, label, hint) { var v = h('dd', { cls: 'vnw-mv', text: '0' }); kv[key] = v; return h('div', { cls: 'vnw-metric' }, [h('dt', { text: label }), v, hint ? h('dd', { cls: 'vnw-mh', text: hint }) : null]); }
    var grid = h('dl', { cls: 'vnw-metrics' }, [metric('instr', 'Instructions (Instr)', 'finished, the Instr counter'), metric('micro', 'Micro-steps', 'one per arrow'), metric('cycles', 'Cycles', 'micro-steps, memory ones cost the latency'), metric('lat', 'Memory latency', 'cycles per memory access')]);
    var bar = h('div', { cls: 'vnw-bar', attrs: { role: 'img' } });
    var segEls = {}, legend = h('ul', { cls: 'vnw-barlegend' });
    [['ifetch', 'Instruction fetches'], ['dread', 'Data reads'], ['dwrite', 'Data writes'], ['other', 'Everything else']].forEach(function (s) {
      var seg = h('span', { cls: 'vnw-seg vnw-seg-' + s[0] }); segEls[s[0]] = seg; bar.appendChild(seg);
      var cnt = h('span', { cls: 'vnw-segv', text: '0' });
      legend.appendChild(h('li', null, [h('i', { cls: 'vnw-sw vnw-seg-' + s[0] }), h('span', { text: s[1] + ': ' }), cnt]));
      segEls[s[0] + 'v'] = cnt;
    });
    var share = h('p', { cls: 'vnw-share' });
    var bott = h('div', { cls: 'vnw-explain' });
    var settingsBtn = btn('Change memory latency…', 'ghost', function () { ctx.openSettings(settingsBtn); });
    var mixList = h('ul', { cls: 'vnw-mix' });
    var mixEmpty = h('p', { cls: 'vnw-empty', text: 'No instruction has finished yet.' });
    var el = h('div', { cls: 'vnw-statswrap' }, [grid,
      h('h3', { cls: 'vnw-h3', text: 'Where do the cycles go?' }), share, bar, legend, bott, h('div', { cls: 'vnw-paneltools' }, [settingsBtn]),
      h('h3', { cls: 'vnw-h3', text: 'Instruction mix' }), mixEmpty, mixList]);
    function update() {
      var st = ctx.state(), m = L.statsModel(VN.stats(st));
      kv.instr.textContent = String(m.instr); kv.micro.textContent = String(m.micro); kv.cycles.textContent = String(m.cycles); kv.lat.textContent = String(m.memLatency);
      m.segments.forEach(function (s) {
        var k = s.key;
        segEls[k].style.width = (s.frac * 100).toFixed(2) + '%';
        segEls[k + 'v'].textContent = (k === 'other' ? '' : s.count + ' × ' + m.memLatency + ' = ') + s.cycles + (s.cycles === 1 ? ' cycle (' : ' cycles (') + s.pct + '%)';
      });
      var summary = m.cycles ? 'Memory accesses take ' + m.memSharePct + '% of all ' + m.cycles + ' cycles.' : 'Run the program: the bar fills with the share of cycles spent on memory.';
      share.textContent = summary;
      bar.setAttribute('aria-label', summary + (m.cycles ? ' Instruction fetches ' + m.segments[0].pct + '%, data reads ' + m.segments[1].pct + '%, data writes ' + m.segments[2].pct + '%, everything else ' + m.segments[3].pct + '%.' : ''));
      var fetchPct = m.segments[0].pct;
      bott.textContent = m.cycles
        ? 'Von Neumann bottleneck (slide 35): program and data live in one memory behind one path, so every instruction needs a memory access just to be fetched (' + m.ifetches + ' fetches here' + (m.cycles ? ', ' + fetchPct + '% of the cycles' : '') + '), plus accesses for its operands. The faster the CPU gets compared with the memory, the bigger this slice becomes. Real CPUs soften it with caches.'
        : 'Von Neumann bottleneck (slide 35): program and data live in one memory behind one path, so every instruction needs a memory access just to be fetched, plus accesses for its operands. Real CPUs soften it with caches.';
      clear(mixList);
      mixEmpty.hidden = m.mix.length > 0;
      m.mix.forEach(function (x) {
        mixList.appendChild(h('li', null, [h('span', { cls: 'vnw-mixn mono', text: x.name }), h('span', { cls: 'vnw-mixbar' }, [h('span', { cls: 'vnw-mixfill', attrs: { style: 'width:' + (x.rel * 100).toFixed(1) + '%' } })]),
          h('span', { cls: 'vnw-mixc mono', text: x.count + ' (' + Math.round(x.frac * 100) + '%)' })]));
      });
    }
    return { el: el, update: function () { if (!el.hidden && !el.closest('[hidden]')) update(); }, reset: function () {}, show: update };
  }

  /* ───────────── Tests ───────────── */
  var ICON = { pass: '✓', fail: '✗', error: '!', 'needs-input': '…', timeout: '⏱', invalid: '?' };
  function tests(ctx) {
    var rows = [], results = [], running = null, ids = 0;
    var tbody = h('tbody');
    var table = h('table', { cls: 'tbl vnw-tests' }, [h('caption', { cls: 'vn-sr', text: 'Test cases: input, expected output, result' }),
      h('thead', null, [h('tr', null, ['#', 'Input (numbers)', 'Expected output', 'Result', 'What it printed', 'Instr', 'Actions'].map(function (t) { return h('th', { text: t, attrs: { scope: 'col' } }); }))]), tbody]);
    var summary = h('p', { cls: 'vnw-testsum', attrs: { role: 'status', 'aria-live': 'polite' } });
    var runBtn = btn('Run all tests', 'primary', function () { if (running) stop(); else run(); });
    var addBtn = btn('Add a case', 'ghost', function () { rows.push({ in: '', exp: '' }); results.push(null); changed(); paint(); focusRow(rows.length - 1); });
    var exBtn = btn('Use the example’s tests', 'ghost', function () { var r = ctx.exampleRows(); if (!r) return; rows = r.map(function (x) { return { in: x.in, exp: x.exp }; }); results = rows.map(function () { return null; }); changed(); paint(); say('Loaded ' + rows.length + ' test cases from the example.'); });
    var recBtn = btn('Record current run as a test', 'ghost', function () {
      var rec = ctx.recordRun();
      if (!rec.ok) { say(rec.error); return; }
      rows.push({ in: rec.in, exp: rec.exp }); results.push(null); changed(); paint(); say('Recorded: input “' + rec.in + '” → ' + (rec.exp || '(no output)') + '. Check that this is what the program SHOULD do.');
    });
    var clrBtn = btn('Remove all', 'ghost', function () { rows = []; results = []; changed(); paint(); say('All test cases removed.'); addBtn.focus(); /* this button is now disabled: keep the keyboard on the tab */ });
    var hint = h('p', { cls: 'vnw-hint', text: 'Each case runs the program from scratch with that input. Expected output is a list of numbers, or a status word (' + L.STATUS_WORDS.join(', ') + ') when the run should end that way. Tests use the current editor text and the machine settings, and do not touch the machine above.' });
    var el = h('div', { cls: 'vnw-testswrap' }, [h('div', { cls: 'vnw-paneltools' }, [runBtn, addBtn, exBtn, recBtn, clrBtn]), summary, h('div', { cls: 'tbl-scroll vnw-scroll' }, [table]), hint]);

    function say(t) { summary.textContent = t; summary.className = 'vnw-testsum'; }
    function changed() { if (ctx.onRowsChanged) ctx.onRowsChanged(rows); }
    function focusRow(i) { var tr = tbody.children[i]; if (tr) { var inp = tr.querySelector('input'); if (inp) inp.focus(); } }
    function setResult(i, rs, j) {
      results[i] = { rs: rs, j: j };
      var tr = tbody.children[i]; if (tr) paintResult(tr, results[i]);
    }
    function paintResult(tr, r) {
      var vc = tr.children[3], ac = tr.children[4], ic = tr.children[5];
      clear(vc); clear(ac); clear(ic);
      tr.className = r ? 'vnw-t-' + r.j.verdict : '';
      if (!r) { ic.textContent = ''; return; }
      vc.appendChild(h('span', { cls: 'vnw-v vnw-v-' + r.j.verdict }, [h('span', { text: ICON[r.j.verdict], attrs: { 'aria-hidden': 'true' } }), ' ' + r.j.label]));
      ac.textContent = r.j.actual;
      ic.textContent = r.rs.status === 'invalid' ? '' : String(r.rs.instr);
    }
    function paint() {
      clear(tbody);
      rows.forEach(function (row, i) {
        var inp = h('input', { cls: 'vnw-tin', attrs: { type: 'text', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Test ' + (i + 1) + ' input' }, prop: { value: row.in } });
        var exp = h('input', { cls: 'vnw-tin', attrs: { type: 'text', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Test ' + (i + 1) + ' expected output', placeholder: '(nothing)' }, prop: { value: row.exp } });
        function edit() { row.in = inp.value; row.exp = exp.value; results[i] = null; paintResult(tr, null); changed(); summaryStale(); }
        inp.addEventListener('input', edit); exp.addEventListener('input', edit);
        var tr = h('tr', null, [h('td', { text: String(i + 1) }), h('td', null, [inp]), h('td', null, [exp]), h('td'), h('td', { cls: 'mono vnw-actual' }), h('td', { cls: 'mono' }),
          h('td', { cls: 'vnw-tact' }, [
            h('button', { cls: 'vnw-mini', text: 'Try', attrs: { type: 'button', 'aria-label': 'Try test ' + (i + 1) + ' in the machine', title: 'Put this input in the machine and reset it' }, on: { click: function () { ctx.tryInput(row.in); } } }),
            h('button', { cls: 'vnw-mini', text: 'Delete', attrs: { type: 'button', 'aria-label': 'Delete test ' + (i + 1) }, on: { click: function () {
              rows.splice(i, 1); results.splice(i, 1); changed(); paint();
              // the clicked button is gone: keep the keyboard where the user was working
              if (rows.length) focusRow(Math.min(i, rows.length - 1)); else addBtn.focus();
            } } })])]);
        tbody.appendChild(tr);
        if (results[i]) paintResult(tr, results[i]);
      });
      exBtn.disabled = !ctx.exampleRows();
      clrBtn.disabled = !rows.length; runBtn.disabled = !rows.length && !running;
      if (!rows.length) say('No test cases yet. Add one, record the current run, or use the example’s tests.'); else summaryStale();
    }
    function summaryStale() {
      var done = results.filter(Boolean).length;
      if (!rows.length) return;
      if (!done) say(rows.length + (rows.length === 1 ? ' test case' : ' test cases') + '. Press “Run all tests”.');
      else if (done === rows.length) tally();
      else say(done + ' of ' + rows.length + ' cases have a result. Press “Run all tests” again.');
    }
    function tally() {
      var c = { pass: 0, fail: 0, error: 0, 'needs-input': 0, timeout: 0, invalid: 0 };
      results.forEach(function (r) { if (r) c[r.j.verdict]++; });
      var bad = rows.length - c.pass, parts = [];
      ['fail', 'error', 'needs-input', 'timeout', 'invalid'].forEach(function (k) { if (c[k]) parts.push(c[k] + ' ' + L.VERDICT_LABEL[k].toLowerCase()); });
      summary.textContent = c.pass + ' of ' + rows.length + ' passed' + (bad ? ' (' + parts.join(', ') + ')' : ' — all green');
      summary.className = 'vnw-testsum ' + (bad ? 'bad' : 'good');
    }
    function stop() { if (running) running.cancelled = true; }
    function setRunning(on) {
      runBtn.textContent = on ? 'Stop' : 'Run all tests'; addBtn.disabled = exBtn.disabled = recBtn.disabled = clrBtn.disabled = on;
      if (!on) { exBtn.disabled = !ctx.exampleRows(); clrBtn.disabled = !rows.length; }
    }
    function run() {
      var asm = ctx.testAsm();
      if (!rows.length) { say('Add a test case first.'); return Promise.resolve([]); }
      if (!asm || !asm.ok) { say('Fix the assembler errors first: the tests need a program that assembles.'); return Promise.resolve([]); }
      var cases = rows.map(L.rowToCase), cancel = { cancelled: false };
      running = cancel; results = rows.map(function () { return null; }); paint(); setRunning(true); say('Running…');
      return L.runCasesAsync(asm, cases, ctx.settings(), { cancel: cancel, onResult: function (i, rs, j) { setResult(i, rs, j); summary.textContent = 'Running… ' + (i + 1) + ' of ' + rows.length; } }).then(function (r) {
        running = null; setRunning(false);
        if (r.cancelled) say('Stopped after ' + r.results.length + ' of ' + rows.length + ' cases.'); else tally();
        return r.results.map(function (x, i) { return { in: x.in, out: x.out, status: x.status, instr: x.instr, micro: x.micro, cycles: x.cycles, verdict: r.judged[i].verdict, actual: r.judged[i].actual }; });
      }, function (e) { running = null; setRunning(false); say('The test run failed: ' + (e && e.message)); return []; });
    }
    function setRows(r) { rows = r.map(function (x) { return { in: String(x.in), exp: String(x.exp) }; }); results = rows.map(function () { return null; }); stop(); paint(); }
    return { el: el, update: function () {}, reset: function () { results = rows.map(function () { return null; }); if (!el.hidden) paint(); else summaryStale(); }, show: paint,
      run: run, getRows: function () { return rows.map(function (x) { return { in: x.in, exp: x.exp }; }); }, setRows: setRows, stop: stop,
      invalidate: function () { stop(); results = rows.map(function () { return null; }); paint(); } };
  }

  /* ───────────── Reference ───────────── */
  function reference(ctx) {
    var tbody = h('tbody'), isaLabel = h('p', { cls: 'vnw-hint' });
    var table = h('table', { cls: 'tbl vnw-reftable' }, [h('caption', { cls: 'vn-sr', text: 'Instruction set' }),
      h('thead', null, [h('tr', null, ['Instruction', 'Opcode | operand', 'Meaning', 'Micro-steps', 'Memory accesses'].map(function (t) { return h('th', { text: t, attrs: { scope: 'col' } }); }))]), tbody]);
    var syntax = h('div', { cls: 'vnw-refcols' }, [
      h('div', null, [h('h3', { cls: 'vnw-h3', text: 'Assembler syntax' }), h('ul', { cls: 'vnw-reflist' }, [
        h('li', null, [frag([h('code', { text: 'LOAD x' }), ' — one instruction per line: a mnemonic and, except for HALT (and NOP), one operand: a name or a cell number.'])]),
        h('li', null, [frag([h('code', { text: 'loop:' }), ' — a label names the address of the next instruction. Names are case-sensitive and may not be a mnemonic.'])]),
        h('li', null, [frag([h('code', { text: '.data' }), ' then ', h('code', { text: 'x: 5' }), ', ', h('code', { text: 'arr: .word 1, 2, 3' }), ', ', h('code', { text: 'buf: .space 4' }), ' — data cells. A value may be another name (a pointer). ', h('code', { text: '.text' }), ' returns to code.'])]),
        h('li', null, [frag([h('strong', { text: 'An operand is a cell address, not a value.' }), ' ', h('code', { text: 'ADD 1' }), ' adds the contents of cell 1, not the number 1. A constant has to live in a data cell (or, with the extended set, use ', h('code', { text: 'ADDI 1' }), ').'])]),
        h('li', null, [frag(['Wrap-around (Settings): arithmetic results and numbers read by IN are wrapped to W bits; a program word read as data (LOAD or OUT on a code cell) shows its unsigned bit pattern, e.g. 240 for HALT when W = 8.'])]),
        h('li', null, [frag(['Numbers: ', h('code', { text: '12' }), ', ', h('code', { text: '0x1F' }), ', ', h('code', { text: '0b101' }), '; data values may have a sign.'])]),
        h('li', null, [frag(['Comments start with ', h('code', { text: ';' }), ' or ', h('code', { text: '//' }), '. Code always goes first in memory, then the data cells.'])])])]),
      h('div', null, [h('h3', { cls: 'vnw-h3', text: 'Keyboard shortcuts' }), h('table', { cls: 'tbl vnw-keys' }, [h('tbody', null, [
        ['Ctrl/Cmd + Enter', 'Assemble and load now'], ['Ctrl/Cmd + S', 'Save to My programs'], ['F9, or click the gutter', 'Toggle a breakpoint'], ['Ctrl + Space, or Alt + /', 'Autocomplete'],
        ['Tab, Shift + Tab', 'Indent, outdent'], ['Esc, then Tab', 'Leave the editor (keyboard users)'], ['Ctrl/Cmd + /', 'Comment or uncomment lines'], ['Ctrl/Cmd + Z, Y', 'Undo, redo'], ['F1', 'Help for the word at the cursor']
      ].map(function (k) { return h('tr', null, [h('td', null, [h('kbd', { text: k[0] })]), h('td', { text: k[1] })]); }))])])]);
    var el = h('div', { cls: 'vnw-refwrap' }, [isaLabel, h('div', { cls: 'tbl-scroll vnw-scroll vnw-refscroll' }, [table]), syntax]);
    var builtIsa = null;
    function build() {
      var isa = ctx.settings().isa; if (isa === builtIsa) return; builtIsa = isa;
      var rows = L.instructionTable(isa); clear(tbody);
      isaLabel.textContent = isa === 'ext' ? 'Extended instruction set: the 16 instructions of slide 34 plus 12 supplementary ones (marked ext), with a 5-bit opcode. Click an instruction to insert it in the editor.'
        : 'Lecture instruction set (slide 34): 16 instructions, 4-bit opcode. JUMPGE and JUMPLE are assembler shortcuts for two jumps. Click an instruction to insert it in the editor.';
      rows.forEach(function (r) {
        var b = h('button', { cls: 'vnw-insert', text: r.name, attrs: { type: 'button', title: 'Insert ' + r.name + ' at the cursor' }, on: { click: function () { ctx.insertText(r.name + (r.arg ? ' ' : '')); } } });
        tbody.appendChild(h('tr', null, [h('td', { cls: 'mono' }, [b, r.ext ? h('span', { cls: 'vnw-extbadge', text: 'ext' }) : null]), h('td', { cls: 'mono', text: r.bits }), h('td', { text: r.meaning + (r.imm ? ' (the operand is a number, not an address)' : '') }),
          h('td', { cls: 'mono', text: String(r.micro) }), h('td', { cls: 'mono', text: r.memAccesses + (r.memAccesses > 1 ? ' (' + (r.dataReads ? r.dataReads + ' read' + (r.dataReads > 1 ? 's' : '') : '') + (r.dataReads && r.dataWrites ? ', ' : '') + (r.dataWrites ? r.dataWrites + ' write' : '') + ')' : ' (fetch only)') })]));
      });
      if (isa !== 'ext') ['JUMPGE', 'JUMPLE'].forEach(function (nm) {
        tbody.appendChild(h('tr', { cls: 'vnw-pseudo' }, [h('td', { cls: 'mono' }, [h('button', { cls: 'vnw-insert', text: nm, attrs: { type: 'button' }, on: { click: function () { ctx.insertText(nm + ' '); } } }), h('span', { cls: 'vnw-extbadge', text: 'shortcut' })]),
          h('td', { cls: 'mono', text: '(2 words)' }), h('td', { text: nm === 'JUMPGE' ? 'assembler shortcut for JUMPGT X followed by JUMPEQ X' : 'assembler shortcut for JUMPLT X followed by JUMPEQ X' }), h('td', { cls: 'mono', text: '12' }), h('td', { cls: 'mono', text: '2 (fetch only)' })]));
      });
    }
    return { el: el, update: build, reset: function () { builtIsa = null; }, show: build };
  }

  global.VNWorkbenchTabs = { memory: memory, listing: listing, trace: trace, stats: stats, tests: tests, reference: reference };
})(window);
