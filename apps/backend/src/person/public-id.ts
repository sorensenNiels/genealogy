import { randomInt } from "node:crypto";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const ALPHANUMERIC = `${LETTERS}0123456789`;

/**
 * A short, memorable identifier for a person — inspired by FamilySearch's
 * PID format ("LZXY-ABC") — distinct from the internal UUID primary key.
 * Meant to be read aloud, written down, or shared, which the UUID isn't.
 * Always starts with a letter so it can't be mistaken for a bare number;
 * the rest are letters or digits. Callers are responsible for retrying on a
 * unique-constraint collision — see PersonService.create — which at ~56
 * billion combinations should essentially never happen.
 */
export function generatePublicId(): string {
  const first = randomChar(LETTERS);
  const rest = Array.from({ length: 6 }, () => randomChar(ALPHANUMERIC)).join("");
  return `${first}${rest.slice(0, 3)}-${rest.slice(3)}`;
}

function randomChar(alphabet: string): string {
  return alphabet[randomInt(alphabet.length)] ?? alphabet[0] ?? "";
}
