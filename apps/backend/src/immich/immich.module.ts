import { Module } from "@nestjs/common";

import { ImmichAssetController } from "./immich-asset.controller.js";
import { ImmichRouter } from "./immich.router.js";
import { ImmichService } from "./immich.service.js";

@Module({
  controllers: [ImmichAssetController],
  providers: [ImmichService, ImmichRouter],
  exports: [ImmichRouter],
})
export class ImmichModule {}
