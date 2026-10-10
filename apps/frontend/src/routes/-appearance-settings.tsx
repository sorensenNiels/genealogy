import type { ThemeEntry } from "@genealogy/core";
import { Button } from "@genealogy/ui/components/button";
import { Dialog } from "@genealogy/ui/components/dialog";
import { RemoveButton } from "@genealogy/ui/components/remove-button";
import { SectionCard } from "@genealogy/ui/components/section-card";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PencilIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { themeStateQuery } from "../lib/queries";
import { removeTheme, setSiteTheme } from "../server/functions/theme.functions";
import { ThemePicker, ThemeSwatches, themeFontsLabel } from "./-theme-components";
import { ThemeEditor } from "./-theme-editor";

/**
 * Settings → Appearance: the family site's theme (everyone sees it unless
 * they've chosen their own on their profile), and the custom themes admins
 * make — each offered to every member alongside the built-ins.
 */
export function AppearanceSettingsPanel() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const state = useQuery(themeStateQuery());
  // `null` = closed; `"new"` = creating; otherwise the theme being edited.
  const [editing, setEditing] = useState<ThemeEntry | "new" | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["theme"] });
  const siteMutation = useMutation({ mutationFn: setSiteTheme, onSuccess: invalidate });
  const removeMutation = useMutation({ mutationFn: removeTheme, onSuccess: invalidate });

  if (!state.data) {
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  }
  const { themes, siteDefaultId } = state.data;
  const custom = themes.filter((theme) => !theme.builtIn);

  return (
    <div className="space-y-6">
      <SectionCard title={t("appearance.siteTheme")} description={t("appearance.siteThemeHelp")}>
        <ThemePicker
          aria-label={t("appearance.siteTheme")}
          themes={themes}
          value={siteDefaultId}
          onValueChange={(id) => siteMutation.mutate({ data: { id } })}
        />
        {siteMutation.isError && (
          <p className="mt-2 text-sm text-destructive">{siteMutation.error.message}</p>
        )}
      </SectionCard>

      <SectionCard
        title={t("appearance.customThemes")}
        description={t("appearance.customThemesHelp")}
        action={
          <Button variant="outline" size="sm" onClick={() => setEditing("new")}>
            <PlusIcon />
            {t("appearance.newTheme")}
          </Button>
        }
      >
        {custom.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("appearance.noCustomThemes")}</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-[repeat(auto-fill,minmax(14rem,1fr))]">
            {custom.map((theme) => (
              <li key={theme.id} className="overflow-hidden rounded-lg border bg-card">
                <div aria-hidden="true" className="border-b">
                  <ThemeSwatches theme={theme.definition} />
                </div>
                <div className="flex items-center justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{theme.definition.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {themeFontsLabel(theme.definition)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("appearance.editTheme", { name: theme.definition.name })}
                      onClick={() => setEditing(theme)}
                    >
                      <PencilIcon />
                    </Button>
                    <RemoveButton
                      itemLabel={`"${theme.definition.name}"`}
                      description={t("appearance.removeDescription")}
                      actionLabel={t("common.delete")}
                      onConfirm={() => removeMutation.mutate({ data: { id: theme.id } })}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {removeMutation.isError && (
          <p className="mt-2 text-sm text-destructive">{removeMutation.error.message}</p>
        )}
      </SectionCard>

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title={
          editing === "new" || editing === null
            ? t("appearance.newTheme")
            : t("appearance.editTitle")
        }
        className="sm:max-w-5xl"
      >
        {editing !== null && (
          <ThemeEditor
            theme={editing === "new" ? undefined : editing}
            themes={themes}
            onDone={() => setEditing(null)}
          />
        )}
      </Dialog>
    </div>
  );
}
