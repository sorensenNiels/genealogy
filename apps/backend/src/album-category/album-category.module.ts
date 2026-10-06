import { Module } from "@nestjs/common";

import { AlbumCategoryRouter } from "./album-category.router.js";
import { AlbumCategoryService } from "./album-category.service.js";

@Module({
  providers: [AlbumCategoryService, AlbumCategoryRouter],
  exports: [AlbumCategoryRouter],
})
export class AlbumCategoryModule {}
