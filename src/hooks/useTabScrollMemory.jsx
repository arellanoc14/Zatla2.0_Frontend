import { useCallback } from "react";
import { useLocation } from "react-router-dom";

// Per-tab scroll memory. Keeps an independent scroll position for each tab route
// so switching tabs (and coming back) preserves where the user was, instead of
// resetting the view to the top. Module-level state persists across renders.
const scrollByPath = new Map();
// Set true while a tab switch is restoring scroll, so ScrollToTop defers to us
// instead of forcing the destination back to the top.
let restoringTab = false;

export function isRestoringTab() {
  return restoringTab;
}

export function clearRestoringTab() {
  restoringTab = false;
}

export function useTabScrollMemory() {
  const location = useLocation();

  // Save the current tab's scroll position, then mark that the next navigation
  // is a tab switch whose scroll we'll restore ourselves.
  const onTabNavigate = useCallback((targetPath) => {
    scrollByPath.set(location.pathname, window.scrollY || 0);
    restoringTab = true;
    const y = scrollByPath.get(targetPath) ?? 0;
    // Restore after the destination page paints.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.scrollTo({ top: y, left: 0, behavior: "instant" });
        restoringTab = false;
      });
    });
  }, [location.pathname]);

  return { onTabNavigate };
}