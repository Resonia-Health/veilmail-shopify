# Veil Mail Shopify App

A Shopify app that integrates [Veil Mail](https://veilmail.xyz) for secure transactional and marketing emails — with automatic PII protection, CASL compliance, and abandoned cart recovery.

> **Use this if you run a Shopify store and want secure, compliant transactional and marketing email** without relying on Klaviyo, SendGrid, or Shopify Email. Veil Mail automatically scans every email for PII (credit cards, customer data), enforces CASL/GDPR compliance on marketing sends, and handles order confirmations, shipping notifications, customer sync, and abandoned cart flows — all from one platform.
>
> **Related:** [Veil Mail product](https://veilmail.xyz) · [Node.js SDK](https://github.com/Resonia-Health/veilmail-node) · [Docs](https://veilmail.xyz/docs)

## Features

- **Order Emails** - Automatic order confirmation, shipping, and delivery notifications
- **Customer Sync** - Sync Shopify customers to Veil Mail audiences
- **Abandoned Cart Recovery** - Send automated emails to recover lost sales
- **PII Protection** - Automatic masking of sensitive customer data

## Prerequisites

- Bun 1.1+
- Shopify Partner account
- Veil Mail account

## Development Setup

1. **Install dependencies**

```bash
cd integrations/shopify
bun install
```

2. **Set up the database**

```bash
bun run prisma generate
bun run prisma db push
```

3. **Configure environment**

Create a `.env` file:

```env
SHOPIFY_API_KEY=your_api_key
SHOPIFY_API_SECRET=your_api_secret
SHOPIFY_APP_URL=https://your-tunnel-url.ngrok.io
SCOPES=read_customers,write_customers,read_orders,write_orders,read_products
DATABASE_URL=postgresql://user:password@localhost:5432/veil_mail_shopify
```

4. **Start development server**

```bash
bun run dev
```

This will start the Shopify CLI dev server which handles:
- ngrok tunnel for OAuth
- App installation flow
- Hot reloading

## Architecture

```
integrations/shopify/
├── app/
│   ├── routes/
│   │   ├── app._index.tsx      # Dashboard
│   │   ├── app.settings.tsx    # Settings page
│   │   ├── app.templates.tsx   # Email templates (TODO)
│   │   ├── app.logs.tsx        # Email logs (TODO)
│   │   └── webhooks.tsx        # Webhook handlers
│   ├── services/
│   │   └── veil.server.ts      # Veil Mail API client
│   ├── shopify.server.ts       # Shopify app configuration
│   └── db.server.ts            # Prisma client
├── prisma/
│   └── schema.prisma           # Database schema
├── shopify.app.toml            # Shopify app configuration
└── package.json
```

## Webhooks

The app listens for these Shopify webhooks:

| Webhook | Action |
|---------|--------|
| `customers/create` | Sync new customer to Veil Mail |
| `customers/update` | Update customer in Veil Mail |
| `orders/create` | Send order confirmation email |
| `orders/fulfilled` | Send shipping notification |
| `orders/cancelled` | Send cancellation email |
| `checkouts/create` | Track for abandoned cart |
| `checkouts/update` | Update abandoned cart tracking |
| `app/uninstalled` | Clean up store data |

## Deployment

### Fly.io (Recommended)

1. Install Fly CLI: `brew install flyctl`

2. Create app:
```bash
fly launch
```

3. Set secrets:
```bash
fly secrets set SHOPIFY_API_KEY=xxx
fly secrets set SHOPIFY_API_SECRET=xxx
fly secrets set DATABASE_URL=xxx
```

4. Deploy:
```bash
fly deploy
```

### Other Platforms

The app can be deployed to any Node.js hosting platform:
- Railway
- Render
- Heroku
- Cloud Run

## Shopify App Store Submission

Before submitting to the Shopify App Store:

1. [ ] Complete all required app listing information
2. [ ] Add privacy policy and terms of service URLs
3. [ ] Test app installation/uninstallation flow
4. [ ] Verify all webhooks are working
5. [ ] Test with multiple stores
6. [ ] Review Shopify's app requirements

## License

MIT - Copyright (c) 2025-present Resonia Inc
