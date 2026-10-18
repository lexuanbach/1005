/* Citation Workshop — mini app for CO1005 Chapter 13 (Citation & Responsible AI).
   Panel 1  Reference builder : one form -> APA 7, MLA 9 and IEEE reference + in-text form, with hints.
   Panel 2  Spot the mistake  : flawed references built from the same real works.
   Panel 3  Paraphrase check  : a transparent 4-gram overlap heuristic (NOT a plagiarism detector).
   Mount point: #cite-root. The engine (everything above "UI") is pure and exported for Node tests.

   Rules implemented (checked, see the chapter's "Sources I checked" list):
   - APA 7: initials after the family name, (Year), sentence-case titles, italic container/volume,
     "&" before the last author, DOI as https://doi.org/..., "Article N" instead of pages.
   - MLA 9: full given names, 3+ authors -> "et al.", title case, container elements separated by commas,
     article numbers are left out, DOI as https://doi.org/...
   - IEEE (Reference Guide v3.28.2025): initials before the family name, [n], sentence-case titles in
     quotes with the comma inside the quotes, abbreviated journal title, "Art. no.", "doi: ...",
     "Accessed: Mon. D, YYYY. [Online]. Available: URL".
   - Generative AI: MLA Style Center (updated 13 Aug 2025) and APA Style blog (9 Sep 2025); IEEE has no
     reference format for chatbot output, only the author-disclosure rule. */
