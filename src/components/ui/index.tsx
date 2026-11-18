import Link from 'next/link'
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ComponentProps,
  ElementType,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { Icon, type IconName } from './icon'

export function cn(...values: (string | false | null | undefined)[]) {
  return values.filter(Boolean).join(' ')
}

const controlBase =
  'inline-flex min-h-touch items-center justify-center gap-2.5 rounded-control text-body font-semibold transition-colors focus-visible:outline-offset-4 disabled:pointer-events-none disabled:opacity-45 active:translate-y-px'
const control = `${controlBase} px-5 py-3`
const buttonSizes = {
  default: 'px-5 py-3',
  sm: 'min-h-control-sm px-3.5 py-2 text-caption',
  cell: 'min-h-touch px-0.5 py-1.5',
}
const variants = {
  primary: 'bg-brand text-inverse hover:bg-brand-hover',
  dark: 'bg-ink text-inverse hover:bg-night-soft',
  secondary: 'border border-line bg-canvas text-ink hover:border-brand hover:bg-brand-soft',
  ghost: 'text-ink hover:bg-subtle',
  inverse: 'border border-inverse/40 bg-transparent text-inverse hover:bg-inverse/15',
  danger: 'border border-danger/25 bg-danger-soft text-danger hover:bg-danger hover:text-inverse',
}
type Variant = keyof typeof variants

export function Button({
  variant = 'primary',
  size = 'default',
  loading,
  children,
  className,
  disabled,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: keyof typeof buttonSizes
  loading?: boolean
}) {
  return (
    <button
      type={type}
      className={cn(controlBase, buttonSizes[size], variants[variant], className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Icon name="loader" className="animate-spin" />}
      {children}
    </button>
  )
}

export function ButtonLink({
  variant = 'primary',
  children,
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; children: ReactNode; className?: string }) {
  return (
    <Link className={cn(control, variants[variant], className)} {...props}>
      {children}
    </Link>
  )
}

export function TabButton({
  selected,
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected: boolean }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      tabIndex={selected ? 0 : -1}
      className={cn(
        'inline-flex min-h-touch min-w-0 items-center justify-center gap-2 border-b-2 px-1 py-4 text-small font-semibold transition-colors hover:bg-brand-soft hover:text-brand active:bg-soft disabled:cursor-not-allowed disabled:opacity-45',
        selected ? 'border-brand text-brand' : 'border-transparent text-muted',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

export function NoriLink({
  children,
  className,
  ...props
}: ComponentProps<typeof Link> & { children: ReactNode; className?: string }) {
  return (
    <Link className={cn('rounded-sm transition-colors hover:text-brand', className)} {...props}>
      {children}
    </Link>
  )
}

export function ExternalLink({
  children,
  className,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      className={cn(
        'rounded-sm underline underline-offset-4 transition-colors hover:text-brand',
        className,
      )}
      rel={props.target === '_blank' ? 'noopener noreferrer' : undefined}
      {...props}
    >
      {children}
    </a>
  )
}

export function IconButton({
  icon,
  label,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex size-touch shrink-0 items-center justify-center rounded-pill border border-line bg-canvas text-ink transition-colors hover:border-brand hover:text-brand active:bg-brand-soft disabled:cursor-not-allowed disabled:opacity-40',
        className,
      )}
      {...props}
    >
      <Icon name={icon} />
    </button>
  )
}

export function Heading({
  as = 'h2',
  size = 'section',
  className,
  children,
  ...props
}: HTMLAttributes<HTMLHeadingElement> & {
  as?: 'h1' | 'h2' | 'h3' | 'h4'
  size?: 'hero' | 'display' | 'section' | 'title' | 'subtitle' | 'body'
}) {
  const Tag: ElementType = as
  const sizes = {
    hero: 'text-hero-mobile leading-tight tracking-tight md:text-hero',
    display: 'text-section leading-tight tracking-tight md:text-display',
    section: 'text-title leading-snug tracking-tight md:text-section',
    title: 'text-title leading-snug tracking-tight',
    subtitle: 'text-subtitle leading-snug',
    body: 'text-lead leading-snug',
  }
  return (
    <Tag className={cn('text-balance font-semibold', sizes[size], className)} {...props}>
      {children}
    </Tag>
  )
}

export function Text({
  as = 'p',
  className,
  children,
  ...props
}: HTMLAttributes<HTMLElement> & { as?: 'p' | 'span' | 'div' | 'small' }) {
  const Tag: ElementType = as
  return (
    <Tag className={cn('leading-relaxed', className)} {...props}>
      {children}
    </Tag>
  )
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Text
      as="div"
      className={cn(
        'mb-3 text-caption font-semibold uppercase tracking-widest text-brand',
        className,
      )}
    >
      {children}
    </Text>
  )
}

export function Container({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('mx-auto w-full max-w-content px-5 md:px-8 xl:px-page', className)}
      {...props}
    >
      {children}
    </div>
  )
}

