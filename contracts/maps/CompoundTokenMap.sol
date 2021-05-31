// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;

import "../interfaces/CompoundInterfaces.sol";


contract CompoundTokenMap {
  IComptroller public immutable comptroller;
  address public immutable weth;
  bytes32 public constant compoundEtherNameHash = keccak256(
    bytes(
      string("Compound Ether")
    )
  );
  string public name = "Compound Token Map";

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
    uint256 i = allUnderlyings.length;
    bool foundEther = false;
    while(!foundEther && i < len) {
      ICToken cToken = _cTokens[i++];
      if (keccak256(bytes(cToken.name())) == compoundEtherNameHash) {
        foundEther = true;
        cTokens[weth] = address(cToken);
        allUnderlyings.push(weth);
      } else {
        mapCToken(cToken);
      }
    }
    for (; i < len; i++) {
      mapCToken(_cTokens[i]);
    }
  }
}