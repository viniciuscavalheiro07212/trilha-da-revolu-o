# VIII Trilha da Revolucao - versao refatorada

Esta pasta foi gerada a partir do HTML exportado pelo Cloud Code Design.

## Estrutura

- `index.html`: pagina principal com secoes preservadas.
- `inscricao.html`: pagina de inscricao com geracao de voucher.
- `css/fonts.css`: fontes extraidas do pacote original.
- `css/styles.css`: estilos organizados fora da marcacao HTML.
- `css/inscricao.css`: estilos da pagina de inscricao e voucher.
- `assets/`: imagens e fontes extraidas do HTML empacotado (processadas pelo Vite).
- `public/assets/`: runtime do Cloud Code Design, copiado como esta para o build.
- `src/`: JavaScript das paginas (auth compartilhada, menu de usuario, cliente Supabase).
- `supabase/`: documentacao e migracoes SQL versionadas (`supabase/migrations/`).
- `docs/original-template.html`: template original extraido, para comparacao.
- `package.json`: scripts para desenvolvimento, build e lint.

## Comandos

```bash
npm install
npm run dev           # desenvolvimento (Vite)
npm run build         # build de producao em dist/
npm run preview       # serve o build de dist/
npm run lint          # ESLint
npm run format        # Prettier
```

## Supabase

Copie `.env.example` para `.env` e preencha as variaveis do seu projeto Supabase.

Use apenas chave publica/publishable no frontend. Nunca use `service_role` no site.

## Preservacao visual

As regras CSS vieram dos estilos inline originais. A refatoracao removeu estilos estaticos da marcacao e os colocou em classes, mantendo valores, cores, espacamentos, imagens e hierarquia visual.
