import {
  Field,
  Reducer,
  Mina,
  PrivateKey,
  PublicKey,
  AccountUpdate,
  Poseidon,
  MerkleMap,
  MerkleTree,
  MerkleWitness,
  Proof,
  Void,
  Cache,
} from 'o1js';

import { getProfiler } from './helper/profiler.js';
import randomAccounts from './helper/randomAccounts.js';
import { TreasuryContract, ClaimFund } from '../contracts/Treasury.js';

describe('Treasury', () => {
  const doProofs = true;
  const cache = Cache.FileSystem('./caches');

  let { keys, addresses } = randomAccounts('treasury', 'p1', 'p2');
  let feePayerKey: PrivateKey;
  let feePayer: PublicKey;
  let committeeContract: TreasuryContract;

  beforeAll(async () => {
    let Local = Mina.LocalBlockchain({ proofsEnabled: doProofs });
    Mina.setActiveInstance(Local);
    feePayerKey = Local.testAccounts[0].privateKey;
    feePayer = Local.testAccounts[0].publicKey;
    committeeContract = new TreasuryContract(addresses.treasury);
  });

  // beforeEach(() => {});

  it('compile proof', async () => {
    console.log('ClaimFund.compile...');
    await ClaimFund.compile();
    if (doProofs) {
      console.log('TreasuryContract.compile...');
      await TreasuryContract.compile();
    } else {
      console.log('TreasuryContract.analyzeMethods...');
      TreasuryContract.analyzeMethods();
    }
  });
});
