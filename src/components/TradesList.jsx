import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Search, Calendar, ChevronDown, ChevronUp, Layers, Activity, ArrowUp, ArrowDown, ArrowUpDown, Briefcase, X } from 'lucide-react';
import { isOptionTicker, deriveExpirationDate, standardizeTransactions } from '../utils/tradeMatcher';

// Generic sorting utility
const getSortedData = (data, sortConfig, tabName) => {
  if (!sortConfig) return data;
  const { key, direction } = sortConfig;
  
  return [...data].sort((a, b) => {
    let valA, valB;
    
    if (tabName === 'completed' && key === 'pnlPct') {
      valA = a.costBasis > 0 ? a.realizedPnL / a.costBasis : 0;
      valB = b.costBasis > 0 ? b.realizedPnL / b.costBasis : 0;
    } else if (tabName === 'transactions' && key === 'type') {
      valA = a.activityType || a.type || '';
      valB = b.activityType || b.type || '';
    } else {
      valA = a[key];
      valB = b[key];
    }

    // Handle undefined/null
    if (valA === undefined || valA === null) return 1;
    if (valB === undefined || valB === null) return -1;

    let comparison = 0;
    
    // Check if key corresponds to a date
    if (key === 'openDate' || key === 'closeDate' || key === 'date') {
      const dateA = new Date(valA);
      const dateB = new Date(valB);
      comparison = dateA - dateB;
    } else if (typeof valA === 'number' && typeof valB === 'number') {
      comparison = valA - valB;
    } else {
      // String comparison
      comparison = String(valA).localeCompare(String(valB), undefined, { numeric: true, sensitivity: 'base' });
    }

    return direction === 'asc' ? comparison : -comparison;
  });
};

