'use client'

import { Button, ButtonLink } from './ui'
import { Icon } from './ui/icon'

export function OfflineActions() {
  return (
    <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
      <Button onClick={() => window.location.reload()}>
        <Icon name="arrow-right" className="size-4" />
        Thử kết nối lại
      </Button>
      <ButtonLink href="/" variant="secondary">
        Về trang chủ
      </ButtonLink>
    </div>
  )
}
