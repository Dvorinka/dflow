import { CollectionConfig } from 'payload'

import { isAdmin } from '@/payload/access/isAdmin'

export const AnsibleExecutions: CollectionConfig = {
  slug: 'ansibleExecutions',
  trash: true,
  labels: {
    singular: 'Ansible Execution',
    plural: 'Ansible Executions',
  },
  admin: {
    useAsTitle: 'id',
    defaultColumns: ['playbook', 'server', 'status', 'createdAt'],
    description: 'Execution log of Ansible playbook runs',
  },
  access: {
    read: isAdmin,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  fields: [
    {
      name: 'playbook',
      type: 'relationship',
      relationTo: 'ansiblePlaybooks',
      required: true,
    },
    {
      name: 'server',
      type: 'relationship',
      relationTo: 'servers',
      required: true,
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'queued',
      options: [
        { label: 'Queued', value: 'queued' },
        { label: 'Running', value: 'running' },
        { label: 'Success', value: 'success' },
        { label: 'Failed', value: 'failed' },
      ],
    },
    {
      name: 'output',
      type: 'textarea',
      admin: {
        description: 'ansible-playbook stdout/stderr',
      },
    },
    {
      name: 'exitCode',
      type: 'number',
    },
    {
      name: 'startedAt',
      type: 'date',
    },
    {
      name: 'completedAt',
      type: 'date',
    },
  ],
}
