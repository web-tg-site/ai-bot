import {
    AI_TOOLS_REGISTRY,
    calculateToolTokenCost,
    getToolById,
    type AiToolConfig,
} from '@/common/config/ai-tools.registry';
import {
    BotErrorCode,
    classifyBotError,
} from '@/common/services/bot/errors/bot-error.mapper';
import { getI18n, getToolLabel } from '@/common/services/bot/i18n';
import { UserLanguage } from '@/generated/prisma/enums';
import {
    AiGenerationInput,
    AiInputType,
    AiToolId,
} from '../types';

/** Tools that must never participate in auto-failover (source or target). */
export const FAILOVER_EXCLUDED_TOOL_IDS = new Set<AiToolId>([
    AiToolId.TOPAZ,
    AiToolId.HEYGEN,
    AiToolId.KLING_MOTION,
]);

export function isFailoverEligibleTool(toolId: AiToolId): boolean {
    const tool = getToolById(toolId);
    if (!tool) return false;
    if (tool.category !== 'image' && tool.category !== 'video') return false;
    if (FAILOVER_EXCLUDED_TOOL_IDS.has(toolId)) return false;
    return true;
}

export function isFailoverEligibleError(rawMessage: string): boolean {
    const code = classifyBotError(rawMessage);
    if (
        code === BotErrorCode.CONTENT_POLICY ||
        code === BotErrorCode.INSUFFICIENT_TOKENS ||
        code === BotErrorCode.DELIVERY
    ) {
        return false;
    }

    // Missing/misconfigured single-provider key should still redirect to another model.
    // Only block failover for non-key config issues (e.g. unknown tool wiring).
    if (code === BotErrorCode.CONFIG) {
        return /API_KEY|not configured/i.test(rawMessage);
    }

    // User-fixable input validation — show the message, don't burn another model.
    if (
        /Video duration|длительность видео|короче \d|не должна превышать \d|must be at least|должна быть не меньше|Поза с фото|Pose from photo/i.test(
            rawMessage,
        )
    ) {
        return false;
    }

    return true;
}

export function reviveGenerationInput(raw: unknown): AiGenerationInput {
    const input = (raw ?? {}) as AiGenerationInput;
    if (!input.files?.length) {
        return { ...input };
    }

    return {
        ...input,
        files: input.files.map((file) => {
            const buf = file.buffer as unknown;
            let buffer: Buffer;
            if (Buffer.isBuffer(buf)) {
                buffer = buf;
            } else if (
                buf &&
                typeof buf === 'object' &&
                Array.isArray((buf as { data?: number[] }).data)
            ) {
                buffer = Buffer.from((buf as { data: number[] }).data);
            } else if (typeof buf === 'string') {
                buffer = Buffer.from(buf, 'base64');
            } else {
                buffer = Buffer.alloc(0);
            }
            return { ...file, buffer };
        }),
    };
}

export function getRequiredInputTypes(
    input: AiGenerationInput,
): AiInputType[] {
    const types = new Set<AiInputType>();
    if (input.prompt?.trim()) {
        types.add('text');
    }
    for (const file of input.files ?? []) {
        const mime = file.mimeType?.toLowerCase() ?? '';
        if (mime.startsWith('image/')) types.add('photo');
        else if (mime.startsWith('video/')) types.add('video');
        else if (mime.startsWith('audio/')) types.add('audio');
        else types.add('document');
    }
    return [...types];
}

function toolAcceptsInput(
    tool: AiToolConfig,
    required: AiInputType[],
): boolean {
    if (required.length === 0) {
        return tool.accepts.includes('text');
    }
    return required.every((type) => {
        if (type === 'document') {
            return (
                tool.accepts.includes('document') ||
                tool.accepts.includes('photo') ||
                tool.accepts.includes('video')
            );
        }
        return tool.accepts.includes(type);
    });
}

/** Comparable price for sorting “similar quality” candidates. */
export function getFailoverSortPrice(tool: AiToolConfig): number {
    if (tool.perSecondCost != null) {
        const duration = tool.defaultDurationSeconds ?? 5;
        return tool.baseTokenCost + tool.perSecondCost * duration;
    }
    return tool.baseTokenCost;
}

export function buildFailoverChain(params: {
    failedToolId: AiToolId;
    input: AiGenerationInput;
    triedToolIds?: Iterable<string>;
}): AiToolId[] {
    const failed = getToolById(params.failedToolId);
    if (!failed || !isFailoverEligibleTool(params.failedToolId)) {
        return [];
    }

    const tried = new Set<string>([
        params.failedToolId,
        ...(params.triedToolIds ?? []),
    ]);
    const required = getRequiredInputTypes(params.input);
    const failedPrice = getFailoverSortPrice(failed);

    return AI_TOOLS_REGISTRY.filter((tool) => {
        if (tried.has(tool.id)) return false;
        if (tool.category !== failed.category) return false;
        if (!isFailoverEligibleTool(tool.id)) return false;
        return toolAcceptsInput(tool, required);
    })
        .map((tool) => ({
            id: tool.id,
            price: getFailoverSortPrice(tool),
            dist: Math.abs(getFailoverSortPrice(tool) - failedPrice),
        }))
        .sort((a, b) => a.dist - b.dist || a.price - b.price)
        .map((item) => item.id);
}

export function formatFailoverNotice(params: {
    fromToolId: AiToolId;
    toToolId: AiToolId;
    language?: UserLanguage | null;
    settingsUrl?: string | null;
}): string {
    const i18n = getI18n(params.language);
    const from = getToolLabel(params.fromToolId, params.language);
    const to = getToolLabel(params.toToolId, params.language);
    return i18n.aiResult.failoverRedirect(from, to, params.settingsUrl ?? null);
}

export function calculateFailoverTokenCost(
    toolId: AiToolId,
    input: AiGenerationInput,
): number {
    const tool = getToolById(toolId);
    if (!tool) return 0;
    return calculateToolTokenCost(tool, {
        durationSeconds: input.durationSeconds,
        topazScale: input.topazScale,
        quality: input.quality,
        resolution: input.resolution,
        apiframeAction: input.apiframeAction,
    });
}

export function parseTriedToolIds(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter((id): id is string => typeof id === 'string');
}
