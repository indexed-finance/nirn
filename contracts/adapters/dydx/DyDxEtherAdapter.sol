// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;
pragma abicoder v2;

import "./DyDxErc20Adapter.sol";
import "../../interfaces/IWETH.sol";
import "../../libraries/SignedAddition.sol";


contract DyDxEtherAdapter is IEtherAdapter, DyDxStructs {
  using SignedAddition for uint256;
  using LowGasSafeMath for uint256;
  using TransferHelper for address;

/* ========== Constants ========== */

  uint256 public constant DECIMAL = 10 ** 18;
  IDyDx public immutable dydx;
  address public immutable override underlying;
  address public immutable override token;
  address public immutable dydxUserModuleImplementation;
  uint256 public immutable marketId;

/* ========== Storage ========== */

  string public override name = "DyDx ETH Adapter";
  mapping(address => address) public userModules;

/* ========== Constructor & Initializer ========== */

  constructor(IDyDx _dydx, address _underlying, uint256 _marketId) {
    dydx = _dydx;
    underlying = _underlying;
    token = _underlying;
    marketId = _marketId;
    dydxUserModuleImplementation = address(new DyDxUserModule(_dydx, _underlying, _marketId));
    _underlying.safeApproveMax(address(_dydx));
  }

/* ========== User Modules ========== */

  function getOrCreateUserModule() internal returns (DyDxUserModule) {
    address module = userModules[msg.sender];
    if (module == address(0)) {
      module = (userModules[msg.sender] = CloneLibrary.createClone(dydxUserModuleImplementation));
      DyDxUserModule(module).initialize(msg.sender);
    }
    return DyDxUserModule(module);
  }

/* ========== Performance Queries ========== */

  function getAPR() external view virtual override returns (uint256 apr) {
    uint256 _marketId = marketId;
    uint256 rate = dydx.getMarketInterestRate(_marketId).value;
    uint256 aprBorrow = rate * 31622400;
    uint256 borrow = dydx.getMarketTotalPar(_marketId).borrow;
    uint256 supply = dydx.getMarketTotalPar(_marketId).supply;
    uint256 usage = (borrow.mul(DECIMAL)) / supply;
    apr = ((aprBorrow.mul(usage)) / DECIMAL).mul(dydx.getEarningsRate().value) / DECIMAL;
  }

  function getHypotheticalAPR(int256 liquidityDelta) external view virtual override returns (uint256 apr) {
    uint256 _marketId = marketId;
    uint256 rate = dydx.getMarketInterestRate(_marketId).value;
    uint256 aprBorrow = rate * 31622400;
    uint256 borrow = dydx.getMarketTotalPar(_marketId).borrow;
    uint256 supply = uint256(dydx.getMarketTotalPar(_marketId).supply).add(liquidityDelta);
    uint256 usage = (borrow.mul(DECIMAL)) / supply;
    apr = ((aprBorrow.mul(usage)) / DECIMAL).mul(dydx.getEarningsRate().value) / DECIMAL;
  }

/* ========== Caller Balance Queries ========== */

  function balanceWrapped() public view virtual override returns (uint256) {
    address module = userModules[msg.sender];
    if (module == address(0)) {
      return 0;
    }
    IDyDx.Wei memory bal = dydx.getAccountWei(Info(module, 0), marketId);
    return bal.value;
  }

  function balanceUnderlying() external view virtual override returns (uint256) {
    return balanceWrapped();
  }

/* ========== Token Actions ========== */

  function deposit(uint256 amountUnderlying) public virtual override returns (uint256 amountMinted) {
    DyDxUserModule module = getOrCreateUserModule();
    underlying.safeTransferFrom(msg.sender, address(module), amountUnderlying);
    module.deposit(amountUnderlying);
    amountMinted = amountUnderlying;
  }

  function depositETH() external payable virtual override returns (uint256 amountMinted) {
    IWETH(underlying).deposit{value: msg.value}();
    amountMinted = deposit(msg.value);
  }

  function _withdraw(uint256 amount, bool toUser) internal {
    require(amount > 0, "DyDx: Burn failed");
    DyDxUserModule module = getOrCreateUserModule();
    module.withdraw(amount, toUser);
  }

  function withdraw(uint256 amountToken) public virtual override returns (uint256 amountReceived) {
    amountReceived = amountToken;
    _withdraw(amountToken, true);
  }

  function withdrawAll() external virtual override returns (uint256 amountReceived) {
    return withdraw(balanceWrapped());
  }

  function withdrawAsETH(uint256 amountToken) public virtual override returns (uint256 amountReceived) {
    amountReceived = amountToken;
    _withdraw(amountToken, false);
    IWETH(underlying).withdraw(amountReceived);
    address(msg.sender).safeTransferETH(amountReceived);
  }

  function withdrawAllAsETH() external virtual override returns (uint256 amountReceived) {
    return withdrawAsETH(balanceWrapped());
  }

  function withdrawUnderlying(uint256 amountUnderlying) external virtual override returns (uint256 amountBurned) {
    amountBurned = withdraw(amountUnderlying);
  }

  function withdrawUnderlyingAsETH(uint256 amountUnderlying) external virtual override returns (uint256 amountBurned) {
    amountBurned = amountUnderlying;
    _withdraw(amountUnderlying, false);
    IWETH(underlying).withdraw(amountUnderlying);
    address(msg.sender).safeTransferETH(amountUnderlying);
  }
}