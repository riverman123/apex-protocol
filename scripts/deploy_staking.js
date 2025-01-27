const { ethers, upgrades } = require("hardhat");
const { BigNumber } = require("@ethersproject/bignumber");
const verifyStr = "npx hardhat verify --network";

//// ArbitrumOne
// const wethAddress = "0x82af49447d8a07e3bd95bd0d56f35241523fbab1";
// const apeXAddress = "0x3f355c9803285248084879521AE81FF4D3185cDD";
// const treasuryAddress = ""; // PCVTreasury address
// const lpTokenAddress = ""; // WETH-USDC eAMM lp
//// Testnet
const wethAddress = "0x655e2b2244934Aea3457E3C56a7438C271778D44";
const apeXAddress = "0x3f355c9803285248084879521AE81FF4D3185cDD";
const treasuryAddress = "0x42C0E0fdA16CE20C3c15bBF666Ee79EaB5998F20"; // PCVTreasury address
const lpTokenAddress = "0x01A3eae4edD0512d7d1e3B57eCD40A1A1b1076EE"; // mWETH-mUSDC lp

const apeXPerSec = BigNumber.from("82028346620490110");
const secSpanPerUpdate = 14 * 24 * 3600; //two weeks
const initTimestamp = Math.round(new Date().getTime() / 1000);
const endTimestamp = initTimestamp + 365 * 24 * 3600 * 3; //3 years after init time
const sixMonth = 26 * 7 * 24 * 3600;
const apeXPoolWeight = 21;
const lpPoolWeight = 79;
const remainForOtherVest = 50;
const minRemainRatioAfterBurn = 6000;

let esApeX;
let veApeX;
let apeXPool;
let lpPool;
let stakingPoolTemplate;
let stakingPoolFactory;
let rewardForStaking;

const main = async () => {
  await createPools();
  // await createReward();
  // await createPool();
};

async function createPools() {
  const StakingPoolFactory = await ethers.getContractFactory("StakingPoolFactory");
  const StakingPool = await ethers.getContractFactory("StakingPool");
  const ApeXPool = await ethers.getContractFactory("ApeXPool");
  const EsAPEX = await ethers.getContractFactory("EsAPEX");
  const VeAPEX = await ethers.getContractFactory("VeAPEX");

  stakingPoolTemplate = await StakingPool.deploy();
  console.log("stakingPoolTemplate:", stakingPoolTemplate.address);
  console.log(verifyStr, process.env.HARDHAT_NETWORK, stakingPoolTemplate.address);

  stakingPoolFactory = await StakingPoolFactory.deploy();
  await stakingPoolFactory.initialize(
    apeXAddress,
    treasuryAddress,
    apeXPerSec,
    secSpanPerUpdate,
    initTimestamp,
    endTimestamp,
    sixMonth
  );
  console.log("StakingPoolFactory:", stakingPoolFactory.address);
  console.log(verifyStr, process.env.HARDHAT_NETWORK, stakingPoolFactory.address);

  // stakingPoolFactory = await upgrades.deployProxy(StakingPoolFactory, [
  //   apeXAddress,
  //   treasuryAddress,
  //   apeXPerSec,
  //   secSpanPerUpdate,
  //   initTimestamp,
  //   endTimestamp,
  //   sixMonth,
  // ]);
  // console.log("StakingPoolFactory:", stakingPoolFactory.address);

  apeXPool = await ApeXPool.deploy(stakingPoolFactory.address, apeXAddress);
  console.log("ApeXPool:", apeXPool.address);
  console.log(verifyStr, process.env.HARDHAT_NETWORK, apeXPool.address, stakingPoolFactory.address, apeXAddress);

  esApeX = await EsAPEX.deploy(stakingPoolFactory.address);
  console.log("EsAPEX:", esApeX.address);
  console.log(verifyStr, process.env.HARDHAT_NETWORK, esApeX.address, stakingPoolFactory.address);

  veApeX = await VeAPEX.deploy(stakingPoolFactory.address);
  console.log("VeAPEX:", veApeX.address);
  console.log(verifyStr, process.env.HARDHAT_NETWORK, veApeX.address, stakingPoolFactory.address);

  await stakingPoolFactory.setRemainForOtherVest(remainForOtherVest);
  await stakingPoolFactory.setMinRemainRatioAfterBurn(minRemainRatioAfterBurn);
  await stakingPoolFactory.setEsApeX(esApeX.address);
  await stakingPoolFactory.setVeApeX(veApeX.address);
  await stakingPoolFactory.setStakingPoolTemplate(stakingPoolTemplate.address);

  await stakingPoolFactory.registerApeXPool(apeXPool.address, apeXPoolWeight);

  await stakingPoolFactory.createPool(lpTokenAddress, lpPoolWeight);
  lpPool = StakingPool.attach(await stakingPoolFactory.tokenPoolMap(lpTokenAddress));
  console.log("lpPool:", lpPool.address);
}

async function createReward() {
  const RewardForStaking = await ethers.getContractFactory("RewardForStaking");
  rewardForStaking = await RewardForStaking.deploy(wethAddress);
  console.log("RewardForStaking:", rewardForStaking.address);
  console.log(verifyStr, process.env.HARDHAT_NETWORK, rewardForStaking.address, wethAddress);
}

async function createPool() {
  let lpAddress = "0x2A7Cc7B20732CcB98ee07017eE5970015862ac65";
  const StakingPoolFactory = await ethers.getContractFactory("StakingPoolFactory");
  stakingPoolFactory = await StakingPoolFactory.attach("0xD016d30b95BF366bFBF019e6B8CDCB453cbeC2b8");
  await stakingPoolFactory.createPool(lpAddress, slpPoolWeight);
  let lpPool = StakingPool.attach(await stakingPoolFactory.tokenPoolMap(lpAddress));
  console.log("lpPool:", lpPool.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
