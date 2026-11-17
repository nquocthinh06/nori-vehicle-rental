'use client'

import { useState, type FormEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { api, RequestError } from '@/lib/client-api'
import { useAuth, type AppUser } from './auth-provider'
import {
  Button,
  ButtonLink,
  Checkbox,
  Heading,
  IconButton,
  Input,
  NoriLink,
  Notice,
  Text,
} from './ui'
import { Icon } from './ui/icon'

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const register = mode === 'register'
  const params = useSearchParams()
  const router = useRouter()
  const { user, refresh } = useAuth()
  const [busy, setBusy] = useState(false)
  const [visible, setVisible] = useState(false)
  const [error, setError] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  const rawTarget = params.get('returnTo')
  const safeTarget =
    rawTarget &&
    rawTarget.startsWith('/') &&
    !rawTarget.startsWith('//') &&
    !rawTarget.includes('\\')
      ? rawTarget
      : null
  const returnTo = safeTarget ?? '/account'

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    setFields({})
    try {
      const signedIn = await api<AppUser>(`/auth/${mode}`, {
        method: 'POST',
        body: JSON.stringify(
          Object.fromEntries([...data.entries()].filter(([key]) => key !== 'terms')),
        ),
      })
      await refresh()
      const destination = !register && signedIn?.isAdmin ? (safeTarget ?? '/dashboard') : returnTo
      router.push(destination)
      router.refresh()
    } catch (e) {
      setError((e as Error).message)
      if (e instanceof RequestError) setFields(e.fields)
    } finally {
      setBusy(false)
    }
  }

  if (user) {
    const alreadyTarget = user.isAdmin ? (safeTarget ?? '/dashboard') : returnTo
    return (
      <div className="py-8">
        <Heading as="h1" size="section">
          Chào {user.fullName}.
        </Heading>
        <Text className="mb-7 mt-4 text-muted">
          {user.isAdmin
            ? `Bạn đang đăng nhập với quyền quản trị (${user.email}).`
            : 'Bạn đã đăng nhập tài khoản NORI.'}
        </Text>
        <ButtonLink href={alreadyTarget} className="w-full">
          {user.isAdmin ? 'Đi tới Quản trị hệ thống' : 'Tiếp tục hành trình'}{' '}
          <Icon name="arrow-right" className="size-4" />
        </ButtonLink>
      </div>
    )
  }

  return (
    <div>
      <Text className="mb-3 text-caption font-semibold uppercase tracking-widest text-brand">
        CHÀO MỪNG ĐẾN VỚI NORI
      </Text>
      <Heading as="h1" size="section">
        {register ? 'Bắt đầu hành trình mới.' : 'Rất vui được gặp lại bạn.'}
      </Heading>
      <Text className="mb-8 mt-3 text-small text-muted">
        {register
          ? 'Một tài khoản, chủ động mọi hành trình.'
          : 'Đăng nhập để đặt xe và theo dõi hành trình của bạn.'}
      </Text>
      <form onSubmit={submit} className="space-y-5">
        {register && (
          <Input
            id="auth-name"
            name="fullName"
            label="Họ và tên"
            autoComplete="name"
            placeholder="Nhập họ và tên của bạn"
            required
            minLength={2}
            maxLength={100}
            error={fields.fullName}
          />
        )}
        <Input
          id="auth-email"
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="ban@example.com"
          required
          maxLength={254}
          error={fields.email}
        />
        {register && (
          <Input
            id="auth-phone"
            name="phone"
            label="Số điện thoại (không bắt buộc)"
            type="tel"
            autoComplete="tel"
            placeholder="Số điện thoại liên hệ"
            maxLength={16}
            error={fields.phone}
          />
        )}
        <div className="relative">
          <Input
            id="auth-password"
            name="password"
            label="Mật khẩu"
            type={visible ? 'text' : 'password'}
            autoComplete={register ? 'new-password' : 'current-password'}
            placeholder={register ? 'Ít nhất 8 ký tự, gồm chữ và số' : 'Nhập mật khẩu'}
            required
            minLength={8}
            maxLength={72}
            error={fields.password}
            className="pr-12"
          />
          <IconButton
            icon={visible ? 'eye-off' : 'eye'}
            label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
            className="absolute right-1 top-7 border-transparent bg-transparent"
            onClick={() => setVisible(!visible)}
          />
        </div>
        {register && (
          <Input
            id="auth-confirm"
            name="confirmPassword"
            label="Xác nhận mật khẩu"
            type={visible ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Nhập lại mật khẩu"
            required
            minLength={8}
            maxLength={72}
            error={fields.confirmPassword}
          />
        )}
        {register ? (
          <Checkbox
            id="auth-terms"
            name="terms"
            required
            label={
              <>
                Tôi đồng ý với{' '}
                <NoriLink href="/support#conditions" className="font-medium text-brand underline">
                  Điều khoản sử dụng
                </NoriLink>{' '}
                và{' '}
                <NoriLink href="/support#privacy" className="font-medium text-brand underline">
                  Chính sách riêng tư
                </NoriLink>{' '}
                của NORI.
              </>
            }
          />
        ) : (
          <div className="flex justify-end">
            <NoriLink href="/support#account" className="text-caption font-medium text-brand">
              Cần hỗ trợ đăng nhập?
            </NoriLink>
          </div>
        )}
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" loading={busy} className="w-full">
          {busy ? 'Đang xử lý…' : register ? 'Tạo tài khoản NORI' : 'Đăng nhập'}
          {!busy && <Icon name="arrow-right" className="size-4" />}
        </Button>
      </form>
      <Text className="mt-7 text-center text-small text-muted">
        {register ? 'Bạn đã có tài khoản?' : 'Chưa có tài khoản?'}{' '}
        <NoriLink
          href={`/${register ? 'login' : 'register'}?returnTo=${encodeURIComponent(returnTo)}`}
          className="font-semibold text-brand"
        >
          {register ? 'Đăng nhập' : 'Đăng ký ngay'}
        </NoriLink>
      </Text>
      <div className="mt-8 flex items-center justify-center gap-2 border-t border-line pt-6 text-micro text-muted">
        <Icon name="shield" className="size-3.5 text-brand" />
        Phiên đăng nhập bảo mật. Không chia sẻ mật khẩu của bạn.
      </div>
    </div>
  )
}
