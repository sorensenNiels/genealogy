import { SectionCard } from "@genealogy/ui/components/section-card";

import { ParentsSection } from "./-family-parents-section";
import { RelativesSection } from "./-family-relatives-section";
import { SiblingsSection } from "./-family-siblings-section";
import type { ConfigurableOptionRow, ParentRow, PersonRow, UnionRow } from "./-types";

/**
 * Parents, Spouses, Children and Siblings, stacked as labeled subsections of
 * one card rather than four separate ones — same underlying sections/add
 * flows as before (`ParentsSection`/`RelativesSection`/`SiblingsSection`,
 * each in its own file), just sharing one `Card` frame so the four read as a
 * single "Family" group.
 */
export function FamilyCard({
  personId,
  parents,
  spouses,
  childRelatives,
  siblings,
  excludeIds,
  options,
  unions,
  onChanged,
}: {
  personId: string;
  parents: ParentRow[];
  spouses: PersonRow[];
  childRelatives: PersonRow[];
  siblings: PersonRow[];
  excludeIds: Set<string>;
  options: ConfigurableOptionRow[];
  unions: UnionRow[];
  onChanged: () => Promise<void>;
}) {
  return (
    <SectionCard title="Family" contentClassName="space-y-4">
      <ParentsSection
        personId={personId}
        parents={parents}
        excludeIds={excludeIds}
        options={options}
        onChanged={onChanged}
      />
      <div className="border-t pt-4">
        <RelativesSection
          title="Spouses"
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
          title="Children"
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
    </SectionCard>
  );
}
