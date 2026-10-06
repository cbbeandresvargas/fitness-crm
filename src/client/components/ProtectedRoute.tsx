import { JSX, Show, createEffect } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { useAuth } from '../context/AuthContext';
import { Zap } from 'lucide-solid';

interface ProtectedRouteProps {
  children: JSX.Element;
  adminOnly?: boolean;
}

export function ProtectedRoute(props: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  createEffect(() => {
    if (!loading()) {
      if (!user()) {
        navigate('/login', { replace: true });
      } else if (props.adminOnly && user()?.role !== 'admin') {
        navigate('/', { replace: true });
      }
    }
  });

  return (
    <Show
      when={!loading() && user() && (!props.adminOnly || user()?.role === 'admin')}
      fallback={
        <div class="min-h-screen bg-app flex flex-col items-center justify-center p-6 text-center select-none">
          <div class="relative w-16 h-16 mb-4">
            <div class="absolute inset-0 rounded-3xl bg-accent/20 blur-md animate-pulse"></div>
            <div class="relative w-16 h-16 rounded-3xl bg-gradient-to-tr from-accent-deep to-accent flex items-center justify-center text-white shadow-accent-glow">
              <Zap class="w-8 h-8 text-white" />
            </div>
          </div>
          <div class="flex items-center gap-2 mb-2">
            <div class="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
            <p class="text-xs font-bold uppercase tracking-wider text-accent-text">Verificando sesión</p>
          </div>
          <p class="text-xs text-muted">Cargando Fitness Club CRM...</p>
        </div>
      }
    >
      {props.children}
    </Show>
  );
}
