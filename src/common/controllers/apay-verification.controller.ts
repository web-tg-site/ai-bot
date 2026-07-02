import { Controller, Get, Header, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Controller()
export class ApayVerificationController {
    constructor(private readonly configService: ConfigService) {}

    @Get()
    @Header('Content-Type', 'text/html; charset=utf-8')
    getVerificationPage(): string {
        const tag = this.configService.get<string>('APAY_VERIFICATION_TAG');

        if (!tag) {
            throw new NotFoundException();
        }

        return `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="apay-tag" content="${tag}">
    <title>Verification</title>
</head>
<body></body>
</html>`;
    }
}
