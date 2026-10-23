/* Full-screen mode for the course apps (labs and demos).
   Usage: <script src="…/app-fullscreen.js" data-root="#vn-root"></script>   (several selectors may be comma-separated)
   For every matching element a "Full screen" button is placed just above it. Pressing it
     1. turns the app element into a viewport-filling panel (CSS class .fs-active: works everywhere, including phones whose
        browsers have no Fullscreen API), and
     2. asks the browser for real full screen on the whole page (so pop-ups, toasts and native dialogs keep working).
   Esc, the floating "Exit full screen" button, or leaving real full screen with the browser's own key all go back.
   The page text, top bar and footer are simply covered; the app element itself is never moved or re-created.
   FIT TO SCREEN: nothing may need scrolling. The app is laid out at a virtual width W = screen width / s and drawn with transform: scale(s);
   s is the largest value (1 down to MIN_SCALE) at which the whole app fits both the width and the height of the screen. Wider virtual widths
   also let the apps' own responsive layouts switch to their roomier multi-column forms, so the content gets shorter as s drops.
   Content changes (opening a tab, a longer list) re-fit automatically. Optional per-root hooks: elements matching the app's
   [data-fs-hide] attribute or the selectors in data-hide are hidden while full screen (secondary text that is not part of the app). */
(function () {
  'use strict';
  var script = document.currentScript;
  var selectors = ((script && script.getAttribute('data-root')) || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  var html = document.documentElement;
  var state = null;   // { root, bar, btn, viaApi, scale, fitting }
  var live = null;
  var MIN_SCALE = 0.5, STEP = 0.025, TOP = 42;     // TOP = height in px of the strip that holds the exit button
  var hideSel = ((script && script.getAttribute('data-hide')) || '').trim();

  function fsElement() { return document.fullscreenElement || document.webkitFullscreenElement || null; }
  function announce(msg) {
    if (!live) {
      live = document.createElement('div');
      live.className = 'fs-live'; live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite');
      document.body.appendChild(live);
    }
    live.textContent = '';
    setTimeout(function () { live.textContent = msg; }, 30);
  }
  function nudge() {
    // canvases, diagrams and ResizeObservers re-measure after the layout change
    (window.requestAnimationFrame || setTimeout)(function () {
      try { window.dispatchEvent(new Event('resize')); } catch (e) { /* ignore */ }
    });
  }
  function paintButton(btn, on) {
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.textContent = on ? '✕ Exit full screen' : '⛶ Full screen';
    btn.title = on ? 'Back to the page (Esc)' : 'Fill the whole screen with this app (Esc to leave)';
  }


  /* ---- fit to screen ---- */
  var ro = null, resizeTimer = 0, raf = 0, lastNat = -1, lastW = -1;
  function measure(root, s, vw) {
    var W = Math.floor(vw / s);
    root.style.setProperty('--fs-w', W + 'px');
    return { W: W, h: root.offsetHeight, sw: root.scrollWidth };
  }
  function fit() {
    if (!state || state.fitting) return;
    var root = state.root;
    state.fitting = true;
    try {
      var vw = window.innerWidth, availH = window.innerHeight - TOP;
      root.classList.remove('fs-scroll');
      root.style.removeProperty('--fs-h');
      var best = null, s, m;
      for (s = 1; s >= MIN_SCALE - 1e-6; s = Math.round((s - STEP) * 1000) / 1000) {
        m = measure(root, s, vw);
        if (m.h * s <= availH + 0.5 && m.sw <= m.W + 2) { best = { s: s, m: m }; break; }
      }
      if (!best) {                              // does not fit even at the smallest scale: keep that scale and let the panel scroll
        s = MIN_SCALE; m = measure(root, s, vw);
        root.style.setProperty('--fs-h', Math.floor(availH / s) + 'px');
        root.classList.add('fs-scroll');
        best = { s: s, m: m };
      }
      root.style.setProperty('--fs-s', String(best.s));
      state.scale = best.s; state.natural = best.m.h; state.virtualW = best.m.W; state.scrolls = !!root.classList.contains('fs-scroll');
      lastNat = best.m.h; lastW = best.m.W;
    } finally { state.fitting = false; }
  }
  function refitSoon() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { (window.requestAnimationFrame || setTimeout)(fit); }, 90);
  }
  function attachFit() {
    window.addEventListener('resize', refitSoon);
    if (window.ResizeObserver && state) {
      ro = new ResizeObserver(function () {
        if (!state || state.fitting) return;
        // only react to real content changes at the current virtual width
        if (state.root.offsetHeight !== lastNat || state.root.scrollWidth > lastW + 2) refitSoon();
      });
      ro.observe(state.root);
    }
  }
  function detachFit() {
    window.removeEventListener('resize', refitSoon);
    if (ro) { ro.disconnect(); ro = null; }
    clearTimeout(resizeTimer);
  }

  /* ---- column splitters ----
     data-split on the script tag lists the app's main multi-column grids (e.g. data-split="#cp-app .cp-grid"). While full screen, every
     visible one gets a drag handle in each column gap, so a teacher can widen the pane that matters (a diagram on a projector) at the
     expense of its neighbours. The handles live in one overlay on <body> (position: fixed, placed from the grids' screen rectangles), so
     nothing is inserted into the apps and no app selector can match them. A drag turns the grid's columns into minmax(0, <px>fr) tracks
     with the dragged widths as weights: exact now, and still right after a resize or a re-fit at another scale. Those inline columns exist
     only while full screen (the normal page lays the same element out differently); they are remembered per grid and column count
     (localStorage co1005-fs-cols:…). Arrow keys move a focused handle; double-click puts the app's own columns back. */
  var splitSel = ((script && script.getAttribute('data-split')) || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  var SP = null;   // { layer, handles: [], timer, onAny, ro }
  var SPLIT_KEY = 'co1005-fs-cols:';
  function px(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }
  function remPx() { return px(getComputedStyle(html).fontSize) || 16; }
  function tracks(el) {
    var cs = getComputedStyle(el);
    if (cs.display !== 'grid' && cs.display !== 'inline-grid') return null;
    var t = cs.gridTemplateColumns.replace(/\[[^\]]*\]/g, ' ').trim().split(/\s+/).map(parseFloat);
    return t.length >= 2 && t.every(isFinite) ? t : null;
  }
  function loadCols(sel, n) {
    try {
      var v = JSON.parse(localStorage.getItem(SPLIT_KEY + sel + ':' + n) || 'null');     // untrusted: n positive finite numbers
      if (Array.isArray(v) && v.length === n && v.every(function (x) { return typeof x === 'number' && isFinite(x) && x >= 0 && x < 1e5; }) && v.some(function (x) { return x > 0; })) return v;
    } catch (e) { /* ignore */ }
    return null;
  }
  function saveCols(sel, n, w) { try { if (w) localStorage.setItem(SPLIT_KEY + sel + ':' + n, JSON.stringify(w)); else localStorage.removeItem(SPLIT_KEY + sel + ':' + n); } catch (e) { /* ignore */ } }
  function setCols(el, w) { el.style.gridTemplateColumns = w.map(function (x) { return 'minmax(0, ' + (Math.round(x * 10) / 10) + 'fr)'; }).join(' '); el.__fsCols = true; }
  function clearCols(el) { if (el.__fsCols) { el.style.removeProperty('grid-template-columns'); el.__fsCols = false; } }
  // the app's own column count at this size (the inline columns taken away for a moment), and the remembered widths applied for it
  function syncCols(el, sel) {
    var had = el.__fsCols; clearCols(el);
    var t = tracks(el);
    el.__fsN = t ? t.length : 0;
    var w = t && loadCols(sel, t.length);
    if (w) setCols(el, w);
    return had !== !!w;
  }
  function gridItems(el) {           // the boxes that occupy cells (looking through display: contents wrappers)
    var out = [];
    (function walk(p) {
      Array.prototype.forEach.call(p.children, function (c) {
        var cs = getComputedStyle(c);
        if (cs.display === 'contents') { walk(c); return; }
        if (cs.display === 'none' || cs.position === 'absolute' || cs.position === 'fixed') return;
        var r = c.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) out.push(r);
      });
    })(el);
    return out;
  }
  function splitGrids() {
    var out = [];
    if (!state) return out;
    splitSel.forEach(function (sel) {
      var list; try { list = document.querySelectorAll(sel); } catch (e) { return; }
      Array.prototype.forEach.call(list, function (el) { if (state.root === el || state.root.contains(el)) out.push({ el: el, sel: sel }); });
    });
    return out;
  }
  function placeSplits() {
    if (!SP) return;
    var used = 0;
    splitGrids().forEach(function (g) {
      var el = g.el;
      if (el.__fsN === undefined) syncCols(el, g.sel);
      var t = tracks(el); if (!t) return;
      if (t.length !== el.__fsN && !el.__fsCols) syncCols(el, g.sel);
      var r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return;
      var cs = getComputedStyle(el), k = r.width / (el.offsetWidth || 1) || 1;
      var gap = cs.columnGap === 'normal' ? 0 : px(cs.columnGap);
      var x = px(cs.borderLeftWidth) + px(cs.paddingLeft), items = gridItems(el);
      for (var i = 0; i < t.length - 1; i++) {
        x += t[i];
        var cx = r.left + (x + gap / 2) * k;
        x += gap;
        if (t[i] < 1 || t[i + 1] < 1) continue;                       // an empty (0-width) column has nothing to resize
        // the handle runs as high as the two columns it separates: items inside them set its extent,
        // items that span across the gap (a header row, a full-width strip) cut it short
        var aL = cx - (gap / 2 + t[i]) * k, bR = cx + (gap / 2 + t[i + 1]) * k;
        var top = Infinity, bot = -Infinity, across = [];
        items.forEach(function (ir) {
          if (ir.left < cx - 1 && ir.right > cx + 1) { across.push(ir); return; }
          if (ir.right > aL + 1 && ir.left < bR - 1) { top = Math.min(top, ir.top); bot = Math.max(bot, ir.bottom); }
        });
        if (!(bot > top)) { top = r.top; bot = r.bottom; }
        across.forEach(function (ir) {
          if (ir.bottom <= top || ir.top >= bot) return;
          if ((ir.top + ir.bottom) / 2 < (top + bot) / 2) top = Math.max(top, ir.bottom); else bot = Math.min(bot, ir.top);
        });
        top = Math.max(top, r.top, TOP); bot = Math.min(bot, r.bottom, window.innerHeight);
        if (bot - top < 24) continue;
        var hdl = SP.handles[used] || makeHandle();
        hdl.__grid = g; hdl.__i = i; hdl.__n = t.length;
        hdl.setAttribute('aria-label', 'Resize columns ' + (i + 1) + ' and ' + (i + 2) + ' of this app');
        var hw = Math.max(12, gap * k);
        hdl.style.left = Math.round(cx - hw / 2) + 'px'; hdl.style.width = Math.round(hw) + 'px';
        hdl.style.top = Math.round(top) + 'px'; hdl.style.height = Math.round(bot - top) + 'px';
        hdl.hidden = false;
        used++;
      }
    });
    for (var j = used; j < SP.handles.length; j++) SP.handles[j].hidden = true;
  }
  var placeRaf = 0;
  function placeSoon() { if (SP && !placeRaf) placeRaf = (window.requestAnimationFrame || setTimeout)(function () { placeRaf = 0; placeSplits(); }); }
  function dragTo(hdl, w, i, d) {
    var r = remPx(), pair = w[i] + w[i + 1];
    var minA = Math.min(8 * r, w[i]), minB = Math.min(8 * r, w[i + 1]);
    var a = Math.max(minA, Math.min(w[i] + d, pair - minB));
    var nw = w.slice(); nw[i] = a; nw[i + 1] = pair - a;
    setCols(hdl.__grid.el, nw);
    return nw;
  }
  function settleSplit(hdl, nw) { saveCols(hdl.__grid.sel, hdl.__n, nw); fit(); placeSoon(); }
  function makeHandle() {
    var hdl = document.createElement('div');
    hdl.className = 'fs-split'; hdl.hidden = true;
    hdl.setAttribute('role', 'separator'); hdl.setAttribute('aria-orientation', 'vertical'); hdl.tabIndex = 0;
    hdl.title = 'Drag to make these columns wider or narrower (double-click: the app’s own widths)';
    hdl.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 || !hdl.__grid) return;
      var el = hdl.__grid.el, t = tracks(el); if (!t) return;
      e.preventDefault();
      var k = el.getBoundingClientRect().width / (el.offsetWidth || 1) || 1, x0 = e.clientX, i = hdl.__i, nw = t;
      try { hdl.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      hdl.classList.add('drag'); html.classList.add('fs-splitting');
      function move(ev) { nw = dragTo(hdl, t, i, (ev.clientX - x0) / k); placeSplits(); }
      function up() {
        hdl.removeEventListener('pointermove', move); hdl.removeEventListener('pointerup', up); hdl.removeEventListener('pointercancel', up);
        hdl.classList.remove('drag'); html.classList.remove('fs-splitting');
        settleSplit(hdl, nw);
      }
      hdl.addEventListener('pointermove', move); hdl.addEventListener('pointerup', up); hdl.addEventListener('pointercancel', up);
    });
    hdl.addEventListener('keydown', function (e) {
      if ((e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || !hdl.__grid) return;
      var t = tracks(hdl.__grid.el); if (!t) return;
      e.preventDefault(); e.stopPropagation();
      var k = hdl.__grid.el.getBoundingClientRect().width / (hdl.__grid.el.offsetWidth || 1) || 1;
      settleSplit(hdl, dragTo(hdl, t, hdl.__i, (e.shiftKey ? 64 : 16) / k * (e.key === 'ArrowRight' ? 1 : -1)));
    });
    hdl.addEventListener('dblclick', function () {
      if (!hdl.__grid) return;
      clearCols(hdl.__grid.el); saveCols(hdl.__grid.sel, hdl.__n, null); fit(); placeSoon();
    });
    SP.layer.appendChild(hdl); SP.handles.push(hdl);
    return hdl;
  }
  function startSplits() {
    if (!splitSel.length || SP) return;
    SP = { layer: document.createElement('div'), handles: [] };
    SP.layer.className = 'fs-split-layer';
    document.body.appendChild(SP.layer);
    splitGrids().forEach(function (g) { syncCols(g.el, g.sel); });
    fit();
    // the layout changes without any resize when an app switches tabs, levels or modes: re-place on any interaction, and twice a second
    SP.onAny = function () { placeSoon(); };
    SP.onResize = function () { splitGrids().forEach(function (g) { syncCols(g.el, g.sel); }); placeSoon(); };
    window.addEventListener('resize', SP.onResize);
    window.addEventListener('scroll', SP.onAny, true);
    ['pointerup', 'keyup', 'change'].forEach(function (ev) { document.addEventListener(ev, SP.onAny, true); });
    SP.timer = setInterval(placeSplits, 500);
    placeSoon();
  }
  function stopSplits() {
    if (!SP) return;
    clearInterval(SP.timer);
    window.removeEventListener('resize', SP.onResize);
    window.removeEventListener('scroll', SP.onAny, true);
    ['pointerup', 'keyup', 'change'].forEach(function (ev) { document.removeEventListener(ev, SP.onAny, true); });
    if (SP.layer.parentNode) SP.layer.parentNode.removeChild(SP.layer);
    SP = null;
    splitSel.forEach(function (sel) {
      try { Array.prototype.forEach.call(document.querySelectorAll(sel), function (el) { clearCols(el); el.__fsN = undefined; }); } catch (e) { /* ignore */ }
    });
  }

  function enter(root, bar, btn) {
    if (state) exit();
    state = { root: root, bar: bar, btn: btn, viaApi: false };
    root.classList.add('fs-active');
    bar.classList.add('fs-bar-active');
    html.classList.add('fs-on');
    paintButton(btn, true);
    if (hideSel) Array.prototype.forEach.call(document.querySelectorAll(hideSel), function (n) { n.classList.add('fs-hidden'); });
    attachFit();
    var req = html.requestFullscreen || html.webkitRequestFullscreen;
    if (req) {
      try {
        var p = req.call(html, { navigationUI: 'hide' });
        if (p && p.catch) p.catch(function () { /* refused: the in-window full-screen panel stays */ });
      } catch (e) { /* same */ }
    }
    announce('Full screen on. Press Escape to leave.');
    fit();
    startSplits();
    nudge();
  }
  function cleanup() {
    if (!state) return;
    stopSplits();
    var s = state; state = null;
    detachFit(s);
    s.root.classList.remove('fs-active');
    s.root.style.removeProperty('--fs-w'); s.root.style.removeProperty('--fs-s'); s.root.style.removeProperty('--fs-h');
    s.root.classList.remove('fs-scroll');
    s.bar.classList.remove('fs-bar-active');
    html.classList.remove('fs-on');
    Array.prototype.forEach.call(document.querySelectorAll('.fs-hidden'), function (n) { n.classList.remove('fs-hidden'); });
    paintButton(s.btn, false);
    announce('Full screen off.');
    nudge();
    try { s.btn.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }
  function exit() {
    if (!state) return;
    if (fsElement()) {
      var ex = document.exitFullscreen || document.webkitExitFullscreen;
      try { var p = ex.call(document); if (p && p.catch) p.catch(function () {}); } catch (e) { /* ignore */ }
    }
    cleanup();
  }

  function onFsChange() {
    if (!state) return;
    if (fsElement()) state.viaApi = true;
    else if (state.viaApi) cleanup();      // left real full screen with the browser's own key
    nudge();
  }
  document.addEventListener('fullscreenchange', onFsChange);
  document.addEventListener('webkitfullscreenchange', onFsChange);

  // Esc in the in-window mode (real full screen handles Esc itself); apps that use Esc for their own pop-ups win
  document.addEventListener('keydown', function (e) {
    if (!state || e.key !== 'Escape' || e.defaultPrevented || fsElement()) return;
    if (document.querySelector('dialog[open]')) return;
    exit();
  });

  function attach(root) {
    if (root.__fsAttached) return;
    root.__fsAttached = true;
    var bar = document.createElement('div');
    bar.className = 'fs-bar';
    var btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'fs-btn';
    paintButton(btn, false);
    btn.addEventListener('click', function () { if (state && state.root === root) exit(); else enter(root, bar, btn); });
    bar.appendChild(btn);
    var theme = document.getElementById('theme-toggle');
    if (theme) {
      var tb = document.createElement('button');
      tb.type = 'button'; tb.className = 'fs-btn fs-theme'; tb.textContent = '◐ Theme'; tb.title = 'Light or dark';
      tb.addEventListener('click', function () { theme.click(); });
      bar.appendChild(tb);
    }
    root.parentNode.insertBefore(bar, root);
  }

  function init() {
    selectors.forEach(function (sel) {
      var list;
      try { list = document.querySelectorAll(sel); } catch (e) { return; }
      Array.prototype.forEach.call(list, attach);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  var api = { info: function () { return state ? { scale: state.scale, natural: state.natural, virtualW: state.virtualW, scrolls: state.scrolls } : null; }, refit: fit, toggle: function (sel) { var r = document.querySelector(sel || selectors[0]); if (!r) return; var b = r.previousElementSibling; var btn = b && b.querySelector('.fs-btn'); if (btn) btn.click(); }, active: function () { return !!state; } };
  window.AppFullscreen = api;
})();
