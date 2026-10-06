import { describe, it, expect } from 'vitest';
import { computeFcSegment, SEGMENT_C_MAX_DAYS } from '../lib/segments';

describe('computeFcSegment', () => {
  describe('Segmento A — Antiguos pagadores', () => {
    it('clasifica como A cuando cantidad_membresias >= 1 (prioridad máxima)', () => {
      const res = computeFcSegment({
        metadata: { cantidad_membresias: 1 },
      });
      expect(res.segment).toBe('A');
      expect(res.reason).toContain('Antiguo pagador');
    });

    it('clasifica como A incluso si la membresía está caducada o agotada', () => {
      const res = computeFcSegment({
        metadata: {
          cantidad_membresias: 3,
          estado_membresia: 'Caducada',
        },
      });
      expect(res.segment).toBe('A');
    });

    it('clasifica como A cuando metadata es un string JSON válido', () => {
      const res = computeFcSegment({
        metadata: JSON.stringify({ cantidad_membresias: 2 }),
      });
      expect(res.segment).toBe('A');
    });
  });

  describe('Segmento B — Registrados que nunca pagaron', () => {
    it('clasifica como B cuando el origen es excel_fc y cantidad_membresias es 0', () => {
      const res = computeFcSegment({
        metadata: { origen: 'excel_fc', cantidad_membresias: 0 },
      });
      expect(res.segment).toBe('B');
      expect(res.reason).toContain('Registrado en el sistema FC');
    });

    it('clasifica como B cuando el origen es excel_fc y no tiene cantidad_membresias definida', () => {
      const res = computeFcSegment({
        metadata: { origen: 'excel_fc' },
      });
      expect(res.segment).toBe('B');
    });

    it('NO clasifica como B si el lead fue creado manualmente con 0 membresías pero sin origen excel_fc', () => {
      const res = computeFcSegment({
        metadata: { origen: 'manual', cantidad_membresias: 0 },
        created_at: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(), // 40 días atrás
      });
      expect(res.segment).toBeNull();
    });
  });

  describe('Segmento C — Actividad/Interés reciente y tolerancia a Clock Skew', () => {
    it('clasifica como C cuando created_at está dentro de los últimos 30 días', () => {
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
      const res = computeFcSegment({
        created_at: tenDaysAgo,
      });
      expect(res.segment).toBe('C');
      expect(res.reason).toContain('Actividad o interés reciente');
    });

    it('clasifica como C cuando last_contacted_at está dentro de los últimos 30 días', () => {
      const oldCreated = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
      const recentContact = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      const res = computeFcSegment({
        created_at: oldCreated,
        last_contacted_at: recentContact,
      });
      expect(res.segment).toBe('C');
    });

    it('clasifica como C cuando last_inbound_at está dentro de los últimos 30 días', () => {
      const oldCreated = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
      const recentInbound = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
      const res = computeFcSegment({
        created_at: oldCreated,
        last_inbound_at: recentInbound,
      });
      expect(res.segment).toBe('C');
    });

    it('soporta Clock Skew: clasifica como C cuando created_at está ligeramente en el futuro (+15 segundos)', () => {
      const futureDate = new Date(Date.now() + 15 * 1000).toISOString();
      const res = computeFcSegment({
        created_at: futureDate,
      });
      expect(res.segment).toBe('C');
    });

    it('soporta Clock Skew: clasifica como C cuando last_inbound_at está 2 minutos en el futuro', () => {
      const futureDate = new Date(Date.now() + 120 * 1000).toISOString();
      const res = computeFcSegment({
        last_inbound_at: futureDate,
      });
      expect(res.segment).toBe('C');
    });
  });

  describe('Sin calificación de segmento (null)', () => {
    it('devuelve null si no tiene membresías, no es de excel_fc y la actividad fue hace más de 30 días', () => {
      const oldDate = new Date(Date.now() - (SEGMENT_C_MAX_DAYS + 5) * 24 * 60 * 60 * 1000).toISOString();
      const res = computeFcSegment({
        created_at: oldDate,
        last_contacted_at: oldDate,
        last_inbound_at: oldDate,
      });
      expect(res.segment).toBeNull();
      expect(res.reason).toContain('Sin pago registrado');
    });

    it('devuelve null si todas las marcas de fecha están vacías o son nulas', () => {
      const res = computeFcSegment({});
      expect(res.segment).toBeNull();
    });
  });
});
