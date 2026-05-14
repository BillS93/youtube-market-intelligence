# YouTube Market Intelligence MVP

A local YouTube-only market research dashboard for combat-sport performance content strategy.

The MVP uses Next.js App Router, TypeScript, Prisma, SQLite, the server-side YouTube Data API, the OpenAI SDK, Tailwind CSS, and Vitest.

## What it does

- Runs limited YouTube API discovery from seed queries.
- Stores discovery candidates and lets you manually approve creators.
- Refreshes approved YouTube channels, uploads, video metadata, and metric snapshots.
- Calculates normalized performance using median creator baselines.
- Keeps short candidates separate from long-form benchmarks.
- Audits selected videos with OpenAI structured output.
- Requires stored evidence IDs before any AI audit can be saved.
- Generates a weekly report from stored scores and audits.
- Logs YouTube API calls and estimated quota cost.
- Provides a 30-day refresh/purge policy for YouTube API data.

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Create a local env file:

```bash
cp .env.example .env.local
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

3. Fill in `.env.local`:

```env
DATABASE_URL="file:./dev.db"
YOUTUBE_API_KEY="your-youtube-data-api-key"
OPENAI_API_KEY="your-openai-api-key"
OPENAI_MODEL="gpt-5.4-mini"
```

4. Create the SQLite database and seed settings:

```bash
npm run db:push
npm run db:seed
```

5. Run the app:

```bash
npm run dev
```

Open http://localhost:3000.

## Verification commands

```bash
npm run typecheck
npm run test
npm run lint
npm run build
```

## MVP workflow

1. Go to Discovery and enter a seed query.
2. Review candidates and approve relevant creators.
3. Go to Watchlist and refresh approved creators.
4. Go to Videos and calculate scores.
5. Select videos with stored snapshots and run audits.
6. Generate the weekly report.

## Guardrails

- No scraping.
- No browser automation for YouTube data collection.
- YouTube API calls are server-side only.
- API keys are never exposed through `NEXT_PUBLIC_` variables.
- Missing metrics remain null or unknown.
- AI audits cannot be saved without evidence IDs.
- Audit prompts instruct the model to analyze only supplied evidence.
- Reports cite stored content and audit IDs.

## Current limitations

- Discovery is intentionally small and manual for quota control.
- Weekly reports are deterministic summaries from stored evidence, not a broad market forecast.
- Comment collection is available in the connector but not wired into the UI by default.
- The app is local-first and does not include cron, deployment automation, Docker, Instagram, or background workers.
