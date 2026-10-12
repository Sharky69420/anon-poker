/* ═══════════════════════════════════════════════════════════════
   ZANO COMPANION CONNECT — ZEC Poker
   ───────────────────────────────────────────────────────────────
   Replaces the fake "utest1de...zec" placeholder identity with a
   real signed wallet connection via the Zano Companion extension.

   STATUS OF EACH PIECE, HONESTLY:
   - connectWallet() / REQUEST_ACCESS / GET_WALLET_DATA: built against
     Zano's own published blog post on the Companion permission system
     (June 15, 2026 rollout). Confirmed real.
   - signAuthMessage(): the METHOD NAME is inferred (REQUEST_MESSAGE_SIGN,
     per earlier project notes) but I could not find an official docs
     page confirming its exact parameter shape. DO NOT trust this blindly
     — the first time you test with a real Companion + funded wallet,
     open devtools, watch what window.zano actually returns, and we'll
     correct this on the spot if the shape differs.
   - No send/cash-out call is included yet. That's Ionic Swaps territory,
     a separate, larger piece — build once wallet-connect is proven live.

   HOW TO WIRE THIS IN:
   Once you can test live (Companion installed, desktop wallet paired,
   testnet address funded from a faucet), tell me and I'll splice this
   into zec-poker-preview.html in place of the fake identity generator,
   then we debug the real handshake together against your actual setup
   rather than me guessing blind.
   ═══════════════════════════════════════════════════════════════ */

const ZanoConnect = (() => {
  let connected = false;
  let walletData = null; // {address, alias, balance?, assets?, transactions?}

  function hasCompanion() {
    return typeof window !== 'undefined' && !!window.zano;
  }

  /**
   * Step 1: ask permission. Must happen before any other call, on every
   * extension version from June 15 2026 onward. Older extensions don't
   * know this method at all — that's how we detect them and fall back.
   */
  async function requestAccess() {
    if (!hasCompanion()) {
      throw new Error('Zano Companion not detected — is the extension installed and unlocked?');
    }
    try {
      await window.zano.request('REQUEST_ACCESS', {
        permissions: [
          { type: 'general' },  // address + alias — required for every subsequent call
          { type: 'balance' },  // wallet balance + assets (needed to show real ZEC/Zchip stacks)
          { type: 'history' },  // transaction history (optional — nice-to-have for a "recent activity" view later)
        ],
      });
      return { legacyExtension: false };
    } catch (e) {
      if (e && e.error === 'Unknown method: REQUEST_ACCESS') {
        // Pre-permission-system extension. Per Zano's own migration guidance:
        // treat this as "no permission gate on this version" and continue
        // with the legacy flow (skip straight to GET_WALLET_DATA).
        return { legacyExtension: true };
      }
      if (e && e.error === 'User rejected the access request') {
        throw new Error('Connection was declined in the Companion popup.');
      }
      throw e;
    }
  }

  /**
   * Step 2: pull the actual wallet data once access is granted.
   */
  async function getWalletData() {
    if (!hasCompanion()) throw new Error('Zano Companion not detected.');
    const data = await window.zano.request('GET_WALLET_DATA', {});
    // Expected shape per Zano's docs: address and alias always present;
    // balance/assets present only if the 'balance' permission was granted;
    // transactions present only if 'history' was granted.
    return data;
  }

  /**
   * Full connect flow: request access, then pull wallet data.
   * Returns {address, alias, balance, assets, legacyExtension}.
   */
  async function connectWallet() {
    const { legacyExtension } = await requestAccess();
    const data = await getWalletData();
    walletData = data;
    connected = true;
    return { ...data, legacyExtension };
  }

  /**
   * ⚠️ UNCONFIRMED SHAPE — verify against a live Companion instance.
   * Intent: prove wallet ownership by signing a server-issued nonce/
   * challenge string, the same pattern MetaMask uses for "Sign-In With
   * Ethereum." Method name is a best guess pending live testing.
   */
  async function signAuthMessage(message) {
    if (!hasCompanion()) throw new Error('Zano Companion not detected.');
    if (!connected) throw new Error('Call connectWallet() before signing.');
    // TODO verify: method name, whether it takes {message} or a raw string,
    // and the exact shape of the returned signature object.
    const result = await window.zano.request('REQUEST_MESSAGE_SIGN', { message });
    return result; // expected: { signature, address } — UNCONFIRMED
  }

  function isConnected() { return connected; }
  function currentWallet() { return walletData; }

  function disconnect() {
    connected = false;
    walletData = null;
    // Companion doesn't have a documented programmatic "revoke" call as
    // far as I could confirm — actual revocation happens on the user's
    // side, in the extension's own permissions UI, per-site.
  }

  return { hasCompanion, connectWallet, signAuthMessage, isConnected, currentWallet, disconnect };
})();

/* ── Example usage (not auto-run — call this from a "Connect Wallet" button) ──

document.getElementById('connectWalletBtn').onclick = async () => {
  if (!ZanoConnect.hasCompanion()) {
    alert('Install the Zano Companion extension first: chromewebstore.google.com/detail/zano-companion/akcgnllhhhkcpmlenfpicmcpgfpindlb');
    return;
  }
  try {
    const wallet = await ZanoConnect.connectWallet();
    console.log('Connected:', wallet.address, wallet.alias, wallet.legacyExtension ? '(legacy extension, no permission gate)' : '');
    // Replace the fake utest1... identity here with wallet.address / wallet.alias
  } catch (e) {
    console.error('Connect failed:', e.message);
  }
};

*/
