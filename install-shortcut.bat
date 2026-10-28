@echo off
REM ====================================================================
REM TradeStack — create a double-clickable desktop shortcut.
REM The shortcut launches docker-start.bat so the stack boots with one click.
REM ====================================================================
setlocal

set "SCRIPT_DIR=%~dp0"
set "TARGET=%SCRIPT_DIR%docker-start.bat"

powershell -NoProfile -Command ^
  "$sh = New-Object -ComObject WScript.Shell; ^
   $lnk = $sh.CreateShortcut([Environment]::GetFolderPath('Desktop') + '\TradeStack.lnk'); ^
   $lnk.TargetPath = '%TARGET%'; ^
   $lnk.WorkingDirectory = '%SCRIPT_DIR%'; ^
   $lnk.WindowStyle = 1; ^
   $lnk.Save()"

if %errorlevel% equ 0 (
  echo Desktop shortcut created:  Desktop\TradeStack.lnk
  echo Double-click it to start TradeStack (Docker).
) else (
  echo Failed to create shortcut.
)
pause
