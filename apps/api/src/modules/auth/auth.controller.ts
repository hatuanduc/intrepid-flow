import { Body, Controller, Post, Get, Req } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('login')
  async login(@Body() body: { email?: string; password?: string }) {
    const { email, password } = body;
    if (!email || !password) return { status: 400, message: 'Missing email or password' };
    const result = await this.auth.login(email, password);
    if (!result) return { status: 401, message: 'Invalid credentials' };
    return result;
  }

  @Get('me')
  async me(@Req() req: any) {
    const auth = req.headers?.authorization as string | undefined;
    const token = auth?.startsWith('Bearer ') ? auth.slice('Bearer '.length) : null;
    if (!token) return { status: 401, message: 'Missing token' };
    try {
      const payload: any = (await import('jsonwebtoken')).verify(token, process.env.JWT_SECRET || 'dev-secret');
      const result = await this.auth.me(payload.sub);
      if (!result) return { status: 401, message: 'Invalid token' };
      return result;
    } catch {
      return { status: 401, message: 'Invalid token' };
    }
  }
}
