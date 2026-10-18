/* Citation flow diagrams — shared by the Chapter 13 Citation Workshop and the "Real or Hallucinated?" demo.
   Same approach as assets/vn-datapath.js: SVG blocks + links, a labelled token that travels along a link, the source block amber
   and the destination block teal, values updated only when the token lands, speed slider (6 levels incl. Instant), pause / step.

   CiteFlow.Runner(opts)        -> runs a list of items one by one (play / pause / resume / step / flush / cancel)
   CiteFlow.controls(opts)      -> [Play|Pause|Resume] [Step] [Reset] + speed slider + aria-live narration line (fixed heights)
   CiteFlow.builder(container)  -> form fields -> style rules -> reference slots (driven by CiteLab.trace events)
   CiteFlow.ecosystem(container)-> essay / reference list / AI assistant / doi.org / Crossref / venue / authors blocks
   CiteFlow.scan(host)          -> 4-gram scan: a window slides along the paraphrase, matches link to the source by arcs
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
        var g = mk('g', { class: 'cf-token' }, svg), rect = mk('rect', { rx: 9, height: 20, y: -10 }, g), tx = mk('text', { 'text-anchor': 'middle', y: 4 }, g);
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
    try { var s = localStorage.getItem(key); if (s !== null && !isNaN(+s) && +s >= 0 && +s < SPEEDS.length) idx = +s; } catch (e) { /* storage unavailable */ }
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
  var ROW = 28, PITCH = 32, Y0 = 46, LX = 8, RX = 558, BW = 214, FX = 300, FW = 180, LANE = 188;
  var SLOTS = ['authors', 'year', 'title', 'container', 'volume', 'pages', 'publisher', 'link', 'intext'];
  var LEFT = { authors: 'Authors', year: 'Year', title: 'Title', container: 'Container', volume: 'Vol./issue', pages: 'Pages', publisher: 'Publisher', link: 'DOI / URL', intext: 'Author+year' };
  var RIGHT = { authors: 'Author(s)', year: 'Date', title: 'Title', container: 'Container', volume: 'Vol./no.', pages: 'Pages', publisher: 'Publisher', link: 'DOI / link', intext: 'In-text' };
  function rowY(i) { return Y0 + i * PITCH; }
  function wirePath(i) { var y = rowY(i) + ROW / 2; return 'M ' + (LX + BW) + ' ' + y + ' C 262 ' + y + ', 262 ' + LANE + ', ' + FX + ' ' + LANE + ' L ' + (FX + FW) + ' ' + LANE + ' C 520 ' + LANE + ', 520 ' + y + ', ' + RX + ' ' + y; }
  function toLanePath(i) { var y = rowY(i) + ROW / 2; return 'M ' + (LX + BW) + ' ' + y + ' C 262 ' + y + ', 262 ' + LANE + ', ' + FX + ' ' + LANE + ' L ' + (FX + FW / 2) + ' ' + LANE; }

  function builder(container) {
    var svg = mk('svg', { viewBox: '0 16 780 324', class: 'cf-svg cf-b', role: 'img',
      'aria-label': 'Data flow of the reference builder: form fields on the left pass through the style rules in the middle and fill the slots of the reference list entry and the in-text citation on the right' }, container);
    mk('rect', { x: FX, y: 40, width: FW, height: 290, rx: 12, class: 'cf-fmt' }, svg);
    var head = {};
    [[LX, 'Form fields'], [FX, ''], [RX, 'Reference list + in-text']].forEach(function (h, k) {
      var t = mk('text', { x: h[0] + (k === 1 ? FW / 2 : 4), y: 30, class: 'cf-colhead', 'text-anchor': k === 1 ? 'middle' : 'start' }, svg); t.textContent = h[1]; head[k] = t;
    });
    var title = mk('text', { x: FX + FW / 2, y: 58, class: 'cf-fmt-title', 'text-anchor': 'middle' }, svg); title.textContent = 'APA 7 formatter';
    mk('rect', { x: FX + 10, y: 68, width: FW - 20, height: 86, rx: 8, class: 'cf-rulecard' }, svg);
    var ruleLab = mk('text', { x: FX + 18, y: 83, class: 'cf-tiny' }, svg); ruleLab.textContent = 'STYLE RULE APPLIED';
    var ruleLines = [0, 1, 2].map(function (k) { return mk('text', { x: FX + 18, y: 101 + k * 15, class: 'cf-rule' }, svg); });
    var inLab = mk('text', { x: FX + 14, y: 214, class: 'cf-tiny' }, svg); inLab.textContent = 'IN';
    var inVal = mk('text', { x: FX + 14, y: 230, class: 'cf-io' }, svg);
    var outLab = mk('text', { x: FX + 14, y: 256, class: 'cf-tiny' }, svg); outLab.textContent = 'OUT';
    var outVal = mk('text', { x: FX + 14, y: 272, class: 'cf-io' }, svg);
    var gWires = mk('g', {}, svg), wires = [], left = [], right = [], lv = [], rv = [];
    SLOTS.forEach(function (s, i) {
      wires.push(mk('path', { d: wirePath(i), class: 'cf-wire', 'data-slot': s }, gWires));
    });
    SLOTS.forEach(function (s, i) {
      [[LX, left, lv, LEFT], [RX, right, rv, RIGHT]].forEach(function (side, sd) {
        var g = mk('g', { class: 'cf-node cf-n-' + (sd ? 'out' : 'in'), 'data-slot': s }, svg);
        mk('rect', { x: side[0], y: rowY(i), width: BW, height: ROW, rx: 7 }, g);
        var nm = mk('text', { x: side[0] + 8, y: rowY(i) + 18, class: 'cf-name' }, g); nm.textContent = side[3][s];
        var v = mk('text', { x: side[0] + 78, y: rowY(i) + 18, class: 'cf-val' }, g);
        side[1].push(g); side[2].push(v);
      });
    });
    var fl = Flights(svg), ev = null, idxOf = {}, marked = [], gen = 0;
    SLOTS.forEach(function (s, i) { idxOf[s] = i; });

    function setIn(i, text, italic) { lv[i].textContent = trunc(text, 20); }
    function setOut(i, text, italic) { rv[i].textContent = trunc(text, 20); rv[i].setAttribute('class', 'cf-val' + (italic ? ' cf-it' : '')); }
    function ruleText(lines) { ruleLines.forEach(function (t, k) { t.textContent = lines[k] || ''; }); }
    function unmark() { marked.forEach(function (n) { n.classList.remove('cf-src', 'cf-dst', 'cf-busy'); }); marked = []; wires.forEach(function (w) { w.classList.remove('on'); }); }
    function mark(n, c) { n.classList.add(c); marked.push(n); }

    var api = {
      svg: svg,
      // tr = CiteLab.trace(...). Fills the left column with the inputs and dims the unused rows.
      configure: function (tr, label) {
        ev = tr; gen++; fl.stop(); unmark();
        title.textContent = label + ' formatter';
        var used = {};
        tr.events.forEach(function (e) { used[e.slot] = e; });
        SLOTS.forEach(function (s, i) {
          setIn(i, used[s] ? used[s].input : '', false);
          left[i].classList.toggle('cf-off', !used[s]); right[i].classList.toggle('cf-off', !used[s]); wires[i].classList.toggle('cf-off', !used[s]);
        });
        ruleText([]); inVal.textContent = ''; outVal.textContent = '';
        head[1].textContent = tr.noReference ? 'no reference format' : '';
      },
      clear: function () {
        gen++; fl.stop(); unmark(); ruleText([]); inVal.textContent = ''; outVal.textContent = '';
        SLOTS.forEach(function (s, i) { setOut(i, '', false); });
      },
      showAll: function () {
        gen++; fl.stop(); unmark(); ruleText(['Press Play or Step', 'to see which rule', 'shaped each field.']); inVal.textContent = ''; outVal.textContent = '';
        SLOTS.forEach(function (s, i) { setOut(i, '', false); });
        if (ev) ev.events.forEach(function (e) { setOut(idxOf[e.slot], e.dropped ? 'left out' : e.out, e.italic); });
      },
      // one event: input token -> formatter (rule badge) -> slot
      run: function (e, ms) {
        unmark();
        var i = idxOf[e.slot], g = gen;
        mark(left[i], 'cf-src'); wires[i].classList.add('on');
        ruleText(wrap(e.ruleName, 20, 3)); inVal.textContent = trunc(e.input, 26); outVal.textContent = '';
        if (ms <= 0) {
          mark(right[i], 'cf-dst'); mark(el_fmt, 'cf-busy');
          outVal.textContent = trunc(e.dropped ? '(left out)' : e.out, 26); setOut(i, e.dropped ? 'left out' : e.out, e.italic);
          return Promise.resolve();
        }
        var d = e.dropped ? toLanePath(i) : wirePath(i), tmp = mk('path', { d: d, fill: 'none', stroke: 'none' }, svg);
        var swapped = false;
        return fl.fly(tmp, {
          ms: e.dropped ? ms * 0.6 : ms, text: e.input,
          onFrame: function (pt, k, setText) {
            if (pt.x >= FX && pt.x <= FX + FW) mark(el_fmt, 'cf-busy');
            if (!swapped && pt.x >= FX + FW / 2) { swapped = true; setText(e.dropped ? '✕' : e.out); outVal.textContent = trunc(e.dropped ? '(left out)' : e.out, 26); }
          }
        }).then(function () {
          if (tmp.parentNode) tmp.parentNode.removeChild(tmp);
          if (g !== gen) return;
          mark(right[i], 'cf-dst'); mark(el_fmt, 'cf-busy');
          outVal.textContent = trunc(e.dropped ? '(left out)' : e.out, 26); setOut(i, e.dropped ? 'left out' : e.out, e.italic);
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
  var ECO_CUSTOM = { 'AI-REG': 'M 95 182 L 95 216 L 485 216 L 485 182' };
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
    return 'M ' + s[0].toFixed(1) + ' ' + s[1].toFixed(1) + ' L ' + e[0].toFixed(1) + ' ' + e[1].toFixed(1);
  }

  function ecosystem(container) {
    var svg = mk('svg', { viewBox: '0 6 780 224', class: 'cf-svg cf-e', role: 'img',
      'aria-label': 'The scholarly-citation ecosystem: the AI assistant writes the in-text citation in your essay and the entry in the reference list; checks go to doi.org and the publisher page, the Crossref registry, the journal record and the author list' }, container);
    var edgeEls = {}, nodeEls = {}, valEls = {}, glyphEls = {}, marked = [];
    Object.keys(ECO_EDGES).forEach(function (k) {
      var p = k.split('-');
      edgeEls[k] = mk('path', { d: ECO_CUSTOM[k] || ecoStraight(p[0], p[1]), class: 'cf-edge' + (k === 'AI-REG' ? ' cf-prov' : ''), 'data-edge': k }, svg);
    });
    var provT = mk('text', { x: 290, y: 209, class: 'cf-tiny', 'text-anchor': 'middle' }, svg); provT.textContent = 'provenance: where did this reference come from?';
    Object.keys(ECO_NODES).forEach(function (id) {
      var b = ECO_NODES[id], g = mk('g', { class: 'cf-node cf-n-' + id, 'data-node': id }, svg);
      mk('rect', { x: b[0], y: b[1], width: b[2], height: b[3], rx: 10 }, g);
      var n = mk('text', { x: b[0] + b[2] / 2, y: b[1] + 20, class: 'cf-ename', 'text-anchor': 'middle' }, g); n.textContent = b[4];
      var s = mk('text', { x: b[0] + b[2] / 2, y: b[1] + 35, class: 'cf-esub', 'text-anchor': 'middle' }, g); s.textContent = b[5];
      valEls[id] = mk('text', { x: b[0] + b[2] / 2, y: b[1] + 54, class: 'cf-val', 'text-anchor': 'middle' }, g);
      var gl = mk('g', { class: 'cf-glyph', visibility: 'hidden' }, g);
      mk('circle', { cx: b[0] + b[2] - 6, cy: b[1] + 6, r: 11 }, gl);
      var gt = mk('text', { x: b[0] + b[2] - 6, y: b[1] + 11, 'text-anchor': 'middle' }, gl);
      glyphEls[id] = { g: gl, t: gt };
      nodeEls[id] = g;
    });
    var fl = Flights(svg);
    function edgeFor(a, b) { var k = a + '-' + b, r = b + '-' + a; if (edgeEls[k]) return { el: edgeEls[k], rev: false }; if (edgeEls[r]) return { el: edgeEls[r], rev: true }; return null; }
    function unmark() { marked.forEach(function (n) { n.classList.remove('cf-src', 'cf-dst'); }); marked = []; Object.keys(edgeEls).forEach(function (k) { edgeEls[k].classList.remove('on'); }); }
    function mark(id, c) { var n = nodeEls[id]; if (n) { n.classList.add(c); marked.push(n); } }

    return {
      svg: svg,
      // one hop: a labelled token travels from block `from` to block `to`
      leg: function (leg, ms) {
        var e = edgeFor(leg.from, leg.to);
        mark(leg.from, 'cf-src'); mark(leg.to, 'cf-dst');
        if (!e) return Promise.resolve();
        e.el.classList.add('on');
        if (ms <= 0) return Promise.resolve();
        return fl.fly(e.el, { ms: ms, text: leg.text, rev: e.rev });
      },
      endStage: unmark,
      mark: function (id, kind, glyph) {
        var gl = glyphEls[id]; if (!gl) return;
        gl.g.setAttribute('visibility', kind ? 'visible' : 'hidden');
        gl.g.setAttribute('class', 'cf-glyph' + (kind ? ' cf-g-' + kind : ''));
        gl.t.textContent = glyph || '';
        nodeEls[id].classList.toggle('cf-' + 'bad', kind === 'bad'); nodeEls[id].classList.toggle('cf-good', kind === 'ok');
      },
      setVal: function (id, text) { if (valEls[id]) valEls[id].textContent = trunc(text, 20); },
      glow: function (id, on) { if (nodeEls[id]) nodeEls[id].classList.toggle('cf-hot', !!on); },
      reset: function () {
        fl.stop(); unmark();
        Object.keys(ECO_NODES).forEach(function (id) { glyphEls[id].g.setAttribute('visibility', 'hidden'); nodeEls[id].classList.remove('cf-bad', 'cf-good', 'cf-hot'); valEls[id].textContent = ''; });
      },
      stop: function () { fl.stop(); }
    };
  }

  // ───────────── 3 · Paraphrase scan ─────────────
  function scan(host, onFinish) {
    var CL = global.CiteLab, N = 4;
    var wrapEl = el('div', 'cf-scan');
    var body = el('div', 'cf-scan-body');
    var arcs = mk('svg', { class: 'cf-arcs', 'aria-hidden': 'true' }), arcG = mk('g', {}, arcs);
    var srcLab = el('span', 'cl-tag', 'Source — the window looks for each 4-word stretch here'), srcP = el('p', 'cf-words');
    var parLab = el('span', 'cl-tag', 'Your sentence — a 4-word window slides along it'), parP = el('p', 'cf-words');
    body.appendChild(arcs); body.appendChild(srcLab); body.appendChild(srcP); body.appendChild(el('div', 'cf-scan-gap')); body.appendChild(parP); body.appendChild(parLab);
    var ctl = controls({ unit: 'window', start: function (paused) { startRun(paused); }, reset: function () { showFinal(); } });
    var runner = Runner({
      run: function (st, k, ms) { return doStep(st, ms); },
      ms: function () { return ctl.speed.ms(); }, gap: function () { return 0; },
      onChange: function (s) { ctl.paint(s); }, stop: function () { /* steps are timeouts; nothing to abort */ },
      begin: function () { prev = null; clearMarksKeepWords(); }   // wipe the finished picture before the scan starts
    });
    ctl.runner = runner;
    wrapEl.appendChild(ctl.el); wrapEl.appendChild(ctl.narr); wrapEl.appendChild(body); host.appendChild(wrapEl);

    var S = [], P = [], sW = [], pW = [], steps = [], links = [], text = { src: '', par: '' }, result = null;
    function words(p, toks) {
      p.textContent = '';
      return toks.map(function (t) { var s = el('span', 'cf-w' + (t.quoted ? ' cf-q' : ''), t.raw); p.appendChild(s); p.appendChild(document.createTextNode(' ')); return s; });
    }
    function clearMarks() { sW.concat(pW).forEach(function (s) { s.classList.remove('cf-win', 'cf-win-s', 'cf-hit', 'cf-miss'); }); links = []; drawArcs(); }
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
      clearMarks();
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
        pW[st.i + j].classList.toggle('cf-win', on);
        if (st.found) sW[st.srcIndex + j].classList.toggle('cf-win-s', on);
      }
    }
    var prev = null;
    function doStep(st, ms) {
      if (prev) lit(prev, false);
      var g = st.gram;
      lit(st, true); prev = st;
      if (st.match) { mark(st); links.push({ pi: st.i, si: st.srcIndex }); drawArcs(true); }
      ctl.say(stepMsg(st));
      var last = st.i === steps.length - 1;
      return wait(ms <= 0 ? 0 : Math.max(60, ms * 0.55)).then(function () { if (last) { lit(st, false); prev = null; } });
    }
    function clearMarksKeepWords() { sW.concat(pW).forEach(function (s) { s.classList.remove('cf-hit', 'cf-win', 'cf-win-s'); }); links = []; drawArcs(); }

    window.addEventListener('resize', function () { drawArcs(); });
    return { setTexts: setTexts, relayout: function () { drawArcs(); ctl.fix(); }, runner: runner, el: wrapEl };
  }

  var api = { ECO_EDGES: ECO_EDGES, ECO_NODES: ECO_NODES, Runner: Runner, Flights: Flights, controls: controls, speedControl: speedControl, builder: builder, ecosystem: ecosystem, scan: scan, SPEEDS: SPEEDS, SLOTS: SLOTS, trunc: trunc, wrap: wrap };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.CiteFlow = api;
})(typeof window !== 'undefined' ? window : this);
