import { NextResponse } from 'next/server'

import { env } from 'env'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(
    { version: env.NEXT_PUBLIC_APP_VERSION ?? 'dev' },
    { headers: { 'cache-control': 'no-store' } },
  )
}
