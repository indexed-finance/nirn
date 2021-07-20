// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;

import "../interfaces/CompoundInterfaces.sol";
import "../interfaces/IERC20.sol";


contract TestComptrollerLens {
  IComptroller internal constant comptroller = IComptroller(0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B);
  IERC20 internal constant comp = IERC20(0xc00e94Cb662C3520282E6f5717214004A7f26888);

  function getPendingRewards(address account, address cToken) external returns (uint256) {
    uint256 compBefore = comp.balanceOf(account);
    address[] memory holders = new address[](1);
    address[] memory cTokens = new address[](1);
    holders[0] = account;
    cTokens[0] = cToken;
    comptroller.claimComp(holders, cTokens, false, true);
    uint256 compAfter = comp.balanceOf(account);
    return compAfter - compBefore;
  }
}