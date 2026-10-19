/* Compiler toolchain flow diagram — shared by the Chapter 8 lab (tiny-compiler-ui.js) and the "Decompile Me" demo.
   Nine blocks: Source file -> Lexer -> Parser -> Code generator -> Assembler -> Loader -> Memory <-> CPU <-> Input/Output.
   It animates the ARTEFACTS moving between the blocks, driven by the pure event trace of TinyCompiler.trace(source, {input}):
     token chips stream out of the lexer, tree nodes appear in the parser, assembly lines are emitted (with a link back to the C++ line),
     machine words drop from the assembler through the loader into memory cells, then the CPU runs fetch / decode / execute.
   A compile error stops the animation in the block that found it (lexer = token error, parser = syntax error, assembler); later blocks go grey.
   Optional ghost band (opts.ghost): the *target* program's pipeline, faded, converging on the same memory (Decompile Me).
   start(trace, {onLine}) : onLine(line, phase) is called whenever the C++ line the toolchain is working on changes (phase = lexer | parser | codegen | cpu; line 0 = none),
   so a code editor can highlight it.  Codegen events may carry `explain` (what a construct such as a for loop or a multiply routine turns into): it is narrated once.
   Teaching simulation of the toy machine of vn-machine.js, not x86 / ARM. Theme tokens only (see compiler-flow.css). */
