import { revalidatePath, revalidateTag } from 'next/cache'

export type NoriInvalidation = {
  slugs: string[]
  allDetails: boolean
  postSlugs?: string[]
  allPosts?: boolean
}

export function invalidateNoriCaches({
  slugs,
  allDetails,
  postSlugs = [],
  allPosts = false,
}: NoriInvalidation) {
  revalidateTag('nori-catalogue', { expire: 0 })
  revalidateTag('nori-branches', { expire: 0 })
  revalidateTag('nori-site', { expire: 0 })
  revalidateTag('nori-posts', { expire: 0 })
  revalidatePath('/')
  revalidatePath('/vehicles')
  revalidatePath('/about')
  revalidatePath('/support')
  revalidatePath('/posts')
  for (const slug of new Set(slugs)) {
    revalidateTag(`nori-model-${slug}`, { expire: 0 })
    revalidatePath(`/vehicles/${slug}`)
  }
  if (allDetails) revalidatePath('/vehicles/[slug]', 'page')
  for (const slug of new Set(postSlugs)) {
    revalidateTag(`nori-post-${slug}`, { expire: 0 })
    revalidatePath(`/posts/${slug}`)
  }
  if (allPosts || allDetails) revalidatePath('/posts/[slug]', 'page')
}
