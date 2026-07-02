import { Injectable } from '@nestjs/common';
import { UserModelService } from '@/common/models/user';
import { calculateToolTokenCost } from '@/common/config/ai-tools.registry';
import { AiToolConfig } from '@/common/config/ai-tools.registry';

export type TokenReserveResult = {
    allowed: boolean;
    balance: number;
    cost: number;
};

@Injectable()
export class TokenBillingService {
    constructor(private readonly userModelService: UserModelService) {}

    calculateCost(tool: AiToolConfig, durationSeconds?: number): number {
        return calculateToolTokenCost(tool, durationSeconds);
    }

    async checkBalance(
        telegramId: string,
        cost: number,
    ): Promise<TokenReserveResult> {
        const user =
            await this.userModelService.getUserByTelegramId(telegramId);

        if (!user) {
            return { allowed: false, balance: 0, cost };
        }

        return {
            allowed: user.tokenLeft >= cost,
            balance: user.tokenLeft,
            cost,
        };
    }

    async commit(
        telegramId: string,
        cost: number,
    ): Promise<{ success: boolean; balance: number }> {
        return this.userModelService.deductTokens(telegramId, cost);
    }
}
