import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";

const TelemetryEventSchema = z.object({
  event: z.enum(["card_rendered", "card_skipped", "provider_fallback", "feedback"]),
  at: z.string().datetime(),
  traceId: z.string().uuid().optional(),
  taskType: z.string().max(40).optional(),
  reason: z.string().max(80).optional(),
  live: z.boolean().optional(),
  degraded: z.boolean().optional(),
  rating: z.number().int().min(1).max(5).optional()
}).strict();

export type TelemetryEvent = z.infer<typeof TelemetryEventSchema>;

export class TelemetryWriter {
  constructor(private readonly enabled: boolean, private readonly path: string) {}

  async write(event: TelemetryEvent): Promise<void> {
    if (!this.enabled) return;
    const safe = TelemetryEventSchema.parse(event);
    await mkdir(dirname(this.path), { recursive: true });
    await appendFile(this.path, `${JSON.stringify(safe)}\n`, { encoding: "utf8", mode: 0o600 });
  }
}
