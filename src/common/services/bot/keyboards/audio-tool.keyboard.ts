import { Markup } from 'telegraf';
import { AiToolId } from '@/common/services/ai/types';
import { I18nBundle } from '../i18n';
import { VoiceToolSettings } from '@/common/types/voice-tool-settings.type';
import { resolveVoiceSendAsFile } from '@/common/utils/resolve-send-as-file';

export function isAudioDeliveryTool(toolId: AiToolId): boolean {
    return (
        toolId === AiToolId.VOICE_CLONE ||
        toolId === AiToolId.SOUND_GENERATOR ||
        toolId === AiToolId.VIDEO_TO_AUDIO
    );
}

export function generateAudioToolReplyKeyboard(
    i18n: I18nBundle,
    toolId: AiToolId,
    settings: VoiceToolSettings,
) {
    return Markup.keyboard([
        [
            i18n.voiceTool.sendAsFileButton(
                resolveVoiceSendAsFile(toolId, settings),
            ),
        ],
        [i18n.buttons.back],
    ]).resize();
}
