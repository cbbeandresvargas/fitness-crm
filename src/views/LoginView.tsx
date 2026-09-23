import { html } from 'hono/html';

interface LoginViewProps {
  error?: string | null;
}

export function LoginView({ error }: LoginViewProps) {
  return html`
<!DOCTYPE html>
<html lang="es" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Acceso al Sistema | IronPeak Fitness CRM</title>
  
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  
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
            }
          },
          boxShadow: {
            'orange-glow': '0 0 35px -5px rgba(249, 115, 22, 0.35)',
          }
        }
      }
    }
  </script>

  <style>
    @view-transition {
      navigation: auto;
    }
    ::view-transition-old(root) {
      animation: 0.22s cubic-bezier(0.4, 0, 1, 1) both fadeOut;
    }
    ::view-transition-new(root) {
      animation: 0.28s cubic-bezier(0, 0, 0.2, 1) both fadeIn;
    }
    @keyframes fadeOut {
      from { opacity: 1; transform: scale(1); }
      to { opacity: 0; transform: scale(0.99); }
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: scale(1.01); }
      to { opacity: 1; transform: scale(1); }
    }
  </style>
</head>
<body class="bg-brand-black text-zinc-100 min-h-screen flex items-center justify-center p-4 antialiased selection:bg-brand-orange selection:text-white">

  <!-- Background decorative light -->
  <div class="fixed inset-0 overflow-hidden pointer-events-none">
    <div class="absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-brand-orange/10 rounded-full blur-[140px]"></div>
  </div>

  <div class="w-full max-w-md relative z-10 space-y-6">
    
    <!-- Brand Emblem -->
    <div class="text-center space-y-2">
      <div class="w-14 h-14 rounded-2xl bg-gradient-to-tr from-brand-orange-dark to-brand-orange flex items-center justify-center text-white font-black text-2xl mx-auto shadow-orange-glow">
        ⚡
      </div>
      <h1 class="text-2xl font-black tracking-wider text-white">
        IRON<span class="text-brand-orange">PEAK</span>
      </h1>
      <p class="text-xs uppercase tracking-widest text-zinc-400 font-semibold">Plataforma de Leads Fitness & WhatsApp AI</p>
    </div>

    <!-- Login Card -->
    <div class="p-8 rounded-3xl bg-brand-surface/90 border border-brand-border backdrop-blur-xl shadow-2xl space-y-6">
      
      ${error ? html`
        <div class="p-3.5 rounded-xl bg-red-950/60 border border-red-800 text-red-200 text-xs flex items-center gap-2">
          <span>⚠️</span>
          <span>${error}</span>
        </div>
      ` : ''}

      <!-- Quick Demo Login Switcher -->
      <div class="space-y-2">
        <label class="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 text-center">Acceso Rápido para Demostración</label>
        <div class="grid grid-cols-2 gap-2">
          <form action="/auth/demo-login" method="POST" class="w-full">
            <input type="hidden" name="role" value="admin"/>
            <button
              type="submit"
              class="w-full p-2.5 bg-zinc-800 hover:bg-zinc-700 hover:border-brand-orange text-zinc-200 rounded-xl text-xs font-bold border border-brand-border transition flex flex-col items-center gap-0.5 group"
            >
              <span class="text-brand-orange font-extrabold">👑 Admin</span>
              <span class="text-[10px] text-zinc-400">Carlos (Director)</span>
            </button>
          </form>

          <form action="/auth/demo-login" method="POST" class="w-full">
            <input type="hidden" name="role" value="agent"/>
            <button
              type="submit"
              class="w-full p-2.5 bg-zinc-800 hover:bg-zinc-700 hover:border-brand-orange text-zinc-200 rounded-xl text-xs font-bold border border-brand-border transition flex flex-col items-center gap-0.5 group"
            >
              <span class="text-emerald-400 font-extrabold">🏋️ Agente</span>
              <span class="text-[10px] text-zinc-400">Valeria (Ventas)</span>
            </button>
          </form>
        </div>
      </div>

      <div class="relative flex items-center justify-center">
        <div class="border-t border-brand-border w-full"></div>
        <span class="bg-brand-surface px-3 text-[10px] uppercase font-bold tracking-wider text-zinc-500 absolute">o credenciales manuales</span>
      </div>

      <!-- Manual Form -->
      <form action="/auth/login" method="POST" class="space-y-4">
        <div>
          <label class="block text-xs font-semibold text-zinc-300 mb-1">Correo Electrónico</label>
          <input
            type="email"
            name="email"
            required
            value="admin@ironpeak.fit"
            placeholder="admin@ironpeak.fit"
            class="w-full px-4 py-2.5 bg-brand-card border border-brand-border rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-brand-orange"
          />
        </div>

        <div>
          <label class="block text-xs font-semibold text-zinc-300 mb-1">Contraseña</label>
          <input
            type="password"
            name="password"
            required
            value="admin123"
            placeholder="••••••••"
            class="w-full px-4 py-2.5 bg-brand-card border border-brand-border rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-brand-orange"
          />
        </div>

        <button
          type="submit"
          class="w-full py-3 bg-brand-orange hover:bg-brand-orange-dark text-white rounded-xl text-xs font-black uppercase tracking-wider transition shadow-orange-glow flex items-center justify-center gap-2"
        >
          <span>Ingresar al CRM</span>
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
        </button>
      </form>

    </div>

    <!-- Edge info -->
    <div class="text-center text-[11px] text-zinc-500">
      ⚡ Desplegado sobre Cloudflare Workers • D1 • KV • R2
    </div>

  </div>

</body>
</html>
  `;
}
