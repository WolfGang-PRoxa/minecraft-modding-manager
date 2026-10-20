import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { Plugin } from 'vite'

/**
 * La politique de sécurité de `index.html` est celle de l'app compilée : aucun script écrit dans la page, aucune
 * connexion. Le serveur de développement a besoin de plus (préambule de React écrit dans la page, rechargement à chaud
 * par WebSocket, images d'un faux serveur local) : il les ajoute, lui seul.
 */
function devContentSecurityPolicy(): Plugin {
  return {
    name: 'dev-content-security-policy',
    apply: 'serve',
    transformIndexHtml: (html) =>
      html
        .replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
        .replace("connect-src 'self'", "connect-src 'self' ws: http://localhost:*")
        .replace("img-src 'self'", "img-src 'self' http://localhost:* http://127.0.0.1:*")
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        // cli : la ligne de commande `mpm` et le serveur MCP, lancés par mpm.cmd avec l'exécutable en mode Node.
        input: { index: resolve(__dirname, 'src/main/index.ts'), cli: resolve(__dirname, 'src/cli/index.ts') }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/renderer/index.html')
      }
    },
    plugins: [react(), tailwindcss(), devContentSecurityPolicy()]
  }
})
