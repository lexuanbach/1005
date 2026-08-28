# Design System — CO1005 · Introduction to Computing

Tài liệu nền tảng về thiết kế. Mọi thay đổi giao diện trên website phải tuân theo hệ thống này để giữ tính nhất quán.

## 1. Định hướng

- **Đối tượng**: sinh viên năm nhất — tra cứu lịch học/điểm trên trang chủ, học khái niệm + làm quiz + chạy code trên trang chương.
- **Giọng thiết kế**: chuyên nghiệp, dễ quét mắt (scannable), có chất "computing" qua font mono và thẻ code — nhưng không lòe loẹt.
- **Ngôn ngữ nội dung**: English mặc định; trang chủ có toggle EN/VI (từ điển `data-i18n` trong index.html); trang chương/playground chỉ tiếng Anh.
- **Nơi khai báo CSS**: trang chủ giữ CSS inline riêng; chapter pages + playground dùng chung `assets/style.css`. Hai nơi cùng một bộ token — đổi token phải đổi cả hai.

## 2. Màu sắc (design tokens)

Màu được khai báo bằng CSS custom properties trên `:root`. **Không hard-code màu trong component** — luôn dùng token.

### Light theme (mặc định)

| Token | Giá trị | Vai trò |
|---|---|---|
| `--paper` | `#F7F9FC` | Nền trang (trắng lạnh, thiên xanh) |
| `--surface` | `#FFFFFF` | Nền thẻ/card, dải thông tin |
| `--ink` | `#131C2E` | Chữ chính (navy đậm) |
| `--ink-soft` | `#46536B` | Chữ phụ, mô tả |
| `--line` | `#DDE4EF` | Viền, đường kẻ |
| `--accent` | `#2050D8` | Cobalt — **Phần 1: C++** |
| `--teal` | `#0E8A7B` | Teal — **Phần 2: Chủ đề điện toán** |
| `--amber` | `#B45309` | Đánh dấu **thi giữa kỳ** |
| `--red` | `#C23A3A` | Đánh dấu **nghỉ lễ** |
| `--code-bg` | `#0A111E` | Nền thẻ code — mặc định "Midnight", độc lập với theme sáng/tối của trang |

### Code theme (độc lập với theme sáng/tối)

Màu code (`--code-bg/--code-text/--code-caret/--code-kw/--code-str/--code-fn/--code-cm` cho code-card tĩnh, và bộ `--code-hl-*` giàu hơn cho editor sống) **không** đổi theo theme sáng/tối của trang — thay vào đó có nút riêng (`#code-theme-toggle`, mono, cạnh nút Dark/Light) cho phép chọn giữa 3 theme, lưu ở `localStorage['co1005-code-theme']`, áp qua `[data-code-theme]` trên `<html>`:

- **Midnight** (mặc định, không cần attribute): navy đậm, giữ nguyên giao diện gốc.
- **Paper**: nền gần trắng, chữ tối — cho người thấy nền tối khó đọc.
- **Contrast**: nền đen tuyệt đối, màu cực rực để phân biệt token dễ hơn.

index.html giữ bản sao độc lập của các token này (như mọi token khác) và nút riêng cùng key localStorage.

### Nguyên tắc màu

- Màu **mã hóa cấu trúc môn học**: cobalt = phần C++, teal = phần chủ đề điện toán. Mọi thành phần thuộc một phần (card, hàng lịch học, nhãn giai đoạn) dùng đúng màu phần đó.
- Amber/đỏ là **màu ngữ nghĩa** (semantic) cho tuần đặc biệt — không dùng trang trí.
- Nền màu nhạt tạo bằng `color-mix(in srgb, var(--token) N%, transparent)` thay vì thêm hex mới.

### Dark theme

Ba trạng thái theme phải được hỗ trợ đủ:

1. `:root` — light palette đầy đủ (mặc định).
2. `@media (prefers-color-scheme: dark)` với guard `:root:not([data-theme="light"])` — theo hệ điều hành.
3. `:root[data-theme="dark"]` — người dùng chọn dark rõ ràng.

Dark dùng nền `#0D1420`, surface `#151F30`, chữ `#E8EDF6`; accent/teal/amber/red được **làm sáng** (vd. accent → `#7DA2FF`) để đủ tương phản trên nền tối. Không bao giờ khai báo một màu chỉ trong block dark/light mà thiếu ở `:root`.

## 3. Typography

| Vai trò | Font | Weight | Dùng cho |
|---|---|---|---|
| Display | **Archivo** | 700–800 | `h1`, `h2`, `h3` tiêu đề section/card |
| Body | **Be Vietnam Pro** | 400–600 | Chữ chạy, mô tả (thiết kế riêng cho tiếng Việt) |
| Utility | **IBM Plex Mono** | 400–600 | Mã tuần, phần trăm, eyebrow, chip, badge, code |

