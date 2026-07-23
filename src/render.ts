import type { MomentExperience } from "./domain.js";

function wrap(text: string, width: number): string[] {
  const words = text
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((word) => {
      if (word.length <= width) return [word];
      const chunks: string[] = [];
      for (let index = 0; index < word.length; index += width) {
        chunks.push(word.slice(index, index + width));
      }
      return chunks;
    });
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

export function providerLabel(moment: MomentExperience): string {
  if (moment.provenance.selectorLive && moment.provenance.scriptureLive) {
    return "GLOO + YOUVERSION";
  }
  if (moment.provenance.scriptureLive) return "LOCAL SELECTOR + YOUVERSION";
  if (moment.provenance.selectorLive) return "GLOO + PUBLIC DOMAIN";
  return "LOCAL + PUBLIC DOMAIN";
}

function reasonLabel(code: string): string {
  return code
    .replace(/^task-/, "")
    .replace(/^workflow-/, "")
    .replace(/^calendar-/, "")
    .replace(/^season-/, "")
    .replace(/^time-/, "")
    .replaceAll("-", " ");
}

export function renderHookCard(moment: MomentExperience): string {
  const width = 68;
  const rows: string[] = [
    ...wrap(`Grace in the Gap · ${moment.durationSeconds}s pause · ${providerLabel(moment)}`, width),
    "",
    ...wrap(`“${moment.passage.text}”`, width - 4),
    ...wrap(`${moment.passage.reference} · ${moment.passage.versionName}`, width),
    "",
    ...wrap(moment.reflection, width - 4),
    ...wrap(`Attribution: ${moment.passage.copyright}`, width),
    ...wrap("Privacy: raw prompt is neither stored nor transmitted.", width)
  ];
  if (moment.selection.explanationVisible) {
    const reasons = moment.selection.reasonCodes
      .slice(0, 3)
      .map(reasonLabel)
      .join(" · ");
    rows.push(...wrap(`Why this moment: ${reasons}`, width));
  }
  if (!moment.provenance.scriptureLive) {
    rows.push(...wrap("Fallback: bundled World English Bible text (public domain).", width));
  }
  rows.push(...wrap(`Feedback ID: ${moment.traceId.slice(0, 8)} (rate 1-5 locally)`, width));
  return rows.join("\n");
}

export function renderTerminalCard(moment: MomentExperience): string {
  const line = "─".repeat(72);
  return `\n╭${line}╮\n${renderHookCard(moment)
    .split("\n")
    .flatMap((row) => row ? wrap(row, 70) : [""])
    .map((row) => `│ ${row.padEnd(70)} │`)
    .join("\n")}\n╰${line}╯\n`;
}
