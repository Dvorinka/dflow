---
title: 'Add Server'
category: 'Servers'
order: 2
categoryOrder: 3
---

# Add Server

You can provision a new server directly from your dashboard using a supported
cloud provider.

## Supported Cloud Providers

We currently support the following providers, each with their own configuration
steps:

- **Amazon Web Services (AWS)**  
  Provision EC2 instances using your linked AWS accounts. Ideal for scalable
  infrastructure and region-based deployments.  
  ➝ [View AWS setup](<./add-server-(aws)>)

- **Google Cloud Platform (GCP)** _(coming soon)_  
  Launch and manage Compute Engine instances with your GCP credentials. Best for
  teams already using Google Cloud services.

- **Microsoft Azure** _(coming soon)_  
  Create and manage virtual machines using Azure. Seamless integration with
  Microsoft tools and enterprise solutions.

- **DigitalOcean** _(coming soon)_  
  Spin up droplets with ease. Great for quick deployments, hobby projects, and
  developer-friendly infrastructure.

## Manual & Private-Network Servers

You can also attach a server you already own. Three connection modes are
available under **Add Server Manually**:

- **Tailscale** — generate an auth key and enrol the server into your
  tailnet; dFlow connects over MagicDNS.
- **NetBird** — generate (or paste) a setup key and enrol the server into
  a NetBird network, hosted on `api.netbird.io` or self-hosted. dFlow
  connects over the peer's mesh IP. Set `NETBIRD_API_TOKEN` (and
  `NETBIRD_API_URL`/`NETBIRD_MANAGEMENT_URL` for self-hosted) to enable
  key generation and peer resolution from the dashboard.
- **Public** — any server reachable over SSH on a public IP.

## Getting Started

To add a server:

1. Choose your preferred provider or connection mode.
2. Follow the specific setup instructions shown in the form.
3. Once the server is created, it will be automatically connected to your
   project for deployments and management.

> Detailed steps for each provider are available in their respective
> documentation pages.
