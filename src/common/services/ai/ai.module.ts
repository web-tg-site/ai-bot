import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { UserModule } from '@/common/models/user';
import { UserAiToolSettingsModule } from '@/common/models/user-ai-tool-settings';
import { AiService } from './ai.service';
import { TokenBillingService } from './billing/token-billing.service';
import { ImageCapabilitiesService } from './image-capabilities.service';
import { VideoCapabilitiesService } from './video-capabilities.service';
import {
    ElevenLabsProvider,
    HiggsfieldProvider,
    HeyGenProvider,
    OpenAiProvider,
    OpenRouterProvider,
    SharpiiProvider,
    ApiframeProvider,
    TopazProvider,
    BflProvider,
    LumaProvider,
    BytePlusProvider,
} from './providers';
import { AiJobService } from './jobs/ai-job.service';
import { AiJobCron } from './jobs/ai-job.cron';
import { SoraCharactersService } from './sora-characters.service';
import { ElevenLabsVoicePreviewService } from '../elevenlabs-voice-preview/elevenlabs-voice-preview.service';
import { TempPublicMediaService } from './temp-public-media.service';
import { PublicTmpController } from '@/common/controllers/public-tmp.controller';

@Module({
    imports: [HttpModule, ConfigModule, UserModule, UserAiToolSettingsModule],
    controllers: [PublicTmpController],
    providers: [
        AiService,
        TokenBillingService,
        ImageCapabilitiesService,
        VideoCapabilitiesService,
        OpenAiProvider,
        OpenRouterProvider,
        SharpiiProvider,
        ApiframeProvider,
        HeyGenProvider,
        HiggsfieldProvider,
        TopazProvider,
        ElevenLabsProvider,
        BflProvider,
        LumaProvider,
        BytePlusProvider,
        ElevenLabsVoicePreviewService,
        AiJobService,
        AiJobCron,
        SoraCharactersService,
        TempPublicMediaService,
    ],
    exports: [
        AiService,
        TokenBillingService,
        AiJobService,
        SoraCharactersService,
        ImageCapabilitiesService,
        VideoCapabilitiesService,
        ElevenLabsProvider,
        ElevenLabsVoicePreviewService,
        HiggsfieldProvider,
        HeyGenProvider,
        OpenAiProvider,
        TempPublicMediaService,
        BytePlusProvider,
    ],
})
export class AiModule {}
