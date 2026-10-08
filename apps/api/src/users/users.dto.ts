import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';

export class SettingsDto {
  @ApiProperty()
  hasGeminiKey!: boolean;

  @ApiProperty({ nullable: true, type: String, description: 'Last four characters; the key itself is never returned.' })
  geminiKeyLast4!: string | null;

  @ApiProperty({ nullable: true, type: String })
  modelName!: string | null;

  @ApiProperty({ description: 'Limits from the Google AI Studio dashboard; null means the default.' })
  limits!: { requestsPerMinute: number | null; tokensPerMinute: number | null; requestsPerDay: number | null };
}

const LIMIT_MAX = 100_000_000;

/** Every field is optional; null resets it to the default, a missing field stays as it is. */
export class SetModelSettingsDto {
  @ApiProperty({ required: false, nullable: true, type: String })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/^[\w./-]+$/, { message: 'modelName may only contain letters, digits and . _ / -' })
  modelName?: string | null;

  @ApiProperty({ required: false, nullable: true, type: Number })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  @Max(LIMIT_MAX)
  requestsPerMinute?: number | null;

  @ApiProperty({ required: false, nullable: true, type: Number })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  @Max(LIMIT_MAX)
  tokensPerMinute?: number | null;

  @ApiProperty({ required: false, nullable: true, type: Number })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  @Max(LIMIT_MAX)
  requestsPerDay?: number | null;
}

export class SetGeminiKeyDto {
  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  @Matches(/^\S+$/, { message: 'apiKey must not contain whitespace' })
  apiKey!: string;
}
