import { IsArray, IsEmail, IsOptional, IsString, Matches } from 'class-validator';

export class CreateContactDto {
  @Matches(/^55\d{10,11}$/, { message: 'phone deve ser BR: 55 + DDD + número' })
  phone!: string;

  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() company?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() source?: string;
  @IsOptional() @IsArray() tags?: string[];
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() accountOwner?: string;
}

export class UpdateContactDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() company?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() leadStatus?: string;
  @IsOptional() @IsArray() tags?: string[];
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() accountOwner?: string;
}
