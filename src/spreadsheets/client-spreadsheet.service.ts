import { BadRequestException, Injectable } from '@nestjs/common';
import { $Enums } from '../../generated/prisma/client';
import {
  normalizeDisplayText,
  normalizeOptionalPhone,
  normalizeOptionalText,
  normalizeSearchText,
} from '../data-protection/data-normalization';
import { DataAuditService } from '../data-protection/data-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { SpreadsheetFileService } from './spreadsheet-file.service';
import {
  PreparedSpreadsheetImport,
  SpreadsheetImportAction,
  SpreadsheetPreviewRow,
} from './spreadsheet.types';

export const CLIENT_SPREADSHEET_HEADERS = [
  'ID_SISTEMA',
  'NOMBRE_COMPLETO',
  'ALIAS',
  'TIPO',
  'LOCALIDAD',
  'TELEFONO',
  'WHATSAPP_AUTORIZADO',
  'INFORMACION_ADICIONAL',
  'ESTADO_SOLO_LECTURA',
] as const;

interface PreparedClientRow {
  row: number;
  action: SpreadsheetImportAction;
  existingId?: string;
  displayName: string;
  data: {
    fullName?: string;
    alias?: string | null;
    type?: $Enums.ClientType;
    locationId?: string;
    phone?: string | null;
    phoneNormalized?: string | null;
    whatsappConsent?: boolean;
    additionalInfo?: string | null;
  };
}

