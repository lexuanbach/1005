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
│   └── chapter-3.html    # Selection Structure
├── supplementary/
│   ├── compiling.html         # S1: compile & run từng bước vs interpreter
│   ├── expression-trees.html  # S2: precedence → cây tính toán + Tree Lab (assets/expr-tree.js)
│   ├── floating-point.html    # S3: IEEE 754, 0.1+0.2 ≠ 0.3 + IEEE 754 Lab (assets/ieee754.js)
│   └── twos-complement.html   # S4: bù hai, tràn số + Two's Complement Lab (assets/twos.js)
├── assets/
│   ├── style.css         # Stylesheet chung cho chapter pages + playground (KHÔNG dùng cho index)
│   ├── minicpp.js        # Trình thông dịch C++ (MiniCPP) — chạy code trong trình duyệt
│   ├── course.js         # Engine chung: theme toggle, quiz MCQ, exercise runner, playground,
│   │                     #   editor tô màu cú pháp (overlay), fold từng section
│   ├── flow-sim.js       # Engine mô phỏng flowchart (parser biểu thức + VM chạy từng bước)
│   ├── flowchart-studio.js  # Mini app ghép flowchart từ khối + panel chạy từng bước (chapter 1)
│   ├── ch1-data.js       # Dữ liệu chương 1: 25 MCQs + 6 exercises (window.CHAPTER_DATA)
│   ├── ch2-data.js       # Dữ liệu chương 2: 28 MCQs + 6 exercises
│   └── ch3-data.js       # Dữ liệu chương 3: 26 MCQs + 6 exercises
├── build.py              # Build bản tự chứa cho Claude Artifact → dist/
├── dist/                 # Output build (inline assets, đã rewrite link) + urls.json
├── Lecture Slides/       # Slide gốc (pptx + pdf) — nguồn nội dung các chương
├── architecture.md       # File này
└── design.md             # Hệ thống thiết kế
```

## 3. Các hệ con quan trọng

### MiniCPP (`assets/minicpp.js`)
Trình thông dịch C++ tự viết (lexer → recursive-descent parser → tree-walking interpreter), phủ đúng tập con của môn: `int/long/float/double/bool/char/string`, `const`, if/else, switch, while/for/do-while, hàm với **pass by value và pass by reference** (lý do không dùng thư viện ngoài: JSCPP không hỗ trợ references), mảng 1 chiều, `cin/cout/getline`, `<cmath>`, `<iomanip>` (setw/setprecision/fixed). Có chặn vòng lặp vô hạn (5M bước) và giới hạn output (200 kB). API: `MiniCPP.run(code, stdinString, {write}) → {exit, error}`.

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
- **S3 IEEE 754 Lab** (`assets/ieee754.js`): encode/decode float32 & float64 qua DataView + BigInt; in **giá trị thập phân chính xác tuyệt đối** được lưu (`exactStored`) — nền tảng của câu chuyện 0.1 + 0.2 ≠ 0.3 (mọi hằng số trong trang đã kiểm bằng test + Decimal). Bit bấm được hai chiều, nhận diện zero/subnormal/inf/NaN. Test: `test-ieee.js` (19 test).

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
