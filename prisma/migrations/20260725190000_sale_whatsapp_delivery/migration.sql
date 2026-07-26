-- AlterTable
ALTER TABLE "clients"
ADD COLUMN "whatsappConsent" BOOLEAN NOT NULL DEFAULT false;

-- CreateEnum
CREATE TYPE "WhatsAppSendStatus" AS ENUM ('SENT', 'FAILED');

-- CreateTable
CREATE TABLE "sale_whatsapp_logs" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "status" "WhatsAppSendStatus" NOT NULL,
    "metaMessageId" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_whatsapp_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sale_whatsapp_logs_saleId_idx" ON "sale_whatsapp_logs"("saleId");

-- CreateIndex
CREATE INDEX "sale_whatsapp_logs_userId_idx" ON "sale_whatsapp_logs"("userId");

-- CreateIndex
CREATE INDEX "sale_whatsapp_logs_status_idx" ON "sale_whatsapp_logs"("status");

-- CreateIndex
CREATE INDEX "sale_whatsapp_logs_createdAt_idx" ON "sale_whatsapp_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "sale_whatsapp_logs"
ADD CONSTRAINT "sale_whatsapp_logs_saleId_fkey"
FOREIGN KEY ("saleId") REFERENCES "sales"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_whatsapp_logs"
ADD CONSTRAINT "sale_whatsapp_logs_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
