import { describe, expect, it } from "vitest";

import {
  GedcomImportError,
  countGedcomImportPlan,
  decodeAnsel,
  decodeGedcomBytes,
  gedcomEventTag,
  gedcomNameType,
  gedcomQuay,
  parseGedcom,
  planGedcomImport,
  type GedcomImportVocabulary,
} from "./gedcom-import.js";

/** The seeded option set (see the 0000/0012 migrations), minus labels nobody here matches on. */
const vocabulary: GedcomImportVocabulary = {
  event_type: [
    "birth",
    "death",
    "christening",
    "burial",
    "cremation",
    "immigration",
    "emigration",
    "naturalization",
    "residence",
    "occupation",
    "other",
  ].map((key) => ({ key, label: key[0]!.toUpperCase() + key.slice(1) })),
  name_variant_type: [
    "birth",
    "married",
    "nickname",
    "preferred_name",
    "alternate_spelling",
    "other",
  ].map((key) => ({ key, label: key })),
  confidence: ["low", "medium", "high", "proven"].map((key) => ({ key, label: key })),
  union_status: ["married", "divorced", "partnership", "annulled", "widowed"].map((key) => ({
    key,
    label: key,
  })),
  parentage: ["birth", "adopted", "step", "foster", "unknown"].map((key) => ({ key, label: key })),
  association_role: ["godparent", "witness", "informant", "officiant", "other"].map((key) => ({
    key,
    label: key[0]!.toUpperCase() + key.slice(1),
  })),
  research_note_type: [
    { key: "open_question", label: "Open question" },
    { key: "note", label: "Note" },
  ],
};

const today = new Date("2026-10-06");

function plan(lines: string[]) {
  return planGedcomImport(lines.join("\n"), { vocabulary, today });
}

const HEAD = ["0 HEAD", "1 SOUR TestApp", "1 GEDC", "2 VERS 5.5.1", "1 CHAR UTF-8"];

describe("parseGedcom", () => {
  it("nests lines by level and folds CONC/CONT into the parent value", () => {
    const { records, malformedLines } = parseGedcom(
      ["0 @N1@ NOTE First line", "1 CONT second line", "1 CONC  continued", "0 TRLR"].join("\r\n"),
    );
    expect(malformedLines).toEqual([]);
    expect(records.map((record) => record.tag)).toEqual(["NOTE", "TRLR"]);
    expect(records[0]?.xref).toBe("N1");
    expect(records[0]?.value).toBe("First line\nsecond line continued");
    expect(records[0]?.children).toEqual([]);
  });

  it("reports unreadable lines and level jumps instead of throwing", () => {
    const { records, malformedLines } = parseGedcom(
      ["0 HEAD", "garbage", "1 SOUR X", "3 VERS too deep", "0 TRLR"].join("\n"),
    );
    expect(malformedLines).toEqual([2, 4]);
    expect(records[0]?.children.map((child) => child.tag)).toEqual(["SOUR"]);
  });

  it("unescapes @@ in text but leaves pointers alone", () => {
    const { records } = parseGedcom(
      ["0 @I1@ INDI", "1 NOTE mail me @@ home", "1 FAMS @F1@"].join("\n"),
    );
    expect(records[0]?.children.map((child) => child.value)).toEqual(["mail me @ home", "@F1@"]);
  });
});

const ascii = (text: string) => [...new TextEncoder().encode(text)];

