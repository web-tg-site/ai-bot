import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserModelService } from '@/common/models/user';
import { UserLanguage } from '@/generated/prisma/enums';
import {
    getInitDataAuthDate,
    parseInitDataUser,
    validateInitData,
} from './utils/validate-init-data';
import { JwtTokenService } from './jwt-token.service';

const INIT_DATA_MAX_AGE_SEC = 60 * 60;

export type TelegramAuthUserResponse = {
    id: string;
    telegramId: number;
    firstName: string;
    username?: string;
    hasCompletedOnboarding: boolean;
};

@Injectable()
export class AuthService {
    constructor(
        private readonly configService: ConfigService,
        private readonly userModelService: UserModelService,
        private readonly jwtTokenService: JwtTokenService,
    ) {}

    async authenticateByInitData(initData: string) {
        const botToken = this.configService.get<string>('TELEGRAM_BOT_TOKEN');

        if (!botToken) {
            throw new HttpException(
                { error: 'Server misconfigured' },
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }

        if (!validateInitData(initData, botToken)) {
            throw new HttpException(
                { error: 'Invalid initData' },
                HttpStatus.UNAUTHORIZED,
            );
        }

        const authDate = getInitDataAuthDate(initData);

        if (
            authDate === null ||
            Date.now() / 1000 - authDate > INIT_DATA_MAX_AGE_SEC
        ) {
            throw new HttpException(
                { error: 'initData expired' },
                HttpStatus.UNAUTHORIZED,
            );
        }

        const telegramUser = parseInitDataUser(initData);

        if (!telegramUser) {
            throw new HttpException(
                { error: 'User not found' },
                HttpStatus.UNAUTHORIZED,
            );
        }

        const telegramId = telegramUser.id.toString();
        let user = await this.userModelService.getUserByTelegramId(telegramId);

        if (!user) {
            await this.userModelService.createUser(
                telegramId,
                telegramUser.username,
                this.mapLanguage(telegramUser.language_code),
            );
            user = await this.userModelService.getUserByTelegramId(telegramId);
        } else if (
            telegramUser.username &&
            user.telegramUsername !== telegramUser.username
        ) {
            await this.userModelService.updateUserByTelegramId(telegramId, {
                telegramUsername: telegramUser.username,
            });
            user = await this.userModelService.getUserByTelegramId(telegramId);
        }

        if (!user) {
            throw new HttpException(
                { error: 'User not found' },
                HttpStatus.UNAUTHORIZED,
            );
        }

        await this.userModelService.updateUserLastActivityAt(telegramId);

        const token = this.jwtTokenService.sign({
            sub: user.id,
            telegramId: user.telegramId,
        });

        return {
            token,
            user: {
                id: user.id,
                telegramId: telegramUser.id,
                firstName: telegramUser.first_name,
                username: telegramUser.username,
                hasCompletedOnboarding: user.hasCompletedOnboarding,
            } satisfies TelegramAuthUserResponse,
        };
    }

    private mapLanguage(languageCode?: string): UserLanguage {
        return languageCode?.toLowerCase().startsWith('en')
            ? UserLanguage.EN
            : UserLanguage.RU;
    }
}
