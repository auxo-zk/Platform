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
  SmartContract,
  fetchAccount,
} from 'o1js';

import fs, { futimes } from 'fs';

import { Key, Config } from './helper/config.js';
import { Contract } from '../constants.js';
import { getProfiler } from './helper/profiler.js';
import randomAccounts from './helper/randomAccounts.js';
import { FieldDynamicArray, IPFSHash } from '@auxo-dev/auxo-libs';
import {
  ProjectContract,
  CreateProject,
  CreateProjectInput,
  ProjectProof,
  ProjectAction,
} from '../contracts/Project.js';
import {
  MemberArray,
  MemberStorage,
  InfoStorage,
  AddressStorage,
  EMPTY_LEVEL_2_TREE,
} from '../contracts/ProjectStorage.js';
import { CampaignContract } from '../contracts/Campaign.js';
import { FundingContract } from '../contracts/Funding.js';
import { ParticipationContract } from '../contracts/Participation.js';
import { TreasuryContract } from '../contracts/Treasury.js';

describe('Project', () => {
  const doProofs = false;
  const profiling = false;
  const logMemory = true;
  const cache = Cache.FileSystem('./caches');
  const ProjectProfiler = getProfiler('Benchmark Project');
  let Local = Mina.LocalBlockchain({ proofsEnabled: doProofs });
  Mina.setActiveInstance(Local);

  let feePayerKey: Key;
  let contracts: {
    [key: string]: {
      key: Key;
      contract: SmartContract;
      actionStates: Field[];
    };
  } = {};

  let feePayer: PublicKey;
  let projectContract: ProjectContract;

  let accounts: Key[] = Local.testAccounts.slice(1, 5);

  feePayerKey = accounts[0];
  feePayer = accounts[0].publicKey;

  // Project contract storage
  let memberStorage = new MemberStorage();
  let infoStorage = new InfoStorage();
  let addressStorage = new AddressStorage();

  // input
  let arrayPublicKey = [
    accounts[1].publicKey,
    accounts[2].publicKey,
    accounts[3].publicKey,
  ];
  let memberArray = new MemberArray(arrayPublicKey);
  let createProjectInput = new CreateProjectInput({
    members: memberArray,
    ipfsHash: IPFSHash.fromString('testing'),
    payeeAccount: accounts[1].publicKey,
  });

  // action
  let action = new ProjectAction({
    projectId: Field(-1),
    members: createProjectInput.members,
    ipfsHash: createProjectInput.ipfsHash,
    payeeAccount: createProjectInput.payeeAccount,
  });

  const logMemUsage = () => {
    console.log(
      'Current memory usage:',
      Math.floor(process.memoryUsage().rss / 1024 / 1024),
      'MB'
    );
  };

  const deploy = async (
    feePayer: Key,
    name: string,
    initArgs: [string, Field][],
    fee?: number,
    nonce?: number
  ) => {
    console.log(`Deploying ${name}...`);
    let ct = name.toLowerCase().replace('contract', '');
    let { contract, key } = contracts[ct];
    let sender;
    if (nonce) {
      sender = { sender: feePayer.publicKey, fee: fee, nonce: nonce };
    } else {
      sender = { sender: feePayer.publicKey, fee: fee };
    }
    let tx = await Mina.transaction(sender, () => {
      AccountUpdate.fundNewAccount(feePayer.publicKey, 1);
      contract.deploy();
      for (let i = 0; i < initArgs.length; i++) {
        (contract as any)[initArgs[i][0]].set(initArgs[i][1]);
      }
    });
    await tx.sign([feePayer.privateKey, key.privateKey]).send();
    console.log(`${name} deployed!`);
    Object.assign(contracts[ct], {
      contract: contract,
    });
  };

  const proveAndSend = async (
    tx: Mina.Transaction,
    feePayer: Key,
    contractName: string,
    methodName: string,
    profiling = true
  ) => {
    if (logMemory) logMemUsage();
    console.log(
      `Generate proof and submit tx for ${contractName}.${methodName}()...`
    );
    if (profiling) ProjectProfiler.start(`${contractName}.${methodName}.prove`);
    await tx.prove();
    if (profiling) ProjectProfiler.stop();
    console.log('DONE!');
    await tx.sign([feePayer.privateKey]).send();
  };

  const fetchAllContract = async (contracts: {
    [key: string]: {
      key: Key;
      contract: SmartContract;
      actionStates: Field[];
    };
  }) => {
    const maxAttempts = 10; // Maximum number of attempts
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const entries = Object.entries(contracts);
        for (const [key, { contract }] of entries) {
          const [fetchedActions, fetchedAccount] = await Promise.all([
            Mina.fetchActions(contract.address),
            fetchAccount({ publicKey: contract.address }),
          ]);

          if (Array.isArray(fetchedActions)) {
            contracts[key].actionStates = [
              Reducer.initialActionState,
              ...fetchedActions.map((e) => Field(e.hash)),
            ];
          }
        }

        console.log('Fetch all info success');

        // If the code succeeds, break out of the loop
        break;
      } catch (error) {
        console.log('Error: ', error);
        attempts++;

        // Wait for some time before retrying (e.g., 1 second)
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    if (attempts === maxAttempts) {
      console.log('Maximum number of attempts reached. Code failed.');
    }
  };

  beforeAll(async () => {
    let configJson: Config = JSON.parse(fs.readFileSync('config.json', 'utf8'));

    // let feePayerKeysBase58: { privateKey: string; publicKey: string } =
    //   JSON.parse(await fs.readFileSync(dkgConfig.feepayerKeyPath, 'utf8'));
    feePayerKey = {
      privateKey: Local.testAccounts[0].privateKey,
      publicKey: Local.testAccounts[0].publicKey,
    };

    await Promise.all(
      Object.keys(Contract)
        .filter((item) => isNaN(Number(item)))
        .map(async (e) => {
          let config = configJson.deployAliases[e.toLowerCase()];
          // console.log(config);
          let keyBase58: { privateKey: string; publicKey: string } = JSON.parse(
            await fs.readFileSync(config.keyPath, 'utf8')
          );
          let key = {
            privateKey: PrivateKey.fromBase58(keyBase58.privateKey),
            publicKey: PublicKey.fromBase58(keyBase58.publicKey),
          };
          let contract = (() => {
            switch (e.toLowerCase()) {
              case Contract.PROJECT:
                return new ProjectContract(key.publicKey);
              case Contract.CAMPAIGN:
                return new CampaignContract(key.publicKey);
              case Contract.FUNDING:
                return new FundingContract(key.publicKey);
              case Contract.PARTICIPATION:
                return new ParticipationContract(key.publicKey);
              case Contract.TREASURY:
                return new TreasuryContract(key.publicKey);
              default:
                return new SmartContract(key.publicKey);
            }
          })();
          contracts[e.toLowerCase()] = {
            key: key,
            contract: contract,
            actionStates: [Reducer.initialActionState],
          };
        })
    );
  });

  // beforeEach(() => {});

  it('compile proof', async () => {
    console.log('CreateProject.compile...');
    await CreateProject.compile();
    if (doProofs) {
      console.log('ProjectContract.compile...');
      await ProjectContract.compile();
    } else {
      console.log('ProjectContract.analyzeMethods...');
      ProjectContract.analyzeMethods();
    }
  });

  it('deploy contracts', async () => {
    await deploy(feePayerKey, 'ProjectContract', []);
  });

  it('dispatch action', async () => {
    let tx = await Mina.transaction(feePayerKey.publicKey, () => {
      projectContract.createProject(createProjectInput);
    });
    await proveAndSend(tx, feePayerKey, 'ProjectContract', 'createProject');
  });

  it('reduce action', async () => {
    let reduceProof: ProjectProof = await CreateProject.firstStep(
      projectContract.nextProjectId.get(),
      projectContract.memberTreeRoot.get(),
      projectContract.projectInfoTreeRoot.get(),
      projectContract.payeeTreeRoot.get(),
      projectContract.lastRolledUpActionState.get()
    );

    await CreateProject.nextStep(
      reduceProof,
      action,
      memberStorage.getLevel1Witness(
        memberStorage.calculateLevel1Index(Field(0))
      ),
      infoStorage.getLevel1Witness(infoStorage.calculateLevel1Index(Field(0))),
      addressStorage.getLevel1Witness(
        addressStorage.calculateLevel1Index(Field(0))
      )
    );

    let tx = await Mina.transaction(feePayerKey.publicKey, () => {
      projectContract.createProject(createProjectInput);
    });
    await proveAndSend(tx, feePayerKey, 'ProjectContract', 'createProject');

    let tree1 = EMPTY_LEVEL_2_TREE();
    for (let i = 0; i < Number(memberArray.length); i++) {
      tree1.setLeaf(BigInt(i), MemberArray.hash(memberArray.get(Field(i))));
    }

    // update storage:
    memberStorage.updateInternal(Field(0), tree1);
    infoStorage.updateLeaf(
      Field(0),
      infoStorage.calculateLeaf(createProjectInput.ipfsHash)
    );
    addressStorage.updateLeaf(
      Field(0),
      addressStorage.calculateLeaf(createProjectInput.payeeAccount)
    );
  });
});
