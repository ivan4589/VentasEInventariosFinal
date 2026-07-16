import { Test, TestingModule } from '@nestjs/testing';
import { ReportHistoryService } from './report-history.service';

describe('ReportHistoryService', () => {
  let service: ReportHistoryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ReportHistoryService],
    }).compile();

    service = module.get<ReportHistoryService>(ReportHistoryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
