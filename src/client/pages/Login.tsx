import { createSignal, Show, createEffect } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { useAuth } from '../context/AuthContext';
import { ThemeToggle } from '../context/ThemeContext';
import { Zap, TriangleAlert } from 'lucide-solid';

export default function Login() {
  const navigate = useNavigate();
  const { user, login } = useAuth();

  const [email, setEmail] = createSignal('');
  const [password, setPassword] = createSignal('');
  const [submitting, setSubmitting] = createSignal(false);
  const [error, setError] = createSignal('');

  // Redirigir al inicio si ya hay una sesión autenticada
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
      setError('Credenciales inválidas o cuenta no activa');
    }
  };

  return (
    <div class="min-h-screen bg-app flex flex-col justify-center items-center p-4 selection:bg-accent selection:text-white">
      <div class="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div class="max-w-sm w-full space-y-4">
        {/* Brand */}
        <div class="text-center space-y-1.5">
          <div class="inline-flex w-10 h-10 rounded-xl bg-accent items-center justify-center text-white mb-1 shadow-xs">
            <Zap class="w-5 h-5 text-white" />
          </div>
          <h1 class="text-lg font-bold tracking-tight text-body flex items-center justify-center gap-1">
            FITNESS<span class="text-accent-text">CLUB</span>
          </h1>
          <p class="text-xs text-muted">
            Gestión comercial y seguimiento para gimnasios
          </p>
        </div>

        {/* Card de Inicio de Sesión Oficial */}
        <div class="p-5 sm:p-6 rounded-xl bg-surface border border-edge space-y-4 shadow-sm">
          <div class="space-y-0.5">
            <h2 class="text-sm font-bold text-body">Iniciar Sesión</h2>
            <p class="text-xs text-muted">Ingresa tus credenciales autorizadas</p>
          </div>

          <Show when={error()}>
            <div class="p-2.5 rounded-lg bg-red-950/80 border border-red-800 text-red-200 text-xs font-medium flex items-center gap-2 animate-fade-in">
              <TriangleAlert class="w-4 h-4 shrink-0 text-red-300" />
              <span>{error()}</span>
            </div>
          </Show>

          <form onSubmit={handleSubmit} class="space-y-3">
            <div>
              <label class="block text-xs font-medium text-muted mb-1">
                Correo Electrónico
              </label>
              <input
                type="email"
                required
                autocomplete="email"
                value={email()}
                onInput={(e) => setEmail(e.currentTarget.value)}
                placeholder="ejemplo@fitnessclub.fit"
                class="w-full px-3 py-2 bg-app border border-edge rounded-lg text-xs text-body focus:outline-none focus:border-accent transition"
              />
            </div>

            <div>
              <label class="block text-xs font-medium text-muted mb-1">
                Contraseña
              </label>
              <input
                type="password"
                required
                autocomplete="current-password"
                value={password()}
                onInput={(e) => setPassword(e.currentTarget.value)}
                placeholder="••••••••"
                class="w-full px-3 py-2 bg-app border border-edge rounded-lg text-xs text-body focus:outline-none focus:border-accent transition"
              />
            </div>

            <button
              type="submit"
              disabled={submitting()}
              class="w-full py-2 px-3 bg-accent hover:bg-accent-hover text-white font-semibold text-xs rounded-lg transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2 mt-1 shadow-xs"
            >
              <Show
                when={submitting()}
                fallback={<span>Ingresar al Sistema</span>}
              >
                <div class="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Verificando...</span>
              </Show>
            </button>
          </form>

          <div class="pt-2 border-t border-edge text-center">
            <span class="text-[11px] text-muted">
              Acceso seguro con cifrado SHA-256 y sesiones KV
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
