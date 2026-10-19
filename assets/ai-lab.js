/* Learn the Function — mini-lab for CO1005 Chapter 11 (Artificial Intelligence).
   Panel 1: fit a straight line to house prices by hand, then by gradient descent (TRAINING),
            then use the frozen line on a new house (INFERENCE).
   Panel 2: a tiny two-feature spam classifier (logistic regression) whose decision boundary
            moves while it trains, plus a "biased sample" switch.
   A TOY: two or three numbers, no neural network, nothing like ChatGPT inside.
   Pure engine (no DOM) is exported for Node tests; the UI mounts into #ai-root. */
(function (global) {
  'use strict';

  /* ───────────── data ───────────── */
  // Textbook Table 4.1: size (m²), price (thousand $)
  var HOUSES5 = [[90, 280], [100, 295], [110, 340], [120, 350], [130, 400]];
  // Table 4.4 adds two more sales (95 m² → 300 k$, 125 m² → 360 k$)
  var HOUSES7 = HOUSES5.concat([[95, 300], [125, 360]]);
  // Table 4.6: invented ultra-luxury villas, price in thousand $
  var VILLAS = [[200, 11600], [1000, 98000], [1500, 234800], [1700, 311900], [1800, 320600]];

  /* ───────────── regression engine ───────────── */
  function predict(p, x) { return p.a * x + p.b; }

  function residuals(data, p) {            // actual − predicted, as in textbook Table 4.2
    return data.map(function (d) { return d[1] - predict(p, d[0]); });
  }
  function sse(data, p) {
    var s = 0;
    data.forEach(function (d) { var r = d[1] - predict(p, d[0]); s += r * r; });
    return s;
  }
  function gradient(data, p) {             // dL/da, dL/db of the sum of squared errors
    var da = 0, db = 0;
    data.forEach(function (d) { var r = d[1] - predict(p, d[0]); da += -2 * d[0] * r; db += -2 * r; });
    return { da: da, db: db };
  }
  function meanX(data) {
    var s = 0; data.forEach(function (d) { s += d[0]; });
    return s / data.length;
  }
  /* One gradient-descent step. center=true measures x from its mean first (same line, easier
     landscape); the returned a, b are always in the original units. */
  function gdStep(data, p, eta, center) {
    var shift = center ? meanX(data) : 0;
    var bc = p.b + p.a * shift;            // intercept at u = x − shift
    var da = 0, db = 0;
    data.forEach(function (d) {
      var u = d[0] - shift, r = d[1] - (p.a * u + bc);
      da += -2 * u * r; db += -2 * r;
    });
    var a2 = p.a - eta * da, bc2 = bc - eta * db;
    return { a: a2, b: bc2 - a2 * shift, da: da, db: db };
  }
  function train(data, p0, eta, steps, center) {
    var p = { a: p0.a, b: p0.b }, hist = [{ step: 0, a: p.a, b: p.b, sse: sse(data, p) }];
    for (var i = 1; i <= steps; i++) {
      var n = gdStep(data, p, eta, center);
      p = { a: n.a, b: n.b };
      hist.push({ step: i, a: p.a, b: p.b, sse: sse(data, p), da: n.da, db: n.db });
    }
    return { p: p, history: hist };
  }
  function fitLine(data) {                 // closed-form least squares
    var n = data.length, mx = meanX(data), my = 0, sxy = 0, sxx = 0;
    data.forEach(function (d) { my += d[1]; }); my /= n;
    data.forEach(function (d) { sxy += (d[0] - mx) * (d[1] - my); sxx += (d[0] - mx) * (d[0] - mx); });
    var a = sxy / sxx;
    return { a: a, b: my - a * mx };
  }
  function solve3(A, B) {                  // Gaussian elimination with partial pivoting
    var n = B.length, i, r, c, f;
    for (i = 0; i < n; i++) {
      var piv = i;
      for (r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[piv][i])) piv = r;
      var t = A[i]; A[i] = A[piv]; A[piv] = t; t = B[i]; B[i] = B[piv]; B[piv] = t;
      for (r = i + 1; r < n; r++) {
        f = A[r][i] / A[i][i];
        for (c = i; c < n; c++) A[r][c] -= f * A[i][c];
        B[r] -= f * B[i];
      }
    }
    var x = [0, 0, 0];
    for (i = n - 1; i >= 0; i--) {
      var s = B[i];
      for (c = i + 1; c < n; c++) s -= A[i][c] * x[c];
      x[i] = s / A[i][i];
    }
    return x;
  }
  function fitQuadratic(data) {            // y = a x² + b x + c, closed-form least squares
    var s = 1000, A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], B = [0, 0, 0];
    data.forEach(function (d) {
      var t = d[0] / s, f = [t * t, t, 1];
      for (var i = 0; i < 3; i++) { for (var j = 0; j < 3; j++) A[i][j] += f[i] * f[j]; B[i] += f[i] * d[1]; }
    });
    var q = solve3(A, B);
    return { a: q[0] / (s * s), b: q[1] / s, c: q[2] };
  }
  function predictQuadratic(q, x) { return q.a * x * x + q.b * x + q.c; }
  function sseQuadratic(data, q) {
    var s = 0; data.forEach(function (d) { var r = d[1] - predictQuadratic(q, d[0]); s += r * r; });
    return s;
  }

  /* ───────────── classifier engine (logistic regression, 2 features) ───────────── */
  function rng(seed) {
    var s = seed >>> 0;
    return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  }
  function gauss(r) { return (r() + r() + r() + r() - 2) * Math.sqrt(3); }   // ≈ N(0,1), no Math.log/cos
  function blob(r, n, cx, cy, sd, y, tag) {
    var out = [];
    function clip(v) { return Math.min(9.8, Math.max(0.2, Math.round(v * 10) / 10)); }
    for (var i = 0; i < n; i++) out.push({ x1: clip(cx + sd * gauss(r)), x2: clip(cy + sd * gauss(r)), y: y, tag: tag });
    return out;
  }
  /* x1 = number of links, x2 = number of ALL-CAPS words, y = 1 for spam, 0 for not spam.
     "news" are legitimate club newsletters (many links, some caps). */
  function makeSpamSets(biased) {
    var r = rng(9);
    var ham = blob(r, 16, 2.6, 2.8, 1.1, 0, 'ham');
    var spam = blob(r, 16, 7, 6.8, 1.2, 1, 'spam');
    var newsTrain = blob(r, 6, 5.0, 4.4, 0.6, 0, 'news');
    var newsTest = blob(r, 8, 5.0, 4.4, 0.6, 0, 'news-test');
    var extra = blob(r, 14, 5.0, 4.6, 0.6, 1, 'extra');   // always drawn, so the other points never change
    var train = ham.concat(spam, newsTrain);
    if (biased) train = train.concat(extra);
    return { train: train, test: newsTest, extra: extra };
  }
  function sigmoid(z) { return 1 / (1 + Math.exp(-z)); }
  function clfNew() { return { w1: 0, w2: 0, b: 0, step: 0 }; }
  function clfProb(m, x1, x2) { return sigmoid(m.w1 * x1 / 10 + m.w2 * x2 / 10 + m.b); }   // features scaled to 0..1
  function clfLoss(data, m) {
    var s = 0;
    data.forEach(function (p) {
      var q = Math.min(1 - 1e-12, Math.max(1e-12, clfProb(m, p.x1, p.x2)));
      s += -(p.y * Math.log(q) + (1 - p.y) * Math.log(1 - q));
    });
    return s / data.length;
  }
  function clfStep(data, m, eta) {
    var g1 = 0, g2 = 0, gb = 0, n = data.length;
    data.forEach(function (p) {
      var e = clfProb(m, p.x1, p.x2) - p.y;
      g1 += e * p.x1 / 10; g2 += e * p.x2 / 10; gb += e;
    });
    return { w1: m.w1 - eta * g1 / n, w2: m.w2 - eta * g2 / n, b: m.b - eta * gb / n, step: m.step + 1 };
  }
  function clfTrain(data, m, eta, steps) {
    for (var i = 0; i < steps; i++) m = clfStep(data, m, eta);
    return m;
  }
  function clfAccuracy(data, m) {
    if (!data.length) return 0;
    var ok = 0;
    data.forEach(function (p) { if ((clfProb(m, p.x1, p.x2) >= 0.5 ? 1 : 0) === p.y) ok++; });
    return ok / data.length;
  }

  var AILab = {
    HOUSES5: HOUSES5, HOUSES7: HOUSES7, VILLAS: VILLAS,
    predict: predict, residuals: residuals, sse: sse, gradient: gradient, gdStep: gdStep, train: train,
    fitLine: fitLine, fitQuadratic: fitQuadratic, predictQuadratic: predictQuadratic, sseQuadratic: sseQuadratic,
    makeSpamSets: makeSpamSets, clfNew: clfNew, clfProb: clfProb, clfLoss: clfLoss, clfStep: clfStep,
    clfTrain: clfTrain, clfAccuracy: clfAccuracy
  };

  /* ───────────── UI ───────────── */
  var SVGNS = 'http://www.w3.org/2000/svg';
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html !== undefined) n.innerHTML = html;
    return n;
  }
  function fmt(v, d) {
    if (!isFinite(v)) return String(v);
    var s = Math.abs(v) >= 1e6 ? v.toExponential(3) : v.toFixed(d === undefined ? 3 : d);
    return s;
  }
  /* ───────────── pipeline view (Data → Model → Prediction → Loss → Optimizer → Model) ───────────── */
  var NAMES = { data: 'Data', model: 'Model', pred: 'Prediction', loss: 'Loss', opt: 'Optimizer' };
  function kc(k, t) { return '<span class="af-k af-c-' + k + '">' + (t || NAMES[k]) + '</span>'; }   // component name chip: colour + text
  function hop(a, b) { return kc(a) + ' → ' + kc(b); }
  var MODE_NARR = {
    train: '<strong>Training loop.</strong> Press a step button: the ' + kc('data') + ' goes through the ' + kc('model') + ', the ' + kc('pred') + ' is compared with the right answer in the ' + kc('loss') + ', and the ' + kc('opt') + ' sends new parameters back into the model.',
    infer: '<strong>Inference.</strong> The parameters are <strong>frozen</strong>: a new input goes in, a ' + kc('pred') + ' comes out. There are no right answers, so ' + kc('loss') + ' and ' + kc('opt') + ' are greyed out (dashed) and nothing is learned.'
  };
  var SPEEDERS = [];   // both panels share one speed
  function buildFlow(parent, o) {
    var box = el('div', 'af-diagram');
    var modes = el('div', 'af-modes');
    var tabs = {};
    [['train', 'Training loop'], ['infer', 'Inference (frozen)']].forEach(function (m) {
      var b = el('button', '', m[1]); b.type = 'button'; b.setAttribute('data-mode', m[0]); b.setAttribute('aria-pressed', m[0] === 'train' ? 'true' : 'false');
      modes.appendChild(b); tabs[m[0]] = b;
    });
    modes.appendChild(el('span', 'af-modes-note', o.note || 'A simulation of the loop — every arrow is a real step of the calculation.'));
    box.appendChild(modes);
    var bar = el('div', 'af-flowbar');
    var speed = AIFlow.speedControl({ unit: 'arrow', onChange: function (v) { SPEEDERS.forEach(function (o) { if (o !== speed) o.set(v); }); } });
    SPEEDERS.push(speed);
    var pauseB = el('button', 'btn ghost small', '⏸ Pause'); pauseB.type = 'button'; pauseB.setAttribute('aria-pressed', 'false');
    var nextB = el('button', 'btn ghost small', 'Next arrow ▶'); nextB.type = 'button'; nextB.disabled = true;
    bar.appendChild(speed.el); bar.appendChild(pauseB); bar.appendChild(nextB);
    box.appendChild(bar);
    var host = el('div'); box.appendChild(host);
    var narr = el('div', 'af-narr'); narr.setAttribute('aria-live', 'polite'); narr.innerHTML = MODE_NARR.train;
    box.appendChild(narr);
    parent.appendChild(box);
    var pipe = AIFlow.createPipeline(host, { titles: o.titles, aria: o.aria });
    var F = { pipe: pipe, narr: narr, busy: false, speed: speed, maxH: 0 };
    function ratchet() {   // the narration box only ever grows, so nothing below it jumps from step to step
      var h = narr.offsetHeight; if (h > F.maxH) { F.maxH = h; narr.style.minHeight = h + 'px'; }
    }
    window.addEventListener('resize', function () { F.maxH = 0; narr.style.minHeight = ''; });
    var runner = AIFlow.createRunner(pipe, speed, {
      onState: function (st) {
        pauseB.textContent = st.paused ? '▶ Resume' : '⏸ Pause'; pauseB.setAttribute('aria-pressed', st.paused ? 'true' : 'false');
        nextB.disabled = !st.waiting; F.busy = st.active; if (o.onBusy) o.onBusy(st.active);
      },
      wait: function (ev) { narr.innerHTML = '<strong>Paused.</strong> Press “Next arrow” (or Resume). Coming up: ' + ev.title + '.'; ratchet(); }
    });
    F.runner = runner;
    F.setMode = function (m, quiet) {
      pipe.setMode(m); tabs.train.setAttribute('aria-pressed', m === 'train' ? 'true' : 'false'); tabs.infer.setAttribute('aria-pressed', m === 'infer' ? 'true' : 'false');
      o.paint(m); if (!quiet) { narr.innerHTML = MODE_NARR[m]; ratchet(); }
    };
    F.paint = function () { o.paint(pipe.mode()); };
    F.mk = function (title, flows, text, land) {
      return { title: title, flows: flows, begin: function () { narr.innerHTML = typeof text === 'function' ? text() : text; ratchet(); if (o.begin) o.begin(); }, land: land };
    };
    F.run = function (events, mode) { F.setMode(mode, true); return runner.start(events); };
    tabs.train.addEventListener('click', function () { runner.finish(); F.setMode('train'); });
    tabs.infer.addEventListener('click', function () { runner.finish(); F.setMode('infer'); });
    pauseB.addEventListener('click', function () { runner.togglePause(); });
    nextB.addEventListener('click', function () { runner.step(); });
    return F;
  }
  function setLines(pipe, lines) { Object.keys(lines).forEach(function (id) { pipe.setBlock(id, lines[id]); }); }

  function niceTicks(lo, hi, n) {
    var raw = (hi - lo) / n, mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)), step = mag;
    [1, 2, 5, 10].forEach(function (m) { if (raw > step) step = m * mag; });
    var out = [];
    for (var v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v / step) * step);
    return out;
  }

  var DATASETS = [
    { key: 'h5', name: '5 houses (textbook Table 4.1)', data: HOUSES5, trainable: true,
      aMax: 6, aStep: 0.05, bMin: -100, bMax: 100, bStep: 1, start: { a: 1, b: 150 },
      xlab: 'size (m²)', ylab: 'price (thousand $)', xs: 'm²', unit: 'thousand $', predictX: 140 },
    { key: 'h7', name: '7 houses (after two more sales, Table 4.4)', data: HOUSES7, trainable: true,
      aMax: 6, aStep: 0.05, bMin: -100, bMax: 100, bStep: 1, start: { a: 1, b: 150 },
      xlab: 'size (m²)', ylab: 'price (thousand $)', xs: 'm²', unit: 'thousand $', predictX: 140 },
    { key: 'vl', name: 'Ultra-luxury villas (Table 4.6): a line is the wrong shape', data: VILLAS, trainable: false,
      aMax: 400, aStep: 1, bMin: -80000, bMax: 40000, bStep: 100, start: { a: 100, b: 0 },
      xlab: 'size (m²)', ylab: 'price (thousand $)', xs: 'm²', unit: 'thousand $', predictX: 1200 }
  ];

  function mount() {
    var host = document.getElementById('ai-root');
    if (!host) return;

    host.appendChild(el('div', 'note warn ai-toy',
      '<span class="note-tag">A toy, on purpose</span>' +
      'Everything below uses a handful of numbers and two or three parameters, and it runs in your browser. ' +
      '<strong>This is not how ChatGPT works inside</strong> — a large model has billions of parameters and a far more complicated function. ' +
      'But the loop you will watch here (guess the parameters, measure the error, nudge the parameters, repeat) is the same idea at the bottom of all of them.'));

    /* ============ Panel 1 ============ */
    var p1 = el('div', 'run-panel ai-panel');
    p1.appendChild(el('h4', '', 'Panel 1 · Learn a line: house size → price'));
    p1.appendChild(el('p', 'ai-lede',
      'The function is <span class="mono">F(x) = a·x + b</span>. Its two <strong>parameters</strong> <span class="mono">a</span> and <span class="mono">b</span> are what the model “knows”. ' +
      'First set them by hand, then let the computer search for good values.'));

    var dsRow = el('div', 'ex-actions');
    var dsSel = el('select', 'preset-select');
    dsSel.setAttribute('aria-label', 'Dataset');
    DATASETS.forEach(function (d, i) { var o = el('option'); o.value = String(i); o.textContent = d.name; dsSel.appendChild(o); });
    dsRow.appendChild(dsSel);
    var bestBtn = el('button', 'btn ghost small', 'Jump to the exact best line');
    bestBtn.type = 'button';
    var startBtn = el('button', 'btn ghost small', '↺ Back to the starting line');
    startBtn.type = 'button';
    dsRow.appendChild(startBtn); dsRow.appendChild(bestBtn);
    p1.appendChild(dsRow);

    var chartWrap = el('div', 'ai-chart');
    var svg1 = document.createElementNS(SVGNS, 'svg');
    svg1.setAttribute('viewBox', '0 0 560 330');
    svg1.setAttribute('role', 'img');
    svg1.setAttribute('class', 'ai-svg');
    chartWrap.appendChild(svg1);
    p1.appendChild(chartWrap);
    p1.appendChild(el('div', 'ai-legend',
      '<span><svg viewBox="0 0 14 14" class="ai-lg"><circle class="ai-pt" cx="7" cy="7" r="5"/></svg>' + kc('data', 'Data') + ' the examples (x, y)</span>' +
      '<span><svg viewBox="0 0 14 14" class="ai-lg"><line class="ai-fit" x1="1" y1="11" x2="13" y2="3"/></svg>' + kc('model', 'Model') + ' the line F(x) = a·x + b</span>' +
      '<span><svg viewBox="0 0 14 14" class="ai-lg"><line class="ai-resid" x1="7" y1="1" x2="7" y2="13"/></svg>error y − ŷ, the pieces the ' + kc('loss', 'Loss') + ' adds up</span>' +
      '<span><svg viewBox="0 0 14 14" class="ai-lg"><circle class="ai-probe" cx="7" cy="7" r="5"/></svg>' + kc('pred', 'Prediction') + ' ŷ for a new x</span>'));

    var sliders = el('div', 'ai-sliders');
    function sliderField(id, label) {
      var w = el('div', 'ai-field');
      var l = el('label', 'field-label', label); l.setAttribute('for', id);
      var inp = el('input'); inp.type = 'range'; inp.id = id;
      var out = el('output', 'mono ai-out'); out.setAttribute('for', id);
      w.appendChild(l); w.appendChild(inp); w.appendChild(out);
      sliders.appendChild(w);
      return { inp: inp, out: out };
    }
    var sa = sliderField('ai-a', 'a — slope (price change per extra m²)');
    var sb = sliderField('ai-b', 'b — intercept (where the line starts)');
    p1.appendChild(sliders);

    var readout = el('div', 'ai-readout');
    readout.setAttribute('aria-live', 'polite');
    p1.appendChild(readout);

    var resBox = el('div', 'tbl-scroll');
    p1.appendChild(resBox);

    /* training */
    p1.appendChild(el('h5', 'ai-sub', 'Training — let gradient descent adjust a and b'));
    p1.appendChild(el('p', 'ai-hint',
      'Each step measures which way the error grows (the <em>gradient</em>) and moves a and b a little the other way. ' +
      'The <strong>learning rate</strong> η is the size of that little move: too small and training crawls, too big and it overshoots and blows up. (Try η ≈ 10⁻⁵ as is; about 8×10⁻⁴ after ticking “Centre x”.)'));
    var tr = el('div', 'ai-train');
    var etaWrap = el('div', 'ai-field');
    var etaL = el('label', 'field-label', 'Learning rate η'); etaL.setAttribute('for', 'ai-eta');
    var etaIn = el('input'); etaIn.type = 'range'; etaIn.id = 'ai-eta'; etaIn.min = '-7'; etaIn.max = '-1'; etaIn.step = '0.1';
    var etaOut = el('output', 'mono ai-out'); etaOut.setAttribute('for', 'ai-eta');
    etaWrap.appendChild(etaL); etaWrap.appendChild(etaIn); etaWrap.appendChild(etaOut);
    tr.appendChild(etaWrap);
    var cenWrap = el('label', 'ai-check');
    var cen = el('input'); cen.type = 'checkbox';
    cenWrap.appendChild(cen);
    cenWrap.appendChild(document.createTextNode(' Centre x first (measure size from the average size — same line, easier to train)'));
    tr.appendChild(cenWrap);
    p1.appendChild(tr);

    var tb = el('div', 'ex-actions');
    var b1 = el('button', 'btn primary', '⏭ 1 step'); b1.type = 'button';
    var b10 = el('button', 'btn ghost', '×10'); b10.type = 'button';
    var b100 = el('button', 'btn ghost', '×100'); b100.type = 'button';
    var b1000 = el('button', 'btn ghost', '×1000'); b1000.type = 'button';
    tb.appendChild(b1); tb.appendChild(b10); tb.appendChild(b100); tb.appendChild(b1000);
    p1.appendChild(tb);

    var status1 = el('div', 'sim-status');
    status1.setAttribute('role', 'status');
    p1.appendChild(status1);

    var flow1 = buildFlow(p1, {
      titles: { model: 'MODEL', pred: 'PREDICTION' }, aria: 'Training pipeline for the house-price line: data, model F(x) = a x + b, prediction, loss, optimizer, updated parameters back into the model',
      paint: function (m) { paintFlow1(m); },
      onBusy: function (b) { flowBusy1 = b; setStepButtons(); }
    });
    var flowBusy1 = false;
    function setStepButtons() {
      var can = ds.trainable && !flowBusy1;
      [b1, b10, b100, b1000].forEach(function (b) { b.disabled = !can; });
    }

    var trCols = el('div', 'run-cols');
    var colL = el('div');
    colL.appendChild(el('label', 'field-label', 'Last update (what just happened)'));
    var logBox = el('div', 'term ai-log');
    colL.appendChild(logBox);
    var colR = el('div');
    colR.appendChild(el('label', 'field-label', 'Loss curve — extra error above the best possible (log scale)'));
    var svgLoss = document.createElementNS(SVGNS, 'svg');
    svgLoss.setAttribute('viewBox', '0 0 360 150'); svgLoss.setAttribute('class', 'ai-svg ai-svg-loss'); svgLoss.setAttribute('role', 'img');
    colR.appendChild(svgLoss);
    trCols.appendChild(colL); trCols.appendChild(colR);
    p1.appendChild(trCols);

    /* inference */
    p1.appendChild(el('h5', 'ai-sub', 'Inference — use the finished line on a house it has never seen'));
    p1.appendChild(el('p', 'ai-hint',
      'Now nothing is learned. The parameters stay <strong>frozen</strong> and the function is simply evaluated: x goes in, a prediction comes out. ' +
      'Training is the slow, expensive part; inference is the cheap part you do every day.'));
    var inf = el('div', 'ex-actions');
    var infL = el('label', 'field-label', 'New house size (m²)'); infL.setAttribute('for', 'ai-x');
    var infIn = el('input', 'ai-num'); infIn.type = 'number'; infIn.id = 'ai-x'; infIn.step = '1';
    var infBtn = el('button', 'btn primary', 'Predict price'); infBtn.type = 'button';
    inf.appendChild(infL); inf.appendChild(infIn); inf.appendChild(infBtn);
    p1.appendChild(inf);
    var infOut = el('div', 'ai-readout');
    infOut.setAttribute('aria-live', 'polite');
    p1.appendChild(infOut);
    host.appendChild(p1);

    /* ---- state for panel 1 ---- */
    var ds = DATASETS[0], par = { a: 3, b: 3 }, hist = [], best = null, quad = null, shownX = null;
    var trained = 0, broken = false;

    /* ---- pipeline view for panel 1 ---- */
    var V1 = {}, VI1 = {};
    function dataLines1() {
      var xs = ds.data.map(function (d) { return d[0]; }), ys = ds.data.map(function (d) { return d[1]; });
      return [ds.data.length + ' examples', 'x: ' + Math.min.apply(null, xs) + '…' + Math.max.apply(null, xs), 'y: ' + Math.min.apply(null, ys) + '…' + Math.max.apply(null, ys)];
    }
    function modelLines1(p) { return ['F(x) = a·x + b', 'a = ' + fmt(p.a, 3), 'b = ' + fmt(p.b, 2)]; }
    function predLines1(p) { var d0 = ds.data[0]; return ['ŷ = F(x)', 'x=' + d0[0] + ' → ' + fmt(predict(p, d0[0]), 0), 'true y = ' + d0[1]]; }
    function lossLines1(p) { return ['L = Σ(y − ŷ)²', fmt(sse(ds.data, p), 1), 'best ' + fmt(best.sse, 1)]; }
    function resetView1() {
      V1 = { data: dataLines1(), model: modelLines1(par), pred: predLines1(par), loss: lossLines1(par), opt: ['η = ' + etaText(), 'no step yet', ''] };
      var x = parseFloat(infIn.value);
      VI1 = { data: ['x = ' + (isFinite(x) ? fmt(x, 0) : '?') + ' ' + ds.xs, 'no y known', '(a new house)'], model: modelLines1(par), pred: ['ŷ = F(x)', 'press Predict', ''] };
      paintFlow1(flow1.pipe.mode());
    }
    function paintFlow1(m) {
      var pp = flow1.pipe;
      if (m === 'infer') {
        setLines(pp, { data: VI1.data, model: VI1.model, pred: VI1.pred, loss: ['not used', 'at inference', ''], opt: ['not used', 'weights frozen', ''] });
        pp.setTitle('data', 'NEW INPUT'); pp.setTag('model', 'frozen'); pp.setTag('data', '');
      } else {
        setLines(pp, V1); pp.setTitle('data', 'DATA'); pp.setTag('model', 'learning'); pp.setTag('data', '');
      }
    }
    function syncModel1() { V1.model = modelLines1(par); VI1.model = modelLines1(par); paintFlow1(flow1.pipe.mode()); }

    function cfg() {
      sa.inp.min = '0'; sa.inp.max = String(ds.aMax); sa.inp.step = String(ds.aStep);
      sb.inp.min = String(ds.bMin); sb.inp.max = String(ds.bMax); sb.inp.step = String(ds.bStep);
    }
    function etaValue() { return Math.pow(10, parseFloat(etaIn.value)); }
    function etaText() { var e = etaValue(); return e < 0.001 ? e.toExponential(1) : e.toFixed(4); }

    function chart1() {
      var W = 560, H = 330, L = 70, R = 14, T = 12, B = 44, data = ds.data, i;
      var xs = data.map(function (d) { return d[0]; }), ys = data.map(function (d) { return d[1]; });
      var xlo = Math.min.apply(null, xs), xhi = Math.max.apply(null, xs), pad = (xhi - xlo) * 0.12;
      xlo = Math.max(0, xlo - pad); xhi += pad;
      var yhi = Math.max.apply(null, ys) * 1.12, ylo = 0;
      function X(v) { return L + (v - xlo) / (xhi - xlo) * (W - L - R); }
      function Y(v) { return H - B - (v - ylo) / (yhi - ylo) * (H - B - T); }
      var g = '';
      niceTicks(ylo, yhi, 5).forEach(function (t) {
        g += '<line class="ai-grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(t) + '" y2="' + Y(t) + '"/>' +
             '<text class="ai-tick" x="' + (L - 6) + '" y="' + (Y(t) + 4) + '" text-anchor="end">' + t + '</text>';
      });
      niceTicks(xlo, xhi, 6).forEach(function (t) {
        g += '<line class="ai-grid" x1="' + X(t) + '" x2="' + X(t) + '" y1="' + T + '" y2="' + (H - B) + '"/>' +
             '<text class="ai-tick" x="' + X(t) + '" y="' + (H - B + 16) + '" text-anchor="middle">' + t + '</text>';
      });
      g += '<text class="ai-axis" x="' + ((L + W - R) / 2) + '" y="' + (H - 6) + '" text-anchor="middle">' + ds.xlab + '</text>';
      g += '<text class="ai-axis" transform="translate(13 ' + ((T + H - B) / 2) + ') rotate(-90)" text-anchor="middle">' + ds.ylab + '</text>';
      g += '<clipPath id="ai-clip"><rect x="' + L + '" y="' + T + '" width="' + (W - L - R) + '" height="' + (H - B - T) + '"/></clipPath>';
      g += '<g clip-path="url(#ai-clip)">';
      if (quad) {
        var d = '';
        for (i = 0; i <= 60; i++) { var xv = xlo + (xhi - xlo) * i / 60; d += (i ? 'L' : 'M') + X(xv).toFixed(1) + ' ' + Y(predictQuadratic(quad, xv)).toFixed(1); }
        g += '<path class="ai-curve" d="' + d + '"/>';
      }
      data.forEach(function (pt) {
        var yp = predict(par, pt[0]);
        g += '<line class="ai-resid" x1="' + X(pt[0]) + '" x2="' + X(pt[0]) + '" y1="' + Y(pt[1]) + '" y2="' + Y(yp) + '"/>';
      });
      g += '<line class="ai-fit" x1="' + X(xlo) + '" y1="' + Y(predict(par, xlo)) + '" x2="' + X(xhi) + '" y2="' + Y(predict(par, xhi)) + '"/>';
      g += '</g>';
      data.forEach(function (pt) { g += '<circle class="ai-pt" cx="' + X(pt[0]) + '" cy="' + Y(pt[1]) + '" r="5"/>'; });
      if (shownX !== null) {
        var yy = predict(par, shownX);
        g += '<g clip-path="url(#ai-clip)"><line class="ai-probe-l" x1="' + X(shownX) + '" x2="' + X(shownX) + '" y1="' + Y(0) + '" y2="' + Y(yy) + '"/>' +
             '<circle class="ai-probe" cx="' + X(shownX) + '" cy="' + Y(yy) + '" r="6.5"/></g>';
      }
      svg1.innerHTML = g;
      svg1.setAttribute('aria-label', 'Scatter plot of ' + data.length + ' points with the line y = ' + fmt(par.a, 2) + ' x + ' + fmt(par.b, 1) +
        '; red segments show each error. Sum of squared errors ' + fmt(sse(data, par), 1) + '.');
    }

    function tableAndReadout() {
      var data = ds.data, L = sse(data, par), rs = residuals(data, par);
      var html = '<table class="tbl ai-tbl"><tr><th>x</th><th>actual</th><th>predicted</th><th>error = actual − predicted</th><th>error²</th></tr>';
      data.forEach(function (d, i) {
        html += '<tr><td>' + d[0] + '</td><td>' + d[1] + '</td><td>' + fmt(predict(par, d[0]), 1) + '</td><td>' + fmt(rs[i], 1) + '</td><td>' + fmt(rs[i] * rs[i], 1) + '</td></tr>';
      });
      html += '</table>';
      resBox.innerHTML = html;
      var ex = L - best.sse;
      readout.innerHTML = 'Your line: <span class="mono">y = ' + fmt(par.a, 3) + '·x ' + (par.b < 0 ? '− ' : '+ ') + fmt(Math.abs(par.b), 2) + '</span> &nbsp;·&nbsp; ' +
        'total squared error <strong class="mono">L = ' + fmt(L, 1) + '</strong> &nbsp;·&nbsp; ' +
        'best possible <span class="mono">' + fmt(best.sse, 1) + '</span>' +
        (ex < 0.05 * best.sse + 1e-9 ? ' <span class="ai-good">— essentially optimal</span>' : '');
      if (quad && ds.key === 'vl') {
        readout.innerHTML += '<br>A curve <span class="mono">y = ax² + bx + c</span> (best quadratic, dashed) would get <span class="mono">' + fmt(sseQuadratic(data, quad), 0) + '</span> — ' +
          'about ' + fmt(best.sse / sseQuadratic(data, quad), 1) + '× smaller than the best line. The model <em>family</em> matters, not just its parameters.';
      }
    }

    function syncSliders() {
      sa.inp.value = String(par.a); sb.inp.value = String(par.b);
      sa.out.textContent = fmt(par.a, 3); sb.out.textContent = fmt(par.b, 2);
    }

    function lossChart() {
      var W = 360, H = 150, L = 38, R = 8, T = 8, B = 24, g = '';
      if (hist.length < 2) {
        svgLoss.innerHTML = '<text class="ai-tick" x="' + (W / 2) + '" y="' + (H / 2) + '" text-anchor="middle">Press a step button to start training.</text>';
        svgLoss.setAttribute('aria-label', 'Loss curve: no training yet.');
        return;
      }
      var pts = hist, step = Math.max(1, Math.ceil(pts.length / 300)), vals = [];
      for (var i = 0; i < pts.length; i += step) vals.push([pts[i].step, Math.max(1e-4, pts[i].sse - best.sse)]);
      var last = pts[pts.length - 1]; if (vals[vals.length - 1][0] !== last.step) vals.push([last.step, Math.max(1e-4, last.sse - best.sse)]);
      var logs = vals.map(function (v) { return Math.log(v[1]) / Math.LN10; });
      var lo = Math.floor(Math.min.apply(null, logs)), hi = Math.ceil(Math.max.apply(null, logs));
      if (!isFinite(hi) || hi > 12) hi = 12;
      if (hi <= lo) hi = lo + 1;
      var smax = Math.max(1, last.step);
      function X(s) { return L + s / smax * (W - L - R); }
      function Y(l) { return T + (hi - Math.min(hi, l)) / (hi - lo) * (H - T - B); }
      for (var k = lo; k <= hi; k++) {
        g += '<line class="ai-grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(k) + '" y2="' + Y(k) + '"/><text class="ai-tick" x="' + (L - 4) + '" y="' + (Y(k) + 4) + '" text-anchor="end">10' + sup(k) + '</text>';
      }
      var d = '';
      vals.forEach(function (v, j) { d += (j ? 'L' : 'M') + X(v[0]).toFixed(1) + ' ' + Y(logs[j]).toFixed(1); });
      g += '<path class="ai-loss" d="' + d + '"/>';
      g += '<text class="ai-axis" x="' + ((L + W - R) / 2) + '" y="' + (H - 4) + '" text-anchor="middle">training step (0 … ' + last.step + ')</text>';
      svgLoss.innerHTML = g;
      svgLoss.setAttribute('aria-label', 'Loss curve over ' + last.step + ' steps: extra error went from ' + fmt(pts[0].sse - best.sse, 2) + ' to ' + fmt(last.sse - best.sse, 4) + '.');
    }
    function sup(n) {
      var m = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
      return String(n).split('').map(function (c) { return m[c] || c; }).join('');
    }

    function renderAll() {
      syncSliders(); chart1(); tableAndReadout(); lossChart();
      etaOut.textContent = etaText();
      var can = ds.trainable;
      setStepButtons();
      etaIn.disabled = !can; cen.disabled = !can;
      syncModel1();
    }

    function loadDataset(i) {
      ds = DATASETS[i]; cfg();
      par = { a: ds.start.a, b: ds.start.b };
      best = fitLine(ds.data); best.sse = sse(ds.data, best);
      quad = ds.key === 'vl' ? fitQuadratic(ds.data) : null;
      hist = [{ step: 0, a: par.a, b: par.b, sse: sse(ds.data, par) }]; trained = 0; broken = false;
      flow1.runner.cancel(); shownX = null; infIn.value = String(ds.predictX); infOut.textContent = '';
      logBox.innerHTML = '<span class="t-empty">No update yet.</span>';
      svg1.setAttribute('aria-label', '');
      status1.className = 'sim-status';
      status1.textContent = ds.trainable
        ? 'Ready. Drag the sliders to fit by hand, or press a step button to let gradient descent do it.'
        : 'Hand-fit only here: a straight line is the wrong shape for this data. Try the exact best line, then compare it with the dashed curve.';
      if (!ds.trainable) etaOut.textContent = '';
      etaIn.value = '-5'; cen.checked = false;
      resetView1(); flow1.setMode('train'); renderAll();
    }

    function doSteps(n) {
      if (!ds.trainable) return;
      flow1.runner.finish();
      var eta = etaValue(), c = cen.checked, last = null, exploded = false, p = { a: par.a, b: par.b }, t2 = trained, added = [], i;
      for (i = 0; i < n; i++) {
        var nx = gdStep(ds.data, p, eta, c);
        if (!isFinite(nx.a) || !isFinite(nx.b) || Math.abs(nx.a) > 1e9 || Math.abs(nx.b) > 1e12) { exploded = true; break; }
        last = { prev: { a: p.a, b: p.b }, g: nx, step: t2 + 1 };
        p = { a: nx.a, b: nx.b }; t2++;
        added.push({ step: t2, a: p.a, b: p.b, sse: sse(ds.data, p) });
      }
      var done = 0;
      function commit(upto) {   // adopt computed steps up to index `upto`
        var k = added.slice(done, upto); done = Math.max(done, upto);
        if (k.length) { par = { a: k[k.length - 1].a, b: k[k.length - 1].b }; trained = k[k.length - 1].step; hist = hist.concat(k); }
        if (hist.length > 6000) hist = hist.filter(function (h, j) { return j % 2 === 0 || j === hist.length - 1; });
      }
      function report() {
        logBox.textContent =
          'step ' + trained + (n > 1 ? '  (last of ' + n + ')' : '') + '\n' +
          'dL/da = ' + fmt(last.g.da, 3) + '   dL/db = ' + fmt(last.g.db, 3) + '\n' +
          'a: ' + fmt(last.prev.a, 4) + ' − ' + etaText() + '·' + fmt(last.g.da, 2) + ' = ' + fmt(par.a, 4) + '\n' +
          'b: ' + fmt(last.prev.b, 4) + ' → ' + fmt(par.b, 4) + '\n' +
          'L = ' + fmt(sse(ds.data, par), 3) + '   (best possible ' + fmt(best.sse, 3) + ')';
        var gap = sse(ds.data, par) - best.sse;
        status1.className = 'sim-status' + (gap < 0.5 ? ' done' : ' running');
        status1.textContent = gap < 0.5
          ? 'Training has converged: the parameters stopped changing in any way that matters. Now try inference below.'
          : 'Training… ' + trained + ' steps so far; still ' + fmt(gap, 2) + ' above the best possible error. Keep stepping' + (!c && trained > 20 ? ' (slow? tick “Centre x”)' : '') + '.';
      }
      if (exploded) {
        commit(added.length);
        broken = true;
        status1.className = 'sim-status';
        status1.textContent = 'Boom — η is too big: each step overshoots the valley further than the last, and the error explodes. Reset and pick a smaller learning rate.';
        logBox.textContent = 'The numbers grew without bound (overshoot). Learning rate ' + etaText() + ' is too large for this data' + (c ? '.' : ' — or try “Centre x”.');
        flow1.narr.innerHTML = '<strong>Overshoot.</strong> The optimizer’s update was so large that the new parameters made the loss bigger, step after step, until the numbers overflowed. Reset and choose a smaller learning rate η.';
        resetView1(); renderAll();
        return;
      }
      if (!last) return;
      commit(added.length - 1);           // earlier steps of a ×10/×100/×1000 press: no animation
      var pre = last.prev, g = last.g, post = { a: added[added.length - 1].a, b: added[added.length - 1].b }, N = ds.data.length;
      var before = n > 1 ? 'Step ' + last.step + ' of your ' + n + ' (the earlier ones ran without animation). ' : 'Step ' + last.step + '. ';
      resetView1(); renderAll();
      V1.opt = ['η = ' + etaText(), 'no gradient yet', '']; V1.model = modelLines1(pre); V1.pred = predLines1(pre); V1.loss = lossLines1(pre);
      var evs = [
        flow1.mk('Data → Model', [{ key: 'data>model', label: 'x ×' + N }],
          before + '<strong>① ' + hop('data', 'model') + '.</strong> The ' + N + ' inputs x (' + ds.xlab + ') go into the model <span class="mono">F(x) = a·x + b</span>, which currently has a = ' + fmt(pre.a, 3) + ', b = ' + fmt(pre.b, 2) + '.',
          function () { V1.model = modelLines1(pre); paintFlow1('train'); }),
        flow1.mk('Model → Prediction', [{ key: 'model>pred', label: 'ŷ ×' + N }],
          '<strong>② ' + hop('model', 'pred') + '.</strong> Each x becomes a guess ŷ = a·x + b. For the first example: ' + ds.data[0][0] + ' → ' + fmt(predict(pre, ds.data[0][0]), 1) + '.',
          function () { V1.pred = predLines1(pre); paintFlow1('train'); }),
        flow1.mk('Prediction and answers → Loss', [{ key: 'pred>loss', label: 'ŷ' }, { key: 'data>loss', label: 'y' }],
          '<strong>③ ' + kc('pred') + ' + right answers ' + kc('data', 'y') + ' → ' + kc('loss') + '.</strong> The guesses ŷ meet the true prices y. Loss = sum of (y − ŷ)² = <strong class="mono">' + fmt(sse(ds.data, pre), 1) + '</strong> (best possible ' + fmt(best.sse, 1) + ').',
          function () { V1.loss = lossLines1(pre); paintFlow1('train'); }),
        flow1.mk('Loss → Optimizer', [{ key: 'loss>opt', label: 'error' }],
          '<strong>④ ' + hop('loss', 'opt') + '.</strong> The optimizer asks: if I nudge a or b, how does the loss change? That slope is the gradient: ∂L/∂a = ' + fmt(g.da, 2) + ', ∂L/∂b = ' + fmt(g.db, 2) + '.',
          function () { V1.opt = ['η = ' + etaText(), '∂L/∂a = ' + fmt(g.da, 1), '∂L/∂b = ' + fmt(g.db, 1)]; paintFlow1('train'); }),
        flow1.mk('Optimizer → Model', [{ key: 'opt>model', label: 'new a, b' }],
          '<strong>⑤ ' + hop('opt', 'model') + '.</strong> Move against the slope: a ← ' + fmt(pre.a, 4) + ' − η·' + fmt(g.da, 2) + ' = <strong class="mono">' + fmt(post.a, 4) + '</strong>, b → <strong class="mono">' + fmt(post.b, 3) + '</strong>. The next step starts from these new parameters.',
          function () { V1.model = modelLines1(post); commit(added.length); report(); resetViewKeep(); renderAll(); })
      ];
      flow1.run(evs, 'train');
    }
    function resetViewKeep() { VI1.data = ['x = ' + fmt(parseFloat(infIn.value) || ds.predictX, 0) + ' ' + ds.xs, 'no y known', '(a new house)']; }

    sa.inp.addEventListener('input', function () { flow1.runner.finish(); broken = false; par.a = parseFloat(sa.inp.value); hist = [{ step: 0, a: par.a, b: par.b, sse: sse(ds.data, par) }]; trained = 0; resetView1(); renderAll(); });
    sb.inp.addEventListener('input', function () { flow1.runner.finish(); broken = false; par.b = parseFloat(sb.inp.value); hist = [{ step: 0, a: par.a, b: par.b, sse: sse(ds.data, par) }]; trained = 0; resetView1(); renderAll(); });
    etaIn.addEventListener('input', function () { etaOut.textContent = etaText(); });
    cen.addEventListener('change', function () {
      etaIn.value = cen.checked ? '-3.1' : '-5'; etaOut.textContent = etaText();
      status1.className = 'sim-status';
      status1.textContent = cen.checked
        ? 'Centring on: the slope now settles quickly and a larger η (about 8×10⁻⁴) is safe. The line you see is the same one; only the way we search for it changed.'
        : 'Centring off: back to raw sizes, where η must stay tiny (about 10⁻⁵) and the intercept b crawls.';
    });
    b1.addEventListener('click', function () { doSteps(1); });
    b10.addEventListener('click', function () { doSteps(10); });
    b100.addEventListener('click', function () { doSteps(100); });
    b1000.addEventListener('click', function () { doSteps(1000); });
    dsSel.addEventListener('change', function () { loadDataset(+dsSel.value); });
    startBtn.addEventListener('click', function () { loadDataset(+dsSel.value); });
    bestBtn.addEventListener('click', function () {
      flow1.runner.finish();
      par = { a: best.a, b: best.b }; hist = [{ step: 0, a: par.a, b: par.b, sse: sse(ds.data, par) }]; trained = 0; broken = false;
      status1.className = 'sim-status done';
      status1.textContent = 'This is the least-squares line from a formula — no search needed for a line. Gradient descent finds (almost) the same numbers by repeated small steps, and works for models with no formula.';
      resetView1(); renderAll();
    });
    infBtn.addEventListener('click', function () {
      flow1.runner.finish();
      var x = parseFloat(infIn.value);
      if (!isFinite(x)) { infOut.textContent = 'Type a number first.'; return; }
      if (broken) { infOut.textContent = 'The model blew up during training, so its numbers mean nothing. Press “Back to the starting line” and train again with a smaller learning rate.'; return; }
      var snap = { a: par.a, b: par.b }, yhat = predict(snap, x);
      VI1.data = ['x = ' + fmt(x, 0) + ' ' + ds.xs, 'no y known', '(a new house)']; VI1.model = modelLines1(snap); VI1.pred = ['ŷ = F(x)', 'waiting…', ''];
      var evs = [
        flow1.mk('New input → Model', [{ key: 'data>model', label: 'x=' + fmt(x, 0) }],
          '<strong>Inference ① ' + kc('data', 'New input') + ' → ' + kc('model') + '.</strong> A house the model has never seen (x = ' + fmt(x, 0) + ' ' + ds.xs + ') goes into F with the <strong>frozen</strong> parameters a = ' + fmt(snap.a, 3) + ', b = ' + fmt(snap.b, 2) + '. No right answer comes with it.', null),
        flow1.mk('Model → Prediction', [{ key: 'model>pred', label: 'ŷ' }],
          '<strong>Inference ② ' + hop('model', 'pred') + '.</strong> ŷ = ' + fmt(snap.a, 3) + ' × ' + fmt(x, 0) + ' ' + (snap.b < 0 ? '−' : '+') + ' ' + fmt(Math.abs(snap.b), 2) + ' = ' + fmt(yhat, 1) + ' ' + ds.unit + '. ' + kc('loss') + ' and ' + kc('opt') + ' stay grey: nothing is compared and nothing is learned.',
          function () {
            VI1.pred = ['ŷ = F(x)', fmt(yhat, 1), ds.unit]; paintFlow1('infer');
            shownX = x;
            infOut.innerHTML = '<span class="ai-tag">inference</span> F(' + fmt(x, 0) + ') = ' + fmt(snap.a, 3) + ' × ' + fmt(x, 0) + ' ' + (snap.b < 0 ? '−' : '+') + ' ' + fmt(Math.abs(snap.b), 2) +
              ' = <strong class="mono">' + fmt(yhat, 1) + ' ' + ds.unit + '</strong>. ' +
              'a and b did not change — nothing was learned.' +
              (ds.key === 'vl' && quad ? ' The curve would say ' + fmt(predictQuadratic(quad, x), 0) + '.' : '');
            chart1();
          })
      ];
      flow1.run(evs, 'infer');
    });
    infIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') infBtn.click(); });

    /* ============ Panel 2 ============ */
    var p2 = el('div', 'run-panel ai-panel');
    p2.appendChild(el('h4', '', 'Panel 2 · Learn a boundary: spam or not spam?'));
    p2.appendChild(el('p', 'ai-lede',
      'Each email is described by two numbers (its <strong>features</strong>): how many links it has and how many ALL-CAPS words. ' +
      'The model computes a score from them and says “spam” when the probability passes ½. The line where it flips is the <strong>decision boundary</strong>. ' +
      'This is <strong>supervised learning</strong>: every training email comes with its correct label.'));

    var opts = el('div', 'ex-actions');
    var biasWrap = el('label', 'ai-check');
    var bias = el('input'); bias.type = 'checkbox';
    biasWrap.appendChild(bias);
    biasWrap.appendChild(document.createTextNode(' Biased sample: the collector gathered 14 extra spam emails that look like club newsletters — and no more newsletters'));
    opts.appendChild(biasWrap);
    p2.appendChild(opts);

    var opts2 = el('div', 'ai-train');
    var eta2W = el('div', 'ai-field');
    var eta2L = el('label', 'field-label', 'Learning rate η'); eta2L.setAttribute('for', 'ai-eta2');
    var eta2 = el('select', 'preset-select'); eta2.id = 'ai-eta2';
    [['0.5', 'small (0.5) — slow and steady'], ['2', 'medium (2)'], ['8', 'large (8) — fast, a bit jumpy']].forEach(function (o) {
      var op = el('option'); op.value = o[0]; op.textContent = o[1]; eta2.appendChild(op);
    });
    eta2.value = '2';
    eta2W.appendChild(eta2L); eta2W.appendChild(eta2);
    opts2.appendChild(eta2W);
    p2.appendChild(opts2);

    var tb2 = el('div', 'ex-actions');
    var c1 = el('button', 'btn primary', '⏭ 1 step'); c1.type = 'button';
    var c10 = el('button', 'btn ghost', '×10'); c10.type = 'button';
    var c100 = el('button', 'btn ghost', '×100'); c100.type = 'button';
    var cReset = el('button', 'btn ghost small', '↺ Reset weights'); cReset.type = 'button';
    tb2.appendChild(c1); tb2.appendChild(c10); tb2.appendChild(c100); tb2.appendChild(cReset);
    p2.appendChild(tb2);

    var flowBusy2 = false;
    var flow2 = buildFlow(p2, {
      titles: { model: 'MODEL', pred: 'PREDICTION' }, aria: 'Training pipeline for the spam classifier: emails with labels, model, probability of spam, cross-entropy loss, optimizer, updated weights back into the model',
      paint: function (m) { paintFlow2(m); },
      onBusy: function (b) { flowBusy2 = b; [c1, c10, c100].forEach(function (x) { x.disabled = b; }); }
    });

    var chart2W = el('div', 'ai-chart');
    var svg2 = document.createElementNS(SVGNS, 'svg');
    svg2.setAttribute('viewBox', '0 0 420 400'); svg2.setAttribute('class', 'ai-svg ai-svg-sq'); svg2.setAttribute('role', 'img');
    chart2W.appendChild(svg2);
    p2.appendChild(chart2W);
    p2.appendChild(el('div', 'ai-legend',
      '<span><svg viewBox="0 0 14 14" class="ai-lg"><circle class="ai-ham" cx="7" cy="7" r="5"/></svg> not spam</span>' +
      '<span><svg viewBox="0 0 14 14" class="ai-lg"><path class="ai-spam" d="M7 1.5 L13 12 L1 12 Z"/></svg> spam</span>' +
      '<span><svg viewBox="0 0 14 14" class="ai-lg"><path class="ai-news" d="M7 1 L13 7 L7 13 L1 7 Z"/></svg> club newsletter (legit), used for training</span>' +
      '<span><svg viewBox="0 0 14 14" class="ai-lg"><path class="ai-news ai-hollow" d="M7 1 L13 7 L7 13 L1 7 Z"/></svg> club newsletter held out for testing</span>' +
      '<span><svg viewBox="0 0 14 14" class="ai-lg"><path class="ai-spam ai-ring" d="M7 1.5 L13 12 L1 12 Z"/></svg> spam added by the biased collection</span>' +
      '<span><svg viewBox="0 0 14 14" class="ai-lg"><line class="ai-boundary" x1="1" y1="11" x2="13" y2="3"/></svg>' + kc('model', 'Model') + ' decision boundary</span>' +
      '<span><svg viewBox="0 0 14 14" class="ai-lg"><circle class="ai-probe" cx="7" cy="7" r="5"/></svg>' + kc('pred', 'Prediction') + ' for a new email</span>'));

    var stat2 = el('div', 'ai-readout');
    stat2.setAttribute('aria-live', 'polite');
    p2.appendChild(stat2);
    var status2 = el('div', 'sim-status');
    status2.setAttribute('role', 'status');
    p2.appendChild(status2);

    p2.appendChild(el('h5', 'ai-sub', 'Inference — classify a new email'));
    var pr = el('div', 'ex-actions');
    var l1 = el('label', 'field-label', 'Links'); l1.setAttribute('for', 'ai-l1');
    var i1 = el('input', 'ai-num'); i1.type = 'number'; i1.id = 'ai-l1'; i1.min = '0'; i1.max = '10'; i1.step = '0.5'; i1.value = '5';
    var l2 = el('label', 'field-label', 'ALL-CAPS words'); l2.setAttribute('for', 'ai-l2');
    var i2 = el('input', 'ai-num'); i2.type = 'number'; i2.id = 'ai-l2'; i2.min = '0'; i2.max = '10'; i2.step = '0.5'; i2.value = '4.5';
    var pb = el('button', 'btn primary', 'Classify'); pb.type = 'button';
    [l1, i1, l2, i2, pb].forEach(function (n) { pr.appendChild(n); });
    p2.appendChild(pr);
    var probeOut = el('div', 'ai-readout');
    probeOut.setAttribute('aria-live', 'polite');
    p2.appendChild(probeOut);
    host.appendChild(p2);

    /* ---- state for panel 2 ---- */
    var sets = makeSpamSets(false), model = clfNew(), probe = null, lastLoss = null;
    function trainData() { return makeSpamSets(bias.checked).train; }

    /* ---- pipeline view for panel 2 ---- */
    var V2 = {}, VI2 = {};
    function modelLines2(m) { return ['p = σ(w·x + b)', 'w₁=' + fmt(m.w1, 2) + ' w₂=' + fmt(m.w2, 2), 'b = ' + fmt(m.b, 2)]; }
    function predLines2(m, d) { var e = d[0]; return ['P(spam)', 'email 1: ' + fmt(clfProb(m, e.x1, e.x2), 2), 'true: ' + (e.y ? 'spam' : 'not spam')]; }
    function lossLines2(m, d) { return ['cross-entropy', 'L = ' + fmt(clfLoss(d, m), 3), 'mean of ' + d.length]; }
    function etaText2() { return eta2.value; }
    function resetView2() {
      var d = trainData();
      V2 = { data: [d.length + ' emails', '(links, CAPS) → label', 'spam / not spam'], model: modelLines2(model), pred: predLines2(model, d), loss: lossLines2(model, d), opt: ['η = ' + etaText2(), 'no step yet', ''] };
      VI2 = { data: ['new email', 'no label known', ''], model: modelLines2(model), pred: ['P(spam)', 'press Classify', ''] };
      paintFlow2(flow2.pipe.mode());
    }
    function paintFlow2(m) {
      var pp = flow2.pipe;
      if (m === 'infer') {
        setLines(pp, { data: VI2.data, model: VI2.model, pred: VI2.pred, loss: ['not used', 'at inference', ''], opt: ['not used', 'weights frozen', ''] });
        pp.setTitle('data', 'NEW INPUT'); pp.setTag('model', 'frozen');
      } else { setLines(pp, V2); pp.setTitle('data', 'DATA'); pp.setTag('model', 'learning'); }
    }

    function boundaryPolygon(m) {
      // region of the 0..10 square where w1 x1/10 + w2 x2/10 + b > 0  (model says spam)
      var sq = [[0, 0], [10, 0], [10, 10], [0, 10]];
      function f(p) { return m.w1 * p[0] / 10 + m.w2 * p[1] / 10 + m.b; }
      var out = [];
      for (var i = 0; i < 4; i++) {
        var A = sq[i], B = sq[(i + 1) % 4], fa = f(A), fb = f(B);
        if (fa > 0) out.push(A);
        if ((fa > 0) !== (fb > 0)) { var t = fa / (fa - fb); out.push([A[0] + t * (B[0] - A[0]), A[1] + t * (B[1] - A[1])]); }
      }
      return out;
    }

    function renderClf() {
      var data = trainData(), W = 420, H = 400, L = 44, R = 10, T = 10, B = 44, g = '', i;
      function X(v) { return L + v / 10 * (W - L - R); }
      function Y(v) { return H - B - v / 10 * (H - B - T); }
      var trained2 = model.step > 0;
      if (trained2 && (model.w1 !== 0 || model.w2 !== 0)) {
        var poly = boundaryPolygon(model);
        if (poly.length >= 3) g += '<polygon class="ai-region" points="' + poly.map(function (p) { return X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1); }).join(' ') + '"/>';
      }
      for (i = 0; i <= 10; i += 2) {
        g += '<line class="ai-grid" x1="' + X(i) + '" x2="' + X(i) + '" y1="' + T + '" y2="' + (H - B) + '"/><text class="ai-tick" x="' + X(i) + '" y="' + (H - B + 15) + '" text-anchor="middle">' + i + '</text>';
        g += '<line class="ai-grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(i) + '" y2="' + Y(i) + '"/><text class="ai-tick" x="' + (L - 6) + '" y="' + (Y(i) + 4) + '" text-anchor="end">' + i + '</text>';
      }
      g += '<text class="ai-axis" x="' + ((L + W - R) / 2) + '" y="' + (H - 8) + '" text-anchor="middle">links in the email (x₁)</text>';
      g += '<text class="ai-axis" transform="translate(12 ' + ((T + H - B) / 2) + ') rotate(-90)" text-anchor="middle">ALL-CAPS words (x₂)</text>';
      // boundary line
      if (trained2 && (model.w1 !== 0 || model.w2 !== 0)) {
        var ends = [], cand = [];
        // intersections with the square's edges of w1*x1/10 + w2*x2/10 + b = 0
        if (model.w2 !== 0) { cand.push([0, -(model.b) * 10 / model.w2]); cand.push([10, -(model.b + model.w1) * 10 / model.w2]); }
        if (model.w1 !== 0) { cand.push([-(model.b) * 10 / model.w1, 0]); cand.push([-(model.b + model.w2) * 10 / model.w1, 10]); }
        cand.forEach(function (p) { if (p[0] >= -1e-6 && p[0] <= 10 + 1e-6 && p[1] >= -1e-6 && p[1] <= 10 + 1e-6) ends.push(p); });
        if (ends.length >= 2) g += '<line class="ai-boundary" x1="' + X(ends[0][0]) + '" y1="' + Y(ends[0][1]) + '" x2="' + X(ends[1][0]) + '" y2="' + Y(ends[1][1]) + '"/>';
      }
      function shape(p, cls, filled) {
        var cx = X(p.x1), cy = Y(p.x2);
        if (cls === 'spam') return '<path class="ai-spam' + (p.tag === 'extra' ? ' ai-ring' : '') + '" d="M' + cx + ' ' + (cy - 7) + ' L' + (cx + 7) + ' ' + (cy + 5.5) + ' L' + (cx - 7) + ' ' + (cy + 5.5) + ' Z"/>';
        if (cls === 'news') return '<path class="ai-news' + (filled ? '' : ' ai-hollow') + '" d="M' + cx + ' ' + (cy - 7) + ' L' + (cx + 7) + ' ' + cy + ' L' + cx + ' ' + (cy + 7) + ' L' + (cx - 7) + ' ' + cy + ' Z"/>';
        return '<circle class="ai-ham" cx="' + cx + '" cy="' + cy + '" r="5.5"/>';
      }
      data.forEach(function (p) { g += shape(p, p.tag === 'news' ? 'news' : p.y === 1 ? 'spam' : 'ham', true); });
      sets.test.forEach(function (p) { g += shape(p, 'news', false); });
      if (probe) g += '<circle class="ai-probe-halo" cx="' + X(probe.x1) + '" cy="' + Y(probe.x2) + '" r="12.5"/><circle class="ai-probe" cx="' + X(probe.x1) + '" cy="' + Y(probe.x2) + '" r="8"/><text class="ai-tick" x="' + (X(probe.x1) + 14) + '" y="' + (Y(probe.x2) - 10) + '">new</text>';
      svg2.innerHTML = g;
      var accT = clfAccuracy(data, model), accN = clfAccuracy(sets.test, model);
      svg2.setAttribute('aria-label', 'Scatter plot of emails by links and capital words. ' + (trained2 ? 'Decision boundary after ' + model.step + ' steps; training accuracy ' + Math.round(accT * 100) + ' percent.' : 'Not trained yet.'));
      var loss = clfLoss(data, model);
      stat2.innerHTML = 'Steps: <strong class="mono">' + model.step + '</strong> &nbsp;·&nbsp; loss: <strong class="mono">' + fmt(loss, 4) + '</strong> (lower = better) &nbsp;·&nbsp; ' +
        'accuracy on the ' + data.length + ' training emails: <strong class="mono">' + Math.round(accT * 100) + '%</strong> &nbsp;·&nbsp; ' +
        'on the ' + sets.test.length + ' <em>held-out</em> newsletters: <strong class="mono ' + (trained2 && accN < 0.5 ? 'ai-bad' : '') + '">' + Math.round(accN * 100) + '%</strong>';
      stat2.innerHTML += '<br><span class="mono">score = ' + fmt(model.w1, 2) + '·x₁/10 ' + (model.w2 < 0 ? '− ' : '+ ') + fmt(Math.abs(model.w2), 2) + '·x₂/10 ' + (model.b < 0 ? '− ' : '+ ') + fmt(Math.abs(model.b), 2) + '</span>';
      lastLoss = loss;
      if (probe) classify(false);
    }

    function advance(n) {
      flow2.runner.finish();
      var data = trainData(), eta = parseFloat(eta2.value);
      if (n > 1) model = clfTrain(data, model, eta, n - 1);   // earlier steps: no animation
      var pre = model, post = clfStep(data, pre, eta);
      var g1 = (pre.w1 - post.w1) / eta, g2 = (pre.w2 - post.w2) / eta, gb = (pre.b - post.b) / eta, N = data.length;
      var before = n > 1 ? 'Step ' + post.step + ' of your ' + n + ' (the earlier ones ran without animation). ' : 'Step ' + post.step + '. ';
      renderClf(); resetView2();
      V2.opt = ['η = ' + etaText2(), 'no gradient yet', ''];
      function finish() {
        model = post;
        var accT = clfAccuracy(data, model), accN = clfAccuracy(sets.test, model);
        status2.className = 'sim-status running';
        status2.textContent = 'Step ' + model.step + ': the weights moved to reduce the loss, so the boundary moved. ' +
          (bias.checked && model.step >= 100 && accN < 0.5
            ? 'Look at the diamonds: the model learned “lots of links + some caps = spam” from a skewed sample, so legitimate newsletters it never saw are now flagged. Same algorithm, different data, different behaviour.'
            : (accT >= 0.95 ? 'Almost every training email is on the right side now.' : 'Keep going — the boundary is still finding its place.'));
        renderClf();
      }
      var evs = [
        flow2.mk('Data → Model', [{ key: 'data>model', label: '(x₁,x₂) ×' + N }],
          before + '<strong>① ' + hop('data', 'model') + '.</strong> The ' + N + ' emails’ features (links x₁, CAPS words x₂) go into the model, which has weights w₁ = ' + fmt(pre.w1, 2) + ', w₂ = ' + fmt(pre.w2, 2) + ' and bias b = ' + fmt(pre.b, 2) + '.',
          function () { V2.model = modelLines2(pre); paintFlow2('train'); }),
        flow2.mk('Model → Prediction', [{ key: 'model>pred', label: 'P(spam) ×' + N }],
          '<strong>② ' + hop('model', 'pred') + '.</strong> Each email gets a score w₁x₁ + w₂x₂ + b, squashed by σ into a probability of spam.',
          function () { V2.pred = predLines2(pre, data); paintFlow2('train'); }),
        flow2.mk('Prediction and labels → Loss', [{ key: 'pred>loss', label: 'P' }, { key: 'data>loss', label: 'label' }],
          '<strong>③ ' + kc('pred') + ' + labels ' + kc('data', 'y') + ' → ' + kc('loss') + '.</strong> Cross-entropy is large when the model is confidently wrong. Mean loss = <strong class="mono">' + fmt(clfLoss(data, pre), 4) + '</strong>.',
          function () { V2.loss = lossLines2(pre, data); paintFlow2('train'); }),
        flow2.mk('Loss → Optimizer', [{ key: 'loss>opt', label: 'error' }],
          '<strong>④ ' + hop('loss', 'opt') + '.</strong> The gradient says how the loss changes with each weight: ∂L/∂w₁ = ' + fmt(g1, 3) + ', ∂L/∂w₂ = ' + fmt(g2, 3) + ', ∂L/∂b = ' + fmt(gb, 3) + '.',
          function () { V2.opt = ['η=' + etaText2() + ' ∂w₁=' + fmt(g1, 2), '∂L/∂w₂ = ' + fmt(g2, 2), '∂L/∂b = ' + fmt(gb, 2)]; paintFlow2('train'); }),
        flow2.mk('Optimizer → Model', [{ key: 'opt>model', label: 'new w, b' }],
          '<strong>⑤ ' + hop('opt', 'model') + '.</strong> Each weight moves against its gradient: w₁ → ' + fmt(post.w1, 3) + ', w₂ → ' + fmt(post.w2, 3) + ', b → ' + fmt(post.b, 3) + '. The decision boundary moves with them.',
          function () { V2.model = modelLines2(post); VI2.model = modelLines2(post); finish(); paintFlow2('train'); })
      ];
      flow2.run(evs, 'train');
    }
    function classify(announce) {
      var x1 = parseFloat(i1.value), x2 = parseFloat(i2.value);
      if (!isFinite(x1) || !isFinite(x2)) { probeOut.textContent = 'Type two numbers first.'; return; }
      probe = { x1: Math.min(10, Math.max(0, x1)), x2: Math.min(10, Math.max(0, x2)) };
      var m = model, p = clfProb(m, probe.x1, probe.x2);
      function text() {
        return '<span class="ai-tag">inference</span> an email with ' + fmt(probe.x1, 1) + ' links and ' + fmt(probe.x2, 1) + ' capital words → ' +
          (m.step === 0 ? 'the model is untrained, so it can only say 50 %.' : 'P(spam) = <strong class="mono">' + Math.round(p * 100) + '%</strong> → <strong>' + (p >= 0.5 ? 'SPAM' : 'not spam') + '</strong>. The weights did not change.');
      }
      if (!announce) { probeOut.innerHTML = text(); return; }
      flow2.runner.finish();
      VI2.data = ['new email', fmt(probe.x1, 1) + ' links', fmt(probe.x2, 1) + ' CAPS']; VI2.model = modelLines2(m); VI2.pred = ['P(spam)', 'waiting…', ''];
      var evs = [
        flow2.mk('New email → Model', [{ key: 'data>model', label: '(' + fmt(probe.x1, 1) + ', ' + fmt(probe.x2, 1) + ')' }],
          '<strong>Inference ① ' + kc('data', 'New email') + ' → ' + kc('model') + '.</strong> The two features of an email the model has never seen go in. The weights are <strong>frozen</strong>; no label comes with it.', null),
        flow2.mk('Model → Prediction', [{ key: 'model>pred', label: fmt(p * 100, 0) + '%' }],
          '<strong>Inference ② ' + hop('model', 'pred') + '.</strong> score → σ → P(spam) = ' + Math.round(p * 100) + '%, so the verdict is ' + (p >= 0.5 ? 'SPAM' : 'not spam') + '. ' + kc('loss') + ' and ' + kc('opt') + ' stay grey: nothing is compared, nothing is learned.',
          function () { VI2.pred = ['P(spam)', Math.round(p * 100) + '%', p >= 0.5 ? 'SPAM' : 'not spam']; paintFlow2('infer'); probeOut.innerHTML = text(); renderClf(); })
      ];
      flow2.run(evs, 'infer');
    }
    c1.addEventListener('click', function () { advance(1); });
    c10.addEventListener('click', function () { advance(10); });
    c100.addEventListener('click', function () { advance(100); });
    cReset.addEventListener('click', function () {
      flow2.runner.cancel(); model = clfNew(); status2.className = 'sim-status'; status2.textContent = 'Weights reset to zero: the untrained model gives every email 50 %.'; renderClf(); resetView2();
    });
    bias.addEventListener('change', function () {
      flow2.runner.cancel(); model = clfNew();
      status2.className = 'sim-status';
      status2.textContent = bias.checked
        ? 'Biased sample on, weights reset. Train it again (×100) and compare the held-out newsletter accuracy with the unbiased run.'
        : 'Fair sample, weights reset. Train (×100) and note how the held-out newsletters do.';
      renderClf(); resetView2();
    });
    pb.addEventListener('click', function () { classify(true); });
    svg2.addEventListener('click', function (e) {
      var r = svg2.getBoundingClientRect(), sx = 420 / r.width, sy = 400 / r.height;
      var vx = ((e.clientX - r.left) * sx - 44) / (420 - 44 - 10) * 10, vy = (400 - 44 - (e.clientY - r.top) * sy) / (400 - 44 - 10) * 10;
      if (vx < 0 || vx > 10 || vy < 0 || vy > 10) return;
      i1.value = (Math.round(vx * 2) / 2).toFixed(1); i2.value = (Math.round(vy * 2) / 2).toFixed(1);
      classify(true);
    });

    host.appendChild(el('div', 'note tip ai-end',
      '<span class="note-tag">Same loop, different size</span>' +
      'In both panels you saw <strong>training</strong> (many small parameter updates driven by data and an error measure) followed by <strong>inference</strong> (frozen parameters, one quick evaluation). ' +
      'A modern model repeats exactly that with billions of parameters and a few thousand times more data — which is why training needs data centres but a chat reply only needs one pass through the function.'));

    loadDataset(0);
    renderClf(); resetView2();
    status2.textContent = 'Ready. Press ×100 to train the classifier, then switch on the biased sample and train again.';
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = AILab;
  else {
    global.AILab = AILab;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
  }
})(typeof window !== 'undefined' ? window : this);
