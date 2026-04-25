import { Injectable, Logger } from '@nestjs/common';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { PrismaService } from '../prisma/prisma.service';
import { SCROLLER_DLX, SCROLLER_EXCHANGE, Queues, RoutingKeys } from './events.constants';

interface UserTopicsUpdatedPayload {
  userId: string;
  topics: Array<{ topicId: string; weight: number }>;
}

@Injectable()
export class UserTopicsUpdatedConsumer {
  private readonly logger = new Logger(UserTopicsUpdatedConsumer.name);

  constructor(private readonly prisma: PrismaService) {}

  @RabbitSubscribe({
    exchange: SCROLLER_EXCHANGE,
    routingKey: RoutingKeys.USER_TOPICS_UPDATED,
    queue: Queues.FEED_USER_TOPICS_UPDATED,
    queueOptions: {
      durable: true,
      deadLetterExchange: SCROLLER_DLX,
    },
  })
  async handleUserTopicsUpdated(payload: UserTopicsUpdatedPayload): Promise<void> {
    this.logger.log(`Received user.topics.updated for userId=${payload.userId}`);

    try {
      await this.prisma.$transaction([
        this.prisma.userTopicPreference.deleteMany({
          where: { userId: payload.userId },
        }),
        ...(payload.topics.length > 0
          ? [
              this.prisma.userTopicPreference.createMany({
                data: payload.topics.map((t) => ({
                  userId: payload.userId,
                  topicId: t.topicId,
                  weight: t.weight,
                })),
              }),
            ]
          : []),
      ]);

      this.logger.debug(
        `Synced ${payload.topics.length} topic preference(s) for userId=${payload.userId}`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to sync topic preferences for userId=${payload.userId}: ${String(err)}`,
      );
      throw err; // nack → DLX
    }
  }
}
