-- NexusWatch Phase 4/5 hardening
-- Adds lexical retrieval, immutable audit events, stricter policies, and richer provenance.

create extension if not exists pg_trgm;

create table if not exists nexus.audit_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  entity_id uuid,
  actor_id uuid,
  payload jsonb not null default '{}'::jsonb,
  previous_hash text,
  event_hash text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists idx_nexus_audit_events_created on nexus.audit_events(created_at desc);
create index if not exists idx_nexus_audit_events_entity on nexus.audit_events(entity_id);

create or replace function nexus.log_audit_event(
  p_event_type text,
  p_entity_id uuid default null,
  p_actor_id uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = nexus, public
as $$
declare
  v_previous_hash text;
  v_event_hash text;
  v_event_id uuid;
begin
  select event_hash
  into v_previous_hash
  from nexus.audit_events
  order by created_at desc
  limit 1;

  v_event_hash := encode(
    digest(
      concat_ws('|',
        coalesce(v_previous_hash, ''),
        coalesce(p_event_type, ''),
        coalesce(p_entity_id::text, ''),
        coalesce(p_actor_id::text, ''),
        coalesce(p_payload::text, ''),
        now()::text
      ),
      'sha256'
    ),
    'hex'
  );

  insert into nexus.audit_events (
    event_type,
    entity_id,
    actor_id,
    payload,
    previous_hash,
    event_hash
  )
  values (
    p_event_type,
    p_entity_id,
    p_actor_id,
    coalesce(p_payload, '{}'::jsonb),
    v_previous_hash,
    v_event_hash
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;

create or replace function nexus.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_nexus_sources_updated_at on nexus.sources;
create trigger trg_nexus_sources_updated_at
before update on nexus.sources
for each row execute function nexus.set_updated_at();

create index if not exists idx_nexus_chunks_fts
  on nexus.chunks using gin (to_tsvector('english', coalesce(text_content, '')));

create or replace function nexus.match_chunks_lexical(
  query_text text,
  match_count integer default 8,
  source_filter text[] default null,
  sensitivity_filter text[] default null,
  min_rank real default 0.03
)
returns table (
  chunk_id uuid,
  document_id uuid,
  source_id text,
  source_name text,
  title text,
  chunk_index integer,
  text_content text,
  confidence numeric,
  lexical_rank real,
  citation_id uuid,
  citation_label text,
  citation_snippet text,
  citation_url text,
  sensitivity text,
  metadata jsonb
)
language sql
stable
as $$
  with ranked as (
    select
      c.id as chunk_id,
      d.id as document_id,
      s.source_id,
      s.name as source_name,
      d.title,
      c.chunk_index,
      c.text_content,
      c.confidence,
      ts_rank_cd(
        to_tsvector('english', coalesce(c.text_content, '')),
        websearch_to_tsquery('english', query_text)
      ) as lexical_rank,
      d.sensitivity,
      c.metadata
    from nexus.chunks c
    join nexus.documents d on d.id = c.document_id
    join nexus.sources s on s.id = d.source_id
    where
      length(trim(coalesce(query_text, ''))) > 0
      and (source_filter is null or s.source_id = any(source_filter))
      and (sensitivity_filter is null or d.sensitivity = any(sensitivity_filter))
  )
  select
    r.chunk_id,
    r.document_id,
    r.source_id,
    r.source_name,
    r.title,
    r.chunk_index,
    r.text_content,
    r.confidence,
    r.lexical_rank,
    c.id as citation_id,
    c.citation_label,
    c.snippet as citation_snippet,
    coalesce(c.citation_url, s.canonical_url) as citation_url,
    r.sensitivity,
    r.metadata
  from ranked r
  join nexus.documents d on d.id = r.document_id
  join nexus.sources s on s.id = d.source_id
  left join lateral (
    select ci.id, ci.citation_label, ci.snippet, ci.citation_url
    from nexus.citations ci
    where ci.chunk_id = r.chunk_id
    order by ci.created_at desc
    limit 1
  ) c on true
  where r.lexical_rank >= greatest(min_rank, 0.0)
  order by r.lexical_rank desc, r.confidence desc
  limit greatest(match_count, 1);
$$;

create or replace function nexus.get_provenance(p_provenance_id uuid)
returns jsonb
language sql
stable
as $$
  with answer as (
    select *
    from nexus.answer_logs
    where provenance_id = p_provenance_id
    limit 1
  ),
  query as (
    select q.*
    from nexus.query_logs q
    join answer a on a.query_id = q.id
  ),
  chunk_rows as (
    select
      c.id,
      c.document_id,
      c.chunk_index,
      c.confidence,
      c.section_path,
      c.page_number,
      c.metadata,
      d.title,
      d.source_id as source_uuid,
      d.external_document_id,
      d.origin_path,
      s.source_id,
      s.name as source_name,
      s.canonical_url,
      s.license
    from answer a
    join lateral unnest(a.retrieved_chunk_ids) as retrieved(chunk_id) on true
    join nexus.chunks c on c.id = retrieved.chunk_id
    join nexus.documents d on d.id = c.document_id
    join nexus.sources s on s.id = d.source_id
  ),
  citation_rows as (
    select c.*
    from nexus.answer_citations ac
    join answer a on ac.answer_id = a.id
    join nexus.citations c on c.id = ac.citation_id
  ),
  audit_rows as (
    select ae.*
    from nexus.audit_events ae
    join answer a on ae.entity_id = a.id
    order by ae.created_at asc
  )
  select jsonb_build_object(
    'provenance_id', p_provenance_id,
    'query', (select to_jsonb(query.*) from query),
    'answer', (select to_jsonb(answer.*) from answer),
    'chunks', coalesce((select jsonb_agg(to_jsonb(chunk_rows.*)) from chunk_rows), '[]'::jsonb),
    'citations', coalesce((select jsonb_agg(to_jsonb(citation_rows.*)) from citation_rows), '[]'::jsonb),
    'audit_events', coalesce((select jsonb_agg(to_jsonb(audit_rows.*)) from audit_rows), '[]'::jsonb)
  );
$$;

alter table nexus.audit_events enable row level security;

drop policy if exists "nexus_query_logs_authenticated" on nexus.query_logs;
drop policy if exists "nexus_answer_logs_authenticated" on nexus.answer_logs;
drop policy if exists "nexus_feedback_authenticated" on nexus.feedback;
drop policy if exists "nexus_audit_events_authenticated" on nexus.audit_events;

drop policy if exists "nexus_query_logs_select" on nexus.query_logs;
drop policy if exists "nexus_query_logs_insert" on nexus.query_logs;
drop policy if exists "nexus_answer_logs_select" on nexus.answer_logs;
drop policy if exists "nexus_answer_logs_insert" on nexus.answer_logs;
drop policy if exists "nexus_feedback_select" on nexus.feedback;
drop policy if exists "nexus_feedback_insert" on nexus.feedback;

create policy "nexus_query_logs_select" on nexus.query_logs
  for select using (auth.role() = 'authenticated');
create policy "nexus_query_logs_insert" on nexus.query_logs
  for insert with check (auth.role() = 'authenticated' and (user_id is null or user_id = auth.uid()));

create policy "nexus_answer_logs_select" on nexus.answer_logs
  for select using (auth.role() = 'authenticated');
create policy "nexus_answer_logs_insert" on nexus.answer_logs
  for insert with check (auth.role() = 'authenticated');

create policy "nexus_feedback_select" on nexus.feedback
  for select using (auth.role() = 'authenticated');
create policy "nexus_feedback_insert" on nexus.feedback
  for insert with check (auth.role() = 'authenticated' and (created_by is null or created_by = auth.uid()));

create policy "nexus_audit_events_authenticated" on nexus.audit_events
  for select using (auth.role() = 'authenticated');
