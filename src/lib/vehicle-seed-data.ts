import { calculateRollingPrice } from './rental-rules'

export type SeedGalleryItem = {
  mediaKey: string
  kind: 'OVERVIEW' | 'EXTERIOR' | 'INTERIOR' | 'ENGINE' | 'FEATURE'
  caption: string
  variantName?: string
  colorName?: string
}

export type SeedSpecItem = {
  group: 'OVERVIEW' | 'ENGINE' | 'DIMENSIONS' | 'CHASSIS' | 'PICKUP' | 'MOTORBIKE' | 'EV'
  label: string
  value: string
  variantName?: string
  source: string
}

export type SeedFeatureItem = {
  name: string
  category: 'COMFORT' | 'SAFETY' | 'DRIVER_ASSIST' | 'TECHNOLOGY'
  variantNote?: string
}

export type SeedVariantItem = {
  name: string
  year: number
  listedPrice?: number
  referenceRentPrice?: number
  fuelType: string
  transmission: string
  driveType: string
  seats: number
  summary: string
  colors: { name: string; hex?: string; mediaKey?: string }[]
}

export type SeedModelSpec = {
  name: string
  officialName?: string
  modelLine?: string
  versionName?: string
  generation?: string
  slug: string
  brand: string
  category: 'CAR' | 'MOTORBIKE' | 'PICKUP'
  subCategory: string
  bodyStyle: string
  segment: string
  origin: string
  modelYear: number
  seats: number
  fuelType: 'Xăng' | 'Dầu (Diesel)' | 'Điện (EV)' | 'Hybrid'
  transmission: string
  driveType: string
  listedPrice: number
  referenceRentPrice: number
  defaultDepositSuggestion?: number
  usagePurpose?: string
  shortDescription?: string
  suitableFor: string
  description: string
  exteriorOverview: string
  interiorOverview: string
  engineOverview: string
  highlights: string[]
  features: SeedFeatureItem[]
  coverKey: string
  gallery: SeedGalleryItem[]
  specifications: SeedSpecItem[]
  variants: SeedVariantItem[]
  source: string
  featured: boolean
  sortOrder: number
}

export type SeedDemoVehicle = {
  modelSlug: string
  reference: string
  licensePlate: string
  intent: 'RENT' | 'SALE' | 'BOTH'
  vehicleConditionType: 'NEW' | 'USED'
  manufactureYear: number
  version: string
  color: string
  odometer: number
  pricePerDay: number
  pricePerHour?: number
  pricePerWeek?: number
  pricePerMonth?: number
  weekendSurcharge: number
  holidaySurcharge: number
  depositAmount: number
  deliveryFee: number
  kmLimitPerDay: number
  overKmFee: number
  lateReturnFeePerHour: number
  salePrice: number
  listedPrice: number
  discountPrice?: number
  reservationDeposit: number
  negotiable: boolean
  warrantyPolicy: string
  condition: string
  exteriorCondition: string
  interiorCondition: string
  engineCondition: string
  maintenanceHistory: string
  inspectedAt: string
  location: string
  pickupLocation: string
  photoKeys: {
    mediaKey: string
    caption: string
    kind: 'EXTERIOR' | 'INTERIOR' | 'ENGINE' | 'ACTUAL'
  }[]
}

export const SEED_SITE_INFO = {
  address: 'Số 10 Mai Chí Thọ, Khu đô thị Sala, TP. Thủ Đức, TP. Hồ Chí Minh (Điểm giao nhận DEMO)',
  phone: '1900 636 000',
  email: 'hotro@nori.vn',
  openingHours: '07:30 – 21:00 (Thứ Hai – Chủ Nhật)',
  heroAutoplaySeconds: 6,
  businessTimezone: 'Asia/Ho_Chi_Minh',
  workingDays: '1,2,3,4,5',
  workStartTime: '08:00',
  workEndTime: '17:30',
  lunchBreakStart: '12:00',
  lunchBreakEnd: '13:00',
  holidays: [
    { date: '2026-01-01', name: 'Tết Dương lịch' },
    { date: '2026-04-30', name: 'Ngày Giải phóng miền Nam' },
    { date: '2026-05-01', name: 'Ngày Quốc tế Lao động' },
    { date: '2026-09-02', name: 'Ngày Quốc khánh' },
  ],
  rentalPolicySummary:
    'Thuê xe từ 1 đến 30 ngày nguyên (tính từ ngày nhận, không tính thêm tiền ngày trả). Giá thuê cuối cùng được xác nhận từ hệ thống trước khi giữ lịch. Mọi giao dịch thanh toán hiện thực hiện trực tiếp tại điểm bàn giao hoặc theo xác nhận chính thức của NORI.',
  purchasePolicySummary:
    'Khách hàng có thể xem giá niêm yết tham khảo, giá bán tại NORI, chi phí lăn bánh dự kiến, đăng ký xem xe, lái thử hoặc gửi yêu cầu mua xe. Yêu cầu mua xe sẽ được chuyên viên xác nhận tình trạng xe và lịch hẹn trước khi ký hồ sơ.',
  ageRequirement: 'Từ đủ 21 tuổi (đối với ô tô/bán tải) hoặc từ đủ 18 tuổi (đối với xe máy).',
  licenseRequirement:
    'CCCD gắn chip còn hiệu lực và GPLX hạng A1/A2 (xe máy/mô tô) hoặc hạng B1/B2 trở lên (ô tô/bán tải).',
  cancellationPolicy:
    'Khách hàng được tự hủy miễn phí khi đơn đang ở trạng thái Chờ xác nhận hoặc Chờ đặt cọc. Các đơn đã xác nhận cần liên hệ hotline NORI trước giờ nhận xe tối thiểu 24 giờ để được hỗ trợ giải phóng lịch và xử lý tiền cọc theo chính sách.',
  depositPolicy:
    'Tiền đặt cọc đảm bảo được tách riêng hoàn toàn khỏi tiền thuê xe và sẽ hoàn trả sau khi kiểm tra xe hoàn tất khi trả xe. Xe bàn giao mức nhiên liệu/pin tương ứng khi nhận và hoàn trả ở mức tương đương.',
}

