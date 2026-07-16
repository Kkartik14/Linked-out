import 'reflect-metadata';

import { Logger, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';

import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.service';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get(AppConfigService);

  if (config.trustProxyHops > 0) {
    app.getHttpAdapter().getInstance().set('trust proxy', config.trustProxyHops);
  }
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.use(cookieParser());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableCors({
    origin: config.webUrl,
    credentials: true,
  });
  app.enableShutdownHooks();

  await app.listen(config.port);
  new Logger('Bootstrap').log(`LinkedOut API listening on ${config.apiBaseUrl}/v1`);
}

void bootstrap();