describe("decodeGedcomBytes", () => {
  it("strips a UTF-8 BOM", () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("0 HEAD ø")]);
    expect(decodeGedcomBytes(bytes)).toEqual({ text: "0 HEAD ø", encoding: "utf-8" });
  });

  it("falls back to Windows-1252 for bytes that aren't valid UTF-8", () => {
    // "Søren" in Latin-1/Windows-1252: ø is a lone 0xF8, invalid as UTF-8.
    const bytes = new Uint8Array([0x53, 0xf8, 0x72, 0x65, 0x6e]);
    expect(decodeGedcomBytes(bytes)).toEqual({ text: "Søren", encoding: "windows-1252" });
  });

  it("decodes ANSEL when the header declares it and the bytes aren't UTF-8", () => {
    // "Søren Ærø, Råby" — ø/Æ are spacing letters (0xB2/0xA5); å is ring
    // above (0xEA) written *before* its "a", ANSEL's order for diacritics.
    const bytes = new Uint8Array([
      ...ascii("0 HEAD\n1 CHAR ANSEL\n0 @I1@ INDI\n1 NAME S"),
      0xb2,
      ...ascii("ren /"),
      0xa5,
      ...ascii("r"),
      0xb2,
      ...ascii(", R"),
      0xea,
      ...ascii("aby/"),
    ]);
    const { text, encoding } = decodeGedcomBytes(bytes);
    expect(encoding).toBe("ansel");
    expect(text.endsWith("1 NAME Søren /Ærø, Råby/")).toBe(true);
    // Precomposed (NFC), not "a" + a separate combining ring.
    expect(text.includes("\u00e5")).toBe(true);
  });

  it("reads a file that only claims ANSEL but is valid UTF-8 as UTF-8", () => {
    const bytes = new TextEncoder().encode("0 HEAD\n1 CHAR ANSEL\n1 NOTE Søren");
    expect(decodeGedcomBytes(bytes).encoding).toBe("utf-8");
  });

  it("maps an unknown ANSEL byte to U+FFFD rather than dropping it", () => {
    expect(decodeAnsel(new Uint8Array([0x41, 0x9f, 0x42]))).toBe("A\ufffdB");
  });

  it("recognizes BOM-less UTF-16LE by the NUL after the leading 0", () => {
    const text = "0 HEAD";
    const bytes = new Uint8Array(text.length * 2);
    [...text].forEach((char, index) => (bytes[index * 2] = char.charCodeAt(0)));
    expect(decodeGedcomBytes(bytes)).toEqual({ text, encoding: "utf-16le" });
  });
});

