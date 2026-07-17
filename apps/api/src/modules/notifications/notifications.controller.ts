import { Controller, Get, Patch, Param, Query, UseGuards, Req, Sse, MessageEvent } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { NotificationsService } from './notifications.service';
import { NotificationResponseDto } from './dto/notification-response.dto';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách thông báo của tôi (phân trang)' })
  @ApiQuery({ name: 'skip', required: false })
  @ApiQuery({ name: 'take', required: false })
  @ApiResponse({ status: 200, type: NotificationResponseDto, isArray: true })
  list(@Req() req: any, @Query('skip') skip?: string, @Query('take') take?: string) {
    return this.service.list(req.authUser.id, skip ? Number(skip) : 0, take ? Number(take) : 15);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Số thông báo chưa đọc của tôi' })
  async unreadCount(@Req() req: any) {
    const count = await this.service.unreadCount(req.authUser.id);
    return { count };
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Đánh dấu một thông báo đã đọc' })
  markRead(@Param('id') id: string, @Req() req: any) {
    return this.service.markRead(req.authUser.id, Number(id));
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Đánh dấu tất cả thông báo đã đọc' })
  markAllRead(@Req() req: any) {
    return this.service.markAllRead(req.authUser.id);
  }

  @Sse('stream')
  @ApiOperation({ summary: 'SSE stream thông báo real-time (hỗ trợ ?token=xxx)' })
  @ApiQuery({ name: 'token', required: false, description: 'JWT token (dùng khi EventSource không thể gửi header)' })
  stream(@Req() req: any): Observable<MessageEvent> {
    const userId = req.authUser.id;
    return this.service.stream().pipe(
      filter(event => event.userId === userId),
      map(event => ({ data: event.notification }) as MessageEvent),
    );
  }
}
