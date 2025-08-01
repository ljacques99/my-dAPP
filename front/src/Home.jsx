import { useState, useEffect } from 'react'
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'
import * as anchor from '@coral-xyz/anchor'
import idl from './solana_d_app.json'

const USER_SEED = "user";
const PROGRAM_ID = "Ho1P3APYbSz3DUZyjNiezxuVkGinLB9vkqAfLBfVM8Cm";

function Home({ connection, walletAddress, isRegistered, checkingRegistration, onWalletConnect, onNavigate }) {
  const [error, setError] = useState(null);
  const [slot, setSlot] = useState(null);
  const [balance, setBalance] = useState(null);
  const [airdropLoading, setAirdropLoading] = useState(false);
  const [registerLoading, setRegisterLoading] = useState(false);

  // Use the provided connection to get the slot
  useEffect(() => {
    if (connection) {
      connection.getSlot()
        .then(setSlot)
        .catch(() => setError('Failed to connect to Solana RPC.'));
    }
  }, [connection]);

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

  // Register user handler
  const handleRegisterUser = async () => {
    setError(null);
    setRegisterLoading(true);
    try {
      const provider = new anchor.AnchorProvider(connection, window.solana, anchor.AnchorProvider.defaultOptions());
      const program = new anchor.Program(idl, provider);
      
      const publicKey = new PublicKey(walletAddress);
      const [userPda] = await PublicKey.findProgramAddress([
        Buffer.from(USER_SEED),
        publicKey.toBuffer(),
      ], new PublicKey(PROGRAM_ID));

      console.log('Registering user with PDA:', userPda.toString());
      
      // Call the register_user instruction
      const tx = await program.methods
        .registerUser()
        .accounts({
          userAccount: userPda,
          authority: publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      console.log('Registration transaction signature:', tx);
      setError('User registered successfully! Transaction: ' + tx);
      
      // Navigate to communities page after successful registration
      setTimeout(() => {
        onNavigate('communities');
      }, 2000);
      
    } catch (err) {
      console.error('Registration error:', err);
      setError('Registration failed: ' + (err && err.message ? err.message : JSON.stringify(err)));
    }
    setRegisterLoading(false);
  };

  const handleDisconnect = async () => {
    if (window?.solana?.isPhantom) {
      await window.solana.disconnect();
    }
  };

  return (
    <>
      <div className="center-title">
        <div className="center-content">
          <h1>Welcome to Laurent's Solana dApp</h1>
          {slot !== null && (
            <div style={{ marginTop: '10px', fontSize: '14px', color: 'gray' }}>
              Connected to RPC. Current slot: {slot}
            </div>
          )}
          {walletAddress ? (
            <div style={{ marginTop: '20px', fontSize: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div>Connected: {walletAddress}</div>
              {checkingRegistration ? (
                <div style={{ marginTop: '5px', fontSize: '15px', color: 'orange' }}>
                  Checking registration status...
                </div>
              ) : isRegistered !== null && (
                <div style={{ marginTop: '5px', fontSize: '15px', color: isRegistered ? '#4caf50' : 'red' }}>
                  {isRegistered ? 'User is registered ✅' : 'User is NOT registered ❌'}
                </div>
              )}
              {!isRegistered && isRegistered !== null && !checkingRegistration && (
                <button
                  onClick={handleRegisterUser}
                  disabled={registerLoading}
                  style={{ marginTop: '10px', padding: '8px 16px', fontSize: '14px', cursor: registerLoading ? 'not-allowed' : 'pointer', background: '#4caf50', color: 'white', border: 'none', borderRadius: '4px' }}
                >
                  {registerLoading ? 'Registering...' : 'Register User'}
                </button>
              )}
              {isRegistered && (
                <button
                  onClick={() => onNavigate('communities')}
                  style={{ marginTop: '10px', padding: '8px 16px', fontSize: '14px', cursor: 'pointer', background: '#2196f3', color: 'white', border: 'none', borderRadius: '4px' }}
                >
                  View My Communities
                </button>
              )}
              {balance !== null && (
                <div style={{ marginTop: '5px', fontSize: '15px', color: '#4caf50' }}>
                  Balance: {balance} SOL
                </div>
              )}
              <button
                onClick={handleDisconnect}
                style={{ marginTop: '10px', padding: '8px 16px', fontSize: '14px', cursor: 'pointer' }}
              >
                Disconnect
              </button>
              <button
                onClick={handleAirdrop}
                disabled={airdropLoading}
                style={{ marginTop: '10px', padding: '8px 16px', fontSize: '14px', cursor: airdropLoading ? 'not-allowed' : 'pointer', background: '#2196f3', color: 'white', border: 'none', borderRadius: '4px' }}
              >
                {airdropLoading ? 'Requesting Airdrop...' : 'Request 5 SOL Airdrop'}
              </button>
            </div>
          ) : (
            <button onClick={onWalletConnect} style={{ marginTop: '20px', padding: '10px 20px', fontSize: '16px', cursor: 'pointer' }}>
              Connect Phantom Wallet
            </button>
          )}
          {error && (
            <div
              style={{
                color: error.startsWith('Airdrop succeeded!') || error.includes('registered successfully') ? '#4caf50' : 'red',
                marginTop: '10px',
              }}
            >
              {error}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export default Home
