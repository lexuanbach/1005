/* Chapter 9 concept apps — HTTP cookies and three attacks (cookies, atk-syn, atk-ddos, atk-url).
   Engines are plain functions (NetApps.engines.Cookies / SessionServer / SynFlood / Ddos / UrlCheck) tested in Node;
   the UI below only runs in a browser. Everything is a labelled SIMULATION with invented names and RFC 5737 addresses:
   no real exploit code, nothing touches the network. Each app shows the attacker's view AND the defender's switches. */
(function (root) {
  'use strict';
  var NA = (typeof window !== 'undefined' && window.NetApps) || require('./net-apps-core.js');
  try { if (typeof module !== 'undefined' && typeof require === 'function') require('./net-apps-3.js'); } catch (e) { /* the URL analyzer falls back to its own parser */ }
  var hasDom = typeof document !== 'undefined';
  var E = NA.engines;

  /* =====================================================================================
     ENGINES
     ===================================================================================== */

  /* ---------- 9.7 cookies: the session server, the browser's cookie jar, and what an attacker can get ---------- */
  function hexToken(rand, n) { var s = '', d = '0123456789abcdef'; for (var i = 0; i < n; i++) s += d.charAt(Math.floor(rand() * 16)); return s; }

  /* the Set-Cookie header line the server sends; attrs = {secure, httpOnly, sameSite:'Lax'|'None'|null, maxAge:number|null} */
  function setCookieHeader(token, a) {
    a = a || {};
    var parts = ['session=' + token, 'Path=/'];
    if (a.maxAge != null) parts.push('Max-Age=' + a.maxAge);
    if (a.secure) parts.push('Secure');
    if (a.httpOnly) parts.push('HttpOnly');
    if (a.sameSite) parts.push('SameSite=' + a.sameSite);
    return parts.join('; ');
  }

  /* shop.example.com: remembers sessions in a table token -> user. Tokens are random 128-bit hex strings. */
  function SessionServer(opts) {
    opts = opts || {};
    var rand = NA.rng(opts.seed == null ? 2026 : opts.seed), table = {}, order = [];
    var DATE = 'Sun, 18 Oct 2026 08:12:38 GMT';
    function valid(tok) { return !!(tok && table[tok] && table[tok].active); }
    function res(status, reason, headers, body, extra) {
      var r = { status: status, reason: reason, headers: [['Date', DATE], ['Server', 'ShopServer/1.0']].concat(headers || []), body: body || '', setCookie: null };
      if (extra) for (var k in extra) r[k] = extra[k];
      return r;
    }
    return {
      /* req = {method, path, cookie: token|null, body: {user, pass}|null, attrs: cookie attributes for a new session} */
      handle: function (req) {
        var m = req.method, p = req.path, tok = req.cookie || null, who = valid(tok) ? table[tok].user : null;
        if (m === 'GET' && p === '/account') {
          if (who) return res(200, 'OK', [['Content-Type', 'text/html']], 'Welcome back, ' + who + '. Balance: 120 credits.', { user: who });
          return res(302, 'Found', [['Location', '/login']], 'Who are you? Please log in.', { user: null });
        }
        if (m === 'GET' && p === '/login') return res(200, 'OK', [['Content-Type', 'text/html']], 'Login form: user + password.', { user: null });
        if (m === 'POST' && p === '/login') {
          var b = req.body || {};
          if (b.user === 'alice' && b.pass === 'pw') {
            var t = hexToken(rand, 32); table[t] = { user: 'alice', active: true }; order.push(t);
            var h = setCookieHeader(t, req.attrs);
            return res(200, 'OK', [['Set-Cookie', h]], 'Logged in as alice.', { setCookie: { token: t, attrs: req.attrs || {}, header: h }, user: 'alice' });
          }
          return res(401, 'Unauthorized', [], 'Wrong user name or password.', { user: null });
        }
        if (m === 'POST' && p === '/logout') {
          if (who) table[tok].active = false;
          var gone = setCookieHeader('', { maxAge: 0, secure: !!(req.attrs && req.attrs.secure), httpOnly: !!(req.attrs && req.attrs.httpOnly) });
          return res(200, 'OK', [['Set-Cookie', gone]], who ? 'Logged out. The server forgot this session token.' : 'You were not logged in.', { setCookie: { token: tok, attrs: { maxAge: 0 }, header: gone }, user: null });
        }
        if (m === 'POST' && p === '/transfer') {
          if (who) return res(200, 'OK', [['Content-Type', 'text/html']], 'Transferred 100 credits from ' + who + ' to account 4711.', { user: who, transfer: true });
          return res(401, 'Unauthorized', [], 'Who are you? Log in first.', { user: null });
        }
        return res(404, 'Not Found', [], 'Nothing here.', { user: null });
      },
      sessions: function () { return order.map(function (t) { return { token: t, user: table[t].user, active: table[t].active }; }); },
      isValid: valid
    };
  }

  /* the browser's cookie jar for one site. Rules: a Secure cookie is neither kept from nor sent over plain http;
     a session cookie (no Max-Age) disappears when the browser is closed; Max-Age=0 deletes. */
  function Jar() {
    var c = null;
    return {
      store: function (token, attrs, https) {
        attrs = attrs || {};
        if (attrs.maxAge === 0) { var had = !!c; c = null; return had ? 'deleted' : 'nothing'; }
        if (attrs.secure && !https) return 'rejected';
        c = { token: token, attrs: attrs }; return 'stored';
      },
      send: function (https) { if (!c) return null; if (c.attrs.secure && !https) return null; return c.token; },
      closeBrowser: function () { if (c && c.attrs.maxAge == null) { c = null; return true; } return false; },
      clear: function () { var had = !!c; c = null; return had; },
      entry: function () { return c; }
    };
  }

  /* who can steal the session cookie? (simulation of three well-known weaknesses)
     - a sniffer on plain http reads the Cookie header; on https it only sees ciphertext
     - an injected script (XSS) reads document.cookie unless the cookie is HttpOnly
     - https WITHOUT Secure: the cookie would still travel in clear on any stray http:// request to the site (downgradeRisk) */
  function attackOutcome(o) {
    var sniffed = !!o.sniffer && !o.https;
    var xssLeak = !!o.xss && !o.httpOnly;
    var reasons = [];
    if (o.sniffer) reasons.push(o.https ? 'sniffer: only ciphertext on https' : 'sniffer: the Cookie header is readable on plain http');
    if (o.xss) reasons.push(o.httpOnly ? 'script: HttpOnly hides the cookie from document.cookie' : 'script: document.cookie returns the session token');
    return { sniffed: sniffed, xssLeak: xssLeak, stolen: sniffed || xssLeak, downgradeRisk: !!o.sniffer && !!o.https && !o.secure, reasons: reasons };
  }
  /* is the cookie attached to a request that a page on ANOTHER site makes your browser send (cross-site POST)? */
  function crossSiteSent(o) { return !!o.hasCookie && o.sameSite === 'None' && !!o.https; }

  /* ---------- 9.10 SYN flood: a backlog of half-open connections ---------- */
  function synSim(o) {
    var backlog = Math.max(1, o.backlog || 30), timeout = Math.max(1, o.timeout || 30);
    var legitRate = o.legitRate == null ? 0.5 : o.legitRate, attackRate = o.attackRate || 0;
    var cookies = !!o.cookies, rateLimit = !!o.rateLimit, ticks = o.ticks || 200, delay = o.legitDelay || 2;
    var sources = o.attackSources == null ? Infinity : o.attackSources, perSource = o.perSourceLimit || 1;
    var rand = NA.rng((o.seed == null ? 11 : o.seed) * 7919 + 13);
    var slots = [], i;
    for (i = 0; i < backlog; i++) slots.push(null);
    var pend = [], accepted = 0, refused = 0, series = [], firstRefused = null, attackKept = 0, attackDropped = 0, peakAttack = 0;
    function count(f) { var n = Math.floor(f); return n + (rand() < f - n ? 1 : 0); }
    /* time is continuous inside a tick: SYNs arrive at random moments, and a slot freed at moment tau is taken by whichever SYN comes next */
    function release(tau) {
      for (var q = 0; q < backlog; q++) {
        var s = slots[q];
        if (!s) continue;
        if (s.kind === 'L' && tau >= s.born + delay) { slots[q] = null; accepted++; }
        else if (tau >= s.born + timeout) slots[q] = null;
      }
      pend = pend.filter(function (a) { if (tau >= a) { accepted++; return false; } return true; });
    }
    for (var t = 0; t < ticks; t++) {
      var nL = count(legitRate), nA = count(attackRate);
      if (rateLimit && isFinite(sources)) nA = Math.min(nA, sources * perSource);
      var arr = [], k;
      for (k = 0; k < nL; k++) arr.push({ k: 'L', u: rand() });
      for (k = 0; k < nA; k++) arr.push({ k: 'A', u: rand() });
      arr.sort(function (a, b) { return a.u - b.u; });
      var shown = [];
      arr.forEach(function (a) {
        var tau = t + a.u, kind = a.k;
        release(tau);
        if (cookies) {
          if (kind === 'L') { pend.push(tau + delay); shown.push({ k: 'L', r: 'cookie' }); } else shown.push({ k: 'A', r: 'cookie' });
          return;
        }
        var free = -1;
        for (var q = 0; q < backlog; q++) if (!slots[q]) { free = q; break; }
        if (free < 0) {
          if (kind === 'L') { refused++; if (firstRefused === null) firstRefused = t; } else attackDropped++;
          shown.push({ k: kind, r: 'full' });
        } else { slots[free] = { kind: kind, born: tau }; if (kind === 'A') attackKept++; shown.push({ k: kind, r: 'kept' }); }
      });
      release(t + 1);
      var li = 0, ai = 0;
      slots.forEach(function (s) { if (s) { if (s.kind === 'L') li++; else ai++; } });
      if (ai > peakAttack) peakAttack = ai;
      series.push({ t: t, slots: slots.map(function (s) { return s ? (s.kind === 'L' ? 1 : 2) : 0; }), used: li + ai, legitInSlots: li, attackInSlots: ai,
        accepted: accepted, refused: refused, arrivals: shown });
    }
    var resolved = accepted + refused, last = series[series.length - 1];
    var mid = series[Math.floor(ticks / 2)], lateRes = (last.accepted - mid.accepted) + (last.refused - mid.refused);
    return {
      series: series, backlog: backlog, ticks: ticks,
      summary: { legitSuccess: resolved ? accepted / resolved : 1, lateSuccess: lateRes ? (last.accepted - mid.accepted) / lateRes : 1, accepted: accepted, refused: refused, firstRefused: firstRefused, attackSlots: last ? last.attackInSlots : 0,
        peakAttackSlots: peakAttack, attackKept: attackKept, attackDropped: attackDropped, fillTicks: attackRate > 0 ? Math.ceil(backlog / attackRate) : null }
    };
  }
  /* success % up to tick t (resolved attempts so far) */
  function synSuccessAt(sim, t) {
    var s = sim.series[Math.max(0, Math.min(t, sim.series.length - 1))]; var r = s.accepted + s.refused;
    return r ? s.accepted / r : 1;
  }

  /* ---------- 9.10 UDP amplification and botnet DDoS: how much reaches the victim's link ---------- */
  var DDOS = { reflectorMbps: 500, rrlKeep: 0.05, cdnMbps: 100000, legitMbps: 20 };
  function ddosFinish(attackIn, o, notes, extra) {
    var legit = o.legitMbps == null ? DDOS.legitMbps : o.legitMbps, cdnCap = o.cdnMbps == null ? DDOS.cdnMbps : o.cdnMbps;
    var reaching = attackIn;
    if (o.cdn) {
      var scrubbed = Math.min(attackIn, cdnCap); reaching = attackIn - scrubbed;
      notes.push(attackIn <= cdnCap ? 'CDN/scrubbing: all attack traffic is absorbed before the victim’s link.' : 'CDN/scrubbing: absorbs its capacity, but the flood is bigger than the CDN, so the rest still gets through.');
    }
    var load = reaching + legit, share = Math.min(1, o.victimMbps / load);
    var r = { attackInMbps: attackIn, attackReachingMbps: reaching, legitMbps: legit, victimLoadMbps: load, legitShare: share, delivered: legit * share, overloaded: load > o.victimMbps, notes: notes };
    if (extra) for (var k in extra) r[k] = extra[k];
    return r;
  }
  function ddosReflection(o) {
    var notes = [], amp = o.amp == null ? 30 : o.amp, queries = o.attackerMbps;
    if (o.ingress) {
      notes.push('Ingress filtering (RFC 2827): the attacker’s ISP drops packets whose source address is not one of its own, so the forged queries never leave.');
      return ddosFinish(0, o, notes, { queriesMbps: 0, factor: 0, ingressBlocked: true });
    }
    var out = queries * amp, cap = (o.reflectors || 1) * (o.reflectorMbps || DDOS.reflectorMbps);
    if (out > cap) { notes.push('The reflectors’ own uplinks limit the flood to ' + cap + ' Mbps.'); out = cap; }
    if (o.rrl) { out *= DDOS.rrlKeep; notes.push('Response-rate limiting / no open resolvers: the reflectors refuse most repeated answers.'); }
    return ddosFinish(out, o, notes, { queriesMbps: queries, factor: queries ? out / queries : 0, ingressBlocked: false });
  }
  function ddosBotnet(o) {
    var out = (o.bots || 0) * (o.perBotMbps || 0);
    return ddosFinish(out, o, [], { factor: 1, ingressBlocked: false });
  }

  /* ---------- 9.10 lookalike URLs ---------- */
  var TRUSTED = ['example.com', 'example.org'];
  function splitUrl(url) {
    var m = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/([^\/?#]*)([\s\S]*)$/.exec(String(url == null ? '' : url).trim());
    if (!m) return null;
    var auth = m[2], at = auth.lastIndexOf('@'), userinfo = at >= 0 ? auth.slice(0, at) : null, hp = at >= 0 ? auth.slice(at + 1) : auth;
    var pm = /^([^:]*)(?::(\d*))?$/.exec(hp);
    if (!pm) return null;
    return { scheme: m[1].toLowerCase(), userinfo: userinfo, host: pm[1].toLowerCase(), port: pm[2] || null, rest: m[3] };
  }
  function lookalikeNormalise(h) { return h.replace(/rn/g, 'm').replace(/vv/g, 'w').replace(/1/g, 'l').replace(/0/g, 'o').replace(/5/g, 's'); }
  function belongs(host, trusted) { return trusted.some(function (t) { return host === t || host.slice(-(t.length + 1)) === '.' + t; }); }
  function analyzeUrl(url, trusted) {
    trusted = trusted || TRUSTED;
    var sp = splitUrl(url);
    if (!sp || (sp.scheme !== 'http' && sp.scheme !== 'https')) return { ok: false, error: 'Write a full address such as https://www.example.com/login (this lab reads http and https).' };
    if (!sp.host || !/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(sp.host)) return { ok: false, error: 'The host “' + sp.host + '” is not a valid host name (letters, digits, dots and hyphens).' };
    if (sp.port !== null && (!/^[0-9]{1,5}$/.test(sp.port) || +sp.port < 1 || +sp.port > 65535)) return { ok: false, error: 'The port must be a number from 1 to 65535.' };
    var web = E && E.web, clean = sp.scheme + '://' + sp.host + (sp.port ? ':' + sp.port : '') + sp.rest;
    if (web && web.parseUrl) { var pu = web.parseUrl(clean); if (!pu.ok) return { ok: false, error: pu.error }; }
    var labels = sp.host.split('.'), isIp = /^\d+\.\d+\.\d+\.\d+$/.test(sp.host);
    var registered = isIp ? sp.host : labels.slice(-2).join('.'), subdomain = isIp ? '' : labels.slice(0, -2).join('.');
    var ok = belongs(sp.host, trusted), flags = [];
    function flag(id, sev, title, text) { flags.push({ id: id, sev: sev, title: title, text: text }); }
    if (sp.userinfo !== null) flag('userinfo', 'red', 'A name before the @', 'Everything before the @ (“' + sp.userinfo + '”) is only a user name that the browser ignores. It connects to ' + sp.host + '.');
    if (!ok) {
      trusted.forEach(function (t) {
        if ((sp.host + '.').indexOf(t + '.') === 0 || sp.host.indexOf('.' + t + '.') >= 0) flag('subdomain', 'red', 'Trusted name in the front', '“' + t + '” is only a sub-domain label here. Read the host from the right: it belongs to ' + registered + '.');
      });
      var base = trusted.map(function (t) { return t.split('.')[0]; });
      var hy = trusted.some(function (t, i) { return sp.host.indexOf(t + '-') >= 0 || labels.some(function (l) { return l.indexOf(base[i] + '-') === 0; }); });
      if (hy) flag('hyphen', 'red', 'A hyphen makes it look joined', 'A hyphen is part of one label, not a dot: “' + registered + '” is a different name from the real site.');
      var norm = lookalikeNormalise(sp.host);
      if (norm !== sp.host && belongs(norm, trusted)) flag('lookalike', 'red', 'Look-alike characters', 'Some characters imitate others (digit 1 for l, “rn” for m, …). Read letter by letter: “' + sp.host + '”.');
      if (labels.some(function (l) { return l.slice(0, 4) === 'xn--'; })) flag('punycode', 'red', 'Encoded foreign letters (xn--)', 'A label starting with xn-- is an internationalised name in ASCII; browsers may show it with letters that merely resemble Latin ones.');
      if (trusted.some(function (t) { return sp.rest.toLowerCase().indexOf(t) >= 0; })) flag('path-decoy', 'red', 'The real name only appears in the path', 'The path (after the first /) is just a file path on ' + sp.host + '; anyone can write the trusted name there.');
      if (isIp) flag('ip-host', 'red', 'A bare number instead of a name', 'A raw IP address has no name behind it that you could recognise or check.');
    }
    if (sp.scheme === 'http') flag('plain-http', 'info', 'No padlock (plain http)', 'The conversation is not encrypted. That is a weakness, but it is not by itself phishing.');
    var red = flags.some(function (f) { return f.sev === 'red'; });
    return { ok: true, scheme: sp.scheme, userinfo: sp.userinfo, host: sp.host, port: sp.port, rest: sp.rest, registered: registered, subdomain: subdomain, isIp: isIp,
      trustedHost: ok, flags: flags, verdict: ok ? 'genuine' : red ? 'phishing' : 'unknown' };
  }
  /* the game's bank: genuine addresses of the two invented sites and phishing-style addresses on reserved names only */
  var BANK = [
    { url: 'https://www.example.com/login', label: 'genuine', trick: 'none', note: 'The host ends in example.com, and nothing else is going on.' },
    { url: 'https://mail.example.com/inbox?folder=sent', label: 'genuine', trick: 'none', note: 'A sub-domain of example.com: its owner controls everything in front of the name.' },
    { url: 'http://www.example.com/', label: 'genuine', trick: 'plain-http', note: 'The right host, but plain http: not encrypted. Weak, yet not phishing.' },
    { url: 'https://example.org/donate', label: 'genuine', trick: 'none', note: 'The host is exactly example.org.' },
    { url: 'https://shop.example.org:8443/cart', label: 'genuine', trick: 'none', note: 'An unusual port is not a trick: the host is still shop.example.org.' },
    { url: 'https://login.example.com/?next=/account#top', label: 'genuine', trick: 'none', note: 'The host is login.example.com; the rest is path, query and fragment.' },
    { url: 'https://example.com.account-check.test/login', label: 'phishing', trick: 'subdomain', note: 'Read the host from the right: it belongs to account-check.test. “example.com” is just a sub-domain label.' },
    { url: 'https://www.example.com.verify-id.invalid/', label: 'phishing', trick: 'subdomain', note: 'The real owner is verify-id.invalid; www.example.com is only decoration in front of it.' },
    { url: 'https://login.example.com@secure-update.test/', label: 'phishing', trick: 'userinfo', note: 'Before the @ is a user name the browser ignores. The host is secure-update.test.' },
    { url: 'https://examp1e.com/signin', label: 'phishing', trick: 'lookalike', note: 'The digit 1 stands in for the letter l: examp1e.com is a different name.' },
    { url: 'https://www.exarnple.org/donate', label: 'phishing', trick: 'lookalike', note: '“rn” looks like “m” in many fonts: exarnple is not example.' },
    { url: 'https://example.com-support.test/help', label: 'phishing', trick: 'hyphen', note: 'The hyphen glues “com-support” into one label: the owner is com-support.test.' },
    { url: 'https://example-login.test/', label: 'phishing', trick: 'hyphen', note: 'example-login.test is a different name from example.com, however similar it sounds.' },
    { url: 'https://secure-update.test/example.com/login', label: 'phishing', trick: 'path-decoy', note: 'The trusted name is only in the path. The host (before the first /) is secure-update.test.' },
    { url: 'https://xn--exmple-cua.test/login', label: 'phishing', trick: 'punycode', note: 'xn-- marks an encoded name that may be displayed with look-alike letters; here it is not example.com.' },
    { url: 'https://203.0.113.77/example.com/login', label: 'phishing', trick: 'ip-host', note: 'A bare IP address instead of a name, with the trusted name hidden in the path.' }
  ];
  var TRICKS = {
    none: 'Genuine address', 'plain-http': 'Genuine but plain http', subdomain: 'Trusted name in the front (sub-domain trick)', userinfo: 'A name before the @',
    lookalike: 'Look-alike characters', hyphen: 'Hyphen trick', 'path-decoy': 'Trusted name only in the path', punycode: 'Encoded (xn--) name', 'ip-host': 'Bare IP address'
  };
  /* a round: 5 genuine + 7 phishing, shuffled with a seeded rng (same seed → same round) */
  function pickRound(seed) {
    var rand = NA.rng((seed || 1) * 104729 + 7);
    function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rand() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
    var g = shuffle(BANK.filter(function (b) { return b.label === 'genuine'; })).slice(0, 5), p = shuffle(BANK.filter(function (b) { return b.label === 'phishing'; })).slice(0, 7);
    return shuffle(g.concat(p));
  }
  /* answers: array of 'genuine' | 'phishing' (or null = not answered) aligned with round */
  function scoreRound(round, answers) {
    var correct = 0, tally = {};
    round.forEach(function (b, i) {
      var t = tally[b.trick] || (tally[b.trick] = { seen: 0, missed: 0 });
      t.seen++;
      if (answers[i] === b.label) correct++; else t.missed++;
    });
    return { correct: correct, total: round.length, tally: tally };
  }

  E.Cookies = { setCookieHeader: setCookieHeader, Jar: Jar, attackOutcome: attackOutcome, crossSiteSent: crossSiteSent };
  E.SessionServer = SessionServer;
  E.SynFlood = { sim: synSim, successAt: synSuccessAt };
  E.Ddos = { reflection: ddosReflection, botnet: ddosBotnet, defaults: DDOS };
  E.UrlCheck = { analyze: analyzeUrl, splitUrl: splitUrl, bank: BANK, tricks: TRICKS, pickRound: pickRound, scoreRound: scoreRound, trusted: TRUSTED };

  /* =====================================================================================
     UI (browser only)
     ===================================================================================== */
  if (hasDom) {
    var el = NA.el, S = NA.svg, esc = NA.esc;

    function tryLine(text) { var p = el('p', 'na-try'); p.innerHTML = '<b>Try this:</b> ' + text; return p; }
    function check(label, checked, onChange, title) {
      var w = el('label', 'na-chk'); var i = el('input'); i.type = 'checkbox'; i.checked = !!checked;
      i.addEventListener('change', function () { onChange(i.checked); });
      w.appendChild(i); w.appendChild(el('span', null, label)); if (title) w.title = title;
      return { wrap: w, input: i, set: function (v) { i.checked = !!v; }, disable: function (d) { i.disabled = !!d; w.classList.toggle('off', !!d); } };
    }
    /* readable stand-in for ciphertext: deterministic noise of the same length (an illustration, not real TLS) */
    function noise(text, seed) {
      var out = '', h = (seed || 5) >>> 0, chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/=';
      for (var i = 0; i < text.length; i++) {
        var c = text.charAt(i);
        if (c === '\n') { out += '\n'; continue; }
        h = Math.imul(h ^ text.charCodeAt(i), 2654435761) >>> 0; h ^= h >>> 15;
        out += chars.charAt(h % chars.length);
      }
      return out;
    }

    /* ---------------------------------------------------------------------------------
       9.7  cookies
       --------------------------------------------------------------------------------- */
    NA.register('cookies', {
      title: 'HTTP forgets you: cookies and sessions',
      hint: 'Simulated shop.example.com (203.0.113.10) — nothing leaves your browser.',
      build: function (host) {
        host.classList.add('na-cookies');
        var st = { https: false, secure: false, httpOnly: false, sameSite: 'Lax', maxAge: null, sniffer: false, xss: false };
        var server, jar, atkToken, loot, log, last, flash = {}, story = 0, seedN = 0;
        var run = NA.runner();
        function reset() {
          seedN++; server = SessionServer({ seed: 100 + seedN }); jar = Jar(); atkToken = null; loot = null; log = []; last = null; flash = {};
        }
        reset();
        host.appendChild(tryLine('press <b>① Open /account</b> (the server has no idea who you are), then <b>② Log in</b>, then <b>③ Open /account</b> again. Next switch on <b>Attacker sniffs the café Wi-Fi</b> with plain HTTP, log in again and press <b>Replay</b>.'));

        /* controls */
        var c1 = el('div', 'na-controls tight'); host.appendChild(c1);
        var proto = NA.segmented([{ value: 'http', label: 'http://' }, { value: 'https', label: 'https:// (TLS)' }], 'http', function (v) { st.https = v === 'https'; syncAttrs(); paint(); say.say(protoText()); }, 'Protocol');
        c1.appendChild(NA.field('Connection', proto.wrap));
        var cSecure = check('Secure', st.secure, function (v) { st.secure = v; paint(); }, 'Only ever send this cookie over https');
        var cHttpOnly = check('HttpOnly', st.httpOnly, function (v) { st.httpOnly = v; paint(); }, 'Hide this cookie from scripts running in the page');
        var sameSel = NA.select([{ value: 'Lax', label: 'SameSite=Lax' }, { value: 'None', label: 'SameSite=None' }], 'Lax', function (v) { st.sameSite = v; syncAttrs(); paint(); });
        var ageSel = NA.select([{ value: 'session', label: 'session cookie' }, { value: '3600', label: 'Max-Age=3600' }], 'session', function (v) { st.maxAge = v === 'session' ? null : +v; paint(); });
        c1.appendChild(NA.field('Cookie flags set by the server (for the next login)', (function () { var w = el('div', 'na-chkrow'); w.appendChild(cSecure.wrap); w.appendChild(cHttpOnly.wrap); w.appendChild(sameSel); w.appendChild(ageSel); return w; })(), 'grow'));
        function syncAttrs() {
          if (!st.https) { st.secure = false; cSecure.set(false); cSecure.disable(true); if (st.sameSite === 'None') { st.sameSite = 'Lax'; sameSel.value = 'Lax'; } sameSel.options[1].disabled = true; }
          else { cSecure.disable(false); sameSel.options[1].disabled = false; }
          if (st.sameSite === 'None' && st.https) { st.secure = true; cSecure.set(true); cSecure.disable(true); }
        }
        var c2 = el('div', 'na-controls tight'); host.appendChild(c2);
        var btns = {};
        function addBtn(key, label, cls, fn, title) { var b = NA.button(label, cls, fn, title); btns[key] = b; c2.appendChild(b); return b; }
        addBtn('open', '① Open /account', '', function () { act('open'); }, 'GET /account — with the cookie if the browser has one');
        addBtn('login', '② Log in', '', function () { act('login'); }, 'POST /login with user alice');
        addBtn('open2', '③ Open /account', '', function () { act('open'); }, 'GET /account again');
        addBtn('clear', '④ Clear cookies', '', function () { act('clear'); });
        addBtn('logout', '⑤ Log out', '', function () { act('logout'); });
        addBtn('close', 'Close the browser', '', function () { act('close'); }, 'A session cookie is dropped when the browser closes; Max-Age keeps it');
        addBtn('play', '▶ Play the story', 'primary', function () { playStory(); }, 'Runs ①, ② and ③');
        addBtn('reset', 'Reset', '', function () { run.cancel(); reset(); say.say(introText()); paint(); });

        /* stage: browser | wire | server */
        var stage = el('div', 'na-cookies-stage'); host.appendChild(stage);
        var bBox = el('div', 'na-cookies-card brw'), wBox = el('div', 'na-cookies-wire'), sBox = el('div', 'na-cookies-card srv');
        stage.appendChild(bBox); stage.appendChild(wBox); stage.appendChild(sBox);

        /* attacker panel */
        var atk = el('div', 'na-cookies-atk'); host.appendChild(atk);
        atk.appendChild(el('div', 'na-cookies-atk-h', 'What an attacker could do — a simulation, to show why each defence exists'));
        var ar = el('div', 'na-controls tight'); atk.appendChild(ar);
        var cSniff = check('Attacker sniffs the café Wi-Fi', false, function (v) { st.sniffer = v; paint(); say.say(sniffText()); }, 'Someone on the same open Wi-Fi network copies the packets');
        var cXss = check('A script is injected into the page (XSS)', false, function (v) { st.xss = v; paint(); say.say(xssText()); }, 'Cross-site scripting: the attacker gets their JavaScript to run inside the shop’s page');
        var rowSw = el('div', 'na-chkrow'); rowSw.appendChild(cSniff.wrap); rowSw.appendChild(cXss.wrap); ar.appendChild(rowSw);
        var bReplay = NA.button('Replay the stolen cookie from another browser', 'danger', function () { act('replay'); }, 'The attacker sends GET /account with the stolen cookie');
        var bCsrf = NA.button('An evil page makes your browser POST /transfer', 'danger', function () { act('csrf'); }, 'A page on evil.test makes your browser send a request to the shop (cross-site request forgery)');
        ar.appendChild(bReplay); ar.appendChild(bCsrf);
        var lootBox = el('div', 'na-cookies-loot'); atk.appendChild(lootBox);

        var say = NA.narrator(); host.appendChild(say.node);
        var legend = el('p', 'na-note', 'Real session tokens are long, random and unguessable (here 128 bits, invented). An attacker who holds one does not need the password: to the server, whoever sends the cookie is alice.');
        host.appendChild(legend);

        function attrs() { return { secure: st.secure, httpOnly: st.httpOnly, sameSite: st.sameSite, maxAge: st.maxAge }; }
        function short(t) { return t ? t.slice(0, 8) + '…' : ''; }
        function rawReq(r) { return r.method + ' ' + r.path + ' HTTP/1.1\nHost: shop.example.com' + (r.cookie ? '\nCookie: session=' + r.cookie : '') + (r.body ? '\nContent-Type: application/x-www-form-urlencoded\n\nuser=' + r.body.user + '&pass=•••' : ''); }
        function rawRes(r) { return 'HTTP/1.1 ' + r.status + ' ' + r.reason + '\n' + r.headers.filter(function (h) { return h[0] !== 'Date' && h[0] !== 'Server'; }).map(function (h) { return h[0] + ': ' + h[1]; }).join('\n') + (r.headers.length > 2 ? '\n' : '') + '\n' + r.body; }
        function colourise(text) {
          var f = document.createDocumentFragment();
          text.split('\n').forEach(function (line, i, a) {
            var sp = el('span', /^(Set-Cookie|Cookie):/.test(line) ? 'hot' : null, line); f.appendChild(sp); if (i < a.length - 1) f.appendChild(document.createTextNode('\n'));
          });
          return f;
        }
        function exchange(who, method, path, body, opts) {
          opts = opts || {};
          var tok = who === 'user' ? jar.send(st.https) : atkToken;
          var req = { method: method, path: path, cookie: tok, body: body || null, attrs: attrs() };
          var res = server.handle(req);
          var jarNote = '';
          if (who === 'user' && res.setCookie) {
            var outc = jar.store(res.setCookie.token, res.setCookie.attrs, st.https);
            jarNote = outc;
          }
          var out = E.Cookies.attackOutcome({ https: st.https, secure: st.secure, httpOnly: st.httpOnly, xss: st.xss, sniffer: st.sniffer });
          var gained = null;
          if (who === 'user') {
            if (out.sniffed) {
              var seen = tok || (res.setCookie && res.setCookie.token);
              if (seen) { loot = { token: seen, via: 'sniff' }; atkToken = seen; gained = 'sniff'; }
            }
            if (out.xssLeak && path === '/account' && jar.entry()) { loot = { token: jar.entry().token, via: 'xss' }; atkToken = jar.entry().token; gained = gained || 'xss'; }
          }
          var wire = rawReq(req) + '\n\n' + rawRes(res);
          last = { who: who, req: req, res: res, jarNote: jarNote, wire: wire, gained: gained, opts: opts };
          log.push({ who: who, method: method, path: path, status: res.status, reason: res.reason, cookie: tok ? short(tok) : '—', note: opts.note || '' });
          if (log.length > 8) log.shift();
          flash = { wire: true, jar: !!jarNote, server: !!res.setCookie || method === 'POST' };
          return { req: req, res: res, tok: tok, out: out, gained: gained, jarNote: jarNote };
        }

        function act(kind) {
          var r, msg;
          if (kind === 'open') {
            r = exchange('user', 'GET', '/account', null, { note: '' });
            if (r.res.status === 302) msg = '<b>302 → /login.</b> The request carried <b>no cookie</b>, so the server could not tell who you are. HTTP is <b>stateless</b>: every request arrives as a stranger — the server remembers nothing between them.';
            else msg = '<b>200 OK — “' + esc(r.res.body) + '”</b> This time the request carried <code>Cookie: session=' + short(r.tok) + '</code>. The server looked the token up in its table and recognised <b>alice</b>. That cookie is the only memory in the whole conversation.';
            msg += leakText(r);
          } else if (kind === 'login') {
            r = exchange('user', 'POST', '/login', { user: 'alice', pass: 'pw' }, { note: '' });
            if (r.jarNote === 'stored') msg = '<b>200 OK + Set-Cookie.</b> The server made a random token, stored “token → alice” in its session table and sent it in <code>Set-Cookie</code>. The browser keeps it in its cookie jar and will attach it to every later request. ' + attrText() + leakText(r);
            else msg = '<b>Cookie refused.</b> ' + (r.jarNote === 'rejected' ? 'The cookie is marked <code>Secure</code> but arrived over plain http, so the browser will not keep it.' : '');
          } else if (kind === 'clear') {
            var had = jar.clear(); r = null;
            msg = had ? 'You cleared the cookie jar. The browser has forgotten the session token — but the <b>server still has the session open</b> (look at its table). Open /account: you are a stranger again, even though the server still knows alice is logged in.' : 'The jar was already empty.';
            last = null; flash = { jar: true };
          } else if (kind === 'logout') {
            r = exchange('user', 'POST', '/logout', null, { note: '' });
            msg = '<b>Logged out.</b> The server marked the token <b>inactive</b> in its table and told the browser to delete the cookie (<code>Max-Age=0</code>). Any <em>copy</em> of that token — including one an attacker stole — is now useless. <b>Defence: log out, and give sessions an expiry.</b>';
          } else if (kind === 'close') {
            var gone = jar.closeBrowser();
            msg = gone ? 'You closed the browser. A <b>session cookie</b> (no Max-Age) lives only in memory, so it is gone. Choose <code>Max-Age=3600</code> and the cookie would survive for an hour.' : (jar.entry() ? 'The cookie has <code>Max-Age</code>, so it survives the restart: you stay logged in for its lifetime.' : 'There was no cookie to lose.');
            flash = { jar: true }; last = null;
          } else if (kind === 'replay') {
            if (!atkToken) { say.say('<b>Nothing to replay.</b> The attacker has not stolen a token yet. ' + howToSteal()); paint(); return; }
            r = exchange('attacker', 'GET', '/account', null, { note: 'attacker' });
            if (r.res.status === 200) msg = '<b class="bad">Session hijacked.</b> The attacker’s browser sent the stolen cookie and the server answered <b>“' + esc(r.res.body) + '”</b> — no password was needed. <b>Stopped by:</b> HTTPS (nothing readable to steal), HttpOnly (a script cannot read it), logging out or letting the session expire (the stolen copy dies).';
            else msg = '<b class="ok">Replay failed.</b> The server does not accept that token any more (' + r.res.status + '): the session was ended with <b>logout</b>, so a stolen copy is worthless.';
          } else if (kind === 'csrf') {
            var has = jar.send(st.https);
            var sent = E.Cookies.crossSiteSent({ hasCookie: !!has, sameSite: st.sameSite, https: st.https });
            var req = { method: 'POST', path: '/transfer', cookie: sent ? has : null, body: null, attrs: attrs() };
            var res = server.handle(req);
            last = { who: 'evil', req: req, res: res, jarNote: '', wire: '', gained: null, opts: {} };
            log.push({ who: 'evil.test', method: 'POST', path: '/transfer', status: res.status, reason: res.reason, cookie: sent ? short(has) : '—', note: 'cross-site' }); if (log.length > 8) log.shift();
            flash = { wire: true, server: true };
            if (!has) msg = 'You are not logged in, so there is no cookie to abuse. Log in first, then try again.';
            else if (sent) msg = '<b class="bad">Request forged.</b> The evil page cannot read your cookie, but with <code>SameSite=None</code> the browser attaches it to the cross-site request anyway — the server sees alice and moves the money. <b>Stopped by:</b> <code>SameSite=Lax</code> (the default in modern browsers) and anti-forgery tokens.';
            else msg = '<b class="ok">Blocked.</b> <code>SameSite=Lax</code> tells the browser not to attach the cookie to requests started by <em>another</em> site, so the server answers “Who are you?” (401).';
          }
          say.say(msg || '');
          paint();
        }
        function attrText() { var a = attrs(); var bits = []; if (a.secure) bits.push('<code>Secure</code>'); if (a.httpOnly) bits.push('<code>HttpOnly</code>'); bits.push('<code>SameSite=' + a.sameSite + '</code>'); bits.push(a.maxAge == null ? 'a <em>session</em> cookie' : '<code>Max-Age=' + a.maxAge + '</code>'); return 'Flags this time: ' + bits.join(', ') + '.'; }
        function leakText(r) {
          var out = r.out, parts = [];
          if (r.gained === 'sniff') parts.push('<span class="bad">The sniffer copied the cookie</span> — on plain http it is readable.');
          else if (st.sniffer && st.https) parts.push('The sniffer sees only ciphertext.' + (out.downgradeRisk ? ' <b>But</b> without <code>Secure</code> the browser would still send this cookie in clear on any stray <code>http://</code> request to the site.' : ''));
          if (r.gained === 'xss') parts.push('<span class="bad">The injected script read <code>document.cookie</code> and sent the token to the attacker.</span>');
          else if (st.xss && jar.entry() && st.httpOnly) parts.push('The injected script tried <code>document.cookie</code> but <code>HttpOnly</code> hid the cookie.');
          return parts.length ? '<br>' + parts.join(' ') : '';
        }
        function howToSteal() { return st.sniffer || st.xss ? 'Log in and open /account while the attack is on.' : 'Switch on the sniffer or the injected script first, then log in.'; }
        function protoText() { return st.https ? 'Switched to <b>https</b>: the same requests now travel inside TLS. A sniffer sees only noise, and the <code>Secure</code> flag becomes possible.' : 'Switched to <b>plain http</b>: every header, <code>Cookie</code> included, is readable by anyone on the path.'; }
        function sniffText() { return st.sniffer ? (st.https ? 'A sniffer is listening, but this is https: it will only see ciphertext.' : '<b>A sniffer is on the Wi-Fi</b> and this is plain http: it can read every header, cookies included. Log in and open /account, then watch the attacker’s loot.') : 'The sniffer is off.'; }
        function xssText() { return st.xss ? '<b>XSS</b> (cross-site scripting) means the attacker got their own JavaScript to run inside the shop’s page, for example through an unchecked comment box. Scripts can read <code>document.cookie</code> — unless the cookie is <code>HttpOnly</code>. (HttpOnly only hides the cookie from scripts; it does not stop the script from acting as you.)' : 'No injected script.'; }
        function introText() { return 'HTTP has <b>no memory</b>. Press <b>① Open /account</b> to see what the server knows about you right now: nothing.'; }
        function playStory() {
          var g = run.start(); btns.play.disabled = true;
          (async function () {
            var steps = ['open', 'login', 'open'];
            for (var i = 0; i < steps.length; i++) {
              act(steps[i]);
              if (!(await run.sleep(g, NA.dur(1500)))) return;
            }
            btns.play.disabled = false;
          })();
        }

        function pill(t, cls) { return el('span', 'na-cookies-pill ' + (cls || ''), t); }
        function paint() {
          NA.clear(bBox); NA.clear(wBox); NA.clear(sBox); NA.clear(lootBox);
          /* browser */
          bBox.appendChild(el('div', 'na-cookies-h', '🖥 Your browser'));
          bBox.appendChild(el('div', 'na-lab', 'Cookie jar for shop.example.com'));
          var e = jar.entry(), jarEl = el('div', 'na-cookies-jar' + (flash.jar ? ' flash' : ''));
          if (!e) jarEl.appendChild(el('em', null, 'empty — the browser has nothing to send'));
          else {
            jarEl.appendChild(el('div', 'na-mono', 'session=' + e.token));
            var pl = el('div', 'na-cookies-pills');
            if (e.attrs.secure) pl.appendChild(pill('Secure', 'a')); if (e.attrs.httpOnly) pl.appendChild(pill('HttpOnly', 'b'));
            pl.appendChild(pill('SameSite=' + e.attrs.sameSite, 'c')); pl.appendChild(pill(e.attrs.maxAge == null ? 'session cookie' : 'Max-Age=' + e.attrs.maxAge, 'd'));
            jarEl.appendChild(pl);
          }
          bBox.appendChild(jarEl);
          var page = last && last.who === 'user' && last.res ? last.res.body : '';
          bBox.appendChild(el('div', 'na-lab', 'Page on screen'));
          bBox.appendChild(el('div', 'na-cookies-page', page || '—'));
          /* wire */
          wBox.appendChild(el('div', 'na-lab', last ? (last.who === 'attacker' ? 'Attacker → server' : last.who === 'evil' ? 'evil.test page → server (cross-site)' : 'Browser ⇄ server') + (st.https ? ' · 🔒 TLS' : ' · plain http') : 'Browser ⇄ server'));
          if (last) {
            var q = el('pre', 'na-cookies-pre' + (flash.wire ? ' flash' : '')); q.appendChild(colourise(rawReq(last.req)));
            var r = el('pre', 'na-cookies-pre res' + (flash.wire ? ' flash' : '')); r.appendChild(colourise(rawRes(last.res)));
            wBox.appendChild(el('div', 'na-cookies-dir', '→ request')); wBox.appendChild(q);
            wBox.appendChild(el('div', 'na-cookies-dir', '← response ' + last.res.status)); wBox.appendChild(r);
          } else wBox.appendChild(el('div', 'na-cookies-empty', 'Press ① to send the first request. The highlighted lines are the only memory HTTP has: <Set-Cookie> from the server, <Cookie> from the browser.'.replace(/<([A-Za-z-]+)>/g, '$1')));
          /* server */
          sBox.appendChild(el('div', 'na-cookies-h', '🗄 shop.example.com'));
          sBox.appendChild(el('div', 'na-lab', 'Session table (token → user)'));
          var ses = server.sessions(), sl = el('div', 'na-cookies-sess' + (flash.server ? ' flash' : ''));
          if (!ses.length) sl.appendChild(el('em', null, 'no sessions yet'));
          ses.forEach(function (s) { var row = el('div', 'na-cookies-srow' + (s.active ? '' : ' dead')); row.appendChild(el('span', 'na-mono', short(s.token))); row.appendChild(el('span', null, '→ ' + s.user)); row.appendChild(el('span', 'na-cookies-pill ' + (s.active ? 'ok' : 'x'), s.active ? '✓ active' : '✗ ended')); sl.appendChild(row); });
          sBox.appendChild(sl);
          sBox.appendChild(el('div', 'na-lab', 'Requests seen'));
          var lt = el('table', 'na-table na-cookies-log'); var th = el('tr'); ['Who', 'Request', 'Status'].forEach(function (h) { th.appendChild(el('th', null, h)); }); lt.appendChild(th);
          if (!log.length) { var tr0 = el('tr'); var td0 = el('td', null, 'none yet'); td0.colSpan = 3; tr0.appendChild(td0); lt.appendChild(tr0); }
          log.slice(-5).forEach(function (l) { var tr = el('tr', l.who === 'user' ? '' : 'bad'); [l.who === 'user' ? 'you' : l.who, l.method + ' ' + l.path, l.status].forEach(function (x) { tr.appendChild(el('td', null, String(x))); }); lt.appendChild(tr); });
          sBox.appendChild(el('div', 'na-tbl-scroll-x', lt));
          /* attacker loot */
          var out = E.Cookies.attackOutcome({ https: st.https, secure: st.secure, httpOnly: st.httpOnly, xss: st.xss, sniffer: st.sniffer });
          lootBox.appendChild(el('div', 'na-lab', 'What the attacker sees'));
          var lines = el('div', 'na-cookies-seen');
          if (st.sniffer) {
            var l1 = el('div', 'na-cookies-sniff'); l1.appendChild(el('b', null, '📡 Sniffer (Wi-Fi): '));
            if (!last || last.who !== 'user') l1.appendChild(document.createTextNode('waiting for traffic…'));
            else if (st.https) l1.appendChild(el('span', 'na-mono scr', noise(last.req.method + ' ' + last.req.path + (last.req.cookie ? ' session=' + last.req.cookie : ''), 3).slice(0, 60) + '…  (ciphertext)'));
            else l1.appendChild(el('span', 'na-mono', (last.req.cookie ? 'Cookie: session=' + last.req.cookie : (last.res.setCookie ? 'Set-Cookie: session=' + last.res.setCookie.token : '(no cookie in this message)'))));
            lines.appendChild(l1);
          }
          if (st.xss) {
            var l2 = el('div', 'na-cookies-sniff'); l2.appendChild(el('b', null, '💉 Injected script: '));
            var ent = jar.entry();
            l2.appendChild(el('span', 'na-mono', ent ? (out.xssLeak ? 'document.cookie = "session=' + ent.token + '"' : 'document.cookie = ""   (HttpOnly: hidden from scripts)') : 'document.cookie = ""   (nothing to read: no cookie yet)'));
            lines.appendChild(l2);
          }
          if (!st.sniffer && !st.xss) lines.appendChild(el('em', null, 'The attacker is not attacking yet: switch on one of the two attacks above.'));
          lootBox.appendChild(lines);
          var lt2 = el('div', 'na-cookies-stolen' + (atkToken ? ' has' : ''));
          lt2.appendChild(el('b', null, 'Stolen token: ')); lt2.appendChild(el('span', 'na-mono', atkToken ? atkToken + (server.isValid(atkToken) ? '  (still valid)' : '  (ended: useless)') : 'none'));
          lootBox.appendChild(lt2);
          bReplay.disabled = !atkToken;
          flash = {};
        }
        syncAttrs();
        say.say(introText());
        paint();
      }
    });

    /* ---------------------------------------------------------------------------------
       9.10  SYN flood
       --------------------------------------------------------------------------------- */
    NA.register('atk-syn', {
      title: 'SYN flood: filling the waiting room',
      hint: 'A simulated TCP server — each tick is about 100 ms. Nothing touches the network.',
      build: function (host) {
        host.classList.add('na-atk-syn');
        var st = { backlog: 30, timeout: 30, legit: 0.5, attack: 20, cookies: false, rate: false, spoof: true, t: 0, playing: false };
        var sim = null, run = NA.runner(), CW = 340, cell = 30;
        host.appendChild(tryLine('press <b>Play</b> with no defence and watch the waiting room fill with grey “?” slots from spoofed addresses; then tick <b>SYN cookies</b> and play again.'));

        var chips = el('div', 'na-chips'); chips.appendChild(el('span', 'na-lab', 'Scenarios'));
        [['Quiet day', { attack: 0, cookies: false, rate: false, backlog: 30 }],
         ['Under attack', { attack: 20, cookies: false, rate: false, backlog: 30, spoof: true }],
         ['Bigger backlog (100)', { attack: 20, cookies: false, rate: false, backlog: 100, spoof: true }],
         ['SYN cookies on', { attack: 20, cookies: true, rate: false, backlog: 30, spoof: true }],
         ['Rate limit, forged sources', { attack: 20, cookies: false, rate: true, backlog: 100, spoof: true }],
         ['Rate limit, 2 real machines', { attack: 20, cookies: false, rate: true, backlog: 100, spoof: false }]].forEach(function (p) {
          chips.appendChild(NA.chip(p[0], function () { Object.keys(p[1]).forEach(function (k) { st[k] = p[1][k]; }); syncControls(); restart(true); }));
        });
        host.appendChild(chips);

        var ctl = el('div', 'na-controls'); host.appendChild(ctl);
        var sB = NA.slider('Backlog (slots)', 10, 100, 5, st.backlog, null, function (v) { st.backlog = v; restart(false); });
        var sT = NA.slider('Slot timeout', 10, 60, 5, st.timeout, function (v) { return v + ' ticks (' + (v / 10) + ' s)'; }, function (v) { st.timeout = v; restart(false); });
        var sL = NA.slider('Real visitors per tick', 0.1, 2, 0.1, st.legit, function (v) { return v.toFixed(1); }, function (v) { st.legit = v; restart(false); });
        var sA = NA.slider('Attack SYNs per tick', 0, 40, 1, st.attack, function (v) { return v === 0 ? 'none' : String(v); }, function (v) { st.attack = v; restart(false); });
        [sB, sT, sL, sA].forEach(function (s) { ctl.appendChild(s.wrap); });
        var d1 = el('div', 'na-controls tight'); host.appendChild(d1);
        var swC = el('div', 'na-chkrow');
        var cCook = check('SYN cookies', st.cookies, function (v) { st.cookies = v; restart(false); }, 'The server keeps no state until a valid final ACK arrives');
        var cRate = check('Rate limit per source address', st.rate, function (v) { st.rate = v; restart(false); }, 'Accept at most one SYN per tick from any one address');
        var spoofSel = NA.select([{ value: 'spoof', label: 'Attacker: forged addresses' }, { value: 'real', label: 'Attacker: 2 real machines' }], 'spoof', function (v) { st.spoof = v === 'spoof'; restart(false); });
        swC.appendChild(cCook.wrap); swC.appendChild(cRate.wrap); swC.appendChild(spoofSel);
        d1.appendChild(NA.field('Defences (switch them on and play again)', swC, 'grow'));
        var bar = el('div', 'na-controls tight'); host.appendChild(bar);
        var bPlay = NA.button('▶ Play', 'primary', function () { toggle(); }), bStep = NA.button('Step ›', '', function () { pause(); setT(Math.min(sim.ticks - 1, st.t + 1)); }), bReset = NA.button('Reset', '', function () { pause(); setT(0); });
        var scrub = el('input'); scrub.type = 'range'; scrub.min = 0; scrub.max = 199; scrub.value = 0; scrub.setAttribute('aria-label', 'Time (ticks)');
        scrub.addEventListener('input', function () { pause(); setT(+scrub.value); });
        bar.appendChild(bPlay); bar.appendChild(bStep); bar.appendChild(bReset); bar.appendChild(NA.speedControl());
        bar.appendChild(NA.field('Time', scrub, 'grow'));

        var cols = el('div', 'na-cols'); host.appendChild(cols);
        var left = el('div'), right = el('div'); cols.appendChild(left); cols.appendChild(right);
        left.appendChild(el('div', 'na-lab', 'The server’s waiting room: half-open connections'));
        var gridWrap = el('div', 'na-stage'); left.appendChild(gridWrap);
        var gsvg = S('svg', { viewBox: '0 0 ' + CW + ' 100', role: 'img', 'aria-label': 'Grid of the server backlog slots' }, gridWrap);
        var key = el('div', 'na-key'); key.innerHTML = '<span style="--c:var(--cmp-2)"><i></i>✓ real visitor (waits for its ACK)</span><span style="--c:var(--cmp-4)"><i></i>? forged SYN (never answers)</span><span style="--c:var(--ink-soft)"><i></i>empty</span>';
        left.appendChild(key);
        var arrBox = el('div', 'na-atk-syn-arr'); left.appendChild(arrBox);
        right.appendChild(el('div', 'na-lab', 'Real visitors: connected vs turned away (running total)'));
        var chartWrap = el('div', 'na-stage'); right.appendChild(chartWrap);
        var stats = el('div', 'na-stats'); host.appendChild(stats);
        var stOK = NA.stat('Real visitors served'), stAtk = NA.stat('Slots held by the attacker'), stFirst = NA.stat('First refused visitor'), stUse = NA.stat('Waiting room in use');
        [stOK, stAtk, stFirst, stUse].forEach(function (s) { stats.appendChild(s.node); });
        var say = NA.narrator(); host.appendChild(say.node);
        host.appendChild(el('p', 'na-note', 'Simulation: forged SYNs arrive from addresses that never answer, so each one holds a slot until its timeout. SYN cookies: the server encodes a keyed hash of the connection details into the sequence number of its SYN-ACK; only a real client can send it back, so the server stores nothing until then (RFC 4987).'));

        var cellsEl = [];
        function syncControls() { sB.set(st.backlog); sT.set(st.timeout); sL.set(st.legit); sA.set(st.attack); cCook.set(st.cookies); cRate.set(st.rate); spoofSel.value = st.spoof ? 'spoof' : 'real'; }
        function buildGrid() {
          NA.clear(gsvg); cellsEl = [];
          var cols_ = 10, rows = Math.ceil(st.backlog / cols_), pad = 10;
          cell = Math.min(30, (CW - 2 * pad) / cols_);
          gsvg.setAttribute('viewBox', '0 0 ' + CW + ' ' + (rows * cell + 2 * pad));
          for (var i = 0; i < st.backlog; i++) {
            var cx = pad + (i % cols_) * cell, cy = pad + Math.floor(i / cols_) * cell;
            var g = S('g', { 'class': 'na-atk-syn-slot e' }, gsvg);
            S('rect', { x: cx + 1.5, y: cy + 1.5, width: cell - 3, height: cell - 3, rx: 5 }, g);
            var tx = S('text', { x: cx + cell / 2, y: cy + cell / 2 + 4.5, 'text-anchor': 'middle' }, g, '');
            cellsEl.push({ g: g, tx: tx });
          }
        }
        function buildChart() {
          NA.clear(chartWrap);
          var W = 380, H = 190, PL = 34, PR = 8, PT = 12, PB = 24, s = S('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Running totals of served and refused real visitors' }, chartWrap);
          var maxY = Math.max(5, sim.summary.accepted + sim.summary.refused); maxY = Math.ceil(maxY / 5) * 5;
          function xs(t) { return PL + (W - PL - PR) * t / (sim.ticks - 1); } function ys(v) { return H - PB - (H - PT - PB) * v / maxY; }
          [0, 0.5, 1].forEach(function (f) { var v = Math.round(maxY * f); S('line', { x1: PL, x2: W - PR, y1: ys(v), y2: ys(v), 'class': 'na-atk-syn-grid' }, s); S('text', { x: PL - 5, y: ys(v) + 3, 'text-anchor': 'end', 'class': 'na-atk-syn-tl' }, s, v); });
          [0, 100, 199].forEach(function (t) { S('text', { x: xs(t), y: H - 8, 'text-anchor': t === 0 ? 'start' : t === 199 ? 'end' : 'middle', 'class': 'na-atk-syn-tl' }, s, (t === 199 ? 20 : t / 10) + ' s'); });
          function path(k) { return sim.series.map(function (p, i) { return (i ? 'L' : 'M') + xs(p.t).toFixed(1) + ' ' + ys(p[k]).toFixed(1); }).join(' '); }
          S('path', { d: path('accepted'), 'class': 'na-atk-syn-line ok' }, s); S('path', { d: path('refused'), 'class': 'na-atk-syn-line no' }, s);
          S('text', { x: W - PR - 4, y: ys(sim.series[sim.ticks - 1].accepted) - 6, 'text-anchor': 'end', 'class': 'na-atk-syn-lbl ok' }, s, '✓ served');
          S('text', { x: W - PR - 4, y: Math.min(H - PB - 4, ys(sim.series[sim.ticks - 1].refused) - 6), 'text-anchor': 'end', 'class': 'na-atk-syn-lbl no' }, s, '✗ turned away');
          s.cur = S('line', { y1: PT, y2: H - PB, 'class': 'na-atk-syn-cur' }, s); s.xs = xs;
          chartWrap.svg = s;
        }
        function restart(autoplay) {
          pause(); sim = E.SynFlood.sim({ backlog: st.backlog, timeout: st.timeout, legitRate: st.legit, attackRate: st.attack, cookies: st.cookies, rateLimit: st.rate, attackSources: st.spoof ? undefined : 2, seed: 11, ticks: 200 });
          buildGrid(); buildChart(); setT(0);
          if (autoplay) toggle();
        }
        function setT(t) {
          st.t = t; scrub.value = t;
          var p = sim.series[t];
          p.slots.forEach(function (code, i) {
            var c = cellsEl[i]; if (!c) return;
            c.g.setAttribute('class', 'na-atk-syn-slot ' + (code === 1 ? 'l' : code === 2 ? 'a' : 'e'));
            c.tx.textContent = code === 1 ? '✓' : code === 2 ? '?' : '';
          });
          var s = chartWrap.svg; s.cur.setAttribute('x1', s.xs(t)); s.cur.setAttribute('x2', s.xs(t));
          NA.clear(arrBox);
          arrBox.appendChild(el('span', 'na-lab', 'SYNs arriving this tick: '));
          if (!p.arrivals.length) arrBox.appendChild(el('em', null, 'none'));
          var agg = {};
          p.arrivals.forEach(function (a) { var k = a.k + a.r; agg[k] = agg[k] || { k: a.k, r: a.r, n: 0 }; agg[k].n++; });
          Object.keys(agg).sort().forEach(function (k) {
            var a = agg[k], who = a.k === 'L' ? '✓ visitor' : '? forged';
            var txt = who + (a.n > 1 ? ' ×' + a.n : '') + ' → ' + (a.r === 'kept' ? (a.n > 1 ? 'slots' : 'a slot') : a.r === 'cookie' ? 'cookie sent, no slot' : 'dropped: room full');
            arrBox.appendChild(el('span', 'na-atk-syn-arr-c ' + a.k.toLowerCase() + (a.r === 'full' ? ' full' : ''), txt));
          });
          var pct = Math.round(100 * E.SynFlood.successAt(sim, t));
          stOK.set(pct + '%', p.accepted + ' served, ' + p.refused + ' turned away');
          stAtk.set(st.cookies ? '0' : String(p.attackInSlots), st.cookies ? 'cookies keep no state' : 'of ' + st.backlog + ' slots');
          var fr = sim.summary.firstRefused, seen = fr !== null && fr <= t;
          stFirst.set(seen ? (fr / 10).toFixed(1) + ' s' : 'not yet', seen ? 'tick ' + fr : (fr === null ? 'nobody refused in this run' : 'happens at ' + (fr / 10).toFixed(1) + ' s'));
          stUse.set(st.cookies ? '0 / ' + st.backlog : p.used + ' / ' + st.backlog, st.cookies ? 'stateless until the ACK' : Math.round(100 * p.used / st.backlog) + '% full');
          stOK.node.className = 'na-stat ' + (pct >= 90 ? 'good' : pct >= 50 ? 'warn' : 'bad');
          narrate(p, t);
        }
        function narrate(p, t) {
          var A = st.attack, end = t >= sim.ticks - 1, sm = sim.summary, pct = Math.round(100 * E.SynFlood.successAt(sim, t));
          var m;
          if (t === 0) m = A === 0 ? 'A <b>quiet day</b>: real visitors send a SYN, the server keeps a slot for ' + (2) + ' ticks until their ACK arrives, and the connection is made. Press <b>Play</b>; then raise the attack.' : 'Each TCP connection starts with <b>SYN → SYN-ACK → ACK</b>. After a SYN the server must <b>remember</b> the half-open connection in its waiting room (' + st.backlog + ' slots) until the ACK comes. Real visitors answer within a moment; the attacker’s forged SYNs <b>never will</b>. Press <b>Play</b>.';
          else if (st.cookies) m = '<b>SYN cookies:</b> the server answers each SYN without storing anything, so the forged SYNs cost it nothing — the waiting room stays empty and <b class="ok">' + pct + '%</b> of real visitors get through. Only a real client can return the cookie hidden in the sequence number.' + (end ? ' <b>The attack is stopped by not keeping state for unverified clients.</b>' : '');
          else if (A === 0) m = 'No attack: about ' + p.used + ' slot(s) in use, <b class="ok">' + pct + '%</b> of visitors served.';
          else if (p.attackInSlots >= st.backlog * 0.9 && p.refused > 0) m = '<b class="bad">The waiting room is full of forged SYNs</b> (' + p.attackInSlots + ' of ' + st.backlog + '). New SYNs — real visitors’ too — are dropped. Only <b>' + pct + '%</b> of real visitors are served. A slot frees only when a forged entry times out (' + (st.timeout / 10) + ' s).' + (end ? ' In the second half of the run only <b>' + Math.round(100 * sm.lateSuccess) + '%</b> were served. <b>Stopped by:</b> SYN cookies (no slot per SYN); a bigger backlog or shorter timeout raises the bar, but the attacker just sends more; a rate limit helps only if the attacker uses few real addresses.' : '');
          else if (p.attackInSlots > 0) m = 'The attacker holds <b>' + p.attackInSlots + '</b> of ' + st.backlog + ' slots and is still filling the room (' + sm.fillTicks + ' ticks to fill at this rate). So far ' + pct + '% of real visitors are served.';
          else m = 'The attack has not filled the waiting room: ' + pct + '% of real visitors served.' + (end ? (st.rate ? ' With a per-source limit and few real attacking machines, the attacker cannot send enough SYNs to fill ' + st.backlog + ' slots in ' + (st.timeout / 10) + ' s.' : ' The room is big enough for this attack rate; make the attack stronger and watch it fail.') : '');
          if (end && st.rate && st.spoof && A > 0 && !st.cookies) m += ' <b>Notice:</b> the rate limit did almost nothing — with forged source addresses every SYN looks like a different machine.';
          say.say(m);
        }
        function pause() { run.cancel(); st.playing = false; bPlay.textContent = '▶ Play'; }
        function toggle() {
          if (st.playing) { pause(); return; }
          if (st.t >= sim.ticks - 1) setT(0);
          var g = run.start(); st.playing = true; bPlay.textContent = '❚❚ Pause';
          (async function () {
            while (st.t < sim.ticks - 1) {
              var d = NA.dur(60);
              if (d === 0) { setT(sim.ticks - 1); break; }
              if (!(await run.sleep(g, d))) return;
              setT(st.t + 1);
            }
            st.playing = false; bPlay.textContent = '▶ Play';
          })();
        }
        syncControls();
        restart(false);
      }
    });

    /* ---------------------------------------------------------------------------------
       9.10  UDP amplification and DDoS
       --------------------------------------------------------------------------------- */
    NA.register('atk-ddos', {
      title: 'UDP amplification and DDoS',
      hint: 'A simulation with illustrative numbers — real amplification factors and link sizes vary widely.',
      build: function (host) {
        host.classList.add('na-atk-ddos');
        var st = { mode: 'reflect', attacker: 5, reflectors: 40, amp: 30, victim: 1000, bots: 2000, perBot: 1, ingress: false, rrl: false, cdn: false };
        host.appendChild(tryLine('in <b>Reflection</b> mode, pick <b>NTP ≈ 200×</b>: an attacker with a 10 Mbps line aims 2 Gbps at a 1 Gbps link. Then tick <b>Ingress filtering</b> — and compare with the <b>Botnet</b> mode, where that defence does nothing.'));
        var top = el('div', 'na-controls'); host.appendChild(top);
        var mode = NA.segmented([{ value: 'reflect', label: 'Reflection (UDP)' }, { value: 'botnet', label: 'Botnet DDoS' }], 'reflect', function (v) { st.mode = v; syncVis(); paint(); }, 'Attack type');
        top.appendChild(NA.field('Attack type', mode.wrap));
        var chips = el('div', 'na-chips'); host.appendChild(chips); chips.appendChild(el('span', 'na-lab', 'Presets'));
        var presets = [['DNS ≈ 30×', { mode: 'reflect', amp: 30, attacker: 20 }], ['NTP ≈ 200×', { mode: 'reflect', amp: 200, attacker: 10 }], ['Small botnet', { mode: 'botnet', bots: 500, perBot: 1 }], ['Large botnet', { mode: 'botnet', bots: 20000, perBot: 1 }]];
        presets.forEach(function (p) { chips.appendChild(NA.chip(p[0], function () { Object.keys(p[1]).forEach(function (k) { st[k] = p[1][k]; }); mode.set(st.mode); syncSliders(); syncVis(); paint(); })); });
        var ctl = el('div', 'na-controls'); host.appendChild(ctl);
        function mbps(v) { return NA.fmtBps(v * 1e6); }
        var sAtk = NA.slider('Attacker’s own uplink', 1, 20, 1, st.attacker, mbps, function (v) { st.attacker = v; paint(); });
        var sRef = NA.slider('Open UDP servers used', 5, 100, 5, st.reflectors, null, function (v) { st.reflectors = v; paint(); });
        var sAmp = NA.slider('Answer is bigger by', 5, 500, 5, st.amp, function (v) { return '×' + v; }, function (v) { st.amp = v; paint(); });
        var sBots = NA.slider('Infected machines (bots)', 100, 50000, 100, st.bots, function (v) { return v.toLocaleString('en-US'); }, function (v) { st.bots = v; paint(); });
        var sPer = NA.slider('Each bot sends', 0.5, 5, 0.5, st.perBot, mbps, function (v) { st.perBot = v; paint(); });
        var sVic = NA.slider('Victim’s link', 100, 10000, 100, st.victim, mbps, function (v) { st.victim = v; paint(); });
        var reflOnly = [sAtk.wrap, sRef.wrap, sAmp.wrap], botOnly = [sBots.wrap, sPer.wrap];
        reflOnly.concat(botOnly).concat([sVic.wrap]).forEach(function (w) { ctl.appendChild(w); });
        function syncSliders() { sAtk.set(st.attacker); sRef.set(st.reflectors); sAmp.set(st.amp); sBots.set(st.bots); sPer.set(st.perBot); sVic.set(st.victim); }
        function syncVis() { reflOnly.forEach(function (w) { w.style.display = st.mode === 'reflect' ? '' : 'none'; }); botOnly.forEach(function (w) { w.style.display = st.mode === 'botnet' ? '' : 'none'; }); cIng.wrap.style.display = st.mode === 'reflect' ? '' : 'none'; cRrl.wrap.style.display = st.mode === 'reflect' ? '' : 'none'; }
        var dRow = el('div', 'na-controls tight'); host.appendChild(dRow);
        var sw = el('div', 'na-chkrow');
        var cIng = check('Ingress filtering at the attacker’s ISP (RFC 2827)', false, function (v) { st.ingress = v; paint(); }, 'Drop packets whose source address does not belong to the network they come from');
        var cRrl = check('Close open servers / rate-limit answers', false, function (v) { st.rrl = v; paint(); }, 'The reflectors refuse most repeated answers');
        var cCdn = check('CDN / scrubbing in front of the victim', false, function (v) { st.cdn = v; paint(); }, 'A large provider absorbs the flood and forwards only clean traffic');
        sw.appendChild(cIng.wrap); sw.appendChild(cRrl.wrap); sw.appendChild(cCdn.wrap);
        dRow.appendChild(NA.field('Defences', sw, 'grow'));

        var stage = el('div', 'na-stage'); host.appendChild(stage);
        var W = 640, H = 230, svg = S('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Attack diagram' }, stage);
        var bar = el('div', 'na-atk-ddos-bar'); host.appendChild(bar);
        var stats = el('div', 'na-stats'); host.appendChild(stats);
        var stIn = NA.stat('Traffic aimed at the victim'), stAmp = NA.stat('Attacker pays vs victim receives'), stShare = NA.stat('Real users still served');
        [stIn, stAmp, stShare].forEach(function (s) { stats.appendChild(s.node); });
        var say = NA.narrator(); host.appendChild(say.node);
        host.appendChild(el('p', 'na-note', 'Simulation with round numbers: the victim’s link also carries 20 Mbps of real users. When the link is overloaded, packets are dropped at random, so real users lose the same share as attack packets. Real DNS/NTP amplification factors range from tens to hundreds of times and change as servers get fixed.'));

        function arrow(x1, y1, x2, y2, mb, cls) {
          var w = mb <= 0 ? 0 : Math.min(11, 1.2 + Math.log10(1 + mb) * 1.9);
          if (w === 0) { S('line', { x1: x1, y1: y1, x2: x2, y2: y2, 'class': 'na-atk-ddos-line none' }, svg); return; }
          S('line', { x1: x1, y1: y1, x2: x2, y2: y2, 'class': 'na-atk-ddos-line ' + cls, 'stroke-width': w.toFixed(1) }, svg);
        }
        function node(x, y, label, sub, cls, w) {
          var g = S('g', { 'class': 'na-atk-ddos-node ' + cls }, svg); w = w || 92;
          S('rect', { x: x - w / 2, y: y - 22, width: w, height: 44, rx: 9 }, g);
          S('text', { x: x, y: y - 3, 'text-anchor': 'middle', 'class': 'nm' }, g, label);
          S('text', { x: x, y: y + 12, 'text-anchor': 'middle', 'class': 'sb' }, g, sub);
        }
        function paint() {
          NA.clear(svg); NA.clear(bar);
          var d = st.mode === 'reflect' ? E.Ddos.reflection({ attackerMbps: st.attacker, reflectors: st.reflectors, amp: st.amp, victimMbps: st.victim, ingress: st.ingress, rrl: st.rrl, cdn: st.cdn })
            : E.Ddos.botnet({ bots: st.bots, perBotMbps: st.perBot, victimMbps: st.victim, cdn: st.cdn });
          var vx = 560, vy = 115;
          if (st.mode === 'reflect') {
            node(70, vy, '😈 Attacker', mbps(st.attacker) + ' uplink', 'atk');
            var n = Math.min(9, Math.max(3, Math.round(st.reflectors / 10))), endX = st.cdn ? 468 : vx - 52, endY = st.cdn ? vy : vy;
            for (var i = 0; i < n; i++) {
              var ry = 52 + i * (146 / (n - 1)), rx = 290;
              arrow(116, vy, rx - 28, ry, d.ingressBlocked ? 0 : st.attacker / n, 'q');
              arrow(rx + 28, ry, endX, endY, d.attackInMbps / n, 'a');
              var g = S('g', { 'class': 'na-atk-ddos-ref' }, svg); S('rect', { x: rx - 28, y: ry - 11, width: 56, height: 22, rx: 6 }, g); S('text', { x: rx, y: ry + 4, 'text-anchor': 'middle' }, g, 'server');
            }
            if (st.cdn) arrow(494, vy, vx - 52, vy, d.attackReachingMbps, 'a');
            if (d.ingressBlocked) S('text', { x: 190, y: 20, 'text-anchor': 'middle', 'class': 'na-atk-ddos-ok' }, svg, '✋ the ISP drops the forged queries');
            else S('text', { x: 190, y: 20, 'text-anchor': 'middle', 'class': 'na-atk-ddos-cap' }, svg, 'tiny questions, source = victim');
            S('text', { x: 425, y: 20, 'text-anchor': 'middle', 'class': 'na-atk-ddos-cap' }, svg, d.ingressBlocked ? 'nothing to reflect' : st.rrl ? 'answers mostly refused' : 'big answers → victim');
          } else {
            node(70, vy, '😈 Botmaster', 'sends commands only', 'atk');
            var nb = 9, endXb = st.cdn ? 468 : vx - 52;
            for (var b = 0; b < nb; b++) {
              var by = 52 + b * (146 / (nb - 1)), bx = 290;
              arrow(116, vy, bx - 14, by, 0.5, 'cmd');
              arrow(bx + 14, by, endXb, vy, d.attackInMbps / nb, 'a');
              S('circle', { cx: bx, cy: by, r: 9, 'class': 'na-atk-ddos-bot' }, svg);
              S('text', { x: bx, y: by + 3.5, 'text-anchor': 'middle', 'class': 'na-atk-ddos-botg' }, svg, '☠');
            }
            if (st.cdn) arrow(494, vy, vx - 52, vy, d.attackReachingMbps, 'a');
            S('text', { x: 190, y: 20, 'text-anchor': 'middle', 'class': 'na-atk-ddos-cap' }, svg, 'one command');
            S('text', { x: 425, y: 20, 'text-anchor': 'middle', 'class': 'na-atk-ddos-cap' }, svg, st.bots.toLocaleString('en-US') + ' bots × ' + mbps(st.perBot));
          }
          if (st.cdn) { var cg = S('g', { 'class': 'na-atk-ddos-cdn' }, svg); S('rect', { x: 468, y: 34, width: 26, height: 182, rx: 8 }, cg); S('text', { x: 481, y: 125, 'text-anchor': 'middle', transform: 'rotate(-90 481 125)' }, cg, 'CDN / scrubbing'); }
          node(vx, vy, '🎯 Victim', mbps(st.victim) + ' link', d.overloaded ? 'vic bad' : 'vic ok', 104);
          /* load bar */
          var max = Math.max(d.victimLoadMbps, st.victim) * 1.08, capPct = 100 * st.victim / max, loadPct = 100 * d.victimLoadMbps / max, legitPct = 100 * d.legitMbps / max;
          var track = el('div', 'na-atk-ddos-track');
          var atkFill = el('div', 'na-atk-ddos-fill atk' + (d.overloaded ? ' over' : ''));
          atkFill.style.width = Math.min(100, loadPct) + '%';
          var legitFill = el('div', 'na-atk-ddos-fill legit'); legitFill.style.width = Math.min(100, legitPct) + '%';
          var capMark = el('i', 'na-atk-ddos-cap-mark'); capMark.style.left = capPct + '%'; var capLbl = el('b', null, 'link capacity ' + mbps(st.victim)); if (capPct > 60) capLbl.style.transform = 'translateX(-100%)'; capMark.appendChild(capLbl);
          track.appendChild(atkFill); track.appendChild(legitFill); track.appendChild(capMark);
          bar.appendChild(el('div', 'na-lab', 'Load on the victim’s link: ' + mbps(d.victimLoadMbps) + (d.overloaded ? ' — OVERLOADED' : ' — fits')));
          bar.appendChild(track);
          bar.appendChild(el('div', 'na-key', null)).innerHTML = '<span style="--c:var(--cmp-4)"><i></i>attack traffic</span><span style="--c:var(--cmp-2)"><i></i>real users (20 Mbps)</span><span style="--c:var(--ink-soft)"><i></i>┆ capacity</span>';
          stIn.set(mbps(d.attackReachingMbps), st.cdn ? 'after the CDN (before: ' + mbps(d.attackInMbps) + ')' : 'on the victim’s link');
          if (st.mode === 'reflect') stAmp.set(d.ingressBlocked ? '0 → 0' : mbps(st.attacker) + ' → ' + mbps(d.attackInMbps), d.ingressBlocked ? 'nothing leaves the ISP' : '×' + (d.factor % 1 ? d.factor.toFixed(1) : d.factor) + ' amplification');
          else stAmp.set(mbps(st.bots * st.perBot), 'spread over ' + st.bots.toLocaleString('en-US') + ' machines');
          var pct = Math.round(d.legitShare * 100);
          stShare.set(pct + '%', d.overloaded ? 'packets dropped at random' : 'no loss');
          stShare.node.className = 'na-stat ' + (pct >= 95 ? 'good' : pct >= 40 ? 'warn' : 'bad');
          say.say(story(d));
        }
        function story(d) {
          var m;
          if (st.mode === 'reflect') {
            if (d.ingressBlocked) return '<b class="ok">Nothing happens.</b> The attack relies on a <b>forged source address</b>: the query claims to come from the victim. The attacker’s ISP, applying <b>ingress filtering (RFC 2827)</b>, drops any packet whose source does not belong to its own network — so the queries never reach the servers. This is why the fix lives at the <em>attackers’</em> end, not the victim’s.';
            m = 'UDP has <b>no handshake</b>: a server answers the first packet it receives, to whatever source address is written on it — which anyone can forge. (TCP needs a SYN-ACK that only the real owner of the address can answer.) The attacker’s ' + mbps(st.attacker) + ' of tiny questions become <b>' + mbps(d.attackInMbps) + '</b> of answers, because each answer is ×' + (d.factor % 1 ? d.factor.toFixed(1) : d.factor) + ' bigger than the question: the attacker’s own bandwidth is <b>multiplied</b>, and the packets come from innocent servers, not from the attacker.';
          } else m = 'No forging needed: <b>' + st.bots.toLocaleString('en-US') + '</b> infected machines each send only ' + mbps(st.perBot) + ' — harmless alone, <b>' + mbps(d.attackInMbps) + '</b> together. The traffic comes from thousands of places, so the victim cannot simply block one address.';
          if (d.notes.length) m += ' ' + d.notes.join(' ');
          if (d.overloaded) m += ' <b class="bad">The victim’s link is full</b>: real users’ packets are dropped along with the attack — only ' + Math.round(d.legitShare * 100) + '% get through. Hard to stop at the victim: the flood is already on its link.';
          else m += ' <b class="ok">The link copes</b>: ' + mbps(d.victimLoadMbps) + ' fits in ' + mbps(st.victim) + '.';
          m += st.mode === 'reflect' ? ' <b>Stopped by:</b> ingress filtering (stops the forgery), closing open servers / rate-limiting answers, and a CDN that absorbs the flood.' : ' <b>Stopped by:</b> a CDN / scrubbing service big enough to absorb it, and cleaning up infected machines.';
          return m;
        }
        syncVis(); syncSliders(); paint();
      }
    });

    /* ---------------------------------------------------------------------------------
       9.10  lookalike URLs
       --------------------------------------------------------------------------------- */
    function urlView(a) {
      var box = el('div', 'na-atk-url-view');
      if (!a.ok) { box.appendChild(el('div', 'na-atk-url-err', a.error)); return box; }
      box.appendChild(el('span', 'na-atk-url-s', a.scheme + '://'));
      if (a.userinfo !== null) { box.appendChild(el('span', 'na-atk-url-ui', a.userinfo)); box.appendChild(el('span', 'na-atk-url-s', '@')); }
      var hs = el('span', 'na-atk-url-host');
      if (a.isIp) hs.appendChild(el('span', 'na-atk-url-reg', a.host));
      else {
        if (a.subdomain) hs.appendChild(el('span', 'na-atk-url-sub', a.subdomain + '.'));
        hs.appendChild(el('span', 'na-atk-url-reg', a.registered));
      }
      box.appendChild(hs);
      if (a.port) box.appendChild(el('span', 'na-atk-url-s', ':' + a.port));
      box.appendChild(el('span', 'na-atk-url-rest', a.rest));
      return box;
    }
    function urlLegend() {
      var k = el('div', 'na-key'); k.innerHTML = '<span style="--c:var(--cmp-2)"><i></i>who owns the site: last labels of the host</span><span style="--c:var(--cmp-3)"><i></i>sub-domain labels (the owner can write anything here)</span><span style="--c:var(--cmp-4)"><i></i>name before @ (ignored)</span><span style="--c:var(--ink-soft)"><i></i>path, query, fragment</span>';
      return k;
    }
    function flagList(a) {
      var ul = el('ul', 'na-atk-url-flags');
      if (!a.ok) return ul;
      if (!a.flags.length) ul.appendChild(el('li', 'ok', a.trustedHost ? '✓ The host belongs to a site we trust, and no trick was found.' : 'No trick found — but that does not prove the site is honest.'));
      a.flags.forEach(function (f) { var li = el('li', f.sev); li.innerHTML = '<b>' + (f.sev === 'red' ? '⚠ ' : 'ℹ ') + esc(f.title) + '.</b> ' + esc(f.text); ul.appendChild(li); });
      return ul;
    }

    NA.register('atk-url', {
      title: 'Real or lookalike? Read the host',
      hint: 'All addresses are invented: only example.com, example.org, *.test and *.invalid appear.',
      build: function (host) {
        host.classList.add('na-atk-url');
        host.appendChild(tryLine('decide for 12 addresses whether they belong to the real <b>example.com</b> / <b>example.org</b> or imitate them. Read the <b>green</b> part: it is the real owner.'));
        NA.tabs(host, [
          { label: 'Game', build: buildGame },
          { label: 'Analyzer', build: buildAnalyzer }
        ]);
        function buildGame(panel) {
          var seed = 1, round, idx, answers, streak, best, done;
          var head = el('div', 'na-controls tight'); panel.appendChild(head);
          var hdr = el('div', 'na-atk-url-hdr'); head.appendChild(hdr);
          var bNew = NA.button('New round', '', function () { seed++; start(); }); head.appendChild(bNew);
          var card = el('div', 'na-atk-url-card'); panel.appendChild(card);
          var acts = el('div', 'na-controls tight'); panel.appendChild(acts);
          var bG = NA.button('✓ Genuine', 'primary', function () { answer('genuine'); }), bP = NA.button('⚠ Phishing', 'danger', function () { answer('phishing'); }), bN = NA.button('Next ›', '', function () { next(); });
          acts.appendChild(bG); acts.appendChild(bP); acts.appendChild(bN);
          var fb = el('div', 'na-atk-url-fb'); panel.appendChild(fb);
          var say = NA.narrator(); panel.appendChild(say.node);
          panel.appendChild(el('p', 'na-note', 'Real browsers use the Public Suffix List to know where a registered name starts (co.uk, com.vn …); here the last two labels are used. HTTPS and the padlock only mean the connection is encrypted to that host — a phishing site can have a valid certificate too.'));
          function start() { round = E.UrlCheck.pickRound(seed); idx = 0; answers = []; streak = 0; best = 0; done = false; show(); }
          function show() {
            NA.clear(card); NA.clear(fb);
            if (idx >= round.length) return summary();
            var b = round[idx], a = E.UrlCheck.analyze(b.url);
            hdr.textContent = 'Address ' + (idx + 1) + ' of ' + round.length + ' · score ' + score() + ' · streak ' + streak;
            card.appendChild(urlView(a)); card.appendChild(urlLegend());
            bG.disabled = bP.disabled = false; bN.disabled = true; bN.style.display = 'none'; bG.style.display = bP.style.display = '';
            say.say('Look at the <b>host</b> — the part before the first <code>/</code>, after any <code>@</code>. Is it really example.com or example.org, or something that only looks like it?');
          }
          function score() { var s = 0; answers.forEach(function (x, i) { if (x === round[i].label) s++; }); return s; }
          function answer(v) {
            var b = round[idx], a = E.UrlCheck.analyze(b.url), ok = v === b.label; answers[idx] = v;
            if (ok) { streak++; best = Math.max(best, streak); } else streak = 0;
            hdr.textContent = 'Address ' + (idx + 1) + ' of ' + round.length + ' · score ' + score() + ' · streak ' + streak;
            bG.disabled = bP.disabled = true; bG.style.display = bP.style.display = 'none'; bN.disabled = false; bN.style.display = ''; bN.textContent = idx === round.length - 1 ? 'See the result ›' : 'Next ›';
            NA.clear(fb);
            fb.appendChild(el('div', 'na-atk-url-verdict ' + (ok ? 'ok' : 'bad'), (ok ? '✓ Correct — ' : '✗ Not quite — ') + 'this one is ' + (b.label === 'genuine' ? 'GENUINE' : 'PHISHING') + '.'));
            var own = el('div', 'na-atk-url-owner'); own.innerHTML = 'The site you would really reach: <b class="na-mono">' + esc(a.registered) + '</b>' + (a.trustedHost ? ' — a real example site.' : ' — <b>not</b> example.com or example.org.'); fb.appendChild(own);
            fb.appendChild(flagList(a));
            fb.appendChild(el('p', 'na-atk-url-why', b.note));
            say.say(ok ? (b.label === 'phishing' ? '<b>Well spotted.</b> ' : '<b>Right.</b> ') + 'Keep reading the host from the <em>right</em>.' : (b.label === 'phishing' ? 'It <b>looked</b> fine, which is the point of the trick. <b>Read from the right:</b> the last two labels name the owner.' : 'It was genuine: do not distrust everything — check the host, not the length or the look of the address.'));
          }
          function next() { idx++; show(); }
          function summary() {
            var sc = E.UrlCheck.scoreRound(round, answers);
            hdr.textContent = 'Round finished · score ' + sc.correct + ' / ' + sc.total + ' · best streak ' + best;
            bG.style.display = bP.style.display = bN.style.display = 'none';
            card.appendChild(el('div', 'na-atk-url-big', sc.correct + ' / ' + sc.total + ' correct'));
            var t = el('table', 'na-table'); var th = el('tr'); ['Kind of address', 'Seen', 'Missed'].forEach(function (h) { th.appendChild(el('th', null, h)); }); t.appendChild(th);
            Object.keys(sc.tally).sort(function (x, y) { return sc.tally[y].missed - sc.tally[x].missed; }).forEach(function (k) { var tr = el('tr', sc.tally[k].missed ? 'bad' : ''); [E.UrlCheck.tricks[k], sc.tally[k].seen, sc.tally[k].missed ? '✗ ' + sc.tally[k].missed : '✓ 0'].forEach(function (x) { tr.appendChild(el('td', null, String(x))); }); t.appendChild(tr); });
            card.appendChild(el('div', 'na-tbl-scroll-x', t));
            var worst = Object.keys(sc.tally).filter(function (k) { return sc.tally[k].missed; });
            say.say(worst.length ? 'Practise: <b>' + esc(worst.map(function (k) { return E.UrlCheck.tricks[k]; }).join('; ')) + '</b>. Press <b>New round</b> for different addresses.' : '<b>Perfect round.</b> Press <b>New round</b> for a new set — and remember: in real life ask whether you should be typing a password here at all.');
          }
          start();
        }
        function buildAnalyzer(panel) {
          var inp = el('input'); inp.type = 'text'; inp.value = 'https://login.example.com@secure-update.test/'; inp.spellcheck = false; inp.autocomplete = 'off'; inp.setAttribute('aria-label', 'URL to analyse');
          panel.appendChild(NA.field('Paste an address', inp));
          var chips = el('div', 'na-chips'); panel.appendChild(chips); chips.appendChild(el('span', 'na-lab', 'Examples'));
          ['https://www.example.com/login', 'https://example.com.account-check.test/login', 'https://login.example.com@secure-update.test/', 'https://examp1e.com/signin', 'https://secure-update.test/example.com/login', 'https://www.wikipedia.org/'].forEach(function (u) {
            chips.appendChild(NA.chip(u.replace(/^https?:\/\//, '').slice(0, 30), function () { inp.value = u; paint(); }, u));
          });
          var out = el('div'); panel.appendChild(out);
          var say = NA.narrator(); panel.appendChild(say.node);
          panel.appendChild(el('p', 'na-note', 'The verdict only compares the host with the two invented trusted sites (example.com, example.org). A real address that is not on that list is “unknown”: this tool cannot tell whether an unfamiliar site is honest.'));
          inp.addEventListener('input', paint);
          function paint() {
            NA.clear(out);
            var a = E.UrlCheck.analyze(inp.value);
            out.appendChild(urlView(a));
            if (!a.ok) { say.say('<b>' + esc(a.error) + '</b>'); return; }
            out.appendChild(urlLegend());
            var t = el('table', 'na-table na-atk-url-facts');
            [['Host (who you connect to)', a.host], ['Owner (last two labels)', a.registered], ['Sub-domain labels', a.subdomain || '—'], ['Name before @', a.userinfo === null ? '—' : a.userinfo], ['Encrypted?', a.scheme === 'https' ? 'yes (https) — says nothing about honesty' : 'no (plain http)']].forEach(function (r) { var tr = el('tr'); tr.appendChild(el('td', null, r[0])); tr.appendChild(el('td', null, r[1])); t.appendChild(tr); });
            out.appendChild(el('div', 'na-tbl-scroll-x', t));
            out.appendChild(flagList(a));
            var v = a.verdict;
            say.say(v === 'genuine' ? '<b class="ok">Genuine</b> — the host belongs to a trusted example site.' : v === 'phishing' ? '<b class="bad">Looks like phishing</b> — the host is <b>not</b> a trusted site and uses ' + a.flags.filter(function (f) { return f.sev === 'red'; }).length + ' lookalike trick(s). <b>Defence:</b> read the host from the right, type addresses yourself or use a bookmark, let a password manager refuse to fill unknown sites.' : '<b>Unknown</b> — no trick found, but the host is not one of our trusted sites. Being unfamiliar is not the same as being safe.');
          }
          paint();
        }
      }
    });
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { Cookies: E.Cookies, SessionServer: E.SessionServer, SynFlood: E.SynFlood, Ddos: E.Ddos, UrlCheck: E.UrlCheck };
})(typeof window !== 'undefined' ? window : globalThis);
