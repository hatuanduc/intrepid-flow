import { Body, Controller, Delete, Get, Post, Put, Query, UseGuards, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('management')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private users: UsersService) {}

  @Get('users')
  @ApiOperation({ summary: 'Danh sách người dùng' })
  @ApiResponse({ status: 200, type: UserResponseDto, isArray: true })
  async getUsers(@Query('search') search?: string) {
    const items = await this.users.listUsers(search);
    return { items };
  }

  @Post('users')
  @ApiOperation({ summary: 'Tạo người dùng mới' })
  @ApiResponse({ status: 201, type: UserResponseDto })
  async postUser(@Body() body: CreateUserDto) {
    return this.users.createUser(body);
  }

  @Put('users/:id')
  @ApiOperation({ summary: 'Cập nhật người dùng' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  async putUser(@Param('id') id: string, @Body() body: UpdateUserDto) {
    return this.users.updateUser(id, body);
  }

  @Delete('users/:id')
  @ApiOperation({ summary: 'Xóa người dùng' })
  @ApiResponse({ status: 200, schema: { example: { ok: true } } })
  async deleteUser(@Param('id') id: string) {
    await this.users.deleteUser(id);
    return { ok: true };
  }
}
