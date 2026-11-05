// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "forge-std/Script.sol";
import "../src/Rounds.sol";

contract DeployScript is Script {
  function run() external returns (Rounds rounds) {
    vm.startBroadcast();
    rounds = new Rounds();
    vm.stopBroadcast();
  }
}
