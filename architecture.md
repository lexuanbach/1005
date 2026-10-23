# Architecture — CO1005 Website

Tài liệu nền tảng về cấu trúc website môn học **CO1005 · Introduction to Computing**. Đọc cùng [design.md](design.md) (hệ thống thiết kế) trước khi sửa hoặc mở rộng.

## 1. Tổng quan

- **Dạng**: website tĩnh nhiều trang, không build framework, không dependency ngoài Google Fonts. Toàn bộ tính năng động (quiz, chạy C++, flowchart builder) là JavaScript thuần chạy client-side.
- **Ngôn ngữ**: English mặc định. Riêng trang chủ có nút chuyển EN/VI (hệ thống `data-i18n` + từ điển JS trong `index.html`); các trang chương chỉ có tiếng Anh.
- **Triển khai chính**: GitHub Pages tại **https://lexuanbach.github.io/1005/** — repo `lexuanbach/1005`, serve nhánh `main` từ root. Deploy = `git push` (Pages tự build, ~1 phút). `.gitignore` loại `dist/` và các file `.pptx` (chỉ commit PDF slides — chúng được link từ chip "Slides (PDF)" trên trang chương và hoạt động trên Pages). Ngoài ra có thể mở file trực tiếp hoặc publish qua Claude Artifact bằng `build.py` (xem mục 5).

## 2. Cấu trúc thư mục

```
CO1005-Website/
├── index.html            # Trang chủ: đề cương, EN/VI, theme toggle, links tới các chương
├── playground.html       # C++ Playground độc lập (8 chương trình mẫu)
├── chapters/
│   ├── chapter-1.html    # Algorithms & Flowcharts + Flowchart Studio
│   ├── chapter-2.html    # Basic Elements in C++
│   ├── chapter-3.html    # Selection Structure
│   ├── chapter-4.html    # Repetition Structures
│   ├── chapter-5.html    # Arrays & Strings (mảng 2 chiều)
│   ├── chapter-6.html    # Functions (static, array params)
│   ├── chapter-7.html    # Part 2: Von Neumann architecture (+ Von Neumann Machine lab)
│   ├── chapter-8.html    # Part 2: Assembly & compilers (+ Tiny Compiler lab)
│   ├── chapter-9.html    # Part 2: Computer networks (+ Packet Journey lab, subnet calculator)
│   ├── chapter-10.html   # Part 2: Databases (+ SQL Query Lab)
│   ├── chapter-11.html   # Part 2: Artificial intelligence (+ Learn the Function lab)
│   ├── chapter-12.html   # Part 2: LLMs & security (+ next-token, prompt-injection, password labs)
│   └── chapter-13.html   # Part 2: Citation & responsible AI (+ Citation Workshop)
├── supplementary/
│   ├── compiling.html         # S1: compile & run từng bước vs interpreter
│   ├── expression-trees.html  # S2: precedence → cây tính toán + Tree Lab (assets/expr-tree.js)
│   ├── floating-point.html    # S3: IEEE 754, 0.1+0.2 ≠ 0.3 + IEEE 754 Lab (assets/ieee754.js)
│   ├── twos-complement.html   # S4: bù hai, tràn số + Two's Complement Lab (assets/twos.js)
│   ├── loops-are-jumps.html   # S5: loop = compare+jump + Jump Machine (assets/jump-machine.js)
│   ├── arrays-in-memory.html  # S6: số học địa chỉ + Memory Lab (assets/memory-lab.js)
│   ├── call-stack.html        # S7: stack frame + Visualizer (assets/call-stack.js, dùng trace của MiniCPP)
│   ├── text-encoding.html     # S8: ASCII/Unicode/UTF-8 + Text Inspector (assets/text-lab.js)
│   ├── short-circuit.html     # S9: && / || bỏ qua hẳn vế sau + Short-Circuit Lab (assets/short-circuit.js)
│   └── loop-vs-recursion.html # S10: loop vs đệ quy chạy song song + Loop vs. Recursion Race (assets/recursion-lab.js)
├── assets/
│   ├── style.css         # Stylesheet chung cho chapter pages + playground (KHÔNG dùng cho index)
│   ├── minicpp.js        # Trình thông dịch C++ (MiniCPP) — chạy code trong trình duyệt
│   ├── course.js         # Engine chung: theme toggle, quiz MCQ, exercise runner, playground,
│   │                     #   editor tô màu cú pháp (overlay), fold từng section
│   ├── flow-sim.js       # Engine mô phỏng flowchart (parser biểu thức + VM chạy từng bước)
│   ├── flowchart-studio.js  # Mini app ghép flowchart từ khối + panel chạy từng bước (chapter 1)
│   ├── ch1-data.js       # Dữ liệu chương 1: 25 MCQs + 6 exercises (window.CHAPTER_DATA)
│   ├── ch2-data.js       # Dữ liệu chương 2: 28 MCQs + 6 exercises
│   ├── ch3-data.js       # Dữ liệu chương 3: 26 MCQs + 6 exercises
│   ├── ch4-data.js       # Dữ liệu chương 4: 26 MCQs + 7 exercises
│   ├── ch5-data.js       # Dữ liệu chương 5: 25 MCQs + 6 exercises
│   └── ch6-data.js       # Dữ liệu chương 6: 26 MCQs + 6 exercises
├── build.py              # Build bản tự chứa cho Claude Artifact → dist/
├── dist/                 # Output build (inline assets, đã rewrite link) + urls.json
├── Lecture Slides/       # Slide gốc (pptx + pdf) — nguồn nội dung các chương
├── architecture.md       # File này
└── design.md             # Hệ thống thiết kế
```

