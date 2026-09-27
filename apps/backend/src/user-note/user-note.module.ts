import { Module } from "@nestjs/common";

import { UserNoteRouter } from "./user-note.router.js";
import { UserNoteService } from "./user-note.service.js";

@Module({
  providers: [UserNoteService, UserNoteRouter],
  exports: [UserNoteRouter],
})
export class UserNoteModule {}
