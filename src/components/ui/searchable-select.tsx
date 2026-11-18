'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Icon } from './icon'
import { Text, cn } from '.'

export type SelectOption = {
  value: string
  label: string
  count?: number
  badge?: string
}

export type SearchableSelectProps = {
  id?: string
  label?: string
  value: string
  onChange: (value: string) => void
  options: (string | SelectOption)[]
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  error?: string
  hint?: string
  disabled?: boolean
  required?: boolean
  searchable?: boolean
  wrapperClassName?: string
  className?: string
}

export function SearchableSelect({
  id: explicitId,
  label,
  value,
  onChange,
  options,
  placeholder = 'Chọn một mục...',
  searchPlaceholder = 'Tìm kiếm nhanh...',
  emptyText = 'Không tìm thấy kết quả phù hợp',
  error,
  hint,
  disabled = false,
  required = false,
  searchable = true,
  wrapperClassName,
  className,
}: SearchableSelectProps) {
  const generatedId = useId()
  const id = explicitId || generatedId

  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(-1)

  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  // Normalize options into uniform { value, label, count, badge } format
  const normalizedOptions = useMemo<SelectOption[]>(() => {
    return options.map((opt) => {
      if (typeof opt === 'string') {
        return { value: opt, label: opt }
      }
      return opt
    })
  }, [options])

  // Filter options by search term
  const filteredOptions = useMemo(() => {
    if (!searchTerm.trim()) return normalizedOptions
    const query = searchTerm.toLowerCase().trim()
    return normalizedOptions.filter(
      (opt) =>
        opt.label.toLowerCase().includes(query) ||
        opt.value.toLowerCase().includes(query) ||
        (opt.badge && opt.badge.toLowerCase().includes(query)),
    )
  }, [normalizedOptions, searchTerm])

  const selectedOption = useMemo(() => {
    return normalizedOptions.find((opt) => opt.value === value)
  }, [normalizedOptions, value])

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setSearchTerm('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Auto focus search input on open
  useEffect(() => {
    if (isOpen && searchable) {
      setTimeout(() => {
        searchInputRef.current?.focus()
      }, 50)
    }
  }, [isOpen, searchable])

  // Reset highlight when list changes
  useEffect(() => {
    setHighlightedIndex(0)
  }, [filteredOptions])

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return

    if (!isOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault()
        setIsOpen(true)
      }
      return
    }

    switch (e.key) {
      case 'Escape':
        e.preventDefault()
        setIsOpen(false)
        setSearchTerm('')
        break
      case 'ArrowDown':
        e.preventDefault()
        setHighlightedIndex((prev) => (prev + 1 < filteredOptions.length ? prev + 1 : 0))
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : filteredOptions.length - 1))
        break
      case 'Enter':
        e.preventDefault()
        if (filteredOptions[highlightedIndex]) {
          onChange(filteredOptions[highlightedIndex].value)
          setIsOpen(false)
          setSearchTerm('')
        }
        break
    }
  }

  return (
    <div ref={containerRef} className={cn('relative min-w-0', wrapperClassName)}>
      {label && (
        <label
          htmlFor={id}
          className="mb-2 block text-small font-medium text-ink"
          onClick={() => !disabled && setIsOpen((prev) => !prev)}
        >
          {label}
          {required && (
            <span className="ml-1 text-danger" aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}

      {/* Trigger Button */}
      <button
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={`${id}-listbox`}
        aria-invalid={!!error}
        aria-describedby={error || hint ? `${id}-message` : undefined}
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        onKeyDown={handleKeyDown}
        className={cn(
          'flex min-h-control w-full min-w-0 items-center justify-between gap-2 rounded-control border border-control-line bg-canvas px-3.5 py-3 text-left text-body text-ink transition-colors',
          'hover:border-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-focus/20',
          'disabled:cursor-not-allowed disabled:bg-subtle disabled:text-muted',
          error && 'border-danger ring-2 ring-danger/15',
          isOpen && 'border-brand ring-2 ring-focus/20',
          className,
        )}
      >
        <span className={cn('truncate', !selectedOption && 'text-muted')}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <Icon
          name="chevron-down"
          className={cn(
            'size-4 shrink-0 text-muted transition-transform duration-200',
            isOpen && 'rotate-180 text-brand',
          )}
        />
      </button>

      {/* Dropdown Popover Menu */}
      {isOpen && (
        <div
          id={`${id}-listbox`}
          role="listbox"
          className="absolute z-50 mt-1 max-h-72 w-full overflow-hidden rounded-card border border-line bg-canvas p-1.5 shadow-float backdrop-blur-md animate-enter"
        >
          {/* Quick Search Bar inside Dropdown */}
          {searchable && (
            <div className="relative mb-1.5 border-b border-line/60 pb-1.5">
              <Icon
                name="search"
                className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted"
              />
              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={searchPlaceholder}
                className="w-full rounded-control bg-subtle py-1.5 pl-8 pr-3 text-small text-ink placeholder:text-muted focus:bg-canvas focus:outline-none focus:ring-1 focus:ring-brand"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  aria-label="Xóa từ khóa"
                  className="absolute right-2.5 top-2 text-muted hover:text-ink"
                >
                  <Icon name="close" className="size-3.5" />
                </button>
              )}
            </div>
          )}

          {/* Option List */}
          <ul ref={listRef} className="max-h-52 overflow-y-auto no-scrollbar py-0.5" tabIndex={-1}>
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt, index) => {
                const isSelected = opt.value === value
                const isHighlighted = index === highlightedIndex

                return (
                  <li
                    key={opt.value}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onChange(opt.value)
                      setIsOpen(false)
                      setSearchTerm('')
                    }}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={cn(
                      'flex cursor-pointer items-center justify-between gap-2 rounded-control px-3 py-2 text-small transition-colors',
                      isSelected
                        ? 'bg-brand-soft font-semibold text-brand'
                        : isHighlighted
                          ? 'bg-subtle text-ink'
                          : 'text-ink hover:bg-subtle',
                    )}
                  >
                    <span className="flex items-center gap-2 truncate">
                      {opt.label}
                      {opt.badge && (
                        <span className="rounded-pill bg-canvas border border-line px-1.5 py-0.2 text-micro font-medium text-muted">
                          {opt.badge}
                        </span>
                      )}
                    </span>

                    <div className="flex items-center gap-2 shrink-0">
                      {typeof opt.count === 'number' && (
                        <span className="text-micro font-medium text-muted">({opt.count})</span>
                      )}
                      {isSelected && <Icon name="check" className="size-3.5 text-brand" />}
                    </div>
                  </li>
                )
              })
            ) : (
              <li className="py-4 text-center text-small text-muted">{emptyText}</li>
            )}
          </ul>
        </div>
      )}

      {/* Error or Hint message */}
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
