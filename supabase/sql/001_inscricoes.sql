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
with check (true);

-- Por seguranca, nao ha policy publica de SELECT.
-- A leitura das inscricoes deve ser feita por painel autenticado ou backend.
