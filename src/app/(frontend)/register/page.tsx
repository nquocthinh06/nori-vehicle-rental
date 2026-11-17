import { AuthPage } from '@/components/auth-page'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Tạo tài khoản | NORI',
  robots: { index: false, follow: true },
}
export default function RegisterPage() {
  return <AuthPage mode="register" />
}