## 3. Các hệ con quan trọng

### MiniCPP (`assets/minicpp.js`)
Trình thông dịch C++ tự viết (lexer → recursive-descent parser → tree-walking interpreter), phủ đúng tập con của môn: `int/long/float/double/bool/char/string`, `const`, if/else, switch, while/for/do-while, hàm với **pass by value và pass by reference** (lý do không dùng thư viện ngoài: JSCPP không hỗ trợ references), mảng 1 chiều, `cin/cout/getline`, `<cmath>`, `<iomanip>` (setw/setprecision/fixed). Có chặn vòng lặp vô hạn (5M bước) và giới hạn output (200 kB). Mở rộng cho chương 4–6: **mảng 2 chiều** (khai báo, initializer lồng nhau, kiểm tra biên theo từng chiều), **truyền mảng vào hàm** `int b[]` (callee thao tác trên mảng của caller), **biến `static` cục bộ** (khởi tạo một lần, nhớ giữa các lần gọi; auto/register/extern chấp nhận và bỏ qua), **khởi tạo kiểu constructor** `string s(str, n, p)` / `int x(5)`. Lưu ý: MiniCPP dùng số JS nên KHÔNG mô phỏng wrap 32-bit của int (đã ghi chú trong S4). Test mở rộng: `test-minicpp-ext.js` (15 test). API: `MiniCPP.run(code, stdinString, {write}) → {exit, error}`.

