import { Inject, Injectable, Logger } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

import { AlbumCategoryRouter } from "../album-category/album-category.router.js";
import { AssociationRouter } from "../association/association.router.js";
import { AUTH, type Auth } from "../auth/auth.module.js";
import { BackupRouter } from "../backup/backup.router.js";
import { ExternalIdRouter } from "../external-id/external-id.router.js";
import { GedcomRouter } from "../gedcom/gedcom.router.js";
import { ImmichRouter } from "../immich/immich.router.js";
import { IntegrityRouter } from "../integrity/integrity.router.js";
import { MailRouter } from "../mail/mail.router.js";
import { MembersRouter } from "../members/members.router.js";
import { NotificationRouter } from "../notification/notification.router.js";
import { PersonRouter } from "../person/person.router.js";
import { ProfileRouter } from "../profile/profile.router.js";
import { ResearchNoteRouter } from "../research-note/research-note.router.js";
import { SettingsRouter } from "../settings/settings.router.js";
import { SourceRouter } from "../source/source.router.js";
import { UserNoteRouter } from "../user-note/user-note.router.js";
import { publicProcedure, router } from "./trpc.base.js";
import { createContextFactory } from "./trpc.context.js";

@Injectable()
export class TrpcRouter {
  private readonly logger = new Logger(TrpcRouter.name);

  constructor(
    private readonly person: PersonRouter,
    private readonly source: SourceRouter,
    private readonly settings: SettingsRouter,
    private readonly immich: ImmichRouter,
    private readonly profile: ProfileRouter,
    private readonly researchNote: ResearchNoteRouter,
    private readonly userNote: UserNoteRouter,
    private readonly mail: MailRouter,
    private readonly notification: NotificationRouter,
    private readonly backup: BackupRouter,
    private readonly gedcom: GedcomRouter,
    private readonly integrity: IntegrityRouter,
    private readonly association: AssociationRouter,
    private readonly albumCategory: AlbumCategoryRouter,
    private readonly externalId: ExternalIdRouter,
    private readonly members: MembersRouter,
    @Inject(AUTH) private readonly auth: Auth,
  ) {}

  build() {
    return router({
      health: publicProcedure.query(() => ({
        status: "ok" as const,
        checkedAt: new Date(),
      })),
      person: this.person.build(),
      source: this.source.build(),
      settings: this.settings.build(),
      immich: this.immich.build(),
      profile: this.profile.build(),
      researchNote: this.researchNote.build(),
      userNote: this.userNote.build(),
      mail: this.mail.build(),
      notification: this.notification.build(),
      backup: this.backup.build(),
      gedcom: this.gedcom.build(),
      integrity: this.integrity.build(),
      association: this.association.build(),
      albumCategory: this.albumCategory.build(),
      externalId: this.externalId.build(),
      members: this.members.build(),
    });
  }

  /** Mounts tRPC on the underlying Express instance at /trpc. */
  applyMiddleware(app: INestApplication): void {
    app.use(
      "/trpc",
      createExpressMiddleware({
        router: this.build(),
        createContext: createContextFactory(this.auth),
        onError: ({ path, type, error, ctx }) => {
          // `type` (query/mutation) and whether a session was on the context
          // are the two things needed to tell "this call was never
          // authenticated" apart from "the session check itself failed" —
          // both surface as the same UNAUTHORIZED message otherwise.
          const hasSession = ctx?.session != null;
          this.logger.error(
            `tRPC ${type} ${path ?? "<no path>"}: ${error.message} (session: ${hasSession})`,
            error.stack,
          );
        },
      }),
    );
  }
}

/**
 * The contract apps/frontend consumes. Inferred, never hand-written — that is the
 * whole point of tRPC, and it is why the web app depends on this package for
 * types only.
 */
export type AppRouter = ReturnType<TrpcRouter["build"]>;
