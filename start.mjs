#!/usr/bin/env node

/**
 * Automaker - Production Mode Launch Script
 *
 * This script runs the application in production mode (no Vite dev server).
 * It builds everything if needed, then serves static files via vite preview.
 *
 * Key differences from dev.mjs:
 * - Uses pre-built static files instead of Vite dev server (faster startup)
 * - No HMR or hot reloading
 * - Server runs from compiled dist/ directory
 * - Uses "vite preview" to serve static UI files
 *
 * Usage: npm run start
 */

import path from 'path';
import { fileURLToPath } from 'url';

import {
  createRestrictedFs,
  log,
  runNpmAndWait,
  runNpx,
  printHeader,
  printModeMenu,
  resolvePortConfiguration,
  createCleanupHandler,
  setupSignalHandlers,
  startServerAndWait,
  ensureDependencies,
  prompt,
  killProcessTree,
  sleep,
  launchDockerContainers,
} from './scripts/launcher-utils.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create restricted fs for this script's directory
const fs = createRestrictedFs(__dirname, 'start.mjs');

// Track background processes for cleanup
const processes = {
  server: null,
  web: null,
  electron: null,
  docker: null,
};

/**
 * Build all production artifacts
 */
async function ensureProductionBuilds() {
  // Always build shared packages first to ensure they're up to date
  log('Building shared packages...', 'blue');
  try {
    await runNpmAndWait(['run', 'build:packages'], { stdio: 'inherit' }, __dirname);
    log('✓ Shared packages built', 'green');
  } catch (error) {
    log(`Failed to build shared packages: ${error.message}`, 'red');
    process.exit(1);
  }

  // Always rebuild server to ensure it's in sync with packages
  log('Building server...', 'blue');
  try {
    await runNpmAndWait(
      ['run', 'build'],
      { stdio: 'inherit' },
      path.join(__dirname, 'apps', 'server')
    );
    log('✓ Server built', 'green');
  } catch (error) {
    log(`Failed to build server: ${error.message}`, 'red');
    process.exit(1);
  }

  // Always rebuild UI to ensure it's in sync with latest code
  log('Building UI...', 'blue');
  try {
    await runNpmAndWait(['run', 'build'], { stdio: 'inherit' }, __dirname);
    log('✓ UI built', 'green');
    console.log('');
  } catch (error) {
    log(`Failed to build UI: ${error.message}`, 'red');
    process.exit(1);
  }
}

/**
 * Main function
 */
async function main() {
  // Change to script directory
  process.chdir(__dirname);

  printHeader('Automaker Production Mode');

  // Ensure dependencies are installed
  await ensureDependencies(fs, __dirname);

  // Build production artifacts if needed
  await ensureProductionBuilds();

  // Resolve port configuration (check/kill/change ports)
  const { webPort, serverPort, corsOriginEnv } = await resolvePortConfiguration();

  // Show mode selection menu
  printModeMenu();

  // Setup cleanup handlers
  const cleanup = createCleanupHandler(processes);
  setupSignalHandlers(cleanup);

  // Prompt for choice
  while (true) {
    const choice = await prompt('Enter your choice (1, 2, or 3): ');

    if (choice === '1') {
      console.log('');
      log('Launching Web Application (Production Mode)...', 'blue');

      // Start the backend server in PRODUCTION mode
      // Uses "npm run start" in apps/server which runs the compiled dist/
      // NOT the Vite dev server (no HMR, faster startup)
      processes.server = await startServerAndWait({
        serverPort,
        corsOriginEnv,
        npmArgs: ['run', 'start'],
        cwd: path.join(__dirname, 'apps', 'server'),
        fs,
        baseDir: __dirname,
      });

      if (!processes.server) {
        await cleanup();
        process.exit(1);
      }

      log(`Starting web server...`, 'blue');

      // Start vite preview to serve pre-built static files
      // This is NOT Vite dev server - it just serves the dist/ folder
      // No HMR, no compilation, just static file serving
      processes.web = runNpx(
        ['vite', 'preview', '--port', String(webPort)],
        {
          stdio: 'inherit',
          env: {
            VITE_SERVER_URL: `http://localhost:${serverPort}`,
          },
        },
        path.join(__dirname, 'apps', 'ui')
      );

      log(`The application is available at: http://localhost:${webPort}`, 'green');
      console.log('');

      await new Promise((resolve) => {
        processes.web.on('close', resolve);
      });

      break;
    } else if (choice === '2') {
      console.log('');
      log('Launching Desktop Application (Production Mode)...', 'blue');
      log('(Electron will start its own backend server)', 'yellow');
      console.log('');

      // Run electron directly with the built main.js
      const electronMainPath = path.join(__dirname, 'apps', 'ui', 'dist-electron', 'main.js');

      if (!fs.existsSync(electronMainPath)) {
        log('Error: Electron main process not built. Run build first.', 'red');
        process.exit(1);
      }

      // Start vite preview to serve built static files for electron
      // (Electron in non-packaged mode needs a server to load from)
      log('Starting static file server...', 'blue');
      processes.web = runNpx(
        ['vite', 'preview', '--port', String(webPort)],
        {
          stdio: ['ignore', 'pipe', 'pipe'],
          env: {
            VITE_SERVER_URL: `http://localhost:${serverPort}`,
          },
        },
        path.join(__dirname, 'apps', 'ui')
      );

      // Wait for vite preview to start
      await sleep(2000);

      // Use electron from node_modules with NODE_ENV=production
      // This ensures electron loads from the preview server, not Vite dev
      processes.electron = runNpx(
        ['electron', electronMainPath],
        {
          stdio: 'inherit',
          env: {
            TEST_PORT: String(webPort),
            PORT: String(serverPort),
            VITE_DEV_SERVER_URL: `http://localhost:${webPort}`,
            VITE_SERVER_URL: `http://localhost:${serverPort}`,
            CORS_ORIGIN: corsOriginEnv,
            NODE_ENV: 'production',
          },
        },
        path.join(__dirname, 'apps', 'ui')
      );

      await new Promise((resolve) => {
        processes.electron.on('close', () => {
          // Also kill vite preview when electron closes
          if (processes.web && !processes.web.killed && processes.web.pid) {
            killProcessTree(processes.web.pid);
          }
          resolve();
        });
      });

      break;
    } else if (choice === '3') {
      console.log('');
      await launchDockerContainers({ baseDir: __dirname, processes });
      break;
    } else {
      log('Invalid choice. Please enter 1, 2, or 3.', 'red');
    }
  }
}

// Run main function
main().catch(async (err) => {
  console.error(err);
  const cleanup = createCleanupHandler(processes);
  try {
    await cleanup();
  } catch (cleanupErr) {
    console.error('Cleanup error:', cleanupErr);
  }
  process.exit(1);
});
