// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "./TestERC20.sol";
import "./TestVault.sol";
import "../libraries/MinimalSignedMath.sol";

contract TestAdapter {
  using LowGasSafeMath for uint256;
  using MinimalSignedMath for uint256;
  using TransferHelper for address;

  address public immutable underlying;
  address public immutable token;
  uint256 internal annualInterest;

  constructor(address _underlying, uint256 _annualInterest) {
    underlying = _underlying;
    address _token = address(new TestVault(_underlying));
    token = _token;
    annualInterest = _annualInterest;
    _underlying.safeApproveMax(_token);
  }

  function toWrappedAmount(uint256 underlyingAmount) public view returns (uint256) {
    TestVault vault = TestVault(token);
    uint256 bal = vault.balance();
    uint256 supply = vault.totalSupply();
    return supply == 0 ? underlyingAmount : (underlyingAmount.mul(supply) / bal);
  }

  function toUnderlyingAmount(uint256 wrappedAmount) public view returns (uint256) {
    TestVault vault = TestVault(token);
    return vault.balance().mul(wrappedAmount) / vault.totalSupply();
  }

  function setAnnualInterest(uint256 _annualInterest) external {
    annualInterest = _annualInterest;
  }

  function getAPR() external view returns (uint256) {
    return annualInterest.mul(1e18) / TestVault(token).balance();
  }

  function getHypotheticalAPR(int256 liquidityDelta) external view returns (uint256) {
    return annualInterest.mul(1e18) / TestVault(token).balance().add(liquidityDelta);
  }

  function balanceWrapped() public view returns (uint256) {
    return IERC20(token).balanceOf(msg.sender);
  }

  function balanceUnderlying() external view returns (uint256) {
    return toUnderlyingAmount(balanceWrapped());
  }

    function deposit(uint256 amountUnderlying) external virtual returns (uint256 amountMinted) {
    require(amountUnderlying > 0, "deposit 0");
    underlying.safeTransferFrom(msg.sender, address(this), amountUnderlying);
    amountMinted = TestVault(token).deposit(amountUnderlying);
    token.safeTransfer(msg.sender, amountMinted);
  }

  function withdraw(uint256 amountToken) public virtual returns (uint256 amountReceived) {
    require(amountToken > 0, "withdraw 0");
    token.safeTransferFrom(msg.sender, address(this), amountToken);
    amountReceived = TestVault(token).withdraw(amountToken);
    underlying.safeTransfer(msg.sender, amountReceived);
  }

  function withdrawAll() public virtual returns (uint256 amountReceived) {
    return withdraw(balanceWrapped());
  }

  function withdrawUnderlying(uint256 amountUnderlying) external returns (uint256 amountBurned) {
    TestVault vault = TestVault(token);
    uint256 bal = vault.balance();
    uint256 supply = vault.totalSupply();
    amountBurned = amountUnderlying.mul(supply).divCeil(bal);
    token.safeTransferFrom(msg.sender, address(this), amountBurned);
    TestVault(token).withdraw(amountBurned);
    underlying.safeTransfer(msg.sender, amountUnderlying);
  }
}