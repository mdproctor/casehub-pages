import { loadSite } from "@casehubio/pages-runtime";
import "@casehubio/pages-primitives";
import type { LiveSite, SiteOptions } from "@casehubio/pages-runtime";
import { injectTheme, applyThemeMode, DEFAULT_THEME } from "@casehubio/pages-ui-tokens";

injectTheme(DEFAULT_THEME);
applyThemeMode(document.documentElement, "light");

export { loadSite, injectTheme, applyThemeMode, DEFAULT_THEME };
export type { LiveSite, SiteOptions };
