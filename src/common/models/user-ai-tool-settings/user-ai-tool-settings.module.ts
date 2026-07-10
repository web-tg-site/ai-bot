import { Module } from '@nestjs/common';
import { PrismaModule } from '@/common/services/prisma';
import { UserAiToolSettingsModelService } from './user-ai-tool-settings-model.service';

@Module({
    imports: [PrismaModule],
    providers: [UserAiToolSettingsModelService],
    exports: [UserAiToolSettingsModelService],
})
export class UserAiToolSettingsModule {}
