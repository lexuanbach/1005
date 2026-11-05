/* Chapter 9 concept apps 9.7–9.9:  'web' (URLs and HTTP), 'transfer' (bandwidth, packets, ARQ, routing), 'edge' (cloud vs edge AI).
   Engines are plain functions (NetApps.engines.web / .transfer / .edge) tested in Node; the UI below only runs in a browser.
   Everything is a simulation: example.* names, RFC 5737 addresses, illustrative numbers. Nothing touches the network. */
(function (root) {
  'use strict';
  var NA = (typeof window !== 'undefined' && window.NetApps) || require('./net-apps-core.js');
  var hasDom = typeof document !== 'undefined';
  var E = NA.engines;

  /* =====================================================================================
     9.7  URLs and HTTP — engine
     ===================================================================================== */
  var DEFAULT_PORT = { http: 80, https: 443 };
  function defaultPort(scheme) { return DEFAULT_PORT[String(scheme).toLowerCase()] || null; }

  function parseUrl(input) {
    var str = String(input == null ? '' : input).trim();
    if (!str) return { ok: false, error: 'Type or paste a URL.' };
    var m = /^([A-Za-z][A-Za-z0-9+.-]*):\/\/([^\/?#]*)([^?#]*)(\?[^#]*)?(#.*)?$/.exec(str);
    if (!m) return { ok: false, error: 'A URL starts with a scheme and "://", for example https://www.example.com/ .' };
    var scheme = m[1].toLowerCase();
    if (!DEFAULT_PORT[scheme]) return { ok: false, error: 'This lab only knows http:// and https:// (a browser also knows file:, ftp: and others).' };
    var auth = m[2];
    if (auth.indexOf('@') >= 0) return { ok: false, error: 'User names inside URLs are not supported here — write just host or host:port.' };
    var hp = /^([^:]*)(?::(.*))?$/.exec(auth), host = hp[1].toLowerCase(), portText = hp[2];
    if (!host) return { ok: false, error: 'The host is missing: after "' + scheme + '://" comes the name of the machine, e.g. www.example.com.' };
    if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(host)) return { ok: false, error: 'The host "' + host + '" contains characters a host name cannot have (letters, digits, dots and hyphens only).' };
    var port = DEFAULT_PORT[scheme], portExplicit = false;
    if (portText !== undefined) {
      if (!/^[0-9]{1,5}$/.test(portText) || +portText < 1 || +portText > 65535) return { ok: false, error: 'The port must be a number from 1 to 65535, not "' + portText + '".' };
      port = +portText; portExplicit = true;
    }
    var path = m[3] || '/';
    var query = m[4] ? m[4].slice(1) : null;
    var fragment = m[5] ? m[5].slice(1) : null;
    var params = [];
    if (query) query.split('&').forEach(function (kv) {
      if (!kv) return;
      var i = kv.indexOf('='), k = i < 0 ? kv : kv.slice(0, i), v = i < 0 ? '' : kv.slice(i + 1);
      function dec(s) { try { return decodeURIComponent(s.replace(/\+/g, ' ')); } catch (e) { return s; } }
      params.push([dec(k), dec(v)]);
    });
    var segments = [{ part: 'scheme', text: scheme }, { part: 'sep', text: '://' }, { part: 'host', text: host }];
    if (portExplicit) segments.push({ part: 'port', text: ':' + portText });
    segments.push({ part: 'path', text: m[3] || '' });
    if (query !== null) segments.push({ part: 'query', text: m[4] });
    if (fragment !== null) segments.push({ part: 'fragment', text: m[5] });
    return {
      ok: true, scheme: scheme, host: host, port: port, portExplicit: portExplicit, defaultPort: DEFAULT_PORT[scheme],
      path: path, pathTyped: m[3] !== '', query: query, fragment: fragment, params: params, tls: scheme === 'https', segments: segments
    };
  }
  /* what actually goes over the wire for this URL: path + query only; the fragment stays in the browser */
  function requestTarget(u) { return u.path + (u.query !== null ? '?' + u.query : ''); }
  function requestLine(u, method) { return (method || 'GET') + ' ' + requestTarget(u) + ' HTTP/1.1'; }
  function hostHeader(u) { return u.host + (u.port !== u.defaultPort ? ':' + u.port : ''); }

  /* ---- the simulated web server (www.example.com, 203.0.113.10) ---- */
  var REASONS = { 200: 'OK', 301: 'Moved Permanently', 403: 'Forbidden', 404: 'Not Found', 405: 'Method Not Allowed', 500: 'Internal Server Error' };
  var FAMILIES = {
    1: { cls: '1xx', name: 'Information', text: 'the server is still working on it' },
    2: { cls: '2xx', name: 'Success', text: 'it worked, the answer follows' },
    3: { cls: '3xx', name: 'Redirect', text: 'look somewhere else' },
    4: { cls: '4xx', name: 'Your mistake', text: 'the request cannot be satisfied as sent' },
    5: { cls: '5xx', name: 'Server failed', text: 'the server\'s own program broke' }
  };
  function familyInfo(status) { var f = FAMILIES[Math.floor(status / 100)]; return f || { cls: '?', name: 'Unknown', text: '' }; }
  var HTML_HOME = '<!doctype html>\n<html><head><title>Example Home</title>\n<link rel="stylesheet" href="/style.css">\n<script src="/app.js"></script></head>\n<body><img src="/logo.png"><h1>Welcome</h1>\n<a href="/old-page">News</a> <a href="/form">Contact</a></body></html>';
  var RES = {
    '/': { type: 'text/html; charset=utf-8', body: HTML_HOME, methods: ['GET', 'HEAD'], objects: ['/style.css', '/app.js', '/logo.png'] },
    '/index.html': { type: 'text/html; charset=utf-8', body: HTML_HOME, methods: ['GET', 'HEAD'], objects: ['/style.css', '/app.js', '/logo.png'] },
    '/new-page': { type: 'text/html; charset=utf-8', body: '<!doctype html>\n<html><head><title>News</title>\n<link rel="stylesheet" href="/style.css"></head>\n<body><h1>The news moved here</h1></body></html>', methods: ['GET', 'HEAD'], objects: ['/style.css'] },
    '/form': { type: 'text/html; charset=utf-8', body: '<!doctype html>\n<html><body><form method="post" action="/form">\n<input name="name"> <button>Send</button></form></body></html>', methods: ['GET', 'HEAD', 'POST'], objects: [] },
    '/style.css': { type: 'text/css', body: 'body { font-family: sans-serif; }\nh1 { color: #0e8a7b; }', methods: ['GET', 'HEAD'], size: 1180, objects: [] },
    '/app.js': { type: 'text/javascript', body: 'console.log("hello");', methods: ['GET', 'HEAD'], size: 3100, objects: [] },
    '/logo.png': { type: 'image/png', body: '(binary image data …)', methods: ['GET', 'HEAD'], size: 8420, objects: [] }
  };
  function byteLen(s) { return unescape(encodeURIComponent(s)).length; }
  var DATE = 'Sun, 18 Oct 2026 08:12:38 GMT';
  function respond(status, extra) {
    var r = { status: status, reason: REASONS[status], headers: [['Date', DATE], ['Server', 'ExampleServer/1.0']], body: '', redirectTo: null, objects: [], size: 0 };
    if (extra.headers) r.headers = r.headers.concat(extra.headers);
    r.body = extra.body || ''; r.type = extra.type || null; r.objects = extra.objects || [];
    r.size = extra.size != null ? extra.size : byteLen(r.body);
    if (extra.redirectTo) r.redirectTo = extra.redirectTo;
    if (r.type) r.headers.push(['Content-Type', r.type]);
    r.headers.push(['Content-Length', String(r.size)]);
    return r;
  }
  function stripQuery(p) { var i = p.search(/[?#]/); return i < 0 ? p : p.slice(0, i); }
  /* Server.handle({method, path, host, https}) → {status, reason, headers, body, redirectTo, objects, size} */
  function handle(req) {
    var method = String(req.method || 'GET').toUpperCase(), path = stripQuery(req.path || '/') || '/';
    if (path === '/admin') return respond(403, { type: 'text/html; charset=utf-8', body: '<h1>403 Forbidden</h1>\nYou may not look at /admin.' });
    if (path === '/crash') return respond(500, { type: 'text/html; charset=utf-8', body: '<h1>500 Internal Server Error</h1>\nThe program behind this page crashed.' });
    if (path === '/old-page') {
      if (method === 'GET' || method === 'HEAD') return respond(301, { headers: [['Location', '/new-page']], redirectTo: '/new-page', body: '', size: 0 });
      return respond(405, { headers: [['Allow', 'GET, HEAD']], type: 'text/html; charset=utf-8', body: '<h1>405 Method Not Allowed</h1>' });
    }
    var res = RES[path];
    if (!res) return respond(404, { type: 'text/html; charset=utf-8', body: '<h1>404 Not Found</h1>\nNothing lives at ' + path + '.' });
    if (res.methods.indexOf(method) < 0) return respond(405, { headers: [['Allow', res.methods.join(', ')]], type: 'text/html; charset=utf-8', body: '<h1>405 Method Not Allowed</h1>\n' + method + ' is not accepted at ' + path + '.' });
    if (method === 'POST') return respond(200, { type: 'text/html; charset=utf-8', body: '<h1>Thanks!</h1>\nWe received your message.' });
    var size = res.size != null ? res.size : (path === '/' || path === '/index.html' ? 1256 : byteLen(res.body));
    var r = respond(200, { type: res.type, body: res.body, objects: res.objects, size: size });
    if (method === 'HEAD') { r.body = ''; r.headOnly = true; }
    return r;
  }
  /* Browser.load({method, path, https, follow}) → {log:[{n,method,path,status,reason,bytes,note,req,res}], final}.
     A browser follows redirects by itself and, after an HTML page, fetches every object the page refers to. */
  function load(opts) {
    var host = opts.host || 'www.example.com', https = !!opts.https, follow = opts.follow !== false;
    var log = [], method = String(opts.method || 'GET').toUpperCase(), path = opts.path || '/', hops = 0, final = null;
    function one(m, p, note, body) {
      var req = { method: m, path: p, host: host, https: https, body: body || null };
      var res = handle(req);
      log.push({ n: log.length + 1, method: m, path: p, status: res.status, reason: res.reason, bytes: res.headOnly ? 0 : res.size, note: note, req: req, res: res });
      return res;
    }
    var body = (method === 'POST' || method === 'PUT') ? 'name=Ada&message=Hello' : null;
    var res = one(method, path, 'the request you made', body);
    while (follow && res.redirectTo && hops < 5) {
      hops++;
      var from = res.redirectTo;
      res = one('GET', from, 'the browser follows the Location header by itself');
    }
    final = res;
    if (res.status === 200 && (method === 'GET' || hops > 0) && res.objects && res.objects.length) {
      res.objects.forEach(function (o) { one('GET', o, 'object the page refers to'); });
    }
    return { log: log, final: final, objectCount: log.filter(function (l) { return l.note === 'object the page refers to'; }).length };
  }
  function rawRequest(req) {
    var lines = [req.method + ' ' + req.path + ' HTTP/1.1', 'Host: ' + req.host, 'User-Agent: BrowserLab/1.0', 'Accept: */*'];
    if (req.body) { lines.push('Content-Type: application/x-www-form-urlencoded', 'Content-Length: ' + req.body.length, '', req.body); }
    return lines.join('\n');
  }
  function rawResponse(res, method) {
    var lines = ['HTTP/1.1 ' + res.status + ' ' + res.reason];
    res.headers.forEach(function (h) { lines.push(h[0] + ': ' + h[1]); });
    if (res.headOnly || method === 'HEAD') return lines.join('\n') + '\n\n(HEAD: headers only, no body)';
    var b = res.body;
    if (b.length > 150) b = b.slice(0, 150) + ' …';
    return lines.join('\n') + (b ? '\n\n' + b : '');
  }
  /* ILLUSTRATION ONLY (not TLS): deterministic scrambled bytes that look like an encrypted record */
  function hash32(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function scramble(text, maxLines) {
    var rnd = NA.rng(hash32(text)), n = byteLen(text) + 22, bytes = ['17', '03', '03', hex2(n >> 8), hex2(n & 255)];
    for (var i = 0; i < n; i++) bytes.push(hex2(Math.floor(rnd() * 256)));
    var lines = [];
    for (var j = 0; j < bytes.length; j += 8) lines.push(bytes.slice(j, j + 8).join(' '));
    var cap = maxLines || 6;
    if (lines.length > cap) { var more = lines.length - cap; lines = lines.slice(0, cap); lines.push('… ' + more + ' more lines of the same noise'); }
    return lines.join('\n');
  }
  function hex2(v) { return (v < 16 ? '0' : '') + v.toString(16); }

  E.web = { parseUrl: parseUrl, requestLine: requestLine, requestTarget: requestTarget, hostHeader: hostHeader, defaultPort: defaultPort, familyInfo: familyInfo,
    Server: { handle: handle }, Browser: { load: load }, rawRequest: rawRequest, rawResponse: rawResponse, scramble: scramble };

  /* =====================================================================================
     9.7  URLs and HTTP — UI
     ===================================================================================== */
  function buildWeb(host, NA) {
    var el = NA.el;
    host.classList.add('na-web');
    host.appendChild(el('p', 'na-try', [el('b', null, 'Try this: '), 'edit the URL and watch which parts change colour — then, on the next tab, ask a server for a page that moved, one that does not exist, and one that crashes.']));
    NA.tabs(host, [
      { label: 'Anatomy of a URL', build: buildUrlTab },
      { label: 'Ask a server', build: buildServerTab }
    ]);

    /* ---------- tab a: anatomy ---------- */
    function buildUrlTab(p) {
      var inp = el('input'); inp.type = 'text'; inp.spellcheck = false; inp.autocomplete = 'off';
      inp.value = 'https://www.example.com:443/docs/intro.html?lang=en#top';
      inp.setAttribute('aria-label', 'URL to take apart');
      var presets = el('div', 'na-chips');
      presets.appendChild(el('span', 'na-lab', 'Examples'));
      [['Full URL', 'https://www.example.com:443/docs/intro.html?lang=en#top'], ['Plain http', 'http://example.com/'],
       ['Odd port + 2 params', 'https://example.org:8443/a/b?x=1&y=two'], ['No path', 'https://www.example.com'], ['A broken one', 'www.example.com/index.html']].forEach(function (pr) {
        presets.appendChild(NA.chip(pr[0], function () { inp.value = pr[1]; render(); }));
      });
      var field = NA.field('URL', inp, 'grow');
      var controls = el('div', 'na-controls'); controls.appendChild(field);
      var view = el('div', 'na-web-urlview'); view.setAttribute('role', 'group'); view.setAttribute('aria-label', 'The URL split into its parts');
      var partsWrap = el('div', 'na-web-parts');
      var sendBox = el('div', 'na-web-sendbox');
      var say = NA.narrator();
      p.appendChild(controls); p.appendChild(presets); p.appendChild(view); p.appendChild(partsWrap); p.appendChild(sendBox); p.appendChild(say.node);
      var MEANING = {
        scheme: 'which protocol to speak. https = HTTP wrapped in encryption (TLS); http = plain text',
        host: 'which machine. DNS (9.5) turns this name into an IP address',
        port: 'which program on that machine. Left out → the scheme\'s default (http 80, https 443)',
        path: 'which resource on that machine (like a file path)',
        query: 'extra details for the server: key=value pairs joined with &',
        fragment: 'a spot inside the page. Only the browser uses it — it is never sent'
      };
      function render() {
        var u = E.web.parseUrl(inp.value);
        NA.clear(view); NA.clear(partsWrap); NA.clear(sendBox);
        if (!u.ok) {
          view.appendChild(el('div', 'na-web-err', '✗ ' + u.error));
          say.say('<span class="bad">That is not a URL a browser could use.</span> A URL has to say <em>how</em> to talk (the scheme) and <em>to whom</em> (the host) before anything else. Try one of the examples.');
          return;
        }
        u.segments.forEach(function (s) {
          if (s.part === 'sep') { view.appendChild(el('span', 'na-web-sep', s.text)); return; }
          if (s.part === 'path' && !s.text) return;
          var seg = el('span', 'na-web-seg p-' + s.part);
          seg.appendChild(el('span', 'na-web-txt', s.text));
          seg.appendChild(el('span', 'na-web-lbl', s.part));
          view.appendChild(seg);
          if (s.part === 'host' && !u.portExplicit) {
            var g = el('span', 'na-web-seg p-port ghost'); g.title = 'not typed — the browser fills it in from the scheme';
            g.appendChild(el('span', 'na-web-txt', ':' + u.port)); g.appendChild(el('span', 'na-web-lbl', 'port (default)')); view.appendChild(g);
          }
        });
        var rows = [['scheme', u.scheme], ['host', u.host], ['port', String(u.port) + (u.portExplicit ? '' : ' (default for ' + u.scheme + ')')], ['path', u.path + (u.pathTyped ? '' : '  (none typed → "/")')],
                    ['query', u.query === null ? '— none —' : u.query], ['fragment', u.fragment === null ? '— none —' : '#' + u.fragment]];
        var t = el('table', 'na-table na-web-ptable'); var th = el('tr'); ['Part', 'Value here', 'What it is for'].forEach(function (h) { th.appendChild(el('th', null, h)); }); t.appendChild(th);
        rows.forEach(function (r) {
          var tr = el('tr'); var c0 = el('td'); var sw = el('span', 'na-web-swatch p-' + r[0]); c0.appendChild(sw); c0.appendChild(document.createTextNode(' ' + r[0]));
          tr.appendChild(c0); tr.appendChild(el('td', null, r[1])); var m = el('td', 'na-web-mean', MEANING[r[0]]); tr.appendChild(m); t.appendChild(tr);
        });
        partsWrap.appendChild(el('div', 'na-tbl-scroll', t));
        if (u.params.length) {
          var pt = el('table', 'na-table na-web-qtable'); var h2 = el('tr'); ['Query key', 'Value'].forEach(function (h) { h2.appendChild(el('th', null, h)); }); pt.appendChild(h2);
          u.params.forEach(function (kv) { var tr = el('tr'); tr.appendChild(el('td', null, kv[0])); tr.appendChild(el('td', null, kv[1] || '(empty)')); pt.appendChild(tr); });
          partsWrap.appendChild(pt);
        }
        var box = el('div', 'na-web-send');
        box.appendChild(el('div', 'na-lab', 'What the browser actually does with it'));
        var steps = el('ol', 'na-web-steps');
        steps.appendChild(el('li', null, 'Ask DNS for the address of ' + u.host + '.'));
        steps.appendChild(el('li', null, 'Connect to that address, port ' + u.port + (u.tls ? ', and start an encrypted TLS tunnel first (because of https).' : ' — no encryption (because of http).')));
        steps.appendChild(el('li', null, 'Send these lines:'));
        box.appendChild(steps);
        var pre = el('pre', 'na-web-pre');
        pre.textContent = E.web.requestLine(u) + '\nHost: ' + E.web.hostHeader(u);
        box.appendChild(pre);
        var drop = el('div', 'na-web-drop', u.fragment !== null
          ? '#' + u.fragment + ' is not in those lines: the fragment never leaves the browser; it only scrolls the page after it arrives.'
          : 'No #fragment here, so nothing is held back. (Try adding #top at the end.)');
        box.appendChild(drop);
        sendBox.appendChild(box);
        say.say('<b>One address, five jobs.</b> The <b>host</b> tells the browser <em>where to connect</em>, the <b>scheme</b> and <b>port</b> tell it <em>how</em>, and only the <b>path + query</b> travel inside the request — that is the line the server reads. The <b>Host:</b> header repeats the name because one server can run many websites.' +
          (u.fragment !== null ? ' Notice the fragment is the one part that stays home.' : ''));
      }
      inp.addEventListener('input', render);
      render();
    }

    /* ---------- tab b: ask a server ---------- */
    function buildServerTab(p) {
      var state = { method: 'GET', path: '/', https: false, load: null, sel: 0 };
      var mSel = NA.select(['GET', 'HEAD', 'POST', 'PUT', 'DELETE'].map(function (m) { return { value: m }; }), 'GET', function (v) { state.method = v; });
      var pathInp = el('input'); pathInp.type = 'text'; pathInp.value = '/'; pathInp.spellcheck = false; pathInp.autocomplete = 'off'; pathInp.setAttribute('aria-label', 'Path to ask for');
      var proto = NA.segmented([{ value: 'http', label: 'http://' }, { value: 'https', label: 'https:// 🔒' }], 'http', function (v) { state.https = v === 'https'; if (state.load) paint(); }, 'Scheme');
      var send = NA.button('Send request ▸', 'primary', function () { go(); });
      var ctr = el('div', 'na-controls');
      ctr.appendChild(NA.field('Method', mSel)); ctr.appendChild(NA.field('Path on www.example.com', pathInp, 'grow'));
      var pf = el('div', 'na-field'); pf.appendChild(el('span', 'na-lab', 'Scheme')); pf.appendChild(proto.wrap); ctr.appendChild(pf);
      ctr.appendChild(send);
      pathInp.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
      var chips = el('div', 'na-chips'); chips.appendChild(el('span', 'na-lab', 'Scenarios'));
      [['Home page', 'GET', '/'], ['Page moved', 'GET', '/old-page'], ['Forbidden', 'GET', '/admin'], ['Not found', 'GET', '/nope'], ['Server bug', 'GET', '/crash'],
       ['Wrong method', 'POST', '/'], ['Submit a form', 'POST', '/form'], ['Headers only', 'HEAD', '/']].forEach(function (s) {
        chips.appendChild(NA.chip(s[0], function () { mSel.value = s[1]; state.method = s[1]; pathInp.value = s[2]; go(); }));
      });
      var pair = el('div', 'na-web-pair');
      var reqBox = el('div', 'na-web-box'), resBox = el('div', 'na-web-box');
      pair.appendChild(reqBox); pair.appendChild(resBox);
      var lower = el('div', 'na-cols');
      var logBox = el('div', 'na-web-logbox'), wireBox = el('div', 'na-web-box na-web-wire');
      lower.appendChild(logBox); lower.appendChild(wireBox);
      var say = NA.narrator();
      p.appendChild(ctr); p.appendChild(chips); p.appendChild(pair); p.appendChild(lower); p.appendChild(say.node);
      empty();

      function empty() {
        NA.clear(reqBox); NA.clear(resBox); NA.clear(logBox); NA.clear(wireBox); lower.hidden = true;
        reqBox.appendChild(el('div', 'na-lab', 'Request (browser → server)')); reqBox.appendChild(el('pre', 'na-web-pre dim', 'Pick a scenario above\nor press “Send request”.'));
        resBox.appendChild(el('div', 'na-lab', 'Response (server → browser)')); resBox.appendChild(el('pre', 'na-web-pre dim', '…'));
        say.say('HTTP is just <b>text</b>: the browser sends a request (method, path, headers), and the server answers with a <b>status code</b> and, usually, a page. Press a scenario.');
      }
      function go() {
        var path = pathInp.value.trim() || '/'; if (path.charAt(0) !== '/') path = '/' + path;
        pathInp.value = path;
        state.load = E.web.Browser.load({ method: state.method, path: path, https: state.https });
        state.sel = 0; paint(); narrate();
      }
      function paint() {
        var L = state.load, cur = L.log[state.sel]; lower.hidden = false;
        NA.clear(reqBox); NA.clear(resBox); NA.clear(logBox); NA.clear(wireBox);
        reqBox.appendChild(el('div', 'na-lab', 'Request #' + cur.n + ' (browser → server)'));
        reqBox.appendChild(el('pre', 'na-web-pre', E.web.rawRequest(cur.req)));
        var fam = E.web.familyInfo(cur.res.status);
        var lab = el('div', 'na-lab'); lab.appendChild(document.createTextNode('Response #' + cur.n + ' (server → browser) '));
        resBox.appendChild(lab);
        var badge = el('div', 'na-web-status f' + fam.cls.charAt(0));
        badge.appendChild(el('b', null, cur.res.status + ' ' + cur.res.reason)); badge.appendChild(el('span', null, ' · ' + fam.cls + ' ' + fam.name + ' — ' + fam.text));
        resBox.appendChild(badge);
        resBox.appendChild(el('pre', 'na-web-pre', E.web.rawResponse(cur.res, cur.method)));
        /* log */
        logBox.appendChild(el('div', 'na-lab', 'Request log — one click on “Go” may mean several requests'));
        var t = el('table', 'na-table na-web-log'); var th = el('tr'); ['#', 'Request', 'Status', 'Bytes', 'Why'].forEach(function (h) { th.appendChild(el('th', null, h)); }); t.appendChild(th);
        L.log.forEach(function (r, i) {
          var tr = el('tr', i === state.sel ? 'sel' : ''); tr.tabIndex = 0; tr.setAttribute('role', 'button'); tr.setAttribute('aria-label', 'Show request ' + r.n + ': ' + r.method + ' ' + r.path + ', status ' + r.status);
          tr.appendChild(el('td', null, String(r.n))); tr.appendChild(el('td', null, r.method + ' ' + r.path));
          var st = el('td', 'f' + String(r.status).charAt(0) + ' na-web-stc', r.status + ' ' + r.reason); tr.appendChild(st);
          tr.appendChild(el('td', null, String(r.bytes))); tr.appendChild(el('td', 'na-web-why', r.note));
          function pick() { state.sel = i; paint(); }
          tr.addEventListener('click', pick); tr.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
          t.appendChild(tr);
        });
        logBox.appendChild(el('div', 'na-tbl-scroll', t));
        /* eavesdropper */
        wireBox.appendChild(el('div', 'na-lab', 'Eavesdropper on the cable sees…'));
        var txt = E.web.rawRequest(cur.req) + '\n\n' + E.web.rawResponse(cur.res, cur.method);
        if (state.https) {
          wireBox.appendChild(el('pre', 'na-web-pre scr', E.web.scramble(txt, 9)));
          wireBox.appendChild(el('div', 'na-web-cap', '🔒 https: encrypted noise. (Illustration only — made from a hash, not real TLS. Real TLS agrees a secret key in a handshake first.) Still visible to the spy: the server’s address and roughly how much data moved.'));
        } else {
          wireBox.appendChild(el('pre', 'na-web-pre open', txt));
          wireBox.appendChild(el('div', 'na-web-cap', 'http: the very same text, readable by anyone on the path (café Wi-Fi, a router in between…). A password in a form would be in the clear. Switch to https:// and send again.'));
        }
      }
      function narrate() {
        var L = state.load, f = L.final, first = L.log[0], s = first.res.status;
        var base;
        if (s === 301) base = '<b>301 Moved Permanently.</b> The server did not send the page; it said “it lives at <code>/new-page</code> now” in a <code>Location:</code> header. The browser followed that by itself, so <b>you made one click but the browser made ' + L.log.length + ' requests</b>.';
        else if (s === 403) base = '<b>403 Forbidden.</b> The server understood the request and refuses on purpose — you have no permission. (Different from 404: the page <em>does</em> exist.)';
        else if (s === 404) base = '<b>404 Not Found.</b> The server is working fine; there is simply nothing at that path — usually a broken link or a typo. The 4xx family means “the request was the problem”.';
        else if (s === 500) base = '<b>500 Internal Server Error.</b> This time it is the <em>server’s</em> fault: its own program crashed while building the page. Nothing you change in the request would help — 5xx means “not your mistake”.';
        else if (s === 405) base = '<b>405 Method Not Allowed.</b> The path exists, but not for ' + first.method + '. The <code>Allow:</code> header lists what is accepted here. Reading a page is GET; sending data is POST.';
        else if (first.method === 'HEAD') base = '<b>HEAD</b> asks for the headers only. Look: <code>Content-Length</code> says how big the page would be, but no body came back — handy for checking a page cheaply.';
        else if (first.method === 'POST') base = '<b>POST</b> sends data (here a small form) <em>to</em> the server in the request body, after a blank line. <b>200 OK</b>: it was accepted.';
        else if (L.objectCount) base = '<b>200 OK</b> — the base HTML file arrived. But a page is the HTML <em>plus the objects it mentions</em>: the browser read it and immediately asked for <b>' + L.objectCount + ' more things</b> (style sheet, script, picture). <b>One page = ' + L.log.length + ' requests.</b>';
        else base = '<b>' + s + ' ' + first.res.reason + '.</b> Response lines are: status line, headers, blank line, body.';
        say.say(base + (L.log.length > 1 ? ' Click a row of the log to read any of them.' : ''));
      }
    }
  }
  NA.register('web', { title: 'URLs and HTTP: take an address apart, then talk to a server', hint: 'Simulated server www.example.com (203.0.113.10) — nothing leaves your browser.', build: buildWeb });

  /* =====================================================================================
     9.8  Moving the data — engines: Link (packets vs one block), Arq (lossy links), Routing (Dijkstra)
     ===================================================================================== */
  function transferTime(bytes, bps) { return bytes * 8 / bps; }

  /* Link.sim: Alice sends one big file, Bob sends small chat messages; one shared link.
     'whole': the file goes out as one block, chats queue behind it (first come, first served).
     'packets': both are cut into packets (mtu bytes on the wire, header bytes of overhead each) and take turns. */
  function linkSim(o) {
    var bps = o.linkBps, mtu = o.mtu || 1500, H = o.header == null ? 40 : o.header, payload = mtu - H;
    var chats = (o.chats || []).map(function (c, i) { return { at: c.at, bytes: c.bytes, i: i }; }).sort(function (a, b) { return a.at - b.at || a.i - b.i; });
    var segs = [], waits = [], delays = [], fileDone, overhead;
    function addSeg(who, s, e) { var l = segs[segs.length - 1]; if (l && l.who === who && Math.abs(l.end - s) < 1e-12) l.end = e; else segs.push({ who: who, start: s, end: e }); }
    if (o.mode !== 'packets') {
      var T = transferTime(o.fileBytes, bps), free = T;
      addSeg('A', 0, T); fileDone = T;
      chats.forEach(function (c) {
        var st = Math.max(c.at, free), en = st + transferTime(c.bytes, bps);
        addSeg('B', st, en); free = en; waits[c.i] = st - c.at; delays[c.i] = en - c.at;
      });
      overhead = H;
      return { chatWaits: waits, chatDelays: delays, fileDone: fileDone, overheadBytes: overhead, segments: segs, packets: 1, payload: o.fileBytes, packetTime: T, end: Math.max(T, free) };
    }
    var n = Math.max(1, Math.ceil(o.fileBytes / payload)), pt = mtu * 8 / bps;
    var lastBytes = o.fileBytes - (n - 1) * payload + H, lastPt = lastBytes * 8 / bps;
    var pq = [];
    chats.forEach(function (c) { var rem = c.bytes; do { var b = Math.min(payload, rem); pq.push({ i: c.i, at: c.at, bytes: b + H, first: rem === c.bytes }); rem -= b; } while (rem > 0); });
    var qi = 0, t = 0, k = 0, lastWas = null, starts = [], ends = [];
    while (true) {
      var ready = qi < pq.length && pq[qi].at <= t + 1e-12, fileLeft = k < n;
      if (ready && (lastWas !== 'B' || !fileLeft)) {
        var p = pq[qi++], tx = p.bytes * 8 / bps;
        if (p.first) starts[p.i] = t;
        addSeg('B', t, t + tx); t += tx; ends[p.i] = t; lastWas = 'B'; continue;
      }
      if (fileLeft) {
        var nextAt = qi < pq.length ? pq[qi].at : Infinity, fullLeft = n - 1 - k;
        if (lastWas !== 'B' && nextAt > t && fullLeft > 0) {
          var cnt = nextAt === Infinity ? fullLeft : Math.min(fullLeft, Math.max(1, Math.ceil((nextAt - t) / pt - 1e-9)));
          addSeg('A', t, t + cnt * pt); t += cnt * pt; k += cnt; lastWas = 'A';
        } else {
          var tx2 = k < n - 1 ? pt : lastPt;
          addSeg('A', t, t + tx2); t += tx2; k++; lastWas = 'A';
        }
        if (k >= n && fileDone === undefined) fileDone = t;
        continue;
      }
      if (qi < pq.length) { t = Math.max(t, pq[qi].at); lastWas = null; continue; }
      break;
    }
    chats.forEach(function (c) { waits[c.i] = starts[c.i] - c.at; delays[c.i] = ends[c.i] - c.at; });
    return { chatWaits: waits, chatDelays: delays, fileDone: fileDone, overheadBytes: (n + pq.length) * H, segments: segs, packets: n, payload: payload, packetTime: pt, end: t };
  }
  /* a not-to-scale strip of who owns the link, slot by slot (for the "zoom in" picture) */
  function linkCartoon(mode, nFile, chatAt) {
    nFile = nFile || 14; chatAt = chatAt || [3, 8, 11];
    var out = [], pending = [], c = 0, slot = 0, left = nFile;
    if (mode !== 'packets') {
      for (var i = 0; i < nFile; i++) out.push('A');
      chatAt.forEach(function () { out.push('B'); });
      return out;
    }
    var last = null;
    while (left > 0 || pending.length || c < chatAt.length) {
      while (c < chatAt.length && chatAt[c] <= slot) { pending.push(1); c++; }
      if (pending.length && (last !== 'B' || left === 0)) { pending.pop(); out.push('B'); last = 'B'; }
      else if (left > 0) { out.push('A'); left--; last = 'A'; }
      else { out.push(null); last = null; }
      slot++;
    }
    return out;
  }

  /* ---- Arq: automatic repeat request over a lossy link. Time runs in ticks; the sender sends at most one packet per tick. ----
     proto: 'sw' (stop-and-wait = Go-Back-N with a window of 1), 'gbn', 'sr'. Packet and ACK losses are decided by dice(seed, kind, seq, attempt),
     so every protocol meets exactly the same bad luck. */
  function arqRun(o) {
    var proto = o.proto || 'sw', n = o.n || 10, loss = o.loss == null ? 0.2 : o.loss, d = Math.max(1, o.delay || 2), seed = o.seed == null ? 1 : o.seed;
    var W = proto === 'sw' ? 1 : Math.max(1, o.window || 4), timeout = o.timeout || (2 * d + 2), CAP = o.cap || 3000;
    var events = [], timeouts = [], deliveries = [], inflight = [], attempts = [], ackCount = [];
    var base = 0, next = 0, deadline = null, doneAt = null, dataSent = 0, discarded = 0, duplicates = 0, capped = false;
    var dl = [], pending = [], acked = [], sent = [];           // selective repeat bookkeeping
    var expected = 0, rcvBase = 0, got = [];                    // receiver state
    var t;
    function transmit(s) {
      attempts[s] = (attempts[s] || 0) + 1;
      var lost = NA.dice(seed, 1, s, attempts[s]) < loss;
      var ev = { kind: 'data', seq: s, sentAt: t, arriveAt: t + d, lost: lost, attempt: attempts[s] };
      events.push(ev); if (!lost) inflight.push(ev); dataSent++;
      if (proto === 'sr') { sent[s] = true; dl[s] = t + timeout; pending[s] = false; }
      else if (deadline === null) deadline = t + timeout;
    }
    function sendAck(a) {
      ackCount[a] = (ackCount[a] || 0) + 1;
      var lost = NA.dice(seed, 2, a, ackCount[a]) < loss;
      var ev = { kind: 'ack', seq: a, sentAt: t, arriveAt: t + d, lost: lost, attempt: ackCount[a] };
      events.push(ev); if (!lost) inflight.push(ev);
    }
    for (t = 0; t < CAP; t++) {
      /* 1. the sender may put one packet on the wire */
      var pkt = null;
      if (proto === 'sr') {
        for (var s0 = base; s0 < Math.min(n, base + W); s0++) if (pending[s0] && !acked[s0]) { pkt = s0; break; }
        if (pkt === null && next < Math.min(n, base + W)) pkt = next++;
      } else if (base < n && next < Math.min(n, base + W)) pkt = next++;
      if (pkt !== null) transmit(pkt);
      /* 2. things that arrive this tick */
      var arriving = inflight.filter(function (e) { return e.arriveAt === t; });
      inflight = inflight.filter(function (e) { return e.arriveAt !== t; });
      arriving.filter(function (e) { return e.kind === 'data'; }).forEach(function (e) {
        var s = e.seq;
        if (proto === 'sr') {
          if (s < rcvBase || got[s]) { duplicates++; sendAck(s); return; }
          got[s] = true; sendAck(s);
          while (got[rcvBase]) { deliveries.push({ seq: rcvBase, at: t }); rcvBase++; }
        } else if (s === expected) { deliveries.push({ seq: s, at: t }); expected++; sendAck(s); }
        else { discarded++; if (expected > 0) sendAck(expected - 1); }
      });
      arriving.filter(function (e) { return e.kind === 'ack'; }).forEach(function (e) {
        var a = e.seq;
        if (proto === 'sr') { acked[a] = true; while (acked[base]) base++; }
        else if (a >= base) { base = a + 1; deadline = base < next ? t + timeout : null; }
      });
      if (base >= n) { doneAt = t + 1; break; }
      /* 3. timers */
      if (proto === 'sr') {
        for (var s1 = base; s1 < Math.min(n, base + W); s1++) {
          if (sent[s1] && !acked[s1] && !pending[s1] && dl[s1] <= t) { pending[s1] = true; timeouts.push({ at: t, seq: s1 }); }
        }
      } else if (deadline !== null && t >= deadline && base < next) {
        timeouts.push({ at: t, seq: base }); next = base; deadline = null;
      }
    }
    if (doneAt === null) { capped = true; doneAt = CAP; }
    return { proto: proto, events: events, timeouts: timeouts, deliveries: deliveries, doneAt: doneAt, dataSent: dataSent, retransmissions: dataSent - n,
      discarded: discarded, duplicates: duplicates, capped: capped, params: { n: n, loss: loss, delay: d, window: W, timeout: timeout, seed: seed } };
  }

  /* ---- Routing: Dijkstra's shortest paths on a small invented network ---- */
  var GRAPH = {
    nodes: { A: { x: 62, y: 150 }, B: { x: 190, y: 56 }, C: { x: 190, y: 244 }, D: { x: 370, y: 56 }, E: { x: 370, y: 244 }, F: { x: 506, y: 150 } },
    edges: [
      { id: 'A-B', a: 'A', b: 'B', cost: 4 }, { id: 'A-C', a: 'A', b: 'C', cost: 2 }, { id: 'B-C', a: 'B', b: 'C', cost: 1 },
      { id: 'B-D', a: 'B', b: 'D', cost: 5 }, { id: 'C-E', a: 'C', b: 'E', cost: 8 }, { id: 'D-E', a: 'D', b: 'E', cost: 3 },
      { id: 'D-F', a: 'D', b: 'F', cost: 7 }, { id: 'E-F', a: 'E', b: 'F', cost: 3 }
    ]
  };
  function dijkstra(g, src, broken) {
    broken = broken || [];
    var names = Object.keys(g.nodes).sort(), dist = {}, prev = {}, done = {}, order = [];
    names.forEach(function (v) { dist[v] = Infinity; }); dist[src] = 0;
    function snap(extra) { var dd = {}; names.forEach(function (v) { dd[v] = dist[v]; }); return Object.assign({ dist: dd, prev: Object.assign({}, prev), settledSet: order.slice() }, extra); }
    var steps = [snap({ settled: null, examined: [] })];
    while (true) {
      var u = null;
      names.forEach(function (v) { if (!done[v] && dist[v] < Infinity && (u === null || dist[v] < dist[u])) u = v; });
      if (u === null) break;
      done[u] = true; order.push(u);
      var examined = [];
      g.edges.forEach(function (e) {
        if (broken.indexOf(e.id) >= 0) return;
        var other = e.a === u ? e.b : e.b === u ? e.a : null;
        if (other === null || done[other]) return;
        var nd = dist[u] + e.cost, better = nd < dist[other];
        if (better) { dist[other] = nd; prev[other] = u; }
        examined.push({ edge: e.id, to: other, newDist: nd, improved: better });
      });
      steps.push(snap({ settled: u, examined: examined }));
    }
    return { steps: steps, dist: dist, prev: prev, order: order };
  }
  function routePath(prev, src, dst) {
    if (dst === src) return [src];
    if (prev[dst] === undefined) return null;
    var p = [dst], v = dst, guard = 0;
    while (v !== src && guard++ < 50) { v = prev[v]; if (v === undefined) return null; p.unshift(v); }
    return p;
  }
  function forwardingTable(g, src, broken) {
    var r = dijkstra(g, src, broken), rows = [];
    Object.keys(g.nodes).sort().forEach(function (dest) {
      if (dest === src) return;
      var p = routePath(r.prev, src, dest);
      rows.push({ dest: dest, nextHop: p ? p[1] : null, cost: p ? r.dist[dest] : null, path: p });
    });
    return rows;
  }

  E.transfer = { transferTime: transferTime, Link: { sim: linkSim, cartoon: linkCartoon }, Arq: { run: arqRun }, Routing: { GRAPH: GRAPH, dijkstra: dijkstra, path: routePath, forwardingTable: forwardingTable } };

  /* =====================================================================================
     9.8  Moving the data — UI
     ===================================================================================== */
  function buildTransfer(host, NA) {
    var el = NA.el, svg = NA.svg;
    host.classList.add('na-transfer');
    host.appendChild(el('p', 'na-try', [el('b', null, 'Try this: '), 'on “Why packets?” send a big file on a slow link in “whole message” mode and watch Bob wait; then on “Lossy link” compare the three protocols on the same bad luck; on “Routing” cut a link and see the route change.']));
    NA.tabs(host, [
      { label: 'Why packets?', build: tabPackets },
      { label: 'Lossy link (ARQ)', build: tabArq },
      { label: 'Routing', build: tabRouting }
    ]);

    /* ---------- (a) bandwidth and packets ---------- */
    function tabPackets(p) {
      var LINKS = [['56 kbps dial-up', 56e3], ['1.544 Mbps T1', 1.544e6], ['10 Mbps', 10e6], ['100 Mbps', 100e6], ['1 Gbps', 1e9]];
      var st = { bps: 10e6, mb: Math.pow(10, 1.4), mode: 'whole' };
      var chips = el('div', 'na-chips'); chips.appendChild(el('span', 'na-lab', 'Link'));
      var chipBtns = LINKS.map(function (l) { var c = NA.chip(l[0], function () { st.bps = l[1]; draw(); }); chips.appendChild(c); return c; });
      var fs = NA.slider('File size', 0, 3, 0.05, 1.4, function (x) { var mb = Math.pow(10, x); return NA.fmtBytes(mb * 1e6); }, function (x) { st.mb = Math.pow(10, x); draw(); });
      var mode = NA.segmented([{ value: 'whole', label: 'Whole message' }, { value: 'packets', label: 'Packets (1500 B)' }], 'whole', function (v) { st.mode = v; draw(); }, 'How the file is sent');
      var mf = el('div', 'na-field'); mf.appendChild(el('span', 'na-lab', 'Alice sends her file as…')); mf.appendChild(mode.wrap);
      var ctr = el('div', 'na-controls'); ctr.appendChild(fs.wrap); ctr.appendChild(mf);
      var conv = el('div', 'na-tr-conv');
      var stats = el('div', 'na-stats'); var sTime = NA.stat('File alone on the link'), sWait = NA.stat('Bob’s worst wait'), sDone = NA.stat('Alice’s file arrives'), sOver = NA.stat('Header overhead');
      [sTime, sWait, sDone, sOver].forEach(function (s) { stats.appendChild(s.node); });
      var stage = el('div', 'na-stage'); var cartoon = el('div', 'na-tr-cartoon');
      var say = NA.narrator();
      p.appendChild(chips); p.appendChild(ctr); p.appendChild(conv); p.appendChild(stats); p.appendChild(stage); p.appendChild(cartoon); p.appendChild(say.node);
      function draw() {
        var T = E.transfer.transferTime(st.mb * 1e6, st.bps);
        var fr = [0.1, 0.25, 0.4, 0.6, 0.85];
        var r = E.transfer.Link.sim({ fileBytes: st.mb * 1e6, linkBps: st.bps, mode: st.mode, mtu: 1500, chats: fr.map(function (f) { return { at: f * T, bytes: 1000 }; }) });
        chipBtns.forEach(function (c, i) { c.setAttribute('aria-pressed', LINKS[i][1] === st.bps ? 'true' : 'false'); });
        conv.innerHTML = '<b>Bits vs bytes:</b> <span class="na-mono">' + NA.fmtBps(st.bps) + ' ÷ 8 = ' + NA.fmtBytes(st.bps / 8) + ' per second</span>.  Time = size × 8 ÷ speed = <span class="na-mono">' + NA.fmtBytes(st.mb * 1e6) + ' × 8 ÷ ' + NA.fmtBps(st.bps) + ' = ' + NA.fmtTime(T) + '</span>.';
        var worst = Math.max.apply(null, r.chatDelays);
        sTime.set(NA.fmtTime(T)); sWait.set(NA.fmtTime(worst), 'for a 1 kB message');
        sDone.set(NA.fmtTime(r.fileDone), st.mode === 'packets' ? '+' + Math.round((r.fileDone / T - 1) * 1000) / 10 + '% (headers, Bob’s turns)' : 'as if alone');
        sOver.set(NA.fmtBytes(r.overheadBytes), st.mode === 'packets' ? (40 / 1500 * 100).toFixed(1) + '% of every packet' : 'one header only');
        sWait.node.className = 'na-stat ' + (st.mode === 'whole' && worst > 1 ? 'bad' : st.mode === 'packets' ? 'good' : '');
        timeline(r, T, fr);
        cartoonDraw();
        var avgWhole = worst;
        say.say(st.mode === 'whole'
          ? '<b>One big block.</b> Alice’s file owns the link for <b>' + NA.fmtTime(T) + '</b>. Bob’s 1 kB chat messages arrive in the middle and must wait in line — the last one waits <span class="bad">' + NA.fmtTime(worst) + '</span> for a message that needs a few milliseconds. That is why nobody sends data as one piece.'
          : '<b>Cut into packets.</b> Alice’s file is <b>' + r.packets.toLocaleString('en-US') + '</b> packets of 1500 bytes, and the link serves the two senders in turns. Bob now waits at most <b>one packet time</b> (' + NA.fmtTime(r.packetTime) + ') — worst case here <span class="ok">' + NA.fmtTime(worst) + '</span>. The price: every packet carries a 40-byte header (20 IP + 20 TCP) = ' + NA.fmtBytes(r.overheadBytes) + ' extra, and Alice finishes a hair later.');
      }
      function timeline(r, T, fr) {
        NA.clear(stage);
        var W = 640, Hh = 190, x0 = 78, x1 = 624, total = r.end || T;
        var s = svg('svg', { viewBox: '0 0 ' + W + ' ' + Hh, role: 'img', 'aria-label': 'Timeline of the shared link. Alice’s lane is busy for the whole file transfer; Bob’s five small messages ' + (st.mode === 'whole' ? 'wait until it ends.' : 'get through after at most one packet.') }, stage);
        var defs = svg('defs', null, s), pat = svg('pattern', { id: 'na-trp', width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
        svg('rect', { width: 6, height: 6, fill: 'color-mix(in srgb, var(--cmp-1) 30%, var(--surface))' }, pat); svg('rect', { width: 3, height: 6, fill: 'var(--cmp-1)' }, pat);
        function X(t) { return x0 + (x1 - x0) * Math.min(1, t / total); }
        svg('text', { x: 8, y: 52, class: 'na-tr-lane' }, s, 'Alice'); svg('text', { x: 8, y: 66, class: 'na-tr-sub' }, s, 'big file');
        svg('text', { x: 8, y: 112, class: 'na-tr-lane' }, s, 'Bob'); svg('text', { x: 8, y: 126, class: 'na-tr-sub' }, s, '5 chat msgs');
        svg('rect', { x: x0, y: 36, width: x1 - x0, height: 34, class: 'na-tr-laneBg' }, s); svg('rect', { x: x0, y: 96, width: x1 - x0, height: 34, class: 'na-tr-laneBg' }, s);
        r.segments.forEach(function (g) {
          if (g.who === 'A') svg('rect', { x: X(g.start), y: 36, width: Math.max(1, X(g.end) - X(g.start)), height: 34, fill: st.mode === 'packets' ? 'url(#na-trp)' : 'color-mix(in srgb, var(--cmp-1) 55%, var(--surface))', stroke: 'var(--cmp-1)', 'stroke-width': 1.5 }, s);
        });
        fr.forEach(function (f, i) {
          var at = f * T, wait = r.chatWaits[i], del = r.chatDelays[i];
          svg('line', { x1: X(at), y1: 70, x2: X(at), y2: 96, stroke: 'var(--cmp-7)', 'stroke-width': 1.2, 'stroke-dasharray': '3 2' }, s);
          if (wait > 0) svg('rect', { x: X(at), y: 100, width: Math.max(1, X(at + wait) - X(at)), height: 26, fill: 'color-mix(in srgb, var(--red) 22%, var(--surface))', stroke: 'var(--red)', 'stroke-dasharray': '4 3', 'stroke-width': 1.2 }, s);
          svg('rect', { x: X(at + wait) - 1, y: 98, width: Math.max(4, X(at + del) - X(at + wait)), height: 30, fill: 'var(--cmp-7)', stroke: 'var(--cmp-7)' }, s);
          svg('text', { x: X(at), y: 144, 'text-anchor': 'middle', class: 'na-tr-sub' }, s, 'msg ' + (i + 1));
        });
        if (st.mode === 'whole') svg('text', { x: (X(fr[2] * T) + X(T)) / 2, y: 117, 'text-anchor': 'middle', class: 'na-tr-wait' }, s, 'waiting…');
        else svg('text', { x: x1, y: 168, 'text-anchor': 'end', class: 'na-tr-sub' }, s, 'Bob’s messages slip in between Alice’s packets (stripes = many tiny packets)');
        svg('line', { x1: x0, y1: 154, x2: x1, y2: 154, stroke: 'var(--ink-soft)' }, s);
        [0, 0.5, 1].forEach(function (f) { svg('text', { x: x0 + (x1 - x0) * f, y: 182, 'text-anchor': f === 0 ? 'start' : f === 1 ? 'end' : 'middle', class: 'na-tr-sub' }, s, f === 0 ? '0' : NA.fmtTime(total * f)); svg('line', { x1: x0 + (x1 - x0) * f, y1: 150, x2: x0 + (x1 - x0) * f, y2: 158, stroke: 'var(--ink-soft)' }, s); });
      }
      function cartoonDraw() {
        NA.clear(cartoon);
        cartoon.appendChild(el('div', 'na-lab', 'Zoom in (not to scale): who has the link, slot by slot — Alice ■ blue, Bob ■ orange'));
        var row = el('div', 'na-tr-slots'); row.setAttribute('role', 'img'); row.setAttribute('aria-label', 'Sequence of link slots');
        E.transfer.Link.cartoon(st.mode).forEach(function (w) { row.appendChild(el('span', 'na-tr-slot ' + (w === 'A' ? 'a' : w === 'B' ? 'b' : 'idle'), w === 'A' ? 'A' : w === 'B' ? 'B' : '')); });
        cartoon.appendChild(row);
      }
      draw();
    }

    /* ---------- (b) ARQ ---------- */
    function tabArq(p) {
      var N = 10;
      var st = { proto: 'gbn', loss: 0.2, delay: 2, window: 6, seed: 27, cursor: 0, playing: false };
      var run = NA.runner(), res, all;
      var protoSeg = NA.segmented([{ value: 'sw', label: 'Stop-and-wait' }, { value: 'gbn', label: 'Go-Back-N' }, { value: 'sr', label: 'Selective Repeat' }], st.proto, function (v) { st.proto = v; recompute(); }, 'Protocol');
      var pf = el('div', 'na-field'); pf.appendChild(el('span', 'na-lab', 'Protocol')); pf.appendChild(protoSeg.wrap);
      var loss = NA.slider('Loss', 0, 40, 5, 20, function (v) { return v + '%'; }, function (v) { st.loss = v / 100; recompute(); });
      var dly = NA.slider('One-way delay', 1, 4, 1, 2, function (v) { return v + ' tick' + (v > 1 ? 's' : ''); }, function (v) { st.delay = v; recompute(); });
      var win = NA.slider('Window', 2, 6, 1, 6, function (v) { return v + ' packets'; }, function (v) { st.window = v; recompute(); });
      var dice = NA.button('🎲 New dice', '', function () { st.seed = (st.seed * 7 + 3) % 1000; recompute(); }, 'Roll a different pattern of lost packets');
      var ctr = el('div', 'na-controls'); [pf, loss.wrap, dly.wrap, win.wrap, dice].forEach(function (c) { ctr.appendChild(c); });
      var play = NA.button('▶ Replay', 'primary', function () { toggle(); }), step = NA.button('Step ▸', '', function () { run.cancel(); st.playing = false; st.cursor = Math.min(res.doneAt, st.cursor + 1); paintPlay(); redraw(); });
      var reset = NA.button('⟲ Reset', '', function () { run.cancel(); st.playing = false; st.cursor = 0; paintPlay(); redraw(); });
      var scrub = el('input'); scrub.type = 'range'; scrub.min = 0; scrub.max = 20; scrub.value = 0; scrub.setAttribute('aria-label', 'Time cursor');
      scrub.addEventListener('input', function () { run.cancel(); st.playing = false; st.cursor = +scrub.value; paintPlay(); redraw(); });
      var tb = el('div', 'na-controls tight'); tb.appendChild(play); tb.appendChild(step); tb.appendChild(reset); var sc = NA.field('Time', scrub, 'grow'); tb.appendChild(sc); tb.appendChild(NA.speedControl());
      var cols = el('div', 'na-tr-stack');
      var stage = el('div', 'na-stage na-tr-arqstage'), side = el('div', 'na-tr-side');
      cols.appendChild(stage); cols.appendChild(side);
      var got = el('div', 'na-tr-got'); var say = NA.narrator();
      p.appendChild(ctr); p.appendChild(tb); p.appendChild(cols); p.appendChild(got); p.appendChild(say.node);
      function paintPlay() { play.textContent = st.playing ? '❚❚ Pause' : (st.cursor >= res.doneAt ? '▶ Replay' : '▶ Play'); }
      function toggle() {
        if (st.playing) { run.cancel(); st.playing = false; paintPlay(); return; }
        if (st.cursor >= res.doneAt) st.cursor = 0;
        st.playing = true; paintPlay(); var g = run.start();
        (async function () {
          while (st.cursor < res.doneAt) {
            if (!(await run.sleep(g, NA.dur(260)))) return;
            st.cursor++; redraw();
          }
          st.playing = false; paintPlay();
        })();
      }
      function recompute() {
        run.cancel(); st.playing = false;
        var base = { n: N, loss: st.loss, delay: st.delay, window: st.window, seed: st.seed };
        all = {}; ['sw', 'gbn', 'sr'].forEach(function (k) { all[k] = E.transfer.Arq.run(Object.assign({ proto: k }, base)); });
        res = all[st.proto]; win.input.disabled = st.proto === 'sw'; st.cursor = res.doneAt;
        scrub.max = res.doneAt; paintPlay(); redraw(true);
      }
      function redraw(full) {
        scrub.value = st.cursor; paintPlay();
        drawDiagram(); drawSide(); got.innerHTML = '';
        got.appendChild(el('span', 'na-lab', 'Receiver has delivered, in order:'));
        var dv = res.deliveries.filter(function (x) { return x.at < st.cursor; });
        for (var i = 0; i < N; i++) got.appendChild(el('span', 'na-tr-pk' + (i < dv.length ? ' on' : ''), String(i)));
        if (full === true || st.cursor >= res.doneAt) narrate();
        else say.say('Tick <b>' + st.cursor + '</b>. Watch the arrows travel: blue = data, green dashed = acknowledgement (the receiver’s “got it”), ✗ = lost on the way, ⏱ = the sender gave up waiting.');
      }
      function drawDiagram() {
        NA.clear(stage);
        var total = res.doneAt, ppt = Math.max(4.5, Math.min(11, 330 / (total + 1))), top = 44, W = 560, xs = 118, xr = 442, Hh = top + total * ppt + 24;
        var s = svg('svg', { viewBox: '0 0 ' + W + ' ' + Hh, role: 'img', 'aria-label': 'Space-time diagram of ' + N + ' packets between sender and receiver, finishing at tick ' + res.doneAt + '.' }, stage);
        function Y(t) { return top + t * ppt; }
        svg('text', { x: xs, y: 18, 'text-anchor': 'middle', class: 'na-tr-lane' }, s, 'Sender'); svg('text', { x: xr, y: 18, 'text-anchor': 'middle', class: 'na-tr-lane' }, s, 'Receiver');
        svg('line', { x1: xs, y1: 28, x2: xs, y2: Hh - 10, class: 'na-tr-axis' }, s); svg('line', { x1: xr, y1: 28, x2: xr, y2: Hh - 10, class: 'na-tr-axis' }, s);
        for (var t = 0; t <= total; t += (ppt < 7 ? 10 : 5)) { svg('text', { x: 30, y: Y(t) + 4, class: 'na-tr-sub', 'text-anchor': 'end' }, s, String(t)); svg('line', { x1: 34, y1: Y(t), x2: 40, y2: Y(t), stroke: 'var(--ink-soft)' }, s); }
        svg('text', { x: 6, y: 34, class: 'na-tr-sub' }, s, 'tick');
        var c = st.cursor;
        res.events.forEach(function (e) {
          if (e.sentAt > c) return;
          var data = e.kind === 'data', fx = data ? xs : xr, tx = data ? xr : xs, frac = Math.min(1, (c - e.sentAt) / st.delay), lim = e.lost ? 0.55 : 1, f = Math.min(frac, lim);
          var ex = fx + (tx - fx) * f, ey = Y(e.sentAt + st.delay * f);
          var cls = 'na-tr-arrow ' + (data ? (e.attempt > 1 ? 'rtx' : 'data') : 'ack') + (e.lost ? ' lost' : '');
          svg('line', { x1: fx, y1: Y(e.sentAt), x2: ex, y2: ey, class: cls }, s);
          if (frac < 1 && !(e.lost && frac >= lim)) svg('circle', { cx: ex, cy: ey, r: 3.2, class: 'na-tr-head ' + (data ? (e.attempt > 1 ? 'rtx' : 'data') : 'ack') }, s);
          if (e.lost && frac >= lim) svg('text', { x: ex, y: ey + 5, 'text-anchor': 'middle', class: 'na-tr-x' }, s, '✗');
          if (ppt >= 7 || data) svg('text', { x: data ? fx + 8 : fx - 8, y: Y(e.sentAt) + 3, 'text-anchor': data ? 'start' : 'end', class: 'na-tr-sub ' + (data ? 'd' : 'a') }, s, data ? '#' + e.seq + (e.attempt > 1 ? ' again' : '') : 'ack ' + e.seq);
        });
        res.timeouts.forEach(function (to) { if (to.at <= c) svg('text', { x: xs - 8, y: Y(to.at) + 4, 'text-anchor': 'end', class: 'na-tr-to' }, s, '⏱ timeout #' + to.seq); });
        var ph = svg('line', { x1: 38, y1: Y(c), x2: W - 8, y2: Y(c), class: 'na-tr-cursor' }, s);
      }
      function drawSide() {
        NA.clear(side);
        side.appendChild(el('div', 'na-lab', 'Same bad luck, three protocols'));
        var t = el('table', 'na-table na-tr-cmp'), th = el('tr'); ['Protocol', 'Done at', 'Packets sent', 'Repeats'].forEach(function (h) { th.appendChild(el('th', null, h)); }); t.appendChild(th);
        var best = Math.min(all.sw.doneAt, all.gbn.doneAt, all.sr.doneAt);
        [['sw', 'Stop-and-wait'], ['gbn', 'Go-Back-N'], ['sr', 'Selective Repeat']].forEach(function (k) {
          var r = all[k[0]], tr = el('tr', k[0] === st.proto ? 'sel' : '');
          tr.appendChild(el('td', null, k[1])); tr.appendChild(el('td', r.doneAt === best ? 'na-best' : '', (r.capped ? '> ' : '') + r.doneAt + (r.doneAt === best ? ' ★' : ''))); tr.appendChild(el('td', null, String(r.dataSent))); tr.appendChild(el('td', null, String(r.retransmissions)));
          t.appendChild(tr);
        });
        side.appendChild(el('div', 'na-tbl-scroll', t));
        var k = el('div', 'na-key'); [['--cmp-1', 'data packet'], ['--cmp-7', 'resent packet'], ['--cmp-6', 'acknowledgement']].forEach(function (c) { var sp = el('span'); var i = el('i'); i.style.setProperty('--c', 'var(' + c[0] + ')'); sp.appendChild(i); sp.appendChild(document.createTextNode(c[1])); k.appendChild(sp); });
        side.appendChild(k);
        side.appendChild(el('div', 'na-note', 'Ticks are the unit of time: one packet takes one tick to send. ★ = fastest finish. “Done at” counts until the sender has heard the last acknowledgement. Timeout = 2 × delay + 2.'));
      }
      function narrate() {
        var r = res, lostN = r.events.filter(function (e) { return e.lost; }).length, txt;
        var busy = Math.round(N / r.doneAt * 100);
        if (r.proto === 'sw') txt = '<b>Stop-and-wait</b> sends one packet and then sits idle for a whole round trip before the next — the line was busy only <b>' + busy + '%</b> of the time. Simple and safe, but slow' + (r.retransmissions ? '; each of the ' + r.timeouts.length + ' loss(es) also cost a full timeout ⏱ of doing nothing.' : '.');
        else if (r.proto === 'gbn') txt = '<b>Go-Back-N</b> keeps up to ' + st.window + ' packets in flight, so it fills the pipe. The price: the receiver keeps only packets in perfect order. After a loss it threw away <b>' + r.discarded + '</b> later packet(s) that had arrived fine, and the sender, after its timeout ⏱, <b>went back</b> and re-sent them all: <b>' + r.retransmissions + ' repeat(s)</b>.';
        else txt = '<b>Selective Repeat</b> also keeps ' + st.window + ' packets in flight, but the receiver keeps out-of-order packets and acknowledges each one, so the sender re-sends <em>only</em> what really got lost: <b>' + r.retransmissions + ' repeat(s)</b> (' + lostN + ' lost things in all, counting acknowledgements).';
        var fastest = ['sw', 'gbn', 'sr'].sort(function (a, b) { return all[a].doneAt - all[b].doneAt; })[0];
        say.say(txt + ' Finished at tick <b>' + r.doneAt + '</b>. ' + (st.loss === 0 ? 'No loss here: raise the Loss slider and compare.' : 'On this dice roll the fastest was <b>' + { sw: 'Stop-and-wait', gbn: 'Go-Back-N', sr: 'Selective Repeat' }[fastest] + '</b>.'));
      }
      recompute();
    }

    /* ---------- (c) routing ---------- */
    function tabRouting(p) {
      var G = E.transfer.Routing.GRAPH, names = Object.keys(G.nodes);
      var st = { src: 'A', dst: 'F', broken: [], step: 0, setting: 'dst', playing: false };
      var run = NA.runner(), res;
      var sSel = NA.select(names.map(function (n) { return { value: n, label: 'Router ' + n }; }), 'A', function (v) { st.src = v; recompute(); });
      var dSel = NA.select(names.map(function (n) { return { value: n, label: 'Router ' + n }; }), 'F', function (v) { st.dst = v; recompute(); });
      var click = NA.segmented([{ value: 'src', label: 'Source' }, { value: 'dst', label: 'Destination' }], 'dst', function (v) { st.setting = v; }, 'What clicking a router sets');
      var ctr = el('div', 'na-controls'); ctr.appendChild(NA.field('From', sSel)); ctr.appendChild(NA.field('To', dSel));
      var cf = el('div', 'na-field'); cf.appendChild(el('span', 'na-lab', 'Clicking a router sets the')); cf.appendChild(click.wrap); ctr.appendChild(cf);
      var chips = el('div', 'na-chips'); chips.appendChild(el('span', 'na-lab', 'Scenarios'));
      [['A → F', 'A', 'F', []], ['Cut C–E (the shortcut)', 'A', 'F', ['C-E']], ['Cut A–C and B–D', 'A', 'F', ['A-C', 'B-D']], ['Cut both links into F', 'A', 'F', ['D-F', 'E-F']]].forEach(function (s) {
        chips.appendChild(NA.chip(s[0], function () { st.src = s[1]; st.dst = s[2]; st.broken = s[3].slice(); sSel.value = st.src; dSel.value = st.dst; recompute(); }));
      });
      var play = NA.button('▶ Replay Dijkstra', 'primary', function () { toggle(); }), stepB = NA.button('Step ▸', '', function () { run.cancel(); st.playing = false; if (st.step < res.steps.length) st.step++; redraw(); });
      var resetB = NA.button('⟲ Reset', '', function () { run.cancel(); st.playing = false; st.step = 0; redraw(); }), uncut = NA.button('Repair all links', '', function () { st.broken = []; recompute(); });
      var tb = el('div', 'na-controls tight'); [play, stepB, resetB, uncut].forEach(function (b) { tb.appendChild(b); }); tb.appendChild(NA.speedControl());
      var cols = el('div', 'na-cols'), stage = el('div', 'na-stage'), side = el('div', 'na-tr-side'); cols.appendChild(stage); cols.appendChild(side);
      var say = NA.narrator();
      p.appendChild(ctr); p.appendChild(chips); p.appendChild(tb); p.appendChild(cols); p.appendChild(say.node);
      function toggle() {
        if (st.playing) { run.cancel(); st.playing = false; redraw(); return; }
        if (st.step >= res.steps.length) st.step = 0;
        st.playing = true; var g = run.start(); redraw();
        (async function () {
          while (st.step < res.steps.length) {
            if (!(await run.sleep(g, NA.dur(750)))) return;
            st.step++; redraw();
          }
          st.playing = false; redraw();
        })();
      }
      function recompute() {
        run.cancel(); st.playing = false; res = E.transfer.Routing.dijkstra(G, st.src, st.broken); st.step = res.steps.length; redraw();
      }
      function redraw() {
        play.textContent = st.playing ? '❚❚ Pause' : '▶ Replay Dijkstra';
        var cur = res.steps[Math.min(st.step, res.steps.length) - 1] || res.steps[0], finished = st.step >= res.steps.length;
        var path = finished ? E.transfer.Routing.path(res.prev, st.src, st.dst) : null;
        drawMap(cur, path, finished); drawSide(cur, finished); narrate(cur, finished, path);
      }
      function drawMap(cur, path, finished) {
        NA.clear(stage);
        var s = svg('svg', { viewBox: '0 0 568 300', role: 'group', 'aria-label': 'Network of six routers A to F. Links can be cut by clicking them.' }, stage);
        var onPath = {}; if (path) for (var i = 0; i + 1 < path.length; i++) onPath[[path[i], path[i + 1]].sort().join('-')] = true;
        var exam = {}; (cur.examined || []).forEach(function (x) { exam[x.edge] = x; });
        var tree = {}; Object.keys(cur.prev).forEach(function (v) { if (cur.settledSet.indexOf(v) >= 0) tree[[v, cur.prev[v]].sort().join('-')] = true; });
        G.edges.forEach(function (e) {
          var a = G.nodes[e.a], b = G.nodes[e.b], broken = st.broken.indexOf(e.id) >= 0, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          var cls = 'na-tr-edge' + (broken ? ' cut' : '') + (!broken && onPath[e.id] ? ' path' : '') + (!broken && tree[e.id] && !onPath[e.id] ? ' tree' : '') + (!broken && exam[e.id] ? ' flash' : '');
          svg('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: cls }, s);
          var g = svg('g', { class: 'na-tr-ehit', tabindex: 0, role: 'button', 'aria-pressed': broken ? 'true' : 'false', 'aria-label': (broken ? 'Repair' : 'Cut') + ' link ' + e.a + ' to ' + e.b + ', cost ' + e.cost }, s);
          svg('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: 'transparent', 'stroke-width': 22 }, g);
          svg('rect', { x: mx - 15, y: my - 11, width: 30, height: 22, rx: 6, class: 'na-tr-cost' + (broken ? ' cut' : '') }, g);
          svg('text', { x: mx, y: my + 5, 'text-anchor': 'middle', class: 'na-tr-costt' }, g, broken ? '✂' : String(e.cost));
          function tog() { var i = st.broken.indexOf(e.id); if (i >= 0) st.broken.splice(i, 1); else st.broken.push(e.id); recompute(); }
          g.addEventListener('click', tog); g.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); tog(); } });
        });
        names.forEach(function (v) {
          var n = G.nodes[v], settled = cur.settledSet.indexOf(v) >= 0, dist = cur.dist[v];
          var cls = 'na-tr-node' + (settled ? ' settled' : '') + (cur.settled === v && !finished ? ' now' : '') + (v === st.src ? ' src' : '') + (v === st.dst ? ' dst' : '');
          var g = svg('g', { class: cls, tabindex: 0, role: 'button', 'aria-label': 'Router ' + v + (v === st.src ? ', source' : '') + (v === st.dst ? ', destination' : '') + '. Distance ' + (dist === Infinity ? 'unknown' : dist) }, s);
          svg('circle', { cx: n.x, cy: n.y, r: 27 }, g);
          svg('text', { x: n.x, y: n.y - 2, 'text-anchor': 'middle', class: 'na-tr-nname' }, g, v);
          svg('text', { x: n.x, y: n.y + 14, 'text-anchor': 'middle', class: 'na-tr-ndist' }, g, dist === Infinity ? '∞' : String(dist));
          if (v === st.src) svg('text', { x: n.x, y: n.y + 45, 'text-anchor': 'middle', class: 'na-tr-tag' }, g, 'from');
          if (v === st.dst) svg('text', { x: n.x, y: n.y + 45, 'text-anchor': 'middle', class: 'na-tr-tag' }, g, 'to');
          function pick() { if (st.setting === 'src') { st.src = v; sSel.value = v; } else { st.dst = v; dSel.value = v; } recompute(); }
          g.addEventListener('click', pick); g.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pick(); } });
        });
        var k = el('div', 'na-key'); stage.appendChild(k);
        [['--teal', 'shortest route'], ['--cmp-3', 'being examined now'], ['--cmp-10', 'best-known tree'], ['--red', 'cut link ✂']].forEach(function (c) { var sp = el('span'); var i = el('i'); i.style.setProperty('--c', 'var(' + c[0] + ')'); sp.appendChild(i); sp.appendChild(document.createTextNode(c[1])); k.appendChild(sp); });
      }
      function drawSide(cur, finished) {
        NA.clear(side);
        side.appendChild(el('div', 'na-lab', 'Distance from router ' + st.src + (finished ? ' (final)' : ' (so far)')));
        var t = el('table', 'na-table na-tr-dist'), th = el('tr'); ['Router', 'Cost', 'Via', 'State'].forEach(function (h) { th.appendChild(el('th', null, h)); }); t.appendChild(th);
        names.forEach(function (v) {
          var settledAt = cur.settledSet.indexOf(v), d = cur.dist[v];
          var tr = el('tr', (cur.settled === v && !finished ? 'now ' : '') + (settledAt >= 0 ? 'settled' : ''));
          tr.appendChild(el('td', null, v)); tr.appendChild(el('td', null, d === Infinity ? '∞' : String(d))); tr.appendChild(el('td', null, v === st.src ? '—' : (cur.prev[v] || '·')));
          tr.appendChild(el('td', null, settledAt >= 0 ? '✓ final (#' + (settledAt + 1) + ')' : d === Infinity ? 'not reached' : 'tentative'));
          t.appendChild(tr);
        });
        side.appendChild(el('div', 'na-tbl-scroll', t));
        side.appendChild(el('div', 'na-lab na-tr-gap', 'Forwarding table of router ' + st.src));
        var ft = el('table', 'na-table na-tr-fwd'), fh = el('tr'); ['To', 'Send to', 'Total cost'].forEach(function (h) { fh.appendChild(el('th', null, h)); }); ft.appendChild(fh);
        var full = E.transfer.Routing.forwardingTable(G, st.src, st.broken);
        full.forEach(function (r) { var tr = el('tr', r.dest === st.dst ? 'sel' : ''); tr.appendChild(el('td', null, r.dest)); tr.appendChild(el('td', null, r.nextHop || '✗ no route')); tr.appendChild(el('td', null, r.cost == null ? '—' : String(r.cost))); ft.appendChild(tr); });
        side.appendChild(el('div', 'na-tbl-scroll', ft));
      }
      function narrate(cur, finished, path) {
        if (!finished) {
          if (st.step === 0) { say.say('<b>Start:</b> router ' + st.src + ' knows only itself (cost 0). Every other router is “∞ — unknown”. Dijkstra will repeatedly pick the nearest router not yet final, and check whether going through it gives its neighbours a cheaper route.'); return; }
          var ex = cur.examined, ups = ex.filter(function (x) { return x.improved; });
          say.say('<b>Step ' + st.step + ':</b> router <b>' + cur.settled + '</b> (cost ' + cur.dist[cur.settled] + ') is the nearest unsettled router, so its cost can no longer improve — it is <b>final</b>. ' +
            (ex.length ? 'Looking along its links: ' + ex.map(function (x) { return x.to + ' via ' + cur.settled + ' = ' + x.newDist + (x.improved ? ' <span class="ok">(better — update)</span>' : ' (not better)'); }).join('; ') + '.' : 'No unsettled neighbours to check.'));
          return;
        }
        var ft = E.transfer.Routing.forwardingTable(G, st.src, st.broken), row = ft.filter(function (r) { return r.dest === st.dst; })[0];
        if (st.src === st.dst) { say.say('Source and destination are the same router — pick another destination.'); return; }
        if (!path) { say.say('<span class="bad">No route.</span> Every path from ' + st.src + ' to ' + st.dst + ' crosses a cut link, so ' + st.dst + ' is unreachable. Packets for it would be dropped (and real routers would report “destination unreachable”). Repair a link to restore it.'); return; }
        say.say('<b>Shortest route ' + st.src + ' → ' + st.dst + ': ' + path.join(' → ') + ', total cost ' + row.cost + '.</b> Notice router ' + st.src + ' does not store the whole path — only “to reach ' + st.dst + ', hand the packet to <b>' + row.nextHop + '</b>”. Each router along the way repeats the same decision with its own table. ' +
          (st.broken.length ? 'You cut ' + st.broken.join(', ') + ' and the tables recomputed — that is how the Internet routes around failures.' : 'Try cutting a link on the route (click its cost label) and watch the table change.'));
      }
      recompute();
    }
  }
  NA.register('transfer', { title: 'Moving the data: bandwidth, packets, lost packets and routes', hint: 'Three small experiments. Numbers are a simulation with invented networks.', build: buildTransfer });

  /* =====================================================================================
     9.9  Cloud vs edge AI — engine
     ===================================================================================== */
  var DECEL = 7;          // m/s², hard braking on dry road
  var CAPTURE_MS = 33;    // one frame of a 30 fps camera
  var CLOUD_AI_MS = 30;   // big model on a data-centre GPU (illustrative)
  var EDGE_AI_MS = 90;    // small model on the car's accelerator board (illustrative)
  /* Edge.decide: how long until the brake is pressed, and does the car stop in time?  (all numbers illustrative) */
  function decide(o) {
    var kmh = o.speedKmh, v = kmh / 3.6, dist = o.distanceM, mode = o.mode, parts, reacts = true;
    if (mode === 'edge') {
      parts = [{ id: 'capture', label: 'camera frame', ms: CAPTURE_MS }, { id: 'edge', label: 'edge AI on the car', ms: EDGE_AI_MS }];
    } else if (o.linkUp === false) {
      reacts = false;
      parts = [{ id: 'capture', label: 'camera frame', ms: CAPTURE_MS }, { id: 'upload', label: 'upload — link is down', ms: Infinity }];
    } else {
      var up = (o.frameKB || 200) * 8 / Math.max(0.1, o.uplinkMbps || 20);       // kbit ÷ Mbit/s = ms
      parts = [{ id: 'capture', label: 'camera frame', ms: CAPTURE_MS }, { id: 'upload', label: 'upload (delay + sending the frame)', ms: o.rttMs / 2 + up },
        { id: 'cloud', label: 'cloud AI', ms: CLOUD_AI_MS }, { id: 'down', label: 'answer comes back', ms: o.rttMs / 2 }];
    }
    var latency = parts.reduce(function (s, p) { return s + p.ms; }, 0), brakingM = v * v / (2 * DECEL);
    if (!reacts) return { mode: mode, reacts: false, latencyMs: Infinity, parts: parts, travelBeforeBrakeM: Infinity, brakingM: 0, stopDistanceM: Infinity, stopsShort: false, impactKmh: kmh, marginM: -Infinity };
    var travel = v * latency / 1000, stopDist = travel + brakingM, stops = stopDist <= dist, impact = 0;
    if (!stops) impact = travel >= dist ? kmh : Math.sqrt(Math.max(0, v * v - 2 * DECEL * (dist - travel))) * 3.6;
    return { mode: mode, reacts: true, latencyMs: latency, parts: parts, travelBeforeBrakeM: travel, brakingM: brakingM, stopDistanceM: stopDist, stopsShort: stops, impactKmh: impact, marginM: dist - stopDist };
  }
  /* Edge.dataBill: bytes sent to the cloud in `hours` of driving (illustrative) */
  function dataBill(o) {
    var hours = o.hours || 1, mbps = o.cameraMbps || 8, ev = o.eventsPerHour == null ? 20 : o.eventsPerHour, kb = o.eventKB || 5;
    var cloud = mbps * 1e6 / 8 * 3600 * hours, edge = ev * hours * kb * 1000 + 60 * 1000 * hours;   // events + a 1 kB/min heartbeat
    return { cloudBytes: cloud, edgeBytes: edge, ratio: cloud / edge };
  }
  E.edge = { decide: decide, dataBill: dataBill, DECEL: DECEL };

  /* =====================================================================================
     9.9  Cloud vs edge AI — UI
     ===================================================================================== */
  function buildEdge(host, NA) {
    var el = NA.el, svg = NA.svg;
    host.classList.add('na-edge');
    host.appendChild(el('p', 'na-try', [el('b', null, 'Try this: '), 'choose “Rural 3G”, press “Obstacle ahead!” in Cloud mode, then switch to Edge and press it again. Then pick “Tunnel” and see what happens when the link drops.']));
    var st = { mode: 'cloud', speed: 60, dist: 40, rtt: 40, up: 40, linkUp: true, events: 20, anim: null };
    var run = NA.runner();
    var modeSeg = NA.segmented([{ value: 'cloud', label: 'Cloud AI' }, { value: 'edge', label: 'Edge AI' }], 'cloud', function (v) { st.mode = v; update(); }, 'Where the AI runs');
    var mf = el('div', 'na-field'); mf.appendChild(el('span', 'na-lab', 'Where does the AI run?')); mf.appendChild(modeSeg.wrap);
    var linkBtn = NA.chip('📡 Link drops (tunnel)', function () { st.linkUp = !st.linkUp; update(); }); linkBtn.setAttribute('aria-pressed', 'false');
    var go = NA.button('⚠ Obstacle ahead!', 'primary', function () { launch(); });
    var top = el('div', 'na-controls'); top.appendChild(mf); var lf = el('div', 'na-field'); lf.appendChild(el('span', 'na-lab', 'Network')); lf.appendChild(linkBtn); top.appendChild(lf); top.appendChild(go); top.appendChild(NA.speedControl());
    var sSp = NA.slider('Car speed', 30, 120, 5, st.speed, function (v) { return v + ' km/h'; }, function (v) { st.speed = v; update(); });
    var sDi = NA.slider('Obstacle seen at', 20, 120, 5, st.dist, function (v) { return v + ' m'; }, function (v) { st.dist = v; update(); });
    var sRt = NA.slider('Network round trip', 10, 1500, 10, st.rtt, function (v) { return v + ' ms'; }, function (v) { st.rtt = v; update(); });
    var sUp = NA.slider('Uplink speed', 1, 50, 1, st.up, function (v) { return v + ' Mbps'; }, function (v) { st.up = v; update(); });
    var sl = el('div', 'na-controls'); [sSp, sDi, sRt, sUp].forEach(function (s) { sl.appendChild(s.wrap); });
    var chips = el('div', 'na-chips'); chips.appendChild(el('span', 'na-lab', 'Network presets'));
    [['Good 5G in the city', 30, 50, true], ['Rural 3G', 600, 2, true], ['Tunnel (link drops)', 40, 40, false]].forEach(function (c) {
      chips.appendChild(NA.chip(c[0], function () { st.rtt = c[1]; st.up = c[2]; st.linkUp = c[3]; sRt.set(c[1]); sUp.set(c[2]); update(); }));
    });
    var stage = el('div', 'na-stage'); var bar = el('div', 'na-ed-bar'); var cmp = el('div', 'na-ed-cmp'); var bill = el('div', 'na-ed-bill');
    var say = NA.narrator();
    [top, sl, chips, stage, bar, cmp, say.node, bill].forEach(function (n) { host.appendChild(n); });

    function params(mode) { return { mode: mode || st.mode, speedKmh: st.speed, distanceM: st.dist, rttMs: st.rtt, uplinkMbps: st.up, frameKB: 200, linkUp: st.linkUp }; }
    function fmtMs(ms) { return ms === Infinity ? '∞' : ms < 1000 ? Math.round(ms) + ' ms' : (ms / 1000).toFixed(2) + ' s'; }
    var PPM = 4.4, OBS_X = 598;

    function update() {
      run.cancel(); st.anim = null; go.disabled = false;
      linkBtn.setAttribute('aria-pressed', st.linkUp ? 'false' : 'true');
      linkBtn.textContent = st.linkUp ? '📡 Link is up — click to drop it' : '📡 Link is DOWN — click to restore';
      sUp.input.disabled = sRt.input.disabled = (st.mode === 'edge');
      drawRoad(0, false, null); drawBar(); drawCmp(); drawBill();
      var d = E.edge.decide(params());
      say.say(describe(d, false));
    }
    function describe(d, done) {
      var head;
      if (st.mode === 'edge') head = '<b>Edge AI:</b> the car itself recognises the obstacle in <b>' + fmtMs(d.latencyMs) + '</b> — no network involved, so the sliders for the link do nothing. ';
      else if (!d.reacts) head = '<b>Cloud AI with the link down:</b> the frame can never reach the data centre, so the car <span class="bad">never gets an answer</span>. ';
      else head = '<b>Cloud AI:</b> the picture must travel to the data centre and the answer back: <b>' + fmtMs(d.latencyMs) + '</b>. ';
      var how;
      if (!d.reacts) how = 'It drives straight into the obstacle at full speed (' + st.speed + ' km/h).';
      else how = 'In that time the car rolls <b>' + d.travelBeforeBrakeM.toFixed(1) + ' m</b> before the brake even starts, then needs <b>' + d.brakingM.toFixed(1) + ' m</b> to stop = ' + d.stopDistanceM.toFixed(1) + ' m. The obstacle is ' + st.dist + ' m away → ' +
        (d.stopsShort ? '<span class="ok">stops ' + d.marginM.toFixed(1) + ' m short.</span>' : '<span class="bad">crash at ' + Math.round(d.impactKmh) + ' km/h.</span>');
      var tail = st.mode === 'edge' ? ' <span class="na-ed-fine">Honest trade-off: the on-car model is smaller, so it can be less accurate than a data-centre model — here its 90 ms is slower than a perfect link, but it never depends on one.</span>'
        : ' <span class="na-ed-fine">Honest trade-off: the cloud model is bigger and smarter and easy to update — but it is only as dependable as the connection.</span>';
      return head + how + tail;
    }
    function drawBar() {
      NA.clear(bar);
      var d = E.edge.decide(params());
      bar.appendChild(el('div', 'na-lab', 'Where the time goes before the brake is pressed — ' + (d.reacts ? fmtMs(d.latencyMs) : 'never')));
      var row = el('div', 'na-ed-seg'); row.setAttribute('role', 'img'); row.setAttribute('aria-label', 'Latency breakdown: ' + d.parts.map(function (p) { return p.label + ' ' + fmtMs(p.ms); }).join(', '));
      var leg = el('div', 'na-key');
      var colors = { capture: '--cmp-8', upload: '--cmp-3', cloud: '--cmp-5', down: '--cmp-9', edge: '--cmp-2' };
      d.parts.forEach(function (p, i) {
        var s = el('span', 'na-ed-part' + (p.ms === Infinity ? ' inf' : '')); s.style.setProperty('--c', 'var(' + colors[p.id] + ')');
        s.style.flexGrow = p.ms === Infinity ? 12 : Math.max(p.ms, d.latencyMs * 0.015); s.title = p.label + ': ' + fmtMs(p.ms); if (p.ms === Infinity) s.textContent = '∞'; row.appendChild(s);
        var k = el('span'); var sw = el('i'); sw.style.setProperty('--c', 'var(' + colors[p.id] + ')'); k.appendChild(sw); k.appendChild(document.createTextNode(p.label + ' · ' + fmtMs(p.ms))); leg.appendChild(k);
      });
      bar.appendChild(row); bar.appendChild(leg);
    }
    function drawCmp() {
      NA.clear(cmp);
      var t = el('table', 'na-table na-ed-table'), th = el('tr'); ['Same situation', 'Decision after', 'Rolls before braking', 'Result'].forEach(function (h) { th.appendChild(el('th', null, h)); }); t.appendChild(th);
      ['cloud', 'edge'].forEach(function (m) {
        var d = E.edge.decide(params(m)), tr = el('tr', m === st.mode ? 'sel' : '');
        tr.appendChild(el('td', null, m === 'cloud' ? 'Cloud AI' : 'Edge AI'));
        tr.appendChild(el('td', null, fmtMs(d.latencyMs))); tr.appendChild(el('td', null, d.reacts ? d.travelBeforeBrakeM.toFixed(1) + ' m' : '—'));
        tr.appendChild(el('td', d.stopsShort ? 'na-ok' : 'na-bad', !d.reacts ? '✗ never reacts' : d.stopsShort ? '✓ stops ' + d.marginM.toFixed(1) + ' m short' : '✗ crash at ' + Math.round(d.impactKmh) + ' km/h'));
        t.appendChild(tr);
      });
      cmp.appendChild(el('div', 'na-tbl-scroll', t));
    }
    function drawBill() {
      NA.clear(bill);
      var b = E.edge.dataBill({ eventsPerHour: st.events }), box = el('div', 'na-ed-billbox');
      box.appendChild(el('div', 'na-lab', 'Data bill for one hour of driving (illustrative numbers)'));
      var ev = NA.slider('Events per hour (things the car decided were worth reporting)', 0, 200, 5, st.events, function (v) { return String(v); }, function (v) { st.events = v; drawBill(); });
      box.appendChild(ev.wrap);
      function row(label, bytes, cls) { var r = el('div', 'na-ed-brow'); r.appendChild(el('span', 'na-ed-bl', label)); var tr = el('span', 'na-ed-btrack'); var f = el('span', 'na-ed-bfill ' + cls); f.style.width = Math.max(0.6, bytes / b.cloudBytes * 100) + '%'; tr.appendChild(f); r.appendChild(tr); r.appendChild(el('span', 'na-ed-bv', NA.fmtBytes(bytes))); return r; }
      box.appendChild(row('Cloud AI: raw camera stream (8 Mbps)', b.cloudBytes, 'c'));
      box.appendChild(row('Edge AI: event summaries (~5 kB each) + heartbeat', b.edgeBytes, 'e'));
      box.appendChild(el('div', 'na-note', 'The edge car uploads about ' + (b.ratio >= 100 ? Math.round(b.ratio).toLocaleString('en-US') : b.ratio.toFixed(0)) + '× less. Real cameras, codecs and fleets differ — only the contrast is the point.'));
      bill.appendChild(box);
    }
    /* ---- the road ---- */
    function drawRoad(pos, braking, outcome) {
      NA.clear(stage);
      var d = E.edge.decide(params());
      var s = svg('svg', { viewBox: '0 0 640 228', role: 'img', 'aria-label': 'A car ' + st.dist + ' metres from an obstacle on a road. The amber zone is how far it rolls before braking, the red zone is its braking distance.' }, stage);
      var defs = svg('defs', null, s);
      var pa = svg('pattern', { id: 'na-edp-a', width: 8, height: 8, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
      svg('rect', { width: 8, height: 8, fill: 'color-mix(in srgb, var(--cmp-3) 22%, var(--surface))' }, pa); svg('rect', { width: 3, height: 8, fill: 'var(--cmp-3)' }, pa);
      var pr = svg('pattern', { id: 'na-edp-r', width: 8, height: 8, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(-45)' }, defs);
      svg('rect', { width: 8, height: 8, fill: 'color-mix(in srgb, var(--red) 22%, var(--surface))' }, pr); svg('rect', { width: 3, height: 8, fill: 'var(--red)' }, pr);
      var front0 = OBS_X - st.dist * PPM, roadY = 108;
      svg('rect', { x: 0, y: roadY, width: 640, height: 54, class: 'na-ed-road' }, s);
      svg('line', { x1: 0, y1: roadY + 27, x2: 640, y2: roadY + 27, class: 'na-ed-lane' }, s);
      /* predicted zones */
      var zEnd;
      if (!d.reacts) { svg('rect', { x: front0, y: roadY + 2, width: OBS_X - front0, height: 50, fill: 'url(#na-edp-a)', opacity: 0.85 }, s); svg('text', { x: OBS_X - 6, y: roadY + 68, 'text-anchor': 'end', class: 'na-ed-zl' }, s, 'no answer ever arrives → no braking'); }
      else {
        var tx = Math.min(640, front0 + d.travelBeforeBrakeM * PPM), bx = Math.min(640, tx + d.brakingM * PPM);
        svg('rect', { x: front0, y: roadY + 2, width: Math.max(0, tx - front0), height: 50, fill: 'url(#na-edp-a)', opacity: 0.9 }, s);
        svg('rect', { x: tx, y: roadY + 2, width: Math.max(0, bx - tx), height: 50, fill: 'url(#na-edp-r)', opacity: 0.9 }, s);
        svg('text', { x: front0 + 4, y: roadY + 68, class: 'na-ed-zl a' }, s, 'rolls ' + d.travelBeforeBrakeM.toFixed(1) + ' m (thinking)');
        svg('text', { x: Math.min(tx + 4, 470), y: roadY + 82, class: 'na-ed-zl r' }, s, 'brakes for ' + d.brakingM.toFixed(1) + ' m');
        if (bx < 640) svg('line', { x1: bx, y1: roadY - 6, x2: bx, y2: roadY + 60, class: 'na-ed-stopmark' }, s);
      }
      /* distance ruler */
      svg('line', { x1: front0, y1: 202, x2: OBS_X, y2: 202, class: 'na-ed-ruler' }, s);
      svg('text', { x: (front0 + OBS_X) / 2, y: 219, 'text-anchor': 'middle', class: 'na-ed-zl' }, s, st.dist + ' m to the obstacle');
      /* obstacle */
      var ob = svg('g', { class: 'na-ed-obs' }, s);
      svg('rect', { x: OBS_X, y: roadY - 14, width: 26, height: 40, rx: 3 }, ob); svg('path', { d: 'M' + OBS_X + ' ' + (roadY + 2) + 'l26 -14M' + OBS_X + ' ' + (roadY + 14) + 'l26 -14M' + OBS_X + ' ' + (roadY + 26) + 'l26 -14', class: 'na-ed-obsst' }, ob);
      svg('text', { x: OBS_X + 13, y: roadY - 20, 'text-anchor': 'middle', class: 'na-ed-zl' }, s, 'obstacle');
      /* the car */
      var cx = front0 + pos * PPM - 56, car = svg('g', { transform: 'translate(' + cx + ' ' + (roadY + 4) + ')', class: 'na-ed-car' }, s);
      svg('rect', { x: 0, y: 12, width: 56, height: 22, rx: 6, class: 'na-ed-body' }, car); svg('rect', { x: 14, y: 2, width: 28, height: 14, rx: 5, class: 'na-ed-body' }, car);
      svg('circle', { cx: 13, cy: 36, r: 6, class: 'na-ed-wheel' }, car); svg('circle', { cx: 43, cy: 36, r: 6, class: 'na-ed-wheel' }, car);
      svg('circle', { cx: 28, cy: 0, r: 4, class: 'na-ed-cam' }, car);
      svg('rect', { x: -3, y: 16, width: 5, height: 9, rx: 1, class: 'na-ed-brake' + (braking ? ' on' : '') }, car);
      if (braking) { svg('path', { d: 'M-6 20h-9M-6 25h-12', class: 'na-ed-brakeray' }, car); }
      /* radio waves for the cloud */
      if (st.mode === 'cloud') {
        var cloud = svg('g', { class: 'na-ed-cloud' + (st.linkUp ? '' : ' down'), transform: 'translate(300 6)' }, s);
        svg('path', { d: 'M-30 34c-14 0-18-20-2-22 2-14 24-16 30-4 12-6 26 4 20 16 10 0 10 10 0 10z', class: 'na-ed-cl' }, cloud);
        svg('text', { x: 0, y: 28, 'text-anchor': 'middle', class: 'na-ed-clt' }, cloud, 'cloud AI');
        svg('path', { d: 'M' + (cx + 28) + ' ' + (roadY + 2) + ' L300 52', class: 'na-ed-wave' + (st.linkUp ? '' : ' down') }, s);
        if (!st.linkUp) svg('text', { x: 300, y: 80, 'text-anchor': 'middle', class: 'na-ed-x' }, s, '✗ no signal');
      } else {
        svg('text', { x: cx + 28, y: roadY - 12, 'text-anchor': 'middle', class: 'na-ed-clt' }, s, 'AI on board');
      }
      if (outcome === 'crash') {
        var bx2 = OBS_X, by = roadY + 8, pts = [];
        for (var i = 0; i < 16; i++) { var a = i * Math.PI / 8, r = i % 2 ? 14 : 30; pts.push((bx2 + Math.cos(a) * r).toFixed(1) + ',' + (by + Math.sin(a) * r).toFixed(1)); }
        svg('polygon', { points: pts.join(' '), class: 'na-ed-boom' }, s);
        svg('text', { x: bx2, y: by + 4, 'text-anchor': 'middle', class: 'na-ed-boomt' }, s, 'CRASH');
      }
      if (outcome === 'safe') svg('text', { x: Math.min(cx + 28, 470), y: roadY - 24, 'text-anchor': 'middle', class: 'na-ed-safe' }, s, '✓ stopped');
    }
    function launch() {
      var d = E.edge.decide(params()), v = st.speed / 3.6, L = d.reacts ? d.latencyMs / 1000 : Infinity, A = E.edge.DECEL, g = run.start();
      var T, travel = d.travelBeforeBrakeM;
      if (!d.reacts) T = st.dist / v;
      else if (d.stopsShort) T = L + v / A;
      else if (travel >= st.dist) T = st.dist / v;
      else T = L + (v - Math.sqrt(Math.max(0, v * v - 2 * A * (st.dist - travel)))) / A;
      function posAt(tau) { if (tau < L) return Math.min(st.dist, v * tau); var u = Math.min(tau - L, v / A); return Math.min(st.dist, travel + v * u - A * u * u / 2); }
      go.disabled = true;
      say.say('<b>Go!</b> ' + (d.reacts ? 'The car sees the obstacle and starts the ' + (st.mode === 'cloud' ? 'round trip to the cloud' : 'on-board AI') + ' — meanwhile it keeps rolling.' : 'The car sends its camera frame… and waits for an answer that cannot come.'));
      (async function () {
        var ok = await run.tween(g, NA.dur(3800), function (t) { var tau = t * T; drawRoad(posAt(tau), tau >= L, null); });
        if (!ok) return;
        var out = d.stopsShort ? 'safe' : 'crash';
        drawRoad(d.stopsShort ? d.travelBeforeBrakeM + d.brakingM : st.dist, d.reacts, out);
        go.disabled = false;
        say.say(describe(d, true) + (d.stopsShort ? '' : ' <b>The only difference between a near miss and a crash is the time the answer took.</b>'));
      })();
    }
    update();
  }
  NA.register('edge', { title: 'Brake now! Cloud AI or edge AI?', hint: 'A simulation with illustrative numbers (AI times, frame size, camera data rate) — real systems differ.', build: buildEdge });

  if (typeof module !== 'undefined' && module.exports) module.exports = E;
})(typeof window !== 'undefined' ? window : globalThis);