export default function TradesList() {
  const { trades, openPositions, transactions, deleteTransaction, importTransactions, updateTransactions } = useApp();
  
  // Tab state
  const [activeTab, setActiveTab] = useState('completed'); // 'completed' | 'open' | 'transactions'

  // Bulk selection state
  const [selectedSymbols, setSelectedSymbols] = useState(new Set());

  // Modal state
  const [isExpiringModalOpen, setIsExpiringModalOpen] = useState(false);
  const [expiringPositions, setExpiringPositions] = useState([]); // Array of { symbol, type, quantity, costBasis, date }

  // Expand/collapse states
  const [expandedSymbols, setExpandedSymbols] = useState(new Set());
  const [expandedLotIds, setExpandedLotIds] = useState(new Set());

  // Assignment Modal state
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [assignModalSelectedOptionId, setAssignModalSelectedOptionId] = useState('');
  const [assignModalSelectedStockId, setAssignModalSelectedStockId] = useState('');

  const toggleExpandSymbol = (symbol) => {
    setExpandedSymbols(prev => {
      const next = new Set(prev);
      if (next.has(symbol)) {
        next.delete(symbol);
      } else {
        next.add(symbol);
      }
      return next;
    });
  };

  const toggleExpandLot = (lotId) => {
    setExpandedLotIds(prev => {
      const next = new Set(prev);
      if (next.has(lotId)) {
        next.delete(lotId);
      } else {
        next.add(lotId);
      }
      return next;
    });
  };

  const handleOpenAssignModal = () => {
    setAssignModalSelectedOptionId('');
    setAssignModalSelectedStockId('');
    setIsAssignModalOpen(true);
  };

  const handleTabChange = (tabName) => {
    setActiveTab(tabName);
    setSelectedSymbols(new Set());
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      const allVisibleSymbols = filteredAggregatedPositions.map(pos => pos.symbol);
      setSelectedSymbols(new Set(allVisibleSymbols));
    } else {
      setSelectedSymbols(new Set());
    }
  };

  const handleSelectRow = (symbol) => {
    setSelectedSymbols(prev => {
      const next = new Set(prev);
      if (next.has(symbol)) {
        next.delete(symbol);
      } else {
        next.add(symbol);
      }
      return next;
    });
  };

  const handleOpenExpireOptionsModal = () => {
    const optionsToExpire = filteredAggregatedPositions
      .filter(pos => selectedSymbols.has(pos.symbol) && isOptionTicker(pos.symbol))
      .map(pos => {
        const date = deriveExpirationDate(pos.symbol) || new Date().toISOString().split('T')[0];
        return {
          symbol: pos.symbol,
          type: pos.type,
          quantity: pos.quantity,
          costBasis: pos.costBasis,
          date
        };
      });

    if (optionsToExpire.length === 0) {
      alert("None of the selected positions are option contracts.");
      return;
    }

    setExpiringPositions(optionsToExpire);
    setIsExpiringModalOpen(true);
  };

  const handleConfirmExpiration = async () => {
    try {
      const closingTxns = expiringPositions.map(pos => {
        return {
          id: `exp-${pos.symbol.replace(/\s+/g, '-')}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          date: pos.date,
          symbol: pos.symbol,
          quantity: String(pos.quantity),
          price: '0',
          commission: '0',
          type: pos.type === 'LONG' ? 'SELL' : 'BUY'
        };
      });

      await importTransactions(closingTxns);
      setSelectedSymbols(new Set());
      setIsExpiringModalOpen(false);
    } catch (err) {
      console.error(err);
      alert("Failed to record option expirations: " + err.message);
    }
  };

  const handleConfirmAssignment = async () => {
    if (!assignModalSelectedOptionId || !assignModalSelectedStockId) {
      alert("Please select exactly one option lot and one stock lot to link.");
      return;
    }

    const updated = transactions.map(t => {
      if (t.id === assignModalSelectedOptionId) {
        return {
          ...t,
          assignedToStockTxnId: assignModalSelectedStockId
        };
      }
      if (t.id === assignModalSelectedStockId) {
        return {
          ...t,
          linkedOptionTxnId: assignModalSelectedOptionId
        };
      }
      return t;
    });

    try {
      await updateTransactions(updated);
      setIsAssignModalOpen(false);
      setSelectedSymbols(new Set());
    } catch (err) {
      console.error(err);
      alert("Failed to save assignment link: " + err.message);
    }
  };

  const handleUnlinkAssignment = async (stockTxnId, optionTxnId) => {
    if (!window.confirm("Are you sure you want to remove the link between this option and stock?")) {
      return;
    }
    const updated = transactions.map(t => {
      if (t.id === stockTxnId) {
        const next = { ...t };
        delete next.linkedOptionTxnId;
        return next;
      }
      if (t.id === optionTxnId) {
        const next = { ...t };
        delete next.assignedToStockTxnId;
        return next;
      }
      return t;
    });

    try {
      await updateTransactions(updated);
    } catch (err) {
      console.error(err);
      alert("Failed to remove assignment link: " + err.message);
    }
  };

  // Search & Filters state
  const [tickerSearch, setTickerSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL'); // 'ALL' | 'LONG' | 'SHORT'
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Sorting state per tab
  const [completedSort, setCompletedSort] = useState({ key: 'closeDate', direction: 'desc' });
  const [positionsSort, setPositionsSort] = useState({ key: 'symbol', direction: 'asc' });
  const [openSort, setOpenSort] = useState({ key: 'symbol', direction: 'asc' });
  const [transactionSort, setTransactionSort] = useState({ key: 'date', direction: 'desc' });

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

  // 1. Filter and Sort Completed Trades
  const filteredTrades = useMemo(() => {
    const filtered = trades.filter(t => {
      const matchTicker = t.symbol.includes(tickerSearch.trim().toUpperCase());
      const matchType = typeFilter === 'ALL' || t.type === typeFilter;
      
      const tradeDate = new Date(t.closeDate);
      const matchStart = !startDate || tradeDate >= new Date(startDate);
      const matchEnd = !endDate || tradeDate <= new Date(endDate);

      return matchTicker && matchType && matchStart && matchEnd;
    });

    return getSortedData(filtered, completedSort, 'completed');
  }, [trades, tickerSearch, typeFilter, startDate, endDate, completedSort]);

  // 2. Filter and Sort Open Positions (Aggregated by Ticker)
  const filteredAggregatedPositions = useMemo(() => {
    const filtered = openPositions.filter(p => {
      const matchTicker = p.symbol.includes(tickerSearch.trim().toUpperCase());
      const matchType = typeFilter === 'ALL' || p.type === typeFilter;
      
      const tradeDate = new Date(p.openDate);
      const matchStart = !startDate || tradeDate >= new Date(startDate);
      const matchEnd = !endDate || tradeDate <= new Date(endDate);

      return matchTicker && matchType && matchStart && matchEnd;
    });

    // Aggregate by ticker
    const groups = {};
    filtered.forEach(p => {
      if (!groups[p.symbol]) {
        groups[p.symbol] = {
          symbol: p.symbol,
          type: p.type,
          quantity: 0,
          costBasis: 0
        };
      }
      groups[p.symbol].quantity += p.quantity;
      groups[p.symbol].costBasis += p.costBasis;
    });

    const positionsArray = Object.values(groups).map(pos => ({
      ...pos,
      costBasisPerUnit: pos.quantity > 0 ? pos.costBasis / pos.quantity : 0
    }));

    return getSortedData(positionsArray, positionsSort, 'positions');
  }, [openPositions, tickerSearch, typeFilter, startDate, endDate, positionsSort]);

  const uniquePositionsCount = useMemo(() => {
    return new Set(openPositions.map(p => p.symbol)).size;
  }, [openPositions]);

  // 3. Filter and Sort Open Lots (Individual Lots)
  const filteredOpenPositions = useMemo(() => {
    const filtered = openPositions.filter(p => {
      const matchTicker = p.symbol.includes(tickerSearch.trim().toUpperCase());
      const matchType = typeFilter === 'ALL' || p.type === typeFilter;
      
      const tradeDate = new Date(p.openDate);
      const matchStart = !startDate || tradeDate >= new Date(startDate);
      const matchEnd = !endDate || tradeDate <= new Date(endDate);

      return matchTicker && matchType && matchStart && matchEnd;
    });

    return getSortedData(filtered, openSort, 'open');
  }, [openPositions, tickerSearch, typeFilter, startDate, endDate, openSort]);

  // 4. Filter and Sort Raw Transactions (Audit Log)
  const filteredTransactions = useMemo(() => {
    const filtered = transactions.filter(t => {
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

    return getSortedData(filtered, transactionSort, 'transactions');
  }, [transactions, tickerSearch, typeFilter, startDate, endDate, transactionSort]);

  const handleSort = (tab, key) => {
    if (tab === 'completed') {
      setCompletedSort(prev => {
        if (prev && prev.key === key) {
          return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
        }
        return { key, direction: 'asc' };
      });
    } else if (tab === 'positions') {
      setPositionsSort(prev => {
        if (prev && prev.key === key) {
          return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
        }
        return { key, direction: 'asc' };
      });
    } else if (tab === 'open') {
      setOpenSort(prev => {
        if (prev && prev.key === key) {
          return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
        }
        return { key, direction: 'asc' };
      });
    } else if (tab === 'transactions') {
      setTransactionSort(prev => {
        if (prev && prev.key === key) {
          return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
        }
        return { key, direction: 'asc' };
      });
    }
  };

  const renderSortableHeader = (tab, key, label, style = {}) => {
    let sortConfig;
    if (tab === 'completed') sortConfig = completedSort;
    else if (tab === 'positions') sortConfig = positionsSort;
    else if (tab === 'open') sortConfig = openSort;
    else if (tab === 'transactions') sortConfig = transactionSort;

    const isActive = sortConfig && sortConfig.key === key;
    const direction = isActive ? sortConfig.direction : null;

    return (
      <th 
        className="sortable" 
        onClick={() => handleSort(tab, key)}
        style={{ ...style }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <span>{label}</span>
          <span className="sort-icon" style={{ opacity: isActive ? 1 : 0.3 }}>
            {direction === 'asc' ? (
              <ArrowUp size={14} style={{ color: 'var(--color-primary)' }} />
            ) : direction === 'desc' ? (
              <ArrowDown size={14} style={{ color: 'var(--color-primary)' }} />
            ) : (
              <ArrowUpDown size={14} />
            )}
          </span>
        </div>
      </th>
    );
  };

  const toggleExpandTrade = (id) => {
    setExpandedTradeId(prev => (prev === id ? null : id));
  };

  // Find transaction details for linked trade lots
  const getLinkedTransactions = (trade) => {
    const stdTxns = standardizeTransactions(transactions);
    const openTxn = stdTxns.find(t => t.id === trade.openTxnId);
    const closeTxn = stdTxns.find(t => t.id === trade.closeTxnId);
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
          onClick={() => handleTabChange('completed')}
        >
          <Activity size={16} />
          Completed Trades ({trades.length})
        </button>
        <button 
          style={{
            background: 'transparent', border: 'none', padding: '0.75rem 0.25rem',
            borderBottom: activeTab === 'positions' ? '2px solid var(--color-primary)' : '2px solid transparent',
            color: activeTab === 'positions' ? 'var(--text-primary)' : 'var(--text-secondary)',
            fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem',
            fontSize: '0.95rem'
          }}
          onClick={() => handleTabChange('positions')}
        >
          <Briefcase size={16} />
          Open Positions ({uniquePositionsCount})
        </button>
        <button 
          style={{
            background: 'transparent', border: 'none', padding: '0.75rem 0.25rem',
            borderBottom: activeTab === 'open' ? '2px solid var(--color-primary)' : '2px solid transparent',
            color: activeTab === 'open' ? 'var(--text-primary)' : 'var(--text-secondary)',
            fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem',
            fontSize: '0.95rem'
          }}
          onClick={() => handleTabChange('open')}
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
          onClick={() => handleTabChange('transactions')}
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
                    {renderSortableHeader('completed', 'symbol', 'Ticker')}
                    {renderSortableHeader('completed', 'type', 'Type')}
                    {renderSortableHeader('completed', 'quantity', 'Qty')}
                    {renderSortableHeader('completed', 'openDate', 'Open Date')}
                    {renderSortableHeader('completed', 'closeDate', 'Close Date')}
                    {renderSortableHeader('completed', 'openPrice', 'Open Price')}
                    {renderSortableHeader('completed', 'closePrice', 'Close Price')}
                    {renderSortableHeader('completed', 'costBasis', 'Cost Basis')}
                    {renderSortableHeader('completed', 'proceeds', 'Proceeds')}
                    {renderSortableHeader('completed', 'realizedPnL', 'Realized PnL')}
                    {renderSortableHeader('completed', 'pnlPct', '% PnL')}
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

      {/* Tab Content: Open Positions (Aggregated) */}
      {activeTab === 'positions' && (
        <div className="glass-panel" style={{ padding: '1.25rem' }}>
          {filteredAggregatedPositions.length > 0 ? (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}></th>
                    <th style={{ width: '45px', textAlign: 'center', padding: '0.75rem 1rem' }}>
                      <input 
                        type="checkbox"
                        checked={filteredAggregatedPositions.length > 0 && selectedSymbols.size === filteredAggregatedPositions.length}
                        onChange={handleSelectAll}
                      />
                    </th>
                    {renderSortableHeader('positions', 'symbol', 'Ticker')}
                    {renderSortableHeader('positions', 'type', 'Type')}
                    {renderSortableHeader('positions', 'quantity', 'Quantity')}
                    {renderSortableHeader('positions', 'costBasis', 'Cost Basis')}
                    {renderSortableHeader('positions', 'costBasisPerUnit', 'Cost Basis/Unit')}
                  </tr>
                </thead>
                <tbody>
                  {filteredAggregatedPositions.map((pos) => {
                    const isExpanded = expandedSymbols.has(pos.symbol);
                    const symbolLots = openPositions.filter(lot => lot.symbol === pos.symbol);
                    const sortedLots = [...symbolLots].sort((a, b) => new Date(a.openDate) - new Date(b.openDate));

                    return (
                      <React.Fragment key={pos.symbol}>
                        <tr 
                          onClick={() => toggleExpandSymbol(pos.symbol)}
                          style={{ cursor: 'pointer', background: isExpanded ? 'rgba(255,255,255,0.02)' : 'transparent' }}
                        >
                          <td style={{ paddingLeft: '1rem' }} onClick={(e) => e.stopPropagation()}>
                            <button
                              style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'inherit' }}
                              onClick={() => toggleExpandSymbol(pos.symbol)}
                            >
                              {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </button>
                          </td>
                          <td style={{ textAlign: 'center', padding: '0.75rem 1rem' }} onClick={(e) => e.stopPropagation()}>
                            <input 
                              type="checkbox"
                              checked={selectedSymbols.has(pos.symbol)}
                              onChange={() => handleSelectRow(pos.symbol)}
                            />
                          </td>
                          <td style={{ fontWeight: '600' }}>{pos.symbol}</td>
                          <td>
                            <span className={`badge ${pos.type === 'LONG' ? 'badge-success' : 'badge-danger'}`}>
                              {pos.type}
                            </span>
                          </td>
                          <td>{pos.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                          <td style={{ fontWeight: '500' }}>{formatCurrency(pos.costBasis)}</td>
                          <td>{formatCurrency(pos.costBasisPerUnit)}</td>
                        </tr>

                        {isExpanded && (
                          <tr className="inner-expand-container">
                            <td colSpan={7} style={{ background: 'var(--bg-secondary)', padding: '1rem 1rem 1.5rem 2.5rem' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <h4 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>
                                  Open Lots for {pos.symbol}
                                </h4>
                                {sortedLots.length > 0 ? (
                                  <div className="table-container">
                                    <table className="nested-table">
                                      <thead>
                                        <tr>
                                          <th style={{ width: '40px' }}></th>
                                          <th>Open Date</th>
                                          <th>Quantity</th>
                                          <th>Standard Cost Basis</th>
                                          <th>Current Cost Basis</th>
                                          <th>Linked Option?</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {sortedLots.map((lot) => {
                                          const hasLink = !!lot.linkedOption;
                                          const isLotExpanded = expandedLotIds.has(lot.lotId);

                                          return (
                                            <React.Fragment key={lot.lotId}>
                                              <tr 
                                                style={{ cursor: hasLink ? 'pointer' : 'default' }}
                                                onClick={() => {
                                                  if (hasLink) toggleExpandLot(lot.lotId);
                                                }}
                                              >
                                                <td>
                                                  {hasLink && (
                                                    isLotExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                                                  )}
                                                </td>
                                                <td>{lot.openDate}</td>
                                                <td>{lot.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                                                <td>{formatCurrency(lot.standardBasis)}</td>
                                                <td style={{ fontWeight: '500' }}>
                                                  {formatCurrency(lot.costBasis)}
                                                  {hasLink && (
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--color-success)', marginLeft: '0.5rem', fontWeight: 'bold' }}>
                                                      (Adjusted)
                                                    </span>
                                                  )}
                                                </td>
                                                <td>
                                                  {hasLink ? (
                                                    <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>
                                                      Linked ({lot.linkedOption.symbol})
                                                    </span>
                                                  ) : (
                                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>None</span>
                                                  )}
                                                </td>
                                              </tr>
                                              
                                              {isLotExpanded && lot.linkedOption && (
                                                <tr>
                                                  <td colSpan={6} style={{ background: 'var(--bg-tertiary)', padding: '1rem' }}>
                                                    <div style={{
                                                      borderLeft: '3px solid var(--color-success)',
                                                      paddingLeft: '1rem',
                                                      display: 'flex',
                                                      flexDirection: 'column',
                                                      gap: '0.75rem'
                                                    }}>
                                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <h5 style={{ margin: 0, color: 'var(--color-success)', fontSize: '0.85rem', fontWeight: '600' }}>
                                                          Option Assignment Details
                                                        </h5>
                                                        <button 
                                                          className="btn btn-danger" 
                                                          style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}
                                                          onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleUnlinkAssignment(lot.lotId, lot.linkedOption.id);
                                                          }}
                                                        >
                                                          Unlink Assignment
                                                        </button>
                                                      </div>
                                                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem', fontSize: '0.8rem' }}>
                                                        <div>Option Ticker: <strong>{lot.linkedOption.symbol}</strong></div>
                                                        <div>Opening Date: <strong>{lot.linkedOption.date}</strong></div>
                                                        <div>Contracts: <strong>{lot.linkedOption.quantity}</strong></div>
                                                        <div>Premium Price: <strong>{formatCurrency(lot.linkedOption.price)}</strong></div>
                                                        <div>Option Fees: <strong>{formatCurrency(lot.linkedOption.fees)}</strong></div>
                                                        <div>Proceeds Rollover: <strong className="gain-text">-{formatCurrency(lot.linkedOption.proceeds)}</strong></div>
                                                        <div>Standard Cost Basis: <strong>{formatCurrency(lot.standardBasis)}</strong></div>
                                                        <div>Adjusted Cost Basis: <strong className="gain-text">{formatCurrency(lot.costBasis)}</strong></div>
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
                                  <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No individual lots found.</div>
                                )}
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
              No open positions. All stock trades are fully closed.
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
                    {renderSortableHeader('open', 'symbol', 'Ticker')}
                    {renderSortableHeader('open', 'type', 'Type')}
                    {renderSortableHeader('open', 'openDate', 'Open Date')}
                    {renderSortableHeader('open', 'quantity', 'Quantity')}
                    {renderSortableHeader('open', 'openPrice', 'Open Price')}
                    {renderSortableHeader('open', 'costBasis', 'Current Cost Basis')}
                    {renderSortableHeader('open', 'lotId', 'Originating Txn ID')}
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
                    {renderSortableHeader('transactions', 'date', 'Date')}
                    {renderSortableHeader('transactions', 'symbol', 'Ticker')}
                    {renderSortableHeader('transactions', 'type', 'Action/Type')}
                    {renderSortableHeader('transactions', 'quantity', 'Quantity')}
                    {renderSortableHeader('transactions', 'price', 'Price')}
                    {renderSortableHeader('transactions', 'commission', 'Fees')}
                    {renderSortableHeader('transactions', 'amount', 'Net Amount')}
                    {renderSortableHeader('transactions', 'id', 'Unique ID')}
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

      {/* Floating Bulk Actions Bar */}
      {selectedSymbols.size > 0 && activeTab === 'positions' && (
        <div className="bulk-actions-bar">
          <span style={{ fontSize: '0.9rem', fontWeight: '500', color: 'var(--text-primary)' }}>
            {selectedSymbols.size} position{selectedSymbols.size > 1 ? 's' : ''} selected
          </span>
          <button 
            className="btn btn-primary"
            onClick={handleOpenExpireOptionsModal}
            disabled={![...selectedSymbols].some(sym => isOptionTicker(sym))}
            style={{
              opacity: [...selectedSymbols].some(sym => isOptionTicker(sym)) ? 1 : 0.5,
              cursor: [...selectedSymbols].some(sym => isOptionTicker(sym)) ? 'pointer' : 'not-allowed'
            }}
          >
            Expire Options
          </button>
          {selectedSymbols.size >= 2 && (
            <button 
              className="btn btn-primary"
              onClick={handleOpenAssignModal}
              style={{ background: 'var(--color-secondary)' }}
            >
              Assign Options
            </button>
          )}
          <button 
            className="btn btn-secondary" 
            onClick={() => setSelectedSymbols(new Set())}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Option Expiration Modal */}
      {isExpiringModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Expire Option Positions</h3>
              <button className="btn-icon" onClick={() => setIsExpiringModalOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>
                You are about to expire the following option contract positions. They will be closed with a price of <strong>$0.00</strong> (worthless).
              </p>
              
              <div className="table-container" style={{ marginBottom: '1rem' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Ticker</th>
                      <th>Type</th>
                      <th>Quantity</th>
                      <th>Expiration Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expiringPositions.map((pos) => (
                      <tr key={pos.symbol}>
                        <td style={{ fontWeight: '600' }}>{pos.symbol}</td>
                        <td>
                          <span className={`badge ${pos.type === 'LONG' ? 'badge-success' : 'badge-danger'}`}>
                            {pos.type}
                          </span>
                        </td>
                        <td>{pos.quantity}</td>
                        <td>
                          <input 
                            type="date"
                            className="form-input"
                            style={{ padding: '0.35rem 0.5rem', width: '150px' }}
                            value={pos.date}
                            onChange={(e) => {
                              const newDate = e.target.value;
                              setExpiringPositions(prev => 
                                prev.map(p => p.symbol === pos.symbol ? { ...p, date: newDate } : p)
                              );
                            }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                * Expiration will add a closing transaction with a price of $0.00 to the transaction history. This will realize any remaining premium profit or loss.
              </p>
            </div>
            <div className="modal-footer">
              <button 
                className="btn btn-secondary" 
                onClick={() => setIsExpiringModalOpen(false)}
              >
                Cancel
              </button>
              <button 
                className="btn btn-success" 
                onClick={handleConfirmExpiration}
              >
                Confirm Expiration
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Options Modal */}
      {isAssignModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '900px' }}>
            <div className="modal-header">
              <h3>Link Option Assignment</h3>
              <button className="btn-icon" onClick={() => setIsAssignModalOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: '1.25rem', color: 'var(--text-secondary)' }}>
                Select exactly one open option lot and one open stock lot to link them. The option proceeds will reduce the stock lot's cost basis.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', minHeight: '200px' }}>
                {/* Options Column */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <h4 style={{ fontSize: '1rem', color: 'var(--color-primary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                    1. Select Option Lot
                  </h4>
                  {openPositions.filter(p => selectedSymbols.has(p.symbol) && isOptionTicker(p.symbol)).length > 0 ? (
                    <div className="table-container" style={{ maxHeight: '250px', overflowY: 'auto' }}>
                      <table>
                        <thead>
                          <tr>
                            <th style={{ width: '40px' }}></th>
                            <th>Date</th>
                            <th>Ticker</th>
                            <th>Qty</th>
                            <th>Price</th>
                          </tr>
                        </thead>
                        <tbody>
                          {openPositions
                            .filter(p => selectedSymbols.has(p.symbol) && isOptionTicker(p.symbol))
                            .map((lot) => (
                              <tr 
                                key={lot.lotId} 
                                style={{ cursor: 'pointer', background: assignModalSelectedOptionId === lot.lotId ? 'rgba(99, 102, 241, 0.1)' : 'transparent' }}
                                onClick={() => setAssignModalSelectedOptionId(lot.lotId)}
                              >
                                <td style={{ textAlign: 'center' }}>
                                  <input 
                                    type="radio" 
                                    name="assignOptionLot"
                                    checked={assignModalSelectedOptionId === lot.lotId}
                                    onChange={() => setAssignModalSelectedOptionId(lot.lotId)}
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                </td>
                                <td style={{ fontSize: '0.8rem' }}>{lot.openDate}</td>
                                <td style={{ fontWeight: '600' }}>{lot.symbol}</td>
                                <td>{lot.quantity}</td>
                                <td>{formatCurrency(lot.openPrice)}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', padding: '1rem 0' }}>
                      No open option lots in selected symbols.
                    </div>
                  )}
                </div>

                {/* Stocks Column */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <h4 style={{ fontSize: '1rem', color: 'var(--color-secondary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                    2. Select Stock Lot
                  </h4>
                  {openPositions.filter(p => selectedSymbols.has(p.symbol) && !isOptionTicker(p.symbol)).length > 0 ? (
                    <div className="table-container" style={{ maxHeight: '250px', overflowY: 'auto' }}>
                      <table>
                        <thead>
                          <tr>
                            <th style={{ width: '40px' }}></th>
                            <th>Date</th>
                            <th>Ticker</th>
                            <th>Qty</th>
                            <th>Price</th>
                          </tr>
                        </thead>
                        <tbody>
                          {openPositions
                            .filter(p => selectedSymbols.has(p.symbol) && !isOptionTicker(p.symbol))
                            .map((lot) => (
                              <tr 
                                key={lot.lotId} 
                                style={{ cursor: 'pointer', background: assignModalSelectedStockId === lot.lotId ? 'rgba(6, 182, 212, 0.1)' : 'transparent' }}
                                onClick={() => setAssignModalSelectedStockId(lot.lotId)}
                              >
                                <td style={{ textAlign: 'center' }}>
                                  <input 
                                    type="radio" 
                                    name="assignStockLot"
                                    checked={assignModalSelectedStockId === lot.lotId}
                                    onChange={() => setAssignModalSelectedStockId(lot.lotId)}
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                </td>
                                <td style={{ fontSize: '0.8rem' }}>{lot.openDate}</td>
                                <td style={{ fontWeight: '600' }}>{lot.symbol}</td>
                                <td>{lot.quantity}</td>
                                <td>{formatCurrency(lot.openPrice)}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', padding: '1rem 0' }}>
                      No open stock lots in selected symbols.
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button 
                className="btn btn-secondary" 
                onClick={() => setIsAssignModalOpen(false)}
              >
                Cancel
              </button>
              <button 
                className="btn btn-primary" 
                disabled={!assignModalSelectedOptionId || !assignModalSelectedStockId}
                onClick={handleConfirmAssignment}
                style={{
                  opacity: (assignModalSelectedOptionId && assignModalSelectedStockId) ? 1 : 0.5,
                  cursor: (assignModalSelectedOptionId && assignModalSelectedStockId) ? 'pointer' : 'not-allowed',
                  background: 'var(--color-primary)'
                }}
              >
                Link Option Assignment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
