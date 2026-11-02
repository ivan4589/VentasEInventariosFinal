import { ClientContactsService } from './client-contacts.service';
import { PrismaService } from '../prisma/prisma.service';
import { DataAuditService } from '../data-protection/data-audit.service';

describe('ClientContactsService: consent per phone', () => {
  const tx = {
    client: { findFirst: jest.fn() },
    clientContact: { findFirst: jest.fn(), update: jest.fn() },
  };
  const prisma = { $transaction: jest.fn((work: (db: typeof tx) => unknown) => work(tx)) };
  const audit = { record: jest.fn() };
  const service = new ClientContactsService(prisma as unknown as PrismaService, audit as unknown as DataAuditService);

  beforeEach(() => {
    jest.clearAllMocks();
    tx.client.findFirst.mockResolvedValue({ id: 'client', phoneNormalized: '59171111111' });
    tx.clientContact.findFirst.mockResolvedValue({ id: 'contact', phoneNormalized: '59172222222', whatsappConsent: true });
    tx.clientContact.update.mockResolvedValue({ id: 'contact' });
  });

  it('clears consent when changing the phone without explicit confirmation', async () => {
    await service.update('client', 'contact', { phone: '73333333' }, 1);
    expect(tx.clientContact.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ whatsappConsent: false }) }));
  });

  it('accepts explicit consent for the new phone', async () => {
    await service.update('client', 'contact', { phone: '73333333', whatsappConsent: true }, 1);
    expect(tx.clientContact.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ whatsappConsent: true }) }));
  });

  it('preserves consent for formatting-only changes', async () => {
    await service.update('client', 'contact', { phone: '+591 72222222' }, 1);
    expect(tx.clientContact.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ whatsappConsent: undefined }) }));
  });
});
