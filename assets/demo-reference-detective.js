/* Real or Hallucinated? — Reference Detective (CO1005 Chapter 13 demo).
   Part A (pure, exported for Node): verified works, cards, evidence checks, scoring, report card, "Fix the format" questions.
   Part B (UI, below "UI"): judge game, fix-the-format game, teacher-projector mode.
   Real works were checked against Crossref (api.crossref.org/works/<doi>) on 2026-10-18; the fake references are invented
   (titles searched in Crossref: no match; DOIs requested at Crossref and doi.org: HTTP 404; author names are made up). */
(function (global) {
  'use strict';
  var CL = global.CiteLab || (typeof require !== 'undefined' ? require('./cite-lab.js') : null);
  var VERIFIED_ON = '2026-10-18';

  // ───────────── verified real works (data fields are the ones the cite-lab engine formats) ─────────────
  var WORKS = [
    { id: 'dijkstra', type: 'journal', authors: ['Dijkstra, Edsger W.'], year: '1968', month: '3', title: 'Go To Statement Considered Harmful',
      container: 'Communications of the ACM', abbr: 'Commun. ACM', volume: '11', issue: '3', pages: '147-148', doi: '10.1145/362929.362947' },
    { id: 'turing', type: 'journal', authors: ['Turing, A. M.'], year: '1950', month: '10', title: 'Computing Machinery and Intelligence',
      container: 'Mind', abbr: 'Mind', volume: 'LIX', issue: '236', pages: '433-460', doi: '10.1093/mind/LIX.236.433' },
    { id: 'shannon', type: 'journal', authors: ['Shannon, C. E.'], year: '1948', month: '7', title: 'A Mathematical Theory of Communication',
      container: 'Bell System Technical Journal', abbr: 'Bell Syst. Tech. J.', volume: '27', issue: '3', pages: '379-423', doi: '10.1002/j.1538-7305.1948.tb01338.x' },
    { id: 'codd', type: 'journal', authors: ['Codd, E. F.'], year: '1970', month: '6', title: 'A relational model of data for large shared data banks',
      container: 'Communications of the ACM', abbr: 'Commun. ACM', volume: '13', issue: '6', pages: '377-387', doi: '10.1145/362384.362685' },
    { id: 'lecun', type: 'journal', authors: ['LeCun, Y.', 'Bottou, L.', 'Bengio, Y.', 'Haffner, P.'], year: '1998', title: 'Gradient-based learning applied to document recognition',
      container: 'Proceedings of the IEEE', abbr: 'Proc. IEEE', volume: '86', issue: '11', pages: '2278-2324', doi: '10.1109/5.726791' },
    { id: 'dang', type: 'journal', authors: ['Dang, Quoc Phu', 'Tran-Truong, Phat T.', 'Vu, Duc-Ly', 'Nguyen, Long S. T.', 'Vo, Quynh T. N.', 'Quan, Tho'], year: '2026',
      title: 'Enhancing large language model performance for automatic zero-shot multiple-choice question answering via single-token logit prompting',
      container: 'Computers and Education: Artificial Intelligence', abbr: '', volume: '10', articleNo: '100578', doi: '10.1016/j.caeai.2026.100578' },
    { id: 'nguyen', type: 'conference', authors: ['Nguyen, Long S. T.', 'Quan, Tho'], year: '2026',
      title: 'Which works best for Vietnamese? A practical study of information retrieval methods across domains',
      container: 'Findings of the Association for Computational Linguistics: EACL 2026', publisher: 'Association for Computational Linguistics', city: 'Rabat, Morocco',
      pages: '2098-2119', doi: '10.18653/v1/2026.findings-eacl.110', keep: 'Vietnamese' }
  ];
  // DOIs requested at Crossref + doi.org on VERIFIED_ON that answered HTTP 404 (nothing registered)
  var MISSING_DOIS = ['10.1145/3234567.3234568', '10.9999/ijssi.2025.072', '10.1016/j.caeai.2026.100311', '10.1145/362000.362001', '10.1109/5.999999'];
  var FAKE_VENUES = ['International Journal of Synthetic Scholarly Intelligence'];   // no such journal in Crossref's journal list
  var LATEST_VOLUME = { 'computers and education: artificial intelligence': 11 };    // Crossref, VERIFIED_ON
  var INVENTED_NAMES = ['Bramblewick', 'Zorvath', 'Wrenfield', 'Hartigan-Oyelaran', 'Pellegrin-Voss', 'Ashgrove', 'Fennimore', 'Ostrander', 'Quillfeather', 'Marrowby', 'Pellegrin'];

  var CHECKS = ['doi', 'authors', 'venue', 'details'];
  var CHECK_INFO = {
    doi: { label: 'Look up the DOI', short: 'DOI', key: '1' },
    authors: { label: 'Check the author list', short: 'Authors', key: '2' },
    venue: { label: 'Check journal / volume / issue', short: 'Venue', key: '3' },
    details: { label: 'Check year and pages', short: 'Year & pages', key: '4' }
  };
  var CHECK_COST = 5, CHECK_SECONDS = 15;

  var FLAGS = {
    'generic-title': { label: 'Generic, buzzword-heavy title', tip: 'Real titles usually name a specific method, data set or claim. "A Comprehensive Review of Opportunities and Challenges" fits a thousand papers.' },
    'round-pages': { label: 'Round page numbers (100–120, 400–440)', tip: 'Real page ranges are rarely both multiples of ten. Round numbers are what a language model "guesses".' },
    'doi-404': { label: 'The DOI does not exist', tip: 'Paste the DOI into doi.org. A made-up DOI gives "DOI not found" - the quickest single test there is.' },
    'doi-other-paper': { label: 'The DOI points to a different paper', tip: 'A real DOI glued onto the wrong reference. Always compare the title behind the DOI with the title you cite.' },
    'no-doi': { label: 'No DOI, no link, nothing to click', tip: 'Not proof, but every journal article from the last 20 years has a DOI. If you cannot find it, you cannot cite it.' },
    'fake-journal': { label: 'A journal that does not exist', tip: 'Search the journal name on its own. Impressive-sounding names ("International Journal of ...") can be pure invention.' },
    'bad-volume-issue': { label: 'The journal exists, but not that volume / issue', tip: 'Check the journal\'s volume list. Volume 22 of a journal that is at volume 11 cannot exist.' },
    'wrong-year': { label: 'Wrong year', tip: 'Small, believable errors. The year must match the version you read - compare it with the publisher or Crossref record.' },
    'wrong-venue': { label: 'Wrong journal or proceedings', tip: 'The paper is real but was not published there. Check where the DOI actually lands.' },
    'authors-swapped': { label: 'Authors swapped or changed', tip: 'Author order carries meaning (who led the work). Compare the full list with the publisher page.' },
    'wrong-pages': { label: 'Wrong pages', tip: 'Pages that do not match the record are a sign the reference was reconstructed from memory.' },
    'invented-authors': { label: 'Authors nobody has heard of', tip: 'Search the author names together with the topic. No profile, no other papers: be suspicious.' },
    'mashup-title': { label: 'Title that echoes a famous paper', tip: 'Models blend well-known titles ("A relational model ..."). If the title sounds familiar but the details differ, look it up.' },
    'fake-publisher': { label: 'Publisher or book you cannot find', tip: 'Search the title on the publisher\'s site and in a library catalogue (ISBN). A book that nobody lists does not exist.' }
  };
  var GENERIC_WORDS = ['comprehensive', 'complete guide', 'holistic', 'revolutioniz', 'a review', 'challenges', 'opportunities', 'handbook of'];

  // ───────────── helpers ─────────────
  function norm(s) { return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, ''); }
  function normPages(p) { return String(p || '').replace(/\s*[-–—]+\s*/g, '-'); }
  function pagesOf(c) { return c.pages ? normPages(c.pages) : (c.articleNo ? 'Art. ' + c.articleNo : ''); }
  function copy(o) { var r = {}, k; for (k in o) r[k] = o[k]; return r; }
  function workById(id) { for (var i = 0; i < WORKS.length; i++) if (WORKS[i].id === id) return WORKS[i]; return null; }
  function workByTitle(t) { var n = norm(t); for (var i = 0; i < WORKS.length; i++) if (norm(WORKS[i].title) === n) return WORKS[i]; return null; }
  function workByDoi(d) { var n = String(d || '').toLowerCase(); for (var i = 0; i < WORKS.length; i++) if (WORKS[i].doi.toLowerCase() === n) return WORKS[i]; return null; }
  function shortAuthors(w) { var f = w.authors.map(function (a) { return a.split(',')[0]; }); return f.length > 2 ? f[0] + ' et al.' : f.join(' & '); }
  function seededRng(seed) {
    var a = (seed >>> 0) || 1;
    return function () { a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function shuffle(arr, rng) { var a = arr.slice(), i, j, t; for (i = a.length - 1; i > 0; i--) { j = Math.floor(rng() * (i + 1)); t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  // ───────────── comparing a claimed reference with the verified record ─────────────
  var FLAW_CHECK = { doi: 'doi', authors: 'authors', container: 'venue', volume: 'venue', issue: 'venue', year: 'details', pages: 'details' };
  var FLAW_FLAG = { doi: 'doi-other-paper', authors: 'authors-swapped', container: 'wrong-venue', volume: 'bad-volume-issue', issue: 'bad-volume-issue', year: 'wrong-year', pages: 'wrong-pages' };
  function flawsOf(claim, w) {
    var f = [];
    if (claim.authors.join('|') !== w.authors.join('|')) f.push('authors');
    if (norm(claim.doi) !== norm(w.doi)) f.push('doi');
    if (norm(claim.container) !== norm(w.container)) f.push('container');
    if ((claim.volume || '') !== (w.volume || '')) f.push('volume');
    if ((claim.issue || '') !== (w.issue || '')) f.push('issue');
    if ((claim.year || '') !== (w.year || '')) f.push('year');
    if (pagesOf(claim) !== pagesOf(w)) f.push('pages');
    return f;
  }
  function flagsOfFlaws(fl) { var out = []; fl.forEach(function (x) { var g = FLAW_FLAG[x]; if (out.indexOf(g) < 0) out.push(g); }); return out; }
  function derive(claim) {   // truth and flaws computed from stored metadata alone
    var w = workByTitle(claim.title);
    if (!w) return { truth: 'fake', work: null, flaws: [], flags: null };
    var fl = flawsOf(claim, w);
    return { truth: fl.length ? 'wrong' : 'real', work: w, flaws: fl, flags: flagsOfFlaws(fl) };
  }

  // ───────────── cards ─────────────
  function fake(id, claim, flags, ev, why) { return { id: id, truth: 'fake', claim: claim, flags: flags, ev: ev, why: why }; }
  function variant(id, base, patch, truth) { var c = copy(workById(base)); for (var k in patch) c[k] = patch[k]; delete c.id; return { id: id, truth: truth, work: base, claim: c }; }
  var CARDS = [
    variant('r-dijkstra', 'dijkstra', {}, 'real'), variant('r-turing', 'turing', {}, 'real'), variant('r-codd', 'codd', {}, 'real'),
    variant('r-lecun', 'lecun', {}, 'real'), variant('r-dang', 'dang', {}, 'real'), variant('r-nguyen', 'nguyen', {}, 'real'),
    variant('w-shannon-year', 'shannon', { year: '1949' }, 'wrong'),
    variant('w-codd-venue', 'codd', { container: 'ACM Transactions on Database Systems', abbr: 'ACM Trans. Database Syst.' }, 'wrong'),
    variant('w-turing-doi', 'turing', { doi: '10.1002/j.1538-7305.1948.tb01338.x' }, 'wrong'),
    variant('w-nguyen-authors', 'nguyen', { authors: ['Quan, Tho', 'Nguyen, Long S. T.'] }, 'wrong'),
    variant('w-lecun-issue', 'lecun', { issue: '14' }, 'wrong'),
    variant('w-dang-year', 'dang', { year: '2025' }, 'wrong'),
    variant('w-dijkstra-volpages', 'dijkstra', { volume: '12', pages: '147-158' }, 'wrong'),
    fake('f-aied', { type: 'journal', authors: ['Bramblewick, Odalys Q.', 'Zorvath, Ignatius K.'], year: '2023', title: 'Artificial Intelligence in Education: A Comprehensive Review of Opportunities and Challenges',
      container: 'Communications of the ACM', abbr: 'Commun. ACM', volume: '66', issue: '4', pages: '100-120', doi: '10.1145/3234567.3234568', keep: 'Artificial Intelligence' },
      ['generic-title', 'round-pages', 'doi-404', 'invented-authors'],
      { venue: { kind: 'bad', notFound: true, text: 'Communications of the ACM exists and has a volume 66, but a title search inside the journal finds no article with this title.' } },
      'The journal and volume are real, which makes the reference look trustworthy. The title is a generic review-paper title, the pages are round, and the DOI is not registered.'),
    fake('f-eacl', { type: 'conference', authors: ['Wrenfield, Marisol D.', 'Hartigan-Oyelaran, Mabel S.'], year: '2026', title: 'Large language models are zero-shot question answerers: Evidence from Vietnamese classrooms',
      container: 'Findings of the Association for Computational Linguistics: EACL 2026', publisher: 'Association for Computational Linguistics', city: 'Rabat, Morocco', pages: '1180-1195', doi: '', keep: 'Vietnamese' },
      ['no-doi', 'invented-authors'],
      { venue: { kind: 'bad', notFound: true, text: 'The proceedings exist, but a title search restricted to them finds no paper with this title (checked in Crossref).' } },
      'Plausible venue, plausible topic, believable page range - and no DOI. The paper was never published in those proceedings.'),
    fake('f-journal', { type: 'journal', authors: ['Pellegrin-Voss, Ansel T.', 'Wrenfield, Marisol D.'], year: '2025', title: 'Prompt engineering as pedagogy: Measuring citation accuracy in student essays',
      container: 'International Journal of Synthetic Scholarly Intelligence', abbr: 'Int. J. Synth. Scholarly Intell.', volume: '7', issue: '2', pages: '45-63', doi: '10.9999/ijssi.2025.072' },
      ['fake-journal', 'doi-404', 'invented-authors'],
      { venue: { kind: 'bad', notFound: true, text: 'No journal with this name appears in the Crossref journal list. The journal itself is invented.' } },
      'Everything looks complete (volume, issue, pages, DOI) but the journal does not exist, so neither does the article.'),
    fake('f-volume', { type: 'journal', authors: ['Ashgrove, Imelda K.', 'Fennimore, Lucan P.'], year: '2026', title: 'Citation accuracy of chatbots in higher education: A cross-institutional evaluation',
      container: 'Computers and Education: Artificial Intelligence', abbr: '', volume: '22', articleNo: '100311', doi: '10.1016/j.caeai.2026.100311' },
      ['bad-volume-issue', 'doi-404', 'invented-authors'],
      { venue: { kind: 'bad', notFound: true, text: 'Computers and Education: Artificial Intelligence is real, but Crossref lists volumes up to 11 (checked ' + VERIFIED_ON + '). There is no volume 22.' } },
      'A real journal, a believable article number and a DOI in the right publisher format - but the volume does not exist and the DOI is not registered.'),
    fake('f-relational', { type: 'journal', authors: ['Ostrander, Fenwick R.'], year: '1971', month: '3', title: 'A relational model for neural memory banks',
      container: 'Communications of the ACM', abbr: 'Commun. ACM', volume: '14', issue: '3', pages: '210-225', doi: '10.1145/362000.362001' },
      ['mashup-title', 'doi-404', 'invented-authors'],
      { venue: { kind: 'bad', notFound: true, text: 'Communications of the ACM, vol. 14 exists, but no article with this title is listed there.' } },
      'The title blends "A relational model of data ..." (a real 1970 paper) with a modern phrase. It sounds familiar, which is exactly how hallucinated titles fool you.'),
    fake('f-book', { type: 'book', authors: ['Quillfeather, Perpetua J.'], year: '2024', title: 'A practical handbook of trustworthy machine learning ethics', publisher: 'Bright Harbor Press', city: 'Boston, MA, USA', doi: '' },
      ['generic-title', 'no-doi', 'fake-publisher', 'invented-authors'],
      { venue: { kind: 'bad', notFound: true, text: 'No book with this title or publisher turns up in Crossref or in a library catalogue search. "Bright Harbor Press" is invented.' } },
      'A book with a very generic title, an unknown publisher and no identifier. Search the title in a library catalogue before you cite it.'),
    fake('f-ieee', { type: 'journal', authors: ['Marrowby, Tess L.', 'Pellegrin, Oskar V.'], year: '1999', title: 'Neural networks and the reproducibility of document recognition',
      container: 'Proceedings of the IEEE', abbr: 'Proc. IEEE', volume: '87', issue: '3', pages: '400-440', doi: '10.1109/5.999999' },
      ['round-pages', 'doi-404', 'invented-authors'],
      { venue: { kind: 'bad', notFound: true, text: 'Proceedings of the IEEE vol. 87 exists, but no article with this title is listed there.' } },
      'Real journal, plausible year (the era of the famous LeCun paper), round page numbers and an unregistered DOI.')
  ];
  CARDS.forEach(function (c) {
    if (c.truth !== 'fake') c.flags = derive(c.claim).flags;
    c.claim.type = c.claim.type || 'journal';
  });

  // ───────────── evidence checks ─────────────
  function doiLink(d) { return 'https://doi.org/' + d; }
  function searchLink(t) { return 'https://search.crossref.org/search/works?q=' + encodeURIComponent(t) + '&from_ui=yes'; }
  function runCheck(card, which) {
    var c = card.claim, w = workByTitle(c.title), r;
    if (which === 'doi') {
      if (!c.doi) return { kind: 'warn', notFound: false, text: 'No DOI is given. Most scholarly works have one; search for it yourself before trusting the reference.' };
      var rec = workByDoi(c.doi);
      if (rec && w && rec.id === w.id) return { kind: 'ok', notFound: false, text: 'doi.org/' + c.doi + ' resolves to "' + rec.title + '" - the same title as the reference.', link: doiLink(c.doi) };
      if (rec) return { kind: 'bad', notFound: false, text: 'doi.org/' + c.doi + ' resolves to a different paper: "' + rec.title + '" (' + shortAuthors(rec) + ', ' + rec.year + ').', link: doiLink(c.doi) };
      return { kind: 'bad', notFound: true, text: 'doi.org/' + c.doi + ' answers "DOI not found" (HTTP 404). Nothing is registered under this DOI.' };
    }
    if (which === 'authors') {
      if (!w) return { kind: 'warn', notFound: false, text: 'No paper with this title exists, so there is no author list to compare. A search for these names plus the topic finds no researcher working on it (the names are invented).' };
      if (c.authors.join('|') === w.authors.join('|')) return { kind: 'ok', notFound: false, text: 'The author list and order match the record: ' + w.authors.join('; ') + '.' };
      return { kind: 'bad', notFound: false, text: 'The record lists: ' + w.authors.join('; ') + '. The reference says: ' + c.authors.join('; ') + '.' };
    }
    if (which === 'venue') {
      if (!w) return { kind: card.ev.venue.kind, notFound: !!card.ev.venue.notFound, text: card.ev.venue.text };
      r = flawsOf(c, w).filter(function (x) { return FLAW_CHECK[x] === 'venue'; });
      var rv = w.container + (w.volume ? ', vol. ' + w.volume : '') + (w.issue ? ', no. ' + w.issue : '');
      if (!r.length) return { kind: 'ok', notFound: false, text: 'Record: ' + rv + '. The reference agrees.' };
      return { kind: 'bad', notFound: false, text: 'Record: ' + rv + '. The reference says: ' + c.container + (c.volume ? ', vol. ' + c.volume : '') + (c.issue ? ', no. ' + c.issue : '') + '.' };
    }
    if (!w) return { kind: 'warn', notFound: false, text: 'Nothing to compare: with no record, the year and pages cannot be checked. ' + (c.pages && /^(\d+)0-(\d+)0$/.test(normPages(c.pages)) ? 'Note the round page numbers (' + c.pages + ').' : 'Treat them as unverified.') };
    r = flawsOf(c, w).filter(function (x) { return FLAW_CHECK[x] === 'details'; });
    var rd = w.year + ', ' + (w.pages ? 'pp. ' + w.pages : 'article ' + w.articleNo);
    if (!r.length) return { kind: 'ok', notFound: false, text: 'Record: ' + rd + '. The reference agrees.' };
    return { kind: 'bad', notFound: false, text: 'Record: ' + rd + '. The reference says: ' + c.year + ', ' + (c.pages ? 'pp. ' + c.pages : 'article ' + c.articleNo) + '.' };
  }
  // what a careful reader may conclude from the checks opened so far (null = not enough evidence yet)
  function verdictFromEvidence(card, checks) {
    var res = checks.map(function (k) { return runCheck(card, k); });
    if (res.some(function (x) { return x.notFound; })) return 'fake';
    if (res.some(function (x) { return x.kind === 'bad'; })) return 'wrong';
    if (CHECKS.every(function (k) { return checks.indexOf(k) >= 0; }) && res.every(function (x) { return x.kind === 'ok'; })) return 'real';
    return null;
  }
  function subsets() {
    var out = [], m, k;
    for (m = 0; m < 16; m++) { var s = []; for (k = 0; k < 4; k++) if (m & (1 << k)) s.push(CHECKS[k]); out.push(s); }
    return out.sort(function (a, b) { return a.length - b.length; });
  }
  function neededChecks(card) {   // smallest set of checks that proves the true verdict
    var all = subsets();
    for (var i = 0; i < all.length; i++) if (verdictFromEvidence(card, all[i]) === card.truth) return all[i];
    return null;
  }

  // ───────────── scoring ─────────────
  var BASE = 100, GUESS = 40, STREAK_STEP = 10, STREAK_CAP = 5;
  var CRED_START = 80, CRED_MAX = 100;
  var CRED_PENALTY = { 'fake>real': 20, 'wrong>real': 12, 'real>fake': 8, 'real>wrong': 6, 'fake>wrong': 4, 'wrong>fake': 3 };
  function scoreCard(card, verdict, checks, streakBefore) {
    var correct = verdict === card.truth, supported = correct && verdictFromEvidence(card, checks) === card.truth;
    var cost = CHECK_COST * checks.length, base = !correct ? 0 : (supported ? BASE : GUESS);
    var bonus = supported ? STREAK_STEP * Math.min(streakBefore, STREAK_CAP) : 0;
    var cred = correct ? (supported ? 2 : 1) : -CRED_PENALTY[card.truth + '>' + verdict];
    return { correct: correct, supported: supported, points: base - cost + bonus, cost: cost, bonus: bonus, credDelta: cred, streakAfter: correct ? streakBefore + 1 : 0 };
  }
  function playDeck(deck, plays) {   // plays: [{verdict, checks}]
    var score = 0, streak = 0, cred = CRED_START, best = 0, log = [];
    deck.forEach(function (card, i) {
      var p = plays[i], s = scoreCard(card, p.verdict, p.checks, streak);
      score += s.points; streak = s.streakAfter; best = Math.max(best, streak);
      cred = Math.max(0, Math.min(CRED_MAX, cred + s.credDelta));
      log.push({ card: card, verdict: p.verdict, checks: p.checks, result: s });
    });
    return { score: score, credibility: cred, bestStreak: best, log: log, correct: log.filter(function (l) { return l.result.correct; }).length };
  }
  function perfectPlays(deck) { return deck.map(function (c) { return { verdict: c.truth, checks: neededChecks(c) }; }); }
  function maxScore(deck) { return playDeck(deck, perfectPlays(deck)).score; }
  function grade(cred) { return cred >= 90 ? 'A' : cred >= 75 ? 'B' : cred >= 60 ? 'C' : cred >= 40 ? 'D' : 'F'; }

  function buildDeck(seed, n) {
    n = n || 12;
    var rng = seededRng(seed), by = { real: [], wrong: [], fake: [] };
    CARDS.forEach(function (c) { by[c.truth].push(c); });
    var per = Math.floor(n / 3), pick = [];
    ['real', 'wrong', 'fake'].forEach(function (t) { pick = pick.concat(shuffle(by[t], rng).slice(0, per)); });
    var rest = shuffle(CARDS.filter(function (c) { return pick.indexOf(c) < 0; }), rng);
    while (pick.length < n && rest.length) pick.push(rest.shift());
    return shuffle(pick, rng);
  }
  function styleFor(i) { return ['APA', 'IEEE', 'MLA'][i % 3]; }
  function renderData(claim) {
    var d = copy(claim); d.authors = claim.authors.join('\n'); delete d.id; return d;
  }
  function renderRef(card, style) { return CL.render(renderData(card.claim))[style].ref; }

  // ───────────── report card ─────────────
  function report(result) {
    var seen = {}, missed = {}, list = [];
    result.log.forEach(function (l) {
      var c = l.card;
      if (c.truth !== 'real') c.flags.forEach(function (f) { seen[f] = (seen[f] || 0) + 1; if (!l.result.correct) missed[f] = (missed[f] || 0) + 1; });
      if (!l.result.correct) list.push(l);
    });
    var flags = Object.keys(missed).map(function (f) { return { flag: f, missed: missed[f], seen: seen[f], info: FLAGS[f] }; })
      .sort(function (a, b) { return b.missed - a.missed || a.flag.localeCompare(b.flag); });
    var falseAlarms = result.log.filter(function (l) { return l.card.truth === 'real' && l.verdict !== 'real'; }).length;
    return { flags: flags, missedCards: list, falseAlarms: falseAlarms, grade: grade(result.credibility) };
  }

  // ───────────── "Fix the format" (formats come from the cite-lab engine) ─────────────
  function parts(claim) {
    var first = CL._t.parseName(claim.authors[0]), T = CL._t;
    return { first: first, fi: first.family + ', ' + T.initials(first.given), if_: T.initials(first.given) + ' ' + first.family, gf: first.given + ' ' + first.family, many: claim.authors.length };
  }
  var MON = { 'Jan.': 'January', 'Feb.': 'February', 'Mar.': 'March', 'Apr.': 'April', 'Jun.': 'June', 'Jul.': 'July', 'Aug.': 'August', 'Sep.': 'September', 'Oct.': 'October', 'Nov.': 'November', 'Dec.': 'December' };
  function rep(s, a, b) { return s.indexOf(a) >= 0 && a !== b ? s.replace(a, b) : null; }
  var MUTATORS = {
    APA: [
      { id: 'title-case', why: 'APA 7 writes article titles in sentence case: only the first word, the word after a colon and proper nouns are capitalised.',
        f: function (s, w) { var t = CL._t.sentenceCase(w.title, w.keep); return rep(s, t, CL._t.titleCase(w.title)); } },
      { id: 'initials-first', why: 'APA inverts the author: Family name, comma, initials.',
        f: function (s, w) { var p = parts(w); return rep(s, p.fi, p.if_); } },
      { id: 'and-for-ampersand', why: 'APA joins the last two authors with "&", not with the word "and".',
        f: function (s) { return rep(s, ', & ', ', and '); } },
      { id: 'no-parens', why: 'In APA the year goes in parentheses after the authors: (1968).',
        f: function (s, w) { return rep(s, '(' + w.year + ')', w.year); } },
      { id: 'doi-prefix', why: 'APA 7 writes the DOI as a full link: https://doi.org/...',
        f: function (s) { return rep(s, 'https://doi.org/', 'doi:'); } }
    ],
    MLA: [
      { id: 'sentence-case', why: 'MLA 9 keeps titles in title case: every important word is capitalised.',
        f: function (s, w) { var t = CL._t.titleCase(w.title); return rep(s, t, CL._t.sentenceCase(t, w.keep)); } },
      { id: 'not-inverted', why: 'In MLA the first author is inverted: Family name, comma, given names.',
        f: function (s, w) { var p = parts(w); return rep(s, p.first.family + ', ' + p.first.given, p.gf); } },
      { id: 'ampersand', why: 'MLA joins two authors with the word "and", never with "&".',
        f: function (s) { return rep(s, ', and ', ' & '); } },
      { id: 'vol-abbrev', why: 'MLA writes "vol." for volume, followed by the number.',
        f: function (s) { return rep(s, 'vol. ', 'v. '); } },
      { id: 'doi-prefix', why: 'MLA 9 gives the DOI as a link: https://doi.org/...',
        f: function (s) { return rep(s, 'https://doi.org/', 'doi:'); } }
    ],
    IEEE: [
      { id: 'inverted', why: 'IEEE writes initials first, then the family name, with no inversion: E. W. Dijkstra.',
        f: function (s, w) { var p = parts(w); return rep(s, p.if_, p.fi); } },
      { id: 'title-case', why: 'IEEE uses sentence case for article titles (inside quotation marks).',
        f: function (s, w) { var t = CL._t.sentenceCase(w.title, w.keep); return rep(s, t, CL._t.titleCase(w.title)); } },
      { id: 'doi-prefix', why: 'IEEE introduces the DOI with "doi:" and the bare number.',
        f: function (s) { return rep(s, 'doi: ', 'https://doi.org/'); } },
      { id: 'vol-long', why: 'IEEE abbreviates: "vol.", "no.", "pp.".',
        f: function (s) { return rep(s, 'vol. ', 'volume '); } },
      { id: 'month-full', why: 'IEEE abbreviates the month (Mar., Jul., Oct.).',
        f: function (s) { var m = /(Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\./.exec(s); return m ? s.replace(m[0], MON[m[0]]) : null; } }
    ]
  };
  var FIX_STYLES = ['APA', 'MLA', 'IEEE'];
  function fixOptions(work, style, rng) {
    var correct = CL.render(renderData(work))[style].ref, muts = [], list = shuffle(MUTATORS[style], rng);
    for (var i = 0; i < list.length && muts.length < 2; i++) {
      var out = list[i].f(correct, work);
      if (out && out !== correct && muts.every(function (m) { return m.text !== out; })) muts.push({ text: out, why: list[i].why, id: list[i].id });
    }
    var opts = shuffle([{ text: correct, correct: true, why: 'This one follows the ' + style + ' rules for this kind of source.' }].concat(muts), rng);
    return { style: style, workId: work.id, options: opts, answer: opts.findIndex(function (o) { return o.correct; }) };
  }
  function buildFix(seed, n) {
    var rng = seededRng(seed + 7919), out = [], order = shuffle(WORKS, rng), i = 0;
    n = n || 6;
    while (out.length < n) {
      var w = order[i % order.length], st = FIX_STYLES[(i + Math.floor(i / order.length)) % 3];
      out.push(fixOptions(w, st, rng)); i++;
    }
    return out;
  }
  function fixScore(correct, streakBefore) {
    return { points: correct ? BASE + STREAK_STEP * Math.min(streakBefore, STREAK_CAP) : 0, streakAfter: correct ? streakBefore + 1 : 0 };
  }
  function fixMax(n) { var s = 0, i; for (i = 0; i < n; i++) s += fixScore(true, i).points; return s; }

  var API = {
    WORKS: WORKS, CARDS: CARDS, CHECKS: CHECKS, CHECK_INFO: CHECK_INFO, FLAGS: FLAGS, MISSING_DOIS: MISSING_DOIS, FAKE_VENUES: FAKE_VENUES,
    LATEST_VOLUME: LATEST_VOLUME, INVENTED_NAMES: INVENTED_NAMES, GENERIC_WORDS: GENERIC_WORDS, VERIFIED_ON: VERIFIED_ON,
    CHECK_COST: CHECK_COST, CHECK_SECONDS: CHECK_SECONDS, CRED_START: CRED_START,
    derive: derive, runCheck: runCheck, verdictFromEvidence: verdictFromEvidence, neededChecks: neededChecks, subsets: subsets, scoreCard: scoreCard,
    playDeck: playDeck, perfectPlays: perfectPlays, maxScore: maxScore, grade: grade, buildDeck: buildDeck, styleFor: styleFor, renderRef: renderRef,
    report: report, buildFix: buildFix, fixScore: fixScore, fixMax: fixMax, MUTATORS: MUTATORS, FIX_STYLES: FIX_STYLES, fixOptions: fixOptions,
    workById: workById, doiLink: doiLink, searchLink: searchLink, seededRng: seededRng, norm: norm, pagesOf: pagesOf
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.RefDetective = API;

  // ═════════════════════════════ UI ═════════════════════════════
  function mount() {
    var host = document.getElementById('rd-root');
    if (!host) return;
    var VERDICTS = [
      { v: 'fake', label: 'Fake', sub: 'does not exist', key: 'ArrowLeft', arrow: '←', letter: 'F' },
      { v: 'wrong', label: 'Real, wrong details', sub: 'exists, but something is off', key: 'ArrowDown', arrow: '↓', letter: 'W' },
      { v: 'real', label: 'Real', sub: 'checks out', key: 'ArrowRight', arrow: '→', letter: 'R' }
    ];
    var VLABEL = { fake: 'Fake', wrong: 'Real, wrong details', real: 'Real' };
    var KIND_ICON = { ok: '✓', bad: '✗', warn: '!' }, KIND_WORD = { ok: 'matches', bad: 'does not match', warn: 'unverified' };
    var $ = function (tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
    function fmt(node, str) {
      node.textContent = '';
      String(str).split(/(\*[^*]+\*)/).forEach(function (p) {
        if (!p) return;
        if (p.length > 2 && p.charAt(0) === '*' && p.charAt(p.length - 1) === '*') { var i = document.createElement('i'); i.textContent = p.slice(1, -1); node.appendChild(i); } else node.appendChild(document.createTextNode(p));
      });
      return node;
    }
    function save(k, v) { try { localStorage.setItem('co1005-rd-' + k, String(v)); } catch (e) { /* storage unavailable */ } }
    function load(k) { try { return localStorage.getItem('co1005-rd-' + k); } catch (e) { return null; } }
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var state = { mode: 'judge', seed: 1, deck: [], i: 0, opened: [], answered: null, plays: [], streak: 0, score: 0, cred: CRED_START, best: 0, over: false,
      fix: [], fi: 0, fscore: 0, fstreak: 0, fanswer: null, fcorrect: 0,
      t: { i: 0, opened: 0, revealed: false, votes: { fake: 0, wrong: 0, real: 0 }, hist: [] }, big: load('big') === '1', bestScore: +load('best') || 0 };
    var status = $('div', 'sim-status rd-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    function say(t) { status.textContent = t; }

    // ---- shell
    var tabs = $('div', 'rd-tabs'); tabs.setAttribute('role', 'tablist');
    var tabDefs = [['judge', 'Judge the references'], ['fix', 'Fix the format'], ['teacher', 'Teacher mode']], tabBtns = {};
    tabDefs.forEach(function (d, k) {
      var b = $('button', 'rd-tab', d[1]); b.type = 'button'; b.setAttribute('role', 'tab'); tabBtns[d[0]] = b;
      b.addEventListener('click', function () { setMode(d[0]); });
      b.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { var n = (k + (e.key === 'ArrowRight' ? 1 : 2)) % 3; setMode(tabDefs[n][0]); tabBtns[tabDefs[n][0]].focus(); e.stopPropagation(); }
      });
      tabs.appendChild(b);
    });
    var tools = $('div', 'rd-tools');
    var bigBtn = $('button', 'btn ghost small', 'Large text'); bigBtn.type = 'button'; bigBtn.setAttribute('aria-pressed', 'false');
    var newBtn = $('button', 'btn ghost small', 'New game'); newBtn.type = 'button';
    tools.appendChild(bigBtn); tools.appendChild(newBtn);
    var bar = $('div', 'rd-bar'); bar.appendChild(tabs); bar.appendChild(tools);
    var stage = $('div', 'rd-stage');
    host.appendChild(bar); host.appendChild(stage); host.appendChild(status);

    bigBtn.addEventListener('click', function () { state.big = !state.big; save('big', state.big ? 1 : 0); applyBig(); });
    function applyBig() { host.classList.toggle('rd-big', state.big || state.mode === 'teacher'); bigBtn.setAttribute('aria-pressed', String(state.big)); }
    newBtn.addEventListener('click', function () { newGame(state.seed + 1); });

    function setMode(m) {
      state.mode = m;
      Object.keys(tabBtns).forEach(function (k) { tabBtns[k].setAttribute('aria-selected', String(k === m)); tabBtns[k].tabIndex = k === m ? 0 : -1; });
      host.dataset.mode = m; applyBig(); draw();
    }
    function newGame(seed) {
      state.seed = seed; state.deck = buildDeck(seed, 12); state.i = 0; state.opened = []; state.answered = null; state.plays = []; state.streak = 0; state.score = 0;
      state.cred = CRED_START; state.best = 0; state.over = false;
      state.fix = buildFix(seed, 6); state.fi = 0; state.fscore = 0; state.fstreak = 0; state.fanswer = null; state.fcorrect = 0;
      state.t = { i: 0, opened: 0, revealed: false, votes: { fake: 0, wrong: 0, real: 0 }, hist: [] };
      draw(); say('New game. Card 1 of ' + state.deck.length + '.');
    }

    // ---- pieces
    function essayBubble(n, total) {
      var b = $('div', 'rd-chat');
      b.appendChild($('span', 'rd-chat-who', 'AI assistant'));
      b.appendChild($('p', '', 'Here is reference ' + n + ' of ' + total + ' for your essay "From Turing to ChatGPT: how computers learned to answer questions". All of them are real, I promise!'));
      return b;
    }
    function refBlock(card, idx, cls) {
      var wrap = $('div', 'rd-ref ' + (cls || ''));
      var st = styleFor(idx);
      wrap.appendChild($('span', 'rd-ref-style', st + ' style'));
      var t = $('p', 'rd-ref-text'); fmt(t, renderRef(card, st)); wrap.appendChild(t);
      return wrap;
    }
    function checkResult(card, k) {
      var r = runCheck(card, k), row = $('li', 'rd-ev rd-' + r.kind);
      row.appendChild($('span', 'rd-ev-ic', KIND_ICON[r.kind])); row.lastChild.setAttribute('aria-hidden', 'true');
      var body = $('div', 'rd-ev-body');
      body.appendChild($('b', '', CHECK_INFO[k].label + ' - ' + (r.notFound ? 'not found' : KIND_WORD[r.kind])));
      body.appendChild($('span', '', r.text));
      row.appendChild(body);
      return row;
    }
    function checkButtons(card, opened, onOpen, disabled) {
      var row = $('div', 'rd-checks'); row.setAttribute('role', 'group'); row.setAttribute('aria-label', 'Evidence checks');
      CHECKS.forEach(function (k) {
        var b = $('button', 'rd-check' + (opened.indexOf(k) >= 0 ? ' used' : ''));
        b.type = 'button';
        b.appendChild($('span', 'rd-check-k', CHECK_INFO[k].key));
        b.appendChild($('span', 'rd-check-l', CHECK_INFO[k].label));
        if (onOpen) b.appendChild($('span', 'rd-check-c', '-' + CHECK_COST + ' pts · ' + CHECK_SECONDS + ' s'));
        b.disabled = !!disabled || opened.indexOf(k) >= 0;
        b.addEventListener('click', function () { onOpen(k); });
        row.appendChild(b);
      });
      return row;
    }
    function evidenceList(card, opened) {
      var ul = $('ul', 'rd-evlist');
      opened.forEach(function (k) { ul.appendChild(checkResult(card, k)); });
      if (!opened.length) ul.appendChild($('li', 'rd-ev-empty', 'No evidence yet. Judge from the look alone (a lucky guess is worth less), or open a check.'));
      return ul;
    }
    function truthBox(card) {
      var box = $('div', 'rd-truth');
      var h = $('h3', '', 'The truth: ' + VLABEL[card.truth]); box.appendChild(h);
      var w = card.truth === 'fake' ? null : workById(card.work);
      if (card.truth === 'fake') {
        box.appendChild($('p', '', card.why));
        box.appendChild($('p', 'rd-note', 'The authors, publisher and title of this reference are invented for the game; the title was searched in Crossref and the DOI requested (' + VERIFIED_ON + '): no match.'));
      } else if (card.truth === 'wrong') {
        var d = derive(card.claim);
        box.appendChild($('p', '', 'The paper is real, but the reference is wrong in: ' + d.flags.map(function (f) { return FLAGS[f].label.toLowerCase(); }).join('; ') + '.'));
      } else box.appendChild($('p', '', 'Every detail matches the verified record.'));
      if (w) {
        var a = $('a', 'rd-link', 'Verified source: doi.org/' + w.doi); a.href = doiLink(w.doi); a.target = '_blank'; a.rel = 'noopener';
        var p = $('p', ''); p.appendChild(a); box.appendChild(p);
        var rec = $('p', 'rd-note'); rec.textContent = 'Record (Crossref, ' + VERIFIED_ON + '): ' + w.authors.join('; ') + ' (' + w.year + '). ' + w.title + '. ' + w.container + (w.volume ? ', ' + w.volume : '') + (w.issue ? '(' + w.issue + ')' : '') + (w.pages ? ', ' + w.pages : ', ' + w.articleNo) + '.'; box.appendChild(rec);
      } else {
        var s = $('a', 'rd-link', 'Search this title in Crossref yourself'); s.href = searchLink(card.claim.title); s.target = '_blank'; s.rel = 'noopener';
        var p2 = $('p', ''); p2.appendChild(s); box.appendChild(p2);
      }
      if (card.flags.length) {
        var ul = $('ul', 'rd-flags');
        card.flags.forEach(function (f) { var li = $('li', ''); li.appendChild($('b', '', FLAGS[f].label + '. ')); li.appendChild(document.createTextNode(FLAGS[f].tip)); ul.appendChild(li); });
        box.appendChild($('h4', '', 'Red flags you could have spotted')); box.appendChild(ul);
      }
      return box;
    }
    function checklist() {
      var d = $('details', 'rd-list');
      d.appendChild($('summary', '', 'How to verify a reference in 60 seconds'));
      var ol = $('ol', '');
      ['Paste the DOI into doi.org (15 s). "DOI not found" ends the search. A different title behind the DOI ends it too.',
        'No DOI? Search the exact title in quotes at search.crossref.org or Google Scholar (15 s). No hit: treat it as fake until proven otherwise.',
        'Open the real page and compare authors, journal, volume, issue, year and pages with the reference, one by one (15 s). Any difference means you fix it or drop it.',
        'Check the journal itself: does it exist, and does that volume exist? Then decide: cite the real record, never the AI\'s version (15 s).'
      ].forEach(function (t) { ol.appendChild($('li', '', t)); });
      d.appendChild(ol);
      d.appendChild($('p', 'rd-note', 'Four steps, 15 seconds each: that is exactly the price of the four checks in the game.'));
      return d;
    }
    function meter(label, value, max, cls) {
      var w = $('div', 'rd-meter ' + (cls || ''));
      w.appendChild($('span', 'rd-meter-l', label));
      var track = $('div', 'rd-meter-track'); track.setAttribute('role', 'meter'); track.setAttribute('aria-label', label);
      track.setAttribute('aria-valuemin', '0'); track.setAttribute('aria-valuemax', String(max)); track.setAttribute('aria-valuenow', String(value));
      var fill = $('div', 'rd-meter-fill'); fill.style.width = Math.round(100 * value / max) + '%';
      fill.dataset.level = value >= 75 ? 'hi' : value >= 40 ? 'mid' : 'lo';
      track.appendChild(fill); w.appendChild(track); w.appendChild($('span', 'rd-meter-v', String(value)));
      return w;
    }

    // ───── judge mode
    function drawJudge() {
      stage.textContent = '';
      if (state.over) return drawReport();
      var card = state.deck[state.i], n = state.deck.length;
      var hud = $('div', 'rd-hud');
      hud.appendChild(stat('Card', (state.i + 1) + ' / ' + n));
      hud.appendChild(stat('Score', String(state.score)));
      hud.appendChild(stat('Streak', state.streak ? 'x' + state.streak : '0'));
      hud.appendChild(stat('Time spent', (state.plays.reduce(function (a, p) { return a + p.checks.length; }, 0) + (state.answered ? 0 : state.opened.length)) * CHECK_SECONDS + ' s'));
      hud.appendChild(meter('Essay credibility', state.cred, 100));
      stage.appendChild(hud);
      stage.appendChild(essayBubble(state.i + 1, n));
      var area = $('div', 'rd-card-area');
      var ref = refBlock(card, state.i, 'rd-swipe'); ref.tabIndex = 0;
      ref.setAttribute('aria-label', 'Reference card. Swipe left for fake, right for real, down for real with wrong details.');
      area.appendChild(ref); stage.appendChild(area);
      attachSwipe(ref);
      stage.appendChild(checkButtons(card, state.opened, function (k) { openCheck(k); }, state.answered));
      stage.appendChild(evidenceList(card, state.opened));
      if (!state.answered) {
        var vb = $('div', 'rd-verdicts'); vb.setAttribute('role', 'group'); vb.setAttribute('aria-label', 'Your verdict');
        VERDICTS.forEach(function (d) {
          var b = $('button', 'rd-verdict v-' + d.v); b.type = 'button';
          b.appendChild($('span', 'rd-verdict-a', d.arrow)); b.appendChild($('b', '', d.label)); b.appendChild($('small', '', d.sub));
          b.addEventListener('click', function () { answer(d.v); });
          vb.appendChild(b);
        });
        stage.appendChild(vb);
        stage.appendChild($('p', 'rd-hint', 'Keys: 1-4 open a check; arrow keys or F / W / R give your verdict. On a touch screen, swipe the card.'));
      } else {
        var s = state.answered, res = $('div', 'rd-result ' + (s.result.correct ? 'good' : 'badr'));
        res.appendChild($('b', '', (s.result.correct ? 'Correct. ' : 'Not quite. ') + 'You said "' + VLABEL[s.verdict] + '".'));
        res.appendChild($('span', '', ' ' + (s.result.points >= 0 ? '+' : '') + s.result.points + ' pts' + (s.result.bonus ? ' (streak bonus +' + s.result.bonus + ')' : '') + (s.result.correct && !s.result.supported ? ' (a guess: the evidence you opened did not prove it)' : '') + ' · credibility ' + (s.result.credDelta >= 0 ? '+' : '') + s.result.credDelta));
        stage.appendChild(res); stage.appendChild(truthBox(card));
        var nx = $('button', 'btn primary rd-next', state.i + 1 < n ? 'Next reference (Enter)' : 'See the report card (Enter)'); nx.type = 'button';
        nx.addEventListener('click', next); stage.appendChild(nx);
        setTimeout(function () { nx.focus(); }, 0);
      }
      stage.appendChild(checklist());
    }
    function stat(l, v) { var s = $('div', 'rd-stat'); s.appendChild($('span', 'rd-stat-l', l)); s.appendChild($('b', 'rd-stat-v', v)); return s; }
    function openCheck(k) {
      if (state.answered || state.opened.indexOf(k) >= 0) return;
      state.opened.push(k); drawJudge();
      var r = runCheck(state.deck[state.i], k); say(CHECK_INFO[k].label + ': ' + KIND_WORD[r.kind] + '. ' + r.text);
      var btn = stage.querySelectorAll('.rd-check')[Math.min(CHECKS.indexOf(k) + 1, 3)]; if (btn && !btn.disabled) btn.focus();
    }
    function answer(v) {
      if (state.answered || state.over) return;
      var card = state.deck[state.i], r = scoreCard(card, v, state.opened.slice(), state.streak);
      state.score += r.points; state.streak = r.streakAfter; state.best = Math.max(state.best, state.streak);
      state.cred = Math.max(0, Math.min(CRED_MAX, state.cred + r.credDelta));
      state.plays.push({ card: card, verdict: v, checks: state.opened.slice(), result: r });
      state.answered = { verdict: v, result: r };
      drawJudge(); say((r.correct ? 'Correct. ' : 'Wrong. ') + 'The truth: ' + VLABEL[card.truth] + '. Score ' + state.score + '. Essay credibility ' + state.cred + '.');
    }
    function next() {
      if (!state.answered) return;
      if (state.i + 1 >= state.deck.length) { state.over = true; if (state.score > state.bestScore) { state.bestScore = state.score; save('best', state.score); } drawJudge(); say('Round finished. Score ' + state.score + ' of ' + maxScore(state.deck) + '.'); return; }
      state.i++; state.opened = []; state.answered = null; drawJudge();
      say('Reference ' + (state.i + 1) + ' of ' + state.deck.length + '.');
      var r = stage.querySelector('.rd-swipe'); if (r) r.focus({ preventScroll: true });
    }
    function attachSwipe(el) {
      var sx = 0, sy = 0, down = false;
      el.addEventListener('pointerdown', function (e) { if (state.answered) return; down = true; sx = e.clientX; sy = e.clientY; try { el.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } });
      el.addEventListener('pointermove', function (e) { if (!down) return; var dx = e.clientX - sx; el.style.transform = reduce ? '' : 'translateX(' + Math.max(-60, Math.min(60, dx / 3)) + 'px) rotate(' + Math.max(-4, Math.min(4, dx / 40)) + 'deg)'; });
      function end(e) {
        if (!down) return; down = false; el.style.transform = '';
        var dx = e.clientX - sx, dy = e.clientY - sy;
        if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy)) answer(dx < 0 ? 'fake' : 'real');
        else if (dy > 80 && dy > Math.abs(dx)) answer('wrong');
      }
      el.addEventListener('pointerup', end); el.addEventListener('pointercancel', function () { down = false; el.style.transform = ''; });
    }
    function drawReport() {
      var res = playDeck(state.deck, state.plays), rp = report(res), max = maxScore(state.deck);
      var box = $('div', 'rd-report');
      box.appendChild($('h2', '', 'Report card'));
      var top = $('div', 'rd-hud');
      top.appendChild(stat('Score', state.score + ' / ' + max)); top.appendChild(stat('Correct', res.correct + ' / ' + state.deck.length));
      top.appendChild(stat('Best streak', 'x' + res.bestStreak)); top.appendChild(stat('Essay credibility grade', rp.grade));
      top.appendChild(meter('Essay credibility', res.credibility, 100)); box.appendChild(top);
      box.appendChild($('p', 'rd-note', 'Personal best on this browser: ' + state.bestScore + ' points. The maximum is reached by opening only the checks that prove the verdict.'));
      var msg = rp.grade === 'A' || rp.grade === 'B' ? 'Your essay would survive a marker who checks the bibliography.' : rp.grade === 'C' ? 'Some of your sources would make a marker suspicious.' : 'A marker who checks even three of these references would question the whole essay.';
      box.appendChild($('p', 'rd-lead', msg));
      if (rp.flags.length) {
        box.appendChild($('h3', '', 'Red flags you missed'));
        var ul = $('ul', 'rd-flags');
        rp.flags.forEach(function (f) { var li = $('li', ''); li.appendChild($('b', '', f.info.label + ' (missed in ' + f.missed + ' of ' + f.seen + ' cards). ')); li.appendChild(document.createTextNode(f.info.tip)); ul.appendChild(li); });
        box.appendChild(ul);
      } else box.appendChild($('p', 'rd-lead', 'No red flag slipped past you. Remember the habit, not the cards: verify every time.'));
      if (rp.falseAlarms) box.appendChild($('p', '', 'False alarms: you rejected ' + rp.falseAlarms + ' good reference(s). Checking every field (DOI, authors, venue, year and pages) is how you prove a reference is real.'));
      if (rp.missedCards.length) {
        box.appendChild($('h3', '', 'Cards you got wrong'));
        var l2 = $('ul', 'rd-miss');
        rp.missedCards.forEach(function (l) { var li = $('li', ''); var t = $('span', 'rd-miss-ref'); fmt(t, renderRef(l.card, styleFor(state.deck.indexOf(l.card)))); li.appendChild(t); li.appendChild($('small', '', 'You said "' + VLABEL[l.verdict] + '"; truth: "' + VLABEL[l.card.truth] + '".')); l2.appendChild(li); });
        box.appendChild(l2);
      }
      var again = $('button', 'btn primary', 'Play again with a new deck'); again.type = 'button'; again.addEventListener('click', function () { newGame(state.seed + 1); });
      box.appendChild(again); box.appendChild(checklist());
      stage.appendChild(box);
    }

    // ───── fix the format
    function drawFix() {
      stage.textContent = '';
      var n = state.fix.length;
      if (state.fi >= n) {
        var box = $('div', 'rd-report'); box.appendChild($('h2', '', 'Format check finished'));
        var hud = $('div', 'rd-hud'); hud.appendChild(stat('Score', state.fscore + ' / ' + fixMax(n))); hud.appendChild(stat('Correct', state.fcorrect + ' / ' + n)); box.appendChild(hud);
        box.appendChild($('p', 'rd-lead', 'A perfect format is not enough: a reference can be beautifully formatted and still be fake. Use both skills together.'));
        var again = $('button', 'btn primary', 'Play again'); again.type = 'button'; again.addEventListener('click', function () { newGame(state.seed + 1); setMode('fix'); });
        box.appendChild(again); stage.appendChild(box); return;
      }
      var q = state.fix[state.fi], w = workById(q.workId);
      var hud2 = $('div', 'rd-hud'); hud2.appendChild(stat('Question', (state.fi + 1) + ' / ' + n)); hud2.appendChild(stat('Score', String(state.fscore))); hud2.appendChild(stat('Streak', state.fstreak ? 'x' + state.fstreak : '0'));
      stage.appendChild(hud2);
      var h = $('h2', 'rd-q', 'Which one is correctly formatted in ' + q.style + '?'); stage.appendChild(h);
      stage.appendChild($('p', 'rd-note', 'The same real work (' + shortAuthors(w) + ', ' + w.year + '), three versions. Two of them break one rule of the style.'));
      var list = $('div', 'rd-opts'); list.setAttribute('role', 'group'); list.setAttribute('aria-label', 'Options');
      q.options.forEach(function (o, k) {
        var b = $('button', 'rd-opt'); b.type = 'button'; b.appendChild($('span', 'rd-opt-k', String.fromCharCode(65 + k)));
        var t = $('span', 'rd-opt-t'); fmt(t, o.text); b.appendChild(t);
        if (state.fanswer !== null) {
          b.disabled = true; b.classList.add(o.correct ? 'right' : 'other'); if (state.fanswer === k) b.classList.add('picked');
          b.appendChild($('span', 'rd-opt-why', (o.correct ? 'Correct. ' : (state.fanswer === k ? 'Your pick. ' : '')) + o.why));
        }
        b.addEventListener('click', function () { fixAnswer(k); });
        list.appendChild(b);
      });
      stage.appendChild(list);
      if (state.fanswer !== null) {
        var nx = $('button', 'btn primary rd-next', state.fi + 1 < n ? 'Next question (Enter)' : 'Finish (Enter)'); nx.type = 'button';
        nx.addEventListener('click', fixNext); stage.appendChild(nx); setTimeout(function () { nx.focus(); }, 0);
      } else stage.appendChild($('p', 'rd-hint', 'Keys: A, B or C.'));
    }
    function fixAnswer(k) {
      if (state.fanswer !== null) return;
      var q = state.fix[state.fi], ok = k === q.answer, s = fixScore(ok, state.fstreak);
      state.fanswer = k; state.fscore += s.points; state.fstreak = s.streakAfter; if (ok) state.fcorrect++;
      drawFix(); say(ok ? 'Correct. Option ' + String.fromCharCode(65 + k) + ' is the properly formatted one.' : 'Not quite. The correct one is option ' + String.fromCharCode(65 + q.answer) + '.');
    }
    function fixNext() { if (state.fanswer === null) return; state.fi++; state.fanswer = null; drawFix(); }

    // ───── teacher / projector mode
    function drawTeacher() {
      stage.textContent = '';
      var T = state.t, deck = state.deck, card = deck[T.i], st = styleFor(T.i);
      var head = $('div', 'rd-t-head');
      head.appendChild($('span', 'rd-t-count', 'Reference ' + (T.i + 1) + ' of ' + deck.length));
      var tally = state.t.hist.filter(function (h) { return h.ok; }).length;
      head.appendChild($('span', 'rd-t-class', 'Class: ' + tally + ' of ' + state.t.hist.length + ' cards judged correctly'));
      stage.appendChild(head);
      stage.appendChild(refBlock(card, T.i, 'rd-t-ref'));
      var opened = CHECKS.slice(0, T.opened);
      var cb = checkButtons(card, opened, function (k) { if (T.opened < 4 && !T.revealed) { T.opened = Math.max(T.opened, CHECKS.indexOf(k) + 1); drawTeacher(); } }, T.revealed);
      stage.appendChild(cb);
      stage.appendChild(evidenceList(card, opened));
      var vr = $('div', 'rd-votes'); vr.setAttribute('role', 'group'); vr.setAttribute('aria-label', 'Class votes (raise hands, then count)');
      var total = T.votes.fake + T.votes.wrong + T.votes.real;
      VERDICTS.forEach(function (d) {
        var col = $('div', 'rd-vote v-' + d.v), c = T.votes[d.v];
        col.appendChild($('b', 'rd-vote-l', d.letter + ' · ' + d.label));
        col.appendChild($('span', 'rd-vote-n', String(c)));
        var barw = $('div', 'rd-vote-bar'); var f = $('div', 'rd-vote-fill'); f.style.width = (total ? Math.round(100 * c / total) : 0) + '%'; barw.appendChild(f); col.appendChild(barw);
        var row = $('div', 'rd-vote-btns');
        var plus = $('button', 'btn small', '+1'), minus = $('button', 'btn ghost small', '-1'); plus.type = minus.type = 'button';
        plus.setAttribute('aria-label', 'Add a vote for ' + d.label); minus.setAttribute('aria-label', 'Remove a vote for ' + d.label);
        plus.disabled = minus.disabled = T.revealed;
        plus.addEventListener('click', function () { T.votes[d.v]++; drawTeacher(); });
        minus.addEventListener('click', function () { T.votes[d.v] = Math.max(0, T.votes[d.v] - 1); drawTeacher(); });
        row.appendChild(plus); row.appendChild(minus); col.appendChild(row); vr.appendChild(col);
      });
      stage.appendChild(vr);
      var acts = $('div', 'rd-t-acts');
      var rev = $('button', 'btn primary', T.revealed ? 'Revealed' : 'Reveal the truth (Space)'); rev.type = 'button'; rev.disabled = T.revealed;
      rev.addEventListener('click', tReveal);
      var prev = $('button', 'btn ghost', '← Previous'); prev.type = 'button'; prev.disabled = T.i === 0; prev.addEventListener('click', function () { tGo(-1); });
      var nxt = $('button', 'btn ghost', 'Next →'); nxt.type = 'button'; nxt.disabled = T.i + 1 >= deck.length; nxt.addEventListener('click', function () { tGo(1); });
      acts.appendChild(prev); acts.appendChild(rev); acts.appendChild(nxt); stage.appendChild(acts);
      stage.appendChild($('p', 'rd-hint', 'Lecturer keys: 1-4 reveal the next checks, F / W / R add a vote, Space reveals the truth, ← / → move between cards.'));
      if (T.revealed) {
        var majority = ['fake', 'wrong', 'real'].reduce(function (a, k) { return T.votes[k] > T.votes[a] ? k : a; }, 'real');
        var res = $('div', 'rd-result ' + (total && majority === card.truth && T.votes[majority] > 0 ? 'good' : 'badr'));
        res.appendChild($('b', '', total ? 'The class majority said "' + VLABEL[majority] + '". ' + (majority === card.truth ? 'Correct.' : 'Not quite.') : 'No votes were entered. '));
        stage.appendChild(res); stage.appendChild(truthBox(card));
      }
    }
    function tReveal() {
      var T = state.t; if (T.revealed) return;
      T.revealed = true; T.opened = 4;
      var card = state.deck[T.i], tot = T.votes.fake + T.votes.wrong + T.votes.real;
      var maj = ['fake', 'wrong', 'real'].reduce(function (a, k) { return T.votes[k] > T.votes[a] ? k : a; }, 'real');
      if (tot) T.hist.push({ i: T.i, ok: maj === card.truth });
      drawTeacher(); say('The truth: ' + VLABEL[card.truth]);
    }
    function tGo(d) {
      var T = state.t, n = T.i + d; if (n < 0 || n >= state.deck.length) return;
      T.i = n; T.opened = 0; T.revealed = false; T.votes = { fake: 0, wrong: 0, real: 0 }; drawTeacher(); say('Reference ' + (T.i + 1) + ' of ' + state.deck.length);
    }

    function draw() { if (state.mode === 'judge') drawJudge(); else if (state.mode === 'fix') drawFix(); else drawTeacher(); }

    document.addEventListener('keydown', function (e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      var tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target && e.target.getAttribute && e.target.getAttribute('role') === 'tab')) return;
      var k = e.key;
      if (state.mode === 'judge' && !state.over) {
        if (!state.answered) {
          if (k >= '1' && k <= '4') { openCheck(CHECKS[+k - 1]); e.preventDefault(); }
          else if (k === 'ArrowLeft' || k.toLowerCase() === 'f') { answer('fake'); e.preventDefault(); }
          else if (k === 'ArrowRight' || k.toLowerCase() === 'r') { answer('real'); e.preventDefault(); }
          else if (k === 'ArrowDown' || k.toLowerCase() === 'w') { answer('wrong'); e.preventDefault(); }
        } else if (k === 'Enter' && tag !== 'BUTTON') { next(); e.preventDefault(); }
      } else if (state.mode === 'fix') {
        if (state.fanswer === null && /^[abc]$/i.test(k) && state.fi < state.fix.length) { fixAnswer(k.toLowerCase().charCodeAt(0) - 97); }
        else if (k === 'Enter' && state.fanswer !== null && tag !== 'BUTTON') { fixNext(); e.preventDefault(); }
      } else if (state.mode === 'teacher') {
        var T = state.t;
        if (k >= '1' && k <= '4' && !T.revealed) { T.opened = Math.max(T.opened, +k); drawTeacher(); e.preventDefault(); }
        else if (!T.revealed && 'fwr'.indexOf(k.toLowerCase()) >= 0 && k.length === 1) { T.votes[{ f: 'fake', w: 'wrong', r: 'real' }[k.toLowerCase()]]++; drawTeacher(); }
        else if (k === ' ' && tag !== 'BUTTON') { tReveal(); e.preventDefault(); }
        else if (k === 'ArrowRight') { tGo(1); e.preventDefault(); } else if (k === 'ArrowLeft') { tGo(-1); e.preventDefault(); }
      }
    });

    newGame(1); setMode('judge');
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
  }
})(typeof window !== 'undefined' ? window : globalThis);
