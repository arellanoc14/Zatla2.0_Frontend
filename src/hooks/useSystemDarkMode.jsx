import { useEffect } from "react";

// The app always uses the dark theme, regardless of system preference,
// so it looks the same in the builder preview and the published app.
export function useSystemDarkMode() {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);
}