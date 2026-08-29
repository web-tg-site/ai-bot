import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { UserLanguage } from '@/generated/prisma/enums';
import { getToolById } from '@/common/config/ai-tools.registry';
import { TokenBillingService } from '../billing/token-billing.service';
import { AiService } from '../ai.service';
import { AiJobService } from '../jobs/ai-job.service';
import {
    AiGenerationInput,
    AiGenerationResult,
    AiToolId,
} from '../types';
import {
    buildFailoverChain,
    calculateFailoverTokenCost,
    formatFailoverNotice,
    isFailoverEligibleError,
    isFailoverEligibleTool,
    parseTriedToolIds,
    reviveGenerationInput,
} from './model-failover.helpers';

export type FailoverAttemptResult =
    | {
          ok: true;
          toolId: AiToolId;
          notice: string;
          tokenCost: number;
          mode: 'sync';
          result: AiGenerationResult;
      }
    | {
          ok: true;
          toolId: AiToolId;
          notice: string;
          tokenCost: number;
          mode: 'async-job';
          jobId: string;
          tokenLeft: number;
      }
    | {
          ok: true;
          toolId: AiToolId;
          notice: string;
          tokenCost: number;
          mode: 'async-inline';
          result: AiGenerationResult;
      }
    | { ok: false; reason: 'disabled' | 'ineligible' | 'exhausted' };

@Injectable()
export class ModelFailoverService {
    constructor(
        private readonly aiService: AiService,
        private readonly aiJobService: AiJobService,
        private readonly tokenBillingService: TokenBillingService,
        private readonly configService: ConfigService,
        @InjectPinoLogger(ModelFailoverService.name)
        private readonly logger: PinoLogger,
    ) {}

    buildSettingsUrl(botUsername?: string | null): string | null {
        const username = botUsername?.replace(/^@/, '').trim();
        if (username) {
            return `https://t.me/${username}/app?startapp=settings`;
        }
        const miniAppUrl = this.configService.get<string>('MINI_APP_URL')?.trim();
        if (!miniAppUrl) return null;
        try {
            const url = new URL(miniAppUrl);
            url.searchParams.set('tgWebAppStartParam', 'settings');
            return url.toString();
        } catch {
            return miniAppUrl;
        }
    }

    canAttemptFailover(params: {
        toolId: AiToolId;
        autoModelFailover: boolean;
        errorMessage: string;
    }): boolean {
        if (!params.autoModelFailover) return false;
        if (!isFailoverEligibleTool(params.toolId)) return false;
        if (!isFailoverEligibleError(params.errorMessage)) return false;
        return true;
    }

    getNextCandidates(params: {
        failedToolId: AiToolId;
        input: AiGenerationInput;
        triedToolIds?: Iterable<string>;
    }): AiToolId[] {
        return buildFailoverChain(params);
    }

    buildNotice(params: {
        fromToolId: AiToolId;
        toToolId: AiToolId;
        language?: UserLanguage | null;
        botUsername?: string | null;
    }): string {
        return formatFailoverNotice({
            fromToolId: params.fromToolId,
            toToolId: params.toToolId,
            language: params.language,
            settingsUrl: this.buildSettingsUrl(params.botUsername),
        });
    }

