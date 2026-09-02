import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { navigation, pages, quickStart, type DocumentPage } from './content';
import { productConfig } from './product';

const focusableSelector = 'button:not([disabled]), a[href], input:not([disabled])';

function routeFromHash(): string | undefined {
  const match = window.location.hash.match(/^#\/([a-z0-9-]+)$/i);
  const id = match?.[1];
  return id && pages.some((page) => page.id === id) ? id : undefined;
}

function sectionId(title: string): string {
  return title
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/(^-|-$)/g, '');
}

function sourceUrl(source: string): string {
  const normalized = source.replace(/\/$/, '');
  const view = source.endsWith('/') ? 'tree' : 'blob';
  return `${productConfig.links.repository}/${view}/main/${normalized}`;
}

function Icon({ name }: { name: 'menu' | 'search' | 'close' | 'copy' }) {
  if (name === 'menu') return <span aria-hidden="true">☰</span>;
  if (name === 'close') return <span aria-hidden="true">×</span>;
  if (name === 'copy') return <span aria-hidden="true">□</span>;
  return <span aria-hidden="true">⌕</span>;
}

function useFocusTrap(
  open: boolean,
  container: RefObject<HTMLElement | null>,
  initialFocus: RefObject<HTMLElement | null>,
  restoreFocus: RefObject<HTMLElement | null>,
  onClose: () => void
) {
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    restoreFocus.current = previous;
    const focusInitial = () => initialFocus.current?.focus();
    const timer = window.setTimeout(focusInitial, 0);
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const elements = Array.from(
        container.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? []
      );
      if (elements.length === 0) return;
      const first = elements[0]!;
      const last = elements[elements.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', keydown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', keydown);
      window.setTimeout(() => restoreFocus.current?.focus(), 0);
    };
  }, [container, initialFocus, onClose, open, restoreFocus]);
}

function CopyButton({
  value,
  label,
  onCopied
}: {
  value: string;
  label: string;
  onCopied: (message: string) => void;
}) {
  const [state, setState] = useState('Copy');
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState('Copied');
      onCopied(`${label} copied to clipboard.`);
      window.setTimeout(() => setState('Copy'), 1800);
    } catch {
      setState('Select code');
      onCopied(`Could not copy ${label}. Select the code manually.`);
    }
  }
  return (
    <button className="copy-button" onClick={() => void copy()} aria-label={`Copy ${label}`}>
      <Icon name="copy" />
      {state}
    </button>
  );
}

function CodeBlock({
  value,
  label,
  onCopied
}: {
  value: string;
  label: string;
  onCopied: (message: string) => void;
}) {
  return (
    <div className="code-block">
      <div className="code-head">
        <span>pnpm</span>
        <CopyButton value={value} label={label} onCopied={onCopied} />
      </div>
      <pre>
        <code>{value}</code>
      </pre>
    </div>
  );
}

function Badge({ status }: { status: DocumentPage['status'] }) {
  return <span className={`badge ${status.toLowerCase()}`}>{status}</span>;
}

