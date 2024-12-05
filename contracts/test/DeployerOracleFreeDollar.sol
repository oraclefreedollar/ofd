// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import '../OracleFreeDollar.sol';
import '../interface/IReserve.sol';
import '../Leadrate.sol';
import "../PositionFactory.sol";
import "../MintingHub.sol";

contract DeployerOracleFreeDollar {
    string public constant NAME = "DeployerV0";
    OracleFreeDollar public ofd;
    PositionFactory public factory;
    Leadrate public leadrate;
    PositionRoller public roller;
    MintingHub public mintingHub;

    event Log(address sender, string message);

    constructor(address _ofd) {
        ofd = new OracleFreeDollar(1);
        factory = new PositionFactory();
        roller = new PositionRoller(address(ofd));
        leadrate = new Leadrate(ofd.reserve(), 20000);
        mintingHub = new MintingHub(address(ofd), address(leadrate), address(roller), address(factory));

        ofd.initialize(msg.sender, "Developer");
        ofd.initialize(address(this), "Deployer");
        ofd.initialize(address(mintingHub), "MintingHub");
        ofd.initialize(address(roller), "Roller");
    }

    function initA_OracleFreeDollar() public {
        uint256 toMint = 1_000_000 ether;
        ofd.mint(address(this), 2 * toMint);
        IReserve(ofd.reserve()).invest(toMint, 1000 ether);

        // for sender
        ofd.mint(msg.sender, toMint);
    }

    function increaseLeadrate() public {
        leadrate.proposeChange(leadrate.currentRatePPM() + 1000, new address[](0));
    }

    function revertLeadrate() public {
        leadrate.proposeChange(leadrate.currentRatePPM(), new address[](0));
    }
}
