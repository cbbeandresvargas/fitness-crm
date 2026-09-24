import { JSX, Show } from 'solid-js';
import { A, useLocation } from '@solidjs/router';
import { useAuth } from '../context/AuthContext';

export function Layout(props: { children: JSX.Element; title?: string }) {
  const { user, quickSwitch, logout } = useAuth();
  const location = useLocation();

  const isCurrent = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <div class="flex min-h-screen bg-zinc-950 text-zinc-100 selection:bg-orange-500 selection:text-white text-sm">
      {/* Sidebar fijo */}
      <aside class="w-64 border-r border-zinc-800 bg-zinc-900/90 backdrop-blur-md flex flex-col shrink-0 fixed inset-y-0 left-0 z-30">
        {/* Brand / Logo */}
        <div class="p-5 border-b border-zinc-800">
          <A href="/" class="flex items-center gap-3 group">
            <div class="w-11 h-11 rounded-2xl bg-gradient-to-tr from-orange-600 to-orange-500 flex items-center justify-center text-white text-2xl shadow-orange-glow group-hover:scale-105 transition-transform">
              ⚡
            </div>
            <div>
              <span class="font-extrabold text-xl tracking-tight text-white flex items-center gap-1">
                IRON<span class="text-orange-500">PEAK</span>
              </span>
              <span class="text-xs text-zinc-400 font-medium block">
                CRM & Pipeline
              </span>
            </div>
          </A>
        </div>

        {/* Navigation */}
        <nav class="flex-1 p-4 space-y-1.5 overflow-y-auto">
          <A
            href="/"
            class={`flex items-center gap-3.5 px-4 py-3 rounded-2xl text-sm font-semibold transition-all ${
              isCurrent('/')
                ? 'bg-orange-500 text-white shadow-orange-glow'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
            }`}
          >
            <span class="text-lg">📊</span>
            <span>Inicio</span>
          </A>

          <A
            href="/leads"
            class={`flex items-center gap-3.5 px-4 py-3 rounded-2xl text-sm font-semibold transition-all ${
              isCurrent('/leads') && location.pathname !== '/leads/new'
                ? 'bg-orange-500 text-white shadow-orange-glow'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
            }`}
          >
            <span class="text-lg">👥</span>
            <span>Lista de Prospectos</span>
          </A>

          <A
            href="/templates"
            class={`flex items-center gap-3.5 px-4 py-3 rounded-2xl text-sm font-semibold transition-all ${
              isCurrent('/templates')
                ? 'bg-orange-500 text-white shadow-orange-glow'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
            }`}
          >
            <span class="text-lg">💬</span>
            <span>Mensajes WhatsApp</span>
          </A>

          <A
            href="/import-export"
            class={`flex items-center gap-3.5 px-4 py-3 rounded-2xl text-sm font-semibold transition-all ${
              isCurrent('/import-export')
                ? 'bg-orange-500 text-white shadow-orange-glow'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
            }`}
          >
            <span class="text-lg">📁</span>
            <span>Subir o Bajar Excel</span>
          </A>

          <Show when={user()?.role === 'admin'}>
            <div class="pt-4 pb-1">
              <div class="border-t border-zinc-800 my-2"></div>
            </div>
            <A
              href="/team"
              class={`flex items-center gap-3.5 px-4 py-3 rounded-2xl text-sm font-semibold transition-all ${
                isCurrent('/team')
                  ? 'bg-orange-500 text-white shadow-orange-glow'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
              }`}
            >
              <span class="text-lg">🛡️</span>
              <span>Equipo y Permisos</span>
            </A>
          </Show>
        </nav>

        {/* User Card & Switcher */}
        <div class="p-4 border-t border-zinc-800 bg-zinc-900/50 space-y-3">
          <Show
            when={user()}
            fallback={
              <A
                href="/login"
                class="w-full py-3 px-4 bg-orange-500 hover:bg-orange-600 text-white rounded-2xl text-xs font-bold text-center block transition shadow-orange-glow"
              >
                Iniciar Sesión
              </A>
            }
          >
            <div class="p-3 rounded-2xl bg-zinc-800/50 border border-zinc-800 flex items-center gap-3">
              <div class="w-10 h-10 rounded-full bg-orange-500/20 border border-orange-500/40 flex items-center justify-center text-orange-400 font-bold text-sm shrink-0 overflow-hidden">
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
              <div class="overflow-hidden flex-1">
                <p class="font-bold text-white text-xs truncate">{user()?.name}</p>
                <p class="text-[11px] text-zinc-400 truncate">
                  {user()?.role === 'admin' ? '👑 Administrador' : '🏋️ Vendedor / Coach'}
                </p>
              </div>
            </div>

            {/* Role quick switcher */}
            <div class="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  quickSwitch(user()?.role === 'admin' ? 'agent' : 'admin')
                }
                class="flex-1 py-2 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-semibold transition border border-zinc-700/60 flex items-center justify-center gap-1.5 cursor-pointer"
                title="Cambiar vista para probar"
              >
                <span>🔄 Ver como {user()?.role === 'admin' ? 'Coach' : 'Admin'}</span>
              </button>
              <button
                type="button"
                onClick={logout}
                class="py-2 px-3 bg-red-950/40 hover:bg-red-900/60 text-red-400 rounded-xl text-xs font-semibold transition cursor-pointer"
                title="Salir"
              >
                Salir
              </button>
            </div>
          </Show>
        </div>
      </aside>

      {/* Main Content Area */}
      <div class="flex-1 pl-64 flex flex-col min-h-screen">
        {/* Sticky Header */}
        <header class="h-20 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md px-8 flex items-center justify-between sticky top-0 z-20">
          <div>
            <h1 class="text-xl font-extrabold text-white tracking-tight">
              {props.title || 'Control de Prospectos'}
            </h1>
            <p class="text-xs text-zinc-400 mt-0.5">
              Gestión visual, segmentación inteligente y WhatsApp
            </p>
          </div>

          <div class="flex items-center gap-4">
            <A
              href="/leads/new"
              class="inline-flex items-center gap-2 px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-2xl transition shadow-orange-glow hover:scale-105 transform"
            >
              <span class="text-base">➕</span>
              <span>Anotar Nuevo Prospecto</span>
            </A>
          </div>
        </header>

        {/* Page Content */}
        <main class="flex-1 p-8">{props.children}</main>
      </div>
    </div>
  );
}
