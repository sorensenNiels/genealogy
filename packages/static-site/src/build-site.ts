import {
  formatLifespan,
  formatPersonName,
  resolveHistoricalDate,
  themeDefinitionSchema,
  themeVariables,
  type HistoricalDate,
  type ThemeDefinition,
  type TreeChartKind,
  type TreeOrientation,
} from "@genealogy/core";

import { markdownToHtml } from "./markdown.js";
import { isRedactedOnSite, redactSiteData } from "./redact.js";
import { fill, SITE_STRINGS, type SiteStrings } from "./strings.js";
import { templates } from "./templates.js";
import type { TreeData, TreeDataPerson } from "./tree-data.js";
import type {
  SiteCitation,
  SiteData,
  SiteEvent,
  SiteFiles,
  SitePerson,
  SiteSource,
  SiteUnion,
} from "./types.js";

/** A publicId — letters and digits — is what makes a safe file name; anything else is refused rather than written. */
const SAFE_ID = /^[A-Za-z0-9_-]+$/;
/** Where the caller puts profile photos; a photo path elsewhere is refused. */
const SAFE_PHOTO = /^assets\/photos\/[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/;

const CHART_KINDS: TreeChartKind[] = ["relatives", "ancestors", "descendants"];
const ORIENTATIONS: TreeOrientation[] = ["vertical", "horizontal"];

/**
 * The whole static family website, as files by path — pure, no I/O, so
 * it's unit-tested with fixture data. The caller (apps/backend) adds the
 * tree viewer bundle (`readViewerAssets`) and the photos `SitePerson.photo`
 * points at, and zips the lot.
 *
 * - `index.html` — title, export date, privacy note, counts, a surname
 *   index, and everyone A–Z with a filter box.
 * - `tree.html` + `data/tree.js` — the interactive chart (`?person=<id>` to
 *   open on anyone).
 * - `people/<id>.html` — one per person.
 * - `sources.html` — every cited source, with an anchor each.
 * - `assets/theme.css` — the family site's theme as CSS variables.
 *
 * The privacy rule is applied here first (`redactSiteData`), whatever the
 * caller did.
 */
export function buildSite(input: SiteData): SiteFiles {
  const data = redactSiteData(input);
  for (const person of data.people) {
    if (!SAFE_ID.test(person.id)) throw new Error(`Unsafe person id: ${person.id}`);
    if (person.photo !== null && !SAFE_PHOTO.test(person.photo)) {
      throw new Error(`Unsafe photo path: ${person.photo}`);
    }
  }
  const site = new SiteContext(data);
  const files: SiteFiles = new Map();
  files.set("assets/theme.css", themeCss(data.theme));
  files.set("index.html", site.indexPage());
  files.set("tree.html", site.treePage());
  files.set("data/tree.js", `window.TREE_DATA = ${scriptJson(site.treeData())};\n`);
  files.set("sources.html", site.sourcesPage());
  for (const person of data.people) {
    files.set(`people/${person.id}.html`, site.personPage(person));
  }
  return files;
}

/**
 * The theme's variables, light by default and dark when the reader's system
 * asks for it — the site has no theme switch of its own. Validated again
 * here, as `themeToCss` does, so nothing but checked colors and bundled
 * font stacks reaches the stylesheet.
 */
export function themeCss(theme: ThemeDefinition): string {
  const safe = themeDefinitionSchema.parse(theme);
  const block = (mode: "light" | "dark") =>
    Object.entries(themeVariables(safe, mode))
      .map(([name, value]) => `${name}:${value};`)
      .join("");
  return `:root{color-scheme:light dark;${block("light")}}\n@media (prefers-color-scheme: dark){:root{${block("dark")}}}\n`;
}

/** JSON for a `<script>`-loaded file: `<` escaped so no value can end a script element, and the two line separators JSON allows but older JavaScript doesn't. */
function scriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(" ", "\\u2028")
    .replaceAll(" ", "\\u2029");
}

