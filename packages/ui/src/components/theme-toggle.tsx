import { MoonIcon, SunIcon } from "lucide-react";

import { useTheme } from "../hooks/use-theme";
import { Button } from "./button";

export function ThemeToggle() {
  const { theme, setPreference } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      onPress={() => setPreference(theme === "dark" ? "light" : "dark")}
    >
      {theme === "dark" ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />}
    </Button>
  );
}
