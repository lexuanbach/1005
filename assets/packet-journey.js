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

  /* ------------------------------------------------------------------ animation helpers (pure, no DOM)
     The animation never invents events: it is driven by the journey's own steps.
       packetCard(step)  -> the small card (title + header lines) that travels along the map edge for a step
       stackState(step)  -> where the message is in the layered view and which headers it carries
       barLayout(...)    -> the geometry of the packet bars (segments) in that view                        */
  var SPEEDS = [['Ultra slow', 5000], ['Very slow', 2200], ['Slow', 1400], ['Normal', 800], ['Fast', 400], ['Very fast', 150], ['Instant', 0]];
  function cut(s, n) { s = String(s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function dnsIpOf(node, question) {
    var host = String(question || '').replace(/^A\? /, '').replace(/\.$/, ''), labels = host.split('.');
    var tld = labels[labels.length - 1], zone = labels.slice(-2).join('.');
    if (node === 'client') return ADDR.client;
    if (node === 'resolver') return ADDR.resolver;
    if (node === 'root') return ADDR.root;
    if (node === 'tld') return ADDR.tld[tld] || '?';
    if (node === 'auth') return ZONE[zone] ? ZONE[zone].ip : '?';
    return '?';
  }
  function packetCard(step) {
    if (!step || step.from === step.to || step.phase === 'url' || step.phase === 'layers') return null;
    var d = step.detail || {}, lines = [], title = '';
    if (step.phase === 'dns') {
      var dst = dnsIpOf(step.to, d.question), a = d.answer && d.answer.length ? d.answer[d.answer.length - 1] : '';
      if (step.kind === 'query') { title = 'DNS query · UDP'; lines = [d.question || '', '→ ' + dst + ':53']; }
      else if (step.kind === 'referral') { title = 'DNS referral · UDP'; lines = ['"ask the next level"', '→ ' + dst]; }
      else if (step.kind === 'nxdomain') { title = 'DNS answer · UDP'; lines = ['NXDOMAIN: no such name', '→ ' + dst]; }
      else { var m = /\bA\s+(\d+\.\d+\.\d+\.\d+)\s*$/.exec(a); title = 'DNS answer · UDP'; lines = [m ? 'A ' + m[1] : cut(a, 22), '→ ' + dst]; }
    } else if (step.phase === 'tcp') {
      if (!d.flags) { title = 'TLS handshake'; lines = ['(not simulated)']; }
      else {
        var sp = String(d.src).split(':'), dp = String(d.dst).split(':');
        title = 'TCP ' + d.flags.join('+');
        lines = ['IP → ' + dp[0], 'ports ' + sp[1] + ' → ' + dp[1], 'seq ' + d.seq + ' · ack ' + (d.ack === null ? '–' : d.ack)];
      }
    } else if (step.phase === 'http') {
      var ls = String(d.message).replace(/\r/g, '').split('\n'), hs = [];
      for (var i = 1; i < ls.length && ls[i] !== ''; i++) hs.push(ls[i]);
      title = d.role === 'request' ? 'HTTP request' : 'HTTP response';
      lines = [cut(ls[0], 24)];
      if (d.role === 'request') { lines.push(cut(hs[0] || '', 24)); lines.push('+' + Math.max(0, hs.length - 1) + ' more headers'); }
      else {
        var cl = hs.filter(function (h) { return /^Content-Length/i.test(h); })[0], ct = hs.filter(function (h) { return /^Content-Type/i.test(h); })[0];
        lines.push(cut(ct || '', 24)); lines.push(cut(cl || '', 24));
      }
    } else return null;
    lines = lines.filter(function (x) { return x !== ''; });
    var w = Math.max(title.length, Math.max.apply(null, lines.map(function (l) { return l.length; }).concat([0]))) * 5.3 + 14;
    return { title: title, lines: lines, kind: step.phase, w: Math.round(w), h: 12 * (lines.length + 1) + 6 };
  }
  /* layered view: segs = which headers the packet(s) carry; count = how many packets/segments/fragments exist at that moment */
  function stackState(step) {
    var d = step.detail, st = d.stack, n = st.items.length, U = st.mode === 'udp', lv = d.level, dir = d.dir;
    if (dir === 'router') return { where: 'router', level: 4, segs: { tr: true, ip: true, eth: true }, count: n, udp: U, dir: dir };
    var down = dir === 'down';
    return {
      where: down ? 'server' : 'client', level: lv, dir: dir, udp: U,
      segs: down ? { tr: lv >= 1, ip: lv >= 2, eth: lv >= 3 } : { tr: lv >= 2, ip: lv >= 3, eth: false },
      count: down ? (U ? (lv >= 2 ? n : 1) : (lv >= 1 ? n : 1)) : (U ? (lv >= 3 ? n : 1) : (lv >= 2 ? n : 1))
    };
  }
  var BARW = 136;
  function barLayout(count, segs) {
    var shown = Math.min(count, 4), single = count === 1, bars = [], sw = single ? { eth: 20, ip: 18, tr: 18, fcs: 7 } : { eth: 9, ip: 8, tr: 8, fcs: 3 };
    var bw = single ? BARW : 66, bh = single ? 22 : 13;
    for (var i = 0; i < shown; i++) {
      var col = single ? 0 : i % 2, row = single ? 0 : Math.floor(i / 2);
      var x = col * (bw + 4), y = single ? 7 : 3 + row * 17, list = [], cx = x;
      function put(k, w) { list.push({ k: k, x: cx, w: w }); cx += w; }
      var used = (segs.eth ? sw.eth + sw.fcs : 0) + (segs.ip ? sw.ip : 0) + (segs.tr ? sw.tr : 0);
      if (segs.eth) put('eth', sw.eth);
      if (segs.ip) put('ip', sw.ip);
      if (segs.tr) put('tr', sw.tr);
      put('app', bw - used);
      if (segs.eth) put('fcs', sw.fcs);
      bars.push({ x: x, y: y, w: bw, h: bh, segs: list });
    }
    return { bars: bars, more: count - shown, single: single };
  }
  /* one colour per component: the layer ids used for CSS classes (pj-L-<id>) and which layer each header segment belongs to */
  var LAYER_IDS = ['app', 'tr', 'ip', 'eth', 'phy'];
  var SEG_LAYER = { app: 'app', tr: 'tr', ip: 'ip', eth: 'eth', fcs: 'eth' };
  var ST = { sx: 4, cx: 384, w: 212, lab: 70, y0: 30, pitch: 44, rh: 38 };
  function rungY(k) { return ST.y0 + k * ST.pitch; }
  function anchorOf(state) { // top-left corner of the packet area
    if (state.where === 'router') return { x: 232, y: rungY(3) + 1 };
    return { x: (state.where === 'server' ? ST.sx : ST.cx) + ST.lab, y: rungY(state.level) + 1 };
  }

  var engine = {
    packetCard: packetCard, stackState: stackState, LAYER_IDS: LAYER_IDS, SEG_LAYER: SEG_LAYER, NODE_IDS: ['client', 'resolver', 'root', 'tld', 'auth', 'server'], barLayout: barLayout, anchorOf: anchorOf, SPEEDS: SPEEDS, ST: ST, BARW: BARW,
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
        for (var k = 0; k < state.j.steps.length; k++) if (state.j.steps[k].phase === p[0]) { stopAuto(); goTo(k, false); return; }
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

    /* auto-play / pause / speed (below Back-Next so those buttons never move) */
    var autoRow = el('div', 'pj-auto'); autoRow.setAttribute('role', 'group'); autoRow.setAttribute('aria-label', 'Animation controls');
    f.play = el('button', 'btn', '\u25b6 Auto-play story'); f.play.type = 'button';
    f.pause = el('button', 'btn', '\u23f8 Pause'); f.pause.type = 'button'; f.pause.disabled = true;
    var spIdx = 3, SPEED_KEY = 'co1005-pj-speed';
    try { var sv = localStorage.getItem(SPEED_KEY + '-v2'); if (sv === null) { sv = localStorage.getItem(SPEED_KEY); if (typeof sv === 'string' && /^[0-9]{1,2}$/.test(sv)) sv = String(+sv + 1); }  /* old saves predate Ultra slow */ if (typeof sv === 'string' && /^[0-9]{1,2}$/.test(sv) && +sv < SPEEDS.length) spIdx = +sv; } catch (e) {}
    var spWrap = el('div', 'pj-speed'), spLab = el('label', 'pj-lab', 'Speed'), spRng = el('input'), spNm = el('span', 'pj-speed-name');
    spRng.type = 'range'; spRng.min = 0; spRng.max = SPEEDS.length - 1; spRng.step = 1; spRng.value = spIdx; spRng.id = 'pj-speed'; spLab.setAttribute('for', 'pj-speed');
    function paintSpeed() { spNm.textContent = SPEEDS[spIdx][0] + (SPEEDS[spIdx][1] ? ' \u00b7 ' + (SPEEDS[spIdx][1] / 1000) + ' s' : ' \u00b7 no animation'); spRng.setAttribute('aria-valuetext', SPEEDS[spIdx][0]); }
    spRng.addEventListener('input', function () { spIdx = +spRng.value; paintSpeed(); try { localStorage.setItem(SPEED_KEY + '-v2', String(spIdx)); } catch (e) {} });
    paintSpeed(); spWrap.appendChild(spLab); spWrap.appendChild(spRng); spWrap.appendChild(spNm);
    autoRow.appendChild(f.play); autoRow.appendChild(f.pause); autoRow.appendChild(spWrap);
    root.appendChild(autoRow);

    f.back.addEventListener('click', function () { stopAuto(); if (state.i > 0) goTo(state.i - 1, false); });
    f.next.addEventListener('click', function () { stopAuto(); if (state.i < state.j.steps.length - 1) goTo(state.i + 1, true); });
    f.reset.addEventListener('click', function () { stopAuto(); goTo(0, false); });
    f.play.addEventListener('click', function () { if (auto.on) stopAuto(); else startAuto(); });
    f.pause.addEventListener('click', function () { togglePause(); });
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
      stopAuto(); state.i = 0; render(); fixHeights();
    }

    /* Keep the stage and the narration box the same height on every step of the current story, so the
       Back / Next buttons below them never move. Measured by rendering each step once (needs the lab to be visible). */
    var fixedW = -1;
    function fixHeights() {
      if (!state.j || !root.offsetWidth) { fixedW = -1; return; }
      if (document.documentElement.classList.contains('fs-on') && root.classList.contains('fs-active')) { // full screen: fixed-size panes (assets/fs-network.css), nothing to equalise
        stage.style.minHeight = ''; f.narr.style.minHeight = ''; fixedW = -1; return;
      }
      var keep = state.i, hs = 0, hn = 0;
      stage.style.minHeight = ''; f.narr.style.minHeight = '';
      for (var k = 0; k < state.j.steps.length; k++) {
        state.i = k; render();
        hs = Math.max(hs, stage.offsetHeight); hn = Math.max(hn, f.narr.offsetHeight);
      }
      stage.style.minHeight = hs + 'px'; f.narr.style.minHeight = hn + 'px';
      state.i = keep; render(); fixedW = root.offsetWidth;
    }
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(function () { if (root.offsetWidth !== fixedW) fixHeights(); });
      ro.observe(root);
    } else window.addEventListener('resize', function () { fixHeights(); });
    /* leaving full screen: put the equal heights back at once (not only when a ResizeObserver happens to fire) */
    if (window.MutationObserver) new MutationObserver(function () {
      if (!document.documentElement.classList.contains('fs-on')) { fixedW = -1; fixHeights(); }
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    /* ---- rendering (static: always draws the final state of a step; animation is added on top by playIn) ---- */
    var ctx = null, anims = [], lastDur = 0, auto = { on: false, paused: false, timer: null, due: 0, remain: 0 };
    function ms_() { return SPEEDS[spIdx][1]; }
    function reduced() { try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } }

    /* swatch row under the diagram: [[id, label], ...] with the CSS class prefix that sets --c */
    function legend(items, prefix) {
      var d = el('div', 'pj-key'); d.setAttribute('role', 'list');
      items.forEach(function (it) { var sp = el('span', prefix + it[0]); sp.setAttribute('role', 'listitem'); sp.appendChild(el('i')); sp.appendChild(document.createTextNode(it[1])); d.appendChild(sp); });
      return d;
    }
    function drawMap(step) {
      f.map.innerHTML = ''; ctx = null;
      if (step.phase === 'layers') return drawStack(step);
      var s = svg('svg', { viewBox: '0 0 600 232', role: 'img', 'aria-label': 'Map of the simulated network: your browser, the DNS resolver, root, TLD and authoritative servers, and the web server. The highlighted arrow and the packet card show who talks to whom in this step.' });
      var defs = svg('defs', {});
      Object.keys(NODES).forEach(function (k) { // one arrowhead per sender colour
        var mk = svg('marker', { id: 'pj-arrow-' + k, class: 'pj-c-' + k, viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' });
        mk.appendChild(svg('path', { d: 'M0 0 L10 5 L0 10 z', class: 'pj-arrowhead' })); defs.appendChild(mk);
      });
      s.appendChild(defs);
      var EDGES = [['client', 'resolver'], ['resolver', 'root'], ['resolver', 'tld'], ['resolver', 'auth'], ['client', 'server']];
      EDGES.forEach(function (e) { s.appendChild(svg('path', { d: edgePath(e[0], e[1]), class: 'pj-edge' })); });
      var ep = null;
      if (step.from !== step.to) {
        ep = svg('path', { d: edgePath(step.from, step.to), class: 'pj-edge on pj-c-' + step.from, 'marker-end': 'url(#pj-arrow-' + step.from + ')' });
        s.appendChild(ep);
      }
      var nodeEls = {};
      Object.keys(NODES).forEach(function (k) {
        var n = NODES[k], active = (k === step.from || k === step.to);
        var g = svg('g', { class: 'pj-node pj-c-' + k + (active ? ' on' : '') + (k === step.from && step.from !== step.to ? ' src' : '') + (k === step.to ? ' dst' : '') });
        nodeEls[k] = svg('rect', { x: n.x - 52, y: n.y - 19, width: 104, height: 38, rx: 8 });
        g.appendChild(nodeEls[k]);
        g.appendChild(svg('text', { x: n.x, y: n.y - 3, 'text-anchor': 'middle', class: 'pj-nname' }, n.name));
        g.appendChild(svg('text', { x: n.x, y: n.y + 11, 'text-anchor': 'middle', class: 'pj-nip' }, n.ip));
        s.appendChild(g);
      });
      f.map.appendChild(s);
      f.map.appendChild(legend([['client', 'Your browser'], ['resolver', 'Resolver'], ['root', 'Root server'], ['tld', 'TLD server'], ['auth', 'Authoritative'], ['server', 'Web server']], 'pj-c-'));
      var card = ep ? packetCard(step) : null, cg = null, pt = null;
      if (card) {
        pt = ep.getPointAtLength(ep.getTotalLength() * 0.5);
        cg = svg('g', { class: 'pj-card pj-c-' + step.from, transform: 'translate(' + pt.x.toFixed(1) + ' ' + pt.y.toFixed(1) + ')' });
        cg.appendChild(svg('rect', { x: -card.w / 2, y: -card.h / 2, width: card.w, height: card.h, rx: 5, class: 'pj-cbody' }));
        cg.appendChild(svg('rect', { x: -card.w / 2 + 1.5, y: -card.h / 2 + 1.5, width: 4.5, height: card.h - 3, rx: 2, class: 'pj-ctab' }));
        cg.appendChild(svg('text', { x: 2, y: -card.h / 2 + 12, 'text-anchor': 'middle', class: 'pj-ctitle' }, card.title));
        card.lines.forEach(function (ln, k) { cg.appendChild(svg('text', { x: 2, y: -card.h / 2 + 24 + k * 12, 'text-anchor': 'middle', class: 'pj-cline' }, ln)); });
        s.appendChild(cg);
      }
      ctx = { kind: 'map', svg: s, edge: ep, card: cg, nodes: nodeEls, step: step };
    }
    function edgePath(a, b) {
      var A = NODES[a], B = NODES[b];
      if ((a === 'client' && b === 'server') || (a === 'server' && b === 'client'))
        return 'M' + (A.x) + ' ' + (A.y + 19) + ' Q ' + ((A.x + B.x) / 2) + ' 244 ' + (B.x - 20) + ' ' + (B.y + 19);
      return 'M' + (A.x + 0) + ' ' + (A.y + (B.y > A.y ? 19 : -19)) + ' L' + (B.x) + ' ' + (B.y + (B.y > A.y ? -19 : 19));
    }

    var RUNG_NAMES = ['Application', 'Transport', 'Network', 'Link', 'Physical'];
    function drawStack(step) {
      var st = stackState(step), U = st.udp;
      var rsub = ['HTTP', U ? 'UDP +8' : 'TCP +20', 'IP +20', 'Eth +14 +4', 'bits'];
      var s = svg('svg', { viewBox: '0 0 600 262', role: 'img', 'aria-label': 'The layers: the message is wrapped on the way down the server stack, crosses the wire and a router, and is unwrapped on the way up the client stack.' });
      var wy = rungY(4) + 19, rungs = {}, wd = 'M' + (ST.sx + ST.w) + ' ' + wy + ' L250 ' + wy + ' M350 ' + wy + ' L' + ST.cx + ' ' + wy;
      s.appendChild(svg('path', { d: wd, class: 'pj-wire' }));
      var wireHot = svg('path', { d: wd, class: 'pj-wire hot pj-L-phy' }); s.appendChild(wireHot);
      s.appendChild(svg('text', { x: ST.sx + ST.w / 2, y: 17, 'text-anchor': 'middle', class: 'pj-stitle' }, 'Server (sender)'));
      s.appendChild(svg('text', { x: ST.cx + ST.w / 2, y: 17, 'text-anchor': 'middle', class: 'pj-stitle' }, 'Client (receiver)'));
      ['server', 'client'].forEach(function (side) {
        for (var k = 0; k < 5; k++) {
          var x = side === 'server' ? ST.sx : ST.cx, on = st.where === side && st.level === k;
          var g = svg('g', { class: 'pj-rung pj-L-' + LAYER_IDS[k] + (on ? ' on' : '') });
          rungs[side + k] = svg('rect', { x: x, y: rungY(k), width: ST.w, height: ST.rh, rx: 7 });
          g.appendChild(rungs[side + k]);
          g.appendChild(svg('text', { x: x + 6, y: rungY(k) + 16, class: 'pj-rname' }, RUNG_NAMES[k]));
          g.appendChild(svg('text', { x: x + 6, y: rungY(k) + 29, class: 'pj-rsub' }, rsub[k]));
          s.appendChild(g);
        }
      });
      var rg = svg('g', { class: 'pj-rung pj-router pj-L-rt' + (st.where === 'router' ? ' on' : '') });
      rungs.router = svg('rect', { x: 250, y: rungY(4), width: 100, height: ST.rh, rx: 7 });
      rg.appendChild(rungs.router);
      rg.appendChild(svg('text', { x: 300, y: rungY(4) + 16, 'text-anchor': 'middle', class: 'pj-rname' }, 'Router'));
      rg.appendChild(svg('text', { x: 300, y: rungY(4) + 29, 'text-anchor': 'middle', class: 'pj-rsub' }, 'layers 1–3 only'));
      s.appendChild(rg);
      var layout = barLayout(st.count, st.segs), A = anchorOf(st), barEls = [], segEls = [];
      layout.bars.forEach(function (b) {
        var g = svg('g', { class: 'pj-bar' }), els = {};
        b.segs.forEach(function (sg) {
          els[sg.k] = svg('rect', { x: A.x + sg.x, y: A.y + b.y, width: sg.w, height: b.h, rx: 2, class: 'pj-sg pj-L-' + SEG_LAYER[sg.k] });
          g.appendChild(els[sg.k]);
          if (layout.single && sg.w >= 17 && sg.k !== 'fcs') g.appendChild(svg('text', { x: A.x + sg.x + sg.w / 2, y: A.y + b.y + 14.5, 'text-anchor': 'middle', class: 'pj-sgt' }, sg.k === 'app' ? 'data' : sg.k === 'tr' ? (U ? 'UDP' : 'TCP') : sg.k === 'ip' ? 'IP' : 'Eth'));
        });
        if (st.where === 'server' && st.level === 4) { // physical layer: the frame is now just bits
          var bx = svg('rect', { x: A.x + b.x - 2.5, y: A.y + b.y - 2.5, width: b.w + 5, height: b.h + 5, rx: 4, class: 'pj-bitsbox pj-L-phy' });
          g.appendChild(bx); els.bits = bx;
        }
        s.appendChild(g); barEls.push(g); segEls.push(els);
      });
      if (layout.more > 0) s.appendChild(svg('text', { x: A.x + BARW, y: A.y + 36, 'text-anchor': 'end', class: 'pj-more' }, '+' + layout.more + ' more'));
      var ghosts = svg('g', { 'pointer-events': 'none' }); s.appendChild(ghosts);
      f.map.appendChild(s);
      f.map.appendChild(legend([['L-app', 'Application · data'], ['L-tr', 'Transport · ' + (U ? 'UDP' : 'TCP') + ' header'], ['L-ip', 'Network · IP header'],
        ['L-eth', 'Link · Ethernet header + trailer'], ['L-phy', 'Physical · bits'], ['L-rt', 'Router']], 'pj-'));
      ctx = { kind: 'stack', svg: s, state: st, layout: layout, anchor: A, bars: barEls, segEls: segEls, ghosts: ghosts, rungs: rungs, step: step, wireHot: wireHot };
    }

    /* ---- animation (decoration only: the final state is already on screen; cancelling any animation is harmless) ---- */
    function A_(node, kf, opt) {
      try { var a = node.animate(kf, opt); anims.push(a); return a; } catch (e) { return null; }
    }
    function cancelAnims() {
      anims.forEach(function (a) { try { a.cancel(); } catch (e) {} });
      anims = []; if (ctx && ctx.ghosts) ctx.ghosts.textContent = '';
    }
    function ease(k) { return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; }
    function pulse(rect, delay, ms) { A_(rect, [{ strokeWidth: '7px' }, { strokeWidth: '3.4px' }], { duration: Math.max(200, ms * 0.7), delay: delay, easing: 'ease-out' }); }

    function animMap(c, step, ms) {
      if (c.card && c.edge) {
        var len = c.edge.getTotalLength(), end = c.edge.getPointAtLength(len * 0.5), kf = [];
        for (var k = 0; k <= 12; k++) {
          var p = c.edge.getPointAtLength(len * 0.5 * ease(k / 12));
          kf.push({ transform: 'translate(' + p.x.toFixed(1) + 'px,' + p.y.toFixed(1) + 'px)', opacity: k === 0 ? 0.2 : 1 });
        }
        A_(c.card, kf, { duration: ms, easing: 'linear' });
        if (c.nodes[step.from]) pulse(c.nodes[step.from], 0, ms * 0.5);
        if (c.nodes[step.to]) pulse(c.nodes[step.to], ms * 0.8, ms * 0.6);
        return Math.round(ms * 1.4);
      }
      if (c.nodes[step.from]) { pulse(c.nodes[step.from], 0, ms); pulse(c.nodes[step.from], ms * 0.7, ms); }
      return Math.round(ms * 1.3);
    }
    function bubble(c, x, y, text, delay, dur, layer) {
      var w = Math.round(text.length * 5.1 + 12);
      x = Math.max(4, Math.min(596 - w, x - w / 2));
      var g = svg('g', { class: 'pj-bubble pj-L-' + (layer || 'app'), opacity: 0 });
      g.appendChild(svg('rect', { x: x, y: y - 12, width: w, height: 15, rx: 7 }));
      g.appendChild(svg('text', { x: x + w / 2, y: y - 1.5, 'text-anchor': 'middle' }, text));
      c.ghosts.appendChild(g);
      var a = A_(g, [{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }], { duration: dur, delay: delay, fill: 'both' });
      if (a) a.onfinish = function () { if (g.parentNode) g.parentNode.removeChild(g); };
      else g.parentNode.removeChild(g);
    }
    function animStack(c, prev, step, ms) {
      var cur = c.state, pst = prev && prev.phase === 'layers' ? stackState(prev) : null;
      var moveMs = Math.round(ms * 0.9), addMs = Math.round(ms * 0.7);
      var newA = c.anchor, prevLayout = pst ? barLayout(pst.count, pst.segs) : null, prevA = pst ? anchorOf(pst) : null;
      c.bars.forEach(function (g, i) {
        var nb = c.layout.bars[i], to = { x: newA.x + nb.x, y: newA.y + nb.y }, kf;
        if (!pst) kf = [{ opacity: 0, transform: 'translate(0px,-34px)' }, { opacity: 1, transform: 'translate(0px,0px)' }];
        else {
          var pb = prevLayout.bars[Math.min(i, prevLayout.bars.length - 1)], pts = [{ x: prevA.x + pb.x, y: prevA.y + pb.y }];
          if (pst.where === 'router' && cur.where === 'client') { var w4 = anchorOf({ where: 'client', level: 4 }); pts.push({ x: w4.x + nb.x, y: w4.y + nb.y }); }
          pts.push(to);
          kf = pts.map(function (p, k) { return { transform: 'translate(' + (p.x - to.x).toFixed(1) + 'px,' + (p.y - to.y).toFixed(1) + 'px)', opacity: k === 0 && pst.count !== cur.count ? 0.4 : 1 }; });
        }
        A_(g, kf, { duration: moveMs, easing: 'ease-in-out' });
      });
      var names = { tr: cur.udp ? 'UDP header' : 'TCP header', ip: 'IP header', eth: 'Ethernet header + trailer' }, said = [], bubbleLayer = null;
      ['tr', 'ip', 'eth'].forEach(function (k) {
        var was = pst ? !!pst.segs[k] : false, now = !!cur.segs[k];
        if (now && !was && pst && pst.where !== 'router' && cur.where !== 'client') {
          said.push('+ ' + names[k]); bubbleLayer = bubbleLayer || k;
          c.segEls.forEach(function (els) {
            [els[k], k === 'eth' ? els.fcs : null].forEach(function (r) { if (r) A_(r, [{ opacity: 0, transform: 'scale(0.1,1)' }, { opacity: 1, transform: 'scale(1,1)' }], { duration: addMs, delay: moveMs, easing: 'ease-out', fill: 'backwards' }); });
          });
        } else if (!now && was && cur.where === 'client') {
          said.push('− ' + names[k]); bubbleLayer = bubbleLayer || k;
          var pl = barLayout(pst.count, pst.segs);
          pl.bars.forEach(function (b) {
            b.segs.forEach(function (sg) {
              if (sg.k !== k && !(k === 'eth' && sg.k === 'fcs')) return;
              var r = svg('rect', { x: newA.x + sg.x, y: newA.y + b.y, width: sg.w, height: b.h, rx: 2, class: 'pj-sg pj-L-' + SEG_LAYER[sg.k], opacity: 0 });
              c.ghosts.appendChild(r);
              var a = A_(r, [{ opacity: 0, transform: 'translate(0px,0px)' }, { opacity: 1, transform: 'translate(0px,0px)', offset: 0.2 }, { opacity: 0, transform: 'translate(0px,-30px)' }], { duration: Math.round(addMs * 1.3), delay: moveMs, fill: 'both', easing: 'ease-in' });
              if (a) a.onfinish = function () { if (r.parentNode) r.parentNode.removeChild(r); }; else r.parentNode.removeChild(r);
            });
          });
        }
      });
      if (pst && cur.count !== pst.count) { said.push(cur.count > pst.count ? 'cut into ' + cur.count + (cur.udp ? ' fragments' : ' segments') : 'put back together'); bubbleLayer = bubbleLayer || (cur.udp ? 'ip' : 'tr'); }
      if (cur.where === 'router') {
        said.push('TTL − 1 · new MAC addresses'); bubbleLayer = 'rt';
        c.segEls.forEach(function (els) { if (els.eth) A_(els.eth, [{ opacity: 1 }, { opacity: 0.2 }, { opacity: 1 }, { opacity: 0.2 }, { opacity: 1 }], { duration: addMs * 1.5, delay: moveMs }); });
        pulse(c.rungs.router, moveMs * 0.6, ms);
      } else pulse(c.rungs[cur.where + cur.level], moveMs * 0.6, ms);
      if (!pst) { said.push('the HTTP message, nothing added yet'); bubbleLayer = 'app'; }
      else if (!said.length && cur.where === 'server' && cur.level === 4) {
        said.push('frame becomes bits on the wire'); bubbleLayer = 'phy';
        c.segEls.forEach(function (els) { if (els.bits) A_(els.bits, [{ opacity: 0 }, { opacity: 1 }], { duration: addMs, delay: moveMs, fill: 'backwards' }); });
      }
      /* the wire lights up in the physical layer's colour whenever the packets cross it */
      if (pst && pst.where !== cur.where && c.wireHot) A_(c.wireHot, [{ opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 1, offset: 0.75 }, { opacity: 0 }], { duration: moveMs + addMs, easing: 'linear' });
      if (said.length) bubble(c, newA.x + BARW / 2, newA.y - 2, said.join(' · '), moveMs, Math.round(addMs * 2), bubbleLayer);
      return moveMs + Math.round(addMs * 1.6);
    }
    function playIn(prev, step) {
      cancelAnims(); lastDur = 0;
      var ms = ms_();
      if (!ms || reduced() || !ctx || !Element.prototype.animate) return 0;
      lastDur = ctx.kind === 'map' ? animMap(ctx, step, ms) : animStack(ctx, prev, step, ms);
      if (auto.paused) anims.forEach(function (a) { try { a.pause(); } catch (e) {} });
      refreshPause();
      return lastDur;
    }
    function goTo(i, animate) {
      var prev = state.j.steps[state.i];
      state.i = i; render();
      if (animate) playIn(prev, state.j.steps[i]); else lastDur = 0;
      refreshPause();
    }

    /* ---- auto-play story + pause ---- */
    function holdMs() { var m = ms_(); return m ? Math.round(m * 0.8 + 700) : 450; }
    function schedule(ms) { clearTimeout(auto.timer); auto.due = Date.now() + ms; auto.timer = setTimeout(autoNext, ms); }
    function autoNext() {
      if (!auto.on || auto.paused) return;
      if (state.i >= state.j.steps.length - 1) { stopAuto(); return; }
      goTo(state.i + 1, true);
      schedule(lastDur + holdMs());
    }
    function startAuto() {
      if (!state.j) return;
      if (state.i >= state.j.steps.length - 1) goTo(0, false);
      auto.on = true; auto.paused = false; f.play.textContent = '■ Stop auto-play'; f.play.setAttribute('aria-pressed', 'true');
      schedule(ms_() ? 700 : 300); refreshPause();
    }
    function stopAuto() {
      auto.on = false; auto.paused = false; clearTimeout(auto.timer); auto.timer = null;
      if (f.play) { f.play.textContent = '▶ Auto-play story'; f.play.setAttribute('aria-pressed', 'false'); }
      anims.forEach(function (a) { try { if (a.playState === 'paused') a.play(); } catch (e) {} });
      refreshPause();
    }
    function animating() { return anims.some(function (a) { return a.playState === 'running' || a.playState === 'paused'; }); }
    function refreshPause() {
      if (!f.pause) return;
      f.pause.disabled = !(auto.on || animating());
      f.pause.textContent = auto.paused ? '▶ Resume' : '⏸ Pause';
      f.pause.setAttribute('aria-pressed', auto.paused ? 'true' : 'false');
    }
    function togglePause() {
      if (auto.paused) {
        auto.paused = false;
        anims.forEach(function (a) { try { if (a.playState === 'paused') a.play(); } catch (e) {} });
        if (auto.on) schedule(Math.max(50, auto.remain));
      } else {
        auto.paused = true;
        if (auto.on) { auto.remain = auto.due - Date.now(); clearTimeout(auto.timer); auto.timer = null; }
        anims.forEach(function (a) { try { a.pause(); } catch (e) {} });
      }
      refreshPause();
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
      LAYER_NAMES.forEach(function (n, k) { var li = el('li', 'pj-L-' + LAYER_IDS[k] + (k === lv ? ' on' : '')); li.textContent = n; ladder.appendChild(li); });
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
      cancelAnims();
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
