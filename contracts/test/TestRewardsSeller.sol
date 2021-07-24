// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;


contract TestRewardsSeller {
  event RewardsSold(
    address originator,
    address rewardsToken,
    address underlying,
    bytes params
  );

  function sellRewards(
    address originator,
    address rewardsToken,
    address underlying,
    bytes calldata params
  ) external {
    emit RewardsSold(originator, rewardsToken, underlying, params);
  }
}