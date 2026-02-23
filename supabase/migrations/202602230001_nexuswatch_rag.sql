-- NexusWatch RAG baseline for Supabase pgvector
-- Phase 3: documents, chunks, embeddings, sources, citations, query_logs, answer_logs

create extension if not exists vector;
create extension if not exists pgcrypto;

create schema if not exists nexus;

create table if not exists nexus.sources (
  id uuid primary key default gen_random_uuid(),
  source_id text not null unique,
  name text not null,
  category text not null,
  canonical_url text not null,
  license text not null,
  cadence text not null,
  owner text not null,
  sensitivity text not null check (sensitivity in ('public', 'internal', 'confidential', 'restricted')),
  parser text not null,
  freshness_sla text not null,
  validation_rules jsonb not null default '[]'::jsonb,
  confidence_model text not null,
  priority_tier text not null check (priority_tier in ('P0', 'P1', 'P2')),
  legal_notes text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists nexus.documents (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references nexus.sources(id) on delete restrict,
  external_document_id text,
  title text not null,
  mime_type text,
  language text default 'en',
  sensitivity text not null check (sensitivity in ('public', 'internal', 'confidential', 'restricted')),
  owner text,
  origin_path text,
  raw_artifact_hash text not null,
  checksum_sha256 text not null,
  created_at timestamptz not null default now(),
  ingested_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (source_id, checksum_sha256)
);

create table if not exists nexus.chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references nexus.documents(id) on delete cascade,
  chunk_index integer not null,
  text_content text not null,
  token_count integer,
  section_path text,
  page_number integer,
  confidence numeric(5,4) not null default 0.0,
  transform_version text not null,
  record_hash text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create table if not exists nexus.embeddings (
  id uuid primary key default gen_random_uuid(),
  chunk_id uuid not null unique references nexus.chunks(id) on delete cascade,
  embedding vector(1536) not null,
  embedding_model text not null,
  embedding_version text not null,
  created_at timestamptz not null default now()
);

create table if not exists nexus.citations (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references nexus.sources(id) on delete restrict,
  document_id uuid references nexus.documents(id) on delete set null,
  chunk_id uuid references nexus.chunks(id) on delete set null,
  citation_label text not null,
  citation_url text,
  snippet text,
  created_at timestamptz not null default now()
);

create table if not exists nexus.query_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  question text not null,
  active_layers jsonb not null default '[]'::jsonb,
  map_bbox jsonb,
  filters jsonb not null default '{}'::jsonb,
  top_k integer not null default 8,
  prompt_hash text,
  model_id text,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists nexus.answer_logs (
  id uuid primary key default gen_random_uuid(),
  query_id uuid not null references nexus.query_logs(id) on delete cascade,
  answer_text text not null,
  confidence numeric(5,4) not null default 0.0,
  refusal_reason text,
  provenance_id uuid not null default gen_random_uuid(),
  retrieved_chunk_ids uuid[] not null default '{}',
  matched_feature_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists nexus.answer_citations (
  id uuid primary key default gen_random_uuid(),
  answer_id uuid not null references nexus.answer_logs(id) on delete cascade,
  citation_id uuid not null references nexus.citations(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (answer_id, citation_id)
);

create table if not exists nexus.feedback (
  id uuid primary key default gen_random_uuid(),
  answer_id uuid not null references nexus.answer_logs(id) on delete cascade,
  rating text not null check (rating in ('up', 'down')),
  comment text,
  correction_tags text[] not null default '{}',
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_nexus_documents_source on nexus.documents(source_id);
create index if not exists idx_nexus_chunks_document on nexus.chunks(document_id);
create index if not exists idx_nexus_embeddings_vector on nexus.embeddings using ivfflat (embedding vector_cosine_ops) with (lists = 100);
create index if not exists idx_nexus_query_logs_created on nexus.query_logs(created_at desc);
create index if not exists idx_nexus_answer_logs_query on nexus.answer_logs(query_id);
create index if not exists idx_nexus_answer_logs_provenance on nexus.answer_logs(provenance_id);
create index if not exists idx_nexus_feedback_answer on nexus.feedback(answer_id);

create or replace function nexus.match_chunks(
  query_embedding vector(1536),
  match_count integer default 8,
  min_similarity real default 0.50,
  source_filter text[] default null,
  sensitivity_filter text[] default null
)
returns table (
  chunk_id uuid,
  document_id uuid,
  source_id text,
  title text,
  chunk_index integer,
  text_content text,
  confidence numeric,
  similarity real,
  citation_url text
)
language sql
stable
as $$
  select
    c.id as chunk_id,
    d.id as document_id,
    s.source_id,
    d.title,
    c.chunk_index,
    c.text_content,
    c.confidence,
    1 - (e.embedding <=> query_embedding) as similarity,
    s.canonical_url as citation_url
  from nexus.embeddings e
  join nexus.chunks c on c.id = e.chunk_id
  join nexus.documents d on d.id = c.document_id
  join nexus.sources s on s.id = d.source_id
  where
    (source_filter is null or s.source_id = any(source_filter))
    and (sensitivity_filter is null or d.sensitivity = any(sensitivity_filter))
    and (1 - (e.embedding <=> query_embedding)) >= min_similarity
  order by e.embedding <=> query_embedding
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
  citation_rows as (
    select c.*
    from nexus.answer_citations ac
    join answer a on ac.answer_id = a.id
    join nexus.citations c on c.id = ac.citation_id
  )
  select jsonb_build_object(
    'provenance_id', p_provenance_id,
    'query', (select to_jsonb(query.*) from query),
    'answer', (select to_jsonb(answer.*) from answer),
    'citations', coalesce((select jsonb_agg(to_jsonb(citation_rows.*)) from citation_rows), '[]'::jsonb)
  );
$$;

alter table nexus.sources enable row level security;
alter table nexus.documents enable row level security;
alter table nexus.chunks enable row level security;
alter table nexus.embeddings enable row level security;
alter table nexus.citations enable row level security;
alter table nexus.query_logs enable row level security;
alter table nexus.answer_logs enable row level security;
alter table nexus.answer_citations enable row level security;
alter table nexus.feedback enable row level security;

drop policy if exists "nexus_read_authenticated" on nexus.sources;
drop policy if exists "nexus_read_authenticated_documents" on nexus.documents;
drop policy if exists "nexus_read_authenticated_chunks" on nexus.chunks;
drop policy if exists "nexus_read_authenticated_embeddings" on nexus.embeddings;
drop policy if exists "nexus_read_authenticated_citations" on nexus.citations;
drop policy if exists "nexus_query_logs_authenticated" on nexus.query_logs;
drop policy if exists "nexus_answer_logs_authenticated" on nexus.answer_logs;
drop policy if exists "nexus_answer_citations_authenticated" on nexus.answer_citations;
drop policy if exists "nexus_feedback_authenticated" on nexus.feedback;

create policy "nexus_read_authenticated" on nexus.sources
  for select using (auth.role() = 'authenticated');
create policy "nexus_read_authenticated_documents" on nexus.documents
  for select using (auth.role() = 'authenticated');
create policy "nexus_read_authenticated_chunks" on nexus.chunks
  for select using (auth.role() = 'authenticated');
create policy "nexus_read_authenticated_embeddings" on nexus.embeddings
  for select using (auth.role() = 'authenticated');
create policy "nexus_read_authenticated_citations" on nexus.citations
  for select using (auth.role() = 'authenticated');
create policy "nexus_query_logs_authenticated" on nexus.query_logs
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "nexus_answer_logs_authenticated" on nexus.answer_logs
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "nexus_answer_citations_authenticated" on nexus.answer_citations
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "nexus_feedback_authenticated" on nexus.feedback
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
