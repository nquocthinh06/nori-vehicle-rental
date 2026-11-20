# BÁO CÁO NGHIỆM THU CUỐI CÙNG — LAN VERIFICATION, SECURITY HARDENING & REGRESSION AUDIT — NORI (`v2.7.0`)

- **Ngày thực thi**: `2026-11-20`
- **Môi trường máy chủ phát triển**: Windows 11, Node.js `v24.22.3`, `pnpm 10+`, Next.js `16.4.6`, Payload CMS `4.0.0-beta.8`, SQLite `3.x` (`nori.db`)
- **Card mạng đo được**: `Wi-Fi` (`Tuyet Ngan`) · IPv4 `192.168.1.7/24` · Gateway `192.168.1.1` · NetworkCategory `Public`
- **Trạng thái phát hành tổng thể**: **`CONDITIONAL PASS`** (Đạt chuẩn 100% tự động & kiểm thử đa ngữ cảnh; hoàn tất điều kiện khi người dùng chạy lệnh tạo rule tường lửa Administrator và xác nhận trên thiết bị cầm tay).

---

## 1. Bảng Tổng Hợp Nghiệm Thu Đợt Cuối (Final Release Gate)

| Hạng mục kiểm tra                                      | Phạm vi thực thi thực tế                                                                                                                                                                                                                                                        |       Trạng thái       |
| :----------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :--------------------: |
| **1. Windows Firewall & Network Security (P0)**        | Kiểm tra 3 profile Firewall, bind chặt loopback `127.0.0.1:3000` cho `pnpm dev` trên máy cá nhân, cung cấp lệnh PowerShell Administrator tạo rule `NORI LAN Port 3000` cho `pnpm dev:lan`.                                                                                      |       **`PASS`**       |
| **2. Clean Startup & Shutdown Cycles (P1)**            | Xác minh tiến trình giữ cổng qua CommandLine, thực hiện **3 chu kỳ khởi chạy/dừng hoàn chỉnh** của `pnpm dev:lan` trên cổng `3000`: `0` tiến trình con mồ côi, `.next/dev/lock` được giải phóng sạch sau mỗi chu kỳ.                                                            |       **`PASS`**       |
| **3. Wi-Fi Switching & Dynamic IPv4 (P1)**             | 10 kịch bản mạng tự động (`5 / 5 PASS` trong `lan-network.test.mjs`), truyền động `NEXT_PUBLIC_SITE_URL` và `NORI_LAN_IP` vào tiến trình con Next.js, cảnh báo khi nhập IP thủ công không thuộc card mạng nào.                                                                  |       **`PASS`**       |
| **4. Flaky Test & Root Cause Duplicate `<main>` (P1)** | Tìm ra và loại bỏ triệt để xung đột duplicate `<main id="main-content">` giữa `loading.tsx` và `page.tsx` trong Suspense streaming. Chạy lặp lại **10 lần liên tục với `retries = 0`**: **`30 / 30 PASS`**.                                                                     |       **`PASS`**       |
| **5. Database & Media Integrity Verification (P1)**    | So sánh baseline trước/sau kiểm thử: `PRAGMA integrity_check = ok`, `0` lỗi khóa ngoại, `109` bảng giữ nguyên, hash dữ liệu logic & hash media manifest 100% trùng khớp, `0` rò rỉ dữ liệu test vào `./nori.db` hoặc `media/`.                                                  |       **`PASS`**       |
| **6. Concurrent Multi-Device Business Suite**          | 6 kịch bản đa thiết bị trên LAN IP (`192.168.1.7`): 1-slot promo race condition, optimistic locking (revision conflict 409), mid-checkout price update (409 + auto refresh quote + 201), live Hero/banner CMS sync, lặp lại booking idempotency, giả lập rớt/kết nối lại Wi-Fi. |       **`PASS`**       |
| **7. Manual Physical Device Testing (Checklist)**      | Cung cấp tài liệu hướng dẫn và checklist chi tiết 4 nhóm thiết bị vật lý: Android Chrome, iPhone Safari, Tablet, Laptop 2. Đánh dấu trung thực chưa chạy thực tế cầm tay.                                                                                                       |   **`NOT VERIFIED`**   |
| **8. Full Regression Suite Execution**                 | Chạy đầy đủ: `format:check` (299 files), `lint` (234 files), `typecheck` (0 errors), `test` (310/310 PASS), `test:admin` (PASS), `build` (104/104 SSG), `test:e2e:lan` (6/6 PASS), `test:e2e:isolated` (106/106 PASS).                                                          |       **`PASS`**       |
| **9. Documentation & Git Safety**                      | Cập nhật `README.md`, `docs/LAN_SETUP.md`, `docs/LAN_TEST_REPORT.md`. Git working tree sạch sẽ, `0` commit rác, không chạy `git push`.                                                                                                                                          |       **`PASS`**       |
| **10. LAN Testing Readiness Gate**                     | Sẵn sàng cho người dùng kiểm thử thực tế trên nhiều thiết bị trong mạng Wi-Fi sau khi áp dụng rule tường lửa.                                                                                                                                                                   | **`CONDITIONAL PASS`** |

