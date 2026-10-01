import { useState, useCallback } from 'react';
import { ethers } from 'ethers';
import { discoverStudentAddresses, fetchStudentsWithMulticall } from '../services/multicall';
import { formatAddress, SEPOLIA_CHAIN_ID } from '../services/wallet';

function StudentList({ account, chainId }) {
  // Flow states: 'idle' | 'discovering' | 'fetching_multicall' | 'success' | 'error'
  const [status, setStatus] = useState('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [students, setStudents] = useState([]);
  const [discoveryWarning, setDiscoveryWarning] = useState(null);
  const [error, setError] = useState(null);
  const [copiedAddress, setCopiedAddress] = useState(null);

  const isWrongNetwork = account && chainId && chainId !== SEPOLIA_CHAIN_ID;
  const isLoading = status === 'discovering' || status === 'fetching_multicall';

  const handleLoadStudents = useCallback(async () => {
    setError(null);
    setDiscoveryWarning(null);
    setStudents([]);

    if (isWrongNetwork) {
      setError('You are connected to the wrong network. Please switch to Ethereum Sepolia.');
      return;
    }

    try {
      // 1. Step 1: Paginated Address Discovery
      setStatus('discovering');
      setStatusMessage('Finding registered students...');

      const discoveryResult = await discoverStudentAddresses((progressMsg) => {
        setStatusMessage(progressMsg);
      });
      const discoveredAddresses = discoveryResult.addresses || [];
      if (discoveryResult.warning) {
        setDiscoveryWarning(discoveryResult.warning);
      }

      // Merge connected account if available, and normalize all candidate addresses to lowercase
      const rawCandidates = account ? [account, ...discoveredAddresses] : discoveredAddresses;
      const candidateAddresses = [...new Set(
        rawCandidates
          .filter((addr) => addr && typeof addr === 'string' && ethers.isAddress(addr))
          .map((addr) => addr.toLowerCase())
      )];

      if (candidateAddresses.length === 0) {
        setStatus('success');
        setStatusMessage('No student registration transactions found on Sepolia.');
        return;
      }

      // 2. Step 2: Batch Query with Multicall3
      setStatus('fetching_multicall');
      setStatusMessage('Fetching student data with Multicall...');

      const fetchedStudents = await fetchStudentsWithMulticall(candidateAddresses);

      setStudents(fetchedStudents);
      setStatus('success');
      setStatusMessage(`Successfully loaded ${fetchedStudents.length} student(s) using Multicall3.`);
    } catch (err) {
      console.error('Error loading students:', err);
      setStatus('error');
      setError(err.message || 'Failed to load students using Multicall3.');
    }
  }, [account, isWrongNetwork]);

  const handleCopyAddress = (addr) => {
    navigator.clipboard.writeText(addr);
    setCopiedAddress(addr);
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  return (
    <div className="card student-list-card">
      <h2>All Registered Students</h2>

      <p className="description">
        Retrieve all registered students in a single batch query using the <strong>Multicall3</strong> contract on Ethereum Sepolia.
      </p>

      {isWrongNetwork && (
        <div className="alert alert-warning" style={{ marginBottom: '1rem' }}>
          <p>⚠️ Connected to the wrong network. Please switch to Sepolia to fetch student data.</p>
        </div>
      )}

      {error && (
        <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
          <p>🚨 {error}</p>
        </div>
      )}

      {discoveryWarning && (
        <div className="alert alert-warning" style={{ marginBottom: '1rem' }}>
          <p>{discoveryWarning}</p>
        </div>
      )}

      <button
        onClick={handleLoadStudents}
        disabled={isLoading || isWrongNetwork}
        className="btn btn-primary"
        style={{ marginBottom: '1.25rem', width: '100%' }}
      >
        {isLoading ? statusMessage : 'Load All Students'}
      </button>

      {isLoading && (
        <div className="alert alert-info">
          <p className="status-heading">⏳ {statusMessage}</p>
        </div>
      )}

      {status === 'success' && students.length === 0 && !isLoading && (
        <div className="alert alert-info">
          <p>No registered students found on Ethereum Sepolia.</p>
        </div>
      )}

      {students.length > 0 && (
        <div className="students-grid" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {students.map((student, idx) => (
            <div
              key={student.address.toLowerCase()}
              className="student-card-item"
              style={{
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid var(--border, #e5e4e7)',
                borderRadius: '12px',
                padding: '1.25rem',
              }}
            >
              <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1.1rem', color: 'var(--accent, #aa3bff)' }}>
                Student #{idx + 1}
              </h3>

              <div className="info-row">
                <span className="info-label">Name:</span>
                <span className="info-value">{student.name}</span>
              </div>

              <div className="info-row">
                <span className="info-label">Age:</span>
                <span className="info-value">{student.age.toString()}</span>
              </div>

              <div className="info-row">
                <span className="info-label">Course:</span>
                <span className="info-value">{student.course}</span>
              </div>

              <div className="info-row" style={{ alignItems: 'center' }}>
                <span className="info-label">Address:</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <a
                    href={`https://sepolia.etherscan.io/address/${student.address}`}
                    target="_blank"
                    rel="noreferrer"
                    className="info-value address-badge"
                    title={student.address}
                    style={{ textDecoration: 'none' }}
                  >
                    {formatAddress(student.address)} ↗
                  </a>
                  <button
                    onClick={() => handleCopyAddress(student.address)}
                    className="btn btn-secondary"
                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', borderRadius: '6px' }}
                    title="Copy Address"
                  >
                    {copiedAddress === student.address ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default StudentList;
