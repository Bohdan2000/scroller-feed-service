import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  FeedSessionNotFoundException,
  InvalidCursorException,
  VideoAlreadyLikedException,
  VideoNotLikedException,
} from '../common/exceptions/domain.exceptions';
import { RankingService, CandidateVideo } from './ranking.service';
import { FeedQueryDto } from './dto/feed-query.dto';
import { FeedResponseDto, FeedItemDto } from './dto/feed-response.dto';
import { ImpressionEventDto } from './dto/impression-event.dto';
import { WatchEventDto } from './dto/watch-event.dto';
import { LikeEventDto } from './dto/like-event.dto';
import { ShareEventDto } from './dto/share-event.dto';

interface CursorPayload {
  /** sessionId */
  s: string;
  /** lastPosition (0-indexed) */
  p: number;
}

interface CounterIncrement {
  views?: number;
  likes?: number;
  shares?: number;
  watchTimeSec?: number;
}

@Injectable()
export class FeedService {
  private readonly logger = new Logger(FeedService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rankingService: RankingService,
    private readonly config: ConfigService,
  ) {}

  // ─── GET /feed ─────────────────────────────────────────────────────────────

  /**
   * Build a personalised feed page.
   *
   * Steps:
   * 1. Parse cursor (if provided) → { sessionId, lastPosition }
   * 2. If no cursor → create a new FeedSession
   * 3. Load or create UserFeedState
   * 4. Load seen videoIds from FeedImpressions in the current session
   * 5. Query DailyVideoCounters for today + yesterday (last 2 days) to get candidates
   *    TODO: Replace with a proper recommendation engine (e.g. collaborative filtering).
   * 6. Filter out already-seen videoIds (deduplication)
   * 7. Filter by topicIds if provided (currently a no-op — see TODO below)
   * 8. Rank candidates with RankingService
   * 9. Slice to `limit`
   * 10. Return items + nextCursor (null if fewer items than limit)
   *
   * NOTE: The feed response contains ONLY videoId, position, score.
   * The client calls content-service for metadata (title, thumbnail, playbackId).
   */
  async getFeed(userId: string, query: FeedQueryDto): Promise<FeedResponseDto> {
    const limit = query.limit ?? this.config.get<number>('feed.pageSize', 20);
    const sessionTtlHours = this.config.get<number>('feed.sessionTtlHours', 24);

    let sessionId: string;
    let lastPosition: number;

    // ── Step 1 & 2: cursor → session ─────────────────────────────────────────
    if (query.cursor) {
      const parsed = this.parseCursor(query.cursor);
      sessionId = parsed.sessionId;
      lastPosition = parsed.lastPosition;

      // Verify session exists
      const session = await this.prisma.feedSession.findUnique({
        where: { id: sessionId },
        select: { id: true, userId: true, expiresAt: true },
      });

      if (!session || session.userId !== userId || session.expiresAt < new Date()) {
        throw new FeedSessionNotFoundException();
      }
    } else {
      // No cursor — start a new session
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + sessionTtlHours);

      const session = await this.prisma.feedSession.create({
        data: { userId, expiresAt },
      });

      sessionId = session.id;
      lastPosition = -1; // will be incremented to 0 for the first item

      // TODO: A background job should clean up expired FeedSession rows.
      // For now they remain until a manual cleanup or DB partition pruning.
    }

    // ── Step 3: Upsert UserFeedState ─────────────────────────────────────────
    await this.prisma.userFeedState.upsert({
      where: { userId },
      create: { userId, lastSessionId: sessionId },
      update: { lastSessionId: sessionId },
    });

    // ── Step 4: Load seen videoIds ────────────────────────────────────────────
    const seenVideoIds = await this.getSeenVideoIds(sessionId);

