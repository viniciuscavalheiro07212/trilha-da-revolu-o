# VIII Trilha da Revolucao - versao refatorada

Esta pasta foi gerada a partir do HTML exportado pelo Cloud Code Design.

## Estrutura

- `index.html`: pagina principal com secoes preservadas.
- `inscricao.html`: pagina de inscricao com geracao de voucher.
- `css/fonts.css`: fontes extraidas do pacote original.
- `css/styles.css`: estilos organizados fora da marcacao HTML.
- `css/inscricao.css`: estilos da pagina de inscricao e voucher.
- `assets/`: imagens, fontes e scripts extraidos do HTML empacotado.
- `src/`: ponto de entrada para futuras integracoes e cliente Supabase.
- `supabase/`: documentacao e SQL base para futuras tabelas.
- `docs/original-template.html`: template original extraido, para comparacao.
- `package.json`: scripts para desenvolvimento e build.

## Comandos

```bash
npm install
npm run dev
npm run build
```

## Supabase

Copie `.env.example` para `.env` e preencha as variaveis do seu projeto Supabase.

Use apenas chave publica/publishable no frontend. Nunca use `service_role` no site.

## Preservacao visual

As regras CSS vieram dos estilos inline originais. A refatoracao removeu estilos estaticos da marcacao e os colocou em classes, mantendo valores, cores, espacamentos, imagens e hierarquia visual.
