/* Tiny compiler lab: share links and the hand-off to the Von Neumann machine.  Pure functions (no DOM), also exported for Node tests.
   Payload format (both links):  'v1.' + base64url( UTF-8 JSON ).
     chapter-7.html?vn=<payload>#lab   {code, input, settings:{size:'auto', isa:'lecture'}, name}   (read by the Chapter 7 workbench)
     chapter-8.html?tc=<payload>#lab   {src, input, name}                                           (read by this lab)                    */
(function (global) {
  'use strict';
  var MAX_ASM = 8000;               // the generated assembly must stay under this many characters to travel in a link

  /* UTF-8 safe base64url, ~10 lines */
  function utf8Bytes(str) {
    if (typeof TextEncoder !== 'undefined') return Array.prototype.slice.call(new TextEncoder().encode(str));
    var bin = unescape(encodeURIComponent(str)), out = [];
    for (var i = 0; i < bin.length; i++) out.push(bin.charCodeAt(i));
    return out;
  }
  function b64urlEncode(str) {
    var bytes = utf8Bytes(str), bin = '';
    for (var i = 0; i < bytes.length; i += 4096) bin += String.fromCharCode.apply(null, bytes.slice(i, i + 4096));
    var b64 = typeof btoa === 'function' ? btoa(bin) : Buffer.from(bin, 'latin1').toString('base64');
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64urlDecode(s) {
    var b64 = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (b64.length % 4) b64 += '=';
    var bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('latin1');
    var bytes = []; for (var i = 0; i < bin.length; i++) bytes.push(bin.charCodeAt(i));
    if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes));
    return decodeURIComponent(escape(bin));
  }
  function pack(obj) { return 'v1.' + b64urlEncode(JSON.stringify(obj)); }
  function unpack(payload) {
    try {
      var p = String(payload || '');
      if (p.indexOf('v1.') !== 0) return null;
      var o = JSON.parse(b64urlDecode(p.slice(3)));
      return o && typeof o === 'object' ? o : null;
    } catch (e) { return null; }
  }

  function stripComments(asm) {                         // keeps every instruction, drops the ; notes (shorter link)
    return String(asm).split('\n').map(function (l) { return l.replace(/\s*;.*$/, ''); }).filter(function (l) { return l.trim() !== ''; }).join('\n') + '\n';
  }
  /* -> { ok, url, code, stripped }  or { ok:false, reason }.  base = page path such as 'chapter-7.html' */
  function vnLink(asmText, inputText, name, base) {
    var code = String(asmText), stripped = false;
    if (code.length > MAX_ASM) { code = stripComments(code); stripped = true; }
    if (code.length > MAX_ASM) return { ok: false, reason: 'The assembly is ' + code.length + ' characters long even without comments; a link can carry at most ' + MAX_ASM + '.' };
    var payload = pack({ code: code, input: String(inputText || ''), settings: { size: 'auto', isa: 'lecture' }, name: String(name || 'Tiny compiler program').slice(0, 80) });
    return { ok: true, url: (base || 'chapter-7.html') + '?vn=' + payload + '#lab', code: code, stripped: stripped };
  }
  function programLink(src, input, name, base) {
    return (base || 'chapter-8.html') + '?tc=' + pack({ src: String(src), input: String(input || ''), name: String(name || '').slice(0, 80) }) + '#lab';
  }
  /* reads ?tc=... out of location.search (or a whole URL); returns {src,input,name} or null */
  function readProgram(search) {
    var m = /[?&]tc=([^&#]+)/.exec(String(search || ''));
    if (!m) return null;
    var o = unpack(m[1]);
    if (!o || typeof o.src !== 'string' || o.src.length > 20000) return null;
    return { src: o.src, input: typeof o.input === 'string' ? o.input.slice(0, 2000) : '', name: typeof o.name === 'string' ? o.name.slice(0, 80) : '' };
  }

  var api = { b64urlEncode: b64urlEncode, b64urlDecode: b64urlDecode, pack: pack, unpack: unpack, vnLink: vnLink, programLink: programLink, readProgram: readProgram, stripComments: stripComments, MAX_ASM: MAX_ASM };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else global.TcShare = api;
})(typeof window !== 'undefined' ? window : this);
