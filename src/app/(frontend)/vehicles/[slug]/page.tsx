import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getCatalogue, getModel, getSiteContent } from '@/lib/catalogue'
import { VehicleDetail } from '@/components/vehicle-detail'
import { Container, Skeleton } from '@/components/ui'

export const dynamicParams = true

export async function generateStaticParams() {
  return (await getCatalogue()).map((model) => ({ slug: model.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const model = await getModel((await params).slug)
  return {
    title: model ? `${model.name} — Thuê & mua xe | NORI` : 'Không tìm thấy xe | NORI',
    description: model?.description ?? 'Khám phá thông tin phương tiện cùng NORI.',
    ...(!model ? { robots: { index: false, follow: false } } : {}),
  }
}

function VehicleDetailSkeleton() {
  return (
    <main id="main-content" className="min-h-[1200px] bg-canvas">
      <Container className="py-8">
        <div className="mb-6 space-y-3">
          <Skeleton className="h-4 w-48" />
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Skeleton className="h-10 w-72" />
            <Skeleton className="h-6 w-32" />
          </div>
          <div className="grid grid-cols-2 gap-3 rounded-card border border-line bg-subtle p-3.5 sm:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </div>

        <div className="grid items-start gap-7 lg:grid-cols-3">
          <div className="min-w-0 space-y-6 lg:col-span-2">
            <Skeleton className="h-gallery-mobile rounded-card md:h-gallery" />
            <div className="flex gap-2">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-16 w-24 rounded-control" />
              ))}
            </div>
            <div className="rounded-card border border-line p-5">
              <Skeleton className="mb-4 h-12 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          </div>

          <div className="rounded-card border border-line bg-canvas p-5 shadow-card">
            <Skeleton className="mb-5 h-10 w-full rounded-control" />
            <div className="mb-4 flex items-center justify-between">
              <Skeleton className="h-8 w-36" />
              <Skeleton className="h-5 w-16" />
            </div>
            <Skeleton className="mb-5 h-4 w-48" />
            <div className="my-5 h-px bg-line" />
            <div className="mb-4 space-y-1.5">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-control w-full" />
            </div>
            <div className="mb-4 grid grid-cols-2 gap-3">
              <Skeleton className="h-control" />
              <Skeleton className="h-control" />
            </div>
            <Skeleton className="mt-4 h-control w-full" />
          </div>
        </div>
      </Container>
    </main>
  )
}

export default async function VehiclePage({ params }: { params: Promise<{ slug: string }> }) {
  const [model, site] = await Promise.all([getModel((await params).slug), getSiteContent()])
  if (!model) notFound()
  return (
    <Suspense fallback={<VehicleDetailSkeleton />}>
      <VehicleDetail model={model} address={site.address} site={site} />
    </Suspense>
  )
}
