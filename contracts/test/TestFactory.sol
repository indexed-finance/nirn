// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;
import "../libraries/CloneLibrary.sol";


contract TestFactory {
  address public last;
  function clone(address implementation) external {
    last = CloneLibrary.createClone(implementation);
  }
}