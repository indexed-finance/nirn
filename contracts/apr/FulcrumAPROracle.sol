// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;

import "../interfaces/FulcrumInterfaces.sol";


contract FulcrumAPROracle {
  IBZX public immutable bzx;

  constructor(address _bzx) {
    bzx = IBZX(_bzx);
  }

  function getAPR(address token) public view returns(uint256 apr) {
    return IToken(bzx.underlyingToLoanPool(token)).supplyInterestRate() / 100;
  }

  function getHypotheticalAPR(address token, uint256 deposit) public view returns(uint256 apr) {
    return IToken(bzx.underlyingToLoanPool(token)).nextSupplyInterestRate(deposit) / 100;
  }
}

