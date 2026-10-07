import LayoutClient from '@/app/(frontend)/(dashboard)/[organisation]/layout.client'

import { getAddServerDetails } from '@/actions/pages/server'
import ServerForm from '@/components/servers/ServerForm'

const SuspendedAddNewServerPage = async () => {
  const result = await getAddServerDetails()

  const sshKeys = result?.data?.sshKeys ?? []
  const securityGroups = result?.data?.securityGroups ?? []

  return (
    <ServerForm
      sshKeys={sshKeys}
      securityGroups={securityGroups}
      formType='create'
    />
  )
}

const AddNewServerPage = async () => {
  return (
    <LayoutClient>
      <SuspendedAddNewServerPage />
    </LayoutClient>
  )
}

export default AddNewServerPage
