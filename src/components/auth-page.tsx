import Image from 'next/image'
import { Suspense } from 'react'
import { getSiteContent } from '@/lib/catalogue'
import { AuthForm } from './auth-form'
import { Container, Heading, Skeleton, Text } from './ui'
import { Brand } from './brand'

export async function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const site = await getSiteContent()
  const image = site.heroImages[1]?.image ?? site.heroImages[0]?.image ?? site.storyImage
  return (
    <main id="main-content" className="border-t border-line">
      <Container className="grid items-stretch gap-9 py-10 md:grid-cols-2 md:gap-16 md:py-14">
        <aside className="relative hidden min-h-hero-mobile overflow-hidden rounded-panel bg-night p-10 text-inverse md:flex md:flex-col md:justify-end">
          {image && (
            <Image src={image.url} alt={image.alt} fill sizes="50vw" className="object-cover" />
          )}
          <div className="image-shade absolute inset-0" />
          <div className="relative">
            <Brand inverse />
            <Heading size="section" className="mt-7">
              Hành trình của bạn.
              <br />
              Theo cách của bạn.
            </Heading>
            <Text className="mt-4 text-small text-inverse/85">
              Từ những điều quen thuộc đến những khám phá mới, luôn có NORI đồng hành.
            </Text>
          </div>
        </aside>
        <section className="mx-auto flex w-full max-w-form flex-col justify-center py-5">
          <Suspense
            fallback={
              <div className="space-y-5">
                <Skeleton className="h-12" />
                <Skeleton className="h-control" />
                <Skeleton className="h-control" />
                <Skeleton className="h-control" />
              </div>
            }
          >
            <AuthForm mode={mode} />
          </Suspense>
        </section>
      </Container>
    </main>
  )
}
