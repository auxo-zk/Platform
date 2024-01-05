import {
  AccountUpdate,
  Cache,
  Field,
  Group,
  Mina,
  PrivateKey,
  Provable,
  PublicKey,
  Reducer,
  Scalar,
  SmartContract,
  fetchAccount,
} from 'o1js';
import { CustomScalar } from '@auxo-dev/auxo-libs';
import fs from 'fs/promises';

import { Config, Key } from './helper/config.js';
import {
  ActionStatus,
  AddressStorage,
  ReduceStorage,
  getZkAppRef,
  EMPTY_ADDRESS_MT,
} from '../contracts/SharedStorage.js';
import { ZkAppEnum, Contract } from '../constants.js';
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
  InfoStorage as ProjectInfoStorage,
  AddressStorage as PayeeStorage,
  EMPTY_LEVEL_2_TREE,
} from '../contracts/ProjectStorage.js';
import { CampaignContract, CreateCampaign } from '../contracts/Campaign.js';
import {
  InfoStorage as CampaignInfoStorage,
  OwnerStorage,
  StatusStorage,
  ConfigStorage,
} from '../contracts/CampaignStorage.js';
import {
  FundingContract,
  CreateReduceProof,
  CreateRollupProof,
} from '../contracts/Funding.js';
import { ValueStorage } from '../contracts/FundingStorage.js';
import {
  ParticipationContract,
  JoinCampaign,
} from '../contracts/Participation.js';
import {
  IndexStorage,
  InfoStorage as ParticipationInfoStorage,
  CounterStorage,
} from '../contracts/ParticipationStorage.js';
import { TreasuryContract, ClaimFund } from '../contracts/Treasury.js';
import { ClaimedStorage } from '../contracts/TreasuryStorage.js';

const waitTime = 10 * 60 * 1000; // 9m

const sendMoney = false;

function wait(): Promise<void> {
  console.log('Wait time...');
  return new Promise((resolve) => setTimeout(resolve, waitTime));
}

function waitConfig(time: number): Promise<void> {
  console.log('Wait time...');
  return new Promise((resolve) => setTimeout(resolve, time));
}

