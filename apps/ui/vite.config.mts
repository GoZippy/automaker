import * as path from 'path';
import * as fs from 'fs';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';
import electron from 'vite-plugin-electron/simple';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read version from package.json
const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'));
const appVersion = packageJson.version;

/**
 * Vite plugin to optimize the HTML output for mobile PWA loading speed.
 *
 * Problem: Vite adds modulepreload links for ALL vendor chunks in index.html,
 * including heavy route-specific libraries like ReactFlow (172KB), xterm (676KB),
 * and CodeMirror (436KB). On mobile, these modulepreloads compete with critical
 * resources for bandwidth, delaying First Contentful Paint by 500ms+.
 *
 * Solution: Convert modulepreload to prefetch for route-specific vendor chunks.
 * - modulepreload: Browser parses + compiles immediately (blocks FCP)
 * - prefetch: Browser downloads at lowest priority during idle (no FCP impact)
 *
 * This means these chunks are still cached for when the user navigates to their
 * respective routes, but they don't block the initial page load.
 */
function mobilePreloadOptimizer(): Plugin {
  // Vendor chunks that are route-specific and should NOT block initial load.
  // These libraries are only needed on specific routes:
  // - vendor-reactflow: /graph route only
  // - vendor-xterm: /terminal route only
  // - vendor-codemirror: spec/XML editor routes only
  // - vendor-markdown: agent view, wiki, and other markdown-rendering routes
  const deferredChunks = [
    'vendor-reactflow',
    'vendor-xterm',
    'vendor-codemirror',
    'vendor-markdown',
  ];

  return {
    name: 'mobile-preload-optimizer',
    enforce: 'post',
    transformIndexHtml(html) {
      // Convert modulepreload to prefetch for deferred chunks
      // This preserves the caching benefit while eliminating the FCP penalty
      for (const chunk of deferredChunks) {
        // Match modulepreload links for this chunk
        const modulePreloadRegex = new RegExp(
          `<link rel="modulepreload" crossorigin href="(\\./assets/${chunk}-[^"]+\\.js)">`,
          'g'
        );
        html = html.replace(modulePreloadRegex, (_match, href) => {
          return `<link rel="prefetch" href="${href}" as="script">`;
        });

        // Also convert eagerly-loaded CSS for these chunks to lower priority
        const cssRegex = new RegExp(
          `<link rel="stylesheet" crossorigin href="(\\./assets/${chunk}-[^"]+\\.css)">`,
          'g'
        );
        html = html.replace(cssRegex, (_match, href) => {
          return `<link rel="prefetch" href="${href}" as="style">`;
        });
      }

      return html;
    },
  };
}

export default defineConfig(({ command }) => {
  // Only skip electron plugin during dev server in CI (no display available for Electron)
  // Always include it during build - we need dist-electron/main.js for electron-builder
  const skipElectron =
    command === 'serve' && (process.env.CI === 'true' || process.env.VITE_SKIP_ELECTRON === 'true');

  return {
    plugins: [
      // Only include electron plugin when not in CI/headless dev mode
      ...(skipElectron
        ? []
        : [
            electron({
              main: {
                entry: 'src/main.ts',
                vite: {
                  build: {
                    outDir: 'dist-electron',
                    rollupOptions: {
                      external: ['electron'],
                    },
                  },
                },
              },
              preload: {
                input: 'src/preload.ts',
                vite: {
                  build: {
                    outDir: 'dist-electron',
                    rollupOptions: {
                      external: ['electron'],
                    },
                  },
                },
              },
            }),
          ]),
      TanStackRouterVite({
        target: 'react',
        autoCodeSplitting: true,
        routesDirectory: './src/routes',
        generatedRouteTree: './src/routeTree.gen.ts',
      }),
      tailwindcss(),
      react(),
      // Mobile PWA optimization: demote route-specific vendor chunks from
      // modulepreload (blocks FCP) to prefetch (background download)
      mobilePreloadOptimizer(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      host: process.env.HOST || '0.0.0.0',
      port: parseInt(process.env.TEST_PORT || '3007', 10),
      allowedHosts: true,
      proxy: {
        '/api': {
          target: 'http://localhost:3008',
          changeOrigin: true,
          ws: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      // Target modern browsers for smaller output (no legacy polyfills)
      target: 'esnext',
      // Enable CSS code splitting for smaller initial CSS payload
      cssCodeSplit: true,
      // Increase chunk size warning to avoid over-splitting (which hurts HTTP/2 multiplexing)
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        external: [
          'child_process',
          'fs',
          'path',
          'crypto',
          'http',
          'net',
          'os',
          'util',
          'stream',
          'events',
          'readline',
        ],
        output: {
          // Manual chunks for optimal caching and loading on mobile
          manualChunks(id) {
            // Vendor: React core (rarely changes, cache long-term)
            if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
              return 'vendor-react';
            }
            // Vendor: TanStack Router + Query (used on every page)
            if (id.includes('@tanstack/react-router') || id.includes('@tanstack/react-query')) {
              return 'vendor-tanstack';
            }
            // Vendor: UI library - split Radix UI (critical) from Lucide icons (deferrable)
            // Radix UI primitives are used on almost every page for dialogs, tooltips, etc.
            if (id.includes('@radix-ui/')) {
              return 'vendor-radix';
            }
            // Lucide icons: Split from Radix so tree-shaken icons don't bloat the critical path
            if (id.includes('lucide-react')) {
              return 'vendor-icons';
            }
            // Fonts: Each font family gets its own chunk (loaded on demand)
            if (id.includes('@fontsource/')) {
              const match = id.match(/@fontsource\/([^/]+)/);
              if (match) return `font-${match[1]}`;
            }
            // CodeMirror: Heavy editor - only loaded when needed
            if (id.includes('@codemirror/') || id.includes('@lezer/')) {
              return 'vendor-codemirror';
            }
            // Xterm: Terminal - only loaded when needed
            if (id.includes('xterm') || id.includes('@xterm/')) {
              return 'vendor-xterm';
            }
            // React Flow: Graph visualization - only loaded on dependency graph view
            if (id.includes('@xyflow/') || id.includes('reactflow')) {
              return 'vendor-reactflow';
            }
            // Zustand + Zod: State management and validation
            if (id.includes('zustand') || id.includes('zod')) {
              return 'vendor-state';
            }
            // React Markdown: Only needed on routes with markdown rendering
            if (id.includes('react-markdown') || id.includes('remark-') || id.includes('rehype-')) {
              return 'vendor-markdown';
            }
          },
        },
      },
    },
    optimizeDeps: {
      exclude: ['@automaker/platform'],
    },
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
    },
  };
});
