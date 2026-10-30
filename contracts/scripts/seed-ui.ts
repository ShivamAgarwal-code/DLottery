import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/** Seeds visual state for UI screenshots: settles one draw, then partially fills the next. */
async function main() {
  const dep = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "deployments", "localhost.json"), "utf8")
  );
  const usd8 = await ethers.getContractAt("USD8", dep.contracts.USD8.address);
  const lottery = await ethers.getContractAt("DLottery", dep.contracts.DLottery.address);
  const addr = dep.contracts.DLottery.address;
  const signers = await ethers.getSigners();
  const players = signers.slice(1, 6);
  const price = await lottery.ticketPrice();

  for (const p of players) {
    await (await usd8.mint(p.address, ethers.parseUnits("10000", 18))).wait();
    await (await usd8.connect(p).approve(addr, ethers.MaxUint256)).wait();
  }

  // Settle draw #1 with 2 players (no winner likely) to create a rollover + history row.
  const d1 = await lottery.currentDrawId();
  await (await lottery.connect(players[0]).buyTicket(4)).wait();
  await (await lottery.connect(players[1]).buyTicket(9)).wait();
  await network.provider.send("evm_increaseTime", [24 * 60 * 60 + 1]);
  await network.provider.send("evm_mine", []);
  await (await lottery.performDraw()).wait();
  console.log(`settled draw #${d1}`);

  // Partially fill the new current draw so the dashboard looks alive.
  const d2 = await lottery.currentDrawId();
  await (await lottery.connect(players[0]).buyTicket(2)).wait();
  await (await lottery.connect(players[1]).buyTicket(5)).wait();
  await (await lottery.connect(players[2]).buyTicket(7)).wait();
  console.log(`current draw #${d2}: 3 players seeded (numbers 2, 5, 7)`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
