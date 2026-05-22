/**
 * CSV Parsing Utilities
 */

/**
 * Standard CSV line parser that handles quotes and commas correctly.
 */
export function parseCSVText(text) {
  const lines = [];
  let row = [""];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];

    if (c === '"') {
      if (inQuotes && next === '"') {
        row[row.length - 1] += '"';
        i++; // skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      row.push("");
    } else if ((c === '\r' || c === '\n') && !inQuotes) {
      if (c === '\r' && next === '\n') {
        i++; // skip \n
      }
      lines.push(row.map(cell => cell.trim()));
      row = [""];
    } else {
      row[row.length - 1] += c;
    }
  }
  
  if (row.length > 1 || row[0] !== "") {
    lines.push(row.map(cell => cell.trim()));
  }

  // Filter out completely empty rows
  return lines.filter(line => line.length > 0 && line.some(cell => cell !== ""));
}

// Common headers mapped to standard fields
const FIELD_MAPPINGS = {
  date: ['date', 'activity/trade date', 'activity date', 'trade date', 'transaction date'],
  symbol: ['symbol', 'ticker', 'cusip', 'symbol/ticker'],
  type: ['type', 'transaction type', 'activity type', 'action', 'description'],
  quantity: ['quantity', 'qty', 'shares', 'quantity #', 'number of shares'],
  price: ['price', 'price $', 'unit price'],
  fees: ['commission', 'fees', 'fee', 'commission $', 'transaction fees'],
  amount: ['amount', 'amount $', 'net amount', 'gross amount', 'total', 'total amount']
};

/**
 * Tries to identify which row in the CSV contains headers and maps them.
 * Returns: { headerRowIndex, mappings: { field: columnIndex } } or null
 */
export function autoDetectHeaders(rows) {
  // We'll scan the first 15 rows to find the best header match
  const scanLimit = Math.min(rows.length, 15);
  let bestRowIndex = -1;
  let bestMappings = null;
  let maxMatchedFieldsCount = 0;

  for (let i = 0; i < scanLimit; i++) {
    const row = rows[i];
    const currentMappings = {};
    let matchedCount = 0;

    // Check each field's aliases against the row cells
    Object.keys(FIELD_MAPPINGS).forEach(field => {
      const aliases = FIELD_MAPPINGS[field];
      const colIndex = row.findIndex(cell => {
        const cleanCell = cell.toLowerCase().replace(/[^a-z0-9#$//\s]/g, '').trim();
        return aliases.some(alias => cleanCell === alias || cleanCell.includes(alias));
      });

      if (colIndex !== -1) {
        currentMappings[field] = colIndex;
        // Don't count fees/amount as critically required, but date, symbol, quantity, price, type are
        if (['date', 'symbol', 'quantity', 'price', 'type'].includes(field)) {
          matchedCount++;
        }
      }
    });

    if (matchedCount > maxMatchedFieldsCount) {
      maxMatchedFieldsCount = matchedCount;
      bestRowIndex = i;
      bestMappings = currentMappings;
    }
  }

  // We require at least Date, Symbol, and Quantity/Price/Type to auto-approve
  if (maxMatchedFieldsCount >= 3) {
    return {
      headerRowIndex: bestRowIndex,
      mappings: bestMappings
    };
  }

  return null;
}

/**
 * Computes a stable fingerprint hash for a transaction row to prevent duplicates.
 */
export function computeFingerprint(txn) {
  const date = txn.date ? txn.date.trim() : '';
  const symbol = txn.symbol ? txn.symbol.trim().toUpperCase() : '';
  const type = txn.type ? txn.type.trim().toUpperCase() : '';
  const quantity = txn.quantity ? parseFloat(txn.quantity).toFixed(4) : '0';
  const price = txn.price ? parseFloat(txn.price).toFixed(4) : '0';
  const amount = txn.amount ? parseFloat(txn.amount).toFixed(2) : '0';
  const fees = txn.fees ? parseFloat(txn.fees).toFixed(2) : '0';

  // Join by separator
  const rawString = `${date}|${symbol}|${type}|${quantity}|${price}|${fees}|${amount}`;
  
  // A simple hash function to keep fingerprint short and readable
  let hash = 0;
  for (let i = 0; i < rawString.length; i++) {
    const char = rawString.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `tr-${Math.abs(hash).toString(16)}`;
}

/**
 * Formats clean Date string to YYYY-MM-DD
 */
export function formatToISODate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    // If Date constructor fails, try manually parsing MM/DD/YY or YY-MM-DD
    const parts = dateStr.split(/[-/]/);
    if (parts.length === 3) {
      let m = parseInt(parts[0]);
      let day = parseInt(parts[1]);
      let y = parseInt(parts[2]);
      
      // If it's MM/DD/YYYY or MM/DD/YY
      if (m > 12) {
        // Could be YYYY-MM-DD
        y = parseInt(parts[0]);
        m = parseInt(parts[1]);
        day = parseInt(parts[2]);
      }

      if (y < 100) {
        y += y > 50 ? 1900 : 2000; // rough 2 digit year mapping
      }

      const pad = (n) => String(n).padStart(2, '0');
      if (!isNaN(y) && !isNaN(m) && !isNaN(day)) {
        return `${y}-${pad(m)}-${pad(day)}`;
      }
    }
    return dateStr; // Fallback
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
