import type { AlbumCategory } from "@genealogy/core";
import { Button } from "@genealogy/ui/components/button";
import { Checkbox } from "@genealogy/ui/components/checkbox";
import { ColorSwatchPicker } from "@genealogy/ui/components/color-swatch-picker";
import { DialogFooter } from "@genealogy/ui/components/dialog";
import { FormDialog } from "@genealogy/ui/components/form-dialog";
import { Input } from "@genealogy/ui/components/input";
import { LabeledField } from "@genealogy/ui/components/labeled-field";
import { RemoveButton } from "@genealogy/ui/components/remove-button";
import { SaveButton } from "@genealogy/ui/components/save-button";
import { SectionCard } from "@genealogy/ui/components/section-card";
import { useFormDirtyPending } from "@genealogy/ui/hooks/use-form-dirty-pending";
import { cn } from "@genealogy/ui/lib/utils";
import { useForm, useStore } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PencilIcon, PlusIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import {
  createAlbumCategory,
  listAlbumCategories,
  removeAlbumCategory,
  updateAlbumCategory,
} from "../../server/functions/album-category.functions";

/** Brighter than the album cover palette on purpose — these only ever show as small dots and need to tell apart at a glance. */
export const ALBUM_CATEGORY_COLORS = [
  "#2563eb",
  "#16a34a",
  "#d97706",
  "#dc2626",
  "#9333ea",
  "#0891b2",
  "#db2777",
  "#64748b",
];

const ALBUM_CATEGORIES_KEY = ["albumCategories"];

/** What the sidebar has selected: every album, only uncategorised ones, or one category's id. */
export type AlbumCategorySelection = "all" | "uncategorised" | (string & {});

export function useAlbumCategories() {
  return useQuery({ queryKey: ALBUM_CATEGORIES_KEY, queryFn: () => listAlbumCategories() });
}

/** Categories and album membership both change the album list's grouping, so every category write refreshes both. */
function useRefreshCategories() {
  const queryClient = useQueryClient();
  return async () => {
    await queryClient.invalidateQueries({ queryKey: ALBUM_CATEGORIES_KEY });
    await queryClient.invalidateQueries({ queryKey: ["immich", "listAlbums"] });
  };
}

export function CategoryDot({ color, className }: { color: string; className?: string }) {
  return (
    <span
      className={cn("inline-block size-2.5 shrink-0 rounded-full", className)}
      style={{ background: color }}
      aria-hidden="true"
    />
  );
}

/**
 * The sidebar's category list. Counts come from `albums` — the album list
 * with every *other* filter applied but not the category one — so each
 * number says how many albums picking that category would show right now.
 */
export function CategoriesPanel({
  categories,
  albums,
  selected,
  onSelect,
}: {
  categories: AlbumCategory[];
  albums: { categoryIds: string[] }[];
  selected: AlbumCategorySelection;
  onSelect: (selection: AlbumCategorySelection) => void;
}) {
  const { t } = useTranslation();

  const counts = new Map<string, number>();
  let uncategorised = 0;
  for (const album of albums) {
    if (album.categoryIds.length === 0) uncategorised += 1;
    for (const id of album.categoryIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  return (
    <SectionCard
      className="h-fit"
      title={t("albumCategories.title")}
      titleClassName="text-base"
      contentClassName="space-y-2"
      action={
        <CategoryFormDialog
          trigger={
            <Button type="button" variant="ghost" size="icon" aria-label={t("albumCategories.new")}>
              <PlusIcon className="size-4" />
            </Button>
          }
          onSaved={(category) => onSelect(category.id)}
        />
      }
    >
      {categories.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("albumCategories.empty")}</p>
      ) : (
        <ul className="-mx-2 space-y-0.5">
          <CategoryRow
            label={t("albumCategories.all")}
            count={albums.length}
            isSelected={selected === "all"}
            onPress={() => onSelect("all")}
          />
          {categories.map((category) => (
            <CategoryRow
              key={category.id}
              label={category.name}
              color={category.color}
              count={counts.get(category.id) ?? 0}
              isSelected={selected === category.id}
              onPress={() => onSelect(category.id)}
              edit={
                <CategoryFormDialog
                  category={category}
                  trigger={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                      aria-label={t("albumCategories.editAria", { name: category.name })}
                    >
                      <PencilIcon className="size-3.5" />
                    </Button>
                  }
                  onSaved={() => undefined}
                  onDeleted={() => {
                    if (selected === category.id) onSelect("all");
                  }}
                />
              }
            />
          ))}
          <CategoryRow
            label={t("albumCategories.uncategorised")}
            count={uncategorised}
            isSelected={selected === "uncategorised"}
            onPress={() => onSelect("uncategorised")}
            isMuted
          />
        </ul>
      )}
    </SectionCard>
  );
}

function CategoryRow({
  label,
  color,
  count,
  isSelected,
  onPress,
  edit,
  isMuted = false,
}: {
  label: string;
  color?: string;
  count: number;
  isSelected: boolean;
  onPress: () => void;
  edit?: ReactNode;
  isMuted?: boolean;
}) {
  return (
    <li className="group flex items-center gap-1">
      {/* The row's select button and its edit button are siblings, not
          nested — React Aria doesn't allow one pressable inside another. */}
      <button
        type="button"
        aria-pressed={isSelected}
        onClick={onPress}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
          isSelected && "bg-accent font-medium",
          isMuted && !isSelected && "text-muted-foreground",
        )}
      >
        {color ? <CategoryDot color={color} /> : <span className="size-2.5 shrink-0" />}
        <span className="truncate">{label}</span>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">{count}</span>
      </button>
      {edit ?? <span className="size-7 shrink-0" />}
    </li>
  );
}

