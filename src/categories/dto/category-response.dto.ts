export class CategoryResponseDto {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  subCategories?: {
    id: string;
    name: string;
    categoryId: string;
    createdAt: Date;
    updatedAt: Date;
  }[];
}