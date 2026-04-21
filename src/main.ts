import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: process.env.NODE_ENV !== 'test' }),
  );

  const config = app.get(ConfigService);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  app.setGlobalPrefix('api/v1');

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Feed Service')
    .setDescription(
      'Personalised video feed, engagement signals (impressions, watches, likes, shares), ' +
        'and feed session management for the Scroller platform.\n\n' +
        '**Note:** Feed items contain only `videoId`. Fetch video metadata (title, thumbnail, ' +
        'playbackId) from content-service.',
    )
    .setVersion('1.0')
    .addTag('feed', 'Feed retrieval and engagement events')
    .addTag('health', 'Service health')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', in: 'header' },
      'access-token',
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/v1/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });

  // Required for onModuleDestroy (PrismaService.$disconnect) to fire on
  // SIGTERM / SIGINT — e.g. docker stop, Kubernetes pod eviction
  app.enableShutdownHooks();

  const port = config.get<number>('port', 3004);
  await app.listen(port, '0.0.0.0');
}

bootstrap();
