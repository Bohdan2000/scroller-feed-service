import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import configuration from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { FeedModule } from './feed/feed.module';
import { EventsModule } from './events/events.module';
import { JwtAccessStrategy } from './common/strategies/jwt-access.strategy';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      expandVariables: true,
    }),
    PassportModule.register({ defaultStrategy: 'jwt-access' }),
    PrismaModule,
    EventsModule,
    HealthModule,
    FeedModule,
  ],
  providers: [JwtAccessStrategy],
})
export class AppModule {}
