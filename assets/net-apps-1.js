/* Chapter 9 concept apps 9.1 – 9.3: "How far can it reach?" (reach), "Share a file with everyone" (share),
   "Hub, switch or router: who gets the frame?" (devices).
   Logic is in pure functions (NetApps.engines.Reach / FileShare / Devices) so Node can test it; the UI below runs only in a browser.
   Everything is a simulation with invented names and RFC 5737 documentation addresses. */
(function () {
  'use strict';
  var NA = (typeof window !== 'undefined' && window.NetApps) || require('./net-apps-core.js');

  /* =====================================================================================================
     9.1  Reach engine
     ===================================================================================================== */
  var REACH_INFO = {
    PAN: { name: 'Personal area network', wired: 'a USB cable', wireless: 'Bluetooth or NFC', owner: 'you — it is just your own devices, nobody else is involved' },
    LAN: { name: 'Local area network', wired: 'Ethernet cable and a switch', wireless: 'Wi-Fi through an access point (a WLAN)', owner: 'one organisation (a home, a school, a company) — it owns every cable and box' },
    MAN: { name: 'Metropolitan area network', wired: 'a fibre ring under the city', wireless: 'microwave links or cellular towers', owner: 'a city, a university or a carrier that rents the links out' },
    WAN: { name: 'Wide area network', wired: 'backbone and undersea fibre', wireless: 'satellite or long microwave hops', owner: 'carriers and ISPs — nobody owns the whole thing; you pay them to cross it' }
  };
  var SPEED_KM_S = { cable: 200000, fibre: 200000, radio: 299792.458 };
  function classifyReach(meters, wireless) {
    var type = meters <= 10 ? 'PAN' : meters <= 2000 ? 'LAN' : meters <= 50000 ? 'MAN' : 'WAN';
    var label = (type === 'LAN' && wireless && meters <= 100) ? 'WLAN' : type;
    var i = REACH_INFO[type];
    return { type: type, label: label, name: label === 'WLAN' ? 'Wireless local area network' : i.name, tech: wireless ? i.wireless : i.wired, owner: i.owner };
  }
  /* one-way signal time in seconds: distance / propagation speed (≈ 2/3 c in copper or glass, c in air) */
  function signalDelay(meters, medium) {
    var v = SPEED_KM_S[medium];
    return v ? (meters / 1000) / v : NaN;
  }

  /* =====================================================================================================
     9.2  File-sharing engine (discrete ticks; one tick = the time to send one chunk)
     ===================================================================================================== */
  function fileShareRun(o) {
    var n = o.n, F = o.chunks || 12, su = o.serverUp == null ? 2 : o.serverUp, pu = o.peerUp == null ? 1 : o.peerUp, pd = o.peerDown == null ? 2 : o.peerDown;
    var crash = o.crashAtTick == null ? Infinity : o.crashAtTick, max = o.maxTicks || 5000, p2p = o.arch === 'p2p';
    var have = [], hv = [], cnt = [], i, c;
    for (i = 0; i < n; i++) { have.push(new Array(F).fill(false)); hv.push(0); }
    for (c = 0; c < F; c++) cnt.push(0);
    var ticks = [], doneTick = new Array(n).fill(null), doneAt = null, stuck = false, rr = 0;
    for (var t = 1; t <= max; t++) {
      var snap = have.map(function (a) { return a.slice(); });
      var pend = have.map(function () { return new Array(F).fill(false); });
      var down = new Array(n).fill(0), cc = cnt.slice(), hv2 = hv.slice(), tr = [];
      var missing = function (q, ch) { return !snap[q][ch] && !pend[q][ch]; };
      var give = function (from, q, ch) { tr.push({ from: from, to: q, chunk: ch }); pend[q][ch] = true; down[q]++; cc[ch]++; hv2[q]++; };
      var wants = function (q) { return down[q] < pd && hv2[q] < F; };
      for (var s = 0; s < su && t <= crash; s++) {
        var found = false, p, ch;
        if (!p2p) {                                   // round-robin: the next client that still needs something
          for (var k = 0; k < n && !found; k++) {
            p = (rr + k) % n;
            if (!wants(p)) continue;
            for (ch = 0; ch < F; ch++) if (missing(p, ch)) break;
            give(-1, p, ch); rr = (p + 1) % n; found = true;
          }
        } else {                                      // hand out the rarest chunk to the peer that has the fewest
          var bestC = -1, bestQ = -1;
          for (ch = 0; ch < F; ch++) {
            for (var q = 0; q < n; q++) {
              if (!wants(q) || !missing(q, ch)) continue;
              if (bestC < 0 || cc[ch] < cc[bestC] || (cc[ch] === cc[bestC] && ch === bestC && hv2[q] < hv2[bestQ])) { bestC = ch; bestQ = q; }
            }
          }
          if (bestC >= 0) { give(-1, bestQ, bestC); found = true; }
        }
        if (!found) break;
      }
      if (p2p) {                                      // peers forward what they held at the start of the tick
        for (var kk = 0; kk < n; kk++) {
          var pp = (t + kk) % n;
          for (var u = 0; u < pu; u++) {
            var bc = -1, bq = -1;
            for (var c2 = 0; c2 < F; c2++) {
              if (!snap[pp][c2]) continue;
              for (var q2 = 0; q2 < n; q2++) {
                if (q2 === pp || !wants(q2) || !missing(q2, c2)) continue;
                if (bc < 0 || cc[c2] < cc[bc] || (cc[c2] === cc[bc] && c2 === bc && hv2[q2] < hv2[bq])) { bc = c2; bq = q2; }
              }
            }
            if (bc >= 0) give(pp, bq, bc);
          }
        }
      }
      if (!tr.length) { stuck = true; break; }
      tr.forEach(function (x) { have[x.to][x.chunk] = true; hv[x.to]++; });
      for (c = 0; c < F; c++) { var m = 0; for (i = 0; i < n; i++) if (have[i][c]) m++; cnt[c] = m; }
      ticks.push(tr);
      var all = true;
      for (i = 0; i < n; i++) { if (hv[i] === F) { if (doneTick[i] == null) doneTick[i] = t; } else all = false; }
      if (all) { doneAt = t; break; }
    }
    var missingEverywhere = [];
    for (c = 0; c < F; c++) if (cnt[c] === 0) missingEverywhere.push(c);
    return { ticks: ticks, doneAt: doneAt, stuck: doneAt == null, perPeerDone: doneTick, missingEverywhere: missingEverywhere, n: n, chunks: F, arch: o.arch };
  }
  function fileShareState(res, k) {
    var have = [], i;
    for (i = 0; i < res.n; i++) have.push(new Array(res.chunks).fill(false));
    for (var t = 0; t < k && t < res.ticks.length; t++) res.ticks[t].forEach(function (x) { have[x.to][x.chunk] = true; });
    return have;
  }

  /* =====================================================================================================
     9.3  Devices engine: hub, learning switch, router
     ===================================================================================================== */
  var HOSTS = {
    A: { mac: 'AA:01', ip: '192.0.2.11', lan: 1 }, B: { mac: 'AA:02', ip: '192.0.2.12', lan: 1 }, C: { mac: 'AA:03', ip: '192.0.2.13', lan: 1 },
    D: { mac: 'DD:01', ip: '198.51.100.11', lan: 2 }, E: { mac: 'DD:02', ip: '198.51.100.12', lan: 2 }, F: { mac: 'DD:03', ip: '198.51.100.13', lan: 2 }
  };
  var ROUTER = { 1: { mac: 'FE:01', ip: '192.0.2.1', eth: 'eth0', net: '192.0.2.0/24' }, 2: { mac: 'FE:02', ip: '198.51.100.1', eth: 'eth1', net: '198.51.100.0/24' } };
  var BROADCAST = 'FF:FF';
  var LAN_NODES = ['A', 'B', 'C', 'D'];                 // hub / switch mode: one LAN of four hosts
  var ROUTER_LAN = { 1: ['A', 'B', 'C', 'R'], 2: ['D', 'E', 'F', 'R'] };

  function Switch(ports) { this.ports = ports.slice(); this.table = {}; }
  /* A learning switch. frame = {srcMac, dstMac}; inNode = the port (node id) it arrived on.
     → {action: 'forward' | 'flood' | 'broadcast' | 'filter', out: [node ids], learned: {mac,node} | null} */
  Switch.prototype.receive = function (frame, inNode) {
    var learned = null;
    if (this.table[frame.srcMac] !== inNode) { this.table[frame.srcMac] = inNode; learned = { mac: frame.srcMac, node: inNode }; }
    var others = this.ports.filter(function (p) { return p !== inNode; });
    if (frame.dstMac === BROADCAST) return { action: 'broadcast', out: others, learned: learned };
    var port = this.table[frame.dstMac];
    if (port === undefined) return { action: 'flood', out: others, learned: learned };
    if (port === inNode) return { action: 'filter', out: [], learned: learned };
    return { action: 'forward', out: [port], learned: learned };
  };
  function hubSend(ports, from) { return { action: 'repeat', out: ports.filter(function (p) { return p !== from; }), learned: null }; }

  function macOf(id) { return HOSTS[id].mac; }
  /* one frame on the single LAN of hub/switch mode. to = host id or '*' (broadcast) */
  function lanSend(mode, sw, from, to) {
    var frame = { srcMac: macOf(from), dstMac: to === '*' ? BROADCAST : macOf(to) };
    var r = mode === 'hub' ? hubSend(LAN_NODES, from) : sw.receive(frame, from);
    var delivered = to === '*' ? r.out.slice() : r.out.filter(function (x) { return x === to; });
    var bystanders = to === '*' ? [] : r.out.filter(function (x) { return x !== to; });
    return { frame: frame, action: r.action, out: r.out, delivered: delivered, bystanders: bystanders, learned: r.learned };
  }
  function sameSubnet(ip1, ip2, prefix) {
    var a = ip1.split('.').map(Number), b = ip2.split('.').map(Number), bits = prefix;
    for (var i = 0; i < 4; i++) { var m = bits >= 8 ? 255 : bits <= 0 ? 0 : (256 - Math.pow(2, 8 - bits)); bits -= 8; if ((a[i] & m) !== (b[i] & m)) return false; }
    return true;
  }
  /* A sends to someone in router mode. switches = {1: Switch, 2: Switch} (they learn). service: 'web' (80) | 'telnet' (23). */
  function routeSend(o) {
    var from = o.from, to = o.to, src = HOSTS[from], dst = HOSTS[to];
    var local = sameSubnet(src.ip, dst.ip, 24), hops = [], ttl = 64;
    function hop(lan, srcNode, dstNode, srcMac, dstMac) {
      var sw = o.switches[lan].receive({ srcMac: srcMac, dstMac: dstMac }, srcNode);
      var h = { lan: lan, srcNode: srcNode, dstNode: dstNode, srcMac: srcMac, dstMac: dstMac, srcIp: src.ip, dstIp: dst.ip, ttl: ttl, sw: sw,
        bystanders: sw.out.filter(function (x) { return x !== dstNode; }) };
      hops.push(h); return h;
    }
    if (local) {
      hop(src.lan, from, to, src.mac, dst.mac);
      return { local: true, dropped: false, delivered: true, hops: hops, routerSaw: false };
    }
    hop(src.lan, from, 'R', src.mac, ROUTER[src.lan].mac);              // to the default gateway
    var port = o.service === 'telnet' ? 23 : 80;
    if (o.firewall && port === 23) return { local: false, dropped: true, reason: 'firewall rule: deny port 23 (Telnet)', delivered: false, hops: hops, routerSaw: true, port: port };
    ttl -= 1;                                                           // the router decrements the TTL and builds a NEW frame
    hop(dst.lan, 'R', to, ROUTER[dst.lan].mac, dst.mac);
    return { local: false, dropped: false, delivered: true, hops: hops, routerSaw: true, port: port };
  }

  NA.engines.Reach = { classifyReach: classifyReach, signalDelay: signalDelay };
  NA.engines.FileShare = { run: fileShareRun, stateAt: fileShareState };
  NA.engines.Devices = { Switch: Switch, hubSend: hubSend, lanSend: lanSend, routeSend: routeSend, sameSubnet: sameSubnet, HOSTS: HOSTS, ROUTER: ROUTER, BROADCAST: BROADCAST };
  if (typeof module !== 'undefined' && module.exports) module.exports = NA.engines;
  if (typeof document === 'undefined') return;

  /* =====================================================================================================
     UI helpers
     ===================================================================================================== */
  var E = NA.el, S = NA.svg;
  function fmtDist(m) {
    if (m < 10) return (Math.round(m * 10) / 10) + ' m';
    if (m < 1000) return Math.round(m) + ' m';
    return NA.fmtKm(m / 1000);
  }
  function pingWords(rtt) {
    if (rtt < 0.001) return 'far below anything a person can notice';
    if (rtt < 0.02) return 'fast enough for anything, even online games';
    if (rtt < 0.1) return 'fine for browsing; a fast game starts to feel it';
    if (rtt < 0.3) return 'you feel it in a voice call — people begin to talk over each other';
    return 'painful for live conversation: every answer arrives about half a second late';
  }

  /* =====================================================================================================
     9.1  How far can it reach?
     ===================================================================================================== */
  var LOGMAX = 8;                                     // 10^8 m = 100,000 km
  var BANDS = [{ t: 'PAN', a: 0, b: 1, c: 5 }, { t: 'LAN', a: 1, b: Math.log10(2000), c: 2 }, { t: 'MAN', a: Math.log10(2000), b: Math.log10(50000), c: 3 }, { t: 'WAN', a: Math.log10(50000), b: LOGMAX, c: 1 }];
  var SCEN = [
    { l: 'Earbuds · 1 m', m: 1, w: true }, { l: 'Computer lab · 30 m', m: 30, w: false }, { l: 'Campus · 800 m', m: 800, w: false },
    { l: 'City · 30 km', m: 30000, w: false }, { l: 'Hanoi–HCMC · ≈ 1,200 km', m: 1.2e6, w: false },
    { l: 'Vietnam–California · ≈ 13,000 km (undersea fibre)', m: 1.3e7, w: false }, { l: 'Via a geostationary satellite · 71,600 km up and down', m: 7.16e7, w: true }
  ];
  NA.register('reach', {
    title: 'How far can it reach?',
    hint: 'Try this: pick the satellite chip and read the minimum ping — even light cannot beat the distance.',
    build: function (host) {
      var wireless = false, log = Math.log10(30);
      var X0 = 30, W = 570;
      var sl = NA.slider('Distance between the two devices', 0, LOGMAX, 0.01, log, function (v) { return fmtDist(Math.pow(10, v)); }, function (v) { log = v; update(); });
      sl.wrap.classList.add('grow');
      var seg = NA.segmented([{ value: 'wired', label: 'Wired' }, { value: 'wireless', label: 'Wireless' }], 'wired', function (v) { wireless = v === 'wireless'; update(); }, 'Link type');
      var ctrl = E('div', 'na-controls'); ctrl.appendChild(sl.wrap); ctrl.appendChild(NA.field('Link', seg.wrap));
      host.appendChild(ctrl);
      var chips = E('div', 'na-chips');
      SCEN.forEach(function (s) { chips.appendChild(NA.chip(s.l, function () { log = Math.log10(s.m); wireless = s.w; sl.set(log); seg.set(wireless ? 'wireless' : 'wired'); update(); })); });
      host.appendChild(chips);

      var svg = S('svg', { viewBox: '0 0 640 112', role: 'img', 'aria-label': 'A logarithmic ruler from 1 metre to 100,000 kilometres, coloured in four bands: personal, local, metropolitan and wide area networks, with a marker at the chosen distance.' });
      var bandEls = {};
      BANDS.forEach(function (b) {
        var x = X0 + b.a / LOGMAX * W, w = (b.b - b.a) / LOGMAX * W, g = S('g', { 'class': 'na-reach-band', style: '--c:var(--cmp-' + b.c + ')' }, svg);
        S('rect', { x: x, y: 40, width: w, height: 26, rx: 4 }, g); S('text', { x: x + w / 2, y: 57, 'text-anchor': 'middle' }, g, b.t);
        bandEls[b.t] = g;
      });
      for (var k = 0; k <= LOGMAX; k++) {
        var tx = X0 + k / LOGMAX * W;
        S('line', { x1: tx, x2: tx, y1: 66, y2: 72, 'class': 'na-reach-tick' }, svg);
        S('text', { x: tx, y: 86, 'text-anchor': k === 0 ? 'start' : 'middle', 'class': 'na-reach-tl' }, svg, k < 3 ? Math.pow(10, k) + ' m' : Math.pow(10, k - 3).toLocaleString('en-US') + ' km');
      }
      var mk = S('g', { 'class': 'na-reach-mk' }, svg);
      S('path', { d: 'M-6 24 L6 24 L0 36 Z' }, mk); S('line', { x1: 0, x2: 0, y1: 36, y2: 66 }, mk);
      var mkTxt = S('text', { x: 0, y: 17, 'text-anchor': 'middle' }, mk, '');
      S('text', { x: 320, y: 106, 'text-anchor': 'middle', 'class': 'na-reach-tl' }, svg, 'distance, on a log scale (each tick is 10× further)');
      svg.addEventListener('click', function (ev) {
        var r = svg.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width * 640;
        log = Math.max(0, Math.min(LOGMAX, (x - X0) / W * LOGMAX)); sl.set(log); update();
      });
      var stage = E('div', 'na-stage'); stage.appendChild(svg); host.appendChild(stage);

      var tType = NA.stat('Network type'), tOne = NA.stat('One-way signal time'), tPing = NA.stat('Best-case ping (round trip)');
      var stats = E('div', 'na-stats'); [tType, tOne, tPing].forEach(function (t) { stats.appendChild(t.node); }); host.appendChild(stats);
      var info = E('div', 'na-reach-info');
      host.appendChild(info);
      var bar = E('div', 'na-reach-bar'); bar.setAttribute('aria-hidden', 'true');
      var fill = E('div', 'na-reach-fill'), over = E('span', 'na-reach-over', '▶ off the scale');
      bar.appendChild(fill); bar.appendChild(over);
      [[20, 'game 20 ms'], [100, 'blink 100 ms'], [300, '300 ms']].forEach(function (m) { var i = E('i', 'na-reach-ref'); i.style.left = (m[0] / 300 * 100) + '%'; i.appendChild(E('b', null, m[1])); bar.appendChild(i); });
      host.appendChild(bar);
      var nar = NA.narrator(); host.appendChild(nar.node);
      host.appendChild(E('p', 'na-note', 'Simulation: signal speed is taken as 200,000 km/s in cable or fibre (about two thirds of the speed of light) and 299,792 km/s for radio. Real pings are always longer — routers, queues and detours add time.'));

      function update() {
        var m = Math.pow(10, log), c = classifyReach(m, wireless), med = wireless ? 'radio' : 'fibre';
        var one = signalDelay(m, med), rtt = 2 * one;
        mk.setAttribute('transform', 'translate(' + (X0 + log / LOGMAX * W) + ',0)');
        mkTxt.textContent = fmtDist(m);
        BANDS.forEach(function (b) { bandEls[b.t].classList.toggle('on', b.t === c.type); });
        tType.set(c.label, c.name); tOne.set(NA.fmtTime(one), med === 'radio' ? 'by radio' : 'through cable / fibre'); tPing.set(NA.fmtTime(rtt), 'there and back');
        info.innerHTML = '<b>' + NA.esc(c.label) + '</b> — typically <b>' + NA.esc(c.tech) + '</b>. Run by ' + NA.esc(c.owner) + '.';
        var pct = rtt / 0.3 * 100; fill.style.width = Math.min(100, pct) + '%'; over.style.display = pct > 100 ? '' : 'none';
        var why = c.type === 'WAN' ? 'Nobody can string their own cable this far, so a WAN is built from links <b>rented from carriers</b> — that is what an ISP sells you.'
          : c.type === 'MAN' ? 'This is bigger than any one building: the cables cross public streets, so a city, university or carrier has to run them.'
          : c.type === 'LAN' ? (c.label === 'WLAN' ? 'Same idea as a LAN, but devices reach an <b>access point</b> by radio instead of a cable.' : 'Everything stays on property the organisation controls, so it can use cheap, fast cable and run its own switches.')
          : 'Just a few metres around one person: one cable or one radio link, no network equipment needed.';
        nar.say(why + ' Light needs <b>' + NA.fmtTime(one) + '</b> to cross ' + fmtDist(m) + ', so a question and its answer take at least <b>' + NA.fmtTime(rtt) + '</b> — ' + pingWords(rtt) + '.');
      }
      update();
    }
  });

  /* =====================================================================================================
     9.2  Share a file with everyone
     ===================================================================================================== */
  function chunkColor(c) { return c < 11 ? 'var(--cmp-' + (c + 1) + ')' : 'var(--ink-soft)'; }
  NA.register('share', {
    title: 'Share a file with everyone',
    hint: 'Try this: raise the peers to 20, compare the two chart lines, then crash the server mid-way.',
    build: function (host) {
      var CH = 12, st = { arch: 'cs', n: 8, pos: 0, crashed: false, playing: false, res: null, have: [] };
      var run = NA.runner(), cache = {};
      function compute(crashAt) { return fileShareRun({ arch: st.arch, n: st.n, chunks: CH, serverUp: 2, peerUp: 1, peerDown: 2, crashAtTick: crashAt }); }
      function series(arch) {
        if (!cache[arch]) { cache[arch] = []; for (var n = 2; n <= 20; n++) cache[arch].push(fileShareRun({ arch: arch, n: n, chunks: CH }).doneAt); }
        return cache[arch];
      }
      var seg = NA.segmented([{ value: 'cs', label: 'Client–server' }, { value: 'p2p', label: 'Peer-to-peer' }], 'cs', function (v) { st.arch = v; reset(); }, 'Architecture');
      var nSl = NA.slider('Peers wanting the file', 2, 20, 1, st.n, null, function (v) { st.n = v; reset(); });
      var bPlay = NA.button('▶ Play', 'primary', function () { if (st.playing) pause(); else loop(); });
      var bStep = NA.button('Step', '', function () { pause(); if (!ended()) { var g = run.start(); playTick(g).then(function () { if (ended()) finish(); }); } });
      var bReset = NA.button('Reset', '', function () { reset(); });
      var bCrash = NA.button('✗ Crash the server', 'danger', crash);
      var ctrl = E('div', 'na-controls');
      ctrl.appendChild(NA.field('Architecture', seg.wrap)); ctrl.appendChild(nSl.wrap);
      [bPlay, bStep, bReset, bCrash].forEach(function (b) { ctrl.appendChild(b); }); ctrl.appendChild(NA.speedControl());
      host.appendChild(ctrl);
      var cols = E('div', 'na-cols'), left = E('div'), right = E('div');
      cols.appendChild(left); cols.appendChild(right); host.appendChild(cols);

      var VW = 460, VH = 330, CX = 230, CY = 165, RX = 185, RY = 122;
      var svg = S('svg', { viewBox: '0 0 ' + VW + ' ' + VH, role: 'img', 'aria-label': 'A server in the middle and the downloading peers around it. Each peer shows twelve small squares, one per piece of the file; coloured squares are pieces it already has. Lines show pieces being sent.' });
      var edgeG = S('g', null, svg), peerG = S('g', null, svg), dotG = S('g', null, svg), srvG = S('g', { 'class': 'na-share-srv' }, svg);
      var srvRect = S('rect', { x: CX - 38, y: CY - 20, width: 76, height: 40, rx: 8 }, srvG), srvTxt = S('text', { x: CX, y: CY + 5, 'text-anchor': 'middle' }, srvG, 'Server');
      var stage = E('div', 'na-stage'); stage.appendChild(svg); left.appendChild(stage);
      left.appendChild(E('div', 'na-key', [E('span', null, 'Each square = one of the 12 pieces of the file, one colour per piece'), E('span', null, '✓ = peer has the whole file')]));
      var tTick = NA.stat('Tick'), tDone = NA.stat('Peers with the whole file'), tUp = NA.stat('Pieces sent (server / peers)');
      var stats = E('div', 'na-stats'); [tTick, tDone, tUp].forEach(function (t) { stats.appendChild(t.node); }); left.appendChild(stats);
      var nar = NA.narrator(); left.appendChild(nar.node);

      /* chart: time to finish vs number of peers */
      right.appendChild(E('div', 'na-lab', 'Time for everyone to finish, as the crowd grows'));
      var CW = 360, CHH = 230, PL = 40, PB = 30, PT = 22, PR = 14, YMAX = 120;
      var cs = S('svg', { viewBox: '0 0 ' + CW + ' ' + CHH, role: 'img', 'aria-label': 'Line chart of ticks until everyone has the file against the number of peers, for client–server and peer-to-peer. Client–server grows in a straight line; peer-to-peer stays almost flat.' });
      var xs = function (n) { return PL + (n - 2) / 18 * (CW - PL - PR); }, ys = function (v) { return CHH - PB - v / YMAX * (CHH - PB - PT); };
      [0, 30, 60, 90, 120].forEach(function (v) { S('line', { x1: PL, x2: CW - PR, y1: ys(v), y2: ys(v), 'class': 'na-share-grid' }, cs); S('text', { x: PL - 6, y: ys(v) + 3, 'text-anchor': 'end', 'class': 'na-share-tl' }, cs, v); });
      [2, 5, 10, 15, 20].forEach(function (n) { S('text', { x: xs(n), y: CHH - PB + 14, 'text-anchor': 'middle', 'class': 'na-share-tl' }, cs, n); });
      S('text', { x: (PL + CW - PR) / 2, y: CHH - 4, 'text-anchor': 'middle', 'class': 'na-share-tl' }, cs, 'number of peers');
      S('text', { x: PL - 6, y: 11, 'text-anchor': 'end', 'class': 'na-share-tl' }, cs, 'ticks');
      var cur = S('line', { 'class': 'na-share-cur', y1: PT, y2: CHH - PB }, cs);
      [['cs', 'Client–server', 'na-share-l-cs'], ['p2p', 'Peer-to-peer', 'na-share-l-p2p']].forEach(function (a) {
        var d = series(a[0]).map(function (v, i) { return (i ? 'L' : 'M') + xs(i + 2).toFixed(1) + ' ' + ys(v).toFixed(1); }).join(' ');
        S('path', { d: d, 'class': 'na-share-line ' + a[2] }, cs);
        var last = series(a[0])[18];
        if (a[0] === 'cs') S('text', { x: xs(13) - 4, y: ys(78) - 9, 'text-anchor': 'end', 'class': 'na-share-lbl ' + a[2] }, cs, a[1]);
        else S('text', { x: CW - PR - 4, y: ys(last) - 8, 'text-anchor': 'end', 'class': 'na-share-lbl ' + a[2] }, cs, a[1]);
      });
      var dotCs = S('circle', { r: 5, 'class': 'na-share-dot na-share-l-cs' }, cs), dotP = S('rect', { width: 9, height: 9, 'class': 'na-share-dot na-share-l-p2p' }, cs);
      var chartBox = E('div', 'na-stage'); chartBox.appendChild(cs); right.appendChild(chartBox);
      var chartNote = E('p', 'na-note'); right.appendChild(chartNote);
      right.appendChild(E('p', 'na-note', 'Simulation: the server uploads 2 pieces per tick; in peer-to-peer each peer also uploads 1 piece per tick. One tick is the time to send one piece.'));

      var cells = [], pos = [], doneMark = [];
      function drawPeers() {
        NA.clear(peerG); cells = []; pos = []; doneMark = [];
        for (var i = 0; i < st.n; i++) {
          var a = -Math.PI / 2 + i * 2 * Math.PI / st.n, x = CX + RX * Math.cos(a), y = CY + RY * Math.sin(a);
          pos.push({ x: x, y: y });
          var sc = st.n <= 10 ? 1.5 : st.n <= 14 ? 1.2 : 1;
          var g = S('g', { 'class': 'na-share-peer', transform: 'translate(' + x.toFixed(1) + ',' + y.toFixed(1) + ') scale(' + sc + ')' }, peerG);
          S('rect', { x: -22, y: -7, width: 44, height: 14, rx: 3, 'class': 'na-share-box' }, g);
          var row = [];
          for (var c = 0; c < CH; c++) row.push(S('rect', { x: -19 + c * 3.2, y: -4, width: 3, height: 8, 'class': 'na-share-cell' }, g));
          cells.push(row);
          doneMark.push(S('text', { x: 0, y: -10, 'text-anchor': 'middle', 'class': 'na-share-ok' }, g, ''));
          if (st.n <= 10) S('text', { x: 0, y: 19, 'text-anchor': 'middle', 'class': 'na-share-pl' }, g, 'P' + (i + 1));
        }
      }
      function paint() {
        var full = 0;
        for (var i = 0; i < st.n; i++) {
          var h = 0;
          for (var c = 0; c < CH; c++) { var on = st.have[i][c]; if (on) h++; cells[i][c].style.fill = on ? chunkColor(c) : ''; cells[i][c].classList.toggle('on', on); }
          doneMark[i].textContent = h === CH ? '✓' : ''; if (h === CH) full++;
        }
        srvG.classList.toggle('dead', st.crashed); srvTxt.textContent = st.crashed ? 'Server ✗' : 'Server';
        var sv = 0, pr = 0;
        for (var t = 0; t < st.pos; t++) st.res.ticks[t].forEach(function (x) { if (x.from < 0) sv++; else pr++; });
        tTick.set(st.pos); tDone.set(full + ' / ' + st.n); tUp.set(sv + ' / ' + pr);
        tDone.node.classList.toggle('good', full === st.n); bCrash.disabled = st.crashed || full === st.n;
        bPlay.textContent = ended() ? 'Finished' : st.playing ? '❚❚ Pause' : (st.pos ? '▶ Resume' : '▶ Play');
        bStep.disabled = ended(); bPlay.disabled = ended();
        var xn = xs(st.n), a = series('cs')[st.n - 2], b = series('p2p')[st.n - 2];
        cur.setAttribute('x1', xn); cur.setAttribute('x2', xn); dotCs.setAttribute('cx', xn); dotCs.setAttribute('cy', ys(a)); dotP.setAttribute('x', xn - 4.5); dotP.setAttribute('y', ys(b) - 4.5);
        chartNote.innerHTML = 'With <b>' + st.n + '</b> peers: client–server needs <b>' + a + '</b> ticks, peer-to-peer <b>' + b + '</b>.';
      }
      function ended() { return st.pos >= st.res.ticks.length; }
      function reset() {
        run.cancel(); st.playing = false; st.crashed = false; st.pos = 0; st.res = compute(null);
        st.have = fileShareState(st.res, 0); NA.clear(edgeG); NA.clear(dotG); drawPeers(); paint();
        nar.say(st.arch === 'cs'
          ? 'Press <b>Play</b>. In <b>client–server</b> only the server has the file, so it must send every piece to every client itself — 2 pieces per tick, shared by everybody.'
          : 'Press <b>Play</b>. In <b>peer-to-peer</b> the server sends each piece out once, then the peers hand pieces to each other — every newcomer adds upload capacity.');
      }
      function pt(from, q) { return from < 0 ? { x: CX, y: CY } : pos[from]; }
      function playTick(g) {
        var tr = st.res.ticks[st.pos];
        NA.clear(edgeG); NA.clear(dotG);
        var dots = tr.map(function (x) {
          var a = pt(x.from), b = pos[x.to];
          S('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, 'class': 'na-share-edge' + (x.from < 0 ? ' srv' : ''), style: 'stroke:' + chunkColor(x.chunk) }, edgeG);
          return { d: S('circle', { r: 4.5, cx: a.x, cy: a.y, 'class': 'na-share-tok', style: 'fill:' + chunkColor(x.chunk) }, dotG), a: a, b: b };
        });
        return run.tween(g, NA.dur(520), function (t) {
          var e = NA.ease(t);
          dots.forEach(function (o) { o.d.setAttribute('cx', NA.lerp(o.a.x, o.b.x, e)); o.d.setAttribute('cy', NA.lerp(o.a.y, o.b.y, e)); });
        }).then(function (ok) {
          NA.clear(edgeG); NA.clear(dotG);
          if (!ok) return false;
          tr.forEach(function (x) { st.have[x.to][x.chunk] = true; });
          st.pos++; paint(); narrateTick(tr); return true;
        });
      }
      function narrateTick(tr) {
        var sv = tr.filter(function (x) { return x.from < 0; }).length, pr = tr.length - sv, t = st.pos;
        if (st.arch === 'cs') nar.say('Tick ' + t + ': the server sent ' + sv + ' piece' + (sv === 1 ? '' : 's') + (st.crashed ? '' : ' — its upload line is the bottleneck. Nobody else sends anything, so with ' + st.n + ' clients each one waits for its turn.'));
        else nar.say('Tick ' + t + ': the server sent <b>' + sv + '</b> and the peers forwarded <b>' + pr + '</b> piece' + (pr === 1 ? '' : 's') + ' among themselves. ' + (pr > sv ? 'Most of the work is now done by the downloaders — the more peers, the more upload capacity.' : 'Early on mostly the server sends; peers start helping as soon as they hold something new.'));
      }
      function loop() {
        var g = run.start(); st.playing = true; paint();
        (function next() {
          if (ended()) { st.playing = false; paint(); finish(); return; }
          playTick(g).then(function (ok) { if (!ok) return; run.sleep(g, NA.dur(160)).then(function (ok2) { if (ok2) next(); }); });
        })();
      }
      function pause() { run.cancel(); st.playing = false; paint(); }
      function crash() {
        var was = st.playing; run.cancel(); st.playing = false;
        st.crashed = true; st.res = compute(st.pos); paint();
        nar.say('<span class="bad">The server just crashed.</span> ' + (st.arch === 'cs' ? 'In client–server everything came from it — nothing more can be delivered.' : 'In peer-to-peer the peers still hold pieces and can trade them.') + ' Press Play to see what happens.');
        if (ended()) finish(); else if (was) loop();
      }
      function finish() {
        st.playing = false; paint();
        var r = st.res, done = r.perPeerDone.filter(function (x) { return x != null; }).length, other = series(st.arch === 'cs' ? 'p2p' : 'cs')[st.n - 2];
        if (r.doneAt) {
          nar.say('<span class="ok">Everyone has the whole file after ' + r.doneAt + ' ticks.</span> ' + (st.arch === 'cs' ? 'Peer-to-peer would have needed ' + other + '.' : 'Client–server would have needed ' + other + '.') + (st.crashed ? ' The peers finished without the server.' : ''));
        } else if (st.arch === 'cs') {
          nar.say('<span class="bad">Stuck.</span> Only ' + done + ' of ' + st.n + ' peers got the whole file; the rest wait forever. The server was a <b>single point of failure</b>.');
        } else {
          nar.say('<span class="bad">Stuck.</span> ' + done + ' of ' + st.n + ' peers finished, but piece' + (r.missingEverywhere.length > 1 ? 's ' : ' ') + r.missingEverywhere.map(function (c) { return c + 1; }).join(', ') + ' existed only on the server, so no peer can supply ' + (r.missingEverywhere.length > 1 ? 'them' : 'it') + '. Crash a little later next time and the swarm survives.');
        }
      }
      reset();
    }
  });

  /* =====================================================================================================
     9.3  Hub, switch or router
     ===================================================================================================== */
  var POS_LAN = { A: [78, 48], B: [402, 48], C: [78, 202], D: [402, 202], DEV: [240, 125] };
  var POS_RT = { A: [56, 52], B: [56, 150], C: [56, 248], S1: [166, 150], R: [280, 150], S2: [394, 150], D: [504, 52], E: [504, 150], F: [504, 248] };
  NA.register('devices', {
    title: 'Hub, switch or router: who gets the frame?',
    hint: 'Try this: in Switch mode send A → C, then C → A, then A → C again and watch the table and the bystanders.',
    build: function (host) {
      var D = NA.engines.Devices, run = NA.runner();
      var st = { mode: 'switch', from: 'A', to: 'C', picking: 'from', frames: 0, wasted: 0, busy: false };
      var sw = {}, nodes = {}, tokens;
      function resetSwitches() { sw.lan = new D.Switch(LAN_NODES); sw[1] = new D.Switch(ROUTER_LAN[1]); sw[2] = new D.Switch(ROUTER_LAN[2]); }
      resetSwitches();

      var modeSeg = NA.segmented([{ value: 'hub', label: 'Hub' }, { value: 'switch', label: 'Switch' }, { value: 'router', label: 'Router' }], st.mode, function (v) { setMode(v); }, 'Device in the middle');
      var fromSel = NA.select([], null, function (v) { st.from = v; fixTo(); }), toSel = NA.select([], null, function (v) { st.to = v; });
      var svcSel = NA.select([{ value: 'web', label: 'Web (port 80)' }, { value: 'telnet', label: 'Telnet (port 23)' }], 'web');
      var fw = E('input'); fw.type = 'checkbox';
      var fwLab = E('label', 'na-devices-fw', [fw, ' Router firewall: deny Telnet (port 23)']);
      var bSend = NA.button('Send frame', 'primary', function () { send(st.to); });
      var bBc = NA.button('Broadcast', '', function () { send('*'); });
      var bReset = NA.button('Reset tables', '', function () { setMode(st.mode); });
      var c1 = E('div', 'na-controls'); c1.appendChild(NA.field('Device in the middle', modeSeg.wrap)); c1.appendChild(NA.speedControl());
      var c2 = E('div', 'na-controls tight');
      var fFrom = NA.field('From', fromSel), fTo = NA.field('To', toSel), fSvc = NA.field('Service', svcSel);
      [fFrom, fTo, fSvc, fwLab, bSend, bBc, bReset].forEach(function (x) { c2.appendChild(x); });
      host.appendChild(c1); host.appendChild(c2);
      var chips = E('div', 'na-chips'); host.appendChild(chips);

      var cols = E('div', 'na-cols na-devices-cols'), left = E('div'), right = E('div', 'na-devices-side');
      cols.appendChild(left); cols.appendChild(right); host.appendChild(cols);
      var stage = E('div', 'na-stage na-devices-stage'), svgHost = E('div'); stage.appendChild(svgHost); left.appendChild(stage);
      var nar = NA.narrator(); left.appendChild(nar.node);
      var tFr = NA.stat('Frames sent'), tWaste = NA.stat('Copies wasted on bystanders');
      var stats = E('div', 'na-stats'); stats.appendChild(tFr.node); stats.appendChild(tWaste.node); right.appendChild(stats);
      var hdrBox = E('div', 'na-devices-side'), tabBox = E('div'); right.appendChild(tabBox); host.appendChild(hdrBox);

      function ids() { return st.mode === 'router' ? ['A', 'B', 'C', 'D', 'E', 'F'] : LAN_NODES; }
      function fillSelects() {
        var l = ids();
        NA.clear(fromSel); NA.clear(toSel);
        l.forEach(function (h) { var o = E('option', null, h + '  (' + D.HOSTS[h].mac + ')'); o.value = h; fromSel.appendChild(o); });
        if (st.from === undefined || l.indexOf(st.from) < 0) st.from = 'A';
        fromSel.value = st.from; fixTo();
      }
      function fixTo() {
        var l = ids().filter(function (h) { return h !== st.from; });
        NA.clear(toSel);
        l.forEach(function (h) { var o = E('option', null, h + '  (' + D.HOSTS[h].mac + ')'); o.value = h; toSel.appendChild(o); });
        if (st.mode !== 'router') { var o2 = E('option', null, 'everyone (broadcast)'); o2.value = '*'; toSel.appendChild(o2); }
        if (l.indexOf(st.to) < 0 && st.to !== '*') st.to = l[st.mode === 'router' ? 2 : 1];
        toSel.value = st.to;
      }

      /* ---- drawing ---- */
      function node(id, x, y, kind, title, sub, w, h) {
        var g = S('g', { 'class': 'na-devices-node ' + kind, transform: 'translate(' + x + ',' + y + ')' }, nodes.root);
        S('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx: kind === 'host' ? 8 : 5 }, g);
        S('text', { x: 0, y: sub ? -2 : 4, 'text-anchor': 'middle', 'class': 'na-devices-nm' }, g, title);
        if (sub) S('text', { x: 0, y: 11, 'text-anchor': 'middle', 'class': 'na-devices-sub' }, g, sub);
        var badge = S('text', { x: 0, y: h / 2 + 12, 'text-anchor': 'middle', 'class': 'na-devices-badge' }, g, '');
        nodes[id] = { g: g, x: x, y: y, badge: badge };
        if (kind === 'host') {
          g.setAttribute('role', 'button'); g.setAttribute('tabindex', '0'); g.setAttribute('aria-label', 'Host ' + id + ' — choose as source, then as destination');
          g.addEventListener('click', function () { pickHost(id); });
          g.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickHost(id); } });
        }
        return g;
      }
      function edge(a, b) { S('line', { x1: nodes[a].x, y1: nodes[a].y, x2: nodes[b].x, y2: nodes[b].y, 'class': 'na-devices-wire' }, nodes.wires); }
      function drawStage() {
        NA.clear(svgHost); nodes = {};
        var rt = st.mode === 'router', vw = rt ? 560 : 480, vh = rt ? 300 : 250;
        var svg = S('svg', { viewBox: '0 0 ' + vw + ' ' + vh, 'class': 'na-devices-svg' + (rt ? ' rt' : ''), role: 'img', 'aria-label': rt ? 'Two local networks joined by a router: hosts A, B and C and a switch on the left, hosts D, E and F and a second switch on the right.' : 'Four hosts A, B, C and D each cabled to one ' + (st.mode === 'hub' ? 'hub' : 'switch') + ' in the middle.' }, null);
        nodes.wires = S('g', null, svg); nodes.root = S('g', null, svg);
        // wires need node positions first: compute from tables
        var P = rt ? POS_RT : POS_LAN, wires = [];
        if (rt) {
          S('rect', { x: 4, y: 4, width: 216, height: 292, rx: 12, 'class': 'na-devices-lan' }, nodes.wires); S('text', { x: 12, y: 20, 'class': 'na-devices-lt' }, nodes.wires, 'LAN 1 · 192.0.2.0/24');
          S('rect', { x: 340, y: 4, width: 216, height: 292, rx: 12, 'class': 'na-devices-lan' }, nodes.wires); S('text', { x: 548, y: 20, 'text-anchor': 'end', 'class': 'na-devices-lt' }, nodes.wires, 'LAN 2 · 198.51.100.0/24');
          ['A', 'B', 'C', 'D', 'E', 'F'].forEach(function (h) { node(h, P[h][0], P[h][1], 'host', h, D.HOSTS[h].ip, 92, 40); });
          node('S1', P.S1[0], P.S1[1], 'dev switch', 'Switch 1', null, 70, 34); node('S2', P.S2[0], P.S2[1], 'dev switch', 'Switch 2', null, 70, 34);
          node('R', P.R[0], P.R[1], 'dev router', 'Router', 'FE:01 | FE:02', 92, 48);
          [['A', 'S1'], ['B', 'S1'], ['C', 'S1'], ['S1', 'R'], ['R', 'S2'], ['S2', 'D'], ['S2', 'E'], ['S2', 'F']].forEach(function (w) { wires.push(w); });
        } else {
          ['A', 'B', 'C', 'D'].forEach(function (h) { node(h, P[h][0], P[h][1], 'host', h, D.HOSTS[h].mac, 90, 40); });
          node('DEV', P.DEV[0], P.DEV[1], 'dev ' + st.mode, st.mode === 'hub' ? 'Hub' : 'Switch', st.mode === 'hub' ? 'repeats signals' : 'reads MAC addresses', 130, 48);
          ['A', 'B', 'C', 'D'].forEach(function (h) { wires.push([h, 'DEV']); });
        }
        wires.forEach(function (w) { edge(w[0], w[1]); });
        tokens = S('g', null, svg); svgHost.appendChild(svg);
      }
      function clearMarks() { Object.keys(nodes).forEach(function (k) { if (nodes[k].badge) { nodes[k].badge.textContent = ''; nodes[k].g.classList.remove('ok', 'heard', 'drop', 'src'); } }); }
      function mark(id, kind, text) { if (!nodes[id]) return; nodes[id].g.classList.add(kind); nodes[id].badge.textContent = text; }
      function fly(a, b, label, cls) {
        var A = nodes[a], B = nodes[b], g = S('g', { 'class': 'na-devices-tok ' + (cls || '') }, tokens);
        S('rect', { x: -22, y: -9, width: 44, height: 18, rx: 5 }, g); S('text', { x: 0, y: 4, 'text-anchor': 'middle' }, g, label);
        g.setAttribute('transform', 'translate(' + A.x + ',' + A.y + ')');
        return run.tween(run.cur, NA.dur(650), function (t) { var e = NA.ease(t); g.setAttribute('transform', 'translate(' + NA.lerp(A.x, B.x, e) + ',' + NA.lerp(A.y, B.y, e) + ')'); }).then(function (ok) { if (g.parentNode) g.parentNode.removeChild(g); return ok; });
      }

      /* ---- tables ---- */
      var newRow = null;
      function nodeName(id) { return id === 'R' ? 'Router' : id; }
      function renderTables() {
        NA.clear(tabBox);
        function swTable(title, s, extra) {
          var t = E('table', 'na-table'), rows = Object.keys(s.table);
          t.appendChild(E('caption', 'na-devices-cap', title));
          t.innerHTML += '<tr><th>MAC address</th><th>Port (leads to)</th></tr>';
          if (!rows.length) t.innerHTML += '<tr><td colspan="2" class="na-devices-empty">empty — it has not seen any frame yet</td></tr>';
          rows.forEach(function (m) { var tr = E('tr', newRow === s.table[m] + m ? 'new' : ''); tr.innerHTML = '<td>' + m + '</td><td>' + nodeName(s.table[m]) + '</td>'; t.appendChild(tr); });
          return t;
        }
        if (st.mode === 'hub') { tabBox.appendChild(E('p', 'na-note', 'A hub has no table: it does not even read addresses.')); return; }
        if (st.mode === 'switch') tabBox.appendChild(swTable('Switch MAC address table (learned)', sw.lan));
        else {
          tabBox.appendChild(swTable('Switch 1 table', sw[1])); tabBox.appendChild(swTable('Switch 2 table', sw[2]));
          var t = E('table', 'na-table'); t.appendChild(E('caption', 'na-devices-cap', 'Router table (routes by IP network)'));
          t.innerHTML += '<tr><th>Network</th><th>Send out of</th></tr><tr><td>192.0.2.0/24</td><td>eth0 (LAN 1)</td></tr><tr><td>198.51.100.0/24</td><td>eth1 (LAN 2)</td></tr>';
          tabBox.appendChild(t);
        }
      }
      function renderHeaders(hops) {
        NA.clear(hdrBox);
        var rt = st.mode === 'router', t = E('table', 'na-table'); t.appendChild(E('caption', 'na-devices-cap', 'What is written on the frame at each step'));
        t.innerHTML += '<tr><th>Step</th><th>src MAC</th><th>dst MAC</th>' + (rt ? '<th>src IP</th><th>dst IP</th><th>TTL</th>' : '') + '</tr>';
        if (!hops.length) { t.innerHTML += '<tr><td colspan="' + (rt ? 6 : 3) + '" class="na-devices-empty">send a frame to see its addresses</td></tr>'; }
        hops.forEach(function (h, i) {
          var p = hops[i - 1], tr = E('tr'), cell = function (v, k) { return '<td' + (p && p[k] !== v ? ' class="chg"' : '') + '>' + v + '</td>'; };
          tr.innerHTML = '<td>' + (rt ? (i + 1) + ' · LAN ' + h.lan : 'on the LAN') + '</td>' + cell(h.srcMac, 'srcMac') + cell(h.dstMac, 'dstMac') + (rt ? cell(h.srcIp, 'srcIp') + cell(h.dstIp, 'dstIp') + cell(h.ttl, 'ttl') : '');
          t.appendChild(tr);
        });
        var sc = E('div', 'na-devices-scroll'); sc.appendChild(t); hdrBox.appendChild(sc);
        if (rt && hops.length > 1) hdrBox.appendChild(E('p', 'na-note', 'Highlighted cells changed at the router: the MAC addresses and the TTL change, the IP addresses never do.'));
      }
      function paintStats() { tFr.set(st.frames); tWaste.set(st.wasted); tWaste.node.classList.toggle('bad', st.wasted > 0); }

      /* ---- one send ---- */
      function setBusy(b) { st.busy = b; [bSend, bBc].forEach(function (x) { x.disabled = b; }); }
      function pickHost(id) {
        if (st.busy) return;
        if (st.picking === 'from' || id === st.from) { st.from = id; fromSel.value = id; fixTo(); st.picking = 'to'; clearMarks(); mark(id, 'src', 'sender'); nar.say('<b>' + id + '</b> will send. Now click the host that should <b>receive</b> it.'); }
        else { st.to = id; toSel.value = id; st.picking = 'from'; send(id); }
      }
      function narrateLan(r, to) {
        var a = r.action, names = function (l) { return l.join(', '); };
        if (st.mode === 'hub') return 'The hub does not read addresses — it <b>copies the signal out of every other port</b>. ' + (to === '*' ? 'Everyone was meant to hear this one.' : to + ' recognises its MAC (<code>' + r.frame.dstMac + '</code>) and accepts; ' + names(r.bystanders) + ' also receive it, ignore it, and one of them could have read it. <span class="bad">' + r.bystanders.length + ' copies wasted.</span>');
        if (a === 'broadcast') return 'The destination <code>FF:FF</code> means “everyone”, so even a switch must send it out of <b>every</b> port. That is why a huge flat LAN gets noisy — and why routers, which stop broadcasts, are used to split networks.';
        if (a === 'flood') return 'The switch has never seen <code>' + r.frame.dstMac + '</code>, so it does not know which port leads there and <b>floods</b> the frame like a hub — this one time. ' + (r.learned ? 'But it learned something: <code>' + r.frame.srcMac + '</code> lives behind port ' + r.learned.node + ' (a new row in the table). ' : '') + '<span class="bad">' + r.bystanders.length + ' bystander' + (r.bystanders.length === 1 ? '' : 's') + ' heard it.</span>';
        return 'The table already says <code>' + r.frame.dstMac + '</code> is behind port ' + to + ', so the switch sends the frame <b>only there</b>. B, C and D who are not involved hear nothing — <span class="ok">no copies wasted</span>.'.replace('B, C and D', ids().filter(function (h) { return h !== st.from && h !== to; }).join(' and '));
      }
      function narrateRoute(r, from, to) {
        var s = D.HOSTS[from], d = D.HOSTS[to];
        if (r.local) return '<b>' + to + '</b> (' + d.ip + ') is in the same network as ' + from + ' (' + s.ip + ' and ' + d.ip + ' agree on the first 24 bits), so ' + from + ' addresses the frame <b>straight to ' + to + '’s MAC</b>. The router never even sees it.';
        var t = from + ' compares ' + d.ip + ' with its own network <code>' + ROUTER[s.lan].net + '</code> — not the same. So ' + from + ' hands the packet to its <b>default gateway</b>: the frame is addressed to the router’s MAC <code>' + ROUTER[s.lan].mac + '</code>, but the packet inside still says destination <code>' + d.ip + '</code>. ';
        if (r.dropped) return t + 'The router reads the IP header and checks its rules before forwarding: <span class="bad">' + r.reason + ' matches, so the packet is dropped.</span> That is what a firewall is: a list of rules applied to traffic passing through.';
        return t + 'The router reads the destination IP, finds <code>' + ROUTER[d.lan].net + '</code> in its table (out of ' + ROUTER[d.lan].eth + '), lowers the TTL to 63 and wraps the same packet in a <b>new frame</b>: src MAC <code>' + ROUTER[d.lan].mac + '</code>, dst MAC <code>' + d.mac + '</code>. <b>MACs change at every hop; IPs stay the same end to end.</b>' + (st.svcFw ? ' Port 80 is allowed by the firewall.' : '') + (r.hops.some(function (h) { return h.bystanders.length; }) ? ' <span class="bad">A switch that does not know a MAC yet floods</span>, so the hosts marked “ignores” overheard a frame; send a reply and the tables learn.' : ' Both switches already knew where to send it, so nobody else heard anything.');
      }
      async function animateStep(h, to, plan) {
        // h: {srcNode, devNode, outs:[{id, main}], learned, label}
        var ok = await fly(h.srcNode, h.devNode, h.label, 'main'); if (!ok) return false;
        if (h.learned) { newRow = h.learned.node + h.learned.mac; renderTables(); newRow = null; }
        var moves = h.outs.map(function (o) { return fly(h.devNode, o.id, h.label, o.main ? 'main' : 'ghost'); });
        var res = await Promise.all(moves); if (res.indexOf(false) >= 0) return false;
        h.outs.forEach(function (o) { mark(o.id, o.main ? 'ok' : 'heard', o.badge); });
        return true;
      }
      async function send(toId) {
        if (st.busy) return;
        var from = st.from; st.to = toId; toSel.value = toId; st.picking = 'from';
        var g = run.start(); run.cur = g; setBusy(true); clearMarks(); mark(from, 'src', 'sender');
        var steps = [], text = '', hops = [], wasted = 0, label = from + '→' + (toId === '*' ? 'all' : toId);
        if (st.mode !== 'router') {
          var r = D.lanSend(st.mode, sw.lan, from, toId);
          hops = [{ lan: 1, srcMac: r.frame.srcMac, dstMac: r.frame.dstMac }]; wasted = r.bystanders.length; text = narrateLan(r, toId);
          steps.push({ srcNode: from, devNode: 'DEV', label: label, learned: r.learned, outs: r.out.map(function (o) { var main = r.delivered.indexOf(o) >= 0; return { id: o, main: main, badge: main ? (toId === '*' ? '✓ reads it' : '✓ for me') : 'ignores' }; }) });
        } else {
          var fwOn = fw.checked; st.svcFw = fwOn && svcSel.value === 'web';
          var rr = D.routeSend({ from: from, to: toId, service: svcSel.value, firewall: fwOn, switches: sw });
          text = narrateRoute(rr, from, toId); hops = rr.hops;
          rr.hops.forEach(function (h) {
            wasted += h.bystanders.length;
            steps.push({ srcNode: h.srcNode, devNode: h.lan === 1 ? 'S1' : 'S2', label: label, learned: h.sw.learned, hop: h,
              outs: h.sw.out.map(function (o) { var main = o === h.dstNode; return { id: o, main: main, badge: main ? (o === 'R' ? '✓ gateway' : '✓ for me') : 'ignores' }; }) });
          });
          steps.dropAt = rr.dropped ? 'R' : null; steps.local = rr.local;
        }
        st.frames++; st.wasted += wasted; renderHeaders(hops); paintStats();
        for (var i = 0; i < steps.length; i++) {
          if (i > 0) { mark('R', 'ok', 'new frame, TTL 63'); await run.sleep(g, NA.dur(250)); if (!run.alive(g)) return; }
          var ok = await animateStep(steps[i]); if (!ok) return;
        }
        if (steps.dropAt) mark('R', 'drop', '✗ dropped by firewall');
        else if (st.mode === 'router' && !steps.local) mark('R', 'ok', 'forwarded');
        nar.say(text); setBusy(false);
      }

      var INTRO = {
        hub: 'A <b>hub</b> is a dumb repeater. Click a sender host, then a destination (or use the menus) and watch who else gets a copy.',
        switch: 'A <b>switch</b> reads the destination MAC address and remembers where each address lives. Click a sender, then a destination — start with A → C.',
        router: 'A <b>router</b> joins two networks and reads the IP address. Click a host on the left, then a host on the right, and compare the addresses on the frame.'
      };
      var CHIPS = {
        hub: [['A → C', 'A', 'C'], ['C → A', 'C', 'A'], ['Broadcast from D', 'D', '*']],
        switch: [['A → C (unknown)', 'A', 'C'], ['C → A (reply)', 'C', 'A'], ['A → C again', 'A', 'C'], ['Broadcast from D', 'D', '*']],
        router: [['A → D (other network)', 'A', 'D'], ['D → A (reply)', 'D', 'A'], ['A → D again', 'A', 'D'], ['A → B (same network)', 'A', 'B'], ['A → D by Telnet, firewall on', 'A', 'D', 'telnet', true]]
      };
      function setMode(m) {
        run.cancel(); setBusy(false); st.mode = m; modeSeg.set(m); st.frames = 0; st.wasted = 0; st.picking = 'from'; resetSwitches();
        st.from = 'A'; st.to = m === 'router' ? 'D' : 'C';
        fillSelects(); drawStage(); renderHeaders([]); renderTables(); paintStats();
        var rt = m === 'router'; fSvc.style.display = fwLab.style.display = rt ? '' : 'none'; bBc.style.display = rt ? 'none' : '';
        NA.clear(chips); chips.appendChild(E('span', 'na-lab', 'Scenarios'));
        CHIPS[m].forEach(function (c) { chips.appendChild(NA.chip(c[0], function () {
          if (st.busy) return; st.from = c[1]; fromSel.value = c[1]; fixTo(); st.to = c[2]; toSel.value = c[2];
          svcSel.value = c[3] || 'web'; fw.checked = !!c[4];
          send(c[2]); })); });
        nar.say(INTRO[m]);
      }
      setMode('switch');
    }
  });
})();
