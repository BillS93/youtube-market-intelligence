\# YouTube Market Intelligence App — Codex Instructions



\## Project mission



Build a simple, fully integrated YouTube market research dashboard for combat-sport performance content strategy.



The app helps identify, approve, monitor, and analyze YouTube creators across three layers:



1\. MMA-specific performance/coaching creators.

2\. Broader combat-sport performance/coaching creators.

3\. General sport performance experts working with athletes.



The user’s business goal is to start a YouTube channel that attracts viewers, subscribers, athletes, and coaches who can later convert into paying online customers.



\## Non-negotiable principles



\- YouTube-only for MVP.

\- API-first.

\- Do not scrape YouTube.

\- Do not use browser automation for bulk data collection.

\- Do not hallucinate creators, videos, metrics, or claims.

\- Every AI conclusion must cite stored evidence from the database.

\- Store source IDs, timestamps, and raw API response metadata.

\- Separate observable evidence from interpretation.

\- Use normalized performance, not raw views alone.

\- Do not mix Shorts/short-form candidates with long-form videos in the same benchmark.

\- Missing data must be represented as null or "unknown", never guessed.

\- All analysis must include a confidence score.

\- The app must be simple to run locally.

\- The MVP should work before adding deployment, cron, Instagram, or complex infrastructure.



\## Preferred stack



Use:



\- Next.js App Router

\- TypeScript

\- Prisma

\- SQLite for the local MVP

\- OpenAI SDK

\- YouTube Data API via server-side fetch

\- Minimal Tailwind UI

\- Vitest or Jest for tests



Avoid:



\- FastAPI for MVP

\- Celery for MVP

\- Docker for MVP unless strictly necessary

\- scraping libraries

\- browser automation for YouTube data collection

\- multi-service architecture



\## Required app areas



Build these pages:



1\. Dashboard

2\. Discovery

3\. Creator watchlist

4\. Creator detail page

5\. Video explorer

6\. Top vs bottom comparison

7\. Weekly research report

8\. Settings/API status



\## Core workflow



1\. User enters seed queries.

2\. App runs limited YouTube API discovery.

3\. App stores candidate creators.

4\. User manually approves creators into a watchlist.

5\. App fetches each approved channel’s metadata.

6\. App fetches recent videos from each approved channel.

7\. App stores video metadata and metric snapshots.

8\. App calculates normalized performance.

9\. App audits selected videos with structured AI output.

10\. App generates a weekly market research report.



\## YouTube API rules



Use these methods:



\- search.list only for limited discovery.

\- channels.list for channel metadata and uploads playlist.

\- playlistItems.list for upload playlist video IDs.

\- videos.list for video snippet, contentDetails, statistics.

\- commentThreads.list only if needed and quota allows.



Quota strategy:



\- Do not run broad search endlessly.

\- Store API run logs.

\- Show estimated quota cost before running discovery.

\- Batch video IDs where possible.

\- Use pagination carefully.

\- Add a maximum pages setting.

\- Add a daily quota guardrail.



Compliance strategy:



\- Add a refresh/delete policy for YouTube API data older than 30 days.

\- Store generated strategy reports separately from raw API statistics.

\- Never expose API keys to the client.

\- Keep all YouTube API calls server-side.



\## Scoring



For each video calculate:



\- age\_days

\- views\_per\_day

\- likes\_per\_1000\_views where available

\- comments\_per\_1000\_views where available

\- creator\_median\_views\_per\_day

\- overperformance\_score

\- percentile\_within\_creator

\- percentile\_within\_layer

\- format\_type: long\_form, short\_candidate, unknown

\- flags: too\_new, missing\_stats, outlier, celebrity\_or\_event\_driven\_possible, insufficient\_baseline



Use median baselines, not means, because outliers can distort means.



Do not compare:

\- Shorts/short candidates to long-form.

\- New videos to old videos without age correction.

\- Big creators to small creators without normalization.

\- General entertainment clips to coaching videos without tagging the content type.



\## AI audit requirements



Use structured outputs.



For each audited video, return:



\- topic

\- sport\_layer

\- content\_archetype

\- format\_type

\- hook\_type

\- audience\_problem

\- coaching\_quality\_score

\- scientific\_quality\_score

\- business\_relevance\_score

\- repeatability\_score

\- observable\_evidence

\- interpretation

\- why\_it\_likely\_performed

\- why\_it\_might\_underperform

\- risks\_or\_caveats

\- suggested\_adaptation\_for\_user

\- confidence\_score



Rules:



\- The model may only analyze the data supplied to it.

\- It must not claim to know the algorithm.

\- It must not claim causation from correlation.

\- It must not invent creator credentials.

\- It must distinguish platform performance from business relevance.

\- It must recommend ethical adaptation, not copying.



\## Business relevance



The app should prioritize videos and creators that are useful for building an online performance business, not just viral entertainment.



High business relevance examples:



\- MMA conditioning

\- fight camp preparation

\- return-to-training after injury

\- movement quality for fighters

\- strength training for combat athletes

\- athlete monitoring

\- recovery

\- power development

\- coaching education

\- programming frameworks

\- common mistakes and fixes



Lower business relevance examples:



\- pure fight gossip

\- celebrity drama

\- meme reactions

\- general fitness entertainment

\- unrelated motivational edits



\## Testing expectations



After every meaningful change:



\- Run type checks.

\- Run tests.

\- Run linting if configured.

\- Add tests for scoring logic.

\- Add mocked tests for YouTube API calls.

\- Add tests that AI audit output cannot be saved without evidence IDs.

\- Add tests for missing metrics and too-new videos.



\## Definition of done



A feature is not done unless:



\- It works locally.

\- It has tests where appropriate.

\- It handles missing data.

\- It does not expose secrets.

\- It stores evidence.

\- It shows confidence.

\- It does not silently fail.

\- The UI is simple enough for a non-developer to use.

