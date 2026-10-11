import { SectionCard } from "@genealogy/ui/components/section-card";
import { useTranslation } from "react-i18next";

import { ExtendedFamilySection } from "./-family-extended-section";
import { ParentsSection } from "./-family-parents-section";
import { RelativesSection } from "./-family-relatives-section";
import { SiblingsSection } from "./-family-siblings-section";
import type {
  ConfigurableOptionRow,
  ParentRow,
  PersonRow,
  RelativesResult,
  SiblingRow,
  UnionRow,
} from "./-types";

/**
 * Parents, Spouses, Children and Siblings, stacked as labeled subsections of
 * one card rather than four separate ones — same underlying sections/add
 * flows as before (`ParentsSection`/`RelativesSection`/`SiblingsSection`,
 * each in its own file), just sharing one `Card` frame so the four read as a
 * single "Family" group. Step-relations and in-laws follow, read-only, when
 * the Family card scope in Settings → Person page includes them.
 */
export function FamilyCard({
  personId,
  parents,
  spouses,
  childRelatives,
  siblings,
  extended,
  excludeIds,
  options,
  unions,
  onChanged,
}: {
  personId: string;
  parents: ParentRow[];
  spouses: PersonRow[];
  childRelatives: PersonRow[];
  siblings: SiblingRow[];
  /** Step-relations and in-laws — empty lists unless Settings → Person page turns them on. */
  extended: RelativesResult | undefined;
  excludeIds: Set<string>;
  options: ConfigurableOptionRow[];
  unions: UnionRow[];
  onChanged: () => Promise<void>;
}) {
  const { t } = useTranslation();
  return (
    <SectionCard title={t("person.family.title")} contentClassName="space-y-4">
      <ParentsSection
        personId={personId}
        parents={parents}
        excludeIds={excludeIds}
        options={options}
        onChanged={onChanged}
      />
      <div className="border-t pt-4">
        <RelativesSection
          title={t("person.family.spouses")}
          kind="spouse"
          personId={personId}
          relatives={spouses}
          excludeIds={excludeIds}
          options={options}
          onChanged={onChanged}
          unions={unions}
        />
      </div>
      <div className="border-t pt-4">
        <RelativesSection
          title={t("person.family.children")}
          kind="child"
          personId={personId}
          relatives={childRelatives}
          excludeIds={excludeIds}
          options={options}
          onChanged={onChanged}
        />
      </div>
      <div className="border-t pt-4">
        <SiblingsSection
          siblings={siblings}
          parents={parents}
          excludeIds={excludeIds}
          options={options}
          onChanged={onChanged}
        />
      </div>
      {extended && <ExtendedFamilySection relatives={extended} />}
    </SectionCard>
  );
}
