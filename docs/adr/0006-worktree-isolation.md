# ADR 0006 — Git Worktree isolation and patch-replay acceptance

Status: Accepted in V1.3. Scope: **hygiene isolation and trusted patch replay**, not an OS sandbox.

## Decision

- The Coding Agent runs in a detached candidate Git Worktree starting at a pinned base SHA.
- The review workspace is created *only after* the Agent exits and receives the proposed change as a reviewed Git binary patch.
- Check definitions and their supporting files are taken from the committed trusted base, never from the Agent's patch. A strict changed-path allowlist, protected-path denylist, no-delete/no-rename/no-symlink rule, file-count bound, size bound and Git-status checks are enforced.
- A separate test runner executes configured commands in the review Worktree, and an independent deterministic evaluator decides whether Story state becomes passed.
- A successful candidate is committed to `refs/heads/ralph/run-<uuid>` only; the source `main` and working directory remain untouched.
- Run state and evidence live in `.ralph/`, outside both ephemeral Worktrees; the accepted patch is identified by base SHA and patch hash.
- The default V1.3 `--verify` CLI uses this runner. V1.2 in-place behavior is available only via explicit `--unsafe-inplace`.

## Tradeoffs and limitations

A clean, committed baseline is required. Git Worktree creation and patch replay introduce overhead. Source deletions, renames, symlinks and executable changes are intentionally excluded from this first batch. Tests that mutate tracked or untracked files fail closed unless their generated outputs are Git-ignored.

Git Worktrees share Git metadata and the same process identity. Neither repo metadata nor `.ralph` evidence is tamper-proof against a hostile same-user Agent; external sandboxing and supervisor-held evidence are needed for a genuine security boundary.

## Next (V1.4)

Container isolation with a different UID, trusted read-only test mounts, sealed supervisor evidence, crash-safe ref/state reconciliation, cancellation and lease recovery, signed/checksummed proof bundles, and source-level auditing.
