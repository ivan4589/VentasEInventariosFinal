import { Logger } from '@nestjs/common';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser, PDFOptions } from 'puppeteer';

const logger = new Logger('PdfRenderer');

/**
 * Renders a PDF in an isolated Chrome profile.
 *
 * Chromium locks its profile directory while it is running. Using a profile
 * created by us for every render prevents concurrent reports from sharing a
 * lock and lets us retry cleanup safely on Windows.
 */
export async function renderPdf(
  html: string,
  options: PDFOptions,
): Promise<Uint8Array> {
  const profileDirectory = await mkdtemp(
    join(tmpdir(), `yungas-pdf-${process.pid}-`),
  );
  let browser: Browser | null = null;

  try {
    // Load Puppeteer only when a PDF is requested so controllers and unit
    // tests that do not render files can import their services without
    // evaluating Chromium's runtime module.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const puppeteer = require('puppeteer') as typeof import('puppeteer');
    browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      userDataDir: profileDirectory,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ],
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });

    return await page.pdf(options);
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (error) {
        logger.warn(
          `Chrome no se cerró limpiamente: ${getErrorMessage(error)}`,
        );
      }
    }

    try {
      await rm(profileDirectory, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 200,
      });
    } catch (error) {
      // A delayed Windows file release must never terminate the Nest process.
      logger.warn(
        `No se pudo limpiar el perfil temporal de Chrome: ${getErrorMessage(error)}`,
      );
    }
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
