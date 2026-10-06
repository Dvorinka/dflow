import { Skeleton } from '@/components/ui/skeleton'

// Placeholder while an onboarding step bundle loads (#119)
export const OnboardingStepSkeleton = () => {
  return (
    <div className='space-y-3 py-2' aria-busy='true' aria-label='Loading step'>
      <Skeleton className='h-5 w-2/3' />
      <Skeleton className='h-4 w-full' />
      <Skeleton className='h-4 w-5/6' />
      <div className='flex gap-2 pt-1'>
        <Skeleton className='h-9 w-24' />
        <Skeleton className='h-9 w-24' />
      </div>
    </div>
  )
}
