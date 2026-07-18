import * as path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConsoleLogger, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { createServer } from 'http';
import { PrismaClient } from '@prisma/client';
import * as net from 'net';

const HEALTH_PORT = parseInt(process.env.HEALTH_PORT ?? '9000');
const prisma = new PrismaClient();

async function checkDb(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

function checkRedis(): Promise<boolean> {
  return new Promise(resolve => {
    const host = process.env.REDIS_HOST ?? 'localhost';
    const port = parseInt(process.env.REDIS_PORT ?? '6379');
    const socket = net.connect({ host, port });
    const timer = setTimeout(() => { socket.destroy(); resolve(false); }, 3000);
    socket.on('connect', () => { clearTimeout(timer); socket.destroy(); resolve(true); });
    socket.on('error', () => { clearTimeout(timer); resolve(false); });
  });
}

async function bootstrap() {
  const logger = new Logger('Worker');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: new ConsoleLogger({ logLevels: ['error', 'warn', 'log'], colors: false }),
  });

  const server = createServer(async (req, res) => {
    if (req.url !== '/health') { res.writeHead(404); res.end(); return; }
    const [db, redis] = await Promise.all([checkDb(), checkRedis()]);
    const code = db && redis ? 200 : 503;
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ db, redis }));
  });
  server.listen(HEALTH_PORT, () => logger.log(`Health server on :${HEALTH_PORT}`));

  logger.log('Worker started — waiting for jobs...');

  process.on('SIGTERM', async () => {
    logger.log('SIGTERM received, shutting down...');
    server.close();
    await prisma.$disconnect();
    await app.close();
    process.exit(0);
  });
}

bootstrap();
