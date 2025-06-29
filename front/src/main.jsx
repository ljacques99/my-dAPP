import { StrictMode, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Home from './Home.jsx'
import Communities from './Communities.jsx'
import SurveyList from './SurveyList.jsx'
import AddSurvey from './AddSurvey.jsx'
import Header from './Header.jsx'
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { Connection, PublicKey } from '@solana/web3.js'

const solanaConnection = new Connection('http://127.0.0.1:8899');

// Layout component for pages with header
function PageWithHeader({ children, connection, walletAddress, onNavigate, onDisconnect }) {
  return (
    <div>
      <Header 
        connection={connection} 
        walletAddress={walletAddress} 
        onNavigate={onNavigate}
        onDisconnect={onDisconnect}
      />
      {children}
    </div>
  );
}

// Main App component to handle navigation and user state
function App() {
  const [walletAddress, setWalletAddress] = useState(null);
  const [isRegistered, setIsRegistered] = useState(null);
  const [checkingRegistration, setCheckingRegistration] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const USER_SEED = "user";
  const PROGRAM_ID = "Ho1P3APYbSz3DUZyjNiezxuVkGinLB9vkqAfLBfVM8Cm";

  // Check if user is registered
  useEffect(() => {
    const checkRegistration = async () => {
      setIsRegistered(null);
      setCheckingRegistration(true);
      if (solanaConnection && walletAddress) {
        try {
          const [userPda] = await PublicKey.findProgramAddress(
            [Buffer.from(USER_SEED), new PublicKey(walletAddress).toBuffer()],
            new PublicKey(PROGRAM_ID)
          );
          const acc = await solanaConnection.getAccountInfo(userPda);
          const registered = !!acc;
          setIsRegistered(registered);
          
          // Auto-redirect registered users to communities page
          if (registered && location.pathname === '/') {
            navigate('/communities');
          }
        } catch (e) {
          setIsRegistered(false);
        }
      }
      setCheckingRegistration(false);
    };
    checkRegistration();
  }, [solanaConnection, walletAddress, navigate, location.pathname]);

  // Handle wallet disconnection
  useEffect(() => {
    if (window?.solana?.isPhantom) {
      const handleDisconnect = () => {
        setWalletAddress(null);
        setIsRegistered(null);
        navigate('/');
      };
      window.solana.on('disconnect', handleDisconnect);
      return () => {
        window.solana.off('disconnect', handleDisconnect);
      };
    }
  }, [navigate]);

  const handleNavigate = (route, params = {}) => {
    if (route === 'home') {
      navigate('/');
    } else if (route === 'communities') {
      navigate('/communities');
    } else if (route === 'surveys') {
      navigate(`/surveys/${encodeURIComponent(params.community)}`);
    } else if (route === 'addSurvey') {
      navigate(`/add-survey/${encodeURIComponent(params.communityName)}`);
    } else if (route === 'vote') {
      // For future vote page
      console.log('Navigate to vote with params:', params);
    }
  };

  const handleWalletConnect = async () => {
    if (window?.solana?.isPhantom) {
      try {
        const resp = await window.solana.connect();
        setWalletAddress(resp.publicKey.toString());
      } catch (err) {
        console.error('Connection to Phantom was rejected:', err);
      }
    }
  };

  const handleDisconnect = () => {
    setWalletAddress(null);
    setIsRegistered(null);
    navigate('/');
  };

  return (
    <Routes>
      <Route 
        path="/" 
        element={
          <Home 
            connection={solanaConnection} 
            walletAddress={walletAddress}
            isRegistered={isRegistered}
            checkingRegistration={checkingRegistration}
            onWalletConnect={handleWalletConnect}
            onNavigate={handleNavigate}
          />
        } 
      />
      <Route 
        path="/communities" 
        element={
          walletAddress ? (
            <PageWithHeader
              connection={solanaConnection}
              walletAddress={walletAddress}
              onNavigate={handleNavigate}
              onDisconnect={handleDisconnect}
            >
              <Communities 
                connection={solanaConnection} 
                walletAddress={walletAddress}
                onNavigate={handleNavigate}
              />
            </PageWithHeader>
          ) : (
            <div className="center-title">
              <div className="center-content">
                <h2>Please connect your wallet first</h2>
                <button onClick={handleWalletConnect} style={{ marginTop: '20px', padding: '10px 20px', fontSize: '16px', cursor: 'pointer' }}>
                  Connect Phantom Wallet
                </button>
              </div>
            </div>
          )
        } 
      />
      <Route 
        path="/surveys/:communityName" 
        element={
          walletAddress ? (
            <PageWithHeader
              connection={solanaConnection}
              walletAddress={walletAddress}
              onNavigate={handleNavigate}
              onDisconnect={handleDisconnect}
            >
              <SurveyList 
                connection={solanaConnection} 
                walletAddress={walletAddress}
                onNavigate={handleNavigate}
                communityName={decodeURIComponent(useLocation().pathname.split('/')[2])}
              />
            </PageWithHeader>
          ) : (
            <div className="center-title">
              <div className="center-content">
                <h2>Please connect your wallet first</h2>
                <button onClick={handleWalletConnect} style={{ marginTop: '20px', padding: '10px 20px', fontSize: '16px', cursor: 'pointer' }}>
                  Connect Phantom Wallet
                </button>
              </div>
            </div>
          )
        } 
      />
      <Route 
        path="/add-survey/:communityName" 
        element={
          walletAddress ? (
            <PageWithHeader
              connection={solanaConnection}
              walletAddress={walletAddress}
              onNavigate={handleNavigate}
              onDisconnect={handleDisconnect}
            >
              <AddSurvey 
                connection={solanaConnection} 
                walletAddress={walletAddress}
                onNavigate={handleNavigate}
                communityName={decodeURIComponent(useLocation().pathname.split('/')[2])}
              />
            </PageWithHeader>
          ) : (
            <div className="center-title">
              <div className="center-content">
                <h2>Please connect your wallet first</h2>
                <button onClick={handleWalletConnect} style={{ marginTop: '20px', padding: '10px 20px', fontSize: '16px', cursor: 'pointer' }}>
                  Connect Phantom Wallet
                </button>
              </div>
            </div>
          )
        } 
      />
    </Routes>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
