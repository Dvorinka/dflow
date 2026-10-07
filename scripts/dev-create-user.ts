import configPromise from '../src/payload.config'
import { getPayload } from 'payload'

async function main() {
  const payload = await getPayload({ config: configPromise })
  const email = 'demo@dflow.local'
  const existing = await payload.find({ collection: 'users', where: { email: { equals: email } }, limit: 1 })
  if (existing.docs.length) {
    console.log('user exists:', email)
  } else {
    const user = await payload.create({
      collection: 'users',
      data: { email, password: 'demo-password-123', username: 'demo', onboarded: true },
    })
    console.log('created:', user.id, email)
  }
  const tenants = await payload.find({ collection: 'tenants', pagination: false })
  console.log('tenants:', tenants.docs.map(t => t.slug))
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
