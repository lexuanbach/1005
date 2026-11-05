/* Chapter 9 concept apps 9.9 (IoT, part 2):  'iot-edgechain' (slide 33: where should the data be processed?) and
   'iot-train' (slides 37–38: train an AI model, Teachable-Machine style, then run it on the edge device).
   Engines are plain functions (NetApps.engines.EdgeChain / .Tiny) tested in Node; the UI below only runs in a browser.
   Everything is a simulation: the use cases, rates, hop times and sensor values are illustrative — real devices differ.
   Nothing touches the network. */
(function (root) {
  'use strict';
  var NA = (typeof window !== 'undefined' && window.NetApps) || require('./net-apps-core.js');
  var hasDom = typeof document !== 'undefined';

  /* =====================================================================================
     EdgeChain — engine
     ===================================================================================== */
  /* Hop times in milliseconds (illustrative): local radio/cable hops are a few ms, the on-site edge server decides in ~10 ms,
     the data centre needs one WAN round trip (slider) plus its own inference. */
  var HOP = { sense: 1, toGateway: 3, gatewayWork: 2, toEdge: 5, edgeForward: 2, edgeInfer: 10, cloudInfer: 30, backToActuator: 8 };
  var USE = {
    street: { label: 'Smart street lights', rawBps: 5000 * 200, aggFactor: 20, eventFactor: 100,
      source: '5,000 lights × 200 B × 1 reading per second', slide: 42,
      story: 'Slide 42: street lights → PLC → generic IoT platform → Wi-Fi/3G/4G/5G → management and monitoring systems.',
      decision: 'dim or brighten a lamp, report a broken one', actuator: 'the lamp dimmer',
      thing: 'street lights', aggText: 'one 1-minute summary (min / average / max) per light instead of 60 readings', eventText: 'only events: “lamp 3041 failed”, “traffic jam, brighten the lights”' },
    vibration: { label: 'Factory vibration monitor', rawBps: 40 * 3 * 2000 * 2, aggFactor: 150, eventFactor: 50,
      source: '40 sensors × 3 axes × 2,000 samples per second × 2 B', slide: null,
      story: 'Predictive maintenance (textbook example): vibration sensors warn before a bearing fails.',
      decision: 'stop the machine before the bearing breaks', actuator: 'the machine’s emergency stop',
      thing: 'motors', aggText: 'a few numbers per second per sensor (RMS, peak, frequency bands) instead of 6,000 samples', eventText: 'only alarms: “machine 12: bearing pattern detected”' },
    camera: { label: 'Security camera farm', rawBps: 20 * 4e6 / 8, aggFactor: 20, eventFactor: 500,
      source: '20 cameras × 4 Mbit/s of video', slide: null,
      story: 'Security camera (course example): recognise the intruder on site and send only the alert.',
      decision: 'raise the intruder alarm, lock the door', actuator: 'the alarm and door lock',
      thing: 'cameras', aggText: 'only the clips where something moved, compressed harder', eventText: 'only alerts: “person at door 4, 02:13” plus one snapshot' },
    ecg: { label: 'Wearable ECG patches', rawBps: 200 * 250 * 2, aggFactor: 50, eventFactor: 100,
      source: '200 patients × 250 samples per second × 2 B', slide: null,
      story: 'Wearable heart monitor (course example): raise an alarm without waiting for the Internet.',
      decision: 'call the nurse about an irregular heartbeat', actuator: 'the nurse-call alarm',
      thing: 'wearables', aggText: 'heart rate and beat-to-beat intervals every few seconds instead of every sample', eventText: 'only alarms: “bed 17: irregular rhythm”' }
  };
  var USE_ORDER = ['street', 'vibration', 'camera', 'ecg'];

  function plan(o) {
    o = o || {};
    var u = USE[o.useCase || 'street'] || USE.street;
    var agg = !!o.aggregate, ai = !!o.edgeAI, cloud = o.cloud !== false, linkUp = o.linkUp !== false;
    var rtt = o.rttMs == null ? 80 : o.rttMs, wanMbps = o.wanMbps == null ? 20 : o.wanMbps;
    var raw = u.rawBps;
    var gwOut = agg ? raw / u.aggFactor : raw;
    var edgeOut = ai ? gwOut / u.eventFactor : gwOut;
    var up = cloud ? edgeOut : 0;                       // bytes per second that try to leave the site
    var stages = [
      { id: 'things', name: 'The Things', inRate: 0, outRate: raw, latencyMs: HOP.sense },
      { id: 'sensors', name: 'Sensors & actuators', inRate: raw, outRate: raw, latencyMs: HOP.toGateway },
      { id: 'gateway', name: 'Data aggregation & gateways', inRate: raw, outRate: gwOut, latencyMs: HOP.toEdge + (agg ? HOP.gatewayWork : 0) },
      { id: 'edge', name: 'Edge IT', inRate: gwOut, outRate: up, latencyMs: ai ? HOP.edgeInfer : HOP.edgeForward },
      { id: 'cloud', name: 'Data centre & cloud IT', inRate: linkUp ? up : 0, outRate: 0, latencyMs: cloud ? rtt / 2 + HOP.cloudInfer : 0 }
    ];
    var wanLoad = up * 8 / 1e6;                         // Mbit/s asked of the uplink
    var fits = wanLoad <= wanMbps;
    var over = Math.max(0, wanLoad - wanMbps);
    var decisionAt = ai ? 'edge' : cloud ? 'cloud' : 'none';
    var path = [];
    if (decisionAt !== 'none') {
      path.push({ id: 'sense', label: 'sensing', ms: HOP.sense }, { id: 'gw', label: 'to the gateway', ms: HOP.toGateway });
      if (agg) path.push({ id: 'gwwork', label: 'gateway work', ms: HOP.gatewayWork });
      path.push({ id: 'toedge', label: 'to the edge server', ms: HOP.toEdge });
      if (decisionAt === 'edge') path.push({ id: 'ai', label: 'edge AI decides', ms: HOP.edgeInfer });
      else path.push({ id: 'fwd', label: 'edge forwards', ms: HOP.edgeForward }, { id: 'up', label: 'WAN up', ms: rtt / 2 }, { id: 'cloudai', label: 'cloud analyses', ms: HOP.cloudInfer }, { id: 'down', label: 'WAN down', ms: rtt / 2 });
      path.push({ id: 'back', label: 'back to the actuator', ms: HOP.backToActuator });
    }
    var actuatorsWork = decisionAt === 'edge' || (decisionAt === 'cloud' && linkUp);
    var decisionMs = actuatorsWork ? path.reduce(function (s, p) { return s + p.ms; }, 0) : Infinity;
    var cloudSees = !cloud ? 'nothing (cloud not used)' : ai ? 'only events' : agg ? 'summaries' : 'every raw reading';
    return {
      use: o.useCase || 'street', stages: stages, rawBps: raw, upBps: up, wanLoad: wanLoad, wanMbps: wanMbps, fits: fits,
      utilisation: wanMbps > 0 ? wanLoad / wanMbps : Infinity,
      backlogMBperMin: over * 60 / 8,                   // how much piles up per minute when the uplink is too small
      queueDelayAfterMinSec: wanMbps > 0 && over > 0 ? over * 60 / wanMbps : 0,
      decisionAt: decisionAt, path: path, decisionMs: decisionMs, worksOffline: decisionAt === 'edge', actuatorsWork: actuatorsWork,
      buffered: !linkUp && cloud ? up : 0, cloudSees: cloudSees, linkUp: linkUp, rttMs: rtt
    };
  }
  NA.engines.EdgeChain = { plan: plan, USE: USE, USE_ORDER: USE_ORDER, HOP: HOP };

  /* =====================================================================================
     Tiny — engine: a motor-health sensor board and a tiny softmax classifier
     ===================================================================================== */
  var CLASSES = [
    { id: 'ok', name: 'Healthy', mean: [2.5, 52], sd: [0.9, 6], fault: false },
    { id: 'worn', name: 'Worn bearing', mean: [5.6, 62], sd: [1.3, 7], fault: true },
    { id: 'hot', name: 'Overheating', mean: [3.8, 80], sd: [1.1, 8], fault: true }
  ];
  var RANGE = { v: [0, 12], t: [20, 110] };
  var K = CLASSES.length, F = 3;                        // classes, features (vibration, temperature, bias)
  function norm(v, t) { return [(v - 4.5) / 3, (t - 65) / 22]; }
  function gauss(r) { var u = Math.max(r(), 1e-12), w = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * w); }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function round(x, d) { var p = Math.pow(10, d); return Math.round(x * p) / p; }

  /* n noisy readings of class `cls` from the hidden generator (seeded: same seed → same readings) */
  function generate(cls, n, seed, spread) {
    var r = NA.rng(seed >>> 0), c = CLASSES[cls], k = spread == null ? 1 : spread, out = [];
    for (var i = 0; i < n; i++) {
      out.push({ v: round(clamp(c.mean[0] + k * c.sd[0] * gauss(r), 0.1, RANGE.v[1]), 2), t: round(clamp(c.mean[1] + k * c.sd[1] * gauss(r), RANGE.t[0], RANGE.t[1]), 1), y: cls, truth: cls });
    }
    return out;
  }
  /* n readings per class where a share `noise` of the recorded LABELS is wrong (the reading itself stays true) */
  function recordBatch(cls, n, seed, noise, spread) {
    var s = generate(cls, n, seed, spread), r = NA.rng((seed ^ 0x5bd1e995) >>> 0);
    s.forEach(function (x) { if (noise > 0 && r() < noise) { var o = (cls + 1 + Math.floor(r() * (K - 1))) % K; x.y = o; } });
    return s;
  }
  function softmax(z) {
    var m = Math.max.apply(null, z), e = z.map(function (a) { return Math.exp(a - m); }), s = e.reduce(function (a, b) { return a + b; }, 0);
    return e.map(function (a) { return a / s; });
  }
  function emptyModel() { var W = []; for (var k = 0; k < K; k++) W.push([0, 0, 0]); return { W: W, losses: [], epochs: 0 }; }
  function logits(W, x) { var z = []; for (var k = 0; k < K; k++) z.push(W[k][0] * x[0] + W[k][1] * x[1] + W[k][2]); return z; }
  function predict(model, p) {
    var x = norm(p.v, p.t), pr = softmax(logits(model.W, x)), best = 0;
    for (var k = 1; k < K; k++) if (pr[k] > pr[best]) best = k;
    return { probs: pr, label: best, confidence: pr[best] };
  }
  /* full-batch gradient descent on cross-entropy; opts.init continues from an earlier model (so the UI can animate in chunks) */
  function train(samples, opts) {
    opts = opts || {};
    var epochs = opts.epochs == null ? 150 : opts.epochs, lr = opts.lr == null ? 0.8 : opts.lr, l2 = opts.l2 == null ? 0.001 : opts.l2;
    var model = opts.init ? { W: opts.init.W.map(function (r) { return r.slice(); }), losses: opts.init.losses.slice(), epochs: opts.init.epochs } : emptyModel();
    var n = samples.length;
    if (!n) return model;
    var X = samples.map(function (s) { return norm(s.v, s.t); });
    for (var e = 0; e < epochs; e++) {
      var G = [], loss = 0, k, i;
      for (k = 0; k < K; k++) G.push([0, 0, 0]);
      for (i = 0; i < n; i++) {
        var p = softmax(logits(model.W, X[i])), y = samples[i].y;
        loss -= Math.log(Math.max(p[y], 1e-12));
        for (k = 0; k < K; k++) { var d = p[k] - (k === y ? 1 : 0); G[k][0] += d * X[i][0]; G[k][1] += d * X[i][1]; G[k][2] += d; }
      }
      for (k = 0; k < K; k++) for (var j = 0; j < F; j++) model.W[k][j] -= lr * (G[k][j] / n + (j < 2 ? l2 * model.W[k][j] : 0));
      model.losses.push(loss / n); model.epochs++;
    }
    return model;
  }
  /* readings the board will meet after deployment: 60 % healthy, 20 % worn, 20 % overheating (fixed seed → everyone sees the same 200) */
  function testSet(n, seed, spread) {
    n = n || 200; var out = [], counts = [Math.round(n * 0.6), Math.round(n * 0.2)]; counts.push(n - counts[0] - counts[1]);
    for (var k = 0; k < K; k++) out = out.concat(generate(k, counts[k], (seed == null ? 9001 : seed) + 17 * k, spread == null ? 1 : spread));
    var r = NA.rng(4242), i, j, tmp;                    // deterministic shuffle so the stream looks like a stream
    for (i = out.length - 1; i > 0; i--) { j = Math.floor(r() * (i + 1)); tmp = out[i]; out[i] = out[j]; out[j] = tmp; }
    return out;
  }
  function evaluate(model, data) {
    var conf = [], k, c = 0, falseAlarms = 0, missed = 0, wrongDiagnosis = 0, healthy = 0, faults = 0;
    for (k = 0; k < K; k++) conf.push([0, 0, 0]);
    var results = data.map(function (d) {
      var p = predict(model, d), t = d.truth == null ? d.y : d.truth; conf[t][p.label]++;
      if (p.label === t) c++;
      if (t === 0) { healthy++; if (p.label !== 0) falseAlarms++; } else { faults++; if (p.label === 0) missed++; else if (p.label !== t) wrongDiagnosis++; }
      return { pred: p.label, truth: t, ok: p.label === t };
    });
    return { n: data.length, accuracy: data.length ? c / data.length : 0, confusion: conf, falseAlarms: falseAlarms, missed: missed, wrongDiagnosis: wrongDiagnosis, healthy: healthy, faults: faults, results: results };
  }
  function paramCount() { return K * F; }
  function modelBytes() { return paramCount() * 4; }     // float32
  /* operations for one prediction: K×(2 multiplies + 2 adds) for the logits, plus a softmax (~4 per class) */
  function inferenceOps() { return K * 4 + K * 4; }
  /* readings whose label disagrees with the crowd: look at the 5 nearest other readings; if at most one of them
     carries the same label, the label is suspicious (neighbour-vote cleaning) */
  function suspects(samples) {
    var n = samples.length, out = [], k = 5;
    if (n < 2 * k) return out;
    var X = samples.map(function (s) { return norm(s.v, s.t); });
    for (var i = 0; i < n; i++) {
      var d = [];
      for (var j = 0; j < n; j++) if (j !== i) d.push({ j: j, d: (X[i][0] - X[j][0]) * (X[i][0] - X[j][0]) + (X[i][1] - X[j][1]) * (X[i][1] - X[j][1]) });
      d.sort(function (a, b) { return a.d - b.d; });
      var same = 0;
      for (var q = 0; q < k; q++) if (samples[d[q].j].y === samples[i].y) same++;
      if (same <= 1) out.push(i);
    }
    return out;
  }
  /* accuracy on the 200 hidden readings as a function of samples recorded per class (average of several seeds) */
  function learningCurve(o) {
    o = o || {}; var sizes = o.sizes || [1, 2, 3, 5, 10, 20, 40], seeds = o.seeds || 6, noise = o.noise || 0, epochs = o.epochs || 150, ts = testSet(200), out = [];
    sizes.forEach(function (n) {
      var acc = 0;
      for (var s = 0; s < seeds; s++) {
        var samples = [];
        for (var k = 0; k < K; k++) samples = samples.concat(recordBatch(k, n, 500 + 31 * s + 7 * k + n, noise));
        acc += evaluate(train(samples, { epochs: epochs }), ts).accuracy;
      }
      out.push({ n: n, accuracy: acc / seeds });
    });
    return out;
  }
  NA.engines.Tiny = { CLASSES: CLASSES, RANGE: RANGE, generate: generate, recordBatch: recordBatch, train: train, predict: predict, evaluate: evaluate, testSet: testSet,
    modelBytes: modelBytes, paramCount: paramCount, inferenceOps: inferenceOps, suspects: suspects, learningCurve: learningCurve, norm: norm, emptyModel: emptyModel };

  if (typeof module !== 'undefined' && module.exports) module.exports = { EdgeChain: NA.engines.EdgeChain, Tiny: NA.engines.Tiny };
  if (!hasDom) return;

  /* =====================================================================================
     UI — iot-edgechain
     ===================================================================================== */
  var SVGNS = 'http://www.w3.org/2000/svg';
  function fmtRate(Bps) { return Bps <= 0 ? '0' : NA.fmtBps(Bps * 8); }
  function fmtMs(ms) { return ms === Infinity ? 'never' : ms < 1000 ? (ms < 10 ? ms.toFixed(1) : Math.round(ms)) + ' ms' : (ms / 1000).toFixed(1) + ' s'; }
  function bandHeight(Bps) { var b = Bps * 8; return b <= 0 ? 0 : Math.max(2, Math.min(64, 3 + (Math.log10(b) - 2) * 10)); }
  var WAN_STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];

  function buildEdgeChain(host, NA) {
    var el = NA.el, svg = NA.svg;
    host.classList.add('na-iot-edgechain');
    host.appendChild(el('p', 'na-try', [el('b', null, 'Try this: '), 'pick the camera farm, leave everything off and compare the upload with the link capacity — then switch on the gateway, then the edge AI, and finally drop the link. Which actuators still work?']));
    var st = { use: 'street', agg: false, ai: false, cloud: true, wanIdx: 4, rtt: 80, linkUp: true };
    var chips = el('div', 'na-chips'); chips.appendChild(el('span', 'na-lab', 'Use case'));
    var useBtns = {};
    NA.engines.EdgeChain.USE_ORDER.forEach(function (id) {
      var b = NA.chip(NA.engines.EdgeChain.USE[id].label, function () { st.use = id; update(); }); useBtns[id] = b; chips.appendChild(b);
    });
    var tog = el('div', 'na-controls tight');
    function toggle(label, key, inv) {
      var b = NA.chip('', function () { st[key] = !st[key]; update(); }); b.classList.add('na-iot-tog'); tog.appendChild(b);
      return { node: b, paint: function () { var on = inv ? !st[key] : st[key]; b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.textContent = (on ? '☑ ' : '☐ ') + label; } };
    }
    var tAgg = toggle('Gateway aggregates', 'agg'), tAI = toggle('Edge IT runs an AI model', 'ai'), tCloud = toggle('Cloud does the deep analytics', 'cloud'), tLink = toggle('Link to the cloud is down', 'linkUp', true);
    var sWan = NA.slider('WAN uplink capacity', 0, WAN_STEPS.length - 1, 1, st.wanIdx, function (i) { return NA.fmtBps(WAN_STEPS[i] * 1e6); }, function (i) { st.wanIdx = i; update(); });
    var sRtt = NA.slider('WAN round trip', 20, 200, 10, st.rtt, function (v) { return v + ' ms'; }, function (v) { st.rtt = v; update(); });
    var ctr = el('div', 'na-controls'); ctr.appendChild(sWan.wrap); ctr.appendChild(sRtt.wrap);
    var pre = el('div', 'na-chips'); pre.appendChild(el('span', 'na-lab', 'Presets'));
    [['Everything to the cloud', { agg: false, ai: false, cloud: true, linkUp: true }], ['Smart gateway', { agg: true, ai: false, cloud: true, linkUp: true }], ['Edge AI', { agg: true, ai: true, cloud: true, linkUp: true }], ['Edge AI, link down', { agg: true, ai: true, cloud: true, linkUp: false }]].forEach(function (p) {
      pre.appendChild(NA.chip(p[0], function () { Object.keys(p[1]).forEach(function (k) { st[k] = p[1][k]; }); update(); }));
    });
    var stage = el('div', 'na-stage na-iot-ec-stage'); var swipe = el('p', 'na-note na-iot-swipe', '↔ On a narrow screen, swipe the diagram sideways to see all five boxes.');
    var tiles = el('div', 'na-stats'); var tUp = NA.stat('Upload to the cloud'), tDay = NA.stat('Per day'), tFit = NA.stat('Uplink check'), tDec = NA.stat('Time to decision'), tWhere = NA.stat('Decided at');
    [tUp, tDay, tFit, tDec, tWhere].forEach(function (t) { tiles.appendChild(t.node); });
    var pathBox = el('div', 'na-iot-path'), actBox = el('div', 'na-iot-act');
    var say = NA.narrator(); var note = el('p', 'na-note');
    [chips, tog, ctr, pre, swipe, stage, tiles, pathBox, actBox, say.node, note].forEach(function (n) { host.appendChild(n); });

    function draw(p) {
      NA.clear(stage);
      var u = NA.engines.EdgeChain.USE[st.use];
      var s = svg('svg', { viewBox: '0 0 720 348', role: 'img', 'aria-label': 'The edge chain, left to right: the things, sensors and actuators, data aggregation and gateways, edge IT, and the data centre. The band between the boxes is as thick as the data rate there: raw ' + fmtRate(p.rawBps) + ', then ' + fmtRate(p.stages[2].outRate) + ' after the gateway, then ' + fmtRate(p.upBps) + ' leaving the site.' });
      var X = [12, 154, 296, 438, 580], W = 116, BY = 38, BH = 98, CY = 262;
      // OT / IT headings and the edge divider (slide 33)
      svg('text', { x: 212, y: 16, 'text-anchor': 'middle', class: 'na-iot-ot' }, s, 'OPERATIONS TECHNOLOGY');
      svg('text', { x: 568, y: 16, 'text-anchor': 'middle', class: 'na-iot-it' }, s, 'INFORMATION TECHNOLOGY');
      svg('line', { x1: 12, y1: 24, x2: 412, y2: 24, class: 'na-iot-rule' }, s); svg('line', { x1: 438, y1: 24, x2: 696, y2: 24, class: 'na-iot-rule' }, s);
      svg('line', { x1: 425, y1: 6, x2: 425, y2: 334, class: 'na-iot-edgeline' }, s);
      svg('text', { x: 425, y: 345, 'text-anchor': 'middle', class: 'na-iot-edgelab' }, s, 'THE EDGE');
      var boxes = [
        { t: 'The Things', sub: u.thing + ' · wearables · cars · motors · meters', cap: 'DATA GENERATION', c: '--cmp-10', state: '' },
        { t: 'Sensors & actuators', sub: 'sense the world, and act on it', cap: 'DATA SENSING', c: '--cmp-8', state: '' },
        { t: 'Aggregation & gateways', sub: st.agg ? 'sends summaries, not every reading' : 'passes everything through', cap: 'DATA AGGREGATION', c: '--cmp-3', state: st.agg ? '✓ aggregates' : '— pass-through' },
        { t: 'Edge IT', sub: st.ai ? 'AI model forwards only events' : 'forwards what it gets', cap: 'EARLY ANALYTICS', c: '--cmp-2', state: st.ai ? '✓ AI model on site' : '— no model' },
        { t: 'Data centre & cloud IT', sub: st.cloud ? 'history, big models, dashboards' : 'not used', cap: 'DEEP ANALYTICS', c: '--cmp-5', state: st.cloud ? '✓ deep analytics' : '— off' }
      ];
      boxes.forEach(function (b, i) {
        var g = svg('g', { class: 'na-iot-box', style: '--c: var(' + b.c + ')' }, s);
        if (i === 4 && (!st.cloud || !st.linkUp)) g.setAttribute('class', 'na-iot-box dim');
        svg('rect', { x: X[i], y: BY, width: W, height: BH, rx: 9 }, g);
        var tl = b.t.length > 15 ? b.t.split(' & ') : [b.t];
        tl.forEach(function (ln, j) { svg('text', { x: X[i] + W / 2, y: BY + 17 + j * 13, 'text-anchor': 'middle', class: 'na-iot-bt' }, g, tl.length > 1 && j === 0 ? ln + ' &' : ln); });
        wrap(g, b.sub, X[i] + W / 2, BY + 20 + tl.length * 13 + 1, 22, 3);
        if (b.state) svg('text', { x: X[i] + W / 2, y: BY + BH - 7, 'text-anchor': 'middle', class: 'na-iot-bs' }, g, b.state);
        svg('text', { x: X[i] + W / 2, y: BY + BH + 15, 'text-anchor': 'middle', class: 'na-iot-cap' }, s, b.cap);
      });
      // double arrows between the first boxes (sensing and acting)
      // the funnel: thickness = data rate (log scale)
      var r = [p.stages[0].outRate, p.stages[1].outRate, p.stages[2].outRate, p.stages[3].inRate, p.upBps];
      var nodes = [r[0], r[1], r[2], r[3], r[4]];
      var cx = X.map(function (x) { return x + W / 2; });
      svg('text', { x: 12, y: CY - 52, class: 'na-iot-flowlab' }, s, 'data rate (band thickness, log scale):');
      for (var i = 0; i < 4; i++) {
        var h0 = bandHeight(i < 3 ? nodes[i] : nodes[3]) / 2, h1 = bandHeight(nodes[i + 1]) / 2;
        if (i === 3) { h0 = bandHeight(p.stages[3].inRate) / 2; h1 = bandHeight(p.upBps) / 2; }
        var broken = i === 3 && (!st.linkUp || !st.cloud);
        var d = 'M' + cx[i] + ' ' + (CY - h0) + ' L' + cx[i + 1] + ' ' + (CY - h1) + ' L' + cx[i + 1] + ' ' + (CY + h1) + ' L' + cx[i] + ' ' + (CY + h0) + ' Z';
        svg('path', { d: d, class: 'na-iot-band' + (broken ? ' broken' : '') + (i === 3 && !p.fits && st.cloud ? ' over' : '') }, s);
      }
      // WAN capacity pipe (dashed outline) on the last segment
      if (st.cloud) {
        var hc = bandHeight(p.wanMbps * 1e6 / 8) / 2;
        svg('rect', { x: cx[3], y: CY - hc, width: cx[4] - cx[3], height: 2 * hc, class: 'na-iot-pipe' + (p.fits ? '' : ' over') }, s);
        svg('text', { x: (cx[3] + cx[4]) / 2, y: CY - hc - 5, 'text-anchor': 'middle', class: 'na-iot-pipelab' }, s, 'uplink ' + NA.fmtBps(p.wanMbps * 1e6));
      }
      if (!st.linkUp && st.cloud) svg('text', { x: (cx[3] + cx[4]) / 2, y: CY + 6, 'text-anchor': 'middle', class: 'na-iot-x' }, s, '✗ link down');
      // rate labels
      var labs = [r[0], r[1], r[2], r[3], p.upBps];
      labs.forEach(function (rate, i) {
        var a = i === 4 && (!st.cloud ? 'nothing sent' : fmtRate(rate)) || fmtRate(rate);
        svg('text', { x: cx[i], y: CY + 52, 'text-anchor': 'middle', class: 'na-iot-rate' + (i === 4 && !p.fits && st.cloud ? ' bad' : '') }, s, i === 0 ? 'raw ' + fmtRate(rate) : a);
      });
      return s;
    }
    function wrap(g, text, x, y, maxCh, maxLines) {
      var words = text.split(' '), lines = [], cur = '';
      words.forEach(function (w) { if ((cur + ' ' + w).trim().length > maxCh && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); });
      if (cur) lines.push(cur);
      lines.slice(0, maxLines).forEach(function (l, i) { svg('text', { x: x, y: y + i * 11, 'text-anchor': 'middle', class: 'na-iot-bsub' }, g, l); });
    }
    function update() {
      var u = NA.engines.EdgeChain.USE[st.use];
      var p = plan({ useCase: st.use, aggregate: st.agg, edgeAI: st.ai, cloud: st.cloud, wanMbps: WAN_STEPS[st.wanIdx], linkUp: st.linkUp, rttMs: st.rtt });
      Object.keys(useBtns).forEach(function (k) { useBtns[k].setAttribute('aria-pressed', k === st.use ? 'true' : 'false'); });
      [tAgg, tAI, tCloud, tLink].forEach(function (t) { t.paint(); });
      stage.appendChild(draw(p));
      tUp.set(st.cloud ? fmtRate(p.upBps) : 'nothing', st.cloud ? (p.upBps < p.rawBps ? Math.round(p.rawBps / Math.max(p.upBps, 1e-9)).toLocaleString('en-US') + '× less than raw' : 'all of the raw data') : 'cloud not used');
      tDay.set(st.cloud ? NA.fmtBytes(p.upBps * 86400) : '0 B', 'raw would be ' + NA.fmtBytes(p.rawBps * 86400));
      tFit.set(!st.cloud ? '—' : p.fits ? 'fits' : 'too small', !st.cloud ? 'nothing to upload' : Math.round(p.utilisation * 100) + '% of ' + NA.fmtBps(p.wanMbps * 1e6));
      tFit.node.className = 'na-stat ' + (!st.cloud ? '' : p.fits ? 'good' : 'bad');
      tDec.set(fmtMs(p.decisionMs), p.decisionAt === 'none' ? 'nobody analyses the data' : p.actuatorsWork ? 'sensor → decision → actuator' : 'no answer without the link');
      tDec.node.className = 'na-stat ' + (p.actuatorsWork ? (p.decisionMs < 50 ? 'good' : 'warn') : 'bad');
      tWhere.set(p.decisionAt === 'edge' ? 'on site' : p.decisionAt === 'cloud' ? 'in the cloud' : '—', 'cloud sees: ' + p.cloudSees.replace(' (cloud not used)', ''));
      // decision-path bar
      NA.clear(pathBox);
      if (p.path.length) {
        pathBox.appendChild(el('div', 'na-lab', 'Where the time goes before the actuator is told what to do — ' + (p.actuatorsWork ? fmtMs(p.decisionMs) : 'the answer never arrives')));
        var row = el('div', 'na-iot-seg'); row.setAttribute('role', 'img');
        row.setAttribute('aria-label', 'Decision path: ' + p.path.map(function (q) { return q.label + ' ' + fmtMs(q.ms); }).join(', '));
        var cols = { sense: '--cmp-10', gw: '--cmp-3', gwwork: '--cmp-3', toedge: '--cmp-3', ai: '--cmp-2', fwd: '--cmp-2', up: '--cmp-5', cloudai: '--cmp-5', down: '--cmp-5', back: '--cmp-8' };
        var total = p.path.reduce(function (a, q) { return a + q.ms; }, 0);
        p.path.forEach(function (q) { var sg = el('span', 'na-iot-part' + (!p.actuatorsWork ? ' dead' : '')); sg.style.setProperty('--c', 'var(' + cols[q.id] + ')'); sg.style.flexGrow = Math.max(q.ms, total * 0.02); sg.title = q.label + ': ' + fmtMs(q.ms); row.appendChild(sg); });
        pathBox.appendChild(row);
        var leg = el('div', 'na-key'); p.path.forEach(function (q) { var k = el('span'); var sw = el('i'); sw.style.setProperty('--c', 'var(' + cols[q.id] + ')'); k.appendChild(sw); k.appendChild(document.createTextNode(q.label + ' · ' + fmtMs(q.ms))); leg.appendChild(k); });
        pathBox.appendChild(leg);
      }
      // actuators
      NA.clear(actBox);
      var ab = el('div', 'na-iot-actbox ' + (p.actuatorsWork ? 'ok' : 'no'));
      ab.appendChild(el('b', null, (p.actuatorsWork ? '✓ ' : '✗ ') + 'Can ' + u.actuator + ' still act?  '));
      ab.appendChild(document.createTextNode(p.decisionAt === 'none' ? 'No: nothing analyses the data, so nobody decides to ' + u.decision + '.'
        : p.actuatorsWork ? 'Yes: it can ' + u.decision + (p.decisionAt === 'edge' ? ', even if the link to the cloud is down.' : ' — but only while the link to the cloud is up.')
        : 'No: the decision lives in the cloud and the link is down, so the system cannot ' + u.decision + '.'));
      actBox.appendChild(ab);
      say.say(describe(p, u));
      note.innerHTML = 'Simulation with illustrative numbers: <b>' + u.source + '</b> = ' + fmtRate(p.rawBps) + ' raw. Assumed hop times — sensing ' + HOP.sense + ' ms, sensor→gateway ' + HOP.toGateway + ' ms, gateway→edge ' + HOP.toEdge + ' ms, edge AI ' + HOP.edgeInfer + ' ms, cloud analysis ' + HOP.cloudInfer + ' ms, back to the actuator ' + HOP.backToActuator + ' ms, plus the WAN round trip you set. ' + (u.slide ? 'Idea from lecture slide ' + u.slide + '; ' : '') + 'edge-chain diagram: lecture slide 33.';
    }
    function describe(p, u) {
      var s = '<b>' + u.label + '.</b> ' + u.story + ' ';
      if (!st.cloud) s += 'With the cloud switched off nothing leaves the site: great for privacy and bandwidth, but you lose history, big models and dashboards.';
      else if (!st.agg && !st.ai) s += 'Everything climbs to the cloud: <b>' + fmtRate(p.upBps) + '</b>. ' + (p.fits ? 'The uplink copes — for now.' : '<span class="bad">The uplink is far too small</span>: it needs ' + NA.fmtBps(p.wanLoad * 1e6) + ' but has ' + NA.fmtBps(p.wanMbps * 1e6) + ', so about ' + NA.fmtBytes(p.backlogMBperMin * 1e6) + ' piles up every minute, and after just one minute the newest reading already waits ' + NA.fmtTime(p.queueDelayAfterMinSec) + ' in the queue.');
      else if (st.agg && !st.ai) s += 'The gateway (<em>early data collection</em>) sends ' + u.aggText + ': <b>' + fmtRate(p.upBps) + '</b>' + (p.fits ? ', which fits.' : ', still <span class="bad">more than the uplink</span>.') + ' The cloud now sees summaries, not every reading.';
      else s += 'The edge server (<em>early data analytics</em>) runs the model next to the data and forwards ' + u.eventText + ': only <b>' + fmtRate(p.upBps) + '</b> go up' + (p.fits ? '.' : ' — still too much.') + ' The cloud keeps the <em>deep</em> analytics: history, retraining the model, dashboards.';
      if (!st.linkUp && st.cloud) s += ' <b>The link is down:</b> ' + (p.worksOffline ? 'decisions still happen on site, and the events wait in the edge server’s buffer (about ' + NA.fmtBytes(p.buffered * 3600) + ' per hour of outage).' : p.decisionAt === 'cloud' ? '<span class="bad">no decision can be made</span> — the actuators are on their own.' : '');
      s += ' <span class="na-iot-fine">Lesson: decide as close to the data as the decision allows; send the summary, not the stream.</span>';
      return s;
    }
    update();
  }
  NA.register('iot-edgechain', { title: 'Where should the data be processed? The edge chain', hint: 'Slide 33: things → sensors → gateways → edge IT → cloud. Illustrative rates and delays — real systems differ.', build: buildEdgeChain });

  /* =====================================================================================
     UI — iot-train
     ===================================================================================== */
  function cssColour(host, name, fallback) {
    var v = '';
    try { v = getComputedStyle(host).getPropertyValue(name).trim(); } catch (e) { /* ignore */ }
    var m = /^#([0-9a-f]{6})$/i.exec(v);
    if (!m) { m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(v); if (m) return [parseInt(m[1] + m[1], 16), parseInt(m[2] + m[2], 16), parseInt(m[3] + m[3], 16)]; return fallback; }
    return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
  }

  function buildTrain(host, NA) {
    var el = NA.el, svg = NA.svg, T = NA.engines.Tiny, C = T.CLASSES;
    host.classList.add('na-iot-train');
    host.appendChild(el('p', 'na-try', [el('b', null, 'Try this: '), 'press “Good data”, then switch to step 4 and place a reading between two clusters — see how sure the model is. Then press “Sloppy labels” and compare the accuracy on the 200 hidden readings.']));
    var KC = ['--cmp-6', '--cmp-3', '--cmp-4'], GLYPH = ['●', '◆', '▲'];
    var st = { samples: [], model: T.emptyModel(), trained: false, sel: 0, noise: 0, rec: 0, tab: 0, marker: { v: 4.5, t: 70 }, flagged: [], testRes: null, epochs: 150, truthNote: '' };
    var run = NA.runner();
    var W = 480, H = 320, PL = 44, PR = 10, PT = 10, PB = 34;
    function px(v) { return PL + (v - T.RANGE.v[0]) / (T.RANGE.v[1] - T.RANGE.v[0]) * (W - PL - PR); }
    function py(t) { return H - PB - (t - T.RANGE.t[0]) / (T.RANGE.t[1] - T.RANGE.t[0]) * (H - PT - PB); }
    function vx(x) { return clamp(T.RANGE.v[0] + (x - PL) / (W - PL - PR) * (T.RANGE.v[1] - T.RANGE.v[0]), T.RANGE.v[0], T.RANGE.v[1]); }
    function ty(y) { return clamp(T.RANGE.t[0] + (H - PB - y) / (H - PT - PB) * (T.RANGE.t[1] - T.RANGE.t[0]), T.RANGE.t[0], T.RANGE.t[1]); }

    /* --- preset chips --- */
    var pre = el('div', 'na-chips'); pre.appendChild(el('span', 'na-lab', 'Data presets'));
    [['Good data (15 per class)', 15, 0], ['Too little data (2 per class)', 2, 0], ['Sloppy labels (30 % wrong)', 10, 0.3]].forEach(function (p) {
      pre.appendChild(NA.chip(p[0], function () { preset(p[1], p[2], p[0]); }));
    });
    pre.appendChild(NA.chip('↺ Start again', function () { reset(); }));

    /* --- plot --- */
    var plotWrap = el('div', 'na-iot-plot');
    var canvas = el('canvas', 'na-iot-heat'); canvas.width = 129; canvas.height = 84; canvas.setAttribute('aria-hidden', 'true');
    canvas.style.left = (PL / W * 100) + '%'; canvas.style.top = (PT / H * 100) + '%'; canvas.style.width = ((W - PL - PR) / W * 100) + '%'; canvas.style.height = ((H - PT - PB) / H * 100) + '%';
    var s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', class: 'na-iot-svg' });
    plotWrap.appendChild(canvas); plotWrap.appendChild(s);
    var gAxes = svg('g', null, s), gDots = svg('g', null, s), gTest = svg('g', null, s), gMark = svg('g', null, s);
    var stage = el('div', 'na-stage na-iot-stage'); stage.appendChild(plotWrap);
    var key = el('div', 'na-key');
    C.forEach(function (c, i) { var k = el('span'); k.appendChild(el('b', 'na-iot-glyph k' + i, GLYPH[i])); k.appendChild(document.createTextNode(' ' + c.name)); key.appendChild(k); });
    stage.appendChild(key);
    function drawAxes() {
      NA.clear(gAxes);
      svg('rect', { x: PL, y: PT, width: W - PL - PR, height: H - PT - PB, class: 'na-iot-frame' }, gAxes);
      [0, 3, 6, 9, 12].forEach(function (v) { svg('line', { x1: px(v), y1: H - PB, x2: px(v), y2: H - PB + 4, class: 'na-iot-tick' }, gAxes); svg('text', { x: px(v), y: H - PB + 16, 'text-anchor': 'middle', class: 'na-iot-axt' }, gAxes, v); });
      [20, 40, 60, 80, 100].forEach(function (t) { svg('line', { x1: PL - 4, y1: py(t), x2: PL, y2: py(t), class: 'na-iot-tick' }, gAxes); svg('text', { x: PL - 7, y: py(t) + 3, 'text-anchor': 'end', class: 'na-iot-axt' }, gAxes, t); });
      svg('text', { x: (PL + W - PR) / 2, y: H - 4, 'text-anchor': 'middle', class: 'na-iot-axl' }, gAxes, 'vibration (mm/s) →');
      svg('text', { x: 11, y: (PT + H - PB) / 2, 'text-anchor': 'middle', class: 'na-iot-axl', transform: 'rotate(-90 11 ' + ((PT + H - PB) / 2) + ')' }, gAxes, 'temperature (°C) →');
    }
    function glyph(parent, x, y, k, r, cls) {
      var n;
      if (k === 0) n = svg('circle', { cx: x, cy: y, r: r }, parent);
      else if (k === 1) n = svg('rect', { x: x - r, y: y - r, width: 2 * r, height: 2 * r, transform: 'rotate(45 ' + x + ' ' + y + ')' }, parent);
      else n = svg('polygon', { points: x + ',' + (y - r - 1) + ' ' + (x + r + 1) + ',' + (y + r) + ' ' + (x - r - 1) + ',' + (y + r) }, parent);
      n.setAttribute('class', 'na-iot-pt k' + k + (cls ? ' ' + cls : ''));
      return n;
    }
    function drawDots() {
      NA.clear(gDots);
      st.samples.forEach(function (d, i) {
        var g = svg('g', null, gDots), flagged = st.flagged.indexOf(i) >= 0;
        glyph(g, px(d.v), py(d.t), d.y, 5);
        if (flagged) { svg('circle', { cx: px(d.v), cy: py(d.t), r: 9, class: 'na-iot-flag' }, g); svg('text', { x: px(d.v) + 7, y: py(d.t) - 7, class: 'na-iot-flagx' }, g, '✕'); }
      });
      NA.clear(gTest);
      if (st.testRes) st.testRes.data.forEach(function (d, i) {
        var r = st.testRes.res.results[i], g = svg('g', null, gTest);
        glyph(g, px(d.v), py(d.t), r.pred, 2.6, 'test' + (r.ok ? '' : ' wrong'));
        if (!r.ok) svg('circle', { cx: px(d.v), cy: py(d.t), r: 6, class: 'na-iot-wring' }, g);
      });
      drawMarker();
    }
    function drawMarker() {
      NA.clear(gMark);
      if (st.tab !== 3) return;
      var x = px(st.marker.v), y = py(st.marker.t);
      svg('line', { x1: x, y1: PT, x2: x, y2: H - PB, class: 'na-iot-cross' }, gMark); svg('line', { x1: PL, y1: y, x2: W - PR, y2: y, class: 'na-iot-cross' }, gMark);
      svg('circle', { cx: x, cy: y, r: 8, class: 'na-iot-marker' }, gMark);
      svg('text', { x: x + 11, y: y - 9, class: 'na-iot-mlab' }, gMark, 'live reading');
    }
    function drawHeat() {
      var ctx = canvas.getContext('2d'); if (!ctx) return;
      var w = canvas.width, h = canvas.height, img = ctx.createImageData(w, h), paper = cssColour(host, '--paper', [247, 249, 252]);
      var cols = KC.map(function (k, i) { return cssColour(host, k, [[60, 154, 63], [194, 120, 3], [214, 69, 107]][i]); });
      for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) {
        var v = T.RANGE.v[0] + (i + 0.5) / w * (T.RANGE.v[1] - T.RANGE.v[0]), t = T.RANGE.t[1] - (j + 0.5) / h * (T.RANGE.t[1] - T.RANGE.t[0]);
        var o = (j * w + i) * 4, r = 0, g = 0, b = 0, a = 0;
        if (st.trained) {
          var p = T.predict(st.model, { v: v, t: t });
          for (var k = 0; k < 3; k++) { r += p.probs[k] * cols[k][0]; g += p.probs[k] * cols[k][1]; b += p.probs[k] * cols[k][2]; }
          a = 0.08 + 0.4 * Math.pow((p.confidence - 1 / 3) / (2 / 3), 0.8);
        }
        img.data[o] = Math.round(paper[0] * (1 - a) + r * a); img.data[o + 1] = Math.round(paper[1] * (1 - a) + g * a); img.data[o + 2] = Math.round(paper[2] * (1 - a) + b * a); img.data[o + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
    }
    function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
    /* clicks / drags on the plot */
    var dragging = false;
    function svgPoint(ev) { var r = s.getBoundingClientRect(); return { x: (ev.clientX - r.left) / r.width * W, y: (ev.clientY - r.top) / r.height * H }; }
    s.addEventListener('pointerdown', function (ev) {
      var p = svgPoint(ev); if (p.x < PL || p.x > W - PR || p.y < PT || p.y > H - PB) return;
      if (st.tab === 0) { st.samples.push({ v: Math.round(vx(p.x) * 100) / 100, t: Math.round(ty(p.y) * 10) / 10, y: st.sel, truth: st.sel }); st.trained = false; st.flagged = []; st.testRes = null; refresh(); say.say('You placed a <b>' + C[st.sel].name + '</b> reading by hand at ' + st.samples[st.samples.length - 1].v + ' mm/s, ' + st.samples[st.samples.length - 1].t + ' °C.'); }
      else if (st.tab === 3) { dragging = true; try { s.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ } st.marker = { v: vx(p.x), t: ty(p.y) }; st.truthNote = ''; syncMarker(); }
    });
    s.addEventListener('pointermove', function (ev) { if (!dragging) return; var p = svgPoint(ev); st.marker = { v: vx(p.x), t: ty(p.y) }; st.truthNote = ''; syncMarker(); });
    s.addEventListener('pointerup', function () { dragging = false; });
    s.addEventListener('pointercancel', function () { dragging = false; });

    /* --- side card --- */
    var side = el('div', 'na-iot-side');
    var counts = el('div', 'na-iot-counts'), card = el('div', 'na-iot-card');
    side.appendChild(counts); side.appendChild(card);
    var cols2 = el('div', 'na-cols na-iot-cols'); cols2.appendChild(stage); cols2.appendChild(side);

    /* --- the five steps (slide 37) --- */
    var say = NA.narrator();
    var tabHost = el('div', 'na-iot-tabs');
    var recSeg, noiseSl, epSl, vSl, tSl, predBox, deployBox, flagInfo, trainInfo, testHead;
    var tabsApi = NA.tabs(tabHost, [
      { label: '1 · Get data', build: function (p) {
        p.appendChild(el('p', 'na-note', 'Slide 37, step 1. The machine is a motor with a vibration sensor and a temperature sensor. Pick what you are recording, then record readings — each press draws noisy readings from the (hidden) real machine.'));
        recSeg = NA.segmented(C.map(function (c, i) { return { value: String(i), label: GLYPH[i] + ' ' + c.name }; }), '0', function (v) { st.sel = +v; }, 'Class to record');
        var f = el('div', 'na-field'); f.appendChild(el('span', 'na-lab', 'Machine state to record')); f.appendChild(recSeg.wrap);
        noiseSl = NA.slider('Sloppy labelling', 0, 40, 5, 0, function (v) { return v + '% wrong'; }, function (v) { st.noise = v / 100; });
        var row = el('div', 'na-controls'); row.appendChild(f);
        row.appendChild(NA.button('Record 10 samples', 'primary', function () { record(10); })); row.appendChild(NA.button('Record 1', '', function () { record(1); }));
        row.appendChild(noiseSl.wrap); row.appendChild(NA.button('Clear data', 'danger', function () { st.samples = []; st.trained = false; st.model = T.emptyModel(); st.flagged = []; st.testRes = null; refresh(); say.say('Data cleared. A model is only as good as what it was shown.'); }));
        p.appendChild(row);
        p.appendChild(el('p', 'na-note', 'You can also click on the plot to add one reading by hand. A good first target: about 15 readings of each state.'));
      } },
      { label: '2 · Clean data', build: function (p) {
        p.appendChild(el('p', 'na-note', 'Slide 37, step 2: clean, prepare and manipulate the data. Mistakes slip in — a reading labelled “Healthy” that sits in the middle of the “Overheating” cluster is probably mislabelled. The check below looks at each reading’s 5 nearest neighbours: if almost all of them carry a different label, the reading is suspicious.'));
        var row = el('div', 'na-controls');
        row.appendChild(NA.button('Find suspicious samples', 'primary', function () { findSuspects(); }));
        var rm = NA.button('Remove flagged samples', '', function () { removeFlagged(); }); rm.id = NA.nextId('na-rm'); row.appendChild(rm); st.rmBtn = rm;
        p.appendChild(row); flagInfo = el('p', 'na-note', ''); p.appendChild(flagInfo);
      } },
      { label: '3 · Train', build: function (p) {
        p.appendChild(el('p', 'na-note', 'Slide 37, step 3. Training = nudging a handful of numbers so the predictions match your labels. Watch the coloured regions grow, and the loss (how wrong the model is) fall.'));
        epSl = NA.slider('Training epochs', 10, 300, 10, st.epochs, function (v) { return String(v); }, function (v) { st.epochs = v; });
        var row = el('div', 'na-controls'); row.appendChild(epSl.wrap);
        row.appendChild(NA.button('▶ Train', 'primary', function () { trainRun(st.epochs); })); row.appendChild(NA.button('Step 10 epochs', '', function () { trainRun(10); }));
        row.appendChild(NA.button('Reset model', '', function () { run.cancel(); st.model = T.emptyModel(); st.trained = false; st.testRes = null; refresh(); say.say('Model reset to all zeros: it knows nothing yet.'); }));
        p.appendChild(row); trainInfo = el('p', 'na-note', ''); p.appendChild(trainInfo);
      } },
      { label: '4 · Test', build: function (p) {
        p.appendChild(el('p', 'na-note', 'Slide 37, step 4: test with data the model has not seen. Drag the live-reading marker on the plot (or use the sliders) — the model answers with a confidence. Then ask the sensor board for a real reading.'));
        vSl = NA.slider('Vibration', 0, 12, 0.1, st.marker.v, function (v) { return v.toFixed(1) + ' mm/s'; }, function (v) { st.marker.v = v; st.truthNote = ''; drawMarker(); showPrediction(); });
        tSl = NA.slider('Temperature', 20, 110, 1, st.marker.t, function (v) { return Math.round(v) + ' °C'; }, function (v) { st.marker.t = v; st.truthNote = ''; drawMarker(); showPrediction(); });
        var row = el('div', 'na-controls'); row.appendChild(vSl.wrap); row.appendChild(tSl.wrap);
        row.appendChild(NA.button('📟 Sensor reading', 'primary', function () { sensorReading(); }));
        p.appendChild(row); predBox = el('div', 'na-iot-pred'); p.appendChild(predBox);
      } },
      { label: '5 · Deploy to the edge', build: function (p) {
        p.appendChild(el('p', 'na-note', 'Slide 37, step 5: application development. Training happened once, on a laptop or in the cloud. What goes onto the sensor board is only the trained numbers — running them is <em>inference</em>. Slides 34–36 show boards that do this on a few watts (an NVIDIA module, Google Coral).'.replace(/<\/?em>/g, '')));
        var row = el('div', 'na-controls'); row.appendChild(NA.button('▶ Run 200 hidden readings', 'primary', function () { runStream(); })); row.appendChild(NA.button('Draw the learning curve', '', function () { learning(); }));
        p.appendChild(row); deployBox = el('div', 'na-iot-deploy'); p.appendChild(deployBox);
      } }
    ], { onOpen: function (i) { st.tab = i; stage.classList.toggle('picking', i === 0 || i === 3); drawMarker(); if (i === 3) showPrediction(); if (i === 1) paintFlag(); if (i === 2) paintTrain(); if (i === 4) paintDeploy(); } });
    /* make sure every tab exists once so the controls can talk to each other */
    [1, 2, 3, 4].forEach(function (i) { tabsApi.open(i); }); tabsApi.open(0);

    /* --- actions --- */
    function record(n) {
      st.rec++; var b = T.recordBatch(st.sel, n, 100 + st.rec * 13 + st.sel, st.noise);
      st.samples = st.samples.concat(b); st.trained = false; st.flagged = []; st.testRes = null; refresh();
      var wrong = b.filter(function (x) { return x.y !== x.truth; }).length;
      say.say('Recorded <b>' + n + '</b> “' + C[st.sel].name + '” reading' + (n > 1 ? 's' : '') + '.' + (wrong ? ' <span class="bad">' + wrong + ' got the wrong label</span> — sloppy labelling is on.' : '') + hint());
    }
    function counts3() { var c = [0, 0, 0]; st.samples.forEach(function (d) { c[d.y]++; }); return c; }
    function hint() { var c = counts3(), low = []; C.forEach(function (k, i) { if (c[i] < 5) low.push(k.name); }); return low.length ? ' <span class="na-iot-fine">Too few examples of: ' + low.join(', ') + ' — the model has little to learn from.</span>' : ''; }
    function preset(n, noise, label) {
      run.cancel(); st.noise = noise; if (noiseSl) noiseSl.set(Math.round(noise * 100));
      st.samples = []; st.flagged = []; st.testRes = null; st.rec += 50;
      for (var k = 0; k < 3; k++) st.samples = st.samples.concat(T.recordBatch(k, n, 700 + st.rec + k * 7, noise));
      st.model = T.train(st.samples, { epochs: 200 }); st.trained = true; refresh();
      var ev = T.evaluate(st.model, T.testSet(200));
      say.say('<b>' + label + '.</b> ' + st.samples.length + ' samples recorded' + (noise ? ' (' + st.samples.filter(function (x) { return x.y !== x.truth; }).length + ' of them mislabelled)' : '') + ', model trained. On 200 hidden readings it is right <b>' + Math.round(ev.accuracy * 100) + '%</b> of the time, with ' + ev.falseAlarms + ' false alarms and ' + ev.missed + ' missed faults. ' + (n <= 2 ? 'Two readings per class is hardly a sample — the boundaries are guesses.' : noise ? 'Wrong labels pull the boundaries to the wrong place: <em>garbage in, garbage out</em>. Try step 2 to clean them.' : 'Enough clean data: the boundaries sit between the clusters.'));
    }
    function reset() { run.cancel(); st.samples = []; st.model = T.emptyModel(); st.trained = false; st.flagged = []; st.testRes = null; st.noise = 0; if (noiseSl) noiseSl.set(0); refresh(); say.say('Empty plot. Step 1: record some readings of each machine state.'); }
    function findSuspects() {
      st.flagged = T.suspects(st.samples); drawDots(); paintFlag();
      var real = st.flagged.filter(function (i) { return st.samples[i].y !== st.samples[i].truth; }).length;
      say.say(st.flagged.length ? '<b>' + st.flagged.length + '</b> reading' + (st.flagged.length > 1 ? 's are' : ' is') + ' surrounded by readings with a different label (marked ✕). In this simulation we can peek: <b>' + real + '</b> of them really were mislabelled; a real project would have to go and check each one.' : 'Nothing looks out of place — every reading has neighbours that share its label.');
    }
    function removeFlagged() {
      var n = st.flagged.length; if (!n) { say.say('Nothing is flagged: press “Find suspicious samples” first.'); return; }
      st.samples = st.samples.filter(function (d, i) { return st.flagged.indexOf(i) < 0; }); st.flagged = []; st.trained = false; st.testRes = null; refresh(); paintFlag();
      say.say('Removed <b>' + n + '</b> suspicious reading' + (n > 1 ? 's' : '') + '. Go to step 3 and train again: the boundaries should move back between the clusters.');
    }
    function paintFlag() { if (!flagInfo) return; flagInfo.textContent = st.flagged.length ? st.flagged.length + ' reading(s) flagged. Remove them, or keep them if you believe the labels.' : 'No readings flagged yet.'; if (st.rmBtn) st.rmBtn.disabled = !st.flagged.length; }
    function paintTrain() { if (!trainInfo) return; var n = st.samples.length; trainInfo.textContent = !n ? 'Record some data first (step 1).' : st.model.epochs ? 'Epochs so far: ' + st.model.epochs + ' · loss ' + st.model.losses[st.model.losses.length - 1].toFixed(3) + ' · accuracy on your own samples ' + Math.round(T.evaluate(st.model, st.samples.map(function (d) { return { v: d.v, t: d.t, y: d.y, truth: d.y }; })).accuracy * 100) + '%.' : 'Not trained yet.'; }
    async function trainRun(n) {
      if (!st.samples.length) { say.say('There is nothing to learn from yet — record some readings in step 1.'); return; }
      var g = run.start(), chunk = 5, done = 0; st.testRes = null;
      say.say('<b>Training…</b> each epoch the model looks at all ' + st.samples.length + ' samples and nudges its ' + T.paramCount() + ' numbers to be a little less wrong.');
      while (done < n) {
        var c = Math.min(chunk, n - done);
        st.model = T.train(st.samples, { epochs: c, init: st.model }); st.trained = true; done += c;
        drawHeat(); drawCard(); drawDots(); paintTrain();
        if (NA.dur(1) > 0 && done < n) { var ok = await run.sleep(g, NA.dur(40)); if (!ok) return; }
      }
      refresh();
      var acc = T.evaluate(st.model, st.samples.map(function (d) { return { v: d.v, t: d.t, y: d.y, truth: d.y }; })).accuracy;
      say.say('Trained for <b>' + st.model.epochs + '</b> epochs. It gets <b>' + Math.round(acc * 100) + '%</b> of <em>your</em> samples right. The model is just <b>' + T.paramCount() + ' numbers (' + T.modelBytes() + ' bytes)</b> — nothing else. Next: test it on readings it has not seen.');
    }
    function showPrediction() {
      if (!predBox) return; NA.clear(predBox);
      if (!st.trained) { predBox.appendChild(el('p', 'na-note', 'Train the model first (step 3).')); return; }
      var m = st.marker, p = T.predict(st.model, m);
      var head = el('div', 'na-iot-ph'); head.appendChild(el('b', null, 'Reading: ' + m.v.toFixed(1) + ' mm/s, ' + Math.round(m.t) + ' °C  →  '));
      var lab = el('b', 'na-iot-glyph k' + p.label, GLYPH[p.label] + ' ' + C[p.label].name + ' (' + Math.round(p.confidence * 100) + '% sure)'); head.appendChild(lab);
      predBox.appendChild(head);
      C.forEach(function (c, i) {
        var r = el('div', 'na-iot-prow'); r.appendChild(el('span', 'na-iot-pl', GLYPH[i] + ' ' + c.name));
        var tr = el('span', 'na-iot-ptrack'), f = el('span', 'na-iot-pfill k' + i); f.style.width = Math.round(p.probs[i] * 100) + '%'; tr.appendChild(f); r.appendChild(tr);
        r.appendChild(el('span', 'na-iot-pv', Math.round(p.probs[i] * 100) + '%')); predBox.appendChild(r);
      });
      var near = Infinity; st.samples.forEach(function (d) { var a = T.norm(d.v, d.t), b = T.norm(m.v, m.t), dd = Math.hypot(a[0] - b[0], a[1] - b[1]); if (dd < near) near = dd; });
      var msg;
      if (st.samples.length && near > 0.9) msg = '<span class="bad">This reading is far from every sample you recorded.</span> The model still answers' + (p.confidence > 0.8 ? ' — and with high confidence' : '') + ': it only knows the boundaries, not that it is out of its depth. It can be <em>confidently wrong</em> here.';
      else if (p.confidence < 0.6) msg = 'Low confidence: this reading sits between clusters, where the boundary runs. A real system might send such readings to a person.';
      else if (p.confidence < 0.85) msg = 'Fairly sure, but not certain: the reading is near a boundary, so a small change of sensor value could flip the answer.';
      else msg = 'High confidence: the reading sits inside a cluster the model has seen.';
      predBox.appendChild(el('p', 'na-iot-pmsg', null)).innerHTML = msg + (st.truthNote ? ' ' + st.truthNote : '');
    }
    var sensorN = 0;
    function sensorReading() {
      sensorN++; var cls = [0, 1, 2, 0, 2, 1, 0][sensorN % 7];
      var d = T.generate(cls, 1, 2000 + sensorN * 31, 1.3)[0]; st.marker = { v: d.v, t: d.t };
      st.truthNote = '<span class="na-iot-fine">(The simulated machine was really: <b>' + C[cls].name + '</b>' + (st.trained ? (T.predict(st.model, d).label === cls ? ' — the model got it right.' : ' — <span class="bad">the model got it wrong.</span>') : '.') + ')</span>';
      if (vSl) vSl.set(d.v); if (tSl) tSl.set(d.t); drawMarker(); showPrediction();
      say.say('The sensor board delivers a reading: <b>' + d.v.toFixed(1) + ' mm/s, ' + Math.round(d.t) + ' °C</b>. The model decides in microseconds, with no network involved.');
    }
    function syncMarker() { if (vSl) vSl.set(Math.round(st.marker.v * 10) / 10); if (tSl) tSl.set(Math.round(st.marker.t)); drawMarker(); showPrediction(); }
    async function runStream() {
      if (!st.trained) { say.say('Train the model first (step 3) — an untrained board decides nothing.'); return; }
      var data = T.testSet(200), g = run.start(); st.testRes = { data: [], res: T.evaluate(st.model, data) };
      st.testRes.data = data; var shown = st.testRes.res;
      say.say('<b>Streaming 200 hidden readings</b> past the model — on the real board, each one is decided on the spot, with no round trip to the cloud.');
      var n = 0; st.testRes.partial = 0;
      var full = st.testRes;
      st.testRes = { data: [], res: { results: [] } };
      while (n < data.length) {
        var c = Math.min(20, data.length - n); n += c;
        st.testRes = { data: data.slice(0, n), res: { results: full.res.results.slice(0, n) } }; drawDots();
        if (NA.dur(1) > 0 && n < data.length) { var ok = await run.sleep(g, NA.dur(70)); if (!ok) return; }
      }
      st.testRes = full; drawDots(); paintDeploy();
      say.say('Done: <b>' + Math.round(shown.accuracy * 100) + '%</b> right. Small dots are the readings, coloured by what the model <em>said</em>; a red ring means it was wrong. <b>' + shown.falseAlarms + '</b> false alarm' + (shown.falseAlarms === 1 ? '' : 's') + ' (healthy machine flagged) and <b>' + shown.missed + '</b> missed fault' + (shown.missed === 1 ? '' : 's') + ' (a broken machine called healthy) — the missed ones are the expensive mistakes.');
    }
    var curve = null;
    function learning() {
      curve = T.learningCurve({ noise: st.noise }); paintDeploy();
      say.say('Each point averages 6 fresh training runs with that many readings <em>per class</em>' + (st.noise ? ' (with ' + Math.round(st.noise * 100) + '% wrong labels)' : '') + '. Accuracy climbs fast and then flattens: more of the same data helps less and less — better <em>coverage</em> and cleaner labels help more.');
    }
    function paintDeploy() {
      if (!deployBox) return; NA.clear(deployBox);
      var ops = T.inferenceOps(), us = ops / 50;       // a small microcontroller at ~50 million operations per second
      var t = el('table', 'na-table na-iot-dtable'), th = el('tr'); ['', 'Your tiny edge model', 'A big cloud model (illustrative)'].forEach(function (h) { th.appendChild(el('th', null, h)); }); t.appendChild(th);
      [['Size of the model', T.paramCount() + ' numbers = ' + T.modelBytes() + ' bytes', 'tens of millions of numbers ≈ 100 MB'],
       ['Where it runs', 'on the sensor board', 'in a data centre, over the network'],
       ['Time to answer', '≈ ' + (us < 1 ? us.toFixed(1) : Math.round(us)) + ' µs (' + ops + ' operations at ~50 million per second)', '≈ 20 ms of GPU time + the WAN round trip'],
       ['Works offline', '✓ yes', '✗ only with a link'],
       ['What it can learn', 'two sensors, three classes', 'images, sound, language…']].forEach(function (r) { var tr = el('tr'); r.forEach(function (c, i) { tr.appendChild(el(i ? 'td' : 'th', null, c)); }); t.appendChild(tr); });
      deployBox.appendChild(el('div', 'na-tbl-scroll', t));
      deployBox.appendChild(el('p', 'na-note', 'Illustrative numbers: a small microcontroller is assumed at ~50 million operations per second; real boards (the NVIDIA module on slide 35, Google Coral on slide 36) are far faster and run far bigger models.'));
      if (st.testRes && st.testRes.res && st.testRes.res.accuracy != null) {
        var r = st.testRes.res, tiles = el('div', 'na-stats');
        var a = NA.stat('Accuracy'), b = NA.stat('False alarms'), c = NA.stat('Missed faults'), d = NA.stat('Wrong diagnosis');
        a.set(Math.round(r.accuracy * 100) + '%', r.n + ' hidden readings'); b.set(r.falseAlarms, 'of ' + r.healthy + ' healthy'); c.set(r.missed, 'of ' + r.faults + ' faulty'); d.set(r.wrongDiagnosis, 'fault named wrongly');
        a.node.className = 'na-stat ' + (r.accuracy >= 0.9 ? 'good' : r.accuracy >= 0.75 ? 'warn' : 'bad'); c.node.className = 'na-stat ' + (r.missed ? 'bad' : 'good');
        [a, b, c, d].forEach(function (x) { tiles.appendChild(x.node); }); deployBox.appendChild(tiles);
      }
      if (curve) {
        var cs = svg('svg', { viewBox: '0 0 360 164', role: 'img', class: 'na-iot-curve', 'aria-label': 'Accuracy on the hidden readings against samples per class: ' + curve.map(function (p) { return p.n + ' per class ' + Math.round(p.accuracy * 100) + '%'; }).join(', ') });
        var x0 = 40, x1 = 345, y0 = 124, y1 = 12; function cxp(i) { return x0 + i / (curve.length - 1) * (x1 - x0); } function cyp(a) { return y0 - (a - 0.3) / 0.7 * (y0 - y1); }
        [0.4, 0.6, 0.8, 1].forEach(function (a) { svg('line', { x1: x0, y1: cyp(a), x2: x1, y2: cyp(a), class: 'na-iot-grid' }, cs); svg('text', { x: x0 - 5, y: cyp(a) + 3, 'text-anchor': 'end', class: 'na-iot-axt' }, cs, Math.round(a * 100) + '%'); });
        svg('path', { d: curve.map(function (p, i) { return (i ? 'L' : 'M') + cxp(i) + ' ' + cyp(p.accuracy); }).join(' '), class: 'na-iot-cline' }, cs);
        curve.forEach(function (p, i) { svg('circle', { cx: cxp(i), cy: cyp(p.accuracy), r: 3.5, class: 'na-iot-cdot' }, cs); svg('text', { x: cxp(i), y: y0 + 13, 'text-anchor': 'middle', class: 'na-iot-axt' }, cs, p.n); });
        svg('text', { x: (x0 + x1) / 2, y: 160, 'text-anchor': 'middle', class: 'na-iot-axl' }, cs, 'samples recorded per class →');
        var cb = el('div', 'na-iot-curvebox'); cb.appendChild(el('div', 'na-lab', 'Accuracy on the hidden readings vs. amount of data')); cb.appendChild(cs); deployBox.appendChild(cb);
      }
    }
    /* --- side card + refresh --- */
    function drawCounts() {
      NA.clear(counts); var c = counts3();
      counts.appendChild(el('div', 'na-lab', 'Your data (' + st.samples.length + ' samples)'));
      C.forEach(function (k, i) {
        var r = el('div', 'na-iot-crow' + (c[i] < 5 ? ' low' : '')); r.appendChild(el('b', 'na-iot-glyph k' + i, GLYPH[i])); r.appendChild(el('span', 'na-iot-cn', k.name));
        var tr = el('span', 'na-iot-ctrack'), f = el('span', 'na-iot-cfill k' + i); f.style.width = Math.min(100, c[i] / 20 * 100) + '%'; tr.appendChild(f); r.appendChild(tr);
        r.appendChild(el('span', 'na-iot-cv', c[i] + (c[i] < 5 ? ' ⚠' : ''))); counts.appendChild(r);
      });
      if (st.samples.some(function (d) { return d.y !== d.truth; })) counts.appendChild(el('div', 'na-iot-lie', 'Some labels are wrong (the simulation knows which; you will have to find them).'));
    }
    function drawCard() {
      NA.clear(card);
      card.appendChild(el('div', 'na-lab', 'The model'));
      card.appendChild(el('div', 'na-iot-bytes', st.trained ? T.paramCount() + ' numbers · ' + T.modelBytes() + ' bytes' : 'not trained yet'));
      if (st.trained) {
        var t = el('table', 'na-table na-iot-w'), th = el('tr'); ['class', 'vib.', 'temp.', 'bias'].forEach(function (h) { th.appendChild(el('th', null, h)); }); t.appendChild(th);
        C.forEach(function (k, i) { var tr = el('tr'); tr.appendChild(el('td', 'na-iot-glyph k' + i, GLYPH[i] + ' ' + ['Healthy', 'Worn', 'Hot'][i])); st.model.W[i].forEach(function (w) { tr.appendChild(el('td', null, w.toFixed(1))); }); t.appendChild(tr); });
        card.appendChild(el('div', 'na-tbl-scroll', t));
        var L = st.model.losses, ls = svg('svg', { viewBox: '0 0 200 54', role: 'img', class: 'na-iot-loss', 'aria-label': 'Loss curve: starts at ' + L[0].toFixed(2) + ' and ends at ' + L[L.length - 1].toFixed(2) });
        var mx = Math.max.apply(null, L), n = L.length;
        svg('path', { d: L.map(function (v, i) { return (i ? 'L' : 'M') + (4 + i / Math.max(1, n - 1) * 192) + ' ' + (48 - v / mx * 42); }).join(' '), class: 'na-iot-lossline' }, ls);
        svg('text', { x: 4, y: 52, class: 'na-iot-axt' }, ls, 'loss over ' + n + ' epochs'); card.appendChild(ls);
      }
    }
    function refresh() { drawAxes(); drawHeat(); drawDots(); drawCounts(); drawCard(); paintFlag(); paintTrain(); if (st.tab === 3) showPrediction(); if (st.tab === 4) paintDeploy(); s.setAttribute('aria-label', 'Scatter plot of vibration against temperature with ' + st.samples.length + ' recorded samples' + (st.trained ? ' and the trained model’s decision regions' : '') + '.'); }
    [pre, cols2, tabHost, say.node].forEach(function (n) { host.appendChild(n); });
    host.appendChild(el('p', 'na-note', 'Simulation: the machine, its sensor readings and the three machine states are invented for this chapter; the classifier is a real (tiny) softmax regression trained in your browser. Compare with the slides’ own demo, Google Teachable Machine (slide 38), which does the same with images, sound or poses.'));
    refresh();
    say.say('Start with step 1: record readings of each machine state — or press a data preset above.');
    /* the heat map uses theme colours, so repaint when the theme changes */
    try { new MutationObserver(function () { drawHeat(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }); } catch (e) { /* ignore */ }
    try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { drawHeat(); }); } catch (e) { /* ignore */ }
  }
  NA.register('iot-train', { title: 'Teach a tiny model: train it, test it, put it on the sensor board', hint: 'Slides 37–38: train an AI model (Teachable Machine). A motor with a vibration and a temperature sensor — invented data, real training.', build: buildTrain });
})(typeof window !== 'undefined' ? window : globalThis);
