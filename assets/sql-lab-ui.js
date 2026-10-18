/* SQL Query Lab — user interface (Chapter 10).  Mount point: #sql-root.
   The engine (assets/sql-lab.js, window.SqlLab) does all the work; this file only draws it. */
(function () {
  'use strict';
  var root = document.getElementById('sql-root');
  var Lab = window.SqlLab;
  if (!root || !Lab) return;

  var state = { dataset: 'university', db: null, example: null };
  var $ = function (sel, el) { return (el || root).querySelector(sel); };
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; }
  function num(n) { return Number(n).toLocaleString('en-US'); }
  function cell(v) {
    if (v === null || v === undefined) return '<em class="sq-null">NULL</em>';
    if (typeof v === 'number') return esc(Number.isInteger(v) ? v : Math.round(v * 1e6) / 1e6);
    return esc(v);
  }

  /* ---------- skeleton */
  root.innerHTML =
    '<div class="sq-bar">' +
      '<label class="sq-field">Database <select id="sq-dataset"></select></label>' +
      '<button type="button" class="btn ghost sq-reset" id="sq-reset" title="Throw away all changes and reload this database">Reset database</button>' +
      '<span class="sq-sim">A small SQL engine written for this course and running in your browser. It follows standard SQL, but it is a teaching simulation, not MySQL or Oracle.</span>' +
    '</div>' +
    '<p class="sq-blurb" id="sq-blurb"></p>' +
    '<div class="sq-grid">' +
      '<div class="sq-left">' +
        '<div class="sq-examples" id="sq-examples" role="group" aria-label="Example queries"></div>' +
        '<p class="sq-exnote" id="sq-exnote" aria-live="polite"></p>' +
        '<label class="sq-label" for="sq-editor">SQL <span>(Ctrl/Cmd + Enter runs it; separate statements with ;)</span></label>' +
        '<textarea id="sq-editor" class="sq-editor" rows="8" spellcheck="false" autocapitalize="off" autocomplete="off"></textarea>' +
        '<div class="sq-actions"><button type="button" class="btn primary" id="sq-run">&#9654; Run</button>' +
        '<button type="button" class="btn ghost" id="sq-clear">Clear</button><span class="sq-status" id="sq-status" role="status" aria-live="polite"></span></div>' +
        '<div id="sq-result" class="sq-result"></div>' +
        '<div id="sq-plan" class="sq-plan"></div>' +
      '</div>' +
      '<aside class="sq-schema" aria-label="Schema browser"><h4>Schema browser</h4><div id="sq-schema"></div></aside>' +
    '</div>';

  var selDs = $('#sq-dataset');
  Object.keys(Lab.DATASETS).forEach(function (k) { var o = el('option'); o.value = k; o.textContent = Lab.DATASETS[k].title; selDs.appendChild(o); });
  var editor = $('#sq-editor'), status = $('#sq-status');

  function load(name, keepText) {
    state.dataset = name; state.db = Lab.createDatabase(name);
    selDs.value = name;
    $('#sq-blurb').textContent = Lab.DATASETS[name].blurb;
    var box = $('#sq-examples'); box.innerHTML = '';
    Lab.DATASETS[name].examples.forEach(function (ex, i) {
      var b = el('button', 'sq-ex'); b.type = 'button'; b.textContent = ex.label;
      b.addEventListener('click', function () { editor.value = ex.sql; $('#sq-exnote').textContent = ex.note; state.example = i; run(); });
      box.appendChild(b);
    });
    if (!keepText) { editor.value = Lab.DATASETS[name].examples[0].sql; $('#sq-exnote').textContent = Lab.DATASETS[name].examples[0].note; }
    $('#sq-result').innerHTML = ''; $('#sq-plan').innerHTML = '';
    say('Database "' + Lab.DATASETS[name].title.split(' — ')[0] + '" loaded. Press Run.', false);
    drawSchema();
  }
  function say(msg, bad) { status.textContent = msg; status.className = 'sq-status' + (bad ? ' sq-bad' : ''); }

  function drawSchema() {
    var box = $('#sq-schema'); box.innerHTML = '';
    var d = state.db.describe();
    if (!d.length) { box.appendChild(el('p', 'sq-empty', 'No tables yet. Use CREATE TABLE.')); return; }
    d.forEach(function (t) {
      var det = el('details'); det.open = true;
      var s = el('summary', null, '<strong>' + esc(t.name) + '</strong> <span class="sq-count">' + num(t.rowCount) + ' rows</span>');
      det.appendChild(s);
      var ul = el('ul', 'sq-cols');
      t.columns.forEach(function (c) {
        var badges = '';
        if (c.pk) badges += '<span class="sq-badge sq-pk" title="Primary key: unique, never NULL">PK</span>';
        if (c.fk) badges += '<span class="sq-badge sq-fk" title="Foreign key: points at a row of ' + esc(c.fk) + '">FK &rarr; ' + esc(c.fk) + '</span>';
        if (c.unique) badges += '<span class="sq-badge" title="UNIQUE: no two rows may share this value">UNIQUE</span>';
        if (c.notNull) badges += '<span class="sq-badge" title="NOT NULL: a value is required">NOT NULL</span>';
        ul.appendChild(el('li', null, '<code>' + esc(c.name) + '</code> <span class="sq-type">' + esc(c.type) + '</span> ' + badges));
      });
      det.appendChild(ul);
      if (t.compositeFks.length || t.checks.length) {
        var extra = el('p', 'sq-extra');
        extra.innerHTML = t.compositeFks.map(function (x) { return '<span class="sq-badge sq-fk">FK ' + esc(x) + '</span>'; }).join(' ') + ' ' +
          t.checks.map(function (x) { return '<span class="sq-badge">CHECK ' + esc(x) + '</span>'; }).join(' ');
        det.appendChild(extra);
      }
      var ix = t.indexes.map(function (i) { return '<span class="sq-badge sq-ix" title="' + (i.auto ? 'Built automatically for a key' : 'Built by CREATE INDEX') + '">' + (i.auto ? 'auto ' : '') + 'index on ' + esc(i.column) + '</span>'; });
      det.appendChild(el('p', 'sq-extra', ix.length ? ix.join(' ') : '<span class="sq-noidx">no index</span>'));
      box.appendChild(det);
    });
  }

  /* ---------- running */
  function resultTable(r) {
    var wrap = el('div', 'tbl-scroll sq-tablewrap');
    var tb = '<table class="tbl sq-table"><caption class="sq-cap">' + num(r.rows.length) + ' row' + (r.rows.length === 1 ? '' : 's') + ' returned</caption><thead><tr>' +
      r.columns.map(function (c) { return '<th scope="col">' + esc(c) + '</th>'; }).join('') + '</tr></thead><tbody>';
    var shown = r.rows.slice(0, 200);
    shown.forEach(function (row) { tb += '<tr>' + row.map(function (v) { return '<td' + (typeof v === 'number' ? ' class="sq-num"' : '') + '>' + cell(v) + '</td>'; }).join('') + '</tr>'; });
    if (!r.rows.length) tb += '<tr><td colspan="' + r.columns.length + '" class="sq-none">No rows matched.</td></tr>';
    tb += '</tbody></table>';
    if (r.rows.length > shown.length) tb += '<p class="sq-more">Showing the first ' + shown.length + ' of ' + num(r.rows.length) + ' rows.</p>';
    wrap.innerHTML = tb; return wrap;
  }

  function explain(plan, stats) {
    var lines = [];
    plan.forEach(function (p) {
      if (p.kind === 'scan') {
        lines.push('<li><strong>Full table scan of ' + esc(p.table) + '</strong>' + (p.sub ? ' (inside a sub-query)' : '') + ': ' + (p.loops > 1 ? 'repeated ' + num(p.loops) + ' times, ' : '') +
          'the database read ' + num(p.rowsRead) + ' row' + (p.rowsRead === 1 ? '' : 's') + ' to keep ' + num(p.matches) + '. There was no index it could use, so every row had to be looked at.</li>');
      } else if (p.kind === 'search') {
        lines.push('<li><strong>Index lookup on ' + esc(p.table) + '</strong> using <code>' + esc(p.index) + '</code> (' + esc(p.cond) + ')' + (p.sub ? ' (inside a sub-query)' : '') + ': ' + (p.loops > 1 ? num(p.loops) + ' lookups, ' : '') +
          num(p.indexSteps) + ' index step' + (p.indexSteps === 1 ? '' : 's') + ' (binary search + walking along the sorted entries) and only ' + num(p.rowsRead) + ' row' + (p.rowsRead === 1 ? '' : 's') + ' read, instead of ' + num(p.loops * p.tableRows) + '.</li>');
      } else {
        lines.push('<li><strong>' + esc(p.title) + '</strong>: ' + esc(p.detail) + '.</li>');
      }
    });
    return lines.join('');
  }

  function planPanel(res) {
    var box = $('#sq-plan'); box.innerHTML = '';
    if (!res || !res.plan || !res.plan.length) { box.innerHTML = '<h4>Query plan</h4><p class="sq-empty">Run a SELECT, UPDATE or DELETE to see how the database found its rows.</p>'; return; }
    var st = res.stats, plan = res.plan;
    var full = Math.max(st.fullScanWork, 1), pct = Math.min(100, Math.max(1.5, st.work * 100 / full));
    var usedIndex = plan.some(function (p) { return p.kind === 'search'; });
    var head = '<h4>Query plan <span class="sq-sub">what the database actually did</span></h4>';
    var meter = '<div class="sq-meter" role="img" aria-label="Work done: ' + num(st.work) + ' out of ' + num(st.fullScanWork) + ' for a full scan">' +
      '<div class="sq-meter-row"><span>Rows read: <b>' + num(st.rowsRead) + '</b></span><span>Index steps: <b>' + num(st.indexSteps) + '</b></span><span>Total work: <b>' + num(st.work) + '</b></span>' +
      '<span>Same query with full scans only: <b>' + num(st.fullScanWork) + '</b></span></div>' +
      '<div class="sq-bar-track"><div class="sq-bar-fill' + (usedIndex ? ' sq-fast' : '') + '" style="width:' + pct.toFixed(1) + '%"></div></div>' +
      '<div class="sq-meter-note">' + (usedIndex ? (st.work < st.fullScanWork ? 'The index cut the work to ' + (st.work * 100 / full).toFixed(1) + '% of a full scan.' : 'An index was used, but here it did not save work.') : 'No index used: work grows with the size of the table.') + '</div></div>';
    var rows = '';
    plan.forEach(function (p, i) {
      if (p.kind === 'note') { rows += '<tr class="sq-planrow"><td>' + (i + 1) + '</td><td colspan="5">' + esc(p.title) + ': ' + esc(p.detail) + '</td></tr>'; return; }
      rows += '<tr><td>' + (i + 1) + '</td><td><code>' + (p.kind === 'scan' ? 'SCAN ' : 'SEARCH ') + esc(p.table) + (p.alias !== p.table ? ' ' + esc(p.alias) : '') + (p.kind === 'search' ? ' USING INDEX ' + esc(p.index) + ' (' + esc(p.cond) + ')' : '') + '</code></td>' +
        '<td class="sq-num">' + num(p.loops) + '</td><td class="sq-num">' + num(p.tableRows) + '</td><td class="sq-num">' + num(p.rowsRead) + '</td><td class="sq-num">' + num(p.indexSteps) + '</td></tr>';
    });
    var tbl = '<div class="tbl-scroll"><table class="tbl sq-plantable"><caption class="sq-cap">EXPLAIN-style plan</caption><thead><tr><th scope="col">#</th><th scope="col">Step</th><th scope="col">Times run</th><th scope="col">Table size</th><th scope="col">Rows read</th><th scope="col">Index steps</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    var plain = '<ol class="sq-plain">' + explain(plan, st) + '</ol>';
    var wr = st.indexWrites ? '<p class="sq-extra">Write cost: ' + num(st.indexWrites) + ' index ' + (st.indexWrites === 1 ? 'entry' : 'entries') + ' had to be updated as well.</p>' : '';
    box.innerHTML = head + meter + tbl + plain + wr;
  }

  function run() {
    var sql = editor.value;
    var out = state.db.run(sql);
    var box = $('#sq-result'); box.innerHTML = '';
    var lastPlan = null, lastSelect = null, msgs = [];
    out.results.forEach(function (r) {
      if (r.kind === 'select') { lastSelect = r; lastPlan = r; }
      else if (r.kind === 'explain') { lastPlan = r; msgs.push({ ok: true, text: 'EXPLAIN: see the plan below (the query was really run to count the rows).' }); }
      else { msgs.push({ ok: true, text: r.message }); if (r.plan && r.plan.length) lastPlan = r; }
    });
    msgs.forEach(function (m) { box.appendChild(el('p', 'sq-msg', esc(m.text))); });
    if (lastSelect) box.appendChild(resultTable(lastSelect));
    if (out.error) {
      box.appendChild(el('p', 'sq-err', '<strong>Error' + (out.error.of > 1 ? ' in statement ' + out.error.statement + ' of ' + out.error.of : '') + ':</strong> ' + esc(out.error.message) +
        (out.results.length ? '<br><span class="sq-extra">The ' + out.results.length + ' statement(s) before it did run.</span>' : '')));
      say('Error: ' + out.error.message, true);
    } else {
      var n = out.results.length, last = out.results[n - 1];
      say(last.kind === 'select' ? last.rows.length + ' row(s) returned; ' + num(last.stats.rowsRead) + ' row(s) read from the table.' : (n > 1 ? n + ' statements ran. ' : '') + (last.message || 'Done.'), false);
    }
    planPanel(lastPlan);
    drawSchema();
    var cap = box.querySelector('.sq-err'); if (cap && cap.scrollIntoView && false) cap.scrollIntoView();
  }

  selDs.addEventListener('change', function () { load(selDs.value); });
  $('#sq-reset').addEventListener('click', function () { load(state.dataset, true); say('Database reset to its original contents.', false); });
  $('#sq-run').addEventListener('click', run);
  $('#sq-clear').addEventListener('click', function () { editor.value = ''; editor.focus(); });
  editor.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run(); }
    else if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.metaKey && false) { e.preventDefault(); }
  });

  load('university');
  planPanel(null);
})();