/**
 * What the index's filter box matches against: lower-cased, accents and the
 * Danish letters folded, so "sorensen" finds "Sørensen". The same folding
 * as `norm` in `FILTER_SCRIPT`, which applies it to what's typed.
 */
function searchText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .replaceAll("ø", "o")
    .replaceAll("æ", "ae")
    .replaceAll("å", "a");
}

function earliestOf(date: HistoricalDate | null): string {
  return date?.earliest ?? date?.latest ?? "9999";
}

interface Vitals {
  birth: SiteEvent | undefined;
  death: SiteEvent | undefined;
}

interface RelativeView {
  href: string;
  name: string;
  lifespan: string | null;
  note: string | null;
  details: string[];
  cites: number[];
  notesHtml: string | null;
  sortKey: string;
}

/** Numbers a page's citations in the order its facts cite them — the footnotes at the bottom. */
class Footnotes {
  readonly list: SiteCitation[] = [];

  cite(citations: readonly SiteCitation[]): number[] {
    return citations.map((citation) => this.list.push(citation));
  }
}

/** Lookups built once per site, shared by every page. */
class SiteContext {
  private readonly strings: SiteStrings;
  private readonly peopleById: Map<string, SitePerson>;
  private readonly vitals = new Map<string, Vitals>();
  private readonly sourcesById: Map<string, SiteSource>;
  /** `source-1`, `source-2`, … in title order. */
  private readonly sourceAnchors = new Map<string, string>();
  private readonly sortedSources: SiteSource[];
  private readonly sortedPeople: SitePerson[];
  private readonly collator: Intl.Collator;

  constructor(private readonly data: SiteData) {
    this.strings = SITE_STRINGS[data.language];
    this.collator = new Intl.Collator(data.language, { sensitivity: "base" });
    this.peopleById = new Map(data.people.map((person) => [person.id, person]));
    for (const person of data.people) {
      this.vitals.set(person.id, {
        birth: person.events.find((event) => event.eventType === "birth"),
        death: person.events.find((event) => event.eventType === "death"),
      });
    }
    this.sourcesById = new Map(data.sources.map((source) => [source.id, source]));
    this.sortedSources = data.sources.toSorted((a, b) => this.collator.compare(a.title, b.title));
    this.sortedSources.forEach((source, index) =>
      this.sourceAnchors.set(source.id, `source-${index + 1}`),
    );
    this.sortedPeople = data.people.toSorted(
      (a, b) =>
        this.collator.compare(a.surname, b.surname) ||
        this.collator.compare(a.given, b.given) ||
        earliestOf(this.birthOf(a)).localeCompare(earliestOf(this.birthOf(b))),
    );
  }

  // --- shared pieces ---

  private birthOf(person: SitePerson): HistoricalDate | null {
    return this.vitals.get(person.id)?.birth?.date ?? null;
  }

  private deathOf(person: SitePerson): HistoricalDate | null {
    return this.vitals.get(person.id)?.death?.date ?? null;
  }

  private date(date: HistoricalDate | null): string | null {
    if (!date) return null;
    return resolveHistoricalDate(date.original, this.data.language).display ?? date.original;
  }

  private name(person: Pick<SitePerson, "given" | "surname" | "titlePrefix" | "suffix">): string {
    const core =
      person.given.trim() === "" && person.surname.trim() === ""
        ? this.strings.unknownName
        : formatPersonName(person);
    return [person.titlePrefix, core, person.suffix]
      .filter((part): part is string => Boolean(part?.trim()))
      .join(" ");
  }

  private lifespan(person: SitePerson): string | null {
    return formatLifespan({ birth: this.birthOf(person), death: this.deathOf(person) });
  }

  private exportedOn(): string {
    const formatted = new Intl.DateTimeFormat(this.data.language === "da" ? "da-DK" : "en-GB", {
      dateStyle: "long",
      timeZone: "UTC",
    }).format(new Date(this.data.exportedAt));
    return fill(this.strings.exportedOn, { date: formatted });
  }

