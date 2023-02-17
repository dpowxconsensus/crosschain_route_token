export enum Chains {
  alfajores = "alfajores",
  arbitrum = "arbitrum",
  arbitrumgoerli = "arbitrumgoerli",
  avalanche = "avalanche",
  bsc = "bsc",
  bsctestnet = "bsctestnet",
  celo = "celo",
  ethereum = "ethereum",
  fuji = "fuji",
  goerli = "goerli",
  moonbasealpha = "moonbasealpha",
  moonbeam = "moonbeam",
  mumbai = "mumbai",
  optimism = "optimism",
  optimismgoerli = "optimismgoerli",
  polygon = "polygon",
  chainA = "chainA",
  chainB = "chainB",
}

export type ChainName = keyof typeof Chains;
