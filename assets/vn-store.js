/* vn-store.js - settings, share links, "My programs", drafts and the .asm file format
   for the CO1005 Von Neumann Machine workbench.

   Plain ES2017 IIFE. Global `VNStore` in the browser, CommonJS export in Node.
   No DOM, no network, no eval, no libraries.

   Rules this module keeps:
   - No public function ever throws, whatever it is given and however storage behaves.
   - Everything that comes from outside (share links, imported files, storage contents,
     objects passed in by callers) is treated as hostile: it is validated, clamped and
     copied into fresh literals. Only whitelisted keys are ever read, and only own ones.
   - Storage is injectable: VNStore.create({ storage }).

   The exact URL and file formats are documented in the VNM team notes (store/README.md). */
(function (global) {
  'use strict';

  var hasOwn = Object.prototype.hasOwnProperty;

  var LIMITS = Object.freeze({
    programs: 50,          // saved programs
    codeChars: 10000,      // code of a saved program / of a share link
    draftCodeChars: 20000, // the auto-saved draft may be as long as the assembler accepts
    inputChars: 500,
    nameChars: 60,
    shareChars: 8000,      // whole 'v1.xxxx' string
    shareRawChars: 100000, // anything longer than this is not even looked at
    fileChars: 102400,     // 100 KB .asm file
    programsJsonChars: 2000000,
    importItems: 200       // at most this many entries of an import file are examined
  });

  var KEYS = Object.freeze({
    programs: 'co1005-vn-programs-v1',
    draft: 'co1005-vn-draft',
    settings: 'co1005-vn-settings',
    speed: 'co1005-vn-speed'
  });

  var PROGRAMS_FORMAT = 'co1005-vnm-programs';
  var SHARE_PREFIX = 'v1.';
  var DAY_MS = 86400000;

  /* ------------------------------------------------------------------ helpers */

  function own(o, k) {
    try {
      return (o !== null && typeof o === 'object' && hasOwn.call(o, k)) ? o[k] : undefined;
    } catch (e) { return undefined; }
  }
  function isObj(o) { return o !== null && typeof o === 'object' && !Array.isArray(o); }
  function isProtoName(s) {
    // 'constructor', '__proto__', 'toString', 'hasOwnProperty' ... never usable as a key/id
    try { return s in Object.prototype; } catch (e) { return true; }
  }
  function fail(msg, reason) { return { ok: false, error: msg, reason: reason || 'invalid' }; }

  /* Text sanitiser. multi = keep \t \n \r (code); otherwise they become spaces (names, input).
     Removes: other C0 controls, DEL, C1 controls, bidi overrides/isolates (Trojan Source),
     zero-width characters, BOM, U+FFFE/FFFF; replaces lone surrogates by U+FFFD;
     turns U+2028/2029 into a newline (or a space). */
  var PLAIN_RE = /^[\x20-\x7e\n\r\t]*$/;
  function cleanText(s, multi) {
    if (typeof s !== 'string') return '';
    if (PLAIN_RE.test(s) && (multi || !/[\n\r\t]/.test(s))) return s;
    var out = [], n = s.length, i, c, d;
    for (i = 0; i < n; i++) {
      c = s.charCodeAt(i);
      if (c >= 0xD800 && c <= 0xDBFF) {
        d = i + 1 < n ? s.charCodeAt(i + 1) : 0;
        if (d >= 0xDC00 && d <= 0xDFFF) { out.push(s.charAt(i), s.charAt(i + 1)); i++; }
        else out.push('\ufffd');
        continue;
      }
      if (c >= 0xDC00 && c <= 0xDFFF) { out.push('\ufffd'); continue; }
      if (c < 0x20) {
        if (c === 9 || c === 10 || c === 13) out.push(multi ? s.charAt(i) : ' ');
        continue;
      }
      if (c === 0x7F || (c >= 0x80 && c <= 0x9F)) continue;
      if (c === 0x2028 || c === 0x2029) { out.push(multi ? '\n' : ' '); continue; }
      if ((c >= 0x200B && c <= 0x200F) || (c >= 0x202A && c <= 0x202E) ||
          (c >= 0x2066 && c <= 0x2069) || c === 0x2060 || c === 0x061C ||
          c === 0xFEFF || c === 0xFFFE || c === 0xFFFF) continue;
      out.push(s.charAt(i));
    }
    return out.join('');
  }
  function cleanLine(s) { return cleanText(s, false); }

  /* Cut to at most n UTF-16 units without splitting a surrogate pair. */
  function clip(s, n) {
    if (s.length <= n) return s;
    var c = s.charCodeAt(n - 1);
    return s.slice(0, c >= 0xD800 && c <= 0xDBFF ? n - 1 : n);
  }

  function cleanId(v) {
    if (typeof v !== 'string') return '';
    if (!/^[A-Za-z0-9_.\-]{1,64}$/.test(v)) return '';
    if (isProtoName(v)) return '';
    return v;
  }

  /* --------------------------------------------------------------- UTF-8 / base64url */

  function utf8Encode(str) {
    var n = str.length, bytes = [], i, c, d, cp;
    for (i = 0; i < n; i++) {
      c = str.charCodeAt(i);
      if (c >= 0xD800 && c <= 0xDBFF) {
        d = i + 1 < n ? str.charCodeAt(i + 1) : 0;
        if (d >= 0xDC00 && d <= 0xDFFF) { cp = 0x10000 + ((c - 0xD800) << 10) + (d - 0xDC00); i++; }
        else cp = 0xFFFD;
      } else if (c >= 0xDC00 && c <= 0xDFFF) cp = 0xFFFD;
      else cp = c;
      if (cp < 0x80) bytes.push(cp);
      else if (cp < 0x800) bytes.push(0xC0 | (cp >> 6), 0x80 | (cp & 63));
      else if (cp < 0x10000) bytes.push(0xE0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
      else bytes.push(0xF0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    }
    return bytes;
  }

  /* Strict decoder: returns null on overlong forms, surrogates, > U+10FFFF, truncation, bad lead bytes. */
  function utf8Decode(b) {
    var n = b.length, i = 0, units = [], parts = [], c, c1, c2, c3, cp;
    while (i < n) {
      c = b[i++];
      if (c < 0x80) cp = c;
      else if (c >= 0xC2 && c <= 0xDF) {
        c1 = b[i++];
        if ((c1 & 0xC0) !== 0x80) return null;
        cp = ((c & 0x1F) << 6) | (c1 & 0x3F);
      } else if (c >= 0xE0 && c <= 0xEF) {
        c1 = b[i++]; c2 = b[i++];
        if ((c1 & 0xC0) !== 0x80 || (c2 & 0xC0) !== 0x80) return null;
        cp = ((c & 0x0F) << 12) | ((c1 & 0x3F) << 6) | (c2 & 0x3F);
        if (cp < 0x800 || (cp >= 0xD800 && cp <= 0xDFFF)) return null;
      } else if (c >= 0xF0 && c <= 0xF4) {
        c1 = b[i++]; c2 = b[i++]; c3 = b[i++];
        if ((c1 & 0xC0) !== 0x80 || (c2 & 0xC0) !== 0x80 || (c3 & 0xC0) !== 0x80) return null;
        cp = ((c & 0x07) << 18) | ((c1 & 0x3F) << 12) | ((c2 & 0x3F) << 6) | (c3 & 0x3F);
        if (cp < 0x10000 || cp > 0x10FFFF) return null;
      } else return null;
      if (cp >= 0x10000) { cp -= 0x10000; units.push(0xD800 + (cp >> 10), 0xDC00 + (cp & 0x3FF)); }
      else units.push(cp);
      if (units.length >= 4096) { parts.push(String.fromCharCode.apply(null, units)); units = []; }
    }
    if (units.length) parts.push(String.fromCharCode.apply(null, units));
    return parts.join('');
  }

  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  var B64REV = (function () {
    var t = new Int16Array(128), i;
    for (i = 0; i < 128; i++) t[i] = -1;
    for (i = 0; i < 64; i++) t[B64.charCodeAt(i)] = i;
    return t;
  })();

  function base64urlEncode(bytes) {
    var out = [], n = bytes.length, i, a, b, c;
    for (i = 0; i + 2 < n; i += 3) {
      a = bytes[i]; b = bytes[i + 1]; c = bytes[i + 2];
      out.push(B64.charAt(a >> 2), B64.charAt(((a & 3) << 4) | (b >> 4)),
        B64.charAt(((b & 15) << 2) | (c >> 6)), B64.charAt(c & 63));
    }
    if (n - i === 1) {
      a = bytes[i];
      out.push(B64.charAt(a >> 2), B64.charAt((a & 3) << 4));
    } else if (n - i === 2) {
      a = bytes[i]; b = bytes[i + 1];
      out.push(B64.charAt(a >> 2), B64.charAt(((a & 3) << 4) | (b >> 4)), B64.charAt((b & 15) << 2));
    }
    return out.join('');
  }

  /* -> Uint8Array, or null for anything that is not base64url (up to two '=' of padding tolerated). */
  function base64urlDecode(s) {
    if (typeof s !== 'string') return null;
    var end = s.length, k = 0;
    while (end > 0 && s.charCodeAt(end - 1) === 61 && k < 2) { end--; k++; }
    var n = end, i, c, v, acc = 0, bits = 0, o = 0;
    if (n % 4 === 1) return null;
    var out = new Uint8Array(Math.floor(n * 3 / 4));
    for (i = 0; i < n; i++) {
      c = s.charCodeAt(i);
      v = c < 128 ? B64REV[c] : -1;
      if (v < 0) return null;
      acc = (acc << 6) | v; bits += 6;
      if (bits >= 8) { bits -= 8; out[o++] = (acc >> bits) & 255; acc &= (1 << bits) - 1; }
    }
    return out;
  }

  /* --------------------------------------------------------------------- settings */

  var DEFAULT_SETTINGS = Object.freeze({
    size: 'auto', isa: 'lecture', memLatency: 1, wrap: false, maxInstr: 10000, base: 'dec'
  });
  var SETTING_KEYS = ['size', 'isa', 'memLatency', 'wrap', 'maxInstr', 'base'];

  function toNum(v) {
    if (typeof v === 'number') return isFinite(v) ? v : NaN;
    if (typeof v === 'string' && /^\s*[+-]?\d{1,12}(\.\d{1,6})?\s*$/.test(v)) return Number(v);
    return NaN;
  }
  function cleanSize(v) {
    if (typeof v === 'string' && v.trim().toLowerCase() === 'auto') return 'auto';
    var x = toNum(v);
    if (x !== x) return 'auto';
    var s = 16;
    while (s < x && s < 256) s *= 2;
    return s;
  }
  function cleanInt(v, lo, hi, dflt) {
    var x = toNum(v);
    if (x !== x) return dflt;
    x = Math.round(x);
    return x < lo ? lo : (x > hi ? hi : x);
  }
  function cleanEnum(v, list, dflt) {
    if (typeof v !== 'string') return dflt;
    var t = v.trim().toLowerCase();
    return list.indexOf(t) >= 0 ? t : dflt;
  }
  function cleanWrap(v) {
    if (v === true || v === 1) return true;
    if (typeof v === 'string') {
      var t = v.trim().toLowerCase();
      return t === '1' || t === 'true' || t === 'yes' || t === 'on';
    }
    return false;
  }
  function cleanSettings(obj) {
    var d = DEFAULT_SETTINGS;
    try {
      if (!isObj(obj)) {
        return { size: d.size, isa: d.isa, memLatency: d.memLatency, wrap: d.wrap, maxInstr: d.maxInstr, base: d.base };
      }
      var g = function (k) { return own(obj, k); };
      return {
        size: g('size') === undefined ? d.size : cleanSize(g('size')),
        isa: cleanEnum(g('isa'), ['lecture', 'ext'], d.isa),
        memLatency: g('memLatency') === undefined ? d.memLatency : cleanInt(g('memLatency'), 1, 50, d.memLatency),
        wrap: cleanWrap(g('wrap')),
        maxInstr: g('maxInstr') === undefined ? d.maxInstr : cleanInt(g('maxInstr'), 100, 5000000, d.maxInstr),
        base: cleanEnum(g('base'), ['dec', 'hex', 'bin'], d.base)
      };
    } catch (e) {
      return { size: d.size, isa: d.isa, memLatency: d.memLatency, wrap: d.wrap, maxInstr: d.maxInstr, base: d.base };
    }
  }
  function settingsEqual(a, b) {
    for (var i = 0; i < SETTING_KEYS.length; i++) if (a[SETTING_KEYS[i]] !== b[SETTING_KEYS[i]]) return false;
    return true;
  }
  function settingsKey(s) {
    return [s.size, s.isa, s.memLatency, s.wrap ? 1 : 0, s.maxInstr, s.base].join('|');
  }

  /* ------------------------------------------------------------------ share links */

  function normInput(v) {
    if (typeof v === 'string') return v;
    if (Array.isArray(v)) {
      var parts = [];
      for (var i = 0; i < v.length && i < 200; i++) {
        if (typeof v[i] === 'number' && isFinite(v[i])) parts.push(String(v[i]));
        else if (typeof v[i] === 'string') parts.push(v[i]);
      }
      return parts.join(' ');
    }
    if (typeof v === 'number' && isFinite(v)) return String(v);
    return '';
  }

  function encodeShareEx(p) {
    try {
      if (!isObj(p)) return fail('There is nothing to share.', 'type');
      var code = own(p, 'code');
      if (typeof code !== 'string') return fail('The program text is missing.', 'type');
      code = cleanText(code, true);
      if (code.length > LIMITS.codeChars) {
        return fail('The program is too long to share by link (' + code.length + ' characters; the limit is ' +
          LIMITS.codeChars + '). Use Download instead.', 'limit');
      }
      var input = cleanLine(normInput(own(p, 'input'))).trim();
      if (input.length > LIMITS.inputChars) {
        return fail('The input is too long to share (limit ' + LIMITS.inputChars + ' characters).', 'limit');
      }
      var name = cleanLine(typeof own(p, 'name') === 'string' ? own(p, 'name') : '').trim();
      if (name.length > LIMITS.nameChars) {
        return fail('The program name is too long to share (limit ' + LIMITS.nameChars + ' characters).', 'limit');
      }
      var exampleId = cleanId(own(p, 'exampleId'));
      var st = cleanSettings(own(p, 'settings'));
      var obj = { code: code };
      if (input) obj.input = input;
      var sObj = {}, any = false, i, k;
      for (i = 0; i < SETTING_KEYS.length; i++) {
        k = SETTING_KEYS[i];
        if (st[k] !== DEFAULT_SETTINGS[k]) { sObj[k] = st[k]; any = true; }
      }
      if (any) obj.settings = sObj;
      if (name) obj.name = name;
      if (exampleId) obj.exampleId = exampleId;
      var str = SHARE_PREFIX + base64urlEncode(utf8Encode(JSON.stringify(obj)));
      if (str.length > LIMITS.shareChars) {
        return fail('The program is too long to share by link (the link would be ' + str.length +
          ' characters; the limit is ' + LIMITS.shareChars + '). Use Download instead.', 'limit');
      }
      return { ok: true, code: str, length: str.length };
    } catch (e) {
      return fail('Could not create the link.', 'internal');
    }
  }
  /* Spec form: the string on success, { ok:false, error } on failure. */
  function encodeShare(p) {
    var r = encodeShareEx(p);
    return r.ok ? r.code : { ok: false, error: r.error, reason: r.reason };
  }

  function decodeShare(str) {
    try {
      if (typeof str !== 'string') return fail('This is not a share code.', 'type');
      if (str.length > LIMITS.shareRawChars) return fail('This link is far too long to be a program link.', 'limit');
      var s = str.replace(/\s+/g, '');
      if (!s) return fail('The link is empty.', 'empty');
      if (s.length > LIMITS.shareChars) {
        return fail('This link is longer than ' + LIMITS.shareChars + ' characters, so it is not a program link.', 'limit');
      }
      var m = /^v(\d{1,4})\./.exec(s);
      if (!m) return fail('This is not a Von Neumann Machine program link.', 'format');
      if (m[1] !== '1') return fail('This link was made by a different version of the lab (v' + m[1] + ').', 'version');
      var bytes = base64urlDecode(s.slice(SHARE_PREFIX.length));
      if (!bytes || !bytes.length) return fail('The link is damaged (it is not valid base64).', 'base64');
      var json = utf8Decode(bytes);
      if (json === null) return fail('The link is damaged (it is not valid UTF-8 text).', 'utf8');
      var obj;
      try { obj = JSON.parse(json); } catch (e) { return fail('The link is damaged (its content is not valid JSON).', 'json'); }
      if (!isObj(obj)) return fail('The link does not contain a program.', 'shape');
      var code = own(obj, 'code');
      if (typeof code !== 'string') return fail('The link does not contain program text.', 'shape');
      code = cleanText(code, true);
      if (code.length > LIMITS.codeChars) return fail('The program in this link is longer than ' + LIMITS.codeChars + ' characters.', 'limit');
      var rawInput = own(obj, 'input');
      var input = typeof rawInput === 'string' ? cleanLine(rawInput).trim() : '';
      if (input.length > LIMITS.inputChars) return fail('The input in this link is longer than ' + LIMITS.inputChars + ' characters.', 'limit');
      var rawName = own(obj, 'name');
      var name = typeof rawName === 'string' ? cleanLine(rawName).trim() : '';
      if (name.length > LIMITS.nameChars) return fail('The program name in this link is longer than ' + LIMITS.nameChars + ' characters.', 'limit');
      var exampleId = cleanId(own(obj, 'exampleId'));
      return {
        ok: true,
        payload: {
          code: code,
          input: input,
          settings: cleanSettings(own(obj, 'settings')),
          name: name,
          exampleId: exampleId ? exampleId : null
        }
      };
    } catch (e) {
      return fail('The link could not be read.', 'internal');
    }
  }

  function safeDecodeURIComponent(s) {
    try { return decodeURIComponent(s); } catch (e) { return null; }
  }
  /* Accepts location.search ('?a=1&vn=...'), a bare query, or a whole URL. Returns the first non-empty vn value or null. */
  function readShareParam(search) {
    try {
      if (typeof search !== 'string' || search.length > 200000) return null;
      var s = search, h = s.indexOf('#');
      if (h >= 0) s = s.slice(0, h);
      var q = s.indexOf('?');
      if (q >= 0) s = s.slice(q + 1);
      if (!s) return null;
      var parts = s.split('&'), i, p, eq, key, val;
      for (i = 0; i < parts.length; i++) {
        p = parts[i];
        eq = p.indexOf('=');
        key = safeDecodeURIComponent(eq < 0 ? p : p.slice(0, eq));
        if (key !== 'vn' || eq < 0) continue;
        val = safeDecodeURIComponent(p.slice(eq + 1));
        if (val !== null && val !== '') return val;
      }
      return null;
    } catch (e) { return null; }
  }
  /* Whole URL or query string -> decodeShare result. */
  function decodeShareUrl(urlOrSearch) {
    var v = readShareParam(urlOrSearch);
    if (v === null) return fail('This address has no program in it (no "vn=" part).', 'format');
    return decodeShare(v);
  }

  /* { ok, url, length, error } */
  function makeShareLink(baseHref, payload) {
    try {
      if (typeof baseHref !== 'string') return fail('No page address.', 'type');
      var code;
      if (typeof payload === 'string') {
        var chk = decodeShare(payload);
        if (!chk.ok) return fail(chk.error, chk.reason);
        code = payload.replace(/\s+/g, '');
      } else {
        var enc = encodeShareEx(payload);
        if (!enc.ok) return enc;
        code = enc.code;
      }
      var base = baseHref, h = base.indexOf('#');
      if (h >= 0) base = base.slice(0, h);
      var q = base.indexOf('?'), path = base, kept = [];
      if (q >= 0) {
        path = base.slice(0, q);
        var parts = base.slice(q + 1).split('&');
        for (var i = 0; i < parts.length; i++) {
          if (!parts[i]) continue;
          var eq = parts[i].indexOf('=');
          var key = safeDecodeURIComponent(eq < 0 ? parts[i] : parts[i].slice(0, eq));
          if (key === 'vn') continue;
          kept.push(parts[i]);
        }
      }
      kept.push('vn=' + code);
      var url = path + '?' + kept.join('&') + '#lab';
      return { ok: true, url: url, length: url.length };
    } catch (e) { return fail('Could not build the link.', 'internal'); }
  }
  /* Spec form: the URL string, or null when the program cannot be shared. */
  function shareUrl(baseHref, payload) {
    var r = makeShareLink(baseHref, payload);
    return r.ok ? r.url : null;
  }

  /* -------------------------------------------------------------------- .asm files */

  function fileSettingsLine(st) {
    return ';@settings isa=' + st.isa + ' size=' + st.size + ' latency=' + st.memLatency +
      ' wrap=' + (st.wrap ? 1 : 0) + ' maxInstr=' + st.maxInstr + ' base=' + st.base;
  }

  function toFile(p) {
    try {
      var code = cleanText(typeof own(p, 'code') === 'string' ? own(p, 'code') : '', true);
      var name = clip(cleanLine(typeof own(p, 'name') === 'string' ? own(p, 'name') : '').trim(), LIMITS.nameChars).trim();
      var input = clip(cleanLine(normInput(own(p, 'input'))).trim(), LIMITS.inputChars).trim();
      var st = cleanSettings(own(p, 'settings'));
      var head = [];
      if (name) head.push(';@name ' + name);
      if (input) head.push(';@input ' + input);
      head.push(fileSettingsLine(st));
      // code that itself starts with ';@' would be mistaken for metadata: close the header explicitly
      if (code.slice(0, 2) === ';@') head.push(';@end');
      return head.join('\n') + '\n' + code;
    } catch (e) {
      return ';@settings isa=lecture size=auto latency=1 wrap=0 maxInstr=10000 base=dec\n';
    }
  }

  function fileResult(code, input, settings, name, error) {
    var r = { code: code, input: input, settings: settings, name: name };
    if (error) r.error = error;
    return r;
  }

  function fromFile(text) {
    var empty = function (msg) { return fileResult('', '', cleanSettings(null), '', msg); };
    try {
      if (typeof text !== 'string') return empty('This is not a text file.');
      if (text.length > LIMITS.fileChars) return empty('The file is larger than 100 KB.');
      if (text.indexOf('\u0000') >= 0) return empty('This does not look like a text file (it contains binary data).');
      if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
      var pos = 0, n = text.length, name = '', input = '', haveName = false, haveInput = false, haveSettings = false;
      var raw = Object.create(null);
      var headLines = 0;
      while (pos < n && headLines++ < 100) { // a header is a handful of lines; the cap keeps hostile files linear
        if (text.charAt(pos) !== ';' || text.charAt(pos + 1) !== '@') break;
        var e1 = text.indexOf('\n', pos), e2 = text.indexOf('\r', pos);
        var end = n, next = n;
        if (e1 >= 0 && (e2 < 0 || e1 < e2)) { end = e1; next = e1 + 1; if (end > pos && text.charAt(end - 1) === '\r') end--; }
        else if (e2 >= 0) { end = e2; next = (text.charAt(e2 + 1) === '\n') ? e2 + 2 : e2 + 1; }
        var line = text.slice(pos + 2, end);
        pos = next;
        var m = /^([A-Za-z]+)(?:[ \t]+([\s\S]*))?$/.exec(line.replace(/\s+$/, ''));
        if (!m) continue;
        var key = m[1].toLowerCase(), val = m[2] === undefined ? '' : m[2];
        if (key === 'end') break;
        if (key === 'name' && !haveName) { haveName = true; name = clip(cleanLine(val).trim(), LIMITS.nameChars).trim(); }
        else if (key === 'input' && !haveInput) { haveInput = true; input = clip(cleanLine(val).trim(), LIMITS.inputChars).trim(); }
        else if (key === 'settings' && !haveSettings) {
          haveSettings = true;
          var toks = val.split(/\s+/);
          for (var t = 0; t < toks.length && t < 40; t++) {
            var eq = toks[t].indexOf('=');
            if (eq <= 0) continue;
            var k = toks[t].slice(0, eq).toLowerCase(), v = toks[t].slice(eq + 1);
            if (k === 'isa') raw.isa = v;
            else if (k === 'size') raw.size = v;
            else if (k === 'latency' || k === 'memlatency') raw.memLatency = v;
            else if (k === 'wrap') raw.wrap = v;
            else if (k === 'maxinstr') raw.maxInstr = v;
            else if (k === 'base') raw.base = v;
          }
        }
      }
      var code = cleanText(text.slice(pos), true);
      return fileResult(code, input, cleanSettings(raw), name, null);
    } catch (e) {
      return empty('The file could not be read.');
    }
  }

  function fileName(name) {
    try {
      var s = typeof name === 'string' ? name : '';
      try { s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) { /* old engines */ }
      s = s.replace(/\u0111/g, 'd').replace(/\u0110/g, 'D').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
      if (!s) s = 'program';
      if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s)) s = 'vnm-' + s;
      return s + '.asm';
    } catch (e) { return 'program.asm'; }
  }

  /* ------------------------------------------------------------------ ids (per session) */

  var idCounter = 0;
  function makeIdGen(nowFn, randFn) {
    return function () {
      idCounter = (idCounter + 1) % 1679616; // 36^4
      var t, r = 0;
      try { t = Math.floor(nowFn()); } catch (e) { t = 0; }
      try { r = Math.floor(randFn() * 1679616); } catch (e) { r = 0; }
      if (!(r >= 0)) r = 0;
      return 'p' + t.toString(36) + '-' + ('0000' + idCounter.toString(36)).slice(-4) + ('0000' + r.toString(36)).slice(-4);
    };
  }

  /* --------------------------------------------------------------------- the store */

  function defaultStorage() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
    } catch (e) { /* SecurityError: storage blocked */ }
    try {
      if (global && global.localStorage) return global.localStorage;
    } catch (e2) { /* ignore */ }
    return null;
  }

  function describeStorageError(e) {
    var name = '', code = 0;
    try { name = String(e && e.name || ''); code = e && e.code; } catch (x) { /* ignore */ }
    if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED' || code === 22 || code === 1014) {
      return 'The browser storage is full. Delete some saved programs or download them as a file.';
    }
    return 'The browser is not letting this page save anything (storage is disabled or blocked). Use Download to keep your work.';
  }

  function create(opts) {
    var explicit = false, given = null;
    try {
      if (opts && typeof opts === 'object' && hasOwn.call(opts, 'storage')) { explicit = true; given = opts.storage; }
    } catch (e) { explicit = false; }
    var nowFn = function () { return Date.now(); };
    var randFn = function () { return Math.random(); };
    try {
      if (opts && typeof opts.now === 'function') nowFn = opts.now;
      if (opts && typeof opts.random === 'function') randFn = opts.random;
    } catch (e) { /* ignore */ }
    var genId = makeIdGen(nowFn, randFn);

    function now() {
      try {
        var t = Number(nowFn());
        return isFinite(t) && t >= 0 ? Math.floor(t) : Date.now();
      } catch (e) { return 0; }
    }
    function storage() {
      try { return explicit ? given : defaultStorage(); } catch (e) { return null; }
    }
    function getItem(key) {
      try {
        var s = storage();
        if (!s) return null;
        var v = s.getItem(key);
        return typeof v === 'string' ? v : null;
      } catch (e) { return null; }
    }
    function setItem(key, val) {
      try {
        var s = storage();
        if (!s) return { ok: false, error: describeStorageError(null) };
        s.setItem(key, val);
        return { ok: true };
      } catch (e) { return { ok: false, error: describeStorageError(e) }; }
    }
    function removeItem(key) {
      try {
        var s = storage();
        if (!s) return { ok: false, error: describeStorageError(null) };
        s.removeItem(key);
        return { ok: true };
      } catch (e) { return { ok: false, error: describeStorageError(e) }; }
    }
    function parseJSON(txt, maxLen) {
      try {
        if (typeof txt !== 'string' || !txt || txt.length > maxLen) return undefined;
        return JSON.parse(txt);
      } catch (e) { return undefined; }
    }

    /* ---- programs ---- */

    function cleanName(v, fallback) {
      var nm = clip(cleanLine(typeof v === 'string' ? v : '').trim(), LIMITS.nameChars).trim();
      return nm || fallback;
    }

    /* raw -> clean entry or null. ctx = { now, used (map id->1), regen (bool) } */
    function cleanEntry(raw, ctx) {
      if (!isObj(raw)) return null;
      var code = own(raw, 'code');
      if (typeof code !== 'string') return null;
      code = cleanText(code, true);
      if (code.length > LIMITS.codeChars) return null;
      var id = cleanId(own(raw, 'id'));
      if (!id || ctx.used[id]) {
        if (!ctx.regen) return null;
        do { id = genId(); } while (ctx.used[id]);
      }
      var u = own(raw, 'updated');
      u = (typeof u === 'number' && isFinite(u) && u > 0) ? Math.min(Math.floor(u), ctx.now + DAY_MS) : ctx.now;
      var entry = {
        id: id,
        name: cleanName(own(raw, 'name'), 'Untitled program'),
        code: code,
        input: clip(cleanLine(normInput(own(raw, 'input'))).trim(), LIMITS.inputChars).trim(),
        settings: cleanSettings(own(raw, 'settings')),
        updated: u
      };
      ctx.used[id] = 1;
      return entry;
    }

    function sortNewest(list) {
      var dec = list.map(function (e, i) { return { e: e, i: i }; });
      dec.sort(function (a, b) { return (b.e.updated - a.e.updated) || (a.i - b.i); });
      return dec.map(function (x) { return x.e; });
    }

    function extractArray(parsed) {
      if (Array.isArray(parsed)) return parsed;
      if (isObj(parsed)) { var a = own(parsed, 'programs'); if (Array.isArray(a)) return a; }
      return null;
    }

    function readList() {
      var parsed = parseJSON(getItem(KEYS.programs), LIMITS.programsJsonChars);
      var arr = extractArray(parsed);
      if (!arr) return [];
      var ctx = { now: now(), used: Object.create(null), regen: false }, list = [], i, e;
      for (i = 0; i < arr.length && i < LIMITS.importItems; i++) {
        e = cleanEntry(arr[i], ctx);
        if (e) list.push(e);
      }
      return sortNewest(list).slice(0, LIMITS.programs);
    }

    function writeList(list) {
      var txt;
      try { txt = JSON.stringify({ format: PROGRAMS_FORMAT, version: 1, programs: list }); }
      catch (e) { return { ok: false, error: 'Could not store the programs.' }; }
      return setItem(KEYS.programs, txt);
    }

    function copyEntry(e) {
      return { id: e.id, name: e.name, code: e.code, input: e.input, settings: cleanSettings(e.settings), updated: e.updated };
    }
    function findIndex(list, id) {
      for (var i = 0; i < list.length; i++) if (list[i].id === id) return i;
      return -1;
    }
    function maxUpdated(list) {
      var m = 0;
      for (var i = 0; i < list.length; i++) if (list[i].updated > m) m = list[i].updated;
      return m;
    }
    function contentKey(e) {
      return JSON.stringify([e.name, e.code, e.input, settingsKey(e.settings)]);
    }

    var programs = {
      list: function () {
        try { return readList().map(copyEntry); } catch (e) { return []; }
      },
      count: function () {
        try { return readList().length; } catch (e) { return 0; }
      },
      get: function (id) {
        try {
          if (typeof id !== 'string') return null;
          var list = readList(), i = findIndex(list, id);
          return i < 0 ? null : copyEntry(list[i]);
        } catch (e) { return null; }
      },
      /* success: the saved entry fields plus ok:true; failure: { ok:false, error } */
      save: function (p) {
        try {
          if (!isObj(p)) return fail('Nothing to save.', 'type');
          var code = own(p, 'code');
          if (typeof code !== 'string') return fail('The program text is missing.', 'type');
          code = cleanText(code, true);
          if (code.length > LIMITS.codeChars) {
            return fail('This program is longer than ' + LIMITS.codeChars + ' characters, so it cannot be saved. Use Download instead.', 'limit');
          }
          var list = readList(), id = cleanId(own(p, 'id')), idx = id ? findIndex(list, id) : -1;
          if (idx < 0 && list.length >= LIMITS.programs) {
            return fail('You already have ' + LIMITS.programs + ' saved programs. Delete one before saving another.', 'limit');
          }
          var used = Object.create(null), i;
          for (i = 0; i < list.length; i++) used[list[i].id] = 1;
          if (idx < 0) {
            if (!id || used[id]) { do { id = genId(); } while (used[id]); }
          }
          var entry = {
            id: id,
            name: cleanName(own(p, 'name'), 'Untitled program'),
            code: code,
            input: clip(cleanLine(normInput(own(p, 'input'))).trim(), LIMITS.inputChars).trim(),
            settings: cleanSettings(own(p, 'settings')),
            updated: Math.max(now(), maxUpdated(list) + 1)
          };
          if (idx >= 0) list.splice(idx, 1);
          list.unshift(entry);
          var w = writeList(list);
          if (!w.ok) return fail(w.error, 'storage');
          var out = copyEntry(entry);
          out.ok = true;
          return out;
        } catch (e) { return fail('Could not save the program.', 'internal'); }
      },
      rename: function (id, name) {
        try {
          if (typeof id !== 'string') return fail('Unknown program.', 'notfound');
          var nm = cleanName(name, '');
          if (!nm) return fail('The name cannot be empty.', 'invalid');
          var list = readList(), i = findIndex(list, id);
          if (i < 0) return fail('Unknown program.', 'notfound');
          list[i].name = nm;
          var w = writeList(list);
          if (!w.ok) return fail(w.error, 'storage');
          var out = copyEntry(list[i]);
          out.ok = true;
          return out;
        } catch (e) { return fail('Could not rename the program.', 'internal'); }
      },
      remove: function (id) {
        try {
          if (typeof id !== 'string') return { ok: true, removed: false };
          var list = readList(), i = findIndex(list, id);
          if (i < 0) return { ok: true, removed: false };
          list.splice(i, 1);
          var w = writeList(list);
          if (!w.ok) return fail(w.error, 'storage');
          return { ok: true, removed: true };
        } catch (e) { return fail('Could not delete the program.', 'internal'); }
      },
      exportAll: function () {
        try {
          return JSON.stringify({ format: PROGRAMS_FORMAT, version: 1, programs: readList().map(copyEntry) }, null, 1);
        } catch (e) {
          return '{"format":"' + PROGRAMS_FORMAT + '","version":1,"programs":[]}';
        }
      },
      importAll: function (text) {
        try {
          if (typeof text !== 'string') return { ok: false, added: 0, skipped: 0, error: 'This is not a text file.' };
          if (text.length > LIMITS.programsJsonChars) return { ok: false, added: 0, skipped: 0, error: 'The file is too large.' };
          var parsed;
          try { parsed = JSON.parse(text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text); }
          catch (e) { return { ok: false, added: 0, skipped: 0, error: 'This file is not a saved-programs file (it is not valid JSON).' }; }
          var arr;
          if (Array.isArray(parsed)) arr = parsed;
          else if (isObj(parsed) && own(parsed, 'format') === PROGRAMS_FORMAT) {
            var ver = own(parsed, 'version');
            if (typeof ver === 'number' && ver > 1) {
              return { ok: false, added: 0, skipped: 0, error: 'This file was made by a newer version of the lab (version ' + ver + ').' };
            }
            arr = own(parsed, 'programs');
          }
          if (!Array.isArray(arr)) return { ok: false, added: 0, skipped: 0, error: 'This file is not a CO1005 saved-programs file.' };
          var list = readList(), seen = Object.create(null), used = Object.create(null), i;
          for (i = 0; i < list.length; i++) { seen[contentKey(list[i])] = 1; used[list[i].id] = 1; }
          var ctx = { now: now(), used: used, regen: true };
          var added = 0, invalid = 0, duplicates = 0, overLimit = 0, fresh = [];
          var total = arr.length, lim = Math.min(total, LIMITS.importItems), e, key;
          invalid += total - lim;
          for (i = 0; i < lim; i++) {
            e = cleanEntry(arr[i], ctx);
            if (!e) { invalid++; continue; }
            key = contentKey(e);
            if (seen[key]) { duplicates++; delete used[e.id]; continue; }
            if (list.length + fresh.length >= LIMITS.programs) { overLimit++; delete used[e.id]; continue; }
            seen[key] = 1;
            fresh.push(e);
            added++;
          }
          if (added > 0) {
            var merged = sortNewest(fresh.concat(list)).slice(0, LIMITS.programs);
            var w = writeList(merged);
            if (!w.ok) return { ok: false, added: 0, skipped: total, error: w.error };
          }
          var skipped = total - added, msg = 'Added ' + added + ' program' + (added === 1 ? '' : 's');
          var bits = [];
          if (duplicates) bits.push(duplicates + ' already saved');
          if (invalid) bits.push(invalid + ' not valid');
          if (overLimit) bits.push(overLimit + ' left out because the limit of ' + LIMITS.programs + ' was reached');
          if (bits.length) msg += '; skipped ' + bits.join(', ');
          return { ok: true, added: added, skipped: skipped, duplicates: duplicates, invalid: invalid, overLimit: overLimit, message: msg + '.' };
        } catch (e) { return { ok: false, added: 0, skipped: 0, error: 'Could not import the file.' }; }
      }
    };

    /* ---- draft ---- */

    function cleanDraft(raw) {
      if (!isObj(raw)) return null;
      var code = own(raw, 'code');
      if (typeof code !== 'string') return null;
      code = cleanText(code, true);
      if (code.length > LIMITS.draftCodeChars) return null;
      var u = own(raw, 'updated');
      var ex = cleanId(own(raw, 'exampleId'));
      return {
        code: code,
        input: clip(cleanLine(normInput(own(raw, 'input'))).trim(), LIMITS.inputChars).trim(),
        settings: cleanSettings(own(raw, 'settings')),
        exampleId: ex ? ex : null,
        name: cleanName(own(raw, 'name'), ''),
        dirty: own(raw, 'dirty') === true,
        updated: (typeof u === 'number' && isFinite(u) && u > 0) ? Math.floor(u) : 0
      };
    }
    var draft = {
      get: function () {
        try { return cleanDraft(parseJSON(getItem(KEYS.draft), LIMITS.draftCodeChars * 4)); }
        catch (e) { return null; }
      },
      set: function (d) {
        try {
          var c = cleanDraft(isObj(d) ? { code: own(d, 'code'), input: own(d, 'input'), settings: own(d, 'settings'),
            exampleId: own(d, 'exampleId'), name: own(d, 'name'), dirty: own(d, 'dirty') } : null);
          if (!c) return fail('The draft is not valid (or its text is longer than ' + LIMITS.draftCodeChars + ' characters).', 'invalid');
          c.updated = now();
          var w = setItem(KEYS.draft, JSON.stringify(c));
          return w.ok ? { ok: true } : fail(w.error, 'storage');
        } catch (e) { return fail('Could not save the draft.', 'internal'); }
      },
      clear: function () {
        try { var r = removeItem(KEYS.draft); return r.ok ? { ok: true } : fail(r.error, 'storage'); }
        catch (e) { return fail('Could not clear the draft.', 'internal'); }
      }
    };

    /* ---- settings ---- */

    var settings = {
      get: function () {
        try {
          var parsed = parseJSON(getItem(KEYS.settings), 4000);
          return cleanSettings(parsed);
        } catch (e) { return cleanSettings(null); }
      },
      /* Keys missing from `obj` keep their stored value. Returns { ok, settings, error? }. */
      set: function (obj) {
        try {
          var cur = settings.get(), merged = {}, i, k;
          for (i = 0; i < SETTING_KEYS.length; i++) {
            k = SETTING_KEYS[i];
            merged[k] = (isObj(obj) && own(obj, k) !== undefined) ? own(obj, k) : cur[k];
          }
          var clean = cleanSettings(merged);
          var w = setItem(KEYS.settings, JSON.stringify(clean));
          return w.ok ? { ok: true, settings: clean } : { ok: false, settings: clean, error: w.error };
        } catch (e) { return { ok: false, settings: cleanSettings(null), error: 'Could not save the settings.' }; }
      },
      reset: function () {
        try { removeItem(KEYS.settings); } catch (e) { /* ignore */ }
        return cleanSettings(null);
      }
    };

    return {
      programs: programs,
      draft: draft,
      settings: settings,
      /* true when a write really works (probes with a throw-away key) */
      available: function () {
        try {
          var s = storage();
          if (!s) return false;
          var k = 'co1005-vn-probe';
          s.setItem(k, '1');
          s.removeItem(k);
          return true;
        } catch (e) { return false; }
      },
      keys: KEYS
    };
  }

  var shared = null;
  var api = {
    version: 1,
    LIMITS: LIMITS,
    KEYS: KEYS,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    cleanSettings: cleanSettings,
    settingsEqual: function (a, b) { try { return settingsEqual(cleanSettings(a), cleanSettings(b)); } catch (e) { return false; } },
    encodeShare: encodeShare,
    encodeShareEx: encodeShareEx,
    decodeShare: decodeShare,
    decodeShareUrl: decodeShareUrl,
    shareUrl: shareUrl,
    makeShareLink: makeShareLink,
    readShareParam: readShareParam,
    toFile: toFile,
    fromFile: fromFile,
    fileName: fileName,
    create: create,
    shared: function () { if (!shared) shared = create(); return shared; },
    util: {
      cleanText: cleanText,
      utf8Encode: utf8Encode,
      utf8Decode: utf8Decode,
      base64urlEncode: base64urlEncode,
      base64urlDecode: base64urlDecode
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.VNStore = api;
})(typeof window !== 'undefined' ? window : this);
