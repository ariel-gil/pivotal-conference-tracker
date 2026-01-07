# AI Safety Conference Tracker

A Next.js application that tracks AI safety, ML, NLP, and ethics conference deadlines with automated verification using dual-model consensus.

## Features

- **Automated Deadline Verification**: Uses Gemini 3 Pro Preview and Flash Preview models with 4 independent searches per conference
- **Confidence Scoring**: High/Medium/Low/Needs-Review indicators based on source consensus
- **Daily Auto-Refresh**: Vercel Cron automatically updates deadlines every 24 hours
- **Smart Filtering**: Filter by category, show/hide passed deadlines
- **Urgent Alerts**: Highlights deadlines within 30 days
- **Verification History**: Full audit trail of all deadline checks

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

# Vercel Postgres (auto-provided by Vercel)
# POSTGRES_URL=your_postgres_connection_string

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

## Deployment

### Deploy to Vercel

```bash
vercel
```

### Configure in Vercel Dashboard

1. **Add Vercel KV**: Storage → Create Database → KV
2. **Set Environment Variables**:
   - `GEMINI_API_KEY`: Your Google AI API key
   - `CRON_SECRET`: A random secret string
   - KV variables are auto-added when you create the KV database
3. **Initialize Data**: Visit `/api/seed` endpoint once after deployment
4. **Verify Cron Job**: The cron job is configured in `vercel.json` to run daily at 2 AM UTC

### Manual Cron Trigger (for testing)

```bash
curl -X GET https://your-app.vercel.app/api/cron/refresh-deadlines \
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

3. **Automated Updates**: Vercel Cron runs daily to verify conferences with low/medium confidence or those needing review

## Project Structure

```
conference-tracker/
├── app/
│   ├── api/
│   │   ├── verify-deadline/route.ts    # Dual-model verification
│   │   ├── cron/refresh-deadlines/route.ts  # Automated refresh
│   │   └── seed/route.ts               # Database initialization
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx                        # Server component
├── components/
│   └── ConferenceTracker.tsx           # Main UI component
├── lib/
│   ├── db.ts                           # KV database helpers
│   └── seed-data.ts                    # Initial conference data
├── vercel.json                         # Cron configuration
└── package.json
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

**Response:**
```json
{
  "deadline": "2026-01-28",
  "confidence": "high",
  "sources": ["https://icml.cc/...", "..."],
  "modelResults": [...],
  "recommendation": "Strong consensus across multiple searches."
}
```

### GET /api/cron/refresh-deadlines

Automated cron endpoint (protected by `CRON_SECRET`).

## License

MIT
