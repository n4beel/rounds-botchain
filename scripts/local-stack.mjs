import { spawn } from "node:child_process";
import { createPublicClient, createWalletClient, defineChain, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ROUNDS_ABI } from "../lib/botchain/abi.js";

const PORT = 8764;
const RPC_URL = `http://127.0.0.1:${PORT}`;

const localChain = defineChain({
  id: 31337,
  name: "Anvil Local",
  nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 },
  rpcUrls: {
    default: { http: [RPC_URL] },
  },
});

async function main() {
  console.log(`Starting local Anvil on port ${PORT}...`);
  const anvil = spawn("anvil", ["-p", String(PORT)], { stdio: "ignore" });

  const publicClient = createPublicClient({
    chain: localChain,
    transport: http(RPC_URL),
  });

  // Wait for anvil
  for (let i = 0; i < 30; i++) {
    try {
      await publicClient.getBlockNumber();
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  console.log("Deploying Rounds contract...");
  const deployer = spawn(
    "forge",
    [
      "create",
      "contracts/src/Rounds.sol:Rounds",
      "--rpc-url",
      RPC_URL,
      "--private-key",
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
      "--broadcast",
    ],
    { cwd: process.cwd() }
  );

  let output = "";
  deployer.stdout.on("data", (d) => (output += d.toString()));
  deployer.stderr.on("data", (d) => (output += d.toString()));

  await new Promise((resolve, reject) => {
    deployer.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Deploy failed: ${output}`));
    });
  });

  const match = output.match(/Deployed to:\s*(0x[a-fA-F0-9]{40})/);
  if (!match) throw new Error("Could not find address");
  const contractAddress = match[1];
  console.log(`Rounds deployed to: ${contractAddress}`);

  // Seeding roles
  const organiser = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
  const payee1 = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
  const payee2 = privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a");
  const payee3 = privateKeyToAccount("0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6");
  const payee4 = privateKeyToAccount("0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a");

  const donorA = privateKeyToAccount("0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba");
  const donorB = privateKeyToAccount("0x92db14e403b83dde342f1b4cff28ad4a5dacd884be92791f2615a9885d8679cf");
  const donorC = privateKeyToAccount("0x4bbbf8560082ea93e76d11802d9db4313f4de79a9fb60d47180403384028644d");
  const donorD = privateKeyToAccount("0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97");
  const donorE = privateKeyToAccount("0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6");
  const donorF = privateKeyToAccount("0xf214f2b17a505273ea631623f77977434aab7110e156e52042461420732868b7");

  const cOrg = createWalletClient({ account: organiser, chain: localChain, transport: http(RPC_URL) });
  const cA = createWalletClient({ account: donorA, chain: localChain, transport: http(RPC_URL) });
  const cB = createWalletClient({ account: donorB, chain: localChain, transport: http(RPC_URL) });
  const cC = createWalletClient({ account: donorC, chain: localChain, transport: http(RPC_URL) });
  const cD = createWalletClient({ account: donorD, chain: localChain, transport: http(RPC_URL) });
  const cE = createWalletClient({ account: donorE, chain: localChain, transport: http(RPC_URL) });
  const cF = createWalletClient({ account: donorF, chain: localChain, transport: http(RPC_URL) });

  console.log("Seeding 5 rounds according to spec §5...");

  // Round 1: open with 4 projects and 9 gifts from 6 donors (one large gift, several small ones)
  const tx1 = await cOrg.writeContract({
    address: contractAddress,
    abi: ROUNDS_ABI,
    functionName: "open",
    args: [
      "Open Source Infrastructure Round",
      BigInt(Math.floor(Date.now() / 1000) + 86400 * 5),
      ["Privacy Rollup SDK", "P2P Messaging Node", "Zero-Knowledge Prover", "Decentralized Indexer"],
      [payee1.address, payee2.address, payee3.address, payee4.address],
    ],
    value: parseEther("25"),
  });
  await publicClient.waitForTransactionReceipt({ hash: tx1 });

  // 9 gifts from 6 donors
  await cA.writeContract({ address: contractAddress, abi: ROUNDS_ABI, functionName: "give", args: [1n, 0], value: parseEther("5") }); // One large
  await cB.writeContract({ address: contractAddress, abi: ROUNDS_ABI, functionName: "give", args: [1n, 1], value: parseEther("0.5") });
  await cC.writeContract({ address: contractAddress, abi: ROUNDS_ABI, functionName: "give", args: [1n, 1], value: parseEther("0.5") });
  await cD.writeContract({ address: contractAddress, abi: ROUNDS_ABI, functionName: "give", args: [1n, 1], value: parseEther("0.5") });
  await cE.writeContract({ address: contractAddress, abi: ROUNDS_ABI, functionName: "give", args: [1n, 1], value: parseEther("0.5") });
  await cF.writeContract({ address: contractAddress, abi: ROUNDS_ABI, functionName: "give", args: [1n, 2], value: parseEther("1") });
  await cB.writeContract({ address: contractAddress, abi: ROUNDS_ABI, functionName: "give", args: [1n, 2], value: parseEther("0.8") });
  await cC.writeContract({ address: contractAddress, abi: ROUNDS_ABI, functionName: "give", args: [1n, 3], value: parseEther("1.2") });
  await cA.writeContract({ address: contractAddress, abi: ROUNDS_ABI, functionName: "give", args: [1n, 3], value: parseEther("0.3") });

  // Round 2: ending in ~10 minutes
  const tx2 = await cOrg.writeContract({
    address: contractAddress,
    abi: ROUNDS_ABI,
    functionName: "open",
    args: [
      "Community Tooling Sprint",
      BigInt(Math.floor(Date.now() / 1000) + 3600),
      ["Documentation Portal", "Block Explorer Plugin"],
      [payee1.address, payee2.address],
    ],
    value: parseEther("5"),
  });
  await publicClient.waitForTransactionReceipt({ hash: tx2 });
  await cA.writeContract({ address: contractAddress, abi: ROUNDS_ABI, functionName: "give", args: [2n, 0], value: parseEther("0.5") });

  // Round 3: ended and not finalized
  const tx3 = await cOrg.writeContract({
    address: contractAddress,
    abi: ROUNDS_ABI,
    functionName: "open",
    args: [
      "Validator Node Hardware Grant",
      BigInt(Math.floor(Date.now() / 1000) + 3600),
      ["Asia Region Validator", "LatAm Region Validator"],
      [payee1.address, payee2.address],
    ],
    value: parseEther("10"),
  });
  await publicClient.waitForTransactionReceipt({ hash: tx3 });
  await cA.writeContract({ address: contractAddress, abi: ROUNDS_ABI, functionName: "give", args: [3n, 0], value: parseEther("1") });

  // Round 4: finalized (payees have pending)
  const tx4 = await cOrg.writeContract({
    address: contractAddress,
    abi: ROUNDS_ABI,
    functionName: "open",
    args: [
      "Bug Bounty & Audit Match",
      BigInt(Math.floor(Date.now() / 1000) + 3600),
      ["Cryptographic Review", "Smart Contract Formal Verification"],
      [payee1.address, payee2.address],
    ],
    value: parseEther("8"),
  });
  await publicClient.waitForTransactionReceipt({ hash: tx4 });
  await cA.writeContract({ address: contractAddress, abi: ROUNDS_ABI, functionName: "give", args: [4n, 0], value: parseEther("2") });
  await cB.writeContract({ address: contractAddress, abi: ROUNDS_ABI, functionName: "give", args: [4n, 1], value: parseEther("1") });

  // Fast forward anvil for Round 3 and Round 4 to end
  await publicClient.request({
    method: "evm_increaseTime",
    params: [3650],
  });
  await publicClient.request({
    method: "evm_mine",
    params: [],
  });

  // Finalize Round 4
  await cA.writeContract({
    address: contractAddress,
    abi: ROUNDS_ABI,
    functionName: "finalize",
    args: [4n],
  });

  // Round 5: pool too small, so match is scaled down
  const tx5 = await cOrg.writeContract({
    address: contractAddress,
    abi: ROUNDS_ABI,
    functionName: "open",
    args: [
      "Micro-Grant Experiment",
      BigInt(Math.floor(Date.now() / 1000) + 86400 * 2),
      ["Design System Icons", "CLI Helper Scripts"],
      [payee3.address, payee4.address],
    ],
    value: parseEther("1"), // Small 1 BOT pool
  });
  await publicClient.waitForTransactionReceipt({ hash: tx5 });
  await cA.writeContract({ address: contractAddress, abi: ROUNDS_ABI, functionName: "give", args: [5n, 0], value: parseEther("1") });
  await cB.writeContract({ address: contractAddress, abi: ROUNDS_ABI, functionName: "give", args: [5n, 0], value: parseEther("1") });
  await cC.writeContract({ address: contractAddress, abi: ROUNDS_ABI, functionName: "give", args: [5n, 1], value: parseEther("1") });
  await cD.writeContract({ address: contractAddress, abi: ROUNDS_ABI, functionName: "give", args: [5n, 1], value: parseEther("1") });

  console.log("Local stack ready! Running on http://127.0.0.1:" + PORT);
  console.log("Contract Address:", contractAddress);

  await new Promise(() => {});
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
