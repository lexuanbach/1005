/* Citation flow diagrams — shared by the Chapter 13 Citation Workshop and the "Real or Hallucinated?" demo.
   Same approach as assets/vn-datapath.js: SVG blocks + links, a labelled token that travels along a link, values updated only when
   the token lands, speed slider (6 levels incl. Instant), pause / step. One colour per component (palette tokens --cmp-N in style.css):
   the block / field, its links, the token that leaves it and its legend entry share one colour; the active source and destination
   blocks get a glow and a thicker outline. Result badges stay semantic (green check, red cross, grey empty set).

   CiteFlow.Runner(opts)        -> runs a list of items one by one (play / pause / resume / step / flush / cancel)
   CiteFlow.controls(opts)      -> [Play|Pause|Resume] [Step] [Reset] + speed slider + aria-live narration line (fixed heights)
   CiteFlow.builder(container)  -> form fields -> style rules -> reference slots (driven by CiteLab.trace events)
   CiteFlow.ecosystem(container)-> essay / reference list / AI assistant / doi.org / Crossref / venue / authors blocks
   CiteFlow.scan(host)          -> 4-gram scan: a window slides along the paraphrase, matches link to the source by arcs
   CiteFlow.fmtSpans(...)       -> renders a reference with its pieces wrapped in coloured-on-demand spans (field colours)
   Theme tokens only (see cite-flow.css). prefers-reduced-motion: no moving tokens, highlights only. */
