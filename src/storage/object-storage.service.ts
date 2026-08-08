import {
  BadGatewayException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';

type StorageFolder = 'reports' | 'purchases' | 'sales' | 'collections';

@Injectable()
export class ObjectStorageService {
  constructor(private readonly config: ConfigService) {}

  async savePrivatePdf(
    folder: StorageFolder,
    filename: string,
    contents: Uint8Array,
  ): Promise<string> {
    const safeName = this.safeFilename(filename, '.pdf');
    const key = `${folder}/${safeName}`;
    if (this.driver() === 'supabase') {
      await this.upload(this.privateBucket(), key, contents, 'application/pdf');
    } else {
      await this.writeLocal(key, contents);
    }
    return `/uploads/${key}`;
  }

  async saveProductImage(
    originalName: string,
    mimeType: string,
    contents: Uint8Array,
  ): Promise<string> {
    const extension = extname(originalName).toLowerCase();
    const base = originalName
      .slice(0, Math.max(0, originalName.length - extension.length))
      .replace(/[^a-zA-Z0-9-_]/g, '_')
      .slice(0, 80);
    const filename = `${Date.now()}-${randomUUID()}-${base || 'producto'}${extension}`;
    const key = `products/${filename}`;
    if (this.driver() === 'supabase') {
      await this.upload(this.publicBucket(), key, contents, mimeType);
      return `${this.supabaseUrl()}/storage/v1/object/public/${this.publicBucket()}/${this.encodeKey(key)}`;
    }
    await this.writeLocal(key, contents);
    return `/uploads/${key}`;
  }

  async readPrivate(fileUrl: string): Promise<Buffer> {
    const key = this.legacyKey(fileUrl);
    if (this.driver() === 'supabase') {
      const response = await fetch(
        `${this.supabaseUrl()}/storage/v1/object/${this.privateBucket()}/${this.encodeKey(key)}`,
        { headers: this.authorizationHeaders() },
      );
      if (response.status === 404)
        throw new NotFoundException('El archivo no existe');
      if (!response.ok) throw await this.storageError(response, 'descargar');
      return Buffer.from(await response.arrayBuffer());
    }
    return readFile(this.localPath(key)).catch(() => {
      throw new NotFoundException('El archivo no existe en el servidor');
    });
  }

  private driver() {
    return this.config.get<string>('STORAGE_DRIVER') || 'local';
  }

  private supabaseUrl() {
    const value = this.config.get<string>('SUPABASE_URL')?.replace(/\/+$/, '');
    if (!value) throw new Error('SUPABASE_URL no está configurado');
    return value;
  }

  private serviceKey() {
    const value = this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    if (!value)
      throw new Error('SUPABASE_SERVICE_ROLE_KEY no está configurado');
    return value;
  }

  private privateBucket() {
    return (
      this.config.get<string>('SUPABASE_PRIVATE_BUCKET') || 'private-documents'
    );
  }

  private publicBucket() {
    return (
      this.config.get<string>('SUPABASE_PUBLIC_BUCKET') || 'product-images'
    );
  }

  private authorizationHeaders(): Record<string, string> {
    const key = this.serviceKey();
    return { apikey: key, Authorization: `Bearer ${key}` };
  }

  private async upload(
    bucket: string,
    key: string,
    contents: Uint8Array,
    contentType: string,
  ) {
    const response = await fetch(
      `${this.supabaseUrl()}/storage/v1/object/${bucket}/${this.encodeKey(key)}`,
      {
        method: 'POST',
        headers: {
          ...this.authorizationHeaders(),
          'Content-Type': contentType,
          'x-upsert': 'false',
        },
        body: new Uint8Array(contents),
      },
    );
    if (!response.ok) throw await this.storageError(response, 'guardar');
  }

  private async storageError(response: Response, action: string) {
    const detail = await response.text().catch(() => '');
    return new BadGatewayException(
      `No se pudo ${action} el archivo en Supabase Storage (${response.status})${detail ? `: ${detail.slice(0, 200)}` : ''}`,
    );
  }

  private encodeKey(key: string) {
    return key.split('/').map(encodeURIComponent).join('/');
  }

  private safeFilename(filename: string, requiredExtension: string) {
    const extension = extname(filename).toLowerCase();
    const base = filename
      .slice(0, Math.max(0, filename.length - extension.length))
      .replace(/[^a-zA-Z0-9-_]/g, '_')
      .slice(0, 120);
    return `${base || randomUUID()}${requiredExtension}`;
  }

  private legacyKey(fileUrl: string) {
    const key = decodeURIComponent(fileUrl)
      .replace(/^https?:\/\/[^/]+/i, '')
      .replace(/^\/+/, '')
      .replace(/^uploads\//, '');
    if (!/^(reports|purchases|sales|collections)\/[a-zA-Z0-9._-]+$/.test(key)) {
      throw new ForbiddenException('La ruta del documento no es válida');
    }
    return key;
  }

  private localPath(key: string) {
    const uploadsRoot = resolve(process.cwd(), 'uploads');
    const target = resolve(uploadsRoot, key);
    if (!target.startsWith(`${uploadsRoot}${sep}`)) {
      throw new ForbiddenException('La ruta del archivo no es válida');
    }
    return target;
  }

  private async writeLocal(key: string, contents: Uint8Array) {
    const target = this.localPath(key);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, contents);
  }
}
