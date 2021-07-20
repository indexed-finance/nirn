import { BigNumber } from "ethers";
import { ICToken, IERC20, IToken } from "../../typechain";
import { getBigNumber, getContract, getIERC20 } from "./utils";

export interface ConvertHelper {
  liquidityHolder(token: IERC20): Promise<string>;
  toWrapped(token: IERC20, amount: BigNumber, withdrawUnderlying?: boolean): Promise<BigNumber>;
  toUnderlying(token: IERC20, amount: BigNumber): Promise<BigNumber>;
  reduceLiquidity?: (token: IERC20, amount: BigNumber) => Promise<void>;
  protocolName: string;
  symbolPrefix: string;
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
  },
  protocolName: 'Compound',
  symbolPrefix: 'c'
}

export const CreamConverter = {
  ...CompoundConverter,
  protocolName: 'Cream',
  symbolPrefix: 'cr'
};

export const IronBankConverter = {
  ...CompoundConverter,
  protocolName: 'IronBank',
  symbolPrefix: 'cy'
};

export const AaveV1Converter: ConvertHelper = {
  liquidityHolder: async (_) => '0x3dfd23A6c5E8BbcFc9581d2E864a68feb6a076d3',
  toWrapped: async (_, amount) => { return amount; },
  toUnderlying: async (_, amount) => { return amount; },
  protocolName: 'Aave V1',
  symbolPrefix: 'a'
}

export const AaveV2Converter: ConvertHelper = {
  liquidityHolder: async (token) => token.address,
  toWrapped: async (_, amount) => { return amount; },
  toUnderlying: async (_, amount) => { return amount; },
  protocolName: 'Aave V2',
  symbolPrefix: 'a'
}

export const FulcrumConverter: ConvertHelper = {
  liquidityHolder: async (token) => token.address,
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
  },
  protocolName: 'Fulcrum',
  symbolPrefix: 'i',
}