import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  appType: "mpa",
  server: {
    // Ferramentas de preview atribuem a porta via env PORT; o Vite nao a le sozinho.
    port: Number(process.env.PORT) || 5173,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        inscricao: fileURLToPath(new URL("./inscricao.html", import.meta.url)),
        validacao: fileURLToPath(new URL("./validacao.html", import.meta.url)),
      },
    },
  },
});
