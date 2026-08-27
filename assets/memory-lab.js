/* Memory Lab — mini app for CO1005 Supplementary Topic S6.
   Shows what an array really is: a base address plus index arithmetic.
   Panel 1: a fixed memory scene — limit | a[5] | balance — where writing
   a[i] out of bounds visibly corrupts the neighbouring variable.
   Panel 2: a 2-D array explorer showing the row-major formula.
   Mount point: #memory-root. Pure engine exported for Node tests. */
(function (global) {
  'use strict';

  var INT = 4; // sizeof(int)

  function addrOf(base, i, size) { return base + i * size; }
  function flatIndex(r, c, cols) { return r * cols + c; }

  // the panel-1 scene: limit at base, then a[5], then balance
  function makeScene() {
    var base = 1000;
    return {
      base: base,
      cells: [
        { name: 'limit', addr: base, value: 99 },
        { name: 'a[0]', addr: base + INT, value: 10 },
        { name: 'a[1]', addr: base + 2 * INT, value: 20 },
        { name: 'a[2]', addr: base + 3 * INT, value: 30 },
        { name: 'a[3]', addr: base + 4 * INT, value: 40 },
        { name: 'a[4]', addr: base + 5 * INT, value: 50 },
        { name: 'balance', addr: base + 6 * INT, value: 500 }
      ],
      arrayBase: base + INT
    };
  }

  /* classify a write a[i] = v: which cell does it really hit? */
  function writeAt(scene, i, v) {
    var addr = addrOf(scene.arrayBase, i, INT);
    var cell = null;
    for (var k = 0; k < scene.cells.length; k++)
      if (scene.cells[k].addr === addr) { cell = scene.cells[k]; break; }
    if (!cell) return { kind: 'wild', addr: addr };
    cell.value = v;
    if (i >= 0 && i < 5) return { kind: 'ok', cell: cell, addr: addr };
    return { kind: 'corrupt', cell: cell, addr: addr };
  }

  var MemoryLab = { INT: INT, addrOf: addrOf, flatIndex: flatIndex, makeScene: makeScene, writeAt: writeAt };

  // ───────────── UI ─────────────
  function mount() {
    var host = document.getElementById('memory-root');
    if (!host) return;
    function el(tag, cls, html) {
      var n = document.createElement(tag);
      if (cls) n.className = cls;
      if (html !== undefined) n.innerHTML = html;
      return n;
    }
    function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

    // ── Panel 1: the corruption demo ──
    var scene = makeScene();
    var flash = null; // cell name to flash

    var p1 = el('div', 'run-panel');
    p1.appendChild(el('h4', '', 'Panel 1 — write into a[i] and watch the neighbourhood'));
    p1.appendChild(el('div', 'mem-decl mono',
      'int limit = 99;&nbsp;&nbsp;&nbsp;int a[5] = {10, 20, 30, 40, 50};&nbsp;&nbsp;&nbsp;int balance = 500;'));
    var grid = el('div', 'mem-grid');
    p1.appendChild(grid);

    var row = el('div', 'ex-actions');
    row.appendChild(el('span', 'field-label', 'a['));
    var idxIn = el('input'); idxIn.type = 'text'; idxIn.className = 'mem-in'; idxIn.value = '2';
    idxIn.setAttribute('aria-label', 'Array index');
    row.appendChild(idxIn);
    row.appendChild(el('span', 'field-label', '] ='));
    var valIn = el('input'); valIn.type = 'text'; valIn.className = 'mem-in'; valIn.value = '77';
    valIn.setAttribute('aria-label', 'Value to store');
    row.appendChild(valIn);
    var writeBtn = el('button', 'btn primary', 'Store it');
    row.appendChild(writeBtn);
    var resetBtn = el('button', 'btn ghost small', '↺ Reset memory');
    row.appendChild(resetBtn);
    p1.appendChild(row);
    var formula = el('div', 'mem-formula mono');
    p1.appendChild(formula);
    var verdict = el('div', 'sim-status');
    verdict.setAttribute('role', 'status');
    verdict.textContent = 'Every write becomes address arithmetic. Try index 2 — then try index 5, and −1.';
    p1.appendChild(verdict);
    host.appendChild(p1);

    function renderGrid() {
      grid.innerHTML = scene.cells.map(function (c) {
        var arr = c.name[0] === 'a';
        return '<div class="mem-cell' + (arr ? ' is-arr' : ' is-var') + (flash === c.name ? ' flash' : '') + '">' +
          '<span class="mc-addr">' + c.addr + '</span>' +
          '<span class="mc-val">' + c.value + '</span>' +
          '<span class="mc-name">' + esc(c.name) + '</span></div>';
      }).join('');
    }

    writeBtn.addEventListener('click', function () {
      var i = parseInt(idxIn.value, 10), v = parseInt(valIn.value, 10);
      if (Number.isNaN(i) || Number.isNaN(v)) {
        verdict.className = 'sim-status error';
        verdict.textContent = 'Index and value must be whole numbers.';
        return;
      }
      var addr = addrOf(scene.arrayBase, i, INT);
      formula.innerHTML = '&amp;a[' + i + '] = ' + scene.arrayBase + ' + ' + i + ' × ' + INT + ' = <strong>' + addr + '</strong>';
      var r = writeAt(scene, i, v);
      flash = r.cell ? r.cell.name : null;
      renderGrid();
      if (r.kind === 'ok') {
        verdict.className = 'sim-status done';
        verdict.textContent = 'In bounds: a[' + i + '] at address ' + addr + ' now holds ' + v + '.';
      } else if (r.kind === 'corrupt') {
        verdict.className = 'sim-status error';
        verdict.textContent = 'OUT OF BOUNDS — address ' + addr + ' belongs to “' + r.cell.name +
          '”, which you just silently overwrote with ' + v + '. Real C++ would not say a word. This bug class is called a buffer overflow.';
      } else {
        verdict.className = 'sim-status error';
        verdict.textContent = 'Address ' + addr + ' is outside this little scene entirely — in a real program you would be trampling some other part of memory (or crashing).';
      }
    });
    resetBtn.addEventListener('click', function () {
      scene = makeScene(); flash = null;
      formula.innerHTML = '';
      verdict.className = 'sim-status';
      verdict.textContent = 'Memory restored.';
      renderGrid();
    });
    renderGrid();

    // ── Panel 2: row-major explorer ──
    var ROWS = 3, COLS = 4, BASE2 = 2000;
    var p2 = el('div', 'run-panel');
    p2.style.marginTop = '1.1rem';
    p2.appendChild(el('h4', '', 'Panel 2 — int b[3][4]: the grid is a lie (a friendly one)'));
    var pick = el('div', 'ex-actions');
    pick.appendChild(el('span', 'field-label', 'row'));
    var rSel = el('select', 'preset-select');
    for (var r = 0; r < ROWS; r++) { var o = el('option'); o.value = r; o.textContent = String(r); rSel.appendChild(o); }
    pick.appendChild(rSel);
    pick.appendChild(el('span', 'field-label', 'col'));
    var cSel = el('select', 'preset-select');
    for (var c = 0; c < COLS; c++) { var o2 = el('option'); o2.value = c; o2.textContent = String(c); cSel.appendChild(o2); }
    pick.appendChild(cSel);
    p2.appendChild(pick);
    var gridView = el('div', 'mem-2d');
    p2.appendChild(gridView);
    p2.appendChild(el('label', 'field-label', 'The same 12 elements as memory really stores them — one row after another:'));
    var flatView = el('div', 'mem-grid');
    p2.appendChild(flatView);
    var formula2 = el('div', 'mem-formula mono');
    p2.appendChild(formula2);
    host.appendChild(p2);

    function render2d() {
      var sr = +rSel.value, sc = +cSel.value;
      var flat = flatIndex(sr, sc, COLS);
      var html = '';
      for (var r = 0; r < ROWS; r++) {
        html += '<div class="mem-2d-row">';
        for (var c = 0; c < COLS; c++) {
          html += '<div class="mem-cell is-arr' + (r === sr && c === sc ? ' flash' : '') + '">' +
            '<span class="mc-val">b[' + r + '][' + c + ']</span></div>';
        }
        html += '</div>';
      }
      gridView.innerHTML = html;
      var cells = '';
      for (var k = 0; k < ROWS * COLS; k++) {
        cells += '<div class="mem-cell is-arr' + (k === flat ? ' flash' : '') + '">' +
          '<span class="mc-addr">' + (BASE2 + k * INT) + '</span>' +
          '<span class="mc-val">b[' + Math.floor(k / COLS) + '][' + (k % COLS) + ']</span>' +
          '<span class="mc-name">#' + k + '</span></div>';
      }
      flatView.innerHTML = cells;
      formula2.innerHTML = 'flat position = row × COLS + col = ' + sr + ' × ' + COLS + ' + ' + sc +
        ' = <strong>' + flat + '</strong> &nbsp;→&nbsp; address = ' + BASE2 + ' + ' + flat + ' × ' + INT +
        ' = <strong>' + (BASE2 + flat * INT) + '</strong>';
    }
    rSel.addEventListener('change', render2d);
    cSel.addEventListener('change', render2d);
    render2d();
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = MemoryLab;
  else {
    global.MemoryLab = MemoryLab;
    document.addEventListener('DOMContentLoaded', mount);
  }
})(typeof window !== 'undefined' ? window : this);
