/**
 * FIFO Trade Matching Engine
 * Takes raw transactions, groups them by symbol, and matches Buys and Sells
 * to compute realized gains/losses and identify remaining open positions.
 */

/**
 * Standardizes raw transactions for the matching engine.
 * Trades are transactions with a non-zero quantity, valid price, and a symbol.
 */
export function standardizeTransactions(rawTransactions) {
  return rawTransactions
    .filter(t => {
      if (!t.symbol || t.symbol === '--' || t.symbol === '-') return false;
      const qty = parseFloat(t.quantity);
      const price = parseFloat(t.price);
      return !isNaN(qty) && qty !== 0 && !isNaN(price);
    })
    .map((t, index) => {
      const qty = parseFloat(t.quantity);
      const price = parseFloat(t.price);
      const commission = parseFloat(t.commission) || 0;
      
      // Determine type: negative quantity usually indicates a sell.
      // E.g., IBKR uses negative quantity for Sells.
      // E*TRADE uses negative quantity for Sells.
      // If the CSV explicitly has "Buy" or "Sold" type, we check that too.
      let type = qty < 0 ? 'SELL' : 'BUY';
      const actionType = (t.type || t.activityType || t.transactionType || '').toUpperCase();
      
      if (actionType.includes('SELL') || actionType.includes('SOLD') || actionType.includes('ASSIGN')) {
        type = 'SELL';
      } else if (actionType.includes('BUY') || actionType.includes('BOUGHT')) {
        type = 'BUY';
      }

      // Proportional net amount
      let netAmount = parseFloat(t.amount || t.netAmount || t.grossAmount) || 0;
      
      return {
        id: t.id || `txn-${index}-${t.date}-${t.symbol}-${Math.abs(qty)}`,
        date: t.date,
        symbol: t.symbol.trim().toUpperCase(),
        type,
        quantity: Math.abs(qty),
        price,
        fees: Math.abs(commission),
        netAmount,
        linkedOptionTxnId: t.linkedOptionTxnId,
        assignedToStockTxnId: t.assignedToStockTxnId,
        originalRow: t
      };
    });
}

/**
 * Pairs BUY and SELL transactions chronologically using FIFO.
 * Supports both standard Long trades (BUY then SELL) and Short trades (SELL then BUY).
 * 
 * Returns: {
 *   trades: Array of matched trades (realized),
 *   openPositions: Array of open positions (unrealized lots)
 * }
 */
/**
 * Helper to determine if a symbol represents an option contract.
 * Option tickers contain exactly two substrings separated by whitespace.
 */
export function isOptionTicker(symbol) {
  if (!symbol) return false;
  return symbol.trim().split(/\s+/).length === 2;
}

/**
 * Helper to derive expiration date from an option symbol.
 * Option symbol format (second word) starts with YYMMDD.
 * Converts YYMMDD to 20YY-MM-DD.
 */
export function deriveExpirationDate(symbol) {
  if (!symbol) return '';
  const parts = symbol.trim().split(/\s+/);
  if (parts.length !== 2) return '';
  const optionPart = parts[1];
  if (optionPart.length < 6) return '';
  const yymmdd = optionPart.substring(0, 6);
  if (/^\d{6}$/.test(yymmdd)) {
    const yy = yymmdd.substring(0, 2);
    const mm = yymmdd.substring(2, 4);
    const dd = yymmdd.substring(4, 6);
    return `20${yy}-${mm}-${dd}`;
  }
  return '';
}

/**
 * Pairs BUY and SELL transactions chronologically using FIFO.
 * Supports both standard Long trades (BUY then SELL) and Short trades (SELL then BUY).
 * 
 * Returns: {
 *   trades: Array of matched trades (realized),
 *   openPositions: Array of open positions (unrealized lots)
 * }
 */