export const SEED_MODELS: SeedModelSpec[] = [
  // =========================================================================
  // 1. TOYOTA FORTUNER
  // =========================================================================
  {
    name: 'Toyota Fortuner',
    slug: 'toyota-fortuner',
    brand: 'Toyota',
    category: 'CAR',
    subCategory: 'SUV',
    bodyStyle: 'SUV 7 chỗ',
    segment: 'SUV hạng D khung gầm rời',
    origin: 'Việt Nam / Indonesia',
    modelYear: 2024,
    seats: 7,
    fuelType: 'Dầu (Diesel)',
    transmission: 'Tự động 6 cấp',
    driveType: 'Cầu sau (4x2) / 2 cầu bán thời gian (4x4)',
    listedPrice: 1_055_000_000,
    referenceRentPrice: 1_350_000,
    suitableFor: 'Gia đình 5–7 người, công tác liên tỉnh, đường đèo dốc và hành trình dài ngày',
    description:
      'Toyota Fortuner là mẫu SUV 7 chỗ khung gầm rời (body-on-frame) quen thuộc tại Việt Nam nhờ độ bền bỉ, khoảng sáng gầm 279 mm và khả năng vận hành ổn định trên nhiều dạng địa hình. Nội thất ba hàng ghế rộng rãi đáp ứng tốt nhu cầu di chuyển gia đình hoặc đưa đón chuyên gia.',
    exteriorOverview:
      'Ngoại hình bề thế với lưới tản nhiệt kích thước lớn, cụm đèn chiếu sáng Bi-LED sắc nét, thanh giá nóc thể thao và bộ mâm hợp kim 17–18 inch tùy phiên bản.',
    interiorOverview:
      'Khoang lái bọc da với ghế trước chỉnh điện 8 hướng, màn hình giải trí trung tâm 8–9 inch hỗ trợ Apple CarPlay/Android Auto không dây và điều hòa tự động 2 vùng độc lập có cửa gió cho cả 3 hàng ghế.',
    engineOverview:
      'Tùy chọn động cơ Diesel 2.4L (2GD-FTV, 147 mã lực / 400 Nm) tiết kiệm nhiên liệu hoặc Diesel 2.8L (1GD-FTV, 201 mã lực / 500 Nm) kết hợp hộp số tự động 6 cấp và khóa vi sai cầu sau.',
    highlights: [
      'Khoảng sáng gầm 279 mm vượt trội trong phân khúc SUV 7 chỗ',
      'Khung gầm rời bền bỉ, phù hợp cả đường trường lẫn địa hình xấu',
      'Gói an toàn Toyota Safety Sense trên phiên bản 2.8L Legender',
      'Ba hàng ghế rộng rãi với cửa gió điều hòa cho từng hàng ghế',
    ],
    features: [
      { name: 'Điều hòa tự động 2 vùng & cửa gió hàng ghế sau', category: 'COMFORT' },
      { name: 'Màn hình cảm ứng 9 inch Apple CarPlay / Android Auto', category: 'TECHNOLOGY' },
      { name: 'Cốp đóng mở điện thông minh', category: 'COMFORT', variantNote: 'Bản Legender' },
      { name: '7 túi khí & Cân bằng điện tử VSC', category: 'SAFETY' },
      { name: 'Camera 360 độ & Cảm biến hỗ trợ đỗ xe', category: 'DRIVER_ASSIST' },
      {
        name: 'Cảnh báo tiền va chạm (PCS) & Giữ làn (LDA)',
        category: 'DRIVER_ASSIST',
        variantNote: 'Bản 2.8 AT 4x4',
      },
    ],
    coverKey: 'toyota-fortuner-ext-1',
    gallery: [
      {
        mediaKey: 'toyota-fortuner-ext-1',
        kind: 'EXTERIOR',
        caption: 'Ngoại thất tổng thể góc nhìn trực diện bên hông (Wikimedia Commons)',
      },
      {
        mediaKey: 'toyota-fortuner-ext-2',
        kind: 'EXTERIOR',
        caption: 'Cụm đèn hậu LED và thiết kế đuôi xe (Wikimedia Commons)',
      },
      {
        mediaKey: 'toyota-fortuner-ext-3',
        kind: 'EXTERIOR',
        caption: 'Góc nhìn chéo 45 độ thân xe SUV 7 chỗ (Wikimedia Commons)',
      },
      {
        mediaKey: 'toyota-fortuner-int-1',
        kind: 'INTERIOR',
        caption: 'Khoang lái và bảng điều khiển trung tâm (Wikimedia Commons)',
      },
      {
        mediaKey: 'toyota-fortuner-eng-1',
        kind: 'ENGINE',
        caption: 'Khoang động cơ Diesel 2GD-FTV 2.4L (Wikimedia Commons)',
      },
    ],
    specifications: [
      {
        group: 'ENGINE',
        label: 'Động cơ',
        value: '2GD-FTV 2.4L Turbo Diesel / 1GD-FTV 2.8L (tùy phiên bản)',
        source: 'Toyota Việt Nam',
      },
      {
        group: 'ENGINE',
        label: 'Công suất cực đại',
        value: '147 hp @ 3.400 rpm (2.4L) / 201 hp (2.8L)',
        source: 'Toyota Việt Nam',
      },
      {
        group: 'ENGINE',
        label: 'Mô-men xoắn cực đại',
        value: '400 Nm @ 1.600 rpm (2.4L) / 500 Nm (2.8L)',
        source: 'Toyota Việt Nam',
      },
      {
        group: 'ENGINE',
        label: 'Hộp số & Dẫn động',
        value: 'Tự động 6 cấp · RWD (4x2) hoặc 4WD (4x4)',
        source: 'Toyota Việt Nam',
      },
      {
        group: 'ENGINE',
        label: 'Dung tích bình nhiên liệu',
        value: '80 lít',
        source: 'Toyota Việt Nam',
      },
      {
        group: 'DIMENSIONS',
        label: 'Kích thước (D × R × C)',
        value: '4.795 × 1.855 × 1.835 mm',
        source: 'Toyota Việt Nam',
      },
      {
        group: 'DIMENSIONS',
        label: 'Chiều dài cơ sở',
        value: '2.745 mm',
        source: 'Toyota Việt Nam',
      },
      {
        group: 'DIMENSIONS',
        label: 'Khoảng sáng gầm xe',
        value: '279 mm',
        source: 'Toyota Việt Nam',
      },
      {
        group: 'DIMENSIONS',
        label: 'Bán kính quay vòng tối thiểu',
        value: '5,8 m',
        source: 'Toyota Việt Nam',
      },
      {
        group: 'CHASSIS',
        label: 'Hệ thống phanh trước / sau',
        value: 'Đĩa thông gió / Đĩa đặc (ABS, EBD, BA)',
        source: 'Toyota Việt Nam',
      },
      {
        group: 'CHASSIS',
        label: 'Kích thước lốp & mâm',
        value: '265/65R17 hoặc 265/60R18 (Legender)',
        source: 'Toyota Việt Nam',
      },
    ],
    variants: [
      {
        name: '2.4 AT 4x2',
        year: 2024,
        listedPrice: 1_055_000_000,
        referenceRentPrice: 1_350_000,
        fuelType: 'Dầu (Diesel)',
        transmission: 'Tự động 6 cấp',
        driveType: 'Cầu sau (4x2)',
        seats: 7,
        summary:
          'Động cơ dầu 2.4L tiết kiệm nhiên liệu, 7 túi khí, phù hợp di chuyển gia đình và công tác.',
        colors: [
          { name: 'Trắng ngọc trai', hex: '#f4f4f0', mediaKey: 'toyota-fortuner-ext-3' },
          { name: 'Đen ánh kim', hex: '#1c1f24', mediaKey: 'toyota-fortuner-ext-1' },
          { name: 'Bạc', hex: '#b6bcc2' },
        ],
      },
      {
        name: 'Legender 2.8 AT 4x4',
        year: 2024,
        listedPrice: 1_350_000_000,
        referenceRentPrice: 1_650_000,
        fuelType: 'Dầu (Diesel)',
        transmission: 'Tự động 6 cấp',
        driveType: '2 cầu bán thời gian (4x4)',
        seats: 7,
        summary:
          'Phiên bản cao cấp động cơ 2.8L 201 hp, dẫn động 2 cầu, Toyota Safety Sense và 11 loa JBL.',
        colors: [
          { name: 'Trắng ngọc trai nóc đen', hex: '#eef0f2', mediaKey: 'toyota-fortuner-ext-3' },
          { name: 'Đen ánh kim', hex: '#1c1f24', mediaKey: 'toyota-fortuner-ext-1' },
        ],
      },
    ],
    source: 'https://www.toyota.com.vn/',
    featured: true,
    sortOrder: 1,
  },

  // =========================================================================
  // 2. HONDA PCX
  // =========================================================================
  {
    name: 'Honda PCX',
    slug: 'honda-pcx',
    brand: 'Honda',
    category: 'MOTORBIKE',
    subCategory: 'SCOOTER',
    bodyStyle: 'Xe tay ga đường trường',
    segment: 'Xe tay ga cao cấp cỡ trung',
    origin: 'Thái Lan / Indonesia (Nhập khẩu)',
    modelYear: 2024,
    seats: 2,
    fuelType: 'Xăng',
    transmission: 'Vô cấp CVT',
    driveType: 'Dây đai V-Matic',
    listedPrice: 89_000_000,
    referenceRentPrice: 320_000,
    suitableFor: 'Đi làm hằng ngày, di chuyển liên quận êm ái và phượt ngoại ô cuối tuần',
    description:
      'Honda PCX 160 nổi bật với thiết kế touring trường xe, tư thế ngồi duỗi chân thoải mái và động cơ eSP+ 4 van vận hành êm ái. Khoang chứa đồ 30 lít dưới yên cùng bình xăng lớn 8,1 lít giúp giảm tần suất tiếp nhiên liệu trên những chặng đường dài.',
    exteriorOverview:
      'Đèn định vị LED dạng cánh chim đặc trưng, kính chắn gió tối màu, sàn để chân hai tầng và yên hai tầng ôm lưng người lái.',
    interiorOverview:
      'Mặt đồng hồ LCD toàn phần hiển thị rõ tốc độ, mức tiêu hao nhiên liệu và cảnh báo bảo dưỡng; hộc chứa đồ phía trước tích hợp cổng sạc USB Type-C.',
    engineOverview:
      'Động cơ eSP+ 156,9 cc 4 van làm mát bằng dung dịch, công suất 15,8 mã lực, tích hợp Idling Stop và kiểm soát lực kéo HSTC.',
    highlights: [
      'Tư thế ngồi touring thoải mái, giảm mỏi lưng khi đi đường dài',
      'Cốp dưới yên dung tích 30 lít chứa vừa mũ bảo hiểm cả đầu',
      'Bình xăng 8,1 lít cho quãng đường di chuyển dài mỗi lần đổ',
      'Trang bị phanh ABS bánh trước và Smart Key chống trộm',
    ],
    features: [
      { name: 'Hệ thống khóa thông minh Honda Smart Key', category: 'TECHNOLOGY' },
      { name: 'Phanh chống bó cứng ABS bánh trước', category: 'SAFETY' },
      { name: 'Hệ thống kiểm soát lực kéo HSTC', category: 'DRIVER_ASSIST' },
      { name: 'Cổng sạc USB-C trong hộc đồ trước', category: 'COMFORT' },
    ],
    coverKey: 'honda-pcx-ext-1',
    gallery: [
      // Deliberately NO INTERIOR gallery item so detail view verifies missing interior notice truthfully
      {
        mediaKey: 'honda-pcx-ext-1',
        kind: 'EXTERIOR',
        caption: 'Honda PCX 160 góc ngang thân xe (Wikimedia Commons)',
      },
      {
        mediaKey: 'honda-pcx-ext-2',
        kind: 'EXTERIOR',
        caption: 'Thiết kế đuôi xe và cụm đèn LED chữ X (Wikimedia Commons)',
      },
      {
        mediaKey: 'honda-pcx-ext-3',
        kind: 'EXTERIOR',
        caption: 'Phiên bản màu Xám Đen mờ góc trước (Wikimedia Commons)',
        colorName: 'Xám đen mờ',
      },
    ],
    specifications: [
      {
        group: 'MOTORBIKE',
        label: 'Động cơ',
        value: 'eSP+ 4 kỳ, xi-lanh đơn, 4 van, làm mát dung dịch',
        source: 'Honda Motor',
      },
      { group: 'MOTORBIKE', label: 'Dung tích xi-lanh', value: '156,9 cc', source: 'Honda Motor' },
      {
        group: 'MOTORBIKE',
        label: 'Công suất cực đại',
        value: '11,8 kW (15,8 hp) @ 8.500 rpm',
        source: 'Honda Motor',
      },
      {
        group: 'MOTORBIKE',
        label: 'Mô-men xoắn cực đại',
        value: '14,7 Nm @ 6.500 rpm',
        source: 'Honda Motor',
      },
      {
        group: 'MOTORBIKE',
        label: 'Hệ thống phanh',
        value: 'Đĩa trước ABS / Đĩa sau (tùy thị trường)',
        source: 'Honda Motor',
      },
      {
        group: 'MOTORBIKE',
        label: 'Dung tích bình xăng & cốp',
        value: '8,1 lít · Cốp 30 lít',
        source: 'Honda Motor',
      },
      { group: 'DIMENSIONS', label: 'Chiều cao yên', value: '764 mm', source: 'Honda Motor' },
      {
        group: 'DIMENSIONS',
        label: 'Trọng lượng bản thân',
        value: '132 kg',
        source: 'Honda Motor',
      },
    ],
    variants: [
      {
        name: 'PCX 160 ABS',
        year: 2024,
        listedPrice: 89_000_000,
        referenceRentPrice: 320_000,
        fuelType: 'Xăng',
        transmission: 'Vô cấp CVT',
        driveType: 'Dây đai',
        seats: 2,
        summary: 'Động cơ eSP+ 160 cc mạnh mẽ, phanh ABS bánh trước, Smart Key và cốp 30 lít.',
        colors: [
          { name: 'Xám đen mờ', hex: '#4b5056', mediaKey: 'honda-pcx-ext-3' },
          { name: 'Trắng ngọc trai', hex: '#f2f3f5' },
        ],
      },
    ],
    source: 'https://www.honda.com.vn/xe-may/san-pham',
    featured: true,
    sortOrder: 2,
  },

  // =========================================================================
  // 3. FORD RANGER RAPTOR
  // =========================================================================
  {
    name: 'Ford Ranger Raptor',
    slug: 'ford-ranger-raptor',
    brand: 'Ford',
    category: 'PICKUP',
    subCategory: 'PERFORMANCE_PICKUP',
    bodyStyle: 'Bán tải hiệu năng cao',
    segment: 'Bán tải off-road chuyên dụng',
    origin: 'Thái Lan (Ford Việt Nam)',
    modelYear: 2024,
    seats: 5,
    fuelType: 'Dầu (Diesel)',
    transmission: 'Tự động 10 cấp',
    driveType: '2 cầu toàn thời gian (4WD) · 7 chế độ lái',
    listedPrice: 1_299_000_000,
    referenceRentPrice: 1_850_000,
    suitableFor:
      'Chinh phục địa hình đồi núi, cắm trại dã ngoại dài ngày và trải nghiệm lái thể thao',
    description:
      'Ford Ranger Raptor thế hệ mới được Ford Performance phát triển chuyên biệt cho khả năng chạy địa hình tốc độ cao. Xe trang bị hệ thống treo FOX 2.5-inch Live Valve, khung gầm gia cường và 7 chế độ lái linh hoạt từ đường phố đến địa hình Baja.',
    exteriorOverview:
      'Mặt ca-lăng chữ FORD cỡ lớn đầy uy lực, đèn pha LED Matrix tự động điều chỉnh chùm sáng, vòm bánh mở rộng và bộ lốp địa hình BFGoodrich All-Terrain 285/70R17.',
    interiorOverview:
      'Ghế thể thao ôm lưng lấy cảm hứng từ ghế máy bay chiến đấu, đường chỉ khâu cam nổi bật, màn hình dọc 12 inch SYNC 4A và cụm đồng hồ kỹ thuật số 12,4 inch.',
    engineOverview:
      'Động cơ Diesel 2.0L Bi-Turbo công suất 210 PS và mô-men xoắn 500 Nm kết hợp hộp số tự động 10 cấp, khóa vi sai trước/sau và hệ dẫn động 4A thông minh.',
    highlights: [
      'Giảm xóc FOX 2.5-inch Live Valve thích ứng theo địa hình',
      'Hệ dẫn động 4WD toàn thời gian với khóa vi sai cả cầu trước & cầu sau',
      '7 chế độ lái chuyên dụng gồm Normal, Sport, Slippery, Mud/Ruts, Sand, Rock Crawl, Baja',
      'Đèn Matrix LED và màn hình giải trí dọc 12 inch SYNC 4A',
    ],
    features: [
      { name: 'Hệ thống treo FOX 2.5-inch Live Valve', category: 'DRIVER_ASSIST' },
      { name: 'Khóa vi sai cầu trước & cầu sau', category: 'DRIVER_ASSIST' },
      { name: 'Màn hình dọc 12 inch SYNC 4A & Apple CarPlay không dây', category: 'TECHNOLOGY' },
      { name: 'Camera 360 độ hiển thị góc nhìn địa hình', category: 'SAFETY' },
      { name: 'Ga tự động thích ứng & Cảnh báo điểm mù', category: 'DRIVER_ASSIST' },
    ],
    coverKey: 'ford-ranger-raptor-ext-1',
    gallery: [
      {
        mediaKey: 'ford-ranger-raptor-ext-1',
        kind: 'EXTERIOR',
        caption: 'Ford Ranger Raptor góc chéo trước (Wikimedia Commons)',
      },
      {
        mediaKey: 'ford-ranger-raptor-ext-2',
        kind: 'EXTERIOR',
        caption: 'Góc nhìn phía sau và thùng hàng cabin kép (Wikimedia Commons)',
      },
      {
        mediaKey: 'ford-ranger-raptor-ext-3',
        kind: 'EXTERIOR',
        caption: 'Khoảng sáng gầm và lốp địa hình BFGoodrich (Wikimedia Commons)',
      },
      {
        mediaKey: 'ford-ranger-raptor-int-1',
        kind: 'INTERIOR',
        caption: 'Khoang lái thể thao và màn hình dọc 12 inch (Wikimedia Commons)',
      },
    ],
    specifications: [
      {
        group: 'ENGINE',
        label: 'Động cơ',
        value: '2.0L Bi-Turbo Diesel I4',
        source: 'Ford Việt Nam',
      },
      {
        group: 'ENGINE',
        label: 'Công suất cực đại',
        value: '210 PS (154,5 kW) @ 3.750 rpm',
        source: 'Ford Việt Nam',
      },
      {
        group: 'ENGINE',
        label: 'Mô-men xoắn cực đại',
        value: '500 Nm @ 1.750–2.000 rpm',
        source: 'Ford Việt Nam',
      },
      {
        group: 'ENGINE',
        label: 'Hộp số',
        value: 'Tự động 10 cấp điện tử e-Shifter',
        source: 'Ford Việt Nam',
      },
      {
        group: 'DIMENSIONS',
        label: 'Kích thước (D × R × C)',
        value: '5.381 × 2.028 × 1.922 mm',
        source: 'Ford Việt Nam',
      },
      { group: 'DIMENSIONS', label: 'Chiều dài cơ sở', value: '3.270 mm', source: 'Ford Việt Nam' },
      {
        group: 'DIMENSIONS',
        label: 'Khoảng sáng gầm xe',
        value: '265 mm',
        source: 'Ford Việt Nam',
      },
      { group: 'PICKUP', label: 'Khả năng lội nước', value: '850 mm', source: 'Ford Việt Nam' },
      {
        group: 'PICKUP',
        label: 'Hệ thống treo',
        value: 'FOX 2.5-inch Live Valve Internal Bypass',
        source: 'Ford Việt Nam',
      },
      {
        group: 'PICKUP',
        label: 'Lốp & Mâm',
        value: 'BFGoodrich 285/70R17 · Mâm hợp kim 17 inch',
        source: 'Ford Việt Nam',
      },
    ],
    variants: [
      {
        name: '2.0L Bi-Turbo 4WD',
        year: 2024,
        listedPrice: 1_299_000_000,
        referenceRentPrice: 1_850_000,
        fuelType: 'Dầu (Diesel)',
        transmission: 'Tự động 10 cấp',
        driveType: '4WD toàn thời gian',
        seats: 5,
        summary: 'Phiên bản phân phối chính hãng tại Việt Nam với giảm xóc FOX và 7 chế độ lái.',
        colors: [
          { name: 'Cam Code Orange', hex: '#d9531e', mediaKey: 'ford-ranger-raptor-ext-1' },
          { name: 'Xám Meteor', hex: '#62686e', mediaKey: 'ford-ranger-raptor-ext-2' },
          { name: 'Đen', hex: '#181a1d' },
        ],
      },
    ],
    source: 'https://www.ford.com.vn/',
    featured: true,
    sortOrder: 3,
  },

  // =========================================================================
  // 4. HONDA WAVE ALPHA 110
  // =========================================================================
  {
    name: 'Honda Wave Alpha 110',
    slug: 'honda-wave-alpha',
    brand: 'Honda',
    category: 'MOTORBIKE',
    subCategory: 'MANUAL_BIKE',
    bodyStyle: 'Xe số phổ thông',
    segment: 'Xe số 110cc tiết kiệm',
    origin: 'Việt Nam (Honda Việt Nam)',
    modelYear: 2025,
    seats: 2,
    fuelType: 'Xăng',
    transmission: '4 số tròn',
    driveType: 'Xích tải',
    listedPrice: 17_859_273,
    referenceRentPrice: 130_000,
    suitableFor:
      'Di chuyển hằng ngày trong phố, tiết kiệm xăng tối đa và dễ làm quen với mọi người lái',
    description:
      'Honda Wave Alpha 110 là mẫu xe số phổ thông bền bỉ hàng đầu tại Việt Nam, sở hữu trọng lượng nhẹ 96 kg, mức tiêu hao nhiên liệu chỉ khoảng 1,72 lít/100 km và chi phí vận hành cực kỳ hợp lý.',
    exteriorOverview:
      'Kiểu dáng thon gọn linh hoạt len lỏi trong phố đông, tem xe sắc nét cùng tùy chọn vành nan hoa hoặc vành đúc phiên bản cổ điển/đặc biệt.',
    interiorOverview:
      'Mặt đồng hồ analog bố trí khoa học dễ quan sát, ổ khóa đa năng 3 trong 1 an toàn chống rỉ sét.',
    engineOverview:
      'Động cơ 109,1 cc SOHC 4 kỳ làm mát bằng không khí đạt chuẩn Euro 3, vận hành bền bỉ và dễ bảo trì.',
    highlights: [
      'Mức tiêu hao nhiên liệu công bố chỉ 1,72 lít/100 km',
      'Trọng lượng 96 kg gọn nhẹ, dễ dắt và xoay trở trong hẻm nhỏ',
      'Đèn chiếu sáng phía trước luôn sáng tăng nhận diện an toàn',
    ],
    features: [
      { name: 'Đèn trước tự động bật sáng ban ngày', category: 'SAFETY' },
      { name: 'Ổ khóa 3 trong 1 có nắp từ chống trộm', category: 'SAFETY' },
      { name: 'Khởi động điện & Cần đạp dự phòng', category: 'COMFORT' },
    ],
    coverKey: 'honda-wave-alpha-ext-1',
    gallery: [
      {
        mediaKey: 'honda-wave-alpha-ext-1',
        kind: 'EXTERIOR',
        caption: 'Honda Wave 110 vận hành trong đô thị (Wikimedia Commons)',
      },
      {
        mediaKey: 'honda-wave-alpha-ext-2',
        kind: 'EXTERIOR',
        caption: 'Honda Wave 110 góc nhìn ngang thân xe (Wikimedia Commons)',
      },
    ],
    specifications: [
      {
        group: 'MOTORBIKE',
        label: 'Động cơ',
        value: '109,1 cc, 4 kỳ, xi-lanh đơn, làm mát không khí',
        source: 'Honda Việt Nam',
      },
      {
        group: 'MOTORBIKE',
        label: 'Công suất tối đa',
        value: '6,12 kW @ 7.500 rpm',
        source: 'Honda Việt Nam',
      },
      {
        group: 'MOTORBIKE',
        label: 'Mô-men xoắn cực đại',
        value: '8,44 Nm @ 5.500 rpm',
        source: 'Honda Việt Nam',
      },
      {
        group: 'MOTORBIKE',
        label: 'Mức tiêu thụ nhiên liệu',
        value: '1,72 lít/100 km',
        source: 'Honda Việt Nam',
      },
      {
        group: 'MOTORBIKE',
        label: 'Dung tích bình xăng',
        value: '3,7 lít',
        source: 'Honda Việt Nam',
      },
      {
        group: 'DIMENSIONS',
        label: 'Chiều cao yên / Trọng lượng',
        value: '769 mm · 96 kg',
        source: 'Honda Việt Nam',
      },
    ],
    variants: [
      {
        name: 'Tiêu chuẩn 2025',
        year: 2025,
        listedPrice: 17_859_273,
        referenceRentPrice: 130_000,
        fuelType: 'Xăng',
        transmission: '4 số tròn',
        driveType: 'Xích tải',
        seats: 2,
        summary: 'Phiên bản vành nan hoa, phanh tang trống gọn nhẹ.',
        colors: [
          { name: 'Đỏ bạc', hex: '#a91d22', mediaKey: 'honda-wave-alpha-ext-1' },
          { name: 'Trắng', hex: '#f4f5f7' },
        ],
      },
      {
        name: 'Đặc biệt Đen nhám',
        year: 2025,
        listedPrice: 18_742_909,
        referenceRentPrice: 140_000,
        fuelType: 'Xăng',
        transmission: '4 số tròn',
        driveType: 'Xích tải',
        seats: 2,
        summary: 'Màu đen nhám thể thao, vành đúc/nan hoa tùy đợt sản xuất.',
        colors: [{ name: 'Đen nhám', hex: '#222428', mediaKey: 'honda-wave-alpha-ext-2' }],
      },
    ],
    source: 'https://www.honda.com.vn/xe-may/san-pham/wave-alpha-110cc',
    featured: false,
    sortOrder: 4,
  },

  // =========================================================================
  // 5. HONDA VISION
  // =========================================================================
  {
    name: 'Honda Vision',
    slug: 'honda-vision',
    brand: 'Honda',
    category: 'MOTORBIKE',
    subCategory: 'SCOOTER',
    bodyStyle: 'Xe tay ga phổ thông',
    segment: 'Xe tay ga đô thị cỡ nhỏ',
    origin: 'Việt Nam (Honda Việt Nam)',
    modelYear: 2025,
    seats: 2,
    fuelType: 'Xăng',
    transmission: 'Vô cấp CVT',
    driveType: 'Dây đai',
    listedPrice: 31_113_818,
    referenceRentPrice: 160_000,
    suitableFor: 'Di chuyển hàng ngày trong nội thành, sinh viên, nhân viên văn phòng và du khách',
    description:
      'Honda Vision là mẫu xe tay ga quốc dân tại Việt Nam nhờ chiều cao yên vừa phải 761 mm, trọng lượng 94–98 kg dễ kiểm soát và động cơ eSP 110 cc tiết kiệm xăng cùng khung dập hàn laser eSAF.',
    exteriorOverview:
      'Thiết kế nhỏ gọn thanh lịch, đường nét gọn gàng, đèn hậu tinh gọn cùng mâm 14 inch (hoặc 16 inch bánh trước ở bản Thể thao).',
    interiorOverview:
      'Sàn để chân phẳng rộng rãi, cốp dưới yên 15,8 lít và hộc đựng đồ phía trước có cổng sạc tiện lợi (trên các bản từ Cao cấp trở lên).',
    engineOverview:
      'Động cơ eSP 109,5 cc phun xăng điện tử PGM-FI tích hợp bộ đề ACG êm ái và ngắt động cơ tạm thời Idling Stop.',
    highlights: [
      'Chiều cao yên 761 mm thân thiện với vóc dáng người Việt',
      'Tiêu hao nhiên liệu chỉ khoảng 1,85 lít/100 km',
      'Smart Key và cổng sạc tiện dụng trên phiên bản Cao cấp / Thể thao',
    ],
    features: [
      { name: 'Khung sườn dập hàn laser eSAF nhẹ và cứng vững', category: 'TECHNOLOGY' },
      { name: 'Phanh kết hợp CBS an toàn', category: 'SAFETY' },
      { name: 'Hệ thống ngắt động cơ tạm thời Idling Stop', category: 'TECHNOLOGY' },
      { name: 'Honda Smart Key', category: 'SAFETY', variantNote: 'Từ bản Cao cấp trở lên' },
    ],
    coverKey: 'honda-vision-ext-1',
    gallery: [
      {
        mediaKey: 'honda-vision-ext-1',
        kind: 'EXTERIOR',
        caption: 'Honda Vision 110 góc chéo trước (Wikimedia Commons)',
      },
      {
        mediaKey: 'honda-vision-ext-2',
        kind: 'EXTERIOR',
        caption: 'Honda Vision tổng thể xe tay ga đô thị (Wikimedia Commons)',
      },
    ],
    specifications: [
      {
        group: 'MOTORBIKE',
        label: 'Động cơ',
        value: 'eSP 109,5 cc, 4 kỳ, làm mát bằng không khí',
        source: 'Honda Việt Nam',
      },
      {
        group: 'MOTORBIKE',
        label: 'Công suất tối đa',
        value: '6,59 kW @ 7.500 rpm',
        source: 'Honda Việt Nam',
      },
      {
        group: 'MOTORBIKE',
        label: 'Mô-men xoắn cực đại',
        value: '9,29 Nm @ 6.000 rpm',
        source: 'Honda Việt Nam',
      },
      {
        group: 'MOTORBIKE',
        label: 'Mức tiêu thụ nhiên liệu',
        value: '1,85 lít/100 km',
        source: 'Honda Việt Nam',
      },
      {
        group: 'MOTORBIKE',
        label: 'Dung tích bình xăng & cốp',
        value: '4,9 lít · Cốp 15,8 lít',
        source: 'Honda Việt Nam',
      },
      {
        group: 'DIMENSIONS',
        label: 'Chiều cao yên / Trọng lượng',
        value: '761 mm · 94–98 kg',
        source: 'Honda Việt Nam',
      },
    ],
    variants: [
      {
        name: 'Cao cấp',
        year: 2025,
        listedPrice: 32_782_909,
        referenceRentPrice: 160_000,
        fuelType: 'Xăng',
        transmission: 'Vô cấp CVT',
        driveType: 'Dây đai',
        seats: 2,
        summary: 'Trang bị Smart Key, cổng sạc USB và đồng hồ kết hợp LCD nhỏ.',
        colors: [
          { name: 'Trắng đen', hex: '#f4f4f6', mediaKey: 'honda-vision-ext-2' },
          { name: 'Đỏ đen', hex: '#a51c24', mediaKey: 'honda-vision-ext-1' },
        ],
      },
      {
        name: 'Thể thao',
        year: 2025,
        listedPrice: 36_612_000,
        referenceRentPrice: 180_000,
        fuelType: 'Xăng',
        transmission: 'Vô cấp CVT',
        driveType: 'Dây đai',
        seats: 2,
        summary: 'Bánh trước 16 inch cho tư thế lái cao thoáng, tem thể thao đen nhám/xám xi măng.',
        colors: [{ name: 'Xám đen', hex: '#6a7078' }],
      },
    ],
    source: 'https://www.honda.com.vn/xe-may/san-pham/vision',
    featured: false,
    sortOrder: 5,
  },

  // =========================================================================
  // 6. HONDA SH160i
  // =========================================================================
  {
    name: 'Honda SH160i',
    slug: 'honda-sh160i',
    brand: 'Honda',
    category: 'MOTORBIKE',
    subCategory: 'SCOOTER',
    bodyStyle: 'Xe tay ga bánh lớn cao cấp',
    segment: 'Xe tay ga cao cấp',
    origin: 'Việt Nam (Honda Việt Nam)',
    modelYear: 2025,
    seats: 2,
    fuelType: 'Xăng',
    transmission: 'Vô cấp CVT',
    driveType: 'Dây đai',
    listedPrice: 92_490_000,
    referenceRentPrice: 360_000,
    suitableFor: 'Di chuyển lịch lãm hằng ngày, gặp gỡ đối tác và đi phố cao cấp',
    description:
      'Honda SH160i sở hữu phong cách châu Âu sang trọng với vành đúc 16 inch vững chãi, động cơ eSP+ 4 van 156,9 cc bốc mượt và trang bị an toàn ABS 2 kênh kết hợp kiểm soát lực kéo HSTC.',
    exteriorOverview:
      'Thiết kế thân xe cao ráo thanh lịch, cụm đèn LED 2 tầng trước sau nhận diện rõ nét và bộ mâm 16 inch giúp vượt gờ giảm tốc êm ái.',
    interiorOverview:
      'Đồng hồ LCD kép hiển thị đầy đủ thông số, kết nối Bluetooth qua ứng dụng My Honda+, cốp 28 lít tích hợp cổng sạc USB và nắp bình xăng phía trước tiện lợi.',
    engineOverview:
      'Động cơ eSP+ 156,9 cc 4 van làm mát dung dịch đạt công suất 12,4 kW (16,6 hp), tiêu hao nhiên liệu khoảng 2,37 lít/100 km.',
    highlights: [
      'Động cơ eSP+ 4 van 156,9 cc mạnh mẽ và mượt mà',
      'Hệ thống phanh ABS 2 kênh trước/sau & Kiểm soát lực kéo HSTC (bản ABS)',
      'Nắp bình xăng bố trí phía trước, cốp 28 lít tích hợp cổng sạc USB',
    ],
    features: [
      { name: 'Phanh ABS 2 kênh trước/sau', category: 'SAFETY', variantNote: 'Phiên bản ABS' },
      { name: 'Kiểm soát lực kéo HSTC', category: 'DRIVER_ASSIST', variantNote: 'Phiên bản ABS' },
      { name: 'Kết nối Bluetooth My Honda+', category: 'TECHNOLOGY' },
      { name: 'Cốp 28 lít & Smart Key', category: 'COMFORT' },
    ],
    coverKey: 'honda-sh160i-ext-1',
    gallery: [
      {
        mediaKey: 'honda-sh160i-ext-1',
        kind: 'EXTERIOR',
        caption: 'Honda SH 150i/160i kiểu dáng châu Âu bánh lớn (Wikimedia Commons)',
      },
      {
        mediaKey: 'honda-sh160i-ext-2',
        kind: 'EXTERIOR',
        caption: 'Thân xe cao ráo và yên đôi (Wikimedia Commons)',
      },
    ],
    specifications: [
      {
        group: 'MOTORBIKE',
        label: 'Động cơ',
        value: 'eSP+ 4 van 156,9 cc làm mát dung dịch',
        source: 'Honda Việt Nam',
      },
      {
        group: 'MOTORBIKE',
        label: 'Công suất tối đa',
        value: '12,4 kW @ 8.500 rpm',
        source: 'Honda Việt Nam',
      },
      {
        group: 'MOTORBIKE',
        label: 'Mô-men xoắn cực đại',
        value: '14,8 Nm @ 6.500 rpm',
        source: 'Honda Việt Nam',
      },
      {
        group: 'MOTORBIKE',
        label: 'Mức tiêu thụ nhiên liệu',
        value: '2,37 lít/100 km',
        source: 'Honda Việt Nam',
      },
      {
        group: 'MOTORBIKE',
        label: 'Bình xăng & Cốp',
        value: '7,0 lít · Cốp 28 lít',
        source: 'Honda Việt Nam',
      },
      {
        group: 'DIMENSIONS',
        label: 'Chiều cao yên / Trọng lượng',
        value: '799 mm · 133 kg',
        source: 'Honda Việt Nam',
      },
    ],
    variants: [
      {
        name: 'Cao cấp ABS',
        year: 2025,
        listedPrice: 100_490_000,
        referenceRentPrice: 360_000,
        fuelType: 'Xăng',
        transmission: 'Vô cấp CVT',
        driveType: 'Dây đai',
        seats: 2,
        summary: 'Phanh ABS 2 kênh, HSTC, đồng hồ LCD kết nối Bluetooth.',
        colors: [
          { name: 'Trắng đen', hex: '#f4f4f6', mediaKey: 'honda-sh160i-ext-1' },
          { name: 'Đỏ đen', hex: '#9e1920' },
        ],
      },
      {
        name: 'Thể thao ABS',
        year: 2025,
        listedPrice: 102_190_000,
        referenceRentPrice: 380_000,
        fuelType: 'Xăng',
        transmission: 'Vô cấp CVT',
        driveType: 'Dây đai',
        seats: 2,
        summary: 'Màu xám xi măng thể thao, heo dầu đỏ và giảm xóc sau sơn đỏ.',
        colors: [{ name: 'Xám đen', hex: '#6c727a', mediaKey: 'honda-sh160i-ext-2' }],
      },
    ],
    source: 'https://www.honda.com.vn/xe-may/san-pham/sh160i-125i',
    featured: false,
    sortOrder: 6,
  },

  // =========================================================================
  // 7. HONDA SH350i
  // =========================================================================
  {
    name: 'Honda SH350i',
    slug: 'honda-sh350i',
    brand: 'Honda',
    category: 'MOTORBIKE',
    subCategory: 'SCOOTER',
    bodyStyle: 'Xe tay ga phân khối lớn',
    segment: 'Maxi-scooter bánh lớn hạng sang',
    origin: 'Việt Nam / Ý',
    modelYear: 2025,
    seats: 2,
    fuelType: 'Xăng',
    transmission: 'Vô cấp CVT',
    driveType: 'Dây đai',
    listedPrice: 151_190_000,
    referenceRentPrice: 550_000,
    suitableFor:
      'Người có bằng lái A2/A yêu thích sức mạnh xe tay ga phân khối lớn đi phố và ngoại ô',
    description:
      'Honda SH350i là mẫu xe tay ga đầu bảng trang bị động cơ eSP+ 329,6 cc đầy uy lực, khung sườn cứng vững, phanh ABS 2 kênh và cảnh báo phanh khẩn cấp ESS. Yêu cầu người lái có giấy phép lái xe mô tô hạng A2 (hoặc hạng A theo quy định mới).',
    exteriorOverview:
      'Thân xe bề thế với mặt nạ mới hiện đại, đèn định vị LED sắc sảo, cặp lốp 16 inch bản rộng và ống xả lớn mạ crôm.',
    interiorOverview:
      'Cụm đồng hồ LCD đa thông tin kết nối điện thoại thông minh, hộc đồ trước và cốp dưới yên chứa mũ bảo hiểm cả đầu cùng cổng sạc USB-C.',
    engineOverview:
      'Động cơ eSP+ 329,6 cc SOHC 4 van làm mát dung dịch sản sinh 21,5 kW (28,8 hp) và mô-men xoắn 31,8 Nm giúp tăng tốc dứt khoát trên cao tốc/quốc lộ.',
    highlights: [
      'Động cơ eSP+ 329,6 cc công suất 21,5 kW / mô-men xoắn 31,8 Nm',
      'Trang bị phanh ABS 2 kênh, kiểm soát lực kéo HSTC và tín hiệu dừng khẩn cấp ESS',
      'Bình xăng 9,3 lít đáp ứng hành trình đường trường',
    ],
    features: [
      { name: 'Phanh ABS 2 kênh & Đèn báo phanh khẩn cấp ESS', category: 'SAFETY' },
      { name: 'Kiểm soát lực kéo HSTC chống trượt bánh sau', category: 'DRIVER_ASSIST' },
      { name: 'Smart Key & Kết nối Bluetooth', category: 'TECHNOLOGY' },
    ],
    coverKey: 'honda-sh350i-ext-1',
    gallery: [
      {
        mediaKey: 'honda-sh350i-ext-1',
        kind: 'EXTERIOR',
        caption: 'Honda SH 350i — Góc trực diện phần đầu xe (Wikimedia Commons)',
      },
      {
        mediaKey: 'honda-sh350i-ext-2',
        kind: 'EXTERIOR',
        caption: 'Honda SH 350i — Góc chéo thân xe và hệ thống phanh đĩa (Wikimedia Commons)',
      },
      {
        mediaKey: 'honda-sh350i-ext-3',
        kind: 'EXTERIOR',
        caption: 'Honda SH 350i — Tổng thể ngoại thất (Wikimedia Commons)',
      },
    ],
    specifications: [
      {
        group: 'MOTORBIKE',
        label: 'Động cơ',
        value: 'eSP+ 329,6 cc SOHC 4 van làm mát dung dịch',
        source: 'Honda Việt Nam',
      },
      {
        group: 'MOTORBIKE',
        label: 'Công suất tối đa',
        value: '21,5 kW @ 7.500 rpm',
        source: 'Honda Việt Nam',
      },
      {
        group: 'MOTORBIKE',
        label: 'Mô-men xoắn cực đại',
        value: '31,8 Nm @ 5.250 rpm',
        source: 'Honda Việt Nam',
      },
      {
        group: 'MOTORBIKE',
        label: 'Bình xăng & Tiêu hao',
        value: '9,3 lít · ~3,63 lít/100 km',
        source: 'Honda Việt Nam',
      },
      {
        group: 'DIMENSIONS',
        label: 'Chiều cao yên / Trọng lượng',
        value: '805 mm · 172 kg',
        source: 'Honda Việt Nam',
      },
      {
        group: 'MOTORBIKE',
        label: 'Yêu cầu bằng lái',
        value: 'GPLX mô tô trên 175 cc (A2 / A)',
        source: 'Quy định VN',
      },
    ],
    variants: [
      {
        name: 'Thể thao ABS 2025',
        year: 2025,
        listedPrice: 152_690_000,
        referenceRentPrice: 550_000,
        fuelType: 'Xăng',
        transmission: 'Vô cấp CVT',
        driveType: 'Dây đai',
        seats: 2,
        summary: 'Phiên bản thể thao Xám đen/Xanh đen, kẹp phanh đỏ, ABS 2 kênh và HSTC.',
        colors: [
          { name: 'Xám đen', hex: '#636970', mediaKey: 'honda-sh350i-ext-1' },
          { name: 'Trắng đen', hex: '#f0f1f4', mediaKey: 'honda-sh350i-ext-3' },
        ],
      },
    ],
    source: 'https://www.honda.com.vn/xe-may/san-pham/sh350i',
    featured: false,
    sortOrder: 7,
  },

  // =========================================================================
  // 8. YAMAHA EXCITER 155 VVA
  // =========================================================================
  {
    name: 'Yamaha Exciter 155 VVA',
    slug: 'yamaha-exciter-155-vva',
    brand: 'Yamaha',
    category: 'MOTORBIKE',
    subCategory: 'CLUTCH_BIKE',
    bodyStyle: 'Xe côn tay thể thao',
    segment: 'Underbone côn tay 155cc',
    origin: 'Việt Nam (Yamaha Motor Việt Nam)',
    modelYear: 2024,
    seats: 2,
    fuelType: 'Xăng',
    transmission: 'Côn tay 6 cấp',
    driveType: 'Xích tải',
    listedPrice: 48_000_000,
    referenceRentPrice: 220_000,
    suitableFor: 'Người thích cảm giác sang số thể thao, đi tour đường đèo và phong cách năng động',
    description:
      'Yamaha Exciter 155 VVA thừa hưởng nhiều công nghệ từ mô tô R-Series như van biến thiên VVA, hộp số 6 cấp kèm bộ ly hợp hỗ trợ chống trượt A&S (Assist & Slipper Clutch) và phiên bản phanh ABS bánh trước.',
    exteriorOverview:
      'Thân xe khí động học đậm chất thể thao, đầu đèn chia 2 tầng tách biệt đèn chiếu gần/xa và đuôi xe vuốt nhọn phong cách R1.',
    interiorOverview:
      'Màn hình LCD đơn sắc đầy đủ vòng tua máy, vị trí cấp số, quãng đường và mức nhiên liệu; bản Cao cấp/ABS trang bị Smart Key.',
    engineOverview:
      'Động cơ 155,09 cc SOHC 4 van làm mát dung dịch tích hợp VVA sản sinh 17,9 PS tại 9.500 rpm và mô-men xoắn 14,4 Nm.',
    highlights: [
      'Động cơ 155 cc tích hợp Van biến thiên VVA cho dải tốc độ linh hoạt',
      'Hộp số 6 cấp & Ly hợp chống trượt A&S giúp dồn số êm ái',
      'Tùy chọn phanh ABS bánh trước trên phiên bản ABS',
    ],
    features: [
      { name: 'Bộ ly hợp chống trượt Assist & Slipper Clutch', category: 'DRIVER_ASSIST' },
      { name: 'Van biến thiên VVA', category: 'TECHNOLOGY' },
      { name: 'Phanh ABS bánh trước', category: 'SAFETY', variantNote: 'Phiên bản ABS' },
      { name: 'Smart Key & Ổ cắm sạc 12V', category: 'COMFORT', variantNote: 'Bản Cao cấp / ABS' },
    ],
    coverKey: 'yamaha-exciter-ext-1',
    gallery: [
      {
        mediaKey: 'yamaha-exciter-ext-1',
        kind: 'EXTERIOR',
        caption: 'Yamaha Exciter / Y15ZR ngoại thất thể thao (Wikimedia Commons)',
      },
      {
        mediaKey: 'yamaha-exciter-ext-2',
        kind: 'EXTERIOR',
        caption: 'Thân xe thiết kế underbone khí động học (Wikimedia Commons)',
      },
      {
        mediaKey: 'yamaha-exciter-feat-1',
        kind: 'FEATURE',
        caption: 'Cụm đồng hồ hiển thị thể thao dòng Exciter / MX King (Wikimedia Commons)',
      },
    ],
    specifications: [
      {
        group: 'MOTORBIKE',
        label: 'Động cơ',
        value: '155,09 cc, 4 kỳ, 4 van SOHC VVA, làm mát dung dịch',
        source: 'Yamaha Motor VN',
      },
      {
        group: 'MOTORBIKE',
        label: 'Công suất tối đa',
        value: '17,9 PS (13,2 kW) @ 9.500 rpm',
        source: 'Yamaha Motor VN',
      },
      {
        group: 'MOTORBIKE',
        label: 'Mô-men xoắn cực đại',
        value: '14,4 Nm @ 8.000 rpm',
        source: 'Yamaha Motor VN',
      },
      {
        group: 'MOTORBIKE',
        label: 'Hộp số',
        value: 'Côn tay 6 cấp, ly hợp A&S',
        source: 'Yamaha Motor VN',
      },
      { group: 'MOTORBIKE', label: 'Bình xăng', value: '5,4 lít', source: 'Yamaha Motor VN' },
      {
        group: 'DIMENSIONS',
        label: 'Chiều cao yên / Trọng lượng',
        value: '795 mm · 119–123 kg',
        source: 'Yamaha Motor VN',
      },
    ],
    variants: [
      {
        name: 'Cao cấp ABS',
        year: 2024,
        listedPrice: 54_000_000,
        referenceRentPrice: 220_000,
        fuelType: 'Xăng',
        transmission: 'Côn tay 6 cấp',
        driveType: 'Xích tải',
        seats: 2,
        summary: 'Phanh ABS bánh trước, Smart Key và kẹp phanh 2 piston.',
        colors: [
          { name: 'Xanh GP', hex: '#144296', mediaKey: 'yamaha-exciter-ext-1' },
          { name: 'Đen nhám', hex: '#23262b' },
        ],
      },
    ],
    source: 'https://yamaha-motor.com.vn/xe/exciter-155-vva/',
    featured: false,
    sortOrder: 8,
  },

  // =========================================================================
  // 9. VINFAST EVO200
  // =========================================================================
  {
    name: 'VinFast Evo200',
    slug: 'vinfast-evo200',
    brand: 'VinFast',
    category: 'MOTORBIKE',
    subCategory: 'ELECTRIC_BIKE',
    bodyStyle: 'Xe máy điện đô thị',
    segment: 'Xe máy điện pin LFP',
    origin: 'Việt Nam (VinFast)',
    modelYear: 2024,
    seats: 2,
    fuelType: 'Điện (EV)',
    transmission: 'Truyền động trực tiếp (Inhub)',
    driveType: 'Mô-tơ bánh sau',
    listedPrice: 25_900_000,
    referenceRentPrice: 150_000,
    suitableFor: 'Đi làm, đi học trong đô thị, không khí thải, chi phí sạc điện rất thấp',
    description:
      'VinFast Evo200 là mẫu xe máy điện phổ biến nhờ kiểu dáng gọn gàng mang hơi hướng châu Âu, sử dụng pin LFP 3,5 kWh cho quãng đường di chuyển công bố lên đến 203 km sau mỗi lần sạc ở điều kiện tiêu chuẩn 30 km/h.',
    exteriorOverview:
      'Đèn pha LED projector tròn cổ điển kết hợp thân xe bo tròn mềm mại, đạt tiêu chuẩn chống nước IP67 cho cả động cơ và pin.',
    interiorOverview:
      'Màn hình đồng hồ HMI kỹ thuật số hiển thị dung lượng pin, chế độ Eco/Sport và kết nối ứng dụng VinFast E-Scooter.',
    engineOverview:
      'Động cơ điện Inhub công suất danh định 1.500 W (tối đa 2.500 W), vận tốc tối đa 70 km/h, vận hành êm ái không tiếng ồn.',
    highlights: [
      'Pin LFP 3,5 kWh công bố đi tới 203 km/lần sạc (điều kiện tiêu chuẩn)',
      'Động cơ & Pin chuẩn chống nước IP67 phù hợp điều kiện đường mưa ngập nhẹ',
      'Cốp xe rộng 22 lít dưới yên dù đặt pin LFP dưới sàn',
    ],
    features: [
      { name: 'Pin LFP dung lượng 3,5 kWh an toàn chống cháy nổ', category: 'TECHNOLOGY' },
      { name: 'Chống nước IP67 cho động cơ và bộ pin', category: 'SAFETY' },
      { name: 'Cốp dưới yên dung tích 22 lít', category: 'COMFORT' },
      { name: 'Hai chế độ lái Eco / Sport', category: 'DRIVER_ASSIST' },
    ],
    coverKey: 'vinfast-evo200-ext-1',
    gallery: [
      {
        mediaKey: 'vinfast-evo200-ext-1',
        kind: 'EXTERIOR',
        caption: 'VinFast Evo phiên bản màu vàng nổi bật (Wikimedia Commons)',
      },
      {
        mediaKey: 'vinfast-evo200-ext-2',
        kind: 'EXTERIOR',
        caption: 'VinFast Evo phiên bản màu xanh rêu (Wikimedia Commons)',
      },
    ],
    specifications: [
      {
        group: 'EV',
        label: 'Loại mô-tơ',
        value: 'Động cơ điện Inhub đặt bánh sau',
        source: 'VinFast',
      },
      {
        group: 'EV',
        label: 'Công suất danh định / tối đa',
        value: '1.500 W / 2.500 W',
        source: 'VinFast',
      },
      {
        group: 'EV',
        label: 'Loại & dung lượng pin',
        value: 'Pin LFP · 3,5 kWh',
        source: 'VinFast',
      },
      {
        group: 'EV',
        label: 'Quãng đường công bố',
        value: 'Tối đa 203 km/lần sạc (ở 30 km/h, 1 người 65 kg)',
        source: 'VinFast',
      },
      {
        group: 'EV',
        label: 'Thời gian sạc tiêu chuẩn',
        value: '~10 giờ (sạc 400W) hoặc ~4 giờ (sạc 1000W)',
        source: 'VinFast',
      },
      {
        group: 'DIMENSIONS',
        label: 'Chiều cao yên / Trọng lượng',
        value: '750 mm · 97 kg (gồm pin)',
        source: 'VinFast',
      },
    ],
    variants: [
      {
        name: 'Evo200 (Kèm pin / thuê pin)',
        year: 2024,
        listedPrice: 25_900_000,
        referenceRentPrice: 150_000,
        fuelType: 'Điện (EV)',
        transmission: 'Tự động (Điện)',
        driveType: 'Inhub bánh sau',
        seats: 2,
        summary: 'Tốc độ tối đa 70 km/h, pin LFP 3,5 kWh, cốp 22 lít.',
        colors: [
          { name: 'Vàng', hex: '#e5b822', mediaKey: 'vinfast-evo200-ext-1' },
          { name: 'Xanh rêu', hex: '#4f5d42', mediaKey: 'vinfast-evo200-ext-2' },
          { name: 'Trắng ngọc trai', hex: '#f2f3f5' },
        ],
      },
    ],
    source: 'https://vinfastauto.com/vn_vi',
    featured: false,
    sortOrder: 9,
  },

  // =========================================================================
  // 10. KAWASAKI Z650 ABS
  // =========================================================================
  {
    name: 'Kawasaki Z650 ABS',
    slug: 'kawasaki-z650',
    brand: 'Kawasaki',
    category: 'MOTORBIKE',
    subCategory: 'BIG_BIKE',
    bodyStyle: 'Mô tô Naked-bike',
    segment: 'Mô tô phân khối lớn 650cc',
    origin: 'Thái Lan (Nhập khẩu)',
    modelYear: 2024,
    seats: 2,
    fuelType: 'Xăng',
    transmission: 'Côn tay 6 cấp',
    driveType: 'Xích tải',
    listedPrice: 190_000_000,
    referenceRentPrice: 950_000,
    suitableFor:
      'Biker có GPLX hạng A2/A muốn trải nghiệm mô tô hạng trung dễ điều khiển và mô-men xoắn tốt',
    description:
      'Kawasaki Z650 ABS mang ngôn ngữ thiết kế Sugomi góc cạnh cùng khối động cơ 2 xi-lanh thẳng hàng 649 cc giàu lực kéo ở dải vòng tua thấp và trung, khung sườn ống thép Trellis nhẹ chỉ 188 kg.',
    exteriorOverview:
      'Thiết kế Sugomi với đầu đèn LED sắc bén, bình xăng cơ bắp 15 lít và ống xả đặt gọn gàng dưới gầm giúp trọng tâm xe thấp.',
    interiorOverview:
      'Màn hình TFT màu 4,3 inch hỗ trợ kết nối smartphone qua ứng dụng Rideology hiển thị cuộc gọi, nhật ký hành trình và trạng thái xe.',
    engineOverview:
      'Động cơ 649 cc DOHC 2 xi-lanh làm mát dung dịch, công suất 68 PS @ 8.000 rpm, mô-men xoắn 64 Nm, kết hợp kiểm soát lực kéo KTRC.',
    highlights: [
      'Khung sườn Trellis trọng lượng ướt nhẹ chỉ 188 kg, dễ làm quen',
      'Hệ thống kiểm soát lực kéo KTRC 2 chế độ & Phanh ABS 2 kênh',
      'Màn hình TFT màu 4,3 inch kết nối Rideology',
    ],
    features: [
      { name: 'Kiểm soát lực kéo KTRC', category: 'DRIVER_ASSIST' },
      { name: 'Phanh đĩa đôi trước 300 mm ABS Bosch', category: 'SAFETY' },
      { name: 'Màn hình màu TFT & Kết nối Rideology', category: 'TECHNOLOGY' },
      { name: 'Ly hợp chống trượt Assist & Slipper Clutch', category: 'DRIVER_ASSIST' },
    ],
    coverKey: 'kawasaki-z650-ext-1',
    gallery: [
      {
        mediaKey: 'kawasaki-z650-ext-1',
        kind: 'EXTERIOR',
        caption: 'Kawasaki Z650 góc ngang thân xe khung Trellis (Wikimedia Commons)',
      },
      {
        mediaKey: 'kawasaki-z650-ext-2',
        kind: 'EXTERIOR',
        caption: 'Kawasaki Z650 thiết kế Sugomi góc chéo (Wikimedia Commons)',
      },
    ],
    specifications: [
      {
        group: 'MOTORBIKE',
        label: 'Động cơ',
        value: '649 cc, 2 xi-lanh thẳng hàng, DOHC 8 van',
        source: 'Kawasaki',
      },
      {
        group: 'MOTORBIKE',
        label: 'Công suất tối đa',
        value: '68 PS (50,2 kW) @ 8.000 rpm',
        source: 'Kawasaki',
      },
      {
        group: 'MOTORBIKE',
        label: 'Mô-men xoắn cực đại',
        value: '64 Nm @ 6.700 rpm',
        source: 'Kawasaki',
      },
      { group: 'MOTORBIKE', label: 'Bình xăng', value: '15 lít', source: 'Kawasaki' },
      {
        group: 'DIMENSIONS',
        label: 'Chiều cao yên / Trọng lượng ướt',
        value: '790 mm · 188 kg',
        source: 'Kawasaki',
      },
      {
        group: 'MOTORBIKE',
        label: 'Yêu cầu bằng lái',
        value: 'GPLX mô tô trên 175 cc (A2 / A)',
        source: 'Quy định VN',
      },
    ],
    variants: [
      {
        name: 'Z650 ABS 2024',
        year: 2024,
        listedPrice: 190_000_000,
        referenceRentPrice: 950_000,
        fuelType: 'Xăng',
        transmission: 'Côn tay 6 cấp',
        driveType: 'Xích tải',
        seats: 2,
        summary: 'Động cơ 649 cc, màn hình TFT, KTRC và phanh ABS.',
        colors: [
          { name: 'Đen ánh kim', hex: '#1a1d21', mediaKey: 'kawasaki-z650-ext-1' },
          { name: 'Xanh đen Kawasaki', hex: '#39a832', mediaKey: 'kawasaki-z650-ext-2' },
        ],
      },
    ],
    source: 'https://www.kawasaki-motors.vn/',
    featured: false,
    sortOrder: 10,
  },

  // =========================================================================
  // 11. TOYOTA VIOS
  // =========================================================================
  {
    name: 'Toyota Vios',
    slug: 'toyota-vios',
    brand: 'Toyota',
    category: 'CAR',
    subCategory: 'SEDAN',
    bodyStyle: 'Sedan hạng B',
    segment: 'Sedan đô thị 5 chỗ',
    origin: 'Việt Nam (Toyota Việt Nam)',
    modelYear: 2024,
    seats: 5,
    fuelType: 'Xăng',
    transmission: 'Vô cấp CVT / Số sàn 5 cấp',
    driveType: 'Cầu trước (FWD)',
    listedPrice: 458_000_000,
    referenceRentPrice: 700_000,
    suitableFor:
      'Đi công tác, di chuyển hằng ngày trong phố và gia đình nhỏ cần sự ổn định, tiết kiệm',
    description:
      'Toyota Vios là mẫu sedan hạng B phổ biến bậc nhất tại Việt Nam nhờ khoang hành lý rộng 506 lít, khả năng vận hành bền bỉ, tiết kiệm nhiên liệu (~5,88 L/100km bản G) và bổ sung gói Toyota Safety Sense trên phiên bản G.',
    exteriorOverview:
      'Mặt ca-lăng mở rộng sắc nét, đèn chiếu sáng Bi-LED tiêu chuẩn trên cả 3 phiên bản cùng bộ mâm hợp kim phay xước 15 inch.',
    interiorOverview:
      'Không gian hàng ghế sau thoáng rộng hàng đầu phân khúc, màn hình cảm ứng 9 inch hỗ trợ kết nối điện thoại thông minh, lẫy chuyển số trên vô lăng (bản G).',
    engineOverview:
      'Động cơ xăng 2NR-FE 1.5L 4 xi-lanh Dual VVT-i công suất 107 mã lực, mô-men xoắn 140 Nm kết hợp hộp số CVT mượt mà.',
    highlights: [
      'Khoang hành lý rộng tới 506 lít chứa được nhiều vali cho chuyến đi xa',
      'Tiết kiệm nhiên liệu trung bình chỉ 5,88 lít/100 km (đường hỗn hợp)',
      'Trang bị 7 túi khí và gói an toàn chủ động trên bản 1.5G CVT',
    ],
    features: [
      {
        name: 'Màn hình cảm ứng 9 inch kết nối Apple CarPlay / Android Auto',
        category: 'TECHNOLOGY',
      },
      { name: 'Điều hòa tự động (bản G)', category: 'COMFORT', variantNote: '1.5G CVT' },
      { name: '7 túi khí & Cân bằng điện tử VSC', category: 'SAFETY', variantNote: '1.5G CVT' },
      {
        name: 'Cảnh báo tiền va chạm & Lệch làn đường',
        category: 'DRIVER_ASSIST',
        variantNote: '1.5G CVT',
      },
    ],
    coverKey: 'toyota-vios-ext-1',
    gallery: [
      {
        mediaKey: 'toyota-vios-ext-1',
        kind: 'EXTERIOR',
        caption: 'Toyota Vios góc chéo trước (Wikimedia Commons)',
      },
      {
        mediaKey: 'toyota-vios-ext-2',
        kind: 'EXTERIOR',
        caption: 'Phần đầu xe thiết kế sedan (Wikimedia Commons)',
      },
      {
        mediaKey: 'toyota-vios-int-1',
        kind: 'INTERIOR',
        caption: 'Khoang lái và vô lăng Toyota Vios (Wikimedia Commons)',
      },
    ],
    specifications: [
      {
        group: 'ENGINE',
        label: 'Động cơ',
        value: '2NR-FE 1.5L 4 xi-lanh Dual VVT-i',
        source: 'Toyota Việt Nam',
      },
      {
        group: 'ENGINE',
        label: 'Công suất / Mô-men xoắn',
        value: '107 hp @ 6.000 rpm · 140 Nm @ 4.200 rpm',
        source: 'Toyota Việt Nam',
      },
      {
        group: 'ENGINE',
        label: 'Tiêu hao nhiên liệu hỗn hợp',
        value: '5,88 lít/100 km (bản G CVT)',
        source: 'Toyota Việt Nam',
      },
      {
        group: 'DIMENSIONS',
        label: 'Kích thước (D × R × C)',
        value: '4.425 × 1.730 × 1.475 mm',
        source: 'Toyota Việt Nam',
      },
      {
        group: 'DIMENSIONS',
        label: 'Chiều dài cơ sở / Khoảng sáng gầm',
        value: '2.550 mm · 133 mm',
        source: 'Toyota Việt Nam',
      },
      {
        group: 'DIMENSIONS',
        label: 'Dung tích cốp & Bình xăng',
        value: '506 lít · 42 lít',
        source: 'Toyota Việt Nam',
      },
    ],
    variants: [
      {
        name: '1.5E CVT',
        year: 2024,
        listedPrice: 488_000_000,
        referenceRentPrice: 700_000,
        fuelType: 'Xăng',
        transmission: 'Vô cấp CVT',
        driveType: 'Cầu trước (FWD)',
        seats: 5,
        summary: 'Phiên bản số tự động tiêu chuẩn với đèn Bi-LED và màn hình giải trí.',
        colors: [
          { name: 'Trắng ngọc trai', hex: '#f4f4f2', mediaKey: 'toyota-vios-ext-1' },
          { name: 'Bạc', hex: '#b8bec4' },
        ],
      },
      {
        name: '1.5G CVT',
        year: 2024,
        listedPrice: 545_000_000,
        referenceRentPrice: 780_000,
        fuelType: 'Xăng',
        transmission: 'Vô cấp CVT',
        driveType: 'Cầu trước (FWD)',
        seats: 5,
        summary: '7 túi khí, điều hòa tự động, màn hình 9 inch, cảnh báo tiền va chạm & lệch làn.',
        colors: [
          { name: 'Trắng ngọc trai', hex: '#f4f4f2', mediaKey: 'toyota-vios-ext-2' },
          { name: 'Đen', hex: '#181a1d' },
        ],
      },
    ],
    source: 'https://www.toyota.com.vn/',
    featured: false,
    sortOrder: 11,
  },

  // =========================================================================
  // 12. MAZDA CX-5
  // =========================================================================
  {
    name: 'Mazda CX-5',
    slug: 'mazda-cx-5',
    brand: 'Mazda',
    category: 'CAR',
    subCategory: 'CUV',
    bodyStyle: 'CUV 5 chỗ',
    segment: 'CUV hạng C',
    origin: 'Việt Nam (THACO Mazda)',
    modelYear: 2024,
    seats: 5,
    fuelType: 'Xăng',
    transmission: 'Tự động 6 cấp',
    driveType: 'FWD / AWD',
    listedPrice: 749_000_000,
    referenceRentPrice: 1_050_000,
    suitableFor:
      'Gia đình 4–5 người yêu cầu thẩm mỹ cao cấp, nội thất tinh tế và cảm giác lái đầm chắc',
    description:
      'Mazda CX-5 chinh phục người dùng nhờ ngôn ngữ thiết kế KODO thanh lịch, khoang nội thất hoàn thiện tinh xảo, công nghệ kiểm soát gia tốc G-Vectoring Control Plus (GVC Plus) và gói an toàn i-Activsense.',
    exteriorOverview:
      'Mặt ca-lăng họa tiết 3D đặc trưng, cụm đèn LED thích ứng thông minh ALH và bộ mâm hợp kim 19 inch cân đối.',
    interiorOverview:
      'Ghế bọc da cao cấp, màn hình HUD hắt kính lái, cửa sổ trời, 10 loa Bose (từ bản Premium) và cốp đóng mở điện.',
    engineOverview:
      'Động cơ xăng Skyactiv-G 2.0L (154 hp / 200 Nm) hoặc 2.5L kết hợp hộp số tự động 6 cấp chuyển số mượt mà.',
    highlights: [
      'Thiết kế KODO sang trọng, nội thất hoàn thiện cao cấp trong tầm giá',
      'Hệ thống kiểm soát gia tốc GVC Plus giúp ôm cua êm ái, giảm say xe',
      '10 loa Bose và màn hình HUD trên phiên bản Premium / Exclusive',
    ],
    features: [
      { name: 'Hệ thống kiểm soát gia tốc GVC Plus', category: 'DRIVER_ASSIST' },
      {
        name: '10 loa Bose & Màn hình HUD kính lái',
        category: 'TECHNOLOGY',
        variantNote: 'Bản Premium trở lên',
      },
      { name: 'Cảnh báo điểm mù BSM & Phương tiện cắt ngang RCTA', category: 'SAFETY' },
      { name: 'Cửa sổ trời & Cốp điện', category: 'COMFORT' },
    ],
    coverKey: 'mazda-cx5-ext-1',
    gallery: [
      {
        mediaKey: 'mazda-cx5-ext-1',
        kind: 'EXTERIOR',
        caption: 'Mazda CX-5 KF facelift góc chéo trước (Wikimedia Commons)',
      },
      {
        mediaKey: 'mazda-cx5-ext-2',
        kind: 'EXTERIOR',
        caption: 'Ngôn ngữ thiết kế KODO góc bên hông (Wikimedia Commons)',
      },
      {
        mediaKey: 'mazda-cx5-int-1',
        kind: 'INTERIOR',
        caption: 'Khoang lái Mazda CX-5 thế hệ KF (Wikimedia Commons)',
      },
      {
        mediaKey: 'mazda-cx5-eng-1',
        kind: 'ENGINE',
        caption: 'Động cơ xăng Skyactiv-G 2.0L (Wikimedia Commons)',
      },
    ],
    specifications: [
      {
        group: 'ENGINE',
        label: 'Động cơ',
        value: 'Skyactiv-G 2.0L (154 hp) / 2.5L (188 hp)',
        source: 'Mazda Việt Nam',
      },
      {
        group: 'ENGINE',
        label: 'Mô-men xoắn cực đại',
        value: '200 Nm @ 4.000 rpm (bản 2.0L)',
        source: 'Mazda Việt Nam',
      },
      { group: 'ENGINE', label: 'Hộp số', value: 'Tự động 6 cấp', source: 'Mazda Việt Nam' },
      {
        group: 'DIMENSIONS',
        label: 'Kích thước (D × R × C)',
        value: '4.590 × 1.845 × 1.680 mm',
        source: 'Mazda Việt Nam',
      },
      {
        group: 'DIMENSIONS',
        label: 'Chiều dài cơ sở / Khoảng sáng gầm',
        value: '2.700 mm · 200 mm',
        source: 'Mazda Việt Nam',
      },
      {
        group: 'DIMENSIONS',
        label: 'Dung tích khoang hành lý',
        value: '442 lít',
        source: 'Mazda Việt Nam',
      },
    ],
    variants: [
      {
        name: '2.0L Luxury',
        year: 2024,
        listedPrice: 789_000_000,
        referenceRentPrice: 1_050_000,
        fuelType: 'Xăng',
        transmission: 'Tự động 6 cấp',
        driveType: 'Cầu trước (FWD)',
        seats: 5,
        summary: 'Cốp điện, điều hòa 2 vùng, 6 túi khí, cảnh báo điểm mù BSM.',
        colors: [
          { name: 'Đỏ Soul Red Crystal', hex: '#9b111e', mediaKey: 'mazda-cx5-ext-1' },
          { name: 'Trắng', hex: '#f4f4f2', mediaKey: 'mazda-cx5-ext-2' },
        ],
      },
      {
        name: '2.0L Premium Active',
        year: 2024,
        listedPrice: 829_000_000,
        referenceRentPrice: 1_150_000,
        fuelType: 'Xăng',
        transmission: 'Tự động 6 cấp',
        driveType: 'Cầu trước (FWD)',
        seats: 5,
        summary: '10 loa Bose, HUD, sưởi/làm mát ghế trước, gói i-Activsense đầy đủ.',
        colors: [{ name: 'Xám Machine Grey', hex: '#5d6166' }],
      },
    ],
    source: 'https://www.mazdamotors.vn/',
    featured: false,
    sortOrder: 12,
  },

  // =========================================================================
  // 13. MITSUBISHI XPANDER
  // =========================================================================
  {
    name: 'Mitsubishi Xpander',
    slug: 'mitsubishi-xpander',
    brand: 'Mitsubishi',
    category: 'CAR',
    subCategory: 'MPV',
    bodyStyle: 'MPV 7 chỗ',
    segment: 'MPV 7 chỗ đa dụng',
    origin: 'Indonesia / Việt Nam',
    modelYear: 2024,
    seats: 7,
    fuelType: 'Xăng',
    transmission: 'Tự động 4 cấp / Số sàn 5 cấp',
    driveType: 'Cầu trước (FWD)',
    listedPrice: 560_000_000,
    referenceRentPrice: 850_000,
    suitableFor:
      'Gia đình đông người đi du lịch, đưa đón sân bay và di chuyển linh hoạt nhiều hành lý',
    description:
      'Mitsubishi Xpander là mẫu MPV 7 chỗ bán chạy hàng đầu nhờ không gian cabin rộng rãi, gầm cao tới 225 mm (bản AT Premium) tương đương nhiều xe CUV, phanh tay điện tử và chi phí sử dụng kinh tế.',
    exteriorOverview:
      'Thiết kế Dynamic Shield hiện đại với đèn pha T-Shape đặt thấp chống chói, mâm hợp kim 17 inch hai tông màu và khoảng sáng gầm 225 mm.',
    interiorOverview:
      'Nội thất Horizontal Axis thoáng đạt với 2 tông màu nâu/đen, phanh tay điện tử & Auto Hold, màn hình 9 inch hỗ trợ Apple CarPlay/Android Auto.',
    engineOverview:
      'Động cơ xăng 1.5L MIVEC công suất 104 PS, mô-men xoắn 141 Nm tối ưu cho độ bền và tiết kiệm nhiên liệu trong đô thị lẫn đường trường.',
    highlights: [
      'Khoảng sáng gầm 225 mm giúp tự tin leo lề và đi đường ngập nhẹ',
      'Ba hàng ghế thực dụng cho 7 người lớn, gập phẳng tạo khoang chở đồ lớn',
      'Phanh tay điện tử & Giữ phanh tự động Auto Hold trên bản AT Premium',
    ],
    features: [
      {
        name: 'Phanh tay điện tử & Auto Hold',
        category: 'COMFORT',
        variantNote: 'AT Premium / Cross',
      },
      { name: 'Màn hình cảm ứng 9 inch Apple CarPlay / Android Auto', category: 'TECHNOLOGY' },
      {
        name: 'Kiểm soát vào cua chủ động AYC',
        category: 'DRIVER_ASSIST',
        variantNote: 'Xpander Cross',
      },
      { name: 'Cân bằng điện tử ASC & Hỗ trợ khởi hành ngang dốc HSA', category: 'SAFETY' },
    ],
    coverKey: 'mitsubishi-xpander-ext-1',
    gallery: [
      {
        mediaKey: 'mitsubishi-xpander-ext-1',
        kind: 'EXTERIOR',
        caption: 'Mitsubishi Xpander góc trước Dynamic Shield (Wikimedia Commons)',
      },
      {
        mediaKey: 'mitsubishi-xpander-ext-2',
        kind: 'EXTERIOR',
        caption: 'Góc nhìn đuôi xe đèn hậu T-Shape (Wikimedia Commons)',
      },
      {
        mediaKey: 'mitsubishi-xpander-int-1',
        kind: 'INTERIOR',
        caption: 'Khoang nội thất Mitsubishi Xpander tại Việt Nam (Wikimedia Commons)',
      },
    ],
    specifications: [
      {
        group: 'ENGINE',
        label: 'Động cơ',
        value: '1.5L MIVEC (4A91) 4 xi-lanh',
        source: 'Mitsubishi Motors VN',
      },
      {
        group: 'ENGINE',
        label: 'Công suất / Mô-men xoắn',
        value: '104 PS @ 6.000 rpm · 141 Nm @ 4.000 rpm',
        source: 'Mitsubishi Motors VN',
      },
      {
        group: 'ENGINE',
        label: 'Hộp số',
        value: 'Tự động 4 cấp / Số sàn 5 cấp',
        source: 'Mitsubishi Motors VN',
      },
      {
        group: 'DIMENSIONS',
        label: 'Kích thước (D × R × C)',
        value: '4.595 × 1.750 × 1.750 mm',
        source: 'Mitsubishi Motors VN',
      },
      {
        group: 'DIMENSIONS',
        label: 'Chiều dài cơ sở / Khoảng sáng gầm',
        value: '2.775 mm · 225 mm',
        source: 'Mitsubishi Motors VN',
      },
      {
        group: 'DIMENSIONS',
        label: 'Dung tích bình xăng',
        value: '45 lít',
        source: 'Mitsubishi Motors VN',
      },
    ],
    variants: [
      {
        name: 'AT Premium',
        year: 2024,
        listedPrice: 658_000_000,
        referenceRentPrice: 850_000,
        fuelType: 'Xăng',
        transmission: 'Tự động 4 cấp',
        driveType: 'Cầu trước (FWD)',
        seats: 7,
        summary: 'Đèn LED T-Shape, phanh tay điện tử, Auto Hold, màn hình 9 inch, camera lùi.',
        colors: [
          { name: 'Trắng', hex: '#f4f4f2', mediaKey: 'mitsubishi-xpander-ext-1' },
          { name: 'Đen', hex: '#1b1d21' },
        ],
      },
    ],
    source: 'https://www.mitsubishi-motors.com.vn/',
    featured: false,
    sortOrder: 13,
  },

  // =========================================================================
  // 14. HONDA CR-V
  // =========================================================================
  {
    name: 'Honda CR-V',
    slug: 'honda-cr-v',
    brand: 'Honda',
    category: 'CAR',
    subCategory: 'CUV',
    bodyStyle: 'CUV / SUV 5+2 chỗ',
    segment: 'CUV hạng C cao cấp',
    origin: 'Việt Nam / Thái Lan',
    modelYear: 2024,
    seats: 7,
    fuelType: 'Xăng',
    transmission: 'Vô cấp CVT',
    driveType: 'FWD / AWD',
    listedPrice: 1_029_000_000,
    referenceRentPrice: 1_300_000,
    suitableFor:
      'Gia đình hiện đại đề cao công nghệ an toàn chủ động Honda SENSING và vận hành linh hoạt',
    description:
      'Honda CR-V thế hệ thứ 6 sở hữu thiết kế cứng cáp hiện đại hơn, trục cơ sở kéo dài tăng khoảng để chân và trang bị tiêu chuẩn gói an toàn Honda SENSING cùng 8 túi khí trên toàn bộ các phiên bản.',
    exteriorOverview:
      'Lưới tản nhiệt lục giác khỏe khoắn, nắp ca-pô kéo dài lịch lãm, đèn LED thanh mảnh và bộ mâm 18 inch thể thao.',
    interiorOverview:
      'Bảng táp-lô nổi bật với họa tiết lưới tổ ong giấu khe gió điều hòa, màn hình giải trí 9 inch, đồng hồ kỹ thuật số 10,2 inch và cửa sổ trời toàn cảnh Panorama (bản L AWD / e:HEV RS).',
    engineOverview:
      'Động cơ 1.5L VTEC Turbo mạnh mẽ 188 mã lực và 240 Nm mô-men xoắn đạt sớm ngay từ 1.700 rpm, hoặc hệ truyền động Hybrid e:HEV 2.0L tiết kiệm nhiên liệu.',
    highlights: [
      'Gói an toàn chủ động Honda SENSING tiêu chuẩn trên mọi phiên bản',
      'Động cơ 1.5L VTEC Turbo 188 mã lực tăng tốc mượt mà',
      '8 túi khí & Camera quan sát làn đường LaneWatch',
    ],
    features: [
      {
        name: 'Gói công nghệ Honda SENSING (CMBS, LKAS, RDM, ACC, AHB)',
        category: 'DRIVER_ASSIST',
      },
      { name: '8 túi khí bảo vệ toàn diện', category: 'SAFETY' },
      { name: 'Camera quan sát điểm mù LaneWatch / Camera 360', category: 'SAFETY' },
      { name: 'Màn hình 9 inch, sạc không dây & Honda CONNECT', category: 'TECHNOLOGY' },
    ],
    coverKey: 'honda-crv-ext-1',
    gallery: [
      {
        mediaKey: 'honda-crv-ext-1',
        kind: 'EXTERIOR',
        caption: 'Honda CR-V thế hệ thứ 6 góc chéo trước (Wikimedia Commons)',
      },
      {
        mediaKey: 'honda-crv-ext-2',
        kind: 'EXTERIOR',
        caption: 'Honda CR-V thế hệ thứ 6 góc chéo sau (Wikimedia Commons)',
      },
      {
        mediaKey: 'honda-crv-int-1',
        kind: 'INTERIOR',
        caption: 'Khoang lái lưới tổ ong thế hệ thứ 6 (Wikimedia Commons)',
      },
    ],
    specifications: [
      {
        group: 'ENGINE',
        label: 'Động cơ',
        value: '1.5L VTEC Turbo DOHC 4 xi-lanh',
        source: 'Honda Việt Nam',
      },
      {
        group: 'ENGINE',
        label: 'Công suất / Mô-men xoắn',
        value: '188 hp @ 6.000 rpm · 240 Nm @ 1.700–5.000 rpm',
        source: 'Honda Việt Nam',
      },
      { group: 'ENGINE', label: 'Hộp số', value: 'Vô cấp CVT', source: 'Honda Việt Nam' },
      {
        group: 'DIMENSIONS',
        label: 'Kích thước (D × R × C)',
        value: '4.691 × 1.866 × 1.681 mm',
        source: 'Honda Việt Nam',
      },
      {
        group: 'DIMENSIONS',
        label: 'Chiều dài cơ sở / Khoảng sáng gầm',
        value: '2.701 mm · 198 mm',
        source: 'Honda Việt Nam',
      },
      {
        group: 'DIMENSIONS',
        label: 'Số chỗ ngồi',
        value: '7 chỗ (5+2) hoặc 5 chỗ (bản e:HEV RS)',
        source: 'Honda Việt Nam',
      },
    ],
    variants: [
      {
        name: '1.5L L (FWD)',
        year: 2024,
        listedPrice: 1_099_000_000,
        referenceRentPrice: 1_300_000,
        fuelType: 'Xăng',
        transmission: 'Vô cấp CVT',
        driveType: 'Cầu trước (FWD)',
        seats: 7,
        summary: '7 chỗ, màn hình 9 inch, 8 túi khí, Honda SENSING, cốp điện đá chân.',
        colors: [
          { name: 'Trắng ngọc', hex: '#f4f5f7', mediaKey: 'honda-crv-ext-1' },
          { name: 'Xám', hex: '#5f666d', mediaKey: 'honda-crv-ext-2' },
        ],
      },
    ],
    source: 'https://www.honda.com.vn/o-to',
    featured: false,
    sortOrder: 14,
  },

  // =========================================================================
  // 15. HYUNDAI ACCENT
  // =========================================================================
  {
    name: 'Hyundai Accent',
    slug: 'hyundai-accent',
    brand: 'Hyundai',
    category: 'CAR',
    subCategory: 'SEDAN',
    bodyStyle: 'Sedan hạng B',
    segment: 'Sedan đô thị 5 chỗ',
    origin: 'Việt Nam (Hyundai Thành Công)',
    modelYear: 2024,
    seats: 5,
    fuelType: 'Xăng',
    transmission: 'Tự động vô cấp IVT / 6MT',
    driveType: 'Cầu trước (FWD)',
    listedPrice: 439_000_000,
    referenceRentPrice: 680_000,
    suitableFor:
      'Người thuê xe tự lái đi làm, cặp đôi hoặc gia đình nhỏ cần xe gọn gàng nhiều tiện nghi',
    description:
      'Hyundai Accent là mẫu sedan hạng B trang bị dồi dào tiện nghi trong tầm giá như làm mát hàng ghế trước (thế hệ mới 2024), đề nổ từ xa qua chìa khóa, cửa gió điều hòa sau và vận hành nhẹ nhàng tiết kiệm.',
    exteriorOverview:
      'Thân xe thanh thoát cân đối với lưới tản nhiệt đặc trưng Hyundai và cụm đèn LED sắc nét.',
    interiorOverview:
      'Khoang lái thực dụng hiện đại, màn hình giải trí cảm ứng 8 inch kết nối Apple CarPlay/Android Auto, cửa gió hàng ghế sau và cổng sạc USB.',
    engineOverview:
      'Động cơ xăng Smartstream G 1.5L (hoặc 1.4L ở đời 2022–2023) cho khả năng tăng tốc êm ái trong đô thị và tiết kiệm nhiên liệu trên cao tốc.',
    highlights: [
      'Khởi động từ xa bằng chìa khóa tiện lợi khi đỗ ngoài nắng',
      'Cửa gió điều hòa riêng cho hàng ghế sau',
      'Cân bằng điện tử ESC & Hỗ trợ khởi hành ngang dốc HAC',
    ],
    features: [
      { name: 'Khởi động từ xa bằng chìa khóa thông minh', category: 'COMFORT' },
      { name: 'Màn hình giải trí 8 inch Apple CarPlay / Android Auto', category: 'TECHNOLOGY' },
      { name: 'Cửa gió điều hòa hàng ghế sau', category: 'COMFORT' },
      { name: '6 túi khí & Camera lùi', category: 'SAFETY', variantNote: 'Bản Đặc biệt / Cao cấp' },
    ],
    coverKey: 'hyundai-accent-ext-1',
    gallery: [
      {
        mediaKey: 'hyundai-accent-ext-1',
        kind: 'EXTERIOR',
        caption: 'Hyundai Accent góc chéo trước (Wikimedia Commons)',
      },
      {
        mediaKey: 'hyundai-accent-ext-2',
        kind: 'EXTERIOR',
        caption: 'Hyundai Accent góc nhìn thân xe (Wikimedia Commons)',
      },
      {
        mediaKey: 'hyundai-accent-int-1',
        kind: 'INTERIOR',
        caption: 'Khoang lái và màn hình giải trí trung tâm (Wikimedia Commons)',
      },
    ],
    specifications: [
      {
        group: 'ENGINE',
        label: 'Động cơ',
        value: 'Smartstream G 1.5L MPI 4 xi-lanh',
        source: 'Hyundai Thành Công',
      },
      {
        group: 'ENGINE',
        label: 'Công suất / Mô-men xoắn',
        value: '115 PS @ 6.300 rpm · 144 Nm @ 4.500 rpm',
        source: 'Hyundai Thành Công',
      },
      {
        group: 'ENGINE',
        label: 'Hộp số',
        value: 'IVT vô cấp giả lập / Số sàn 6 cấp',
        source: 'Hyundai Thành Công',
      },
      {
        group: 'DIMENSIONS',
        label: 'Kích thước (D × R × C)',
        value: '4.535 × 1.765 × 1.485 mm',
        source: 'Hyundai Thành Công',
      },
      {
        group: 'DIMENSIONS',
        label: 'Chiều dài cơ sở / Khoảng sáng gầm',
        value: '2.670 mm · 165 mm',
        source: 'Hyundai Thành Công',
      },
    ],
    variants: [
      {
        name: '1.5 AT Đặc biệt',
        year: 2024,
        listedPrice: 529_000_000,
        referenceRentPrice: 680_000,
        fuelType: 'Xăng',
        transmission: 'Tự động IVT',
        driveType: 'Cầu trước (FWD)',
        seats: 5,
        summary: 'Điều hòa tự động, làm mát ghế trước, sạc không dây, 6 túi khí.',
        colors: [
          { name: 'Xám titan', hex: '#63686e', mediaKey: 'hyundai-accent-ext-1' },
          { name: 'Trắng', hex: '#f4f4f2' },
        ],
      },
    ],
    source: 'https://hyundai.thanhcong.vn/',
    featured: false,
    sortOrder: 15,
  },

  // =========================================================================
  // 16. VINFAST VF 8
  // =========================================================================
  {
    name: 'VinFast VF 8',
    slug: 'vinfast-vf-8',
    brand: 'VinFast',
    category: 'CAR',
    subCategory: 'ELECTRIC_CAR',
    bodyStyle: 'SUV điện 5 chỗ',
    segment: 'SUV thuần điện cỡ D',
    origin: 'Việt Nam (VinFast)',
    modelYear: 2024,
    seats: 5,
    fuelType: 'Điện (EV)',
    transmission: '1 cấp (Xe điện)',
    driveType: '2 cầu toàn thời gian (AWD)',
    listedPrice: 1_019_000_000,
    referenceRentPrice: 1_450_000,
    suitableFor:
      'Người yêu công nghệ, trải nghiệm vận hành êm ái không khí thải và mạng lưới trạm sạc phủ rộng',
    description:
      'VinFast VF 8 là mẫu SUV thuần điện cỡ D thiết kế bởi Pininfarina, trang bị hai mô-tơ điện dẫn động 4 bánh toàn thời gian mạnh mẽ tới 402 mã lực (bản Plus), tầm hoạt động công bố 457–471 km WLTP và hỗ trợ sạc nhanh 10–70% trong khoảng 31 phút.',
    exteriorOverview:
      'Ngoại thất tối giản khí động học với dải đèn LED chữ V đặc trưng trước/sau, tay nắm cửa truyền thống và bộ mâm hợp kim 19–20 inch.',
    interiorOverview:
      'Khoang nội thất tối giản loại bỏ cụm đồng hồ sau vô lăng, thay bằng màn hình cảm ứng trung tâm 15,6 inch kết hợp màn hình HUD hắt kính lái, sưởi/làm mát ghế và điều hòa lọc không khí HEPA.',
    engineOverview:
      'Hai mô-tơ điện đặt trục trước/sau với hệ dẫn động AWD cho mô-men xoắn tức thì 500–620 Nm, kết hợp bộ pin 87,7 kWh bảo hành chính hãng 10 năm.',
    highlights: [
      'Sức mạnh 349–402 mã lực, dẫn động 2 cầu AWD tăng tốc tức thì',
      'Pin 87,7 kWh di chuyển công bố ~471 km (WLTP, bản Eco)',
      'Hỗ trợ sạc nhanh DC 10–70% trong khoảng 31 phút chuẩn CCS2',
      'Miễn 100% lệ phí trước bạ đối với ô tô điện đăng ký mới theo chính sách hiện hành',
    ],
    features: [
      { name: 'Màn hình trung tâm 15,6 inch & Màn hình HUD kính lái', category: 'TECHNOLOGY' },
      {
        name: 'Trợ lý ảo giọng nói tiếng Việt & ADAS hỗ trợ lái trên cao tốc',
        category: 'DRIVER_ASSIST',
      },
      { name: '11 túi khí bảo vệ toàn diện', category: 'SAFETY' },
      {
        name: 'Sưởi và thông gió hàng ghế trước (bản Plus)',
        category: 'COMFORT',
        variantNote: 'VF 8 Plus',
      },
    ],
    coverKey: 'vinfast-vf8-ext-1',
    gallery: [
      {
        mediaKey: 'vinfast-vf8-ext-1',
        kind: 'EXTERIOR',
        caption: 'VinFast VF 8 ngoại thất góc chéo trước (Wikimedia Commons)',
      },
      {
        mediaKey: 'vinfast-vf8-ext-2',
        kind: 'EXTERIOR',
        caption: 'Dải đèn định vị LED chữ V đặc trưng (Wikimedia Commons)',
      },
      {
        mediaKey: 'vinfast-vf8-ext-3',
        kind: 'EXTERIOR',
        caption: 'Thiết kế đuôi xe SUV điện cỡ D (Wikimedia Commons)',
      },
      {
        mediaKey: 'vinfast-vf8-int-1',
        kind: 'INTERIOR',
        caption: 'Khoang lái màn hình trung tâm 15,6 inch (Wikimedia Commons)',
      },
    ],
    specifications: [
      {
        group: 'EV',
        label: 'Hệ truyền động',
        value: '2 mô-tơ điện, dẫn động 2 cầu toàn thời gian (AWD)',
        source: 'VinFast',
      },
      {
        group: 'EV',
        label: 'Công suất cực đại',
        value: '260 kW / 349 hp (Eco) · 300 kW / 402 hp (Plus)',
        source: 'VinFast',
      },
      {
        group: 'EV',
        label: 'Mô-men xoắn cực đại',
        value: '500 Nm (Eco) · 620 Nm (Plus)',
        source: 'VinFast',
      },
      { group: 'EV', label: 'Dung lượng pin khả dụng', value: '87,7 kWh', source: 'VinFast' },
      {
        group: 'EV',
        label: 'Quãng đường công bố (WLTP)',
        value: '471 km (Eco) · 457 km (Plus)',
        source: 'VinFast',
      },
      {
        group: 'EV',
        label: 'Sạc nhanh DC & Chuẩn cổng',
        value: '10–70% ~31 phút · Chuẩn CCS2',
        source: 'VinFast',
      },
      {
        group: 'EV',
        label: 'Bảo hành xe & pin',
        value: '10 năm hoặc 200.000 km (xe) · 10 năm không giới hạn km (pin)',
        source: 'VinFast',
      },
      {
        group: 'DIMENSIONS',
        label: 'Kích thước (D × R × C)',
        value: '4.750 × 1.934 × 1.667 mm · Cơ sở 2.950 mm',
        source: 'VinFast',
      },
    ],
    variants: [
      {
        name: 'VF 8S / Eco (Kèm pin)',
        year: 2024,
        listedPrice: 1_199_000_000,
        referenceRentPrice: 1_450_000,
        fuelType: 'Điện (EV)',
        transmission: '1 cấp (Xe điện)',
        driveType: 'AWD',
        seats: 5,
        summary: '349 hp, quãng đường 471 km WLTP, ADAS và 11 túi khí.',
        colors: [
          { name: 'Trắng Brahminy White', hex: '#f4f5f7', mediaKey: 'vinfast-vf8-ext-1' },
          { name: 'Xanh VinFast Blue', hex: '#144c8a', mediaKey: 'vinfast-vf8-ext-2' },
        ],
      },
      {
        name: 'VF 8 Plus (Kèm pin)',
        year: 2024,
        listedPrice: 1_389_000_000,
        referenceRentPrice: 1_650_000,
        fuelType: 'Điện (EV)',
        transmission: '1 cấp (Xe điện)',
        driveType: 'AWD',
        seats: 5,
        summary: '402 hp, 620 Nm, cửa sổ trời toàn cảnh, sưởi/làm mát ghế và cốp điện.',
        colors: [{ name: 'Đỏ Crimson Red', hex: '#8c1722' }],
      },
    ],
    source: 'https://vinfastauto.com/vn_vi',
    featured: false,
    sortOrder: 16,
  },

  // =========================================================================
  // 17. MERCEDES-BENZ C 300 AMG (W206)
  // =========================================================================
  {
    name: 'Mercedes-Benz C 300 AMG',
    slug: 'mercedes-benz-c300-amg',
    brand: 'Mercedes-Benz',
    category: 'CAR',
    subCategory: 'SEDAN',
    bodyStyle: 'Sedan hạng sang',
    segment: 'Sedan hạng sang cỡ nhỏ (W206)',
    origin: 'Việt Nam / Đức',
    modelYear: 2024,
    seats: 5,
    fuelType: 'Hybrid',
    transmission: 'Tự động 9G-TRONIC',
    driveType: 'Cầu sau (RWD)',
    listedPrice: 2_099_000_000,
    referenceRentPrice: 2_800_000,
    suitableFor:
      'Đón tiếp VIP, xe cưới sang trọng, công tác cao cấp và trải nghiệm công nghệ xe sang Đức',
    description:
      'Mercedes-Benz C 300 AMG thế hệ W206 được ví như “tiểu S-Class” nhờ khoang lái màn hình dọc 11,9 inch MBUX thế hệ 2, đèn pha DIGITAL LIGHT siêu sắc nét và động cơ 2.0L kết hợp hệ thống Mild-Hybrid 48V EQ Boost.',
    exteriorOverview:
      'Gói ngoại thất AMG Line thể thao với lưới tản nhiệt họa tiết ngôi sao ba cánh, mâm AMG 18 inch 5 chấu kép và đèn pha DIGITAL LIGHT.',
    interiorOverview:
      'Khoang lái ngập tràn công nghệ với bảng đồng hồ 12,3 inch, màn hình trung tâm 11,9 inch hướng về người lái, đèn viền 64 màu, cửa sổ trời Panorama và dàn âm thanh 15 loa Burmester 3D.',
    engineOverview:
      'Động cơ I4 2.0L tăng áp tích hợp máy phát điện 48V EQ Boost cho tổng công suất 258 hp (+20 hp bổ trợ) và 400 Nm, tăng tốc 0–100 km/h trong 6,0 giây.',
    highlights: [
      'Công nghệ chiếu sáng thông minh DIGITAL LIGHT 2,6 triệu điểm ảnh',
      'Hệ thống âm thanh vòm 15 loa Burmester 3D công suất 710 W',
      'Động cơ Mild-Hybrid 48V EQ Boost tăng tốc 0–100 km/h trong 6,0 giây',
    ],
    features: [
      { name: 'Hệ thống đèn pha DIGITAL LIGHT thông minh', category: 'SAFETY' },
      { name: 'MBUX 11,9 inch & Cụm đồng hồ 12,3 inch', category: 'TECHNOLOGY' },
      { name: 'Âm thanh vòm 15 loa Burmester 3D', category: 'COMFORT' },
      { name: 'Cửa sổ trời Panorama & Camera 360 độ', category: 'DRIVER_ASSIST' },
    ],
    coverKey: 'mercedes-c300-ext-1',
    gallery: [
      {
        mediaKey: 'mercedes-c300-ext-1',
        kind: 'EXTERIOR',
        caption: 'Mercedes-Benz C 300 W206 góc chéo trước (Wikimedia Commons)',
      },
      {
        mediaKey: 'mercedes-c300-ext-2',
        kind: 'EXTERIOR',
        caption: 'Mercedes-Benz C-Class W206 phong cách AMG (Wikimedia Commons)',
      },
      {
        mediaKey: 'mercedes-c300-int-1',
        kind: 'INTERIOR',
        caption: 'Khoang lái W206 với màn hình dọc MBUX (Wikimedia Commons)',
      },
    ],
    specifications: [
      {
        group: 'ENGINE',
        label: 'Động cơ',
        value: 'I4 2.0L Tăng áp + Mild-Hybrid 48V EQ Boost',
        source: 'Mercedes-Benz VN',
      },
      {
        group: 'ENGINE',
        label: 'Công suất / Mô-men xoắn',
        value: '258 hp (+20 hp EQ Boost) · 400 Nm',
        source: 'Mercedes-Benz VN',
      },
      {
        group: 'ENGINE',
        label: 'Hộp số & Dẫn động',
        value: '9G-TRONIC 9 cấp · Cầu sau (RWD)',
        source: 'Mercedes-Benz VN',
      },
      {
        group: 'ENGINE',
        label: 'Tăng tốc 0–100 km/h',
        value: '6,0 giây',
        source: 'Mercedes-Benz VN',
      },
      {
        group: 'DIMENSIONS',
        label: 'Kích thước (D × R × C)',
        value: '4.751 × 1.820 × 1.437 mm',
        source: 'Mercedes-Benz VN',
      },
      {
        group: 'DIMENSIONS',
        label: 'Chiều dài cơ sở',
        value: '2.865 mm',
        source: 'Mercedes-Benz VN',
      },
    ],
    variants: [
      {
        name: 'C 300 AMG First Edition / CKD (W206)',
        year: 2024,
        listedPrice: 2_099_000_000,
        referenceRentPrice: 2_800_000,
        fuelType: 'Hybrid',
        transmission: '9G-TRONIC 9 cấp',
        driveType: 'Cầu sau (RWD)',
        seats: 5,
        summary: 'DIGITAL LIGHT, 15 loa Burmester 3D, MBUX 11,9 inch và gói AMG Line.',
        colors: [
          { name: 'Trắng Polar', hex: '#f4f4f6', mediaKey: 'mercedes-c300-ext-1' },
          { name: 'Đen Obsidian', hex: '#141619', mediaKey: 'mercedes-c300-ext-2' },
        ],
      },
    ],
    source: 'https://www.mercedes-benz.com.vn/',
    featured: false,
    sortOrder: 17,
  },

  // =========================================================================
  // 18. FORD RANGER WILDTRAK
  // =========================================================================
  {
    name: 'Ford Ranger Wildtrak',
    slug: 'ford-ranger-wildtrak',
    brand: 'Ford',
    category: 'PICKUP',
    subCategory: 'PREMIUM_PICKUP',
    bodyStyle: 'Bán tải cao cấp cabin kép',
    segment: 'Bán tải cao cấp 4x4',
    origin: 'Việt Nam (Ford Việt Nam)',
    modelYear: 2024,
    seats: 5,
    fuelType: 'Dầu (Diesel)',
    transmission: 'Tự động 10 cấp',
    driveType: '2 cầu gài điện tử (4x4)',
    listedPrice: 979_000_000,
    referenceRentPrice: 1_300_000,
    suitableFor:
      'Kết hợp công việc di chuyển công trình và gia đình du lịch cuối tuần tiện nghi như SUV',
    description:
      'Ford Ranger Wildtrak thế hệ mới cân bằng xuất sắc giữa tính thực dụng của một chiếc bán tải chở hàng và sự tiện nghi công nghệ của SUV hiện đại với màn hình SYNC 4A 12 inch, phanh tay điện tử và hệ thống hỗ trợ lái nâng cao.',
    exteriorOverview:
      'Đèn pha LED Matrix hình chữ C đặc trưng, bậc bước chân tích hợp hông thùng sau tiện lợi và thanh thể thao thùng hàng khí động học.',
    interiorOverview:
      'Ghế da thêu logo Wildtrak chỉ vàng cam nổi bật, màn hình dọc 12 inch SYNC 4A, phanh tay điện tử và 6 túi khí.',
    engineOverview:
      'Động cơ Diesel 2.0L Bi-Turbo 210 PS / 500 Nm kết hợp hộp số tự động 10 cấp và gài cầu điện tử 2H/4H/4L.',
    highlights: [
      'Động cơ 2.0L Bi-Turbo 210 PS mạnh mẽ cùng hộp số 10 cấp',
      'Bậc lên xuống tích hợp phía sau bánh sau giúp lấy đồ trên thùng dễ dàng',
      'Màn hình dọc 12 inch SYNC 4A & Camera 360 độ',
    ],
    features: [
      { name: 'Màn hình cảm ứng dọc 12 inch SYNC 4A', category: 'TECHNOLOGY' },
      { name: 'Camera 360 độ & Cảm biến trước sau', category: 'SAFETY' },
      { name: 'Kiểm soát hành trình thích ứng & Giữ làn đường', category: 'DRIVER_ASSIST' },
      { name: 'Bậc bước hông thùng hàng & Ổ cắm điện thùng sau', category: 'COMFORT' },
    ],
    coverKey: 'ford-ranger-wildtrak-ext-1',
    gallery: [
      {
        mediaKey: 'ford-ranger-wildtrak-ext-1',
        kind: 'EXTERIOR',
        caption: 'Ford Ranger Wildtrak Next-Gen góc chéo trước (Wikimedia Commons)',
      },
      {
        mediaKey: 'ford-ranger-wildtrak-ext-2',
        kind: 'EXTERIOR',
        caption: 'Góc nhìn thùng hàng và thanh thể thao Wildtrak (Wikimedia Commons)',
      },
    ],
    specifications: [
      {
        group: 'ENGINE',
        label: 'Động cơ',
        value: '2.0L Bi-Turbo Diesel I4',
        source: 'Ford Việt Nam',
      },
      {
        group: 'ENGINE',
        label: 'Công suất / Mô-men xoắn',
        value: '210 PS @ 3.750 rpm · 500 Nm @ 1.750–2.000 rpm',
        source: 'Ford Việt Nam',
      },
      {
        group: 'ENGINE',
        label: 'Hộp số & Dẫn động',
        value: 'Tự động 10 cấp · 2 cầu bán thời gian 4x4',
        source: 'Ford Việt Nam',
      },
      {
        group: 'DIMENSIONS',
        label: 'Kích thước (D × R × C)',
        value: '5.362 × 1.918 × 1.875 mm',
        source: 'Ford Việt Nam',
      },
      {
        group: 'DIMENSIONS',
        label: 'Chiều dài cơ sở / Khoảng sáng gầm',
        value: '3.270 mm · 235 mm',
        source: 'Ford Việt Nam',
      },
      {
        group: 'PICKUP',
        label: 'Tải trọng cho phép & Lội nước',
        value: '~660 kg · Lội nước 800 mm',
        source: 'Ford Việt Nam',
      },
    ],
    variants: [
      {
        name: 'Wildtrak 2.0L Bi-Turbo 4x4 AT',
        year: 2024,
        listedPrice: 979_000_000,
        referenceRentPrice: 1_300_000,
        fuelType: 'Dầu (Diesel)',
        transmission: 'Tự động 10 cấp',
        driveType: '2 cầu (4x4)',
        seats: 5,
        summary: 'Động cơ Bi-Turbo 210 PS, hộp số 10AT, đèn Matrix LED và Camera 360.',
        colors: [
          { name: 'Vàng Luxe Yellow', hex: '#d89b1c', mediaKey: 'ford-ranger-wildtrak-ext-1' },
          { name: 'Trắng', hex: '#f4f4f2' },
        ],
      },
    ],
    source: 'https://www.ford.com.vn/',
    featured: false,
    sortOrder: 18,
  },

  // =========================================================================
  // 19. TOYOTA HILUX
  // =========================================================================
  {
    name: 'Toyota Hilux',
    slug: 'toyota-hilux',
    brand: 'Toyota',
    category: 'PICKUP',
    subCategory: 'WORK_PICKUP',
    bodyStyle: 'Bán tải cabin kép',
    segment: 'Bán tải bền bỉ phục vụ công việc',
    origin: 'Thái Lan (Toyota Việt Nam)',
    modelYear: 2024,
    seats: 5,
    fuelType: 'Dầu (Diesel)',
    transmission: 'Tự động 6 cấp / Số sàn 6 cấp',
    driveType: '4x2 / 4x4',
    listedPrice: 668_000_000,
    referenceRentPrice: 1_050_000,
    suitableFor:
      'Chở hàng công trình, đi tỉnh xa, khảo sát địa hình cần độ tin cậy và tiết kiệm chi phí',
    description:
      'Toyota Hilux nổi tiếng toàn cầu về độ bền cơ khí, khung gầm cứng cáp chịu tải cao (~785 kg tùy phiên bản), khoảng sáng gầm 286 mm ấn tượng và gói Toyota Safety Sense trên bản cao cấp 2.8L 4x4 Adventure.',
    exteriorOverview:
      'Thiết kế vuông vức mạnh mẽ với thùng chở hàng rộng rãi, cản trước chắc chắn và khoảng sáng gầm 286 mm.',
    interiorOverview:
      'Khoang cabin thực dụng với nhiều ngăn chứa đồ, màn hình cảm ứng 9 inch (trên các bản 2024 mới), điều hòa làm lạnh nhanh và 7 túi khí.',
    engineOverview:
      'Động cơ dầu 2GD-FTV 2.4L (148 hp / 400 Nm) bền bỉ tiết kiệm hoặc 1GD-FTV 2.8L (201 hp / 500 Nm) trên bản Adventure.',
    highlights: [
      'Độ bền cơ khí hàng đầu cùng chi phí bảo dưỡng tối ưu',
      'Khoảng sáng gầm 286 mm và thùng hàng dài 1.525 mm',
      'Hệ thống hỗ trợ đổ đèo DAC & Khóa vi sai cầu sau (bản 4x4)',
    ],
    features: [
      { name: '7 túi khí & Cân bằng điện tử VSC', category: 'SAFETY' },
      {
        name: 'Kiểm soát lực kéo chủ động A-TRC & Hỗ trợ đổ đèo DAC',
        category: 'DRIVER_ASSIST',
        variantNote: 'Bản 4x4',
      },
      { name: 'Màn hình cảm ứng 9 inch Apple CarPlay / Android Auto', category: 'TECHNOLOGY' },
    ],
    coverKey: 'toyota-hilux-ext-1',
    gallery: [
      {
        mediaKey: 'toyota-hilux-ext-1',
        kind: 'EXTERIOR',
        caption: 'Toyota Hilux góc chéo trước (Wikimedia Commons)',
      },
      {
        mediaKey: 'toyota-hilux-ext-2',
        kind: 'EXTERIOR',
        caption: 'Toyota Hilux phiên bản cabin kép (Wikimedia Commons)',
      },
      {
        mediaKey: 'toyota-hilux-int-1',
        kind: 'INTERIOR',
        caption: 'Khoang lái Toyota Hilux (Wikimedia Commons)',
      },
      {
        mediaKey: 'toyota-hilux-eng-1',
        kind: 'ENGINE',
        caption: 'Khoang động cơ Diesel Toyota Hilux (Wikimedia Commons)',
      },
    ],
    specifications: [
      {
        group: 'ENGINE',
        label: 'Động cơ',
        value: '2GD-FTV 2.4L (148 hp) / 1GD-FTV 2.8L (201 hp)',
        source: 'Toyota Việt Nam',
      },
      {
        group: 'ENGINE',
        label: 'Mô-men xoắn cực đại',
        value: '400 Nm (2.4L) / 500 Nm (2.8L)',
        source: 'Toyota Việt Nam',
      },
      {
        group: 'DIMENSIONS',
        label: 'Kích thước (D × R × C)',
        value: '5.325 × 1.855 × 1.815 mm',
        source: 'Toyota Việt Nam',
      },
      {
        group: 'DIMENSIONS',
        label: 'Chiều dài cơ sở / Khoảng sáng gầm',
        value: '3.085 mm · 286 mm',
        source: 'Toyota Việt Nam',
      },
      {
        group: 'PICKUP',
        label: 'Kích thước lòng thùng (D × R × C)',
        value: '1.525 × 1.540 × 480 mm',
        source: 'Toyota Việt Nam',
      },
      {
        group: 'PICKUP',
        label: 'Tải trọng chuyên chở tham khảo',
        value: '~785 kg (tùy phiên bản)',
        source: 'Toyota Việt Nam',
      },
    ],
    variants: [
      {
        name: '2.4L 4x2 AT',
        year: 2024,
        listedPrice: 706_000_000,
        referenceRentPrice: 1_050_000,
        fuelType: 'Dầu (Diesel)',
        transmission: 'Tự động 6 cấp',
        driveType: 'Cầu sau (4x2)',
        seats: 5,
        summary: 'Động cơ 2.4L tiết kiệm, màn hình 9 inch, camera lùi và 7 túi khí.',
        colors: [
          { name: 'Trắng ngọc trai', hex: '#f4f4f2', mediaKey: 'toyota-hilux-ext-2' },
          { name: 'Đỏ / Đen', hex: '#8f1b22', mediaKey: 'toyota-hilux-ext-1' },
        ],
      },
    ],
    source: 'https://www.toyota.com.vn/',
    featured: false,
    sortOrder: 19,
  },

  // =========================================================================
  // 20. MITSUBISHI TRITON ATHLETE
  // =========================================================================
  {
    name: 'Mitsubishi Triton Athlete',
    slug: 'mitsubishi-triton',
    brand: 'Mitsubishi',
    category: 'PICKUP',
    subCategory: 'STANDARD_PICKUP',
    bodyStyle: 'Bán tải phổ thông cabin kép',
    segment: 'Bán tải đa dụng cabin kép',
    origin: 'Thái Lan (Mitsubishi Motors VN)',
    modelYear: 2024,
    seats: 5,
    fuelType: 'Dầu (Diesel)',
    transmission: 'Tự động 6 cấp',
    driveType: 'Super Select 4WD-II / 4x2',
    listedPrice: 780_000_000,
    referenceRentPrice: 1_100_000,
    suitableFor:
      'Di chuyển linh hoạt trong phố nhờ bán kính quay vòng nhỏ và sẵn sàng dã ngoại cuối tuần',
    description:
      'Mitsubishi Triton Athlete ghi điểm nhờ thiết kế Dynamic Shield sắc nét, bán kính quay vòng tối thiểu nhỏ hàng đầu phân khúc (5,9–6,2 m) giúp xoay trở linh hoạt trong đô thị cùng hệ dẫn động Super Select 4WD-II danh tiếng.',
    exteriorOverview:
      'Phần đầu xe Dynamic Shield kết hợp bộ tem thể thao Athlete, ốp vòm bánh đen và thanh thể thao thùng sau.',
    interiorOverview:
      'Không gian hàng ghế sau có độ ngả lưng tốt nhất phân khúc (J-Line), màn hình giải trí trung tâm và nút xoay chọn chế độ gài cầu 4 chế độ.',
    engineOverview:
      'Động cơ Diesel MIVEC 2.4L bằng hợp kim nhôm nhẹ giúp giảm trọng lượng đầu xe, cho khả năng vào cua cân bằng.',
    highlights: [
      'Bán kính quay vòng nhỏ gọn hàng đầu phân khúc bán tải (~5,9 m)',
      'Hệ dẫn động Super Select 4WD-II cho phép chạy 2 cầu ngay trên đường nhựa tốc độ cao',
      'Hàng ghế sau thiết kế J-Line độ ngả lưng thoải mái cho hành trình dài',
    ],
    features: [
      {
        name: 'Hệ dẫn động 2 cầu Super Select 4WD-II & Khóa vi sai sau',
        category: 'DRIVER_ASSIST',
        variantNote: 'Bản 4x4',
      },
      {
        name: '7 túi khí & Cảnh báo điểm mù BSM',
        category: 'SAFETY',
        variantNote: 'Bản Athlete 4x4',
      },
      { name: 'Điều hòa tự động 2 vùng & Cửa gió trần hàng ghế sau', category: 'COMFORT' },
    ],
    coverKey: 'mitsubishi-triton-ext-1',
    gallery: [
      {
        mediaKey: 'mitsubishi-triton-ext-1',
        kind: 'EXTERIOR',
        caption: 'Mitsubishi Triton Athlete màu Trắng góc chéo trước (Wikimedia Commons)',
      },
      {
        mediaKey: 'mitsubishi-triton-ext-2',
        kind: 'EXTERIOR',
        caption: 'Góc nhìn phía sau và thùng chở hàng (Wikimedia Commons)',
      },
    ],
    specifications: [
      {
        group: 'ENGINE',
        label: 'Động cơ',
        value: '2.4L MIVEC Diesel (181 PS / 430 Nm — thế hệ mới 204 PS)',
        source: 'Mitsubishi Motors VN',
      },
      {
        group: 'ENGINE',
        label: 'Hộp số & Dẫn động',
        value: 'Tự động 6 cấp · Super Select 4WD-II / 4x2',
        source: 'Mitsubishi Motors VN',
      },
      {
        group: 'DIMENSIONS',
        label: 'Bán kính quay vòng tối thiểu',
        value: '5,9–6,2 m',
        source: 'Mitsubishi Motors VN',
      },
      {
        group: 'DIMENSIONS',
        label: 'Khoảng sáng gầm xe',
        value: '220–228 mm',
        source: 'Mitsubishi Motors VN',
      },
      {
        group: 'PICKUP',
        label: 'Tải trọng chuyên chở tham khảo',
        value: '~740 kg (tùy phiên bản)',
        source: 'Mitsubishi Motors VN',
      },
    ],
    variants: [
      {
        name: 'Athlete 4x2 AT',
        year: 2024,
        listedPrice: 780_000_000,
        referenceRentPrice: 1_100_000,
        fuelType: 'Dầu (Diesel)',
        transmission: 'Tự động 6 cấp',
        driveType: 'Cầu sau (4x2)',
        seats: 5,
        summary: 'Ngoại thất Athlete thể thao, điều hòa 2 vùng, ghế da hai tông màu.',
        colors: [
          { name: 'Trắng Diamond', hex: '#f4f4f6', mediaKey: 'mitsubishi-triton-ext-1' },
          { name: 'Cam Đen', hex: '#d85b22' },
        ],
      },
    ],
    source: 'https://www.mitsubishi-motors.com.vn/',
    featured: false,
    sortOrder: 20,
  },

  // =========================================================================
  // 21. VINFAST EVO MAX
  // =========================================================================
  {
    name: 'VinFast Evo Max',
    officialName: 'VinFast Evo (Evo Max – Phiên bản đổi pin LFP)',
    modelLine: 'Evo',
    versionName: 'Tiêu chuẩn đổi pin',
    generation: 'Thế hệ đổi pin 2025',
    slug: 'vinfast-evo-max',
    brand: 'VinFast',
    category: 'MOTORBIKE',
    subCategory: 'ELECTRIC_BIKE',
    bodyStyle: 'Xe máy điện đô thị',
    segment: 'Xe máy điện đô thị đổi pin LFP',
    origin: 'Việt Nam (VinFast)',
    modelYear: 2025,
    seats: 2,
    fuelType: 'Điện (EV)',
    transmission: 'Truyền động trực tiếp (BLDC Inhub)',
    driveType: 'Mô-tơ bánh sau (Inhub)',
    listedPrice: 19_990_000,
    referenceRentPrice: 60_000,
    defaultDepositSuggestion: 2_000_000,
    usagePurpose: 'Di chuyển đô thị hằng ngày, đi học, đi làm tiết kiệm chi phí vận hành',
    shortDescription:
      'Mẫu xe máy điện đô thị VinFast Evo thế hệ hỗ trợ đổi pin LFP linh hoạt, động cơ BLDC Inhub êm ái và chuẩn kháng nước IP67.',
    suitableFor:
      'Khách hàng di chuyển nội đô, sinh viên, nhân viên văn phòng ưu tiên phương tiện không phát thải, vận hành êm ái.',
    description:
      'VinFast Evo Max (tên thương mại dòng VinFast Evo thế hệ hỗ trợ đổi pin nhanh) mang phong cách thanh lịch kiểu châu Âu, hướng đến nhu cầu đi lại linh hoạt trong đô thị. Xe trang bị động cơ điện BLDC Inhub đặt tại bánh sau, hỗ trợ cấu hình 1 hoặc 2 pin LFP tháo rời giúp chủ động sạc tại nhà hoặc đổi pin nhanh tại trạm.',
    exteriorOverview:
      'Thiết kế bo tròn thanh lịch với cụm đèn chiếu sáng Full LED, đèn pha tròn đặc trưng, sàn để chân phẳng rộng rãi và đạt chuẩn kháng nước IP67.',
    interiorOverview:
      'Cụm đồng hồ kỹ thuật số hiển thị trực quan vận tốc, mức pin và chế độ lái; hộc chứa đồ dưới yên linh hoạt theo cấu hình lắp 1 hoặc 2 pin LFP.',
    engineOverview:
      'Động cơ điện một chiều không chổi than (BLDC Inhub) công suất danh định 1.500 W (công suất tối đa khoảng 2.450 W), tốc độ tối đa công bố khoảng 70 km/h.',
    highlights: [
      'Hỗ trợ pin LFP tháo rời linh hoạt (lắp 1 hoặc tối đa 2 pin)',
      'Động cơ BLDC Inhub danh định 1.500 W, vận tốc tối đa ~70 km/h',
      'Tiêu chuẩn kháng nước IP67 phù hợp điều kiện đường phố đô thị',
      'Hệ thống chiếu sáng Full LED kết hợp phanh đĩa trước an toàn',
    ],
    features: [
      { name: 'Hệ thống chiếu sáng và đèn định vị Full LED', category: 'TECHNOLOGY' },
      {
        name: 'Pin LFP an toàn, hỗ trợ tháo rời sạc hoặc đổi pin tại trạm',
        category: 'TECHNOLOGY',
      },
      { name: 'Tiêu chuẩn chống nước IP67 cho động cơ và hệ thống pin', category: 'SAFETY' },
      { name: 'Phanh đĩa bánh trước kết hợp lốp không săm', category: 'SAFETY' },
      { name: 'Hai chế độ vận hành Eco / Sport trên tay lái', category: 'DRIVER_ASSIST' },
    ],
    coverKey: 'vinfast-evo200-ext-1',
    gallery: [
      {
        mediaKey: 'vinfast-evo200-ext-1',
        kind: 'EXTERIOR',
        caption: 'Thiết kế dòng xe máy điện đô thị VinFast Evo (Wikimedia Commons)',
      },
    ],
    specifications: [
      {
        group: 'EV',
        label: 'Loại mô-tơ điện',
        value: 'BLDC Inhub đặt tại bánh sau',
        source: 'VinFast công bố',
      },
      {
        group: 'EV',
        label: 'Công suất danh định / tối đa',
        value: '1.500 W / ~2.450 W',
        source: 'VinFast công bố',
      },
      {
        group: 'EV',
        label: 'Công nghệ pin',
        value: 'Pin LFP tháo rời (hỗ trợ lắp tối đa 2 pin)',
        source: 'VinFast công bố',
      },
      {
        group: 'EV',
        label: 'Quãng đường di chuyển tham khảo',
        value: '~85 km (1 pin) · tối đa ~165 km (2 pin)',
        source: 'Tài liệu công bố dòng Evo đổi pin',
      },
      {
        group: 'EV',
        label: 'Thời gian sạc tiêu chuẩn tại nhà',
        value: 'Khoảng 4 giờ 30 phút (bộ sạc 400 W cho 1 pin)',
        source: 'Tài liệu công bố dòng Evo đổi pin',
      },
      {
        group: 'MOTORBIKE',
        label: 'Vận tốc tối đa',
        value: '~70 km/h',
        source: 'VinFast công bố',
      },
      {
        group: 'MOTORBIKE',
        label: 'Tiêu chuẩn kháng nước',
        value: 'IP67 (ngập sâu 0,5 m trong 30 phút)',
        source: 'VinFast công bố',
      },
      {
        group: 'DIMENSIONS',
        label: 'Kích thước Dài x Rộng x Cao',
        value: '1.856 x 683 x 1.133 mm',
        source: 'Tài liệu kỹ thuật dòng Evo đổi pin',
      },
      {
        group: 'DIMENSIONS',
        label: 'Chiều cao yên',
        value: '770 mm',
        source: 'Tài liệu kỹ thuật dòng Evo đổi pin',
      },
      {
        group: 'CHASSIS',
        label: 'Hệ thống phanh trước / sau',
        value: 'Phanh đĩa trước / Phanh cơ (tang trống) sau',
        source: 'VinFast công bố',
      },
    ],
    variants: [
      {
        name: 'Bản không kèm pin (Thuê pin)',
        year: 2025,
        listedPrice: 19_990_000,
        referenceRentPrice: 60_000,
        fuelType: 'Điện (EV)',
        transmission: 'Truyền động trực tiếp (BLDC Inhub)',
        driveType: 'Mô-tơ bánh sau (Inhub)',
        seats: 2,
        summary: 'Giá đề xuất chưa gồm pin, linh hoạt đăng ký gói thuê/đổi pin',
        colors: [
          { name: 'Vàng', hex: '#EAB308', mediaKey: 'vinfast-evo200-ext-1' },
          { name: 'Đen bóng', hex: '#18181B' },
        ],
      },
      {
        name: 'Bản kèm pin LFP',
        year: 2025,
        listedPrice: 25_600_000,
        referenceRentPrice: 60_000,
        fuelType: 'Điện (EV)',
        transmission: 'Truyền động trực tiếp (BLDC Inhub)',
        driveType: 'Mô-tơ bánh sau (Inhub)',
        seats: 2,
        summary: 'Giá đề xuất đã bao gồm VAT và 01 bộ pin LFP tiêu chuẩn',
        colors: [{ name: 'Vàng', hex: '#EAB308', mediaKey: 'vinfast-evo200-ext-1' }],
      },
    ],
    source: 'https://vinfastauto.com/vn_vi',
    featured: true,
    sortOrder: 0,
  },
]

