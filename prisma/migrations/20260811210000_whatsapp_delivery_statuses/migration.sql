-- AlterEnum
ALTER TYPE "WhatsAppSendStatus" ADD VALUE IF NOT EXISTS 'DELIVERED';
ALTER TYPE "WhatsAppSendStatus" ADD VALUE IF NOT EXISTS 'READ';

-- CreateIndex
CREATE INDEX "sale_whatsapp_logs_metaMessageId_idx"
ON "sale_whatsapp_logs"("metaMessageId");
