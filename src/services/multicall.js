import { ethers } from 'ethers';
import { isMetaMaskInstalled, getBrowserProvider, SEPOLIA_CHAIN_ID } from './wallet';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from './contract';

export const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11';

export const MULTICALL3_ABI = [
  {
    "inputs": [
      {
        "components": [
          {
            "internalType": "address",
            "name": "target",
            "type": "address"
          },
          {
            "internalType": "bool",
            "name": "allowFailure",
            "type": "bool"
          },
          {
            "internalType": "bytes",
            "name": "callData",
            "type": "bytes"
          }
        ],
        "internalType": "struct Multicall3.Call3[]",
        "name": "calls",
        "type": "tuple[]"
      }
    ],
    "name": "aggregate3",
    "outputs": [
      {
        "components": [
          {
            "internalType": "bool",
            "name": "success",
            "type": "bool"
          },
          {
            "internalType": "bytes",
            "name": "returnData",
            "type": "bytes"
          }
        ],
        "internalType": "struct Multicall3.Result[]",
        "name": "returnData",
        "type": "tuple[]"
      }
    ],
    "stateMutability": "payable",
    "type": "function"
  }
];

// Fallback public RPC URL for Ethereum Sepolia when wallet is disconnected
const FALLBACK_SEPOLIA_RPC = 'https://ethereum-sepolia-rpc.publicnode.com';

/**
 * Returns an active provider (MetaMask provider if available, or fallback public Sepolia provider).
 */
export function getReadProvider() {
  if (isMetaMaskInstalled()) {
    try {
      return getBrowserProvider();
    } catch (e) {
      console.warn('Browser provider error, using fallback RPC provider:', e);
    }
  }
  return new ethers.JsonRpcProvider(FALLBACK_SEPOLIA_RPC);
}

/**
 * Discovers candidate student addresses that have called register(string,uint256,string) on the contract.
 * Uses fully paginated requests to Blockscout API v2.
 * @param {Function} [onProgress] - Optional callback function for real-time progress updates.
 * @returns {Promise<{addresses: string[], warning: string|null}>}
 */
export async function discoverStudentAddresses(onProgress) {
  const discoveredAddresses = [];
  const studentInterface = new ethers.Interface(CONTRACT_ABI);
  const registerSelector = studentInterface.getFunction('register').selector;

  let warning = null;
  let page = 1;
  let currentUrl = `https://eth-sepolia.blockscout.com/api/v2/addresses/${CONTRACT_ADDRESS}/transactions`;
  const visitedUrls = new Set();
  const MAX_PAGES = 100; // Safeguard against infinite pagination loops

  try {
    while (currentUrl && !visitedUrls.has(currentUrl) && page <= MAX_PAGES) {
      visitedUrls.add(currentUrl);

      if (onProgress) {
        onProgress(`Checking transaction history (Page ${page})...`);
      }

      const response = await fetch(currentUrl);

      if (!response.ok) {
        throw new Error(`Blockscout API HTTP error ${response.status} on page ${page}`);
      }

      const data = await response.json();
      const items = data.items || [];

      for (const tx of items) {
        // Check if transaction was successful and calldata starts with register selector (0x637a0832)
        const rawInput = tx.raw_input || tx.input || '';
        const isError = tx.is_error || tx.status === '0';

        if (!isError && rawInput.toLowerCase().startsWith(registerSelector.toLowerCase())) {
          const sender = tx.from?.hash || tx.from;
          if (sender && typeof sender === 'string' && ethers.isAddress(sender)) {
            discoveredAddresses.push(sender);
          }
        }
      }

      // Pagination check: Blockscout API v2 returns next_page_params object when additional pages exist
      if (
        data.next_page_params &&
        typeof data.next_page_params === 'object' &&
        Object.keys(data.next_page_params).length > 0
      ) {
        const queryParams = new URLSearchParams(data.next_page_params).toString();
        const nextUrl = `https://eth-sepolia.blockscout.com/api/v2/addresses/${CONTRACT_ADDRESS}/transactions?${queryParams}`;

        // Infinite loop prevention check
        if (visitedUrls.has(nextUrl)) {
          console.warn('Blockscout pagination repeated an existing URL; stopping pagination loop.');
          break;
        }

        currentUrl = nextUrl;
        page++;
      } else {
        currentUrl = null;
      }
    }
  } catch (error) {
    console.error('Paginated address discovery error:', error);
    if (discoveredAddresses.length === 0) {
      throw new Error(`Historical student discovery failed: ${error.message}`);
    } else {
      warning = `Notice: Address discovery stopped on page ${page} due to an API error (${error.message}). Fetched data from ${discoveredAddresses.length} transaction(s).`;
    }
  }

  // Deduplicate and normalize all discovered addresses to lowercase across all pages
  const uniqueAddresses = [...new Set(
    discoveredAddresses
      .filter((address) => address && typeof address === 'string' && ethers.isAddress(address))
      .map((address) => address.toLowerCase())
  )];

  return {
    addresses: uniqueAddresses,
    warning,
  };
}

