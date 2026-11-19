---
name: nori-performance
description: Quy tắc bắt buộc về hiệu năng, tối giản mã nguồn, tính toàn vẹn giao dịch và nghiệm thu production của NORI.
---

# NORI — Performance & Code Quality Skill

Bản bổ sung cho SKILL.md và AGENTS.md hiện hành. Không thay thế quy chuẩn thiết kế, bảo mật, Payload, RBAC hoặc nghiệp vụ. Agent phải đọc quy tắc này trước khi sửa frontend, backend, database, media, PWA hoặc thanh toán. Đăng ký theo cơ chế skill thực tế của Antigravity (`.agents/skills/nori-performance/SKILL.md`), đồng thời tham chiếu từ `AGENTS.md` và `SKILL.md` để tránh bỏ sót.

## 1. Measure first, change second

- Ghi commit, môi trường, dữ liệu test, phiên bản Node/pnpm, thiết bị và network profile. Tái hiện lỗi trước khi sửa; lưu Network waterfall, Performance trace, log đã che dữ liệu nhạy cảm, query timing và bundle report khi liên quan.
- Phân biệt dev cold compile, dev warm, production cold/warm. So sánh cùng cấu hình và bộ dữ liệu, tối thiểu 5 lượt đo lab; báo median và max, không gọi đó là field p75.
- Không quy lỗi cho framework, payment hoặc DB nếu chưa có bằng chứng. Không viết lại stack, thêm service hoặc nâng cấp hàng loạt để xử lý một regression chưa định vị.

## 2. Minimal code, maximum reuse

- Tìm implementation, primitive, service, validation, query và test hiện có trước khi thêm file hoặc dependency. Một nguồn sự thật cho mỗi business rule. Không tạo wrapper/abstraction chỉ để đổi tên, không nhân bản API/schema/UI cho cùng nghiệp vụ.
- Loại dead code, import, dependency, timer và feature flag đã chứng minh không dùng; kiểm tra dynamic import, Payload plugin, generated code và script trước khi xóa. Không sửa generated/managed files để né lỗi. Không đánh giá chất lượng bằng số dòng code giảm đơn thuần.
- Dùng TypeScript strict, giữ Server Components mặc định; Client Components chỉ cho tương tác. Không đưa Payload, payment secrets, SDK server hoặc module admin nặng vào public client bundle. Lazy-load module nặng theo nhu cầu; không memo hóa hàng loạt khi chưa profile.
- Ưu tiên API và thư viện sẵn có; dependency mới phải có lý do, chi phí bundle/runtime và phương án thay thế. Dùng pnpm và lockfile thống nhất; không xóa lockfile hay cập nhật hàng loạt tùy tiện.

## 3. Requests & rendering

- Không fetch lặp cùng dữ liệu do nhiều provider/component. Kiểm tra useEffect dependencies, cleanup timer/listener, hủy request cũ, chống race và deduplicate request đang chạy.
- Polling chỉ ở màn hình cần, có khoảng thời gian, deadline, backoff hữu hạn; dừng khi trạng thái kết thúc, unmount hoặc tab ẩn (khôi phục hợp lý khi quay lại). Không resubmit mutation tự động nếu chưa bảo đảm idempotency.
- Không đặt request thanh toán, báo cáo hoặc dữ liệu user-private vào critical path của trang public. Không khóa toàn trang khi một widget lỗi. Mọi loading phải có success/error/timeout và thao tác retry phù hợp; payment timeout là trạng thái chưa xác định, không tự coi thất bại hoặc tạo giao dịch mới.
- Tránh waterfall; song song hóa read độc lập có giới hạn, phân trang và chọn field cần thiết. Không Promise.all không giới hạn hoặc query từng card.

## 4. Cache & data correctness

- Public catalogue/site: static/cached/ISR theo lifecycle hiện có, invalidation theo đúng tag và old/new slug, media dependencies; chứng minh admin edit xuất hiện qua request production mới.
- Auth, bookings, live availability, coupons, payment, webhook, admin và dữ liệu cá nhân phải được xử lý request-time khi cần, không cache public/shared. Không force-static toàn bộ route, không no-store toàn site. Service worker không cache private APIs, payment callback, mutation, auth response hoặc stale app shell không tương thích.
- Đo query và EXPLAIN QUERY PLAN trước khi thêm index. Giữ constraint, transaction, ownership, RBAC; không nới điều kiện truy cập để tăng tốc. Không giữ transaction SQLite trong lúc chờ API mạng. Không tái tạo DB hoặc seed đè dữ liệu thật. PostgreSQL là phương án đánh giá riêng nếu đo thấy write contention, cần migration rehearsal và rollback.

