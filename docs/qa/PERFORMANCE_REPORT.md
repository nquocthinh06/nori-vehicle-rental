# NORI VEHICLE RENTAL — BÁO CÁO HIỆU NĂNG & TẢI ĐỒNG THỜI (PERFORMANCE & LOAD TEST REPORT)

- **Ngày đo lường**: 2026-11-20
- **Môi trường đo**: Next.js Standalone Production Server, Node.js v24.22.3, Windows 11, SQLite WAL mode trên database và media cô lập.

---

## 1. Đo lường Hiệu năng Tải (Load & Stress Testing: 1 – 100 VUs)

Thực hiện bởi công cụ đo tải tự động `scripts/load-test.mjs` trên 5 cấp độ tải người dùng đồng thời:

|  Cấp độ tải (VUs)   | Thời lượng | Tổng Request | Thông lượng (Throughput) | Tỷ lệ Lỗi (Error Rate) | Độ trễ p50 | Độ trễ p95 | Độ trễ p99 | Dung lượng truyền tải |
| :-----------------: | :--------: | :----------: | :----------------------: | :--------------------: | :--------: | :--------: | :--------: | :-------------------: |
| **1 VU (Baseline)** |   6.00s    |    1,293     |      **215.4 RPS**       |       **0.00%**        |   3.7 ms   |   6.4 ms   |  12.1 ms   |       76.79 MB        |
|     **10 VUs**      |   6.30s    |    2,275     |      **361.3 RPS**       |       **0.00%**        |  20.6 ms   |  36.1 ms   |  252.8 ms  |       134.85 MB       |
|     **25 VUs**      |   6.25s    |    2,355     |      **377.1 RPS**       |       **0.00%**        |  52.4 ms   |  251.1 ms  |  293.6 ms  |       139.46 MB       |
|     **50 VUs**      |   6.26s    |    2,382     |      **380.6 RPS**       |       **0.00%**        |  102.7 ms  |  304.4 ms  |  386.0 ms  |       142.38 MB       |
| **100 VUs (Peak)**  |   6.27s    |    2,633     |      **420.2 RPS**       |       **0.00%**        |  198.4 ms  |  431.9 ms  |  494.9 ms  |       154.31 MB       |

- **Tổng số Request xử lý**: **10,938 requests** xuyên suốt 5 cấp độ tải.
- **Tỷ lệ lỗi tổng thể**: **0.00% (0 lỗi 5xx)**.
- **Tiêu thụ Bộ nhớ (Memory RSS)**: Ổn định ở mức **60.6 MB – 62.4 MB**, không phát sinh hiện tượng rò rỉ bộ nhớ (Memory Leak).

---

## 2. Thử nghiệm Xung đột Ghi Đồng thời (SQLite WAL Write Concurrency)

- **Số lượng giao dịch ghi đồng thời**: 20 requests ghi gửi song song cùng mili-giây.
- **Thời gian xử lý toàn bộ đợt ghi**: 224.1 ms (p50: 97.1 ms, p95: 97.6 ms).
- **Lỗi `SQLITE_BUSY` hoặc `database locked`**: **0 (Không xảy ra lock CSDL)**.
- **Kết quả nghiệp vụ**: 1 giao dịch tạo đơn thành công, 19 giao dịch bị chặn an toàn với mã lỗi `409 Conflict` do khóa lịch nguyên tử.
- **Kiểm tra sau kiểm thử tải**: `PRAGMA integrity_check = ok`, `0` vi phạm khóa ngoại.

---

## 3. Thử nghiệm Quy mô Lớn Đa Chi Nhánh (Module 3.7 Scale Benchmark)

Thực hiện bởi `scripts/benchmark-multi-branch.mjs` trên 3 kịch bản dữ liệu lớn:

| Quy mô Dữ liệu                       | Dung lượng CSDL | Tra cứu Xe Chi nhánh | Lịch khả dụng Timeline | Báo cáo Doanh thu CN | Thông lượng Ghi (Writes) | Kế hoạch Truy vấn (Query Plan)  |
| :----------------------------------- | :-------------: | :------------------: | :--------------------: | :------------------: | :----------------------: | :------------------------------ |
| **Nhỏ (10 CN / 100 Xe / 10k Đơn)**   |    11.56 MB     |       0.021 ms       |        0.038 ms        |       2.301 ms       |     **10,246 tx/s**      | `SEARCH vehicles USING INDEX`   |
| **Vừa (50 CN / 1k Xe / 50k Đơn)**    |    42.71 MB     |       0.026 ms       |        0.053 ms        |       3.215 ms       |      **9,524 tx/s**      | `SEARCH bookings USING INDEX`   |
| **Lớn (100 CN / 10k Xe / 100k Đơn)** |    86.41 MB     |     **0.051 ms**     |      **0.026 ms**      |     **3.197 ms**     |      **9,690 tx/s**      | 100% Index Lookup (0 Full Scan) |

---

## 4. Đánh giá Chỉ số Trải nghiệm Người dùng (Frontend Core Web Vitals)

| Chỉ số Web Vitals                   | Ngưỡng Khuyến nghị |   Kết quả Đo lường Lab Thực tế   | Đánh giá Trạng thái |
| :---------------------------------- | :----------------: | :------------------------------: | :-----------------: |
| **LCP (Largest Contentful Paint)**  |   $\le$ 2.5 giây   |        **1.2 – 1.8 giây**        |   **TỐT (GOOD)**    |
| **CLS (Cumulative Layout Shift)**   |     $\le$ 0.1      |             **0.00**             |   **TỐT (GOOD)**    |
| **INP (Interaction to Next Paint)** |    $\le$ 200 ms    |   **< 60 ms** (Lab simulation)   |   **TỐT (GOOD)**    |
| **TTFB (Time to First Byte)**       |    $\le$ 800 ms    |    **< 120 ms** (Static SSG)     |   **TỐT (GOOD)**    |
| **Static Build Prerender Time**     |         -          | **104/104 trang trong 1,617 ms** |     **TỐI ƯU**      |
