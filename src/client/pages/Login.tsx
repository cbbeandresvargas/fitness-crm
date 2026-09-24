import { createSignal, Show, createEffect } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const navigate = useNavigate();
  const { user, login, demoLogin } = useAuth();

  const [email, setEmail] = createSignal('');
  const [password, setPassword] = createSignal('');
  const [submitting, setSubmitting] = createSignal(false);
  const [error, setError] = createSignal('');

  // If already logged in, go to dashboard
  createEffect(() => {
    if (user()) {
      navigate('/', { replace: true });
    }
  });

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    const success = await login(email(), password());
    setSubmitting(false);

    if (success) {
      navigate('/', { replace: true });
    } else {
      setError('Credenciales inválidas o usuario inactivo');
    }
  };

  const handleDemo = async (role: 'admin' | 'agent') => {
    setError('');
    const success = await demoLogin(role);
    if (success) {
      navigate('/', { replace: true });
    }
  };

  return (
    <div class="min-h-screen bg-zinc-950 flex flex-col justify-center items-center p-4 selection:bg-orange-500 selection:text-white">
      <div class="max-w-md w-full space-y-6">
        {/* Brand */}
        <div class="text-center space-y-2">
          <div class="inline-flex w-16 h-16 rounded-3xl bg-gradient-to-tr from-orange-600 to-orange-500 items-center justify-center text-white text-3xl shadow-orange-glow mb-2">
            ⚡
          </div>
          <h1 class="text-3xl font-black tracking-tight text-white flex items-center justify-center gap-1.5">
            IRON<span class="text-orange-500">PEAK</span>
          </h1>
          <p class="text-xs text-zinc-400">
            Plataforma de gestión comercial y seguimiento para gimnasios
          </p>
        </div>

        {/* Demo Fast Access Card */}
        <div class="p-6 rounded-3xl bg-zinc-900 border border-orange-500/30 space-y-4 shadow-xl">
          <div class="flex items-center gap-2">
            <span class="text-lg">⚡</span>
            <div>
              <h2 class="text-xs font-bold text-white uppercase tracking-wider">
                Acceso Rápido de Prueba (1 Clic)
              </h2>
              <p class="text-[11px] text-zinc-400">
                Inicia sesión al instante sin tener que escribir contraseñas
              </p>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => handleDemo('admin')}
              class="p-3.5 rounded-2xl bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 hover:border-orange-500/50 transition text-left space-y-1 cursor-pointer group"
            >
              <span class="text-lg block">👑</span>
              <p class="font-extrabold text-xs text-white group-hover:text-orange-400 transition">
                Carlos Mendoza
              </p>
              <p class="text-[10px] text-zinc-400">Director / Admin</p>
            </button>

            <button
              type="button"
              onClick={() => handleDemo('agent')}
              class="p-3.5 rounded-2xl bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 hover:border-orange-500/50 transition text-left space-y-1 cursor-pointer group"
            >
              <span class="text-lg block">🏋️</span>
              <p class="font-extrabold text-xs text-white group-hover:text-orange-400 transition">
                Valeria Ríos
              </p>
              <p class="text-[10px] text-zinc-400">Coach / Ventas</p>
            </button>
          </div>
        </div>

        {/* Manual Login Card */}
        <div class="p-8 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-5 shadow-xl">
          <h2 class="text-sm font-bold text-white">Ingreso con Credenciales</h2>

          <Show when={error()}>
            <div class="p-3.5 rounded-2xl bg-red-950/80 border border-red-800 text-red-200 text-xs font-semibold flex items-center gap-2.5">
              <span>⚠️</span>
              <span>{error()}</span>
            </div>
          </Show>

          <form onSubmit={handleSubmit} class="space-y-4">
            <div>
              <label class="block text-xs font-bold text-zinc-400 mb-1">
                Correo Electrónico
              </label>
              <input
                type="email"
                required
                value={email()}
                onInput={(e) => setEmail(e.currentTarget.value)}
                placeholder="admin@ironpeak.fit"
                class="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-2xl text-xs text-white focus:outline-none focus:border-orange-500"
              />
            </div>

            <div>
              <label class="block text-xs font-bold text-zinc-400 mb-1">
                Contraseña
              </label>
              <input
                type="password"
                required
                value={password()}
                onInput={(e) => setPassword(e.currentTarget.value)}
                placeholder="admin123"
                class="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-2xl text-xs text-white focus:outline-none focus:border-orange-500"
              />
            </div>

            <button
              type="submit"
              disabled={submitting()}
              class="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-xs rounded-2xl shadow-orange-glow transition disabled:opacity-50 cursor-pointer"
            >
              {submitting() ? 'Iniciando sesión...' : 'Entrar a IronPeak'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
