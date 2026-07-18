import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import * as fs from 'fs';
import { $Enums } from '../../generated/prisma/client';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

const productImagesDir = join(process.cwd(), 'uploads', 'products');

function ensureProductImagesDir() {
  if (!fs.existsSync(productImagesDir)) {
    fs.mkdirSync(productImagesDir, { recursive: true });
  }
}

@Controller('products')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR, $Enums.Role.COBRADOR)
  findAll(
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
    @Query('providerId') providerId?: string,
  ) {
    if (search) return this.productsService.searchByName(search);
    if (categoryId) return this.productsService.findByCategory(categoryId);
    if (providerId) return this.productsService.findByProvider(providerId);
    return this.productsService.findAll();
  }

  @Get(':id')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR, $Enums.Role.COBRADOR)
  findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }

  @Post('upload-image')
  @Roles($Enums.Role.ADMIN)
  @UseInterceptors(
    FileInterceptor('image', {
      storage: diskStorage({
        destination: (_req, _file, callback) => {
          ensureProductImagesDir();
          callback(null, productImagesDir);
        },
        filename: (_req, file, callback) => {
          const safeOriginalName = file.originalname
            .replace(extname(file.originalname), '')
            .replace(/[^a-zA-Z0-9-_]/g, '_');

          const uniqueName = `${Date.now()}-${Math.round(
            Math.random() * 1e9,
          )}-${safeOriginalName}${extname(file.originalname).toLowerCase()}`;

          callback(null, uniqueName);
        },
      }),
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
      limits: {
        fileSize: 2 * 1024 * 1024,
      },
    }),
  )
  uploadImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Debes subir una imagen');
    }

    return {
      imageUrl: `/uploads/products/${file.filename}`,
    };
  }

  @Post()
  @Roles($Enums.Role.ADMIN)
  create(@Body() createProductDto: CreateProductDto) {
    return this.productsService.create(createProductDto);
  }

  @Patch(':id')
  @Roles($Enums.Role.ADMIN)
  update(@Param('id') id: string, @Body() updateProductDto: UpdateProductDto) {
    return this.productsService.update(id, updateProductDto);
  }

  @Delete(':id')
  @Roles($Enums.Role.ADMIN)
  remove(@Param('id') id: string) {
    return this.productsService.remove(id);
  }

  @Patch(':id/purchase-price')
  @Roles($Enums.Role.ADMIN)
  updatePurchasePrice(
    @Param('id') id: string,
    @Body('purchasePrice') purchasePrice: number,
  ) {
    return this.productsService.updatePurchasePrice(id, purchasePrice);
  }
}