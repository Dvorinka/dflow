'use client'

import { TriangleAlert } from 'lucide-react'
import { useAction } from 'next-safe-action/hooks'
import { useEffect } from 'react'

import { getSystemAlertsAction } from '@/actions/beszel'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Alert as BeszelAlert } from '@/lib/beszel/types'

// Visual-only Beszel alerts for the monitoring tab (#390). Silent when
// unconfigured or empty; never notifies.
const SystemAlerts = ({ systemId }: { systemId?: string | null }) => {
  const { execute, result, isPending } = useAction(getSystemAlertsAction)

  useEffect(() => {
    if (systemId) execute({ systemId })
  }, [systemId, execute])

  const alerts = (result?.data?.data ?? []) as BeszelAlert[]

  if (!systemId || isPending || !result?.data?.success || !alerts.length) {
    return null
  }

  return (
    <Alert variant='warning' className='mb-4'>
      <TriangleAlert className='h-4 w-4' />
      <AlertTitle>
        {alerts.length} active alert{alerts.length > 1 ? 's' : ''}
      </AlertTitle>
      <AlertDescription>
        <ul className='mt-1 space-y-1'>
          {alerts.map(alert => (
            <li key={alert.id} className='text-xs'>
              <span className='font-medium'>{alert.name}</span>
              {typeof alert.value === 'number' &&
                typeof alert.min === 'number' &&
                ` — value ${alert.value}, threshold ${alert.min}`}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  )
}

export default SystemAlerts
