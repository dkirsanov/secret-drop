# SecretDrop

Minimal self-hosted one-time secret sharing. Drop a secret, get an ID, share the ID. The secret is returned exactly once — then it's deleted. Public, anonymous, no accounts.

## Use case

1. **Snoop** opens SecretDrop (phone or browser) → pastes secret → sets TTL → clicks "Create Drop" → gets a Drop ID → copies it → sends to Mia.
2. **Mia** calls `GET /api/drop/:id` → receives the secret (it is deleted immediately). Any repeat call → 404.

## Stack

- **Runtime:** Node.js + Express  
- **Storage:** In-memory (no database)  
- **Frontend:** Single `index.html`, vanilla JS, mobile-friendly  
- **TLS:** Caddy (automatic HTTPS)  
- **Process manager:** pm2  

## Quick start

```bash
cp .env.example .env   # edit if needed
npm install
npm start
```

Or with pm2:

```bash
pm2 start server.js --name secretdrop
```

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/drop` | Create a drop. Body: `{ secret: string, ttl_seconds?: number }`. Returns `{ id, expires_at }`. |
| GET | `/api/drop/:id` | Retrieve secret once. Returns `{ secret }` then deletes; 404 `{ error: "not found" }` if missing or already claimed. |

No authentication. Default TTL 15 min; allowed: 5 min, 15 min, 1 hour. Max secret 64KB. Max 1000 active drops. POST rate limit: 10/min per IP.

## Config (`.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3000 | Server port |
| MAX_DROPS | 1000 | Max active drops in memory |
| MAX_SECRET_BYTES | 65536 | Max secret size (64KB) |
| DEFAULT_TTL_SECONDS | 900 | Default TTL (15 min) |

## Deployment

```
secretdrop/
├── server.js
├── public/
│   └── index.html
├── .env
├── Caddyfile
└── package.json
```

1. Run the app: `pm2 start server.js --name secretdrop`
2. Put Caddy in front. Example `Caddyfile`:

```
yourdomain.com {
  reverse_proxy localhost:3000
}
```

- **Snoop** (creator): open `https://yourdomain.com` from anywhere.
- **Mia** (recipient): e.g. `http://localhost:3000/api/drop/:id` if on same machine, or your domain with Caddy.
