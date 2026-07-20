ALTER TABLE codex_threads ADD COLUMN title TEXT;

UPDATE codex_threads SET title = NULL WHERE title IS NOT NULL AND trim(title) = '';
