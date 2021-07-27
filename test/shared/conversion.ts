import { BigNumber } from "ethers";
import { AaveV2Erc20Adapter, CErc20Adapter, ICToken, IERC20, IErc20Adapter, IToken } from "../../typechain";
import { getBigNumber, getContract } from "./utils";
import { ConvertHelper } from '../../@types/augmentations'

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
  getRewardsTokenAndAPR: async (adapter): Promise<[string, BigNumber]> => {
    const cAdapter: CErc20Adapter = await getContract(adapter.address, 'CErc20Adapter')
    const rewardsAPR = await cAdapter.getRewardsAPR()
    if (rewardsAPR.eq(0)) return ['', rewardsAPR]
    return [
      '0xc00e94Cb662C3520282E6f5717214004A7f26888',
      rewardsAPR
    ]
  },
  protocolName: 'Compound',
  symbolPrefix: 'c'
}

export const CreamConverter = {
  liquidityHolder: CompoundConverter.liquidityHolder,
  toWrapped: CompoundConverter.toWrapped,
  toUnderlying: CompoundConverter.toUnderlying,
  protocolName: 'Cream',
  symbolPrefix: 'cr'
};

export const IronBankConverter = {
  useWrappedEther: true,
  liquidityHolder: CompoundConverter.liquidityHolder,
  toWrapped: CompoundConverter.toWrapped,
  toUnderlying: CompoundConverter.toUnderlying,
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
  useWrappedEther: true,
  liquidityHolder: async (token) => token.address,
  toWrapped: async (_, amount) => { return amount; },
  toUnderlying: async (_, amount) => { return amount; },
  getRewardsTokenAndAPR: async (adapter): Promise<[string, BigNumber]> => {
    const aAdapter: AaveV2Erc20Adapter = await getContract(adapter.address, 'AaveV2Erc20Adapter')
    const rewardsAPR = await aAdapter.getRewardsAPR()
    if (rewardsAPR.eq(0)) return ['', rewardsAPR]
    return [
      '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9',
      rewardsAPR
    ]
  },
  protocolName: 'Aave V2',
  symbolPrefix: 'a'
}

export const FulcrumConverter: ConvertHelper = {
  useWrappedEther: true,
  liquidityHolder: async (token) => token.address,
  toWrapped: async (token, amount, withdrawUnderlying?: boolean) => {
    const c: IToken = await getContract(token.address, 'IToken');
    const rate = await c.tokenPrice({ blockTag: 'pending' });
    let q = amount.mul(getBigNumber(1)).div(rate);
    if (withdrawUnderlying && !q.mul(rate).eq(amount)) {
      q = q.add(1);
    }
    return q;
  },
  toUnderlying: async (token, amount) => {
    const c: IToken = await getContract(token.address, 'IToken');
    const rate = await c.tokenPrice({ blockTag: 'pending' });
    return amount.mul(rate).div(getBigNumber(1));
  },
  protocolName: 'Fulcrum',
  symbolPrefix: 'i',
}