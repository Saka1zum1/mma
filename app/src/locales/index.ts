import type { AppLocale } from "@/lib/i18n/types";
import { en, type MessageCatalog, type MessageKey } from "./en";
import { zhHans } from "./zh-Hans";

/** Locale id → message catalog. Register new languages here. */
export const catalogs: Record<AppLocale, Partial<MessageCatalog> | MessageCatalog> = {
	en,
	"zh-Hans": zhHans,
};

export type { MessageCatalog, MessageKey };
