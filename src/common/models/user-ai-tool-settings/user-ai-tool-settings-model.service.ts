import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/common/services/prisma';
import { AiToolId } from '@/common/services/ai/types';
import {
    DEFAULT_IMAGE_TOOL_SETTINGS,
    ImageToolSettings,
} from '@/common/types/image-tool-settings.type';
import {
    DEFAULT_VIDEO_TOOL_SETTINGS,
    VideoToolSettings,
} from '@/common/types/video-tool-settings.type';
import {
    DEFAULT_VOICE_TOOL_SETTINGS,
    VoiceToolSettings,
} from '@/common/types/voice-tool-settings.type';
import { getDefaultElevenLabsVoiceId } from '@/common/config/elevenlabs-voices.config';

@Injectable()
export class UserAiToolSettingsModelService {
    constructor(private readonly prismaService: PrismaService) {}

    async getSettings(
        userId: string,
        toolId: AiToolId,
    ): Promise<ImageToolSettings> {
        const row = await this.prismaService.userAiToolSettings.findUnique({
            where: {
                userId_toolId: { userId, toolId },
            },
        });

        if (!row?.settings || typeof row.settings !== 'object') {
            return { ...DEFAULT_IMAGE_TOOL_SETTINGS };
        }

        return {
            ...DEFAULT_IMAGE_TOOL_SETTINGS,
            ...(row.settings as ImageToolSettings),
        };
    }

    async upsertSettings(
        userId: string,
        toolId: AiToolId,
        patch: Partial<ImageToolSettings>,
    ): Promise<ImageToolSettings> {
        const current = await this.getSettings(userId, toolId);
        const next = { ...current, ...patch };

        await this.prismaService.userAiToolSettings.upsert({
            where: {
                userId_toolId: { userId, toolId },
            },
            create: {
                userId,
                toolId,
                settings: next,
            },
            update: {
                settings: next,
            },
        });

        return next;
    }

    async getVideoSettings(
        userId: string,
        toolId: AiToolId,
    ): Promise<VideoToolSettings> {
        const row = await this.prismaService.userAiToolSettings.findUnique({
            where: {
                userId_toolId: { userId, toolId },
            },
        });

        if (!row?.settings || typeof row.settings !== 'object') {
            return { ...DEFAULT_VIDEO_TOOL_SETTINGS };
        }

        return {
            ...DEFAULT_VIDEO_TOOL_SETTINGS,
            ...(row.settings as VideoToolSettings),
        };
    }

    async upsertVideoSettings(
        userId: string,
        toolId: AiToolId,
        patch: Partial<VideoToolSettings>,
    ): Promise<VideoToolSettings> {
        const current = await this.getVideoSettings(userId, toolId);
        const next = { ...current, ...patch };

        await this.prismaService.userAiToolSettings.upsert({
            where: {
                userId_toolId: { userId, toolId },
            },
            create: {
                userId,
                toolId,
                settings: next,
            },
            update: {
                settings: next,
            },
        });

        return next;
    }

    async getVoiceSettings(
        userId: string,
        toolId: AiToolId,
    ): Promise<VoiceToolSettings> {
        const row = await this.prismaService.userAiToolSettings.findUnique({
            where: {
                userId_toolId: { userId, toolId },
            },
        });

        if (!row?.settings || typeof row.settings !== 'object') {
            return {
                ...DEFAULT_VOICE_TOOL_SETTINGS,
                elevenLabsVoiceId: getDefaultElevenLabsVoiceId(),
            };
        }

        const stored = row.settings as VoiceToolSettings;
        return {
            ...DEFAULT_VOICE_TOOL_SETTINGS,
            elevenLabsVoiceId:
                stored.elevenLabsVoiceId ?? getDefaultElevenLabsVoiceId(),
        };
    }

    async upsertVoiceSettings(
        userId: string,
        toolId: AiToolId,
        patch: Partial<VoiceToolSettings>,
    ): Promise<VoiceToolSettings> {
        const current = await this.getVoiceSettings(userId, toolId);
        const next = { ...current, ...patch };

        await this.prismaService.userAiToolSettings.upsert({
            where: {
                userId_toolId: { userId, toolId },
            },
            create: {
                userId,
                toolId,
                settings: next,
            },
            update: {
                settings: next,
            },
        });

        return next;
    }
}
