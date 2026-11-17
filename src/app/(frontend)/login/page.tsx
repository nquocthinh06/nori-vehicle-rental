import { AuthPage } from '@/components/auth-page'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Đăng nhập | NORI',
  robots: { index: false, follow: true },
}
export default function LoginPage() {
  return <AuthPage mode="login" />
}
