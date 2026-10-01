import { useState, useCallback } from 'react';
import {
  isStudentRegistered,
  getStudent,
  registerStudent,
} from '../services/contract';
import { formatAddress, SEPOLIA_CHAIN_ID } from '../services/wallet';

function RegisterStudent({
  account,
  chainId,
  isCheckingReg,
  regStatus,
  studentDetails,
  onRegistrationUpdate,
}) {
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [course, setCourse] = useState('');

  // Local submission status: 'idle' | 'validating' | 'checking' | 'waiting_confirmation' | 'tx_pending' | 'success' | 'error'
  const [status, setStatus] = useState('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [txHash, setTxHash] = useState(null);
  const [formError, setFormError] = useState(null);
  const [txStudentData, setTxStudentData] = useState(null);

  const isSubmitting =
    status === 'validating' ||
    status === 'checking' ||
    status === 'waiting_confirmation' ||
    status === 'tx_pending';

  // Derived registration status from parent (single source of truth)
  const isAlreadyRegistered =
    regStatus === 'registered' && status !== 'success';

  const effectiveStatus = isCheckingReg
    ? 'checking'
    : isAlreadyRegistered
    ? 'already_registered'
    : status;

  const effectiveStatusMessage = isCheckingReg
    ? `Checking registration status for ${formatAddress(account)}...`
    : isAlreadyRegistered
    ? 'You are already registered.'
    : statusMessage;

  const effectiveStudentData = isAlreadyRegistered
    ? { ...studentDetails, address: account }
    : txStudentData;

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      setFormError(null);
      setTxHash(null);
      setTxStudentData(null);
      setStatus('validating');

      // 1. Validation Checks
      if (!account || account === '0x0000000000000000000000000000000000000000') {
        setFormError('Please connect your MetaMask wallet before registering.');
        setStatus('idle');
        return;
      }

      if (chainId !== SEPOLIA_CHAIN_ID) {
        setFormError('Please switch to Ethereum Sepolia network before registering.');
        setStatus('idle');
        return;
      }

      const trimmedName = name.trim();
      const trimmedCourse = course.trim();
      const numAge = Number(age);

      if (!trimmedName) {
        setFormError('Student name is required.');
        setStatus('idle');
        return;
      }

      if (!age || isNaN(numAge) || !Number.isInteger(numAge) || numAge <= 0) {
        setFormError('Age must be a positive whole number (e.g. 20).');
        setStatus('idle');
        return;
      }

      if (!trimmedCourse) {
        setFormError('Course name is required.');
        setStatus('idle');
        return;
      }

      try {
        // 2. Check if already registered
        setStatus('checking');
        setStatusMessage('Checking existing registration status...');

        const alreadyRegistered = await isStudentRegistered(account);
        if (alreadyRegistered) {
          setStatus('already_registered');
          setStatusMessage('You are already registered.');
          const details = await getStudent(account);
          const data = { ...details, address: account };
          setTxStudentData(data);
          if (onRegistrationUpdate) {
            onRegistrationUpdate(data);
          }
          return;
        }

        // 3. Initiate Transaction Flow
        setStatus('waiting_confirmation');
        setStatusMessage('Waiting for MetaMask confirmation...');

        const { txHash: hash, waitReceipt } = await registerStudent(
          trimmedName,
          numAge,
          trimmedCourse
        );

        setTxHash(hash);
        setStatus('tx_pending');
        setStatusMessage('Transaction submitted... Waiting for block confirmation.');

        // 4. Wait for mined transaction
        await waitReceipt();

        setStatus('success');
        setStatusMessage('Student registered successfully!');

        // Clear form inputs
        setName('');
        setAge('');
        setCourse('');

        // 5. Automatically fetch newly registered student details
        const registeredState = await isStudentRegistered(account);
        if (registeredState) {
          const details = await getStudent(account);
          const data = { ...details, address: account };
          setTxStudentData(data);
          if (onRegistrationUpdate) {
            onRegistrationUpdate(data);
          }
        }
      } catch (err) {
        console.error('Registration submit error:', err);
        setStatus('error');
        setFormError(err.message || 'An error occurred during registration.');
      }
    },
    [account, chainId, name, age, course, onRegistrationUpdate]
  );

  return (
    <div className="card register-card">
      <h2>Register Student</h2>

      {formError && (
        <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
          <p>🚨 {formError}</p>
        </div>
      )}

      {effectiveStatusMessage && (
        <div
          className={`alert ${
            effectiveStatus === 'success'
              ? 'alert-success'
              : effectiveStatus === 'already_registered'
              ? 'alert-warning'
              : 'alert-info'
          }`}
          style={{ marginBottom: '1rem' }}
        >
          <p className="status-heading">{effectiveStatusMessage}</p>

          {txHash && (
            <p className="tx-hash-link" style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
              Transaction Hash:{' '}
              <a
                href={`https://sepolia.etherscan.io/tx/${txHash}`}
                target="_blank"
                rel="noreferrer"
                style={{ color: 'inherit', textDecoration: 'underline', fontFamily: 'monospace' }}
              >
                {formatAddress(txHash)} ↗
              </a>
            </p>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="registration-form">
        <div className="form-group">
          <label htmlFor="student-name">Full Name *</label>
          <input
            id="student-name"
            type="text"
            placeholder="e.g. Alice Smith"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isSubmitting || isCheckingReg || isAlreadyRegistered}
            required
            className="form-input"
          />
        </div>

        <div className="form-group" style={{ marginTop: '1rem' }}>
          <label htmlFor="student-age">Age *</label>
          <input
            id="student-age"
            type="number"
            min="1"
            step="1"
            placeholder="e.g. 21"
            value={age}
            onChange={(e) => setAge(e.target.value)}
            disabled={isSubmitting || isCheckingReg || isAlreadyRegistered}
            required
            className="form-input"
          />
        </div>

        <div className="form-group" style={{ marginTop: '1rem' }}>
          <label htmlFor="student-course">Course *</label>
          <input
            id="student-course"
            type="text"
            placeholder="e.g. Computer Science"
            value={course}
            onChange={(e) => setCourse(e.target.value)}
            disabled={isSubmitting || isCheckingReg || isAlreadyRegistered}
            required
            className="form-input"
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting || isCheckingReg || !account || chainId !== SEPOLIA_CHAIN_ID || isAlreadyRegistered}
          className="btn btn-primary"
          style={{ marginTop: '1.5rem', width: '100%' }}
        >
          {isSubmitting ? 'Processing Transaction...' : 'Register Student'}
        </button>
      </form>

      {effectiveStudentData && (
        <div className="card student-details-card" style={{ marginTop: '1.5rem', background: 'rgba(16, 185, 129, 0.08)', borderColor: 'rgba(16, 185, 129, 0.3)' }}>
          <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1.1rem', color: '#10b981' }}>
            🎓 Student Details
          </h3>
          <div className="info-row">
            <span className="info-label">Name:</span>
            <span className="info-value">{effectiveStudentData.name}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Age:</span>
            <span className="info-value">{effectiveStudentData.age.toString()}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Course:</span>
            <span className="info-value">{effectiveStudentData.course}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Address:</span>
            <span className="info-value address-badge" title={effectiveStudentData.address}>
              {formatAddress(effectiveStudentData.address)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default RegisterStudent;
