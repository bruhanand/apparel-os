// The canonical serialisation of a result (shared-calculations 5.10): JSON with object keys in code-point order, no
// spaces, array order kept and absent fields left out. A priced bill has exactly one such text, so a tender allocation
// can refer to it (section 6) and a stored bill priced again can be compared with it (PRD-POS-014, PRD-OFF-009).

export function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'number':
      if (!Number.isFinite(value)) throw new RangeError('Canonical JSON holds only finite numbers');
      return JSON.stringify(value);
    case 'string':
    case 'boolean':
      return JSON.stringify(value);
    case 'object': {
      if (Array.isArray(value)) return `[${value.map((item: unknown) => canonicalJson(item)).join(',')}]`;
      const record = value as Record<string, unknown>;
      const keys = Object.keys(record)
        .filter((key) => record[key] !== undefined)
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
    }
    default:
      throw new TypeError(`Canonical JSON cannot hold a ${typeof value}`);
  }
}
