import { ethers } from 'ethers';

export const SEPOLIA_CHAIN_ID = 11155111;
export const SEPOLIA_HEX_CHAIN_ID = '0xaa36a7';

/**
 * Checks if MetaMask or an Ethereum provider is available in the browser window.
 * @returns {boolean} True if window.ethereum exists, false otherwise.
 */
export function isMetaMaskInstalled() {
  return typeof window !== 'undefined' && Boolean(window.ethereum);
}

/**
 * Creates and returns an ethers BrowserProvider instance.
 * @returns {ethers.BrowserProvider}
 */
export function getBrowserProvider() {
  if (!isMetaMaskInstalled()) {
    throw new Error('MetaMask is not installed. Please install MetaMask to use this DApp.');
  }
  return new ethers.BrowserProvider(window.ethereum);
}

/**
 * Connects to MetaMask by requesting account access.
 * Returns connected account address and current chain ID.
 * @returns {Promise<{account: string, chainId: number, provider: ethers.BrowserProvider}>}
 */
export async function connectWallet() {
  if (!isMetaMaskInstalled()) {
    throw new Error('MetaMask is not installed. Please install the MetaMask browser extension.');
  }

  const provider = getBrowserProvider();

  // Request user accounts via MetaMask
  const accounts = await provider.send('eth_requestAccounts', []);
  if (!accounts || accounts.length === 0) {
    throw new Error('No accounts returned from MetaMask. Please unlock your wallet.');
  }

  const network = await provider.getNetwork();
  const chainId = Number(network.chainId);
  const account = accounts[0];

  return {
    account,
    chainId,
    provider,
  };
}

/**
 * Checks current connection state without prompting the user.
 * @returns {Promise<{account: string | null, chainId: number | null, isInstalled: boolean}>}
 */
export async function getCurrentWalletState() {
  if (!isMetaMaskInstalled()) {
    return { account: null, chainId: null, isInstalled: false };
  }

  try {
    const provider = getBrowserProvider();
    const accounts = await provider.send('eth_accounts', []);
    const network = await provider.getNetwork();
    const chainId = Number(network.chainId);

    return {
      account: accounts.length > 0 ? accounts[0] : null,
      chainId: chainId || null,
      isInstalled: true,
    };
  } catch (error) {
    console.error('Error getting initial wallet state:', error);
    return { account: null, chainId: null, isInstalled: true };
  }
}

/**
 * Prompts MetaMask to switch to the Sepolia test network.
 * Adds Sepolia network configuration if it is not present in MetaMask.
 */
export async function switchToSepolia() {
  if (!isMetaMaskInstalled()) {
    throw new Error('MetaMask is not installed.');
  }

  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: SEPOLIA_HEX_CHAIN_ID }],
    });
  } catch (switchError) {
    // Code 4902 indicates that the chain has not been added to MetaMask.
    if (switchError.code === 4902) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: SEPOLIA_HEX_CHAIN_ID,
            chainName: 'Ethereum Sepolia',
            nativeCurrency: {
              name: 'Sepolia Ether',
              symbol: 'ETH',
              decimals: 18,
            },
            rpcUrls: ['https://rpc.sepolia.org'],
            blockExplorerUrls: ['https://sepolia.etherscan.io'],
          },
        ],
      });
    } else {
      throw switchError;
    }
  }
}

/**
 * Truncates an Ethereum address for UI display.
 * @param {string} address - Full Ethereum address
 * @returns {string} Shortened address e.g. 0x1234...abcd
 */
export function formatAddress(address) {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
