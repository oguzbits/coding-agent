import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiAcceptedResponse, ApiExtraModels, ApiOkResponse, ApiProduces, getSchemaPath } from '@nestjs/swagger';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { Env } from '../config/env.validation.js';
import {
  ApprovalDto,
  ConversationDto,
  CreateConversationDto,
  RunStartedDto,
  SendMessageDto,
  UpdateConversationDto,
} from './conversations.dto.js';
import { ConversationsService } from './conversations.service.js';
import type { Conversation } from './conversation.entity.js';
import { RUN_EVENT_DTOS } from './run-event.dto.js';
import { RunEventsService } from './run-events.service.js';
import { RunsService } from './runs.service.js';

const view = (conversation: Conversation, activeRun?: ConversationDto['activeRun']): ConversationDto => ({
  id: conversation.id,
  projectId: conversation.projectId,
  title: conversation.title,
  mode: conversation.mode,
  createdAt: conversation.createdAt,
  updatedAt: conversation.updatedAt,
  ...(activeRun === undefined ? {} : { activeRun }),
});

@Controller('conversations')
@ApiExtraModels(...RUN_EVENT_DTOS)
export class ConversationsController {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly runs: RunsService,
    private readonly events: RunEventsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Post()
  @ApiOkResponse({ type: ConversationDto })
  async create(@CurrentUser() user: Express.User, @Body() dto: CreateConversationDto): Promise<ConversationDto> {
    return view(await this.conversations.create(user.id, dto.projectId, dto.title));
  }

  @Get()
  @ApiOkResponse({ type: [ConversationDto] })
  async list(
    @CurrentUser() user: Express.User,
    @Query('projectId', new ParseUUIDPipe({ optional: true })) projectId?: string,
  ): Promise<ConversationDto[]> {
    return (await this.conversations.list(user.id, projectId)).map((conversation) => view(conversation));
  }

  @Get(':id')
  @ApiOkResponse({ type: ConversationDto })
  async get(@CurrentUser() user: Express.User, @Param('id', ParseUUIDPipe) id: string): Promise<ConversationDto> {
    const conversation = await this.conversations.getOwned(user.id, id);
    return view(conversation, await this.conversations.activeRun(id));
  }

  @Patch(':id')
  @ApiOkResponse({ type: ConversationDto })
  async update(
    @CurrentUser() user: Express.User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateConversationDto,
  ): Promise<ConversationDto> {
    return view(await this.conversations.update(user.id, id, dto));
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: Express.User, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.conversations.getOwned(user.id, id);
    await this.runs.stop(user.id, id);
    await this.conversations.remove(user.id, id);
    this.runs.forgetConversation(id);
  }

  @Post(':id/messages')
  @HttpCode(202)
  @ApiAcceptedResponse({ type: RunStartedDto })
  send(
    @CurrentUser() user: Express.User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
  ): Promise<RunStartedDto> {
    return this.runs.start(user.id, id, dto.text);
  }

  @Post(':id/approvals')
  @HttpCode(204)
  async approve(
    @CurrentUser() user: Express.User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApprovalDto,
  ): Promise<void> {
    await this.runs.resolveApproval(user.id, id, dto.callId, dto.approved);
  }

  @Post(':id/abort')
  @HttpCode(204)
  async abort(@CurrentUser() user: Express.User, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.conversations.getOwned(user.id, id);
    await this.runs.stop(user.id, id);
  }

  /** Server-sent events. Send `Last-Event-ID` (the browser does it on reconnect) to receive only newer events. */
  @Get(':id/events')
  @ApiProduces('text/event-stream')
  @ApiOkResponse({
    description: 'A stream of events. The `data` of each event is JSON of one of these types, `event` names the type.',
    content: {
      'text/event-stream': { schema: { oneOf: RUN_EVENT_DTOS.map((dto) => ({ $ref: getSchemaPath(dto) })) } },
    },
  })
  async stream(
    @CurrentUser() user: Express.User,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('last-event-id') lastEventId: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    await this.conversations.getOwned(user.id, id);
    const parsed = Number.parseInt(lastEventId ?? '', 10);
    const afterSeq = Number.isInteger(parsed) && parsed > 0 ? parsed : 0;

    res.status(200).set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();

    const unsubscribe = await this.events.stream(id, afterSeq, ({ seq, event }) => {
      res.write(`id: ${seq}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    });
    const heartbeat = setInterval(
      () => res.write(': heartbeat\n\n'),
      this.config.get('SSE_HEARTBEAT_SECONDS', { infer: true }) * 1000,
    );
    res.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  }
}
