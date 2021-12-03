const { expect } = require("chai");
const { BN, constants, time } = require("@openzeppelin/test-helpers");

describe("stakingPool contract", function () {
  let apexToken;
  let owner;
  let addr1;
  let tx;
  let stakingPoolFactory;
  let slpToken;
  let initBlock = 1;
  let endBlock = 7090016;
  let blocksPerUpdate = 2;
  let apexPerBlock = 100;
  let apexStakingPool;
  let slpStakingPool;
  let lockUntil = 0;
  let invalidLockUntil = 10;

  beforeEach(async function () {
    [owner, addr1] = await ethers.getSigners();

    const MockToken = await ethers.getContractFactory("MockToken");
    const StakingPoolFactory = await ethers.getContractFactory("StakingPoolFactory");
    const StakingPool = await ethers.getContractFactory("StakingPool");

    apexToken = await MockToken.deploy("apex token", "at");
    slpToken = await MockToken.deploy("slp token", "slp");
    stakingPoolFactory = await upgrades.deployProxy(StakingPoolFactory, [
      apexToken.address,
      apexPerBlock,
      blocksPerUpdate,
      initBlock,
      endBlock,
    ]);

    await stakingPoolFactory.createPool(apexToken.address, initBlock, 21);
    apexStakingPool = StakingPool.attach((await stakingPoolFactory.pools(apexToken.address))[0]);

    await stakingPoolFactory.createPool(slpToken.address, initBlock, 79);
    slpStakingPool = StakingPool.attach((await stakingPoolFactory.pools(slpToken.address))[0]);

    await apexToken.mint(owner.address, 100_0000);
    await apexToken.approve(apexStakingPool.address, 100_0000);
    await apexToken.mint(stakingPoolFactory.address, 100_0000);
    await slpToken.mint(owner.address, 100_0000);
    await slpToken.approve(slpStakingPool.address, 100_0000);
  });

  describe("stake", function () {
    it("reverted when stake invalid amount", async function () {
      await expect(apexStakingPool.stake(0, lockUntil)).to.be.revertedWith("cp._stake: INVALID_AMOUNT");
    });

    it("reverted when exceed balance", async function () {
      await expect(apexStakingPool.connect(addr1).stake(10000, lockUntil)).to.be.revertedWith(
        "ERC20: transfer amount exceeds balance"
      );
    });

    it("reverted when exceed balance", async function () {
      await expect(apexStakingPool.stake(10000, invalidLockUntil)).to.be.revertedWith(
        "cp._stake: INVALID_LOCK_INTERVAL"
      );
    });

    it("stake successfully", async function () {
      await apexStakingPool.stake(10000, lockUntil);

      let user = await apexStakingPool.users(owner.address);
      expect(user.tokenAmount.toNumber()).to.equal(10000);
      expect(user.totalWeight.toNumber()).to.equal(10000 * 1e6);
      expect(user.subYieldRewards.toNumber()).to.equal(0);
    });

    it("stake twice, no lock", async function () {
      await apexStakingPool.stake(10000, 0);
      await apexStakingPool.stake(20000, 0);

      let user = await apexStakingPool.users(owner.address);
      expect(user.tokenAmount.toNumber()).to.equal(30020);
      expect(user.totalWeight.toNumber()).to.equal(30040 * 1e6);
      expect(user.subYieldRewards.toNumber()).to.equal(60);
    });

    it("stake twice, with one year lock", async function () {
      let oneYearLockUntil = await oneYearLater();
      await apexStakingPool.stake(10000, oneYearLockUntil);
      let user = await apexStakingPool.users(owner.address);
      expect(user.tokenAmount.toNumber()).to.equal(10000);
      expect(user.totalWeight.toNumber()).to.be.at.least(19999000000);
      expect(user.subYieldRewards.toNumber()).to.equal(0);

      oneYearLockUntil = await oneYearLater();
      await apexStakingPool.stake(20000, oneYearLockUntil);
      user = await apexStakingPool.users(owner.address);
      expect(user.tokenAmount.toNumber()).to.equal(30019);
      expect(user.totalWeight.toNumber()).to.be.at.most(60037990000);
      expect(user.subYieldRewards.toNumber()).to.equal(60);
    });
  });

  describe("unstake", function () {
    beforeEach(async function () {
      let oneYearLockUntil = await oneYearLater();
      await apexToken.approve(apexStakingPool.address, 20000);
      await stakingPoolFactory.setYieldLockTime(10);

      await apexStakingPool.stake(10000, 0);
    });

    it("stake, process reward, unstake, transfer apeX ", async function () {
      await network.provider.send("evm_mine");
      await apexStakingPool.processRewards();
      await network.provider.send("evm_mine");
      await apexStakingPool.unstakeBatch([0], [10000]);
      await expect(apexStakingPool.unstakeBatch([1], [10000])).to.be.revertedWith("p.unstakeBatch: DEPOSIT_LOCKE");
      await mineBlocks(100);
      let oldBalance = (await apexToken.balanceOf(owner.address)).toNumber();
      await apexStakingPool.unstakeBatch([1], [9]);
      let newBalance = (await apexToken.balanceOf(owner.address)).toNumber();
      expect(oldBalance + 9).to.be.equal(newBalance);
    });
  });

  describe("stakeAsPool", function () {
    beforeEach(async function () {
      await stakingPoolFactory.setYieldLockTime(10);

      await slpStakingPool.stake(10000, 0);
    });

    it("unlock too early", async function () {
      let oneYearLockUntil = await oneYearLater();
      await slpStakingPool.stake(10000, oneYearLockUntil);
      await expect(slpStakingPool.unstakeBatch([1], [10000])).to.be.revertedWith("p.unstakeBatch: DEPOSIT_LOCKE");
    });

    it("stake, process reward to apeXPool, unstake from slpPool, unstake from apeXPool", async function () {
      await network.provider.send("evm_mine");
      await slpStakingPool.processRewards();

      await network.provider.send("evm_mine");
      await slpStakingPool.unstakeBatch([0], [10000]);
      await mineBlocks(100);
      let oldBalance = (await apexToken.balanceOf(owner.address)).toNumber();
      await apexStakingPool.unstakeBatch([0], [1]);
      let newBalance = (await apexToken.balanceOf(owner.address)).toNumber();
      expect(oldBalance + 1).to.be.equal(newBalance);
    });
  });

  describe("pendingYieldRewards", function () {
    beforeEach(async function () {
      await stakingPoolFactory.setYieldLockTime(10);
      await slpStakingPool.stake(10000, 0);
    });

    it("stake, process reward to apeXPool, unstake from slpPool, unstake from apeXPool", async function () {
      await network.provider.send("evm_mine");
      //linear to apeXPerBlock, 97*79/100
      expect(await slpStakingPool.pendingYieldRewards(owner.address)).to.be.equal(76);
      await slpStakingPool.processRewards();
      expect(await slpStakingPool.pendingYieldRewards(owner.address)).to.be.equal(0);
      await network.provider.send("evm_mine");
      //linear to apeXPerBlock, 94*79/100
      expect(await slpStakingPool.pendingYieldRewards(owner.address)).to.be.equal(74);
    });
  });
});

async function mineBlocks(blockNumber) {
  while (blockNumber > 0) {
    blockNumber--;
    await hre.network.provider.request({
      method: "evm_mine",
    });
  }
}

async function currentBlockNumber() {
  return ethers.provider.getBlockNumber();
}

async function oneYearLater() {
  return Math.floor(Date.now() / 1000) + 31536000;
}