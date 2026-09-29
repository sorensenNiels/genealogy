import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";

import { NotificationModule } from "../notification/notification.module.js";
import { AlbumZipProcessor } from "./album-zip.processor.js";
import { ALBUM_ZIP_QUEUE, AlbumZipService } from "./album-zip.service.js";
import { ImmichAssetController } from "./immich-asset.controller.js";
import { ImmichFaceScanProcessor } from "./immich-face-scan.processor.js";
import { ImmichRouter } from "./immich.router.js";
import { IMMICH_FACE_SCAN_QUEUE, ImmichService } from "./immich.service.js";

@Module({
  imports: [
    BullModule.registerQueue({ name: IMMICH_FACE_SCAN_QUEUE }, { name: ALBUM_ZIP_QUEUE }),
    NotificationModule,
  ],
  controllers: [ImmichAssetController],
  providers: [
    ImmichService,
    ImmichRouter,
    ImmichFaceScanProcessor,
    AlbumZipService,
    AlbumZipProcessor,
  ],
  exports: [ImmichRouter, ImmichService],
})
export class ImmichModule {}
