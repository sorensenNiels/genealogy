import { randomBytes } from "node:crypto";

import {
  INVITATION_LIFETIME_DAYS,
  formatPersonName,
  type CreateInvitation,
  type MemberRole,
} from "@genealogy/core";
import { invitations, persons, user, userProfiles, type Database } from "@genealogy/db";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, count, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { hashInvitationToken } from "../auth/auth.module.js";
import { DRIZZLE } from "../database/database.module.js";
import { MailService } from "../mail/mail.service.js";

const ROLE_LABELS: Record<"en" | "da", Record<MemberRole, string>> = {
  en: { admin: "an admin", editor: "an editor", viewer: "a viewer" },
  da: { admin: "administrator", editor: "redaktør", viewer: "læser" },
};

export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

/**
 * Who's in, and who's invited. Sign-up itself is gated in better-auth's
 * create hook (`auth.module.ts`) — this service is the admin side: members'
 * roles, removing members, and the invitations that hook checks.
 */
@Injectable()
export class MembersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  async listMembers() {
    const rows = await this.db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
        personId: userProfiles.personId,
        personGiven: persons.given,
        personSurname: persons.surname,
      })
      .from(user)
      .leftJoin(userProfiles, eq(userProfiles.userId, user.id))
      .leftJoin(persons, eq(persons.id, userProfiles.personId))
      .orderBy(
        sql`case ${user.role} when 'admin' then 0 when 'editor' then 1 else 2 end`,
        user.name,
      );
    return rows.map(({ personGiven, personSurname, ...row }) => ({
      ...row,
      role: row.role as MemberRole,
      personName:
        personGiven !== null && personSurname !== null
          ? formatPersonName({ given: personGiven, surname: personSurname })
          : null,
    }));
  }

  async updateRole(userId: string, role: MemberRole): Promise<void> {
    if (role !== "admin") await this.assertNotLastAdmin(userId);
    const [row] = await this.db
      .update(user)
      .set({ role, updatedAt: new Date() })
      .where(eq(user.id, userId))
      .returning({ id: user.id });
    if (!row) throw new NotFoundException("No such member");
  }

  async removeMember(actorId: string, userId: string): Promise<void> {
    if (actorId === userId) throw new BadRequestException("You can't remove yourself");
    await this.assertNotLastAdmin(userId);
    // Cascades their sessions, accounts, profile, notes and notifications.
    await this.db.delete(user).where(eq(user.id, userId));
  }

  async listInvitations() {
    const inviter = alias(user, "inviter");
    const rows = await this.db
      .select({
        id: invitations.id,
        email: invitations.email,
        role: invitations.role,
        message: invitations.message,
        createdAt: invitations.createdAt,
        expiresAt: invitations.expiresAt,
        acceptedAt: invitations.acceptedAt,
        revokedAt: invitations.revokedAt,
        inviterName: inviter.name,
        personGiven: persons.given,
        personSurname: persons.surname,
      })
      .from(invitations)
      .leftJoin(inviter, eq(inviter.id, invitations.invitedBy))
      .leftJoin(persons, eq(persons.id, invitations.personId))
      .orderBy(desc(invitations.createdAt))
      .limit(100);
    return rows.map(({ personGiven, personSurname, ...row }) => ({
      ...row,
      role: row.role as MemberRole,
      status: invitationStatus(row),
      personName:
        personGiven !== null && personSurname !== null
          ? formatPersonName({ given: personGiven, surname: personSurname })
          : null,
    }));
  }

  /**
   * Creates the invitation and emails the link. The link is also returned —
   * once, since only its hash is stored — so the admin can pass it on by hand
   * when mail isn't configured. An earlier pending invitation for the same
   * address is revoked: one live link per person.
   */
  async createInvitation(actorId: string, input: CreateInvitation) {
    const [existing] = await this.db
      .select({ value: count() })
      .from(user)
      .where(sql`lower(${user.email}) = ${input.email}`);
    if ((existing?.value ?? 0) > 0) {
      throw new BadRequestException("Someone with that email address is already a member");
    }
    await this.db
      .update(invitations)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(invitations.email, input.email),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
        ),
      );
    const token = randomBytes(32).toString("base64url");
    const [row] = await this.db
      .insert(invitations)
      .values({
        email: input.email,
        role: input.role,
        personId: input.personId,
        message: input.message,
        invitedBy: actorId,
        tokenHash: hashInvitationToken(token),
        expiresAt: expiry(),
      })
      .returning({ id: invitations.id });
    return this.deliver(actorId, row!.id, token);
  }

  /** A fresh link (the old one stops working) with a fresh expiry, emailed again. */
  async resendInvitation(actorId: string, id: string) {
    const token = randomBytes(32).toString("base64url");
    const [row] = await this.db
      .update(invitations)
      .set({ tokenHash: hashInvitationToken(token), expiresAt: expiry(), revokedAt: null })
      .where(and(eq(invitations.id, id), isNull(invitations.acceptedAt)))
      .returning({ id: invitations.id });
    if (!row) throw new NotFoundException("No such pending invitation");
    return this.deliver(actorId, row.id, token);
  }

  async revokeInvitation(id: string): Promise<void> {
    await this.db
      .update(invitations)
      .set({ revokedAt: new Date() })
      .where(and(eq(invitations.id, id), isNull(invitations.acceptedAt)));
  }

  /**
   * What the public acceptance page shows for a link — read without being
   * signed in, so it says no more than the link's holder needs: who invited
   * them, as what, and to which address.
   */
  async describeInvitation(token: string) {
    const inviter = alias(user, "inviter");
    const [row] = await this.db
      .select({
        email: invitations.email,
        role: invitations.role,
        expiresAt: invitations.expiresAt,
        acceptedAt: invitations.acceptedAt,
        revokedAt: invitations.revokedAt,
        message: invitations.message,
        inviterName: inviter.name,
      })
      .from(invitations)
      .leftJoin(inviter, eq(inviter.id, invitations.invitedBy))
      .where(eq(invitations.tokenHash, hashInvitationToken(token)))
      .limit(1);
    if (!row) return null;
    return {
      email: row.email,
      role: row.role as MemberRole,
      inviterName: row.inviterName,
      message: row.message,
      status: invitationStatus(row),
    };
  }

  /** Sign-up is open only on an empty install (see the create hook in auth.module.ts). */
  async signupOpen(): Promise<boolean> {
    const [row] = await this.db.select({ value: count() }).from(user);
    return (row?.value ?? 0) === 0;
  }

  private async deliver(actorId: string, invitationId: string, token: string) {
    const [invitation] = await this.db
      .select()
      .from(invitations)
      .where(eq(invitations.id, invitationId));
    const [actor] = await this.db
      .select({ name: user.name, language: userProfiles.language })
      .from(user)
      .leftJoin(userProfiles, eq(userProfiles.userId, user.id))
      .where(eq(user.id, actorId));
    const link = `${this.config.getOrThrow<string>("APP_URL").replace(/\/$/, "")}/invite/${token}`;
    const language = actor?.language === "da" ? "da" : "en";
    const inviterName = actor?.name ?? "Someone";
    await this.mail.enqueueMail({
      to: invitation!.email,
      subject:
        language === "da"
          ? `${inviterName} har inviteret dig til slægtstræet`
          : `${inviterName} invited you to the family tree`,
      template: "invitation",
      context: {
        danish: language === "da",
        inviterName,
        roleLabel: ROLE_LABELS[language][invitation!.role as MemberRole],
        message: invitation!.message,
        link,
        email: invitation!.email,
        days: INVITATION_LIFETIME_DAYS,
      },
    });
    return { link, emailSent: this.mail.isConfigured() };
  }

  /** There must always be an admin left to manage members. */
  private async assertNotLastAdmin(userId: string): Promise<void> {
    const [target] = await this.db
      .select({ role: user.role })
      .from(user)
      .where(eq(user.id, userId));
    if (target?.role !== "admin") return;
    const [others] = await this.db
      .select({ value: count() })
      .from(user)
      .where(and(eq(user.role, "admin"), ne(user.id, userId)));
    if ((others?.value ?? 0) === 0) {
      throw new BadRequestException("There must always be at least one admin");
    }
  }
}

function expiry(): Date {
  return new Date(Date.now() + INVITATION_LIFETIME_DAYS * 24 * 60 * 60 * 1000);
}

function invitationStatus(row: {
  acceptedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date;
}): InvitationStatus {
  if (row.acceptedAt) return "accepted";
  if (row.revokedAt) return "revoked";
  return row.expiresAt.getTime() <= Date.now() ? "expired" : "pending";
}
