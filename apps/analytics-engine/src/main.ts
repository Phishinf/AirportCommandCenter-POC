import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');

  const port = process.env.PORT ?? 4002;
  await app.listen(port, '0.0.0.0');
  console.log(`[Analytics Engine] Running on http://0.0.0.0:${port}`);
}

bootstrap();
