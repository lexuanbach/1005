/* CO1005 slide mode: presents a chapter page as a slide deck.
   The real page elements are MOVED into the slides (not copied), so every
   interactive app, runnable example and tooltip keeps working; each one leaves
   a placeholder comment behind and is put back when slide mode closes.
   Slides are packed to fit the screen: one concept starts a new slide, its
   blocks are added until the next one would overflow, and a block that is too
   tall alone is split (media rows, wrapper divs) or gets a scrollable slide.
   Re-packs on resize, zoom and late image loads. Deep link: #slides-N.
   Load after course.js (it needs the folds and .topbar-tools course.js builds). */
(function () {
  'use strict';

  var SECTIONS = ['concepts', 'studio', 'lab', 'teamwork'];   // presented, in page order
  var END_LINKS = ['lab', 'studio', 'quiz', 'exercises', 'reading'];
  var ZOOM_KEY = 'co1005-slide-zoom';
  var ZOOMS = [0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.4, 1.6];
  var html = document.documentElement;

  var deck, stage, counter, progress, overview, zoomLabel, fsBtn;
  var slides = [];          // { el, body, title, kicker, group }
  var groups = [];          // { kicker, titleHtml, titleText, units, section, agenda }
  var moved = [];           // nodes taken out of the page (each has __smPh)
  var cur = 0, on = false, lastSize = '', zoom = 1, moreTimer = 0;
  var hero = {};

  function $(sel, rootEl) { return (rootEl || document).querySelector(sel); }
  function $all(sel, rootEl) { return Array.prototype.slice.call((rootEl || document).querySelectorAll(sel)); }
  function mk(tag, cls, htmlText) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (htmlText != null) n.innerHTML = htmlText;
    return n;
  }
  function text(n) { return n ? n.textContent.replace(/\s+/g, ' ').trim() : ''; }
  function stripNumber(s) { return s.replace(/^\d+\s*·\s*/, ''); }

  try { var z = parseFloat(localStorage.getItem(ZOOM_KEY)); if (ZOOMS.indexOf(z) >= 0) zoom = z; } catch (e) {}

  // ───────────── moving page nodes in and out ─────────────
  function take(node) {
    if (node.__smClone || node.__smPh) return node;
    var ph = document.createComment('slide-mode');
    node.parentNode.insertBefore(ph, node);
    node.__smPh = ph;
    moved.push(node);
    return node;
  }
  function putBack(node) {
    var ph = node.__smPh;
    if (!ph) return;
    if (ph.parentNode) ph.parentNode.replaceChild(node, ph);
    node.__smPh = null;
    var i = moved.indexOf(node);
    if (i >= 0) moved.splice(i, 1);
  }
  // Put everything back. Elements an app added next to a moved node while it was
  // on a slide (e.g. a runnable example's code window) follow that node home.
  function restoreAll() {
    slides.forEach(function (s) {
      var after = null, pending = [];
      Array.prototype.slice.call(s.body.children).forEach(function (n) {
        if (n.__smClone) return;
        if (n.__smPh) {
          putBack(n);
          pending.forEach(function (p) { n.parentNode.insertBefore(p, n); });
          pending = [];
          after = n;
        } else if (after) {
          after.parentNode.insertBefore(n, after.nextSibling);
          after = n;
        } else {
          pending.push(n);
        }
      });
    });
    moved.slice().forEach(putBack);   // split containers and anything left
    moved = [];
  }

  // ───────────── reading the page into groups ─────────────
  function sectionBody(sec) {
    var wrap = $(':scope > .wrap', sec);
    if (!wrap) return null;
    return $(':scope > .fold-body', wrap) || wrap;
  }
  function sectionInfo(id) {
    var sec = document.getElementById(id);
    if (!sec) return null;
    var head = $('.sec-head', sec);
    return {
      sec: sec,
      eyebrow: stripNumber(text(head && $('.eyebrow', head))),
      title: text(head && $('h2', head)),
      intro: head ? $all(':scope > p', head) : []
    };
  }

  function buildGroups() {
    groups = [];
    SECTIONS.forEach(function (id) {
      var info = sectionInfo(id);
      if (!info) return;
      var body = sectionBody(info.sec);
      if (!body) return;
      var run = null;   // consecutive non-concept blocks share a group titled by the section
      function sectionGroup() {
        if (!run) {
          run = { kicker: info.eyebrow, titleHtml: escapeHtml(info.title), titleText: info.title,
                  units: [], section: id, agenda: !groups.some(function (g) { return g.section === id; }) };
          groups.push(run);
        }
        return run;
      }
      if (info.intro.length) {
        var g0 = sectionGroup();
        info.intro.forEach(function (p) {
          var c = p.cloneNode(true);
          c.classList.add('sm-lede');
          c.__smClone = true;
          g0.units.push(c);
        });
      }
      Array.prototype.slice.call(body.children).forEach(function (child) {
        if (child.classList.contains('sec-head') || child.classList.contains('pagenav')) return;
        if (!child.classList.contains('concept')) { sectionGroup().units.push(child); return; }
        run = null;
        var g = null;
        Array.prototype.slice.call(child.children).forEach(function (n) {
          if (n.tagName === 'H3') {
            var idx = $('.idx', n);
            var plain = idx ? text(idx) + ' ' + text(n).slice(text(idx).length).trim() : text(n);
            g = { kicker: info.eyebrow, titleHtml: n.innerHTML, titleText: plain,
                  idx: idx ? text(idx) : '', units: [], section: id,
                  agenda: !!idx || !groups.some(function (x) { return x.section === id; }) };
            groups.push(g);
            return;
          }
          if (!g) g = sectionGroup();
          g.units.push(n);
        });
      });
      run = null;
    });
    groups = groups.filter(function (g) { return g.units.length; });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }

  // ───────────── packing ─────────────
  function newSlide(kind, g) {
    if (slides.length) slides[slides.length - 1].el.classList.remove('sm-cur');
    var el = mk('section', 'sm-slide' + (kind ? ' sm-is-' + kind : ''));
    el.setAttribute('aria-roledescription', 'slide');
    var head = mk('header', 'sm-head');
    var body = mk('div', 'sm-body concept wide');
    el.appendChild(head);
    el.appendChild(body);
    stage.appendChild(el);
    el.classList.add('sm-cur');
    var s = { el: el, head: head, body: body, group: g || null,
              title: g ? g.titleText : '', kicker: g ? g.kicker : '' };
    if (g) {
      head.appendChild(mk('span', 'eyebrow', escapeHtml(g.kicker)));
      head.appendChild(mk('h2', 'sm-title', g.titleHtml));
    }
    slides.push(s);
    return s;
  }
  function overflows(body) { return body.scrollHeight > body.clientHeight + 2; }
  // a heading, or anything that ends with a colon, introduces the block after it: keep them together
  function isLeadIn(n) {
    if (/^H[3-6]$/.test(n.tagName)) return true;
    return !/^(PRE|TABLE|FIGURE|svg)$/i.test(n.tagName) && /:\s*$/.test(n.textContent);
  }
  // A block too tall for an empty slide: which of them can be broken into their children?
  function splitKids(n) {
    var splittable = n.classList.contains('media-row') ||
      (n.tagName === 'DIV' && !n.className && !n.id && n.children.length > 1);
    if (!splittable) return null;
    return Array.prototype.slice.call(n.children);
  }

  function packGroup(g) {
    var s = newSlide('', g);
    var queue = g.units.slice();
    while (queue.length) {
      var u = queue.shift();
      take(u);
      s.body.appendChild(u);
      if (!overflows(s.body)) continue;
      if (s.body.children.length > 1) {
        s.body.removeChild(u); queue.unshift(u);
        var last = s.body.lastElementChild;
        if (s.body.children.length > 1 && isLeadIn(last)) { s.body.removeChild(last); queue.unshift(last); }
        s = newSlide('', g);
        continue;
      }
      var kids = splitKids(u);
      if (kids) {                       // put the wrapper back home, present its children
        s.body.removeChild(u);
        putBack(u);
        queue = kids.concat(queue);
        continue;
      }
      s.el.classList.add('sm-tall');   // one block, taller than the screen: this slide scrolls
      if (queue.length) s = newSlide('', g);
    }
  }

  function coverSlide() {
    var s = newSlide('cover');
    s.title = hero.title; s.kicker = hero.eyebrow;
    var b = s.body;
    b.appendChild(clone(mk('span', 'eyebrow', escapeHtml(hero.eyebrow))));
    b.appendChild(clone(mk('h1', 'sm-cover-title', escapeHtml(hero.title))));
    if (hero.lede) { var l = hero.lede.cloneNode(true); l.className = 'sm-cover-lede'; b.appendChild(clone(l)); }
    b.appendChild(clone(mk('p', 'sm-keys',
      '<kbd>→</kbd> / <kbd>Space</kbd> next · <kbd>←</kbd> back · <kbd>O</kbd> overview · ' +
      '<kbd>F</kbd> full screen · <kbd>+</kbd>/<kbd>−</kbd> text size · <kbd>Esc</kbd> back to the page')));
  }
  function agendaSlide() {
    var items = groups.filter(function (g) { return g.agenda; });
    if (items.length < 2) return;
    var s = newSlide('agenda');
    s.title = 'Outline'; s.kicker = hero.eyebrow;
    s.head.appendChild(mk('span', 'eyebrow', escapeHtml(hero.eyebrow)));
    s.head.appendChild(mk('h2', 'sm-title', 'Outline'));
    var ol = mk('ol', 'sm-agenda');
    items.forEach(function (g) {
      var li = mk('li');
      var btn = mk('button', 'sm-agenda-item');
      btn.type = 'button';
      btn.innerHTML = g.idx ? g.titleHtml : '<span class="idx">' + escapeHtml(g.kicker) + '</span>' + g.titleHtml;
      btn.addEventListener('click', function () { go(firstSlideOf(g)); });
      li.appendChild(btn);
      ol.appendChild(li);
    });
    s.body.appendChild(clone(ol));
  }
  function endSlide() {
    var s = newSlide('end');
    s.title = 'Keep going'; s.kicker = hero.eyebrow;
    s.head.appendChild(mk('span', 'eyebrow', escapeHtml(hero.eyebrow)));
    s.head.appendChild(mk('h2', 'sm-title', 'Keep going on the page'));
    var grid = mk('div', 'sm-end');
    END_LINKS.forEach(function (id) {
      var info = sectionInfo(id);
      if (!info) return;
      var a = mk('a', 'sm-end-card');
      a.href = '#' + id;
      a.innerHTML = '<span class="eyebrow">' + escapeHtml(info.eyebrow) + '</span><strong>' + escapeHtml(info.title) + '</strong>';
      a.addEventListener('click', function (ev) {
        ev.preventDefault();
        exit({ noScroll: true });
        location.hash = '#' + id;
        var sec = document.getElementById(id);
        var head = sec && $('.sec-head.foldable', sec);
        if (head && head.getAttribute('aria-expanded') === 'false') head.click();
        if (sec) sec.scrollIntoView();
      });
      grid.appendChild(a);
    });
    s.body.appendChild(clone(grid));
  }
  function clone(n) { n.__smClone = true; return n; }
  function firstSlideOf(g) {
    for (var i = 0; i < slides.length; i++) if (slides[i].group === g) return i;
    return 0;
  }

  function pack() {
    deck.classList.add('sm-packing');
    stage.innerHTML = '';
    slides = [];
    coverSlide();
    var agendaAt = slides.length;
    groups.forEach(packGroup);
    // the outline needs the groups' slide numbers only for its click handlers, so build it now and slot it in
    var before = slides.length;
    agendaSlide();
    if (slides.length > before) {
      var a = slides.pop();
      stage.insertBefore(a.el, slides[agendaAt] ? slides[agendaAt].el : null);
      slides.splice(agendaAt, 0, a);
    }
    endSlide();
    // number the parts of a concept that needed several slides
    var counts = new Map();
    slides.forEach(function (s) { if (s.group) counts.set(s.group, (counts.get(s.group) || 0) + 1); });
    var seen = new Map();
    slides.forEach(function (s, i) {
      s.el.classList.remove('sm-cur');
      s.el.setAttribute('aria-label', 'Slide ' + (i + 1) + ' of ' + slides.length + (s.title ? ': ' + s.title : ''));
      if (!s.group) return;
      var n = counts.get(s.group);
      if (n < 2) return;
      var k = (seen.get(s.group) || 0) + 1;
      seen.set(s.group, k);
      s.head.querySelector('.sm-title').appendChild(mk('span', 'sm-part', k + '/' + n));
    });
    deck.classList.remove('sm-packing');
    lastSize = window.innerWidth + 'x' + window.innerHeight;
    watchImages();
  }

  // Images that were still loading while packing can change heights: re-pack once they arrive.
  function watchImages() {
    $all('img', stage).forEach(function (img) {
      if (img.complete) return;
      img.loading = 'eager';
      img.addEventListener('load', repackSoon, { once: true });
    });
  }

  // ───────────── navigation ─────────────
  function anchorOf(i) {
    var s = slides[i];
    if (!s) return null;
    for (var n = s.body.firstElementChild; n; n = n.nextElementSibling) if (n.__smPh) return n;
    return null;
  }
  // the slide showing node — or, if node was split up this time, the first piece of it
  function slideHolding(node) {
    var i;
    for (i = 0; i < slides.length; i++) if (slides[i].el.contains(node)) return i;
    for (i = 0; i < slides.length; i++) {
      for (var c = slides[i].body.firstElementChild; c; c = c.nextElementSibling) if (c.__smPh && node.contains(c.__smPh)) return i;
    }
    return -1;
  }

  function go(i, opts) {
    if (!slides.length) return;
    i = Math.max(0, Math.min(slides.length - 1, i));
    if (slides[cur]) slides[cur].el.classList.remove('sm-cur');
    cur = i;
    var s = slides[cur];
    s.el.classList.add('sm-cur');
    if (!(opts && opts.keepScroll)) s.body.scrollTop = 0;
    counter.textContent = (cur + 1) + ' / ' + slides.length;
    progress.style.width = (slides.length > 1 ? (cur / (slides.length - 1)) * 100 : 100) + '%';
    markMore();
    if (on) {
      try { history.replaceState(null, '', location.pathname + location.search + '#slides-' + (cur + 1)); } catch (e) {}
      // apps that size themselves to their container: tell them the box changed
      window.dispatchEvent(new Event('resize'));
    }
    if (overview && !overview.hidden) paintOverview();
  }
  function markMore() {
    var s = slides[cur];
    if (!s) return;
    var b = s.body;
    s.el.classList.toggle('sm-more', b.scrollHeight - b.scrollTop - b.clientHeight > 4);
  }
  // Space / PageDown / ↓ (what presentation clickers send) scroll a tall slide before moving on.
  function forward(scrollFirst) {
    var b = slides[cur] && slides[cur].body;
    if (scrollFirst && b && b.scrollHeight - b.scrollTop - b.clientHeight > 4) {
      b.scrollBy({ top: b.clientHeight * 0.85, behavior: 'smooth' });
      return;
    }
    go(cur + 1);
  }
  function backward(scrollFirst) {
    var b = slides[cur] && slides[cur].body;
    if (scrollFirst && b && b.scrollTop > 4) {
      b.scrollBy({ top: -b.clientHeight * 0.85, behavior: 'smooth' });
      return;
    }
    go(cur - 1);
  }

  var repackTimer = 0;
  function repackSoon() {
    if (!on) return;
    clearTimeout(repackTimer);
    repackTimer = setTimeout(repack, 150);
  }
  function repack() {
    if (!on) return;
    var anchor = anchorOf(cur), at = cur, wasLast = cur === slides.length - 1;
    var scroll = slides[cur] ? slides[cur].body.scrollTop : 0;
    restoreAll();
    buildGroups();
    pack();
    var i = anchor ? slideHolding(anchor) : (wasLast ? slides.length - 1 : Math.min(at, slides.length - 1));
    go(i < 0 ? 0 : i, { keepScroll: true });
    if (slides[cur]) slides[cur].body.scrollTop = scroll;
  }

  // ───────────── overview ─────────────
  function paintOverview() {
    overview.innerHTML = '';
    var head = mk('div', 'sm-ov-head', '<strong>All slides</strong><span>Click one to jump · <kbd>O</kbd> or <kbd>Esc</kbd> to close</span>');
    overview.appendChild(head);
    var grid = mk('div', 'sm-ov-grid');
    slides.forEach(function (s, i) {
      var b = mk('button', 'sm-ov-card' + (i === cur ? ' sm-ov-cur' : ''));
      b.type = 'button';
      var part = s.head.querySelector('.sm-part');
      b.innerHTML = '<span class="sm-ov-n">' + (i + 1) + '</span>' +
        '<span class="sm-ov-k">' + escapeHtml(s.kicker || '') + '</span>' +
        '<span class="sm-ov-t">' + escapeHtml(s.title || '') + (part ? ' <em>' + escapeHtml(part.textContent) + '</em>' : '') + '</span>';
      b.addEventListener('click', function () { toggleOverview(false); go(i); });
      grid.appendChild(b);
    });
    overview.appendChild(grid);
  }
  function toggleOverview(show) {
    if (show == null) show = overview.hidden;
    overview.hidden = !show;
    if (show) {
      paintOverview();
      var c = $('.sm-ov-cur', overview);
      if (c) { c.scrollIntoView({ block: 'center' }); c.focus({ preventScroll: true }); }
    } else if (slides[cur]) {
      deck.focus({ preventScroll: true });
    }
  }

  // ───────────── zoom & full screen ─────────────
  function applyZoom() {
    html.style.setProperty('--sm-zoom', String(zoom));
    if (zoomLabel) zoomLabel.textContent = Math.round(zoom * 100) + '%';
  }
  function stepZoom(d) {
    var i = ZOOMS.indexOf(zoom);
    if (i < 0) i = ZOOMS.indexOf(1);
    var j = Math.max(0, Math.min(ZOOMS.length - 1, i + d));
    if (j === i) return;
    zoom = ZOOMS[j];
    try { localStorage.setItem(ZOOM_KEY, String(zoom)); } catch (e) {}
    applyZoom();
    repack();
  }
  function fsElement() { return document.fullscreenElement || document.webkitFullscreenElement || null; }
  function toggleFullscreen() {
    if (fsElement()) {
      var ex = document.exitFullscreen || document.webkitExitFullscreen;
      if (ex) try { ex.call(document); } catch (e) {}
      return;
    }
    var req = html.requestFullscreen || html.webkitRequestFullscreen;
    if (req) try { var p = req.call(html); if (p && p.catch) p.catch(function () {}); } catch (e) {}
  }
  function paintFs() { if (fsBtn) fsBtn.textContent = fsElement() ? '⤡ Exit full screen' : '⤢ Full screen'; }

  // ───────────── deck chrome ─────────────
  function button(cls, label, title, fn) {
    var b = mk('button', 'sm-btn ' + cls, label);
    b.type = 'button';
    if (title) { b.title = title; b.setAttribute('aria-label', title); }
    b.addEventListener('click', fn);
    return b;
  }
  function buildDeck() {
    deck = mk('div', 'sm-deck');
    deck.setAttribute('role', 'region');
    deck.setAttribute('aria-roledescription', 'slide deck');
    deck.setAttribute('aria-label', hero.title + ' — slides');
    deck.tabIndex = -1;
    stage = mk('div', 'sm-stage');
    stage.setAttribute('aria-live', 'polite');
    deck.appendChild(stage);

    var bar = mk('div', 'sm-bar');
    progress = mk('span', 'sm-progress');
    bar.appendChild(progress);
    bar.appendChild(button('sm-exit', '✕ Exit', 'Back to the page (Esc)', function () { exit(); }));
    bar.appendChild(mk('span', 'sm-name', escapeHtml(hero.short)));
    var nav = mk('div', 'sm-nav');
    nav.appendChild(button('sm-prev', '◀', 'Previous slide (←)', function () { go(cur - 1); }));
    counter = mk('span', 'sm-count');
    nav.appendChild(counter);
    nav.appendChild(button('sm-next', '▶', 'Next slide (→)', function () { go(cur + 1); }));
    bar.appendChild(nav);
    var tools = mk('div', 'sm-tools');
    tools.appendChild(button('sm-ov-btn', '▦ Overview', 'All slides (O)', function () { toggleOverview(); }));
    var zg = mk('div', 'sm-zoom');
    zg.appendChild(button('', 'A−', 'Smaller text (−)', function () { stepZoom(-1); }));
    zoomLabel = mk('span', 'sm-zoom-val');
    zg.appendChild(zoomLabel);
    zg.appendChild(button('', 'A+', 'Larger text (+)', function () { stepZoom(1); }));
    tools.appendChild(zg);
    fsBtn = button('sm-fs', '', 'Full screen (F)', toggleFullscreen);
    tools.appendChild(fsBtn);
    bar.appendChild(tools);
    deck.appendChild(bar);

    overview = mk('div', 'sm-overview');
    overview.hidden = true;
    deck.appendChild(overview);

    document.body.appendChild(deck);
    stage.addEventListener('scroll', markMore, true);
    paintFs();
    applyZoom();
    bindTouch();
  }

  // ───────────── enter / exit ─────────────
  function enter(at) {
    if (on) { if (at != null) go(at); return; }
    if (!deck) buildDeck();
    on = true;
    html.classList.add('sm-on');
    // content inside folds must be laid out to be measured; it leaves the folds anyway
    buildGroups();
    pack();
    go(at == null ? 0 : at);
    deck.focus({ preventScroll: true });
    moreTimer = setInterval(markMore, 600);   // content can grow after packing (a code runner opens, details expand)
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (on) repack(); });
  }
  function exit(opts) {
    if (!on) return;
    var anchor = anchorOf(cur);
    if (!overview.hidden) overview.hidden = true;
    restoreAll();
    stage.innerHTML = '';
    slides = [];
    on = false;
    clearInterval(moreTimer);
    html.classList.remove('sm-on');
    if (fsElement()) toggleFullscreen();
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
    window.dispatchEvent(new Event('resize'));
    if (opts && opts.noScroll) return;
    // land the page where the talk stopped
    var target = anchor || document.getElementById('concepts');
    if (!target) return;
    var sec = target.closest('section.block');
    var head = sec && $('.sec-head.foldable', sec);
    if (head && head.getAttribute('aria-expanded') === 'false') head.click();
    var concept = target.closest('.concept') || target;
    var y = concept.getBoundingClientRect().top + window.scrollY - 72;
    window.scrollTo({ top: Math.max(0, y), behavior: 'instant' });
  }

  // ───────────── input ─────────────
  function typing(t) {
    return t && t.closest && !!t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="slider"], [role="textbox"]');
  }
  function onKey(ev) {
    if (!on || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (html.classList.contains('fs-on')) return;      // an app's own full-screen mode owns the keys
    var t = ev.target;
    if (typing(t)) return;
    var onButton = t && t.closest && t.closest('button, a, summary');
    var k = ev.key;
    if (!overview.hidden) {
      if (k === 'Escape' || k === 'o' || k === 'O') { ev.preventDefault(); toggleOverview(false); }
      return;
    }
    switch (k) {
      case 'ArrowRight': ev.preventDefault(); go(cur + 1); break;
      case 'ArrowLeft': ev.preventDefault(); go(cur - 1); break;
      case 'PageDown': case 'ArrowDown': ev.preventDefault(); forward(true); break;
      case 'PageUp': case 'ArrowUp': ev.preventDefault(); backward(true); break;
      case ' ':
        if (onButton) return;
        ev.preventDefault();
        if (ev.shiftKey) backward(true); else forward(true);
        break;
      case 'Home': ev.preventDefault(); go(0); break;
      case 'End': ev.preventDefault(); go(slides.length - 1); break;
      case 'o': case 'O': ev.preventDefault(); toggleOverview(true); break;
      case 'f': case 'F': ev.preventDefault(); toggleFullscreen(); break;
      case '+': case '=': ev.preventDefault(); stepZoom(1); break;
      case '-': case '_': ev.preventDefault(); stepZoom(-1); break;
      case 'Escape':
        if (fsElement() || document.querySelector('dialog[open]')) return;
        ev.preventDefault(); exit(); break;
    }
  }
  function bindTouch() {
    var x0 = null, y0 = 0, t0 = 0;
    var SKIP = 'input, textarea, select, button, a, canvas, svg, .code-card, .tbl-scroll, [data-na-app], .example-runner, .sm-bar';
    deck.addEventListener('touchstart', function (ev) {
      if (ev.touches.length !== 1 || (ev.target.closest && ev.target.closest(SKIP))) { x0 = null; return; }
      x0 = ev.touches[0].clientX; y0 = ev.touches[0].clientY; t0 = Date.now();
    }, { passive: true });
    deck.addEventListener('touchend', function (ev) {
      if (x0 == null) return;
      var dx = ev.changedTouches[0].clientX - x0, dy = ev.changedTouches[0].clientY - y0;
      x0 = null;
      if (Date.now() - t0 > 800 || Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) * 0.6) return;
      if (dx < 0) go(cur + 1); else go(cur - 1);
    });
  }

  function readHash() {
    var m = /^#slides(?:-(\d+))?$/.exec(location.hash);
    return m ? (m[1] ? parseInt(m[1], 10) - 1 : 0) : null;
  }

  function init() {
    var heroEl = $('.ch-hero');
    if (!heroEl || !document.getElementById('concepts')) return;   // chapter pages only
    var eyebrow = text($('.eyebrow', heroEl));
    hero = {
      eyebrow: eyebrow,
      title: text($('h1', heroEl)),
      lede: $('.lede', heroEl),
      short: eyebrow.split('·')[0].trim() + ' · ' + text($('h1', heroEl))
    };

    var tools = $('.topbar-tools');
    if (tools) {
      var open = mk('button', 'icon-btn sm-open', '▶ Slides');
      open.type = 'button';
      open.title = 'Present this lecture as slides';
      open.addEventListener('click', function () { enter(0); });
      tools.insertBefore(open, tools.firstChild);
    }
    var chips = $('.meta-chips', heroEl);
    if (chips) {
      var chip = mk('button', 'chip sm-chip', '▶ Present as slides');
      chip.type = 'button';
      chip.addEventListener('click', function () { enter(0); });
      chips.insertBefore(chip, chips.firstChild);
    }

    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', function () {
      if (on && window.innerWidth + 'x' + window.innerHeight !== lastSize) repackSoon();
    });
    document.addEventListener('fullscreenchange', paintFs);
    document.addEventListener('webkitfullscreenchange', paintFs);
    window.addEventListener('hashchange', function () {
      var i = readHash();
      if (i != null) enter(i);
    });
    var start = readHash();
    if (start != null) enter(start);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
