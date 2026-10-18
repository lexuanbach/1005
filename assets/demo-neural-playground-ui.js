/* Draw & Teach a Brain — page controller (canvas, SVG diagram, curves, scenarios). Engine: demo-neural-playground.js */
(function () {
  'use strict';
  var NP = window.NeuralPlayground;
  if (!NP) return;
  var $ = function (id) { return document.getElementById(id); };
  var root = $('np-root'), cv = $('np-canvas'), ctx = cv.getContext('2d');
  var SHAPES = ['●', '■', '▲'], SHAPE_NAMES = ['circle', 'square', 'triangle'];
  var EPS = [8, 30, 120, 500];
  var MAX_LAYERS = 3, MAX_N = 8, MAX_PTS = 800;
  var SCEN = {
    sandbox: { kind: 'moons', K: 2, noise: 0.1, n: 200, testPct: 25, hidden: [4], act: 'tanh', opt: 'adam', lr: 0.03, netSeed: 1, trainSeed: 1, speed: 1 },
    memorise: { kind: NP.MEMORISE.kind, K: 2, noise: NP.MEMORISE.noise, n: NP.MEMORISE.n, testPct: 50, hidden: NP.MEMORISE.hidden, act: 'tanh', opt: 'adam', lr: NP.MEMORISE.lr, netSeed: NP.MEMORISE.netSeed, trainSeed: NP.MEMORISE.trainSeed, speed: 2, dataSeed: NP.MEMORISE.seed, splitSeed: NP.MEMORISE.splitSeed },
    lr: { kind: 'blobs', K: 2, noise: NP.LR.noise, n: NP.LR.n, testPct: 25, hidden: NP.LR.hidden, act: 'tanh', opt: 'sgd', lr: NP.LR.bad, netSeed: NP.LR.netSeed, trainSeed: NP.LR.trainSeed, speed: 1, dataSeed: NP.LR.seed, splitSeed: NP.LR.splitSeed },
    bias: { kind: 'bias', K: 2, noise: 0, n: NP.BIAS.n, testPct: 25, hidden: NP.BIAS.hidden, act: 'tanh', opt: 'adam', lr: NP.BIAS.lr, netSeed: NP.BIAS.netSeed, trainSeed: NP.BIAS.trainSeed, speed: 2, dataSeed: NP.BIAS.seed, splitSeed: NP.BIAS.splitSeed, l2: NP.BIAS.l2 },
    challenge: { kind: 'spiral', K: 2, noise: NP.CHALLENGE.noise, n: NP.CHALLENGE.n, testPct: 30, hidden: [4], act: 'tanh', opt: 'adam', lr: NP.CHALLENGE.lr, netSeed: NP.CHALLENGE.netSeed, trainSeed: NP.CHALLENGE.trainSeed, speed: 2, dataSeed: NP.CHALLENGE.seed, splitSeed: NP.CHALLENGE.splitSeed }
  };

  var S = {
    scen: 'sandbox', kind: 'moons', K: 2, noise: 0.1, n: 200, testPct: 25, dataSeed: 3, splitSeed: 7, hidden: [4], act: 'tanh', opt: 'adam', lr: 0.03,
    speed: 1, netSeed: 1, trainSeed: 1, l2: 0, net: null, T: null, running: false, tool: '0', probes: [], hover: null, kb: { x: 0, y: 0 },
    pts: [], dirty: true, needTrainer: false, biasShare: NP.BIAS.minority, audit: null, auditAt: -1, solved: null, ended: false, lastAnnounce: 0, acc: 0,
    big: false, curveAt: 0, statAt: 0
  };
  var paintRng = NP.rng(2024);
  var auditSet = NP.biasAudit(NP.BIAS.auditSeed, 100);

  /* ---------- helpers ---------- */
  var statusEl = $('np-status'), lastStatus = '';
  function say(t) { if (t !== lastStatus) { statusEl.textContent = t; lastStatus = t; } }
  function pct(v) { return isNaN(v) ? '–' : Math.round(v * 100) + '%'; }
  function f2(v) { return isNaN(v) ? '–' : (v >= 100 ? v.toFixed(0) : v.toFixed(2)); }
  function hex(c) { c = (c || '').trim(); if (c[0] !== '#') return [128, 128, 128]; if (c.length === 4) c = '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3]; return [parseInt(c.substr(1, 2), 16), parseInt(c.substr(3, 2), 16), parseInt(c.substr(5, 2), 16)]; }
  var PAL = null, palKey = '';
  function palette() {
    var key = (document.documentElement.getAttribute('data-theme') || '') + (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    if (PAL && key === palKey) return PAL;
    var cs = getComputedStyle(root), bs = getComputedStyle(document.documentElement);
    function g(n, s) { return (s || cs).getPropertyValue(n).trim(); }
    PAL = {
      cls: [g('--c0'), g('--c1'), g('--c2')], rgb: [hex(g('--c0')), hex(g('--c1')), hex(g('--c2'))],
      bg: g('--surface', bs), bgRgb: hex(g('--surface', bs)), ink: g('--ink', bs), soft: g('--ink-soft', bs), line: g('--line', bs),
      pos: g('--teal', bs), neg: g('--neg'), red: g('--red', bs)
    };
    palKey = key; return PAL;
  }

  /* ---------- data and network lifecycle ---------- */
  function regenData() {
    var d;
    if (S.kind === 'bias') {
      d = NP.biasDataset({ n: S.n, minority: S.biasShare, seed: S.dataSeed });
    } else if (S.kind === 'blank' || S.kind === 'custom') {
      d = { points: [], classes: S.K };
    } else {
      d = NP.makeDataset(S.kind, { n: S.n, noise: S.noise, seed: S.dataSeed, classes: S.K });
    }
    S.pts = d.points; S.K = d.classes;
    NP.splitTest(S.pts, S.testPct / 100, S.splitSeed);
    S.probes = []; S.solved = null; S.ended = false;
    rebuildNet();
  }
  function rebuildNet() {
    S.net = NP.createNet({ hidden: S.hidden, outputs: S.K, act: S.act, seed: S.netSeed });
    S.running = S.running && canTrain();
    rebuildTrainer(true);
    buildDiagram(); syncControls(); S.dirty = true; S.solved = null; S.ended = false; S.audit = null; S.lastAnnounce = 0; S.histSeen = 0;
  }
  function rebuildTrainer(clear) {
    var old = S.T;
    var T = NP.makeTrainer(S.net, S.pts, { opt: S.opt, lr: S.lr, batch: 32, seed: S.trainSeed, l2: S.l2 });
    if (!clear && old) { T.history = old.history; T.epoch = old.epoch; }
    S.T = T; S.needTrainer = false;
  }
  function classesPresent() {
    var seen = {}, n = 0;
    S.pts.forEach(function (p) { if (!p.t && !seen[p.c]) { seen[p.c] = 1; n++; } });
    return n;
  }
  function canTrain() { return S.pts.length > 0 && classesPresent() >= 2; }

  /* ---------- painting ---------- */
  function addDots(x, y, c, count) {
    var i, px, py;
    for (i = 0; i < count && S.pts.length < MAX_PTS; i++) {
      px = Math.max(-0.98, Math.min(0.98, x + 0.045 * paintRng.gauss()));
      py = Math.max(-0.98, Math.min(0.98, y + 0.045 * paintRng.gauss()));
      S.pts.push({ x: px, y: py, c: c, t: paintRng.next() < S.testPct / 100 });
    }
    if (c >= S.K) { S.K = c + 1; S.kind = 'custom'; S.needTrainer = false; S.dirty = true; rebuildNet(); say('A third colour was added, so the network got a third output neuron and a fresh start.'); return; }
    if (S.kind !== 'custom' && S.kind !== 'blank') S.kind = 'custom';
    S.needTrainer = true; S.dirty = true; syncControls();
  }
  function eraseAt(x, y) {
    var before = S.pts.length;
    S.pts = S.pts.filter(function (p) { var dx = p.x - x, dy = p.y - y; return dx * dx + dy * dy > 0.011; });
    if (S.pts.length !== before) { if (S.kind !== 'custom' && S.kind !== 'blank') S.kind = 'custom'; S.needTrainer = true; S.dirty = true; syncControls(); }
  }
  function addProbe(x, y) {
    var pr = S.net.predict(x, y);
    S.probes.push({ x: x, y: y });
    if (S.probes.length > 60) S.probes.shift();
    S.dirty = true;
    say('Probe ' + S.probes.length + ': the frozen brain says class ' + (pr.c + 1) + ' (' + SHAPE_NAMES[pr.c] + '), ' + pct(pr.conf) + ' sure. No weights changed: that is inference.');
  }
  function locked() { return S.scen === 'bias' || S.scen === 'challenge'; }
  function toData(ev) {
    var r = cv.getBoundingClientRect();
    return { x: ((ev.clientX - r.left) / r.width) * 2 - 1, y: 1 - ((ev.clientY - r.top) / r.height) * 2 };
  }
  var painting = false, lastProbe = null;
  function applyTool(pt, drag) {
    var t = S.tool;
    if (t === 'predict') {
      if (drag && lastProbe && Math.hypot(pt.x - lastProbe.x, pt.y - lastProbe.y) < 0.09) return;
      lastProbe = pt; addProbe(pt.x, pt.y);
    } else if (locked() || t === 'look') {
      return;
    } else if (t === 'erase') {
      eraseAt(pt.x, pt.y);
    } else {
      addDots(pt.x, pt.y, +t, drag ? 1 : 3);
    }
  }
  cv.addEventListener('pointerdown', function (ev) {
    ev.preventDefault(); cv.focus({ preventScroll: true });
    try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
    painting = true; lastProbe = null; applyTool(toData(ev), false);
  });
  cv.addEventListener('pointermove', function (ev) {
    var pt = toData(ev); S.hover = pt; S.hoverDirty = true; S.dirty = true;
    if (painting) applyTool(pt, true);
  });
  cv.addEventListener('pointerup', function () { painting = false; });
  cv.addEventListener('pointercancel', function () { painting = false; });
  cv.addEventListener('pointerleave', function () { if (!painting) { S.hover = null; S.hoverDirty = true; S.dirty = true; } });
  cv.addEventListener('keydown', function (ev) {
    var k = ev.key, st = 0.05, used = true;
    if (k === 'ArrowLeft') S.kb.x = Math.max(-0.95, S.kb.x - st);
    else if (k === 'ArrowRight') S.kb.x = Math.min(0.95, S.kb.x + st);
    else if (k === 'ArrowUp') S.kb.y = Math.min(0.95, S.kb.y + st);
    else if (k === 'ArrowDown') S.kb.y = Math.max(-0.95, S.kb.y - st);
    else if (k === 'Enter' || k === ' ') { lastProbe = null; applyTool({ x: S.kb.x, y: S.kb.y }, false); }
    else if (k === 'Delete' || k === 'Backspace') { if (!locked()) eraseAt(S.kb.x, S.kb.y); }
    else used = false;
    if (used) { ev.preventDefault(); S.hover = { x: S.kb.x, y: S.kb.y }; S.hoverDirty = true; S.dirty = true; }
  });
  cv.addEventListener('focus', function () { S.dirty = true; });
  cv.addEventListener('blur', function () { S.dirty = true; });

  /* ---------- drawing: board ---------- */
  var heat = document.createElement('canvas'); heat.width = heat.height = 64;
  var hctx = heat.getContext('2d');
  function drawHeat(W, H, P) {
    var res = 64, K = S.K, g = NP.gridProbs(S.net, res), img = hctx.createImageData(res, res), d = img.data, i, k, m, a, r0, r1, r2, pm;
    for (i = 0; i < res * res; i++) {
      pm = 0; r0 = r1 = r2 = 0;
      for (k = 0; k < K; k++) { m = g[i * K + k]; if (m > pm) pm = m; r0 += m * P.rgb[k][0]; r1 += m * P.rgb[k][1]; r2 += m * P.rgb[k][2]; }
      a = 0.16 + 0.56 * Math.pow(Math.max(0, (pm - 1 / K) / (1 - 1 / K)), 0.85);
      d[i * 4] = P.bgRgb[0] * (1 - a) + r0 * a; d[i * 4 + 1] = P.bgRgb[1] * (1 - a) + r1 * a; d[i * 4 + 2] = P.bgRgb[2] * (1 - a) + r2 * a; d[i * 4 + 3] = 255;
    }
    hctx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(heat, 0, 0, W, H);
  }
  function shapePath(c, x, y, r) {
    ctx.beginPath();
    if (c === 0) ctx.arc(x, y, r, 0, 6.2832);
    else if (c === 1) ctx.rect(x - r * 0.88, y - r * 0.88, r * 1.76, r * 1.76);
    else { ctx.moveTo(x, y - r * 1.1); ctx.lineTo(x + r * 1.05, y + r * 0.85); ctx.lineTo(x - r * 1.05, y + r * 0.85); ctx.closePath(); }
  }
  function drawBoard() {
    var P = palette(), W = cv.width, H = cv.height, u = W / 640, i, p, x, y;
    drawHeat(W, H, P);
    ctx.strokeStyle = P.line; ctx.lineWidth = 1 * u; ctx.setLineDash([4 * u, 5 * u]);
    ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke(); ctx.setLineDash([]);
    if (S.kind === 'bias') {
      ctx.font = '600 ' + 15 * u + 'px "Be Vietnam Pro", sans-serif'; ctx.fillStyle = P.soft; ctx.textAlign = 'center';
      ctx.fillText('Village A (majority)', W * 0.25, 52 * u); ctx.fillText('Village B (minority, dark outline)', W * 0.75, 52 * u);
    }
    var r = 5.2 * u;
    for (i = 0; i < S.pts.length; i++) {
      p = S.pts[i]; x = (p.x + 1) / 2 * W; y = (1 - p.y) / 2 * H;
      shapePath(p.c, x, y, r);
      if (p.t) {
        ctx.fillStyle = P.bg; ctx.globalAlpha = 0.55; ctx.fill(); ctx.globalAlpha = 1;
        ctx.lineWidth = 2.6 * u; ctx.strokeStyle = P.cls[p.c]; ctx.stroke();
      } else {
        ctx.fillStyle = P.cls[p.c]; ctx.fill();
        ctx.lineWidth = (p.g === 'B' ? 2.2 : 1.3) * u; ctx.strokeStyle = p.g === 'B' ? P.ink : P.bg; ctx.stroke();
      }
    }
    for (i = 0; i < S.probes.length; i++) {
      p = S.probes[i]; x = (p.x + 1) / 2 * W; y = (1 - p.y) / 2 * H;
      var pr = S.net.predict(p.x, p.y);
      ctx.beginPath(); ctx.arc(x, y, 11 * u, 0, 6.2832); ctx.fillStyle = P.bg; ctx.fill(); ctx.lineWidth = 2.5 * u; ctx.strokeStyle = P.ink; ctx.stroke();
      shapePath(pr.c, x, y, 5.5 * u); ctx.fillStyle = P.cls[pr.c]; ctx.fill();
    }
    if (document.activeElement === cv) {
      x = (S.kb.x + 1) / 2 * W; y = (1 - S.kb.y) / 2 * H;
      ctx.strokeStyle = P.ink; ctx.lineWidth = 2 * u; ctx.beginPath();
      ctx.moveTo(x - 12 * u, y); ctx.lineTo(x + 12 * u, y); ctx.moveTo(x, y - 12 * u); ctx.lineTo(x, y + 12 * u); ctx.stroke();
    }
  }

  /* ---------- drawing: curves ---------- */
  function sizeCanvases() {
    var dpr = Math.min(2, window.devicePixelRatio || 1), w = Math.max(280, Math.round(cv.clientWidth * dpr));
    if (cv.width !== w) { cv.width = w; cv.height = w; }
    ['np-curve-loss', 'np-curve-acc'].forEach(function (id) {
      var c = $(id), cw = Math.max(280, Math.round(c.clientWidth * dpr));
      if (c.width !== cw) { c.width = cw; c.height = Math.round(cw * 150 / 560); }
    });
    S.dirty = true;
  }
  function drawCurve(c, key, o) {
    var h = S.T ? S.T.history : [], P = palette(), g = c.getContext('2d'), W = c.width, H = c.height, u = W / 560;
    var padL = 38 * u, padB = 18 * u, padT = 8 * u, padR = 8 * u, i, hi = o.max, lo = o.min || 0, maxE = Math.max(10, S.T ? S.T.epoch : 10);
    g.clearRect(0, 0, W, H); g.fillStyle = P.bg; g.fillRect(0, 0, W, H);
    if (o.auto) {
      var win = h, mx = 0;
      win.forEach(function (e) { ['train', 'test'].forEach(function (s) { var v = e[s + key]; if (isFinite(v) && v > mx) mx = v; }); });
      hi = Math.min(30, Math.max(1.2, mx * 1.08));
    }
    var first = 0, e0 = h.length ? h[first].epoch : 0, span = Math.max(10, maxE - e0);
    function X(e) { return padL + (e - e0) / span * (W - padL - padR); }
    function Y(v) { return padT + (1 - (Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * (H - padT - padB); }
    g.font = (10 * u) + 'px "IBM Plex Mono", monospace'; g.fillStyle = P.soft; g.strokeStyle = P.line; g.lineWidth = 1 * u; g.textAlign = 'right';
    [0, 0.5, 1].forEach(function (f) {
      var v = lo + (hi - lo) * f, yy = Y(v);
      g.beginPath(); g.moveTo(padL, yy); g.lineTo(W - padR, yy); g.stroke(); g.fillText(o.pct ? Math.round(v * 100) + '%' : v.toFixed(1), padL - 4 * u, yy + 3 * u);
    });
    g.textAlign = 'left'; g.fillText(o.label + '  (epoch ' + e0 + ' to ' + maxE + ')', padL + 2 * u, H - 4 * u);
    if (o.ref != null) { g.setLineDash([2 * u, 3 * u]); g.strokeStyle = P.pos; g.beginPath(); g.moveTo(padL, Y(o.ref)); g.lineTo(W - padR, Y(o.ref)); g.stroke(); g.setLineDash([]); }
    [['train', P.pos, []], ['test', P.cls[1], [6 * u, 4 * u]]].forEach(function (s) {
      g.beginPath(); g.strokeStyle = s[1]; g.lineWidth = 2.2 * u; g.setLineDash(s[2]);
      var started = false;
      for (i = first; i < h.length; i++) {
        var v = h[i][s[0] + key]; if (!isFinite(v)) continue;
        if (!started) { g.moveTo(X(h[i].epoch), Y(v)); started = true; } else g.lineTo(X(h[i].epoch), Y(v));
      }
      g.stroke(); g.setLineDash([]);
    });
    if (o.auto && h.length) { /* mark clipped values */
      var lastV = h[h.length - 1].trainLoss;
      if (lastV > hi) { g.fillStyle = P.red; g.textAlign = 'right'; g.fillText('off the chart', W - padR - 2 * u, padT + 10 * u); }
    }
  }

  /* ---------- drawing: network diagram ---------- */
  var NS = 'http://www.w3.org/2000/svg', svg = $('np-net'), edges = [], nodes = [], VBW = 420, VBH = 260;
  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name), k;
    for (k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e); return e;
  }
  function buildDiagram() {
    var net = S.net, sizes = net.sizes, L = sizes.length, xs = [], l, j, i;
    svg.innerHTML = ''; edges = []; nodes = [];
    for (l = 0; l < L; l++) xs.push(46 + l * (VBW - 92) / Math.max(1, L - 1));
    function ypos(l, j) { var n = sizes[l]; return n === 1 ? VBH / 2 : 22 + j * (VBH - 44) / (n - 1); }
    var gE = el('g', {}, svg), gN = el('g', {}, svg), gT = el('g', {}, svg);
    for (l = 0; l < L - 1; l++) for (j = 0; j < sizes[l + 1]; j++) for (i = 0; i < sizes[l]; i++) {
      edges.push({ l: l, j: j, i: i, e: el('line', { x1: xs[l], y1: ypos(l, i), x2: xs[l + 1], y2: ypos(l + 1, j), 'stroke-linecap': 'round' }, gE) });
    }
    for (l = 0; l < L; l++) {
      nodes.push([]);
      for (j = 0; j < sizes[l]; j++) {
        var c = el('circle', { cx: xs[l], cy: ypos(l, j), r: sizes[l] > 6 ? 9 : 11, 'class': 'node' }, gN);
        c.style.fill = 'var(--surface)';
        nodes[l].push(c);
        if (l === 0) { var t = el('text', { x: xs[l] - 20, y: ypos(l, j) + 4, 'text-anchor': 'end' }, gT); t.textContent = j === 0 ? 'x' : 'y'; }
        if (l === L - 1) { var t2 = el('text', { x: xs[l] + 18, y: ypos(l, j) + 5 }, gT); t2.textContent = SHAPES[j]; t2.style.fill = palette().cls[j]; t2.setAttribute('class', 'outlab'); t2.setAttribute('data-c', j); }
      }
    }
    $('np-weights').textContent = net.nParams + ' weights to learn';
    updateDiagram(true);
  }
  function updateDiagram(weights) {
    var net = S.net, P = palette(), w = net.params, i, e, v;
    if (weights) {
      for (i = 0; i < edges.length; i++) {
        e = edges[i]; v = w[net.wOff[e.l] + e.j * net.sizes[e.l] + e.i];
        e.e.setAttribute('stroke-width', (0.35 + Math.min(4.6, Math.abs(v) * 1.7)).toFixed(2));
        e.e.setAttribute('stroke', v >= 0 ? P.pos : P.neg);
        e.e.setAttribute('stroke-opacity', (0.28 + 0.6 * Math.min(1, Math.abs(v) / 1.4)).toFixed(2));
      }
      Array.prototype.forEach.call(svg.querySelectorAll('.outlab'), function (t) { t.style.fill = P.cls[+t.getAttribute('data-c')]; });
    }
    var h = S.hover, l, j, a, base;
    if (!h) { nodes.forEach(function (layer) { layer.forEach(function (n) { n.style.fill = 'var(--surface)'; }); }); return; }
    var pr = net.predict(h.x, h.y), hid = net.hiddenAt(h.x, h.y);
    nodes[0][0].style.fill = 'color-mix(in srgb, ' + (h.x >= 0 ? P.pos : P.neg) + ' ' + Math.round(Math.min(1, Math.abs(h.x)) * 85) + '%, var(--surface))';
    nodes[0][1].style.fill = 'color-mix(in srgb, ' + (h.y >= 0 ? P.pos : P.neg) + ' ' + Math.round(Math.min(1, Math.abs(h.y)) * 85) + '%, var(--surface))';
    for (l = 0; l < hid.length; l++) for (j = 0; j < hid[l].length; j++) {
      a = hid[l][j]; base = a >= 0 ? P.pos : P.neg;
      nodes[l + 1][j].style.fill = 'color-mix(in srgb, ' + base + ' ' + Math.round(Math.min(1, Math.abs(a) / (net.act === 'relu' ? 2 : 1)) * 90) + '%, var(--surface))';
    }
    var last = nodes[nodes.length - 1];
    for (j = 0; j < last.length; j++) last[j].style.fill = 'color-mix(in srgb, ' + P.cls[j] + ' ' + Math.round(pr.p[j] * 100) + '%, var(--surface))';
  }

  /* ---------- readouts ---------- */
  function updateStats(force) {
    var now = performance.now();
    if (!force && now - S.statAt < 90) return;
    S.statAt = now;
    var T = S.T, ev = T.evaluate(), gap = ev.trainAcc - ev.testAcc;
    var cells = [['Epoch', T.epoch], ['Train acc', pct(ev.trainAcc)], ['Test acc', pct(ev.testAcc)], ['Gap', isNaN(gap) ? '–' : Math.round(gap * 100) + ' pts'],
      ['Train loss', f2(ev.trainLoss)], ['Test loss', f2(ev.testLoss)], ['Steps', T.steps], ['Dots', T.train.length + ' + ' + T.test.length]];
    $('np-stats').innerHTML = cells.map(function (c) { return '<div class="np-stat"><small>' + c[0] + '</small><b>' + c[1] + '</b></div>'; }).join('');
    var v = $('np-verdict');
    if (!T.epoch) { v.className = 'np-verdict'; v.textContent = canTrain() ? 'Not trained yet. Press Train.' : 'Paint at least two colours of training dots, or pick a shape.'; }
    else { var vd = NP.verdict(ev.trainAcc, ev.testAcc); v.className = 'np-verdict ' + vd.level; v.textContent = vd.text; }
    S.ev = ev;
    updateBadge();
    updateExtra(ev);
  }
  function updateBadge() {
    var b = $('np-badge'), t;
    if (S.tool === 'predict') { t = 'Inference: weights frozen'; b.className = 'np-badge frozen'; }
    else if (S.running) { t = 'Training: weights changing'; b.className = 'np-badge training'; }
    else { t = 'Paused'; b.className = 'np-badge'; }
    if (b.textContent !== t) b.textContent = t;
  }
  function bar(label, v, low) {
    return '<div class="np-bar"><span>' + label + '</span><div class="track"><div class="fill' + (low ? ' low' : '') + '" style="width:' + Math.round((isNaN(v) ? 0 : v) * 100) + '%"></div></div><b>' + pct(v) + '</b></div>';
  }
  function extraStatic() {
    if (S.scen === 'bias') return '<label class="np-sl"><span>Share of Village B in the training sample <output id="o-share">' + Math.round(S.biasShare * 100) + '%</output></span><input type="range" id="i-share" min="2" max="50" step="1" value="' + Math.round(S.biasShare * 100) + '"></label><p class="np-cap">The real world is 50 / 50. Moving the slider collects more data from B and restarts the brain.</p>';
    return '';
  }
  function setupExtra() {
    var ex = $('np-extra'), st = extraStatic();
    var has = S.scen === 'memorise' || S.scen === 'bias' || S.scen === 'challenge';
    ex.hidden = !has; ex.innerHTML = has ? '<div id="np-x-dyn"></div>' + st : '';
    var sl = $('i-share');
    if (sl) sl.addEventListener('input', function () {
      S.biasShare = +sl.value / 100; $('o-share').textContent = sl.value + '%';
      clearTimeout(setupExtra.t); setupExtra.t = setTimeout(function () { regenData(); say('Training sample now has ' + sl.value + '% from Village B. The brain restarted; press Train.'); }, 120);
    });
  }
  function updateExtra(ev) {
    var dyn = $('np-x-dyn'), html = '';
    if (!dyn) return;
    if (S.scen === 'memorise') {
      html = '<h3>Training versus inference</h3>' + bar('Training dots', ev.trainAcc) + bar('Test dots', ev.testAcc, ev.trainAcc - ev.testAcc > 0.15) +
        '<p class="np-cap">The brain only ever learns from the filled dots. The hollow ones are its exam. Watch the dashed test-loss line: it falls, then turns upward while the training loss keeps falling.</p>';
    } else if (S.scen === 'bias') {
      if (S.auditAt !== S.T.epoch || !S.audit) { S.audit = NP.groupAccuracy(S.net, auditSet); S.auditAt = S.T.epoch; }
      var g = S.audit, gap = g.A - g.B;
      html = '<h3>Fairness readout <span class="np-sub">on a fair audit set: 100 + 100 new applicants</span></h3>' +
        bar('Overall test dots', ev.testAcc) + bar('Village A audit', g.A) + bar('Village B audit', g.B, g.B < 0.8) +
        '<p class="np-verdict ' + (!S.T.epoch ? '' : (gap > 0.2 ? 'over' : 'ok')) + '">' +
        (!S.T.epoch ? 'Press Train to see who the model works for.' : gap > 0.2 ? 'Unfair: ' + Math.round(gap * 100) + ' points worse for Village B, even though the overall test number looks excellent.' : 'Roughly fair: the two villages are treated alike (gap ' + Math.round(Math.abs(gap) * 100) + ' points).') + '</p>';
    } else if (S.scen === 'challenge') {
      var C = NP.CHALLENGE, n = S.net.hiddenNeurons, best = readBest();
      html = '<h3>Challenge <span class="np-sub">spiral, aim for 95% on the hollow test dots</span></h3>' +
        bar('Test accuracy', ev.testAcc) +
        '<div class="np-bar"><span>Epoch budget</span><div class="track"><div class="fill" style="width:' + Math.min(100, Math.round(100 * S.T.epoch / C.maxEpochs)) + '%"></div></div><b>' + S.T.epoch + '/' + C.maxEpochs + '</b></div>' +
        '<p>Hidden neurons used: <b>' + n + '</b> · par: <b>' + C.par + '</b> · your best: <b>' + (best ? best : 'none yet') + '</b></p>' +
        (S.solved ? '<p class="np-medal">' + medal(S.solved.n) + ' Solved with ' + S.solved.n + ' neurons at epoch ' + S.solved.epoch + '.</p>' : S.ended ? '<p class="np-verdict under">Out of epochs without reaching 95%. Change the layout and try again.</p>' : '') +
        '<p class="np-cap">Rules: only the layout of hidden layers may change (data, tanh, Adam and the learning rate are locked). Fewer neurons is better. With this seed, no layout of 5 or fewer neurons reaches 95% in 600 epochs, and a 6-neuron layout does.</p>';
    }
    if (dyn.dataset.last !== html) { dyn.innerHTML = html; dyn.dataset.last = html; }
  }
  function medal(n) { return n <= NP.CHALLENGE.par ? 'Gold (par or better).' : n <= 9 ? 'Silver.' : n <= 16 ? 'Bronze.' : 'Done.'; }
  function readBest() { try { return +localStorage.getItem('np-challenge-best') || 0; } catch (e) { return 0; } }
  function writeBest(n) { try { var b = readBest(); if (!b || n < b) localStorage.setItem('np-challenge-best', String(n)); } catch (e) { /* no storage */ } }
  /* ---------- controls <-> state ---------- */
  function syncControls() {
    var q = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };
    q('[data-kind]').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.kind === S.kind ? 'true' : 'false'); });
    q('[data-k]').forEach(function (b) { b.setAttribute('aria-pressed', +b.dataset.k === S.K ? 'true' : 'false'); });
    q('[data-act]').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.act === S.act ? 'true' : 'false'); });
    q('[data-opt]').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.opt === S.opt ? 'true' : 'false'); });
    q('[data-tool]').forEach(function (b) { b.setAttribute('aria-checked', b.dataset.tool === S.tool ? 'true' : 'false'); });
    q('[data-scen]').forEach(function (b) { b.setAttribute('aria-checked', b.dataset.scen === S.scen ? 'true' : 'false'); });
    $('i-noise').value = S.noise; $('o-noise').textContent = S.noise.toFixed(2);
    $('i-n').value = S.n; $('o-n').textContent = S.n;
    $('i-test').value = S.testPct; $('o-test').textContent = S.testPct + '%';
    $('i-lr').value = Math.log10(S.lr).toFixed(2); $('o-lr').textContent = fmtLr(S.lr);
    $('i-speed').value = S.speed; $('o-speed').textContent = EPS[S.speed] + ' epochs/s';
    $('v-layers').textContent = S.hidden.length;
    $('b-layer-minus').disabled = S.hidden.length === 0; $('b-layer-plus').disabled = S.hidden.length >= MAX_LAYERS;
    var rows = $('np-layer-rows'); rows.innerHTML = '';
    S.hidden.forEach(function (n, i) {
      var d = document.createElement('div'); d.className = 'np-row np-layer-row';
      d.innerHTML = '<span class="np-lab">Layer ' + (i + 1) + '</span><button type="button" class="btn ghost small" aria-label="Fewer neurons in layer ' + (i + 1) + '">−</button><b>' + n + '</b><button type="button" class="btn ghost small" aria-label="More neurons in layer ' + (i + 1) + '">+</button>';
      var bt = d.querySelectorAll('button');
      bt[0].disabled = n <= 1; bt[1].disabled = n >= MAX_N;
      bt[0].onclick = function () { S.hidden[i] = Math.max(1, S.hidden[i] - 1); archChanged(); };
      bt[1].onclick = function () { S.hidden[i] = Math.min(MAX_N, S.hidden[i] + 1); archChanged(); };
      rows.appendChild(d);
    });
    var tot = S.hidden.reduce(function (a, b) { return a + b; }, 0);
    $('np-arch-hint').textContent = S.hidden.length === 0
      ? 'No hidden layer: the output is a straight-line (linear) classifier. It cannot separate spirals, rings or XOR.'
      : tot + ' hidden neuron' + (tot === 1 ? '' : 's') + ' in ' + S.hidden.length + ' layer' + (S.hidden.length === 1 ? '' : 's') + '. More layers and neurons can bend the boundary more, and can also memorise noise.';
    var shs = $('i-share'); if (shs) { shs.value = Math.round(S.biasShare * 100); $('o-share').textContent = shs.value + '%'; }
    var lk = locked(), ch = S.scen === 'challenge';
    $('np-f-data').disabled = lk;
    $('np-f-train').disabled = false;
    ['i-lr'].forEach(function (id) { $(id).disabled = ch; });
    q('[data-opt]').forEach(function (b) { b.disabled = ch; });
    q('[data-act]').forEach(function (b) { b.disabled = ch; });
    q('[data-tool="0"],[data-tool="1"],[data-tool="2"],[data-tool="erase"]').forEach(function (b) { b.disabled = lk; });
    $('np-reset').textContent = ch ? 'Restart attempt' : 'Reset brain';
    root.querySelector('.np-legend').classList.toggle('k2', S.K < 3);
    var run = $('np-run'); run.textContent = S.running ? 'Pause' : 'Train'; run.classList.toggle('attn', !S.running && S.T && S.T.epoch === 0 && canTrain());
    $('np-step').disabled = !canTrain();
  }
  function fmtLr(v) { return v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v >= 0.1 ? v.toFixed(2) : v.toFixed(3); }
  function archChanged() {
    rebuildNet();
    say('Network layout: ' + (S.hidden.length ? S.hidden.join(' + ') : 'no') + ' hidden neurons. Fresh random weights.');
  }
  function setRunning(on) {
    if (on && !canTrain()) { say('Nothing to learn from yet: paint at least two colours of dots (or pick a shape).'); return; }
    if (on && S.tool === 'predict') setTool(locked() ? 'look' : '0');
    if (on && S.ended) { S.ended = false; }
    S.running = on; syncControls(); updateBadge();
    say(on ? 'Training started: the weights are being adjusted.' : 'Training paused.');
  }
  function setTool(t) {
    S.tool = t;
    if (t === 'predict' && S.running) { S.running = false; say('Switched to Predict: training paused and the weights are frozen. Click or drag on the board to ask the brain about new dots.'); }
    else if (t === 'predict') say('Predict mode: weights are frozen. Click or drag on the board.');
    else say('Tool: ' + (t === 'look' ? 'look only (hover to see what each neuron thinks)' : t === 'erase' ? 'eraser' : 'paint class ' + (+t + 1) + ' (' + SHAPE_NAMES[+t] + ')') + '.');
    syncControls(); updateBadge();
  }

  document.querySelectorAll('[data-tool]').forEach(function (b) { b.addEventListener('click', function () { setTool(b.dataset.tool); }); });
  document.querySelectorAll('[data-kind]').forEach(function (b) {
    b.addEventListener('click', function () {
      S.kind = b.dataset.kind; S.dataSeed = (S.dataSeed % 997) + 1 + (S.kind === 'blank' ? 0 : 0);
      if (S.kind === 'blank') { S.pts = []; }
      regenData();
      say(S.kind === 'blank' ? 'Blank board. Pick a Paint tool and drag on the board; use at least two colours.' : 'Dataset: ' + b.textContent + '. Fresh brain; press Train.');
    });
  });
  document.querySelectorAll('[data-k]').forEach(function (b) {
    b.addEventListener('click', function () {
      var k = +b.dataset.k;
      if (k === 2 && (S.kind === 'custom' || S.kind === 'blank') && S.pts.some(function (p) { return p.c >= 2; })) { S.pts = S.pts.filter(function (p) { return p.c < 2; }); }
      S.K = k; regenData();
      if ((S.kind === 'xor' || S.kind === 'moons') && k === 3) say('XOR and Moons are two-colour shapes, so they stay at 2 colours.');
    });
  });
  document.querySelectorAll('[data-act]').forEach(function (b) { b.addEventListener('click', function () { S.act = b.dataset.act; archChanged(); }); });
  document.querySelectorAll('[data-opt]').forEach(function (b) {
    b.addEventListener('click', function () {
      S.opt = b.dataset.opt; S.lr = S.opt === 'sgd' ? 0.3 : 0.03; if (S.T) { S.T.opt = S.opt; S.T.lr = S.lr; }
      rebuildNet(); say((S.opt === 'sgd' ? 'Plain SGD' : 'Adam') + ' selected; learning rate set to ' + fmtLr(S.lr) + ' and the brain restarted.');
    });
  });
  $('b-layer-plus').addEventListener('click', function () { if (S.hidden.length < MAX_LAYERS) { S.hidden.push(S.hidden.length ? S.hidden[S.hidden.length - 1] : 4); archChanged(); } });
  $('b-layer-minus').addEventListener('click', function () { if (S.hidden.length) { S.hidden.pop(); archChanged(); } });
  function slider(id, fn, regen) {
    $(id).addEventListener('input', function () { fn(+this.value); syncOut(); if (regen) { clearTimeout(slider.t); slider.t = setTimeout(regen, 90); } });
  }
  function syncOut() { $('o-noise').textContent = S.noise.toFixed(2); $('o-n').textContent = S.n; $('o-test').textContent = S.testPct + '%'; $('o-lr').textContent = fmtLr(S.lr); $('o-speed').textContent = EPS[S.speed] + ' epochs/s'; }
  slider('i-noise', function (v) { S.noise = v; }, function () { if (S.kind !== 'custom' && S.kind !== 'blank') regenData(); });
  slider('i-n', function (v) { S.n = v; }, function () { if (S.kind !== 'custom' && S.kind !== 'blank') regenData(); });
  slider('i-test', function (v) { S.testPct = v; }, function () { NP.splitTest(S.pts, S.testPct / 100, S.splitSeed); rebuildTrainer(true); S.running = S.running && canTrain(); S.dirty = true; syncControls(); say('Held-out test dots: ' + S.testPct + '%.'); });
  slider('i-lr', function (v) { S.lr = Math.pow(10, v); if (S.T) S.T.lr = S.lr; S.dirty = true; });
  slider('i-speed', function (v) { S.speed = v; });
  $('np-run').addEventListener('click', function () { setRunning(!S.running); });
  $('np-step').addEventListener('click', function () { if (!canTrain()) return; if (S.tool === 'predict') setTool('0'); S.running = false; S.T.runEpochs(1); S.dirty = true; syncControls(); checkEvents(); say('One epoch: every training dot seen once.'); });
  $('np-reset').addEventListener('click', function () {
    if (S.scen !== 'challenge') S.netSeed += 1;
    rebuildNet(); S.running = false; syncControls();
    say(S.scen === 'challenge' ? 'New attempt with the same starting weights.' : 'New random brain (different starting weights). The data is unchanged.');
  });
  $('np-clear-probes').addEventListener('click', function () { S.probes = []; S.dirty = true; say('Probes cleared.'); });
  $('np-big').addEventListener('click', function () { S.big = !S.big; root.classList.toggle('big', S.big); this.setAttribute('aria-pressed', S.big ? 'true' : 'false'); });
  document.querySelectorAll('[data-scen]').forEach(function (b) { b.addEventListener('click', function () { loadScenario(b.dataset.scen); }); });

  /* ---------- scenarios ---------- */
  function storyHtml(name) {
    var B = NP.BIAS, C = NP.CHALLENGE;
    if (name === 'sandbox') return '<h2>Sandbox: draw it, teach it</h2><p>Pick a shape or paint your own dots (choose a colour, drag on the board). Press <b>Train</b>: the background is what the network currently believes. Then use <b>Predict (frozen)</b> to ask it about new dots. Try the Spiral: why does a one-layer brain with 4 neurons struggle?</p>';
    if (name === 'memorise') return '<h2>Memorise or understand?</h2><p>60 noisy dots, half of them held out as a test. The brain has 3 layers of 8 neurons: far more than it needs. Press <b>Train</b> and let it run past epoch 400. It scores almost perfectly on the filled training dots while the hollow test dots get worse: the decision boundary has wrapped around individual noisy dots. That is <b>overfitting</b>.</p><div class="np-story-btns"><button class="btn primary small" data-go="big">Big brain (3 × 8 neurons)</button><button class="btn ghost small" data-go="small">Small brain (2 neurons)</button></div>';
    if (name === 'lr') return '<h2>Learning rate too big: it diverges</h2><p>Same easy two-blob problem, plain SGD. Each step moves the weights by (learning rate × slope). With a sensible rate the loss slides down; with a rate of 30 each step overshoots the valley, the loss jumps up and the brain never settles. This is the <code>eta</code> of section 11.7.</p><div class="np-story-btns"><button class="btn primary small" data-go="lrbad">Learning rate 30 (too big)</button><button class="btn ghost small" data-go="lrgood">Learning rate 0.3 (reasonable)</button></div>';
    if (name === 'bias') return '<h2>Biased data, unfair brain</h2><p>Invented applicants from two villages. The two villages follow opposite rules (in A the top is class 1, in B the top is class 2), and the brain is never told which village anyone is from; their position on the board is a proxy. The sample is <b>' + Math.round(B.minority * 100) + '% Village B</b>. Train it and compare the overall test number with the fairness readout. Then collect more data from B.</p><div class="np-story-btns"><button class="btn primary small" data-go="fair">Collect more data from B (50%)</button><button class="btn ghost small" data-go="skew">Back to the skewed sample</button></div>';
    return '<h2>Challenge: the smallest brain that learns the spiral</h2><p>Reach <b>95% on the hollow test dots</b> within ' + C.maxEpochs + ' epochs using as few hidden neurons as you can. You choose only the layout (layers and neurons per layer); data, tanh and Adam are fixed, so the result is repeatable. Par is <b>' + C.par + '</b> neurons. Hint: a deeper, narrow network can beat a wide, shallow one.</p>';
  }
  function bindStory() {
    document.querySelectorAll('[data-go]').forEach(function (b) {
      b.addEventListener('click', function () {
        var g = b.dataset.go;
        if (g === 'big') { S.hidden = NP.MEMORISE.hidden.slice(); archChanged(); setRunning(true); }
        else if (g === 'small') { S.hidden = NP.SMALL_FOR_MEMORISE.hidden.slice(); archChanged(); setRunning(true); say('Only 2 neurons: it cannot memorise, and the training and test scores stay close.'); }
        else if (g === 'lrbad' || g === 'lrgood') { S.lr = g === 'lrbad' ? NP.LR.bad : NP.LR.good; S.opt = 'sgd'; rebuildNet(); setRunning(true); say('Learning rate ' + S.lr + (g === 'lrbad' ? ': watch the loss curve blow up instead of falling.' : ': the loss falls smoothly.')); }
        else if (g === 'fair' || g === 'skew') { S.biasShare = g === 'fair' ? NP.BIAS.fair : NP.BIAS.minority; regenData(); setRunning(true); }
      });
    });
  }
  function loadScenario(name) {
    var P = SCEN[name]; S.scen = name;
    S.kind = P.kind; S.K = P.K; S.noise = P.noise; S.n = P.n; S.testPct = P.testPct; S.hidden = P.hidden.slice(); S.act = P.act; S.opt = P.opt; S.lr = P.lr;
    S.netSeed = P.netSeed; S.trainSeed = P.trainSeed; S.speed = P.speed; S.l2 = P.l2 || 0; S.dataSeed = P.dataSeed || 3; S.splitSeed = P.splitSeed || 7;
    S.biasShare = NP.BIAS.minority; S.running = false; S.tool = locked() ? 'look' : '0';
    $('np-story').innerHTML = storyHtml(name); bindStory();
    regenData(); setupExtra();
    $('np-curve-acc').setAttribute('aria-label', 'Accuracy curve');
    say(name === 'challenge' ? 'Challenge loaded. Build a layout, then press Train.' : 'Scenario loaded: ' + document.querySelector('[data-scen="' + name + '"]').textContent.replace(/^\d\s*/, '') + '. Press Train.');
    syncControls(); updateBadge();
  }

  /* ---------- the loop ---------- */
  var lastT = 0;
  function checkEvents() {
    var T = S.T, h = T.history[T.history.length - 1], q;
    if (!h) return;
    if (S.scen === 'challenge' && !S.solved) {
      for (q = S.histSeen || 0; q < T.history.length; q++) {
        if (T.history[q].testAcc >= NP.CHALLENGE.target) {
          h = T.history[q]; S.solved = { n: S.net.hiddenNeurons, epoch: h.epoch }; S.running = false; writeBest(S.solved.n);
          say('Challenge solved with ' + S.solved.n + ' hidden neurons at epoch ' + h.epoch + ': test accuracy ' + pct(h.testAcc) + '. ' + medal(S.solved.n));
          syncControls(); return;
        }
      }
      S.histSeen = T.history.length;
    }
    var lim = S.scen === 'challenge' ? NP.CHALLENGE.maxEpochs : S.scen === 'bias' ? NP.BIAS.epochs : 0;
    if (lim && T.epoch >= lim && !S.ended && !S.solved) {
      S.ended = true; S.running = false; syncControls();
      say(S.scen === 'bias' ? 'Training budget reached (' + lim + ' epochs). Read the fairness panel.' : 'Out of epochs (' + lim + ') without reaching 95% test accuracy. Try another layout.');
    }
    if (T.epoch - S.lastAnnounce >= 100) {
      S.lastAnnounce = T.epoch;
      say('Epoch ' + T.epoch + ': training accuracy ' + pct(h.trainAcc) + ', test accuracy ' + pct(h.testAcc) + ', training loss ' + f2(h.trainLoss) + '.');
    }
    if (T.epoch < S.lastAnnounce) S.lastAnnounce = 0;
  }
  function frame(ts) {
    var dt = Math.min(0.1, (ts - lastT) / 1000); lastT = ts;
    if (S.needTrainer) { rebuildTrainer(false); S.running = S.running && canTrain(); syncControls(); }
    if (S.running && S.T && S.tool !== 'predict') {
      S.acc += dt * EPS[S.speed] * S.T.stepsPerEpoch;
      var k = Math.min(80, Math.floor(S.acc)); S.acc -= Math.floor(S.acc); if (S.acc > 100) S.acc = 0;
      var t0 = performance.now();
      while (k > 0 && performance.now() - t0 < 9) { S.T.step(1); k--; }
      S.dirty = true; checkEvents();
    }
    if (S.dirty) {
      drawBoard();
      updateDiagram(S.running || S.weightsStale !== S.T.steps);
      S.weightsStale = S.T.steps;
      if (S.running || S.curveAt !== S.T.history.length || S.curveForce) {
        drawCurve($('np-curve-loss'), 'Loss', { auto: true, label: 'loss' });
        drawCurve($('np-curve-acc'), 'Acc', { min: 0, max: 1, pct: true, label: 'accuracy', ref: S.scen === 'challenge' ? NP.CHALLENGE.target : null });
        S.curveAt = S.T.history.length; S.curveForce = false;
      }
      updateStats(!S.running);
      S.dirty = false;
    }
    requestAnimationFrame(frame);
  }
  window.addEventListener('resize', function () { sizeCanvases(); S.curveForce = true; });
  new MutationObserver(function () { PAL = null; S.dirty = true; S.curveForce = true; if (S.net) buildDiagram(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  if (window.matchMedia) { try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { PAL = null; S.dirty = true; S.curveForce = true; }); } catch (e) { /* old browser */ } }

  /* test hooks for headless checks */
  window.__np = { S: S, loadScenario: loadScenario, setRunning: setRunning, setTool: setTool, rebuildNet: rebuildNet, regenData: regenData, addProbe: addProbe };

  loadScenario('sandbox');
  sizeCanvases();
  S.curveForce = true;
  requestAnimationFrame(frame);
})();
