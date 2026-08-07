export enum AiToolId {
    GPT = 'gpt',
    CLAUDE_SONNET = 'claude_sonnet',
    GPT_IMAGES = 'gpt_images',
    FLUX = 'flux',
    NANO_BANANA = 'nano_banana',
    SEEDREAM = 'seedream',
    MIDJOURNEY = 'midjourney',
    KLING = 'kling',
    KLING_MOTION = 'kling_motion',
    VEO = 'veo',
    SORA = 'sora',
    SEEDANCE = 'seedance',
    LUMA_RAY = 'luma_ray',
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
}

export type AiInputType =
    | 'text'
    | 'photo'
    | 'document'
    | 'video'
    | 'voice'
    | 'audio';

export type AiToolCategory = 'text' | 'image' | 'video' | 'audio';
