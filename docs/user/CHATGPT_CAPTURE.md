# ChatGPT Capture

Capture reads rendered messages only from a `chatgpt.com` tab the user opened. It does not read cookies, tokens, authorization headers, browser history, or profile databases.

- Existing conversations require an exact conversation identity in the URL.
- A new-chat page may produce a deterministic zero-message snapshot.
- Virtualized conversations are accumulated while preserving message order and duplicate text with stable IDs.
- Incomplete identified conversations fail instead of silently returning an empty snapshot.

Review the snapshot count/hash and context preview before approval. Composer insertion fills text but never submits it. Clear removes text only when its current hash still matches the approved inserted payload.
