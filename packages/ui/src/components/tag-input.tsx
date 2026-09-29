import { XIcon } from "lucide-react";
import { useState } from "react";
import {
  Button as RACButton,
  Tag as RACTag,
  TagGroup as RACTagGroup,
  TagList as RACTagList,
} from "react-aria-components";

import { Autocomplete } from "./autocomplete";
import { Badge } from "./badge";

export interface TagInputProps {
  value: readonly string[];
  onChange: (tags: string[]) => void;
  /** Existing tags offered while typing — a suggestion list, not a closed vocabulary; any typed value is accepted. */
  suggestions: readonly string[];
  placeholder?: string;
}

/**
 * A free-text, autocompleting, multi-value tag picker — built from two
 * existing pieces rather than a new one from scratch: `Autocomplete` (already
 * does free-text + suggestion filtering) for the "add a tag" input, and React
 * Aria's own `TagGroup`/`Tag` (unused elsewhere in this package so far) for
 * the removable-chip row. Type a name (or click a suggestion) and press
 * Enter or "," to add it as a chip — `Autocomplete` itself only reports
 * every keystroke, it has no notion of "commit," so that's handled here.
 */
export function TagInput({ value, onChange, suggestions, placeholder }: TagInputProps) {
  const [draft, setDraft] = useState("");

  const addTag = (raw: string) => {
    const tag = raw.trim();
    setDraft("");
    if (tag === "" || value.includes(tag)) return;
    onChange([...value, tag]);
  };

  const remainingSuggestions = suggestions.filter((tag) => !value.includes(tag));

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <RACTagGroup
          aria-label="Tags"
          onRemove={(keys) => {
            const removed = new Set(keys);
            onChange(value.filter((tag) => !removed.has(tag)));
          }}
        >
          <RACTagList items={value.map((tag) => ({ id: tag }))} className="flex flex-wrap gap-1.5">
            {(item) => (
              <RACTag id={item.id} textValue={item.id}>
                <Badge variant="secondary" className="gap-1 pr-1">
                  {item.id}
                  <RACButton
                    slot="remove"
                    aria-label={`Remove ${item.id}`}
                    className="rounded-full p-0.5 hover:bg-secondary-foreground/10"
                  >
                    <XIcon className="size-3" />
                  </RACButton>
                </Badge>
              </RACTag>
            )}
          </RACTagList>
        </RACTagGroup>
      )}
      <Autocomplete
        value={draft}
        onChange={setDraft}
        options={remainingSuggestions}
        placeholder={placeholder ?? "Add a tag"}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === ",") {
            event.preventDefault();
            addTag(draft);
          }
        }}
      />
    </div>
  );
}
