'use client'

import { Docker } from '../icons'
import { Button } from '../ui/button'
import {
  AlertCircle,
  ArrowDownUp,
  CheckCircle,
  Clock,
  Code,
  Database,
  Eye,
  EyeOff,
  FileCode2,
  Filter,
  Globe,
  LayoutGrid,
  List,
  Pause,
  Play,
  Server as ServerIcon,
  Settings,
  Zap,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import Link from 'next/link'
import { useMemo, useState } from 'react'

import { DynamicFilterPanel } from '@/components/DynamicFilter/DynamicFilterPanel'
import { useDynamicFilter } from '@/components/DynamicFilter/useDynamicFilter'
import { ProjectCard } from '@/components/ProjectCard'
import { serviceIcon } from '@/components/service/serviceIcon'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { FilterConfig } from '@/lib/filter.utils'
import { Project, Server, Service } from '@/payload-types'

interface ProjectFiltersProps {
  projects: Project[]
  hiddenProjects: Project[]
  servers: Server[]
  organisationSlug: string
}

// Filter options configuration
const filterConfig = {
  status: [
    { value: 'running', label: 'Running', icon: Play },
    { value: 'stopped', label: 'Stopped', icon: Pause },
    {
      value: 'missing',
      label: 'Missing',
      icon: AlertCircle,
    },
    { value: 'exited', label: 'Exited', icon: Clock },
    {
      value: 'healthy',
      label: 'Healthy',
      icon: CheckCircle,
    },
  ],
  serviceType: [
    { value: 'app', label: 'Application', icon: Globe },
    { value: 'database', label: 'Database', icon: Database },
    { value: 'docker', label: 'Docker', icon: Docker },
  ],
  builder: [
    { value: 'buildPacks', label: 'Build Packs', icon: Settings },
    { value: 'railpack', label: 'Railpack', icon: Code },
    { value: 'nixpacks', label: 'Nixpacks', icon: Zap },
    { value: 'dockerfile', label: 'Dockerfile', icon: Docker },
    {
      value: 'herokuBuildPacks',
      label: 'Heroku Build Packs',
      icon: Settings,
    },
    {
      value: 'static',
      label: 'Static Build',
      icon: FileCode2,
    },
  ],
  provider: [
    { value: 'digitalocean', label: 'DigitalOcean', icon: ServerIcon },
    { value: 'aws', label: 'AWS', icon: ServerIcon },
    { value: 'gcp', label: 'Google Cloud', icon: ServerIcon },
    { value: 'azure', label: 'Azure', icon: ServerIcon },
    { value: 'other', label: 'Other', icon: ServerIcon },
  ],
  visibility: [
    { value: 'visible', label: 'Visible', icon: Eye },
    { value: 'hidden', label: 'Hidden', icon: EyeOff },
  ],
  hasServices: [
    { value: 'with-services', label: 'Has Services', icon: CheckCircle },
    { value: 'empty', label: 'No Services', icon: AlertCircle },
  ],
  dateRange: [
    { value: 'today', label: 'Today' },
    { value: 'week', label: 'This Week' },
    { value: 'month', label: 'This Month' },
    { value: 'quarter', label: 'This Quarter' },
    { value: 'year', label: 'This Year' },
  ],
}

const ProjectFiltersSection = ({
  projects,
  hiddenProjects,
  servers,
  organisationSlug,
}: ProjectFiltersProps) => {
  const allProjects = useMemo(
    () => [...projects, ...hiddenProjects],
    [projects, hiddenProjects],
  )

  const getProjectServices = (project: Project): Service[] => {
    if (!project.services) return []
    if (Array.isArray(project.services)) return project.services
    if (project.services && 'docs' in project.services) {
      return project.services.docs as Service[]
    }
    return []
  }

  const filterSchema: FilterConfig<Project>[] = useMemo(
    () => [
      {
        key: 'search',
        label: 'Search',
        type: 'search',
        searchable: ['name', 'description'],
        customExtractor: (project: Project) => {
          return `${project.name || ''} ${project.description || ''}`.toLowerCase()
        },
      },
      {
        key: 'status',
        label: 'Service Status',
        type: 'multiselect',
        category: 'services',
        options: filterConfig.status,
        customExtractor: (project: Project) => {
          const services = getProjectServices(project)
          const databaseServices = services.filter(
            service => service.type === 'database',
          )
          return databaseServices
            .map(service => service.databaseDetails?.status)
            .filter(Boolean) as string[]
        },
      },
      {
        key: 'serviceType',
        label: 'Service Type',
        type: 'multiselect',
        category: 'services',
        options: filterConfig.serviceType,
        customExtractor: (project: Project) => {
          const services = getProjectServices(project)
          return services
            .map(service => service.type)
            .filter(Boolean) as string[]
        },
      },
      {
        key: 'builder',
        label: 'Builder',
        type: 'multiselect',
        category: 'services',
        options: filterConfig.builder,
        customExtractor: (project: Project) => {
          const services = getProjectServices(project)
          return services
            .map(service => service.builder)
            .filter(Boolean) as string[]
        },
      },
      {
        key: 'server',
        label: 'Server',
        type: 'select',
        category: 'infrastructure',
        options: [
          ...servers.map(server => ({
            value: server.id,
            label: server.name || server.id,
            icon: ServerIcon,
          })),
        ],
        customExtractor: (project: Project) => {
          return typeof project.server === 'string'
            ? project.server
            : project.server?.id
        },
      },
      {
        key: 'provider',
        label: 'Cloud Provider',
        type: 'multiselect',
        category: 'infrastructure',
        options: filterConfig.provider,
        customExtractor: (project: Project) => {
          const serverId =
            typeof project.server === 'string'
              ? project.server
              : project.server?.id
          const server = servers.find(s => s.id === serverId)
          return server?.provider || 'other'
        },
      },
      {
        key: 'dateRange',
        label: 'Created',
        type: 'date_range',
        category: 'metadata',
        customExtractor: (project: Project) => project.createdAt,
      },
      {
        key: 'hasServices',
        label: 'Services',
        type: 'multiselect',
        category: 'services',
        options: filterConfig.hasServices,
        customExtractor: (project: Project) => {
          const services = getProjectServices(project)
          return services.length > 0 ? 'with-services' : 'empty'
        },
      },
    ],
    [servers],
  )

  const {
    filteredData: filteredProjects,
    filters,
    setFilters,
    schema: enrichedSchema,
    activeFilterCount,
    activeFilters,
    clearAllFilters,
    removeFilter,
    updateFilter,
  } = useDynamicFilter<Project>({
    data: allProjects,
    schema: filterSchema,
    autoGenerateSchema: false,
  })

  const [sortMode, setSortMode] = useState<'recent' | 'created' | 'name'>(
    'recent',
  )
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  const sortedProjects = useMemo(() => {
    const items = [...filteredProjects]
    if (sortMode === 'name') {
      items.sort((a, b) => a.name.localeCompare(b.name))
    } else if (sortMode === 'created') {
      items.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
    } else {
      items.sort(
        (a, b) =>
          new Date(b.updatedAt ?? b.createdAt).getTime() -
          new Date(a.updatedAt ?? a.createdAt).getTime(),
      )
    }
    return items
  }, [filteredProjects, sortMode])

  return (
    <div className='space-y-4'>
      <DynamicFilterPanel
        data={allProjects}
        schema={enrichedSchema}
        filters={filters}
        onFiltersChange={setFilters}
      />

      {filteredProjects.length > 0 && (
        <div className='flex items-center justify-end gap-2'>
          <Select
            value={sortMode}
            onValueChange={value =>
              setSortMode(value as typeof sortMode)
            }>
            <SelectTrigger className='h-8 w-44 gap-1.5 text-xs'>
              <ArrowDownUp size={13} className='text-muted-foreground' />
              <SelectValue />
            </SelectTrigger>
            <SelectContent align='end'>
              <SelectItem value='recent'>Recent activity</SelectItem>
              <SelectItem value='created'>Creation date</SelectItem>
              <SelectItem value='name'>Alphabetical</SelectItem>
            </SelectContent>
          </Select>

          <div className='border-border flex overflow-hidden rounded-md border'>
            <button
              type='button'
              title='Grid view'
              onClick={() => setViewMode('grid')}
              className={cn(
                'px-2 py-1.5',
                viewMode === 'grid'
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}>
              <LayoutGrid size={14} />
            </button>
            <button
              type='button'
              title='List view'
              onClick={() => setViewMode('list')}
              className={cn(
                'border-border border-l px-2 py-1.5',
                viewMode === 'list'
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}>
              <List size={14} />
            </button>
          </div>
        </div>
      )}

      <div className='space-y-4'>
        {sortedProjects.length > 0 ? (
          viewMode === 'grid' ? (
            <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
              <AnimatePresence mode='popLayout'>
                {sortedProjects.map((project, index) => {
                  const services = getProjectServices(project)

                  return (
                    <motion.div
                      key={project.id}
                      initial={{
                        opacity: 0,
                        y: 20,
                      }}
                      animate={{
                        opacity: 1,
                        y: 0,
                      }}
                      exit={{
                        opacity: 0,
                        y: -20,
                        transition: { duration: 0.2 },
                      }}
                      transition={{
                        duration: 0.4,
                        delay: index * 0.05,
                        ease: [0.22, 1, 0.36, 1],
                      }}>
                      <ProjectCard
                        organisationSlug={organisationSlug}
                        project={project}
                        servers={servers}
                        services={services}
                      />
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>
          ) : (
            <div className='border-border divide-border overflow-hidden rounded-md border divide-y'>
              {sortedProjects.map(project => {
                const services = getProjectServices(project)

                return (
                  <Link
                    key={project.id}
                    href={`/${organisationSlug}/dashboard/project/${project.id}`}
                    className='hover:bg-muted/40 flex items-center gap-4 px-4 py-3'>
                    <div className='bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-md'>
                      {project.name.charAt(0).toUpperCase()}
                    </div>
                    <div className='min-w-0 flex-1'>
                      <p className='truncate text-sm font-medium'>
                        {project.name}
                      </p>
                      <p className='text-muted-foreground truncate text-xs'>
                        {project.description || 'No description'}
                      </p>
                    </div>
                    <div className='flex shrink-0 items-center -space-x-1'>
                      {services.slice(0, 4).map(service => (
                        <span
                          key={service.id}
                          className='bg-muted ring-background flex size-6 items-center justify-center rounded-full ring-2'
                          title={service.name}>
                          {serviceIcon(service, 'size-3')}
                        </span>
                      ))}
                      {services.length === 0 && (
                        <span className='text-muted-foreground text-xs'>
                          No services
                        </span>
                      )}
                    </div>
                    <span className='text-muted-foreground hidden w-24 shrink-0 text-right text-xs sm:block'>
                      {services.length} service{services.length === 1 ? '' : 's'}
                    </span>
                  </Link>
                )
              })}
            </div>
          )
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className='bg-muted/10 rounded-lg border border-dashed p-8 text-center'>
            <div className='bg-muted mx-auto flex h-12 w-12 items-center justify-center rounded-full'>
              <Filter className='text-muted-foreground h-6 w-6' />
            </div>
            <h3 className='mt-4 text-lg font-semibold'>
              No projects match your filters
            </h3>
            <p className='text-muted-foreground mt-2'>
              Try adjusting your search criteria or clearing some filters.
            </p>
            <Button
              variant='outline'
              onClick={clearAllFilters}
              className='mt-4'>
              Clear all filters
            </Button>
          </motion.div>
        )}
      </div>
    </div>
  )
}

export default ProjectFiltersSection
