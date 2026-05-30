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

const FIELD_MAPPINGS = {
  date: ['date', 'activity/trade date', 'activity date', 'trade date', 'transaction date'],
  symbol: ['symbol', 'ticker', 'cusip', 'symbol/ticker'],
  type: ['type', 'transaction type', 'activity type', 'action'],
  description: ['description', 'desc', 'activity description'],
  quantity: ['quantity', 'qty', 'shares', 'quantity #', 'number of shares'],
  price: ['price', 'price $', 'unit price'],
  fees: ['commission', 'fees', 'fee', 'commission $', 'transaction fees'],
  amount: ['net amount', 'amount', 'amount $', 'total', 'total amount']
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

    Object.keys(FIELD_MAPPINGS).forEach(field => {
      const aliases = FIELD_MAPPINGS[field];
      let colIndex = -1;
      for (const alias of aliases) {
        colIndex = row.findIndex(cell => {
          const cleanCell = cell.toLowerCase().replace(/[^a-z0-9#$//\s]/g, '').trim();
          return cleanCell === alias || cleanCell.includes(alias);
        });
        if (colIndex !== -1) break;
      }

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
  const feesVal = txn.fees !== undefined ? txn.fees : txn.commission;
  const fees = feesVal ? parseFloat(feesVal).toFixed(2) : '0';

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
  
  // Try clean manual digit parsing first to avoid all JS timezone/UTC conversion bugs
  const digits = dateStr.match(/\d+/g);
  if (digits && digits.length >= 3) {
    let year = 0;
    let month = 0;
    let day = 0;
    
    const part1 = digits[0];
    const part2 = digits[1];
    const part3 = digits[2];
    
    if (part1.length === 4) {
      // YYYY-MM-DD or YYYY/MM/DD
      year = parseInt(part1);
      month = parseInt(part2);
      day = parseInt(part3);
    } else if (part3.length === 4) {
      // MM/DD/YYYY or DD/MM/YYYY
      year = parseInt(part3);
      const val1 = parseInt(part1);
      const val2 = parseInt(part2);
      
      if (val1 > 12) {
        // DD/MM/YYYY
        day = val1;
        month = val2;
      } else {
        // MM/DD/YYYY
        month = val1;
        day = val2;
      }
    } else {
      // MM/DD/YY or DD/MM/YY
      let y = parseInt(part3);
      year = y + (y > 50 ? 1900 : 2000);
      const val1 = parseInt(part1);
      const val2 = parseInt(part2);
      
      if (val1 > 12) {
        day = val1;
        month = val2;
      } else {
        month = val1;
        day = val2;
      }
    }
    
    const pad = (n) => String(n).padStart(2, '0');
    if (!isNaN(year) && !isNaN(month) && !isNaN(day) && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${pad(month)}-${pad(day)}`;
    }
  }
  
  // Fallback to JS Date constructor for text-based dates like "May 25, 2026"
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) {
    const isISO = dateStr.includes('-') && !dateStr.includes('/') && !/[a-zA-Z]/.test(dateStr);
    
    const year = isISO ? d.getUTCFullYear() : d.getFullYear();
    const month = String((isISO ? d.getUTCMonth() : d.getMonth()) + 1).padStart(2, '0');
    const day = String(isISO ? d.getUTCDate() : d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  return dateStr;
}
