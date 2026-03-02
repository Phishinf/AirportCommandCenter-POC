import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { KafkaConsumerModule } from './kafka/kafka-consumer.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    KafkaConsumerModule,
  ],
})
export class AppModule {}
