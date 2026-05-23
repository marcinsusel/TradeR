import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, Award, Layers, HelpCircle, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';

export default function Dashboard() {
  const { trades, openPositions } = useApp();
  const [sortConfig, setSortConfig] = useState({ key: 'pnl', direction: 'desc' });

  const metrics = useMemo(() => {
    let totalPnL = 0;
    let profitableTrades = 0;
    let lossTrades = 0;
    let totalWins = 0;
    let totalLosses = 0;
    
    trades.forEach(t => {
      totalPnL += t.realizedPnL;
      if (t.realizedPnL > 0) {
        profitableTrades++;
        totalWins += t.realizedPnL;
      } else {
        lossTrades++;
        totalLosses += Math.abs(t.realizedPnL);
      }
    });

    const totalClosedCount = trades.length;
    const winRate = totalClosedCount > 0 ? (profitableTrades / totalClosedCount) * 100 : 0;
    const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? 99.9 : 0;

    // Open positions cost basis
    const openCost = openPositions.reduce((acc, pos) => acc + pos.costBasis, 0);

    return {
      totalPnL,
      winRate,
      profitFactor,
      totalClosedCount,
      profitableTrades,
      lossTrades,
      openCost,
      openCount: openPositions.length
    };
  }, [trades, openPositions]);

  // Aggregate cumulative PnL over time for chart
  const chartData = useMemo(() => {
    if (trades.length === 0) return [];
    
    // Sort trades oldest closeDate to newest
    const sortedTrades = [...trades].sort((a, b) => new Date(a.closeDate) - new Date(b.closeDate));
    
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
  }, [trades]);

  // Top profitable and unprofitable tickers
  const tickerStats = useMemo(() => {
    const stats = {};
    trades.forEach(t => {
      stats[t.symbol] = (stats[t.symbol] || 0) + t.realizedPnL;
    });

    const sorted = Object.entries(stats).map(([symbol, pnl]) => ({ symbol, pnl }));
    const winners = sorted.filter(s => s.pnl > 0).sort((a, b) => b.pnl - a.pnl).slice(0, 5);
    const losers = sorted.filter(s => s.pnl < 0).sort((a, b) => a.pnl - b.pnl).slice(0, 5);
    
    return { winners, losers };
  }, [trades]);

  // Aggregate PnL by ticker
  const pnlByTicker = useMemo(() => {
    const stats = {};
    trades.forEach(t => {
      stats[t.symbol] = (stats[t.symbol] || 0) + t.realizedPnL;
    });
    return Object.entries(stats).map(([symbol, pnl]) => ({ symbol, pnl }));
  }, [trades]);

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
      <div>
        <h1 className="glow-text" style={{ fontSize: '2.25rem', marginBottom: '0.5rem' }}>Portfolio Dashboard</h1>
        <p style={{ color: 'var(--text-secondary)' }}>Welcome to TradeR. Here is an overview of your trading activity.</p>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid-cols-4">
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
          </div>
        </div>

        {/* Win Rate */}
        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div style={{
            background: 'rgba(99, 102, 241, 0.1)',
            border: '1px solid rgba(99, 102, 241, 0.2)',
            borderRadius: '12px', padding: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <Award size={24} style={{ color: 'var(--color-primary)' }} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Win Rate</span>
            <h2 style={{ fontSize: '1.5rem', marginTop: '0.25rem' }}>
              {metrics.winRate.toFixed(1)}%
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '0.5rem', fontWeight: 'normal' }}>
                ({metrics.profitableTrades} of {metrics.totalClosedCount})
              </span>
            </h2>
          </div>
        </div>

        {/* Profit Factor */}
        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div style={{
            background: 'rgba(6, 182, 212, 0.1)',
            border: '1px solid rgba(6, 182, 212, 0.2)',
            borderRadius: '12px', padding: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <DollarSign size={24} style={{ color: 'var(--color-secondary)' }} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Profit Factor</span>
            <h2 style={{ fontSize: '1.5rem', marginTop: '0.25rem' }}>
              {metrics.profitFactor.toFixed(2)}
            </h2>
          </div>
        </div>

        {/* Open Positions Value */}
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
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '0.5rem', fontWeight: 'normal' }}>
                ({metrics.openCount} positions)
              </span>
            </h2>
          </div>
        </div>
      </div>

      {/* Main Charts & Rankings Row */}
      <div className="grid-cols-3" style={{ gridTemplateColumns: '2fr 1fr' }}>
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
    </div>
  );
}
