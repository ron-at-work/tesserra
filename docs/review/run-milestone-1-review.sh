#!/usr/bin/env bash
# Dependency-free mechanical guard for ATTEST Milestone 1 documentation work.
# Usage: bash docs/review/run-milestone-1-review.sh [approved-base-ref]
set -euo pipefail

readonly BASE_REF="${1:-}"
readonly ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"

if [[ -z "$ROOT" ]]; then
  printf 'ERROR: run this script inside a Git working tree.\n' >&2
  exit 2
fi
cd "$ROOT"

failures=0
warnings=0
tmp_files="$(mktemp)"
trap 'rm -f "$tmp_files"' EXIT

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  failures=$((failures + 1))
}

warn() {
  printf 'WARN: %s\n' "$*" >&2
  warnings=$((warnings + 1))
}

note() {
  printf 'OK: %s\n' "$*"
}

if [[ -n "$BASE_REF" ]]; then
  if ! git rev-parse --verify --quiet "${BASE_REF}^{commit}" >/dev/null; then
    printf 'ERROR: base ref %q does not resolve to a commit.\n' "$BASE_REF" >&2
    exit 2
  fi
  git diff --name-only --diff-filter=ACMR "$BASE_REF"...HEAD >"$tmp_files"
  git diff --name-only --diff-filter=ACMR "$BASE_REF" >>"$tmp_files"
  git ls-files --others --exclude-standard >>"$tmp_files"
  sort -u -o "$tmp_files" "$tmp_files"
  note "auditing changes against ${BASE_REF} plus untracked files"
else
  {
    git diff --name-only --diff-filter=ACMR
    git diff --cached --name-only --diff-filter=ACMR
    git ls-files --others --exclude-standard
  } | sort -u >"$tmp_files"
  note 'auditing staged, unstaged, and untracked working-tree files'
fi

if [[ ! -s "$tmp_files" ]]; then
  warn 'no changed files found; required-artifact checks still apply'
