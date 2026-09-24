import { JSX, Show, createSignal } from 'solid-js';
import { A, useLocation } from '@solidjs/router';
import { useAuth } from '../context/AuthContext';

export function Layout(props: { children: JSX.Element; title?: string }) {
  const { user, quickSwitch, logout } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = createSignal(false);

  const isCurrent = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const closeMobileMenu = () => setMobileMenuOpen(false);

  return (
    <div class="min-h-screen bg-zinc-950 text-zinc-100 selection:bg-orange-500 selection:text-white text-sm">
      {/* Mobile Backdrop Overlay */}
      <Show when={mobileMenuOpen()}>
        <div
          onClick={closeMobileMenu}
          class="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 md:hidden transition-opacity"
          aria-hidden="true"
        />
      </Show>

      {/* Sidebar (Desktop Permanent + Mobile Slide-out Drawer) */}
      <aside
        class={`w-64 border-r border-zinc-800 bg-zinc-900/95 backdrop-blur-md flex flex-col shrink-0 fixed inset-y-0 left-0 z-50 transition-transform duration-300 ease-in-out md:translate-x-0 ${
          mobileMenuOpen() ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
      >
        {/* Brand / Logo */}
        <div class="p-5 border-b border-zinc-800 flex items-center justify-between">
          <A href="/" onClick={closeMobileMenu} class="flex items-center gap-3 group">
            <div class="w-10 h-10 rounded-2xl bg-gradient-to-tr from-orange-600 to-orange-500 flex items-center justify-center text-white text-xl shadow-orange-glow group-hover:scale-105 transition-transform">
              ⚡
            </div>
            <div>
              <span class="font-black text-lg tracking-tight text-white flex items-center gap-1">
                IRON<span class="text-orange-500">PEAK</span>
              </span>
              <span class="text-[11px] text-zinc-400 font-semibold block">
                CRM & Pipeline
              </span>
            </div>
          </A>

          {/* Close button on mobile */}
          <button
            type="button"
            onClick={closeMobileMenu}
            class="md:hidden p-2 text-zinc-400 hover:text-white rounded-xl hover:bg-zinc-800 transition"
            aria-label="Cerrar menú"
          >
            ✕
          </button>
        </div>

        {/* Navigation */}
        <nav class="flex-1 p-4 space-y-1.5 overflow-y-auto">
          <A
            href="/"
            onClick={closeMobileMenu}
            class={`flex items-center gap-3 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all ${
              isCurrent('/')
                ? 'bg-orange-500 text-white shadow-orange-glow'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
            }`}
          >
            <span class="text-base">📊</span>
            <span>Inicio / Dashboard</span>
          </A>

          <A
            href="/leads"
            onClick={closeMobileMenu}
            class={`flex items-center gap-3 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all ${
              isCurrent('/leads') && location.pathname !== '/leads/new'
                ? 'bg-orange-500 text-white shadow-orange-glow'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
            }`}
          >
            <span class="text-base">👥</span>
            <span>Lista de Prospectos</span>
          </A>

          <A
            href="/templates"
            onClick={closeMobileMenu}
            class={`flex items-center gap-3 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all ${
              isCurrent('/templates')
                ? 'bg-orange-500 text-white shadow-orange-glow'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
            }`}
          >
            <span class="text-base">💬</span>
            <span>Plantillas WhatsApp</span>
          </A>

          <A
            href="/import-export"
            onClick={closeMobileMenu}
            class={`flex items-center gap-3 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all ${
              isCurrent('/import-export')
                ? 'bg-orange-500 text-white shadow-orange-glow'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
            }`}
          >
            <span class="text-base">📁</span>
            <span>Importar / Exportar</span>
          </A>

          <Show when={user()?.role === 'admin'}>
            <div class="pt-3 pb-1">
              <div class="border-t border-zinc-800/80 my-1"></div>
            </div>
            <A
              href="/team"
              onClick={closeMobileMenu}
              class={`flex items-center gap-3 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all ${
                isCurrent('/team')
                  ? 'bg-orange-500 text-white shadow-orange-glow'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
              }`}
            >
              <span class="text-base">🛡️</span>
              <span>Equipo & Permisos</span>
            </A>
          </Show>
        </nav>

        {/* User Card & Switcher */}
        <div class="p-4 border-t border-zinc-800 bg-zinc-900/60 space-y-3">
          <Show
            when={user()}
            fallback={
              <A
                href="/login"
                onClick={closeMobileMenu}
                class="w-full py-2.5 px-4 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-bold text-center block transition shadow-orange-glow"
              >
                Iniciar Sesión
              </A>
            }
          >
            <div class="p-3 rounded-2xl bg-zinc-800/50 border border-zinc-800 flex items-center gap-3">
              <div class="w-9 h-9 rounded-full bg-orange-500/20 border border-orange-500/40 flex items-center justify-center text-orange-400 font-bold text-xs shrink-0 overflow-hidden">
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
                <p class="font-bold text-white text-xs truncate">{user()?.name}</p>
                <p class="text-[11px] text-zinc-400 truncate flex items-center gap-1">
                  <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
                  <span>{user()?.role === 'admin' ? 'Director / Admin' : 'Coach / Ventas'}</span>
                </p>
              </div>
            </div>

            {/* Quick role switcher & logout */}
            <div class="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  quickSwitch(user()?.role === 'admin' ? 'agent' : 'admin')
                }
                class="flex-1 py-1.5 px-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-[11px] font-semibold transition border border-zinc-700/60 flex items-center justify-center gap-1 cursor-pointer"
                title="Cambiar vista para probar"
              >
                <span>🔄 {user()?.role === 'admin' ? 'Ver Coach' : 'Ver Admin'}</span>
              </button>
              <button
                type="button"
                onClick={logout}
                class="py-1.5 px-2.5 bg-red-950/40 hover:bg-red-900/60 text-red-400 rounded-xl text-[11px] font-semibold transition cursor-pointer"
                title="Cerrar sesión"
              >
                Salir
              </button>
            </div>
          </Show>
        </div>
      </aside>

      {/* Main Content Area */}
      <div class="md:pl-64 flex flex-col min-h-screen">
        {/* Top Header (Mobile hamburger + Desktop sticky title) */}
        <header class="h-16 md:h-20 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-md px-4 sm:px-8 flex items-center justify-between sticky top-0 z-30">
          <div class="flex items-center gap-3">
            {/* Mobile Hamburger Button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              class="md:hidden p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white"
              aria-label="Abrir menú de navegación"
            >
              <span class="text-lg">☰</span>
            </button>

            <div>
              <h1 class="text-base sm:text-xl font-extrabold text-white tracking-tight">
                {props.title || 'Control de Prospectos'}
              </h1>
              <p class="text-[11px] sm:text-xs text-zinc-400 hidden sm:block">
                Gestión comercial, segmentación inteligente y WhatsApp
              </p>
            </div>
          </div>

          <div class="flex items-center gap-3">
            <A
              href="/leads/new"
              class="inline-flex items-center gap-1.5 px-3.5 sm:px-5 py-2 sm:py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-xl sm:rounded-2xl transition shadow-orange-glow hover:scale-105 transform"
            >
              <span>➕</span>
              <span class="hidden sm:inline">Anotar Nuevo Prospecto</span>
              <span class="sm:hidden">Nuevo</span>
            </A>
          </div>
        </header>

        {/* Page Content */}
        <main class="flex-1 p-4 sm:p-8">{props.children}</main>
      </div>
    </div>
  );
}