describe("planGedcomImport", () => {
  it("refuses a file that isn't GEDCOM", () => {
    expect(() => plan(["hello world"])).toThrow(GedcomImportError);
  });

  it("maps an individual's names, sex, vital events, and notes", () => {
    const result = plan([
      ...HEAD,
      "0 @I1@ INDI",
      "1 NAME Dr. Hans Peter /Sørensen/ Jr.",
      "2 NPFX Dr.",
      "1 NAME Hans /Sorensen/",
      "2 TYPE aka",
      "1 SEX M",
      "1 BIRT",
      "2 DATE ABT 1850",
      "2 PLAC Brande, Denmark",
      "1 DEAT",
      "2 DATE 12 MAR 1920",
      "2 CAUS Influenza",
      "1 OCCU Farmer",
      "1 NOTE A note",
      "2 CONT on two lines",
      "0 TRLR",
    ]);
    const person = result.persons[0]!;
    expect(person).toMatchObject({
      ref: "I1",
      given: "Hans Peter",
      surname: "Sørensen",
      suffix: "Jr.",
      titlePrefix: "Dr.",
      gender: "M",
      isLiving: false,
      notes: "A note\non two lines",
    });
    expect(person.names).toEqual([
      {
        nameType: "nickname",
        given: "Hans",
        surname: "Sorensen",
        since: null,
        notes: null,
        citations: [],
      },
    ]);
    expect(person.events.map((event) => event.eventType)).toEqual(["birth", "death", "occupation"]);
    expect(person.events[0]).toMatchObject({
      date: { original: "ABT 1850", earliest: "1850-01-01", latest: "1850-12-31" },
      place: "Brande, Denmark",
    });
    expect(person.events[1]?.details).toEqual({ causeOfDeath: "Influenza" });
    expect(person.events[2]?.details).toEqual({ jobTitle: "Farmer" });
  });

  it("prefers GIVN/SURN sub-tags over the slash form", () => {
    const result = plan([
      ...HEAD,
      "0 @I1@ INDI",
      "1 NAME Anne /Berg/",
      "2 GIVN Anne Marie",
      "2 SURN Berg",
      "2 SPFX von",
    ]);
    expect(result.persons[0]).toMatchObject({ given: "Anne Marie", surname: "von Berg" });
  });

  it("maps an event with no matching option to 'other' with the tag name as its label", () => {
    const result = plan([...HEAD, "0 @I1@ INDI", "1 CONF", "2 DATE 1865", "1 RELI Lutheran"]);
    expect(result.persons[0]?.events.map(({ eventType, label }) => ({ eventType, label }))).toEqual(
      [
        { eventType: "other", label: "Confirmation" },
        { eventType: "other", label: "Religion: Lutheran" },
      ],
    );
  });

  it("matches an EVEN's TYPE against option keys and labels", () => {
    const result = plan([
      ...HEAD,
      "0 @I1@ INDI",
      "1 EVEN",
      "2 TYPE Residence",
      "1 EVEN",
      "2 TYPE Military service",
    ]);
    expect(result.persons[0]?.events.map(({ eventType, label }) => ({ eventType, label }))).toEqual(
      [
        { eventType: "residence", label: null },
        { eventType: "other", label: "Military service" },
      ],
    );
  });

  it("keeps a second birth as an 'other' event and warns", () => {
    const result = plan([...HEAD, "0 @I1@ INDI", "1 BIRT", "2 DATE 1850", "1 BIRT", "2 DATE 1851"]);
    expect(result.persons[0]?.events.map((event) => event.eventType)).toEqual(["birth", "other"]);
    expect(result.warnings.find((w) => w.code === "extraVitalEvent")?.count).toBe(1);
  });

  it("treats a bare DEAT as 'not living' without creating an empty event", () => {
    const result = plan([...HEAD, "0 @I1@ INDI", "1 DEAT Y"]);
    expect(result.persons[0]).toMatchObject({ isLiving: false, events: [] });
  });

  it("infers deceased for someone born more than 110 years ago, and says so", () => {
    const result = plan([
      ...HEAD,
      "0 @I1@ INDI",
      "1 BIRT",
      "2 DATE 1801",
      "0 @I2@ INDI",
      "1 BIRT",
      "2 DATE 1990",
    ]);
    expect(result.persons.map((person) => person.isLiving)).toEqual([false, true]);
    expect(result.warnings.find((w) => w.code === "inferredDeceased")?.count).toBe(1);
  });

  it("uses the configured presumed-deceased age, and 0 turns the inference off", () => {
    const lines = [...HEAD, "0 @I1@ INDI", "1 BIRT", "2 DATE 1930"].join("\n");
    const strict = planGedcomImport(lines, { vocabulary, today, presumeDeceasedAfterYears: 80 });
    expect(strict.persons[0]?.isLiving).toBe(false);
    const off = planGedcomImport([...HEAD, "0 @I1@ INDI", "1 BIRT", "2 DATE 1801"].join("\n"), {
      vocabulary,
      today,
      presumeDeceasedAfterYears: 0,
    });
    expect(off.persons[0]?.isLiving).toBe(true);
  });

  it("builds parent links, a spouse link, and a union from a FAM record", () => {
    const result = plan([
      ...HEAD,
      "0 @I1@ INDI",
      "0 @I2@ INDI",
      "0 @I3@ INDI",
      "1 FAMC @F1@",
      "2 PEDI adopted",
      "0 @I4@ INDI",
      "0 @F1@ FAM",
      "1 HUSB @I1@",
      "1 WIFE @I2@",
      "1 CHIL @I3@",
      "1 CHIL @I4@",
      "2 _FREL Natural",
      "2 _MREL Step",
      "1 MARR",
      "2 DATE 1 JUN 1875",
      "2 PLAC Vejle",
      "1 DIV",
      "2 DATE 1890",
    ]);
    expect(result.parentLinks).toEqual([
      { parentRef: "I1", childRef: "I3", parentage: "adopted" },
      { parentRef: "I2", childRef: "I3", parentage: "adopted" },
      { parentRef: "I1", childRef: "I4", parentage: "birth" },
      { parentRef: "I2", childRef: "I4", parentage: "step" },
    ]);
    expect(result.spouseLinks).toEqual([{ aRef: "I1", bRef: "I2" }]);
    expect(result.unions).toEqual([
      expect.objectContaining({
        personARef: "I1",
        personBRef: "I2",
        status: "divorced",
        startDate: expect.objectContaining({ original: "1 JUN 1875" }),
        startPlace: "Vejle",
        endDate: expect.objectContaining({ original: "1890" }),
      }),
    ]);
  });

  it("links a couple with no family events as spouses, without a union row", () => {
    const result = plan([
      ...HEAD,
      "0 @I1@ INDI",
      "0 @I2@ INDI",
      "0 @F1@ FAM",
      "1 HUSB @I1@",
      "1 WIFE @I2@",
    ]);
    expect(result.spouseLinks).toHaveLength(1);
    expect(result.unions).toEqual([]);
  });

  it("maps source records and citations, including QUAY and inline sources", () => {
    const result = plan([
      ...HEAD,
      "0 @I1@ INDI",
      "1 BIRT",
      "2 SOUR @S1@",
      "3 PAGE p. 12",
      "3 QUAY 3",
      "3 DATA",
      "4 TEXT Born to Peder and Ane",
      "1 SOUR Family bible",
      "0 @S1@ SOUR",
      "1 TITL Brande parish register",
      "1 AUTH Brande Kirke",
      "1 REPO @R1@",
      "0 @R1@ REPO",
      "1 NAME Rigsarkivet",
    ]);
    expect(result.sources).toEqual([
      {
        ref: "S1",
        title: "Brande parish register",
        author: "Brande Kirke",
        publication: null,
        repositoryRef: "R1",
        callNumber: null,
        sourceType: null,
      },
      expect.objectContaining({ title: "Family bible" }),
    ]);
    expect(result.repositories).toEqual([
      expect.objectContaining({ ref: "R1", name: "Rigsarkivet" }),
    ]);
    expect(result.persons[0]?.events[0]?.citations).toEqual([
      {
        sourceRef: "S1",
        page: "p. 12",
        volume: null,
        entryId: null,
        certificateNumber: null,
        note: "Born to Peder and Ane",
        confidence: "proven",
        ancestryApid: null,
      },
    ]);
    expect(result.persons[0]?.citations).toEqual([
      expect.objectContaining({ sourceRef: "__inline_1", page: null, confidence: "medium" }),
    ]);
    expect(result.warnings.find((w) => w.code === "inlineSource")?.count).toBe(1);
  });

  it("reads this app's own exported confidence suffix back", () => {
    const result = plan([
      ...HEAD,
      "0 @I1@ INDI",
      "1 SOUR @S1@",
      "2 DATA",
      "3 TEXT Seen in person — confidence: high",
      "0 @S1@ SOUR",
      "1 TITL A source",
    ]);
    expect(result.persons[0]?.citations[0]).toMatchObject({
      note: "Seen in person",
      confidence: "high",
    });
  });

  it("drops a pointer to a record that doesn't exist, and warns", () => {
    const result = plan([
      ...HEAD,
      "0 @I1@ INDI",
      "1 SOUR @S9@",
      "0 @F1@ FAM",
      "1 HUSB @I1@",
      "1 CHIL @I9@",
    ]);
    expect(result.persons[0]?.citations).toEqual([]);
    expect(result.parentLinks).toEqual([]);
    expect(result.warnings.find((w) => w.code === "missingReference")).toMatchObject({
      count: 2,
      examples: ["@S9@", "@I9@"],
    });
  });

  it("tallies tags it doesn't import, ignoring pure bookkeeping", () => {
    const result = plan([
      ...HEAD,
      "0 @I1@ INDI",
      "1 _UID ABC",
      "1 CHAN",
      "1 OBJE",
      "1 _MILT",
      "1 _MILT",
      "0 @O1@ OBJE",
    ]);
    expect(result.warnings.find((w) => w.code === "skippedTag")).toEqual({
      code: "skippedTag",
      count: 4,
      examples: ["INDI._MILT (2)", "INDI.OBJE (1)", "OBJE (1)"],
    });
  });

  it("warns about dates it can't interpret, keeping their wording", () => {
    const result = plan([...HEAD, "0 @I1@ INDI", "1 BIRT", "2 DATE @#DHEBREW@ 1 TSH 5500"]);
    expect(result.persons[0]?.events[0]?.date).toEqual({
      original: "@#DHEBREW@ 1 TSH 5500",
      earliest: null,
      latest: null,
    });
    expect(result.warnings.find((w) => w.code === "unparsedDate")?.examples).toEqual([
      "@#DHEBREW@ 1 TSH 5500",
    ]);
  });

  it("prefers a note's _MARKDOWN original over its plain-text line", () => {
    const result = plan([
      ...HEAD,
      "0 @I1@ INDI",
      "1 NOTE Census 1801",
      "2 _MARKDOWN # Census 1801",
      "1 NOTE Plain only",
    ]);
    expect(result.persons[0]?.notes).toBe("# Census 1801\n\nPlain only");
  });

  it("reads a Julian date, keeping its wording and converting its bounds", () => {
    const result = plan([...HEAD, "0 @I1@ INDI", "1 BIRT", "2 DATE @#DJULIAN@ 1 JAN 1700"]);
    expect(result.persons[0]?.events[0]?.date).toEqual({
      original: "@#DJULIAN@ 1 JAN 1700",
      earliest: "1700-01-11",
      latest: "1700-01-11",
    });
    expect(result.warnings.find((w) => w.code === "unparsedDate")).toBeUndefined();
  });

  it("counts what a plan will write", () => {
    const result = plan([
      ...HEAD,
      "0 @I1@ INDI",
      "1 NAME A /B/",
      "1 NAME C /D/",
      "1 BIRT",
      "2 SOUR @S1@",
      "0 @I2@ INDI",
      "0 @F1@ FAM",
      "1 HUSB @I1@",
      "1 CHIL @I2@",
      "0 @S1@ SOUR",
      "1 TITL S",
    ]);
    expect(countGedcomImportPlan(result)).toEqual({
      persons: 2,
      names: 1,
      events: 1,
      unions: 0,
      parentLinks: 1,
      spouseLinks: 0,
      sources: 1,
      citations: 1,
      associations: 0,
      researchNotes: 0,
      places: 0,
      repositories: 0,
      externalIds: 0,
    });
  });
});

