'use client'

import { Ellipsis, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'

import DeleteProjectDialog from '@/components/DeleteProjectDialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Project, Server, Service } from '@/payload-types'

import UpdateProject from './CreateProject'

const ProjectSettingsMenu = ({
  project,
  services,
  isServerConnected,
}: {
  project: Partial<Project>
  services: Service[]
  isServerConnected: boolean
}) => {
  const [updateOpen, setUpdateOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const server =
    typeof project.server === 'object' && project.server
      ? (project.server as Server)
      : null

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant='outline' size='icon' title='Project settings'>
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align='end'>
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

export default ProjectSettingsMenu
