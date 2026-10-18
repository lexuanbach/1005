/* Packet Journey — mini app for CO1005 Chapter 9 (Computer Networks).
   A deterministic SIMULATION of what happens when you type a URL: parse -> DNS -> TCP handshake
   -> HTTP request/response -> the bytes wrapped and unwrapped through the TCP/IP layers.
   Everything is invented: a tiny zone table, documentation-only IP addresses (RFC 5737:
   192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24) and a fixed clock. Nothing touches the network.
   Second panel: an IPv4 subnet calculator (IPv4 only).
   Mount points: #net-root. Pure engine (no DOM) exported for Node tests. */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------------ helpers */
  function utf8Len(s) {
    var n = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c < 0x80) n += 1; else if (c < 0x800) n += 2;
      else if (c >= 0xD800 && c < 0xDC00) { n += 4; i++; } else n += 3;
    }
    return n;
  }
  function hash(s) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h;
  }

  /* ------------------------------------------------------------------ the invented world */
  var SIM_DATE = 'Sun, 18 Oct 2026 08:00:00 GMT';
  var ADDR = {
    client: '192.0.2.100', gateway: '192.0.2.1', resolver: '192.0.2.53',
    root: '198.51.100.1', tld: { com: '198.51.100.2', org: '198.51.100.3', net: '198.51.100.4' }
  };
  var TTL = 300;
  var ZONE = {
    'example.com': { ns: 'ns1.example.com', ip: '203.0.113.53', records: {
      'example.com': { type: 'A', value: '203.0.113.10' },
      'www.example.com': { type: 'A', value: '203.0.113.10' },
      'blog.example.com': { type: 'CNAME', value: 'www.example.com' } } },
    'example.org': { ns: 'ns1.example.org', ip: '203.0.113.54', records: {
      'example.org': { type: 'A', value: '198.51.100.20' },
      'www.example.org': { type: 'CNAME', value: 'example.org' } } },
    'example.net': { ns: 'ns1.example.net', ip: '203.0.113.55', records: {
      'api.example.net': { type: 'A', value: '203.0.113.7' } } }
  };
  var SERVERS = { '203.0.113.10': 'www.example.com', '198.51.100.20': 'example.org', '203.0.113.7': 'api.example.net' };

  /* ------------------------------------------------------------------ IPv4 */
  function parseIPv4(s) {
    var m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(s).trim());
    if (!m) return null;
    var v = 0;
    for (var i = 1; i <= 4; i++) {
      if (m[i].length > 1 && m[i].charAt(0) === '0') return null; // leading zeros are ambiguous (octal?)
      var o = parseInt(m[i], 10);
      if (o > 255) return null;
      v = v * 256 + o;
    }
    return v >>> 0;
  }
  function intToIp(v) { return [v >>> 24, (v >>> 16) & 255, (v >>> 8) & 255, v & 255].join('.'); }
  function toBin(v, dots) {
    var s = (v >>> 0).toString(2); while (s.length < 32) s = '0' + s;
    return dots === false ? s : s.match(/.{8}/g).join('.');
  }
  function maskOf(p) { return p === 0 ? 0 : (0xFFFFFFFF << (32 - p)) >>> 0; }
  function prefixFromMask(m) { // m: int; returns prefix or -1 when the 1-bits are not contiguous
    var p = 0; while (p < 32 && ((m >>> (31 - p)) & 1)) p++;
    return (m >>> 0) === maskOf(p) ? p : -1;
  }
  function inCidr(v, base, p) { return ((v & maskOf(p)) >>> 0) === ((parseIPv4(base) & maskOf(p)) >>> 0); }
  function classifyIPv4(v) {
    if (inCidr(v, '0.0.0.0', 8)) return 'this network (0.0.0.0/8) — only valid as a source';
    if (inCidr(v, '10.0.0.0', 8) || inCidr(v, '172.16.0.0', 12) || inCidr(v, '192.168.0.0', 16)) return 'private (RFC 1918) — not routable on the public Internet';
    if (inCidr(v, '100.64.0.0', 10)) return 'shared address space (ISP carrier-grade NAT)';
    if (inCidr(v, '127.0.0.0', 8)) return 'loopback — this very computer';
    if (inCidr(v, '169.254.0.0', 16)) return 'link-local — self-assigned when DHCP fails';
    if (inCidr(v, '192.0.2.0', 24) || inCidr(v, '198.51.100.0', 24) || inCidr(v, '203.0.113.0', 24)) return 'documentation range (RFC 5737) — safe for examples';
    if (inCidr(v, '224.0.0.0', 4)) return 'multicast';
    if (inCidr(v, '240.0.0.0', 4)) return 'reserved / broadcast';
    return 'public (globally routable)';
  }
  /* text: "a.b.c.d/p" or "a.b.c.d m.m.m.m" */
  function subnetFromText(text) {
    var t = String(text).trim(), ip, p, m;
    if ((m = /^(\S+)\s*\/\s*(\d{1,2})$/.exec(t))) { ip = parseIPv4(m[1]); p = parseInt(m[2], 10); }
    else if ((m = /^(\S+)\s+(\S+)$/.exec(t))) {
      ip = parseIPv4(m[1]); var mk = parseIPv4(m[2]);
      if (mk === null) return { error: 'The mask is not a valid dotted-decimal number.' };
      p = prefixFromMask(mk);
      if (p < 0) return { error: 'A subnet mask must be a block of 1s followed by 0s (e.g. 255.255.255.0).' };
    } else return { error: 'Write it as 192.0.2.77/26 or as 192.0.2.77 255.255.255.192.' };
    if (ip === null) return { error: 'The address must be four numbers 0–255 separated by dots (no leading zeros).' };
    if (!(p >= 0 && p <= 32)) return { error: 'The prefix length must be between 0 and 32.' };
    return subnetInfo(ip, p);
  }
  function subnetInfo(ip, p) {
    var mask = maskOf(p), net = (ip & mask) >>> 0, bc = (net | (~mask >>> 0)) >>> 0;
    var total = Math.pow(2, 32 - p), hosts, first, last;
    if (p === 32) { hosts = 1; first = last = net; }
    else if (p === 31) { hosts = 2; first = net; last = bc; }
    else { hosts = total - 2; first = net + 1; last = bc - 1; }
    return { ip: ip >>> 0, prefix: p, mask: mask, network: net, broadcast: bc, first: first >>> 0, last: last >>> 0,
      hosts: hosts, total: total, wildcard: (~mask) >>> 0, kind: classifyIPv4(ip >>> 0),
      note: p === 32 ? 'a single host route' : p === 31 ? 'point-to-point link (RFC 3021): both addresses usable' : null };
  }
  function sameSubnet(a, b, p) { return ((a & maskOf(p)) >>> 0) === ((b & maskOf(p)) >>> 0); }

  /* ------------------------------------------------------------------ URL */
  function parseURL(str) {
    var s = String(str).trim();
    var m = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/([^\/?#:]*)(?::(\d*))?([^?#]*)(\?[^#]*)?(#.*)?$/.exec(s);
    if (!m) return { error: 'Not a URL I can parse. A URL starts with a scheme and "://", e.g. http://www.example.com/index.html' };
    var scheme = m[1].toLowerCase(), host = m[2].toLowerCase();
    if (scheme !== 'http' && scheme !== 'https')
      return { error: 'This simulation only speaks http and https (a real browser also understands ftp:, file:, mailto: …).' };
    if (!host) return { error: 'The host name is missing: put it between "://" and the first "/".' };
    var isIp = parseIPv4(host) !== null;
    if (!isIp) {
      var labels = host.split('.');
      for (var i = 0; i < labels.length; i++)
        if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(labels[i]) || labels[i].length > 63)
          return { error: 'Host names are made of letters, digits and hyphens between dots; "' + host + '" is not.' };
    }
    var defPort = scheme === 'https' ? 443 : 80, port = defPort;
    if (m[3] !== undefined) {
      port = m[3] === '' ? NaN : parseInt(m[3], 10);
      if (!(port >= 1 && port <= 65535)) return { error: 'The port must be a number from 1 to 65535.' };
    }
    return { scheme: scheme, host: host, isIp: isIp, port: port, defaultPort: defPort, explicitPort: m[3] !== undefined,
      path: m[4] || '/', query: m[5] || '', fragment: m[6] || '' };
  }

  /* ------------------------------------------------------------------ DNS */
  /* cache modes: 'cold' | 'tld' (resolver knows the TLD servers) | 'resolver' (resolver cached the name) | 'os' (this computer cached it) */
  function dnsStep(from, to, kind, title, text, d) { return { phase: 'dns', from: from, to: to, kind: kind, title: title, text: text, detail: d || {} }; }

  function resolve(host, cache) {
    var steps = [], labels = host.split('.'), tld = labels[labels.length - 1];
    var zoneName = labels.slice(-2).join('.');
    var caches = { os: 'empty', resolver: 'empty', tld: 'unknown' };
    if (parseIPv4(host) !== null) {
      steps.push(dnsStep('client', 'client', 'skip', 'No DNS needed',
        host + ' is already an IP address, so the browser skips the phone book and connects straight to it.', { caches: caches }));
      return { steps: steps, ip: host, rcode: 'NOERROR', skipped: true };
    }
    var rec = (ZONE[zoneName] && ZONE[zoneName].records[host]) || null;
    var finalIp = null, chain = [];
    if (rec) {
      var cur = host, guard = 0;
      while (ZONE[zoneName].records[cur] && guard++ < 5) {
        var r = ZONE[zoneName].records[cur]; chain.push(cur + '.  ' + TTL + '  IN  ' + r.type + '  ' + r.value + (r.type === 'CNAME' ? '.' : ''));
        if (r.type === 'A') { finalIp = r.value; break; } cur = r.value;
      }
    }
    var q = 'A? ' + host + '.';
    if (cache === 'os') {
      caches.os = 'hit';
      steps.push(dnsStep('client', 'client', 'hit', 'This computer already knows',
        'The browser/OS keeps a small cache of recent answers. ' + host + ' is in it, so no network traffic is needed at all.',
        { question: q, answer: chain.length ? chain : ['(cached) ' + host + ' -> ' + finalIp], caches: caches }));
      return { steps: steps, ip: finalIp, rcode: 'NOERROR', chain: chain };
    }
    steps.push(dnsStep('client', 'client', 'miss', 'Check the local cache',
      'The browser asks the operating system: do we already know ' + host + '? The local cache has no entry, so the question goes to the recursive resolver (the ISP or campus DNS server) at ' + ADDR.resolver + '.',
      { question: q, caches: caches }));
    steps.push(dnsStep('client', 'resolver', 'query', 'Ask the recursive resolver',
      'A small UDP message: "' + q + '" travels from ' + ADDR.client + ' to the resolver ' + ADDR.resolver + '. The resolver will do the legwork for us.',
      { question: q, caches: caches }));
    if (cache === 'resolver') {
      caches.resolver = 'hit';
      steps.push(dnsStep('resolver', 'client', 'answer', 'Resolver answers from its cache',
        'Somebody asked for this name recently, so the resolver still has the answer (its TTL has not run out) and replies immediately — no root, TLD or authoritative server is bothered.',
        { question: q, answer: chain.length ? chain : [host + '. ' + TTL + ' IN A ' + finalIp], caches: caches }));
      return { steps: steps, ip: finalIp, rcode: 'NOERROR', chain: chain };
    }
    var tldIp = ADDR.tld[tld];
    if (cache === 'tld') {
      caches.tld = 'known';
      steps.push(dnsStep('resolver', 'resolver', 'miss', 'Resolver cache: name unknown, .' + tld + ' servers known',
        'The resolver has never seen ' + host + ', but it remembers where the .' + tld + ' servers live from an earlier lookup — so it can skip the root servers.', { question: q, caches: caches }));
    } else {
      steps.push(dnsStep('resolver', 'root', 'query', 'Resolver asks a root server',
        'Nothing cached. The resolver starts at the top of the hierarchy: a root server at ' + ADDR.root + ' (every resolver is pre-loaded with the root servers\' addresses).', { question: q, caches: caches }));
      if (!tldIp) {
        steps.push(dnsStep('root', 'resolver', 'nxdomain', 'Root: no such top-level domain',
          'The root servers only know the top-level domains (.com, .org, .net …). ".' + tld + '" is not one of the three in this simulation, so the answer is NXDOMAIN — "no such name".',
          { question: q, answer: ['status: NXDOMAIN'], caches: caches }));
        steps.push(dnsStep('resolver', 'client', 'nxdomain', 'Browser shows "server not found"',
          'The resolver passes the bad news on. The browser cannot get an IP address, so it never opens a connection; the journey ends here.', { question: q, answer: ['status: NXDOMAIN'], caches: caches }));
        return { steps: steps, ip: null, rcode: 'NXDOMAIN' };
      }
      steps.push(dnsStep('root', 'resolver', 'referral', 'Root: "ask the .' + tld + ' servers"',
        'A root server does not know the answer. It only knows who is responsible for .' + tld + ' and replies with a referral: the .' + tld + ' name server is at ' + tldIp + '.',
        { question: q, answer: ['.' + tld + '.  NS  a.gtld.sim.   (' + tldIp + ')'], caches: caches }));
    }
    steps.push(dnsStep('resolver', 'tld', 'query', 'Resolver asks the .' + tld + ' server',
      'Same question, one level down: "' + q + '" goes to the .' + tld + ' top-level-domain server at ' + tldIp + '.', { question: q, caches: caches }));
    if (!ZONE[zoneName]) {
      steps.push(dnsStep('tld', 'resolver', 'nxdomain', 'TLD: "' + zoneName + '" does not exist',
        'The .' + tld + ' server keeps the list of every registered name under it. "' + zoneName + '" is not on that list (a typo, perhaps), so it answers NXDOMAIN.',
        { question: q, answer: ['status: NXDOMAIN'], caches: caches }));
      steps.push(dnsStep('resolver', 'client', 'nxdomain', 'Browser shows "server not found"',
        'No IP address, no connection: the journey ends here. A single wrong letter in the domain is enough.', { question: q, answer: ['status: NXDOMAIN'], caches: caches }));
      return { steps: steps, ip: null, rcode: 'NXDOMAIN' };
    }
    var z = ZONE[zoneName];
    steps.push(dnsStep('tld', 'resolver', 'referral', 'TLD: "ask the server of ' + zoneName + '"',
      'The TLD server does not hold the records of individual sites either; it points to the authoritative name server of ' + zoneName + ': ' + z.ns + ' at ' + z.ip + '.',
      { question: q, answer: [zoneName + '.  NS  ' + z.ns + '.   (' + z.ip + ')'], caches: caches }));
    steps.push(dnsStep('resolver', 'auth', 'query', 'Resolver asks the authoritative server',
      'The final hop: "' + q + '" goes to ' + z.ns + ' (' + z.ip + '), the server that actually owns the zone file for ' + zoneName + '.', { question: q, caches: caches }));
    if (!rec) {
      steps.push(dnsStep('auth', 'resolver', 'nxdomain', 'Authoritative: no such host',
        'The zone ' + zoneName + ' exists, but it has no record called "' + host + '". The authoritative server is the final word: NXDOMAIN.',
        { question: q, answer: ['status: NXDOMAIN'], caches: caches }));
      steps.push(dnsStep('resolver', 'client', 'nxdomain', 'Browser shows "server not found"',
        'The domain is real but this sub-name is not; with no address the browser cannot continue.', { question: q, answer: ['status: NXDOMAIN'], caches: caches }));
      return { steps: steps, ip: null, rcode: 'NXDOMAIN' };
    }
    var isAlias = rec.type === 'CNAME';
    steps.push(dnsStep('auth', 'resolver', 'answer', isAlias ? 'Authoritative: an alias, plus the address' : 'Authoritative: the answer',
      isAlias ? host + ' is only an alias (CNAME) for ' + rec.value + ', so the server returns the alias and the address it points to: ' + finalIp + '.'
        : 'Found it: ' + host + ' has the address ' + finalIp + '. The record may be cached for ' + TTL + ' seconds (its TTL).',
      { question: q, answer: chain, caches: caches }));
    steps.push(dnsStep('resolver', 'client', 'answer', 'Resolver hands the answer back',
      'The resolver stores the answer in its cache (for the next person who asks) and returns ' + finalIp + ' to the browser, which also remembers it for a while.',
      { question: q, answer: chain, caches: caches }));
    return { steps: steps, ip: finalIp, rcode: 'NOERROR', chain: chain };
  }

  /* ------------------------------------------------------------------ HTTP server (invented) */
  function page(title, paras) {
    return '<!doctype html>\n<html>\n<head><title>' + title + '</title></head>\n<body>\n<h1>' + title + '</h1>\n' +
      paras.map(function (p) { return '<p>' + p + '</p>'; }).join('\n') + '\n</body>\n</html>\n';
  }
  function httpServer(site, req) {
    var h = [], body = '', status = 200, reason = 'OK', ctype = 'text/html; charset=utf-8';
    var path = req.path;
    if (req.method === 'POST') {
      if (path === '/form') { body = page('Thanks!', ['The server received your form: <code>' + (req.body || '') + '</code>. This page is the reply to a POST request.']); }
      else { status = 405; reason = 'Method Not Allowed'; h.push(['Allow', 'GET, HEAD']); body = page('405 Method Not Allowed', ['This resource can be read (GET, HEAD) but it does not accept POST.']); }
    } else if (path === '/' || path === '/index.html') {
      body = page('Welcome to ' + site, ['This is a made-up web page served by a made-up server for the Packet Journey simulation.',
        'Its job is only to give the response a realistic size, so that the transport layer has something to cut into segments.',
        'Look at the headers above: Content-Length tells the browser how many bytes of body to expect.']);
    } else if (path === '/about') {
      body = page('About ' + site, ['You followed a link to a second page. Every page and every image has its own URL.',
        'A real browser would now parse this HTML and send more requests for the images, style sheets and scripts it mentions.']);
    } else if (path === '/old') {
      status = 301; reason = 'Moved Permanently'; h.push(['Location', req.scheme + '://' + req.host + '/about']);
      body = page('301 Moved Permanently', ['This page now lives at <a href="/about">/about</a>.']);
    } else if (path === '/admin') {
      status = 403; reason = 'Forbidden'; body = page('403 Forbidden', ['The server understood the request but refuses to serve this page to you.']);
    } else if (path === '/time') {
      ctype = 'application/json'; body = '{"simulated_time": "2026-10-18T08:00:00Z", "note": "frozen clock"}\n';
    } else {
      status = 404; reason = 'Not Found'; body = page('404 Not Found', ['The server is alive, but nothing is stored at <code>' + path + '</code>.']);
    }
    var headers = [['Date', SIM_DATE], ['Server', 'sim-httpd/1.0'], ['Content-Type', ctype], ['Content-Length', String(utf8Len(body))]].concat(h, [['Connection', 'close']]);
    return { status: status, reason: reason, headers: headers, body: req.method === 'HEAD' ? '' : body, fullLength: utf8Len(body) };
  }
  function formatResponse(r) {
    var head = 'HTTP/1.1 ' + r.status + ' ' + r.reason + '\r\n' + r.headers.map(function (x) { return x[0] + ': ' + x[1]; }).join('\r\n') + '\r\n\r\n';
    return { head: head, text: head + r.body, bytes: utf8Len(head) + utf8Len(r.body) };
  }
  function formatRequest(u, method) {
    var lines = [method + ' ' + u.path + u.query + ' HTTP/1.1',
      'Host: ' + u.host + (u.explicitPort && u.port !== u.defaultPort ? ':' + u.port : ''),
      'User-Agent: PacketJourney-sim/1.0', 'Accept: text/html'];
    var body = '';
    if (method === 'POST') { body = 'name=Lan&topic=networks'; lines.push('Content-Type: application/x-www-form-urlencoded', 'Content-Length: ' + utf8Len(body)); }
    lines.push('Connection: close');
    var text = lines.join('\r\n') + '\r\n\r\n' + body;
    return { text: text, bytes: utf8Len(text), body: body };
  }

  /* ------------------------------------------------------------------ layering */
  var ETH_HDR = 14, ETH_TRL = 4, IP_HDR = 20, TCP_HDR = 20, UDP_HDR = 8;
  function splitTCP(len, mtu) {
    var mss = mtu - IP_HDR - TCP_HDR, out = [], off = 0;
    while (off < len) { var n = Math.min(mss, len - off); out.push({ offset: off, len: n }); off += n; }
    return out;
  }
  function fragmentIP(payloadLen, mtu) { // IPv4: fragment payload sizes are multiples of 8 except the last
    var max = Math.floor((mtu - IP_HDR) / 8) * 8, out = [], off = 0;
    while (off < payloadLen) {
      var n = Math.min(max, payloadLen - off), mf = off + n < payloadLen;
      out.push({ offset: off, units: off / 8, len: n, mf: mf }); off += n;
    }
    return out;
  }
  function buildStack(appBytes, mtu, mode, seq0) {
    var items = [], i;
    if (mode === 'udp') {
      var frags = fragmentIP(appBytes + UDP_HDR, mtu);
      for (i = 0; i < frags.length; i++) {
        var f = frags[i], t = i === 0 ? UDP_HDR : 0;
        items.push({ index: i + 1, app: f.len - t, transport: t, ip: IP_HDR, eth: ETH_HDR + ETH_TRL, total: f.len + IP_HDR + ETH_HDR + ETH_TRL,
          ipPayload: f.len, offsetUnits: f.units, mf: f.mf });
      }
      return { mode: 'udp', unit: 'fragment', mtu: mtu, appBytes: appBytes, items: items, mss: null };
    }
    var segs = splitTCP(appBytes, mtu);
    for (i = 0; i < segs.length; i++)
      items.push({ index: i + 1, app: segs[i].len, transport: TCP_HDR, ip: IP_HDR, eth: ETH_HDR + ETH_TRL,
        total: segs[i].len + TCP_HDR + IP_HDR + ETH_HDR + ETH_TRL, seq: (seq0 || 0) + segs[i].offset });
    return { mode: 'tcp', unit: 'segment', mtu: mtu, appBytes: appBytes, items: items, mss: mtu - IP_HDR - TCP_HDR };
  }
  function overheadTotal(stack) { var o = 0; stack.items.forEach(function (x) { o += x.total - x.app; }); return o; }

  /* ------------------------------------------------------------------ the whole journey */
  function tcpFlags(f) { return f.join(' + '); }

  function buildJourney(opts) {
    var u = parseURL(opts.url);
    var method = opts.method || 'GET', mtu = opts.mtu || 1500, cache = opts.cache || 'cold', mode = opts.mode === 'udp' ? 'udp' : 'tcp';
    var steps = [];
    if (u.error) {
      return { ok: false, parsed: u, error: u.error, steps: [{ phase: 'url', kind: 'error', from: 'client', to: 'client', title: 'The URL cannot be parsed',
        text: u.error, detail: { error: u.error } }] };
    }
    var parts = [
      { k: 'scheme', v: u.scheme, why: u.scheme === 'https' ? 'which protocol to speak — HTTP wrapped in encryption (TLS)' : 'which protocol to speak — plain HTTP' },
      { k: 'host', v: u.host, why: u.isIp ? 'already an IP address' : 'which computer — it must be turned into an IP address by DNS' },
      { k: 'port', v: String(u.port), why: u.explicitPort ? 'written explicitly in the URL' : 'not written: the default for ' + u.scheme + ' is ' + u.defaultPort },
      { k: 'path', v: u.path, why: 'which resource on that computer' }];
    if (u.query) parts.push({ k: 'query', v: u.query, why: 'extra parameters for the server' });
    if (u.fragment) parts.push({ k: 'fragment', v: u.fragment, why: 'used only by the browser; it is never sent to the server' });
    steps.push({ phase: 'url', kind: 'parse', from: 'client', to: 'client', title: 'The browser splits the URL into parts',
      text: 'You typed one string; the browser cuts it into parts. The host (' + u.host + ') says WHO to contact, the path (' + u.path + ') says WHAT to ask for, and the scheme (' + u.scheme + ') says HOW to talk.',
      detail: { url: opts.url.trim(), u: u, parts: parts } });

    var dns = resolve(u.host, cache);
    steps = steps.concat(dns.steps);
    if (!dns.ip) return { ok: false, parsed: u, dns: dns, error: 'NXDOMAIN', steps: steps };

    var server = SERVERS[dns.ip];
    var cport = 49152 + (hash(u.host + u.path) % 16000), cisn = 1000 + (hash('c' + u.host) % 9000) * 100, sisn = 5000 + (hash('s' + u.host) % 9000) * 100;
    function seg(from, to, flags, seq, ack, title, text, cstate, sstate) {
      return { phase: 'tcp', kind: 'segment', from: from, to: to, title: title, text: text,
        detail: { src: (from === 'client' ? ADDR.client + ':' + cport : dns.ip + ':' + u.port), dst: (from === 'client' ? dns.ip + ':' + u.port : ADDR.client + ':' + cport),
          flags: flags, seq: seq, ack: ack, cstate: cstate, sstate: sstate } };
    }
    steps.push(seg('client', 'server', ['SYN'], cisn, null, '1 / 3 · SYN: "can we talk?"',
      'The client picks a random-looking starting sequence number (' + cisn + ') and sends a SYN segment to ' + dns.ip + ' port ' + u.port + ' — the well-known port of ' + u.scheme.toUpperCase() + '. It uses its own temporary port ' + cport + '.',
      'SYN-SENT', 'LISTEN'));
    if (!server) {
      steps.push({ phase: 'tcp', kind: 'timeout', from: 'client', to: 'client', title: 'No answer: connection timed out',
        text: 'Nobody in this simulated world owns ' + dns.ip + ', so the SYN gets no reply. A real browser would retry a few times and then show "This site can\'t be reached".',
        detail: { cstate: 'SYN-SENT (retrying)', sstate: '—' } });
      return { ok: false, parsed: u, dns: dns, error: 'TIMEOUT', steps: steps };
    }
    steps.push(seg('server', 'client', ['SYN', 'ACK'], sisn, cisn + 1, '2 / 3 · SYN-ACK: "yes, and you?"',
      'The server is listening. It answers with its own starting number (' + sisn + ') and acknowledges the client\'s: ack = ' + cisn + ' + 1 = ' + (cisn + 1) + ' ("I am ready for byte number ' + (cisn + 1) + '").',
      'SYN-SENT', 'SYN-RECEIVED'));
    steps.push(seg('client', 'server', ['ACK'], cisn + 1, sisn + 1, '3 / 3 · ACK: "agreed — connection open"',
      'The client acknowledges the server\'s number (ack = ' + (sisn + 1) + '). Both sides now agree on both starting numbers: the connection is ESTABLISHED and data may flow in both directions.',
      'ESTABLISHED', 'ESTABLISHED'));
    if (u.scheme === 'https') {
      steps.push({ phase: 'tcp', kind: 'tls', from: 'client', to: 'server', title: 'HTTPS adds a TLS handshake here',
        text: 'With https the client and server would now exchange a TLS handshake (agree on encryption, check the server\'s certificate) before any HTTP is sent. This simulation skips it and shows the HTTP messages in plain text.',
        detail: { cstate: 'ESTABLISHED', sstate: 'ESTABLISHED', tls: true } });
    }

    var req = formatRequest(u, method);
    var reqObj = { method: method, path: u.path, host: u.host, scheme: u.scheme, body: req.body };
    steps.push({ phase: 'http', kind: 'request', from: 'client', to: 'server', title: 'HTTP request: ' + method + ' ' + u.path,
      text: 'The browser writes a plain-text request: a request line (method, path, version), header lines, a blank line' + (method === 'POST' ? ', then the body' : '') + '. The Host header tells a server that hosts many sites which one we want. (' + req.bytes + ' bytes.)',
      detail: { message: req.text, bytes: req.bytes, role: 'request' } });
    var resp = httpServer(server, reqObj), fr = formatResponse(resp);
    var klass = resp.status < 300 ? 'success' : resp.status < 400 ? 'redirect' : resp.status < 500 ? 'client error' : 'server error';
    steps.push({ phase: 'http', kind: 'response', from: 'server', to: 'client', title: 'HTTP response: ' + resp.status + ' ' + resp.reason,
      text: 'The server answers with a status line, headers, a blank line and the body. Status ' + resp.status + ' is in the ' + String(resp.status).charAt(0) + 'xx family (' + klass + '). ' +
        (method === 'HEAD' ? 'HEAD asked for headers only, so the body is empty even though Content-Length says ' + resp.fullLength + '. ' : '') + 'The whole response is ' + fr.bytes + ' bytes.',
      detail: { message: fr.text, bytes: fr.bytes, role: 'response', status: resp.status } });

    var stack = buildStack(fr.bytes, mtu, mode, sisn + 1), n = stack.items.length, first = stack.items[0];
    var U = mode === 'udp';
    function lay(kind, level, dir, title, text) {
      return { phase: 'layers', kind: kind, from: dir === 'down' ? 'server' : 'client', to: dir === 'down' ? 'client' : 'server', title: title, text: text,
        detail: { level: level, dir: dir, stack: stack, hostPath: true } };
    }
    steps.push(lay('layer', 0, 'down', 'Server, application layer: ' + fr.bytes + ' bytes of HTTP',
      'We now follow the response down the server\'s layers. At the top there is just the HTTP message, ' + fr.bytes + ' bytes, with no addresses at all — that is the job of the layers below.'));
    steps.push(lay('layer', 1, 'down', U ? 'Transport layer: one UDP datagram (+8 bytes)' : 'Transport layer: TCP cuts it into ' + n + ' segment' + (n > 1 ? 's' : ''),
      U ? 'UDP (the simpler transport protocol) just adds an 8-byte header — ports, length, checksum — and keeps the whole message as ONE datagram of ' + (fr.bytes + 8) + ' bytes. Splitting it is left to the layer below.'
        : 'TCP cuts the byte stream into pieces of at most MSS = ' + stack.mss + ' bytes (MTU ' + mtu + ' − 20 IP − 20 TCP) and puts a 20-byte header (ports, sequence number, ack, flags) in front of each. ' + (n > 1 ? 'Here: ' + n + ' segments, numbered by the first byte they carry.' : 'The whole response fits in one segment.')));
    steps.push(lay('layer', 2, 'down', U ? 'Network layer: IP fragments the datagram into ' + n + ' packet' + (n > 1 ? 's' : '') : 'Network layer: each segment gets an IP header (+20)',
      U ? 'The datagram is longer than the link\'s MTU (' + mtu + ' bytes), so IP must FRAGMENT it: ' + n + ' packets, each with a 20-byte header carrying source/destination ' + dns.ip + ' → ' + ADDR.client + ', a fragment offset and a "more fragments" flag. Only the destination IP layer glues them back together.'
        : 'IP adds a 20-byte header to every segment: source ' + dns.ip + ', destination ' + ADDR.client + ', a TTL (hop budget) and the protocol number (6 = TCP). A segment plus its IP header is a packet. Because TCP respected the MSS, no IP fragmentation is needed.'));
    steps.push(lay('layer', 3, 'down', 'Link layer: Ethernet frames (+14 header, +4 trailer)',
      'For the next hop only, each packet is put into a frame: a 14-byte header with the MAC addresses of this hop (sender and next device) and a 4-byte checksum (FCS) at the end. The largest frame content is the MTU = ' + mtu + ' bytes; the first frame here is ' + first.total + ' bytes.'));
    steps.push(lay('layer', 4, 'down', 'Physical layer: ' + (first.total * 8) + ' bits for the first frame',
      'Finally the frame is just bits: voltage changes on copper, pulses of light in fibre, or radio waves for Wi-Fi. ' + n + ' frame' + (n > 1 ? 's' : '') + ' leave the server; the total on the wire is ' + (function () { var t = 0; stack.items.forEach(function (x) { t += x.total; }); return t; })() + ' bytes for ' + fr.bytes + ' bytes of real content.'));
    steps.push({ phase: 'layers', kind: 'router', from: 'server', to: 'client', title: 'On the way: routers read only layers 1–3',
      text: 'A router receives each frame, strips the link layer, reads the destination IP, lowers the TTL by 1, chooses the next hop from its routing table and wraps the same packet in a NEW frame with new MAC addresses. It never looks at TCP or HTTP. A switch would not even open the IP header.',
      detail: { level: 2, dir: 'router', stack: stack } });
    steps.push(lay('layer', 3, 'up', 'Client, link layer: frames arrive, header and trailer removed',
      'The client\'s network card checks the destination MAC and the FCS checksum (a damaged frame is silently dropped), then strips 14 + 4 bytes and hands the packet up.'));
    steps.push(lay('layer', 2, 'up', U ? 'Client, network layer: fragments reassembled' : 'Client, network layer: IP header removed (−20)',
      U ? 'The IP layer sees fragments with the same identification, orders them by fragment offset, waits until the one with "more fragments = 0" has arrived and rebuilds the ' + (fr.bytes + 8) + '-byte datagram. If one fragment is lost, the whole datagram is lost.'
        : 'IP checks that the destination address is really this computer and strips the 20-byte header, passing the segment to TCP (protocol 6).'));
    steps.push(lay('layer', 1, 'up', U ? 'Client, transport layer: UDP header removed' : 'Client, transport layer: segments put back in order',
      U ? 'UDP removes its 8-byte header and delivers the datagram to the application port. UDP would not retransmit anything missing — that is the price of being simple and fast.'
        : 'TCP strips its header, uses the sequence numbers to put the segments in order (they may have arrived shuffled), sends ACKs so the server knows what arrived, and asks for a retransmission of any missing piece. The result is the original byte stream.'));
    steps.push(lay('layer', 0, 'up', 'Client, application layer: the same ' + fr.bytes + ' bytes',
      'The browser receives exactly the bytes the server sent, in order — all the wrapping and unwrapping was invisible to it. It reads the status line (' + resp.status + ' ' + resp.reason + '), the headers, and renders the body.'));
    return { ok: true, parsed: u, dns: dns, ip: dns.ip, server: server, response: resp, stack: stack, requestBytes: req.bytes, responseBytes: fr.bytes, steps: steps,
      ports: { client: cport, server: u.port }, isn: { client: cisn, server: sisn } };
  }

  var engine = {
    parseURL: parseURL, resolve: resolve, buildJourney: buildJourney, buildStack: buildStack, splitTCP: splitTCP, fragmentIP: fragmentIP,
    httpServer: httpServer, formatRequest: formatRequest, formatResponse: formatResponse, overheadTotal: overheadTotal,
    parseIPv4: parseIPv4, intToIp: intToIp, toBin: toBin, maskOf: maskOf, subnetInfo: subnetInfo, subnetFromText: subnetFromText,
    classifyIPv4: classifyIPv4, sameSubnet: sameSubnet, prefixFromMask: prefixFromMask, utf8Len: utf8Len,
    ZONE: ZONE, ADDR: ADDR, SERVERS: SERVERS, SIM_DATE: SIM_DATE
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = engine;
  global.PacketJourney = engine;

  /* ================================================================== UI */
  if (typeof document === 'undefined') return;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  var SVGNS = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs, text) {
    var e = document.createElementNS(SVGNS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (text !== undefined) e.textContent = text;
    return e;
  }

  var PRESETS = [
    { name: 'First visit (cold caches)', url: 'http://www.example.com/', method: 'GET', cache: 'cold', mtu: 200, mode: 'tcp',
      story: 'Nothing is cached: the full DNS walk root → TLD → authoritative, then TCP, HTTP and the layers.' },
    { name: 'Second visit (warm cache)', url: 'http://www.example.com/', method: 'GET', cache: 'os', mtu: 200, mode: 'tcp',
      story: 'Same page, but this computer remembers the address: DNS costs zero packets.' },
    { name: 'Alias (CNAME)', url: 'http://blog.example.com/', method: 'GET', cache: 'tld', mtu: 200, mode: 'tcp',
      story: 'blog.example.com is only a nickname for www.example.com; the resolver already knows .com so it skips the root.' },
    { name: 'Broken link (404)', url: 'http://www.example.com/missing', method: 'GET', cache: 'resolver', mtu: 200, mode: 'tcp',
      story: 'The server exists but the page does not: DNS and TCP succeed, HTTP says 404.' },
    { name: 'Typo in the domain', url: 'http://www.exmaple.com/', method: 'GET', cache: 'cold', mtu: 200, mode: 'tcp',
      story: 'One swapped letter: DNS answers NXDOMAIN and no connection is ever opened.' },
    { name: 'Moved page (301)', url: 'http://example.org/old', method: 'GET', cache: 'cold', mtu: 200, mode: 'tcp',
      story: 'A 301 response with a Location header: the browser would now repeat the whole request for the new URL.' },
    { name: 'HTTPS API on port 443', url: 'https://api.example.net/time', method: 'GET', cache: 'cold', mtu: 1500, mode: 'tcp',
      story: 'https means port 443 and an extra TLS handshake; with the real Ethernet MTU the small reply fits in one segment.' },
    { name: 'UDP and IP fragments', url: 'http://www.example.com/', method: 'GET', cache: 'os', mtu: 200, mode: 'udp',
      story: 'What if the reply were one UDP datagram? Now IP itself must fragment it (TCP avoids this with MSS).' }
  ];
  var NODES = {
    client: { x: 64, y: 100, name: 'Your browser', ip: ADDR.client },
    resolver: { x: 270, y: 108, name: 'Resolver', ip: ADDR.resolver },
    root: { x: 190, y: 28, name: 'Root server', ip: ADDR.root },
    tld: { x: 340, y: 28, name: 'TLD server', ip: '.com .org .net' },
    auth: { x: 490, y: 28, name: 'Authoritative', ip: 'zone owner' },
    server: { x: 520, y: 160, name: 'Web server', ip: '203.0.113.x …' }
  };
  var PHASES = [['url', '1 · URL'], ['dns', '2 · DNS'], ['tcp', '3 · TCP'], ['http', '4 · HTTP'], ['layers', '5 · Layers']];
  var LAYER_NAMES = ['Application (HTTP)', 'Transport (TCP/UDP)', 'Network (IP)', 'Link (Ethernet)', 'Physical (bits)'];

  function mount(root) {
    var state = { j: null, i: 0 };
    var f = {};
    root.className = 'pj';
    root.innerHTML = '';

    var sim = el('p', 'pj-sim');
    sim.innerHTML = '<strong>Simulation.</strong> The zone table, servers, IP addresses (documentation ranges 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24) and clock are invented; nothing here touches the real network.';
    root.appendChild(sim);

    /* inputs */
    var form = el('form', 'pj-form');
    function field(label, ctl) { var w = el('label', 'pj-field'); w.appendChild(el('span', 'pj-lab', label)); w.appendChild(ctl); return w; }
    f.url = el('input'); f.url.type = 'text'; f.url.spellcheck = false; f.url.autocomplete = 'off'; f.url.value = PRESETS[0].url;
    f.method = el('select'); ['GET', 'HEAD', 'POST'].forEach(function (m) { var o = el('option', '', m); o.value = m; f.method.appendChild(o); });
    f.cache = el('select');
    [['cold', 'nothing cached'], ['tld', 'resolver knows .com/.org/.net'], ['resolver', 'resolver cached the name'], ['os', 'my computer cached it']].forEach(function (c) { var o = el('option', '', c[1]); o.value = c[0]; f.cache.appendChild(o); });
    f.mtu = el('select');
    [['200', '200 B (teaching)'], ['1500', '1500 B (real Ethernet)']].forEach(function (c) { var o = el('option', '', c[1]); o.value = c[0]; f.mtu.appendChild(o); });
    f.mode = el('select');
    [['tcp', 'TCP segments'], ['udp', 'UDP datagram']].forEach(function (c) { var o = el('option', '', c[1]); o.value = c[0]; f.mode.appendChild(o); });
    var go = el('button', 'btn primary', 'Send it'); go.type = 'submit';
    var urlField = field('URL to visit', f.url); urlField.className += ' pj-wide';
    form.appendChild(urlField);
    form.appendChild(field('HTTP method', f.method));
    form.appendChild(field('DNS caches', f.cache));
    form.appendChild(field('Link MTU', f.mtu));
    form.appendChild(field('Transport', f.mode));
    form.appendChild(go);
    root.appendChild(form);

    var pre = el('div', 'pj-presets'); pre.appendChild(el('span', 'pj-lab', 'Stories:'));
    PRESETS.forEach(function (p, idx) {
      var b = el('button', 'pj-chip', p.name); b.type = 'button';
      b.addEventListener('click', function () { applyPreset(idx); });
      pre.appendChild(b);
    });
    root.appendChild(pre);
    f.story = el('p', 'pj-story'); root.appendChild(f.story);

    /* phases */
    f.phases = el('div', 'pj-phases'); f.phases.setAttribute('role', 'group'); f.phases.setAttribute('aria-label', 'Jump to a phase');
    PHASES.forEach(function (p) {
      var b = el('button', 'pj-phase', p[1]); b.type = 'button'; b.dataset.phase = p[0];
      b.addEventListener('click', function () {
        for (var k = 0; k < state.j.steps.length; k++) if (state.j.steps[k].phase === p[0]) { state.i = k; render(); return; }
      });
      f.phases.appendChild(b);
    });
    root.appendChild(f.phases);

    /* stage */
    var stage = el('div', 'pj-stage');
    f.map = el('div', 'pj-map'); stage.appendChild(f.map);
    f.detail = el('div', 'pj-detail'); stage.appendChild(f.detail);
    root.appendChild(stage);
    f.narr = el('p', 'pj-narr'); f.narr.setAttribute('aria-live', 'polite'); root.appendChild(f.narr);

    var ctl = el('div', 'pj-ctl');
    f.back = el('button', 'btn', '← Back'); f.back.type = 'button';
    f.next = el('button', 'btn primary', 'Next →'); f.next.type = 'button';
    f.reset = el('button', 'btn', 'Restart'); f.reset.type = 'button';
    f.count = el('span', 'pj-count');
    ctl.appendChild(f.back); ctl.appendChild(f.next); ctl.appendChild(f.reset); ctl.appendChild(f.count);
    root.appendChild(ctl);

    f.back.addEventListener('click', function () { if (state.i > 0) { state.i--; render(); } });
    f.next.addEventListener('click', function () { if (state.i < state.j.steps.length - 1) { state.i++; render(); } });
    f.reset.addEventListener('click', function () { state.i = 0; render(); });
    form.addEventListener('submit', function (e) { e.preventDefault(); start(); });
    root.addEventListener('keydown', function (e) {
      var t = e.target.tagName;
      if (t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA') return;
      if (e.key === 'ArrowRight') { f.next.click(); e.preventDefault(); } else if (e.key === 'ArrowLeft') { f.back.click(); e.preventDefault(); }
    });

    function applyPreset(idx) {
      var p = PRESETS[idx];
      f.url.value = p.url; f.method.value = p.method; f.cache.value = p.cache; f.mtu.value = String(p.mtu); f.mode.value = p.mode;
      f.story.textContent = p.story;
      start();
    }
    function start() {
      state.j = buildJourney({ url: f.url.value, method: f.method.value, cache: f.cache.value, mtu: parseInt(f.mtu.value, 10), mode: f.mode.value });
      state.i = 0; render();
    }

    /* ---- rendering ---- */
    function drawMap(step) {
      f.map.innerHTML = '';
      var s = svg('svg', { viewBox: '0 0 600 205', role: 'img', 'aria-label': 'Map of the simulated network: your browser, the DNS resolver, root, TLD and authoritative servers, and the web server. The highlighted arrow shows who talks to whom in this step.' });
      var defs = svg('defs', {}), mk = svg('marker', { id: 'pj-arrow', viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' });
      mk.appendChild(svg('path', { d: 'M0 0 L10 5 L0 10 z', class: 'pj-arrowhead' })); defs.appendChild(mk); s.appendChild(defs);
      var EDGES = [['client', 'resolver'], ['resolver', 'root'], ['resolver', 'tld'], ['resolver', 'auth'], ['client', 'server']];
      EDGES.forEach(function (e) {
        var a = NODES[e[0]], b = NODES[e[1]];
        s.appendChild(svg('path', { d: edgePath(e[0], e[1]), class: 'pj-edge' }));
      });
      if (step.from !== step.to) {
        var key = step.from + '>' + step.to;
        s.appendChild(svg('path', { d: edgePath(step.from, step.to), class: 'pj-edge on', 'marker-end': 'url(#pj-arrow)' }));
        var a2 = NODES[step.from], b2 = NODES[step.to];
        var lbl = labelFor(step);
        var lx = (a2.x + b2.x) / 2, ly = (a2.y + b2.y) / 2 - 7;
        if ((step.from === 'client' && step.to === 'server') || (step.from === 'server' && step.to === 'client')) ly = 192;
        var t = svg('text', { x: lx, y: ly, 'text-anchor': 'middle', class: 'pj-elabel' }, lbl);
        var bg = svg('rect', { x: lx - lbl.length * 3.4 - 4, y: ly - 11, width: lbl.length * 6.8 + 8, height: 15, rx: 4, class: 'pj-elabel-bg' });
        s.appendChild(bg); s.appendChild(t);
      }
      Object.keys(NODES).forEach(function (k) {
        var n = NODES[k], active = (k === step.from || k === step.to);
        var g = svg('g', { class: 'pj-node' + (active ? ' on' : '') });
        g.appendChild(svg('rect', { x: n.x - 52, y: n.y - 19, width: 104, height: 38, rx: 8 }));
        g.appendChild(svg('text', { x: n.x, y: n.y - 3, 'text-anchor': 'middle', class: 'pj-nname' }, n.name));
        g.appendChild(svg('text', { x: n.x, y: n.y + 11, 'text-anchor': 'middle', class: 'pj-nip' }, n.ip));
        s.appendChild(g);
      });
      f.map.appendChild(s);
    }
    function edgePath(a, b) {
      var A = NODES[a], B = NODES[b];
      if ((a === 'client' && b === 'server') || (a === 'server' && b === 'client'))
        return 'M' + (A.x) + ' ' + (A.y + 19) + ' Q ' + ((A.x + B.x) / 2) + ' 215 ' + (B.x - 20) + ' ' + (B.y + 19);
      return 'M' + (A.x + 0) + ' ' + (A.y + (B.y > A.y ? 19 : -19)) + ' L' + (B.x) + ' ' + (B.y + (B.y > A.y ? -19 : 19));
    }
    function labelFor(step) {
      var d = step.detail || {};
      if (step.phase === 'dns') return step.kind === 'query' ? 'query' : step.kind === 'referral' ? 'referral' : step.kind === 'nxdomain' ? 'NXDOMAIN' : 'answer';
      if (step.phase === 'tcp') return d.flags ? d.flags.join('+') : 'TLS';
      if (step.phase === 'http') return d.role === 'request' ? 'request' : 'response';
      return 'frames';
    }

    function kv(rows) {
      var t = el('table', 'pj-kv');
      rows.forEach(function (r) { var tr = el('tr'); tr.appendChild(el('th', '', r[0])); var td = el('td'); if (r[2]) td.className = r[2]; td.textContent = r[1]; tr.appendChild(td); t.appendChild(tr); });
      return t;
    }
    function detailURL(step, d) {
      var box = el('div'); box.appendChild(el('h4', '', 'Anatomy of the URL'));
      var line = el('p', 'pj-url');
      var u = d.u;
      [[u.scheme + '://', 'scheme'], [u.host, 'host'], [u.explicitPort ? ':' + u.port : '', 'port'], [u.path, 'path'], [u.query, 'query'], [u.fragment, 'fragment']].forEach(function (p) {
        if (p[0]) line.appendChild(el('span', 'pj-seg pj-' + p[1], p[0]));
      });
      box.appendChild(line);
      box.appendChild(kv(d.parts.map(function (p) { return [p.k, p.v + '   — ' + p.why]; })));
      return box;
    }
    function detailDNS(step, d) {
      var box = el('div'); box.appendChild(el('h4', '', 'DNS conversation'));
      var c = d.caches || {};
      box.appendChild(kv([['This computer\'s cache', c.os === 'hit' ? 'HIT' : 'empty / miss', c.os === 'hit' ? 'good' : ''],
        ['Resolver\'s cache', c.resolver === 'hit' ? 'HIT' : c.tld === 'known' ? 'name unknown, TLD servers known' : 'empty', c.resolver === 'hit' ? 'good' : '']]));
      if (d.question) box.appendChild(el('pre', 'pj-msg', 'Question : ' + d.question));
      if (d.answer) box.appendChild(el('pre', 'pj-msg' + (step.kind === 'nxdomain' ? ' bad' : ''), (step.kind === 'referral' ? 'Referral : ' : 'Answer   : ') + d.answer.join('\n          ')));
      return box;
    }
    function detailTCP(step, d) {
      var box = el('div'); box.appendChild(el('h4', '', step.kind === 'tls' ? 'TLS (not simulated)' : 'TCP connection set-up'));
      if (d.flags) {
        box.appendChild(kv([['from → to', d.src + '  →  ' + d.dst], ['flags', tcpFlags(d.flags), 'flag'], ['sequence number', String(d.seq)],
          ['acknowledgement', d.ack === null ? '— (no ACK flag yet)' : String(d.ack)]]));
      }
      box.appendChild(kv([['Client state', d.cstate], ['Server state', d.sstate]]));
      return box;
    }
    function detailHTTP(step, d) {
      var box = el('div'); box.appendChild(el('h4', '', 'HTTP ' + d.role + ' — ' + d.bytes + ' bytes of text'));
      var p = el('pre', 'pj-msg http'), lines = d.message.replace(/\r/g, '').split('\n');
      var inHead = true;
      lines.forEach(function (ln, k) {
        var sp = el('span', k === 0 ? 'pj-first' : (inHead && ln.indexOf(':') > 0 ? 'pj-hdr' : (inHead ? '' : 'pj-body')), ln + (k < lines.length - 1 ? '\n' : ''));
        if (ln === '' && inHead) inHead = false;
        p.appendChild(sp);
      });
      box.appendChild(p);
      box.appendChild(el('p', 'pj-hint', 'Each line really ends with the two bytes CR LF; the empty line separates headers from the body.'));
      return box;
    }
    function detailLayers(step, d) {
      var box = el('div'), st = d.stack, lv = d.level;
      var ladder = el('ol', 'pj-ladder');
      LAYER_NAMES.forEach(function (n, k) { var li = el('li', k === lv ? 'on' : ''); li.textContent = n; ladder.appendChild(li); });
      var head = el('div', 'pj-lhead');
      head.appendChild(ladder);
      var right = el('div', 'pj-lright');
      var dirTxt = d.dir === 'router' ? 'Router: strips frame, reads IP header, builds a new frame' : d.dir === 'down' ? 'Sender: data moves down — headers are added' : 'Receiver: data moves up — headers are removed';
      right.appendChild(el('h4', '', dirTxt));
      var bw = el('div', 'pj-bars');
      var items = st.items.slice(0, 6);
      items.forEach(function (it) {
        var row = el('div', 'pj-row'); row.appendChild(el('span', 'pj-rl', st.unit + ' ' + it.index));
        var b = el('div', 'pj-bar'), tot = 0;
        var up = d.dir === 'up';
        var includeTr = up ? lv >= 2 : lv >= 1, includeIp = up ? lv >= 3 : lv >= 2, includeEth = up ? false : lv >= 3;
        if (d.dir === 'router') { includeTr = includeIp = includeEth = true; }
        function seg(cls, n, label) { if (n <= 0) return; var s = el('span', 'pj-b ' + cls, n >= 26 ? label : ''); s.style.flexGrow = String(n); s.style.flexBasis = '0'; s.title = label + ' ' + n + ' bytes'; b.appendChild(s); tot += n; }
        if (includeEth) seg('eth', 14, 'Eth 14');
        if (includeIp) seg('ip', 20, 'IP 20');
        if (includeTr) seg('tr', it.transport, (st.mode === 'udp' ? 'UDP ' : 'TCP ') + it.transport);
        seg('app', it.app, 'data ' + it.app);
        if (includeEth) seg('eth', 4, 'FCS');
        row.appendChild(b); row.appendChild(el('span', 'pj-rt', tot + ' B'));
        bw.appendChild(row);
      });
      if (st.items.length > items.length) bw.appendChild(el('p', 'pj-hint', '… and ' + (st.items.length - items.length) + ' more ' + st.unit + 's'));
      right.appendChild(bw);
      var leg = el('p', 'pj-legend');
      leg.innerHTML = '<span class="pj-b app">data</span> <span class="pj-b tr">transport header</span> <span class="pj-b ip">IP header</span> <span class="pj-b eth">Ethernet header / trailer</span>';
      right.appendChild(leg);
      var sum = el('p', 'pj-hint');
      sum.textContent = 'MTU ' + st.mtu + ' B' + (st.mss ? ' · MSS ' + st.mss + ' B' : '') + ' · ' + st.items.length + ' ' + st.unit + (st.items.length > 1 ? 's' : '') +
        ' · content ' + st.appBytes + ' B (+' + (st.mode === 'udp' ? 8 : 0) + ') · headers/trailers add ' + overheadTotal(st) + ' B';
      right.appendChild(sum);
      if (st.mode === 'udp' && st.items.length > 1) {
        var ft = el('div', 'tbl-scroll'), tb = el('table', 'tbl pj-ft');
        tb.innerHTML = '<tr><th>Fragment</th><th>IP payload (B)</th><th>Offset (×8 B)</th><th>More frag.</th></tr>';
        st.items.forEach(function (it) { var tr = el('tr'); [it.index, it.ipPayload, it.offsetUnits, it.mf ? 'yes' : 'no'].forEach(function (c) { tr.appendChild(el('td', '', String(c))); }); tb.appendChild(tr); });
        ft.appendChild(tb); right.appendChild(ft);
      }
      if (st.mode === 'tcp' && st.items.length > 1) {
        var ft2 = el('div', 'tbl-scroll'), tb2 = el('table', 'tbl pj-ft');
        tb2.innerHTML = '<tr><th>Segment</th><th>Seq. no.</th><th>Data (B)</th><th>Frame (B)</th></tr>';
        st.items.forEach(function (it) { var tr = el('tr'); [it.index, it.seq, it.app, it.total].forEach(function (c) { tr.appendChild(el('td', '', String(c))); }); tb2.appendChild(tr); });
        ft2.appendChild(tb2); right.appendChild(ft2);
      }
      head.appendChild(right);
      box.appendChild(head);
      return box;
    }

    function render() {
      var j = state.j, step = j.steps[state.i];
      f.detail.innerHTML = '';
      f.detail.appendChild(el('h3', 'pj-title', step.title));
      var d = step.detail || {};
      if (d.error) f.detail.appendChild(el('p', 'pj-err', d.error));
      else if (step.phase === 'url') f.detail.appendChild(detailURL(step, d));
      else if (step.phase === 'dns') f.detail.appendChild(detailDNS(step, d));
      else if (step.phase === 'tcp') f.detail.appendChild(detailTCP(step, d));
      else if (step.phase === 'http') f.detail.appendChild(detailHTTP(step, d));
      else f.detail.appendChild(detailLayers(step, d));
      drawMap(step);
      f.narr.textContent = step.text;
      f.count.textContent = 'Step ' + (state.i + 1) + ' of ' + j.steps.length;
      f.back.disabled = state.i === 0; f.next.disabled = state.i === j.steps.length - 1;
      var have = {}; j.steps.forEach(function (s) { have[s.phase] = true; });
      Array.prototype.forEach.call(f.phases.children, function (b) {
        b.disabled = !have[b.dataset.phase];
        if (b.dataset.phase === step.phase) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
      });
    }
    applyPreset(0);
    mountSubnet(root);
  }

  /* ---------------------------------------------------------------- subnet calculator */
  function mountSubnet(host) {
    var box = el('section', 'pj-subnet');
    box.appendChild(el('h3', '', 'Second panel: IPv4 subnet calculator'));
    box.appendChild(el('p', 'pj-hint', 'IPv4 only. Type an address with a prefix (192.0.2.77/26) or with a mask (192.0.2.77 255.255.255.192). The bits in the mask\'s network part decide which addresses are "on the same LAN".'));
    var form = el('form', 'pj-form');
    var l1 = el('label', 'pj-field pj-wide'); l1.appendChild(el('span', 'pj-lab', 'Address / prefix'));
    var inp = el('input'); inp.type = 'text'; inp.value = '192.0.2.77/26'; inp.spellcheck = false; inp.autocomplete = 'off'; l1.appendChild(inp);
    var l2 = el('label', 'pj-field pj-wide'); l2.appendChild(el('span', 'pj-lab', 'Is this other host on the same subnet? (optional)'));
    var inp2 = el('input'); inp2.type = 'text'; inp2.placeholder = '192.0.2.100'; inp2.spellcheck = false; inp2.autocomplete = 'off'; l2.appendChild(inp2);
    var b = el('button', 'btn primary', 'Calculate'); b.type = 'submit';
    form.appendChild(l1); form.appendChild(l2); form.appendChild(b);
    box.appendChild(form);
    var out = el('div', 'pj-sub-out'); out.setAttribute('aria-live', 'polite'); box.appendChild(out);
    function bits(v, p) {
      var s = toBin(v), e = el('span', 'pj-bits'), n = 0;
      for (var i = 0; i < s.length; i++) {
        if (s[i] === '.') { e.appendChild(document.createTextNode('.')); continue; }
        var c = el('span', n < p ? 'net' : 'host', s[i]); e.appendChild(c); n++;
      }
      return e;
    }
    function calc() {
      out.innerHTML = '';
      var r = subnetFromText(inp.value);
      if (r.error) { out.appendChild(el('p', 'pj-err', r.error)); return; }
      var t = el('table', 'pj-kv pj-subtab');
      function row(label, v, withBits) {
        var tr = el('tr'); tr.appendChild(el('th', '', label));
        var td1 = el('td', 'mono', intToIp(v)); tr.appendChild(td1);
        var td2 = el('td'); if (withBits) td2.appendChild(bits(v, r.prefix)); tr.appendChild(td2);
        t.appendChild(tr);
      }
      row('Address', r.ip, true); row('Mask /' + r.prefix, r.mask, true); row('Network address', r.network, true);
      row('Broadcast address', r.broadcast, true); row('First usable host', r.first, true); row('Last usable host', r.last, true);
      out.appendChild(t);
      var s = el('p', 'pj-hint');
      s.textContent = 'Usable hosts: ' + r.hosts + ' (2^' + (32 - r.prefix) + ' addresses' + (r.prefix <= 30 ? ' minus network and broadcast' : '') + ')' + (r.note ? ' — ' + r.note : '') + '. Address type: ' + r.kind + '.';
      out.appendChild(s);
      out.appendChild(el('p', 'pj-hint', 'Bits in the accent colour are the network part (the first ' + r.prefix + ' bits); the amber bits identify the host.'));
      var o = inp2.value.trim();
      if (o) {
        var v2 = parseIPv4(o);
        if (v2 === null) out.appendChild(el('p', 'pj-err', 'The second address is not a valid IPv4 address.'));
        else {
          var same = sameSubnet(r.ip, v2, r.prefix);
          out.appendChild(el('p', same ? 'pj-ok' : 'pj-warn', same ? o + ' is in the same subnet: the two hosts can talk directly (switch only).' : o + ' is NOT in this subnet: traffic must go through the default gateway (a router).'));
        }
      }
    }
    form.addEventListener('submit', function (e) { e.preventDefault(); calc(); });
    host.appendChild(box);
    calc();
  }

  function init() { var r = document.getElementById('net-root'); if (r) mount(r); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(typeof window !== 'undefined' ? window : globalThis);
