import { Injectable } from '@nestjs/common';

export interface DailyCounterInput {
  views: number;
  likes: number;
  shares: number;
  watchTimeSec: number;
}

export interface CandidateVideo {
  videoId: string;
  /**
   * Topic IDs associated with the video.
   *
   * TODO: When RabbitMQ is wired, populate this from a local `video_topic_index`
   * table maintained by consuming `content.video.published` events. For now this
   * field is always an empty array and topic filtering is a no-op.
   */
  topicIds: string[];
  publishedAt?: Date;
  counters: DailyCounterInput;
}

export interface RankedVideo extends CandidateVideo {
  /** Normalised score in [0, 1]. Higher = more relevant. */
  score: number;
}

@Injectable()
export class RankingService {
  /**
   * Score a candidate video for ranking.
   *
   * Formula (placeholder — replace with ML model later):
   *   rawScore = (likes * 3 + shares * 5 + views * 1 + watchTimeSec * 0.01)
   *              * recencyDecay(publishedAt)
   *
   * recencyDecay = 1 / (1 + hoursSincePublished / 24)
   *
   * Score is normalised to [0, 1] relative to the batch after ranking.
   */
  score(counter: DailyCounterInput, publishedAt?: Date): number {
    const rawEngagement =
      counter.likes * 3 +
      counter.shares * 5 +
      counter.views * 1 +
      counter.watchTimeSec * 0.01;

    const decay = this.recencyDecay(publishedAt);
    return rawEngagement * decay;
  }

  /**
   * Rank a list of candidates, returning them sorted by score descending.
   * Scores are normalised to [0, 1] within the batch.
   * If all raw scores are 0 the returned scores are all 0.
   */
  rank(candidates: CandidateVideo[]): RankedVideo[] {
    if (candidates.length === 0) {
      return [];
    }

    // Compute raw scores
    const withRaw: Array<CandidateVideo & { rawScore: number }> = candidates.map(
      (c) => ({ ...c, rawScore: this.score(c.counters, c.publishedAt) }),
    );

    const maxScore = Math.max(...withRaw.map((c) => c.rawScore));

    return withRaw
      .map((c) => ({
        videoId: c.videoId,
        topicIds: c.topicIds,
        publishedAt: c.publishedAt,
        counters: c.counters,
        // Normalise — if maxScore is 0 all videos get score 0 (new/cold-start)
        score: maxScore > 0 ? c.rawScore / maxScore : 0,
      }))
      .sort((a, b) => b.score - a.score);
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  /**
   * Recency decay function.
   * Returns 1.0 for brand-new content, approaching 0 for very old content.
   *   decay = 1 / (1 + hoursSincePublished / 24)
   *
   * If publishedAt is unknown we assume the content is "fresh" (decay = 1).
   */
  private recencyDecay(publishedAt?: Date): number {
    if (!publishedAt) {
      return 1;
    }

    const hoursSince = (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60);
    return 1 / (1 + hoursSince / 24);
  }
}
