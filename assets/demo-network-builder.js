/* Network Builder — CO1005 Chapter 9 demo game.
   A SIMULATION: place devices, cable them, set IP / mask / gateway / DNS, press Send and watch a packet travel hop by hop.
   The checker for every level uses the very same send() logic as the animation.
   Simplifications (also stated on the page): no ARP tables (a "who has X?" broadcast just finds the owner), frames are
   never lost at random, firewalls are stateful (replies always pass), NAT only on the default route, no routing
   protocols (each router has connected subnets + one default route), no MAC addresses, no IPv6.
   Only documentation ranges (192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24) and RFC 1918 private ranges are used.
   Reuses the IPv4 helpers of packet-journey.js. Pure engine first (exported for Node), UI after the DOM check. */
(function (global) {
  'use strict';
  var PJ = (typeof require === 'function' && typeof module !== 'undefined' && module.exports) ? require('./packet-journey.js') : global.PacketJourney;

  /* ------------------------------------------------------------ device catalogue */
  var TYPES = {
    pc:       { label: 'PC',          glyph: 'PC',  host: true, ports: 1, cost: 0 },
    laptop:   { label: 'Laptop',      glyph: 'LT',  host: true, ports: 1, cost: 0, wifi: true },
    server:   { label: 'Server',      glyph: 'SRV', host: true, ports: 1, cost: 0 },
    switch:   { label: 'Switch',      glyph: 'SW',  l2: true, ports: 6, cost: 12 },
    hub:      { label: 'Hub',         glyph: 'HUB', l2: true, ports: 4, cost: 4 },
    ap:       { label: 'Wi-Fi AP',    glyph: 'AP',  l2: true, ports: 6, cost: 15 },
    firewall: { label: 'Firewall',    glyph: 'FW',  l2: true, fw: true, ports: 2, cost: 20 },
    router:   { label: 'Router',      glyph: 'RT',  router: true, ports: 3, cost: 30 },
    internet: { label: 'ISP / Internet', glyph: 'ISP', inet: true, ports: 1, cost: 0 }
  };
  var CABLE_COST = 1;
  /* The invented "rest of the Internet" behind the ISP node. Names come from the Packet Journey zone. */
  var WORLD = {
    '203.0.113.10': { name: 'www.example.com', tcp: [80, 443, 23] },
    '198.51.100.20': { name: 'example.org', tcp: [80, 443] },
    '203.0.113.7': { name: 'api.example.net', tcp: [80, 443] },
    '198.51.100.53': { name: 'resolver', udp: [53], dns: true }
  };
  var RECORDS = {};
  Object.keys(WORLD).forEach(function (ip) { if (WORLD[ip].name !== 'resolver') RECORDS[WORLD[ip].name] = ip; });
  var ISP_IP = '192.0.2.1', ISP_MASK = '255.255.255.252';

  /* ------------------------------------------------------------ network model */
  function newNet() { return { devices: [], links: [], byKey: {}, nextId: 1, nextLink: 1 }; }
  function dev(net, id) { for (var i = 0; i < net.devices.length; i++) if (net.devices[i].id === id) return net.devices[i]; return null; }
  function T_(d) { return TYPES[d.type]; }
  function addDevice(net, type, key, x, y, props) {
    var t = TYPES[type], n = 1;
    net.devices.forEach(function (d) { if (d.type === type) n++; });
    var d = { id: 'd' + (net.nextId++), key: key || null, type: type, name: t.label + ' ' + n, x: x || 0, y: y || 0 };
    if (t.host) { d.ip = ''; d.mask = ''; d.gw = ''; d.dns = ''; d.services = type === 'server' ? [80, 23] : []; }
    if (t.router) { d.ifaces = [{ ip: '', mask: '' }, { ip: '', mask: '' }, { ip: '', mask: '' }]; d.gw = ''; d.nat = false; }
    if (t.fw) { d.rules = []; d.policy = 'allow'; }
    if (t.inet) { d.ip = ISP_IP; d.mask = ISP_MASK; d.name = 'Internet'; }
    if (props) for (var k in props) d[k] = props[k];
    net.devices.push(d);
    if (key) net.byKey[key] = d;
    return d;
  }
  function linksOf(net, id) { return net.links.filter(function (l) { return l.a === id || l.b === id; }); }
  function peerOf(l, id) { return l.a === id ? l.b : l.a; }
  function neighbors(net, id) { return linksOf(net, id).map(function (l) { return peerOf(l, id); }); }
  function wiredCount(net, d) { return linksOf(net, d.id).filter(function (l) { return !l.wireless; }).length; }
  function addLink(net, aId, bId, opts) {
    var a = dev(net, aId), b = dev(net, bId);
    if (!a || !b) return { ok: false, error: 'Unknown device.' };
    if (a === b) return { ok: false, error: 'A cable needs two different devices.' };
    if (net.links.some(function (l) { return (l.a === a.id && l.b === b.id) || (l.a === b.id && l.b === a.id); }))
      return { ok: false, error: a.name + ' and ' + b.name + ' are already cabled together.' };
    var wireless = (a.type === 'laptop' && b.type === 'ap') || (b.type === 'laptop' && a.type === 'ap');
    var e = null;
    if (a.type === 'laptop' && b.type !== 'ap') e = a.name + ' has no Ethernet port: it can only join a Wi-Fi access point.';
    if (b.type === 'laptop' && a.type !== 'ap') e = b.name + ' has no Ethernet port: it can only join a Wi-Fi access point.';
    if (!e && a.type === 'ap' && (T_(b).host)) { if (b.type !== 'laptop') e = b.name + ' has no Wi-Fi card: plug it into a switch with a cable.'; }
    if (!e && b.type === 'ap' && (T_(a).host)) { if (a.type !== 'laptop') e = a.name + ' has no Wi-Fi card: plug it into a switch with a cable.'; }
    if (e) return { ok: false, error: e };
    var cap = function (d, w) {
      if (d.type === 'ap') return w ? linksOf(net, d.id).filter(function (l) { return l.wireless; }).length < 5 : wiredCount(net, d) < 1;
      return linksOf(net, d.id).length < T_(d).ports;
    };
    if (!cap(a, wireless)) return { ok: false, error: a.name + (a.type === 'ap' ? ' accepts only one cable (its uplink) and 5 Wi-Fi clients.' : ' has no free port (' + T_(a).ports + ' max).') };
    if (!cap(b, wireless)) return { ok: false, error: b.name + (b.type === 'ap' ? ' accepts only one cable (its uplink) and 5 Wi-Fi clients.' : ' has no free port (' + T_(b).ports + ' max).') };
    var l = { id: 'l' + (net.nextLink++), a: a.id, b: b.id, wireless: wireless, pa: null, pb: null };
    net.links.push(l);
    [a, b].forEach(function (d, i) {
      if (!T_(d).router) return;
      var used = {};
      linksOf(net, d.id).forEach(function (x) { if (x !== l) used[x.a === d.id ? x.pa : x.pb] = true; });
      var s = 0; while (used[s]) s++;
      if (i === 0) l.pa = s; else l.pb = s;
    });
    if (opts) for (var k in opts) l[k] = opts[k];
    return { ok: true, link: l };
  }
  function removeLink(net, id) { net.links = net.links.filter(function (l) { return l.id !== id; }); }
  function removeDevice(net, id) {
    var d = dev(net, id); if (!d) return;
    net.links = net.links.filter(function (l) { return l.a !== id && l.b !== id; });
    net.devices = net.devices.filter(function (x) { return x !== d; });
    if (d.key) delete net.byKey[d.key];
  }
  function slotOf(l, id) { return l.a === id ? l.pa : l.pb; }
  function costOf(net) {
    var c = 0;
    net.devices.forEach(function (d) { if (d.added) c += T_(d).cost; });
    net.links.forEach(function (l) { if (l.added && !l.wireless) c += CABLE_COST; });
    return c;
  }

  /* ------------------------------------------------------------ addressing helpers */
  function maskPrefix(text) { // accepts 255.255.255.0, 24 or /24 -> prefix or -1
    var s = String(text || '').trim(), m;
    if (!s) return -1;
    if ((m = /^\/?(\d{1,2})$/.exec(s))) { var p = parseInt(m[1], 10); return p <= 32 ? p : -1; }
    var v = PJ.parseIPv4(s);
    return v === null ? -1 : PJ.prefixFromMask(v);
  }
  function cfgOf(ipText, maskText) {
    var ip = PJ.parseIPv4(ipText);
    if (ip === null) return { err: 'no-ip', val: ipText };
    var p = maskPrefix(maskText);
    if (p < 0) return { err: 'bad-mask', val: maskText };
    var info = PJ.subnetInfo(ip, p);
    if (p < 31 && (ip === info.network || ip === info.broadcast)) return { err: 'bad-addr', val: ipText, which: ip === info.network ? 'network' : 'broadcast', info: info };
    return { ip: ip, p: p, info: info };
  }
  function ifaceCfg(net, d, slot) { // valid, cabled interface of a router
    var link = null;
    linksOf(net, d.id).forEach(function (l) { if (slotOf(l, d.id) === slot) link = l; });
    if (!link) return null;
    var c = cfgOf(d.ifaces[slot].ip, d.ifaces[slot].mask);
    if (c.err) return null;
    c.link = link; c.peer = peerOf(link, d.id); c.slot = slot;
    return c;
  }

  /* ------------------------------------------------------------ layer-2 domain (switch / hub / AP / firewall are transparent) */
  function domain(net, startId, viaId) {
    var via = dev(net, viaId);
    if (!T_(via).l2) return { l2: [], ends: [{ id: viaId, via: startId }], cycle: false, prev: {}, hubs: [], direct: true };
    var prev = {}, l2 = [viaId], ends = [], seen = {}, q = [viaId];
    seen[viaId] = true; prev[viaId] = startId;
    while (q.length) {
      var cur = q.shift();
      neighbors(net, cur).forEach(function (n) {
        if (n === startId) return;
        var nd = dev(net, n);
        if (T_(nd).l2) { if (!seen[n]) { seen[n] = true; prev[n] = cur; l2.push(n); q.push(n); } }
        else ends.push({ id: n, via: cur });
      });
    }
    var edges = 0;
    net.links.forEach(function (l) { if (seen[l.a] && seen[l.b]) edges++; });
    return { l2: l2, ends: ends, cycle: edges > l2.length - 1, prev: prev, hubs: l2.filter(function (i) { return dev(net, i).type === 'hub'; }), direct: false };
  }
  function ownersOf(net, dom, ipInt, exceptId) {
    var out = [];
    dom.ends.forEach(function (e) {
      if (e.id === exceptId) return;
      var d = dev(net, e.id), t = T_(d), mine = false, iface = null;
      if (t.host || t.inet) { var c = cfgOf(d.ip, d.mask); mine = !c.err && c.ip === ipInt; }
      else if (t.router) {
        linksOf(net, d.id).forEach(function (l) {
          if (peerOf(l, d.id) !== e.via) return;
          var ic = ifaceCfg(net, d, slotOf(l, d.id));
          if (ic && ic.ip === ipInt) { mine = true; iface = ic; }
        });
      }
      if (mine) out.push({ id: e.id, via: e.via, dev: d, iface: iface });
    });
    return out;
  }
  function whoOwnsAnywhere(net, ipInt) {
    var r = null;
    net.devices.forEach(function (d) {
      var t = T_(d);
      if (t.host || t.inet) { var c = cfgOf(d.ip, d.mask); if (!c.err && c.ip === ipInt) r = d; }
      else if (t.router) d.ifaces.forEach(function (f) { var c = cfgOf(f.ip, f.mask); if (!c.err && c.ip === ipInt) r = d; });
    });
    return r;
  }

  /* ------------------------------------------------------------ firewall */
  function ruleText(r) { return r.action + ' ' + r.proto + (r.proto === 'icmp' ? '' : ' port ' + r.port); }
  function fwDecide(fw, proto, port) {
    for (var i = 0; i < fw.rules.length; i++) {
      var r = fw.rules[i];
      if ((r.proto === 'any' || r.proto === proto) && (r.port === 'any' || r.port === '' || (port !== null && Number(r.port) === Number(port))))
        return { allow: r.action === 'allow', rule: i, text: 'rule ' + (i + 1) + ': ' + ruleText(r) };
    }
    return { allow: fw.policy !== 'deny', rule: -1, text: 'no rule matched, so the default policy "' + (fw.policy === 'deny' ? 'block' : 'allow') + '" applies' };
  }

  /* ------------------------------------------------------------ explanations */
  var PROTO = { icmp: 'ping (ICMP)', tcp: 'TCP', udp: 'UDP' };
  function svcName(proto, port) {
    var n = { 80: 'HTTP', 443: 'HTTPS', 23: 'Telnet', 53: 'DNS', 22: 'SSH', 25: 'SMTP' }[port];
    return proto === 'icmp' ? 'ping' : (n ? n + ' ' : '') + String(proto || '').toUpperCase() + ' port ' + port;
  }
  function describe(code, c) {
    var n = c.n || 'The device', M = {
      'no-ip': ['' + n + ' has no valid IP address.', 'A computer needs an IPv4 address (four numbers 0-255, no leading zeros) before it can send anything. Current value: "' + (c.val || '') + '".', 'address'],
      'bad-mask': ['The subnet mask of ' + n + ' is missing or invalid.', 'A mask is a block of 1-bits followed by 0-bits, like 255.255.255.0 (/24). Current value: "' + (c.val || '') + '".', 'mask'],
      'bad-addr': [n + ' uses ' + c.val + ', which is the ' + c.which + ' address of its subnet.', 'The first address of a subnet names the network and the last one is the broadcast address; neither can belong to a single computer. Pick an address in between.', 'address'],
      'no-link': [n + ' is not cabled to anything.', 'Without a cable (or Wi-Fi association) no packet can leave the device.', 'cable'],
      'no-gw': [n + ' wants to reach ' + c.dst + ', which is outside its own subnet (' + c.net + '), but it has no default gateway.',
        'A computer talks directly only to addresses in its own subnet. For everything else it hands the packet to the default gateway, which is a router. A switch never connects different subnets, so with no gateway the packet cannot even leave.', 'gateway'],
      'bad-gw': [n + ' has an invalid default gateway ("' + c.val + '").', 'The gateway must be a valid IPv4 address.', 'gateway'],
      'gw-offsubnet': ['The gateway ' + c.gw + ' of ' + n + ' is not inside its own subnet (' + c.net + ').',
        'The gateway must be reachable directly, so it has to be an address of the same subnet as the computer (check the gateway typed in, and the mask).', 'gateway'],
      'no-arp': c.viaGw
        ? ['Nobody answers for the gateway address ' + c.nh + '.', n + ' broadcast "who has ' + c.nh + '?" on its LAN and nothing replied. Either the gateway field is wrong, or the router port facing this LAN is not configured with exactly that address' + (c.nhOwner ? ' (' + c.nhOwner.name + ' owns it, but it is not on this LAN)' : '') + '.', 'gateway']
        : ['Nobody on ' + n + "'s LAN has the address " + c.nh + '.',
          n + ' decided ' + c.nh + ' is in its own subnet (' + c.net + '), so it did not use a gateway; it broadcast "who has ' + c.nh + '?" on the LAN and nobody replied.' +
            (c.byMask ? ' Look at the mask: /' + c.p + ' is so wide that addresses that really live behind a router look local. A narrower mask makes ' + n + ' use the gateway.' : '') +
            (c.nhOwner ? ' (' + c.nhOwner.name + ' does own that address, but on another LAN: only a router can get there.)' : ''), c.byMask ? 'mask' : 'subnet'],
      'loop': ['Broadcast storm: the switches are cabled in a loop.',
        'Ethernet frames carry no hop counter. A broadcast ("who has ...?") entering a loop of switches is copied around it forever and multiplies at every switch until the network is jammed. Real switches run Spanning Tree Protocol to switch one cable off; this toy has none, so remove one of the cables that closes the loop.', 'loop'],
      'dup-ip': ['Several devices on this LAN claim ' + c.nh + ' (' + c.names + ').', 'Two devices with the same address make replies ambiguous; every address in a subnet must be unique.', 'address'],
      'not-router': [c.tgt + ' answered for the gateway address ' + c.nh + ' but it is an ordinary ' + c.tgtType + ': it does not forward packets.', 'The default gateway must be a router interface. End devices drop packets that are not addressed to them.', 'gateway'],
      'no-route': [n + ' has no route to ' + c.dst + '.', 'A router forwards a packet out of the port whose subnet contains the destination (a connected route). Failing that it uses its default route. Here no cabled port with a valid address matches and no usable default route is set.', 'router'],
      'no-route-gw': [n + "'s default gateway " + c.gw + ' is not inside any subnet this router is connected to.', 'The next hop of a default route must be reachable directly through one of the router\'s own ports.', 'router'],
      'ttl': ['The packet was forwarded too many times (TTL expired).', 'Every router lowers the packet\'s TTL by one; at zero it is thrown away. Routers sending a packet back and forth (a routing loop) are caught that way.', 'router'],
      'firewall': ['The firewall ' + n + ' dropped the packet (' + c.text + ').', 'A firewall compares each packet with its rules from top to bottom; the first matching rule decides, and if none matches the default policy decides. A dropped packet gets no answer, so the sender just times out.', 'firewall'],
      'private-src': ['The ISP dropped the packet: its source address ' + c.src + ' is a private (RFC 1918) address.', 'Private addresses are valid only inside a LAN and are not routable on the Internet. A NAT router rewrites the source of outgoing packets to its own public address and undoes it for the replies. Turn NAT on in the router.', 'nat'],
      'world-unreachable': ['No host answers at ' + c.dst + ' on the Internet.', 'The packet reached the ISP, but no machine owns that address (check the address you typed).', 'address'],
      'refused': [c.tgt + ' is reachable, but nothing listens on ' + svcName(c.proto, c.port) + '.', c.proto === 'tcp' ? 'The host replied with a TCP reset (RST): the port is closed, no handshake.' : 'The host replied "port unreachable": no service of that kind runs there.', 'service'],
      'dns-none': [n + ' has no DNS server configured (or the address is invalid), so it cannot turn "' + c.name + '" into an IP address.', 'Before a browser can connect to a name, the computer asks a DNS server for the address. The DNS server address is part of every computer\'s network settings.', 'dns'],
      'nxdomain': ['The DNS server answered "no such name": ' + c.name + '.', 'NXDOMAIN: the name does not exist in this simulated Internet (it only knows www.example.com, example.org and api.example.net).', 'dns']
    };
    var r = M[code] || ['The packet failed (' + code + ').', '', 'other'];
    return { head: r[0], why: r[1], lesson: r[2] };
  }

  /* ------------------------------------------------------------ the simulator */
  function say(T, d, text) { T.log.push({ at: T.moves.length, dev: d ? d.id : null, text: text, phase: T.phase }); }
  function move(T, from, to, label, extra) {
    var m = { from: from, to: to, phase: T.phase, label: label || '', hdr: null, pre: null, ev: null };
    if (extra) for (var k in extra) m[k] = extra[k];
    T.moves.push(m); return m;
  }
  /* The header fields a packet carries while it is on one link (shown by the live header strip). */
  function protoName(p) { return p === 'icmp' ? 'ICMP' : p === 'udp' ? 'UDP' : 'TCP'; }
  function hdrOf(H) { return { src: H.src, dst: H.dst, ttl: H.ttl, sport: H.sport, dport: H.dport, proto: H.proto, nat: !!H.nat, reply: !!H.reply }; }
  function swapHdr(h, ttl) { return { src: h.dst, dst: h.src, sport: h.dport, dport: h.sport, proto: h.proto, ttl: ttl, nat: h.nat, reply: true }; }
  function portNo(net, node, otherId) { var ls = linksOf(net, node.id); for (var i = 0; i < ls.length; i++) if (peerOf(ls[i], node.id) === otherId) return i + 1; return 0; }
  function ephemeral(id) { var h = 0; for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 9973; return 49152 + h % 9000; }
  function fail(T, code, d, ctx) {
    ctx = ctx || {}; ctx.n = ctx.n || (d && d.name);
    var m = describe(code, ctx);
    T.ok = false; T.code = code; T.failAt = d ? d.id : null; T.lesson = m.lesson;
    var pre = T.phase === 'reply' ? 'The request arrived, but the reply could not get back. ' : T.phase === 'dns' ? 'The name lookup failed. ' : '';
    T.headline = pre + m.head; T.why = m.why + (T.phase === 'dns' ? ' Check the DNS server address in the computer\'s network settings: it must belong to a real DNS server.' : '');
    say(T, d, 'DROPPED: ' + m.head);
    return { ok: false };
  }
  function pathTo(dom, startId, owner) {
    var chain = [], n = owner.via;
    if (dom.direct) return [startId, owner.id];
    while (n !== startId) { chain.unshift(n); n = dom.prev[n]; }
    return [startId].concat(chain, [owner.id]);
  }
  function isPrivate(ipInt) { return /^private/.test(PJ.classifyIPv4(ipInt)); }

  /* forward one packet from o.src towards o.dst (int) */
  function forward(net, T, o) {
    var cur = o.src, dstStr = PJ.intToIp(o.dst), srcIp = o.srcIp, ttl = 10, nat = false;
    var label = o.label, dsp = o.disp || { proto: o.proto, sport: null, dport: o.port };
    var H = { src: '', dst: dstStr, ttl: o.ttl0 || 64, sport: dsp.sport, dport: dsp.dport, proto: protoName(dsp.proto), nat: false, reply: !!o.stateful };
    var pend = null;
    o.moveStart = T.moves.length;
    if (T_(cur).host) {
      var c0 = cfgOf(cur.ip, cur.mask);
      if (c0.err) return fail(T, c0.err, cur, { val: c0.val, which: c0.which });
      srcIp = c0.ip; H.src = PJ.intToIp(srcIp);
      if (o.dst === srcIp) { say(T, cur, cur.name + ' is sending to its own address: it never leaves the machine.'); return { ok: true, tgt: cur, kind: 'self' }; }
    }
    while (true) {
      if (--ttl < 0) return fail(T, 'ttl', cur, {});
      var nh, peerId, viaGw = false, byMask = false, viaDefault = false, egress = null, hostNet = '', hostP = 0;
      if (!H.src) H.src = PJ.intToIp(srcIp);
      pend = { dev: cur.id, list: [] };
      if (T_(cur).host) {
        var c = cfgOf(cur.ip, cur.mask);
        var nb = neighbors(net, cur.id);
        if (!nb.length) return fail(T, 'no-link', cur, {});
        peerId = nb[0];
        if (PJ.sameSubnet(c.ip, o.dst, c.p)) {
          nh = o.dst; byMask = true;
          say(T, cur, cur.name + ' (' + PJ.intToIp(c.ip) + '/' + c.p + '): ' + dstStr + ' is inside my subnet ' + PJ.intToIp(c.info.network) + '/' + c.p + ', so I deliver it directly on the LAN.');
          pend.list.push({ kind: 'host', text: 'Compares ' + dstStr + ' with its own subnet ' + PJ.intToIp(c.info.network) + '/' + c.p + ': same subnet, so it sends straight to the destination (no gateway).' });
        } else {
          if (!String(cur.gw).trim()) return fail(T, 'no-gw', cur, { dst: dstStr, net: PJ.intToIp(c.info.network) + '/' + c.p });
          var g = PJ.parseIPv4(cur.gw);
          if (g === null) return fail(T, 'bad-gw', cur, { val: cur.gw });
          if (!PJ.sameSubnet(c.ip, g, c.p)) return fail(T, 'gw-offsubnet', cur, { gw: cur.gw, net: PJ.intToIp(c.info.network) + '/' + c.p });
          nh = g; viaGw = true;
          say(T, cur, cur.name + ': ' + dstStr + ' is outside my subnet ' + PJ.intToIp(c.info.network) + '/' + c.p + ', so I send it to my default gateway ' + cur.gw + '.');
          pend.list.push({ kind: 'host', text: 'Compares ' + dstStr + ' with its own subnet ' + PJ.intToIp(c.info.network) + '/' + c.p + ': different subnet, so the frame goes to the default gateway ' + cur.gw + '.' });
        }
        hostNet = PJ.intToIp(c.info.network) + '/' + c.p; hostP = c.p;
      } else { // router
        var best = null;
        for (var s = 0; s < cur.ifaces.length; s++) {
          var ic = ifaceCfg(net, cur, s);
          if (ic && PJ.sameSubnet(ic.ip, o.dst, ic.p) && (!best || ic.p > best.p)) best = ic;
        }
        if (best) {
          nh = o.dst; egress = best; peerId = best.peer;
          say(T, cur, cur.name + ' routes ' + dstStr + ': it belongs to the subnet of port eth' + best.slot + ' (' + PJ.intToIp(best.info.network) + '/' + best.p + ') - a connected route.');
          pend.list.push({ kind: 'route', text: 'Reads the destination ' + dstStr + ', finds it in the connected subnet ' + PJ.intToIp(best.info.network) + '/' + best.p + ' (port eth' + best.slot + '), lowers TTL ' + H.ttl + ' \u2192 ' + (H.ttl - 1) + ' and sends it out of eth' + best.slot + '.' });
          H.ttl--;
        } else {
          var gw = PJ.parseIPv4(cur.gw);
          if (gw === null) return fail(T, 'no-route', cur, { dst: dstStr });
          for (var s2 = 0; s2 < cur.ifaces.length; s2++) {
            var ic2 = ifaceCfg(net, cur, s2);
            if (ic2 && PJ.sameSubnet(ic2.ip, gw, ic2.p)) { egress = ic2; break; }
          }
          if (!egress) return fail(T, 'no-route-gw', cur, { gw: cur.gw });
          nh = gw; viaGw = true; viaDefault = true; peerId = egress.peer;
          say(T, cur, cur.name + ': no connected subnet contains ' + dstStr + ', so it takes the default route via ' + cur.gw + ' (port eth' + egress.slot + ').');
          pend.list.push({ kind: 'route', text: 'Reads the destination ' + dstStr + ': no connected subnet matches, so the default route (via ' + cur.gw + ', port eth' + egress.slot + ') is used. TTL ' + H.ttl + ' \u2192 ' + (H.ttl - 1) + '.' });
          H.ttl--;
          if (cur.nat && !nat) {
            nat = true; srcIp = egress.ip;
            say(T, cur, 'NAT: ' + cur.name + ' rewrites the source address to its own ' + PJ.intToIp(egress.ip) + ' so that the Internet can answer.');
            var np = H.sport ? 62000 + (H.sport % 1000) : null;
            pend.list.push({ kind: 'nat', text: 'NAT rewrites the source ' + H.src + (H.sport ? ':' + H.sport : '') + ' \u2192 ' + PJ.intToIp(egress.ip) + (np ? ':' + np : '') + ' and remembers the pair in its translation table, so the reply can be translated back.', priv: H.src + (H.sport ? ':' + H.sport : '') });
            H.src = PJ.intToIp(egress.ip); if (np) H.sport = np; H.nat = true;
          }
        }
      }
      /* ---- layer 2 hop: who owns nh? */
      var dom = domain(net, cur.id, peerId);
      if (dom.cycle) {
        var first = dev(net, dom.l2[0]);
        move(T, cur.id, first.id, 'who has ' + PJ.intToIp(nh) + '?', { hdr: { arp: true, ask: PJ.intToIp(nh) } });
        return fail(T, 'loop', first, {});
      }
      var owners = ownersOf(net, dom, nh, cur.id);
      var nhStr = PJ.intToIp(nh);
      if (!owners.length) {
        var f = dev(net, dom.l2[0] || peerId);
        move(T, cur.id, f.id, 'who has ' + nhStr + '?', { hdr: { arp: true, ask: nhStr } });
        for (var i = 1; i < dom.l2.length && i < 3; i++) move(T, dom.l2[i - 1], dom.l2[i], 'who has ' + nhStr + '?', { hdr: { arp: true, ask: nhStr } });
        return fail(T, 'no-arp', cur, { nh: nhStr, viaGw: viaGw, byMask: byMask, p: hostP, net: hostNet, nhOwner: whoOwnsAnywhere(net, nh), n: cur.name });
      }
      if (owners.length > 1) return fail(T, 'dup-ip', cur, { nh: nhStr, names: owners.map(function (x) { return x.dev.name; }).join(', ') });
      var ow = owners[0], path = pathTo(dom, cur.id, ow);
      for (var k = 1; k < path.length; k++) {
        var node = dev(net, path[k]);
        var mvv = move(T, path[k - 1], path[k], label, { hdr: hdrOf(H), pre: (k === 1 && pend && pend.list.length) ? pend.list : null });
        if (T_(node).fw && !o.stateful) {
          var dec = fwDecide(node, o.proto, o.port);
          say(T, node, node.name + ' checks the packet (' + svcName(o.proto, o.port) + '): ' + dec.text + ' -> ' + (dec.allow ? 'allow' : 'drop') + '.');
          mvv.ev = { kind: 'fw', allow: dec.allow, text: 'Compares the packet (' + svcName(o.proto, o.port) + ') with its rules, top to bottom: ' + dec.text + ' \u2192 ' + (dec.allow ? 'ALLOW' : 'DROP') + '.' };
          if (!dec.allow) return fail(T, 'firewall', node, { text: dec.text });
        } else if (T_(node).fw) {
          mvv.ev = { kind: 'fw', allow: true, text: 'Stateful firewall: this is the answer to a request it already let through, so it passes without a rule check.' };
        } else if (node.type === 'hub') {
          var others = dom.ends.length - 1; // endpoints other than the receiver (the sender is not in ends)
          T.bystanders += Math.max(0, others);
          say(T, node, 'Hub: repeats the signal out of every other port, so ' + Math.max(0, others) + ' other device(s) receive this frame too (one shared collision domain).');
          mvv.ev = { kind: 'hub', text: 'Does not look at the addresses: it repeats the signal out of every other port, so ' + Math.max(0, others) + ' other device(s) hear this frame too.' };
        } else if (node.type === 'switch') {
          if (k === 1) say(T, node, 'Switch: forwards the frame only to the port where the destination lives (ARP and the MAC table are left out of this toy).');
          var pIn = portNo(net, node, path[k - 1]), pOut = k + 1 < path.length ? portNo(net, node, path[k + 1]) : 0;
          mvv.ev = { kind: 'switch', text: 'Learns that the sender sits behind port ' + pIn + ' (MAC table), looks up the destination' + (pOut ? ' and forwards the frame out of port ' + pOut + ' only.' : ' and forwards the frame towards it.') };
        } else if (node.type === 'ap') {
          say(T, node, 'Wi-Fi access point: relays the frame between the radio and the cable.');
          mvv.ev = { kind: 'ap', text: 'Relays the frame between the radio link and the cable (layer 2, no IP decisions).' };
        } else if (k === path.length - 1 && T_(node).host) {
          mvv.ev = { kind: 'host', text: 'Checks that the destination address ' + dstStr + ' is its own and hands the packet up to the ' + (dsp.proto === 'icmp' ? 'ICMP' : svcName(dsp.proto, dsp.dport)) + ' service.' };
        } else if (k === path.length - 1 && node.type === 'internet') {
          mvv.ev = { kind: 'isp', text: 'The ISP takes the packet into the (simulated) Internet and passes it on towards ' + dstStr + '.' };
        }
      }
      var tgt = ow.dev;
      if (tgt.type === 'internet') {
        if (isPrivate(srcIp)) { say(T, tgt, 'Source ' + PJ.intToIp(srcIp) + ' is private.'); return fail(T, 'private-src', tgt, { src: PJ.intToIp(srcIp) }); }
        var isp = cfgOf(tgt.ip, tgt.mask);
        if (o.dst === isp.ip) return finish(net, T, o, tgt, 'inet', srcIp, nat);
        var w = WORLD[dstStr];
        if (!w) return fail(T, 'world-unreachable', tgt, { dst: dstStr });
        say(T, tgt, 'The ISP forwards the packet across the (simulated) Internet to ' + dstStr + '.');
        return finish(net, T, o, tgt, 'world', srcIp, nat, w);
      }
      if (T_(tgt).host) {
        if (nh !== o.dst) return fail(T, 'not-router', cur, { nh: nhStr, tgt: tgt.name, tgtType: T_(tgt).label.toLowerCase() });
        return finish(net, T, o, tgt, 'host', srcIp, nat);
      }
      /* tgt is a router that owns nh */
      if (nh === o.dst) return finish(net, T, o, tgt, 'router', srcIp, nat);
      say(T, tgt, tgt.name + ' receives the frame addressed to its port, looks at the destination IP ' + dstStr + ' and decides where to send it next.');
      cur = tgt;
    }
  }

  function finish(net, T, o, tgt, kind, srcIp, nat, w) {
    var dstStr = PJ.intToIp(o.dst), open = false;
    if (o.proto === 'icmp') open = true;
    else if (kind === 'host') open = o.proto === 'tcp' && tgt.services.indexOf(o.port) >= 0;
    else if (kind === 'world') open = !!(w[o.proto] && w[o.proto].indexOf(o.port) >= 0);
    if (!open) {
      var pn = kind === 'world' ? 'The server at ' + dstStr : tgt.name;
      return fail(T, 'refused', tgt, { tgt: pn, proto: o.proto, port: o.port });
    }
    var res = { ok: true, tgt: tgt, kind: kind, world: w, dstIp: o.dst, natted: nat };
    if (o.stateful) return res;
    say(T, tgt, (kind === 'world' ? 'The server at ' + dstStr : tgt.name) + ' receives the packet and answers' + (o.proto === 'icmp' ? ' (echo reply).' : '.'));
    if (kind === 'world' || kind === 'inet') {
      say(T, tgt, 'The reply travels back along the same path' + (nat ? ' (NAT translates the address back for the inside computer).' : '.'));
      T.reverse = 'assumed';
      var rttl = 64;
      for (var i = T.moves.length - 1; i >= o.moveStart; i--) {
        var mv = T.moves[i];
        if (!mv.hdr || mv.hdr.arp) { T.moves.push({ from: mv.to, to: mv.from, phase: T.phase === 'dns' ? 'dns' : 'reply', label: 'reply', hdr: null, pre: null, ev: null }); continue; }
        var fromDev = dev(net, mv.to), toDev = dev(net, mv.from), rm = { from: mv.to, to: mv.from, phase: T.phase === 'dns' ? 'dns' : 'reply', label: 'reply', hdr: swapHdr(mv.hdr, rttl), pre: null, ev: null };
        if (fromDev && T_(fromDev).router) {
          rm.pre = [{ kind: 'route', text: 'Routes the reply back towards ' + rm.hdr.dst + ': TTL ' + rttl + ' \u2192 ' + (rttl - 1) + '.' }]; rm.hdr.ttl = rttl - 1; rttl--;
        }
        var natPre = (mv.pre || []).filter(function (p) { return p.kind === 'nat'; })[0];
        if (natPre) { rm.ev = { kind: 'nat', text: 'NAT looks the reply up in its translation table and rewrites the destination ' + rm.hdr.dst + (rm.hdr.dport ? ':' + rm.hdr.dport : '') + ' back to the private address ' + natPre.priv + '.' }; rm.natBack = natPre.priv; }
        else if (mv.ev && mv.ev.kind === 'fw') rm.ev = { kind: 'fw', allow: true, text: 'Stateful firewall: the reply belongs to an allowed request, so it passes.' };
        else if (mv.ev && (mv.ev.kind === 'switch' || mv.ev.kind === 'hub' || mv.ev.kind === 'ap')) rm.ev = { kind: mv.ev.kind, text: mv.ev.kind === 'hub' ? 'Repeats the reply out of every other port.' : mv.ev.kind === 'ap' ? 'Relays the reply from the cable to the radio.' : 'Looks up the destination MAC and forwards the reply out of one port only.' };
        else if (toDev && T_(toDev).host) rm.ev = { kind: 'host', text: 'The reply is addressed to this computer, so it is accepted.' };
        T.moves.push(rm);
      }
      return res;
    }
    /* reverse leg: the destination now has to send the answer to our source address */
    var saved = T.phase; T.phase = 'reply';
    var r = forward(net, T, { src: tgt, dst: o.origSrc, proto: 'icmp', port: null, stateful: true, srcIp: o.dst, label: 'reply', origSrc: o.dst,
      disp: { proto: o.disp ? o.disp.proto : o.proto, sport: o.disp ? o.disp.dport : null, dport: o.disp ? o.disp.sport : null } });
    if (!r.ok) return r;
    T.phase = saved;
    return res;
  }

  function newTrace() { return { ok: false, code: null, headline: '', why: '', lesson: null, failAt: null, moves: [], log: [], bystanders: 0, phase: 'request', dstDev: null }; }

  /* dest: {ip:'a.b.c.d'} | {name:'www.example.com'} ; proto icmp|tcp|udp */
  function send(net, srcId, dest, proto, port) {
    var T = newTrace(), src = dev(net, srcId);
    port = proto === 'icmp' ? null : Number(port);
    if (!src || !T_(src).host) { T.headline = 'Choose a computer to send from.'; T.code = 'no-src'; T.why = ''; return T; }
    var dstInt;
    if (dest.name) {
      var name = String(dest.name).trim().toLowerCase().replace(/\.$/, '');
      T.phase = 'dns';
      var dnsIp = PJ.parseIPv4(src.dns);
      if (dnsIp === null) { fail(T, 'dns-none', src, { name: name }); T.headline = 'The name lookup failed. ' + describe('dns-none', { n: src.name, name: name }).head; return T; }
      say(T, src, src.name + ' must turn "' + name + '" into an IP address: it asks its DNS server ' + src.dns + ' (UDP port 53).');
      var d = forward(net, T, { src: src, dst: dnsIp, proto: 'udp', port: 53, label: 'DNS query', origSrc: null, disp: { proto: 'udp', sport: ephemeral(src.id) + 1, dport: 53 } });
      if (!d.ok) return T;
      if (!(d.kind === 'world' && d.world && d.world.dns)) { /* answered something that is not a DNS server */ }
      var ip = RECORDS[name];
      if (!ip) { fail(T, 'nxdomain', src, { name: name }); T.headline = 'The name lookup failed. ' + describe('nxdomain', { name: name }).head; return T; }
      say(T, src, 'DNS answer: ' + name + ' is ' + ip + '.');
      T.dnsAnswer = ip; T.phase = 'request';
      dstInt = PJ.parseIPv4(ip);
    } else {
      var sc = cfgOf(src.ip, src.mask);
      if (sc.err) { fail(T, sc.err, src, { val: sc.val, which: sc.which }); return T; }
      dstInt = PJ.parseIPv4(dest.ip);
      if (dstInt === null) {
        T.headline = dest.label ? dest.label + ' has no valid IP address yet, so there is nothing to send to.' : 'Type the destination as four numbers like 192.0.2.5, or as a name.';
        T.code = 'bad-dest'; T.failAt = null; return T;
      }
    }
    var c = cfgOf(src.ip, src.mask);
    T.dstStr = PJ.intToIp(dstInt);
    var r = forward(net, T, { src: src, dst: dstInt, proto: proto, port: port, label: svcName(proto, port), origSrc: c.err ? 0 : c.ip,
      disp: { proto: proto, sport: proto === 'icmp' ? null : ephemeral(src.id), dport: proto === 'icmp' ? null : port } });
    if (r.ok) {
      T.ok = true; T.code = 'ok'; T.dstDev = r.tgt && r.tgt.id; T.kind = r.kind; T.natted = !!r.natted;
      var hops = 0; T.moves.forEach(function (m) { if (m.phase === 'request') hops++; });
      T.headline = 'Success: ' + svcName(proto, port) + ' to ' + (dest.name ? dest.name + ' (' + T.dstStr + ')' : T.dstStr) + ' worked.';
      T.why = 'The request crossed ' + hops + ' link(s) and the answer came back' + (T.bystanders ? '; the hub also copied each frame to ' + T.bystanders + ' bystander(s) (waste, and anyone could listen)' : '') + '.';
      T.lesson = 'ok';
    }
    return T;
  }

  /* ------------------------------------------------------------ levels */
  var DEF_DNS = '198.51.100.53';
  function H(o) { return o; }
  var LEVELS = [
    { id: 1, title: 'Say hello', inv: ['switch'], budget: null,
      story: 'Mira and Tuan share a lab bench but their PCs are not connected. Give them a switch and addresses in the same subnet so they can ping each other.',
      learn: 'Same subnet + a switch = direct delivery. No router needed.',
      hints: ['Add a switch, then cable both PCs to it (Cable tool or "Connect" button).', 'Give each PC an address from 192.168.1.0/24, for example 192.168.1.10 and 192.168.1.11; the mask is already 255.255.255.0.'],
      build: function (net) {
        addDevice(net, 'pc', 'a', 150, 250, { name: 'Mira PC', mask: '255.255.255.0', locked: true });
        addDevice(net, 'pc', 'b', 750, 250, { name: 'Tuan PC', mask: '255.255.255.0', locked: true });
      },
      checks: [{ id: 'ab', from: 'a', to: 'b', proto: 'icmp', label: 'Mira pings Tuan' }, { id: 'ba', from: 'b', to: 'a', proto: 'icmp', label: 'Tuan pings Mira' }] },
    { id: 2, title: 'Two subnets, one router', inv: ['router'], budget: null,
      story: 'Room A uses 192.168.10.0/24 and room B uses 192.168.20.0/24. Each room has its own switch, but the rooms are not joined. A switch cannot cross subnets - connect them with a router.',
      learn: 'Different subnets need a router. Each router port gets an address inside the subnet it faces, and each PC points its default gateway at that port.',
      hints: ['Add a router and cable it to both switches.', 'Give the router port facing room A the address 192.168.10.1/24 and the port facing room B 192.168.20.1/24 (the inspector shows which switch each port goes to).', 'Set the default gateway of PC A to 192.168.10.1 and of PC B to 192.168.20.1.'],
      build: function (net) {
        addDevice(net, 'pc', 'a', 90, 250, { name: 'PC A', ip: '192.168.10.10', mask: '255.255.255.0', locked: true });
        addDevice(net, 'switch', 'sa', 260, 250, { name: 'Switch A', locked: true });
        addDevice(net, 'switch', 'sb', 640, 250, { name: 'Switch B', locked: true });
        addDevice(net, 'pc', 'b', 810, 250, { name: 'PC B', ip: '192.168.20.10', mask: '255.255.255.0', locked: true });
        addLink(net, 'd1', 'd2', { locked: true }); addLink(net, 'd3', 'd4', { locked: true });
      },
      checks: [{ id: 'ab', from: 'a', to: 'b', proto: 'icmp', label: 'PC A pings PC B' }, { id: 'ba', from: 'b', to: 'a', proto: 'icmp', label: 'PC B pings PC A' }] },
    { id: 3, title: 'Find the three typos', inv: [], budget: null,
      story: 'The print server was moved to its own subnet and now nobody reaches it. The cabling is fine; three settings are wrong. Fix them without adding anything.',
      learn: 'Most "network down" tickets are a wrong gateway, a wrong mask or a missing gateway on the far side. The simulator tells you which.',
      hints: ['Press the play button next to a failing goal: the explanation names the device and the field.', 'The router port facing the clients is 192.168.1.1; the one facing the servers is 192.168.2.1.', 'One PC has a gateway that does not exist, one has a mask that is too wide (use 255.255.255.0), and the server has no gateway at all.'],
      build: function (net) {
        addDevice(net, 'pc', 'a', 100, 130, { name: 'Lan PC', ip: '192.168.1.10', mask: '255.255.255.0', gw: '192.168.1.254', locked: true });
        addDevice(net, 'pc', 'b', 100, 380, { name: 'Ha PC', ip: '192.168.1.20', mask: '255.255.0.0', gw: '192.168.1.1', locked: true });
        addDevice(net, 'switch', 's1', 270, 255, { name: 'Switch 1', locked: true });
        addDevice(net, 'router', 'r', 450, 255, { name: 'Router', locked: true, ifaces: [{ ip: '192.168.1.1', mask: '255.255.255.0' }, { ip: '192.168.2.1', mask: '255.255.255.0' }, { ip: '', mask: '' }] });
        addDevice(net, 'switch', 's2', 630, 255, { name: 'Switch 2', locked: true });
        addDevice(net, 'server', 'srv', 800, 255, { name: 'Print server', ip: '192.168.2.50', mask: '255.255.255.0', gw: '', services: [80], locked: true });
        ['a:s1', 'b:s1', 's1:r', 'r:s2', 's2:srv'].forEach(function (p) { var q = p.split(':'); addLink(net, net.byKey[q[0]].id, net.byKey[q[1]].id, { locked: true }); });
      },
      checks: [{ id: 'a', from: 'a', to: 'srv', proto: 'tcp', port: 80, label: 'Lan PC opens the print server web page' },
        { id: 'b', from: 'b', to: 'srv', proto: 'tcp', port: 80, label: 'Ha PC opens the print server web page' },
        { id: 's', from: 'srv', to: 'a', proto: 'icmp', label: 'The server pings Lan PC' }] },
    { id: 4, title: 'Close the telnet door', inv: ['firewall'], budget: null,
      story: 'The office server offers a website (port 80) and an old Telnet service (port 23) that sends passwords in plain text. Put a firewall between the router and the server and let web traffic in while blocking Telnet.',
      learn: 'A firewall filters by rules: first match wins, otherwise the default policy. Ports tell the server which service a packet wants.',
      hints: ['The server is not cabled yet: connect router - firewall - server (the router port is already configured).', 'Open the firewall: keep the policy "allow" and add the rule "deny tcp 23", or set the policy to "block" and add "allow tcp 80".', 'The two goals must differ: web works, Telnet is dropped BY THE FIREWALL.'],
      build: function (net) {
        addDevice(net, 'pc', 'pc', 100, 250, { name: 'Office PC', ip: '10.0.1.10', mask: '255.255.255.0', gw: '10.0.1.1', locked: true });
        addDevice(net, 'switch', 'sw', 260, 250, { name: 'Switch', locked: true });
        addDevice(net, 'router', 'r', 450, 250, { name: 'Router', locked: true, ifaces: [{ ip: '10.0.1.1', mask: '255.255.255.0' }, { ip: '10.0.2.1', mask: '255.255.255.0' }, { ip: '', mask: '' }] });
        addDevice(net, 'server', 'srv', 800, 250, { name: 'Office server', ip: '10.0.2.10', mask: '255.255.255.0', gw: '10.0.2.1', services: [80, 23], locked: true });
        addLink(net, net.byKey.pc.id, net.byKey.sw.id, { locked: true }); addLink(net, net.byKey.sw.id, net.byKey.r.id, { locked: true });
      },
      checks: [{ id: 'web', from: 'pc', to: 'srv', proto: 'tcp', port: 80, label: 'Open the website (TCP 80)' },
        { id: 'tel', from: 'pc', to: 'srv', proto: 'tcp', port: 23, expect: 'blocked', codes: ['firewall'], label: 'Telnet (TCP 23) must be blocked by the firewall' }] },
    { id: 5, title: 'The spinning loop', inv: [], budget: null, cutLinks: true,
      story: 'Someone cabled three switches in a triangle "for redundancy". Now the whole floor is dead. Find which cable to remove.',
      learn: 'Ethernet has no TTL. A loop of switches makes broadcasts circle and multiply forever (a broadcast storm). Real networks use Spanning Tree to block one link.',
      hints: ['Click a cable between two switches (not a PC cable) and press Delete.', 'Any one of the three switch-to-switch cables will do; the other two keep everything connected.'],
      build: function (net) {
        addDevice(net, 'switch', 's1', 450, 150, { name: 'Switch 1' }); addDevice(net, 'switch', 's2', 250, 330, { name: 'Switch 2' }); addDevice(net, 'switch', 's3', 650, 330, { name: 'Switch 3' });
        addDevice(net, 'pc', 'p1', 450, 50, { name: 'PC 1', ip: '172.16.5.11', mask: '255.255.255.0', locked: true });
        addDevice(net, 'pc', 'p2', 110, 440, { name: 'PC 2', ip: '172.16.5.12', mask: '255.255.255.0', locked: true });
        addDevice(net, 'pc', 'p3', 790, 440, { name: 'PC 3', ip: '172.16.5.13', mask: '255.255.255.0', locked: true });
        [['s1', 's2'], ['s2', 's3'], ['s3', 's1'], ['p1', 's1'], ['p2', 's2'], ['p3', 's3']].forEach(function (p) {
          addLink(net, net.byKey[p[0]].id, net.byKey[p[1]].id, { locked: p[0][0] === 'p' });
        });
      },
      checks: [{ id: '12', from: 'p1', to: 'p2', proto: 'icmp', label: 'PC 1 pings PC 2' }, { id: '23', from: 'p2', to: 'p3', proto: 'icmp', label: 'PC 2 pings PC 3' }, { id: '31', from: 'p3', to: 'p1', proto: 'icmp', label: 'PC 3 pings PC 1' }] },
    { id: 6, title: 'Names, numbers and NAT', inv: [], budget: null,
      story: 'A student can reach nothing outside the dorm. Two settings are wrong: one stops even a ping by number, the other only hurts when you type a name. Fix both.',
      learn: 'Private addresses need NAT to reach the Internet, and a name only works if the computer knows a real DNS server.',
      hints: ['Test the first goal and read why the ISP drops the packet: look at the router.', 'For the name goals: the DNS server of this simulated Internet is the resolver 198.51.100.53 (the campus resolver shown in Chapter 9).'],
      build: function (net) {
        addDevice(net, 'pc', 'pc', 100, 250, { name: 'Student PC', ip: '192.168.1.10', mask: '255.255.255.0', gw: '192.168.1.1', dns: '198.51.100.35', locked: true });
        addDevice(net, 'switch', 'sw', 260, 250, { name: 'Switch', locked: true });
        addDevice(net, 'router', 'r', 450, 250, { name: 'Dorm router', gw: '192.0.2.1', nat: false, locked: true, ifaces: [{ ip: '192.168.1.1', mask: '255.255.255.0' }, { ip: '192.0.2.2', mask: '255.255.255.252' }, { ip: '', mask: '' }] });
        addDevice(net, 'internet', 'isp', 800, 250, { locked: true });
        addLink(net, net.byKey.pc.id, net.byKey.sw.id, { locked: true }); addLink(net, net.byKey.sw.id, net.byKey.r.id, { locked: true }); addLink(net, net.byKey.r.id, net.byKey.isp.id, { locked: true });
      },
      checks: [{ id: 'ip', from: 'pc', ip: '203.0.113.10', proto: 'tcp', port: 80, label: 'Open http://203.0.113.10 (by number)' },
        { id: 'n1', from: 'pc', name: 'www.example.com', proto: 'tcp', port: 80, label: 'Open http://www.example.com (by name)' },
        { id: 'n2', from: 'pc', name: 'api.example.net', proto: 'tcp', port: 80, label: 'Open http://api.example.net (by name)' }] },
    { id: 7, title: 'Dorm floor on a budget', inv: ['switch', 'hub', 'ap', 'router', 'firewall'], budget: 100, noHub: true,
      story: 'Design the network of dorm floor 3: four wired rooms and two Wi-Fi laptops, all online through the ISP, with outgoing Telnet blocked. Computers are pre-configured (gateway 192.168.30.1). Stay within 100 credits: switch 12, hub 4, Wi-Fi AP 15, router 30, firewall 20, each cable 1.',
      learn: 'A real design combines everything: a switch per LAN (never a hub), an AP for wireless, a router with NAT at the edge, a firewall for policy - and addresses that agree.',
      hints: ['One switch has 6 ports: 4 rooms + the AP + the router.', 'Router: LAN port 192.168.30.1/24; ISP port 192.0.2.2/30 with default gateway 192.0.2.1; turn NAT on.', 'The firewall can sit anywhere on the path to the ISP; add "deny tcp 23".', 'Hubs are cheap but they are banned on this floor: one shared collision domain for 6 people is too slow and anyone can listen.'],
      stars: [85, 95, 100],
      build: function (net) {
        var lan = { mask: '255.255.255.0', gw: '192.168.30.1', dns: DEF_DNS, locked: true };
        function host(t, key, name, ip, x, y) { addDevice(net, t, key, x, y, Object.assign({ name: name, ip: ip }, lan)); }
        host('pc', 'r101', 'Room 101', '192.168.30.11', 90, 70); host('pc', 'r102', 'Room 102', '192.168.30.12', 90, 170);
        host('pc', 'r103', 'Room 103', '192.168.30.13', 90, 270); host('pc', 'r104', 'Room 104', '192.168.30.14', 90, 370);
        host('laptop', 'l1', 'Laptop 1', '192.168.30.21', 90, 465); host('laptop', 'l2', 'Laptop 2', '192.168.30.22', 230, 465);
        addDevice(net, 'internet', 'isp', 820, 250, { locked: true });
      },
      checks: [{ id: 'a', from: 'l1', to: 'r101', proto: 'icmp', label: 'Laptop 1 pings Room 101' },
        { id: 'b', from: 'r103', to: 'l2', proto: 'icmp', label: 'Room 103 pings Laptop 2' },
        { id: 'c', from: 'r101', name: 'www.example.com', proto: 'tcp', port: 80, label: 'Room 101 opens www.example.com' },
        { id: 'd', from: 'l2', name: 'api.example.net', proto: 'tcp', port: 443, label: 'Laptop 2 opens api.example.net (HTTPS)' },
        { id: 'e', from: 'r104', ip: '203.0.113.10', proto: 'tcp', port: 23, expect: 'blocked', codes: ['firewall'], label: 'Room 104 must NOT be able to telnet out (blocked by the firewall)' }] },
    { id: 8, title: 'Sandbox', inv: ['pc', 'laptop', 'server', 'switch', 'hub', 'ap', 'router', 'firewall', 'internet'], budget: null, sandbox: true,
      story: 'Build anything. Add devices, cable them, configure them, then use "Send a packet" to see what happens and why. Try a hub with three PCs, two routers in a row, or a firewall with a default policy of block.',
      learn: 'Experiment: every failure message names the device and the setting responsible.', hints: [], build: function () {}, checks: [] }
  ];

  function buildLevel(idx) {
    var L = LEVELS[idx], net = newNet();
    L.build(net);
    net.devices.forEach(function (d) { d.locked = !!d.locked; });
    net.levelIndex = idx;
    return net;
  }
  function addPlayer(net, type, x, y, props) { var d = addDevice(net, type, null, x, y, props); d.added = true; return d; }
  function linkPlayer(net, a, b) { return addLink(net, a, b, { added: true }); }

  function runCheck(net, c) {
    var from = net.byKey[c.from], dest, to;
    if (!from || !dev(net, from.id)) return { pass: false, trace: Object.assign(newTrace(), { headline: 'The sending computer is missing.', code: 'missing' }) };
    if (c.name) dest = { name: c.name };
    else if (c.ip) dest = { ip: c.ip };
    else { to = net.byKey[c.to]; dest = { ip: to ? to.ip : '', label: to ? to.name : 'The destination' }; }
    var t = send(net, from.id, dest, c.proto, c.port);
    var pass = c.expect === 'blocked' ? (!t.ok && (!c.codes || c.codes.indexOf(t.code) >= 0)) : t.ok;
    return { pass: pass, trace: t, dest: dest };
  }
  function evaluate(net, L) {
    var results = L.checks.map(function (c) { var r = runCheck(net, c); r.check = c; return r; });
    var cost = costOf(net), cons = [];
    if (L.budget) cons.push({ ok: cost <= L.budget, text: 'Budget: ' + cost + ' / ' + L.budget + ' credits' });
    if (L.noHub) cons.push({ ok: !net.devices.some(function (d) { return d.type === 'hub'; }), text: 'No hubs (use a switch)' });
    var complete = results.length > 0 && results.every(function (r) { return r.pass; }) && cons.every(function (c) { return c.ok; });
    var stars = 0;
    if (complete) stars = L.stars ? (cost <= L.stars[0] ? 3 : cost <= L.stars[1] ? 2 : 1) : 3;
    return { results: results, constraints: cons, cost: cost, complete: complete, stars: stars };
  }

  /* ------------------------------------------------------------ playback script (pure)
     A trace is a list of moves; each move may carry `pre` (what the sending device does before it sends:
     host decision, router lookup + TTL, NAT) and `ev` (what the receiving device does on arrival: switch
     learn/forward, hub flood, firewall rule, ...). The animation walks this script, one "hop bundle" per move. */
  function playScript(tr) {
    var acts = [];
    tr.moves.forEach(function (m, i) {
      (m.pre || []).forEach(function (p) { acts.push({ t: 'at', mv: i, dev: m.from, item: p, m: m }); });
      acts.push({ t: 'go', mv: i, m: m });
      if (m.ev) acts.push({ t: 'at', mv: i, dev: m.to, item: m.ev, m: m, next: tr.moves[i + 1] || null });
    });
    return acts;
  }
  /* The header strip as it should look when action `a` starts, given the strip's current header `cur`. */
  function headerAt(a, cur) {
    var m = a.m, h = m.hdr;
    if (!h || h.arp) return h || cur;
    if (a.t === 'go') return h;
    var k = a.item.kind, before = a.dev === m.from; // 'pre' item (before sending) or arrival event
    if (before) return k === 'route' ? Object.assign({}, cur || h, { ttl: h.ttl }) : h; // host: packet is built; route: TTL-1; nat: source rewritten
    /* arrival event: NAT on the reply path rewrites the destination back while the router is "inside" */
    if (k === 'nat' && a.next && a.next.hdr && !a.next.hdr.arp && cur) return Object.assign({}, cur, { dst: a.next.hdr.dst, dport: a.next.hdr.dport });
    return cur || h;
  }

  var engine = {
    playScript: playScript, headerAt: headerAt,
    TYPES: TYPES, WORLD: WORLD, LEVELS: LEVELS, CABLE_COST: CABLE_COST,
    newNet: newNet, addDevice: addDevice, addLink: addLink, removeLink: removeLink, removeDevice: removeDevice, dev: dev, linksOf: linksOf, peerOf: peerOf, slotOf: slotOf,
    addPlayer: addPlayer, linkPlayer: linkPlayer, buildLevel: buildLevel, send: send, evaluate: evaluate, costOf: costOf, maskPrefix: maskPrefix, cfgOf: cfgOf,
    fwDecide: fwDecide, ruleText: ruleText, svcName: svcName, domain: domain
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = engine;
  global.NetworkBuilder = engine;
  if (typeof document === 'undefined') return;

  /* ================================================================== UI */
  var NB = engine;
  var SVGNS = 'http://www.w3.org/2000/svg';
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  function svg(tag, attrs, text) {
    var e = document.createElementNS(SVGNS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (text !== undefined) e.textContent = text;
    return e;
  }
  var W = 900, Hh = 520, BW = 110, BH = 64;
  var KEY = 'co1005-nb-progress';
  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function mount(root) {
    var S = { li: 0, net: null, sel: null, selLink: null, cable: false, cableFrom: null, drag: null, hint: 0, evalr: null,
      progress: {}, timer: null, token: null, marks: [], big: false, trace: null, shown: 0 };
    try { S.progress = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { S.progress = {}; }
    function save() { try { localStorage.setItem(KEY, JSON.stringify(S.progress)); } catch (e) {} }

    /* ---------- skeleton ---------- */
    root.textContent = '';
    root.className = 'nb';
    var levelBar = el('div', 'nb-levels'); levelBar.setAttribute('role', 'group'); levelBar.setAttribute('aria-label', 'Levels');
    var main = el('div', 'nb-main');
    var stage = el('div', 'nb-stage'), side = el('div', 'nb-side');
    var toolbar = el('div', 'nb-toolbar'); toolbar.setAttribute('role', 'toolbar'); toolbar.setAttribute('aria-label', 'Build tools');
    var board = svg('svg', { 'class': 'nb-svg', viewBox: '0 0 ' + W + ' ' + Hh, role: 'group', 'aria-label': 'Network canvas. Devices can be dragged, or moved with the arrow keys.' });
    var budget = el('div', 'nb-budget');
    var cap = el('div', 'nb-cap'); cap.setAttribute('aria-live', 'polite');
    var explain = el('section', 'nb-explain'); explain.setAttribute('aria-live', 'off');
    var boardWrap = el('div', 'nb-board'), pop = el('div', 'nb-pop'); pop.hidden = true; pop.setAttribute('aria-hidden', 'true');
    var playRow = el('div', 'nb-play'); playRow.setAttribute('role', 'group'); playRow.setAttribute('aria-label', 'Animation controls');
    var strip = el('div', 'nb-hdr'); strip.setAttribute('role', 'group'); strip.setAttribute('aria-label', 'Live packet header: protocol, source, destination, TTL');
    var key = el('div', 'nb-key'); key.setAttribute('role', 'list'); key.setAttribute('aria-label', 'Colour key: one colour per device type');
    var mission = el('section', 'nb-card nb-mission'), goalsBox = el('section', 'nb-card'), inspector = el('section', 'nb-card nb-insp'), tester = el('section', 'nb-card');
    boardWrap.appendChild(board); boardWrap.appendChild(pop);
    stage.appendChild(toolbar); stage.appendChild(boardWrap); stage.appendChild(key); stage.appendChild(playRow); stage.appendChild(strip); stage.appendChild(budget); stage.appendChild(cap); stage.appendChild(explain);
    side.appendChild(mission); side.appendChild(goalsBox); side.appendChild(inspector); side.appendChild(tester);
    main.appendChild(stage); main.appendChild(side);
    root.appendChild(levelBar); root.appendChild(main);
    var gLinks = svg('g', {}), gDevs = svg('g', {}), gFx = svg('g', { 'pointer-events': 'none' });
    board.appendChild(gLinks); board.appendChild(gDevs); board.appendChild(gFx);

    /* ---------- helpers ---------- */
    var NBt = NB.TYPES;
    function level() { return NB.LEVELS[S.li]; }
    function D(id) { return NB.dev(S.net, id); }
    function setCap(t) { cap.textContent = t || ''; }
    function stopAnim() {
      gen++; if (S.timer) clearTimeout(S.timer); S.timer = null; S.token = null; run = null; gFx.textContent = '';
      hidePop(); unbusy(); clearLink(); setHdr(null); updatePlay();
    }
    function clearFx() { stopAnim(); S.trace = null; explain.className = 'nb-explain'; }
    function pos(id) { var d = D(id); return d ? { x: d.x, y: d.y } : { x: 0, y: 0 }; }
    function portLabel(d, l) { return NBt[d.type].router ? 'eth' + NB.slotOf(l, d.id) : ''; }

    function loadLevel(i) {
      stopAnim(); S.li = i; S.net = NB.buildLevel(i); S.sel = null; S.selLink = null; S.cable = false; S.cableFrom = null; S.hint = 0; S.trace = null;
      explain.textContent = ''; explain.className = 'nb-explain'; explain.style.minHeight = ''; S.exH = 0; setCap('');
      renderAll(); refresh(true);
    }

    /* ---------- level bar ---------- */
    function renderLevels() {
      levelBar.textContent = '';
      NB.LEVELS.forEach(function (L, i) {
        var b = el('button', 'nb-lv', ''); b.type = 'button';
        b.appendChild(el('b', '', L.sandbox ? 'S' : String(L.id)));
        b.appendChild(el('span', '', L.title));
        var st = S.progress[L.id];
        if (st) { var m = el('i', 'nb-lv-done', '✓'); m.setAttribute('aria-label', 'solved'); b.appendChild(m); }
        if (i === S.li) b.setAttribute('aria-current', 'step');
        b.addEventListener('click', function () { loadLevel(i); });
        levelBar.appendChild(b);
      });
    }

    /* ---------- toolbar ---------- */
    function freeSpot() {
      var cands = [];
      for (var y = 90; y <= 440; y += 80) for (var x = 130; x <= 780; x += 110) cands.push({ x: x, y: y, d: Math.abs(x - 450) + Math.abs(y - 250) * 0.6 });
      cands.sort(function (a, b) { return a.d - b.d; });
      for (var i = 0; i < cands.length; i++) {
        var c = cands[i], busy = S.net.devices.some(function (d) { return Math.abs(d.x - c.x) < 95 && Math.abs(d.y - c.y) < 62; });
        if (!busy) return c;
      }
      return { x: 450, y: 250 };
    }
    function renderToolbar() {
      toolbar.textContent = '';
      var L = level();
      L.inv.forEach(function (t) {
        var b = el('button', 'nb-btn nb-add nb-t-' + t, ''); b.type = 'button';
        b.appendChild(el('i', 'nb-sw'));
        b.appendChild(el('span', '', '+ ' + NBt[t].label));
        if (L.budget && NBt[t].cost) b.appendChild(el('small', '', NBt[t].cost + ' cr'));
        b.addEventListener('click', function () {
          var p = freeSpot(), d = NB.addPlayer(S.net, t, p.x, p.y);
          S.sel = d.id; S.selLink = null; clearFx(); setCap(d.name + ' added. Drag it into place, then cable it.'); renderAll(); refresh();
          var g = gDevs.querySelector('[data-id="' + d.id + '"]'); if (g) g.focus();
        });
        toolbar.appendChild(b);
      });
      var cb = el('button', 'nb-btn' + (S.cable ? ' on' : ''), S.cable ? 'Cable tool: ON' : 'Cable tool'); cb.type = 'button';
      cb.setAttribute('aria-pressed', S.cable ? 'true' : 'false'); cb.title = 'Click two devices to join them with a cable (Wi-Fi laptops join an access point)';
      cb.addEventListener('click', function () { S.cable = !S.cable; S.cableFrom = null; setCap(S.cable ? 'Cable tool: click a device, then the device to join it to.' : ''); renderToolbar(); renderCanvas(); });
      toolbar.appendChild(cb);
      var del = el('button', 'nb-btn', 'Delete'); del.type = 'button'; del.id = 'nb-delete'; del.addEventListener('click', deleteSelected); toolbar.appendChild(del);
      var rs = el('button', 'nb-btn', 'Reset level'); rs.type = 'button'; rs.addEventListener('click', function () { loadLevel(S.li); setCap('Level reset.'); }); toolbar.appendChild(rs);
      var bg = el('label', 'nb-chk'); var cbx = el('input'); cbx.type = 'checkbox'; cbx.checked = S.big;
      cbx.addEventListener('change', function () { S.big = cbx.checked; root.classList.toggle('nb-big', S.big); });
      bg.appendChild(cbx); bg.appendChild(el('span', '', 'Projector size')); toolbar.appendChild(bg);
    }
    function deleteSelected() {
      if (S.selLink) {
        var l = S.net.links.filter(function (x) { return x.id === S.selLink; })[0];
        if (l && l.locked) { setCap('That cable is part of the scenario and cannot be removed.'); return; }
        NB.removeLink(S.net, S.selLink); S.selLink = null; setCap('Cable removed.');
      } else if (S.sel) {
        var d = D(S.sel);
        if (d && d.locked) { setCap(d.name + ' is part of the scenario and cannot be removed.'); return; }
        if (d) { NB.removeDevice(S.net, d.id); setCap(d.name + ' removed.'); S.sel = null; }
      } else { setCap('Select a device or a cable first.'); return; }
      clearFx(); renderAll(); refresh();
    }

    /* ---------- canvas ---------- */
    function toSvg(ev) {
      var pt = board.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
      var m = board.getScreenCTM(); return m ? pt.matrixTransform(m.inverse()) : { x: 0, y: 0 };
    }
    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
    function summary(d) {
      var t = NBt[d.type];
      if (t.host || t.inet) { var c = NB.cfgOf(d.ip, d.mask); return [d.ip ? d.ip + (c.err ? '' : '/' + c.p) : (t.inet ? '' : 'no IP')]; }
      if (t.router) { var o = []; d.ifaces.forEach(function (f) { if (f.ip) { var p = NB.maskPrefix(f.mask); o.push(f.ip + (p >= 0 ? '/' + p : '')); } }); return o.length ? o : ['no IPs']; }
      if (t.fw) return [d.rules.length + ' rule(s), ' + (d.policy === 'deny' ? 'block' : 'allow') + ' else'];
      return [];
    }
    function renderCanvas() {
      gLinks.textContent = ''; gDevs.textContent = '';
      S.net.links.forEach(function (l) {
        var a = pos(l.a), b = pos(l.b);
        var g = svg('g', { 'class': 'nb-link' + (l.wireless ? ' wl' : '') + (S.selLink === l.id ? ' sel' : ''), 'data-link': l.id });
        g.appendChild(svg('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, 'class': 'nb-wire' }));
        var hit = svg('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, 'class': 'nb-hit' });
        hit.addEventListener('pointerdown', function (e) { e.stopPropagation(); if (S.cable) return; S.selLink = l.id; S.sel = null; renderCanvas(); renderInspector(); });
        g.appendChild(hit);
        [l.a, l.b].forEach(function (id, k) {
          var d = D(id); if (!NBt[d.type].router) return;
          var p = k === 0 ? a : b, q = k === 0 ? b : a, dx = q.x - p.x, dy = q.y - p.y, len = Math.sqrt(dx * dx + dy * dy) || 1;
          g.appendChild(svg('text', { x: p.x + dx / len * 72, y: p.y + dy / len * 72 - 4, 'class': 'nb-port', 'text-anchor': 'middle' }, 'eth' + (k === 0 ? l.pa : l.pb)));
        });
        gLinks.appendChild(g);
      });
      var perType = {}, runIdx = {};
      S.net.devices.forEach(function (d) { perType[d.type] = (perType[d.type] || 0) + 1; });
      S.net.devices.forEach(function (d) {
        var t = NBt[d.type];
        runIdx[d.type] = (runIdx[d.type] || 0) + 1;
        var g = svg('g', { 'class': 'nb-dev nb-t-' + d.type + (S.sel === d.id ? ' sel' : '') + (S.cableFrom === d.id ? ' from' : '') + (d.locked ? ' locked' : ''),
          transform: 'translate(' + d.x + ',' + d.y + ')', 'data-id': d.id, tabindex: 0, role: 'button' });
        g.setAttribute('aria-label', d.name + ', ' + t.label + (summary(d).length ? ', ' + summary(d).join(', ') : ''));
        g.appendChild(svg('rect', { x: -BW / 2, y: -BH / 2, width: BW, height: BH, rx: 11, 'class': 'nb-box' }));
        g.appendChild(svg('text', { x: 0, y: 0, 'class': 'nb-glyph', 'text-anchor': 'middle' }, t.glyph));
        if (perType[d.type] > 1) { // several devices of this type: a small numbered badge tells them apart (the name stays under the glyph)
          var bd = svg('g', { 'class': 'nb-badge', transform: 'translate(' + (-BW / 2 + 4) + ',' + (-BH / 2 + 4) + ')' });
          bd.appendChild(svg('circle', { r: 9.5 })); bd.appendChild(svg('text', { y: 3.6, 'text-anchor': 'middle' }, String(runIdx[d.type])));
          g.appendChild(bd);
        }
        g.appendChild(svg('text', { x: 0, y: 21, 'class': 'nb-dname', 'text-anchor': 'middle' }, d.name.length > 15 ? d.name.slice(0, 14) + '…' : d.name));
        summary(d).forEach(function (s, i) { g.appendChild(svg('text', { x: 0, y: BH / 2 + 16 + i * 13, 'class': 'nb-dip', 'text-anchor': 'middle' }, s)); });
        g.addEventListener('pointerdown', function (e) { devDown(e, d); });
        g.addEventListener('keydown', function (e) { devKey(e, d); });
        gDevs.appendChild(g);
      });
    }
    function devDown(e, d) {
      e.stopPropagation();
      if (S.cable) { cableClick(d); return; }
      S.sel = d.id; S.selLink = null;
      var p = toSvg(e); S.drag = { id: d.id, dx: d.x - p.x, dy: d.y - p.y, moved: false };
      try { board.setPointerCapture(e.pointerId); } catch (x) {}
      renderCanvas(); renderInspector();
    }
    board.addEventListener('pointermove', function (e) {
      if (!S.drag) return;
      var p = toSvg(e), d = D(S.drag.id); if (!d) return;
      d.x = clamp(Math.round(p.x + S.drag.dx), 56, W - 56); d.y = clamp(Math.round(p.y + S.drag.dy), 40, Hh - 50); S.drag.moved = true;
      renderCanvas();
    });
    function endDrag() { if (S.drag) { var moved = S.drag.moved; S.drag = null; if (moved) { stopAnim(); } } }
    board.addEventListener('pointerup', endDrag); board.addEventListener('pointercancel', endDrag);
    board.addEventListener('pointerdown', function () { if (!S.cable) { S.sel = null; S.selLink = null; renderCanvas(); renderInspector(); } });
    function devKey(e, d) {
      var step = e.shiftKey ? 30 : 10, k = e.key, moved = false;
      if (k === 'ArrowLeft') { d.x = clamp(d.x - step, 56, W - 56); moved = true; } else if (k === 'ArrowRight') { d.x = clamp(d.x + step, 56, W - 56); moved = true; }
      else if (k === 'ArrowUp') { d.y = clamp(d.y - step, 40, Hh - 50); moved = true; } else if (k === 'ArrowDown') { d.y = clamp(d.y + step, 40, Hh - 50); moved = true; }
      else if (k === 'Enter' || k === ' ') { if (S.cable) cableClick(d); else { S.sel = d.id; S.selLink = null; renderCanvas(); renderInspector(); refocus(d.id); } }
      else if (k === 'Delete' || k === 'Backspace') { S.sel = d.id; deleteSelected(); return; }
      else if (k === 'Escape') { S.cable = false; S.cableFrom = null; renderToolbar(); renderCanvas(); refocus(d.id); return; }
      else return;
      e.preventDefault();
      if (moved) { S.sel = d.id; renderCanvas(); renderInspector(); refocus(d.id); }
    }
    function refocus(id) { var g = gDevs.querySelector('[data-id="' + id + '"]'); if (g) g.focus(); }
    function cableClick(d) {
      if (!S.cableFrom) { S.cableFrom = d.id; setCap('Cable from ' + d.name + ': now click the device to connect it to.'); renderCanvas(); return; }
      if (S.cableFrom === d.id) { S.cableFrom = null; setCap('Cable cancelled.'); renderCanvas(); return; }
      connect(S.cableFrom, d.id); S.cableFrom = null; renderCanvas();
    }
    function connect(a, b) {
      var r = NB.linkPlayer(S.net, a, b);
      if (!r.ok) { setCap(r.error); return false; }
      var L = r.link; if (level().sandbox) L.added = false;
      setCap(D(a).name + ' is now connected to ' + D(b).name + (L.wireless ? ' over Wi-Fi.' : ' (cable).'));
      clearFx(); renderCanvas(); renderInspector(); refresh(); return true;
    }

    /* ---------- mission + goals ---------- */
    function renderMission() {
      var L = level(); mission.textContent = '';
      mission.appendChild(el('h3', '', (L.sandbox ? 'Sandbox' : 'Level ' + L.id) + ' · ' + L.title));
      mission.appendChild(el('p', 'nb-story', L.story));
      var learn = el('p', 'nb-learn'); learn.appendChild(el('b', '', 'Idea: ')); learn.appendChild(document.createTextNode(L.learn)); mission.appendChild(learn);
      if (L.hints.length) {
        var hb = el('button', 'nb-btn', S.hint ? 'Next hint' : 'Hint'); hb.type = 'button';
        var hl = el('ol', 'nb-hints');
        for (var i = 0; i < S.hint; i++) hl.appendChild(el('li', '', L.hints[i]));
        if (S.hint >= L.hints.length) hb.disabled = true;
        hb.addEventListener('click', function () { S.hint++; renderMission(); });
        mission.appendChild(hl); mission.appendChild(hb);
      }
      var done = el('div', 'nb-done'); done.id = 'nb-done'; done.hidden = true; mission.appendChild(done);
    }
    function renderGoals() {
      var L = level(); goalsBox.textContent = '';
      if (L.sandbox) { goalsBox.hidden = true; return; }
      goalsBox.hidden = false;
      goalsBox.appendChild(el('h3', '', 'Goals'));
      var ul = el('ul', 'nb-goals');
      S.evalr.results.forEach(function (r, i) {
        var li = el('li', 'nb-goal ' + (r.pass ? 'pass' : 'fail'));
        var st = el('span', 'nb-st', r.pass ? '✓' : '✗'); st.setAttribute('aria-label', r.pass ? 'passes' : 'does not pass yet');
        var body = el('div', 'nb-goal-b');
        body.appendChild(el('span', 'nb-goal-t', r.check.label));
        if (!r.pass) body.appendChild(el('span', 'nb-goal-w', r.trace.headline));
        else if (r.check.expect === 'blocked') body.appendChild(el('span', 'nb-goal-w ok', 'Dropped by the firewall, as required.'));
        var bt = el('button', 'nb-btn small', 'Show'); bt.type = 'button'; bt.setAttribute('aria-label', 'Show packet journey for: ' + r.check.label);
        bt.addEventListener('click', function () { play(r.trace); });
        li.appendChild(st); li.appendChild(body); li.appendChild(bt); ul.appendChild(li);
      });
      goalsBox.appendChild(ul);
      S.evalr.constraints.forEach(function (c) { var p = el('p', 'nb-cons ' + (c.ok ? 'ok' : 'bad'), (c.ok ? '✓ ' : '✗ ') + c.text); goalsBox.appendChild(p); });
    }

    /* ---------- inspector ---------- */
    function field(label, value, onset, opts) {
      opts = opts || {};
      var w = el('label', 'nb-field'); w.appendChild(el('span', '', label));
      var i = el('input'); i.type = 'text'; i.value = value || ''; i.autocomplete = 'off'; i.spellcheck = false;
      if (opts.ph) i.placeholder = opts.ph;
      function check() {
        if (!opts.kind || !i.value.trim()) { i.classList.remove('bad'); return; }
        var bad = opts.kind === 'ip' ? NB.cfgOf(i.value, '24').err === 'no-ip' : NB.maskPrefix(i.value) < 0;
        i.classList.toggle('bad', bad);
      }
      i.addEventListener('input', check);
      i.addEventListener('change', function () { onset(i.value.trim()); check(); clearFx(); refresh(); });
      check(); w.appendChild(i); return w;
    }
    function renderInspector() {
      inspector.textContent = '';
      if (S.selLink) {
        var l = S.net.links.filter(function (x) { return x.id === S.selLink; })[0];
        if (!l) { S.selLink = null; return renderInspector(); }
        inspector.appendChild(el('h3', '', l.wireless ? 'Wi-Fi link' : 'Cable'));
        inspector.appendChild(el('p', '', D(l.a).name + ' ↔ ' + D(l.b).name + (l.locked ? ' (part of the scenario)' : '')));
        var rb = el('button', 'nb-btn', 'Remove this cable'); rb.type = 'button'; rb.disabled = !!l.locked; rb.addEventListener('click', deleteSelected); inspector.appendChild(rb);
        return;
      }
      var d = S.sel && D(S.sel);
      if (!d) { inspector.appendChild(el('h3', '', 'Inspector')); inspector.appendChild(el('p', 'nb-muted', 'Click a device to see and change its settings. Drag to move it; arrow keys also work.')); return; }
      var t = NBt[d.type];
      inspector.appendChild(el('h3', '', t.label + (d.locked ? ' (scenario)' : '')));
      var form = el('div', 'nb-form');
      form.appendChild(field('Name', d.name, function (v) { d.name = v || d.name; renderCanvas(); renderTester(); }));
      if (t.host) {
        form.appendChild(field('IP address', d.ip, function (v) { d.ip = v; renderCanvas(); renderTester(); }, { kind: 'ip', ph: 'e.g. 192.168.1.10' }));
        form.appendChild(field('Subnet mask', d.mask, function (v) { d.mask = v; renderCanvas(); }, { kind: 'mask', ph: '255.255.255.0 or /24' }));
        form.appendChild(field('Default gateway', d.gw, function (v) { d.gw = v; }, { kind: 'ip', ph: 'router address (optional)' }));
        form.appendChild(field('DNS server', d.dns, function (v) { d.dns = v; }, { kind: 'ip', ph: 'needed for names' }));
        if (d.services.length) inspector.appendChild(el('p', 'nb-muted', 'Listening: TCP ' + d.services.join(', ')));
      } else if (t.router) {
        for (var s = 0; s < 3; s++) (function (s) {
          var link = null; NB.linksOf(S.net, d.id).forEach(function (x) { if (NB.slotOf(x, d.id) === s) link = x; });
          var row = el('fieldset', 'nb-port-row'); row.appendChild(el('legend', '', 'eth' + s + (link ? ' → ' + D(NB.peerOf(link, d.id)).name : ' (free)')));
          row.appendChild(field('IP', d.ifaces[s].ip, function (v) { d.ifaces[s].ip = v; renderCanvas(); }, { kind: 'ip' }));
          row.appendChild(field('Mask', d.ifaces[s].mask, function (v) { d.ifaces[s].mask = v; renderCanvas(); }, { kind: 'mask' }));
          form.appendChild(row);
        })(s);
        form.appendChild(field('Default route via', d.gw, function (v) { d.gw = v; }, { kind: 'ip', ph: 'next-hop address (optional)' }));
        var nl = el('label', 'nb-chk'); var nc = el('input'); nc.type = 'checkbox'; nc.checked = d.nat;
        nc.addEventListener('change', function () { d.nat = nc.checked; clearFx(); refresh(); });
        nl.appendChild(nc); nl.appendChild(el('span', '', 'NAT on the default route (hides private addresses)')); form.appendChild(nl);
      } else if (t.fw) {
        var pl = el('label', 'nb-field'); pl.appendChild(el('span', '', 'If no rule matches'));
        var ps = el('select'); [['allow', 'allow the packet'], ['deny', 'block the packet']].forEach(function (o) { var op = el('option', '', o[0] === 'allow' ? 'allow the packet' : 'block the packet'); op.value = o[0]; if (d.policy === o[0]) op.selected = true; ps.appendChild(op); });
        ps.addEventListener('change', function () { d.policy = ps.value; clearFx(); renderCanvas(); refresh(); }); pl.appendChild(ps); form.appendChild(pl);
        form.appendChild(el('p', 'nb-muted', 'Rules are checked from the top; the first match decides. Replies to allowed requests always pass (stateful).'));
        var ol = el('ol', 'nb-rules');
        d.rules.forEach(function (r, i) {
          var li = el('li', '', NB.ruleText(r));
          [['↑', -1], ['↓', 1]].forEach(function (m) {
            var b = el('button', 'nb-btn small', m[0]); b.type = 'button'; b.setAttribute('aria-label', 'Move rule ' + (i + 1) + (m[1] < 0 ? ' up' : ' down'));
            b.disabled = (m[1] < 0 && i === 0) || (m[1] > 0 && i === d.rules.length - 1);
            b.addEventListener('click', function () { var o = d.rules[i + m[1]]; d.rules[i + m[1]] = r; d.rules[i] = o; clearFx(); renderInspector(); refresh(); }); li.appendChild(b);
          });
          var x = el('button', 'nb-btn small', 'Delete'); x.type = 'button'; x.setAttribute('aria-label', 'Delete rule ' + (i + 1));
          x.addEventListener('click', function () { d.rules.splice(i, 1); clearFx(); renderInspector(); renderCanvas(); refresh(); }); li.appendChild(x);
          ol.appendChild(li);
        });
        if (!d.rules.length) ol.appendChild(el('li', 'nb-muted', '(no rules)'));
        form.appendChild(ol);
        var add = el('div', 'nb-addrule');
        var sa = el('select'); ['deny', 'allow'].forEach(function (v) { var o = el('option', '', v); o.value = v; sa.appendChild(o); });
        var sp = el('select'); ['tcp', 'udp', 'icmp', 'any'].forEach(function (v) { var o = el('option', '', v); o.value = v; sp.appendChild(o); });
        var pi = el('input'); pi.type = 'text'; pi.value = '23'; pi.size = 5; pi.setAttribute('aria-label', 'Port number or any');
        sa.setAttribute('aria-label', 'Action'); sp.setAttribute('aria-label', 'Protocol');
        var ab = el('button', 'nb-btn', 'Add rule'); ab.type = 'button';
        ab.addEventListener('click', function () {
          var pv = pi.value.trim().toLowerCase(), port = pv === 'any' || pv === '' ? 'any' : parseInt(pv, 10);
          if (port !== 'any' && !(port >= 1 && port <= 65535)) { setCap('Port must be 1-65535 or "any".'); return; }
          if (sp.value === 'icmp') port = 'any';
          d.rules.push({ action: sa.value, proto: sp.value, port: port }); clearFx(); renderInspector(); renderCanvas(); refresh();
        });
        [sa, sp, pi, ab].forEach(function (x) { add.appendChild(x); }); form.appendChild(add);
      } else if (d.type === 'internet') {
        form.appendChild(el('p', 'nb-muted', 'The ISP port is 192.0.2.1/30 (give your router 192.0.2.2/30 and a default route via 192.0.2.1). Behind it lies a simulated Internet: www.example.com 203.0.113.10 (ports 80, 443, 23), example.org 198.51.100.20, api.example.net 203.0.113.7, and the DNS resolver 198.51.100.53.'));
      } else if (d.type === 'hub') form.appendChild(el('p', 'nb-muted', 'A hub repeats every signal out of all other ports: one shared collision domain, every device hears everything.'));
      else if (d.type === 'switch') form.appendChild(el('p', 'nb-muted', 'A switch learns which device sits behind which port and forwards a frame only there. It never changes IP addresses and never joins different subnets.'));
      else if (d.type === 'ap') form.appendChild(el('p', 'nb-muted', 'An access point joins Wi-Fi laptops to the wired LAN: one cable up, up to 5 wireless clients. Drawn dashed.'));
      inspector.appendChild(form);
      /* links list + connect */
      var links = NB.linksOf(S.net, d.id);
      if (links.length) {
        var ul = el('ul', 'nb-conn');
        links.forEach(function (l) {
          var li = el('li', '', (l.wireless ? 'Wi-Fi ↔ ' : 'cable ↔ ') + D(NB.peerOf(l, d.id)).name);
          if (!l.locked) { var x = el('button', 'nb-btn small', 'Remove'); x.type = 'button'; x.setAttribute('aria-label', 'Remove cable to ' + D(NB.peerOf(l, d.id)).name); x.addEventListener('click', function () { NB.removeLink(S.net, l.id); clearFx(); renderAll(); refresh(); }); li.appendChild(x); }
          ul.appendChild(li);
        });
        inspector.appendChild(ul);
      }
      var cw = el('div', 'nb-connect'), cs = el('select'); cs.setAttribute('aria-label', 'Connect ' + d.name + ' to');
      var o0 = el('option', '', 'Connect to...'); o0.value = ''; cs.appendChild(o0);
      S.net.devices.forEach(function (x) { if (x.id !== d.id) { var o = el('option', '', x.name); o.value = x.id; cs.appendChild(o); } });
      var cbn = el('button', 'nb-btn', 'Connect'); cbn.type = 'button';
      cbn.addEventListener('click', function () { if (cs.value) { connect(d.id, cs.value); } });
      cw.appendChild(cs); cw.appendChild(cbn); inspector.appendChild(cw);
    }

    /* ---------- manual test ---------- */
    var tFrom, tTo, tSvc;
    function renderTester() {
      var prevF = tFrom && tFrom.value, prevT = tTo && tTo.value, prevS = tSvc && tSvc.value;
      tester.textContent = ''; tester.appendChild(el('h3', '', 'Send a packet'));
      var f = el('div', 'nb-form');
      var lf = el('label', 'nb-field'); lf.appendChild(el('span', '', 'From')); tFrom = el('select');
      S.net.devices.forEach(function (d) { if (NBt[d.type].host) { var o = el('option', '', d.name); o.value = d.id; tFrom.appendChild(o); } });
      if (prevF) tFrom.value = prevF; lf.appendChild(tFrom); f.appendChild(lf);
      var lt = el('label', 'nb-field'); lt.appendChild(el('span', '', 'To (address or name)'));
      tTo = el('input'); tTo.type = 'text'; tTo.setAttribute('list', 'nb-dl'); tTo.placeholder = '192.168.1.11 or www.example.com'; tTo.spellcheck = false; if (prevT) tTo.value = prevT;
      var dl = el('datalist'); dl.id = 'nb-dl';
      S.net.devices.forEach(function (d) { if (NBt[d.type].host && d.ip) { var o = el('option'); o.value = d.ip; o.label = d.name; dl.appendChild(o); } });
      ['www.example.com', 'api.example.net', 'example.org', '203.0.113.10'].forEach(function (v) { var o = el('option'); o.value = v; dl.appendChild(o); });
      lt.appendChild(tTo); lt.appendChild(dl); f.appendChild(lt);
      var ls = el('label', 'nb-field'); ls.appendChild(el('span', '', 'Service')); tSvc = el('select');
      [['icmp', 'Ping (ICMP)'], ['tcp80', 'Web (HTTP, TCP 80)'], ['tcp443', 'Secure web (HTTPS, TCP 443)'], ['tcp23', 'Telnet (TCP 23)']].forEach(function (o) { var op = el('option', '', o[1]); op.value = o[0]; tSvc.appendChild(op); });
      if (prevS) tSvc.value = prevS; ls.appendChild(tSvc); f.appendChild(ls);
      tester.appendChild(f);
      var go = el('button', 'nb-btn primary', 'Send'); go.type = 'button';
      go.addEventListener('click', function () {
        var v = tTo.value.trim(), svc = tSvc.value, proto = svc === 'icmp' ? 'icmp' : 'tcp', port = svc === 'icmp' ? null : +svc.slice(3);
        if (!tFrom.value) { setCap('Add a computer first.'); return; }
        var dest = PJ.parseIPv4(v) !== null ? { ip: v } : v ? { name: v } : { ip: '' };
        play(NB.send(S.net, tFrom.value, dest, proto, port));
      });
      tester.appendChild(go);
      tester.appendChild(el('p', 'nb-muted', 'Simulation: ARP and MAC addresses are left out, and firewall / NAT behave statefully.'));
    }

    /* ---------- animation ----------
       The trace from NB.send() is replayed hop by hop (NB.playScript). For every move:
       [what the sending device does] -> packet travels along the cable -> [what the receiving device does].
       The device that is "working" glows, a small pop-over names what it does inside, and the header strip
       shows the packet's live src/dst/ports/TTL (changed fields flash when a router or NAT rewrites them). */
    var gen = 0, run = null;
    var SPEEDS = [['Very slow', 2200], ['Slow', 1400], ['Normal', 800], ['Fast', 400], ['Very fast', 150], ['Instant', 0]];
    var SPEED_KEY = 'co1005-nb-speed', spIdx = 2;
    try { var sv = localStorage.getItem(SPEED_KEY); if (typeof sv === 'string' && /^[0-9]{1,2}$/.test(sv) && +sv < SPEEDS.length) spIdx = +sv; } catch (e) {}
    function curMs() { return SPEEDS[spIdx][1]; }

    var spd = el('div', 'nb-speed');
    var spLab = el('label', 'nb-sel', 'Speed'), spRng = el('input'), spNm = el('span', 'nb-speed-name');
    spRng.type = 'range'; spRng.min = 0; spRng.max = SPEEDS.length - 1; spRng.step = 1; spRng.value = spIdx; spRng.id = 'nb-speed'; spLab.setAttribute('for', 'nb-speed');
    function paintSpeed() { spNm.textContent = SPEEDS[spIdx][0] + (SPEEDS[spIdx][1] ? ' · ' + (SPEEDS[spIdx][1] / 1000) + ' s per hop' : ''); spRng.setAttribute('aria-valuetext', SPEEDS[spIdx][0]); }
    spRng.addEventListener('input', function () { spIdx = +spRng.value; paintSpeed(); try { localStorage.setItem(SPEED_KEY, String(spIdx)); } catch (e) {} });
    paintSpeed(); spd.appendChild(spLab); spd.appendChild(spRng); spd.appendChild(spNm);
    var bPause = el('button', 'nb-btn', '⏸ Pause'), bStep = el('button', 'nb-btn', 'Step ▸'), bSkip = el('button', 'nb-btn', 'Skip ⏭');
    [bPause, bStep, bSkip].forEach(function (b) { b.type = 'button'; b.disabled = true; playRow.appendChild(b); });
    bPause.setAttribute('aria-live', 'off'); bStep.title = 'Advance one hop (while paused)'; bSkip.title = 'Jump to the end of this run';
    playRow.appendChild(spd);

    /* live header strip. Colours follow the layer a field belongs to: IP address + TTL = network layer, protocol + port = transport layer. */
    var parts = {}, colons = {};
    function mkPart(host, id, layer, tip) { var sp = el('span', 'nb-part' + (layer ? ' nb-L-' + layer : ''), '—'); if (tip) sp.title = tip; host.appendChild(sp); parts[id] = sp; return sp; }
    function mkCell(cls, label) { var w = el('div', 'nb-hc nb-hc-' + cls); w.appendChild(el('span', 'nb-hl', label)); var v = el('b', 'nb-hv'); w.appendChild(v); strip.appendChild(w); return v; }
    mkPart(mkCell('pk', 'Packet'), 'pk', '');
    mkPart(mkCell('pr', 'Protocol'), 'pr', 'tr', 'Transport-layer protocol (layer 4)');
    [['src', 'Source IP : port', 'sip', 'spt'], ['dst', 'Destination IP : port', 'dip', 'dpt']].forEach(function (c) {
      var v = mkCell(c[0], c[1]);
      mkPart(v, c[2], 'ip', 'IP address (network layer, layer 3)');
      colons[c[0]] = v.appendChild(el('span', 'nb-colon', ':'));
      mkPart(v, c[3], 'tr', 'Port number (transport layer, layer 4)');
    });
    mkPart(mkCell('ttl', 'TTL'), 'ttl', 'ip', 'Time to live: hop budget in the IP header (network layer, layer 3)');
    var hkey = el('div', 'nb-hkey');
    [['ip', 'IP header (layer 3): addresses, TTL'], ['tr', 'TCP/UDP header (layer 4): protocol, ports']].forEach(function (k) {
      var sp = el('span', 'nb-L-' + k[0]); sp.appendChild(el('i', 'nb-sw')); sp.appendChild(document.createTextNode(k[1])); hkey.appendChild(sp);
    });
    strip.appendChild(hkey);
    function hdrFields(h) {
      if (!h) return { pk: '', pr: '—', sip: '—', spt: '', dip: '—', dpt: '', ttl: '—' };
      if (h.arp) return { pk: 'who has ' + h.ask + '?', pr: 'ARP', sip: '—', spt: '', dip: 'broadcast', dpt: '', ttl: '—', arp: true };
      return { pk: '', pr: h.proto, sip: h.src, spt: h.sport ? String(h.sport) : '', dip: h.dst, dpt: h.dport ? String(h.dport) : '', ttl: String(h.ttl) };
    }
    function setHdr(h, label) {
      var t = hdrFields(h); t.pk = label || t.pk || '—';
      Object.keys(parts).forEach(function (k) {
        var sp = parts[k], changed = h && k !== 'pk' && sp.textContent !== t[k] && sp.textContent !== '—' && sp.textContent !== '';
        sp.textContent = t[k];
        sp.classList.remove('chg'); if (changed) { void sp.offsetWidth; sp.classList.add('chg'); }
      });
      parts.pr.classList.remove('nb-L-ip', 'nb-L-tr');
      if (h && !t.arp) parts.pr.classList.add(t.pr === 'ICMP' ? 'nb-L-ip' : 'nb-L-tr'); // ICMP rides directly on IP (layer 3); TCP/UDP are layer 4
      colons.src.hidden = !t.spt; colons.dst.hidden = !t.dpt;
      if (h) S.hdr = h; else S.hdr = null;
    }
    setHdr(null);
    (function buildKey() { // colour key: one swatch per device type
      Object.keys(NBt).forEach(function (t) {
        var sp = el('span', 'nb-t-' + t); sp.setAttribute('role', 'listitem'); sp.appendChild(el('i', 'nb-sw')); sp.appendChild(document.createTextNode(NBt[t].label)); key.appendChild(sp);
      });
      var wl = el('span', 'nb-key-note'); wl.setAttribute('role', 'listitem'); wl.appendChild(el('i', 'nb-dash')); wl.appendChild(document.createTextNode('dashed = Wi-Fi')); key.appendChild(wl);
    })();

    function devG(id) { return gDevs.querySelector('[data-id="' + id + '"]'); }
    function typeOf(id) { var d = D(id); return d ? d.type : ''; }
    /* the cable a packet is crossing lights up in the colour of the device that sent it; all other cables stay neutral grey */
    function clearLink() { if (S.lit) { S.lit.g.classList.remove('act', 'nb-t-' + S.lit.type); S.lit = null; } }
    function lightLink(from, to) {
      clearLink();
      var l = S.net.links.filter(function (x) { return (x.a === from && x.b === to) || (x.a === to && x.b === from); })[0];
      var g = l && gLinks.querySelector('[data-link="' + l.id + '"]'), ty = typeOf(from);
      if (g && ty) { g.classList.add('act', 'nb-t-' + ty); S.lit = { g: g, type: ty }; }
    }
    function unbusy() { Array.prototype.forEach.call(gDevs.querySelectorAll('.busy'), function (g) { g.classList.remove('busy'); }); }
    function busy(id) { unbusy(); var g = devG(id); if (g) g.classList.add('busy'); }
    function hidePop() { pop.hidden = true; pop.textContent = ''; }
    var KIND_TITLE = { host: 'host decision', route: 'router: lookup + TTL', nat: 'NAT: rewrite address', fw: 'firewall: rule match', switch: 'switch: learn + forward', hub: 'hub: repeat to all', ap: 'access point: relay', isp: 'ISP' };
    function showPop(id, item) {
      var d = D(id); if (!d) return hidePop();
      pop.textContent = '';
      pop.className = 'nb-pop nb-t-' + d.type + ' k-' + item.kind;
      var ttl = el('b', 'nb-pop-t', 'Inside ' + d.name + ' · ' + (KIND_TITLE[item.kind] || ''));
      if (item.kind === 'fw') ttl.appendChild(el('span', 'nb-verdict ' + (item.allow ? 'ok' : 'bad'), item.allow ? 'ALLOW' : 'DROP'));
      pop.appendChild(ttl);
      pop.appendChild(el('span', 'nb-pop-x', item.text));
      pop.hidden = false;
      /* the drawing is centred and keeps its aspect ratio, so there can be bars at the sides or top (full-screen board): k, ox, oy map drawing units to pixels */
      var bw = boardWrap.clientWidth, bh = boardWrap.clientHeight, k = Math.min(bw / W, bh / Hh), ox = (bw - W * k) / 2, oy = (bh - Hh * k) / 2;
      var x = ox + d.x * k, dy = oy + d.y * k, half = pop.offsetWidth / 2;
      var left = Math.max(half + 4, Math.min(bw - half - 4, x));
      var above = dy > pop.offsetHeight + BH / 2 * k + 14;
      pop.style.left = left + 'px';
      var top = (above ? dy - BH / 2 * k - 24 - pop.offsetHeight : dy + BH / 2 * k + 30);
      pop.style.top = Math.max(4, Math.min(bh - pop.offsetHeight - 4, top)) + 'px';
    }
    function updatePlay() {
      var live = !!run && !run.done;
      bPause.disabled = !live; bSkip.disabled = !live;
      bPause.textContent = run && run.paused ? '▶ Resume' : '⏸ Pause';
      bPause.setAttribute('aria-pressed', run && run.paused ? 'true' : 'false');
      bStep.disabled = !(live && run.paused && !run.busy);
    }
    bPause.addEventListener('click', function () {
      if (!run || run.done) return;
      run.paused = !run.paused; updatePlay();
      if (!run.paused && !run.busy) tick();
    });
    bStep.addEventListener('click', function () {
      if (!run || run.done || !run.paused || run.busy) return;
      run.stepMv = run.idx < run.acts.length ? run.acts[run.idx].mv : null; tick();
    });
    bSkip.addEventListener('click', function () { if (run && !run.done) { run.idx = run.acts.length; run.paused = false; if (S.timer) { clearTimeout(S.timer); S.timer = null; } gen++; run.busy = false; finish(); } });

    function tok() {
      var t = gFx.querySelector('.nb-token');
      if (!t) { t = svg('g', { 'class': 'nb-token' }); t.appendChild(svg('circle', { r: 9 })); t.appendChild(svg('text', { y: -38, 'text-anchor': 'middle', 'class': 'nb-tlabel' })); gFx.appendChild(t); }
      return t;
    }
    function putTok(id, phase, label, instant) {
      var p = pos(id), t = tok();
      t.setAttribute('class', 'nb-token nb-t-' + typeOf(id));
      t.lastChild.textContent = label || '';
      if (instant) t.style.transition = 'none';
      t.style.transform = 'translate(' + p.x + 'px,' + p.y + 'px)';
      if (instant) void t.getBoundingClientRect();
    }

    function play(tr) {
      stopAnim(); S.trace = tr; S.shown = 0;
      explain.textContent = ''; explain.className = 'nb-explain ' + (tr.ok ? 'ok' : 'bad') + ' pending';
      var h = el('h3', '', tr.ok ? 'Success' : 'Failed'); explain.appendChild(h);
      var head = el('p', 'nb-head nb-later', tr.headline); explain.appendChild(head);
      var why = el('p', 'nb-why nb-later', tr.why); explain.appendChild(why);
      var ol = el('ol', 'nb-steps');
      tr.log.forEach(function (e) { ol.appendChild(el('li', 'nb-later ph-' + e.phase, e.text)); });
      explain.appendChild(ol);
      /* keep the explanation box at least as tall as the longest one seen on this level, so the controls below never jump */
      if (!document.documentElement.classList.contains('fs-on')) { explain.style.minHeight = ''; var hh = explain.offsetHeight; S.exH = Math.max(S.exH || 0, hh); explain.style.minHeight = S.exH + 'px'; } // (full screen: a scrolling pane of its own, no reserved height)
      var acts = NB.playScript(tr);
      run = { tr: tr, acts: acts, idx: 0, paused: false, busy: false, done: false, stepMv: null, last: null, g: gen, lis: ol.children, head: head, why: why, h: h, revealed: 0 };
      if (tr.moves.length) { putTok(tr.moves[0].from, tr.moves[0].phase, '', true); S.tokAt = tr.moves[0].from; }
      updatePlay();
      tick();
    }
    function reveal(upTo) {
      var r = run; if (!r) return;
      for (var k = 0; k < r.tr.log.length; k++) if (r.tr.log[k].at <= upTo && r.lis[k].classList.contains('nb-later')) { r.lis[k].classList.remove('nb-later'); setCap(r.tr.log[k].text); }
    }
    function tick() {
      var r = run; if (!r || r.done || r.busy) return;
      if (r.idx >= r.acts.length) return finish();
      var a = r.acts[r.idx];
      if (curMs() === 0 && r.stepMv === null) { r.idx = r.acts.length; return finish(); } // Instant
      if (r.paused && !(r.stepMv !== null && a.mv === r.stepMv)) { r.stepMv = null; updatePlay(); return; }
      if (r.last !== a.mv) { reveal(a.mv); r.last = a.mv; }
      r.busy = true; updatePlay();
      var g = gen;
      runAct(a, function () {
        if (g !== gen || run !== r) return;
        r.busy = false; r.idx++;
        if (r.stepMv !== null && (r.idx >= r.acts.length || r.acts[r.idx].mv !== r.stepMv)) { r.stepMv = null; }
        tick();
      });
    }
    function wait(ms, cb) { S.timer = setTimeout(function () { S.timer = null; cb(); }, ms); }
    function runAct(a, done) {
      var ms = curMs(), m = a.m, fast = reduce;
      if (a.t === 'go') {
        hidePop(); unbusy(); lightLink(m.from, m.to);
        setHdr(NB.headerAt(a, S.hdr), m.label);
        var t = tok(), A = pos(m.from), B = pos(m.to);
        t.setAttribute('class', 'nb-token nb-t-' + typeOf(m.from)); t.lastChild.textContent = m.label || '';
        if (S.tokAt !== m.from || !t.style.transform) { t.style.transition = 'none'; t.style.transform = 'translate(' + A.x + 'px,' + A.y + 'px)'; void t.getBoundingClientRect(); }
        if (fast) { t.style.transition = 'none'; t.style.transform = 'translate(' + B.x + 'px,' + B.y + 'px)'; S.tokAt = m.to; wait(Math.min(ms, 350), done); return; }
        t.style.transition = 'transform ' + ms + 'ms ease-in-out';
        t.style.transform = 'translate(' + B.x + 'px,' + B.y + 'px)'; S.tokAt = m.to;
        wait(ms + 30, done);
      } else {
        if (a.dev === m.from) clearLink();
        busy(a.dev); showPop(a.dev, a.item);
        setCap((D(a.dev) ? D(a.dev).name + ': ' : '') + a.item.text);
        setHdr(NB.headerAt(a, S.hdr), m.label);
        var tk = tok(); tk.setAttribute('class', 'nb-token nb-t-' + typeOf(m.from));
        wait(fast ? Math.min(ms * 1.1, 700) : Math.round(ms * 1.15) + 120, done);
      }
    }
    function finish() {
      var r = run; if (!r) return; var tr = r.tr;
      r.done = true; r.busy = false; hidePop(); unbusy(); clearLink();
      for (var k = 0; k < r.lis.length; k++) r.lis[k].classList.remove('nb-later');
      r.head.classList.remove('nb-later'); r.why.classList.remove('nb-later');
      explain.className = 'nb-explain ' + (tr.ok ? 'ok' : 'bad'); r.h.textContent = tr.ok ? 'Success' : 'Failed';
      setCap(tr.headline);
      var last = tr.moves.length ? tr.moves[tr.moves.length - 1] : null;
      if (last && last.hdr) setHdr(last.hdr, last.label);
      var at = tr.ok ? tr.dstDev : tr.failAt;
      if (!tr.ok && !at && last) at = last.to;
      var p = at && D(at) ? pos(at) : null;
      var t = gFx.querySelector('.nb-token'); if (t) t.parentNode.removeChild(t);
      S.tokAt = null;
      if (p) {
        var m = svg('g', { 'class': 'nb-mark ' + (tr.ok ? 'ok' : 'bad'), transform: 'translate(' + (p.x + 34) + ',' + (p.y - 26) + ')' });
        m.appendChild(svg('circle', { r: 13 })); m.appendChild(svg('text', { y: 5, 'text-anchor': 'middle' }, tr.ok ? '✓' : '✗')); gFx.appendChild(m);
      }
      updatePlay();
    }

    /* ---------- evaluation + budget ---------- */
    function refresh(silent) {
      var L = level(); S.evalr = NB.evaluate(S.net, L);
      renderGoals();
      budget.textContent = ''; budget.hidden = !L.budget;
      if (L.budget) {
        var c = S.evalr.cost, pct = Math.min(100, Math.round(c / L.budget * 100));
        var bar = el('div', 'nb-bar' + (c > L.budget ? ' over' : '')); var fill = el('div', 'nb-fill'); fill.style.width = pct + '%'; bar.appendChild(fill);
        budget.appendChild(el('span', '', 'Budget ' + c + ' / ' + L.budget + ' credits')); budget.appendChild(bar);
        budget.setAttribute('role', 'img'); budget.setAttribute('aria-label', 'Budget used ' + c + ' of ' + L.budget + ' credits');
      }
      var done = document.getElementById('nb-done');
      if (done) {
        done.textContent = '';
        if (S.evalr.complete) {
          done.hidden = false;
          var st = S.evalr.stars, txt = 'Level complete!';
          if (L.stars) txt += ' ' + st + ' of 3 stars (cost ' + S.evalr.cost + ' credits; 3 stars need ' + L.stars[0] + ' or less).';
          done.appendChild(el('strong', '', txt));
          var prev = S.progress[L.id] || 0;
          if (st > prev) { S.progress[L.id] = st; save(); renderLevels(); }
          if (S.li < NB.LEVELS.length - 1) { var nx = el('button', 'nb-btn primary', 'Next level'); nx.type = 'button'; nx.addEventListener('click', function () { loadLevel(S.li + 1); }); done.appendChild(nx); }
        } else done.hidden = true;
      }
    }

    function renderAll() { renderLevels(); renderToolbar(); renderMission(); renderCanvas(); renderInspector(); renderTester(); }
    document.addEventListener('keydown', function (e) {
      if (e.target && /input|select|textarea/i.test(e.target.tagName)) return;
      if (e.key === 'Delete' && (S.sel || S.selLink)) deleteSelected();
    });
    /* full-screen layout (assets/fs-network.css): while html.fs-on, the story card becomes a band under the level bar, the side panel becomes two columns
       (goals + explanation | inspector + send a packet), and the explanation box moves from under the board into the first column, so the board can use
       the height; everything goes back when full screen ends */
    (function () {
      var html = document.documentElement, colL = null, colR = null;
      function arrange() {
        var on = html.classList.contains('fs-on') && root.classList.contains('fs-active');
        if (on && !colL) {
          colL = el('div', 'nbfs-col nbfs-l'); colR = el('div', 'nbfs-col nbfs-r');
          colL.appendChild(goalsBox); colL.appendChild(explain);
          colR.appendChild(inspector); colR.appendChild(tester);
          side.appendChild(colL); side.appendChild(colR);
          root.insertBefore(mission, main);
          if (window.AppFullscreen) AppFullscreen.refit();
        } else if (!on && colL) {
          [mission, goalsBox, inspector, tester].forEach(function (n) { side.appendChild(n); });
          stage.appendChild(explain);
          side.removeChild(colL); side.removeChild(colR); colL = colR = null;
        }
      }
      if (window.MutationObserver) new MutationObserver(arrange).observe(html, { attributes: true, attributeFilter: ['class'] });
    })();
    loadLevel(0);
    root.__nb = S; S.api = { renderAll: renderAll, refresh: refresh, play: play, loadLevel: loadLevel, connect: connect };
  }

  function init() { var r = document.getElementById('nb-root'); if (r) mount(r); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(typeof window !== 'undefined' ? window : globalThis);
