import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { UserModule } from '@/common/models/user';
import { AiService } from './ai.service';
import { TokenBillingService } from './billing/token-billing.service';
import {
    BytePlusProvider,
    ElevenLabsProvider,
    HiggsfieldProvider,
    HeyGenProvider,
    OpenRouterProvider,
    SharpiiProvider,
    TopazProvider,
} from './providers';
import { AiJobService } from './jobs/ai-job.service';
import { AiJobCron } from './jobs/ai-job.cron';

@Module({
    imports: [HttpModule, ConfigModule, UserModule],
    providers: [
        AiService,
        TokenBillingService,
        OpenRouterProvider,
        SharpiiProvider,
        BytePlusProvider,
        HeyGenProvider,
        HiggsfieldProvider,
        TopazProvider,
        ElevenLabsProvider,
        AiJobService,
        AiJobCron,
    ],
    exports: [AiService, TokenBillingService, AiJobService],
})
export class AiModule {}
