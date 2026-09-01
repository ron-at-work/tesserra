# Documentation website

`@agent-proof/docs` is a separate static React/Vite documentation surface. It indexes curated, source-backed summaries of the repository documentation; it does not host a documentation backend or claim repository-wide search.

## Local development

From the workspace root, use the pinned Node and pnpm toolchain only:

```sh
corepack pnpm dev:docs
```

Do not install this workspace with npm or Yarn. `VITE_PREVIEW_HOST`, when set, must be one exact preview hostname without a scheme, port, or path.

## Checks

```sh
corepack pnpm --filter @agent-proof/docs typecheck
corepack pnpm --filter @agent-proof/docs test
corepack pnpm --filter @agent-proof/docs build
```

Content in `src/content.ts` uses only the canonical `Implemented`, `Partial`, `Planned`, and `Draft` statuses. Page source links resolve to the corresponding repository file or directory tree.
