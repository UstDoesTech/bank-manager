// Bank Manager on Azure Container Apps, in the playground resource group. Same pattern as the p-doom human app: it reuses
// the registry (builtonplayground) and the Container Apps environment of the Personal-UstOldfield-Built-On-Playground app
// and creates only a managed identity, its AcrPull role on the registry, and the app. The database is Databricks Lakebase.
//
// Order: build the image into the registry first (`az acr build`), then deploy this with
// image = '<registry>/bank-manager:<tag>'. The deploying identity needs rights to create role assignments
// (Owner or User Access Administrator on the resource group).

@description('Must be the region of the existing environment and registry, which is not the resource group region (uksouth).')
param location string = 'westus2'
param prefix string = 'bankmgr'
@description('Existing registry in this resource group that the app pulls from.')
param acrName string = 'builtonplayground'
@description('Existing Container Apps environment in this resource group (shared with the playground app).')
param environmentName string = 'managedEnvironment-rgpersonalnustu-b3e2'
@description('Full image reference, <registry>.azurecr.io/bank-manager:<tag>.')
param image string

param databricksHost string
param databricksClientId string
@secure()
param databricksClientSecret string

@description('projects/<id>/branches/<id>/endpoints/<id>')
param lakebaseEndpoint string = 'projects/bank-manager/branches/production/endpoints/primary'
param pgHost string
param pgDatabase string = 'bank'

@description('Public address of the app, used in emailed links. Leave empty to use the address Azure gives it.')
param baseUrl string = ''

var acrPull = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: acrName
}

resource env 'Microsoft.App/managedEnvironments@2024-03-01' existing = {
  name: environmentName
}

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${prefix}-id'
  location: location
}

resource pull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acr.id, identity.id, acrPull)
  scope: acr
  properties: {
    roleDefinitionId: acrPull
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${prefix}-app'
  location: location
  dependsOn: [pull]
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${identity.id}': {} }
  }
  properties: {
    managedEnvironmentId: env.id
    configuration: {
      ingress: {
        external: true
        targetPort: 8080
        transport: 'auto'
        allowInsecure: false
      }
      registries: [{ server: acr.properties.loginServer, identity: identity.id }]
      secrets: [{ name: 'databricks-secret', value: databricksClientSecret }]
    }
    template: {
      // The server keeps nothing in memory between requests, so it can scale out; two replicas keep it up through a restart.
      scale: { minReplicas: 1, maxReplicas: 2 }
      containers: [
        {
          name: 'app'
          image: image
          resources: { cpu: json('0.5'), memory: '1Gi' }
          env: [
            { name: 'DATABRICKS_HOST', value: databricksHost }
            { name: 'DATABRICKS_CLIENT_ID', value: databricksClientId }
            { name: 'DATABRICKS_CLIENT_SECRET', secretRef: 'databricks-secret' }
            { name: 'LAKEBASE_ENDPOINT', value: lakebaseEndpoint }
            { name: 'PGHOST', value: pgHost }
            { name: 'PGDATABASE', value: pgDatabase }
            { name: 'MIGRATE', value: 'off' }
            { name: 'BASE_URL', value: empty(baseUrl) ? 'https://${prefix}-app.${env.properties.defaultDomain}' : baseUrl }
          ]
          probes: [
            { type: 'Liveness', httpGet: { path: '/healthz', port: 8080 }, initialDelaySeconds: 10, periodSeconds: 30 }
            { type: 'Readiness', httpGet: { path: '/healthz', port: 8080 }, periodSeconds: 10 }
          ]
        }
      ]
    }
  }
}

output registry string = acr.name
output registryServer string = acr.properties.loginServer
output url string = 'https://${app.properties.configuration.ingress.fqdn}'
