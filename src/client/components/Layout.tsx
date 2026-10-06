import { JSX, Show, createSignal } from 'solid-js';
import { A, useLocation } from '@solidjs/router';
import { useAuth } from '../context/AuthContext';
import { ThemeToggle } from '../context/ThemeContext';
import {
  Zap,
  X,
  LayoutDashboard,
  Users,
  MessageSquare,
  FileText,
  ArrowUpDown,
  Activity,
  Settings,
  ShieldCheck,
  LogOut,
  Menu,
  Plus,
} from 'lucide-solid';

export function Layout(props: { children: JSX.Element; title?: string }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = createSignal(false);

  const isCurrent = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const closeMobileMenu = () => setMobileMenuOpen(false);

  return (
    <div class="min-h-screen bg-app text-body selection:bg-accent selection:text-white text-sm">
      {/* Mobile Backdrop Overlay */}
      <Show when={mobileMenuOpen()}>
        <div
          onClick={closeMobileMenu}
          class="fixed inset-0 bg-black/50 backdrop-blur-xs z-40 md:hidden transition-opacity"
          aria-hidden="true"
        />
      </Show>

      {/* Sidebar (Desktop Permanent + Mobile Slide-out Drawer) */}
      <aside
        class={`w-60 border-r border-edge bg-surface flex flex-col shrink-0 fixed inset-y-0 left-0 z-50 transition-transform duration-200 ease-in-out md:translate-x-0 ${
          mobileMenuOpen() ? 'translate-x-0 shadow-lg' : '-translate-x-full'
        }`}
      >
        {/* Brand / Logo */}
        <div class="p-4 border-b border-edge flex items-center justify-between">
          <A href="/" onClick={closeMobileMenu} class="flex items-center gap-2.5 group">
            <div class="w-8 h-8 rounded-lg bg-accent flex items-center justify-center text-white transition-transform">
              <Zap class="w-4 h-4 text-white" />
            </div>
            <div>
              <span class="font-bold text-sm tracking-tight text-body flex items-center gap-0.5">
                FITNESS<span class="text-accent-text">CLUB</span>
              </span>
              <span class="text-[10px] text-muted font-medium block leading-none mt-0.5">
                CRM & Pipeline
              </span>
            </div>
          </A>

          {/* Close button on mobile */}
          <button
            type="button"
            onClick={closeMobileMenu}
            class="md:hidden p-1.5 text-muted hover:text-body rounded-lg hover:bg-elevate transition"
            aria-label="Cerrar menú"
          >
            <X class="w-4 h-4" />
          </button>
        </div>

        {/* Navigation */}
        <nav class="flex-1 p-3 space-y-1 overflow-y-auto">
          <A
            href="/"
            onClick={closeMobileMenu}
            class={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
              isCurrent('/')
                ? 'bg-accent text-white font-semibold'
                : 'text-muted hover:text-body hover:bg-elevate/80'
            }`}
          >
            <LayoutDashboard class="w-4 h-4 shrink-0" />
            <span>Inicio / Dashboard</span>
          </A>

          <A
            href="/leads"
            onClick={closeMobileMenu}
            class={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
              isCurrent('/leads') && location.pathname !== '/leads/new'
                ? 'bg-accent text-white font-semibold'
                : 'text-muted hover:text-body hover:bg-elevate/80'
            }`}
          >
            <Users class="w-4 h-4 shrink-0" />
            <span>Lista de Prospectos</span>
          </A>

          <A
            href="/inbox"
            onClick={closeMobileMenu}
            class={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
              isCurrent('/inbox')
                ? 'bg-emerald-600 text-white font-semibold'
                : 'text-muted hover:text-body hover:bg-elevate/80'
            }`}
          >
            <MessageSquare class="w-4 h-4 shrink-0" />
            <span>Chat WhatsApp</span>
          </A>

          <A
            href="/templates"
            onClick={closeMobileMenu}
            class={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
              isCurrent('/templates')
                ? 'bg-accent text-white font-semibold'
                : 'text-muted hover:text-body hover:bg-elevate/80'
            }`}
          >
            <FileText class="w-4 h-4 shrink-0" />
            <span>Plantillas WhatsApp</span>
          </A>

          <A
            href="/import-export"
            onClick={closeMobileMenu}
            class={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
              isCurrent('/import-export')
                ? 'bg-accent text-white font-semibold'
                : 'text-muted hover:text-body hover:bg-elevate/80'
            }`}
          >
            <ArrowUpDown class="w-4 h-4 shrink-0" />
            <span>Importar / Exportar</span>
          </A>

          <A
            href="/activities"
            onClick={closeMobileMenu}
            class={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
              isCurrent('/activities')
                ? 'bg-accent text-white font-semibold'
                : 'text-muted hover:text-body hover:bg-elevate/80'
            }`}
          >
            <Activity class="w-4 h-4 shrink-0" />
            <span>Catálogo de actividades</span>
          </A>

          <Show when={user()?.role === 'admin'}>
            <div class="pt-2 pb-1">
              <div class="border-t border-edge my-1"></div>
            </div>

            <A
              href="/settings/whatsapp"
              onClick={closeMobileMenu}
              class={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                isCurrent('/settings/whatsapp')
                  ? 'bg-accent text-white font-semibold'
                  : 'text-muted hover:text-body hover:bg-elevate/80'
              }`}
            >
              <Settings class="w-4 h-4 shrink-0" />
              <span>Ajustes WhatsApp & IA</span>
            </A>

            <A
              href="/team"
              onClick={closeMobileMenu}
              class={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                isCurrent('/team')
                  ? 'bg-accent text-white font-semibold'
                  : 'text-muted hover:text-body hover:bg-elevate/80'
              }`}
            >
              <ShieldCheck class="w-4 h-4 shrink-0" />
              <span>Equipo & Permisos</span>
            </A>
          </Show>
        </nav>

        {/* User Card & Switcher */}
        <div class="p-3 border-t border-edge bg-surface space-y-2">
          <Show
            when={user()}
            fallback={
              <A
                href="/login"
                onClick={closeMobileMenu}
                class="w-full py-2 px-3 bg-accent hover:bg-accent-hover text-white rounded-lg text-xs font-medium text-center block transition"
              >
                Iniciar Sesión
              </A>
            }
          >
            <div class="p-2 rounded-lg bg-elevate/60 border border-edge flex items-center gap-2.5">
              <div class="w-7 h-7 rounded-md bg-accent/15 border border-accent/30 flex items-center justify-center text-accent-text font-bold text-[11px] shrink-0 overflow-hidden">
                <Show
                  when={user()?.avatar_url}
                  fallback={user()?.name.slice(0, 2).toUpperCase()}
                >
                  <img
                    src={user()?.avatar_url}
                    alt={user()?.name}
                    class="w-full h-full object-cover"
                  />
                </Show>
              </div>
              <div class="overflow-hidden flex-1 min-w-0">
                <p class="font-medium text-body text-xs truncate leading-tight">{user()?.name}</p>
                <p class="text-[10px] text-muted truncate flex items-center gap-1 mt-0.5">
                  <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
                  <span>{user()?.role === 'admin' ? 'Admin' : 'Coach'}</span>
                </p>
              </div>
            </div>

            {/* Logout button */}
            <button
              type="button"
              onClick={logout}
              class="w-full py-1.5 px-2 bg-elevate hover:bg-red-500/10 hover:border-red-500/30 text-muted hover:text-red-500 rounded-lg text-xs font-medium transition border border-edge flex items-center justify-center gap-1.5 cursor-pointer"
              title="Cerrar sesión"
            >
              <LogOut class="w-3.5 h-3.5 shrink-0" />
              <span>Cerrar Sesión</span>
            </button>
          </Show>
        </div>
      </aside>

      {/* Main Content Area */}
      <div class="md:pl-60 flex flex-col min-h-screen">
        {/* Top Header */}
        <header class="h-14 sm:h-16 border-b border-edge bg-surface/80 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30">
          <div class="flex items-center gap-3">
            {/* Mobile Hamburger Button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              class="md:hidden p-1.5 rounded-lg bg-surface border border-edge text-body-soft hover:text-body"
              aria-label="Abrir menú de navegación"
            >
              <Menu class="w-4 h-4" />
            </button>

            <div>
              <h1 class="text-sm sm:text-base font-bold text-body tracking-tight">
                {props.title || 'Control de Prospectos'}
              </h1>
              <p class="text-[11px] text-muted hidden sm:block">
                Gestión comercial, segmentación y WhatsApp
              </p>
            </div>
          </div>

          <div class="flex items-center gap-2.5">
            <ThemeToggle class="p-2 rounded-lg bg-surface border border-edge text-body-soft hover:text-body hover:border-edge-strong transition cursor-pointer flex items-center justify-center" />
            <A
              href="/leads/new"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 bg-accent hover:bg-accent-hover text-white text-xs font-semibold rounded-lg transition"
            >
              <Plus class="w-3.5 h-3.5" />
              <span class="hidden sm:inline">Nuevo Prospecto</span>
              <span class="sm:hidden">Nuevo</span>
            </A>
          </div>
        </header>

        {/* Page Content */}
        <main class="flex-1 p-4 sm:p-6">{props.children}</main>
      </div>
    </div>
  );
}
