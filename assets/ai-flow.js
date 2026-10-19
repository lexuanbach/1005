/* AI pipeline flow helpers — shared by the Chapter 11 lab (ai-lab.js) and the neural playground demo.
   - speedControl(): the same 6-level speed slider as the Von Neumann lab (Very slow … Instant), persisted.
   - createPipeline(): the block diagram  Data → Model → Prediction → Loss → Optimizer → (updated weights) Model,
     with a separate greyed-out "Inference" mode, live numbers inside each block and travelling tokens.
   - createRunner(): plays a list of events (arrows) with Pause / Next-arrow / finish, deferring value updates until
     each token lands.  Pure DOM/SVG; theme tokens only (see ai-flow.css). */
(function (global) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var SPEEDS = [
    { name: 'Very slow', ms: 2200 }, { name: 'Slow', ms: 1400 }, { name: 'Normal', ms: 800 },
    { name: 'Fast', ms: 400 }, { name: 'Very fast', ms: 150 }, { name: 'Instant', ms: 0 }
  ];
  function mk(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag), k;
    for (k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function reduced() { try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } }

  /* speed slider: { el, ms(), gap(), index(), name() } */
  function speedControl(opts) {
    opts = opts || {};
    var key = opts.key || 'co1005-flow-speed', idx = opts.initial === undefined ? 2 : opts.initial;
    try { var s = localStorage.getItem(key); if (typeof s === 'string' && /^[0-9]{1,2}$/.test(s) && +s < SPEEDS.length) idx = +s; } catch (e) { /* no storage */ }
    var wrap = document.createElement('div'); wrap.className = 'af-speed';
    var lab = document.createElement('label'); lab.className = 'field-label'; lab.textContent = opts.label || 'Speed';
    var id = 'af-speed-' + Math.floor(Math.random() * 1e6); lab.setAttribute('for', id);
    var rng = document.createElement('input'); rng.type = 'range'; rng.id = id; rng.min = 0; rng.max = SPEEDS.length - 1; rng.step = 1; rng.value = idx;
    var nm = document.createElement('span'); nm.className = 'af-speed-name';
    wrap.appendChild(lab); wrap.appendChild(rng); wrap.appendChild(nm);
    function paint() { nm.textContent = SPEEDS[idx].name + (SPEEDS[idx].ms ? ' · ' + (SPEEDS[idx].ms / 1000) + ' s' + (opts.unit ? ' per ' + opts.unit : '') : ''); rng.setAttribute('aria-valuetext', SPEEDS[idx].name); }
    rng.addEventListener('input', function () {
      idx = +rng.value; paint();
      try { localStorage.setItem(key, String(idx)); } catch (e) { /* no storage */ }
      if (opts.onChange) opts.onChange(idx);
    });
    paint();
    function set(v) { idx = v; rng.value = v; paint(); }
    return { set: set, el: wrap, ms: function () { return SPEEDS[idx].ms; }, gap: function () { var m = SPEEDS[idx].ms; return m ? Math.round(m * 0.35) : 0; }, index: function () { return idx; }, name: function () { return SPEEDS[idx].name; } };
  }

  /* ───────────── the pipeline diagram ───────────── */
  var BLOCKS = { data: [10, 20, 150, 112], model: [225, 20, 150, 112], pred: [440, 20, 150, 112], loss: [440, 250, 150, 112], opt: [225, 250, 150, 112] };
  var EDGES = {
    'data>model': 'M162 76 L222 76', 'model>pred': 'M377 76 L437 76', 'pred>loss': 'M515 134 L515 247',
    'loss>opt': 'M437 306 L380 306', 'opt>model': 'M300 247 L300 135', 'data>loss': 'M85 134 L85 392 L470 392 L470 365'
  };
  var CAPS = [['data>model', 192, 66, 'middle', 'x'], ['model>pred', 407, 66, 'middle', 'ŷ'], ['pred>loss', 523, 196, 'start', 'ŷ'],
    ['loss>opt', 408, 298, 'middle', 'error'], ['opt>model', 308, 196, 'start', 'new weights'], ['data>loss', 270, 384, 'middle', 'y (the right answers)']];
  /* one colour per component (CSS: .af-c-<key> sets --c from the shared --cmp-N tokens, see ai-flow.css).
     An arrow carries a quantity, so it takes the colour of that quantity: x and y = Data, ŷ = Prediction,
     error = Loss, new weights = Optimizer. */
  var EDGE_COLOUR = { 'data>model': 'data', 'data>loss': 'data', 'model>pred': 'pred', 'pred>loss': 'pred', 'loss>opt': 'loss', 'opt>model': 'opt' };
  var LEGEND = [['data', 'Data (x, y)'], ['model', 'Model F(x; weights)'], ['pred', 'Prediction ŷ'], ['loss', 'Loss'], ['opt', 'Optimizer']];

  /* cfg: { titles:{data,model,pred,loss,opt}, aria } -> { svg, setBlock(id, lines), setTitle, setMode, play(flows, ms), clear, cancel, mode() } */
  function createPipeline(container, cfg) {
    cfg = cfg || {};
    var titles = { data: 'DATA', model: 'MODEL', pred: 'PREDICTION', loss: 'LOSS', opt: 'OPTIMIZER' }, k;
    for (k in (cfg.titles || {})) titles[k] = cfg.titles[k];
    var uid = 'afp' + Math.floor(Math.random() * 1e6);
    var svg = mk('svg', { viewBox: '0 0 600 410', class: 'af-pipe', role: 'img', 'aria-label': cfg.aria || 'Pipeline: data into a model, a prediction, a loss, an optimizer that updates the model' });
    var defs = mk('defs', {}, svg);
    Object.keys(EDGES).forEach(function (key) {   // one arrowhead per arrow, so it can take the arrow's colour (and grey out)
      var m = mk('marker', { id: uid + key.replace('>', '-'), viewBox: '0 0 10 10', refX: '8', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' }, defs);
      mk('path', { d: 'M 0 0 L 10 5 L 0 10 z', class: 'af-head af-c-' + EDGE_COLOUR[key], 'data-edge': key }, m);
    });
    var edgeEls = {};
    Object.keys(EDGES).forEach(function (key) { edgeEls[key] = mk('path', { d: EDGES[key], class: 'af-edge af-c-' + EDGE_COLOUR[key], 'marker-end': 'url(#' + uid + key.replace('>', '-') + ')', 'data-edge': key }, svg); });
    CAPS.forEach(function (c) { var t = mk('text', { x: c[1], y: c[2], 'text-anchor': c[3], class: 'af-cap af-c-' + EDGE_COLOUR[c[0]], 'data-edge': c[0] }, svg); t.textContent = c[4]; });
    var nodeEls = {}, titleEls = {}, lineEls = {}, tagEls = {};
    Object.keys(BLOCKS).forEach(function (id) {
      var b = BLOCKS[id], g = mk('g', { class: 'af-node af-n-' + id + ' af-c-' + id, 'data-node': id }, svg);
      mk('rect', { x: b[0], y: b[1], width: b[2], height: b[3], rx: 10 }, g);
      titleEls[id] = mk('text', { x: b[0] + b[2] / 2, y: b[1] + 20, 'text-anchor': 'middle', class: 'af-name' }, g);
      lineEls[id] = [0, 1, 2].map(function (n) { return mk('text', { x: b[0] + b[2] / 2, y: b[1] + 47 + n * 21, 'text-anchor': 'middle', class: 'af-val' + (n === 0 ? ' first' : '') }, g); });
      tagEls[id] = mk('text', { x: b[0] + b[2] - 8, y: b[1] + b[3] - 8, 'text-anchor': 'end', class: 'af-tag' }, g);
      nodeEls[id] = g; titleEls[id].textContent = titles[id];
    });
    var tokens = mk('g', { class: 'af-tokens' }, svg);
    container.appendChild(svg);
    var legend = document.createElement('div'); legend.className = 'af-legend';
    LEGEND.forEach(function (it) {
      var sp = document.createElement('span'); sp.className = 'af-c-' + it[0] + ' af-lg-' + it[0];
      var sw = document.createElement('i'); sp.appendChild(sw); sp.appendChild(document.createTextNode(it[1])); legend.appendChild(sp);
    });
    var note = document.createElement('span'); note.className = 'af-legend-note';
    note.textContent = 'Arrows and tokens take the colour of what they carry.'; legend.appendChild(note);
    container.appendChild(legend);

    var raf = 0, pending = null, marked = [], activeEdges = [], mode = 'train', mc = reduced();
    function setBlock(id, lines) { for (var n = 0; n < 3; n++) lineEls[id][n].textContent = lines && lines[n] !== undefined ? lines[n] : ''; }
    function setTitle(id, t) { titleEls[id].textContent = t; }
    function setTag(id, t) { tagEls[id].textContent = t || ''; }
    function setMode(m) {
      mode = m; svg.setAttribute('class', 'af-pipe' + (m === 'infer' ? ' af-infer' : ''));
      legend.classList.toggle('af-infer', m === 'infer');
    }
    function clear() {
      stopTokens();
      marked.forEach(function (n) { n.classList.remove('af-src', 'af-dst'); }); marked = [];
    }
    function stopTokens() {
      if (raf) cancelAnimationFrame(raf); raf = 0;
      while (tokens.firstChild) tokens.removeChild(tokens.firstChild);
      activeEdges.forEach(function (e) { e.classList.remove('on'); }); activeEdges = [];
      if (pending) { var r = pending; pending = null; r(); }
    }
    function mark(id, cls) { var n = nodeEls[id]; if (n) { n.classList.add(cls); marked.push(n); } }
    /* flows: [{key:'data>model', label:'x'}] — all move together; resolves when they land */
    function play(flows, ms) {
      clear();
      return new Promise(function (resolve) {
        var items = [];
        flows.forEach(function (f) {
          var p = f.key.split('>'); mark(p[0], 'af-src'); mark(p[1], 'af-dst');
          if (edgeEls[f.key]) items.push({ path: edgeEls[f.key], label: f.label || '', col: EDGE_COLOUR[f.key] });
        });
        if (!items.length || ms <= 0) { resolve(); return; }
        items.forEach(function (it) { it.path.classList.add('on'); activeEdges.push(it.path); it.len = it.path.getTotalLength(); });
        if (mc || reduced()) { pending = resolve; setTimeout(function () { if (pending === resolve) stopTokens(); }, Math.min(ms, 450)); return; }
        var toks = items.map(function (it) {
          var g = mk('g', { class: 'af-token af-c-' + it.col }, tokens), w = Math.max(24, it.label.length * 7.4 + 14);
          mk('rect', { x: -w / 2, y: -10, width: w, height: 20, rx: 9 }, g);
          var t = mk('text', { 'text-anchor': 'middle', y: 4 }, g); t.textContent = it.label || '·';
          return g;
        });
        var t0 = null;
        pending = resolve;
        function frame(ts) {
          if (t0 === null) t0 = ts;
          var q = Math.min(1, (ts - t0) / ms), e = q < 0.5 ? 2 * q * q : 1 - Math.pow(-2 * q + 2, 2) / 2;
          items.forEach(function (it, i) { var pt = it.path.getPointAtLength(it.len * e); toks[i].setAttribute('transform', 'translate(' + pt.x.toFixed(1) + ' ' + pt.y.toFixed(1) + ')'); });
          if (q < 1) raf = requestAnimationFrame(frame); else { raf = 0; stopTokens(); }
        }
        raf = requestAnimationFrame(frame);
      });
    }
    setMode('train');
    return { svg: svg, legend: legend, setBlock: setBlock, setTitle: setTitle, setTag: setTag, setMode: setMode, mode: function () { return mode; },
      play: play, clear: clear, cancel: stopTokens };
  }

  /* ───────────── runner: queue of events with Pause / Next arrow / finish ─────────────
     event = { flows:[{key,label}], begin(): narration/pre-state, land(): apply the values that arrive }
     hooks = { onState(runner) } called whenever running/paused/waiting changes */
  function createRunner(pipe, speed, hooks) {
    hooks = hooks || {};
    var q = [], i = 0, paused = false, busy = false, gen = 0, resolveAll = null, timer = 0, cur = null;
    function state() { return { active: i < q.length || busy, paused: paused, busy: busy, waiting: paused && !busy && i < q.length, left: q.length - i }; }
    function notify() { if (hooks.onState) hooks.onState(state()); }
    function finishRun() { var r = resolveAll; resolveAll = null; q = []; i = 0; busy = false; pipe.clear(); notify(); if (r) r(); }
    function next(manual) {
      if (timer) { clearTimeout(timer); timer = 0; }
      if (i >= q.length) { finishRun(); return; }
      if (paused && !manual) { pipe.clear(); if (hooks.wait) hooks.wait(q[i]); notify(); return; }
      var ev = q[i++], my = gen, ms = speed.ms();
      busy = true; cur = ev; if (ev.begin) ev.begin(); notify();
      pipe.play(ev.flows, ms).then(function () {
        if (my !== gen) return;
        busy = false; cur = null; if (ev.land) ev.land();
        if (i >= q.length) { finishRun(); return; }
        notify();
        if (ms <= 0 && !paused) next(false); else timer = setTimeout(function () { next(false); }, paused ? 0 : speed.gap());
      });
    }
    return {
      state: state,
      start: function (events, startPaused) {
        finishNow(); q = events.slice(); i = 0;
        var p = new Promise(function (res) { resolveAll = res; });
        if (startPaused) paused = true;
        next(false); return p;
      },
      togglePause: function () { paused = !paused; if (!paused && !busy && i < q.length) next(false); else notify(); return paused; },
      setPaused: function (v) { paused = v; notify(); },
      step: function () { if (!busy && i < q.length) { paused = true; next(true); } },
      finish: finishNow, cancel: cancelNow
    };
    function finishNow() {   // land every remaining event instantly, in order
      if (!q.length && !busy) return;
      gen++; pipe.cancel(); pipe.clear();
      if (timer) { clearTimeout(timer); timer = 0; }
      if (busy && cur) { if (cur.land) cur.land(); } cur = null;
      while (i < q.length) { var ev = q[i++]; if (ev.begin) ev.begin(); if (ev.land) ev.land(); }
      busy = false; finishRun();
    }
    function cancelNow() { gen++; cur = null; if (timer) { clearTimeout(timer); timer = 0; } pipe.cancel(); finishRun(); }
  }

  global.AIFlow = { SPEEDS: SPEEDS, speedControl: speedControl, createPipeline: createPipeline, createRunner: createRunner, reduced: reduced };
})(typeof window !== 'undefined' ? window : this);
