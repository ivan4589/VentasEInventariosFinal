import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { $Enums } from '../../generated/prisma/client';
import { PERMISSIONS } from '../auth/authorization/permissions';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductResponseDto } from './dto/product-response.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdatePurchasePriceDto } from './dto/update-purchase-price.dto';
import { CancelEconomicOperationDto } from '../economic-integrity/dto/cancel-economic-operation.dto';
import { ProductsService } from './products.service';
import { ObjectStorageService } from '../storage/object-storage.service';
import { ProductSpreadsheetService } from '../spreadsheets/product-spreadsheet.service';
import {
  requireXlsxFile,
  xlsxUploadOptions,
} from '../spreadsheets/xlsx-upload';

interface AuthenticatedRequest {
  user: { id: number; role: $Enums.Role };
}

type RoleAwareProduct = ProductResponseDto & {
  markupNormal?: number;
  markupCamino?: number;
  markupEspecial?: number;
  markupMayorista?: number;
};

@Controller('products')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly storage: ObjectStorageService,
    private readonly spreadsheets: ProductSpreadsheetService,
  ) {}

  @Get()
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR, $Enums.Role.COBRADOR)
  @Permissions(PERMISSIONS.PRODUCTS_VIEW)
  async findAll(
    @Request() req: AuthenticatedRequest,
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
    @Query('providerId') providerId?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    const products = search
      ? await this.productsService.search(search)
      : categoryId
        ? await this.productsService.findByCategory(categoryId)
        : providerId
          ? await this.productsService.findByProvider(providerId)
          : await this.productsService.findAll(
              req.user.role === $Enums.Role.ADMIN && includeInactive === 'true',
            );
    return products.map((product) => this.toRoleView(product, req.user.role));
  }

  @Get('spreadsheet/template')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.PRODUCTS_MANAGE)
  async spreadsheetTemplate(@Res({ passthrough: true }) response: Response) {
    return this.xlsxResponse(
      await this.spreadsheets.template(),
      'plantilla-importacion-productos.xlsx',
      response,
    );
  }

  @Get('spreadsheet/export')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.PRODUCTS_MANAGE)
  async spreadsheetExport(@Res({ passthrough: true }) response: Response) {
    const date = new Date().toISOString().slice(0, 10);
    return this.xlsxResponse(
      await this.spreadsheets.export(),
      `productos-${date}.xlsx`,
      response,
    );
  }

  @Post('spreadsheet/preview')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.PRODUCTS_MANAGE)
  @UseInterceptors(FileInterceptor('file', xlsxUploadOptions))
  spreadsheetPreview(@UploadedFile() file?: Express.Multer.File) {
    return this.spreadsheets.preview(requireXlsxFile(file).buffer);
  }

  @Post('spreadsheet/import')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.PRODUCTS_MANAGE)
  @UseInterceptors(FileInterceptor('file', xlsxUploadOptions))
  spreadsheetImport(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Request() request: AuthenticatedRequest,
  ) {
    return this.spreadsheets.import(
      requireXlsxFile(file).buffer,
      request.user.id,
    );
  }

  @Get(':id')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR, $Enums.Role.COBRADOR)
  @Permissions(PERMISSIONS.PRODUCTS_VIEW)
  async findOne(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    const product = await this.productsService.findOne(
      id,
      req.user.role === $Enums.Role.ADMIN,
    );
    return this.toRoleView(product, req.user.role);
  }

  @Post('upload-image')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.PRODUCTS_MANAGE)
  @UseInterceptors(
    FileInterceptor('image', {
      fileFilter: (_req, file, callback) => {
        const allowedMimeTypes = [
          'image/jpeg',
          'image/jpg',
          'image/png',
          'image/webp',
        ];
        if (!allowedMimeTypes.includes(file.mimetype)) {
          return callback(
            new BadRequestException(
              'Formato de imagen no permitido. Usa JPG, JPEG, PNG o WEBP.',
            ),
            false,
          );
        }
        callback(null, true);
      },
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  async uploadImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Debes subir una imagen');
    const imageUrl = await this.storage.saveProductImage(
      file.originalname,
      file.mimetype,
      file.buffer,
    );
    return { imageUrl };
  }

  @Post()
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.PRODUCTS_MANAGE)
  create(
    @Body() createProductDto: CreateProductDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.productsService.create(createProductDto, req.user.id);
  }

  private xlsxResponse(buffer: Buffer, filename: string, response: Response) {
    response.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );
    response.setHeader('Cache-Control', 'no-store, private');
    return new StreamableFile(buffer);
  }

  @Patch(':id')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.PRODUCTS_MANAGE)
  update(
    @Param('id') id: string,
    @Body() updateProductDto: UpdateProductDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.productsService.update(id, updateProductDto, req.user.id);
  }

  @Patch(':id/deactivate')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.PRODUCTS_MANAGE)
  deactivate(
    @Param('id') id: string,
    @Body() dto: CancelEconomicOperationDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.productsService.remove(id, req.user.id, dto.reason);
  }

  @Patch(':id/reactivate')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.PRODUCTS_MANAGE)
  reactivate(
    @Param('id') id: string,
    @Body() dto: CancelEconomicOperationDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.productsService.reactivate(id, req.user.id, dto.reason);
  }

  @Patch(':id/purchase-price')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.PRODUCTS_VIEW_COSTS, PERMISSIONS.PRODUCTS_MANAGE)
  updatePurchasePrice(
    @Param('id') id: string,
    @Body() dto: UpdatePurchasePriceDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.productsService.updatePurchasePrice(
      id,
      dto.purchasePrice,
      req.user.id,
      dto.reason,
    );
  }

  private toRoleView(product: RoleAwareProduct, role: $Enums.Role) {
    if (role === $Enums.Role.ADMIN) return product;
    const safeProduct: Partial<RoleAwareProduct> = { ...product };
    delete safeProduct.purchasePrice;
    delete safeProduct.markupNormal;
    delete safeProduct.markupCamino;
    delete safeProduct.markupEspecial;
    delete safeProduct.markupMayorista;
    return safeProduct;
  }
}
