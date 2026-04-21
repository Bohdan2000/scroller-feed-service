# Feed Service

Personalised video feed and engagement signal tracking for the Scroller platform.

## Responsibilities

- Serve a ranked, deduplicated, paginated feed of video IDs to authenticated users
- Record engagement signals: impressions, watch events, likes, shares
- Maintain rolling daily counters per video for ranking
- Manage feed sessions for cross-page deduplication

The feed service is **not** the source of truth for video metadata. It only owns `videoId` references. The mobile client must call **content-service** to enrich each feed item with title, thumbnail, playback ID, duration, etc.

---

## Architecture decisions

### Feed is not a source of truth

Feed service stores engagement signals (like counts, view counts, watch time). It does NOT store video metadata. This separation means:

- Content-service owns video lifecycle (create, publish, delete)
- Feed-service reacts to engagement and serves ranked lists
- No circular dependencies between services

### Cursor pagination

Pages are identified by a base64-encoded cursor:

```
base64( JSON.stringify({ "s": "<sessionId>", "p": <lastPosition> }) )
```

- `s` — the feed session UUID
- `p` — the 0-indexed position of the last item returned

Pass the `nextCursor` value from one response as the `cursor` query param on the next request. A `null` nextCursor means the feed is exhausted for this session.

Cursors are **opaque** — clients must not construct or modify them.

### Deduplication strategy

Each feed page request is tied to a `FeedSession`. When the client records impressions via `POST /feed/events/impression`, the service writes `FeedImpression` rows keyed on `(sessionId, videoId)`. On the next `GET /feed` call with a cursor, all videoIds already present in the session's impressions are excluded from the candidate pool.

Sessions expire after `FEED_SESSION_TTL_HOURS` (default 24h). A new `GET /feed` without a cursor starts a fresh session with an empty seen set.

### Ranking formula

Current placeholder formula (replace with ML model later):

```
rawScore = (likes × 3 + shares × 5 + views × 1 + watchTimeSec × 0.01)
           × recencyDecay(publishedAt)

recencyDecay(t) = 1 / (1 + hoursSincePublished / 24)
```

Scores are normalised to [0, 1] within each batch. The `RankingService` is intentionally isolated so a future ML model can drop in by implementing the same interface.

### Daily video counters

`DailyVideoCounter` holds one row per `(videoId, UTC date)`. All counter increments use Prisma's `{ increment: N }` syntax — never read-modify-write — to avoid race conditions under concurrent requests.

Candidates for the feed are sourced from the last 2 days of counters (today + yesterday). This is a placeholder until a proper recommendation engine is wired in.

---

## Setup

### Prerequisites

- Node.js 20+
- Docker + Docker Compose (for local database)
- `npm` with `legacy-peer-deps=true` (set in `.npmrc`)

### 1. Environment variables

Copy `.env.example` to `.env` and fill in values:

```bash
cp .env.example .env
```

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `3004` | HTTP port |
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | Yes | — | Must match identity-service exactly |
| `FEED_SESSION_TTL_HOURS` | No | `24` | Feed session lifetime in hours |
| `FEED_PAGE_SIZE` | No | `20` | Default items per page |

### 2. Start the database

```bash
docker compose up postgres -d
```

### 3. Run migrations

```bash
npm run prisma:migrate:dev
# or for production:
npm run prisma:migrate:deploy
```

### 4. Install dependencies

```bash
npm install
```

### 5. Start the service

```bash
# Development (watch mode)
npm run start:dev

# Production
npm run build && npm start
```

### 6. Swagger UI

Available at: `http://localhost:3004/api/v1/docs`

### 7. Docker (full stack)

```bash
JWT_ACCESS_SECRET=<your-secret> docker compose up --build
```

---

## API reference

All endpoints are prefixed with `/api/v1` and require a Bearer JWT (`Authorization: Bearer <token>`) unless otherwise noted.

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/health` | Public | Health check |
| `GET` | `/api/v1/feed` | JWT | Get ranked feed page |
| `POST` | `/api/v1/feed/events/impression` | JWT | Record video impressions |
| `POST` | `/api/v1/feed/events/watch` | JWT | Record watch event |
| `POST` | `/api/v1/feed/events/like` | JWT | Like a video |
| `DELETE` | `/api/v1/feed/events/like/:videoId` | JWT | Unlike a video |
| `POST` | `/api/v1/feed/events/share` | JWT | Record share event |

### GET /api/v1/feed

Query params:

| Param | Type | Description |
|---|---|---|
| `cursor` | `string?` | Opaque base64 cursor from previous response |
| `limit` | `number?` | Items per page (1–50, default 20) |
| `topicIds` | `string[]?` | Filter by topic IDs (currently a no-op) |

Response `200`:

```json
{
  "items": [
    { "videoId": "uuid", "position": 0, "score": 0.9200 }
  ],
  "nextCursor": "eyJzIjoiLi4uIiwicCI6MTl9",
  "sessionId": "uuid"
}
```

---

## Event catalog

Events emitted by this service (currently logged only — TODO: publish to RabbitMQ):

| Event | Routing key | Payload |
|---|---|---|
| Video liked | `video.liked` | `{ videoId: string, userId: string }` |
| Video unliked | `video.unliked` | `{ videoId: string, userId: string }` |
| Video shared | `video.shared` | `{ videoId: string, userId: string, platform: string \| null }` |

Planned exchange: `feed.events` (topic exchange).

---

## Cursor format

Cursors are base64-encoded JSON with two fields:

```ts
interface CursorPayload {
  s: string;  // feed session UUID
  p: number;  // 0-indexed position of the last returned item
}
```

Example encoding:

```ts
const cursor = Buffer.from(JSON.stringify({ s: 'session-uuid', p: 19 })).toString('base64');
// eyJzIjoic2Vzc2lvbi11dWlkIiwicCI6MTl9
```

Clients should treat cursors as opaque. The service validates the cursor on decode and throws `FEED_004` for any malformed input.

---

## Error codes

| Code | Status | Description |
|---|---|---|
| `FEED_001` | 404 | Feed session not found or expired |
| `FEED_002` | 409 | Video already liked |
| `FEED_003` | 404 | Video not liked (cannot unlike) |
| `FEED_004` | 400 | Invalid or malformed cursor |
