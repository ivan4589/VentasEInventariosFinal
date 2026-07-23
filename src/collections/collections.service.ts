import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { $Enums } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReportHistoryService } from '../reports/report-history.service';
import * as fs from 'fs';
import * as path from 'path';
import * as puppeteer from 'puppeteer';

interface CollectionActor {
  id: number;
  role: $Enums.Role;
}

export interface DebtSale {
  id: string;
  saleNumber: string;
  date: Date;
  dueDate: Date | null;
  total: number;
  paidAmount: number;
  balance: number;
  paymentStatus: $Enums.PaymentStatus;
  isOverdue: boolean;
  assignment: {
    id: string;
    assignedToId: number;
    assignedToName: string;
    assignedToRole: $Enums.Role;
    assignedById: number;
    assignedByName: string;
    assignedAt: Date;
  } | null;
}

export interface DebtClient {
  id: string;
  fullName: string;
  alias: string | null;
  phone: string | null;
  location: string;
  totalDebt: number;
  totalPaid: number;
  balance: number;
  overdueBalance: number;
  sales: DebtSale[];
}

@Injectable()
export class CollectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reportHistoryService: ReportHistoryService,
  ) {}

  private roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private escapeHtml(value: unknown): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private ensureAdmin(actor: CollectionActor): void {
    if (actor.role !== $Enums.Role.ADMIN) {
      throw new ForbiddenException(
        'Solo el administrador puede administrar asignaciones de cobranza',
      );
    }
  }

  private debtWhere(actor: CollectionActor) {
    return {
      saleType: $Enums.SaleType.CREDIT,
      status: $Enums.SaleStatus.CONFIRMED,
      paymentStatus: {
        in: [$Enums.PaymentStatus.PENDING, $Enums.PaymentStatus.PARTIALLY_PAID],
      },
      ...(actor.role === $Enums.Role.ADMIN
        ? {}
        : {
            collectionAssignment: {
              is: {
                assignedToId: actor.id,
              },
            },
          }),
    };
  }

  private async getDebtClients(actor: CollectionActor): Promise<DebtClient[]> {
    const sales = await this.prisma.sale.findMany({
      where: this.debtWhere(actor),
      include: {
        client: {
          include: {
            location: true,
          },
        },
        payments: {
          select: {
            amount: true,
          },
        },
        collectionAssignment: {
          include: {
            assignedTo: {
              select: {
                id: true,
                name: true,
                role: true,
              },
            },
            assignedBy: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: [
        {
          dueDate: 'asc',
        },
        {
          date: 'asc',
        },
      ],
    });

    const now = new Date();
    const clientMap = new Map<string, DebtClient>();

    for (const sale of sales) {
      const paidAmount = this.roundMoney(
        sale.payments.reduce((sum, payment) => sum + payment.amount, 0),
      );
      const balance = this.roundMoney(Math.max(sale.total - paidAmount, 0));
      const isOverdue = Boolean(
        sale.dueDate && sale.dueDate.getTime() < now.getTime(),
      );

      const debtSale: DebtSale = {
        id: sale.id,
        saleNumber: sale.saleNumber,
        date: sale.date,
        dueDate: sale.dueDate,
        total: sale.total,
        paidAmount,
        balance,
        paymentStatus: sale.paymentStatus,
        isOverdue,
        assignment: sale.collectionAssignment
          ? {
              id: sale.collectionAssignment.id,
              assignedToId: sale.collectionAssignment.assignedTo.id,
              assignedToName: sale.collectionAssignment.assignedTo.name,
              assignedToRole: sale.collectionAssignment.assignedTo.role,
              assignedById: sale.collectionAssignment.assignedBy.id,
              assignedByName: sale.collectionAssignment.assignedBy.name,
              assignedAt: sale.collectionAssignment.assignedAt,
            }
          : null,
      };

      const currentClient = clientMap.get(sale.clientId);

      if (currentClient) {
        currentClient.totalDebt = this.roundMoney(
          currentClient.totalDebt + sale.total,
        );
        currentClient.totalPaid = this.roundMoney(
          currentClient.totalPaid + paidAmount,
        );
        currentClient.balance = this.roundMoney(
          currentClient.balance + balance,
        );
        if (isOverdue) {
          currentClient.overdueBalance = this.roundMoney(
            currentClient.overdueBalance + balance,
          );
        }
        currentClient.sales.push(debtSale);
        continue;
      }

      clientMap.set(sale.clientId, {
        id: sale.client.id,
        fullName: sale.client.fullName,
        alias: sale.client.alias,
        phone: sale.client.phone,
        location: sale.client.location?.name || '',
        totalDebt: sale.total,
        totalPaid: paidAmount,
        balance,
        overdueBalance: isOverdue ? balance : 0,
        sales: [debtSale],
      });
    }

    return Array.from(clientMap.values()).sort((first, second) =>
      first.fullName.localeCompare(second.fullName),
    );
  }

  async findDebts(actor: CollectionActor) {
    const clients = await this.getDebtClients(actor);
    const sales = clients.flatMap((client) => client.sales);

    return {
      clients,
      summary: {
        clientsCount: clients.length,
        salesCount: sales.length,
        totalDebt: this.roundMoney(
          clients.reduce((sum, client) => sum + client.totalDebt, 0),
        ),
        totalPaid: this.roundMoney(
          clients.reduce((sum, client) => sum + client.totalPaid, 0),
        ),
        totalBalance: this.roundMoney(
          clients.reduce((sum, client) => sum + client.balance, 0),
        ),
        overdueBalance: this.roundMoney(
          clients.reduce((sum, client) => sum + client.overdueBalance, 0),
        ),
        unassignedSalesCount: sales.filter((sale) => !sale.assignment).length,
      },
    };
  }

  async findAssignableUsers(actor: CollectionActor) {
    this.ensureAdmin(actor);

    return this.prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
      orderBy: [
        {
          role: 'asc',
        },
        {
          name: 'asc',
        },
      ],
    });
  }

  async assign(saleId: string, assignedToId: number, actor: CollectionActor) {
    this.ensureAdmin(actor);

    const [sale, assignedTo] = await Promise.all([
      this.prisma.sale.findUnique({
        where: {
          id: saleId,
        },
        include: {
          payments: {
            select: {
              amount: true,
            },
          },
        },
      }),
      this.prisma.user.findUnique({
        where: {
          id: assignedToId,
        },
        select: {
          id: true,
          name: true,
          role: true,
        },
      }),
    ]);

    if (!sale) {
      throw new NotFoundException('Venta no encontrada');
    }

    if (!assignedTo) {
      throw new NotFoundException('Responsable de cobranza no encontrado');
    }

    if (
      sale.saleType !== $Enums.SaleType.CREDIT ||
      sale.status !== $Enums.SaleStatus.CONFIRMED
    ) {
      throw new BadRequestException(
        'Solo se pueden asignar ventas a crédito confirmadas',
      );
    }

    const paidAmount = sale.payments.reduce(
      (sum, payment) => sum + payment.amount,
      0,
    );

    if (
      sale.paymentStatus === $Enums.PaymentStatus.PAID ||
      paidAmount >= sale.total
    ) {
      throw new BadRequestException(
        'No se puede asignar una venta que ya está pagada',
      );
    }

    const assignment = await this.prisma.collectionAssignment.upsert({
      where: {
        saleId,
      },
      create: {
        saleId,
        assignedToId,
        assignedById: actor.id,
      },
      update: {
        assignedToId,
        assignedById: actor.id,
        assignedAt: new Date(),
      },
      include: {
        assignedTo: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
        assignedBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return {
      message: 'Cobranza asignada correctamente',
      assignment: {
        id: assignment.id,
        saleId: assignment.saleId,
        assignedToId: assignment.assignedTo.id,
        assignedToName: assignment.assignedTo.name,
        assignedToRole: assignment.assignedTo.role,
        assignedById: assignment.assignedBy.id,
        assignedByName: assignment.assignedBy.name,
        assignedAt: assignment.assignedAt,
      },
    };
  }

  async unassign(saleId: string, actor: CollectionActor) {
    this.ensureAdmin(actor);

    const assignment = await this.prisma.collectionAssignment.findUnique({
      where: {
        saleId,
      },
    });

    if (!assignment) {
      throw new NotFoundException(
        'La venta no tiene una asignación de cobranza',
      );
    }

    await this.prisma.collectionAssignment.delete({
      where: {
        saleId,
      },
    });

    return {
      message: 'Asignación eliminada correctamente',
    };
  }

  async assertCanCollect(
    saleId: string,
    actor: CollectionActor,
  ): Promise<void> {
    if (actor.role === $Enums.Role.ADMIN) {
      return;
    }

    const assignment = await this.prisma.collectionAssignment.findUnique({
      where: {
        saleId,
      },
      select: {
        assignedToId: true,
      },
    });

    if (!assignment || assignment.assignedToId !== actor.id) {
      throw new ForbiddenException(
        'Esta venta no está asignada a tu usuario para cobranza',
      );
    }
  }

  private formatDate(value: Date | null): string {
    if (!value) {
      return '-';
    }

    return value.toLocaleDateString('es-BO');
  }

  private buildDebtTable(clients: DebtClient[]): string {
    let rows = '';

    for (const client of clients) {
      for (const sale of client.sales) {
        rows += `
          <tr>
            <td>${this.escapeHtml(client.fullName)}</td>
            <td>${this.escapeHtml(client.location)}</td>
            <td>${this.escapeHtml(sale.saleNumber)}</td>
            <td>${this.formatDate(sale.dueDate)}</td>
            <td>${this.escapeHtml(sale.assignment?.assignedToName || 'Sin asignar')}</td>
            <td class="number">${sale.total.toFixed(2)}</td>
            <td class="number">${sale.paidAmount.toFixed(2)}</td>
            <td class="number">${sale.balance.toFixed(2)}</td>
          </tr>
        `;
      }
    }

    return rows;
  }

  private buildDocument(
    title: string,
    summaryHtml: string,
    rows: string,
  ): string {
    return `
      <!DOCTYPE html>
      <html lang="es">
        <head>
          <meta charset="UTF-8" />
          <style>
            * { box-sizing: border-box; }
            body { font-family: Arial, sans-serif; padding: 24px; color: #1f2937; font-size: 11px; }
            h1 { margin: 0; color: #063f2d; font-size: 21px; }
            .header { text-align: center; border-bottom: 2px solid #063f2d; padding-bottom: 12px; margin-bottom: 18px; }
            .summary { background: #f0f7f4; border: 1px solid #b7d7ca; padding: 12px; margin-bottom: 16px; }
            .summary p { margin: 4px 0; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #cbd5e1; padding: 6px; }
            th { background: #063f2d; color: white; text-align: left; }
            .number { text-align: right; }
            .footer { margin-top: 20px; text-align: center; color: #64748b; font-size: 10px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${this.escapeHtml(title)}</h1>
            <p>Generado: ${new Date().toLocaleString('es-BO')}</p>
          </div>
          <div class="summary">${summaryHtml}</div>
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Localidad</th>
                <th>N° Venta</th>
                <th>Vencimiento</th>
                <th>Responsable</th>
                <th>Total Bs.</th>
                <th>Pagado Bs.</th>
                <th>Saldo Bs.</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <div class="footer">Sistema de Ventas e Inventarios</div>
        </body>
      </html>
    `;
  }

  private async createPdf(html: string, filename: string): Promise<string> {
    let browser: puppeteer.Browser | null = null;

    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const page = await browser.newPage();
      await page.setContent(html, {
        waitUntil: 'load',
      });

      const pdfBuffer = await page.pdf({
        format: 'A4',
        landscape: true,
        printBackground: true,
        margin: {
          top: '18px',
          right: '18px',
          bottom: '18px',
          left: '18px',
        },
      });

      const safeFilename = filename.replace(/[^\w-]/g, '_');
      const uploadDir = path.join(process.cwd(), 'uploads', 'collections');

      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, {
          recursive: true,
        });
      }

      fs.writeFileSync(path.join(uploadDir, `${safeFilename}.pdf`), pdfBuffer);

      return `/uploads/collections/${safeFilename}.pdf`;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  private async saveReportHistory(
    title: string,
    pdfUrl: string,
    userId: number,
    parameters: Record<string, unknown>,
  ) {
    return this.reportHistoryService.create({
      type: $Enums.ReportType.COLLECTION_REPORT,
      title,
      filters: parameters,
      pdfUrl,
      userId,
    });
  }

  async generateGeneralDebtPdf(actor: CollectionActor) {
    this.ensureAdmin(actor);

    const data = await this.findDebts(actor);
    const html = this.buildDocument(
      'CUENTAS POR COBRAR - REPORTE GENERAL',
      `
        <p><strong>Clientes con deuda:</strong> ${data.summary.clientsCount}</p>
        <p><strong>Ventas pendientes:</strong> ${data.summary.salesCount}</p>
        <p><strong>Deuda original:</strong> ${data.summary.totalDebt.toFixed(2)} Bs.</p>
        <p><strong>Total pagado:</strong> ${data.summary.totalPaid.toFixed(2)} Bs.</p>
        <p><strong>SALDO GENERAL:</strong> ${data.summary.totalBalance.toFixed(2)} Bs.</p>
      `,
      this.buildDebtTable(data.clients),
    );
    const date = new Date().toISOString().slice(0, 10);
    const pdfUrl = await this.createPdf(
      html,
      `cuentas-por-cobrar-general-${date}`,
    );
    const history = await this.saveReportHistory(
      'Cuentas por Cobrar - General',
      pdfUrl,
      actor.id,
      {
        kind: 'GENERAL_DEBT',
      },
    );

    return {
      pdfUrl,
      historyId: history.id,
    };
  }

  async generateAssignmentsPdf(actor: CollectionActor) {
    this.ensureAdmin(actor);

    const data = await this.findDebts(actor);
    const assignedSales = data.clients.flatMap((client) =>
      client.sales
        .filter((sale) => sale.assignment)
        .map((sale) => ({
          client,
          sale,
        })),
    );
    const roleTotals = new Map<$Enums.Role, number>();
    const userTotals = new Map<
      number,
      {
        name: string;
        role: $Enums.Role;
        salesCount: number;
        balance: number;
      }
    >();

    for (const item of assignedSales) {
      const assignment = item.sale.assignment!;
      const role = assignment.assignedToRole;
      roleTotals.set(
        role,
        this.roundMoney((roleTotals.get(role) || 0) + item.sale.balance),
      );

      const currentUser = userTotals.get(assignment.assignedToId);

      if (currentUser) {
        currentUser.salesCount += 1;
        currentUser.balance = this.roundMoney(
          currentUser.balance + item.sale.balance,
        );
      } else {
        userTotals.set(assignment.assignedToId, {
          name: assignment.assignedToName,
          role: assignment.assignedToRole,
          salesCount: 1,
          balance: item.sale.balance,
        });
      }
    }

    const roleSummary = Array.from(roleTotals.entries())
      .map(
        ([role, total]) =>
          `<p><strong>${this.escapeHtml(role)}:</strong> ${total.toFixed(2)} Bs.</p>`,
      )
      .join('');
    const userSummary = Array.from(userTotals.values())
      .sort(
        (first, second) =>
          first.role.localeCompare(second.role) ||
          first.name.localeCompare(second.name),
      )
      .map(
        (item) =>
          `<p>${this.escapeHtml(item.name)} (${this.escapeHtml(item.role)}): ${item.salesCount} venta(s) · <strong>${item.balance.toFixed(2)} Bs.</strong></p>`,
      )
      .join('');

    const assignedClients = data.clients
      .map((client) => ({
        ...client,
        sales: client.sales.filter((sale) => sale.assignment),
      }))
      .filter((client) => client.sales.length > 0);

    const totalAssigned = this.roundMoney(
      assignedSales.reduce((sum, item) => sum + item.sale.balance, 0),
    );

    const html = this.buildDocument(
      'ASIGNACIONES DE COBRANZA',
      `
        <p><strong>Saldo total asignado:</strong> ${totalAssigned.toFixed(2)} Bs.</p>
        ${roleSummary || '<p>No existen ventas asignadas.</p>'}
        ${userSummary}
      `,
      this.buildDebtTable(assignedClients),
    );
    const date = new Date().toISOString().slice(0, 10);
    const pdfUrl = await this.createPdf(html, `asignaciones-cobranza-${date}`);
    const history = await this.saveReportHistory(
      'Asignaciones de Cobranza',
      pdfUrl,
      actor.id,
      {
        kind: 'ASSIGNMENTS_GENERAL',
      },
    );

    return {
      pdfUrl,
      historyId: history.id,
    };
  }

  async generateUserAssignmentsPdf(userId: number, actor: CollectionActor) {
    if (actor.role !== $Enums.Role.ADMIN && actor.id !== userId) {
      throw new ForbiddenException(
        'Solo puedes generar tu propio PDF de asignaciones',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const data = await this.findDebts({
      id: user.id,
      role: user.role === $Enums.Role.ADMIN ? $Enums.Role.VENDEDOR : user.role,
    });

    const total = this.roundMoney(
      data.clients.reduce((sum, client) => sum + client.balance, 0),
    );
    const html = this.buildDocument(
      `ASIGNACIONES DE ${user.name.toUpperCase()}`,
      `
        <p><strong>Responsable:</strong> ${this.escapeHtml(user.name)}</p>
        <p><strong>Rol:</strong> ${this.escapeHtml(user.role)}</p>
        <p><strong>Clientes:</strong> ${data.summary.clientsCount}</p>
        <p><strong>Ventas asignadas:</strong> ${data.summary.salesCount}</p>
        <p><strong>SALDO ASIGNADO:</strong> ${total.toFixed(2)} Bs.</p>
      `,
      this.buildDebtTable(data.clients),
    );
    const date = new Date().toISOString().slice(0, 10);
    const pdfUrl = await this.createPdf(html, `cobranza-${user.name}-${date}`);
    const history = await this.saveReportHistory(
      `Asignaciones de Cobranza - ${user.name}`,
      pdfUrl,
      actor.id,
      {
        kind: 'ASSIGNMENTS_USER',
        assignedToId: user.id,
      },
    );

    return {
      pdfUrl,
      historyId: history.id,
    };
  }
}
