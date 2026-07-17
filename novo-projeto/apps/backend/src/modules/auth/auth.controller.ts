import { Controller, Get } from '@nestjs/common';

@Controller('auth')
export class AuthController {
  @Get()
  getMessage(): string {
    return 'Auth module up and running.';
  }
}
