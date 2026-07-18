# Release Checklist

## Required gates

- [x] Full CI passes from a clean checkout.
- [x] Unit, fixture E2E, migration, recovery, and security gates pass.
- [x] No open P0 findings.
- [x] P1 findings are resolved or explicitly accepted.
- [x] Database backup and upgrade path are tested.
- [x] Windows installer and extension artifacts are reproducible.
- [x] Diagnostic export is redacted.
- [x] Checksums are generated.
- [x] Selected Native Messaging host is packaged and registered with an exact extension origin.
- [x] Installed host survives restart and unregisters cleanly on uninstall.
- [x] Explicit `nativeMessaging` permission authorization is recorded and activated.
- [x] Live user-opened ChatGPT smoke is recorded.
- [x] Continuity docs and state match the final accepted Git checkpoint.
- [ ] Final checkpoint is pushed and remote hash verified.

Do not create a public GitHub Release without explicit user authorization.
