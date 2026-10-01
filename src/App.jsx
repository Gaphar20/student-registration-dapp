import { useState, useEffect, useCallback } from 'react';
import {
  isMetaMaskInstalled,
  connectWallet,
  getCurrentWalletState,
  switchToSepolia,
  formatAddress,
  SEPOLIA_CHAIN_ID,
} from './services/wallet';
import {
  CONTRACT_ADDRESS,
  isStudentRegistered,
  getStudent,
} from './services/contract';
import RegisterStudent from './components/RegisterStudent';
import StudentList from './components/StudentList';
import './App.css';

function App() {
  const [account, setAccount] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);

  // Contract Connection registration check state (Single Source of Truth)
  const [isCheckingReg, setIsCheckingReg] = useState(false);
  const [regStatus, setRegStatus] = useState(null); // 'registered' | 'not_registered' | null
  const [studentDetails, setStudentDetails] = useState(null);
  const [regError, setRegError] = useState(null);

  // My Registration section state
  const [myRegData, setMyRegData] = useState(null);
  const [isFetchingMyReg, setIsFetchingMyReg] = useState(false);
  const [myRegMessage, setMyRegMessage] = useState(null);

  // Synchronous state reset helper (used ONLY for disconnect and account/network reset)
  const resetRegState = useCallback(() => {
    setRegStatus(null);
    setStudentDetails(null);
    setRegError(null);
    setMyRegData(null);
    setMyRegMessage(null);
  }, []);

  // Stable callback for registration updates to avoid re-triggering child effects
  const handleRegistrationUpdate = useCallback((data) => {
    if (data) {
      setRegStatus('registered');
      setStudentDetails(data);
      setMyRegData(data);
      setMyRegMessage(null);
    }
  }, []);

  // Initialize and check wallet state on mount
  useEffect(() => {
    async function checkWalletState() {
      const installed = isMetaMaskInstalled();
      setIsInstalled(installed);

      if (installed) {
        const state = await getCurrentWalletState();
        if (state.account && state.account !== '0x0000000000000000000000000000000000000000') {
          setAccount(state.account);
        } else {
          setAccount(null);
        }
        if (state.chainId) {
          setChainId(state.chainId);
        }
      }
    }

    checkWalletState();
  }, []);

  // Listen for MetaMask events (accountsChanged, chainChanged)
  useEffect(() => {
    if (!isMetaMaskInstalled() || !window.ethereum || !window.ethereum.on) return;

    const handleAccountsChanged = (accounts) => {
      resetRegState();
      const newAccount =
        accounts &&
        accounts.length > 0 &&
        accounts[0] !== '0x0000000000000000000000000000000000000000'
          ? accounts[0]
          : null;

      setAccount(newAccount);
      setError(null);
    };

    const handleChainChanged = (hexChainId) => {
      resetRegState();
      const newChainId = parseInt(hexChainId, 16);
      setChainId(newChainId);
      setError(null);
    };

    window.ethereum.on('accountsChanged', handleAccountsChanged);
    window.ethereum.on('chainChanged', handleChainChanged);

    return () => {
      if (window.ethereum && window.ethereum.removeListener) {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
        window.ethereum.removeListener('chainChanged', handleChainChanged);
      }
    };
  }, [resetRegState]);

  // Automatic refresh of wallet-dependent data when account or chainId changes
  useEffect(() => {
    let isCancelled = false;

    async function autoFetchWalletData() {
      const isZeroAddr =
        !account ||
        account.toLowerCase() === '0x0000000000000000000000000000000000000000';

      if (isZeroAddr || chainId !== SEPOLIA_CHAIN_ID) {
        if (isCancelled) return;
        setIsCheckingReg(false);
        setIsFetchingMyReg(false);
        setRegStatus(null);
        setStudentDetails(null);
        setRegError(null);
        setMyRegData(null);
        setMyRegMessage(
          !isZeroAddr && chainId !== SEPOLIA_CHAIN_ID
            ? 'Switch to Sepolia network to view registration details.'
            : null
        );
        return;
      }

      setIsCheckingReg(true);
      setIsFetchingMyReg(true);
      setRegStatus(null);
      setStudentDetails(null);
      setRegError(null);
      setMyRegData(null);
      setMyRegMessage(null);

      const targetAccount = account;

      try {
        const registered = await isStudentRegistered(targetAccount);
        if (isCancelled) return;

        if (registered) {
          const details = await getStudent(targetAccount);
          if (isCancelled) return;

          const fullData = { ...details, address: targetAccount };
          setRegStatus('registered');
          setStudentDetails(details);
          setMyRegData(fullData);
          setMyRegMessage(null);
        } else {
          setRegStatus('not_registered');
          setStudentDetails(null);
          setMyRegData(null);
          setMyRegMessage(`No student record registered for ${formatAddress(targetAccount)}.`);
        }
      } catch (err) {
        if (isCancelled) return;
        console.error('Auto-refresh registration error:', err);
        setRegError(err.message || 'Failed to query student registration status.');
        setMyRegMessage(err.message || 'Failed to fetch registration data.');
      } finally {
        if (!isCancelled) {
          setIsCheckingReg(false);
          setIsFetchingMyReg(false);
        }
      }
    }

    autoFetchWalletData();

    return () => {
      isCancelled = true;
    };
  }, [account, chainId]);

  // Handler to connect wallet
  const handleConnect = useCallback(async () => {
    setError(null);
    setIsConnecting(true);

    try {
      const walletState = await connectWallet();
      setAccount(walletState.account);
      setChainId(walletState.chainId);
      resetRegState();
    } catch (err) {
      console.error('Wallet connection error:', err);
      setError(err.message || 'Failed to connect wallet.');
    } finally {
      setIsConnecting(false);
    }
  }, [resetRegState]);

  // Handler to disconnect wallet locally
  const handleDisconnect = useCallback(() => {
    setAccount(null);
    setError(null);
    resetRegState();
  }, [resetRegState]);

  // Handler to switch network to Sepolia
  const handleSwitchNetwork = useCallback(async () => {
    setError(null);
    setIsConnecting(true);

    try {
      await switchToSepolia();
      resetRegState();
    } catch (err) {
      console.error('Network switch error:', err);
      setError(err.message || 'Failed to switch network.');
    } finally {
      setIsConnecting(false);
    }
  }, [resetRegState]);

  // Manual handler to check student registration on contract (Contract Connection section)
  const handleCheckRegistration = useCallback(async () => {
    setRegError(null);

    const targetAccount = account;
    if (!targetAccount || targetAccount === '0x0000000000000000000000000000000000000000') {
      setRegError('Please connect your wallet first.');
      return;
    }

    if (chainId !== SEPOLIA_CHAIN_ID) {
      setRegError('Please switch to Sepolia network first.');
      return;
    }

    setIsCheckingReg(true);

    try {
      const registered = await isStudentRegistered(targetAccount);
      if (!account || targetAccount.toLowerCase() !== account.toLowerCase()) return;

      if (registered) {
        setRegStatus('registered');
        try {
          const details = await getStudent(targetAccount);
          if (!account || targetAccount.toLowerCase() !== account.toLowerCase()) return;
          setStudentDetails(details);
          setMyRegData({ ...details, address: targetAccount });
          setMyRegMessage(null);
        } catch (detailsErr) {
          console.warn('Could not fetch student details:', detailsErr);
        }
      } else {
        setRegStatus('not_registered');
        setStudentDetails(null);
        setMyRegData(null);
        setMyRegMessage(`No student record registered for ${formatAddress(targetAccount)}.`);
      }
    } catch (err) {
      console.error('Check registration error:', err);
      setRegError(err.message || 'Failed to query student registration status.');
    } finally {
      setIsCheckingReg(false);
    }
  }, [account, chainId]);

  // Manual handler for My Registration section refresh
  const handleFetchMyRegistration = useCallback(async () => {
    setMyRegMessage(null);
    const targetAccount = account;

    if (!targetAccount || targetAccount === '0x0000000000000000000000000000000000000000') {
      setMyRegMessage('Connect wallet to view registration details.');
      return;
    }
    if (chainId !== SEPOLIA_CHAIN_ID) {
      setMyRegMessage('Switch to Sepolia network to view registration details.');
      return;
    }

    setIsFetchingMyReg(true);

    try {
      const registered = await isStudentRegistered(targetAccount);
      if (!account || targetAccount.toLowerCase() !== account.toLowerCase()) return;

      if (registered) {
        const details = await getStudent(targetAccount);
        if (!account || targetAccount.toLowerCase() !== account.toLowerCase()) return;

        setMyRegData({ ...details, address: targetAccount });
        setRegStatus('registered');
        setStudentDetails(details);
        setMyRegMessage(null);
      } else {
        setMyRegData(null);
        setRegStatus('not_registered');
        setStudentDetails(null);
        setMyRegMessage(`No student record registered for ${formatAddress(targetAccount)}.`);
      }
    } catch (err) {
      console.error('Error fetching my registration:', err);
      setMyRegMessage(err.message || 'Failed to fetch registration data.');
    } finally {
      setIsFetchingMyReg(false);
    }
  }, [account, chainId]);

  const isSepolia = chainId === SEPOLIA_CHAIN_ID;

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-content">
          <h1>🎓 Student Registration DApp</h1>
          <p className="subtitle">Ethereum Sepolia Web3 Portal</p>
        </div>
      </header>

      <main className="app-main">
        {/* Section 1: Wallet & Network Setup */}
        <div className="card wallet-card">
          <h2>Wallet & Network Setup</h2>

          {!isInstalled ? (
            <div className="alert alert-warning">
              <p>⚠️ MetaMask is not installed in your browser.</p>
              <a
                href="https://metamask.io/download/"
                target="_blank"
                rel="noreferrer"
                className="btn btn-secondary"
                style={{ marginTop: '12px', display: 'inline-block' }}
              >
                Install MetaMask
              </a>
            </div>
          ) : (
            <>
              {error && (
                <div className="alert alert-error">
                  <p>🚨 {error}</p>
                </div>
              )}

              {!account ? (
                <div className="connect-section">
                  <p className="description">
                    Wallet disconnected. Connect your MetaMask wallet to interact with the Student Registration DApp on Ethereum Sepolia.
                  </p>
                  <button
                    onClick={handleConnect}
                    disabled={isConnecting}
                    className="btn btn-primary"
                  >
                    {isConnecting ? 'Connecting...' : 'Connect Wallet'}
                  </button>
                </div>
              ) : (
                <div className="wallet-details">
                  <div className="info-row">
                    <span className="info-label">Account Address:</span>
                    <span className="info-value address-badge" title={account}>
                      {formatAddress(account)}
                    </span>
                  </div>

                  <div className="info-row">
                    <span className="info-label">Network:</span>
                    <span className={`info-value network-badge ${isSepolia ? 'status-sepolia' : 'status-wrong-network'}`}>
                      {isSepolia ? 'Sepolia' : `Chain ID: ${chainId ?? 'Unknown'}`}
                    </span>
                  </div>

                  <button
                    onClick={handleDisconnect}
                    className="btn btn-secondary"
                    style={{ marginTop: '1.25rem', width: '100%' }}
                  >
                    Disconnect Wallet
                  </button>

                  {!isSepolia && (
                    <div className="alert alert-warning network-warning">
                      <p>⚠️ You are connected to the wrong network.</p>
                      <p className="network-instruction">Please switch to Ethereum Sepolia (Chain ID 11155111) to use this application.</p>
                      <button
                        onClick={handleSwitchNetwork}
                        disabled={isConnecting}
                        className="btn btn-warning"
                        style={{ marginTop: '10px' }}
                      >
                        {isConnecting ? 'Switching...' : 'Switch to Sepolia'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Section 2: Contract Connection */}
        <div className="card contract-card" style={{ marginTop: '1.5rem' }}>
          <h2>Contract Connection</h2>

          <div className="contract-details">
            <div className="info-row">
              <span className="info-label">Contract:</span>
              <span className="info-value address-badge" title={CONTRACT_ADDRESS}>
                {formatAddress(CONTRACT_ADDRESS)}
              </span>
            </div>

            <div className="info-row">
              <span className="info-label">Network:</span>
              <span className="info-value network-badge status-sepolia">
                Sepolia
              </span>
            </div>

            <div className="info-row">
              <span className="info-label">Contract Status:</span>
              <span className="info-value status-connected">
                Connected
              </span>
            </div>
          </div>

          <div className="contract-actions" style={{ marginTop: '1.25rem' }}>
            <button
              onClick={handleCheckRegistration}
              disabled={isCheckingReg || !account || !isSepolia}
              className="btn btn-primary"
            >
              {isCheckingReg ? 'Checking Registration...' : 'Check My Registration'}
            </button>

            {isCheckingReg && (
              <div className="alert alert-info" style={{ marginTop: '1rem' }}>
                <p className="status-heading">⏳ Checking registration status for {formatAddress(account)}...</p>
              </div>
            )}

            {regError && !isCheckingReg && (
              <div className="alert alert-warning" style={{ marginTop: '1rem' }}>
                <p>ℹ️ {regError}</p>
              </div>
            )}

            {regStatus === 'registered' && !isCheckingReg && (
              <div className="alert alert-success" style={{ marginTop: '1rem' }}>
                <p className="status-heading">✅ You are registered</p>
                {studentDetails && (
                  <div className="student-info" style={{ marginTop: '0.5rem' }}>
                    <p><strong>Name:</strong> {studentDetails.name}</p>
                    <p><strong>Age:</strong> {studentDetails.age.toString()}</p>
                    <p><strong>Course:</strong> {studentDetails.course}</p>
                  </div>
                )}
              </div>
            )}

            {regStatus === 'not_registered' && !isCheckingReg && (
              <div className="alert alert-info" style={{ marginTop: '1rem' }}>
                <p className="status-heading">ℹ️ You are not registered</p>
              </div>
            )}
          </div>
        </div>

        {/* Section 3: Register Student */}
        <div style={{ marginTop: '1.5rem' }}>
          <RegisterStudent
            account={account}
            chainId={chainId}
            isCheckingReg={isCheckingReg}
            regStatus={regStatus}
            studentDetails={studentDetails}
            onRegistrationUpdate={handleRegistrationUpdate}
          />
        </div>

        {/* Section 4: My Registration */}
        <div className="card my-registration-card" style={{ marginTop: '1.5rem' }}>
          <h2>My Registration</h2>

          <p className="description" style={{ marginBottom: '1rem' }}>
            View your current blockchain student registration record.
          </p>

          <button
            onClick={handleFetchMyRegistration}
            disabled={isFetchingMyReg || !account || !isSepolia}
            className="btn btn-secondary"
            style={{ marginBottom: '1rem', width: '100%' }}
          >
            {isFetchingMyReg ? 'Loading Student Details...' : 'Refresh My Registration'}
          </button>

          {isFetchingMyReg && (
            <div className="alert alert-info">
              <p className="status-heading">⏳ Loading student details for {formatAddress(account)}...</p>
            </div>
          )}

          {myRegMessage && !isFetchingMyReg && (
            <div className="alert alert-info">
              <p>ℹ️ {myRegMessage}</p>
            </div>
          )}

          {myRegData && !isFetchingMyReg ? (
            <div className="student-record">
              <div className="info-row">
                <span className="info-label">Name:</span>
                <span className="info-value">{myRegData.name}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Age:</span>
                <span className="info-value">{myRegData.age.toString()}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Course:</span>
                <span className="info-value">{myRegData.course}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Address:</span>
                <span className="info-value address-badge" title={myRegData.address}>
                  {formatAddress(myRegData.address)}
                </span>
              </div>
            </div>
          ) : (
            !myRegMessage && !isFetchingMyReg && (
              <div className="alert alert-info">
                <p>No registration record loaded. Connect wallet or register above.</p>
              </div>
            )
          )}
        </div>

        {/* Section 5: All Registered Students (Multicall3) */}
        <div style={{ marginTop: '1.5rem' }}>
          <StudentList account={account} chainId={chainId} />
        </div>
      </main>
    </div>
  );
}

export default App;
