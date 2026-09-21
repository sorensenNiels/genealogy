import { Module } from "@nestjs/common";

import { PersonModule } from "../person/person.module.js";
import { SourceModule } from "../source/source.module.js";
import { TrpcRouter } from "./trpc.router.js";

@Module({
  imports: [PersonModule, SourceModule],
  providers: [TrpcRouter],
  exports: [TrpcRouter],
})
export class TrpcModule {}
