import {
    Controller,
    Get,
    HttpException,
    HttpStatus,
    NotFoundException,
    Param,
    Req,
    Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { PrismaService } from '@/common/services/prisma';
import { JobMediaResolverService } from '@/common/services/ai/job-media-resolver.service';
import { AiToolId } from '@/common/services/ai/types';
import { JobStatus } from '@/generated/prisma/enums';
import { toUserFacingError } from '@/common/services/bot/errors/bot-error.mapper';
import { getI18n } from '@/common/services/bot/i18n';

@Controller('api/public/jobs')
export class PublicJobMediaController {
    constructor(
        private readonly prismaService: PrismaService,
        private readonly jobMediaResolver: JobMediaResolverService,
    ) {}

    @Get(':jobId/media')
    async serveJobMedia(
        @Param('jobId') jobId: string,
        @Req() req: Request,
        @Res() res: Response,
    ) {
        const job = await this.prismaService.aiGenerationJob.findFirst({
            where: { id: jobId },
            select: {
                id: true,
                resultUrl: true,
                status: true,
                providerJobId: true,
                toolId: true,
            },
        });

        if (!job?.resultUrl || job.status !== JobStatus.COMPLETED) {
            throw new NotFoundException('File not found');
        }

        try {
            const media = await this.jobMediaResolver.resolveCompletedJobMedia({
                id: job.id,
                resultUrl: job.resultUrl,
                providerJobId: job.providerJobId,
                toolId: job.toolId as AiToolId,
            });

            const filename = this.jobMediaResolver.buildMediaFilename(
                job.id,
                media.mimeType,
            );
            this.sendBufferedMedia(req, res, media.buffer, {
                mimeType: media.mimeType,
                filename,
            });
        } catch (error) {
            if (res.headersSent) {
                return;
            }
            const message =
                error instanceof Error
                    ? error.message
                    : 'Media download failed';
            throw new HttpException(
                { error: toUserFacingError(message, getI18n()) },
                HttpStatus.BAD_GATEWAY,
            );
        }
    }

    private sendBufferedMedia(
        req: Request,
        res: Response,
        buffer: Buffer,
        options: {
            mimeType: string;
            filename: string;
        },
    ) {
        const size = buffer.length;
        res.setHeader('Content-Type', options.mimeType);
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader(
            'Content-Disposition',
            `inline; filename="${options.filename.replace(/"/g, '')}"`,
        );

        const rangeHeader =
            typeof req.headers.range === 'string'
                ? req.headers.range
                : undefined;
        if (rangeHeader) {
            const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
            if (match) {
                const start = match[1] ? Number(match[1]) : 0;
                const end = match[2] ? Number(match[2]) : size - 1;
                if (
                    Number.isFinite(start) &&
                    Number.isFinite(end) &&
                    start >= 0 &&
                    end >= start &&
                    start < size
                ) {
                    const safeEnd = Math.min(end, size - 1);
                    const chunk = buffer.subarray(start, safeEnd + 1);
                    res.status(206);
                    res.setHeader(
                        'Content-Range',
                        `bytes ${start}-${safeEnd}/${size}`,
                    );
                    res.setHeader('Content-Length', String(chunk.length));
                    res.end(chunk);
                    return;
                }
            }
        }

        res.setHeader('Content-Length', String(size));
        res.end(buffer);
    }
}