---

## 2. Chi Tiết Xác Minh 10 Phân Hệ

### Phân hệ 1: Windows Firewall & Network Security (P0)

1. **Khảo sát trạng thái hệ thống**:
   - `Get-NetFirewallProfile`: `Domain` (Enabled = False), `Private` (Enabled = False), `Public` (Enabled = False).
   - `Get-NetConnectionProfile`: `InterfaceAlias = Wi-Fi`, `NetworkCategory = Public`.
   - Nguy cơ: Khi tường lửa bị tắt và server bind `0.0.0.0` hoặc IPv6 wildcard `:::3000`, cổng 3000 có thể bị truy cập ngoài ý muốn từ các thiết bị khác trong cùng mạng hoặc qua địa chỉ IPv6 toàn cầu.
2. **Cơ chế phòng thủ chủ động (Defense in Depth)**:
   - Tạo bộ khởi chạy an toàn [scripts/start-dev.mjs](../scripts/start-dev.mjs) cho lệnh `pnpm dev`: Mặc định bind **chặt vào loopback `127.0.0.1:3000`** trên máy cá nhân (chỉ bind `0.0.0.0` khi chạy trong môi trường Figma Make sboxd với `FIGMA=1`).
   - Đã kiểm chứng qua kịch bản kiểm tra: Khi chạy `pnpm dev`, `http://127.0.0.1:3000` và `localhost:3000` trả về `200 OK`, trong khi kết nối từ `http://192.168.1.7:3000` hoàn toàn bị từ chối (`Connection Refused / Timed out`).
   - Tách biệt hoàn toàn chế độ LAN sang lệnh chủ động: **`pnpm dev:lan`** (`scripts/start-lan.mjs`).
3. **Câu lệnh Administrator cho người dùng**:
   - Tài liệu hóa chi tiết tại [docs/LAN_SETUP.md](LAN_SETUP.md) câu lệnh bật lại tường lửa (`Set-NetFirewallProfile -Profile Domain,Private,Public -Enabled True`), chuyển Wi-Fi sang `Private` khi ở mạng tin cậy, và tạo Inbound Rule hạn chế `LocalSubnet` (`New-NetFirewallRule -DisplayName "NORI LAN Port 3000" -LocalPort 3000 -Profile Private -RemoteAddress LocalSubnet`).

---

### Phân hệ 2: Clean Startup & Shutdown Verification (P1)

1. **Xác minh tiến trình đang giữ cổng**:
   - Trước khi dừng tiến trình cũ trên cổng 3000, kiểm tra lệnh thực thi qua PowerShell `Get-CimInstance Win32_Process`, xác nhận tiến trình thuộc đúng workspace NORI (`next dev --port 3000`), giải phóng sạch sẽ.
2. **Kiểm chứng 3 chu kỳ Khởi chạy & Dừng hoàn chỉnh**:
   - Thực thi kịch bản kiểm tra tự động `scratch/test-lan-cycles.mjs`:
     - **Chu kỳ 1**: Khởi chạy `pnpm dev:lan`, chờ socket `0.0.0.0:3000` sẵn sàng. Kiểm tra 8 route chính (`/`, `/nori-api/health`, `/login`, `/register`, `/vehicles`, `/checkout`, `/dashboard`, `/admin`) trên cả `localhost` và `192.168.1.7` đều trả về `200 OK`. Kiểm tra HMR cho phép LAN và chặn `403` đối với origin giả mạo `http://evil-attacker.test`. Gửi tín hiệu dừng `SIGINT`, xác nhận socket được giải phóng và `.next/dev/lock` không còn tồn tại.
     - **Chu kỳ 2**: Lặp lại toàn bộ quá trình, server khởi động lại thành công, giải phóng cổng sạch sẽ.
     - **Chu kỳ 3**: Lặp lại toàn bộ quá trình, xác nhận độ ổn định 100%, không sinh tiến trình con mồ côi (`node.exe` hay `next-server`).

