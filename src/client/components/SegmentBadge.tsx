import { Show } from 'solid-js';
import { FC_SEGMENTS, FcSegment } from '../../lib/segments';
import { Flame, Target, Clock } from 'lucide-solid';

/**
 * Badge de Segmento comercial FC (A / B / C).
 * Reutiliza el sistema visual de chips del CRM; si el prospecto no califica
 * para ningún segmento, muestra "Sin segmento".
 */
export function SegmentBadge(props: { segment: FcSegment | null | undefined }) {
  return (
    <Show
      when={props.segment ? FC_SEGMENTS[props.segment] : null}
      fallback={
        <span class="px-2.5 py-1 rounded-full text-[10px] font-extrabold inline-block bg-elevate border border-edge-strong text-muted">
          Sin segmento
        </span>
      }
    >
      {(seg) => (
        <span
          class={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold border ${seg().chipClasses}`}
          title={seg().description}
        >
          <Show
            when={seg().id === 'A'}
            fallback={
              <Show
                when={seg().id === 'B'}
                fallback={<Clock class="w-3 h-3 text-amber-400" />}
              >
                <Target class="w-3 h-3 text-orange-400" />
              </Show>
            }
          >
            <Flame class="w-3 h-3 text-accent-text" />
          </Show>
          <span>{seg().label}</span>
        </span>
      )}
    </Show>
  );
}
