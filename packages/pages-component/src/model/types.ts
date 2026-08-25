export interface Component<
  T extends string = string,
  P extends object = Record<string, unknown>,
> {
  readonly type: T;
  readonly id?: string;
  readonly props?: Readonly<P>;
  readonly style?: Readonly<Record<string, string>>;
  readonly access?: AccessControl;
  readonly visibleWhen?: string;
  readonly slots?: Readonly<Record<string, readonly Component[]>>;
  readonly items?: readonly GridItem[];
}

export interface AccessControl {
  readonly roles?: readonly string[];
  readonly permissions?: readonly string[];
}

export interface GridPlacement {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface GridItem {
  readonly placement: GridPlacement;
  readonly component: Component;
}

export interface PermissionContext {
  hasRole(role: string): boolean;
  hasPermission(permission: string): boolean;
}

export const ALLOW_ALL: PermissionContext = {
  hasRole: () => true,
  hasPermission: () => true,
};

export type DockZone =
  | "left-top" | "left-bottom"
  | "right-top" | "right-bottom"
  | "bottom-left" | "bottom-right";

export type DockSide = "left" | "right" | "bottom";

export interface PanelEntry {
  readonly typeName: string;
  readonly props?: Readonly<Record<string, unknown>>;
}

export interface LayoutState {
  readonly splits: Readonly<Record<string, readonly number[]>>;
  readonly docks: Readonly<Record<string, boolean>>;
  readonly panels: Readonly<Record<string, PanelEntry>>;
  readonly zones?: Readonly<Record<string, DockZone>>;
  readonly frames?: readonly FrameLayout[];
}

export type Layout = "free" | "tabbed" | "accordion" | "splith" | "splitv" | "content";

export interface ContainerState {
  readonly layout: Layout;
  readonly tabs: readonly FrameTabConfig[];
  readonly layoutState?: unknown;
}

export interface FrameTabConfig {
  readonly key: string;
  readonly label: string;
  readonly icon?: string;
  readonly content: Component | null;
  readonly children?: ContainerState;
}

export interface FrameConfig {
  readonly key: string;
  readonly tabs: readonly FrameTabConfig[];
  readonly position?: { x: number; y: number };
  readonly size?: { width: number; height: number };
  readonly pinned?: boolean;
  readonly viewMode?: "tab" | "accordion";
  readonly allowViewToggle?: boolean;
  readonly allowAddTab?: boolean;
  readonly allowArrangement?: boolean;
}

export interface FloatingWorkspaceConfig {
  readonly centre: Component | Component[];
  readonly frames?: readonly FrameConfig[];
  readonly organisers?: boolean;
}

export type SnapZone = "left" | "right" | "top" | "bottom"
  | "top-left" | "top-right" | "bottom-left" | "bottom-right"
  | "full";

export interface FrameLayout {
  readonly key: string;
  readonly order: number;
  readonly position: { x: number; y: number };
  readonly size: { width: number; height: number };
  readonly zIndex: number;
  readonly pinned: boolean;
  readonly hidden: boolean;
  readonly tabs: readonly FrameTabConfig[];
  readonly activeTabKey: string;
  readonly detached?: boolean | undefined;
  readonly snappedZone?: SnapZone | undefined;
  readonly viewMode?: "tab" | "accordion";
  readonly allowViewToggle?: boolean;
  readonly allowAddTab?: boolean;
  readonly allowArrangement?: boolean;
  readonly accordionState?: {
    readonly collapsed: readonly string[];
    readonly heights: Readonly<Record<string, number>>;
  };
  readonly containerTree?: ContainerState;
}

export interface ContentFactoryResult {
  readonly element: HTMLElement;
  readonly dispose?: () => void;
}

export type ContentFactory = (tab: FrameTabConfig) => ContentFactoryResult;
