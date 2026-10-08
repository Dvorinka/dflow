---
title: 'Ansible Automation'
category: 'Servers'
order: 6
categoryOrder: 3
---

# Ansible Automation

dFlow can run Ansible playbooks against any connected server — use them to
standardize provisioning, install extra tooling, or apply repeatable
configuration without SSHing in by hand.

## Playbooks

On a server's **General** tab, the **Ansible Playbooks** card lists saved
playbooks. Click **New playbook**, give it a name, and paste the YAML.

Playbooks are stored per-tenant and versioned through the Payload admin
panel (`ansiblePlaybooks` collection), where admins can also restrict a
playbook to specific servers.

## Running a playbook

Select a playbook in the card and click **Run**. dFlow generates an
inventory from the server's stored SSH details (host, port, user, private
key), runs `ansible-playbook` on the dFlow host, and streams output to the
server's queue logs.

Each run is recorded in the **Ansible Executions** log below the picker —
status, exit code, and full output are kept for review.

## Requirements

- `ansible-playbook` must exist on the dFlow host. The official Docker
  image ships `ansible-core`; bare-metal installs need Ansible installed
  separately.
- The server's SSH user needs sufficient privileges for the playbook's
  tasks (use `become: true` in the playbook for sudo).
- Tailscale-connected servers use the local tailnet resolution — Ansible
  connects via the server hostname.

## Example

```yaml
- hosts: servers
  become: true
  tasks:
    - name: Install fail2ban
      apt:
        name: fail2ban
        state: present
```