(function (global) {
  'use strict';
  if (typeof document === 'undefined') return;
  var NS = 'http://www.w3.org/2000/svg';
  var BW = 220, BH = 130, XS = [0, 280, 560], YS = [0, 186, 372], GY = 558, GH = 44;
  var GIDS = ['source', 'lexer', 'parser', 'codegen', 'assembler'];
  var ORDER = ['source', 'lexer', 'parser', 'codegen', 'assembler', 'loader', 'memory', 'cpu', 'io'];
  var BLOCKS = {
    source: { c: 0, r: 0, n: 1, title: 'Source file', sub: 'C++ text' },
    lexer: { c: 1, r: 0, n: 2, title: 'Lexer', sub: 'text → tokens' },
    parser: { c: 2, r: 0, n: 3, title: 'Parser', sub: 'tokens → syntax tree' },
    codegen: { c: 2, r: 1, n: 4, title: 'Code generator', sub: 'tree → assembly' },
    assembler: { c: 1, r: 1, n: 5, title: 'Assembler', sub: 'assembly → machine words' },
    loader: { c: 0, r: 1, n: 6, title: 'Loader', sub: 'words → memory cells' },
    memory: { c: 0, r: 2, n: 7, title: 'Memory', sub: 'the toy machine’s cells' },
    cpu: { c: 1, r: 2, n: 8, title: 'CPU', sub: 'fetch · decode · execute' },
    io: { c: 2, r: 2, n: 9, title: 'Input / Output', sub: 'cin and cout' }
  };
  var EDGES = ['source>lexer', 'lexer>parser', 'parser>codegen', 'codegen>assembler', 'assembler>loader', 'loader>memory', 'memory>cpu', 'cpu>memory', 'cpu>io', 'io>cpu'];
  var TWO_WAY = { 'memory>cpu': -8, 'cpu>memory': 8, 'cpu>io': -8, 'io>cpu': 8 };
  var FAIL_NAME = { lexer: 'Token error', parser: 'Syntax error', assembler: 'Assembler error' };
  var MAX_ANIM_INSTR = 24;       // instructions animated one by one; the rest run at full speed
  var CANCEL = { cancel: true };

  function mk(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function tx(parent, x, y, str, cls, anchor) {
    var t = mk('text', { x: x, y: y, class: cls || '' }, parent);
    if (anchor) t.setAttribute('text-anchor', anchor);
    t.textContent = str;
    return t;
  }
  function clear(g) { while (g.firstChild) g.removeChild(g.firstChild); }
  function clip(s, n) { s = String(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function reduced() { try { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
  function bx(id) { return XS[BLOCKS[id].c]; }
  function by(id) { return YS[BLOCKS[id].r]; }

  function edgePath(key) {
    var p = key.split('>'), a = p[0], b = p[1], off = TWO_WAY[key] || 0;
    var ax = bx(a), ay = by(a), bx2 = bx(b), by2 = by(b);
    if (ay === by2) {
      var y = ay + BH / 2 + off;
      return ax < bx2 ? 'M ' + (ax + BW + 2) + ' ' + y + ' L ' + (bx2 - 3) + ' ' + y : 'M ' + (ax - 2) + ' ' + y + ' L ' + (bx2 + BW + 3) + ' ' + y;
    }
    var x = ax + BW / 2;
    return 'M ' + x + ' ' + (ay + BH + 2) + ' L ' + x + ' ' + (by2 - 3);
  }

  function create(container, opts) {
    opts = opts || {};
    var ghostOn = !!opts.ghost, H = ghostOn ? GY + GH + 8 : YS[2] + BH + 6;
    var VD = global.VNDatapath;
    var root = document.createElement('div'); root.className = 'cf-root' + (ghostOn ? ' cf-has-ghost' : '');
    var diag = document.createElement('div'); diag.className = 'cf-diagram'; root.appendChild(diag);
    var svg = mk('svg', { viewBox: '0 0 780 ' + H, class: 'cf-svg', role: 'img',
      'aria-label': 'Block diagram of the toolchain: source file, lexer, parser, code generator, assembler, loader, memory, CPU and input/output, joined by arrows' + (ghostOn ? ', with the hidden target program’s pipeline faded below, converging on the same memory' : '') });
    diag.appendChild(svg);
    /* legend: one colour per component (colours come from --cmp-N in style.css; labels repeat the names) */
    var legend = document.createElement('div'); legend.className = 'cf-legend'; legend.setAttribute('role', 'list'); legend.setAttribute('aria-label', 'Colour key');
    var lg = ORDER.map(function (id) { return [id, BLOCKS[id].n + ' ' + BLOCKS[id].title]; }).concat([['pc', 'PC'], ['ir', 'IR'], ['r', 'R'], ['flags', 'flags'], ['out', 'cout value']]);
    if (ghostOn) lg.push(['twin', '✓ same word as target'], ['diff', '✗ different word']);
    lg.forEach(function (it) {
      var sp = document.createElement('span'); sp.className = 'cf-c-' + it[0]; sp.setAttribute('role', 'listitem');
      var sw = document.createElement('i'); sw.setAttribute('aria-hidden', 'true'); sp.appendChild(sw); sp.appendChild(document.createTextNode(it[1])); legend.appendChild(sp);
    });
    diag.appendChild(legend);

    var defs = mk('defs', {}, svg);
    [['cf-arrow', 'cf-head'], ['cf-arrow-on', 'cf-head on']].forEach(function (m) {
      var mm = mk('marker', { id: m[0] + '-' + (opts.uid || 'x'), viewBox: '0 0 10 10', refX: '8', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' }, defs);
      mk('path', { d: 'M 0 0 L 10 5 L 0 10 z', class: m[1] }, mm);
    });
    var uid = opts.uid || 'x';

    /* ── structure ── */
    var gEdges = mk('g', {}, svg), edgeEls = {}, edgeD = {};
    EDGES.forEach(function (k) {
      edgeD[k] = edgePath(k);
      edgeEls[k] = mk('path', { d: edgeD[k], class: 'cf-edge cf-c-' + k.split('>')[0], 'marker-end': 'url(#cf-arrow-' + uid + ')' }, gEdges);
    });
    var blockEls = {}, contentEls = {}, countEls = {};
    ORDER.forEach(function (id) {
      var B = BLOCKS[id], x = bx(id), y = by(id);
      var g = mk('g', { class: 'cf-block cf-b-' + id + ' cf-c-' + id, 'data-block': id }, svg);
      mk('rect', { x: x, y: y, width: BW, height: BH, rx: 10, class: 'cf-frame' }, g);
      mk('circle', { cx: x + 15, cy: y + 15, r: 9, class: 'cf-badge' }, g);
      tx(g, x + 15, y + 19, B.n, 'cf-badge-n', 'middle');
      tx(g, x + 30, y + 17, B.title, 'cf-title');
      tx(g, x + 30, y + 29, B.sub, 'cf-sub');
      countEls[id] = tx(g, x + BW - 8, y + 17, '', 'cf-count', 'end');
      contentEls[id] = mk('g', { class: 'cf-content' }, g);
      blockEls[id] = g;
    });
    var gGhost = null, ghostBlocks = [], ghostEdges = [];
    if (ghostOn) {
      gGhost = mk('g', { class: 'cf-ghost', 'aria-hidden': 'true' }, svg);
      var gl = [['Target source', '(hidden C++)'], ['Lexer', ''], ['Parser', ''], ['Code gen.', ''], ['Assembler', '']];
      gl.forEach(function (lab, i) {
        var x = 652 - 163 * i, gg = mk('g', { class: 'cf-c-' + GIDS[i] }, gGhost);      // same colour as the matching block of the main pipeline
        mk('rect', { x: x, y: GY, width: 128, height: GH, rx: 8, class: 'cf-gframe' }, gg);
        tx(gg, x + 64, GY + 17, lab[0], 'cf-gtitle', 'middle');
        ghostBlocks.push(tx(gg, x + 64, GY + 33, lab[1], 'cf-gsub', 'middle'));
        if (i < 4) { var d = 'M ' + (x - 2) + ' ' + (GY + GH / 2) + ' L ' + (x - 33) + ' ' + (GY + GH / 2); ghostEdges.push(d); mk('path', { d: d, class: 'cf-gedge cf-c-' + GIDS[i], 'marker-end': 'url(#cf-arrow-' + uid + ')' }, gGhost); }
      });
      var up = 'M 64 ' + (GY - 2) + ' L 64 ' + (YS[2] + BH + 3); ghostEdges.push(up);
      mk('path', { d: up, class: 'cf-gedge cf-c-assembler', 'marker-end': 'url(#cf-arrow-' + uid + ')' }, gGhost);
      tx(gGhost, 392, GY - 8, 'the hidden target program, compiled by the same toolchain', 'cf-gnote', 'middle');
    }
    var link = mk('path', { class: 'cf-link cf-c-codegen', d: 'M 0 0', visibility: 'hidden' }, svg);
    var gTokens = mk('g', { class: 'cf-tokens' }, svg);

    /* ── controls + narration ── */
    var narr = document.createElement('div'); narr.className = 'cf-narr';
    var live = document.createElement('p'); live.className = 'cf-live'; live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite');
    var detail = document.createElement('p'); detail.className = 'cf-detail';
    narr.appendChild(live); narr.appendChild(detail); root.appendChild(narr);
    var ctr = document.createElement('div'); ctr.className = 'cf-controls'; root.appendChild(ctr);
    function btn(label, cls) { var b = document.createElement('button'); b.type = 'button'; b.className = 'btn ' + cls; b.textContent = label; ctr.appendChild(b); return b; }
    var bPlay = btn('Play', 'primary cf-play'), bStep = btn('Step', 'ghost'), bRestart = btn('Restart', 'ghost'), bSkip = btn('Skip to end', 'ghost');
    bPlay.setAttribute('aria-label', 'Play or pause the animation');
    bStep.title = 'Advance one stage of the toolchain (one instruction while the CPU runs)';
    var speed = VD && VD.speedControl ? VD.speedControl({ key: opts.speedKey || 'co1005-cf-speed', initial: opts.initialSpeed === undefined ? 2 : opts.initialSpeed })
      : { el: document.createElement('span'), ms: function () { return 800; } };
    ctr.appendChild(speed.el);
    container.appendChild(root);

    /* ── model + rendering ── */
    var M, tr = null, ghostAsm = null, chunks = [], next = 0, gen = 0, paused = true, stepOne = false, running = false, finished = false, skipping = false;
    var waiters = [], lastOpts = {}, activeNodes = [];

    function newModel() {
      return { srcLines: [], srcActive: 0, srcErr: false, tokens: [], nodes: [], asm: [], words: [], loaded: 0, total: 0, same: 0,
        size: 32, kinds: {}, memWord: {}, cellCls: {}, hitCell: -1, memText: {}, ghostShown: false, errText: {}, errStage: null,
        cpu: { pc: '', ir: '', r: '', flags: '', phase: '', n: 0 }, io: { inp: [], out: [] } };
    }
    M = newModel();

    function spd() { return skipping ? 0 : speed.ms(); }
    function instant() { return spd() === 0; }
    function unit(w, count) {
      var s = spd(); if (!s) return 0;
      var u = s * w; if (count) u = Math.min(u, s * 6 / count);
      u = Math.max(u, 10);
      return reduced() ? Math.min(u, 40) : u;
    }
    function sleep(ms) { if (instant() || ms <= 0) return Promise.resolve(); return new Promise(function (r) { setTimeout(r, ms); }); }
    function say(l, d) {
      if (l !== undefined && l !== null && live.textContent !== l) live.textContent = l;
      if (d !== undefined) detail.textContent = d;
    }

    function active(line, phase) {
      M.srcActive = line || 0;
      if (lastOpts.onLine) { try { lastOpts.onLine(M.srcActive, phase || ''); } catch (e) { /* the editor must never break the animation */ } }
    }

    function setState(id, cls) {
      var g = blockEls[id]; if (!g) return;
      ['cf-src', 'cf-dst', 'cf-busy'].forEach(function (c) { g.classList.remove(c); });
      if (cls) g.classList.add(cls);
    }
    function clearStates() { ORDER.forEach(function (id) { setState(id, ''); }); EDGES.forEach(function (k) { edgeEls[k].classList.remove('on'); edgeEls[k].setAttribute('marker-end', 'url(#cf-arrow-' + uid + ')'); }); }
    function flowOn(from, to) {
      clearStates(); setState(from, 'cf-src'); setState(to, 'cf-dst');
      var k = from + '>' + to; if (edgeEls[k]) { edgeEls[k].classList.add('on'); edgeEls[k].setAttribute('marker-end', 'url(#cf-arrow-on-' + uid + ')'); }
    }
    function busy(id) { clearStates(); setState(id, 'cf-busy'); }

    /* chips in rows */
    function chipRows(parent, x0, y0, maxW, rowPitch, maxRows, items, cw) {
      var rows = [[]], w = 0;
      items.forEach(function (it) {
        var cwid = cw(it);
        if (w + cwid > maxW && rows[rows.length - 1].length) { rows.push([]); w = 0; }
        rows[rows.length - 1].push({ it: it, w: cwid }); w += cwid + 3;
      });
      var vis = rows.slice(-maxRows), hidden = rows.length - vis.length;
      vis.forEach(function (row, ri) {
        var x = x0;
        row.forEach(function (c) { c.it.draw(parent, x, y0 + ri * rowPitch, c.w); x += c.w + 3; });
      });
      return hidden;
    }
    function chip(parent, x, y, w, str, cls) {
      var g = mk('g', { class: 'cf-chip ' + (cls || '') }, parent);
      mk('rect', { x: x, y: y, width: w, height: 14, rx: 4 }, g);
      tx(g, x + w / 2, y + 10.5, str, 'cf-chip-t', 'middle');
      return g;
    }
    function chipW(s) { return Math.max(16, String(s).length * 6.3 + 9); }

    function render() { renderSource(); renderLexer(); renderParser(); renderCodegen(); renderAssembler(); renderLoader(); renderMemory(); renderCpu(); renderIo(); renderGhost(); }

    function srcWindow() {
      var total = M.srcLines.length, start = 1;
      if (M.srcActive > 3) start = Math.min(M.srcActive - 3, Math.max(1, total - 5));
      return start;
    }
    function srcY(line) { var s = srcWindow(); return by('source') + 40 + (line - s) * 14; }
    function renderSource() {
      var g = contentEls.source; clear(g); var x = bx('source'), y = by('source'), s = srcWindow();
      if (!M.srcLines.length) { tx(g, x + 12, y + 56, 'waiting for your program…', 'cf-faint'); return; }
      for (var i = 0; i < 6 && s + i <= M.srcLines.length; i++) {
        var ln = s + i, yy = y + 40 + i * 14, on = ln === M.srcActive;
        if (on) mk('rect', { x: x + 4, y: yy, width: BW - 8, height: 14, rx: 3, class: M.srcErr ? 'cf-line-err' : 'cf-line-on' }, g);
        tx(g, x + 10, yy + 10.5, ln, 'cf-ln');
        tx(g, x + 28, yy + 10.5, clip(M.srcLines[ln - 1].replace(/\t/g, '  '), 30), 'cf-code');
      }
      countEls.source.textContent = M.srcLines.length + ' lines';
    }
    function tokItem(t) {
      return { v: t.v, draw: function (p, x, y, w) { chip(p, x, y, w, clip(t.v, 12), 'cf-t-' + t.type + (t.bad ? ' bad' : '')); } };
    }
    function renderLexer() {
      var g = contentEls.lexer; clear(g); var x = bx('lexer') + 6, y = by('lexer') + 40;
      chipRows(g, x, y, BW - 12, 17, 5, M.tokens.map(tokItem), function (it) { return chipW(clip(it.v, 12)); });
      if (M.errText.lexer) tx(g, x, by('lexer') + 124, '✗ ' + clip(M.errText.lexer, 30), 'cf-err-t');
      countEls.lexer.textContent = M.tokens.length ? M.tokens.length + ' tokens' : '';
    }
    function renderParser() {
      var g = contentEls.parser; clear(g); var x = bx('parser'), y = by('parser');
      var vis = M.nodes.slice(-6);
      vis.forEach(function (n, i) {
        var yy = y + 50 + i * 14, last = i === vis.length - 1 && M.nodes.length && n.fresh;
        if (last) mk('rect', { x: x + 4, y: yy - 10, width: BW - 8, height: 14, rx: 3, class: 'cf-line-on' }, g);
        tx(g, x + 10 + n.depth * 9, yy, (n.depth ? '└ ' : '▸ ') + clip(n.label, 28 - n.depth * 2), 'cf-code');
      });
      if (!vis.length && M.srcLines.length) tx(g, x + 12, y + 56, '(no tree yet)', 'cf-faint');
      if (M.errText.parser) tx(g, x + 10, y + 124, '✗ ' + clip(M.errText.parser, 30), 'cf-err-t');
      countEls.parser.textContent = M.nodes.length ? M.nodes.length + ' nodes' : '';
    }
    function renderCodegen() {
      var g = contentEls.codegen; clear(g); var x = bx('codegen'), y = by('codegen');
      var vis = M.asm.slice(-6);
      vis.forEach(function (a, i) {
        var yy = y + 50 + i * 14;
        if (i === vis.length - 1 && a.fresh) mk('rect', { x: x + 4, y: yy - 10, width: BW - 8, height: 14, rx: 3, class: 'cf-line-on' }, g);
        if (a.cline) {
          var tg = mk('g', { class: 'cf-ltag cf-c-source' }, g);
          mk('rect', { x: x + 6, y: yy - 9, width: 22, height: 12, rx: 3 }, tg);
          tx(tg, x + 17, yy, 'L' + a.cline, 'cf-ltag-t', 'middle');
        }
        tx(g, x + 34, yy, clip(a.text, 26), 'cf-code' + (a.lineKind === 'label' ? ' cf-lbl' : ''));
      });
      countEls.codegen.textContent = M.asm.length ? M.asm.length + ' lines' : '';
    }
    function renderAssembler() {
      var g = contentEls.assembler; clear(g); var x = bx('assembler'), y = by('assembler');
      var vis = M.words.slice(-6);
      vis.forEach(function (w, i) {
        var yy = y + 50 + i * 14;
        if (i === vis.length - 1 && w.fresh) mk('rect', { x: x + 4, y: yy - 10, width: BW - 8, height: 14, rx: 3, class: 'cf-line-on' }, g);
        tx(g, x + 8, yy, ('0' + w.addr).slice(-2), 'cf-ln');
        tx(g, x + 26, yy, clip(w.text, 13), 'cf-code');
        tx(g, x + BW - 8, yy, w.bits, 'cf-bits', 'end');
      });
      if (M.errText.assembler) tx(g, x + 10, y + 124, '✗ ' + clip(M.errText.assembler, 30), 'cf-err-t');
      countEls.assembler.textContent = M.words.length ? M.words.length + ' words' : '';
    }
    function renderLoader() {
      var g = contentEls.loader; clear(g); var x = bx('loader'), y = by('loader');
      if (!M.total) { tx(g, x + 12, y + 56, 'copies each word to its cell', 'cf-faint'); return; }
      mk('rect', { x: x + 12, y: y + 58, width: BW - 24, height: 12, rx: 6, class: 'cf-bar' }, g);
      if (M.loaded) mk('rect', { x: x + 12, y: y + 58, width: Math.max(8, (BW - 24) * M.loaded / M.total), height: 12, rx: 6, class: 'cf-bar-fill' }, g);
      tx(g, x + 12, y + 92, 'loaded ' + M.loaded + ' of ' + M.total + ' words', 'cf-code');
      if (M.ghostShown && ghostAsm) tx(g, x + 12, y + 112, 'same as target: ' + M.same + ' of ' + M.loaded, 'cf-code cf-twin-t');
    }
    function grid() {
      var cells = [], n = M.size, i;
      if (n <= 32) { for (i = 0; i < n; i++) cells.push(i); }
      else { cells = Object.keys(M.kinds).map(Number).sort(function (a, b) { return a - b; }); }
      var cols = cells.length <= 32 ? 8 : Math.ceil(cells.length / 4), rows = Math.max(1, Math.ceil(cells.length / cols));
      var cw = Math.floor(208 / cols) - 1, ch = Math.min(20, Math.floor(84 / rows) - 2);
      return { cells: cells, cols: cols, cw: cw, ch: ch, pitchX: cw + 1, pitchY: ch + 2 };
    }
    function cellPos(addr) {
      var G = grid(), i = G.cells.indexOf(addr); if (i < 0) i = 0;
      return { x: bx('memory') + 6 + (i % G.cols) * G.pitchX, y: by('memory') + 40 + Math.floor(i / G.cols) * G.pitchY, w: G.cw, h: G.ch };
    }
    function renderMemory() {
      var g = contentEls.memory; clear(g); var G = grid(), asm = tr && tr.res && tr.res.asm;
      G.cells.forEach(function (a, i) {
        var p = cellPos(a), w = M.memWord[a], gw = ghostAsm && M.ghostShown ? ghostAsm.mem[a] : undefined, gk = ghostAsm && ghostAsm.cells[a] ? ghostAsm.cells[a].kind : 'free';
        var cls = 'cf-cell ' + (M.kinds[a] ? 'k-' + M.kinds[a] : '') + (M.cellCls[a] ? ' ' + M.cellCls[a] : '') + (M.hitCell === a ? ' hit' : '');
        var showGhost = w === undefined && gw !== undefined && gk !== 'free';
        if (showGhost) cls += ' ghosted';
        var cg = mk('g', { class: cls, 'data-addr': a }, g);
        mk('rect', { x: p.x, y: p.y, width: p.w, height: p.h, rx: 3 }, cg);
        tx(cg, p.x + 2, p.y + 6.5, a, 'cf-cell-a');
        if (M.kinds[a] === 'data') tx(cg, p.x + p.w - 2, p.y + 6.5, 'd', 'cf-cell-d', 'end');
        var val = w !== undefined ? hex(w) : (showGhost ? hex(gw) : '');
        if (val) tx(cg, p.x + p.w - 2, p.y + p.h - 3, val, 'cf-cell-v', 'end');
      });
      countEls.memory.textContent = M.size + ' cells';
    }
    function hex(w) { var VN = global.VNMachine, ab = tr && tr.res && tr.res.asm ? tr.res.asm.addrBits : (ghostAsm ? ghostAsm.addrBits : 5); return (VN && VN.hex(w, ab)) || String(w); }
    function renderCpu() {
      var g = contentEls.cpu; clear(g); var x = bx('cpu'), y = by('cpu'), c = M.cpu;
      [['PC', c.pc, 0, 0], ['IR', c.ir, 1, 0], ['R', c.r, 0, 1], ['flags', c.flags, 1, 1]].forEach(function (r) {
        var rx = x + 6 + r[2] * 105, ry = y + 40 + r[3] * 26, rg = mk('g', { class: 'cf-c-' + r[0].toLowerCase() }, g);
        mk('rect', { x: rx, y: ry, width: 103, height: 22, rx: 5, class: 'cf-reg' }, rg);
        tx(rg, rx + 5, ry + 14.5, r[0], 'cf-reg-l');
        tx(rg, rx + 99, ry + 14.5, clip(r[1], 11), 'cf-reg-v', 'end');
      });
      ['FETCH', 'DECODE', 'EXECUTE'].forEach(function (p, i) {
        var px = x + 6 + i * 71;
        mk('rect', { x: px, y: y + 98, width: 68, height: 18, rx: 9, class: 'cf-pill' + (c.phase === p ? ' on' : '') }, g);
        tx(g, px + 34, y + 110.5, p, 'cf-pill-t', 'middle');
      });
      countEls.cpu.textContent = c.n ? c.n + ' instr' : '';
    }
    function renderIo() {
      var g = contentEls.io; clear(g); var x = bx('io') + 8, y = by('io');
      tx(g, x, y + 48, 'input queue (cin)', 'cf-sub');
      var items = M.io.inp.map(function (v) { return { v: v, draw: function (p, xx, yy, w) { chip(p, xx, yy, w, String(v), 'cf-t-num'); } }; });
      if (!items.length) tx(g, x, y + 66, M.srcLines.length ? '(empty)' : '', 'cf-faint');
      else chipRows(g, x, y + 54, BW - 16, 17, 2, items, function (it) { return chipW(it.v); });
      tx(g, x, y + 92, 'output (cout)', 'cf-sub');
      var outs = M.io.out.map(function (v) { return { v: v, draw: function (p, xx, yy, w) { chip(p, xx, yy, w, String(v), 'cf-t-out cf-c-out'); } }; });
      if (!outs.length) tx(g, x, y + 110, '(nothing printed yet)', 'cf-faint');
      else chipRows(g, x, y + 98, BW - 16, 17, 2, outs, function (it) { return chipW(it.v); });
    }
    function renderGhost() {
      if (!ghostOn) return;
      var n = ghostAsm ? ghostAsm.listing.length + ghostAsm.cells.filter(function (c) { return c.kind === 'data'; }).length : 0;
      ghostBlocks[4].textContent = ghostAsm ? n + ' words' : '';
      ghostBlocks[0].textContent = '(hidden C++)';
      gGhost.classList.toggle('lit', !!M.ghostShown);
    }
    /* ── token travel (rAF tween along a path) ── */
    function travel(d, text, dur, cls) {
      return new Promise(function (res) {
        if (instant() || dur <= 0 || reduced()) { res(); return; }
        var myGen = gen;
        var path = mk('path', { d: d, fill: 'none', stroke: 'none' }, gTokens), len = path.getTotalLength();
        var g = mk('g', { class: 'cf-token ' + (cls || '') }, gTokens), w = Math.max(24, String(text).length * 6.8 + 14);
        mk('rect', { x: -w / 2, y: -10, width: w, height: 20, rx: 9 }, g);
        tx(g, 0, 4, text, '', 'middle');
        activeNodes.push(g, path);
        var t0 = null;
        function done() { [g, path].forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); var k = activeNodes.indexOf(n); if (k >= 0) activeNodes.splice(k, 1); }); res(); }
        function frame(ts) {
          if (myGen !== gen || instant()) { done(); return; }
          if (t0 === null) t0 = ts;
          var k = Math.min(1, (ts - t0) / dur), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
          var pt = path.getPointAtLength(len * e);
          g.setAttribute('transform', 'translate(' + pt.x.toFixed(1) + ' ' + pt.y.toFixed(1) + ')');
          if (k < 1) global.requestAnimationFrame(frame); else done();
        }
        global.requestAnimationFrame(frame);
      });
    }
    function clearTokens() { activeNodes.splice(0).forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); }); }
    function hop(from, to, text) { flowOn(from, to); return travel(edgeD[from + '>' + to], text, Math.max(90, spd() * 0.45), 'cf-c-' + from); }

    function showLink(fromBlock, row, line) {
      if (!line || line < 1 || line > M.srcLines.length || instant() || reduced()) { link.setAttribute('visibility', 'hidden'); return; }
      var ya = by(fromBlock) + 46 + row * 14, ys = srcY(line) + 7, xa = bx(fromBlock) + 2, xs = bx('source') + BW;
      link.setAttribute('d', 'M ' + xa + ' ' + ya + ' C ' + (xa - 120) + ' ' + (ya - 40) + ', ' + (xs + 140) + ' ' + (ys + 90) + ', ' + xs + ' ' + ys);
      link.setAttribute('visibility', 'visible');
    }
    function hideLink() { link.setAttribute('visibility', 'hidden'); }

    /* ── pause / step plumbing ── */
    function flush() { waiters.splice(0).forEach(function (f) { f(); }); }
    function gate(g) {
      if (g !== gen) throw CANCEL;
      if (!paused) return Promise.resolve();
      return new Promise(function (r) { waiters.push(r); }).then(function () { if (g !== gen) throw CANCEL; });
    }
    function paint() {
      bPlay.textContent = finished ? 'Done' : (paused ? (next > 0 ? 'Resume' : 'Play') : 'Pause');
      bPlay.disabled = !tr || finished;
      bStep.disabled = !tr || finished;
      bRestart.disabled = !tr;
      bSkip.disabled = !tr || finished;
      bPlay.setAttribute('aria-pressed', String(!paused && !finished));
    }

    /* ── chunks ── */
    function buildChunks() {
      var out = [], cur = null, cpuN = 0, turbo = null;
      tr.events.forEach(function (e) {
        if (e.stage === 'source') return;
        if (e.stage === 'cpu') {
          cur = null;
          if (e.kind === 'instr') {
            if (++cpuN <= MAX_ANIM_INSTR) { out.push({ stage: 'cpu', events: [e] }); }
            else { if (!turbo) { turbo = { stage: 'cpu', turbo: true, events: [] }; out.push(turbo); } turbo.events.push(e); }
          } else out.push({ stage: 'cpu', events: [e], end: true });
          return;
        }
        if (cur && cur.stage === e.stage) cur.events.push(e); else { cur = { stage: e.stage, events: [e] }; out.push(cur); }
      });
      // the loader chunk replays the assembler's words into memory
      var words = tr.events.filter(function (e) { return e.stage === 'assembler' && e.kind === 'word'; });
      for (var i = 0; i < out.length; i++) if (out[i].stage === 'loader') out[i].words = words;
      return out;
    }

    function stageNote(stage) {
      switch (stage) {
        case 'lexer': return 'Lexer: reads the source text character by character and cuts it into tokens: keywords, names, numbers and symbols. Spaces and comments are thrown away here.';
        case 'parser': return 'Parser: arranges the tokens into a syntax tree, the structure of the program. It checks the grammar; a statement that does not fit is a syntax error.';
        case 'codegen': return 'Code generator: walks the tree and writes assembly. Each assembly line remembers the C++ line it came from (dashed link).';
        case 'assembler': return 'Assembler: turns each mnemonic into a machine word, a 4-bit opcode plus an address, and each name into a cell number.';
        case 'loader': return 'Loader: copies every machine word into the memory cell with its address. After this the program is just numbers in memory, like data.';
        case 'cpu': return 'CPU: runs the program. For every instruction it fetches the word at PC from memory, decodes it, and executes it.';
      }
      return '';
    }
    function errNote(stage, e, total) {
      var where = e.line ? ' on line ' + e.line + (e.col ? ', column ' + e.col : '') : '';
      var after = {
        lexer: 'The lexer could not turn the text into a token, so the parser never received anything: no tree, no assembly, no machine words.',
        parser: 'The tokens were fine (the lexer finished), but they do not form a valid statement, so no complete tree exists and the code generator never ran.',
        assembler: 'The assembler could not encode the assembly, so there are no machine words to load.'
      }[stage];
      return FAIL_NAME[stage] + where + ': ' + e.msg + '. ' + after + ' A compiler that finds an error produces no program at all.';
    }

    async function runChunk(ch, g) {
      var st = ch.stage, evs = ch.events, i, e;
      function chk() { if (g !== gen) throw CANCEL; }
      onStageCb(st, ch);
      if (st === 'lexer') {
        say(stageNote('lexer'), ''); flowOn('source', 'lexer');
        await hop('source', 'lexer', M.srcLines.length + ' lines', 'doc'); chk();
        busy('lexer');
        var nt = evs.filter(function (x) { return x.kind === 'token'; }).length, u = unit(0.12, nt);
        for (i = 0; i < evs.length; i++) {
          await gate(g); e = evs[i];
          if (e.kind === 'token') {
            M.tokens.push({ type: e.type, v: e.v, line: e.line }); active(e.line, 'lexer'); M.srcErr = false;
            renderSource(); renderLexer(); say(undefined, 'token ' + (e.index + 1) + ': “' + e.v + '” (' + { kw: 'keyword', id: 'name', num: 'number', op: 'operator', punct: 'symbol', str: 'text' }[e.type] + ') from line ' + e.line);
            await sleep(u);
          } else if (e.kind === 'error') { await failAt('lexer', e, g); return; }
          else if (e.kind === 'done') { active(0, 'lexer'); renderSource(); say(undefined, e.count + ' tokens produced. Whitespace and comments are gone.'); }
        }
      } else if (st === 'parser') {
        say(stageNote('parser'), ''); flowOn('lexer', 'parser');
        await hop('lexer', 'parser', M.tokens.length + ' tokens', 'list'); chk();
        busy('parser');
        var np = evs.filter(function (x) { return x.kind === 'node'; }).length, up = unit(0.25, np);
        for (i = 0; i < evs.length; i++) {
          await gate(g); e = evs[i];
          if (e.kind === 'node') {
            M.nodes.forEach(function (n) { n.fresh = false; });
            M.nodes.push({ label: e.label, depth: e.depth, line: e.line, fresh: true }); active(e.line, 'parser'); M.srcErr = false;
            renderSource(); renderParser(); say(undefined, 'node: ' + e.label + ' (line ' + e.line + ')');
            await sleep(up);
          } else if (e.kind === 'error') { await failAt('parser', e, g); return; }
          else if (e.kind === 'done') { active(0, 'parser'); M.nodes.forEach(function (n) { n.fresh = false; }); renderSource(); renderParser(); say(undefined, 'Tree complete: ' + e.count + ' nodes. Whitespace and punctuation are no longer needed.'); }
        }
      } else if (st === 'codegen') {
        say(stageNote('codegen'), ''); flowOn('parser', 'codegen');
        await hop('parser', 'codegen', 'syntax tree', 'tree'); chk();
        busy('codegen');
        var na = evs.length, ua = unit(0.25, na);
        for (i = 0; i < evs.length; i++) {
          await gate(g); e = evs[i];
          if (e.kind === 'asm') {
            M.asm.forEach(function (a) { a.fresh = false; });
            M.asm.push({ text: e.text, cline: e.cline, lineKind: e.lineKind, fresh: true });
            active(e.cline || 0, 'codegen'); M.srcErr = false;
            renderSource(); renderCodegen(); showLink('codegen', Math.min(M.asm.length, 6) - 1, e.cline);
            if (e.explain) say(e.explain, undefined);
            say(undefined, e.text + (e.cline ? '  ← came from C++ line ' + e.cline : '  (added by the compiler)') + (e.comment ? '  — ' + e.comment : ''));
            await sleep(ua);
          } else if (e.kind === 'done') { hideLink(); active(0, 'codegen'); M.asm.forEach(function (a) { a.fresh = false; }); renderSource(); renderCodegen(); say(stageNote('codegen'), e.count + ' assembly lines.'); }
        }
      } else if (st === 'assembler') {
        say(stageNote('assembler'), ''); flowOn('codegen', 'assembler');
        await hop('codegen', 'assembler', M.asm.length + ' asm lines', 'list'); chk();
        busy('assembler');
        var nw = evs.filter(function (x) { return x.kind === 'word'; }).length, uw = unit(0.2, nw);
        for (i = 0; i < evs.length; i++) {
          await gate(g); e = evs[i];
          if (e.kind === 'word') {
            M.words.forEach(function (w) { w.fresh = false; });
            M.words.push({ addr: e.addr, text: e.text, bits: e.bits || String(e.word), word: e.word, cell: e.cell, fresh: true });
            M.kinds[e.addr] = e.cell; M.memText[e.addr] = e.text;
            renderAssembler(); renderMemory(); say(undefined, 'cell ' + e.addr + ': ' + e.text + '  →  ' + (e.bits || e.word) + (e.cell === 'data' ? '  (a data cell)' : ''));
            await sleep(uw);
          } else if (e.kind === 'error') { await failAt('assembler', e, g); return; }
          else if (e.kind === 'done') { M.words.forEach(function (w) { w.fresh = false; }); renderAssembler(); say(undefined, e.words + ' machine words ready (' + (tr.res.asm.wordBits) + ' bits each).'); }
        }
      } else if (st === 'loader') {
        say(stageNote('loader'), '');
        if (ghostOn && ghostAsm) await ghostPulse(g);
        flowOn('assembler', 'loader');
        var words = ch.words || [], ul = unit(0.2, words.length), flights = [];
        for (i = 0; i < words.length; i++) {
          await gate(g); e = words[i];
          flights.push(land(e, g));
          await sleep(ul);
        }
        await Promise.all(flights); chk();
        flowOn('loader', 'memory'); M.hitCell = -1; renderMemory(); renderLoader();
        say(undefined, M.loaded + ' words are now in memory.' + (ghostAsm ? ' ' + M.same + ' of them equal the target program’s word in the same cell.' : ''));
        await sleep(unit(0.3));
      } else if (st === 'cpu') {
        if (ch.end) { cpuEnd(evs[0]); return; }
        if (ch.turbo) { await cpuTurbo(ch, g); return; }
        await cpuInstr(evs[0], g);
      }
      chk();
    }

    function land(e, g) {
      var p = cellPos(e.addr), d = 'M ' + (bx('assembler') + BW / 2) + ' ' + (by('assembler') + BH / 2) + ' L ' + (p.x + p.w / 2) + ' ' + (by('assembler') + BH / 2) + ' L ' + (p.x + p.w / 2) + ' ' + (p.y + p.h / 2);
      var dur = Math.max(160, spd() * 0.7);
      return travel(d, e.hex || String(e.word), dur, 'cf-c-assembler').then(function () {
        if (g !== gen) return;
        M.memWord[e.addr] = e.word; M.loaded++; M.hitCell = e.addr; M.cellCls[e.addr] = 'landed';
        if (ghostAsm) {
          var gw = ghostAsm.mem[e.addr], gk = ghostAsm.cells[e.addr] ? ghostAsm.cells[e.addr].kind : 'free';
          if (gk !== 'free' && gw === e.word) { M.same++; M.cellCls[e.addr] = 'twin'; } else M.cellCls[e.addr] = 'diff';
        }
        renderMemory(); renderLoader();
      });
    }
    async function ghostPulse(g) {
      M.ghostShown = false; renderGhost();
      var ms = spd();
      if (ms && !reduced()) {
        for (var i = 0; i < ghostEdges.length; i++) { await travel(ghostEdges[i], i === ghostEdges.length - 1 ? 'target words' : '·', Math.max(90, ms * 0.3), 'ghost cf-c-' + GIDS[i]); if (g !== gen) throw CANCEL; await gate(g); }
      }
      M.ghostShown = true; renderGhost(); renderMemory(); renderLoader();
      say(undefined, 'The hidden target program went through the same toolchain. Its words appear faded in the cells they will occupy; yours will land on top of them.');
      await sleep(unit(0.5));
    }

    function phase(p) { M.cpu.phase = p; renderCpu(); }
    async function cpuInstr(e, g) {
      var ms = spd(), tk = Math.max(90, ms * 0.4), first = M.cpu.n === 0;
      function chk() { if (g !== gen) throw CANCEL; }
      if (first) { say(stageNote('cpu'), ''); }
      M.cpu.n = e.n; M.hitCell = e.at; busy('cpu'); setState('memory', 'cf-src');
      active(e.cline || 0, 'cpu'); renderSource();
      phase('FETCH'); M.cpu.pc = String(e.at); renderCpu(); renderMemory();
      say(undefined, 'cell ' + e.at + (e.cline ? ' (C++ line ' + e.cline + ')' : '') + ': FETCH — PC = ' + e.at + ' is sent to memory (MAR), the word comes back (MDR) into IR.');
      await hop('cpu', 'memory', 'addr ' + e.at, 'req'); chk();
      await hop('memory', 'cpu', hex(M.memWord[e.at] !== undefined ? M.memWord[e.at] : 0), 'word'); chk();
      M.cpu.ir = M.memText[e.at] || e.text; M.cpu.pc = String(e.pc); renderCpu(); await gate(g);
      phase('DECODE'); clearStates(); setState('cpu', 'cf-busy');
      say(undefined, 'cell ' + e.at + ': DECODE — the decoder splits the word into opcode ' + e.op + (e.arg !== null ? ' and address ' + e.arg : '') + '; PC already moved on to ' + e.pc + '.');
      await sleep(unit(0.3)); chk(); await gate(g);
      phase('EXECUTE');
      var lastMicro = e.micros[e.micros.length - 1];
      say(undefined, 'cell ' + e.at + ': EXECUTE ' + (M.memText[e.at] || e.text) + ' — ' + (lastMicro ? lastMicro.text : '') + (/^JUMP/.test(e.op) && e.pc !== e.at + 1 ? ' (PC jumped ' + (e.pc < e.at ? 'BACK: this is how a loop repeats)' : 'forward: code is skipped)') : ''));
      var operandReads = e.reads.slice(1);
      for (var i = 0; i < operandReads.length; i++) {
        var a = operandReads[i]; M.hitCell = a; renderMemory();
        await hop('cpu', 'memory', 'addr ' + a, 'req'); chk();
        await hop('memory', 'cpu', String(M.memWord[a] !== undefined ? M.memWord[a] : 0), 'val'); chk();
      }
      if (e.input !== null) { await hop('io', 'cpu', String(e.input), 'val'); chk(); M.io.inp.shift(); renderIo(); }
      for (var j = 0; j < e.writes.length; j++) {
        var w = e.writes[j];
        await hop('cpu', 'memory', String(w.value), 'val'); chk();
        M.memWord[w.addr] = w.value; M.hitCell = w.addr; M.cellCls[w.addr] = 'wrote'; renderMemory();
      }
      if (e.out !== null) { await hop('cpu', 'io', String(e.out), 'out'); chk(); M.io.out.push(e.out); renderIo(); }
      M.cpu.r = String(e.r); M.cpu.pc = String(e.pc); M.cpu.flags = 'G' + e.gt + ' E' + e.eq + ' L' + e.lt; renderCpu();
      if (e.reads.length) { M.hitCell = -1; renderMemory(); }
      await sleep(unit(0.35));
    }
    async function cpuTurbo(ch, g) {
      say('The first ' + MAX_ANIM_INSTR + ' instructions were shown one by one; the rest run at full speed (the CPU does this billions of times a second).', '');
      clearStates(); setState('cpu', 'cf-busy'); phase('EXECUTE'); M.hitCell = -1;
      var evs = ch.events, batch = Math.max(1, Math.ceil(evs.length / 40));
      for (var i = 0; i < evs.length; i++) {
        var e = evs[i];
        e.writes.forEach(function (w) { M.memWord[w.addr] = w.value; });
        if (e.out !== null) M.io.out.push(e.out);
        if (e.input !== null) M.io.inp.shift();
        M.cpu.n = e.n; M.cpu.pc = String(e.pc); M.cpu.r = String(e.r); M.cpu.flags = 'G' + e.gt + ' E' + e.eq + ' L' + e.lt; M.cpu.ir = M.memText[e.at] || e.text;
        if (i % batch === 0 || i === evs.length - 1) {
          active(e.cline || 0, 'cpu'); renderSource(); renderCpu(); renderMemory(); renderIo(); say(undefined, 'instruction ' + e.n + ' · cell ' + e.at + ': ' + (M.memText[e.at] || e.text));
          await gate(g); await sleep(Math.min(30, unit(0.05)));
        }
      }
    }
    function cpuEnd(e) {
      clearStates(); setState('cpu', 'cf-busy'); phase('');
      active(0, 'cpu'); renderSource();
      // jump to the final state (covers the instructions that ran at full speed)
      for (var a = 0; a < e.finalMem.length; a++) if (M.memWord[a] !== undefined) M.memWord[a] = e.finalMem[a];
      M.cpu.pc = String(e.pc); M.cpu.r = String(e.r); M.cpu.flags = 'G' + e.gt + ' E' + e.eq + ' L' + e.lt; M.cpu.n = e.instrCount;
      if (e.truncated) { M.io.out = e.out.slice(); M.io.inp = []; }
      renderCpu(); renderMemory(); renderIo();
      var msg = e.reason === 'halt' && !e.divzero ? 'HALT after ' + e.instrCount + ' instructions. The program printed: ' + (e.out.length ? e.out.join(' ') : '(nothing)') + '.'
        : e.reason === 'halt' && e.divzero ? 'Division by zero: the program jumped to the HALT labelled Ldiv0 after ' + e.instrCount + ' instructions. Printed so far: ' + (e.out.length ? e.out.join(' ') : '(nothing)') + '. (Real C++ would crash.)'
        : e.reason === 'waiting' ? 'The program asked for more input than the box contains (IN with an empty queue).'
        : e.reason === 'error' ? 'The machine stopped: ' + e.error
        : 'Stopped after ' + e.instrCount + ' instructions without HALT (infinite loop?).';
      say(msg, '');
    }

    async function failAt(stage, e, g) {
      M.errStage = stage; M.errText[stage] = e.msg;
      if (stage === 'lexer') { M.tokens.push({ type: 'err', v: '?', line: e.line, bad: true }); }
      active(e.line || 0, stage); M.srcErr = true;
      clearStates(); setState(stage, ''); blockEls[stage].classList.add('cf-fail');
      var idx = ORDER.indexOf(stage);
      ORDER.forEach(function (id, k) { if (k > idx) blockEls[id].classList.add('cf-skip'); });
      edgeEls[stage === 'lexer' ? 'lexer>parser' : stage === 'parser' ? 'parser>codegen' : 'assembler>loader'].classList.add('cf-cut');
      renderSource(); renderLexer(); renderParser(); renderAssembler(); hideLink();
      say(errNote(stage, e), (e.hint ? 'Hint: ' + e.hint : 'Failed in block ' + BLOCKS[stage].n + ' (' + BLOCKS[stage].title + '), not later.'));
      if (opts.onFail) opts.onFail(stage, e);
    }

    function onStageCb(stage, ch) { if (lastOpts.onStage) lastOpts.onStage(stage, ch); }

    function finish() {
      finished = true; running = false; paused = true; clearStates(); hideLink(); paint();
      var failed = tr && !tr.ok;
      if (!failed) { active(0, ''); renderSource(); }
      if (lastOpts.onDone) lastOpts.onDone({ ok: tr.ok, failedAt: tr.failedAt });
    }
    async function runner(g) {
      try {
        while (next < chunks.length) {
          await gate(g);
          paint();
          await runChunk(chunks[next], g);
          if (g !== gen) throw CANCEL;
          next++;
          if (stepOne) { stepOne = false; paused = true; }
          paint();
        }
        if (g === gen) {
          if (tr.ok && !chunks.some(function (c) { return c.stage === 'cpu'; })) say(undefined, 'Compiled and loaded. Run the program to watch the CPU execute it.');
          finish();
        }
      } catch (err) { if (err !== CANCEL) { throw err; } }
    }

    function resetView() {
      gen++; flush(); clearTokens(); hideLink();
      if (lastOpts.onLine && tr) { try { lastOpts.onLine(0, ''); } catch (e) { /* ignore */ } }
      ORDER.forEach(function (id) { blockEls[id].classList.remove('cf-fail', 'cf-skip'); });
      EDGES.forEach(function (k) { edgeEls[k].classList.remove('cf-cut'); });
      clearStates(); skipping = false; stepOne = false; next = 0; finished = false; running = false;
    }
    function load(trace, o) {
      resetView();
      tr = trace; lastOpts = Object.assign({}, lastOpts, o || {});
      if (o && o.ghost !== undefined) ghostAsm = o.ghost;
      M = newModel();
      var src = trace.events[0] && trace.events[0].text !== undefined ? trace.events[0].text : '';
      M.srcLines = src.split('\n'); if (M.srcLines.length && M.srcLines[M.srcLines.length - 1] === '') M.srcLines.pop();
      M.size = trace.res && trace.res.asm ? trace.res.asm.size : (ghostAsm ? ghostAsm.size : 32);
      var inp = lastOpts.input;
      M.io.inp = (inp || []).slice();
      chunks = buildChunks();
      M.total = 0; M.loaded = 0;
      trace.events.forEach(function (e) { if (e.stage === 'assembler' && e.kind === 'word') M.total++; });
      render();
      say('Ready. Press Play to watch your program travel through the toolchain, one block at a time.', 'The tokens, tree, assembly and machine words you will see are the real output of this compiler for your source.');
      paused = true; paint();
    }
    function begin(trace, o) {
      load(trace, o);
      running = true; paused = !(o && o.autoplay === false) ? false : true; paint();
      runner(gen);
    }

    bPlay.addEventListener('click', function () {
      if (!tr || finished) return;
      if (paused) { paused = false; flush(); } else paused = true;
      paint();
    });
    bStep.addEventListener('click', function () {
      if (!tr || finished) return;
      if (paused) { stepOne = true; paused = false; flush(); } else { stepOne = true; }
      paint();
    });
    bRestart.addEventListener('click', function () { if (tr) begin(tr, { autoplay: true }); });
    bSkip.addEventListener('click', function () { if (!tr || finished) return; skipping = true; paused = false; flush(); paint(); });
    speed.el.addEventListener('input', function () { /* speed is read live on every pause / tween */ });

    function cancel() { resetView(); paint(); }
    function setGhost(asm) { ghostAsm = asm || null; M.ghostShown = false; renderGhost(); }
    function blank(msg) {
      resetView(); tr = null; chunks = []; M = newModel(); if (ghostAsm) M.size = ghostAsm.size; render();
      say(msg || 'Press the button to watch a program travel through the toolchain.', ''); paused = true; paint();
    }

    render(); paint();
    say('Press the button to watch a program travel through the toolchain.', '');
    return { el: root, svg: svg, start: begin, load: load, cancel: cancel, blank: blank, setGhost: setGhost, speed: speed,
      play: function () { bPlay.click(); }, step: function () { bStep.click(); }, skip: function () { bSkip.click(); },
      model: function () { return M; }, isFinished: function () { return finished; } };
  }

  global.CompilerFlow = { create: create, BLOCKS: BLOCKS, ORDER: ORDER };
})(typeof window !== 'undefined' ? window : this);
