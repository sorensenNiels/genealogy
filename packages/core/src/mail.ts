import { z } from "zod";

/**
 * The fixed set of Handlebars templates `MailProcessor` knows how to render
 * (`apps/backend/src/mail/templates/*.hbs`) — never an arbitrary
 * caller-supplied filename, so there's no path-traversal surface onto the
 * templates directory. Same reasoning as a configurable-options key, except
 * this set is genuinely structural: adding a template is a code change (a
 * new .hbs file plus the context shape it expects), not something an admin
 * should be able to add at runtime.
 */
export const mailTemplateSchema = z.enum(["notification"]);
export type MailTemplate = z.infer<typeof mailTemplateSchema>;

export const sendMailSchema = z.object({
  to: z.email(),
  subject: z.string().trim().min(1),
  template: mailTemplateSchema,
  /** Handed to the template verbatim as its render context. */
  context: z.record(z.string(), z.unknown()).default({}),
});
export type SendMail = z.infer<typeof sendMailSchema>;
