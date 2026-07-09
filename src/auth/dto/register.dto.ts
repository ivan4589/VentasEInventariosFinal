export class RegisterDto {
  email: string;
  password: string;
  name: string;
  role?: 'ADMIN' | 'VENDEDOR' | 'COBRADOR';
}