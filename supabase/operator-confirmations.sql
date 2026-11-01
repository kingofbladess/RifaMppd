-- Aplicar para habilitar confirmaciones explícitas de operadores.
-- El origen de las importaciones actuales se reconoce por su huella de foto;
-- no se inventan ni rellenan confirmaciones históricas.
create table if not exists public.participant_operator_confirmations (
  participant_id uuid primary key references public.participants(id) on delete cascade,
  confirmed_at timestamptz not null default now(),
  confirmed_by uuid references public.app_users(id) on delete set null,
  confirmed_by_name text not null
);
alter table public.participant_operator_confirmations enable row level security;
revoke all on public.participant_operator_confirmations from public, anon, authenticated;
revoke all on public.participant_operator_confirmations from service_role;
grant select, insert on public.participant_operator_confirmations to service_role;
