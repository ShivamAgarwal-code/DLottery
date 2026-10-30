import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/** Cancels an under-subscribed draw and claims a refund (exercises SC-25/26 + events). */
async function main() {
  const dep = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "deployments", "localhost.json"), "utf8")
  );
  const usd8 = await ethers.getContractAt("USD8", dep.contracts.USD8.address);
  const lottery = await ethers.getContractAt("DLottery", dep.contracts.DLottery.address);
  const lotteryAddr = dep.contracts.DLottery.address;

  const signers = await ethers.getSigners();
  const p = signers[1];
  await (await usd8.mint(p.address, ethers.parseUnits("100", 18))).wait();
  await (await usd8.connect(p).approve(lotteryAddr, ethers.MaxUint256)).wait();

  const drawId = await lottery.currentDrawId();
  const price = await lottery.ticketPrice();
  await (await lottery.connect(p).buyTicket(5)).wait();
  console.log(`draw #${drawId}: 1 participant (below min 2)`);

  await network.provider.send("evm_increaseTime", [24 * 60 * 60 + 1]);
  await network.provider.send("evm_mine", []);
  await (await lottery.performDraw()).wait();

  const d = await lottery.getDraw(drawId);
  const statusNames = ["None", "Active", "Completed", "NoWinner", "Cancelled"];
  console.log(`draw #${drawId} -> ${statusNames[Number(d.status)]}`);

  const before = await usd8.balanceOf(p.address);
  await (await lottery.connect(p).claimRefund(drawId)).wait();
  const after = await usd8.balanceOf(p.address);
  console.log(`refund received: ${ethers.formatUnits(after - before, 18)} USD8 (principal ${ethers.formatUnits(price, 18)})`);

  // Second claim must revert (SC-26).
  try {
    await (await lottery.connect(p).claimRefund(drawId)).wait();
    console.log("ERROR: second refund unexpectedly succeeded");
  } catch {
    console.log("second refund correctly reverted (claim-once enforced)");
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
