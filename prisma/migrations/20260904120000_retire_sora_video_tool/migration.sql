-- Sora video generation was removed from the bot. `toolId` is a plain string, so
-- old rows survive the code removal; only unfinished work needs closing out.

-- Unfinished Sora jobs can never be polled again (the provider branch is gone).
UPDATE "ai_generation_jobs"
SET "status" = 'FAILED',
    "errorMessage" = 'Генерация видео Sora больше не поддерживается. Попробуйте Kling, Veo или Seedance.',
    "updatedAt" = NOW()
WHERE "toolId" = 'sora'
  AND "status" IN ('PENDING', 'PROCESSING');

-- Saved per-tool settings for a tool that no longer exists.
DELETE FROM "user_ai_tool_settings" WHERE "toolId" = 'sora';