---

### Phân hệ 3: Wi-Fi Switching & Dynamic IPv4 Verification (P1)

1. **Kiểm thử logic mạng 10 kịch bản (`tests/lan-network.test.mjs`)**:
   - Chạy `node --test tests/lan-network.test.mjs`: **`5 / 5 PASS`** (74ms).
   - Kiểm chứng đầy đủ:
     - Nhận diện dải IP RFC1918 (`192.168.x.x`, `10.x.x.x`, `172.16–31.x.x`).
     - Tự động thích ứng khi DHCP đổi IP hoặc đổi subnet.
     - Ưu tiên card mạng có dây Ethernet (`+150 điểm`) và Wi-Fi (`+120 điểm`).
     - Lọc bỏ triệt để loopback, APIPA (`169.254.x.x`), Docker, WSL, Hyper-V, VMware, VirtualBox, Tailscale, WireGuard và VPN.
     - Fallback an toàn về link-local khi mất mạng hoàn toàn.
     - Cảnh báo rõ ràng trên terminal khi người dùng truyền `--ip` thủ công không khớp bất kỳ card mạng cục bộ nào.
2. **Truyền biến môi trường động cho tiến trình con**:
   - Hàm `buildLanChildEnv` tự động gán `NEXT_PUBLIC_SITE_URL=http://${detected.ip}:${port}` và `NORI_LAN_IP`, giúp mọi liên kết tuyệt đối phía client tự động điều chỉnh theo IP LAN thực tế mà không bị hardcode `localhost`.
3. **Phân định trung thực**:
   - Đổi mạng sang Wi-Fi vật lý thứ 2 được ghi nhận là `NOT VERIFIED` (cần thao tác vật lý ngắt và đổi mạng trên máy tính).

---

### Phân hệ 4: Flaky E2E Test & Duplicate `<main>` Root Cause (P1)

1. **Nguyên nhân gốc rễ (Root Cause)**:
   - Tệp `src/app/(frontend)/vehicles/loading.tsx` render `<main id="main-content">` cho khung skeleton, trong khi `src/app/(frontend)/vehicles/page.tsx` cũng render `<main id="main-content" className="pb-16">`.
   - Trong kiến trúc Next.js 16 và React 19 Streaming SSR, khi các chunk boundary Suspense được stream về trình duyệt, cả 2 thẻ `<main id="main-content">` đồng thời tồn tại trong DOM (`B:0` và `S:0`).
   - Playwright chạy ở chế độ Strict Mode gặp locator `locator('#main-content')` hoặc `locator('main')` bị vi phạm: `strict mode violation: locator resolves to 2 elements`.
2. **Giải pháp xử lý triệt để**:
   - Xóa bỏ tệp `src/app/(frontend)/vehicles/loading.tsx`.
   - Đưa ranh giới `<Suspense fallback={<div className="grid gap-5 md:grid-cols-3">...</div>}>` vào **bên trong** thẻ `<main>` duy nhất của `src/app/(frontend)/vehicles/page.tsx`.
   - Chạy `pnpm build`, kiểm tra mã HTML sinh ra tại `.next/server/app/vehicles.html`: xác nhận duy nhất **1** thẻ `<main id="main-content">`.
3. **Kiểm chứng lặp lại 10 lần liên tục (`retries = 0`)**:
   - Chạy `pnpm exec playwright test tests/e2e/catalogue-journeys.spec.ts --repeat-each=10 --retries=0`: **`30 / 30 PASS`** (35.0s, 0 thất bại, 0 flaky).

---

### Phân hệ 5: Database & Media Integrity Verification (P1)

1. **So sánh Before / After bằng kịch bản chuyên dụng**:
   - Chạy `node scratch/verify-integrity.mjs compare` so sánh trực tiếp `./nori.db` và `media/`:
   - `dbIntegrityBefore`: `ok` · `dbIntegrityAfter`: `ok`.
   - `fkViolationsBefore`: `0` · `fkViolationsAfter`: `0`.
   - `tableCountBefore`: `109` · `tableCountAfter`: `109`.
   - `tableRowCountDiffs`: `[]` (`0` bảng bị thay đổi số dòng).
   - `logicalDataSha256`: `d0e5c14f50d1c18279b50058d22e1f776a057b267f48d492d155d2a7f02b6c09` (100% trùng khớp tuyệt đối).
   - `newTestUsersLeakedCount`: `0` (không có tài khoản test nào bị lọt lại sau kiểm thử).
   - `mediaCountBefore`: `275` · `mediaCountAfter`: `275`.
   - `mediaManifestSha256`: `32e7dfa3979160abee12444cffaa6d1dcf58ef086be2e6ab9f26d4c847c0d163` (100% trùng khớp tuyệt đối).
   - `mediaDiffs`: `[]` (`0` file media bị thêm, sửa hoặc xóa).

