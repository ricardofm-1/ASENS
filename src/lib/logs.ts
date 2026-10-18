/** Event payloads on Asentum are JSON, hex-encoded in eth_getLogs data. */
export function decodeLogData(data: string): Record<string, unknown> | null {
  if (!data || data === '0x') return null;
  try {
    const hex = data.startsWith('0x') ? data.slice(2) : data;
    if (!hex || hex.length % 2 !== 0) return null;
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}
