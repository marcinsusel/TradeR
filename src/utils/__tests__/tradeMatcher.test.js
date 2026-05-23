import assert from 'assert';
import { computeTrades, deriveExpirationDate } from '../tradeMatcher.js';

// Mock transactions
const mockTransactions = [
  // Ticker AAPL - Simple Long Trade
  {
    id: 'txn-1',
    date: '2025-01-01',
    symbol: 'AAPL',
    quantity: '100',
    price: '150',
    commission: '5',
    type: 'BUY'
  },
  {
    id: 'txn-2',
    date: '2025-01-10',
    symbol: 'AAPL',
    quantity: '-100',
    price: '160',
    commission: '5',
    type: 'SELL'
  },

  // Ticker MSFT - Partial Fills
  {
    id: 'txn-3',
    date: '2025-02-01',
    symbol: 'MSFT',
    quantity: '150',
    price: '200',
    commission: '6',
    type: 'BUY'
  },
  {
    id: 'txn-4',
    date: '2025-02-15',
    symbol: 'MSFT',
    quantity: '-50',
    price: '210',
    commission: '2',
    type: 'SELL'
  },
  {
    id: 'txn-5',
    date: '2025-02-28',
    symbol: 'MSFT',
    quantity: '-100',
    price: '220',
    commission: '4',
    type: 'SELL'
  },

  // Ticker TSLA - Short Sale (Sell then Buy)
  {
    id: 'txn-6',
    date: '2025-03-01',
    symbol: 'TSLA',
    quantity: '-50',
    price: '300',
    commission: '10',
    type: 'SELL'
  },
  {
    id: 'txn-7',
    date: '2025-03-10',
    symbol: 'TSLA',
    quantity: '50',
    price: '280',
    commission: '10',
    type: 'BUY'
  },

  // OPTION TICKERS - Simple Long Option
  {
    id: 'txn-opt-1',
    date: '2025-04-01',
    symbol: 'AAPL 250620C00150000',
    quantity: '2',
    price: '5.50',
    commission: '1.00',
    type: 'BUY'
  },
  {
    id: 'txn-opt-2',
    date: '2025-04-05',
    symbol: 'AAPL 250620C00150000',
    quantity: '-2',
    price: '6.20',
    commission: '1.00',
    type: 'SELL'
  },

  // OPTION TICKERS - Short Option
  {
    id: 'txn-opt-3',
    date: '2025-04-10',
    symbol: 'TSLA 250620P00200000',
    quantity: '-1',
    price: '3.00',
    commission: '0.50',
    type: 'SELL'
  },
  {
    id: 'txn-opt-4',
    date: '2025-04-12',
    symbol: 'TSLA 250620P00200000',
    quantity: '1',
    price: '2.00',
    commission: '0.50',
    type: 'BUY'
  },

  // OPTION TICKERS - Open Option Position
  {
    id: 'txn-opt-5',
    date: '2025-04-15',
    symbol: 'MSFT 250620C00300000',
    quantity: '1',
    price: '4.00',
    commission: '1.50',
    type: 'BUY'
  },

  // OPTION TICKERS - Multiple opening and one aggregate close (expiration)
  {
    id: 'txn-opt-6',
    date: '2025-05-01',
    symbol: 'AAPL 250620C00200000',
    quantity: '1',
    price: '4.50',
    commission: '0.50',
    type: 'BUY'
  },
  {
    id: 'txn-opt-7',
    date: '2025-05-02',
    symbol: 'AAPL 250620C00200000',
    quantity: '1',
    price: '5.00',
    commission: '0.50',
    type: 'BUY'
  },
  {
    id: 'txn-opt-8',
    date: '2025-05-10',
    symbol: 'AAPL 250620C00200000',
    quantity: '-2',
    price: '0.00',
    commission: '0.00',
    type: 'SELL'
  }
];

