import {
  createContext,
  useContext,
  createSignal,
  createEffect,
  JSX,
  Show,
} from 'solid-js';
import { SessionData, UserRole } from '../types';
import { api } from '../api';

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface AuthContextType {
  user: () => SessionData | null;
  loading: () => boolean;
  login: (email: string, pass: string) => Promise<boolean>;
  demoLogin: (role: 'admin' | 'agent') => Promise<boolean>;
  quickSwitch: (role: 'admin' | 'agent') => Promise<void>;
  logout: () => Promise<void>;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const AuthContext = createContext<AuthContextType>();

export function AuthProvider(props: { children: JSX.Element }) {
  const [user, setUser] = createSignal<SessionData | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [toasts, setToasts] = createSignal<Toast[]>([]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  // Load user session on mount
  createEffect(() => {
    api
      .getMe()
      .then((res) => {
        setUser(res.user);
      })
      .catch((err) => {
        console.warn('No active session:', err);
      })
      .finally(() => {
        setLoading(false);
      });
  });

  const login = async (email: string, pass: string) => {
    try {
      const res = await api.login(email, pass);
      if (res.user) {
        setUser(res.user);
        showToast(`¡Bienvenido de vuelta, ${res.user.name.split(' ')[0]}!`, 'success');
        return true;
      }
      return false;
    } catch (err: any) {
      showToast(err.message || 'Error al iniciar sesión', 'error');
      return false;
    }
  };

  const demoLogin = async (role: 'admin' | 'agent') => {
    try {
      setLoading(true);
      const res = await api.demoLogin(role);
      if (res.user) {
        setUser(res.user);
        showToast(`Sesión iniciada como ${res.user.name}`, 'success');
        return true;
      }
      return false;
    } catch (err: any) {
      showToast(err.message || 'Error en demo login', 'error');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const quickSwitch = async (role: 'admin' | 'agent') => {
    try {
      const res = await api.quickSwitch(role);
      if (res.user) {
        setUser(res.user);
        showToast(`Cambiado a vista de ${role === 'admin' ? 'Administrador' : 'Vendedora'}`, 'info');
      }
    } catch (err: any) {
      showToast(err.message || 'Error al alternar rol', 'error');
    }
  };

  const logout = async () => {
    try {
      await api.logout();
      setUser(null);
      showToast('Sesión cerrada correctamente', 'info');
    } catch (err: any) {
      showToast(err.message || 'Error al salir', 'error');
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        demoLogin,
        quickSwitch,
        logout,
        showToast,
      }}
    >
      {props.children}

      {/* Floating Toast Notification Container */}
      <div class="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
        <Show when={toasts().length > 0}>
          {toasts().map((toast) => (
            <div
              class={`pointer-events-auto px-4 py-3 rounded-2xl border text-sm font-semibold shadow-2xl flex items-center gap-3 animate-fade-in ${
                toast.type === 'error'
                  ? 'bg-red-950/90 border-red-800 text-red-200'
                  : toast.type === 'info'
                  ? 'bg-blue-950/90 border-blue-800 text-blue-200'
                  : 'bg-emerald-950/90 border-emerald-800 text-emerald-200'
              }`}
            >
              <span class="text-lg">
                {toast.type === 'error' ? '⚠️' : toast.type === 'info' ? 'ℹ️' : '✅'}
              </span>
              <span>{toast.message}</span>
            </div>
          ))}
        </Show>
      </div>
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
