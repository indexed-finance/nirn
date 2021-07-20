pragma solidity =0.7.6;

import "../libraries/DynamicArrays.sol";


contract TestDynamicArrays {
  using DynamicArrays for address[];
  using DynamicArrays for uint256[];

  function buildDynamicAddressArray(
    uint256 size,
    address[] calldata elements
  ) external pure returns (address[] memory arr) {
    arr = DynamicArrays.dynamicAddressArray(size);
    for (uint256 i; i < elements.length; i++) {
      arr.dynamicPush(elements[i]);
    }
  }

  function testOverflowAddressArray() external pure {
    address[] memory arr = DynamicArrays.dynamicAddressArray(0);
    bytes memory b = new bytes(0);
    arr.dynamicPush(address(100));
    require(b.length == 100, "Did not overflow as expected");
  }

  function buildDynamicUint256Array(
    uint256 size,
    uint256[] calldata elements
  ) external pure returns (uint256[] memory arr) {
    arr = DynamicArrays.dynamicUint256Array(size);
    for (uint256 i; i < elements.length; i++) {
      arr.dynamicPush(elements[i]);
    }
  }

  function testOverflowUint256Array() external pure {
    uint256[] memory arr = DynamicArrays.dynamicUint256Array(0);
    bytes memory b = new bytes(0);
    arr.dynamicPush(100);
    require(b.length == 100, "Did not overflow as expected");
  }
}