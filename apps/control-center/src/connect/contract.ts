// Connect-flow contract — mirrors Codex's backend shapes exactly so the mock
// data layer is swappable for the real endpoints with no UI refactor.
//
//   1) GET  /admin/github/repositories        -> RepositoryProof   (admin-token gated)
//   2) initiate connect: window.open setupUrl  (/github/app/setup -> GitHub -> /github/app/installed)
//   3) POST /admin/connect/sdk-install-pr      -> HandoffResult     ({ repositoryFullName })
//
// Honesty is built into the types: the handoff can only be `queued` or
// `blocked`, never "shipped"/"installed", and because the npm publish is HELD
// the SDK-install handoff must surface `sdk_publish_held` rather than imply
// `npm install` works.

export type ConnectStatus =
  | 'disabled'
  | 'not_configured'
  | 'connected'
  | 'target_missing'
  | 'error'

export interface RepositoryPermissions {
  admin?: boolean
  push?: boolean
  pull?: boolean
}

export interface Repository {
  fullName: string
  name: string
  // owner + htmlUrl are nullable to match the real /admin/github/repositories
  // endpoint (GitHub can omit them); the UI keys off fullName, so nulls are safe.
  owner: string | null
  private: boolean
  htmlUrl: string | null
  permissions: RepositoryPermissions
}

export interface RepositoryTarget {
  owner: string
  repo: string
  fullName: string
  url: string
}

export interface RepositoryProof {
  status: ConnectStatus
  mode: string
  appConfigured: boolean
  installationConfigured: boolean
  target: RepositoryTarget | null
  repositories: Repository[]
  totalCount: number
  truncated: boolean
  targetAccessible: boolean
  summary: string
  missing: string[]
}

export type HandoffBlocker = 'sdk_publish_held' | 'worker_offline' | 'github_target_missing'

export interface HandoffResult {
  status: 'queued' | 'blocked'
  workItemId?: string
  issueUrl?: string
  prUrl?: string
  missing: HandoffBlocker[]
  summary: string
}

export interface ConnectApi {
  /** True when this is sample/preview data, not a live backend connection.
   *  The UI must visibly label preview data so it is never mistaken for real. */
  isPreview: boolean
  /** Setup URL for the GitHub App install/manifest flow (from /doctor); null when not configured. */
  getSetupUrl(): string | null
  /** GET /admin/github/repositories */
  getRepositoryProof(): Promise<RepositoryProof>
  /** POST /admin/connect/sdk-install-pr */
  requestSdkInstallPr(repositoryFullName: string): Promise<HandoffResult>
}

export const connectStatusLabel: Record<ConnectStatus, string> = {
  disabled: 'GitHub disabled',
  not_configured: 'Not connected',
  connected: 'Connected',
  target_missing: 'Repo not accessible',
  error: 'Connection error',
}

export const blockerLabel: Record<HandoffBlocker, string> = {
  sdk_publish_held: 'SDK publish is held for your go',
  worker_offline: 'No live worker connected',
  github_target_missing: 'Target repo not accessible',
}
