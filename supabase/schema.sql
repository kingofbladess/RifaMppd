-- =========================================================
-- Sistema de Rifa · Esquema Supabase
-- Ejecutar completo en: Supabase > SQL Editor > New query
-- =========================================================

-- ---------- Tablas ----------
create table if not exists public.raffles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  prize       text,
  draw_date   timestamptz,
  number_min  int  not null default 1,
  number_max  int  not null default 9999,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  check (number_min >= 0 and number_max > number_min)
);

-- Usuarios del sistema (operadores que registran y administradores)
create table if not exists public.app_users (
  id             uuid primary key default gen_random_uuid(),
  username       text not null unique check (username ~ '^[a-z0-9._-]{3,32}$'),
  full_name      text not null,
  password_hash  text not null,          -- scrypt, generado por la app
  role           text not null default 'operator',  -- admin, operator o tv (regla justo abajo)
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);
-- Roles: admin (todo), operator (solo registra) y tv (pantalla que solo muestra y gira la ruleta).
alter table public.app_users drop constraint if exists app_users_role_check;
alter table public.app_users add constraint app_users_role_check check (role in ('admin','operator','tv'));

create table if not exists public.participants (
  id                uuid primary key default gen_random_uuid(),
  raffle_id         uuid not null references public.raffles(id) on delete cascade,
  raffle_number     int  not null,
  full_name         text not null check (char_length(full_name) between 3 and 120),
  document_type     text not null check (document_type in ('CC','TI','CE','PAS','DNI','OTRO')),
  document_number   text not null check (char_length(document_number) between 4 and 30),
  email             text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone             text not null check (char_length(phone) between 7 and 20),
  birth_date        date not null,
  city              text,
  rank              text,            -- rango o cargo administrativo (viene de la API o se escribe)
  id_document_path  text,            -- ruta en bucket privado "documentos" (opcional)
  photo_path        text not null,   -- ruta en bucket privado "fotos"
  photo_source      text not null default 'camera' check (photo_source in ('api','camera')),
  consent_at        timestamptz not null,  -- fecha y hora del registro
  registered_by     uuid references public.app_users(id) on delete set null,
  registered_by_name text,                 -- nombre del operador (se conserva aunque se borre el usuario)
  created_at        timestamptz not null default now(),
  unique (raffle_id, raffle_number),      -- número único por rifa
  unique (raffle_id, document_number)     -- una inscripción por documento por rifa
);

create table if not exists public.draws (
  id              uuid primary key default gen_random_uuid(),
  raffle_id       uuid not null references public.raffles(id) on delete cascade,
  participant_id  uuid not null references public.participants(id) on delete cascade,
  created_at      timestamptz not null default now()
);
-- Una persona no puede ganar dos veces en la misma rifa
create unique index if not exists draws_one_win_per_person on public.draws (raffle_id, participant_id);

-- Actualización desde la v1 (no hace nada en instalaciones nuevas)
alter table public.participants alter column email drop not null;
alter table public.participants drop constraint if exists participants_email_check;
alter table public.participants add constraint participants_email_check
  check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');
alter table public.participants add column if not exists registered_by uuid references public.app_users(id) on delete set null;
alter table public.participants add column if not exists registered_by_name text;
alter table public.participants alter column id_document_path drop not null;
alter table public.participants add column if not exists photo_source text not null default 'camera';
alter table public.participants add column if not exists rank text;

create index if not exists participants_raffle_idx on public.participants(raffle_id);

-- ---------- RLS: todo cerrado ----------
-- Sin políticas = nadie con la clave anon puede leer ni escribir.
-- La app opera solo desde el servidor con la service_role key (que ignora RLS).
alter table public.raffles      enable row level security;
alter table public.participants enable row level security;
alter table public.draws        enable row level security;
alter table public.app_users    enable row level security;

-- ---------- Registro atómico con número único ----------
-- Elige un número aleatorio libre dentro del rango de la rifa activa e inserta.
-- Un bloqueo por rifa evita que dos inscripciones simultáneas obtengan el mismo número.
drop function if exists public.register_participant(text,text,text,text,text,date,text,text,text);
drop function if exists public.register_participant(text,text,text,text,text,date,text,text,text,uuid,text);
drop function if exists public.register_participant(text,text,text,text,text,date,text,text,text,uuid,text,text);
create or replace function public.register_participant(
  p_full_name text, p_document_type text, p_document_number text,
  p_email text, p_phone text, p_birth_date date, p_city text,
  p_id_document_path text, p_photo_path text,
  p_registered_by uuid default null, p_registered_by_name text default null,
  p_photo_source text default 'camera',
  p_rank text default null
) returns table (participant_id uuid, raffle_number int)
language plpgsql security definer set search_path = public as $$
declare
  r public.raffles%rowtype;
  n int;
  pid uuid;
begin
  select * into r from public.raffles where is_active order by created_at desc limit 1;
  if not found then
    raise exception 'NO_ACTIVE_RAFFLE';
  end if;

  perform pg_advisory_xact_lock(hashtext(r.id::text));

  select s into n
  from generate_series(r.number_min, r.number_max) s
  where not exists (
    select 1 from public.participants p where p.raffle_id = r.id and p.raffle_number = s
  )
  order by random()
  limit 1;

  if n is null then
    raise exception 'RAFFLE_FULL';
  end if;

  insert into public.participants (
    raffle_id, raffle_number, full_name, document_type, document_number,
    email, phone, birth_date, city, id_document_path, photo_path, consent_at,
    registered_by, registered_by_name, photo_source, rank
  ) values (
    r.id, n, trim(p_full_name), p_document_type, trim(p_document_number),
    nullif(lower(trim(p_email)), ''), trim(p_phone), p_birth_date, nullif(trim(p_city), ''),
    p_id_document_path, p_photo_path, now(), p_registered_by, p_registered_by_name, p_photo_source,
    nullif(trim(p_rank), '')
  ) returning id into pid;

  return query select pid, n;
end $$;

-- Solo el servidor (service_role) puede ejecutarla.
revoke all on function public.register_participant from public, anon, authenticated;
grant execute on function public.register_participant to service_role;

-- ---------- Storage: buckets privados ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('documentos', 'documentos', false, 3145728, array['image/jpeg']),
  ('fotos',      'fotos',      false, 3145728, array['image/jpeg'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
-- storage.objects ya tiene RLS activado por Supabase. Al no crear políticas,
-- los archivos solo son accesibles con service_role o con URLs firmadas temporales.

-- ---------- Datos iniciales ----------
insert into public.raffles (name, prize, number_min, number_max)
select 'Rifa principal', 'Premio por definir', 1, 9999
where not exists (select 1 from public.raffles);