function runTests() {
  console.log('🚀 Running TradeR Matching Engine Unit Tests...');

  try {
    const { trades, openPositions } = computeTrades(mockTransactions, 'FIFO');

    // 1. Validate simple long trade (AAPL)
    const aaplTrades = trades.filter(t => t.symbol === 'AAPL');
    assert.strictEqual(aaplTrades.length, 1, 'AAPL should have exactly 1 completed trade');
    const aapl = aaplTrades[0];
    assert.strictEqual(aapl.type, 'LONG', 'AAPL trade should be LONG');
    assert.strictEqual(aapl.quantity, 100, 'AAPL trade quantity should be 100');
    assert.strictEqual(aapl.costBasis, 15005, 'AAPL cost basis should be 15000 + 5 fees');
    assert.strictEqual(aapl.proceeds, 15995, 'AAPL proceeds should be 16000 - 5 fees');
    assert.strictEqual(aapl.realizedPnL, 990, 'AAPL realized PnL should be 15995 - 15005 = 990');
    console.log('✅ Test Passed: Simple Long Trade (AAPL)');

    // 2. Validate partial fills (MSFT)
    const msftTrades = trades.filter(t => t.symbol === 'MSFT');
    assert.strictEqual(msftTrades.length, 2, 'MSFT should have exactly 2 completed trades');
    
    // First partial close (50 shares)
    const msft1 = msftTrades.find(t => t.quantity === 50);
    assert.ok(msft1, 'Should find MSFT trade for 50 shares');
    // Proportional open fee: (50/150) * 6 = 2
    // Proportional close fee: (50/50) * 2 = 2
    assert.strictEqual(msft1.costBasis, 50 * 200 + 2, 'MSFT 50 cost basis check');
    assert.strictEqual(msft1.proceeds, 50 * 210 - 2, 'MSFT 50 proceeds check');
    assert.strictEqual(msft1.realizedPnL, 496, 'MSFT 50 realized PnL check');

    // Second partial close (100 shares)
    const msft2 = msftTrades.find(t => t.quantity === 100);
    assert.ok(msft2, 'Should find MSFT trade for 100 shares');
    // Proportional open fee: (100/150) * 6 = 4
    // Proportional close fee: (100/100) * 4 = 4
    assert.strictEqual(msft2.costBasis, 100 * 200 + 4, 'MSFT 100 cost basis check');
    assert.strictEqual(msft2.proceeds, 100 * 220 - 4, 'MSFT 100 proceeds check');
    assert.strictEqual(msft2.realizedPnL, 1992, 'MSFT 100 realized PnL check');
    console.log('✅ Test Passed: Partial Fills (MSFT)');

    // 3. Validate short sale (TSLA)
    const tslaTrades = trades.filter(t => t.symbol === 'TSLA');
    assert.strictEqual(tslaTrades.length, 1, 'TSLA should have exactly 1 completed trade');
    const tsla = tslaTrades[0];
    assert.strictEqual(tsla.type, 'SHORT', 'TSLA trade should be SHORT');
    assert.strictEqual(tsla.quantity, 50, 'TSLA quantity should be 50');
    // Short cost basis (closing BUY): 50 * 280 + 10 = 14010
    // Short proceeds (opening SELL): 50 * 300 - 10 = 14990
    assert.strictEqual(tsla.costBasis, 14010, 'TSLA short cost basis check');
    assert.strictEqual(tsla.proceeds, 14990, 'TSLA short proceeds check');
    assert.strictEqual(tsla.realizedPnL, 980, 'TSLA realized PnL check');
    console.log('✅ Test Passed: Short Sale (TSLA)');

    // 4. Validate option contract calculation - Long Trade (AAPL 250620C00150000)
    const optionLongTrades = trades.filter(t => t.symbol === 'AAPL 250620C00150000');
    assert.strictEqual(optionLongTrades.length, 1, 'AAPL Option should have exactly 1 completed trade');
    const optLong = optionLongTrades[0];
    assert.strictEqual(optLong.type, 'LONG', 'Option trade should be LONG');
    assert.strictEqual(optLong.quantity, 2, 'Option trade quantity should be 2');
    // cost basis: 2 * 100 * 5.50 + 1 = 1101
    // proceeds: 2 * 100 * 6.20 - 1 = 1239
    // PnL: 1239 - 1101 = 138
    assert.strictEqual(optLong.costBasis, 1101, 'Option cost basis check');
    assert.strictEqual(optLong.proceeds, 1239, 'Option proceeds check');
    assert.strictEqual(optLong.realizedPnL, 138, 'Option realized PnL check');
    console.log('✅ Test Passed: Long Option Trade (AAPL Option)');

    // 5. Validate option contract calculation - Short Trade (TSLA 250620P00200000)
    const optionShortTrades = trades.filter(t => t.symbol === 'TSLA 250620P00200000');
    assert.strictEqual(optionShortTrades.length, 1, 'TSLA Option should have exactly 1 completed trade');
    const optShort = optionShortTrades[0];
    assert.strictEqual(optShort.type, 'SHORT', 'Option trade should be SHORT');
    assert.strictEqual(optShort.quantity, 1, 'Option trade quantity should be 1');
    // cost basis (closing BUY): 1 * 100 * 2.00 + 0.50 = 200.50
    // proceeds (opening SELL): 1 * 100 * 3.00 - 0.50 = 299.50
    // PnL: 299.50 - 200.50 = 99
    assert.strictEqual(optShort.costBasis, 200.50, 'Short Option cost basis check');
    assert.strictEqual(optShort.proceeds, 299.50, 'Short Option proceeds check');
    assert.strictEqual(optShort.realizedPnL, 99, 'Short Option realized PnL check');
    console.log('✅ Test Passed: Short Option Trade (TSLA Option)');

    // 6. Validate option contract calculation - Open Position (MSFT 250620C00300000)
    assert.strictEqual(openPositions.length, 1, 'There should be exactly 1 open position');
    const openOpt = openPositions[0];
    assert.strictEqual(openOpt.symbol, 'MSFT 250620C00300000', 'Open option symbol check');
    assert.strictEqual(openOpt.type, 'LONG', 'Open option type check');
    assert.strictEqual(openOpt.quantity, 1, 'Open option quantity check');
    assert.strictEqual(openOpt.openPrice, 4.00, 'Open option price check');
    // cost basis: 1 * 100 * 4.00 + 1.50 = 401.50
    assert.strictEqual(openOpt.costBasis, 401.50, 'Open option cost basis check');
    console.log('✅ Test Passed: Open Option Position (MSFT Option)');

    // 7. Validate deriveExpirationDate
    assert.strictEqual(deriveExpirationDate('AAPL 260618C00150000'), '2026-06-18', 'Should correctly derive expiration date');
    assert.strictEqual(deriveExpirationDate('TSLA 251219P00250000'), '2025-12-19', 'Should correctly derive expiration date');
    assert.strictEqual(deriveExpirationDate('AAPL'), '', 'Should return empty string for non-options');
    console.log('✅ Test Passed: deriveExpirationDate helper');

    // 8. Validate multiple opening and one aggregate close
    const optMultipleTrades = trades.filter(t => t.symbol === 'AAPL 250620C00200000');
    assert.strictEqual(optMultipleTrades.length, 2, 'AAPL 250620C00200000 should have exactly 2 completed trades');
    
    const tradeA = optMultipleTrades.find(t => t.openTxnId === 'txn-opt-6');
    const tradeB = optMultipleTrades.find(t => t.openTxnId === 'txn-opt-7');
    
    assert.ok(tradeA, 'Should find trade for first BUY');
    assert.ok(tradeB, 'Should find trade for second BUY');
    
    assert.strictEqual(tradeA.closeTxnId, 'txn-opt-8', 'First trade closeTxnId check');
    assert.strictEqual(tradeB.closeTxnId, 'txn-opt-8', 'Second trade closeTxnId check');
    
    assert.strictEqual(tradeA.costBasis, 450.50, 'First trade cost basis check');
    assert.strictEqual(tradeA.proceeds, 0.00, 'First trade proceeds check');
    
    assert.strictEqual(tradeB.costBasis, 500.50, 'Second trade cost basis check');
    assert.strictEqual(tradeB.proceeds, 0.00, 'Second trade proceeds check');
    
    console.log('✅ Test Passed: Multiple Opening & One Aggregate Close');

    // 9. Validate Option Assignment basis reduction and skipping assigned options
    const assignmentTxns = [
      {
        id: 'XYZ-option-txn',
        date: '2025-05-15',
        symbol: 'XYZ 250620P00010000',
        quantity: '-1',
        price: '1.50',
        commission: '1.00',
        type: 'SELL',
        assignedToStockTxnId: 'XYZ-stock-txn'
      },
      {
        id: 'XYZ-stock-txn',
        date: '2025-06-01',
        symbol: 'XYZ',
        quantity: '100',
        price: '10.00',
        commission: '5.00',
        type: 'BUY',
        linkedOptionTxnId: 'XYZ-option-txn'
      },
      {
        id: 'XYZ-close-txn',
        date: '2025-06-05',
        symbol: 'XYZ',
        quantity: '-50',
        price: '12.00',
        commission: '2.00',
        type: 'SELL'
      }
    ];

    const result = computeTrades(assignmentTxns, 'FIFO');
    const openXYZ = result.openPositions.filter(p => p.symbol === 'XYZ');
    const openOption = result.openPositions.filter(p => p.symbol === 'XYZ 250620P00010000');
    
    // Assert option lot is hidden
    assert.strictEqual(openOption.length, 0, 'Assigned option should not create any open lots');

    // Assert open stock lot basis is adjusted
    assert.strictEqual(openXYZ.length, 1, 'Should have 1 open XYZ lot');
    const xyzLot = openXYZ[0];
    assert.strictEqual(xyzLot.quantity, 50, 'Open XYZ lot should have quantity 50');
    assert.strictEqual(xyzLot.standardBasis, 502.50, 'Open XYZ lot standardBasis check');
    assert.strictEqual(xyzLot.costBasis, 428.00, 'Open XYZ lot costBasis check (502.50 - 74.50)');
    assert.ok(xyzLot.linkedOption, 'Should have linkedOption details');
    assert.strictEqual(xyzLot.linkedOption.id, 'XYZ-option-txn', 'Linked option ID check');
    assert.strictEqual(xyzLot.linkedOption.proceeds, 74.50, 'Linked option proportional proceeds check');

    // Assert realized trade basis is adjusted
    const xyzTrades = result.trades.filter(t => t.symbol === 'XYZ');
    assert.strictEqual(xyzTrades.length, 1, 'Should have 1 realized XYZ trade');
    const xyzTrade = xyzTrades[0];
    assert.strictEqual(xyzTrade.quantity, 50, 'Realized trade quantity check');
    assert.strictEqual(xyzTrade.standardBasis, 502.50, 'Realized trade standard basis check');
    assert.strictEqual(xyzTrade.costBasis, 428.00, 'Realized trade cost basis check');
    assert.strictEqual(xyzTrade.proceeds, 598.00, 'Realized trade proceeds check');
    assert.strictEqual(xyzTrade.realizedPnL, 170.00, 'Realized trade PnL check');
    console.log('✅ Test Passed: Option Assignment cost basis rollover & skip');

    console.log('\n🎉 ALL MATCHING ENGINE TESTS PASSED SUCCESSFULLY! 🎉');
  } catch (err) {
    console.error('\n❌ Test Execution Failed:');
    console.error(err);
    process.exit(1);
  }
}

runTests();