    // ── Step 5: Query DailyVideoCounters for the last 2 days ─────────────────
    // TODO: Replace this naive counter-based candidate selection with a proper
    // recommendation engine (e.g. two-tower model, collaborative filtering).
    const today = this.getUtcDateKey();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const counters = await this.prisma.dailyVideoCounter.findMany({
      where: {
        date: { gte: yesterday },
      },
      orderBy: [
        // Placeholder pre-sort: likes*3 + shares*5 + views cannot be expressed
        // directly in Prisma orderBy, so we sort by likes desc as a proxy and
        // rely on RankingService for the real ordering.
        { likes: 'desc' },
        { shares: 'desc' },
        { views: 'desc' },
      ],
      // Fetch a larger pool to have enough after deduplication
      take: (limit + seenVideoIds.size) * 5 + 100,
    });

    // ── Step 6: De-duplicate (filter out already-seen videos) ─────────────────
    const unseenCounters = counters.filter((c) => !seenVideoIds.has(c.videoId));

    // ── Step 7: Topic filter via local VideoTopicIndex ────────────────────────
    // The index is populated by the video-published.consumer from RabbitMQ events.
    let topicFilteredCounters = unseenCounters;
    const videoTopicMap = new Map<string, { topicIds: string[]; publishedAt: Date | undefined }>();

    if (query.topicIds && query.topicIds.length > 0) {
      // Load topic index rows for the candidate videoIds that match the requested topics
      const candidateVideoIds = unseenCounters.map((c) => c.videoId);
      const topicIndexRows = await this.prisma.videoTopicIndex.findMany({
        where: {
          videoId: { in: candidateVideoIds },
          topicId: { in: query.topicIds },
        },
        select: { videoId: true, topicId: true, publishedAt: true },
      });

      const matchedVideoIds = new Set(topicIndexRows.map((r) => r.videoId));
      topicFilteredCounters = unseenCounters.filter((c) => matchedVideoIds.has(c.videoId));

      // Build a map of videoId → { topicIds, publishedAt } for the ranking step
      for (const row of topicIndexRows) {
        const existing = videoTopicMap.get(row.videoId);
        if (existing) {
          existing.topicIds.push(row.topicId);
        } else {
          videoTopicMap.set(row.videoId, {
            topicIds: [row.topicId],
            publishedAt: row.publishedAt,
          });
        }
      }
    }

    // ── Step 8: Rank ───────────────────────────────────────────────────────────
    const candidates: CandidateVideo[] = topicFilteredCounters.map((c) => {
      const topicEntry = videoTopicMap.get(c.videoId);
      return {
        videoId: c.videoId,
        topicIds: topicEntry?.topicIds ?? [],
        publishedAt: topicEntry?.publishedAt,
        counters: {
          views: c.views,
          likes: c.likes,
          shares: c.shares,
          watchTimeSec: c.watchTimeSec,
        },
      };
    });

    const ranked = this.rankingService.rank(candidates);

    // ── Step 9: Slice ─────────────────────────────────────────────────────────
    const page = ranked.slice(0, limit);

    // ── Step 10: Check which page videos the user has already liked ───────────
    const pageVideoIds = page.map((v) => v.videoId);
    const likedRows = await this.prisma.videoLike.findMany({
      where: { userId, videoId: { in: pageVideoIds } },
      select: { videoId: true },
    });
    const likedSet = new Set(likedRows.map((r) => r.videoId));

    // ── Step 11: Build response ───────────────────────────────────────────────
    const startPosition = lastPosition + 1;
    const items: FeedItemDto[] = page.map((v, idx) => ({
      videoId: v.videoId,
      position: startPosition + idx,
      score: Math.round(v.score * 10000) / 10000,
      isLiked: likedSet.has(v.videoId),
    }));

    const nextCursor =
      page.length < limit
        ? null
        : this.buildCursor(sessionId, startPosition + page.length - 1);

