import {
  externalIdUrl,
  personExternalIdSystemSchema,
  type PersonExternalId,
  type PersonExternalIdSystem,
} from "@genealogy/core";
import { Button } from "@genealogy/ui/components/button";
import { DialogFooter } from "@genealogy/ui/components/dialog";
import { FormDialog } from "@genealogy/ui/components/form-dialog";
import { Input } from "@genealogy/ui/components/input";
import { LabeledField } from "@genealogy/ui/components/labeled-field";
import { RemoveButton } from "@genealogy/ui/components/remove-button";
import { SaveButton } from "@genealogy/ui/components/save-button";
import { SectionCard } from "@genealogy/ui/components/section-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@genealogy/ui/components/select";
import { Tooltip, TooltipContent } from "@genealogy/ui/components/tooltip";
import { useFormDirtyPending } from "@genealogy/ui/hooks/use-form-dirty-pending";
import { useForm, useStore } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLinkIcon, PlusIcon, XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  addExternalId,
  listExternalIds,
  removeExternalId,
} from "../../server/functions/external-id.functions";

/** Systems whose ids carry a TYPE worth asking for — REFN's kind, EXID's authority. */
const TYPED_SYSTEMS: ReadonlySet<PersonExternalIdSystem> = new Set(["refn", "exid"]);

/**
 * This person's ids in other systems — FamilySearch, Ancestry, a reference
 * number, a GEDCOM 7 EXID — mostly filled by GEDCOM import and written back
 * on export. A FamilySearch tree id links straight to its profile.
 */
export function ExternalIdsCard({ personId }: { personId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const queryKey = ["externalId", "list", personId];
  const ids = useQuery({ queryKey, queryFn: () => listExternalIds({ data: { personId } }) });
  const removeMutation = useMutation({
    mutationFn: removeExternalId,
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  return (
    <SectionCard
      title={t("person.externalIds.title")}
      titleClassName="text-base"
      contentClassName="space-y-2"
      action={
        <FormDialog
          trigger={
            <Tooltip>
              <Button variant="outline" size="icon" aria-label={t("person.externalIds.add")}>
                <PlusIcon className="size-4" />
              </Button>
              <TooltipContent>{t("person.externalIds.add")}</TooltipContent>
            </Tooltip>
          }
          title={t("person.externalIds.add")}
        >
          {(close) => (
            <ExternalIdForm
              personId={personId}
              onDone={async () => {
                close();
                await queryClient.invalidateQueries({ queryKey });
              }}
            />
          )}
        </FormDialog>
      }
    >
      {ids.data?.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("person.externalIds.empty")}</p>
      )}
      {ids.data?.map((id) => (
        <ExternalIdRow
          key={id.id}
          externalId={id}
          isRemoving={removeMutation.isPending}
          onRemove={() => removeMutation.mutate({ data: { id: id.id } })}
        />
      ))}
      {removeMutation.isError && (
        <p className="text-sm text-destructive">{removeMutation.error.message}</p>
      )}
    </SectionCard>
  );
}

function ExternalIdRow({
  externalId,
  isRemoving,
  onRemove,
}: {
  externalId: PersonExternalId;
  isRemoving: boolean;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const url = externalIdUrl(externalId);
  const systemLabel = t(`person.externalIds.system.${externalId.system}`);
  return (
    <div className="group flex items-start justify-between gap-2 text-sm">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">
          {systemLabel}
          {externalId.type ? ` · ${externalId.type}` : ""}
        </p>
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-mono hover:underline"
          >
            {externalId.value}
            <ExternalLinkIcon className="size-3" aria-hidden="true" />
          </a>
        ) : (
          <p className="font-mono break-all">{externalId.value}</p>
        )}
      </div>
      <RemoveButton
        itemLabel={`${systemLabel} ${externalId.value}`}
        title={t("person.externalIds.removeTitle", { value: externalId.value })}
        actionLabel={t("common.remove")}
        onConfirm={onRemove}
        trigger={
          <Button
            variant="ghost"
            size="icon"
            className="size-6 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            aria-label={t("person.externalIds.removeAria", { value: externalId.value })}
            isDisabled={isRemoving}
          >
            <XIcon className="size-3.5" />
          </Button>
        }
      />
    </div>
  );
}

function ExternalIdForm({ personId, onDone }: { personId: string; onDone: () => Promise<void> }) {
  const { t } = useTranslation();
  const addMutation = useMutation({ mutationFn: addExternalId });
  const form = useForm({
    defaultValues: { system: "familysearch" as PersonExternalIdSystem, value: "", type: "" },
    onSubmit: async ({ value }) => {
      const type = value.type.trim();
      await addMutation.mutateAsync({
        data: {
          personId,
          system: value.system,
          value: value.value.trim(),
          type: TYPED_SYSTEMS.has(value.system) && type !== "" ? type : null,
        },
      });
      await onDone();
    },
  });
  const { isDirty, isSubmitting } = useFormDirtyPending(form);
  const system = useStore(form.store, (state) => state.values.system);
  const value = useStore(form.store, (state) => state.values.value);

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <LabeledField label={t("person.externalIds.systemLabel")} asDiv>
        <Select
          aria-label={t("person.externalIds.systemLabel")}
          value={system}
          onChange={(next) => {
            const parsed = personExternalIdSystemSchema.safeParse(next);
            if (parsed.success) form.setFieldValue("system", parsed.data);
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {personExternalIdSystemSchema.options.map((option) => (
              <SelectItem key={option} id={option}>
                {t(`person.externalIds.system.${option}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </LabeledField>
      <form.Field name="value">
        {(field) => (
          <LabeledField label={t("person.externalIds.value")} asDiv>
            <Input
              aria-label={t("person.externalIds.value")}
              placeholder={system === "familysearch" ? "LZXY-ABC" : undefined}
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
            />
          </LabeledField>
        )}
      </form.Field>
      {TYPED_SYSTEMS.has(system) && (
        <form.Field name="type">
          {(field) => (
            <LabeledField label={t("person.externalIds.type")} asDiv>
              <Input
                aria-label={t("person.externalIds.type")}
                placeholder={
                  system === "exid"
                    ? t("person.externalIds.typeExidHint")
                    : t("person.externalIds.typeRefnHint")
                }
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
              />
            </LabeledField>
          )}
        </form.Field>
      )}
      {addMutation.isError && (
        <p className="text-sm text-destructive">{addMutation.error.message}</p>
      )}
      <DialogFooter>
        <SaveButton isDirty={isDirty} isPending={isSubmitting} isDisabled={value.trim() === ""}>
          {t("common.add")}
        </SaveButton>
      </DialogFooter>
    </form>
  );
}