  private page(options: {
    root: "" | "../";
    title: string;
    current: "people" | "tree" | "sources" | null;
    body: string;
    bodyClass?: string;
    scripts?: string[];
  }): string {
    const { root } = options;
    return templates.layout({
      lang: this.strings.htmlLang,
      root,
      pageTitle:
        options.title === this.data.title ? options.title : `${options.title} · ${this.data.title}`,
      siteTitle: this.data.title,
      skipLabel: this.strings.skipLink,
      bodyClass: options.bodyClass ?? "",
      nav: [
        {
          href: `${root}index.html`,
          label: this.strings.people,
          current: options.current === "people",
        },
        { href: `${root}tree.html`, label: this.strings.tree, current: options.current === "tree" },
        {
          href: `${root}sources.html`,
          label: this.strings.sources,
          current: options.current === "sources",
        },
      ],
      body: options.body,
      exportedOn: this.exportedOn(),
      scripts: options.scripts ?? [],
    });
  }

  // --- index.html ---

  indexPage(): string {
    const groups: Array<{ label: string; anchor: string; people: object[] }> = [];
    for (const person of this.sortedPeople) {
      const label = person.surname.trim() === "" ? this.strings.noSurname : person.surname.trim();
      let group = groups.at(-1);
      if (!group || this.collator.compare(group.label, label) !== 0) {
        group = { label, anchor: `surname-${groups.length + 1}`, people: [] };
        groups.push(group);
      }
      const otherNames = person.names.map((name) => `${name.given} ${name.surname}`);
      group.people.push({
        id: person.id,
        name: this.name(person),
        lifespan: this.lifespan(person),
        search: searchText([this.name(person), ...otherNames].join(" ")),
      });
    }
    const body = templates.indexBody({
      title: this.data.title,
      counts: fill(this.strings.counts, {
        people: this.data.people.length,
        sources: this.data.sources.length,
      }),
      privacyNote: this.strings.privacyNote,
      openTree: this.strings.openTree,
      surnamesHeading: this.strings.surnames,
      everyoneHeading: this.strings.everyone,
      filterLabel: this.strings.filterLabel,
      filterPlaceholder: this.strings.filterPlaceholder,
      noMatches: this.strings.noMatches,
      groups,
      filterScript: FILTER_SCRIPT,
    });
    return this.page({ root: "", title: this.data.title, current: "people", body });
  }

  // --- tree.html ---

  treePage(): string {
    const viewer = this.strings.viewer;
    const body = templates.treeBody({
      chartLabel: this.strings.chartKind,
      orientationLabel: this.strings.orientation,
      charts: CHART_KINDS.map((value) => ({ value, label: viewer.charts[value] })),
      orientations: ORIENTATIONS.map((value) => ({ value, label: viewer.orientations[value] })),
      openPage: viewer.openPage,
      centerHere: viewer.centerHere,
      zoomIn: viewer.zoomIn,
      zoomOut: viewer.zoomOut,
      fitToView: viewer.fitToView,
      noScript: this.strings.noScript,
    });
    return this.page({
      root: "",
      title: this.strings.tree,
      current: "tree",
      body,
      bodyClass: "tree-page",
      scripts: ["data/tree.js", "assets/tree.js"],
    });
  }

