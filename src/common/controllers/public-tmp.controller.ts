import { Controller, Get, Param, Res, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { TempPublicMediaService } from '@/common/services/ai/temp-public-media.service';

/**
 * Unauthenticated short-lived media for providers that require a public HTTP URL
 * (e.g. BytePlus Seedance reference_video).
 */
@Controller('api/public/tmp')
export class PublicTmpController {
    constructor(private readonly tempPublicMedia: TempPublicMediaService) {}

    @Get(':id')
    serve(@Param('id') id: string, @Res() res: Response) {
        const entry = this.tempPublicMedia.get(id);
        if (!entry) {
            throw new NotFoundException('File expired or not found');
        }

        res.setHeader('Content-Type', entry.mimeType);
        res.setHeader(
            'Content-Disposition',
            `inline; filename="${entry.fileName.replace(/"/g, '')}"`,
        );
        res.setHeader('Cache-Control', 'private, max-age=3600');
        res.setHeader('Content-Length', String(entry.buffer.length));
        res.send(entry.buffer);
    }
}