## 5. Media & UX

- Giữ canonical Media relationship và loader Figma theo quy định dự án; kiểm tra URL, tệp thật, MIME, HTTP status, timing, cache và kích thước decode. Không chỉ assert img tag tồn tại; kiểm tra naturalWidth/naturalHeight > 0 và ảnh đúng nguồn.
- Chuẩn hóa qualities tương thích next.config; ưu tiên khoảng 75–80 nếu chất lượng phù hợp, chọn kích thước theo viewport bằng sizes/srcset, tránh tải đồng thời ảnh desktop/mobile. Chỉ ưu tiên ảnh LCP thực sự; slide đầu tải sớm, slide kế tiếp tải có kiểm soát; ảnh ngoài viewport lazy-load. Giữ aspect ratio, fallback hữu ích và retry hữu hạn; không dùng fallback để che ảnh thiếu.
- Không chỉnh sửa ảnh vật lý thất lạc bằng dữ liệu giả. Kiểm tra Git LFS/persistent media và snapshot DB nhất quán; không đưa DB người dùng, ảnh riêng tư hoặc secret vào Git.
- Dùng semantic tokens/primitives, font tối ưu, giữ responsive và accessibility. Không bổ sung animation nặng, overlay hoặc skeleton chặn tương tác vô hạn.

## 6. Payment isolation & integrity

- Xác định provider và luồng đã triển khai từ code thật; dùng sandbox hoặc mock có nhãn cho test. Không dùng tiền thật, không log secret/PII, không đưa secret vào client bundle.
- Payment adapter/server logic chỉ chạy ở luồng liên quan; timeout hữu hạn, không retry charge mù quáng. Verify webhook theo tài liệu provider, đối chiếu order/amount/currency, idempotency và trạng thái; chống duplicate, replay và out-of-order event theo cơ chế provider.
- Không lấy redirect hoặc client response làm bằng chứng đã thanh toán. Bảo toàn booking, coupon, hold ngày, deposit và refund invariants; trạng thái chưa xác định phải được đối soát. Không bỏ kiểm tra bảo mật để giảm latency.

## 7. Performance budgets & release gate

- Mục tiêu field p75: LCP <= 2.5 s, INP <= 200 ms, CLS <= 0.1, tách desktop/mobile. Lab dùng LCP/CLS/TBT và tương tác có script; TBT không phải INP. Chưa có traffic thật thì ghi field data unavailable.
- Ngân sách lab khởi điểm đề xuất: Lighthouse mobile performance >= 90 cho trang public (median), initial compressed JS <= 250 KB, ảnh trong lần tải đầu <= 800 KB, API read nội bộ p95 <= 500 ms với workload đã định nghĩa. Đo baseline để điều chỉnh có căn cứ; không giả vờ đạt, không áp cứng cho provider ngoài hoặc admin. Regression >10% ở chỉ số quan trọng phải được giải thích và phê duyệt trước release.
- Test trên DB + media cô lập, production artifact thật, mobile/desktop. Bao gồm ảnh decode, loading/retry, request count, lỗi mạng/payment, concurrency, CMS edits, auth/RBAC, PWA upgrade. Giữ test nghiệp vụ cũ; không nới timeout chỉ để che lỗi. Typecheck, lint, format, unit, integration, E2E và performance smoke phải chạy thực tế; Figma verify chỉ ở môi trường hỗ trợ.
- Báo cáo before/after, log có thể tái lập, file sửa/xóa, dependency thay đổi, dữ liệu bảo toàn, blocker và rollback. PASS chỉ khi các gate đã kiểm chứng đạt, không còn lỗi nghiêm trọng; CONDITIONAL PASS không đủ cho thương mại nếu còn lỗi thanh toán, dữ liệu, bảo mật hoặc thao tác chính. Không coi build pass/E2E pass là bằng chứng hiệu năng.
