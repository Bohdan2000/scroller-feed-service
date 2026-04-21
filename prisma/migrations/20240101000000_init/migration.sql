-- ─── Tables ───────────────────────────────────────────────────────────────────

CREATE TABLE "feed_sessions" (
    "id"         UUID        NOT NULL DEFAULT gen_random_uuid(),
    "user_id"    TEXT        NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "expires_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "feed_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "feed_sessions_user_id_idx"   ON "feed_sessions"("user_id");
CREATE INDEX "feed_sessions_expires_at_idx" ON "feed_sessions"("expires_at");

-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE "feed_impressions" (
    "id"         UUID        NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID        NOT NULL,
    "user_id"    TEXT        NOT NULL,
    "video_id"   TEXT        NOT NULL,
    "position"   INTEGER     NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "feed_impressions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "feed_impressions_session_id_video_id_key"
    ON "feed_impressions"("session_id", "video_id");
CREATE INDEX "feed_impressions_user_id_idx"  ON "feed_impressions"("user_id");
CREATE INDEX "feed_impressions_video_id_idx" ON "feed_impressions"("video_id");

ALTER TABLE "feed_impressions"
    ADD CONSTRAINT "feed_impressions_session_id_fkey"
    FOREIGN KEY ("session_id")
    REFERENCES "feed_sessions"("id")
    ON DELETE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE "watch_events" (
    "id"              UUID        NOT NULL DEFAULT gen_random_uuid(),
    "user_id"         TEXT        NOT NULL,
    "video_id"        TEXT        NOT NULL,
    "watched_sec"     INTEGER     NOT NULL,
    "duration_sec"    INTEGER     NOT NULL,
    "completion_rate" FLOAT       NOT NULL,
    "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "watch_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "watch_events_user_id_idx"  ON "watch_events"("user_id");
CREATE INDEX "watch_events_video_id_idx" ON "watch_events"("video_id");

-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE "video_likes" (
    "id"         UUID        NOT NULL DEFAULT gen_random_uuid(),
    "user_id"    TEXT        NOT NULL,
    "video_id"   TEXT        NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "video_likes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "video_likes_user_id_video_id_key" ON "video_likes"("user_id", "video_id");
CREATE INDEX "video_likes_video_id_idx"               ON "video_likes"("video_id");

-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE "video_shares" (
    "id"         UUID        NOT NULL DEFAULT gen_random_uuid(),
    "user_id"    TEXT        NOT NULL,
    "video_id"   TEXT        NOT NULL,
    "platform"   TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "video_shares_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "video_shares_user_id_idx"  ON "video_shares"("user_id");
CREATE INDEX "video_shares_video_id_idx" ON "video_shares"("video_id");

-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE "daily_video_counters" (
    "id"             UUID    NOT NULL DEFAULT gen_random_uuid(),
    "video_id"       TEXT    NOT NULL,
    "date"           DATE    NOT NULL,
    "views"          INTEGER NOT NULL DEFAULT 0,
    "likes"          INTEGER NOT NULL DEFAULT 0,
    "shares"         INTEGER NOT NULL DEFAULT 0,
    "watch_time_sec" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "daily_video_counters_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "daily_video_counters_video_id_date_key"
    ON "daily_video_counters"("video_id", "date");
CREATE INDEX "daily_video_counters_video_id_idx" ON "daily_video_counters"("video_id");
CREATE INDEX "daily_video_counters_date_idx"     ON "daily_video_counters"("date");

-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE "user_feed_state" (
    "id"              UUID        NOT NULL DEFAULT gen_random_uuid(),
    "user_id"         TEXT        NOT NULL,
    "last_session_id" UUID,
    "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "user_feed_state_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_feed_state_user_id_key" ON "user_feed_state"("user_id");

-- ─── Auto-update updated_at on user_feed_state ────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_feed_state_updated_at
    BEFORE UPDATE ON "user_feed_state"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
