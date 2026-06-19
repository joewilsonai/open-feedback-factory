const githubUrl = "https://github.com/joewilsonai/open-feedback-factory";
const demoRepoUrl = "https://github.com/joewilsonai/launchbrief-demo";
const betaMailto =
  "mailto:hello@openfeedbackfactory.com?subject=Open%20Feedback%20Factory%20private%20beta";
const hostedDemoUrl = "https://launchbrief-demo.vercel.app";
const hostedControlCenterUrl = "https://app.openfeedbackfactory.com/ops/";

const lifecycle = [
  {
    step: "01",
    title: "Connect a real repo",
    body: "Start with a clean app repo, then let OFF create the SDK-install PR instead of pretending the integration already exists.",
  },
  {
    step: "02",
    title: "Sanitize and dedupe",
    body: "Strip sensitive payloads, cluster repeat asks, and keep the original user intent attached to the work item.",
  },
  {
    step: "03",
    title: "Route through policy",
    body: "Estimate risk, cost, provider, and approval lane before an agent touches your repo.",
  },
  {
    step: "04",
    title: "Create a PR with evidence",
    body: "Agents open GitHub work with logs, assumptions, checks, cost records, and user follow-up ready to review.",
  },
];

const guardrails = [
  "Cost caps before work starts",
  "Risk lanes for auto-ship versus review",
  "Encrypted integration keys for Supabase, Vercel, Resend, GitHub, and model providers",
  "Provider adapters for Codex, OpenRouter, Requesty, or your own runner",
  "Lifecycle logs that show blocked, queued, shipped, and followed-up states",
];

const healthAreas = [
  ["Repo connection", "GitHub App, branch, webhook, checks"],
  ["Runner readiness", "worker health, sandbox, auth, queue age"],
  ["Codebase health", "risk score, hotspots, recommendation tasks"],
  ["Release proof", "deploy status, rollout, user follow-up"],
];

const sdkEvents = [
  "requesting_user: beta-42",
  "screen: /settings/billing",
  "intent: downgrade confusion",
  "follow_up: enabled",
];

