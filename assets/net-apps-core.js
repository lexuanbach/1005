/* Chapter 9 concept apps — shared core.
   One small interactive app per concept (9.1 … 9.9). Each app file registers itself:
       NetApps.register('reach', { title, hint, build: function (host, NA) { … } });
   and the chapter page contains   <div data-na-app="reach"></div>   where the app should appear.
   This file holds only helpers: DOM builders, the speed control, a cancellable animation runner, tabs, a seeded RNG.
   Every app keeps its LOGIC in plain exported functions (NetApps.engines.<name>) so Node can test them without a browser.
   All of it is a simulation with invented names and documentation-range addresses (RFC 5737); nothing touches the network. */
(function (root) {
  'use strict';
  var NA = root.NetApps || (root.NetApps = {});
  NA.apps = NA.apps || {};
  NA.engines = NA.engines || {};
  NA.version = 1;

  var hasDom = typeof document !== 'undefined';

  /* ---------- tiny DOM helpers ---------- */
  function el(tag, cls, content) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (content != null) {
      if (typeof content === 'string' || typeof content === 'number') n.textContent = content;
      else if (Array.isArray(content)) content.forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
      else n.appendChild(content);
    }
    return n;
  }
  var SVGNS = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs, parent, text) {
    var n = document.createElementNS(SVGNS, tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (text != null) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }
  function html(tag, cls, markup) { var n = el(tag, cls); n.innerHTML = markup; return n; }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); return n; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var uid = 0;
  function nextId(p) { return (p || 'na') + '-' + (++uid); }

  /* a labelled control: <label> text + control */
  function field(label, control, cls) {
    var w = el('label', 'na-field' + (cls ? ' ' + cls : ''));
    w.appendChild(el('span', 'na-lab', label));
    w.appendChild(control);
    return w;
  }
  function button(label, cls, onClick, title) {
    var b = el('button', 'na-btn' + (cls ? ' ' + cls : ''), label);
    b.type = 'button';
    if (title) b.title = title;
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }
  function chip(label, onClick, title) {
    var b = el('button', 'na-chip', label);
    b.type = 'button';
    if (title) b.title = title;
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }
  /* range input that shows its value: returns {wrap, input, set(v), get()}; fmt(v) → text */
  function slider(label, min, max, step, value, fmt, onInput) {
    var inp = el('input'); inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step; inp.value = value;
    var out = el('output', 'na-val');
    function paint() { out.textContent = fmt ? fmt(+inp.value) : inp.value; }
    inp.addEventListener('input', function () { paint(); if (onInput) onInput(+inp.value); });
    paint();
    var wrap = el('label', 'na-field na-slider');
    var top = el('span', 'na-lab'); top.appendChild(document.createTextNode(label + ' ')); top.appendChild(out);
    wrap.appendChild(top); wrap.appendChild(inp);
    return { wrap: wrap, input: inp, out: out, get: function () { return +inp.value; }, set: function (v) { inp.value = v; paint(); } };
  }
  function select(options, value, onChange) {
    var s = el('select');
    options.forEach(function (o) {
      var op = el('option', null, o.label != null ? o.label : o.value); op.value = o.value; s.appendChild(op);
    });
    if (value != null) s.value = value;
    if (onChange) s.addEventListener('change', function () { onChange(s.value); });
    return s;
  }
  /* segmented buttons (radio-like). items: [{value,label,title}] → {wrap,set,get} */
  function segmented(items, value, onChange, ariaLabel) {
    var wrap = el('div', 'na-seg'); wrap.setAttribute('role', 'group'); if (ariaLabel) wrap.setAttribute('aria-label', ariaLabel);
    var cur = value, btns = {};
    items.forEach(function (it) {
      var b = el('button', 'na-seg-b', it.label); b.type = 'button'; if (it.title) b.title = it.title;
      b.setAttribute('aria-pressed', it.value === cur ? 'true' : 'false');
      b.addEventListener('click', function () { set(it.value, true); });
      btns[it.value] = b; wrap.appendChild(b);
    });
    function set(v, fire) {
      cur = v;
      Object.keys(btns).forEach(function (k) { btns[k].setAttribute('aria-pressed', k === String(v) ? 'true' : 'false'); });
      if (fire && onChange) onChange(v);
    }
    return { wrap: wrap, set: function (v) { set(v, false); }, get: function () { return cur; } };
  }
  /* stat tile: {node, set(value, sub?)} */
  function stat(label, cls) {
    var n = el('div', 'na-stat' + (cls ? ' ' + cls : ''));
    var v = el('div', 'na-stat-v', '—'), l = el('div', 'na-stat-l', label), s = el('div', 'na-stat-s', '');
    n.appendChild(l); n.appendChild(v); n.appendChild(s);
    return { node: n, set: function (val, sub) { v.textContent = val; s.textContent = sub || ''; } };
  }

  /* ---------- speed (shared by all apps, remembered) ---------- */
  var SPEEDS = [{ id: 'slow', label: 'Slow', f: 2.2 }, { id: 'normal', label: 'Normal', f: 1 }, { id: 'fast', label: 'Fast', f: 0.4 }, { id: 'instant', label: 'Instant', f: 0 }];
  var speedIdx = 1;
  try { var sv = hasDom && localStorage.getItem('co1005-na-speed'); if (sv != null) { var si = SPEEDS.findIndex(function (s) { return s.id === sv; }); if (si >= 0) speedIdx = si; } } catch (e) { /* storage may be blocked */ }
  function reduced() { try { return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } }
  /* base milliseconds → real milliseconds for the chosen speed (0 = no animation) */
  function dur(base) { return (reduced() || SPEEDS[speedIdx].f === 0) ? 0 : Math.round(base * SPEEDS[speedIdx].f); }
  function speedControl() {
    var seg = segmented(SPEEDS.map(function (s) { return { value: s.id, label: s.label }; }), SPEEDS[speedIdx].id, function (v) {
      speedIdx = SPEEDS.findIndex(function (s) { return s.id === v; });
      try { localStorage.setItem('co1005-na-speed', v); } catch (e) { /* ignore */ }
      document.dispatchEvent(new CustomEvent('na-speed'));
    }, 'Animation speed');
    document.addEventListener('na-speed', function () { seg.set(SPEEDS[speedIdx].id); });
    var w = el('div', 'na-field na-speed'); w.appendChild(el('span', 'na-lab', 'Speed')); w.appendChild(seg.wrap);
    return w;
  }

  /* ---------- cancellable animation runner ----------
     var run = NA.runner(); var g = run.start();  await run.sleep(g, 300) / run.tween(g, 600, function (t) {…});
     Both resolve to false when run.cancel() / run.start() was called meanwhile — the caller should simply return. */
  function runner() {
    var gen = 0;
    return {
      start: function () { return ++gen; },
      cancel: function () { gen++; },
      alive: function (g) { return g === gen; },
      sleep: function (g, ms) { return new Promise(function (res) { if (ms <= 0) return res(g === gen); setTimeout(function () { res(g === gen); }, ms); }); },
      tween: function (g, ms, fn) {
        return new Promise(function (res) {
          if (ms <= 0) { fn(1); return res(g === gen); }
          var t0 = null;
          function f(now) {
            if (g !== gen) return res(false);
            if (t0 == null) t0 = now;
            var t = Math.min(1, (now - t0) / ms);
            fn(t);
            if (t < 1) requestAnimationFrame(f); else res(g === gen);
          }
          requestAnimationFrame(f);
        });
      }
    };
  }
  function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function lerp(a, b, t) { return a + (b - a) * t; }

  /* ---------- tabs (panels are built lazily, the first time they are opened) ---------- */
  function tabs(host, items, opts) {
    opts = opts || {};
    var id = nextId('natab');
    var bar = el('div', 'na-tabs'); bar.setAttribute('role', 'tablist');
    var panels = el('div', 'na-panels');
    var btns = [], pans = [], built = [];
    items.forEach(function (it, i) {
      var b = el('button', 'na-tab', it.label); b.type = 'button'; b.setAttribute('role', 'tab');
      b.id = id + '-t' + i; b.setAttribute('aria-controls', id + '-p' + i);
      var p = el('div', 'na-panel'); p.id = id + '-p' + i; p.setAttribute('role', 'tabpanel'); p.setAttribute('aria-labelledby', b.id);
      b.addEventListener('click', function () { open(i); });
      b.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { var j = (i + (e.key === 'ArrowRight' ? 1 : items.length - 1)) % items.length; open(j); btns[j].focus(); e.preventDefault(); }
      });
      btns.push(b); pans.push(p); bar.appendChild(b); panels.appendChild(p);
    });
    function open(i) {
      btns.forEach(function (b, k) { b.setAttribute('aria-selected', k === i ? 'true' : 'false'); b.tabIndex = k === i ? 0 : -1; pans[k].hidden = k !== i; });
      if (!built[i]) { built[i] = true; items[i].build(pans[i]); }
      if (opts.onOpen) opts.onOpen(i);
    }
    host.appendChild(bar); host.appendChild(panels);
    open(opts.start || 0);
    return { open: open, panels: pans };
  }

  /* ---------- the app frame: header, narration line, optional speed control ---------- */
  function frame(host, meta) {
    host.classList.add('na');
    clear(host);
    var head = el('div', 'na-head');
    head.appendChild(el('span', 'na-badge', 'Interactive'));
    head.appendChild(el('strong', 'na-title', meta.title));
    if (meta.hint) head.appendChild(el('span', 'na-hint', meta.hint));
    host.appendChild(head);
    var body = el('div', 'na-body');
    host.appendChild(body);
    return body;
  }
  /* the narration box: one polite live region per app; say(html) swaps the text */
  function narrator(cls) {
    var n = el('div', 'na-say' + (cls ? ' ' + cls : '')); n.setAttribute('role', 'status'); n.setAttribute('aria-live', 'polite');
    return { node: n, say: function (markup) { n.innerHTML = markup; } };
  }

  /* ---------- seeded random numbers (same bad luck on every run, and for every protocol) ---------- */
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /* deterministic "dice" from a few integers: same inputs → same number in [0,1) */
  function dice() {
    var h = 2166136261;
    for (var i = 0; i < arguments.length; i++) { h ^= (arguments[i] | 0) + 0x9e3779b9; h = Math.imul(h, 16777619); h ^= h >>> 13; }
    return rng(h)();
  }

  /* ---------- formatting ---------- */
  function fmtTime(sec) {
    if (!isFinite(sec)) return '∞';
    if (sec < 1e-3) return (sec * 1e6).toFixed(sec < 1e-5 ? 1 : 0) + ' µs';
    if (sec < 1) return (sec * 1e3).toFixed(sec < 0.01 ? 2 : sec < 0.1 ? 1 : 0) + ' ms';
    if (sec < 120) return sec.toFixed(sec < 10 ? 2 : 1) + ' s';
    if (sec < 7200) return (sec / 60).toFixed(1) + ' min';
    return (sec / 3600).toFixed(1) + ' h';
  }
  function fmtBytes(b) {
    if (b < 1000) return Math.round(b) + ' B';
    if (b < 1e6) return (b / 1e3).toFixed(b < 1e4 ? 2 : 1) + ' kB';
    if (b < 1e9) return (b / 1e6).toFixed(b < 1e7 ? 2 : 1) + ' MB';
    return (b / 1e9).toFixed(2) + ' GB';
  }
  function fmtBps(bps) {
    if (bps < 1e6) return +(bps / 1e3).toFixed(bps < 1e4 ? 2 : 1) + ' kbps';
    if (bps < 1e9) return +(bps / 1e6).toFixed(bps < 1e7 ? 3 : 1) + ' Mbps';
    return +(bps / 1e9).toFixed(2) + ' Gbps';
  }
  function fmtKm(km) {
    if (km < 0.001) return (km * 1e6 / 1000).toFixed(km * 1e3 < 10 ? 1 : 0) + ' m';
    if (km < 1) return Math.round(km * 1000) + ' m';
    return (km >= 100 ? Math.round(km).toLocaleString('en-US') : +km.toFixed(1)) + ' km';
  }

  /* ---------- registry + mounting ---------- */
  function register(id, def) { NA.apps[id] = def; if (hasDom && document.readyState !== 'loading') mountOne(id); }
  function mountNode(node) {
    if (node.__naBuilt) return;
    var id = node.getAttribute('data-na-app'), def = NA.apps[id];
    if (!def) return;                       // file not loaded (yet): register() will call us again
    node.__naBuilt = true;
    try {
      var body = frame(node, def);
      def.build(body, NA, node);
    } catch (err) {
      node.appendChild(el('p', 'na-error', 'This mini app could not start: ' + err.message));
      if (root.console) console.error('[NetApps:' + id + ']', err);
    }
  }
  function mountOne(id) {
    var nodes = document.querySelectorAll('[data-na-app="' + id + '"]');
    Array.prototype.forEach.call(nodes, function (n) { lazy(n); });
  }
  function lazy(node) {
    if (node.__naBuilt || node.__naQueued) return;
    node.__naQueued = true;
    if ('IntersectionObserver' in root && !node.hasAttribute('data-na-eager')) {
      var io = new IntersectionObserver(function (es) {
        if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); mountNode(node); }
      }, { rootMargin: '600px 0px' });
      io.observe(node);
      node.style.minHeight = '12rem';
    } else mountNode(node);
  }
  function mountAll() { Array.prototype.forEach.call(document.querySelectorAll('[data-na-app]'), lazy); }
  if (hasDom) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountAll); else mountAll();
  }

  NA.el = el; NA.svg = svg; NA.html = html; NA.clear = clear; NA.esc = esc; NA.nextId = nextId;
  NA.field = field; NA.button = button; NA.chip = chip; NA.slider = slider; NA.select = select; NA.segmented = segmented; NA.stat = stat;
  NA.speedControl = speedControl; NA.dur = dur; NA.reduced = reduced; NA.runner = runner; NA.ease = ease; NA.lerp = lerp;
  NA.tabs = tabs; NA.frame = frame; NA.narrator = narrator;
  NA.rng = rng; NA.dice = dice;
  NA.fmtTime = fmtTime; NA.fmtBytes = fmtBytes; NA.fmtBps = fmtBps; NA.fmtKm = fmtKm;
  NA.register = register; NA.mountAll = mountAll;
  NA.mountNode = mountNode;   // builds one app right now (also used by tests)
  if (typeof module !== 'undefined' && module.exports) module.exports = NA;
})(typeof window !== 'undefined' ? window : globalThis);