/**
 * Fetches student data for candidate addresses using a single Multicall3 aggregate3 call.
 * @param {string[]} addresses - Array of candidate student addresses
 * @param {ethers.Provider} [customProvider] - Optional custom provider
 * @returns {Promise<Array<{address: string, name: string, age: number|bigint, course: string}>>}
 */
export async function fetchStudentsWithMulticall(addresses, customProvider) {
  if (!addresses || addresses.length === 0) {
    return [];
  }

  // Normalize addresses to lowercase and deduplicate
  const normalizedAddresses = [...new Set(
    addresses
      .filter((addr) => addr && typeof addr === 'string' && ethers.isAddress(addr))
      .map((addr) => addr.toLowerCase())
  )];

  if (normalizedAddresses.length === 0) {
    return [];
  }

  const provider = customProvider || getReadProvider();

  // Validate chain if provider is connected to network
  try {
    const network = await provider.getNetwork();
    if (Number(network.chainId) !== SEPOLIA_CHAIN_ID) {
      throw new Error(`Wallet/Provider is connected to Chain ID ${network.chainId}. Please switch to Sepolia (Chain ID 11155111).`);
    }
  } catch (err) {
    if (err.message && err.message.includes('switch to Sepolia')) {
      throw err;
    }
    // Ignore fallback provider network check errors
  }

  const studentInterface = new ethers.Interface(CONTRACT_ABI);

  // 1. Build all calldata array for Multicall3
  const calls = normalizedAddresses.map((studentAddress) => ({
    target: CONTRACT_ADDRESS,
    allowFailure: true,
    callData: studentInterface.encodeFunctionData('getStudent', [studentAddress]),
  }));

  // 2. Send ONE aggregate3 call to Multicall3 contract
  const multicallContract = new ethers.Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, provider);
  const returnData = await multicallContract.aggregate3.staticCall(calls);

  // 3. Decode all returned results
  const students = [];

  returnData.forEach((result, index) => {
    if (result.success && result.returnData && result.returnData !== '0x') {
      try {
        const decoded = studentInterface.decodeFunctionResult('getStudent', result.returnData);

        let age = decoded.age;
        if (typeof age === 'bigint') {
          if (age <= BigInt(Number.MAX_SAFE_INTEGER)) {
            age = Number(age);
          }
        }

        const name = decoded.name;
        const course = decoded.course;

        // Keep successful students with non-empty registered name
        if (name && name.trim() !== '') {
          students.push({
            address: normalizedAddresses[index],
            name,
            age,
            course,
          });
        }
      } catch (decodeErr) {
        console.warn(`Failed to decode result for address ${normalizedAddresses[index]}:`, decodeErr);
      }
    }
  });

  return students;
}
