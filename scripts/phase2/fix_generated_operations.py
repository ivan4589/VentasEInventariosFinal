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
