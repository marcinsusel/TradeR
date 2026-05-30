import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, Award, Layers, HelpCircle, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';

export default function Dashboard() {
  const { trades, openPositions, transactions } = useApp();
  const [sortConfig, setSortConfig] = useState({ key: 'pnl', direction: 'desc' });

  // Time picker states
  const [datePreset, setDatePreset] = useState('YTD');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Calculate preset date ranges dynamically based on current local date
  const getDateRangeForPreset = (preset) => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed
    
    let start = '';
    let end = '';

    const pad = (n) => String(n).padStart(2, '0');

    if (preset === 'YTD') {
      start = `${currentYear}-01-01`;
      end = `${currentYear}-${pad(currentMonth + 1)}-${pad(now.getDate())}`;
    } else if (preset === 'LAST_YEAR') {
      const lastYear = currentYear - 1;
      start = `${lastYear}-01-01`;
      end = `${lastYear}-12-31`;
    } else if (preset === 'PREV_MONTH') {
      let prevMonthYear = currentYear;
      let prevMonth = currentMonth - 1;
      if (prevMonth < 0) {
        prevMonth = 11;
        prevMonthYear -= 1;
      }
      start = `${prevMonthYear}-${pad(prevMonth + 1)}-01`;
      const lastDay = new Date(prevMonthYear, prevMonth + 1, 0).getDate();
      end = `${prevMonthYear}-${pad(prevMonth + 1)}-${pad(lastDay)}`;
    } else if (preset === 'ALL_TIME') {
      start = '';
      end = '';
    }

    return { start, end };
  };

  // Filter completed trades by closing date preset
  const filteredTrades = useMemo(() => {
    let presetStart = startDate;
    let presetEnd = endDate;
    
    if (datePreset !== 'CUSTOM') {
      const range = getDateRangeForPreset(datePreset);
      presetStart = range.start;
      presetEnd = range.end;
    }

    return trades.filter(t => {
      const date = t.closeDate;
      const matchStart = !presetStart || date >= presetStart;
      const matchEnd = !presetEnd || date <= presetEnd;
      return matchStart && matchEnd;
    });
  }, [trades, datePreset, startDate, endDate]);

  // Filter raw transactions by date preset
  const filteredTransactions = useMemo(() => {
    let presetStart = startDate;
    let presetEnd = endDate;
    
    if (datePreset !== 'CUSTOM') {
      const range = getDateRangeForPreset(datePreset);
      presetStart = range.start;
      presetEnd = range.end;
    }

    return transactions.filter(t => {
      const date = t.date;
      const matchStart = !presetStart || date >= presetStart;
      const matchEnd = !presetEnd || date <= presetEnd;
      return matchStart && matchEnd;
    });
  }, [transactions, datePreset, startDate, endDate]);

  const metrics = useMemo(() => {
    let tradesPnL = 0;
    let profitableTrades = 0;
    let lossTrades = 0;
    let totalWins = 0;
    let totalLosses = 0;
    
    filteredTrades.forEach(t => {
      tradesPnL += t.realizedPnL;
      if (t.realizedPnL > 0) {
        profitableTrades++;
        totalWins += t.realizedPnL;
      } else {
        lossTrades++;
        totalLosses += Math.abs(t.realizedPnL);
      }
    });

    // Sum other fees, interest, transfers, and dividends (exclude voided)
    let totalFees = 0;
    let totalInterest = 0;
    let totalTransfers = 0;
    let totalDividends = 0;
    
    filteredTransactions.forEach(t => {
      if (t.voided) return;
      const amt = parseFloat(t.amount) || 0;
      if (t.type === 'FEE') {
        totalFees += amt;
      } else if (t.type === 'INTEREST') {
        totalInterest += amt;
      } else if (t.type === 'TRANSFER') {
        totalTransfers += amt;
      } else if (t.type === 'DIVIDEND') {
        totalDividends += amt;
      }
    });

    const totalFeesAndInterest = totalFees + totalInterest;
    const totalPnL = tradesPnL + totalFeesAndInterest + totalDividends;
    const accountBalance = totalTransfers + totalPnL;

    const totalClosedCount = filteredTrades.length;
    const winRate = totalClosedCount > 0 ? (profitableTrades / totalClosedCount) * 100 : 0;
    const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? 99.9 : 0;

    // Open positions cost basis
    const openCost = openPositions.reduce((acc, pos) => acc + pos.costBasis, 0);

    return {
      tradesPnL,
      totalFees,
      totalInterest,
      totalFeesAndInterest,
      totalTransfers,
      totalDividends,
      totalPnL,
      accountBalance,
      winRate,
      profitFactor,
      totalClosedCount,
      profitableTrades,
      lossTrades,
      openCost,
      openCount: openPositions.length
    };
  }, [filteredTrades, openPositions, filteredTransactions]);

  // Aggregate cumulative PnL over time for chart
  const chartData = useMemo(() => {
    if (filteredTrades.length === 0) return [];
    
    // Sort trades oldest closeDate to newest
    const sortedTrades = [...filteredTrades].sort((a, b) => new Date(a.closeDate) - new Date(b.closeDate));
    
    const dailyPnL = {};
    sortedTrades.forEach(t => {
      const date = t.closeDate;
      dailyPnL[date] = (dailyPnL[date] || 0) + t.realizedPnL;
    });

    const dates = Object.keys(dailyPnL).sort((a, b) => new Date(a) - new Date(b));
    
    let cumulative = 0;
    return dates.map(date => {
      cumulative += dailyPnL[date];
      return {
        date,
        pnl: parseFloat(cumulative.toFixed(2))
      };
    });
  }, [filteredTrades]);

  // Top profitable and unprofitable tickers
  const tickerStats = useMemo(() => {
    const stats = {};
    filteredTrades.forEach(t => {
      const baseTicker = t.symbol ? t.symbol.trim().split(/\s+/)[0] : '';
      if (baseTicker) {
        stats[baseTicker] = (stats[baseTicker] || 0) + t.realizedPnL;
      }
    });

    const sorted = Object.entries(stats).map(([symbol, pnl]) => ({ symbol, pnl }));
    const winners = sorted.filter(s => s.pnl > 0).sort((a, b) => b.pnl - a.pnl).slice(0, 5);
    const losers = sorted.filter(s => s.pnl < 0).sort((a, b) => a.pnl - b.pnl).slice(0, 5);
    
    return { winners, losers };
  }, [filteredTrades]);

  // Aggregate PnL by ticker
  const pnlByTicker = useMemo(() => {
    const stats = {};
    filteredTrades.forEach(t => {
      const baseTicker = t.symbol ? t.symbol.trim().split(/\s+/)[0] : '';
      if (baseTicker) {
        stats[baseTicker] = (stats[baseTicker] || 0) + t.realizedPnL;
      }
    });
    return Object.entries(stats).map(([symbol, pnl]) => ({ symbol, pnl }));
  }, [filteredTrades]);

  // Sort PnL by ticker data
  const sortedPnlByTicker = useMemo(() => {
    const data = [...pnlByTicker];
    if (!sortConfig) return data;
    const { key, direction } = sortConfig;
    
    data.sort((a, b) => {
      let valA = a[key];
      let valB = b[key];
      
      let comparison = 0;
      if (typeof valA === 'number' && typeof valB === 'number') {
        comparison = valA - valB;
      } else {
        comparison = String(valA).localeCompare(String(valB), undefined, { numeric: true, sensitivity: 'base' });
      }
      return direction === 'asc' ? comparison : -comparison;
    });
    return data;
  }, [pnlByTicker, sortConfig]);

  const requestSort = (key) => {
    setSortConfig(prev => {
      if (prev && prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'desc' };
    });
  };

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(val);
  };

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const pnl = payload[0].value;
      return (
        <div className="glass-panel" style={{ padding: '0.75rem', border: '1px solid var(--border-glow)' }}>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{payload[0].payload.date}</p>
          <p style={{ fontWeight: 'bold', color: pnl >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
            {formatCurrency(pnl)}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1.5rem'
      }}>
        <div>
          <h1 className="glow-text" style={{ fontSize: '2.25rem', marginBottom: '0.5rem' }}>Portfolio Dashboard</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Welcome to TradeR. Here is an overview of your trading activity.</p>
        </div>

        {/* Time Picker Container */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: '0.75rem'
        }}>
          {/* Preset Buttons */}
          <div style={{
            display: 'flex',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '24px',
            padding: '4px',
            gap: '2px',
            alignItems: 'center'
          }}>
            {[
              { id: 'YTD', label: 'YTD' },
              { id: 'LAST_YEAR', label: 'Last Year' },
              { id: 'PREV_MONTH', label: 'Previous Month' },
              { id: 'ALL_TIME', label: 'All Time' },
              { id: 'CUSTOM', label: 'Custom Dates' }
            ].map(preset => {
              const active = datePreset === preset.id;
              return (
                <button
                  key={preset.id}
                  onClick={() => setDatePreset(preset.id)}
                  style={{
                    background: active ? 'var(--color-primary)' : 'transparent',
                    border: 'none',
                    borderRadius: '20px',
                    color: active ? '#ffffff' : 'var(--text-secondary)',
                    padding: '6px 14px',
                    fontSize: '0.8rem',
                    fontWeight: active ? '600' : '500',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    outline: 'none',
                    whiteSpace: 'nowrap'
                  }}
                  onMouseEnter={(e) => {
                    if (!active) {
                      e.currentTarget.style.color = 'var(--text-primary)';
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!active) {
                      e.currentTarget.style.color = 'var(--text-secondary)';
                      e.currentTarget.style.background = 'transparent';
                    }
                  }}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          {/* Custom Date Inputs (only when Custom is selected) */}
          {datePreset === 'CUSTOM' && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              animation: 'fadeIn 0.2s ease-out'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>From:</span>
                <input
                  type="date"
                  className="form-input"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  style={{
                    padding: '4px 8px',
                    fontSize: '0.8rem',
                    width: '130px',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                    borderRadius: '6px'
                  }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>To:</span>
                <input
                  type="date"
                  className="form-input"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  style={{
                    padding: '4px 8px',
                    fontSize: '0.8rem',
                    width: '130px',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                    borderRadius: '6px'
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
        {/* Net Realized Gain/Loss */}
        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div style={{
            background: metrics.totalPnL >= 0 ? 'var(--color-success-bg)' : 'var(--color-danger-bg)',
            border: `1px solid ${metrics.totalPnL >= 0 ? 'var(--color-success-border)' : 'var(--color-danger-border)'}`,
            borderRadius: '12px', padding: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            {metrics.totalPnL >= 0 ? (
              <TrendingUp size={24} className="gain-text" />
            ) : (
              <TrendingDown size={24} className="loss-text" />
            )}
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Net Realized PnL</span>
            <h2 className={metrics.totalPnL >= 0 ? 'gain-text' : 'loss-text'} style={{ fontSize: '1.5rem', marginTop: '0.25rem' }}>
              {formatCurrency(metrics.totalPnL)}
            </h2>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.25rem' }}>
              Trades: {formatCurrency(metrics.tradesPnL)} | Divs: {formatCurrency(metrics.totalDividends)} | Fees: {formatCurrency(metrics.totalFeesAndInterest)}
            </span>
          </div>
        </div>

        {/* Account Balance */}
        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div style={{
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.2)',
            borderRadius: '12px', padding: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <DollarSign size={24} className="gain-text" />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Account Balance</span>
            <h2 style={{ fontSize: '1.5rem', marginTop: '0.25rem' }}>
              {formatCurrency(metrics.accountBalance)}
            </h2>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.25rem' }}>
              Net Deposits + Total PnL
            </span>
          </div>
        </div>

        {/* Net Deposits (Basis) */}
        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div style={{
            background: 'rgba(99, 102, 241, 0.1)',
            border: '1px solid rgba(99, 102, 241, 0.2)',
            borderRadius: '12px', padding: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <ArrowUp size={24} style={{ color: 'var(--color-primary)' }} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Net Deposits (Basis)</span>
            <h2 style={{ fontSize: '1.5rem', marginTop: '0.25rem' }}>
              {formatCurrency(metrics.totalTransfers)}
            </h2>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.25rem' }}>
              Total Capital Transferred
            </span>
          </div>
        </div>

        {/* Open Capital */}
        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div style={{
            background: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid rgba(245, 158, 11, 0.2)',
            borderRadius: '12px', padding: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <Layers size={24} style={{ color: 'var(--color-warning)' }} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Open Capital</span>
            <h2 style={{ fontSize: '1.5rem', marginTop: '0.25rem' }}>
              {formatCurrency(metrics.openCost)}
            </h2>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.25rem' }}>
              {metrics.openCount} active positions
            </span>
          </div>
        </div>

        {/* Win Rate */}
        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div style={{
            background: 'rgba(168, 85, 247, 0.1)',
            border: '1px solid rgba(168, 85, 247, 0.2)',
            borderRadius: '12px', padding: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <Award size={24} style={{ color: '#a855f7' }} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Win Rate</span>
            <h2 style={{ fontSize: '1.5rem', marginTop: '0.25rem' }}>
              {metrics.winRate.toFixed(1)}%
            </h2>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.25rem' }}>
              {metrics.profitableTrades} of {metrics.totalClosedCount} closed trades
            </span>
          </div>
        </div>

        {/* Profit Factor */}
        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div style={{
            background: 'rgba(6, 182, 212, 0.1)',
            border: '1px solid rgba(6, 182, 212, 0.2)',
            borderRadius: '12px', padding: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <ArrowUpDown size={24} style={{ color: 'var(--color-secondary)' }} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Profit Factor</span>
            <h2 style={{ fontSize: '1.5rem', marginTop: '0.25rem' }}>
              {metrics.profitFactor.toFixed(2)}
            </h2>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.25rem' }}>
              Gross Wins / Gross Losses
            </span>
          </div>
        </div>
      </div>

      {/* Main Charts & Rankings Row */}
      <div className="dashboard-charts-grid">
        {/* Cumulative Performance Chart */}
        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h3>Performance Curve</h3>
          <div style={{ width: '100%', height: '300px' }}>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorPnL" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis 
                    dataKey="date" 
                    stroke="var(--text-muted)" 
                    fontSize={10}
                    tickLine={false}
                  />
                  <YAxis 
                    stroke="var(--text-muted)" 
                    fontSize={10}
                    tickLine={false}
                    tickFormatter={(val) => `$${val}`}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Area 
                    type="monotone" 
                    dataKey="pnl" 
                    stroke="var(--color-primary)" 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill="url(#colorPnL)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', gap: '0.5rem' }}>
                <HelpCircle size={18} />
                <span>Import transactions to view performance curve</span>
              </div>
            )}
          </div>
        </div>

        {/* Ticker Rankings */}
        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Top Winners */}
          <div>
            <h3 style={{ fontSize: '1rem', color: 'var(--color-success)', marginBottom: '0.75rem' }}>Top Profit Tickers</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {tickerStats.winners.length > 0 ? (
                tickerStats.winners.map(w => (
                  <div key={w.symbol} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', padding: '0.25rem 0' }}>
                    <span style={{ fontWeight: '500' }}>{w.symbol}</span>
                    <span className="gain-text" style={{ fontWeight: '600' }}>+{formatCurrency(w.pnl)}</span>
                  </div>
                ))
              ) : (
                <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>No profitable trades yet.</span>
              )}
            </div>
          </div>

          {/* Top Losers */}
          <div>
            <h3 style={{ fontSize: '1rem', color: 'var(--color-danger)', marginBottom: '0.75rem' }}>Top Loss Tickers</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {tickerStats.losers.length > 0 ? (
                tickerStats.losers.map(l => (
                  <div key={l.symbol} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', padding: '0.25rem 0' }}>
                    <span style={{ fontWeight: '500' }}>{l.symbol}</span>
                    <span className="loss-text" style={{ fontWeight: '600' }}>{formatCurrency(l.pnl)}</span>
                  </div>
                ))
              ) : (
                <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>No losing trades yet.</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* PnL by Ticker */}
      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>PnL by Ticker</h3>
        {sortedPnlByTicker.length > 0 ? (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th 
                    className="sortable" 
                    onClick={() => requestSort('symbol')}
                    style={{ padding: '1rem' }}
                  >
                    Ticker
                    <span className="sort-icon">
                      {sortConfig?.key === 'symbol' ? (
                        sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                      ) : (
                        <ArrowUpDown size={14} style={{ opacity: 0.3 }} />
                      )}
                    </span>
                  </th>
                  <th 
                    className="sortable" 
                    onClick={() => requestSort('pnl')}
                    style={{ padding: '1rem' }}
                  >
                    Realized PnL
                    <span className="sort-icon">
                      {sortConfig?.key === 'pnl' ? (
                        sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                      ) : (
                        <ArrowUpDown size={14} style={{ opacity: 0.3 }} />
                      )}
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedPnlByTicker.map((row) => (
                  <tr key={row.symbol}>
                    <td style={{ fontWeight: '600', padding: '1rem' }}>{row.symbol}</td>
                    <td style={{ fontWeight: '600', padding: '1rem' }} className={row.pnl >= 0 ? 'gain-text' : 'loss-text'}>
                      {row.pnl >= 0 ? '+' : ''}{formatCurrency(row.pnl)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-muted)' }}>
            No completed trades found.
          </div>
        )}
      </div>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
