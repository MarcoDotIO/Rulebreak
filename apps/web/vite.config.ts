import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // Prefer process.env (shell / .env at repo root via npm scripts) then Vite-loaded.
  const operatorToken =
    process.env.RULEBREAK_OPERATOR_TOKEN?.trim() ||
    env.RULEBREAK_OPERATOR_TOKEN?.trim() ||
    "";

  return {
    plugins: [react()],
    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: true,
      proxy: {
        "/api": {
          target: "http://127.0.0.1:4100",
          changeOrigin: true,
          configure: (proxy) => {
            proxy.on("proxyReq", (proxyReq, req) => {
              const method = (req.method ?? "GET").toUpperCase();
              if (
                operatorToken &&
                (method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE")
              ) {
                proxyReq.setHeader("x-rulebreak-operator-token", operatorToken);
              }
            });
          },
        },
      },
    },
  };
});
