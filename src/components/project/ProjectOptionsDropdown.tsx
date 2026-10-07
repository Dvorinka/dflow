'use client'

import CreateService from '../service/CreateService'
import DeployTemplate from '../templates/DeployTemplate'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { EllipsisVertical, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'

import DeleteProjectDialog from '@/components/DeleteProjectDialog'
import { Project, Server, Service } from '@/payload-types'

import CreateTemplateFromProject from './CreateTemplateFromProject'
import UpdateProject from './CreateProject'

const ProjectOptionsDropdown = ({
  project,
  services,
  isServerConnected,
}: {
  project: Partial<Project>
  services: Service[]
  isServerConnected: boolean
}) => {
  const [open, setOpen] = useState(false)
  const [updateOpen, setUpdateOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const server =
    typeof project.server === 'object' && project.server
      ? (project.server as Server)
      : null

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger className='border-border hover:bg-accent h-10 w-10 rounded-md border text-center'>
          <EllipsisVertical className='mx-auto h-6 w-6' />
        </DropdownMenuTrigger>
        <DropdownMenuContent side='bottom' align='end'>
          <DropdownMenuGroup>
            <DropdownMenuItem onSelect={e => e.preventDefault()}>
              <DeployTemplate
                server={project.server as Server}
                disableDeployButton={!isServerConnected}
                disableReason={
                  'Cannot deploy template: Server is not connected'
                }
              />
            </DropdownMenuItem>
            {services?.length > 0 && (
              <>
                <DropdownMenuItem onSelect={e => e.preventDefault()}>
                  <CreateTemplateFromProject
                    services={services}
                    projectName={project?.name!}
                  />
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={e => e.preventDefault()}>
                  <CreateService
                    server={project.server as Server}
                    project={project}
                    disableCreateButton={!isServerConnected}
                    disableReason={
                      'Cannot create service: Server is not connected'
                    }
                  />
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuGroup>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            className='cursor-pointer'
            onClick={() => setUpdateOpen(true)}>
            <Pencil />
            Edit project
          </DropdownMenuItem>
          <DropdownMenuItem
            className='text-destructive focus:text-destructive cursor-pointer'
            onClick={() => setDeleteOpen(true)}>
            <Trash2 />
            Delete project
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <UpdateProject
        servers={server ? [server] : []}
        project={project as Project}
        title='Update Project'
        description='Update the project name, description or target server'
        type='update'
        manualOpen={updateOpen}
        setManualOpen={setUpdateOpen}
      />

      <DeleteProjectDialog
        project={project}
        open={deleteOpen}
        setOpen={setDeleteOpen}
        services={services}
        isServerConnected={isServerConnected}
      />
    </>
  )
}

export default ProjectOptionsDropdown
