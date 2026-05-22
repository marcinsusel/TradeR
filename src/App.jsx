import React, { useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import Dashboard from './components/Dashboard';
import Importer from './components/Importer';
import TradesList from './components/TradesList';
import Reports from './components/Reports';
import Settings from './components/Settings';
import { BarChart2, Activity, FileText, Upload, Settings as SettingsIcon, Cloud, CloudOff, RefreshCw } from 'lucide-react';

function AppContent() {
  const [activeView, setActiveView] = useState('dashboard');
  const { syncStatus, syncing, error } = useApp();

  const renderActiveView = () => {
    switch (activeView) {
      case 'dashboard':
        return <Dashboard />;
      case 'import':
        return <Importer />;
      case 'trades':
        return <TradesList />;
      case 'reports':
        return <Reports />;
      case 'settings':
        return <Settings />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        {/* Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '2.5rem', paddingLeft: '0.25rem' }}>
          <div style={{
            background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%)',
            borderRadius: '8px', padding: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <Activity size={22} style={{ color: 'white' }} />
          </div>
          <div>
            <h1 className="glow-text" style={{ fontSize: '1.5rem', lineHeight: '1' }}>TradeR</h1>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>FIFO Tracker</span>
          </div>
        </div>

        {/* Menu Items */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flexGrow: 1 }}>
          <button 
            onClick={() => setActiveView('dashboard')}
            className="btn"
            style={{
              justifyContent: 'flex-start',
              background: activeView === 'dashboard' ? 'var(--bg-tertiary)' : 'transparent',
              border: activeView === 'dashboard' ? '1px solid var(--border-color)' : '1px solid transparent',
              color: activeView === 'dashboard' ? 'var(--text-primary)' : 'var(--text-secondary)',
              width: '100%', padding: '0.75rem 1rem'
            }}
          >
            <BarChart2 size={18} style={{ color: activeView === 'dashboard' ? 'var(--color-primary)' : 'inherit' }} />
            Dashboard
          </button>

          <button 
            onClick={() => setActiveView('trades')}
            className="btn"
            style={{
              justifyContent: 'flex-start',
              background: activeView === 'trades' ? 'var(--bg-tertiary)' : 'transparent',
              border: activeView === 'trades' ? '1px solid var(--border-color)' : '1px solid transparent',
              color: activeView === 'trades' ? 'var(--text-primary)' : 'var(--text-secondary)',
              width: '100%', padding: '0.75rem 1rem'
            }}
          >
            <Activity size={18} style={{ color: activeView === 'trades' ? 'var(--color-primary)' : 'inherit' }} />
            Trade History
          </button>

          <button 
            onClick={() => setActiveView('reports')}
            className="btn"
            style={{
              justifyContent: 'flex-start',
              background: activeView === 'reports' ? 'var(--bg-tertiary)' : 'transparent',
              border: activeView === 'reports' ? '1px solid var(--border-color)' : '1px solid transparent',
              color: activeView === 'reports' ? 'var(--text-primary)' : 'var(--text-secondary)',
              width: '100%', padding: '0.75rem 1rem'
            }}
          >
            <FileText size={18} style={{ color: activeView === 'reports' ? 'var(--color-primary)' : 'inherit' }} />
            Tax Reports
          </button>

          <button 
            onClick={() => setActiveView('import')}
            className="btn"
            style={{
              justifyContent: 'flex-start',
              background: activeView === 'import' ? 'var(--bg-tertiary)' : 'transparent',
              border: activeView === 'import' ? '1px solid var(--border-color)' : '1px solid transparent',
              color: activeView === 'import' ? 'var(--text-primary)' : 'var(--text-secondary)',
              width: '100%', padding: '0.75rem 1rem'
            }}
          >
            <Upload size={18} style={{ color: activeView === 'import' ? 'var(--color-primary)' : 'inherit' }} />
            Import CSV
          </button>

          <button 
            onClick={() => setActiveView('settings')}
            className="btn"
            style={{
              justifyContent: 'flex-start',
              background: activeView === 'settings' ? 'var(--bg-tertiary)' : 'transparent',
              border: activeView === 'settings' ? '1px solid var(--border-color)' : '1px solid transparent',
              color: activeView === 'settings' ? 'var(--text-primary)' : 'var(--text-secondary)',
              width: '100%', padding: '0.75rem 1rem'
            }}
          >
            <SettingsIcon size={18} style={{ color: activeView === 'settings' ? 'var(--color-primary)' : 'inherit' }} />
            Settings
          </button>
        </nav>

        {/* Sidebar Status Footer */}
        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {syncStatus === 'connected' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--color-success)' }}>
              <Cloud size={14} />
              <span>Google Drive Connected</span>
            </div>
          ) : syncStatus === 'syncing' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--color-warning)' }}>
              <RefreshCw size={14} className="spin-animation" />
              <span>Syncing with Cloud...</span>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              <CloudOff size={14} />
              <span>Offline Mode (Local)</span>
            </div>
          )}
          
          {error && (
            <div style={{ fontSize: '0.65rem', color: 'var(--color-danger)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {error}
            </div>
          )}
        </div>
      </aside>

      {/* Main Panel Content */}
      <main className="main-content">
        {renderActiveView()}
      </main>
      
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

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
