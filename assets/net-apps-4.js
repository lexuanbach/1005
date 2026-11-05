/* Chapter 9 concept apps — transport and secure web:  'tcp' (a connection with promises), 'udp' (send and hope), 'tls' (the HTTPS handshake).
   The engines (NetApps.engines.Tcp / .Udp / .Tls) are plain functions tested in Node; the UI below only runs in a browser.
   Everything is a simulation: invented names, RFC 5737 addresses, toy numbers (the Diffie–Hellman numbers and the "cipher" are NOT real cryptography).
   Nothing touches the network. */
(function (root) {
  'use strict';
  var NA = (typeof window !== 'undefined' && window.NetApps) || require('./net-apps-core.js');
  var hasDom = typeof document !== 'undefined';
  var E = NA.engines;

  /* =====================================================================================
     TCP — engine
     ===================================================================================== */

  /* ---- the life of one connection: open (3-way handshake), one request/response, close (4 segments) ----
     mode: 'normal' | 'refused' (nobody listens on the port → RST) | 'synlost' (the first SYN is lost, the client retransmits it).
     Every step = one segment on the wire. sendState = new state of the SENDER when it sends, recvState = new state of the RECEIVER on arrival. */
  var C_ISN = 1000, S_ISN = 5000;
  function handshakeSteps(cfg) {
    cfg = cfg || {};
    var mode = cfg.mode || 'normal';
    var cReq = cfg.request || 'GET /', sRes = cfg.response || '200 OK';
    var steps = [];
    function add(o) { o.n = steps.length + 1; steps.push(o); return o; }
    add({ from: 'client', flags: ['SYN'], seq: C_ISN, ack: null, len: 0, phase: 'open', lost: mode === 'synlost',
      sendState: 'SYN-SENT', recvState: 'SYN-RECEIVED',
      say: mode === 'synlost'
        ? '<b>① SYN</b> — the client says “I want to talk; my numbering starts at <b>1000</b>”. This one is <span class="bad">lost</span> on the way: nobody answers.'
        : '<b>① SYN</b> — the client says “I want to talk, and my first byte will be numbered <b>1000</b>”. (A SYN uses up one sequence number.) The server was waiting in state LISTEN.' });
    if (mode === 'synlost') {
      add({ from: 'client', flags: ['SYN'], seq: C_ISN, ack: null, len: 0, phase: 'open', retransmit: true, waitMs: 1000,
        sendState: 'SYN-SENT', recvState: 'SYN-RECEIVED',
        say: '<b>⏱ timeout, then SYN again</b> — the client waited (about a second in real TCP, RFC 6298), heard nothing, and re-sent the <em>same</em> SYN with the same number 1000. TCP hides the loss from the program: it only becomes a little slower.' });
    }
    if (mode === 'refused') {
      add({ from: 'server', flags: ['RST', 'ACK'], seq: 0, ack: C_ISN + 1, len: 0, phase: 'open',
        sendState: 'CLOSED', recvState: 'CLOSED', refused: true,
        say: '<b>RST</b> — nothing is listening on that port, so the server’s operating system answers “reset”: <b>connection refused</b>. The client learns it immediately instead of waiting. No connection exists, so nothing more happens.' });
      return steps;
    }
    add({ from: 'server', flags: ['SYN', 'ACK'], seq: S_ISN, ack: C_ISN + 1, len: 0, phase: 'open',
      sendState: 'SYN-RECEIVED', recvState: 'ESTABLISHED',
      say: '<b>② SYN-ACK</b> — the server agrees: “I got your SYN, <b>ack = 1001</b> means <em>next I expect byte 1001</em>; and my own numbering starts at <b>5000</b>”. The client now knows the server can hear it AND answer.' });
    add({ from: 'client', flags: ['ACK'], seq: C_ISN + 1, ack: S_ISN + 1, len: 0, phase: 'open',
      sendState: 'ESTABLISHED', recvState: 'ESTABLISHED',
      say: '<b>③ ACK</b> — the client confirms “got your SYN, next I expect byte <b>5001</b>”. Now the <em>server</em> knows the client can hear it too. Both directions are proven and both numbering schemes are agreed: <b>ESTABLISHED</b>. That is why a handshake needs three segments.' });
    var cseq = C_ISN + 1, sseq = S_ISN + 1;
    add({ from: 'client', flags: ['PSH', 'ACK'], seq: cseq, ack: sseq, len: cReq.length, payload: cReq, phase: 'data',
      sendState: 'ESTABLISHED', recvState: 'ESTABLISHED',
      say: '<b>Data →</b> the client sends “' + NA.esc(cReq) + '” (<b>' + cReq.length + ' bytes</b>, numbered 1001–' + (cseq + cReq.length - 1) + '). The next byte it will send is therefore <b>' + (cseq + cReq.length) + '</b>.' });
    cseq += cReq.length;
    add({ from: 'server', flags: ['PSH', 'ACK'], seq: sseq, ack: cseq, len: sRes.length, payload: sRes, phase: 'data',
      sendState: 'ESTABLISHED', recvState: 'ESTABLISHED',
      say: '<b>← Data</b> — the server answers “' + NA.esc(sRes) + '” (<b>' + sRes.length + ' bytes</b>) and, in the same segment, acknowledges the request: <b>ack = ' + cseq + '</b> = “I have everything up to byte ' + (cseq - 1) + '”. An ACK rides along for free.' });
    sseq += sRes.length;
    add({ from: 'client', flags: ['ACK'], seq: cseq, ack: sseq, len: 0, phase: 'data',
      sendState: 'ESTABLISHED', recvState: 'ESTABLISHED',
      say: '<b>ACK</b> — the client acknowledges the answer: <b>ack = ' + sseq + '</b>. Every byte so far has been confirmed.' });
    add({ from: 'client', flags: ['FIN', 'ACK'], seq: cseq, ack: sseq, len: 0, phase: 'close',
      sendState: 'FIN-WAIT-1', recvState: 'CLOSE-WAIT',
      say: '<b>FIN</b> — the client has nothing more to send: “I am finished <em>sending</em>”. A FIN also uses up one sequence number (' + cseq + '). The connection is half-closed: the server may still send.' });
    add({ from: 'server', flags: ['ACK'], seq: sseq, ack: cseq + 1, len: 0, phase: 'close',
      sendState: 'CLOSE-WAIT', recvState: 'FIN-WAIT-2',
      say: '<b>ACK</b> — the server confirms the FIN (<b>ack = ' + (cseq + 1) + '</b>). It may still have data to send before it closes its own side.' });
    add({ from: 'server', flags: ['FIN', 'ACK'], seq: sseq, ack: cseq + 1, len: 0, phase: 'close',
      sendState: 'LAST-ACK', recvState: 'TIME-WAIT',
      say: '<b>FIN</b> — the server is finished too: “I am finished sending”.' });
    add({ from: 'client', flags: ['ACK'], seq: cseq + 1, ack: sseq + 1, len: 0, phase: 'close',
      sendState: 'TIME-WAIT', recvState: 'CLOSED',
      say: '<b>ACK</b> — the last acknowledgement (<b>ack = ' + (sseq + 1) + '</b>). The server closes at once. The client waits in <b>TIME-WAIT</b> for about two minutes (twice the maximum segment lifetime) in case this last ACK was lost and the server repeats its FIN, then it is CLOSED too.' });
    return steps;
  }
  /* independent arithmetic check of a step list: returns a list of problems (empty = every number is consistent) */
  function checkSteps(steps) {
    var errs = [], next = { client: null, server: null };
    steps.forEach(function (s) {
      if (s.lost) return;
      var me = s.from, other = me === 'client' ? 'server' : 'client';
      if (s.flags.indexOf('ACK') >= 0 && !s.refused) { if (next[me] !== s.ack) errs.push('step ' + s.n + ': ack ' + s.ack + ' but ' + me + ' expects ' + next[me]); }
      if (s.refused && s.ack !== next[me] && next[me] !== null) errs.push('step ' + s.n + ': RST ack');
      if (s.flags.indexOf('SYN') >= 0) next[other] = s.seq + 1;
      else if (s.flags.indexOf('FIN') >= 0) { if (next[other] !== s.seq) errs.push('step ' + s.n + ': FIN seq ' + s.seq + ' expected ' + next[other]); next[other] = s.seq + 1; }
      else if (s.len > 0) { if (next[other] !== s.seq) errs.push('step ' + s.n + ': data seq ' + s.seq + ' expected ' + next[other]); next[other] = s.seq + s.len; }
    });
    return errs;
  }

  /* ---- reliable delivery of a byte stream over a lossy link (a teaching model of TCP) ----
     Sequence numbers are RELATIVE byte offsets (the first byte of the message is 0). Time is in ticks; the sender puts at most one segment on the
     wire per tick; one-way delay = `delay` ticks. The receiver sends a cumulative ACK (= the next byte it expects) for every segment that arrives,
     buffers segments that arrive early, and hands bytes to the program strictly in order. The sender keeps at most `window` segments in flight,
     re-sends the oldest unacknowledged segment on a timeout (RTO = 2·delay + 2 ticks after the last progress) or after 3 duplicate ACKs (fast retransmit).
     No congestion control, no delayed ACKs, no timer back-off: those are real TCP, left out on purpose. Loss comes from NA.dice(seed, …): the same
     bad luck every run.  */
  function cleanText(t) { return String(t == null ? '' : t).replace(/[^\x20-\x7e]/g, '?'); }
  function tcpTransfer(cfg) {
    cfg = cfg || {};
    var text = cfg.bytes ? null : cleanText(cfg.text != null ? cfg.text : 'The quick brown fox jumps over the lazy dog, byte by byte.');
    var total = cfg.bytes ? cfg.bytes.length : text.length;
    var mss = Math.max(1, cfg.mss | 0 || 8), loss = cfg.loss || 0, D = Math.max(1, cfg.delay | 0 || 2), W = Math.max(1, cfg.window | 0 || 4), seed = cfg.seed == null ? 7 : cfg.seed;
    var RTO = 2 * D + 2, CAP = cfg.cap || 4000;
    var segs = [];
    for (var o = 0; o < total; o += mss) segs.push({ seq: o, len: Math.min(mss, total - o) });
    var nseg = segs.length;
    var events = [], timeouts = [], fast = [];
    var receivedAt = new Array(total), deliveredAt = new Array(total);
    for (var q = 0; q < total; q++) { receivedAt[q] = null; deliveredAt[q] = null; }
    if (nseg === 0) return { text: text, total: 0, segs: segs, events: events, timeouts: timeouts, fast: [], fastRetransmits: 0, retransmissions: 0, receivedAt: receivedAt, deliveredAt: deliveredAt, doneAt: 0, allDeliveredAt: 0, capped: false, mss: mss, delay: D, window: W, rto: RTO };
    /* sender state */
    var una = 0, nxt = 0, attempts = new Array(nseg), lastSend = new Array(nseg), dup = 0, timerStart = 0, fastDone = -1, fastPending = false;
    for (var i = 0; i < nseg; i++) { attempts[i] = 0; lastSend[i] = -1; }
    var rcvNext = 0, have = new Array(nseg); for (i = 0; i < nseg; i++) have[i] = false;
    var ackCount = {};                      // how many times each ACK value has been sent (so every copy gets its own dice)
    var inflight = [];                       // events not yet arrived
    var doneAt = null, allDeliveredAt = null, t = 0, capped = false;
    function segIndexAt(byteOff) { return Math.floor(byteOff / mss); }
    function send(idx, why) {
      attempts[idx]++;
      var ev = { kind: 'data', seq: segs[idx].seq, len: segs[idx].len, idx: idx, sentAt: t, arriveAt: t + D, attempt: attempts[idx], why: why || null,
        lost: NA.dice(seed, 1, idx, attempts[idx]) < loss };
      lastSend[idx] = t; events.push(ev); if (!ev.lost) inflight.push(ev);
      return ev;
    }
    while (t <= CAP) {
      /* 1. arrivals at tick t */
      var arr = inflight.filter(function (e) { return e.arriveAt === t; });
      inflight = inflight.filter(function (e) { return e.arriveAt !== t; });
      arr.forEach(function (e) {
        if (e.kind === 'data') {
          if (receivedAt[segs[e.idx].seq] === null) for (var b = 0; b < e.len; b++) receivedAt[e.seq + b] = t;
          have[e.idx] = true;
          var before = rcvNext;
          while (rcvNext < total && have[segIndexAt(rcvNext)]) {
            var s2 = segs[segIndexAt(rcvNext)];
            for (var b2 = 0; b2 < s2.len; b2++) { if (deliveredAt[s2.seq + b2] === null) deliveredAt[s2.seq + b2] = t; }
            rcvNext = s2.seq + s2.len;
          }
          if (rcvNext >= total && allDeliveredAt === null) allDeliveredAt = t;
          var k = rcvNext; ackCount[k] = (ackCount[k] || 0) + 1;
          var ack = { kind: 'ack', ack: rcvNext, sentAt: t, arriveAt: t + D, dupOf: rcvNext === before, lost: NA.dice(seed, 2, rcvNext, ackCount[k]) < loss };
          events.push(ack); if (!ack.lost) inflight.push(ack);
        } else {                              // an ACK reaching the sender
          var ackIdx = e.ack >= total ? nseg : Math.floor(e.ack / mss);      // acknowledgements always land on a segment start
          if (ackIdx > una) { una = ackIdx; dup = 0; timerStart = t; fastDone = -1; }
          else if (ackIdx === una && una < nxt) {
            dup++;
            if (dup === 3 && fastDone !== una) { fastDone = una; fast.push({ at: t, seq: segs[una].seq }); fastPending = true; }
          }
          if (una >= nseg && doneAt === null) doneAt = t;
        }
      });
      if (doneAt !== null) break;
      /* 2. the sender acts: fast retransmit > timeout > new segment */
      var sentNow = false;
      if (fastPending && una < nseg) { send(una, 'fast'); timerStart = t; fastPending = false; sentNow = true; }
      else if (una < nxt && t - timerStart >= RTO) { timeouts.push({ at: t, seq: segs[una].seq }); send(una, 'timeout'); timerStart = t; sentNow = true; dup = 0; }
      if (!sentNow && nxt < nseg && nxt < una + W) { if (una === nxt) timerStart = t; send(nxt, null); nxt++; sentNow = true; }
      t++;
    }
    if (doneAt === null) { capped = true; doneAt = CAP; }
    var rtx = events.filter(function (e) { return e.kind === 'data' && e.attempt > 1; }).length;
    return { text: text, total: total, segs: segs, events: events, timeouts: timeouts, fast: fast, fastRetransmits: fast.length, retransmissions: rtx,
      receivedAt: receivedAt, deliveredAt: deliveredAt, doneAt: doneAt, allDeliveredAt: allDeliveredAt === null ? doneAt : allDeliveredAt, capped: capped,
      mss: mss, delay: D, window: W, rto: RTO, dataSent: events.filter(function (e) { return e.kind === 'data'; }).length };
  }
  E.Tcp = { handshakeSteps: handshakeSteps, checkSteps: checkSteps, transfer: tcpTransfer, cleanText: cleanText, C_ISN: C_ISN, S_ISN: S_ISN };

  /* =====================================================================================
     UDP — engine: n packets sent every `intervalMs`; the receiver needs packet i by i·interval + deadlineMs.
     UDP: a lost packet is gone; a late packet is useless; nothing else is affected.
     TCP: a lost packet is re-sent (fast retransmit after the 3rd later packet is noticed, then timeouts) and everything behind it WAITS until it arrives
          (head-of-line blocking) — nothing is missing, but late.
     ===================================================================================== */
  function udpSim(cfg) {
    cfg = cfg || {};
    var mode = cfg.mode === 'tcp' ? 'tcp' : 'udp', n = cfg.n || 30, loss = cfg.loss || 0, jitter = cfg.jitter || 0, rtt = cfg.rtt == null ? 80 : cfg.rtt;
    var seed = cfg.seed == null ? 11 : cfg.seed, interval = cfg.intervalMs || 40, deadline = cfg.deadlineMs == null ? 150 : cfg.deadlineMs;
    var owd = Math.round(rtt / 2), pk = [], i;
    function jit(idx, att) { return Math.round(NA.dice(seed, 5, idx, att) * jitter); }
    function lostAt(idx, att) { return NA.dice(seed, 7, idx, att) < loss; }
    for (i = 0; i < n; i++) {
      var sent = i * interval, p = { i: i, sentAt: sent, due: sent + deadline, attempts: 1, lost: false, arrival: null, deliver: null };
      if (mode === 'udp') {
        if (lostAt(i, 1)) { p.lost = true; }
        else { p.arrival = sent + owd + jit(i, 1); p.deliver = p.arrival; }
      } else {
        var at = 1, depart = sent, arrival = null;
        while (at <= 8) {
          if (!lostAt(i, at)) { arrival = depart + owd + jit(i, at); break; }
          // loss noticed: 1st time by 3 later packets (3·interval after sending) + a round trip; later times by timeout (rtt·2 + 200 ms, no back-off)
          var noticed = at === 1 ? depart + 3 * interval + rtt : depart + 2 * rtt + 200;
          depart = noticed; at++;
        }
        p.attempts = Math.min(at, 8); p.arrival = arrival; p.rawArrival = arrival;
        if (arrival === null) p.lost = true;
      }
      pk.push(p);
    }
    if (mode === 'tcp') {                       // in-order delivery to the program
      var prev = 0;
      pk.forEach(function (p) { if (p.arrival === null) return; p.deliver = Math.max(p.arrival, prev); prev = p.deliver; });
    }
    var onTime = 0, missing = 0, late = 0, run = 0, longest = 0, lastDeliver = 0, retx = 0;
    pk.forEach(function (p) {
      var st;
      if (p.deliver === null) { st = 'missing'; missing++; }
      else if (p.deliver <= p.due) { st = 'ok'; onTime++; }
      else { st = 'late'; late++; }
      p.status = st; p.lateBy = p.deliver === null ? null : Math.max(0, p.deliver - p.due);
      if (p.deliver !== null && p.deliver > lastDeliver) lastDeliver = p.deliver;
      if (st === 'ok') run = 0; else { run++; if (run > longest) longest = run; }
      retx += p.attempts - 1;
    });
    var dataPkts = n + retx, ackPkts = mode === 'tcp' ? n : 0;
    return { mode: mode, packets: pk, onTime: onTime, missing: missing, late: late, longestFreezeMs: longest * interval, longestRun: longest, retransmissions: retx,
      packetsOnWire: dataPkts + ackPkts, headerBytes: mode === 'tcp' ? (dataPkts + ackPkts) * 20 : dataPkts * 8, finishMs: Math.round(lastDeliver), interval: interval, deadline: deadline, owd: owd };
  }
  /* a DNS question with each transport (the packets of one lookup) */
  function dnsCount(rttMs) {
    rttMs = rttMs == null ? 80 : rttMs;
    return {
      udp: { packets: 2, answerMs: rttMs, list: ['query →', '← answer'] },
      tcp: { packets: 9, answerMs: 2 * rttMs, list: ['SYN →', '← SYN-ACK', 'ACK →', 'query →', '← answer', 'FIN →', '← ACK', '← FIN', 'ACK →'] }
    };
  }
  E.Udp = { sim: udpSim, dnsCount: dnsCount };

  /* =====================================================================================
     TLS — engine (toy numbers: this is the SHAPE of HTTPS, not real cryptography)
     ===================================================================================== */
  var TRUST = ['Example Root CA', 'Sample Root CA 2'];            // the browser's (invented) trust store
  var TODAY = '2026-10-18';
  var CERTS = {
    valid:   { subject: 'www.example.com', names: ['www.example.com', 'example.com'], issuer: 'Example Intermediate CA 1', chain: ['Example Intermediate CA 1', 'Example Root CA'], notBefore: '2026-01-10', notAfter: '2027-01-10', serial: '04:7A:B1', key: 'RSA 2048 · 3F:9A…C2' },
    expired: { subject: 'www.example.com', names: ['www.example.com'], issuer: 'Example Intermediate CA 1', chain: ['Example Intermediate CA 1', 'Example Root CA'], notBefore: '2025-08-01', notAfter: '2026-09-30', serial: '02:11:5E', key: 'RSA 2048 · 71:0D…8B' },
    wrongname: { subject: 'other.example', names: ['other.example', 'www.other.example'], issuer: 'Example Intermediate CA 1', chain: ['Example Intermediate CA 1', 'Example Root CA'], notBefore: '2026-03-02', notAfter: '2027-03-02', serial: '05:C3:19', key: 'RSA 2048 · A8:44…07' },
    selfsigned: { subject: 'www.example.com', names: ['www.example.com'], issuer: 'www.example.com', chain: [], selfSigned: true, notBefore: '2026-06-01', notAfter: '2036-06-01', serial: '01', key: 'RSA 2048 · 5C:E2…19' },
    mitm:    { subject: 'www.example.com', names: ['www.example.com'], issuer: 'Shady Free CA', chain: ['Shady Free CA'], notBefore: '2026-10-17', notAfter: '2026-11-17', serial: '9F:00:AA', key: 'RSA 2048 · D0:0D…FE (the ATTACKER’s key)' }
  };
  function dateOk(c, now) { return now >= c.notBefore && now <= c.notAfter; }
  function nameMatches(pattern, host) {
    pattern = String(pattern).toLowerCase(); host = String(host).toLowerCase();
    if (pattern === host) return true;
    if (pattern.indexOf('*.') === 0) { var rest = pattern.slice(2), dot = host.indexOf('.'); return dot > 0 && host.slice(dot + 1) === rest && host.slice(0, dot).indexOf('.') < 0; }
    return false;
  }
  function verifyCert(o) {
    var host = o.host, c = o.cert, now = o.now || TODAY, trusted = o.trusted || TRUST;
    var names = (c.names && c.names.length ? c.names : [c.subject]);
    var nameOk = names.some(function (p) { return nameMatches(p, host); });
    var dateGood = dateOk(c, now);
    var root = c.chain && c.chain.length ? c.chain[c.chain.length - 1] : null;
    var chainOk = !c.selfSigned && !!root && trusted.indexOf(root) >= 0;
    var reasons = [];
    if (!nameOk) reasons.push('name');
    if (!dateGood) reasons.push(now < c.notBefore ? 'not-yet-valid' : 'expired');
    if (!chainOk) reasons.push(c.selfSigned ? 'self-signed' : 'untrusted');
    return {
      ok: reasons.length === 0, reasons: reasons,
      checks: [
        { id: 'name', ok: nameOk, text: nameOk ? 'The certificate is for “' + host + '”.' : 'The certificate is for “' + c.subject + '”, but you asked for “' + host + '”.' },
        { id: 'dates', ok: dateGood, text: dateGood ? 'Valid today (' + c.notBefore + ' → ' + c.notAfter + ').' : (now < c.notBefore ? 'Not valid yet: starts ' + c.notBefore + '.' : 'Expired on ' + c.notAfter + ' (today is ' + now + ').') },
        { id: 'chain', ok: chainOk, text: chainOk ? 'Signed by “' + c.issuer + '”, whose chain ends at “' + root + '”, a root already in the browser’s trust store.'
          : (c.selfSigned ? 'Signed by itself (“' + c.issuer + '”): anybody can make such a certificate, no trusted authority vouches for it.'
            : 'Signed by “' + c.issuer + '”, whose chain ends at “' + root + '”, which is NOT in the browser’s trust store.') }
      ]
    };
  }
  /* exact for moduli below about 9·10^7 (products stay under 2^53) — the lab only uses toy primes such as 23 */
  function modpow(b, e, m) { var r = 1; b = b % m; while (e > 0) { if (e & 1) r = (r * b) % m; b = (b * b) % m; e >>= 1; } return r; }
  function dh(p, g, a, b) {
    var A = modpow(g, a, p), B = modpow(g, b, p), sA = modpow(B, a, p), sB = modpow(A, b, p);
    return { p: p, g: g, a: a, b: b, A: A, B: B, sharedA: sA, sharedB: sB, equal: sA === sB };
  }
  /* toy "cipher": XOR with a key-derived byte stream, shown as hex. Reversible with the key, noise without it. NOT secure. */
  function keystream(key) {
    var s = (Math.imul((key | 0) + 977, 2654435761) + 12345) >>> 0;
    return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s >>> 24) & 255; };
  }
  function scramble(text, key) {
    var ks = keystream(key), out = [];
    String(text).split('').forEach(function (ch) { var v = (ch.charCodeAt(0) & 255) ^ ks(); out.push((v < 16 ? '0' : '') + v.toString(16)); });
    return out.join(' ');
  }
  function unscramble(hex, key) {
    var ks = keystream(key), out = '';
    String(hex).trim().split(/\s+/).forEach(function (h) { if (h) out += String.fromCharCode(parseInt(h, 16) ^ ks()); });
    return out;
  }
  E.Tls = { TRUST: TRUST, TODAY: TODAY, CERTS: CERTS, verifyCert: verifyCert, nameMatches: nameMatches, dh: dh, modpow: modpow, scramble: scramble, unscramble: unscramble };

  /* =====================================================================================
     UI (browser only)
     ===================================================================================== */
  if (hasDom) {
    var el = NA.el, svg = NA.svg;
    function tryLine(markup) { return NA.html('p', 'na-try', '<b>Try this:</b> ' + markup); }
    function arrowHead(parent, x, y, dx, dy, cls) {
      var len = Math.sqrt(dx * dx + dy * dy) || 1, ux = dx / len, uy = dy / len, px = -uy, py = ux, s = 7;
      svg('polygon', { points: x + ',' + y + ' ' + (x - ux * s * 1.5 + px * s * 0.6) + ',' + (y - uy * s * 1.5 + py * s * 0.6) + ' ' + (x - ux * s * 1.5 - px * s * 0.6) + ',' + (y - uy * s * 1.5 - py * s * 0.6), class: cls }, parent);
    }
    function stateKind(s) { return s === 'CLOSED' || s === 'LISTEN' ? 'idle' : (s === 'SYN-SENT' || s === 'SYN-RECEIVED') ? 'open' : s === 'ESTABLISHED' ? 'est' : 'close'; }

    /* ---------------------------------------------------------------- TCP ---------------------------------------------------------------- */
    function buildTcp(host) {
      NA.tabs(host, [{ label: 'Open & close', build: tcpOpen }, { label: 'Reliable delivery', build: tcpData }]);
    }

    /* (1) the life of one connection */
    function tcpOpen(p) {
      var st = { mode: 'normal', done: 0, frac: 1, playing: false }, steps = E.Tcp.handshakeSteps({ mode: 'normal' }), run = NA.runner();
      p.appendChild(tryLine('press <b>Step</b> and watch the two state labels change at the edge of the picture; then pick <b>SYN lost</b> or <b>Port closed</b> to see how TCP reacts.'));
      var seg = NA.segmented([{ value: 'normal', label: 'Normal' }, { value: 'synlost', label: 'SYN lost' }, { value: 'refused', label: 'Port closed' }], 'normal', function (v) { st.mode = v; reset(); }, 'Scenario');
      var sf = el('div', 'na-field'); sf.appendChild(el('span', 'na-lab', 'Scenario')); sf.appendChild(seg.wrap);
      var stepB = NA.button('Step ▸', 'primary', function () { stepOnce(); }), playB = NA.button('▶ Play', '', function () { toggle(); }), resetB = NA.button('⟲ Reset', '', function () { reset(); });
      var ctr = el('div', 'na-controls'); [sf, stepB, playB, resetB, NA.speedControl()].forEach(function (c) { ctr.appendChild(c); });
      var stage = el('div', 'na-stage na-tcp-scroll'), say = NA.narrator();
      var key = el('div', 'na-key');
      [['--cmp-1', 'segment sent by the client'], ['--cmp-2', 'segment sent by the server'], ['--red', 'lost segment or RST']].forEach(function (c) { var sp = el('span'), i = el('i'); i.style.setProperty('--c', 'var(' + c[0] + ')'); sp.appendChild(i); sp.appendChild(document.createTextNode(c[1])); key.appendChild(sp); });
      var note = el('p', 'na-note', 'Simulation with invented addresses (documentation range 192.0.2.0/24, 203.0.113.0/24). Sequence numbers are small round numbers; a real client picks a random start. “seq” = number of the first byte in the segment, “ack” = the next byte the sender of the ACK expects.');
      [ctr, stage, key, say.node, note].forEach(function (c) { p.appendChild(c); });

      function init() { return { client: 'CLOSED', server: st.mode === 'refused' ? 'CLOSED' : 'LISTEN' }; }
      function rowGeom() { var ys = [], y = 96; steps.forEach(function (s) { if (s.waitMs) y += 22; ys.push(y); y += 42; }); return { ys: ys, H: y + 20 }; }
      function reset() {
        run.cancel(); st.playing = false; st.done = 0; st.frac = 1; steps = E.Tcp.handshakeSteps({ mode: st.mode }); paintBtns(); render();
        say.say(st.mode === 'refused' ? 'Nobody has opened this port on the server: its state is <b>CLOSED</b>. Press <b>Step</b> to knock anyway.' : st.mode === 'synlost' ? 'The server waits in state <b>LISTEN</b>. This time the first SYN will be lost. Press <b>Step</b>.' : 'Before anything is sent the server is in state <b>LISTEN</b> (a program has opened port 80 and waits) and the client is <b>CLOSED</b>. Press <b>Step</b> to send the first segment.');
      }
      function paintBtns() { playB.textContent = st.playing ? '❚❚ Pause' : '▶ Play'; stepB.disabled = st.done >= steps.length && st.frac >= 1; }
      async function doStep(g) {
        st.done++; st.frac = 0; paintBtns(); narrate(); render();
        var ok = await run.tween(g, NA.dur(800), function (t) { st.frac = NA.ease(t); render(); });
        if (ok) { st.frac = 1; render(); paintBtns(); }
        return ok;
      }
      function stepOnce() {
        if (st.done >= steps.length && st.frac >= 1) return;
        st.playing = false; var g = run.start(); if (st.done >= steps.length) return; doStep(g);
      }
      function toggle() {
        if (st.playing) { run.cancel(); st.playing = false; paintBtns(); return; }
        if (st.done >= steps.length) reset();
        st.playing = true; var g = run.start(); paintBtns();
        (async function () {
          while (st.done < steps.length) {
            if (!(await doStep(g))) return;
            if (!(await run.sleep(g, NA.dur(600)))) return;
          }
          st.playing = false; paintBtns();
        })();
      }
      function narrate() {
        var s = steps[st.done - 1]; if (!s) return;
        var fin = st.done >= steps.length;
        say.say(s.say + (fin ? (st.mode === 'refused' ? '' : ' <br><b>That is the whole life of a TCP connection: 3 segments to open, 4 to close</b> (plus the data in between). UDP, next, needs none of this.') : ''));
      }
      function render() {
        var G = rowGeom(), W = 640, xc = 150, xs = 490, H = G.H;
        NA.clear(stage);
        var s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Sequence diagram of a TCP connection between a client and a server, step ' + st.done + ' of ' + steps.length + '.' }, stage);
        s.style.minWidth = '560px';
        [[xc, 'Client', '192.0.2.100 · port 50123'], [xs, 'Server', '203.0.113.10 · port 80']].forEach(function (h) {
          svg('rect', { x: h[0] - 78, y: 6, width: 156, height: 40, rx: 8, class: 'na-tcp-host' }, s);
          svg('text', { x: h[0], y: 24, 'text-anchor': 'middle', class: 'na-tcp-hname' }, s, h[1]);
          svg('text', { x: h[0], y: 39, 'text-anchor': 'middle', class: 'na-tcp-hsub' }, s, h[2]);
          svg('line', { x1: h[0], y1: 48, x2: h[0], y2: H - 8, class: 'na-tcp-life' }, s);
        });
        // states: history pills along the lifelines + the current state under the host box
        var cur = init(), last = { client: null, server: null };
        function pill(side, y, state) {
          if (last[side] === state) return; last[side] = state;
          var x = side === 'client' ? xc - 10 : xs + 10, w = state.length * 6.6 + 14, k = stateKind(state);
          var g = svg('g', { class: 'na-tcp-pill k-' + k }, s);
          svg('rect', { x: side === 'client' ? x - w : x, y: y - 9, width: w, height: 17, rx: 8 }, g);
          svg('text', { x: side === 'client' ? x - w / 2 : x + w / 2, y: y + 3.5, 'text-anchor': 'middle' }, g, state);
        }
        pill('client', 76, cur.client); pill('server', 76, cur.server);
        steps.forEach(function (stp, i) {
          if (i >= st.done) return;
          var y0 = G.ys[i], y1 = y0 + 26, frac = i === st.done - 1 ? st.frac : 1, fromC = stp.from === 'client';
          var fx = fromC ? xc : xs, tx = fromC ? xs : xc, lim = stp.lost ? 0.55 : 1, f = Math.min(frac, lim);
          var ex = fx + (tx - fx) * f, ey = y0 + (y1 - y0) * f;
          if (stp.waitMs) { svg('text', { x: xc + 14, y: y0 - 12, 'text-anchor': 'start', class: 'na-tcp-wait' }, s, '⏱ the client waits ≈ 1 s and hears nothing…'); }
          var cls = 'na-tcp-a ' + (stp.refused ? 'rst' : fromC ? 'c' : 's') + (stp.lost ? ' lost' : '');
          svg('line', { x1: fx, y1: y0, x2: ex, y2: ey, class: cls }, s);
          if (frac >= 1 && !stp.lost) arrowHead(s, ex, ey, tx - fx, y1 - y0, 'na-tcp-ah ' + (stp.refused ? 'rst' : fromC ? 'c' : 's'));
          else if (frac < 1) svg('circle', { cx: ex, cy: ey, r: 4, class: 'na-tcp-tok ' + (stp.refused ? 'rst' : fromC ? 'c' : 's') }, s);
          if (stp.lost && frac >= lim) svg('text', { x: ex, y: ey + 6, 'text-anchor': 'middle', class: 'na-tcp-x' }, s, '✗');
          var lbl = stp.flags.join('+') + ' · seq ' + stp.seq + (stp.ack != null ? ' · ack ' + stp.ack : '') + (stp.payload ? ' · “' + stp.payload + '” ' + stp.len + ' B' : '') + (stp.retransmit ? ' · again' : '');
          svg('text', { x: (xc + xs) / 2, y: (y0 + y1) / 2 - 6, 'text-anchor': 'middle', class: 'na-tcp-lbl' }, s, lbl);
          svg('text', { x: fromC ? xc + 8 : xs - 8, y: y0 - 4, 'text-anchor': fromC ? 'start' : 'end', class: 'na-tcp-num' }, s, String(stp.n));
          pill(stp.from, y0 + 2, stp.sendState);
          cur[stp.from] = stp.sendState;
          if (frac >= 1 && !stp.lost) { var o = fromC ? 'server' : 'client'; pill(o, y1 + 2, stp.recvState); cur[o] = stp.recvState; }
        });
        // the "now" strip
        [['client', xc], ['server', xs]].forEach(function (c) {
          var k = stateKind(cur[c[0]]), g = svg('g', { class: 'na-tcp-now k-' + k }, s);
          svg('rect', { x: c[1] - 52, y: 51, width: 104, height: 18, rx: 9 }, g);
          svg('text', { x: c[1], y: 64, 'text-anchor': 'middle' }, g, cur[c[0]]);
        });
      }
      reset();
    }

    /* (2) reliable delivery of a message */
    function tcpData(p) {
      var DEF = 'The quick brown fox jumps over the lazy dog, byte by byte.';
      var st = { text: DEF, mss: 8, loss: 0.15, delay: 2, seed: 4, cursor: 0, playing: false };
      var run = NA.runner(), res;
      p.appendChild(tryLine('press <b>Play</b> on a clean line, then choose <b>Fast retransmit</b>: one segment is lost, the receiver keeps asking for it (<em>duplicate ACKs</em>), and the amber letters wait until the gap is filled.'));
      var txt = el('input'); txt.type = 'text'; txt.value = DEF; txt.maxLength = 80; txt.spellcheck = false; txt.setAttribute('aria-label', 'Message to send');
      txt.addEventListener('input', function () { st.text = txt.value || ' '; recompute(); });
      var mss = NA.slider('Bytes per segment (MSS)', 5, 20, 1, 8, function (v) { return v + ' B'; }, function (v) { st.mss = v; recompute(); });
      var loss = NA.slider('Loss', 0, 40, 5, 15, function (v) { return v + '%'; }, function (v) { st.loss = v / 100; recompute(); });
      var dly = NA.slider('One-way delay', 1, 4, 1, 2, function (v) { return v + ' tick' + (v > 1 ? 's' : ''); }, function (v) { st.delay = v; recompute(); });
      var dice = NA.button('🎲 New dice', '', function () { st.seed = (st.seed * 7 + 3) % 997; recompute(); }, 'Roll a different pattern of lost segments');
      var ctr = el('div', 'na-controls'); ctr.appendChild(NA.field('Message (up to 80 characters)', txt, 'grow')); [mss.wrap, loss.wrap, dly.wrap, dice].forEach(function (c) { ctr.appendChild(c); });
      var chips = el('div', 'na-chips'); chips.appendChild(el('span', 'na-lab', 'Scenarios'));
      function findSeed(pred) { for (var s = 0; s < 400; s++) { var r = E.Tcp.transfer({ text: st.text, mss: st.mss, loss: 0.15, delay: st.delay, window: 4, seed: s }); if (pred(r)) return s; } return null; }
      [['Clean line', function () { st.loss = 0; loss.set(0); }],
       ['Fast retransmit', function () { var s = findSeed(function (r) { return r.fastRetransmits >= 1 && r.timeouts.length === 0; }); st.loss = 0.15; loss.set(15); if (s !== null) st.seed = s; }],
       ['Timeout', function () { var s = findSeed(function (r) { return r.timeouts.length >= 1 && r.fastRetransmits === 0; }); st.loss = 0.15; loss.set(15); if (s !== null) st.seed = s; }],
       ['Awful line (40%)', function () { st.loss = 0.4; loss.set(40); }]].forEach(function (c) { chips.appendChild(NA.chip(c[0], function () { c[1](); recompute(); replay(); })); });
      var play = NA.button('▶ Play', 'primary', function () { toggle(); }), step = NA.button('Step ▸', '', function () { run.cancel(); st.playing = false; st.cursor = Math.min(res.doneAt, st.cursor + 1); redraw(); }), reset = NA.button('⟲ Reset', '', function () { run.cancel(); st.playing = false; st.cursor = 0; redraw(); });
      var scrub = el('input'); scrub.type = 'range'; scrub.min = 0; scrub.max = 20; scrub.value = 0; scrub.setAttribute('aria-label', 'Time cursor');
      scrub.addEventListener('input', function () { run.cancel(); st.playing = false; st.cursor = +scrub.value; redraw(); });
      var tb = el('div', 'na-controls tight'); [play, step, reset].forEach(function (b) { tb.appendChild(b); }); tb.appendChild(NA.field('Time', scrub, 'grow')); tb.appendChild(NA.speedControl());
      var cols = el('div', 'na-cols'), stage = el('div', 'na-stage na-tcp-scroll'), side = el('div', 'na-tcp-side');
      cols.appendChild(stage); cols.appendChild(side);
      var say = NA.narrator();
      var note = el('p', 'na-note', 'Simulation of TCP’s main ideas. Sequence numbers count bytes from 0 (real TCP starts from the number agreed in the handshake). One tick = the time to send one segment. The sender may have at most 4 segments in flight; real TCP also adapts that window to the network (congestion control), left out here. Timeout = 2 × delay + 2 ticks.');
      [ctr, chips, tb, cols, say.node, note].forEach(function (c) { p.appendChild(c); });

      function replay() { run.cancel(); st.cursor = 0; toggle(); }
      function toggle() {
        if (st.playing) { run.cancel(); st.playing = false; redraw(); return; }
        if (st.cursor >= res.doneAt) st.cursor = 0;
        st.playing = true; var g = run.start(); redraw();
        (async function () {
          while (st.cursor < res.doneAt) { if (!(await run.sleep(g, NA.dur(280)))) return; st.cursor++; redraw(); }
          st.playing = false; redraw();
        })();
      }
      function recompute() {
        run.cancel(); st.playing = false;
        res = E.Tcp.transfer({ text: st.text, mss: st.mss, loss: st.loss, delay: st.delay, window: 4, seed: st.seed });
        st.cursor = res.doneAt; scrub.max = res.doneAt; redraw();
      }
      function redraw() {
        scrub.value = st.cursor; play.textContent = st.playing ? '❚❚ Pause' : (st.cursor >= res.doneAt ? '▶ Replay' : '▶ Play');
        drawDiagram(); drawSide(); narrate();
      }
      function drawDiagram() {
        NA.clear(stage);
        var total = Math.max(res.doneAt, 1), ppt = Math.max(4.5, Math.min(11, 330 / (total + 1))), top = 44, W = 560, xs = 118, xr = 442, Hh = top + total * ppt + 26, D = res.delay;
        function Y(t) { return top + t * ppt; }
        var s = svg('svg', { viewBox: '0 0 ' + W + ' ' + Hh, role: 'img', 'aria-label': 'Space-time diagram: ' + res.segs.length + ' segments of a message sent from the sender to the receiver, finishing at tick ' + res.doneAt + '.' }, stage);
        s.style.minWidth = '460px';
        svg('text', { x: xs, y: 18, 'text-anchor': 'middle', class: 'na-tcp-lane' }, s, 'Sender'); svg('text', { x: xr, y: 18, 'text-anchor': 'middle', class: 'na-tcp-lane' }, s, 'Receiver');
        svg('line', { x1: xs, y1: 28, x2: xs, y2: Hh - 10, class: 'na-tcp-axis' }, s); svg('line', { x1: xr, y1: 28, x2: xr, y2: Hh - 10, class: 'na-tcp-axis' }, s);
        for (var t = 0; t <= total; t += (ppt < 7 ? 10 : 5)) { svg('text', { x: 30, y: Y(t) + 4, class: 'na-tcp-sub', 'text-anchor': 'end' }, s, String(t)); svg('line', { x1: 34, y1: Y(t), x2: 40, y2: Y(t), class: 'na-tcp-axis' }, s); }
        svg('text', { x: 6, y: 34, class: 'na-tcp-sub' }, s, 'tick');
        var c = st.cursor;
        res.events.forEach(function (e) {
          if (e.sentAt > c) return;
          var data = e.kind === 'data', fx = data ? xs : xr, tx = data ? xr : xs, frac = Math.min(1, (c - e.sentAt) / D), lim = e.lost ? 0.55 : 1, f = Math.min(frac, lim);
          var ex = fx + (tx - fx) * f, ey = Y(e.sentAt + D * f), kind = data ? (e.attempt > 1 ? 'rtx' : 'data') : (e.dupOf ? 'dup' : 'ack');
          svg('line', { x1: fx, y1: Y(e.sentAt), x2: ex, y2: ey, class: 'na-tcp-arrow ' + kind + (e.lost ? ' lost' : '') }, s);
          if (frac < 1 && !(e.lost && frac >= lim)) svg('circle', { cx: ex, cy: ey, r: 3.2, class: 'na-tcp-head ' + kind }, s);
          if (e.lost && frac >= lim) svg('text', { x: ex, y: ey + 5, 'text-anchor': 'middle', class: 'na-tcp-x' }, s, '✗');
          if (ppt >= 7 || data) svg('text', { x: data ? fx + 8 : fx - 8, y: Y(e.sentAt) + 3, 'text-anchor': data ? 'start' : 'end', class: 'na-tcp-sub ' + (data ? 'd' : 'a') }, s,
            data ? 'seq ' + e.seq + (e.attempt > 1 ? (e.why === 'fast' ? ' ⚡fast' : ' ↻') : '') : 'ack ' + e.ack + (e.dupOf ? ' (again)' : ''));
        });
        res.timeouts.forEach(function (to) { if (to.at <= c) svg('text', { x: xs - 8, y: Y(to.at) + 4, 'text-anchor': 'end', class: 'na-tcp-to' }, s, '⏱ timeout'); });
        res.fast.forEach(function (fa) { if (fa.at <= c) svg('text', { x: xs - 8, y: Y(fa.at) + 4, 'text-anchor': 'end', class: 'na-tcp-to' }, s, '3rd duplicate ACK'); });
        svg('line', { x1: 38, y1: Y(c), x2: W - 8, y2: Y(c), class: 'na-tcp-cursor' }, s);
      }
      function drawSide() {
        NA.clear(side);
        var c = st.cursor, r = res;
        side.appendChild(el('div', 'na-lab', 'The message at the receiver'));
        var strip = el('div', 'na-tcp-strip'); strip.setAttribute('role', 'img');
        var got = '', nrx = 0, ndv = 0;
        r.segs.forEach(function (sg) {
          var g = el('span', 'na-tcp-seg'); g.appendChild(el('span', 'na-tcp-segn', String(sg.seq)));
          var box = el('span', 'na-tcp-chars');
          for (var b = 0; b < sg.len; b++) {
            var i = sg.seq + b, ch = r.text.charAt(i), cls = 'na-tcp-ch';
            if (r.deliveredAt[i] !== null && r.deliveredAt[i] <= c) { cls += ' dv'; ndv++; got += ch; }
            else if (r.receivedAt[i] !== null && r.receivedAt[i] <= c) { cls += ' rx'; nrx++; }
            box.appendChild(el('span', cls, ch === ' ' ? ' ' : ch));
          }
          g.appendChild(box); strip.appendChild(g);
        });
        strip.setAttribute('aria-label', ndv + ' of ' + r.total + ' characters delivered to the program, ' + nrx + ' received but waiting for an earlier gap.');
        side.appendChild(strip);
        var k = el('div', 'na-key');
        [['grey', 'not here yet'], ['amber', 'arrived, waiting for a gap (buffered)'], ['green', 'delivered to the program, in order']].forEach(function (x) { var sp = el('span'), i = el('i'); i.className = 'na-tcp-sw ' + x[0]; sp.appendChild(i); sp.appendChild(document.createTextNode(x[1])); k.appendChild(sp); });
        side.appendChild(k);
        side.appendChild(el('div', 'na-lab', 'The program has read so far:'));
        side.appendChild(el('div', 'na-tcp-got', got || '…'));
        var tiles = el('div', 'na-stats');
        var sent = r.events.filter(function (e) { return e.kind === 'data' && e.sentAt <= c; }).length;
        var rtx = r.events.filter(function (e) { return e.kind === 'data' && e.attempt > 1 && e.sentAt <= c; }).length;
        var s1 = NA.stat('Segments sent', rtx ? 'warn' : ''), s2 = NA.stat('Re-sent', rtx ? 'warn' : 'good'), s3 = NA.stat('Finished at', '');
        s1.set(String(sent), 'of ' + r.segs.length + ' needed'); s2.set(String(rtx), r.timeouts.filter(function (x) { return x.at <= c; }).length + ' timeout · ' + r.fast.filter(function (x) { return x.at <= c; }).length + ' fast');
        s3.set(c >= r.doneAt ? 'tick ' + r.doneAt : '…', c >= r.doneAt ? 'last ACK heard' : 'press Play');
        [s1, s2, s3].forEach(function (x) { tiles.appendChild(x.node); }); side.appendChild(tiles);
      }
      function narrate() {
        var r = res, c = st.cursor;
        if (r.total === 0) { say.say('Type a message first.'); return; }
        var to = r.timeouts.filter(function (x) { return x.at === c; })[0], fa = r.fast.filter(function (x) { return x.at === c; })[0];
        if (to) { say.say('<b>⏱ Timeout.</b> The oldest segment (<b>seq ' + to.seq + '</b>) was never acknowledged in time, so the sender sends <em>that one</em> again. The receiver, meanwhile, keeps later segments in its buffer (amber).'); return; }
        if (fa) { say.say('<b>Fast retransmit.</b> The receiver keeps answering “<b>ack ' + fa.seq + '</b>” — still waiting for byte ' + fa.seq + ' — and that third duplicate ACK tells the sender a segment was lost, without waiting for a timeout. It re-sends <b>seq ' + fa.seq + '</b> at once.'); return; }
        if (c >= r.doneAt) {
          say.say('<b>Done at tick ' + r.doneAt + '.</b> The program received <b>every byte, in order</b>, whatever the line did: ' + r.dataSent + ' segments were sent for ' + r.segs.length + ' needed (' + r.retransmissions + ' re-sent: ' + r.timeouts.length + ' after a timeout, ' + r.fastRetransmits + ' by fast retransmit). ' +
            (st.loss === 0 ? 'Raise the loss and watch the amber letters wait for a missing piece.' : 'That reliability is TCP’s promise — paid for with waiting.'));
          return;
        }
        var nd = 0, nb = 0; for (var i = 0; i < r.total; i++) { if (r.deliveredAt[i] !== null && r.deliveredAt[i] <= c) nd++; else if (r.receivedAt[i] !== null && r.receivedAt[i] <= c) nb++; }
        say.say('Tick <b>' + c + '</b>. Blue = data, green dashed = acknowledgement (<em>“I have everything up to byte N”</em>), ✗ = lost, orange = re-sent. <b>' + nd + '</b> of ' + r.total + ' characters are delivered' + (nb ? ', <b>' + nb + '</b> arrived early and wait in the buffer (amber)' : '') + '.');
      }
      recompute();
    }

    /* ---------------------------------------------------------------- UDP ---------------------------------------------------------------- */
    function buildUdp(host) {
      var SC = { video: { n: 30, interval: 40, deadline: 150, loss: 10, jitter: 30 }, file: { n: 40, interval: 10, deadline: Infinity, loss: 10, jitter: 20 }, dns: {} };
      var st = { scen: 'video', mode: 'udp', loss: 0.1, jitter: 30, rtt: 80, seed: 11, cursor: 0, playing: false, T: 1 };
      var run = NA.runner(), sims = null, cur = null;
      host.appendChild(tryLine('on <b>Video call</b> set loss to about 10 % and flip between <b>UDP</b> and <b>TCP</b>: UDP shows a glitch and carries on, TCP never loses a frame but freezes behind the missing one. Then try <b>File copy</b> and <b>DNS question</b>.'));
      var chips = el('div', 'na-chips'); chips.appendChild(el('span', 'na-lab', 'Scenario'));
      var chipBtns = {};
      [['video', 'Video call'], ['file', 'File copy'], ['dns', 'DNS question']].forEach(function (c) {
        var b = NA.chip(c[1], function () { pick(c[0]); }); b.setAttribute('aria-pressed', c[0] === st.scen ? 'true' : 'false'); chipBtns[c[0]] = b; chips.appendChild(b);
      });
      var modeSeg = NA.segmented([{ value: 'udp', label: 'UDP' }, { value: 'tcp', label: 'TCP' }], 'udp', function (v) { st.mode = v; recompute(true); }, 'Transport used');
      var mf = el('div', 'na-field'); mf.appendChild(el('span', 'na-lab', 'Transport')); mf.appendChild(modeSeg.wrap);
      var loss = NA.slider('Packet loss', 0, 30, 1, 10, function (v) { return v + '%'; }, function (v) { st.loss = v / 100; recompute(); });
      var jit = NA.slider('Jitter (random extra delay)', 0, 120, 10, 30, function (v) { return v + ' ms'; }, function (v) { st.jitter = v; recompute(); });
      var rtt = NA.slider('Round trip', 20, 300, 10, 80, function (v) { return v + ' ms'; }, function (v) { st.rtt = v; recompute(); });
      var dice = NA.button('🎲 New dice', '', function () { st.seed = (st.seed * 7 + 3) % 997; recompute(); }, 'Roll a different pattern of lost packets');
      var ctr = el('div', 'na-controls'); [mf, loss.wrap, jit.wrap, rtt.wrap, dice].forEach(function (c) { ctr.appendChild(c); });
      var play = NA.button('▶ Replay', 'primary', function () { toggle(); }), reset = NA.button('⟲ Reset', '', function () { run.cancel(); st.playing = false; st.cursor = 0; redraw(); });
      var scrub = el('input'); scrub.type = 'range'; scrub.min = 0; scrub.max = 100; scrub.value = 0; scrub.setAttribute('aria-label', 'Time');
      scrub.addEventListener('input', function () { run.cancel(); st.playing = false; st.cursor = +scrub.value; redraw(); });
      var tb = el('div', 'na-controls tight'); tb.appendChild(play); tb.appendChild(reset); tb.appendChild(NA.field('Time', scrub, 'grow')); tb.appendChild(NA.speedControl());
      var live = el('div', 'na-udp-live');          // ladder + screen/strip (video, file)
      var dnsBox = el('div', 'na-udp-dns');
      var tiles = el('div', 'na-stats'), cmp = el('div', 'na-tbl-scroll'), say = NA.narrator();
      var right = el('div', 'na-note');
      host.appendChild(chips); host.appendChild(ctr); host.appendChild(tb); host.appendChild(live); host.appendChild(dnsBox); host.appendChild(tiles); host.appendChild(cmp); host.appendChild(say.node); host.appendChild(right);
      right.innerHTML = 'Which one is right? <b>Live media</b> (calls, games, streams) → <b>UDP</b>: a late packet is useless, so never wait for it. <b>Files, web pages, e-mail</b> → <b>TCP</b>: every byte must arrive. <b>DNS</b> → <b>UDP</b>: one tiny question, one tiny answer. <b>HTTP/3</b> uses <b>QUIC</b>, which builds its own reliability and encryption on top of UDP, to avoid TCP’s start-up cost and head-of-line waiting. <em>Simulation:</em> loss and delays come from fixed dice; header sizes are UDP 8 B and TCP 20 B (no options).';

      function pick(s) {
        st.scen = s; Object.keys(chipBtns).forEach(function (k) { chipBtns[k].setAttribute('aria-pressed', k === s ? 'true' : 'false'); });
        if (s !== 'dns') { loss.set(SC[s].loss); st.loss = SC[s].loss / 100; jit.set(SC[s].jitter); st.jitter = SC[s].jitter; }
        if (s === 'file') { modeSeg.set('tcp'); st.mode = 'tcp'; } else if (s === 'video') { modeSeg.set('udp'); st.mode = 'udp'; }
        recompute(true);
      }
      function toggle() {
        if (st.playing) { run.cancel(); st.playing = false; redraw(); return; }
        if (st.cursor >= st.T) st.cursor = 0;
        st.playing = true; var g = run.start(), from = st.cursor, total = NA.dur(6000) * (st.T - from) / st.T; redraw();
        run.tween(g, total, function (t) { st.cursor = NA.lerp(from, st.T, t); redraw(true); }).then(function (ok) { if (ok) { st.cursor = st.T; st.playing = false; redraw(); } });
      }
      function recompute(replay) {
        run.cancel(); st.playing = false;
        var dns = st.scen === 'dns';
        loss.input.disabled = dns; jit.input.disabled = dns; dice.disabled = dns; modeSeg.wrap.style.opacity = dns ? 0.5 : ''; Array.prototype.forEach.call(modeSeg.wrap.querySelectorAll('button'), function (b) { b.disabled = dns; });
        play.disabled = dns; reset.disabled = dns; scrub.disabled = dns;
        live.hidden = dns; dnsBox.hidden = !dns; tiles.hidden = false;
        if (dns) { drawDns(); return; }
        var c = SC[st.scen], base = { n: c.n, intervalMs: c.interval, deadlineMs: c.deadline, loss: st.loss, jitter: st.jitter, rtt: st.rtt, seed: st.seed };
        sims = { udp: E.Udp.sim(Object.assign({ mode: 'udp' }, base)), tcp: E.Udp.sim(Object.assign({ mode: 'tcp' }, base)) };
        cur = sims[st.mode];
        var lastDue = c.deadline === Infinity ? 0 : (c.n - 1) * c.interval + c.deadline;
        st.T = Math.ceil(Math.max(cur.finishMs, lastDue, 1) + (c.deadline === Infinity ? 20 : 40)); scrub.max = st.T;
        st.cursor = replay === true ? 0 : st.T;
        redraw();
        if (replay === true) toggle();
      }
      function redraw(light) {
        scrub.value = st.cursor; play.textContent = st.playing ? '❚❚ Pause' : (st.cursor >= st.T ? '▶ Replay' : '▶ Play');
        if (st.scen === 'dns') return;
        drawLive(); if (!light) { drawStats(); } narrate(light);
      }
      var tlast = -1;
      function drawLive() {
        NA.clear(live);
        var c = SC[st.scen], r = cur, T = st.T, W = 640, x0 = 62, x1 = W - 16, topY = 46, botY = 164, H = 196, now = st.cursor;
        function X(t) { return x0 + t * (x1 - x0) / T; }
        var stage = el('div', 'na-stage na-udp-scroll'), s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Ladder diagram: each of ' + c.n + ' packets travels from the time it was sent (top) to the time it reaches the program (bottom).' }, stage);
        s.style.minWidth = '520px';
        svg('text', { x: 4, y: topY + 4, class: 'na-udp-ax' }, s, 'sent'); svg('text', { x: 4, y: botY + 4, class: 'na-udp-ax' }, s, 'arrives');
        svg('line', { x1: x0, y1: topY, x2: x1, y2: topY, class: 'na-udp-axis' }, s); svg('line', { x1: x0, y1: botY, x2: x1, y2: botY, class: 'na-udp-axis' }, s);
        var stepT = T > 1500 ? 500 : T > 700 ? 200 : 100;
        for (var t = 0; t <= T; t += stepT) { svg('line', { x1: X(t), y1: botY, x2: X(t), y2: botY + 5, class: 'na-udp-axis' }, s); svg('text', { x: X(t), y: botY + 17, 'text-anchor': 'middle', class: 'na-udp-ax' }, s, t + ' ms'); }
        if (c.deadline !== Infinity) r.packets.forEach(function (p) { svg('line', { x1: X(p.due), y1: botY - 7, x2: X(p.due), y2: botY, class: 'na-udp-due' }, s); });
        var tag = el('div', 'na-udp-cap', c.deadline !== Infinity ? 'Short marks on the bottom line = the moment each frame is needed on screen (' + c.deadline + ' ms after it was sent). A line landing to the right of its own mark arrives too late.' : 'Each line is one packet; red ✗ = lost for good.');
        r.packets.forEach(function (p) {
          if (p.sentAt > now) return;
          var endT = p.deliver !== null ? p.deliver : p.sentAt + r.owd, span = Math.max(1, endT - p.sentAt), f = Math.min(1, (now - p.sentAt) / span);
          var lim = p.deliver === null ? 0.6 : 1, ff = Math.min(f, lim), ex = X(p.sentAt) + (X(endT) - X(p.sentAt)) * ff, ey = topY + (botY - topY) * ff;
          var done = f >= 1, cls = 'na-udp-pk ' + (done || p.deliver === null && f >= lim ? p.status : 'fly') + (p.attempts > 1 ? ' rtx' : '');
          svg('line', { x1: X(p.sentAt), y1: topY, x2: ex, y2: ey, class: cls }, s);
          if (p.deliver === null && f >= lim) svg('text', { x: ex, y: ey + 5, 'text-anchor': 'middle', class: 'na-udp-x' }, s, '✗');
          else if (done && p.status === 'late') svg('circle', { cx: ex, cy: ey, r: 2.8, class: 'na-udp-late' }, s);
        });
        svg('line', { x1: X(now), y1: topY - 8, x2: X(now), y2: botY + 4, class: 'na-udp-cursor' }, s);
        live.appendChild(stage); live.appendChild(tag);
        // the viewer
        var viewer = el('div', 'na-udp-viewer');
        if (st.scen === 'video') {
          var f = now < c.deadline ? -1 : Math.min(c.n - 1, Math.floor((now - c.deadline) / c.interval)), screen = el('div', 'na-udp-screen'), msg, k;
          if (f < 0) { k = 'wait'; msg = '⏳ buffering…'; screen.appendChild(el('div', 'na-udp-sbig', '···')); }
          else { var pk = r.packets[f]; k = pk.status; screen.appendChild(el('div', 'na-udp-sbig', k === 'ok' ? 'Frame ' + (f + 1) : k === 'missing' ? '▒▒▒▒' : '❄ ' + 'Frame ' + f));
            msg = k === 'ok' ? '✓ live' : k === 'missing' ? '▒ glitch — frame ' + (f + 1) + ' was lost, the picture carries on' : '❄ frozen — waiting for frame ' + (f + 1) + ' (late by ' + Math.round(pk.lateBy) + ' ms)'; }
          screen.className += ' ' + k; screen.appendChild(el('div', 'na-udp-sline', msg)); viewer.appendChild(screen);
          var strip = el('div', 'na-udp-cells'); strip.setAttribute('role', 'img'); var nok = 0;
          r.packets.forEach(function (p) {
            var shown = now >= p.due, k2 = shown ? p.status : 'wait'; if (shown && p.status === 'ok') nok++;
            var cell = el('span', 'na-udp-cell ' + k2, shown ? (p.status === 'ok' ? '✓' : p.status === 'missing' ? '✗' : '❄') : String(p.i + 1)); cell.title = 'Frame ' + (p.i + 1) + (shown ? ': ' + p.status : ''); strip.appendChild(cell);
          });
          strip.setAttribute('aria-label', nok + ' frames shown on time so far.');
          viewer.appendChild(strip);
          var kk = el('div', 'na-key'); [['ok', '✓ shown on time'], ['missing', '✗ lost: a glitch'], ['late', '❄ late: the picture froze']].forEach(function (x) { var sp = el('span'), i = el('i'); i.className = 'na-udp-sw ' + x[0]; sp.appendChild(i); sp.appendChild(document.createTextNode(x[1])); kk.appendChild(sp); }); viewer.appendChild(kk);
        } else {
          var grid = el('div', 'na-udp-cells file'); grid.setAttribute('role', 'img'); var got = 0, holes = 0;
          r.packets.forEach(function (p) {
            var k3 = 'wait', glyph = String(p.i + 1);
            if (p.deliver !== null && p.deliver <= now) { k3 = 'ok'; glyph = '✓'; got++; }
            else if (p.arrival !== null && p.arrival <= now) { k3 = 'late'; glyph = '⏳'; }
            else if (p.deliver === null && now >= p.sentAt + r.owd) { k3 = 'missing'; glyph = '✗'; holes++; }
            var cell = el('span', 'na-udp-cell ' + k3, glyph); cell.title = 'Packet ' + (p.i + 1); grid.appendChild(cell);
          });
          grid.setAttribute('aria-label', got + ' packets of the file received, ' + holes + ' holes.');
          viewer.appendChild(el('div', 'na-lab', 'The file at the receiver — one square per packet'));
          viewer.appendChild(grid);
          var kk2 = el('div', 'na-key'); [['ok', '✓ received'], ['late', '⏳ arrived, waiting for an earlier packet'], ['missing', '✗ hole in the file']].forEach(function (x) { var sp = el('span'), i = el('i'); i.className = 'na-udp-sw ' + x[0]; sp.appendChild(i); sp.appendChild(document.createTextNode(x[1])); kk2.appendChild(sp); }); viewer.appendChild(kk2);
        }
        live.appendChild(viewer);
      }
      function drawStats() {
        var r = cur, c = SC[st.scen]; NA.clear(tiles); NA.clear(cmp);
        var items;
        if (st.scen === 'video') items = [['Shown on time', r.onTime + ' / ' + c.n, r.onTime === c.n ? 'good' : 'warn', 'frames'], ['Lost for good', String(r.missing), r.missing ? 'bad' : 'good', 'glitches'], ['Late', String(r.late), r.late ? 'warn' : 'good', 'frozen frames'], ['Longest freeze', r.longestFreezeMs + ' ms', r.longestFreezeMs > 40 ? 'warn' : 'good', r.longestRun + ' frame' + (r.longestRun === 1 ? '' : 's') + ' in a row'], ['Packets on the wire', String(r.packetsOnWire), '', st.mode === 'tcp' ? 'data + ACKs + re-sends' : 'data only'], ['Header bytes', String(r.headerBytes), '', st.mode === 'tcp' ? '20 B per packet' : '8 B per packet']];
        else items = [['Holes in the file', String(r.missing), r.missing ? 'bad' : 'good', r.missing ? 'file is corrupt' : 'file is perfect'], ['Finished after', r.finishMs + ' ms', '', 'last packet delivered'], ['Re-sent packets', String(r.retransmissions), r.retransmissions ? 'warn' : '', st.mode === 'tcp' ? 'TCP repairs losses' : 'UDP never does'], ['Packets on the wire', String(r.packetsOnWire), '', st.mode === 'tcp' ? 'data + ACKs + re-sends' : 'data only'], ['Header bytes', String(r.headerBytes), '', st.mode === 'tcp' ? '20 B per packet' : '8 B per packet']];
        items.forEach(function (it) { var sx = NA.stat(it[0], it[2]); sx.set(it[1], it[3]); tiles.appendChild(sx.node); });
        var t = el('table', 'na-table'), hd = el('tr');
        (st.scen === 'video' ? ['Same bad luck', 'On time', 'Lost', 'Late', 'Longest freeze'] : ['Same bad luck', 'Holes', 'Finished after', 'Packets on wire']).forEach(function (h) { hd.appendChild(el('th', null, h)); }); t.appendChild(hd);
        ['udp', 'tcp'].forEach(function (m) {
          var q = sims[m], tr = el('tr', m === st.mode ? 'new' : ''), cells = st.scen === 'video' ? [m.toUpperCase(), q.onTime + ' / ' + c.n, q.missing, q.late, q.longestFreezeMs + ' ms'] : [m.toUpperCase(), q.missing, q.finishMs + ' ms', q.packetsOnWire];
          cells.forEach(function (v) { tr.appendChild(el('td', null, String(v))); }); t.appendChild(tr);
        });
        cmp.appendChild(t);
      }
      function narrate(light) {
        if (light && st.playing) return;
        var r = cur, c = SC[st.scen], txt;
        if (st.scen === 'video') {
          if (r.missing === 0 && r.late === 0) txt = 'No loss and no big delay: <b>UDP and TCP look identical</b>. Raise the loss slider: the difference appears only when the network misbehaves.';
          else if (st.mode === 'udp') txt = '<b>UDP.</b> ' + r.missing + ' of ' + c.n + ' packets were lost and the viewer saw ' + r.missing + ' short glitch' + (r.missing === 1 ? '' : 'es') + (r.late ? ' (and ' + r.late + ' frame' + (r.late === 1 ? '' : 's') + ' arrived too late to use)' : '') + ' — but the call <b>never waited</b>: every other frame was on time. For a live call that is exactly right: an old frame is worth nothing.';
          else txt = '<b>TCP.</b> Nothing was lost, but <b>' + r.late + ' frame' + (r.late === 1 ? '' : 's') + ' came late</b>. TCP re-sent the lost packet and, until it arrived, <em>held back everything behind it</em> (head-of-line blocking): the picture froze for up to <b>' + r.longestFreezeMs + ' ms</b>. Great for a file, bad for a live call.';
        } else {
          if (st.mode === 'udp') txt = '<b>UDP.</b> ' + (r.missing ? 'The file has <b>' + r.missing + ' hole' + (r.missing === 1 ? '' : 's') + '</b>: nobody re-sends a lost datagram, so unless the program adds its own repair the copy is corrupt.' : 'No packet was lost this time, so the file is intact — by luck. Raise the loss.') + ' It finished after ' + r.finishMs + ' ms.';
          else { var slower = r.finishMs > sims.udp.finishMs; txt = '<b>TCP.</b> Every packet arrived — <b>no holes</b>' + (r.retransmissions ? ' (' + r.retransmissions + ' re-sent)' : '') + (slower ? ' — at the cost of waiting: the copy finished after <b>' + r.finishMs + ' ms</b> (UDP: ' + sims.udp.finishMs + ' ms, with ' + sims.udp.missing + ' hole' + (sims.udp.missing === 1 ? '' : 's') + ').' : '. Here it finished at the same moment as UDP (the last packet decides), but it needed <b>' + r.packetsOnWire + ' packets</b> instead of ' + sims.udp.packetsOnWire + ' (acknowledgements and re-sends) — and a lost packet near the end would have made it wait.') + ' For files, being right matters more than being fast.'; }
        }
        say.say(txt);
      }
      function drawDns() {
        NA.clear(dnsBox); NA.clear(tiles); NA.clear(cmp);
        var d = E.Udp.dnsCount(st.rtt), cols = el('div', 'na-udp-dnscols');
        [['udp', 'DNS over UDP (what resolvers normally use)', d.udp], ['tcp', 'DNS over TCP', d.tcp]].forEach(function (x) {
          var box = el('div', 'na-udp-dcol ' + x[0]); box.appendChild(el('h4', null, x[1]));
          var ul = el('ol', 'na-udp-plist');
          x[2].list.forEach(function (txt, i) { var ph = x[0] === 'udp' ? 'data' : i < 3 ? 'hs' : i < 5 ? 'data' : 'cl'; ul.appendChild(el('li', ph, txt)); });
          box.appendChild(ul);
          box.appendChild(el('div', 'na-udp-count', x[2].packets + ' packets'));
          var bar = el('div', 'na-udp-bar'), fill = el('span'); fill.style.width = Math.round(x[2].answerMs / d.tcp.answerMs * 100) + '%'; bar.appendChild(fill); box.appendChild(bar);
          box.appendChild(el('div', 'na-udp-ans', 'answer after ' + x[2].answerMs + ' ms'));
          cols.appendChild(box);
        });
        dnsBox.appendChild(cols);
        var key = el('div', 'na-key'); [['hs', 'handshake (3)'], ['data', 'the question and the answer'], ['cl', 'closing (4)']].forEach(function (x) { var sp = el('span'), i = el('i'); i.className = 'na-udp-sw ' + x[0]; sp.appendChild(i); sp.appendChild(document.createTextNode(x[1])); key.appendChild(sp); }); dnsBox.appendChild(key);
        var a = NA.stat('UDP packets', 'good'), b = NA.stat('TCP packets', 'warn'), c = NA.stat('Time to the answer', ''); a.set('2', 'query + answer'); b.set('9', '3 + 2 + 4'); c.set(d.udp.answerMs + ' ms vs ' + d.tcp.answerMs + ' ms', 'UDP vs TCP: TCP spends a whole round trip on the handshake');
        [a, b, c].forEach(function (x) { tiles.appendChild(x.node); });
        say.say('A DNS lookup is <b>one question and one answer</b>. With UDP that is 2 packets and one round trip. With TCP the same question needs 3 packets of handshake first, then the question and answer, then 4 packets to close: <b>9 packets and twice the waiting</b> — for something a single packet can carry. If the UDP query or answer is lost, the resolver simply <em>asks again</em> after a timeout. (DNS does fall back to TCP when an answer is too big for one datagram.)');
      }
      recompute();
    }

    /* ---------------------------------------------------------------- TLS ---------------------------------------------------------------- */
    function buildTls(host) {
      var HOST = 'www.example.com', P = 23, GEN = 5;
      var REQ = 'POST /login HTTP/1.1\nHost: www.example.com\n\nuser=alice&password=hunter2', RES = 'HTTP/1.1 200 OK\n\nWelcome, alice!';
      var SCEN = [['valid', 'Valid certificate'], ['expired', 'Expired'], ['wrongname', 'Wrong name'], ['selfsigned', 'Unknown CA / self-signed'], ['mitm', 'Attacker in the middle']];
      var st = { scen: 'valid', https: true, a: 6, b: 15, step: 0, frac: 1, playing: false, decision: null };
      var run = NA.runner();
      host.appendChild(tryLine('step through the <b>Valid certificate</b> handshake, then switch to <b>HTTP</b> and see what the eavesdropper reads; finally try <b>Attacker in the middle</b> and press <b>Proceed anyway</b>.'));
      var chips = el('div', 'na-chips'); chips.appendChild(el('span', 'na-lab', 'Scenario')); var chipBtns = {};
      SCEN.forEach(function (c) { var b = NA.chip(c[1], function () { st.scen = c[0]; st.https = true; protoSeg.set('https'); resetAll(); }); b.setAttribute('aria-pressed', c[0] === st.scen ? 'true' : 'false'); chipBtns[c[0]] = b; chips.appendChild(b); });
      var protoSeg = NA.segmented([{ value: 'http', label: 'HTTP' }, { value: 'https', label: 'HTTPS' }], 'https', function (v) { st.https = v === 'https'; resetAll(); }, 'Protocol');
      var pf = el('div', 'na-field'); pf.appendChild(el('span', 'na-lab', 'Protocol')); pf.appendChild(protoSeg.wrap);
      var sa = NA.slider('Browser’s secret a (toy)', 2, 21, 1, 6, function (v) { return String(v); }, function (v) { st.a = v; resetAll(); });
      var sb = NA.slider('Server’s secret b (toy)', 2, 21, 1, 15, function (v) { return String(v); }, function (v) { st.b = v; resetAll(); });
      var dice = NA.button('🎲 New secrets', '', function () { st.a = 2 + Math.floor(Math.random() * 20); st.b = 2 + Math.floor(Math.random() * 20); sa.set(st.a); sb.set(st.b); resetAll(); });
      var stepB = NA.button('Step ▸', 'primary', function () { stepOnce(); }), playB = NA.button('▶ Play', '', function () { toggle(); }), resetB = NA.button('⟲ Reset', '', function () { resetAll(); });
      var ctr = el('div', 'na-controls'); [pf, sa.wrap, sb.wrap, dice].forEach(function (c) { ctr.appendChild(c); });
      var tb = el('div', 'na-controls tight'); [stepB, playB, resetB].forEach(function (c) { tb.appendChild(c); }); tb.appendChild(NA.speedControl());
      var stage = el('div', 'na-stage na-tls-scroll'), warn = el('div', 'na-tls-warnbox'), panels = el('div', 'na-tls-panels'), say = NA.narrator();
      var note = NA.html('p', 'na-note', 'Simulation of the <em>shape</em> of HTTPS, not real cryptography: the Diffie–Hellman numbers are toy-sized (real TLS 1.3 uses elliptic-curve numbers of about 256 bits), the “cipher” is a simple scrambler, and all names, dates and certificate authorities are invented (today is fixed at 2026-10-18). In TLS 1.3 the certificate is already encrypted when it travels; it is shown in the clear here, as in older versions, because a certificate is public anyway. Credentials in the examples are made up.');
      [chips, ctr, tb, stage, warn, panels, say.node, note].forEach(function (c) { host.appendChild(c); });

      function model() {
        var cert = E.Tls.CERTS[st.scen], v = E.Tls.verifyCert({ host: HOST, cert: cert, now: E.Tls.TODAY, trusted: E.Tls.TRUST }), d = E.Tls.dh(P, GEN, st.a, st.b), mitm = st.scen === 'mitm' && st.https;
        return { cert: cert, v: v, d: d, mitm: mitm, key: d.sharedA, hexReq: E.Tls.scramble(REQ, d.sharedA), hexRes: E.Tls.scramble(RES, d.sharedA), hexFin: E.Tls.scramble('FINISHED ' + d.sharedA, d.sharedA) };
      }
      function rows() {
        var m = model(), out = [], far = m.mitm ? 't' : 's';
        if (!st.https) {
          out.push({ id: 'req', from: 'b', to: 's', label: 'HTTP request (plain text)', plain: true });
          out.push({ id: 'res', from: 's', to: 'b', label: 'HTTP response (plain text)', plain: true });
          return out;
        }
        out.push({ id: 'hello', from: 'b', to: far, label: 'ClientHello' });
        out.push({ id: 'shello', from: far, to: 'b', label: 'ServerHello + Certificate' + (m.mitm ? ' (the attacker’s)' : '') });
        out.push({ id: 'check', box: true, ok: m.v.ok, label: m.v.ok ? '✓ certificate accepted' : '✗ certificate rejected: ' + m.v.reasons.join(', ') });
        if (!m.v.ok && st.decision === null) return out;         // waiting for the user's decision
        if (!m.v.ok && st.decision === 'abort') { out.push({ id: 'abort', box: true, ok: false, label: '✗ connection closed' }); return out; }
        out.push({ id: 'keyA', from: 'b', to: far, label: 'key share A = ' + m.d.A });
        out.push({ id: 'keyB', from: far, to: 'b', label: 'key share B = ' + m.d.B });
        out.push({ id: 'fin', from: 'b', to: far, label: 'Finished', enc: true, both: true });
        out.push({ id: 'req', from: 'b', to: far, label: 'HTTP request', enc: true });
        out.push({ id: 'res', from: far, to: 'b', label: 'HTTP response', enc: true });
        return out;
      }
      function blocked() { var m = model(); return st.https && !m.v.ok && st.decision === null && st.step >= 3; }
      function resetAll() {
        run.cancel(); st.playing = false; st.step = 0; st.frac = 1; st.decision = null;
        Object.keys(chipBtns).forEach(function (k) { chipBtns[k].setAttribute('aria-pressed', k === st.scen ? 'true' : 'false'); chipBtns[k].disabled = !st.https; });
        sa.input.disabled = !st.https; sb.input.disabled = !st.https; dice.disabled = !st.https;
        paintBtns(); render();
        say.say(st.https ? 'A browser wants <b>https://www.example.com</b>. Before any HTTP is sent, the two sides must (1) check who the server is and (2) agree on a secret key. Press <b>Step</b>.'
          : 'This is plain <b>http://</b>: no handshake at all. Press <b>Step</b> to send the login form and see who can read it.');
      }
      function paintBtns() { var rs = rows(); playB.textContent = st.playing ? '❚❚ Pause' : '▶ Play'; stepB.disabled = st.step >= rs.length || blocked(); }
      async function doStep(g) {
        st.step++; st.frac = 0; paintBtns(); narrate(); render();
        var ok = await run.tween(g, NA.dur(750), function (t) { st.frac = NA.ease(t); render(); });
        if (ok) { st.frac = 1; render(); paintBtns(); }
        return ok;
      }
      function stepOnce() { var rs = rows(); if (st.step >= rs.length || blocked()) return; st.playing = false; var g = run.start(); doStep(g); }
      function toggle() {
        if (st.playing) { run.cancel(); st.playing = false; paintBtns(); return; }
        if (st.step >= rows().length && !blocked()) resetAll();
        st.playing = true; var g = run.start(); paintBtns();
        (async function () {
          while (st.step < rows().length) {
            if (blocked()) { break; }
            if (!(await doStep(g))) return;
            if (!(await run.sleep(g, NA.dur(550)))) return;
          }
          st.playing = false; paintBtns(); if (blocked()) render();
        })();
      }
      function decide(d) { st.decision = d; render(); paintBtns(); var rs = rows(); if (d === 'abort') { var g = run.start(); st.playing = false; doStep(g); } else say.say('<b>You pressed “Proceed anyway”.</b> The browser carries on with the handshake. Press <b>Step</b> to continue.'); }

      function hexShort(h) { var a = h.split(' '); return a.length > 40 ? a.slice(0, 40).join(' ') + ' …' : h; }
      function rowSay(rw) {
        var m = model(), d = m.d;
        switch (rw.id) {
          case 'hello': return '<b>① ClientHello</b> — the browser says hello: which TLS versions and ciphers it knows, a random number, and <em>which site it wants</em> (www.example.com). All of this travels <b>in the clear</b>' + (m.mitm ? ' — and here the attacker sits in the middle and catches it' : '') + '.';
          case 'shello': return m.mitm ? '<b>② The attacker answers</b> — it intercepted the ClientHello and replies <em>in the server’s name</em> with its own certificate for www.example.com, signed by “Shady Free CA”.'
            : '<b>② ServerHello + Certificate</b> — the server picks a cipher and sends its <b>certificate</b>: its name, its public key and a signature from a certificate authority (CA). Anybody can <em>claim</em> to be www.example.com; the certificate is the proof the browser will now check.';
          case 'check': return m.v.ok ? '<b>③ The browser checks the certificate</b> — three questions: is it for <em>this name</em>? valid <em>today</em>? signed by a CA whose root is <em>already in my trust store</em>? All ✓ — this really is www.example.com.'
            : '<b>③ Certificate check FAILED</b> — ' + m.v.checks.filter(function (c) { return !c.ok; }).map(function (c) { return c.text; }).join(' ') + (m.mitm ? ' The attacker cannot get a trusted CA to sign a certificate for a name it does not own, so it has to show a certificate the browser rejects.' : '') + ' The browser stops and warns you: <em>you</em> must decide.';
          case 'abort': return '<b>The browser closes the connection.</b> Nothing was sent: your password never left this computer. That is exactly what the warning page is for.';
          case 'keyA': return '<b>④ Key agreement (1/2)</b> — toy numbers: <b>p = 23</b> and <b>g = 5</b> are public. The browser keeps a secret number <b>a = ' + d.a + '</b> and sends <b>A = 5<sup>' + d.a + '</sup> mod 23 = ' + d.A + '</b>.';
          case 'keyB': return '<b>④ Key agreement (2/2)</b> — the other side sends <b>B = 5<sup>' + d.b + '</sup> mod 23 = ' + d.B + '</b>. The browser computes B<sup>a</sup> mod 23 = <b>' + d.sharedA + '</b>; the server computes A<sup>b</sup> mod 23 = <b>' + d.sharedB + '</b>. <b>Same number, never sent</b> — the session key. An eavesdropper saw only 23, 5, ' + d.A + ' and ' + d.B + ' (with 23 she could try every secret; real TLS uses ~256-bit numbers).' + (m.mitm ? ' <br><span class="bad">With the attacker in the middle this key is shared with the ATTACKER, who runs a second handshake with the real server.</span>' : '');
          case 'fin': return '<b>⑤ Finished</b> — each side sends a short message, <b>encrypted with the new key</b>, that sums up the whole handshake. Had anyone tampered with it, the check would fail. From now on everything is encrypted.';
          case 'req': return rw.plain ? '<b>HTTP request</b> — plain text, readable by every device on the path: the Wi-Fi owner, the routers, an attacker. The <b>password is right there</b>.'
            : '<b>⑥ The HTTP request, now encrypted</b> — the browser writes the same plain HTTP as before; TLS scrambles it with the session key before it leaves.' + (m.mitm ? ' <span class="bad">But the key is shared with the attacker: it decrypts, reads the password, and re-encrypts for the real server.</span>' : ' The eavesdropper sees only noise.');
          case 'res': return rw.plain ? '<b>HTTP response</b> — also plain text. Everything you read on that page was readable on the way.' : '<b>⑥ The response</b> — the page comes back encrypted too. The padlock means “encrypted to the owner of that certificate” — it does <em>not</em> mean the owner is honest.';
        }
        return '';
      }
      function narrate() { var rs = rows(), rw = rs[st.step - 1]; if (rw) say.say(rowSay(rw)); }

      /* ---- the picture ---- */
      function render() {
        var rs = rows(), m = model(), W = 640, xb = 96, xs = 548, xt = 322, top = 98, rowH = 40, H = top + Math.max(rs.length, 8) * rowH + 18;
        NA.clear(stage);
        var s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': (st.https ? 'HTTPS handshake' : 'Plain HTTP exchange') + ' between browser and server, step ' + st.step + ' of ' + rs.length + '.' }, stage);
        s.style.minWidth = '560px';
        var tapRed = m.mitm;
        svg('rect', { x: xt - 64, y: 56, width: 128, height: H - 64, rx: 10, class: 'na-tls-tap' + (tapRed ? ' atk' : '') }, s);
        svg('text', { x: xt, y: 72, 'text-anchor': 'middle', class: 'na-tls-tapt' + (tapRed ? ' atk' : '') }, s, tapRed ? 'Attacker in the middle' : 'Eavesdropper’s tap');
        svg('text', { x: xt, y: 86, 'text-anchor': 'middle', class: 'na-tls-tapsub' }, s, tapRed ? 'answers in the server’s name' : 'sees every packet');
        [[xb, 'Browser', '192.0.2.100'], [xs, 'Server', HOST]].forEach(function (h) {
          svg('rect', { x: h[0] - 66, y: 6, width: 132, height: 38, rx: 8, class: 'na-tls-host' }, s);
          svg('text', { x: h[0], y: 23, 'text-anchor': 'middle', class: 'na-tls-hname' }, s, h[1]);
          svg('text', { x: h[0], y: 37, 'text-anchor': 'middle', class: 'na-tls-hsub' }, s, h[2]);
          svg('line', { x1: h[0], y1: 46, x2: h[0], y2: H - 8, class: 'na-tls-life' }, s);
        });
        var xmap = { b: xb, s: xs, t: xt };
        rs.forEach(function (rw, i) {
          if (i >= st.step) return;
          var y0 = top + i * rowH, y1 = y0 + 22, frac = i === st.step - 1 ? st.frac : 1;
          if (rw.box) {
            var bx = svg('g', { class: 'na-tls-box ' + (rw.ok ? 'ok' : 'bad') }, s);
            svg('rect', { x: xb - 58, y: y0 - 6, width: 262, height: 30, rx: 8 }, bx);
            svg('text', { x: xb - 46, y: y0 + 14, class: 'na-tls-boxt' }, bx, rw.label);
            return;
          }
          var fx = xmap[rw.from], tx = xmap[rw.to], dirx = tx > fx ? 1 : -1, ex = fx + (tx - fx) * frac, ey = y0 + (y1 - y0) * frac;
          var cls = 'na-tls-a' + (rw.enc ? ' enc' : rw.plain ? ' plain' : '') + (rw.from === 'b' ? ' fromb' : '');
          if (rw.enc) svg('line', { x1: fx, y1: y0, x2: ex, y2: ey, class: 'na-tls-pipe' }, s);
          svg('line', { x1: fx, y1: y0, x2: ex, y2: ey, class: cls }, s);
          if (rw.both && frac >= 1) { arrowHead(s, fx, y0, fx - tx, y0 - y1, 'na-tls-ah ' + (rw.enc ? 'enc' : '')); }
          if (frac >= 1) arrowHead(s, ex, ey, tx - fx, y1 - y0, 'na-tls-ah' + (rw.enc ? ' enc' : rw.plain ? ' plain' : ''));
          else svg('circle', { cx: ex, cy: ey, r: 4, class: 'na-tls-tok' + (rw.enc ? ' enc' : '') }, s);
          var mid = (fx + tx) / 2, lbl = (rw.enc ? '🔒 ' : '') + rw.label + (rw.both ? ' ⇄' : '');
          svg('text', { x: mid, y: (y0 + y1) / 2 - 5, 'text-anchor': 'middle', class: 'na-tls-lbl' + (rw.plain ? ' plain' : '') }, s, lbl);
          // the attacker relays traffic to the real server once the browser agreed to talk to it
          if (m.mitm && st.decision === 'proceed' && i > 2 && frac >= 1) {
            var ry = y0 + 11; svg('line', { x1: xt + 64, y1: ry, x2: xs - 4, y2: ry, class: 'na-tls-relay' }, s);
            svg('text', { x: (xt + 64 + xs) / 2, y: ry - 4, 'text-anchor': 'middle', class: 'na-tls-relayt' }, s, 'relayed in a 2nd tunnel');
          }
        });
        drawPanels(rs);
        warn.hidden = !blocked(); if (blocked()) drawWarn(m);
      }
      function drawWarn(m) {
        NA.clear(warn);
        var code = m.v.reasons.indexOf('expired') >= 0 ? 'NET::ERR_CERT_DATE_INVALID' : m.v.reasons.indexOf('name') >= 0 ? 'NET::ERR_CERT_COMMON_NAME_INVALID' : 'NET::ERR_CERT_AUTHORITY_INVALID';
        var card = el('div', 'na-tls-warn'); card.setAttribute('role', 'alertdialog'); card.setAttribute('aria-label', 'Browser security warning');
        card.appendChild(el('div', 'na-tls-wicon', '⚠'));
        var body = el('div', 'na-tls-wbody');
        body.appendChild(el('h4', null, 'Your connection is not private'));
        body.appendChild(NA.html('p', null, 'Attackers might be trying to steal your information from <b>' + HOST + '</b> (for example passwords or messages).'));
        var ul = el('ul'); m.v.checks.filter(function (c) { return !c.ok; }).forEach(function (c) { ul.appendChild(el('li', null, c.text)); }); body.appendChild(ul);
        body.appendChild(el('div', 'na-tls-wcode', code + '   (Chrome’s wording; other browsers say it differently)'));
        var bt = el('div', 'na-controls tight');
        bt.appendChild(NA.button('Back to safety', 'primary', function () { decide('abort'); }));
        bt.appendChild(NA.button('Proceed anyway (dangerous)', 'danger', function () { decide('proceed'); }));
        body.appendChild(bt); card.appendChild(body); warn.appendChild(card);
      }
      function box(title, cls) { var b = el('div', 'na-tls-pbox ' + (cls || '')); b.appendChild(el('div', 'na-lab', title)); return b; }
      function pre(txt, cls) { var p2 = el('pre', 'na-tls-pre ' + (cls || '')); p2.textContent = txt; return p2; }
      function drawPanels(rs) {
        NA.clear(panels);
        var m = model(), rw = rs[st.step - 1], d = m.d;
        var pb = box('What the browser has'), pe = box(m.mitm && st.decision === 'proceed' ? 'What the attacker sees' : 'What the eavesdropper sees', m.mitm && st.decision === 'proceed' ? 'atk' : '');
        var id = rw ? rw.id : null;
        function line(parent, html) { parent.appendChild(NA.html('div', 'na-tls-line', html)); }
        if (!id) { line(pb, 'Nothing yet — press Step.'); line(pe, 'Nothing yet.'); }
        else if (!st.https) {
          if (id === 'req') { pb.appendChild(pre(REQ)); line(pe, 'Reads the request <b>word for word</b>:'); pe.appendChild(pre(REQ, 'leak')); line(pe, '<span class="bad">The password crosses the network as plain text.</span>'); }
          else { pb.appendChild(pre(RES)); line(pe, 'Reads the response too:'); pe.appendChild(pre(RES, 'leak')); }
        } else {
          if (id === 'hello') { line(pb, 'I speak <b>TLS 1.3</b> (or 1.2). Ciphers I know: <span class="na-mono">TLS_AES_128_GCM_SHA256</span>, <span class="na-mono">TLS_CHACHA20_POLY1305_SHA256</span>.'); line(pb, 'My random number: <span class="na-mono">5f 3a 9c 21 …</span> · I want the site <b>' + HOST + '</b>.'); line(pe, 'Reads the ClientHello: versions, ciphers, the random number and <b>the name of the site</b> (www.example.com).'); line(pe, 'Nothing secret yet.'); }
          else if (id === 'shello') {
            var c = m.cert; pb.appendChild(certCard(c)); line(pe, m.mitm ? 'It is the one <b>sending</b> this certificate — it has its own key pair for it.' : 'Reads the certificate. It is public information (anyone can fetch it); seeing it helps nobody.');
          }
          else if (id === 'check') { m.v.checks.forEach(function (ck) { line(pb, '<span class="' + (ck.ok ? 'ok' : 'bad') + '">' + (ck.ok ? '✓' : '✗') + '</span> ' + NA.esc(ck.text)); }); line(pe, 'Nothing — this check happens <b>inside the browser</b>.'); }
          else if (id === 'abort') { line(pb, 'Connection closed. No HTTP request was ever sent.'); line(pe, 'Learned nothing except that the browser said hello.'); }
          else if (id === 'keyA' || id === 'keyB') { pb.appendChild(dhTable(d, id === 'keyB')); line(pe, 'Sees only <b>p = 23, g = 5, A = ' + d.A + (id === 'keyB' ? ', B = ' + d.B : '') + '</b>.'); line(pe, id === 'keyB' ? (m.mitm && st.decision === 'proceed' ? '<span class="bad">It knows the key: it is one of the two ends of this tunnel.</span>' : 'To get the key she would need a or b: with 23 that is 22 tries; with real 256-bit numbers it is hopeless.') : 'Cannot compute the key yet.'); }
          else if (id === 'fin') { line(pb, 'Both sides now share the key <b>' + d.sharedA + '</b>. “Finished” proves the handshake was not tampered with.'); line(pe, 'Sees only scrambled bytes:'); pe.appendChild(pre(hexShort(m.hexFin), 'scr')); }
          else if (id === 'req') {
            line(pb, 'I write the plain request…'); pb.appendChild(pre(REQ)); line(pb, '…TLS scrambles it with key ' + d.sharedA + ' before sending.');
            if (m.mitm && st.decision === 'proceed') { line(pe, 'Decrypts it with its own key:'); pe.appendChild(pre(REQ, 'leak')); line(pe, '<span class="bad">The attacker has the password — and the padlock was still showing.</span>'); }
            else { line(pe, 'Sees only noise (a toy scrambler here):'); pe.appendChild(pre(hexShort(m.hexReq), 'scr')); }
          }
          else if (id === 'res') {
            line(pb, 'I unscramble the response with the same key:'); pb.appendChild(pre(RES));
            if (m.mitm && st.decision === 'proceed') { line(pe, 'Decrypts, reads, re-encrypts for you:'); pe.appendChild(pre(RES, 'leak')); }
            else { line(pe, 'Sees only noise:'); pe.appendChild(pre(hexShort(m.hexRes), 'scr')); }
          }
        }
        panels.appendChild(pb); panels.appendChild(pe);
      }
      function certCard(c) {
        var t = el('table', 'na-table na-tls-cert');
        [['Subject', c.subject], ['Names', c.names.join(', ')], ['Issued by', c.issuer], ['Chain to', c.selfSigned ? '(none: signed by itself)' : c.chain.join(' → ')], ['Valid', c.notBefore + ' → ' + c.notAfter], ['Serial', c.serial], ['Public key', c.key]].forEach(function (r) { var tr = el('tr'); tr.appendChild(el('th', null, r[0])); tr.appendChild(el('td', null, r[1])); t.appendChild(tr); });
        return el('div', 'na-tbl-scroll', t);
      }
      function dhTable(d, both) {
        var t = el('table', 'na-table na-tls-dh');
        var rows2 = [['public (in the clear)', 'p = ' + d.p + ', g = ' + d.g], ['browser’s secret', 'a = ' + d.a + ' (never sent)'], ['browser sends', 'A = ' + d.g + '^' + d.a + ' mod ' + d.p + ' = ' + d.A]];
        if (both) rows2.push(['server’s secret', 'b = ' + d.b + ' (never sent)'], ['server sends', 'B = ' + d.g + '^' + d.b + ' mod ' + d.p + ' = ' + d.B], ['browser computes', 'B^a mod ' + d.p + ' = ' + d.B + '^' + d.a + ' mod ' + d.p + ' = ' + d.sharedA], ['server computes', 'A^b mod ' + d.p + ' = ' + d.A + '^' + d.b + ' mod ' + d.p + ' = ' + d.sharedB], ['session key', String(d.sharedA) + (d.equal ? '  — the same on both sides ✓' : '')]);
        rows2.forEach(function (r) { var tr = el('tr'); tr.appendChild(el('th', null, r[0])); tr.appendChild(el('td', null, r[1])); t.appendChild(tr); });
        return el('div', 'na-tbl-scroll', t);
      }
      resetAll();
    }

    NA.register('tcp', { title: 'TCP: a connection with promises', hint: 'Open and close a connection, then watch a message survive a lossy line. A simulation with invented addresses.', build: buildTcp });
    NA.register('udp', { title: 'UDP: send and hope', hint: 'The same bad network, with and without TCP’s promises: a video call, a file copy and a DNS question.', build: buildUdp });
    NA.register('tls', { title: 'HTTPS: the TLS handshake', hint: 'Check a certificate, agree on a key with toy numbers, and see what an eavesdropper or an attacker in the middle can read.', build: buildTls });
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = E;
})(typeof window !== 'undefined' ? window : globalThis);
