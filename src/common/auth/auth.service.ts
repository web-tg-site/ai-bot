import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserModelService } from '@/common/models/user';
import { UserLanguage } from '@/generated/prisma/enums';
import {
    getInitDataAuthDate,
    parseInitDataUser,
    validateInitData,
} from './utils/validate-init-data';

const INIT_DATA_MAX_AGE_SEC = 60 * 60;

export type TelegramAuthUserResponse = {
    id: number;
    firstName: string;
    username?: string;
};

@Injectable()
export class AuthService {
    constructor(
        private readonly configService: ConfigService,
        private readonly userModelService: UserModelService,
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
        }

        await this.userModelService.updateUserLastActivityAt(telegramId);

        return {
            user: this.toAuthUserResponse(telegramUser),
        };
    }

    private mapLanguage(languageCode?: string): UserLanguage {
        return languageCode?.toLowerCase().startsWith('en')
            ? UserLanguage.EN
            : UserLanguage.RU;
    }

    private toAuthUserResponse(telegramUser: {
        id: number;
        first_name: string;
        username?: string;
    }): TelegramAuthUserResponse {
        return {
            id: telegramUser.id,
            firstName: telegramUser.first_name,
            username: telegramUser.username,
        };
    }
}
