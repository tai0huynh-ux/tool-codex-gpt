# Troubleshooting

## Native host unavailable

Confirm the desktop app is installed and running, then reload the extension and ChatGPT tab. Do not manually edit registry entries.

## Extension receiver missing

Reload the ChatGPT tab. The worker retries one allowlisted content-script injection only for missing-receiver errors.

## Project confidence is low

Verify the repository root and remote, then select the correct project explicitly. Low confidence cannot auto-send.

## Capture incomplete or composer missing

Wait for the page to finish rendering, confirm the exact conversation URL, and retry capture. Do not overwrite an existing draft.

## App already installed

Do not run destructive clean-install smoke on an active installation. Use the non-destructive relay check or a separate clean Windows account/machine.

## Build or CI issue

Use Node.js `>=20.19`, the pinned pnpm version, `pnpm.cmd install --frozen-lockfile`, then `pnpm.cmd run verify`. Windows artifacts are unsigned in this beta.
