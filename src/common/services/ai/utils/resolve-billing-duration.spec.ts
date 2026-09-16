import { AiToolId } from '../types';
import {
    calculateToolTokenCost,
    getToolById,
} from '@/common/config/ai-tools.registry';
import { resolveBillingDurationSeconds } from './resolve-billing-duration';

describe('resolveBillingDurationSeconds', () => {
    it('Higgsfield DoP with photo bills 5 even when 15 requested', () => {
        expect(
            resolveBillingDurationSeconds(AiToolId.HIGGSFIELD, {
                durationSeconds: 15,
                files: [{ mimeType: 'image/jpeg' }],
            }),
        ).toBe(5);
    });

    it('Higgsfield DoP with effect bills 5', () => {
        expect(
            resolveBillingDurationSeconds(AiToolId.HIGGSFIELD, {
                durationSeconds: 15,
                higgsfieldMotionId: 'name:Zoom In',
            }),
        ).toBe(5);
    });

    it('Higgsfield T2V snaps 15 → 10', () => {
        expect(
            resolveBillingDurationSeconds(AiToolId.HIGGSFIELD, {
                durationSeconds: 15,
            }),
        ).toBe(10);
    });

    it('Higgsfield T2V keeps 5', () => {
        expect(
            resolveBillingDurationSeconds(AiToolId.HIGGSFIELD, {
                durationSeconds: 5,
            }),
        ).toBe(5);
    });

    it('Kling Omni (video ref) snaps 15 → 10', () => {
        expect(
            resolveBillingDurationSeconds(AiToolId.KLING, {
                durationSeconds: 15,
                files: [{ mimeType: 'video/mp4' }],
            }),
        ).toBe(10);
    });

    it('Kling text keeps 15', () => {
        expect(
            resolveBillingDurationSeconds(AiToolId.KLING, {
                durationSeconds: 15,
            }),
        ).toBe(15);
    });

    it('Veo forces 8 for 1080p', () => {
        expect(
            resolveBillingDurationSeconds(AiToolId.VEO, {
                durationSeconds: 4,
                resolution: '1080p',
            }),
        ).toBe(8);
    });

    it('Veo forces 8 for two images', () => {
        expect(
            resolveBillingDurationSeconds(AiToolId.VEO, {
                durationSeconds: 6,
                files: [{ mimeType: 'image/jpeg' }, { mimeType: 'image/png' }],
            }),
        ).toBe(8);
    });

    it('Luma snaps >5 to 10', () => {
        expect(
            resolveBillingDurationSeconds(AiToolId.LUMA_RAY, {
                durationSeconds: 7,
            }),
        ).toBe(10);
    });

    it('Seedance clamps to 4–30', () => {
        expect(
            resolveBillingDurationSeconds(AiToolId.SEEDANCE, {
                durationSeconds: 2,
            }),
        ).toBe(4);
        expect(
            resolveBillingDurationSeconds(AiToolId.SEEDANCE, {
                durationSeconds: 40,
            }),
        ).toBe(30);
    });
});

describe('billing cost matches resolved duration', () => {
    it('DoP 15s request costs as 5s', () => {
        const tool = getToolById(AiToolId.HIGGSFIELD)!;
        const duration = resolveBillingDurationSeconds(AiToolId.HIGGSFIELD, {
            durationSeconds: 15,
            files: [{ mimeType: 'image/jpeg' }],
        });
        expect(
            calculateToolTokenCost(tool, { durationSeconds: duration }),
        ).toBe(calculateToolTokenCost(tool, { durationSeconds: 5 }));
    });

    it('Kling Omni 15s request costs as 10s', () => {
        const tool = getToolById(AiToolId.KLING)!;
        const duration = resolveBillingDurationSeconds(AiToolId.KLING, {
            durationSeconds: 15,
            files: [{ mimeType: 'video/mp4' }],
        });
        expect(
            calculateToolTokenCost(tool, { durationSeconds: duration }),
        ).toBe(calculateToolTokenCost(tool, { durationSeconds: 10 }));
    });

    it('Kling text 15s costs as 15s', () => {
        const tool = getToolById(AiToolId.KLING)!;
        const duration = resolveBillingDurationSeconds(AiToolId.KLING, {
            durationSeconds: 15,
        });
        expect(
            calculateToolTokenCost(tool, { durationSeconds: duration }),
        ).toBe(calculateToolTokenCost(tool, { durationSeconds: 15 }));
    });
});
