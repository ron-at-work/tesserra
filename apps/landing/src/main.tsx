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
    <button className="copy" onClick={copy} aria-label={`Copy ${label}`}>
      {copied ? 'COPIED' : 'COPY'}
    </button>
  );
}

function Reveal({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`reveal ${className}`}>{children}</div>;
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

function ProvenanceGraph() {
  const [selected, setSelected] = useState<Detail>(details.agentB);
  const nodes: Array<{ key: string; label: string; kind: string }> = [
    { key: 'identity', kind: 'ROOT PRINCIPAL', label: 'HUMAN' },
    { key: 'agentA', kind: 'ISSUER', label: 'AGENT A' },
    { key: 'agentB', kind: 'DELEGATE', label: 'AGENT B' },
    { key: 'tool', kind: 'TOOL BOUNDARY', label: 'MCP TOOL' },
    { key: 'resource', kind: 'AUDIENCE', label: 'AWS / DB' }
  ];
  const edges = ['authorization', 'delegation', 'request', 'verification'];
  return (
    <div className="provenance" aria-label="Interactive provenance chain from human to resource">
      <p className="visual-label">PROVENANCE / TAP OR CLICK TO INSPECT</p>
      <div className="chain">
        {nodes.map((node, index) => (
          <div className="chain-part" key={node.key}>
            <button className="graph-node" onClick={() => setSelected(details[node.key])}>
              <small>{node.kind}</small>
              <strong>{node.label}</strong>
            </button>
            {index < edges.length ? (
              <div className="graph-edge">
                <span aria-hidden="true" />
                <button onClick={() => setSelected(details[edges[index]])}>
                  {['authorized', 'delegated', 'requested', 'verified'][index]}
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <aside className="detail-card" aria-live="polite">
        <header>
          <span>{selected.title}</span>
          <span className="verified-status">{selected.status ?? 'VERIFIED'}</span>
        </header>
        <div className="detail-body">
          <p className="uri">{selected.uri}</p>
          <dl>
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
          <p className="verified-line">signature verified</p>
        </div>
      </aside>
      <div className="legend">
        <span>delegation</span>
        <span>verified</span>
      </div>
    </div>
  );
}

export function App() {
  const [compact, setCompact] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [terminalReady, setTerminalReady] = useState(false);

  useEffect(() => {
    const onScroll = () => setCompact(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    const timer = window.setTimeout(() => setTerminalReady(true), 320);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.clearTimeout(timer);
    };
  }, []);

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
    ['Why', '#why'],
    ['How', '#how'],
    ['Protocol', '#protocol'],
    ['Security', '#security'],
    ['Get started', '#get-started']
  ];

  return (
    <>
      <nav className={`nav ${compact ? 'is-compact' : ''}`} aria-label="Primary navigation">
        <div className="wrap nav-inner">
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
          <a className="nav-cta" href={productConfig.links.documentation}>
            DOCS ↗
          </a>
          <button
            className="menu-button"
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation"
            onClick={() => setMenuOpen((open) => !open)}
          >
            MENU
          </button>
        </div>
        {menuOpen ? (
          <div id="mobile-navigation" className="mobile-nav">
            {navLinks.map(([label, href]) => (
              <a key={href} href={href} onClick={() => setMenuOpen(false)}>
                {label}
              </a>
            ))}
          </div>
        ) : null}
      </nav>
      <main id="top">
        <header className="hero">
          <div className="wrap">
            <p className="eyebrow">OPEN SOURCE · AGENT IDENTITY · DELEGATION</p>
            <div className="hero-grid">
              <div>
                <h1>
                  Know which agent acted.
                  <br />
                  Know who authorized it.
                </h1>
                <p className="hero-copy">
                  {productConfig.tagline} Portable cryptographic identity and delegation
                  infrastructure for autonomous software agents.
                </p>
                <div className="actions">
                  <a className="button primary" href={productConfig.links.repository}>
                    View on GitHub ↗
                  </a>
                  <a className="button" href="#protocol">
                    Read the protocol →
                  </a>
                </div>
                <p className="micro">Open source · Local-first · Protocol-oriented</p>
              </div>
              <ProvenanceGraph />
            </div>
          </div>
        </header>

        <section id="why">
          <Reveal className="wrap section-grid">
            <div>
              <p className="kicker">01 / THE PROBLEM</p>
              <h2>“Agent” isn't an audit trail.</h2>
              <p className="lead">
                When an agent acts across code hosts, tool protocols, cloud APIs, and internal
                services, the receiving system needs more than a username or API key.
              </p>
              <ul className="questions">
                <li>Who was it?</li>
                <li>Who authorized it?</li>
                <li>What could it do?</li>
                <li>Who delegated that authority?</li>
                <li>Was it still valid?</li>
              </ul>
            </div>
            <div className="unknown">
              <div className="unknown-sources">
                <span>Agent runtime</span>
                <span>Custom agent</span>
                <span>Automation</span>
              </div>
              <div className="unknown-flow">
                <div>
                  AGENT
                  <br />
                  REQUEST
                </div>
                <b>?</b>
                <div className="destinations">
                  <span>Code host</span>
                  <span>Cloud API</span>
                  <span>Tool server</span>
                  <span>Database</span>
                </div>
              </div>
            </div>
          </Reveal>
        </section>

        <section id="how">
          <Reveal className="wrap">
            <p className="kicker">02 / DELEGATION</p>
            <div className="section-grid">
              <div>
                <h2>Authority can be delegated without being inherited.</h2>
                <p className="lead">Delegation should narrow authority, not silently expand it.</p>
              </div>
              <div className="attenuation">
                <article>
                  <h3>AGENT A / ISSUER</h3>
                  <p>
                    repository.read <em>ALLOW</em>
                  </p>
                  <p>
                    repository.write <em>ALLOW</em>
                  </p>
                  <p>
                    deploy <em>ALLOW</em>
                  </p>
                </article>
                <div className="delegate-arrow">
                  DELEGATE <b>→</b>
                </div>
                <article>
                  <h3>AGENT B / DELEGATE</h3>
                  <p>
                    repository.read <em>ALLOW</em>
                  </p>
                  <p>
                    test.execute <em>ALLOW</em>
                  </p>
                  <strong className="deny">production.deploy → DENY</strong>
                </article>
              </div>
            </div>
          </Reveal>
        </section>

        <section>
          <Reveal className="wrap">
            <p className="kicker">03 / PROVENANCE</p>
            <h2>
              Trace the authority chain,
              <br />
              not just the request.
            </h2>
            <div className="trace">
              {['Human', 'Agent A', 'Agent B', 'Resource'].map((actor, index) => (
                <div key={actor}>
                  <small>
                    0{index + 1} / {['PRINCIPAL', 'AUTHORIZED', 'DELEGATED', 'REQUESTED'][index]}
                  </small>
                  <strong>{actor}</strong>
                </div>
              ))}
            </div>
            <div className="verified-summary">
              <strong>VERIFIED</strong>
              <span>Issuer</span>
              <span>Delegate</span>
              <span>Capability</span>
              <span>Resource</span>
              <span>Task</span>
              <span>Signature</span>
            </div>
          </Reveal>
        </section>

        <section>
          <Reveal className="wrap section-grid">
            <div>
              <p className="kicker">04 / EXISTING SYSTEMS</p>
              <h2>Designed to fit the systems you already use.</h2>
              <p className="lead">
                Integrate with existing identity systems instead of creating another isolated
                identity universe.
              </p>
            </div>
            <div>
              <div className="integration-grid">
                {[
                  'SPIFFE / SPIRE',
                  'MCP',
                  'A2A',
                  'OAuth / OIDC',
                  'Code hosts',
                  'Cloud IAM',
                  'Internal APIs'
                ].map((item, index) => (
                  <div key={item}>
                    <em>0{index + 1}</em>
                    {item}
                  </div>
                ))}
              </div>
              <p className="disclaimer">
                INTEGRATION TARGETS · NO AFFILIATION OR ENDORSEMENT IMPLIED
              </p>
            </div>
          </Reveal>
        </section>

        <section>
          <Reveal className="wrap section-grid">
            <div>
              <p className="kicker">05 / WORKLOAD IDENTITY</p>
              <h2>Use workload identity where it already works.</h2>
              <p className="lead">
                SPIFFE provides a mature foundation for cryptographic workload identity. This
                project adds agent-specific identity, delegation, and provenance semantics above it.
              </p>
            </div>
            <div className="identity-stack">
              <span>SPIFFE / SPIRE</span>
              <b>→</b>
              <span>Workload identity</span>
              <b>→</b>
              <span>Agent identity</span>
              <b>→</b>
              <span>Delegation</span>
              <b>→</b>
              <span>Action provenance</span>
            </div>
          </Reveal>
        </section>

        <section id="protocol" className="protocol-section">
          <Reveal className="wrap protocol-shell">
            <aside className="spec-index">
              <strong>SPEC</strong>
              <p>{productConfig.displayName} PROTOCOL / RFC-FIRST</p>
              <ol>
                <li>Identity</li>
                <li>Delegation</li>
                <li>Requests</li>
                <li>Verification</li>
                <li>Revocation</li>
              </ol>
            </aside>
            <div className="spec-copy">
              <p className="kicker">06 / RFC &amp; SPECIFICATION</p>
              <h2>A protocol before a platform.</h2>
              <p className="lead">
                The goal is not another proprietary agent identity service. It is an interoperable
                identity and delegation model that runtimes and infrastructure providers can
                implement.
              </p>
              <div className="protocol-flow">
                {['RFC', 'Reference implementation', 'SDKs', 'Adapters', 'Ecosystem'].map(
                  (item, index) => (
                    <div key={item}>
                      <b>{index ? '↓' : '01'}</b>
                      {item}
                    </div>
                  )
                )}
              </div>
              <a className="spec-link" href={productConfig.links.documentation}>
                Read the specification ↗
              </a>
            </div>
          </Reveal>
        </section>

        <section>
          <Reveal className="wrap section-grid">
            <div>
              <p className="kicker">07 / MCP</p>
              <h2>Make tool calls attributable.</h2>
              <p className="lead">
                Bind actor, task, capability, resource, and signature to the request crossing a tool
                boundary.
              </p>
            </div>
            <div className="code-block">
              <header>
                <span>SIGNED TOOL REQUEST</span>
                <CopyButton value={signedRequest} label="signed tool request" />
              </header>
              <pre>{signedRequest}</pre>
            </div>
          </Reveal>
        </section>

        <section id="security">
          <Reveal className="wrap section-grid">
            <div>
              <p className="kicker">08 / SECURITY MODEL</p>
              <h2>
                Cryptographic proof,
                <br />
                not another header.
              </h2>
              <p className="lead">
                Verification is deterministic and binds a request to its authority context.
              </p>
              <p className="fine">
                The RFC and implementation define the exact guarantees. This page makes no claim
                beyond that intended model.
              </p>
            </div>
            <div>
              <div className="security-formula">
                {[
                  'Identity',
                  'Delegation',
                  'Task',
                  'Resource',
                  'Timestamp',
                  'Nonce',
                  'Signature'
                ].map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
              <p className="security-result">VERIFIABLE REQUEST</p>
            </div>
          </Reveal>
        </section>

        <section id="get-started">
          <Reveal className="wrap section-grid">
            <div>
              <p className="kicker">09 / COMMAND LINE</p>
              <h2>Identity should be usable from the terminal.</h2>
              <p className="lead">
                Create an identity, delegate a capability, and verify the resulting chain without
                relying on an LLM or cloud service.
              </p>
            </div>
            <div className={`code-block terminal ${terminalReady ? 'terminal-ready' : ''}`}>
              <header>
                <span>TERMINAL / {productConfig.commandName.toUpperCase()}</span>
                <CopyButton value={cli} label="terminal commands" />
              </header>
              <pre>{cli}</pre>
            </div>
          </Reveal>
        </section>

        <section>
          <Reveal className="wrap section-grid">
            <div>
              <p className="kicker">10 / OPEN SOURCE</p>
              <h2>The protocol should be inspectable.</h2>
              <p className="lead">
                The specification, verification logic, adapters, and conformance tests belong in the
                open.
              </p>
              <div className="actions">
                <a className="button" href={productConfig.links.repository}>
                  Read the source ↗
                </a>
                <a className="button" href={productConfig.links.documentation}>
                  Read the docs ↗
                </a>
              </div>
            </div>
            <pre className="repo-tree">{`${productConfig.displayName.toLowerCase()}/\n├── protocol\n├── identity\n├── delegation\n├── verification\n├── adapters\n├── sdk\n├── cli\n└── tests`}</pre>
          </Reveal>
        </section>

        <section>
          <Reveal className="wrap">
            <p className="kicker">11 / ROADMAP</p>
            <h2>Build the protocol in the open.</h2>
            <div className="roadmap">
              {[
                [
                  'NOW',
                  'Agent identity · Cryptographic credentials · Delegation · Verification · CLI · TypeScript SDK · Audit / provenance'
                ],
                [
                  'NEXT',
                  'SPIFFE integration · A2A integration · Federation · Key rotation · Revocation registry · Policy integration'
                ],
                [
                  'LATER',
                  'Enterprise trust federation · KMS / HSM integrations · Multi-agent authorization · Cross-organization delegation'
                ]
              ].map(([title, content]) => (
                <article key={title}>
                  <h3>{title}</h3>
                  <p>{content}</p>
                </article>
              ))}
            </div>
          </Reveal>
        </section>

        <section className="final">
          <Reveal className="wrap final-inner">
            <div>
              <p className="kicker">OPEN INFRASTRUCTURE FOR TRUST BOUNDARIES</p>
              <h2>
                Give agents an identity.
                <br />
                Give actions a provenance.
              </h2>
              <p className="lead">
                Open infrastructure for autonomous software that needs to act across trust
                boundaries.
              </p>
            </div>
            <div className="actions">
              <a className="button primary" href={productConfig.links.repository}>
                GitHub ↗
              </a>
              <a className="button" href={productConfig.links.documentation}>
                Read the protocol ↗
              </a>
            </div>
          </Reveal>
        </section>
      </main>
      <footer className="wrap footer">
        <span>{productConfig.displayName} / OPEN SOURCE</span>
        <span>LOCAL-FIRST · PROTOCOL-ORIENTED</span>
        <a href={productConfig.links.security}>SECURITY ↗</a>
      </footer>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
