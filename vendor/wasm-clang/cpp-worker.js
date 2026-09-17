/* CO1005 — real C++ in the browser.
 *
 * Runs inside a Web Worker. Drives binji/wasm-clang (clang 8 + wasm-ld + libc++,
 * all compiled to WebAssembly; see README.md) to compile, link and run one C++
 * program with a fixed stdin. Nothing leaves the browser.
 *
 * Messages in:   { id, code, stdin, interactive?, eof? }
 *                interactive: a terminal is attached — if the program reads past `stdin`, stop and
 *                answer { needInput: true } (the page re-sends the job with one more line; the compiled
 *                program is cached, so that costs milliseconds). eof: the user pressed Ctrl+D.
 * Messages out:  { type: 'progress', id, label, loaded, total }
 *                { type: 'stage',    id, stage: 'load' | 'compile' | 'link' | 'run' }
 *                { type: 'result',   id, ok, stage, out, diagnostics, exit, error, needInput, truncated, times }
 */
self.importScripts('shared.js');

var MAX_OUTPUT = 200 * 1024;   // stop collecting program output after this many characters
var phase = 'tool';
var toolOut = '';
var progOut = '';
var truncated = false;
var currentId = null;

function isGzip(bytes) { return bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b; }

/* Fetch a vendored file with download progress; transparently gunzip `.gz` payloads.
   (The magic-byte check keeps this correct even if a server already decoded it.) */
async function fetchBytes(url, label) {
  var resp = await fetch(url);
  if (!resp.ok) throw new Error('could not download ' + url + ' (HTTP ' + resp.status + ')');
  var total = +resp.headers.get('content-length') || 0;
  var reader = resp.body.getReader();
  var chunks = [];
  var loaded = 0;
  for (;;) {
    var step = await reader.read();
    if (step.done) break;
    chunks.push(step.value);
    loaded += step.value.length;
    self.postMessage({ type: 'progress', id: currentId, label: label, loaded: loaded, total: total });
  }
  var bytes = new Uint8Array(loaded);
  var pos = 0;
  chunks.forEach(function (c) { bytes.set(c, pos); pos += c.length; });
  if (!isGzip(bytes)) return bytes.buffer;
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('this browser is too old to unpack the compiler (no DecompressionStream) — please update it');
  }
  var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).arrayBuffer();
}

var LABELS = {
  'memfs.wasm': 'file system',
  'sysroot.tar.gz': 'C++ standard library',
  'clang.wasm.gz': 'clang compiler',
  'lld.wasm.gz': 'linker'
};

var api = new API({
  clang: 'clang.wasm.gz',
  lld: 'lld.wasm.gz',
  sysroot: 'sysroot.tar.gz',
  memfs: 'memfs.wasm',
  readBuffer: function (name) { return fetchBytes(name, LABELS[name] || name); },
  compileStreaming: async function (name) {
    return WebAssembly.compile(await fetchBytes(name, LABELS[name] || name));
  },
  hostWrite: function (s) {
    if (phase !== 'prog') { toolOut += s; return; }
    if (s.indexOf('\x1b[91mError:') === 0) return;        // wasm-clang's own red banner; we report exits ourselves
    if (progOut.length >= MAX_OUTPUT) { truncated = true; return; }
    progOut += s;
  }
});
// wasm-clang narrates every step ("> clang -cc1 …", "Fetching and compiling …"); keep our output clean.
api.hostLog = function () {};
api.hostLogAsync = function (message, promise) { return promise; };

/* Thrown from inside wasm-clang's host_read (through our stdin object below) when an interactive
   program wants more input than has been typed so far. */
function NeedInput() { this.needInput = true; this.message = 'waiting for input'; }
function attachStdin(text, interactive) {
  api.memfs.setStdinStr(text);
  if (!interactive) return;
  // host_read only ever asks this object for `.length` and `.substr()`; asking for the length once
  // everything has been consumed means "the program is blocked on stdin".
  api.memfs.stdinStr = {
    get length() { if (api.memfs.stdinStrPos >= text.length) throw new NeedInput(); return text.length; },
    substr: function (from, len) { return text.substr(from, len); }
  };
}
var cache = { code: null, program: null, diagnostics: '' };

