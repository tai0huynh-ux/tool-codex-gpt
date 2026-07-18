# Release Checklist

## Required gates

- [ ] Full CI passes from a clean checkout.
- [x] Unit, fixture E2E, migration, recovery, and security gates pass.
- [x] No open P0 findings.
- [x] P1 findings are resolved or explicitly accepted.
- [x] Database backup and upgrade path are tested.
- [x] Windows installer and extension artifacts are reproducible.
- [x] Diagnostic export is redacted.
- [x] Checksums are generated.
- [ ] Continuity docs and state match Git.
- [ ] Final commit is pushed and remote hash verified.

Do not create a public GitHub Release without explicit user authorization.
