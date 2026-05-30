import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { generateRealizedReport } from '../utils/tradeMatcher';
import { FileDown, Calendar, AlertTriangle, Info, ChevronDown, ChevronUp, Plus, Trash2, Edit, Check, X } from 'lucide-react';

export default function Reports() {
  const { trades, transactions, updateTransactions, appSettings, updateAppSettings } = useApp();

  // Preset Date range selection
  const [rangePreset, setRangePreset] = useState('YTD'); // 'YTD' | 'MONTH' | 'PREV_YEAR' | 'CUSTOM'
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [symbolFilter, setSymbolFilter] = useState('');

  // Sections collapse states (collapsed by default)
  const [gainsCollapsed, setGainsCollapsed] = useState(true);
  const [bCollapsed, setBCollapsed] = useState(true);
  const [noncoveredCollapsed, setNoncoveredCollapsed] = useState(true);
  const [intCollapsed, setIntCollapsed] = useState(true);
  const [divCollapsed, setDivCollapsed] = useState(true);
  const [miscCollapsed, setMiscCollapsed] = useState(true);

  // Dividend tax details editing state
  const [editingTxnId, setEditingTxnId] = useState(null);
  const [editForm, setEditForm] = useState({
    ordinary: '',
    qualified: '',
    roc: ''
  });

  // Accordion state for 1099-B detailed trade reconciliation
  const [expandedTradeId, setExpandedTradeId] = useState(null);
  const [expandedChildTradeId, setExpandedChildTradeId] = useState(null);
  
  const [expandedNoncoveredTradeId, setExpandedNoncoveredTradeId] = useState(null);
  const [expandedNoncoveredChildTradeId, setExpandedNoncoveredChildTradeId] = useState(null);

  const [editingNoncovered, setEditingNoncovered] = useState(false);
  const [newTickerInput, setNewTickerInput] = useState('');
  const [hoveredWashSaleTxnId, setHoveredWashSaleTxnId] = useState(null);
  const [editingWashSaleTradeId, setEditingWashSaleTradeId] = useState(null);
  const [editWashSaleValue, setEditWashSaleValue] = useState('');

  // Table sorting states
  const [gainsSort, setGainsSort] = useState({ key: 'realizedPnL', direction: 'desc' }); // Default: Realized PnL descending
  const [intSort, setIntSort] = useState({ key: 'date', direction: 'desc' }); // Default: Date descending
  const [divSort, setDivSort] = useState({ key: 'date', direction: 'desc' }); // Default: Date descending
  const [miscSort, setMiscSort] = useState({ key: 'date', direction: 'desc' }); // Default: Date descending
  const [bSort, setBSort] = useState({ key: 'closeDate', direction: 'desc' }); // Default: Close Date descending
  const [noncoveredSort, setNoncoveredSort] = useState({ key: 'closeDate', direction: 'desc' }); // Default: Close Date descending

  // Generic data sorter
  const sortData = (data, sortConfig) => {
    if (!sortConfig || !Array.isArray(data)) return data;
    const { key, direction } = sortConfig;

    return [...data].sort((a, b) => {
      let valA = a[key];
      let valB = b[key];

      // Custom fallbacks for 1099-DIV
      if (key === 'ordinaryDividend' && valA === undefined) valA = a.amount;
      if (key === 'ordinaryDividend' && valB === undefined) valB = b.amount;
      if (key === 'qualifiedDividend' && valA === undefined) valA = 0;
      if (key === 'qualifiedDividend' && valB === undefined) valB = 0;
      if (key === 'returnOfCapital' && valA === undefined) valA = 0;
      if (key === 'returnOfCapital' && valB === undefined) valB = 0;

      if (valA === undefined || valA === null) valA = '';
      if (valB === undefined || valB === null) valB = '';

      let comparison = 0;
      if (typeof valA === 'number' && typeof valB === 'number') {
        comparison = valA - valB;
      } else {
        comparison = String(valA).localeCompare(String(valB), undefined, { numeric: true, sensitivity: 'base' });
      }
      return direction === 'asc' ? comparison : -comparison;
    });
  };

  const renderSortableHeader = (label, key, activeSort, setSort, align = 'left') => {
    const isSorted = activeSort?.key === key;
    const direction = activeSort?.direction;
    
    const handleSortClick = () => {
      if (isSorted) {
        setSort({ key, direction: direction === 'asc' ? 'desc' : 'asc' });
      } else {
        setSort({ key, direction: 'asc' });
      }
    };

    return (
      <th 
        className="sortable" 
        style={{ cursor: 'pointer', textAlign: align, userSelect: 'none' }}
        onClick={handleSortClick}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', justifyContent: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start' }}>
          <span>{label}</span>
          <span style={{ display: 'inline-flex', opacity: isSorted ? 1 : 0.2 }}>
            {isSorted ? (
              direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
            ) : (
              <ChevronDown size={14} />
            )}
          </span>
        </div>
      </th>
    );
  };

  // 1. Calculate Date Filters based on selection
  const dateRange = useMemo(() => {
    const now = new Date();
    let start = '';
    let end = '';

    if (rangePreset === 'YTD') {
      start = `${now.getFullYear()}-01-01`;
      end = now.toISOString().split('T')[0];
    } else if (rangePreset === 'MONTH') {
      const month = String(now.getMonth() + 1).padStart(2, '0');
      start = `${now.getFullYear()}-${month}-01`;
      end = now.toISOString().split('T')[0];
    } else if (rangePreset === 'PREV_YEAR') {
      const prevYear = now.getFullYear() - 1;
      start = `${prevYear}-01-01`;
      end = `${prevYear}-12-31`;
    } else if (rangePreset === 'CUSTOM') {
      start = customStart;
      end = customEnd;
    }

    return { start, end };
  }, [rangePreset, customStart, customEnd]);

  // 2. Compute Report metrics
  const reportData = useMemo(() => {
    const report = generateRealizedReport(trades, dateRange.start, dateRange.end);
    
    // Apply symbol filter on aggregated output
    let aggregatedRows = Object.values(report.summary.bySymbol);
    let filteredTrades = report.trades || [];
    if (symbolFilter.trim()) {
      const filter = symbolFilter.trim().toUpperCase();
      aggregatedRows = aggregatedRows.filter(r => r.symbol.includes(filter));
      filteredTrades = filteredTrades.filter(t => t.symbol.includes(filter));
    }

    return {
      summary: report.summary,
      rows: aggregatedRows,
      trades: filteredTrades
    };
  }, [trades, dateRange, symbolFilter]);

  // 3. Compute Credit Interest transactions (1099-INT)
  const creditInterestTxns = useMemo(() => {
    if (!Array.isArray(transactions)) return [];

    return transactions.filter(t => {
      if (t.voided) return false;
      if (t.type !== 'INTEREST') return false;

      // We want Credit Interest (positive amount)
      const isCredit = t.amount > 0 || (t.activityType && /credit|income/i.test(t.activityType));
      if (t.amount <= 0 || !isCredit) return false;

      // Date filter
      if (dateRange.start && t.date < dateRange.start) return false;
      if (dateRange.end && t.date > dateRange.end) return false;

      return true;
    }).sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [transactions, dateRange]);

  const totalCreditInterest = useMemo(() => {
    return creditInterestTxns.reduce((sum, t) => sum + (t.amount || 0), 0);
  }, [creditInterestTxns]);

  // 4. Compute Dividend transactions (1099-DIV)
  const dividendTxns = useMemo(() => {
    if (!Array.isArray(transactions)) return [];

    return transactions.filter(t => {
      if (t.voided) return false;
      
      // Exclude "Payment in Lieu" transactions
      const isLieu = t.activityType && /lieu/i.test(t.activityType);
      if (isLieu) return false;
      
      const isDiv = t.type === 'DIVIDEND' || (t.activityType && /dividend/i.test(t.activityType));
      if (!isDiv) return false;

      // Date filter
      if (dateRange.start && t.date < dateRange.start) return false;
      if (dateRange.end && t.date > dateRange.end) return false;

      return true;
    }).sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [transactions, dateRange]);

  // Compute breakdown totals for 1099-DIV
  const dividendTotals = useMemo(() => {
    let ordinary = 0;
    let qualified = 0;
    let roc = 0;

    dividendTxns.forEach(t => {
      ordinary += t.ordinaryDividend !== undefined ? t.ordinaryDividend : (t.amount || 0);
      qualified += t.qualifiedDividend || 0;
      roc += t.returnOfCapital || 0;
    });

    return { ordinary, qualified, roc };
  }, [dividendTxns]);

  // 5. Compute Substitute Payments in Lieu (1099-MISC)
  const lieuTxns = useMemo(() => {
    if (!Array.isArray(transactions)) return [];

    return transactions.filter(t => {
      if (t.voided) return false;

      // We want Payment in Lieu
      const isLieu = t.activityType && /lieu/i.test(t.activityType);
      if (!isLieu) return false;

      // Date filter
      if (dateRange.start && t.date < dateRange.start) return false;
      if (dateRange.end && t.date > dateRange.end) return false;

      return true;
    }).sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [transactions, dateRange]);

  const totalLieu = useMemo(() => {
    return lieuTxns.reduce((sum, t) => sum + (t.amount || 0), 0);
  }, [lieuTxns]);

  // Sorted views for UI tables
  const sortedGainsRows = useMemo(() => {
    return sortData(reportData.rows, gainsSort);
  }, [reportData.rows, gainsSort]);

  const sortedIntTxns = useMemo(() => {
    return sortData(creditInterestTxns, intSort);
  }, [creditInterestTxns, intSort]);

  const sortedDivTxns = useMemo(() => {
    return sortData(dividendTxns, divSort);
  }, [dividendTxns, divSort]);

  const sortedMiscTxns = useMemo(() => {
    return sortData(lieuTxns, miscSort);
  }, [lieuTxns, miscSort]);

  const aggregatedBRows = useMemo(() => {
    if (!Array.isArray(reportData.trades)) return [];
    
    // Group by symbol and date sold (closeDate)
    const groups = {};
    reportData.trades.forEach(t => {
      const sym = t.symbol;
      const closeDate = t.closeDate || 'VARIOUS';
      const groupKey = `${sym}_${closeDate}`;
      if (!groups[groupKey]) {
        groups[groupKey] = {
          id: groupKey,
          symbol: sym,
          closeDate: closeDate,
          quantity: 0,
          costBasis: 0,
          proceeds: 0,
          realizedPnL: 0,
          washSaleAmount: 0,
          types: new Set(),
          openDates: new Set(),
          trades: []
        };
      }
      groups[groupKey].quantity += t.quantity || 0;
      groups[groupKey].costBasis += t.costBasis || 0;
      groups[groupKey].proceeds += t.proceeds || 0;
      groups[groupKey].realizedPnL += t.realizedPnL || 0;
      groups[groupKey].washSaleAmount += t.washSaleAmount || 0;
      groups[groupKey].types.add(t.type);
      if (t.openDate) {
        groups[groupKey].openDates.add(t.openDate);
      }
      groups[groupKey].trades.push(t);
    });

    return Object.values(groups).map(g => {
      const typesArray = Array.from(g.types);
      const openDatesArray = Array.from(g.openDates);
      const openDate = openDatesArray.length === 1 ? openDatesArray[0] : 'VARIOUS';
      
      return {
        ...g,
        type: typesArray.length > 0 ? typesArray.join(', ') : 'LONG',
        openDate,
        closeDate: g.closeDate
      };
    });
  }, [reportData.trades]);

  const noncoveredTickersSet = useMemo(() => {
    const list = appSettings?.noncoveredTickers || [];
    return new Set(list.map(t => t.toUpperCase().trim()));
  }, [appSettings?.noncoveredTickers]);

  const coveredBRows = useMemo(() => {
    const arr = aggregatedBRows.filter(row => !noncoveredTickersSet.has(row.symbol.toUpperCase().trim()));
    return sortData(arr, bSort);
  }, [aggregatedBRows, noncoveredTickersSet, bSort]);

  const noncoveredBRows = useMemo(() => {
    const arr = aggregatedBRows.filter(row => noncoveredTickersSet.has(row.symbol.toUpperCase().trim()));
    return sortData(arr, noncoveredSort);
  }, [aggregatedBRows, noncoveredTickersSet, noncoveredSort]);

  const coveredTotals = useMemo(() => {
    let proceeds = 0;
    let cost = 0;
    let pnl = 0;
    let washSale = 0;
    coveredBRows.forEach(pos => {
      proceeds += pos.proceeds || 0;
      cost += pos.costBasis || 0;
      pnl += pos.realizedPnL || 0;
      washSale += pos.washSaleAmount || 0;
    });
    return { proceeds, cost, pnl, washSale };
  }, [coveredBRows]);

  const noncoveredTotals = useMemo(() => {
    let proceeds = 0;
    let cost = 0;
    let pnl = 0;
    let washSale = 0;
    noncoveredBRows.forEach(pos => {
      proceeds += pos.proceeds || 0;
      cost += pos.costBasis || 0;
      pnl += pos.realizedPnL || 0;
      washSale += pos.washSaleAmount || 0;
    });
    return { proceeds, cost, pnl, washSale };
  }, [noncoveredBRows]);

  const bTotals = useMemo(() => {
    let proceeds = 0;
    let cost = 0;
    let pnl = 0;
    if (Array.isArray(reportData.trades)) {
      reportData.trades.forEach(t => {
        proceeds += t.proceeds || 0;
        cost += t.costBasis || 0;
        pnl += t.realizedPnL || 0;
      });
    }
    return { proceeds, cost, pnl };
  }, [reportData.trades]);

  // Inline edit handlers for dividend split
  const handleStartEdit = (txn) => {
    setEditingTxnId(txn.id);
    setEditForm({
      ordinary: txn.ordinaryDividend !== undefined ? String(txn.ordinaryDividend) : String(txn.amount),
      qualified: txn.qualifiedDividend !== undefined ? String(txn.qualifiedDividend) : '0',
      roc: txn.returnOfCapital !== undefined ? String(txn.returnOfCapital) : '0'
    });
  };

  const handleSaveEdit = async (txnId) => {
    const ordinaryVal = parseFloat(editForm.ordinary) || 0;
    const qualifiedVal = parseFloat(editForm.qualified) || 0;
    const rocVal = parseFloat(editForm.roc) || 0;

    const updated = transactions.map(t => {
      if (t.id === txnId) {
        return {
          ...t,
          ordinaryDividend: ordinaryVal,
          qualifiedDividend: qualifiedVal,
          returnOfCapital: rocVal
        };
      }
      return t;
    });

    await updateTransactions(updated);
    setEditingTxnId(null);
  };

  const handleToggleWashSale = async (closeTxnId, openTxnId) => {
    const updated = transactions.map(t => {
      if (t.id === closeTxnId) {
        const washSalesMap = { ...(t.washSalesMap || {}) };
        const current = washSalesMap[openTxnId] || { washSale: false, washSaleAmount: null };
        const nextWashSale = !current.washSale;
        
        washSalesMap[openTxnId] = {
          washSale: nextWashSale,
          washSaleAmount: nextWashSale ? current.washSaleAmount : null
        };

        const anyWashSale = Object.values(washSalesMap).some(v => v.washSale);

        return {
          ...t,
          washSale: anyWashSale,
          washSalesMap
        };
      }
      return t;
    });
    await updateTransactions(updated);
  };

  const handleSaveWashSaleAmount = async (closeTxnId, openTxnId, amountStr) => {
    const val = parseFloat(amountStr);
    const updated = transactions.map(t => {
      if (t.id === closeTxnId) {
        const washSalesMap = { ...(t.washSalesMap || {}) };
        const hasAmount = !isNaN(val) && val > 0;
        
        washSalesMap[openTxnId] = {
          washSale: hasAmount ? true : (washSalesMap[openTxnId]?.washSale ?? true),
          washSaleAmount: hasAmount ? val : null
        };

        const anyWashSale = Object.values(washSalesMap).some(v => v.washSale);

        return {
          ...t,
          washSale: anyWashSale,
          washSalesMap
        };
      }
      return t;
    });
    await updateTransactions(updated);
  };

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(val);
  };

  const renderTradeReconciliationDetails = (trade) => {
    // Find transactions
    const openTxn = transactions.find(t => t.id === trade.openTxnId);
    const closeTxn = transactions.find(t => t.id === trade.closeTxnId);
    
    // Split linked options
    const optionTxns = transactions.filter(t => 
      trade.linkedOptionTxnId && String(trade.linkedOptionTxnId).split(',').filter(Boolean).includes(t.id)
    );

    // Core maths
    const baseCost = trade.quantity * (openTxn?.price || trade.openPrice);
    const openQty = openTxn?.quantity || trade.quantity;
    const propOpenFeesVal = openTxn ? (trade.quantity / openQty) * (openTxn.commission || 0) : 0;
    const propOpenFees = -propOpenFeesVal; // negative commission is a fee (positive charge), positive is a rebate (negative charge)
    
    const baseProceeds = trade.quantity * (closeTxn?.price || trade.closePrice);
    const closeQty = closeTxn?.quantity || trade.quantity;
    const propCloseFeesVal = closeTxn ? (trade.quantity / closeQty) * (closeTxn.commission || 0) : 0;
    const propCloseFees = -propCloseFeesVal; // negative commission is a fee (positive charge), positive is a rebate (negative charge)

    // Helper to determine if an option symbol is a Call (C)
    const isCall = (optSymbol) => {
      const cleanSym = String(optSymbol).toUpperCase().replace(/\s+/g, '');
      const match = cleanSym.match(/\d{6}([CP])\d{8}$/);
      if (match) return match[1] === 'C';
      return false;
    };

    // Split open (put) options and close (call) options
    const openOptionTxns = optionTxns.filter(opt => !isCall(opt.symbol));
    const closeOptionTxns = optionTxns.filter(opt => isCall(opt.symbol));

    // Put Option Reduction (Acquisition/Cost Basis)
    let totalOptionReduction = 0;
    const openOptionDetails = openOptionTxns.map(opt => {
      const optProceeds = opt.type === 'SELL'
        ? (opt.quantity * 100 * opt.price - (opt.commission || 0))
        : -(opt.quantity * 100 * opt.price + (opt.commission || 0));

      const proportionalOptProceeds = (trade.quantity / openQty) * optProceeds;
      totalOptionReduction += proportionalOptProceeds;

      return {
        symbol: opt.symbol.split(' ')[0],
        amount: proportionalOptProceeds
      };
    });

    // Call Option Addition (Disposition/Proceeds)
    let totalOptionAddition = 0;
    const closeOptionDetails = closeOptionTxns.map(opt => {
      const optProceeds = opt.type === 'SELL'
        ? (opt.quantity * 100 * opt.price - (opt.commission || 0))
        : -(opt.quantity * 100 * opt.price + (opt.commission || 0));

      const proportionalOptProceeds = closeQty > 0 ? (trade.quantity / closeQty) * optProceeds : optProceeds;
      totalOptionAddition += proportionalOptProceeds;

      return {
        symbol: opt.symbol.split(' ')[0],
        amount: proportionalOptProceeds
      };
    });

    const isWashSaleDeclared = (trade.washSaleAmount || 0) > 0;
    const isLoss = trade.realizedPnL < 0;
    const canDeclareWashSale = isLoss || isWashSaleDeclared;

    return (
      <div 
        className="glass-panel"
        style={{
          padding: '1.25rem',
          boxShadow: 'inset 0 1px 0 0 rgba(255, 255, 255, 0.05)',
          background: 'rgba(30, 41, 59, 0.25)',
          borderRadius: '8px',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          fontSize: '0.8rem',
          color: 'var(--text-secondary)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          maxWidth: '680px',
          margin: '0.25rem auto'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '0.5rem' }}>
          <span style={{ fontWeight: '700', fontSize: '0.9rem', color: 'var(--text-primary)' }}>Trade Reconciliation Details</span>
          <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>{trade.symbol}</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          {/* Cost Basis Calculation */}
          <div>
            <div style={{ fontWeight: '600', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>1. Acquisition (Cost Basis)</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', paddingLeft: '0.5rem' }}>
              <span>Base Cost ({trade.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })} &times; ${ Number(openTxn?.price ?? trade.openPrice ?? 0).toFixed(2) })</span>
              {propOpenFees > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Proportional Buy Fees</span>
                  <span style={{ color: 'var(--color-danger)' }}>+{formatCurrency(propOpenFees)}</span>
                </div>
              )}
              {propOpenFees < 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-success)' }}>
                  <span>Buy Rebate</span>
                  <span>-{formatCurrency(Math.abs(propOpenFees))}</span>
                </div>
              )}
              {openOptionDetails.length > 0 && openOptionDetails.map((opt, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-success)' }}>
                  <span>Option Rollover ({opt.symbol})</span>
                  <span>-{formatCurrency(opt.amount)}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.25rem', marginTop: '0.25rem', fontWeight: '600' }}>
                <span style={{ color: 'var(--text-primary)' }}>Total Cost Basis</span>
                <span style={{ color: 'var(--text-primary)' }}>{formatCurrency(trade.costBasis)}</span>
              </div>
            </div>
          </div>

          {/* Proceeds Calculation */}
          <div>
            <div style={{ fontWeight: '600', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>2. Disposition (Proceeds)</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', paddingLeft: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Base Proceeds ({trade.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })} &times; ${ Number(closeTxn?.price ?? trade.closePrice ?? 0).toFixed(2) })</span>
                <span style={{ color: 'var(--text-primary)' }}>{formatCurrency(baseProceeds)}</span>
              </div>
              {propCloseFees > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Proportional Sell Fees</span>
                  <span style={{ color: 'var(--color-danger)' }}>-{formatCurrency(propCloseFees)}</span>
                </div>
              )}
              {propCloseFees < 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-success)' }}>
                  <span>Sell Rebate</span>
                  <span>+{formatCurrency(Math.abs(propCloseFees))}</span>
                </div>
              )}
              {closeOptionDetails.length > 0 && closeOptionDetails.map((opt, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-success)' }}>
                  <span>Option Premium ({opt.symbol})</span>
                  <span>+{formatCurrency(opt.amount)}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.25rem', marginTop: '0.25rem', fontWeight: '600' }}>
                <span style={{ color: 'var(--text-primary)' }}>Total Net Proceeds</span>
                <span style={{ color: 'var(--text-primary)' }}>{formatCurrency(trade.proceeds)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Net Return Formula & Wash Sale Action */}
        <div 
          style={{ 
            background: 'rgba(255,255,255,0.015)', 
            padding: '0.75rem 1rem', 
            borderRadius: '6px', 
            border: '1px solid rgba(255,255,255,0.04)', 
            marginTop: '0.25rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem'
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '700', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-primary)' }}>Realized Return</span>
              <span className={isWashSaleDeclared ? 'gain-text' : (trade.realizedPnL >= 0 ? 'gain-text' : 'loss-text')}>
                {isWashSaleDeclared ? '$0.00 (Wash Sale Disallowed)' : (trade.realizedPnL >= 0 ? '+' : '') + formatCurrency(trade.realizedPnL)}
              </span>
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem', fontStyle: 'italic' }}>
              {isWashSaleDeclared ? (
                `Proceeds (${formatCurrency(trade.proceeds)}) − Cost (${formatCurrency(trade.costBasis)}) = Net PnL $0.00 (${formatCurrency(-trade.washSaleAmount)} loss disallowed as Wash Sale)`
              ) : (
                `Proceeds (${formatCurrency(trade.proceeds)}) − Cost (${formatCurrency(trade.costBasis)}) = Net realized PnL (${formatCurrency(trade.realizedPnL)})`
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            {isWashSaleDeclared && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Wash Sale Amount:</span>
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <span style={{ position: 'absolute', left: '0.4rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '0.75rem' }}>$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder={(trade.washSaleAmount || 0).toFixed(2)}
                    value={editingWashSaleTradeId === trade.id ? editWashSaleValue : (trade.washSaleAmount ? trade.washSaleAmount.toFixed(2) : '')}
                    onChange={(e) => setEditWashSaleValue(e.target.value)}
                    onFocus={() => {
                      setEditingWashSaleTradeId(trade.id);
                      setEditWashSaleValue(trade.washSaleAmount ? trade.washSaleAmount.toString() : '');
                    }}
                    onBlur={async () => {
                      await handleSaveWashSaleAmount(trade.closeTxnId, trade.openTxnId, editWashSaleValue);
                      setEditingWashSaleTradeId(null);
                    }}
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter') {
                        await handleSaveWashSaleAmount(trade.closeTxnId, trade.openTxnId, editWashSaleValue);
                        setEditingWashSaleTradeId(null);
                      } else if (e.key === 'Escape') {
                        setEditingWashSaleTradeId(null);
                      }
                    }}
                    style={{
                      width: '80px',
                      padding: '0.25rem 0.4rem 0.25rem 1rem',
                      fontSize: '0.75rem',
                      borderRadius: '4px',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      background: 'rgba(15, 23, 42, 0.6)',
                      color: 'var(--text-primary)',
                      outline: 'none',
                      textAlign: 'right',
                      boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.5)'
                    }}
                  />
                </div>
              </div>
            )}

            {canDeclareWashSale && (() => {
              const isHovered = hoveredWashSaleTxnId === trade.closeTxnId;
              return (
                <button
                  className={isWashSaleDeclared ? (isHovered ? 'btn btn-danger' : 'btn btn-secondary') : 'btn btn-danger'}
                  style={{ 
                    padding: '0.35rem 0.75rem', 
                    fontSize: '0.75rem', 
                    borderRadius: '4px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '0.35rem', 
                    fontWeight: '600',
                    border: isWashSaleDeclared ? (isHovered ? '1px solid rgba(244, 63, 94, 0.3)' : '1px solid rgba(16, 185, 129, 0.3)') : '1px solid transparent',
                    background: isWashSaleDeclared ? (isHovered ? 'rgba(244, 63, 94, 0.15)' : 'rgba(16, 185, 129, 0.08)') : undefined,
                    color: isWashSaleDeclared ? (isHovered ? 'var(--color-danger)' : 'var(--color-success)') : undefined,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={() => setHoveredWashSaleTxnId(trade.closeTxnId)}
                  onMouseLeave={() => setHoveredWashSaleTxnId(null)}
                  onClick={async (e) => {
                    e.stopPropagation();
                    await handleToggleWashSale(trade.closeTxnId, trade.openTxnId);
                  }}
                >
                  {isWashSaleDeclared ? (
                    isHovered ? <X size={12} /> : <Check size={12} style={{ color: 'var(--color-success)' }} />
                  ) : (
                    <AlertTriangle size={12} />
                  )}
                  {isWashSaleDeclared ? (isHovered ? 'Undeclare Wash Sale' : 'Wash Sale Declared') : 'Declare Wash Sale'}
                </button>
              );
            })()}
          </div>
        </div>
      </div>
    );
  };

  const handleExportCSV = () => {
    if (reportData.rows.length === 0 && reportData.trades.length === 0 && creditInterestTxns.length === 0 && dividendTxns.length === 0 && lieuTxns.length === 0) {
      alert('No data to export.');
      return;
    }

    const headers = ['Symbol', 'Trade Count', 'Volume', 'Total Cost Basis', 'Total Proceeds', 'Realized Gain/Loss'];
    const rows = reportData.rows.map(r => [
      r.symbol,
      r.tradeCount,
      r.volume.toFixed(4),
      r.costBasis.toFixed(2),
      r.proceeds.toFixed(2),
      r.realizedPnL.toFixed(2)
    ]);

    const csvContent = [
      `TradeR Realized Gain/Loss, Interest, Dividends & Substitute Payments Report (${dateRange.start || 'Beginning'} to ${dateRange.end || 'Present'})`,
      `Generated on ${new Date().toLocaleDateString()}`,
      `Total Net realized PnL, ${reportData.summary.totalPnL.toFixed(2)}`,
      `Short Term PnL, ${reportData.summary.shortTermPnL.toFixed(2)}`,
      `Long Term PnL, ${reportData.summary.longTermPnL.toFixed(2)}`,
      `Total 1099-B Proceeds, ${bTotals.proceeds.toFixed(2)}`,
      `Total 1099-B Cost Basis, ${bTotals.cost.toFixed(2)}`,
      `Total 1099-B Net Gain/Loss, ${bTotals.pnl.toFixed(2)}`,
      `Total 1099-INT Credit Interest, ${totalCreditInterest.toFixed(2)}`,
      `Total 1099-DIV Ordinary Dividends, ${dividendTotals.ordinary.toFixed(2)}`,
      `Total 1099-DIV Qualified Dividends, ${dividendTotals.qualified.toFixed(2)}`,
      `Total 1099-DIV Return of Capital, ${dividendTotals.roc.toFixed(2)}`,
      `Total 1099-MISC Substitute Payments, ${totalLieu.toFixed(2)}`,
      '',
      '--- CAPITAL GAINS BREAKDOWN ---',
      headers.join(','),
      ...rows.map(row => row.join(',')),
      '',
      '--- 1099-B REALIZED SECURITY TRANSACTION DETAILS ---',
      ['Date Acquired', 'Date Sold', 'Symbol', 'Quantity', 'Cost Basis', 'Proceeds', 'Realized Gain/Loss'].join(','),
      ...aggregatedBRows.map(t => [
        t.openDate,
        t.closeDate,
        `"${(t.symbol || '').replace(/"/g, '""')}"`,
        t.quantity.toFixed(4),
        t.costBasis.toFixed(2),
        t.proceeds.toFixed(2),
        t.realizedPnL.toFixed(2)
      ].join(',')),
      '',
      '--- 1099-INT INTEREST INCOME DETAILS ---',
      ['Date', 'Type', 'Description', 'Amount'].join(','),
      ...creditInterestTxns.map(t => [
        t.date,
        t.activityType || 'Credit Interest',
        `"${(t.description || '').replace(/"/g, '""')}"`,
        t.amount.toFixed(2)
      ].join(',')),
      '',
      '--- 1099-DIV DIVIDEND INCOME DETAILS ---',
      ['Date', 'Symbol', 'Type', 'Description', 'Ordinary', 'Qualified', 'Return of Capital', 'Original Total'].join(','),
      ...dividendTxns.map(t => [
        t.date,
        t.symbol || '-',
        t.activityType || 'Dividend',
        `"${(t.description || '').replace(/"/g, '""')}"`,
        (t.ordinaryDividend !== undefined ? t.ordinaryDividend : t.amount).toFixed(2),
        (t.qualifiedDividend || 0).toFixed(2),
        (t.returnOfCapital || 0).toFixed(2),
        t.amount.toFixed(2)
      ].join(',')),
      '',
      '--- 1099-MISC SUBSTITUTE PAYMENTS IN LIEU DETAILS ---',
      ['Date', 'Symbol', 'Type', 'Description', 'Amount'].join(','),
      ...lieuTxns.map(t => [
        t.date,
        t.symbol || '-',
        t.activityType || 'Payment in Lieu',
        `"${(t.description || '').replace(/"/g, '""')}"`,
        t.amount.toFixed(2)
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `trader-gains-interest-dividends-misc-report-${rangePreset}-${dateRange.start}-to-${dateRange.end}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleAddTicker = () => {
    const val = newTickerInput.trim().toUpperCase();
    if (!val) return;
    const list = appSettings?.noncoveredTickers || [];
    if (list.includes(val)) {
      alert(`${val} is already a noncovered ticker.`);
      return;
    }
    const updated = [...list, val];
    updateAppSettings({ noncoveredTickers: updated });
    setNewTickerInput('');
  };

  const handleRemoveTicker = (ticker) => {
    const list = appSettings?.noncoveredTickers || [];
    const updated = list.filter(t => t !== ticker);
    updateAppSettings({ noncoveredTickers: updated });
  };

  const handleExportCoveredCSV = (e) => {
    if (e) e.stopPropagation();
    if (coveredBRows.length === 0) {
      alert('No covered 1099-B data to export.');
      return;
    }

    const headers = ['Ticker Symbol', 'Quantity', 'Date Acquired', 'Date Sold', 'Cost Basis', 'Proceeds', 'Realized Gain/Loss', 'Wash Sale'];
    const rows = coveredBRows.map(t => [
      `"${(t.symbol || '').replace(/"/g, '""')}"`,
      t.quantity.toFixed(4),
      t.openDate,
      t.closeDate,
      t.costBasis.toFixed(2),
      t.proceeds.toFixed(2),
      t.realizedPnL.toFixed(2),
      (t.washSaleAmount || 0).toFixed(2)
    ]);

    const csvContent = [
      `TradeR 1099-B Covered Securities S/T (${dateRange.start || 'Beginning'} to ${dateRange.end || 'Present'})`,
      `Generated on ${new Date().toLocaleDateString()}`,
      `Total Covered Proceeds, ${coveredTotals.proceeds.toFixed(2)}`,
      `Total Covered Cost Basis, ${coveredTotals.cost.toFixed(2)}`,
      `Total Covered Net Gain/Loss, ${coveredTotals.pnl.toFixed(2)}`,
      `Total Covered Wash Sale, ${coveredTotals.washSale.toFixed(2)}`,
      '',
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `trader-1099B-covered-report-${rangePreset}-${dateRange.start || 'all'}-to-${dateRange.end || 'all'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportNoncoveredCSV = (e) => {
    if (e) e.stopPropagation();
    if (noncoveredBRows.length === 0) {
      alert('No noncovered 1099-B data to export.');
      return;
    }

    const headers = ['Ticker Symbol', 'Quantity', 'Date Acquired', 'Date Sold', 'Cost Basis', 'Proceeds', 'Realized Gain/Loss', 'Wash Sale'];
    const rows = noncoveredBRows.map(t => [
      `"${(t.symbol || '').replace(/"/g, '""')}"`,
      t.quantity.toFixed(4),
      t.openDate,
      t.closeDate,
      t.costBasis.toFixed(2),
      t.proceeds.toFixed(2),
      t.realizedPnL.toFixed(2),
      (t.washSaleAmount || 0).toFixed(2)
    ]);

    const csvContent = [
      `TradeR 1099-B Noncovered Securities S/T (${dateRange.start || 'Beginning'} to ${dateRange.end || 'Present'})`,
      `Generated on ${new Date().toLocaleDateString()}`,
      `Total Noncovered Proceeds, ${noncoveredTotals.proceeds.toFixed(2)}`,
      `Total Noncovered Cost Basis, ${noncoveredTotals.cost.toFixed(2)}`,
      `Total Noncovered Net Gain/Loss, ${noncoveredTotals.pnl.toFixed(2)}`,
      `Total Noncovered Wash Sale, ${noncoveredTotals.washSale.toFixed(2)}`,
      '',
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `trader-1099B-noncovered-report-${rangePreset}-${dateRange.start || 'all'}-to-${dateRange.end || 'all'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };


  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="glow-text" style={{ fontSize: '2.25rem', marginBottom: '0.5rem' }}>Capital Gains Reports</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Analyze capital distributions, tax implications, and realized trade efficiencies.</p>
        </div>
        <button 
          className="btn btn-secondary"
          onClick={handleExportCSV}
          disabled={reportData.rows.length === 0 && reportData.trades.length === 0 && creditInterestTxns.length === 0 && dividendTxns.length === 0 && lieuTxns.length === 0}
        >
          <FileDown size={16} />
          Export Report
        </button>
      </div>

      {/* Date Pickers Preset Bar */}
      <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', flexWrap: 'wrap', gap: '1.5rem', alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: '500' }}>Date Preset:</span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button 
              className={`btn ${rangePreset === 'YTD' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '0.4rem 0.85rem', borderRadius: '4px' }}
              onClick={() => setRangePreset('YTD')}
            >
              Year to Date (YTD)
            </button>
            <button 
              className={`btn ${rangePreset === 'MONTH' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '0.4rem 0.85rem', borderRadius: '4px' }}
              onClick={() => setRangePreset('MONTH')}
            >
              This Month
            </button>
            <button 
              className={`btn ${rangePreset === 'PREV_YEAR' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '0.4rem 0.85rem', borderRadius: '4px' }}
              onClick={() => setRangePreset('PREV_YEAR')}
            >
              Previous Year
            </button>
            <button 
              className={`btn ${rangePreset === 'CUSTOM' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '0.4rem 0.85rem', borderRadius: '4px' }}
              onClick={() => setRangePreset('CUSTOM')}
            >
              Custom Range
            </button>
          </div>
        </div>

        {rangePreset === 'CUSTOM' && (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.75rem' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontSize: '0.75rem' }}>Start Date</label>
              <input 
                type="date" 
                className="form-input" 
                style={{ padding: '0.4rem 0.75rem' }} 
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
              />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontSize: '0.75rem' }}>End Date</label>
              <input 
                type="date" 
                className="form-input" 
                style={{ padding: '0.4rem 0.75rem' }}
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
              />
            </div>
          </div>
        )}

        <div className="form-group" style={{ margin: 0, marginLeft: 'auto', minWidth: '150px' }}>
          <label className="form-label" style={{ fontSize: '0.75rem' }}>Filter Symbol</label>
          <input 
            type="text" 
            placeholder="e.g. BTC" 
            className="form-input"
            style={{ padding: '0.4rem 0.75rem' }}
            value={symbolFilter}
            onChange={(e) => setSymbolFilter(e.target.value)}
          />
        </div>
      </div>

      {/* Report Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1.5rem' }}>
        {/* Net realized gain/loss */}
        <div className="glass-panel" style={{ padding: '1.25rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Net Realized Return</span>
          <h2 className={reportData.summary.totalPnL >= 0 ? 'gain-text' : 'loss-text'} style={{ fontSize: '1.8rem', marginTop: '0.25rem' }}>
            {reportData.summary.totalPnL >= 0 ? '+' : ''}{formatCurrency(reportData.summary.totalPnL)}
          </h2>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            <span>Cost: {formatCurrency(reportData.summary.totalCostBasis)}</span>
            <span>Proceeds: {formatCurrency(reportData.summary.totalProceeds)}</span>
          </div>
        </div>

        {/* Short Term */}
        <div className="glass-panel" style={{ padding: '1.25rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Short-Term Gains (&le; 1 Yr)</span>
          <h2 className={reportData.summary.shortTermPnL >= 0 ? 'gain-text' : 'loss-text'} style={{ fontSize: '1.8rem', marginTop: '0.25rem' }}>
            {reportData.summary.shortTermPnL >= 0 ? '+' : ''}{formatCurrency(reportData.summary.shortTermPnL)}
          </h2>
          <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            <Info size={10} />
            <span>Taxed as ordinary income.</span>
          </div>
        </div>

        {/* Long Term */}
        <div className="glass-panel" style={{ padding: '1.25rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Long-Term Gains (&gt; 1 Yr)</span>
          <h2 className={reportData.summary.longTermPnL >= 0 ? 'gain-text' : 'loss-text'} style={{ fontSize: '1.8rem', marginTop: '0.25rem' }}>
            {reportData.summary.longTermPnL >= 0 ? '+' : ''}{formatCurrency(reportData.summary.longTermPnL)}
          </h2>
          <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            <Info size={10} />
            <span>Taxed at lower capital gains rates.</span>
          </div>
        </div>

        {/* Credit Interest (1099-INT) */}
        <div className="glass-panel" style={{ padding: '1.25rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Interest Income (1099-INT)</span>
          <h2 className="gain-text" style={{ fontSize: '1.8rem', marginTop: '0.25rem' }}>
            +{formatCurrency(totalCreditInterest)}
          </h2>
          <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            <Info size={10} />
            <span>Reportable interest received.</span>
          </div>
        </div>

        {/* Dividend Income (1099-DIV) */}
        <div className="glass-panel" style={{ padding: '1.25rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Dividend Income (1099-DIV)</span>
          <h2 className="gain-text" style={{ fontSize: '1.8rem', marginTop: '0.25rem' }}>
            +{formatCurrency(dividendTotals.ordinary)}
          </h2>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            <span>Qualified: {formatCurrency(dividendTotals.qualified)}</span>
            <span>ROC: {formatCurrency(dividendTotals.roc)}</span>
          </div>
        </div>

        {/* Substitute Payments (1099-MISC) */}
        <div className="glass-panel" style={{ padding: '1.25rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Substitute Payments (1099-MISC)</span>
          <h2 className="gain-text" style={{ fontSize: '1.8rem', marginTop: '0.25rem' }}>
            +{formatCurrency(totalLieu)}
          </h2>
          <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            <Info size={10} />
            <span>Substitute payments in lieu of dividends.</span>
          </div>
        </div>
      </div>

      {/* Aggregated Symbols Table */}
      <div className="glass-panel" style={{ padding: '1.25rem' }}>
        <div 
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
          onClick={() => setGainsCollapsed(!gainsCollapsed)}
        >
          <h3 style={{ margin: 0 }}>Gains Breakdown by Asset Symbol</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)' }}>
            <span style={{ fontSize: '0.8rem' }}>{gainsCollapsed ? 'Expand' : 'Collapse'}</span>
            {gainsCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </div>
        </div>

        {!gainsCollapsed && (
          <div style={{ marginTop: '1rem' }}>
            {sortedGainsRows.length > 0 ? (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      {renderSortableHeader('Ticker Symbol', 'symbol', gainsSort, setGainsSort)}
                      {renderSortableHeader('Trades Matched', 'tradeCount', gainsSort, setGainsSort)}
                      {renderSortableHeader('Total Vol Traded', 'volume', gainsSort, setGainsSort)}
                      {renderSortableHeader('Accumulated Cost Basis', 'costBasis', gainsSort, setGainsSort)}
                      {renderSortableHeader('Accumulated Proceeds', 'proceeds', gainsSort, setGainsSort)}
                      {renderSortableHeader('Net Realized PnL', 'realizedPnL', gainsSort, setGainsSort)}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedGainsRows.map((row) => (
                      <tr key={row.symbol}>
                        <td style={{ fontWeight: '600' }}>{row.symbol}</td>
                        <td>{row.tradeCount}</td>
                        <td>{row.volume.toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                        <td>{formatCurrency(row.costBasis)}</td>
                        <td>{formatCurrency(row.proceeds)}</td>
                        <td className={row.realizedPnL >= 0 ? 'gain-text' : 'loss-text'} style={{ fontWeight: '600' }}>
                          {row.realizedPnL >= 0 ? '+' : ''}{formatCurrency(row.realizedPnL)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                <AlertTriangle size={24} style={{ color: 'var(--color-warning)' }} />
                <span>No trade closings recorded for this date range.</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 1099-B Covered Securities S/T */}
      <div className="glass-panel" style={{ padding: '1.25rem' }}>
        <div 
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none', flexWrap: 'wrap', gap: '1rem' }}
          onClick={() => setBCollapsed(!bCollapsed)}
        >
          <div>
            <h3 style={{ margin: 0 }}>1099-B Covered Securities S/T</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
              Covered securities transactions details (broker-reported cost basis).
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--color-success)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '0.3rem 0.6rem', borderRadius: '4px', fontWeight: '600', fontSize: '0.8rem' }}>
                Total Proceeds: {formatCurrency(coveredTotals.proceeds)}
              </span>
              <span className="badge" style={{ background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-secondary)', border: '1px solid rgba(255, 255, 255, 0.1)', padding: '0.3rem 0.6rem', borderRadius: '4px', fontWeight: '600', fontSize: '0.8rem' }}>
                Total Cost: {formatCurrency(coveredTotals.cost)}
              </span>
              <span className="badge" style={{ background: coveredTotals.pnl >= 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: coveredTotals.pnl >= 0 ? 'var(--color-success)' : 'var(--color-danger)', border: coveredTotals.pnl >= 0 ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(239, 68, 68, 0.2)', padding: '0.3rem 0.6rem', borderRadius: '4px', fontWeight: '600', fontSize: '0.8rem' }}>
                Net Gain/Loss: {coveredTotals.pnl >= 0 ? '+' : ''}{formatCurrency(coveredTotals.pnl)}
              </span>
              {coveredTotals.washSale > 0 && (
                <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.1)', color: 'var(--color-warning)', border: '1px solid rgba(245, 158, 11, 0.2)', padding: '0.3rem 0.6rem', borderRadius: '4px', fontWeight: '600', fontSize: '0.8rem' }}>
                  Total Wash Sale: {formatCurrency(coveredTotals.washSale)}
                </span>
              )}
            </div>
            <button
              className="btn btn-secondary"
              style={{ padding: '0.3rem 0.65rem', borderRadius: '4px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
              onClick={handleExportCoveredCSV}
              disabled={coveredBRows.length === 0}
            >
              <FileDown size={14} />
              Export Covered
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--text-secondary)' }}>
              <span style={{ fontSize: '0.8rem' }}>{bCollapsed ? 'Expand' : 'Collapse'}</span>
              {bCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
            </div>
          </div>
        </div>

        {!bCollapsed && (
          <div style={{ marginTop: '1rem' }}>
            {coveredBRows.length > 0 ? (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      {renderSortableHeader('Ticker Symbol', 'symbol', bSort, setBSort)}
                      {renderSortableHeader('Type', 'type', bSort, setBSort)}
                      {renderSortableHeader('Quantity', 'quantity', bSort, setBSort)}
                      {renderSortableHeader('Date Acquired', 'openDate', bSort, setBSort)}
                      {renderSortableHeader('Date Sold', 'closeDate', bSort, setBSort)}
                      {renderSortableHeader('Cost Basis', 'costBasis', bSort, setBSort, 'right')}
                      {renderSortableHeader('Proceeds', 'proceeds', bSort, setBSort, 'right')}
                      {renderSortableHeader('Realized Gain/Loss', 'realizedPnL', bSort, setBSort, 'right')}
                      {renderSortableHeader('Wash Sale', 'washSaleAmount', bSort, setBSort, 'right')}
                    </tr>
                  </thead>
                  <tbody>
                    {coveredBRows.map((pos) => {
                      const isExpanded = expandedTradeId === pos.id;
                      const sortedChildTrades = [...pos.trades].sort((a, b) => new Date(b.closeDate) - new Date(a.closeDate));

                      return (
                        <React.Fragment key={pos.id}>
                          <tr 
                            onClick={() => setExpandedTradeId(isExpanded ? null : pos.id)}
                            style={{ 
                              cursor: 'pointer', 
                              background: isExpanded ? 'rgba(255, 255, 255, 0.03)' : 'transparent',
                              transition: 'background 0.2s ease'
                            }}
                          >
                            <td style={{ fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span style={{ 
                                display: 'inline-block',
                                transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                                transition: 'transform 0.2s ease',
                                color: 'var(--text-muted)',
                                fontSize: '0.65rem',
                                userSelect: 'none'
                              }}>
                                ▶
                              </span>
                              {pos.symbol}
                            </td>
                            <td>
                              <span className="badge" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', border: '1px solid rgba(255,255,255,0.08)', fontSize: '0.7rem' }}>
                                {pos.type}
                              </span>
                            </td>
                            <td>{pos.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                            <td style={{ fontStyle: 'italic', color: 'var(--text-muted)', fontSize: '0.8rem' }}>{pos.openDate}</td>
                            <td style={{ fontStyle: 'italic', color: 'var(--text-muted)', fontSize: '0.8rem' }}>{pos.closeDate}</td>
                            <td style={{ textAlign: 'right' }}>{formatCurrency(pos.costBasis)}</td>
                            <td style={{ textAlign: 'right' }}>{formatCurrency(pos.proceeds)}</td>
                            <td className={pos.realizedPnL >= 0 ? 'gain-text' : 'loss-text'} style={{ fontWeight: '600', textAlign: 'right' }}>
                              {pos.realizedPnL >= 0 ? '+' : ''}{formatCurrency(pos.realizedPnL)}
                            </td>
                            <td style={{ textAlign: 'right', color: pos.washSaleAmount > 0 ? 'var(--color-warning)' : 'var(--text-muted)', fontWeight: '600' }}>
                              {pos.washSaleAmount > 0 ? formatCurrency(pos.washSaleAmount) : '—'}
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr>
                              <td colSpan={9} style={{ 
                                padding: '1.25rem 1.5rem', 
                                background: 'rgba(15, 23, 42, 0.45)', 
                                borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                                boxShadow: 'inset 0 4px 6px -1px rgba(0, 0, 0, 0.2)'
                              }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                  <h4 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0, fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Individual Trades for {pos.symbol} ({pos.trades.length})
                                  </h4>
                                  <div className="table-container" style={{ background: 'rgba(0, 0, 0, 0.25)', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.04)' }}>
                                    <table className="nested-table" style={{ margin: 0 }}>
                                      <thead>
                                        <tr>
                                          <th style={{ width: '30px' }}></th>
                                          <th>Type</th>
                                          <th>Quantity</th>
                                          <th>Date Acquired</th>
                                          <th>Date Sold</th>
                                          <th style={{ textAlign: 'right' }}>Cost Basis</th>
                                          <th style={{ textAlign: 'right' }}>Proceeds</th>
                                          <th style={{ textAlign: 'right' }}>Realized Gain/Loss</th>
                                          <th style={{ textAlign: 'right' }}>Wash Sale</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {sortedChildTrades.map((childTrade) => {
                                          const isChildExpanded = expandedChildTradeId === childTrade.id;
                                          return (
                                            <React.Fragment key={childTrade.id}>
                                              <tr 
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setExpandedChildTradeId(isChildExpanded ? null : childTrade.id);
                                                }}
                                                style={{ 
                                                  cursor: 'pointer',
                                                  background: isChildExpanded ? 'rgba(255, 255, 255, 0.02)' : 'transparent',
                                                  transition: 'background 0.2s ease'
                                                }}
                                              >
                                                <td style={{ textAlign: 'center' }}>
                                                  <span style={{ 
                                                    display: 'inline-block',
                                                    transform: isChildExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                                                    transition: 'transform 0.2s ease',
                                                    color: 'var(--text-muted)',
                                                    fontSize: '0.6rem'
                                                  }}>
                                                    ▶
                                                  </span>
                                                </td>
                                                <td>
                                                  <span className={`badge ${childTrade.type === 'LONG' ? 'badge-success' : 'badge-danger'}`}>
                                                    {childTrade.type}
                                                  </span>
                                                </td>
                                                <td>{childTrade.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                                                <td>{childTrade.openDate}</td>
                                                <td>{childTrade.closeDate}</td>
                                                <td style={{ textAlign: 'right' }}>{formatCurrency(childTrade.costBasis)}</td>
                                                <td style={{ textAlign: 'right' }}>{formatCurrency(childTrade.proceeds)}</td>
                                                <td className={childTrade.realizedPnL >= 0 ? 'gain-text' : 'loss-text'} style={{ fontWeight: '600', textAlign: 'right' }}>
                                                  {childTrade.realizedPnL >= 0 ? '+' : ''}{formatCurrency(childTrade.realizedPnL)}
                                                </td>
                                                <td style={{ textAlign: 'right', color: childTrade.washSaleAmount > 0 ? 'var(--color-warning)' : 'var(--text-muted)', fontWeight: '600' }}>
                                                  {childTrade.washSaleAmount > 0 ? formatCurrency(childTrade.washSaleAmount) : '—'}
                                                </td>
                                              </tr>
                                              {isChildExpanded && (
                                                <tr onClick={(e) => e.stopPropagation()}>
                                                  <td colSpan={9} style={{ 
                                                    padding: '1.25rem', 
                                                    background: 'rgba(10, 15, 30, 0.65)', 
                                                    borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                                                    boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.3)'
                                                  }}>
                                                    {renderTradeReconciliationDetails(childTrade)}
                                                  </td>
                                                </tr>
                                              )}
                                            </React.Fragment>
                                          );
                                        })}
                                      </tbody>
                                    </table>
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
              <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                <AlertTriangle size={24} style={{ color: 'var(--color-warning)' }} />
                <span>No matched closed transactions recorded for this date range.</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 1099-B Noncovered Securities S/T */}
      <div className="glass-panel" style={{ padding: '1.25rem' }}>
        <div 
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none', flexWrap: 'wrap', gap: '1rem' }}
          onClick={() => setNoncoveredCollapsed(!noncoveredCollapsed)}
        >
          <div>
            <h3 style={{ margin: 0 }}>1099-B Noncovered Securities S/T</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
              Noncovered securities transactions details (manually declared cost basis).
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <button
              className="btn btn-secondary"
              style={{ padding: '0.3rem 0.65rem', borderRadius: '4px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
              onClick={(e) => {
                e.stopPropagation();
                setEditingNoncovered(!editingNoncovered);
              }}
            >
              <Edit size={14} />
              {editingNoncovered ? 'Done' : 'Edit Tickers'}
            </button>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--color-success)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '0.3rem 0.6rem', borderRadius: '4px', fontWeight: '600', fontSize: '0.8rem' }}>
                Total Proceeds: {formatCurrency(noncoveredTotals.proceeds)}
              </span>
              <span className="badge" style={{ background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-secondary)', border: '1px solid rgba(255, 255, 255, 0.1)', padding: '0.3rem 0.6rem', borderRadius: '4px', fontWeight: '600', fontSize: '0.8rem' }}>
                Total Cost: {formatCurrency(noncoveredTotals.cost)}
              </span>
              <span className="badge" style={{ background: noncoveredTotals.pnl >= 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: noncoveredTotals.pnl >= 0 ? 'var(--color-success)' : 'var(--color-danger)', border: noncoveredTotals.pnl >= 0 ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(239, 68, 68, 0.2)', padding: '0.3rem 0.6rem', borderRadius: '4px', fontWeight: '600', fontSize: '0.8rem' }}>
                Net Gain/Loss: {noncoveredTotals.pnl >= 0 ? '+' : ''}{formatCurrency(noncoveredTotals.pnl)}
              </span>
              {noncoveredTotals.washSale > 0 && (
                <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.1)', color: 'var(--color-warning)', border: '1px solid rgba(245, 158, 11, 0.2)', padding: '0.3rem 0.6rem', borderRadius: '4px', fontWeight: '600', fontSize: '0.8rem' }}>
                  Total Wash Sale: {formatCurrency(noncoveredTotals.washSale)}
                </span>
              )}
            </div>
            <button
              className="btn btn-secondary"
              style={{ padding: '0.3rem 0.65rem', borderRadius: '4px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
              onClick={handleExportNoncoveredCSV}
              disabled={noncoveredBRows.length === 0}
            >
              <FileDown size={14} />
              Export Noncovered
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--text-secondary)' }}>
              <span style={{ fontSize: '0.8rem' }}>{noncoveredCollapsed ? 'Expand' : 'Collapse'}</span>
              {noncoveredCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
            </div>
          </div>
        </div>

        {editingNoncovered && (
          <div 
            className="glass-panel" 
            style={{ 
              marginTop: '1.25rem', 
              padding: '1.25rem', 
              background: 'rgba(255, 255, 255, 0.015)',
              border: '1px dashed rgba(255, 255, 255, 0.12)',
              borderRadius: '6px'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <span style={{ fontWeight: '700', fontSize: '0.9rem', color: 'var(--text-primary)' }}>Manage Noncovered Tickers</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Tickers below will be dynamically separated into this section.
              </span>
            </div>
            
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', maxWidth: '350px' }}>
              <input 
                type="text"
                placeholder="Ticker Symbol (e.g. BTC)"
                className="form-input"
                style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
                value={newTickerInput}
                onChange={(e) => setNewTickerInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTicker();
                  }
                }}
              />
              <button 
                className="btn btn-primary"
                style={{ padding: '0.4rem 1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                onClick={handleAddTicker}
              >
                <Plus size={14} /> Add
              </button>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {(appSettings?.noncoveredTickers || []).length > 0 ? (
                (appSettings?.noncoveredTickers || []).map(ticker => (
                  <span 
                    key={ticker} 
                    className="badge" 
                    style={{ 
                      background: 'rgba(239, 68, 68, 0.05)', 
                      color: 'var(--text-primary)', 
                      border: '1px solid rgba(239, 68, 68, 0.25)', 
                      padding: '0.3rem 0.6rem', 
                      borderRadius: '4px',
                      fontSize: '0.8rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem'
                    }}
                  >
                    {ticker}
                    <X 
                      size={12} 
                      style={{ cursor: 'pointer', color: 'var(--color-danger)' }}
                      onClick={() => handleRemoveTicker(ticker)}
                    />
                  </span>
                ))
              ) : (
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  No noncovered tickers registered. All symbols are currently reported as Covered.
                </span>
              )}
            </div>
          </div>
        )}

        {!noncoveredCollapsed && (
          <div style={{ marginTop: '1rem' }}>
            {noncoveredBRows.length > 0 ? (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      {renderSortableHeader('Ticker Symbol', 'symbol', noncoveredSort, setNoncoveredSort)}
                      {renderSortableHeader('Type', 'type', noncoveredSort, setNoncoveredSort)}
                      {renderSortableHeader('Quantity', 'quantity', noncoveredSort, setNoncoveredSort)}
                      {renderSortableHeader('Date Acquired', 'openDate', noncoveredSort, setNoncoveredSort)}
                      {renderSortableHeader('Date Sold', 'closeDate', noncoveredSort, setNoncoveredSort)}
                      {renderSortableHeader('Cost Basis', 'costBasis', noncoveredSort, setNoncoveredSort, 'right')}
                      {renderSortableHeader('Proceeds', 'proceeds', noncoveredSort, setNoncoveredSort, 'right')}
                      {renderSortableHeader('Realized Gain/Loss', 'realizedPnL', noncoveredSort, setNoncoveredSort, 'right')}
                      {renderSortableHeader('Wash Sale', 'washSaleAmount', noncoveredSort, setNoncoveredSort, 'right')}
                    </tr>
                  </thead>
                  <tbody>
                    {noncoveredBRows.map((pos) => {
                      const isExpanded = expandedNoncoveredTradeId === pos.id;
                      const sortedChildTrades = [...pos.trades].sort((a, b) => new Date(b.closeDate) - new Date(a.closeDate));

                      return (
                        <React.Fragment key={pos.id}>
                          <tr 
                            onClick={() => setExpandedNoncoveredTradeId(isExpanded ? null : pos.id)}
                            style={{ 
                              cursor: 'pointer', 
                              background: isExpanded ? 'rgba(255, 255, 255, 0.03)' : 'transparent',
                              transition: 'background 0.2s ease'
                            }}
                          >
                            <td style={{ fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span style={{ 
                                display: 'inline-block',
                                transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                                transition: 'transform 0.2s ease',
                                color: 'var(--text-muted)',
                                fontSize: '0.65rem',
                                userSelect: 'none'
                              }}>
                                ▶
                              </span>
                              {pos.symbol}
                            </td>
                            <td>
                              <span className="badge" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', border: '1px solid rgba(255,255,255,0.08)', fontSize: '0.7rem' }}>
                                {pos.type}
                              </span>
                            </td>
                            <td>{pos.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                            <td style={{ fontStyle: 'italic', color: 'var(--text-muted)', fontSize: '0.8rem' }}>{pos.openDate}</td>
                            <td style={{ fontStyle: 'italic', color: 'var(--text-muted)', fontSize: '0.8rem' }}>{pos.closeDate}</td>
                            <td style={{ textAlign: 'right' }}>{formatCurrency(pos.costBasis)}</td>
                            <td style={{ textAlign: 'right' }}>{formatCurrency(pos.proceeds)}</td>
                            <td className={pos.realizedPnL >= 0 ? 'gain-text' : 'loss-text'} style={{ fontWeight: '600', textAlign: 'right' }}>
                              {pos.realizedPnL >= 0 ? '+' : ''}{formatCurrency(pos.realizedPnL)}
                            </td>
                            <td style={{ textAlign: 'right', color: pos.washSaleAmount > 0 ? 'var(--color-warning)' : 'var(--text-muted)', fontWeight: '600' }}>
                              {pos.washSaleAmount > 0 ? formatCurrency(pos.washSaleAmount) : '—'}
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr>
                              <td colSpan={9} style={{ 
                                padding: '1.25rem 1.5rem', 
                                background: 'rgba(15, 23, 42, 0.45)', 
                                borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                                boxShadow: 'inset 0 4px 6px -1px rgba(0, 0, 0, 0.2)'
                              }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                  <h4 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0, fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Individual Trades for {pos.symbol} ({pos.trades.length})
                                  </h4>
                                  <div className="table-container" style={{ background: 'rgba(0, 0, 0, 0.25)', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.04)' }}>
                                    <table className="nested-table" style={{ margin: 0 }}>
                                      <thead>
                                        <tr>
                                          <th style={{ width: '30px' }}></th>
                                          <th>Type</th>
                                          <th>Quantity</th>
                                          <th>Date Acquired</th>
                                          <th>Date Sold</th>
                                          <th style={{ textAlign: 'right' }}>Cost Basis</th>
                                          <th style={{ textAlign: 'right' }}>Proceeds</th>
                                          <th style={{ textAlign: 'right' }}>Realized Gain/Loss</th>
                                          <th style={{ textAlign: 'right' }}>Wash Sale</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {sortedChildTrades.map((childTrade) => {
                                          const isChildExpanded = expandedNoncoveredChildTradeId === childTrade.id;
                                          return (
                                            <React.Fragment key={childTrade.id}>
                                              <tr 
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setExpandedNoncoveredChildTradeId(isChildExpanded ? null : childTrade.id);
                                                }}
                                                style={{ 
                                                  cursor: 'pointer',
                                                  background: isChildExpanded ? 'rgba(255, 255, 255, 0.02)' : 'transparent',
                                                  transition: 'background 0.2s ease'
                                                }}
                                              >
                                                <td style={{ textAlign: 'center' }}>
                                                  <span style={{ 
                                                    display: 'inline-block',
                                                    transform: isChildExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                                                    transition: 'transform 0.2s ease',
                                                    color: 'var(--text-muted)',
                                                    fontSize: '0.6rem'
                                                  }}>
                                                    ▶
                                                  </span>
                                                </td>
                                                <td>
                                                  <span className={`badge ${childTrade.type === 'LONG' ? 'badge-success' : 'badge-danger'}`}>
                                                    {childTrade.type}
                                                  </span>
                                                </td>
                                                <td>{childTrade.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                                                <td>{childTrade.openDate}</td>
                                                <td>{childTrade.closeDate}</td>
                                                <td style={{ textAlign: 'right' }}>{formatCurrency(childTrade.costBasis)}</td>
                                                <td style={{ textAlign: 'right' }}>{formatCurrency(childTrade.proceeds)}</td>
                                                <td className={childTrade.realizedPnL >= 0 ? 'gain-text' : 'loss-text'} style={{ fontWeight: '600', textAlign: 'right' }}>
                                                  {childTrade.realizedPnL >= 0 ? '+' : ''}{formatCurrency(childTrade.realizedPnL)}
                                                </td>
                                                <td style={{ textAlign: 'right', color: childTrade.washSaleAmount > 0 ? 'var(--color-warning)' : 'var(--text-muted)', fontWeight: '600' }}>
                                                  {childTrade.washSaleAmount > 0 ? formatCurrency(childTrade.washSaleAmount) : '—'}
                                                </td>
                                              </tr>
                                              {isChildExpanded && (
                                                <tr onClick={(e) => e.stopPropagation()}>
                                                  <td colSpan={9} style={{ 
                                                    padding: '1.25rem', 
                                                    background: 'rgba(10, 15, 30, 0.65)', 
                                                    borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                                                    boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.3)'
                                                  }}>
                                                    {renderTradeReconciliationDetails(childTrade)}
                                                  </td>
                                                </tr>
                                              )}
                                            </React.Fragment>
                                          );
                                        })}
                                      </tbody>
                                    </table>
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
              <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                <AlertTriangle size={24} style={{ color: 'var(--color-warning)' }} />
                <span>No matched closed transactions recorded for this date range.</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 1099-INT Interest Income Details */}
      <div className="glass-panel" style={{ padding: '1.25rem' }}>
        <div 
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none', flexWrap: 'wrap', gap: '1rem' }}
          onClick={() => setIntCollapsed(!intCollapsed)}
        >
          <div>
            <h3 style={{ margin: 0 }}>1099-INT Interest Income</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
              Taxable credit interest earned on cash balances, collateral, or short credits.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--color-success)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '0.4rem 0.8rem', borderRadius: '4px', fontWeight: '600', fontSize: '0.9rem' }}>
              Total: {formatCurrency(totalCreditInterest)}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--text-secondary)' }}>
              <span style={{ fontSize: '0.8rem' }}>{intCollapsed ? 'Expand' : 'Collapse'}</span>
              {intCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
            </div>
          </div>
        </div>

        {!intCollapsed && (
          <div style={{ marginTop: '1rem' }}>
            {sortedIntTxns.length > 0 ? (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      {renderSortableHeader('Date', 'date', intSort, setIntSort)}
                      {renderSortableHeader('Transaction Type', 'activityType', intSort, setIntSort)}
                      {renderSortableHeader('Description', 'description', intSort, setIntSort)}
                      {renderSortableHeader('Source Note', 'note', intSort, setIntSort)}
                      {renderSortableHeader('Amount', 'amount', intSort, setIntSort, 'right')}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedIntTxns.map((txn) => (
                      <tr key={txn.id}>
                        <td>{txn.date}</td>
                        <td style={{ fontWeight: '500' }}>{txn.activityType || 'Credit Interest'}</td>
                        <td>{txn.description || 'Interest Payment'}</td>
                        <td style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                          {txn.note ? txn.note.split('|')[0] : 'Manual Entry'}
                        </td>
                        <td className="gain-text" style={{ fontWeight: '600', textAlign: 'right' }}>
                          {formatCurrency(txn.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                <AlertTriangle size={24} style={{ color: 'var(--color-warning)' }} />
                <span>No credit interest transactions recorded for this date range.</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 1099-DIV Dividend Income Details */}
      <div className="glass-panel" style={{ padding: '1.25rem' }}>
        <div 
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none', flexWrap: 'wrap', gap: '1rem' }}
          onClick={() => setDivCollapsed(!divCollapsed)}
        >
          <div>
            <h3 style={{ margin: 0 }}>1099-DIV Dividend Income</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
              Taxable dividend distributions, including regular dividends and payments in lieu of dividends.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span className="badge" style={{ background: 'rgba(99, 102, 241, 0.1)', color: 'var(--color-primary)', border: '1px solid rgba(99, 102, 241, 0.2)', padding: '0.3rem 0.6rem', borderRadius: '4px', fontWeight: '600', fontSize: '0.8rem' }}>
                Ordinary: {formatCurrency(dividendTotals.ordinary)}
              </span>
              <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--color-success)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '0.3rem 0.6rem', borderRadius: '4px', fontWeight: '600', fontSize: '0.8rem' }}>
                Qualified: {formatCurrency(dividendTotals.qualified)}
              </span>
              <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.1)', color: 'var(--color-warning)', border: '1px solid rgba(245, 158, 11, 0.2)', padding: '0.3rem 0.6rem', borderRadius: '4px', fontWeight: '600', fontSize: '0.8rem' }}>
                ROC: {formatCurrency(dividendTotals.roc)}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--text-secondary)' }}>
              <span style={{ fontSize: '0.8rem' }}>{divCollapsed ? 'Expand' : 'Collapse'}</span>
              {divCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
            </div>
          </div>
        </div>

        {!divCollapsed && (
          <div style={{ marginTop: '1rem' }}>
            {sortedDivTxns.length > 0 ? (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      {renderSortableHeader('Date', 'date', divSort, setDivSort)}
                      {renderSortableHeader('Symbol', 'symbol', divSort, setDivSort)}
                      {renderSortableHeader('Ordinary Div', 'ordinaryDividend', divSort, setDivSort, 'right')}
                      {renderSortableHeader('Qualified Div', 'qualifiedDividend', divSort, setDivSort, 'right')}
                      {renderSortableHeader('Return of Capital (ROC)', 'returnOfCapital', divSort, setDivSort, 'right')}
                      {renderSortableHeader('Original Total', 'amount', divSort, setDivSort, 'right')}
                      <th style={{ textAlign: 'center' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedDivTxns.map((txn) => {
                      const ordinaryAmt = txn.ordinaryDividend !== undefined ? txn.ordinaryDividend : txn.amount;
                      const qualifiedAmt = txn.qualifiedDividend || 0;
                      const rocAmt = txn.returnOfCapital || 0;
                      const isEdited = editingTxnId === txn.id;

                      return (
                        <React.Fragment key={txn.id}>
                          <tr style={isEdited ? { background: 'rgba(99, 102, 241, 0.03)' } : {}}>
                            <td>{txn.date}</td>
                            <td style={{ fontWeight: '600' }}>{txn.symbol || '-'}</td>
                            <td style={{ textAlign: 'right', fontWeight: '500' }}>
                              {formatCurrency(ordinaryAmt)}
                            </td>
                            <td className="gain-text" style={{ textAlign: 'right', fontWeight: '500' }}>
                              {formatCurrency(qualifiedAmt)}
                            </td>
                            <td className="loss-text" style={{ textAlign: 'right', fontWeight: '500' }}>
                              {formatCurrency(rocAmt)}
                            </td>
                            <td style={{ textAlign: 'right', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                              {formatCurrency(txn.amount)}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <button 
                                className="btn btn-secondary"
                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', borderRadius: '4px' }}
                                onClick={() => handleStartEdit(txn)}
                              >
                                Edit Tax Split
                              </button>
                            </td>
                          </tr>

                          {isEdited && (
                            <tr style={{ background: 'rgba(255, 255, 255, 0.015)' }}>
                              <td colSpan={7} style={{ padding: '1rem', borderTop: 'none' }}>
                                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                                  <div className="form-group" style={{ margin: 0, minWidth: '120px' }}>
                                    <label className="form-label" style={{ fontSize: '0.725rem', color: 'var(--text-secondary)' }}>Ordinary Dividend ($)</label>
                                    <input 
                                      type="number" 
                                      className="form-input" 
                                      style={{ padding: '0.4rem 0.5rem', fontSize: '0.8rem' }}
                                      value={editForm.ordinary}
                                      onChange={(e) => setEditForm({ ...editForm, ordinary: e.target.value })}
                                      placeholder="0.00"
                                      step="0.01"
                                    />
                                  </div>
                                  <div className="form-group" style={{ margin: 0, minWidth: '120px' }}>
                                    <label className="form-label" style={{ fontSize: '0.725rem', color: 'var(--text-secondary)' }}>Qualified Dividend ($)</label>
                                    <input 
                                      type="number" 
                                      className="form-input" 
                                      style={{ padding: '0.4rem 0.5rem', fontSize: '0.8rem' }}
                                      value={editForm.qualified}
                                      onChange={(e) => setEditForm({ ...editForm, qualified: e.target.value })}
                                      placeholder="0.00"
                                      step="0.01"
                                    />
                                  </div>
                                  <div className="form-group" style={{ margin: 0, minWidth: '120px' }}>
                                    <label className="form-label" style={{ fontSize: '0.725rem', color: 'var(--text-secondary)' }}>Return of Capital (ROC) ($)</label>
                                    <input 
                                      type="number" 
                                      className="form-input" 
                                      style={{ padding: '0.4rem 0.5rem', fontSize: '0.8rem' }}
                                      value={editForm.roc}
                                      onChange={(e) => {
                                        const rocVal = parseFloat(e.target.value) || 0;
                                        const ordVal = (txn.amount - rocVal).toFixed(2);
                                        setEditForm({
                                          ...editForm,
                                          roc: e.target.value,
                                          ordinary: ordVal
                                        });
                                      }}
                                      placeholder="0.00"
                                      step="0.01"
                                    />
                                  </div>
                                  
                                  <div style={{ display: 'flex', gap: '0.5rem', marginLeft: 'auto' }}>
                                    <button 
                                      className="btn btn-secondary" 
                                      style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }} 
                                      onClick={() => setEditingTxnId(null)}
                                    >
                                      Cancel
                                    </button>
                                    <button 
                                      className="btn btn-primary" 
                                      style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }} 
                                      onClick={() => handleSaveEdit(txn.id)}
                                    >
                                      Save Split
                                    </button>
                                  </div>
                                </div>
                                
                                {/* Real-time Splits Validation */}
                                <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', gap: '1.5rem', flexWrap: 'wrap', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.5rem' }}>
                                  <span>Original Total: <strong>{formatCurrency(txn.amount)}</strong></span>
                                  <span>Sum of Split (Ord + ROC): <strong>{formatCurrency((parseFloat(editForm.ordinary) || 0) + (parseFloat(editForm.roc) || 0))}</strong></span>
                                  {Math.abs((parseFloat(editForm.ordinary) || 0) + (parseFloat(editForm.roc) || 0) - txn.amount) > 0.01 && (
                                    <span style={{ color: 'var(--color-warning)', fontWeight: '500' }}>
                                      ⚠️ Note: Splits (Ordinary + ROC) do not match original dividend total.
                                    </span>
                                  )}
                                  {(parseFloat(editForm.qualified) || 0) > (parseFloat(editForm.ordinary) || 0) && (
                                    <span style={{ color: 'var(--color-warning)', fontWeight: '500' }}>
                                      ⚠️ Error: Qualified dividend cannot exceed ordinary dividend.
                                    </span>
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
              <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                <AlertTriangle size={24} style={{ color: 'var(--color-warning)' }} />
                <span>No dividend transactions recorded for this date range.</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 1099-MISC Substitute Payments Details */}
      <div className="glass-panel" style={{ padding: '1.25rem' }}>
        <div 
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none', flexWrap: 'wrap', gap: '1rem' }}
          onClick={() => setMiscCollapsed(!miscCollapsed)}
        >
          <div>
            <h3 style={{ margin: 0 }}>1099-MISC Substitute Payments in Lieu</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
              Substitute payments in lieu of dividends or interest (often reported on Form 1099-MISC).
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--color-success)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '0.4rem 0.8rem', borderRadius: '4px', fontWeight: '600', fontSize: '0.9rem' }}>
              Total: {formatCurrency(totalLieu)}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--text-secondary)' }}>
              <span style={{ fontSize: '0.8rem' }}>{miscCollapsed ? 'Expand' : 'Collapse'}</span>
              {miscCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
            </div>
          </div>
        </div>

        {!miscCollapsed && (
          <div style={{ marginTop: '1rem' }}>
            {sortedMiscTxns.length > 0 ? (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      {renderSortableHeader('Date', 'date', miscSort, setMiscSort)}
                      {renderSortableHeader('Symbol', 'symbol', miscSort, setMiscSort)}
                      {renderSortableHeader('Transaction Type', 'activityType', miscSort, setMiscSort)}
                      {renderSortableHeader('Description', 'description', miscSort, setMiscSort)}
                      {renderSortableHeader('Source Note', 'note', miscSort, setMiscSort)}
                      {renderSortableHeader('Amount', 'amount', miscSort, setMiscSort, 'right')}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedMiscTxns.map((txn) => (
                      <tr key={txn.id}>
                        <td>{txn.date}</td>
                        <td style={{ fontWeight: '600' }}>{txn.symbol || '-'}</td>
                        <td style={{ fontWeight: '500' }}>{txn.activityType || 'Payment in Lieu'}</td>
                        <td>{txn.description || 'Substitute Payment in Lieu'}</td>
                        <td style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                          {txn.note ? txn.note.split('|')[0] : 'Manual Entry'}
                        </td>
                        <td className="gain-text" style={{ fontWeight: '600', textAlign: 'right' }}>
                          {formatCurrency(txn.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                <AlertTriangle size={24} style={{ color: 'var(--color-warning)' }} />
                <span>No substitute payments in lieu recorded for this date range.</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
