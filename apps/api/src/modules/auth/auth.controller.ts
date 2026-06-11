import { Body, Controller, Post, Get, UseGuards, Req, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt.guard';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('login')
  async login(@Body() body: { email?: string; password?: string }) {
    const { email, password } = body;
    if (!email || !password) throw new BadRequestException('Missing email or password');
    const result = await this.auth.login(email, password);
    if (!result) throw new UnauthorizedException('Invalid credentials');
    return result;
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@Req() req: any) {
    const result = await this.auth.me(req.authUser.id);
    if (!result) throw new UnauthorizedException('User not found');
    return result;
  }
}
