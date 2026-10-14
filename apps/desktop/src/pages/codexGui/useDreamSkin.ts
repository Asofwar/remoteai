import { useEffect, useState, type CSSProperties } from "react";
import { loadDreamSkinStatus, loadDreamSkinThemePreview } from "../../api/backend";
import type { DreamSkinStatus } from "../../types";
import { DREAM_SKIN_STATUS_CHANGED } from "../dreamSkin/statusEvents";
import { useGuiSkin } from "./guiSkin";

const DEFAULT_OVERLAY_OPACITY = 0.8;
type Skin = {
  status: Pick<DreamSkinStatus, "installed" | "session" | "activeThemeOverlayOpacity">;
  image: string | null;
};
type SkinStyle = CSSProperties & Record<`--${string}`, string | number>;

export function dreamSkinStyle({ status, image }: Skin): SkinStyle | undefined {
  if (!status.installed || status.session === "paused" || !image) return undefined;
  const opacity = status.activeThemeOverlayOpacity;
  const overlay = typeof opacity === "number" && Number.isFinite(opacity)
    ? Math.min(1, Math.max(0, opacity)) : DEFAULT_OVERLAY_OPACITY;
  // Skin metadata must not override the GUI appearance, including "follow application".
  return {
    "--gui-skin-image": `url(${JSON.stringify(image)})`,
    "--gui-skin-overlay": `${overlay * 100}%`,
  };
}

export function useDreamSkin(active: boolean) {
  const settings = useGuiSkin();
  const sharedSkin = useSharedDreamSkin(active && settings.mode === "inherit");
  const selectedImage = useSelectedImage(active && settings.mode === "custom", settings);
  if (settings.mode === "none") return undefined;
  if (settings.mode === "inherit") return sharedSkin ? dreamSkinStyle(sharedSkin) : undefined;
  return dreamSkinStyle({ image: selectedImage, status: {
    installed: true, session: "active", activeThemeOverlayOpacity: settings.overlayOpacity,
  } });
}

function useSelectedImage(active: boolean, { themeId, imageRevision }: ReturnType<typeof useGuiSkin>) {
  const [preview, setPreview] = useState<{ id: string; image: string | null } | null>(null);
  useEffect(() => {
    if (!active || !themeId) return;
    let disposed = false;
    void loadDreamSkinThemePreview(themeId).then((image) => {
      if (!disposed) setPreview({ id: themeId, image });
    }).catch(() => { if (!disposed) setPreview(null); });
    return () => { disposed = true; };
  }, [active, themeId, imageRevision]);
  return preview?.id === themeId ? preview.image : null;
}

function useSharedDreamSkin(active: boolean) {
  const [skin, setSkin] = useState<Skin | null>(null);
  useEffect(() => {
    if (!active) return;
    let disposed = false;
    let revision = 0;
    const apply = async (status: DreamSkinStatus, request: number) => {
      const enabled = status.installed && status.session !== "paused" && status.activeThemeId;
      try {
        const image = enabled ? await loadDreamSkinThemePreview(status.activeThemeId!) : null;
        if (!disposed && request === revision) setSkin({ status, image });
      } catch {
        // An unavailable image should leave the conversation readable with its ordinary theme.
        if (!disposed && request === revision) setSkin(null);
      }
    };
    const changed = (event: Event) => { void apply((event as CustomEvent<DreamSkinStatus>).detail, ++revision); };
    window.addEventListener(DREAM_SKIN_STATUS_CHANGED, changed);
    if (active) {
      const request = ++revision;
      void loadDreamSkinStatus().then((status) => {
        if (!disposed && request === revision) return apply(status, request);
      }).catch(() => { /* Keep the last usable theme when a status refresh is unavailable. */ });
    }
    return () => { disposed = true; window.removeEventListener(DREAM_SKIN_STATUS_CHANGED, changed); };
  }, [active]);
  return skin;
}