- Nguồn: Google Fonts (subset `vietnamese` — cả ba font đều hỗ trợ). Luôn có fallback stack (`sans-serif`, `monospace`, `system-ui`).
- Body: `16.5px`, line-height `1.65`. Đoạn văn giới hạn ~`34–46rem` chiều rộng.
- Tiêu đề lớn: `clamp()` để co giãn, `letter-spacing` âm nhẹ, `text-wrap: balance`.
- Eyebrow/label viết hoa: mono + `letter-spacing: 0.1em–0.14em`.
- Số liệu xếp cột: `font-variant-numeric: tabular-nums`.

## 4. Layout & spacing

- Container: `max-width: 68rem`, padding ngang `1.5rem`.
- Spacing giữa các phần tử anh em bằng `gap` của flex/grid, **không** dùng margin từng phần tử.
- Card: `border-radius: 10–12px`, viền `1px var(--line)`, shadow token `--shadow` (rất nhẹ).
- Breakpoint chính: `900px` (grid 3→1), `820px` (hero 2→1, facts 4→2), `720px`, `640px` (ẩn topnav), `560px` (lịch học 1 cột).
- Nội dung rộng (code, bảng) phải nằm trong container có `overflow-x: auto`.

### Token bổ sung (assets/style.css)

- `--green` (#1B7F3B / dark #5BC97E): trạng thái đúng/pass trong quiz và test bài tập.
- `--accent-contrast` (#FFFFFF / dark #0D1420): màu chữ trên nền `--accent` (nút primary).
- Lớp SVG lưu đồ `fc-terminal / fc-io / fc-process / fc-decision / fc-connector / fc-line / fc-text / fc-label` — tô màu qua token nên tự đổi theo theme; terminal = accent, input/output = teal, process = trung tính, decision = amber.

## 5. Thành phần (components)

- **Topbar**: sticky, nền mờ (`backdrop-filter: blur`), wordmark mono `CO1005 · Nhập môn Điện toán`, anchor links tới 4 section.
- **Hero**: 2 cột — headline + chip meta bên trái, thẻ code C++ bên phải. Thẻ code là điểm nhấn "computing" duy nhất của trang.
- **Facts strip**: 4 ô số liệu nhanh (mã môn, thời gian, tuần thi, tuần nghỉ), kẻ viền chia ô.
- **Part card**: viền trên 3px màu phần (cobalt/teal), tag mono, danh sách chủ đề dạng pill.
- **Outcome group**: checklist với dấu `✓` màu teal.
- **Grade bar**: thanh phân đoạn flex theo đúng tỷ trọng 10/30/30/30 — độ rộng là dữ liệu, kèm `aria-label` mô tả đầy đủ.
- **Week row**: grid `5.2rem | 1fr`, viền trái 3px theo màu phần; tuần đặc biệt (`.special.holiday` / `.special.midterm`) có nền nhuộm nhạt + badge mono.
- **Mat card** (trang chủ, section Materials): card link tới trang chương, viền trên 3px accent (teal cho playground), số chương mono + tiêu đề Archivo + meta mono.
- **Quiz** (`.quiz-q`, `.opt`): câu hỏi dạng card; lựa chọn là button với key A–D mono; sau khi chấm: đúng viền `--green`, chọn sai viền `--red`, giải thích `.why` viền trái teal; thanh `.quiz-bar` sticky dưới topbar chứa nút chấm/làm lại + điểm.
- **Exercise runner** (`.ex`): editor textarea nền `--code-bg` + ô stdin + terminal output; nút Run primary; test row pass/fail với diff mono; lời giải trong `<details>` viền đứt.
- **Flowchart Studio** (`.studio`): 2 cột — panel palette (icon SVG + tên + mô tả, panel "block help" bên dưới) và canvas SVG + hàng cảnh báo `⚠` màu amber + editor từng step (chip loại khối theo màu ngữ nghĩa của symbol).
- **Note/callout** (`.note`): viền trái 3px, biến thể `tip` (teal), `warn` (amber), `danger` (red), tag mono viết hoa.
- **Data table** (`.tbl`): header uppercase nhỏ nền accent 5%, ô mono cho code/số, `.ok`/`.bad` xanh/đỏ.
- **Read card** (`.read-card`): further reading — kind mono teal + tiêu đề + mô tả, hover viền accent.

## 6. Accessibility & chuyển động

- Focus hiển thị rõ: `outline: 2px solid var(--accent)` cho mọi phần tử tương tác.
- `scroll-behavior: smooth` chỉ bật trong `@media (prefers-reduced-motion: no-preference)`.
- Không animation trang trí; hiệu ứng giới hạn ở hover/focus.
- Thành phần thuần hình ảnh (thẻ code hero) đặt `aria-hidden="true"`; grade bar có `role="img"` + `aria-label`.
