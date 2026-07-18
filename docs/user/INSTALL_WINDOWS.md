# Install on Windows

## Requirements

- Windows 10 or 11 x64.
- Microsoft Edge for the internal extension workflow.
- A normal per-user account; administrator access is not required for the default install.

## Install

1. Obtain `Codex-Context-Bridge-0.1.0-x64-setup.exe` from the internal beta artifact set.
2. Verify its SHA-256 value against `artifacts/internal-beta/SHA256SUMS.txt` supplied by the build owner.
3. Run the installer and choose a per-user destination.
4. Windows may show an unsigned-app warning. Verify the artifact hash and publisher context before continuing.
5. Start **Codex Context Bridge** from the Start menu.

The app stores its SQLite data in the Electron per-user application-data directory. Do not copy or edit the database while the app is running. Continue with [INSTALL_EDGE_EXTENSION.md](INSTALL_EDGE_EXTENSION.md).
