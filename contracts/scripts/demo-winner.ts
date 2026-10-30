import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Drives full 5-player draws until one yields a winner, then has the winner claim the
 * prize. Exercises the winner + DAO-fee + prize-claim path end-to-end against a live node.
 */
async function main() {
  const dep = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "deployments", "localhost.json"), "utf8")
  );
  const usd8 = await ethers.getContractAt("USD8", dep.contracts.USD8.address);
  const lottery = await ethers.getContractAt("DLottery", dep.contracts.DLottery.address);
  const lotteryAddr = dep.contracts.DLottery.address;

  const signers = await ethers.getSigners();
  const players = signers.slice(1, 6); // 5 players
  const price = await lottery.ticketPrice();

  // Fund + approve all players (deployer is the USD8 owner).
  for (const p of players) {
    await (await usd8.mint(p.address, ethers.parseUnits("10000", 18))).wait();
    await (await usd8.connect(p).approve(lotteryAddr, ethers.MaxUint256)).wait();
  }

  const statusNames = ["None", "Active", "Completed", "NoWinner", "Cancelled"];
  let winnerDrawId = 0n;

  for (let round = 0; round < 25 && winnerDrawId === 0n; round++) {
    const drawId = await lottery.currentDrawId();
    for (let i = 0; i < 5; i++) {
      await (await lottery.connect(players[i]).buyTicket(i + 1)).wait();
    }
    await network.provider.send("evm_increaseTime", [24 * 60 * 60 + 1]);
    await network.provider.send("evm_mine", []);
    await (await lottery.performDraw()).wait();

    const d = await lottery.getDraw(drawId);
    console.log(
      `round ${round + 1}: draw #${drawId} -> ${statusNames[Number(d.status)]} (lucky ${d.luckyNumber}, pool ${ethers.formatUnits(d.totalPool, 18)} USD8)`
    );
    if (Number(d.status) === 2) winnerDrawId = drawId;
  }

  if (winnerDrawId === 0n) {
    console.log("no winner in 25 rounds (unlucky); run again");
    return;
  }

  const d = await lottery.getDraw(winnerDrawId);
  const winnerSigner = players.find((p) => p.address.toLowerCase() === d.winner.toLowerCase())!;
  console.log(`\nWINNER draw #${winnerDrawId}`);
  console.log(`  winner:       ${d.winner}`);
  console.log(`  lucky number: ${d.luckyNumber}`);
  console.log(`  total pool:   ${ethers.formatUnits(d.totalPool, 18)} USD8`);
  console.log(`  DAO fee (5%): ${ethers.formatUnits(d.daoFee, 18)} USD8`);
  console.log(`  winner prize: ${ethers.formatUnits(d.winnerPrize, 18)} USD8`);

  const dao = dep.contracts.DLottery.dao;
  const daoBefore = await usd8.balanceOf(dao);
  const winBefore = await usd8.balanceOf(d.winner);

  await (await lottery.connect(winnerSigner).claimPrize(winnerDrawId)).wait();

  const daoAfter = await usd8.balanceOf(dao);
  const winAfter = await usd8.balanceOf(d.winner);
  console.log(`\nAfter claim:`);
  console.log(`  DAO received:    ${ethers.formatUnits(daoAfter - daoBefore, 18)} USD8`);
  console.log(`  winner received: ${ethers.formatUnits(winAfter - winBefore, 18)} USD8`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
