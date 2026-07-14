alter table public.inscricoes
  add column if not exists email_voucher_enviado_em timestamptz,
  add column if not exists email_voucher_erro text;

grant select, update on table public.inscricoes to service_role;