describe("planGedcomImport — this app's own export tags", () => {
  it("reads event details from standard sub-tags and _DETAIL", () => {
    const result = plan([
      ...HEAD,
      "0 @I1@ INDI",
      "1 OCCU Smith",
      "2 AGNC Brande Smithy",
      "1 RESI",
      "2 ADDR Hovedgaden 1",
      "1 BURI",
      "2 _DETAIL Brande Kirkegård",
      "3 TYPE cemetery",
    ]);
    expect(result.persons[0]?.events.map((event) => event.details)).toEqual([
      { jobTitle: "Smith", employer: "Brande Smithy" },
      { address: "Hovedgaden 1" },
      { cemetery: "Brande Kirkegård" },
    ]);
  });

  it("reads a name variant's _DATE as its since date", () => {
    const result = plan([
      ...HEAD,
      "0 @I1@ INDI",
      "1 NAME Ane /Jensdatter/",
      "1 NAME Ane /Sørensen/",
      "2 TYPE married",
      "2 _DATE 1828",
    ]);
    expect(result.persons[0]?.names[0]?.since).toMatchObject({ original: "1828" });
  });

  it("reads union status from _STAT and an _END ending", () => {
    const result = plan([
      ...HEAD,
      "0 @I1@ INDI",
      "0 @I2@ INDI",
      "0 @F1@ FAM",
      "1 HUSB @I1@",
      "1 WIFE @I2@",
      "1 _STAT widowed",
      "1 MARR",
      "2 DATE 1828",
      "1 _END",
      "2 DATE 1870",
    ]);
    expect(result.unions[0]).toMatchObject({
      status: "widowed",
      endDate: expect.objectContaining({ original: "1870" }),
    });
  });

  it("reads citation volume/entry/certificate and a source's _TYPE", () => {
    const result = plan([
      ...HEAD,
      "0 @I1@ INDI",
      "1 SOUR @S1@",
      "2 PAGE 12",
      "2 _VOLUME 3",
      "2 _ENTRY 45",
      "2 _CERT B-99",
      "0 @S1@ SOUR",
      "1 TITL Census",
      "1 _TYPE census",
    ]);
    expect(result.persons[0]?.citations[0]).toMatchObject({
      volume: "3",
      entryId: "45",
      certificateNumber: "B-99",
    });
    expect(result.sources[0]?.sourceType).toBe("census");
    expect(result.warnings.find((w) => w.code === "skippedTag")).toBeUndefined();
  });
});

