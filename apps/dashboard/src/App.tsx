import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import {
  type Agent,
  type ApiState,
  type CredentialDto,
  type VerificationResponse,
  type ProvenanceGraph,
  LocalDashboardApi,
  isDashboardApiError,
  isOfflineError
} from './api';

type Route =
  | 'overview'
  | 'agents'
  | 'delegations'
  | 'trust'
  | 'requests'
  | 'revocations'
  | 'verification'
  | 'provenance';

interface NavItem {
  readonly id: Route;
  readonly label: string;
  readonly mark: string;
}
const navigation: readonly NavItem[] = [
  { id: 'overview', label: 'Overview', mark: '▦' },
  { id: 'agents', label: 'Agents', mark: '◎' },
  { id: 'delegations', label: 'Delegations', mark: '↔' },
  { id: 'trust', label: 'Trust', mark: '◇' },
  { id: 'requests', label: 'Requests', mark: '▤' },
  { id: 'revocations', label: 'Revocations', mark: '⊘' },
  { id: 'verification', label: 'Verification', mark: '✓' },
  { id: 'provenance', label: 'Provenance', mark: '⌘' }
];
const api = new LocalDashboardApi();

function initialRoute(): Route {
  const found = navigation.find((item) => `#${item.id}` === window.location.hash);
  return found?.id ?? 'overview';
}

function useLocalData() {
  const [agents, setAgents] = useState<ApiState<readonly Agent[]>>({ status: 'loading' });
  const [trust, setTrust] = useState<ApiState<Record<string, unknown>>>({ status: 'loading' });
  const refresh = async () => {
    setAgents({ status: 'loading' });
    setTrust({ status: 'loading' });
    const update = <T,>(set: (next: ApiState<T>) => void, promise: Promise<T>) =>
      promise.then(
        (data) => set({ status: 'ready', data, updatedAt: new Date() }),
        (error: unknown) =>
          set({
            status: 'error',
            message: error instanceof Error ? error.message : 'Local API request failed.',
            offline: isDashboardApiError(error) && isOfflineError(error)
          })
      );
    await Promise.all([
      update(
        setAgents,
        api.listAgents().then((response) => response.items)
      ),
      update(
        setTrust,
        api.readTrustSnapshot().then((response) => response.snapshot)
      )
    ]);
  };
  useEffect(() => {
    void refresh();
  }, []);
  return { agents, trust, refresh };
}

