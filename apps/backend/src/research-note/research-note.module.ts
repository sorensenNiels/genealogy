import { Module } from "@nestjs/common";

import { ResearchNoteRouter } from "./research-note.router.js";
import { ResearchNoteService } from "./research-note.service.js";

@Module({
  providers: [ResearchNoteService, ResearchNoteRouter],
  exports: [ResearchNoteRouter],
})
export class ResearchNoteModule {}