function PageBody({
  page,
  onNavigate,
  onCopied
}: {
  page: DocumentPage;
  onNavigate: (id: string) => void;
  onCopied: (message: string) => void;
}) {
  const headings = page.sections.map((section) => section.title);
  return (
    <main className="document-shell" id="main-content">
      <article className="document">
        {page.id !== 'overview' && (
          <nav className="breadcrumb" aria-label="Breadcrumb">
            <button onClick={() => onNavigate('overview')}>Documentation</button>
            <span>/</span>
            <span>{page.group}</span>
          </nav>
        )}
        <p className="eyebrow">{page.eyebrow}</p>
        <h1>{page.title}</h1>
        <p className="summary">{page.summary}</p>
        <div className="metadata">
          <Badge status={page.status} />
          <a className="badge source-badge" href={sourceUrl(page.source)}>
            Source: {page.source} ↗
          </a>
        </div>
        {page.id === 'rfc-0001' && (
          <aside className="notice">
            <strong>Project-defined specification</strong>
            <p>
              TESSERRA is a replaceable display name and MUST NOT occur in signed or wire values.
              This profile does not replace external identity, authorization, workload, or transport
              standards.
            </p>
          </aside>
        )}
        {page.id === 'overview' && <OverviewActions onNavigate={onNavigate} onCopied={onCopied} />}
        {page.sections.map((section) => (
          <section key={section.title} id={sectionId(section.title)}>
            <h2>{section.title}</h2>
            {section.body.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            {section.code && (
              <CodeBlock
                value={section.code}
                label={`${page.title} code example`}
                onCopied={onCopied}
              />
            )}
            {section.table && (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      {section.table.headings.map((heading) => (
                        <th key={heading}>{heading}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {section.table.rows.map((row) => (
                      <tr key={row.join()}>
                        {row.map((cell) => (
                          <td key={cell}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))}
        {page.id !== 'overview' && (
          <nav className="pager" aria-label="Documentation navigation">
            <button onClick={() => onNavigate('overview')}>← Documentation overview</button>
            <a href={sourceUrl(page.source)}>View source ↗</a>
          </nav>
        )}
      </article>
      {page.id !== 'overview' && (
        <aside className="toc" aria-label="On this page">
          <p>On this page</p>
          {headings.map((heading) => (
            <a key={heading} href={`#${sectionId(heading)}`}>
              {heading}
            </a>
          ))}
          <a className="toc-source" href={sourceUrl(page.source)}>
            View source ↗
          </a>
        </aside>
      )}
    </main>
  );
}

function OverviewActions({
  onNavigate,
  onCopied
}: {
  onNavigate: (id: string) => void;
  onCopied: (message: string) => void;
}) {
  const cards = [
    [
      'rfc-0001',
      '01 / PROTOCOL',
      'Protocol & RFC',
      'Normative wire semantics, trust rules, ordered verification, and versioned schemas.'
    ],
    [
      'quick-start',
      '02 / GUIDES',
      'Guides',
      'Local setup, delegation and signed-request lifecycle, benchmarking, and roadmap.'
    ],
    [
      'cli',
      '03 / REFERENCE',
      'CLI, API & SDK',
      'Typed developer surfaces, stable commands, request contracts, and availability notes.'
    ],
    [
      'mcp',
      '04 / ADAPTERS',
      'MCP, SPIFFE & A2A',
      'Narrow integration boundaries that preserve each protocol’s existing responsibilities.'
    ]
  ] as const;
  return (
    <>
      <div className="hero-actions">
        <button className="primary" onClick={() => onNavigate('quick-start')}>
          Get started <span>→</span>
        </button>
        <button className="secondary" onClick={() => onNavigate('rfc-0001')}>
          Read RFC 0001
        </button>
      </div>
      <section className="quickstart">
        <div>
          <p className="label">Quick start</p>
          <h2>Verify the shipped evidence locally.</h2>
          <p>
            Install, build, and run the deterministic conformance suite. Verification does not
            require a network call.
          </p>
        </div>
        <CodeBlock value={quickStart} label="quick start commands" onCopied={onCopied} />
      </section>
      <section className="explore">
        <div className="section-head">
          <h2>Explore the documentation</h2>
          <p>Start with the protocol model, then move to the surface you are integrating.</p>
        </div>
        <div className="cards">
          {cards.map(([id, index, title, detail]) => (
            <button className="card" key={id} onClick={() => onNavigate(id)}>
              <span>{index}</span>
              <b>↗</b>
              <h3>{title}</h3>
              <p>{detail}</p>
            </button>
          ))}
        </div>
      </section>
      <aside className="status-note">
        <strong>About this documentation</strong>
        <p>
          The protocol RFC, security model, and conformance fixtures are normative evidence. Guides
          describe current source behavior and clearly label partial or planned interfaces. Search
          filters this local page index only.
        </p>
      </aside>
    </>
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

function Navigation({
  active,
  onNavigate,
  mobile = false
}: {
  active: string;
  onNavigate: (id: string) => void;
  mobile?: boolean;
}) {
  return (
    <nav
      className={mobile ? 'mobile-navigation' : 'navigation'}
      aria-label="Documentation sections"
    >
      {navigation.map((group) => (
        <section className="nav-group" key={group}>
          <p>{group}</p>
          {pages
            .filter((page) => page.group === group)
            .map((page) => (
              <button
                className={page.id === active ? 'active' : ''}
                aria-current={page.id === active ? 'page' : undefined}
                key={page.id}
                onClick={() => onNavigate(page.id)}
              >
                {page.title.replace('RFC 0001: ', '')}
              </button>
            ))}
        </section>
      ))}
    </nav>
  );
}

function MobileDialog({
  active,
  onNavigate,
  onSearch,
  onClose
}: {
  active: string;
  onNavigate: (id: string) => void;
  onSearch: () => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreRef = useRef<HTMLElement>(null);
  useFocusTrap(true, dialogRef, closeRef, restoreRef, onClose);
  return (
    <div className="drawer-backdrop" onMouseDown={onClose}>
      <aside
        ref={dialogRef}
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Documentation navigation"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <button ref={closeRef} aria-label="Close documentation navigation" onClick={onClose}>
            <Icon name="close" />
          </button>
          <strong>{productConfig.displayName}</strong>
          <span className="version">Protocol v1</span>
        </header>
        <button className="drawer-search" onClick={onSearch}>
          <Icon name="search" />
          Search documentation
        </button>
        <Navigation active={active} onNavigate={onNavigate} mobile />
        <div className="drawer-links">
          <a href={productConfig.links.repository}>Repository</a>
          <a href={productConfig.links.security}>Security</a>
        </div>
      </aside>
    </div>
  );
}

function SearchDialog({
  query,
  results,
  onQuery,
  onNavigate,
  onClose
}: {
  query: string;
  results: readonly DocumentPage[];
  onQuery: (value: string) => void;
  onNavigate: (id: string) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const restoreRef = useRef<HTMLElement>(null);
  useFocusTrap(true, dialogRef, inputRef, restoreRef, onClose);
  return (
    <div className="search-backdrop" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className="search-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Search documentation"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div>
          <Icon name="search" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Search the local documentation index"
            aria-label="Search the local documentation index"
          />
          <button onClick={onClose} aria-label="Close search">
            Esc
          </button>
        </div>
        <p>Filters the local page index; it does not run a backend or repository-wide search.</p>
        <ul>
          {results.map((result) => (
            <li key={result.id}>
              <button onClick={() => onNavigate(result.id)}>
                <span>{result.group}</span>
                <strong>{result.title}</strong>
                <small>{result.summary}</small>
              </button>
            </li>
          ))}
          {results.length === 0 && (
            <li className="no-results">No indexed page matches “{query}”.</li>
          )}
        </ul>
      </section>
    </div>
  );
}

export function App() {
  const [active, setActive] = useState(() => routeFromHash() ?? 'overview');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const page = pages.find((item) => item.id === active) ?? pages[0]!;
  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    return term
      ? pages.filter((item) =>
          `${item.title} ${item.summary} ${item.searchable}`.toLowerCase().includes(term)
        )
      : pages;
  }, [query]);
  const navigate = (id: string) => {
    window.location.hash = `/${id}`;
    setActive(id);
    setMobileOpen(false);
    setSearchOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  useEffect(() => {
    const change = () => {
      const route = routeFromHash();
      if (route) setActive(route);
    };
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  return (
    <div className="app">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
      <header className="topbar">
        <button
          className="menu-button"
          aria-label="Open documentation navigation"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen(true)}
        >
          <Icon name="menu" />
        </button>
        <button
          className="brand"
          onClick={() => navigate('overview')}
          aria-label={`${productConfig.displayName} documentation home`}
        >
          <LogoMark />
          {productConfig.displayName}
        </button>
        <span className="divider" />
        <span className="docs-label">Documentation</span>
        <div className="top-actions">
          <button
            className="search-trigger"
            onClick={() => setSearchOpen(true)}
            aria-label="Search documentation"
          >
            <Icon name="search" />
            <span>Search documentation</span>
            <kbd>⌘ K</kbd>
          </button>
          <span className="version">Protocol v1</span>
          <a
            className="repo-link"
            href={productConfig.links.repository}
            aria-label="View repository"
          >
            ↗
          </a>
        </div>
      </header>
      <div className="layout">
        <aside className="sidebar">
          <Navigation active={page.id} onNavigate={navigate} />
        </aside>
        <PageBody page={page} onNavigate={navigate} onCopied={setAnnouncement} />
      </div>
      <footer>
        <span>{productConfig.displayName} documentation · Protocol v1</span>
        <span>
          <a href={productConfig.links.security}>Security</a> ·{' '}
          <a href={productConfig.links.repository}>Repository</a> ·{' '}
          <a href={`${productConfig.links.repository}/blob/main/LICENSE`}>License</a>
        </span>
      </footer>
      {mobileOpen && (
        <MobileDialog
          active={page.id}
          onNavigate={navigate}
          onSearch={() => {
            setMobileOpen(false);
            setSearchOpen(true);
          }}
          onClose={() => setMobileOpen(false)}
        />
      )}
      {searchOpen && (
        <SearchDialog
          query={query}
          results={results}
          onQuery={setQuery}
          onNavigate={navigate}
          onClose={() => setSearchOpen(false)}
        />
      )}
    </div>
  );
}