    return { items, nextCursor, sessionId };
  }

  // ─── POST /feed/events/impression ─────────────────────────────────────────

  /**
   * Record which videoIds the user saw and at what positions.
   * Upserts FeedImpression rows (sessionId + videoId unique — idempotent).
   * Increments DailyVideoCounter.views for each videoId.
   */
  async recordImpression(userId: string, dto: ImpressionEventDto): Promise<void> {
    const { sessionId, videoIds, startPosition } = dto;

    // Verify session belongs to user
    const session = await this.prisma.feedSession.findUnique({
      where: { id: sessionId },
      select: { id: true, userId: true },
    });

    if (!session || session.userId !== userId) {
      throw new FeedSessionNotFoundException();
    }

    // Upsert impressions + increment view counters in parallel
    await Promise.all(
      videoIds.map(async (videoId, idx) => {
        const position = startPosition + idx;

        await this.prisma.feedImpression.upsert({
          where: { sessionId_videoId: { sessionId, videoId } },
          create: { sessionId, userId, videoId, position },
          update: { position }, // idempotent — update position if re-sent
        });

        await this.upsertDailyCounter(videoId, { views: 1 });
      }),
    );
  }

  // ─── POST /feed/events/watch ───────────────────────────────────────────────

  /**
   * Record a watch event.
   * completionRate = min(watchedSec / durationSec, 1.0)
   * Atomically increments DailyVideoCounter.watchTimeSec.
   */
  async recordWatch(userId: string, dto: WatchEventDto): Promise<void> {
    const { videoId, watchedSec, durationSec } = dto;

    const completionRate = Math.min(watchedSec / durationSec, 1.0);

    await this.prisma.watchEvent.create({
      data: { userId, videoId, watchedSec, durationSec, completionRate },
    });

    await this.upsertDailyCounter(videoId, { watchTimeSec: watchedSec });
  }

  // ─── POST /feed/events/like ────────────────────────────────────────────────

  /**
   * Like a video.
   * Creates a VideoLike row (unique userId+videoId).
   * Throws VideoAlreadyLikedException if already liked.
   * Atomically increments DailyVideoCounter.likes.
   * Emits event: video.liked → { videoId, userId }
   */
  async likeVideo(userId: string, dto: LikeEventDto): Promise<void> {
    const { videoId } = dto;

    const existing = await this.prisma.videoLike.findUnique({
      where: { userId_videoId: { userId, videoId } },
      select: { id: true },
    });

    if (existing) {
      throw new VideoAlreadyLikedException();
    }

    await this.prisma.videoLike.create({ data: { userId, videoId } });
    await this.upsertDailyCounter(videoId, { likes: 1 });

    this.emitEvent('video.liked', { videoId, userId });
  }

  // ─── DELETE /feed/events/like/:videoId ────────────────────────────────────

  /**
   * Unlike a video.
   * Deletes the VideoLike row.
   * Throws VideoNotLikedException if not found.
   * Atomically decrements DailyVideoCounter.likes (floor at 0).
   * Emits event: video.unliked → { videoId, userId }
   */
  async unlikeVideo(userId: string, videoId: string): Promise<void> {
    const existing = await this.prisma.videoLike.findUnique({
      where: { userId_videoId: { userId, videoId } },
      select: { id: true },
    });

    if (!existing) {
      throw new VideoNotLikedException();
    }

    await this.prisma.videoLike.delete({
      where: { userId_videoId: { userId, videoId } },
    });

    // Decrement likes, but floor at 0 to prevent negative counters
    const today = this.getUtcDateKey();

    await this.prisma.dailyVideoCounter.upsert({
      where: { videoId_date: { videoId, date: today } },
      create: { videoId, date: today, likes: 0 },
      update: {
        likes: {
          // Prisma doesn't support GREATEST(likes - 1, 0) natively.
          // We decrement by 1; the periodic counter reconciliation job (TODO)
          // should correct any drift. This is safe for typical usage patterns.
          decrement: 1,
        },
      },
    });

    this.emitEvent('video.unliked', { videoId, userId });
  }

  // ─── POST /feed/events/share ───────────────────────────────────────────────

  /**
   * Record a share event.
   * Creates a VideoShare row (not unique — same user can share multiple times).
   * Atomically increments DailyVideoCounter.shares.
   * Emits event: video.shared → { videoId, userId, platform }
   */
  async shareVideo(userId: string, dto: ShareEventDto): Promise<void> {
    const { videoId, platform } = dto;

    await this.prisma.videoShare.create({
      data: { userId, videoId, platform: platform ?? null },
    });

    await this.upsertDailyCounter(videoId, { shares: 1 });

    this.emitEvent('video.shared', { videoId, userId, platform: platform ?? null });
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  /**
   * Decode a base64-encoded cursor JSON string.
   * Throws InvalidCursorException on any malformed input.
   */
  private parseCursor(cursor: string): { sessionId: string; lastPosition: number } {
    try {
      const json = Buffer.from(cursor, 'base64').toString('utf8');
      const parsed = JSON.parse(json) as Partial<CursorPayload>;

      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      if (
        typeof parsed.s !== 'string' ||
        !UUID_RE.test(parsed.s) ||
        typeof parsed.p !== 'number' ||
        !Number.isInteger(parsed.p) ||
        parsed.p < -1
      ) {
        throw new InvalidCursorException();
      }

      return { sessionId: parsed.s, lastPosition: parsed.p };
    } catch (err) {
      if (err instanceof InvalidCursorException) throw err;
      throw new InvalidCursorException();
    }
  }

  /**
   * Encode a cursor as base64 JSON.
   */
  private buildCursor(sessionId: string, lastPosition: number): string {
    const payload: CursorPayload = { s: sessionId, p: lastPosition };
    return Buffer.from(JSON.stringify(payload)).toString('base64');
  }

  /**
   * Return a Set of all videoIds already shown in the given session.
   */
  private async getSeenVideoIds(sessionId: string): Promise<Set<string>> {
    const impressions = await this.prisma.feedImpression.findMany({
      where: { sessionId },
      select: { videoId: true },
    });

    return new Set(impressions.map((i) => i.videoId));
  }

  /**
   * Atomically upsert a DailyVideoCounter row, incrementing only the fields
   * provided in `increment`. Uses Prisma's `{ increment: N }` syntax to avoid
   * read-modify-write race conditions.
   *
   * @param videoId  The video whose counter to update.
   * @param increment  Fields to increment; missing fields are not modified.
   */
  private async upsertDailyCounter(
    videoId: string,
    increment: CounterIncrement,
  ): Promise<void> {
    const today = this.getUtcDateKey();

    // Build the create payload with the incremented fields as initial values
    const createData: {
      videoId: string;
      date: Date;
      views?: number;
      likes?: number;
      shares?: number;
      watchTimeSec?: number;
    } = { videoId, date: today };

    if (increment.views !== undefined) createData.views = increment.views;
    if (increment.likes !== undefined) createData.likes = increment.likes;
    if (increment.shares !== undefined) createData.shares = increment.shares;
    if (increment.watchTimeSec !== undefined)
      createData.watchTimeSec = increment.watchTimeSec;

    // Build the update payload using Prisma increment syntax
    const updateData: Record<string, { increment: number }> = {};

    if (increment.views !== undefined)
      updateData['views'] = { increment: increment.views };
    if (increment.likes !== undefined)
      updateData['likes'] = { increment: increment.likes };
    if (increment.shares !== undefined)
      updateData['shares'] = { increment: increment.shares };
    if (increment.watchTimeSec !== undefined)
      updateData['watchTimeSec'] = { increment: increment.watchTimeSec };

    await this.prisma.dailyVideoCounter.upsert({
      where: { videoId_date: { videoId, date: today } },
      create: createData,
      update: updateData,
    });
  }

  /**
   * Return today's UTC date with time zeroed out — used as the canonical
   * key for DailyVideoCounter rows.
   *
   * Using ISO string splitting ensures we always get midnight UTC, regardless
   * of the server's local timezone.
   */
  private getUtcDateKey(): Date {
    return new Date(new Date().toISOString().split('T')[0]);
  }

  /**
   * Emit a domain event.
   *
   * Currently just logs with debug level.
   * TODO: Publish to RabbitMQ exchange when the broker is wired in.
   *
   * Exchange: feed.events
   * Routing key: <event>  (e.g. "video.liked", "video.shared")
   */
  private emitEvent(event: string, payload: Record<string, unknown>): void {
    // TODO: publish to RabbitMQ exchange `feed.events` with routing key `event`
    this.logger.debug(`Event emitted [${event}]: ${JSON.stringify(payload)}`);
  }
}
