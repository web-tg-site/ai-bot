export type VideoToolSettings = {
    aspectRatio?: string;
    resolution?: string;
    durationSeconds?: number;
    styleId?: string;
};

export const DEFAULT_VIDEO_TOOL_SETTINGS: VideoToolSettings = {
    aspectRatio: '16:9',
    resolution: '720p',
    durationSeconds: 5,
    styleId: 'none',
};
