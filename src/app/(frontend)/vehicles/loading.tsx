import { CardSkeleton, Container, Skeleton } from '@/components/ui'

export default function Loading() {
  return (
    <main id="main-content">
      <Container className="py-14">
        <Skeleton className="mb-6 h-4 w-36" />
        <Skeleton className="mb-10 h-14 w-2/3" />
        <div className="grid gap-5 md:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      </Container>
    </main>
  )
}
