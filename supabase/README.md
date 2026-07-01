# Supabase

## Variaveis

Copie `.env.example` para `.env` e preencha:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Nunca coloque `service_role` ou secret key no frontend.

## Migracoes

As mudancas de banco vivem em `migrations/`, uma por arquivo, com prefixo de
data (`YYYYMMDDHHMMSS_nome.sql`) — mesmo padrao do Supabase CLI.

Regras:

- **Nunca edite uma migracao ja aplicada.** Mudou algo no banco? Crie um novo
  arquivo datado com apenas o delta (`alter table ...`, `create policy ...`).
- Aplique cada arquivo novo no SQL Editor do projeto Supabase (ou via
  `supabase db push` se o CLI estiver linkado).

`20260701000000_inscricoes_baseline.sql` documenta o estado atual do schema:
tabela `inscricoes` com RLS (INSERT/SELECT apenas para o proprio usuario
autenticado; nada para `anon`) e a funcao `criar_inscricao_publica`, usada
pelo formulario de inscricao. O arquivo e re-executavel (guardas
`if not exists` / `drop ... if exists`).