describe("export helpers", () => {
  it("maps event types to their preferred GEDCOM tag only", () => {
    expect(gedcomEventTag("christening")).toEqual({ tag: "CHR", valueDetail: null });
    expect(gedcomEventTag("occupation")).toEqual({ tag: "OCCU", valueDetail: "jobTitle" });
    expect(gedcomEventTag("other")).toBeNull();
    expect(gedcomEventTag("military_service")).toBeNull();
  });

  it("maps name types and confidence onto GEDCOM vocabulary", () => {
    expect(gedcomNameType("nickname")).toBe("aka");
    expect(gedcomNameType("alternate_spelling")).toBe("alternate_spelling");
    expect(gedcomQuay("proven")).toBe("3");
    expect(gedcomQuay("speculative")).toBeNull();
  });
});

const skipped = (result: ReturnType<typeof plan>) =>
  result.warnings.find((w) => w.code === "skippedTag")?.examples ?? [];

describe("planGedcomImport — nothing dropped silently", () => {
  it("stores external ids, repository details and call numbers, and still reports the rest", () => {
    const result = plan([
      ...HEAD,
      "0 @I1@ INDI",
      "1 _FSFTID LZXY-ABC",
      "1 REFN 1042",
      "2 TYPE Family file",
      "1 EXID 98765",
      "2 TYPE https://example.org/ids",
      "1 BIRT",
      "2 PLAC Brande",
      "3 MAP",
      "4 LATI N55.9",
      "4 LONG E9.1",
      "1 SOUR @S1@",
      "2 _APID 1,7602::2771226",
      "0 @S1@ SOUR",
      "1 TITL Kirkebog",
      "1 REPO @R1@",
      "2 CALN C-123",
      "3 MEDI Book",
      "0 @R1@ REPO",
      "1 NAME Rigsarkivet",
      "1 ADDR",
      "2 ADR1 Rigsdagsgården 9",
      "2 CITY København",
      "1 WWW https://www.sa.dk",
      "1 FAX 12345678",
    ]);
    expect(result.persons[0]?.externalIds).toEqual([
      { system: "familysearch", value: "LZXY-ABC", type: null },
      { system: "refn", value: "1042", type: "Family file" },
      { system: "exid", value: "98765", type: "https://example.org/ids" },
    ]);
    expect(result.persons[0]?.citations[0]?.ancestryApid).toBe("1,7602::2771226");
    expect(result.sources[0]).toMatchObject({
      repositoryRef: "R1",
      callNumber: "C-123",
      sourceType: "Book",
    });
    expect(result.repositories[0]).toEqual({
      ref: "R1",
      name: "Rigsarkivet",
      address: "Rigsdagsgården 9, København",
      phone: null,
      email: null,
      website: "https://www.sa.dk",
    });
    // Stored now, so no longer reported…
    expect(skipped(result)).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/_FSFTID|CALN|REPO\.WWW|_APID/)]),
    );
    // …but a repository's fax has no column, so it still is.
    expect(skipped(result)).toEqual(expect.arrayContaining(["REPO.FAX (1)"]));
    expect(result.persons[0]?.events[0]?.place).toBe("Brande");
  });

  it("makes a repository a source only names inline, shared by name", () => {
    const result = plan([
      ...HEAD,
      "0 @S1@ SOUR",
      "1 TITL A",
      "1 REPO Landsarkivet Viborg",
      "0 @S2@ SOUR",
      "1 TITL B",
      "1 REPO Landsarkivet Viborg",
    ]);
    expect(result.repositories).toEqual([
      expect.objectContaining({ ref: "__inline_repo_1", name: "Landsarkivet Viborg" }),
    ]);
    expect(result.sources.map((source) => source.repositoryRef)).toEqual([
      "__inline_repo_1",
      "__inline_repo_1",
    ]);
  });

  it("files a GEDCOM 7 EXID from FamilySearch as a FamilySearch id", () => {
    const result = plan([
      ...HEAD,
      "0 @I1@ INDI",
      "1 EXID LZXY-ABC",
      "2 TYPE https://www.familysearch.org/tree/person/",
    ]);
    expect(result.persons[0]?.externalIds).toEqual([
      {
        system: "familysearch",
        value: "LZXY-ABC",
        type: "https://www.familysearch.org/tree/person/",
      },
    ]);
  });

  it("builds an address from structured lines when ADDR itself is empty", () => {
    const result = plan([
      ...HEAD,
      "0 @I1@ INDI",
      "1 RESI",
      "2 ADDR",
      "3 ADR1 Hovedgaden 1",
      "3 CITY Brande",
      "3 CTRY Danmark",
      "1 CENS",
      "2 ADDR",
      "3 CITY Vejle",
    ]);
    expect(result.persons[0]?.events[0]?.details).toEqual({
      address: "Hovedgaden 1, Brande, Danmark",
    });
    // No address field on a census — the address stands in for the place.
    expect(result.persons[0]?.events[1]?.place).toBe("Vejle");
  });

  it("keeps a citation's recorded date in its note", () => {
    const result = plan([
      ...HEAD,
      "0 @I1@ INDI",
      "1 SOUR @S1@",
      "2 DATA",
      "3 DATE 4 MAR 1801",
      "3 TEXT Baptised",
      "0 @S1@ SOUR",
      "1 TITL Kirkebog",
    ]);
    expect(result.persons[0]?.citations[0]?.note).toBe("Recorded: 4 MAR 1801\n\nBaptised");
  });

  it("keeps family events beyond the union's start and end in its notes", () => {
    const result = plan([
      ...HEAD,
      "0 @I1@ INDI",
      "0 @I2@ INDI",
      "0 @F1@ FAM",
      "1 HUSB @I1@",
      "1 WIFE @I2@",
      "1 ENGA",
      "2 DATE 1827",
      "2 PLAC Vejle",
      "1 MARR",
      "2 TYPE Religious",
      "2 DATE 1828",
      "2 PLAC Brande",
    ]);
    expect(result.unions[0]).toMatchObject({
      startDate: expect.objectContaining({ original: "1828" }),
      startPlace: "Brande",
      notes: "Engagement: 1827, Vejle\nMarriage: type: Religious",
    });
    expect(result.warnings.find((w) => w.code === "extraFamilyEvent")?.count).toBe(1);
  });

  it("skips a disproven parent link and flags a challenged one", () => {
    const result = plan([
      ...HEAD,
      "0 @I1@ INDI",
      "0 @I2@ INDI",
      "1 NAME Not /Ours/",
      "1 FAMC @F1@",
      "2 STAT disproven",
      "0 @I3@ INDI",
      "1 NAME Maybe /Ours/",
      "1 FAMC @F1@",
      "2 STAT challenged",
      "0 @F1@ FAM",
      "1 HUSB @I1@",
      "1 CHIL @I2@",
      "1 CHIL @I3@",
    ]);
    expect(result.parentLinks.map((link) => link.childRef)).toEqual(["I3"]);
    expect(result.warnings.find((w) => w.code === "disprovenParentLink")?.examples).toEqual([
      "Not Ours",
    ]);
    expect(result.warnings.find((w) => w.code === "challengedParentLink")?.examples).toEqual([
      "Maybe Ours",
    ]);
  });
});