export function computeTrades(transactions, method = 'FIFO') {
  const stdTxns = standardizeTransactions(transactions);
  
  // Build a map of standardized transactions for fast ID lookup
  const txnsById = {};
  stdTxns.forEach(t => {
    txnsById[t.id] = t;
  });
  
  // Group by symbol
  const groups = {};
  stdTxns.forEach(t => {
    if (!groups[t.symbol]) groups[t.symbol] = [];
    groups[t.symbol].push(t);
  });

  const allRealizedTrades = [];
  const allOpenPositions = [];

  // Process each ticker separately
  Object.keys(groups).forEach(symbol => {
    const symbolTxns = groups[symbol];
    const isOption = isOptionTicker(symbol);
    const multiplier = isOption ? 100 : 1;
    
    // Sort chronologically. 
    // To maintain stable sorting for trades on the same day, we keep their index
    symbolTxns.sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      if (dateA.getTime() !== dateB.getTime()) {
        return dateA.getTime() - dateB.getTime();
      }
      // If same day, put BUYs before SELLs (or vice versa? Usually we open before we close.
      // In FIFO, if we buy and sell on the same day, we want to process opening first).
      // Let's preserve index if it's there.
      return a.id.localeCompare(b.id);
    });

    const openLots = []; // Queue of unmatched lots: { date, price, quantity, fees, initialQuantity, type, id, linkedOptionTxnId }

    symbolTxns.forEach(txn => {
      // If this is an option transaction and it was assigned to a stock,
      // it is closed. It should not open any option lots or match against option closes.
      if (isOption && txn.assignedToStockTxnId) {
        return;
      }

      if (openLots.length === 0) {
        // No open position, this opens a new lot (could be long or short)
        openLots.push({
          id: txn.id,
          date: txn.date,
          price: txn.price,
          quantity: txn.quantity,
          initialQuantity: txn.quantity,
          fees: txn.fees,
          type: txn.type, // 'BUY' (long) or 'SELL' (short)
          linkedOptionTxnId: txn.linkedOptionTxnId
        });
        return;
      }

      const activeLotDirection = openLots[0].type;

      if (txn.type === activeLotDirection) {
        // Adding to an existing position in the same direction (e.g. buying more shares)
        openLots.push({
          id: txn.id,
          date: txn.date,
          price: txn.price,
          quantity: txn.quantity,
          initialQuantity: txn.quantity,
          fees: txn.fees,
          type: txn.type,
          linkedOptionTxnId: txn.linkedOptionTxnId
        });
      } else {
        // Opposite direction (closing transaction). Match against open lots.
        let qtyRemaining = txn.quantity;

        while (qtyRemaining > 0 && openLots.length > 0) {
          // FIFO: take the oldest lot from the front of the array.
          // LIFO: take the newest lot from the back of the array.
          const lotIndex = method === 'LIFO' ? openLots.length - 1 : 0;
          const lot = openLots[lotIndex];
          const matchQty = Math.min(qtyRemaining, lot.quantity);

          // Calculate proportional fees
          const proportionalLotFees = lot.initialQuantity > 0 ? (matchQty / lot.initialQuantity) * lot.fees : 0;
          const proportionalTxnFees = txn.quantity > 0 ? (matchQty / txn.quantity) * txn.fees : 0;

          let costBasis = 0;
          let proceeds = 0;

          if (lot.type === 'BUY') {
            // Long trade: Opened by BUY (lot), closed by SELL (txn)
            costBasis = matchQty * multiplier * lot.price + proportionalLotFees;
            proceeds = matchQty * multiplier * txn.price - proportionalTxnFees;
          } else {
            // Short trade: Opened by SELL (lot), closed by BUY (txn)
            proceeds = matchQty * multiplier * lot.price - proportionalLotFees;
            costBasis = matchQty * multiplier * txn.price + proportionalTxnFees;
          }

          const standardBasis = costBasis;
          let optProceeds = 0;
          if (lot.linkedOptionTxnId) {
            const optIds = String(lot.linkedOptionTxnId).split(',').filter(Boolean);
            optIds.forEach(optId => {
              if (txnsById[optId]) {
                const optionTxn = txnsById[optId];
                const totalOptProceeds = optionTxn.type === 'SELL'
                  ? (optionTxn.quantity * 100 * optionTxn.price - optionTxn.fees)
                  : -(optionTxn.quantity * 100 * optionTxn.price + optionTxn.fees);
                
                const linkedStockTxns = stdTxns.filter(t => t.linkedOptionTxnId && String(t.linkedOptionTxnId).split(',').includes(optId));
                const totalStockQty = linkedStockTxns.reduce((sum, t) => sum + t.quantity, 0);
                
                const proportionalOptProceeds = totalStockQty > 0
                  ? (matchQty / totalStockQty) * totalOptProceeds
                  : (matchQty / lot.initialQuantity) * totalOptProceeds;
                
                optProceeds += proportionalOptProceeds;
              }
            });
            costBasis -= optProceeds;
          }

          const realizedPnL = proceeds - costBasis;
          
          // Determine holding period (short vs long term)
          const openDateObj = new Date(lot.date);
          const closeDateObj = new Date(txn.date);
          const oneYearAgo = new Date(closeDateObj);
          oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
          const holdingPeriod = openDateObj <= oneYearAgo ? 'LONG_TERM' : 'SHORT_TERM';

          allRealizedTrades.push({
            id: `trade-${lot.id}-${txn.id}-${matchQty}`,
            symbol: symbol,
            type: lot.type === 'BUY' ? 'LONG' : 'SHORT',
            quantity: matchQty,
            openDate: lot.date,
            closeDate: txn.date,
            openPrice: lot.price,
            closePrice: txn.price,
            costBasis,
            proceeds,
            realizedPnL,
            holdingPeriod,
            openTxnId: lot.id,
            closeTxnId: txn.id,
            linkedOptionTxnId: lot.linkedOptionTxnId,
            standardBasis: standardBasis
          });

          // Update remaining quantities
          lot.quantity -= matchQty;
          qtyRemaining -= matchQty;

          if (lot.quantity <= 0.000001) { // float safety
            openLots.splice(lotIndex, 1);
          }
        }

        // If there's still quantity remaining in this transaction, it opens a position in the opposite direction
        if (qtyRemaining > 0.000001) {
          openLots.push({
            id: txn.id,
            date: txn.date,
            price: txn.price,
            quantity: qtyRemaining,
            initialQuantity: txn.quantity, // reference to original txn qty for fee calculation
            fees: txn.fees,
            type: txn.type,
            linkedOptionTxnId: txn.linkedOptionTxnId
          });
        }
      }
    });

    // Any remaining open lots represent current open positions
    openLots.forEach(lot => {
      let costBasis;
      const proportionalFees = lot.initialQuantity > 0 ? (lot.quantity / lot.initialQuantity) * lot.fees : 0;
      if (isOption) {
        if (lot.type === 'BUY') {
          costBasis = lot.quantity * 100 * lot.price + proportionalFees;
        } else {
          costBasis = lot.quantity * 100 * lot.price - proportionalFees;
        }
      } else {
        costBasis = lot.quantity * lot.price + proportionalFees;
      }

      // If stock lot has linked option assignment, reduce its cost basis
      let linkedOptions = null;
      let standardBasis = costBasis;
      if (!isOption && lot.linkedOptionTxnId) {
        const optIds = String(lot.linkedOptionTxnId).split(',').filter(Boolean);
        const optionsList = [];
        let totalOptProceedsForLot = 0;

        optIds.forEach(optId => {
          if (txnsById[optId]) {
            const optionTxn = txnsById[optId];
            const totalOptProceeds = optionTxn.type === 'SELL'
              ? (optionTxn.quantity * 100 * optionTxn.price - optionTxn.fees)
              : -(optionTxn.quantity * 100 * optionTxn.price + optionTxn.fees);
            
            const linkedStockTxns = stdTxns.filter(t => t.linkedOptionTxnId && String(t.linkedOptionTxnId).split(',').includes(optId));
            const totalStockQty = linkedStockTxns.reduce((sum, t) => sum + t.quantity, 0);
            
            const proportionalOptProceeds = totalStockQty > 0
              ? (lot.quantity / totalStockQty) * totalOptProceeds
              : (lot.quantity / lot.initialQuantity) * totalOptProceeds;
            
            totalOptProceedsForLot += proportionalOptProceeds;
            
            optionsList.push({
              id: optionTxn.id,
              date: optionTxn.date,
              symbol: optionTxn.symbol,
              type: optionTxn.type,
              quantity: optionTxn.quantity,
              price: optionTxn.price,
              fees: optionTxn.fees,
              proceeds: proportionalOptProceeds
            });
          }
        });

        if (optionsList.length > 0) {
          costBasis = standardBasis - totalOptProceedsForLot;
          linkedOptions = optionsList;
        }
      }

      allOpenPositions.push({
        symbol: symbol,
        type: lot.type === 'BUY' ? 'LONG' : 'SHORT',
        quantity: lot.quantity,
        openPrice: lot.price,
        openDate: lot.date,
        costBasis: costBasis,
        standardBasis: standardBasis,
        lotId: lot.id,
        linkedOptions: linkedOptions
      });
    });
  });

  return {
    trades: allRealizedTrades.sort((a, b) => new Date(b.closeDate) - new Date(a.closeDate)),
    openPositions: allOpenPositions
  };
}

