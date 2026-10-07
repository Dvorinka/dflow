import { Payload } from 'payload'

import { OFFICIAL_TEMPLATES } from '@/lib/officialTemplates'
import { Service } from '@/payload-types'

type TemplateType = {
  name: string
  description: string
  services: Service[]
}

// Local catalog lookup (#218) — the upstream dflow.sh template catalog is
// dead, so official templates are seeded into this instance's `templates`
// collection (type: 'official', tenant-less).
export async function fetchOfficialTemplateByName({
  name = '',
  payload,
}: {
  name: string
  payload: Payload
}) {
  const bundled = OFFICIAL_TEMPLATES.find(
    template => template.name.toLowerCase() === name.toLowerCase(),
  )
  if (bundled) {
    return {
      name: bundled.name,
      description: bundled.description,
      services: (bundled.services ?? []) as Service[],
    } as TemplateType
  }

  const { docs: templates } = await payload.find({
    collection: 'templates',
    pagination: false,
    depth: 3,
    where: {
      and: [
        {
          name: { equals: name },
        },
        {
          type: { equals: 'official' },
        },
      ],
    },
  })

  const template = templates[0]
  if (!template) return undefined

  return {
    name: template.name,
    description: template.description,
    services: (template.services ?? []) as Service[],
  } as TemplateType
}
