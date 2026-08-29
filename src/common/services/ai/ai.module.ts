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
    GoogleProvider,
    SharpiiProvider,
    ApiframeProvider,
    TopazProvider,
    BflProvider,
    LumaProvider,
    BytePlusProvider,
    KlingProvider,
} from './providers';
import { AiJobService } from './jobs/ai-job.service';
import { AiJobCron } from './jobs/ai-job.cron';
import { ModelFailoverService } from './failover/model-failover.service';
import { SoraCharactersService } from './sora-characters.service';
import { ElevenLabsVoicePreviewService } from '../elevenlabs-voice-preview/elevenlabs-voice-preview.service';
import { TempPublicMediaService } from './temp-public-media.service';
import { JobMediaResolverService } from './job-media-resolver.service';
import { PublicTmpController } from '@/common/controllers/public-tmp.controller';
import { PublicJobMediaController } from '@/common/controllers/public-job-media.controller';

@Module({
    imports: [HttpModule, ConfigModule, UserModule, UserAiToolSettingsModule],
    controllers: [PublicTmpController, PublicJobMediaController],
    providers: [
        AiService,
        TokenBillingService,
        ImageCapabilitiesService,
        VideoCapabilitiesService,
        OpenAiProvider,
        OpenRouterProvider,
        GoogleProvider,
        SharpiiProvider,
        ApiframeProvider,
        HeyGenProvider,
        HiggsfieldProvider,
        TopazProvider,
        ElevenLabsProvider,
        BflProvider,
        LumaProvider,
        BytePlusProvider,
        KlingProvider,
        ElevenLabsVoicePreviewService,
        AiJobService,
        ModelFailoverService,
        AiJobCron,
        SoraCharactersService,
        TempPublicMediaService,
        JobMediaResolverService,
    ],
    exports: [
        AiService,
        TokenBillingService,
        AiJobService,
        ModelFailoverService,
        SoraCharactersService,
        ImageCapabilitiesService,
        VideoCapabilitiesService,
        ElevenLabsProvider,
        ElevenLabsVoicePreviewService,
        HiggsfieldProvider,
        HeyGenProvider,
        OpenAiProvider,
        GoogleProvider,
        TempPublicMediaService,
        JobMediaResolverService,
        BytePlusProvider,
        KlingProvider,
    ],
})
export class AiModule {}
