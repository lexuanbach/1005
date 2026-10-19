/* Von Neumann Machine — example registry (data + validation only, no DOM).
   Item files (vn-examples-a.js, vn-examples-b.js, vn-examples-ext.js) call VNExamples.add([...]).
   Load order in a page: vn-examples.js first, then the item files. In Node each item file require()s this one.

   Item schema
   {
     id:        'swap'                      kebab-case, unique across ALL item files
     title:     'Swap two variables'        3–48 chars
     summary:   'one line for the card'     8–110 chars
     category:  'basics'                    one of CATEGORIES[].id
     level:     1 | 2 | 3                   Starter / Practice / Challenge
     isa:       'lecture' | 'ext'           optional, default 'lecture' (the slide-34 instruction set)
     settings:  { size?, isa?, memLatency?, wrap?, maxInstr? }   optional machine settings applied when the example is loaded
                size: 'auto' | 16 | 32 | 64 | 128 | 256   (default 'auto' = smallest power of two >= 16 that fits)
                isa mirrors the field above (the loader uses item.isa when settings.isa is missing)
     story:     '2–4 sentences: what it does, what to watch in the diagram'
     concepts:  ['LOAD/STORE', 'temporary variable']   1–5 tags
     src:       '; assembly source ...'     must assemble with the item's settings
     input:     '5 9'                       default text for the input-queue box ('' if none)
     tests:     [ { in:[5,9], out:[9,5] }, … ]   >= 3 cases (edge cases included); an error test is { in:[…], error:'step-guard' }
     cpp:       'complete C++ program with the same behaviour'   compile-verified; optional only when noCpp is given
     noCpp:     'reason'                    (string) only for examples that have no meaningful C++ twin
     tryThis:   ['challenge 1', …]          1–4 short challenges for the student
     slide:     'slide 28'                  optional pointer to the lecture material
   }
*/
(function (global) {
  'use strict';

  var CATEGORIES = [
    { id: 'basics',    title: 'Basics: moving and adding',          blurb: 'LOAD, STORE, ADD and friends: the accumulator R and the memory cells it talks to.' },
    { id: 'io',        title: 'Input and output',                   blurb: 'IN and OUT, sentinel values, and programs that talk to a user.' },
    { id: 'decisions', title: 'Decisions (if / else)',              blurb: 'COMPARE plus a conditional jump is every if statement you have written.' },
    { id: 'loops',     title: 'Loops',                              blurb: 'A loop is a JUMP backwards. Counting, summing, multiplying, and classic algorithms.' },
    { id: 'stored',    title: 'Stored program: code is data',       blurb: 'Instructions are just numbers in memory, so a program can read and rewrite itself.' },
    { id: 'wrong',     title: 'When things go wrong',               blurb: 'Deliberate bugs: runaway programs, executed data, a missing input. Read the error, find the cause.' },
    { id: 'speed',     title: 'Speed, size and the bottleneck',     blurb: 'Instruction counts, cycles, and why memory is the slow part of a Von Neumann machine.' },
    { id: 'ext',       title: 'Extended instruction set (supplementary)', blurb: 'Not on slide 34: immediate values, pointers, multiply and divide. Why real CPUs added them.' },
    { id: 'custom',    title: 'Customize the machine',              blurb: 'Change the memory size, the memory speed or the cell width and watch the same program behave differently.' }
  ];
  var LEVELS = { 1: 'Starter', 2: 'Practice', 3: 'Challenge' };
  var ISAS = { lecture: 'Lecture instruction set (slide 34)', ext: 'Extended instruction set (supplementary)' };
  var SIZES = ['auto', 16, 32, 64, 128, 256];

  var items = [], byId = Object.create(null), problems = [];   // no inherited keys: get('constructor') must be null

  function isStr(x, min, max) { return typeof x === 'string' && x.length >= min && x.length <= max; }
  function isIntList(a) { return Array.isArray(a) && a.every(function (v) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v; }); }
  function catOk(id) { return CATEGORIES.some(function (c) { return c.id === id; }); }

  // returns an array of problem strings (empty = valid)
  function validate(it) {
    var p = [];
    if (!it || typeof it !== 'object') return ['item is not an object'];
    if (!(typeof it.id === 'string' && /^[a-z][a-z0-9-]{1,40}$/.test(it.id))) p.push('id must be kebab-case, 2–41 chars');
    if (!isStr(it.title, 3, 48)) p.push('title must be 3–48 chars');
    if (!isStr(it.summary, 8, 110)) p.push('summary must be 8–110 chars');
    if (!catOk(it.category)) p.push('unknown category ' + it.category);
    if ([1, 2, 3].indexOf(it.level) < 0) p.push('level must be 1, 2 or 3');
    if (it.isa !== undefined && !ISAS[it.isa]) p.push('isa must be lecture or ext');
    if (it.settings !== undefined) {
      var s = it.settings;
      if (!s || typeof s !== 'object') p.push('settings must be an object');
      else {
        if (s.size !== undefined && SIZES.indexOf(s.size) < 0) p.push('settings.size must be auto/16/32/64/128/256');
        if (s.isa !== undefined && !ISAS[s.isa]) p.push('settings.isa must be lecture or ext');
        if (s.memLatency !== undefined && !(Number.isInteger(s.memLatency) && s.memLatency >= 1 && s.memLatency <= 50)) p.push('settings.memLatency must be an integer 1–50');
        if (s.wrap !== undefined && typeof s.wrap !== 'boolean') p.push('settings.wrap must be boolean');
        if (s.maxInstr !== undefined && !(Number.isInteger(s.maxInstr) && s.maxInstr >= 100 && s.maxInstr <= 5000000)) p.push('settings.maxInstr out of range');
      }
    }
    if (!isStr(it.story, 20, 800)) p.push('story must be 20–800 chars');
    if (!(Array.isArray(it.concepts) && it.concepts.length >= 1 && it.concepts.length <= 5 && it.concepts.every(function (c) { return isStr(c, 2, 40); }))) p.push('concepts must be 1–5 short strings');
    if (!isStr(it.src, 5, 8000)) p.push('src must be 5–8000 chars');
    if (it.input !== undefined && !isStr(it.input, 0, 200)) p.push('input must be a string (<= 200 chars)');
    if (!(Array.isArray(it.tests) && it.tests.length >= 3)) p.push('tests needs at least 3 cases');
    else it.tests.forEach(function (t, i) {
      if (!t || !isIntList(t.in)) p.push('tests[' + i + '].in must be a list of integers');
      if (t && t.error === undefined && !isIntList(t.out)) p.push('tests[' + i + '].out must be a list of integers (or give error)');
      if (t && t.error !== undefined && typeof t.error !== 'string') p.push('tests[' + i + '].error must be a string');
    });
    if (typeof it.cpp === 'string') { if (it.cpp.indexOf('main') < 0 || it.cpp.length > 4000) p.push('cpp must be a complete program (<= 4000 chars)'); }
    else if (!isStr(it.noCpp, 10, 200)) p.push('give cpp, or noCpp with a reason');
    if (!(Array.isArray(it.tryThis) && it.tryThis.length >= 1 && it.tryThis.length <= 4 && it.tryThis.every(function (t) { return isStr(t, 10, 260); }))) p.push('tryThis must be 1–4 strings of 10–260 chars');
    if (it.slide !== undefined && !isStr(it.slide, 3, 40)) p.push('slide must be a short string');
    return p;
  }

  function add(list) {
    (Array.isArray(list) ? list : [list]).forEach(function (it) {
      var p = validate(it);
      if (it && it.id && byId[it.id]) p.push('duplicate id ' + it.id);
      if (p.length) {
        problems.push({ id: it && it.id, problems: p });
        if (typeof console !== 'undefined' && console.warn) console.warn('VNExamples: skipped "' + (it && it.id) + '": ' + p.join('; '));
        return;
      }
      if (!it.isa) it.isa = 'lecture';
      if (!it.input) it.input = '';
      items.push(it); byId[it.id] = it;
    });
  }
  function get(id) { return byId[id] || null; }
  // filter: { category, level, isa, q }
  function list(f) {
    f = f || {};
    var q = f.q ? String(f.q).toLowerCase().trim() : '';
    return items.filter(function (it) {
      if (f.category && it.category !== f.category) return false;
      if (f.level && it.level !== f.level) return false;
      if (f.isa && it.isa !== f.isa) return false;
      if (q) {
        var hay = (it.id + ' ' + it.title + ' ' + it.summary + ' ' + it.concepts.join(' ')).toLowerCase();
        return q.split(/\s+/).every(function (w) { return hay.indexOf(w) >= 0; });
      }
      return true;
    });
  }
  // settings an example wants, with defaults filled in
  function settingsOf(it) {
    var s = it.settings || {};
    return { size: s.size === undefined ? 'auto' : s.size, isa: s.isa || it.isa || 'lecture', memLatency: s.memLatency || 1, wrap: !!s.wrap, maxInstr: s.maxInstr || 10000 };
  }

  var api = { CATEGORIES: CATEGORIES, LEVELS: LEVELS, ISAS: ISAS, SIZES: SIZES, items: items, byId: byId, problems: problems,
              validate: validate, add: add, get: get, list: list, settingsOf: settingsOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.VNExamples = api;
})(typeof window !== 'undefined' ? window : this);
