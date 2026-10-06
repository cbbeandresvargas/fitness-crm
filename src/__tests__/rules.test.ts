import { describe, it, expect } from 'vitest';
import { normalizePhone, calculateDynamicSegment } from '../lib/rules';

describe('normalizePhone', () => {
  it('normaliza números móviles bolivianos de 8 dígitos que inician con 7 a formato +591XXXXXXXX', () => {
    expect(normalizePhone('71234567')).toBe('+59171234567');
    expect(normalizePhone('70000000')).toBe('+59170000000');
    expect(normalizePhone('79999999')).toBe('+59179999999');
  });

  it('normaliza números móviles bolivianos de 8 dígitos que inician con 6 a formato +591XXXXXXXX', () => {
    expect(normalizePhone('69876543')).toBe('+59169876543');
    expect(normalizePhone('60000000')).toBe('+59160000000');
    expect(normalizePhone('65432100')).toBe('+59165432100');
  });

  it('elimina espacios, guiones, puntos y paréntesis en números bolivianos', () => {
    expect(normalizePhone(' 7123 4567 ')).toBe('+59171234567');
    expect(normalizePhone('7123-4567')).toBe('+59171234567');
    expect(normalizePhone('(712) 34567')).toBe('+59171234567');
    expect(normalizePhone('6.98.76.54.3')).toBe('+59169876543');
    expect(normalizePhone('(698) 76-543')).toBe('+59169876543');
  });

  it('respeta y limpia números bolivianos que ya incluyen el prefijo +591 o 591', () => {
    expect(normalizePhone('+59171234567')).toBe('+59171234567');
    expect(normalizePhone('+591 7123 4567')).toBe('+59171234567');
    expect(normalizePhone('+591-6987-6543')).toBe('+59169876543');
    expect(normalizePhone('59171234567')).toBe('+59171234567');
    expect(normalizePhone('591 6987 6543')).toBe('+59169876543');
  });

  it('preserva números internacionales válidos con formato +', () => {
    expect(normalizePhone('+12025550123')).toBe('+12025550123');
    expect(normalizePhone('+34 612 345 678')).toBe('+34612345678');
    expect(normalizePhone('+54 9 11 2345 6789')).toBe('+5491123456789');
  });

  it('descarta números inválidos, vacíos o mal formateados retornando cadena vacía', () => {
    expect(normalizePhone('')).toBe('');
    expect(normalizePhone('   ')).toBe('');
    expect(normalizePhone('12345')).toBe('');
    expect(normalizePhone('712')).toBe('');
    expect(normalizePhone('0')).toBe('');
    expect(normalizePhone('abc')).toBe('');
    expect(normalizePhone('71234567ext')).toBe('');
    expect(normalizePhone('7123456a')).toBe('');
    expect(normalizePhone('+')).toBe('');
    expect(normalizePhone('++59171234567')).toBe('');
  });

  it('descarta números de 8 dígitos que no inician con 6 ni 7 (no son móviles de Bolivia)', () => {
    expect(normalizePhone('12345678')).toBe('');
    expect(normalizePhone('81234567')).toBe('');
    expect(normalizePhone('91234567')).toBe('');
  });
});

describe('calculateDynamicSegment', () => {
  it('asigna segmento A cuando el prospecto cuenta con membresías registradas', () => {
    const res = calculateDynamicSegment({
      status: 'nuevo',
      metadata: { cantidad_membresias: 2 },
    });
    expect(res.segment).toBe('A');
    expect(res.reason).toContain('Antiguo pagador');
  });

  it('asigna segmento B cuando el origen es excel_fc y tiene 0 membresías', () => {
    const res = calculateDynamicSegment({
      status: 'nuevo',
      metadata: { origen: 'excel_fc', cantidad_membresias: 0 },
    });
    expect(res.segment).toBe('B');
  });

  it('asigna segmento C cuando tiene actividad reciente dentro de 30 días', () => {
    const res = calculateDynamicSegment({
      status: 'nuevo',
      created_at: new Date().toISOString(),
    });
    expect(res.segment).toBe('C');
  });
});
