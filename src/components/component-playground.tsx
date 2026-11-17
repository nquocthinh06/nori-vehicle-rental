'use client'

import { useState } from 'react'
import {
  Badge,
  Button,
  Checkbox,
  EmptyState,
  Heading,
  IconButton,
  Input,
  Notice,
  Select,
  Skeleton,
  Text,
} from './ui'
import { Dialog } from './ui/dialog'
import { Icon } from './ui/icon'

export function ComponentPlayground() {
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [success, setSuccess] = useState(false)
  function simulate() {
    setLoading(true)
    setSuccess(false)
    window.setTimeout(() => {
      setLoading(false)
      setSuccess(true)
    }, 1200)
  }
  return (
    <div className="space-y-10">
      <section>
        <Heading as="h2" size="title" className="mb-5">
          Thao tác & trạng thái
        </Heading>
        <div className="flex flex-wrap gap-3">
          <Button onClick={simulate} loading={loading}>
            {loading ? 'Đang tải trạng thái…' : 'Kiểm tra loading'}
            <Icon name="arrow-right" className="size-4" />
          </Button>
          <Button variant="dark" onClick={() => setOpen(true)}>
            Mở hộp thoại
          </Button>
          <Button variant="secondary" onClick={() => setSuccess(false)}>
            Đặt lại
          </Button>
          <Button variant="danger" disabled>
            Không khả dụng
          </Button>
          <IconButton icon="plus" label="Mở hộp thoại ví dụ" onClick={() => setOpen(true)} />
        </div>
        <Text className="mt-3 text-caption text-muted">
          Khu vực kiểm tra component; không tạo đơn hoặc giao dịch.
        </Text>
        {success && (
          <Notice tone="success" className="mt-4">
            Component đã trở về trạng thái thành công.
          </Notice>
        )}
      </section>
      <section>
        <Heading as="h2" size="title" className="mb-5">
          Biểu mẫu
        </Heading>
        <div className="grid gap-5 md:grid-cols-2">
          <Input
            id="ds-default"
            label="Trường mặc định"
            placeholder="Nội dung nhập vào"
            hint="Nhãn luôn hiển thị và liên kết với trường."
          />
          <Input
            id="ds-error"
            label="Trường có lỗi"
            defaultValue="abc"
            error="Thông báo lỗi rõ ràng và gắn với trường."
          />
          <Input id="ds-disabled" label="Trường chưa khả dụng" value="Chưa cập nhật" disabled />
          <Select id="ds-select" label="Loại phương tiện">
            <option>Ô tô</option>
            <option>Xe máy</option>
            <option>Bán tải</option>
          </Select>
        </div>
        <Checkbox id="ds-checkbox" label="Ví dụ checkbox có thể thao tác bằng phím Space." />
      </section>
      <section>
        <Heading as="h2" size="title" className="mb-5">
          Phản hồi & dữ liệu
        </Heading>
        <div className="flex flex-wrap gap-3">
          <Badge tone="brand">Đã xác nhận</Badge>
          <Badge tone="warning">Chờ xử lý</Badge>
          <Badge tone="danger">Cần kiểm tra</Badge>
          <Badge>Chưa cập nhật</Badge>
        </div>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <Notice>Thông tin bổ sung không ngăn thao tác.</Notice>
          <Notice tone="error">Không thể hoàn tất. Hãy kiểm tra dữ liệu.</Notice>
        </div>
        <Skeleton className="my-5 h-20" />
        <EmptyState
          icon="car"
          title="Không có kết quả"
          description="Empty state giải thích ngắn gọn và đưa ra bước tiếp theo."
        >
          <Button variant="secondary" onClick={() => setOpen(true)}>
            Xem bước tiếp theo
          </Button>
        </EmptyState>
      </section>
      <Dialog title="Hộp thoại NORI" open={open} onClose={() => setOpen(false)}>
        <Text className="text-muted">
          Hỗ trợ bàn phím, giữ focus trong hộp thoại, đóng bằng Escape và trả focus về nút mở. Giảm
          chuyển động theo cài đặt hệ điều hành.
        </Text>
        <Button className="mt-6 w-full" onClick={() => setOpen(false)}>
          Đã hiểu <Icon name="check" className="size-4" />
        </Button>
      </Dialog>
    </div>
  )
}
