import { useState, useEffect } from 'react'
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'

function Header({ connection, walletAddress, onNavigate, onDisconnect }) {
  const [balance, setBalance] = useState(null);
  const [airdropLoading, setAirdropLoading] = useState(false);
  const [error, setError] = useState(null);

  // Fetch balance when walletAddress or connection changes
  useEffect(() => {
    if (connection && walletAddress) {
      connection.getBalance(new PublicKey(walletAddress))
        .then(lamports => setBalance(lamports / LAMPORTS_PER_SOL))
        .catch(() => setError('Failed to fetch balance.'));
    } else {
      setBalance(null);
    }
  }, [connection, walletAddress]);

  const handleAirdrop = async () => {
    setError(null);
    setAirdropLoading(true);
    try {
      const pubkey = new PublicKey(walletAddress);
      const oldBalance = await connection.getBalance(pubkey);
      const signature = await connection.requestAirdrop(pubkey, 5 * LAMPORTS_PER_SOL);
      try {
        await connection.confirmTransaction(signature, 'confirmed');
      } catch (err) {
        // Ignore timeout here, we'll check balance below
      }
      // Refresh balance
      const newBalance = await connection.getBalance(pubkey);
      setBalance(newBalance / LAMPORTS_PER_SOL);
      if (newBalance > oldBalance) {
        setError('Airdrop succeeded! (Balance increased, but confirmation was not received in time. This is common on local validators.)');
      } else {
        setError('Airdrop failed: Transaction was not confirmed and balance did not increase.');
      }
    } catch (err) {
      setError('Airdrop failed: ' + (err && err.message ? err.message : JSON.stringify(err)));
    }
    setAirdropLoading(false);
  };

  const handleDisconnect = async () => {
    if (window?.solana?.isPhantom) {
      await window.solana.disconnect();
    }
    if (onDisconnect) {
      onDisconnect();
    }
  };

  return (
    <div style={{
      background: '#f8f9fa',
      borderBottom: '1px solid #dee2e6',
      padding: '15px 20px',
      marginBottom: '20px'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        maxWidth: '1200px',
        margin: '0 auto'
      }}>
        {/* Left side - Back to Home */}
        <div>
          <button 
            onClick={() => onNavigate('home')}
            style={{ 
              padding: '8px 16px', 
              fontSize: '14px', 
              cursor: 'pointer',
              background: '#666',
              color: 'white',
              border: 'none',
              borderRadius: '4px'
            }}
          >
            ← Back to Home
          </button>
        </div>

        {/* Center - Wallet Info */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '20px'
        }}>
          <div style={{ fontSize: '14px', color: '#666' }}>
            Connected: <span style={{ fontWeight: 'bold', color: '#333' }}>
              {walletAddress ? `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}` : 'Not connected'}
            </span>
          </div>
          {balance !== null && (
            <div style={{ fontSize: '14px', color: '#666' }}>
              Balance: <span style={{ fontWeight: 'bold', color: '#4caf50' }}>{balance} SOL</span>
            </div>
          )}
        </div>

        {/* Right side - Actions */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <button
            onClick={handleAirdrop}
            disabled={airdropLoading}
            style={{ 
              padding: '6px 12px', 
              fontSize: '12px', 
              cursor: airdropLoading ? 'not-allowed' : 'pointer',
              background: '#2196f3',
              color: 'white',
              border: 'none',
              borderRadius: '4px'
            }}
          >
            {airdropLoading ? 'Requesting...' : 'Airdrop'}
          </button>
          <button
            onClick={handleDisconnect}
            style={{ 
              padding: '6px 12px', 
              fontSize: '12px', 
              cursor: 'pointer',
              background: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '4px'
            }}
          >
            Disconnect
          </button>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div
          style={{
            color: error.startsWith('Airdrop succeeded!') ? '#4caf50' : 'red',
            marginTop: '10px',
            textAlign: 'center',
            fontSize: '12px'
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

export default Header; 