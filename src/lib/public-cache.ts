import { revalidatePath, revalidateTag } from 'next/cache'

export type NoriInvalidation = { slugs: string[]; allDetails: boolean }

export function invalidateNoriCaches({ slugs, allDetails }: NoriInvalidation) {
  revalidateTag('nori-catalogue', { expire: 0 })
  revalidateTag('nori-site', { expire: 0 })
  revalidatePath('/')
  revalidatePath('/vehicles')
  for (const slug of new Set(slugs)) {
    revalidateTag(`nori-model-${slug}`, { expire: 0 })
    revalidatePath(`/vehicles/${slug}`)
  }
  if (allDetails) revalidatePath('/vehicles/[slug]', 'page')
}
