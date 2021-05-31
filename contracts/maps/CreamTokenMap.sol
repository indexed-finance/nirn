// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;

import "../interfaces/CompoundInterfaces.sol";


contract CreamTokenMap {
  IComptroller public immutable comptroller;
  address public immutable weth;
  string public name = "C.R.E.A.M. Token Map";

  mapping(address => address) public cTokens;
  address[] public allUnderlyings;

  function getAllUnderlyings() external view returns (address[] memory) {
    return allUnderlyings;
  }

  constructor(address _comptroller, address _weth) {
    comptroller = IComptroller(_comptroller);
    weth = _weth;
  }

  function mapCToken(ICToken cToken) internal {
    address underlying = cToken.underlying();
    cTokens[underlying] = address(cToken);
    allUnderlyings.push(underlying);
  }

  function mapAll() external {
    ICToken[] memory _cTokens = comptroller.getAllMarkets();
    uint256 len = _cTokens.length;
    for (uint256 i = allUnderlyings.length; i < len; i++) {
      ICToken cToken = _cTokens[i];
      address underlying;
      // The call to underlying will use all the gas sent if it fails,
      // so we specify a maximum of 25k gas. The contract will only use ~2k
      // but this protects against all likely changes to the gas schedule.
      try cToken.underlying{gas: 25000}() returns (address _underlying) {
        underlying = _underlying;
      } catch {
        underlying = weth;
      }
      cTokens[underlying] = address(cToken);
      allUnderlyings.push(underlying);
    }
  }
}