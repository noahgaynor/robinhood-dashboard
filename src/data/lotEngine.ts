import Decimal from 'decimal.js'
import { Transaction, Lot, ClosedTrade, PortfolioSnapshot, Position } from './types'
import { holdDays, isLongTerm } from '../utils/dates'

interface LotBook {
  [symbol: string]: Lot[]
}

export function buildPortfolioSnapshot(transactions: Transaction[]): PortfolioSnapshot {
  const lotBook: LotBook = {}
  const closedTrades: ClosedTrade[] = []
  const warningSymbols: Set<string> = new Set()

  let cash = new Decimal(0)
  let totalDeposits = new Decimal(0)
  let totalWithdrawals = new Decimal(0)
  let dividendsReceived = new Decimal(0)
  let interestReceived = new Decimal(0)
  let realizedPnl = new Decimal(0)
  let firstActivityDate: Date | null = null

  // Track first activity date
  if (transactions.length > 0) {
    firstActivityDate = transactions[0].activityDate
  }

  for (const tx of transactions) {
    const { code, symbol, quantity, price, amount, activityDate } = tx

    switch (code) {
      case 'BUY':
      case 'DRIP': {
        if (!symbol) break
        if (!lotBook[symbol]) lotBook[symbol] = []
        const shares = Math.abs(quantity)
        if (shares <= 0) break
        // Use |amount| / shares as cost per share (more accurate than price field)
        const costPerShare = shares > 0 ? Math.abs(amount) / shares : price
        lotBook[symbol].push({
          acquiredAt: activityDate,
          shares: new Decimal(shares).toNumber(),
          costPerShare: new Decimal(costPerShare).toNumber(),
        })
        cash = cash.plus(amount) // amount is negative (cash out)
        break
      }

      case 'SELL': {
        if (!symbol) break
        const proceeds = new Decimal(Math.abs(amount))
        // Save the original total shares so per-lot proceeds allocate correctly
        const totalSharesToSell = new Decimal(Math.abs(quantity))
        let sharesToSell = totalSharesToSell
        const lots = lotBook[symbol] || []

        // FIFO: consume oldest lots first
        let i = 0
        while (sharesToSell.greaterThan(0) && i < lots.length) {
          const lot = lots[i]
          const lotShares = new Decimal(lot.shares)
          const consumed = Decimal.min(lotShares, sharesToSell)
          // Allocate proceeds proportionally to the ORIGINAL total, not the remaining
          const lotProceeds = proceeds.times(consumed).div(totalSharesToSell)
          const lotCost = consumed.times(lot.costPerShare)
          const pnl = lotProceeds.minus(lotCost)

          closedTrades.push({
            symbol,
            openedAt: lot.acquiredAt,
            closedAt: activityDate,
            shares: consumed.toNumber(),
            costBasis: lotCost.toNumber(),
            proceeds: lotProceeds.toNumber(),
            realizedPnl: pnl.toNumber(),
            realizedPnlPct: lotCost.greaterThan(0) ? pnl.div(lotCost).times(100).toNumber() : 0,
            holdDays: holdDays(lot.acquiredAt, activityDate),
            term: isLongTerm(holdDays(lot.acquiredAt, activityDate)) ? 'long' : 'short',
          })

          realizedPnl = realizedPnl.plus(pnl)
          lot.shares = lotShares.minus(consumed).toNumber()
          sharesToSell = sharesToSell.minus(consumed)
          if (lot.shares < 0.000001) {
            lots.splice(i, 1)
          } else {
            i++
          }
        }

        cash = cash.plus(proceeds)
        break
      }

      case 'SPLIT': {
        if (!symbol) break
        // quantity is the net new shares; infer ratio
        // Robinhood records: positive qty = shares received (net after split)
        // We handle as: add a lot with 0 cost basis for the extra shares,
        // and scale existing lots proportionally
        // Better: find current shares, compute ratio = (current + qty) / current
        if (!lotBook[symbol] || lotBook[symbol].length === 0) break
        const currentShares = lotBook[symbol].reduce((s, l) => s + l.shares, 0)
        if (currentShares <= 0) break
        const newTotal = currentShares + Math.abs(quantity)
        const ratio = newTotal / currentShares
        lotBook[symbol].forEach((lot) => {
          lot.shares = new Decimal(lot.shares).times(ratio).toNumber()
          lot.costPerShare = new Decimal(lot.costPerShare).div(ratio).toNumber()
        })
        break
      }

      case 'MERGER':
      case 'SPINOFF': {
        if (symbol) warningSymbols.add(symbol)
        // Can't reliably handle — cash flow only
        cash = cash.plus(amount)
        break
      }

      case 'DIV':
      case 'DIVTAX': {
        dividendsReceived = dividendsReceived.plus(amount)
        cash = cash.plus(amount)
        break
      }

      case 'INT':
      case 'SLIP': {
        interestReceived = interestReceived.plus(amount)
        cash = cash.plus(amount)
        break
      }

      case 'ACH':
      case 'WIRE': {
        cash = cash.plus(amount)
        if (amount > 0) totalDeposits = totalDeposits.plus(amount)
        else totalWithdrawals = totalWithdrawals.plus(Math.abs(amount))
        break
      }

      case 'JNL': {
        cash = cash.plus(amount)
        if (amount > 0) totalDeposits = totalDeposits.plus(amount)
        else totalWithdrawals = totalWithdrawals.plus(Math.abs(amount))
        break
      }

      case 'FEE': {
        cash = cash.plus(amount)
        break
      }

      default:
        // OTHER — apply cash impact if any
        cash = cash.plus(amount)
        break
    }
  }

  // Build positions from remaining open lots
  const positions: Position[] = []
  for (const [symbol, lots] of Object.entries(lotBook)) {
    const openLots = lots.filter((l) => l.shares > 0.000001)
    if (openLots.length === 0) continue

    const totalShares = openLots.reduce((s, l) => s + l.shares, 0)
    const totalCost = openLots.reduce((s, l) => s + l.shares * l.costPerShare, 0)
    const avgCost = totalShares > 0 ? totalCost / totalShares : 0

    // Use last transaction price as fallback (no live quote yet)
    const txsForSym = transactions.filter((t) => t.symbol === symbol && t.price > 0)
    const lastTx = txsForSym.length > 0 ? txsForSym[txsForSym.length - 1] : null
    const lastPrice = lastTx?.price ?? 0

    positions.push({
      symbol,
      shares: totalShares,
      avgCost,
      costBasis: totalCost,
      marketPrice: lastPrice, // will be replaced by live quote
      marketValue: totalShares * lastPrice,
      unrealizedPnl: totalShares * lastPrice - totalCost,
      unrealizedPnlPct: totalCost > 0 ? ((totalShares * lastPrice - totalCost) / totalCost) * 100 : 0,
      pctOfPortfolio: 0, // computed after totalling
      lots: openLots,
    })
  }

  // Compute total portfolio value and pct weights
  const equityValue = positions.reduce((s, p) => s + p.marketValue, 0)
  const totalValue = equityValue + cash.toNumber()
  positions.forEach((p) => {
    p.pctOfPortfolio = totalValue > 0 ? (p.marketValue / totalValue) * 100 : 0
  })

  const totalCostBasis = positions.reduce((s, p) => s + p.costBasis, 0)
  const unrealizedPnlTotal = positions.reduce((s, p) => s + p.unrealizedPnl, 0)

  return {
    asOf: new Date(),
    positions,
    closedTrades,
    cash: cash.toNumber(),
    totalValue,
    totalCostBasis,
    totalDeposits: totalDeposits.toNumber(),
    totalWithdrawals: totalWithdrawals.toNumber(),
    netInvested: totalDeposits.minus(totalWithdrawals).toNumber(),
    realizedPnl: realizedPnl.toNumber(),
    unrealizedPnl: unrealizedPnlTotal,
    totalPnl: realizedPnl.toNumber() + unrealizedPnlTotal + dividendsReceived.toNumber(),
    dividendsReceived: dividendsReceived.toNumber(),
    interestReceived: interestReceived.toNumber(),
    firstActivityDate,
    warningSymbols: Array.from(warningSymbols),
  }
}