  treeData(): TreeData {
    const start =
      (this.data.startPersonId && this.peopleById.has(this.data.startPersonId)
        ? this.data.startPersonId
        : this.sortedPeople[0]?.id) ?? "";
    return {
      language: this.data.language,
      startPersonId: start,
      settings: this.data.treeSettings,
      strings: this.strings.viewer,
      people: this.data.people.map((person): TreeDataPerson => {
        const vitals = this.vitals.get(person.id);
        return {
          id: person.id,
          given: person.given,
          surname: person.surname,
          gender: person.gender,
          isLiving: person.isLiving,
          birth: vitals?.birth?.date ?? null,
          birthPlace: vitals?.birth?.place ?? null,
          death: vitals?.death?.date ?? null,
          deathPlace: vitals?.death?.place ?? null,
          photoPath: person.photo,
          name: this.name(person),
          birthText: this.date(vitals?.birth?.date ?? null),
          deathText: this.date(vitals?.death?.date ?? null),
          lifespan: this.lifespan(person),
        };
      }),
      parentEdges: this.data.parentEdges
        .filter((edge) => this.peopleById.has(edge.parentId) && this.peopleById.has(edge.childId))
        .map(({ parentId, childId, parentage }) => ({ parentId, childId, parentage })),
      spouseEdges: this.data.spouseEdges.filter(([a, b]) =>
        [a, b].every((id) => this.peopleById.has(id)),
      ),
    };
  }

  // --- people/<id>.html ---

  personPage(person: SitePerson): string {
    const footnotes = new Footnotes();
    const redacted = isRedactedOnSite(person);
    const vitals = this.vitals.get(person.id)!;
    const name = this.name(person);

    const vitalRows: Array<{ label: string; text: string; cites: number[] }> = [];
    if (!redacted) {
      for (const [event, label] of [
        [vitals.birth, this.strings.born],
        [vitals.death, this.strings.died],
      ] as const) {
        if (!event) continue;
        const text = [this.date(event.date), event.place].filter(Boolean).join(", ");
        if (text !== "") vitalRows.push({ label, text, cites: footnotes.cite(event.citations) });
      }
      if (!person.isLiving && !vitals.death) {
        vitalRows.push({ label: this.strings.died, text: this.strings.deceased, cites: [] });
      }
    }

    const names = person.names.map((alternate) => ({
      typeLabel: alternate.typeLabel,
      name: `${alternate.given} ${alternate.surname}`.trim(),
      since: alternate.since
        ? fill(this.strings.since, { date: this.date(alternate.since)! })
        : null,
      notesHtml: markdownToHtml(alternate.notes),
      cites: footnotes.cite(alternate.citations),
    }));

    const family = this.family(person, footnotes);

    const events = person.events
      .filter((event) => event.eventType !== "birth" && event.eventType !== "death")
      .toSorted((a, b) => earliestOf(a.date).localeCompare(earliestOf(b.date)))
      .map((event) => ({
        date: this.date(event.date) ?? "",
        title: event.label?.trim() ? `${event.typeLabel}: ${event.label.trim()}` : event.typeLabel,
        place: event.place,
        details: event.details
          ? Object.entries(event.details)
              .map(([key, value]) => `${this.strings.detailLabels[key] ?? key}: ${value}`)
              .join(" · ")
          : null,
        notesHtml: markdownToHtml(event.notes),
        cites: footnotes.cite(event.citations),
      }));

    // Notes on birth and death have no row of their own above; they read
    // as part of the notes.
    const personCites = footnotes.cite(person.citations);
    const vitalNotes = [vitals.birth, vitals.death]
      .map((event) => (redacted ? null : event?.notes))
      .filter((note): note is string => Boolean(note?.trim()));
    const notesHtml = markdownToHtml([person.notes, ...vitalNotes].filter(Boolean).join("\n\n"));

    const citations = footnotes.list.map((citation, index) => {
      const source = this.sourcesById.get(citation.sourceId);
      return {
        n: index + 1,
        href: `../sources.html#${this.sourceAnchors.get(citation.sourceId) ?? ""}`,
        title: source?.title ?? "",
        detail: [
          citation.page ? fill(this.strings.page, { value: citation.page }) : null,
          citation.volume ? fill(this.strings.volume, { value: citation.volume }) : null,
          citation.entryId ? fill(this.strings.entry, { value: citation.entryId }) : null,
          citation.certificateNumber
            ? fill(this.strings.certificate, { value: citation.certificateNumber })
            : null,
        ]
          .filter(Boolean)
          .join(", "),
        confidence: fill(this.strings.confidence, { value: citation.confidence }),
        noteHtml: markdownToHtml(citation.note),
      };
    });

    const initials = [person.given, person.surname]
      .map((part) => part.trim().charAt(0).toUpperCase())
      .join("");
    const body = templates.personBody({
      name,
      lifespan: redacted ? null : this.lifespan(person),
      photo: person.photo ? `../${person.photo}` : null,
      photoAlt: fill(this.strings.photoOf, { name }),
      initials: initials === "" ? "?" : initials,
      genderClass: { M: "male", F: "female", U: "unknown" }[person.gender],
      treeHref: `../tree.html?person=${person.id}`,
      viewInTree: this.strings.viewInTree,
      redacted,
      livingPrivate: this.strings.livingPrivate,
      vitals: vitalRows,
      alsoKnownAs: this.strings.alsoKnownAs,
      names,
      familyHeading: this.strings.family,
      hasFamily: family.some((group) => group.people.length > 0),
      family,
      lifeEvents: this.strings.lifeEvents,
      events,
      notesHeading: this.strings.notes,
      notesHtml,
      cites: personCites,
      sourcesHeading: this.strings.sourcesForThisPage,
      citations,
    });
    return this.page({ root: "../", title: name, current: null, body });
  }

