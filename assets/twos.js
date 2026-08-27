/* Two's Complement Lab — mini app for CO1005 Supplementary Topic S4.
   Shows how signed integers really live in memory: decimal ↔ bits at 8/16/32
   bits, clickable bits, the invert-and-add-one negation steps, signed vs
   unsigned readings of the same pattern, and ±1 walking straight into
   overflow. Mount point: #twos-root. Pure engine exported for Node tests. */
(function (global) {
  'use strict';

  // value (any integer) → bit array (msb first), wrapped modulo 2^width
  function toBits(value, width) {
    var m = BigInt(1) << BigInt(width);
    var v = ((BigInt(Math.trunc(value)) % m) + m) % m;
    var bits = new Array(width);
    for (var i = 0; i < width; i++) bits[width - 1 - i] = Number((v >> BigInt(i)) & 1n);
    return bits;
  }

  function unsignedOf(bits) {
    var v = 0n;
    for (var i = 0; i < bits.length; i++) v = (v << 1n) | BigInt(bits[i]);
    return v;
  }

  function signedOf(bits) {
    var u = unsignedOf(bits);
    if (bits[0] === 0) return u;
    return u - (1n << BigInt(bits.length));
  }

  function hexOf(bits) {
    var s = '';
    for (var h = 0; h < bits.length / 4; h++) {
      var nib = 0;
      for (var b = 0; b < 4; b++) nib = nib * 2 + bits[h * 4 + b];
      s += nib.toString(16).toUpperCase();
    }
    return '0x' + s;
  }

  function rangeOf(width) {
    return {
      min: -(2n ** BigInt(width - 1)),
      max: 2n ** BigInt(width - 1) - 1n,
      umax: 2n ** BigInt(width) - 1n
    };
  }

  // negation walkthrough: invert every bit, then add 1
  function negSteps(bits) {
    var inverted = bits.map(function (b) { return b ? 0 : 1; });
    var plusOne = inverted.slice();
    for (var i = plusOne.length - 1; i >= 0; i--) {
      if (plusOne[i] === 0) { plusOne[i] = 1; break; }
      plusOne[i] = 0; // carry ripples
    }
    return { inverted: inverted, plusOne: plusOne };
  }

  // place-value formula string: -128·b + 64·b + …
  function placeValues(bits) {
    var parts = [];
    var n = bits.length;
    for (var i = 0; i < n; i++) {
      if (!bits[i]) continue;
      var w = 2n ** BigInt(n - 1 - i);
      parts.push((i === 0 ? '−' : '') + w.toString());
    }
    if (!parts.length) return '0';
    return parts.join(' + ').replace(/\+ −/g, '− ');
  }

  var Twos = { toBits: toBits, unsignedOf: unsignedOf, signedOf: signedOf, hexOf: hexOf, rangeOf: rangeOf, negSteps: negSteps, placeValues: placeValues };

  // ───────────── UI ─────────────
  function mount() {
    var host = document.getElementById('twos-root');
    if (!host) return;
    function el(tag, cls, html) {
      var n = document.createElement(tag);
      if (cls) n.className = cls;
      if (html !== undefined) n.innerHTML = html;
      return n;
    }
    function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

    var width = 8;
    var bits = toBits(5, 8);

    var panel = el('div', 'run-panel');
    panel.appendChild(el('h4', '', 'Type an integer — flip bits — walk into overflow'));

    var row = el('div', 'ex-actions');
    var input = el('input');
    input.type = 'text';
    input.className = 'et-input';
    input.value = '5';
    input.spellcheck = false;
    input.setAttribute('aria-label', 'Integer to encode');
    row.appendChild(input);
    var encodeBtn = el('button', 'btn primary', 'Encode →');
    row.appendChild(encodeBtn);
    var widthBtn = el('button', 'btn ghost', '8-bit ▾');
    row.appendChild(widthBtn);
    var decBtn = el('button', 'btn ghost small', '− 1');
    var incBtn = el('button', 'btn ghost small', '+ 1');
    var negBtn = el('button', 'btn ghost small', 'negate (invert + 1)');
    row.appendChild(decBtn); row.appendChild(incBtn); row.appendChild(negBtn);
    panel.appendChild(row);

    var presetRow = el('div', 'ex-actions');
    presetRow.appendChild(el('span', 'field-label', 'presets:'));
    [['5', 5], ['-5', -5], ['-1', -1], ['127', 127], ['-128', -128], ['255', 255], ["'A' = 65", 65], ['100', 100]].forEach(function (p) {
      var b = el('button', 'btn ghost small', p[0]);
      b.addEventListener('click', function () {
        input.value = String(p[1]);
        setValue(p[1]);
      });
      presetRow.appendChild(b);
    });
    panel.appendChild(presetRow);

    var warnBox = el('div');
    panel.appendChild(warnBox);
    var bitBox = el('div', 'ieee-bits-scroll');
    panel.appendChild(bitBox);
    var negBox = el('div');
    panel.appendChild(negBox);
    var readout = el('div', 'ieee-readout');
    panel.appendChild(readout);
    host.appendChild(panel);

    function setValue(v, warn) {
      var r = rangeOf(width);
      var overflowed = BigInt(Math.trunc(v)) > r.max || BigInt(Math.trunc(v)) < r.min;
      bits = toBits(v, width);
      warnBox.innerHTML = '';
      if (overflowed || warn) {
        var got = signedOf(bits);
        warnBox.innerHTML = '<div class="sim-status error" style="margin-bottom:0.6rem">Overflow! ' +
          esc(String(v)) + ' does not fit in ' + width + ' signed bits (range ' + r.min + ' … ' + r.max +
          '). The bits wrapped around to <strong>' + got + '</strong> — in C++, signed overflow is undefined behaviour.</div>';
      }
      negBox.innerHTML = '';
      render();
    }

    function bitRowHTML(arr, label) {
      var h = '<div class="ieee-bits" style="margin-top:2px">';
      for (var i = 0; i < arr.length; i++) {
        var cls = i === 0 ? 'b-sign' : 'b-man';
        var gap = (i > 0 && i % 8 === 0) ? ' b-gap' : '';
        h += '<span class="ieee-bit ' + cls + gap + '" style="cursor:default">' + arr[i] + '</span>';
      }
      return h + '<span class="branch-lbl" style="align-self:center;margin-left:0.6rem">' + label + '</span></div>';
    }

    function render() {
      var html = '<div class="ieee-bits" role="group" aria-label="' + width + ' bits — click a bit to flip it">';
      for (var i = 0; i < bits.length; i++) {
        var cls = i === 0 ? 'b-sign' : 'b-man';
        var gap = (i > 0 && i % 8 === 0) ? ' b-gap' : '';
        html += '<button type="button" class="ieee-bit ' + cls + gap + '" data-i="' + i +
          '" aria-label="bit ' + (bits.length - 1 - i) + ', weight ' + (i === 0 ? 'minus ' : '') + '2^' + (bits.length - 1 - i) + '">' + bits[i] + '</button>';
      }
      html += '</div>';
      html += '<div class="ieee-bit-caption"><span class="cap-sign">sign bit · weight −2<sup>' + (width - 1) + '</sup></span>' +
        '<span class="cap-man">value bits · weights 2<sup>' + (width - 2) + '</sup> … 2⁰</span></div>';
      bitBox.innerHTML = html;
      bitBox.querySelectorAll('button.ieee-bit').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var i = +btn.dataset.i;
          bits[i] = bits[i] ? 0 : 1;
          input.value = signedOf(bits).toString();
          warnBox.innerHTML = '';
          negBox.innerHTML = '';
          render();
        });
      });

      var s = signedOf(bits), u = unsignedOf(bits), r = rangeOf(width);
      var rows = [];
      rows.push(['Signed', '<strong>' + s + '</strong> &nbsp;(two\'s complement reading — this is C++ <code>' +
        (width === 8 ? 'char' : width === 16 ? 'short' : 'int') + '</code>)']);
      rows.push(['Unsigned', u + ' &nbsp;(the very same bits, read as <code>unsigned</code>)']);
      rows.push(['Hex', '<code>' + hexOf(bits) + '</code>']);
      rows.push(['Place values', '<span class="mono">' + placeValues(bits) + ' = ' + s + '</span>']);
      rows.push(['Range at ' + width + ' bits', '<span class="mono">' + r.min + ' … ' + r.max +
        '</span> signed &nbsp;·&nbsp; <span class="mono">0 … ' + r.umax + '</span> unsigned']);
      readout.innerHTML = '<table class="ieee-table">' + rows.map(function (x) {
        return '<tr><th>' + x[0] + '</th><td>' + x[1] + '</td></tr>';
      }).join('') + '</table>';
    }

    function parseInput() {
      var t = input.value.trim();
      if (!/^[+-]?\d+$/.test(t)) {
        warnBox.innerHTML = '<div class="sim-status error" style="margin-bottom:0.6rem">Cannot read “' + esc(input.value) + '” as a whole number.</div>';
        return;
      }
      setValue(Number(t));
    }

    encodeBtn.addEventListener('click', parseInput);
    input.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') parseInput(); });
    widthBtn.addEventListener('click', function () {
      var v = signedOf(bits);
      width = width === 8 ? 16 : width === 16 ? 32 : 8;
      widthBtn.textContent = width + '-bit ▾';
      setValue(Number(v));
      input.value = signedOf(bits).toString();
    });
    incBtn.addEventListener('click', function () {
      var v = signedOf(bits) + 1n;
      var over = v > rangeOf(width).max;
      bits = toBits(Number(v), width);
      input.value = signedOf(bits).toString();
      if (over) setValue(Number(v), false); else { warnBox.innerHTML = ''; negBox.innerHTML = ''; render(); }
      if (over) warnBox.innerHTML = '<div class="sim-status error" style="margin-bottom:0.6rem">Overflow! One step past ' +
        rangeOf(width).max + ' wraps all the way around to <strong>' + signedOf(bits) +
        '</strong>. In C++, this signed overflow is undefined behaviour.</div>';
    });
    decBtn.addEventListener('click', function () {
      var v = signedOf(bits) - 1n;
      var under = v < rangeOf(width).min;
      bits = toBits(Number(v), width);
      input.value = signedOf(bits).toString();
      warnBox.innerHTML = under ? '<div class="sim-status error" style="margin-bottom:0.6rem">Overflow the other way! One step below ' +
        rangeOf(width).min + ' wraps around to <strong>' + signedOf(bits) + '</strong>.</div>' : '';
      negBox.innerHTML = '';
      render();
    });
    negBtn.addEventListener('click', function () {
      var st = negSteps(bits);
      var before = signedOf(bits);
      negBox.innerHTML =
        '<div class="field-label" style="margin-top:0.5rem">Negating ' + before + ' — invert every bit, then add 1:</div>' +
        bitRowHTML(bits, 'original (' + before + ')') +
        bitRowHTML(st.inverted, 'inverted') +
        bitRowHTML(st.plusOne, '+ 1  →  ' + signedOf(st.plusOne));
      bits = st.plusOne.slice();
      input.value = signedOf(bits).toString();
      if (before === rangeOf(width).min) {
        warnBox.innerHTML = '<div class="sim-status error" style="margin-bottom:0.6rem">The famous edge case: negating ' +
          before + ' gives back ' + signedOf(bits) + ' — because +' + (-before) +
          ' does not exist in ' + width + ' bits. The range is asymmetric!</div>';
      } else warnBox.innerHTML = '';
      render();
    });

    render();
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = Twos;
  else {
    global.TwosLab = Twos;
    document.addEventListener('DOMContentLoaded', mount);
  }
})(typeof window !== 'undefined' ? window : this);
