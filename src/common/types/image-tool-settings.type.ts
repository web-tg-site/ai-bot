export type ImageToolSettings = {
    aspectRatio?: string;
    resolution?: string;
    quality?: string;
    topazScale?: number;
    sendAsFile?: boolean;
    fluxImageMode?: 'generate' | 'deblur' | 'erase' | 'try_on' | 'outpaint';
};

export const DEFAULT_IMAGE_TOOL_SETTINGS: ImageToolSettings = {
    aspectRatio: '1:1',
    resolution: '1K',
    quality: 'auto',
    topazScale: 2,
};

export const MAX_IMAGE_REFERENCES = 10;
