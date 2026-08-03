jest.mock('puppeteer', () => ({
  launch: jest.fn(),
}));

import { existsSync } from 'node:fs';
import * as puppeteer from 'puppeteer';
import { renderPdf } from './render-pdf';

describe('renderPdf', () => {
  it('aísla los perfiles de Chrome y los elimina después de cada PDF', async () => {
    const profileDirectories: string[] = [];
    const close = jest.fn().mockResolvedValue(undefined);
    const launchMock = puppeteer.launch as jest.Mock;

    launchMock.mockImplementation(async (options) => {
      profileDirectories.push(options.userDataDir);
      return {
        newPage: jest.fn().mockResolvedValue({
          setContent: jest.fn().mockResolvedValue(undefined),
          pdf: jest.fn().mockResolvedValue(Buffer.from('pdf')),
        }),
        close,
      };
    });

    await Promise.all([
      renderPdf('<html>Inventario</html>', { format: 'A4' }),
      renderPdf('<html>Reporte</html>', { format: 'A4' }),
    ]);

    expect(profileDirectories).toHaveLength(2);
    expect(new Set(profileDirectories).size).toBe(2);
    expect(
      profileDirectories.every((directory) => !existsSync(directory)),
    ).toBe(true);
    expect(close).toHaveBeenCalledTimes(2);
  });
});
