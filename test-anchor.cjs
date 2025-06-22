const anchor = require('@coral-xyz/anchor');
const idl = require('./front/src/solana_d_app.json');

const PROGRAM_ID = new anchor.web3.PublicKey('Ho1P3APYbSz3DUZyjNiezxuVkGinLB9vkqAfLBfVM8Cm');
const connection = new anchor.web3.Connection('http://127.0.0.1:53734');
const provider = new anchor.AnchorProvider(connection, anchor.Wallet.local(), anchor.AnchorProvider.defaultOptions());

const program = new anchor.Program(idl, provider);

console.log('Program object:', program);
console.log('Program accounts:', program.account); 