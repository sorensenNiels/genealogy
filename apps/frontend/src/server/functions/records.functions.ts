import {
  personIdSchema,
  recordIdSchema,
  recordInputSchema,
  recordSearchInputSchema,
  recordTypeSchema,
} from "@genealogy/core";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { trpcProxy } from "../trpc-proxy-client";

export const getRecord = createServerFn({ method: "GET" })
  .validator(z.object({ id: recordIdSchema }))
  .handler(({ data }) => trpcProxy.records.get.query(data));

export const listPersonRecords = createServerFn({ method: "GET" })
  .validator(z.object({ personId: personIdSchema }))
  .handler(({ data }) => trpcProxy.records.forPerson.query(data));

export const listRecordSearches = createServerFn({ method: "GET" })
  .validator(z.object({ personId: personIdSchema }))
  .handler(({ data }) => trpcProxy.records.searches.query(data));

export const saveRecord = createServerFn({ method: "POST" })
  .validator(recordInputSchema)
  .handler(({ data }) => trpcProxy.records.save.mutate(data));

export const removeRecord = createServerFn({ method: "POST" })
  .validator(z.object({ id: recordIdSchema }))
  .handler(({ data }) => trpcProxy.records.remove.mutate(data));

const relationshipCandidateSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("parent"), parentId: personIdSchema, childId: personIdSchema }),
  z.object({ kind: z.literal("spouse"), aId: personIdSchema, bId: personIdSchema }),
]);

export const applyRecordSuggestion = createServerFn({ method: "POST" })
  .validator(z.object({ recordType: recordTypeSchema, link: relationshipCandidateSchema }))
  .handler(({ data }) => trpcProxy.records.applySuggestion.mutate(data));

export const markCensusNotFound = createServerFn({ method: "POST" })
  .validator(recordSearchInputSchema)
  .handler(({ data }) => trpcProxy.records.markNotFound.mutate(data));

export const clearCensusSearch = createServerFn({ method: "POST" })
  .validator(z.object({ personId: personIdSchema, censusKey: z.string().min(1) }))
  .handler(({ data }) => trpcProxy.records.clearSearch.mutate(data));
