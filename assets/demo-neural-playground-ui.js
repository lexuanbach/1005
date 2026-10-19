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
      pos: g('--teal', bs), neg: g('--neg'), red: g('--red', bs), amber: g('--amber', bs),
      lc: { 'in': g('--lc-in'), h1: g('--lc-h1'), h2: g('--lc-h2'), h3: g('--lc-h3'), out: g('--lc-out'), loss: g('--lc-loss'), grad: g('--lc-grad') }
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
    if (INS_API.close) INS_API.close();
    S.running = S.running && canTrain();
    rebuildTrainer(true);
    buildDiagram(); syncControls(); if (INS_API.reserve) INS_API.reserve(); S.dirty = true; S.solved = null; S.ended = false; S.audit = null; S.lastAnnounce = 0; S.histSeen = 0;
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
    if (t === 'inspect') { if (!drag) INS_API.pickAt(pt); return; }
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
    if (INS.p) {
      x = (INS.p.x + 1) / 2 * W; y = (1 - INS.p.y) / 2 * H;
      ctx.beginPath(); ctx.arc(x, y, 15 * u, 0, 6.2832); ctx.lineWidth = 3.5 * u; ctx.strokeStyle = P.lc['in']; ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, 19.5 * u, 0, 6.2832); ctx.lineWidth = 1.5 * u; ctx.strokeStyle = P.ink; ctx.setLineDash([3 * u, 3 * u]); ctx.stroke(); ctx.setLineDash([]);
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
  var NS = 'http://www.w3.org/2000/svg', svg = $('np-net'), edges = [], nodes = [], VBW = 420, VBH = 290, TOPY = 40, BOTY = 34;
  var INS_API = {};
  var npos = [], vlabs = [], signs = [], pulses = [], gPulse = null, lossTxt = null, ring = null;
  var INS = { on: false, p: null, tr: null, stages: [], si: 0, t: 1, playing: false, one: false, applied: false, dirty: true, maxG: 1, maxD: 1, upd: null, big: null };
  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name), k;
    for (k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e); return e;
  }
  /* Colour = WHICH LAYER (input, hidden 1..3, output), from the shared --cmp-N palette via --lc-* in the CSS; picked
     from tokens the class dots do not use. Line thickness = size of the weight; DASHED = negative. Colour never carries
     the sign or the size, so the diagram reads without it. */
  function layerKey(l, Ln) { return l === 0 ? 'in' : l === Ln ? 'out' : 'h' + (((l - 1) % 3) + 1); }
  function layerName(l, Ln) { return l === 0 ? 'Input' : l === Ln ? 'Output' : 'Hidden ' + l; }
  function layerCols() { var P = palette(), Ln = S.net.layers, out = [], l; for (l = 0; l <= Ln; l++) out.push(P.lc[layerKey(l, Ln)]); return out; }
  function tint(col, pc) { return 'color-mix(in srgb, ' + col + ' ' + Math.round(pc) + '%, var(--surface))'; }
  function setEdge(line, w, col, neg, op) {
    line.setAttribute('stroke-width', w.toFixed(2)); line.style.stroke = col; line.setAttribute('stroke-opacity', op);
    if (neg) { line.setAttribute('stroke-dasharray', Math.max(5, w * 2.6).toFixed(1) + ' ' + Math.max(3.5, w * 1.4).toFixed(1)); line.setAttribute('stroke-linecap', 'butt'); }
    else { line.removeAttribute('stroke-dasharray'); line.setAttribute('stroke-linecap', 'round'); }
  }
  function setSign(l, j, neg, on) {   // + / − inside a neuron: the sign never depends on colour
    var t = signs[l] && signs[l][j]; if (!t) return;
    if (on) { t.textContent = neg ? '−' : '+'; t.setAttribute('visibility', 'visible'); } else t.setAttribute('visibility', 'hidden');
  }
  function setDash(node, neg) { if (neg) node.setAttribute('stroke-dasharray', '3.6 2.4'); else node.removeAttribute('stroke-dasharray'); }
  function edgeWidth(v) { return 0.6 + Math.min(4.4, Math.abs(v) * 1.6); }
  var LGSW = '<svg class="np-lgsw" viewBox="0 0 24 8" aria-hidden="true"><line x1="1" y1="4" x2="23" y2="4"' ;
  function legendHtml(inspecting) {
    var Ln = S.net.layers, l, h = '';
    for (l = 0; l <= Ln; l++) h += '<span class="np-lg np-lc-' + layerKey(l, Ln) + '"><i class="np-lg-n"></i>' + layerName(l, Ln) + '</span>';
    if (inspecting) h += '<span class="np-lg np-lc-loss"><i class="np-lg-ring"></i>Loss</span><span class="np-lg np-lc-grad"><i class="np-lg-dia"></i>Gradient (δ)</span>';
    return h + '<span class="np-lg-key">' + LGSW + ' class="s"/></svg> solid = positive ' + LGSW + ' class="s d"/></svg> dashed = negative (' + (inspecting ? 'weight, activation or gradient' : 'weight or activation') + ') · thickness = size' +
      (inspecting ? ' · pulses: ● filled = positive, ○ hollow = negative, ◆ = gradient' : '') + '</span>';
  }
  function renderNetLegend() {
    var box = $('np-netleg');
    if (!box || !S.net) return;
    box.innerHTML = legendHtml(INS.on);
  }
  var legMax = 0;
  function reserveLegend() {   // the legend box is as tall as its tallest variant, so nothing below it moves when Inspect starts
    var box = $('np-netleg'), h;
    if (!box || !S.net) return;
    box.style.minHeight = '0'; legMax = 0;
    [false, true].forEach(function (v) { box.innerHTML = legendHtml(v); h = box.offsetHeight; if (h > legMax) legMax = h; });
    box.style.minHeight = legMax + 'px'; renderNetLegend();
  }
  window.addEventListener('resize', function () { if (S.net) reserveLegend(); });
  function buildDiagram() {
    var net = S.net, sizes = net.sizes, L = sizes.length, xs = [], l, j, i, cols = layerCols();
    svg.innerHTML = ''; edges = []; nodes = [];
    for (l = 0; l < L; l++) xs.push(46 + l * (VBW - 92) / Math.max(1, L - 1));
    function ypos(l, j) { var n = sizes[l]; return n === 1 ? (TOPY + VBH - BOTY) / 2 : TOPY + j * (VBH - TOPY - BOTY) / (n - 1); }
    var gE = el('g', {}, svg), gN = el('g', {}, svg), gT = el('g', {}, svg);
    npos = []; vlabs = []; signs = [];
    for (l = 0; l < L - 1; l++) for (j = 0; j < sizes[l + 1]; j++) for (i = 0; i < sizes[l]; i++) {
      edges.push({ l: l, j: j, i: i, e: el('line', { x1: xs[l], y1: ypos(l, i), x2: xs[l + 1], y2: ypos(l + 1, j), 'stroke-linecap': 'round' }, gE) });
    }
    for (l = 0; l < L; l++) {
      nodes.push([]); npos.push([]);
      var cap = el('text', { x: xs[l], y: 12, 'text-anchor': 'middle', 'class': 'np-lcap' }, gT);
      cap.textContent = layerName(l, L - 1).toLowerCase(); cap.style.fill = 'color-mix(in srgb, ' + cols[l] + ' 62%, var(--ink))';
      for (j = 0; j < sizes[l]; j++) {
        npos[l].push([xs[l], ypos(l, j)]);
        var c = el('circle', { cx: xs[l], cy: ypos(l, j), r: sizes[l] > 6 ? 9 : 11, 'class': 'node' }, gN);
        c.style.fill = 'var(--surface)'; c.style.setProperty('--lc', cols[l]);
        nodes[l].push(c);
        if (l === 0) { var t = el('text', { x: xs[l] - 20, y: ypos(l, j) + 4, 'text-anchor': 'end' }, gT); t.textContent = j === 0 ? 'x' : 'y'; }
        if (l === L - 1) { var t2 = el('text', { x: xs[l] + 18, y: ypos(l, j) + 5 }, gT); t2.textContent = SHAPES[j]; t2.style.fill = palette().cls[j]; t2.setAttribute('class', 'outlab'); t2.setAttribute('data-c', j); }
      }
    }
    gPulse = el('g', {}, svg); pulses = [];
    ring = el('circle', { r: 17, 'class': 'np-ring', visibility: 'hidden' }, svg);
    for (l = 0; l < L; l++) {
      vlabs.push([]); signs.push([]);
      for (j = 0; j < sizes[l]; j++) {
        signs[l].push(el('text', { x: npos[l][j][0], y: npos[l][j][1] + 4.2, 'class': 'np-sgn', visibility: 'hidden' }, svg));
        vlabs[l].push(el('text', { x: npos[l][j][0], y: npos[l][j][1] - (sizes[l] > 6 ? 12 : 14), 'class': 'np-vlab', visibility: 'hidden' }, svg));
      }
    }
    lossTxt = el('text', { x: VBW - 6, y: VBH - 6, 'class': 'np-losstxt', visibility: 'hidden' }, svg);
    $('np-weights').textContent = net.nParams + ' weights to learn';
    reserveLegend();
    if (INS.on) INS.dirty = true;
    updateDiagram(true);
  }
  function updateDiagram(weights) {
    if (INS.on) return;
    var net = S.net, P = palette(), w = net.params, cols = layerCols(), i, e, v;
    if (weights) {
      for (i = 0; i < edges.length; i++) {
        e = edges[i]; v = w[net.wOff[e.l] + e.j * net.sizes[e.l] + e.i];
        setEdge(e.e, edgeWidth(v), cols[e.l], v < 0, 1);          // colour = the layer it leaves; dashed = negative
      }
      Array.prototype.forEach.call(svg.querySelectorAll('.outlab'), function (t) { t.style.fill = P.cls[+t.getAttribute('data-c')]; });
    }
    var h = S.hover, l, j, a;
    if (ring) ring.setAttribute('visibility', 'hidden');
    if (!h) { nodes.forEach(function (layer, li) { layer.forEach(function (n, ni) { n.style.fill = 'var(--surface)'; setDash(n, false); setSign(li, ni, false, false); }); }); return; }
    var pr = net.predict(h.x, h.y), hid = net.hiddenAt(h.x, h.y);
    [h.x, h.y].forEach(function (val, k) { nodes[0][k].style.fill = tint(cols[0], Math.min(1, Math.abs(val)) * 85); setDash(nodes[0][k], val < 0); setSign(0, k, val < 0, true); });
    for (l = 0; l < hid.length; l++) for (j = 0; j < hid[l].length; j++) {
      a = hid[l][j];
      nodes[l + 1][j].style.fill = tint(cols[l + 1], Math.min(1, Math.abs(a) / (net.act === 'relu' ? 2 : 1)) * 90); setDash(nodes[l + 1][j], a < 0); setSign(l + 1, j, a < 0, true);
    }
    var last = nodes[nodes.length - 1];
    for (j = 0; j < last.length; j++) { last[j].style.fill = tint(P.cls[j], pr.p[j] * 100); setDash(last[j], false); setSign(nodes.length - 1, j, false, false); }
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
    else if (S.tool === 'inspect') { t = 'Inspecting one dot: training paused'; b.className = 'np-badge frozen'; }
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
    if (on && (S.tool === 'predict' || S.tool === 'inspect')) setTool(locked() ? 'look' : '0');
    if (on && S.ended) { S.ended = false; }
    S.running = on; syncControls(); updateBadge();
    say(on ? 'Training started: the weights are being adjusted.' : 'Training paused.');
  }
  function setTool(t) {
    S.tool = t;
    if (t !== 'inspect' && INS.on) INS_API.close();
    if (t === 'inspect') {
      if (S.running) S.running = false;
      say('Inspect mode: training is paused. Click a dot (or press Enter on the board cursor, or “Pick a random dot”) to follow it through the network.');
    } else if (t === 'predict' && S.running) { S.running = false; say('Switched to Predict: training paused and the weights are frozen. Click or drag on the board to ask the brain about new dots.'); }
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
  $('np-step').addEventListener('click', function () { if (!canTrain()) return; if (S.tool === 'predict' || S.tool === 'inspect') setTool(locked() ? 'look' : '0'); S.running = false; S.T.runEpochs(1); S.dirty = true; syncControls(); checkEvents(); say('One epoch: every training dot seen once.'); });
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

  /* ---------- Inspect one sample: forward pass, loss, backward pass, update — driven by NP.traceSample ---------- */
  (function () {
    var insSpeed = AIFlow.speedControl({ unit: 'stage' });
    $('ins-speed').appendChild(insSpeed.el);
    var elPlay = $('ins-play'), elNext = $('ins-next'), elBack = $('ins-back'), elApply = $('ins-apply'), elPick = $('ins-pick');
    var elNarr = $('ins-narr'), elNums = $('ins-nums'), elStages = $('ins-stages'), elSub = $('ins-sub');
    var IDLE_NARR = $('ins-narr').innerHTML, lastStageShown = -1, maxNarr = 0;
    function f2s(v) { var s = v.toFixed(2); return s === '-0.00' ? '0.00' : s; }
    function f3s(v) { var s = v.toFixed(3); return s === '-0.000' ? '0.000' : s; }
    function fe(v) { return v === 0 ? '0' : Math.abs(v) < 0.001 ? v.toExponential(1) : v.toFixed(3); }
    function ease(q) { return q < 0.5 ? 2 * q * q : 1 - Math.pow(-2 * q + 2, 2) / 2; }
    function mix(c, pct) { return 'color-mix(in srgb, ' + c + ' ' + Math.round(pct) + '%, var(--surface))'; }
    function last() { return INS.stages.length - 1; }
    function L() { return S.net.layers; }
    function reached(idx, thr) { return INS.si > idx || (INS.si === idx && INS.t >= thr); }

    function build(p) {
      var net = S.net, Ln = net.layers, k, i, j, st = [{ k: 'in', name: 'Input' }];
      var tr = NP.traceSample(net, p);
      for (k = 0; k < Ln; k++) st.push({ k: 'fwd', l: k, name: k === Ln - 1 ? 'Output' : 'Forward ' + (k + 1) });
      st.push({ k: 'loss', name: 'Loss' });
      for (k = Ln - 1; k >= 0; k--) st.push({ k: 'bwd', l: k, name: 'Back ' + (Ln - k) });
      st.push({ k: 'upd', name: 'Update' });
      st.forEach(function (x) { x.lc = x.k === 'in' ? 'in' : x.k === 'fwd' ? layerKey(x.l + 1, Ln) : x.k === 'loss' ? 'loss' : 'grad'; });
      var maxG = 1e-9, maxD = 1e-9, g, big = { v: 0 }, upd = NP.traceStep(tr, S.lr);
      for (k = 0; k < Ln; k++) for (j = 0; j < tr.gradW[k].length; j++) for (i = 0; i < tr.gradW[k][j].length; i++) {
        g = Math.abs(tr.gradW[k][j][i]); if (g > maxG) maxG = g;
        var wi = net.wOff[k] + j * net.sizes[k] + i;
        if (Math.abs(upd[wi]) > big.v) big = { v: Math.abs(upd[wi]), d: upd[wi], l: k, j: j, i: i, w: net.params[wi] };
      }
      for (k = 1; k <= Ln; k++) tr.delta[k].forEach(function (d) { if (Math.abs(d) > maxD) maxD = Math.abs(d); });
      INS.p = p; INS.tr = tr; INS.stages = st; INS.maxG = maxG; INS.maxD = maxD; INS.upd = upd; INS.big = big; INS.lr = S.lr;
    }

    function rebuildChips() {
      elStages.innerHTML = '';
      INS.stages.forEach(function (st, idx) {
        var b = document.createElement('button'); b.type = 'button'; b.textContent = st.name; b.className = 'np-lc-' + st.lc;
        b.addEventListener('click', function () { INS.playing = false; INS.one = false; setStage(idx, 1); });
        elStages.appendChild(b);
      });
    }
    function paintChips() {
      Array.prototype.forEach.call(elStages.children, function (b, idx) {
        b.classList.toggle('cur', idx === INS.si); b.classList.toggle('done', idx < INS.si);
        b.setAttribute('aria-current', idx === INS.si ? 'step' : 'false');
      });
    }

    /* narration for stage idx, from the real trace; component names are colour chips (colour + text) */
    function nk(key, txt) { return '<span class="np-k np-lc-' + key + '">' + txt + '</span>'; }
    function narration(idx) {
      var tr = INS.tr, st = INS.stages[idx], Ln = L(), c = tr.c, k = st.l, sh = SHAPES[c];
      var lay = k === undefined ? 0 : k + 1, nm = S.act === 'relu' ? 'ReLU' : 'tanh';
      if (st.k === 'in') {
        return '<strong>The sample.</strong> This dot sits at x = <code>' + f2s(tr.x) + '</code>, y = <code>' + f2s(tr.y) + '</code> and its true colour is class ' + (c + 1) + ' (' + sh + '). These two numbers light up the ' + nk('in', 'input') + ' neurons. ' +
          'Press <strong>Play</strong> to push them through the network, or <strong>Step</strong> to go one layer at a time.';
      }
      if (st.k === 'fwd') {
        var z0 = tr.z[lay][0], a0 = tr.a[lay][0], n = tr.a[lay].length, who = nk(layerKey(lay, Ln), layerName(lay, Ln).toLowerCase());
        if (lay < Ln) {
          return '<strong>Forward pass into the ' + who + ' layer (' + lay + ' of ' + Ln + ').</strong> Every neuron here adds up (previous activation × weight) + bias, then applies ' + nm + '. ' +
            'The pulses on the lines carry the previous layer’s activations: a bigger dot is a bigger signal, ● filled pushes the sum up, ○ hollow pushes it down. ' +
            'Neuron 1: z = <code>' + f2s(z0) + '</code> → ' + nm + ' → <code>' + f2s(a0) + '</code>. Labels show each neuron’s activation; a dashed outline means negative.';
        }
        return '<strong>Forward pass into the ' + who + ' layer.</strong> The last layer adds up its inputs the same way, then <strong>softmax</strong> turns the ' + n + ' scores into probabilities that add to 1: ' +
          tr.probs.map(function (p, j) { return SHAPES[j] + ' <code>' + f2s(p) + '</code>'; }).join(', ') + '. The brain’s answer is ' + SHAPES[tr.probs.indexOf(Math.max.apply(null, tr.probs))] + ' (the dot really is ' + sh + ').';
      }
      if (st.k === 'loss') {
        return '<strong>' + nk('loss', 'Loss') + '.</strong> The true class is ' + sh + ' (dashed ring) and the brain gave it probability <code>' + f2s(tr.probs[c]) + '</code>. Cross-entropy loss = −ln(' + f2s(tr.probs[c]) + ') = <code>' + f2s(tr.loss) + '</code> (0 would be perfect; large means confidently wrong). ' +
          'The error signal at each output neuron is simply <em>probability − target</em>: ' + tr.delta[Ln].map(function (d, j) { return SHAPES[j] + ' <code>' + f3s(d) + '</code>'; }).join(', ') + '. It is about to travel backwards.';
      }
      if (st.k === 'bwd') {
        var gW = tr.gradW[k], mg = 0, ji = 0, ii = 0;
        gW.forEach(function (row, j) { row.forEach(function (g, i) { if (Math.abs(g) > Math.abs(mg)) { mg = g; ji = j; ii = i; } }); });
        return '<strong>Backward pass: ' + nk('grad', 'gradient') + ' of the weights into the ' + nk(layerKey(k + 1, Ln), layerName(k + 1, Ln).toLowerCase()) + ' layer.</strong> ' + (k === Ln - 1 ? 'The output error δ ' : 'The blame δ that arrived from the right ') + 'times the activation that fed each weight gives that weight’s <strong>gradient</strong> ∂loss/∂w. ' +
          'Thicker line = bigger gradient; <strong>solid</strong> = positive (lower this weight), <strong>dashed</strong> = negative (raise it); ◆ pulses travel backwards. ' +
          (k > 0 ? 'The blame is then passed on to the neurons on the left (labels now show δ), scaled by the weights and the ' + nm + ' slope. ' : 'The input neurons need no blame. ') +
          'Biggest gradient here: <code>' + f3s(mg) + '</code> (neuron ' + (ii + 1) + ' → ' + (ji + 1) + ').';
      }
      var b = INS.big;
      return '<strong>' + nk('grad', 'Update') + '.</strong> Every weight moves a little <em>against</em> its gradient: <code>w ← w − η × gradient</code>, with learning rate η = <code>' + fmtLr(INS.lr) + '</code>. ' +
        'The biggest nudge on this sample is <code>' + fe(b.d) + '</code> (a weight of <code>' + f3s(b.w) + '</code>). One dot gives a tiny, noisy nudge: real training averages ' + Math.min(32, S.T ? S.T.train.length : 32) + ' dots per step' + (S.opt === 'adam' ? ' and Adam also smooths it over time' : '') + ', and repeats it thousands of times. ' +
        (INS.applied ? '<strong>Applied</strong> to the network just now.' : 'Press “Apply this nudge” to really move the weights by it.');
    }
    function numsHtml() {
      var tr = INS.tr, cells = [['Loss (this dot)', f3s(tr.loss), 'loss'], ['P(true class)', f3s(tr.probs[tr.c]), 'out'], ['Biggest gradient', f3s(INS.maxG), 'grad'], ['Learn. rate', fmtLr(INS.lr), 'grad'], ['Biggest nudge', fe(INS.big.d), 'grad']];
      return cells.map(function (c) { return '<div class="np-stat np-lc-' + c[2] + '"><small>' + c[0] + '</small><b>' + c[1] + '</b></div>'; }).join('');
    }

    function setStage(idx, t) {
      INS.si = Math.max(0, Math.min(last(), idx)); INS.t = t; INS.dirty = true; stageChanged();
    }
    function stageChanged() {
      if (lastStageShown !== INS.si) {
        lastStageShown = INS.si; elNarr.innerHTML = narration(INS.si); paintChips();
        var nh = elNarr.offsetHeight; if (nh > maxNarr) { maxNarr = nh; elNarr.style.minHeight = nh + 'px'; }
      }
      syncButtons();
    }
    function syncButtons() {
      var on = INS.on, endd = INS.si === last() && INS.t >= 1;
      elPlay.disabled = !on; elBack.disabled = !on || (INS.si === 0 && INS.t <= 0); elNext.disabled = !on || endd;
      elPlay.textContent = INS.playing && !INS.one ? '⏸ Pause' : (endd ? '↺ Replay' : '▶ Play');
      elApply.disabled = !on || INS.si !== last() || INS.t < 1 || INS.applied;
      Array.prototype.forEach.call(elStages.children, function (b) { b.disabled = !on; });
    }

    function select(p) {
      if (!S.net) return;
      if (S.tool !== 'inspect') setTool('inspect');
      build(p); INS.on = true; INS.applied = false; INS.playing = false; INS.one = false; lastStageShown = -1;
      rebuildChips(); elNums.innerHTML = numsHtml();
      elSub.textContent = 'dot at (' + f2s(p.x) + ', ' + f2s(p.y) + ') · class ' + (p.c + 1) + ' ' + SHAPES[p.c] + (p.t ? ' · a test dot' : '');
      S.dirty = true; renderNetLegend(); setStage(0, 0);
      play();
    }
    function close() {
      if (!INS.on && !INS.p) return;
      var was = INS.on;
      INS.on = false; INS.p = null; INS.tr = null; INS.playing = false; lastStageShown = -1;
      vlabs.forEach(function (layer) { layer.forEach(function (t) { t.setAttribute('visibility', 'hidden'); }); });
      signs.forEach(function (layer) { layer.forEach(function (t) { t.setAttribute('visibility', 'hidden'); }); });
      if (lossTxt) lossTxt.setAttribute('visibility', 'hidden');
      if (ring) ring.setAttribute('visibility', 'hidden');
      if (gPulse) gPulse.textContent = '';
      pulses = [];
      nodes.forEach(function (layer) { layer.forEach(function (n) { n.classList.remove('hot'); setDash(n, false); }); });
      elStages.innerHTML = ''; elNums.innerHTML = ''; elNarr.innerHTML = IDLE_NARR; elSub.textContent = 'choose “Inspect a dot”, then click a dot';
      syncButtons(); S.dirty = true;
      renderNetLegend();
      if (was && S.net) updateDiagram(true);
    }
    function play() {
      if (!INS.on) return;
      if (INS.si === last() && INS.t >= 1) { build(INS.p); elNums.innerHTML = numsHtml(); INS.applied = false; lastStageShown = -1; setStage(0, 0); }
      var ms = insSpeed.ms();
      if (ms <= 0) { setStage(last(), 1); INS.playing = false; return; }
      INS.playing = true; INS.one = false;
      syncButtons();
    }
    function stepOnce() {
      if (!INS.on) return;
      if (INS.t < 1) { INS.playing = false; INS.t = 1; INS.dirty = true; stageChanged(); return; }
      if (INS.si >= last()) return;
      var ms = insSpeed.ms();
      if (ms <= 0) { setStage(INS.si + 1, 1); return; }
      setStage(INS.si + 1, 0); INS.playing = true; INS.one = true; syncButtons();
    }
    elPlay.addEventListener('click', function () { if (INS.playing && !INS.one) { INS.playing = false; syncButtons(); } else play(); });
    elNext.addEventListener('click', stepOnce);
    elBack.addEventListener('click', function () { INS.playing = false; INS.one = false; if (INS.t > 0 && INS.t < 1) setStage(INS.si, 0); else setStage(INS.si - 1, 1); });
    elPick.addEventListener('click', function () {
      if (!S.pts.length) { say('There are no dots yet. Paint some or pick a shape first.'); return; }
      var pool = S.pts.filter(function (p) { return !p.t; }); if (!pool.length) pool = S.pts;
      select(pool[paintRng.int(pool.length)]);
    });
    elApply.addEventListener('click', function () {
      if (!INS.on || INS.applied) return;
      var d = INS.upd, w = S.net.params, k; for (k = 0; k < d.length; k++) w[k] += d[k];
      INS.applied = true; S.dirty = true; S.weightsStale = -1; elNarr.innerHTML = narration(INS.si); syncButtons();
      say('Applied: the weights moved by this one dot’s nudge. Press Replay to see the same dot again with the new weights.');
    });

    function pickAt(pt) {
      var best = null, bd = 0.011, i, p, d;
      for (i = 0; i < S.pts.length; i++) { p = S.pts[i]; d = (p.x - pt.x) * (p.x - pt.x) + (p.y - pt.y) * (p.y - pt.y); if (d < bd) { bd = d; best = p; } }
      if (!best) { say('No dot there. Click right on a dot to follow it through the network.'); return; }
      select(best);
    }

    /* ----- frame: advance time, then draw the diagram from the trace ----- */
    function tick(dt) {
      if (!INS.on) return;
      if (INS.playing) {
        var ms = insSpeed.ms(), dwell = AIFlow.reduced() ? Math.min(ms, 400) : ms;
        if (ms <= 0) { INS.playing = false; setStage(last(), 1); }
        else {
          INS.t += dt * 1000 / dwell;
          if (INS.t >= 1) {
            INS.t = 1;
            if (INS.one || INS.si >= last()) { INS.playing = false; INS.one = false; }
            else { INS.si++; INS.t = 0; }
          }
          INS.dirty = true; stageChanged();
        }
      }
      if (INS.dirty) { INS.dirty = false; draw(); }
    }

    function draw() {
      var net = S.net, tr = INS.tr, Ln = net.layers, P = palette(), cols = layerCols(), si = INS.si, t = INS.t, st = INS.stages[si], i, j, k, e, a, v;
      var gradC = P.lc.grad, moving = INS.playing && !AIFlow.reduced() && t < 1;
      function actVisible(kk) { return kk === 0 || reached(kk, 0.9); }
      function dVisible(kk) { return kk === Ln ? reached(Ln + 1, 0.5) : kk > 0 && reached(2 * Ln + 1 - kk, 0.9); }
      var inBwd = si >= Ln + 1;
      // edges: colour = the layer the line leaves, thickness = |weight|, dashed = negative; in the backward pass
      // they take the gradient colour and the thickness of the gradient (dashed = negative gradient)
      var curF = st.k === 'fwd' ? st.l : -1, curB = st.k === 'bwd' ? st.l : -1;
      for (i = 0; i < edges.length; i++) {
        e = edges[i]; v = net.params[net.wOff[e.l] + e.j * net.sizes[e.l] + e.i];
        var bw = edgeWidth(v), col = cols[e.l], g = tr.gradW[e.l][e.j][e.i], gn = Math.sqrt(Math.abs(g) / INS.maxG), gw = 0.8 + 6 * gn;
        var gcol = gradC;   // backward pass: the gradient colour; size = thickness, sign = dashed
        var w = bw, c = col, neg = v < 0, o = 1;
        if (st.k === 'in') { o = 0.3; }
        else if (st.k === 'fwd') {
          if (e.l < curF) o = 0.6; else if (e.l === curF) { o = 1; w = bw * 1.25 + 0.6; } else o = 0.15;
        } else if (st.k === 'loss') { o = 0.75; }
        else if (st.k === 'bwd') {
          if (e.l > curB) { w = gw; c = gcol; neg = g < 0; }
          else if (e.l === curB) { w = bw + (gw - bw) * ease(t); if (t > 0.15) { c = gcol; neg = g < 0; } o = 0.6 + 0.4 * t; }
          else o = 0.15;
        } else {   // update: the gradient styling melts back into the (slightly changed) weights
          var u = ease(t); w = gw + (bw - gw) * u; if (u < 0.5) { c = gcol; neg = g < 0; }
        }
        setEdge(e.e, w, c, neg, o.toFixed(2));
      }
      // neurons: outline = own layer colour; fill = size of the activation (or of delta in the backward pass); dashed = negative
      var tgt = tr.c;
      for (k = 0; k <= Ln; k++) for (j = 0; j < net.sizes[k]; j++) {
        var node = nodes[k][j], lab = vlabs[k][j], fill = 'var(--surface)', txt = '', cls = 'np-vlab', negN = false;
        var showD = inBwd && dVisible(k);
        if (showD) {
          var dv = tr.delta[k][j]; fill = tint(gradC, Math.min(1, Math.abs(dv) / INS.maxD) * 80); txt = f3s(dv); cls += ' d'; negN = dv < 0;
        } else if (actVisible(k)) {
          a = tr.a[k][j];
          if (k === 0) fill = tint(cols[0], Math.min(1, Math.abs(a)) * 85);
          else if (k === Ln) fill = tint(P.cls[j], a * 100);
          else fill = tint(cols[k], Math.min(1, Math.abs(a) / (net.act === 'relu' ? 2 : 1)) * 90);
          txt = f2s(a); negN = a < 0;
        }
        node.style.fill = fill; setDash(node, negN);
        setSign(k, j, negN, !!txt && (showD || k < Ln));
        node.classList.toggle('hot', (st.k === 'fwd' && k === st.l + 1) || (st.k === 'bwd' && k === st.l));
        lab.textContent = txt; lab.setAttribute('class', cls); lab.setAttribute('visibility', txt ? 'visible' : 'hidden');
      }
      if (si >= Ln + 1) {   // the true class: dashed ring + the loss readout
        ring.setAttribute('cx', npos[Ln][tgt][0]); ring.setAttribute('cy', npos[Ln][tgt][1]); ring.setAttribute('visibility', 'visible');
        lossTxt.textContent = 'loss = ' + f2s(tr.loss); lossTxt.setAttribute('visibility', 'visible');
      } else { ring.setAttribute('visibility', 'hidden'); lossTxt.setAttribute('visibility', 'hidden'); }
      // travelling pulses: forward = circles in the source layer's colour (filled = positive contribution, hollow = negative);
      // backward = diamonds in the gradient colour (filled = positive delta, hollow = negative)
      var list = [];
      if (moving && st.k === 'fwd') {
        edges.forEach(function (ed) {
          if (ed.l !== st.l) return;
          var av = tr.a[ed.l][ed.i], wv = net.params[net.wOff[ed.l] + ed.j * net.sizes[ed.l] + ed.i];
          list.push({ from: npos[ed.l][ed.i], to: npos[ed.l + 1][ed.j], r: 2.2 + 3.2 * Math.min(1, Math.abs(av)), fill: cols[ed.l], hollow: av * wv < 0, dia: false });
        });
      } else if (moving && st.k === 'bwd') {
        edges.forEach(function (ed) {
          if (ed.l !== st.l) return;
          var dj = tr.delta[ed.l + 1][ed.j];
          list.push({ from: npos[ed.l + 1][ed.j], to: npos[ed.l][ed.i], r: 2.6 + 3.6 * Math.min(1, Math.abs(dj) / INS.maxD), fill: gradC, hollow: dj < 0, dia: true });
        });
      }
      while (pulses.length < list.length) pulses.push(el('path', { 'class': 'np-pulse' }, gPulse));
      while (pulses.length > list.length) gPulse.removeChild(pulses.pop());
      var q = ease(t);
      for (i = 0; i < list.length; i++) {
        var it = list[i], r = it.r, px = it.from[0] + (it.to[0] - it.from[0]) * q, py = it.from[1] + (it.to[1] - it.from[1]) * q;
        pulses[i].setAttribute('d', it.dia ? 'M0 ' + (-r - 1) + ' L' + (r + 1) + ' 0 L0 ' + (r + 1) + ' L' + (-r - 1) + ' 0 Z'
          : 'M' + (-r) + ' 0 a' + r + ' ' + r + ' 0 1 0 ' + (2 * r) + ' 0 a' + r + ' ' + r + ' 0 1 0 ' + (-2 * r) + ' 0');
        pulses[i].setAttribute('transform', 'translate(' + px.toFixed(1) + ' ' + py.toFixed(1) + ')');
        pulses[i].style.fill = it.hollow ? 'var(--surface)' : it.fill; pulses[i].style.stroke = it.hollow ? it.fill : 'var(--surface)';
        pulses[i].setAttribute('stroke-width', it.hollow ? '2' : '1');
      }
      svg.setAttribute('aria-label', 'Network diagram inspecting one dot, stage ' + st.name + '.');
    }
    /* Reserve the height of the tallest stage (narration, chips, number tiles) up front, so that nothing below the
       Inspect card moves when a dot is picked or while the stages play. Measured with a real trace of the first dot. */
    function reserve() {
      if (INS.on || !S.net || !S.pts.length) return;
      var keep = elNarr.innerHTML, hN = 0, hS, hT, i;
      elNarr.style.minHeight = '0'; elStages.style.minHeight = '0'; elNums.style.minHeight = '0';
      build(S.pts[0]);
      for (i = 0; i < INS.stages.length; i++) { elNarr.innerHTML = narration(i); hN = Math.max(hN, elNarr.offsetHeight); }
      rebuildChips(); hS = elStages.offsetHeight; elNums.innerHTML = numsHtml(); hT = elNums.offsetHeight;
      hN += 2; hS += 2; hT += 2;   // slack for sub-pixel rounding
      elNarr.style.minHeight = hN + 'px'; elStages.style.minHeight = hS + 'px'; elNums.style.minHeight = hT + 'px'; maxNarr = hN;
      elNarr.innerHTML = keep; elStages.innerHTML = ''; elNums.innerHTML = '';
      INS.p = null; INS.tr = null; INS.stages = [];
    }
    var resizeT = 0;
    window.addEventListener('resize', function () { clearTimeout(resizeT); resizeT = setTimeout(reserve, 120); });
    INS_API.reserve = reserve;
    try { if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { reserve(); if (S.net) reserveLegend(); }); } catch (e) { /* no font API */ }
    INS_API.pickAt = pickAt; INS_API.close = close; INS_API.tick = tick; INS_API.select = select; INS_API.setStage = setStage; INS_API.state = INS;
    insSpeed.el.querySelector('input').addEventListener('input', function () { if (INS.on && insSpeed.ms() <= 0 && INS.playing) { INS.playing = false; setStage(last(), 1); } });
    syncButtons();
  })();

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
    if (S.running && S.T && S.tool !== 'predict' && S.tool !== 'inspect') {
      S.acc += dt * EPS[S.speed] * S.T.stepsPerEpoch;
      var k = Math.min(80, Math.floor(S.acc)); S.acc -= Math.floor(S.acc); if (S.acc > 100) S.acc = 0;
      var t0 = performance.now();
      while (k > 0 && performance.now() - t0 < 9) { S.T.step(1); k--; }
      S.dirty = true; checkEvents();
    }
    if (INS_API.tick) INS_API.tick(dt);
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
  window.__np = { INS: INS, INS_API: INS_API, S: S, loadScenario: loadScenario, setRunning: setRunning, setTool: setTool, rebuildNet: rebuildNet, regenData: regenData, addProbe: addProbe };

  loadScenario('sandbox');
  sizeCanvases();
  S.curveForce = true;
  requestAnimationFrame(frame);
})();
