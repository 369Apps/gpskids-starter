-- Voice sales agent lead capture (Oct 22 2026): who is talking (parent/kid/unclear) and the child's first name (only if the parent offers it).
ALTER TABLE td_sessions ADD COLUMN speaker TEXT;
ALTER TABLE td_leads ADD COLUMN child_first_name TEXT;
