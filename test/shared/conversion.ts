import { BigNumber } from "ethers";
import { ICToken, IERC20, IToken } from "../../typechain";
import { getBigNumber, getContract } from "./utils";

export interface ConvertHelper {
  liquidityHolder(token: IERC20): Promise<string>;
  toWrapped(token: IERC20, amount: BigNumber, withdrawUnderlying?: boolean): Promise<BigNumber>;
  toUnderlying(token: IERC20, amount: BigNumber): Promise<BigNumber>;
}

export const CompoundConverter: ConvertHelper = {
  liquidityHolder: async (token) => token.address,
  toWrapped: async (cToken, amount) => {
    const c: ICToken = await getContract(cToken.address, 'ICToken');
    const rate = await c.callStatic.exchangeRateCurrent({ blockTag: 'pending' });
    return amount.mul(getBigNumber(1)).div(rate);
  },
  toUnderlying: async (cToken, amount) => {
    const c: ICToken = await getContract(cToken.address, 'ICToken');
    const rate = await c.callStatic.exchangeRateCurrent({ blockTag: 'pending' });
    return amount.mul(rate).div(getBigNumber(1));
  }
}

export const CreamConverter = CompoundConverter;
export const IronBankConverter = CreamConverter;

export const AaveV1Converter: ConvertHelper = {
  liquidityHolder: async (_) => '0x3dfd23A6c5E8BbcFc9581d2E864a68feb6a076d3',
  toWrapped: async (_, amount) => { return amount; },
  toUnderlying: async (_, amount) => { return amount; },
}

export const AaveV2Converter: ConvertHelper = {
  liquidityHolder: async (token) => token.address,
  toWrapped: async (_, amount) => { return amount; },
  toUnderlying: async (_, amount) => { return amount; },
}

export const FulcrumConverter: ConvertHelper = {
  liquidityHolder: async (_) => '0xD8Ee69652E4e4838f2531732a46d1f7F584F0b7f',
  toUnderlying: async (token, amount) => {
    const c: IToken = await getContract(token.address, 'IToken');
    const rate = await c.tokenPrice({ blockTag: 'pending' });
    return amount.mul(rate).div(getBigNumber(1));
  },
  toWrapped: async (token, amount, withdrawUnderlying?: boolean) => {
    const c: IToken = await getContract(token.address, 'IToken');
    const rate = await c.tokenPrice({ blockTag: 'pending' });
    let q = amount.mul(getBigNumber(1)).div(rate);
    if (withdrawUnderlying && !q.mul(rate).eq(amount)) {
      q = q.add(1);
    }
    return q;
  }
}