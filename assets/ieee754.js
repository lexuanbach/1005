/* IEEE 754 Lab — mini app for CO1005 Supplementary Topic S3.
   Encodes a decimal number into IEEE 754 bits (float 32 / double 64) and back:
   every bit is clickable, and the exact decimal value that is REALLY stored is
   printed in full using BigInt arithmetic — which is how you can see with your
   own eyes why 0.1 + 0.2 != 0.3.  Mount point: #ieee-root. */
(function (global) {
  'use strict';

  var FMT = {
    32: { expBits: 8, fracBits: 23, bias: 127 },
    64: { expBits: 11, fracBits: 52, bias: 1023 }
  };

  // value = mant × 2^p (mant BigInt ≥ 0) → exact decimal string
  function exactOfPow2(mant, p) {
    if (mant === 0n) return '0';
    if (p >= 0) return (mant << BigInt(p)).toString();
    var k = -p;
    var digits = (mant * (5n ** BigInt(k))).toString(); // mant / 2^k = mant·5^k / 10^k
    if (digits.length <= k) digits = '0'.repeat(k - digits.length + 1) + digits;
    var s = digits.slice(0, digits.length - k) + '.' + digits.slice(digits.length - k);
    return s.replace(/0+$/, '').replace(/\.$/, '');
  }

  function bitsOf(value, fmt) {
    var buf = new DataView(new ArrayBuffer(8));
    var bi;
    if (fmt === 32) {
      buf.setFloat32(0, value);
      bi = BigInt(buf.getUint32(0));
    } else {
      buf.setFloat64(0, value);
      bi = buf.getBigUint64(0);
    }
    var n = fmt, bits = new Array(n);
    for (var i = 0; i < n; i++) bits[n - 1 - i] = Number((bi >> BigInt(i)) & 1n);
    return bits;
  }

  function valueOf(bits, fmt) {
    var bi = 0n;
    for (var i = 0; i < bits.length; i++) bi = (bi << 1n) | BigInt(bits[i]);
    var buf = new DataView(new ArrayBuffer(8));
    if (fmt === 32) { buf.setUint32(0, Number(bi)); return buf.getFloat32(0); }
    buf.setBigUint64(0, bi);
    return buf.getFloat64(0);
  }

  function analyze(bits, fmt) {
    var f = FMT[fmt];
    var sign = bits[0];
    var expRaw = 0;
    for (var i = 1; i <= f.expBits; i++) expRaw = expRaw * 2 + bits[i];
    var frac = 0n;
    for (var j = 1 + f.expBits; j < bits.length; j++) frac = (frac << 1n) | BigInt(bits[j]);
    var maxExp = (1 << f.expBits) - 1;
    var value = valueOf(bits, fmt);

    var kind, exact, exp = null;
    if (expRaw === maxExp) {
      kind = frac === 0n ? 'inf' : 'nan';
      exact = kind === 'inf' ? (sign ? '-infinity' : '+infinity') : 'NaN (not a number)';
    } else if (expRaw === 0 && frac === 0n) {
      kind = 'zero';
      exact = sign ? '-0' : '0';
    } else if (expRaw === 0) {
      kind = 'subnormal';
      exp = 1 - f.bias;
      exact = (sign ? '-' : '') + exactOfPow2(frac, exp - f.fracBits);
    } else {
      kind = 'normal';
      exp = expRaw - f.bias;
      exact = (sign ? '-' : '') + exactOfPow2((1n << BigInt(f.fracBits)) + frac, exp - f.fracBits);
    }
    var hexDigits = fmt / 4, hex = '';
    for (var h = 0; h < hexDigits; h++) {
      var nib = 0;
      for (var b = 0; b < 4; b++) nib = nib * 2 + bits[h * 4 + b];
      hex += nib.toString(16).toUpperCase();
    }
    return {
      sign: sign, expRaw: expRaw, exp: exp, frac: frac, kind: kind,
      exact: exact, hex: '0x' + hex, value: value, bias: f.bias,
      expBitsArr: bits.slice(1, 1 + f.expBits),
      fracBitsArr: bits.slice(1 + f.expBits)
    };
  }

  function exactStored(value, fmt) { return analyze(bitsOf(value, fmt), fmt).exact; }

  var IEEE = { bitsOf: bitsOf, valueOf: valueOf, analyze: analyze, exactStored: exactStored, FMT: FMT };

  // ───────────── UI ─────────────
  function mount() {
    var host = document.getElementById('ieee-root');
    if (!host) return;
    function el(tag, cls, html) {
      var n = document.createElement(tag);
      if (cls) n.className = cls;
      if (html !== undefined) n.innerHTML = html;
      return n;
    }
    function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

    var fmt = 64;
    var bits = bitsOf(0.1, 64);

    var panel = el('div', 'run-panel');
    panel.appendChild(el('h4', '', 'Type a number — or click any bit to flip it'));

    var row = el('div', 'ex-actions');
    var input = el('input');
    input.type = 'text';
    input.className = 'et-input';
    input.value = '0.1';
    input.spellcheck = false;
    input.setAttribute('aria-label', 'Decimal number to encode');
    row.appendChild(input);
    var encodeBtn = el('button', 'btn primary', 'Encode →');
    row.appendChild(encodeBtn);
    var fmtBtn = el('button', 'btn ghost', 'double · 64-bit ▾');
    row.appendChild(fmtBtn);

    var ZOOM_MIN = 0.5, ZOOM_MAX = 2, ZOOM_STEP = 0.25;
    var zoom = 1;
    var zoomGroup = el('div', 'bit-zoom-group');
    var zoomOutBtn = el('button', 'btn ghost small', '−');
    zoomOutBtn.type = 'button'; zoomOutBtn.setAttribute('aria-label', 'Shrink the bits');
    var zoomLabel = el('span', 'zoom-label mono', '100%');
    zoomLabel.setAttribute('aria-live', 'polite');
    var zoomInBtn = el('button', 'btn ghost small', '+');
    zoomInBtn.type = 'button'; zoomInBtn.setAttribute('aria-label', 'Enlarge the bits');
    function setZoom(z) {
      zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
      panel.style.setProperty('--bit-zoom', zoom);
      zoomLabel.textContent = Math.round(zoom * 100) + '%';
      zoomOutBtn.disabled = zoom <= ZOOM_MIN;
      zoomInBtn.disabled = zoom >= ZOOM_MAX;
    }
    zoomOutBtn.addEventListener('click', function () { setZoom(zoom - ZOOM_STEP); });
    zoomInBtn.addEventListener('click', function () { setZoom(zoom + ZOOM_STEP); });
    zoomGroup.appendChild(zoomOutBtn); zoomGroup.appendChild(zoomLabel); zoomGroup.appendChild(zoomInBtn);
    row.appendChild(zoomGroup);
    panel.appendChild(row);
    setZoom(1);

    var presetRow = el('div', 'ex-actions');
    presetRow.appendChild(el('span', 'field-label', 'presets:'));
    [['0.1', 0.1], ['0.2', 0.2], ['0.3', 0.3], ['0.1 + 0.2', 0.1 + 0.2],
     ['0.5', 0.5], ['1', 1], ['-2.75', -2.75], ['3.4e39', 3.4e39]].forEach(function (p) {
      var b = el('button', 'btn ghost small', p[0]);
      b.addEventListener('click', function () {
        input.value = p[0].indexOf('+') >= 0 ? String(p[1]) : p[0];
        setValue(p[1]);
      });
      presetRow.appendChild(b);
    });
    panel.appendChild(presetRow);

    var bitBox = el('div', 'ieee-bits-scroll');
    panel.appendChild(bitBox);

    var readout = el('div', 'ieee-readout');
    panel.appendChild(readout);
    host.appendChild(panel);

    function setValue(v) { bits = bitsOf(v, fmt); render(); }

    function parseInput() {
      var t = input.value.trim().toLowerCase();
      if (t === '') return;
      var v;
      if (t === 'inf' || t === 'infinity' || t === '+inf') v = Infinity;
      else if (t === '-inf' || t === '-infinity') v = -Infinity;
      else if (t === 'nan') v = NaN;
      else {
        v = Number(t);
        if (Number.isNaN(v) && t !== 'nan') {
          readout.innerHTML = '<div class="sim-status error">Cannot read “' + esc(input.value) + '” as a number.</div>';
          return;
        }
      }
      setValue(v);
    }

    function render() {
      var a = analyze(bits, fmt);
      var f = FMT[fmt];

      // bit cells
      var html = '<div class="ieee-bits" role="group" aria-label="' + fmt + ' bits — click a bit to flip it">';
      for (var i = 0; i < bits.length; i++) {
        var cls = i === 0 ? 'b-sign' : (i <= f.expBits ? 'b-exp' : 'b-man');
        var gap = (i > 0 && i % 8 === 0) ? ' b-gap' : '';
        html += '<button type="button" class="ieee-bit ' + cls + gap + '" data-i="' + i +
          '" aria-label="bit ' + (bits.length - 1 - i) + '">' + bits[i] + '</button>';
      }
      html += '</div>';
      html += '<div class="ieee-bit-caption"><span class="cap-sign">sign · 1</span>' +
        '<span class="cap-exp">exponent · ' + f.expBits + '</span>' +
        '<span class="cap-man">mantissa · ' + f.fracBits + '</span></div>';
      bitBox.innerHTML = html;
      bitBox.querySelectorAll('.ieee-bit').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var i = +btn.dataset.i;
          bits[i] = bits[i] ? 0 : 1;
          input.value = String(valueOf(bits, fmt));
          render();
        });
      });

      // readout
      var rows = [];
      rows.push(['Hex', '<code>' + a.hex + '</code>']);
      rows.push(['Sign', 's = ' + a.sign + ' → ' + (a.sign ? 'negative' : 'positive')]);
      if (a.kind === 'normal') {
        rows.push(['Exponent', 'raw E = ' + a.expRaw + ', so e = E − ' + a.bias + ' (bias) = <strong>' + a.exp + '</strong>']);
        rows.push(['Mantissa', '1.' + a.fracBitsArr.join('') + '₂ &nbsp;(the leading 1 is implicit — stored for free!)']);
        rows.push(['Formula', '(−1)<sup>' + a.sign + '</sup> × 1.mantissa₂ × 2<sup>' + a.exp + '</sup>']);
      } else if (a.kind === 'zero') {
        rows.push(['Kind', (a.sign ? 'negative' : 'positive') + ' zero — all exponent and mantissa bits are 0']);
      } else if (a.kind === 'subnormal') {
        rows.push(['Kind', 'subnormal — exponent bits all 0; value = 0.mantissa₂ × 2<sup>' + a.exp + '</sup> (no implicit 1)']);
      } else if (a.kind === 'inf') {
        rows.push(['Kind', (a.sign ? '−∞' : '+∞') + ' — exponent bits all 1, mantissa all 0 (this is what overflow produces)']);
      } else {
        rows.push(['Kind', 'NaN — exponent bits all 1, mantissa non-zero (e.g. the result of 0.0/0.0)']);
      }
      var printed = a.kind === 'inf' || a.kind === 'nan' ? a.exact : String(a.value);
      rows.push(['Prints as', '<code>' + esc(printed) + '</code>']);

      var typed = input.value.trim();
      var mismatch = a.kind === 'normal' && typed !== '' && !isNaN(Number(typed)) &&
        a.exact !== typed.replace(/^\+/, '') && Number(typed) === a.value;

      var out = '<table class="ieee-table">' + rows.map(function (r) {
        return '<tr><th>' + r[0] + '</th><td>' + r[1] + '</td></tr>';
      }).join('') + '</table>';
      out += '<div class="field-label" style="margin-top:0.6rem">Value actually stored — exact, every digit</div>';
      out += '<div class="ieee-exact' + (mismatch ? ' differs' : '') + '">' + esc(a.exact) + '</div>';
      if (mismatch) out += '<div class="ieee-note">≠ the “' + esc(typed) + '” you typed — the binary format cannot hold that decimal exactly, so the <em>nearest representable</em> value was stored. That gap is the whole story of this page.</div>';
      readout.innerHTML = out;
    }

    encodeBtn.addEventListener('click', parseInput);
    input.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') parseInput(); });
    fmtBtn.addEventListener('click', function () {
      var v = valueOf(bits, fmt);
      fmt = fmt === 64 ? 32 : 64;
      fmtBtn.textContent = fmt === 64 ? 'double · 64-bit ▾' : 'float · 32-bit ▾';
      bits = bitsOf(v, fmt);
      render();
    });

    render();
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = IEEE;
  else {
    global.IEEE754 = IEEE;
    document.addEventListener('DOMContentLoaded', mount);
  }
})(typeof window !== 'undefined' ? window : this);
