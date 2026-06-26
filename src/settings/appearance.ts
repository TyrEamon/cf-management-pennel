import { z } from "zod";

export const APPEARANCE_SETTING_KEY = "appearance";

export const appearanceSchema = z.object({
  image: z.string().trim().max(4096).optional().default(""),
  imgOpacity: z.number().int().min(0).max(100).optional().default(100),
  maskOpacity: z.number().int().min(0).max(100).optional().default(45),
  cardOpacity: z.number().int().min(30).max(100).optional().default(100),
});

export type AppearanceSettings = z.infer<typeof appearanceSchema>;

export function normalizeAppearance(value: unknown): AppearanceSettings {
  const parsed = appearanceSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : appearanceSchema.parse({});
}