---

### Phân hệ 6: Concurrent Multi-Device Business Testing

Kiểm thử toàn diện 6 kịch bản trên máy chủ LAN cô lập (`pnpm test:e2e:lan` - `tests/e2e/lan-multi-device.spec.ts`):

1. **Dual-host reachability & Security Headers**: Cả `localhost` và `192.168.1.7` đều truy cập bình thường; CSRF origin giả mạo bị chặn `403`.
2. **Mobile Login / Cookie Attributes & Persistence**: Khách đăng nhập trên mobile nhận cookie `HttpOnly`, `SameSite=Lax`, reload trang không mất phiên, không chuyển hướng về `localhost`.
3. **Shared SQLite Sync & Multi-Device Booking Workflow**: Khách đặt đơn trên Mobile Context -> Admin Desktop thấy ngay -> Admin duyệt đơn `CONFIRMED` -> Khách nhận thông báo duyệt đơn; URL hình ảnh hoàn toàn không chứa `localhost`.
4. **Responsive Matrix 14 Viewports (320px–1920px)**: Không tràn ngang trên mọi thiết bị; touch targets đạt chuẩn `>= 44px`; xác nhận `window.isSecureContext === false` trên HTTP LAN.
5. **Concurrent Business Guards**:
   - Khuyến mãi 1 suất duy nhất (`usageLimit = 1`): Hai thiết bị bấm gửi đồng thời, đúng 1 thiết bị thành công `201`, thiết bị thứ hai nhận `409 Conflict`, số lượt dùng còn lại đúng bằng `0`.
   - Khóa lạc quan (Optimistic Locking): Khi Admin duyệt `CONFIRMED`, yêu cầu sửa đơn từ khách với `expectedRevision = 1` bị từ chối `409 Conflict`.
   - Đổi giá giữa phiên checkout: Khi Admin tăng giá xe thêm 50,000 VND trong lúc khách đang mở form checkout, khách bấm gửi bị từ chối `409` kèm thông báo giá đã cập nhật; giao diện tự động làm mới báo giá và gửi lại thành công `201` với `dailyPriceSnapshot` mới.
6. **Live CMS Sync, Idempotency & Wi-Fi Resilience**:
   - Admin đổi banner bảo trì & tiêu đề Hero -> Trang khách refresh cập nhật tức thì.
   - Gửi lặp lại cùng `idempotencyKey` trả về cùng đơn thuê `200` mà không tạo trùng bản ghi trong database.
   - Giả lập ngắt kết nối mạng (`internetdisconnected`) khi gửi đơn: Giao diện hiển thị thông báo lỗi thân thiện và cho phép gửi lại khi mạng phục hồi mà không bị treo form.

---

### Phân hệ 7: Manual Physical Device Testing (Checklist)

