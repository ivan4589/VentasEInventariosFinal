import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { $Enums } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from '../reports/reports.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { calculateBonusEntitlement, validateBonusAllocation } from './bonuses/bonus-calculator';
import { BonusAllocationDto } from './dto/bonus-allocation.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { CreateSaleReturnDto } from './dto/create-sale-return.dto';
import { SaleResponseDto } from './dto/sale-response.dto';

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reportsService: ReportsService,
  ) {}

  private roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private saleInclude(): any {
    return {
      client: {
        include: {
          location: true,
        },
      },
      user: true,
      details: {
        include: {
          product: true,
        },
      },
      payments: true,
      bonusDetails: {include:{product:{include:{subCategory:true}}}},
      whatsappLogs: {
        orderBy: {
          createdAt: 'desc',
        },
      },
    };
  }

  private async generateSaleNumber(): Promise<string> {
    const today = new Date();

    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');

    const dailyPrefix = `${year}${month}${day}`;
    const monthlyPrefix = `${year}${month}`;

    const lastSale = await this.prisma.sale.findFirst({
      where: {
        saleNumber: {
          startsWith: monthlyPrefix,
        },
      },
      orderBy: {
        saleNumber: 'desc',
      },
      select: {
        saleNumber: true,
      },
    });

    let nextNumber = 1;

    if (lastSale) {
      const parts = lastSale.saleNumber.split('-');
      const currentNumber = Number(parts[1]);

      if (!Number.isNaN(currentNumber)) {
        nextNumber = currentNumber + 1;
      }
    }

    return `${dailyPrefix}-${String(nextNumber).padStart(3, '0')}`;
  }

  private calculatePaymentStatus(
    total: number,
    paidAmount: number,
  ): $Enums.PaymentStatus {
    if (paidAmount <= 0) {
      return $Enums.PaymentStatus.PENDING;
    }

    if (paidAmount >= total) {
      return $Enums.PaymentStatus.PAID;
    }

    return $Enums.PaymentStatus.PARTIALLY_PAID;
  }

  private getDefaultProductPrice(
    product: any,
    clientType: $Enums.ClientType,
    quantity: number,
  ): number {
    if (
      clientType === $Enums.ClientType.NORMAL &&
      Number(product.priceMayorista) > 0 &&
      Number(product.minQuantityWholesale) > 0 &&
      quantity >= product.minQuantityWholesale
    ) {
      return product.priceMayorista;
    }

    if (clientType === $Enums.ClientType.CAMINO) {
      return product.priceCamino;
    }

    if (clientType === $Enums.ClientType.ESPECIAL) {
      return product.priceEspecial;
    }

    return product.priceNormal;
  }

  private validateDueDate(
    saleType: $Enums.SaleType,
    dueDate?: string | Date | null,
  ): Date | null {
    if (saleType === $Enums.SaleType.CASH) {
      return null;
    }

    if (!dueDate) {
      throw new BadRequestException(
        'Las ventas a crédito deben tener fecha de vencimiento',
      );
    }

    const parsedDueDate = new Date(dueDate);

    if (Number.isNaN(parsedDueDate.getTime())) {
      throw new BadRequestException(
        'La fecha de vencimiento no es válida',
      );
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const maximumDate = new Date(today);
    maximumDate.setDate(maximumDate.getDate() + 7);
    maximumDate.setHours(23, 59, 59, 999);

    if (parsedDueDate < today) {
      throw new BadRequestException(
        'La fecha de vencimiento no puede ser anterior a hoy',
      );
    }

    if (parsedDueDate > maximumDate) {
      throw new BadRequestException(
        'El crédito no puede superar los siete días',
      );
    }

    return parsedDueDate;
  }

  private async getPaidAmount(
    saleId: string,
    prisma: any = this.prisma,
  ): Promise<number> {
    const payments = await prisma.payment.aggregate({
      where: {
        saleId,
      },
      _sum: {
        amount: true,
      },
    });

    return this.roundMoney(
      payments._sum.amount || 0,
    );
  }

  private async getCentralWarehouse(
    prisma: any = this.prisma,
  ): Promise<{ id: string; name: string }> {
    const warehouse =
      await prisma.warehouse.findFirst({
        where: {
          isDefault: true,
          isActive: true,
        },
        select: {
          id: true,
          name: true,
        },
      });

    if (!warehouse) {
      throw new BadRequestException(
        'No existe un Almacén Central activo configurado como predeterminado',
      );
    }

    return warehouse;
  }

  private async toResponse(
    sale: any,
  ): Promise<SaleResponseDto> {
    const paidAmount = Array.isArray(sale.payments)
      ? this.roundMoney(
          sale.payments.reduce(
            (sum: number, payment: any) =>
              sum + payment.amount,
            0,
          ),
        )
      : await this.getPaidAmount(sale.id);
    const lastWhatsAppLog =
      sale.whatsappLogs?.[0];
    const lastSuccessfulWhatsAppLog =
      sale.whatsappLogs?.find(
        (log: any) =>
          log.status !==
          $Enums.WhatsAppSendStatus.FAILED,
      );

    return {
      id: sale.id,
      saleNumber: sale.saleNumber,

      clientId: sale.clientId,
      clientName: sale.client?.fullName || '',
      clientAlias: sale.client?.alias,
      clientType: sale.client?.type,
      clientLocation:
        sale.client?.location?.name || '',
      clientPhone: sale.client?.phone,
      clientWhatsAppConsent:
        sale.client?.whatsappConsent ?? false,

      userId: sale.userId,
      userName: sale.user?.name || '',

      date: sale.date,
      status: sale.status,
      paymentStatus: sale.paymentStatus,
      saleType: sale.saleType,
      dueDate: sale.dueDate,

      subtotal: sale.subtotal,
      discount: sale.discount,
      total: sale.total,
      paidAmount,
      balance: this.roundMoney(
        Math.max(sale.total - paidAmount, 0),
      ),

      observations: sale.observations,
      pdfUrl: sale.pdfUrl ? `/api/documents/sales/${sale.id}` : undefined,
      cancelledPdfUrl: sale.cancelledPdfUrl
        ? `/api/documents/sales/${sale.id}?cancelled=true`
        : undefined,
      whatsappLastSentAt:
        lastSuccessfulWhatsAppLog?.createdAt,
      whatsappMessageId:
        lastSuccessfulWhatsAppLog?.metaMessageId,
      whatsappStatus: lastWhatsAppLog?.status,
      whatsappLastError:
        lastWhatsAppLog?.status ===
        $Enums.WhatsAppSendStatus.FAILED
          ? lastWhatsAppLog.errorMessage
          : undefined,

      details:
        sale.details?.map((detail: any) => ({
          id: detail.id,
          productId: detail.productId,
          productName:
            detail.product?.name || '',
          productImageUrl:
            detail.product?.imageUrl,
          presentation:
            detail.product?.weight ||
            detail.product?.unit,
          quantity: detail.quantity,
          returnedQuantity:
            detail.returnedQuantity,
          unitPrice: detail.unitPrice,
          subtotal: detail.subtotal,
        })) || [],

      bonuses: sale.bonusDetails?.map((gift:any)=>({id:gift.id,productId:gift.productId,productName:gift.product?.name||'',subCategoryId:gift.subCategoryId,subCategoryName:gift.product?.subCategory?.name||'',quantity:gift.quantity,returnedQuantity:gift.returnedQuantity}))||[],
      createdAt: sale.createdAt,
      updatedAt: sale.updatedAt,
    };
  }

  private async validateAndPrepareDetails(
    clientId: string,
    details: CreateSaleDto['details'],
    currentSaleId?: string,
    userRole: $Enums.Role = $Enums.Role.ADMIN,
  ) {
    if (
      userRole !== $Enums.Role.ADMIN &&
      details?.some((detail) => detail.manualPrice)
    ) {
      throw new BadRequestException(
        'Solo el administrador puede modificar precios manualmente',
      );
    }
    if (!details?.length) {
      throw new BadRequestException(
        'La venta debe tener al menos un producto',
      );
    }

    const productIds = details.map(
      (detail) => detail.productId,
    );

    const duplicatedProduct = productIds.find(
      (id, index) =>
        productIds.indexOf(id) !== index,
    );

    if (duplicatedProduct) {
      throw new BadRequestException(
        'No se puede repetir el mismo producto en la venta',
      );
    }

    const [client, products, centralWarehouse] = await Promise.all([
      this.prisma.client.findUnique({
        where: { id: clientId },
      }),
      this.prisma.product.findMany({
        where: {
          id: { in: productIds },
          isActive: true,
          provider: { isActive: true },
        },
      }),
      this.getCentralWarehouse(),
    ]);

    if (!client || client.isActive === false) {
      throw new NotFoundException(
        'Cliente no encontrado o desactivado',
      );
    }

    if (products.length !== productIds.length) {
      throw new BadRequestException(
        'Uno o más productos no existen o están desactivados',
      );
    }

    const productMap = new Map(
      products.map((product) => [
        product.id,
        product,
      ]),
    );

    const centralStocks =
      await this.prisma.warehouseStock.findMany({
        where: {
          warehouseId: centralWarehouse.id,
          productId: {
            in: productIds,
          },
        },
        select: {
          productId: true,
          stock: true,
          reservedStock: true,
        },
      });

    const centralStockMap = new Map(
      centralStocks.map((stock) => [
        stock.productId,
        stock,
      ]),
    );

    let previousReservations = new Map<
      string,
      number
    >();

    if (currentSaleId) {
      const oldDetails =
        await this.prisma.saleDetail.findMany({
          where: {
            saleId: currentSaleId,
          },
        });

      previousReservations = new Map(
        oldDetails.map((detail) => [
          detail.productId,
          detail.quantity,
        ]),
      );
    }

    const preparedDetails = details.map(
      (detail) => {
        const product = productMap.get(
          detail.productId,
        );

        if (!product) {
          throw new NotFoundException(
            `Producto ${detail.productId} no encontrado`,
          );
        }

        const oldReserved =
          previousReservations.get(product.id) || 0;

        const centralStock =
          centralStockMap.get(product.id);

        const availableStock =
          (centralStock?.stock || 0) -
          (centralStock?.reservedStock || 0) +
          oldReserved;

        if (detail.quantity > availableStock) {
          throw new BadRequestException(
            `Stock insuficiente para "${product.name}" en ${centralWarehouse.name}. Disponible: ${availableStock}, solicitado: ${detail.quantity}`,
          );
        }

        const automaticPrice =
          this.getDefaultProductPrice(
            product,
            client.type,
            detail.quantity,
          );

        // Conserva el precio histórico cuando el usuario lo modificó
        // explícitamente. Si no hay modificación, el servidor continúa
        // calculando el precio vigente según el cliente y la cantidad.
        const unitPrice = detail.manualPrice
          ? detail.unitPrice
          : automaticPrice;

        return {
          productId: product.id,
          productName: product.name,
          quantity: detail.quantity,
          unitPrice: this.roundMoney(unitPrice),
          subtotal: this.roundMoney(
            detail.quantity * unitPrice,
          ),
          previousReserved: oldReserved,
        };
      },
    );

    return {
      client,
      centralWarehouse,
      preparedDetails,
    };
  }



  /**
   * Conditional inventory reservation. Checks the warehouse balance inside the
   * SQL UPDATE itself, avoiding stale read/modify/write races.
   */
  private async reserveCentralStock(prisma: any, warehouseId: string, productId: string, quantity: number) {
    const affected = await prisma.$executeRaw`
      UPDATE "warehouse_stocks"
      SET "reservedStock" = "reservedStock" + ${quantity},
          "updatedAt" = NOW()
      WHERE "warehouseId" = ${warehouseId}
        AND "productId" = ${productId}
        AND "stock" - "reservedStock" >= ${quantity}
    `;
    if (affected !== 1) {
      throw new BadRequestException('Stock insuficiente para reservar venta y bonificaciones');
    }
    await prisma.product.update({where:{id:productId},data:{reservedStock:{increment:quantity}}});
  }

  private async consumeCentralStock(prisma: any, warehouseId: string, productId: string, quantity: number) {
    const affected = await prisma.$executeRaw`
      UPDATE "warehouse_stocks"
      SET "stock" = "stock" - ${quantity},
          "reservedStock" = "reservedStock" - ${quantity},
          "updatedAt" = NOW()
      WHERE "warehouseId" = ${warehouseId}
        AND "productId" = ${productId}
        AND "stock" >= ${quantity}
        AND "reservedStock" >= ${quantity}
    `;
    if (affected !== 1) {
      throw new BadRequestException('Stock o reserva insuficiente al confirmar');
    }
    await prisma.product.update({where:{id:productId},data:{stock:{decrement:quantity},reservedStock:{decrement:quantity}}});
    const stock = await prisma.warehouseStock.findUniqueOrThrow({where:{warehouseId_productId:{warehouseId,productId}}});
    return stock.stock as number;
  }

  private async prepareBonuses(
    sold: Array<{productId: string; quantity: number}>,
    allocations: BonusAllocationDto[],
    currentSaleId?: string,
  ) {
    const warehouse = await this.getCentralWarehouse();
    const soldIds = [...new Set(sold.map(d => d.productId))];
    const giftedIds = [...new Set(allocations.map(d => d.productId))];
    const products = await this.prisma.product.findMany({
      where: { id: { in: [...new Set([...soldIds, ...giftedIds])] } },
      select: { id: true, name: true, subCategoryId: true, isActive: true, purchasePrice: true },
    });
    const byId = new Map(products.map(p => [p.id, p]));
    if (sold.some(d => !byId.has(d.productId))) throw new BadRequestException('Producto vendido no encontrado');
    const sales = sold.map(d => ({...d, subCategoryId: byId.get(d.productId)!.subCategoryId}));
    const categories = [...new Set(sales.map(p => p.subCategoryId).filter((id): id is string => !!id))];
    const now = new Date();
    const rules = await this.prisma.bonusRule.findMany({ where: {
      subCategoryId: { in: categories }, isActive: true,
      AND: [{OR:[{validFrom:null},{validFrom:{lte:now}}]},{OR:[{validUntil:null},{validUntil:{gte:now}}]}],
    }});
    const grants: Array<{ productId:string; subCategoryId:string; quantity:number; minimumQuantity:number; bonusQuantity:number; unitCostSnapshot:number }> = [];
    const prior = currentSaleId ? await this.prisma.saleBonusDetail.findMany({ where: { saleId: currentSaleId } }) : [];
    const oldReserved = new Map<string,number>();
    const oldSoldReserved = new Map<string,number>();
    if(currentSaleId){for(const row of await this.prisma.saleDetail.findMany({where:{saleId:currentSaleId}})){oldSoldReserved.set(row.productId,(oldSoldReserved.get(row.productId)||0)+row.quantity);}}
    for (const row of prior) oldReserved.set(row.productId,(oldReserved.get(row.productId)||0)+row.quantity);
    const stocks = await this.prisma.warehouseStock.findMany({
      where: {warehouseId:warehouse.id,productId:{in:[...new Set([...soldIds,...giftedIds])]}},
    });
    const stockMap = new Map(stocks.map(v=>[v.productId,v]));
    const soldQty = new Map<string,number>();
    for (const d of sold) soldQty.set(d.productId,(soldQty.get(d.productId)||0)+d.quantity);
    // No rule, no gift: legacy sales remain fully compatible.
    if (!rules.length && allocations.length) throw new BadRequestException('No hay promoción vigente para la bonificación');
    for (const rule of rules) {
      const eligibleAllocations = allocations.filter(a=>byId.get(a.productId)?.subCategoryId===rule.subCategoryId);
      const eligibleProducts = eligibleAllocations.map(a => {
        const product=byId.get(a.productId);
        if (!product || !product.isActive) throw new BadRequestException('Producto de bonificación desactivado o inexistente');
        const stock=stockMap.get(a.productId);
        return { id:a.productId,subCategoryId:product.subCategoryId,
          availableStock:(stock?.stock||0)-(stock?.reservedStock||0)+(oldReserved.get(a.productId)||0)+(oldSoldReserved.get(a.productId)||0)-(soldQty.get(a.productId)||0) };
      });
      try { validateBonusAllocation(rule,sales,eligibleAllocations,eligibleProducts); }
      catch(e) { throw new BadRequestException(e instanceof Error?e.message:'Bonificación inválida'); }
      for (const item of eligibleAllocations) grants.push({
        productId:item.productId,subCategoryId:rule.subCategoryId,quantity:item.quantity,
        minimumQuantity:rule.minimumQuantity,bonusQuantity:rule.bonusQuantity,
        unitCostSnapshot:byId.get(item.productId)!.purchasePrice,
      });
    }
    // Reject invalid gift products rather than silently filtering them out.
    for (const gift of allocations) {
      const found = byId.get(gift.productId);
      if (!found || !rules.some(rule=>rule.subCategoryId===found.subCategoryId)) {
        throw new BadRequestException('Regalo fuera de las subcategorías con promoción vigente');
      }
    }
    const expected = rules.reduce((n,rule)=>n+calculateBonusEntitlement(rule,sales),0);
    const actual = grants.reduce((n,b)=>n+b.quantity,0);
    if(expected!==actual || allocations.reduce((n,b)=>n+b.quantity,0)!==actual)
      throw new BadRequestException('Bonificaciones sin asignar o fuera de la subcategoría');
    return grants;
  }

  async create(
    createSaleDto: CreateSaleDto,
    userId: number,
    userRole: $Enums.Role,
    operationKey: string,
  ): Promise<SaleResponseDto> {
    const existing = await this.prisma.sale.findUnique({
      where: { idempotencyKey: operationKey },
      select: { id: true },
    });
    if (existing) return this.findOne(existing.id);
    const {
      clientId,
      details,
      observations,
      saleType,
      dueDate,
      initialPayment = 0,
      paymentMethod,
      paymentReference,
    } = createSaleDto;

    const discount =
      userRole === $Enums.Role.ADMIN
        ? createSaleDto.discount || 0
        : 0;

    if (
      userRole !== $Enums.Role.ADMIN &&
      (createSaleDto.discount || 0) > 0
    ) {
      throw new BadRequestException(
        'Solo el administrador puede aplicar descuentos',
      );
    }

    const parsedDueDate =
      this.validateDueDate(saleType, dueDate);

    const { centralWarehouse, preparedDetails } =
      await this.validateAndPrepareDetails(
        clientId,
        details,
        undefined,
        userRole,
      );

    const preparedBonuses = await this.prepareBonuses(details, createSaleDto.bonuses || []);

    const subtotal = this.roundMoney(
      preparedDetails.reduce(
        (sum, detail) =>
          sum + detail.subtotal,
        0,
      ),
    );

    const total = this.roundMoney(
      subtotal - discount,
    );

    if (total < 0) {
      throw new BadRequestException(
        'El descuento no puede superar el subtotal',
      );
    }

    if (initialPayment > total) {
      throw new BadRequestException(
        'El pago inicial no puede superar el total de la venta',
      );
    }

    if (
      initialPayment > 0 &&
      !paymentMethod
    ) {
      throw new BadRequestException(
        'Debes seleccionar un método para el pago inicial',
      );
    }

    const paymentStatus =
      this.calculatePaymentStatus(
        total,
        initialPayment,
      );

    const saleNumber =
      await this.generateSaleNumber();

    const sale = await this.prisma.$transaction(
      async (prisma) => {
        for (const detail of preparedDetails) {
          await this.reserveCentralStock(prisma,centralWarehouse.id,detail.productId,detail.quantity);
        }
        for (const bonus of preparedBonuses) {
          await this.reserveCentralStock(prisma,centralWarehouse.id,bonus.productId,bonus.quantity);
        }

        const createdSale =
          await prisma.sale.create({
            data: {
              saleNumber,
              idempotencyKey: operationKey,
              clientId,
              userId,
              saleType,
              dueDate: parsedDueDate,
              status:
                $Enums.SaleStatus.PENDING,
              paymentStatus,
              subtotal,
              discount,
              total,
              observations,
              bonusDetails: { create: preparedBonuses },
              details: {
                create: preparedDetails.map(
                  (detail) => ({
                    productId:
                      detail.productId,
                    quantity:
                      detail.quantity,
                    unitPrice:
                      detail.unitPrice,
                    subtotal:
                      detail.subtotal,
                  }),
                ),
              },
            },
          });

        if (initialPayment > 0) {
          await prisma.payment.create({
            data: {
              saleId: createdSale.id,
              clientId,
              userId,
              amount: initialPayment,
              method: paymentMethod!,
              reference:
                paymentReference || null,
              observations:
                'Pago inicial registrado con la venta',
            },
          });
        }

        return createdSale;
      },
    );

    if (
      paymentStatus ===
      $Enums.PaymentStatus.PAID
    ) {
      return this.confirm(sale.id, userId);
    }

    return this.findOne(sale.id);
  }

  async confirm(
    id: string,
    userId: number,
  ): Promise<SaleResponseDto> {
    await this.prisma.$transaction(
      async (prisma) => {
        const centralWarehouse =
          await this.getCentralWarehouse(prisma);
        const sale =
          await prisma.sale.findUnique({
            where: {
              id,
            },
            include: {
              details: {
                include: {
                  product: true,
                },
              },
              bonusDetails: {include:{product:true}},
            },
          });

        if (!sale) {
          throw new NotFoundException(
            'Venta no encontrada',
          );
        }

        if (sale.status === $Enums.SaleStatus.CONFIRMED) {
          return;
        }
        if (sale.status !== $Enums.SaleStatus.PENDING) {
          throw new BadRequestException(
            'Solo se pueden confirmar ventas pendientes',
          );
        }

        for (const detail of sale.details) {
          const centralStock =
            await prisma.warehouseStock.findUnique({
              where: {
                warehouseId_productId: {
                  warehouseId: centralWarehouse.id,
                  productId: detail.productId,
                },
              },
              select: {
                id: true,
                stock: true,
                reservedStock: true,
              },
            });

          if (
            !centralStock ||
            centralStock.stock <
            detail.quantity
          ) {
            throw new BadRequestException(
              `Stock insuficiente para "${detail.product.name}" en ${centralWarehouse.name}`,
            );
          }

          if (
            centralStock.reservedStock <
            detail.quantity
          ) {
            throw new BadRequestException(
              `La reserva de "${detail.product.name}" en ${centralWarehouse.name} es inconsistente`,
            );
          }

          const confirmedStock = await this.consumeCentralStock(prisma,centralWarehouse.id,detail.productId,detail.quantity);

          await prisma.inventoryMovement.create({
            data: {
              warehouseId: centralWarehouse.id,
              productId: detail.productId,
              userId,
              type: $Enums.InventoryMovementType.SALE_OUT,
              quantity: detail.quantity,
              previousStock: centralStock.stock,
              newStock: confirmedStock,
              referenceId: sale.id,
              observations: `Venta ${sale.saleNumber} confirmada`,
            },
          });
        }


        for (const bonus of sale.bonusDetails) {
          const row = await prisma.warehouseStock.findUnique({ where: {warehouseId_productId:{warehouseId:centralWarehouse.id,productId:bonus.productId}} });
          if (!row || row.stock < bonus.quantity || row.reservedStock < bonus.quantity) throw new BadRequestException('Stock o reserva de bonificación insuficiente');
          const newStock = await this.consumeCentralStock(prisma,centralWarehouse.id,bonus.productId,bonus.quantity);
          await prisma.inventoryMovement.create({data:{warehouseId:centralWarehouse.id,productId:bonus.productId,userId,
            type:$Enums.InventoryMovementType.BONUS_OUT,quantity:bonus.quantity,previousStock:row.stock,newStock,referenceId:id,
            observations:`Bonificación de venta ${sale.saleNumber}`}});
        }

        await prisma.sale.update({
          where: {
            id,
          },
          data: {
            status:
              $Enums.SaleStatus.CONFIRMED,
            confirmedAt: new Date(),
            confirmedById: userId,
          },
        });
      },
    );

    let pdfUrl: string | null = null;

    try {
      pdfUrl =
        await this.reportsService.generateSalePDF(
          id,
        );
    } catch (error) {
      console.error(
        'Error generando recibo de venta:',
        error,
      );
    }

    if (pdfUrl) {
      await this.prisma.sale.update({
        where: {
          id,
        },
        data: {
          pdfUrl,
        },
      });
    }

    return this.findOne(id);
  }

  async update(
    id: string,
    updateSaleDto: UpdateSaleDto,
    userRole: $Enums.Role,
    actorId: number,
  ): Promise<SaleResponseDto> {
    const current =
      await this.prisma.sale.findUnique({
        where: {
          id,
        },
        include: {
          details: true,
          bonusDetails: true,
        },
      });

    if (!current) {
      throw new NotFoundException(
        'Venta no encontrada',
      );
    }

    if (
      current.status !==
      $Enums.SaleStatus.PENDING
    ) {
      throw new BadRequestException(
        'Solo se pueden modificar ventas pendientes',
      );
    }

    if (
      userRole !== $Enums.Role.ADMIN &&
      updateSaleDto.discount !== undefined &&
      updateSaleDto.discount !==
        current.discount
    ) {
      throw new BadRequestException(
        'Solo el administrador puede modificar el descuento',
      );
    }

    const finalClientId =
      updateSaleDto.clientId ||
      current.clientId;

    const finalSaleType =
      updateSaleDto.saleType ||
      current.saleType;

    const finalDueDate =
      updateSaleDto.dueDate !== undefined
        ? this.validateDueDate(
            finalSaleType,
            updateSaleDto.dueDate,
          )
        : current.dueDate;

    const finalDiscount =
      userRole === $Enums.Role.ADMIN &&
      updateSaleDto.discount !== undefined
        ? updateSaleDto.discount
        : current.discount;

    let newSubtotal = current.subtotal;
    const detailsToUpdate =
      updateSaleDto.details ||
      (finalClientId !== current.clientId
        ? current.details.map((detail) => ({
            productId: detail.productId,
            quantity: detail.quantity,
            unitPrice: detail.unitPrice,
            manualPrice: false,
          }))
        : undefined);

    const originalGiftAllocations = current.bonusDetails.map(g=>({productId:g.productId,quantity:g.quantity}));
    const preparedBonuses = (detailsToUpdate || updateSaleDto.bonuses !== undefined) ? await this.prepareBonuses(detailsToUpdate || current.details.map(d=>({productId:d.productId,quantity:d.quantity})), updateSaleDto.bonuses ?? originalGiftAllocations, id) : undefined;

    await this.prisma.$transaction(
      async (prisma) => {
        if (detailsToUpdate) {
          const {
            centralWarehouse,
            preparedDetails,
          } =
            await this.validateAndPrepareDetails(
              finalClientId,
              detailsToUpdate,
              id,
              userRole,
            );

          for (const oldDetail of current.details) {
            await prisma.warehouseStock.update({
              where: {
                warehouseId_productId: {
                  warehouseId:
                    centralWarehouse.id,
                  productId:
                    oldDetail.productId,
                },
              },
              data: {
                reservedStock: {
                  decrement:
                    oldDetail.quantity,
                },
              },
            });

            await prisma.product.update({
              where: {
                id: oldDetail.productId,
              },
              data: {
                reservedStock: {
                  decrement:
                    oldDetail.quantity,
                },
              },
            });
          }

          if (preparedBonuses) {
            for (const gift of current.bonusDetails) {
              await prisma.warehouseStock.update({where:{warehouseId_productId:{warehouseId:centralWarehouse.id,productId:gift.productId}},data:{reservedStock:{decrement:gift.quantity}}});
              await prisma.product.update({where:{id:gift.productId},data:{reservedStock:{decrement:gift.quantity}}});
            }
            await prisma.saleBonusDetail.deleteMany({where:{saleId:id}});
          }
          await prisma.saleDetail.deleteMany({
            where: {
              saleId: id,
            },
          });

          for (const newDetail of preparedDetails) {
            await prisma.warehouseStock.update({
              where: {
                warehouseId_productId: {
                  warehouseId:
                    centralWarehouse.id,
                  productId:
                    newDetail.productId,
                },
              },
              data: {
                reservedStock: {
                  increment:
                    newDetail.quantity,
                },
              },
            });

            await prisma.product.update({
              where: {
                id: newDetail.productId,
              },
              data: {
                reservedStock: {
                  increment:
                    newDetail.quantity,
                },
              },
            });
          }

          await prisma.saleDetail.createMany({
            data: preparedDetails.map(
              (detail) => ({
                saleId: id,
                productId: detail.productId,
                quantity: detail.quantity,
                unitPrice: detail.unitPrice,
                subtotal: detail.subtotal,
              }),
            ),
          });

          newSubtotal = this.roundMoney(
            preparedDetails.reduce(
              (sum, detail) =>
                sum + detail.subtotal,
              0,
            ),
          );
        }

        if (preparedBonuses) {
          if (!detailsToUpdate) {
            const centralWarehouse=await this.getCentralWarehouse(prisma);
            for (const gift of current.bonusDetails) {
              await prisma.warehouseStock.update({where:{warehouseId_productId:{warehouseId:centralWarehouse.id,productId:gift.productId}},data:{reservedStock:{decrement:gift.quantity}}});
              await prisma.product.update({where:{id:gift.productId},data:{reservedStock:{decrement:gift.quantity}}});
            }
            await prisma.saleBonusDetail.deleteMany({where:{saleId:id}});
          }
          const centralWarehouse=await this.getCentralWarehouse(prisma);
          for (const gift of preparedBonuses) {
            await prisma.warehouseStock.update({where:{warehouseId_productId:{warehouseId:centralWarehouse.id,productId:gift.productId}},data:{reservedStock:{increment:gift.quantity}}});
            await prisma.product.update({where:{id:gift.productId},data:{reservedStock:{increment:gift.quantity}}});
          }
          await prisma.saleBonusDetail.createMany({data:preparedBonuses.map(g=>({...g,saleId:id}))});
        }
        const total = this.roundMoney(
          newSubtotal - finalDiscount,
        );

        if (total < 0) {
          throw new BadRequestException(
            'El descuento no puede superar el subtotal',
          );
        }

        const paidAmount =
          await this.getPaidAmount(id, prisma);

        const paymentStatus =
          this.calculatePaymentStatus(
            total,
            paidAmount,
          );

        await prisma.sale.update({
          where: {
            id,
          },
          data: {
            clientId: finalClientId,
            saleType: finalSaleType,
            dueDate: finalDueDate,
            observations:
              updateSaleDto.observations !==
              undefined
                ? updateSaleDto.observations
                : current.observations,
            subtotal: newSubtotal,
            discount: finalDiscount,
            total,
            paymentStatus,
          },
        });
      },
    );

    const updated = await this.findOne(id);

    if (
      updated.paymentStatus ===
      $Enums.PaymentStatus.PAID
    ) {
      return this.confirm(id, actorId);
    }

    return updated;
  }

  async cancel(
    id: string,
    userId: number,
    reason: string,
  ): Promise<SaleResponseDto> {
    const sale =
      await this.prisma.sale.findUnique({
        where: {
          id,
        },
        include: {
          details: {
            include: {
              product: true,
            },
          },
          bonusDetails: true,
        },
      });

    if (!sale) {
      throw new NotFoundException(
        'Venta no encontrada',
      );
    }

    if (sale.status === $Enums.SaleStatus.CANCELLED) {
      return this.findOne(id);
    }

    const netPaid = await this.getPaidAmount(id);
    if (netPaid > 0) {
      throw new BadRequestException(
        'Debes anular o revertir todos los pagos antes de anular la venta',
      );
    }

    await this.prisma.$transaction(
      async (prisma) => {
        const centralWarehouse =
          await this.getCentralWarehouse(prisma);

        for (const detail of sale.details) {
          if (
            sale.status ===
            $Enums.SaleStatus.PENDING
          ) {
            await prisma.warehouseStock.update({
              where: {
                warehouseId_productId: {
                  warehouseId:
                    centralWarehouse.id,
                  productId:
                    detail.productId,
                },
              },
              data: {
                reservedStock: {
                  decrement:
                    detail.quantity,
                },
              },
            });

            await prisma.product.update({
              where: {
                id: detail.productId,
              },
              data: {
                reservedStock: {
                  decrement:
                    detail.quantity,
                },
              },
            });
          }

          if (
            sale.status ===
            $Enums.SaleStatus.CONFIRMED
          ) {
            const quantityToRestore =
              detail.quantity -
              detail.returnedQuantity;
            const centralStock =
              await prisma.warehouseStock.findUnique({
                where: {
                  warehouseId_productId: {
                    warehouseId:
                      centralWarehouse.id,
                    productId:
                      detail.productId,
                  },
                },
                select: {
                  stock: true,
                },
              });
            const updatedCentralStock =
              await prisma.warehouseStock.upsert({
                where: {
                  warehouseId_productId: {
                    warehouseId:
                      centralWarehouse.id,
                    productId:
                      detail.productId,
                  },
                },
                create: {
                  warehouseId:
                    centralWarehouse.id,
                  productId:
                    detail.productId,
                  stock:
                    quantityToRestore,
                },
                update: {
                  stock: {
                    increment:
                      quantityToRestore,
                  },
                },
                select: {
                  stock: true,
                },
              });

            await prisma.product.update({
              where: {
                id: detail.productId,
              },
              data: {
                stock: {
                  increment:
                    quantityToRestore,
                },
              },
            });

            if (quantityToRestore > 0) {
              await prisma.inventoryMovement.create({
                data: {
                  warehouseId:
                    centralWarehouse.id,
                  productId:
                    detail.productId,
                  userId,
                  type: $Enums.InventoryMovementType.SALE_RETURN_IN,
                  quantity:
                    quantityToRestore,
                  previousStock:
                    centralStock?.stock || 0,
                  newStock:
                    updatedCentralStock.stock,
                  referenceId: sale.id,
                  observations: `Anulación de venta ${sale.saleNumber}`,
                },
              });
            }
          }
        }

        for (const gift of sale.bonusDetails) {
          const returnedRemaining=gift.quantity-gift.returnedQuantity;
          if (sale.status===$Enums.SaleStatus.PENDING) {
            await prisma.warehouseStock.update({where:{warehouseId_productId:{warehouseId:centralWarehouse.id,productId:gift.productId}},data:{reservedStock:{decrement:gift.quantity}}});
            await prisma.product.update({where:{id:gift.productId},data:{reservedStock:{decrement:gift.quantity}}});
          } else if (sale.status===$Enums.SaleStatus.CONFIRMED && returnedRemaining>0) {
            const old=await prisma.warehouseStock.findUnique({where:{warehouseId_productId:{warehouseId:centralWarehouse.id,productId:gift.productId}}});
            const updated=await prisma.warehouseStock.upsert({
              where:{warehouseId_productId:{warehouseId:centralWarehouse.id,productId:gift.productId}},
              create:{warehouseId:centralWarehouse.id,productId:gift.productId,stock:returnedRemaining},
              update:{stock:{increment:returnedRemaining}}
            });
            await prisma.product.update({where:{id:gift.productId},data:{stock:{increment:returnedRemaining}}});
            await prisma.inventoryMovement.create({data:{warehouseId:centralWarehouse.id,productId:gift.productId,userId,
              type:$Enums.InventoryMovementType.BONUS_CANCEL_IN,quantity:returnedRemaining,previousStock:old?.stock||0,newStock:updated.stock,
              referenceId:id,observations:`Anulación de bonificación ${sale.saleNumber}`}});
          }
        }

        await prisma.sale.update({
          where: {
            id,
          },
          data: {
            status:
              $Enums.SaleStatus.CANCELLED,
            cancelledAt: new Date(),
            cancelledById: userId,
            cancellationReason: reason,
          },
        });
      },
    );

    let cancelledPdfUrl: string | null = null;

    try {
      cancelledPdfUrl =
        await this.reportsService.generateSalePDF(
          id,
          true,
        );
    } catch (error) {
      console.error(
        'Error generando recibo anulado:',
        error,
      );
    }

    if (cancelledPdfUrl) {
      await this.prisma.sale.update({
        where: {
          id,
        },
        data: {
          cancelledPdfUrl,
        },
      });
    }

    return this.findOne(id);
  }

  async createReturn(
    saleId: string,
    dto: CreateSaleReturnDto,
    userId: number,
    operationKey: string,
  ) {
    const existing = await this.prisma.saleReturn.findUnique({
      where: { idempotencyKey: operationKey },
      select: { id: true, saleId: true, amount: true },
    });
    if (existing) {
      return {
        message: 'La devolución ya había sido registrada',
        return: existing,
        sale: await this.findOne(existing.saleId),
      };
    }
    const saleDetailIds = dto.details.map(
      (detail) => detail.saleDetailId,
    );

    const duplicatedSaleDetailId =
      saleDetailIds.find(
        (id, index) =>
          saleDetailIds.indexOf(id) !== index,
      );

    if (duplicatedSaleDetailId) {
      throw new BadRequestException(
        'No se puede repetir el mismo producto en una devolución',
      );
    }

    const sale =
      await this.prisma.sale.findUnique({
        where: {
          id: saleId,
        },
        include: {
          details: {
            include: {
              product: true,
            },
          },
        },
      });

    if (!sale) {
      throw new NotFoundException(
        'Venta no encontrada',
      );
    }

    if (
      sale.status !==
      $Enums.SaleStatus.CONFIRMED
    ) {
      throw new BadRequestException(
        'Solo se aceptan devoluciones de ventas confirmadas',
      );
    }

    // Prevent an outstanding gifted entitlement from becoming invalid after a partial return.
    // Returning complimentary units requires a separate, audited workflow.
    const gifts=await this.prisma.saleBonusDetail.findMany({where:{saleId}});
    if(gifts.length) {
      const original = await this.prisma.saleDetail.findMany({where:{saleId},include:{product:{select:{subCategoryId:true}}}});
      const returnedByDetail=new Map<string,number>();
      for(const row of dto.details) returnedByDetail.set(row.saleDetailId,(returnedByDetail.get(row.saleDetailId)||0)+row.quantity);
      const eligible=new Map<string,number>();
      for(const row of original){
        const category=row.product.subCategoryId;
        if(!category)continue;
        const remaining=row.quantity-row.returnedQuantity-(returnedByDetail.get(row.id)||0);
        eligible.set(category,(eligible.get(category)||0)+remaining);
      }
      const byCat=new Map<string,{minimum:number;reward:number;gifts:number}>();
      for(const gift of gifts){
        const row=byCat.get(gift.subCategoryId)||{minimum:gift.minimumQuantity,reward:gift.bonusQuantity,gifts:0};
        row.gifts+=gift.quantity-gift.returnedQuantity;
        byCat.set(gift.subCategoryId,row);
      }
      for(const [cat,rule] of byCat){
        const allowed=Math.floor(Math.max(0,eligible.get(cat)||0)/rule.minimum)*rule.reward;
        if(rule.gifts>allowed) throw new BadRequestException('La devolución reduce el derecho a bonificaciones. Regulariza primero las unidades gratuitas con autorización administrativa.');
      }
    }

    const detailMap = new Map(
      sale.details.map((detail) => [
        detail.id,
        detail,
      ]),
    );

    let returnTotal = 0;

    const prepared = dto.details.map(
      (returnDetail) => {
        const saleDetail = detailMap.get(
          returnDetail.saleDetailId,
        );

        if (!saleDetail) {
          throw new NotFoundException(
            'Detalle de venta no encontrado',
          );
        }

        const availableToReturn =
          saleDetail.quantity -
          saleDetail.returnedQuantity;

        if (
          returnDetail.quantity >
          availableToReturn
        ) {
          throw new BadRequestException(
            `Solo puedes devolver ${availableToReturn} unidades de "${saleDetail.product.name}"`,
          );
        }

        const subtotal = this.roundMoney(
          returnDetail.quantity *
            saleDetail.unitPrice,
        );

        returnTotal += subtotal;

        return {
          saleDetail,
          quantity:
            returnDetail.quantity,
          subtotal,
        };
      },
    );

    const result =
      await this.prisma.$transaction(
        async (prisma) => {
          const centralWarehouse =
            await this.getCentralWarehouse(prisma);
          const saleReturn =
            await prisma.saleReturn.create({
              data: {
                saleId,
                userId,
                idempotencyKey: operationKey,
                amount:
                  this.roundMoney(returnTotal),
                observations:
                  dto.observations,
              },
            });

          for (const item of prepared) {
            await prisma.saleReturnDetail.create({
              data: {
                saleReturnId:
                  saleReturn.id,
                saleDetailId:
                  item.saleDetail.id,
                productId:
                  item.saleDetail.productId,
                quantity: item.quantity,
                unitPrice:
                  item.saleDetail.unitPrice,
                subtotal: item.subtotal,
              },
            });

            await prisma.saleDetail.update({
              where: {
                id: item.saleDetail.id,
              },
              data: {
                returnedQuantity: {
                  increment: item.quantity,
                },
              },
            });

            await prisma.product.update({
              where: {
                id:
                  item.saleDetail.productId,
              },
              data: {
                stock: {
                  increment: item.quantity,
                },
              },
            });

            const centralStock =
              await prisma.warehouseStock.findUnique({
                where: {
                  warehouseId_productId: {
                    warehouseId:
                      centralWarehouse.id,
                    productId:
                      item.saleDetail.productId,
                  },
                },
                select: {
                  stock: true,
                },
              });
            const updatedCentralStock =
              await prisma.warehouseStock.upsert({
                where: {
                  warehouseId_productId: {
                    warehouseId:
                      centralWarehouse.id,
                    productId:
                      item.saleDetail.productId,
                  },
                },
                create: {
                  warehouseId:
                    centralWarehouse.id,
                  productId:
                    item.saleDetail.productId,
                  stock: item.quantity,
                },
                update: {
                  stock: {
                    increment:
                      item.quantity,
                  },
                },
                select: {
                  stock: true,
                },
              });

            await prisma.inventoryMovement.create({
              data: {
                warehouseId:
                  centralWarehouse.id,
                productId:
                  item.saleDetail.productId,
                userId,
                type: $Enums.InventoryMovementType.SALE_RETURN_IN,
                quantity: item.quantity,
                previousStock:
                  centralStock?.stock || 0,
                newStock:
                  updatedCentralStock.stock,
                referenceId:
                  saleReturn.id,
                observations: `Devolución de venta ${sale.saleNumber}`,
              },
            });
          }

          const newSubtotal =
            this.roundMoney(
              sale.subtotal -
                returnTotal,
            );

          const newTotal = this.roundMoney(
            Math.max(
              newSubtotal -
                sale.discount,
              0,
            ),
          );

          const paidAmount =
            await this.getPaidAmount(
              saleId,
              prisma,
            );

          if (paidAmount > newTotal) {
            throw new BadRequestException(
              'La devolución dejaría la venta con un total menor al monto pagado. Revierte primero el excedente',
            );
          }

          await prisma.sale.update({
            where: {
              id: saleId,
            },
            data: {
              subtotal: newSubtotal,
              total: newTotal,
              paymentStatus:
                this.calculatePaymentStatus(
                  newTotal,
                  paidAmount,
                ),
            },
          });

          return saleReturn;
        },
      );

    return {
      message:
        'Devolución registrada correctamente',
      return: result,
      sale: await this.findOne(saleId),
    };
  }

  async findAll(filters?: {
    status?: $Enums.SaleStatus;
    paymentStatus?: $Enums.PaymentStatus;
    clientId?: string;
    userId?: number;
    withDebt?: boolean;
    dateFrom?: Date;
    dateTo?: Date;
  }): Promise<SaleResponseDto[]> {
    const where: any = {};

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.paymentStatus) {
      where.paymentStatus =
        filters.paymentStatus;
    }

    if (filters?.clientId) {
      where.clientId = filters.clientId;
    }

    if (filters?.userId) {
      where.userId = filters.userId;
    }

    if (filters?.withDebt) {
      where.paymentStatus = {
        in: [
          $Enums.PaymentStatus.PENDING,
          $Enums.PaymentStatus.PARTIALLY_PAID,
        ],
      };

      where.status = {
        not: $Enums.SaleStatus.CANCELLED,
      };
    }

    if (
      filters?.dateFrom ||
      filters?.dateTo
    ) {
      where.date = {};

      if (filters.dateFrom) {
        where.date.gte =
          filters.dateFrom;
      }

      if (filters.dateTo) {
        where.date.lte =
          filters.dateTo;
      }
    }

    const sales =
      await this.prisma.sale.findMany({
        where,
        include: this.saleInclude(),
        orderBy: {
          date: 'desc',
        },
      });

    return Promise.all(
      sales.map((sale) =>
        this.toResponse(sale),
      ),
    );
  }

  async findOne(
    id: string,
  ): Promise<SaleResponseDto> {
    const sale =
      await this.prisma.sale.findUnique({
        where: {
          id,
        },
        include: this.saleInclude(),
      });

    if (!sale) {
      throw new NotFoundException(
        'Venta no encontrada',
      );
    }

    return this.toResponse(sale);
  }

  async getLowStockProducts() {
    const centralWarehouse =
      await this.getCentralWarehouse();
    const stocks =
      await this.prisma.warehouseStock.findMany({
        where: {
          warehouseId: centralWarehouse.id,
        },
        include: {
          product: true,
        },
        orderBy: {
          product: {
            name: 'asc',
          },
        },
      });

    return stocks
      .map((stock) => ({
        ...stock.product,
        stock: stock.stock,
        reservedStock:
          stock.reservedStock,
        availableStock:
          stock.stock -
          stock.reservedStock,
      }))
      .filter(
        (product) =>
          product.availableStock <=
          product.minStock,
      );
  }
}
