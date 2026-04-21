import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class FeedQueryDto {
  @ApiPropertyOptional({
    description:
      'Base64-encoded cursor { "s": "sessionId", "p": lastPosition }. Omit for the first page.',
    example: 'eyJzIjoiYWJjZC0xMjM0IiwicCI6MTl9',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({
    description: 'Number of items to return (1–50). Defaults to 20.',
    minimum: 1,
    maximum: 50,
    default: 20,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  @Type(() => Number)
  limit?: number;

  /**
   * Filter feed by topic IDs (UUIDs).
   *
   * TODO: When RabbitMQ is wired, maintain a local `video_topic_index` table
   * populated from `content.video.published` events. For now, topic filtering
   * is a no-op — all candidates are returned regardless of topicIds.
   */
  @ApiPropertyOptional({
    description:
      'Filter by topic IDs. NOTE: currently a no-op (see TODO in FeedService). Pass as repeated query param: ?topicIds=uuid1&topicIds=uuid2',
    type: [String],
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  topicIds?: string[];
}
