-- CreateEnum
CREATE TYPE "ClientType" AS ENUM ('NORMAL', 'ESPECIAL', 'CAMINO');

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "alias" TEXT,
    "type" "ClientType" NOT NULL DEFAULT 'NORMAL',
    "locationId" TEXT NOT NULL,
    "phone" TEXT,
    "additionalInfo" TEXT,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
