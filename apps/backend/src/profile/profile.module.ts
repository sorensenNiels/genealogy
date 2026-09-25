import { Module } from "@nestjs/common";

import { ProfileRouter } from "./profile.router.js";
import { ProfileService } from "./profile.service.js";

@Module({
  providers: [ProfileService, ProfileRouter],
  exports: [ProfileRouter],
})
export class ProfileModule {}
