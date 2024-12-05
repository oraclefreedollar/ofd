// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./TestToken.sol";
import "../utils/Ownable.sol";
import "../interface/IOracleFreeDollar.sol";

contract FaucetTestDeployment is Ownable {
    IERC20[] public tokens;
    IOracleFreeDollar public ofd;

    bool public init = false;
    uint256 public tokenCnt = 0;

    event NewToken(uint256 id, string name, string symbol, address token);
    event NewOfd(address member, address to, uint256 amount);
    event NewMint(address member, address to, uint256 amount);

    constructor() {
        _setOwner(msg.sender);
    }

    function setOfd(address _ofd) public onlyOwner {
        ofd = IOracleFreeDollar(_ofd); // needs suggest minter
    }

    function initTokens() public onlyOwner {
        require(init == false, "Already done");
        createToken("Wrapped Bitcoin", "WBTC", 8);
        createToken("Uniswap", "UNI", 18);
        createToken("Supercoin", "SUP", 18);
        createToken("Bees Protocol", "BEES", 4); // use dif. decs
        createToken("Boss AG", "BOSS", 0); // use dif. decs
        createToken("Unreal", "REALU", 9); // use dif. decs
        init = true;
    }

    function createToken(string memory name, string memory symbol, uint8 dec) public onlyOwner {
        TestToken newToken = new TestToken(name, symbol, dec);
        tokens.push(newToken);
        emit NewToken(tokenCnt, name, symbol, address(newToken));
        tokenCnt++;
    }

    function mintTo(address to, uint256 amount) public {
        for (uint256 i = 0; i < tokenCnt; i++) {
            TestToken token = TestToken(address(tokens[i]));
            token.mint(to, amount * 10 ** token.decimals());
        }
        emit NewMint(msg.sender, to, amount);
    }

    function mintZofdTo(address to, uint256 amount) public {
        ofd.mint(to, amount);
        emit NewOfd(msg.sender, to, amount);
    }

    function mint() public {
        mintZofdTo(msg.sender, 100_000 ether);
        mintTo(msg.sender, 1000);
    }
}
