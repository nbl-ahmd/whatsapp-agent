-- CreateTable
CREATE TABLE "OrganizationSettings" (
    "organizationId" TEXT NOT NULL,
    "metaAppSecret" TEXT,
    "metaVerifyToken" TEXT,
    "metaAccessToken" TEXT,
    "metaGraphApiVersion" TEXT,
    "metaGraphApiBaseUrl" TEXT,
    "aiProvider" TEXT,
    "aiApiKey" TEXT,
    "aiBaseUrl" TEXT,
    "aiModel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationSettings_pkey" PRIMARY KEY ("organizationId")
);

-- AddForeignKey
ALTER TABLE "OrganizationSettings" ADD CONSTRAINT "OrganizationSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
