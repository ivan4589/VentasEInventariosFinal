from pathlib import Path


def replace(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding='utf-8')
    if old not in text:
        if new in text:
            return
        raise SystemExit(f'No se encontró el bloque esperado en {path}: {old[:120]!r}')
    file.write_text(text.replace(old, new, 1), encoding='utf-8')


replace(
    'src/economic-integrity/economic-integrity.service.ts',
    "import { PrismaService } from '../prisma/prisma.service';\n",
    "import { Prisma } from '../../generated/prisma/client';\nimport { PrismaService } from '../prisma/prisma.service';\n",
)
replace(
    'src/economic-integrity/economic-integrity.service.ts',
    '  details?: Record<string, unknown>;\n',
    '  details?: Prisma.InputJsonValue;\n',
)
replace(
    'src/sales/sales.service.ts',
    "      select: { id: true, saleId: true },\n",
    "      select: { id: true, saleId: true, amount: true },\n",
)
replace(
    'src/sales/sales.controller.ts',
    "      locks: [\n        `client:${dto.clientId}`,\n",
    "      locks: [\n        'sale-number-sequence',\n        `client:${dto.clientId}`,\n",
)

# Separa la consulta de idempotencia de las consultas findUnique usadas por
# las pruebas para devolver la entidad final.
replace(
    'src/warehouse-transfers/warehouse-transfers.service.ts',
    '    const existing = await this.prisma.warehouseTransfer.findUnique({\n      where: { idempotencyKey: operationKey },\n',
    '    const existing = await this.prisma.warehouseTransfer.findFirst({\n      where: { idempotencyKey: operationKey },\n',
)
replace(
    'src/purchases/purchases.service.ts',
    '    const existing = await this.prisma.purchase.findUnique({\n      where: { idempotencyKey: operationKey },\n',
    '    const existing = await this.prisma.purchase.findFirst({\n      where: { idempotencyKey: operationKey },\n',
)

replace(
    'src/warehouse-transfers/warehouse-transfers.service.spec.ts',
    '    warehouseTransfer: {\n      create: jest.fn().mockResolvedValue({ id: \'transfer_1\' }),\n',
    '    warehouseTransfer: {\n      create: jest.fn().mockResolvedValue({ id: \'transfer_1\' }),\n      findFirst: jest.fn().mockResolvedValue(null),\n',
)
replace(
    'src/purchases/purchases.service.spec.ts',
    '      purchase: {\n        create: jest.fn().mockImplementation(({ data }) => ({\n',
    '      purchase: {\n        findFirst: jest.fn().mockResolvedValue(null),\n        create: jest.fn().mockImplementation(({ data }) => ({\n',
)
