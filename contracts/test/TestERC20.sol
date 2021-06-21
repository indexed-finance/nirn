pragma solidity =0.7.6;

import "../vaults/ERC20.sol";

contract TestERC20 is ERC20 {
  string public name;
  string public symbol;

  constructor(string memory _name, string memory _symbol, uint256 initBalance) {
    name = _name;
    symbol = _symbol;
    _mint(msg.sender, initBalance);
  }

  function mint(address to, uint256 amount) external {
    _mint(to, amount);
  }
}