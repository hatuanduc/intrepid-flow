import { Body, Controller, Delete, Get, Post, Put, Query, UseGuards, Param, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { HasPermission } from '../../common/decorators/has-permission.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('management')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class UsersController {
  constructor(private users: UsersService) {}

  @Get('users')
  @HasPermission('users:view')
  @ApiOperation({ summary: 'Danh sách người dùng' })
  @ApiResponse({ status: 200, type: UserResponseDto, isArray: true })
  async getUsers(@Query('search') search?: string) {
    const items = await this.users.listUsers(search);
    return { items };
  }

  @Post('users')
  @HasPermission('users:create')
  @ApiOperation({ summary: 'Tạo người dùng mới' })
  @ApiResponse({ status: 201, type: UserResponseDto })
  async postUser(@Body() body: CreateUserDto) {
    return this.users.createUser(body);
  }

  @Put('users/:id')
  @HasPermission('users:edit')
  @ApiOperation({ summary: 'Cập nhật người dùng' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  async putUser(@Param('id') id: string, @Body() body: UpdateUserDto) {
    return this.users.updateUser(id, body);
  }

  @Delete('users/:id')
  @HasPermission('users:delete')
  @ApiOperation({ summary: 'Xóa người dùng' })
  @ApiResponse({ status: 200, schema: { example: { ok: true } } })
  async deleteUser(@Param('id') id: string) {
    await this.users.deleteUser(id);
    return { ok: true };
  }

  @Post('users/:id/resend-invite')
  @HasPermission('users:create')
  @ApiOperation({ summary: 'Gửi lại email invite' })
  async resendInvite(@Param('id') id: string) {
    return this.users.resendInvite(id);
  }

  @Post('users/:id/impersonate')
  @HasPermission('users:impersonate')
  @ApiOperation({ summary: 'Đăng nhập với tư cách người dùng' })
  async impersonate(@Param('id') id: string, @Req() req: any) {
    return this.users.impersonateUser(req.authUser.id, id);
  }
}
