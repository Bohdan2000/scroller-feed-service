import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * A single item in the ranked feed.
 *
 * The feed service owns ONLY engagement signals, NOT video metadata.
 * The mobile client must call content-service using videoId to fetch
 * title, thumbnail, playbackId, duration, etc.
 */
export class FeedItemDto {
  @ApiProperty({
    description: 'Unique video identifier. Use this to fetch metadata from content-service.',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  videoId: string;

  @ApiProperty({
    description: 'Zero-indexed position of this item in the feed.',
    example: 0,
  })
  position: number;

  @ApiProperty({
    description: 'Normalised ranking score in [0, 1]. Higher = more relevant.',
    example: 0.87,
  })
  score: number;

  @ApiProperty({
    description: 'Whether the requesting user has already liked this video.',
    example: false,
  })
  isLiked: boolean;

  @ApiProperty({
    description: 'All-time total like count for this video.',
    example: 142,
  })
  likesCount: number;

  @ApiProperty({
    description: 'All-time total share count for this video.',
    example: 37,
  })
  sharesCount: number;
}

export class FeedResponseDto {
  @ApiProperty({ type: [FeedItemDto] })
  items: FeedItemDto[];

  @ApiPropertyOptional({
    description:
      'Base64-encoded cursor to pass as `cursor` on the next request. null means no more items.',
    example: 'eyJzIjoiYWJjZC0xMjM0IiwicCI6Mzl9',
    nullable: true,
  })
  nextCursor: string | null;

  @ApiProperty({
    description: 'The session ID associated with this feed page.',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  sessionId: string;
}
