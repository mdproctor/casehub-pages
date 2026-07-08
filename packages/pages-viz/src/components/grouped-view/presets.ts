import type {
  GroupedViewProps,
  GroupedViewMode,
  GroupedViewPreset,
  GroupDisplayMode,
  ContentDisplayMode,
} from "@casehubio/pages-component";

interface PresetDef {
  readonly groupDisplay: GroupDisplayMode;
  readonly contentDisplay: ContentDisplayMode;
  readonly defaultExpanded: boolean;
  readonly guidance: string;
}

export const PRESETS: Record<GroupedViewPreset, PresetDef> = {
  spreadsheet: {
    groupDisplay: "table-row",
    contentDisplay: "table",
    defaultExpanded: true,
    guidance: "Dense data, comparison tasks, >20 items per group. Traditional spreadsheet look.",
  },
  sectioned: {
    groupDisplay: "section-heading",
    contentDisplay: "table",
    defaultExpanded: true,
    guidance: "Browsing/navigation, date or category groups, mixed group sizes. Group headers are page-level text outside the table.",
  },
  list: {
    groupDisplay: "section-heading",
    contentDisplay: "list",
    defaultExpanded: true,
    guidance: "Small datasets (<7 items/group), status boards, at-a-glance views. Items render as aligned key-value rows, not table rows.",
  },
};

export function resolvePreset(props: GroupedViewProps): GroupedViewMode {
  const base = props.preset ? PRESETS[props.preset] : PRESETS.sectioned;
  const groupDisplay = props.groupDisplay ?? base.groupDisplay;
  const contentDisplay = props.contentDisplay ?? base.contentDisplay;

  if (groupDisplay === "table-row" && contentDisplay === "list") {
    throw new Error(
      "Invalid combination: groupDisplay 'table-row' + contentDisplay 'list'. " +
      "<dl> content cannot render inside table rows.",
    );
  }

  return { groupDisplay, contentDisplay } as GroupedViewMode;
}
