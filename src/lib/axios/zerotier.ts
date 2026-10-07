import axios from 'axios'
import { env } from 'env'

// ZeroTier Central API client. Works against api.zerotier.com or a
// self-hosted controller API (ZEROTIER_API_URL=http://controller:9993 or
// a ztnet frontend endpoint).
const zerotier = axios.create({
  baseURL: env.ZEROTIER_API_URL ?? 'https://api.zerotier.com/api/v1',
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `token ${env.ZEROTIER_API_TOKEN ?? ''}`,
  },
})

export default zerotier
