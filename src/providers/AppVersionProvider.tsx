'use client'

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'

const POLL_INTERVAL_MS = 5 * 60 * 1000

// Toasts once when the deployed build changes under a running tab (#374).
// Set NEXT_PUBLIC_APP_VERSION at build time (e.g. git SHA); unset means
// "unknown" and the check stays silent.
export const AppVersionProvider = ({
  children,
  initialVersion,
}: {
  children: React.ReactNode
  initialVersion: string
}) => {
  const notifiedRef = useRef(false)

  useEffect(() => {
    if (!initialVersion || initialVersion === 'dev') return

    const check = async () => {
      if (notifiedRef.current || document.hidden) return
      try {
        const res = await fetch('/api/version', { cache: 'no-store' })
        if (!res.ok) return
        const { version } = (await res.json()) as { version?: string }
        if (version && version !== 'dev' && version !== initialVersion) {
          notifiedRef.current = true
          toast.info('A new version is available', {
            description: 'Refresh to use the latest build.',
            duration: Infinity,
            action: {
              label: 'Refresh',
              onClick: () => window.location.reload(),
            },
          })
        }
      } catch {
        // Version check is best-effort; never interrupt the user.
      }
    }

    const onVisible = () => {
      if (!document.hidden) void check()
    }

    const timer = setInterval(check, POLL_INTERVAL_MS)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [initialVersion])

  return <>{children}</>
}
