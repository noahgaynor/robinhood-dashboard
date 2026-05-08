// Simple deterministic hash for transaction dedup
export function hashString(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) >>> 0
  }
  return h.toString(36)
}

export function transactionId(date: string, symbol: string, code: string, qty: string, price: string, amount: string): string {
  return hashString(`${date}|${symbol}|${code}|${qty}|${price}|${amount}`)
}
