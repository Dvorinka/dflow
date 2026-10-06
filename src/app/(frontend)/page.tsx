import { redirect } from 'next/navigation'

import { getCurrentUser } from '@/lib/auth/getCurrentUser'

export default async function HomePage() {
  const user = await getCurrentUser()
  if (user) redirect(`/${user.username}/dashboard`)
  else redirect('/sign-in')
}