/**
 * Generates realized gains reports aggregated by symbol for a date range.
 */
export function generateRealizedReport(trades, startDate, endDate) {
  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;

  // Filter trades by close date
  const filteredTrades = trades.filter(t => {
    const closeDate = new Date(t.closeDate);
    if (start && closeDate < start) return false;
    if (end && closeDate > end) return false;
    return true;
  });

  const summary = {
    totalPnL: 0,
    totalCostBasis: 0,
    totalProceeds: 0,
    shortTermPnL: 0,
    longTermPnL: 0,
    tradeCount: filteredTrades.length,
    bySymbol: {}
  };

  filteredTrades.forEach(t => {
    summary.totalPnL += t.realizedPnL;
    summary.totalCostBasis += t.costBasis;
    summary.totalProceeds += t.proceeds;

    if (t.holdingPeriod === 'LONG_TERM') {
      summary.longTermPnL += t.realizedPnL;
    } else {
      summary.shortTermPnL += t.realizedPnL;
    }

    if (!summary.bySymbol[t.symbol]) {
      summary.bySymbol[t.symbol] = {
        symbol: t.symbol,
        realizedPnL: 0,
        costBasis: 0,
        proceeds: 0,
        tradeCount: 0,
        volume: 0
      };
    }

    const sym = summary.bySymbol[t.symbol];
    sym.realizedPnL += t.realizedPnL;
    sym.costBasis += t.costBasis;
    sym.proceeds += t.proceeds;
    sym.tradeCount += 1;
    sym.volume += t.quantity;
  });

  return {
    summary,
    trades: filteredTrades
  };
}
