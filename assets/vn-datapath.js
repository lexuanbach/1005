/* Von Neumann data-path diagram — shared by the Chapter 7 lab and the "Program the CPU" demo.
   An SVG block diagram (CPU registers, ALU, decoder, memory, input/output) with arrows. When the engine
   (assets/vn-machine.js) performs a micro-step, animate(m.flow, state, ms) sends a labelled value along the
   arrow(s) of that step, so students see the signal travel from component to component.
   Also exports the speed table and a ready-made speed slider. Theme tokens only (see vn-machine.css). */
(function (global) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';

  var SPEEDS = [
    { name: 'Very slow', ms: 2200 },
    { name: 'Slow', ms: 1400 },
    { name: 'Normal', ms: 800 },
    { name: 'Fast', ms: 400 },
    { name: 'Very fast', ms: 150 },
    { name: 'Instant', ms: 0 }
  ];

  // node id -> [x, y, w, h, title]
  var NODES = {
    PC: [230, 30, 110, 48, 'PC · program counter'],
    MAR: [430, 30, 110, 48, 'MAR · address reg.'],
    DEC: [30, 150, 110, 48, 'Instruction decoder'],
    IR: [230, 150, 110, 48, 'IR · instruction reg.'],
    MDR: [430, 150, 110, 48, 'MDR · data reg.'],
    FLAGS: [30, 270, 110, 48, 'Condition codes'],
    R: [230, 270, 110, 48, 'R · accumulator'],
    ALU: [430, 270, 110, 48, 'ALU'],
    MEM: [610, 30, 150, 260, 'Memory'],
    IN: [610, 340, 150, 44, 'Input device'],
    OUT: [610, 400, 150, 44, 'Output device']
  };
  // explicit paths (everything else is a straight line between the two boxes)
  var CUSTOM = {
    'PC>PC': 'M 262 30 C 262 -6, 308 -6, 308 30',
    'MAR>MEM': 'M 540 46 L 610 46',
    'MEM>MDR': 'M 610 182 L 540 182',
    'MDR>MEM': 'M 540 166 L 610 166',
    'ALU>FLAGS': 'M 485 318 L 485 352 L 85 352 L 85 318',
    'IN>MDR': 'M 610 362 L 576 362 L 576 190 L 540 190',
    'MDR>OUT': 'M 540 196 L 592 196 L 592 422 L 610 422',
    // extended instruction set: the immediate value travels from IR down and across to the ALU without crossing a box
    'IR>ALU': 'M 320 198 L 320 232 L 462 232 L 462 268'
  };
  var EDGES = ['PC>MAR', 'PC>PC', 'IR>PC', 'IR>MAR', 'IR>DEC', 'MAR>MEM', 'MEM>MDR', 'MDR>MEM', 'MDR>IR', 'MDR>R', 'R>MDR',
    'MDR>ALU', 'ALU>MDR', 'R>ALU', 'ALU>R', 'ALU>FLAGS', 'IN>MDR', 'MDR>OUT',
    'IR>ALU', 'MDR>MAR'];       // the last two are used only by the extended instruction set (LOADI.. / LOADP, STOREP)
  // These two arrows do not exist on slide 34: they are drawn (display:none otherwise) only for a machine with the extended
  // instruction set (state.opBits === 5), or when a flow handed to animate() really uses one of them.
  var EXT_EDGES = ['IR>ALU', 'MDR>MAR'];

  function mk(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function center(id) { var b = NODES[id]; return [b[0] + b[2] / 2, b[1] + b[3] / 2]; }

  // where the ray from the centre of box `id`, in direction (dx,dy) (unit), leaves the box (+ margin)
  function exitPoint(id, p, dx, dy, margin) {
    var b = NODES[id], t = Infinity, hw = b[2] / 2 + margin, hh = b[3] / 2 + margin, c = center(id);
    var ox = p[0] - c[0], oy = p[1] - c[1];
    if (dx > 1e-9) t = Math.min(t, (hw - ox) / dx); else if (dx < -1e-9) t = Math.min(t, (-hw - ox) / dx);
    if (dy > 1e-9) t = Math.min(t, (hh - oy) / dy); else if (dy < -1e-9) t = Math.min(t, (-hh - oy) / dy);
    return [p[0] + dx * t, p[1] + dy * t];
  }
  function straightPath(a, b, paired) {
    var ca = center(a), cb = center(b), dx = cb[0] - ca[0], dy = cb[1] - ca[1], len = Math.sqrt(dx * dx + dy * dy);
    dx /= len; dy /= len;
    var nx = -dy, ny = dx, o = paired ? 7 : 0;
    var p1 = [ca[0] + nx * o, ca[1] + ny * o], p2 = [cb[0] + nx * o, cb[1] + ny * o];
    var s = exitPoint(a, p1, dx, dy, 2), e = exitPoint(b, p2, -dx, -dy, 3);
    return 'M ' + s[0].toFixed(1) + ' ' + s[1].toFixed(1) + ' L ' + e[0].toFixed(1) + ' ' + e[1].toFixed(1);
  }

  function reduced() { try { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }

  // value shown on the travelling token (state is AFTER the micro-step)
  function tokenText(src, dst, st) {
    function f(n) { return n === undefined || n === null ? '' : String(n); }
    if (dst === 'DEC') return st.cur ? st.cur.op.name : '';
    if (dst === 'FLAGS') return 'GT' + st.gt + ' EQ' + st.eq + ' LT' + st.lt;
    if (dst === 'OUT') return f(st.out.length ? st.out[st.out.length - 1] : '');
    if (src === 'MAR' && dst === 'MEM') return 'addr ' + st.mar;
    if (dst === 'MEM') return f(st.mdr);
    if (src === 'IR' && dst === 'ALU') return st.cur ? f(st.cur.addr) : '';      // an immediate value (extended set)
    if (dst === 'ALU') return f(src === 'R' ? st.r : st.mdr);
    switch (dst) {
      case 'PC': return f(st.pc); case 'IR': return f(st.ir); case 'MAR': return f(st.mar);
      case 'MDR': return f(st.mdr); case 'R': return f(st.r);
    }
    return '';
  }

  function nodeValue(id, st) {
    switch (id) {
      case 'PC': return String(st.pc);
      case 'IR': return st.ir + '  ' + (global.VNMachine ? global.VNMachine.disasm(st.ir, st.addrBits, st.opBits, st.wrap) : '');
      case 'MAR': return String(st.mar);
      case 'MDR': return String(st.mdr);
      case 'R': return String(st.r);
      case 'DEC': return st.cur ? st.cur.op.name + (st.cur.op.arg ? ' ' + st.cur.addr : '') : '—';
      case 'FLAGS': return 'GT=' + st.gt + ' EQ=' + st.eq + ' LT=' + st.lt;
      case 'ALU': return st.opBits === 5 ? '+  −  ×  ÷  mod' : '+  −  compare';
      case 'MEM': return 'mem[' + st.mar + '] = ' + st.mem[st.mar];
      case 'IN': return st.inPos < st.input.length ? 'next: ' + st.input[st.inPos] : 'queue empty';
      case 'OUT': return st.out.length ? 'last: ' + st.out[st.out.length - 1] : '—';
    }
    return '';
  }

  /* container: element to fill. Returns { setValues(st), animate(flow, st, ms) -> Promise, clear(), cancel() } */
  function create(container) {
    var svg = mk('svg', { viewBox: '0 0 780 456', class: 'vn-dp', role: 'img',
      'aria-label': 'Block diagram of the Von Neumann machine: CPU registers, ALU, decoder, memory, input and output, joined by arrows' });
    var defs = mk('defs', {}, svg);
    var mkr = mk('marker', { id: 'vn-arrow', viewBox: '0 0 10 10', refX: '8', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' }, defs);
    mk('path', { d: 'M 0 0 L 10 5 L 0 10 z', class: 'vn-dp-head' }, mkr);
    var mkrOn = mk('marker', { id: 'vn-arrow-on', viewBox: '0 0 10 10', refX: '8', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' }, defs);
    mk('path', { d: 'M 0 0 L 10 5 L 0 10 z', class: 'vn-dp-head on' }, mkrOn);

    var frame = mk('rect', { x: 14, y: 12, width: 566, height: 426, rx: 14, class: 'vn-dp-frame' }, svg);
    var frameT = mk('text', { x: 24, y: 432, class: 'vn-dp-frametitle' }, svg); frameT.textContent = 'CPU';
    var ctrl = mk('rect', { x: 20, y: 138, width: 330, height: 72, rx: 10, class: 'vn-dp-ctrl' }, svg);
    var ctrlT = mk('text', { x: 28, y: 222, class: 'vn-dp-ctrltitle' }, svg); ctrlT.textContent = 'control unit';

    var edgeEls = {}, paired = {};
    EDGES.forEach(function (e) { var p = e.split('>'); if (EDGES.indexOf(p[1] + '>' + p[0]) >= 0) paired[e] = true; });
    var gEdges = mk('g', { class: 'vn-dp-edges' }, svg);
    EDGES.forEach(function (e) {
      var p = e.split('>');
      var d = CUSTOM[e] || straightPath(p[0], p[1], !!paired[e]);
      var isExt = EXT_EDGES.indexOf(e) >= 0;
      edgeEls[e] = mk('path', { d: d, class: 'vn-dp-edge vn-dp-c-' + p[0] + (isExt ? ' vn-dp-ext' : ''), 'marker-end': 'url(#vn-arrow)', 'data-edge': e }, gEdges);
      if (isExt) edgeEls[e].style.display = 'none';          // lecture machine: no immediate / pointer path
    });

    var nodeEls = {}, valEls = {};
    Object.keys(NODES).forEach(function (id) {
      var b = NODES[id];
      var g = mk('g', { class: 'vn-dp-node vn-dp-n-' + id + ' vn-dp-c-' + id, 'data-node': id }, svg);
      mk('rect', { x: b[0], y: b[1], width: b[2], height: b[3], rx: 9 }, g);
      var t = mk('text', { x: b[0] + b[2] / 2, y: b[1] + 15, class: 'vn-dp-name', 'text-anchor': 'middle' }, g); t.textContent = b[4];
      var vy = id === 'MEM' ? b[1] + 52 : b[1] + b[3] - 12;
      valEls[id] = mk('text', { x: b[0] + b[2] / 2, y: vy, class: 'vn-dp-val', 'text-anchor': 'middle' }, g);
      nodeEls[id] = g;
    });

    var token = mk('g', { class: 'vn-dp-token', visibility: 'hidden' }, svg);
    var tokRect = mk('rect', { rx: 9, height: 20, y: -10 }, token);
    var tokText = mk('text', { 'text-anchor': 'middle', y: 4 }, token);

    container.appendChild(svg);
    var legend = document.createElement('div'); legend.className = 'vn-dp-legend';
    Object.keys(NODES).forEach(function (id) {
      var sp = document.createElement('span'); sp.className = 'vn-dp-c-' + id;
      var dot = document.createElement('i'); sp.appendChild(dot);
      sp.appendChild(document.createTextNode(NODES[id][4].split(' · ')[0].replace('Instruction decoder', 'Decoder').replace('Condition codes', 'Flags')));
      legend.appendChild(sp);
    });
    container.appendChild(legend);

    var token_raf = 0, token_resolve = null, activeEdges = [], marked = [];

    // show the extended-set arrows only for an extended machine (or when `force` says a flow needs them)
    var extShown = false;
    function showExt(on) {
      on = !!on;
      if (on === extShown) return;
      extShown = on;
      svg.setAttribute('data-ext', on ? '1' : '0');
      EXT_EDGES.forEach(function (e) { edgeEls[e].style.display = on ? '' : 'none'; });
    }

    function setValues(st) {
      showExt(st && st.opBits === 5);
      Object.keys(valEls).forEach(function (id) { valEls[id].textContent = nodeValue(id, st); });
    }
    function clear() {
      stopTokens();
      marked.forEach(function (n) { n.classList.remove('vn-src', 'vn-dst'); });
      marked = [];
    }
    function stopTokens() {
      if (token_raf) cancelAnimationFrame(token_raf);
      token_raf = 0;
      token.setAttribute('visibility', 'hidden');
      activeEdges.forEach(function (e) { e.classList.remove('on'); e.setAttribute('marker-end', 'url(#vn-arrow)'); });
      activeEdges = [];
      if (token_resolve) { var r = token_resolve; token_resolve = null; r(); }
    }
    function mark(id, cls) { var n = nodeEls[id]; if (n) { n.classList.add(cls); marked.push(n); } }

    // run one stage = flows that share the same destination move together
    function runStage(pairs, st, ms) {
      return new Promise(function (resolve) {
        pairs.forEach(function (p) {
          mark(p[0], 'vn-src'); mark(p[1], 'vn-dst');
        });
        var items = pairs.map(function (p) {
          var key = p[0] + '>' + p[1], path = edgeEls[key];
          return { key: key, path: path, text: tokenText(p[0], p[1], st) };
        }).filter(function (it) { return it.path; });
        if (!items.length || ms <= 0) { resolve(); return; }
        items.forEach(function (it) { it.path.classList.add('on'); it.path.setAttribute('marker-end', 'url(#vn-arrow-on)'); activeEdges.push(it.path); it.len = it.path.getTotalLength(); });
        if (reduced()) { setTimeout(function () { stopTokens(); resolve(); }, Math.min(ms, 350)); token_resolve = null; return; }
        // one token per item (clone the single template for extra items)
        var toks = items.map(function (it, i) {
          var g = i === 0 ? token : token.cloneNode(true);
          if (i > 0) svg.appendChild(g);
          g.setAttribute('class', 'vn-dp-token vn-dp-c-' + it.key.split('>')[0] + (i > 0 ? ' extra' : ''));
          var r = g.querySelector('rect'), t = g.querySelector('text');
          t.textContent = it.text || '·';
          var w = Math.max(24, (it.text || '·').length * 7.4 + 14);
          r.setAttribute('width', w); r.setAttribute('x', -w / 2);
          g.setAttribute('visibility', 'visible');
          return g;
        });
        var t0 = null;
        token_resolve = function () { toks.forEach(function (g, i) { if (i > 0 && g.parentNode) g.parentNode.removeChild(g); }); resolve(); };
        function frame(ts) {
          if (t0 === null) t0 = ts;
          var k = Math.min(1, (ts - t0) / ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
          items.forEach(function (it, i) {
            var pt = it.path.getPointAtLength(it.len * e);
            toks[i].setAttribute('transform', 'translate(' + pt.x.toFixed(1) + ' ' + pt.y.toFixed(1) + ')');
          });
          if (k < 1) token_raf = requestAnimationFrame(frame);
          else { token_raf = 0; var r = token_resolve; stopTokensKeepResolve(); if (r) r(); }
        }
        function stopTokensKeepResolve() {
          token.setAttribute('visibility', 'hidden');
          activeEdges.forEach(function (e) { e.classList.remove('on'); e.setAttribute('marker-end', 'url(#vn-arrow)'); });
          activeEdges = []; token_resolve = null;
        }
        token_raf = requestAnimationFrame(frame);
      });
    }

    // flow: engine's m.flow, e.g. [['MAR','MEM'],['MEM','MDR']] — consecutive pairs with the same destination move together
    function animate(flow, st, ms) {
      clear();
      showExt((st && st.opBits === 5) || (flow || []).some(function (p) { return EXT_EDGES.indexOf(p[0] + '>' + p[1]) >= 0; }));
      var stages = [];
      (flow || []).forEach(function (p) {
        var last = stages[stages.length - 1];
        if (last && last[0][1] === p[1]) last.push(p); else stages.push([p]);
      });
      var chain = Promise.resolve();
      stages.forEach(function (stg) { chain = chain.then(function () { return runStage(stg, st, ms); }); });
      return chain;
    }

    return { svg: svg, setValues: setValues, animate: animate, clear: clear, cancel: stopTokens, nodeValue: nodeValue };
  }

  /* speed slider: returns { el, ms() , gap(), index() } ; storageKey optional */
  function speedControl(opts) {
    opts = opts || {};
    var key = opts.key || 'co1005-vn-speed';
    var idx = opts.initial === undefined ? 2 : opts.initial;
    if (!(typeof idx === 'number' && idx % 1 === 0 && idx >= 0 && idx < SPEEDS.length)) idx = 2;      // a bad `initial` must not break the lab
    // the saved value is untrusted (it can be corrupt or edited): accept only a whole index such as "3", never "1.5" or "1e0"
    try { var s = localStorage.getItem(key); if (typeof s === 'string' && /^[0-9]{1,2}$/.test(s) && +s < SPEEDS.length) idx = +s; } catch (e) {}
    var wrap = document.createElement('div'); wrap.className = 'vn-speed';
    var lab = document.createElement('label'); lab.className = 'field-label'; lab.textContent = 'Speed';
    var id = 'vn-speed-' + Math.floor(Math.random() * 1e6); lab.setAttribute('for', id);
    var rng = document.createElement('input'); rng.type = 'range'; rng.id = id; rng.min = 0; rng.max = SPEEDS.length - 1; rng.step = 1; rng.value = idx;
    var nm = document.createElement('span'); nm.className = 'vn-speed-name';
    wrap.appendChild(lab); wrap.appendChild(rng); wrap.appendChild(nm);
    function paint() { if (!SPEEDS[idx]) idx = 2; nm.textContent = SPEEDS[idx].name + (SPEEDS[idx].ms ? ' · ' + (SPEEDS[idx].ms / 1000) + ' s per arrow' : ''); rng.setAttribute('aria-valuetext', SPEEDS[idx].name); }
    rng.addEventListener('input', function () {
      idx = +rng.value; paint();
      try { localStorage.setItem(key, String(idx)); } catch (e) {}
      if (opts.onChange) opts.onChange(idx);
    });
    paint();
    return { el: wrap, ms: function () { return SPEEDS[idx].ms; }, gap: function () { var m = SPEEDS[idx].ms; return m ? Math.round(m * 0.4) : 0; }, index: function () { return idx; }, name: function () { return SPEEDS[idx].name; } };
  }

  var api = { create: create, speedControl: speedControl, SPEEDS: SPEEDS, NODES: NODES, EDGES: EDGES, tokenText: tokenText, nodeValue: nodeValue };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.VNDatapath = api;
})(typeof window !== 'undefined' ? window : this);
