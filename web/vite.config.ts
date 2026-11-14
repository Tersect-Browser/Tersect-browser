import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

/**
 * The app shares tbconfig.json (repository root) with the backend. Only the
 * base href and the backend port are needed here.
 */
interface TbConfig {
  baseHref?: string
  serverPort?: number
}

function readTbConfig(): TbConfig {
  const file = resolve(
    import.meta.dirname,
    process.env.TB_CONFIG ?? "../tbconfig.json"
  )
  if (!existsSync(file)) {
    return {}
  }
  return JSON.parse(readFileSync(file, "utf8")) as TbConfig
}

const tbConfig = readTbConfig()
const base = tbConfig.baseHref ?? "/"
const backend =
  process.env.BACKEND_URL ?? `http://127.0.0.1:${tbConfig.serverPort ?? 4300}`

const proxied = [
  `${base}tbapi`,
  `${base}tgrc`,
  // The backend serves dataset files from this fixed path.
  "/TersectBrowserGP/datafiles",
]

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 4200,
    // Extra host names the dev server may be reached under (comma-separated),
    // e.g. when it is published through a tunnel.
    allowedHosts: process.env.TB_ALLOWED_HOSTS?.split(","),
    proxy: Object.fromEntries(
      proxied.map((path) => [path, { target: backend, changeOrigin: true }])
    ),
  },
  build: {
    // The backend serves the built app from dist/frontend.
    outDir: "../dist/frontend",
    emptyOutDir: true,
  },
})
