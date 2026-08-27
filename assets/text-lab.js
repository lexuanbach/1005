/* Text Inspector — mini app for CO1005 Supplementary Topic S8.
   Type any text — tiếng Việt very much included — and see every character
   become a Unicode code point and then UTF-8 bytes. Shows why the visible
   number of letters, the number of code points, and the number of BYTES
   (which is what a C++ std::string's length() counts in a UTF-8 world)
   are three different numbers.
   Mount point: #text-root. Pure engine exported for Node tests. */
(function (global) {
  'use strict';

  function utf8BytesOf(cp) {
    // encode one code point by the UTF-8 rules
    if (cp < 0x80) return [cp];
    if (cp < 0x800) return [0xC0 | (cp >> 6), 0x80 | (cp & 63)];
    if (cp < 0x10000) return [0xE0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63)];
    return [0xF0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63)];
  }

  function hex(n, w) {
    var s = n.toString(16).toUpperCase();
    while (s.length < (w || 2)) s = '0' + s;
    return s;
  }

  function inspect(text) {
    var chars = Array.from(text); // code points, not UTF-16 units
    var rows = chars.map(function (ch) {
      var cp = ch.codePointAt(0);
      var bytes = utf8BytesOf(cp);
      return {
        ch: ch,
        cp: cp,
        uplus: 'U+' + hex(cp, 4),
        ascii: cp < 128,
        bytes: bytes,
        bytesHex: bytes.map(function (b) { return hex(b); })
      };
    });
    var totalBytes = rows.reduce(function (s, r) { return s + r.bytes.length; }, 0);
    return { rows: rows, chars: chars.length, bytes: totalBytes };
  }

  var TextLab = { inspect: inspect, utf8BytesOf: utf8BytesOf };

  // ───────────── UI ─────────────
  function mount() {
    var host = document.getElementById('text-root');
    if (!host) return;
    function el(tag, cls, html) {
      var n = document.createElement(tag);
      if (cls) n.className = cls;
      if (html !== undefined) n.innerHTML = html;
      return n;
    }
    function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

    var panel = el('div', 'run-panel');
    panel.appendChild(el('h4', '', 'Type anything — Vietnamese encouraged'));

    var row = el('div', 'ex-actions');
    var input = el('input');
    input.type = 'text';
    input.className = 'et-input';
    input.value = 'Xin chào';
    input.spellcheck = false;
    input.setAttribute('aria-label', 'Text to inspect');
    row.appendChild(input);
    panel.appendChild(row);

    var presetRow = el('div', 'ex-actions');
    presetRow.appendChild(el('span', 'field-label', 'presets:'));
    ['Hello', 'Xin chào', 'Việt Nam', 'CO1005 🚀', 'à vs a'].forEach(function (p) {
      var b = el('button', 'btn ghost small', esc(p));
      b.addEventListener('click', function () { input.value = p; render(); });
      presetRow.appendChild(b);
    });
    panel.appendChild(presetRow);

    var counts = el('div', 'tx-counts');
    panel.appendChild(counts);
    var tableBox = el('div', 'tx-table-box');
    panel.appendChild(tableBox);
    host.appendChild(panel);

    function render() {
      var info = inspect(input.value);
      counts.innerHTML =
        '<span class="tx-count"><b>' + info.chars + '</b> character' + (info.chars === 1 ? '' : 's') + ' (code points)</span>' +
        '<span class="tx-count"><b>' + info.bytes + '</b> UTF-8 byte' + (info.bytes === 1 ? '' : 's') +
        ' — what a C++ <code>string::length()</code> would count</span>' +
        (info.bytes !== info.chars
          ? '<span class="tx-count tx-mismatch">the two numbers differ — some characters need more than one byte!</span>'
          : '<span class="tx-count">pure ASCII: one byte per character, the numbers agree</span>');
      var rows = info.rows.map(function (r) {
        return '<tr' + (r.ascii ? '' : ' class="tx-multi"') + '>' +
          '<td class="tx-ch">' + (r.ch === ' ' ? '␣' : esc(r.ch)) + '</td>' +
          '<td class="mono">' + r.uplus + '</td>' +
          '<td class="mono">' + r.cp + '</td>' +
          '<td>' + (r.ascii ? 'ASCII' : 'beyond ASCII') + '</td>' +
          '<td class="mono">' + r.bytesHex.join(' ') + '</td>' +
          '<td class="mono">' + r.bytes.length + '</td></tr>';
      }).join('');
      tableBox.innerHTML = '<div class="tbl-scroll"><table class="tbl">' +
        '<tr><th>char</th><th>code point</th><th>decimal</th><th>range</th><th>UTF-8 bytes (hex)</th><th>bytes</th></tr>' +
        rows + '</table></div>';
    }

    input.addEventListener('input', render);
    render();
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = TextLab;
  else {
    global.TextLab = TextLab;
    document.addEventListener('DOMContentLoaded', mount);
  }
})(typeof window !== 'undefined' ? window : this);
