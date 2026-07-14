create extension if not exists pg_net;
create extension if not exists pg_cron;

alter table public.inscricoes
  add column if not exists email_voucher_agendado_em timestamptz,
  add column if not exists email_voucher_processando_em timestamptz;

create index if not exists inscricoes_email_voucher_queue_idx
  on public.inscricoes (email_voucher_agendado_em)
  where email_voucher_enviado_em is null;

select cron.schedule(
  'send-voucher-emails',
  '* * * * *',
  $cron$
    select net.http_post(
      url := 'https://ktwiwdwmfzlxzbspapqt.supabase.co/functions/v1/send-voucher-emails',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'sb_publishable_5SyljBweDJ-pXJky--40aQ_h4aha-oE'
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 10000
    );
  $cron$
);