describe("planGedcomImport — unmapped event types", () => {
  it("lists event types that fall back to 'other', most-used first, with a key to add", () => {
    const result = plan([
      ...HEAD,
      "0 @I1@ INDI",
      "1 CENS",
      "1 CENS",
      "1 EVEN",
      "2 TYPE Military service",
      "1 EVEN",
      "2 TYPE Folketælling på Sjælland",
      "1 BIRT",
    ]);
    expect(result.unmappedEventTypes).toEqual([
      { label: "Census", tag: "CENS", suggestedKey: "census", count: 2 },
      { label: "Military service", tag: "EVEN", suggestedKey: "military_service", count: 1 },
      {
        label: "Folketælling på Sjælland",
        tag: "EVEN",
        suggestedKey: "folketaelling_paa_sjaelland",
        count: 1,
      },
    ]);
  });

  it("matches a GEDCOM tag against an option's label too", () => {
    const result = planGedcomImport([...HEAD, "0 @I1@ INDI", "1 CONF"].join("\n"), {
      vocabulary: {
        ...vocabulary,
        event_type: [
          ...(vocabulary.event_type ?? []),
          { key: "konfirmation", label: "Confirmation" },
        ],
      },
      today,
    });
    expect(result.persons[0]?.events[0]?.eventType).toBe("konfirmation");
    expect(result.unmappedEventTypes).toEqual([]);
  });
});

