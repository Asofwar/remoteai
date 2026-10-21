import { isLanguage, msg, setLanguage } from "./i18n";

const fragment = new URLSearchParams(window.location.hash.slice(1));
const received = fragment.get("token");
if (fragment.has("theme")) sessionStorage.setItem("coze-theme", fragment.get("theme") ?? "light");
const language = fragment.get("lang");
if (isLanguage(language)) setLanguage(language);
if (received) {
  sessionStorage.setItem("coze-session", received);
  history.replaceState(null, "", location.pathname);
}

/** Carries the HTTP status; the message stays the untranslated server text (render it with t()). */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T>(method: string, params?: unknown): Promise<T> {
  const response = await fetch("/api", {
    method: "POST", headers: { "Content-Type": "application/json",
      Authorization: `Bearer ${sessionStorage.getItem("coze-session") ?? ""}` },
    body: JSON.stringify({ method, ...(params === undefined ? {} : { params }) }),
  });
  const value: unknown = await response.json();
  if (!response.ok) {
    const error = value && typeof value === "object" && "error" in value ? String(value.error) : msg("操作未完成，请重试。");
    throw new ApiError(error, response.status);
  }
  return value as T;
}

/** Returns the untranslated message; translate it where it is displayed. */
export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : msg("操作未完成，请重试。");
}

export function fileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(msg("文件未能读取，请重新选择。")));
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.readAsDataURL(file);
  });
}
