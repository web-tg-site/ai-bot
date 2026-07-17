import { AiToolId } from '@/common/services/ai/types';

export const CHAT_ASSISTANT_TOOLS = [
    AiToolId.GPT,
    AiToolId.CLAUDE_SONNET,
] as const;

export type ChatAssistantToolId = (typeof CHAT_ASSISTANT_TOOLS)[number];

export const isChatAssistantTool = (
    toolId: AiToolId | undefined,
): toolId is ChatAssistantToolId =>
    toolId !== undefined &&
    (CHAT_ASSISTANT_TOOLS as readonly AiToolId[]).includes(toolId);
