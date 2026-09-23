import { html } from 'hono/html';
import { SessionData } from '../lib/types';

export interface LayoutProps {
  title: string;
  user?: SessionData | null;
  currentPath?: string;
  children: any;
  flash?: { type: 'success' | 'error' | 'info'; message: string } | null;
}

export function Layout({ title, user, currentPath = '/', children, flash }: LayoutProps) {
  return html`
<!DOCTYPE html>
<html lang="es" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} | IronPeak Fitness CRM</title>
  
  <!-- Google Fonts: Plus Jakarta Sans -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  
  <!-- Tailwind CSS Play CDN -->
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          fontFamily: {
            sans: ['"Plus Jakarta Sans"', 'sans-serif'],
          },
          colors: {
            brand: {
              black: '#09090b',
              surface: '#121215',
              card: '#18181b',
              border: '#27272a',
              hover: '#222226',
              orange: '#f97316',
              'orange-dark': '#ea580c',
              'orange-light': '#fb923c',
              'orange-subtle': 'rgba(249, 115, 22, 0.12)',
            }
          },
          boxShadow: {
            'orange-glow': '0 0 25px -5px rgba(249, 115, 22, 0.3)',
            'orange-sm': '0 0 10px rgba(249, 115, 22, 0.25)',
          }
        }
      }
    }
  </script>
  
  <style>
    /* Native CSS View Transitions API (MPA Cross-Document) */
    @view-transition {
      navigation: auto;
    }

    ::view-transition-group(root) {
      animation-duration: 0.28s;
      animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
    }

    ::view-transition-old(root) {
      animation: 0.2s cubic-bezier(0.4, 0, 1, 1) both fadeScaleOut;
    }

    ::view-transition-new(root) {
      animation: 0.28s cubic-bezier(0, 0, 0.2, 1) both fadeScaleIn;
    }

    @keyframes fadeScaleOut {
      from {
        opacity: 1;
        transform: translateY(0) scale(1);
        filter: blur(0);
      }
      to {
        opacity: 0;
        transform: translateY(-6px) scale(0.995);
        filter: blur(2px);
      }
    }

    @keyframes fadeScaleIn {
      from {
        opacity: 0;
        transform: translateY(8px) scale(1.005);
        filter: blur(3px);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
        filter: blur(0);
      }
    }

    /* Stable persistent chrome */
    aside {
      view-transition-name: app-sidebar;
    }
    header {
      view-transition-name: app-header;
    }
    main {
      view-transition-name: app-main-content;
    }

    ::view-transition-group(app-sidebar),
    ::view-transition-group(app-header) {
      animation: none;
    }

    ::view-transition-old(app-main-content) {
      animation: 0.18s cubic-bezier(0.4, 0, 1, 1) both fadeScaleOut;
    }
    ::view-transition-new(app-main-content) {
      animation: 0.26s cubic-bezier(0, 0, 0.2, 1) both fadeScaleIn;
    }

    body {
      background-color: #09090b;
      color: #f4f4f5;
    }

    /* Native Progress Bar */
    #progress-bar {
      position: fixed;
      top: 0;
      left: 0;
      height: 3px;
      width: 0%;
      background: linear-gradient(90deg, #ea580c, #f97316, #fb923c);
      box-shadow: 0 0 10px rgba(249, 115, 22, 0.8), 0 0 20px rgba(249, 115, 22, 0.4);
      z-index: 99999;
      pointer-events: none;
      transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease;
      opacity: 0;
    }
    #progress-bar.active {
      opacity: 1;
      width: 70%;
    }
    #progress-bar.finished {
      width: 100%;
      opacity: 0;
    }

    /* Custom scrollbars */
    ::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    ::-webkit-scrollbar-track {
      background: #09090b;
    }
    ::-webkit-scrollbar-thumb {
      background: #27272a;
      border-radius: 9999px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: #f97316;
    }
  </style>
</head>
<body class="bg-brand-black text-zinc-100 min-h-screen flex antialiased selection:bg-brand-orange selection:text-white">

  <!-- Sidebar -->
  <aside class="w-64 border-r border-brand-border bg-brand-surface/90 backdrop-blur-md flex flex-col shrink-0 fixed inset-y-0 left-0 z-30 transition-all duration-300">
    <!-- Brand Header -->
    <div class="p-5 border-b border-brand-border flex items-center justify-between">
      <a href="/" class="flex items-center gap-3 group">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-orange-dark to-brand-orange flex items-center justify-center text-white font-black text-xl shadow-orange-glow group-hover:scale-105 transition-transform">
          ⚡
        </div>
        <div>
          <span class="font-extrabold text-lg tracking-wider text-white flex items-center gap-1">
            IRON<span class="text-brand-orange">PEAK</span>
          </span>
          <span class="text-[10px] uppercase tracking-widest text-zinc-400 font-semibold block">FITNESS CRM</span>
        </div>
      </a>
    </div>

    <!-- Navigation links -->
    <nav class="flex-1 p-3 space-y-1.5 overflow-y-auto">
      <a href="/" class="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${currentPath === '/' ? 'bg-brand-orange text-white shadow-orange-sm font-semibold' : 'text-zinc-400 hover:text-white hover:bg-brand-hover'}">
        <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
        <span>Dashboard</span>
      </a>

      <a href="/leads" class="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${currentPath.startsWith('/leads') ? 'bg-brand-orange text-white shadow-orange-sm font-semibold' : 'text-zinc-400 hover:text-white hover:bg-brand-hover'}">
        <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
        <span>Leads & Pipeline</span>
      </a>

      <a href="/templates" class="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${currentPath === '/templates' ? 'bg-brand-orange text-white shadow-orange-sm font-semibold' : 'text-zinc-400 hover:text-white hover:bg-brand-hover'}">
        <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/></svg>
        <span>Plantillas WhatsApp</span>
      </a>

      <a href="/import-export" class="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${currentPath === '/import-export' ? 'bg-brand-orange text-white shadow-orange-sm font-semibold' : 'text-zinc-400 hover:text-white hover:bg-brand-hover'}">
        <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
        <span>Importar / Exportar</span>
      </a>

      ${user && user.role === 'admin' ? html`
        <div class="pt-4 pb-1">
          <span class="px-3.5 text-[11px] font-bold uppercase tracking-wider text-zinc-500">Administración</span>
        </div>
        <a href="/team" class="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${currentPath === '/team' ? 'bg-brand-orange text-white shadow-orange-sm font-semibold' : 'text-zinc-400 hover:text-white hover:bg-brand-hover'}">
          <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
          <span class="flex-1">Equipo & Auditoría</span>
          <span class="text-[10px] px-2 py-0.5 rounded-full bg-brand-orange/20 text-brand-orange font-bold">RBAC</span>
        </a>
      ` : ''}
    </nav>

    <!-- User Profile & Session Footer -->
    <div class="p-3 border-t border-brand-border bg-brand-black/60 space-y-2">
      ${user ? html`
        <div class="p-2.5 rounded-xl bg-brand-card/80 border border-brand-border flex items-center gap-3">
          <div class="w-9 h-9 rounded-full bg-brand-orange/20 border border-brand-orange/40 flex items-center justify-center text-brand-orange font-bold text-sm shrink-0 overflow-hidden">
            ${user.avatar_url ? html`<img src="${user.avatar_url}" class="w-full h-full object-cover"/>` : user.name.slice(0, 2).toUpperCase()}
          </div>
          <div class="overflow-hidden flex-1">
            <p class="text-xs font-semibold text-white truncate">${user.name}</p>
            <div class="flex items-center gap-1.5 mt-0.5">
              <span class="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded ${user.role === 'admin' ? 'bg-brand-orange text-white' : 'bg-zinc-800 text-zinc-300'}">
                ${user.role}
              </span>
              <span class="text-[11px] text-zinc-400 truncate">${user.email}</span>
            </div>
          </div>
        </div>

        <!-- Demo Quick Role Switcher -->
        <div class="pt-1 flex items-center justify-between text-xs text-zinc-400">
          <form action="/auth/quick-switch" method="POST" class="w-full flex gap-1">
            <input type="hidden" name="role" value="${user.role === 'admin' ? 'agent' : 'admin'}"/>
            <button type="submit" class="flex-1 py-1.5 px-2 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 rounded-lg text-[11px] font-medium transition flex items-center justify-center gap-1">
              🔄 Cambiar a <strong class="text-brand-orange capitalize">${user.role === 'admin' ? 'Agente' : 'Admin'}</strong>
            </button>
            <a href="/auth/logout" class="py-1.5 px-2.5 bg-red-950/40 hover:bg-red-900/60 text-red-400 rounded-lg text-[11px] font-medium transition" title="Cerrar sesión">
              Salir
            </a>
          </form>
        </div>
      ` : html`
        <a href="/login" class="w-full py-2 px-3 bg-brand-orange hover:bg-brand-orange-dark text-white rounded-xl text-xs font-semibold text-center block transition shadow-orange-sm">
          Iniciar Sesión
        </a>
      `}
    </div>
  </aside>

  <!-- Main Content Wrapper -->
  <div class="flex-1 pl-64 flex flex-col min-h-screen">
    <!-- Top Bar -->
    <header class="h-16 border-b border-brand-border bg-brand-surface/70 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-20">
      <div class="flex items-center gap-3">
        <h1 class="text-lg font-bold text-white tracking-tight">${title}</h1>
      </div>

      <div class="flex items-center gap-3">
        <!-- Status indicator -->
        <div class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900/90 border border-brand-border text-xs">
          <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span class="text-zinc-300 text-[11px] font-medium">Cloudflare Workers Edge Active</span>
        </div>

        <a href="/leads/new" class="inline-flex items-center gap-2 px-3.5 py-1.5 bg-brand-orange hover:bg-brand-orange-dark text-white text-xs font-bold rounded-xl transition shadow-orange-sm">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
          Nuevo Prospecto
        </a>
      </div>
    </header>

    <!-- Flash message -->
    ${flash ? html`
      <div class="px-6 pt-4">
        <div class="p-3.5 rounded-xl border text-sm flex items-center justify-between ${
          flash.type === 'error'
            ? 'bg-red-950/50 border-red-800/80 text-red-200'
            : flash.type === 'info'
            ? 'bg-blue-950/50 border-blue-800/80 text-blue-200'
            : 'bg-emerald-950/50 border-emerald-800/80 text-emerald-200'
        }">
          <div class="flex items-center gap-2">
            <span>${flash.type === 'error' ? '⚠️' : flash.type === 'info' ? 'ℹ️' : '✅'}</span>
            <span>${flash.message}</span>
          </div>
        </div>
      </div>
    ` : ''}

    <!-- View Body -->
    <main class="flex-1 p-6">
      ${children}
    </main>
  </div>

  <!-- Native Page Transitions & Progress Indicator Script -->
  <script>
    (function() {
      // 1. Crear indicador de barra de progreso superior
      const bar = document.createElement('div');
      bar.id = 'progress-bar';
      document.body.appendChild(bar);

      function startProgress() {
        bar.classList.remove('finished');
        bar.classList.add('active');
      }

      function finishProgress() {
        bar.classList.add('finished');
        setTimeout(function() {
          bar.classList.remove('active', 'finished');
        }, 300);
      }

      // 2. Interceptor de navegación fluida con View Transitions API
      document.addEventListener('click', function(e) {
        var link = e.target.closest('a');
        if (!link) return;
        var href = link.getAttribute('href');
        if (!href) return;
        if (link.target === '_blank' || link.hasAttribute('download')) return;
        if (href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:') || href.indexOf('wa.me') !== -1) return;

        var targetUrl = new URL(href, window.location.href);
        if (targetUrl.origin !== window.location.origin) return;
        if (targetUrl.pathname === window.location.pathname && targetUrl.search === window.location.search) return;

        // Si el navegador soporta View Transitions API
        if (document.startViewTransition) {
          e.preventDefault();
          startProgress();

          fetch(targetUrl.href)
            .then(function(res) {
              if (!res.ok) {
                window.location.href = targetUrl.href;
                return;
              }
              return res.text();
            })
            .then(function(htmlText) {
              if (!htmlText) return;
              var parser = new DOMParser();
              var doc = parser.parseFromString(htmlText, 'text/html');

              document.startViewTransition(function() {
                document.title = doc.title;

                var newMain = doc.querySelector('main');
                var currentMain = document.querySelector('main');
                if (newMain && currentMain) {
                  currentMain.innerHTML = newMain.innerHTML;
                }

                var newH1 = doc.querySelector('header h1');
                var currentH1 = document.querySelector('header h1');
                if (newH1 && currentH1) {
                  currentH1.innerHTML = newH1.innerHTML;
                }

                var newNav = doc.querySelector('aside nav');
                var currentNav = document.querySelector('aside nav');
                if (newNav && currentNav) {
                  currentNav.innerHTML = newNav.innerHTML;
                }

                window.history.pushState({}, '', targetUrl.href);
                window.scrollTo({ top: 0, behavior: 'instant' });
              });
            })
            .catch(function() {
              window.location.href = targetUrl.href;
            })
            .finally(function() {
              finishProgress();
            });
        } else {
          startProgress();
        }
      });

      // 3. Botones atrás / adelante del navegador
      window.addEventListener('popstate', function() {
        if (document.startViewTransition) {
          startProgress();
          fetch(window.location.href)
            .then(function(r) { return r.text(); })
            .then(function(htmlText) {
              var doc = new DOMParser().parseFromString(htmlText, 'text/html');
              document.startViewTransition(function() {
                document.title = doc.title;
                var newMain = doc.querySelector('main');
                var currentMain = document.querySelector('main');
                if (newMain && currentMain) currentMain.innerHTML = newMain.innerHTML;
                var newH1 = doc.querySelector('header h1');
                var currentH1 = document.querySelector('header h1');
                if (newH1 && currentH1) currentH1.innerHTML = newH1.innerHTML;
                var newNav = doc.querySelector('aside nav');
                var currentNav = document.querySelector('aside nav');
                if (newNav && currentNav) currentNav.innerHTML = newNav.innerHTML;
              });
            })
            .finally(function() {
              finishProgress();
            });
        }
      });

      // 4. Progreso al enviar formularios
      document.addEventListener('submit', function() {
        startProgress();
      });
    })();
  </script>
</body>
</html>
  `;
}
