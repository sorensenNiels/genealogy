import { Module } from "@nestjs/common";

import { SearchRouter } from "./search.router.js";
import { SearchService } from "./search.service.js";

@Module({
  providers: [SearchService, SearchRouter],
  exports: [SearchRouter],
})
export class SearchModule {}
