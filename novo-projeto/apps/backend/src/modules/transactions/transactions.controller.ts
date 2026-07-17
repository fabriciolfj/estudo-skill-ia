import { Controller, Get } from '@nestjs/common';

@Controller('transactions')
export class TransactionsController {
  @Get()
  getMessage(): string {
    return 'Transactions module up and running.';
  }
}
