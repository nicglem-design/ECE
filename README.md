# ECE
A easy/pro based crypto wallet and exchange

## Running the app

For the full app (wallet, login, etc.) you need **both** the web app and the API:

```bash
npm run start
```

This starts the web app (port 3000) and the API (port 4000). If you see "Load failed" on KanoWallet, the API is not running – start it with `npm run start:api` in a separate terminal.

## If the site doesn't display

1. **Stop any running dev servers** – Close terminals running `npm run dev` or `npm run dev:web-only`.

2. **Clear cache and restart:**
   ```bash
   cd apps/web && rm -rf .next && cd ../.. && npm run dev:web-only
   ```
   Then open **http://127.0.0.1:3000**

3. **If port 3000 is in use**, use the alternate port:
   ```bash
   npm run dev:web-alt
   ```
   Then open **http://127.0.0.1:3002**
