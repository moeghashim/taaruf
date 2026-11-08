# 1 Plus 1 Matching & Taaruf

A premium Islamic matchmaking registration platform. Collects registrations with $10 Stripe payments, supports event-specific male/female capacity and waitlists, and includes a full admin dashboard.

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

Copy [.env.example](.env.example) to `.env.local` and fill in its documented variables. Follow its separate Next server and Convex credential configuration instructions.

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
| `/` | Landing page with open/waitlist labels |
| `/register` | Registration form |
| `/success` | Payment success page |
| `/cancelled` | Payment cancelled page |
| `/admin` | Admin dashboard (password protected) |
| `/me` | Applicant profile, event registrations, and interests |

For event queue and confirmation behavior, see [event-only waitlists](docs/event-only-waitlists-review.md#implemented). For submission photo choices and revocation, see [photo consent](docs/issue58-photo-consent.md#behavior). For invalidated links and fresh sign-in recovery, see [capability cutoff and recovery](docs/capability-cutoff-recovery.md).

## Create GitHub Repo & Deploy

```bash
# Create private repo and push
gh repo create moeghashim/taaruf-app --private --source=. --push

# Deploy to Vercel
npx vercel
```

Then add your environment variables in the Vercel dashboard and set the Convex deployment URL.
