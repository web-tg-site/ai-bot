import { getToolsByCategory } from '@/common/config/ai-tools.registry';

export const AI_TEXT_TOOLS = getToolsByCategory('text').map((t) => t.label);
export const AI_IMAGE_TOOLS = getToolsByCategory('image').map((t) => t.label);
export const AI_VIDEO_TOOLS = getToolsByCategory('video').map((t) => t.label);
export const AI_AUDIO_TOOLS = getToolsByCategory('audio').map((t) => t.label);
