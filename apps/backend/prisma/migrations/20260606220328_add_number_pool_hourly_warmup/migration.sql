-- AlterTable
ALTER TABLE "sender_numbers" ADD COLUMN     "hour_stamp" TEXT,
ADD COLUMN     "hourly_limit" INTEGER NOT NULL DEFAULT 8,
ADD COLUMN     "sent_this_hour" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "warmup_stage" INTEGER NOT NULL DEFAULT 0;
