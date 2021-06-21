import { BigNumber } from "ethers";
import { ICToken, IERC20, IToken } from "../../typechain";
import { getBigNumber, getContract } from "./utils";

export interface ConvertHelper {
  toWrapped(token: IERC20, amount: BigNumber, withdrawUnderlying?: boolean): Promise<BigNumber>;
  toUnderlying(token: IERC20, amount: BigNumber): Promise<BigNumber>;
}

export const CompoundConverter: ConvertHelper = {
  toWrapped: async (cToken: IERC20, amount: BigNumber): Promise<BigNumber> => {
    const c: ICToken = await getContract(cToken.address, 'ICToken');
    const rate = await c.callStatic.exchangeRateCurrent({ blockTag: 'pending' });
    return amount.mul(getBigNumber(1)).div(rate);
  },
  toUnderlying: async (cToken: IERC20, amount: BigNumber): Promise<BigNumber> => {
    const c: ICToken = await getContract(cToken.address, 'ICToken');
    const rate = await c.callStatic.exchangeRateCurrent({ blockTag: 'pending' });
    return amount.mul(rate).div(getBigNumber(1));
  }
}

export const CreamConverter = CompoundConverter;
export const IronBankConverter = CreamConverter;

export const AaveConverter: ConvertHelper = {
  toWrapped: async (_: IERC20, amount: BigNumber): Promise<BigNumber> => { return amount; },
  toUnderlying: async (_: IERC20, amount: BigNumber): Promise<BigNumber> => { return amount; },
}

export const FulcrumConverter = {
  toUnderlying: async (token: IERC20, amount: BigNumber) => {
    const c: IToken = await getContract(token.address, 'IToken');
    const rate = await c.tokenPrice({ blockTag: 'pending' });
    return amount.mul(rate).div(getBigNumber(1));
  },
  toWrapped: async (token: IERC20, amount: BigNumber, withdrawUnderlying?: boolean) => {
    const c: IToken = await getContract(token.address, 'IToken');
    const rate = await c.tokenPrice({ blockTag: 'pending' });
    let q = amount.mul(getBigNumber(1)).div(rate);
    if (withdrawUnderlying && !q.mul(rate).eq(amount)) {
      q = q.add(1);
    }
    return q;
  }
}