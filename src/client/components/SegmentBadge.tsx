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
        <span class="rounded-md px-2 py-0.5 text-[11px] font-medium inline-block bg-elevate border border-edge text-muted">
          Sin segmento
        </span>
      }
    >
      {(seg) => (
        <span
          class={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium border ${seg().chipClasses}`}
          title={seg().description}
        >
          <Show
            when={seg().id === 'A'}
            fallback={
              <Show
                when={seg().id === 'B'}
                fallback={<Clock class="w-3 h-3 shrink-0 text-amber-800 dark:text-amber-400" />}
              >
                <Target class="w-3 h-3 shrink-0 text-orange-700 dark:text-orange-400" />
              </Show>
            }
          >
            <Flame class="w-3 h-3 shrink-0 text-accent-text" />
          </Show>
          <span>{seg().label}</span>
        </span>
      )}
    </Show>
  );
}
