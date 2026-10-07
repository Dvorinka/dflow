import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const segments = pathname.split('/') // ['', 'acme', 'dashboard']

  const organisation = segments[1]
  const hasSubPath = segments.length > 2 // ensure there's something after /[organisation]

  const excludedPaths = [
    '_next',
    'favicon.ico',
    '.well-known',
    'api',
    '_static',
    '_vercel',
    'images',
    'payload-admin',
    'sign-in',
    'sign-up',
  ]

  // If there's no organisation or path is excluded, skip further logic
  if (!organisation || excludedPaths.some(p => pathname.startsWith(`/${p}`))) {
    return NextResponse.next()
  }

  // Runs for valid org routes
  const response = NextResponse.next()

  if (hasSubPath) {
    response.cookies.set('organisation', organisation, {
      path: '/',
    })
  }

  return response
}

export const config = {
  matcher: [
    // simplified matcher to include all org paths (including ones with dots)
    '/((?!_next/|_vercel/|api/|_static/|payload-admin/|\\.well-known).*)',
  ],
}