(function (global) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var SPEEDS = [
    { name: 'Very slow', ms: 2200 }, { name: 'Slow', ms: 1400 }, { name: 'Normal', ms: 800 },
    { name: 'Fast', ms: 400 }, { name: 'Very fast', ms: 150 }, { name: 'Instant', ms: 0 }
  ];
  function mk(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }
  function reduced() { try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } }
  function trunc(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, Math.max(1, n - 1)) + '…' : s; }
  function wrap(s, w, maxLines) {
    var words = String(s).split(' '), lines = [], cur = '';
    words.forEach(function (x) { if (cur && (cur + ' ' + x).length > w) { lines.push(cur); cur = x; } else cur = cur ? cur + ' ' + x : x; });
    if (cur) lines.push(cur);
    if (lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] = trunc(lines[maxLines - 1] + '…', w); }
    return lines;
  }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // ───────────── one colour per component ─────────────
  // key -> palette index (assets/style.css --cmp-1 … --cmp-11). The same table is written as .cf-c-<key> { --c: var(--cmp-N) } in
  // cite-flow.css (a Node test keeps the two in sync).
  var CMP = {
    authors: 1, year: 3, title: 5, container: 2, volume: 4, pages: 8, publisher: 11, link: 6, intext: 9, fmt: 10,   // builder: field = token = slot
    REF: 1, ESSAY: 3, AI: 5, DOI: 7, REG: 2, AUTH: 9, VEN: 11,                                                       // ecosystem blocks
    'scan-par': 1, 'scan-src': 7, 'scan-arc': 5                                                                      // paraphrase scan
  };
  function cmpVar(key) { return 'var(--cmp-' + (CMP[key] || 10) + ')'; }
  // items: [{ key, label, shape: 'out' | 'line' | 'dash' | undefined (filled), glyph, kind }] -> <ul class="cf-legend">
  function legend(items, label) {
    var ul = el('ul', 'cf-legend'), map = {};
    ul.setAttribute('aria-label', label || 'Colour legend');
    items.forEach(function (it) {
      var li = el('li', 'cf-legend-item' + (it.key ? ' cf-c-' + it.key : '')), sw = el('i', 'cf-sw' + (it.key ? ' cf-c-' + it.key : '') + (it.shape ? ' cf-sw-' + it.shape : '') + (it.kind ? ' cf-sw-glyph cf-k-' + it.kind : ''));
      sw.setAttribute('aria-hidden', 'true'); if (it.glyph) sw.textContent = it.glyph;
      li.appendChild(sw); li.appendChild(document.createTextNode(it.label)); ul.appendChild(li);
      if (it.key) map[it.key] = li;
    });
    return { el: ul, items: map };
  }
  // Like the labs' fmt() (*italic* markup -> <i>, never innerHTML), but the pieces listed in `spans` ([{field,start,end}] over the plain
  // text) are wrapped in <span class="cf-fld cf-c-FIELD" data-fld="FIELD"> so they can be coloured while an animation or a hover is active.
  function fmtSpans(node, marked, spans, expectedPlain) {
    node.textContent = '';
    var plain = '', ital = [];
    String(marked).split(/(\*[^*]+\*)/).forEach(function (p) {
      if (!p) return;
      var it = p.length > 2 && p.charAt(0) === '*' && p.charAt(p.length - 1) === '*', t = it ? p.slice(1, -1) : p;
      for (var k = 0; k < t.length; k++) ital.push(it);
      plain += t;
    });
    if (expectedPlain !== undefined && expectedPlain !== plain) spans = [];     // positions would not line up (stray asterisks): no pieces
    function emit(parent, a, b) {
      var i = a;
      while (i < b) {
        var j = i; while (j < b && ital[j] === ital[i]) j++;
        var txt = plain.slice(i, j);
        if (ital[i]) { var n = document.createElement('i'); n.textContent = txt; parent.appendChild(n); } else parent.appendChild(document.createTextNode(txt));
        i = j;
      }
    }
    var pos = 0;
    (spans || []).forEach(function (sp) {
      if (sp.start < pos || sp.end > plain.length || sp.end <= sp.start) return;
      emit(node, pos, sp.start);
      var w = el('span', 'cf-fld cf-c-' + sp.field); w.setAttribute('data-fld', sp.field); emit(w, sp.start, sp.end); node.appendChild(w);
      pos = sp.end;
    });
    emit(node, pos, plain.length);
    return node;
  }

  // ───────────── Runner ─────────────
  // opts: run(item, index, ms) -> Promise (animate one item), ms() -> ms per item, gap() -> pause between items,
  //       begin(), stop() (abort a running animation), onChange(state)
  function Runner(o) {
    var items = [], i = 0, active = false, paused = false, busy = false, gen = 0, endCb = null, timer = 0;
    function notify() { if (o.onChange) o.onChange(state()); }
    function state() { return { active: active, paused: paused, busy: busy, i: i, n: items.length }; }
    function finish() {
      active = false; busy = false; clearTimeout(timer);
      var cb = endCb; endCb = null; notify(); if (cb) cb();
    }
    function runOne() {
      busy = true; var g = gen, idx = i, done = false;
      notify();
      function after() {
        if (done) return; done = true;
        if (g !== gen) return;
        busy = false; i = idx + 1;
        if (i >= items.length) finish();
        else { notify(); if (!paused) timer = setTimeout(pump, o.gap ? o.gap() : 0); }
      }
      var res; try { res = o.run(items[idx], idx, o.ms()); } catch (e) { res = null; }
      Promise.resolve(res).then(after, after);
    }
    function pump() { if (!active || busy || paused) return; if (i >= items.length) return finish(); runOne(); }
    var api = {
      start: function (its, opts) {
        gen++; clearTimeout(timer); if (busy && o.stop) o.stop();
        items = its || []; i = 0; active = true; busy = false; endCb = (opts && opts.end) || null;
        if (opts && opts.paused !== undefined) paused = !!opts.paused;
        if (o.begin) o.begin();
        if (!items.length) { finish(); return; }
        notify(); pump();
      },
      pause: function () { paused = true; notify(); },
      resume: function () { paused = false; notify(); pump(); },
      step: function () {
        paused = true; clearTimeout(timer);
        if (active && !busy) { if (i >= items.length) finish(); else runOne(); } else notify();
      },
      flush: function () {              // skip the animation: stop the token and run the end callback now
        if (!active) return;
        gen++; clearTimeout(timer); if (o.stop) o.stop(); busy = false; finish();
      },
      cancel: function () { gen++; clearTimeout(timer); if (o.stop) o.stop(); active = false; busy = false; endCb = null; notify(); },
      state: state
    };
    return api;
  }

  // ───────────── Flights: tokens that travel along an SVG path ─────────────
  function Flights(svg) {
    var live = [];
    function fly(path, o) {
      return new Promise(function (resolve) {
        var ms = o.ms;
        if (!path || ms <= 0) { resolve(); return; }
        var rec = { end: null };
        function remove() { var k = live.indexOf(rec); if (k >= 0) live.splice(k, 1); }
        if (reduced()) {
          var tm = setTimeout(function () { remove(); resolve(); }, Math.min(ms, 300));
          rec.end = function () { clearTimeout(tm); remove(); resolve(); };
          live.push(rec); return;
        }
        var g = mk('g', { class: 'cf-token' + (o.color ? ' cf-c-' + o.color : '') }, svg), rect = mk('rect', { rx: 9, height: 20, y: -10 }, g), tx = mk('text', { 'text-anchor': 'middle', y: 4 }, g);
        function setText(s) {
          s = trunc(s || '·', 30); tx.textContent = s;
          var w = Math.max(26, s.length * 7.2 + 14); rect.setAttribute('width', w); rect.setAttribute('x', -w / 2);
        }
        setText(o.text);
        var len = path.getTotalLength(), t0 = null, raf = 0, over = false;
        function end() {
          if (over) return; over = true;
          if (raf) cancelAnimationFrame(raf);
          if (g.parentNode) g.parentNode.removeChild(g);
          remove(); resolve();
        }
        rec.end = end; live.push(rec);
        function frame(ts) {
          if (over) return;
          if (t0 === null) t0 = ts;
          var k = Math.min(1, (ts - t0) / ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
          var pt = path.getPointAtLength(o.rev ? len * (1 - e) : len * e);
          g.setAttribute('transform', 'translate(' + pt.x.toFixed(1) + ' ' + pt.y.toFixed(1) + ')');
          if (o.onFrame) o.onFrame(pt, k, setText);
          if (k < 1) raf = requestAnimationFrame(frame); else end();
        }
        var p0 = path.getPointAtLength(o.rev ? len : 0);
        g.setAttribute('transform', 'translate(' + p0.x.toFixed(1) + ' ' + p0.y.toFixed(1) + ')');
        raf = requestAnimationFrame(frame);
      });
    }
    function stop() { live.slice().forEach(function (r) { if (r.end) r.end(); }); }
    return { fly: fly, stop: stop };
  }

  // ───────────── speed slider + control row + narration ─────────────
  function speedControl(opts) {
    opts = opts || {};
    var key = opts.key || 'co1005-vn-speed', idx = opts.initial === undefined ? 2 : opts.initial;
    try { var s = localStorage.getItem(key); if (typeof s === 'string' && /^[0-9]{1,2}$/.test(s) && +s < SPEEDS.length) idx = +s; } catch (e) { /* storage unavailable */ }
    var wrapEl = el('div', 'cf-speed'), lab = el('label', 'field-label', 'Speed'), id = 'cf-speed-' + Math.floor(Math.random() * 1e6);
    lab.setAttribute('for', id);
    var rng = el('input'); rng.type = 'range'; rng.id = id; rng.min = 0; rng.max = SPEEDS.length - 1; rng.step = 1; rng.value = idx;
    var nm = el('span', 'cf-speed-name');
    wrapEl.appendChild(lab); wrapEl.appendChild(rng); wrapEl.appendChild(nm);
    function paint() { nm.textContent = SPEEDS[idx].name + (SPEEDS[idx].ms ? ' · ' + (SPEEDS[idx].ms / 1000) + ' s per ' + (opts.unit || 'hop') : ''); rng.setAttribute('aria-valuetext', SPEEDS[idx].name); }
    rng.addEventListener('input', function () { idx = +rng.value; paint(); try { localStorage.setItem(key, String(idx)); } catch (e) { /* ignore */ } });
    paint();
    return { el: wrapEl, ms: function () { return SPEEDS[idx].ms; }, gap: function () { var m = SPEEDS[idx].ms; return m ? Math.round(m * 0.35) : 0; }, index: function () { return idx; } };
  }

  // opts: unit, start(paused) -> begins a run, reset(), extra: [nodes put before the buttons]
  function controls(opts) {
    var c = { runner: null }, row = el('div', 'cf-controls'), narr = el('div', 'cf-narr');
    narr.setAttribute('role', 'status'); narr.setAttribute('aria-live', 'polite');
    (opts.extra || []).forEach(function (n) { row.appendChild(n); });
    function btn(txt, cls, label) { var b = el('button', 'btn small ' + (cls || ''), txt); b.type = 'button'; if (label) b.setAttribute('aria-label', label); return b; }
    var play = btn(opts.idleLabel || '▶ Play', 'cf-play'), step = btn('Step ▸', 'ghost', 'Step: advance one ' + (opts.unit || 'hop')), reset = btn('↺ Reset', 'ghost');
    row.appendChild(play); row.appendChild(step); row.appendChild(reset);
    var speed = speedControl({ unit: opts.unit }); row.appendChild(speed.el);
    play.addEventListener('click', function () {
      var st = c.runner.state();
      if (!st.active) opts.start(false); else if (st.paused) c.runner.resume(); else c.runner.pause();
    });
    step.addEventListener('click', function () {
      var st = c.runner.state();
      if (!st.active) { opts.start(true); c.runner.step(); } else c.runner.step();
    });
    reset.addEventListener('click', function () { c.runner.cancel(); opts.reset(); });
    c.paint = function (st) {
      play.textContent = !st.active ? (opts.idleLabel || '▶ Play') : st.paused ? '▶ Resume' : '⏸ Pause';
      play.setAttribute('aria-pressed', String(st.active && !st.paused));
    };
    // reserve the height of the tallest narration so nothing below ever moves (same idea as fixHeights() in packet-journey.js)
    var strings = [];
    function measure() {
      if (!narr.offsetWidth || !narr.parentNode || !strings.length) return;
      var probe = narr.cloneNode(false); probe.removeAttribute('role'); probe.removeAttribute('aria-live');
      probe.style.cssText = 'position:absolute;visibility:hidden;left:0;top:0;min-height:0;pointer-events:none;width:' + narr.offsetWidth + 'px';
      narr.parentNode.appendChild(probe);
      var h = 0; strings.forEach(function (t) { probe.textContent = t; h = Math.max(h, probe.offsetHeight); });
      narr.parentNode.removeChild(probe); narr.style.minHeight = h + 'px';
    }
    c.fix = function (list) { if (list) strings = list; measure(); };
    window.addEventListener('resize', measure);
    c.el = row; c.narr = narr; c.speed = speed; c.play = play; c.step = step; c.reset = reset;
    c.say = function (t) { narr.textContent = t; };
    return c;
  }

  // ───────────── 1 · Builder: form fields -> style rules -> reference slots ─────────────
  // Every field has its own colour (CMP); the field box, its wire, the token that flies and the output slot share it.
  var ROW = 28, PITCH = 32, Y0 = 46, LX = 8, RX = 558, BW = 214, FX = 300, FW = 180, LANE = 188;
  var SLOTS = ['authors', 'year', 'title', 'container', 'volume', 'pages', 'publisher', 'link', 'intext'];
  var LEFT = { authors: 'Authors', year: 'Year', title: 'Title', container: 'Container', volume: 'Vol./issue', pages: 'Pages', publisher: 'Publisher', link: 'DOI / URL', intext: 'Author+year' };
  var RIGHT = { authors: 'Author(s)', year: 'Date', title: 'Title', container: 'Container', volume: 'Vol./no.', pages: 'Pages', publisher: 'Publisher', link: 'DOI / link', intext: 'In-text' };
  function rowY(i) { return Y0 + i * PITCH; }
  function wirePath(i) { var y = rowY(i) + ROW / 2; return 'M ' + (LX + BW) + ' ' + y + ' C 262 ' + y + ', 262 ' + LANE + ', ' + FX + ' ' + LANE + ' L ' + (FX + FW) + ' ' + LANE + ' C 520 ' + LANE + ', 520 ' + y + ', ' + RX + ' ' + y; }
  function wireIn(i) { var y = rowY(i) + ROW / 2; return 'M ' + (LX + BW) + ' ' + y + ' C 262 ' + y + ', 262 ' + LANE + ', ' + FX + ' ' + LANE; }
  function wireOut(i) { var y = rowY(i) + ROW / 2; return 'M ' + (FX + FW) + ' ' + LANE + ' C 520 ' + LANE + ', 520 ' + y + ', ' + RX + ' ' + y; }
  function toLanePath(i) { var y = rowY(i) + ROW / 2; return 'M ' + (LX + BW) + ' ' + y + ' C 262 ' + y + ', 262 ' + LANE + ', ' + FX + ' ' + LANE + ' L ' + (FX + FW / 2) + ' ' + LANE; }

  // opts.hooks: { land(e) when an event's output lands in its slot, clear() when the slots are emptied / reset, hot(field|null) when the user
  // points at a field, slot or legend entry }. api.legend.el is the colour legend (the caller puts it under the diagram).
  function builder(container, opts) {
    var hooks = (opts && opts.hooks) || {};
    var svg = mk('svg', { viewBox: '0 16 780 324', class: 'cf-svg cf-b', role: 'img',
      'aria-label': 'Data flow of the reference builder: form fields on the left pass through the style rules in the middle and fill the slots of the reference list entry and the in-text citation on the right. Each field has its own colour.' }, container);
    var fmtG = mk('g', { class: 'cf-fmtg cf-c-fmt' }, svg);
    mk('rect', { x: FX, y: 40, width: FW, height: 290, rx: 12, class: 'cf-fmt' }, fmtG);
    var head = {};
    [[LX, 'Form fields'], [FX, ''], [RX, 'Reference list + in-text']].forEach(function (h, k) {
      var t = mk('text', { x: h[0] + (k === 1 ? FW / 2 : 4), y: 30, class: 'cf-colhead', 'text-anchor': k === 1 ? 'middle' : 'start' }, svg); t.textContent = h[1]; head[k] = t;
    });
    var title = mk('text', { x: FX + FW / 2, y: 58, class: 'cf-fmt-title', 'text-anchor': 'middle' }, fmtG); title.textContent = 'APA 7 formatter';
    mk('rect', { x: FX + 10, y: 68, width: FW - 20, height: 86, rx: 8, class: 'cf-rulecard' }, fmtG);
    var ruleLab = mk('text', { x: FX + 18, y: 83, class: 'cf-tiny' }, fmtG); ruleLab.textContent = 'STYLE RULE APPLIED';
    var ruleLines = [0, 1, 2].map(function (k) { return mk('text', { x: FX + 18, y: 101 + k * 15, class: 'cf-rule' }, fmtG); });
    var inLab = mk('text', { x: FX + 14, y: 214, class: 'cf-tiny' }, fmtG); inLab.textContent = 'IN';
    var inVal = mk('text', { x: FX + 14, y: 230, class: 'cf-io' }, fmtG);
    var outLab = mk('text', { x: FX + 14, y: 256, class: 'cf-tiny' }, fmtG); outLab.textContent = 'OUT';
    var outVal = mk('text', { x: FX + 14, y: 272, class: 'cf-io' }, fmtG);
    var lane = mk('path', { d: 'M ' + FX + ' ' + LANE + ' L ' + (FX + FW) + ' ' + LANE, class: 'cf-lane' }, svg);   // lit in the field's colour while its token is inside the formatter
    var gWires = mk('g', {}, svg), wires = [], left = [], right = [], lv = [], rv = [];
    SLOTS.forEach(function (s, i) {
      wires.push([mk('path', { d: wireIn(i), class: 'cf-wire cf-c-' + s, 'data-slot': s }, gWires), mk('path', { d: wireOut(i), class: 'cf-wire cf-c-' + s, 'data-slot': s }, gWires)]);
    });
    SLOTS.forEach(function (s, i) {
      [[LX, left, lv, LEFT], [RX, right, rv, RIGHT]].forEach(function (side, sd) {
        var g = mk('g', { class: 'cf-node cf-n-' + (sd ? 'out' : 'in') + ' cf-c-' + s, 'data-slot': s }, svg);
        mk('rect', { x: side[0], y: rowY(i), width: BW, height: ROW, rx: 7 }, g);
        var nm = mk('text', { x: side[0] + 8, y: rowY(i) + 18, class: 'cf-name' }, g); nm.textContent = side[3][s];
        var v = mk('text', { x: side[0] + 78, y: rowY(i) + 18, class: 'cf-val' }, g);
        side[1].push(g); side[2].push(v);
      });
    });
    var leg = legend(SLOTS.map(function (s) { return { key: s, label: RIGHT[s] }; }).concat([{ key: 'fmt', label: 'Style rules (formatter)' }]), 'Colour legend: one colour per field');
    var fl = Flights(svg), ev = null, idxOf = {}, marked = [], gen = 0;
    SLOTS.forEach(function (s, i) { idxOf[s] = i; });

    function setIn(i, text) { lv[i].textContent = trunc(text, 19); }
    function setOut(i, text, italic) { rv[i].textContent = trunc(text, 19); rv[i].setAttribute('class', 'cf-val' + (italic ? ' cf-it' : '')); }
    function ruleText(lines) { ruleLines.forEach(function (t, k) { t.textContent = lines[k] || ''; }); }
    function unmark() {
      marked.forEach(function (n) { n.classList.remove('cf-src', 'cf-dst', 'cf-busy'); }); marked = [];
      wires.forEach(function (w) { w[0].classList.remove('on'); w[1].classList.remove('on'); });
      lane.setAttribute('class', 'cf-lane');
    }
    function mark(n, c) { n.classList.add(c); marked.push(n); }
    function hover(slot) {          // visual only: the field, its slot, its wire and its legend entry stand out
      SLOTS.forEach(function (s, i) {
        var on = s === slot;
        left[i].classList.toggle('cf-hover', on); right[i].classList.toggle('cf-hover', on);
        wires[i][0].classList.toggle('cf-hover', on); wires[i][1].classList.toggle('cf-hover', on);
        if (leg.items[s]) leg.items[s].classList.toggle('cf-hover', on);
      });
    }
    function point(slot) { hover(slot); if (hooks.hot) hooks.hot(slot); }
    SLOTS.forEach(function (s, i) {
      [left[i], right[i]].forEach(function (n) { n.addEventListener('mouseenter', function () { point(s); }); n.addEventListener('mouseleave', function () { point(null); }); });
      var li = leg.items[s];
      li.tabIndex = 0;      // keyboard focus lights the field's pieces just like hovering does
      li.addEventListener('mouseenter', function () { point(s); }); li.addEventListener('mouseleave', function () { point(null); });
      li.addEventListener('focus', function () { point(s); }); li.addEventListener('blur', function () { point(null); });
    });
    function cleared() { if (hooks.clear) hooks.clear(); }

    var api = {
      svg: svg, legend: leg, hover: hover,
      // tr = CiteLab.trace(...). Fills the left column with the inputs and dims the unused rows.
      configure: function (tr, label) {
        ev = tr; gen++; fl.stop(); unmark(); cleared();
        title.textContent = label + ' formatter';
        var used = {};
        tr.events.forEach(function (e) { used[e.slot] = e; });
        SLOTS.forEach(function (s, i) {
          setIn(i, used[s] ? used[s].input : '');
          left[i].classList.toggle('cf-off', !used[s]); right[i].classList.toggle('cf-off', !used[s]);
          wires[i][0].classList.toggle('cf-off', !used[s]); wires[i][1].classList.toggle('cf-off', !used[s]);
          leg.items[s].classList.toggle('cf-off', !used[s]);
        });
        ruleText([]); inVal.textContent = ''; outVal.textContent = '';
        head[1].textContent = tr.noReference ? 'no reference format' : '';
      },
      clear: function () {
        gen++; fl.stop(); unmark(); cleared(); ruleText([]); inVal.textContent = ''; outVal.textContent = '';
        SLOTS.forEach(function (s, i) { setOut(i, '', false); });
      },
      showAll: function () {
        gen++; fl.stop(); unmark(); cleared(); ruleText(['Press Play or Step', 'to see which rule', 'shaped each field.']); inVal.textContent = ''; outVal.textContent = '';
        SLOTS.forEach(function (s, i) { setOut(i, '', false); });
        if (ev) ev.events.forEach(function (e) { setOut(idxOf[e.slot], e.dropped ? 'left out' : e.out, e.italic); });
      },
      // one event: input token -> formatter (rule badge) -> slot; the token wears the field's colour all the way
      run: function (e, ms) {
        unmark();
        var i = idxOf[e.slot], g = gen;
        function landed() {
          mark(right[i], 'cf-dst'); mark(el_fmt, 'cf-busy');
          outVal.textContent = trunc(e.dropped ? '(left out)' : e.out, 22); setOut(i, e.dropped ? 'left out' : e.out, e.italic);
          if (hooks.land) hooks.land(e);
        }
        mark(left[i], 'cf-src'); wires[i][0].classList.add('on'); lane.setAttribute('class', 'cf-lane on cf-c-' + e.slot);
        if (!e.dropped) wires[i][1].classList.add('on');
        ruleText(wrap(e.ruleName, 20, 3)); inVal.textContent = trunc(e.input, 22); outVal.textContent = '';
        if (ms <= 0) { landed(); return Promise.resolve(); }
        var d = e.dropped ? toLanePath(i) : wirePath(i), tmp = mk('path', { d: d, fill: 'none', stroke: 'none' }, svg);
        var swapped = false;
        return fl.fly(tmp, {
          ms: e.dropped ? ms * 0.6 : ms, text: e.input, color: e.slot,
          onFrame: function (pt, k, setText) {
            if (pt.x >= FX && pt.x <= FX + FW) mark(el_fmt, 'cf-busy');
            if (!swapped && pt.x >= FX + FW / 2) { swapped = true; setText(e.dropped ? '✕' : e.out); outVal.textContent = trunc(e.dropped ? '(left out)' : e.out, 22); }
          }
        }).then(function () {
          if (tmp.parentNode) tmp.parentNode.removeChild(tmp);
          if (g !== gen) return;
          landed();
        });
      },
      stop: function () { gen++; fl.stop(); },
      narration: function (e, style) {
        var from = LEFT[e.slot], what = e.dropped ? 'is left out' : 'becomes “' + trunc(e.out, 70) + '”';
        return from + ' “' + trunc(e.input, 60) + '” goes through the ' + style + ' rule “' + e.ruleName + '” and ' + what + (e.dropped ? ' (' + (e.why || 'this style') + ').' : '.');
      }
    };
    var el_fmt = svg.querySelector('.cf-fmt');
    api.unmark = unmark;
    return api;
  }

  // ───────────── 2 · Ecosystem: essay / reference / AI / doi.org / Crossref / venue / authors ─────────────
  // Each block has its own colour (CMP). A lookup token wears the colour of the block it leaves; on the way back it wears the colour of the
  // block that answered. The links are drawn as a gradient between the colours of the two blocks they join.
  var ECO_NODES = {
    AI: [20, 118, 150, 64, 'AI assistant', 'writes references'],
    ESSAY: [215, 20, 150, 64, 'Your essay', 'in-text citation'],
    REF: [215, 118, 150, 64, 'Reference list', 'entry on the card'],
    DOI: [410, 20, 150, 64, 'doi.org + publisher', 'landing page'],
    REG: [410, 118, 150, 64, 'Crossref', 'metadata registry'],
    AUTH: [605, 20, 150, 64, 'Author list', 'in the record'],
    VEN: [605, 118, 150, 64, 'Journal / venue', 'vol., issue, year']
  };
  var ECO_EDGES = { 'AI-ESSAY': 1, 'AI-REF': 1, 'ESSAY-REF': 1, 'REF-DOI': 1, 'REF-REG': 1, 'DOI-REG': 1, 'AUTH-REG': 1, 'REG-VEN': 1, 'AI-REG': 1 };
  var ECO_CUSTOM = { 'AI-REG': { d: 'M 95 182 L 95 216 L 485 216 L 485 182', s: [485, 216], e: [95, 216] } };   // gradient runs REG -> AI along the bottom
  function ecoCenter(id) { var b = ECO_NODES[id]; return [b[0] + b[2] / 2, b[1] + b[3] / 2]; }
  function ecoClip(id, p, dx, dy, margin) {
    var b = ECO_NODES[id], c = ecoCenter(id), hw = b[2] / 2 + margin, hh = b[3] / 2 + margin, t = Infinity, ox = p[0] - c[0], oy = p[1] - c[1];
    if (dx > 1e-9) t = Math.min(t, (hw - ox) / dx); else if (dx < -1e-9) t = Math.min(t, (-hw - ox) / dx);
    if (dy > 1e-9) t = Math.min(t, (hh - oy) / dy); else if (dy < -1e-9) t = Math.min(t, (-hh - oy) / dy);
    return [p[0] + dx * t, p[1] + dy * t];
  }
  function ecoStraight(a, b) {
    var ca = ecoCenter(a), cb = ecoCenter(b), dx = cb[0] - ca[0], dy = cb[1] - ca[1], len = Math.sqrt(dx * dx + dy * dy); dx /= len; dy /= len;
    var s = ecoClip(a, ca, dx, dy, 2), e = ecoClip(b, cb, -dx, -dy, 3);
    return { d: 'M ' + s[0].toFixed(1) + ' ' + s[1].toFixed(1) + ' L ' + e[0].toFixed(1) + ' ' + e[1].toFixed(1), s: s, e: e };
  }
  var ecoUid = 0;

  function ecosystem(container) {
    var svg = mk('svg', { viewBox: '0 6 780 224', class: 'cf-svg cf-e', role: 'img',
      'aria-label': 'The scholarly-citation ecosystem: the AI assistant writes the in-text citation in your essay and the entry in the reference list; checks go to doi.org and the publisher page, the Crossref registry, the journal record and the author list. Each block has its own colour.' }, container);
    var uid = 'cf-g' + (++ecoUid) + '-';
    var defs = mk('defs', {}, svg);
    var edgeEls = {}, nodeEls = {}, valEls = {}, glyphEls = {}, marked = [], hotEls = {};
    Object.keys(ECO_EDGES).forEach(function (k) {
      var p = k.split('-'), geo = ECO_CUSTOM[k] || ecoStraight(p[0], p[1]);
      var gr = mk('linearGradient', { id: uid + k, gradientUnits: 'userSpaceOnUse', x1: geo.s[0].toFixed(1), y1: geo.s[1].toFixed(1), x2: geo.e[0].toFixed(1), y2: geo.e[1].toFixed(1) }, defs);
      mk('stop', { offset: '0', class: 'cf-gs cf-c-' + p[0] }, gr); mk('stop', { offset: '1', class: 'cf-gs cf-c-' + p[1] }, gr);
      var edge = mk('path', { d: geo.d, class: 'cf-edge' + (k === 'AI-REG' ? ' cf-prov' : ''), 'data-edge': k }, svg);
      edge.style.stroke = 'url(#' + uid + k + ')';
      edgeEls[k] = edge;
    });
    var provT = mk('text', { x: 290, y: 209, class: 'cf-tiny', 'text-anchor': 'middle' }, svg); provT.textContent = 'provenance: where did this reference come from?';
    Object.keys(ECO_NODES).forEach(function (id) {
      var b = ECO_NODES[id], g = mk('g', { class: 'cf-node cf-n-' + id + ' cf-c-' + id, 'data-node': id }, svg);
      hotEls[id] = mk('rect', { x: b[0] - 5, y: b[1] - 5, width: b[2] + 10, height: b[3] + 10, rx: 13, class: 'cf-ring' }, g);   // red dashed ring: "the hallucination starts here"
      mk('rect', { x: b[0], y: b[1], width: b[2], height: b[3], rx: 10, class: 'cf-rect' }, g);
      var n = mk('text', { x: b[0] + b[2] / 2, y: b[1] + 20, class: 'cf-ename', 'text-anchor': 'middle' }, g); n.textContent = b[4];
      var s = mk('text', { x: b[0] + b[2] / 2, y: b[1] + 35, class: 'cf-esub', 'text-anchor': 'middle' }, g); s.textContent = b[5];
      valEls[id] = mk('text', { x: b[0] + b[2] / 2, y: b[1] + 54, class: 'cf-val', 'text-anchor': 'middle' }, g);
      var gl = mk('g', { class: 'cf-glyph', visibility: 'hidden' }, g);
      mk('circle', { cx: b[0] + b[2] - 6, cy: b[1] + 6, r: 11 }, gl);
      var gt = mk('text', { x: b[0] + b[2] - 6, y: b[1] + 11, 'text-anchor': 'middle' }, gl);
      glyphEls[id] = { g: gl, t: gt };
      nodeEls[id] = g;
    });
    var leg = legend(Object.keys(ECO_NODES).map(function (id) { return { key: id, label: ECO_NODES[id][4] }; }).concat([
      { glyph: '✓', kind: 'ok', label: 'match' }, { glyph: '✗', kind: 'bad', label: 'mismatch' }, { glyph: '∅', kind: 'none', label: 'not found / no record' }]),
      'Colour legend: one colour per block; result badges are green, red and grey');
    Object.keys(ECO_NODES).forEach(function (id) {
      var li = leg.items[id];
      function on(v) { nodeEls[id].classList.toggle('cf-hover', v); li.classList.toggle('cf-hover', v); }
      nodeEls[id].addEventListener('mouseenter', function () { on(true); }); nodeEls[id].addEventListener('mouseleave', function () { on(false); });
      li.tabIndex = 0; li.addEventListener('mouseenter', function () { on(true); }); li.addEventListener('mouseleave', function () { on(false); });
      li.addEventListener('focus', function () { on(true); }); li.addEventListener('blur', function () { on(false); });
    });
    var fl = Flights(svg);
    function edgeFor(a, b) { var k = a + '-' + b, r = b + '-' + a; if (edgeEls[k]) return { el: edgeEls[k], rev: false }; if (edgeEls[r]) return { el: edgeEls[r], rev: true }; return null; }
    function unmark() {
      marked.forEach(function (n) { n.classList.remove('cf-src', 'cf-dst'); }); marked = [];
      Object.keys(edgeEls).forEach(function (k) { edgeEls[k].classList.remove('on'); edgeEls[k].style.removeProperty('--c'); });
    }
    function mark(id, c) { var n = nodeEls[id]; if (n) { n.classList.add(c); marked.push(n); } }

    return {
      svg: svg, legend: leg,
      // one hop: a labelled token travels from block `from` to block `to`; it wears hop.color (default: the colour of `from`)
      leg: function (hop, ms) {
        var e = edgeFor(hop.from, hop.to), color = hop.color || hop.from;
        mark(hop.from, 'cf-src'); mark(hop.to, 'cf-dst');
        if (!e) return Promise.resolve();
        e.el.classList.add('on'); e.el.style.setProperty('--c', cmpVar(color));
        if (ms <= 0) return Promise.resolve();
        return fl.fly(e.el, { ms: ms, text: hop.text, rev: e.rev, color: color });
      },
      endStage: unmark,
      // result badge: always semantic (kind ok = green check, bad = red cross, none = grey empty set)
      mark: function (id, kind, glyph) {
        var gl = glyphEls[id]; if (!gl) return;
        gl.g.setAttribute('visibility', kind ? 'visible' : 'hidden');
        gl.g.setAttribute('class', 'cf-glyph' + (kind ? ' cf-g-' + kind : ''));
        gl.t.textContent = glyph || '';
      },
      setVal: function (id, text) { if (valEls[id]) valEls[id].textContent = trunc(text, 20); },
      glow: function (id, on) { if (nodeEls[id]) nodeEls[id].classList.toggle('cf-hot', !!on); },
      reset: function () {
        fl.stop(); unmark();
        Object.keys(ECO_NODES).forEach(function (id) { glyphEls[id].g.setAttribute('visibility', 'hidden'); nodeEls[id].classList.remove('cf-hot'); valEls[id].textContent = ''; });
      },
      stop: function () { fl.stop(); }
    };
  }

  // ───────────── 3 · Paraphrase scan ─────────────
  // Three colours: your sentence (blue), the source (orange) and the match arcs (violet). The sliding window is an outlined box; words that
  // already matched are filled and underlined; a window found only inside quotation marks gets a dashed outline.
  function scan(host, onFinish) {
    var CL = global.CiteLab, N = 4;
    var wrapEl = el('div', 'cf-scan');
    var body = el('div', 'cf-scan-body');
    var arcs = mk('svg', { class: 'cf-arcs', 'aria-hidden': 'true' }), arcG = mk('g', { class: 'cf-c-scan-arc' }, arcs);
    var srcLab = el('span', 'cl-tag', 'Source — the window looks for each 4-word stretch here'), srcP = el('p', 'cf-words cf-c-scan-src');
    var parLab = el('span', 'cl-tag', 'Your sentence — a 4-word window slides along it'), parP = el('p', 'cf-words cf-c-scan-par');
    body.appendChild(arcs); body.appendChild(srcLab); body.appendChild(srcP); body.appendChild(el('div', 'cf-scan-gap')); body.appendChild(parP); body.appendChild(parLab);
    var ctl = controls({ unit: 'window', start: function (paused) { startRun(paused); }, reset: function () { showFinal(); } });
    var runner = Runner({
      run: function (st, k, ms) { return doStep(st, ms); },
      ms: function () { return ctl.speed.ms(); }, gap: function () { return 0; },
      onChange: function (s) { ctl.paint(s); }, stop: function () { /* steps are timeouts; nothing to abort */ },
      begin: function () { prev = null; clearMarksKeepWords(); }   // wipe the finished picture before the scan starts
    });
    ctl.runner = runner;
    var leg = legend([
      { key: 'scan-par', label: 'Your sentence: the sliding window', shape: 'out' }, { key: 'scan-par', label: 'your words that matched' },
      { key: 'scan-src', label: 'Source: where the window was found', shape: 'out' }, { key: 'scan-src', label: 'source words that matched' },
      { key: 'scan-arc', label: 'match link (arc)', shape: 'line' }, { label: 'dashed window: found only inside quotation marks, not counted', shape: 'dash' }], 'Colour legend for the scan');
    wrapEl.appendChild(ctl.el); wrapEl.appendChild(ctl.narr); wrapEl.appendChild(body); wrapEl.appendChild(leg.el); host.appendChild(wrapEl);

    var S = [], P = [], sW = [], pW = [], steps = [], links = [], text = { src: '', par: '' }, result = null;
    function words(p, toks) {
      p.textContent = '';
      return toks.map(function (t) { var s = el('span', 'cf-w' + (t.quoted ? ' cf-q' : ''), t.raw); p.appendChild(s); p.appendChild(document.createTextNode(' ')); return s; });
    }
    function center(s, top) {
      var b = body.getBoundingClientRect(), r = s.getBoundingClientRect();
      return [r.left - b.left + r.width / 2, (top ? r.top : r.bottom) - b.top];
    }
    function drawArcs(animate) {
      while (arcG.firstChild) arcG.removeChild(arcG.firstChild);
      var b = body.getBoundingClientRect();
      arcs.setAttribute('width', b.width); arcs.setAttribute('height', b.height); arcs.setAttribute('viewBox', '0 0 ' + b.width + ' ' + b.height);
      links.forEach(function (l, idx) {
        var a = center(pW[l.pi], true), z = center(sW[l.si], false);
        if (!b.width) return;
        var my = (a[1] + z[1]) / 2;
        var p = mk('path', { d: 'M ' + a[0].toFixed(1) + ' ' + (a[1] - 1).toFixed(1) + ' C ' + a[0].toFixed(1) + ' ' + my.toFixed(1) + ', ' + z[0].toFixed(1) + ' ' + my.toFixed(1) + ', ' + z[0].toFixed(1) + ' ' + (z[1] + 1).toFixed(1), class: 'cf-arc' + (animate && idx === links.length - 1 && !reduced() ? ' cf-arc-new' : '') }, arcG);
        p.style.setProperty('--cf-arc-i', String(idx % 6));
      });
    }
    function setTexts(src, par) {
      runner.cancel();
      text = { src: src, par: par };
      S = CL.tokenize(src); P = CL.tokenize(par);
      sW = words(srcP, S); pW = words(parP, P);
      steps = CL.scanSteps(src, par, N); result = CL.overlap(src, par, N);
      showFinal();
      ctl.fix(steps.map(stepMsg).concat(['Scan finished: ' + summary(), readyMsg()]));
    }
    function readyMsg() { return steps.length ? 'Ready. Press Play (or Step) to watch a ' + N + '-word window slide along your sentence. Finished picture shown now: ' + summary() : 'Your sentence needs at least ' + N + ' words for a ' + N + '-word window.'; }
    function showFinal() {
      clearMarksKeepWords();
      steps.forEach(function (st) { if (st.match) { mark(st); links.push({ pi: st.i, si: st.srcIndex }); } });
      drawArcs();
      ctl.say(readyMsg());
    }
    function mark(st) { for (var j = 0; j < N; j++) { pW[st.i + j].classList.add('cf-hit'); sW[st.srcIndex + j].classList.add('cf-hit'); } }
    function summary() {
      if (!result || result.verdict === 'empty') return 'no unquoted words.';
      var n = steps.filter(function (s) { return s.match; }).length;
      return n + ' window' + (n === 1 ? '' : 's') + ' matched; ' + result.copied + ' of your ' + result.words + ' words sit in copied stretches (' + Math.round(result.ratio * 100) + '%); longest copied run ' + result.longest + ' words.';
    }
    function stepMsg(st) {
      var phrase = '“' + st.gram + '”', head = 'Window ' + (st.i + 1) + ' of ' + steps.length + ': ' + phrase;
      if (st.match) return head + ' is also in the source. Match — linked by an arc.';
      if (st.found) return head + ' is in the source, but you put it in quotation marks, so it is not counted as copied.';
      return head + ' does not appear in the source. No match.';
    }
    function startRun(paused) {
      var list = steps.slice();
      runner.start(list, { paused: paused, end: function () { ctl.say('Scan finished: ' + summary()); if (onFinish) onFinish(); } });
    }
    function lit(st, on) {
      for (var j = 0; j < N; j++) {
        pW[st.i + j].classList.toggle('cf-win', on); pW[st.i + j].classList.toggle('cf-win-q', on && st.quoted);
        if (st.found) { sW[st.srcIndex + j].classList.toggle('cf-win', on); sW[st.srcIndex + j].classList.toggle('cf-win-q', on && st.quoted); }
      }
    }
    var prev = null;
    function doStep(st, ms) {
      if (prev) lit(prev, false);
      lit(st, true); prev = st;
      if (st.match) { mark(st); links.push({ pi: st.i, si: st.srcIndex }); drawArcs(true); }
      ctl.say(stepMsg(st));
      var last = st.i === steps.length - 1;
      return wait(ms <= 0 ? 0 : Math.max(60, ms * 0.55)).then(function () { if (last) { lit(st, false); prev = null; } });
    }
    function clearMarksKeepWords() { sW.concat(pW).forEach(function (s) { s.classList.remove('cf-hit', 'cf-win', 'cf-win-q'); }); links = []; drawArcs(); }

    window.addEventListener('resize', function () { drawArcs(); });
    return { setTexts: setTexts, relayout: function () { drawArcs(); ctl.fix(); }, runner: runner, el: wrapEl, legend: leg };
  }

  var api = { CMP: CMP, cmpVar: cmpVar, legend: legend, fmtSpans: fmtSpans, ECO_EDGES: ECO_EDGES, ECO_NODES: ECO_NODES, Runner: Runner, Flights: Flights, controls: controls, speedControl: speedControl, builder: builder, ecosystem: ecosystem, scan: scan, SPEEDS: SPEEDS, SLOTS: SLOTS, trunc: trunc, wrap: wrap };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.CiteFlow = api;
})(typeof window !== 'undefined' ? window : this);