/** Create (no `category`) or edit/delete (with one). */
function CategoryFormDialog({
  category,
  trigger,
  onSaved,
  onDeleted,
}: {
  category?: AlbumCategory;
  trigger: ReactNode;
  onSaved: (category: AlbumCategory) => void;
  onDeleted?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <FormDialog
      trigger={trigger}
      title={category ? t("albumCategories.editTitle") : t("albumCategories.newTitle")}
    >
      {(close) => (
        <CategoryForm
          category={category}
          onDone={(saved) => {
            close();
            onSaved(saved);
          }}
          onDeleted={() => {
            close();
            onDeleted?.();
          }}
        />
      )}
    </FormDialog>
  );
}

function CategoryForm({
  category,
  onDone,
  onDeleted,
}: {
  category: AlbumCategory | undefined;
  onDone: (category: AlbumCategory) => void;
  onDeleted: () => void;
}) {
  const { t } = useTranslation();
  const refresh = useRefreshCategories();
  const saveMutation = useMutation({
    mutationFn: (value: { name: string; color: string }) =>
      category
        ? updateAlbumCategory({ data: { id: category.id, ...value } })
        : createAlbumCategory({ data: value }),
  });
  const removeMutation = useMutation({
    mutationFn: removeAlbumCategory,
    onSuccess: async () => {
      await refresh();
      onDeleted();
    },
  });

  const form = useForm({
    defaultValues: {
      name: category?.name ?? "",
      color: category?.color ?? ALBUM_CATEGORY_COLORS[0]!,
    },
    onSubmit: async ({ value }) => {
      const saved = await saveMutation.mutateAsync({ name: value.name.trim(), color: value.color });
      await refresh();
      onDone(saved);
    },
  });
  const { isDirty, isSubmitting } = useFormDirtyPending(form);
  const name = useStore(form.store, (state) => state.values.name);
  const color = useStore(form.store, (state) => state.values.color);
  const error = saveMutation.error ?? removeMutation.error;

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <LabeledField label={t("albumCategories.name")} asDiv>
        <form.Field name="name">
          {(field) => (
            <Input
              aria-label={t("albumCategories.name")}
              placeholder={t("albumCategories.namePlaceholder")}
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
            />
          )}
        </form.Field>
      </LabeledField>
      <LabeledField label={t("albumCategories.color")} asDiv>
        <ColorSwatchPicker
          aria-label={t("albumCategories.color")}
          value={color}
          onChange={(value) => form.setFieldValue("color", value)}
          colors={ALBUM_CATEGORY_COLORS}
        />
      </LabeledField>
      {error && <p className="text-sm text-destructive">{error.message}</p>}
      <DialogFooter className={category ? "sm:justify-between" : undefined}>
        {category && (
          <RemoveButton
            itemLabel={category.name}
            title={t("albumCategories.deleteTitle", { name: category.name })}
            description={t("albumCategories.deleteDescription")}
            actionLabel={t("common.delete")}
            onConfirm={() => removeMutation.mutate({ data: { id: category.id } })}
            trigger={
              <Button type="button" variant="ghost" className="text-destructive">
                {t("albumCategories.delete")}
              </Button>
            }
          />
        )}
        <SaveButton isDirty={isDirty} isPending={isSubmitting} isDisabled={name.trim() === ""}>
          {category ? t("common.save") : t("albumCategories.create")}
        </SaveButton>
      </DialogFooter>
    </form>
  );
}

/**
 * Category checkboxes for the New/Edit album dialogs, plus a field to create
 * a category on the spot (checked straight away) — so organizing an album
 * never needs a detour to the sidebar first.
 */
export function AlbumCategoryPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (categoryIds: string[]) => void;
}) {
  const { t } = useTranslation();
  const categories = useAlbumCategories();
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");
  const createMutation = useMutation({
    mutationFn: createAlbumCategory,
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ALBUM_CATEGORIES_KEY });
      onChange([...value, created.id]);
      setNewName("");
    },
  });

  const list = categories.data ?? [];
  const add = () => {
    const name = newName.trim();
    if (name === "" || createMutation.isPending) return;
    createMutation.mutate({
      data: { name, color: ALBUM_CATEGORY_COLORS[list.length % ALBUM_CATEGORY_COLORS.length]! },
    });
  };

  return (
    <div className="space-y-2">
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("albumCategories.pickerEmpty")}</p>
      ) : (
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {list.map((category) => (
            <Checkbox
              key={category.id}
              isSelected={value.includes(category.id)}
              onChange={(isSelected) =>
                onChange(
                  isSelected ? [...value, category.id] : value.filter((id) => id !== category.id),
                )
              }
            >
              <CategoryDot color={category.color} />
              {category.name}
            </Checkbox>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input
          aria-label={t("albumCategories.newPlaceholder")}
          placeholder={t("albumCategories.newPlaceholder")}
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          onKeyDown={(event) => {
            // Enter here means "add this category", not "submit the album form" this picker sits inside.
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          onPress={add}
          isDisabled={newName.trim() === "" || createMutation.isPending}
        >
          {t("albumCategories.add")}
        </Button>
      </div>
      {createMutation.isError && (
        <p className="text-sm text-destructive">{createMutation.error.message}</p>
      )}
    </div>
  );
}