    /**
     * Sync/create-time failover: try candidates until one succeeds.
     * Caller has NOT yet charged tokens when `alreadyCharged` is 0.
     */
    async trySyncOrInlineFailover(params: {
        telegramId: string;
        userId: string;
        failedToolId: AiToolId;
        input: AiGenerationInput;
        language?: UserLanguage | null;
        autoModelFailover: boolean;
        errorMessage: string;
        alreadyCharged?: number;
        preferAsyncJob?: boolean;
        notifyTelegram?: boolean;
        sessionId?: string;
        botUsername?: string | null;
        triedToolIds?: string[];
    }): Promise<FailoverAttemptResult> {
        if (
            !this.canAttemptFailover({
                toolId: params.failedToolId,
                autoModelFailover: params.autoModelFailover,
                errorMessage: params.errorMessage,
            })
        ) {
            this.logger.warn(
                {
                    failedToolId: params.failedToolId,
                    autoModelFailover: params.autoModelFailover,
                    eligibleTool: isFailoverEligibleTool(params.failedToolId),
                    eligibleError: isFailoverEligibleError(params.errorMessage),
                    errorMessage: params.errorMessage,
                },
                'Failover skipped',
            );
            return { ok: false, reason: 'disabled' };
        }

        const input = reviveGenerationInput(params.input);
        const tried = [
            ...(params.triedToolIds ?? []),
            params.failedToolId,
        ];
        const chain = this.getNextCandidates({
            failedToolId: params.failedToolId,
            input,
            triedToolIds: tried,
        });

        if (!chain.length) {
            this.logger.warn(
                {
                    failedToolId: params.failedToolId,
                    errorMessage: params.errorMessage,
                },
                'Failover chain empty',
            );
            return { ok: false, reason: 'exhausted' };
        }

        this.logger.info(
            {
                failedToolId: params.failedToolId,
                chain,
                errorMessage: params.errorMessage,
            },
            'Failover chain ready',
        );

        let charged = params.alreadyCharged ?? 0;
        const fromToolId = params.failedToolId;

        for (const nextToolId of chain) {
            const tool = getToolById(nextToolId);
            if (!tool) continue;

            const nextCost = calculateFailoverTokenCost(nextToolId, input);
            const settled = await this.settleCostDelta({
                telegramId: params.telegramId,
                alreadyCharged: charged,
                nextCost,
            });
            if (!settled.ok) {
                continue;
            }
            charged = settled.charged;

            const notice = this.buildNotice({
                fromToolId,
                toToolId: nextToolId,
                language: params.language,
                botUsername: params.botUsername,
            });

            try {
                if (tool.isAsync && params.preferAsyncJob) {
                    const created = await this.aiJobService.createJobWithoutCharge({
                        userId: params.userId,
                        telegramId: params.telegramId,
                        toolId: nextToolId,
                        input,
                        tokenCost: nextCost,
                        notifyTelegram: params.notifyTelegram,
                        sessionId: params.sessionId,
                        failoverNotice: notice,
                        failoverFromToolId: fromToolId,
                        failoverTriedToolIds: [...tried, nextToolId],
                    });
                    return {
                        ok: true,
                        toolId: nextToolId,
                        notice,
                        tokenCost: nextCost,
                        mode: 'async-job',
                        jobId: created.job.id,
                        tokenLeft: settled.balance,
                    };
                }

                if (tool.isAsync) {
                    const result = await this.aiService.generateViaAsyncJob(
                        nextToolId,
                        input,
                    );
                    return {
                        ok: true,
                        toolId: nextToolId,
                        notice,
                        tokenCost: nextCost,
                        mode: 'async-inline',
                        result,
                    };
                }

                const result = await this.aiService.generate(nextToolId, input);
                const actualCost = result.actualTokenCost ?? nextCost;
                if (actualCost !== charged) {
                    const resettle = await this.settleCostDelta({
                        telegramId: params.telegramId,
                        alreadyCharged: charged,
                        nextCost: actualCost,
                    });
                    if (!resettle.ok) {
                        continue;
                    }
                    charged = resettle.charged;
                }

                return {
                    ok: true,
                    toolId: nextToolId,
                    notice,
                    tokenCost: charged,
                    mode: 'sync',
                    result,
                };
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error);
                if (!isFailoverEligibleError(message)) {
                    if (charged > 0) {
                        await this.tokenBillingService.refund(
                            params.telegramId,
                            charged,
                        );
                        charged = 0;
                    }
                    return { ok: false, reason: 'exhausted' };
                }
                tried.push(nextToolId);
            }
        }

        if (charged > 0 && (params.alreadyCharged ?? 0) === 0) {
            // Charged during attempts but nothing succeeded — refund what we took
            // beyond the caller's original charge (caller handles original refund).
            const extra = charged - (params.alreadyCharged ?? 0);
            if (extra > 0) {
                await this.tokenBillingService.refund(params.telegramId, extra);
            }
        }

