import { Show } from 'solid-js';
import { FC_SEGMENTS, FcSegment } from '../../lib/segments';

/**
 * Badge de Segmento comercial FC (🔥 A / 🟠 B / 🟡 C).
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
          class={`px-2.5 py-1 rounded-full text-[10px] font-extrabold inline-block border ${seg().chipClasses}`}
          title={seg().description}
        >
          {seg().icon} {seg().label}
        </span>
      )}
    </Show>
  );
}
