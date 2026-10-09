import type { FailureCode, RunEvent } from '../agent/types.js';

/** The events of the SSE channel as classes, so they appear in the OpenAPI description the web app generates types from. */

class RunStartedEventDto {
  type!: 'run_started';
}

class UserMessageEventDto {
  type!: 'user_message';
  text!: string;
}

class AssistantMessageEventDto {
  type!: 'assistant_message';
  text!: string;
}

class ToolCallEventDto {
  type!: 'tool_call';
  callId!: string;
  name!: string;
  args!: Record<string, unknown>;
}

class ApprovalRequestedEventDto {
  type!: 'approval_requested';
  callId!: string;
  name!: string;
  args!: Record<string, unknown>;
  /** A diff for file changes, the command line for commands. */
  preview!: string;
}

class ApprovalResolvedEventDto {
  type!: 'approval_resolved';
  callId!: string;
  approved!: boolean;
}

class ToolResultEventDto {
  type!: 'tool_result';
  callId!: string;
  name!: string;
  isError!: boolean;
  output!: string;
}

class TokenUsageDto {
  promptTokens!: number;
  outputTokens!: number;
}

class RunFinishedEventDto {
  type!: 'run_finished';
  steps!: number;
  usage!: TokenUsageDto;
}

class RunAbortedEventDto {
  type!: 'run_aborted';
}

class RunFailedEventDto {
  type!: 'run_failed';
  code!: FailureCode;
  message!: string;
}

export const RUN_EVENT_DTOS = [
  RunStartedEventDto,
  UserMessageEventDto,
  AssistantMessageEventDto,
  ToolCallEventDto,
  ApprovalRequestedEventDto,
  ApprovalResolvedEventDto,
  ToolResultEventDto,
  RunFinishedEventDto,
  RunAbortedEventDto,
  RunFailedEventDto,
];

type DtoEvent = InstanceType<(typeof RUN_EVENT_DTOS)[number]>;
/** Compiles only while every DTO is a valid event of the agent loop, so the two cannot drift apart. */
export const dtoIsRunEvent = (dto: DtoEvent): RunEvent => dto;
