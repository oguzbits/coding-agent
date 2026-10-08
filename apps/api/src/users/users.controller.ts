import { Body, Controller, Delete, Get, HttpCode, Put } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { SetGeminiKeyDto, SettingsDto } from './users.dto.js';
import { UsersService } from './users.service.js';

@Controller('users/me')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('settings')
  @ApiOkResponse({ type: SettingsDto })
  settings(@CurrentUser() user: Express.User): Promise<SettingsDto> {
    return this.users.getSettings(user.id);
  }

  @Put('gemini-key')
  @HttpCode(204)
  async setGeminiKey(@CurrentUser() user: Express.User, @Body() dto: SetGeminiKeyDto): Promise<void> {
    await this.users.setGeminiKey(user.id, dto.apiKey);
  }

  @Delete('gemini-key')
  @HttpCode(204)
  async clearGeminiKey(@CurrentUser() user: Express.User): Promise<void> {
    await this.users.clearGeminiKey(user.id);
  }
}
