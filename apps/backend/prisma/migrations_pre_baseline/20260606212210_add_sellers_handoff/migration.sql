-- AlterTable
ALTER TABLE "ai_conversations" ADD COLUMN     "assigned_at" TIMESTAMP(3),
ADD COLUMN     "assigned_seller_id" TEXT;

-- CreateTable
CREATE TABLE "sellers" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "assigned_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sellers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seller_notifications" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "seller_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "contact_phone" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seller_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sellers_tenant_id_idx" ON "sellers"("tenant_id");

-- CreateIndex
CREATE INDEX "seller_notifications_tenant_id_idx" ON "seller_notifications"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "seller_notifications_conversation_id_key" ON "seller_notifications"("conversation_id");

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_assigned_seller_id_fkey" FOREIGN KEY ("assigned_seller_id") REFERENCES "sellers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_notifications" ADD CONSTRAINT "seller_notifications_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
