import { useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { productConfig } from './product';
import './styles.css';

type Detail = {
  title: string;
  uri: string;
  actor: string;
  task: string;
  capabilities: string[];
  status?: string;
};

const details: Record<string, Detail> = {
  identity: {
    title: 'ROOT IDENTITY',
    uri: 'principal://acme.dev/humans/admin',
    actor: 'HUMAN',
    task: 'issue-421',
    capabilities: ['authorize.agent']
  },
  authorization: {
    title: 'AUTHORIZATION',
    uri: 'tesserra://authorizations/01JX...',
    actor: 'HUMAN → AGENT A',
    task: 'issue-421',
    capabilities: ['repository.read', 'test.execute']
  },
  agentA: {
    title: 'AGENT IDENTITY',
    uri: 'agent://acme.dev/agents/01JA...',
    actor: 'AGENT A',
    task: 'issue-421',
    capabilities: ['repository.read', 'test.execute']
  },
  delegation: {
    title: 'DELEGATION CREDENTIAL',
    uri: 'tesserra://delegations/01JD...',
    actor: 'AGENT A → AGENT B',
    task: 'issue-421',
    capabilities: ['repository.read', 'test.execute']
  },
  agentB: {
    title: 'SIGNED CREDENTIAL',
    uri: 'agent://acme.dev/agents/01JX...',
    actor: 'AGENT B',
    task: 'issue-421',
    capabilities: ['repository.read', 'test.execute']
  },
  request: {
    title: 'SIGNED REQUEST',
    uri: 'tesserra://requests/01JR...',
    actor: 'AGENT B',
    task: 'issue-421',
    capabilities: ['repository.read', 'test.execute']
  },
  tool: {
    title: 'TOOL IDENTITY',
    uri: 'mcp://acme.dev/github',
    actor: 'MCP TOOL',
    task: 'issue-421',
    capabilities: ['repository.read']
  },
  verification: {
    title: 'VERIFICATION RESULT',
    uri: 'github://acme/payments-api',
    actor: 'CHAIN VERIFIED',
    task: 'issue-421',
    capabilities: ['audience.bound', 'signature.valid']
  },
  resource: {
    title: 'RESOURCE VERIFICATION',
    uri: 'aws://acme/production-db',
    actor: 'AWS / DB',
    task: 'issue-421',
    capabilities: ['resource.bound'],
    status: 'VERIFIED'
  }
};

const cli = `${productConfig.commandName} init --json
✓ local state initialized

${productConfig.commandName} identity create \\
  --agent agid:v1:example.test/coding-agent \\
  --dev-self-issue --json
✓ fixture identity created (not trusted automatically)

corepack pnpm --filter @agent-proof/core test
✓ frozen delegation/request conformance cases verified`;

const signedRequest = `Actor:      agent://acme.dev/agents/01JX
Task:       issue-421
Capability: repository.read
Resource:   github://acme/payments-api
Signature:  ✓ verified`;

function renderMint(value: string): ReactNode[] {
  return value.split('\n').map((line, index) => {
    const check = line.indexOf('✓');
    if (check === -1) {
      return (
        <span key={index}>
          {line}
          {'\n'}
        </span>
      );
    }
    return (
      <span key={index}>
        {line.slice(0, check)}
        <span className="ok">{line.slice(check)}</span>
        {'\n'}
      </span>
    );
  });
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }
  return (
    <button className="copy-btn" onClick={copy} aria-label={`Copy ${label}`}>
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function Reveal({
  children,
  className = '',
  delay = 0
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <div className={`reveal ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

function LogoMark({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M3 4h11v4H7v7H3V4Zm8 6h10v4h-6v6h-4V10Zm8 8h10v10H19V18Zm4 4v2h2v-2h-2Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function GitHubIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2C6.477 2 2 6.486 2 12.021c0 4.425 2.865 8.18 6.839 9.504.5.093.682-.217.682-.483 0-.237-.009-.866-.014-1.7-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.621.069-.608.069-.608 1.003.071 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.952 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.026 2.747-1.026.546 1.378.203 2.397.1 2.65.64.7 1.028 1.595 1.028 2.688 0 3.848-2.338 4.695-4.566 4.944.359.31.678.922.678 1.858 0 1.34-.012 2.419-.012 2.748 0 .268.18.58.688.481A10.025 10.025 0 0 0 22 12.021C22 6.486 17.523 2 12 2Z"
      />
    </svg>
  );
}

function ProvenanceGraph() {
  const [selected, setSelected] = useState<Detail>(details.agentB);
  const nodes: Array<{ key: string; label: string; kind: string }> = [
    { key: 'identity', kind: 'ROOT PRINCIPAL', label: 'HUMAN' },
    { key: 'agentA', kind: 'ISSUER', label: 'AGENT A' },
    { key: 'agentB', kind: 'DELEGATE', label: 'AGENT B' },
    { key: 'tool', kind: 'TOOL BOUNDARY', label: 'MCP TOOL' },
    { key: 'resource', kind: 'AUDIENCE', label: 'AWS / DB' }
  ];
  const edges: Array<{ key: string; label: string }> = [
    { key: 'authorization', label: 'authorized' },
    { key: 'delegation', label: 'delegated' },
    { key: 'request', label: 'requested' },
    { key: 'verification', label: 'verified' }
  ];
  return (
    <div className="provenance" aria-label="Interactive provenance chain from human to resource">
      <div className="provenance-header">
        <span>How trust is proven</span>
        <span className="status">Signature verified</span>
      </div>
      <div className="provenance-body">
        <div className="chain">
          {nodes.map((node, index) => (
            <div key={node.key}>
              <div className="chain-node">
                <button
                  className="chain-node-btn"
                  data-component-id={`node-${node.key}`}
                  onClick={() => setSelected(details[node.key])}
                >
                  <small>{node.kind}</small>
                  <strong>{node.label}</strong>
                </button>
              </div>
              {index < edges.length ? (
                <div className="chain-edge">
                  <button onClick={() => setSelected(details[edges[index].key])}>
                    {edges[index].label}
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
        <aside className="detail-card" aria-live="polite">
          <div className="detail-card-head">
            <span className="title">{selected.title}</span>
            <span className="badge">{selected.status ?? 'VERIFIED'}</span>
          </div>
          <p className="detail-uri">{selected.uri}</p>
          <dl className="detail-dl">
            <div>
              <dt>Actor</dt>
              <dd>{selected.actor}</dd>
            </div>
            <div>
              <dt>Task</dt>
              <dd>{selected.task}</dd>
            </div>
            <div>
              <dt>Capabilities</dt>
              <dd className="tags">
                {selected.capabilities.map((capability) => (
                  <span key={capability}>{capability}</span>
                ))}
              </dd>
            </div>
            <div>
              <dt>Evidence</dt>
              <dd>signature + bindings</dd>
            </div>
          </dl>
          <p className="detail-verified">signature verified</p>
        </aside>
      </div>
    </div>
  );
}

export function App() {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const elements = Array.from(document.querySelectorAll<HTMLElement>('.reveal'));
    if (reduced || !('IntersectionObserver' in window)) {
      elements.forEach((element) => element.classList.add('is-visible'));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08 }
    );
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  const navLinks = [
    ['Trust', '#trust'],
    ['Process', '#process'],
    ['Security', '#security'],
    ['Get started', productConfig.links.app]
  ];

  const processSteps = [
    {
      title: 'Issue identity',
      body: 'Create a signed root credential for an agent. Public key only. Private keys stay local.'
    },
    {
      title: 'Delegate narrowly',
      body: 'Grant only the exact action, resource, task, and time window. Children can only shrink authority.'
    },
    {
      title: 'Sign the request',
      body: 'The agent signs what it is about to do: actor, capability, resource, and task digest.'
    },
    {
      title: 'Verify the chain',
      body: 'A receiver checks signatures, trust, attenuation, freshness, and bindings in one ordered pipeline.'
    }
  ];

  return (
    <>
      <div className="film-grain" aria-hidden="true" />

      <nav className="nav bg-transparent" aria-label="Primary navigation">
        <div className="nav-inner">
          <a className="brand" href="#top" aria-label={`${productConfig.displayName} home`}>
            <LogoMark />
            {productConfig.displayName}
          </a>
          <div className="nav-links">
            {navLinks.map(([label, href]) => (
              <a key={href} href={href}>
                {label}
              </a>
            ))}
          </div>
          <div className="nav-actions">
            <a
              className="nav-github"
              href={productConfig.links.repository}
              target="_blank"
              rel="noreferrer"
              aria-label="GitHub repository"
            >
              <GitHubIcon />
              <span>GitHub</span>
            </a>
            <a className="nav-cta" href={productConfig.links.documentation}>
              Docs
            </a>
          </div>
          <button
            className="menu-button"
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation"
            onClick={() => setMenuOpen((open) => !open)}
          >
            Menu
          </button>
        </div>
        {menuOpen ? (
          <div id="mobile-navigation" className="mobile-nav">
            {navLinks.map(([label, href]) => (
              <a key={href} href={href} onClick={() => setMenuOpen(false)}>
                {label}
              </a>
            ))}
            <a
              href={productConfig.links.repository}
              target="_blank"
              rel="noreferrer"
              onClick={() => setMenuOpen(false)}
            >
              GitHub
            </a>
            <a href={productConfig.links.documentation} onClick={() => setMenuOpen(false)}>
              Docs
            </a>
          </div>
        ) : null}
      </nav>

      <main id="top">
        <header className="hero">
          <div className="hero-atmosphere" aria-hidden="true">
            <img
              className="hero-mountains"
              src="/mountains.png"
              alt=""
              width={1920}
              height={1080}
              decoding="async"
            />
            <div className="hero-sunglow" />
            <div className="hero-mist" />
            <div className="hero-clouds">
              <img className="cloud cloud-a" src="/cloud-sprite.png" alt="" width={640} height={360} decoding="async" />
              <img className="cloud cloud-b" src="/cloud-sprite.png" alt="" width={720} height={400} decoding="async" />
            </div>
            <div className="hero-scrim" />
          </div>
          <div className="wrap hero-content">
            <h1 className="hero-title">Clear above the fog.</h1>
            <p className="hero-copy">
              Signed trails from root authority to the last agent step — trust you can still read in the mist.
            </p>
            <div className="actions hero-actions">
              <a className="btn btn-primary" href={productConfig.links.app}>
                Open app
              </a>
              <a className="btn btn-ghost" href="#trust">
                See the proof
              </a>
            </div>
          </div>
        </header>

        <section id="trust" className="section-trust">
          <Reveal className="wrap trust-intro">
            <p className="trust-proof">
              <span className="trust-proof-dot" aria-hidden="true" />
              Trust from signatures, not vibes
            </p>
            <h2>How you know it is trusted</h2>
            <p className="lead">
              Every agent action carries a signed chain: who acted, who authorized it, what was
              allowed, and whether it still holds. Tap any node to inspect the evidence.
            </p>
            <ProvenanceGraph />
          </Reveal>
        </section>

        <section className="trust-strip" aria-label="Trust signals">
          <div className="wrap trust-strip-inner">
            {[
              'Signed identity',
              'Narrow delegation',
              'Deterministic verify',
              'Local-first evidence'
            ].map((item) => (
              <span key={item} className="trust-chip">
                <span className="trust-dot" aria-hidden="true" />
                {item}
              </span>
            ))}
          </div>
        </section>

        <section id="process" className="section-process">
          <Reveal className="wrap">
            <h2>How {productConfig.displayName} works</h2>
            <p className="lead">
              Four steps from authority to a verified action. No cloud login required for the local
              workflow.
            </p>
            <ol className="process-list">
              {processSteps.map((step, index) => (
                <Reveal key={step.title} className="process-item" delay={index * 90}>
                  <span className="process-index" aria-hidden="true">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.body}</p>
                  </div>
                </Reveal>
              ))}
            </ol>
          </Reveal>
        </section>

        <section id="why" className="section-why">
          <Reveal className="wrap why-layout">
            <h2>An agent name is not an audit trail.</h2>
            <p className="lead">
              When agents call code hosts, tools, cloud APIs, and internal services, receivers need
              signed proof - not just a username or API key.
            </p>
            <ol className="questions">
              {[
                'Who was it?',
                'Who authorized it?',
                'What could it do?',
                'Who delegated that authority?',
                'Was it still valid?'
              ].map((question, index) => (
                <li key={question} style={{ transitionDelay: `${index * 60}ms` }}>
                  {question}
                </li>
              ))}
            </ol>
          </Reveal>
        </section>

        <section id="how" className="section-how grain-panel">
          <div className="grain-panel-media" aria-hidden="true">
            <img src="/grain-plate.png" alt="" width={1920} height={1080} loading="lazy" decoding="async" />
          </div>
          <Reveal className="wrap">
            <h2>What you can do today</h2>
            <p className="lead">Concrete capabilities in the current local reference stack.</p>
            <div className="capability-grid">
              {[
                ['Identity', 'Issue and inspect agent credentials with deterministic key IDs.'],
                ['Delegation', 'Attenuate authority so children only narrow, never expand.'],
                ['Signed requests', 'Bind action, resource, task, and audience into one proof.'],
                ['Verification', 'Run a fixed verifier order that fails closed on unknown trust.'],
                ['CLI + SDK', `Use ${productConfig.commandName} and the TypeScript SDK offline.`],
                ['Adapters', 'Map MCP, SPIFFE, and A2A at the boundary without replacing them.']
              ].map(([title, body], index) => (
                <Reveal key={title} className="capability-card" delay={index * 70}>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </Reveal>
              ))}
            </div>
          </Reveal>
        </section>

        <section id="security" className="section-security grain-panel">
          <div className="grain-panel-media grain-panel-media-flip" aria-hidden="true">
            <img src="/grain-plate.png" alt="" width={1920} height={1080} loading="lazy" decoding="async" />
          </div>
          <Reveal className="wrap security-layout">
            <div>
              <p className="trust-label">Verified evidence</p>
              <h2>Cryptographic proof, not another header.</h2>
              <p className="lead">
                Verification is deterministic and binds a request to its authority context.
              </p>
              <div className="security-formula">
                {['Identity', 'Delegation', 'Task', 'Resource', 'Time', 'Nonce', 'Signature'].map(
                  (item) => (
                    <span key={item}>{item}</span>
                  )
                )}
              </div>
            </div>
            <div className="code-block">
              <div className="code-block-header">
                <span>Signed tool request</span>
                <CopyButton value={signedRequest} label="signed tool request" />
              </div>
              <pre>{renderMint(signedRequest)}</pre>
            </div>
          </Reveal>
        </section>

        <section id="get-started" className="section-cli">
          <Reveal className="wrap cli-layout">
            <div>
              <h2>Start from the terminal</h2>
              <p className="lead">
                Initialize local state, create a fixture identity, and verify conformance cases
                without a cloud dependency.
              </p>
              <div className="actions">
                <a className="btn btn-primary" href={productConfig.links.repository}>
                  View on GitHub
                </a>
                <a className="btn btn-ghost" href={productConfig.links.app}>
                  Open app
                </a>
              </div>
            </div>
            <div className="code-block terminal">
              <div className="code-block-header">
                <span>{productConfig.commandName}</span>
                <CopyButton value={cli} label="terminal commands" />
              </div>
              <pre>{renderMint(cli)}</pre>
            </div>
          </Reveal>
        </section>

        <section className="final">
          <div className="final-glow" aria-hidden="true" />
          <Reveal className="wrap final-inner">
            <h2>
              Give agents an identity.
              <br />
              Give actions a provenance.
            </h2>
            <div className="actions">
              <a className="btn btn-trust" href={productConfig.links.app}>
                Open app
              </a>
              <a className="btn btn-ghost" href={productConfig.links.documentation}>
                Read the docs
              </a>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="wrap footer">
        <span>{productConfig.displayName}</span>
        <span className="built-by">
          Built by{' '}
          <a href="https://www.linkedin.com/in/rounit08" target="_blank" rel="noreferrer">
            Rounit Sinha
          </a>{' '}
          ·{' '}
     
        </span>
        <a href={productConfig.links.security}>Security</a>
      </footer>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
