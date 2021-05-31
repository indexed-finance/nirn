// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;


contract CompoundTokenMap {
  IComptroller public immutable comptroller;
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

  constructor(address _comptroller) {
    comptroller = IComptroller(_comptroller);
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
        cTokens[address(0)] = address(cToken);
        allUnderlyings.push(address(0));
      } else {
        mapCToken(cToken);
      }
    }
    for (; i < len; i++) {
      mapCToken(_cTokens[i]);
    }
  }
}


interface ICToken {
  function underlying() external view returns (address);
  function name() external view returns (string memory);
  function supplyRatePerBlock() external view returns (uint256);
  function getCash() external view returns (uint256);
  function totalBorrows() external view returns (uint256);
  function totalReserves() external view returns (uint256);
  function reserveFactorMantissa() external view returns (uint256);
  function interestRateModel() external view returns (IInterestRateModel);
}


interface IInterestRateModel {
  function getSupplyRate(
    uint256 cash,
    uint256 borrows,
    uint256 reserves,
    uint256 reserveFactorMantissa
  ) external view returns (uint);
}


interface IComptroller {
  function getAllMarkets() external view returns (ICToken[] memory);
}