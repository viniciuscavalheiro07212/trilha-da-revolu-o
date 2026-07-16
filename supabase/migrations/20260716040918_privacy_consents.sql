alter table public.inscricoes
  add column if not exists privacidade_aceita_em timestamptz,
  add column if not exists consentimento_saude_aceito_em timestamptz,
  add column if not exists politica_privacidade_versao text;

comment on column public.inscricoes.privacidade_aceita_em is
  'Momento em que o participante confirmou a ciencia do Aviso de Privacidade.';

comment on column public.inscricoes.consentimento_saude_aceito_em is
  'Momento do consentimento especifico para tratar o tipo sanguineo.';

comment on column public.inscricoes.politica_privacidade_versao is
  'Versao do Aviso de Privacidade aceita pelo participante.';
