import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateProjectDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  /** An https URL of a public git repository. Without it the project starts empty. */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  cloneUrl?: string;
}

export class RenameProjectDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;
}

export class ProjectDto {
  id!: string;
  name!: string;
  origin!: string;
  createdAt!: Date;
  updatedAt!: Date;
}

export class FileEntryDto {
  name!: string;
  /** Path relative to the project root. */
  path!: string;
  type!: 'file' | 'directory' | 'symlink';
  /** Only for files. */
  size?: number;
}

export class FileListDto {
  entries!: FileEntryDto[];
  /** True when the folder has more entries than are returned. */
  truncated!: boolean;
}

export class FileContentDto {
  path!: string;
  content!: string;
  /** True when the file is larger than the part that is returned. */
  truncated!: boolean;
}