else
  while IFS= read -r path; do
    # Milestone 1 allows only reviewable documentation and conformance fixture
    # formats. All files outside these paths, and unsupported extensions inside
    # them, are prohibited until the checklist records implementation approval.
    case "$path" in
      docs/*.md|docs/**/*.md|docs/*.txt|docs/**/*.txt|docs/*.sh|docs/**/*.sh|docs/**/*.json|tests/conformance/*.md|tests/conformance/**/*.md|tests/conformance/*.txt|tests/conformance/**/*.txt|tests/conformance/*.sh|tests/conformance/**/*.sh|tests/conformance/*.json|tests/conformance/**/*.json|tests/conformance/self-check.py|tests/conformance/v1/self-check.py)
        ;;
      docs/*|tests/conformance/*)
        fail "unsupported Milestone 1 artifact extension (allowed: .md, .json, .sh, .txt): ${path}"
        ;;
      *)
        fail "Milestone 1 permits approved .md/.json/.sh/.txt files under docs/** or tests/conformance/**, plus Python only at the two approved self-check paths: ${path}"
        ;;
    esac
  done <"$tmp_files"
fi

# Actual approved Milestone 1 evidence layout. Presence is mechanical evidence
# only; semantic, independent, and approval checks remain in the checklist.
required_files=(
  docs/README.md
  docs/requirements-traceability.md
  docs/milestone-1-review-checklist.md
  docs/review/README.md
  docs/review/run-milestone-1-review.sh
  docs/rfcs/0001-attest-v1-wire-protocol.md
  docs/security/threat-model.md
  docs/architecture/data-architecture.md
  docs/architecture/milestone-one-gate.md
  docs/architecture/public-surfaces.md
  docs/architecture/quality-and-release-architecture.md
  docs/architecture/repository-architecture.md
  docs/standards/README.md
  docs/standards/research-method.md
  docs/standards/source-register.md
  docs/standards/capability-matrix.md
  docs/standards/boundary-and-mapping.md
  docs/standards/scenarios.md
  docs/standards/open-questions-and-change-watch.md
  docs/decisions/README.md
  docs/decisions/0001-runtime-language-and-package-boundaries.md
  docs/decisions/0002-protocol-schema-canonicalization-and-core-ports.md
  docs/decisions/0003-local-keys-sqlite-and-data-lifecycle.md
  docs/decisions/0004-local-api-cli-sdk-and-adapters.md
  docs/decisions/0005-web-surfaces-testing-and-release.md
  docs/decisions/0006-milestone-one-no-code-unlock-gate.md
  docs/protocol/README.md
  tests/conformance/README.md
)
required_directories=(
  docs/protocol/schemas
  tests/conformance/v1
)

for path in "${required_files[@]}"; do
  if [[ -f "$path" ]]; then
    note "required evidence file present: ${path}"
  else
    fail "required evidence file missing: ${path}"
  fi
done

for path in "${required_directories[@]}"; do
  if [[ -d "$path" ]]; then
    note "required evidence directory present: ${path}/"
  else
    fail "required evidence directory missing: ${path}/"
  fi
done

# A fixture workstream may supply one dependency-light verifier in either
# canonical location. Bash checks are run with Bash; Python is permitted only at
# the exact two self-check paths and runs with python3. Absence is permitted
# while the corpus is under review.
fixture_self_checks=(
  tests/conformance/self-check.sh
  tests/conformance/v1/self-check.sh
  tests/conformance/self-check.py
  tests/conformance/v1/self-check.py
)
self_check_found=0
for path in "${fixture_self_checks[@]}"; do
  if [[ -f "$path" ]]; then
    self_check_found=1
    note "running fixture self-check: ${path}"
    case "$path" in
      *.sh)
        if bash "$path"; then
          note "fixture self-check passed: ${path}"
        else
          fail "fixture self-check failed: ${path}"
        fi
        ;;
      *.py)
        if command -v python3 >/dev/null 2>&1; then
          if python3 "$path"; then
            note "fixture self-check passed: ${path}"
          else
            fail "fixture self-check failed: ${path}"
          fi
        else
          fail "python3 is required to run fixture self-check: ${path}"
        fi
        ;;
    esac
  fi
done
if (( self_check_found == 0 )); then
  note 'no fixture self-check supplied; independent reproduction remains pending human review'
fi

# `credential_purpose` is a current field. Its legacy `agent-signing` value,
# or any value outside the two allowed purposes, is forbidden. Validate JSON
# fixture instances and schema property enums directly with Python stdlib. This
# is defense in depth while the enhanced self-check enforces structural,
# manifest, and derivation coverage. A full Draft 2020-12 validation run remains
# captured independent-review evidence rather than a new milestone dependency.
if ! python3 - docs/protocol/schemas tests/conformance <<'PY'
import json
import sys
from pathlib import Path

allowed = {"agent-root-authority", "agent-key-binding"}
errors = []

def inspect(value, location):
    if isinstance(value, dict):
        if "credential_purpose" in value:
            purpose = value["credential_purpose"]
            if isinstance(purpose, str):
                if purpose not in allowed:
                    errors.append(f"{location}: invalid credential_purpose value {purpose!r}")
            elif isinstance(purpose, dict):
                enum = purpose.get("enum")
                if enum is not None and set(enum) != allowed:
                    errors.append(f"{location}: credential_purpose enum must be {sorted(allowed)!r}")
        for key, child in value.items():
            inspect(child, f"{location}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            inspect(child, f"{location}[{index}]")

for root_arg in sys.argv[1:]:
    for path in Path(root_arg).rglob("*.json"):
        try:
            inspect(json.loads(path.read_text()), str(path))
        except (UnicodeDecodeError, json.JSONDecodeError):
            # Raw malformed corpus files are intentionally not valid JSON/UTF-8.
            if "malformed" not in path.parts:
                errors.append(f"{path}: invalid JSON outside malformed corpus")

if errors:
    print("\n".join(errors), file=sys.stderr)
    raise SystemExit(1)
PY
then
  fail "invalid credential_purpose value or enum in protocol schemas or conformance fixtures"
fi

printf '\nSummary: %d failure(s), %d warning(s).\n' "$failures" "$warnings"
if (( failures > 0 )); then
  printf 'Milestone 1 remains mechanically blocked. See docs/milestone-1-review-checklist.md.\n' >&2
  exit 1
fi
printf 'Mechanical audit passed. The gate remains pending the human and independent-review evidence plus explicit user approval recorded in docs/milestone-1-review-checklist.md.\n'
