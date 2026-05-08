import Papa from 'papaparse'
import Decimal from 'decimal.js'
import { Transaction, TransCode, ParseResult } from './types'
import { parseDate } from '../utils/dates'
import { parseAmount } from '../utils/money'
import { transactionId } from '../utils/hash'

// Map raw Robinhood trans codes to our normalized enum
function normalizeCode(raw: string): TransCode {
  switch (raw.trim().toUpperCase()) {
    case 'BUY':   return 'BUY'
    case 'SELL':  return 'SELL'
    case 'CDIV':
    case 'MDIV':  return 'DIV'
    case 'DTAX':  return 'DIVTAX'
    case 'DRIP':  return 'DRIP'
    case 'INT':   return 'INT'
    case 'ACH':
    case 'ACH IN':
    case 'ACH OUT': return 'ACH'
    case 'WIRE':
    case 'WIRE IN':
    case 'WIRE OUT': return 'WIRE'
    case 'MRGR':
    case 'MRGS':  return 'MERGER'
    case 'SPLT':  return 'SPLIT'
    case 'SOFF':  return 'SPINOFF'
    case 'FEE':
    case 'DFEE':  return 'FEE'
    case 'JNL':   return 'JNL'
    case 'SLIP':  return 'SLIP'   // Stock Lending Income Program
    case 'ITRF':  return 'JNL'   // Internal transfer
    default:      return 'OTHER'
  }
}

export function parseCSV(csvText: string): ParseResult {
  const skipped: ParseResult['skipped'] = []
  const transactions: Transaction[] = []

  const { data, errors } = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  })

  if (errors.length > 0) {
    errors.forEach((e) => {
      skipped.push({ row: e.row ?? -1, reason: e.message, raw: '' })
    })
  }

  // Find header columns case-insensitively
  const rows = data as Record<string, string>[]

  rows.forEach((row, i) => {
    try {
      const dateStr = findField(row, ['activity date', 'activitydate'])
      const settleStr = findField(row, ['settle date', 'settledate'])
      const symbol = findField(row, ['instrument', 'symbol', 'ticker'])?.trim() || null
      const description = findField(row, ['description', 'desc'])?.trim() || ''
      const codeRaw = findField(row, ['trans code', 'transcode', 'type', 'transaction type'])?.trim() || ''
      const qtyStr = findField(row, ['quantity', 'qty'])?.trim() || '0'
      const priceStr = findField(row, ['price'])?.trim() || '0'
      const amountStr = findField(row, ['amount'])?.trim() || '0'

      const activityDate = parseDate(dateStr)
      if (!activityDate) {
        skipped.push({ row: i, reason: `Unparseable date: "${dateStr}"`, raw: JSON.stringify(row) })
        return
      }

      const code = normalizeCode(codeRaw)
      if (code === 'OTHER' && codeRaw !== '') {
        skipped.push({ row: i, reason: `Unknown trans code: "${codeRaw}" → mapped to OTHER`, raw: JSON.stringify(row) })
      }

      const qtyNum = new Decimal(qtyStr.replace(/[,$]/g, '') || '0').toNumber()
      const price = parseAmount(priceStr)
      const amount = parseAmount(amountStr)

      // quantity is positive for BUY, negative for SELL
      let quantity = qtyNum
      if (code === 'SELL') quantity = -Math.abs(qtyNum)
      if (code === 'BUY') quantity = Math.abs(qtyNum)

      const id = transactionId(
        dateStr || '',
        symbol || '',
        codeRaw,
        qtyStr,
        priceStr,
        amountStr
      ) + '_' + i  // row index as tiebreaker for exact duplicates

      transactions.push({
        id,
        activityDate,
        settleDate: parseDate(settleStr),
        symbol: symbol || null,
        description,
        code,
        quantity,
        price,
        amount,
      })
    } catch (err) {
      skipped.push({ row: i, reason: String(err), raw: JSON.stringify(row) })
    }
  })

  // Sort ascending by date, stable by original row order
  transactions.sort((a, b) => a.activityDate.getTime() - b.activityDate.getTime())

  const symbolSet = new Set<string>()
  transactions.forEach((t) => { if (t.symbol) symbolSet.add(t.symbol) })

  const dates = transactions.map((t) => t.activityDate).filter(Boolean)
  const firstDate = dates.length > 0 ? dates[0] : null
  const lastDate = dates.length > 0 ? dates[dates.length - 1] : null

  return {
    transactions,
    skipped,
    symbols: Array.from(symbolSet),
    firstDate,
    lastDate,
  }
}

function findField(row: Record<string, string>, keys: string[]): string | undefined {
  for (const key of keys) {
    for (const k of Object.keys(row)) {
      if (k.toLowerCase().trim() === key) return row[k]
    }
  }
  return undefined
}
