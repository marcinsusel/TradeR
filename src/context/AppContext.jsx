import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { syncAndLoadDatabase, saveDatabaseToDrive, initOAuthClient, syncAndLoadSpreadsheet, saveTransactionsToSpreadsheet, findFolder } from '../utils/googleDrive';
import { computeTrades } from '../utils/tradeMatcher';

const AppContext = createContext();

export function useApp() {
  return useContext(AppContext);
}

export function deduplicateDatabaseIds(txns) {
  if (!Array.isArray(txns)) return [];
  const seenIds = {};
  return txns.map((t, idx) => {
    const baseId = t.id || `txn-${idx}-${t.date}-${t.symbol}-${Math.abs(parseFloat(t.quantity || 0))}`;
    if (seenIds[baseId] === undefined) {
      seenIds[baseId] = 0;
      if (t.id !== baseId) {
        return { ...t, id: baseId };
      }
      return t;
    } else {
      seenIds[baseId] += 1;
      return { ...t, id: `${baseId}-${seenIds[baseId]}` };
    }
  });
}

export function isDuplicateTransaction(incoming, dbTxns) {
  if (!Array.isArray(dbTxns) || !incoming) return false;

  // 1. Direct ID match
  if (dbTxns.some(t => t.id === incoming.id)) {
    return true;
  }

  // 2. Composite field check: match Core transaction fields and either date or importedDate
  const incomingQty = Math.abs(parseFloat(incoming.quantity || 0));
  const incomingPrice = parseFloat(incoming.price || 0);
  const incomingAmount = parseFloat(incoming.amount || 0);
  const incomingComm = parseFloat(incoming.commission !== undefined ? incoming.commission : (incoming.fees || 0));

  return dbTxns.some(t => {
    if (t.symbol?.toUpperCase() !== incoming.symbol?.toUpperCase()) return false;
    if (t.type?.toUpperCase() !== incoming.type?.toUpperCase()) return false;

    // Compare numeric values with a small tolerance
    if (Math.abs(Math.abs(parseFloat(t.quantity || 0)) - incomingQty) > 0.0001) return false;
    if (Math.abs(parseFloat(t.price || 0) - incomingPrice) > 0.0001) return false;
    if (Math.abs(parseFloat(t.amount || 0) - incomingAmount) > 0.01) return false;

    const tComm = parseFloat(t.commission !== undefined ? t.commission : (t.fees || 0));
    if (Math.abs(tComm - incomingComm) > 0.01) return false;

    // Date matches either direct date or original importedDate
    const datesMatch = (t.date === incoming.date) || (t.importedDate && t.importedDate === incoming.date);
    return datesMatch;
  });
}


