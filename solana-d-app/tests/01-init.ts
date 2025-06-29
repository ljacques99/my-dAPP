import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SolanaDApp } from "../target/types/solana_d_app";
import { assert } from "chai";
import idl from "../target/idl/solana_d_app.json";
import bs58 from "bs58";

describe("solana-d-app init", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.solanaDApp as Program<SolanaDApp>;
  const programId = new anchor.web3.PublicKey("Ho1P3APYbSz3DUZyjNiezxuVkGinLB9vkqAfLBfVM8Cm");

  it("Initializes the 'all' community if it doesn't exist", async () => {
    const authority = (program.provider as anchor.AnchorProvider).wallet;
    // Find the PDA for the "all" community
    const [communityPda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("community"), Buffer.from("all")],
      programId
    );
    // Try to fetch the community account first
    let communityAccount;
    try {
      communityAccount = await program.account.communityAccount.fetch(communityPda);
      console.log("Community already exists:", communityAccount);
      console.log("'all' community PDA address:", communityPda.toBase58());
    } catch (err) {
      console.log("Community doesn't exist, initializing...");
      // Initialize the "all" community
      const tx = await program.methods
        .initialize()
        .accounts({
          communityAccount: communityPda,
          authority: authority.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      console.log("Initialize 'all' community transaction signature:", tx);
      // Fetch the newly created community account
      communityAccount = await program.account.communityAccount.fetch(communityPda);
    }
    // Verify the community account contents
    console.log("Fetched community account:", communityAccount);
    assert.strictEqual(communityAccount.name, "all");
    assert.strictEqual(communityAccount.authority.toBase58(), authority.publicKey.toBase58());
    assert.isArray(communityAccount.surveys);
    assert.lengthOf(communityAccount.surveys, 0);
  });

  it("Lists all PDAs of the program using getProgramAccounts", async () => {
    const connection = program.provider.connection;
    const accountTypes = [
      { name: "CommunityAccount", discriminator: Buffer.from([111, 62, 119, 115, 144, 161, 149, 151]) },
      { name: "ProgramConfig", discriminator: Buffer.from([196, 210, 90, 231, 144, 149, 140, 63]) },
      { name: "SurveyAccount", discriminator: Buffer.from([192, 125, 54, 163, 114, 53, 139, 224]) },
      { name: "UserAccount", discriminator: Buffer.from([211, 33, 136, 16, 186, 110, 242, 127]) },
      { name: "VoteRecord", discriminator: Buffer.from([112, 9, 123, 165, 234, 9, 157, 167]) },
    ];
    for (const { name, discriminator } of accountTypes) {
      const accounts = await connection.getProgramAccounts(programId);
      console.log(`\n=== ${name} PDAs ===`);
      accounts.forEach((acc, i) => {
        console.log(`${i + 1}. ${acc.pubkey.toBase58()} ${name})`);
      });
      if (accounts.length === 0) {
        console.log("(none found)");
      }
    }
  });

  it("Lists all UserAccount PDAs of the program using getProgramAccounts", async () => {
    const connection = program.provider.connection;
    const accountTypes = [
      "UserAccount"
    ];
  
    for (const name of accountTypes) {
      const idlAccount = idl.accounts.find((acc) => acc.name === name);
      if (!idlAccount) {
        console.warn(`No discriminator found for ${name}`);
        continue;
      }
  
      const discriminator = Buffer.from(idlAccount.discriminator);
      const encodedDisc = bs58.encode(discriminator);
  
      const accounts = await connection.getProgramAccounts(program.programId, {
        filters: [{ memcmp: { offset: 0, bytes: encodedDisc } }],
      });
    console.log(`\n=== UserAccount PDAs ===`);
    accounts.forEach((acc, i) => {
      console.log(`${i + 1}. ${acc.pubkey.toBase58()} (UserAccount) ${Buffer.from(acc.account.data)}`);
    });
    if (accounts.length === 0) {
      console.log("(none found)");
    }
  }});
}); 