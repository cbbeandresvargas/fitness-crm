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
  <title>${title} | IronPeak Fitness</title>
  
  <!-- Fuente moderna y super legible -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  
  <!-- Tailwind CSS -->
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
              orange: '#f97316',
              'orange-dark': '#ea580c',
              'orange-light': '#fb923c',
              'orange-subtle': 'rgba(249, 115, 22, 0.12)',
            }
          },
          boxShadow: {
            'orange-glow': '0 0 25px -5px rgba(249, 115, 22, 0.35)',
            'green-glow': '0 0 25px -5px rgba(34, 197, 94, 0.35)',
          }
        }
      }
    }
  </script>
  
  <style>
    /* Transiciones de página suaves y nativas */
    @view-transition {
      navigation: auto;
    }
    ::view-transition-group(root) {
      animation-duration: 0.25s;
      animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
    }
    ::view-transition-old(root) {
      animation: 0.18s cubic-bezier(0.4, 0, 1, 1) both fadeOut;
    }
    ::view-transition-new(root) {
      animation: 0.25s cubic-bezier(0, 0, 0.2, 1) both fadeIn;
    }
    @keyframes fadeOut {
      from { opacity: 1; transform: scale(1); }
      to { opacity: 0; transform: scale(0.995); }
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: scale(1.005); }
      to { opacity: 1; transform: scale(1); }
    }

    aside { view-transition-name: app-sidebar; }
    header { view-transition-name: app-header; }
    main { view-transition-name: app-main-content; }
    ::view-transition-group(app-sidebar), ::view-transition-group(app-header) { animation: none; }

    body {
      background-color: #09090b;
      color: #f4f4f5;
    }

    /* Barra superior de carga animada */
    #progress-bar {
      position: fixed;
      top: 0;
      left: 0;
      height: 3px;
      width: 0%;
      background: linear-gradient(90deg, #ea580c, #f97316, #fb923c);
      box-shadow: 0 0 12px rgba(249, 115, 22, 0.8);
      z-index: 99999;
      pointer-events: none;
      transition: width 0.25s ease, opacity 0.25s ease;
      opacity: 0;
    }
    #progress-bar.active { opacity: 1; width: 75%; }
    #progress-bar.finished { width: 100%; opacity: 0; }

    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: #09090b; }
    ::-webkit-scrollbar-thumb { background: #27272a; border-radius: 9999px; }
    ::-webkit-scrollbar-thumb:hover { background: #f97316; }
  </style>
</head>
<body class="bg-brand-black text-zinc-100 min-h-screen flex antialiased selection:bg-brand-orange selection:text-white text-sm">

  <!-- Barra lateral simple y clara -->
  <aside class="w-64 border-r border-brand-border bg-brand-surface/95 flex flex-col shrink-0 fixed inset-y-0 left-0 z-30">
    
    <!-- Logo claro y grande -->
    <div class="p-5 border-b border-brand-border">
      <a href="/" class="flex items-center gap-3 group">
        <div class="w-11 h-11 rounded-2xl bg-gradient-to-tr from-brand-orange-dark to-brand-orange flex items-center justify-center text-white text-2xl shadow-orange-glow group-hover:scale-105 transition-transform">
          ⚡
        </div>
        <div>
          <span class="font-extrabold text-xl tracking-tight text-white flex items-center gap-1">
            IRON<span class="text-brand-orange">PEAK</span>
          </span>
          <span class="text-xs text-zinc-400 font-medium block">Gestión de Clientes</span>
        </div>
      </a>
    </div>

    <!-- Menú intuitivo con nombres comunes y directos -->
    <nav class="flex-1 p-4 space-y-2 overflow-y-auto">
      
      <a href="/" class="flex items-center gap-3.5 px-4 py-3 rounded-2xl text-sm font-semibold transition-all ${currentPath === '/' ? 'bg-brand-orange text-white shadow-orange-glow' : 'text-zinc-400 hover:text-white hover:bg-brand-card'}">
        <span class="text-lg">📊</span>
        <span>Inicio</span>
      </a>

      <a href="/leads" class="flex items-center gap-3.5 px-4 py-3 rounded-2xl text-sm font-semibold transition-all ${currentPath.startsWith('/leads') ? 'bg-brand-orange text-white shadow-orange-glow' : 'text-zinc-400 hover:text-white hover:bg-brand-card'}">
        <span class="text-lg">👥</span>
        <span>Lista de Prospectos</span>
      </a>

      <a href="/templates" class="flex items-center gap-3.5 px-4 py-3 rounded-2xl text-sm font-semibold transition-all ${currentPath === '/templates' ? 'bg-brand-orange text-white shadow-orange-glow' : 'text-zinc-400 hover:text-white hover:bg-brand-card'}">
        <span class="text-lg">💬</span>
        <span>Mensajes WhatsApp</span>
      </a>

      <a href="/import-export" class="flex items-center gap-3.5 px-4 py-3 rounded-2xl text-sm font-semibold transition-all ${currentPath === '/import-export' ? 'bg-brand-orange text-white shadow-orange-glow' : 'text-zinc-400 hover:text-white hover:bg-brand-card'}">
        <span class="text-lg">📁</span>
        <span>Subir o Bajar Excel</span>
      </a>

      ${user && user.role === 'admin' ? html`
        <div class="pt-4 pb-1">
          <div class="border-t border-brand-border my-2"></div>
        </div>
        <a href="/team" class="flex items-center gap-3.5 px-4 py-3 rounded-2xl text-sm font-semibold transition-all ${currentPath === '/team' ? 'bg-brand-orange text-white shadow-orange-glow' : 'text-zinc-400 hover:text-white hover:bg-brand-card'}">
          <span class="text-lg">🛡️</span>
          <span>Equipo y Permisos</span>
        </a>
      ` : ''}

    </nav>

    <!-- Caja de usuario abajo con botón super claro para cambiar de rol -->
    <div class="p-4 border-t border-brand-border bg-brand-surface space-y-3">
      ${user ? html`
        <div class="p-3 rounded-2xl bg-brand-card border border-brand-border flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-brand-orange/20 border border-brand-orange/40 flex items-center justify-center text-brand-orange font-bold text-sm shrink-0 overflow-hidden">
            ${user.avatar_url ? html`<img src="${user.avatar_url}" class="w-full h-full object-cover"/>` : user.name.slice(0, 2).toUpperCase()}
          </div>
          <div class="overflow-hidden flex-1">
            <p class="font-bold text-white text-xs truncate">${user.name}</p>
            <p class="text-[11px] text-zinc-400 truncate">
              ${user.role === 'admin' ? '👑 Administrador' : '🏋️ Vendedor / Coach'}
            </p>
          </div>
        </div>

        <!-- Botón anti-abuelas para cambiar de usuario fácilmente -->
        <div class="flex items-center gap-2">
          <form action="/auth/quick-switch" method="POST" class="flex-1">
            <input type="hidden" name="role" value="${user.role === 'admin' ? 'agent' : 'admin'}"/>
            <button type="submit" class="w-full py-2 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-semibold transition border border-brand-border flex items-center justify-center gap-1.5" title="Cambiar vista para probar">
              <span>🔄 Ver como ${user.role === 'admin' ? 'Vendedora' : 'Admin'}</span>
            </button>
          </form>
          <a href="/auth/logout" class="py-2 px-3 bg-red-950/40 hover:bg-red-900/60 text-red-400 rounded-xl text-xs font-semibold transition" title="Salir">
            Salir
          </a>
        </div>
      ` : html`
        <a href="/login" class="w-full py-3 px-4 bg-brand-orange hover:bg-brand-orange-dark text-white rounded-2xl text-xs font-bold text-center block transition shadow-orange-glow">
          Iniciar Sesión
        </a>
      `}
    </div>

  </aside>

  <!-- Contenido Principal -->
  <div class="flex-1 pl-64 flex flex-col min-h-screen">
    
    <!-- Barra superior clara con botón grande para añadir -->
    <header class="h-20 border-b border-brand-border bg-brand-surface/90 backdrop-blur-md px-8 flex items-center justify-between sticky top-0 z-20">
      <div>
        <h1 class="text-xl font-extrabold text-white tracking-tight">${title}</h1>
        <p class="text-xs text-zinc-400 mt-0.5">Control visual y rápido de prospectos</p>
      </div>

      <div class="flex items-center gap-4">
        <!-- Botón gigante imposible de perder -->
        <a href="/leads/new" class="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-orange hover:bg-brand-orange-dark text-white text-xs font-bold rounded-2xl transition shadow-orange-glow hover:scale-105 transform">
          <span class="text-base">➕</span>
          <span>Anotar Nuevo Prospecto</span>
        </a>
      </div>
    </header>

    <!-- Notificación tipo alerta amigable si la hay -->
    ${flash ? html`
      <div class="px-8 pt-5">
        <div class="p-4 rounded-2xl border text-sm flex items-center justify-between ${
          flash.type === 'error'
            ? 'bg-red-950/60 border-red-800 text-red-200'
            : flash.type === 'info'
            ? 'bg-blue-950/60 border-blue-800 text-blue-200'
            : 'bg-emerald-950/60 border-emerald-800 text-emerald-200'
        }">
          <div class="flex items-center gap-3">
            <span class="text-xl">${flash.type === 'error' ? '⚠️' : flash.type === 'info' ? 'ℹ️' : '✅'}</span>
            <span class="font-semibold">${flash.message}</span>
          </div>
        </div>
      </div>
    ` : ''}

    <!-- Vista de cada pantalla -->
    <main class="flex-1 p-8">
      ${children}
    </main>

  </div>

  <!-- Script nativo de transiciones suaves de pantalla -->
  <script>
    (function() {
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

        if (document.startViewTransition) {
          e.preventDefault();
          startProgress();

          fetch(targetUrl.href)
            .then(function(res) {
              if (!res.ok) { window.location.href = targetUrl.href; return; }
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
                if (newMain && currentMain) currentMain.innerHTML = newMain.innerHTML;

                var newH1 = doc.querySelector('header h1');
                var currentH1 = document.querySelector('header h1');
                if (newH1 && currentH1) currentH1.innerHTML = newH1.innerHTML;

                var newNav = doc.querySelector('aside nav');
                var currentNav = document.querySelector('aside nav');
                if (newNav && currentNav) currentNav.innerHTML = newNav.innerHTML;

                window.history.pushState({}, '', targetUrl.href);
                window.scrollTo({ top: 0, behavior: 'instant' });
              });
            })
            .catch(function() { window.location.href = targetUrl.href; })
            .finally(function() { finishProgress(); });
        } else {
          startProgress();
        }
      });

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
              });
            })
            .finally(function() { finishProgress(); });
        }
      });

      document.addEventListener('submit', function() {
        startProgress();
      });
    })();
  </script>

</body>
</html>
  `;
}
