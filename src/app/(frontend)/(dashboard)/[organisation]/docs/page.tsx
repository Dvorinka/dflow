import { redirect } from 'next/navigation'

interface PageProps {
  params: Promise<{
    organisation: string
  }>
}

const DocsIndexPage = async ({ params }: PageProps) => {
  const { organisation } = await params

  redirect(`/${organisation}/docs/getting-started/introduction`)
}

export default DocsIndexPage
