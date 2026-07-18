# ADR-0001: Native Messaging for the Extension Boundary

- Status: Accepted
- Date: 2026-07-18
- Owners: Codex Context Bridge maintainers

## Context

The ChatGPT extension must exchange validated local messages with the desktop system without reading browser credentials, exposing a LAN listener, or giving rendered page content access to native APIs. The transport must support authentication or a capability, request correlation, replay resistance, bounded payloads, timeout, reconnect, and audit evidence.

The current extension manifest is deliberately narrow. Activating a production transport must not silently broaden its permissions during core protocol development.

## Decision

Use Chrome Native Messaging as the production browser-to-native boundary.

- Use a long-lived `runtime.connectNative()` port so Chrome owns process creation and disconnect lifecycle.
- Register a separate native host executable; do not make the Electron renderer or content script a native host.
- Restrict the native-host manifest to the exact extension origin through `allowed_origins`; wildcards are forbidden.
- Apply an application-layer ephemeral capability in addition to browser origin restriction.
- Validate every request and response against versioned schemas.
- Require request ID, nonce, short expiry, replay tracking, payload bound, rate limit, timeout, reconnect, and redacted audit events.
- Keep native-host registration and extension permission activation separate from the core app and defer them to the packaging/security gate.
- Do not add the `nativeMessaging` extension permission in this checkpoint. Until activation is explicitly accepted, the desktop status must report `permissionActive: false`.
- Retain manual clipboard transfer only as an Assisted-mode recovery path. It is never an authenticated automatic transport.

The Electron renderer receives only allowlisted methods exposed by preload. Raw `ipcRenderer`, filesystem, shell, child-process, database, and transport-port objects are not exposed.

## Alternatives

| Option              | Security and origin                                                                                           | Windows setup                                                         | Reconnect and offline                                | Testability                            | Decision      |
| ------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------- | ------------- |
| Native Messaging    | Exact extension origin, no listening socket, separate host process                                            | Installer/registry work required                                      | Long-lived port with explicit reconnect; fully local | Framing and host can be fixture-tested | Selected      |
| Localhost HTTP      | Requires loopback server, capability, origin checks, and CSRF/replay controls                                 | Simple runtime, but endpoint discovery and firewall behavior add risk | Polling or long-poll complexity                      | Easy unit tests                        | Rejected      |
| Localhost WebSocket | Persistent, but still opens a loopback listener and requires capability, origin, rate, and lifecycle controls | Port discovery and MV3 keepalive complexity                           | Good reconnect; Chrome 116+ keepalive required       | Good fixture support                   | Rejected      |
| Manual clipboard    | User-visible and permission-light                                                                             | No installer integration                                              | No reconnect or reliable correlation                 | Easy manual smoke only                 | Fallback only |

## Security Impact

- No service binds `0.0.0.0` or a LAN interface.
- Rendered ChatGPT content cannot choose a host, channel, shell command, path, or arbitrary IPC name.
- Capabilities are never logged and are removed before requests reach operation handlers.
- Invalid schema, authentication, expiry, replay, rate, and size failures use explicit codes without echoing sensitive payloads.
- Permission activation remains a visible future change rather than an implicit manifest expansion.

## Compatibility Impact

- Chrome/Chromium-compatible browsers need native-host registration per platform.
- Windows packaging must install the host manifest and registry entry.
- The extension build can compile and fixture-test the client before manifest activation.
- Manual clipboard remains available when native registration is unavailable.

## Validation

- Chrome Native Messaging documentation confirms separate-process stdio framing, exact `allowed_origins`, long-lived `connectNative()`, a 1 MB host-to-extension limit, and a 64 MiB extension-to-host limit.
- Chrome extension documentation confirms MV3 WebSocket service workers require lifecycle keepalive behavior and cross-origin network access requires host permission.
- Electron context-isolation documentation warns against exposing raw `ipcRenderer` and recommends one preload method per IPC message.
- Automated tests cover framing, fragmented messages, capability spoofing, expiry, replay, rate limiting, payload bounds, reconnect, request timeout, sender validation, runtime schema validation, and IPC timeout/error mapping.

## Consequences

The protocol and typed boundaries can be completed and verified without changing extension permissions. A later packaging/security checkpoint must implement and smoke-test the native executable, exact extension ID registration, installer behavior, and explicit manifest activation before any live transport claim is made.
