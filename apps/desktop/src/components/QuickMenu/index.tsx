import { MenuPanel } from "./MenuPanel";
import { useQuickMenu } from "./useQuickMenu";
import "./styles.css";

export function QuickMenu() {
  const menu = useQuickMenu();
  return <MenuPanel key={menu.snapshot?.revision ?? 0} {...menu} />;
}
