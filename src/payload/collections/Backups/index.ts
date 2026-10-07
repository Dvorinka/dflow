import { CollectionConfig } from 'payload'

import { isAdmin } from '@/payload/access/isAdmin'

export const Backups: CollectionConfig = {
  slug: 'backups',
  trash: true,
  labels: {
    singular: 'Backup',
    plural: 'Backups',
  },
  access: {
    read: isAdmin,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  hooks: {},
  fields: [
    {
      name: 'service',
      relationTo: 'services',
      type: 'relationship',
      required: true,
      hasMany: false,
      admin: {
        description: 'Adding the service for which backup is related to',
      },
    },
    {
      name: 'type',
      type: 'select',
      options: [
        {
          label: 'External',
          value: 'external',
        },
        {
          label: 'Internal',
          value: 'internal',
        },
      ],
    },
    {
      name: 'backupName',
      label: 'Backup Name',
      type: 'text',
    },
    {
      // Denormalized at creation so backups stay identifiable after the
      // service is deleted (#483)
      name: 'databaseType',
      label: 'Database Type',
      type: 'text',
    },
    {
      // Where an external backup landed, e.g. "s3://dflow" (#407)
      name: 'destination',
      label: 'Destination',
      type: 'text',
    },
    {
      name: 'status',
      type: 'select',
      options: [
        {
          label: 'In Progress',
          value: 'in-progress',
        },
        {
          label: 'Failed',
          value: 'failed',
        },
        {
          label: 'Success',
          value: 'success',
        },
      ],
      required: true,
      defaultValue: 'in-progress',
    },
  ],
}
