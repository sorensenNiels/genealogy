import {
  createNameVariantSchema,
  createPersonEventSchema,
  createPersonSchema,
  createUnionSchema,
  genderSchema,
  nameVariantIdSchema,
  parentageSchema,
  personEventIdSchema,
  personIdSchema,
  unionIdSchema,
  updateNameVariantSchema,
  updatePersonEventSchema,
  updatePersonSchema,
  updateUnionSchema,
} from "@genealogy/core";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { trpcProxy } from "../trpc-proxy-client";

// Mirrors apps/backend/src/person/person.router.ts's local `listInput` —
// re-validating here is redundant with apps/backend's own validation, but
// consistent with how every other server function boundary in this app
// validates its own input before proxying. Every filter beyond `search`
// defaults to "off", so existing callers that only ever pass
// `{limit, offset, search}` (the Profile page's person picker, AddRelative's
// combobox) keep working unchanged.
const listInput = z.object({
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
  search: z.string().nullable().default(null),
  gender: genderSchema.nullable().default(null),
  place: z.string().nullable().default(null),
  bornAfter: z.iso.date().nullable().default(null),
  bornBefore: z.iso.date().nullable().default(null),
  hasCitation: z.boolean().default(false),
  missingBirthRecord: z.boolean().default(false),
  hasOpenResearchNote: z.boolean().default(false),
  directAncestorsOnly: z.boolean().default(false),
  sort: z.enum(["surname_asc", "given_asc", "birth_asc", "birth_desc"]).default("surname_asc"),
});

export const listPersons = createServerFn({ method: "GET" })
  .validator(listInput)
  .handler(({ data }) => trpcProxy.person.list.query(data));

export const createPerson = createServerFn({ method: "POST" })
  .validator(createPersonSchema)
  .handler(({ data }) => trpcProxy.person.create.mutate(data));

const mergeInput = z.object({ keepId: personIdSchema, removeId: personIdSchema });

/** What merging `removeId` into `keepId` would move, and anything that blocks it — writes nothing. */
export const getMergePreview = createServerFn({ method: "GET" })
  .validator(mergeInput)
  .handler(({ data }) => trpcProxy.person.mergePreview.query(data));

export const mergePerson = createServerFn({ method: "POST" })
  .validator(mergeInput)
  .handler(({ data }) => trpcProxy.person.merge.mutate(data));

export const removePerson = createServerFn({ method: "POST" })
  .validator(z.object({ id: personIdSchema }))
  .handler(({ data }) => trpcProxy.person.remove.mutate(data));

export const getPersonById = createServerFn({ method: "GET" })
  .validator(z.object({ id: personIdSchema }))
  .handler(({ data }) => trpcProxy.person.byId.query(data));

export const getRelatives = createServerFn({ method: "GET" })
  .validator(z.object({ id: personIdSchema }))
  .handler(({ data }) => trpcProxy.person.relatives.query(data));

// Mirrors apps/backend/src/person/person.router.ts's local `treeInput`.
const treeInput = z.object({
  id: personIdSchema,
  ancestorGenerations: z.number().int().min(0).max(15).default(4),
  descendantGenerations: z.number().int().min(0).max(15).default(4),
});

export const getTree = createServerFn({ method: "GET" })
  .validator(treeInput)
  .handler(({ data }) => trpcProxy.person.tree.query(data));

export const updatePerson = createServerFn({ method: "POST" })
  .validator(updatePersonSchema)
  .handler(({ data }) => trpcProxy.person.update.mutate(data));

export const listTitlePrefixes = createServerFn({ method: "GET" }).handler(() =>
  trpcProxy.person.listTitlePrefixes.query(),
);

export const listSuffixes = createServerFn({ method: "GET" }).handler(() =>
  trpcProxy.person.listSuffixes.query(),
);

const byPersonId = z.object({ personId: personIdSchema });

export const listNames = createServerFn({ method: "GET" })
  .validator(byPersonId)
  .handler(({ data }) => trpcProxy.person.listNames.query(data));

export const listEvents = createServerFn({ method: "GET" })
  .validator(byPersonId)
  .handler(({ data }) => trpcProxy.person.listEvents.query(data));

export const listUnions = createServerFn({ method: "GET" })
  .validator(byPersonId)
  .handler(({ data }) => trpcProxy.person.listUnions.query(data));

const linkParentInput = z.object({
  parentId: personIdSchema,
  childId: personIdSchema,
  parentage: parentageSchema.default("unknown"),
});

export const linkParent = createServerFn({ method: "POST" })
  .validator(linkParentInput)
  .handler(({ data }) => trpcProxy.person.linkParent.mutate(data));

const spousePairInput = z.object({ aId: personIdSchema, bId: personIdSchema });

export const linkSpouse = createServerFn({ method: "POST" })
  .validator(spousePairInput)
  .handler(({ data }) => trpcProxy.person.linkSpouse.mutate(data));

export const unlinkParent = createServerFn({ method: "POST" })
  .validator(z.object({ parentId: personIdSchema, childId: personIdSchema }))
  .handler(({ data }) => trpcProxy.person.unlinkParent.mutate(data));

export const unlinkSpouse = createServerFn({ method: "POST" })
  .validator(spousePairInput)
  .handler(({ data }) => trpcProxy.person.unlinkSpouse.mutate(data));

export const addName = createServerFn({ method: "POST" })
  .validator(createNameVariantSchema)
  .handler(({ data }) => trpcProxy.person.addName.mutate(data));

export const updateName = createServerFn({ method: "POST" })
  .validator(updateNameVariantSchema)
  .handler(({ data }) => trpcProxy.person.updateName.mutate(data));

export const removeName = createServerFn({ method: "POST" })
  .validator(z.object({ id: nameVariantIdSchema }))
  .handler(({ data }) => trpcProxy.person.removeName.mutate(data));

export const addEvent = createServerFn({ method: "POST" })
  .validator(createPersonEventSchema)
  .handler(({ data }) => trpcProxy.person.addEvent.mutate(data));

export const updateEvent = createServerFn({ method: "POST" })
  .validator(updatePersonEventSchema)
  .handler(({ data }) => trpcProxy.person.updateEvent.mutate(data));

export const removeEvent = createServerFn({ method: "POST" })
  .validator(z.object({ id: personEventIdSchema }))
  .handler(({ data }) => trpcProxy.person.removeEvent.mutate(data));

export const addUnion = createServerFn({ method: "POST" })
  .validator(createUnionSchema)
  .handler(({ data }) => trpcProxy.person.addUnion.mutate(data));

export const updateUnion = createServerFn({ method: "POST" })
  .validator(updateUnionSchema)
  .handler(({ data }) => trpcProxy.person.updateUnion.mutate(data));

export const removeUnion = createServerFn({ method: "POST" })
  .validator(z.object({ id: unionIdSchema }))
  .handler(({ data }) => trpcProxy.person.removeUnion.mutate(data));
