/*
 * TerraExplorer public runtime configuration.
 *
 * This file is served to every visitor. It must never contain API keys,
 * tokens, passwords or any other secret.
 *
 * apiBaseUrl is the origin of the TerraExplorer API Worker, for example:
 *   apiBaseUrl: 'https://terraexplorer-api.your-subdomain.workers.dev'
 *
 * Leave it empty to run the site without AI insights or photos. The rest of
 * the app (country data, flags, maps, visited tracking) works normally.
 */
window.TERRAEXPLORER_CONFIG = Object.freeze({
  apiBaseUrl: ''
});
