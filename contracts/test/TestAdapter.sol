// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "./TestERC20.sol";
import "./TestVault.sol";
import "../libraries/MinimalSignedMath.sol";

contract TestAdapter {
  using LowGasSafeMath for uint256;
  using MinimalSignedMath for uint256;

  address public immutable underlying;
  address public immutable token;
  uint256 internal annualInterest;

  constructor(
    address _underlying,
    uint256 _annualInterest
  ) {
    // address _underlying = address(new TestERC20(_name, _symbol, _initialBalance));
    
    underlying = _underlying;
    token = address(new TestVault(_underlying));
    annualInterest = _annualInterest;
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
}