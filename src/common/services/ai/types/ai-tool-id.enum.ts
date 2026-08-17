export enum AiToolId {
    GPT = 'gpt',
    CLAUDE_SONNET = 'claude_sonnet',
    GPT_IMAGES = 'gpt_images',
    FLUX = 'flux',
    FLUX_MAX = 'flux_max',
    FLUX_FLEX = 'flux_flex',
    FLUX_KLEIN_9B = 'flux_klein_9b',
    FLUX_KLEIN_4B = 'flux_klein_4b',
    FLUX_OUTPAINT = 'flux_outpaint',
    FLUX_ERASE = 'flux_erase',
    FLUX_DEBLUR = 'flux_deblur',
    FLUX_VTO = 'flux_vto',
    FLUX_VIDEO = 'flux_video',
    NANO_BANANA = 'nano_banana',
    SEEDREAM = 'seedream',
    MIDJOURNEY = 'midjourney',
    KLING = 'kling',
    KLING_MOTION = 'kling_motion',
    VEO = 'veo',
    SORA = 'sora',
    SEEDANCE = 'seedance',
    LUMA_RAY = 'luma_ray',
    LUMA_IMAGE = 'luma_image',
    LUMA_IMAGE_MAX = 'luma_image_max',
    LUMA_IMAGE_EDIT = 'luma_image_edit',
    LUMA_LAYERING = 'luma_layering',
    LUMA_VIDEO_EDIT = 'luma_video_edit',
    LUMA_VIDEO_REFRAME = 'luma_video_reframe',
    HIGGSFIELD = 'higgsfield',
    HEYGEN = 'heygen',
    TOPAZ = 'topaz',
    ELEVENLABS_VOICE = 'elevenlabs_voice',
    VOICE_CLONE = 'voice_clone',
    VIDEO_TO_AUDIO = 'video_to_audio',
    SOUND_GENERATOR = 'sound_generator',
    SUNO = 'suno',
}

export enum AiProviderId {
    OPENROUTER = 'openrouter',
    SHARPII = 'sharpii',
    ELEVENLABS = 'elevenlabs',
    HEYGEN = 'heygen',
    HIGGSFIELD = 'higgsfield',
    TOPAZ = 'topaz',
    BFL = 'bfl',
    LUMA = 'luma',
}

export type AiInputType =
    | 'text'
    | 'photo'
    | 'document'
    | 'video'
    | 'voice'
    | 'audio';

export type AiToolCategory = 'text' | 'image' | 'video' | 'audio';

export type AiAttachmentRole =
    | 'source'
    | 'mask'
    | 'person'
    | 'garment'
    | 'start_frame'
    | 'end_frame';

export type FluxVideoMode = 't2v' | 'i2v' | 'v2v' | 'draft_enhance';

export type LumaStyle = 'auto' | 'manga';

export type LumaOutputFormat = 'png' | 'jpeg';