function stripAnsi(s) { return s.replace(/\x1b\[[0-9;]*m/g, ''); }
function cleanDiagnostics(s) {
  return stripAnsi(s).replace(/\r/g, '').split('\n')
    .filter(function (line) { return !/^Error: process exited with code \d+\.?$/.test(line.trim()); })   // wasm-clang's own banner
    .filter(function (line, i, all) { return line.trim() !== '' || (i > 0 && all[i - 1].trim() !== ''); })
    .join('\n').trim();
}

self.onmessage = async function (ev) {
  var job = ev.data;
  currentId = job.id;
  phase = 'tool'; toolOut = ''; progOut = ''; truncated = false;
  var times = {};
  var stage = 'load';
  var result = { type: 'result', id: job.id, ok: false, stage: stage, out: '', diagnostics: '', exit: null, error: null };
  var t = performance.now();
  try {
    self.postMessage({ type: 'stage', id: job.id, stage: 'load' });
    await api.ready;
    var clang = await api.getModule(api.clangFilename);
    var lld = await api.getModule(api.lldFilename);
    times.load = performance.now() - t;

    if (cache.code === job.code && cache.program) {
      var program = cache.program;                          // same source as last time: skip clang and the linker
    } else {
      stage = 'compile';
      self.postMessage({ type: 'stage', id: job.id, stage: stage });
      t = performance.now();
      cache.code = null; cache.program = null;
      api.memfs.addFile('main.cpp', job.code);
      // Upstream defaults we do not want: ANSI colours, and hard-wrapping diagnostics at 80 columns.
      var commonArgs = api.clangCommonArgs.filter(function (a, i, all) {
        return a !== '-fcolor-diagnostics' && a !== '-fmessage-length' && all[i - 1] !== '-fmessage-length';
      });
      await api.run.apply(api, [clang, 'clang', '-cc1', '-emit-obj'].concat(commonArgs,
        ['-std=c++17', '-O0', '-Wall', '-o', 'main.o', '-x', 'c++', 'main.cpp']));
      times.compile = performance.now() - t;

      stage = 'link';
      self.postMessage({ type: 'stage', id: job.id, stage: stage });
      t = performance.now();
      await api.link('main.o', 'main.wasm');
      times.link = performance.now() - t;
      program = await WebAssembly.compile(api.memfs.getFileContents('main.wasm'));
      cache.code = job.code; cache.program = program; cache.diagnostics = cleanDiagnostics(toolOut);
    }

    stage = 'run';
    self.postMessage({ type: 'stage', id: job.id, stage: stage });
    attachStdin(job.stdin || '', !!job.interactive && !job.eof);
    result.diagnostics = cache.diagnostics;               // warnings from a successful compile
    phase = 'prog';
    t = performance.now();
    await api.run(program, 'main.wasm');
    times.run = performance.now() - t;
    if (progOut.charAt(progOut.length - 1) === '\n') progOut = progOut.slice(0, -1);   // newline appended by api.run
    result.ok = true;
    result.exit = 0;
  } catch (e) {
    if (stage === 'run') {
      times.run = performance.now() - t;
      if (e && e.needInput) {
        result.ok = true;
        result.needInput = true;
      } else if (e && typeof e.code === 'number') {
        result.ok = true;              // the program ran and chose a non-zero exit status
        result.exit = e.code;
      } else {
        result.error = String((e && e.message) || e);   // a trap: divide by zero, out-of-bounds memory, stack overflow…
      }
    } else if (stage === 'compile' || stage === 'link') {
      result.diagnostics = cleanDiagnostics(toolOut);
      result.error = stage === 'compile' ? 'compilation failed' : 'linking failed';
    } else {
      result.error = String((e && e.message) || e);
    }
  }
  phase = 'tool';
  result.stage = stage;
  result.out = progOut;
  result.truncated = truncated;
  result.times = times;
  self.postMessage(result);
};
