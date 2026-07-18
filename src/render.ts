import type { MomentExperience } from "./domain.js";

function wrap(text: string, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (!line) {
      line = word;
    } else if (`${line} ${word}`.length <= width) {
      line += ` ${word}`;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function renderHookCard(moment: MomentExperience): string {
  const width = 68;
  const source = moment.provenance.live
    ? "GLOO + YOUVERSION"
    : "OFFLINE FALLBACK · PUBLIC DOMAIN";
  const rows = [
    `Grace in the Gap · ${moment.durationSeconds}s pause · ${source}`,
    "",
    ...wrap(`“${moment.passage.text}”`, width - 4),
    `${moment.passage.reference} · ${moment.passage.versionName}`,
    "",
    ...wrap(moment.reflection, width - 4),
    `Attribution: ${moment.passage.copyright}`,
    "Privacy: raw prompt is neither stored nor transmitted."
  ];
  return rows.join("\n");
}

export function renderTerminalCard(moment: MomentExperience): string {
  const line = "─".repeat(72);
  return `\n╭${line}╮\n${renderHookCard(moment)
    .split("\n")
    .map((row) => `│ ${row.padEnd(70)} │`)
    .join("\n")}\n╰${line}╯\n`;
}
