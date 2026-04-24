# 1 Plus 1 Matching & Taaruf

A premium Islamic matchmaking registration platform. Collects registrations with $10 Stripe payments, supports configurable male/female slot limits (default 40 each), and includes a full admin dashboard.

## Tech Stack

- **Next.js 15** (App Router)
- **Convex** (real-time database)
- **TanStack React Form v1** (form handling with validation)
- **Stripe** ($10 payment checkout)
- **shadcn/ui** + Tailwind CSS (UI components)

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Set up Convex

```bash
npx convex dev
```

This will prompt you to create a Convex project and set `NEXT_PUBLIC_CONVEX_URL` in your `.env.local`.

### 3. Configure environment variables

Copy `.env.example` to `.env.local` and fill in:

```
NEXT_PUBLIC_CONVEX_URL=       # Set automatically by `npx convex dev`
STRIPE_SECRET_KEY=            # From Stripe Dashboard > API Keys
STRIPE_WEBHOOK_SECRET=        # From Stripe Dashboard > Webhooks
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=  # From Stripe Dashboard
ADMIN_PASSWORD=               # Password for /admin dashboard
RESEND_API_KEY=               # From Resend, for confirmation emails
NEXT_PUBLIC_APP_URL=          # Public app URL, e.g. http://localhost:3000
```

### 4. Run development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 5. Set up Stripe webhook (for local dev)

```bash
stripe listen --forward-to localhost:3000/api/webhook
```

## Pages

| Route | Description |
|-------|-------------|
| `/` | Landing page with slot counters |
| `/register` | Registration form |
| `/success` | Payment success page |
| `/cancelled` | Payment cancelled page |
| `/admin` | Admin dashboard (password protected) |

## Create GitHub Repo & Deploy

```bash
# Create private repo and push
gh repo create moeghashim/taaruf-app --private --source=. --push

# Deploy to Vercel
npx vercel
```

Then add your environment variables in the Vercel dashboard and set the Convex deployment URL.
