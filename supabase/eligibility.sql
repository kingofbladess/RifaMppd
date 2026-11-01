-- Aplicar una vez antes de publicar el filtro de elegibilidad.
-- Lista privada por rifa. Reemplazar una fila publica la lista completa de forma atómica.
-- No modifica participants ni draws existentes.
create table if not exists public.raffle_eligibility_lists (
  raffle_id uuid primary key references public.raffles(id) on delete cascade,
  document_numbers text[] not null,
  updated_at timestamptz not null default now(),
  updated_by text not null,
  constraint raffle_eligibility_list_size check (cardinality(document_numbers) between 1 and 10000),
  constraint raffle_eligibility_no_nulls check (array_position(document_numbers, null) is null)
);
alter table public.raffle_eligibility_lists enable row level security;
revoke all on public.raffle_eligibility_lists from public, anon, authenticated;
grant select, insert, update on public.raffle_eligibility_lists to service_role;
