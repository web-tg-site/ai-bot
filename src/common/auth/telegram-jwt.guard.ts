import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { UserModelService } from '@/common/models/user';
import { JwtTokenService } from './jwt-token.service';

export type AuthenticatedRequest = Request & {
    user: {
        id: string;
        telegramId: string;
    };
};

@Injectable()
export class TelegramJwtGuard implements CanActivate {
    constructor(
        private readonly jwtTokenService: JwtTokenService,
        private readonly userModelService: UserModelService,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context
            .switchToHttp()
            .getRequest<AuthenticatedRequest>();
        const header = request.headers.authorization;

        if (!header?.startsWith('Bearer ')) {
            throw new UnauthorizedException({ error: 'Missing token' });
        }

        const token = header.slice('Bearer '.length).trim();
        if (!token) {
            throw new UnauthorizedException({ error: 'Missing token' });
        }

        try {
            const payload = this.jwtTokenService.verify(token);
            const user = await this.userModelService.getUserByTelegramId(
                payload.telegramId,
            );

            if (!user || user.id !== payload.sub) {
                throw new UnauthorizedException({ error: 'User not found' });
            }

            request.user = {
                id: user.id,
                telegramId: user.telegramId,
            };
            return true;
        } catch {
            throw new UnauthorizedException({ error: 'Invalid token' });
        }
    }
}
