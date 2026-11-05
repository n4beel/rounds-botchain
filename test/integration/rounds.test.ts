import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, ChildProcess } from "node:child_process";
import { createPublicClient, createWalletClient, defineChain, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ROUNDS_ABI } from "../../lib/botchain/abi";
import { allocate, isqrt } from "../../lib/rounds";

const ANVIL_PORT = 8664;
const RPC_URL = `http://127.0.0.1:${ANVIL_PORT}`;

const localChain = defineChain({
  id: 31337,
  name: "Anvil Local",
  nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 },
  rpcUrls: {
    default: { http: [RPC_URL] },
  },
});

describe("Rounds Integration Test (Spec §5)", () => {
  let anvil: ChildProcess;

  const organiser = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
  const payee1 = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
  const payee2 = privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a");
  const donorA = privateKeyToAccount("0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6");
  const donorB = privateKeyToAccount("0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a");

  const publicClient = createPublicClient({
    chain: localChain,
    transport: http(RPC_URL),
  });

  const clientOrganiser = createWalletClient({ account: organiser, chain: localChain, transport: http(RPC_URL) });
  const clientPayee1 = createWalletClient({ account: payee1, chain: localChain, transport: http(RPC_URL) });
  const clientDonorA = createWalletClient({ account: donorA, chain: localChain, transport: http(RPC_URL) });
  const clientDonorB = createWalletClient({ account: donorB, chain: localChain, transport: http(RPC_URL) });

  let roundsAddress: `0x${string}`;

  beforeAll(async () => {
    anvil = spawn("anvil", ["-p", String(ANVIL_PORT)], { stdio: "ignore" });

    for (let i = 0; i < 30; i++) {
      try {
        await publicClient.getBlockNumber();
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 200));
      }
    }

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

    await new Promise<void>((resolve, reject) => {
      deployer.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Deploy failed: ${output}`));
      });
    });

    const match = output.match(/Deployed to:\s*(0x[a-fA-F0-9]{40})/);
    if (!match) throw new Error(`Could not find deployed address: ${output}`);
    roundsAddress = match[1] as `0x${string}`;
  }, 30000);

  afterAll(() => {
    if (anvil) anvil.kill();
  });

  it("completes long path: open -> give -> give again -> warp -> finalize -> withdraw and matches allocate()", async () => {
    const roundId = 1n;
    const pool = parseEther("10"); // 10 BOT
    const endsAt = BigInt(Math.floor(Date.now() / 1000) + 7200);

    // 1. Organiser opens round
    const hashOpen = await clientOrganiser.writeContract({
      address: roundsAddress,
      abi: ROUNDS_ABI,
      functionName: "open",
      args: ["Integration Round", endsAt, ["Project Alpha", "Project Beta"], [payee1.address, payee2.address]],
      value: pool,
    });
    await publicClient.waitForTransactionReceipt({ hash: hashOpen });

    // 2. Donor A gives 1 BOT to Project 0
    const hashG1 = await clientDonorA.writeContract({
      address: roundsAddress,
      abi: ROUNDS_ABI,
      functionName: "give",
      args: [roundId, 0],
      value: parseEther("1"),
    });
    await publicClient.waitForTransactionReceipt({ hash: hashG1 });

    // 3. Donor A gives again 3 BOT to Project 0 (total 4 BOT from A)
    const hashG2 = await clientDonorA.writeContract({
      address: roundsAddress,
      abi: ROUNDS_ABI,
      functionName: "give",
      args: [roundId, 0],
      value: parseEther("3"),
    });
    await publicClient.waitForTransactionReceipt({ hash: hashG2 });

    // 4. Donor B gives 1 BOT to Project 1
    const hashG3 = await clientDonorB.writeContract({
      address: roundsAddress,
      abi: ROUNDS_ABI,
      functionName: "give",
      args: [roundId, 1],
      value: parseEther("1"),
    });
    await publicClient.waitForTransactionReceipt({ hash: hashG3 });

    // 5. Compare preview against pure model allocate()
    const projectsOnChain = await publicClient.readContract({
      address: roundsAddress,
      abi: ROUNDS_ABI,
      functionName: "projectsOf",
      args: [roundId],
    });

    const modelResult = allocate(pool, [
      { raised: projectsOnChain[0].raised, sqrtSum: projectsOnChain[0].sqrtSum },
      { raised: projectsOnChain[1].raised, sqrtSum: projectsOnChain[1].sqrtSum },
    ]);

    const previewOnChain = await publicClient.readContract({
      address: roundsAddress,
      abi: ROUNDS_ABI,
      functionName: "preview",
      args: [roundId],
    });

    expect(previewOnChain[0][0]).toBe(modelResult.matches[0]);
    expect(previewOnChain[0][1]).toBe(modelResult.matches[1]);
    expect(previewOnChain[1]).toBe(modelResult.returned);

    // 6. Fast forward time past endsAt
    await publicClient.request({
      method: "evm_increaseTime",
      params: [8000],
    });
    await publicClient.request({
      method: "evm_mine",
      params: [],
    });

    // 7. Finalize round
    const hashFin = await clientDonorA.writeContract({
      address: roundsAddress,
      abi: ROUNDS_ABI,
      functionName: "finalize",
      args: [roundId],
    });
    await publicClient.waitForTransactionReceipt({ hash: hashFin });

    // Verify pending for Payee 1
    const pendingP1 = await publicClient.readContract({
      address: roundsAddress,
      abi: ROUNDS_ABI,
      functionName: "pending",
      args: [payee1.address],
    });
    expect(pendingP1).toBe(projectsOnChain[0].raised + modelResult.matches[0]);

    // 8. Payee 1 withdraws
    const balBefore = await publicClient.getBalance({ address: payee1.address });
    const hashWith = await clientPayee1.writeContract({
      address: roundsAddress,
      abi: ROUNDS_ABI,
      functionName: "withdraw",
    });
    const receiptWith = await publicClient.waitForTransactionReceipt({ hash: hashWith });
    const balAfter = await publicClient.getBalance({ address: payee1.address });
    const gasUsed = receiptWith.gasUsed * receiptWith.effectiveGasPrice;

    expect(balAfter + gasUsed - balBefore).toBe(pendingP1);
  });
});
