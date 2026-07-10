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
import { ElevenLabsVoicePreviewService } from '../elevenlabs-voice-preview/elevenlabs-voice-preview.service';

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
        ElevenLabsVoicePreviewService,
        AiJobService,
        AiJobCron,
    ],
    exports: [
        AiService,
        TokenBillingService,
        AiJobService,
        ImageCapabilitiesService,
        VideoCapabilitiesService,
        ElevenLabsVoicePreviewService,
    ],
})
export class AiModule {}
