import { expect, it } from "vitest";
import { commandPreview } from "./commandPreview";

it("shows the script inside a known PowerShell command wrapper", () => {
  expect(commandPreview('"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"'
    + ' -NoProfile -Command "Write-Output \'DISPLAY-FIRST\'"')).toBe("Write-Output 'DISPLAY-FIRST'");
  expect(commandPreview("pwsh -NoLogo -NonInteractive -c 'echo hello'")).toBe("echo hello");
  expect(commandPreview('powershell -Command Get-Date')).toBe("Get-Date");
});

it.each(['npm test', 'echo "powershell -Command hello"', 'app -Command "hello"',
  'powershell -File script.ps1', 'powershell -EncodedCommand aGVsbG8='])
  ("preserves commands it cannot safely abbreviate: %s", (command) => {
    expect(commandPreview(command)).toBe(command);
  });

it("keeps mixed legacy script quoting intact while omitting the known launcher", () => {
  expect(commandPreview('powershell -Command "unclosed')).toBe('"unclosed');
  const script = '\'Write-Output "legacy"';
  expect(commandPreview('"C:\\\\WINDOWS\\\\System32\\\\powershell.exe" -Command ' + script)).toBe(script);
});
