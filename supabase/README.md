# Supabase

Esta pasta prepara a base para futuras funcionalidades da home page.

## Variaveis

Copie `.env.example` para `.env` e preencha:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Nunca coloque `service_role` ou secret key no frontend.

## SQL inicial

O arquivo `sql/001_inscricoes.sql` e um rascunho seguro para uma futura tabela de inscricoes.
Ele ainda nao foi aplicado no Supabase.

Antes de publicar formularios reais, revise:

- Campos obrigatorios do evento
- Politicas RLS
- Protecao contra spam
- Fluxo de confirmacao de pagamento
