pragma solidity ^0.8.0;

import "./interfaces/IFactory.sol";
import "./interfaces/IAmm.sol";
import "./interfaces/IMargin.sol";
import "./interfaces/IVault.sol";
import "./Amm.sol";
import "./Margin.sol";
import "./Vault.sol";
import "./Staking.sol";
import "./utils/Ownable.sol";

contract Factory is IFactory, Ownable {
    address public override config;

    mapping(address => mapping(address => address)) public override getAmm;
    mapping(address => mapping(address => address)) public override getMargin;
    mapping(address => mapping(address => address)) public override getVault;

    mapping(address => address) public override getStaking;

    constructor(address _config) {
        config = _config;
    }

    function createPair(address baseToken, address quoteToken)
        external
        override
        returns (
            address amm,
            address margin,
            address vault
        )
    {
        require(baseToken != quoteToken, "Factory: IDENTICAL_ADDRESSES");
        require(baseToken != address(0) && quoteToken != address(0), "Factory: ZERO_ADDRESS");
        require(getAmm[baseToken][quoteToken] == address(0), "Factory: PAIR_EXIST");
        bytes32 salt = keccak256(abi.encodePacked(baseToken, quoteToken));
        bytes memory ammBytecode = type(Amm).creationCode;
        bytes memory marginBytecode = type(Margin).creationCode;
        bytes memory vaultBytecode = type(Vault).creationCode;
        assembly {
            amm := create2(0, add(ammBytecode, 32), mload(ammBytecode), salt)
            margin := create2(0, add(marginBytecode, 32), mload(marginBytecode), salt)
            vault := create2(0, add(vaultBytecode, 32), mload(vaultBytecode), salt)
        }
        IAmm(amm).initialize(baseToken, quoteToken, config, margin, vault);
        IMargin(margin).initialize(baseToken, quoteToken, config, amm, vault);
        IVault(vault).initialize(baseToken, amm, margin);
        getAmm[baseToken][quoteToken] = amm;
        getMargin[baseToken][quoteToken] = margin;
        getVault[baseToken][quoteToken] = vault;
        emit NewPair(baseToken, quoteToken, amm, margin, vault);
    }

    // TODO: 改用创建Staking代理合约
    function createStaking(address baseToken, address quoteToken) external override returns (address staking) {
        address amm = getAmm[baseToken][quoteToken];
        require(amm != address(0), "Factory: PAIR_NOT_EXIST");
        require(getStaking[amm] == address(0), "Factory: STAKING_EXIST");
        staking = address(new Staking(config, amm));
        getStaking[amm] = staking;
        emit NewStaking(baseToken, quoteToken, staking);
    }
}
