'use client'

import {
  Database,
  Folder,
  HardDrive,
  LayoutDashboard,
  Package,
  ScrollText,
  Search,
  Server as ServerIcon,
  Shield,
  Users,
  Workflow,
} from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

import { getProjectsAndServers } from '@/actions/pages/dashboard'
import { serviceIcon } from '@/components/service/serviceIcon'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { Project, Server, Service } from '@/payload-types'

const pages = [
  { label: 'Dashboard', slug: '/dashboard', icon: LayoutDashboard },
  { label: 'Servers', slug: '/servers', icon: ServerIcon },
  { label: 'Security', slug: '/security', icon: Shield },
  { label: 'Integrations', slug: '/integrations', icon: Workflow },
  { label: 'Backups', slug: '/backups', icon: HardDrive },
  { label: 'Templates', slug: '/templates', icon: Package },
  { label: 'Team', slug: '/team', icon: Users },
  {
    label: 'Docs',
    slug: '/docs/getting-started/introduction',
    icon: ScrollText,
  },
]

const CommandPalette = () => {
  const [open, setOpen] = useState(false)
  const [projects, setProjects] = useState<Project[]>([])
  const [servers, setServers] = useState<Pick<Server, 'id' | 'name'>[]>([])
  const loadedRef = useRef(false)
  const router = useRouter()
  const params = useParams<{ organisation: string }>()
  const org = params.organisation

  const load = useCallback(async () => {
    if (loadedRef.current) return
    loadedRef.current = true
    const result = await getProjectsAndServers()
    if (result?.data) {
      setProjects(result.data.projectsRes.docs)
      setServers(result.data.serversRes.docs)
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  const go = (href: string) => {
    setOpen(false)
    router.push(href)
  }

  const serviceEntries = projects.flatMap(project => {
    const raw = project.services
    const docs = Array.isArray(raw)
      ? raw
      : raw && typeof raw === 'object' && 'docs' in raw
        ? (raw.docs ?? [])
        : []
    const services = docs.filter(
      (s): s is Service => typeof s === 'object' && s !== null,
    )
    return services.map(service => ({ project, service }))
  })

  return (
    <>
      <button
        type='button'
        onClick={() => setOpen(true)}
        className='border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 hidden items-center gap-2 rounded-md border px-3 py-1.5 text-xs transition-colors sm:flex'>
        <Search size={13} />
        <span>Search</span>
        <kbd className='border-border bg-muted rounded border px-1 text-[10px]'>
          ⌘K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder='Search projects, services, servers…' />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>

          <CommandGroup heading='Pages'>
            {pages.map(({ label, slug, icon: Icon }) => (
              <CommandItem
                key={slug}
                value={`page ${label}`}
                onSelect={() => go(`/${org}${slug}`)}>
                <Icon className='text-muted-foreground' />
                {label}
              </CommandItem>
            ))}
          </CommandGroup>

          {projects.length > 0 && (
            <CommandGroup heading='Projects'>
              {projects.map(project => (
                <CommandItem
                  key={project.id}
                  value={`project ${project.name}`}
                  onSelect={() =>
                    go(`/${org}/dashboard/project/${project.id}`)
                  }>
                  <Folder className='text-muted-foreground' />
                  {project.name}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {serviceEntries.length > 0 && (
            <CommandGroup heading='Services'>
              {serviceEntries.map(({ project, service }) => (
                <CommandItem
                  key={service.id}
                  value={`service ${service.name} ${project.name}`}
                  onSelect={() =>
                    go(
                      `/${org}/dashboard/project/${project.id}/service/${service.id}`,
                    )
                  }>
                  {serviceIcon(service, 'size-4')}
                  <span>{service.name}</span>
                  <span className='text-muted-foreground ml-2 text-xs'>
                    {project.name}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {servers.length > 0 && (
            <CommandGroup heading='Servers'>
              {servers.map(server => (
                <CommandItem
                  key={server.id}
                  value={`server ${server.name}`}
                  onSelect={() => go(`/${org}/servers/${server.id}`)}>
                  <ServerIcon className='text-muted-foreground' />
                  {server.name}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          <CommandSeparator />

          <CommandGroup heading='Actions'>
            <CommandItem
              value='create project new'
              onSelect={() => go(`/${org}/dashboard`)}>
              <Folder className='text-muted-foreground' />
              Create Project
            </CommandItem>
            <CommandItem
              value='add server new'
              onSelect={() => go(`/${org}/servers/add-new-server`)}>
              <ServerIcon className='text-muted-foreground' />
              Add Server
            </CommandItem>
            <CommandItem
              value='database create new'
              onSelect={() => go(`/${org}/dashboard`)}>
              <Database className='text-muted-foreground' />
              Create Database
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  )
}

export default CommandPalette
