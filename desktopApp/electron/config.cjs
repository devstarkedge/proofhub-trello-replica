const fs = require('node:fs');
const path = require('node:path');

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

module.exports = { validateBackendURL, selectBackendURL, readBackendURL };
