# Hotkey Issue Resolution Walkthrough

## 1. Issue Diagnosed
- **Symptom**: "Compact Mode Toggle" hotkey (Shift+2, Alt+1) not working, while HUD Show/Hide works.
- **Root Cause**: 
  1. **Duplicate Listeners**: Two separate listeners for `toggle-compact-mode` were defined in `HudPage`. When triggered, they would both execute, effectively toggling the state twice (false -> true -> false).
  2. **Subtle UI Change**: The `isCompact` state only changed internal padding without resizing the actual Electron window, making it hard to notice.
  3. **Terminology Ambiguity**: The hotkey toggled `isCompact` but the "Compact Mode" switch in settings toggled `isMinimal`.

## 2. Changes Made
- **Consolidation**: Removed the duplicate listener from the `currentSelectionTarget` useEffect and moved it to the main mount useEffect.
- **State Sync**: Updated the hotkey listener to toggle BOTH `isCompact` and `isMinimal` simultaneously.
- **Window Resizing**: Added logic to the window resize useEffect to reduce the Electron window height from 210px to 120px when in compact mode.
- **Visual Feedback**: Added a `compactToast` overlay that displays "압축 모드: 켜짐 (ON)" or "꺼짐 (OFF)" for 1.5 seconds when triggered via hotkey.

## 3. Verification
- Pressing the registered hotkey (default Shift+2) should now:
  - Shrink the UI layout.
  - Hide the background (Stealth mode).
  - Resize the actual application window.
  - Show a visual confirmation on screen.