// Apply live quotes to snapshot positions
export function applyQuotes(
  snapshot: PortfolioSnapshot,
  quotes: Record<string, { price: number; prevClose: number; sector?: string; industry?: string; delisted?: boolean }>
): PortfolioSnapshot {
  const positions = snapshot.positions.map((p) => {
    const q = quotes[p.symbol]
    if (!q) return p
    if (q.delisted || q.price <= 0) {
      return {
        ...p,
        isDelisted: true,
        marketPrice: p.marketPrice || p.avgCost,
        marketValue: p.shares * (p.marketPrice || p.avgCost),
        unrealizedPnl: p.shares * (p.marketPrice || p.avgCost) - p.costBasis,
        unrealizedPnlPct: p.costBasis > 0 ? ((p.shares * (p.marketPrice || p.avgCost) - p.costBasis) / p.costBasis) * 100 : 0,
      }
    }
    const marketValue = p.shares * q.price
    return {
      ...p,
      marketPrice: q.price,
      marketValue,
      unrealizedPnl: marketValue - p.costBasis,
      unrealizedPnlPct: p.costBasis > 0 ? ((marketValue - p.costBasis) / p.costBasis) * 100 : 0,
      sector: q.sector,
      industry: q.industry,
      isDelisted: false,
    }
  })

  const equityValue = positions.reduce((s, p) => s + p.marketValue, 0)
  const totalValue = equityValue + snapshot.cash
  positions.forEach((p) => {
    p.pctOfPortfolio = totalValue > 0 ? (p.marketValue / totalValue) * 100 : 0
  })

  const unrealizedPnl = positions.reduce((s, p) => s + p.unrealizedPnl, 0)

  return {
    ...snapshot,
    positions,
    totalValue,
    unrealizedPnl,
    totalPnl: snapshot.realizedPnl + unrealizedPnl + snapshot.dividendsReceived,
  }
}