async function main() {
  console.time('runTime');
  const logMemUsage = () => {
    console.log(
      'Current memory usage:',
      Math.floor(process.memoryUsage().rss / 1024 / 1024),
      'MB'
    );
  };

  const compile = async (prg: any, name: string, profiling = false) => {
    if (logMemory) logMemUsage();
    console.log(`Compiling ${name}...`);
    if (profiling) PlatformProfiler.start(`${name}.compile`);
    await prg.compile({ cache });
    if (profiling) PlatformProfiler.stop();
    console.log('Done!');
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
    let retries = 3; // Number of retries

    while (retries > 0) {
      try {
        if (profiling)
          PlatformProfiler.start(`${contractName}.${methodName}.prove`);
        await tx.prove();
        if (profiling) PlatformProfiler.stop();

        await tx.sign([feePayer.privateKey]).send();
        console.log('DONE!');
        break; // Exit the loop if successful
      } catch (error) {
        console.error('Error:', error);
        retries--; // Decrement the number of retries
        if (retries === 0) {
          throw error; // Throw the error if no more retries left
        }
        console.log(`Retrying... (${retries} retries left)`);
      }
    }
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

  let feePayerKey: Key;
  let contracts: {
    [key: string]: {
      key: Key;
      contract: SmartContract;
      actionStates: Field[];
    };
  } = {};

  let configJson: Config = JSON.parse(await fs.readFile('config.json', 'utf8'));

  let acc1: { privateKey: string; publicKey: string } = JSON.parse(
    await fs.readFile(configJson.deployAliases['acc1'].keyPath, 'utf8')
  );
  let acc2: { privateKey: string; publicKey: string } = JSON.parse(
    await fs.readFile(configJson.deployAliases['acc2'].keyPath, 'utf8')
  );
  let acc3: { privateKey: string; publicKey: string } = JSON.parse(
    await fs.readFile(configJson.deployAliases['acc3'].keyPath, 'utf8')
  );

  // testworld
  feePayerKey = {
    privateKey: PrivateKey.fromBase58(
      'EKEosAyM6Y6TnPVwUaWhE7iUS3v6mwVW7uDnWes7FkYVwQoUwyMR'
    ),
    publicKey: PublicKey.fromBase58(
      'B62qmtfTkHLzmvoKYcTLPeqvuVatnB6wtnXsP6jrEi6i2eUEjcxWauH'
    ),
  };

  console.log('pb: ', feePayerKey.publicKey.toBase58());

  const doProofs = false;
  const profiling = false;
  const logMemory = true;
  const cache = Cache.FileSystem('./caches');
  const PlatformProfiler = getProfiler('Benchmark Platform');

  const fee = 0.101 * 1e9; // in nanomina (1 billion = 1.0 mina)

  const MINAURL = 'https://proxy.berkeley.minaexplorer.com/graphql';
  const ARCHIVEURL = 'https://archive.berkeley.minaexplorer.com';

  const network = Mina.Network({
    mina: MINAURL,
    archive: ARCHIVEURL,
  });
  Mina.setActiveInstance(network);

  let feePayerNonce;
  let dk = false;

  do {
    let sender = await fetchAccount({ publicKey: feePayerKey.publicKey });
    feePayerNonce = Number(sender.account?.nonce) - 1;
    if (feePayerNonce) dk = true;
    console.log('fetch nonce');
    await waitConfig(1000); // 1s
  } while (!dk);

  console.log('Nonce: ', feePayerNonce);

  let members: Key[] = [
    {
      privateKey: PrivateKey.fromBase58(acc1.privateKey),
      publicKey: PublicKey.fromBase58(acc1.publicKey),
    },
    {
      privateKey: PrivateKey.fromBase58(acc2.privateKey),
      publicKey: PublicKey.fromBase58(acc2.publicKey),
    },
  ];

  console.log('fetch all account');
  console.time('accounts');
  const promises = members.map(async (member) => {
    const sender = await fetchAccount({ publicKey: member.publicKey });
    return Number(sender.account?.nonce) - 1;
  });
  console.timeEnd('accounts');

  const memberNonces: number[] = await Promise.all(promises);

  let addressMerkleTree = EMPTY_ADDRESS_MT();

  await Promise.all(
    Object.keys(Contract)
      .filter((item) => isNaN(Number(item)))
      .map(async (e) => {
        let config = configJson.deployAliases[e.toLowerCase()];
        // console.log(config);
        let keyBase58: { privateKey: string; publicKey: string } = JSON.parse(
          await fs.readFile(config.keyPath, 'utf8')
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

        addressMerkleTree.setLeaf(
          AddressStorage.calculateIndex(ZkAppEnum[e.toLowerCase()]).toBigInt(),
          AddressStorage.calculateLeaf(key.publicKey)
        );

        contracts[e.toLowerCase()] = {
          key: key,
          contract: contract,
          actionStates: [Reducer.initialActionState],
        };
      })
  );
  // Project storage
  let memberStorage = new MemberStorage();
  let projectInfoStorage = new ProjectInfoStorage();
  let payeeStorage = new PayeeStorage();

  // Campaign storage
  let campaignInfoStorage = new CampaignInfoStorage();
  let ownerStorage = new OwnerStorage();
  let statusStorage = new StatusStorage();
  let configStorage = new ConfigStorage();
  let campaignAddressStorage = new AddressStorage(addressMerkleTree);

  // Funding storage
  let valueStorage = new ValueStorage();
  let fundingAddressStorage = new AddressStorage(addressMerkleTree);

  // Participation storage
  let participationInfoStorage = new ParticipationInfoStorage();
  let counterStorage = new CounterStorage();
  let participationAddressStorage = new AddressStorage(addressMerkleTree);

  // Treasury storage
  let claimedStorage = new ClaimedStorage();
  let treasuryAddressStorage = new AddressStorage(addressMerkleTree);

  if (sendMoney) {
    let tx = await Mina.transaction(
      { sender: feePayerKey.publicKey, fee, nonce: ++feePayerNonce },
      () => {
        AccountUpdate.fundNewAccount(feePayerKey.publicKey, members.length);
        let feePayerAccount = AccountUpdate.createSigned(feePayerKey.publicKey);
        for (let i = 0; i < members.length; i++) {
          feePayerAccount.send({
            to: members[i].publicKey,
            amount: 3 * 10 ** 9,
          }); // 3 Mina
        }
      }
    );
    await tx.sign([feePayerKey.privateKey]).send();
    await waitConfig(2 * 60 * 1000);
  }

  await compile(CreateCampaign, 'CreateCampaign', profiling);
  await compile(CreateReduceProof, 'CreateReduceProof', profiling);
  await compile(CreateRollupProof, 'CreateRollupProof', profiling);
  await compile(JoinCampaign, 'JoinCampaign', profiling);
  await compile(CreateProject, 'CreateProject', profiling);
  await compile(ClaimFund, 'ClaimFund', profiling);

  await compile(CampaignContract, 'CampaignContract', profiling);
  await compile(FundingContract, 'FundingContract', profiling);
  await compile(ParticipationContract, 'ParticipationContract', profiling);
  await compile(ProjectContract, 'ProjectContract', profiling);
  await compile(TreasuryContract, 'TreasuryContract', profiling);

  let tx;

  // Deploy ProjectContract
  await deploy(feePayerKey, 'ProjectContract', [], fee, ++feePayerNonce);

  // Deploy CampaignContract
  await deploy(
    feePayerKey,
    'CampaignContract',
    [['zkApps', campaignAddressStorage.addresses.getRoot()]],
    fee,
    ++feePayerNonce
  );

  // Deploy FundingContract
  await deploy(
    feePayerKey,
    'FundingContract',
    [['zkApps', fundingAddressStorage.addresses.getRoot()]],
    fee,
    ++feePayerNonce
  );

  // Deploy ParticipationContract
  await deploy(
    feePayerKey,
    'ParticipationContract',
    [['zkApps', participationAddressStorage.addresses.getRoot()]],
    fee,
    ++feePayerNonce
  );

  // Deploy TreasuryContract
  await deploy(
    feePayerKey,
    'TreasuryContract',
    [['zkApps', treasuryAddressStorage.addresses.getRoot()]],
    fee,
    ++feePayerNonce
  );

  await wait();
  
  // call từng contract...

  console.log('done all');
  console.timeEnd('runTime');
}

main();
