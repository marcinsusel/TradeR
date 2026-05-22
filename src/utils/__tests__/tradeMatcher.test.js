import assert from 'assert';
import { computeTrades } from '../tradeMatcher.js';

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

    // 4. Validate open positions list
    assert.strictEqual(openPositions.length, 0, 'There should be 0 open positions left in this test');
    console.log('✅ Test Passed: Zero Open Positions remaining');

    console.log('\n🎉 ALL MATCHING ENGINE TESTS PASSED SUCCESSFULLY! 🎉');
  } catch (err) {
    console.error('\n❌ Test Execution Failed:');
    console.error(err);
    process.exit(1);
  }
}

runTests();
