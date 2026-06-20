import { useState } from 'react'
import './connect.css'
import { connectApi } from './mock'
import {
  blockerLabel,
  connectStatusLabel,
  type HandoffResult,
  type RepositoryProof,
} from './contract'

type Step = 1 | 2 | 3

const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: 'Connect' },
  { n: 2, label: 'Repository' },
  { n: 3, label: 'Hand off' },
]

function Stepper({ step }: { step: Step }) {
  return (
    <ol className="connect-steps" aria-label="Connect progress">
      {STEPS.map(({ n, label }) => (
        <li key={n} data-state={n < step ? 'done' : n === step ? 'current' : 'todo'}>
          <span className="connect-step-dot">{n < step ? '✓' : n}</span>
          <span>{label}</span>
        </li>
      ))}
    </ol>
  )
}

function GithubGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="connect-gh" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.6 9.6 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z"
      />
    </svg>
  )
}

function ConnectStep({ onVerified }: { onVerified: (proof: RepositoryProof) => void }) {
  const [installing, setInstalling] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const openInstall = () => {
    const url = connectApi.getSetupUrl()
    if (url) window.open(url, '_blank', 'noopener,noreferrer')
    setInstalling(true)
  }

  const verify = async () => {
    setLoading(true)
    setError(null)
    try {
      const proof = await connectApi.getRepositoryProof()
      onVerified(proof)
    } catch {
      setError('Could not verify the connection. Make sure the app is installed and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="connect-body">
      <p className="connect-lead">
        Point a repository at Open Feedback Factory. OFF installs the feedback SDK, listens for what your
        users ask for, and ships features through guarded pull requests — you stay in control of every merge.
      </p>
      <ol className="connect-explain">
        <li>Install the OFF GitHub App on the repo you want to connect.</li>
        <li>OFF verifies it can read the repo and open pull requests.</li>
        <li>OFF stages the SDK install and starts the feedback&nbsp;→&nbsp;feature loop.</li>
      </ol>
      <div className="connect-actions">
        <button type="button" className="button-link primary" onClick={openInstall}>
          <GithubGlyph /> Connect with GitHub
        </button>
        {installing && (
          <button type="button" className="button-link" onClick={verify} disabled={loading}>
            {loading ? 'Verifying…' : 'I’ve installed it — verify access'}
          </button>
        )}
      </div>
      {error && <p className="connect-error">{error}</p>}
    </div>
  )
}

function RepoStep({ proof, onContinue }: { proof: RepositoryProof; onContinue: () => void }) {
  const ok = proof.status === 'connected' && proof.target
  return (
    <div className="connect-body">
      <div className={`connect-status connect-status--${proof.status}`}>
        <span className="connect-status-dot" />
        <strong>{connectStatusLabel[proof.status]}</strong>
        <small>{proof.summary}</small>
      </div>

      {ok && proof.target && (
        <div className="connect-target">
          <p className="eyebrow">OFF will work on</p>
          <a className="connect-target-name" href={proof.target.url} target="_blank" rel="noreferrer">
            {proof.target.fullName}
          </a>
        </div>
      )}

      {proof.repositories.length > 0 && (
        <div className="connect-repos">
          <p className="eyebrow">Accessible repositories · {proof.totalCount}</p>
          <ul>
            {proof.repositories.map((repo) => (
              <li key={repo.fullName} data-target={proof.target?.fullName === repo.fullName}>
                <span className="connect-repo-name">{repo.fullName}</span>
                {repo.private && <span className="connect-tag">Private</span>}
                {proof.target?.fullName === repo.fullName && <span className="connect-tag lime">Target</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!ok && (
        <p className="connect-error">
          OFF couldn’t reach the target repository. Re-check the GitHub App installation and the repo it’s
          granted on, then verify again.
        </p>
      )}

      <div className="connect-actions">
        <button type="button" className="button-link primary" onClick={onContinue} disabled={!ok}>
          Hand off to OFF →
        </button>
      </div>
    </div>
  )
}

function HandoffStep({ proof }: { proof: RepositoryProof }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<HandoffResult | null>(null)

  const handOff = async () => {
    if (!proof.target) return
    setLoading(true)
    try {
      setResult(await connectApi.requestSdkInstallPr(proof.target.fullName))
    } finally {
      setLoading(false)
    }
  }

  if (!result) {
    return (
      <div className="connect-body">
        <p className="connect-lead">
          Hand <strong>{proof.target?.fullName}</strong> to OFF. It opens a pull request that installs the
          feedback SDK, then starts turning user requests into guarded, reviewable PRs.
        </p>
        <div className="connect-actions">
          <button type="button" className="button-link primary" onClick={handOff} disabled={loading}>
            {loading ? 'Handing off…' : 'Let OFF take over'}
          </button>
        </div>
      </div>
    )
  }

  const blocked = result.status === 'blocked'
  return (
    <div className="connect-body">
      <div className={`connect-result connect-result--${result.status}`}>
        <strong>{blocked ? 'Held — waiting on you' : 'Queued'}</strong>
        <p>{result.summary}</p>
      </div>

      {blocked && result.missing.length > 0 && (
        <ul className="connect-blockers">
          {result.missing.map((m) => (
            <li key={m}>
              <span className="connect-blocker-dot" />
              {blockerLabel[m]}
            </li>
          ))}
        </ul>
      )}

      <div className="connect-links">
        {result.issueUrl && (
          <a className="button-link" href={result.issueUrl} target="_blank" rel="noreferrer">
            View staged plan
          </a>
        )}
        {result.prUrl && (
          <a className="button-link" href={result.prUrl} target="_blank" rel="noreferrer">
            View pull request
          </a>
        )}
      </div>

      {blocked && (
        <p className="connect-note">
          OFF did everything it can without you. The install PR stays staged until the held step is released —
          nothing is shipped or installed until then.
        </p>
      )}
    </div>
  )
}

export function ConnectOnboarding() {
  const [step, setStep] = useState<Step>(1)
  const [proof, setProof] = useState<RepositoryProof | null>(null)

  return (
    <section className="panel connect-panel" aria-label="Connect a repository">
      <div className="panel-heading connect-heading">
        <div>
          <p className="eyebrow">Onboarding</p>
          <h2>Connect a repository</h2>
        </div>
        <Stepper step={step} />
      </div>

      {connectApi.isPreview && (
        <p className="connect-preview" role="note">
          <strong>Preview</strong> — sample data showing the flow, not a live connection. The live
          console reads repositories and handoff state from your connected GitHub App.
        </p>
      )}

      {step === 1 && (
        <ConnectStep
          onVerified={(p) => {
            setProof(p)
            setStep(2)
          }}
        />
      )}
      {step === 2 && proof && <RepoStep proof={proof} onContinue={() => setStep(3)} />}
      {step === 3 && proof && <HandoffStep proof={proof} />}
    </section>
  )
}
