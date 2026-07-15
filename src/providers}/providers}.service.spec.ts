import { Test, TestingModule } from '@nestjs/testing';
import { Providers}Service } from './providers}.service';

describe('Providers}Service', () => {
  let service: Providers}Service;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [Providers}Service],
    }).compile();

    service = module.get<Providers}Service>(Providers}Service);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
