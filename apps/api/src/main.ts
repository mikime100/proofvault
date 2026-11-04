import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ApiErrorFilter } from './common/api-error.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: [process.env.WEB_ORIGIN, process.env.STORE_ORIGIN].filter((o): o is string => !!o),
  });
  app.useGlobalFilters(new ApiErrorFilter());
  await app.listen(Number(process.env.PORT ?? 3000));
}

void bootstrap();
