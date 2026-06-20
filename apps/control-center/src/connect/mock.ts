// Mock connect data layer — the dev stand-in until Codex's endpoints land
// (GET /admin/github/repositories, POST /admin/connect/sdk-install-pr).
// Swapping to the real API is a one-line change to the `connectApi` export.
//
// The sample target is the real Sprout demo repo, so the connect experience
// demonstrates connecting the very app we shipped. The handoff is deliberately
// `blocked: sdk_publish_held` — the honest state, because the npm publish is
// held for Joe. OFF works right up to that line; it never claims "installed".

import type { ConnectApi, HandoffResult, RepositoryProof } from './contract'

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const connectedProof: RepositoryProof = {
  status: 'connected',
  mode: 'github_app',
  appConfigured: true,
  installationConfigured: true,
  target: {
    owner: 'joewilsonai',
    repo: 'sprout-demo',
    fullName: 'joewilsonai/sprout-demo',
    url: 'https://github.com/joewilsonai/sprout-demo',
  },
  repositories: [
    {
      fullName: 'joewilsonai/sprout-demo',
      name: 'sprout-demo',
      owner: 'joewilsonai',
      private: true,
      htmlUrl: 'https://github.com/joewilsonai/sprout-demo',
      permissions: { admin: true, push: true, pull: true },
    },
    {
      fullName: 'joewilsonai/orchard-web',
      name: 'orchard-web',
      owner: 'joewilsonai',
      private: true,
      htmlUrl: 'https://github.com/joewilsonai/orchard-web',
      permissions: { admin: true, push: true, pull: true },
    },
    {
      fullName: 'joewilsonai/fern-ios',
      name: 'fern-ios',
      owner: 'joewilsonai',
      private: true,
      htmlUrl: 'https://github.com/joewilsonai/fern-ios',
      permissions: { push: true, pull: true },
    },
  ],
  totalCount: 3,
  truncated: false,
  targetAccessible: true,
  summary: 'Connected to joewilsonai/sprout-demo with 3 accessible repositories.',
  missing: [],
}

export const mockConnectApi: ConnectApi = {
  getSetupUrl() {
    return 'https://github.com/apps/open-feedback-factory/installations/new'
  },

  async getRepositoryProof() {
    await delay(900)
    return connectedProof
  },

  async requestSdkInstallPr(repositoryFullName: string): Promise<HandoffResult> {
    await delay(1100)
    // npm publish is HELD → the SDK-install handoff is staged, not shipped.
    return {
      status: 'blocked',
      workItemId: 'wi_demo_sdk_install',
      issueUrl: `https://github.com/${repositoryFullName}/issues`,
      missing: ['sdk_publish_held'],
      summary:
        'OFF staged the SDK-install plan for this repo. The install PR is held until ' +
        '@open-feedback-factory/sdk is published to npm — that publish is waiting on your go.',
    }
  },
}

// Single swap point: replace with the real API client when endpoints land.
export const connectApi: ConnectApi = mockConnectApi