function buildVehicle(
  spec: Omit<SeedDemoVehicle, 'estimatedRollingPrice' | 'photoKeys'> & {
    photoKeys?: SeedDemoVehicle['photoKeys']
  },
): SeedDemoVehicle {
  return {
    ...spec,
    photoKeys: spec.photoKeys ?? [],
  }
}

export const SEED_DEMO_FLEET: SeedDemoVehicle[] = [
  buildVehicle({
    modelSlug: 'toyota-fortuner',
    reference: 'NR-OT-FTN01',
    licensePlate: '51K-90124',
    intent: 'BOTH',
    vehicleConditionType: 'USED',
    manufactureYear: 2023,
    version: '2.4 AT 4x2',
    color: 'Trắng ngọc trai',
    odometer: 28_400,
    pricePerDay: 1_350_000,
    pricePerHour: 220_000,
    pricePerWeek: 8_500_000,
    pricePerMonth: 29_500_000,
    weekendSurcharge: 150_000,
    holidaySurcharge: 300_000,
    depositAmount: 15_000_000,
    deliveryFee: 150_000,
    kmLimitPerDay: 300,
    overKmFee: 5_000,
    lateReturnFeePerHour: 150_000,
    salePrice: 985_000_000,
    listedPrice: 1_055_000_000,
    discountPrice: 970_000_000,
    reservationDeposit: 20_000_000,
    negotiable: true,
    warrantyPolicy: 'Bảo hành hộp số & động cơ 12 tháng / 20.000 km tại NORI (DEMO)',
    condition: 'Xe gia đình giữ kỹ, gầm bệ nguyên bản, lốp còn 80%, điều hòa 3 hàng ghế mát sâu.',
    exteriorCondition: 'Sơn zin 95%, không cấn đụng, đèn LED trong suốt.',
    interiorCondition: 'Ghế da sạch đẹp, vô lăng ít hao mòn, màn hình hoạt động ổn định.',
    engineCondition: 'Máy dầu 2GD-FTV nổ êm, không rò rỉ dầu, sang số mượt.',
    maintenanceHistory:
      'Bảo dưỡng định kỳ mỗi 5.000 km tại đại lý Toyota (mốc 25.000 km đã thay dầu, lọc nhớt, lọc gió).',
    inspectedAt: '2026-11-10',
    location: 'TP. Hồ Chí Minh',
    pickupLocation: 'Khu đô thị Sala, TP. Thủ Đức, TP.HCM',
    photoKeys: [
      {
        mediaKey: 'toyota-fortuner-ext-3',
        caption: 'Ảnh tham chiếu ngoại thất (DEMO)',
        kind: 'ACTUAL',
      },
      {
        mediaKey: 'toyota-fortuner-int-1',
        caption: 'Khoang lái (tham khảo phiên bản)',
        kind: 'INTERIOR',
      },
    ],
  }),
  buildVehicle({
    modelSlug: 'toyota-fortuner',
    reference: 'NR-OT-FTN02',
    licensePlate: '51K-90288',
    intent: 'RENT',
    vehicleConditionType: 'USED',
    manufactureYear: 2024,
    version: 'Legender 2.8 AT 4x4',
    color: 'Đen ánh kim',
    odometer: 19_200,
    pricePerDay: 1_650_000,
    pricePerHour: 260_000,
    pricePerWeek: 10_200_000,
    pricePerMonth: 35_000_000,
    weekendSurcharge: 200_000,
    holidaySurcharge: 350_000,
    depositAmount: 20_000_000,
    deliveryFee: 150_000,
    kmLimitPerDay: 300,
    overKmFee: 6_000,
    lateReturnFeePerHour: 180_000,
    salePrice: 1_240_000_000,
    listedPrice: 1_350_000_000,
    reservationDeposit: 30_000_000,
    negotiable: false,
    warrantyPolicy: 'Bảo hành chính hãng Toyota còn hiệu lực đến 2027 (DEMO)',
    condition: 'Bản Legender 2 cầu trang bị Camera 360, Toyota Safety Sense và 11 loa JBL.',
    exteriorCondition: 'Sơn đen ánh kim bóng đẹp, mâm 18 inch không trầy.',
    interiorCondition: 'Nội thất da 2 tông màu, cốp điện hoạt động mượt.',
    engineCondition: 'Động cơ 2.8L 201 hp khỏe khoắn, gài cầu 4x4 hoạt động tốt.',
    maintenanceHistory: 'Vừa kiểm tra định kỳ 20.000 km ngày 05/11/2026.',
    inspectedAt: '2026-11-08',
    location: 'TP. Hồ Chí Minh',
    pickupLocation: 'Khu đô thị Sala, TP. Thủ Đức, TP.HCM',
    photoKeys: [
      {
        mediaKey: 'toyota-fortuner-ext-1',
        caption: 'Ngoại thất phiên bản Legender (DEMO)',
        kind: 'ACTUAL',
      },
    ],
  }),
  buildVehicle({
    modelSlug: 'honda-pcx',
    reference: 'NR-XM-PCX01',
    licensePlate: '59T2-41890',
    intent: 'BOTH',
    vehicleConditionType: 'USED',
    manufactureYear: 2024,
    version: 'PCX 160 ABS',
    color: 'Xám đen mờ',
    odometer: 8_420,
    pricePerDay: 320_000,
    pricePerHour: 60_000,
    pricePerWeek: 1_950_000,
    pricePerMonth: 6_800_000,
    weekendSurcharge: 40_000,
    holidaySurcharge: 80_000,
    depositAmount: 3_000_000,
    deliveryFee: 50_000,
    kmLimitPerDay: 150,
    overKmFee: 2_000,
    lateReturnFeePerHour: 40_000,
    salePrice: 74_500_000,
    listedPrice: 89_000_000,
    reservationDeposit: 5_000_000,
    negotiable: true,
    warrantyPolicy: 'Bảo hành động cơ 6 tháng tại NORI (DEMO)',
    condition: 'Xe ga đường trường chạy êm, phanh ABS bánh trước chuẩn, 2 chìa Smart Key.',
    exteriorCondition: 'Nhựa nhám nguyên bản không trầy xước lớn.',
    interiorCondition: 'Yên xe dày êm, cốp 30 lít sạch sẽ.',
    engineCondition: 'Máy eSP+ 160 cc êm, không hú láp.',
    maintenanceHistory: 'Thay nhớt máy & nhớt láp ở mốc 8.000 km.',
    inspectedAt: '2026-11-11',
    location: 'TP. Hồ Chí Minh',
    pickupLocation: 'Khu đô thị Sala, TP. Thủ Đức, TP.HCM',
    photoKeys: [
      { mediaKey: 'honda-pcx-ext-3', caption: 'Honda PCX 160 Xám đen mờ (DEMO)', kind: 'ACTUAL' },
    ],
  }),
  buildVehicle({
    modelSlug: 'ford-ranger-raptor',
    reference: 'NR-BT-RPT01',
    licensePlate: '51D-77219',
    intent: 'BOTH',
    vehicleConditionType: 'USED',
    manufactureYear: 2024,
    version: '2.0L Bi-Turbo 4WD',
    color: 'Cam Code Orange',
    odometer: 16_500,
    pricePerDay: 1_850_000,
    pricePerHour: 300_000,
    pricePerWeek: 11_500_000,
    pricePerMonth: 39_000_000,
    weekendSurcharge: 250_000,
    holidaySurcharge: 400_000,
    depositAmount: 20_000_000,
    deliveryFee: 200_000,
    kmLimitPerDay: 300,
    overKmFee: 7_000,
    lateReturnFeePerHour: 200_000,
    salePrice: 1_195_000_000,
    listedPrice: 1_299_000_000,
    reservationDeposit: 30_000_000,
    negotiable: false,
    warrantyPolicy: 'Bảo hành chính hãng Ford Việt Nam 3 năm / 100.000 km (DEMO)',
    condition: 'Trang bị nắp thùng cuộn điện và lốp BFGoodrich nguyên bản gai dày.',
    exteriorCondition: 'Sơn cam rực rỡ, gầm phủ chống gỉ.',
    interiorCondition: 'Ghế da lộn thể thao sạch sẽ, màn hình SYNC 4A mượt mà.',
    engineCondition: 'Bi-Turbo và phuộc FOX Live Valve hoạt động hoàn hảo.',
    maintenanceHistory: 'Bảo dưỡng định kỳ tại Ford Bến Thành ở 15.000 km.',
    inspectedAt: '2026-11-12',
    location: 'TP. Hồ Chí Minh',
    pickupLocation: 'Khu đô thị Sala, TP. Thủ Đức, TP.HCM',
    photoKeys: [
      {
        mediaKey: 'ford-ranger-raptor-ext-1',
        caption: 'Ford Ranger Raptor góc trước (DEMO)',
        kind: 'ACTUAL',
      },
      {
        mediaKey: 'ford-ranger-raptor-int-1',
        caption: 'Khoang lái Raptor (tham khảo)',
        kind: 'INTERIOR',
      },
    ],
  }),
  buildVehicle({
    modelSlug: 'honda-wave-alpha',
    reference: 'NR-XM-WVA01',
    licensePlate: '59X3-20411',
    intent: 'BOTH',
    vehicleConditionType: 'USED',
    manufactureYear: 2024,
    version: 'Tiêu chuẩn 2025',
    color: 'Đỏ bạc',
    odometer: 12_150,
    pricePerDay: 130_000,
    pricePerHour: 30_000,
    pricePerWeek: 780_000,
    pricePerMonth: 2_400_000,
    weekendSurcharge: 20_000,
    holidaySurcharge: 30_000,
    depositAmount: 1_000_000,
    deliveryFee: 40_000,
    kmLimitPerDay: 150,
    overKmFee: 1_500,
    lateReturnFeePerHour: 25_000,
    salePrice: 15_800_000,
    listedPrice: 17_859_273,
    reservationDeposit: 1_000_000,
    negotiable: true,
    warrantyPolicy: 'Bảo hành động cơ 6 tháng tại NORI (DEMO)',
    condition: 'Xe số vận hành tiết kiệm xăng, phanh và nhông sên dĩa mới kiểm tra.',
    exteriorCondition: 'Tem zin nguyên bản, vỏ xe không nứt vỡ.',
    interiorCondition: 'Yên xe phẳng êm, mặt đồng hồ sáng rõ.',
    engineCondition: 'Máy 110cc nổ nhẹ, đề nhạy.',
    maintenanceHistory: 'Thay nhớt và tăng xích định kỳ mỗi 1.500 km.',
    inspectedAt: '2026-11-14',
    location: 'TP. Hồ Chí Minh',
    pickupLocation: 'Khu đô thị Sala, TP. Thủ Đức, TP.HCM',
  }),
  buildVehicle({
    modelSlug: 'honda-vision',
    reference: 'NR-XM-VIS01',
    licensePlate: '59H2-51208',
    intent: 'BOTH',
    vehicleConditionType: 'USED',
    manufactureYear: 2024,
    version: 'Cao cấp',
    color: 'Đỏ đen',
    odometer: 6_300,
    pricePerDay: 160_000,
    pricePerHour: 35_000,
    pricePerWeek: 980_000,
    pricePerMonth: 3_100_000,
    weekendSurcharge: 20_000,
    holidaySurcharge: 40_000,
    depositAmount: 1_500_000,
    deliveryFee: 40_000,
    kmLimitPerDay: 150,
    overKmFee: 1_500,
    lateReturnFeePerHour: 30_000,
    salePrice: 28_500_000,
    listedPrice: 32_782_909,
    reservationDeposit: 2_000_000,
    negotiable: true,
    warrantyPolicy: 'Bảo hành 6 tháng tại NORI (DEMO)',
    condition: 'Xe tay ga gọn nhẹ, Smart Key đầy đủ, Idling Stop hoạt động nhạy.',
    exteriorCondition: 'Sơn đỏ bóng đẹp, không trầy xước lớn.',
    interiorCondition: 'Sàn để chân sạch, cốp rộng.',
    engineCondition: 'Động cơ eSP 110cc êm mượt.',
    maintenanceHistory: 'Kiểm tra tại HEAD Honda ở mốc 6.000 km.',
    inspectedAt: '2026-11-12',
    location: 'TP. Hồ Chí Minh',
    pickupLocation: 'Khu đô thị Sala, TP. Thủ Đức, TP.HCM',
  }),
  buildVehicle({
    modelSlug: 'honda-sh160i',
    reference: 'NR-XM-SH160-01',
    licensePlate: '59S3-88120',
    intent: 'BOTH',
    vehicleConditionType: 'USED',
    manufactureYear: 2024,
    version: 'Cao cấp ABS',
    color: 'Trắng đen',
    odometer: 4_850,
    pricePerDay: 360_000,
    pricePerHour: 70_000,
    pricePerWeek: 2_200_000,
    pricePerMonth: 7_500_000,
    weekendSurcharge: 50_000,
    holidaySurcharge: 90_000,
    depositAmount: 4_000_000,
    deliveryFee: 50_000,
    kmLimitPerDay: 150,
    overKmFee: 2_500,
    lateReturnFeePerHour: 50_000,
    salePrice: 91_000_000,
    listedPrice: 100_490_000,
    reservationDeposit: 5_000_000,
    negotiable: true,
    warrantyPolicy: 'Bảo hành Honda chính hãng còn hiệu lực (DEMO)',
    condition: 'Bản ABS 2 kênh còn như mới, kèm 2 remote Smart Key zin.',
    exteriorCondition: 'Dàn áo trắng dán keo trong từ đầu, không vết xước.',
    interiorCondition: 'Cốp 28L sạch, cổng sạc USB hoạt động tốt.',
    engineCondition: 'Động cơ eSP+ 160cc mạnh mẽ, phanh ABS chuẩn.',
    maintenanceHistory: 'Bảo dưỡng HEAD mốc 4.000 km.',
    inspectedAt: '2026-11-10',
    location: 'TP. Hồ Chí Minh',
    pickupLocation: 'Khu đô thị Sala, TP. Thủ Đức, TP.HCM',
  }),
  buildVehicle({
    modelSlug: 'honda-sh350i',
    reference: 'NR-XM-SH350-01',
    licensePlate: '59A3-16809',
    intent: 'BOTH',
    vehicleConditionType: 'USED',
    manufactureYear: 2024,
    version: 'Thể thao ABS 2025',
    color: 'Xám đen',
    odometer: 3_200,
    pricePerDay: 550_000,
    pricePerHour: 100_000,
    pricePerWeek: 3_400_000,
    pricePerMonth: 11_500_000,
    weekendSurcharge: 80_000,
    holidaySurcharge: 150_000,
    depositAmount: 6_000_000,
    deliveryFee: 70_000,
    kmLimitPerDay: 200,
    overKmFee: 3_000,
    lateReturnFeePerHour: 70_000,
    salePrice: 138_000_000,
    listedPrice: 152_690_000,
    reservationDeposit: 10_000_000,
    negotiable: true,
    warrantyPolicy: 'Bảo hành Honda BigBike chính hãng (DEMO)',
    condition: 'SH350i màu Xám Thể thao, yêu cầu xuất trình GPLX A2/A khi nhận xe.',
    exteriorCondition: 'Ngoại thất như mới, lốp zin còn 90%.',
    interiorCondition: 'Yên da thể thao nguyên bản.',
    engineCondition: 'Máy 330cc tăng tốc rất bốc, HSTC hoạt động chuẩn.',
    maintenanceHistory: 'Thay nhớt tổng hợp ở 3.000 km.',
    inspectedAt: '2026-11-09',
    location: 'TP. Hồ Chí Minh',
    pickupLocation: 'Khu đô thị Sala, TP. Thủ Đức, TP.HCM',
  }),
  buildVehicle({
    modelSlug: 'yamaha-exciter-155-vva',
    reference: 'NR-XM-EXC01',
    licensePlate: '59T2-77412',
    intent: 'BOTH',
    vehicleConditionType: 'USED',
    manufactureYear: 2024,
    version: 'Cao cấp ABS',
    color: 'Xanh GP',
    odometer: 9_600,
    pricePerDay: 220_000,
    pricePerHour: 45_000,
    pricePerWeek: 1_350_000,
    pricePerMonth: 4_500_000,
    weekendSurcharge: 30_000,
    holidaySurcharge: 60_000,
    depositAmount: 2_500_000,
    deliveryFee: 50_000,
    kmLimitPerDay: 180,
    overKmFee: 2_000,
    lateReturnFeePerHour: 35_000,
    salePrice: 41_500_000,
    listedPrice: 54_000_000,
    reservationDeposit: 3_000_000,
    negotiable: true,
    warrantyPolicy: 'Bảo hành 6 tháng tại NORI (DEMO)',
    condition: 'Côn tay nhẹ nhờ bộ ly hợp chống trượt A&S, phanh ABS bánh trước.',
    exteriorCondition: 'Tem GP sạch đẹp, không té ngã.',
    interiorCondition: 'Mặt đồng hồ LCD rõ nét.',
    engineCondition: 'Động cơ 155 VVA bốc ở dải tua cao, côn số mượt.',
    maintenanceHistory: 'Bảo dưỡng Yamaha Town mốc 9.000 km.',
    inspectedAt: '2026-11-11',
    location: 'TP. Hồ Chí Minh',
    pickupLocation: 'Khu đô thị Sala, TP. Thủ Đức, TP.HCM',
  }),
  buildVehicle({
    modelSlug: 'vinfast-evo200',
    reference: 'NR-XM-EVO01',
    licensePlate: '59MD1-33409',
    intent: 'BOTH',
    vehicleConditionType: 'USED',
    manufactureYear: 2024,
    version: 'Evo200 (Kèm pin)',
    color: 'Vàng',
    odometer: 4_120,
    pricePerDay: 150_000,
    pricePerHour: 35_000,
    pricePerWeek: 920_000,
    pricePerMonth: 2_900_000,
    weekendSurcharge: 20_000,
    holidaySurcharge: 40_000,
    depositAmount: 1_500_000,
    deliveryFee: 40_000,
    kmLimitPerDay: 150,
    overKmFee: 1_500,
    lateReturnFeePerHour: 30_000,
    salePrice: 21_500_000,
    listedPrice: 25_900_000,
    reservationDeposit: 2_000_000,
    negotiable: false,
    warrantyPolicy: 'Pin LFP bảo hành chính hãng VinFast (DEMO)',
    condition: 'Kèm bộ sạc 400W theo xe, pin LFP đạt 99% SOH.',
    exteriorCondition: 'Màu vàng sáng bóng không trầy.',
    interiorCondition: 'Cốp 22L kèm sạc zin.',
    engineCondition: 'Mô-tơ Inhub êm tuyệt đối.',
    maintenanceHistory: 'Cập nhật phần mềm và kiểm tra pin tháng 11/2026.',
    inspectedAt: '2026-11-13',
    location: 'TP. Hồ Chí Minh',
    pickupLocation: 'Khu đô thị Sala, TP. Thủ Đức, TP.HCM',
  }),
  buildVehicle({
    modelSlug: 'kawasaki-z650',
    reference: 'NR-XM-Z650-01',
    licensePlate: '59A3-65089',
    intent: 'BOTH',
    vehicleConditionType: 'USED',
    manufactureYear: 2023,
    version: 'Z650 ABS 2024',
    color: 'Đen ánh kim',
    odometer: 7_450,
    pricePerDay: 950_000,
    pricePerHour: 180_000,
    pricePerWeek: 5_900_000,
    pricePerMonth: 19_500_000,
    weekendSurcharge: 150_000,
    holidaySurcharge: 250_000,
    depositAmount: 10_000_000,
    deliveryFee: 120_000,
    kmLimitPerDay: 250,
    overKmFee: 5_000,
    lateReturnFeePerHour: 120_000,
    salePrice: 158_000_000,
    listedPrice: 190_000_000,
    reservationDeposit: 10_000_000,
    negotiable: true,
    warrantyPolicy: 'Bảo hành động cơ 6 tháng tại NORI (DEMO)',
    condition: 'Lắp sẵn chống đổ khung và kính chắn gió nhỏ. Yêu cầu GPLX A2/A.',
    exteriorCondition: 'Sơn đen nhám/bóng kết hợp khung xanh nguyên bản.',
    interiorCondition: 'Màn hình màu TFT sắc nét.',
    engineCondition: 'Động cơ 649cc nổ đều, KTRC hoạt động chuẩn.',
    maintenanceHistory: 'Thay nhớt Motul 300V ở mốc 7.000 km.',
    inspectedAt: '2026-11-10',
    location: 'Hà Nội',
    pickupLocation: 'Quận Tây Hồ, Hà Nội (Điểm giao nhận DEMO)',
  }),
  buildVehicle({
    modelSlug: 'toyota-vios',
    reference: 'NR-OT-VIOS01',
    licensePlate: '51K-34518',
    intent: 'BOTH',
    vehicleConditionType: 'USED',
    manufactureYear: 2024,
    version: '1.5G CVT',
    color: 'Trắng ngọc trai',
    odometer: 22_300,
    pricePerDay: 700_000,
    pricePerHour: 120_000,
    pricePerWeek: 4_400_000,
    pricePerMonth: 15_500_000,
    weekendSurcharge: 100_000,
    holidaySurcharge: 150_000,
    depositAmount: 10_000_000,
    deliveryFee: 100_000,
    kmLimitPerDay: 300,
    overKmFee: 3_500,
    lateReturnFeePerHour: 100_000,
    salePrice: 465_000_000,
    listedPrice: 545_000_000,
    reservationDeposit: 15_000_000,
    negotiable: true,
    warrantyPolicy: 'Bảo hành Toyota chính hãng đến 2027 (DEMO)',
    condition: 'Bản G 7 túi khí, Toyota Safety Sense, cảm biến áp suất lốp.',
    exteriorCondition: 'Nước sơn trắng bóng đẹp, không móp méo.',
    interiorCondition: 'Ghế da sạch đẹp, sàn 5D.',
    engineCondition: 'Máy 1.5L Dual VVT-i siêu tiết kiệm xăng.',
    maintenanceHistory: 'Bảo dưỡng đầy đủ theo lịch 5.000 km.',
    inspectedAt: '2026-11-13',
    location: 'TP. Hồ Chí Minh',
    pickupLocation: 'Khu đô thị Sala, TP. Thủ Đức, TP.HCM',
  }),
  buildVehicle({
    modelSlug: 'mazda-cx-5',
    reference: 'NR-OT-CX5-01',
    licensePlate: '51K-61822',
    intent: 'BOTH',
    vehicleConditionType: 'USED',
    manufactureYear: 2024,
    version: '2.0L Premium Active',
    color: 'Đỏ Soul Red Crystal',
    odometer: 18_700,
    pricePerDay: 1_050_000,
    pricePerHour: 180_000,
    pricePerWeek: 6_600_000,
    pricePerMonth: 22_500_000,
    weekendSurcharge: 150_000,
    holidaySurcharge: 250_000,
    depositAmount: 15_000_000,
    deliveryFee: 120_000,
    kmLimitPerDay: 300,
    overKmFee: 4_500,
    lateReturnFeePerHour: 130_000,
    salePrice: 735_000_000,
    listedPrice: 829_000_000,
    reservationDeposit: 20_000_000,
    negotiable: true,
    warrantyPolicy: 'Bảo hành Mazda 3 năm / 100.000 km (DEMO)',
    condition: 'Bản Premium 10 loa Bose, HUD, cửa sổ trời, i-Activsense đầy đủ.',
    exteriorCondition: 'Đỏ Soul Red dán PPF mặt trước.',
    interiorCondition: 'Ghế da đen sang trọng, không mùi.',
    engineCondition: 'Động cơ Skyactiv-G 2.0L vận hành bốc và êm.',
    maintenanceHistory: 'Bảo dưỡng THACO Mazda ở mốc 15.000 km.',
    inspectedAt: '2026-11-11',
    location: 'TP. Hồ Chí Minh',
    pickupLocation: 'Khu đô thị Sala, TP. Thủ Đức, TP.HCM',
  }),
  buildVehicle({
    modelSlug: 'mitsubishi-xpander',
    reference: 'NR-OT-XPD01',
    licensePlate: '51K-49203',
    intent: 'BOTH',
    vehicleConditionType: 'USED',
    manufactureYear: 2024,
    version: 'AT Premium',
    color: 'Trắng',
    odometer: 24_900,
    pricePerDay: 850_000,
    pricePerHour: 150_000,
    pricePerWeek: 5_300_000,
    pricePerMonth: 18_500_000,
    weekendSurcharge: 120_000,
    holidaySurcharge: 200_000,
    depositAmount: 10_000_000,
    deliveryFee: 100_000,
    kmLimitPerDay: 300,
    overKmFee: 4_000,
    lateReturnFeePerHour: 110_000,
    salePrice: 575_000_000,
    listedPrice: 658_000_000,
    reservationDeposit: 15_000_000,
    negotiable: true,
    warrantyPolicy: 'Bảo hành Mitsubishi chính hãng đến 2027 (DEMO)',
    condition: 'Xe 7 chỗ gia đình, phanh tay điện tử, màn hình 9 inch.',
    exteriorCondition: 'Ngoại thất nguyên bản, gầm cao thoáng.',
    interiorCondition: '3 hàng ghế sạch đẹp, điều hòa 2 giàn lạnh mát nhanh.',
    engineCondition: 'Máy 1.5L MIVEC chạy mượt, tiết kiệm xăng.',
    maintenanceHistory: 'Bảo dưỡng mốc 20.000 km đầy đủ.',
    inspectedAt: '2026-11-12',
    location: 'Đà Nẵng',
    pickupLocation: 'Quận Hải Châu, Đà Nẵng (Điểm giao nhận DEMO)',
  }),
  buildVehicle({
    modelSlug: 'honda-cr-v',
    reference: 'NR-OT-CRV01',
    licensePlate: '51K-81024',
    intent: 'BOTH',
    vehicleConditionType: 'USED',
    manufactureYear: 2024,
    version: '1.5L L (FWD)',
    color: 'Trắng ngọc',
    odometer: 14_200,
    pricePerDay: 1_300_000,
    pricePerHour: 220_000,
    pricePerWeek: 8_200_000,
    pricePerMonth: 28_000_000,
    weekendSurcharge: 150_000,
    holidaySurcharge: 280_000,
    depositAmount: 15_000_000,
    deliveryFee: 150_000,
    kmLimitPerDay: 300,
    overKmFee: 5_000,
    lateReturnFeePerHour: 150_000,
    salePrice: 998_000_000,
    listedPrice: 1_099_000_000,
    reservationDeposit: 20_000_000,
    negotiable: false,
    warrantyPolicy: 'Bảo hành Honda Việt Nam 3 năm / 100.000 km (DEMO)',
    condition: 'CR-V thế hệ thứ 6 trang bị Honda SENSING, LaneWatch, 8 túi khí.',
    exteriorCondition: 'Sơn trắng mới 98%, đèn LED nguyên bản.',
    interiorCondition: 'Táp-lô lưới tổ ong đẹp mắt, sạch sẽ.',
    engineCondition: '1.5L VTEC Turbo tăng tốc mượt và êm.',
    maintenanceHistory: 'Bảo dưỡng Honda Ôtô mốc 10.000 km.',
    inspectedAt: '2026-11-11',
    location: 'TP. Hồ Chí Minh',
    pickupLocation: 'Khu đô thị Sala, TP. Thủ Đức, TP.HCM',
  }),
  buildVehicle({
    modelSlug: 'hyundai-accent',
    reference: 'NR-OT-ACC01',
    licensePlate: '30K-55312',
    intent: 'BOTH',
    vehicleConditionType: 'USED',
    manufactureYear: 2023,
    version: '1.5 AT Đặc biệt',
    color: 'Xám titan',
    odometer: 26_100,
    pricePerDay: 680_000,
    pricePerHour: 110_000,
    pricePerWeek: 4_200_000,
    pricePerMonth: 14_800_000,
    weekendSurcharge: 80_000,
    holidaySurcharge: 150_000,
    depositAmount: 10_000_000,
    deliveryFee: 100_000,
    kmLimitPerDay: 300,
    overKmFee: 3_500,
    lateReturnFeePerHour: 90_000,
    salePrice: 445_000_000,
    listedPrice: 529_000_000,
    reservationDeposit: 10_000_000,
    negotiable: true,
    warrantyPolicy: 'Bảo hành 5 năm Hyundai Thành Công (DEMO)',
    condition: 'Xe đi phố gọn gàng, khởi động từ xa, màn hình CarPlay.',
    exteriorCondition: 'Sơn xám sạch sẽ, không trầy móp lớn.',
    interiorCondition: 'Ghế da sạch đẹp, có cửa gió sau.',
    engineCondition: 'Động cơ Smartstream êm ái.',
    maintenanceHistory: 'Bảo dưỡng Hyundai mốc 25.000 km.',
    inspectedAt: '2026-11-09',
    location: 'Hà Nội',
    pickupLocation: 'Quận Tây Hồ, Hà Nội (Điểm giao nhận DEMO)',
  }),
  buildVehicle({
    modelSlug: 'vinfast-vf-8',
    reference: 'NR-OT-VF8-01',
    licensePlate: '51K-99808',
    intent: 'BOTH',
    vehicleConditionType: 'USED',
    manufactureYear: 2024,
    version: 'VF 8S / Eco (Kèm pin)',
    color: 'Trắng Brahminy White',
    odometer: 11_800,
    pricePerDay: 1_450_000,
    pricePerHour: 240_000,
    pricePerWeek: 9_100_000,
    pricePerMonth: 31_000_000,
    weekendSurcharge: 150_000,
    holidaySurcharge: 300_000,
    depositAmount: 15_000_000,
    deliveryFee: 150_000,
    kmLimitPerDay: 350,
    overKmFee: 4_000,
    lateReturnFeePerHour: 150_000,
    salePrice: 895_000_000,
    listedPrice: 1_199_000_000,
    reservationDeposit: 20_000_000,
    negotiable: true,
    warrantyPolicy: 'Bảo hành xe 10 năm & Pin 10 năm không giới hạn km VinFast (DEMO)',
    condition: 'Bản kèm pin 87,7 kWh, đã cập nhật phần mềm mới nhất, kèm bộ sạc di động.',
    exteriorCondition: 'Sơn trắng không xước, mâm 19 inch.',
    interiorCondition: 'Màn hình 15,6 inch sắc nét, khoang xe êm tĩnh.',
    engineCondition: '2 mô-tơ AWD vận hành cực êm, SOH pin 98%.',
    maintenanceHistory: 'Kiểm tra hệ thống điện áp cao tại xưởng dịch vụ VinFast 11/2026.',
    inspectedAt: '2026-11-14',
    location: 'TP. Hồ Chí Minh',
    pickupLocation: 'Khu đô thị Sala, TP. Thủ Đức, TP.HCM',
  }),
  buildVehicle({
    modelSlug: 'mercedes-benz-c300-amg',
    reference: 'NR-OT-C300-01',
    licensePlate: '51K-88300',
    intent: 'BOTH',
    vehicleConditionType: 'USED',
    manufactureYear: 2024,
    version: 'C 300 AMG First Edition / CKD (W206)',
    color: 'Trắng Polar',
    odometer: 9_400,
    pricePerDay: 2_800_000,
    pricePerHour: 500_000,
    pricePerWeek: 17_800_000,
    pricePerMonth: 62_000_000,
    weekendSurcharge: 350_000,
    holidaySurcharge: 600_000,
    depositAmount: 30_000_000,
    deliveryFee: 250_000,
    kmLimitPerDay: 250,
    overKmFee: 10_000,
    lateReturnFeePerHour: 300_000,
    salePrice: 1_890_000_000,
    listedPrice: 2_099_000_000,
    reservationDeposit: 50_000_000,
    negotiable: true,
    warrantyPolicy: 'Bảo hành chính hãng Mercedes-Benz Việt Nam 3 năm không giới hạn km (DEMO)',
    condition: 'C 300 AMG W206 trang bị DIGITAL LIGHT, 15 loa Burmester 3D và Panorama.',
    exteriorCondition: 'Phủ ceramic toàn xe, mâm AMG 18 inch không tì vết.',
    interiorCondition: 'Da thật Artico/Nappa sạch sẽ, đèn viền 64 màu.',
    engineCondition: 'I4 2.0L + Mild-Hybrid 48V 9G-TRONIC tăng tốc mượt.',
    maintenanceHistory: 'Bảo dưỡng Service A tại Mercedes-Benz Haxaco.',
    inspectedAt: '2026-11-10',
    location: 'TP. Hồ Chí Minh',
    pickupLocation: 'Khu đô thị Sala, TP. Thủ Đức, TP.HCM',
  }),
  buildVehicle({
    modelSlug: 'ford-ranger-wildtrak',
    reference: 'NR-BT-WLD01',
    licensePlate: '51D-66421',
    intent: 'BOTH',
    vehicleConditionType: 'USED',
    manufactureYear: 2024,
    version: 'Wildtrak 2.0L Bi-Turbo 4x4 AT',
    color: 'Vàng Luxe Yellow',
    odometer: 21_000,
    pricePerDay: 1_300_000,
    pricePerHour: 210_000,
    pricePerWeek: 8_200_000,
    pricePerMonth: 28_500_000,
    weekendSurcharge: 150_000,
    holidaySurcharge: 250_000,
    depositAmount: 15_000_000,
    deliveryFee: 150_000,
    kmLimitPerDay: 300,
    overKmFee: 5_000,
    lateReturnFeePerHour: 150_000,
    salePrice: 915_000_000,
    listedPrice: 979_000_000,
    reservationDeposit: 20_000_000,
    negotiable: true,
    warrantyPolicy: 'Bảo hành Ford Việt Nam 3 năm / 100.000 km (DEMO)',
    condition: 'Trang bị nắp thùng trượt thể thao và lót thùng chính hãng.',
    exteriorCondition: 'Sơn Vàng Luxe Yellow nổi bật, thanh thể thao nguyên bản.',
    interiorCondition: 'Ghế da Wildtrak sạch đẹp, SYNC 4A 12 inch mượt.',
    engineCondition: 'Bi-Turbo 210 PS hoạt động mạnh mẽ.',
    maintenanceHistory: 'Bảo dưỡng định kỳ ở 20.000 km.',
    inspectedAt: '2026-11-12',
    location: 'Đà Nẵng',
    pickupLocation: 'Quận Hải Châu, Đà Nẵng (Điểm giao nhận DEMO)',
  }),
  buildVehicle({
    modelSlug: 'toyota-hilux',
    reference: 'NR-BT-HLX01',
    licensePlate: '51D-52108',
    intent: 'BOTH',
    vehicleConditionType: 'USED',
    manufactureYear: 2023,
    version: '2.4L 4x2 AT',
    color: 'Trắng ngọc trai',
    odometer: 31_400,
    pricePerDay: 1_050_000,
    pricePerHour: 170_000,
    pricePerWeek: 6_500_000,
    pricePerMonth: 22_000_000,
    weekendSurcharge: 120_000,
    holidaySurcharge: 200_000,
    depositAmount: 12_000_000,
    deliveryFee: 150_000,
    kmLimitPerDay: 350,
    overKmFee: 4_000,
    lateReturnFeePerHour: 120_000,
    salePrice: 685_000_000,
    listedPrice: 706_000_000,
    reservationDeposit: 15_000_000,
    negotiable: true,
    warrantyPolicy: 'Bảo hành Toyota Việt Nam (DEMO)',
    condition: 'Phù hợp chở thiết bị công trình và đi tỉnh xa bền bỉ.',
    exteriorCondition: 'Thùng xe có lót nhựa chống trầy, thân xe cứng cáp.',
    interiorCondition: 'Khoang cabin sạch sẽ, điều hòa mát sâu.',
    engineCondition: 'Máy dầu 2.4L nổ đều, rất tiết kiệm nhiên liệu.',
    maintenanceHistory: 'Bảo dưỡng Toyota mốc 30.000 km.',
    inspectedAt: '2026-11-09',
    location: 'TP. Hồ Chí Minh',
    pickupLocation: 'Khu đô thị Sala, TP. Thủ Đức, TP.HCM',
  }),
  buildVehicle({
    modelSlug: 'mitsubishi-triton',
    reference: 'NR-BT-TRT01',
    licensePlate: '51D-44915',
    intent: 'BOTH',
    vehicleConditionType: 'USED',
    manufactureYear: 2024,
    version: 'Athlete 4x2 AT',
    color: 'Trắng Diamond',
    odometer: 25_600,
    pricePerDay: 1_100_000,
    pricePerHour: 180_000,
    pricePerWeek: 6_900_000,
    pricePerMonth: 23_500_000,
    weekendSurcharge: 120_000,
    holidaySurcharge: 220_000,
    depositAmount: 12_000_000,
    deliveryFee: 150_000,
    kmLimitPerDay: 300,
    overKmFee: 4_000,
    lateReturnFeePerHour: 120_000,
    salePrice: 745_000_000,
    listedPrice: 780_000_000,
    reservationDeposit: 15_000_000,
    negotiable: true,
    warrantyPolicy: 'Bảo hành Mitsubishi Motors Việt Nam (DEMO)',
    condition: 'Bán tải cabin kép linh hoạt đô thị, trang bị sẵn nắp thùng thấp.',
    exteriorCondition: 'Trắng Diamond kèm bộ tem Athlete chính hãng.',
    interiorCondition: 'Ghế da hai tông màu sạch đẹp.',
    engineCondition: 'Máy 2.4L MIVEC êm, hộp số 6 cấp mượt.',
    maintenanceHistory: 'Bảo dưỡng Mitsubishi ở 25.000 km.',
    inspectedAt: '2026-11-11',
    location: 'TP. Hồ Chí Minh',
    pickupLocation: 'Khu đô thị Sala, TP. Thủ Đức, TP.HCM',
  }),
]

export function getEstimatedRollingForSeed(
  vehicle: SeedDemoVehicle,
  model: SeedModelSpec,
): number | undefined {
  return calculateRollingPrice(
    vehicle.salePrice,
    model.category,
    model.fuelType,
    vehicle.vehicleConditionType === 'NEW',
  )?.totalEstimated
}
