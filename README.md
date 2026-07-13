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

## Mercado Pago Pix

A integracao usa Checkout Transparente via Orders API no backend:

- `POST /api/mercadopago/create-pix-order`: cria a cobranca Pix e retorna QR Code.
- `GET /api/mercadopago/order-status?id=...`: consulta o status da order.
- `POST /api/mercadopago/confirm-voucher`: confirma pagamento aprovado e cria o voucher no Supabase.
- `POST /api/mercadopago/webhook`: recebe notificacoes do Mercado Pago e cria o voucher mesmo se o usuario fechar a pagina.

Configure as variaveis de servidor na hospedagem, sem prefixo `VITE_`:

```bash
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key
MERCADO_PAGO_ACCESS_TOKEN=seu-access-token
MERCADO_PAGO_ENV=production
MERCADO_PAGO_WEBHOOK_SECRET=secret-do-webhook
MERCADO_PAGO_PIX_AMOUNT=100
MERCADO_PAGO_PIX_EXPIRATION=PT30M
```

Use `MERCADO_PAGO_ENV=test` apenas com credenciais de teste/sandbox. Para receber Pix real, deixe `MERCADO_PAGO_ENV=production` e use o Access Token de producao da conta recebedora.

Rode as migrations em `supabase/migrations/` no Supabase antes de publicar, para adicionar os campos do Mercado Pago e bloquear a criacao de voucher direto pelo frontend.

No painel do Mercado Pago, em Webhooks, configure a URL publica `https://seu-dominio.com/api/mercadopago/webhook` e selecione o evento `Order (Mercado Pago)`. Copie o secret gerado para `MERCADO_PAGO_WEBHOOK_SECRET`.

O `npm run dev` do Vite serve apenas o frontend. Para testar os endpoints de API localmente, use `vercel dev` ou uma publicacao de Preview da Vercel.

## Preservacao visual

As regras CSS vieram dos estilos inline originais. A refatoracao removeu estilos estaticos da marcacao e os colocou em classes, mantendo valores, cores, espacamentos, imagens e hierarquia visual.
