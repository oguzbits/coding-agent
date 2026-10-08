import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { PERMISSION_MODES } from '../agent/mode-policy.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateConversationDto {
  @IsUUID()
  projectId!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;
}

export class UpdateConversationDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsIn(PERMISSION_MODES)
  @ApiProperty({ enum: PERMISSION_MODES, required: false })
  mode?: string;
}

export class SendMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(20_000)
  text!: string;
}

export class ApprovalDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  callId!: string;

  @IsBoolean()
  approved!: boolean;
}

export class ActiveRunDto {
  id!: string;
  state!: string;
  pendingApproval!: { callId: string; name: string; preview: string } | null;
}

export class ConversationDto {
  id!: string;
  projectId!: string;
  title!: string;
  mode!: string;
  createdAt!: Date;
  updatedAt!: Date;
  @ApiProperty({ type: ActiveRunDto, nullable: true, required: false })
  activeRun?: ActiveRunDto | null;
}

export class RunStartedDto {
  runId!: string;
}
