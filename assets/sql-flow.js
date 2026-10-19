/* "Inside the database" diagram — shared by the Chapter 10 SQL lab and the Missing Trophy demo.
   An SVG block diagram of a DBMS: client/app -> SQL parser -> query planner -> executor -> storage (table heap) and
   index (B-tree) -> result set, plus a constraints & log block for INSERT / UPDATE / DELETE.
   The animation is NOT a fake loop: it replays the ordered events returned by SqlLab's Database.trace(sql)
   (rows read, index steps, join probes, group buckets, result rows ...).  compile() is pure (Node-testable);
   create() draws and animates.  Theme tokens only (see sql-flow.css). */
(function (global) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';

  var SPEEDS = [
    { name: 'Very slow', ms: 2200 }, { name: 'Slow', ms: 1400 }, { name: 'Normal', ms: 800 },
    { name: 'Fast', ms: 400 }, { name: 'Very fast', ms: 150 }, { name: 'Instant', ms: 0 }
  ];

  /* ------------------------------------------------------------------ layouts */
  /* one colour per component: palette tokens --cmp-N from style.css (see the matching .sf-c-* rules in sql-flow.css) */
  var CMP = { C: 1, P: 5, L: 9, E: 7, I: 2, R: 6, K: 10, S: 3 };
  var LEGEND = [['C', 'Client / app'], ['P', 'SQL parser'], ['L', 'Query planner'], ['E', 'Executor'], ['I', 'Index (B-tree)'], ['S', 'Storage (table heap)'], ['R', 'Result set'], ['K', 'Constraints & log']];
  var TITLES = { C: 'Client / app', P: 'SQL parser', L: 'Query planner', E: 'Executor', I: 'Index (B-tree)', R: 'Result set', K: 'Constraints & log', S: 'Storage · table heap' };
  var LAYOUTS = {
    wide: {
      w: 760, h: 446, maxCells: 64, planChars: 34, cellX: 92,
      blocks: { C: [8, 14, 112, 84], P: [150, 14, 112, 84], L: [292, 14, 230, 84], E: [552, 14, 200, 84], R: [8, 150, 170, 140], I: [200, 150, 310, 140], K: [552, 150, 160, 140], S: [8, 340, 744, 96] },
      edges: {
        'C>P': 'M 120 56 L 150 56', 'P>L': 'M 262 56 L 292 56', 'L>E': 'M 522 56 L 552 56',
        'E>R': 'M 572 98 L 572 116 L 93 116 L 93 150', 'R>C': 'M 40 150 L 40 98',
        'E>I': 'M 600 98 L 600 132 L 355 132 L 355 150', 'E>K': 'M 652 98 L 652 150',
        'I>S': 'M 355 290 L 355 340', 'S>I': 'M 300 340 L 300 290', 'K>S': 'M 632 290 L 632 340',
        'E>S': 'M 722 98 L 722 340', 'S>E': 'M 740 340 L 740 98'
      }
    },
    tall: {
      w: 398, h: 520, maxCells: 40, planChars: 24, cellX: 70, titles: { K: 'Checks & log', S: 'Storage · heap' },
      blocks: { C: [14, 8, 84, 78], P: [112, 8, 84, 78], L: [210, 8, 164, 78], E: [14, 116, 360, 56], R: [14, 204, 100, 150], I: [126, 204, 150, 150], K: [288, 204, 86, 150], S: [14, 392, 360, 114] },
      edges: {
        'C>P': 'M 98 47 L 112 47', 'P>L': 'M 196 47 L 210 47', 'L>E': 'M 292 86 L 292 116',
        'E>R': 'M 64 172 L 64 204', 'R>C': 'M 14 290 L 6 290 L 6 47 L 14 47',
        'E>I': 'M 201 172 L 201 204', 'E>K': 'M 331 172 L 331 204',
        'I>S': 'M 215 354 L 215 392', 'S>I': 'M 187 392 L 187 354', 'K>S': 'M 331 354 L 331 392',
        'E>S': 'M 374 160 L 382 160 L 382 440 L 374 440', 'S>E': 'M 374 480 L 390 480 L 390 150 L 374 150'
      }
    }
  };

  /* ------------------------------------------------------------------ pure part: events -> beats */
  var IND_ROWS = 6, IND_STEPS = 8, IND_GROUP = 6, IND_EMIT = 4, MAX_PROBES = 3, BUDGET = 500;

  function num(n) { return Number(n).toLocaleString('en-US'); }
  function plural(n, w) { return num(n) + ' ' + w + (n === 1 ? '' : 's'); }
  function short(s, n) { s = String(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function oneLine(s) { return String(s).replace(/\s+/g, ' ').trim(); }
  function rowText(v) { return v ? v.join(', ') : ''; }
  function leafOf(pos, size, leaves) { return size > 0 ? Math.min(leaves - 1, Math.floor(pos * leaves / size)) : 0; }
  function cellOf(pos, n, maxC) { return n <= maxC ? pos : Math.min(maxC - 1, Math.floor(pos * maxC / n)); }

  function newVM() {
    return { parser: '', plan: [], examined: 0, steps: 0, probes: 0, passed: 0, groups: 0, grouped: 0, emitted: 0, checks: 0, written: 0, logs: 0,
      slots: [], tree: null, treeOn: null, treeMsg: '', rows: [], resMsg: '', client: '', note: '', bad: '' };
  }
  function applyBeat(vm, b) {
    var fx = b.fx || {}, k, v = b.view || {};
    for (k in fx) if (Object.prototype.hasOwnProperty.call(fx, k)) vm[k] += fx[k];
    if (v.reset) { var fresh = newVM(); for (k in fresh) vm[k] = fresh[k]; }
    if (v.client !== undefined) vm.client = v.client;
    if (v.parser !== undefined) vm.parser = v.parser;
    if (v.plan) vm.plan = v.plan;
    if (v.tree !== undefined) { vm.tree = v.tree; vm.treeOn = null; vm.treeMsg = ''; }
    if (v.treeMsg !== undefined) vm.treeMsg = v.treeMsg;
    if (v.treeOn !== undefined) vm.treeOn = v.treeOn;
    if (v.strip) { vm.slots[v.strip.slot] = { table: v.strip.table, n: v.strip.n, lit: {}, hit: {}, wr: {}, del: {}, cur: -1, label: v.strip.label }; }
    ['lit', 'hit', 'wr', 'del'].forEach(function (t) {
      if (!v[t]) return;
      var s = vm.slots[v[t].slot]; if (!s) return;
      v[t].pos.forEach(function (p) { if (p >= 0) s[t][p] = true; });
      if (t === 'lit' && v[t].pos.length) s.cur = v[t].pos[v[t].pos.length - 1];
    });
    if (v.multi) v.multi.forEach(function (m) {
      var s = vm.slots[m.slot]; if (!s) return;
      m.pos.forEach(function (p) { if (p >= 0) s[m.t][p] = true; });
      if (m.t === 'lit' && m.pos.length) s.cur = m.pos[m.pos.length - 1];
    });
    if (v.res) { v.res.forEach(function (r) { if (vm.rows.length < 3) vm.rows.push(r); }); }
    if (v.resMsg !== undefined) vm.resMsg = v.resMsg;
    if (v.note !== undefined) vm.note = v.note;
    if (v.bad !== undefined) vm.bad = v.bad;
    return vm;
  }

  /* trace (from SqlLab Database.trace) -> { beats, totals, direct } */
  function compile(trace) {
    var ev = trace.events || [], beats = [], i, n = ev.length;
    var skippedAny = !!(trace.truncated);
    function B(o) {
      o.fx = o.fx || {}; o.view = o.view || {}; o.tokens = o.tokens || []; o.weight = o.weight || 1;
      beats.push(o); return o;
    }
    var ctx = null, pend = null;

    function planLines(from, to) {
      var seen = {}, lines = [], tablesTop = [], hasGroup = false, hasSort = false, sub = false, k;
      for (k = from; k < to; k++) {
        var e = ev[k];
        if (e.t === 'access') {
          var key = (e.sub ? 's' : '') + e.ti + '|' + e.table + '|' + e.mode + '|' + e.index;
          if (e.sub) sub = true;
          if (!seen[key]) {
            seen[key] = 1;
            lines.push((e.sub ? 'subq: ' : '') + (e.mode === 'index' ? 'INDEX ' + e.table + '(' + (e.cond || '').replace(/ = \?| IN \(\.\.\.\)/, '').split(' ')[0] + ')' : 'SCAN ' + e.table));
            if (!e.sub && tablesTop.indexOf(e.table) < 0) tablesTop.push(e.table);
          }
        } else if (e.t === 'group') hasGroup = true; else if (e.t === 'sort') hasSort = true;
      }
      if (tablesTop.length > 1) lines.push('nested-loop join');
      if (hasGroup) lines.push('hash GROUP BY');
      if (hasSort) lines.push('SORT');
      void sub;
      return lines;
    }

    function resetStmtCtx(si, from, to) {
      var sx = (trace.statements && trace.statements[si]) || {};
      ctx = { si: si, direct: !sx.groups && !sx.sorts && sx.emitted === sx.lastMatches && sx.emitted > 0, acc: {}, slotOf: {}, slotN: 0, ff: false, cur: null, rowsInAcc: 0, stepsInAcc: 0,
        groupsShown: 0, emitShown: 0, idxOut: false, rowsSeen: 0, stepsSeen: 0, kind: '' };
    }

    function slotFor(e) {
      var key = (e.sub ? 's' : '') + e.ti + '|' + e.table;
      if (ctx.slotOf[key] === undefined) { ctx.slotOf[key] = Math.min(ctx.slotN, 2); ctx.slotN++; }
      return ctx.slotOf[key];
    }

    /* aggregated (fast-forwarded) work */
    function agg(type) {
      if (!pend || pend.type !== type) { flush(); pend = { type: type, fx: {}, lit: {}, hit: {}, weight: 0, probes: 0, rows: 0, steps: 0, kept: 0, slot: 0, out: 0, groups: 0 }; }
      return pend;
    }
    function addPos(p, slot, pos, kind) { (p[kind][slot] = p[kind][slot] || []); if (p[kind][slot].length < 4000) p[kind][slot].push(pos); }
    function flush() {
      if (!pend) return;
      var p = pend; pend = null;
      var parts = [];
      if (p.probes) parts.push(plural(p.probes, 'more probe'));
      if (p.steps) parts.push(plural(p.steps, 'more index step'));
      if (p.rows) parts.push(plural(p.rows, 'more row') + ' read');
      if (p.kept) parts.push(plural(p.kept, 'row') + ' kept');
      if (p.groups) parts.push(plural(p.grouped || 0, 'more row') + ' hashed into buckets');
      if (p.out) parts.push(plural(p.out, 'more result row'));
      var b = B({ kind: p.type, weight: Math.min(14, 2 + (p.rows + p.steps + p.out + (p.grouped || 0)) / 8), narr: '… ' + parts.join(', ') + ' — skipped ahead (fast-forward) so the animation stays short; the counters still add up.',
        units: Math.max(0.6, Math.min(20, 0.5 + (p.rows + p.steps + p.out + (p.grouped || 0)) / 200)), src: p.rows || p.steps ? ['S'] : ['E'], dst: ['E'], tokens: p.rows ? [{ edge: 'S>E', text: num(p.rows) + ' rows', cls: 'row' }] : [], fx: p.fx, view: {}, ff: true });
      b.view.multi = [];
      Object.keys(p.lit).forEach(function (s) { b.view.multi.push({ t: 'lit', slot: +s, pos: p.lit[s] }); });
      Object.keys(p.hit).forEach(function (s) { b.view.multi.push({ t: 'hit', slot: +s, pos: p.hit[s] }); });
    }
    function closeAccess(keep) {
      if (!(keep && pend && pend.type === keep)) flush();
      if (ctx && ctx.cur && !ctx.ff) {
        var a = ctx.cur; ctx.cur = null;
        if (a.rows === 0) {
          B({ kind: 'empty', src: [a.mode === 'index' ? 'I' : 'S'], dst: ['E'], narr: (a.mode === 'index' ? 'No index entry matches ' + (a.key || 'the key') + ', so the table is not read at all.' : a.tableRows === 0 ? 'Table ' + a.table + ' is empty: nothing to read.' : 'Nothing to read.'), view: {} });
        }
      }
    }

    /* index 'view' of a tree */
    function treeOf(a) { return { name: a.index, size: a.ixSize, leaves: a.leaves, bounds: a.bounds, table: a.table }; }

    var stmtStarts = [];
    for (i = 0; i < n; i++) if (ev[i].t === 'stmt') stmtStarts.push(i);
    stmtStarts.forEach(function (s, si) { stmtStarts[si] = { i: s, end: si + 1 < stmtStarts.length ? stmtStarts[si + 1] : n }; });

    var errEv = null, accFx = { examined: 0, steps: 0 };

    // parse error before any statement ran
    if (!stmtStarts.length) {
      B({ kind: 'parse', src: ['C'], dst: ['P'], tokens: [{ edge: 'C>P', text: short(oneLine(trace.sql || ''), 16) || 'query', cls: 'req' }], narr: 'The app sends the query text to the SQL parser.',
        view: { reset: true, client: short(oneLine(trace.sql || ''), 30), parser: 'reading tokens…' } });
      ev.forEach(function (e) { if (e.t === 'error') errEv = e; });
      if (errEv) B({ kind: 'error', src: [], dst: ['P'], bad: 'P', narr: 'Syntax error: ' + short(errEv.message, 150) + ' Nothing reached the planner.', view: { parser: 'syntax error', bad: 'P', note: '' } });
    }

    stmtStarts.forEach(function (st, si) {
      var from = st.i, to = st.end, se = ev[from];
      resetStmtCtx(si, from + 1, to);
      ctx.kind = se.kind; ctx.startBeat = beats.length;
      accFx = { examined: 0, steps: 0 };
      var text = oneLine(se.text || trace.sql || ''), isSel = se.kind === 'select' || se.kind === 'explain';
      var kindName = { select: 'SELECT', explain: 'EXPLAIN', insert: 'INSERT', update: 'UPDATE', delete: 'DELETE', createtable: 'CREATE TABLE', createindex: 'CREATE INDEX', droptable: 'DROP TABLE', dropindex: 'DROP INDEX', altertable: 'ALTER TABLE' }[se.kind] || se.kind;
      B({ kind: 'parse', src: ['C'], dst: ['P'], tokens: [{ edge: 'C>P', text: short(text, 16), cls: 'req' }],
        narr: (trace.statements && trace.statements.length > 1 ? 'Statement ' + (si + 1) + ' of ' + trace.statements.length + '. ' : '') + 'The app sends the query text to the SQL parser, which breaks it into tokens and checks the grammar.',
        view: { reset: true, client: short(text, 34), parser: kindName + ' · ' + plural(text.split(/\s+/).length, 'token'), note: '' } });
      var pl = planLines(from + 1, to);
      if (!pl.length) pl = [se.kind === 'insert' ? 'append row to heap' : se.kind === 'createindex' ? 'build index' : kindName];
      B({ kind: 'plan', src: ['P'], dst: ['L'], tokens: [{ edge: 'P>L', text: 'parse tree', cls: 'req' }],
        narr: pl.some(function (l) { return /^INDEX/.test(l.replace('subq: ', '')); }) ? 'The planner sees an index it can use and chooses an index lookup instead of reading the whole table.' :
          pl.some(function (l) { return /SCAN/.test(l); }) ? 'The planner looks for a usable index. There is none for this condition, so it plans a full table scan.' : 'The planner decides how to carry out the statement.',
        view: { plan: pl } });
      B({ kind: 'exec', src: ['L'], dst: ['E'], tokens: [{ edge: 'L>E', text: 'plan', cls: 'req' }], narr: 'The chosen plan goes to the executor, which now does the real work.', view: {} });

      for (i = from + 1; i < to; i++) {
        var e = ev[i];
        switch (e.t) {
          case 'access': {
            closeAccess();
            var key = (e.sub ? 's' : '') + e.ti + '|' + e.table + '|' + e.mode + '|' + e.index;
            ctx.acc[key] = (ctx.acc[key] || 0) + 1;
            if (ctx.acc[key] > MAX_PROBES || beats.length > BUDGET) ctx.ff = true;
            if (ctx.ff) { var pf = agg('ff'); pf.fx.probes = (pf.fx.probes || 0) + 1; pf.probes++; break; }
            ctx.cur = e; ctx.rowsInAcc = 0; ctx.stepsInAcc = 0; ctx.idxOut = false;
            var slot = slotFor(e), pre = (e.sub ? 'Sub-query: ' : ''), probe = e.loop > 1 || e.ti > 0;
            var strip = { slot: slot, table: e.table, n: e.tableRows, label: e.alias };
            if (e.mode === 'scan') {
              B({ kind: 'open-scan', src: ['E'], dst: ['S'], tokens: [{ edge: 'E>S', text: 'scan ' + short(e.table, 10), cls: 'req' }], fx: { probes: 1 }, view: { strip: strip },
                narr: pre + (probe ? 'Join probe #' + num(e.loop) + ': no index, so the executor scans all ' + plural(e.tableRows, 'row') + ' of ' + e.table + ' again.' : 'No index: the executor scans the heap of ' + e.table + ' and reads every one of its ' + plural(e.tableRows, 'row') + '.') });
            } else {
              B({ kind: 'open-index', src: ['E'], dst: ['I'], tokens: [{ edge: 'E>I', text: short(e.key || 'lookup', 14), cls: 'req' }], fx: { probes: 1 }, view: { strip: strip, tree: treeOf(e) },
                narr: pre + (probe ? 'Join probe #' + num(e.loop) + ': ' : '') + 'Index lookup on ' + e.table + ' (' + (e.cond || '').replace(/ = \?| IN \(\.\.\.\)| BETWEEN \? AND \?/, '') + ' ' + (e.key || '') + '): descend the B-tree instead of reading the table.' });
            }
            break;
          }
          case 'step': {
            if (ctx.ff) { var ps = agg('ff'); ps.fx.steps = (ps.fx.steps || 0) + 1; ps.steps++; break; }
            if (ctx.stepsInAcc < IND_STEPS && !(pend && pend.type === 'sweep')) {
              ctx.stepsInAcc++;
              var a = ctx.cur || { ixSize: 0, leaves: 1 };
              var leaf = leafOf(e.pos, a.ixSize, a.leaves);
              B({ kind: 'step', src: ['I'], dst: ['I'], fx: { steps: 1 }, small: true, view: { treeOn: { leaf: leaf, phase: e.phase, pos: e.pos } },
                narr: e.phase === 'search' ? 'Binary search: compare with entry #' + num(e.pos + 1) + ' (key ' + e.key + ') to choose the left or right half. The tree narrows to leaf ' + (leaf + 1) + '.' :
                  'Walk along the sorted leaf: entry #' + num(e.pos + 1) + ' has key ' + e.key + '. Checking whether it is still inside the range.' });
            } else { var q = agg('sweep'); q.fx.steps = (q.fx.steps || 0) + 1; q.steps++; q.slot = ctx.cur ? slotFor(ctx.cur) : 0; }
            break;
          }
          case 'row': {
            var matchEv = ev[i + 1] && ev[i + 1].t === 'match' && ev[i + 1].table === e.table && ev[i + 1].pos === e.pos ? ev[i + 1] : null;
            var sl = slotFor(e), a2 = ctx.cur;
            var ptsRows = ctx.cur ? ctx.cur.tableRows : 0, maxC = 1e9;
            void ptsRows; void maxC;
            if (ctx.ff || ctx.rowsInAcc >= IND_ROWS) {
              var pr = agg(ctx.ff ? 'ff' : 'sweep');
              pr.fx.examined = (pr.fx.examined || 0) + 1; pr.rows++; pr.slot = sl;
              addPos(pr, sl, e.pos, 'lit');
              if (matchEv) { pr.fx.passed = (pr.fx.passed || 0) + 1; pr.kept++; addPos(pr, sl, e.pos, 'hit'); if (matchEv.last && ctx.direct) { pr.fx.emitted = (pr.fx.emitted || 0) + 1; pr.out++; } i++; }
              break;
            }
            if (a2 && a2.mode === 'index' && !ctx.idxOut) {
              ctx.idxOut = true;
              B({ kind: 'ids', src: ['I'], dst: ['S'], tokens: [{ edge: 'I>S', text: plural(a2.rows, 'row id'), cls: 'row' }], view: { treeOn: null, treeMsg: plural(a2.rows, 'row id') + ' returned' },
                narr: 'The index returns ' + plural(a2.rows, 'row id') + '. The executor reads only these ' + (a2.rows === 1 ? 'row' : 'rows') + ' from the table heap, not all ' + plural(a2.tableRows, 'row') + '.' });
            }
            ctx.rowsInAcc++;
            var fxr = { examined: 1 }, toks = [{ edge: 'S>E', text: short(rowText(e.v) || 'row ' + e.pos, 14), cls: 'row' }], view = { lit: { slot: sl, pos: [e.pos] } }, why;
            if (matchEv) {
              fxr.passed = 1; view.hit = { slot: sl, pos: [e.pos] };
              if (matchEv.last && ctx.direct) { fxr.emitted = 1; toks.push({ edge: 'E>R', text: short(rowText(e.v) || 'row', 14), cls: 'out', col: 'R' }); view.res = [rowText(e.v)]; }
              why = matchEv.last && ctx.direct ? 'passes every condition, so it goes straight into the result set' : (ctx.cur && ctx.cur.ti < 0 ? '' : 'passes the conditions, so the executor keeps it');
              i++;
            } else why = 'fails the conditions, so it is dropped';
            B({ kind: 'row', src: ['S'], dst: matchEv && matchEv.last && ctx.direct ? ['E', 'R'] : ['E'], tokens: toks, fx: fxr, view: view, small: true,
              narr: (e.sub ? 'Sub-query: ' : '') + 'Read row #' + num(e.pos + 1) + ' of ' + e.table + (e.v ? ' (' + short(rowText(e.v), 40) + ')' : '') + ': it ' + why + '.' });
            break;
          }
          case 'match': {            // a match not paired with the row just read (LEFT JOIN padding, or sweeps)
            var sm = ctx.cur ? slotFor(ctx.cur) : 0;
            var pm = agg(ctx.ff ? 'ff' : 'sweep');
            pm.fx.passed = (pm.fx.passed || 0) + 1; pm.kept++; pm.slot = sm;
            if (e.pos >= 0) addPos(pm, sm, e.pos, 'hit');
            if (e.last && ctx.direct) { pm.fx.emitted = (pm.fx.emitted || 0) + 1; pm.out++; }
            break;
          }
          case 'group': {
            closeAccess('group');
            if (ctx.groupsShown < IND_GROUP && !ctx.ff) {
              ctx.groupsShown++;
              B({ kind: 'group', src: ['E'], dst: ['E'], small: true, fx: { grouped: 1, groups: e.isNew ? 1 : 0 },
                narr: 'GROUP BY: hash the row into bucket ' + e.key + (e.isNew ? ' (a new bucket)' : ' (already exists)') + '. Buckets so far are counted in the executor.', view: {} });
            } else { var pg = agg('group'); pg.fx.grouped = (pg.fx.grouped || 0) + 1; pg.grouped = (pg.grouped || 0) + 1; pg.groups = 1; if (e.isNew) pg.fx.groups = (pg.fx.groups || 0) + 1; }
            break;
          }
          case 'sort': {
            closeAccess();
            B({ kind: 'sort', src: ['E'], dst: ['E'], narr: 'ORDER BY: the executor sorts the ' + plural(e.rows, 'result row') + ' in memory before returning them.', view: {} });
            break;
          }
          case 'emit': {
            closeAccess('emit');
            if (ctx.direct) break;            // already shown when the rows were read
            if (ctx.emitShown < IND_EMIT) {
              ctx.emitShown++;
              B({ kind: 'emit', src: ['E'], dst: ['R'], tokens: [{ edge: 'E>R', text: short(rowText(e.v) || 'row', 14), cls: 'out', col: 'R' }], small: true, fx: { emitted: 1 }, view: { res: e.v ? [rowText(e.v)] : [] },
                narr: 'Result row ' + num(e.i + 1) + (e.v ? ' (' + short(rowText(e.v), 40) + ')' : '') + ' leaves the executor for the result set.' });
            } else { var pe = agg('emit'); pe.fx.emitted = (pe.fx.emitted || 0) + 1; pe.out++; }
            break;
          }
          case 'check': {
            closeAccess();
            B({ kind: 'check', src: ['E'], dst: ['K'], tokens: [{ edge: 'E>K', text: 'check', cls: 'req' }], fx: { checks: 1 }, view: {},
              narr: e.op === 'delete' ? 'Before deleting, the foreign keys of other tables are checked (RESTRICT / CASCADE).' : 'Constraints are checked before anything is written: NOT NULL, UNIQUE, PRIMARY KEY, FOREIGN KEY, CHECK.' });
            break;
          }
          case 'write': {
            closeAccess();
            var wslot = ctx.slotN ? 0 : 0, wview = {};
            if (e.op === 'insert') { wview.strip = { slot: wslot, table: e.table, n: e.tableRows, label: e.table }; wview.wr = { slot: wslot, pos: e.pos }; }
            else { wview[e.op === 'delete' ? 'del' : 'wr'] = { slot: wslot, pos: e.pos }; }
            B({ kind: 'write', src: ['K'], dst: ['S'], tokens: [{ edge: 'K>S', text: e.op + ' ' + e.rows, cls: 'out' }], fx: { written: e.rows, logs: 1 }, view: wview,
              narr: 'The log records the change first, then the heap is updated: ' + plural(e.rows, 'row') + ' ' + (e.op === 'insert' ? 'appended' : e.op === 'update' ? 'rewritten' : 'removed') + ' in ' + e.table + '.' });
            if (e.indexWrites) B({ kind: 'idxwrite', src: ['S'], dst: ['I'], tokens: [{ edge: 'S>I', text: plural(e.indexWrites, 'key'), cls: 'out' }], view: { note: '', treeMsg: plural(e.indexWrites, 'index entry').replace('entrys', 'entries') + ' updated' },
              narr: 'Every index on ' + e.table + ' must be updated too: ' + plural(e.indexWrites, 'index entry').replace('entrys', 'entries') + '. This is the write cost of having indexes.' });
            break;
          }
          case 'build': {
            closeAccess();
            B({ kind: 'build', src: ['S'], dst: ['I'], tokens: [{ edge: 'S>I', text: plural(e.entries, 'key'), cls: 'row' }],
              view: { strip: { slot: 0, table: e.table, n: e.tableRows, label: e.table }, tree: { name: e.index, size: e.entries, leaves: Math.min(6, Math.max(1, e.entries)), bounds: [], table: e.table, built: true } },
              narr: 'CREATE INDEX reads every row of ' + e.table + ' once, sorts the ' + plural(e.entries, 'key') + ' of ' + e.column + ' and stores them with their row ids in a B-tree. Later queries can use it.' });
            break;
          }
          case 'done': {
            closeAccess();
            var stats = trace.statements && trace.statements[ev[i].i];
            // catch-up when bulk events were dropped by the engine's storage cap
            if (stats && skippedAny) {            // the engine dropped some stored events: add the exact remainder
              var seenRows = 0, seenSteps = 0, seenProbes = 0, seenEmit = 0;
              for (var bi = ctx.startBeat; bi < beats.length; bi++) { seenRows += (beats[bi].fx.examined || 0); seenSteps += (beats[bi].fx.steps || 0); seenProbes += (beats[bi].fx.probes || 0); seenEmit += (beats[bi].fx.emitted || 0); }
              var mr = Math.max(0, stats.rows - seenRows), ms2 = Math.max(0, stats.steps - seenSteps), mp = Math.max(0, stats.accesses - seenProbes), me = Math.max(0, stats.emitted - seenEmit);
              if (mr || ms2 || mp || me) B({ kind: 'ff', ff: true, weight: 8, src: ['S'], dst: ['E'], fx: { examined: mr, steps: ms2, probes: mp, emitted: me }, tokens: [{ edge: 'S>E', text: num(mr) + ' rows', cls: 'row' }],
                narr: '… ' + plural(mr, 'more row') + (ms2 > 0 ? ', ' + plural(ms2, 'more index step') : '') + (mp > 0 ? ', ' + plural(mp, 'more probe') : '') + ' not drawn one by one (big table): the counters include them.', view: {} });
            }
            var rs = isSel ? ev[i].returned : null;
            var msg = isSel ? 'The finished result set goes back to the app: ' + plural(rs, 'row') + '. Work done: ' + plural(ev[i].rowsRead || 0, 'row') + ' read' + (ev[i].indexSteps ? ' and ' + plural(ev[i].indexSteps, 'index step') : '') + '.' :
              (ev[i].message ? short(ev[i].message, 160) : 'Done.');
            B({ kind: 'done', src: ['R'], dst: ['C'], tokens: isSel ? [{ edge: 'R>C', text: plural(rs, 'row'), cls: 'out' }] : [], view: { resMsg: isSel ? plural(rs, 'row') : (ev[i].returned !== null ? plural(ev[i].returned, 'row') + ' affected' : 'done') }, narr: msg, final: true,
              reported: { rowsRead: ev[i].rowsRead, indexSteps: ev[i].indexSteps } });
            break;
          }
          case 'error': {
            closeAccess();
            B({ kind: 'error', src: [], dst: ['E'], bad: 'E', narr: 'The engine refuses: ' + short(e.message, 160), view: { note: 'error', bad: 'E' } });
            break;
          }
          default:
        }
      }
      closeAccess();
    });
    // a runtime error after the statement started (events end with 'error')
    flush();

    // totals by replaying
    var vm = newVM(), tot = { examined: 0, steps: 0, probes: 0, passed: 0, grouped: 0, groups: 0, emitted: 0, written: 0 };
    function bank() { Object.keys(tot).forEach(function (k) { tot[k] += vm[k]; }); }
    beats.forEach(function (b) { if (b.view && b.view.reset) bank(); applyBeat(vm, b); });
    bank();
    return { beats: beats, totals: tot, direct: ctx ? ctx.direct : false };
  }

  /* ------------------------------------------------------------------ DOM part */
  function mk(tag, attrs, parent, text) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) n.setAttribute(k, attrs[k]);
    if (text !== undefined) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }
  function reduced() { try { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }

  function speedControl(opts) {
    opts = opts || {};
    var key = opts.key || 'co1005-sql-speed', idx = opts.initial === undefined ? 3 : opts.initial;
    try { var s = localStorage.getItem(key); if (typeof s === 'string' && /^[0-9]{1,2}$/.test(s) && +s < SPEEDS.length) idx = +s; } catch (e) { /* none */ }
    var wrap = document.createElement('div'); wrap.className = 'vn-speed sf-speed';
    var lab = document.createElement('label'); lab.className = 'field-label'; lab.textContent = 'Speed';
    var id = 'sf-speed-' + Math.floor(Math.random() * 1e6); lab.setAttribute('for', id);
    var rng = document.createElement('input'); rng.type = 'range'; rng.id = id; rng.min = 0; rng.max = SPEEDS.length - 1; rng.step = 1; rng.value = idx;
    var nm = document.createElement('span'); nm.className = 'vn-speed-name sf-speed-name';
    wrap.appendChild(lab); wrap.appendChild(rng); wrap.appendChild(nm);
    function paint() { nm.textContent = SPEEDS[idx].name + (SPEEDS[idx].ms ? ' · ' + (SPEEDS[idx].ms / 1000) + ' s per arrow' : ''); rng.setAttribute('aria-valuetext', SPEEDS[idx].name); }
    rng.addEventListener('input', function () { idx = +rng.value; paint(); try { localStorage.setItem(key, String(idx)); } catch (e) { /* none */ } if (opts.onChange) opts.onChange(idx); });
    paint();
    return { el: wrap, ms: function () { return SPEEDS[idx].ms; }, index: function () { return idx; } };
  }

  /* container: element to fill.  opts: {layout:'wide'|'tall', speedKey, onState(state)} */
  function create(container, opts) {
    opts = opts || {};
    var LY, uid = 'sf' + Math.floor(Math.random() * 1e6), layoutName = '';
    var svg, edgeEls, nodes, lines, tb, treeG, treeNote, treeParts, sb, stripG, stripTitle, stripEls, token, drawTree, ensureStrip, clearStrips;
    function pickLayout() {
      if (opts.layout === 'tall' || opts.layout === 'wide') return opts.layout;
      var w = container.clientWidth || (container.parentNode && container.parentNode.clientWidth) || 1000;
      return w < 640 ? 'tall' : 'wide';
    }
    function build(name) {
      layoutName = name; LY = LAYOUTS[name];
      container.classList.remove('sf-tall', 'sf-wide'); container.classList.add('sf-wrap', 'sf-' + name);
      if (svg && svg.parentNode) svg.parentNode.removeChild(svg);
    svg = mk('svg', { viewBox: '0 0 ' + LY.w + ' ' + LY.h, class: 'sf-svg', role: 'img',
      'aria-label': 'Block diagram of a database system: client, SQL parser, query planner, executor, table storage, index, constraints and log, and the result set' });
    var defs = mk('defs', {}, svg);
    Object.keys(CMP).forEach(function (id) {
      [['', 'sf-hd'], ['-on', 'sf-hd on']].forEach(function (m) {
        var mr = mk('marker', { id: uid + 'a' + id + m[0], viewBox: '0 0 10 10', refX: '8', refY: '5', markerWidth: '6', markerHeight: '6', orient: 'auto-start-reverse' }, defs);
        mk('path', { d: 'M 0 0 L 10 5 L 0 10 z', class: m[1] + ' sf-c-' + id }, mr);
      });
    });
    edgeEls = {};
    var gE = mk('g', {}, svg);
    Object.keys(LY.edges).forEach(function (k) { edgeEls[k] = mk('path', { d: LY.edges[k], class: 'sf-edge sf-c-' + k.charAt(0), 'marker-end': 'url(#' + uid + 'a' + k.charAt(0) + ')', 'data-edge': k }, gE); });

    nodes = {}; lines = {};
    Object.keys(LY.blocks).forEach(function (id) {
      var b = LY.blocks[id];
      var g = mk('g', { class: 'sf-node sf-n-' + id + ' sf-c-' + id, 'data-node': id }, svg);
      mk('rect', { x: b[0], y: b[1], width: b[2], height: b[3], rx: 9, class: 'sf-box' }, g);
      mk('text', { x: b[0] + 8, y: b[1] + 15, class: 'sf-name' }, g, (LY.titles && LY.titles[id]) || TITLES[id]);
      lines[id] = [];
      var nl = id === 'S' ? 0 : id === 'I' ? 0 : 3;
      for (var k = 0; k < nl; k++) lines[id].push(mk('text', { x: b[0] + 8, y: b[1] + 32 + k * 14, class: 'sf-val' }, g, ''));
      nodes[id] = g;
    });

    /* index (B-tree) drawing area */
    tb = LY.blocks.I; treeG = mk('g', { class: 'sf-tree' }, nodes.I);
    treeNote = mk('text', { x: tb[0] + tb[2] / 2, y: tb[1] + tb[3] - 9, class: 'sf-val sf-center' }, nodes.I, '');
    treeParts = null;
    drawTree = function (t) {
      while (treeG.firstChild) treeG.removeChild(treeG.firstChild);
      treeParts = null;
      if (!t) return;
      var L = t.leaves, x0 = tb[0] + 8, w = tb[2] - 16, rootW = Math.min(w, 150), rootX = tb[0] + (tb[2] - rootW) / 2, rootY = tb[1] + 24, rootH = 22;
      var leafH = tb[3] - 24 - rootH - 46, leafY = rootY + rootH + 22, gap = 4, leafW = (w - gap * (L - 1)) / L;
      var root = mk('rect', { x: rootX, y: rootY, width: rootW, height: rootH, rx: 5, class: 'sf-tn sf-root' }, treeG);
      mk('text', { x: rootX + rootW / 2, y: rootY + 15, class: 'sf-tt sf-center' }, treeG, L > 1 ? 'root · ' + (L - 1) + ' separator' + (L > 2 ? 's' : '') : 'root = leaf');
      var leaves = [], edges = [];
      for (var j = 0; j < L; j++) {
        var lx = x0 + j * (leafW + gap);
        edges.push(mk('line', { x1: rootX + rootW * (j + 0.5) / L, y1: rootY + rootH, x2: lx + leafW / 2, y2: leafY, class: 'sf-te' }, treeG));
        leaves.push(mk('rect', { x: lx, y: leafY, width: leafW, height: leafH, rx: 4, class: 'sf-tn sf-leaf' }, treeG));
        var bnd = t.bounds && t.bounds[j] !== undefined && t.bounds[j] !== null ? short(String(t.bounds[j]), Math.max(3, Math.floor(leafW / 6.5))) : '';
        mk('text', { x: lx + leafW / 2, y: leafY + 14, class: 'sf-tt sf-center' }, treeG, bnd ? '≥' + bnd : 'leaf');
        mk('text', { x: lx + leafW / 2, y: leafY + 27, class: 'sf-tt sf-center sf-dim' }, treeG, '~' + Math.max(1, Math.round(t.size / L)));
      }
      treeParts = { root: root, leaves: leaves, edges: edges };
    };

    /* storage strips */
    sb = LY.blocks.S; stripG = mk('g', { class: 'sf-strips' }, nodes.S);
    stripTitle = mk('text', { x: sb[0] + 8, y: sb[1] + 31, class: 'sf-val' }, nodes.S, '');
    stripEls = [];       // per slot: {cells:[rect], label, n}
    ensureStrip = function (slot, s) {
      var cur = stripEls[slot], nc = Math.max(1, Math.min(s.n, LY.maxCells));
      if (cur && cur.table === s.table && cur.nc === nc) return cur;
      if (cur) { stripG.removeChild(cur.g); }
      var rowH = LY.w > 500 ? 17 : 19, y = sb[1] + 38 + slot * (rowH + 7), cx = sb[0] + LY.cellX, cw = (sb[2] - LY.cellX - 10) / nc;
      var g = mk('g', {}, stripG), cells = [];
      mk('text', { x: sb[0] + 8, y: y + 12, class: 'sf-tt' }, g, short(s.label || s.table, LY.w > 500 ? 13 : 9));
      for (var c = 0; c < nc; c++) cells.push(mk('rect', { x: cx + c * cw, y: y, width: Math.max(1, cw - (cw > 4 ? 1.5 : 0.5)), height: rowH, rx: cw > 6 ? 2 : 0, class: 'sf-cell' }, g));
      if (s.n === 0) mk('text', { x: cx + 4, y: y + 12, class: 'sf-tt sf-dim' }, g, '(empty table)');
      cur = stripEls[slot] = { g: g, cells: cells, table: s.table, nc: nc };
      return cur;
    };
    clearStrips = function () { while (stripG.firstChild) stripG.removeChild(stripG.firstChild); stripEls = []; };

    token = mk('g', { class: 'sf-token', visibility: 'hidden' }, svg);
    mk('rect', { rx: 9, height: 20, y: -10 }, token);
    mk('text', { 'text-anchor': 'middle', y: 4 }, token);
      svgBox.appendChild(svg);
    }
    var svgBox = document.createElement('div'); svgBox.className = 'sf-svgbox';
    container.appendChild(svgBox);
    build(pickLayout());


    /* ---- controls + narration (fixed heights, so nothing jumps) */
    var ctl = document.createElement('div'); ctl.className = 'sf-controls';
    var btnPause = document.createElement('button'); btnPause.type = 'button'; btnPause.className = 'btn ghost sf-btn'; btnPause.textContent = 'Pause'; btnPause.disabled = true;
    var btnStep = document.createElement('button'); btnStep.type = 'button'; btnStep.className = 'btn ghost sf-btn'; btnStep.textContent = 'Step'; btnStep.disabled = true;
    btnStep.title = 'Pause and advance one arrow at a time';
    var btnSkip = document.createElement('button'); btnSkip.type = 'button'; btnSkip.className = 'btn ghost sf-btn'; btnSkip.textContent = 'Skip to end'; btnSkip.disabled = true;
    var speed = speedControl({ key: opts.speedKey || 'co1005-sql-speed', initial: 3 });
    ctl.appendChild(btnPause); ctl.appendChild(btnStep); ctl.appendChild(btnSkip); ctl.appendChild(speed.el);
    var narr = document.createElement('p'); narr.className = 'sf-narr'; narr.setAttribute('role', 'status'); narr.setAttribute('aria-live', 'polite');
    var prog = document.createElement('p'); prog.className = 'sf-prog';
    var legend = document.createElement('ul'); legend.className = 'sf-legend'; legend.setAttribute('aria-label', 'Colour key: one colour per component');
    LEGEND.forEach(function (l) { var li = document.createElement('li'); li.className = 'sf-c-' + l[0]; var sw = document.createElement('i'); sw.setAttribute('aria-hidden', 'true'); li.appendChild(sw); li.appendChild(document.createTextNode(l[1])); legend.appendChild(li); });
    container.appendChild(legend); container.appendChild(narr); container.appendChild(ctl); container.appendChild(prog);

    /* ---- rendering the view model */
    var vm = newVM();
    function render() {
      lines.C[0].textContent = vm.client ? short(vm.client, LY.w > 500 ? 15 : 11) : '';
      lines.C[1].textContent = vm.resMsg ? '← ' + short(vm.resMsg, 12) : '';
      lines.C[2].textContent = '';
      lines.P[0].textContent = short(vm.parser, LY.w > 500 ? 17 : 11);
      for (var k = 0; k < 3; k++) lines.L[k].textContent = vm.plan[k] ? short(vm.plan[k], LY.planChars) : '';
      lines.E[0].textContent = 'rows read ' + num(vm.examined) + '  ·  kept ' + num(vm.passed);
      lines.E[1].textContent = 'index steps ' + num(vm.steps) + '  ·  probes ' + num(vm.probes);
      lines.E[2].textContent = vm.grouped ? 'GROUP BY: ' + num(vm.grouped) + ' rows → ' + num(vm.groups) + ' buckets' : '';
      lines.R[0].textContent = vm.emitted ? num(vm.emitted) + ' row' + (vm.emitted === 1 ? '' : 's') : '—';
      for (k = 0; k < 2; k++) lines.R[k + 1].textContent = vm.rows[k] ? short(vm.rows[k], LY.w > 500 ? 22 : 12) : '';
      lines.K[0].textContent = 'checks ' + num(vm.checks);
      lines.K[1].textContent = 'wrote ' + num(vm.written);
      lines.K[2].textContent = 'log +' + num(vm.logs);
      // index
      var key = vm.tree ? vm.tree.name + '|' + vm.tree.size + '|' + (vm.tree.bounds || []).join(',') : '';
      if (render.treeKey !== key) { render.treeKey = key; drawTree(vm.tree); }
      if (treeParts) {
        var on = vm.treeOn;
        treeParts.root.classList.toggle('on', !!on);
        treeParts.leaves.forEach(function (lf, j) { lf.classList.toggle('on', !!on && on.leaf === j); lf.classList.toggle('walk', !!on && on.leaf === j && on.phase === 'walk'); });
        treeParts.edges.forEach(function (ed, j) { ed.classList.toggle('on', !!on && on.leaf === j); });
        treeNote.textContent = on ? (on.phase === 'search' ? 'compare entry #' + num(on.pos + 1) : 'walking: entry #' + num(on.pos + 1)) : (vm.treeMsg || (vm.tree && vm.tree.built ? 'built: ' + num(vm.tree.size) + ' keys' : ''));
      } else treeNote.textContent = vm.treeMsg || (vm.examined || vm.plan.length ? 'not used by this plan' : 'idle');
      nodes.I.classList.toggle('sf-idle', !vm.tree && !!vm.plan.length);
      // storage
      var live = {};
      vm.slots.forEach(function (s, slot) {
        if (!s) return;
        var st = ensureStrip(slot, s); live[slot] = 1;
        var nc = st.nc;
        var lit = {}, hit = {}, wr = {}, del = {}, cur = -1;
        ['lit', 'hit', 'wr', 'del'].forEach(function (t) { var o = t === 'lit' ? lit : t === 'hit' ? hit : t === 'wr' ? wr : del; Object.keys(s[t]).forEach(function (p) { o[cellOf(+p, Math.max(s.n, 1), nc)] = 1; }); });
        if (s.cur >= 0) cur = cellOf(s.cur, Math.max(s.n, 1), nc);
        st.cells.forEach(function (c, ci) {
          var cls = 'sf-cell' + (lit[ci] ? ' lit' : '') + (hit[ci] ? ' hit' : '') + (wr[ci] ? ' wr' : '') + (del[ci] ? ' del' : '') + (ci === cur ? ' cur' : '');
          if (c.getAttribute('class') !== cls) c.setAttribute('class', cls);
        });
      });
      Object.keys(stripEls).forEach(function (sl) { if (!live[sl] && stripEls[sl]) { stripG.removeChild(stripEls[sl].g); delete stripEls[sl]; } });
      var first = vm.slots[0];
      stripTitle.textContent = first ? ((first.table || '') + ' · ' + num(first.n) + ' rows' + (first.n > LY.maxCells ? ' (1 cell ≈ ' + Math.ceil(first.n / LY.maxCells) + ' rows)' : '')) : 'no table opened yet';
      Object.keys(nodes).forEach(function (id) { nodes[id].classList.toggle('sf-bad', vm.bad === id); });
      var tips = vm.examined + vm.steps;
      if (tips || vm.emitted) {
        prog.innerHTML = 'Counters: <span class="sf-c-S"><i></i>' + num(vm.examined) + ' row' + (vm.examined === 1 ? '' : 's') + ' read from the table</span> <span class="sf-c-I"><i></i>' + num(vm.steps) + ' index step' + (vm.steps === 1 ? '' : 's') +
          '</span> <span class="sf-c-R"><i></i>' + num(vm.emitted) + ' row' + (vm.emitted === 1 ? '' : 's') + ' in the result</span>';
      } else prog.textContent = 'Counters: run a query to see the work it causes.';
    }
    render.treeKey = '';

    /* ---- playback */
    var player = { beats: [], idx: 0, state: 'idle', stepOnce: false, runId: 0, raf: 0, timer: 0, marked: [], activeEdges: [], resolveBeat: null };
    function setState(s) {
      player.state = s;
      var live = s === 'playing' || s === 'paused';
      btnPause.disabled = !live; btnStep.disabled = !live; btnSkip.disabled = !live;
      btnPause.textContent = s === 'paused' ? 'Resume' : 'Pause';
      btnPause.setAttribute('aria-pressed', s === 'paused' ? 'true' : 'false');
      if (s === 'idle' && player.relayout) relayout();
      if (opts.onState) opts.onState(s);
    }
    function clearMarks() {
      player.marked.forEach(function (n) { n.classList.remove('sf-src', 'sf-dst'); });
      player.marked = [];
      player.activeEdges.forEach(function (e) { e.classList.remove('on'); e.style.removeProperty('--c'); e.setAttribute('marker-end', 'url(#' + uid + 'a' + e.getAttribute('data-edge').charAt(0) + ')'); });
      player.activeEdges = [];
      token.setAttribute('visibility', 'hidden');
    }
    function mark(id, cls) { if (nodes[id]) { nodes[id].classList.add(cls); player.marked.push(nodes[id]); } }
    function stopTimers() { if (player.raf) cancelAnimationFrame(player.raf); player.raf = 0; if (player.timer) clearTimeout(player.timer); player.timer = 0; if (player.resolveBeat) { var r = player.resolveBeat; player.resolveBeat = null; r(); } }

    /* the arrow and the chip take the colour of the block that holds what is travelling (col; default = the source block) */
    function moveToken(edgeKey, text, col, ms) {
      return new Promise(function (resolve) {
        var path = edgeEls[edgeKey];
        if (!path) { resolve(); return; }
        col = col || edgeKey.charAt(0);
        path.classList.add('on'); path.style.setProperty('--c', 'var(--cmp-' + CMP[col] + ')'); path.setAttribute('marker-end', 'url(#' + uid + 'a' + col + '-on)'); player.activeEdges.push(path);
        if (reduced()) { player.timer = setTimeout(function () { player.timer = 0; resolve(); }, Math.min(ms, 350)); player.resolveBeat = resolve; return; }
        var len = path.getTotalLength(), r = token.querySelector('rect'), t = token.querySelector('text'), w = Math.max(24, text.length * 6.6 + 14);
        t.textContent = text; r.setAttribute('width', w); r.setAttribute('x', -w / 2);
        token.setAttribute('class', 'sf-token sf-c-' + col); token.setAttribute('visibility', 'visible');
        var t0 = null;
        player.resolveBeat = resolve;
        function frame(ts) {
          if (t0 === null) t0 = ts;
          var k = Math.min(1, (ts - t0) / ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
          var pt = path.getPointAtLength(len * e), px = Math.max(w / 2 + 2, Math.min(LY.w - w / 2 - 2, pt.x));
          token.setAttribute('transform', 'translate(' + px.toFixed(1) + ' ' + pt.y.toFixed(1) + ')');
          if (k < 1) player.raf = requestAnimationFrame(frame); else { player.raf = 0; player.resolveBeat = null; resolve(); }
        }
        player.raf = requestAnimationFrame(frame);
      });
    }
    function apply(b) {
      applyBeat(vm, b);
      render();
    }

    /* a fast-forwarded sweep: the token crawls along the arrow while the cells light up and the counters climb in
       proportion to the rows it stands for (so a full scan of a big table visibly takes much longer than an index lookup) */
    function playSweep(b, dur, runId) {
      return new Promise(function (resolve) {
        var K = 24, i = 0, multi = (b.view && b.view.multi) || [], fx = b.fx || {}, tk = b.tokens[0];
        var tokP = tk ? moveToken(tk.edge, tk.text, tk.col, dur) : null;
        player.resolveBeat = resolve;
        function chunk(j) {
          var o = { fx: {}, view: { multi: [] } };
          Object.keys(fx).forEach(function (k) { o.fx[k] = Math.floor(fx[k] * (j + 1) / K) - Math.floor(fx[k] * j / K); });
          multi.forEach(function (m) { o.view.multi.push({ t: m.t, slot: m.slot, pos: m.pos.slice(Math.floor(m.pos.length * j / K), Math.floor(m.pos.length * (j + 1) / K)) }); });
          applyBeat(vm, o); render();
        }
        function tick() {
          if (runId !== player.runId) { resolve(); return; }
          chunk(i); i++;
          if (i < K) player.timer = setTimeout(tick, dur / K);
          else { player.timer = 0; if (tokP) tokP.then(function () { resolve(); }); else resolve(); }
        }
        player.timer = setTimeout(tick, dur / K);
      });
    }
    function playBeat(b, runId) {
      return new Promise(function (resolve) {
        clearMarks();
        narr.textContent = b.narr || '';
        (b.src || []).forEach(function (id) { mark(id, 'sf-src'); });
        (b.dst || []).forEach(function (id) { mark(id, 'sf-dst'); });
        var ms = speed.ms();
        if (ms === 0) { apply(b); resolve(); return; }
        var unit = ms * (b.small ? 0.45 : 1);
        if (b.units) { playSweep(b, ms * b.units, runId).then(resolve); return; }
        if (!b.tokens.length) {
          apply(b);
          player.timer = setTimeout(function () { player.timer = 0; player.resolveBeat = null; resolve(); }, unit * Math.max(0.6, b.weight * 0.6));
          player.resolveBeat = resolve;
          return;
        }
        var chain = Promise.resolve();
        b.tokens.forEach(function (tk) { chain = chain.then(function () { if (runId !== player.runId) return; return moveToken(tk.edge, tk.text, tk.col, unit * Math.max(1, b.weight * 0.6)); }); });
        chain.then(function () { if (runId !== player.runId) { resolve(); return; } apply(b); resolve(); });
      });
    }

    function pump(runId) {
      if (runId !== player.runId) return;
      if (player.idx >= player.beats.length) { finish(); return; }
      if (player.state === 'paused' && !player.stepOnce) return;
      var oneShot = player.stepOnce; player.stepOnce = false;
      var b = player.beats[player.idx++];
      playBeat(b, runId).then(function () {
        if (runId !== player.runId) return;
        if (oneShot) { clearMarksKeepText(); if (player.idx >= player.beats.length) { finish(); return; } setState('paused'); return; }
        var gap = speed.ms() ? Math.round(speed.ms() * 0.12) : 0;
        if (gap) player.timer = setTimeout(function () { player.timer = 0; pump(runId); }, gap); else pump(runId);
      });
    }
    function clearMarksKeepText() { clearMarks(); }
    function finish() {
      clearMarks(); setState('idle');
      var done = player.onDone; player.onDone = null; if (done) done();
    }

    function relayout() {
      if (opts.layout === 'tall' || opts.layout === 'wide') return;
      var nm = pickLayout();
      if (nm === layoutName) { player.relayout = false; return; }
      if (player.state !== 'idle') { player.relayout = true; return; }
      player.relayout = false; build(nm); render.treeKey = '__'; render();
    }
    if (typeof ResizeObserver !== 'undefined') { try { new ResizeObserver(relayout).observe(container); } catch (e) { /* none */ } }
    else window.addEventListener('resize', relayout);

    var api = {
      svg: svg, speed: speed, vm: function () { return vm; },
      /* animate a trace; returns a promise that resolves when the last beat has landed (or the run was replaced) */
      play: function (trace) {
        stopTimers(); clearMarks();
        player.runId++; player.state = 'idle'; relayout();
        var runId = player.runId;
        var c = compile(trace);
        player.beats = c.beats; player.idx = 0; player.stepOnce = false; player.totals = c.totals;
        vm = newVM(); clearStrips(); render.treeKey = '__'; render();
        if (!c.beats.length) { narr.textContent = ''; setState('idle'); return Promise.resolve(c); }
        setState('playing');
        return new Promise(function (resolve) { player.onDone = function () { resolve(c); }; pump(runId); });
      },
      toggle: function () {
        if (player.state === 'playing') setState('paused');
        else if (player.state === 'paused') { setState('playing'); pump(player.runId); }
      },
      step: function () {
        if (player.state === 'playing') { setState('paused'); return; }
        if (player.state === 'paused') { player.stepOnce = true; pump(player.runId); }
      },
      skip: function () {
        if (player.state === 'idle') return;
        var id = player.runId; stopTimers(); clearMarks(); player.runId++;
        void id;
        while (player.idx < player.beats.length) apply(player.beats[player.idx++]);
        var last = player.beats[player.beats.length - 1]; if (last) narr.textContent = last.narr;
        finish();
      },
      reset: function () { stopTimers(); clearMarks(); player.runId++; player.beats = []; player.idx = 0; vm = newVM(); clearStrips(); render.treeKey = '__'; render(); narr.textContent = opts.idleText || 'Run a query: it will travel through the database from the client to the result set.'; setState('idle'); },
      state: function () { return player.state; }
    };
    btnPause.addEventListener('click', api.toggle);
    btnStep.addEventListener('click', api.step);
    btnSkip.addEventListener('click', api.skip);
    narr.textContent = opts.idleText || 'Run a query: it will travel through the database from the client to the result set.';
    render();
    return api;
  }

  var exp = { CMP: CMP, create: create, compile: compile, applyBeat: applyBeat, newVM: newVM, speedControl: speedControl, SPEEDS: SPEEDS, LAYOUTS: LAYOUTS, leafOf: leafOf, cellOf: cellOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = exp; else global.SqlFlow = exp;
})(typeof window !== 'undefined' ? window : this);
