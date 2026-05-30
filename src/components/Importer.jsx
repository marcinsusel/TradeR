import React, { useState, useRef, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { parseCSVText, autoDetectHeaders, computeFingerprint, formatToISODate } from '../utils/csvParser';
import { Upload, AlertCircle, Check, Info, FileSpreadsheet, Sparkles, Columns, ChevronDown, ChevronUp } from 'lucide-react';

// Utility helpers for option contract details extraction (OPRA format)
function isCallOption(symbol, description) {
  const sym = String(symbol).toUpperCase().replace(/\s+/g, '');
  const desc = String(description).toUpperCase();
  // Check standard OPRA option symbol format: e.g., RIVN251107C00014000
  const match = sym.match(/\d{6}([CP])\d{8}$/);
  if (match) {
    return match[1] === 'C';
  }
  // Fallback to description heuristics
  if (desc.includes(' CALL') || desc.endsWith(' C') || desc.includes(' CALL ')) return true;
  if (desc.includes(' PUT') || desc.endsWith(' P') || desc.includes(' PUT ')) return false;
  return false;
}

function getOptionStrike(symbol, description) {
  const sym = String(symbol).toUpperCase().replace(/\s+/g, '');
  // Standard OPRA format: last 8 digits represent strike * 1000
  const match = sym.match(/\d{6}[CP](\d{8})$/);
  if (match) {
    return parseFloat(match[1]) / 1000;
  }
  // Fallback: description parsing
  const parts = String(description).toUpperCase().split(/\s+/);
  const cIndex = parts.indexOf('C');
  const pIndex = parts.indexOf('P');
  const targetIndex = cIndex !== -1 ? cIndex - 1 : (pIndex !== -1 ? pIndex - 1 : -1);
  if (targetIndex >= 0 && parts[targetIndex]) {
    const val = parseFloat(parts[targetIndex]);
    if (!isNaN(val)) return val;
  }
  return null;
}

function getOptionTickerDate(symbol) {
  const sym = String(symbol).toUpperCase().replace(/\s+/g, '');
  // Extracts the 6-digit YYMMDD date from the standard option format
  const match = sym.match(/(\d{6})[CP]\d{8}$/);
  if (match) {
    const yy = match[1].slice(0, 2);
    const mm = match[1].slice(2, 4);
    const dd = match[1].slice(4, 6);
    const year = 2000 + parseInt(yy);
    const month = parseInt(mm) - 1; // 0-indexed in JS
    const day = parseInt(dd);
    return new Date(year, month, day);
  }
  return null;
}

export default function Importer() {
  const { transactions, importTransactions, updateTransactions, isDuplicateTransaction } = useApp();
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
    description: -1,
    quantity: -1,
    price: -1,
    fees: -1,
    amount: -1
  });

  // Review state
  const [parsedTxns, setParsedTxns] = useState([]); // Array of standardized txns
  const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'asc' });

  const sortedParsedTxns = useMemo(() => {
    const data = [...parsedTxns];
    if (!sortConfig) return data;
    const { key, direction } = sortConfig;

    data.sort((a, b) => {
      let valA = a[key];
      let valB = b[key];

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

    return data;
  }, [parsedTxns, sortConfig]);

  const handleSort = (key) => {
    setSortConfig(prev => {
      if (prev && prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  const [selectedTxnIds, setSelectedTxnIds] = useState(new Set());
  const [lastCheckedId, setLastCheckedId] = useState(null);
  const [duplicateTxnIds, setDuplicateTxnIds] = useState(new Set());
  const [showOnlyNew, setShowOnlyNew] = useState(true);
  const [importResult, setImportResult] = useState(null); // { count: number }
  const [expandedTxnIds, setExpandedTxnIds] = useState(new Set());

  const handleToggleExpandTxn = (id) => {
    setExpandedTxnIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

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
        
        // Generate and go straight to review, passing file.name explicitly to avoid state lag
        const generated = generateTransactions(rows, autoMatch.headerRowIndex, newMappings, file.name);
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
  const generateTransactions = (rows, headerIdx, currentMappings, name = fileName) => {
    const dataRows = rows.slice(headerIdx + 1);
    const fingerprintCounts = {};
    
    return dataRows.map((row, index) => {
      // Extract mapped columns
      const rawDate = currentMappings.date !== -1 ? row[currentMappings.date] : '';
      const rawSymbol = currentMappings.symbol !== -1 ? row[currentMappings.symbol] : '';
      const rawType = currentMappings.type !== -1 ? row[currentMappings.type] : '';
      const rawDesc = currentMappings.description !== -1 ? row[currentMappings.description] : '';
      const rawQty = currentMappings.quantity !== -1 ? row[currentMappings.quantity] : '';
      const rawPrice = currentMappings.price !== -1 ? row[currentMappings.price] : '';
      const rawFees = currentMappings.fees !== -1 ? row[currentMappings.fees] : '0';
      const rawAmount = currentMappings.amount !== -1 ? row[currentMappings.amount] : '';

      // Standardize fields
      const date = formatToISODate(rawDate);
      let symbol = rawSymbol ? rawSymbol.trim().toUpperCase() : '';
      if (symbol === '-' || symbol === '--') {
        symbol = '';
      }
      const quantity = Math.abs(parseFloat(rawQty)) || 0;
      const price = parseFloat(rawPrice) || 0;
      const fees = parseFloat(rawFees) || 0; // Preserve original CSV sign
      const amount = parseFloat(rawAmount) || 0;

      // Determine type based on raw action text and quantity sign
      let type = parseFloat(rawQty) < 0 ? 'SELL' : 'BUY';
      const cleanType = rawType.toUpperCase();
      
      const isFee = cleanType.includes('FEE') || cleanType === 'MISC';
      const isInterest = cleanType.includes('INTEREST') || cleanType === 'INT-ADJ' || cleanType.includes('INT ') || cleanType === 'DEBIT INTEREST' || cleanType === 'CREDIT INTEREST';
      const isTransfer = cleanType.includes('TRANSFER') || cleanType.includes('WIRE') || cleanType.includes('DEPOSIT') || cleanType.includes('WITHDRAW');
      const isDividend = cleanType.includes('DIVIDEND') || cleanType.includes('LIEU');

      if (isFee) {
        type = 'FEE';
      } else if (isInterest) {
        type = 'INTEREST';
      } else if (isTransfer) {
        type = 'TRANSFER';
      } else if (isDividend) {
        type = 'DIVIDEND';
      } else if (cleanType.includes('ASSIGN')) {
        // Option Assignments can be BUY (negative amount) or SELL (positive amount)
        if (amount < 0) {
          type = 'BUY';
        } else if (amount > 0) {
          type = 'SELL';
        } else {
          // Fallback to quantity sign
          type = parseFloat(rawQty) < 0 ? 'SELL' : 'BUY';
        }
      } else if (cleanType.includes('SELL') || cleanType.includes('SOLD')) {
        type = 'SELL';
      } else if (cleanType.includes('BUY') || cleanType.includes('BOUGHT')) {
        type = 'BUY';
      }

      // Ensure the amount has the correct sign based on transaction type if it's non-zero
      let signedAmount = amount;
      if (amount !== 0) {
        if (type === 'BUY' && signedAmount > 0) {
          signedAmount = -signedAmount;
        } else if (type === 'SELL' && signedAmount < 0) {
          signedAmount = -signedAmount;
        }
      }

      // Determine if mapped amount is gross or net, and calculate correct net amount
      const feeCharge = -fees; // Negative commission is a fee (positive charge), positive is a rebate (negative charge)
      let calculatedAmount = 0;
      if (signedAmount === 0) {
        // Computed net amount if missing
        calculatedAmount = type === 'SELL' ? (quantity * price - feeCharge) : -(quantity * price + feeCharge);
      } else {
        let isGross = false;
        const amountHeader = currentMappings.amount !== -1 ? (rows[headerIdx]?.[currentMappings.amount] || '') : '';
        const cleanHeader = amountHeader.toLowerCase();
        
        if (cleanHeader.includes('gross')) {
          isGross = true;
        } else if (cleanHeader.includes('net')) {
          isGross = false;
        } else {
          // Fallback mathematical heuristic to check if absolute amount matches gross options/stocks value
          const multiplier = symbol.trim().split(/\s+/).length === 2 ? 100 : 1;
          const calculatedGross = quantity * price * multiplier;
          const diffToGross = Math.abs(Math.abs(signedAmount) - calculatedGross);
          
          if (feeCharge > 0) {
            const diffToNet = Math.abs(diffToGross - feeCharge);
            if (diffToGross < diffToNet) {
              isGross = true;
            }
          }
        }
        
        calculatedAmount = isGross ? (signedAmount - feeCharge) : signedAmount;
      }

      // Check math discrepancy against statement amount
      const importedNetAmt = signedAmount;
      const isOff = (rawAmount !== '' && ['BUY', 'SELL'].includes(type))
        ? Math.abs(calculatedAmount - importedNetAmt) > 0.02
        : false;

      const rowName = `Row ${index + headerIdx + 1}`;
      const tempTxn = {
        date,
        symbol,
        type,
        quantity,
        price,
        commission: fees,
        amount: calculatedAmount,
        importedAmount: importedNetAmt,
        discrepancy: isOff,
        activityType: rawType || type,
        description: rawDesc ? rawDesc.trim() : '',
        note: `Imported from ${name}| ${rowName}|`
      };

      // Generate stable fingerprint hash
      const baseFingerprint = computeFingerprint(tempTxn);
      
      if (fingerprintCounts[baseFingerprint] === undefined) {
        fingerprintCounts[baseFingerprint] = 0;
      } else {
        fingerprintCounts[baseFingerprint] += 1;
      }
      
      const count = fingerprintCounts[baseFingerprint];
      const uniqueId = count === 0 ? baseFingerprint : `${baseFingerprint}-${count}`;

      return {
        id: uniqueId,
        rawRow: row, // Keep raw CSV row cells for preview verification
        ...tempTxn
      };
    }).filter(t => {
      if (!t.date) return false;
      if (['FEE', 'INTEREST', 'TRANSFER', 'DIVIDEND'].includes(t.type)) {
        return t.amount !== 0;
      }
      return t.symbol && t.quantity > 0 && t.price >= 0;
    });
  };

  const setupReview = (generatedTxns) => {
    // Auto-link option assignments to matching short call/put options
    const allTxnsPool = [...generatedTxns, ...transactions];

    generatedTxns.forEach(t => {
      const isAssignment = String(t.activityType || '').toUpperCase().includes('ASSIGN') || 
                           String(t.description || '').toUpperCase().includes('ASSIGN');
      if (isAssignment && ['BUY', 'SELL'].includes(t.type)) {
        const isCallAssignment = t.type === 'SELL';
        
        // Find matching options in the pool
        const matchedOptions = allTxnsPool.filter(opt => {
          const optSymbol = String(opt.symbol || '').trim();
          const parts = optSymbol.split(/\s+/);
          if (parts.length < 2) return false;
          
          const optionStock = parts[0];
          if (optionStock !== t.symbol) return false;
          
          if (opt.type !== 'SELL') return false;
          
          const callMatch = isCallOption(optSymbol, opt.description);
          if (isCallAssignment && !callMatch) return false; // Call assignment matches Call option
          if (!isCallAssignment && callMatch) return false; // Put assignment matches Put option
          
          const strike = getOptionStrike(optSymbol, opt.description);
          if (strike === null || Math.abs(strike - t.price) > 0.01) return false;
          
          const optDate = getOptionTickerDate(optSymbol);
          if (optDate) {
            const stockDate = new Date(t.date);
            const diffMs = Math.abs(optDate.getTime() - stockDate.getTime());
            const diffDays = diffMs / (1000 * 60 * 60 * 24);
            if (diffDays > 2) return false;
          } else {
            return false;
          }
          
          return true;
        });
        
        if (matchedOptions.length > 0) {
          const matchedIds = matchedOptions.map(o => o.id);
          t.linkedOptionTxnId = matchedIds.join(',');
          
          // Bidirectional linking: set assignedToStockTxnId on matching options inside generatedTxns in memory
          matchedOptions.forEach(opt => {
            const gtOpt = generatedTxns.find(gt => gt.id === opt.id);
            if (gtOpt) {
              const existingStockIds = gtOpt.assignedToStockTxnId ? gtOpt.assignedToStockTxnId.split(',').filter(Boolean) : [];
              if (!existingStockIds.includes(t.id)) {
                gtOpt.assignedToStockTxnId = [...existingStockIds, t.id].join(',');
              }
            }
          });
        } else {
          t.missingAssignmentLink = true;
        }
      }
    });

    // Determine duplicates using advanced duplicate prevention
    const duplicates = new Set();
    const checked = new Set();

    generatedTxns.forEach(t => {
      if (isDuplicateTransaction(t, transactions)) {
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
  const handleToggleSelect = (id, event) => {
    const isShiftPressed = event && (event.shiftKey || (event.nativeEvent && event.nativeEvent.shiftKey));
    
    const visibleTxns = showOnlyNew 
      ? parsedTxns.filter(t => !duplicateTxnIds.has(t.id))
      : parsedTxns;

    setSelectedTxnIds(prev => {
      const next = new Set(prev);
      const isChecking = !prev.has(id); // Clicking toggles the current state
      
      if (isShiftPressed && lastCheckedId) {
        const lastIdx = visibleTxns.findIndex(t => t.id === lastCheckedId);
        const currIdx = visibleTxns.findIndex(t => t.id === id);
        
        if (lastIdx !== -1 && currIdx !== -1) {
          const start = Math.min(lastIdx, currIdx);
          const end = Math.max(lastIdx, currIdx);
          
          for (let i = start; i <= end; i++) {
            const targetId = visibleTxns[i].id;
            if (isChecking) {
              next.add(targetId);
            } else {
              next.delete(targetId);
            }
          }
          return next;
        }
      }

      // Normal toggle
      if (isChecking) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });

    setLastCheckedId(id);
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

    // Strip rawRow and missingAssignmentLink so they are not persisted in the database
    const cleanToImport = toImport.map(t => {
      const { rawRow, missingAssignmentLink, ...cleanTxn } = t;
      return cleanTxn;
    });

    // Link newly imported transactions to existing options in the database
    let databaseUpdated = false;
    const updatedDbTxns = transactions.map(dbTxn => {
      const linkedImportTxn = cleanToImport.find(importTxn => 
        importTxn.linkedOptionTxnId && importTxn.linkedOptionTxnId.split(',').includes(dbTxn.id)
      );
      if (linkedImportTxn) {
        databaseUpdated = true;
        const existingStockIds = dbTxn.assignedToStockTxnId ? dbTxn.assignedToStockTxnId.split(',').filter(Boolean) : [];
        if (!existingStockIds.includes(linkedImportTxn.id)) {
          return {
            ...dbTxn,
            assignedToStockTxnId: [...existingStockIds, linkedImportTxn.id].join(',')
          };
        }
      }
      return dbTxn;
    });

    if (databaseUpdated) {
      await updateTransactions(updatedDbTxns);
    }

    const count = await importTransactions(cleanToImport);
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

  const totalNetAmount = parsedTxns
    .filter(t => selectedTxnIds.has(t.id))
    .reduce((sum, t) => sum + (t.amount || 0), 0);

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

              <div className="form-group">
                <label className="form-label">Transaction Description (Optional)</label>
                <select className="form-input" value={mappings.description} onChange={(e) => handleMappingChange('description', e.target.value)}>
                  <option value={-1}>-- None --</option>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <div style={{ textAlign: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total Found</span>
              <h4 style={{ fontSize: '1.25rem', marginTop: '0.25rem' }}>{parsedTxns.length}</h4>
            </div>
            <div style={{ textAlign: 'center', borderLeft: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Duplicates Skipped</span>
              <h4 className="loss-text" style={{ fontSize: '1.25rem', marginTop: '0.25rem' }}>{duplicateTxnIds.size}</h4>
            </div>
            <div style={{ textAlign: 'center', borderRight: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>New to Import</span>
              <h4 className="gain-text" style={{ fontSize: '1.25rem', marginTop: '0.25rem' }}>{parsedTxns.length - duplicateTxnIds.size}</h4>
            </div>
            <div style={{ textAlign: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Selected Net Flow</span>
              <h4 className={totalNetAmount >= 0 ? 'gain-text' : 'loss-text'} style={{ fontSize: '1.25rem', marginTop: '0.25rem' }}>
                {formatCurrency(totalNetAmount)}
              </h4>
            </div>
          </div>

          {/* Unlinked Option Assignment Alert Banner */}
          {parsedTxns.some(t => t.missingAssignmentLink && selectedTxnIds.has(t.id)) && (() => {
            const missingCount = parsedTxns.filter(t => t.missingAssignmentLink && selectedTxnIds.has(t.id)).length;
            return (
              <div 
                className="glass-panel" 
                style={{ 
                  padding: '1rem 1.25rem', 
                  background: 'rgba(234, 179, 8, 0.08)', 
                  border: '1px solid rgba(234, 179, 8, 0.25)', 
                  borderRadius: '8px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '0.75rem', 
                  color: '#eab308' 
                }}
              >
                <AlertCircle size={20} />
                <span style={{ fontSize: '0.85rem', fontWeight: '500' }}>
                  <strong>{missingCount} option assignment transaction{missingCount > 1 ? 's' : ''}</strong> were imported but could not be automatically linked to a matching short option contract in your records. You can link them manually later in the Audit Log.
                </span>
              </div>
            );
          })()}

          {/* Transactions Table */}
          <div className="table-container" style={{ maxHeight: '400px' }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: '30px' }}></th>
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
                  <th className="sortable" onClick={() => handleSort('date')}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <span>Date</span>
                      <span className="sort-icon" style={{ opacity: sortConfig?.key === 'date' ? 1 : 0.3 }}>
                        {sortConfig?.key === 'date' ? (
                          sortConfig.direction === 'asc' ? <ChevronUp size={14} style={{ color: 'var(--color-primary)' }} /> : <ChevronDown size={14} style={{ color: 'var(--color-primary)' }} />
                        ) : (
                          <ChevronDown size={14} style={{ opacity: 0.5 }} />
                        )}
                      </span>
                    </div>
                  </th>
                  <th className="sortable" onClick={() => handleSort('symbol')}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <span>Ticker</span>
                      <span className="sort-icon" style={{ opacity: sortConfig?.key === 'symbol' ? 1 : 0.3 }}>
                        {sortConfig?.key === 'symbol' ? (
                          sortConfig.direction === 'asc' ? <ChevronUp size={14} style={{ color: 'var(--color-primary)' }} /> : <ChevronDown size={14} style={{ color: 'var(--color-primary)' }} />
                        ) : (
                          <ChevronDown size={14} style={{ opacity: 0.5 }} />
                        )}
                      </span>
                    </div>
                  </th>
                  <th className="sortable" onClick={() => handleSort('type')}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <span>Type</span>
                      <span className="sort-icon" style={{ opacity: sortConfig?.key === 'type' ? 1 : 0.3 }}>
                        {sortConfig?.key === 'type' ? (
                          sortConfig.direction === 'asc' ? <ChevronUp size={14} style={{ color: 'var(--color-primary)' }} /> : <ChevronDown size={14} style={{ color: 'var(--color-primary)' }} />
                        ) : (
                          <ChevronDown size={14} style={{ opacity: 0.5 }} />
                        )}
                      </span>
                    </div>
                  </th>
                  <th className="sortable" onClick={() => handleSort('quantity')}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <span>Quantity</span>
                      <span className="sort-icon" style={{ opacity: sortConfig?.key === 'quantity' ? 1 : 0.3 }}>
                        {sortConfig?.key === 'quantity' ? (
                          sortConfig.direction === 'asc' ? <ChevronUp size={14} style={{ color: 'var(--color-primary)' }} /> : <ChevronDown size={14} style={{ color: 'var(--color-primary)' }} />
                        ) : (
                          <ChevronDown size={14} style={{ opacity: 0.5 }} />
                        )}
                      </span>
                    </div>
                  </th>
                  <th className="sortable" onClick={() => handleSort('price')}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <span>Price</span>
                      <span className="sort-icon" style={{ opacity: sortConfig?.key === 'price' ? 1 : 0.3 }}>
                        {sortConfig?.key === 'price' ? (
                          sortConfig.direction === 'asc' ? <ChevronUp size={14} style={{ color: 'var(--color-primary)' }} /> : <ChevronDown size={14} style={{ color: 'var(--color-primary)' }} />
                        ) : (
                          <ChevronDown size={14} style={{ opacity: 0.5 }} />
                        )}
                      </span>
                    </div>
                  </th>
                  <th className="sortable" onClick={() => handleSort('commission')}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <span>Fees</span>
                      <span className="sort-icon" style={{ opacity: sortConfig?.key === 'commission' ? 1 : 0.3 }}>
                        {sortConfig?.key === 'commission' ? (
                          sortConfig.direction === 'asc' ? <ChevronUp size={14} style={{ color: 'var(--color-primary)' }} /> : <ChevronDown size={14} style={{ color: 'var(--color-primary)' }} />
                        ) : (
                          <ChevronDown size={14} style={{ opacity: 0.5 }} />
                        )}
                      </span>
                    </div>
                  </th>
                  <th className="sortable" onClick={() => handleSort('amount')}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <span>Net Amount</span>
                      <span className="sort-icon" style={{ opacity: sortConfig?.key === 'amount' ? 1 : 0.3 }}>
                        {sortConfig?.key === 'amount' ? (
                          sortConfig.direction === 'asc' ? <ChevronUp size={14} style={{ color: 'var(--color-primary)' }} /> : <ChevronDown size={14} style={{ color: 'var(--color-primary)' }} />
                        ) : (
                          <ChevronDown size={14} style={{ opacity: 0.5 }} />
                        )}
                      </span>
                    </div>
                  </th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {sortedParsedTxns
                  .filter(t => !showOnlyNew || !duplicateTxnIds.has(t.id))
                  .map((t) => {
                    const isDup = duplicateTxnIds.has(t.id);
                    const isExpanded = expandedTxnIds.has(t.id);
                    return (
                      <React.Fragment key={t.id}>
                        <tr 
                          style={isDup ? { opacity: 0.5, background: 'rgba(244,63,94,0.02)', cursor: 'pointer' } : { cursor: 'pointer' }}
                          onClick={() => handleToggleExpandTxn(t.id)}
                        >
                          <td onClick={(e) => e.stopPropagation()}>
                            <button
                              style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'inherit', padding: '0.25rem' }}
                              onClick={() => handleToggleExpandTxn(t.id)}
                            >
                              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>
                          </td>
                          <td onClick={(e) => e.stopPropagation()}>
                            <input 
                              type="checkbox" 
                              checked={selectedTxnIds.has(t.id)} 
                              onChange={(e) => handleToggleSelect(t.id, e)}
                            />
                          </td>
                          <td>{t.date}</td>
                          <td>
                            <div style={{ fontWeight: '600' }}>{t.symbol || '-'}</div>
                            {t.description && (
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 'normal', marginTop: '0.15rem', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.description}>
                                {t.description}
                              </div>
                            )}
                          </td>
                          <td>
                            {t.type === 'BUY' && <span className="badge badge-success">BUY</span>}
                            {t.type === 'SELL' && <span className="badge badge-danger">SELL</span>}
                            {t.type === 'FEE' && <span className="badge badge-warning">FEE</span>}
                            {t.type === 'INTEREST' && (
                              <span className="badge" style={{ background: 'rgba(6, 182, 212, 0.1)', color: 'var(--color-secondary)', border: '1px solid rgba(6, 182, 212, 0.2)' }}>
                                INTEREST
                              </span>
                            )}
                            {t.type === 'TRANSFER' && (
                              <span className="badge" style={{ background: 'rgba(99, 102, 241, 0.1)', color: 'var(--color-primary)', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                                TRANSFER
                              </span>
                            )}
                            {t.type === 'DIVIDEND' && (
                              <span className="badge badge-success">
                                DIVIDEND
                              </span>
                            )}
                          </td>
                          <td>{['FEE', 'INTEREST', 'TRANSFER', 'DIVIDEND'].includes(t.type) ? '-' : t.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                          <td>{['FEE', 'INTEREST', 'TRANSFER', 'DIVIDEND'].includes(t.type) ? '-' : formatCurrency(t.price)}</td>
                          <td>{['FEE', 'INTEREST', 'TRANSFER', 'DIVIDEND'].includes(t.type) ? '-' : formatCurrency(t.commission)}</td>
                          <td style={{ fontWeight: '500' }}>
                            {formatCurrency(t.amount)}
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                              {isDup ? (
                                <span className="badge badge-danger" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', width: 'fit-content' }}>
                                  <AlertCircle size={10} /> Duplicate (Will Skip)
                                </span>
                              ) : (
                                <span className="badge badge-success" style={{ width: 'fit-content' }}>New</span>
                              )}
                              {t.discrepancy && (
                                <span className="badge badge-warning" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', width: 'fit-content' }}>
                                  ⚠️ Discrepancy
                                </span>
                              )}
                              {t.missingAssignmentLink && (
                                <span className="badge badge-warning" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', width: 'fit-content', background: 'rgba(234, 179, 8, 0.1)', color: '#eab308', border: '1px solid rgba(234, 179, 8, 0.2)' }}>
                                  ⚠️ Unlinked Option
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                        {isExpanded && t.rawRow && (
                          <tr style={{ background: 'rgba(255, 255, 255, 0.01)' }}>
                            <td colSpan={10} style={{ padding: '0.75rem 1rem 0.75rem 2.5rem' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {t.discrepancy && (
                                  <div style={{
                                    background: 'rgba(245, 158, 11, 0.06)',
                                    border: '1px solid rgba(245, 158, 11, 0.2)',
                                    borderRadius: '4px',
                                    padding: '0.75rem',
                                    color: 'var(--color-warning)',
                                    fontSize: '0.75rem',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '0.25rem'
                                  }}>
                                    <div style={{ fontWeight: '700', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                      ⚠️ Net Amount Discrepancy Warning
                                    </div>
                                    <div>
                                      The calculated net amount (<strong>{formatCurrency(t.amount)}</strong>) based on quantity, price, and commission does not match the statement's raw imported net amount (<strong>{formatCurrency(t.importedAmount)}</strong>).
                                    </div>
                                    <div style={{ fontSize: '0.7rem', opacity: 0.8 }}>
                                      Please verify if the CSV column mappings, commission charges/rebates signs, or transaction amounts are correct.
                                    </div>
                                  </div>
                                )}

                                {t.missingAssignmentLink && (
                                  <div style={{
                                    background: 'rgba(234, 179, 8, 0.06)',
                                    border: '1px solid rgba(234, 179, 8, 0.2)',
                                    borderRadius: '4px',
                                    padding: '0.75rem',
                                    color: '#eab308',
                                    fontSize: '0.75rem',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '0.25rem'
                                  }}>
                                    <div style={{ fontWeight: '700', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                      ⚠️ Option Assignment Unlinked Warning
                                    </div>
                                    <div>
                                      This transaction represents a stock {t.type === 'SELL' ? 'sale' : 'purchase'} resulting from an option assignment, but no matching short {t.type === 'SELL' ? 'call' : 'put'} option transaction was found.
                                    </div>
                                    <div style={{ fontSize: '0.7rem', opacity: 0.8 }}>
                                      Without a matching short option link, tax calculations will not be able to offset stock cost basis (for puts) or proceeds (for calls) with the option premium. You can link them manually later inside the Audit Log.
                                    </div>
                                  </div>
                                )}
                                
                                <div style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--color-primary)' }}>
                                  Raw CSV Row Preview
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', fontSize: '0.725rem' }}>
                                  {t.rawRow.map((cell, cellIdx) => {
                                    const isMapped = Object.values(mappings).includes(cellIdx);
                                    const headerName = csvRows[headerRowIndex]?.[cellIdx] || `Col ${cellIdx}`;
                                    return (
                                      <div 
                                        key={cellIdx}
                                        style={{
                                          background: isMapped ? 'var(--color-primary-glow)' : 'rgba(255,255,255,0.03)',
                                          border: `1px solid ${isMapped ? 'var(--color-primary)' : 'var(--border-color)'}`,
                                          padding: '0.25rem 0.5rem',
                                          borderRadius: '4px',
                                          color: isMapped ? 'var(--text-primary)' : 'var(--text-muted)'
                                        }}
                                      >
                                        <span style={{ fontWeight: '500', color: isMapped ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                                          {headerName}:
                                        </span>{' '}
                                        {cell || <span style={{ fontStyle: 'italic', opacity: 0.5 }}>(empty)</span>}
                                      </div>
                                    );
                                  })}
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
        </div>
      )}
    </div>
  );
}
