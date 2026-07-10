-- CreateTable
CREATE TABLE "elevenlabs_voice_previews" (
    "id" TEXT NOT NULL,
    "voiceId" TEXT NOT NULL,
    "localeTag" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "sampleText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "elevenlabs_voice_previews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "elevenlabs_voice_previews_voiceId_localeTag_key" ON "elevenlabs_voice_previews"("voiceId", "localeTag");
