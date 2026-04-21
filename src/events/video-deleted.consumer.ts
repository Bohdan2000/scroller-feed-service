import { Injectable, Logger } from '@nestjs/common';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { PrismaService } from '../prisma/prisma.service';
import { SCROLLER_DLX, SCROLLER_EXCHANGE, Queues, RoutingKeys } from './events.constants';

interface VideoDeletedPayload {
  videoId: string;
  authorUserId: string;
}

@Injectable()
export class VideoDeletedConsumer {
  private readonly logger = new Logger(VideoDeletedConsumer.name);

  constructor(private readonly prisma: PrismaService) {}

  @RabbitSubscribe({
    exchange: SCROLLER_EXCHANGE,
    routingKey: RoutingKeys.VIDEO_DELETED,
    queue: Queues.FEED_VIDEO_DELETED,
    queueOptions: {
      durable: true,
      deadLetterExchange: SCROLLER_DLX,
    },
  })
  async handleVideoDeleted(payload: VideoDeletedPayload): Promise<void> {
    this.logger.log(`Received video.deleted for videoId=${payload.videoId}`);

    try {
      // Purge in parallel — all idempotent (deleteMany returns 0 rows if already gone)
      await Promise.all([
        // Remove from local topic index so the video stops appearing in topic feeds
        this.prisma.videoTopicIndex.deleteMany({
          where: { videoId: payload.videoId },
        }),
        // Remove daily counters so the video no longer appears in ranked candidates
        this.prisma.dailyVideoCounter.deleteMany({
          where: { videoId: payload.videoId },
        }),
        // Remove feed impressions (session dedup rows — avoids orphan data)
        this.prisma.feedImpression.deleteMany({
          where: { videoId: payload.videoId },
        }),
      ]);

      this.logger.debug(`Purged feed data for deleted videoId=${payload.videoId}`);
    } catch (err) {
      this.logger.error(
        `Failed to purge feed data for videoId=${payload.videoId}: ${String(err)}`,
      );
      throw err; // nack → DLX
    }
  }
}
