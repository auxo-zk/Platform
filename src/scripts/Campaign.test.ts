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
import { CampaignContract, CreateCampaign } from '../contracts/Campaign.js';

describe('Campaign', () => {
  const doProofs = true;
  const cache = Cache.FileSystem('./caches');

  let { keys, addresses } = randomAccounts('project', 'p1', 'p2');
  let feePayerKey: PrivateKey;
  let feePayer: PublicKey;
  let committeeContract: CampaignContract;

  beforeAll(async () => {
    let Local = Mina.LocalBlockchain({ proofsEnabled: doProofs });
    Mina.setActiveInstance(Local);
    feePayerKey = Local.testAccounts[0].privateKey;
    feePayer = Local.testAccounts[0].publicKey;
    committeeContract = new CampaignContract(addresses.project);
  });

  // beforeEach(() => {});

  it('compile proof', async () => {
    console.log('CreateCampaign.compile...');
    await CreateCampaign.compile({ cache });
    if (doProofs) {
      console.log('CampaignContract.compile...');
      await CampaignContract.compile();
    } else {
      console.log('CampaignContract.analyzeMethods...');
      CampaignContract.analyzeMethods();
    }
  });
});
