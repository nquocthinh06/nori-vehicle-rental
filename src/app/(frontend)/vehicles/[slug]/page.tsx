import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getCatalogue, getModel, getSiteContent } from '@/lib/catalogue'
import { VehicleDetail } from '@/components/vehicle-detail'

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

export default async function VehiclePage({ params }: { params: Promise<{ slug: string }> }) {
  const [model, site] = await Promise.all([getModel((await params).slug), getSiteContent()])
  if (!model) notFound()
  return <VehicleDetail model={model} address={site.address} site={site} />
}
