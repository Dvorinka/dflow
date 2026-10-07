import { encryptedField } from '@oversightstudio/encrypted-fields'
import { CollectionConfig } from 'payload'

import { isAdmin } from '@/payload/access/isAdmin'

import { checkDuplicateCloudAccounts } from './hooks/checkDuplicateCloudAccounts'

export const CloudProviderAccounts: CollectionConfig = {
  slug: 'cloudProviderAccounts',
  trash: true,
  admin: {
    useAsTitle: 'name',
  },
  access: {
    read: isAdmin,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
    readVersions: isAdmin,
  },
  hooks: {
    beforeValidate: [checkDuplicateCloudAccounts],
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      label: 'Name',
      required: true,
    },
    {
      name: 'type',
      type: 'select',
      label: 'Type',
      options: [
        { label: 'AWS', value: 'aws' },
        { label: 'Azure', value: 'azure' },
        { label: 'Google Cloud Platform', value: 'gcp' },
        { label: 'Digital Ocean', value: 'digitalocean' },
        { label: 'Hetzner Cloud', value: 'hetzner' },
      ],
      required: true,
    },

    // AWS
    {
      name: 'awsDetails',
      type: 'group',
      admin: {
        condition: data => data.type === 'aws',
      },
      fields: [
        {
          name: 'authMethod',
          type: 'select',
          defaultValue: 'keys',
          options: [
            { label: 'Access keys', value: 'keys' },
            {
              label: 'Ambient credentials (instance role, OIDC, env)',
              value: 'ambient',
            },
          ],
        },
        encryptedField({
          name: 'accessKeyId',
          type: 'text',
          validate: (
            value: string | null | undefined,
            { siblingData }: any,
          ) => {
            if (siblingData?.authMethod === 'ambient') return true
            return value?.trim() ? true : 'Access Key ID is required'
          },
        }),
        encryptedField({
          name: 'secretAccessKey',
          type: 'text',
          validate: (
            value: string | null | undefined,
            { siblingData }: any,
          ) => {
            if (siblingData?.authMethod === 'ambient') return true
            return value?.trim() ? true : 'Secret Access Key is required'
          },
        }),
      ],
    },

    // GCP
    {
      name: 'gcpDetails',
      type: 'group',
      admin: {
        condition: data => data.type === 'gcp',
      },
      fields: [
        encryptedField({
          type: 'textarea',
          name: 'serviceAccountKey',
          required: true,
          admin: {
            description: 'Paste your GCP service account JSON key here',
          },
        }),
        encryptedField({
          name: 'projectId',
          type: 'text',
          required: true,
        }),
      ],
    },

    // DigitalOcean
    {
      name: 'digitaloceanDetails',
      type: 'group',
      admin: {
        condition: data => data.type === 'digitalocean',
      },
      fields: [
        encryptedField({
          name: 'accessToken',
          required: true,
          type: 'text',
          admin: {
            description: 'Personal Access Token from DigitalOcean API settings',
          },
        }),
      ],
    },

    // Hetzner Cloud
    {
      name: 'hetznerDetails',
      type: 'group',
      admin: {
        condition: data => data.type === 'hetzner',
      },
      fields: [
        encryptedField({
          name: 'apiToken',
          required: true,
          type: 'text',
          admin: {
            description:
              'Hetzner Cloud API token (Console → Project → Security → API tokens, read+write)',
          },
        }),
      ],
    },

    // Azure
    {
      name: 'azureDetails',
      type: 'group',
      admin: {
        condition: data => data.type === 'azure',
      },
      fields: [
        encryptedField({
          name: 'clientId',
          type: 'text',
          required: true,
        }),
        encryptedField({
          name: 'clientSecret',
          type: 'text',
          required: true,
        }),
        encryptedField({
          name: 'tenantId',
          type: 'text',
          required: true,
        }),
        encryptedField({
          name: 'subscriptionId',
          type: 'text',
          required: true,
        }),
      ],
    },
  ],
}
