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
    nudge();
  }
  function cleanup() {
    if (!state) return;
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
