import { BotSession, GptReplyMode } from '@/common/services/ai';

export function resetAiSessionPreservingGpt(session: BotSession) {
    const preserved = session.ai
        ? {
              activeConversationId: session.ai.activeConversationId,
              gptWebSearch: session.ai.gptWebSearch,
              gptReplyMode: session.ai.gptReplyMode,
          }
        : {};

    session.ai = {
        step: 'idle',
        ...preserved,
    };
}

export function getNextGptReplyMode(mode: GptReplyMode = 'text'): GptReplyMode {
    if (mode === 'text') {
        return 'audio';
    }
    if (mode === 'audio') {
        return 'both';
    }
    return 'text';
}

export function getGptSessionDefaults(session?: BotSession['ai']) {
    return {
        gptWebSearch: session?.gptWebSearch ?? true,
        gptReplyMode: session?.gptReplyMode ?? 'text',
    };
}
