// DNS record-name helpers for the domain guidance tables (#115).
// Proxy subdomains (service.host.up.example.com) are relative to the proxy
// zone; custom domains fall back to stripping the registered domain.
export const getDnsRecordName = (
  domain: string,
  proxySuffix?: string,
): string => {
  const d = domain.trim().replace(/\.$/, '')

  if (proxySuffix) {
    const suffix = proxySuffix.trim().replace(/^\./, '').toLowerCase()
    if (suffix && d.toLowerCase().endsWith(`.${suffix}`)) {
      return d.slice(0, d.length - suffix.length - 1) || '@'
    }
  }

  const parts = d.split('.')
  return parts.length > 2 ? parts.slice(0, -2).join('.') : '@'
}
