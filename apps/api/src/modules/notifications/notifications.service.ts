import { Injectable, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { Observable, Subject } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';

type NotificationEvent = { userId: number; notification: unknown };

const NOTIFICATIONS_CHANNEL = 'notifications';

@Injectable()
export class NotificationsService implements OnModuleDestroy {
  private readonly subscriber = new Redis({
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
  });
  private readonly subject = new Subject<NotificationEvent>();

  constructor(private readonly prisma: PrismaService) {
    this.subscriber.subscribe(NOTIFICATIONS_CHANNEL);
    this.subscriber.on('message', (_channel, raw) => {
      try {
        this.subject.next(JSON.parse(raw) as NotificationEvent);
      } catch {
        // ignore malformed payloads
      }
    });
  }

  onModuleDestroy() {
    this.subscriber.disconnect();
  }

  stream(): Observable<NotificationEvent> {
    return this.subject.asObservable();
  }

  list(userId: number) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
  }

  unreadCount(userId: number) {
    return this.prisma.notification.count({ where: { userId, isRead: false } });
  }

  async markRead(userId: number, id: number) {
    const found = await this.prisma.notification.findFirst({ where: { id, userId } });
    if (!found) throw new NotFoundException('NOTIFICATION_NOT_FOUND');
    return this.prisma.notification.update({ where: { id }, data: { isRead: true } });
  }

  async markAllRead(userId: number) {
    await this.prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } });
    return { ok: true };
  }
}
