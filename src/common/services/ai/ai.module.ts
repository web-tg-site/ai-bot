import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { UserModule } from '@/common/models/user';
import { AiService } from './ai.service';
import { TokenBillingService } from './billing/token-billing.service';
import { ImageCapabilitiesService } from './image-capabilities.service';
import { VideoCapabilitiesService } from './video-capabilities.service';
import {
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
        ImageCapabilitiesService,
        VideoCapabilitiesService,
        OpenRouterProvider,
        SharpiiProvider,
        HeyGenProvider,
        HiggsfieldProvider,
        TopazProvider,
        ElevenLabsProvider,
        AiJobService,
        AiJobCron,
    ],
    exports: [
        AiService,
        TokenBillingService,
        AiJobService,
        ImageCapabilitiesService,
        VideoCapabilitiesService,
    ],
})
export class AiModule {}
