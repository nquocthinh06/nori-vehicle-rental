import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getCatalogueSummary, getModel, getSiteContent } from '@/lib/catalogue'
import { VehicleDetail } from '@/components/vehicle-detail'

export const dynamicParams = true

export async function generateStaticParams() {
  return (await getCatalogueSummary()).map((model) => ({ slug: model.slug }))
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
  const detailSite = {
    ageRequirement: site.ageRequirement,
    licenseRequirement: site.licenseRequirement,
    depositPolicy: site.depositPolicy,
    cancellationPolicy: site.cancellationPolicy,
    phone: site.phone,
    email: site.email,
    address: site.address,
    openingHours: site.openingHours,
    workStartTime: site.workStartTime,
    workEndTime: site.workEndTime,
    lunchBreakStart: site.lunchBreakStart,
    lunchBreakEnd: site.lunchBreakEnd,
  }
  return <VehicleDetail model={model} address={site.address} site={detailSite} />
}
