-- A camiseta e limitada aos 200 primeiros pagamentos confirmados. A inscricao
-- continua sendo criada normalmente depois disso, apenas sem tamanho de camiseta.
create or replace function public.limpar_tamanho_camiseta_esgotada()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.numero_inscricao > 200 then
    new.tamanho_camiseta := null;
  end if;

  return new;
end;
$$;

drop trigger if exists limpar_tamanho_camiseta_esgotada on public.inscricoes;
create trigger limpar_tamanho_camiseta_esgotada
before insert on public.inscricoes
for each row
execute function public.limpar_tamanho_camiseta_esgotada();

-- Corrige eventuais registros antigos que tenham sido criados apos a cota.
update public.inscricoes
set tamanho_camiseta = null
where numero_inscricao > 200
  and tamanho_camiseta is not null;
