import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiConflictResponse,
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAccessGuard } from '../common/guards/jwt-access.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { FeedService } from './feed.service';
import { FeedQueryDto } from './dto/feed-query.dto';
import { FeedResponseDto } from './dto/feed-response.dto';
import { ImpressionEventDto } from './dto/impression-event.dto';
import { WatchEventDto } from './dto/watch-event.dto';
import { LikeEventDto } from './dto/like-event.dto';
import { ShareEventDto } from './dto/share-event.dto';

@ApiTags('feed')
@ApiBearerAuth('access-token')
@UseGuards(JwtAccessGuard)
@Controller()
export class FeedController {
  constructor(private readonly feedService: FeedService) {}

  // ─── GET /feed ─────────────────────────────────────────────────────────────

  @Get('feed')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get personalised feed',
    description:
      'Returns a ranked page of video IDs. Pass the returned `nextCursor` on subsequent requests. ' +
      'Enrich each `videoId` by calling content-service — feed-service does NOT return video metadata.',
  })
  @ApiOkResponse({ type: FeedResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'FEED_004 — Invalid cursor' })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'FEED_001 — Session not found or expired' })
  async getFeed(
    @CurrentUser('sub') userId: string,
    @Query() query: FeedQueryDto,
  ): Promise<FeedResponseDto> {
    return this.feedService.getFeed(userId, query);
  }

  // ─── POST /feed/events/impression ─────────────────────────────────────────

  @Post('feed/events/impression')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Record impressions',
    description:
      'Idempotent — safe to retry. Records which videos the user saw and increments view counters.',
  })
  @ApiNoContentResponse({ description: 'Impressions recorded.' })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'FEED_001 — Session not found' })
  async recordImpression(
    @CurrentUser('sub') userId: string,
    @Body() dto: ImpressionEventDto,
  ): Promise<void> {
    await this.feedService.recordImpression(userId, dto);
  }

  // ─── POST /feed/events/watch ───────────────────────────────────────────────

  @Post('feed/events/watch')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Record watch event',
    description: 'Records how long the user watched a video. completionRate is clamped to [0, 1].',
  })
  @ApiNoContentResponse({ description: 'Watch event recorded.' })
  async recordWatch(
    @CurrentUser('sub') userId: string,
    @Body() dto: WatchEventDto,
  ): Promise<void> {
    await this.feedService.recordWatch(userId, dto);
  }

  // ─── POST /feed/events/like ────────────────────────────────────────────────

  @Post('feed/events/like')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Like a video',
    description: 'Creates a like record. Returns 409 if the video is already liked.',
  })
  @ApiNoContentResponse({ description: 'Video liked.' })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'FEED_002 — Video already liked' })
  async likeVideo(
    @CurrentUser('sub') userId: string,
    @Body() dto: LikeEventDto,
  ): Promise<void> {
    await this.feedService.likeVideo(userId, dto);
  }

  // ─── DELETE /feed/events/like/:videoId ────────────────────────────────────

  @Delete('feed/events/like/:videoId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Unlike a video',
    description: 'Removes the like record. Returns 404 if the video was not liked.',
  })
  @ApiNoContentResponse({ description: 'Video unliked.' })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'FEED_003 — Video not liked' })
  async unlikeVideo(
    @CurrentUser('sub') userId: string,
    @Param('videoId', ParseUUIDPipe) videoId: string,
  ): Promise<void> {
    await this.feedService.unlikeVideo(userId, videoId);
  }

  // ─── POST /feed/events/share ───────────────────────────────────────────────

  @Post('feed/events/share')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Record a share event',
    description:
      'Records that the user shared a video. Not unique — the same user can share the same video multiple times.',
  })
  @ApiNoContentResponse({ description: 'Share recorded.' })
  async shareVideo(
    @CurrentUser('sub') userId: string,
    @Body() dto: ShareEventDto,
  ): Promise<void> {
    await this.feedService.shareVideo(userId, dto);
  }
}
