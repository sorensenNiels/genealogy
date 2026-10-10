import { Module } from "@nestjs/common";

import { SettingsModule } from "../settings/settings.module.js";
import { ThemeRouter } from "./theme.router.js";
import { ThemeService } from "./theme.service.js";

@Module({
  imports: [SettingsModule],
  providers: [ThemeService, ThemeRouter],
  exports: [ThemeRouter, ThemeService],
})
export class ThemeModule {}
