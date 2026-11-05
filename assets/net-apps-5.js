/* Chapter 9 attack simulations (concept 9.10): "Man-in-the-middle on the LAN" (atk-mitm), "DNS spoofing race" (atk-dns),
   "Port scan vs firewall and IDS" (atk-scan).
   Logic is in pure functions (NetApps.engines.Mitm / DnsSpoof / Scan) so Node can test it; the UI below runs only in a browser.
   Defensive education: every attack is a labelled SIMULATION with invented names and RFC 5737 documentation addresses
   (victim 192.0.2.10, router 192.0.2.1, attacker 192.0.2.66, servers in 203.0.113.0/24 and 198.51.100.0/24). Nothing touches a network. */
(function () {
  'use strict';
  var NA = (typeof window !== 'undefined' && window.NetApps) || require('./net-apps-core.js');
  var hasDom = typeof document !== 'undefined';

  function hash(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  /* ILLUSTRATION ONLY (not real encryption): deterministic hex noise that looks like an encrypted record */
  function cipher(text, lines) {
    var r = NA.rng(hash(text)), out = [];
    for (var i = 0; i < (lines || 3); i++) { var s = ''; for (var j = 0; j < 16; j++) { var b = Math.floor(r() * 256).toString(16); s += (b.length < 2 ? '0' : '') + b + ' '; } out.push(s.trim()); }
    return out;
  }
  function esc(s) { return NA.esc(s); }

  /* =====================================================================================================
     atk-mitm engine — ARP spoofing + man-in-the-middle
     ===================================================================================================== */
  var NODE = {
    V: { name: 'Alice’s PC', ip: '192.0.2.10', mac: '0A:10' },
    A: { name: 'Attacker’s PC', ip: '192.0.2.66', mac: '0A:66' },
    SW: { name: 'Switch', ip: '', mac: '' },
    R: { name: 'Router', ip: '192.0.2.1', mac: '0A:01' },
    W: { name: 'Web server', ip: '203.0.113.10', mac: '' }
  };
  var PASSWORD = 'correct-horse', ACCOUNT_REAL = '7788-1234', ACCOUNT_FAKE = '6666-0001';

  function mitmSimulate(cfg) {
    cfg = cfg || {};
    var c = { arpSpoof: cfg.arpSpoof !== false, https: !!cfg.https, staticArp: !!cfg.staticArp, vpn: !!cfg.vpn, modify: !!cfg.modify, fakeCert: cfg.fakeCert !== false };
    var poisoned = c.arpSpoof && !c.staticArp;               // forged ARP replies accepted by Alice's PC and the router
    var tunnel = c.https || c.vpn;                           // something encrypts the content
    var certWarn = poisoned && c.https && !c.vpn && c.fakeCert;   // attacker answers the TLS handshake with its own certificate
    var tamper = poisoned && tunnel && c.modify && !certWarn;     // attacker flips bits inside an encrypted stream
    var sawPassword = poisoned && !tunnel;
    var pageAltered = poisoned && !tunnel && c.modify;
    var victimWarned = certWarn || tamper;
    var proto = c.vpn ? 'VPN' : c.https ? 'HTTPS' : 'HTTP';
    var reqLabel = tunnel ? 'encrypted' : 'POST /login';
    var resLabel = tunnel ? 'encrypted' : 'invoice page';
    function arp(p) {
      return {
        victim: [{ ip: NODE.R.ip, mac: p ? NODE.A.mac : NODE.R.mac, poisoned: !!p, who: 'router' }],
        router: [{ ip: NODE.V.ip, mac: p ? NODE.A.mac : NODE.V.mac, poisoned: !!p, who: 'Alice' }]
      };
    }
    var plainReq = ['POST /login HTTP/1.1', 'Host: www.example.com', '', 'user=alice&password=' + PASSWORD];
    var plainRes = ['HTTP/1.1 200 OK', '', 'Pay your invoice to account: ' + (pageAltered ? ACCOUNT_FAKE + '   <-- rewritten by the attacker' : ACCOUNT_REAL)];
    var steps = [];

    /* 1 — normal login: the switch only forwards to the router's port */
    steps.push({
      id: 'normal', title: '1 · Normal login',
      flows: [{ path: ['V', 'SW', 'R', 'W'], label: reqLabel }, { path: ['W', 'R', 'SW', 'V'], label: resLabel }],
      arp: arp(false), capture: [], captureNote: 'nothing — the switch never sent the attacker a copy',
      marks: { A: ['idle', 'sees nothing'] },
      say: '<b>① Normal login.</b> Alice’s PC sends the login form to the web server through the router (' + proto + '). A <b>switch</b> remembers which port leads to which MAC address, so it hands each frame <em>only</em> to the router’s port. The attacker’s PC is plugged in too, but its port never sees the frame: <b>nothing to capture</b>.'
    });

    /* 2 — the attacker lies with forged ARP replies */
    var s2 = { id: 'poison', title: '2 · Forged ARP replies', marks: {}, capture: [], captureNote: '' };
    if (!c.arpSpoof) {
      s2.flows = []; s2.arp = arp(false);
      s2.say = '<b>② The attacker stays quiet.</b> Switch on <em>“Attacker is active”</em> above to see the ARP lie. The ARP tables stay as they were.';
    } else if (c.staticArp) {
      s2.flows = [{ path: ['A', 'SW', 'V'], label: 'ARP: .1 is at 0A:66', cls: 'forged', stopAt: 'SW' }, { path: ['A', 'SW', 'R'], label: 'ARP: .10 is at 0A:66', cls: 'forged', stopAt: 'SW' }];
      s2.arp = arp(false); s2.marks = { SW: ['ok', 'drops forged ARP'] };
      s2.say = '<b>② The attacker lies — and the switch stops it.</b> It sends forged ARP replies (“<code>192.0.2.1</code> is at <code>0A:66</code>” to Alice, “<code>192.0.2.10</code> is at <code>0A:66</code>” to the router). This switch does <b>dynamic ARP inspection</b>: it checks every ARP reply against the real IP↔MAC bindings it knows and <b>drops</b> the forged ones. Both ARP tables stay correct.';
    } else {
      s2.flows = [{ path: ['A', 'SW', 'V'], label: 'ARP: .1 is at 0A:66', cls: 'forged' }, { path: ['A', 'SW', 'R'], label: 'ARP: .10 is at 0A:66', cls: 'forged' }];
      s2.arp = arp(true); s2.marks = { V: ['bad', 'ARP table poisoned'], R: ['bad', 'ARP table poisoned'] };
      s2.say = '<b>② The attacker lies.</b> It sends forged ARP replies: to Alice “<code>192.0.2.1</code> (the router) is at <code>0A:66</code>”, to the router “<code>192.0.2.10</code> (Alice) is at <code>0A:66</code>”. <b>ARP has no way to check who is speaking</b>, so both machines overwrite their tables with the lie (highlighted).';
    }
    steps.push(s2);

    /* 3 — Alice logs in again */
    var s3 = { id: 'login', title: '3 · Alice logs in again', marks: {} };
    var stopLine = '';
    if (!poisoned) {
      s3.flows = [{ path: ['V', 'SW', 'R', 'W'], label: reqLabel }, { path: ['W', 'R', 'SW', 'V'], label: resLabel }];
      s3.capture = []; s3.captureNote = 'nothing';
      s3.marks = { A: ['idle', 'still blind'] };
      stopLine = c.arpSpoof ? ' <span class="ok">Stopped by: the switch’s ARP inspection — the attacker never got in the middle.</span>' : '';
      s3.say = '<b>③ Alice logs in again.</b> The path is the same as before: Alice → switch → router → server. ' + (c.arpSpoof ? 'The forged ARP replies were dropped, so the attacker is <b>still blind</b>.' : 'There is no attack, so there is nothing to see.') + stopLine;
    } else if (certWarn) {
      s3.flows = [{ path: ['V', 'SW', 'A'], label: 'TLS hello' }, { path: ['A', 'SW', 'V'], label: 'fake certificate', cls: 'forged', stopAt: 'V' }];
      s3.capture = ['ClientHello  (server name: www.example.com)', '-- handshake aborted by Alice’s browser --'];
      s3.captureNote = 'only the first handshake message';
      s3.marks = { V: ['warn', 'browser warning'], A: ['bad', 'certificate rejected'] };
      s3.say = '<b>③ Alice logs in again — the ARP lie works, but HTTPS holds.</b> Her frames now reach the attacker, who tries to <em>pretend to be</em> <code>www.example.com</code>: it answers the TLS handshake with its own certificate, signed by “Mallory CA”. Alice’s browser checks the certificate, finds an <b>unknown authority</b> and shows a warning page <b>before any password is sent</b>. <span class="ok">Stopped by: HTTPS — as long as Alice does not click “continue anyway”.</span> Also stopped by ARP inspection or a VPN.';
    } else {
      var rd = !tunnel;
      s3.flows = [{ path: ['V', 'SW', 'A'], label: reqLabel }, { path: ['A', 'SW', 'R', 'W'], label: c.modify && tunnel ? 'tampered' : reqLabel, cls: c.modify && tunnel ? 'forged' : '' },
        { path: ['W', 'R', 'SW', 'A'], label: resLabel }, { path: tamper ? ['A', 'SW', 'V'] : ['A', 'SW', 'V'], label: pageAltered ? 'edited page' : tamper ? 'tampered' : resLabel, cls: (pageAltered || tamper) ? 'forged' : '' }];
      s3.capture = rd ? plainReq.concat([''], plainRes) : cipher(PASSWORD + proto, 4);
      s3.captureNote = rd ? 'readable text' : 'ciphertext only';
      s3.marks = rd ? { A: ['bad', 'reads everything'], V: [pageAltered ? 'bad' : 'warn', pageAltered ? 'sees the edited page' : 'suspects nothing'] }
        : tamper ? { A: ['ok', 'sees only ciphertext'], V: ['warn', 'integrity check fails'] } : { A: ['ok', 'sees only ciphertext'], V: ['ok', 'page is genuine'] };
      var traffic = 'Alice’s PC now addresses the frame to <code>0A:66</code>, so the switch delivers it to the <b>attacker</b>, who copies it and forwards it to the real router so nothing looks broken (the router’s lie sends the answer back the same way). ';
      if (rd) {
        s3.say = '<b>③ Alice logs in again — through the attacker.</b> ' + traffic + '<span class="bad">The password <code>' + PASSWORD + '</code> is readable in the capture' + (pageAltered ? ', and the attacker <b>rewrote the account number</b> in the invoice page.' : '.') + '</span> Stopped by: <b>HTTPS</b> (the attacker cannot read or forge it), <b>ARP inspection</b> on the switch, or a <b>VPN</b>.';
      } else if (tamper) {
        s3.say = '<b>③ Alice logs in again — through the attacker.</b> ' + traffic + 'The content is encrypted, so the attacker cannot read it. When it flips bits to edit the page, the <b>integrity check</b> of ' + (c.vpn ? 'the VPN' : 'TLS') + ' fails and Alice’s side drops the connection with an error. <span class="ok">Tampering is detected, not silently accepted.</span>';
      } else {
        s3.say = '<b>③ Alice logs in again — through the attacker.</b> ' + traffic + 'Everything inside is encrypted (' + proto + '): the capture is <b>ciphertext</b>. The attacker still learns <em>who</em> talks to <em>whom</em> (addresses, usually the site name) but not the password or the page. <span class="ok">Stopped by: ' + (c.vpn ? 'the VPN tunnel' : 'HTTPS') + '.</span> The forged ARP replies still worked — encryption makes them harmless, ARP inspection stops them.';
      }
    }
    s3.arp = arp(poisoned);
    steps.push(s3);

    var browser;
    if (certWarn) browser = { kind: 'warn', lock: false, title: 'Your connection is not private', body: 'The certificate for www.example.com was signed by an authority your browser does not trust (NET::ERR_CERT_AUTHORITY_INVALID).' };
    else if (tamper) browser = { kind: 'warn', lock: false, title: 'Secure connection failed', body: 'A received record failed its integrity check, so the connection was reset.' };
    else browser = { kind: pageAltered ? 'bad' : 'ok', lock: tunnel, title: tunnel ? (c.vpn && !c.https ? 'www.example.com (through a VPN, but still http)' : 'www.example.com') : 'www.example.com — not secure', body: 'Pay your invoice to account: ' + (pageAltered ? ACCOUNT_FAKE : ACCOUNT_REAL) };

    var seen = [];
    steps.forEach(function (s) { (s.capture || []).forEach(function (l) { seen.push(l); }); });
    return {
      config: c, poisoned: poisoned, steps: steps,
      arpTableVictim: arp(poisoned).victim, arpTableRouter: arp(poisoned).router,
      attackerSees: seen, attackerSeesKind: !poisoned ? 'nothing' : certWarn ? 'handshake only' : tunnel ? 'ciphertext' : 'plaintext',
      victimSees: browser,
      verdicts: { sawPassword: sawPassword, pageAltered: pageAltered, victimWarned: victimWarned, arpPoisoned: poisoned }
    };
  }

  /* =====================================================================================================
     atk-dns engine — a blind race for the transaction ID (and optionally the source port)
     ===================================================================================================== */
  var DnsSpoof = {
    FAKE_IP: '198.51.100.66', REAL_IP: '203.0.113.10', NAME: 'www.example.com', TTL: 300, PORT_BITS: 16,
    space: function (bits, portBits) { return Math.pow(2, bits + portBits); },
    /* chance that ONE attempt succeeds: the attacker sends k forged replies, each with a different guess, before the real answer arrives */
    chance: function (bits, portBits, k) { return Math.min(1, k / Math.pow(2, bits + portBits)); },
    cumulative: function (p, n) { return p >= 1 ? 1 : 1 - Math.pow(1 - p, n); },
    attempt: function (cfg, seed, i) {
      var portBits = cfg.portRandom ? DnsSpoof.PORT_BITS : 0;
      var p = DnsSpoof.chance(cfg.bits, portBits, cfg.k);
      var roll = NA.dice(seed, i, 7);
      var guessed = roll < p;
      return { i: i, p: p, roll: roll, guessed: guessed, won: guessed && !cfg.dnssec, rejected: guessed && !!cfg.dnssec };
    },
    newCache: function () { return { now: 0, entries: {} }; },
    lookup: function (cache, name) { var e = cache.entries[name || DnsSpoof.NAME]; return e && e.expiresAt > cache.now ? e : null; },
    poison: function (cache) { cache.entries[DnsSpoof.NAME] = { ip: DnsSpoof.FAKE_IP, forged: true, expiresAt: cache.now + DnsSpoof.TTL, ttl: DnsSpoof.TTL }; },
    advance: function (cache, sec) { cache.now += sec; },
    /* what Alice's browser does after asking the (possibly poisoned) resolver */
    visit: function (cfg, cache) {
      var e = DnsSpoof.lookup(cache);
      if (e && e.forged && !cfg.dnssec) {
        return cfg.https
          ? { outcome: 'cert-warning', ip: e.ip, ttlLeft: e.expiresAt - cache.now, text: 'The resolver says www.example.com is ' + e.ip + '. The browser connects there and starts TLS, but the attacker’s server has no valid certificate for that name: warning page, no data sent.' }
          : { outcome: 'fake-page', ip: e.ip, ttlLeft: e.expiresAt - cache.now, text: 'The resolver says www.example.com is ' + e.ip + '. Plain HTTP has no way to check, so the attacker’s look-alike page loads.' };
      }
      return { outcome: 'real-page', ip: DnsSpoof.REAL_IP, ttlLeft: 0, text: 'The resolver gives the real address ' + DnsSpoof.REAL_IP + ' and the real page loads.' };
    }
  };

  /* =====================================================================================================
     atk-scan engine — probes, firewall verdicts, IDS threshold
     ===================================================================================================== */
  var SERVICES = { 22: 'SSH', 80: 'HTTP', 443: 'HTTPS', 3306: 'Database', 8080: 'Test web app' };
  var COMMON = [21, 22, 23, 25, 53, 80, 110, 143, 443, 445, 3306, 3389, 8080];
  var PORT_NAMES = { 21: 'FTP', 22: 'SSH', 23: 'Telnet', 25: 'SMTP', 53: 'DNS', 80: 'HTTP', 110: 'POP3', 143: 'IMAP', 443: 'HTTPS', 445: 'SMB', 3306: 'Database', 3389: 'Remote desktop', 8080: 'Alt. HTTP' };
  var Scan = {
    SERVICES: SERVICES, COMMON: COMMON, PORT_NAMES: PORT_NAMES,
    range: function (a, b) { var o = []; for (var i = a; i <= b; i++) o.push(i); return o; },
    /* cfg: {ports, services:{port:name}, firewall:{default:'allow'|'deny', rules:{port:'allow'|'deny'}}, ids:{on,maxPorts,windowSec}, rate (probes per second)} */
    run: function (cfg) {
      var services = cfg.services || SERVICES, fw = cfg.firewall || { default: 'allow', rules: {} }, rules = fw.rules || {};
      var ids = cfg.ids || { on: false }, rate = cfg.rate > 0 ? cfg.rate : 10;
      var results = [], recent = [], alarm = null;
      cfg.ports.forEach(function (port, i) {
        var tMs = Math.round(i * 1000 / rate);
        if (alarm) { results.push({ i: i, port: port, tMs: tMs, verdict: 'blocked', action: 'drop', service: null }); return; }
        var action = rules[port] || fw.default || 'allow';
        var verdict = action === 'deny' ? 'filtered' : (services[port] ? 'open' : 'closed');
        results.push({ i: i, port: port, tMs: tMs, verdict: verdict, action: action, service: verdict === 'open' ? services[port] : null });
        if (ids.on) {   // the IDS watches probes even when the firewall drops them
          recent.push({ port: port, tMs: tMs });
          var w = ids.windowSec * 1000;
          recent = recent.filter(function (r) { return tMs - r.tMs < w; });
          var seen = {}, n = 0; recent.forEach(function (r) { if (!seen[r.port]) { seen[r.port] = 1; n++; } });
          if (n > ids.maxPorts) alarm = { i: i, tMs: tMs, distinct: n, probes: i + 1 };
        }
      });
      var sum = { probed: results.length, open: [], closed: 0, filtered: 0, blocked: 0 };
      results.forEach(function (r) { if (r.verdict === 'open') sum.open.push(r.port); else sum[r.verdict]++; });
      return { results: results, alarmAt: alarm, blockedAfter: alarm ? alarm.i : null, summary: sum, detectedAfterMs: alarm ? alarm.tMs : null };
    }
  };

  NA.engines.Mitm = { simulate: mitmSimulate, NODE: NODE, PASSWORD: PASSWORD, cipher: cipher };
  NA.engines.DnsSpoof = DnsSpoof;
  NA.engines.Scan = Scan;
  if (typeof module !== 'undefined' && module.exports) module.exports = { Mitm: NA.engines.Mitm, DnsSpoof: DnsSpoof, Scan: Scan };
  if (!hasDom) return;

  /* =====================================================================================================
     UI helpers
     ===================================================================================================== */
  var E = NA.el, S = NA.svg;
  function chk(prefix, label, checked, onChange, title) {
    var inp = E('input'); inp.type = 'checkbox'; inp.checked = !!checked;
    var w = E('label', prefix + '-chk', [inp, ' ' + label]);
    if (title) w.title = title;
    inp.addEventListener('change', function () { onChange(inp.checked); });
    return { wrap: w, input: inp, set: function (v) { inp.checked = !!v; }, get: function () { return inp.checked; } };
  }
  function fmtMs(ms) { return ms < 1000 ? ms + ' ms' : (ms / 1000).toFixed(ms % 1000 ? 1 : 0) + ' s'; }
  function nf(n) { return n.toLocaleString('en-US'); }
  function oneIn(p) { return p >= 1 ? 'certain' : '1 in ' + nf(Math.round(1 / p)); }
  function pct(p) { var v = p * 100; return v >= 99.995 ? '100 %' : v >= 10 ? v.toFixed(1) + ' %' : v >= 0.01 ? v.toFixed(2) + ' %' : v === 0 ? '0 %' : '< 0.01 %'; }
  function boxNode(g, w, h, cls, title, sub) {
    S('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx: 8 }, g);
    S('text', { x: 0, y: sub ? -2 : 4, 'text-anchor': 'middle', 'class': 'nm' }, g, title);
    if (sub) S('text', { x: 0, y: 11, 'text-anchor': 'middle', 'class': 'sb' }, g, sub);
  }

  /* =====================================================================================================
     atk-mitm UI
     ===================================================================================================== */
  var MITM_POS = { V: [78, 62], A: [78, 232], SW: [215, 147], R: [335, 147], W: [484, 147] };
  var MITM_SIZE = { V: [112, 46], A: [112, 46], SW: [78, 36], R: [100, 46], W: [92, 46] };
  var MITM_KIND = { V: 'victim', A: 'attacker', SW: 'switch', R: 'router', W: 'server' };

  function buildMitm(host) {
    var P = 'na-atk-mitm', run = NA.runner();
    var cfg = { https: false, arpSpoof: true, modify: false, fakeCert: true, staticArp: false, vpn: false };
    var sim, stepIdx = 0, busy = false, nodes = {}, tokens, arpV = [], arpR = [];

    var proto = NA.segmented([{ value: 'http', label: 'HTTP' }, { value: 'https', label: 'HTTPS' }], 'http', function (v) { cfg.https = v === 'https'; changed(); }, 'Web protocol');
    var cAtk = chk(P, 'Attacker is active (ARP spoofing)', true, function (v) { cfg.arpSpoof = v; changed(); });
    var cMod = chk(P, 'Attacker also edits the page', false, function (v) { cfg.modify = v; changed(); });
    var cFake = chk(P, 'Attacker shows a fake certificate (HTTPS)', true, function (v) { cfg.fakeCert = v; changed(); });
    var cDai = chk(P, 'Switch checks ARP (dynamic ARP inspection)', false, function (v) { cfg.staticArp = v; changed(); }, 'The switch compares every ARP reply with the real IP↔MAC bindings and drops forged ones.');
    var cVpn = chk(P, 'VPN on Alice’s PC', false, function (v) { cfg.vpn = v; changed(); });
    var bPlay = NA.button('▶ Play', 'primary', function () { play(); });
    var bStep = NA.button('Step ›', '', function () { doStep(); });
    var bReset = NA.button('Reset', '', function () { reset(); });

    var c1 = E('div', 'na-controls'); c1.appendChild(NA.field('Alice’s connection', proto.wrap)); c1.appendChild(NA.speedControl());
    [bPlay, bStep, bReset].forEach(function (b) { c1.appendChild(b); });
    var c2 = E('div', 'na-controls tight'); c2.appendChild(E('span', 'na-lab', 'Attacker'));
    [cAtk, cMod, cFake].forEach(function (x) { c2.appendChild(x.wrap); });
    var c3 = E('div', 'na-controls tight'); c3.appendChild(E('span', 'na-lab', 'Defences'));
    [cDai, cVpn].forEach(function (x) { c3.appendChild(x.wrap); });
    var chips = E('div', 'na-chips'); chips.appendChild(E('span', 'na-lab', 'Scenarios'));
    var presets = [
      ['Plain HTTP, no defence', { https: false, arpSpoof: true, modify: false, staticArp: false, vpn: false }],
      ['…and the attacker edits the page', { https: false, arpSpoof: true, modify: true, staticArp: false, vpn: false }],
      ['Same attack on HTTPS', { https: true, arpSpoof: true, modify: false, staticArp: false, vpn: false, fakeCert: true }],
      ['Switch checks ARP', { https: false, arpSpoof: true, modify: false, staticArp: true, vpn: false }],
      ['HTTP inside a VPN', { https: false, arpSpoof: true, modify: false, staticArp: false, vpn: true }]
    ];
    presets.forEach(function (p) { chips.appendChild(NA.chip(p[0], function () { applyPreset(p[1]); })); });
    host.appendChild(c1); host.appendChild(c2); host.appendChild(c3); host.appendChild(chips);
    host.appendChild(E('p', 'na-note', 'Try this: press Play on plain HTTP and watch the password appear in the capture, then press the “Same attack on HTTPS” scenario.'));

    var cols = E('div', 'na-cols ' + P + '-cols'), left = E('div'), right = E('div', P + '-side');
    cols.appendChild(left); cols.appendChild(right); host.appendChild(cols);
    var stage = E('div', 'na-stage ' + P + '-stage'), svgHost = E('div'); stage.appendChild(svgHost); left.appendChild(stage);
    var key = E('div', 'na-key'); key.style.setProperty('--c', 'var(--ink-soft)');
    [['var(--cmp-1)', 'normal traffic'], ['var(--cmp-4)', 'forged / tampered']].forEach(function (k) { var s = E('span'); var i = E('i'); i.style.setProperty('--c', k[0]); s.appendChild(i); s.appendChild(document.createTextNode(k[1])); key.appendChild(s); });
    left.appendChild(key);
    var nar = NA.narrator(); left.appendChild(nar.node);
    var arpBox = E('div'), capBox = E('div'), brBox = E('div');
    right.appendChild(arpBox); right.appendChild(brBox); right.appendChild(capBox);
    var tiles = {
      pw: NA.stat('Attacker read the password?'), alt: NA.stat('Page altered?'), warn: NA.stat('Alice warned?'), arp: NA.stat('ARP table poisoned?')
    };
    var stats = E('div', 'na-stats');
    ['pw', 'alt', 'warn', 'arp'].forEach(function (k) { stats.appendChild(tiles[k].node); });
    host.appendChild(stats);
    host.appendChild(E('p', 'na-note', 'Simulation: the addresses (192.0.2.0/24 and 203.0.113.0/24), the MACs and the password are invented. Learn the attack to defend against it — never try it on a network you do not own.'));

    function drawStage() {
      NA.clear(svgHost); nodes = {};
      var svg = S('svg', { viewBox: '0 0 540 290', 'class': P + '-svg', role: 'img', 'aria-label': 'A local network: Alice’s PC and the attacker’s PC both plug into a switch; the switch connects to the router, which leads over the Internet to the web server.' }, svgHost);
      var wires = S('g', null, svg);
      S('rect', { x: 6, y: 6, width: 366, height: 278, rx: 12, 'class': P + '-lan' }, wires);
      S('text', { x: 16, y: 24, 'class': P + '-lt' }, wires, 'LAN · 192.0.2.0/24');
      [['V', 'SW'], ['A', 'SW'], ['SW', 'R']].forEach(function (w) { S('line', { x1: MITM_POS[w[0]][0], y1: MITM_POS[w[0]][1], x2: MITM_POS[w[1]][0], y2: MITM_POS[w[1]][1], 'class': P + '-wire' }, wires); });
      S('line', { x1: MITM_POS.R[0], y1: MITM_POS.R[1], x2: MITM_POS.W[0], y2: MITM_POS.W[1], 'class': P + '-wire inet' }, wires);
      S('text', { x: 410, y: 138, 'text-anchor': 'middle', 'class': P + '-lt' }, wires, 'Internet');
      var root = S('g', null, svg);
      Object.keys(MITM_POS).forEach(function (id) {
        var p = MITM_POS[id], sz = MITM_SIZE[id], n = NODE[id];
        var g = S('g', { 'class': P + '-node ' + MITM_KIND[id], transform: 'translate(' + p[0] + ',' + p[1] + ')' }, root);
        boxNode(g, sz[0], sz[1], '', n.name, id === 'SW' ? null : id === 'W' ? n.ip : n.ip + ' · ' + n.mac);
        var badge = S('text', { x: 0, y: sz[1] / 2 + 13, 'text-anchor': 'middle', 'class': P + '-badge' }, g, '');
        nodes[id] = { g: g, x: p[0], y: p[1], badge: badge };
      });
      tokens = S('g', null, svg);
    }
    function mark(id, kind, text) { var n = nodes[id]; if (!n) return; n.g.classList.add(kind); n.badge.textContent = text || ''; }
    function clearMarks() { Object.keys(nodes).forEach(function (k) { var n = nodes[k]; n.g.classList.remove('idle', 'bad', 'ok', 'warn'); n.badge.textContent = ''; }); }

    async function fly(flow, g) {
      var pts = flow.path.map(function (id) { return nodes[id]; });
      var label = flow.label, w = Math.max(40, label.length * 5.6 + 14);
      var tk = S('g', { 'class': P + '-tok ' + (flow.cls || '') }, tokens);
      S('rect', { x: -w / 2, y: -9, width: w, height: 18, rx: 5 }, tk); S('text', { x: 0, y: 4, 'text-anchor': 'middle' }, tk, label);
      tk.setAttribute('transform', 'translate(' + pts[0].x + ',' + pts[0].y + ')');
      for (var i = 0; i < pts.length - 1; i++) {
        var a = pts[i], b = pts[i + 1];
        var ok = await run.tween(g, NA.dur(380), function (t) { var e = NA.ease(t); tk.setAttribute('transform', 'translate(' + NA.lerp(a.x, b.x, e) + ',' + NA.lerp(a.y, b.y, e) + ')'); });
        if (!ok) { tk.remove(); return false; }
      }
      if (flow.stopAt) { tk.classList.add('dead'); mark(flow.stopAt, flow.stopAt === 'V' ? 'warn' : 'ok', flow.stopAt === 'V' ? 'rejects it' : 'drops it'); await run.sleep(g, NA.dur(450)); }
      tk.remove();
      return run.alive(g);
    }
    function renderArp(step) {
      NA.clear(arpBox);
      function tbl(title, rows) {
        var t = E('table', 'na-table'); t.appendChild(E('caption', P + '-cap', title));
        var th = E('tr'); ['IP address', 'MAC address'].forEach(function (h) { th.appendChild(E('th', null, h)); }); t.appendChild(th);
        rows.forEach(function (r) {
          var tr = E('tr', r.poisoned ? 'chg' : ''); tr.appendChild(E('td', null, r.ip + ' (' + r.who + ')')); tr.appendChild(E('td', null, r.mac + (r.poisoned ? '  ← attacker!' : '')));
          t.appendChild(tr);
        });
        return t;
      }
      var a = step ? step.arp : sim.steps[0].arp;
      arpBox.appendChild(tbl('Alice’s ARP table', a.victim)); arpBox.appendChild(tbl('Router’s ARP table', a.router));
    }
    var capLines = [], capNote = '';
    function renderCap() {
      NA.clear(capBox);
      capBox.appendChild(E('div', 'na-lab ' + P + '-cap', 'What the attacker captured' + (capNote ? ' — ' + capNote : '')));
      var pre = E('pre', P + '-pre');
      if (!capLines.length) { pre.textContent = '(nothing yet)'; pre.classList.add('empty'); }
      capLines.forEach(function (l) { var s = E('span', /password=/.test(l) || /rewritten/.test(l) ? 'hot' : '', l); pre.appendChild(s); pre.appendChild(document.createTextNode('\n')); });
      if (/^[0-9a-f]{2} /.test(capLines[0] || '')) pre.classList.add('cipher');
      capBox.appendChild(pre);
    }
    function renderBrowser(show) {
      NA.clear(brBox);
      brBox.appendChild(E('div', 'na-lab ' + P + '-cap', 'Alice’s browser'));
      var b = sim.victimSees, w = E('div', P + '-browser ' + (show ? b.kind : 'idle'));
      if (!show) { w.appendChild(E('div', P + '-url', '…')); w.appendChild(E('div', P + '-bbody', 'waiting for step 3')); }
      else {
        w.appendChild(E('div', P + '-url', (b.lock ? '🔒 ' : '⚠ ') + b.title));
        w.appendChild(E('div', P + '-bbody', b.body));
      }
      brBox.appendChild(w);
    }
    function paintTiles(done) {
      var v = sim.verdicts;
      ['pw', 'alt', 'warn', 'arp'].forEach(function (k) { tiles[k].node.classList.remove('good', 'bad', 'warn'); });
      if (!done) { ['pw', 'alt', 'warn', 'arp'].forEach(function (k) { tiles[k].set('—'); }); return; }
      tiles.pw.set(v.sawPassword ? 'YES' : 'no', v.sawPassword ? 'readable in the capture' : 'protected or never intercepted');
      tiles.pw.node.classList.add(v.sawPassword ? 'bad' : 'good');
      tiles.alt.set(v.pageAltered ? 'YES' : 'no', v.pageAltered ? 'Alice sees the attacker’s account' : '');
      tiles.alt.node.classList.add(v.pageAltered ? 'bad' : 'good');
      tiles.warn.set(v.victimWarned ? 'YES' : 'no', v.victimWarned ? 'the browser raised the alarm' : v.sawPassword ? 'she suspects nothing' : '');
      if (v.victimWarned) tiles.warn.node.classList.add('good'); else if (v.sawPassword || v.pageAltered) tiles.warn.node.classList.add('bad');
      tiles.arp.set(v.arpPoisoned ? 'YES' : 'no', v.arpPoisoned ? 'she and the router believe the lie' : '');
      tiles.arp.node.classList.add(v.arpPoisoned ? 'warn' : 'good');
    }
    function reset() {
      run.cancel(); busy = false; stepIdx = 0; sim = NA.engines.Mitm.simulate(cfg);
      drawStage(); capLines = []; capNote = ''; renderArp(null); renderCap(); renderBrowser(false); paintTiles(false);
      nar.say('Press <b>Play</b> (or <b>Step</b>) to watch three steps: a normal login, the attacker’s lie, and Alice logging in again.');
      bPlay.disabled = bStep.disabled = false;
    }
    function changed() { reset(); }
    function applyPreset(p) {
      Object.keys(p).forEach(function (k) { cfg[k] = p[k]; });
      proto.set(cfg.https ? 'https' : 'http'); cAtk.set(cfg.arpSpoof); cMod.set(cfg.modify); cFake.set(cfg.fakeCert); cDai.set(cfg.staticArp); cVpn.set(cfg.vpn);
      reset();
    }
    async function doStep() {
      if (busy || stepIdx >= sim.steps.length) return false;
      busy = true; var g = run.start(), st = sim.steps[stepIdx];
      clearMarks(); nar.say(st.say);
      for (var i = 0; i < st.flows.length; i++) { if (!(await fly(st.flows[i], g))) { busy = false; return false; } }
      Object.keys(st.marks || {}).forEach(function (id) { mark(id, st.marks[id][0], st.marks[id][1]); });
      renderArp(st); capLines = capLines.concat(st.capture || []); capNote = st.captureNote || capNote; renderCap();
      if (stepIdx === sim.steps.length - 1) { renderBrowser(true); paintTiles(true); }
      stepIdx++; busy = false;
      if (stepIdx >= sim.steps.length) { bPlay.disabled = bStep.disabled = true; }
      return true;
    }
    async function play() {
      if (stepIdx >= sim.steps.length) reset();
      while (stepIdx < sim.steps.length) {
        var ok = await doStep(); if (!ok) return;
        if (stepIdx < sim.steps.length && !(await run.sleep(run.start(), NA.dur(450)))) return;
      }
    }
    reset();
  }
  NA.register('atk-mitm', { title: 'Man-in-the-middle on the LAN (ARP spoofing)', hint: 'Simulation: an attacker on the same switch lies about the router’s address. Flip the defences and watch what the attacker can still see.', build: buildMitm });

  /* =====================================================================================================
     atk-dns UI
     ===================================================================================================== */
  function buildDns(host) {
    var P = 'na-atk-dns', D = NA.engines.DnsSpoof, run = NA.runner();
    var cfg = { bits: 16, portRandom: false, k: 1, dnssec: false, https: false };
    var seed = 27, attempts = 0, forged = 0, wonAt = null, rejected = 0, cache = D.newCache(), log = [], lastAttempt = null, visitRes = null, busy = false;

    var sBits = NA.slider('Transaction ID size', 4, 16, 1, cfg.bits, function (v) { return v + ' bits (' + nf(Math.pow(2, v)) + ' IDs)'; }, function (v) { cfg.bits = v; changed(false); });
    var sK = NA.slider('Forged replies per attempt (k)', 1, 500, 1, cfg.k, null, function (v) { cfg.k = v; changed(false); });
    var cPort = chk(P, 'Resolver randomises its source port (+16 bits)', false, function (v) { cfg.portRandom = v; changed(false); });
    var cSec = chk(P, 'DNSSEC validation on the resolver', false, function (v) { cfg.dnssec = v; changed(false); });
    var cHttps = chk(P, 'Alice uses HTTPS', false, function (v) { cfg.https = v; if (visitRes) visit(); });
    var bOne = NA.button('Attack once', 'primary', function () { attack(1); });
    var bHun = NA.button('Attack ×100', '', function () { attack(100); });
    var bTh = NA.button('Attack ×10,000', '', function () { attack(10000); });
    var bVisit = NA.button('Alice visits www.example.com', '', function () { visit(); });
    var bW1 = NA.button('Wait 1 min', '', function () { wait(60); });
    var bW5 = NA.button('Wait 5 min', '', function () { wait(300); });
    var bDice = NA.button('New dice', '', function () { seed = (seed * 7 + 13) % 100000; fullReset(); }, 'Re-roll the random numbers: same settings, different luck');
    var bReset = NA.button('Reset', '', function () { fullReset(); });

    var c1 = E('div', 'na-controls'); [sBits.wrap, sK.wrap].forEach(function (x) { c1.appendChild(x); });
    var c2 = E('div', 'na-controls tight'); c2.appendChild(E('span', 'na-lab', 'Defences')); [cPort, cSec, cHttps].forEach(function (x) { c2.appendChild(x.wrap); });
    var c3 = E('div', 'na-controls tight'); [bOne, bHun, bTh, bVisit, bW1, bW5, bDice, bReset].forEach(function (x) { c3.appendChild(x); });
    var chips = E('div', 'na-chips'); chips.appendChild(E('span', 'na-lab', 'Scenarios'));
    [['Toy: 6-bit IDs', { bits: 6, portRandom: false, k: 1, dnssec: false }], ['Real: 16-bit ID only', { bits: 16, portRandom: false, k: 1, dnssec: false }],
     ['16-bit ID + random port', { bits: 16, portRandom: true, k: 1, dnssec: false }], ['Flood of guesses (k = 500)', { bits: 16, portRandom: false, k: 500, dnssec: false }],
     ['DNSSEC on', { bits: 6, portRandom: false, k: 1, dnssec: true }]].forEach(function (p) { chips.appendChild(NA.chip(p[0], function () { applyPreset(p[1]); })); });
    host.appendChild(c1); host.appendChild(c2); host.appendChild(c3); host.appendChild(chips);
    host.appendChild(E('p', 'na-note', 'Try this: keep 6-bit IDs and press “Attack ×100”, then “Alice visits…”. Then switch on HTTPS (or DNSSEC) and look again. Finally set 16 bits + random port and see how long the same attack would take.'));
    var cols = E('div', 'na-cols ' + P + '-cols'), left = E('div'), right = E('div', P + '-side');
    cols.appendChild(left); cols.appendChild(right); host.appendChild(cols);
    var stage = E('div', 'na-stage ' + P + '-stage'), svgHost = E('div'); stage.appendChild(svgHost); left.appendChild(stage);
    var spaceBox = E('div', P + '-space'); left.appendChild(spaceBox);
    var nar = NA.narrator(); left.appendChild(nar.node);
    var cacheBox = E('div'), browserBox = E('div'), chartBox = E('div'), logBox = E('div');
    right.appendChild(cacheBox); right.appendChild(browserBox); right.appendChild(chartBox);
    var tiles = { n: NA.stat('Attempts'), p: NA.stat('Chance per attempt'), c: NA.stat('Chance so far (maths)'), r: NA.stat('Resolver cache') };
    var stats = E('div', 'na-stats'); ['n', 'p', 'c', 'r'].forEach(function (k) { stats.appendChild(tiles[k].node); }); host.appendChild(stats);
    host.appendChild(logBox);
    host.appendChild(E('p', 'na-note', 'Simulation: names and addresses are invented (the fake site is 198.51.100.66). Each attempt is one lookup in which the attacker, who cannot see the query, sends k forged answers before the real one. Real attacks need the resolver to ask — the attacker makes it ask for names it has not cached.'));

    var nodePos = { V: [60, 80], Rv: [195, 80], Au: [348, 80], At: [195, 200] }, nodes = {}, tokens;
    function portBits() { return cfg.portRandom ? D.PORT_BITS : 0; }
    function pAttempt() { return D.chance(cfg.bits, portBits(), cfg.k); }
    function drawStage() {
      NA.clear(svgHost);
      var svg = S('svg', { viewBox: '0 0 420 270', 'class': P + '-svg', role: 'img', 'aria-label': 'Alice’s PC asks the campus resolver, which asks the real authoritative server for www.example.com. The attacker, who cannot see the question, sends forged answers to the resolver.' }, svgHost);
      var wires = S('g', null, svg);
      [['V', 'Rv'], ['Rv', 'Au'], ['At', 'Rv']].forEach(function (w) { S('line', { x1: nodePos[w[0]][0], y1: nodePos[w[0]][1], x2: nodePos[w[1]][0], y2: nodePos[w[1]][1], 'class': P + '-wire' + (w[0] === 'At' ? ' atk' : '') }, wires); });
      var root = S('g', null, svg);
      var defs = { V: ['victim', 'Alice’s PC', '192.0.2.10'], Rv: ['resolver', 'Resolver', '192.0.2.53'], Au: ['server', 'Real DNS server', '203.0.113.53'], At: ['attacker', 'Attacker', 'fake site 198.51.100.66'] };
      Object.keys(defs).forEach(function (id) {
        var d = defs[id], p = nodePos[id], g = S('g', { 'class': P + '-node ' + d[0], transform: 'translate(' + p[0] + ',' + p[1] + ')' }, root);
        boxNode(g, id === 'At' ? 140 : id === 'Au' ? 118 : 104, 46, '', d[1], d[2]);
        var badge = S('text', { x: 0, y: 36, 'text-anchor': 'middle', 'class': P + '-badge' }, g, '');
        nodes[id] = { g: g, x: p[0], y: p[1], badge: badge };
      });
      tokens = S('g', null, svg);
    }
    async function animateAttempt(r, g) {
      function tok(a, b, label, cls) {
        var w = Math.max(36, label.length * 5.6 + 12), t = S('g', { 'class': P + '-tok ' + (cls || '') }, tokens);
        S('rect', { x: -w / 2, y: -9, width: w, height: 18, rx: 5 }, t); S('text', { x: 0, y: 4, 'text-anchor': 'middle' }, t, label);
        return run.tween(g, NA.dur(480), function (u) { var e = NA.ease(u); t.setAttribute('transform', 'translate(' + NA.lerp(nodes[a].x, nodes[b].x, e) + ',' + NA.lerp(nodes[a].y - (b === 'Au' && a === 'Rv' ? 18 : 0), nodes[b].y - (a === 'Au' ? 18 : 0), e) + ')'); }).then(function (ok) { if (ok) { t.remove(); } return ok; });
      }
      Object.keys(nodes).forEach(function (k) { nodes[k].badge.textContent = ''; nodes[k].g.classList.remove('ok', 'bad', 'warn'); });
      if (!(await tok('Rv', 'Au', 'query ID ????', ''))) return false;
      var a = tok('At', 'Rv', cfg.k + ' forged · guessed IDs', 'forged'), b = tok('Au', 'Rv', 'real answer', '');
      var rr = await Promise.all([a, b]); if (!rr[0] || !rr[1]) return false;
      if (r.won) { nodes.Rv.badge.textContent = 'accepts the FORGED answer'; nodes.Rv.g.classList.add('bad'); }
      else if (r.rejected) { nodes.Rv.badge.textContent = 'signature check fails'; nodes.Rv.g.classList.add('ok'); }
      else { nodes.Rv.badge.textContent = 'no guess matched'; nodes.Rv.g.classList.add('ok'); }
      return true;
    }
    function renderSpace(r) {
      NA.clear(spaceBox);
      var total = D.space(cfg.bits, portBits()), cells = Math.min(256, total), per = total / cells, ng = Math.min(cells, Math.max(1, Math.ceil(cfg.k / per)));
      spaceBox.appendChild(E('div', 'na-lab', 'Where the real ID hides — ' + nf(total) + ' possible ' + (cfg.portRandom ? '(ID, port) pairs' : 'IDs') + (per > 1 ? ', each square = ' + nf(per) : '')));
      var grid = E('div', P + '-grid'); grid.style.setProperty('--n', Math.min(cells, 32));
      var rnd = NA.rng(seed * 31 + (r ? r.i : 0) + 1), pick = {};
      while (Object.keys(pick).length < ng) pick[Math.floor(rnd() * cells)] = 1;
      var secret;
      if (r) { var keys = Object.keys(pick).map(Number); if (r.guessed) secret = keys[Math.floor(rnd() * keys.length)]; else { do { secret = Math.floor(rnd() * cells); } while (pick[secret] && ng < cells); } }
      for (var i = 0; i < cells; i++) {
        var c = E('i', pick[i] ? 'guess' : ''); if (r && i === secret) { c.classList.add('secret'); c.textContent = '★'; }
        grid.appendChild(c);
      }
      spaceBox.appendChild(grid);
      var key = E('div', 'na-key'); [['var(--cmp-4)', 'attacker’s guesses (k = ' + cfg.k + ')'], ['var(--cmp-2)', '★ the real ID (revealed after the attempt)']].forEach(function (k) { var s = E('span'); var ic = E('i'); ic.style.setProperty('--c', k[0]); s.appendChild(ic); s.appendChild(document.createTextNode(k[1])); key.appendChild(s); });
      spaceBox.appendChild(key);
    }
    function renderCache() {
      NA.clear(cacheBox);
      cacheBox.appendChild(E('div', 'na-lab ' + P + '-cap', 'Resolver cache · clock +' + cache.now + ' s'));
      var t = E('table', 'na-table'), th = E('tr'); ['name', 'address', 'TTL left'].forEach(function (h) { th.appendChild(E('th', null, h)); }); t.appendChild(th);
      var e = D.lookup(cache);
      if (!e) { var tr0 = E('tr'); var td0 = E('td', P + '-empty', 'empty — the resolver must ask the real server'); td0.colSpan = 3; tr0.appendChild(td0); t.appendChild(tr0); }
      else { var tr = E('tr', 'chg'); tr.appendChild(E('td', null, D.NAME)); tr.appendChild(E('td', null, e.ip + '  ← attacker!')); var left2 = e.expiresAt - cache.now; var tdl = E('td'); tdl.appendChild(document.createTextNode(left2 + ' s')); var bar = E('div', P + '-ttl'); var f = E('b'); f.style.width = Math.round(left2 / D.TTL * 100) + '%'; bar.appendChild(f); tdl.appendChild(bar); tr.appendChild(tdl); t.appendChild(tr); }
      cacheBox.appendChild(t);
    }
    function renderBrowser() {
      NA.clear(browserBox);
      browserBox.appendChild(E('div', 'na-lab ' + P + '-cap', 'Alice’s browser'));
      var w = E('div', P + '-browser ' + (visitRes ? (visitRes.outcome === 'real-page' ? 'ok' : visitRes.outcome === 'fake-page' ? 'bad' : 'warn') : 'idle'));
      if (!visitRes) { w.appendChild(E('div', P + '-url', '…')); w.appendChild(E('div', P + '-bbody', 'press “Alice visits www.example.com”')); }
      else {
        var lock = cfg.https && visitRes.outcome === 'real-page';
        w.appendChild(E('div', P + '-url', (lock ? '🔒 ' : cfg.https ? '⚠ ' : '') + (cfg.https ? 'https://' : 'http://') + D.NAME + '  →  ' + visitRes.ip));
        w.appendChild(E('div', P + '-bbody', visitRes.outcome === 'fake-page' ? 'A look-alike login page (served by the attacker)' : visitRes.outcome === 'cert-warning' ? 'Your connection is not private — certificate is not valid for www.example.com' : 'The real www.example.com page'));
      }
      browserBox.appendChild(w);
    }
    function renderChart() {
      NA.clear(chartBox);
      chartBox.appendChild(E('div', 'na-lab ' + P + '-cap', 'Chance the attacker has won after n attempts'));
      var W = 360, H = 190, L = 38, R = 8, T = 10, B = 28, maxExp = 6;
      var svg = S('svg', { viewBox: '0 0 ' + W + ' ' + H, 'class': P + '-chart', role: 'img', 'aria-label': 'Chart of the cumulative chance of a successful forgery against the number of attempts, on a logarithmic axis, for your settings and for the real 16-bit settings.' }, chartBox);
      function X(n) { return L + (Math.log10(Math.max(1, n)) / maxExp) * (W - L - R); }
      function Y(p) { return T + (1 - p) * (H - T - B); }
      [0, 0.5, 1].forEach(function (p) { S('line', { x1: L, x2: W - R, y1: Y(p), y2: Y(p), 'class': P + '-grid-l' }, svg); S('text', { x: L - 5, y: Y(p) + 3, 'text-anchor': 'end', 'class': P + '-tl' }, svg, Math.round(p * 100) + '%'); });
      for (var e = 0; e <= maxExp; e += 1) { S('line', { x1: X(Math.pow(10, e)), x2: X(Math.pow(10, e)), y1: T, y2: H - B, 'class': P + '-grid-l v' }, svg); S('text', { x: X(Math.pow(10, e)), y: H - B + 12, 'text-anchor': 'middle', 'class': P + '-tl' }, svg, e === 0 ? '1' : e === 3 ? '1k' : e === 6 ? '1M' : '10^' + e); }
      S('text', { x: (L + W - R) / 2, y: H - 3, 'text-anchor': 'middle', 'class': P + '-tl' }, svg, 'attempts (log scale)');
      function line(bits, pb, k, cls) {
        var d = '', p = D.chance(bits, pb, k);
        for (var i = 0; i <= 120; i++) { var n = Math.pow(10, maxExp * i / 120); d += (i ? 'L' : 'M') + X(n).toFixed(1) + ' ' + Y(D.cumulative(p, n)).toFixed(1); }
        S('path', { d: d, 'class': P + '-line ' + cls }, svg);
      }
      line(16, 0, 1, 'ref1'); line(16, 16, 1, 'ref2'); line(cfg.bits, portBits(), cfg.k, 'now');
      var lx = L + 8, ly = T + 10;
      [['now', 'your settings'], ['ref1', '16-bit ID, k = 1'], ['ref2', '16-bit ID + random port, k = 1']].forEach(function (l, i) {
        S('line', { x1: lx, x2: lx + 18, y1: ly + i * 12 + 2, y2: ly + i * 12 + 2, 'class': P + '-line ' + l[0] }, svg); S('text', { x: lx + 23, y: ly + i * 12 + 5, 'class': P + '-tl' }, svg, l[1]);
      });
      if (attempts > 0) { var cp = D.cumulative(pAttempt(), attempts); S('line', { x1: X(attempts), x2: X(attempts), y1: T, y2: H - B, 'class': P + '-now-l' }, svg); S('circle', { cx: X(attempts), cy: Y(cp), r: 4, 'class': P + '-dot' + (wonAt ? ' won' : '') }, svg); }
    }
    function renderLog() {
      NA.clear(logBox);
      if (!log.length) return;
      logBox.appendChild(E('div', 'na-lab ' + P + '-cap', 'Resolver log (latest attempts)'));
      var pre = E('pre', P + '-pre'); log.slice(-6).forEach(function (l) { pre.appendChild(E('span', l.cls, l.t)); pre.appendChild(document.createTextNode('\n')); }); logBox.appendChild(pre);
    }
    function renderTiles() {
      var p = pAttempt();
      tiles.n.set(nf(attempts), forged ? nf(forged) + ' forged replies sent' : '');
      tiles.p.set(oneIn(p), 'k ÷ 2^' + (cfg.bits + portBits()) + ' = ' + (p >= 1 ? '1' : p < 1e-4 ? p.toExponential(1) : p.toFixed(4)));
      tiles.c.set(pct(D.cumulative(p, attempts)), 'after ' + nf(attempts) + ' attempts');
      tiles.r.node.classList.remove('good', 'bad');
      if (wonAt && D.lookup(cache)) { tiles.r.set('POISONED', 'attempt ' + nf(wonAt) + ' won the race'); tiles.r.node.classList.add('bad'); }
      else if (cfg.dnssec && rejected) { tiles.r.set('clean', nf(rejected) + ' lucky guess(es) rejected'); tiles.r.node.classList.add('good'); }
      else { tiles.r.set('clean', wonAt ? 'the lie has expired' : 'no forgery accepted'); }
      bOne.disabled = bHun.disabled = bTh.disabled = !!(wonAt && D.lookup(cache));
    }
    function paintAll() { renderCache(); renderBrowser(); renderChart(); renderLog(); renderTiles(); }
    function fullReset() {
      run.cancel(); busy = false; attempts = 0; forged = 0; wonAt = null; rejected = 0; cache = D.newCache(); log = []; lastAttempt = null; visitRes = null;
      drawStage(); renderSpace(null); paintAll();
      nar.say('The resolver is <b>clean</b>. Each attempt is a race: the attacker must guess the real answer’s random ID' + (cfg.portRandom ? ' <em>and</em> the port it comes back to' : '') + ' before the real server answers. Odds per attempt: <b>' + oneIn(pAttempt()) + '</b>.');
    }
    function changed(resetAll) { if (resetAll === false) { renderSpace(lastAttempt); renderChart(); renderTiles(); if (!attempts) nar.say('Odds per attempt: <b>' + oneIn(pAttempt()) + '</b>' + (cfg.dnssec ? ' — but with DNSSEC even a lucky guess is rejected.' : '.')); } else fullReset(); }
    function applyPreset(p) {
      Object.keys(p).forEach(function (k) { cfg[k] = p[k]; });
      sBits.set(cfg.bits); sK.set(cfg.k); cPort.set(cfg.portRandom); cSec.set(cfg.dnssec); fullReset();
    }
    async function attack(n) {
      if (busy || (wonAt && D.lookup(cache))) return;
      busy = true; var g = run.start(), wins = 0, firstWin = null, lastR = null, done = 0;
      for (var j = 0; j < n; j++) {
        attempts++; forged += cfg.k;
        var r = D.attempt(cfg, seed, attempts); lastR = r; done++; lastAttempt = r;
        log.push({ t: 'attempt ' + nf(attempts) + ': p = ' + oneIn(r.p) + ' → ' + (r.won ? 'FORGED ANSWER ACCEPTED' : r.rejected ? 'guess matched, but the DNSSEC signature is wrong: rejected' : 'no guess matched, real answer used'), cls: r.won ? 'hot' : '' });
        if (r.rejected) rejected++;
        if (r.won) { wonAt = attempts; D.poison(cache); firstWin = r; break; }
        if (n === 1) break;
      }
      if (n === 1) { renderSpace(lastR); if (!(await animateAttempt(lastR, g))) { busy = false; return; } }
      else renderSpace(lastR);
      paintAll(); busy = false;
      if (firstWin) {
        nar.say('<b>Poisoned after ' + nf(attempts) + ' attempt' + (attempts > 1 ? 's' : '') + '.</b> A forged answer carried the right ID, so the resolver cached <code>www.example.com → ' + D.FAKE_IP + '</code> for its TTL (' + D.TTL + ' s). Everyone using this resolver is now sent to the attacker — until the TTL runs out. Press <em>Alice visits</em> to see what she gets. <span class="ok">Stopped by: DNSSEC (signatures), a larger ID space + random source port, and HTTPS (the fake server has no valid certificate).</span>');
      } else {
        var base = 'After ' + nf(attempts) + ' attempt' + (attempts > 1 ? 's' : '') + ' no forged answer has been accepted. The maths says the chance so far was <b>' + pct(D.cumulative(pAttempt(), attempts)) + '</b>; each extra try costs the attacker almost nothing, which is why the ID space has to be big.';
        nar.say(cfg.dnssec ? base + ' With <b>DNSSEC on</b> even a lucky guess would be rejected: the attacker cannot sign a forged answer.' : base);
      }
    }
    function visit() {
      visitRes = D.visit(cfg, cache); renderBrowser();
      var v = visitRes;
      nar.say('<b>Alice types www.example.com.</b> ' + v.text + (v.outcome === 'real-page' ? (wonAt && !D.lookup(cache) ? ' The poisoned entry has <b>expired</b> (the lie only lasts as long as its TTL).' : cfg.dnssec ? ' DNSSEC means the resolver never accepted the forgery.' : '') : v.outcome === 'cert-warning' ? ' <span class="ok">HTTPS saved her even though DNS was poisoned.</span>' : ' <span class="bad">Nothing in plain HTTP warns her.</span>'));
    }
    function wait(sec) {
      D.advance(cache, sec); renderCache(); renderTiles();
      var e = D.lookup(cache);
      nar.say(wonAt ? (e ? 'Waited ' + sec + ' s: the poisoned entry still has <b>' + (e.expiresAt - cache.now) + ' s</b> to live — everyone using this resolver keeps being misled.' : 'Waited ' + sec + ' s: the TTL ran out, the poisoned entry is <b>gone</b>. The next lookup goes to the real server — unless the attacker wins another race.') : 'Waited ' + sec + ' s. Nothing was cached, so nothing changes.');
      if (visitRes) { visitRes = null; renderBrowser(); }
    }
    fullReset();
  }
  NA.register('atk-dns', { title: 'DNS spoofing: a blind race for the answer', hint: 'Simulation: the attacker cannot see the resolver’s question, so it must guess the random ID. Shrink or grow the ID and watch the odds.', build: buildDns });

  /* =====================================================================================================
     atk-scan UI
     ===================================================================================================== */
  function buildScan(host) {
    var P = 'na-atk-scan', SC = NA.engines.Scan, run = NA.runner();
    var cfg = { target: 'common', rate: 10, def: 'allow', rules: {}, idsOn: true, maxPorts: 5, windowSec: 2 };
    var res = null, busy = false, nodes = {}, tokens, mapRows = {}, logPre, shown = 0;

    var tgtSel = NA.select([{ value: 'common', label: 'Common ports (13)' }, { value: 'range', label: 'Ports 1–1024' }], 'common', function (v) { cfg.target = v; reset(); });
    var rateSel = NA.select([{ value: '0.1', label: '1 probe every 10 s' }, { value: '1', label: '1 probe / s' }, { value: '10', label: '10 probes / s' }, { value: '100', label: '100 probes / s' }], '10', function (v) { cfg.rate = +v; reset(); });
    var defSeg = NA.segmented([{ value: 'allow', label: 'Allow all' }, { value: 'deny', label: 'Deny all' }], 'allow', function (v) { cfg.def = v; reset(); }, 'Firewall default policy');
    var cIds = chk(P, 'IDS watches the probes', true, function (v) { cfg.idsOn = v; reset(); });
    var sMax = NA.slider('Alarm if more than N different ports…', 1, 20, 1, cfg.maxPorts, null, function (v) { cfg.maxPorts = v; reset(); });
    var sWin = NA.slider('…are probed within T seconds', 1, 30, 1, cfg.windowSec, function (v) { return v + ' s'; }, function (v) { cfg.windowSec = v; reset(); });
    var bScan = NA.button('▶ Scan', 'primary', function () { scan(); });
    var bReset = NA.button('Reset', '', function () { reset(); });

    var c1 = E('div', 'na-controls'); c1.appendChild(NA.field('Attacker scans', tgtSel)); c1.appendChild(NA.field('Scan speed', rateSel)); c1.appendChild(NA.speedControl()); c1.appendChild(bScan); c1.appendChild(bReset);
    var c2 = E('div', 'na-controls'); c2.appendChild(NA.field('Firewall default policy', defSeg.wrap)); c2.appendChild(cIds.wrap); c2.appendChild(sMax.wrap); c2.appendChild(sWin.wrap);
    var chips = E('div', 'na-chips'); chips.appendChild(E('span', 'na-lab', 'Scenarios'));
    [['No firewall, no IDS', function () { setAll({ def: 'allow', rules: {}, idsOn: false }); }],
     ['Block only the database (3306)', function () { setAll({ def: 'allow', rules: { 3306: 'deny' }, idsOn: false }); }],
     ['Default deny: allow only 80 and 443', function () { setAll({ def: 'deny', rules: { 80: 'allow', 443: 'allow' }, idsOn: false }); }],
     ['IDS catches a fast scan', function () { setAll({ def: 'allow', rules: {}, idsOn: true, maxPorts: 5, windowSec: 2, rate: 10, target: 'common' }); }],
     ['“Slow and low” evades the IDS', function () { setAll({ def: 'allow', rules: {}, idsOn: true, maxPorts: 5, windowSec: 2, rate: 0.1, target: 'common' }); }]
    ].forEach(function (p) { chips.appendChild(NA.chip(p[0], p[1])); });
    host.appendChild(c1); host.appendChild(c2); host.appendChild(chips);
    host.appendChild(E('p', 'na-note', 'Try this: run “No firewall, no IDS” and read the attacker’s map; then “Default deny” and compare; then “IDS catches a fast scan”, and finally the slow-and-low scan.'));

    var cols = E('div', 'na-cols ' + P + '-cols'), left = E('div'), right = E('div', P + '-side');
    cols.appendChild(left); cols.appendChild(right); host.appendChild(cols);
    var stage = E('div', 'na-stage ' + P + '-stage'), svgHost = E('div'); stage.appendChild(svgHost); left.appendChild(stage);
    var nar = NA.narrator(); left.appendChild(nar.node);
    var tiles = { p: NA.stat('Ports probed'), o: NA.stat('Open ports found'), f: NA.stat('Filtered by firewall'), d: NA.stat('IDS alarm') };
    var stats = E('div', 'na-stats'); ['p', 'o', 'f', 'd'].forEach(function (k) { stats.appendChild(tiles[k].node); }); left.appendChild(stats);
    var ruleBox = E('div'); right.appendChild(ruleBox);
    var views = E('div', P + '-views'), mapBox = E('div'), logBox = E('div'); views.appendChild(mapBox); views.appendChild(logBox); host.appendChild(views);
    host.appendChild(E('p', 'na-note', 'Simulation: the target 203.0.113.10 and the attacker 192.0.2.66 are invented. Scanning is also how administrators audit their own machines — only ever scan systems you own or have written permission to test.'));

    function ports() { return cfg.target === 'common' ? SC.COMMON : SC.range(1, 1024); }
    function setAll(p) {
      Object.keys(p).forEach(function (k) { cfg[k] = k === 'rules' ? Object.assign({}, p[k]) : p[k]; });
      defSeg.set(cfg.def); cIds.set(cfg.idsOn); sMax.set(cfg.maxPorts); sWin.set(cfg.windowSec); rateSel.value = String(cfg.rate); tgtSel.value = cfg.target;
      reset();
    }
    function fwCfg() { return { default: cfg.def, rules: cfg.rules }; }
    function renderRules() {
      NA.clear(ruleBox);
      ruleBox.appendChild(E('div', 'na-lab ' + P + '-cap', 'The target 203.0.113.10 — what runs, and what the firewall says'));
      var t = E('table', 'na-table'), th = E('tr'); ['Port', 'Service running?', 'Firewall rule'].forEach(function (h) { th.appendChild(E('th', null, h)); }); t.appendChild(th);
      SC.COMMON.forEach(function (p) {
        var tr = E('tr'), run1 = SC.SERVICES[p];
        tr.appendChild(E('td', null, p + ' ' + SC.PORT_NAMES[p])); tr.appendChild(E('td', run1 ? '' : P + '-off', run1 ? '● ' + run1 : '— nothing'));
        var td = E('td'), sel = NA.select([{ value: '', label: 'default (' + cfg.def + ')' }, { value: 'allow', label: 'allow' }, { value: 'deny', label: 'deny' }], cfg.rules[p] || '', function (v) { if (v) cfg.rules[p] = v; else delete cfg.rules[p]; reset(); });
        sel.setAttribute('aria-label', 'Firewall rule for port ' + p); td.appendChild(sel); tr.appendChild(td); t.appendChild(tr);
      });
      var sc = E('div', P + '-scroll'); sc.appendChild(t); ruleBox.appendChild(sc);
      if (cfg.target === 'range') ruleBox.appendChild(E('p', 'na-note', 'The same rules apply to the other ports of 1–1024: only the ports above have special rules, the rest follow the default policy.'));
    }
    function drawStage() {
      NA.clear(svgHost); nodes = {};
      var svg = S('svg', { viewBox: '0 0 460 190', 'class': P + '-svg', role: 'img', 'aria-label': 'The attacker sends probe packets to ports of the target server; a firewall in front of the server drops some of them; an IDS watches the traffic.' }, svgHost);
      var pos = { At: [58, 95], Fw: [225, 95], Sv: [392, 95] };
      S('line', { x1: pos.At[0], y1: 95, x2: pos.Sv[0], y2: 95, 'class': P + '-wire' }, svg);
      var root = S('g', null, svg);
      [['At', 'attacker', 'Attacker', '192.0.2.66', 100, 56], ['Fw', 'firewall', 'Firewall' + (cfg.idsOn ? ' + IDS' : ''), cfg.def === 'deny' ? 'default: deny' : 'default: allow', 96, 70], ['Sv', 'server', 'Server', '203.0.113.10', 100, 56]].forEach(function (d) {
        var g = S('g', { 'class': P + '-node ' + d[1], transform: 'translate(' + pos[d[0]][0] + ',' + pos[d[0]][1] + ')' }, root);
        boxNode(g, d[4], d[5], '', d[2], d[3]);
        nodes[d[0]] = { g: g, x: pos[d[0]][0], y: pos[d[0]][1], badge: S('text', { x: 0, y: d[5] / 2 + 14, 'text-anchor': 'middle', 'class': P + '-badge' }, g, '') };
      });
      nodes.clock = S('text', { x: 230, y: 20, 'text-anchor': 'middle', 'class': P + '-clock' }, svg, 't = 0 s');
      tokens = S('g', null, svg);
    }
    function renderMap(upTo) {
      NA.clear(mapBox);
      mapBox.appendChild(E('div', 'na-lab ' + P + '-cap', 'What the attacker learns (its map)'));
      var t = E('table', 'na-table'), th = E('tr'); ['Port', 'Reply', 'So the attacker thinks…'].forEach(function (h) { th.appendChild(E('th', null, h)); }); t.appendChild(th);
      var rows = res ? res.results.slice(0, upTo) : [], listed = 0, closed = 0, blocked = 0;
      var many = res && res.results.length > 40;
      rows.forEach(function (r) {
        if (r.verdict === 'closed') closed++;
        if (r.verdict === 'blocked') blocked++;
        if (many && (r.verdict === 'closed' || r.verdict === 'blocked')) return;
        if (listed >= 60) return; listed++;
        var tr = E('tr', P + '-v-' + r.verdict);
        tr.appendChild(E('td', null, r.port + (SC.PORT_NAMES[r.port] ? ' ' + SC.PORT_NAMES[r.port] : '')));
        tr.appendChild(E('td', null, r.verdict === 'open' ? '✔ SYN-ACK' : r.verdict === 'closed' ? '✘ RST' : r.verdict === 'filtered' ? '… silence' : '… blocked'));
        tr.appendChild(E('td', null, r.verdict === 'open' ? 'OPEN — ' + r.service : r.verdict === 'closed' ? 'closed (a host is there)' : r.verdict === 'filtered' ? 'filtered (a firewall?)' : 'no answer any more'));
        t.appendChild(tr);
      });
      if (!rows.length) { var tr0 = E('tr'); var td0 = E('td', P + '-off', 'nothing yet — press Scan'); td0.colSpan = 3; tr0.appendChild(td0); t.appendChild(tr0); }
      var sc2 = E('div', P + '-scroll'); sc2.appendChild(t); mapBox.appendChild(sc2);
      if (many && rows.length) mapBox.appendChild(E('p', 'na-note', 'Closed ports (' + closed + ') and blocked probes (' + blocked + ') are not listed.'));
    }
    function addLog(txt, cls) { var s = E('span', cls || '', txt); logPre.appendChild(s); logPre.appendChild(document.createTextNode('\n')); logPre.scrollTop = logPre.scrollHeight; shown++; if (shown > 80) { logPre.removeChild(logPre.firstChild); logPre.removeChild(logPre.firstChild); } }
    function resetLog() { NA.clear(logBox); logBox.appendChild(E('div', 'na-lab ' + P + '-cap', 'What the defender’s log shows')); logPre = E('pre', P + '-pre'); logBox.appendChild(logPre); shown = 0; addLog('(waiting for traffic)', 'empty'); }
    function paintTiles(upTo, final) {
      var rows = res ? res.results.slice(0, upTo) : [];
      var open = rows.filter(function (r) { return r.verdict === 'open'; }).length, filt = rows.filter(function (r) { return r.verdict === 'filtered'; }).length;
      tiles.p.set(String(rows.length), res ? 'of ' + res.results.length : '');
      tiles.o.set(String(open), open ? 'something is listening' : ''); tiles.f.set(String(filt), 'firewall dropped them');
      tiles.d.node.classList.remove('good', 'bad');
      var al = res && res.alarmAt && res.alarmAt.i < upTo;
      if (al) { tiles.d.set('RAISED', 'after ' + res.alarmAt.probes + ' probes, ' + fmtMs(res.alarmAt.tMs)); tiles.d.node.classList.add('good'); }
      else if (final && cfg.idsOn) { tiles.d.set('none', 'the scan stayed under the threshold'); tiles.d.node.classList.add('bad'); }
      else tiles.d.set(cfg.idsOn ? '—' : 'IDS off', '');
    }
    function reset() {
      run.cancel(); busy = false; res = null; bScan.disabled = false;
      drawStage(); renderRules(); renderMap(0); resetLog(); paintTiles(0, false);
      nar.say('The server runs SSH, HTTP, HTTPS, a database and a test web app. Press <b>Scan</b> to see what an attacker can learn by knocking on ' + (cfg.target === 'common' ? '13 well-known ports' : 'ports 1–1024') + '.');
    }
    function pdot(from, to, cls, label) {
      var g = S('g', { 'class': P + '-tok ' + (cls || '') }, tokens);
      S('circle', { r: 7, cx: 0, cy: 0 }, g); if (label) S('text', { x: 0, y: -11, 'text-anchor': 'middle' }, g, label);
      g.setAttribute('transform', 'translate(' + nodes[from].x + ',' + nodes[from].y + ')');
      return { g: g, move: function (gen, to2, ms) { var a = nodes[from], b = nodes[to2]; return run.tween(gen, ms, function (u) { var e = NA.ease(u); g.setAttribute('transform', 'translate(' + NA.lerp(a.x, b.x, e) + ',' + NA.lerp(a.y, b.y, e) + ')'); }); } };
    }
    async function animate(r, g) {
      var ms = NA.dur(240), d = pdot('At', 'Sv', 'probe', String(r.port));
      Object.keys(nodes).forEach(function (k) { if (nodes[k].g) { nodes[k].g.classList.remove('ok', 'bad', 'warn'); nodes[k].badge.textContent = ''; } });
      if (!(await d.move(g, 'Fw', ms))) { d.g.remove(); return false; }
      if (r.verdict === 'blocked') { nodes.Fw.g.classList.add('bad'); nodes.Fw.badge.textContent = 'attacker blocked'; d.g.classList.add('dead'); await run.sleep(g, NA.dur(250)); d.g.remove(); return run.alive(g); }
      if (r.verdict === 'filtered') { nodes.Fw.g.classList.add('warn'); nodes.Fw.badge.textContent = 'dropped — no reply'; d.g.classList.add('dead'); await run.sleep(g, NA.dur(250)); d.g.remove(); return run.alive(g); }
      if (!(await d.move(g, 'Sv', ms))) { d.g.remove(); return false; }
      d.g.remove();
      var back = pdot('Sv', 'At', r.verdict === 'open' ? 'open' : 'closed', r.verdict === 'open' ? 'SYN-ACK' : 'RST');
      nodes.Sv.g.classList.add(r.verdict === 'open' ? 'ok' : 'warn'); nodes.Sv.badge.textContent = r.verdict === 'open' ? 'port ' + r.port + ' open (' + r.service + ')' : 'port ' + r.port + ' closed';
      var ok = await back.move(g, 'At', Math.round(ms * 1.5)); back.g.remove(); return ok && run.alive(g);
    }
    async function scan() {
      if (busy) return; busy = true; bScan.disabled = true;
      var g = run.start();
      res = SC.run({ ports: ports(), services: SC.SERVICES, firewall: fwCfg(), ids: { on: cfg.idsOn, maxPorts: cfg.maxPorts, windowSec: cfg.windowSec }, rate: cfg.rate });
      renderMap(0); resetLog(); logPre.textContent = '';
      var total = res.results.length, animN = total <= 16 ? total : 6;
      for (var i = 0; i < total; i++) {
        var r = res.results[i];
        if (i < animN) { if (!(await animate(r, g))) { busy = false; return; } }
        else if (i % 16 === 0) { if (!(await run.sleep(g, NA.dur(12)))) { busy = false; return; } }
        if (nodes.clock) nodes.clock.textContent = 't = ' + fmtMs(r.tMs);
        var al = res.alarmAt && res.alarmAt.i === i;
        if (total <= 40 || r.verdict === 'open' || al || i < 12 || r.verdict === 'blocked' && i === res.alarmAt.i + 1)
          addLog('t=' + fmtMs(r.tMs).padEnd(6) + ' port ' + String(r.port).padEnd(5) + (r.verdict === 'blocked' ? ' attacker blocked: probe dropped' : r.action === 'deny' ? ' denied by firewall rule' : r.verdict === 'open' ? ' allowed → SYN-ACK from ' + r.service : ' allowed → RST (closed)'), r.verdict === 'open' ? 'warnl' : '');
        if (al) { addLog('*** ALARM at t=' + fmtMs(r.tMs) + ': ' + res.alarmAt.distinct + ' different ports probed within ' + cfg.windowSec + ' s — source 192.0.2.66 blocked ***', 'hot'); nodes.Fw.g.classList.add('bad'); nodes.Fw.badge.textContent = 'ALARM: blocking 192.0.2.66'; }
        if (i < animN || i % 16 === 0 || i === total - 1) { renderMap(i + 1); paintTiles(i + 1, false); }
      }
      renderMap(total); paintTiles(total, true); busy = false; bScan.disabled = false;
      var sm = res.summary, parts = [];
      parts.push('The scan found <b>' + sm.open.length + ' open port' + (sm.open.length === 1 ? '' : 's') + '</b>' + (sm.open.length ? ' (' + sm.open.join(', ') + ')' : '') + ', ' + sm.filtered + ' filtered' + (sm.blocked ? ', and ' + sm.blocked + ' probes were blocked after the alarm' : '') + '. An <b>open</b> port answered the first handshake packet with SYN-ACK (the scanner then drops the connection, so it never completes a handshake); <b>closed</b> answers RST; <b>filtered</b> stays silent.');
      if (res.alarmAt) parts.push('<span class="ok">The IDS noticed after ' + res.alarmAt.probes + ' probes (' + fmtMs(res.alarmAt.tMs) + ') and blocked the source.</span>');
      else if (cfg.idsOn) parts.push('<span class="bad">The IDS stayed silent: the scan never probed more than ' + cfg.maxPorts + ' different ports within ' + cfg.windowSec + ' s — a “low and slow” scan hides under the threshold.</span>');
      if (cfg.rules[3306] !== 'deny' && cfg.def !== 'deny' && sm.open.indexOf(3306) >= 0) parts.push('<span class="bad">The database port is open to the whole Internet — close it or deny it.</span>');
      if (cfg.def === 'deny' && sm.open.length) parts.push('<span class="ok">Default deny leaves only the ports you chose.</span>');
      parts.push('Stopped (or limited) by: a firewall with default deny, closing unused services, and an IDS. Administrators run the same scan against <em>their own</em> machines to see what an attacker would see.');
      nar.say(parts.join(' '));
    }
    reset();
  }
  NA.register('atk-scan', { title: 'Port scan vs firewall and IDS', hint: 'Simulation: an attacker knocks on the server’s ports. Set firewall rules and the IDS threshold, then see what it learns and whether anyone notices.', build: buildScan });
})();
