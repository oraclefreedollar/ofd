// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";

import "../contracts/test/Strings.sol";
import "../contracts/test/TestToken.sol";
import "../contracts/Equity.sol";
import "../contracts/StablecoinBridge.sol";
import "../contracts/Equity.sol";
import "../contracts/OracleFreeDollar.sol";
import "../contracts/utils/OFDPSWrapper.sol";

contract OFDPSWrapperTest is Test {

    OracleFreeDollar ofd;
    Equity ofdps;
    StablecoinBridge swap;
    TestToken xofd;
    OFDPSWrapper wofdps;

    error General(uint256 val);

    constructor() {
        ofd = new OracleFreeDollar(0);
        ofdps = Equity(address(ofd.reserve()));
        wofdps = new OFDPSWrapper(ofdps);
        xofd = new TestToken("Base Dollar", "BUSD", uint8(18));
        swap = new StablecoinBridge(address(xofd), address(ofd), 100000 ether);
        ofd.initialize(address(swap), "");
        xofd.mint(address(this), 100000 ether);
        xofd.approve(address(swap), 100000 ether);
        swap.mint(100000 ether);
        ofdps.invest(100000 ether, 0);
    }

    function testWrapper() public {
        ofdps.approve(address(wofdps), 500 ether);
        wofdps.wrap(500 ether);
        vm.expectRevert();
        wofdps.wrap(1);
        require(wofdps.balanceOf(address(this)) == 500 ether);
        vm.warp(block.timestamp + 5);
        uint256 votesBefore = ofdps.votes(address(wofdps));
        uint256 tot = ofdps.totalVotes();
        wofdps.halveHoldingDuration(new address[](0));
        uint256 votesAfter = ofdps.votes(address(wofdps));
        require(votesAfter == votesBefore / 2);
        require(ofdps.totalVotes() == tot + votesAfter - votesBefore);
        vm.expectRevert();
        wofdps.unwrapAndSell(10 ether);
        wofdps.unwrap(10 ether);
        require(ofdps.balanceOf(address(this)) == 510 ether);
        vm.warp(block.timestamp + 90*24*3600);
        wofdps.unwrapAndSell(10 ether);
        require(ofdps.totalSupply() == 990 ether);
        ofdps.redeem(address(this), 510 ether);
        vm.expectRevert();
        wofdps.halveHoldingDuration(new address[](0));
    }

    function testDepositAndWithdraw() public {
        ofdps.approve(address(wofdps), 10 ether);
        wofdps.depositFor(address(0x1), 1 ether);
        require(wofdps.balanceOf(address(0x1)) == 1 ether);
        vm.expectRevert();
        wofdps.withdrawTo(address(0x1), 1 ether);
        wofdps.wrap(1 ether);
        wofdps.withdrawTo(address(0x2), 1 ether);
        require(wofdps.underlying().balanceOf(address(0x2)) == 1 ether);
    }
}
