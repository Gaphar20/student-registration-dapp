import { ethers } from 'ethers';
import { getBrowserProvider, SEPOLIA_CHAIN_ID } from './wallet';

export const CONTRACT_ADDRESS = '0xa551cb621e1b7b2350049d842bf73C1c4e89a126';

export const CONTRACT_ABI = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_student",
        "type": "address"
      }
    ],
    "name": "getStudent",
    "outputs": [
      {
        "internalType": "string",
        "name": "name",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "age",
        "type": "uint256"
      },
      {
        "internalType": "string",
        "name": "course",
        "type": "string"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "_name",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "_age",
        "type": "uint256"
      },
      {
        "internalType": "string",
        "name": "_course",
        "type": "string"
      }
    ],
    "name": "register",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "registered",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
];

/**
 * Helper to obtain an ethers Contract instance.
 * @param {ethers.ContractRunner} [runner] - Optional provider or signer. Defaults to BrowserProvider.
 * @returns {ethers.Contract}
 */
export function getContract(runner) {
  const contractRunner = runner || getBrowserProvider();
  return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, contractRunner);
}

/**
 * Checks if a student address is registered in the contract.
 * @param {string} address - Student Ethereum address
 * @param {ethers.ContractRunner} [runner] - Optional provider or signer
 * @returns {Promise<boolean>}
 */
export async function isStudentRegistered(address, runner) {
  if (!address || !ethers.isAddress(address)) {
    throw new Error('Invalid Ethereum address provided.');
  }

  try {
    const contract = getContract(runner);
    const isRegistered = await contract.registered(address);
    return Boolean(isRegistered);
  } catch (error) {
    console.error('Error checking student registration status:', error);
    throw new Error(error.reason || error.message || 'Failed to query registration status from contract.');
  }
}

/**
 * Fetches registered student details from the smart contract.
 * @param {string} address - Student Ethereum address
 * @param {ethers.ContractRunner} [runner] - Optional provider or signer
 * @returns {Promise<{name: string, age: number|bigint, course: string}>}
 */
export async function getStudent(address, runner) {
  if (!address || !ethers.isAddress(address)) {
    throw new Error('Invalid Ethereum address provided.');
  }

  try {
    const contract = getContract(runner);
    const result = await contract.getStudent(address);

    let age = result.age;
    if (typeof age === 'bigint') {
      if (age <= BigInt(Number.MAX_SAFE_INTEGER)) {
        age = Number(age);
      }
    }

    return {
      name: result.name,
      age,
      course: result.course,
    };
  } catch (error) {
    console.error('Error fetching student details:', error);
    throw new Error(error.reason || error.message || 'Failed to fetch student details from contract.');
  }
}

/**
 * Registers a new student on the smart contract.
 * @param {string} name - Student full name
 * @param {number|string} age - Student age (positive integer)
 * @param {string} course - Course name
 * @returns {Promise<{txHash: string, waitReceipt: Function}>}
 */
export async function registerStudent(name, age, course) {
  if (!name || typeof name !== 'string' || name.trim() === '') {
    throw new Error('Student name is required.');
  }

  const numericAge = Number(age);
  if (isNaN(numericAge) || !Number.isInteger(numericAge) || numericAge <= 0) {
    throw new Error('Age must be a positive whole number.');
  }

  if (!course || typeof course !== 'string' || course.trim() === '') {
    throw new Error('Course name is required.');
  }

  try {
    const provider = getBrowserProvider();
    const network = await provider.getNetwork();
    if (Number(network.chainId) !== SEPOLIA_CHAIN_ID) {
      throw new Error('Wallet is on the wrong network. Please switch to Ethereum Sepolia.');
    }

    const signer = await provider.getSigner();
    const contract = getContract(signer);

    // Call contract register function
    const tx = await contract.register(name.trim(), numericAge, course.trim());

    return {
      txHash: tx.hash,
      tx,
      waitReceipt: async () => await tx.wait(),
    };
  } catch (error) {
    console.error('Error during student registration:', error);
    if (error.code === 'ACTION_REJECTED' || (error.message && error.message.includes('user rejected'))) {
      throw new Error('Transaction was rejected in MetaMask.');
    }
    if (error.code === 'INSUFFICIENT_FUNDS' || (error.message && error.message.includes('insufficient funds'))) {
      throw new Error('Insufficient ETH in wallet to cover gas fees.');
    }
    throw new Error(error.reason || error.message || 'Student registration transaction failed.');
  }
}
