'use client'

import { Button } from '../ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { useRouter } from '@bprogress/next'
import {
  EllipsisVertical,
  LayoutTemplate,
  Plus,
  SquarePen,
  Trash2,
} from 'lucide-react'
import { useAction } from 'next-safe-action/hooks'
import Image from 'next/image'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Fragment, useState } from 'react'
import { toast } from 'sonner'

import { deleteTemplateAction } from '@/actions/templates'
import { Card, CardContent } from '@/components/ui/card'
import { Template, Tenant } from '@/payload-types'

const TemplateCard = ({ template }: { template: Template }) => {
  const [open, setOpen] = useState(false)

  const router = useRouter()

  const { execute, isPending } = useAction(deleteTemplateAction, {
    onSuccess: ({ data }) => {
      if (data) {
        toast.success(`Template deleted successfully`)
        setOpen(false)
      }
    },
    onError: ({ error }) => {
      toast.error(`Failed to delete template: ${error.serverError}`)
    },
  })

  return (
    <Fragment>
      <Card>
        <CardContent className='relative flex h-56 flex-col justify-between p-6'>
          <div>
            <Image
              alt='Template Image'
              src={template?.imageUrl || '/images/favicon.ico'}
              width={40}
              height={40}
              className='h-10 w-10 rounded-md'
              unoptimized
            />

            <div className='mt-4 space-y-1'>
              <p className='line-clamp-1 text-lg font-semibold'>
                {template.name}
              </p>
              <p className='text-muted-foreground line-clamp-2 text-sm'>
                {template.description}
              </p>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger className='text-muted-foreground absolute top-4 right-4'>
              <EllipsisVertical size={20} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              <DropdownMenuItem
                onClick={() =>
                  router.push(
                    `/${(template?.tenant as Tenant)?.slug}/templates/compose?templateId=${template?.id}&type=personal`,
                  )
                }>
                <SquarePen size={20} />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setOpen(true)}>
                <Trash2 size={20} />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardContent>
      </Card>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Template</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this template? This action is
              permanent and cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              disabled={isPending}
              isLoading={isPending}
              onClick={() => {
                execute({ id: template.id })
              }}
              variant='destructive'>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Fragment>
  )
}

const PersonalTemplates = ({ templates }: { templates: Template[] }) => {
  const { organisation } = useParams()

  return (
    <section>
      {templates && templates?.length > 0 ? (
        <div className='mt-4 grid w-full grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3'>
          {templates.map(template => (
            <TemplateCard key={template.id} template={template} />
          ))}
        </div>
      ) : (
        <div className='bg-muted/10 rounded-2xl border p-8 text-center shadow-sm'>
          <div className='grid min-h-[20vh] place-items-center'>
            <div>
              <div className='bg-muted mx-auto flex h-16 w-16 items-center justify-center rounded-full'>
                <LayoutTemplate className='text-muted-foreground h-8 w-8 animate-pulse' />
              </div>

              <div className='my-4'>
                <h3 className='text-foreground text-xl font-semibold'>
                  No templates yet
                </h3>
                <p className='text-muted-foreground text-base'>
                  Create a template to reuse a set of services across projects
                </p>
              </div>

              <Link
                className='block'
                href={`/${organisation}/templates/compose`}>
                <Button className='mt-2'>
                  <Plus className='h-4 w-4' />
                  Create Template
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export default PersonalTemplates
