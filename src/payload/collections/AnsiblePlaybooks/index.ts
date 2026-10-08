import { CollectionConfig } from 'payload'

import { isAdmin } from '@/payload/access/isAdmin'

export const AnsiblePlaybooks: CollectionConfig = {
  slug: 'ansiblePlaybooks',
  trash: true,
  labels: {
    singular: 'Ansible Playbook',
    plural: 'Ansible Playbooks',
  },
  admin: {
    useAsTitle: 'name',
    description:
      'Versioned Ansible playbooks runnable against connected servers',
  },
  access: {
    read: isAdmin,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'description',
      type: 'textarea',
    },
    {
      name: 'playbook',
      label: 'Playbook (YAML)',
      type: 'textarea',
      required: true,
      admin: {
        description:
          'Full ansible-playbook YAML. Runs with the server\'s SSH user.',
      },
    },
    {
      name: 'servers',
      type: 'relationship',
      relationTo: 'servers',
      hasMany: true,
      admin: {
        description:
          'Restrict this playbook to specific servers. Empty = any server.',
      },
    },
  ],
}
