'use client'

import { useEffect } from 'react'

import { setCookieAction } from '@/lib/ui/set-organisation-cookie'

export default function SetOrganisationCookie({
  organisationSlug,
}: {
  organisationSlug: string
}) {
  useEffect(() => {
    setCookieAction(organisationSlug)
  }, [])

  return null // No UI needed
}
