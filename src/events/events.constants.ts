export const SCROLLER_EXCHANGE = 'scroller.topic';
export const SCROLLER_DLX = 'scroller.dlx';

export const Queues = {
  FEED_VIDEO_PUBLISHED: 'feed.video.published',
  FEED_VIDEO_DELETED: 'feed.video.deleted',
  FEED_USER_TOPICS_UPDATED: 'feed.user.topics.updated',
} as const;

export const RoutingKeys = {
  VIDEO_PUBLISHED:     'video.published',
  VIDEO_DELETED:       'video.deleted',
  USER_TOPICS_UPDATED: 'user.topics.updated',
  VIDEO_LIKED:         'video.liked',
} as const;
