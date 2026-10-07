import { GithubIcon } from 'lucide-react'

import {
  AmazonWebServices,
  Azure,
  DigitalOcean,
  Docker,
  GoogleCloudPlatform,
  Hetzner,
} from '@/components/icons'

export const integrationsList = [
  {
    label: 'Amazon Web Services',
    icon: AmazonWebServices,
    description: 'Manage your AWS account EC2 instances',
    live: true,
    slug: 'aws',
  },
  {
    label: 'Github',
    icon: GithubIcon,
    description:
      'Start deploying your applications by installing Github app on your account',
    live: true,
    slug: 'github',
  },
  {
    label: 'Docker Registry',
    icon: Docker,
    description: 'Deploy docker images from your preferred registries',
    live: true,
    slug: 'docker-registry',
  },
  {
    label: 'Hetzner Cloud',
    icon: Hetzner,
    description:
      'Provision and manage servers on Hetzner Cloud with an API token',
    live: true,
    slug: 'hetzner',
  },
] as const

export const cloudProvidersList = [
  {
    label: 'Amazon Web Services',
    Icon: AmazonWebServices,
    live: true,
    slug: 'aws',
  },
  {
    label: 'Hetzner Cloud',
    Icon: Hetzner,
    live: true,
    slug: 'hetzner',
  },
  {
    label: 'Google Cloud Platform',
    Icon: GoogleCloudPlatform,
    live: false,
    slug: 'gcp',
  },
  {
    label: 'Azure',
    Icon: Azure,
    live: false,
    slug: 'azure',
  },
  {
    label: 'DigitalOcean',
    Icon: DigitalOcean,
    live: false,
    slug: 'digitalocean',
  },
] as const
