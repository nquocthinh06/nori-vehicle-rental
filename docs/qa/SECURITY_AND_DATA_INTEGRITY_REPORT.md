# NORI VEHICLE RENTAL — BÁO CÁO BẢO MẬT & TOÀN VẸN DỮ LIỆU (SECURITY & DATA INTEGRITY REPORT)

- **Ngày kiểm toán**: 2026-11-20
- **Phạm vi kiểm toán**: An toàn ứng dụng (OWASP Top 10), xác thực & phân quyền, quản lý secret, cấu trúc CSDL SQLite và bảo toàn dữ liệu nghiệp vụ.

---

## 1. Kết quả Kiểm toán An toàn Ứng dụng (Application Security Audit)

| Hạng mục An toàn                        | Lỗ hổng Nguy cơ (OWASP)                                  | Cơ chế Phòng vệ trong Mã Nguồn                                                                                                               | Trạng thái Nghiệm thu |
| :-------------------------------------- | :------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------: |
| **Cách ly Dữ liệu (Anti-IDOR)**         | Broken Access Control / Insecure Direct Object Reference | Server kiểm tra quyền sở hữu `booking.customer === user.id`. Không cho phép xem/hủy/sửa đơn của người khác.                                  |    **PASS (100%)**    |
| **Chống Leo thang Đặc quyền**           | Privilege Escalation                                     | Phân quyền RBAC phía server trong `src/access/nori.ts`. `BRANCH_MANAGER` bị cấm tạo `SUPER_ADMIN` hoặc `SYSTEM_ADMIN`.                       |    **PASS (100%)**    |
| **Bảo vệ CSRF & Nguồn Request**         | Cross-Site Request Forgery                               | Hàm `assertOrigin()` trong `src/lib/api-utils.ts` xác thực Origin / Referer khớp với domain ứng dụng hoặc IP LAN hợp lệ.                     |    **PASS (100%)**    |
| **Chống Tiêm nhiễm SQL (SQLi)**         | SQL Injection                                            | 100% truy vấn qua Payload Local API & Drizzle ORM với Parameterized Queries, không ghép chuỗi SQL thô.                                       |    **PASS (100%)**    |
| **Chống XSS (Cross-Site Scripting)**    | Cross-Site Scripting                                     | React JSX auto-escaping, Lexical HTML parser kiểm duyệt mã độc, không sử dụng `dangerouslySetInnerHTML` tùy tiện.                            |    **PASS (100%)**    |
| **Chống CSV Formula Injection**         | CSV Injection / Formula Hijacking                        | Hàm `escapeCsvCell()` trong `src/lib/admin-api.ts` tự động chèn tiền tố nháy đơn `'` trước các ký tự `=`, `+`, `-`, `@`.                     |    **PASS (100%)**    |
| **Bảo vệ Secret & Khóa Bí mật**         | Sensitive Data Exposure                                  | `static-lint.mjs` quét AST AST toàn bộ 237 files: không có `process.env` secret nào lọt vào Client Components hoặc `NEXT_PUBLIC_*`.          |    **PASS (100%)**    |
| **Bảo vệ Cookie & Phiên đăng nhập**     | Session Hijacking / Cookie Manipulation                  | Cookie `nori_app_session` có cờ `HttpOnly`, `SameSite=lax`. Trên HTTP LAN, cờ `Secure` tự động tắt để tránh mất phiên trên điện thoại Wi-Fi. |    **PASS (100%)**    |
| **Chống Tấn công brute-force & replay** | Brute Force & Token Replay                               | Băm mật khẩu quản trị chuẩn `PBKDF2-SHA256` với salt ngẫu nhiên 32 bytes (100k rounds). Thu hồi JWT tức thì khi admin bị khóa (`REVOKED`).   |    **PASS (100%)**    |

---

## 2. Kết quả Kiểm toán Tính Toàn vẹn Dữ liệu CSDL (Database Integrity)

### Kiểm tra Kỹ thuật SQLite trên `nori.db`

- **PRAGMA integrity_check**: `ok` (0 trang hỏng, 0 lỗi b-tree).
- **PRAGMA foreign_key_check**: `0` vi phạm (toàn bộ 32 bảng quan hệ và khóa ngoại toàn vẹn tuyệt đối).
- **Chế độ Journal**: `WAL` (Write-Ahead Logging), tối ưu hóa đọc/ghi đồng thời, `busyTimeout = 10000ms`.
- **Tổng số bảng hiện hành**: `109` bảng (đã áp dụng đầy đủ 4 batch migrations).

### Kiểm tra Bất biến Nghiệp vụ (Business Invariants)

1. **Không có đơn thuê xung đột (Zero Double-Booking)**:
   Bảng `rental_days` lưu trữ khóa ngày nguyên tử dạng composite index `(vehicle_id, day)`. Hai đơn thuê trùng ngày cho cùng 1 xe bị SQLite ném lỗi ràng buộc duy nhất và API trả về `409 Conflict`.
2. **Không có khóa ngày mồ côi (Zero Orphaned Locks)**:
   Khi đơn thuê bị hủy (`CANCELLED`) hoặc từ chối (`REJECTED`), hook `afterChange` tự động giải phóng toàn bộ các ngày tương ứng trong `rental_days`.
3. **Optimistic Locking (Chống ghi đè đồng thời)**:
   Mọi thao tác chỉnh sửa đơn hoặc duyệt đơn yêu cầu trường `expectedRevision`. Nếu khách hàng và quản trị viên thao tác cùng lúc, giao dịch thứ hai bị từ chối `409 Conflict` kèm yêu cầu tải lại dữ liệu mới nhất.
4. **Bảo tồn Dữ liệu Lịch sử (Snapshot Immutability)**:
   Khi đơn thuê được tạo, các thông tin giá thuê (`pricingRuleSnapshot`), địa điểm (`locationSurchargeSnapshot`), tiền cọc (`reservationDepositSnapshot`) được đóng băng. Việc quản trị viên tăng giá xe catalogue sau đó không làm thay đổi giá của các đơn đã tạo trong quá khứ.

---

## 3. Bằng chứng Bảo toàn Database và Cách ly Môi trường Test

1. **Phương thức cô lập kiểm thử**:
   Tất cả các bài kiểm thử E2E và tải (`scripts/run-e2e-isolated.mjs`, `scripts/load-test.mjs`, `tests/db-migration-regression.test.mjs`) đều thực thi trên các bản sao database độc lập (`nori-e2e-*.db`, `temp-*.db`) và thư mục media tạm thời.
2. **Bằng chứng CSDL chính `nori.db` không bị ảnh hưởng**:
   - Số lượng tài khoản `users`: `16` (trước test: 16, sau test: 16).
   - Số lượng tài khoản `admins`: `2` (trước test: 2, sau test: 2).
   - Số lượng đơn thuê `bookings`: `12` (trước test: 12, sau test: 12).
   - Số lượng giao dịch `payments`: `6` (trước test: 6, sau test: 6).
   - Số lượng tệp `media` hoạt động: `81` (trước test: 81, sau test: 81).
   - Không có bất kỳ tài khoản test, đơn thuê test hoặc bản ghi tạm thời nào lọt vào CSDL chính `nori.db`.
3. **Bản sao lưu dự phòng nhất quán**:
   Bản sao lưu được tạo trước đợt kiểm thử tại:
   `backups/nori-backup-2026-11-20T14-31-53-461Z.db` kèm bundle media đầy đủ (4144 KB, 81 media files).
