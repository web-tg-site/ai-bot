export type ImageToolSettings = {
    aspectRatio?: string;
    resolution?: string;
    topazScale?: number;
};

export const DEFAULT_IMAGE_TOOL_SETTINGS: ImageToolSettings = {
    aspectRatio: '1:1',
    resolution: '1K',
    topazScale: 2,
};

export const MAX_IMAGE_REFERENCES = 10;
