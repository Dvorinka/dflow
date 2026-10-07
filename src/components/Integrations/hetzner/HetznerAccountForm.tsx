'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle, XCircle } from 'lucide-react'
import { useAction } from 'next-safe-action/hooks'
import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import {
  connectHetznerAccountAction,
  updateHetznerAccountAction,
} from '@/actions/cloud/hetzner'
import { connectHetznerAccountSchema } from '@/actions/cloud/hetzner/validator'
import { Alert, AlertDescription } from '@/components/ui/alert'
import SecretContent from '@/components/ui/blur-reveal'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { CloudProviderAccount } from '@/payload-types'

type RefetchType = (input: {
  type: 'aws' | 'azure' | 'gcp' | 'digitalocean' | 'hetzner'
}) => void

const HetznerAccountForm = ({
  children,
  account,
  refetch,
}: {
  children: React.ReactNode
  account?: CloudProviderAccount
  refetch?: RefetchType
}) => {
  const dialogFooterRef = useRef<HTMLButtonElement>(null)
  const [validationError, setValidationError] = useState<string | null>(null)

  const { execute: connectAccount, isPending: connectingAccount } = useAction(
    connectHetznerAccountAction,
    {
      onSuccess: ({ data }) => {
        toast.success('Hetzner account connected')
        if (data?.id) {
          refetch?.({ type: 'hetzner' })
          dialogFooterRef.current?.click()
        }
      },
      onError: ({ error }) => {
        setValidationError(
          error.serverError || 'Failed to connect Hetzner account',
        )
      },
    },
  )

  const { execute: updateAccount, isPending: updatingAccount } = useAction(
    updateHetznerAccountAction,
    {
      onSuccess: ({ data }) => {
        toast.success('Hetzner account updated')
        if (data?.id) {
          refetch?.({ type: 'hetzner' })
          dialogFooterRef.current?.click()
        }
      },
      onError: ({ error }) => {
        setValidationError(
          error.serverError || 'Failed to update Hetzner account',
        )
      },
    },
  )

  const form = useForm<z.infer<typeof connectHetznerAccountSchema>>({
    resolver: zodResolver(connectHetznerAccountSchema),
    defaultValues: {
      name: account?.name ?? '',
      apiToken: account?.hetznerDetails?.apiToken ?? '',
    },
  })

  const handleDialogOpenChange = (open: boolean) => {
    if (!open) {
      form.reset()
      setValidationError(null)
    }
  }

  function onSubmit(values: z.infer<typeof connectHetznerAccountSchema>) {
    setValidationError(null)

    if (account) {
      updateAccount({ id: account.id, ...values })
    } else {
      connectAccount({ ...values })
    }
  }

  return (
    <Dialog onOpenChange={handleDialogOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>

      <DialogContent className='sm:max-w-lg'>
        <DialogHeader className='space-y-3'>
          <DialogTitle className='text-xl'>
            {account ? 'Edit Hetzner Account' : 'Connect Hetzner Account'}
          </DialogTitle>
          <DialogDescription className='text-muted-foreground text-sm'>
            Create a read+write API token in the Hetzner Cloud Console under
            your project&apos;s Security → API tokens.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>
            {validationError && (
              <Alert variant='destructive'>
                <XCircle className='h-4 w-4' />
                <AlertDescription>
                  <p className='text-sm opacity-90'>{validationError}</p>
                </AlertDescription>
              </Alert>
            )}

            <div className='space-y-4'>
              <FormField
                control={form.control}
                name='name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className='text-sm font-medium'>
                      Account Name
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder='My Hetzner project'
                        className='h-10'
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='apiToken'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className='text-sm font-medium'>
                      API Token
                    </FormLabel>
                    <FormControl>
                      <SecretContent defaultHide={!!account}>
                        <Input
                          {...field}
                          placeholder='64-char API token'
                          className='h-10'
                        />
                      </SecretContent>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter className='flex-col gap-4 sm:flex-row sm:justify-end'>
              <Button
                type='submit'
                isLoading={connectingAccount || updatingAccount}
                disabled={connectingAccount || updatingAccount}
              >
                <CheckCircle className='mr-2 h-4 w-4' />
                {account ? 'Save Account' : 'Connect Account'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

export default HetznerAccountForm