### Real C++ — clang trong trình duyệt (`vendor/wasm-clang/`, `RealCpp` trong `assets/course.js`)
Nút **“⚙ Run with real compiler”** (mọi bài tập chạy được, mọi trang tutorial, và Playground) biên dịch bằng **clang 8 + wasm-ld + libc++ đã build sang WebAssembly** ([binji/wasm-clang](https://github.com/binji/wasm-clang), Apache-2.0), chạy hoàn toàn phía client trong một Web Worker — không server, không cần COOP/COEP. **Lazy**: không tải gì cho tới lần bấm đầu tiên (≈18,5 MB gzip, sau đó trình duyệt cache); ▶ Run mặc định vẫn là MiniCPP (tức thì, và là engine duy nhất cho sample tests, S7, S10). Cờ biên dịch: `-std=c++17 -O0 -Wall`; chương trình chạy quá 10 s thì trang kill worker (vòng lặp vô hạn) và tạo lại ở lần sau. Tự tắt (không hiện nút) khi `course.js` không có URL http(s): mở bằng `file://` hoặc bản `dist/` đã inline. Chi tiết, nguồn gốc file, lý do chọn (so với Wasmer SDK 110 MB / browsercc / TinyCC) và giới hạn: `vendor/wasm-clang/README.md`. API: `RealCpp.run(code, stdin, onStatus) → Promise<{ok, stage, out, diagnostics, exit, error, times}>`.

### Code giải thích khi rê chuột (`initExplainedExamples` + `CHAPTER_DATA.explain`)
Cùng cách khóa theo nhãn file của code-card như `.examples`: `window.CHAPTER_DATA.explain = { '<nhãn file>': [ { line, match, nth?, title, html }, … ] }`. Mỗi note đánh dấu đúng đoạn chữ `match` trên dòng `line` (đếm từ 1 trong `<pre>` của card; `nth` chọn lần xuất hiện sau trên cùng dòng). Phần được đánh dấu gạch chân chấm; rê chuột / chạm / Tab tới sẽ hiện note trong **một tooltip duy nhất** gắn vào `<body>` (position: fixed, nên không bị cuộn ngang của card cắt); click ghim lại, Esc hoặc click ra ngoài đóng. Dưới `<pre>` có `<details>` "All N explanations" liệt kê toàn bộ note (cho in ấn và screen reader; rê vào một mục làm sáng đoạn code tương ứng). `match` không tìm thấy chỉ gây `console.warn`, không làm hỏng trang. Các span tô màu sẵn trong `<pre>` được giữ nguyên (đóng/mở lại span khi marker cắt ngang). Mô phỏng `explain.js` của site 41039. Hiện có cho chương 6 (8 card, 45 note — mỗi mục 6.1–6.7 một ví dụ điển hình).

### Ví dụ trong bài giảng chạy được (`initRunnableExamples` + `CHAPTER_DATA.examples`)
Hầu hết code-card trong phần khái niệm là **đoạn mã rời, mã giả hoặc khuôn cú pháp**, không chạy được nguyên trạng. Vì vậy `assets/chN-data.js` có thêm `window.CHAPTER_DATA.examples = { '<nhãn file của card, phần trước " — " hoặc " (">': { code, stdin, note } }` — một **chương trình hoàn chỉnh** bọc ví dụ đó (mã giả chương 1 → bản C++; khuôn `if_else`/`switch`/`do_while` → ví dụ cụ thể của slide: thuế 3.3.1, máy tính 3.5.1…; đoạn rời → đặt trong `main` kèm input mẫu). Card nào có mục tương ứng sẽ được gắn nút **▶ Run** trên thanh tiêu đề; bấm vào mở ngay bên dưới một cửa sổ code đầy đủ (editor + toolbar, Input box/Interactive terminal, ▶ Run, real compiler, Reset to the example, Full screen) và chạy luôn bằng MiniCPP. Không sửa HTML của chương: thêm/đổi ví dụ chỉ cần sửa data file. 4 trích đoạn bug thật viết bằng C/Ada (Ariane, goto fail, Heartbleed, Knight Capital) cố ý không có nút; riêng vòng lặp Zune có bản C++ chạy được để thấy vòng lặp vô hạn thật. **Quy tắc:** mọi chương trình trong `examples` phải cho cùng output trên MiniCPP và clang thật (đã kiểm 25/25).

### Chế độ nhập: hộp Input hoặc Interactive terminal (`makeIo` trong `assets/course.js`)
Mỗi khối chạy code có công tắc **Input box / ⌨ Interactive terminal** (key `co1005-io-mode`). Terminal dùng kỹ thuật **chạy lại (re-execution)**: chạy chương trình với các dòng đã gõ; khi chương trình đọc quá phần input đang có, engine trả `needInput` → trang hiện output tới thời điểm đó + ô gõ trực tiếp trong khung Terminal; nhấn Enter thì chạy lại với thêm một dòng. Chương trình của môn là tất định nên sinh viên chỉ thấy một terminal bình thường. Dùng chung cho cả hai engine: MiniCPP (`opts.interactive` → `{needInput:true}`) và clang thật (worker gắn một đối tượng stdin giả vào `memfs.stdinStr` của wasm-clang, ném `NeedInput` khi `host_read` hỏi `.length` lúc đã đọc hết; chương trình đã biên dịch được **cache theo mã nguồn** nên chạy lại chỉ vài ms). Có nút End of input (Ctrl+D → chạy lại với EOF thật) và Stop (Ctrl+C); dán nhiều dòng = nạp từng dòng một để echo đúng chỗ. Sample tests luôn dùng đường batch.

**Test**: bộ test Node nằm ở scratchpad phiên làm việc (53 test interpreter + script `verify-exercises.js` chạy toàn bộ lời giải bài tập qua test của chúng). Khi sửa minicpp.js phải chạy lại cả hai.

### Dữ liệu chương (`assets/chN-data.js`)
Mỗi file gán `window.CHAPTER_DATA = { id, quiz: [{q, code?, opts, a, why}], exercises: [...] }`. Exercise có 2 loại: `{type:'text', title, brief, solutionText}` (làm trên giấy, có nút xem lời giải) và loại chạy được `{title, brief, starter, solution, tests:[{stdin, expect}]}`. **Mọi `expect` phải được sinh/kiểm bằng MiniCPP** — không đoán tay.

### Engine trang (`assets/course.js`)
Đọc `window.CHAPTER_DATA` và render vào các mount point: `#quiz-root`, `#exercises-root`; render playground vào `#playground-root` từ `window.PLAYGROUND_PRESETS`. Theme toggle dùng chung key localStorage **`co1005-theme`** với index.html.

### Flowchart Studio (`assets/flowchart-studio.js` + `assets/flow-sim.js`)
Mount vào `#studio-root` (chapter 1). State = mảng steps `{type, text, yes?, no?}`; palette 6 khối kèm hướng dẫn từng khối; branch của decision trỏ 'next' hoặc index step khác (trỏ ngược = vòng lặp); render SVG trực tiếp (class `fc-*` trong style.css cho theme); 3 preset: Payroll, Squares 4–9, Absolute value; cảnh báo cấu trúc (thiếu Start/End, decision 2 nhánh cùng next, step sau End).

**Chạy từng bước**: `flow-sim.js` (FlowSim) là engine thuần không DOM — parse text trong khối ("Pay ← Hours × Rate", "NUM > 9 ?", "count is even", "Print A, B"…) và thực thi: `create(steps)` → `step(sim, inputText)` / `runToEnd(...)`. Panel run trong Studio hiển thị bảng biến (highlight biến vừa đổi), terminal output, status; khối đang chạy sáng lên trên SVG (`.fc-now`) và trong editor (`.step-row.now`). Có guard 1000 bước chống lặp vô hạn; hết input → state `waiting-input` chờ nhập thêm. Test: `test-flowsim.js` + `test-flowsim2.js` (21 test) trong scratchpad.

**Nhánh "then →" (`go`)**: mọi khối input/process/output có thể trỏ mũi tên ra tới step bất kỳ (`{go: index}`) thay vì rơi xuống step kế — cho phép hai nhánh xử lý cùng vòng về một điểm. 6 preset: Payroll, Squares 4–9, Absolute value, Rocket countdown, Guess the number, Collatz 3n+1 (hai preset cuối dùng `go`). Lưu ý FlowSim chuẩn hóa "—" thành "-" cả trong chuỗi in — tránh em-dash trong text khối Output.

### Hệ thống Supplementary
- Tag `.supp-tag` (viền đứt, mono) đánh dấu nội dung ngoài phạm vi slide; exercise/quiz đặt `supp: true` trong data là tự hiện tag.
- Chủ đề bổ trợ là trang riêng trong `supplementary/`, đánh số S1, S2…; sidebar mọi trang chương có nhóm "Supplementary"; trang chủ có mat-card viền đứt. Quiz của trang bổ trợ khai báo `window.CHAPTER_DATA` inline ngay trong trang. Khi thêm SN mới: cập nhật sidebar ở TẤT CẢ trang chương + các trang S khác, thêm mat-card + VI keys ở index, đăng ký vào build.py, và thêm note dẫn từ concept liên quan trong chương.
- **S2 Tree Lab** (`assets/expr-tree.js`): parser precedence-đúng-C++ cho biểu thức số → cây (SVG tự layout), chuỗi fully-parenthesized, đánh giá từng bước post-order với integer division, kiểu int/double, và && / || short-circuit (cây con phải bị mờ đi khi bị bỏ qua). Test: `test-exprtree.js` (22 test).
- **S4 Two's Complement Lab** (`assets/twos.js`): số nguyên có dấu 8/16/32 bit qua BigInt — bit bấm được, đọc song song signed/unsigned/hex/place-values, nút ±1 đi thẳng vào tràn số (127+1 → −128), nút negate hiển thị 3 hàng invert-&-add-1 (kể cả edge case −(−128) = −128). Test: `test-twos.js` (22 test).
- **S5 Jump Machine** (`assets/jump-machine.js`): máy lệnh tí hon (SET/ADD/CMP/JGT…/JMP/PRINT/HALT) chạy từng bước với PC highlight — 4 preset là chính các vòng lặp chương 4. Test trong `test-s5678.js`.
- **S6 Memory Lab** (`assets/memory-lab.js`): scene bộ nhớ cố định limit|a[5]|balance — ghi a[i] hiện công thức base+i×size, vượt biên đè biến hàng xóm (mô phỏng); panel 2 khám phá row-major của b[3][4].
- **S7 Call Stack Visualizer** (`assets/call-stack.js`): dùng hook `opts.trace` MỚI của MiniCPP — interpreter phát sự kiện snapshot (line, stack frames + vars, globals, statics, output) sau mỗi statement/call/return, cap 600 events; visualizer phát lại từng bước có cả nút Back. Lưu ý kèm theo: thân hàm giờ chạy trực tiếp trong frame env (che tên tham số thành lỗi — đúng C++).
- **S8 Text Inspector** (`assets/text-lab.js`): từng ký tự → code point → byte UTF-8 (tự encode theo luật UTF-8, test đối chiếu TextEncoder).
- **S3 IEEE 754 Lab** (`assets/ieee754.js`): encode/decode float32 & float64 qua DataView + BigInt; in **giá trị thập phân chính xác tuyệt đối** được lưu (`exactStored`) — nền tảng của câu chuyện 0.1 + 0.2 ≠ 0.3 (mọi hằng số trong trang đã kiểm bằng test + Decimal). Bit bấm được hai chiều, nhận diện zero/subnormal/inf/NaN. Test: `test-ieee.js` (19 test).
- **S9 Short-Circuit Lab** (`assets/short-circuit.js`): 5 preset là chuỗi điều kiện `&&`/`||` gồm các "lệnh gọi" có log riêng — Step gọi thật từng điều kiện, dừng đúng lúc kết quả đã chắc chắn, phần còn lại bị đánh dấu "never called" (mờ + gạch ngang); có preset guard pattern an toàn/không an toàn (mảng out-of-range) và preset lộ side-effect bị bỏ qua.
- **S10 Loop vs. Recursion Race** (`assets/recursion-lab.js`): chạy **thật** một chương trình lặp và một chương trình đệ quy tính cùng kết quả qua MiniCPP (`opts.trace`, dùng lại cơ chế của S7), phát lại song song — 1 nút Step tiến cả hai theo từng statement đã ghi. Cột lặp hiện bảng biến phẳng (bộ nhớ hằng số); cột đệ quy hiện stack frame (`cs-frame`, tái dùng CSS của S7) phình to theo độ sâu. Preset "thiếu điều kiện dừng" cho thấy 2 kiểu lỗi thật khác nhau: vòng lặp treo ở 1 frame (`execution limit exceeded`) còn đệ quy tràn stack thật (`Maximum call stack size exceeded`, bắt được nhờ try/catch của MiniCPP).

### Team activity
Mỗi chương có section `#teamwork` (thảo luận nhóm 3–4 người + thuyết trình 5 phút, tính vào 10% điểm hoạt động lớp): Ch1 thiết kế thuật toán cho quy trình đời thường; Ch2 pitch một tool console nhỏ (ép dùng kiểu dữ liệu + formatting); Ch3 mã hóa chính sách quyết định (decision table → if-else/switch → test biên). Nội dung tĩnh trong HTML, tái dùng class `concept/tbl/note`.

### Điều hướng & thu gọn (chapter pages)
- **Sidebar trái** (`aside.side`, static HTML trong từng trang để build.py rewrite được link): danh sách chương 1–6 (4–6 đánh dấu "soon"), playground, và anchor "On this page". Hiện từ ≥1080px; dưới đó dùng topnav.
- **Fold section**: `course.js#initFolds()` biến mỗi `section.block` (trang có `#quiz-root`) thành phần thu gọn — mặc định đóng, click `.sec-head` mở, hash `#quiz`… tự mở section tương ứng; `.pagenav` luôn hiển thị ngoài fold.

### Quy tắc chất lượng quiz
Distractor phải dài **bằng hoặc hơn** đáp án đúng (tránh lộ "đáp án dài nhất"). Script kiểm: `audit-quiz.js` trong scratchpad — chạy sau mỗi lần sửa dữ liệu quiz, yêu cầu 0 flagged.

## 4. Bất biến nội dung

- **Mã môn CO1005**, tỷ trọng điểm 10/30/30/30, tuần 35–50, thi giữa kỳ tuần 42 — như đề cương; tuần 36 hiện **dạy bình thường** (tài liệu trên LMS của Thầy Ida) theo cập nhật của giảng viên.
- Nội dung chương bám sát slide trong `Lecture Slides/` — không bịa thêm khái niệm ngoài slide; ví dụ và số liệu trong quiz/exercise lấy từ chính slide khi có thể.
- Link chéo giữa các trang là **đường dẫn tương đối** (hoạt động local + host tĩnh); build.py rewrite thành URL artifact khi publish.
- Link chỉ chạy được trên máy (vd. PDF slide) phải mang class `local-only` — build.py sẽ bỏ chúng khỏi bản artifact.

## 5. Build & publish artifact

```
python3 build.py     # đọc dist/urls.json (nếu có) → dist/*.html tự chứa
```
Mỗi trang dist: inline style.css + mọi <script src> local, bỏ phần tử `.local-only`, bỏ wrapper `<html>/<head>/<body>` (artifact host tự bọc), rewrite href nội bộ theo `dist/urls.json`.

URL artifact hiện tại (trong `dist/urls.json`):
- index → https://claude.ai/code/artifact/17e72184-62a3-4aa1-939c-6d3f7b649f02
- chapter-1 → https://claude.ai/code/artifact/b62430c5-a4eb-4a6a-88ca-95472658494c
- chapter-2 → https://claude.ai/code/artifact/45e34766-52d7-497a-af80-7a23955ec5c5
- chapter-3 → https://claude.ai/code/artifact/4dbac6ed-0a69-4d20-a8ab-04b51eeba99e
- playground → https://claude.ai/code/artifact/3003692f-4162-4e31-83e1-f34d46e0209f

Quy trình cập nhật: sửa file nguồn → `python3 build.py` → republish file dist tương ứng (giữ nguyên URL).

## 6. Hướng mở rộng

1. Chapter 4 (Repetition), 5 (Arrays & Strings), 6 (Functions) — slide đã có sẵn trong `Lecture Slides/C++ PDF Slides/`; theo đúng khuôn: trang HTML + `chN-data.js` + verify bằng MiniCPP.
2. Trang cho phần computing topics (JVN, Network, Database, AI, LLM, Citations) từ các file pptx.
3. Lưu tiến độ quiz/exercise của sinh viên (localStorage) — chưa làm.

## 6. Part 2 — Computing topics (chapters 7–13, Weeks 43–49)

- Pages use `<body class="part2">` (teal accent via `body.part2` in style.css). Same sections as chapters 1–6 (concepts, lab, quiz, exercises, team activity, reading). Sources: the lecture decks in `Lecture Slides/` **and** the course textbook (ch.1→Ch7+8, ch.2→Ch9, ch.3→Ch10, ch.4→Ch11, ch.5 §5.1–5.3→Ch12, ch.6→Ch13); slide/textbook errors found while writing are corrected in `note warn` boxes on the pages. Week 50 (review) has no chapter.
- Exercises are `type:'text'`; several are "lab tasks" whose model answers were produced by running the lab engines in Node.
- Labs (pure engine exported for Node + thin UI + own CSS, all linked from the chapter): `vn-machine.js/-ui.js/.css` (Ch7+8 toy Von Neumann machine), `tiny-compiler.js/-ui.js` (Ch8; C++ subset → toy ISA), `packet-journey.js/.css` (Ch9; invented example.* zones and RFC 5737 addresses only), `sql-lab.js/-ui.js/.css` (Ch10; own SQL engine, cross-checked against sqlite3), `ai-lab.js/.css` (Ch11), `llm-engines.js` + `llm-lab.js/.css` (Ch12), `cite-lab.js/.css` (Ch13). Simulations are labelled as such on screen.
- The final-exam question banks in `261-exam/` are confidential and must never be reused in site quizzes.

## 7. Demo apps (`demos/`, one per Part-2 lecture)

Standalone, projector-friendly games/toys (each: `demos/<slug>.html` + `assets/demo-<slug>.js/.css`, pure logic exported for Node and tested; hub = `demos/index.html`; linked from the chapter's hero chips and from syllabus cards): `cpu-puzzles` (Ch7, reuses vn-machine.js), `decompile-me` (Ch8, vn-machine + tiny-compiler), `network-builder` (Ch9, IPv4 helpers from packet-journey.js), `sql-detective` (Ch10, sql-lab.js; culprit stored only as a hash), `neural-playground` (Ch11, own MLP + backprop), `injection-arena` (Ch12, own rule-based bots), `reference-detective` (Ch13, cite-lab.js; every real reference checked on Crossref 2026-10-18). All are labelled simulations; no network calls at runtime.

## 8. Component diagrams with animated interactions (labs + demos)

Every Part-2 lab and demo shows the system as blocks joined by arrows, with labelled tokens travelling between blocks as the engine works. Each animation is driven by an exported, tested event trace from the engine, never a fake loop: `vn-datapath.js` (Ch7 lab + `cpu-puzzles`; the reference implementation, also the shared `speedControl`), `compiler-flow.js/.css` + `TinyCompiler.trace` (Ch8 lab + `decompile-me`), `packet-journey.js` (Ch9 lab: packet cards + layer stacks) and `demo-network-builder.js` (`playScript`/`headerAt`), `sql-flow.js/.css` + `Database.trace` (Ch10 lab + `sql-detective`), `ai-flow.js/.css` + `traceSample` (Ch11 lab + `neural-playground` "Inspect a dot"), `llm-flow.js/.css` + `NGram.trace`/`Injection.trace` (Ch12 lab + `injection-arena`), `cite-flow.js/.css` + `trace`/`scanSteps`/`checkTrace` (Ch13 lab + `reference-detective`).
Conventions: six speed levels incl. Instant (persisted in localStorage), Pause/Resume and Step, `prefers-reduced-motion` = highlight only, values inside a block update only when the token lands, and diagram/narration/control rows have fixed or pre-measured heights so buttons never move between steps (see `fixHeights()` in packet-journey.js).

Colour: every block in every diagram has its own colour from the shared palette tokens `--cmp-1 … --cmp-11` (style.css, light + dark); arrows and tokens take the colour of their source block (or of the quantity they carry), the active block gets a glow and a thicker stroke, and each diagram has a legend. Colour is never the only cue (labels, glyphs, dash styles). Semantic ok/fail colours stay green/red.

## 9. Von Neumann workbench (Chapter 7 lab + `demos/von-neumann-machine.html`)

The Chapter 7 lab (`#vn-root`) is a workbench: ~70 examples, an editor for your own assembly, machine customization. Same code mounts on the chapter page and on the standalone full-width page.
- **Engine** `assets/vn-machine.js` (version 2, backward compatible: every program that assembled before gives identical memory, output, counts and trace): optional extended instruction set (`isa:'ext'`: LOADI/ADDI/SUBI/CMPI, LOADP/STOREP pointers, MUL/DIV/MOD, JUMPGE/JUMPLE, NOP; not on slide 34), memory size 16–256 (auto-grows), `memLatency` cycles per memory access (Von Neumann bottleneck stats), `wrap` (signed W-bit two's complement), step guard, error kinds, assembler diagnostics with line/col/hints/warnings, `runCases`, `stats`. Pure and Node-testable.
- **Modules**: `vn-editor.js/.css` (overlay editor: highlighting, gutter, diagnostics, breakpoints, autocomplete, own undo), `vn-store.js` (settings, `?vn=` share links `v1.<base64url>`, My programs, drafts, `.asm` files with `;@` metadata; hostile-input safe), `vn-examples.js` (registry + schema validation) with `vn-examples-a.js` / `-b.js` / `-ext.js` (items: story, tests from an independent oracle, compile-verified C++ twin, try-this challenges), UI in `vn-machine-ui.js` + `vn-workbench-lib.js/-parts.js/-tabs.js` + `vn-workbench.css` (Examples browser, Settings, tabs: Memory, Listing, Trace, Stats, Tests, Reference). `window.VNLab` is the end-to-end test hook.
- **Tiny Compiler (Chapter 8)** grew in parallel: 26 examples (`tc-examples.js`), a wider C++ subset (for, else-if, do-while, break/continue, && || !, `* / %` compiled to loops), an editor with live diagnostics, My programs, `?tc=` links and an "Open in the Von Neumann Machine" hand-off that uses the `?vn=` link format. For every program of the old subset the assembly and machine words are byte-identical to before.
- Verification used an independent Python reference interpreter written from the spec, golden diffs against the pre-change engine, C++ twins compiled with g++/clang++, and seven verifier lenses (differential, compatibility, examples, security, end-to-end, accessibility, educational).

## 10. Full-screen mode for every app

`assets/app-fullscreen.js` + `app-fullscreen.css`: each lab and demo page loads `<script src="…/app-fullscreen.js" data-root="<selector>">`; a "Full screen" button is inserted just above the app element (never inside it, so apps that rebuild their root are unaffected). Entering adds `.fs-active` to the app element (it becomes a viewport-filling fixed panel, which also works where the browser has no Fullscreen API) and asks the browser for real full screen on the whole page (so toasts, pop-overs and native dialogs keep working). A floating "Exit full screen" button (plus a Theme button) appears; Esc, the button or the browser's own key leave. Roots: `#vn-root` (Ch7 lab and the workbench page), `#tc-root`, `#net-root`, `#sql-root`, `#ai-root`, `#llm-root`, `#cite-root`, and for the demos `#cp-app`, `#dm-root`, `#nb-root`, `#sd-root`, `.np-stage`, `.ia-app`, `#rd-root`. A plain `F` shortcut is deliberately not used (Reference Detective uses F for a verdict).
- **Lecture slides (Part 2)**: `Lecture Slides/Part 2 PDF Slides/` holds PDF copies of the six original Part-2 decks (converted from the PPTX with LibreOffice, same page = slide numbers), because the PPTX files are gitignored and their links 404 on Pages. Never link a `.pptx` from a page.
- **Textbook slides** (`Lecture Slides/Textbook slides/`, from `slides.zip`, Oct 2026): the 2026 decks written with the textbook, linked from each chapter's hero as a second chip "Textbook slides (PDF)" next to the original lecture deck (slide numbers quoted on the pages still refer to the original deck). Ch1–6 PDFs were converted from the zip's PPTX with LibreOffice; Ch7 and Ch8 share the Von Neumann deck (Vietnamese), Ch13's deck is Vietnamese; Ch12 has no new deck yet.
- **Data-path explanations** (`vn-datapath.js` `EXPLAIN`): every box of the Von Neumann diagram, its legend entry, the CPU frame and the control unit explain themselves on hover, focus or tap. The analogy is a kitchen cooking from a recipe book, and each tooltip also shows the part's live value ("Right now"). It is one fixed tooltip on `<body>` (`.vn-dp-tip`, styles in vn-machine.css), so it works in full-screen mode too.
- **Full-screen splitters** (Von Neumann workbench, `vn-machine-ui.js` `splitters()` + `fs-vnm.css`): in the full-screen 3-column layout two vertical handles in the column gaps resize the editor and the tabs (`--vnfs-c1` / `--vnfs-c3`), and on screens ≥ 900px high a horizontal handle under the diagram shrinks or hides the program notes (`--vnfs-notes`). The diagram keeps its aspect ratio, so on a 1080p projector it only grows when both are used (751 → 1191 px wide). Widths are remembered per browser (`co1005-vnfs-cols`), arrow keys move a focused handle, double-click resets.