export function App() {
  return (
    <main>
      <section className="hero" aria-labelledby="hero-title">
        <nav className="topbar" aria-label="Primary navigation">
          <a className="brand" href="#top" aria-label="Open Feedback Factory home">
            <span className="brand-mark" aria-hidden="true">
              <span />
            </span>
            <span>Open Feedback Factory</span>
          </a>
          <div className="nav-actions">
            <a href="#lifecycle">Lifecycle</a>
            <a href="#control-center">Control center</a>
            <a href={hostedDemoUrl}>Demo</a>
            <a className="nav-cta" href={githubUrl}>
              GitHub
            </a>
          </div>
        </nav>

        <div className="hero-copy" id="top">
          <p className="eyebrow">Open-source feedback-to-feature control plane</p>
          <h1 id="hero-title">Open Feedback Factory</h1>
          <p className="hero-lede">
            Let beta users request improvements inside your app, then route safe
            work through policy, agents, PRs, release proof, cost records, and
            user follow-up.
          </p>
          <div className="hero-actions" aria-label="Primary calls to action">
            <a className="button primary" href={betaMailto}>
              Join the private beta
            </a>
            <a className="button secondary" href={hostedDemoUrl}>
              Open hosted demo
            </a>
          </div>
          <div className="hero-proof" aria-label="Live product proof">
            <span className="signal live">live hosted control center</span>
            <span>clean LaunchBrief repo, SDK install is the next real PR</span>
          </div>
        </div>
      </section>

      <section className="section lifecycle-section" id="lifecycle" aria-labelledby="lifecycle-title">
        <div className="section-heading">
          <p className="eyebrow">Feedback-to-feature lifecycle</p>
          <h2 id="lifecycle-title">Every request gets a truthful state.</h2>
          <p>
            Open Feedback Factory owns the messy middle between a user asking for
            something and a code change landing with proof.
          </p>
        </div>
        <div className="timeline">
          {lifecycle.map((item) => (
            <article className="timeline-item" key={item.step}>
              <span>{item.step}</span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="split-band" aria-labelledby="deployment-title">
        <div>
          <p className="eyebrow">Hosted and self-hosted</p>
          <h2 id="deployment-title">Start local. Move to hosted when the loop is worth scaling.</h2>
        </div>
        <div className="split-grid">
          <article>
            <h3>Self-hosted</h3>
            <p>
              Keep raw feedback, repo credentials, provider keys, and runner policy
              inside your own infrastructure while you dogfood the loop.
            </p>
          </article>
          <article>
            <h3>Hosted</h3>
            <p>
              Use the managed control plane when you want shared uptime, private beta
              onboarding, and fewer moving parts.
            </p>
          </article>
        </div>
      </section>

      <section className="section guardrail-section" aria-labelledby="guardrail-title">
        <div className="section-heading compact">
          <p className="eyebrow">Guardrails and cost controls</p>
          <h2 id="guardrail-title">Auto-ship small work without handing over the keys.</h2>
          <p>
            The agent is not the product. The control plane decides whether work
            is safe, affordable, observable, and ready for follow-up.
          </p>
        </div>
        <div className="guardrail-grid">
          {guardrails.map((guardrail) => (
            <div className="guardrail" key={guardrail}>
              <span aria-hidden="true">+</span>
              <p>{guardrail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section control-center" id="control-center" aria-labelledby="control-title">
        <div className="control-copy">
          <p className="eyebrow">Live control center</p>
          <h2 id="control-title">See the lifecycle before you trust the automation.</h2>
          <p>
            Watch claims, sanitization, assumptions, retries, PR status, cost
            estimates, actual spend, and user follow-up in one operator view.
          </p>
          <div className="control-links">
            <a href={hostedControlCenterUrl}>Private hosted control center</a>
            <a href={hostedDemoUrl}>Hosted LaunchBrief app</a>
            <a href={demoRepoUrl}>LaunchBrief repo</a>
          </div>
        </div>
        <div className="operator-panel" aria-label="Control center states">
          <img src="/control-center-live.png" alt="Live hosted Open Feedback Factory control center" />
        </div>
      </section>

      <section className="health-band" aria-labelledby="health-title">
        <div>
          <p className="eyebrow">Codebase health</p>
          <h2 id="health-title">Before an agent ships, know if the repo is ready.</h2>
          <p>
            The control center should continuously score connection health,
            runner readiness, codebase risk, and release proof gaps, then turn
            recommendations into normal work items.
          </p>
        </div>
        <div className="health-grid">
          {healthAreas.map(([title, body]) => (
            <article key={title}>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="sdk-band" aria-labelledby="sdk-title">
        <div>
          <p className="eyebrow">SDK button</p>
          <h2 id="sdk-title">A tiny button with enough context to matter.</h2>
          <p>
            The demo app starts without this button. The product moment is
            connecting the repo and letting OFF open the PR that installs it.
          </p>
        </div>
        <div className="sdk-card" aria-label="SDK event preview">
          <button type="button">Suggest an improvement</button>
          <pre>{sdkEvents.join("\n")}</pre>
        </div>
      </section>

      <section className="final-cta" aria-labelledby="final-title">
        <p className="eyebrow">Built for indie devs first</p>
        <h2 id="final-title">Let the easy fixes move. Keep the risky work visible.</h2>
        <p>
          Open Feedback Factory gives small teams a real feedback-to-feature loop:
          open source, provider-flexible, guardrailed, and honest about what is
          shipped, blocked, or waiting on credentials.
        </p>
        <div className="hero-actions" aria-label="Final calls to action">
          <a className="button primary" href={betaMailto}>
            Join the private beta
          </a>
          <a className="button secondary" href={githubUrl}>
            View GitHub
          </a>
        </div>
      </section>
    </main>
  );
}
