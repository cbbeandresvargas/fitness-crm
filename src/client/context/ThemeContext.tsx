import { createContext, useContext, createSignal, JSX, Show } from 'solid-js';
import { Sun, Moon } from 'lucide-solid';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: () => Theme;
  isDark: () => boolean;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>();

export function ThemeProvider(props: { children: JSX.Element }) {
  const [theme, setTheme] = createSignal<Theme>(
    document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  );

  const applyTheme = (next: Theme) => {
    document.documentElement.classList.toggle('dark', next === 'dark');
    localStorage.setItem('theme', next);
    setTheme(next);
  };

  const toggleTheme = () => applyTheme(theme() === 'dark' ? 'light' : 'dark');

  return (
    <ThemeContext.Provider value={{ theme, isDark: () => theme() === 'dark', toggleTheme }}>
      {props.children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

export function ThemeToggle(props: { class?: string }) {
  const { isDark, toggleTheme } = useTheme();
  return (
    <button
      type="button"
      onClick={toggleTheme}
      class={
        props.class ??
        'p-2 sm:p-2.5 rounded-xl bg-surface border border-edge text-body-soft hover:text-body hover:border-accent/50 transition cursor-pointer flex items-center justify-center'
      }
      title={isDark() ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      aria-label="Cambiar tema"
    >
      <Show when={isDark()} fallback={<Sun size={16} />}>
        <Moon size={16} />
      </Show>
    </button>
  );
}
