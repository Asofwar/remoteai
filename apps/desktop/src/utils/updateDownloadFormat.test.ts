import { expect, it } from "vitest";
import { formatUpdateDownloadBytes } from "./updateDownloadFormat";

it.each([
  [0, "0.00 KB"],
  [512, "0.50 KB"],
  [1024, "1.00 KB"],
  [1023 * 1024, "1023.00 KB"],
  [1024 ** 2, "1.00 MB"],
  [1.25 * 1024 ** 2, "1.25 MB"],
  [1024 ** 3, "1.00 GB"],
  [2.5 * 1024 ** 3, "2.50 GB"],
])("formats %s bytes as %s", (bytes, expected) => {
  expect(formatUpdateDownloadBytes(bytes)).toBe(expected);
});
