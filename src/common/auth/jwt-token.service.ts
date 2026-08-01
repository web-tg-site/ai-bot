import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';

export type MiniAppJwtPayload = {
    sub: string;
    telegramId: string;
};

const JWT_TTL = '7d';

@Injectable()
export class JwtTokenService {
    private readonly secret: string;

    constructor(private readonly configService: ConfigService) {
        const secret =
            this.configService.get<string>('JWT_SECRET') ||
            this.configService.get<string>('TELEGRAM_BOT_TOKEN');
        if (!secret) {
            throw new Error('JWT_SECRET or TELEGRAM_BOT_TOKEN is not set');
        }
        this.secret = secret;
    }

    sign(payload: MiniAppJwtPayload): string {
        return jwt.sign(payload, this.secret, { expiresIn: JWT_TTL });
    }

    verify(token: string): MiniAppJwtPayload {
        const decoded = jwt.verify(token, this.secret);
        if (
            typeof decoded !== 'object' ||
            decoded === null ||
            typeof decoded.sub !== 'string' ||
            typeof (decoded as MiniAppJwtPayload).telegramId !== 'string'
        ) {
            throw new Error('Invalid token payload');
        }

        return {
            sub: decoded.sub,
            telegramId: (decoded as MiniAppJwtPayload).telegramId,
        };
    }
}
