export type FluxImageMode =
    | 'generate'
    | 'deblur'
    | 'erase'
    | 'try_on'
    | 'outpaint';

export type FluxImageModeOption = {
    id: FluxImageMode;
    labelRu: string;
    labelEn: string;
    chipRu: string;
    chipEn: string;
};

export const FLUX_IMAGE_MODE_OPTIONS: FluxImageModeOption[] = [
    {
        id: 'generate',
        labelRu: 'Генерация',
        labelEn: 'Generate',
        chipRu: 'Генерация',
        chipEn: 'Generate',
    },
    {
        id: 'deblur',
        labelRu: 'Улучшить резкость',
        labelEn: 'Deblur',
        chipRu: 'Резкость',
        chipEn: 'Deblur',
    },
    {
        id: 'erase',
        labelRu: 'Удалить объект',
        labelEn: 'Erase object',
        chipRu: 'Удалить',
        chipEn: 'Erase',
    },
    {
        id: 'try_on',
        labelRu: 'Примерка одежды',
        labelEn: 'Virtual try-on',
        chipRu: 'Примерка',
        chipEn: 'Try-on',
    },
    {
        id: 'outpaint',
        labelRu: 'Расширить кадр',
        labelEn: 'Outpaint',
        chipRu: 'Outpaint',
        chipEn: 'Outpaint',
    },
];

export const DEFAULT_FLUX_IMAGE_MODE: FluxImageMode = 'generate';

export const FLUX_OUTPAINT_CANVAS = {
    width: 1024,
    height: 1024,
} as const;

export function isBflFluxTool(toolId: string): boolean {
    return toolId === 'flux';
}

export function getFluxImageModeLabel(
    mode: FluxImageMode,
    locale: 'ru-RU' | 'en-US',
): string {
    const option = FLUX_IMAGE_MODE_OPTIONS.find((item) => item.id === mode);
    if (!option) return mode;
    return locale === 'ru-RU' ? option.labelRu : option.labelEn;
}

export function getFluxImageModeChipLabel(
    mode: FluxImageMode,
    locale: 'ru-RU' | 'en-US',
): string {
    const option = FLUX_IMAGE_MODE_OPTIONS.find((item) => item.id === mode);
    if (!option) return mode;
    return locale === 'ru-RU' ? option.chipRu : option.chipEn;
}

export function fluxImageModeRequiresPrompt(mode: FluxImageMode): boolean {
    return mode === 'generate';
}

export function getFluxImageModeMaxPhotos(mode: FluxImageMode): number {
    if (mode === 'deblur' || mode === 'outpaint') return 1;
    if (mode === 'erase' || mode === 'try_on') return 2;
    return 8;
}

export function buildFluxImageAttachmentRoles(
    mode: FluxImageMode,
): Array<'source' | 'mask' | 'person' | 'garment'> | undefined {
    if (mode === 'erase') return ['source', 'mask'];
    if (mode === 'try_on') return ['person', 'garment'];
    return undefined;
}
