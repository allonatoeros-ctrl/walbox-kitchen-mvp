const COUNTER_KEY = 'walbox_kitchen_local_order_counter_v1';

export function serviceDayRome(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function formatOperationalCode(sequence) {
  const zeroBased = Math.max(0, Number(sequence) - 1);
  const group = Math.floor(zeroBased / 99);
  const number = (zeroBased % 99) + 1;
  let letters = '';
  let current = group;
  do {
    letters = String.fromCharCode(65 + (current % 26)) + letters;
    current = Math.floor(current / 26) - 1;
  } while (current >= 0);
  return `${letters}${String(number).padStart(2, '0')}`;
}

// Fallback only for local/demo operation before the approved DB migration is applied.
// The production source of truth becomes kitchen_customer_create_order() in Postgres.
export function nextLocalOperationalCode(venueId = 'walrus-main') {
  const serviceDay = serviceDayRome();
  try {
    const saved = JSON.parse(localStorage.getItem(COUNTER_KEY) || '{}');
    const key = `${venueId}:${serviceDay}`;
    const sequence = (Number(saved[key]) || 0) + 1;
    saved[key] = sequence;
    localStorage.setItem(COUNTER_KEY, JSON.stringify(saved));
    return { orderCode: formatOperationalCode(sequence), serviceDay, serviceSequence: sequence };
  } catch {
    return { orderCode: `LOCAL-${Date.now()}`, serviceDay, serviceSequence: null };
  }
}
