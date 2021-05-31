// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;

import "../interfaces/FulcrumInterfaces.sol";


contract FulcrumTokensMap {
  IBZX public immutable bzx;
  mapping(address => address) public iTokens;
  uint256 public totalMapped;

  constructor(address _bzx) {
    bzx = IBZX(_bzx);
  }

  function mapAll() external {
    uint256 start = totalMapped;
    address[] memory pools = bzx.getLoanPoolsList(start, 1e18);
    uint256 len = pools.length;
    totalMapped = start + len;
    for (uint256 i = 0; i < len; i++) {
      address pool = pools[i];
      iTokens[bzx.loanPoolToUnderlying(pool)] = pool;
    }
  }
}