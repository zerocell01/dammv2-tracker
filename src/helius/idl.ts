// Anchor instruction discriminators for the DAMM v2 (cp_amm) program,
// taken from the official IDL: https://github.com/MeteoraAg/damm-v2-sdk
export const DISCRIMINATORS: Record<string, number[]> = {
  create_position: [48, 215, 197, 153, 96, 203, 180, 133],
  add_liquidity: [181, 157, 89, 67, 143, 182, 52, 72],
  remove_liquidity: [80, 85, 209, 72, 24, 206, 177, 108],
  remove_all_liquidity: [10, 51, 61, 35, 112, 105, 24, 85],
  close_position: [123, 134, 81, 0, 49, 68, 98, 98],
  claim_position_fee: [180, 38, 154, 17, 133, 33, 162, 211],
};

// Account index maps, per the IDL's ordered `accounts` array for each instruction.
export const ACCOUNTS = {
  create_position: { owner: 0, position_nft_mint: 1, position_nft_account: 2, pool: 3, position: 4 },
  add_liquidity: { pool: 0, position: 1, token_a_account: 2, token_b_account: 3, token_a_vault: 4, token_b_vault: 5, token_a_mint: 6, token_b_mint: 7, position_nft_account: 8, signer: 9 },
  remove_liquidity: { pool_authority: 0, pool: 1, position: 2, token_a_account: 3, token_b_account: 4, token_a_vault: 5, token_b_vault: 6, token_a_mint: 7, token_b_mint: 8, position_nft_account: 9, signer: 10 },
  remove_all_liquidity: { pool_authority: 0, pool: 1, position: 2, token_a_account: 3, token_b_account: 4, token_a_vault: 5, token_b_vault: 6, token_a_mint: 7, token_b_mint: 8, position_nft_account: 9, signer: 10 },
  close_position: { position_nft_mint: 0, position_nft_account: 1, pool: 2, position: 3, pool_authority: 4, rent_receiver: 5, owner: 6 },
  claim_position_fee: { pool_authority: 0, pool: 1, position: 2, token_a_account: 3, token_b_account: 4, token_a_vault: 5, token_b_vault: 6, token_a_mint: 7, token_b_mint: 8, position_nft_account: 9, signer: 10 },
};

function matches(dataBytes: Uint8Array, disc: number[]): boolean {
  if (dataBytes.length < 8) return false;
  for (let i = 0; i < 8; i++) if (dataBytes[i] !== disc[i]) return false;
  return true;
}

export function identifyInstruction(dataBytes: Uint8Array): keyof typeof DISCRIMINATORS | null {
  for (const name of Object.keys(DISCRIMINATORS) as (keyof typeof DISCRIMINATORS)[]) {
    if (matches(dataBytes, DISCRIMINATORS[name])) return name;
  }
  return null;
}