        return { ok: false, reason: 'exhausted' };
    }

    /**
     * Poll-time failover: reassign an existing pending/failed-poll job to the next tool.
     */
    async reassignPendingJob(params: {
        jobId: string;
        telegramId: string;
        currentToolId: AiToolId;
        input: unknown;
        tokenCost: number;
        language?: UserLanguage | null;
        autoModelFailover: boolean;
        errorMessage: string;
        failoverFromToolId?: string | null;
        failoverTriedToolIds?: unknown;
        botUsername?: string | null;
    }): Promise<
        | {
              ok: true;
              toolId: AiToolId;
              notice: string;
              tokenCost: number;
          }
        | { ok: false; reason: 'disabled' | 'ineligible' | 'exhausted' }
    > {
        if (
            !this.canAttemptFailover({
                toolId: params.currentToolId,
                autoModelFailover: params.autoModelFailover,
                errorMessage: params.errorMessage,
            })
        ) {
            return { ok: false, reason: 'disabled' };
        }

        const input = reviveGenerationInput(params.input);
        const tried = parseTriedToolIds(params.failoverTriedToolIds);
        if (!tried.includes(params.currentToolId)) {
            tried.push(params.currentToolId);
        }

        const fromToolId = (params.failoverFromToolId ??
            params.currentToolId) as AiToolId;

        const chain = this.getNextCandidates({
            failedToolId: params.currentToolId,
            input,
            triedToolIds: tried,
        });

        let charged = params.tokenCost;

        for (const nextToolId of chain) {
            const tool = getToolById(nextToolId);
            if (!tool) continue;

            const nextCost = calculateFailoverTokenCost(nextToolId, input);
            const settled = await this.settleCostDelta({
                telegramId: params.telegramId,
                alreadyCharged: charged,
                nextCost,
            });
            if (!settled.ok) continue;

            charged = settled.charged;
            const notice = this.buildNotice({
                fromToolId,
                toToolId: nextToolId,
                language: params.language,
                botUsername: params.botUsername,
            });

            try {
                const providerJob = await this.aiService.createJob(
                    nextToolId,
                    input,
                );

                await this.aiJobService.reassignJobForFailover({
                    jobId: params.jobId,
                    toolId: nextToolId,
                    providerJobId: providerJob.providerJobId,
                    tokenCost: nextCost,
                    failoverNotice: notice,
                    failoverFromToolId: fromToolId,
                    failoverTriedToolIds: [...tried, nextToolId],
                });

                return {
                    ok: true,
                    toolId: nextToolId,
                    notice,
                    tokenCost: nextCost,
                };
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error);
                tried.push(nextToolId);
                if (!isFailoverEligibleError(message)) {
                    break;
                }
            }
        }

        // Restore charged amount to original if we adjusted mid-loop without success.
        if (charged !== params.tokenCost) {
            await this.settleCostDelta({
                telegramId: params.telegramId,
                alreadyCharged: charged,
                nextCost: params.tokenCost,
            });
        }

        return { ok: false, reason: 'exhausted' };
    }

    private async settleCostDelta(params: {
        telegramId: string;
        alreadyCharged: number;
        nextCost: number;
    }): Promise<{ ok: true; charged: number; balance: number } | { ok: false }> {
        const delta = params.nextCost - params.alreadyCharged;
        if (delta === 0) {
            const check = await this.tokenBillingService.checkBalance(
                params.telegramId,
                0,
            );
            return { ok: true, charged: params.alreadyCharged, balance: check.balance };
        }

        if (delta > 0) {
            const check = await this.tokenBillingService.checkBalance(
                params.telegramId,
                delta,
            );
            if (!check.allowed) return { ok: false };
            const commit = await this.tokenBillingService.commit(
                params.telegramId,
                delta,
            );
            if (!commit.success) return { ok: false };
            return {
                ok: true,
                charged: params.nextCost,
                balance: commit.balance,
            };
        }

        const refund = await this.tokenBillingService.refund(
            params.telegramId,
            -delta,
        );
        return {
            ok: true,
            charged: params.nextCost,
            balance: refund.balance,
        };
    }
}
