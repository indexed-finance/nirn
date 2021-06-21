import { getAddress } from "@ethersproject/address"
import { expect } from "chai"
import { BigNumber, constants } from "ethers"
import { waffle } from "hardhat"
import { YErc20Adapter, IVault, IERC20 } from "../../typechain"
import { advanceBlock, deployContract, getContract, sendTokenTo, getBigNumber, deployClone } from '../shared'



describe('YErc20Adapter', () => {
  const [wallet, wallet1] = waffle.provider.getWallets();
  let implementation: YErc20Adapter;
  let adapter: YErc20Adapter;
  let token: IERC20;
  let yToken: IERC20;

  before('Deploy implementation', async () => {
    implementation = await deployContract('YErc20Adapter');
  })

  const testAdapter = (underlying: string, ytoken: string, symbol: string) => describe(`y${symbol}`, () => {
    let amountDeposited: BigNumber;
    let amountMinted: BigNumber;
    
    before(async () => {
      token = await getContract(underlying, 'IERC20')
      yToken = await getContract(ytoken, 'IERC20')
      adapter = await deployClone(implementation, 'YErc20Adapter');
      await adapter["initialize(address,address,string)"](token.address, yToken.address, 'Yearn');
      await token.approve(adapter.address, constants.MaxUint256);
      await yToken.approve(adapter.address, constants.MaxUint256);
      amountDeposited = await getTokens(10)
    })

    const wrappedToUnderlying = async (amount: BigNumber) => {
      const y: IVault = await getContract(yToken.address, 'IVault');
      const rate = await  y.getPricePerFullShare();
      return amount.mul(rate).div(getBigNumber(1));
    }

    const underlyingToWrapped = async (amount: BigNumber, roundUp = false) => {
      const y: IVault = await getContract(yToken.address, 'IVault');
      const rate = await y.getPricePerFullShare();
      let q = amount.mul(getBigNumber(1)).div(rate);
      if (roundUp && !q.mul(rate).eq(amount)) {
        q = q.add(1);
      }
      return q;
    }

    async function getPricePerFullShareCalculated() {

    const y: IVault = await getContract(yToken.address, 'IVault');
    const balance = await adapter.balanceWrapped();
    const currentTotalSupply = await y.totalSupply();
    const yBalance = await y.balance();
    let pricePerFullShare =  balance.mul(yBalance).div(currentTotalSupply);
    return pricePerFullShare;
    }

    async function getTokens(amount: number) {
      const decimals = await (await getContract(underlying, 'IERC20Metadata')).decimals();
      const tokenAmount = getBigNumber(amount, decimals);
      console.log('decimals', decimals.toString(), 'tokenAmount', tokenAmount.toString())
      await sendTokenTo(underlying, wallet.address, tokenAmount);
      return tokenAmount;
    }
  
    describe('settings', () => {
      it('name()', async () => {
        expect(await adapter.name()).to.eq(`Yearn ${symbol} Adapter`);
      })
  
      it('token()', async () => {
        expect(await adapter.token()).to.eq(yToken.address);
      })
  
      it('underlying()', async () => {
        expect(await adapter.underlying()).to.eq(token.address);
      })
    })
  
    describe('deposit()', () => {
      it('Should revert if caller has insufficient balance', async () => {
        await expect(adapter.connect(wallet1).deposit(getBigNumber(1))).to.be.revertedWith('TH:STF')
      })
      it('Should mint yToken and transfer to caller', async () => {
       
        const tx = adapter.deposit(amountDeposited);
        await tx;
        amountMinted = await underlyingToWrapped(amountDeposited);
        console.log('amountMinted', amountMinted.toString(), 'amountDeposited', amountDeposited.toString(), 'adapter.address', adapter.address, 'wallet.address', wallet.address);

        await expect(tx)
          .to.emit(token, 'Transfer')
          .withArgs(wallet.address, adapter.address, amountDeposited)
          .to.emit(yToken, 'Transfer')
          .withArgs(adapter.address, wallet.address, amountMinted);
        expect(await token.balanceOf(wallet.address)).to.eq(0);
        expect(await yToken.balanceOf(wallet.address)).to.eq(amountMinted);
      })
    })


    
    describe('balanceWrapped()', () => {
      it('Should return caller balance in yToken', async () => {
        const balanceWrapped = await adapter.balanceWrapped();
        console.log('amountMinted', amountMinted.toString(), 'balanceWrapped', balanceWrapped.toString())
        expect(await adapter.balanceWrapped()).to.be.gte(amountMinted);
        expect(await adapter.connect(wallet1).balanceWrapped()).to.eq(0);
      })
    })
  
    describe('balanceUnderlying()', () => {
      it('Should return caller balance in yToken (yToken convertible 1:1)', async () => {
        const y: IVault = await getContract(yToken.address, 'IVault');
        // accrue interest

        const rate = await y.getPricePerFullShare();
        const underlying = await adapter.balanceUnderlying();
        const balance = await adapter.balanceWrapped();
        const currentTotalSupply = await y.totalSupply();
        const yBalance = await y.balance();
        let pricePerFullShare =  await getPricePerFullShareCalculated();

        let q = amountMinted.mul(pricePerFullShare).div(getBigNumber(1));
        console.log('balanceUnderlying',underlying.toString(), 'totalSupply', currentTotalSupply.toString(),' balance', balance.toString(), 'rate', rate.toString(), 'amountDeposited', amountDeposited.toString(), 'amountMinted', amountMinted.toString(), 'q', q.toString());
        console.log( 'amountDeposited', amountDeposited.toString());
  
        expect(underlying).to.be.gte(q);
        expect(await adapter.connect(wallet1).balanceUnderlying()).to.eq(0);
      })
    })

    describe('getHypotheticalAPR()', () => {
      it('Positive should decrease APR', async () => {
        const apr = await adapter.getAPR();
        if (apr.gt(0)) {
          expect(await adapter.getHypotheticalAPR(getBigNumber(1))).to.be.lt(apr);
        }
      })
  
      it('Negative should increase APR', async () => {
        const apr = await adapter.getAPR();
        if (apr.gt(0)) {
          expect(await adapter.getHypotheticalAPR(getBigNumber(1).mul(-1))).to.be.gt(apr);
        }
      })
    })

    describe('withdraw()', () => {
      it('Should revert if caller has insufficient balance', async () => {
        await expect(adapter.connect(wallet1).withdraw(getBigNumber(1))).to.be.revertedWith('TH:STF')
      })
  
      it('Should burn yToken and redeem underlying', async () => {
        console.log( 'amountDeposited', amountDeposited.toString());

        const balance = await yToken.balanceOf(wallet.address);
        const tx = adapter.withdraw(balance)
        await tx;
        const amount = await wrappedToUnderlying(balance);
        await expect(tx)
          .to.emit(yToken, 'Transfer')
          .withArgs(wallet.address, adapter.address, balance)
          .to.emit(token, 'Transfer')
          .withArgs(adapter.address, wallet.address, amount);
        expect(await token.balanceOf(wallet.address)).to.eq(amount);
      })
    })
  
    describe('withdrawAll()', () => {

//        console.log('here 0' , amountDeposited)
        before(async () => {
        amountDeposited = await getTokens(10)
        await adapter.deposit(amountDeposited);
      })
  
      it('Should burn all caller Token and redeem underlying', async () => {

        const yBalance = await yToken.balanceOf(wallet.address);
        const balanceBefore = await token.balanceOf(wallet.address);
 
        // console.log('balanceBefore', balanceBefore.toString());

        await adapter.withdrawAll();

        const amount = await wrappedToUnderlying(yBalance)
        const balanceAfter = await token.balanceOf(wallet.address);
        expect(balanceAfter.sub(balanceBefore)).to.eq(amount);
        expect(await yToken.balanceOf(wallet.address)).to.eq(0);
      })
    })
    
    describe('withdrawUnderlying()', () => {
      before(async () => {
        amountDeposited = await getTokens(10)
        await adapter.deposit(amountDeposited);
        await token.transfer(`0x${'11'.repeat(20)}`, await token.balanceOf(wallet.address))
      })
      it('Should revert if caller has insufficient balance', async () => {
        await expect(adapter.connect(wallet1).withdrawUnderlying(getBigNumber(1))).to.be.revertedWith('TH:STF')
      })
  
      it('Should burn iToken and redeem underlying', async () => {
 
        const y: IVault = await getContract(yToken.address, 'IVault');

        const balanceUnderlying = await adapter.balanceUnderlying();
        const balance = await adapter.balanceWrapped();
        const currentTotalSupply = await y.totalSupply();
        const yBalance = await y.balance();
        let pricePerFullShare =  balance.mul(yBalance).div(currentTotalSupply);

        let q = amountMinted.mul(pricePerFullShare).div(getBigNumber(1));


        console.log('balanceUnderlying', balanceUnderlying.toString(), q.toString())
        const tx = adapter.withdrawUnderlying(q)
        await tx;
        const amount = await underlyingToWrapped(q);
        console.log('amount', amount.toString());
        await expect(tx)
          .to.emit(yToken, 'Transfer')
          .withArgs(wallet.address, adapter.address, amount)
          .to.emit(token, 'Transfer')
          .withArgs(adapter.address, wallet.address, q);
      //  expect(await token.balanceOf(wallet.address)).to.eq(balanceUnderlying);
      })
    })
  });

  
// testAdapter(getAddress('0x6b175474e89094c44da98b954eedeac495271d0f'), getAddress('0xacd43e627e64355f1861cec6d3a6688b31a6f952'), 'DAI');
 testAdapter(getAddress('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'), getAddress('0x597ad1e0c13bfe8025993d9e79c69e1c0233522e'), 'USDC');

// testAdapter(getAddress('0xdac17f958d2ee523a2206206994597c13d831ec7'), getAddress('0x2f08119c6f07c006695e079aafc638b8789faf18'), 'USDT');
 
// testAdapter(getAddress('0x0bc529c00c6401aef6d220be8c6ea1667f6ad93e'), getAddress('0xba2e7fed597fd0e3e70f5130bcdbbfe06bb94fe1'), 'YFI');
 //testAdapter(getAddress('0x056fd409e1d7a124bd7017459dfea2f387b6d5cd'), getAddress('0xec0d8d3ed5477106c6d4ea27d90a60e594693c90'), 'GUSD');
// testAdapter(getAddress('0x6c3f90f043a72fa612cbac8115ee7e52bde6e490'), getAddress('0x9ca85572e6a3ebf24dedd195623f188735a5179f'), '3CRV');
 //testAdapter(getAddress('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'), getAddress('0x597ad1e0c13bfe8025993d9e79c69e1c0233522e'), 'USDC');
 //testAdapter(getAddress('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'), getAddress('0x597ad1e0c13bfe8025993d9e79c69e1c0233522e'), 'USDC');
 //testAdapter(getAddress('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'), getAddress('0x597ad1e0c13bfe8025993d9e79c69e1c0233522e'), 'USDC');
 //testAdapter(getAddress('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'), getAddress('0x597ad1e0c13bfe8025993d9e79c69e1c0233522e'), 'USDC');
 //testAdapter(getAddress('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'), getAddress('0x597ad1e0c13bfe8025993d9e79c69e1c0233522e'), 'USDC');
 //testAdapter(getAddress('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'), getAddress('0x597ad1e0c13bfe8025993d9e79c69e1c0233522e'), 'USDC');
 
/*

yToken: yaLINK (0x29e240cfd7946ba20895a7a02edb25c210f9f324) | Underlying: aLINK (0xa64bd6c70cb9051f6a9ba1f163fdc07e0dfb5f84) | Delegated
yToken: yLINK (0x881b06da56bb5675c54e4ed311c21e54c5025298) | Underlying: LINK (0x514910771af9ca656af840dff83e8264ecf986ca) | Wrapped | Delegated
yToken: yUSDC (0x597ad1e0c13bfe8025993d9e79c69e1c0233522e) | Underlying: USDC (0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48)
yToken: yyDAI+yUSDC+yUSDT+yTUSD (0x5dbcf33d8c2e976c6b560249878e6f1491bca25c) | Underlying: yDAI+yUSDC+yUSDT+yTUSD (0xdf5e0e81dff6faf3a7e52ba697820c5e32d806a8)
yToken: yTUSD (0x37d19d1c4e1fa9dc47bd1ea12f742a0887eda74a) | Underlying: TUSD (0x0000000000085d4780b73119b644ae5ecd22b376)
yToken: yDAI (0xacd43e627e64355f1861cec6d3a6688b31a6f952) | Underlying: DAI (0x6b175474e89094c44da98b954eedeac495271d0f)
yToken: yUSDT (0x2f08119c6f07c006695e079aafc638b8789faf18) | Underlying: USDT (0xdac17f958d2ee523a2206206994597c13d831ec7)
yToken: yYFI (0xba2e7fed597fd0e3e70f5130bcdbbfe06bb94fe1) | Underlying: YFI (0x0bc529c00c6401aef6d220be8c6ea1667f6ad93e)
yToken: yyDAI+yUSDC+yUSDT+yBUSD (0x2994529c0652d127b7842094103715ec5299bbed) | Underlying: yDAI+yUSDC+yUSDT+yBUSD (0x3b3ac5386837dc563660fb6a0937dfaa5924333b)
yToken: ycrvRenWSBTC (0x7ff566e1d69deff32a7b244ae7276b9f90e9d0f6) | Underlying: crvRenWSBTC (0x075b1bb99792c9e1041ba13afef80c91a1e70fb3)
yToken: yWETH (0xe1237aa7f535b0cc33fd973d66cbf830354d16c7) | Underlying: ETH (0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2)
yToken: y3Crv (0x9ca85572e6a3ebf24dedd195623f188735a5179f) | Underlying: 3Crv (0x6c3f90f043a72fa612cbac8115ee7e52bde6e490)
yToken: yGUSD (0xec0d8d3ed5477106c6d4ea27d90a60e594693c90) | Underlying: GUSD (0x056fd409e1d7a124bd7017459dfea2f387b6d5cd)
yToken: yvcDAI+cUSDC (0x629c759d1e83efbf63d84eb3868b564d9521c129) | Underlying: cDAI+cUSDC (0x845838df265dcd2c412a1dc9e959c7d08537f8a2)
yToken: yvmusd3CRV (0x0fcdaedfb8a7dfda2e9838564c5a1665d856afdf) | Underlying: musd3CRV (0x1aef73d49dedc4b1778d0706583995958dc862e6)
yToken: yvgusd3CRV (0xcc7e70a958917cce67b4b87a8c30e6297451ae98) | Underlying: gusd3CRV (0xd2967f45c4f384deea880f807be904762a3dea07)
yToken: yveursCRV (0x98b058b2cbacf5e99bc7012df757ea7cfebd35bc) | Underlying: eursCRV (0x194ebd173f6cdace046c53eacce9b953f28411d1)
yToken: yvmUSD (0xe0db48b4f71752c4bef16de1dbd042b82976b8c7) | Underlying: mUSD (0xe2f2a5c287993345a840db3b0845fbc70f5935a5)
yToken: yvcrvRenWBTC (0x5334e150b938dd2b6bd040d9c4a03cff0ced3765) | Underlying: crvRenWBTC (0x49849c98ae39fff122806c06791fa73784fb3675)
yToken: yvusdn3CRV (0xfe39ce91437c76178665d64d7a2694b0f6f17fe3) | Underlying: usdn3CRV (0x4f3e8f405cf5afc05d68142f3783bdfe13811522)
yToken: yvust3CRV (0xf6c9e9af314982a4b38366f4abfaa00595c5a6fc) | Underlying: ust3CRV (0x94e131324b6054c0d789b190b2dac504e4361b53)
yToken: yvbBTC/sbtcCRV (0xa8b1cb4ed612ee179bdea16cca6ba596321ae52d) | Underlying: bBTC/sbtcCRV (0x410e3e86ef427e30b9235497143881f717d93c2a)
yToken: yvtbtc/sbtcCrv (0x07fb4756f67bd46b748b16119e802f1f880fb2cc) | Underlying: tbtc/sbtcCrv (0x64eda51d3ad40d56b9dfc5554e06f94e1dd786fd)
yToken: yvoBTC/sbtcCRV (0x7f83935ecfe4729c4ea592ab2bc1a32588409797) | Underlying: oBTC/sbtcCRV (0x2fe94ea3d5d4a175184081439753de15aef9d614)
yToken: yvpBTC/sbtcCRV (0x123964ebe096a920dae00fb795ffbfa0c9ff4675) | Underlying: pBTC/sbtcCRV (0xde5331ac4b3630f94853ff322b66407e0d6331e8)
yToken: yvhCRV (0x46afc2dfbd1ea0c0760cad8262a5838e803a37e5) | Underlying: hCRV (0xb19059ebb43466c323583928285a49f558e572fd)
yToken: yvcrvPlain3andSUSD (0x5533ed0a3b83f70c3c4a1f69ef5546d3d4713e44) | Underlying: crvPlain3andSUSD (0xc25a3a3b969415c80451098fa907ec722572917f)
yToken: yvhusd3CRV (0x39546945695dcb1c037c836925b355262f551f55) | Underlying: husd3CRV (0x5b5cfe992adac0c9d48e05854b2d91c73a003858)
yToken: yvdusd3CRV (0x8e6741b456a074f0bc45b8b82a755d4af7e965df) | Underlying: dusd3CRV (0x3a664ab939fd8482048609f652f9a0b0677337b9)
yToken: yva3CRV (0x03403154afc09ce8e44c3b185c82c6ad5f86b9ab) | Underlying: a3CRV (0xfd2a8fa60abd58efe3eee34dd494cd491dc14900)
yToken: yvankrCRV (0xe625f5923303f1ce7a43acfefd11fd12f30dbca4) | Underlying: ankrCRV (0xaa17a236f2badc98ddc0cf999abb47d47fc0a6cf)
yToken: yvsaCRV (0xbacb69571323575c6a5a3b4f9eede1dc7d31fbc1) | Underlying: saCRV (0x02d341ccb60faaf662bc0554d13778015d1b285c)
yToken: yvusdp3CRV (0x1b5eb1173d2bf770e50f10410c9a96f7a8eb6e75) | Underlying: usdp3CRV (0x7eb40e450b9655f4b3cc4259bcc731c63ff55ae6)
yToken: yvlinkCRV (0x96ea6af74af09522fcb4c28c269c26f59a31ced6) | Underlying: linkCRV (0xcee60cfa923170e4f8204ae08b4fa6a3f5656f3a)


*/



  
});