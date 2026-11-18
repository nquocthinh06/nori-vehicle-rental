'use client'

import { type ReactNode } from 'react'
import { Dialog } from './dialog'
import { Button, Heading, Text } from '.'
import { Icon } from './icon'

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = 'Xác nhận thao tác',
  description,
  confirmLabel = 'Xác nhận',
  cancelLabel = 'Hủy bỏ',
  tone = 'primary',
  loading = false,
  children,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void | Promise<void>
  title?: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'primary' | 'danger'
  loading?: boolean
  children?: ReactNode
}) {
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <div className="space-y-4">
        {description && <Text className="text-body text-muted leading-relaxed">{description}</Text>}

        {children}

        <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-line/60 pt-4">
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={loading}
            className="text-small font-semibold"
          >
            {cancelLabel}
          </Button>

          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={loading}
            className="text-small font-semibold"
          >
            {tone === 'danger' && <Icon name="alert" className="size-4" />}
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
