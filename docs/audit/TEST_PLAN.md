# KẾ HOẠCH KIỂM THỬ TOÀN DIỆN HỆ THỐNG — NORI VEHICLE RENTAL (`2026-11-18`)

## 1. Mục tiêu & Phạm vi Đợt Final Remediation

Tiếp nối đợt audit nền (`241` Unit, `89` E2E), đợt kiểm thử nghiệm thu cuối tập trung xử lý triệt để:

1. **Khôi phục tính toàn vẹn `./nori.db`**: Kiểm toán 25 vi phạm FK cũ và Hero Slide #1 `"Hero Test 6e1f916c"`, xây dựng [`scripts/repair-nori-db.mjs`](../../scripts/repair-nori-db.mjs) chạy thử trên bản sao [`nori-qa-remediation.db`](../../DATABASE_INTEGRITY_REPORT.md) và xin xác nhận chủ sở hữu trước khi chạm DB gốc.
2. **Siết phân quyền RBAC 3 tầng**: Đóng `Folders`/`Tags`, khóa toàn bộ Payload `/api/*` theo ma trận 13 module, bổ sung quyền thứ 5 `publish` cho `Posts` & `NoriSite`, lọc PII khi Operator không có `customers:read`.
3. **Đồng bộ Trạng thái & Concurrency**: Thêm `expectedRevision`, `expectedTotalPrice`, khóa ghi giao dịch thanh toán với đơn `CANCELLED`/`REJECTED`, tự hủy phiếu `PENDING` & đưa `remainingAmount` về `0`, chặn khách tự hủy khi đã thu `CONFIRMED`.
4. **Hiệu năng, UAT, Multi-Browser & Vận hành Thực tế**: Tối ưu Mobile CWV & `/nori-api/fleet` (đo 3 lần độc lập), tải đồng thời `50` luồng, đo unit V8 coverage thực tế, chạy Chrome/Edge/Mobile WebKit, walkthrough UAT 7 bước, thêm `/nori-api/health`, `NORI_DISABLE_DEMO_SEED`, webhook fallback & diễn tập Backup/Restore.

---

## 2. Chiến lược Cô lập Dữ liệu Kiểm thử

1. Giữ nguyên an toàn `./nori.db` (có 2 bản sao lưu `VACUUM INTO` trong `backups/`).
2. Mọi lệnh build, đo hiệu năng, tải đồng thời, UAT và `92` Playwright E2E chỉ thao tác trên bản sao đã vá lỗi `./nori-qa-isolated.db` (`NORI_SQLITE_PATH`, `DATABASE_URI`).

---

## 3. Tiêu chí Đạt / Không Đạt (Exit Criteria)

| Tiêu chí                                           | Ngưỡng chấp nhận                                                |                                                 Kết quả đã xác minh                                                 |
| :------------------------------------------------- | :-------------------------------------------------------------- | :-----------------------------------------------------------------------------------------------------------------: |
| Typecheck & Static Lint                            | `0` lỗi TypeScript, `0` lỗi AST security                        |                                            **ĐẠT (`0` lỗi / `166` tệp)**                                            |
| Format Check (`oxfmt`)                             | `100%` tệp nguồn & audit chuẩn format                           |                                                  **ĐẠT (`100%`)**                                                   |
| Unit Tests & Coverage                              | `100%` PASS, công bố độ phủ thực tế                             |                                    **ĐẠT (`247/247` PASS · `93.54%` line cov)**                                     |
| Playwright Full E2E (`chromium` + `mobile-webkit`) | `100%` PASS (`0` fail, `0` skip)                                |                                      **ĐẠT (`92/92` PASS · `5.4m` · `0` FK)**                                       |
| Cross-Browser Edge & Repeat Stability              | Edge PASS + 30 lượt `--repeat-each=3` PASS                      |                            **ĐẠT (Edge `9/9` · Stability `30/30` · Firefox `BLOCKED`)**                             |
| Browser UAT Walkthrough                            | Full luồng Khách + Admin, `0` lỗi console/5xx                   |                                   **ĐẠT (`7/7` PASS · `0` console/5xx · `0` FK)**                                   |
| Concurrent API Load (`50` users)                   | `0` lỗi `5xx`, tối ưu `/nori-api/fleet`                         |                                   **ĐẠT (`606 RPS`, `p95=83ms`, `0` lỗi `5xx`)**                                    |
| Desktop & Mobile CWV                               | Desktop GOOD; Mobile cải thiện tối đa có kiểm chứng             | **Desktop GOOD (`244–408ms`); Mobile Catalogue `2260ms`, INP `64ms`, Home/Detail `2.87–3.06s` trên local raw JPEG** |
| Khôi phục `./nori.db` gốc                          | `integrity_check = ok`, `foreign_key_check = []`, Slide #1 đúng |                           **Bản sao ĐẠT (`0` FK) · `./nori.db` CHỜ XÁC NHẬN CHỦ SỞ HỮU**                            |
| Cloud `figma make verify-deploy`                   | Thực thi trên sandbox Make                                      |                                     **BLOCKED (thiếu binary `figma` ở local)**                                      |
