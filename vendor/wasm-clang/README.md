# vendor/wasm-clang — a real C++ compiler that runs in the browser

Powers the **“Run with real compiler”** button on every runnable exercise, tutorial and the
Playground. It is loaded **only when a student clicks that button**; the default ▶ Run still
uses the instant MiniCPP interpreter (`assets/minicpp.js`).

## What is in here

| File | What | Origin |
|---|---|---|
| `clang.wasm.gz` | clang 8.0.1 compiled to WebAssembly (29.8 MB → 10.0 MB gzipped) | upstream `clang`, gzipped |
| `lld.wasm.gz` | `wasm-ld` linker compiled to WebAssembly (18.6 MB → 6.4 MB) | upstream `lld`, gzipped |
| `sysroot.tar.gz` | wasi-libc + **libc++** headers and static libraries (8.9 MB → 1.7 MB) | upstream `sysroot.tar`, gzipped |
| `memfs.wasm` | in-memory file system shared by the tools | upstream `memfs`, renamed |
| `shared.js` | WASI shim + `API` class (compile / link / run) | upstream, **unmodified** |
| `cpp-worker.js` | **ours** — Web Worker: download with progress, gunzip, compile, link, run with stdin | CO1005 |
| `LICENSE`, `LICENSE.llvm` | Apache-2.0 (wasm-clang) and the LLVM licence | upstream |

Upstream: <https://github.com/binji/wasm-clang> at commit
`648c4a89997a351eef75cdaec3ef5b89d4937dec` (2023-12-07), by Ben Smith / WebAssembly Community
Group, Apache-2.0. The only change to upstream artifacts is `gzip -9 -n` and the file names.

Total download for a student: **≈ 18.5 MB, once** — afterwards the browser cache serves it.

## Why this one

Evaluated in September 2026 (see git history for the commit that added this folder):

- **Wasmer SDK + `clang/clang`** — 110 MB download, needs `SharedArrayBuffer` (so a
  COOP/COEP service-worker hack on GitHub Pages), and compiling anything that includes a libc++
  header (`<iostream>`, `<string>`) never finished in our tests. C and header-free C++ worked.
- **browsercc** — 184 MB, barely maintained.
- **TinyCC** — tiny, but a C compiler: no classes, no `<iostream>`.
- **wasm-clang (this)** — single-threaded, so no cross-origin isolation needed; works from any
  static host; libc++ included; compile ≈ 0.2–0.6 s, link ≈ 0.05 s on a laptop.

## How it is used

`assets/course.js` → `RealCpp.run(code, stdin, onStatus)` lazily creates
`new Worker('vendor/wasm-clang/cpp-worker.js')`, posts `{id, code, stdin}` and renders the
`result` message. Flags: `-std=c++17 -O0 -Wall`. The page kills and recreates the worker if a
program runs longer than 10 s (infinite loop).

The feature switches itself off where a Worker cannot load these files: pages opened from
`file://`, and the self-contained `dist/` builds (where `course.js` is inlined and has no URL).

## Known limits (worth telling students)

- clang **8** — C++17 yes, C++20 no.
- Exceptions are disabled: `try` / `throw` are rejected **at compile time** (“cannot use 'throw' with exceptions disabled”). Not part of CO1005 anyway.
- No threads, no file I/O beyond stdin/stdout.
- Integer division by zero and wild memory access stop the program with a runtime error instead of undefined behaviour.
- stdin is supplied up front from the Input box, exactly like the MiniCPP runner.
