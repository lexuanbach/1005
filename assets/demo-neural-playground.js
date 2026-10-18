/* Draw & Teach a Brain — pure engine (no DOM). A tiny from-scratch multilayer perceptron:
   seeded data generators, forward pass, back-propagation, SGD / Adam, evaluation, fairness audit.
   It is a TOY: a few dozen numbers, not a language model. Exported for Node tests. */
(function (root) {
  'use strict';

  /* ---------- seeded random numbers (mulberry32) ---------- */
  function rng(seed) {
    var s = (seed >>> 0) || 1, spare = null;
    function next() {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    function gauss() {
      if (spare !== null) { var v0 = spare; spare = null; return v0; }
      var u = 0; while (u === 0) u = next();
      var v = next(), m = Math.sqrt(-2 * Math.log(u));
      spare = m * Math.sin(2 * Math.PI * v);
      return m * Math.cos(2 * Math.PI * v);
    }
    return { next: next, gauss: gauss, int: function (n) { return Math.floor(next() * n); } };
  }

  function clamp(v) { return Math.max(-0.98, Math.min(0.98, v)); }

  /* ---------- data generators: points {x, y, c} in [-1, 1]^2 ---------- */
  var KINDS = ['spiral', 'rings', 'xor', 'moons', 'blobs'];

  function makeDataset(kind, o) {
    o = o || {};
    var n = o.n || 200, noise = o.noise == null ? 0.1 : o.noise, r = rng(o.seed == null ? 1 : o.seed);
    var K = (kind === 'xor' || kind === 'moons') ? 2 : Math.max(2, Math.min(3, o.classes || 2));
    var jit = 0.3 * noise, flip = 0.15 * noise, pts = [], i, c, t, x, y, a;
    for (i = 0; i < n; i++) {
      c = i % K;
      if (kind === 'spiral') {
        t = 0.08 + 0.92 * r.next();
        a = c * 2 * Math.PI / K + t * 2.3 * Math.PI;
        x = 0.92 * t * Math.cos(a); y = 0.92 * t * Math.sin(a);
      } else if (kind === 'rings') {
        var rad = (K === 2 ? [0.3, 0.75] : [0.2, 0.55, 0.9])[c] + 0.05 * r.gauss();
        a = 2 * Math.PI * r.next(); x = rad * Math.cos(a); y = rad * Math.sin(a);
      } else if (kind === 'xor') {
        x = (0.08 + 0.9 * r.next()) * (r.next() < 0.5 ? -1 : 1);
        y = (0.08 + 0.9 * r.next()) * (r.next() < 0.5 ? -1 : 1);
        c = x * y > 0 ? 1 : 0;
      } else if (kind === 'moons') {
        t = Math.PI * r.next();
        if (c === 0) { x = Math.cos(t); y = Math.sin(t); } else { x = 1 - Math.cos(t); y = 0.5 - Math.sin(t); }
        x = (x - 0.5) * 0.62; y = (y - 0.25) * 0.9;
        x += 0.04 * r.gauss(); y += 0.04 * r.gauss();
      } else { /* blobs */
        a = c * 2 * Math.PI / K + 0.6;
        x = 0.55 * Math.cos(a) + (0.14 + 0.2 * noise) * r.gauss();
        y = 0.55 * Math.sin(a) + (0.14 + 0.2 * noise) * r.gauss();
      }
      if (kind !== 'blobs') { x += jit * r.gauss() * 0.5; y += jit * r.gauss() * 0.5; }
      if (flip > 0 && r.next() < flip) c = (c + 1 + r.int(K - 1)) % K;
      pts.push({ x: clamp(x), y: clamp(y), c: c });
    }
    return { points: pts, classes: K };
  }

  /* mark roughly `frac` of the points as held-out test points (field t); deterministic */
  function splitTest(pts, frac, seed) {
    var r = rng(seed == null ? 7 : seed), i;
    for (i = 0; i < pts.length; i++) pts[i].t = r.next() < frac;
    return pts;
  }

  /* ---------- the "bias in the data" scenario ----------
     Two groups of invented applicants, each with two classes. Group A (left half) and group B (right half)
     follow OPPOSITE rules. The group is never an input; x acts as a proxy. */
  var BIAS_CENTRES = {
    A: [{ x: -0.5, y: 0.45, c: 0 }, { x: -0.5, y: -0.45, c: 1 }],
    B: [{ x: 0.5, y: 0.45, c: 1 }, { x: 0.5, y: -0.45, c: 0 }]
  };
  function biasPoints(count, group, r, noise) {
    var out = [], i, ce, sd = 0.13 + 0.1 * noise;
    for (i = 0; i < count; i++) {
      ce = BIAS_CENTRES[group][i % 2];
      out.push({ x: clamp(ce.x + sd * r.gauss()), y: clamp(ce.y + sd * r.gauss()), c: ce.c, g: group });
    }
    return out;
  }
  /* a skewed sample: n points, `minority` share from group B */
  function biasDataset(o) {
    o = o || {};
    var n = o.n || 200, share = o.minority == null ? 0.04 : o.minority, r = rng(o.seed == null ? 5 : o.seed);
    var nb = Math.max(0, Math.round(n * share)), noise = o.noise || 0;
    var pts = biasPoints(n - nb, 'A', r, noise).concat(biasPoints(nb, 'B', r, noise));
    return { points: pts, classes: 2 };
  }
  /* the real world: 50 / 50 audit set the model never trained on */
  function biasAudit(seed, perGroup) {
    var r = rng(seed == null ? 99 : seed), m = perGroup || 100;
    return biasPoints(m, 'A', r, 0).concat(biasPoints(m, 'B', r, 0));
  }

  /* ---------- the network ---------- */
  function createNet(o) {
    var hidden = o.hidden || [], inputs = o.inputs || 2, outputs = o.outputs || 2, act = o.act === 'relu' ? 'relu' : 'tanh';
    var sizes = [inputs].concat(hidden, [outputs]), L = sizes.length - 1, wOff = [], bOff = [], total = 0, l;
    for (l = 0; l < L; l++) {
      wOff.push(total); total += sizes[l] * sizes[l + 1];
      bOff.push(total); total += sizes[l + 1];
    }
    var params = new Float64Array(total), r = rng(o.seed == null ? 1 : o.seed), j, i;
    for (l = 0; l < L; l++) {
      var nin = sizes[l], nout = sizes[l + 1];
      var lim = Math.sqrt(6 / (nin + nout)), sd = Math.sqrt(2 / nin);
      for (j = 0; j < nout; j++) for (i = 0; i < nin; i++)
        params[wOff[l] + j * nin + i] = (act === 'relu' && l < L - 1) ? sd * r.gauss() : lim * (2 * r.next() - 1);
      for (j = 0; j < nout; j++) params[bOff[l] + j] = (act === 'relu' && l < L - 1) ? 0.05 : 0;
    }
    var A = [], Z = [], D = [];
    for (l = 0; l <= L; l++) { A.push(new Float64Array(sizes[l])); Z.push(new Float64Array(sizes[l])); D.push(new Float64Array(sizes[l])); }

    function forward(x, y) {
      A[0][0] = x; A[0][1] = y;
      var l, j, i, s, nin, nout, mx, sum, w = params;
      for (l = 0; l < L; l++) {
        nin = sizes[l]; nout = sizes[l + 1];
        for (j = 0; j < nout; j++) {
          s = w[bOff[l] + j];
          for (i = 0; i < nin; i++) s += w[wOff[l] + j * nin + i] * A[l][i];
          Z[l + 1][j] = s;
        }
        if (l < L - 1) {
          for (j = 0; j < nout; j++) A[l + 1][j] = act === 'relu' ? (Z[l + 1][j] > 0 ? Z[l + 1][j] : 0) : Math.tanh(Z[l + 1][j]);
        } else {
          mx = -Infinity; for (j = 0; j < nout; j++) if (Z[l + 1][j] > mx) mx = Z[l + 1][j];
          sum = 0; for (j = 0; j < nout; j++) { A[l + 1][j] = Math.exp(Z[l + 1][j] - mx); sum += A[l + 1][j]; }
          for (j = 0; j < nout; j++) A[l + 1][j] /= sum;
        }
      }
      return A[L];
    }
    /* mean cross-entropy over pts[idx[k]]; fills grad (Float64Array same size as params) when given */
    function lossGrad(pts, idx, grad) {
      var m = idx.length, loss = 0, k, p, pr, l, j, i, nin, nout, d;
      if (grad) grad.fill(0);
      for (k = 0; k < m; k++) {
        p = pts[idx[k]]; pr = forward(p.x, p.y);
        loss -= Math.log(Math.max(pr[p.c], 1e-12));
        if (!grad) continue;
        for (j = 0; j < sizes[L]; j++) D[L][j] = pr[j] - (j === p.c ? 1 : 0);
        for (l = L - 1; l >= 0; l--) {
          nin = sizes[l]; nout = sizes[l + 1];
          for (j = 0; j < nout; j++) {
            d = D[l + 1][j];
            grad[bOff[l] + j] += d;
            for (i = 0; i < nin; i++) grad[wOff[l] + j * nin + i] += d * A[l][i];
          }
          if (l > 0) {
            for (i = 0; i < nin; i++) {
              d = 0;
              for (j = 0; j < nout; j++) d += params[wOff[l] + j * nin + i] * D[l + 1][j];
              D[l][i] = d * (act === 'relu' ? (Z[l][i] > 0 ? 1 : 0) : 1 - A[l][i] * A[l][i]);
            }
          }
        }
      }
      if (grad) for (i = 0; i < grad.length; i++) grad[i] /= m;
      return loss / m;
    }
    function predict(x, y) {
      var pr = forward(x, y), best = 0, j;
      for (j = 1; j < pr.length; j++) if (pr[j] > pr[best]) best = j;
      return { c: best, p: Array.prototype.slice.call(pr), conf: pr[best] };
    }
    /* activations of every hidden neuron at (x, y): array of layers */
    function hiddenAt(x, y) {
      forward(x, y);
      var out = [], l; for (l = 1; l < L; l++) out.push(Array.prototype.slice.call(A[l]));
      return out;
    }
    return {
      sizes: sizes, act: act, params: params, nParams: total, layers: L, wOff: wOff, bOff: bOff,
      forward: forward, lossGrad: lossGrad, predict: predict, hiddenAt: hiddenAt,
      hiddenNeurons: hidden.reduce(function (a, b) { return a + b; }, 0)
    };
  }


  /* ---------- trace of ONE sample through the network (for the "Inspect one sample" mode) ----------
     Pure and independent of the net's internal buffers: reads net.params only. Returns every layer's
     pre-activation z and activation a (a[0] = [x, y], a[L] = class probabilities), the loss of this one
     sample, the back-propagated error signals delta[l] (delta[L] = p - target; hidden layers use the
     chain rule), and the gradient of every weight and bias. grad has the same layout as net.params, so
     it equals lossGrad(pts, [i], g) for that one sample. Call as traceSample(net, x, y, c) or traceSample(net, {x,y,c}). */
  function traceSample(net, x, y, c) {
    if (x !== null && typeof x === 'object') { c = x.c; y = x.y; x = x.x; }
    var sizes = net.sizes, L = sizes.length - 1, relu = net.act === 'relu', w = net.params, wOff = net.wOff, bOff = net.bOff;
    var a = [[x, y]], z = [null], l, j, i, s, nin, nout, zl, al, mx, sum;
    for (l = 0; l < L; l++) {
      nin = sizes[l]; nout = sizes[l + 1]; zl = []; al = [];
      for (j = 0; j < nout; j++) {
        s = w[bOff[l] + j];
        for (i = 0; i < nin; i++) s += w[wOff[l] + j * nin + i] * a[l][i];
        zl.push(s);
      }
      if (l < L - 1) { for (j = 0; j < nout; j++) al.push(relu ? (zl[j] > 0 ? zl[j] : 0) : Math.tanh(zl[j])); }
      else {
        mx = -Infinity; for (j = 0; j < nout; j++) if (zl[j] > mx) mx = zl[j];
        sum = 0; for (j = 0; j < nout; j++) { al.push(Math.exp(zl[j] - mx)); sum += al[j]; }
        for (j = 0; j < nout; j++) al[j] /= sum;
      }
      z.push(zl); a.push(al);
    }
    var probs = a[L], loss = -Math.log(Math.max(probs[c], 1e-12));
    var delta = new Array(L + 1), gradW = new Array(L), gradB = new Array(L), grad = new Float64Array(net.nParams), row, gw, gb, dl;
    delta[0] = null;
    delta[L] = probs.map(function (p, k) { return p - (k === c ? 1 : 0); });
    for (l = L - 1; l >= 0; l--) {
      nin = sizes[l]; nout = sizes[l + 1]; gw = []; gb = [];
      for (j = 0; j < nout; j++) {
        gb.push(delta[l + 1][j]); grad[bOff[l] + j] = delta[l + 1][j]; row = [];
        for (i = 0; i < nin; i++) { row.push(delta[l + 1][j] * a[l][i]); grad[wOff[l] + j * nin + i] = row[i]; }
        gw.push(row);
      }
      gradW[l] = gw; gradB[l] = gb;
      if (l > 0) {
        dl = [];
        for (i = 0; i < nin; i++) {
          s = 0; for (j = 0; j < nout; j++) s += w[wOff[l] + j * nin + i] * delta[l + 1][j];
          dl.push(s * (relu ? (z[l][i] > 0 ? 1 : 0) : 1 - a[l][i] * a[l][i]));
        }
        delta[l] = dl;
      }
    }
    return { x: x, y: y, c: c, sizes: sizes.slice(), act: net.act, z: z, a: a, probs: probs.slice(), loss: loss, target: probs.map(function (p, k) { return k === c ? 1 : 0; }),
      delta: delta, gradW: gradW, gradB: gradB, grad: grad };
  }
  /* the plain gradient-descent nudge for that one sample: -lr * grad, same layout as net.params */
  function traceStep(tr, lr) {
    var d = new Float64Array(tr.grad.length), k;
    for (k = 0; k < d.length; k++) d[k] = -lr * tr.grad[k];
    return d;
  }

  /* ---------- evaluation ---------- */
  function evaluate(net, pts) {
    var n = pts.length, loss = 0, ok = 0, i, p, pr, best, j;
    if (!n) return { loss: NaN, acc: NaN, n: 0 };
    for (i = 0; i < n; i++) {
      p = pts[i]; pr = net.forward(p.x, p.y); best = 0;
      for (j = 1; j < pr.length; j++) if (pr[j] > pr[best]) best = j;
      if (best === p.c) ok++;
      loss -= Math.log(Math.max(pr[p.c], 1e-12));
    }
    return { loss: loss / n, acc: ok / n, n: n };
  }
  function groupAccuracy(net, pts) {
    var out = { A: { ok: 0, n: 0 }, B: { ok: 0, n: 0 } }, i, g;
    for (i = 0; i < pts.length; i++) {
      g = out[pts[i].g]; if (!g) continue;
      g.n++; if (net.predict(pts[i].x, pts[i].y).c === pts[i].c) g.ok++;
    }
    var a = out.A.n ? out.A.ok / out.A.n : NaN, b = out.B.n ? out.B.ok / out.B.n : NaN;
    return { A: a, B: b, gap: a - b };
  }
  /* class probabilities on a res x res grid of cell centres; row 0 is the TOP (y = +1) */
  function gridProbs(net, res) {
    var K = net.sizes[net.sizes.length - 1], out = new Float32Array(res * res * K), r, c, pr, k;
    for (r = 0; r < res; r++) for (c = 0; c < res; c++) {
      pr = net.forward(-1 + (c + 0.5) * 2 / res, 1 - (r + 0.5) * 2 / res);
      for (k = 0; k < K; k++) out[(r * res + c) * K + k] = pr[k];
    }
    return out;
  }
  function verdict(trainAcc, testAcc) {
    if (isNaN(testAcc)) return { level: 'na', text: 'No held-out points yet.' };
    var gap = trainAcc - testAcc;
    if (gap > 0.15) return { level: 'over', text: 'Overfitting: it memorised the training dots but does worse on dots it has never seen.' };
    if (trainAcc < 0.8) return { level: 'under', text: 'Underfitting: even the training dots are not learned yet (or the brain is too small).' };
    return { level: 'ok', text: 'Generalising: training and test accuracy are close.' };
  }

  /* ---------- training ---------- */
  function makeTrainer(net, pts, o) {
    o = o || {};
    var tr = pts.filter(function (p) { return !p.t; }), te = pts.filter(function (p) { return p.t; });
    var r = rng(o.seed == null ? 3 : o.seed), batch = Math.min(o.batch || 32, Math.max(1, tr.length));
    var order = [], i;
    for (i = 0; i < tr.length; i++) order.push(i);
    var T = {
      net: net, train: tr, test: te, opt: o.opt === 'sgd' ? 'sgd' : 'adam', lr: o.lr == null ? 0.03 : o.lr,
      l2: o.l2 || 0, epoch: 0, steps: 0, history: [], lastLoss: NaN
    };
    var pos = 0, grad = new Float64Array(net.nParams), m = new Float64Array(net.nParams), v = new Float64Array(net.nParams), idx = [];
    function shuffle() { for (var k = order.length - 1; k > 0; k--) { var j = r.int(k + 1), t = order[k]; order[k] = order[j]; order[j] = t; } }
    shuffle();
    function record() {
      var a = evaluate(net, tr), b = evaluate(net, te);
      T.history.push({ epoch: T.epoch, trainLoss: a.loss, trainAcc: a.acc, testLoss: b.loss, testAcc: b.acc });
      if (T.history.length > 4000) T.history.shift();
    }
    T.evaluate = function () {
      var a = evaluate(net, tr), b = evaluate(net, te);
      return { trainLoss: a.loss, trainAcc: a.acc, testLoss: b.loss, testAcc: b.acc };
    };
    T.step = function (k) {
      var s, q, w = net.params, b1 = 0.9, b2 = 0.999, t, mh, vh;
      if (!tr.length) return;
      for (s = 0; s < k; s++) {
        idx.length = 0;
        for (q = 0; q < batch; q++) { idx.push(order[pos++]); if (pos >= order.length) { pos = 0; T.epoch++; shuffle(); record(); } }
        T.lastLoss = net.lossGrad(tr, idx, grad);
        T.steps++;
        if (T.l2) for (q = 0; q < w.length; q++) grad[q] += T.l2 * w[q];
        if (T.opt === 'sgd') {
          for (q = 0; q < w.length; q++) w[q] -= T.lr * grad[q];
        } else {
          t = T.steps;
          for (q = 0; q < w.length; q++) {
            m[q] = b1 * m[q] + (1 - b1) * grad[q]; v[q] = b2 * v[q] + (1 - b2) * grad[q] * grad[q];
            mh = m[q] / (1 - Math.pow(b1, t)); vh = v[q] / (1 - Math.pow(b2, t));
            w[q] -= T.lr * mh / (Math.sqrt(vh) + 1e-8);
          }
        }
      }
    };
    T.stepsPerEpoch = Math.ceil(tr.length / batch);
    T.runEpochs = function (n) { var target = T.epoch + n; while (T.epoch < target) T.step(1); };
    return T;
  }

  /* ---------- presets (shared by the page and the Node tests) ---------- */
  var CHALLENGE = {
    seed: 42, n: 300, noise: 0.08, classes: 2, kind: 'spiral', testFrac: 0.3, splitSeed: 11,
    opt: 'adam', lr: 0.03, batch: 32, netSeed: 3, trainSeed: 1, act: 'tanh', maxEpochs: 600, target: 0.95, par: 6
  };
  var MEMORISE = {
    kind: 'moons', seed: 21, n: 60, noise: 0.7, classes: 2, testFrac: 0.5, splitSeed: 4,
    hidden: [8, 8, 8], act: 'tanh', opt: 'adam', lr: 0.03, netSeed: 5, trainSeed: 1
  };
  var SMALL_FOR_MEMORISE = { hidden: [2], act: 'tanh', opt: 'adam', lr: 0.03, netSeed: 5 };
  var BIAS = { n: 200, minority: 0.04, fair: 0.5, seed: 5, splitSeed: 8, testFrac: 0.25, hidden: [3], act: 'tanh', opt: 'adam', lr: 0.03, l2: 0.01, netSeed: 2, trainSeed: 3, epochs: 200, auditSeed: 99 };
  var LR = { kind: 'blobs', n: 200, noise: 0.2, seed: 3, classes: 2, testFrac: 0.25, splitSeed: 1, hidden: [4], act: 'tanh', opt: 'sgd', netSeed: 1, trainSeed: 3, good: 0.3, bad: 30 };

  var api = {
    rng: rng, KINDS: KINDS, makeDataset: makeDataset, splitTest: splitTest, biasDataset: biasDataset, biasAudit: biasAudit,
    createNet: createNet, traceSample: traceSample, traceStep: traceStep, evaluate: evaluate, groupAccuracy: groupAccuracy, gridProbs: gridProbs, verdict: verdict,
    makeTrainer: makeTrainer, CHALLENGE: CHALLENGE, MEMORISE: MEMORISE, SMALL_FOR_MEMORISE: SMALL_FOR_MEMORISE, BIAS: BIAS, LR: LR
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NeuralPlayground = api;
})(typeof window !== 'undefined' ? window : this);
