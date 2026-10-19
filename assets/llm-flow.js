/* LLM flow diagrams — shared by the Chapter 12 lab (assets/llm-lab.js) and the "Break the Bot" demo (assets/demo-injection-arena.js).
   Two SVG diagrams, both driven by event lists computed by the pure engines (never by a fake loop):
   - LLMFlow.pipeline(el): User -> App gateway (input filter) -> Prompt assembler (system + user + untrusted layers)
       -> Model (simulation) -> Tool layer (allow-list + human-confirmation gate) -> Output filter -> User, plus an Attacker node.
       Steps come from Injection.trace() (lab) or InjectionEngine.trace()/defenderTrace() (demo).
   - LLMFlow.genloop(el): context -> model -> probability bars -> sampled token -> text so far -> (loop) context.
       Stages come from NGram.trace() (lab panel A).
   Also: transport() = speed slider (6 levels incl. Instant, persisted) + Pause/Resume + Step, and the runner behind it.
   One colour per component (palette tokens --cmp-N from style.css, mapped in llm-flow.css): blocks, their defence chips, the arrows
   leaving them and the tokens travelling along those arrows share the colour of the SOURCE block; the three stacked prompt layers
   (system / user / untrusted) keep their own colours everywhere. Verdicts stay semantic (green good, red bad) via badge + glyph + text.
   Theme tokens only (llm-flow.css). prefers-reduced-motion: no moving tokens, highlight only. */