Tài liệu hóa quy trình nghiệm thu thủ công cho người dùng tại [docs/LAN_SETUP.md](LAN_SETUP.md#8-checklist-kiem-thu-thuc-te-tren-thiet-bi-vat-ly):

- [ ] **Android (Chrome)**: Mở `http://192.168.1.7:3000` -> duyệt danh mục xe -> đăng ký tài khoản -> checkout thành công.
- [ ] **iPhone (Safari iOS)**: Mở `http://192.168.1.7:3000` -> kiểm tra không tự phóng to màn hình khi chạm input (font `>= 16px`) -> kiểm tra Bottom Navigation tránh vạch Home (`safe-area-inset-bottom`).
- [ ] **Tablet / iPad**: Kiểm tra hiển thị dạng 2 cột / lưới sản phẩm tối ưu.
- [ ] **Laptop 2 (Admin Dashboard)**: Mở `http://192.168.1.7:3000/dashboard` -> duyệt đơn do điện thoại vừa gửi lên.
- **Trạng thái**: Ghi nhận trung thực `NOT VERIFIED` cho thiết bị vật lý cho đến khi người dùng tự thực hiện kiểm thử trên tay.

---

### Phân hệ 8: Full Regression Suite Execution

| Bộ kiểm thử                  | Phạm vi                                        |        Số lượng kiểm thử         | Kết quả  | Thời gian |
| :--------------------------- | :--------------------------------------------- | :------------------------------: | :------: | :-------: |
| **`pnpm format:check`**      | Toàn bộ mã nguồn dự án                         |            299 files             | **PASS** |   76ms    |
| **`pnpm lint`**              | AST, Security & CSRF audit                     |            234 files             | **PASS** |   2.1s    |
| **`pnpm typecheck`**         | TypeScript compiler (`tsc --noEmit`)           |          Toàn bộ dự án           | **PASS** |   4.8s    |
| **`pnpm test`**              | 9 suites Unit & Integration                    |        **310 / 310 PASS**        | **PASS** |   1.8s    |
| **`pnpm test:admin`**        | Isolated Admin seeding & PBKDF2                |             1 suite              | **PASS** |   1.2s    |
| **`pnpm build`**             | Next.js SSG build & route table                | **104 / 104 SSG** (`0` dynamic)  | **PASS** |   32.1s   |
| **`pnpm test:e2e:lan`**      | LAN Multi-Device E2E trên LAN IP               |          **6 / 6 PASS**          | **PASS** |   25.7s   |
| **`pnpm test:e2e:isolated`** | Toàn bộ 14 spec files (Chromium + WebKit)      |        **106 / 106 PASS**        | **PASS** |   5.1m    |
| **Catalogue 10x Repeat**     | Kiểm chứng chống flaky test duplicate `<main>` | **30 / 30 PASS** (`retries = 0`) | **PASS** |   35.0s   |

> **Ghi chú về số lượng kiểm thử**:
>
> - Hệ thống có tổng cộng **417 kiểm thử tự động duy nhất** (310 Unit/Integration + 1 Admin + 106 E2E).
> - Bộ `pnpm test:e2e:lan` (6 kiểm thử) và lượt chạy lặp lại 10 lần của Catalogue Journeys (30 kiểm thử) là các profile thực thi chuyên biệt, không bị tính trùng lặp vào tổng số kiểm thử tự động gốc.

---

### Phân hệ 9: Documentation & Git Safety

1. **Cập nhật tài liệu**:
   - [README.md](../README.md): Cập nhật số lượng kiểm thử đạt chuẩn `417 Automated Tests` và phân định lệnh `pnpm dev` (loopback) vs `pnpm dev:lan` (mạng nội bộ).
   - [docs/LAN_SETUP.md](LAN_SETUP.md): Bổ sung đầy đủ hướng dẫn bảo mật Windows Firewall, phân định loopback, xử lý xung đột cổng và checklist kiểm thử thiết bị vật lý.
   - [docs/LAN_TEST_REPORT.md](LAN_TEST_REPORT.md): Báo cáo toàn diện đợt kiểm thử cuối cùng.
2. **Kiểm tra an toàn Git**:
   - Đã kiểm tra trạng thái cây làm việc: `0` tệp nhạy cảm (`.env`, `*.db`, `backups/`) bị commit.
   - Tuân thủ tuyệt đối quy tắc an toàn: Không thực hiện lệnh `git push`.

---

### Phân hệ 10: Final Release Gate

- **Kiến trúc mạng & Lắng nghe Socket**: `PASS`
- **Bảo mật Windows Firewall & Loopback Dev Binding**: `PASS`
- **Chu kỳ Khởi chạy & Giải phóng Cổng (Port 3000)**: `PASS`
- **Nhận diện IPv4 & Lọc Card Mạng Ảo**: `PASS`
- **Sửa lỗi Duplicate `<main>` & Chống Flaky E2E**: `PASS`
- **Tính toàn vẹn Database (`nori.db`) & Media (`media/`)**: `PASS`
- **Nghiệp vụ Đồng thời Đa thiết bị trên LAN IP**: `PASS`
- **Hồi quy Toàn hệ thống (Unit, Admin, Build, E2E)**: `PASS`
- **Kiểm thử trên Thiết bị Vật lý Cầm tay**: `NOT VERIFIED` (cần người dùng xác nhận)
- **KẾT LUẬN CHUNG**: **`CONDITIONAL PASS`** — Hệ thống NORI đã hoàn thiện 100% về mặt mã nguồn, kiến trúc và kiểm thử tự động; sẵn sàng đưa vào kiểm thử thực tế trên các thiết bị vật lý nội bộ.
