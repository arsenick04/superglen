/**
 * The `{nama}` placeholder in non-player lines: "Glen" in boy mode, "Superglen" when transformed. Resolved when a line
 * starts (live mode). Voice: a line with the placeholder looks for `<id>_sg` / `<id>_g` and falls back to `<id>`.
 * The Game wires the two sources once; the quiz panel and the dialog share this module.
 */
export const NAME_TOKEN = '{nama}';

let superglenNow: () => boolean = () => false;
let clipExists: (id: string) => boolean = () => false;

export function setNameSources(isSuperglen: () => boolean, hasClip: (id: string) => boolean): void {
  superglenNow = isSuperglen;
  clipExists = hasClip;
}

export function hasNameToken(text: string): boolean {
  return text.includes(NAME_TOKEN);
}

/** "Glen" or "Superglen" for the live mode. */
export function playerName(): string {
  return superglenNow() ? 'Superglen' : 'Glen';
}

export function resolveName(text: string): string {
  return text.includes(NAME_TOKEN) ? text.split(NAME_TOKEN).join(playerName()) : text;
}

/** Audio id for a line: the mode clip when the text has the placeholder and the clip exists, else the plain id. */
export function voiceIdFor(id: string, templateText: string): string {
  if (!hasNameToken(templateText)) return id;
  const variant = id + (superglenNow() ? '_sg' : '_g');
  return clipExists(variant) ? variant : id;
}
