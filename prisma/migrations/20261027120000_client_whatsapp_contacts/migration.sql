CREATE TABLE "client_contacts" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "relationship" TEXT,
  "phone" TEXT NOT NULL,
  "phoneNormalized" TEXT NOT NULL,
  "whatsappConsent" BOOLEAN NOT NULL DEFAULT false,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "client_contacts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "client_contacts_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "client_contacts_clientId_phoneNormalized_key" ON "client_contacts"("clientId", "phoneNormalized");
CREATE INDEX "client_contacts_clientId_isActive_idx" ON "client_contacts"("clientId", "isActive");
