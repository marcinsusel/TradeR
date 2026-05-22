import React, { useState, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { parseCSVText, autoDetectHeaders, computeFingerprint, formatToISODate } from '../utils/csvParser';
import { Upload, AlertCircle, Check, Info, FileSpreadsheet, Sparkles, Columns } from 'lucide-react';

export default function Importer() {
  const { transactions, importTransactions } = useApp();
  const fileInputRef = useRef(null);
  
  // Importer state
  const [wizardStep, setWizardStep] = useState('select_file'); // 'select_file' | 'map_headers' | 'review'
  const [fileName, setFileName] = useState('');
  const [csvRows, setCsvRows] = useState([]);
  
  // Mapping state
  const [headerRowIndex, setHeaderRowIndex] = useState(0);
  const [mappings, setMappings] = useState({
    date: -1,
    symbol: -1,
    type: -1,
    quantity: -1,
    price: -1,
    fees: -1,
    amount: -1
  });

  // Review state
  const [parsedTxns, setParsedTxns] = useState([]); // Array of standardized txns
  const [selectedTxnIds, setSelectedTxnIds] = useState(new Set());
  const [duplicateTxnIds, setDuplicateTxnIds] = useState(new Set());
  const [showOnlyNew, setShowOnlyNew] = useState(true);
  const [importResult, setImportResult] = useState(null); // { count: number }

  // Drag and drop / file load handlers
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const processFile = (file) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const rows = parseCSVText(text);
      setCsvRows(rows);
      
      // Auto-detect headers
      const autoMatch = autoDetectHeaders(rows);
      if (autoMatch) {
        setHeaderRowIndex(autoMatch.headerRowIndex);
        
        // Fill out mappings
        const newMappings = { ...mappings };
        Object.keys(autoMatch.mappings).forEach(field => {
          newMappings[field] = autoMatch.mappings[field];
        });
        setMappings(newMappings);
        
        // Generate and go straight to review
        const generated = generateTransactions(rows, autoMatch.headerRowIndex, newMappings);
        setupReview(generated);
      } else {
        // Fallback to manual mapping step
        setWizardStep('map_headers');
      }
    };
    reader.readAsText(file);
  };

  const triggerSelectFile = () => {
    fileInputRef.current?.click();
  };

  // Generate standardized transaction structures from mappings
  const generateTransactions = (rows, headerIdx, currentMappings) => {
    const dataRows = rows.slice(headerIdx + 1);
    
    return dataRows.map((row, index) => {
      // Extract mapped columns
      const rawDate = currentMappings.date !== -1 ? row[currentMappings.date] : '';
      const rawSymbol = currentMappings.symbol !== -1 ? row[currentMappings.symbol] : '';
      const rawType = currentMappings.type !== -1 ? row[currentMappings.type] : '';
      const rawQty = currentMappings.quantity !== -1 ? row[currentMappings.quantity] : '';
      const rawPrice = currentMappings.price !== -1 ? row[currentMappings.price] : '';
      const rawFees = currentMappings.fees !== -1 ? row[currentMappings.fees] : '0';
      const rawAmount = currentMappings.amount !== -1 ? row[currentMappings.amount] : '';

      // Standardize fields
      const date = formatToISODate(rawDate);
      const symbol = rawSymbol ? rawSymbol.trim().toUpperCase() : '';
      const quantity = Math.abs(parseFloat(rawQty)) || 0;
      const price = parseFloat(rawPrice) || 0;
      const fees = Math.abs(parseFloat(rawFees)) || 0;
      const amount = parseFloat(rawAmount) || 0;

      // Determine type based on raw action text and quantity sign
      let type = parseFloat(rawQty) < 0 ? 'SELL' : 'BUY';
      const cleanType = rawType.toUpperCase();
      if (cleanType.includes('SELL') || cleanType.includes('SOLD') || cleanType.includes('ASSIGN')) {
        type = 'SELL';
      } else if (cleanType.includes('BUY') || cleanType.includes('BOUGHT')) {
        type = 'BUY';
      }

      // Proportional or computed net amount if missing
      const calculatedAmount = amount || (type === 'SELL' ? (quantity * price - fees) : -(quantity * price + fees));

      const tempTxn = {
        date,
        symbol,
        type,
        quantity,
        price,
        commission: fees,
        amount: calculatedAmount,
        activityType: rawType || type,
        note: `Imported from ${fileName}`
      };

      // Generate stable fingerprint hash
      const fingerprint = computeFingerprint(tempTxn);

      return {
        id: fingerprint,
        ...tempTxn
      };
    }).filter(t => t.date && t.symbol && t.quantity > 0 && t.price > 0);
  };

  const setupReview = (generatedTxns) => {
    // Determine duplicates
    const existingIds = new Set(transactions.map(t => t.id));
    const duplicates = new Set();
    const checked = new Set();

    generatedTxns.forEach(t => {
      if (existingIds.has(t.id)) {
        duplicates.add(t.id);
      } else {
        checked.add(t.id); // Check new ones by default
      }
    });

    setParsedTxns(generatedTxns);
    setSelectedTxnIds(checked);
    setDuplicateTxnIds(duplicates);
    setWizardStep('review');
  };

  // Mappings form changes handler
  const handleMappingChange = (field, colIndex) => {
    setMappings(prev => ({
      ...prev,
      [field]: parseInt(colIndex)
    }));
  };

  const applyManualMapping = () => {
    // Validate required fields
    const missing = [];
    if (mappings.date === -1) missing.push('Date');
    if (mappings.symbol === -1) missing.push('Symbol/Ticker');
    if (mappings.quantity === -1) missing.push('Quantity');
    if (mappings.price === -1) missing.push('Price');
    if (mappings.type === -1) missing.push('Transaction Type');

    if (missing.length > 0) {
      alert(`Please map the following required fields: ${missing.join(', ')}`);
      return;
    }

    const generated = generateTransactions(csvRows, headerRowIndex, mappings);
    setupReview(generated);
  };

  // Review checkboxes
  const handleToggleSelect = (id) => {
    setSelectedTxnIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = (check) => {
    if (check) {
      const visibleTxns = showOnlyNew 
        ? parsedTxns.filter(t => !duplicateTxnIds.has(t.id))
        : parsedTxns;
      setSelectedTxnIds(new Set(visibleTxns.map(t => t.id)));
    } else {
      setSelectedTxnIds(new Set());
    }
  };

  const executeImport = async () => {
    const toImport = parsedTxns.filter(t => selectedTxnIds.has(t.id));
    if (toImport.length === 0) {
      alert('No transactions selected.');
      return;
    }

    const count = await importTransactions(toImport);
    setImportResult({ count });
    setWizardStep('select_file');
    // Clear states
    setCsvRows([]);
    setFileName('');
  };

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(val);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h1 className="glow-text" style={{ fontSize: '2.25rem', marginBottom: '0.5rem' }}>Import Transactions</h1>
        <p style={{ color: 'var(--text-secondary)' }}>Upload CSV activity files exported from E*TRADE, Interactive Brokers, or other brokers.</p>
      </div>

      {importResult && (
        <div className="glass-panel-glow" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', background: 'rgba(16, 185, 129, 0.05)', border: '1px solid var(--color-success-border)' }}>
          <div style={{ background: 'var(--color-success-bg)', borderRadius: '50%', padding: '0.5rem' }}>
            <Check size={20} className="gain-text" />
          </div>
          <div>
            <h4 style={{ color: 'var(--color-success)' }}>Import Complete</h4>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
              Successfully imported <strong>{importResult.count}</strong> new transactions. Duplicates were automatically skipped.
            </p>
          </div>
          <button className="btn btn-secondary" style={{ marginLeft: 'auto' }} onClick={() => setImportResult(null)}>Dismiss</button>
        </div>
      )}

      {/* Step 1: Select File */}
      {wizardStep === 'select_file' && (
        <div className="glass-panel" style={{
          padding: '4rem 2rem',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1.5rem',
          borderStyle: 'dashed',
          borderColor: 'rgba(255,255,255,0.15)'
        }}>
          <div style={{
            background: 'rgba(99,102,241,0.06)',
            border: '1px solid var(--border-glow)',
            padding: '1.5rem',
            borderRadius: '50%',
            color: 'var(--color-primary)'
          }}>
            <Upload size={40} />
          </div>
          <div style={{ textAlign: 'center' }}>
            <h3>Drag and drop your transaction CSV here</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.5rem' }}>
              Or click to browse files from your computer
            </p>
          </div>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            accept=".csv" 
            style={{ display: 'none' }} 
          />
          <button className="btn btn-primary" onClick={triggerSelectFile}>
            Select CSV File
          </button>
          
          <div style={{ display: 'flex', gap: '2rem', marginTop: '2rem', borderTop: '1px solid var(--border-color)', paddingTop: '2rem', width: '100%', maxWidth: '600px', justifyContent: 'center' }}>
            <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              <Sparkles size={16} style={{ color: 'var(--color-secondary)' }} />
              <span>Automatic duplicate prevention</span>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              <Columns size={16} style={{ color: 'var(--color-primary)' }} />
              <span>Supports custom CSV column mapping</span>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Manual Header Mapping */}
      {wizardStep === 'map_headers' && (
        <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <AlertCircle size={24} style={{ color: 'var(--color-warning)' }} />
            <div>
              <h3>Map CSV Columns</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                We couldn't automatically detect headers for <strong>{fileName}</strong>. Please map the columns manually.
              </p>
            </div>
          </div>

          {/* CSV Preview */}
          <div>
            <h4 style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>CSV File Preview (First 5 Rows)</h4>
            <div className="table-container" style={{ maxHeight: '180px' }}>
              <table>
                <tbody>
                  {csvRows.slice(0, 5).map((row, rIdx) => (
                    <tr key={rIdx} style={rIdx === headerRowIndex ? { background: 'rgba(99, 102, 241, 0.1)' } : {}}>
                      <td style={{ fontWeight: 'bold', color: 'var(--text-muted)', width: '50px' }}>Row {rIdx}</td>
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} style={{ whiteSpace: 'nowrap' }}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.75rem' }}>
              <label className="form-label" style={{ margin: 0 }}>Select Header Row:</label>
              <select 
                className="form-input" 
                style={{ width: '120px' }}
                value={headerRowIndex}
                onChange={(e) => setHeaderRowIndex(parseInt(e.target.value))}
              >
                {csvRows.slice(0, 10).map((_, idx) => (
                  <option key={idx} value={idx}>Row {idx}</option>
                ))}
              </select>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                * Highly recommended to select the row containing the column titles.
              </span>
            </div>
          </div>

          {/* Mapping dropdowns */}
          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
            <h4 style={{ marginBottom: '1rem' }}>Assign Columns to Standard Fields</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.25rem' }}>
              {/* Required Mappings */}
              <div className="form-group">
                <label className="form-label">Date (Required)</label>
                <select className="form-input" value={mappings.date} onChange={(e) => handleMappingChange('date', e.target.value)}>
                  <option value={-1}>-- Select Column --</option>
                  {csvRows[headerRowIndex]?.map((h, i) => <option key={i} value={i}>Col {i}: {h || '(empty)'}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Ticker Symbol (Required)</label>
                <select className="form-input" value={mappings.symbol} onChange={(e) => handleMappingChange('symbol', e.target.value)}>
                  <option value={-1}>-- Select Column --</option>
                  {csvRows[headerRowIndex]?.map((h, i) => <option key={i} value={i}>Col {i}: {h || '(empty)'}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Transaction Type / Action (Required)</label>
                <select className="form-input" value={mappings.type} onChange={(e) => handleMappingChange('type', e.target.value)}>
                  <option value={-1}>-- Select Column --</option>
                  {csvRows[headerRowIndex]?.map((h, i) => <option key={i} value={i}>Col {i}: {h || '(empty)'}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Quantity / Shares (Required)</label>
                <select className="form-input" value={mappings.quantity} onChange={(e) => handleMappingChange('quantity', e.target.value)}>
                  <option value={-1}>-- Select Column --</option>
                  {csvRows[headerRowIndex]?.map((h, i) => <option key={i} value={i}>Col {i}: {h || '(empty)'}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Price Per Share (Required)</label>
                <select className="form-input" value={mappings.price} onChange={(e) => handleMappingChange('price', e.target.value)}>
                  <option value={-1}>-- Select Column --</option>
                  {csvRows[headerRowIndex]?.map((h, i) => <option key={i} value={i}>Col {i}: {h || '(empty)'}</option>)}
                </select>
              </div>

              {/* Optional Mappings */}
              <div className="form-group">
                <label className="form-label">Commission / Fees (Optional)</label>
                <select className="form-input" value={mappings.fees} onChange={(e) => handleMappingChange('fees', e.target.value)}>
                  <option value={-1}>-- None --</option>
                  {csvRows[headerRowIndex]?.map((h, i) => <option key={i} value={i}>Col {i}: {h || '(empty)'}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Total Amount / Net Cash (Optional)</label>
                <select className="form-input" value={mappings.amount} onChange={(e) => handleMappingChange('amount', e.target.value)}>
                  <option value={-1}>-- Auto-Compute (Qty * Price) --</option>
                  {csvRows[headerRowIndex]?.map((h, i) => <option key={i} value={i}>Col {i}: {h || '(empty)'}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem', justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={() => setWizardStep('select_file')}>Cancel</button>
            <button className="btn btn-primary" onClick={applyManualMapping}>Process Transactions</button>
          </div>
        </div>
      )}

      {/* Step 3: Review Transactions / Check Duplicates */}
      {wizardStep === 'review' && (
        <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h3>Review and Confirm Import</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                We parsed <strong>{parsedTxns.length}</strong> transactions from {fileName}. Review and filter duplicates.
              </p>
            </div>
            
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.03)', padding: '0.5rem 1rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                <input 
                  type="checkbox" 
                  id="showOnlyNew" 
                  checked={showOnlyNew} 
                  onChange={(e) => setShowOnlyNew(e.target.checked)} 
                />
                <label htmlFor="showOnlyNew" style={{ fontSize: '0.875rem', cursor: 'pointer' }}>Hide Duplicates</label>
              </div>
              <button className="btn btn-secondary" onClick={() => setWizardStep('select_file')}>Discard</button>
              <button className="btn btn-primary" onClick={executeImport}>
                Import Selected ({selectedTxnIds.size})
              </button>
            </div>
          </div>

          {/* Stats Bar */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <div style={{ textAlign: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total Found</span>
              <h4 style={{ fontSize: '1.25rem', marginTop: '0.25rem' }}>{parsedTxns.length}</h4>
            </div>
            <div style={{ textAlign: 'center', borderLeft: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Already in Database (Duplicates)</span>
              <h4 className="loss-text" style={{ fontSize: '1.25rem', marginTop: '0.25rem' }}>{duplicateTxnIds.size}</h4>
            </div>
            <div style={{ textAlign: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>New to Import</span>
              <h4 className="gain-text" style={{ fontSize: '1.25rem', marginTop: '0.25rem' }}>{parsedTxns.length - duplicateTxnIds.size}</h4>
            </div>
          </div>

          {/* Transactions Table */}
          <div className="table-container" style={{ maxHeight: '400px' }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: '40px' }}>
                    <input 
                      type="checkbox" 
                      onChange={(e) => handleSelectAll(e.target.checked)} 
                      checked={
                        showOnlyNew
                          ? parsedTxns.filter(t => !duplicateTxnIds.has(t.id)).length > 0 && 
                            parsedTxns.filter(t => !duplicateTxnIds.has(t.id)).every(t => selectedTxnIds.has(t.id))
                          : parsedTxns.length > 0 && parsedTxns.every(t => selectedTxnIds.has(t.id))
                      }
                    />
                  </th>
                  <th>Date</th>
                  <th>Ticker</th>
                  <th>Type</th>
                  <th>Quantity</th>
                  <th>Price</th>
                  <th>Fees</th>
                  <th>Net Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {parsedTxns
                  .filter(t => !showOnlyNew || !duplicateTxnIds.has(t.id))
                  .map((t) => {
                    const isDup = duplicateTxnIds.has(t.id);
                    return (
                      <tr key={t.id} style={isDup ? { opacity: 0.5, background: 'rgba(244,63,94,0.02)' } : {}}>
                        <td>
                          <input 
                            type="checkbox" 
                            checked={selectedTxnIds.has(t.id)} 
                            onChange={() => handleToggleSelect(t.id)}
                          />
                        </td>
                        <td>{t.date}</td>
                        <td style={{ fontWeight: '600' }}>{t.symbol}</td>
                        <td>
                          <span className={`badge ${t.type === 'BUY' ? 'badge-success' : 'badge-danger'}`}>
                            {t.type}
                          </span>
                        </td>
                        <td>{t.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                        <td>{formatCurrency(t.price)}</td>
                        <td>{formatCurrency(t.commission)}</td>
                        <td style={{ fontWeight: '500' }}>
                          {formatCurrency(t.amount)}
                        </td>
                        <td>
                          {isDup ? (
                            <span className="badge badge-danger" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', width: 'fit-content' }}>
                              <AlertCircle size={10} /> Duplicate (Will Skip)
                            </span>
                          ) : (
                            <span className="badge badge-success">New</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
