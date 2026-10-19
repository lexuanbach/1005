/* Full-screen mode for the course apps (labs and demos).
   Usage: <script src="…/app-fullscreen.js" data-root="#vn-root"></script>   (several selectors may be comma-separated)
   For every matching element a "Full screen" button is placed just above it. Pressing it
     1. turns the app element into a viewport-filling panel (CSS class .fs-active: works everywhere, including phones whose
        browsers have no Fullscreen API), and
     2. asks the browser for real full screen on the whole page (so pop-ups, toasts and native dialogs keep working).
   Esc, the floating "Exit full screen" button, or leaving real full screen with the browser's own key all go back.
   The page text, top bar and footer are simply covered; the app element itself is never moved or re-created. */
(function () {
  'use strict';
  var script = document.currentScript;
  var selectors = ((script && script.getAttribute('data-root')) || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  var html = document.documentElement;
  var state = null;   // { root, bar, btn, viaApi }
  var live = null;

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

  function enter(root, bar, btn) {
    if (state) exit();
    state = { root: root, bar: bar, btn: btn, viaApi: false };
    root.classList.add('fs-active');
    bar.classList.add('fs-bar-active');
    html.classList.add('fs-on');
    paintButton(btn, true);
    var req = html.requestFullscreen || html.webkitRequestFullscreen;
    if (req) {
      try {
        var p = req.call(html, { navigationUI: 'hide' });
        if (p && p.catch) p.catch(function () { /* refused: the in-window full-screen panel stays */ });
      } catch (e) { /* same */ }
    }
    announce('Full screen on. Press Escape to leave.');
    nudge();
  }
  function cleanup() {
    if (!state) return;
    var s = state; state = null;
    s.root.classList.remove('fs-active');
    s.bar.classList.remove('fs-bar-active');
    html.classList.remove('fs-on');
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

  var api = { toggle: function (sel) { var r = document.querySelector(sel || selectors[0]); if (!r) return; var b = r.previousElementSibling; var btn = b && b.querySelector('.fs-btn'); if (btn) btn.click(); }, active: function () { return !!state; } };
  window.AppFullscreen = api;
})();
