import { Module } from '@nestjs/common';
import { UserModelService } from './user-model.service';

@Module({
    providers: [UserModelService],
    exports: [UserModelService],
})
export class UserModule {}
