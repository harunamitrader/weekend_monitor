# Cloudflare Worker Dispatcher

This Worker triggers the GitHub Actions workflow that updates weekend market data.

## Secret

- `GITHUB_TOKEN`: fine-grained GitHub token with Actions write access to `harunamitrader/weekend_monitor`

## Cron

- `0,15,30,45 * * * *`

## Files

- `worker.mjs`: Worker source for Cloudflare's editor or Wrangler