export function Badge({
  children,
  tone = 'muted',
  className,
}: {
  children: ReactNode
  tone?: 'brand' | 'muted' | 'warning' | 'danger' | 'inverse'
  className?: string
}) {
  const tones = {
    brand: 'bg-brand-soft text-brand',
    muted: 'bg-subtle text-muted',
    warning: 'bg-warning-soft text-warning',
    danger: 'bg-danger-soft text-danger',
    inverse: 'bg-canvas/95 text-ink',
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-micro font-medium leading-relaxed',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

const inputStyle =
  'min-h-control w-full min-w-0 rounded-control border border-control-line bg-canvas px-3.5 py-3 text-lead text-ink placeholder:text-muted hover:border-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-focus/20 disabled:cursor-not-allowed disabled:bg-subtle disabled:text-muted aria-invalid:border-danger aria-invalid:ring-danger/15 sm:text-body'
type FieldProps = { label: string; error?: string; hint?: string; wrapperClassName?: string }

export function Input({
  label,
  error,
  hint,
  wrapperClassName,
  className,
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & FieldProps) {
  return (
    <div className={cn('min-w-0', wrapperClassName)}>
      <label htmlFor={id} className="mb-2 block text-small font-medium">
        {label}
        {props.required && (
          <span className="ml-1 text-danger" aria-hidden="true">
            *
          </span>
        )}
      </label>
      <input
        id={id}
        aria-invalid={!!error}
        aria-describedby={error || hint ? `${id}-message` : undefined}
        className={cn(inputStyle, className)}
        {...props}
      />
      {(error || hint) && (
        <Text
          as="small"
          id={`${id}-message`}
          className={cn('mt-1.5 block text-caption', error ? 'text-danger' : 'text-muted')}
        >
          {error ?? hint}
        </Text>
      )}
    </div>
  )
}

export function Select({
  label,
  error,
  hint,
  wrapperClassName,
  className,
  id,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & FieldProps) {
  return (
    <div className={cn('min-w-0', wrapperClassName)}>
      <label htmlFor={id} className="mb-2 block text-small font-medium">
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          aria-invalid={!!error}
          aria-describedby={error || hint ? `${id}-message` : undefined}
          className={cn(inputStyle, 'appearance-none pr-10', className)}
          {...props}
        >
          {children}
        </select>
        <Icon
          name="chevron-down"
          className="pointer-events-none absolute right-3 top-3.5 text-muted"
        />
      </div>
      {(error || hint) && (
        <Text
          as="small"
          id={`${id}-message`}
          className={cn('mt-1.5 block text-caption', error ? 'text-danger' : 'text-muted')}
        >
          {error ?? hint}
        </Text>
      )}
    </div>
  )
}

export function Textarea({
  label,
  error,
  hint,
  wrapperClassName,
  className,
  id,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & FieldProps) {
  return (
    <div className={wrapperClassName}>
      <label htmlFor={id} className="mb-2 block text-small font-medium">
        {label}
      </label>
      <textarea
        id={id}
        aria-invalid={!!error}
        aria-describedby={error || hint ? `${id}-message` : undefined}
        className={cn(inputStyle, 'resize-y', className)}
        {...props}
      />
      {(error || hint) && (
        <Text
          as="small"
          id={`${id}-message`}
          className={cn('mt-1.5 block text-caption', error ? 'text-danger' : 'text-muted')}
        >
          {error ?? hint}
        </Text>
      )}
    </div>
  )
}

export function Checkbox({
  label,
  className,
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex min-h-touch cursor-pointer items-start gap-3 py-2 text-small leading-relaxed',
        className,
      )}
    >
      <input
        type="checkbox"
        id={id}
        className="mt-1 size-4 shrink-0 rounded-sm border-line"
        {...props}
      />
      <span>{label}</span>
    </label>
  )
}

export function Notice({
  children,
  tone = 'info',
  className,
}: {
  children: ReactNode
  tone?: 'info' | 'error' | 'success'
  className?: string
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-3 rounded-control p-4 text-small leading-relaxed',
        tone === 'error' ? 'bg-danger-soft text-danger' : 'bg-brand-soft text-brand',
        className,
      )}
    >
      <Icon
        name={tone === 'error' ? 'alert' : tone === 'success' ? 'check' : 'info'}
        className="mt-0.5 size-icon-sm"
      />
      <div>{children}</div>
    </div>
  )
}

export function EmptyState({
  title,
  description,
  icon = 'search',
  children,
}: {
  title: string
  description: string
  icon?: IconName
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center rounded-card border border-dashed border-line px-5 py-14 text-center">
      <div className="mb-5 flex size-14 items-center justify-center rounded-pill bg-brand-soft text-brand">
        <Icon name={icon} className="size-6" />
      </div>
      <Heading as="h3" size="subtitle" className="mb-2">
        {title}
      </Heading>
      <Text className="mb-6 max-w-reading text-muted">{description}</Text>
      {children}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn('animate-skeleton rounded-control bg-line', className)} />
  )
}

