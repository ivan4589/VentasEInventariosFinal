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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { $Enums } from '../../generated/prisma/client';
import { PERMISSIONS } from '../auth/authorization/permissions';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdatePurchasePriceDto } from './dto/update-purchase-price.dto';
import { CancelEconomicOperationDto } from '../economic-integrity/dto/cancel-economic-operation.dto';
import { ProductsService } from './products.service';
import { ObjectStorageService } from '../storage/object-storage.service';

@Controller('products')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly storage: ObjectStorageService,
  ) {}

  @Get()
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR, $Enums.Role.COBRADOR)
  @Permissions(PERMISSIONS.PRODUCTS_VIEW)
  async findAll(
    @Request() req: any,
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

  @Get(':id')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR, $Enums.Role.COBRADOR)
  @Permissions(PERMISSIONS.PRODUCTS_VIEW)
  async findOne(@Param('id') id: string, @Request() req: any) {
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
  create(@Body() createProductDto: CreateProductDto, @Request() req: any) {
    return this.productsService.create(createProductDto, req.user.id);
  }

  @Patch(':id')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.PRODUCTS_MANAGE)
  update(
    @Param('id') id: string,
    @Body() updateProductDto: UpdateProductDto,
    @Request() req: any,
  ) {
    return this.productsService.update(id, updateProductDto, req.user.id);
  }

  @Patch(':id/deactivate')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.PRODUCTS_MANAGE)
  deactivate(
    @Param('id') id: string,
    @Body() dto: CancelEconomicOperationDto,
    @Request() req: any,
  ) {
    return this.productsService.remove(id, req.user.id, dto.reason);
  }

  @Patch(':id/reactivate')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.PRODUCTS_MANAGE)
  reactivate(
    @Param('id') id: string,
    @Body() dto: CancelEconomicOperationDto,
    @Request() req: any,
  ) {
    return this.productsService.reactivate(id, req.user.id, dto.reason);
  }

  @Patch(':id/purchase-price')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.PRODUCTS_VIEW_COSTS, PERMISSIONS.PRODUCTS_MANAGE)
  updatePurchasePrice(
    @Param('id') id: string,
    @Body() dto: UpdatePurchasePriceDto,
    @Request() req: any,
  ) {
    return this.productsService.updatePurchasePrice(
      id,
      dto.purchasePrice,
      req.user.id,
      dto.reason,
    );
  }

  private toRoleView(product: any, role: $Enums.Role) {
    if (role === $Enums.Role.ADMIN) return product;
    const {
      purchasePrice: _purchasePrice,
      markupNormal: _markupNormal,
      markupCamino: _markupCamino,
      markupEspecial: _markupEspecial,
      markupMayorista: _markupMayorista,
      ...safeProduct
    } = product;
    return safeProduct;
  }
}
