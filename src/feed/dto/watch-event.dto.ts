import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsUUID, Min } from 'class-validator';

export class WatchEventDto {
  @ApiProperty({
    description: 'The video that was watched.',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsUUID()
  videoId: string;

  @ApiProperty({
    description: 'Number of seconds the user actually watched (≥ 0).',
    example: 45,
    minimum: 0,
  })
  @IsInt()
  @Min(0)
  watchedSec: number;

  @ApiProperty({
    description: 'Total duration of the video in seconds (≥ 1).',
    example: 60,
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  durationSec: number;
}
