import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ApiErrorFilter } from './common/api-error.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // AG Studio sends its instructions and tool schemas with every turn; Nest's 100 KB default is too small.
  app.useBodyParser('json', { limit: '1mb' });
  app.enableCors({
    origin: [process.env.WEB_ORIGIN, process.env.STORE_ORIGIN].filter((o): o is string => !!o),
  });
  app.useGlobalFilters(new ApiErrorFilter());
  await app.listen(Number(process.env.PORT ?? 3000));
}

void bootstrap();
