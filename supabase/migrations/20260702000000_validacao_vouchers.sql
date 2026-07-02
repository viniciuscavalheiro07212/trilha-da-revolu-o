-- Validacao de vouchers no credenciamento (app PWA /validacao.html).
-- Aplicar manualmente no SQL Editor do Supabase.

-- 1) Lista de e-mails autorizados a validar vouchers e ver o painel de lucro.
create table if not exists public.validadores (
  email text primary key,
  criado_em timestamptz not null default now()
);

alter table public.validadores enable row level security;

grant select on table public.validadores to authenticated;
grant select, insert, update, delete on table public.validadores to service_role;

drop policy if exists "Validador ve a propria entrada" on public.validadores;
create policy "Validador ve a propria entrada"
on public.validadores
for select
to authenticated
using (lower(email) = lower(coalesce((select auth.jwt() ->> 'email'), '')));

-- Primeiro validador. Adicione os demais e-mails da equipe pelo SQL Editor:
--   insert into public.validadores (email) values ('pessoa@exemplo.com');
insert into public.validadores (email)
values
  ('vinicius@excellencetax.com.br'),
  ('joaovitorcavalheiro1243@gmail.com')
on conflict (email) do nothing;

-- 2) Funcao auxiliar: o usuario logado esta na lista de validadores?
create or replace function public.is_validador()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.validadores
    where lower(email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  );
$$;

revoke all on function public.is_validador() from public;
grant execute on function public.is_validador() to authenticated;

-- 3) Colunas de validacao na inscricao.
alter table public.inscricoes add column if not exists validado_em timestamptz;
alter table public.inscricoes add column if not exists validado_por text;

-- 4) Validador pode ler todas as inscricoes (tabela de vouchers e lucro).
drop policy if exists "Validador le todas as inscricoes" on public.inscricoes;
create policy "Validador le todas as inscricoes"
on public.inscricoes
for select
to authenticated
using (public.is_validador());

-- 5) Validacao acontece somente por funcao (sem UPDATE direto na tabela).
create or replace function public.validar_voucher(codigo text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  reg public.inscricoes%rowtype;
  ja_validado boolean;
begin
  if not public.is_validador() then
    raise exception 'Acesso restrito a validadores';
  end if;

  select * into reg
  from public.inscricoes
  where voucher_codigo = upper(trim(codigo))
  for update;

  if not found then
    return jsonb_build_object(
      'resultado', 'nao-encontrado',
      'voucher_codigo', upper(trim(codigo))
    );
  end if;

  ja_validado := reg.validado_em is not null;

  if not ja_validado then
    update public.inscricoes
    set validado_em = now(),
        validado_por = (select auth.jwt() ->> 'email')
    where id = reg.id
    returning * into reg;
  end if;

  return jsonb_build_object(
    'resultado', case when ja_validado then 'ja-validado' else 'validado' end,
    'voucher_codigo', reg.voucher_codigo,
    'numero_inscricao', reg.numero_inscricao,
    'nome_completo', reg.nome_completo,
    'telefone', reg.telefone,
    'grupo', reg.grupo,
    'cidade', reg.cidade,
    'veiculo', reg.veiculo,
    'tamanho_camiseta', reg.tamanho_camiseta,
    'camiseta_garantida', reg.camiseta_garantida,
    'validado_em', reg.validado_em,
    'validado_por', reg.validado_por
  );
end;
$$;

revoke all on function public.validar_voucher(text) from public;
grant execute on function public.validar_voucher(text) to authenticated;

-- 6) Desfazer validacao (correcao de engano no credenciamento).
create or replace function public.desfazer_validacao(codigo text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  reg public.inscricoes%rowtype;
begin
  if not public.is_validador() then
    raise exception 'Acesso restrito a validadores';
  end if;

  update public.inscricoes
  set validado_em = null,
      validado_por = null
  where voucher_codigo = upper(trim(codigo))
  returning * into reg;

  if not found then
    return jsonb_build_object(
      'resultado', 'nao-encontrado',
      'voucher_codigo', upper(trim(codigo))
    );
  end if;

  return jsonb_build_object(
    'resultado', 'desfeito',
    'voucher_codigo', reg.voucher_codigo,
    'nome_completo', reg.nome_completo
  );
end;
$$;

revoke all on function public.desfazer_validacao(text) from public;
grant execute on function public.desfazer_validacao(text) to authenticated;

-- 7) Configuracao do evento usada na aba de lucro (valor por inscricao).
create table if not exists public.evento_config (
  id integer primary key check (id = 1),
  valor_inscricao numeric(10, 2) not null default 100 check (valor_inscricao >= 0)
);

insert into public.evento_config (id)
values (1)
on conflict (id) do nothing;

alter table public.evento_config enable row level security;

grant select on table public.evento_config to authenticated;
grant update (valor_inscricao) on table public.evento_config to authenticated;
grant select, insert, update, delete on table public.evento_config to service_role;

drop policy if exists "Validador le config do evento" on public.evento_config;
create policy "Validador le config do evento"
on public.evento_config
for select
to authenticated
using (public.is_validador());

drop policy if exists "Validador atualiza config do evento" on public.evento_config;
create policy "Validador atualiza config do evento"
on public.evento_config
for update
to authenticated
using (public.is_validador())
with check (public.is_validador());
