/* Von Neumann Machine workbench — reusable DOM parts: element helper, toasts, dialogs, tabs, and the four dialogs
   (Examples browser, Settings, My programs, Share). Global VNWorkbenchParts. Browser only.
   Security rule: user text (names, code, messages, imported files) reaches the DOM only through textContent / value. */
(function (global) {
  'use strict';
  var uid = 0;
  function nextId(p) { uid++; return (p || 'vnw') + '-' + uid; }

  /* h('button', { cls:'btn', text:'Go', attrs:{type:'button'}, on:{click:fn}, prop:{disabled:true} }, [children]) */
  function h(tag, props, kids) {
    var n = document.createElement(tag);
    if (props) {
      if (props.cls) n.className = props.cls;
      if (props.text !== undefined) n.textContent = props.text;
      if (props.attrs) Object.keys(props.attrs).forEach(function (k) { if (props.attrs[k] !== null && props.attrs[k] !== undefined) n.setAttribute(k, props.attrs[k]); });
      if (props.prop) Object.keys(props.prop).forEach(function (k) { n[k] = props.prop[k]; });
      if (props.on) Object.keys(props.on).forEach(function (k) { n.addEventListener(k, props.on[k]); });
    }
    (kids || []).forEach(function (k) {
      if (k === null || k === undefined || k === false) return;
      n.appendChild(typeof k === 'string' ? document.createTextNode(k) : k);
    });
    return n;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); return n; }
  function btn(text, cls, onClick, attrs) {
    return h('button', { cls: 'btn ' + (cls || 'ghost') + ' small', text: text, attrs: Object.assign({ type: 'button' }, attrs || {}), on: onClick ? { click: onClick } : null });
  }

  /* ───────────── toasts ─────────────
     makeToaster(root) -> { show(msg, {action:{label, run}, ms}), slot (element to place inside a dialog) }  */
  function makeSlot() { return h('div', { cls: 'vnw-toasts', attrs: { role: 'status', 'aria-live': 'polite' } }); }
  function showIn(slot, msg, o) {
    o = o || {};
    var t = h('div', { cls: 'vnw-toast' }, [h('span', { text: msg })]);
    var timer = null, hover = false, ms = o.ms || 6000, prev = document.activeElement;
    function disarm() { if (timer) { clearTimeout(timer); timer = null; } }
    // the countdown runs only while the pointer is away and the keyboard focus is outside the toast (WCAG 2.2.1)
    function arm() { disarm(); if (!hover && !t.contains(document.activeElement)) timer = setTimeout(gone, ms); }
    function gone() {
      disarm();
      var hadFocus = t.contains(document.activeElement);
      if (t.parentNode) t.parentNode.removeChild(t);
      if (hadFocus && prev && prev !== document.body && prev.focus && document.body.contains(prev)) { try { prev.focus(); } catch (e) { /* ignore */ } }
    }
    if (o.action) t.appendChild(h('button', { cls: 'vnw-toast-act', text: o.action.label, attrs: { type: 'button' }, on: { click: function () { gone(); o.action.run(); } } }));
    t.appendChild(h('button', { cls: 'vnw-toast-x', text: '×', attrs: { type: 'button', 'aria-label': 'Dismiss message' }, on: { click: gone } }));
    while (slot.children.length > 2) slot.removeChild(slot.firstChild);
    slot.appendChild(t);
    t.addEventListener('mouseenter', function () { hover = true; disarm(); });
    t.addEventListener('mouseleave', function () { hover = false; arm(); });
    t.addEventListener('focusin', disarm);
    t.addEventListener('focusout', function () { setTimeout(function () { if (t.parentNode && !t.contains(document.activeElement)) arm(); }, 0); });
    arm();
    return gone;
  }

  /* ───────────── dialogs ─────────────
     makeDialog({ title, cls, onOpen, onClose }) -> { dlg, body, foot, slot, open(opener), close(), isOpen() }   */
  function makeDialog(o) {
    var id = nextId('vnw-dlg');
    var dlg = h('dialog', { cls: 'vnw-dialog ' + (o.cls || ''), attrs: { 'aria-labelledby': id + '-t' } });
    var closeBtn = h('button', { cls: 'vnw-dclose', text: '×', attrs: { type: 'button', 'aria-label': 'Close ' + o.title.toLowerCase() } });
    var head = h('div', { cls: 'vnw-dhead' }, [h('h2', { cls: 'vnw-dtitle', text: o.title, attrs: { id: id + '-t' } }), closeBtn]);
    var body = h('div', { cls: 'vnw-dbody' });
    var slot = makeSlot();
    var foot = h('div', { cls: 'vnw-dfoot' }, [slot]);
    dlg.appendChild(h('div', { cls: 'vnw-dinner' }, [head, body, foot]));
    var opener = null, api = { dlg: dlg, body: body, foot: foot, slot: slot };
    function afterClose() {
      var f = opener; opener = null;
      if (o.onClose) o.onClose();
      if (f && f.focus && document.body.contains(f)) { try { f.focus(); } catch (e) { /* ignore */ } }
    }
    api.isOpen = function () { return dlg.open || dlg.hasAttribute('open'); };
    api.open = function (openerEl) {
      if (api.isOpen()) return;
      opener = openerEl || document.activeElement;
      if (typeof dlg.showModal === 'function') dlg.showModal();
      else { dlg.setAttribute('open', ''); dlg.classList.add('vnw-nomodal'); }
      if (o.onOpen) o.onOpen();
    };
    api.close = function () {
      if (!api.isOpen()) return;
      if (typeof dlg.close === 'function' && !dlg.classList.contains('vnw-nomodal')) dlg.close(); else { dlg.removeAttribute('open'); afterClose(); }
    };
    closeBtn.addEventListener('click', api.close);
    dlg.addEventListener('close', afterClose);
    dlg.addEventListener('click', function (e) { if (e.target === dlg) api.close(); });
    dlg.addEventListener('keydown', function (e) { if (e.key === 'Escape' && dlg.classList.contains('vnw-nomodal')) api.close(); });
    return api;
  }

  /* ───────────── tabs (ARIA tablist, automatic activation) ─────────────
     makeTabs([{ id, label, panel }], { label, onSelect(id) }) -> { list, panelsWrap, select(id), current() }  */
  function makeTabs(specs, o) {
    o = o || {};
    var base = nextId('vnw-tabs');
    var list = h('div', { cls: 'vnw-tablist', attrs: { role: 'tablist', 'aria-label': o.label || 'Views' } });
    var wrap = h('div', { cls: 'vnw-panels' });
    var cur = null, tabs = {};
    specs.forEach(function (s, i) {
      var t = h('button', { cls: 'vnw-tab', text: s.label, attrs: { role: 'tab', type: 'button', id: base + '-t-' + s.id, 'aria-controls': base + '-p-' + s.id, 'aria-selected': 'false', tabindex: '-1', 'data-tab': s.id } });
      s.panel.setAttribute('role', 'tabpanel'); s.panel.id = base + '-p-' + s.id; s.panel.setAttribute('aria-labelledby', t.id); s.panel.setAttribute('tabindex', '0');
      s.panel.hidden = true;
      list.appendChild(t); wrap.appendChild(s.panel);
      tabs[s.id] = { tab: t, panel: s.panel, index: i };
      t.addEventListener('click', function () { api.select(s.id, true); });
      t.addEventListener('keydown', function (e) {
        var k = e.key, j = null;
        if (k === 'ArrowRight' || k === 'ArrowDown') j = (i + 1) % specs.length;
        else if (k === 'ArrowLeft' || k === 'ArrowUp') j = (i + specs.length - 1) % specs.length;
        else if (k === 'Home') j = 0; else if (k === 'End') j = specs.length - 1;
        if (j === null) return;
        e.preventDefault(); api.select(specs[j].id, true);
      });
    });
    var api = {
      list: list, panelsWrap: wrap, tabs: tabs,
      current: function () { return cur; },
      select: function (id, focus) {
        if (!tabs[id]) return false;
        Object.keys(tabs).forEach(function (k) {
          var on = k === id;
          tabs[k].tab.setAttribute('aria-selected', on ? 'true' : 'false'); tabs[k].tab.setAttribute('tabindex', on ? '0' : '-1');
          tabs[k].panel.hidden = !on;
        });
        cur = id;
        if (focus) tabs[id].tab.focus();
        if (o.onSelect) o.onSelect(id);
        return true;
      }
    };
    return api;
  }

  /* ───────────── Examples browser ───────────── */
  var SHORT = { basics: 'Basics', io: 'Input and output', decisions: 'Decisions', loops: 'Loops', stored: 'Stored program', wrong: 'When things go wrong', speed: 'Speed and bottleneck', ext: 'Extended set', custom: 'Customize' };
  var LEVEL_NAMES = { 1: 'Starter', 2: 'Practice', 3: 'Challenge' };
  function levelDots(n) { return h('span', { cls: 'vnw-dots', attrs: { role: 'img', 'aria-label': 'Level ' + n + ' of 3: ' + LEVEL_NAMES[n] } }, [h('span', { text: '●'.repeat(n) + '○'.repeat(3 - n), attrs: { 'aria-hidden': 'true' } }), h('span', { cls: 'vnw-lvname', text: LEVEL_NAMES[n] })]); }

  /* ctx: { Examples, getCurrentId(), onPick(item), toast } */
  function examplesBrowser(ctx) {
    var R = ctx.Examples;
    var state = { category: '', level: 0, isa: '', q: '' };
    var d = makeDialog({ title: 'Examples', cls: 'vnw-d-examples', onOpen: function () { state.category = ''; state.level = 0; state.isa = ''; state.q = ''; search.value = ''; lvl.value = '0'; isa.value = ''; refresh(); setTimeout(function () { search.focus(); }, 0); } });
    var search = h('input', { cls: 'vnw-search', attrs: { type: 'search', 'aria-label': 'Search examples', placeholder: 'Search: loop, swap, pointer, bug…', autocomplete: 'off', spellcheck: 'false' }, on: { input: function () { state.q = search.value; refresh(); } } });
    var lvl = h('select', { cls: 'vnw-select', attrs: { 'aria-label': 'Filter by level' }, on: { change: function () { state.level = +lvl.value; refresh(); } } },
      [h('option', { text: 'All levels', prop: { value: '0' } })].concat([1, 2, 3].map(function (n) { return h('option', { text: n + ' · ' + LEVEL_NAMES[n], prop: { value: String(n) } }); })));
    var isa = h('select', { cls: 'vnw-select', attrs: { 'aria-label': 'Filter by instruction set' }, on: { change: function () { state.isa = isa.value; refresh(); } } },
      [h('option', { text: 'Both instruction sets', prop: { value: '' } }), h('option', { text: 'Lecture set only', prop: { value: 'lecture' } }), h('option', { text: 'Extended set only', prop: { value: 'ext' } })]);
    var chips = h('div', { cls: 'vnw-chips', attrs: { role: 'group', 'aria-label': 'Categories' } });
    var blurb = h('p', { cls: 'vnw-blurb' });
    var count = h('p', { cls: 'vnw-count', attrs: { role: 'status', 'aria-live': 'polite' } });
    var grid = h('div', { cls: 'vnw-cards' });
    d.body.appendChild(h('div', { cls: 'vnw-exfilters' }, [h('div', { cls: 'vnw-exrow' }, [search, lvl, isa]), chips, blurb]));
    d.body.appendChild(count); d.body.appendChild(grid);

    function filt(extra) { return R.list({ category: extra.category, level: state.level || undefined, isa: state.isa || undefined, q: state.q }); }
    // the chip row is built once and updated in place, so the focused chip keeps keyboard focus when it is activated
    var chipEls = null;
    function buildChips() {
      chipEls = [];
      function chip(id, label) {
        var n = h('span', { cls: 'vnw-chip-n', text: '0' });
        var el = h('button', { cls: 'vnw-chip', attrs: { type: 'button', 'aria-pressed': 'false' }, on: { click: function () { state.category = id; refresh(); } } }, [label + ' ', n]);
        chips.appendChild(el); chipEls.push({ id: id, el: el, n: n });
      }
      chip('', 'All');
      R.CATEGORIES.forEach(function (c) { chip(c.id, SHORT[c.id] || c.title); });
    }
    function refresh() {
      var cur = ctx.getCurrentId ? ctx.getCurrentId() : null;
      if (!chipEls) buildChips();
      chipEls.forEach(function (c) {
        var on = state.category === c.id;
        c.el.className = 'vnw-chip' + (on ? ' on' : ''); c.el.setAttribute('aria-pressed', on ? 'true' : 'false');
        c.n.textContent = String(filt({ category: c.id }).length);
      });
      var cat = state.category ? R.CATEGORIES.filter(function (c) { return c.id === state.category; })[0] : null;
      blurb.textContent = cat ? cat.title + '. ' + cat.blurb : 'Pick an example to load its code, input and machine settings into the editor. Your own program is kept as a draft if it has unsaved changes.';
      var items = filt({ category: state.category });
      count.textContent = items.length === 0 ? 'No example matches these filters.' : items.length + (items.length === 1 ? ' example' : ' examples');
      clear(grid);
      if (!items.length) {
        grid.appendChild(btn('Clear all filters', 'primary', function () { state = { category: '', level: 0, isa: '', q: '' }; search.value = ''; lvl.value = '0'; isa.value = ''; refresh(); search.focus(); }));
        return;
      }
      items.forEach(function (it) {
        var isCur = cur === it.id;
        var card = h('button', { cls: 'vnw-card' + (isCur ? ' cur' : ''), attrs: { type: 'button', 'data-id': it.id }, on: { click: function () { d.close(); ctx.onPick(it); } } }, [
          h('span', { cls: 'vnw-card-top' }, [h('span', { cls: 'vnw-card-title', text: it.title }), isCur ? h('span', { cls: 'vnw-badge', text: 'loaded' }) : null]),
          h('span', { cls: 'vnw-card-sum', text: it.summary }),
          h('span', { cls: 'vnw-card-meta' }, [levelDots(it.level), h('span', { cls: 'vnw-badge ' + (it.isa === 'ext' ? 'ext' : 'lec'), text: it.isa === 'ext' ? 'Extended set' : 'Lecture set' })]),
          h('span', { cls: 'vnw-card-tags' }, it.concepts.slice(0, 3).map(function (c) { return h('span', { cls: 'vnw-tag', text: c }); }))
        ]);
        grid.appendChild(card);
      });
    }
    grid.addEventListener('keydown', function (e) {
      var k = e.key;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].indexOf(k) < 0) return;
      var cards = Array.prototype.slice.call(grid.querySelectorAll('.vnw-card')), i = cards.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      var j = i, r = cards[i].getBoundingClientRect();
      if (k === 'ArrowRight') j = Math.min(cards.length - 1, i + 1);
      else if (k === 'ArrowLeft') j = Math.max(0, i - 1);
      else if (k === 'Home') j = 0; else if (k === 'End') j = cards.length - 1;
      else {
        var dir = k === 'ArrowDown' ? 1 : -1, best = null, bestScore = Infinity;
        cards.forEach(function (c, n) {
          var q = c.getBoundingClientRect(), dy = (q.top - r.top) * dir;
          if (dy < 8) return;
          var score = dy * 1000 + Math.abs(q.left - r.left);
          if (score < bestScore) { bestScore = score; best = n; }
        });
        if (best !== null) j = best;
      }
      cards[j].focus();
    });
    search.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { var c = grid.querySelector('.vnw-card'); if (c) { e.preventDefault(); c.focus(); } }
    });
    d.refresh = refresh;
    d.state = state;
    return d;
  }

  /* ───────────── Settings ─────────────
     ctx: { getSettings(), getAsm(), apply(patch) -> settings, reset() -> settings, wordBits(), Lib } */
  function settingsDialog(ctx) {
    var L = ctx.Lib;
    var d = makeDialog({ title: 'Settings', cls: 'vnw-d-settings', onOpen: function () { paint(); } });
    var id = nextId('vnw-set');
    function radioGroup(name, legend, options, onChange, hint) {
      var fs = h('fieldset', { cls: 'vnw-fs' }, [h('legend', { text: legend })]);
      var wrap = h('div', { cls: 'vnw-radios' });
      options.forEach(function (o, i) {
        var rid = id + '-' + name + '-' + i;
        var inp = h('input', { attrs: { type: 'radio', name: id + '-' + name, id: rid, value: String(o.value) }, on: { change: function () { if (inp.checked) onChange(o.value); } } });
        var lab = h('label', { attrs: { for: rid } }, [h('span', { cls: 'vnw-rl', text: o.label }), o.note ? h('span', { cls: 'vnw-rn', text: o.note }) : null]);
        wrap.appendChild(h('div', { cls: 'vnw-radio' }, [inp, lab]));
      });
      fs.appendChild(wrap);
      var hintEl = hint ? h('p', { cls: 'vnw-hint' }) : null;
      if (hintEl) fs.appendChild(hintEl);
      return { fs: fs, set: function (v) { Array.prototype.forEach.call(fs.querySelectorAll('input'), function (i) { i.checked = i.value === String(v); }); }, hint: hintEl };
    }
    var size = radioGroup('size', 'Memory size', L.SIZES.map(function (s) { return { value: s, label: s === 'auto' ? 'Auto' : String(s) + ' cells' }; }), function (v) { ctx.apply({ size: v === 'auto' ? 'auto' : +v }); paint(); }, true);
    var isa = radioGroup('isa', 'Instruction set', [
      { value: 'lecture', label: 'Lecture', note: 'the 16 instructions of slide 34' },
      { value: 'ext', label: 'Extended', note: 'supplementary, not on slide 34: immediates, pointers, MUL, DIV, MOD' }], function (v) { ctx.apply({ isa: v }); paint(); }, true);
    var latRange = h('input', { attrs: { type: 'range', min: '1', max: '20', step: '1', id: id + '-latr', 'aria-label': 'Memory latency, slider' } });
    var latNum = h('input', { cls: 'vnw-num', attrs: { type: 'number', min: '1', max: '50', step: '1', id: id + '-latn', 'aria-label': 'Memory latency in cycles per access' } });
    var latHint = h('p', { cls: 'vnw-hint' });
    function setLat(v) { ctx.apply({ memLatency: v }); paint(); }
    latRange.addEventListener('input', function () { setLat(+latRange.value); });
    latNum.addEventListener('change', function () { var v = Math.round(+latNum.value); if (!isFinite(v)) v = 1; setLat(Math.max(1, Math.min(50, v))); });
    var latFs = h('fieldset', { cls: 'vnw-fs' }, [h('legend', { text: 'Memory latency (cycles per memory access)' }), h('div', { cls: 'vnw-latrow' }, [latRange, latNum, h('span', { text: 'cycles' })]), latHint]);
    var wrap = radioGroup('wrap', 'Cell width', [
      { value: 'off', label: 'Unlimited', note: 'cells hold any whole number up to ±9 007 199 254 740 991' },
      { value: 'on', label: 'Wrap around', note: 'cells behave like W-bit two’s-complement numbers, like real hardware' }], function (v) { ctx.apply({ wrap: v === 'on' }); paint(); }, true);
    var base = radioGroup('base', 'Number base in the memory table', [
      { value: 'dec', label: 'Decimal' }, { value: 'hex', label: 'Hexadecimal' }, { value: 'bin', label: 'Binary' }], function (v) { ctx.apply({ base: v }); paint(); });
    var guard = h('select', { cls: 'vnw-select', attrs: { id: id + '-guard', 'aria-label': 'Step guard: maximum number of instructions' }, on: { change: function () { ctx.apply({ maxInstr: +guard.value }); paint(); } } });
    var guardFs = h('div', { cls: 'vnw-fs' }, [h('label', { cls: 'vnw-legend', text: 'Step guard (stops runaway programs)', attrs: { for: id + '-guard' } }), guard,
      h('p', { cls: 'vnw-hint', text: 'The machine stops with an error after this many instructions, so an infinite loop cannot freeze the page.' })]);
    var resetBtn = btn('Reset to defaults', 'ghost', function () { ctx.reset(); paint(); });
    var note = h('p', { cls: 'vnw-hint', text: 'Changing a setting re-assembles your program and resets the machine. Your program text is never lost. Settings are remembered in this browser.' });
    d.body.appendChild(h('div', { cls: 'vnw-setgrid' }, [size.fs, isa.fs, latFs, wrap.fs, base.fs, guardFs]));
    d.body.appendChild(note);
    d.foot.insertBefore(h('div', { cls: 'vnw-dactions' }, [resetBtn, btn('Close', 'primary', function () { d.close(); })]), d.slot);

    function paint() {
      var s = ctx.getSettings(), asm = ctx.getAsm();
      size.set(s.size); isa.set(s.isa); wrap.set(s.wrap ? 'on' : 'off'); base.set(s.base);
      latRange.value = String(Math.min(20, s.memLatency)); latNum.value = String(s.memLatency);
      var cells = asm && asm.ok ? asm.size : null;
      size.hint.textContent = s.size === 'auto' ? 'Auto picks the smallest power of two (at least 16) that holds the program' + (cells ? ' (now ' + cells + ' cells).' : '.') : 'The program must fit in ' + s.size + ' cells; the address field has ' + Math.round(Math.log(s.size) / Math.LN2) + ' bits.';
      isa.hint.textContent = s.isa === 'ext' ? 'Extended set on: 28 instructions and a 5-bit opcode, so every word is one bit wider. JUMPGE and JUMPLE become real instructions.' : 'Lecture set: 16 instructions, a 4-bit opcode. JUMPGE and JUMPLE are assembler shortcuts for two jumps.';
      latHint.textContent = s.memLatency === 1 ? '1 = memory answers in a single cycle. Raise it to see how a slow memory dominates the run time (Stats tab).' : 'Every instruction fetch, data read and data write now costs ' + s.memLatency + ' cycles; register transfers still cost 1. Open the Stats tab to see the bottleneck.';
      var W = L.wordBitsFor(s, asm);
      wrap.hint.textContent = s.wrap
        ? (W ? 'Wrap on: W = ' + W + ' bits here, so cells hold ' + (-Math.pow(2, W - 1)) + ' … ' + (Math.pow(2, W - 1) - 1) + ' (127 + 1 becomes −128 when W = 8). Arithmetic results and numbers read by IN are wrapped; a program word read as data (LOAD or OUT on a code cell) shows its unsigned bit pattern, for example 240 for HALT when W = 8.' : 'Wrap on: W is the word width (opcode bits + address bits) of the assembled program.')
        : 'Wrap off: arithmetic that would leave ±9 007 199 254 740 991 stops the machine with an overflow error.';
      clear(guard);
      var opts = L.GUARDS.slice(); if (opts.indexOf(s.maxInstr) < 0) { opts.push(s.maxInstr); opts.sort(function (a, b) { return a - b; }); }
      opts.forEach(function (g) { guard.appendChild(h('option', { text: g.toLocaleString('en-US').replace(/,/g, ' ') + (L.GUARDS.indexOf(g) < 0 ? ' (custom)' : ''), prop: { value: String(g), selected: g === s.maxInstr } })); });
    }
    d.paint = paint;
    return d;
  }

  /* ───────────── My programs ─────────────
     ctx: { store, Lib, onLoad(entry), onChanged(), currentId(), exportName() , download(name, text, mime) , pickFile(cb) } */
  function programsDialog(ctx) {
    var d = makeDialog({ title: 'My programs', cls: 'vnw-d-programs', onOpen: function () { paint(); } });
    var list = h('ul', { cls: 'vnw-plist' });
    var msg = h('p', { cls: 'vnw-hint', attrs: { role: 'status', 'aria-live': 'polite' } });
    var empty = h('p', { cls: 'vnw-empty', text: 'Nothing saved yet. Press Save in the toolbar (or Ctrl/Cmd+S in the editor) to keep a program in this browser.' });
    var avail = h('p', { cls: 'vnw-hint' });
    d.body.appendChild(avail); d.body.appendChild(list); d.body.appendChild(empty); d.body.appendChild(msg);
    var actions = h('div', { cls: 'vnw-dactions' }, [
      btn('Export all…', 'ghost', function () {
        var text = ctx.store.programs.exportAll();
        ctx.download('co1005-vnm-programs.json', text, 'application/json'); say('Exported ' + ctx.store.programs.count() + ' programs.');
      }),
      btn('Import…', 'ghost', function () {
        ctx.pickFile('.json,application/json,text/plain', function (text) {
          var r = ctx.store.programs.importAll(text);
          say(r.ok ? (r.message || ('Imported ' + r.added + ' programs.')) : r.error); paint(); ctx.onChanged();
        });
      }),
      btn('Close', 'primary', function () { d.close(); })
    ]);
    d.foot.insertBefore(actions, d.slot);
    var editing = null, confirming = null;
    function say(t) { msg.textContent = t; }
    // paint(focus): after the list is rebuilt, focus { id, act } (a row button) or { index } (the Load button of the row now at that position);
    // with nothing to point at, the first dialog action. A rebuilt list must never drop the keyboard focus to <body>.
    function paint(focus) {
      var progs = ctx.store.programs.list();
      clear(list);
      empty.hidden = progs.length > 0;
      avail.textContent = ctx.store.available() ? progs.length + ' of ' + ctx.Lib.PROGRAM_LIMIT + ' programs saved in this browser.' : 'Saving is disabled in this browser (private mode or blocked storage). Use Download to keep your work.';
      progs.forEach(function (p) {
        var li = h('li', { cls: 'vnw-prog' + (ctx.currentId() === p.id ? ' cur' : '') });
        var info;
        function act(label, cls, fn, name, key) { return btn(label, cls, fn, { 'aria-label': name, 'data-act': key, 'data-id': p.id }); }
        if (editing === p.id) {
          var inp = h('input', { cls: 'vnw-rename', attrs: { type: 'text', maxlength: '60', 'aria-label': 'New name for ' + p.name }, prop: { value: p.name } });
          var doRename = function () { var r = ctx.store.programs.rename(p.id, inp.value); say(r.ok ? 'Renamed.' : r.error); editing = null; paint({ id: p.id, act: 'rename' }); ctx.onChanged(); };
          inp.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); doRename(); }
            else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); editing = null; paint({ id: p.id, act: 'rename' }); }
          });
          info = h('span', { cls: 'vnw-pinfo' }, [inp]);
          li.appendChild(info);
          li.appendChild(h('span', { cls: 'vnw-pbtns' }, [btn('Save name', 'primary', doRename), btn('Cancel', 'ghost', function () { editing = null; paint({ id: p.id, act: 'rename' }); })]));
          if (!focus) setTimeout(function () { inp.focus(); inp.select(); }, 0);
        } else {
          info = h('span', { cls: 'vnw-pinfo' }, [h('span', { cls: 'vnw-pname', text: p.name }), h('span', { cls: 'vnw-pmeta', text: ctx.Lib.whenText(p.updated) + ' · ' + p.code.split('\n').length + ' lines' + (p.settings.isa === 'ext' ? ' · extended set' : '') })]);
          li.appendChild(info);
          var btns = h('span', { cls: 'vnw-pbtns' });
          btns.appendChild(act('Load', 'primary', function () { d.close(); ctx.onLoad(p); }, 'Load ' + p.name, 'load'));
          btns.appendChild(act('Rename', 'ghost', function () { editing = p.id; confirming = null; paint(); }, 'Rename ' + p.name, 'rename'));
          if (confirming === p.id) {
            btns.appendChild(act('Yes, delete', 'ghost danger', function () {
              var idx = ctx.store.programs.list().map(function (x) { return x.id; }).indexOf(p.id);
              ctx.store.programs.remove(p.id); confirming = null; say('Deleted “' + p.name + '”.'); paint({ index: idx }); ctx.onChanged();
            }, 'Confirm deleting ' + p.name, 'confirm'));
            btns.appendChild(act('Keep', 'ghost', function () { confirming = null; paint({ id: p.id, act: 'delete' }); }, 'Keep ' + p.name, 'keep'));
          } else btns.appendChild(act('Delete', 'ghost', function () { confirming = p.id; paint({ id: p.id, act: 'confirm' }); }, 'Delete ' + p.name, 'delete'));
          li.appendChild(btns);
        }
        list.appendChild(li);
      });
      if (focus) {
        var target = null, all = list.querySelectorAll('button[data-act]');
        if (focus.id !== undefined) {
          for (var i = 0; i < all.length; i++) if (all[i].getAttribute('data-id') === focus.id && all[i].getAttribute('data-act') === focus.act) target = all[i];
        } else if (focus.index !== undefined) {
          var loads = list.querySelectorAll('button[data-act="load"]');
          target = loads.length ? loads[Math.min(focus.index, loads.length - 1)] : null;
        }
        if (!target) target = actions.querySelector('button');
        if (target) target.focus();
      }
    }
    d.paint = paint; d.say = say;
    return d;
  }

  /* ───────────── Share ───────────── ctx: { makeLink() -> {ok, url, length} | {ok:false, error}, copy(text) -> Promise<bool> } */
  function shareDialog(ctx) {
    var d = makeDialog({ title: 'Share this program', cls: 'vnw-d-share', onOpen: function () { paint(); } });
    var id = nextId('vnw-share');
    var field = h('input', { cls: 'vnw-linkfield', attrs: { type: 'text', readonly: 'readonly', id: id, 'aria-label': 'Link to this program' } });
    var info = h('p', { cls: 'vnw-hint', attrs: { role: 'status', 'aria-live': 'polite' } });
    var copyBtn = btn('Copy link', 'primary', function () {
      field.focus(); field.select();
      ctx.copy(field.value).then(function (ok) { info.textContent = ok ? 'Link copied to the clipboard.' : 'Press Ctrl/Cmd+C to copy the selected link.'; });
    });
    d.body.appendChild(h('p', { text: 'Anyone who opens this link gets your code, input and machine settings. The program travels inside the link itself (nothing is uploaded).' }));
    d.body.appendChild(h('label', { cls: 'field-label', text: 'Link', attrs: { for: id } })); d.body.appendChild(field); d.body.appendChild(info);
    d.foot.insertBefore(h('div', { cls: 'vnw-dactions' }, [copyBtn, btn('Close', 'ghost', function () { d.close(); })]), d.slot);
    function paint() {
      var r = ctx.makeLink();
      copyBtn.disabled = !r.ok;
      if (!r.ok) { field.value = ''; info.textContent = r.error; return; }
      field.value = r.url; info.textContent = 'The link is ' + r.length + ' characters long.';
      setTimeout(function () { field.focus(); field.select(); }, 0);
    }
    d.paint = paint;
    return d;
  }

  global.VNWorkbenchParts = { h: h, clear: clear, btn: btn, nextId: nextId, makeSlot: makeSlot, showIn: showIn, makeDialog: makeDialog, makeTabs: makeTabs,
                              examplesBrowser: examplesBrowser, settingsDialog: settingsDialog, programsDialog: programsDialog, shareDialog: shareDialog, levelDots: levelDots, LEVEL_NAMES: LEVEL_NAMES };
})(window);