export function AppProvider({ children }) {
  const [transactions, setTransactions] = useState([]);
  const [appSettings, setAppSettings] = useState({
    inventoryMethod: 'FIFO',
    noncoveredTickers: []
  });

  const inventoryMethod = appSettings.inventoryMethod;
  const setInventoryMethod = (method) => {
    updateAppSettings({ inventoryMethod: method });
  };
  
  // Google Drive states
  const [googleClientId, setGoogleClientId] = useState(() => localStorage.getItem('trader_google_client_id') || '');
  const [accessToken, setAccessToken] = useState('');
  const [gdriveFileId, setGdriveFileId] = useState('');
  const [gdriveSheetId, setGdriveSheetId] = useState('');
  const [useGoogleSheets, setUseGoogleSheets] = useState(() => {
    return localStorage.getItem('trader_use_google_sheets') === 'true';
  });
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState('offline'); // 'offline', 'connected', 'syncing', 'error'
  const [error, setError] = useState('');
  const [authError, setAuthError] = useState('');

  // 1. Initial Load of Local Copy
  useEffect(() => {
    const localData = localStorage.getItem('trader_local_db');
    if (localData) {
      try {
        const parsed = JSON.parse(localData);
        if (parsed.transactions) {
          const cleaned = deduplicateDatabaseIds(parsed.transactions);
          setTransactions(cleaned);
          
          const rawCleanedStr = JSON.stringify(cleaned);
          const rawOrigStr = JSON.stringify(parsed.transactions);
          if (rawCleanedStr !== rawOrigStr) {
            localStorage.setItem(
              'trader_local_db',
              JSON.stringify({
                transactions: cleaned,
                settings: parsed.settings || appSettings
              })
            );
          }
        }
        if (parsed.settings) {
          setAppSettings({
            inventoryMethod: parsed.settings.inventoryMethod || 'FIFO',
            noncoveredTickers: parsed.settings.noncoveredTickers || []
          });
        }
      } catch (err) {
        console.error('Failed to load local DB', err);
      }
    }
  }, []);

  // 2. Initialize GIS when Client ID changes or SDK loads
  useEffect(() => {
    if (!googleClientId) return;

    const setupClient = () => {
      initOAuthClient(
        googleClientId,
        (token) => {
          setAccessToken(token);
          setSyncStatus('connected');
          setError('');
          setAuthError('');
          // Trigger sync load immediately after getting token
          loadFromDrive(token);
        },
        (err) => {
          setAuthError(err);
          setSyncStatus('error');
        }
      );
    };

    if (window.google && window.google.accounts) {
      setupClient();
    } else {
      // Retry if SDK not loaded yet
      const interval = setInterval(() => {
        if (window.google && window.google.accounts) {
          setupClient();
          clearInterval(interval);
        }
      }, 500);
      return () => clearInterval(interval);
    }
  }, [googleClientId]);

  // Save changes locally
  const saveLocally = (txns, settingsObj = appSettings) => {
    localStorage.setItem(
      'trader_local_db',
      JSON.stringify({
        transactions: txns,
        settings: settingsObj
      })
    );
  };

  // 3. Google Drive functions
  const loadFromDrive = async (token = accessToken) => {
    if (!token) return;
    setSyncing(true);
    setSyncStatus('syncing');
    try {
      const { fileId, data } = await syncAndLoadDatabase(token);
      setGdriveFileId(fileId);
      
      let mergedTxns = [];
      const sheetsEnabled = localStorage.getItem('trader_use_google_sheets') === 'true';
      
      if (sheetsEnabled) {
        const folder = await findFolder('TradeR', token);
        if (folder) {
          const { sheetId, transactions: sheetTxns } = await syncAndLoadSpreadsheet(folder.id, token);
          setGdriveSheetId(sheetId);
          mergedTxns = sheetTxns;
        }
      } else {
        mergedTxns = data.transactions || [];
      }
      
      mergedTxns = deduplicateDatabaseIds(mergedTxns);
      
      const cloudIds = new Set(mergedTxns.map(t => t.id));
      const localOnlyTxns = transactions.filter(t => !cloudIds.has(t.id));
      
      const loadedSettings = {
        inventoryMethod: data.settings?.inventoryMethod || appSettings.inventoryMethod,
        noncoveredTickers: data.settings?.noncoveredTickers || appSettings.noncoveredTickers || []
      };

      if (localOnlyTxns.length > 0) {
        mergedTxns = [...mergedTxns, ...localOnlyTxns];
        mergedTxns = deduplicateDatabaseIds(mergedTxns);
        
        await saveDatabaseToDrive(fileId, {
          transactions: sheetsEnabled ? [] : mergedTxns,
          settings: loadedSettings
        }, token);
        
        if (sheetsEnabled) {
          const folder = await findFolder('TradeR', token);
          if (folder) {
            const { sheetId: newSheetId } = await syncAndLoadSpreadsheet(folder.id, token);
            setGdriveSheetId(newSheetId);
            await saveTransactionsToSpreadsheet(newSheetId, mergedTxns, token);
          }
        }
      }

      setTransactions(mergedTxns);
      setAppSettings(loadedSettings);
      
      saveLocally(mergedTxns, loadedSettings);
      setSyncStatus('connected');
      setError('');
    } catch (err) {
      console.error(err);
      setError('Google Drive sync failed: ' + err.message);
      setSyncStatus('error');
    } finally {
      setSyncing(false);
    }
  };

  const uploadToDrive = async (txns, settingsObj = appSettings, token = accessToken, fileId = gdriveFileId, useSheets = useGoogleSheets) => {
    if (!token) return;
    setSyncing(true);
    setSyncStatus('syncing');
    try {
      if (fileId) {
        await saveDatabaseToDrive(fileId, {
          transactions: useSheets ? [] : txns,
          settings: settingsObj
        }, token);
      }
      
      if (useSheets) {
        let sheetId = gdriveSheetId;
        if (!sheetId) {
          const folder = await findFolder('TradeR', token);
          if (folder) {
            const { sheetId: newSheetId } = await syncAndLoadSpreadsheet(folder.id, token);
            sheetId = newSheetId;
            setGdriveSheetId(sheetId);
          }
        }
        if (sheetId) {
          await saveTransactionsToSpreadsheet(sheetId, txns, token);
        }
      }
      
      setSyncStatus('connected');
      setError('');
    } catch (err) {
      console.error(err);
      setError('Failed to save to Google Drive: ' + err.message);
      setSyncStatus('error');
    } finally {
      setSyncing(false);
    }
  };

  const updateUseGoogleSheets = async (value) => {
    setUseGoogleSheets(value);
    localStorage.setItem('trader_use_google_sheets', String(value));
    
    if (accessToken) {
      await uploadToDrive(transactions, appSettings, accessToken, gdriveFileId, value);
    }
  };

  // 4. State mutators
  const updateGoogleClientId = (id) => {
    setGoogleClientId(id);
    localStorage.setItem('trader_google_client_id', id);
    if (!id) {
      signOut();
    }
  };

  const signOut = () => {
    setAccessToken('');
    setGdriveFileId('');
    setSyncStatus('offline');
    setError('');
    setAuthError('');
  };

  const updateAppSettings = async (newSettings) => {
    const merged = {
      inventoryMethod: newSettings.inventoryMethod !== undefined ? newSettings.inventoryMethod : appSettings.inventoryMethod,
      noncoveredTickers: newSettings.noncoveredTickers !== undefined ? newSettings.noncoveredTickers : appSettings.noncoveredTickers
    };
    setAppSettings(merged);
    saveLocally(transactions, merged);
    if (accessToken && gdriveFileId) {
      await uploadToDrive(transactions, merged);
    }
  };

  const updateInventoryMethod = async (method) => {
    await updateAppSettings({ inventoryMethod: method });
  };

  const importTransactions = async (newTxns) => {
    // Avoid duplicate insertions using advanced duplicate prevention logic
    const uniqueNewTxns = newTxns.filter(t => !isDuplicateTransaction(t, transactions));
    
    if (uniqueNewTxns.length === 0) return 0;

    const updatedTxns = [...transactions, ...uniqueNewTxns];
    setTransactions(updatedTxns);
    saveLocally(updatedTxns, appSettings);

    if (accessToken && gdriveFileId) {
      await uploadToDrive(updatedTxns, appSettings);
    }
    return uniqueNewTxns.length;
  };

  const voidTransaction = async (id) => {
    const updated = transactions.map(t => t.id === id ? { ...t, voided: !t.voided } : t);
    setTransactions(updated);
    saveLocally(updated, appSettings);

    if (accessToken && gdriveFileId) {
      await uploadToDrive(updated, appSettings);
    }
  };

  const clearDatabase = async () => {
    setTransactions([]);
    saveLocally([], appSettings);

    if (accessToken && gdriveFileId) {
      await uploadToDrive([], appSettings);
    }
  };

  const updateTransactions = async (updatedTxns) => {
    setTransactions(updatedTxns);
    saveLocally(updatedTxns, appSettings);

    if (accessToken && gdriveFileId) {
      await uploadToDrive(updatedTxns, appSettings);
    }
  };

  // 5. Derived values
  const computedData = useMemo(() => {
    return computeTrades(transactions, inventoryMethod);
  }, [transactions, inventoryMethod]);

  const value = {
    transactions,
    trades: computedData.trades,
    openPositions: computedData.openPositions,
    inventoryMethod,
    setInventoryMethod: updateInventoryMethod,
    appSettings,
    updateAppSettings,
    
    // Auth and sync state
    googleClientId,
    updateGoogleClientId,
    accessToken,
    setAccessToken,
    syncStatus,
    syncing,
    error,
    authError,
    setAuthError,
    signOut,
    triggerManualSync: () => loadFromDrive(),
    useGoogleSheets,
    updateUseGoogleSheets,
    
    // Mutators
    importTransactions,
    voidTransaction,
    updateTransactions,
    clearDatabase,
    isDuplicateTransaction
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
