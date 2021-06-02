// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;
pragma abicoder v2;

import "../../interfaces/ITokenAdapter.sol";
import "../../interfaces/FulcrumInterfaces.sol";
import "../../interfaces/IERC20Metadata.sol";
import "../../interfaces/IERC20.sol";
import "../../libraries/LowGasSafeMath.sol";
import "../../libraries/TransferHelper.sol";


contract FulcrumErc20Adapter is IErc20Adapter {
  using LowGasSafeMath for uint256;
  using TransferHelper for address;

  /* ========== Storage ========== */

  string public override name;
  address public override underlying;
  address public override token;

/* ========== Constructor & Initializer ========== */

  constructor() {
    underlying = address(1);
    token = address(1);
  }

  function initialize(address _underlying, address _token) public virtual {
    require(underlying == address(0) && token == address(0), "initialized");
    require(_underlying != address(0) && _token != address(0), "bad address");
    underlying = _underlying;
    token = _token;
    name = string(abi.encodePacked(
      "Fulcrum ",
      bytes(IERC20Metadata(_underlying).symbol()),
      " Adapter"
    ));
    _underlying.safeApprove(token, type(uint256).max);
  }

/* ========== Performance Queries ========== */

  function getAPR() external view virtual override returns (uint256 apr) {
    return IToken(token).supplyInterestRate() / 100;
  }

  function getHypotheticalAPR(uint256 _deposit) external view virtual override returns (uint256 apr) {
    return IToken(token).nextSupplyInterestRate(_deposit) / 100;
  }

/* ========== Caller Balance Queries ========== */

  function tokenBalance() external view virtual override returns (uint256) {
    return IERC20(token).balanceOf(msg.sender);
  }

  function underlyingBalance() external view virtual override returns (uint256) {
    return IToken(token).assetBalanceOf(msg.sender);
  }

/* ========== Token Actions ========== */

  function deposit(uint256 amountUnderlying) external virtual override returns (uint256 amountMinted) {
    underlying.safeTransferFrom(msg.sender, address(this), amountUnderlying);
    amountMinted = IToken(token).mint(msg.sender, amountUnderlying);
    require(amountMinted > 0, "IToken: Mint failed");
  }

  function withdraw(uint256 amountToken) external virtual override returns (uint256 amountReceived) {
    token.safeTransferFrom(msg.sender, address(this), amountToken);
    amountReceived = IToken(token).burn(msg.sender, amountToken);
    require(amountReceived > 0, "IToken: Burn failed");
  }

  function withdrawUnderlying(uint256 amountUnderlying) external virtual override returns (uint256 amountBurned) {
    uint256 currentPrice = IToken(token).tokenPrice();
    amountBurned = amountUnderlying.mul(1e18) / currentPrice;
    token.safeTransferFrom(msg.sender, address(this), amountBurned);
    require(IToken(token).burn(msg.sender, amountBurned) > 0, "IToken: Burn failed");
  }
}