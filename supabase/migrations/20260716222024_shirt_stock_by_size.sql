-- Estoque fixo por tamanho. A inscricao continua valida mesmo quando a camiseta
-- escolhida se esgota: nesse caso ela e emitida sem camiseta.
create table if not exists public.camiseta_estoque (
  tamanho text primary key,
  limite integer not null check (limite >= 0),
  reservadas integer not null default 0 check (reservadas >= 0 and reservadas <= limite)
);

alter table public.camiseta_estoque enable row level security;
revoke all on table public.camiseta_estoque from anon, authenticated;
grant select, insert, update, delete on table public.camiseta_estoque to service_role;

insert into public.camiseta_estoque (tamanho, limite, reservadas)
values
  ('P', 15, 0),
  ('M', 30, 0),
  ('G', 56, 0),
  ('GG', 59, 0),
  ('G1', 25, 0),
  ('G2', 11, 0),
  ('G3', 4, 0)
on conflict (tamanho) do update
set limite = excluded.limite;

-- Preserva o status dos vouchers ja emitidos antes de trocar a regra gerada
-- dos "200 primeiros" por uma reserva real de estoque.
alter table public.inscricoes
  add column if not exists camiseta_garantida_nova boolean;

update public.inscricoes
set camiseta_garantida_nova = camiseta_garantida
where camiseta_garantida_nova is null;

alter table public.inscricoes drop column if exists camiseta_garantida;
alter table public.inscricoes rename column camiseta_garantida_nova to camiseta_garantida;
alter table public.inscricoes alter column camiseta_garantida set default false;
alter table public.inscricoes alter column camiseta_garantida set not null;

-- Os vouchers antigos dos tamanhos atuais tambem ocupam o estoque produzido.
update public.camiseta_estoque estoque
set reservadas = least(
  estoque.limite,
  (
    select count(*)::integer
    from public.inscricoes inscricao
    where inscricao.camiseta_garantida
      and upper(trim(coalesce(inscricao.tamanho_camiseta, ''))) = estoque.tamanho
  )
);

create or replace function public.reservar_camiseta_por_tamanho()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  tamanho_normalizado text;
begin
  tamanho_normalizado := upper(trim(coalesce(new.tamanho_camiseta, '')));

  update public.camiseta_estoque
  set reservadas = reservadas + 1
  where tamanho = tamanho_normalizado
    and reservadas < limite;

  if found then
    new.tamanho_camiseta := tamanho_normalizado;
    new.camiseta_garantida := true;
  else
    new.tamanho_camiseta := null;
    new.camiseta_garantida := false;
  end if;

  return new;
end;
$$;

drop trigger if exists limpar_tamanho_camiseta_esgotada on public.inscricoes;
drop trigger if exists reservar_camiseta_por_tamanho on public.inscricoes;
create trigger reservar_camiseta_por_tamanho
before insert on public.inscricoes
for each row
execute function public.reservar_camiseta_por_tamanho();
