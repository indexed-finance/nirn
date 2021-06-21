pragma abicoder v2;

import "../../interfaces/ITokenAdapter.sol";
import "../../interfaces/DyDxInterfaces.sol";
import "../../libraries/TransferHelper.sol";
import "../../libraries/SymbolHelper.sol";
import "../../libraries/MinimalSignedMath.sol";
import "../../vaults/ERC20.sol";


contract DyDxErc20Adapter is ERC20, DyDxStructs, IErc20Adapter {
  using SymbolHelper for address;
  using MinimalSignedMath for uint256;
  using LowGasSafeMath for uint256;
  using TransferHelper for address;

/* ========== Constants ========== */

  uint256 public constant DECIMAL = 10 ** 18;
  IDyDx public constant dydx = IDyDx(0x1E0447b19BB6EcFdAe1e4AE1694b0C3659614e4e);

/* ========== Storage ========== */

  address public override underlying;
  uint96 public marketId;

  function token() external view virtual override returns (address) {
    return address(this);
  }

/* ========== Initializer ========== */

  function initialize(address _underlying, uint256 _marketId) external virtual {
    require(underlying == address(0), "initialized");
    underlying = _underlying;
    marketId = uint96(_marketId);
    underlying.safeApproveMax(address(dydx));
  }

/* ========== Metadata Queries ========== */

  function name() external view virtual override returns (string memory) {
    return string(abi.encodePacked(
      "DyDx ",
      underlying.getSymbol(),
      " Adapter"
    ));
  }

  function balance() public view returns (uint256) {
    Wei memory bal = dydx.getAccountWei(Info(address(this), 0), marketId);
    return bal.value;
  }

/* ========== Conversion Queries ========== */

  function toWrappedAmount(uint256 underlyingAmount) public view override returns (uint256) {
    uint256 bal = balance();
    uint256 supply = totalSupply;
    return supply == 0 ? underlyingAmount : (underlyingAmount.mul(supply) / bal);
  }

  function toUnderlyingAmount(uint256 tokenAmount) public view override returns (uint256) {
    return tokenAmount.mul(balance()) / totalSupply;
  }

/* ========== Caller Balance Queries ========== */

  function balanceWrapped() public view override returns (uint256) {
    return balanceOf[msg.sender];
  }

  function balanceUnderlying() external view virtual override returns (uint256) {
    return balanceOf[msg.sender].mul(balance()) / totalSupply;
  }

/* ========== Performance Queries ========== */

  function getAPR() external view virtual override returns (uint256 apr) {
    uint256 _marketId = marketId;
    uint256 rate = dydx.getMarketInterestRate(_marketId).value;
    uint256 aprBorrow = rate * 31622400;
    Set memory marketPar = dydx.getMarketTotalPar(_marketId);
    uint256 borrow = marketPar.borrow;
    uint256 supply = marketPar.supply;
    uint256 usage = (borrow.mul(DECIMAL)) / supply;
    apr = ((aprBorrow.mul(usage)) / DECIMAL).mul(dydx.getEarningsRate().value) / DECIMAL;
  }

  function getHypotheticalAPR(int256 liquidityDelta) external view virtual override returns (uint256 apr) {
    uint256 _marketId = marketId;
    uint256 rate = dydx.getMarketInterestRate(_marketId).value;
    uint256 aprBorrow = rate * 31622400;
    Set memory marketPar = dydx.getMarketTotalPar(_marketId);
    uint256 borrow = marketPar.borrow;
    uint256 supply = uint256(dydx.getMarketTotalPar(_marketId).supply).add(liquidityDelta);
    uint256 usage = (borrow.mul(DECIMAL)) / supply;
    apr = ((aprBorrow.mul(usage)) / DECIMAL).mul(dydx.getEarningsRate().value) / DECIMAL;
  }

/* ========== Token Actions ========== */

  function deposit(uint256 amount) external override returns (uint256 shares) {
    require(amount > 0, "DyDx: Mint failed");
    shares = toWrappedAmount(amount);
    underlying.safeTransferFrom(msg.sender, address(this), amount);
    _mint(msg.sender, shares);
    _deposit(amount);
  }

  function withdraw(uint256 shares) public virtual override returns (uint256 amountOut) {
    require(shares > 0, "DyDx: Burn failed");
    amountOut = toUnderlyingAmount(shares);
    _burn(msg.sender, shares);
    _withdraw(amountOut, true);
  }

  function withdrawAll() public virtual override returns (uint256 amountReceived) {
    return withdraw(balanceOf[msg.sender]);
  }

  function withdrawUnderlying(uint256 amountUnderlying) external virtual override returns (uint256 shares) {
    require(amountUnderlying > 0, "DyDx: Burn failed");
    shares = toWrappedAmount(amountUnderlying);
    _burn(msg.sender, shares);
    _withdraw(amountUnderlying, true);
  }

/* ========== Internal Actions ========== */

  function _deposit(uint256 amount) internal {
    Info[] memory infos = new Info[](1);
    infos[0] = Info(address(this), 0);

    AssetAmount memory amt = AssetAmount(true, AssetDenomination.Wei, AssetReference.Delta, amount);
    ActionArgs memory act;
    act.actionType = ActionType.Deposit;
    act.accountId = 0;
    act.amount = amt;
    act.primaryMarketId = marketId;
    act.otherAddress = address(this);

    ActionArgs[] memory args = new ActionArgs[](1);
    args[0] = act;

    dydx.operate(infos, args);
  }

  function _withdraw(uint256 amount, bool toUser) internal {
    Info[] memory infos = new Info[](1);
    infos[0] = Info(address(this), 0);

    AssetAmount memory amt = AssetAmount(false, AssetDenomination.Wei, AssetReference.Delta, amount);
    ActionArgs memory act;
    act.actionType = ActionType.Withdraw;
    act.accountId = 0;
    act.amount = amt;
    act.primaryMarketId = marketId;
    act.otherAddress = toUser ? msg.sender : address(this);

    ActionArgs[] memory args = new ActionArgs[](1);
    args[0] = act;

    dydx.operate(infos, args);
  }
}