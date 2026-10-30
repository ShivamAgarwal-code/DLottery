import { ethers } from "hardhat";

/**
 * Send test ETH (for gas) to an address on the local chain. Usage:
 *   TO=0x... AMOUNT=100 npx hardhat run scripts/send-eth.ts --network localhost
 */
async function main() {
  const to = process.env.TO;
  const amount = process.env.AMOUNT || "100";
  if (!to) throw new Error("set TO=0x... (recipient address)");

  const [funder] = await ethers.getSigners();
  const tx = await funder.sendTransaction({
    to,
    value: ethers.parseEther(amount),
  });
  await tx.wait();

  const bal = await ethers.provider.getBalance(to);
  console.log(`sent ${amount} ETH to ${to} (from ${funder.address})`);
  console.log(`new balance: ${ethers.formatEther(bal)} ETH`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
