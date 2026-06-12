import { ApiProperty } from '@nestjs/swagger';

export class WorkflowModuleResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() key!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true }) description!: string | null;
  @ApiProperty() isEnabled!: boolean;
  @ApiProperty() sortOrder!: number;
}