  private relative(
    id: string,
  ): Omit<RelativeView, "note" | "details" | "cites" | "notesHtml"> | null {
    const person = this.peopleById.get(id);
    if (!person) return null;
    return {
      href: `${person.id}.html`,
      name: this.name(person),
      lifespan: this.lifespan(person),
      sortKey: earliestOf(this.birthOf(person)),
    };
  }

  /** Parents, spouses (with their unions), children, siblings — as link lists. */
  private family(
    person: SitePerson,
    footnotes: Footnotes,
  ): Array<{ heading: string; people: RelativeView[] }> {
    const plain = (id: string, note: string | null = null): RelativeView | null => {
      const relative = this.relative(id);
      return relative ? { ...relative, note, details: [], cites: [], notesHtml: null } : null;
    };
    const present = (views: Array<RelativeView | null>) =>
      views.filter((view): view is RelativeView => view !== null);
    const bySortKey = (a: RelativeView, b: RelativeView) => a.sortKey.localeCompare(b.sortKey);

    const parentEdges = this.data.parentEdges.filter((edge) => edge.childId === person.id);
    // Birth parents need no label; any other parentage (adopted, step, …)
    // says so. "unknown" is what most links carry, so it isn't shown either.
    const parents = present(
      parentEdges.map((edge) =>
        plain(
          edge.parentId,
          edge.parentage === "birth" || edge.parentage === "unknown" ? null : edge.parentageLabel,
        ),
      ),
    );

    const children = present(
      this.data.parentEdges
        .filter((edge) => edge.parentId === person.id)
        .map((edge) => plain(edge.childId)),
    ).toSorted(bySortKey);

    const parentIds = new Set(parentEdges.map((edge) => edge.parentId));
    const siblingIds = new Set(
      this.data.parentEdges
        .filter((edge) => parentIds.has(edge.parentId) && edge.childId !== person.id)
        .map((edge) => edge.childId),
    );
    const siblings = present([...siblingIds].map((id) => plain(id))).toSorted(bySortKey);

    const unionsBySpouse = new Map<string, SiteUnion[]>();
    for (const union of this.data.unions) {
      const [a, b] = union.partnerIds;
      const other = a === person.id ? b : b === person.id ? a : null;
      if (other) unionsBySpouse.set(other, [...(unionsBySpouse.get(other) ?? []), union]);
    }
    const spouseIds = new Set(unionsBySpouse.keys());
    for (const [a, b] of this.data.spouseEdges) {
      if (a === person.id) spouseIds.add(b);
      if (b === person.id) spouseIds.add(a);
    }
    const spouses = present(
      [...spouseIds].map((id) => {
        const view = plain(id);
        if (!view) return null;
        const unions = (unionsBySpouse.get(id) ?? []).toSorted((x, y) =>
          earliestOf(x.startDate).localeCompare(earliestOf(y.startDate)),
        );
        for (const union of unions) {
          const started = [this.date(union.startDate), union.startPlace].filter(Boolean).join(", ");
          const ended = [this.date(union.endDate), union.endPlace].filter(Boolean).join(", ");
          view.details.push(
            [union.statusLabel, started].filter(Boolean).join(" "),
            ...(ended ? [`${this.strings.ended} ${ended}`] : []),
          );
          view.cites.push(...footnotes.cite(union.citations));
          const notes = markdownToHtml(union.notes);
          if (notes) view.notesHtml = (view.notesHtml ?? "") + notes;
        }
        view.sortKey = earliestOf(unions[0]?.startDate ?? null);
        return view;
      }),
    ).toSorted(bySortKey);

    return [
      { heading: this.strings.parents, people: parents },
      { heading: this.strings.spouses, people: spouses },
      { heading: this.strings.children, people: children },
      { heading: this.strings.siblings, people: siblings },
    ];
  }

