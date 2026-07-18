# Desktop UI Acceptance

## Checkpoint

The isolated Electron renderer was exercised from the built desktop artifact with a temporary
`CODEX_CONTEXT_BRIDGE_APP_DATA` directory and temporary Git fixture. The live acceptance harness
was rerun after each renderer/runtime fix; the final run recorded seven passing checks and an
inventory of 12 initial interactive nodes under:

`artifacts/ui-acceptance/2026-07-18T18-59-16-216Z/`

The final run used the packaged `win-unpacked/CodexContextBridge.exe` through an isolated
Electron user-data directory. It recorded 12 initial interactive nodes and seven passing checks;
the packaged window was also observed with Computer Use and showed the renderer (not a white
screen) before the scripted keyboard/click pass.

The manual Windows pass used Computer Use against a separately launched Electron window and
verified project creation, Tab/Shift-safe focus movement, Space/Enter activation, folder-picker
open/cancel, invalid-root rejection, valid preview/confirmation, alias creation, workflow start,
workflow cancellation, refresh, persistence after restart, and archive confirmation cancellation.
No real Edge, Codex Desktop, browser profile, credentials, or user project was touched.

## Defects found and fixed

- `file://` renderer assets were emitted as `/assets/...`, producing a white screen. Vite now uses
  a relative base.
- Sandboxed preload code was emitted with external Node dependencies and did not expose the typed
  API. The preload now uses a CommonJS build with bundled schema dependencies and a dedicated
  renderer-safe contract module.
- Repository preview/registration accepted missing or non-Git roots. Main-process validation now
  requires an existing non-symlink Git root and returns `REPOSITORY_ROOT_INVALID`.
- The folder picker was incorrectly subject to the ten-second IPC timeout. Picker cancellation
  remains valid after an extended user decision window; a regression test covers this boundary.
- The packaged app interpreted a CommonJS preload emitted as `preload.js` under the desktop
  package's ESM boundary. The preload now emits and loads as `preload.cjs`, with an artifact test
  protecting packaged parity.

## Scope limits

Live Edge capture and native-host installation were not rerun in this checkpoint because the
user's active Edge/native-host session must not be disrupted. ChatGPT submission remains disabled
by design. Archive confirmation was opened on fixture data and cancelled; the destructive confirm
action was not accepted.
