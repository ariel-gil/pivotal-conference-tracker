# AI Safety Conference Tracker

## Project Overview
A Next.js web app that tracks AI safety, ML, NLP, and ethics conference deadlines. Uses Gemini AI for automated discovery and deadline verification with dual-model consensus. Deployed on Vercel with Redis (Vercel KV) for storage.

## Tech Stack
- **Framework**: Next.js 15 (App Router), React 19, TypeScript 5.7
- **Styling**: Tailwind CSS 3.4, lucide-react icons
- **Database**: Redis via ioredis (Vercel KV in production)
- **AI**: Google Gemini (`@google/genai`) with Google Search grounding
- **Deployment**: Vercel with cron jobs
- **Analytics**: Vercel Web Analytics

## Commands
- `npm run dev` - Start dev server
- `npm run build` - Production build
- `npm run lint` - ESLint check
- No test framework is configured

## Project Structure
```
app/
  page.tsx                          # Main public page (SSR, 1hr ISR)
  layout.tsx                        # Root layout with Vercel Analytics
  admin/page.tsx                    # Admin dashboard (force-dynamic)
  api/
    admin/                          # Admin-protected routes (ADMIN_SECRET)
      approve/route.ts              # Approve pending conference
      dismiss/route.ts              # Dismiss pending conference
      delete/route.ts               # Delete conference
      login/route.ts                # Set admin session cookie
      update-conference/route.ts    # Edit conference fields
      pending-updates/
        approve/route.ts            # Accept AI-suggested update
        dismiss/route.ts            # Reject AI-suggested update
    cron/                           # Vercel cron jobs (CRON_SECRET)
      refresh-deadlines/route.ts    # Daily @ 2AM UTC - verify deadlines
      discover/route.ts             # Every 2 days @ 3AM UTC - find new conferences
    verify-deadline/route.ts        # Manual single-conference verification
    discover-conferences/route.ts   # Manual discovery trigger
    seed/route.ts                   # One-time DB initialization
    health/route.ts                 # Health check
components/
  ConferenceTracker.tsx             # Public UI - conference list with filters
  AdminReview.tsx                   # Admin UI - approve/dismiss/edit queues
lib/
  db.ts                             # All Redis operations, type definitions
  auth.ts                           # Admin auth, cron auth, rate limiting
  config.ts                         # Gemini model configuration
  verification.ts                   # AI verification & discovery logic
  seed-data.ts                      # Initial 18 conferences
```

## Key Data Models (defined in `lib/db.ts`)

### Conference
Core fields: `id`, `name`, `deadline` (YYYY-MM-DD), `abstract_deadline?`, `location`, `dates`, `description`, `requirements`, `link`, `category` (safety|ml|nlp|ethics), `status` (open|passed|rolling), `review_status` (unreviewed|reviewed|speculative), `confidence_score` (high|medium|low|needs-review), `verification_sources[]`, `last_verified?`, `date_added?`, `verification_history[]`

### PendingConference
Same fields as Conference but with string `id` (UUID) and `addedAt` timestamp. Lives in admin queue awaiting approval.

### PendingUpdate
AI-suggested changes to reviewed conferences: `conferenceId`, `field`, `oldValue`, `newValue`, `confidence`, `sources[]`

## Redis Keys
- `conferences:all` - Public confirmed conferences
- `conferences:pending` - Discovered, awaiting admin approval
- `conferences:pending_updates` - AI-suggested changes to reviewed conferences
- `conferences:changelog` - Activity log (max 50 entries)

## Architecture Patterns
- **Optimistic locking**: Redis WATCH/MULTI for concurrent writes in `db.ts`
- **Dual-model consensus**: 4 parallel Gemini searches (2 Flash + 2 Pro) for deadline verification
- **Review status gate**: "reviewed" conferences route AI changes to pending queue; "unreviewed"/"speculative" allow auto-updates
- **Rate limiting**: In-memory Map (not persisted across deploys) in `auth.ts`
- **ISR**: Main page revalidates every hour; admin is force-dynamic
- **Validation**: `validateConferenceData()` in `db.ts` checks required fields, date formats, valid categories/statuses

## Environment Variables
- `GEMINI_API_KEY` - Google AI Studio key
- `ADMIN_SECRET` - Admin access password
- `CRON_SECRET` - Cron job authorization
- `REDIS_URL` - Auto-provided by Vercel KV

## Valid Categories
`safety`, `ml`, `nlp`, `ethics` - hardcoded in `validateConferenceData()` in `lib/db.ts` and filter buttons in `ConferenceTracker.tsx`

## Auth Flow
1. Admin visits `/admin?key=ADMIN_SECRET` → rate-limited, sets HTTP-only cookie
2. All admin API routes check cookie or Bearer token via `validateAdminAuth()` in `lib/auth.ts`
3. Cron jobs use separate `CRON_SECRET` via `validateCronAuth()`

## Coding Conventions
- Functional React components with hooks (`useState`, `useEffect`, `useCallback`)
- `'use client'` directive on interactive components
- Server components for data fetching (pages)
- All DB functions are async, throw on failure (except changelog which silently fails)
- API routes return `NextResponse.json()` with appropriate status codes
- Tailwind utility classes inline (no CSS modules)
- Section separators in lib files: `// ============================================================================`