  // --- sources.html ---

  sourcesPage(): string {
    const citingPeople = new Map<string, Set<string>>();
    const add = (sourceId: string, personId: string) =>
      citingPeople.set(sourceId, (citingPeople.get(sourceId) ?? new Set()).add(personId));
    for (const person of this.data.people) {
      for (const citation of [
        ...person.citations,
        ...person.names.flatMap((name) => name.citations),
        ...person.events.flatMap((event) => event.citations),
      ]) {
        add(citation.sourceId, person.id);
      }
    }
    for (const union of this.data.unions) {
      for (const citation of union.citations) {
        for (const partnerId of union.partnerIds) add(citation.sourceId, partnerId);
      }
    }

    const sources = this.sortedSources.map((source) => {
      const fields = [
        [this.strings.author, source.author],
        [this.strings.publication, source.publication],
        [this.strings.sourceType, source.sourceType],
        [this.strings.repository, source.repository],
        [this.strings.callNumber, source.callNumber],
      ]
        .filter((field): field is [string, string] => Boolean(field[1]?.trim()))
        .map(([label, value]) => ({ label, value }));
      const people = [...(citingPeople.get(source.id) ?? [])]
        .map((id) => this.peopleById.get(id))
        .filter((person): person is SitePerson => person !== undefined)
        .map((person) => ({ href: `people/${person.id}.html`, name: this.name(person) }))
        .toSorted((a, b) => this.collator.compare(a.name, b.name));
      return { anchor: this.sourceAnchors.get(source.id), title: source.title, fields, people };
    });

    const body = templates.sourcesBody({
      heading: this.strings.sources,
      noSources: this.strings.noSources,
      citedFor: this.strings.citedFor,
      sources,
    });
    return this.page({ root: "", title: this.strings.sources, current: "sources", body });
  }
}

/**
 * The index page's filter box: hides people whose name doesn't contain what
 * was typed, and surname groups left empty. Inline and dependency-free; the
 * page works without it (everyone stays listed).
 */
const FILTER_SCRIPT = `(function () {
  var input = document.getElementById("person-filter");
  var none = document.getElementById("no-matches");
  if (!input || !none) return;
  var groups = document.querySelectorAll(".surname-group");
  function norm(text) {
    return text.toLowerCase().normalize("NFKD").replace(/[\\u0300-\\u036f]/g, "")
      .replace(/ø/g, "o").replace(/æ/g, "ae").replace(/å/g, "a");
  }
  input.addEventListener("input", function () {
    var query = norm(input.value.trim());
    var any = false;
    groups.forEach(function (group) {
      var shown = 0;
      group.querySelectorAll("li").forEach(function (item) {
        var match = query === "" || item.getAttribute("data-search").indexOf(query) !== -1;
        item.hidden = !match;
        if (match) shown++;
      });
      group.hidden = shown === 0;
      if (shown > 0) any = true;
    });
    none.hidden = any;
  });
})();`;