(function (global) {
  'use strict';

  // ───────────── small helpers ─────────────
  var MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var MONTHS_MLA = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];
  var MONTHS_IEEE = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'];

  function clean(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
  function addDot(s) { return /[.?!]$/.test(s) ? s : s + '.'; }
  function strip(s) { return String(s).replace(/\*/g, ''); }   // plain text of an italic-marked string

  function ordinal(e) {
    var m = /^(\d+)/.exec(clean(e));
    if (!m) return clean(e);
    var n = parseInt(m[1], 10);
    if (n <= 1) return '';
    var v = n % 100, suf = 'th';
    if (v < 11 || v > 13) suf = { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th';
    return n + suf;
  }
  function dashPages(p) { return clean(p).replace(/\s*[-‐-―]+\s*/g, '–'); }
  function pagesLabel(p) { return p ? (p.indexOf('–') >= 0 ? 'pp. ' : 'p. ') + p : ''; }
  function normDoi(s) {
    return clean(s).replace(/^(https?:\/\/)?(dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '');
  }
  function stripProtocol(u) { return clean(u).replace(/^https?:\/\//i, ''); }
  function parseDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean(iso));
    return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
  }
  function lines(s) { return String(s || '').split(/\n/).map(clean).filter(Boolean); }

  // ───────────── names ─────────────
  function parseName(line) {
    var s = clean(line), comma = s.indexOf(',');
    if (comma >= 0) return { family: clean(s.slice(0, comma)), given: clean(s.slice(comma + 1)), noComma: false, raw: s };
    var w = s.split(' ');
    if (w.length === 1) return { family: s, given: '', noComma: false, raw: s };
    return { family: w[w.length - 1], given: w.slice(0, -1).join(' '), noComma: true, raw: s };
  }
  function initials(given) {
    var toks = clean(given).replace(/\./g, '. ').split(/\s+/).filter(Boolean);
    return toks.map(function (t) {
      return t.split('-').filter(Boolean).map(function (p) { return p.charAt(0).toUpperCase() + '.'; }).join('-');
    }).join(' ');
  }
  function initialsOnly(given) {
    var toks = clean(given).replace(/\./g, ' ').split(/\s+/).filter(Boolean);
    return toks.length > 0 && toks.every(function (t) { return t.length <= 1 || /^[A-Z]{1,3}$/.test(t); });
  }
  function nameIF(n) { return n.given ? initials(n.given) + ' ' + n.family : n.family; }    // IEEE / APA editors
  function nameFI(n) { return n.given ? n.family + ', ' + initials(n.given) : n.family; }   // APA
  function nameGF(n) { return n.given ? n.given + ' ' + n.family : n.family; }               // MLA 2nd+

  function apaAuthors(ns) {
    var a = ns.map(nameFI), k = a.length;
    if (k === 1) return a[0];
    if (k === 2) return a[0] + ', & ' + a[1];
    if (k <= 20) return a.slice(0, k - 1).join(', ') + ', & ' + a[k - 1];
    return a.slice(0, 19).join(', ') + ', . . . ' + a[k - 1];
  }
  function mlaAuthors(ns) {
    var k = ns.length, first = ns[0].given ? ns[0].family + ', ' + ns[0].given : ns[0].family;
    if (k === 1) return first;
    if (k === 2) return first + ', and ' + nameGF(ns[1]);
    return first + ', et al.';
  }
  function ieeeAuthors(ns) {
    var a = ns.map(nameIF), k = a.length;
    if (k === 1) return a[0];
    if (k === 2) return a[0] + ' and ' + a[1];
    if (k <= 6) return a.slice(0, k - 1).join(', ') + ', and ' + a[k - 1];
    return a[0] + ' et al.';
  }
  function apaEditors(ns) {
    var a = ns.map(nameIF), k = a.length, s;
    if (k === 1) s = a[0]; else if (k === 2) s = a[0] + ' & ' + a[1]; else s = a.slice(0, k - 1).join(', ') + ', & ' + a[k - 1];
    return s + (k > 1 ? ' (Eds.)' : ' (Ed.)');
  }
  function mlaEditors(ns) {
    var a = ns.map(nameGF), k = a.length;
    if (k === 1) return a[0];
    if (k === 2) return a[0] + ' and ' + a[1];
    return a[0] + ' et al.';
  }
  function ieeeEditors(ns) {
    var a = ns.map(nameIF), k = a.length, s;
    if (k === 1) s = a[0]; else if (k === 2) s = a[0] + ' and ' + a[1]; else s = a.slice(0, k - 1).join(', ') + ', and ' + a[k - 1];
    return s + (k > 1 ? ', Eds.' : ', Ed.');
  }
  function surnames(ns, sep2) {
    var k = ns.length;
    if (k === 1) return ns[0].family;
    if (k === 2) return ns[0].family + sep2 + ns[1].family;
    return ns[0].family + ' et al.';
  }

  // ───────────── titles ─────────────
  var SMALL = ['a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'so', 'yet', 'at', 'by', 'in', 'of', 'on', 'to', 'up', 'as', 'via', 'per',
    'with', 'from', 'into', 'onto', 'over', 'under', 'than', 'across', 'about', 'between', 'through', 'against', 'among', 'after', 'before', 'during', 'within', 'without', 'upon', 'vs'];

  // 'upper' (ALL CAPS), 'title' (every long non-first word capitalised) or 'sentence'
  function detectCase(t) {
    var letters = t.replace(/[^A-Za-z]/g, '');
    if (letters.length > 3 && letters === letters.toUpperCase()) return 'upper';
    var words = t.split(/\s+/).slice(1).filter(function (w) { return w.replace(/[^A-Za-z]/g, '').length >= 4; });
    if (!words.length) return 'sentence';
    var caps = words.filter(function (w) { return /^[^A-Za-z]*[A-Z]/.test(w); }).length;
    return caps === words.length ? 'title' : 'sentence';
  }
  function keepSet(keep) {
    var m = {};
    String(keep || '').split(',').forEach(function (k) { k = clean(k); if (k) m[k.toLowerCase()] = k; });
    return m;
  }
  function isAcronym(w) {
    var core = w.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9+#]+$/g, '');
    var letters = core.replace(/[^A-Za-z]/g, '');
    if (!letters.length) return /\d/.test(core);
    if (/[a-z]/.test(core.slice(1)) && /[A-Z]/.test(core.slice(1))) return true;     // iPhone, GPT-4o style
    if (letters === letters.toUpperCase() && (letters.length >= 2 || /[^A-Za-z]/.test(core))) return true;
    return core === 'I';
  }
  function bareOf(p) { return p.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9+#]+$/g, ''); }
  function sentenceCase(t, keep) {
    t = clean(t);
    var kind = detectCase(t);
    if (kind === 'sentence') return t;
    var ks = keepSet(keep), out = [], boundary = true;
    t.split(' ').forEach(function (w) {
      var res = w.split('-').map(function (p, j) {
        var bare = bareOf(p), low = bare.toLowerCase();
        if (ks[low]) return p.replace(bare, ks[low]);
        if (kind === 'title' && isAcronym(p)) return p;        // LLM, C++, GPT-4o
        var lower = p.toLowerCase();
        if (j === 0 && boundary) return lower.replace(/[a-z]/, function (c) { return c.toUpperCase(); });
        return lower;
      }).join('-');
      out.push(res);
      boundary = /[:?!]$/.test(w);
    });
    return out.join(' ');
  }
  function titleCase(t) {
    t = clean(t);
    var kind = detectCase(t);
    if (kind === 'title') return t;
    if (kind === 'upper') t = t.toLowerCase();
    var words = t.split(' '), n = words.length, boundary = true;
    return words.map(function (w, i) {
      var res = w.split('-').map(function (p, j) {
        var bare = bareOf(p);
        if (!bare) return p;
        if (isAcronym(p) || /[A-Z]/.test(bare.slice(1))) return p;
        var edge = j === 0 && (boundary || i === 0 || i === n - 1);
        if (j === 0 && isSmall(bare) && !edge) return p.toLowerCase();
        return p.replace(/[A-Za-z]/, function (c) { return c.toUpperCase(); });
      }).join('-');
      boundary = /[:?!]$/.test(w);
      return res;
    }).join(' ');
  }
  function isSmall(w) { return SMALL.indexOf(w.toLowerCase()) >= 0; }

  // ───────────── dates ─────────────
  function dateParts(d) {
    var y = clean(d.year), m = parseInt(d.month, 10) || 0, dd = parseInt(d.day, 10) || 0;
    if (!m) dd = 0;
    return { y: y, m: m, d: dd };
  }
  function apaDate(d) {
    var p = dateParts(d); if (!p.y) return 'n.d.';
    var s = p.y; if (p.m) s += ', ' + MONTHS_FULL[p.m - 1] + (p.d ? ' ' + p.d : '');
    return s;
  }
  function mlaDate(d) {
    var p = dateParts(d); if (!p.y) return '';
    if (!p.m) return p.y;
    return (p.d ? p.d + ' ' : '') + MONTHS_MLA[p.m - 1] + ' ' + p.y;
  }
  function ieeeDate(d) {
    var p = dateParts(d); if (!p.y) return '';
    if (!p.m) return p.y;
    return MONTHS_IEEE[p.m - 1] + ' ' + (p.d ? p.d + ', ' : '') + p.y;
  }
  function accessAPA(a) { return a ? MONTHS_FULL[a.m - 1] + ' ' + a.d + ', ' + a.y : ''; }
  function accessMLA(a) { return a ? a.d + ' ' + MONTHS_MLA[a.m - 1] + ' ' + a.y : ''; }
  function accessIEEE(a) { return a ? MONTHS_IEEE[a.m - 1] + ' ' + a.d + ', ' + a.y : ''; }

  function normalise(d) {
    var o = {};
    ['type', 'orgAuthor', 'year', 'month', 'day', 'title', 'container', 'volume', 'issue', 'articleNo', 'edition', 'publisher',
      'city', 'url', 'abbr', 'keep', 'model', 'prompt', 'index'].forEach(function (k) { o[k] = clean(d[k]); });
    o.type = o.type || 'journal';
    o.authors = lines(d.authors).map(parseName);
    o.editors = lines(d.editors).map(parseName);
    o.pages = dashPages(d.pages);
    o.pagesRaw = clean(d.pages);
    o.doi = normDoi(d.doi);
    o.doiRaw = clean(d.doi);
    o.access = parseDate(d.accessDate);
    o.wiki = !!d.wikiEntry;
    o.n = parseInt(o.index, 10) || 1;
    return o;
  }

  // ───────────── reference builders ─────────────
  function quoteTitle(t) { return '\u201C' + (/[.?!]$/.test(t) ? t : t + '.') + '\u201D'; }   // MLA: “Title.”
  function ieeeQuote(t) { return '\u201C' + t + ',\u201D'; }                                   // IEEE: “Title,”

  function authorBlock(o) {
    return o.authors.length ? o.authors : null;
  }

  function buildAPA(o) {
    var t = o.type, au = authorBlock(o), org = o.orgAuthor, head;
    var yr = (t === 'website' || t === 'ai') ? apaDate(o) : (clean(o.year) || 'n.d.');
    var title = sentenceCase(o.title, o.keep);
    var doiUrl = o.doi ? 'https://doi.org/' + o.doi : '';
    var link = doiUrl || o.url;
    function who() { return au ? apaAuthors(au) : (org ? org : ''); }
    var ed = ordinal(o.edition);
    var s;
    if (t === 'journal') {
      head = addDot(who()) + ' (' + yr + '). ';
      var bits = ['*' + o.container + '*'];
      if (o.volume) bits.push('*' + o.volume + '*' + (o.issue ? '(' + o.issue + ')' : ''));
      if (o.pages) bits.push(o.pages); else if (o.articleNo) bits.push('Article ' + o.articleNo);
      s = head + addDot(title) + ' ' + bits.join(', ') + '.' + (link ? ' ' + link : '');
    } else if (t === 'book') {
      head = addDot(who()) + ' (' + yr + '). ';
      s = head + '*' + title + '*' + (ed ? ' (' + ed + ' ed.)' : '') + '. ' + (o.publisher ? addDot(o.publisher) : '') + (link ? ' ' + link : '');
      s = s.replace(/\s+$/, '');
    } else if (t === 'chapter' || t === 'conference') {
      head = addDot(who()) + ' (' + yr + '). ';
      var inside = [];
      if (ed) inside.push(ed + ' ed.');
      if (o.pages) inside.push(pagesLabel(o.pages));
      var par = inside.length ? ' (' + inside.join(', ') + ')' : '';
      var ins = o.editors.length ? 'In ' + apaEditors(o.editors) + ', ' : 'In ';
      s = head + addDot(title) + ' ' + ins + '*' + (t === 'chapter' ? sentenceCase(o.container, o.keep) : o.container) + '*' + par + '. ' +
        (o.publisher ? addDot(o.publisher) : '') + (link ? ' ' + link : '');
      s = s.replace(/\s+$/, '');
    } else if (t === 'website') {
      var site = o.container, dt = '(' + yr + ')';
      var siteBit = (site && site !== org) ? ' ' + addDot(site) : '';
      if (o.wiki) {
        s = addDot(title) + ' ' + dt + '. In *' + site + '*. ';
      } else if (au || org) {
        s = addDot(who()) + ' ' + dt + '. *' + title + '*.' + siteBit + ' ';
      } else {
        s = '*' + title + '*. ' + dt + '.' + siteBit + ' ';
      }
      var needRetrieval = o.access && !o.year;
      s += (needRetrieval ? 'Retrieved ' + accessAPA(o.access) + ', from ' : '') + (o.url || '');
      s = s.replace(/\s+$/, '');
    } else if (t === 'ai') {
      var chat = strip(clean(o.title || o.prompt));
      s = addDot(org || o.publisher) + ' (' + yr + '). *' + chat + '* [Generative AI chat]. ' + addDot(o.container) + (o.url ? ' ' + o.url : '');
    }
    return s;
  }

  function buildMLA(o) {
    var t = o.type, au = authorBlock(o), org = o.orgAuthor;
    var title = titleCase(o.title), date = mlaDate(o), doiUrl = o.doi ? 'https://doi.org/' + o.doi : '';
    var link = doiUrl || stripProtocol(o.url);
    var ed = ordinal(o.edition);
    var lead = au ? mlaAuthors(au) : (org && t !== 'website' ? addDot(org) : '');
    var s, bits;
    if (t === 'journal') {
      bits = ['*' + titleCase(o.container) + '*'];
      if (o.volume) bits.push('vol. ' + o.volume);
      if (o.issue) bits.push('no. ' + o.issue);
      if (date) bits.push(date);
      if (o.pages) bits.push(pagesLabel(o.pages));
      if (link) bits.push(link);
      s = (lead ? addDot(lead) + ' ' : '') + quoteTitle(title) + ' ' + bits.join(', ') + '.';
    } else if (t === 'book') {
      bits = [];
      if (ed) bits.push(ed + ' ed.');
      if (o.publisher) bits.push(o.publisher);
      if (date) bits.push(date);
      if (link) bits.push(link);
      s = (lead ? addDot(lead) + ' ' : '') + '*' + title + '*. ' + (bits.length ? bits.join(', ') + '.' : '');
      s = s.replace(/\s+$/, '');
    } else if (t === 'chapter' || t === 'conference') {
      bits = ['*' + titleCase(o.container) + '*'];
      if (o.editors.length) bits.push('edited by ' + mlaEditors(o.editors));
      if (ed) bits.push(ed + ' ed.');
      if (o.publisher) bits.push(o.publisher);
      if (date) bits.push(date);
      if (o.pages) bits.push(pagesLabel(o.pages));
      if (link) bits.push(link);
      s = (lead ? addDot(lead) + ' ' : '') + quoteTitle(title) + ' ' + bits.join(', ') + '.';
    } else if (t === 'website') {
      var site = titleCase(o.container);
      bits = ['*' + site + '*'];
      if (o.publisher && o.publisher !== site) bits.push(o.publisher);
      if (date) bits.push(date);
      if (link) bits.push(link);
      var who = au ? mlaAuthors(au) : (org && org !== site && org !== o.publisher ? org : '');
      s = (who ? addDot(who) + ' ' : '') + quoteTitle(title) + ' ' + bits.join(', ') + '.' + (o.access ? ' Accessed ' + accessMLA(o.access) + '.' : '');
    } else if (t === 'ai') {
      var pr = clean(o.prompt || o.title);
      bits = ['*' + o.container + '*'];
      if (o.model) bits.push('model ' + o.model);
      if (o.publisher || org) bits.push(o.publisher || org);
      if (date) bits.push(date);
      if (link) bits.push(link);
      s = '“' + pr + '” prompt. ' + bits.join(', ') + '.';
    }
    return s;
  }

  function buildIEEE(o) {
    var t = o.type, au = authorBlock(o), org = o.orgAuthor, n = '[' + o.n + '] ';
    var title = sentenceCase(o.title, o.keep), date = ieeeDate(o), doi = o.doi ? 'doi: ' + o.doi : '';
    var who = au ? ieeeAuthors(au) : (org || '');
    var ed = ordinal(o.edition);
    var place = o.city ? o.city + ': ' + o.publisher : o.publisher;
    var s, bits;
    if (t === 'journal') {
      bits = ['*' + (o.abbr || o.container) + '*'];
      if (o.volume) bits.push('vol. ' + o.volume);
      if (o.issue) bits.push('no. ' + o.issue);
      if (o.pages) bits.push(pagesLabel(o.pages));
      if (date) bits.push(date);
      if (o.articleNo) bits.push('Art. no. ' + o.articleNo);
      if (doi) bits.push(doi);
      s = who + ', ' + ieeeQuote(title) + ' ' + bits.join(', ') + '.';
      if (!doi && o.url) s = s.replace(/\.$/, '. [Online]. Available: ' + o.url);
    } else if (t === 'book') {
      s = who + ', *' + titleCase(o.title) + '*' + (ed ? ', ' + ed + ' ed. ' : '. ') + place + (date ? ', ' + date : '') + '.';
    } else if (t === 'chapter') {
      var pre = 'in *' + titleCase(o.container) + '*';
      if (o.editors.length) pre += ', ' + ieeeEditors(o.editors);
      var mid = ed ? pre + ', ' + ed + ' ed. ' : pre + ', ';
      bits = [];
      if (date) bits.push(date);
      if (o.pages) bits.push(pagesLabel(o.pages));
      if (doi) bits.push(doi);
      s = who + ', ' + ieeeQuote(title) + ' ' + mid + place + (bits.length ? ', ' + bits.join(', ') : '') + '.';
    } else if (t === 'conference') {
      bits = [];
      if (o.city) bits.push(o.city);
      if (date) bits.push(o.year);
      if (o.pages) bits.push(pagesLabel(o.pages));
      if (doi) bits.push(doi);
      s = who + ', ' + ieeeQuote(title) + ' in *' + (o.abbr || o.container) + '*, ' + bits.join(', ') + '.';
    } else if (t === 'website') {
      s = (who ? who + ', ' : '') + ieeeQuote(title) + ' ' + o.container + (date ? ', ' + date : '') + '.' +
        (o.access ? ' Accessed: ' + accessIEEE(o.access) + '.' : '') + ' [Online]. Available: ' + o.url;
    } else if (t === 'ai') {
      return '(no IEEE reference format) Disclose in the Acknowledgments: “The author used ' + o.container +
        (o.model ? ' (' + o.model + ')' : '') + ' (' + (o.publisher || org) + ', ' + (date || 'date') + ') to … [which sections, what level of involvement]. ' +
        'The author reviewed and takes responsibility for all content.”';
    }
    return n + s;
  }

  // ───────────── in-text forms ─────────────
  function inTextAPA(o) {
    var au = authorBlock(o), yr = clean(o.year) || 'n.d.';
    if (o.type === 'ai') return { par: '(' + (o.orgAuthor || o.publisher) + ', ' + yr + ')', nar: (o.orgAuthor || o.publisher) + ' (' + yr + ')' };
    if (au) return { par: '(' + surnames(au, ' & ') + ', ' + yr + ')', nar: surnames(au, ' and ') + ' (' + yr + ')' };
    if (o.orgAuthor) return { par: '(' + o.orgAuthor + ', ' + yr + ')', nar: o.orgAuthor + ' (' + yr + ')' };
    var st = sentenceCase(o.title, o.keep);
    if (o.type === 'website' && !o.wiki) return { par: '(*' + st + '*, ' + yr + ')', nar: '*' + st + '* (' + yr + ')' };
    return { par: '(\u201C' + st + ',\u201D ' + yr + ')', nar: '\u201C' + st + '\u201D (' + yr + ')' };
  }
  function inTextMLA(o) {
    var au = authorBlock(o), pg = o.pages ? o.pages.split('–')[0] : '';
    if (o.type === 'ai') return { par: '(“' + clean(o.prompt || o.title).split(' ').slice(0, 3).join(' ') + '”)', nar: '' };
    if (au) return { par: '(' + surnames(au, ' and ') + (pg ? ' ' + pg : '') + ')', nar: surnames(au, ' and ') + (pg ? ' (' + pg + ')' : '') };
    if (o.orgAuthor && o.type !== 'website') return { par: '(' + o.orgAuthor + (pg ? ' ' + pg : '') + ')', nar: o.orgAuthor };
    return { par: '(“' + titleCase(o.title) + '”)', nar: '“' + titleCase(o.title) + '”' };
  }
  function inTextIEEE(o) {
    var au = authorBlock(o), n = '[' + o.n + ']';
    if (o.type === 'ai') return { par: '(not cited by number – disclosed in the Acknowledgments)', nar: '' };
    return { par: n, nar: (au ? surnames(au, ' and ') : (o.orgAuthor || '“' + sentenceCase(o.title, o.keep) + '”')) + ' ' + n };
  }

  // ───────────── validation hints ─────────────
  function hints(raw, o) {
    var h = [];
    function add(level, style, msg) { h.push({ level: level, style: style, msg: msg }); }
    var t = o.type;
    if (!o.title) add('error', 'all', 'The title is required.');
    if (!o.year && t !== 'website') add('error', 'all', 'The year is required (use the year of the version you used).');
    if (!o.authors.length && !o.orgAuthor && t !== 'website') add('error', 'all', 'No author: add one author per line, written Family, Given (for an organisation use the organisation field).');
    if (t === 'journal' && !o.container) add('error', 'all', 'A journal article needs the journal name (the container).');
    if ((t === 'chapter' || t === 'conference') && !o.container) add('error', 'all', 'Add the title of the book or proceedings that contains the paper.');
    if (t === 'website' && !o.url) add('error', 'all', 'A web page needs its URL.');
    if (t === 'website' && !o.container) add('warn', 'all', 'Add the website name; it is part of the reference.');
    o.authors.forEach(function (a) {
      if (a.noComma) add('warn', 'all', '“' + a.raw + '” has no comma. Type names as Family, Given (e.g. “Dijkstra, Edsger W.”). The tool guessed that the last word is the family name – check, especially for names with a two-word family name.');
      var letters = a.raw.replace(/[^A-Za-z]/g, '');
      if (letters.length > 3 && letters === letters.toUpperCase()) add('warn', 'all', '“' + a.raw + '” is in capitals. Write names in normal capitalisation.');
    });
    if (o.authors.length > 20) add('info', 'APA', 'APA 7 lists the first 19 authors, then an ellipsis, then the last author.');
    if (o.authors.length > 6) add('info', 'IEEE', 'IEEE publications list up to six authors; with more, use the first author + “et al.”');
    if (o.authors.length >= 3) add('info', 'MLA', 'MLA 9 uses only the first author followed by “et al.” for three or more authors.');
    if (o.authors.length && o.authors.every(function (a) { return a.given && initialsOnly(a.given); }) && (t === 'journal' || t === 'book' || t === 'chapter' || t === 'conference')) {
      add('info', 'MLA', 'MLA prefers the full given names when the source prints them (Edsger W., not E. W.).');
    }
    var kind = o.title ? detectCase(o.title) : 'sentence';
    if (kind === 'upper') add('warn', 'all', 'The title is in ALL CAPITALS. Retype it with normal capitalisation; the tool lower-cases it for APA/IEEE, but proper nouns must be added to the “keep capitalised” box.');
    else if (kind === 'title' && (t === 'journal' || t === 'chapter' || t === 'conference' || t === 'website' || t === 'book')) {
      add('info', 'APA', 'APA wants sentence case for titles (only the first word, the first word after a colon, and proper nouns are capitalised). The tool converted yours – add proper nouns to the “keep capitalised” box.');
    }
    if (kind === 'sentence' && o.title && /^[a-z]/.test(o.title)) add('warn', 'all', 'The title starts with a lower-case letter.');
    if (o.doiRaw && !/^10\.\d{4,9}\/\S+$/.test(o.doi)) add('warn', 'all', 'This does not look like a DOI. DOIs start with 10. followed by a prefix and a suffix, e.g. 10.1145/362929.362947.');
    if ((t === 'journal' || t === 'chapter' || t === 'conference') && !o.doi && !o.url) {
      add('warn', 'APA', 'No DOI or URL. APA 7 asks for the DOI of every work that has one. Look the title up at Crossref (search.crossref.org) or on the publisher’s page.');
      add('warn', 'IEEE', 'No DOI. IEEE wants “doi: …” when the work has one.');
    }
    if ((t === 'journal' || t === 'chapter' || t === 'conference') && !o.pages && !o.articleNo) add('info', 'all', 'No page range or article number. Add them if the work has them.');
    if (o.pagesRaw && /[-‐-―]/.test(o.pagesRaw) && o.pagesRaw !== o.pages) add('info', 'all', 'The page range uses an en dash (–), not a hyphen; the tool fixed it.');
    if (t === 'journal' && !o.volume) add('info', 'all', 'Most journal articles have a volume (and often an issue) number.');
    if (t === 'journal' && o.articleNo && !o.pages) add('info', 'MLA', 'MLA leaves the article number out of the entry; the author, title, journal and DOI are enough to find the article.');
    if ((t === 'journal' || t === 'conference') && !o.abbr) add('info', 'IEEE', 'IEEE uses the standard abbreviation of the journal or proceedings title (e.g. Commun. ACM). Type it in the “IEEE abbreviation” box; until then the full name is used.');
    if ((t === 'book' || t === 'chapter') && !o.city) add('info', 'IEEE', 'IEEE gives the publisher’s city (and state/country): “Hoboken, NJ, USA: Pearson”.');
    if (t === 'website') {
      if (!o.access) add('info', 'IEEE', 'IEEE requires “Accessed: …” for web pages; MLA treats the access date as optional. Add the date you opened the page.');
      if (o.access && o.year && o.wiki) add('info', 'APA', 'APA uses the date of the archived version, so no retrieval date is needed when you link a permanent (oldid) version of the page.');
      if (!o.year) add('info', 'APA', 'No date: APA writes (n.d.) and adds “Retrieved …, from” with your access date.');
      if (o.wiki) add('info', 'all', 'Wikipedia is a tertiary source: use it to find the real sources in its reference list, and cite those when you can.');
    }
    if (t === 'ai') {
      if (!o.model) add('warn', 'MLA', 'MLA asks for the model or version (e.g. GPT-4o) so a reader knows which system answered.');
      if (!o.year) add('warn', 'all', 'The date you generated the answer is required.');
      if (!o.url) add('warn', 'all', 'No shareable link. MLA: give the tool’s general address. APA: output readers cannot retrieve is treated as personal communication (in-text only, no reference-list entry).');
      if (!o.container) add('warn', 'all', 'Name the tool (e.g. ChatGPT).');
      add('info', 'all', 'The tool is never the author: the company is. And never cite a chatbot as the source of a fact – find the original work and cite that (AI invents references).');
      add('info', 'IEEE', 'IEEE has no reference format for chatbot output; its rule is to disclose AI-generated content in the Acknowledgments, naming the system and which parts it produced.');
    }
    return h;
  }

  function render(data) {
    var o = normalise(data);
    var out = {
      APA: { ref: buildAPA(o), cite: inTextAPA(o) },
      MLA: { ref: buildMLA(o), cite: inTextMLA(o) },
      IEEE: { ref: buildIEEE(o), cite: inTextIEEE(o) },
      hints: hints(data, o)
    };
    ['APA', 'MLA', 'IEEE'].forEach(function (k) { out[k].plain = strip(out[k].ref); });
    return out;
  }

  // ───────────── presets (all real works, verified via Crossref / publisher pages) ─────────────
  var PRESETS = [
    { key: 'dijkstra', name: 'Journal article — Dijkstra, “Go To Statement Considered Harmful” (1968)',
      data: { type: 'journal', authors: 'Dijkstra, Edsger W.', year: '1968', month: '3', title: 'Go To Statement Considered Harmful',
        container: 'Communications of the ACM', abbr: 'Commun. ACM', volume: '11', issue: '3', pages: '147-148', doi: '10.1145/362929.362947' },
      story: 'A two-page letter from 1968 that every programmer still quotes. Notice: APA drops the month, IEEE keeps it, MLA writes it as “Mar.”' },
    { key: 'dang', name: 'Journal article, 6 authors, article number — Dang et al. (2026)',
      data: { type: 'journal', authors: 'Dang, Quoc Phu\nTran-Truong, Phat T.\nVu, Duc-Ly\nNguyen, Long S. T.\nVo, Quynh T. N.\nQuan, Tho', year: '2026',
        title: 'Enhancing large language model performance for automatic zero-shot multiple-choice question answering via single-token logit prompting',
        container: 'Computers and Education: Artificial Intelligence', abbr: '', volume: '10', articleNo: '100578', doi: '10.1016/j.caeai.2026.100578' },
      story: 'The textbook’s own example. Watch what happens to six authors in each style, and to “Article 100578”.' },
    { key: 'stroustrup', name: 'Book — Stroustrup, The C++ Programming Language (4th ed., 2013)',
      data: { type: 'book', authors: 'Stroustrup, Bjarne', year: '2013', title: 'The C++ Programming Language', edition: '4', publisher: 'Addison-Wesley' },
      story: 'The reference book for the language you are learning. IEEE will ask you for the city; look it up on the title page.' },
    { key: 'russell', name: 'Book, 2 authors — Russell & Norvig, Artificial Intelligence: A Modern Approach (4th ed., 2021)',
      data: { type: 'book', authors: 'Russell, Stuart J.\nNorvig, Peter', year: '2021', title: 'Artificial Intelligence: A Modern Approach', edition: '4', publisher: 'Pearson', city: 'Hoboken, NJ, USA' },
      story: 'Textbook example. Compare the two-author joins: “, &” (APA), “, and” with a second given-name-first author (MLA), “and” (IEEE).' },
    { key: 'quan-chapter', name: 'Chapter in an edited book — Quan, Hui & Fong (2007)',
      data: { type: 'chapter', authors: 'Quan, T. T.\nHui, S. C.\nFong, A. C. M.', year: '2007', title: 'Semantic web support for customer services',
        container: 'Advances in Electronic Business, Volume 2', editors: 'Li, Eldon Y.\nDu, Timon C.', publisher: 'IGI Global', city: 'Hershey, PA, USA', pages: '93-115', doi: '10.4018/978-1-59140-678-5.ch004' },
      story: 'A chapter has two titles: the chapter and the book that contains it. The editors belong to the book, not the chapter.' },
    { key: 'nguyen-quan', name: 'Conference paper — Nguyen & Quan (EACL Findings, 2026)',
      data: { type: 'conference', authors: 'Nguyen, Long S. T.\nQuan, Tho', year: '2026', title: 'Which works best for Vietnamese? A practical study of information retrieval methods across domains',
        container: 'Findings of the Association for Computational Linguistics: EACL 2026', publisher: 'Association for Computational Linguistics', city: 'Rabat, Morocco',
        pages: '2098-2119', doi: '10.18653/v1/2026.findings-eacl.110', keep: 'Vietnamese' },
      story: 'Proceedings are cited like a book that contains papers. APA names the publisher; IEEE names the place and year of the conference.' },
    { key: 'wikipedia', name: 'Website — Wikipedia, “Plagiarism” (version of 15 Sept 2026)',
      data: { type: 'website', wikiEntry: true, title: 'Plagiarism', container: 'Wikipedia', publisher: 'Wikimedia Foundation', year: '2026', month: '9', day: '15',
        url: 'https://en.wikipedia.org/w/index.php?title=Plagiarism&oldid=1375097789', accessDate: '2026-10-18' },
      story: 'A page that changes. The “oldid” link freezes one version; the access date tells the reader when you looked.' },
    { key: 'chatgpt', name: 'Generative AI — a ChatGPT answer (MLA Style Center’s own example)',
      data: { type: 'ai', orgAuthor: 'OpenAI', publisher: 'OpenAI', container: 'ChatGPT', model: 'GPT-4o', year: '2024', month: '9', day: '23',
        prompt: 'Describe the theme of nature in Jane Austen’s *Mansfield Park*', title: '', url: 'https://chatgpt.com/share/66f1b0a0-d704-8000-be9a-85f53c850607' },
      story: 'Cite the tool when you use its words or ideas – but never as the source of a fact, and say how you used it.' }
  ];

  // ───────────── Panel 2: Spot the mistake (flawed versions of the same real works) ─────────────
  function d(key) { for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].key === key) return PRESETS[i].data; return {}; }
  var SPOT = [
    { style: 'APA 7', kind: 'reference',
      flawed: 'Dijkstra, E. W. (1968). Go To Statement Considered Harmful. *Communications of the ACM*, *11*(3), 147–148. https://doi.org/10.1145/362929.362947',
      q: 'One thing is wrong with this APA reference. What?',
      opts: ['The author\u2019s name should be written out in full, as Edsger W. Dijkstra', 'The article title should be in sentence case, not Title Case', 'The journal name must not be in italics because it is a proper noun', 'The DOI should be removed because the article was published in 1968'],
      a: 1, why: 'APA 7 capitalises only the first word, the first word after a colon, and proper nouns in article titles. The journal name and the volume are italic; the DOI is wanted whenever one exists.',
      fixStyle: 'APA', fixData: 'dijkstra' },
    { style: 'APA 7', kind: 'reference',
      flawed: 'E. W. Dijkstra. (1968). Go to statement considered harmful. *Communications of the ACM*, *11*(3), 147–148. https://doi.org/10.1145/362929.362947',
      q: 'What is wrong with the way the author is written?',
      opts: ['There should be no initials, only the family name written after the year', 'The author should be followed by \u201Cet al.\u201D even if there is a single author', 'The author should be written in capital letters, as in DIJKSTRA, E. W.', 'The initials should come after the family name: Dijkstra, E. W.'],
      a: 3, why: 'APA inverts every author: Family name, comma, initials. (IEEE, in contrast, puts the initials first – that is why people mix them up.)',
      fixStyle: 'APA', fixData: 'dijkstra' },
    { style: 'MLA 9', kind: 'reference',
      flawed: 'Russell, Stuart J., and Peter Norvig. *Artificial Intelligence: A Modern Approach*. 4th ed., Pearson, 2021. https://doi.org/10.1000/xyz123',
      q: 'This reference is for a printed textbook. Which detail is the most suspicious?',
      opts: ['The edition (4th ed.) must never be given in MLA, only the year is allowed', 'The publisher must be written before the title, followed by a colon', 'The DOI, which was typed in without ever being looked up', 'MLA never lists two authors, so \u201Cand Peter Norvig\u201D must go'],
      a: 2, why: 'Never decorate a reference with an identifier you did not look up. If the book has no DOI, leave it out; the publisher and year are enough.',
      fixStyle: 'MLA', fixData: 'russell', fixPatch: { doi: '' } },
    { style: 'MLA 9', kind: 'reference',
      flawed: 'Dang, Quoc Phu, Phat T. Tran-Truong, Duc-Ly Vu, Long S. T. Nguyen, Quynh T. N. Vo, and Tho Quan. “Enhancing Large Language Model Performance for Automatic Zero-Shot Multiple-Choice Question Answering via Single-Token Logit Prompting.” *Computers and Education: Artificial Intelligence*, vol. 10, 2026, https://doi.org/10.1016/j.caeai.2026.100578.',
      q: 'What does MLA 9 require for a source with six authors?',
      opts: ['The first author followed by \u201Cet al.\u201D; the other five are left out', 'All six names, because the reader must see every one of the authors', 'Only the last author followed by \u201Cet al.\u201D, to show who did the work', 'The first two authors followed by \u201Cet al.\u201D to show it is a team paper'],
      a: 0, why: 'In MLA 9, three or more authors are shortened to the first author + “et al.”. (APA 7 would list up to 20; IEEE up to 6.)',
      fixStyle: 'MLA', fixData: 'dang' },
    { style: 'IEEE', kind: 'reference',
      flawed: '[1] Dijkstra, E. W., “Go to statement considered harmful,” *Commun. ACM*, vol. 11, no. 3, pp. 147–148, Mar. 1968, doi: 10.1145/362929.362947.',
      q: 'What is wrong with the author in this IEEE reference?',
      opts: ['IEEE writes the full first name: Edsger W. Dijkstra, with no initials at all', 'The initials come first, then the family name: E. W. Dijkstra', 'IEEE omits the author name when the paper is a letter to the editor', 'IEEE writes the family name in capitals, as in DIJKSTRA, E. W. (1968)'],
      a: 1, why: 'IEEE gives the initial(s) first and the family name last, with no inversion and no comma between them.',
      fixStyle: 'IEEE', fixData: 'dijkstra' },
    { style: 'APA 7', kind: 'in-text',
      flawed: 'The study found that retrieval methods behave differently across domains (Nguyen and Quan, 2026).',
      q: 'What is wrong with this in-text citation?',
      opts: ['A year is not allowed inside an APA in-text citation, only the names', 'The authors\u2019 first names must be included in the citation, too', 'It should be replaced by a numbered footnote at the bottom of the page', 'Inside parentheses APA uses \u201C&\u201D: (Nguyen & Quan, 2026)'],
      a: 3, why: 'In a parenthetical APA citation two authors are joined by “&”; in a narrative citation you write “and”: Nguyen and Quan (2026) found…',
      fix: 'The study found that retrieval methods behave differently across domains (Nguyen & Quan, 2026).' },
    { style: 'APA 7', kind: 'reference',
      flawed: 'ChatGPT. (2025, August 21). *High school grammar concepts* [Generative AI chat]. OpenAI. https://chatgpt.com/share/68a77b60-0ee4-800c-9acc-cd3fd573c311',
      q: 'The chat is a real example from the APA Style blog. What was swapped?',
      opts: ['The date should come after the title instead of directly after the author', 'The bracketed description [Generative AI chat] must be removed from the entry', 'The company (OpenAI) is the author, the tool (ChatGPT) follows the title', 'The share link should be replaced by the home page of the tool, chatgpt.com'],
      a: 2, why: 'APA 7 (blog post of 9 Sept 2025): author = the company that made the tool; the chat title is italic with a bracketed description; the tool name follows; then the shareable link.',
      fix: 'OpenAI. (2025, August 21). *High school grammar concepts* [Generative AI chat]. ChatGPT. https://chatgpt.com/share/68a77b60-0ee4-800c-9acc-cd3fd573c311' },
    { style: 'APA 7', kind: 'reference',
      flawed: 'Dijkstra, E. W. (1969). Go to statement considered harmful. *IEEE Transactions on Software Engineering*, *11*(3), 147–148. https://doi.org/10.1145/362929.362947',
      q: 'The format is perfect, yet this reference is wrong. Why? (Hint: open the DOI.)',
      opts: ['Year, journal and DOI disagree; the DOI points to a 1968 CACM letter', 'APA does not allow a DOI in a journal reference, only in book references', 'The page range must be written with a hyphen instead of an en dash here', 'The volume number must not be in italics, because it is only a number'],
      a: 0, why: 'A reference is a promise that the work exists as described. Always resolve the DOI (doi.org/… or Crossref) and compare title, authors, venue and year. A tidy-looking but wrong reference is a classic sign of AI-invented citations.',
      fixStyle: 'APA', fixData: 'dijkstra' }
  ];
  SPOT.forEach(function (s) {
    if (s.fixData) {
      var dd = {}, base = d(s.fixData), k;
      for (k in base) dd[k] = base[k];
      if (s.fixPatch) for (k in s.fixPatch) dd[k] = s.fixPatch[k];
      s.fix = render(dd)[s.fixStyle].ref;
    }
  });

  // ───────────── Panel 3: paraphrase heuristic ─────────────
  function tokenize(text) {
    var toks = [], re = /[A-Za-z0-9À-ỹ][A-Za-z0-9À-ỹ'’-]*/g, m, inQuote = false, last = 0;
    var s = String(text);
    while ((m = re.exec(s)) !== null) {
      var between = s.slice(last, m.index);
      var q = (between.match(/["“”]/g) || []).length;
      if (q % 2 === 1) inQuote = !inQuote;
      toks.push({ w: m[0].toLowerCase().replace(/[’]/g, "'"), raw: m[0], start: m.index, end: m.index + m[0].length, quoted: inQuote });
      last = m.index + m[0].length;
    }
    return toks;
  }
  function overlap(source, para, n) {
    n = n || 4;
    var S = tokenize(source), P = tokenize(para), grams = {}, i, j;
    for (i = 0; i + n <= S.length; i++) grams[S.slice(i, i + n).map(function (t) { return t.w; }).join(' ')] = i;
    var pMask = P.map(function () { return false; }), sMask = S.map(function () { return false; }), shared = [];
    for (i = 0; i + n <= P.length; i++) {
      var g = P.slice(i, i + n).map(function (t) { return t.w; }).join(' ');
      var allQuoted = P.slice(i, i + n).some(function (t) { return t.quoted; });   // any quoted word: the stretch is a quotation, not a copy
      if (grams.hasOwnProperty(g) && !allQuoted) {
        shared.push(g);
        for (j = 0; j < n; j++) { pMask[i + j] = true; sMask[grams[g] + j] = true; }
      }
    }
    var unq = P.filter(function (t) { return !t.quoted; }).length;
    var copied = P.filter(function (t, k) { return pMask[k] && !t.quoted; }).length;
    // longest run of consecutive copied words
    var run = 0, best = 0;
    pMask.forEach(function (b) { run = b ? run + 1 : 0; if (run > best) best = run; });
    var ratio = unq ? copied / unq : 0, verdict;
    if (!unq) verdict = 'empty';
    else if (ratio >= 0.5) verdict = 'high';
    else if (ratio >= 0.2) verdict = 'some';
    else verdict = 'low';
    return { source: S, para: P, pMask: pMask, sMask: sMask, shared: shared, ratio: ratio, copied: copied, words: unq, longest: best, verdict: verdict, n: n };
  }

  var CiteLab = {
    render: render, PRESETS: PRESETS, SPOT: SPOT, overlap: overlap, tokenize: tokenize,
    _t: { sentenceCase: sentenceCase, titleCase: titleCase, initials: initials, parseName: parseName, detectCase: detectCase, normDoi: normDoi, ordinal: ordinal }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = CiteLab;
  global.CiteLab = CiteLab;

  // ───────────── UI ─────────────
  function mount() {
    var host = document.getElementById('cite-root');
    if (!host) return;
    function el(tag, cls, text) {
      var n = document.createElement(tag);
      if (cls) n.className = cls;
      if (text !== undefined) n.textContent = text;
      return n;
    }
    function fmt(node, str) {     // *italic* markup -> <i>, never innerHTML
      node.textContent = '';
      String(str).split(/(\*[^*]+\*)/).forEach(function (p) {
        if (!p) return;
        if (p.length > 2 && p.charAt(0) === '*' && p.charAt(p.length - 1) === '*') { var i = document.createElement('i'); i.textContent = p.slice(1, -1); node.appendChild(i); }
        else node.appendChild(document.createTextNode(p));
      });
      return node;
    }
    function save(k, v) { try { localStorage.setItem('co1005-cite-' + k, v); } catch (e) { /* storage unavailable */ } }
    function load(k) { try { return localStorage.getItem('co1005-cite-' + k); } catch (e) { return null; } }

    // ---- tabs
    var tabs = el('div', 'cl-tabs'); tabs.setAttribute('role', 'tablist');
    var panels = [], tabBtns = [];
    ['1 · Reference builder', '2 · Spot the mistake', '3 · Paraphrase check'].forEach(function (name, i) {
      var b = el('button', 'cl-tab', name); b.type = 'button'; b.setAttribute('role', 'tab'); b.id = 'cl-tab-' + i;
      b.setAttribute('aria-controls', 'cl-panel-' + i);
      b.addEventListener('click', function () { show(i); });
      b.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight') { show((i + 1) % 3); tabBtns[(i + 1) % 3].focus(); }
        if (e.key === 'ArrowLeft') { show((i + 2) % 3); tabBtns[(i + 2) % 3].focus(); }
      });
      tabs.appendChild(b); tabBtns.push(b);
    });
    host.appendChild(tabs);
    function show(i) {
      panels.forEach(function (p, k) { p.hidden = k !== i; tabBtns[k].setAttribute('aria-selected', String(k === i)); tabBtns[k].tabIndex = k === i ? 0 : -1; });
      save('tab', String(i));
    }
    var status = el('div', 'sim-status cl-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');

    // ───── Panel 1
    var p1 = el('div', 'run-panel cl-panel'); p1.id = 'cl-panel-0'; p1.setAttribute('role', 'tabpanel'); p1.setAttribute('aria-labelledby', 'cl-tab-0');
    var intro = el('p', 'cl-intro', 'Pick a real work (or a source type and fill the form). The same facts are formatted in three styles. This is a teaching tool: always compare with the style guide your course asks for.');
    p1.appendChild(intro);
    var bar = el('div', 'ex-actions');
    var sel = el('select', 'preset-select'); sel.setAttribute('aria-label', 'Example works');
    PRESETS.forEach(function (p, i) { var o = el('option', '', p.name); o.value = String(i); sel.appendChild(o); });
    bar.appendChild(sel);
    var clearBtn = el('button', 'btn ghost small', '↺ Clear the form'); clearBtn.type = 'button';
    bar.appendChild(clearBtn);
    p1.appendChild(bar);
    var story = el('p', 'cl-story'); p1.appendChild(story);

    var FIELDS = [
      { k: 'type', label: 'Source type', type: 'select', opts: [['journal', 'Journal article'], ['book', 'Book'], ['chapter', 'Chapter in an edited book'], ['conference', 'Conference paper'], ['website', 'Website / web page'], ['ai', 'Generative-AI output']] },
      { k: 'authors', label: 'Authors — one per line, Family, Given', type: 'textarea', hint: 'e.g. Dijkstra, Edsger W.', only: ['journal', 'book', 'chapter', 'conference', 'website'] },
      { k: 'orgAuthor', label: 'Organisation / company as author', type: 'text', only: ['website', 'ai'] },
      { k: 'year', label: 'Year', type: 'text', w: 'sm' },
      { k: 'month', label: 'Month', type: 'select', opts: [['', '—']].concat(MONTHS_FULL.map(function (m, i) { return [String(i + 1), m]; })), w: 'sm' },
      { k: 'day', label: 'Day', type: 'text', w: 'sm', only: ['website', 'ai'] },
      { k: 'title', label: 'Title of the article / chapter / book / page (as printed)', type: 'text', labelBy: { ai: 'Chat title (APA)' } },
      { k: 'prompt', label: 'Prompt in a few words (MLA)', type: 'text', only: ['ai'] },
      { k: 'container', label: 'Journal / book / proceedings / website / tool', type: 'text', labelBy: { chapter: 'Title of the book', conference: 'Title of the proceedings', website: 'Website name', ai: 'AI tool (e.g. ChatGPT)', journal: 'Journal name' }, hideFor: ['book'] },
      { k: 'abbr', label: 'IEEE abbreviation of that title', type: 'text', only: ['journal', 'conference'] },
      { k: 'editors', label: 'Editors of the book — one per line, Family, Given', type: 'textarea', only: ['chapter', 'conference'] },
      { k: 'volume', label: 'Volume', type: 'text', w: 'sm', only: ['journal'] },
      { k: 'issue', label: 'Issue', type: 'text', w: 'sm', only: ['journal'] },
      { k: 'pages', label: 'Pages (e.g. 147-148)', type: 'text', w: 'sm', only: ['journal', 'chapter', 'conference'] },
      { k: 'articleNo', label: 'Article number', type: 'text', w: 'sm', only: ['journal'] },
      { k: 'edition', label: 'Edition (number)', type: 'text', w: 'sm', only: ['book', 'chapter'] },
      { k: 'model', label: 'Model / version (e.g. GPT-4o)', type: 'text', only: ['ai'] },
      { k: 'publisher', label: 'Publisher', type: 'text', only: ['book', 'chapter', 'conference', 'website', 'ai'] },
      { k: 'city', label: 'Place (city, state, country) — IEEE', type: 'text', only: ['book', 'chapter', 'conference'] },
      { k: 'doi', label: 'DOI', type: 'text', only: ['journal', 'book', 'chapter', 'conference'] },
      { k: 'url', label: 'URL (web page, shared chat)', type: 'text', labelBy: { website: 'URL of the page', ai: 'Link to the shared chat' } },
      { k: 'accessDate', label: 'Date you opened it', type: 'date', only: ['website'] },
      { k: 'wikiEntry', label: 'This is an encyclopedia / Wikipedia entry', type: 'check', only: ['website'] },
      { k: 'keep', label: 'Words to keep capitalised in sentence case (comma-separated proper nouns)', type: 'text', only: ['journal', 'chapter', 'conference', 'website'] }
    ];
    var form = el('div', 'cl-form'); p1.appendChild(form);
    var inputs = {}, labels = {}, wraps = {};
    FIELDS.forEach(function (f) {
      var wrap = el('div', 'cl-field' + (f.w ? ' cl-' + f.w : '')); var id = 'cl-f-' + f.k;
      var lab = el('label', 'field-label', f.label); lab.setAttribute('for', id);
      var inp;
      if (f.type === 'select') { inp = el('select', 'cl-input'); f.opts.forEach(function (o) { var op = el('option', '', o[1]); op.value = o[0]; inp.appendChild(op); }); }
      else if (f.type === 'textarea') { inp = el('textarea', 'cl-input'); inp.rows = 3; inp.spellcheck = false; if (f.hint) inp.placeholder = f.hint; }
      else if (f.type === 'check') { inp = el('input'); inp.type = 'checkbox'; wrap.className += ' cl-check'; }
      else { inp = el('input', 'cl-input'); inp.type = f.type; inp.spellcheck = false; }
      inp.id = id;
      inp.addEventListener(f.type === 'select' || f.type === 'check' ? 'change' : 'input', update);
      if (f.type === 'check') { wrap.appendChild(inp); wrap.appendChild(lab); } else { wrap.appendChild(lab); wrap.appendChild(inp); }
      form.appendChild(wrap); inputs[f.k] = inp; labels[f.k] = lab; wraps[f.k] = wrap;
    });

    var results = el('div', 'cl-results'); p1.appendChild(results);
    var cards = {};
    ['APA', 'MLA', 'IEEE'].forEach(function (name) {
      var c = el('div', 'cl-card');
      var head = el('div', 'cl-card-head');
      head.appendChild(el('strong', '', name === 'APA' ? 'APA 7' : name === 'MLA' ? 'MLA 9' : 'IEEE'));
      var cp = el('button', 'btn ghost small', 'Copy'); cp.type = 'button'; cp.setAttribute('aria-label', 'Copy the ' + name + ' reference as plain text');
      head.appendChild(cp); c.appendChild(head);
      var ref = el('p', 'cl-ref'); var cite = el('p', 'cl-cite'); var hl = el('ul', 'cl-hints');
      c.appendChild(el('span', 'cl-tag', 'Reference list entry')); c.appendChild(ref);
      c.appendChild(el('span', 'cl-tag', 'In the text')); c.appendChild(cite); c.appendChild(hl);
      results.appendChild(c);
      cards[name] = { ref: ref, cite: cite, hints: hl, copy: cp, plain: '' };
      cp.addEventListener('click', function () {
        var txt = cards[name].plain;
        function done() { status.textContent = name + ' reference copied as plain text (italics are not kept).'; }
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, function () { status.textContent = 'Copy is blocked here: select the text and copy it by hand.'; });
        else status.textContent = 'Copy is not available here: select the text and copy it by hand.';
      });
    });
    var generalHints = el('ul', 'cl-hints cl-general'); p1.appendChild(generalHints);
    p1.appendChild(el('p', 'cl-fine', 'Titles are converted automatically (sentence case for APA and IEEE article titles, Title Case for MLA); proper nouns the tool cannot know must be listed in the “keep capitalised” box. Journal and proceedings names are used exactly as you type them.'));

    function readForm() {
      var d = {}; FIELDS.forEach(function (f) { d[f.k] = f.type === 'check' ? inputs[f.k].checked : inputs[f.k].value; });
      return d;
    }
    function fillForm(d) {
      FIELDS.forEach(function (f) {
        var v = d[f.k];
        if (f.type === 'check') inputs[f.k].checked = !!v; else inputs[f.k].value = v == null ? '' : v;
      });
      story.textContent = '';
    }
    function layout() {
      var t = inputs.type.value;
      FIELDS.forEach(function (f) {
        var vis = (!f.only || f.only.indexOf(t) >= 0) && !(f.hideFor && f.hideFor.indexOf(t) >= 0);
        wraps[f.k].hidden = !vis;
        if (f.labelBy) labels[f.k].textContent = f.labelBy[t] || f.label;
      });
    }
    function update() {
      layout();
      var data = readForm(), r = render(data);
      ['APA', 'MLA', 'IEEE'].forEach(function (name) {
        var c = cards[name]; fmt(c.ref, r[name].ref); c.plain = r[name].plain;
        var cite = r[name].cite;
        fmt(c.cite, cite.nar ? cite.par + '   •   ' + cite.nar : cite.par);
        c.hints.textContent = '';
        r.hints.filter(function (h) { return h.style === name; }).forEach(function (h) { var li = el('li', 'cl-hint cl-' + h.level, h.msg); c.hints.appendChild(li); });
      });
      generalHints.textContent = '';
      r.hints.filter(function (h) { return h.style === 'all'; }).forEach(function (h) { generalHints.appendChild(el('li', 'cl-hint cl-' + h.level, (h.level === 'error' ? 'Missing: ' : h.level === 'warn' ? 'Check: ' : 'Note: ') + h.msg)); });
      save('form', JSON.stringify(data));
    }
    sel.addEventListener('change', function () { var p = PRESETS[+sel.value]; fillForm(p.data); update(); story.textContent = p.story; status.textContent = 'Loaded: ' + p.name; });
    clearBtn.addEventListener('click', function () { fillForm({ type: inputs.type.value }); update(); status.textContent = 'Form cleared.'; });

    // ───── Panel 2
    var p2 = el('div', 'run-panel cl-panel'); p2.id = 'cl-panel-1'; p2.setAttribute('role', 'tabpanel'); p2.setAttribute('aria-labelledby', 'cl-tab-1');
    p2.appendChild(el('p', 'cl-intro', 'Eight citations, each with one planted problem – all about the real works from the builder. Choose what is wrong, then read the corrected version.'));
    var score = el('div', 'cl-score'); score.setAttribute('aria-live', 'polite'); p2.appendChild(score);
    var answered = {}, right = 0;
    function updScore() { score.textContent = 'Answered ' + Object.keys(answered).length + ' of ' + SPOT.length + ' · correct first time: ' + right; }
    SPOT.forEach(function (s, idx) {
      var card = el('fieldset', 'cl-spot'); var leg = el('legend', '', (idx + 1) + ' · ' + s.style + ' · ' + s.kind); card.appendChild(leg);
      var fl = el('p', 'cl-ref cl-flawed'); fmt(fl, s.flawed); card.appendChild(fl);
      card.appendChild(el('p', 'cl-q', s.q));
      var fb = el('div', 'cl-fb'); fb.hidden = true; fb.setAttribute('role', 'status');
      s.opts.forEach(function (text, k) {
        var lab = el('label', 'cl-opt'); var r = el('input'); r.type = 'radio'; r.name = 'cl-spot-' + idx; r.value = String(k);
        lab.appendChild(r); lab.appendChild(document.createTextNode(' ' + String.fromCharCode(65 + k) + ') ' + text));
        r.addEventListener('change', function () {
          var ok = k === s.a, first = !(idx in answered);
          if (first) { answered[idx] = ok; if (ok) right++; updScore(); }
          fb.hidden = false; fb.textContent = '';
          fb.className = 'cl-fb ' + (ok ? 'cl-good' : 'cl-bad');
          var b = el('strong', '', ok ? 'Correct. ' : 'Not quite. '); fb.appendChild(b);
          fb.appendChild(document.createTextNode(s.why));
          var fx = el('p', 'cl-ref'); fx.appendChild(el('span', 'cl-tag', 'Corrected')); fx.appendChild(document.createElement('br'));
          var span = el('span'); fmt(span, s.fix); fx.appendChild(span); fb.appendChild(fx);
        });
        card.appendChild(lab);
      });
      card.appendChild(fb); p2.appendChild(card);
    });
    var resetSpot = el('button', 'btn ghost small', '↺ Try again from scratch'); resetSpot.type = 'button';
    resetSpot.addEventListener('click', function () {
      answered = {}; right = 0; updScore();
      var rs = p2.querySelectorAll('input[type=radio]'); for (var i = 0; i < rs.length; i++) rs[i].checked = false;
      var fbs = p2.querySelectorAll('.cl-fb'); for (var j = 0; j < fbs.length; j++) fbs[j].hidden = true;
    });
    p2.appendChild(resetSpot); updScore();

    // ───── Panel 3
    var p3 = el('div', 'run-panel cl-panel'); p3.id = 'cl-panel-2'; p3.setAttribute('role', 'tabpanel'); p3.setAttribute('aria-labelledby', 'cl-tab-2');
    var warn = el('div', 'note warn');
    warn.appendChild(el('span', 'note-tag', 'A rough heuristic, not a plagiarism detector'));
    warn.appendChild(document.createTextNode('This tool only counts runs of four identical words in a row. It cannot see copied ideas, copied structure, translations, or whether you cited. Low overlap does not mean “okay”, and high overlap inside quotation marks with a citation is fine.'));
    p3.appendChild(warn);
    var SAMPLE_SRC = 'Plagiarism is the representation of another person’s language, thoughts, ideas, or expressions as one’s own original work.';
    var SAMPLES = [
      { name: 'Copy with two words changed', para: 'Plagiarism is the representation of another person’s language, thoughts, ideas, or expressions as your own original work.' },
      { name: 'Real paraphrase (still needs a citation)', para: 'Passing off someone else’s words or ideas as if you had created them yourself counts as plagiarism, and so it needs a citation (“Plagiarism,” 2026).' },
      { name: 'Quoted correctly', para: 'According to “Plagiarism” (2026), plagiarism is “the representation of another person’s language, thoughts, ideas, or expressions as one’s own original work”.' }
    ];
    var sbar = el('div', 'ex-actions');
    var ssel = el('select', 'preset-select'); ssel.setAttribute('aria-label', 'Sample paraphrases');
    SAMPLES.forEach(function (s, i) { var o = el('option', '', s.name); o.value = String(i); ssel.appendChild(o); });
    sbar.appendChild(ssel); p3.appendChild(sbar);
    var l1 = el('label', 'field-label', 'Source sentence (from the book, article or page)'); l1.setAttribute('for', 'cl-src');
    var src = el('textarea', 'cl-input'); src.id = 'cl-src'; src.rows = 3; src.value = SAMPLE_SRC;
    var l2 = el('label', 'field-label', 'Your sentence'); l2.setAttribute('for', 'cl-par');
    var par = el('textarea', 'cl-input'); par.id = 'cl-par'; par.rows = 3; par.value = SAMPLES[0].para;
    p3.appendChild(l1); p3.appendChild(src); p3.appendChild(l2); p3.appendChild(par);
    var out3 = el('div', 'cl-p3out'); p3.appendChild(out3);
    function paint(node, toks, mask, text) {
      node.textContent = ''; var pos = 0;
      toks.forEach(function (t, i) {
        if (t.start > pos) node.appendChild(document.createTextNode(text.slice(pos, t.start)));
        var w = text.slice(t.start, t.end);
        if (mask[i]) node.appendChild(el('mark', 'cl-mark', w));
        else if (t.quoted) node.appendChild(el('span', 'cl-quoted', w));
        else node.appendChild(document.createTextNode(w));
        pos = t.end;
      });
      if (pos < text.length) node.appendChild(document.createTextNode(text.slice(pos)));
    }
    function check() {
      var r = overlap(src.value, par.value, 4);
      out3.textContent = '';
      var a = el('div', 'cl-hl'); a.appendChild(el('span', 'cl-tag', 'Your sentence — highlighted = 4+ words in a row identical to the source')); var pa = el('p', 'cl-hlp'); paint(pa, r.para, r.pMask, par.value); a.appendChild(pa);
      var b = el('div', 'cl-hl'); b.appendChild(el('span', 'cl-tag', 'Source — the matching stretches')); var pb = el('p', 'cl-hlp'); paint(pb, r.source, r.sMask, src.value); b.appendChild(pb);
      out3.appendChild(a); out3.appendChild(b);
      var msg = {
        empty: 'Type your own sentence to see the result.',
        high: 'High exact overlap (' + Math.round(r.ratio * 100) + '% of your words sit in copied stretches; longest copied run: ' + r.longest + ' words). Put it in quotation marks with a citation, or rewrite it from your own understanding.',
        some: 'Some exact overlap (' + Math.round(r.ratio * 100) + '%; longest run ' + r.longest + ' words). Check whether those stretches should be quoted, or rephrase them.',
        low: 'Little exact overlap (' + Math.round(r.ratio * 100) + '%). That says nothing about the idea: if it is not yours, you still need a citation.'
      }[r.verdict];
      var v = el('p', 'cl-verdict cl-v-' + r.verdict, msg); v.setAttribute('role', 'status'); out3.appendChild(v);
      out3.appendChild(el('p', 'cl-fine', 'Words inside quotation marks are not counted as copied (they are shown in italic grey) – but a quotation still needs its citation with a page number.'));
    }
    src.addEventListener('input', check); par.addEventListener('input', check);
    ssel.addEventListener('change', function () { par.value = SAMPLES[+ssel.value].para; check(); });

    [p1, p2, p3].forEach(function (p) { panels.push(p); host.appendChild(p); });
    host.appendChild(status);

    // initial state
    var saved = null; try { saved = JSON.parse(load('form') || 'null'); } catch (e) { saved = null; }
    if (saved && saved.type) fillForm(saved); else { fillForm(PRESETS[0].data); story.textContent = PRESETS[0].story; }
    update(); check();
    var t0 = parseInt(load('tab') || '0', 10); show(t0 >= 0 && t0 <= 2 ? t0 : 0);
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
  }
})(typeof window !== 'undefined' ? window : globalThis);
