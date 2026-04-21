import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsUUID,
  Min,
} from 'class-validator';

export class ImpressionEventDto {
  @ApiProperty({
    description: 'The active feed session ID returned by GET /feed.',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsUUID()
  sessionId: string;

  @ApiProperty({
    description:
      'Ordered list of videoIds the user saw, starting at startPosition. 1–50 entries.',
    type: [String],
    example: ['video-uuid-1', 'video-uuid-2'],
  })
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  videoIds: string[];

  @ApiProperty({
    description: 'Zero-indexed feed position of the first videoId in the array.',
    example: 0,
    minimum: 0,
  })
  @IsInt()
  @Min(0)
  startPosition: number;
}