export function App() {
  const [route, setRoute] = useState<Route>(initialRoute);
  const local = useLocalData();
  const navigate = (next: Route) => {
    window.location.hash = next;
    setRoute(next);
  };
  useEffect(() => {
    const handler = () => setRoute(initialRoute());
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);
  const selected = navigation.find((item) => item.id === route)!;

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Primary navigation">
        <Brand />
        <span className="nav-label">OPERATIONS</span>
        <nav>
          {navigation.map((item) => (
            <NavButton key={item.id} item={item} active={route === item.id} onNavigate={navigate} />
          ))}
        </nav>
        <Connection state={local.agents} />
      </aside>
      <header className="mobile-top">
        <Brand />
        <Connection state={local.agents} compact />
      </header>
      <main className="main">
        <div className="topbar">
          <span className="crumb">LOCAL CONTROL PLANE / {selected.label.toUpperCase()}</span>
          <button className="quiet-button" onClick={() => void local.refresh()}>
            ↻ Refresh
          </button>
        </div>
        <Page
          route={route}
          agents={local.agents}
          trust={local.trust}
          onRefresh={local.refresh}
          onNavigate={navigate}
        />
      </main>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {navigation.slice(0, 4).map((item) => (
          <NavButton key={item.id} item={item} active={route === item.id} onNavigate={navigate} />
        ))}
        <NavButton item={navigation[7]!} active={route === 'provenance'} onNavigate={navigate} />
      </nav>
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

function Brand() {
  return (
    <div className="brand">
      <LogoMark className="brand-mark" />
      <span>TESSERRA</span>
      <span className="local-chip">LOCAL</span>
    </div>
  );
}
function NavButton({
  item,
  active,
  onNavigate
}: {
  item: NavItem;
  active: boolean;
  onNavigate: (route: Route) => void;
}) {
  return (
    <button
      className={`nav-button ${active ? 'active' : ''}`}
      aria-current={active ? 'page' : undefined}
      onClick={() => onNavigate(item.id)}
    >
      <span aria-hidden="true">{item.mark}</span>
      <span>{item.label}</span>
    </button>
  );
}
function Connection({ state, compact = false }: { state: ApiState<unknown>; compact?: boolean }) {
  const label =
    state.status === 'ready'
      ? 'Local API connected'
      : state.status === 'loading'
        ? 'Checking local API'
        : state.offline
          ? 'Local API offline'
          : 'Local API error';
  return (
    <div
      className={`connection ${state.status === 'ready' ? 'connected' : state.status === 'error' ? 'error' : ''}`}
      title={label}
    >
      <i aria-hidden="true" />
      {!compact && (
        <>
          <span>{label}</span>
          <small>127.0.0.1:4318</small>
        </>
      )}
    </div>
  );
}

function Page({
  route,
  agents,
  trust,
  onRefresh,
  onNavigate
}: {
  route: Route;
  agents: ApiState<readonly Agent[]>;
  trust: ApiState<Record<string, unknown>>;
  onRefresh: () => Promise<void>;
  onNavigate: (route: Route) => void;
}) {
  switch (route) {
    case 'overview':
      return (
        <Overview agents={agents} trust={trust} onRefresh={onRefresh} onNavigate={onNavigate} />
      );
    case 'agents':
      return <Agents agents={agents} />;
    case 'trust':
      return <Trust trust={trust} />;
    case 'verification':
      return <Verification />;
    case 'provenance':
      return <Provenance agents={agents} />;
    case 'delegations':
      return (
        <Unavailable
          title="Delegations"
          eyebrow="Authority routing"
          description="Issue bounded authority between agents, with explicit scope, audience, and expiry."
          empty="No delegation records are available from the current local API."
        />
      );
    case 'requests':
      return (
        <Unavailable
          title="Requests"
          eyebrow="Decision queue"
          description="Review inbound requests before any local authority is exercised."
          empty="No request records are available from the current local API."
        />
      );
    case 'revocations':
      return (
        <Unavailable
          title="Revocations"
          eyebrow="Authority withdrawal"
          description="Publish and inspect local records that invalidate agents, delegations, or attestations."
          empty="No revocation records are available from the current local API."
          warning="A revocation is append-only and cannot be undone. Create one only after confirming the exact target identifier."
        />
      );
  }
}

function PageHeader({
  eyebrow,
  title,
  children
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <header className="page-head">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
      </div>
      {children}
    </header>
  );
}
function StateNotice({
  state,
  children,
  retry
}: {
  state: ApiState<unknown>;
  children: ReactNode;
  retry?: () => void;
}) {
  if (state.status === 'loading')
    return (
      <div className="state loading" role="status">
        <span className="spinner" />
        Loading local data…
      </div>
    );
  if (state.status === 'error')
    return (
      <div className="state error" role="alert">
        <strong>{state.offline ? 'Local API unavailable.' : 'Could not read local data.'}</strong>
        <span>{state.message}</span>
        {retry && (
          <button className="button subtle" onClick={retry}>
            Try again
          </button>
        )}
      </div>
    );
  return <>{children}</>;
}
function Empty({
  title,
  children,
  action
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="empty">
      <span className="empty-icon" aria-hidden="true">
        ◇
      </span>
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </section>
  );
}

function Overview({
  agents,
  trust,
  onRefresh,
  onNavigate
}: {
  agents: ApiState<readonly Agent[]>;
  trust: ApiState<Record<string, unknown>>;
  onRefresh: () => Promise<void>;
  onNavigate: (route: Route) => void;
}) {
  const agentCount = agents.status === 'ready' ? agents.data.length : null;
  const trustedCount = trust.status === 'ready' ? Object.keys(trust.data).length : null;
  return (
    <>
      <PageHeader eyebrow="Local control plane" title="Overview">
        <button className="button" onClick={() => onNavigate('verification')}>
          Inspect proof <span>→</span>
        </button>
      </PageHeader>
      <p className="intro">
        Monitor this TESSERRA node without sending operational data off-device.
      </p>
      <section className="stats" aria-label="Local status">
        <Metric label="Agents" value={agentCount} />
        <Metric label="Trust entries" value={trustedCount} />
        <Metric label="Delegations" value={null} unavailable />
        <Metric label="Revocations" value={null} unavailable />
      </section>
      <div className="split">
        <section className="panel">
          <div className="panel-head">
            <h2>Recent local activity</h2>
            <button className="quiet-button" onClick={() => void onRefresh()}>
              Refresh
            </button>
          </div>
          <Empty title="No operations recorded">
            Signed requests, delegations, verification checks, and revocations will appear here in
            local chronological order.
          </Empty>
        </section>
        <section className="panel safeguards">
          <h2>Local safeguards</h2>
          <p>
            <b>Encrypted operational state is available.</b> The dashboard never renders private key
            material.
          </p>
          <p>
            <b>Nothing leaves this device automatically.</b> Local API status reflects only the
            configured loopback service.
          </p>
        </section>
      </div>
    </>
  );
}
function Metric({
  label,
  value,
  unavailable = false
}: {
  label: string;
  value: number | null;
  unavailable?: boolean;
}) {
  return (
    <article className="metric">
      <span>{label}</span>
      <strong>{value === null ? '—' : value}</strong>
      <small>
        {unavailable
          ? 'Not exposed by this API'
          : value === null
            ? 'Checking local API'
            : 'From current local API response'}
      </small>
    </article>
  );
}

function Agents({ agents }: { agents: ApiState<readonly Agent[]> }) {
  return (
    <>
      <PageHeader eyebrow="Identity registry" title="Agents" />
      <p className="intro">
        Manage local signing identities and inspect the authority each one can exercise.
      </p>
      <section className="panel">
        <StateNotice state={agents}>
          {agents.status === 'ready' &&
            (agents.data.length === 0 ? (
              <Empty title="No agents yet">
                Import an existing identity or create a device-local agent to begin issuing and
                verifying attestations.
              </Empty>
            ) : (
              <AgentTable agents={agents.data} />
            ))}
        </StateNotice>
      </section>
    </>
  );
}
function AgentTable({ agents }: { agents: readonly Agent[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Agent</th>
            <th>Credential purpose</th>
            <th>Valid until</th>
            <th>Evidence</th>
          </tr>
        </thead>
        <tbody>
          {agents.map((agent) => (
            <tr key={agent.id}>
              <td>
                <strong>{String(agent.credential.subject.id)}</strong>
                <code>{agent.id}</code>
              </td>
              <td>{agent.credential.credential_purpose}</td>
              <td>{formatTime(agent.credential.expires_at)}</td>
              <td>
                <code>{agent.credential.key_id}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Trust({ trust }: { trust: ApiState<Record<string, unknown>> }) {
  const entries = trust.status === 'ready' ? Object.entries(trust.data) : [];
  return (
    <>
      <PageHeader eyebrow="Policy boundary" title="Trust" />
      <p className="intro">
        Define which issuers and verification methods this node accepts for sensitive operations.
      </p>
      <section className="panel">
        <StateNotice state={trust}>
          {trust.status === 'ready' &&
            (entries.length === 0 ? (
              <Empty title="Trust store is empty">
                No issuer is trusted by default. Add a fingerprint or DID only after verifying it
                through an independent channel.
              </Empty>
            ) : (
              <dl className="definition-list">
                {entries.map(([key, value]) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>
                      <code>{typeof value === 'string' ? value : JSON.stringify(value)}</code>
                    </dd>
                  </div>
                ))}
              </dl>
            ))}
        </StateNotice>
      </section>
      <aside className="notice">
        <strong>Deny by default.</strong> Unrecognized issuers remain rejected until explicitly
        trusted by the local policy.
      </aside>
    </>
  );
}

function Verification() {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<ApiState<VerificationResponse> | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    let credential: CredentialDto;
    try {
      credential = JSON.parse(input) as CredentialDto;
    } catch {
      setResult({
        status: 'error',
        message: 'Enter one complete credential JSON object.',
        offline: false
      });
      return;
    }
    setResult({ status: 'loading' });
    try {
      setResult({
        status: 'ready',
        data: await api.verifyIdentity(credential),
        updatedAt: new Date()
      });
    } catch (error) {
      setResult({
        status: 'error',
        message: error instanceof Error ? error.message : 'Verification request failed.',
        offline: isOfflineError(error)
      });
    }
  };
  return (
    <>
      <PageHeader eyebrow="Proof inspector" title="Verification" />
      <p className="intro">
        Validate an attestation locally and review every check before trusting its claim.
      </p>
      <div className="split verify">
        <form className="panel" onSubmit={submit}>
          <label htmlFor="credential">
            Credential JSON <span>Required</span>
          </label>
          <textarea
            id="credential"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={'{\n  "version": "agent-proof/v1",\n  "kind": "credential"\n}'}
            spellCheck="false"
          />
          <div className="form-footer">
            <small>The credential is submitted only to the configured local API.</small>
            <button className="button" type="submit">
              Verify locally
            </button>
          </div>
        </form>
        <section className="panel result-panel" aria-live="polite">
          <h2>Decision</h2>
          {result === null ? (
            <Empty title="Awaiting attestation input">
              Paste a complete credential to request a deterministic local verification.
            </Empty>
          ) : (
            <StateNotice state={result}>
              {result.status === 'ready' && <Decision result={result.data} />}
            </StateNotice>
          )}
        </section>
      </div>
    </>
  );
}
function Decision({ result }: { result: VerificationResponse }) {
  return (
    <div className={`decision ${result.valid ? 'valid' : 'invalid'}`}>
      <strong>{result.valid ? 'Valid' : 'Invalid'}</strong>
      <code>{result.code}</code>
      <p>
        Checked at {formatTime(result.verifier_now)}.{' '}
        {result.warnings.length > 0 ? result.warnings.join(' ') : 'No warnings returned.'}
      </p>
      <dl>
        <div>
          <dt>Evidence</dt>
          <dd>{result.evidence_ids.length}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{result.status_fresh ? 'Fresh' : 'Not fresh'}</dd>
        </div>
        <div>
          <dt>Replay checked</dt>
          <dd>{result.replay_checked ? 'Yes' : 'No'}</dd>
        </div>
      </dl>
    </div>
  );
}

function Provenance({ agents }: { agents: ApiState<readonly Agent[]> }) {
  const [selected, setSelected] = useState<string | null>(null);
  const evidence = agents.status === 'ready' ? agents.data : [];
  // The current local API does not expose a graph route. Do not infer edges from ordered records.
  const graph = unavailableGraph();
  const selectedEvidence = evidence.find((agent) => agent.id === selected);

  return (
    <>
      <PageHeader eyebrow="Relationship explorer" title="Provenance graph" />
      <p className="intro">
        Trace agents, delegations, attestations, and artifacts without uploading graph data.
      </p>
      <section className="panel graph-shell">
        <div className="graph-stage" aria-label="Provenance graph">
          {agents.status === 'loading' ? (
            <div className="state loading" role="status">
              <span className="spinner" />
              Loading local evidence…
            </div>
          ) : agents.status === 'error' ? (
            <div className="state error" role="alert">
              {agents.message}
            </div>
          ) : graph === null ? (
            <Empty title="Graph relationships unavailable">
              This local API does not currently return provenance relationships. No connections are
              inferred from evidence records.
            </Empty>
          ) : (
            <Graph graph={graph} selected={selected} onSelect={setSelected} />
          )}
        </div>
        <aside className="graph-detail">
          <h2>Selected evidence</h2>
          {selectedEvidence ? (
            <>
              <strong>{String(selectedEvidence.credential.subject.id)}</strong>
              <code>{selectedEvidence.id}</code>
              <p>Credential purpose: {selectedEvidence.credential.credential_purpose}</p>
              <p>
                Key reference: <code>{selectedEvidence.credential.key_id}</code>
              </p>
            </>
          ) : (
            <p>
              Choose an evidence record below to inspect its returned local fields. Graph
              relationships are unavailable from this API.
            </p>
          )}
        </aside>
      </section>
      {evidence.length > 0 && (
        <section className="panel evidence-list">
          <h2>Evidence list</h2>
          <p className="muted">
            Non-graph alternative. This list contains returned evidence records and does not imply a
            relationship.
          </p>
          {evidence.map((item) => (
            <button
              key={item.id}
              className="evidence-row"
              onClick={() => setSelected(item.id)}
              aria-pressed={selected === item.id}
            >
              <span>Agent credential</span>
              <strong>{String(item.credential.subject.id)}</strong>
              <code>{item.id}</code>
            </button>
          ))}
        </section>
      )}
    </>
  );
}
function unavailableGraph(): ProvenanceGraph | null {
  return null;
}
function Graph({
  graph,
  selected,
  onSelect
}: {
  graph: ProvenanceGraph;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const positions = graph.nodes.map((node, index) => ({
    node,
    x: 15 + ((index * 31) % 70),
    y: 22 + ((index * 29) % 55)
  }));
  const positionById = new Map(positions.map((position) => [position.node.id, position]));
  const renderedEdges = graph.edges.flatMap((edge) => {
    const source = positionById.get(edge.source);
    const target = positionById.get(edge.target);
    return source === undefined || target === undefined ? [] : [{ edge, source, target }];
  });
  return (
    <>
      <svg
        className="graph-lines"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {renderedEdges.map(({ edge, source, target }) => (
          <line
            key={edge.id}
            x1={`${source.x}%`}
            y1={`${source.y}%`}
            x2={`${target.x}%`}
            y2={`${target.y}%`}
          />
        ))}
      </svg>
      {positions.map(({ node, x, y }) => (
        <button
          key={node.id}
          className={`graph-node ${selected === node.id ? 'selected' : ''}`}
          style={{ left: `${x}%`, top: `${y}%` }}
          onClick={() => onSelect(node.id)}
          aria-pressed={selected === node.id}
          aria-label={`Select ${node.kind} ${node.label}`}
        >
          <span>◎</span>
          <small>{node.label}</small>
        </button>
      ))}
    </>
  );
}

function Unavailable({
  eyebrow,
  title,
  description,
  empty,
  warning
}: {
  eyebrow: string;
  title: string;
  description: string;
  empty: string;
  warning?: string;
}) {
  return (
    <>
      <PageHeader eyebrow={eyebrow} title={title} />
      <p className="intro">{description}</p>
      <section className="panel">
        <Empty title="Not available yet">{empty}</Empty>
      </section>
      {warning && (
        <aside className="notice warning">
          <strong>Operator warning.</strong> {warning}
        </aside>
      )}
    </>
  );
}
function formatTime(value: string) {
  const time = new Date(value);
  return Number.isNaN(time.valueOf()) ? value : time.toLocaleString();
}
