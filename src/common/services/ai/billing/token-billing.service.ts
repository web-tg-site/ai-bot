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

    calculateCost(
        tool: AiToolConfig,
        options?:
            | {
                  durationSeconds?: number;
                  topazScale?: number;
                  quality?: string;
                  resolution?: string;
              }
            | number,
    ): number {
        return calculateToolTokenCost(tool, options);
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

    async refund(
        telegramId: string,
        amount: number,
    ): Promise<{ success: boolean; balance: number }> {
        return this.userModelService.creditTokens(telegramId, amount);
    }
}
