import axios from 'axios'

// Hetzner Cloud API client factory — the token lives on the tenant's
// cloudProviderAccounts document, not in env, so a client is built per call.
export const hetznerClient = (apiToken: string) =>
  axios.create({
    baseURL: 'https://api.hetzner.cloud/v1',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiToken}`,
    },
    timeout: 15000,
  })

export const hetznerError = (error: any, fallback: string): Error => {
  const apiError = error.response?.data?.error
  if (apiError?.message) {
    return new Error(`${fallback}: ${apiError.message}`)
  }
  return new Error(`${fallback}: ${error.message || 'unknown error'}`)
}
