# Architecture Decision Records

Use ADRs for accepted decisions that constrain multiple packages or trust boundaries.

Each ADR should include status, context, decision, alternatives, security impact, compatibility impact, validation, and consequences. Do not create an ADR for a local implementation detail that can be understood from code and tests.

Accepted decisions:

- `0001-native-messaging-transport.md` - Native Messaging for the extension boundary, with permission activation deferred to the packaging/security gate.
