-- CreateTable
CREATE TABLE "video_topic_index" (
    "id" TEXT NOT NULL,
    "video_id" TEXT NOT NULL,
    "topic_id" TEXT NOT NULL,
    "author_user_id" TEXT NOT NULL,
    "published_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "video_topic_index_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "video_topic_index_video_id_topic_id_key" ON "video_topic_index"("video_id", "topic_id");

-- CreateIndex
CREATE INDEX "video_topic_index_topic_id_idx" ON "video_topic_index"("topic_id");

-- CreateIndex
CREATE INDEX "video_topic_index_video_id_idx" ON "video_topic_index"("video_id");
