import axios from 'axios'
import { env } from 'env'

// NetBird management API client. Works against api.netbird.io or a
// self-hosted management plane (NETBIRD_API_URL=https://mgmt.example.com).
const netbird = axios.create({
  baseURL: env.NETBIRD_API_URL ?? 'https://api.netbird.io',
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    // NetBird PATs use `Token`, not `Bearer`
    Authorization: `Token ${env.NETBIRD_API_TOKEN ?? ''}`,
  },
})

export default netbird
