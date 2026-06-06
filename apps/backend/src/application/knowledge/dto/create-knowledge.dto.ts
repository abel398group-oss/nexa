import { IsArray, IsOptional, IsString } from 'class-validator';

export class CreateKnowledgeDto {
  @IsString() topic!: string;
  @IsString() category!: string;
  @IsString() title!: string;
  @IsString() content!: string;
  @IsOptional() @IsString() productCode?: string;
  @IsOptional() @IsArray() tags?: string[];
}

export class AddVersionDto {
  @IsString() content!: string;
  @IsOptional() @IsString() author?: string;
}

export class ApproveVersionDto {
  @IsOptional() @IsString() reviewer?: string;
}
