import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { syncAndLoadDatabase, saveDatabaseToDrive, initOAuthClient } from '../utils/googleDrive';
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

export function AppProvider({ children }) {
  const [transactions, setTransactions] = useState([]);
  const [inventoryMethod, setInventoryMethod] = useState('FIFO');
  
  // Google Drive states
  const [googleClientId, setGoogleClientId] = useState(() => localStorage.getItem('trader_google_client_id') || '');
  const [accessToken, setAccessToken] = useState('');
  const [gdriveFileId, setGdriveFileId] = useState('');
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
                settings: parsed.settings || { inventoryMethod }
              })
            );
          }
        }
        if (parsed.settings?.inventoryMethod) setInventoryMethod(parsed.settings.inventoryMethod);
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
  const saveLocally = (txns, method) => {
    localStorage.setItem(
      'trader_local_db',
      JSON.stringify({
        transactions: txns,
        settings: { inventoryMethod: method }
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
      
      // Merge local and cloud transactions if there are discrepancies
      // For simplicity, cloud data wins, but we merge unique transactions.
      let mergedTxns = data.transactions || [];
      mergedTxns = deduplicateDatabaseIds(mergedTxns);
      
      // If we have local transactions that aren't in the cloud (e.g. added while offline), 
      // we can append them. We check by ID.
      const cloudIds = new Set(mergedTxns.map(t => t.id));
      const localOnlyTxns = transactions.filter(t => !cloudIds.has(t.id));
      
      if (localOnlyTxns.length > 0) {
        mergedTxns = [...mergedTxns, ...localOnlyTxns];
        mergedTxns = deduplicateDatabaseIds(mergedTxns);
        // Trigger a save to drive to sync them up
        await saveDatabaseToDrive(fileId, {
          transactions: mergedTxns,
          settings: { inventoryMethod: data.settings?.inventoryMethod || inventoryMethod }
        }, token);
      }

      setTransactions(mergedTxns);
      if (data.settings?.inventoryMethod) {
        setInventoryMethod(data.settings.inventoryMethod);
      }
      
      saveLocally(mergedTxns, data.settings?.inventoryMethod || inventoryMethod);
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

  const uploadToDrive = async (txns, method, token = accessToken, fileId = gdriveFileId) => {
    if (!token || !fileId) return;
    setSyncing(true);
    setSyncStatus('syncing');
    try {
      await saveDatabaseToDrive(fileId, {
        transactions: txns,
        settings: { inventoryMethod: method }
      }, token);
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

  const updateInventoryMethod = async (method) => {
    setInventoryMethod(method);
    saveLocally(transactions, method);
    if (accessToken && gdriveFileId) {
      await uploadToDrive(transactions, method);
    }
  };

  const importTransactions = async (newTxns) => {
    // Avoid duplicate insertions
    const existingIds = new Set(transactions.map(t => t.id));
    const uniqueNewTxns = newTxns.filter(t => !existingIds.has(t.id));
    
    if (uniqueNewTxns.length === 0) return 0;

    const updatedTxns = [...transactions, ...uniqueNewTxns];
    setTransactions(updatedTxns);
    saveLocally(updatedTxns, inventoryMethod);

    if (accessToken && gdriveFileId) {
      await uploadToDrive(updatedTxns, inventoryMethod);
    }
    return uniqueNewTxns.length;
  };

  const deleteTransaction = async (id) => {
    const updated = transactions.filter(t => t.id !== id);
    setTransactions(updated);
    saveLocally(updated, inventoryMethod);

    if (accessToken && gdriveFileId) {
      await uploadToDrive(updated, inventoryMethod);
    }
  };

  const clearDatabase = async () => {
    setTransactions([]);
    saveLocally([], inventoryMethod);

    if (accessToken && gdriveFileId) {
      await uploadToDrive([], inventoryMethod);
    }
  };

  const updateTransactions = async (updatedTxns) => {
    setTransactions(updatedTxns);
    saveLocally(updatedTxns, inventoryMethod);

    if (accessToken && gdriveFileId) {
      await uploadToDrive(updatedTxns, inventoryMethod);
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
    
    // Mutators
    importTransactions,
    deleteTransaction,
    updateTransactions,
    clearDatabase
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
