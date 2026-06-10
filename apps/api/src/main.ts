import 'reflect-metadata';
import dotenv from 'dotenv';
dotenv.config();
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Request, Response, NextFunction } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();

  // simple request logger to confirm incoming requests while debugging
  app.use((req: Request, _res: Response, next: NextFunction) => {
    // eslint-disable-next-line no-console
    console.log(`api request: ${req.method} ${req.url}`);
    next();
  });
  await app.listen(process.env.PORT ? Number(process.env.PORT) : 4000);
}
bootstrap();