# Read-only Windows foreground detector. It never inspects content of other windows.
# Outputs '1' only when the real Windows desktop is foreground; '0' otherwise.
$ErrorActionPreference = 'Stop'
$source = @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class UnificForeground {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern IntPtr GetShellWindow();
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder sb, int nMaxCount);
  public static bool IsDesktopForeground() {
    IntPtr active=GetForegroundWindow();
    if (active == IntPtr.Zero) return false;
    if (active == GetShellWindow()) return true;
    StringBuilder name = new StringBuilder(64);
    GetClassName(active, name, name.Capacity);
    string cls = name.ToString();
    return cls == "Progman" || cls == "WorkerW";
  }
}
'@
try {
  Add-Type -TypeDefinition $source -ErrorAction Stop
  $last = ''
  while ($true) {
    $current = if ([UnificForeground]::IsDesktopForeground()) { '1' } else { '0' }
    if ($current -ne $last) {
      [Console]::Out.WriteLine($current)
      [Console]::Out.Flush()
      $last = $current
    }
    Start-Sleep -Milliseconds 350
  }
} catch {
  # Fail closed: never force overlay over other programs when detection is unavailable.
  [Console]::Out.WriteLine('0')
  [Console]::Out.Flush()
  exit 1
}
