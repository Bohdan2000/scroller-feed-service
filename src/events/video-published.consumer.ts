import { Injectable, Logger } from '@nestjs/common';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { PrismaService } from '../prisma/prisma.service';
import { SCROLLER_DLX, SCROLLER_EXCHANGE, Queues, RoutingKeys } from './events.constants';

interface VideoPublishedPayload {
  videoId: string;
  authorUserId: string;
  title: string;
  topicIds: string[];
  visibility: string;
  publishedAt: string;
}

@Injectable()
export class VideoPublishedConsumer {
  private readonly logger = new Logger(VideoPublishedConsumer.name);

  constructor(private readonly prisma: PrismaService) {}

  @RabbitSubscribe({
    exchange: SCROLLER_EXCHANGE,
    routingKey: RoutingKeys.VIDEO_PUBLISHED,
    queue: Queues.FEED_VIDEO_PUBLISHED,
    queueOptions: {
      durable: true,
      deadLetterExchange: SCROLLER_DLX,
    },
  })
  async handleVideoPublished(payload: VideoPublishedPayload): Promise<void> {
    this.logger.log(`Received video.published for videoId=${payload.videoId}`);

    try {
      const publishedAt = new Date(payload.publishedAt);

      if (payload.topicIds.length === 0) {
        // No topics — nothing to index; the video will still appear via
        // DailyVideoCounter but will be excluded from topic-filtered feeds.
        this.logger.debug(
          `videoId=${payload.videoId} has no topics — skipping topic index`,
        );
        return;
      }

      // Upsert one row per topic (idempotent — safe on re-delivery)
      await this.prisma.$transaction(
        payload.topicIds.map((topicId) =>
          this.prisma.videoTopicIndex.upsert({
            where: { videoId_topicId: { videoId: payload.videoId, topicId } },
            create: {
              videoId: payload.videoId,
              topicId,
              authorUserId: payload.authorUserId,
              publishedAt,
            },
            update: { publishedAt, authorUserId: payload.authorUserId },
          }),
        ),
      );

      this.logger.debug(
        `Indexed ${payload.topicIds.length} topic(s) for videoId=${payload.videoId}`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to index topics for videoId=${payload.videoId}: ${String(err)}`,
      );
      throw err; // nack → DLX
    }
  }
}
