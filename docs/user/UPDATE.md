# Update

1. Close the desktop app after confirming no workflow is actively dispatching.
2. Preserve the application-data directory or make a copy of the SQLite database.
3. Verify the new installer checksum and install the newer internal build.
4. Reload the unpacked Edge extension from the matching artifact set.
5. Start the app and verify project mappings and workflow history.

The app creates a versioned database copy before opening an existing database for migration. Migrations move forward only; rollback to an older binary may not understand a newer schema. Keep the backup until the updated build is accepted.
