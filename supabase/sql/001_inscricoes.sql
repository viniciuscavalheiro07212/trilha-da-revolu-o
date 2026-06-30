create table if not exists public.inscricoes (
  id uuid primary key default gen_random_uuid(),
  nome_completo text not null,
  telefone text not null,
  cpf text,
  tipo_sanguineo text,
  grupo text,
  cidade text,
  tamanho_camiseta text,
  veiculo text,
  comprovante_url text,
  observacoes text,
  solidaria boolean not null default false,
  termos boolean not null default false,
  voucher_codigo text unique,
  voucher_emitido_em timestamptz,
  status text not null default 'pendente',
  created_at timestamptz not null default now()
);

alter table public.inscricoes enable row level security;

create policy "Permitir envio publico de inscricoes"
on public.inscricoes
for insert
to anon
with check (
  nome_completo is not null
  and length(trim(nome_completo)) >= 3
  and telefone is not null
  and length(trim(telefone)) >= 8
  and solidaria is true
  and termos is true
  and status = 'voucher-gerado'
  and voucher_codigo like 'TR-%'
  and voucher_emitido_em is not null
);

grant insert on table public.inscricoes to anon;
grant select, insert, update, delete on table public.inscricoes to service_role;

-- Por seguranca, nao ha policy publica de SELECT.
-- A leitura das inscricoes deve ser feita por painel autenticado ou backend.
