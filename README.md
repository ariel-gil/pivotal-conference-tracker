# AI Safety Conference Tracker

A Next.js application that tracks AI safety, ML, NLP, and ethics conference deadlines with automated verification using dual-model consensus.

## Features

- Deadline verification using Gemini models (4 searches per conference, dual-model consensus)
- Conference discovery via Gemini with Google Search grounding
- Admin page for reviewing and approving discovered conferences
- Confidence indicators based on source agreement
- Daily cron job for automatic updates
- Category filtering and show/hide passed deadlines
- Changelog of recent updates
- Disclaimer noting AI-generated results should be verified

## Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes, Vercel Cron
- **Database**: Vercel KV (Redis)
- **AI**: Google Gemini API (3 Pro Preview + 3 Flash Preview with 2.5 fallbacks)

## Setup

### 1. Clone and Install

```bash
cd conference-tracker
npm install
```

### 2. Environment Variables

Create `.env.local`:

```bash
# Get your API key from: https://aistudio.google.com/app/apikey
GEMINI_API_KEY=your_gemini_api_key_here

# Admin Access
# Set a strong secret for the admin dashboard
ADMIN_SECRET=your_admin_secret_here

# Redis (Vercel KV)
# REDIS_URL=redis://localhost:6379 (or your Vercel KV URL)

# Cron Secret (generate a random string)
CRON_SECRET=your_random_secret_here
```

### 3. Database Setup

**Create Vercel KV Database:**

1. Go to your Vercel dashboard
2. Select your project → Storage → Create Database
3. Choose **KV** (Redis)
4. Click "Create"
5. Vercel will automatically add the KV environment variables to your project

**Initialize with Data:**

After deploying or running locally with KV configured:

```bash
# Visit this endpoint to seed the database
curl http://localhost:3000/api/seed
# Or after deployment:
curl https://your-app.vercel.app/api/seed
```

This only needs to be done once. The endpoint will only initialize if the database is empty.

### 5. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Admin Dashboard

Access the admin dashboard to review discovered conferences:

1. Navigate to `/admin`
2. Enter your `ADMIN_SECRET` to login
3. Review "Pending Conferences" discovered by the AI
   - **Approve**: Adds the conference to the main public list and triggers a site update
   - **Dismiss**: Removes the conference from the pending list

## Deployment

### Deploy to Vercel

```bash
vercel
```

### Configure in Vercel Dashboard

1. **Add Vercel KV**: Storage → Create Database → KV
2. **Set Environment Variables**:
   - `GEMINI_API_KEY`: Your Google AI API key
   - `ADMIN_SECRET`: Your chosen admin password
   - `CRON_SECRET`: A random secret string
   - KV variables are auto-added when you create the KV database
3. **Initialize Data**: Visit `/api/seed` endpoint once after deployment
4. **Verify Cron Job**: The cron job is configured in `vercel.json` to run daily at 2 AM UTC

### Manual Cron Trigger (for testing)

```bash
# Verify deadlines
curl -X GET https://your-app.vercel.app/api/cron/refresh-deadlines \
  -H "Authorization: Bearer YOUR_CRON_SECRET"

# Discover new conferences
curl -X GET https://your-app.vercel.app/api/cron/discover \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

## How It Works

### Verification Process

1. **Dual-Model Search**: Each conference gets 4 searches:
   - 2 searches with `gemini-3-flash-preview` (fallback: `gemini-2.5-flash-latest`)
   - 2 searches with `gemini-3-pro-preview` (fallback: `gemini-2.5-pro-latest`)

2. **Consensus Analysis**:
   - **High confidence** (✓✓✓): 3-4 sources agree
   - **Medium confidence** (✓✓): 2 sources agree
   - **Low confidence** (✓): Conflicting data
   - **Needs review** (🔍): Verification failed

### Automated Discovery

1. **Search**: The system asks Gemini to find new AI safety/ML conferences using Google Search grounding.
2. **Deduplication**: Checks against existing conferences to avoid duplicates.
3. **Queue**: New findings are added to the "Pending" list for manual admin review.
4. **Approval**: Once approved, they appear on the main site immediately.

## Project Structure

```
conference-tracker/
├── app/
│   ├── admin/                  # Admin dashboard
│   ├── api/
│   │   ├── admin/              # Admin API routes (approve/dismiss)
│   │   ├── verify-deadline/    # Dual-model verification
│   │   ├── discover-conferences/# Discovery logic
│   │   ├── cron/               # Automated jobs
│   │   └── seed/               # Database initialization
│   ├── page.tsx                # Main public page
├── components/
│   ├── ConferenceTracker.tsx   # Main UI
│   └── AdminReview.tsx         # Admin UI
├── lib/
│   ├── db.ts                   # Redis/KV helpers
│   ├── auth.ts                 # Authentication logic
│   └── seed-data.ts            # Initial conference data
```

## API Routes

### POST /api/verify-deadline

Verify a single conference deadline.

**Request:**
```json
{
  "conferenceName": "ICML 2026"
}
```

### POST /api/discover-conferences

Trigger manual discovery (requires Admin Auth).

### GET /api/cron/refresh-deadlines

Automated cron endpoint (protected by `CRON_SECRET`).

## License

MIT