describe("planGedcomImport — associations, restrictions, to-dos, coordinates", () => {
  it("reads RESN, keeping the most restrictive of several values", () => {
    const result = plan([
      ...HEAD,
      "0 @I1@ INDI",
      "1 RESN privacy",
      "0 @I2@ INDI",
      "1 RESN LOCKED, CONFIDENTIAL",
      "0 @I3@ INDI",
    ]);
    expect(result.persons.map((person) => person.restriction)).toEqual([
      "privacy",
      "confidential",
      null,
    ]);
  });

  it("reads ASSO under a person, under an event, and name-only, mapping role words", () => {
    const result = plan([
      ...HEAD,
      "0 @I1@ INDI",
      "1 ASSO @I2@",
      "2 RELA Informant",
      "1 BAPM",
      "2 DATE 1830",
      "2 ASSO @I2@",
      "3 RELA Godfather",
      "3 SOUR @S1@",
      "2 _ASSO Ane Pedersdatter",
      "3 RELA Fadder",
      "2 ASSO @VOID@",
      "3 PHRASE Unknown neighbour",
      "3 ROLE NGHBR",
      "2 ASSO @I9@",
      "0 @I2@ INDI",
      "0 @S1@ SOUR",
      "1 TITL Kirkebog",
    ]);
    const person = result.persons[0]!;
    expect(person.associations).toEqual([
      expect.objectContaining({ associateRef: "I2", role: "informant", label: null }),
    ]);
    expect(person.eventAssociations).toEqual([
      expect.objectContaining({
        eventIndex: 0,
        associateRef: "I2",
        role: "godparent",
        citations: [expect.objectContaining({ sourceRef: "S1" })],
      }),
      expect.objectContaining({
        eventIndex: 0,
        associateName: "Ane Pedersdatter",
        role: "godparent",
      }),
      expect.objectContaining({
        eventIndex: 0,
        associateName: "Unknown neighbour",
        role: "other",
        label: "NGHBR",
      }),
    ]);
    expect(result.warnings.find((w) => w.code === "missingReference")?.examples).toEqual(["@I9@"]);
  });

  it("ties marriage witnesses to the union, owned by its first partner", () => {
    const result = plan([
      ...HEAD,
      "0 @I1@ INDI",
      "0 @I2@ INDI",
      "0 @I3@ INDI",
      "0 @F1@ FAM",
      "1 HUSB @I1@",
      "1 WIFE @I2@",
      "1 MARR",
      "2 ASSO @I3@",
      "3 RELA Forlover",
    ]);
    expect(result.unions[0]?.associations).toEqual([
      expect.objectContaining({ associateRef: "I3", role: "witness" }),
    ]);
  });

  it("reads _TODO inline and as a record, as research notes", () => {
    const result = plan([
      ...HEAD,
      "0 @I1@ INDI",
      "1 _TODO Find the baptism",
      "2 DATE 2019",
      "2 _PRIORITY High",
      "1 _TODO @T1@",
      "1 _TODO",
      "2 TYPE note",
      "2 DESC Exported from this app",
      "2 _STAT DONE",
      "0 @T1@ _TODO",
      "1 DESC Check the 1845 census",
      "1 _CAT Census",
      "1 STAT Completed",
    ]);
    expect(result.persons[0]?.researchNotes).toEqual([
      {
        noteType: "open_question",
        body: "Find the baptism\n\nDate: 2019\nPriority: High",
        resolved: false,
      },
      {
        noteType: "open_question",
        body: "Check the 1845 census\n\nCategory: Census\nStatus: Completed",
        resolved: true,
      },
      { noteType: "note", body: "Exported from this app\n\nStatus: DONE", resolved: true },
    ]);
    expect(result.warnings.find((w) => w.code === "skippedTag")).toBeUndefined();
  });

  it("collects place coordinates once per place, warning on bad or conflicting ones", () => {
    const result = plan([
      ...HEAD,
      "0 @I1@ INDI",
      "1 BIRT",
      "2 PLAC Brande",
      "3 MAP",
      "4 LATI N55.94",
      "4 LONG E9.13",
      "1 DEAT",
      "2 PLAC Brande",
      "3 MAP",
      "4 LATI N56.5",
      "4 LONG E9.13",
      "1 BURI",
      "2 PLAC Lima",
      "3 MAP",
      "4 LATI -12.05",
      "4 LONG W77.04",
      "1 RESI",
      "2 PLAC Nowhere",
      "3 MAP",
      "4 LATI N95",
      "4 LONG E1",
    ]);
    expect(result.places).toEqual([
      { name: "Brande", latitude: 55.94, longitude: 9.13 },
      { name: "Lima", latitude: -12.05, longitude: -77.04 },
    ]);
    expect(result.warnings.find((w) => w.code === "conflictingCoordinates")?.examples).toEqual([
      "Brande",
    ]);
    expect(result.warnings.find((w) => w.code === "invalidCoordinates")?.examples).toEqual([
      "Nowhere",
    ]);
  });
});
