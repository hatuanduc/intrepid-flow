import { Body, Controller, Post, Put, Get, Param, UseGuards, Req, UnauthorizedException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, MinLength } from 'class-validator';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt.guard';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto, AuthUserDto } from './dto/auth-response.dto';

class UpdateMyProfileDto {
  @ApiProperty({ example: 'Nguyễn Văn A' })
  @IsString() @MinLength(1)
  name!: string;
}

class ChangeMyPasswordDto {
  @ApiProperty()
  @IsString() @MinLength(1)
  currentPassword!: string;

  @ApiProperty()
  @IsString() @MinLength(6)
  newPassword!: string;
}

class SetPasswordDto {
  @ApiProperty()
  @IsString() @MinLength(1)
  token!: string;

  @ApiProperty()
  @IsString() @MinLength(6)
  password!: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MinLength(1)
  name?: string;
}

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

  @Put('me/profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật thông tin cá nhân' })
  async updateMyProfile(@Req() req: any, @Body() body: UpdateMyProfileDto) {
    return this.auth.updateMyProfile(req.authUser.id, body.name);
  }

  @Put('me/password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Đổi mật khẩu' })
  async changeMyPassword(@Req() req: any, @Body() body: ChangeMyPasswordDto) {
    return this.auth.changeMyPassword(req.authUser.id, body.currentPassword, body.newPassword);
  }

  @Get('invite/:token')
  @ApiOperation({ summary: 'Verify invite token (public)' })
  async verifyInvite(@Param('token') token: string) {
    return this.auth.verifyInviteToken(token);
  }

  @Post('set-password')
  @ApiOperation({ summary: 'Set password with invite token (public)' })
  async setPassword(@Body() body: SetPasswordDto) {
    return this.auth.setPasswordWithToken(body.token, body.password, body.name);
  }
}
