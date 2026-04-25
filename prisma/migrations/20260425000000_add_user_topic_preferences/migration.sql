-- CreateTable
CREATE TABLE "user_topic_preferences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "topic_id" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_topic_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_topic_preferences_user_id_topic_id_key" ON "user_topic_preferences"("user_id", "topic_id");

-- CreateIndex
CREATE INDEX "user_topic_preferences_user_id_idx" ON "user_topic_preferences"("user_id");
