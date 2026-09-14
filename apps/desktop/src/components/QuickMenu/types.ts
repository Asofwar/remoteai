export interface MenuEntry {
  id: string;
  text: string;
  enabled: boolean;
  checked: boolean;
  separator: boolean;
  children: MenuEntry[];
}

export interface MenuSnapshot {
  revision: number;
  entries: MenuEntry[];
}
