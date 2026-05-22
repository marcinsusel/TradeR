import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { generateRealizedReport } from '../utils/tradeMatcher';
import { FileDown, Calendar, AlertTriangle, Info } from 'lucide-react';

export default function Reports() {
  const { trades } = useApp();

  // Preset Date range selection
  const [rangePreset, setRangePreset] = useState('YTD'); // 'YTD' | 'MONTH' | 'PREV_YEAR' | 'CUSTOM'
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [symbolFilter, setSymbolFilter] = useState('');

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
    if (symbolFilter.trim()) {
      const filter = symbolFilter.trim().toUpperCase();
      aggregatedRows = aggregatedRows.filter(r => r.symbol.includes(filter));
    }

    return {
      summary: report.summary,
      rows: aggregatedRows.sort((a, b) => b.realizedPnL - a.realizedPnL)
    };
  }, [trades, dateRange, symbolFilter]);

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(val);
  };

  const handleExportCSV = () => {
    if (reportData.rows.length === 0) {
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
      `TradeR Realized Gain/Loss Report (${dateRange.start || 'Beginning'} to ${dateRange.end || 'Present'})`,
      `Generated on ${new Date().toLocaleDateString()}`,
      `Total Net realized PnL, ${reportData.summary.totalPnL.toFixed(2)}`,
      `Short Term PnL, ${reportData.summary.shortTermPnL.toFixed(2)}`,
      `Long Term PnL, ${reportData.summary.longTermPnL.toFixed(2)}`,
      '',
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `trader-gains-report-${rangePreset}-${dateRange.start}-to-${dateRange.end}.csv`);
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
          disabled={reportData.rows.length === 0}
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
      <div className="grid-cols-3">
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
      </div>

      {/* Aggregated Symbols Table */}
      <div className="glass-panel" style={{ padding: '1.25rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>Gains Breakdown by Asset Symbol</h3>
        {reportData.rows.length > 0 ? (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Ticker Symbol</th>
                  <th>Trades Matched</th>
                  <th>Total Vol Traded</th>
                  <th>Accumulated Cost Basis</th>
                  <th>Accumulated Proceeds</th>
                  <th>Net Realized PnL</th>
                </tr>
              </thead>
              <tbody>
                {reportData.rows.map((row) => (
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
    </div>
  );
}
