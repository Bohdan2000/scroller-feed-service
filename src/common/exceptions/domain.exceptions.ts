import { HttpException, HttpStatus } from '@nestjs/common';

export class DomainException extends HttpException {
  constructor(
    message: string,
    statusCode: HttpStatus,
    public readonly code: string,
  ) {
    super({ message, code, statusCode }, statusCode);
  }
}

// ─── Feed exceptions ──────────────────────────────────────────────────────────

/**
 * FEED_001 — The requested FeedSession does not exist or has expired.
 */
export class FeedSessionNotFoundException extends DomainException {
  constructor() {
    super('Feed session not found', HttpStatus.NOT_FOUND, 'FEED_001');
  }
}

/**
 * FEED_002 — The user has already liked this video.
 */
export class VideoAlreadyLikedException extends DomainException {
  constructor() {
    super('Video already liked', HttpStatus.CONFLICT, 'FEED_002');
  }
}

/**
 * FEED_003 — The user has not liked this video, so it cannot be unliked.
 */
export class VideoNotLikedException extends DomainException {
  constructor() {
    super('Video not liked', HttpStatus.NOT_FOUND, 'FEED_003');
  }
}

/**
 * FEED_004 — The provided cursor value is malformed or cannot be decoded.
 */
export class InvalidCursorException extends DomainException {
  constructor() {
    super('Invalid or malformed cursor', HttpStatus.BAD_REQUEST, 'FEED_004');
  }
}
