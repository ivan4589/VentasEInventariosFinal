import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  getHome() {
    return {
      message: 'Backend Sistema Ventas funcionando correctamente',
      status: 'OK',
    };
  }
}