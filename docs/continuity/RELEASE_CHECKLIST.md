# Release Checklist

## Required gates

- [ ] Full CI passes from a clean checkout.
- [ ] Unit, fixture E2E, migration, recovery, and security gates pass.
- [ ] No open P0 findings.
- [ ] P1 findings are resolved or explicitly accepted.
- [ ] Database backup and upgrade path are tested.
- [ ] Windows installer and extension artifacts are reproducible.
- [ ] Diagnostic export is redacted.
- [ ] Checksums are generated.
- [ ] Continuity docs and state match Git.
- [ ] Final commit is pushed and remote hash verified.

Do not create a public GitHub Release without explicit user authorization.
