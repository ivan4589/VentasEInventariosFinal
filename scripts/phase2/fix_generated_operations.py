from pathlib import Path
import re


def replace(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding='utf-8')
    if old not in text:
        if new in text:
            return
        raise SystemExit(f'No se encontró el bloque esperado en {path}: {old[:120]!r}')
    file.write_text(text.replace(old, new, 1), encoding='utf-8')


def regex_replace(path: str, pattern: str, replacement: str, minimum: int = 1) -> None:
    file = Path(path)
    text = file.read_text(encoding='utf-8')
    updated, count = re.subn(pattern, replacement, text, flags=re.S)
    if count < minimum:
        raise SystemExit(f'No se encontró el patrón esperado en {path}: {pattern[:120]!r}')
    file.write_text(updated, encoding='utf-8')


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

# Las consultas de idempotencia usan findFirst para no interferir con los
# mocks de findUnique que representan la consulta final de cada entidad.
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

# Sincroniza las pruebas de transferencias con idempotencia y motivo obligatorio.
replace(
    'src/warehouse-transfers/warehouse-transfers.service.spec.ts',
    '    warehouseTransfer: {\n      create: jest.fn().mockResolvedValue({ id: \'transfer_1\' }),\n',
    '    warehouseTransfer: {\n      create: jest.fn().mockResolvedValue({ id: \'transfer_1\' }),\n      findFirst: jest.fn().mockResolvedValue(null),\n',
)
regex_replace(
    'src/warehouse-transfers/warehouse-transfers.service.spec.ts',
    r'(service\.create\(\s*\{.*?\}\s*,\s*1)(\s*,\s*[\'\"][^\'\"]+[\'\"])?(\s*\))',
    r"\1, 'transfer-test-key-001'\3",
    minimum=3,
)
regex_replace(
    'src/warehouse-transfers/warehouse-transfers.service.spec.ts',
    r'service\.cancel\(([^,\)]+),\s*1(?:,\s*[\'\"][^\'\"]+[\'\"])?\)',
    r"service.cancel(\1, 1, 'Motivo válido para anular la transferencia')",
    minimum=2,
)

# Sincroniza las pruebas de compras con la consulta idempotente.
replace(
    'src/purchases/purchases.service.spec.ts',
    '      purchase: {\n        create: jest.fn().mockImplementation(({ data }) => ({\n',
    '      purchase: {\n        findFirst: jest.fn().mockResolvedValue(null),\n        create: jest.fn().mockImplementation(({ data }) => ({\n',
)
regex_replace(
    'src/purchases/purchases.service.spec.ts',
    r'(service\.create\(\s*\{.*?\}\s*,\s*1)(\s*,\s*[\'\"][^\'\"]+[\'\"])?(\s*\))',
    r"\1, 'purchase-test-key-001'\3",
    minimum=2,
)
