import { Body, Controller, Delete, Get, Post, Put, Query, UseGuards, Param } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt.guard';

@Controller('management')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private users: UsersService) {}

  @Get('users')
  async getUsers(@Query('search') search?: string) {
    const items = await this.users.listUsers(search as string | undefined);
    return { items };
  }

  @Post('users')
  async postUser(@Body() body: any) {
    const { email, name, password, roleIds } = body;
    return this.users.createUser({ email, name, password, roleIds: roleIds ?? [] });
  }

  @Put('users/:id')
  async putUser(@Param('id') id: string, @Body() body: any) {
    return this.users.updateUser(id, body);
  }

  @Delete('users/:id')
  async deleteUser(@Param('id') id: string) {
    await this.users.deleteUser(id);
    return { ok: true };
  }
}
