import { ApiProperty } from '@nestjs/swagger';

export class AuthUserDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ nullable: true }) name!: string | null;
  @ApiProperty({ type: [String] }) roles!: string[];
  @ApiProperty({ type: [String] }) permissions!: string[];
}

export class LoginResponseDto {
  @ApiProperty() token!: string;
  @ApiProperty({ type: AuthUserDto }) user!: AuthUserDto;
}
