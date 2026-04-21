import { Module } from '@nestjs/common';
import { FeedController } from './feed.controller';
import { FeedService } from './feed.service';
import { RankingService } from './ranking.service';

@Module({
  controllers: [FeedController],
  providers: [FeedService, RankingService],
})
export class FeedModule {}