export function CardSkeleton() {
  return (
    <div
      className="overflow-hidden rounded-card border border-line"
      role="status"
      aria-label="Đang tải phương tiện"
    >
      <Skeleton className="h-card-image rounded-none" />
      <div className="space-y-4 p-5">
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <div className="pt-4">
          <Skeleton className="h-8 w-full" />
        </div>
      </div>
    </div>
  )
}

export function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    PENDING: 'Chờ xác nhận',
    DEPOSIT_PENDING: 'Chờ đặt cọc',
    CONFIRMED: 'Đã xác nhận',
    READY_FOR_HANDOVER: 'Chờ giao xe',
    ONGOING: 'Đang thuê',
    INSPECTING: 'Chờ kiểm tra & quyết toán',
    COMPLETED: 'Hoàn thành',
    CANCELLED: 'Đã hủy',
    REJECTED: 'Đã từ chối',
    NEW: 'Đã tiếp nhận',
    CONTACTED: 'Đã liên hệ',
    TEST_DRIVE_SCHEDULED: 'Đã hẹn xem / lái thử',
    CONTRACT_SIGNED: 'Đã ký hồ sơ',
    DELIVERED: 'Đã bàn giao xe',
    CLOSED: 'Đã đóng',
    ACTIVE: 'Đang kinh doanh',
    INACTIVE: 'Tạm ngừng',
    READY: 'Sẵn sàng',
    RENTED: 'Đang cho thuê',
    RESERVED: 'Đang giữ chỗ',
    MAINTENANCE: 'Đang bảo dưỡng',
    SOLD: 'Đã bán',
  }
  return (
    <Badge
      tone={
        ['PENDING', 'DEPOSIT_PENDING', 'NEW', 'INSPECTING', 'MAINTENANCE', 'RESERVED'].includes(
          status,
        )
          ? 'warning'
          : [
                'CONFIRMED',
                'READY_FOR_HANDOVER',
                'ONGOING',
                'ACTIVE',
                'COMPLETED',
                'READY',
                'CONTACTED',
                'TEST_DRIVE_SCHEDULED',
                'CONTRACT_SIGNED',
                'DELIVERED',
              ].includes(status)
            ? 'brand'
            : ['REJECTED', 'CANCELLED'].includes(status)
              ? 'danger'
              : 'muted'
      }
    >
      {labels[status] ?? status}
    </Badge>
  )
}

export {
  SearchableSelect,
  type SelectOption,
  type SearchableSelectProps,
} from './searchable-select'
export { ConfirmDialog } from './confirm-dialog'
export { Dialog } from './dialog'
