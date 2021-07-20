import { BigNumber } from "ethers";

const padZero = (hex: string, bits: number) => hex.padStart(bits/4, '0');

export const packAdapterAndWeight = (address: string, weight: BigNumber) =>
  address
  .concat(padZero(weight.toHexString().slice(2), 96))
  .toLowerCase()