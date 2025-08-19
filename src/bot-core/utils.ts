export function alertSymbolToBase(sym: string) {
  const s = String(sym).toUpperCase().trim();
  if (s.endsWith('_USDT')) return s.replace('_USDT', 'USDT').replace('_', '');
  if (s.endsWith('USDT')) return s;
  return `${s}USDT`;
}
export function toBitgetSymbolId(sym: string) {
  return `${alertSymbolToBase(sym)}_UMCBL`;
}
export function toBitgetV2Symbol(sym: string): string {
  // "OP_USDT" -> "OPUSDT" (без _UMCBL)
  return alertSymbolToBase(sym);
}
export function parseIntervalMs(s: string) {
  const m = /^(\d+)([smh])$/i.exec(s || '');
  if (!m) return 60_000;
  const v = Number(m[1]);
  const u = m[2].toLowerCase();
  return u === 's' ? v * 1000 : u === 'm' ? v * 60_000 : v * 3_600_000;
}

/**
 * Определяет приоритет таймфрейма (чем больше число, тем выше приоритет)
 * @param timeframe строка таймфрейма (например, '1m', '5m', '1h', '4h', '1d')
 * @returns число приоритета
 */
export function getTimeframePriority(timeframe: string): number {
  const match = /^(\d+)([mhdw])$/i.exec(timeframe);
  if (!match) return 0;

  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();

  // Базовые множители для единиц времени
  const multipliers = {
    m: 1, // минуты
    h: 60, // часы (60 минут)
    d: 1440, // дни (24 * 60 минут)
    w: 10080, // недели (7 * 24 * 60 минут)
  };

  return value * multipliers[unit];
}

/**
 * Сортирует таймфреймы по приоритету (от высшего к низшему)
 * @param timeframes массив таймфреймов
 * @returns отсортированный массив
 */
export function sortTimeframesByPriority(timeframes: string[]): string[] {
  return [...timeframes].sort((a, b) => {
    const priorityA = getTimeframePriority(a);
    const priorityB = getTimeframePriority(b);
    return priorityB - priorityA; // от высшего к низшему
  });
}

/**
 * Получает главный (высший по приоритету) таймфрейм из списка
 * @param timeframes массив таймфреймов
 * @returns главный таймфрейм или null
 */
export function getMainTimeframe(timeframes: string[]): string | null {
  if (!timeframes || timeframes.length === 0) return null;
  return sortTimeframesByPriority(timeframes)[0];
}

/**
 * Проверяет, является ли таймфрейм главным в списке
 * @param timeframe проверяемый таймфрейм
 * @param timeframes список всех таймфреймов
 * @returns true если это главный таймфрейм
 */
export function isMainTimeframe(
  timeframe: string,
  timeframes: string[],
): boolean {
  const main = getMainTimeframe(timeframes);
  return main === timeframe;
}
