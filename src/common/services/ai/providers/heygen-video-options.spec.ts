import {
    buildHeyGenSharedVideoOptions,
    HEYGEN_CAPTIONED_VIDEO_WAIT_MS,
    resolveHeyGenJobStatus,
} from './heygen-video-options';

describe('buildHeyGenSharedVideoOptions', () => {
    it('sends caption style default with srt when captions are on', () => {
        const options = buildHeyGenSharedVideoOptions(
            { heygenCaptions: true },
            { kind: 'avatar', hasAudioAsset: false },
        );

        expect(options.caption).toEqual({
            file_format: 'srt',
            style: 'default',
        });
    });

    it('omits engine on image jobs', () => {
        const options = buildHeyGenSharedVideoOptions(
            { heygenEngine: 'avatar_iv' },
            { kind: 'image', hasAudioAsset: false },
        );

        expect(options.engine).toBeUndefined();
    });

    it('omits expressiveness for Avatar V', () => {
        const options = buildHeyGenSharedVideoOptions(
            {
                heygenEngine: 'avatar_v',
                heygenExpressiveness: 'high',
            },
            { kind: 'avatar', hasAudioAsset: false },
        );

        expect(options.expressiveness).toBeUndefined();
    });

    it('keeps expressiveness for Avatar IV', () => {
        const options = buildHeyGenSharedVideoOptions(
            {
                heygenEngine: 'avatar_iv',
                heygenExpressiveness: 'high',
            },
            { kind: 'avatar', hasAudioAsset: false },
        );

        expect(options.expressiveness).toBe('high');
    });

    it('omits motion_prompt and expressiveness for Avatar III', () => {
        const options = buildHeyGenSharedVideoOptions(
            {
                heygenEngine: 'avatar_iii',
                heygenExpressiveness: 'high',
                heygenMotionPrompt: 'wave hello',
            },
            { kind: 'avatar', hasAudioAsset: false },
        );

        expect(options.motion_prompt).toBeUndefined();
        expect(options.expressiveness).toBeUndefined();
    });

    it('omits motion_prompt for Avatar IV video avatars', () => {
        const options = buildHeyGenSharedVideoOptions(
            {
                heygenEngine: 'avatar_iv',
                heygenMotionPrompt: 'wave hello',
            },
            { kind: 'avatar', hasAudioAsset: false },
        );

        expect(options.motion_prompt).toBeUndefined();
    });

    it('keeps motion_prompt on talking-photo jobs', () => {
        const options = buildHeyGenSharedVideoOptions(
            { heygenMotionPrompt: 'wave hello' },
            { kind: 'image', hasAudioAsset: false },
        );

        expect(options.motion_prompt).toBe('wave hello');
    });

    it('omits voice_settings when an audio asset is used', () => {
        const options = buildHeyGenSharedVideoOptions(
            { heygenVoiceSpeed: 1.25, heygenVoicePitch: 10 },
            { kind: 'avatar', hasAudioAsset: true },
        );

        expect(options.voice_settings).toBeUndefined();
    });
});

describe('resolveHeyGenJobStatus', () => {
    it('prefers captioned_video_url when both URLs are present', () => {
        const resolved = resolveHeyGenJobStatus({
            status: 'completed',
            video_url: 'https://example.com/clean.mp4',
            captioned_video_url: 'https://example.com/captioned.mp4',
        });

        expect(resolved).toEqual({
            status: 'completed',
            resultUrl: 'https://example.com/captioned.mp4',
        });
    });

    it('stays processing while waiting for caption burn-in', () => {
        const resolved = resolveHeyGenJobStatus(
            {
                status: 'completed',
                video_url: 'https://example.com/clean.mp4',
                subtitle_url: 'https://example.com/sub.srt',
            },
            { now: 1_000, firstCompletedAt: 1_000 },
        );

        expect(resolved).toEqual({
            status: 'processing',
            waitingForCaptioned: true,
        });
    });

    it('falls back to video_url after the captioned wait', () => {
        const resolved = resolveHeyGenJobStatus(
            {
                status: 'completed',
                video_url: 'https://example.com/clean.mp4',
                subtitle_url: 'https://example.com/sub.srt',
            },
            {
                now: HEYGEN_CAPTIONED_VIDEO_WAIT_MS + 5_000,
                firstCompletedAt: 0,
            },
        );

        expect(resolved).toEqual({
            status: 'completed',
            resultUrl: 'https://example.com/clean.mp4',
        });
    });
});
