-- Endurece a autorizacao do painel de validacao.
-- A lista de validadores continua baseada no e-mail assinado pelo Supabase Auth,
-- mas agora uma sessao autenticada valida e obrigatoria antes da consulta.

create or replace function public.is_validador()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.validadores
      where lower(email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
    );
$$;

revoke all on function public.is_validador() from public;
revoke all on function public.is_validador() from anon;
grant execute on function public.is_validador() to authenticated;

-- Reafirma o menor privilegio nas funcoes SECURITY DEFINER. Elas precisam dessa
-- modalidade para alterar vouchers de forma controlada, mas so ficam expostas a
-- usuarios autenticados e ainda chamam is_validador() antes de acessar dados.
revoke all on function public.validar_voucher(text) from public;
revoke all on function public.validar_voucher(text) from anon;
grant execute on function public.validar_voucher(text) to authenticated;

revoke all on function public.desfazer_validacao(text) from public;
revoke all on function public.desfazer_validacao(text) from anon;
grant execute on function public.desfazer_validacao(text) to authenticated;
