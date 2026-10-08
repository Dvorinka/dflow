export const getActionAccess = {
  // Servers actions
  getServersWithFieldsAction: ['servers.read'],
  createServerAction: ['servers.create'],
  createTailscaleServerAction: ['servers.create'],
  updateTailscaleServerAction: ['servers.update'],
  updateServerAction: ['servers.update'],
  deleteServerAction: ['servers.delete'],
  installDokkuAction: ['servers.read', 'servers.update'],
  updateServerDomainAction: ['servers.read', 'servers.update'],
  installRailpackAction: ['servers.read', 'servers.update'],
  dokkuBackupAction: ['servers.read', 'servers.update'],
  updateRailpackAction: ['servers.update'],
  completeServerOnboardingAction: ['servers.read', 'servers.update'],
  getServersAction: ['servers.read'],
  checkDNSConfigAction: ['servers.read'],
  syncServerDomainAction: ['servers.read', 'servers.update'],
  checkServerConnection: ['servers.read'],
  configureGlobalBuildDirAction: ['servers.read', 'servers.update'],
  resetServerAction: ['servers.read', 'servers.update'],
  syncServerAppsAction: ['servers.read'],
  executeCommandAction: ['servers.update'],
  getDanglingVolumesAction: ['servers.read'],
  deleteDanglingVolumeAction: ['servers.update'],
  attachDanglingVolumeAction: ['servers.update', 'services.update'],
  updateDokkuAction: ['servers.read', 'servers.update'],
  resetServerOnboardingAction: ['servers.read', 'servers.update'],
  cleanupServerAction: ['servers.read', 'servers.update'],
  setServerAutoCleanupAction: ['servers.read', 'servers.update'],
  getServersDetailsAction: ['servers.read'],
  getAddServerDetails: ['sshKeys.read', 'securityGroups.read'],
  getServerBreadcrumbs: ['servers.read'],
  getServerProjects: ['projects.read'],
  getServerGeneralTabDetails: [
    'sshKeys.read',
    'projects.read',
    'securityGroups.read',
  ],
  updateServerResourceLimitsAction: ['servers.update'],

  // Plugin actions
  installPluginAction: ['servers.update'],
  installCustomPluginAction: ['servers.update'],  syncPluginAction: ['servers.read', 'servers.update'],
  togglePluginStatusAction: ['servers.update'],
  deletePluginAction: ['servers.update'],
  configureLetsencryptPluginAction: ['servers.update'],
  installAndConfigureLetsencryptPluginAction: ['servers.update'],

  // Templates actions
  getTemplateByIdAction: ['templates.read'],
  createTemplateAction: ['templates.create'],
  deleteTemplateAction: ['templates.delete', 'cloudProviderAccounts.read'],
  updateTemplateAction: ['templates.update'],
  getPersonalTemplatesAction: ['templates.read'],
  publishTemplateAction: [
    'templates.update',
    'cloudProviderAccounts.read',
    'templates.read',
  ],

  unPublishTemplateAction: [
    'templates.update',
    'cloudProviderAccounts.read',
    'templates.read',
  ],

  syncWithPublicTemplateAction: [
    'templates.update',
    'cloudProviderAccounts.read',
    'templates.read',
  ],
  templateDeployAction: ['projects.create', 'services.create', 'servers.read'],

  // roles actions
  getRolesAction: ['roles.read'],
  createRoleAction: ['roles.create'],
  updateRolePermissionsAction: ['roles.update'],
  deleteRoleAction: ['roles.delete'],

  // teams actions
  getTeamMembersAction: ['team.read'],
  getTenantAction: ['team.read'],
  updateUserTenantRolesAction: ['team.update'],
  removeUserFromTeamAction: ['team.delete'],
  generateInviteLinkAction: ['team.update'],

  // cloud provider account actions
  getCloudProvidersAccountsAction: ['cloudProviderAccounts.read'],

  // AWS cloud actions
  createEC2InstanceAction: [
    'cloudProviderAccounts.read',
    'sshKeys.read',
    'securityGroups.read',
    'securityGroups.update',
    'servers.create',
  ],
  updateEC2InstanceAction: [
    'servers.read',
    'cloudProviderAccounts.read',
    'securityGroups.read',
    'servers.update',
  ],
  upgradeEC2InstanceTypeAction: [
    'servers.read',
    'cloudProviderAccounts.read',
    'servers.update',
  ],
  checkAWSAccountConnection: ['servers.read'],
  listUbuntuAmisAction: ['servers.read'],
  connectAWSAccountAction: ['cloudProviderAccounts.create'],
  updateAWSAccountAction: ['cloudProviderAccounts.update'],
  deleteAWSAccountAction: ['cloudProviderAccounts.delete'],

  // Hetzner cloud actions
  connectHetznerAccountAction: ['cloudProviderAccounts.create'],
  updateHetznerAccountAction: ['cloudProviderAccounts.update'],
  listHetznerLocationsAction: ['cloudProviderAccounts.read'],
  listHetznerServerTypesAction: ['cloudProviderAccounts.read'],
  listHetznerImagesAction: ['cloudProviderAccounts.read'],
  createHetznerServerAction: [
    'cloudProviderAccounts.read',
    'sshKeys.read',
    'servers.create',
  ],

  // Git provider actions
  createGithubAppAction: ['gitProviders.create'],
  installGithubAppAction: ['gitProviders.update'],
  deleteGitProviderAction: ['gitProviders.delete'],
  getRepositoriesAction: ['gitProviders.read'],
  getBranchesAction: ['gitProviders.read'],
  getAllAppsAction: ['gitProviders.read'],
  skipOnboardingAction: ['team.update'],

  // Docker registries actions
  getDockerRegistries: ['dockerRegistries.read'],
  testDockerRegistryConnectionAction: ['dockerRegistries.read'],
  connectDockerRegistryAction: ['dockerRegistries.create'],
  updateDockerRegistryAction: ['dockerRegistries.update'],
  deleteDockerRegistryAction: ['dockerRegistries.delete'],

  // sshKeys actions
  createSSHKeyAction: ['sshKeys.create'],
  updateSSHKeyAction: ['sshKeys.update'],
  deleteSSHKeyAction: ['sshKeys.delete'],

  // SecurityGroup actions
  createSecurityGroupAction: ['securityGroups.create'],
  updateSecurityGroupAction: ['securityGroups.update'],
  deleteSecurityGroupAction: ['securityGroups.delete'],
  syncSecurityGroupAction: ['securityGroups.update'],
  getSecurityGroupsAction: ['securityGroups.read'],

  // Projects actions
  createProjectAction: ['servers.read', 'projects.create'],
  updateProjectAction: ['projects.update'],
  deleteProjectAction: ['projects.delete', 'services.delete'],
  getProjectDatabasesAction: ['services.read'],
  getProjectBreadcrumbs: ['projects.read'],

  // Services actions
  getServiceDetails: ['services.read'],
  getServiceDeploymentsBackups: ['services.read'],
  getServiceBackups: ['backups.read'],
  getRestorableBackups: ['backups.read'],
  createServiceAction: ['services.create', 'projects.read', 'services.read'],
  testExternalDbConnectionAction: ['services.read'],
  cloneServiceAction: ['services.create', 'services.read', 'projects.read'],
  createServiceWithPluginAction: [
    'servers.read',
    'servers.update',
    'services.create',
    'projects.read',
    'services.read',
  ],
  deleteServiceAction: ['services.delete', 'services.read'],
  updateServiceAction: ['services.read', 'services.update'],
  restartServiceAction: ['services.read', 'services.update'],
  stopServiceAction: ['services.read', 'services.update'],
  toggleMaintenanceAction: ['services.read', 'services.update'],
  getMaintenanceStatusAction: ['services.read'],
  toggleHttpAuthAction: ['services.read', 'services.update'],
  exposeDatabasePortAction: ['services.read', 'services.update'],
  migrateDatabaseAction: [
    'services.read',
    'services.create',
    'services.update',
    'projects.read',
    'servers.read',
  ],
  updateServiceDomainAction: ['services.read', 'services.update'],
  regenerateSSLAction: ['services.read', 'services.update'],
  syncServiceDomainAction: ['services.read', 'services.update'],
  updateVolumesAction: ['services.read', 'services.update'],
  scaleServiceAction: ['services.read'],
  fetchServiceScaleStatusAction: ['services.read'],
  setServiceResourceLimitAction: ['services.read'],
  setServiceResourceReserveAction: ['services.read'],
  fetchServiceResourceStatusAction: ['services.read'],
  clearServiceResourceLimitAction: ['services.read'],
  clearServiceResourceReserveAction: ['services.read'],
  checkServerResourcesAction: ['services.read'],
  markDefaultServiceDomainAction: ['services.update'],
  checkPluginUsageAction: ['services.read'],

  // combined read access
  getProjectDetails: ['projects.read', 'services.read'],
  getProjectsAndServers: ['servers.read', 'projects.read'],

  getSecurityDetailsAction: [
    'securityGroups.read',
    'servers.read',
    'cloudProviderAccounts.read',
  ],

  getSshKeysAction: ['sshKeys.read', 'servers.read'],

  // tailscale Actions
  tailscaleConfiguredAction: ['servers.read'],
  generateOAuthTokenAction: ['servers.read'],
  generateAuthKeyAction: ['servers.read'],

  // netbird Actions
  netbirdConfiguredAction: ['servers.read'],
  generateNetbirdSetupKeyAction: ['servers.read'],
  getNetbirdPeerAction: ['servers.read'],
  deleteNetbirdPeerAction: ['servers.delete'],

  // zerotier Actions
  zerotierConfiguredAction: ['servers.read'],
  getZerotierMembersAction: ['servers.read'],
  authorizeZerotierMemberAction: ['servers.create'],

  //  Backup actions
  getAllBackupsAction: ['backups.read', 'backups.update'],
  internalBackupAction: ['backups.create', 'services.read'],
  internalRestoreAction: ['backups.read', 'services.read', 'backups.update'],
  internalDbDeleteAction: ['services.read', 'backups.delete', 'backups.read'],
  configureExternalBackupAction: ['services.read', 'services.update'],
  externalBackupAction: ['backups.create', 'services.read'],
  scheduleExternalBackupAction: ['services.read', 'services.update'],
  unscheduleExternalBackupAction: ['services.read', 'services.update'],

  // Deployment actions
  createDeploymentAction: ['services.read', 'services.update'],
  cancelDeploymentAction: ['services.read', 'services.update'],

  //install net data
  installNetdataAction: ['servers.read', 'servers.update'],
  uninstallNetdataAction: ['servers.read', 'servers.update'],

  // Terminal Actions
  installTerminalAction: ['servers.read'],
  uninstallTerminalAction: ['servers.read'],
  startTerminalAction: ['servers.read'],
  stopTerminalAction: ['servers.read'],
  restartTerminalAction: ['servers.read'],

  // Beszel Actions
  installMonitoringToolsAction: [
    'servers.read',
    'servers.update',
    'projects.read',
    'projects.create',
    'services.create',
  ],
  serverBackupAction: [
    'servers.read',
    'servers.update',
    'projects.read',
    'projects.create',
    'services.create',
  ],

  getServiceNginxConfigAction: ['services.read'],
  setServiceNginxConfigSchema: ['services.update'],
  getDeploymentsAction: ['services.read'],

  // Ansible actions (#401) — playbooks execute remote configuration, so
  // mutations require servers.update
  getPlaybooksAction: ['servers.read'],
  createPlaybookAction: ['servers.update'],
  deletePlaybookAction: ['servers.update'],
  runAnsiblePlaybookAction: ['servers.read', 'servers.update'],
  getAnsibleExecutionsAction: ['servers.read'],

  // Activity actions (self-scoped reads; team.read is the least privilege
  // that every dashboard role already carries)
  getActivitiesAction: ['team.read'],
  getActivitiesByCategoryAction: ['team.read'],
  getActivityCategoriesAction: ['team.read'],
  getActivityStatsAction: ['team.read'],
} as const

export type GetActionAccessMap = typeof getActionAccess
export type ActionName = keyof GetActionAccessMap
export type ActionPermission = GetActionAccessMap[ActionName][number]
