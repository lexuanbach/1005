/* Chapter 9 concept apps 9.4–9.6:  topology · addressing (IP bits, NAT, DNS walk) · layers.
   Engines (pure, Node-testable): NetApps.engines.Topo / Ip / Nat / Dns / Stack.  UI below is skipped when there is no document.
   Everything is a simulation: invented names (example.*) and RFC 5737 documentation addresses only. */
(function () {
  'use strict';
  var NA = (typeof window !== 'undefined' && window.NetApps) || require('./net-apps-core.js');
  var hasDom = typeof document !== 'undefined';

  /* ================================================================== ENGINES */

  /* ---------- Topo: star / bus / ring / mesh as graphs ---------- */
  var LETTERS = 'ABCDEFGH';
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function ellipse(i, n, cx, cy, rx, ry) {
    var a = -Math.PI / 2 + 2 * Math.PI * i / n;
    return { x: Math.round(cx + rx * Math.cos(a)), y: Math.round(cy + ry * Math.sin(a)) };
  }
  function toSet(x) {
    if (!x) return {};
    if (Array.isArray(x)) { var s = {}; x.forEach(function (k) { s[k] = true; }); return s; }
    return x;
  }
  function build(type, n, opts) {
    opts = opts || {};
    n = clamp(n | 0, 3, 8);
    var nodes = [], links = [], i, p;
    function host(i, x, y) { nodes.push({ id: 'h' + i, label: LETTERS.charAt(i), x: x, y: y, kind: 'host' }); }
    if (type === 'star') {
      nodes.push({ id: 'sw', label: 'switch', x: 320, y: 150, kind: 'switch' });
      for (i = 0; i < n; i++) {
        p = ellipse(i, n, 320, 150, 255, 108); host(i, p.x, p.y);
        links.push({ id: 'c' + i, a: 'h' + i, b: 'sw', kind: 'drop', label: 'cable ' + LETTERS.charAt(i) + '–switch' });
      }
    } else if (type === 'bus') {
      for (i = 0; i < n; i++) {
        var x = Math.round(70 + 500 * i / (n - 1));
        nodes.push({ id: 't' + i, label: '', x: x, y: 150, kind: 'tap' });
        host(i, x, i % 2 ? 245 : 55);
      }
      for (i = 0; i < n - 1; i++) links.push({ id: 's' + i, a: 't' + i, b: 't' + (i + 1), kind: 'trunk', label: 'backbone between ' + LETTERS.charAt(i) + ' and ' + LETTERS.charAt(i + 1) });
      for (i = 0; i < n; i++) links.push({ id: 'd' + i, a: 't' + i, b: 'h' + i, kind: 'drop', label: 'drop cable ' + LETTERS.charAt(i) });
    } else if (type === 'ring') {
      for (i = 0; i < n; i++) { p = ellipse(i, n, 320, 150, 240, 105); host(i, p.x, p.y); }
      for (i = 0; i < n; i++) {
        var j = (i + 1) % n;
        var l = { id: 'r' + i, a: 'h' + i, b: 'h' + j, kind: 'trunk', label: 'cable ' + LETTERS.charAt(i) + (opts.oneWay ? '→' : '–') + LETTERS.charAt(j) };
        if (opts.oneWay) l.dir = 'one';
        links.push(l);
      }
    } else if (type === 'mesh') {
      for (i = 0; i < n; i++) { p = ellipse(i, n, 320, 150, 245, 105); host(i, p.x, p.y); }
      for (i = 0; i < n; i++) for (var k = i + 1; k < n; k++) links.push({ id: 'm' + i + '-' + k, a: 'h' + i, b: 'h' + k, kind: 'trunk', label: 'cable ' + LETTERS.charAt(i) + '–' + LETTERS.charAt(k) });
    } else throw new Error('unknown topology ' + type);
    return { type: type, n: n, nodes: nodes, links: links, oneWay: !!opts.oneWay };
  }
  /* ids reachable from `from` over cables that still work, through devices that still work */
  function reach(topo, from, brokenLinks, brokenNodes) {
    var bl = toSet(brokenLinks), bn = toSet(brokenNodes), adj = {}, seen = {}, out = [], q = [from];
    if (bn[from]) return [];
    topo.nodes.forEach(function (nd) { adj[nd.id] = []; });
    topo.links.forEach(function (l) {
      if (bl[l.id] || bn[l.a] || bn[l.b]) return;
      adj[l.a].push(l.b);
      if (l.dir !== 'one') adj[l.b].push(l.a);
    });
    seen[from] = true;
    while (q.length) {
      var c = q.shift(); out.push(c);
      adj[c].forEach(function (d) { if (!seen[d]) { seen[d] = true; q.push(d); } });
    }
    return out;
  }
  function aliveHosts(topo, bn) { bn = toSet(bn); return topo.nodes.filter(function (nd) { return nd.kind === 'host' && !bn[nd.id]; }); }
  function cutOff(topo, from, bl, bn) {
    var r = {}; reach(topo, from, bl, bn).forEach(function (k) { r[k] = true; });
    return aliveHosts(topo, bn).filter(function (h) { return !r[h.id]; }).map(function (h) { return h.id; });
  }
  /* can every working PC reach every other working PC? */
  function allConnected(topo, bl, bn) {
    var hs = aliveHosts(topo, bn);
    for (var i = 0; i < hs.length; i++) if (cutOff(topo, hs[i].id, bl, bn).length) return false;
    return true;
  }
  /* shared parts whose single failure leaves some working PCs unable to talk (a PC's own cable only isolates that PC, so it is not "shared") */
  function spof(topo) {
    var out = [];
    topo.links.forEach(function (l) {
      if (l.kind !== 'trunk') return;
      var b = {}; b[l.id] = true;
      if (!allConnected(topo, b, {})) out.push({ type: 'link', id: l.id, label: l.label });
    });
    topo.nodes.forEach(function (nd) {
      if (nd.kind === 'tap') return;
      var b = {}; b[nd.id] = true;
      if (!allConnected(topo, {}, b)) out.push({ type: 'node', id: nd.id, label: nd.kind === 'switch' ? 'the switch' : 'PC ' + nd.label });
    });
    return out;
  }
  function cableCount(type, n) {
    n = clamp(n | 0, 3, 8);
    if (type === 'star') return { total: n, formula: 'n = ' + n };
    if (type === 'bus') return { total: 2 * n - 1, formula: n + ' drops + ' + (n - 1) + ' backbone pieces' };
    if (type === 'ring') return { total: n, formula: 'n = ' + n };
    if (type === 'mesh') return { total: n * (n - 1) / 2, formula: 'n(n−1)/2 = ' + n + '×' + (n - 1) + '/2' };
    throw new Error('unknown topology ' + type);
  }
  var Topo = { build: build, reach: reach, cutOff: cutOff, allConnected: allConnected, spof: spof, cableCount: cableCount };

  /* ---------- Ip: IPv4 as 32 bits ---------- */
  function parseIPv4(s) {
    var m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(s).trim());
    if (!m) return null;
    var v = 0;
    for (var i = 1; i <= 4; i++) {
      if (m[i].length > 1 && m[i].charAt(0) === '0') return null;
      var o = parseInt(m[i], 10);
      if (o > 255) return null;
      v = v * 256 + o;
    }
    return v >>> 0;
  }
  function ipStr(v) { return [v >>> 24, (v >>> 16) & 255, (v >>> 8) & 255, v & 255].join('.'); }
  function toBits(v) { var s = (v >>> 0).toString(2); while (s.length < 32) s = '0' + s; return s; }
  function maskOf(prefix) { return prefix <= 0 ? 0 : ((0xFFFFFFFF << (32 - prefix)) >>> 0); }
  function inRange(v, base, bits) { var m = maskOf(bits); return ((v & m) >>> 0) === ((base & m) >>> 0); }
  function classify(v) {
    var P = parseIPv4;
    if (inRange(v, P('127.0.0.0'), 8)) return { kind: 'loopback', label: 'loopback — this very computer (localhost)' };
    if (inRange(v, P('10.0.0.0'), 8) || inRange(v, P('172.16.0.0'), 12) || inRange(v, P('192.168.0.0'), 16)) return { kind: 'private', label: 'private — works only inside one LAN, never routed on the Internet' };
    if (inRange(v, P('169.254.0.0'), 16)) return { kind: 'link-local', label: 'link-local — self-assigned when no DHCP server answers' };
    if (inRange(v, P('192.0.2.0'), 24) || inRange(v, P('198.51.100.0'), 24) || inRange(v, P('203.0.113.0'), 24)) return { kind: 'documentation', label: 'documentation range (RFC 5737) — reserved for examples like this one' };
    if (inRange(v, P('224.0.0.0'), 4)) return { kind: 'multicast', label: 'multicast — one packet for a whole group' };
    if (inRange(v, P('0.0.0.0'), 8) || inRange(v, P('240.0.0.0'), 4)) return { kind: 'reserved', label: 'reserved — not for ordinary hosts' };
    return { kind: 'public', label: 'public — unique on the Internet, handed out by an ISP' };
  }
  function subnetInfo(v, prefix) {
    var mask = maskOf(prefix), net = (v & mask) >>> 0, bc = (net | (~mask >>> 0)) >>> 0, hb = 32 - prefix;
    var hosts = prefix <= 30 ? Math.pow(2, hb) - 2 : (prefix === 31 ? 2 : 1);
    return { ip: v >>> 0, prefix: prefix, mask: mask, network: net, broadcast: bc, hostBits: hb, hosts: hosts,
      first: prefix <= 30 ? net + 1 : net, last: prefix <= 30 ? bc - 1 : bc, kind: classify(v) };
  }
  function sameSubnet(a, b, prefix) {
    var x = ((a ^ b) >>> 0), first = -1;
    var bits = toBits(x);
    for (var i = 0; i < prefix; i++) if (bits.charAt(i) === '1') { first = i; break; }
    return { same: first === -1, firstDiffBit: first, diffMask: x };
  }
  var Ip = { parseIPv4: parseIPv4, ipStr: ipStr, toBits: toBits, maskOf: maskOf, classify: classify, subnetInfo: subnetInfo, sameSubnet: sameSubnet };

  /* ---------- Nat: the router's translation table ---------- */
  function Nat(opts) {
    opts = opts || {};
    this.publicIp = opts.publicIp || '203.0.113.34';
    this.nextPort = opts.startPort || 62000;
    this.table = [];
  }
  Nat.prototype.outbound = function (src, dst) {
    var e = null;
    this.table.forEach(function (t) {
      if (t.priv.ip === src.ip && t.priv.port === src.port && t.remote.ip === dst.ip && t.remote.port === dst.port) e = t;
    });
    var isNew = !e;
    if (!e) { e = { priv: { ip: src.ip, port: src.port }, remote: { ip: dst.ip, port: dst.port }, pubPort: this.nextPort++ }; this.table.push(e); }
    return { packet: { src: { ip: this.publicIp, port: e.pubPort }, dst: { ip: dst.ip, port: dst.port } }, entry: e, isNew: isNew };
  };
  Nat.prototype.inbound = function (pkt) {
    if (pkt.dst.ip !== this.publicIp) return { dropped: true, reason: 'that packet is not addressed to this router' };
    var e = null;
    this.table.forEach(function (t) {
      if (t.pubPort === pkt.dst.port && t.remote.ip === pkt.src.ip && t.remote.port === pkt.src.port) e = t;
    });
    if (!e) return { dropped: true, reason: 'no table row for port ' + pkt.dst.port + ' from ' + pkt.src.ip + ':' + pkt.src.port };
    return { dropped: false, entry: e, packet: { src: { ip: pkt.src.ip, port: pkt.src.port }, dst: { ip: e.priv.ip, port: e.priv.port } } };
  };

  /* ---------- Dns: a recursive resolver with a cache and a simulated clock ---------- */
  var DNS = {
    client: '192.0.2.100', resolver: '192.0.2.53', root: '198.51.100.1',
    tld: { com: '198.51.100.2', org: '198.51.100.3', net: '198.51.100.4' },
    ttl: { tldNs: 172800, domainNs: 86400, a: 300 },
    zones: {
      'example.com': { ns: 'ns1.example.com', ip: '203.0.113.53', records: { 'example.com': '203.0.113.10', 'www.example.com': '203.0.113.10', 'blog.example.com': '203.0.113.11' } },
      'example.org': { ns: 'ns1.example.org', ip: '203.0.113.54', records: { 'example.org': '198.51.100.20', 'www.example.org': '198.51.100.20' } },
      'example.net': { ns: 'ns1.example.net', ip: '203.0.113.55', records: { 'api.example.net': '203.0.113.7' } }
    }
  };
  var FULL_WALK = 8;                       // messages of a cold, successful lookup
  function Resolver() { this.now = 0; this.cache = {}; this.totalMessages = 0; this.totalSaved = 0; this.lookups = 0; }
  Resolver.prototype.put = function (key, info, ttl) { this.cache[key] = { key: key, type: info.type, name: info.name, value: info.value, ttlTotal: ttl, expires: this.now + ttl }; };
  Resolver.prototype.get = function (key) { var e = this.cache[key]; return e && e.expires > this.now ? e : null; };
  Resolver.prototype.advance = function (sec) {
    this.now += sec;
    for (var k in this.cache) if (this.cache[k].expires <= this.now) delete this.cache[k];
  };
  Resolver.prototype.flush = function () { this.cache = {}; };
  Resolver.prototype.cacheEntries = function () {
    var now = this.now, rank = { 'NS-tld': 0, 'NS-domain': 1, 'A': 2 };
    return Object.keys(this.cache).map(function (k) { var e = this.cache[k]; return { key: e.key, type: e.type, name: e.name, value: e.value, ttlTotal: e.ttlTotal, ttlLeft: e.expires - now }; }, this)
      .filter(function (e) { return e.ttlLeft > 0; })
      .sort(function (a, b) { return rank[a.type] - rank[b.type] || (a.name < b.name ? -1 : 1); });
  };
  Resolver.prototype.resolve = function (raw) {
    var name = String(raw || '').trim().toLowerCase().replace(/\.$/, '');
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(name)) return { name: name, invalid: true, steps: [], messages: 0, saved: 0 };
    var labels = name.split('.'), tld = labels[labels.length - 1], dom = labels.slice(-2).join('.');
    var steps = [], self = this;
    function msg(from, to, text, short) { steps.push({ kind: 'msg', from: from, to: to, text: text, short: short || text }); }
    function local(text) { steps.push({ kind: 'local', from: 'resolver', to: 'resolver', text: text, short: 'cache' }); }
    function done(res) {
      res.name = name; res.steps = steps;
      res.messages = steps.filter(function (s) { return s.kind === 'msg'; }).length;
      res.saved = res.answer ? FULL_WALK - res.messages : 0;
      self.lookups++; self.totalMessages += res.messages; self.totalSaved += res.saved;
      return res;
    }
    function nx(from, why) {
      msg(from, 'resolver', 'NXDOMAIN — ' + why, 'NXDOMAIN: no such name');
      msg('resolver', 'client', 'NXDOMAIN — ' + name + ' does not exist', 'NXDOMAIN');
      return done({ answer: null, nxdomain: true, fromCache: false });
    }
    msg('client', 'resolver', 'What is the IP address of ' + name + '?', 'IP of ' + name + '?');
    var hitA = this.get('A:' + name);
    if (hitA) {
      local('Cache hit: ' + name + ' = ' + hitA.value + ' (still valid for ' + (hitA.expires - this.now) + ' s)');
      msg('resolver', 'client', name + ' is ' + hitA.value + ' (from the cache)', hitA.value);
      return done({ answer: hitA.value, nxdomain: false, fromCache: true });
    }
    local('Cache miss for ' + name + ' — the resolver must ask around.');
    var haveDom = this.get('NS:' + dom), haveTld = this.get('NS:' + tld);
    if (haveDom) local('…but it still remembers who runs ' + dom + ' (' + haveDom.value + '), so root and .' + tld + ' are skipped.');
    else if (haveTld) local('…but it still remembers the .' + tld + ' servers, so the root is skipped.');
    if (!haveDom) {
      if (!haveTld) {
        msg('resolver', 'root', 'Who handles .' + tld + ' names?', 'who runs .' + tld + '?');
        if (!DNS.tld[tld]) return nx('root', 'there is no top-level domain “.' + tld + '”');
        msg('root', 'resolver', 'Ask the .' + tld + ' servers at ' + DNS.tld[tld], 'ask .' + tld + ' @ ' + DNS.tld[tld]);
        this.put('NS:' + tld, { type: 'NS-tld', name: '.' + tld, value: '.' + tld + ' servers @ ' + DNS.tld[tld] }, DNS.ttl.tldNs);
      }
      msg('resolver', 'tld', 'Who handles ' + dom + '?', 'who runs ' + dom + '?');
      var z = DNS.zones[dom];
      if (!z) return nx('tld', 'the .' + tld + ' servers have no domain called ' + dom);
      msg('tld', 'resolver', 'Ask ' + z.ns + ' at ' + z.ip, 'ask ' + z.ns);
      this.put('NS:' + dom, { type: 'NS-domain', name: dom, value: z.ns + ' @ ' + z.ip }, DNS.ttl.domainNs);
    }
    var zone = DNS.zones[dom];
    msg('resolver', 'auth', 'What is the address of ' + name + '?', 'address of ' + name + '?');
    var ip = zone.records[name];
    if (!ip) return nx('auth', zone.ns + ' knows the domain ' + dom + ' but has no host called ' + name);
    msg('auth', 'resolver', name + ' is ' + ip + ' (keep it for ' + DNS.ttl.a + ' s)', ip);
    this.put('A:' + name, { type: 'A', name: name, value: ip }, DNS.ttl.a);
    msg('resolver', 'client', name + ' is ' + ip, ip);
    return done({ answer: ip, nxdomain: false, fromCache: false });
  };
  var Dns = { DNS: DNS, Resolver: Resolver, FULL_WALK: FULL_WALK };

  /* ---------- Stack: encapsulation with real bytes, a real CRC-32 and real Internet checksums ---------- */
  function utf8(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.codePointAt(i); if (c > 0xffff) i++;
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }
  function fromUtf8(bytes) {
    var s = '', i = 0;
    while (i < bytes.length) {
      var b = bytes[i++], c;
      if (b < 0x80) c = b;
      else if (b >= 0xf0) { c = ((b & 7) << 18) | ((bytes[i++] & 63) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63); }
      else if (b >= 0xe0) { c = ((b & 15) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63); }
      else if (b >= 0xc0) { c = ((b & 31) << 6) | (bytes[i++] & 63); }
      else c = 0xfffd;
      s += String.fromCodePoint(c);
    }
    return s;
  }
  var CRC_TABLE = null;
  function crc32(data) {
    var bytes = typeof data === 'string' ? utf8(data) : data;
    if (!CRC_TABLE) {
      CRC_TABLE = [];
      for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); CRC_TABLE[n] = c >>> 0; }
    }
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function inetChecksum(bytes) {
    var sum = 0;
    for (var i = 0; i < bytes.length; i += 2) sum += (bytes[i] << 8) | (i + 1 < bytes.length ? bytes[i + 1] : 0);
    while (sum >>> 16) sum = (sum & 0xffff) + (sum >>> 16);
    return (~sum) & 0xffff;
  }
  function be16(v) { return [(v >> 8) & 255, v & 255]; }
  function be32(v) { return [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]; }
  function le32(v) { return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]; }
  function ipBytes(s) { return s.split('.').map(Number); }
  function macBytes(s) { return s.split(':').map(function (h) { return parseInt(h, 16); }); }
  function hex(n, w) { var s = (n >>> 0).toString(16).toUpperCase(); while (s.length < w) s = '0' + s; return s; }
  var SIM = { srcIp: '192.0.2.100', dstIp: '203.0.113.10', srcMac: '02:00:c0:00:02:64', dstMac: '02:00:cb:00:71:0a', srcPort: 50001, dstPort: { tcp: 80, udp: 5004 } };

  function encapsulate(o) {
    o = o || {};
    var proto = o.proto === 'udp' ? 'udp' : 'tcp';
    var srcIp = o.srcIp || SIM.srcIp, dstIp = o.dstIp || SIM.dstIp, srcMac = o.srcMac || SIM.srcMac, dstMac = o.dstMac || SIM.dstMac;
    var srcPort = o.srcPort || SIM.srcPort, dstPort = o.dstPort || SIM.dstPort[proto];
    var msg = o.msg == null ? 'Hello' : String(o.msg);
    var payload = utf8(msg), pn = proto === 'tcp' ? 6 : 17;
    // transport
    var seg, tFields;
    function pseudo(len) { return ipBytes(srcIp).concat(ipBytes(dstIp), [0, pn], be16(len)); }
    if (proto === 'tcp') {
      var seq = 1000, ack = 5000, flags = 0x18;
      var h = be16(srcPort).concat(be16(dstPort), be32(seq), be32(ack), be16((5 << 12) | flags), be16(65535), [0, 0], [0, 0]);
      var ck = inetChecksum(pseudo(20 + payload.length).concat(h, payload));
      h[16] = ck >> 8; h[17] = ck & 255;
      seg = h.concat(payload);
      tFields = [['Source port', srcPort + '  (your browser’s end)'], ['Destination port', dstPort + '  (the web server program)'], ['Sequence number', seq + '  (numbers the bytes, so gaps are noticed)'], ['Acknowledgement', ack + '  (what I have received from you)'], ['Flags', 'PSH, ACK'], ['Window', '65535  (flow control: how much I can take)'], ['Checksum', '0x' + hex(ck, 4)]];
    } else {
      var uh = be16(srcPort).concat(be16(dstPort), be16(8 + payload.length), [0, 0]);
      var uck = inetChecksum(pseudo(8 + payload.length).concat(uh, payload)) || 0xffff;
      uh[6] = uck >> 8; uh[7] = uck & 255;
      seg = uh.concat(payload);
      tFields = [['Source port', srcPort], ['Destination port', dstPort + '  (a call or game program)'], ['Length', 8 + payload.length + ' bytes'], ['Checksum', '0x' + hex(uck, 4)]];
    }
    var thLen = seg.length - payload.length;
    // internet
    var ih = [0x45, 0x00].concat(be16(20 + seg.length), be16(0x1c46), be16(0x4000), [64, pn], [0, 0], ipBytes(srcIp), ipBytes(dstIp));
    var ick = inetChecksum(ih); ih[10] = ick >> 8; ih[11] = ick & 255;
    var packet = ih.concat(seg);
    // link
    var eh = macBytes(dstMac).concat(macBytes(srcMac), [0x08, 0x00]);
    var body = eh.concat(packet), fcs = crc32(body);
    var frame = body.concat(le32(fcs));
    var iFields = [['Version / header length', '4 / 20 bytes'], ['Total length', packet.length + ' bytes'], ['Time to live', '64  (each router subtracts 1)'], ['Protocol', pn + '  (' + proto.toUpperCase() + ' is inside)'], ['Header checksum', '0x' + hex(ick, 4)], ['Source IP', srcIp], ['Destination IP', dstIp]];
    var eFields = [['Destination MAC', dstMac + '  (the next device on this link)'], ['Source MAC', srcMac + '  (my network card)'], ['Type', '0x0800  (an IPv4 packet follows)']];
    var total = frame.length;
    var layers = [
      { id: 'app', name: 'Application', unit: 'message', size: payload.length, header: null },
      { id: 'transport', name: 'Transport', unit: 'segment', size: seg.length, header: { id: 'tr', name: proto.toUpperCase() + ' header', size: thLen, fields: tFields } },
      { id: 'internet', name: 'Internet', unit: 'packet', size: packet.length, header: { id: 'ip', name: 'IP header', size: 20, fields: iFields } },
      { id: 'link', name: 'Network interface', unit: 'frame', size: frame.length, header: { id: 'eth', name: 'Ethernet header', size: 14, fields: eFields },
        trailer: { id: 'fcs', name: 'FCS', size: 4, fields: [['CRC-32', '0x' + hex(fcs, 8)], ['Covers', 'all ' + body.length + ' bytes before it']] } }
    ];
    return { proto: proto, msg: msg, payload: payload, segment: seg, packet: packet, frame: frame, fcs: fcs, layers: layers, total: total,
      overheadBytes: total - payload.length, overheadPct: total ? (total - payload.length) / total * 100 : 0,
      offsets: { eth: [0, 14], ip: [14, 34], tr: [34, 34 + thLen], data: [34 + thLen, total - 4], fcs: [total - 4, total] },
      ctx: { srcIp: srcIp, dstIp: dstIp, srcMac: srcMac, dstMac: dstMac, srcPort: srcPort, dstPort: dstPort } };
  }
  function flipBit(frame, byteIndex, bit) { var c = frame.slice(); c[byteIndex] ^= 1 << (bit || 0); return c; }
  /* the receiver: each layer checks and removes only its own header; stops at the first failure */
  function decapsulate(frame, o) {
    o = o || {};
    var myMac = o.myMac || SIM.dstMac, myIp = o.myIp || SIM.dstIp, port = o.port;
    var steps = [], n = frame.length;
    function fail(layer, looked, did) { steps.push({ layer: layer, ok: false, looked: looked, did: did }); return { steps: steps, delivered: false, failedAt: layer, message: null }; }
    function ok(layer, looked, did) { steps.push({ layer: layer, ok: true, looked: looked, did: did }); }
    if (n < 18 + 20) return fail('link', 'the frame length', 'Only ' + n + ' bytes: too short to be a frame. Discarded.');
    var stored = (frame[n - 4] | (frame[n - 3] << 8) | (frame[n - 2] << 16) | (frame[n - 1] << 24)) >>> 0;
    var calc = crc32(frame.slice(0, n - 4));
    if (stored !== calc) return fail('link', 'the 4-byte FCS at the end and every byte before it',
      'Recomputed CRC-32 = 0x' + hex(calc, 8) + ' but the FCS says 0x' + hex(stored, 8) + ' → the frame was damaged on the wire. Discarded without a word.');
    var dmac = frame.slice(0, 6).map(function (b) { return hex(b, 2); }).join(':').toLowerCase();
    if (dmac !== myMac.toLowerCase()) return fail('link', 'the destination MAC', 'Destination MAC ' + dmac + ' is not mine (' + myMac + '). Ignored.');
    ok('link', 'the FCS and the destination MAC', 'CRC-32 matches (0x' + hex(stored, 8) + ') and the destination MAC is mine → strip the 14-byte Ethernet header and 4-byte FCS, pass the packet up.');
    var ip = frame.slice(14, n - 4);
    if ((ip[0] >> 4) !== 4) return fail('internet', 'the version field', 'Not IPv4. Dropped.');
    var ihl = (ip[0] & 15) * 4;
    if (inetChecksum(ip.slice(0, ihl)) !== 0) return fail('internet', 'the IP header checksum', 'Header checksum does not add up. Dropped.');
    var dst = ip.slice(16, 20).join('.');
    if (dst !== myIp) return fail('internet', 'the destination IP', 'Destination ' + dst + ' is not me (' + myIp + '). A host would drop it; a router would forward it.');
    var pr = ip[9];
    ok('internet', 'the destination IP and the protocol number', 'Destination IP ' + dst + ' is me; protocol ' + pr + ' = ' + (pr === 6 ? 'TCP' : pr === 17 ? 'UDP' : '?') + ' → strip the 20-byte IP header, hand the segment to ' + (pr === 6 ? 'TCP' : 'UDP') + '.');
    var seg = ip.slice(ihl);
    var p = pr === 6 ? 6 : 17;
    var pseudo = ip.slice(12, 20).concat([0, p], be16(seg.length));
    var cks = inetChecksum(pseudo.concat(seg));
    if (cks !== 0) return fail('transport', 'the ' + (p === 6 ? 'TCP' : 'UDP') + ' checksum over header + data', 'Checksum does not add up → data damaged. Segment dropped.');
    var dport = (seg[2] << 8) | seg[3], hl = p === 6 ? ((seg[12] >> 4) * 4) : 8;
    ok('transport', 'the destination port and checksum', 'Checksum ok; destination port ' + dport + ' → deliver to the program listening there' + (p === 6 ? ' (and send an ACK back)' : ' (no acknowledgement, no promise)') + '. Strip the ' + hl + '-byte header.');
    var data = seg.slice(hl);
    var text = fromUtf8(data);
    ok('app', 'the data itself', 'Receives “' + text + '” (' + data.length + ' bytes) — exactly what was sent.');
    return { steps: steps, delivered: true, failedAt: null, message: text };
  }
  var Stack = { encapsulate: encapsulate, decapsulate: decapsulate, crc32: crc32, inetChecksum: inetChecksum, flipBit: flipBit, hex: hex, utf8: utf8, SIM: SIM };

  NA.engines.Topo = Topo; NA.engines.Ip = Ip; NA.engines.Nat = Nat; NA.engines.Dns = Dns; NA.engines.Stack = Stack;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Topo: Topo, Ip: Ip, Nat: Nat, Dns: Dns, Stack: Stack };
  }
  if (!hasDom) return;

  /* ================================================================== UI ================================================================== */
  var el = NA.el, svg = NA.svg, html = NA.html;

  function sayList(ids, label) { return ids.length ? ids.map(label).join(', ') : ''; }
  function centre(stage) { try { requestAnimationFrame(function () { stage.scrollLeft = Math.max(0, (stage.scrollWidth - stage.clientWidth) / 2); }); } catch (e) { /* ignore */ } }
  function keyAct(node, fn) {
    node.setAttribute('tabindex', '0'); node.setAttribute('role', 'button');
    node.addEventListener('click', fn);
    node.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(e); } });
  }

  /* ---------------------------------------------------------------- 9.4 topology */
  var WHY = {
    star: 'In a <b>star</b> every PC has its own cable to the switch: a broken cable isolates only that PC — but the switch is shared by everyone.',
    bus: 'In a <b>bus</b> everybody shares one backbone cable, so a break splits it into two halves that cannot hear each other.',
    ringOne: 'In a <b>one-way ring</b> messages only travel round in one direction, so one break stops the loop for everybody.',
    ringTwo: 'In a <b>two-way (dual) ring</b> a message can go the other way round, so one break changes nothing.',
    mesh: 'In a <b>mesh</b> there are many alternative paths, so a few failures are routed around — the price is the number of cables.'
  };
  var TIPS = {
    star: 'Try this: click the switch — then click just one cable.',
    bus: 'Try this: cut a backbone piece in the middle, then cut a drop cable.',
    ring: 'Try this: break one cable, then flip the ring between one-way and two-way.',
    mesh: 'Try this: break four of A’s cables and see who is still connected; then raise the PC count and watch the cable count.'
  };

  NA.register('topology', {
    title: 'Break it and see who survives',
    hint: 'Click a cable or a device to break it. Green = still reachable from your computer, red = cut off.',
    build: function (host, NA, node) {
      node.classList.add('na-topology');
      var st = { type: 'star', n: 6, oneWay: true, bl: {}, bn: {}, me: 'h0', mode: 'break', topo: null };
      var typeSeg = NA.segmented([{ value: 'star', label: '★ Star' }, { value: 'bus', label: '▬ Bus' }, { value: 'ring', label: '◯ Ring' }, { value: 'mesh', label: '⬡ Mesh' }], 'star', function (v) { st.type = v; reset(); say(WHY[whyKey()] + ' ' + TIPS[v]); }, 'Topology');
      var nSl = NA.slider('PCs', 4, 8, 1, 6, null, function (v) { st.n = v; reset(); say('With <b>' + v + '</b> PCs this ' + st.type + ' needs <b>' + Topo.cableCount(st.type, v).total + '</b> cable runs (' + Topo.cableCount(st.type, v).formula + ').'); });
      var dirSeg = NA.segmented([{ value: 'one', label: 'One-way (token ring)' }, { value: 'two', label: 'Two-way (dual ring)' }], 'one', function (v) { st.oneWay = v === 'one'; reset(); say(WHY[whyKey()]); }, 'Ring direction');
      var dirField = el('div', 'na-field'); dirField.appendChild(el('span', 'na-lab', 'Ring direction')); dirField.appendChild(dirSeg.wrap);
      var meSel = NA.select([], null, function (v) { st.me = v; render(); say('Now you are sitting at <b>' + labelOf(v) + '</b>. Green shows what ' + labelOf(v) + ' can still reach.'); });
      var modeSeg = NA.segmented([{ value: 'break', label: '✂ Break / repair' }, { value: 'pick', label: '☝ Pick my PC' }], 'break', function (v) { st.mode = v; }, 'What a click on a PC does');
      var rndBtn = NA.button('✂ Break a random cable', 'danger', function () {
        var open = st.topo.links.filter(function (l) { return !st.bl[l.id]; });
        if (!open.length) { say('Every cable is already broken.'); return; }
        var l = open[Math.floor(Math.random() * open.length)]; st.bl[l.id] = true; render(); say(describe('You cut the <b>' + l.label + '</b>.'));
      });
      var fixBtn = NA.button('Repair all', '', function () { st.bl = {}; st.bn = {}; render(); say(describe('Everything repaired.')); });
      var c1 = el('div', 'na-controls'); c1.appendChild(NA.field('Topology', typeSeg.wrap)); c1.appendChild(nSl.wrap); c1.appendChild(dirField);
      var c2 = el('div', 'na-controls'); c2.appendChild(NA.field('My computer', meSel)); c2.appendChild(NA.field('Clicking a PC…', modeSeg.wrap)); c2.appendChild(rndBtn); c2.appendChild(fixBtn);
      var chips = el('div', 'na-chips'); chips.appendChild(el('span', 'na-lab', 'Scenarios'));
      function scenario(label, fn) { chips.appendChild(NA.chip(label, function () { fn(); render(); })); }
      scenario('Switch off the switch', function () { setType('star', 6, true); st.bn.sw = true; say(describe('You switched the <b>switch</b> off.')); });
      scenario('Cut the middle of the bus', function () { setType('bus', 6, true); st.bl.s2 = true; say(describe('You cut the <b>' + linkLabel('s2') + '</b>.')); });
      scenario('Break one ring cable (one-way)', function () { setType('ring', 6, true); st.bl.r1 = true; say(describe('You cut the <b>' + linkLabel('r1') + '</b>.')); });
      scenario('…same break, two-way ring', function () { setType('ring', 6, false); st.bl.r1 = true; say(describe('You cut the <b>' + linkLabel('r1') + '</b>.')); });
      scenario('Cut 4 of A’s cables in a mesh', function () { setType('mesh', 6, true); ['m0-1', 'm0-2', 'm0-3', 'm0-4'].forEach(function (k) { st.bl[k] = true; }); say(describe('You cut four of <b>A</b>’s five cables.')); });
      var tip = el('p', 'na-tip');
      var stage = el('div', 'na-stage'), stageSvg = svg('svg', { viewBox: '0 0 640 300', role: 'group', 'aria-label': 'Network diagram. Use Tab to move between cables and devices, Enter to break or repair.' }, stage);
      var sCable = NA.stat('Cable runs'), sAll = NA.stat('Everyone can still talk?'), sSpof = NA.stat('Single points of failure');
      var stats = el('div', 'na-stats'); [sCable, sAll, sSpof].forEach(function (s) { stats.appendChild(s.node); });
      var nar = NA.narrator(); nar.node.classList.add('na-say-tall');
      [c1, c2, chips, tip, stage, el('div', 'na-key', [
        html('span', '', '<i style="--c:var(--green)"></i>reachable from you ✓'), html('span', '', '<i style="--c:var(--red)"></i>cut off ✗'), html('span', '', '<i style="--c:var(--ink-soft)"></i>device switched off'), html('span', '', '✂ broken cable')]),
        stats, nar.node].forEach(function (x) { host.appendChild(x); });

      function whyKey() { return st.type === 'ring' ? (st.oneWay ? 'ringOne' : 'ringTwo') : st.type; }
      function say(m) { nar.say(m); }
      function nodeById(id) { for (var i = 0; i < st.topo.nodes.length; i++) if (st.topo.nodes[i].id === id) return st.topo.nodes[i]; return null; }
      function labelOf(id) { var nd = nodeById(id); return nd ? (nd.kind === 'switch' ? 'the switch' : 'PC ' + nd.label) : id; }
      function linkLabel(id) { for (var i = 0; i < st.topo.links.length; i++) if (st.topo.links[i].id === id) return st.topo.links[i].label; return id; }
      function setType(t, n, oneWay) { st.type = t; st.n = n; st.oneWay = oneWay; typeSeg.set(t); nSl.set(n); dirSeg.set(oneWay ? 'one' : 'two'); reset(true); }
      function reset(keepMe) {
        st.topo = Topo.build(st.type, st.n, { oneWay: st.oneWay });
        st.bl = {}; st.bn = {};
        var hosts = st.topo.nodes.filter(function (x) { return x.kind === 'host'; });
        NA.clear(meSel);
        hosts.forEach(function (h) { var o = el('option', null, 'PC ' + h.label); o.value = h.id; meSel.appendChild(o); });
        if (!hosts.some(function (h) { return h.id === st.me; })) st.me = 'h0';
        meSel.value = st.me;
        dirField.style.display = st.type === 'ring' ? '' : 'none';
        tip.textContent = TIPS[st.type];
        render();
      }
      function info() {
        var r = Topo.reach(st.topo, st.me, st.bl, st.bn), set = {}; r.forEach(function (k) { set[k] = true; });
        var cut = Topo.cutOff(st.topo, st.me, st.bl, st.bn);
        return { reach: r, set: set, cut: cut };
      }
      function describe(what) {
        var i = info(), others = i.reach.filter(function (k) { var nd = nodeById(k); return nd.kind === 'host' && k !== st.me; });
        var t = '<b>' + what + '</b> ';
        if (st.bn[st.me]) t += 'Your own PC is off, so nothing can be reached from it. ';
        else {
          t += 'From <b>' + labelOf(st.me) + '</b> you can still reach ' + (others.length ? '<b>' + others.map(function (k) { return nodeById(k).label; }).join(', ') + '</b>' : '<b>nobody</b>') + '. ';
          t += i.cut.length ? '<span class="bad">Cut off: ' + i.cut.map(function (k) { return nodeById(k).label; }).join(', ') + '.</span> ' : '<span class="ok">Nobody is cut off.</span> ';
        }
        return t + WHY[whyKey()];
      }
      function toggleLink(id) {
        if (st.bl[id]) { delete st.bl[id]; render(); say(describe('You repaired the ' + linkLabel(id) + '.')); }
        else { st.bl[id] = true; render(); say(describe('You cut the ' + linkLabel(id) + '.')); }
      }
      function clickNode(id) {
        var nd = nodeById(id);
        if (nd.kind === 'host' && st.mode === 'pick') { st.me = id; meSel.value = id; render(); say('Now you are sitting at <b>PC ' + nd.label + '</b>. Green shows what PC ' + nd.label + ' can still reach.'); return; }
        if (st.bn[id]) { delete st.bn[id]; render(); say(describe('You switched ' + labelOf(id) + ' back on.')); }
        else { st.bn[id] = true; render(); say(describe('You switched ' + labelOf(id) + ' off.')); }
      }
      function render() {
        var ae = document.activeElement, fid = ae && stage.contains(ae) ? ae.getAttribute('data-id') : null;
        NA.clear(stageSvg);
        var t = st.topo, inf = info(), P = {};
        t.nodes.forEach(function (nd) { P[nd.id] = nd; });
        // cables
        t.links.forEach(function (l) {
          var a = P[l.a], b = P[l.b], broken = !!st.bl[l.id], g = svg('g', { 'data-id': l.id, class: 'na-t-link' + (broken ? ' broken' : '') + ' ' + l.kind }, stageSvg);
          keyAct(g, function () { toggleLink(l.id); });
          g.setAttribute('aria-label', l.label + (broken ? ': broken. Press to repair.' : ': working. Press to break.'));
          g.setAttribute('aria-pressed', broken ? 'true' : 'false');
          svg('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: 'hit' }, g);
          if (!broken) svg('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: 'vis' }, g);
          else {
            var f = 0.3, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
            svg('line', { x1: a.x, y1: a.y, x2: a.x + (b.x - a.x) * f, y2: a.y + (b.y - a.y) * f, class: 'vis' }, g);
            svg('line', { x1: b.x, y1: b.y, x2: b.x + (a.x - b.x) * f, y2: b.y + (a.y - b.y) * f, class: 'vis' }, g);
            svg('text', { x: mx, y: my + 6, class: 'cut', 'text-anchor': 'middle' }, g, '✂');
          }
          if (l.dir === 'one' && !broken) {
            var ang = Math.atan2(b.y - a.y, b.x - a.x), mx2 = (a.x + b.x) / 2, my2 = (a.y + b.y) / 2, s = 7;
            function pt(dx, dy) { return (mx2 + dx * Math.cos(ang) - dy * Math.sin(ang)).toFixed(1) + ',' + (my2 + dx * Math.sin(ang) + dy * Math.cos(ang)).toFixed(1); }
            svg('polygon', { points: pt(s, 0) + ' ' + pt(-s, -s * 0.8) + ' ' + pt(-s, s * 0.8), class: 'arrow' }, g);
          }
        });
        // devices
        t.nodes.forEach(function (nd) {
          if (nd.kind === 'tap') { svg('circle', { cx: nd.x, cy: nd.y, r: 4, class: 'na-t-tap' }, stageSvg); return; }
          var off = !!st.bn[nd.id], isMe = nd.id === st.me, reached = !!inf.set[nd.id], cls = off ? 'off' : isMe ? 'me' : reached ? 'ok' : 'cut';
          var g = svg('g', { 'data-id': nd.id, class: 'na-t-node ' + nd.kind + ' ' + cls }, stageSvg);
          keyAct(g, function () { clickNode(nd.id); });
          var nm = nd.kind === 'switch' ? 'the switch' : 'PC ' + nd.label;
          g.setAttribute('aria-label', nm + ': ' + (off ? 'switched off' : isMe ? 'this is you' : reached ? 'reachable from you' : 'cut off from you') + (nd.kind === 'host' && st.mode === 'pick' ? '. Press to sit here.' : off ? '. Press to switch on.' : '. Press to switch off.'));
          var w = nd.kind === 'switch' ? 70 : 52, h = 32;
          svg('rect', { x: nd.x - w / 2, y: nd.y - h / 2, width: w, height: h, rx: nd.kind === 'switch' ? 4 : 9 }, g);
          var glyph = off ? '✗' : isMe ? '★' : reached ? '✓' : '✗';
          svg('text', { x: nd.x, y: nd.y + 5, 'text-anchor': 'middle', class: 'lbl' }, g, nd.kind === 'switch' ? 'switch' : nd.label + ' ' + glyph);
          var cap = off ? 'off' : isMe ? 'you' : !reached && nd.kind === 'host' ? 'cut off' : '';
          if (cap) svg('text', { x: nd.x, y: nd.y + h / 2 + 11, 'text-anchor': 'middle', class: 'cap' }, g, cap);
        });
        if (fid) { var f2 = stageSvg.querySelector('[data-id="' + fid + '"]'); if (f2) f2.focus({ preventScroll: true }); }
        // readouts
        var cc = Topo.cableCount(st.type, st.n), broken = Object.keys(st.bl).length;
        sCable.set(String(cc.total), cc.formula + (broken ? ' · ' + broken + ' broken' : ''));
        var alive = st.topo.nodes.filter(function (x) { return x.kind === 'host' && !st.bn[x.id]; }).length;
        var ok = Topo.allConnected(st.topo, st.bl, st.bn);
        sAll.set(ok ? 'Yes' : 'No', ok ? alive + ' working PCs can all talk' : (st.bn[st.me] ? 'your PC is off' : (alive - 1 - inf.cut.length) + ' of ' + (alive - 1) + ' others reach ' + labelOf(st.me)));
        sAll.node.className = 'na-stat ' + (ok ? 'good' : 'bad');
        var sp = Topo.spof(st.topo), nodeSp = sp.filter(function (x) { return x.type === 'node'; }), linkSp = sp.filter(function (x) { return x.type === 'link'; });
        var parts = nodeSp.map(function (x) { return x.label; });
        if (linkSp.length) parts.push(linkSp.length === 1 ? linkSp[0].label : 'any of ' + linkSp.length + ' cables');
        var allLinks = st.topo.links.filter(function (l) { return l.kind === 'trunk'; }).length;
        sSpof.set(sp.length ? String(sp.length) : 'none', sp.length ? (sp.length === nodeSp.length + linkSp.length && nodeSp.length > 1 ? 'any PC or any cable' : parts.join(' + ')) : 'no single failure splits it');
        sSpof.node.className = 'na-stat ' + (sp.length ? 'warn' : 'good');
        stageSvg.setAttribute('aria-label', 'Network diagram: ' + st.type + ' with ' + st.n + ' PCs. ' + (ok ? 'Everyone can still talk.' : 'Some PCs are cut off.'));
      }
      reset(); centre(stage);
      say(WHY.star + ' ' + TIPS.star);
    }
  });

  /* ---------------------------------------------------------------- 9.5 addressing */
  var PRESETS_IP = [
    { label: '192.168.1.2 /24 (home)', ip: '192.168.1.2', p: 24, other: '192.168.1.77' },
    { label: '10.1.2.3 /8 (big company)', ip: '10.1.2.3', p: 8, other: '10.200.0.9' },
    { label: '172.16.5.9 /12', ip: '172.16.5.9', p: 12, other: '172.32.0.1' },
    { label: '8.8.8.8 /24 (public)', ip: '8.8.8.8', p: 24, other: '8.8.4.4' },
    { label: '203.0.113.10 /24 (doc range)', ip: '203.0.113.10', p: 24, other: '203.0.113.200' }
  ];
  function octetHost(parent, ipv, prefix, opts) {
    // four octets of 8 bit cells. opts.onToggle(bitIndex) makes them clickable; opts.diff = xor mask to flag differences
    var row = el('div', 'na-octets'), bits = Ip.toBits(ipv), firstDiff = -1, diffBits = opts.diff != null ? Ip.toBits(opts.diff) : null;
    if (diffBits) for (var q = 0; q < prefix; q++) if (diffBits.charAt(q) === '1') { firstDiff = q; break; }
    for (var o = 0; o < 4; o++) {
      var oct = el('div', 'na-oct'), cells = el('div', 'na-cells');
      for (var j = 0; j < 8; j++) {
        var i = o * 8 + j, isNet = i < prefix, b = bits.charAt(i);
        var cell = el(opts.onToggle ? 'button' : 'span', 'na-bit ' + (isNet ? 'net' : 'host') + (i === prefix ? ' edge' : '') + (diffBits && diffBits.charAt(i) === '1' && isNet ? ' diff' : '') + (i === firstDiff ? ' first' : ''), b);
        if (opts.onToggle) {
          cell.type = 'button'; cell.setAttribute('aria-pressed', b === '1' ? 'true' : 'false');
          cell.setAttribute('aria-label', 'bit ' + (i + 1) + ' (' + (isNet ? 'network' : 'host') + ' part): ' + b);
          (function (idx) { cell.addEventListener('click', function () { opts.onToggle(idx); }); })(i);
        }
        cells.appendChild(cell);
      }
      oct.appendChild(cells);
      oct.appendChild(el('div', 'na-dec', String((ipv >>> (24 - 8 * o)) & 255)));
      row.appendChild(oct);
    }
    parent.appendChild(row);
    return { firstDiff: firstDiff };
  }

  function buildIpTab(host, NA) {
    var st = { ip: Ip.parseIPv4('192.168.1.2'), p: 24, other: '192.168.1.77' };
    var chips = el('div', 'na-chips'); chips.appendChild(el('span', 'na-lab', 'Examples'));
    PRESETS_IP.forEach(function (pr) { chips.appendChild(NA.chip(pr.label, function () { st.ip = Ip.parseIPv4(pr.ip); st.p = pr.p; st.other = pr.other; pSl.set(pr.p); addr.value = pr.ip; oth.value = pr.other; paint(); })); });
    var addr = el('input'); addr.type = 'text'; addr.value = '192.168.1.2'; addr.spellcheck = false; addr.autocomplete = 'off'; addr.setAttribute('aria-label', 'IPv4 address');
    var pSl = NA.slider('Prefix length', 8, 30, 1, 24, function (v) { return '/' + v; }, function (v) { st.p = v; paint(); });
    var oth = el('input'); oth.type = 'text'; oth.value = st.other; oth.spellcheck = false; oth.autocomplete = 'off'; oth.setAttribute('aria-label', 'Another address to compare');
    var c = el('div', 'na-controls'); c.appendChild(NA.field('My address', addr, 'grow')); c.appendChild(pSl.wrap); c.appendChild(NA.field('Is this on my subnet?', oth, 'grow'));
    var tip = el('p', 'na-tip', 'Try this: click bits to flip them, then drag the prefix slider and watch where “network” ends and “host” begins.');
    var bitsBox = el('div', 'na-bits'), legend = el('div', 'na-key', [html('span', '', '<i style="--c:var(--cmp-1)"></i>network part — same for the whole LAN'), html('span', '', '<i style="--c:var(--cmp-3)"></i>host part — picks one device')]);
    var grid = el('div', 'na-ipgrid'), nar = NA.narrator(); nar.node.classList.add('na-say-tall');
    [chips, c, tip, bitsBox, legend, grid, nar.node, el('p', 'na-note', 'IPv4 has only 2³² ≈ 4.3 billion addresses — fewer than people on Earth, before counting their phones, TVs and sensors. IPv6 uses 128 bits (about 3.4 × 10³⁸ addresses), but the world still runs mostly on IPv4 plus NAT (next tab), which lets a whole household share one public address.')].forEach(function (x) { host.appendChild(x); });
    function commitAddr() {
      var v = Ip.parseIPv4(addr.value);
      if (v == null) { addr.setAttribute('aria-invalid', 'true'); nar.say('<span class="bad">“' + NA.esc(addr.value) + '” is not an IPv4 address.</span> Write four numbers 0–255 separated by dots, like 192.168.1.2.'); return; }
      addr.removeAttribute('aria-invalid'); st.ip = v; paint();
    }
    addr.addEventListener('change', commitAddr); addr.addEventListener('keydown', function (e) { if (e.key === 'Enter') commitAddr(); });
    oth.addEventListener('input', function () { st.other = oth.value; paint(true); });
    var lastMsg = '';
    function row(k, v) { return '<tr><th scope="row">' + k + '</th><td>' + v + '</td></tr>'; }
    function paint(keepSay) {
      NA.clear(bitsBox);
      bitsBox.appendChild(el('div', 'na-lab', 'My address — click a bit to flip it'));
      octetHost(bitsBox, st.ip, st.p, { onToggle: function (i) { st.ip = ((st.ip ^ (1 << (31 - i))) >>> 0); addr.value = Ip.ipStr(st.ip); paint(); } });
      var si = Ip.subnetInfo(st.ip, st.p), o2 = Ip.parseIPv4(st.other), cmp = o2 == null ? null : Ip.sameSubnet(st.ip, o2, st.p);
      if (o2 != null) { bitsBox.appendChild(el('div', 'na-lab na-second', 'The other address (' + Ip.ipStr(o2) + ')')); octetHost(bitsBox, o2, st.p, { diff: cmp.diffMask }); }
      grid.innerHTML = '<table class="na-table na-iptable"><tbody>' +
        row('Network address', '<b>' + Ip.ipStr(si.network) + '</b>/' + st.p + ' <span class="na-sub">(host bits all 0 — the name of the LAN)</span>') +
        row('Subnet mask', Ip.ipStr(si.mask) + ' <span class="na-sub">(' + st.p + ' ones, then ' + si.hostBits + ' zeros)</span>') +
        row('Broadcast address', Ip.ipStr(si.broadcast) + ' <span class="na-sub">(host bits all 1 — “everyone on this LAN”)</span>') +
        row('Usable hosts', '2<sup>' + si.hostBits + '</sup> − 2 = <b>' + si.hosts.toLocaleString('en-US') + '</b> <span class="na-sub">(' + Ip.ipStr(si.first) + ' … ' + Ip.ipStr(si.last) + ')</span>') +
        row('Kind of address', '<span class="na-kind k-' + si.kind.kind + '">' + si.kind.kind + '</span> ' + si.kind.label) + '</tbody></table>';
      var msg;
      if (o2 == null) msg = 'Type a second address in the right-hand box to test whether it is on your LAN.';
      else if (cmp.same) msg = '<span class="ok">✓ Same subnet.</span> <b>' + Ip.ipStr(st.ip) + '</b> and <b>' + Ip.ipStr(o2) + '</b> agree on all ' + st.p + ' network bits, so they are on the same LAN: the sender hands the frame straight to a switch and it arrives — no router involved.';
      else {
        var fb = cmp.firstDiffBit, oc = Math.floor(fb / 8) + 1;
        msg = '<span class="bad">✗ Different subnet.</span> They differ at network bit <b>' + (fb + 1) + '</b> (in octet ' + oc + '): ' + st.ip.toString(2).padStart(32, '0').charAt(fb) + ' versus ' + o2.toString(2).padStart(32, '0').charAt(fb) + ' — marked red above. A different network part means a different LAN, so the packet must go to the <b>default gateway</b> (the router) first.';
      }
      msg = 'Your address splits into <b>' + st.p + ' network bits</b> (which LAN?) and <b>' + si.hostBits + ' host bits</b> (which device on it?). ' + msg;
      if (!keepSay || msg !== lastMsg) nar.say(msg);
      lastMsg = msg;
    }
    paint();
  }

  function buildNatTab(host, NA) {
    var DEVS = [{ id: 'pc', name: 'PC', ip: '192.168.1.2', port: 50001 }, { id: 'phone', name: 'Phone', ip: '192.168.1.3', port: 50001 }, { id: 'laptop', name: 'Laptop', ip: '192.168.1.4', port: 50002 }];
    var SRVS = [{ id: 'www', name: 'www.example.com', ip: '203.0.113.10', port: 80 }, { id: 'org', name: 'example.org', ip: '198.51.100.20', port: 80 }];
    var STRANGER = { ip: '198.51.100.99', port: 4444 };
    var nat = new Nat({ publicIp: '203.0.113.34', startPort: 62000 }), run = NA.runner(), busy = false;
    var DY = [70, 135, 200], SY = [70, 135], SX = 520, DX = 110, RX = 320, RY = 135;
    var srvSel = NA.select(SRVS.map(function (s) { return { value: s.id, label: s.name + ' (' + s.ip + ')' }; }), 'www');
    var btns = DEVS.map(function (d, i) { return NA.button('Send from ' + d.name, 'primary', function () { send(i); }); });
    var strBtn = NA.button('Stranger sends to ' + nat.publicIp + ':62999', 'danger', function () { stranger(); });
    var rstBtn = NA.button('Reset table', '', function () { run.cancel(); nat = new Nat({ publicIp: '203.0.113.34', startPort: 62000 }); busy = false; setBusy(false); hideToken(); hot(false); paintTable(); nar.say('Table emptied. The router forgets everything when it restarts.'); });
    var c = el('div', 'na-controls'); c.appendChild(NA.field('Talk to', srvSel)); btns.forEach(function (b) { c.appendChild(b); }); c.appendChild(strBtn); c.appendChild(rstBtn); c.appendChild(NA.speedControl());
    var tip = el('p', 'na-tip', 'Try this: send from the PC, then from the Phone — both use local port 50001. Then send the PC’s request again and the stranger’s packet.');
    var stage = el('div', 'na-stage'), S = svg('svg', { viewBox: '0 0 640 270', role: 'img', 'aria-label': 'Home LAN with a PC, a phone and a laptop on the left, a NAT router in the middle, and the Internet with two web servers and a stranger on the right. Packets are shown travelling between them; the narration below describes each step.' }, stage);
    svg('rect', { x: 8, y: 14, width: 192, height: 244, rx: 12, class: 'na-n-zone' }, S); svg('text', { x: 104, y: 32, 'text-anchor': 'middle', class: 'na-n-zt' }, S, 'Home LAN — private addresses');
    svg('rect', { x: 440, y: 14, width: 192, height: 244, rx: 12, class: 'na-n-zone' }, S); svg('text', { x: 536, y: 32, 'text-anchor': 'middle', class: 'na-n-zt' }, S, 'The Internet — public addresses');
    DEVS.forEach(function (d, i) { svg('line', { x1: 175, y1: DY[i], x2: RX - 68, y2: RY, class: 'na-n-edge' }, S); });
    SRVS.forEach(function (s, i) { svg('line', { x1: RX + 68, y1: RY, x2: SX - 65, y2: SY[i], class: 'na-n-edge' }, S); });
    svg('line', { x1: RX + 68, y1: RY, x2: SX - 65, y2: 205, class: 'na-n-edge' }, S);
    DEVS.forEach(function (d, i) {
      var g = svg('g', { class: 'na-n-node dev', 'data-id': d.id }, S);
      svg('rect', { x: DX - 65, y: DY[i] - 21, width: 130, height: 42, rx: 8 }, g);
      svg('text', { x: DX, y: DY[i] - 3, 'text-anchor': 'middle', class: 'nm' }, g, d.name);
      svg('text', { x: DX, y: DY[i] + 12, 'text-anchor': 'middle', class: 'ip' }, g, d.ip);
    });
    var routerG = svg('g', { class: 'na-n-node router' }, S);
    svg('rect', { x: RX - 68, y: 58, width: 136, height: 154, rx: 10 }, routerG);
    svg('text', { x: RX, y: 76, 'text-anchor': 'middle', class: 'nm' }, routerG, 'Router (NAT)');
    svg('text', { x: RX, y: 92, 'text-anchor': 'middle', class: 'ip' }, routerG, 'inside 192.168.1.1');
    svg('text', { x: RX, y: 198, 'text-anchor': 'middle', class: 'ip' }, routerG, 'outside ' + nat.publicIp);
    function srvNode(label, ip, y, cls) {
      var g = svg('g', { class: 'na-n-node srv ' + (cls || '') }, S);
      svg('rect', { x: SX - 65, y: y - 21, width: 130, height: 42, rx: 8 }, g);
      svg('text', { x: SX, y: y - 3, 'text-anchor': 'middle', class: 'nm' }, g, label);
      svg('text', { x: SX, y: y + 12, 'text-anchor': 'middle', class: 'ip' }, g, ip);
      return g;
    }
    SRVS.forEach(function (s, i) { srvNode(s.name, s.ip + ':80', SY[i]); });
    srvNode('stranger', STRANGER.ip, 205, 'bad');
    var tok = svg('g', { class: 'na-n-tok', style: 'display:none' }, S);
    svg('rect', { x: -72, y: -18, width: 144, height: 36, rx: 7 }, tok);
    var tl1 = svg('text', { x: 0, y: -4, 'text-anchor': 'middle' }, tok, ''), tl2 = svg('text', { x: 0, y: 11, 'text-anchor': 'middle' }, tok, '');
    var cross = svg('text', { x: 0, y: 6, 'text-anchor': 'middle', class: 'na-n-x', style: 'display:none' }, S, '✗ dropped');
    var cols = el('div', 'na-cols na-cols-even'), left = el('div'), right = el('div');
    var tblBox = el('div', 'na-nat-table'); left.appendChild(el('div', 'na-lab', 'The router’s NAT table')); left.appendChild(tblBox);
    right.appendChild(el('p', 'na-note', 'Each row is a promise: “traffic that comes back to this public port belongs to that private device”. Ports 62000, 62001… are handed out in order, so two devices that both use local port 50001 still get different public ports.'));
    cols.appendChild(left); cols.appendChild(right);
    var nar = NA.narrator(); nar.node.classList.add('na-say-tall');
    [c, tip, el('p', 'na-swipe', '↔ On a phone, swipe the diagram sideways.'), stage, nar.node, cols].forEach(function (x) { host.appendChild(x); });
    nar.say('Your home has <b>one public address</b> (' + nat.publicIp + ') but many devices. Press a Send button to see how the router lets them all share it.');
    function setBusy(b) { btns.forEach(function (x) { x.disabled = b; }); strBtn.disabled = b; srvSel.disabled = b; }
    function txt(p, q) { return p + ' ' + q.ip + ':' + q.port; }
    function setTok(src, dst, cls) { tl1.textContent = txt('src', src); tl2.textContent = txt('dst', dst); tok.setAttribute('class', 'na-n-tok' + (cls ? ' ' + cls : '')); tok.style.display = ''; }
    function hideToken() { tok.style.display = 'none'; cross.style.display = 'none'; }
    function place(x, y) { tok.setAttribute('transform', 'translate(' + x + ' ' + y + ')'); }
    function hot(b) { routerG.classList.toggle('hot', b); }
    function paintTable(newE) {
      if (!nat.table.length) { tblBox.innerHTML = '<p class="na-note">(empty — nobody has talked to the Internet yet)</p>'; return; }
      var h = '<table class="na-table"><thead><tr><th>Inside (private)</th><th>Outside</th><th>Talking to</th></tr></thead><tbody>';
      nat.table.forEach(function (e) { h += '<tr' + (e === newE ? ' class="new"' : '') + '><td>' + e.priv.ip + ':' + e.priv.port + '</td><td>:' + e.pubPort + '</td><td>' + e.remote.ip + '</td></tr>'; });
      tblBox.innerHTML = h + '</tbody></table>';
    }
    function move(g, from, to, ms) { return run.tween(g, ms, function (t) { var u = NA.ease(t); place(NA.lerp(from[0], to[0], u), NA.lerp(from[1], to[1], u)); }); }
    function send(i) {
      var d = DEVS[i], s = SRVS[srvSel.value === 'org' ? 1 : 0], si = srvSel.value === 'org' ? 1 : 0, g = run.start(), D = NA.dur;
      busy = true; setBusy(true); hideToken(); hot(false);
      (async function () {
        var src = { ip: d.ip, port: d.port }, dst = { ip: s.ip, port: s.port };
        setTok(src, dst, 'priv'); place(DX, DY[i]);
        nar.say('<b>① ' + d.name + ' sends</b> a request to ' + s.name + '. Its source is its <b>private</b> address <code>' + src.ip + ':' + src.port + '</code>. Anyone outside would not know where to reply — nobody can route to 192.168.x.x.');
        if (!await run.sleep(g, D(700))) return;
        if (!await move(g, [DX, DY[i]], [RX, RY], D(900))) return;
        var out = nat.outbound(src, dst);
        hot(true); setTok(out.packet.src, out.packet.dst, 'pub'); paintTable(out.entry);
        var clash = nat.table.filter(function (e) { return e.priv.port === src.port && e !== out.entry; });
        nar.say('<b>② The router rewrites the source.</b> It ' + (out.isNew ? 'writes a new row in its table' : 'finds the row it already has') + ' and replaces <code>' + src.ip + ':' + src.port + '</code> with its own public address and port <code>' + out.packet.src.ip + ':' + out.packet.src.port + '</code>.' +
          (out.isNew && clash.length ? ' <b>Port ' + src.port + ' is also used by another device</b> — no problem: the <i>public</i> ports differ (' + clash.map(function (e) { return ':' + e.pubPort; }).concat(':' + out.entry.pubPort).join(' vs ') + '), and that is how replies are told apart.' : ''));
        if (!await run.sleep(g, D(1100))) return;
        hot(false);
        if (!await move(g, [RX, RY], [SX - 4, SY[si]], D(900))) return;
        nar.say('<b>③ The server sees only the public address</b> <code>' + out.packet.src.ip + ':' + out.packet.src.port + '</code>. It has no idea there is a ' + d.name + ' behind the router. It answers to that address.');
        if (!await run.sleep(g, D(800))) return;
        var reply = { src: { ip: s.ip, port: s.port }, dst: { ip: out.packet.src.ip, port: out.packet.src.port } };
        setTok(reply.src, reply.dst, 'pub'); place(SX - 4, SY[si]);
        if (!await move(g, [SX - 4, SY[si]], [RX, RY], D(900))) return;
        var back = nat.inbound(reply);
        hot(true); setTok(back.packet.src, back.packet.dst, 'priv'); paintTable(back.entry);
        nar.say('<b>④ The reply comes back to the router.</b> It looks up public port <code>:' + reply.dst.port + '</code> in the table: that row says “' + d.name + ', ' + back.entry.priv.ip + ':' + back.entry.priv.port + '”. It swaps the destination back.');
        if (!await run.sleep(g, D(1100))) return;
        hot(false);
        if (!await move(g, [RX, RY], [DX, DY[i]], D(900))) return;
        nar.say('<b>⑤ Delivered.</b> The ' + d.name + ' received the answer for the request it made. From outside, the whole household looked like one computer. Now try the same from another device, or the stranger.');
        busy = false; setBusy(false);
        await run.sleep(g, D(900)); if (run.alive(g)) hideToken();
      })();
    }
    function stranger() {
      var g = run.start(), D = NA.dur;
      setBusy(true); hideToken(); hot(false);
      (async function () {
        var pkt = { src: STRANGER, dst: { ip: nat.publicIp, port: 62999 } };
        setTok(pkt.src, pkt.dst, 'pub'); place(SX - 4, 205);
        nar.say('<b>A stranger</b> on the Internet sends a packet to your public address, port 62999, hoping to reach a device inside.');
        if (!await run.sleep(g, D(700))) return;
        if (!await move(g, [SX - 4, 205], [RX, RY], D(900))) return;
        var r = nat.inbound(pkt);
        hot(true);
        cross.setAttribute('x', RX); cross.setAttribute('y', RY + 4); cross.style.display = ''; tok.style.display = 'none';
        nar.say('<b>Dropped ✗.</b> The router searched its table: ' + r.reason + '. Nobody inside asked for this, so it has no idea whom to give it to. That is why NAT hides the devices behind it — <b>but NAT is not a firewall</b>: it has no rules, it simply has no row. A real firewall (9.3) filters on purpose.');
        if (!await run.sleep(g, D(600))) return;
        setBusy(false);
      })();
    }
    paintTable();
  }

  function fmtSpan(s) {
    if (s >= 86400) { var d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600); return d + 'd ' + h + 'h'; }
    if (s >= 3600) { var hh = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return hh + 'h ' + m + 'm'; }
    if (s >= 60) { var mm = Math.floor(s / 60), ss = s % 60; return mm + 'm ' + ss + 's'; }
    return s + 's';
  }
  function buildDnsTab(host, NA) {
    var R = new Resolver(), run = NA.runner();
    var NODE = { client: { x: 70, y: 150, name: 'You', sub: DNS.client, c: 'var(--cmp-1)' }, resolver: { x: 245, y: 150, name: 'Resolver + cache', sub: DNS.resolver, c: 'var(--cmp-10)' },
      root: { x: 520, y: 42, name: 'Root server', sub: DNS.root, c: 'var(--cmp-3)' }, tld: { x: 520, y: 150, name: '.com servers', sub: DNS.tld.com, c: 'var(--cmp-4)' }, auth: { x: 520, y: 258, name: 'ns1.example.com', sub: DNS.zones['example.com'].ip, c: 'var(--cmp-6)' } };
    var input = el('input'); input.type = 'text'; input.value = 'www.example.com'; input.spellcheck = false; input.autocomplete = 'off'; input.setAttribute('aria-label', 'Name to look up');
    var goBtn = NA.button('Look it up', 'primary', function () { lookup(input.value); });
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') lookup(input.value); });
    var c = el('div', 'na-controls'); c.appendChild(NA.field('Name', input, 'grow')); c.appendChild(goBtn); c.appendChild(NA.speedControl());
    var chips = el('div', 'na-chips'); chips.appendChild(el('span', 'na-lab', 'Names'));
    ['www.example.com', 'blog.example.com', 'example.org', 'api.example.net', 'www.exampel.com'].forEach(function (n) { chips.appendChild(NA.chip(n + (n === 'www.exampel.com' ? ' (typo)' : ''), function () { input.value = n; lookup(n); }, 'Look up ' + n)); });
    var tip = el('p', 'na-tip', 'Try this: look up www.example.com, then blog.example.com (shorter!), then wait 10 min and look up www.example.com again, then wait 3 days.');
    var stage = el('div', 'na-stage'), S = svg('svg', { viewBox: '0 0 640 300', role: 'img', 'aria-label': 'You, a resolver with a cache, and the root, top-level-domain and authoritative DNS servers. Numbered messages travel between them; the message list below describes each one.' }, stage);
    var edges = { root: ['resolver', 'root'], tld: ['resolver', 'tld'], auth: ['resolver', 'auth'], client: ['client', 'resolver'] }, nodeG = {}, nodeText = {};
    Object.keys(edges).forEach(function (k) { var a = NODE[edges[k][0]], b = NODE[edges[k][1]]; svg('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: 'na-d-edge' }, S); });
    Object.keys(NODE).forEach(function (k) {
      var n = NODE[k], g = svg('g', { class: 'na-d-node', style: '--c:' + n.c }, S); nodeG[k] = g;
      svg('rect', { x: n.x - 70, y: n.y - 22, width: 140, height: 44, rx: 9 }, g);
      nodeText[k] = [svg('text', { x: n.x, y: n.y - 3, 'text-anchor': 'middle', class: 'nm' }, g, n.name), svg('text', { x: n.x, y: n.y + 12, 'text-anchor': 'middle', class: 'ip' }, g, n.sub)];
    });
    var tok = svg('g', { class: 'na-d-tok', style: 'display:none' }, S), tc = svg('circle', { r: 11 }, tok), tn = svg('text', { 'text-anchor': 'middle', y: 4 }, tok, '1');
    var bub = svg('text', { class: 'na-d-bub', 'text-anchor': 'middle' }, S, '');
    var logBox = el('ol', 'na-d-log'); logBox.setAttribute('aria-label', 'Messages of this lookup');
    var cols = el('div', 'na-cols na-cols-even'), left = el('div'), right = el('div');
    left.appendChild(el('div', 'na-lab', 'Messages of this lookup')); left.appendChild(logBox);
    var cacheBox = el('div', 'na-d-cache'), clock = el('div', 'na-d-clock');
    var waits = el('div', 'na-chips');
    [['wait 1 min', 60], ['wait 10 min', 600], ['wait 1 day', 86400], ['wait 3 days', 259200]].forEach(function (w) { waits.appendChild(NA.chip('⏱ ' + w[0], function () { if (running) return; R.advance(w[1]); paintCache(); nar.say('<b>The clock moves forward ' + w[0].replace('wait ', '') + '.</b> Every cached record has lost that much of its <b>TTL</b> (time to live); records whose TTL reached 0 are thrown away. Now look the name up again.'); })); });
    waits.appendChild(NA.chip('Flush cache', function () { if (running) return; R.flush(); paintCache(); nar.say('Cache emptied: the next lookup must start from the root.'); }));
    right.appendChild(el('div', 'na-lab', 'The resolver’s cache')); right.appendChild(cacheBox); right.appendChild(clock); right.appendChild(waits);
    cols.appendChild(left); cols.appendChild(right);
    var sNow = NA.stat('Messages this lookup'), sTot = NA.stat('Messages in total'), sSave = NA.stat('Saved by the cache');
    var stats = el('div', 'na-stats'); [sNow, sTot, sSave].forEach(function (s) { stats.appendChild(s.node); });
    var nar = NA.narrator(); nar.node.classList.add('na-say-tall');
    [c, chips, tip, el('p', 'na-swipe', '↔ On a phone, swipe the diagram sideways.'), stage, stats, nar.node, cols].forEach(function (x) { host.appendChild(x); });
    nar.say('Nobody knows every name. The <b>resolver</b> (your campus or ISP) walks down the hierarchy <b>root → .com → example.com</b> for you, and remembers what it learns. Look up a name to watch.');
    var running = false;
    function setNames(name) {
      var labels = String(name).trim().toLowerCase().replace(/\.$/, '').split('.'), tld = labels[labels.length - 1], dom = labels.slice(-2).join('.');
      var tIp = DNS.tld[tld], z = DNS.zones[dom];
      nodeText.tld[0].textContent = '.' + (labels.length > 1 ? tld : 'com') + ' servers'; nodeText.tld[1].textContent = tIp || DNS.tld.com;
      nodeText.auth[0].textContent = z ? z.ns : 'ns1.' + (labels.length > 1 ? dom : 'example.com'); nodeText.auth[1].textContent = z ? z.ip : '—';
    }
    function paintCache() {
      var es = R.cacheEntries();
      if (!es.length) cacheBox.innerHTML = '<p class="na-note">(empty)</p>';
      else {
        var h = '<table class="na-table"><thead><tr><th>Record</th><th>Value</th><th>TTL left</th></tr></thead><tbody>';
        es.forEach(function (e) {
          var pct = Math.max(2, Math.round(100 * e.ttlLeft / e.ttlTotal));
          h += '<tr><td>' + (e.type === 'A' ? 'A ' : 'NS ') + NA.esc(e.name) + '</td><td>' + NA.esc(e.value) + '</td><td><span class="na-d-ttl">' + fmtSpan(e.ttlLeft) + '<i style="width:' + pct + '%"></i></span></td></tr>';
        });
        cacheBox.innerHTML = h + '</tbody></table>';
      }
      clock.textContent = 'Simulated clock: +' + fmtSpan(R.now) + ' since the start' + (R.now === 0 ? '' : ' (' + R.now + ' s)');
      sTot.set(String(R.totalMessages), R.lookups + ' lookup' + (R.lookups === 1 ? '' : 's'));
      sSave.set(String(R.totalSaved), 'a cold lookup costs ' + FULL_WALK);
    }
    function pulse(k) { nodeG[k].classList.add('on'); }
    function unpulse() { Object.keys(nodeG).forEach(function (k) { nodeG[k].classList.remove('on'); }); }
    function lookup(raw) {
      if (running) return;
      var name = String(raw).trim();
      var res = R.resolve(name);
      if (res.invalid) { nar.say('<span class="bad">“' + NA.esc(name) + '” is not a valid name.</span> A host name has dots, like www.example.com.'); return; }
      running = true; goBtn.disabled = true; setNames(res.name);
      var g = run.start(), D = NA.dur; NA.clear(logBox); unpulse(); tok.style.display = 'none'; bub.textContent = '';
      var n = 0, circ = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨'];
      sNow.set('0', '');
      (async function () {
        for (var i = 0; i < res.steps.length; i++) {
          var s = res.steps[i];
          if (s.kind === 'local') {
            unpulse(); pulse('resolver');
            var li = el('li', 'local', [el('span', 'n', '?'), el('span', 't', s.text)]); logBox.appendChild(li);
            nar.say('<b>The resolver checks its cache.</b> ' + NA.esc(s.text));
            if (!await run.sleep(g, D(900))) { finish(res, true); return; }
            continue;
          }
          n++;
          var a = NODE[s.from], b = NODE[s.to];
          unpulse(); pulse(s.from);
          var item = el('li', null, [el('span', 'n', String(n)), el('span', 't', [el('b', null, NODE[s.from].name + ' → ' + NODE[s.to].name + ': '), s.text])]); logBox.appendChild(item);
          tn.textContent = String(n); tok.style.display = ''; tok.setAttribute('style', '--c:' + a.c);
          nar.say('<b>Message ' + n + ':</b> ' + NODE[s.from].name + ' → ' + NODE[s.to].name + ' — “' + NA.esc(s.text) + '”' + explain(s, res));
          bub.textContent = s.short;
          var ok = await run.tween(g, D(750), function (t) {
            var u = NA.ease(t), x = NA.lerp(a.x, b.x, u), y = NA.lerp(a.y, b.y, u);
            tok.setAttribute('transform', 'translate(' + x + ' ' + y + ')');
            bub.setAttribute('x', Math.max(80, Math.min(560, x))); bub.setAttribute('y', y - 18);
          });
          if (!ok) { finish(res, true); return; }
          unpulse(); pulse(s.to); sNow.set(String(n), n + ' of ' + FULL_WALK + ' for a cold lookup');
          if (!await run.sleep(g, D(250))) { finish(res, true); return; }
        }
        finish(res, false);
      })();
    }
    function explain(s, res) {
      if (s.from === 'resolver' && s.to === 'root') return ' — the root knows nobody’s address, only who runs each top-level domain.';
      if (s.from === 'resolver' && s.to === 'tld') return ' — the TLD servers know who runs each domain under them, not the host addresses.';
      if (s.from === 'resolver' && s.to === 'auth') return ' — the <b>authoritative</b> server holds the real records of this domain.';
      return '';
    }
    function finish(res, cancelled) {
      running = false; goBtn.disabled = false; unpulse(); tok.style.display = 'none'; bub.textContent = ''; paintCache();
      if (cancelled) return;
      sNow.set(String(res.messages), res.fromCache ? 'answered from the cache' : res.nxdomain ? 'ended early: no such name' : 'of ' + FULL_WALK + ' for a cold lookup');
      if (res.nxdomain) nar.say('<span class="bad">NXDOMAIN — the name does not exist.</span> The walk stopped as soon as some server said so (' + res.messages + ' messages). This is what a <b>typo</b> looks like: no address, so no connection, no web page — the lab’s “Typo in the domain” story.');
      else if (res.fromCache) nar.say('<span class="ok">Answered from the cache in ' + res.messages + ' messages</span> instead of ' + FULL_WALK + ' — <b>' + res.saved + ' messages saved</b>. The answer is only trusted until its TTL runs out.');
      else {
        var skipped = FULL_WALK - res.messages;
        nar.say('<span class="ok">' + NA.esc(res.name) + ' = ' + res.answer + '</span> after <b>' + res.messages + ' messages</b>' + (skipped ? ' — the cache let the resolver skip ' + skipped + ' (it already remembered who runs the upper levels).' : ' — the full walk.') + (skipped ? ' It keeps the new address for 5 minutes (a short TTL: hosts change more often than the upper levels).' : ' It now caches the referrals (long TTLs: the upper levels rarely change) and the address (short TTL: 5 min).'));
      }
    }
    paintCache(); setNames('www.example.com');
  }

  NA.register('addressing', {
    title: 'Addresses and names: from bits to a web server',
    hint: 'Three small machines: how an IP address splits, how a router shares one public address, and how a name becomes an address.',
    build: function (host, NA, node) {
      node.classList.add('na-addressing');
      NA.tabs(host, [
        { label: '① IP = network + host', build: function (p) { buildIpTab(p, NA); } },
        { label: '② NAT: many devices, one address', build: function (p) { buildNatTab(p, NA); } },
        { label: '③ DNS: from name to address', build: function (p) { buildDnsTab(p, NA); } }
      ], {});
    }
  });

  /* ---------------------------------------------------------------- 9.6 layers */
  var LAYER_ROWS = [
    { id: 'app', name: 'Application', osi: 'OSI 7 Application + 6 Presentation + 5 Session', sJob: 'writes the message', rJob: 'receives the message', cls: 'app' },
    { id: 'transport', name: 'Transport', osi: 'OSI 4 Transport', sJob: 'adds ports (and, for TCP, numbers)', rJob: 'checks ports, delivers to the program', cls: 'tr' },
    { id: 'internet', name: 'Internet', osi: 'OSI 3 Network', sJob: 'adds IP addresses', rJob: 'checks the destination IP', cls: 'ip' },
    { id: 'link', name: 'Network interface', osi: 'OSI 2 Data link + 1 Physical', sJob: 'adds MAC addresses + CRC', rJob: 'checks the CRC and MAC', cls: 'eth' }
  ];
  var STEPS = [{ s: 's', l: 'app' }, { s: 's', l: 'transport' }, { s: 's', l: 'internet' }, { s: 's', l: 'link' }, { s: 'w' }, { s: 'r', l: 'link' }, { s: 'r', l: 'internet' }, { s: 'r', l: 'transport' }, { s: 'r', l: 'app' }];

  NA.register('layers', {
    title: 'Wrap & unwrap: the data is put in an envelope for every layer',
    hint: 'Send a message down the sender’s stack and back up the receiver’s. Click any coloured header to see its fields.',
    build: function (host, NA, node) {
      node.classList.add('na-layers');
      var st = { proto: 'tcp', msg: 'Hello', flip: false, osi: false, pos: 0, failed: null, running: false, enc: null, rx: null, wire: null, shown: null };
      var run = NA.runner();
      var msgIn = el('input'); msgIn.type = 'text'; msgIn.value = 'Hello'; msgIn.maxLength = 60; msgIn.spellcheck = false; msgIn.setAttribute('aria-label', 'Message to send');
      msgIn.addEventListener('input', function () { st.msg = msgIn.value; hardReset(); });
      var protoSeg = NA.segmented([{ value: 'tcp', label: 'TCP (registered mail)' }, { value: 'udp', label: 'UDP (postcard)' }], 'tcp', function (v) { st.proto = v; hardReset(); }, 'Transport protocol');
      var flipChip = NA.chip('⚡ Flip one bit in transit', function () { st.flip = !st.flip; flipChip.setAttribute('aria-pressed', st.flip ? 'true' : 'false'); hardReset(); }); flipChip.setAttribute('aria-pressed', 'false');
      var osiChip = NA.chip('Show OSI names', function () { st.osi = !st.osi; osiChip.setAttribute('aria-pressed', st.osi ? 'true' : 'false'); paint(); }); osiChip.setAttribute('aria-pressed', 'false');
      var playBtn = NA.button('▶ Send', 'primary', function () { play(); });
      var stepBtn = NA.button('Step ›', '', function () { stepOnce(); });
      var rstBtn = NA.button('Reset', '', function () { hardReset(); });
      var c1 = el('div', 'na-controls'); c1.appendChild(NA.field('Message', msgIn, 'grow')); c1.appendChild(NA.field('Transport', protoSeg.wrap));
      var c2 = el('div', 'na-controls tight'); [playBtn, stepBtn, rstBtn, flipChip, osiChip].forEach(function (x) { c2.appendChild(x); }); c2.appendChild(NA.speedControl());
      var chips = el('div', 'na-chips'); chips.appendChild(el('span', 'na-lab', 'Scenarios'));
      [['TCP, clean line', 'tcp', false], ['UDP, clean line', 'udp', false], ['TCP + noise', 'tcp', true], ['UDP + noise', 'udp', true]].forEach(function (s) {
        chips.appendChild(NA.chip(s[0], function () { st.proto = s[1]; st.flip = s[2]; protoSeg.set(s[1]); flipChip.setAttribute('aria-pressed', s[2] ? 'true' : 'false'); hardReset(); play(); }));
      });
      var tip = el('p', 'na-tip', 'Try this: press Send and watch the envelope grow on the left and shrink on the right. Then switch on “Flip one bit” and send again.');
      var grid = el('div', 'na-lay-grid');
      var wireBox = el('div', 'na-lay-wire');
      var fieldsBox = el('div', 'na-lay-fields');
      var sTot = NA.stat('Bytes on the wire'), sPay = NA.stat('Your message'), sOvh = NA.stat('Header overhead');
      var stats = el('div', 'na-stats'); [sPay, sTot, sOvh].forEach(function (s) { stats.appendChild(s.node); });
      var nar = NA.narrator(); nar.node.classList.add('na-say-tall');
      [c1, c2, chips, tip, grid, wireBox, fieldsBox, stats, nar.node, el('p', 'na-note', 'The bytes are real: the IP and TCP/UDP checksums and the Ethernet CRC-32 are computed over the actual bytes of this toy frame (addresses from the documentation ranges). Real Ethernet also pads very short frames to 64 bytes; that is left out here, and there is no router in the middle so the picture stays small.')].forEach(function (x) { host.appendChild(x); });

      function compute() {
        st.enc = Stack.encapsulate({ proto: st.proto, msg: st.msg });
        var f = st.enc.frame.slice();
        st.flipAt = f.length - 5;                                   // last data byte (or last header byte when the message is empty)
        st.wire = st.flip ? Stack.flipBit(f, st.flipAt, 2) : f;
        st.rx = Stack.decapsulate(st.wire);
      }
      function segs(e, upTo) {   // building blocks of the unit at a layer: [{id,label,size,cls}]
        var L = e.layers, hdr = function (i) { return { id: L[i].header.id, label: L[i].header.name.replace(' header', ''), size: L[i].header.size, cls: ['', 'tr', 'ip', 'eth'][i] }; };
        var data = { id: 'data', label: st.msg.length ? '“' + (st.msg.length > 14 ? st.msg.slice(0, 13) + '…' : st.msg) + '”' : '(empty)', size: e.payload.length, cls: 'app' };
        var out = [];
        if (upTo >= 3) out.push(hdr(3));
        if (upTo >= 2) out.push(hdr(2));
        if (upTo >= 1) out.push(hdr(1));
        out.push(data);
        if (upTo >= 3) out.push({ id: 'fcs', label: 'FCS', size: 4, cls: 'eth trailer' });
        return out;
      }
      function bar(upTo, bad) {
        var b = el('div', 'na-lay-bar');
        segs(st.enc, upTo).forEach(function (sg) {
          var s = el('button', 'na-seg2 c-' + sg.cls.split(' ')[0] + (sg.cls.indexOf('trailer') >= 0 ? ' trailer' : '') + (bad && sg.id === 'data' ? ' flipped' : ''), null);
          s.type = 'button';
          s.appendChild(el('span', 'sl', sg.label)); s.appendChild(el('span', 'sz', sg.size + ' B'));
          s.setAttribute('aria-label', sg.label + ', ' + sg.size + ' bytes. Show fields.');
          s.addEventListener('click', function () { st.shown = sg.id; paintFields(); });
          b.appendChild(s);
        });
        return b;
      }
      function rowState(side, idx) {   // idx = index into LAYER_ROWS (0 app … 3 link)
        var stepIdx = side === 's' ? idx : 5 + (3 - idx);
        var done = st.pos > stepIdx, active = st.pos - 1 === stepIdx;
        var failed = st.failed && side === 'r' && st.failed === LAYER_ROWS[idx].id && done;
        return { done: done, active: active, failed: failed, stepIdx: stepIdx };
      }
      function paint() {
        if (!st.enc) compute();
        NA.clear(grid);
        ['s', 'r'].forEach(function (side) {
          var col = el('div', 'na-lay-col ' + (side === 's' ? 'send' : 'recv'));
          col.appendChild(el('div', 'na-lay-ch', side === 's' ? 'Sender: your browser (192.0.2.100) ↓ data goes down' : 'Receiver: web server (203.0.113.10) ↑ data goes up'));
          LAYER_ROWS.forEach(function (r, idx) {
            var ss = rowState(side, idx), rs = side === 'r' ? st.rx.steps.filter(function (x) { return x.layer === r.id; })[0] : null;
            var row = el('div', 'na-lay-row L-' + r.cls + (ss.done ? ' done' : '') + (ss.active ? ' active' : '') + (ss.failed ? ' failed' : ''));
            var nm = el('div', 'na-lay-name'); nm.appendChild(el('b', null, r.name)); if (st.osi) nm.appendChild(el('span', 'osi', r.osi));
            row.appendChild(nm);
            row.appendChild(el('div', 'na-lay-job', side === 's' ? r.sJob : r.rJob));
            if (ss.done) {
              var upTo = idx === 0 ? 0 : idx;
              row.appendChild(bar(upTo, ss.failed));
              if (side === 'r' && rs) row.appendChild(el('div', 'na-lay-verdict ' + (rs.ok ? 'ok' : 'bad'), (rs.ok ? '✓ ' : '✗ ') + 'looked at ' + rs.looked));
            } else row.appendChild(el('div', 'na-lay-bar ghost', 'waiting…'));
            col.appendChild(row);
          });
          grid.appendChild(col);
        });
        // wire (hex dump coloured by layer)
        NA.clear(wireBox);
        if (st.pos >= 4) {
          var o = st.enc.offsets, head = el('div', 'na-lab', st.pos >= 5 ? 'Bits on the wire — the whole frame, ' + st.enc.total + ' bytes (hex)' : 'The finished frame — ' + st.enc.total + ' bytes (hex)');
          wireBox.appendChild(head);
          var dump = el('div', 'na-hexdump');
          st.wire.forEach(function (b, i) {
            var cl = i < o.eth[1] ? 'eth' : i < o.ip[1] ? 'ip' : i < o.tr[1] ? 'tr' : i < o.data[1] ? 'app' : 'eth';
            var flipped = st.pos >= 5 && st.flip && i === st.flipAt;
            dump.appendChild(el('span', 'hx c-' + cl + (flipped ? ' flipped' : ''), Stack.hex(b, 2)));
          });
          wireBox.appendChild(dump);
          if (st.pos >= 5 && st.flip) wireBox.appendChild(el('div', 'na-note', '⚡ One bit of byte ' + (st.flipAt + 1) + ' (red) was flipped by noise on the line.'));
        }
        sPay.set(st.enc.payload.length + ' B', 'the text you typed');
        sTot.set(st.enc.total + ' B', st.pos >= 4 ? 'every layer’s headers included' : 'when all headers are added');
        sOvh.set(st.enc.overheadPct.toFixed(0) + '%', st.enc.overheadBytes + ' bytes of headers for ' + st.enc.payload.length + ' of data');
        paintFields();
        playBtn.textContent = st.pos >= 9 || st.failed ? '↻ Send again' : '▶ Send';
        playBtn.disabled = st.running; stepBtn.disabled = st.running || st.pos >= 9 || !!st.failed;
      }
      function paintFields() {
        NA.clear(fieldsBox);
        if (!st.shown) { fieldsBox.appendChild(el('p', 'na-note', 'Click a coloured header (TCP, IP, Ethernet, FCS) once it has been added to see what is inside it.')); return; }
        var e = st.enc, hd = null;
        e.layers.forEach(function (l) { if (l.header && l.header.id === st.shown) hd = l.header; if (l.trailer && l.trailer.id === st.shown) hd = l.trailer; });
        if (st.shown === 'data') hd = { name: 'Your data', size: e.payload.length, fields: [['Text', '“' + st.msg + '”'], ['Bytes (hex)', e.payload.slice(0, 16).map(function (b) { return Stack.hex(b, 2); }).join(' ') + (e.payload.length > 16 ? ' …' : '')], ['Size', e.payload.length + ' bytes (UTF-8)']] };
        if (!hd) return;
        var h = '<div class="na-lab">' + NA.esc(hd.name) + ' — ' + hd.size + ' bytes</div><table class="na-table"><tbody>';
        hd.fields.forEach(function (f) { h += '<tr><th scope="row">' + NA.esc(f[0]) + '</th><td>' + NA.esc(String(f[1])) + '</td></tr>'; });
        fieldsBox.innerHTML = h + '</tbody></table>';
      }
      function narrate(i) {   // i = step index just completed
        var e = st.enc, P = e.proto.toUpperCase(), q = '“' + NA.esc(st.msg) + '”';
        if (i === 0) return '<b>① Application layer.</b> Your program hands over the message ' + q + ' (' + e.payload.length + ' bytes). There is no header yet: this layer only decides <i>what</i> to say. It knows nothing about ports, addresses or cables.';
        if (i === 1) return '<b>② Transport layer</b> puts a <b>' + e.layers[1].header.size + '-byte ' + P + ' header</b> in front: source port 50001, destination port ' + e.ctx.dstPort + ' (which program on the server). ' + (e.proto === 'tcp' ? 'TCP also adds sequence numbers, so the receiver can notice a missing piece and ask again — registered mail.' : 'UDP adds almost nothing: no numbers, no promises — a postcard, but fast.') + ' Header + data = one <i>' + e.layers[1].unit + '</i>.';
        if (i === 2) return '<b>③ Internet layer</b> adds the <b>20-byte IP header</b>: from ' + e.ctx.srcIp + ' to ' + e.ctx.dstIp + ', time-to-live 64, protocol ' + (e.proto === 'tcp' ? '6 = TCP' : '17 = UDP') + ' so the far end knows what is inside. Routers read only this header. → one <i>packet</i>.';
        if (i === 3) return '<b>④ Network-interface layer</b> adds the <b>14-byte Ethernet header</b> (destination and source MAC address, type 0x0800 = “IPv4 inside”) and a <b>4-byte trailer, the FCS</b>: a real CRC-32 (<code>0x' + Stack.hex(e.fcs, 8) + '</code>) computed over every byte before it. → one <i>frame</i> of ' + e.total + ' bytes. Overhead: ' + e.overheadBytes + ' bytes of headers around your ' + e.payload.length + '.';
        if (i === 4) return st.flip ? '<b>⑤ On the wire.</b> The frame leaves as ' + e.total * 8 + ' bits of light, radio or voltage. <span class="bad">⚡ Noise flips one bit</span> in byte ' + (st.flipAt + 1) + ' — nobody notices yet.' : '<b>⑤ On the wire.</b> The frame leaves as ' + e.total * 8 + ' bits (voltage, light or radio). Nothing goes wrong this time.';
        var s = st.rx.steps[i - 5];
        if (!s) return '';
        var L = ['network-interface', 'internet', 'transport', 'application'][i - 5];
        if (!s.ok) {
          return '<b>⑥ The receiver’s network-interface layer looks at ' + s.looked + '.</b> <span class="bad">' + NA.esc(s.did) + '</span> ' +
            (e.proto === 'tcp' ? '<b>With TCP</b> the sender never gets an acknowledgement, waits for a timeout and <b>sends the segment again</b> (see 9.8). Nothing above this layer ever sees the damaged data.' : '<b>With UDP</b> nobody retransmits: the message is simply <b>lost</b>, and the application has to cope (a call just glitches).');
        }
        return '<b>' + ['⑥', '⑦', '⑧', '⑨'][i - 5] + ' Receiver, ' + L + ' layer</b> looks only at ' + s.looked + ': ' + NA.esc(s.did) + (i === 8 ? ' <span class="ok">Delivered ✓</span> — each layer used only its own header and never opened the one above.' : '');
      }
      function advance() {
        if (st.pos >= 9 || st.failed) return false;
        var i = st.pos; st.pos++;
        if (i >= 5) { var s = st.rx.steps[i - 5]; if (s && !s.ok) st.failed = s.layer; }
        if (i === 0 && !st.shown) st.shown = null;
        paint(); nar.say(narrate(i));
        return !st.failed && st.pos < 9;
      }
      function stepOnce() { if (st.running) return; advance(); }
      function play() {
        if (st.running) return;
        if (st.pos >= 9 || st.failed) { reset(); }
        var g = run.start(); st.running = true; paint();
        (async function () {
          while (true) {
            var more = advance();
            if (!more) break;
            if (!await run.sleep(g, NA.dur(1500))) return;
          }
          st.running = false; paint();
        })();
      }
      function reset() { run.cancel(); st.running = false; st.pos = 0; st.failed = null; compute(); }
      function hardReset() { reset(); st.shown = null; paint(); nar.say('Ready. Press <b>Send</b> to wrap “' + NA.esc(st.msg) + '” layer by layer, or <b>Step</b> to go one layer at a time.'); }
      compute(); paint(); nar.say('Ready. Press <b>Send</b> to wrap “' + NA.esc(st.msg) + '” layer by layer, or <b>Step</b> to go one layer at a time.');
    }
  });
})();
