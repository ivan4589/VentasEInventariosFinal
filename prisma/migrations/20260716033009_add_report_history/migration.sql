-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('INVENTORY_GENERAL', 'INVENTORY_DETAILED', 'SALES_REPORT', 'COLLECTION_REPORT');

-- CreateTable
CREATE TABLE "report_histories" (
    "id" TEXT NOT NULL,
    "type" "ReportType" NOT NULL,
    "title" TEXT NOT NULL,
    "parameters" TEXT,
    "fileUrl" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_histories_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "report_histories" ADD CONSTRAINT "report_histories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