(function (global) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var SPEEDS = [
    { name: 'Very slow', ms: 2200 }, { name: 'Slow', ms: 1400 }, { name: 'Normal', ms: 800 },
    { name: 'Fast', ms: 400 }, { name: 'Very fast', ms: 150 }, { name: 'Instant', ms: 0 }
  ];
  var uidN = 0;
  function mk(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function html(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function reduced() { try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } }
  function clip(t, n) { t = String(t == null ? '' : t); return t.length > n ? t.slice(0, n - 1) + '…' : t; }

  /* ───────────── runner: plays a list of "units" (one per arrow) with pause / step / cancel ───────────── */
  function makeRunner(getMs) {
    var R = { active: false, paused: false, busy: false, permits: 0, gen: 0, wake: null, resolver: null, listeners: [], cancelHook: null, onIdleStep: null };
    function emit() { R.listeners.forEach(function (f) { try { f(R); } catch (e) {} }); }
    R.cancel = function () {
      if (!R.active) return;
      R.gen++; R.active = false; R.busy = false; R.paused = false; R.permits = 0;
      if (R.cancelHook) R.cancelHook();
      var w = R.wake; R.wake = null; if (w) w();
      var res = R.resolver; R.resolver = null;
      emit();
      if (res) res({ cancelled: true });
    };
    R.start = function (units, o) {
      o = o || {};
      R.cancel();
      var gen = ++R.gen, i = 0;
      R.active = true; R.busy = false; R.paused = !!o.stepMode; R.permits = o.stepMode ? 1 : 0;
      emit();
      return new Promise(function (done) {
        R.resolver = done;
        function end() {
          if (gen !== R.gen) return;
          R.active = false; R.busy = false; R.paused = false; R.permits = 0; R.wake = null; R.resolver = null;
          emit(); done({ cancelled: false });
        }
        function next() {
          if (gen !== R.gen) return;
          if (i >= units.length) { end(); return; }
          if (R.paused && R.permits <= 0) { R.busy = false; emit(); R.wake = function () { R.wake = null; next(); }; return; }
          if (R.paused) R.permits--;
          R.busy = true; emit();
          var p;
          try { p = units[i++](getMs()); } catch (e) { if (global.console) console.error(e); p = null; }
          Promise.resolve(p).then(function (v) {
            if (gen !== R.gen) return;
            R.busy = false;
            if (v === 'end') { end(); return; }
            var ms = getMs();
            if (!ms) next(); else setTimeout(next, Math.round(ms * 0.35));
          });
        }
        next();
      });
    };
    R.pause = function () { if (R.active) { R.paused = true; R.permits = 0; emit(); } };
    R.resume = function () { if (R.active) { R.paused = false; R.permits = 0; var w = R.wake; if (w) w(); emit(); } };
    R.toggle = function () { if (R.paused) R.resume(); else R.pause(); };
    R.step = function () {
      if (!R.active) { if (R.onIdleStep) R.onIdleStep(); return; }
      if (R.paused) { R.permits++; var w = R.wake; if (w) w(); }
      else { R.paused = true; R.permits = 0; }
      emit();
    };
    return R;
  }

  /* ───────────── transport: speed + pause + step ───────────── */
  function transport(opts) {
    opts = opts || {};
    var key = opts.key || 'co1005-llm-speed', idx = opts.initial === undefined ? 3 : opts.initial;
    try { var s = localStorage.getItem(key); if (typeof s === 'string' && /^[0-9]{1,2}$/.test(s) && +s < SPEEDS.length) idx = +s; } catch (e) {}
    var wrap = html('div', 'lf-transport'); wrap.setAttribute('role', 'group'); wrap.setAttribute('aria-label', 'Animation controls');
    var sp = html('div', 'lf-speed');
    var lab = html('label', 'field-label', 'Speed'), id = 'lf-speed-' + (++uidN); lab.setAttribute('for', id);
    var rng = html('input'); rng.type = 'range'; rng.id = id; rng.min = 0; rng.max = SPEEDS.length - 1; rng.step = 1; rng.value = idx;
    var nm = html('span', 'lf-speed-name');
    sp.appendChild(lab); sp.appendChild(rng); sp.appendChild(nm);
    function paint() { nm.textContent = SPEEDS[idx].name + (SPEEDS[idx].ms ? ' · ' + (SPEEDS[idx].ms / 1000) + ' s per arrow' : ' · no animation'); rng.setAttribute('aria-valuetext', SPEEDS[idx].name); }
    rng.addEventListener('input', function () { idx = +rng.value; paint(); try { localStorage.setItem(key, String(idx)); } catch (e) {} });
    paint();
    var runner = makeRunner(function () { return SPEEDS[idx].ms; });
    var pb = html('button', 'btn ghost small lf-btn', '⏸ Pause'); pb.type = 'button';
    var sb = html('button', 'btn ghost small lf-btn', '⏭ Step'); sb.type = 'button';
    pb.addEventListener('click', function () { runner.toggle(); });
    sb.addEventListener('click', function () { runner.step(); });
    function sync() {
      pb.disabled = !runner.active;
      pb.textContent = runner.active && runner.paused ? '▶ Resume' : '⏸ Pause';
      pb.setAttribute('aria-pressed', runner.active && runner.paused ? 'true' : 'false');
    }
    runner.listeners.push(sync); sync();
    wrap.appendChild(sp); wrap.appendChild(pb); wrap.appendChild(sb);
    return { el: wrap, runner: runner, ms: function () { return SPEEDS[idx].ms; }, index: function () { return idx; } };
  }

  /* ───────────── token flyer ───────────── */
  function makeFlyer(svg) {
    var tok = mk('g', { class: 'lf-token', visibility: 'hidden' }, svg);
    var rect = mk('rect', { rx: 9, height: 20, y: -10 }, tok), txt = mk('text', { 'text-anchor': 'middle', y: 4 }, tok);
    var raf = 0, timer = 0, pending = null;
    function hide() { tok.setAttribute('visibility', 'hidden'); }
    function settle() { var r = pending; pending = null; hide(); if (r) r(); }
    return {
      fly: function (path, text, ms, cls) {
        return new Promise(function (resolve) {
          pending = resolve;
          if (!path || ms <= 0) { settle(); return; }
          if (reduced()) { timer = setTimeout(settle, Math.min(ms, 300)); return; }
          text = clip(text, 20) || '·';
          txt.textContent = text;
          var w = Math.max(26, text.length * 7 + 14);
          rect.setAttribute('width', w); rect.setAttribute('x', -w / 2);
          tok.setAttribute('class', 'lf-token' + (cls ? ' ' + cls : ''));
          svg.appendChild(tok);
          tok.setAttribute('visibility', 'visible');
          var len = path.getTotalLength(), t0 = null;
          function frame(ts) {
            if (t0 === null) t0 = ts;
            var k = Math.min(1, (ts - t0) / ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
            var pt = path.getPointAtLength(len * e);
            tok.setAttribute('transform', 'translate(' + pt.x.toFixed(1) + ' ' + pt.y.toFixed(1) + ')');
            if (k < 1) raf = requestAnimationFrame(frame); else { raf = 0; settle(); }
          }
          raf = requestAnimationFrame(frame);
        });
      },
      cancel: function () { if (raf) cancelAnimationFrame(raf); raf = 0; if (timer) clearTimeout(timer); timer = 0; settle(); }
    };
  }

  /* one arrowhead per source block (so it carries that block's colour) + a hatch for "untrusted text merged into the instructions" */
  function defsFor(svg, id, ids) {
    var defs = mk('defs', {}, svg);
    ids.forEach(function (k) {
      var mr = mk('marker', { id: id + '-' + k, viewBox: '0 0 10 10', refX: '8', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse', class: 'lf-c-' + k }, defs);
      mk('path', { d: 'M 0 0 L 10 5 L 0 10 z', class: 'lf-head' }, mr);
    });
    var pat = mk('pattern', { id: id + '-mix', width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
    mk('rect', { width: 6, height: 6, class: 'lf-mix-a' }, pat); mk('rect', { width: 3, height: 6, class: 'lf-mix-b' }, pat);
  }
  var GLYPH = { pass: '✓', block: '⊘', slip: '▲', off: '–', info: '' };
  var WORD = { pass: 'passed', block: 'stopped', slip: 'slipped through', off: 'no defence here', info: 'ok' };
  function legendItem(cls, label) {
    var sp = html('span', cls), dot = html('i'); sp.appendChild(dot); sp.appendChild(document.createTextNode(label)); return sp;
  }

  /* ═══════════════════════════ pipeline diagram ═══════════════════════════ */
  var NODES = { // id: [x, y, w, h, title, sub]
    doc: [295, 4, 170, 34, 'Untrusted document', 'e-mail · web page · CV'],
    user: [10, 92, 100, 64, 'User', 'types a request'],
    gate: [140, 92, 120, 64, 'App gateway', ''],
    asm: [295, 62, 170, 124, 'Prompt assembler', ''],
    model: [500, 92, 120, 64, 'Model', '(simulation)'],
    tools: [652, 62, 124, 124, 'Tool layer', 'send_email, fetch'],
    outf: [295, 232, 170, 66, 'Output filter', ''],
    atk: [652, 232, 124, 66, 'Attacker', 'outside world']
  };
  var NAMES = { user: 'User', doc: 'Untrusted document', gate: 'App gateway', asm: 'Prompt assembler', model: 'Model', tools: 'Tool layer', outf: 'Output filter', atk: 'Attacker' };
  var CHIPS = { // id: [node, x, y, w, label, full name]
    gate: ['gate', 146, 134, 108, 'input filter', 'Input filter (keyword gateway)'],
    delim: ['asm', 301, 164, 82, 'delimiter', 'Delimiter: wrap untrusted text in tags and tell the model it is data'],
    strip: ['asm', 389, 164, 70, 'tag strip', 'Tag stripping: remove look-alike closing tags from the document'],
    polite: ['model', 503, 136, 54, 'polite', 'A polite “please do not reveal” rule in the system prompt'],
    hard: ['model', 560, 136, 56, 'hardened', 'Hardened rules in the system prompt'],
    priv: ['tools', 658, 139, 112, 'allow-list', 'Least privilege: allow-listed recipients / no tools for this task'],
    confirm: ['tools', 658, 161, 112, 'human OK gate', 'Human confirmation before a risky tool call runs'],
    outf: ['outf', 301, 276, 60, 'scanner', 'Output filter / scanner'],
    noimg: ['outf', 367, 276, 92, 'no ext. images', 'No outbound images or links in the reply']
  };
  var EDGES = {
    'user>gate': 'M 112 124 L 138 124', 'gate>asm': 'M 262 124 L 293 124', 'doc>asm': 'M 380 40 L 380 60',
    'asm>model': 'M 467 124 L 498 124', 'model>tools': 'M 622 124 L 650 124', 'tools>atk': 'M 714 188 L 714 230',
    'model>outf': 'M 530 158 L 530 205 L 400 205 L 400 230', 'outf>atk': 'M 467 265 L 650 265',
    'outf>user': 'M 293 265 L 60 265 L 60 158', 'gate>user': 'M 180 90 L 180 72 L 60 72 L 60 90'
  };
  var LAYERS = [['system', 'system prompt', 56], ['user', 'user message', 34], ['untrusted', 'untrusted document', 64]];
  var VERDICT_TXT = { pass: 'PASSED', block: 'STOPPED', slip: 'SLIPPED THROUGH', off: 'NO DEFENCE' };
  var ORDER = ['user', 'gate', 'asm', 'model', 'tools', 'outf', 'doc', 'atk'];

  function pipeline(container, opts) {
    opts = opts || {};
    var uid = 'lf-arr-' + (++uidN);
    var svg = mk('svg', { viewBox: '0 -14 780 322', class: 'lf-svg', role: 'img',
      'aria-label': 'Diagram of an LLM application: user, app gateway with input filter, prompt assembler stacking system prompt, user message and untrusted document, model, tool layer with allow-list and human confirmation, output filter, and an attacker outside the system.' });
    defsFor(svg, uid, ORDER);

    var edgeEls = {}, gE = mk('g', {}, svg);
    Object.keys(EDGES).forEach(function (k) {
      var from = k.split('>')[0];
      edgeEls[k] = mk('path', { d: EDGES[k], class: 'lf-edge lf-c-' + from + (k === 'outf>atk' || k === 'tools>atk' ? ' lf-edge-ext' : ''), 'marker-end': 'url(#' + uid + '-' + from + ')', 'data-edge': k }, gE);
    });

    var nodeEls = {}, badgeEls = {};
    function baseClass(id) { return 'lf-node lf-n-' + id + ' lf-c-' + id; }
    Object.keys(NODES).forEach(function (id) {
      var b = NODES[id];
      var g = mk('g', { class: baseClass(id), 'data-node': id }, svg);
      mk('rect', { x: b[0] - 4, y: b[1] - 4, width: b[2] + 8, height: b[3] + 8, rx: 12, class: 'lf-ring' }, g);
      mk('rect', { x: b[0], y: b[1], width: b[2], height: b[3], rx: 9, class: 'lf-box' }, g);
      var t = mk('text', { x: b[0] + b[2] / 2, y: b[1] + (id === 'doc' ? 15 : 16), class: 'lf-name', 'text-anchor': 'middle' }, g); t.textContent = b[4];
      if (b[5]) { var s = mk('text', { x: b[0] + b[2] / 2, y: b[1] + (id === 'doc' ? 28 : 30), class: 'lf-sub', 'text-anchor': 'middle' }, g); s.textContent = b[5]; }
      if (id === 'atk') { var s2 = mk('text', { x: b[0] + b[2] / 2, y: b[1] + 44, class: 'lf-sub', 'text-anchor': 'middle' }, g); s2.textContent = 'gets leaked data'; }
      nodeEls[id] = g;
    });

    // assembler layers + flat stream
    var A = NODES.asm, layerEls = {}, layerTxt = {}, segEls = {}, gA = nodeEls.asm;
    LAYERS.forEach(function (L, i) {
      var g = mk('g', { class: 'lf-layer lf-layer-' + L[0] + ' lf-L-' + L[0] }, gA);
      mk('rect', { x: A[0] + 8, y: A[1] + 21 + i * 19, width: A[2] - 16, height: 16, rx: 4 }, g);
      layerTxt[L[0]] = mk('text', { x: A[0] + 14, y: A[1] + 33 + i * 19, class: 'lf-layer-t' }, g); layerTxt[L[0]].textContent = L[1];
      layerEls[L[0]] = g;
    });
    var sx = A[0] + 8;
    LAYERS.forEach(function (L) {
      segEls[L[0]] = mk('rect', { x: sx, y: A[1] + 86, width: L[2], height: 12, class: 'lf-seg lf-seg-' + L[0] + ' lf-L-' + L[0] }, gA);
      sx += L[2];
    });
    var streamLbl = mk('text', { x: A[0] + A[2] - 8, y: A[1] + 83.5, class: 'lf-stream-t', 'text-anchor': 'end' }, gA); streamLbl.textContent = '';

    // defence chips
    var chipEls = {};
    Object.keys(CHIPS).forEach(function (id) {
      var c = CHIPS[id], g = mk('g', { class: 'lf-chip off lf-c-' + c[0], 'data-chip': id }, nodeEls[c[0]]);
      var ti = mk('title', {}, g); ti.textContent = c[5] + ' (off)';
      mk('rect', { x: c[1], y: c[2], width: c[3], height: 17, rx: 8.5 }, g);
      var tx = mk('text', { x: c[1] + c[3] / 2, y: c[2] + 12, 'text-anchor': 'middle' }, g); tx.textContent = '✗ ' + c[4];
      chipEls[id] = { g: g, tx: tx, ti: ti };
    });

    // verdict badges (drawn last so they sit on top of the boxes)
    Object.keys(NODES).forEach(function (id) {
      var b = NODES[id], g = mk('g', { class: 'lf-badge', visibility: 'hidden' }, svg);
      var r = mk('rect', { height: 15, rx: 7.5, y: b[1] - 14 }, g), t = mk('text', { 'text-anchor': 'middle', y: b[1] - 3.5 }, g);
      badgeEls[id] = { g: g, r: r, t: t, right: b[0] + b[2] - 4 };
    });

    var flyer = makeFlyer(svg);
    container.appendChild(svg);
    var narr = html('div', 'lf-narr'); narr.setAttribute('role', 'status'); narr.setAttribute('aria-live', 'polite');
    var narrH = html('b', 'lf-narr-h'), narrB = html('span', 'lf-narr-b');
    narr.appendChild(narrH); narr.appendChild(narrB);
    container.appendChild(narr);
    // legend: one swatch per block, the three prompt layers, then the verdict key (glyph + word, never colour alone)
    var legend = html('div', 'lf-legend');
    ORDER.forEach(function (id) { legend.appendChild(legendItem('lf-c-' + id, NAMES[id] + (id === 'model' ? ' (simulation)' : ''))); });
    var lsep = html('span', 'lf-legend-sep', 'prompt text:'); legend.appendChild(lsep);
    LAYERS.forEach(function (L) { legend.appendChild(legendItem('lf-L-' + L[0], L[1] === 'untrusted document' ? 'untrusted text' : L[1])); });
    container.appendChild(legend);
    var vkey = html('div', 'lf-vkey'); vkey.setAttribute('aria-label', 'Meaning of the verdict badges and chips');
    [['lf-k-good', '✓ passed'], ['lf-k-good', '⊘ stopped by a defence'], ['lf-k-bad', '▲ slipped through / leaked'], ['lf-k-neutral', '– no defence here'], ['lf-k-chip', '✓ defence on'], ['lf-k-chip lf-k-chipoff', '✗ defence off']]
      .forEach(function (k) { vkey.appendChild(html('span', 'lf-key ' + k[0], k[1])); });
    container.appendChild(vkey);

    var marked = [], activeEdge = null, pendingResolve = null;
    function idle(text) { narr.className = 'lf-narr'; narrH.textContent = ''; narrB.textContent = text || opts.idleText || 'Press the button to send a request through the system and watch it travel block by block.'; }
    idle();

    function setChips(map) {
      Object.keys(chipEls).forEach(function (id) {
        var on = !!(map && map[id]), c = chipEls[id];
        c.g.setAttribute('class', 'lf-chip lf-c-' + CHIPS[id][0] + ' ' + (on ? 'on' : 'off'));
        c.tx.textContent = (on ? '✓ ' : '✗ ') + CHIPS[id][4];
        c.ti.textContent = CHIPS[id][5] + (on ? ' (on)' : ' (off)');
      });
    }
    function clearMarks() {
      marked.forEach(function (n) { n.classList.remove('lf-src', 'lf-dst'); });
      marked = [];
      if (activeEdge) { activeEdge.classList.remove('on'); activeEdge = null; }
    }
    function reset() {
      cancelHook();
      clearMarks();
      Object.keys(nodeEls).forEach(function (id) { nodeEls[id].setAttribute('class', baseClass(id)); badgeEls[id].g.setAttribute('visibility', 'hidden'); });
      Object.keys(chipEls).forEach(function (id) { chipEls[id].g.classList.remove('hit', 'slipped'); });
      LAYERS.forEach(function (L) {
        layerEls[L[0]].setAttribute('class', 'lf-layer lf-layer-' + L[0] + ' lf-L-' + L[0]); segEls[L[0]].setAttribute('class', 'lf-seg lf-seg-' + L[0] + ' lf-L-' + L[0]);
        segEls[L[0]].removeAttribute('style'); layerTxt[L[0]].textContent = L[1];
      });
      streamLbl.textContent = '';
      idle();
    }
    function cancel() { flyer.cancel(); clearMarks(); }

    function badge(id, verdict, text) {
      var bd = badgeEls[id];
      if (!text || verdict === 'info') { bd.g.setAttribute('visibility', 'hidden'); return; }
      bd.t.textContent = text;
      var w = text.length * 6.4 + 14;
      bd.r.setAttribute('width', w); bd.r.setAttribute('x', bd.right - w);
      bd.t.setAttribute('x', bd.right - w / 2);
      bd.g.setAttribute('class', 'lf-badge lf-b-' + verdict);
      bd.g.setAttribute('visibility', 'visible');
    }
    function land(step) {
      var to = step.to, node = nodeEls[to], v = step.verdict || 'info';
      if (node) {
        node.classList.remove('lf-v-pass', 'lf-v-block', 'lf-v-slip', 'lf-v-off', 'lf-v-info');
        node.classList.add('lf-v-' + v);
        var label = VERDICT_TXT[v];
        if (to === 'atk' && v === 'slip') label = 'DATA RECEIVED';
        if (to === 'tools' && v === 'block') label = step.chip === 'confirm' ? 'NEEDS A HUMAN' : 'LEAST PRIVILEGE';
        if (to === 'user' && v === 'slip') label = 'TRICKED / LEAKED';
        if (to === 'user' && v === 'pass') label = 'SAFE ANSWER';
        if (to === 'asm' && v === 'off') label = 'NO FENCE';
        badge(to, v, label ? GLYPH[v] + ' ' + label : '');
      }
      (step.layers || []).forEach(function (l) {
        if (!layerEls[l]) return;
        layerEls[l].classList.add('filled'); segEls[l].classList.add('filled');
        if (l === 'untrusted') streamLbl.textContent = '';
      });
      if (step.merge) {
        layerEls.untrusted.classList.add('merged'); segEls.untrusted.classList.add('merged'); nodeEls.asm.classList.add('lf-merging');
        segEls.untrusted.setAttribute('style', 'fill:url(#' + uid + '-mix)');
        layerTxt.untrusted.textContent = 'untrusted → instructions';
        streamLbl.textContent = 'one flat stream';
      } else if (step.layers && step.layers.indexOf('untrusted') >= 0 && v === 'pass') {
        layerTxt.untrusted.textContent = 'untrusted (fenced as data)';
      }
      if (step.chip && chipEls[step.chip] && (v === 'block' || v === 'slip')) chipEls[step.chip].g.classList.add(v === 'block' ? 'hit' : 'slipped');
    }
    function stepUnit(step, idx, total) {
      return function (ms) {
        return new Promise(function (resolve) {
          clearMarks();
          pendingResolve = resolve;
          var key = step.from + '>' + step.to, path = edgeEls[key];
          var head = 'Step ' + (idx + 1) + ' of ' + total + ' · ' + NAMES[step.from] + ' → ' + NAMES[step.to];
          function finish() {
            pendingResolve = null;
            land(step);
            narr.className = 'lf-narr lf-c-' + step.to;
            narrH.textContent = head + ' · ' + (GLYPH[step.verdict] ? GLYPH[step.verdict] + ' ' : '') + (WORD[step.verdict || 'info']);
            narrB.textContent = step.note || '';
            if (opts.onLand) opts.onLand(step, idx);
            resolve();
          }
          if (nodeEls[step.from]) { nodeEls[step.from].classList.add('lf-src'); marked.push(nodeEls[step.from]); }
          if (nodeEls[step.to]) { nodeEls[step.to].classList.add('lf-dst'); marked.push(nodeEls[step.to]); }
          if (ms <= 0) { finish(); return; }
          narr.className = 'lf-narr lf-c-' + step.from;
          narrH.textContent = head;
          narrB.textContent = 'Sending “' + clip(step.text, 40) + '” …';
          if (path) { path.classList.add('on'); activeEdge = path; }
          flyer.fly(path, step.text, ms, 'lf-c-' + step.from).then(function () {
            if (pendingResolve !== resolve) return; // cancelled meanwhile
            if (activeEdge) { activeEdge.classList.remove('on'); activeEdge = null; }
            finish();
          });
        });
      };
    }
    /* steps -> units for the runner. Call reset() first. */
    function unitsFor(steps) { return steps.map(function (s, i) { return stepUnit(s, i, steps.length); }); }
    function cancelHook() { var r = pendingResolve; pendingResolve = null; flyer.cancel(); clearMarks(); if (r) r(); }
    /* show the end state of a whole run at once (used when a run is interrupted, or in instant mode) */
    function showAll(steps) { reset(); steps.forEach(function (s) { clearMarks(); land(s); }); var last = steps[steps.length - 1]; if (last) { narr.className = 'lf-narr lf-c-' + last.to; narrH.textContent = 'Result'; narrB.textContent = last.note || ''; } }

    return { svg: svg, narr: narr, setChips: setChips, reset: reset, cancel: cancelHook, unitsFor: unitsFor, showAll: showAll, idle: idle, NAMES: NAMES };
  }

  /* ═══════════════════════════ generation loop diagram ═══════════════════════════ */
  var GN = { // id: [x, y, w, h, title, sub]
    ctx: [10, 36, 196, 100, 'Context', 'what the model looks at'],
    model: [244, 56, 118, 64, 'Model', 'count lookup'],
    probs: [400, 4, 210, 184, 'Probabilities', 'next-token candidates'],
    sample: [648, 48, 122, 80, 'Sample', 'seeded random pick'],
    text: [10, 206, 760, 54, 'Text so far', '']
  };
  var GEDGES = {
    'ctx>model': 'M 208 88 L 242 88', 'model>probs': 'M 364 88 L 398 88', 'probs>sample': 'M 612 88 L 646 88',
    'sample>text': 'M 709 130 L 709 204', 'text>ctx': 'M 58 204 L 58 138'
  };
  var GNAMES = { ctx: 'Context', model: 'Model', probs: 'Probabilities', sample: 'Sample', text: 'Text so far' };
  var GORDER = ['ctx', 'model', 'probs', 'sample', 'text'];

  function genloop(container, opts) {
    opts = opts || {};
    var uid = 'lf-arr-' + (++uidN);
    var svg = mk('svg', { viewBox: '0 0 780 268', class: 'lf-svg lf-gen', role: 'img',
      'aria-label': 'The generation loop: context goes into the model, which produces a probability for each next token; one token is sampled, appended to the text, and the longer text becomes the new context.' });
    defsFor(svg, uid, GORDER);
    var edgeEls = {}, gE = mk('g', {}, svg);
    Object.keys(GEDGES).forEach(function (k) {
      var from = k.split('>')[0];
      edgeEls[k] = mk('path', { d: GEDGES[k], class: 'lf-edge lf-c-' + from, 'marker-end': 'url(#' + uid + '-' + from + ')' }, gE);
    });
    var loopLbl = mk('text', { x: 66, y: 178, class: 'lf-looplbl' }, svg); loopLbl.textContent = 'append & repeat';
    var nodeEls = {};
    Object.keys(GN).forEach(function (id) {
      var b = GN[id], g = mk('g', { class: 'lf-node lf-n-' + id + ' lf-c-' + id }, svg);
      mk('rect', { x: b[0], y: b[1], width: b[2], height: b[3], rx: 9, class: 'lf-box' }, g);
      var t = mk('text', { x: b[0] + (id === 'text' ? 12 : b[2] / 2), y: b[1] + 16, class: 'lf-name', 'text-anchor': id === 'text' ? 'start' : 'middle' }, g); t.textContent = b[4];
      if (b[5]) { var s = mk('text', { x: b[0] + b[2] / 2, y: b[1] + 29, class: 'lf-sub', 'text-anchor': 'middle' }, g); s.textContent = b[5]; }
      nodeEls[id] = g;
    });
    var gCtx = mk('g', { class: 'lf-ctxchips' }, nodeEls.ctx);
    var ctxNote = mk('text', { x: GN.ctx[0] + GN.ctx[2] / 2, y: GN.ctx[1] + GN.ctx[3] - 8, class: 'lf-sub', 'text-anchor': 'middle' }, nodeEls.ctx);
    var modelVal = mk('text', { x: GN.model[0] + GN.model[2] / 2, y: GN.model[1] + 50, class: 'lf-val', 'text-anchor': 'middle' }, nodeEls.model);
    // probability rows
    var rowsEls = [], P = GN.probs;
    for (var i = 0; i < 5; i++) {
      var ry = P[1] + 40 + i * 25, g = mk('g', { class: 'lf-prow', visibility: 'hidden' }, nodeEls.probs);
      var lab = mk('text', { x: P[0] + 10, y: ry + 12, class: 'lf-plabel' }, g);
      mk('rect', { x: P[0] + 84, y: ry, width: 84, height: 16, rx: 3, class: 'lf-pbg' }, g);
      var raw = mk('rect', { x: P[0] + 84, y: ry, width: 0, height: 16, rx: 3, class: 'lf-praw' }, g);
      var adj = mk('rect', { x: P[0] + 84, y: ry + 4, width: 0, height: 8, rx: 2, class: 'lf-padj' }, g);
      var pct = mk('text', { x: P[0] + 174, y: ry + 12, class: 'lf-ppct' }, g);
      rowsEls.push({ g: g, lab: lab, raw: raw, adj: adj, pct: pct });
    }
    var more = mk('text', { x: P[0] + P[2] / 2, y: P[1] + P[3] - 8, class: 'lf-sub', 'text-anchor': 'middle' }, nodeEls.probs);
    var sampTok = mk('text', { x: GN.sample[0] + GN.sample[2] / 2, y: GN.sample[1] + 54, class: 'lf-big', 'text-anchor': 'middle' }, nodeEls.sample);
    var sampU = mk('text', { x: GN.sample[0] + GN.sample[2] / 2, y: GN.sample[1] + 70, class: 'lf-sub', 'text-anchor': 'middle' }, nodeEls.sample);
    var textVal = mk('text', { x: GN.text[0] + 12, y: GN.text[1] + 40, class: 'lf-textval' }, nodeEls.text);
    var tsBase = mk('tspan', {}, textVal), tsLast = mk('tspan', { class: 'lf-textlast' }, textVal); // the token that was just appended is highlighted

    var flyer = makeFlyer(svg);
    container.appendChild(svg);
    var narr = html('div', 'lf-narr'); narr.setAttribute('role', 'status'); narr.setAttribute('aria-live', 'polite');
    var narrH = html('b', 'lf-narr-h'), narrB = html('span', 'lf-narr-b');
    narr.appendChild(narrH); narr.appendChild(narrB);
    container.appendChild(narr);
    var legend = html('div', 'lf-legend');
    GORDER.forEach(function (id) { legend.appendChild(legendItem('lf-c-' + id, id === 'sample' ? 'Sampled token' : GNAMES[id])); });
    legend.appendChild(html('span', 'lf-legend-sep', 'bars: wide = share of counts, narrow = after temperature & top-k'));
    container.appendChild(legend);

    var marked = [], activeEdge = null, pendingResolve = null, cur = null;
    function clearMarks() {
      marked.forEach(function (n) { n.classList.remove('lf-src', 'lf-dst'); }); marked = [];
      if (activeEdge) { activeEdge.classList.remove('on'); activeEdge = null; }
    }
    function setContext(tokens, note) {
      while (gCtx.firstChild) gCtx.removeChild(gCtx.firstChild);
      var toks = tokens.slice(-4), x0 = GN.ctx[0] + 12, x = x0, y = GN.ctx[1] + 62, maxX = GN.ctx[0] + GN.ctx[2] - 12;
      if (tokens.length > 4) toks[0] = '… ' + toks[0];
      toks.forEach(function (t) {
        var w = Math.max(26, t.length * 7.4 + 14);
        if (x + w > maxX && x > x0) { x = x0; y += 26; }
        var g = mk('g', {}, gCtx);
        mk('rect', { x: x, y: y - 14, width: w, height: 20, rx: 10, class: 'lf-pill' }, g);
        var tx = mk('text', { x: x + w / 2, y: y, 'text-anchor': 'middle', class: 'lf-pill-t' }, g); tx.textContent = t;
        x += w + 6;
      });
      ctxNote.textContent = note || (tokens.length ? '' : '(empty context)');
    }
    function setBars(tr) {
      var mx = 0.0001;
      if (tr) tr.rows.forEach(function (d) { mx = Math.max(mx, d.p, d.adj); });
      rowsEls.forEach(function (r, i) {
        var d = tr && tr.rows[i];
        if (!d) { r.g.setAttribute('visibility', 'hidden'); return; }
        r.g.setAttribute('visibility', 'visible');
        r.g.setAttribute('class', 'lf-prow' + (d.kept ? '' : ' dropped'));
        r.lab.textContent = clip(d.tok === '</s>' ? '[end]' : d.tok, 9);
        r.raw.setAttribute('width', (d.p / mx * 84).toFixed(1)); // bars are scaled to the biggest candidate; the % label is the true value
        r.adj.setAttribute('width', (d.adj / mx * 84).toFixed(1));
        r.pct.textContent = d.kept ? Math.round(d.adj * 100) + '%' : 'out';
      });
      more.textContent = tr && tr.hidden ? '+ ' + tr.hidden + ' rarer candidates' : '';
    }
    function pickRow(tr) {
      rowsEls.forEach(function (r, i) { var d = tr && tr.rows[i]; r.g.classList.toggle('chosen', !!(d && d.chosen)); });
    }
    function setSample(tr) {
      sampTok.textContent = tr ? clip(tr.ended ? '[end]' : tr.chosen, 11) : '';
      sampU.textContent = tr ? 'u = ' + tr.u.toFixed(3) : '';
    }
    function setText(str, last) {
      var s = String(str || ''), pre = '';
      if (s.length > 86) { s = s.slice(-85); pre = '…'; }
      var l = last && s.length >= last.length && s.slice(-last.length) === last ? last : '';
      tsBase.textContent = pre + s.slice(0, s.length - l.length);
      tsLast.textContent = l;
    }
    function reset(ctxTokens, text, order) {
      cancelHook(); clearMarks(); cur = null;
      Object.keys(nodeEls).forEach(function (id) { nodeEls[id].setAttribute('class', 'lf-node lf-n-' + id + ' lf-c-' + id); });
      setContext(ctxTokens || [], (ctxTokens || []).length ? '' : '(no context: unigram)');
      setBars(null); pickRow(null); setSample(null); setText(text);
      modelVal.textContent = order ? (order === 1 ? 'unigram' : order === 2 ? 'bigram' : 'trigram') : '';
      narr.className = 'lf-narr'; narrH.textContent = ''; narrB.textContent = 'Press “Next token” to run the loop once, or “Generate to the end”.';
    }
    function cancel() { flyer.cancel(); clearMarks(); }
    function cancelHook() { var r = pendingResolve; pendingResolve = null; flyer.cancel(); clearMarks(); if (r) r(); }

    /* one stage of the loop = one arrow. `apply` runs when the token has landed. */
    function stage(n, st, ms, apply, total) {
      return new Promise(function (resolve) {
        clearMarks(); pendingResolve = resolve;
        var key = st.from + '>' + st.to, path = edgeEls[key];
        var head = 'Token ' + (cur ? cur.index : 1) + ' · stage ' + (n + 1) + ' of ' + (total || 5) + ' · ' + GNAMES[st.from] + ' → ' + GNAMES[st.to];
        function finish() {
          pendingResolve = null; apply();
          narr.className = 'lf-narr lf-c-' + st.to;
          narrH.textContent = head; narrB.textContent = st.note;
          resolve();
        }
        nodeEls[st.from].classList.add('lf-src'); nodeEls[st.to].classList.add('lf-dst'); marked.push(nodeEls[st.from], nodeEls[st.to]);
        if (ms <= 0) { finish(); return; }
        narr.className = 'lf-narr lf-c-' + st.from;
        narrH.textContent = head; narrB.textContent = '…';
        if (path) { path.classList.add('on'); activeEdge = path; }
        flyer.fly(path, st.text, ms, 'lf-c-' + st.from).then(function () {
          if (pendingResolve !== resolve) return;
          if (activeEdge) { activeEdge.classList.remove('on'); activeEdge = null; }
          finish();
        });
      });
    }
    var counter = 0;
    /* h = { begin() -> trace|null (performs the engine step), text(tr) -> string after the append, onDistribution(tr), onAppend(tr), onLoop(tr) }
       returns 5 units (one per arrow); the first one returns 'end' when there is nothing left to generate. */
    function tokenUnits(h) {
      var tr = null, idx = 0;
      return [
        function (ms) {
          tr = h.begin();
          if (!tr) { narrH.textContent = ''; narrB.textContent = 'Generation has already finished. Press Reset to start again.'; return 'end'; }
          idx = ++counter; cur = { index: idx };
          setBars(null); pickRow(null); setSample(null);
          setContext(tr.context, tr.context.length ? '' : '(no context: unigram)');
          return stage(0, tr.stages[0], ms, function () {});
        },
        function (ms) { return stage(1, tr.stages[1], ms, function () { setBars(tr); if (h.onDistribution) h.onDistribution(tr); }); },
        function (ms) { return stage(2, tr.stages[2], ms, function () { pickRow(tr); setSample(tr); }); },
        function (ms) { return stage(3, tr.stages[3], ms, function () { setText(h.text(tr), tr.ended ? '' : tr.chosen); if (h.onAppend) h.onAppend(tr); }); },
        function (ms) {
          if (tr.done || tr.ended) {
            clearMarks(); narr.className = 'lf-narr lf-c-text'; narrH.textContent = 'Token ' + idx + ' · finished'; narrB.textContent = tr.stages[4].note;
            if (h.onLoop) h.onLoop(tr);
            return 'end';
          }
          return stage(4, tr.stages[4], ms, function () { setContext(tr.contextAfter, ''); if (h.onLoop) h.onLoop(tr); });
        }
      ];
    }
    function resetCounter() { counter = 0; }
    return { svg: svg, narr: narr, reset: reset, setText: setText, setContext: setContext, tokenUnits: tokenUnits, cancel: cancelHook, resetCounter: resetCounter };
  }

  var api = { pipeline: pipeline, genloop: genloop, transport: transport, makeRunner: makeRunner, SPEEDS: SPEEDS, NODES: NODES, CHIPS: CHIPS, EDGES: EDGES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.LLMFlow = api;
})(typeof window !== 'undefined' ? window : this);
