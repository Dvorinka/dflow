'use client'

import { ReactNode, createContext, useContext, useMemo } from 'react'
import { toast } from 'sonner'

import { useCrossDomainAuth } from '@/hooks/useCrossDomainAuth'

interface CrossDomainAuthContextType {
  crossDomainLogout: (redirectUrl?: string) => Promise<void>
  crossDomainLoginSync: (token?: string, redirectUrl?: string) => Promise<void>
  // Redirect-chain URLs (null when no sync domains configured). Prefer
  // these over the iframe variants — first-party navigation actually
  // persists the cookie on the sibling domain (#364).
  loginSyncRedirectUrl: (token: string, returnUrl: string) => string | null
  logoutSyncRedirectUrl: (returnUrl: string) => string | null
}

const CrossDomainAuthContext = createContext<CrossDomainAuthContextType | null>(
  null,
)

interface CrossDomainAuthProviderProps {
  children: ReactNode
  domains: string[]
  config?: {
    logoutEndpoint?: string
    loginEndpoint?: string
    timeout?: number
  }
}

export function CrossDomainAuthProvider({
  children,
  domains,
  config = {},
}: CrossDomainAuthProviderProps) {
  const {
    crossDomainLogout,
    crossDomainLoginSync,
    loginSyncRedirectUrl,
    logoutSyncRedirectUrl,
  } = useCrossDomainAuth({
    domains,
    ...config,
    onSuccess: () => {
      if (domains.length > 0) {
        toast.success('Authentication synced across domains')
      }
    },
    onError: error => {
      console.error('Cross-domain auth error:', error)
      toast.error('Failed to sync authentication across some domains')
    },
  })

  // Memoize the context value to prevent unnecessary re-renders
  const value = useMemo(
    () => ({
      crossDomainLogout,
      crossDomainLoginSync,
      loginSyncRedirectUrl,
      logoutSyncRedirectUrl,
    }),
    [
      crossDomainLogout,
      crossDomainLoginSync,
      loginSyncRedirectUrl,
      logoutSyncRedirectUrl,
    ],
  )

  return (
    <CrossDomainAuthContext.Provider value={value}>
      {children}
    </CrossDomainAuthContext.Provider>
  )
}

export function useCrossDomainAuthContext() {
  const context = useContext(CrossDomainAuthContext)
  if (!context) {
    throw new Error(
      'useCrossDomainAuthContext must be used within CrossDomainAuthProvider',
    )
  }
  return context
}
