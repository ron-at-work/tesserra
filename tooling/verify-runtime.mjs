const requiredMajor = 24;
const actualMajor = Number.parseInt(process.versions.node.split('.')[0] ?? '', 10);

if (actualMajor !== requiredMajor) {
  console.error(
    `This workspace requires Node.js ${requiredMajor}. Current runtime: ${process.versions.node}. ` +
      'Install dependencies with `corepack pnpm install --frozen-lockfile` after selecting Node 24.'
  );
  process.exitCode = 1;
}
