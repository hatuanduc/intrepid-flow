import { Body, Controller, Post, Get, UseGuards, Req, UnauthorizedException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt.guard';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto, AuthUserDto } from './dto/auth-response.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('login')
  @ApiOperation({ summary: 'Đăng nhập' })
  @ApiResponse({ status: 201, type: LoginResponseDto })
  async login(@Body() body: LoginDto) {
    const result = await this.auth.login(body.email, body.password);
    if (!result) throw new UnauthorizedException('INVALID_CREDENTIALS');
    return result;
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Thông tin người dùng hiện tại' })
  @ApiResponse({ status: 200, type: AuthUserDto })
  async me(@Req() req: any) {
    const result = await this.auth.me(req.authUser.id);
    if (!result) throw new UnauthorizedException('USER_NOT_FOUND');
    return result;
  }
}
