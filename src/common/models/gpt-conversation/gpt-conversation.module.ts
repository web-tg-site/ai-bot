import { Module } from '@nestjs/common';
import { GptConversationModelService } from './gpt-conversation-model.service';

@Module({
    providers: [GptConversationModelService],
    exports: [GptConversationModelService],
})
export class GptConversationModule {}
