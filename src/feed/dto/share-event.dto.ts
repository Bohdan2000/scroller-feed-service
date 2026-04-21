import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ShareEventDto {
  @ApiProperty({
    description: 'The video that was shared.',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsUUID()
  videoId: string;

  @ApiPropertyOptional({
    description: 'Platform the video was shared to (e.g. "instagram", "whatsapp", "copy_link").',
    example: 'copy_link',
    maxLength: 50,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  platform?: string;
}
