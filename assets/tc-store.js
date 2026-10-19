/* Tiny compiler lab: "My programs" and the autosaved draft.  Pure logic over any Storage-like object ({getItem, setItem, removeItem}); every access is in try/catch,
   so a blocked or full localStorage just means "nothing is saved" and never breaks the page.  Also exported for Node tests.
   Keys:  co1005-tc-programs-v1   { v:1, items:[{id, name, src, input, updated}] }
          co1005-tc-draft-v1      { v:1, src, input, example, updated }                                                              */
(function (global) {
  'use strict';
  var PROGRAMS_KEY = 'co1005-tc-programs-v1', DRAFT_KEY = 'co1005-tc-draft-v1', MAX_ITEMS = 50, MAX_SRC = 20000, MAX_NAME = 60;

  function create(storage, clock) {
    var now = clock || function () { return Date.now(); };
    function read(key) {
      try { var raw = storage.getItem(key); if (!raw) return null; var o = JSON.parse(raw); return o && o.v === 1 ? o : null; } catch (e) { return null; }
    }
    function write(key, obj) { try { storage.setItem(key, JSON.stringify(obj)); return true; } catch (e) { return false; } }
    function clean(name) { return String(name || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, MAX_NAME); }
    function items() {
      var o = read(PROGRAMS_KEY);
      if (!o || !Array.isArray(o.items)) return [];
      return o.items.filter(function (it) { return it && typeof it.id === 'string' && typeof it.name === 'string' && typeof it.src === 'string'; })
        .map(function (it) { return { id: it.id, name: clean(it.name) || 'Untitled', src: it.src.slice(0, MAX_SRC), input: typeof it.input === 'string' ? it.input.slice(0, 2000) : '', updated: +it.updated || 0 }; });
    }
    function put(list) { return write(PROGRAMS_KEY, { v: 1, items: list }); }
    function newId(list) {
      var n = now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
      while (list.some(function (x) { return x.id === n; })) n += 'x';
      return n;
    }
    /* unique display name: "Name", "Name (2)", ... */
    function uniqueName(list, name, exceptId) {
      var base = clean(name) || 'My program', n = base, k = 2;
      while (list.some(function (x) { return x.id !== exceptId && x.name.toLowerCase() === n.toLowerCase(); })) n = base.slice(0, MAX_NAME - 5) + ' (' + (k++) + ')';
      return n;
    }
    return {
      list: function () { return items().sort(function (a, b) { return b.updated - a.updated; }); },
      get: function (id) { return items().filter(function (x) { return x.id === id; })[0] || null; },
      /* save({id?, name, src, input}) -> {ok, item} | {ok:false, reason} ; with an existing id the program is overwritten (and renamed) */
      save: function (p) {
        var list = items();
        if (typeof p.src !== 'string') return { ok: false, reason: 'nothing to save' };
        if (p.src.length > MAX_SRC) return { ok: false, reason: 'the program is longer than ' + MAX_SRC + ' characters' };
        var i = -1, k;
        if (p.id) for (k = 0; k < list.length; k++) if (list[k].id === p.id) i = k;
        if (i < 0 && list.length >= MAX_ITEMS) return { ok: false, reason: 'you can keep at most ' + MAX_ITEMS + ' programs; delete one first' };
        var item = { id: i >= 0 ? list[i].id : newId(list), name: uniqueName(list, p.name, i >= 0 ? list[i].id : null), src: p.src, input: String(p.input || '').slice(0, 2000), updated: now() };
        if (i >= 0) list[i] = item; else list.push(item);
        return put(list) ? { ok: true, item: item } : { ok: false, reason: 'the browser would not store it (storage is blocked or full)' };
      },
      rename: function (id, name) {
        var list = items(), it = list.filter(function (x) { return x.id === id; })[0];
        if (!it) return { ok: false, reason: 'not found' };
        it.name = uniqueName(list, name, id); it.updated = now();
        return put(list) ? { ok: true, item: it } : { ok: false, reason: 'the browser would not store it' };
      },
      remove: function (id) {
        var list = items(), n = list.length;
        list = list.filter(function (x) { return x.id !== id; });
        return { ok: list.length < n && put(list) };
      },
      draft: function () {
        var o = read(DRAFT_KEY);
        return o && typeof o.src === 'string' ? { src: o.src.slice(0, MAX_SRC), input: typeof o.input === 'string' ? o.input.slice(0, 2000) : '', example: typeof o.example === 'string' ? o.example : '', updated: +o.updated || 0 } : null;
      },
      saveDraft: function (src, input, example) { return write(DRAFT_KEY, { v: 1, src: String(src).slice(0, MAX_SRC), input: String(input || '').slice(0, 2000), example: example || '', updated: now() }); },
      clearDraft: function () { try { storage.removeItem(DRAFT_KEY); } catch (e) { /* ignore */ } }
    };
  }
  function browserStorage() { try { return global.localStorage; } catch (e) { return null; } }
  var nullStorage = { getItem: function () { return null; }, setItem: function () { throw new Error('no storage'); }, removeItem: function () {} };
  var api = { create: create, PROGRAMS_KEY: PROGRAMS_KEY, DRAFT_KEY: DRAFT_KEY, MAX_ITEMS: MAX_ITEMS, forBrowser: function () { return create(browserStorage() || nullStorage); } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else global.TcStore = api;
})(typeof window !== 'undefined' ? window : this);
