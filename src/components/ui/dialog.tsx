'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { Heading, IconButton } from '.'

export function Dialog({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  wide?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
    if (open) {
      const original = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = original
      }
    }
  }, [open])
  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
      aria-label={title}
      className={`max-h-dialog-viewport w-[calc(100vw-1.5rem)] rounded-panel border border-line bg-canvas p-0 text-ink shadow-float backdrop:backdrop-blur-sm sm:w-full ${wide ? 'max-w-content' : 'max-w-dialog'}`}
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-canvas px-4 py-3 sm:gap-4 sm:px-6 sm:py-4">
        <Heading as="h2" size="subtitle" className="min-w-0 truncate">
          {title}
        </Heading>
        <IconButton icon="close" label="Đóng hộp thoại" onClick={onClose} />
      </div>
      <div className="p-4 sm:p-6">{children}</div>
    </dialog>
  )
}
