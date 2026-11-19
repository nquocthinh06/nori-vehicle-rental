# Hướng dẫn Triển khai Hệ thống Thanh toán — NORI Vehicle Rental

## 1. Quy trình triển khai theo 3 giai đoạn (`MOCK` → `SANDBOX` → `PRODUCTION`)

### Giai đoạn A — Phát triển & Kiểm thử tự động (`MOCK`)

Cấu hình mặc định an toàn trong `.env`:

```env
PAYMENT_ENABLED=true
PAYMENT_PROVIDER=MOCK
PAYMENT_MODE=MOCK
PAYMENT_PRODUCTION_APPROVED=false
PAYMENT_PUBLIC_BASE_URL=http://localhost:3000
```

- Không cần khóa API ngoài, không phát sinh giao dịch tiền thật.
- Mã VietQR sinh dưới dạng SVG Data URI hiển thị ngay trên mọi trình duyệt (kể cả offline/E2E cô lập).
- Hỗ trợ bộ mô phỏng Webhook kiểm soát được trên UI (`/my-bookings`) và API (`/nori-api/payments/mock-simulate`).

### Giai đoạn B — Nghiệm thu thực tế trên SePay Sandbox (`SANDBOX`)

Điều kiện tiên quyết:

1. Tài khoản SePay đã liên kết tài khoản ngân hàng thử nghiệm.
2. Public HTTPS URL để nhận Webhook (ví dụ Reverse Proxy HTTPS hoặc Cloudflare Tunnel / Ngrok trỏ về `https://<domain>/nori-api/payments/webhook/sepay`).
3. Cấu hình trên SePay Dashboard:
   - **Webhook URL**: `https://<domain>/nori-api/payments/webhook/sepay`
   - **Kiểu chứng thực**: `API Key` (`Authorization: Apikey <SEPAY_WEBHOOK_SECRET>`)
   - **Sự kiện**: Giao dịch tiền vào (`transferType: "in"`)
   - **Cấu trúc mã nhận diện**: Tiền tố `NORIPAY` (độ dài 10 ký tự chữ-số phía sau)
4. Cập nhật `.env` trên môi trường Staging/Sandbox:

```env
PAYMENT_ENABLED=true
PAYMENT_PROVIDER=SEPAY
PAYMENT_MODE=SANDBOX
PAYMENT_PRODUCTION_APPROVED=false
PAYMENT_PUBLIC_BASE_URL=https://staging.nori.example.com
SEPAY_API_KEY=<sepay-user-api-token>
SEPAY_WEBHOOK_SECRET=<strong-random-32-chars-webhook-apikey>
SEPAY_ACCOUNT_NUMBER=<so-tai-khoan-nhan-test>
SEPAY_BANK_CODE=VCB
```

### Giai đoạn C — Triển khai Vận hành Thật (`PRODUCTION`)

**Cảnh báo**: Hệ thống khóa cứng chế độ `PRODUCTION` cho tới khi chủ dự án phê duyệt và hoàn thành toàn bộ checklist sau:

- [ ] Đã chạy thành công giao dịch thử nghiệm thật trên `SANDBOX` (chuyển đúng, chuyển thiếu, chuyển dư, chuyển lại sau hết hạn, đối soát hoàn tiền).
- [ ] Domain sử dụng HTTPS hợp lệ (TLS 1.2+), cookie phiên mang cờ `Secure; HttpOnly; SameSite=Lax`.
- [ ] Đã thiết lập `SEPAY_WEBHOOK_SECRET` tối thiểu 32 ký tự ngẫu nhiên, khác hoàn toàn môi trường Sandbox.
- [ ] Đã cấu hình tài khoản ngân hàng công ty chính thức trên `/dashboard/payments` → tab **Cấu hình Thanh toán** và trùng khớp với `SEPAY_ACCOUNT_NUMBER`.
- [ ] Đã tạo bản sao lưu nhất quán `pnpm db:backup` trước khi mở Production.
- [ ] Bật cờ phê duyệt trên server runtime:
  - `PAYMENT_MODE=PRODUCTION`
  - `PAYMENT_ENABLED=true`
  - `PAYMENT_PRODUCTION_APPROVED=true`
  - `PAYMENT_PROVIDER=SEPAY`
