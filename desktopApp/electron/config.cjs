const fs = require('node:fs');
const path = require('node:path');
const { navigationOrigin } = require('./app-navigation.cjs');

function validateBackendURL(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Backend URL must be an HTTP(S) origin, for example http://localhost:5000 (without /api).');
  }
  if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('Remote backends must use HTTPS. HTTP is supported only for localhost.');
  }
  return url.origin;
}

function selectBackendURL(env, production) {
  const key = production ? 'VITE_BACKEND_PRODUCTION' : 'VITE_BACKEND_URL';
  const value = env[key]?.trim();
  if (!value) throw new Error(`Set ${key} in desktopApp/.env before ${production ? 'building' : 'starting development'}.`);
  try {
    return validateBackendURL(value);
  } catch (error) {
    throw new Error(`${key}: ${error.message}`);
  }
}

function readBackendURL(root) {
  // Preview and installed builds both use the production origin captured by
  // Vite. A local .env or inherited development variable must never replace it.
  const configFile = path.join(root, 'dist/desktop-config.json');
  if (!fs.existsSync(configFile)) throw new Error('Build the desktop UI first with npm run build.');
  return validateBackendURL(JSON.parse(fs.readFileSync(configFile, 'utf8')).backendURL);
}

function selectChatOrigin(env, production, developmentFallback = '') {
  // A production package must never inherit CHATAPP_URL from the backend's
  // local development .env. Keep custom deployments explicit.
  const value = production
    ? env.VITE_CHATAPP_PRODUCTION || env.VITE_CHATAPP_URL
    : env.VITE_CHATAPP_URL || developmentFallback;
  if (!value) throw new Error('Set VITE_CHATAPP_URL in desktopApp/.env or the build environment before building.');
  return navigationOrigin(value, production);
}

module.exports = { validateBackendURL, selectBackendURL, readBackendURL, selectChatOrigin };
