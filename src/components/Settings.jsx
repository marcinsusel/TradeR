import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { loginToGoogle } from '../utils/googleDrive';
import { Check, LogOut, RefreshCw, Trash2, Key, HelpCircle, FileJson, Info } from 'lucide-react';

export default function Settings() {
  const {
    googleClientId,
    updateGoogleClientId,
    syncStatus,
    syncing,
    error,
    authError,
    signOut,
    triggerManualSync,
    inventoryMethod,
    setInventoryMethod,
    clearDatabase,
    transactions,
    importTransactions,
    useGoogleSheets,
    updateUseGoogleSheets
  } = useApp();

  const [clientIdInput, setClientIdInput] = useState(googleClientId);
  const [showInstructions, setShowInstructions] = useState(false);

  const handleSaveClientId = (e) => {
    e.preventDefault();
    updateGoogleClientId(clientIdInput.trim());
  };

  const handleGoogleLogin = () => {
    try {
      loginToGoogle();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleLocalExport = () => {
    const fileData = JSON.stringify({
      transactions,
      settings: { inventoryMethod }
    }, null, 2);
    
    const blob = new Blob([fileData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `trader-local-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleLocalImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        if (parsed.transactions && Array.isArray(parsed.transactions)) {
          const count = await importTransactions(parsed.transactions);
          alert(`Successfully imported ${count} transactions from local backup!`);
        } else {
          alert('Invalid backup file. Missing transactions array.');
        }
      } catch (err) {
        alert('Failed to parse backup file: ' + err.message);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h1 className="glow-text" style={{ fontSize: '2.25rem', marginBottom: '0.5rem' }}>Application Settings</h1>
        <p style={{ color: 'var(--text-secondary)' }}>Configure synchronization layers, inventory methodologies, and manual local backups.</p>
      </div>

      <div className="grid-cols-2" style={{ gridTemplateColumns: '1fr 1.2fr' }}>
        {/* Core Settings Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {/* Inventory Method */}
          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <h3 style={{ marginBottom: '1rem' }}>Inventory Tracking Method</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <label style={{ display: 'flex', gap: '0.75rem', cursor: 'pointer', alignItems: 'flex-start' }}>
                <input 
                  type="radio" 
                  name="inventoryMethod" 
                  value="FIFO" 
                  checked={inventoryMethod === 'FIFO'} 
                  onChange={() => setInventoryMethod('FIFO')}
                  style={{ marginTop: '0.25rem' }}
                />
                <div>
                  <span style={{ fontWeight: '600', fontSize: '0.9rem' }}>FIFO (First In, First Out)</span>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                    Standard accounting default. Realizes gains/losses by selling your oldest shares first.
                  </p>
                </div>
              </label>

              <label style={{ display: 'flex', gap: '0.75rem', cursor: 'pointer', alignItems: 'flex-start', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                <input 
                  type="radio" 
                  name="inventoryMethod" 
                  value="LIFO" 
                  checked={inventoryMethod === 'LIFO'} 
                  onChange={() => setInventoryMethod('LIFO')}
                  style={{ marginTop: '0.25rem' }}
                />
                <div>
                  <span style={{ fontWeight: '600', fontSize: '0.9rem' }}>LIFO (Last In, First Out)</span>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                    Realizes gains/losses by matching against your most recent purchases first.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Database Control */}
          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <h3 style={{ marginBottom: '1rem' }}>Database Management</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Backups */}
              <div>
                <span style={{ fontSize: '0.875rem', fontWeight: '500', color: 'var(--text-secondary)' }}>Local Backup</span>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Export database to JSON or import an existing backup.</p>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button className="btn btn-secondary" onClick={handleLocalExport} style={{ flexGrow: 1 }}>
                    <FileJson size={16} /> Export JSON
                  </button>
                  <label className="btn btn-secondary" style={{ flexGrow: 1, cursor: 'pointer', margin: 0 }}>
                    <FileJson size={16} /> Import Backup
                    <input type="file" onChange={handleLocalImport} accept=".json" style={{ display: 'none' }} />
                  </label>
                </div>
              </div>

              {/* Wipe */}
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem' }}>
                <span style={{ fontSize: '0.875rem', fontWeight: '500', color: 'var(--text-secondary)' }}>Danger Zone</span>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>Permanently clear all transaction records. This action cannot be undone.</p>
                <button 
                  className="btn btn-danger" 
                  onClick={() => {
                    if (window.confirm('CAUTION: Are you sure you want to completely erase the database? This deletes all transaction entries.')) {
                      clearDatabase();
                      alert('Database cleared.');
                    }
                  }}
                  style={{ width: '100%' }}
                >
                  <Trash2 size={16} />
                  Clear Entire Database
                </button>
              </div>
            </div>
          </div>

        </div>

        {/* Google Drive Sync Column */}
        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3>Google Drive Cloud Sync</h3>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem' }}>
              Status: 
              <span className={`badge ${
                syncStatus === 'connected' ? 'badge-success' : 
                syncStatus === 'syncing' ? 'badge-warning' : 
                syncStatus === 'error' ? 'badge-danger' : 'badge-neutral'
              }`} style={{ textTransform: 'uppercase' }}>
                {syncStatus}
              </span>
            </span>
          </div>

          {/* Sync Errors */}
          {(error || authError) && (
            <div className="glass-panel" style={{ padding: '0.75rem', background: 'var(--color-danger-bg)', borderColor: 'var(--color-danger-border)', color: 'var(--color-danger)', fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              {authError && <div><strong>Auth Error:</strong> {authError}</div>}
              {error && <div><strong>Sync Error:</strong> {error}</div>}
            </div>
          )}

          {/* Setup / Status */}
          {!googleClientId ? (
            <div style={{ textAlign: 'center', padding: '1.5rem 0', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
              <Key size={30} style={{ color: 'var(--text-muted)' }} />
              <div style={{ padding: '0 1rem' }}>
                <h4 style={{ fontSize: '0.9rem' }}>No Google Client ID Configured</h4>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  Save your Client ID first to connect to Google Drive. In the meantime, all changes are saved locally in your browser.
                </p>
              </div>
            </div>
          ) : (
            <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid var(--border-color)', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ fontSize: '0.85rem' }}>
                Active Client ID: <code style={{ background: 'var(--bg-tertiary)', padding: '0.15rem 0.3rem', borderRadius: '4px', wordBreak: 'break-all', fontSize: '0.75rem' }}>{googleClientId}</code>
              </div>
              
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                {syncStatus === 'offline' ? (
                  <button className="btn btn-primary" onClick={handleGoogleLogin} style={{ flexGrow: 1 }}>
                    Sign In with Google
                  </button>
                ) : (
                  <>
                    <button className="btn btn-secondary" onClick={triggerManualSync} disabled={syncing} style={{ display: 'flex', gap: '0.5rem', flexGrow: 1 }}>
                      <RefreshCw size={16} className={syncing ? 'spin-animation' : ''} />
                      Sync Database
                    </button>
                    <button className="btn btn-danger" onClick={signOut} style={{ display: 'flex', gap: '0.5rem' }}>
                      <LogOut size={16} /> Sign Out
                    </button>
                  </>
                )}
              </div>
              
              {syncStatus !== 'offline' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginTop: '0.25rem' }}>
                  <input 
                    type="checkbox" 
                    id="useGoogleSheets" 
                    checked={useGoogleSheets} 
                    onChange={(e) => updateUseGoogleSheets(e.target.checked)} 
                    disabled={syncing}
                    style={{ cursor: syncing ? 'not-allowed' : 'pointer' }}
                  />
                  <label htmlFor="useGoogleSheets" style={{ fontSize: '0.85rem', cursor: syncing ? 'not-allowed' : 'pointer', fontWeight: '500', color: 'var(--text-primary)' }}>
                    Store transactions in Google Sheets (TradeR_Spreadsheet)
                  </label>
                </div>
              )}
            </div>
          )}

          {/* Form to edit Client ID */}
          <form onSubmit={handleSaveClientId} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                Google OAuth Client ID:
                <button type="button" onClick={() => setShowInstructions(!showInstructions)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-primary)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', fontWeight: '500' }}>
                  <HelpCircle size={12} /> {showInstructions ? 'Hide Help' : 'How to get ID?'}
                </button>
              </label>
              <input 
                type="text" 
                className="form-input" 
                placeholder="e.g. 123456789-abc.apps.googleusercontent.com"
                value={clientIdInput}
                onChange={(e) => setClientIdInput(e.target.value)}
              />
            </div>
            <button type="submit" className="btn btn-secondary" style={{ width: 'fit-content', alignSelf: 'flex-end' }}>
              Save Client ID
            </button>
          </form>

          {/* Step-by-Step Instructions */}
          {showInstructions && (
            <div className="glass-panel" style={{ padding: '1rem', background: 'var(--bg-tertiary)', fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <h4 style={{ color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}><Info size={14} /> Obtaining a Client ID</h4>
              <ol style={{ paddingLeft: '1.15rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', color: 'var(--text-secondary)' }}>
                <li>Go to the <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer" style={{ color: 'var(--color-secondary)' }}>Google Cloud Console</a>.</li>
                <li>Create a new project named <strong>TradeR</strong>.</li>
                <li>Go to <strong>APIs & Services</strong> &gt; <strong>Library</strong>. Search for <strong>Google Drive API</strong> and click <strong>Enable</strong>.</li>
                <li>Go to <strong>OAuth consent screen</strong>. Select <strong>External</strong>, input application support email details, and add the scope: <code style={{ background: 'var(--bg-secondary)', padding: '0.05rem 0.2rem' }}>.../auth/drive.file</code>. Add your email as a <strong>Test user</strong>.</li>
                <li>Go to <strong>Credentials</strong>. Click <strong>Create Credentials</strong> &gt; <strong>OAuth client ID</strong>.</li>
                <li>Select <strong>Web application</strong> as application type.</li>
                <li>Under <strong>Authorized JavaScript origins</strong>, add:
                  <ul style={{ paddingLeft: '1.25rem', marginTop: '0.15rem', listStyleType: 'circle' }}>
                    <li><code style={{ background: 'var(--bg-secondary)', padding: '0.05rem 0.2rem' }}>http://localhost:3000</code> (local testing)</li>
                  </ul>
                </li>
                <li>Click <strong>Create</strong>. Copy the Client ID, paste it into the field above, and click <strong>Save Client ID</strong>.</li>
              </ol>
            </div>
          )}
        </div>
      </div>
      
      <style>{`
        .spin-animation {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
