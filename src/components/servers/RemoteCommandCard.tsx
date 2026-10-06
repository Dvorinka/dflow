'use client'

import { Play, SquareTerminal } from 'lucide-react'
import { useAction } from 'next-safe-action/hooks'
import { useState } from 'react'
import { toast } from 'sonner'

import { executeCommandAction } from '@/actions/server'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

// One-shot remote command execution with visible output (#37, #416).
// Permission-gated servers.update; runs as the server's SSH user.
const RemoteCommandCard = ({ serverId }: { serverId: string }) => {
  const [command, setCommand] = useState('')
  const [output, setOutput] = useState<
    { code: number | null; stdout: string; stderr: string } | null
  >(null)

  const { execute, isPending } = useAction(executeCommandAction, {
    onSuccess: ({ data }) => {
      if (data?.success) {
        setOutput({
          code: data.code,
          stdout: data.stdout,
          stderr: data.stderr,
        })
      }
    },
    onError: ({ error }) => {
      toast.error(`Command failed: ${error.serverError}`)
    },
  })

  return (
    <Card>
      <CardHeader className='pb-4'>
        <CardTitle className='flex items-center gap-2 text-base font-medium'>
          <SquareTerminal className='h-4 w-4' />
          Remote Command
        </CardTitle>
      </CardHeader>
      <CardContent className='space-y-3'>
        <form
          className='flex gap-2'
          onSubmit={e => {
            e.preventDefault()
            if (command.trim()) execute({ serverId, command: command.trim() })
          }}>
          <Input
            value={command}
            onChange={e => setCommand(e.target.value)}
            placeholder='uptime'
            spellCheck={false}
            autoComplete='off'
            className='font-mono'
          />
          <Button type='submit' disabled={isPending || !command.trim()} isLoading={isPending}>
            <Play className='h-4 w-4' />
            Run
          </Button>
        </form>
        {output && (
          <pre
            className={`max-h-80 overflow-auto rounded-md border bg-muted/50 p-3 font-mono text-xs whitespace-pre-wrap ${
              output.code !== 0 ? 'border-destructive/50' : ''
            }`}>
            {output.stderr ? `${output.stderr}\n` : ''}
            {output.stdout || '(no output)'}
            {`\n[exit code: ${output.code}]`}
          </pre>
        )}
      </CardContent>
    </Card>
  )
}

export default RemoteCommandCard
