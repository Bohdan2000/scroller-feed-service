import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class LikeEventDto {
  @ApiProperty({
    description: 'The video to like.',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsUUID()
  videoId: string;
}
