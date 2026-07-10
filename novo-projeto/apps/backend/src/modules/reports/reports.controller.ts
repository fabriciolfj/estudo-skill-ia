import { Controller, Get } from '@nestjs/common';

@Controller('reports')
export class ReportsController {
  @Get()
  getMessage(): string {
    return 'Reports module up and running.';
  }
}
