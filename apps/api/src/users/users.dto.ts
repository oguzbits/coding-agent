import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class SettingsDto {
  @ApiProperty()
  hasGeminiKey!: boolean;

  @ApiProperty({ nullable: true, type: String, description: 'Last four characters; the key itself is never returned.' })
  geminiKeyLast4!: string | null;

  @ApiProperty({ nullable: true, type: String })
  modelName!: string | null;
}

export class SetGeminiKeyDto {
  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  @Matches(/^\S+$/, { message: 'apiKey must not contain whitespace' })
  apiKey!: string;
}
