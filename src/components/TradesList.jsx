import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Search, Calendar, ChevronDown, ChevronUp, Layers, Activity } from 'lucide-react';

export default function TradesList() {
  const { trades, openPositions, transactions, deleteTransaction } = useApp();
  
  // Tab state
  const [activeTab, setActiveTab] = useState('completed'); // 'completed' | 'open' | 'transactions'

  // Search & Filters state
  const [tickerSearch, setTickerSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL'); // 'ALL' | 'LONG' | 'SHORT'
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Accordion details
  const [expandedTradeId, setExpandedTradeId] = useState(null);

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(val);
  };

  const formatPercentage = (val) => {
    return (val * 100).toFixed(2) + '%';
  };

  // 1. Filter Completed Trades
  const filteredTrades = useMemo(() => {
    return trades.filter(t => {
      const matchTicker = t.symbol.includes(tickerSearch.trim().toUpperCase());
      const matchType = typeFilter === 'ALL' || t.type === typeFilter;
      
      const tradeDate = new Date(t.closeDate);
      const matchStart = !startDate || tradeDate >= new Date(startDate);
      const matchEnd = !endDate || tradeDate <= new Date(endDate);

      return matchTicker && matchType && matchStart && matchEnd;
    });
  }, [trades, tickerSearch, typeFilter, startDate, endDate]);

  // 2. Filter Open Positions
  const filteredOpenPositions = useMemo(() => {
    return openPositions.filter(p => {
      const matchTicker = p.symbol.includes(tickerSearch.trim().toUpperCase());
      const matchType = typeFilter === 'ALL' || p.type === typeFilter;
      
      const tradeDate = new Date(p.openDate);
      const matchStart = !startDate || tradeDate >= new Date(startDate);
      const matchEnd = !endDate || tradeDate <= new Date(endDate);

      return matchTicker && matchType && matchStart && matchEnd;
    });
  }, [openPositions, tickerSearch, typeFilter, startDate, endDate]);

  // 3. Filter Raw Transactions (Audit Log)
  const filteredTransactions = useMemo(() => {
    return [...transactions]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .filter(t => {
        const symbol = t.symbol || '';
        const matchTicker = symbol.toUpperCase().includes(tickerSearch.trim().toUpperCase());
        
        let type = t.type;
        if (!type) {
          const qty = parseFloat(t.quantity);
          type = qty < 0 ? 'SELL' : 'BUY';
        }
        const matchType = typeFilter === 'ALL' || type === typeFilter;

        const tradeDate = new Date(t.date);
        const matchStart = !startDate || tradeDate >= new Date(startDate);
        const matchEnd = !endDate || tradeDate <= new Date(endDate);

        return matchTicker && matchType && matchStart && matchEnd;
      });
  }, [transactions, tickerSearch, typeFilter, startDate, endDate]);

  const toggleExpandTrade = (id) => {
    setExpandedTradeId(prev => (prev === id ? null : id));
  };

  // Find transaction details for linked trade lots
  const getLinkedTransactions = (trade) => {
    const openTxn = transactions.find(t => t.id === trade.openTxnId);
    const closeTxn = transactions.find(t => t.id === trade.closeTxnId);
    return { openTxn, closeTxn };
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <h1 className="glow-text" style={{ fontSize: '2.25rem', marginBottom: '0.5rem' }}>Trade History</h1>
        <p style={{ color: 'var(--text-secondary)' }}>View, search, and audit matched FIFO trades and open portfolio positions.</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', gap: '1.5rem' }}>
        <button 
          style={{
            background: 'transparent', border: 'none', padding: '0.75rem 0.25rem',
            borderBottom: activeTab === 'completed' ? '2px solid var(--color-primary)' : '2px solid transparent',
            color: activeTab === 'completed' ? 'var(--text-primary)' : 'var(--text-secondary)',
            fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem',
            fontSize: '0.95rem'
          }}
          onClick={() => setActiveTab('completed')}
        >
          <Activity size={16} />
          Completed Trades ({trades.length})
        </button>
        <button 
          style={{
            background: 'transparent', border: 'none', padding: '0.75rem 0.25rem',
            borderBottom: activeTab === 'open' ? '2px solid var(--color-primary)' : '2px solid transparent',
            color: activeTab === 'open' ? 'var(--text-primary)' : 'var(--text-secondary)',
            fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem',
            fontSize: '0.95rem'
          }}
          onClick={() => setActiveTab('open')}
        >
          <Layers size={16} />
          Open Lots ({openPositions.length})
        </button>
        <button 
          style={{
            background: 'transparent', border: 'none', padding: '0.75rem 0.25rem',
            borderBottom: activeTab === 'transactions' ? '2px solid var(--color-primary)' : '2px solid transparent',
            color: activeTab === 'transactions' ? 'var(--text-primary)' : 'var(--text-secondary)',
            fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem',
            fontSize: '0.95rem'
          }}
          onClick={() => setActiveTab('transactions')}
        >
          Audit Log ({transactions.length})
        </button>
      </div>

      {/* Filters Bar */}
      <div className="glass-panel" style={{ padding: '1rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.4rem 0.75rem', gap: '0.5rem', flexGrow: 1, minWidth: '180px' }}>
          <Search size={16} style={{ color: 'var(--text-muted)' }} />
          <input 
            type="text" 
            placeholder="Search symbol (e.g. TSLA)..." 
            value={tickerSearch}
            onChange={(e) => setTickerSearch(e.target.value)}
            style={{ background: 'transparent', border: 'none', outline: 'none', width: '100%', fontSize: '0.875rem' }}
          />
        </div>

        {/* Direction */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Type:</span>
          <select 
            className="form-input" 
            style={{ width: '110px', padding: '0.4rem 0.75rem' }}
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="ALL">All</option>
            <option value="LONG">Long</option>
            <option value="SHORT">Short</option>
          </select>
        </div>

        {/* Dates */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Calendar size={14} style={{ color: 'var(--text-muted)' }} />
          <input 
            type="date" 
            className="form-input" 
            style={{ width: '135px', padding: '0.4rem 0.5rem', fontSize: '0.75rem' }}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            placeholder="Start"
          />
          <span style={{ color: 'var(--text-muted)' }}>to</span>
          <input 
            type="date" 
            className="form-input" 
            style={{ width: '135px', padding: '0.4rem 0.5rem', fontSize: '0.75rem' }}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            placeholder="End"
          />
        </div>

        {/* Reset */}
        {(tickerSearch || typeFilter !== 'ALL' || startDate || endDate) && (
          <button 
            className="btn btn-secondary" 
            style={{ padding: '0.4rem 1rem' }}
            onClick={() => {
              setTickerSearch('');
              setTypeFilter('ALL');
              setStartDate('');
              setEndDate('');
            }}
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Tab Content: Completed Trades */}
      {activeTab === 'completed' && (
        <div className="glass-panel" style={{ padding: '1.25rem' }}>
          {filteredTrades.length > 0 ? (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '30px' }}></th>
                    <th>Ticker</th>
                    <th>Type</th>
                    <th>Qty</th>
                    <th>Open Date</th>
                    <th>Close Date</th>
                    <th>Open Price</th>
                    <th>Close Price</th>
                    <th>Cost Basis</th>
                    <th>Proceeds</th>
                    <th>Realized PnL</th>
                    <th>% PnL</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTrades.map((trade) => {
                    const isExpanded = expandedTradeId === trade.id;
                    const pnlPct = trade.costBasis > 0 ? trade.realizedPnL / trade.costBasis : 0;
                    const { openTxn, closeTxn } = getLinkedTransactions(trade);

                    return (
                      <React.Fragment key={trade.id}>
                        <tr 
                          onClick={() => toggleExpandTrade(trade.id)}
                          style={{ cursor: 'pointer', background: isExpanded ? 'rgba(255,255,255,0.02)' : 'transparent' }}
                        >
                          <td>
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </td>
                          <td style={{ fontWeight: '600' }}>{trade.symbol}</td>
                          <td>
                            <span className={`badge ${trade.type === 'LONG' ? 'badge-success' : 'badge-danger'}`}>
                              {trade.type}
                            </span>
                          </td>
                          <td>{trade.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                          <td>{trade.openDate}</td>
                          <td>{trade.closeDate}</td>
                          <td>{formatCurrency(trade.openPrice)}</td>
                          <td>{formatCurrency(trade.closePrice)}</td>
                          <td>{formatCurrency(trade.costBasis)}</td>
                          <td>{formatCurrency(trade.proceeds)}</td>
                          <td className={trade.realizedPnL >= 0 ? 'gain-text' : 'loss-text'} style={{ fontWeight: '600' }}>
                            {trade.realizedPnL >= 0 ? '+' : ''}{formatCurrency(trade.realizedPnL)}
                          </td>
                          <td className={trade.realizedPnL >= 0 ? 'gain-text' : 'loss-text'} style={{ fontWeight: '500' }}>
                            {trade.realizedPnL >= 0 ? '+' : ''}{formatPercentage(pnlPct)}
                          </td>
                        </tr>
                        
                        {/* Expanded Detail Accordion */}
                        {isExpanded && (
                          <tr>
                            <td colSpan={12} style={{ background: 'var(--bg-secondary)', padding: '1.25rem' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <h4 style={{ fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>
                                  Linked Audit Trails
                                </h4>
                                
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                                  {/* Opening Transaction */}
                                  <div className="glass-panel" style={{ padding: '1rem', background: 'var(--bg-tertiary)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                      <span style={{ fontWeight: '600', color: 'var(--color-primary)' }}>Opening Transaction</span>
                                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ID: {trade.openTxnId}</span>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem' }}>
                                      <div>Date: <strong>{trade.openDate}</strong></div>
                                      <div>Action: <strong>{openTxn?.activityType || 'BUY'}</strong></div>
                                      <div>Full Lot Qty: <strong>{openTxn?.quantity?.toLocaleString()}</strong> (Matched {trade.quantity.toLocaleString()})</div>
                                      <div>Price: <strong>{formatCurrency(openTxn?.price || trade.openPrice)}</strong></div>
                                      {openTxn?.commission > 0 && <div>Commission: <strong>{formatCurrency(openTxn.commission)}</strong></div>}
                                      <div>Total Net Cash: <strong className={openTxn?.amount >= 0 ? 'gain-text' : 'loss-text'}>{formatCurrency(openTxn?.amount || 0)}</strong></div>
                                    </div>
                                  </div>

                                  {/* Closing Transaction */}
                                  <div className="glass-panel" style={{ padding: '1rem', background: 'var(--bg-tertiary)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                      <span style={{ fontWeight: '600', color: 'var(--color-secondary)' }}>Closing Transaction</span>
                                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ID: {trade.closeTxnId}</span>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem' }}>
                                      <div>Date: <strong>{trade.closeDate}</strong></div>
                                      <div>Action: <strong>{closeTxn?.activityType || 'SELL'}</strong></div>
                                      <div>Full Lot Qty: <strong>{closeTxn?.quantity?.toLocaleString()}</strong> (Matched {trade.quantity.toLocaleString()})</div>
                                      <div>Price: <strong>{formatCurrency(closeTxn?.price || trade.closePrice)}</strong></div>
                                      {closeTxn?.commission > 0 && <div>Commission: <strong>{formatCurrency(closeTxn.commission)}</strong></div>}
                                      <div>Total Net Cash: <strong className={closeTxn?.amount >= 0 ? 'gain-text' : 'loss-text'}>{formatCurrency(closeTxn?.amount || 0)}</strong></div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)' }}>
              No completed trades found matching your filters.
            </div>
          )}
        </div>
      )}

      {/* Tab Content: Open Lots */}
      {activeTab === 'open' && (
        <div className="glass-panel" style={{ padding: '1.25rem' }}>
          {filteredOpenPositions.length > 0 ? (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Ticker</th>
                    <th>Type</th>
                    <th>Open Date</th>
                    <th>Quantity</th>
                    <th>Open Price</th>
                    <th>Current Cost Basis</th>
                    <th>Originating Txn ID</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOpenPositions.map((pos, idx) => (
                    <tr key={`${pos.symbol}-${idx}`}>
                      <td style={{ fontWeight: '600' }}>{pos.symbol}</td>
                      <td>
                        <span className={`badge ${pos.type === 'LONG' ? 'badge-success' : 'badge-danger'}`}>
                          {pos.type}
                        </span>
                      </td>
                      <td>{pos.openDate}</td>
                      <td>{pos.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                      <td>{formatCurrency(pos.openPrice)}</td>
                      <td style={{ fontWeight: '500' }}>{formatCurrency(pos.costBasis)}</td>
                      <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{pos.lotId}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)' }}>
              No open positions. All stock trades are fully closed.
            </div>
          )}
        </div>
      )}

      {/* Tab Content: Audit Log (Raw Transactions) */}
      {activeTab === 'transactions' && (
        <div className="glass-panel" style={{ padding: '1.25rem' }}>
          {filteredTransactions.length > 0 ? (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Ticker</th>
                    <th>Action/Type</th>
                    <th>Quantity</th>
                    <th>Price</th>
                    <th>Fees</th>
                    <th>Net Amount</th>
                    <th>Unique ID</th>
                    <th style={{ width: '80px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.map((t) => (
                    <tr key={t.id}>
                      <td>{t.date}</td>
                      <td style={{ fontWeight: '600' }}>{t.symbol}</td>
                      <td>
                        <span className={`badge ${t.type === 'BUY' ? 'badge-success' : 'badge-danger'}`}>
                          {t.activityType || t.type}
                        </span>
                      </td>
                      <td>{t.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                      <td>{formatCurrency(t.price)}</td>
                      <td>{formatCurrency(t.commission || 0)}</td>
                      <td style={{ fontWeight: '500' }} className={t.amount >= 0 ? 'gain-text' : 'loss-text'}>
                        {formatCurrency(t.amount)}
                      </td>
                      <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t.id}</td>
                      <td>
                        <button 
                          className="btn btn-danger" 
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                          onClick={() => {
                            if (window.confirm('Are you sure you want to delete this transaction? It will affect linked trades immediately.')) {
                              deleteTransaction(t.id);
                            }
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)' }}>
              No transactions imported yet.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