@Injectable()
export class ClientSpreadsheetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: DataAuditService,
    private readonly files: SpreadsheetFileService,
  ) {}

  async template() {
    return this.workbook([]);
  }

  async export() {
    const clients = await this.prisma.client.findMany({
      include: { location: true },
      orderBy: [{ isActive: 'desc' }, { fullName: 'asc' }],
    });

    return this.workbook(
      clients.map((client) => [
        client.id,
        client.fullName,
        client.alias || '',
        client.type,
        client.location.name,
        client.phone || '',
        client.whatsappConsent ? 'SI' : 'NO',
        client.additionalInfo || '',
        client.isActive ? 'ACTIVO' : 'INACTIVO',
      ]),
    );
  }

  async preview(contents: Buffer) {
    const result = await this.prepare(contents);
    return this.publicPreview(result);
  }

  async import(contents: Buffer, actorId: number) {
    const result = await this.prepare(contents);
    if (!result.valid) {
      throw new BadRequestException({
        message: 'Corrige todas las filas antes de confirmar la importación',
        preview: this.publicPreview(result),
      });
    }

    await this.prisma.$transaction(
      async (tx) => {
        for (const row of result.prepared) {
          if (row.action === 'UNCHANGED') continue;

          if (row.action === 'CREATE') {
            const created = await tx.client.create({
              data: {
                fullName: row.data.fullName!,
                alias: row.data.alias ?? null,
                type: row.data.type!,
                locationId: row.data.locationId!,
                phone: row.data.phone ?? null,
                phoneNormalized: row.data.phoneNormalized ?? null,
                whatsappConsent: row.data.whatsappConsent ?? false,
                additionalInfo: row.data.additionalInfo ?? null,
              },
            });
            await this.audit.record(
              {
                userId: actorId,
                action: 'CLIENT_CREATED',
                entityType: 'CLIENT',
                entityId: created.id,
                reason: 'Importación masiva mediante Excel',
                after: created,
              },
              tx,
            );
            continue;
          }

          const current = await tx.client.findUnique({
            where: { id: row.existingId! },
          });
          if (!current) {
            throw new BadRequestException(
              `El cliente de la fila ${row.row} cambió después de la vista previa`,
            );
          }
          const updated = await tx.client.update({
            where: { id: current.id },
            data: row.data,
          });
          await this.audit.record(
            {
              userId: actorId,
              action: 'CLIENT_UPDATED',
              entityType: 'CLIENT',
              entityId: current.id,
              reason: 'Actualización masiva mediante Excel',
              before: current,
              after: updated,
            },
            tx,
          );
        }
      },
      { maxWait: 10_000, timeout: 120_000 },
    );

    return {
      message: 'Importación de clientes completada correctamente',
      summary: result.summary,
    };
  }

  private async workbook(rows: unknown[][]) {
    const locations = await this.prisma.location.findMany({
      orderBy: { name: 'asc' },
      select: { name: true },
    });
    const { workbook, worksheet } = this.files.createWorkbook(
      'Clientes',
      CLIENT_SPREADSHEET_HEADERS,
      [28, 30, 22, 15, 24, 18, 23, 42, 23],
      rows,
    );
    this.files.addCatalogSheet(workbook, [
      {
        header: 'LOCALIDADES_EXISTENTES',
        values: locations.map((location) => location.name),
        width: 32,
      },
      {
        header: 'TIPOS_DE_CLIENTE',
        values: ['NORMAL', 'ESPECIAL', 'CAMINO'],
      },
      {
        header: 'VALORES_SI_NO',
        values: ['SI', 'NO'],
      },
    ]);
    this.files.addInstructionsSheet(workbook, [
      'No cambies los nombres ni el orden de las columnas de la hoja Clientes.',
      'ID_SISTEMA identifica una actualización exacta. Déjalo vacío para filas nuevas.',
      'Sin ID_SISTEMA, el teléfono identifica a un cliente existente; si no coincide, se crea uno nuevo.',
      'Las celdas vacías no modifican datos existentes. Escribe BORRAR para limpiar ALIAS, TELEFONO o INFORMACION_ADICIONAL.',
      'LOCALIDAD debe existir en la hoja Catalogos. La importación no crea localidades.',
      'ESTADO_SOLO_LECTURA es informativo y nunca activa ni desactiva clientes.',
      'El sistema mostrará una vista previa y no guardará nada mientras exista una fila con error.',
    ]);

    const catalogEnd = Math.max(2, locations.length + 1);
    this.files.applyListValidation(worksheet, 4, "'Catalogos'!$B$2:$B$4");
    this.files.applyListValidation(
      worksheet,
      5,
      `'Catalogos'!$A$2:$A$${catalogEnd}`,
    );
    this.files.applyListValidation(worksheet, 7, "'Catalogos'!$C$2:$C$3");
    worksheet.getColumn(1).numFmt = '@';
    worksheet.getColumn(6).numFmt = '@';
    return this.files.toBuffer(workbook);
  }

  private async prepare(
    contents: Buffer,
  ): Promise<PreparedSpreadsheetImport<PreparedClientRow>> {
    const rows = await this.files.readRows(
      contents,
      'Clientes',
      CLIENT_SPREADSHEET_HEADERS,
    );
    const [locations, clients] = await Promise.all([
      this.prisma.location.findMany(),
      this.prisma.client.findMany(),
    ]);
    const locationByName = new Map(
      locations.map((location) => [
        normalizeSearchText(location.name),
        location,
      ]),
    );
    const clientById = new Map(clients.map((client) => [client.id, client]));
    const clientByPhone = new Map(
      clients
        .filter((client) => client.isActive && client.phoneNormalized)
        .map((client) => [client.phoneNormalized!, client]),
    );
    const claimedTargets = new Map<string, number>();
    const claimedPhones = new Map<string, number>();
    const prepared: PreparedClientRow[] = [];
    const previewRows: SpreadsheetPreviewRow[] = [];

    for (const source of rows) {
      const errors: string[] = [];
      const id = source.values.ID_SISTEMA.trim();
      const rawPhone = source.values.TELEFONO;
      let parsedPhone: string | null | undefined;
      let phoneNormalized: string | null | undefined;

      if (rawPhone.trim()) {
        if (this.files.isDeleteMarker(rawPhone)) {
          parsedPhone = null;
          phoneNormalized = null;
        } else {
          parsedPhone = normalizeOptionalText(rawPhone);
          try {
            phoneNormalized = normalizeOptionalPhone(rawPhone);
          } catch (error) {
            errors.push(this.errorMessage(error));
          }
        }
      }

      let existing = id ? clientById.get(id) : undefined;
      if (id && !existing)
        errors.push('ID_SISTEMA no corresponde a un cliente');
      if (!id && phoneNormalized) existing = clientByPhone.get(phoneNormalized);

      const data: PreparedClientRow['data'] = {};
      const isCreate = !existing;
      const rawName = source.values.NOMBRE_COMPLETO;
      if (isCreate || rawName.trim()) {
        const name = this.files.requiredText(
          rawName,
          'NOMBRE_COMPLETO',
          errors,
        );
        if (name) {
          const normalized = normalizeDisplayText(name);
          if (normalized.length > 160) {
            errors.push('NOMBRE_COMPLETO no puede superar 160 caracteres');
          } else {
            data.fullName = normalized;
          }
        }
      }

      const alias = this.files.optionalText(source.values.ALIAS);
      if (alias !== undefined) {
        if (alias && alias.length > 100) {
          errors.push('ALIAS no puede superar 100 caracteres');
        } else {
          data.alias = alias ? normalizeDisplayText(alias) : null;
        }
      }

      const rawType = source.values.TIPO.trim();
      if (isCreate || rawType) {
        const type = rawType.toUpperCase() as $Enums.ClientType;
        if (!Object.values($Enums.ClientType).includes(type)) {
          errors.push('TIPO debe ser NORMAL, ESPECIAL o CAMINO');
        } else {
          data.type = type;
        }
      }

      const rawLocation = source.values.LOCALIDAD.trim();
      if (isCreate || rawLocation) {
        const location = locationByName.get(normalizeSearchText(rawLocation));
        if (!rawLocation || !location) {
          errors.push('LOCALIDAD no existe en el sistema');
        } else {
          data.locationId = location.id;
        }
      }

      if (rawPhone.trim()) {
        data.phone = parsedPhone;
        data.phoneNormalized = phoneNormalized;
      }

      const whatsapp = this.files.boolean(
        source.values.WHATSAPP_AUTORIZADO,
        'WHATSAPP_AUTORIZADO',
        errors,
        isCreate,
      );
      if (whatsapp !== undefined) data.whatsappConsent = whatsapp;

      const additionalInfo = this.files.optionalText(
        source.values.INFORMACION_ADICIONAL,
      );
      if (additionalInfo !== undefined) {
        if (additionalInfo && additionalInfo.length > 500) {
          errors.push('INFORMACION_ADICIONAL no puede superar 500 caracteres');
        } else {
          data.additionalInfo = additionalInfo
            ? normalizeDisplayText(additionalInfo)
            : null;
        }
      }

      if (isCreate) {
        data.phone ??= null;
        data.phoneNormalized ??= null;
        data.alias ??= null;
        data.additionalInfo ??= null;
        data.whatsappConsent ??= false;
      }

      const finalPhone =
        data.phoneNormalized !== undefined
          ? data.phoneNormalized
          : existing?.phoneNormalized;
      if (finalPhone) {
        const owner = clientByPhone.get(finalPhone);
        if (owner && owner.id !== existing?.id) {
          errors.push('TELEFONO ya pertenece a otro cliente');
        }
        const claimedRow = claimedPhones.get(finalPhone);
        if (claimedRow) {
          errors.push(`TELEFONO también aparece en la fila ${claimedRow}`);
        } else {
          claimedPhones.set(finalPhone, source.row);
        }
      }

      const targetKey = existing ? `id:${existing.id}` : undefined;
      if (targetKey) {
        const claimedRow = claimedTargets.get(targetKey);
        if (claimedRow) {
          errors.push(
            `El mismo cliente también aparece en la fila ${claimedRow}`,
          );
        } else {
          claimedTargets.set(targetKey, source.row);
        }
      }

      let action: SpreadsheetImportAction = isCreate ? 'CREATE' : 'UPDATE';
      if (existing && !this.hasChanges(existing, data)) action = 'UNCHANGED';
      const displayName =
        data.fullName || existing?.fullName || `Fila ${source.row}`;
      const identifier = existing?.id || finalPhone || 'NUEVO';
      previewRows.push({
        row: source.row,
        action,
        identifier,
        displayName,
        errors,
      });
      if (!errors.length) {
        prepared.push({
          row: source.row,
          action,
          existingId: existing?.id,
          displayName,
          data,
        });
      }
    }

    return {
      ...this.files.buildPreview(previewRows),
      prepared,
    };
  }

  private hasChanges(
    existing: Record<string, unknown>,
    data: PreparedClientRow['data'],
  ) {
    return Object.entries(data).some(([key, value]) => existing[key] !== value);
  }

  private publicPreview(result: PreparedSpreadsheetImport<PreparedClientRow>) {
    return {
      valid: result.valid,
      summary: result.summary,
      rows: result.rows,
    };
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'TELEFONO no es válido';
  }
}
