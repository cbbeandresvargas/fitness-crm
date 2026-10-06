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
      <div class="max-w-md w-full space-y-6">
        {/* Brand */}
        <div class="text-center space-y-2">
          <div class="inline-flex w-16 h-16 rounded-3xl bg-gradient-to-tr from-accent-deep to-accent items-center justify-center text-white shadow-accent-glow mb-2">
            <Zap class="w-8 h-8 text-white" />
          </div>
          <h1 class="text-3xl font-black tracking-tight text-body flex items-center justify-center gap-1.5">
            FITNESS<span class="text-accent-text">CLUB</span>
          </h1>
          <p class="text-xs text-muted">
            Plataforma de gestión comercial y seguimiento para gimnasios
          </p>
        </div>

        {/* Card de Inicio de Sesión Oficial */}
        <div class="p-8 rounded-3xl bg-surface border border-edge space-y-5 shadow-2xl">
          <div class="space-y-1">
            <h2 class="text-base font-bold text-body">Iniciar Sesión</h2>
            <p class="text-xs text-muted">Ingresa tus credenciales autorizadas para acceder</p>
          </div>

          <Show when={error()}>
            <div class="p-3.5 rounded-2xl bg-red-950/80 border border-red-800 text-red-200 text-xs font-semibold flex items-center gap-2.5 animate-fade-in">
              <TriangleAlert class="w-4 h-4 shrink-0 text-red-300" />
              <span>{error()}</span>
            </div>
          </Show>

          <form onSubmit={handleSubmit} class="space-y-4">
            <div>
              <label class="block text-xs font-bold text-muted mb-1.5">
                Correo Electrónico
              </label>
              <input
                type="email"
                required
                autocomplete="email"
                value={email()}
                onInput={(e) => setEmail(e.currentTarget.value)}
                placeholder="ejemplo@fitnessclub.fit"
                class="w-full px-4 py-2.5 bg-app border border-edge rounded-2xl text-xs text-body focus:outline-none focus:border-accent transition"
              />
            </div>

            <div>
              <label class="block text-xs font-bold text-muted mb-1.5">
                Contraseña
              </label>
              <input
                type="password"
                required
                autocomplete="current-password"
                value={password()}
                onInput={(e) => setPassword(e.currentTarget.value)}
                placeholder="••••••••"
                class="w-full px-4 py-2.5 bg-app border border-edge rounded-2xl text-xs text-body focus:outline-none focus:border-accent transition"
              />
            </div>

            <button
              type="submit"
              disabled={submitting()}
              class="w-full py-3 bg-accent hover:bg-accent-hover text-white font-extrabold text-xs rounded-2xl shadow-accent-glow transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
            >
              <Show
                when={submitting()}
                fallback={<span>Ingresar al Sistema</span>}
              >
                <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
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
