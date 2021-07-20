// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;

import "../vaults/ERC20.sol";
import "../libraries/TransferHelper.sol";
import "../libraries/SymbolHelper.sol";

contract TestVault is ERC20 {
  using LowGasSafeMath for uint256;
  using TransferHelper for address;
  using SymbolHelper for address;

  address public underlying;
  string public name;
  string public symbol;

  constructor(address _underlying) {
    underlying = _underlying;
    name = string(abi.encodePacked(
      "Test Vault ",
      _underlying.getName()
    ));
    symbol = string(abi.encodePacked(
      "tv",
      _underlying.getSymbol()
    ));
  }

  function balance() public view returns (uint256) {
    return IERC20(underlying).balanceOf(address(this));
  }

  function price() public view returns (uint256) {
    return balance().mul(1e18) / totalSupply;
  }

  function deposit(uint256 amount) external returns (uint256 shares) {
    uint256 bal = balance();
    underlying.safeTransferFrom(msg.sender, address(this), amount);
    uint256 supply = totalSupply;
    shares = supply == 0 ? amount : (amount.mul(supply) / bal);
    _mint(msg.sender, shares);
  }

  function withdraw(uint256 shares) external returns (uint256 amount) {
    uint256 bal = balance();
    amount = bal.mul(shares) / totalSupply;
    _burn(msg.sender, shares);
    underlying.safeTransfer(msg.sender, amount);
  }

  function withdrawUnderlying(uint256 amount) external returns (uint256 shares) {
    uint256 bal = balance();
    shares = amount.mul(totalSupply) / bal;
    _burn(msg.sender, shares);
    underlying.safeTransfer(msg.sender, amount);
  }
}