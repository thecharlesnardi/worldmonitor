-- Expose nexus schema to PostgREST on managed Supabase and grant runtime access.

alter role authenticator set pgrst.db_schemas = 'public,graphql_public,nexus';

-- Ensure JWT roles can reference schema objects (RLS still governs row access).
grant usage on schema nexus to anon, authenticated, service_role;

grant select on all tables in schema nexus to authenticated;
grant select on all tables in schema nexus to service_role;
grant insert, update, delete on nexus.query_logs, nexus.answer_logs, nexus.answer_citations, nexus.feedback to authenticated;
grant all privileges on all tables in schema nexus to service_role;
grant usage, select on all sequences in schema nexus to authenticated, service_role;

alter default privileges in schema nexus grant select on tables to authenticated;
alter default privileges in schema nexus grant all on tables to service_role;
alter default privileges in schema nexus grant usage, select on sequences to authenticated, service_role;

-- Reload PostgREST config for this project.
notify pgrst, 'reload config';
